"""Workflow journals -> translation memory (append-only, idempotent).

    python harvest_ja.py <runDir or journal.jsonl> [...]
    python harvest_ja.py --scan          # every wf_* run of this project

Only results shaped {chunk, stage, items} whose chunk file exists in chunks/ are taken.
Each record is tagged by="<runId>/<chunk>/<stage>" so harvesting twice adds nothing.
The raw journal is copied to journals/<runId>.jsonl (the %TEMP%/.claude copy is not a backup).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
from pathlib import Path

from ja_common import CHUNKS, HERE, TM_DIR, tm_append

PROJ = Path.home() / ".claude" / "projects"      # --scan looks through every project's workflow runs


def journals(args) -> list[Path]:
    if args.scan:
        return sorted(PROJ.glob("*/*/subagents/workflows/wf_*/journal.jsonl"))
    out = []
    for a in args.paths:
        p = Path(a)
        out.append(p / "journal.jsonl" if p.is_dir() else p)
    return out


def existing_by() -> set:
    seen = set()
    for f in TM_DIR.glob("*.jsonl"):
        for l in f.read_text(encoding="utf-8").splitlines():
            if l.strip():
                r = json.loads(l)
                seen.add((r.get("by"), r.get("lid")))
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--scan", action="store_true")
    a = ap.parse_args()
    seen = existing_by()
    now = dt.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    added: dict = {}
    stats = {"results": 0, "items": 0, "unknown_id": 0, "dup": 0}
    for jp in journals(a):
        if not jp.exists():
            print("missing", jp)
            continue
        run = jp.parent.name
        seq = 0
        for line in jp.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            o = json.loads(line)
            if o.get("type") != "result":
                continue
            r = o.get("result")
            if isinstance(r, str):
                try:
                    r = json.loads(r)
                except Exception:
                    continue
            if not isinstance(r, dict) or not {"chunk", "stage", "items"} <= set(r):
                continue
            cf = CHUNKS / f"{r['chunk']}.json"
            if not cf.exists():
                continue
            stats["results"] += 1
            ch = json.loads(cf.read_text(encoding="utf-8"))
            rows = {x["lid"]: x for x in ch["rows"]}
            by = f"{run}/{r['chunk']}/{r['stage']}"
            for it in r["items"]:
                u = rows.get(it.get("id"))
                if not u:
                    stats["unknown_id"] += 1
                    continue
                if (by, u["lid"]) in seen:
                    stats["dup"] += 1
                    continue
                seen.add((by, u["lid"]))
                seq += 1
                rec = {"d": u["d"], "sc": u["sc"], "f": u["f"], "en": u["en"], "ja": it.get("ja", ""),
                       "yo": it.get("yo", ""), "reg": it.get("reg", "p"), "st": r["stage"], "by": by,
                       "lid": u["lid"], "ts": f"{now}.{seq:06d}", "v": 1}
                if r["stage"] == "verify" and not it.get("ja"):   # reading overrides only; text stays as resolved
                    rec = {k: rec[k] for k in ("d", "sc", "f", "en", "st", "by", "lid", "ts", "v")}
                    rec["ov"] = [[sp["s"], sp["e"], sp["r"]] for sp in it.get("spans", [])]
                added.setdefault(u["d"], []).append(rec)
                stats["items"] += 1
        dst = HERE / "journals" / f"{run}.jsonl"
        dst.parent.mkdir(exist_ok=True)
        if not dst.exists():
            shutil.copyfile(jp, dst)
    for d, recs in added.items():
        tm_append(d, recs)
        print(f"  tm/{d}.jsonl += {len(recs)}")
    print("harvest:", stats)


if __name__ == "__main__":
    main()
