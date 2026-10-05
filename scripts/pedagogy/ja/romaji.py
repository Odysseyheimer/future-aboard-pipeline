"""Hepburn romaji from FINAL readings + morphological word boundaries.

It never re-analyses readings - the caller passes each token's approved hiragana.
Spelling follows the kana (long vowels as written: kyou, koukoku; ー doubles the vowel).
Particles は/へ/を (pos1=助詞) -> wa/e/o. 助動詞/接尾辞/接続助詞 attach to the previous word,
接頭辞 to the next.
"""
from __future__ import annotations

import re

T = {}
_rows = {
    "": "あいうえお", "k": "かきくけこ", "s": "さしすせそ", "t": "たちつてと", "n": "なにぬねの",
    "h": "はひふへほ", "m": "まみむめも", "y": "や ゆ よ", "r": "らりるれろ", "w": "わ   を",
    "g": "がぎぐげご", "z": "ざじずぜぞ", "d": "だぢづでど", "b": "ばびぶべぼ", "p": "ぱぴぷぺぽ",
}
for c, row in _rows.items():
    for v, k in zip("aiueo", row):
        if k != " ":
            T[k] = c + v
T.update({"し": "shi", "ち": "chi", "つ": "tsu", "ふ": "fu", "じ": "ji", "ぢ": "ji", "づ": "zu", "を": "o",
          "ん": "n", "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o", "ゃ": "ya", "ゅ": "yu", "ょ": "yo",
          "ゎ": "wa", "ゔ": "vu"})
Y = {"き": "ky", "ぎ": "gy", "し": "sh", "じ": "j", "ち": "ch", "ぢ": "j", "に": "ny", "ひ": "hy", "び": "by",
     "ぴ": "py", "み": "my", "り": "ry"}
SMALL_V = {"ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o"}
LOAN = {"てぃ": "ti", "でぃ": "di", "とぅ": "tu", "どぅ": "du", "ふぁ": "fa", "ふぃ": "fi", "ふぇ": "fe",
        "ふぉ": "fo", "うぃ": "wi", "うぇ": "we", "うぉ": "wo", "しぇ": "she", "じぇ": "je", "ちぇ": "che",
        "ゔぁ": "va", "ゔぃ": "vi", "ゔぇ": "ve", "ゔぉ": "vo", "つぁ": "tsa", "つぇ": "tse", "くぁ": "kwa",
        "いぇ": "ye", "でゅ": "dyu", "ふゅ": "fyu"}
PUNCT = {"。": ".", "、": ",", "？": "?", "！": "!", "「": '"', "」": '"', "『": '"', "』": '"', "（": "(",
         "）": ")", "・": " ", "：": ":", "；": ";", "〜": "~", "～": "~", "…": "...", "　": " ", "―": " - ", "—": " - ", "－": "-", "‐": "-", "〈": "'", "〉": "'", "【": "[", "】": "]", "／": " / ", "％": "%", "＆": "&", "＋": "+", "＝": "=", "＃": "#", "＄": "$", "“": "\"", "”": "\""}
VOWELS = "aeiou"


def kana2romaji(h: str) -> str:
    out = []
    i = 0
    gem = False
    while i < len(h):
        c = h[i]
        two = h[i:i + 2]
        if c == "っ":
            gem = True
            i += 1
            continue
        if c == "ー":
            if out and out[-1] and out[-1][-1] in VOWELS:
                out.append(out[-1][-1])
            i += 1
            continue
        if two in LOAN:
            syl, i = LOAN[two], i + 2
        elif len(two) == 2 and two[1] in "ゃゅょ" and c in Y:
            syl, i = Y[c] + {"ゃ": "a", "ゅ": "u", "ょ": "o"}[two[1]], i + 2
        elif c in T:
            syl, i = T[c], i + 1
        elif c in PUNCT:
            syl, i = PUNCT[c], i + 1
        else:
            syl, i = c, i + 1                      # Latin / anything else verbatim
        if gem:
            if syl.startswith("ch"):
                syl = "t" + syl
            elif syl and syl[0] not in VOWELS and syl[0].isalpha():
                syl = syl[0] + syl
            gem = False
        if out and out[-1].endswith("n") and out[-1][-2:] != "nn" and syl and syl[0] in VOWELS + "y" \
                and prev_is_n(out):
            out[-1] = out[-1] + "'"
        out.append(syl)
    return "".join(out)


