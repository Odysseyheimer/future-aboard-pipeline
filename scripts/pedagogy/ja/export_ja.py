"""Export translation units as chunks + a Workflow wave script.

    python export_ja.py --phase P0            # pilot (+ Tatoeba gold reading test)
    python export_ja.py --phase P1 [--delta]  # later phases

Writes chunks/<chunkId>.json (id -> unit mapping) and wf/ja_<PHASE>_w<NN>.wf.js.
The wave id and chunks are BAKED INTO the script (Workflow args are not passed here).
Files are UTF-8, no BOM, LF only, and asserted free of control characters.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from ja_common import CHUNKS, HERE, norm, tm_resolve
import units as U

WF = HERE / "wf"

STYLE = """You are a native Japanese translator and editor who writes learning material for Thai adults (English level A2-B1) who are also learning Japanese.
Translate each English line into the Japanese a native speaker would really write or say in that situation.
RULES
- Meaning: faithful to the English (use the Thai line only to pin down the sense and the politeness). Do not add or drop information.
- Register follows the source: plain form when the English is clearly casual (friends, family, contractions, slang); です/ます by default; keigo only when the English is clearly formal/business. Thai ครับ/ค่ะ/คะ = polite (です/ます).
- Conversations: decide one register per speaker from the roles and level, and keep it for the whole dialogue (staff to customer = 丁寧語/接客敬語; customer = です/ます; friends/family = plain).
- Stories: narration in です/ます (graded-reader style); dialogue inside 「」 fits the character.
- Natural Japanese: drop pronouns Japanese would omit, never use あなた unless unavoidable, no word-for-word calques. Idioms and phrasal verbs -> the natural Japanese equivalent, not a literal one.
- Script: kanji only for jōyō/jinmeiyō kanji, otherwise kana. Arabic numerals for amounts, prices, dates and times. Foreign and Thai names in katakana. Latin letters only for real acronyms (ATM, Wi-Fi).
- GLOSS items (field "gloss"): give 1-3 Japanese dictionary-form equivalents of the headword IN THAT SENSE (use the definition and Thai), same part of speech, separated by 、. No explanations, no brackets unless needed to disambiguate.
OUTPUT for every id:
- ja: the Japanese.
- yo: the COMPLETE reading of ja in HIRAGANA, character by character as it is pronounced from the written form: convert katakana to hiragana (keep ー), keep particles as written (は へ を stay は へ を), read every kanji and every Arabic numeral with its counter (3匹 -> さんびき, 1日 -> ついたち, 10時 -> じゅうじ), keep Latin acronyms verbatim, omit punctuation and spaces.
- reg: c = plain/casual, p = です/ます, k = keigo.
"""

REVIEW = """You are a senior native Japanese editor reviewing a translator's work for learners.
For EVERY id: check (1) accuracy against the English and Thai, (2) naturalness, (3) register (and per-speaker consistency in conversations), (4) script rules, and above all (5) that `yo` is the exact correct hiragana reading of `ja`: kanji with several readings (方 何 今日 一日 上手 生 行った 辛い 人気 市場 十分 大人 明日 私), counters and numbers with sound changes, rendaku in compounds, okurigana.
Fix anything wrong. Return the COMPLETE list - every id, with ja, yo and reg (unchanged if already correct).
"""

REVIEW_CHANGES = """You are a senior native Japanese editor reviewing a translator's work for learners.
Check every id: (1) accuracy against the English and Thai (for GLOSS items: right sense and part of speech for THIS
definition), (2) naturalness, (3) register, (4) script rules, and above all (5) that `yo` is the exact correct
hiragana reading of `ja` (kanji with several readings, counters, rendaku, okurigana).
Return ONLY the items you changed, each with its full corrected ja, yo and reg. If everything is correct, return an
empty items list.
"""

GOLD = """You are a native Japanese speaker. For each Japanese sentence below, return ja exactly as given (unchanged) and yo = its complete reading in HIRAGANA (katakana -> hiragana keeping ー, particles as written は へ を, every kanji read correctly in context, no punctuation or spaces). reg: p.
"""


def fmt_ctx(u: dict) -> str:
    c = u.get("ctx") or {}
    th = c.get("th") or ""
    return f" | TH: {th}" if th else ""


def render_chunk(kind: str, rows: list[dict]) -> str:
    """rows = [(local id, unit)] -> prompt text."""
    L = []
    if kind == "sent":
        g = rows[0][1]["ctx"].get("g")
        L.append(f"Everyday sentences - situation: {g}")
        for lid, u in rows:
            note = u["ctx"].get("note") or ""
            L.append(f"[{lid}] EN: {u['en']}{fmt_ctx(u)}" + (f" | usage: {note}" if note else ""))
    elif kind == "word":
        cur = None
        for lid, u in rows:
            c = u["ctx"]
            head = f"WORD: {c.get('w')} ({c.get('p')}) - {c.get('me')} | TH: {c.get('mt')} | level {c.get('g')}"
            if head != cur:
                L.append("")
                L.append(head)
                cur = head
            if u["f"] == "gloss":
                L.append(f"  [{lid}] gloss (dictionary-form Japanese equivalent of this word in this sense)")
            else:
                L.append(f"  [{lid}] {'explanation' if u['f'] == 'kn' else 'example'}: {u['en']}{fmt_ctx(u)}")
    elif kind == "conv":
        cur = None
        for lid, u in rows:
            if u["sc"] != cur:
                cur = u["sc"]
                c = u["ctx"]
                L.append("")
                L.append(f"CONVERSATION {cur} ({c.get('g')}, level {c.get('level')}). Speaker A = {c.get('roleA')}, "
                         f"Speaker B = {c.get('roleB')}. Keep one register per speaker for this whole dialogue.")
            if u["f"] == "title":
                L.append(f"[{lid}] title: {u['en']}")
            elif u["f"] == "turn":
                L.append(f"[{lid}] {u['ctx'].get('speaker')}: {u['en']}{fmt_ctx(u)}")
            else:
                L.append(f"[{lid}] key phrase: {u['en']}{fmt_ctx(u)}")
    elif kind == "story":
        cur = None
        for lid, u in rows:
            if u["sc"] != cur:
                cur = u["sc"]
                c = u["ctx"]
                L.append("")
                L.append(f"SHORT STORY {cur} (level {c.get('lvl')}, {c.get('genre')}). Translate paragraph by paragraph; "
                         f"keep names and style consistent.")
            tag = "title" if u["f"] == "title" else "paragraph"
            L.append(f"[{lid}] {tag}: {u['en']}{fmt_ctx(u)}")
    elif kind == "gold":
        for lid, u in rows:
            L.append(f"[{lid}] {u['ja']}")
    return "\n".join(L).strip()


def build_chunks(phase: str, delta: bool):
    chunks = []
    if phase == "P0":
        sel = U.pilot()
        us = U.units_for(sel)
    elif phase == "P2":
        us = []
        for d in U.WORD_DECKS:
            rows = U.load_deck(d)
            if d == "oxford":                          # A1 -> C1 first
                order = {g: i for i, g in enumerate(["A1", "A2", "B1", "B2", "C1"])}
                rows = sorted(rows, key=lambda x: order.get(x.get("g"), 9))
            for it in rows:
                us += U.word_units(d, it, ("gloss", "ee", "kn"))
        us = U.dedup(us)
    elif phase == "P1":
        us = U.units_for({"sentences": U.load_deck("sentences"), "conversations": U.load_deck("conversations"),
                          "stories": U.load_deck("stories")})
    else:
        raise SystemExit(f"phase {phase} not implemented yet")
    if delta:
        done = set()
        for d in {u["d"] for u in us}:
            for (sc, en) in tm_resolve(d):
                done.add((d, sc, en))
        us = [u for u in us if (u["d"], u["sc"], norm(u["en"])) not in done]

    def add(kind, cid, rows):
        rows = [(f"u{i + 1:03d}", u) for i, u in enumerate(rows)]
        chunks.append({"id": cid, "kind": kind, "rows": rows})

    sents = [u for u in us if u["d"] == "sentences"]
    by_g: dict = {}
    for u in sents:
        by_g.setdefault(u["ctx"]["g"], []).append(u)
    si = 0
    for g, rows in by_g.items():
        n = -(-len(rows) // 60)                      # split big groups evenly, <=60 per chunk
        per = -(-len(rows) // n)
        for k in range(0, len(rows), per):
            si += 1
            add("sent", f"{phase}-sent-{si:02d}", rows[k:k + per])
    words = [u for u in us if u["d"] in U.WORD_DECKS]
    heads: list = []
    for u in words:
        if not heads or heads[-1][0] != u["sc"]:
            heads.append((u["sc"], []))
        heads[-1][1].append(u)
    per_head = 10 if phase == "P0" else 25
    wi = 0
    for i in range(0, len(heads), per_head):
        rows = [u for _, rs in heads[i:i + per_head] for u in rs]
        wi += 1
        add("word", f"{phase}-word-{wi:03d}" if phase != "P0" else f"{phase}-word-{wi:02d}", rows)
    def bundled(deck, kind, per_chunk, tag):
        scs = list(dict.fromkeys(u["sc"] for u in us if u["d"] == deck))
        if phase == "P0":
            for sc in scs:
                add(kind, f"{phase}-{tag}-{sc}", [u for u in us if u["d"] == deck and u["sc"] == sc])
            return
        for i in range(0, len(scs), per_chunk):
            grp = set(scs[i:i + per_chunk])
            add(kind, f"{phase}-{tag}-{i // per_chunk + 1:03d}", [u for u in us if u["d"] == deck and u["sc"] in grp])
    bundled("conversations", "conv", 5, "conv")
    bundled("stories", "story", 3, "story")
    if phase == "P0":
        gold = json.loads((HERE / "gold" / "tatoeba300.json").read_text(encoding="utf-8"))
        for i in range(0, 300, 100):
            rows = [{"d": "gold", "file": "gold", "sc": g["id"], "f": "gold", "en": g["ja"], "ja": g["ja"], "ctx": {}}
                    for g in gold[i:i + 100]]
            add("gold", f"{phase}-gold-{i // 100 + 1}", rows)
    return chunks


BAD = re.compile("[\x00-\x08\x0b-\x1f\x7f  ]")

WAVE_TMPL = r"""export const meta = {
  name: 'ja-__WAVE__',
  description: 'Japanese layer __WAVE__: translate + review __N__ chunks (JA text + hiragana reading)',
  phases: [{ title: 'Translate' }, { title: 'Review' }],
}
var WAVE = __WAVEJSON__
var STYLE = __STYLE__
var REVIEWP = __REVIEW__
var RMODE = __RMODE__
var GOLDP = __GOLD__
var CHUNKS = __CHUNKS__
var SCHEMA = { type: 'object', additionalProperties: false, required: ['chunk', 'stage', 'items'], properties: {
  chunk: { type: 'string' }, stage: { type: 'string', enum: ['author', 'review'] },
  items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'ja', 'yo', 'reg'],
    properties: { id: { type: 'string' }, ja: { type: 'string' }, yo: { type: 'string' }, reg: { type: 'string', enum: ['c', 'p', 'k'] } } } } } }
