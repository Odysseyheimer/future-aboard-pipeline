"""Back-translation drift -> a fix wave (re-translate only the lines the meaning judge marked bad).

    python export_fix.py --tag P1 reports/bt_P1w1.tsv [...]   # -> chunks/F<tag>-NN.json + wf/ja_fix_<tag>.wf.js

The fixer sees the English, the Thai, the neighbouring lines (for conversations), the current Japanese
and the judge's note, and returns corrected ja + yo + reg. Harvested as stage "verify" WITH ja, which
replaces the text (and drops older reading overrides) in tm_resolve.
"""
from __future__ import annotations

import argparse
import json

from ja_common import CHUNKS, load_deck, norm, tm_resolve
from export_ja import BAD, STYLE, WF

FIX = """Each item below is a Japanese line whose meaning drifted from the English (a reviewer's note says how).
Rewrite the Japanese so it says exactly what the English says, in the same register as before unless the note
says the register is wrong, following all the rules above. Return ja, yo (complete hiragana reading) and reg
for every id."""

SCHEMA = {"type": "object", "additionalProperties": False, "required": ["chunk", "stage", "items"], "properties": {
    "chunk": {"type": "string"}, "stage": {"type": "string", "enum": ["verify"]},
    "items": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["id", "ja", "yo", "reg"],
              "properties": {"id": {"type": "string"}, "ja": {"type": "string"}, "yo": {"type": "string"},
                             "reg": {"type": "string", "enum": ["c", "p", "k"]}}}}}}

TMPL = r"""export const meta = {
  name: 'ja-fix-__TAG__',
  description: 'Japanese layer: re-translate __U__ lines flagged by back-translation (__TAG__)',
  phases: [{ title: 'Fix' }],
}
var P = __P__
var CHUNKS = __CHUNKS__
var SCHEMA = __SCHEMA__
phase('Fix')
var res = await parallel(CHUNKS.map(function (c) { return function () {
  return agent(P + '\n\nSet chunk="' + c.id + '" and stage="verify". Answer ONLY through the structured output (' + c.n + ' ids).\n\n' + c.text,
    { label: 'ja:F:' + c.id, phase: 'Fix', schema: SCHEMA, effort: 'high' })
} }))
return { ok: res.filter(Boolean).map(function (r) { return r.chunk }) }
"""


def context():
    """(deck, sc, norm en) -> (thai, neighbours text)"""
    ctx = {}
    for c in load_deck("conversations"):
        lines = [f"{t['speaker']}: {t['en']}" for t in c["turns"]]
        for i, t in enumerate(c["turns"]):
            nb = " / ".join(lines[max(0, i - 2):i + 2])
            ctx[("conversations", c["id"], norm(t["en"]))] = (t.get("th", ""), f"{c['roleA']} (A) and {c['roleB']} (B): {nb}")
        for k in c.get("keyphrases", []):
            ctx[("conversations", c["id"], norm(k["en"]))] = (k.get("th", ""), f"key phrase from a dialogue {c['roleA']} / {c['roleB']}")
    for s in load_deck("sentences"):
        ctx[("sentences", s["w"] + "|" + s["g"], norm(s["w"]))] = (s.get("mt", ""), s.get("g", ""))
    for s in load_deck("stories"):
        for p in s["paras"]:
            ctx[("stories", s["id"], norm(p["en"]))] = (p.get("th", ""), f"story paragraph ({s['lvl']})")
    return ctx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True)
    ap.add_argument("reports", nargs="+")
    a = ap.parse_args()
    ctx = context()
    rows, seen = [], set()
    for rp in a.reports:
        for line in open(rp, encoding="utf-8").read().splitlines():
            if not line.strip():
                continue
            d, sc, f, note, en = line.split("\t")[:5]
            k = (d, sc, norm(en))
            if k in seen:
                continue
            seen.add(k)
            r = tm_resolve(d).get((sc, norm(en)))
            if r:
                rows.append((d, sc, f, en, note, r))
    js = []
    for i in range(0, len(rows), 30):
        cid = f"F{a.tag}-{i // 30 + 1:02d}"
        part = rows[i:i + 30]
        recs, L = [], []
        for j, (d, sc, f, en, note, r) in enumerate(part):
            lid = f"f{j + 1:03d}"
            th, nb = ctx.get((d, sc, norm(en)), ("", ""))
            recs.append({"lid": lid, "d": d, "file": d, "sc": sc, "f": f, "en": en})
            L.append(f"[{lid}] EN: {en}" + (f" | TH: {th}" if th else ""))
            if nb:
                L.append(f"  context: {nb}")
            L.append(f"  current JA ({r.get('reg', 'p')}): {r['ja']}")
            L.append(f"  reviewer: {note}")
        (CHUNKS / f"{cid}.json").write_text(json.dumps({"id": cid, "kind": "fix", "rows": recs}, ensure_ascii=False, indent=1),
                                            encoding="utf-8")
        js.append({"id": cid, "n": len(part), "text": "\n".join(L)})
    s = (TMPL.replace("__TAG__", a.tag).replace("__U__", str(len(rows)))
         .replace("__P__", json.dumps(STYLE + "\n" + FIX, ensure_ascii=False))
         .replace("__SCHEMA__", json.dumps(SCHEMA))
         .replace("__CHUNKS__", json.dumps(js, ensure_ascii=False, indent=0)))
    s = s.replace("\r\n", "\n")
    assert not BAD.search(s), "control character in wave script"
    out = WF / f"ja_fix_{a.tag}.wf.js"
    out.write_bytes(s.encode("utf-8"))
    print(f"{len(rows)} lines, {len(js)} chunks -> {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