def prev_is_n(out: list) -> bool:
    return out[-1] == "n"


ATTACH_PREV_POS = {"助動詞", "接尾辞"}
# compound-verb / adjective tails written as one word after a verb or adjective stem
ATTACH_TAIL = ("すぎ", "過ぎ", "やす", "易", "にく", "難", "づら", "はじめ", "始め", "つづけ", "続け", "おわ", "終わ",
               "だし", "出し", "だす", "出す", "そう")


def assemble(tokens: list[dict], sentence: bool = True) -> str:
    """tokens: [{surface, pos1, pos2, yomi(hiragana)}] in order -> romaji line."""
    words: list[str] = []
    glue_next = False
    carry = ""                                     # token-final っ geminates the next token (上がっ|て)
    prev_p1 = prev_p2 = prev_s = ""
    for t in tokens:
        s, p1, p2, y = t["surface"], t.get("pos1") or "", t.get("pos2") or "", t.get("yomi") or ""
        gem_prev = False
        if carry:
            if y and not all(ch in PUNCT for ch in s) and p1 not in ("補助記号", "空白"):
                y, gem_prev = carry + y, True
            carry = ""
        if y.endswith("っ") and len(y) > 1:
            y, carry = y[:-1], "っ"
        if all(ch in PUNCT for ch in s) or (p1 in ("補助記号", "記号") and not y.strip("、。")):
            mark = "".join(PUNCT.get(ch, ch) for ch in s).strip()
            if mark in ('"',):
                words.append(mark)
            elif mark and words:
                words[-1] += mark
            elif mark:
                words.append(mark)
            continue
        if p1 == "空白":
            continue
        if p1 == "助詞" and s in ("は", "へ", "を") and p2 != "接続助詞":
            r = {"は": "wa", "へ": "e", "を": "o"}[s]
        elif y in ("こんにちは", "こんばんは"):          # greetings: the old particle は reads wa
            r = kana2romaji(y[:-1]) + "wa"
        else:
            r = kana2romaji(y)
        counter = ("助数詞" in p2 or "助数詞" in (t.get("pos3") or "")) and (prev_s == "何" or prev_p2 == "数詞")   # 何度 nando, 三回 sankai
        copula = (t.get("lemma") in ("だ", "です")) if t.get("lemma") else s in ("だ", "です")
        attach = (p1 in ATTACH_PREV_POS and not copula) or \
                 (p1 == "助詞" and p2 == "接続助詞" and s in ("て", "で", "ば")) or glue_next or gem_prev or \
                 (p1 == "助詞" and s in ("たり", "だり")) or counter or \
                 (prev_p1 in ("動詞", "形容詞") and p1 in ("動詞", "形容詞", "接尾辞", "形状詞") and s.startswith(ATTACH_TAIL))
        if attach and words and not words[-1].endswith(('"',)):
            words[-1] += r
        else:
            words.append(r)
        glue_next = p1 == "接頭辞"
        prev_p1, prev_p2, prev_s = p1, p2, s
    line = " ".join(w for w in words if w)
    line = line.replace(" .", ".").replace(" ,", ",").replace(" ?", "?").replace(" !", "!").replace(" - ", "-")
    if sentence and line:
        line = line[0].upper() + line[1:]
        line = re.sub(r'([.!?]"? +"?)([a-z])', lambda m: m.group(1) + m.group(2).upper(), line)
    return line


if __name__ == "__main__":
    for h in ["きょう", "こうこく", "こーひー", "がっこう", "まっちゃ", "きんえん", "ほんや", "てぃーしゃつ", "しゅっぱつ"]:
        print(h, kana2romaji(h))
