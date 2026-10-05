"""Flagged readings -> a verify wave (one LLM stage, effort high).

    python export_verify.py --round 1        # -> chunks/V<r>-NN.json + wf/ja_verify_r<r>.wf.js

For every resolved TM unit whose derived reading carries flags, the verifier sees the English,
the Japanese with its current furigana, and each questionable ruby block with the author's
reading and the dictionary witnesses. It returns the correct reading for every listed block
(harvested as a verify record carrying only `ov`, which clears those flags on re-derive).
"""
from __future__ import annotations

import argparse
import json
import re

from ja_common import CHUNKS, HERE, TM_DIR, tm_resolve
from export_ja import BAD, WF
from reading_ja import derive

PROMPT = """You are a native Japanese teacher checking furigana for a learner app (Thai adults learning Japanese).
For each item you get the English meaning, the Japanese sentence, its current furigana ({kanji|reading}) and a
list of ruby blocks whose reading was questioned: [s-e] = character offsets in the Japanese sentence, the block
text, the translator's reading and what two dictionaries guessed (dictionaries often miss context: 何 なに/なん,
方 ほう/かた, 後 あと/ご/のち, 一日 いちにち/ついたち, 上手 じょうず/うわて, rendaku, counters).
Decide the correct reading of EACH listed block in THIS sentence and meaning. Readings are hiragana only,
exactly for the block text (no okurigana outside the block). Return every listed block, even when the
translator was right. Only change a reading when the current one is wrong or clearly unnatural here;
if two readings are both standard, keep the translator's."""

SCHEMA = {"type": "object", "additionalProperties": False, "required": ["chunk", "stage", "items"], "properties": {
    "chunk": {"type": "string"}, "stage": {"type": "string", "enum": ["verify"]},
    "items": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["id", "spans"],
              "properties": {"id": {"type": "string"}, "spans": {"type": "array", "items": {
                  "type": "object", "additionalProperties": False, "required": ["s", "e", "r"],
                  "properties": {"s": {"type": "integer"}, "e": {"type": "integer"}, "r": {"type": "string"}}}}}}}}}

TMPL = r"""export const meta = {
  name: 'ja-verify-__R__',
  description: 'Japanese layer: verify __U__ flagged furigana readings in __N__ chunks (round __R__)',
  phases: [{ title: 'Verify' }],
}
var PROMPT = __PROMPT__
var CHUNKS = __CHUNKS__
var SCHEMA = __SCHEMA__
phase('Verify')
var res = await parallel(CHUNKS.map(function (c) { return function () {
  var p = PROMPT + '\n\nSet chunk="' + c.id + '" and stage="verify". Answer ONLY through the structured output, one item per id (' + c.n + ' ids).\n\n' + c.text
  return agent(p, { label: 'ja:V:' + c.id, phase: 'Verify', schema: SCHEMA, effort: 'high' })
} }))
return { ok: res.filter(Boolean).map(function (r) { return r.chunk }) }
"""

FLAG_BLOCK = re.compile(r"^(?:DISAGREE|AMBIG|PROPN|NUM|NOREAD):([^=|]+)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--round", type=int, default=1)
    ap.add_argument("--per", type=int, default=35)
    a = ap.parse_args()
    units = []
    for d in sorted(p.stem for p in TM_DIR.glob("*.jsonl")):
        for (sc, _en), r in tm_resolve(d).items():
            res = derive(r["ja"], r.get("yo", ""), r.get("ov"), sentence=r.get("f") != "gloss")
            if not res["flags"]:
                continue
            whole = any(f in ("ALIGN_FAIL", "ALIGN_AMBIG") or f.startswith(("JMDICT", "OV_MISS")) for f in res["flags"])
            names = {m.group(1) for f in res["flags"] if (m := FLAG_BLOCK.match(f))}
            blocks = [b for b in res["blocks"] if whole or b[2] in names]
            if not blocks:
                continue
            units.append((r, res, blocks))
    chunks, js = [], []
    for i in range(0, len(units), a.per):
        cid = f"V{a.round}-{i // a.per + 1:02d}"
        rows, L = [], []
        for j, (r, res, blocks) in enumerate(units[i:i + a.per]):
            lid = f"v{j + 1:03d}"
            rows.append({"lid": lid, "d": r["d"], "file": "", "sc": r["sc"], "f": r["f"], "en": r["en"]})
            L.append(f"[{lid}] EN: {r['en'] if r['d'] != 'gold' else '(original Japanese)'}")
            L.append(f"  JA: {res['ja']}")
            L.append(f"  FURI: {res['furi']}")
            for s, e, x, rd, u, scr in blocks:
                L.append(f"  - [{s}-{e}] {x}: translator={rd} | dict1={u or '?'} | dict2={scr or '?'}")
        text = "\n".join(L)
        (CHUNKS / f"{cid}.json").write_text(json.dumps({"id": cid, "kind": "verify", "rows": rows},
                                                        ensure_ascii=False, indent=1), encoding="utf-8")
        js.append({"id": cid, "n": len(rows), "text": text})
    # split into waves under the Workflow tool's 512 KB script limit
    waves, cur, size = [], [], 0
    for c in js:
        b = len(json.dumps(c, ensure_ascii=False).encode("utf-8"))
        if cur and size + b > 380_000:
            waves.append(cur)
            cur, size = [], 0
        cur.append(c)
        size += b
    if cur:
        waves.append(cur)
    print(f"{len(units)} flagged units, {len(js)} chunks")
    for w, part in enumerate(waves):
        tag = f"{a.round}" if len(waves) == 1 else f"{a.round}w{w + 1}"
        s = (TMPL.replace("__R__", tag).replace("__U__", str(sum(c["n"] for c in part))).replace("__N__", str(len(part)))
             .replace("__PROMPT__", json.dumps(PROMPT, ensure_ascii=False))
             .replace("__SCHEMA__", json.dumps(SCHEMA))
             .replace("__CHUNKS__", json.dumps(part, ensure_ascii=False, indent=0)))
        s = s.replace("\r\n", "\n")
        assert not BAD.search(s), "control character in wave script"
        out = WF / f"ja_verify_r{tag}.wf.js"
        out.write_bytes(s.encode("utf-8"))
        assert out.stat().st_size < 500_000, out.name
        print(f"  {out.name}: {len(part)} chunks ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
