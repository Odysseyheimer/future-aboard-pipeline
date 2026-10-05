"""Build gold/tatoeba300.json: 300 human-transcribed Japanese sentences with furigana.

Tatoeba transcriptions look like  ギター[弾|ひ]けるようになりたい。  or  [場所|ば|しょ]
(one reading per kanji). Only rows with a real username (human-contributed) are used.
Used for QA only - never shipped.
"""
from __future__ import annotations

import bz2
import json
import random
import re
from pathlib import Path

from ja_common import KANJI_RE

HERE = Path(__file__).resolve().parent
BR = re.compile(r"\[([^\[\]|]+)((?:\|[^\[\]|]*)+)\]")


def parse(t: str):
    """-> (plain text, [(start, end, reading)]) for every bracketed group."""
    out, spans, last = [], [], 0
    for m in BR.finditer(t):
        out.append(t[last:m.start()])
        base = m.group(1)
        reading = "".join(m.group(2).split("|"))
        start = sum(len(x) for x in out)
        out.append(base)
        spans.append((start, start + len(base), reading))
        last = m.end()
    out.append(t[last:])
    return "".join(out), spans


def main():
    rows = []
    with bz2.open(HERE / "ref" / "jpn_transcriptions.tsv.bz2", "rt", encoding="utf-8") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) < 5 or p[2] != "Hrkt" or p[3] in ("", "\\N"):
                continue
            plain, spans = parse(p[4])
            if not (8 <= len(plain) <= 40) or not spans:
                continue
            # every kanji must be covered by a bracket, and brackets must hold kanji
            covered = set(i for a, b, _ in spans for i in range(a, b))
            if any(KANJI_RE.match(c) and i not in covered for i, c in enumerate(plain)):
                continue
            if re.search(r"[0-9０-９A-Za-z]", plain):
                continue
            rows.append({"id": "t" + p[0], "ja": plain, "spans": spans})
    random.Random(20260928).shuffle(rows)
    gold = rows[:300]
    (HERE / "gold").mkdir(exist_ok=True)
    json.dump(gold, open(HERE / "gold" / "tatoeba300.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(rows)} eligible human transcriptions -> 300 gold; e.g. {gold[0]}")


if __name__ == "__main__":
    main()
