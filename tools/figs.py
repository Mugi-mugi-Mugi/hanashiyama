# -*- coding: utf-8 -*-
"""はなし山: 本題に出す「数字の絵図」(1 席に 1 枚まで) を、参照している事実から決める。

なぜ要るか
  本題が文字だけだと、数字が耳を通り過ぎる。絵図にすると、オチの前に差が見える。
  ★勝手な数字を出さないため、絵図の数値は「その噺が参照している事実」の中のものだけを使う。
  (tools/validate.py が、絵図の数値も語りと同じ検査にかける)

決め方
  FIG_RULES を上から見て、need の事実をぜんぶ参照している噺に、最初に当たった 1 枚を付ける。
  台本 (stories.json) に手書きの fig があれば、そちらを優先する。

形
  {"title": 見出し, "unit": 単位, "note": 出典の断り,
   "items": [{"label": 名前, "value": 数}, ...],
   "when": "hondai" (本題で見せる) / "after" (問いの答え合わせのあとで見せる)}

★when の決め方
  絵図が問いの答えを先に見せてしまう席では "after" にする (先に見せると 問いが成立しない)。
  tools/validate.py が、when="hondai" の絵図に 答えが写っていないかを 検査する。
"""
import re

# ★上にあるものが優先。具体的な絵図を上に置く。
FIG_RULES = [
    {
        "need": ["F62"],
        "title": "令和7年度・西山公園東側の来訪者 — 年に三度の山",
        "unit": "人",
        "items": [("4月12日", 2050), ("5月5日", 4550), ("11月16日", 1310)],
        "note": "鯖江市オープンデータ (人流データ・提供元 Agoop)",
    },
    {
        "need": ["F22"],
        "title": "令和7年度・西山公園東側の来訪者 — いちばん多い日と少ない日",
        "unit": "人",
        "items": [("2025年5月5日", 4550), ("2026年1月24日 (雪)", 0)],
        "note": "鯖江市オープンデータ (人流データ・提供元 Agoop)",
    },
    {
        # ★千人の 棒より 割合の 帯の ほうが 耳と目に 入る (★2026-09-22)
        "need": ["F26", "F30"],
        "title": "令和7年・来たお客のうち 県外から来た人の割合",
        "unit": "%",
        "max": 100,
        "items": [("恐竜博物館・恐竜の森", 94.0), ("西山公園", 25.0)],
        "note": "福井県 観光客入込数 (推計)",
    },
    {
        "need": ["F30"],
        "title": "令和7年・恐竜博物館と恐竜の森 1,562千人の内訳",
        "unit": "千人",
        "items": [("県内から", 94), ("県外から", 1468)],
        "note": "福井県 観光客入込数 (推計)",
    },
    {
        "need": ["F27"],
        "title": "西山公園の入込数の移り変わり",
        "unit": "千人",
        "items": [("令和元年", 899), ("令和5年", 648), ("令和6年", 797), ("令和7年", 864)],
        "note": "福井県 観光客入込数 (推計)",
    },
    {
        "need": ["F26"],
        "title": "令和7年・西山公園 864千人の内訳",
        "unit": "千人",
        "items": [("県内から", 648), ("県外から", 216)],
        "note": "福井県 観光客入込数 (推計)",
    },
    {
        "need": ["F35"],
        "title": "「日本の歴史公園100選」",
        "unit": "",
        "items": [("名前にある数", 100), ("実際に選ばれた数 (か所)", 250)],
        "note": "太田市 公表 / 制度の数え方",
        "when": "after",
    },
    {
        "need": ["F51"],
        "title": "道の駅2階の交流室を 1 時間だけ借りると",
        "unit": "時間",
        "items": [("借りる", 1), ("払うのは", 3)],
        "note": "鯖江市 道の駅西山公園 利用案内",
        "when": "after",
    },
    {
        "need": ["F21"],
        "title": "令和7年度・休日に西山公園を訪れた人",
        "unit": "%",
        "max": 100,
        "items": [("福井県内から", 84)],
        "note": "鯖江市オープンデータ (人流データ・提供元 Agoop)",
    },
    {
        "need": ["F19"],
        "title": "サンドーム福井の来場者 (市議会 答弁・人流データ)",
        "unit": "万人",
        "items": [("令和6年度 全体", 21), ("うちコンサート", 19)],
        "note": "鯖江市議会 会議録",
    },
    {
        "need": ["F38"],
        "title": "つつじ11種 50,025株のうち",
        "unit": "株",
        "items": [("ヒラドツツジ", 31400), ("PGMツツジ", 25)],
        "note": "鯖江市オープンデータ (西山公園のツツジ種類・株数)",
    },
    {
        "need": ["F41"],
        "title": "西山動物園にいる動物の種類 (2025年7月現在)",
        "unit": "種",
        "items": [("けもの", 4), ("鳥", 7)],
        "note": "鯖江市 西山動物園",
    },
    {
        "need": ["F13"],
        "title": "昭和35年・西山公園のスキー場を使った人",
        "unit": "人",
        "items": [("1月・2月", 7000)],
        "note": "鯖江市 西山公園の年表",
    },
    {
        "need": ["F10", "F11"],
        "title": "西山公園のつつじの株数",
        "unit": "株",
        "items": [("昭和33年 (植えはじめ)", 2100), ("いま", 50025)],
        "note": "鯖江市 西山公園の歴史 / つつじ種類・株数",
    },
    {
        "need": ["F16", "F24"],
        "title": "飼育記録 68頭の生まれ月",
        "unit": "頭",
        "items": [("6月生まれ", 40), ("7月生まれ", 24)],
        "note": "鯖江市オープンデータ (レッサーパンダ飼育個体情報)",
    },
]


