"""TM + derived readings + CURRENT decks -> shipped sidecars and index.

    python ja_build.py [--pilot]

For every sidecar file (core <deck>, extras <deck>.x / oxford.x.<g>) it enumerates the units the
current deck needs, resolves each against the TM, derives furigana + romaji, drops anything with a
hard validation failure, picks the lowest salt 0..9 with no key collision over ALL expected units,
and writes output/data/ja/<file>.<sha8>.json (compact, sorted -> deterministic sha).
index.json lists a file only at >=99% coverage, or with --pilot any file that has content.
Also writes reports/keys_manifest.json (for ja_parity.js) and reports/build.txt, then runs parity.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import subprocess
import sys

from ja_common import DATA, HERE, REPORTS, TM_DIR, key, load_deck, norm, tm_resolve
from reading_ja import derive
from units import WORD_DECKS, conversation_units, dedup, sentence_units, story_units, word_units
from validate_ja import check, speaker_mix

OUT = DATA / "ja"


def all_units() -> dict:
    """file -> [unit] for every deck that exists."""
    files = collections.defaultdict(list)
    for d in WORD_DECKS:
        if (DATA / f"{d}.json").exists():
            for it in load_deck(d):
                for u in word_units(d, it):
                    files[u["file"]].append(u)
    for s in load_deck("sentences"):
        for u in sentence_units(s):
            files[u["file"]].append(u)
    for c in load_deck("conversations"):
        for u in conversation_units(c):
            files[u["file"]].append(u)
    for s in load_deck("stories"):
        for u in story_units(s):
            files[u["file"]].append(u)
    return {f: dedup(us) for f, us in files.items()}


def deck_of(file: str) -> str:
    return file.split(".")[0]


def sha(b: bytes, n=8) -> str:
    return hashlib.sha256(b).hexdigest()[:n]


def pick_salt(units) -> int:
    pairs = {(u["sc"], norm(u["en"])) for u in units}
    for salt in range(10):
        ks = collections.Counter(key(sc, en, salt) for sc, en in pairs)
        if all(v == 1 for v in ks.values()):
            return salt
    raise SystemExit("no collision-free salt 0..9")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pilot", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    rev = dt.datetime.now().strftime("%Y%m%d.%H%M")
    tm = {d: tm_resolve(d) for d in {p.stem for p in TM_DIR.glob("*.jsonl")} - {"gold"}}
    used = collections.defaultdict(set)                       # deck -> TM keys matched by current units
    idx = {"v": 1, "rev": rev, "files": {}, "cov": {}}
    manifest, report = {}, []
    hard_total = 0
    for file, units in sorted(all_units().items()):
        d = deck_of(file)
        salt = pick_salt(units)
        t, hard = {}, 0
        conv_rows = collections.defaultdict(list)
        rows = []
        for u in units:
            r = tm.get(d, {}).get((u["sc"], norm(u["en"])))
            if not r:
                continue
            used[d].add((u["sc"], norm(u["en"])))
            der = derive(r["ja"], r.get("yo", ""), r.get("ov"), sentence=u["f"] != "gloss")
            h, _s = check(u, r, der)
            if u["d"] == "conversations":
                conv_rows[u["sc"]].append((u, r))
            if h:
                hard += 1
                report.append(f"  HARD {file} {u['sc']} {u['f']}: {','.join(h)} | {der['furi']}")
                continue
            k = key(u["sc"], u["en"], salt)
            t[k] = [der["furi"], der["rom"]]
            rows.append([u["sc"], u["en"], k])
        hard_total += hard
        mixes = {sc: m for sc, rs in conv_rows.items() if (m := speaker_mix(rs))}
        if mixes:
            report.append(f"  SOFT speaker register mix in {len(mixes)} conversations: {sorted(mixes)[:12]}")
        n, m = len(t), len(units)
        if not n:
            continue
        cov = n / m
        src = sha((DATA / f"{d}.json").read_bytes())
        body = {"v": 1, "file": file, "salt": salt, "rev": rev, "src": src, "cov": [n, m], "t": t}
        if cov < 0.99:
            body["pilot"] = 1
        blob = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        # sha over content without rev so an unchanged file keeps its name across builds
        stable = dict(body)
        stable.pop("rev")
        name = f"{file}.{sha(json.dumps(stable, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8'))}.json"
        listed = cov >= 0.99 or a.pilot
        report.append(f"{file:18} {n:6}/{m:<6} {100 * cov:6.2f}%  salt={salt}  {'LISTED' if listed else 'held'}  {name}")
        if listed:
            (OUT / name).write_bytes(blob)
            idx["files"][file] = name
            idx["cov"][file] = [n, m]
            manifest[file] = {"salt": salt, "rows": rows}
    if a.pilot:
        idx["pilot"] = 1
    keep = set(idx["files"].values()) | {"index.json"}
    for p in OUT.glob("*.json"):
        if p.name not in keep:
            p.unlink()
    (OUT / "index.json").write_text(json.dumps(idx, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                                    encoding="utf-8")
    stale = {d: len(recs) - len(used[d]) for d, recs in tm.items()}
    report.append(f"stale TM units (English no longer in deck): {stale}")
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "keys_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    (REPORTS / "build.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(x for x in report if "LISTED" in x or "HARD" in x or "stale" in x))
    size = sum(p.stat().st_size for p in OUT.glob("*.json"))
    print(f"index: {len(idx['files'])} files, {size // 1024} KB total, hard-dropped {hard_total}")
    r = subprocess.run(["node", str(HERE / "ja_parity.js")], capture_output=True, text=True, encoding="utf-8")
    print(r.stdout.strip() or r.stderr.strip())
    sys.exit(r.returncode or (1 if hard_total else 0))


if __name__ == "__main__":
    main()
