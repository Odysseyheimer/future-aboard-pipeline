"""Reading accuracy vs Tatoeba human furigana (gold/tatoeba300.json).

Per kanji-run span: error = our final reading != gold. Flagger recall = errors whose
sentence carries at least one flag naming that run (i.e. it would go to verify).
    python eval_gold.py [--stage author|review|best]
"""
from __future__ import annotations

import json
import sys

from ja_common import HERE, tm_read, tm_resolve
from reading_ja import derive, normalize_ja

stage = sys.argv[sys.argv.index("--stage") + 1] if "--stage" in sys.argv else "best"
gold = json.loads((HERE / "gold" / "tatoeba300.json").read_text(encoding="utf-8"))
if stage == "best":
    recs = {sc: r for (sc, _en), r in tm_resolve("gold").items()}
else:
    recs = {}
    for r in tm_read("gold"):
        if r["st"] != stage or not r.get("ja"):
            continue
        cur = recs.get(r["sc"])
        if not cur or r["ts"] >= cur["ts"]:
            recs[r["sc"]] = r
spans = err = flagged_err = flagged_ok = changed = 0
rows = []
for g in gold:
    r = recs.get(g["id"])
    if not r:
        continue
    if normalize_ja(r["ja"]) != normalize_ja(g["ja"]):
        changed += 1
        continue
    d = derive(g["ja"], r.get("yo", ""), r.get("ov"), True)
    gs = g["spans"]
    for a, b, x, have, u, sc in d["blocks"]:
        inner = [sp for sp in gs if sp[0] >= a and sp[1] <= b]
        if not inner or inner[0][0] != a or inner[-1][1] != b or any(inner[j][1] != inner[j + 1][0] for j in range(len(inner) - 1)):
            continue                          # gold does not cover this block exactly
        want = "".join(sp[2] for sp in inner)
        spans += 1
        fl = any(x in f or f in ("ALIGN_FAIL", "ALIGN_AMBIG") for f in d["flags"])
        if have != want:
            err += 1
            flagged_err += fl
            rows.append(f"{g['id']}	{x}	gold={want}	got={have}	{'FLAG' if fl else 'MISS'}	{g['ja']}")
        elif fl:
            flagged_ok += 1
print(f"stage={stage} sentences={len(recs)} text-changed={changed} spans={spans}")
print(f"errors={err} ({100*err/max(1,spans):.2f}%)  flagged errors={flagged_err} "
      f"recall={100*flagged_err/max(1,err):.0f}%  false flags={flagged_ok}")
(HERE / "reports").mkdir(exist_ok=True)
(HERE / "reports" / f"gold_{stage}.tsv").write_text("\n".join(rows) + "\n", encoding="utf-8")
