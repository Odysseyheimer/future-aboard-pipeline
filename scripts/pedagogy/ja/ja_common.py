"""Shared contract for the Japanese layer (Python side).

Everything the app looks up is keyed by CONTENT, never by array position:

    key = fnv1a32( [salt "\n"] + scope + "\n" + norm(en) )  -> base36

`output/ptmods/ja.js` implements the same norm/fnv; `ja_parity.js` proves they agree
on every key of every shipped sidecar. If you change anything here, change it there
and rerun the parity test, or all Japanese silently disappears in the app.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATA = Path(os.environ["PT_DATA"]) if os.environ.get("PT_DATA") else ROOT / "output" / "data"   # PT_DATA: deck folder override
TM_DIR = HERE / "tm"
CHUNKS = HERE / "chunks"
REPORTS = HERE / "reports"

WORD_DECKS = ["oxford", "awl", "colloc", "syn", "pv", "idiom", "topic", "knowledge"]
STAGE_RANK = {"author": 1, "review": 2, "verify": 3, "human": 4}

_Q1 = re.compile("[‘’]")
_Q2 = re.compile("[“”]")
_WS = re.compile("[ \t\r\n ]+")


def norm(s: str) -> str:
    s = _Q1.sub("'", s or "")
    s = _Q2.sub('"', s)
    s = _WS.sub(" ", s)
    return s.strip(" ")


def fnv(s: str) -> str:
    h = 0x811C9DC5
    b = s.encode("utf-16-le")
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 16777619) & 0xFFFFFFFF
    return b36(h)


def b36(n: int) -> str:
    if n == 0:
        return "0"
    d = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = []
    while n:
        n, r = divmod(n, 36)
        out.append(d[r])
    return "".join(reversed(out))


def key(scope: str, en: str, salt: int = 0) -> str:
    pre = (str(salt) + "\n") if salt else ""
    return fnv(pre + scope + "\n" + norm(en))


def key_of(it: dict) -> str:
    """The app's keyOf(): w + "|" + g (g may be missing -> "undefined" in JS)."""
    g = it.get("g")
    return str(it.get("w")) + "|" + ("undefined" if g is None else str(g))


def gloss_src(it: dict) -> str:
    """Source text for a headword gloss. p and me are in it, so a sense change is a miss."""
    return "#" + str(it.get("w") or "") + "|" + str(it.get("p") or "") + "|" + str(it.get("me") or it.get("mt") or "")


def load_deck(deck: str):
    return json.loads((DATA / f"{deck}.json").read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- TM
def tm_path(deck: str) -> Path:
    return TM_DIR / f"{deck}.jsonl"


def tm_append(deck: str, recs: list[dict]) -> int:
    TM_DIR.mkdir(parents=True, exist_ok=True)
    with tm_path(deck).open("a", encoding="utf-8", newline="\n") as fh:
        for r in recs:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    return len(recs)


def tm_read(deck: str) -> list[dict]:
    p = tm_path(deck)
    if not p.exists():
        return []
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


def tm_resolve(deck: str) -> dict:
    """(sc, norm(en)) -> merged record. Highest stage wins; within a stage the later line wins.

    A verify record may carry only `ov` (reading overrides) - it then refines the best
    ja/yo record rather than replacing it. A verify/human record with its own `ja`
    replaces the text and drops older overrides.
    """
    best: dict = {}
    for r in tm_read(deck):
        if r.get("st") == "bt":
            continue
        k = (r["sc"], norm(r["en"]))
        cur = best.get(k)
        if r.get("ja"):
            if cur is None or STAGE_RANK.get(r["st"], 0) >= STAGE_RANK.get(cur.get("st"), 0):
                nr = dict(r)
                if cur is not None and not r.get("ov") and STAGE_RANK.get(r["st"], 0) < 3:
                    nr["ov"] = []
                best[k] = nr
        elif r.get("ov") is not None and cur is not None:
            cur = dict(cur)
            cur["ov"] = r["ov"]
            cur["st"] = max(cur["st"], r["st"], key=lambda s: STAGE_RANK.get(s, 0))
            best[k] = cur
    return best


# ------------------------------------------------------------- script classes
KANJI_RE = re.compile("[㐀-䶿一-鿿豈-﫿々〆ヶ〇]")
KANA_RE = re.compile("[ぁ-ゖァ-ヺー]")
JA_ANY = re.compile("[぀-ヿ㐀-䶿一-鿿豈-﫿]")


def kata2hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)
