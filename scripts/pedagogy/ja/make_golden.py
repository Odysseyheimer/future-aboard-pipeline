"""Write golden.json: norm/key vectors that Python and JS must agree on."""
import json
from ja_common import norm, key, gloss_src, key_of
cases = [
    ("advertise|A2", "He advertised his room for rent."),
    ("x|B1", "  It’s  “fine” now \n"),
    ("undefined|undefined", ""),
    ("c01", "Could I have the bill, please?"),
    ("story_1", "Tom’s dog ran \t away."),
    ("日本|x", "unicode scope 日本語 テスト 🐱"),
]
items = [{"w": "run", "g": "A1", "p": "verb", "me": "to move fast on foot", "mt": "วิ่ง"},
         {"w": "design", "g": "Engineering", "p": "noun", "me": "", "mt": "การออกแบบ"}]
out = {"norm": [[en, norm(en)] for _, en in cases],
       "key": [[sc, en, s, key(sc, en, s)] for sc, en in cases for s in (0, 1, 7)],
       "gloss": [[it, gloss_src(it), key_of(it)] for it in items]}
json.dump(out, open("golden.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("golden:", len(out["norm"]), "norm,", len(out["key"]), "key,", len(out["gloss"]), "gloss vectors")
