"""Deterministic reading stage: (ja, yo, ov) -> furigana markup + romaji + flags.

The author's full hiragana reading `yo` is the primary source. It is aligned onto the
kanji/numeral blocks of `ja`; fugashi+unidic-lite (U), SudachiPy mode C (Sc) and
numerals.py (N) are independent witnesses. Anything they cannot confirm is flagged
for the LLM verify stage. Results are cached in derived.jsonl by sha1(ja, yo, ov).

    python reading_ja.py            # process every resolved TM record not yet derived
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import fugashi
import jaconv
from sudachipy import dictionary, tokenizer as stok

from ja_common import HERE, KANJI_RE, TM_DIR, kata2hira, tm_resolve
import numerals
import romaji

DERIVED = HERE / "derived.jsonl"
_tag = fugashi.Tagger()
_sud = dictionary.Dictionary().tokenizer()
_MODE_C = stok.Tokenizer.SplitMode.C
_AL = [l.strip() for l in (HERE / "ambig.tsv").read_text(encoding="utf-8").splitlines()
       if l.strip() and not l.startswith("#")]
AMBIG = {l.lstrip("!") for l in _AL}
AMBIG_HARD = {l[1:] for l in _AL if l.startswith("!")}     # always sent to verify
# accepted reading variants: author vs witness differing only inside one set is not a disagreement
VARIANTS = [{"わたし", "わたくし"}, {"にほん", "にっぽん"}, {"ふじさん", "ふじやま"}]


def same_reading(a, w) -> bool:
    return a == w or any(a in v and w in v for v in VARIANTS)


def rule_witness(ja: str, b: dict):
    """Context rules the analyzers get wrong: 何+か/を/が/も -> なに, 何+です/の/で/と/だ/counter -> なん."""
    if b["x"] == "何":
        nx = ja[b["b"]:b["b"] + 1]
        if nx in "かをがもにへ" and nx:
            return "なに"
        if nx and (nx in "でのとだ" or KANJI_RE.match(nx)):
            return "なん"
    return None
FW_LATIN = {chr(c): chr(c - 0xFEE0) for c in list(range(0xFF21, 0xFF3B)) + list(range(0xFF41, 0xFF5B))}


_JM = None


def jmdict() -> dict:
    """JmdictFurigana: written form -> set of hiragana readings (QA only, never shipped)."""
    global _JM
    if _JM is None:
        _JM = {}
        for e in json.loads((HERE / "ref" / "JmdictFurigana.json").read_text(encoding="utf-8-sig")):
            _JM.setdefault(e["text"], set()).add(kata2hira(e["reading"]))
    return _JM


def normalize_ja(ja: str) -> str:
    ja = jaconv.z2h(ja, kana=False, digit=True, ascii=False)
    ja = "".join(FW_LATIN.get(c, c) for c in ja)
    ja = jaconv.h2z(ja, kana=True, digit=False, ascii=False)
    return ja.replace("{", "｛").replace("}", "｝").replace("|", "｜")


def normalize_yo(yo: str) -> str:
    return "".join(c for c in kata2hira(yo or "") if "ぁ" <= c <= "ゖ" or c == "ー")


def lit_kana(c: str) -> str:
    return kata2hira(c)


# ---------------------------------------------------------------- tokens
def fugashi_tokens(ja: str) -> list[dict]:
    out, pos = [], 0
    for w in _tag(ja):
        s = w.surface
        i = ja.find(s, pos)
        if i < 0:
            continue
        f = w.feature
        kana = getattr(f, "kana", None) or getattr(f, "pron", None) or ""
        if not kana and all(lit_kana(c) != c or c == "ー" or "ぁ" <= c <= "ゖ" for c in s):
            kana = s
        out.append({"s": s, "a": i, "b": i + len(s), "pos1": f.pos1, "pos2": f.pos2, "pos3": f.pos3, "lemma": getattr(f, "lemma", None) or "",
                    "r": kata2hira(kana or ""), "unk": kana in ("", None)})
        pos = i + len(s)
    return out


def sudachi_tokens(ja: str) -> list[dict]:
    return [{"s": m.surface(), "a": m.begin(), "b": m.end(), "r": kata2hira(m.reading_form())}
            for m in _sud.tokenize(ja, _MODE_C)]


def tok_pieces(t: dict, ja: str):
    """Align one token's reading to its surface -> [(a, b, reading)] for its kanji runs, or None."""
    s, r = t["s"], t["r"]
    if not r:
        return None
    pat, runs, i = "", [], 0
    while i < len(s):
        if KANJI_RE.match(s[i]):
            j = i
            while j < len(s) and KANJI_RE.match(s[j]):
                j += 1
            runs.append((t["a"] + i, t["a"] + j))
            pat += "(.+?)"
            i = j
            continue
        h = lit_kana(s[i])
        if "ぁ" <= h <= "ゖ" or h == "ー":
            pat += re.escape(h)
        elif s[i].isdigit() or s[i].isalpha():
            return None
        i += 1
    if not runs:
        return []
    m1 = re.fullmatch(pat, r)
    m2 = re.fullmatch(pat.replace("(.+?)", "(.+)"), r)
    if not m1 or not m2 or m1.groups() != m2.groups():
        return None
    return [(a, b, g) for (a, b), g in zip(runs, m1.groups())]