def _nums(s):
    s = str(s).translate(str.maketrans("０１２３４５６７８９，", "0123456789,"))
    s = re.sub(r"(?<=\d),(?=\d)", "", s)
    return set(re.findall(r"\d+(?:\.\d+)*", s))


def _amounts(s):
    """文字列から 数量を 読む。★「約5万株」= 50000、「2,100株」= 2100 として 読む
       (★これを しなかったため 16 席で 答えが 絵図に 写っていた。2026-09-22)"""
    s = str(s).translate(str.maketrans("０１２３４５６７８９，．", "0123456789,."))
    s = re.sub(r"(?<=\d),(?=\d)", "", s)
    out = set()
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(万|千|百)?", s):
        if not m.group(1):
            continue
        v = float(m.group(1))
        unit = {"万": 10000, "千": 1000, "百": 100}.get(m.group(2))
        out.add(v * unit if unit else v)
        if unit:
            out.add(v)      # 「5万」の 5 そのものも 残す
    return out


def _near(a, b, tol=0.05):
    if a == b:
        return True
    m = max(abs(a), abs(b))
    return m > 0 and abs(a - b) / m <= tol


def spoils(fig, answer):
    """絵図が 問いの答えを 見せてしまうか。★build と validate で 同じものを 使う"""
    ans = _amounts(answer)
    if not ans:
        return False
    vals = [float(i["value"]) for i in fig.get("items", [])]
    shown = set(vals)
    shown |= _amounts(fig.get("title", ""))
    for it in fig.get("items", []):
        shown |= _amounts(it.get("label", ""))
    for a in ans:
        for v in shown:
            if _near(a, v):
                return True
        # ★足し算で 答えが 出てしまう 形 (6月40頭 + 7月24頭 = 64頭。24 席で 起きていた)
        if len(vals) > 1 and _near(a, sum(vals), 0.01):
            return True
    return False


def _when(story, fig):
    """問いの答えを 先に見せてしまうなら、答え合わせのあとに回す"""
    q = story.get("question")
    if not q:
        return "hondai"
    return "after" if spoils(fig, q["choices"][q["answer"]]) else "hondai"


def fig_for(story):
    """噺に絵図を 1 枚つける。手書きの fig があれば そのまま。"""
    if story.get("fig"):
        return story["fig"]
    refs = set(story.get("facts", []))
    for r in FIG_RULES:
        if set(r["need"]) <= refs:
            f = {
                "title": r["title"],
                "unit": r["unit"],
                "note": r["note"],
                "items": [{"label": a, "value": b} for a, b in r["items"]],
            }
            if r.get("max"):
                f["max"] = r["max"]      # 割合の絵図: 全体を 100 として 棒を引く
            if r.get("when"):
                f["when"] = r["when"]    # 手で 出し所を 決めたもの
            return f
    return None


def attach(stories):
    """その場で fig を足し、付いた数を返す"""
    n = 0
    for s in stories:
        f = fig_for(s)
        if f:
            f["when"] = f.get("when") or _when(s, f)
            s["fig"] = f
            n += 1
    return n
