"""Enumerate translation units from the CURRENT decks.

A unit is one English string that needs Japanese:
    {d: deck, file: sidecar file, sc: scope, f: field, en: source, ctx: {...}}
The TM key is (d, sc, norm(en)); the sidecar key is key(sc, en).
"""
from __future__ import annotations

from ja_common import gloss_src, key_of, load_deck, norm

WORD_DECKS = ["oxford", "awl", "colloc", "syn", "pv", "idiom", "topic", "knowledge"]


def x_file(deck: str, it: dict) -> str:
    return f"oxford.x.{it.get('g')}" if deck == "oxford" else f"{deck}.x"


def word_units(deck: str, it: dict, fields=("gloss", "ee", "kn", "xs", "au")) -> list[dict]:
    sc = key_of(it)
    base = {"w": it.get("w"), "p": it.get("p"), "me": it.get("me"), "mt": it.get("mt"), "g": it.get("g")}
    out = []
    if "gloss" in fields:
        out.append({"d": deck, "file": deck, "sc": sc, "f": "gloss", "en": gloss_src(it), "ctx": base})
    if "ee" in fields and it.get("ee"):
        out.append({"d": deck, "file": deck, "sc": sc, "f": "ee", "en": it["ee"], "ctx": {**base, "th": it.get("et", "")}})
    kn = it.get("kn")
    if "kn" in fields and isinstance(kn, dict) and kn.get("en"):
        out.append({"d": deck, "file": deck, "sc": sc, "f": "kn", "en": kn["en"], "ctx": {**base, "th": kn.get("th", "")}})
    for fld, arr in (("xs", it.get("xs")), ("au", it.get("au"))):
        if fld in fields and isinstance(arr, list):
            for x in arr:
                if isinstance(x, dict) and x.get("en"):
                    out.append({"d": deck, "file": x_file(deck, it), "sc": sc, "f": fld, "en": x["en"],
                                "ctx": {**base, "th": x.get("th", "")}})
    return out


def sentence_units(it: dict) -> list[dict]:
    return [{"d": "sentences", "file": "sentences", "sc": key_of(it), "f": "s", "en": it["w"],
             "ctx": {"g": it.get("g"), "th": it.get("mt", ""), "note": it.get("tn", "")}}]


def conversation_units(cv: dict) -> list[dict]:
    sc = cv["id"]
    base = {"g": cv.get("g"), "roleA": cv.get("roleA"), "roleB": cv.get("roleB"), "level": cv.get("level")}
    out = [{"d": "conversations", "file": "conversations", "sc": sc, "f": "title", "en": cv["title"], "ctx": base}]
    for i, t in enumerate(cv.get("turns", [])):
        out.append({"d": "conversations", "file": "conversations", "sc": sc, "f": "turn", "en": t["en"],
                    "ctx": {**base, "speaker": t.get("speaker"), "th": t.get("th", ""), "i": i}})
    for k in cv.get("keyphrases", []):
        out.append({"d": "conversations", "file": "conversations", "sc": sc, "f": "kp", "en": k["en"],
                    "ctx": {**base, "th": k.get("th", "")}})
    return out


def story_units(stv: dict) -> list[dict]:
    sc = stv["id"]
    base = {"lvl": stv.get("lvl"), "genre": stv.get("genre")}
    out = [{"d": "stories", "file": "stories", "sc": sc, "f": "title", "en": stv["title"],
            "ctx": {**base, "th": stv.get("title_th", "")}}]
    for i, p in enumerate(stv.get("paras", [])):
        out.append({"d": "stories", "file": "stories", "sc": sc, "f": "para", "en": p["en"],
                    "ctx": {**base, "th": p.get("th", ""), "i": i}})
    return out


def dedup(units: list[dict]) -> list[dict]:
    seen, out = set(), []
    for u in units:
        k = (u["file"], u["sc"], norm(u["en"]))
        if k in seen or not norm(u["en"]):
            continue
        seen.add(k)
        out.append(u)
    return out


# ------------------------------------------------------------------ phases
def pilot():
    """P0: 200 sentences over 6 groups, 50 oxford A1 words, 5 conversations, 2 stories."""
    sents = load_deck("sentences")
    groups = ["Apologizing & Excuses", "At Work", "At the Airport", "Complaints & Returns",
              "Asking for Help", "Bargaining & Prices"]
    per = {g: [s for s in sents if s["g"] == g] for g in groups}
    pick = []
    quota = [34, 34, 33, 33, 33, 33]
    for g, q in zip(groups, quota):
        pick += per[g][:q]
    ox = [x for x in load_deck("oxford") if x["g"] == "A1"]
    words = ox[::18][:50]
    cv = load_deck("conversations")
    want = ["Eating Out", "At Work", "Health & Doctor", "Job Interview", "Making Plans"]
    convs = []
    for g in want:
        c = next((c for c in cv if c["g"] == g), None)
        if c:
            convs.append(c)
    st = [s for s in load_deck("stories") if s["lvl"] == "A2"][:2]
    return {"sentences": pick, "oxford": words, "conversations": convs, "stories": st}


def units_for(sel: dict) -> list[dict]:
    u = []
    for s in sel.get("sentences", []):
        u += sentence_units(s)
    for it in sel.get("oxford", []):
        u += word_units("oxford", it, ("gloss", "ee", "xs"))
    for c in sel.get("conversations", []):
        u += conversation_units(c)
    for s in sel.get("stories", []):
        u += story_units(s)
    return dedup(u)


if __name__ == "__main__":
    import collections
    us = units_for(pilot())
    print(len(us), "pilot units")
    print(collections.Counter((u["file"], u["f"]) for u in us))