def witness(block_a: int, block_b: int, ja: str, toks: list[dict], num: bool = False):
    """Reading of ja[block_a:block_b] from a tokenisation, or None if it can't be isolated."""
    if num:                                   # numeral spans: only a token-exact match counts
        parts = [t for t in toks if t["a"] < block_b and t["b"] > block_a]
        if parts and parts[0]["a"] == block_a and parts[-1]["b"] == block_b and all(p["r"] for p in parts):
            return "".join(p["r"] for p in parts)
        return None
    out, pos = [], block_a
    for t in toks:
        if t["b"] <= block_a or t["a"] >= block_b:
            continue
        pcs = tok_pieces(t, ja)
        if pcs is None:
            return None
        for a, b, g in pcs:
            if b <= block_a or a >= block_b:
                continue
            if a < block_a or b > block_b or a != pos:
                return None
            out.append(g)
            pos = b
    return "".join(out) if pos == block_b else None


# ---------------------------------------------------------------- blocks
def blocks_of(ja: str) -> list[dict]:
    """Split ja into ruby blocks (kanji run / numeral span) and literals."""
    out, i = [], 0
    while i < len(ja):
        c = ja[i]
        if c.isdigit():
            m = numerals.SPAN_RE.match(ja, i)
            j = m.end() if m else i + 1
            out.append({"t": "num", "a": i, "b": j, "x": ja[i:j]})
            i = j
        elif KANJI_RE.match(c):
            j = i
            while j < len(ja) and KANJI_RE.match(ja[j]):
                j += 1
            out.append({"t": "kan", "a": i, "b": j, "x": ja[i:j]})
            i = j
        else:
            out.append({"t": "lit", "a": i, "b": i + 1, "x": c})
            i += 1
    return out


def align(ja: str, yo: str, bl: list[dict], hint: dict):
    """Map yo onto the ruby blocks by DP. Kana literals must match exactly; each ruby block takes
    1..n kana. Score = number of blocks whose reading equals a witness (hint[k] is a set).
    -> (readings dict block_index->reading, flag or None). Unique best -> no flag."""
    segs = []
    for k, b in enumerate(bl):
        if b["t"] == "lit":
            h = lit_kana(b["x"])
            if "ぁ" <= h <= "ゖ" or h == "ー":
                if segs and segs[-1][0] == "lit":
                    segs[-1] = ("lit", segs[-1][1] + h)
                else:
                    segs.append(("lit", h))
            elif b["x"].isascii() and b["x"].isalpha():
                # Latin letters (Tシャツ, Wi-Fi): the author may spell them out in yo or drop them
                if segs and segs[-1][0] == "lat":
                    segs[-1] = ("lat", segs[-1][1] + 1)
                else:
                    segs.append(("lat", 1))
        else:
            segs.append(("blk", k))
    n, L = len(segs), len(yo)
    from functools import lru_cache

    @lru_cache(maxsize=None)
    def best(i, pos):
        """(score, ways, choice) for segs[i:] starting at yo[pos]."""
        if i == n:
            return (0, 1, None) if pos == L else (-1, 0, None)
        t, v = segs[i]
        if t == "lit":
            if yo.startswith(v, pos):
                sc, w, _ = best(i + 1, pos + len(v))
                return (sc, w, len(v)) if w else (-1, 0, None)
            return (-1, 0, None)
        if t == "lat":
            top, ways, ch = -1, 0, None
            for ln in range(0, min(L - pos, 4 * v + 4) + 1):
                sc, w, _ = best(i + 1, pos + ln)
                if not w:
                    continue
                if sc > top:
                    top, ways, ch = sc, w, ln
                elif sc == top:
                    ways += w
            return (top, ways, ch)
        top, ways, ch = -1, 0, None
        for ln in range(1, min(L - pos, 4 * len(bl[v]["x"]) + 4) + 1):
            sc, w, _ = best(i + 1, pos + ln)
            if not w:
                continue
            sc += 1 if yo[pos:pos + ln] in hint.get(v, ()) else 0
            if sc > top:
                top, ways, ch = sc, w, ln
            elif sc == top:
                ways += w
        return (top, ways, ch)

    sc, ways, _ = best(0, 0)
    if not ways:
        return {}, "ALIGN_FAIL"
    out, i, pos = {}, 0, 0
    while i < n:
        ln = best(i, pos)[2]
        if segs[i][0] == "blk":
            out[segs[i][1]] = yo[pos:pos + ln]
        pos += ln
        i += 1
    return out, (None if ways == 1 else "ALIGN_AMBIG")


