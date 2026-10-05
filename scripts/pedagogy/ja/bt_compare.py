"""Back-translation judge results -> reports/bt_<tag>.tsv (+ TM records st=bt, never overriding).

    python bt_compare.py <runDir or journal.jsonl>
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from ja_common import CHUNKS, HERE, REPORTS, tm_append

jp = Path(sys.argv[1])
jp = jp / "journal.jsonl" if jp.is_dir() else jp
bad, total, recs, tag = [], 0, {}, "bt"
labels, bts, judges = {}, {}, {}
for line in jp.read_text(encoding="utf-8").splitlines():
    o = json.loads(line) if line.strip() else {}
    if o.get("type") == "started":
        labels[o["key"]] = o.get("label", "")
    if o.get("type") != "result":
        continue
    r = o.get("result")
    if isinstance(r, str):
        try:
            r = json.loads(r)
        except Exception:
            continue
    lab = labels.get(o.get("key"), "")
    if not isinstance(r, dict) or "items" not in r:
        continue
    if lab.startswith("ja:B:"):
        bts[r["chunk"]] = {x["id"]: x["en"] for x in r["items"]}
    elif lab.startswith("ja:J:"):
        judges[r["chunk"]] = r["items"]
for cid, items in sorted(judges.items()):
    ch = json.loads((CHUNKS / f"{cid}.json").read_text(encoding="utf-8"))
    tag = cid.split("-")[0][1:]
    rows = {x["id"]: x for x in ch["rows"]}
    bt = bts.get(cid, {})
    for j in items:
        u = rows.get(j["id"])
        if not u:
            continue
        total += 1
        recs.setdefault(u["d"], []).append({"d": u["d"], "sc": u["sc"], "f": u["f"], "en": u["en"], "st": "bt",
                                            "en_bt": bt.get(j["id"], ""), "bad": j["bad"], "note": j["note"],
                                            "by": f"{jp.parent.name}/{cid}/bt", "lid": j["id"], "v": 1})
        if j["bad"]:
            bad.append(f"{u['d']}	{u['sc']}	{u['f']}	{j['note']}	{u['en']}	{u['ja']}	{bt.get(j['id'], '')}")
for d, rs in recs.items():
    tm_append(d, rs)
REPORTS.mkdir(exist_ok=True)
(REPORTS / f"bt_{tag}.tsv").write_text("\n".join(bad) + "\n", encoding="utf-8")
dst = HERE / "journals" / f"{jp.parent.name}.jsonl"
if not dst.exists():
    shutil.copyfile(jp, dst)
print(f"bt {tag}: {total} judged, {len(bad)} drift ({100 * len(bad) / max(1, total):.1f}%) -> reports/bt_{tag}.tsv")
