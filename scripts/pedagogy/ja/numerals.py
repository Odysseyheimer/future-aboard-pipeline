"""Readings for Arabic numerals + counters (a WITNESS, not the source of truth).

    readings("3匹") -> {"さんびき"}        readings("1日") -> {"ついたち", "いちにち"}
    readings("10:30") -> {"じゅうじさんじゅっぷん", "じゅうじはん"}
Returns None when the span is not something this module understands (-> NUM flag).
"""
from __future__ import annotations

import re

D = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"]


def base(n: int) -> str:
    if n == 0:
        return "ぜろ"
    out = ""
    man, n = divmod(n, 10000)
    if man:
        out += (base(man) if man > 1 else "いち") + "まん"
    th, n = divmod(n, 1000)
    if th:
        out += {1: "せん", 3: "さんぜん", 8: "はっせん"}.get(th, D[th] + "せん")
    hu, n = divmod(n, 100)
    if hu:
        out += {1: "ひゃく", 3: "さんびゃく", 6: "ろっぴゃく", 8: "はっぴゃく"}.get(hu, D[hu] + "ひゃく")
    te, n = divmod(n, 10)
    if te:
        out += ("" if te == 1 else D[te]) + "じゅう"
    if n:
        out += D[n]
    return out


def _gem(n: int, kana: str, voiced: str | None = None, h_row: bool = False) -> set:
    """Counter with sound changes on the last digit (1, 3, 6, 8, 10)."""
    last = n % 10
    if n % 100 == 0 and n >= 100 and h_row:
        return {base(n) + "ぴゃく"[0:0] + {"ほ": "ぽ", "ひ": "ぴ", "は": "ぱ", "ふ": "ぷ"}.get(kana[0], kana[0]) + kana[1:]}
    stem = base(n)
    if n % 10 == 0 and n > 0 and n % 100 != 0:          # ...じゅう -> ...じゅっ / じっ
        s = stem[:-1] + "っ"
        if h_row:
            return {s + {"ほ": "ぽ", "ひ": "ぴ", "は": "ぱ", "ふ": "ぷ"}[kana[0]] + kana[1:]}
        return {s + kana}
    if last == 1:
        s = stem[:-2] + "いっ"
        if h_row:
            return {s + {"ほ": "ぽ", "ひ": "ぴ", "は": "ぱ", "ふ": "ぷ"}[kana[0]] + kana[1:]}
        return {s + kana}
    if last == 8:
        s = stem[:-2] + "はっ"
        if h_row:
            return {s + {"ほ": "ぽ", "ひ": "ぴ", "は": "ぱ", "ふ": "ぷ"}[kana[0]] + kana[1:], stem + kana}
        return {s + kana, stem + kana}
    if last == 3 and h_row:
        return {stem + {"ほ": "ぼ", "ひ": "び", "は": "ば", "ふ": "ぷ"}[kana[0]] + kana[1:]}
    if last == 6 and h_row:
        return {stem[:-2] + "ろっ" + {"ほ": "ぽ", "ひ": "ぴ", "は": "ぱ", "ふ": "ぷ"}[kana[0]] + kana[1:]}
    if last == 3 and voiced:
        return {stem + voiced}
    return {stem + kana}


H_ROW = {"本": "ほん", "匹": "ひき", "杯": "はい", "泊": "はく", "発": "はつ"}
K_ROW = {"個": "こ", "回": "かい", "冊": "さつ", "件": "けん", "軒": "けん", "課": "か", "か月": "かげつ",
         "ヶ月": "かげつ", "カ月": "かげつ", "ヵ月": "かげつ", "歳": "さい", "才": "さい", "足": "そく", "階": "かい",
         "着": "ちゃく", "通": "つう", "頭": "とう", "週間": "しゅうかん", "センチ": "せんち", "キロ": "きろ",
         "キロメートル": "きろめーとる", "キログラム": "きろぐらむ", "点": "てん", "等": "とう", "曲": "きょく",
         "セット": "せっと", "カップ": "かっぷ", "ヶ所": "かしょ", "か所": "かしょ", "箇所": "かしょ", "錠": "じょう",
         "章": "しょう", "社": "しゃ", "席": "せき", "枚目": "まいめ"}