def derive(ja: str, yo: str, ov: list, sentence: bool, reg: str = "p") -> dict:
    ja = normalize_ja(ja)
    yo = normalize_yo(yo)
    bl = blocks_of(ja)
    ft = fugashi_tokens(ja)
    stoks = sudachi_tokens(ja)
    flags = []
    U, Sc, N = {}, {}, {}
    for k, b in enumerate(bl):
        if b["t"] == "lit":
            continue
        U[k] = witness(b["a"], b["b"], ja, ft, b["t"] == "num")
        Sc[k] = witness(b["a"], b["b"], ja, stoks, b["t"] == "num")
        if b["t"] == "num":
            N[k] = numerals.readings(b["x"])
    hint = {k: {x for x in (U.get(k), Sc.get(k)) if x} | set(N.get(k) or ()) for k in U}
    A, af = align(ja, yo, bl, hint)
    if af:
        flags.append(af)
    final = {}
    for k, b in enumerate(bl):
        if b["t"] == "lit":
            continue
        a = A.get(k)
        u, sc = U.get(k), Sc.get(k)
        if a is None:
            a = sc or u or ""
            flags.append(f"NOREAD:{b['x']}")
        if b["t"] == "num":
            n = N.get(k)
            if n is None:
                flags.append(f"NUM:{b['x']}")
            elif a not in n:
                flags.append(f"NUM:{b['x']}={a}|{'/'.join(sorted(n))}")
        else:
            rw = rule_witness(ja, b)
            if rw is not None:
                if a != rw:
                    flags.append(f"DISAGREE:{b['x']}={a}|R={rw}")
            elif not same_reading(a, sc) and not same_reading(a, u):
                flags.append(f"DISAGREE:{b['x']}={a}|U={u}|Sc={sc}")
            tok_words = {t["s"] for t in ft if t["a"] < b["b"] and t["b"] > b["a"]}
            if b["x"] in AMBIG_HARD or ((b["x"] in AMBIG or tok_words & AMBIG) and not same_reading(a, sc) and rw is None):
                flags.append(f"AMBIG:{b['x']}={a}|Sc={sc}")
            for t in ft:
                if t["a"] < b["b"] and t["b"] > b["a"] and (t["pos2"] == "固有名詞" or t["unk"])                         and not (same_reading(a, u) and same_reading(a, sc)):
                    flags.append(f"PROPN:{b['x']}={a}")
                    break
        final[k] = a
    # reading overrides from verify / human: [start, end, hiragana]
    for s, e, r in (ov or []):
        r = normalize_yo(r)
        hit = [k for k, b in enumerate(bl) if b["t"] != "lit" and b["a"] == s and b["b"] == e]
        if not hit or not r:
            flags.append(f"OV_MISS:{s}-{e}={r}")
            continue
        b = bl[hit[0]]
        final[hit[0]] = r
        flags = [f for f in flags if not (f.partition(":")[2].startswith(b["x"] + "=") or f.partition(":")[2] == b["x"])
                 or f.startswith("OV_MISS")]
        if b["t"] == "num" and N.get(hit[0]) and r not in N[hit[0]]:
            pass                                  # verifier outranks numerals.py
    covered = {(s, e) for s, e, _r in (ov or [])}
    if ov:
        if all((b["a"], b["b"]) in covered for b in bl if b["t"] != "lit"):
            # every ruby block has a verified reading: a bad author `yo` no longer matters
            flags = [f for f in flags if not f.startswith(("ALIGN_FAIL", "ALIGN_AMBIG", "NOREAD"))]
    # split kanji runs at token boundaries when the witness pieces add up to the final reading
    groups, starts = [], []
    for k, b in enumerate(bl):
        if b["t"] == "lit":
            groups.append((b["x"], None))
            continue
        r = final.get(k, "")
        pcs = []
        if b["t"] == "kan":
            for t in ft:
                if t["b"] <= b["a"] or t["a"] >= b["b"]:
                    continue
                tp = tok_pieces(t, ja)
                if tp is None:
                    pcs = []
                    break
                pcs += [(x, y, g) for x, y, g in tp if x >= b["a"] and y <= b["b"]]
        if len(pcs) > 1 and pcs[0][0] == b["a"] and pcs[-1][1] == b["b"]                 and all(pcs[j][1] == pcs[j + 1][0] for j in range(len(pcs) - 1)) and "".join(g for *_, g in pcs) == r:
            groups += [(ja[x:y], g) for x, y, g in pcs]
            starts += [(x, g) for x, y, g in pcs]
        else:
            groups.append((b["x"], r))
            starts.append((b["a"], r))
    furi = "".join(x if r is None else ("{" + x + "|" + r + "}" if r else x) for x, r in groups)
    # romaji: per-token hiragana built from the final block readings
    char_r = [""] * len(ja)
    for k, b in enumerate(bl):
        if b["t"] == "lit":
            c = b["x"]
            h = lit_kana(c)
            char_r[b["a"]] = h if ("ぁ" <= h <= "ゖ" or h == "ー") else c
    for x, g in starts:
        char_r[x] = g or ""
    rtoks = [{"surface": t["s"], "pos1": t["pos1"], "pos2": t["pos2"], "pos3": t["pos3"], "lemma": t["lemma"], "yomi": "".join(char_r[t["a"]:t["b"]])}
             for t in ft]
    rom = romaji.assemble(rtoks, sentence=sentence)
    if not sentence:                          # glosses: JmdictFurigana is a human-curated witness per word
        jm = jmdict()
        for m in re.finditer(r"[^、，,・／/（）()「」\s〜～]+", ja):
            word = m.group()
            if word not in jm or not KANJI_RE.search(word):
                continue
            ours = "".join(char_r[m.start():m.end()])
            inb = [b for b in bl if b["t"] != "lit" and b["a"] >= m.start() and b["b"] <= m.end()]
            inside = {b["x"] for b in inb}
            if ours in jm[word] and len(jm[word]) == 1:     # an unambiguous dictionary reading confirms it
                flags = [f for f in flags if f.partition(":")[2].partition("=")[0] not in inside]
            elif inb and all((b["a"], b["b"]) in covered for b in inb):
                pass                                  # verifier outranks JmdictFurigana
            elif ours not in jm[word]:
                flags.append(f"JMDICT:{word}={ours}|{'/'.join(sorted(jm[word]))}")
    return {"ja": ja, "furi": furi, "rom": rom, "flags": sorted(set(flags)),
            "blocks": [[b["a"], b["b"], b["x"], final.get(k), U.get(k), Sc.get(k)]
                       for k, b in enumerate(bl) if b["t"] != "lit"]}


