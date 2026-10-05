"""Checks on derived Japanese before it ships.

    check(unit, rec, der) -> (hard: [str], soft: [str])
hard = never shipped (bad markup, stripped furigana != ja, kanji/digit outside ruby, non-kana reading,
       Thai/Cyrillic/Hangul leak, empty/untranslated, non-ASCII romaji)
soft = reported only (register mismatch, speaker register mix, length ratio, non-jōyō kanji)

    python validate_ja.py        # report over every resolved TM unit -> reports/validate.tsv, exit 1 on hard fails
"""
from __future__ import annotations

import collections
import re
import sys

from ja_common import HERE, JA_ANY, KANJI_RE, REPORTS, TM_DIR, tm_resolve
from reading_ja import derive, normalize_ja

RUBY = re.compile(r"\{([^{}|]+)\|([^{}|]*)\}")
LEAK = re.compile("[฀-๿Ѐ-ӿ가-힯ᄀ-ᇿ]")
HIRA = re.compile("^[ぁ-ゖー]+$")
JOYO = set((HERE / "ref" / "joyo_jinmeiyo.txt").read_text(encoding="utf-8").split()) if (HERE / "ref" / "joyo_jinmeiyo.txt").exists() else set()
JOYO = {c for w in JOYO for c in w}
POLITE_END = re.compile(r"(です|ます|でした|ました|ません|ましょう|ください|ませんか|でしょう|ございます|ませ)[。！？!?」]*$")
POLITE_ANY = re.compile(r"(です|ます|でした|ました|ません|ましょう|ください|ございます)")


def strip_furi(furi: str) -> str:
    return RUBY.sub(lambda m: m.group(1), furi)


def check(unit: dict, rec: dict, der: dict):
    hard, soft = [], []
    ja, furi, rom = der["ja"], der["furi"], der["rom"]
    if not ja.strip():
        hard.append("EMPTY")
        return hard, soft
    if not JA_ANY.search(ja) and not (unit.get("f") == "gloss" and re.fullmatch(r"[A-Z0-9][A-Za-z0-9. -]{0,8}", ja)):
        hard.append("NO_JAPANESE")
    if ja.strip() == (unit.get("en") or "").strip():
        hard.append("UNTRANSLATED")
    if LEAK.search(ja):
        hard.append("SCRIPT_LEAK")
    if furi.count("{") != furi.count("}") or re.search(r"\{[^{}]*\{|\}[^{}]*\}", RUBY.sub("", furi)):
        hard.append("MARKUP")
    rest = RUBY.sub("", furi)
    if "{" in rest or "}" in rest or "|" in rest:
        hard.append("MARKUP")
    if strip_furi(furi) != ja:
        hard.append("STRIP_NEQ_JA")
    if KANJI_RE.search(rest) or re.search(r"[0-9]", rest):
        hard.append("KANJI_OUTSIDE_RUBY")
    for b, r in RUBY.findall(furi):
        if not r or not HIRA.match(r):
            hard.append(f"BAD_READING:{b}={r}")
    if not rom.strip() or re.search(r"[^\x20-\x7e’]", rom):
        hard.append("ROMAJI")
    for f in der.get("flags", []):
        if f.startswith(("ALIGN_FAIL", "NOREAD", "OV_MISS")):
            hard.append("UNRESOLVED:" + f)
    # soft
    reg = rec.get("reg", "p")
    if unit.get("f") in ("s", "turn", "ee", "xs", "au", "kn", "para"):
        if reg == "c" and POLITE_ANY.search(ja) and "「" not in ja:
            soft.append("REG_C_BUT_POLITE")
        if reg in ("p", "k") and not POLITE_ANY.search(ja) and unit.get("f") in ("ee", "xs", "para") and len(ja) > 8:
            soft.append("REG_P_NO_POLITE")
    en = unit.get("en") or ""
    if len(en) > 20 and unit.get("f") != "gloss":
        ratio = len(ja) / len(en)
        if ratio < 0.15 or ratio > 1.2:
            soft.append(f"LEN_RATIO:{ratio:.2f}")
    if JOYO:
        nj = sorted({c for c in ja if KANJI_RE.match(c) and c not in JOYO and c not in "々〆ヶ"})
        if nj:
            soft.append("NON_JOYO:" + "".join(nj))
    return hard, soft


def speaker_mix(rows) -> list[str]:
    """rows: [(unit, rec)] of one conversation -> soft warnings when a speaker mixes plain/polite."""
    regs = collections.defaultdict(set)
    for u, r in rows:
        sp = (u.get("ctx") or {}).get("speaker")
        if u.get("f") == "turn" and sp:
            regs[sp].add("p" if r.get("reg") in ("p", "k") else "c")
    return [f"SPEAKER_MIX:{sp}" for sp, s in regs.items() if len(s) > 1]


def main():
    hard_n = soft_n = total = 0
    lines = []
    for p in sorted(TM_DIR.glob("*.jsonl")):
        if p.stem == "gold":
            continue
        for (sc, en), r in tm_resolve(p.stem).items():
            der = derive(r["ja"], r.get("yo", ""), r.get("ov"), sentence=r.get("f") != "gloss")
            h, s = check(r, r, der)
            total += 1
            hard_n += bool(h)
            soft_n += bool(s)
            if h or s:
                lines.append(f"{p.stem}\t{sc}\t{r.get('f')}\t{'HARD' if h else 'soft'}\t{','.join(h + s)}\t{der['furi']}\t{en[:80]}")
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "validate.tsv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"validate: {total} units, {hard_n} hard, {soft_n} soft -> reports/validate.tsv")
    sys.exit(1 if hard_n else 0)


if __name__ == "__main__":
    main()
