"""Blind back-translation + meaning judge for resolved TM units (QA only, never overrides).

    python export_bt.py --tag P0 [--sample 1.0]    # -> chunks/B<tag>-NN.json + wf/ja_bt_<tag>.wf.js
    python bt_compare.py <runDir>                   # -> reports/bt_<tag>.tsv

Stage 1 sees ONLY the Japanese and writes English. Stage 2 sees the original English, the Japanese
and the back-translation, and marks items whose Japanese changed the meaning or the register.
"""
from __future__ import annotations

import argparse
import json
import random

from ja_common import CHUNKS, TM_DIR, norm, tm_read, tm_resolve
from export_ja import BAD, WF

BT = """Translate each Japanese line into natural English. You see only the Japanese. Keep the tone
(casual / polite / formal) visible in the English. One item per id."""
JUDGE = """You check Japanese translations for a learner app. For each item compare the ORIGINAL English with the
Japanese and with a blind back-translation of that Japanese. Mark bad=true only when the Japanese changes the
meaning (wrong sense, missing or added information, wrong subject/tense that matters) or uses a clearly wrong
register for the situation. Natural rephrasing, dropped pronouns and です/ます vs plain choices that fit the
context are fine. An ORIGINAL starting with # is a dictionary entry "#headword|part of speech|definition": its Japanese
is 1-3 equivalent words; mark it bad only for the wrong sense or a clearly wrong part of speech.
note: short reason in English when bad, else empty."""
S_BT = {"type": "object", "additionalProperties": False, "required": ["chunk", "items"], "properties": {
    "chunk": {"type": "string"}, "items": {"type": "array", "items": {"type": "object", "additionalProperties": False,
     "required": ["id", "en"], "properties": {"id": {"type": "string"}, "en": {"type": "string"}}}}}}
S_J = {"type": "object", "additionalProperties": False, "required": ["chunk", "items"], "properties": {
    "chunk": {"type": "string"}, "items": {"type": "array", "items": {"type": "object", "additionalProperties": False,
     "required": ["id", "bad", "note"], "properties": {"id": {"type": "string"}, "bad": {"type": "boolean"},
                                                    "note": {"type": "string"}}}}}}
TMPL = r"""export const meta = {
  name: 'ja-bt-__TAG__',
  description: 'Japanese layer: blind back-translation + meaning judge for __U__ units (__TAG__)',
  phases: [{ title: 'Back-translate' }, { title: 'Judge' }],
}
var BT = __BT__
var JUDGE = __JUDGE__
var CHUNKS = __CHUNKS__
var S_BT = __S_BT__
var S_J = __S_J__
var res = await pipeline(CHUNKS,
  function (c) {
    var p = BT + '\n\nSet chunk="' + c.id + '". Answer ONLY through the structured output (' + c.n + ' ids).\n\n' + c.ja
    return agent(p, { label: 'ja:B:' + c.id, phase: 'Back-translate', schema: S_BT, effort: 'low' })
  },
  function (d, c) {
    if (!d) return null
    var bt = {}; d.items.forEach(function (x) { bt[x.id] = x.en })
    var lines = c.rows.map(function (r) { return '[' + r.id + '] ORIGINAL: ' + r.en + '\n  JA: ' + r.ja + '\n  BACK: ' + (bt[r.id] || '?') }).join('\n')
    var p = JUDGE + '\n\nSet chunk="' + c.id + '". Answer ONLY through the structured output (' + c.n + ' ids).\n\n' + lines
    return agent(p, { label: 'ja:J:' + c.id, phase: 'Judge', schema: S_J, effort: 'medium' }).then(function (j) { return j ? { chunk: c.id, bt: bt, judge: j.items } : null })
  })
return { ok: res.filter(Boolean).length }
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True)
    ap.add_argument("--sample", type=float, default=1.0)
    ap.add_argument("--per", type=int, default=60)
    ap.add_argument("--glosses", action="store_true")
    a = ap.parse_args()
    random.seed(a.tag)
    units = []
    for p in sorted(TM_DIR.glob("*.jsonl")):
        if p.stem == "gold":
            continue
        judged = {(r["sc"], norm(r["en"])) for r in tm_read(p.stem) if r.get("st") == "bt"}
        for (sc, _en), r in tm_resolve(p.stem).items():
            if (r.get("f") == "gloss" and not a.glosses) or (sc, _en) in judged:
                continue                       # glosses are word lists; judged by the review stage
            if random.random() <= a.sample:
                units.append(r)
    js = []
    for i in range(0, len(units), a.per):
        cid = f"B{a.tag}-{i // a.per + 1:02d}"
        rows = [{"id": f"b{j + 1:03d}", "d": r["d"], "sc": r["sc"], "f": r["f"], "en": r["en"], "ja": r["ja"]}
                for j, r in enumerate(units[i:i + a.per])]
        (CHUNKS / f"{cid}.json").write_text(json.dumps({"id": cid, "kind": "bt", "rows": rows}, ensure_ascii=False, indent=1),
                                            encoding="utf-8")
        js.append({"id": cid, "n": len(rows), "ja": "\n".join(f"[{r['id']}] {r['ja']}" for r in rows),
                   "rows": [{"id": r["id"], "en": r["en"], "ja": r["ja"]} for r in rows]})
    for w, i in enumerate(range(0, len(js), 25)):
        part = js[i:i + 25]
        tag = a.tag if len(js) <= 25 else f"{a.tag}w{w + 1}"
        s = (TMPL.replace("__TAG__", tag).replace("__U__", str(sum(c["n"] for c in part)))
             .replace("__BT__", json.dumps(BT)).replace("__JUDGE__", json.dumps(JUDGE))
             .replace("__S_BT__", json.dumps(S_BT)).replace("__S_J__", json.dumps(S_J))
             .replace("__CHUNKS__", json.dumps(part, ensure_ascii=False, indent=0)))
        s = s.replace("\r\n", "\n")
        assert not BAD.search(s), "control character in wave script"
        out = WF / f"ja_bt_{tag}.wf.js"
        out.write_bytes(s.encode("utf-8"))
        print(f"{sum(c['n'] for c in part)} units, {len(part)} chunks -> {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