def dkey(ja: str, yo: str, ov) -> str:
    return hashlib.sha1((ja + "\t" + yo + "\t" + json.dumps(ov or [], ensure_ascii=False)).encode("utf-8")).hexdigest()[:16]


def load_derived() -> dict:
    if not DERIVED.exists():
        return {}
    out = {}
    for l in DERIVED.read_text(encoding="utf-8").splitlines():
        if l.strip():
            r = json.loads(l)
            out[r["h"]] = r
    return out


def main():
    have = load_derived()
    new = []
    decks = [p.stem for p in TM_DIR.glob("*.jsonl")]
    for d in decks:
        for (_sc, _en), r in tm_resolve(d).items():
            h = dkey(r["ja"], r.get("yo", ""), r.get("ov"))
            if h in have:
                continue
            res = derive(r["ja"], r.get("yo", ""), r.get("ov"), sentence=r.get("f") != "gloss", reg=r.get("reg", "p"))
            res["h"] = h
            have[h] = res
            new.append(res)
    with DERIVED.open("a", encoding="utf-8", newline="\n") as fh:
        for r in new:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    fl = sum(1 for r in new if r["flags"])
    print(f"derived {len(new)} new ({fl} flagged); total cached {len(have)}")


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--test":
        print(json.dumps(derive(sys.argv[2], sys.argv[3], [], True), ensure_ascii=False, indent=1))
    else:
        main()