VOICED3 = {"階": "がい", "軒": "げん", "足": "ぞく"}
PLAIN = {"枚": "まい", "台": "だい", "度": "ど", "番": "ばん", "号": "ごう", "秒": "びょう",
         "年": "ねん", "円": "えん", "人前": "にんまえ", "時間": "じかん", "日間": "にちかん", "年間": "ねんかん",
         "分間": "ふんかん", "ページ": "ぺーじ", "バーツ": "ばーつ", "ドル": "どる", "パーセント": "ぱーせんと",
         "メートル": "めーとる", "階建て": "かいだて", "位": "い", "名": "めい", "代": "だい", "倍": "ばい",
         "種類": "しゅるい", "部屋": "へや", "品": "ひん", "問": "もん", "話": "わ", "口": "くち",
         "日目": "にちめ", "番目": "ばんめ", "週目": "しゅうめ", "月": "がつ", "時": "じ", "分": "ふん",
         "日": "にち", "人": "にん", "つ": "つ", "": ""}
TSU = {1: "ひとつ", 2: "ふたつ", 3: "みっつ", 4: "よっつ", 5: "いつつ", 6: "むっつ", 7: "ななつ", 8: "やっつ",
       9: "ここのつ", 10: "とお"}
DAYS = {1: "ついたち", 2: "ふつか", 3: "みっか", 4: "よっか", 5: "いつか", 6: "むいか", 7: "なのか", 8: "ようか",
        9: "ここのか", 10: "とおか", 14: "じゅうよっか", 20: "はつか", 24: "にじゅうよっか"}
COUNTERS = sorted(set(H_ROW) | set(K_ROW) | set(PLAIN) - {""}, key=len, reverse=True)
SPAN_RE = re.compile(r"[0-9][0-9,]*(?:[.:][0-9]+)?(?:" + "|".join(map(re.escape, COUNTERS)) + ")?")


def _int_with(n: int, c: str) -> set:
    if c in ("歳", "才") and n == 20:
        return {"はたち", "にじゅっさい"}
    if c in H_ROW:
        return _gem(n, H_ROW[c], h_row=True)
    if c in K_ROW:
        out = _gem(n, K_ROW[c], VOICED3.get(c) if n % 10 == 3 else None)
        if K_ROW[c][0] in "きせ" and n % 10 == 1 and n % 100 != 11:
            out.add(base(n) + K_ROW[c])        # 1キロ いちきろ / 1セット いちせっと both heard
        return out
    if c == "つ":
        return {TSU[n]} if n in TSU else set()
    if c == "人":
        return {{1: "ひとり", 2: "ふたり"}.get(n, base(n).replace("よん", "よ") + "にん" if n % 10 == 4 else base(n) + "にん")}
    if c == "日":
        out = {base(n) + "にち"}
        if n in DAYS:
            out.add(DAYS[n])
        if n == 1:
            out.add("いちにち")
        return out
    if c == "時":
        return {{4: "よじ", 7: "しちじ", 9: "くじ", 14: "じゅうよじ"}.get(n, base(n) + "じ")}
    if c == "月":
        return {{4: "しがつ", 7: "しちがつ", 9: "くがつ"}.get(n, base(n) + "がつ")}
    if c == "分":
        return _gem(n, "ふん", h_row=True) | ({base(n) + "ふん"} if n % 10 in (2, 5, 7, 9) else set())
    if c in ("年", "円"):
        stem = base(n)
        if n % 10 == 4:
            stem = stem[:-2] + "よ"
        if n % 10 == 9 and c == "年":
            return {stem + "ねん", stem[:-3] + "く" + "ねん"}
        return {stem + PLAIN[c]}
    if c in ("歳", "才") and n == 20:
        return {"はたち", "にじゅっさい"}
    if c in PLAIN:
        return {base(n) + PLAIN[c]}
    return set()


def readings(span: str):
    s = span.replace(",", "")
    m = re.fullmatch(r"([0-9]+):([0-9]{2})", s)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        hr = _int_with(h, "時").pop()
        if mi == 0:
            return {hr}
        out = {hr + x for x in _int_with(mi, "分")}
        if mi == 30:
            out.add(hr + "はん")
        return out
    m = re.fullmatch(r"([0-9]+)\.([0-9]+)(.*)", s)
    if m:
        dec = "".join(D[int(c)] if c != "0" else "ぜろ" for c in m.group(2))
        w = base(int(m.group(1)))
        c = m.group(3)
        suf = PLAIN.get(c) or K_ROW.get(c) or H_ROW.get(c) or ""
        return {w + "てん" + dec + suf}
    m = re.fullmatch(r"([0-9]+)(.*)", s)
    if not m:
        return None
    n, c = int(m.group(1)), m.group(2)
    if c and c not in COUNTERS:
        return None
    r = _int_with(n, c)
    return r or None


if __name__ == "__main__":
    for t in ["3匹", "1日", "8本", "10分", "4人", "9時", "20歳", "300円", "6本", "1,500円", "10:30", "3階", "4月", "2.5キロ", "14日"]:
        print(t, readings(t))