function head(c, stage) { return 'Set chunk="' + c.id + '" and stage="' + stage + '". Answer ONLY through the structured output, one item per id (' + c.n + ' ids).\n\n' }
phase('Translate')
var res = await pipeline(CHUNKS,
  function (c) {
    var p = (c.kind === 'gold' ? GOLDP : STYLE) + '\n' + head(c, 'author') + c.text
    return agent(p, { label: 'ja:A:' + c.id, phase: 'Translate', schema: SCHEMA, effort: 'medium' })
  },
  function (d, c) {
    if (!d) return null
    var lines = d.items.map(function (x) { return '[' + x.id + '] ja: ' + x.ja + ' | yo: ' + x.yo + ' | reg: ' + x.reg }).join('\n')
    var hd = RMODE === 'changes'
      ? 'Set chunk="' + c.id + '" and stage="review". Answer ONLY through the structured output: only the ids you changed (maybe none).\n\n'
      : head(c, 'review')
    var p = STYLE + '\n' + REVIEWP + '\n' + hd + 'SOURCE:\n' + c.text + '\n\nTRANSLATOR OUTPUT:\n' + lines
    return agent(p, { label: 'ja:R:' + c.id, phase: 'Review', schema: SCHEMA, effort: 'high' })
  })
return { wave: WAVE, ok: res.filter(Boolean).map(function (r) { return r.chunk }) }
"""


def write_wave(phase: str, chunks: list, n: int) -> Path:
    WF.mkdir(exist_ok=True)
    CHUNKS.mkdir(exist_ok=True)
    js_chunks = []
    for c in chunks:
        text = render_chunk(c["kind"], c["rows"])
        js_chunks.append({"id": c["id"], "kind": c["kind"], "n": len(c["rows"]), "text": text})
        rec = {"id": c["id"], "kind": c["kind"],
               "rows": [{"lid": lid, **{k: u[k] for k in ("d", "file", "sc", "f", "en")}} for lid, u in c["rows"]]}
        (CHUNKS / f"{c['id']}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
    wave = f"{phase}-w{n:02d}"
    s = (WAVE_TMPL.replace("__WAVEJSON__", json.dumps(wave))
         .replace("__WAVE__", wave).replace("__N__", str(len(chunks)))
         .replace("__STYLE__", json.dumps(STYLE, ensure_ascii=False))
         .replace("__REVIEW__", json.dumps(REVIEW_CHANGES if phase in ("P2", "P3", "P4") else REVIEW, ensure_ascii=False))
         .replace("__RMODE__", json.dumps("changes" if phase in ("P2", "P3", "P4") else "full"))
         .replace("__GOLD__", json.dumps(GOLD, ensure_ascii=False))
         .replace("__CHUNKS__", json.dumps(js_chunks, ensure_ascii=False, indent=0)))
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    assert not BAD.search(s), "control character in wave script"
    out = WF / f"ja_{phase}_w{n:02d}.wf.js"
    out.write_bytes(s.encode("utf-8"))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", required=True)
    ap.add_argument("--delta", action="store_true")
    ap.add_argument("--wave", type=int, default=1)
    ap.add_argument("--per-wave", type=int, default=45)
    a = ap.parse_args()
    chunks = build_chunks(a.phase, a.delta)
    n_units = sum(len(c["rows"]) for c in chunks)
    print(f"{len(chunks)} chunks, {n_units} units")
    # pack waves by count AND size: the Workflow tool rejects scripts over 512 KB
    waves, cur, size = [], [], 0
    for c in chunks:
        b = len(json.dumps(render_chunk(c["kind"], c["rows"]), ensure_ascii=False).encode("utf-8")) + 200
        if cur and (len(cur) >= a.per_wave or size + b > 400_000):
            waves.append(cur)
            cur, size = [], 0
        cur.append(c)
        size += b
    if cur:
        waves.append(cur)
    for w, part in enumerate(waves):
        out = write_wave(a.phase, part, a.wave + w)
        assert out.stat().st_size < 500_000, f"{out.name} too large for the Workflow tool"
        print(f"  wave {a.wave + w:02d}: {len(part)} chunks, {sum(len(c['rows']) for c in part)} units -> {out.name} "
              f"({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
