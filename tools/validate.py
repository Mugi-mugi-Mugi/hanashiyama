# -*- coding: utf-8 -*-
"""はなし山: 語りのハルシネーション検査。

検査すること
  1. 事実台帳: ID の重複なし / verified / 出典URL / 原文引用 がそろっている
  2. 語り (手書き台本・自動生成・今日の話) が参照する事実IDが台帳にある
  3. ★語りに出てくる数字は、参照している事実の quote (出典の原文) か、生成時の evidence に含まれる
     ★claim (作り手の要約。集計・言い換えを含む) にだけ在る数は「注意」として数と一覧を出す (止めない)
     ★どこにも無い数は止める。★位 (千・万・億) は値として読む (5千両 = 5000。figs.py と同じ読み方)
     (問いの選択肢のうち、正解でない選択肢の数字は検査しない = わざと違う数字を並べるため)
  4. 不採用の言い回し (facts.json の rejected) が語りに入っていない
  5. 「来てください」系の誘い文句が入っていない
  6. まくらで「西山公園」の名前を出していない (台本で allow_park_in_makura を立てたものは除く)
  7. 自動生成した「県の話」で、移動した個体を現在形で語っていない
  8. ★絵図 (fig) の数値も 3 と同じ検査にかける / 絵図が問いの答えを先に見せていない
  9. ★噂の一言 (uwasa) は前置きから始まり、数字はその「割れている数字」の値の中のものだけ
  9a. ★振り (furi) は問いの形で終わり、★答えを先に言わない / 数字を入れない
      (何の噺かを名乗り、客の頭に問いを立てる。★「実は〜なんです」と答えを予告しない)
  9b. ★あて推量 (guess) は「書いていない」と断ってから始め、言い切らず、★数字を一切入れない
      (出典に動機が無いとき、噺家が引き受けて推し量る。★事実として語らないための決まり)
 10. ★画面に出る文字に、手元のファイルパスや、文字になった「\\n」が混ざっていない
     (公開時に 作業メモや 生データは 含めない = 見た人が開けない。出典は「名前」で書く)
 16. ★場面の見出し (scenes[].head): 1 行・16 字まで / 数字なし / 段の名だけにしない /
     問いの答え・サゲの最後の語を含めない / 場面 3〜4 (本題 3 行以下は 2 も可)。写真の無い席は注意
     ★見出しの無い席 (scenes が無い / head が 1 本も無い) を残さない (2026-11-15)
 17. ★題 (演目名): 問いの答え・サゲの最後の語・答えの数 (漢数字も) を含めない / サゲの最後の句に題をそのまま置かない
 19. ★県から一席目へのつなぎ (prefBridge): 47 県そろう / 2〜3 行・60 字まで / 数字は参照事実の中だけ・2 粒まで /
     推計の数字を言う行に断り / 言い切り・不採用・誘い文句なし / 県の名を言い「…ひとつ。」で結ぶ
 18. ★答えの言い直し: 答えのあとの図がサゲの数字を見せない / 自動の席のサゲが問いの答えを含まない /
     外れの返しが答えを言うのは注意 / yokoku は true・false だけ
 20. ★オチの註 (ochiWhat。サゲの下に「↳ ○○のこと」): 全席にある / 40 字まで / 末尾に「のこと」を書かない /
     数字は参照事実の中だけ / 推計の数字なら註の中に断り / 不採用・誘い文句・パスなし

限界 (作業メモの 手順書にも 記載)
  - 漢数字は、十・百・千・万を 含む もの (と 2 字以上) は 後ろの 語を 問わず 数として 読む。
    一字の 二〜九は 数えことば (頭・人・名・時・か月 など) が すぐ後ろに あるときだけ 読む。
    地名・固有名 (「千葉」「四万十」「千枚田」「百選」など) は 表 (_KANJI_NAMES) で 外す。
    熟語の 途中 (「兼六園」「鯖江百景」) は 読まない。「一」ひと文字も 読まない
  - 出典の 数を 丸めた 数 (1,829 → 千八百 / 174 → 百七十) は、元の 上 2 桁を 残した ときだけ 通す (注意に 一覧)
  - 数字の無い文 (「年を追うごとにふえる」など) の 正しさは 見ない
  - 固有名詞・言い回しの正しさは人が原文と照合する (台帳の quote を必ず読む)

実行: python tools/validate.py   (失敗があれば終了コード 1)
"""
from collections import defaultdict
import figs
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.environ.get("HANASHI_BUNDLE") or os.path.join(ROOT, "app", "data", "bundle.js")

OCHI_TYPES = {"反転", "落差", "並び", "律儀", "自虐", "回収", "こじつけ"}
SAGE_MAX_CHARS = 48
SAGE_MAX_NUMS = 2
SAGE_DUP_SEATS = 2          # ★同じ サゲを この 席数 以上で 使わない (2026-11-20。# 19b)
ATO_MAX_NUMS = 3

INVITE_WORDS = ["来てください", "お越しください", "おすすめ", "行こう", "ぜひ", "行ってみて", "来てね"]
PRESENT_WORDS = ["暮らしています", "がいます", "に住んでいます", "で元気"]


def load_bundle():
    text = open(BUNDLE, encoding="utf-8").read()
    m = re.search(r"window\.HANASHI = (\{.*\});\s*$", text, re.S)
    if not m:
        sys.exit("bundle.js の形式が想定と違う。先に python tools/build.py を実行する")
    return json.loads(m.group(1))


# ★漢数字 → 算用数字 (2026-09-22)
#   検査が 算用数字しか 見ていなかったため、「三頭」「五万株」と 書けば
#   ★出典の 照合も 粒数の 検査も すり抜けられた。★ここで 同じ土俵に 乗せる。
# ★★位 (千・万・億) は ★値として 読む (2026-11-20。figs.py の _amounts と 同じ 読み方)
#   ★前は「5千両」も「5万両」も 5 と 読み (位を 落とす)、「864千人」を 8641000 と つないで 読んでいた。
#   ★そのため 桁の 誤り (5千両 → 5万両) が 照合を 素通りした。★test_validate の「位」の 試験が 見る。
from decimal import Decimal, InvalidOperation

_K = {"〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
      "六": 6, "七": 7, "八": 8, "九": 9}
_UNIT = {"十": 10, "百": 100, "千": 1000}
_BIG = {"万": 10000, "億": 100000000}


def kanji_to_num(t):
    """「二十三」→23 / 「五万」→50000 / 「十一」→11 / 「二〇二六」→2026。読めなければ None"""
    total, cur, digit, seen, prev_digit = 0, 0, 0, False, False
    for ch in t:
        if ch in _K:
            digit = digit * 10 + _K[ch] if prev_digit else _K[ch]
            seen = True; prev_digit = True
            continue
        prev_digit = False
        if ch in _UNIT:
            cur += (digit or 1) * _UNIT[ch]; digit = 0; seen = True
        elif ch in _BIG:
            total += (cur + digit or 1) * _BIG[ch]; cur = digit = 0; seen = True
        else:
            return None
    return total + cur + digit if seen else None


_KANJI = re.compile(r"[〇零一二三四五六七八九十百千万億]{1,8}")
# ★漢数字を 数として 読む 数えことば (★2026-11-20 に 両・台・円・回・歳・匹・枚・倍・石 を 足した。
#   前は「五千両」と 書けば 数として 読まれず、照合を すり抜けた)
# ★(2026-11-21) 名・分・時・か月 (ヶ月・カ月・ケ月) を 足した。前は「十名→二十名」「九時→十一時」
#   「三か月→五か月」と 書き換えても 照合を すり抜けた (test_validate の「漢数字」の 試験が 見る)
_COUNTERS = r"頭|人|種|株|本|園|件|か所|年|月|日|時間|羽|体|基|席|両|台|円|回|歳|匹|枚|倍|石|名|分|時|か月|ヶ月|カ月|ケ月"
# ★★十・百・千・万・億を 含む 漢数字 (と 2 字以上の 漢数字「二〇二六」) は ★後ろの 語を 問わず 数として 読む (2026-11-21)
#   前は 数えことばが 直後に ある ときだけ 読んだので「百七十を越す→九百七十を越す」「千八百の車→一万八百の車」が 通った。
#   ★代わりに 地名・固有名の 誤読を ★下の 表で 外す (「千枚田」と 同じ 型)。★誤読が 出たら ここに 足す
_KANJI_BIG = r"[〇零一二三四五六七八九十百千万億]*[十百千万億][〇零一二三四五六七八九十百千万億]*|[〇零一二三四五六七八九]{2,8}"
# ★数として 読まない 語 (読みの かなに 置き換える)。★長い 語から 当てる。★直前が 漢数字の ときは 当てない (「二十分に」の「十分に」)
_KANJI_NAMES = sorted([
    ("十人が十人", "みなさん"),
    ("千枚田", "せんまいだ"),         # 石川県の 名物
    ("千葉", "ちば"),
    ("千里浜", "ちりはま"),
    ("九十九島", "くじゅうくしま"),
    ("九十九里", "くじゅうくり"),
    ("十和田", "とわだ"),
    ("四万十", "しまんと"),
    ("二十世紀梨", "にじっせいきなし"),
    ("千歳", "ちとせ"),
    ("千曲", "ちくま"),
    ("八千代", "やちよ"),
    ("千代", "ちよ"),
    ("千鳥", "ちどり"),
    ("十勝", "とかち"),
    ("十日町", "とおかまち"),
    ("百舌鳥", "もず"),
    ("百合", "ゆり"),
    ("八百屋", "やおや"),
    ("百貨店", "ひゃっかてん"),
    ("万博", "ばんぱく"),
    ("万葉", "まんよう"),
    ("百選", "ひゃくせん"),           # 「日本の歴史公園100選」などの 名
    ("十分に", "じゅうぶんに"),     # 「たっぷり」の 意味。★「二十分に」は 直前が 漢数字なので 当たらない
    ("十分な", "じゅうぶんな"),
], key=lambda x: -len(x[0]))
_KANJI_NAMES_RE = [(re.compile(r"(?<![〇零一二三四五六七八九十百千万億])" + re.escape(a)), b) for a, b in _KANJI_NAMES]
# ★直前が 漢字でも 読む 接頭の 字 (「約十名」「毎年十万人」「第三十回」)。★ほかの 漢字の あと (「兼六園」「鯖江百景」) は 読まない
_KANJI_PREFIX = "約計全総毎第年週"   # ★月・日は 入れない (「五月五日」を 2 粒に 数え直さない)
# ★算用数字 + 位の 漢字 (「5千」「864千」「86万4千」「1.5万」)。★位が 1 つも 無い ものは ここでは 読まない
_NUM = r"\d+(?:\.\d+)?"
_MIXED = re.compile(r"(?:(%s)億)?(?:(%s)万)?(?:(%s)千)?(?:(%s)百)?(%s)?" % (_NUM, _NUM, _NUM, _NUM, _NUM))


def _canon(d):
    """Decimal → 照合用の 文字列 (5000 / 108.4 / 0.5)。「08」と「8」も 同じに なる"""
    if d == d.to_integral_value():
        return str(int(d))
    return format(d.normalize(), "f")


def _mixed_value(m):
    g = m.groups()
    if not any(g[:4]):
        return None          # 位が 無い = ただの 算用数字 (あとで 読む)
    v = Decimal(0)
    for x, mul in zip(g, (100000000, 10000, 1000, 100, 1)):
        if x:
            v += Decimal(x) * mul
    return v


def norm(s):
    """語りの 文字列を、数が すべて 算用数字の 値で 書かれた 形に そろえる"""
    s = s.translate(str.maketrans("０１２３４５６７８９，．", "0123456789,."))
    s = re.sub(r"(?<=\d),(?=\d)", "", s)
    # (1) 算用数字 + 位 (5千 / 864千 / 86万4千) を 値に 置き換える
    def mrep(m):
        if not m.group(0):
            return m.group(0)
        v = _mixed_value(m)
        return m.group(0) if v is None else _canon(v)
    s = _MIXED.sub(mrep, s)
    # (2) 単位のつく 漢数字だけを 数として 読む (「一つ」「三度」などの 数え方も 含む)
    def rep(m):
        v = kanji_to_num(m.group(0))
        return str(v) if v is not None else m.group(0)
    # ★漢数字を 数として 読むのは ★次の 条件を すべて 満たす ときだけ。
    #   ここを ゆるめると「兼六園」の 六、「四万十川」の 四 を 数として 拾ってしまう。
    #     ・直前が 漢字で ない (= 熟語の 途中では ない)。★直前が 算用数字でも 読まない ((1) で 読み済み)
    #     ・単位 (数える語) が すぐ 後ろに ある
    #     ・「一」ひと文字だけ の ものは 数えない (「一頭」「一年」は たいてい 数えことば)
    for rx, kana in _KANJI_NAMES_RE:
        s = rx.sub(kana, s)
    before = r"(?:(?<![一-龥\d.])|(?<=[" + _KANJI_PREFIX + r"]))"
    # ★十・百・千・万を 含む もの (と 2 字以上) は 後ろを 問わない。★それ以外 (一字の 二〜九) は 数えことばが 直後に ある ときだけ
    s = re.sub(before + r"(" + _KANJI_BIG + r")", rep, s)
    return re.sub(before + r"(" + _KANJI.pattern + r")(?=" + _COUNTERS + r")",
                  lambda m: m.group(0) if m.group(1) == "一" else rep(m), s)


def num_values(s):
    """語りの 数を 値の 文字列で 並べる (108.4% は 1 つ / 5千両 は 5000 で 1 つ)"""
    out = []
    for x in re.findall(r"\d+(?:\.\d+)?", norm(s)):
        try:
            out.append(_canon(Decimal(x)))
        except InvalidOperation:
            out.append(x)
    return out


def numbers(s):
    return set(num_values(s))


def canon_list(xs):
    """台帳・report が 渡す 数の 文字列 (uwasa の nums など) を 照合用に そろえる"""
    out = set()
    for x in xs:
        out |= numbers(str(x))
    return out


def rounded_from(n, pool):
    """n が pool の どれかを ★丸めた 数なら その 元の 数 (「1,829台」→「千八百」/「174人」→「百七十を越す」)。
    ★丸めは 位を 1 つ 以上 落とした ものだけ、かつ ★元の 数の 上 2 桁は 残す (1,829 → 1,800 は 可、2,000 / 1,000 は 不可)。
    ★桁の 取り違え (5,000 → 50,000) は 丸めに ならないので 止まる"""
    try:
        v = Decimal(n)
    except InvalidOperation:
        return None
    if v != v.to_integral_value() or v < 10:
        return None
    v = int(v)
    k = 0
    while v % (10 ** (k + 1)) == 0:
        k += 1
    if k == 0:
        return None
    unit = 10 ** k
    for m in sorted(pool):
        try:
            mv = Decimal(m)
        except InvalidOperation:
            continue
        if mv == v or mv < unit * 10:
            continue
        down = int(mv // unit) * unit
        half = int((mv + unit // 2) // unit) * unit
        if v in (down, half):
            return m
    return None


def classify_nums(text, src_allowed, claim_allowed, rounded=None):
    """→ (出典 (quote・evidence) に ある 数, claim にだけ ある 数, どこにも 無い 数)。
    ★出典の 数を 丸めた もの (rounded_from) は 出典に ある 扱い、claim の 数を 丸めた ものは claim にだけ ある 扱い。
    ★丸めた 数は rounded (リスト) に (数, 元の数) で 足す (止めないが 数と 一覧を 出す)"""
    ok, claim_only, bad = [], [], []
    for n in sorted(numbers(text)):
        if n in src_allowed:
            ok.append(n)
        elif n in claim_allowed:
            claim_only.append(n)
        else:
            m = rounded_from(n, src_allowed)
            if m is not None:
                ok.append(n)
            else:
                m = rounded_from(n, claim_allowed)
                if m is not None:
                    claim_only.append(n)
            if m is None:
                bad.append(n)
            elif rounded is not None:
                rounded.append((n, m, text))
    return ok, claim_only, bad


def sentences(s):
    return [x for x in re.split(r"[。？?]", s) if x.strip()]


def hondai_lines(st):
    """本題は 地の文 (文字列) と 台詞 ({who, text}) が 混ざる"""
    out = []
    for h in st.get("hondai", []):
        out.append(h if isinstance(h, str) else (h.get("who", "") + "「" + h.get("text", "") + "」"))
    return out


def story_texts(st, include_wrong_choices=False):
    parts = [st.get("bridge", ""), st.get("makura", "")] + hondai_lines(st) + [st.get("sage", ""), st.get("atogaki", "")]
    q = st.get("question")
    if q:
        parts.append(q["text"])
        if include_wrong_choices:
            parts += q["choices"]
        else:
            parts.append(q["choices"][q["answer"]])
    c = st.get("card", {})
    parts += [c.get("top", ""), c.get("big", ""), c.get("bottom", "")]
    r = st.get("reply") or {}
    parts += [r.get("correct", ""), r.get("wrong", "")]
    if st.get("furi"):
        parts.append(st["furi"])
    if st.get("guess"):
        parts.append(st["guess"])
    u = st.get("uwasa") or {}
    if u.get("text"):
        parts.append(u["text"])
    fig = st.get("fig")
    if fig:
        parts.append(fig.get("title", ""))
        parts.append(fig.get("note", ""))
        for it in fig.get("items", []):
            parts.append("%s %s%s" % (it.get("label", ""), it.get("value", ""), fig.get("unit", "")))
    return parts


# ★画面に出る文字のうち、台本では なく app.js に 直接 書いてある もの。
#   ★これまで どの検査も 見ていなかった。実際に「……」が 1 本 紛れていた (2026-09-24 発見)。
#   ★語りの 一部として 読まれるので、台本と 同じ 作法が かかる。
#   ★数字の 検査は かけない (「3 択」「1,000人」など 画面の 案内に 要るため)。
_JP_LITERAL = re.compile(r'"([^"\
]*[぀-ヿ一-鿿][^"\
]*)"')
_APP_PATHS = re.compile(r"docs\/|data/derived|data/raw|app/data|tools/|\.csv|\.md|\.py|\.xlsx")


# ★場面の 見出し (# 16) の 作法 (2026-11-15)
HEAD_MAX = 16
HEAD_NUM = re.compile(r"\d|[〇零一二三四五六七八九十百千万億兆壱弐参]")   # ★漢数字は 熟語の 中でも 止める (「一緒」も)
# ★段の 名。★これと つなぎ (の・と・、 など) だけで できた 見出しは 中身を 言っていない
STAGE_WORDS = sorted(["まくら", "マクラ", "枕", "本題", "ほんだい", "サゲ", "さげ", "オチ", "おち",
                      "続き", "つづき", "その後", "そのあと", "その先", "前半", "後半", "中盤",
                      "はじめ", "始まり", "はじまり", "終わり", "おわり", "結び", "締め", "導入", "場面", "前段"],
                     key=len, reverse=True)
_HEAD_GLUE = re.compile(r"[\sの・、。と「」『』()（）!?！？ー…\-]")
# ★サゲの 最後の 語から 外す 語尾 (「マリンバでございます」→「マリンバ」)。長いものから
_SAGE_TAIL = ("そうでございます", "でございました", "でございます", "ございます", "だそうで", "そうで", "でした", "です")


def _nospace(s):
    return re.sub(r"\s", "", s or "")


def is_stage_only(head):
    s = head
    for w in STAGE_WORDS:
        s = s.replace(w, "")
    return not _HEAD_GLUE.sub("", s)


def sage_last_word(sage):
    """サゲの 最後の 読点「、」の 後ろから 句点の 前まで (語尾の「でございます」等は 外す)"""
    s = (sage or "").strip().rstrip("。．.!?！？ ")
    s = s.rsplit("、", 1)[-1]
    s = _nospace(s).strip("「」『』")
    for t in _SAGE_TAIL:
        if s.endswith(t) and len(s) > len(t):
            s = s[:-len(t)]
            break
    return s


def check_app_text(src, rejected):
    """app.js の 日本語の 文字列を、台本と 同じ 作法で 見る。→ (errors, 見た本数)"""
    out = []
    lines = [s for s in _JP_LITERAL.findall(src) if len(s) >= 6]
    for s in lines:
        if "……" in s:
            out.append("app.js の文言: 「……」を使っている → 「%s」" % s[:40])
        for w in INVITE_WORDS:
            if w in s:
                out.append("app.js の文言: 誘い文句「%s」→ 「%s」" % (w, s[:40]))
        for r in rejected:
            if r in s:
                out.append("app.js の文言: 不採用の言い回し「%s」→ 「%s」" % (r, s[:40]))
        if _APP_PATHS.search(s):
            out.append("app.js の文言: 手元のパスらしきもの → 「%s」" % s[:40])
    return out, len(lines)


_UNIT_AFTER = re.compile(r"(\d+(?:\.\d+)?)\s*(か所|か月|ヶ月|カ月|時間|[頭人種株本園件年月日羽体基席両台円回歳匹枚倍石名分時%％])")


def num_units(s):
    """→ {(値, 単位)} (「5千両」→ ("5000", "両"))。単位の 付かない 数は 入れない"""
    out = set()
    for v, u in _UNIT_AFTER.findall(norm(s)):
        try:
            out.add((_canon(Decimal(v)), "%" if u == "％" else u))
        except InvalidOperation:
            pass
    return out


def digit_slips(text, conly, refs, facts):
    """★claim にだけ ある 数 (conly) の うち、原文 (quote) に ★同じ 単位で 桁だけ 違う 数が ある もの → [(数, 原文の数, 単位)]
    (★2026-11-21。前は 語りと claim を 両方「5万両」に 誤ると、原文が「5千両」でも 注意 1 行で 通った)"""
    if not conly:
        return []
    qunits = set()
    for fid in refs:
        if fid in facts:
            qunits |= num_units(facts[fid]["quote"])
    out = []
    for n, u in sorted(num_units(text)):
        if n not in conly:
            continue
        for m, u2 in sorted(qunits):
            if u2 != u or m == n:
                continue
            try:
                r = Decimal(n) / Decimal(m)
            except (InvalidOperation, ZeroDivisionError):
                continue
            if r in (Decimal(10) ** j for j in (-4, -3, -2, -1, 1, 2, 3, 4)):
                out.append((n, m, u))
    return out


def src_claim_allowed(st, refs, facts):
    """→ (出典の 原文・根拠に ある 数, claim に ある 数)。★台帳に 無い ID は 飛ばす (別の 検査が 止める)"""
    src, claim = set(), set()
    for fid in refs:
        if fid in facts:
            src |= numbers(facts[fid]["quote"])
            claim |= numbers(facts[fid]["claim"])
    src |= numbers(json.dumps(st.get("evidence", []), ensure_ascii=False))
    # 噂の一言に出てよい数字は、その「割れている数字」の値に出てくるものだけ
    src |= canon_list((st.get("uwasa") or {}).get("nums", []))
    return src, claim


def main():
    b = load_bundle()
    errors, warns = [], []

    # 1. 台帳
    facts = {}
    for f in b["facts"]:
        if f["id"] in facts:
            errors.append("台帳: ID重複 " + f["id"])
        facts[f["id"]] = f
        for k in ("claim", "quote", "source", "url"):
            if not f.get(k):
                errors.append("台帳: %s に %s が無い" % (f["id"], k))
        if f.get("verified") is not True:
            errors.append("台帳: %s が verified でない" % f["id"])

    all_items = [("台本", s) for s in b["stories"]] + [("県の話", s) for s in b["prefStories"]]
    for md, lst in b["today"].items():
        all_items += [("今日の話 " + md, s) for s in lst]

    rejected = [r["text"] for r in b["rejected"]]
    checked_numbers = 0
    claim_only = []      # ★(席, 数, 文): 出典の 原文に 無く claim にだけ ある 数 (注意)
    rounded_all = []     # ★(数, 元の数, 文): 出典・claim の 数を 丸めた もの (注意。2026-11-21)
    for kind, st in all_items:
        label = "%s %s" % (kind, st["id"])
        # 2. 事実ID
        refs = st.get("facts", [])
        if not refs:
            errors.append(label + ": 参照する事実IDが無い")
        for fid in refs:
            if fid not in facts:
                errors.append(label + ": 台帳に無い事実ID " + fid)
        # 3. 数字
        #   ★照合の 相手を 2 つに 分ける (2026-11-20)
        #     src   = 出典の 原文 (quote)・生成時の 根拠 (evidence)・噂の 割れている 数 → ここに あれば OK
        #     claim = 作り手が 書いた 要約 (集計・合計・言い換えを 含む) → ここに だけ あれば ★注意 (数と 一覧を 出す)
        #     どちらにも 無い → NG
        #   ★claim だけを 止めに すると 今の 台本で 組み立てが 止まる (約 190 個)。★まず 見える ように する
        src_ok, claim_ok = src_claim_allowed(st, refs, facts)
        for t in story_texts(st):
            ok, conly, bad = classify_nums(t, src_ok, claim_ok, rounded_all)
            checked_numbers += len(ok) + len(conly) + len(bad)
            for n in conly:
                claim_only.append((label, n, t))
            for n in bad:
                errors.append("%s: 数字「%s」が参照事実に無い → 「%s」" % (label, n, t[:60]))
            for n, m, u in digit_slips(t, conly, refs, facts):
                errors.append("%s: 数字「%s%s」は 要約 (claim) にだけ あり、原文 (quote) は「%s%s」(桁だけ 違う) → 「%s」"
                              % (label, n, u, m, u, t[:60]))
        # 4. 不採用の言い回し
        joined = " ".join(story_texts(st, include_wrong_choices=True))
        for r in rejected:
            if r in joined:
                errors.append("%s: 不採用の言い回し「%s」が入っている" % (label, r))
        # 5. 誘い文句
        for w in INVITE_WORDS:
            if w in joined:
                errors.append("%s: 誘い文句「%s」が入っている" % (label, w))
        # 6. まくら
        if "西山公園" in st.get("makura", "") and not st.get("allow_park_in_makura"):
            if not (st.get("hooks", {}).get("prefectures") == ["福井県"]):
                errors.append(label + ": まくらで西山公園の名前を出している")
        # 7. 県の話の時制
        if kind == "県の話":
            for w in PRESENT_WORDS:
                if w in joined:
                    errors.append("%s: 移動した個体を現在形で語っている「%s」" % (label, w))
        # 噺家の返しに 事実を 入れない (相づちだけ)
        r = st.get("reply") or {}
        for k in ("correct", "wrong"):
            if any(ch.isdigit() for ch in norm(r.get(k, ""))):
                errors.append("%s: 噺家の返し(%s)に数字が入っている" % (label, k))
        # 8. サゲの作法 (サゲ作法の 作業メモ §2〜§5)
        sage = st.get("sage", "")
        if len(sentences(sage)) > 1:
            errors.append("%s: サゲが %d 文ある (1 文にする) → 「%s」" % (label, len(sentences(sage)), sage[:40]))
        if len(sage) > SAGE_MAX_CHARS:
            errors.append("%s: サゲが %d 字 (%d 字まで)" % (label, len(sage), SAGE_MAX_CHARS))
        if len(num_values(sage)) > SAGE_MAX_NUMS:
            errors.append("%s: サゲの数値が %d 個 (%d 個まで) → 「%s」" % (label, len(num_values(sage)), SAGE_MAX_NUMS, sage[:40]))
        ato = st.get("atogaki", "")
        if ato:
            if len(sentences(ato)) > 2:
                errors.append("%s: 追い足しが %d 文ある (2 文まで)" % (label, len(sentences(ato))))
            if len(num_values(ato)) > ATO_MAX_NUMS:
                errors.append("%s: 追い足しの数値が %d 個 (%d 個まで)" % (label, len(num_values(ato)), ATO_MAX_NUMS))
        oc = st.get("ochiType")
        if oc and oc not in OCHI_TYPES:
            errors.append("%s: ochiType「%s」は作法に無い語 (%s)" % (label, oc, " / ".join(sorted(OCHI_TYPES))))
        # 9. 問いの答えを、先に言っていないか (数字の答えだけ機械で見られる)
        q0 = st.get("question")
        if q0:
            ans = q0["choices"][q0["answer"]]
            setup = " ".join([st.get("bridge", ""), st.get("makura", "")] + hondai_lines(st))
            av = num_values(ans)
            # 「4,550人」の中の「0人」を拾わないよう、数値そのもので比べる
            if av and set(av) <= set(num_values(setup)):
                errors.append("%s: 問いの答え「%s」を本題で先に言っている" % (label, ans))
        # 7b. 噂の一言 (数字が割れているところを、ネタとして置いたもの)
        uw = (st.get("uwasa") or {}).get("text", "")
        if uw:
            if len(sentences(uw)) > 2:
                errors.append("%s: 噂の一言が %d 文ある (2 文まで)" % (label, len(sentences(uw))))
            if len(num_values(uw)) > 3:
                errors.append("%s: 噂の一言の数値が %d 個 (3 個まで) → 「%s」"
                              % (label, len(num_values(uw)), uw[:34]))
            if len(uw) > 90:
                errors.append("%s: 噂の一言が %d 字 (90 字まで)" % (label, len(uw)))
            if not re.match(r"(噂|うわさ|一説|もっとも|聞くところ|なんでも|ところが|これは)", uw):
                errors.append("%s: 噂の一言に前置きが無い → 「%s」" % (label, uw[:30]))

        # ★実行時に 画面へ 足されるもの (app.js Core.sageExtra) を 勘定に 入れる。
        #   ★サゲの うしろに「(没後N年)」が 付く。★N は その場で 引き算して 作る 数。
        #   ★台本には 書かれていないので、これまで どの検査も 見ていなかった。
        #   ★引き算の 元に なる 年が 参照事実に 無ければ、出どころの 無い 数に なる。
        ys = st.get("yearsSince")
        runtime_extra = ""
        if ys:
            if str(ys) not in allowed:
                errors.append("%s: yearsSince %s の 元に なる 年が 参照事実に 無い "
                              "(実行時に「没後N年」を 作れない)" % (label, ys))
            runtime_extra = "(没後0年)"      # ★値は 日によって 変わる。★1 粒として 数える

        # V1 (禁3 / 法則13): 本文に出す数字は 2 粒まで。残りは出典カードへ
        body = " ".join([st.get("furi", ""), st.get("makura", "")] + hondai_lines(st) +
                        [st.get("sage", "") + runtime_extra])
        if len(num_values(body)) > 2:
            errors.append("%s: 本文の数字が %d 粒 (2 粒まで。残りは出典へ) → %s"
                          % (label, len(num_values(body)), num_values(body)[:6]))
        # V7 (圓朝の表記): 「……」を使わない。間は語尾で作る
        if "……" in " ".join(story_texts(st)) or "……" in (st.get("guess", "") + st.get("furi", "")):
            errors.append(label + ": 「……」を使っている (間は語尾で作る)")
        # V3 (禁1): 教訓で終わらない
        if re.search(r"(が大事|が肝心|たいものです|ではないでしょうか)。?$", st.get("sage", "")):
            errors.append("%s: サゲが教訓で終わっている → 「%s」" % (label, st.get("sage", "")[-24:]))
        # 枝雀の 4 分類 (訂正1)。客の 心の 動きを 別の軸で 持つ
        zk = st.get("zekai")
        if zk and zk not in ("ドンデン", "謎解き", "へん", "合わせ"):
            errors.append("%s: zekai「%s」は 4 分類に無い語 (ドンデン/謎解き/へん/合わせ)" % (label, zk))
        tn = st.get("tone")
        if tn and tn not in ("滑稽", "人情"):
            errors.append("%s: tone「%s」は 滑稽 / 人情 のどちらか" % (label, tn))

        # 9a. 振り (何の噺かを 名乗る)
        fr = st.get("furi", "")
        if fr:
            if not re.search(r"(ご存じで|ご存じですか|でしょうか|お思いで|でございましょう)。?[?？]?$", fr):
                errors.append("%s: 振りが問いの形で終わっていない → 「%s」" % (label, fr[-24:]))
            if any(ch.isdigit() for ch in norm(fr)):
                errors.append("%s: 振りに数字が入っている (掴みに数字を置かない) → 「%s」" % (label, fr[:30]))
            if len(fr) > 60:
                errors.append("%s: 振りが %d 字 (60 字まで)" % (label, len(fr)))
            if len(sentences(fr)) > 1:
                errors.append("%s: 振りが %d 文ある (1 文にする)" % (label, len(sentences(fr))))
            if q0:
                ans = q0["choices"][q0["answer"]]
                if ans and ans in fr:
                    errors.append("%s: 振りが問いの答え「%s」を先に言っている" % (label, ans))

        # 9b. あて推量 (出典に書かれていない「なぜ」を、噺家が引き受けて推し量る)
        gs = st.get("guess", "")
        if gs:
            if not re.match(r"(書いてはおりませんが|書いてございませんが|記録にはございませんが|"
                            r"どこにも書いて|理由は書かれておりませんが|あて推量でございますが)", gs):
                errors.append("%s: あて推量が「書いていない」の断りから始まっていない → 「%s」"
                              % (label, gs[:30]))
            if not re.search(r"(ではないか|ではなかったか|のではないでしょうか|かと存じます|"
                             r"思いたくなります|気がいたします|ように思われます)。?$", gs):
                errors.append("%s: あて推量が言い切りで終わっている (推し量る形にする) → 「%s」"
                              % (label, gs[-30:]))
            if any(ch.isdigit() for ch in norm(gs)):
                errors.append("%s: あて推量に数字が入っている (推量に数字を混ぜない) → 「%s」" % (label, gs[:34]))
            if len(sentences(gs)) > 2:
                errors.append("%s: あて推量が %d 文ある (2 文まで)" % (label, len(sentences(gs))))
            if len(gs) > 100:
                errors.append("%s: あて推量が %d 字 (100 字まで)" % (label, len(gs)))

        # 8. 絵図 (fig)
        fig = st.get("fig")
        if fig:
            if not fig.get("items"):
                errors.append(label + ": 絵図に items が無い")
            for it in fig.get("items", []):
                if not isinstance(it.get("value"), (int, float)):
                    errors.append("%s: 絵図の値が数でない → %s" % (label, it))
                if not it.get("label"):
                    errors.append(label + ": 絵図の項目に label が無い")
            if q0 and fig.get("when", "hondai") == "hondai":
                # ★build (figs.py) と同じ判定を使う。別々に書くと片方だけ通ってしまう
                if figs.spoils(fig, q0["choices"][q0["answer"]]):
                    errors.append("%s: 絵図が問いの答え「%s」を見せている" % (label, q0["choices"][q0["answer"]]))

        # 問いの形
        q = st.get("question")
        if q and not (0 <= q["answer"] < len(q["choices"])):
            errors.append(label + ": 問いの answer が選択肢の範囲外")

        # ★外れの返しの「向き」が、選んだ札と 食い違っていないか (2026-09-23)
        #   ★実際に あった 壊れ方:
        #     「19時 / 21時 / 23時 / 朝まで」正解 21時 に 対して
        #     外れの返しが「もう少し、粘るんでございます」―― ★朝まで を 選んだ人には 逆。
        #   ★向きのある 返しは、答えより 大きい/小さい どちらか 片側にしか 合わない。
        #   ★正解が 両端なら 向きは 一つに 決まるので 問題ない。
        #   ★真ん中なら ★通り越した札に wrongEach で 別の返しを 用意すること。
        if q and q.get("choices"):
            vals, okv = [], []
            for c in q["choices"]:
                m = re.search(r"(\d+(?:\.\d+)?)\s*(万|千)?", c.replace(",", ""))
                v = float(m.group(1)) * {"万": 10000.0, "千": 1000.0}.get(m.group(2) or "", 1.0) if m else None
                vals.append(v)
                if v is not None:
                    okv.append(v)
            ordered = len(okv) >= 3 and all(x < y for x, y in zip(okv, okv[1:]))
            a_i = q["answer"]
            if ordered and 0 < a_i < len(q["choices"]) - 1:
                w = (st.get("reply") or {}).get("wrong") or ""
                each = (st.get("reply") or {}).get("wrongEach") or []
                UP = ["多", "粘", "偏", "方々", "上"]      # 答えは もっと上、と 言っている
                DOWN = ["少", "手前", "前でして", "下"]     # 答えは もっと下、と 言っている
                up, down = any(k in w for k in UP), any(k in w for k in DOWN)
                bad = []
                if up:
                    bad += [j for j in range(a_i + 1, len(q["choices"]))]
                if down:
                    bad += [j for j in range(0, a_i)]
                for j in sorted(set(bad)):
                    if not (j < len(each) and isinstance(each[j], str) and each[j].strip()):
                        errors.append("%s: 外れの返し「%s」が、選んだ札「%s」と 向きが 逆 "
                                      "(reply.wrongEach[%d] を 書くこと)"
                                      % (label, w, q["choices"][j], j))

    # 9. 画面に出る文字に、手元のファイルパスが混ざっていないか
    PATHS = re.compile(r"docs\/|data/derived|data/raw|app/data|tools/|\.csv|\.md|\.py|\.xlsx")
    # ★改行のつもりで 「\\n」を 文字として 書いてしまう 事故 (通算 5 回) を 捕まえる
    YEN_N = "\\n"
    n_str = 0

    def walk(o, where):
        nonlocal n_str
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ("url", "url2") and isinstance(v, str) and v.startswith("http"):
                    continue
                walk(v, where + "." + str(k))
        elif isinstance(o, list):
            for v in o:
                walk(v, where)
        elif isinstance(o, str):
            n_str += 1
            if PATHS.search(o):
                errors.append("画面に出る文字に手元のパス: %s → 「%s」" % (where, o[:70]))
            if YEN_N in o:
                errors.append("改行のつもりの「%s」が文字として入っている: %s → 「%s」"
                              % (YEN_N, where, o[:50]))

    walk(b, "bundle")

    # 12. ★新しい事実が entities.json に 紐づいているか
    #   ★2026-09-25 に F65〜F73 の 9 件が 漏れていた。
    #   ★漏れると ★時制・矛盾・取り合わせ の 検査が その事実に 効かない。
    #   ★しかも 何も 言わずに 通るので 気づけない。
    with open(os.path.join(ROOT, "data", "derived", "entities.json"), encoding="utf-8") as _f:
        ent_src = _f.read()
    orphan = [f["id"] for f in b["facts"] if ('"' + f["id"] + '"') not in ent_src]
    for fid in orphan:
        errors.append("entities.json に %s が 紐づいていない "
                      "(どの 登場するもの の facts にも 無い = つじつまの検査が 効かない)" % fid)

    # 11. ★CREDITS.md に 事実の 出典が 全部 載っているか (★公開される 文書)
    #   ★CREDITS は「出典は 一件ずつ 書いています」と 言い切っている。
    #   ★2026-09-24 に 38 本中 21 本が 抜けていた。手で 書き写す 作りだったため。
    #   → ★いまは tools/build_credits.py が facts.json から 作る。ここは その 見張り。
    with open(os.path.join(ROOT, "CREDITS.md"), encoding="utf-8") as _f:
        credits = _f.read()
    fact_urls = sorted(set(f.get("url", "") for f in b["facts"] if f.get("url")))
    missing_url = [u for u in fact_urls if u.split("?")[0] not in credits]
    for u in missing_url:
        errors.append("CREDITS.md に 事実の出典が 無い → %s "
                      "(python tools/build_credits.py で 直る)" % u[:70])

    # 13. ★推し量った数 (推計) を ★実数として 語っていないか (2026-11-14 見直しで 発覚)
    #   ★人流データの「0人」は 10 人単位に 丸めた 推計で、「誰も来なかった」では ない。
    #     それを「数えた表」「ひとりも来なかった」「訪れた人は0人」と 語っていた (4 席)。
    #   ★9 月に 公園の入場者数 (F69) では 手当てしたのに、同じ型の 人流・入込数には 及ばなかった。
    #   (a) 出典名が 推計なら 印 (estimate) が 要る … ★印の 付け忘れで (b) が 効かなく なるのを 止める
    #   (b) 推計の事実の ★数字を 語る席には、推し量った数だという 断りが 要る
    #   (c) 推計の事実を 引く席で「数えた」「ひとりも来なかった」「訪れた人は」と 言い切らない
    EST_SRC = ("人流データ", "(推計)")
    EST_HEDGE = ("推し量", "推計", "推定")
    #   ★2026-11-15 見直し: 「表の上で ひとりも数えられなかった」「表の上で誰もいなかった」が 通っていた
    #     → 「ひとりも」「誰もいな」を 足した。★客の 台詞 (思い込み) は 見ない。地の文と 噺家の 台詞だけ
    EST_BAN = ("人の数を数えた", "ひとりも来なかった", "訪れた人は", "ひとりも", "誰もいな")
    est_ids = set()
    for f in b["facts"]:
        if any(k in f.get("source", "") for k in EST_SRC) and f.get("estimate") is not True:
            errors.append("事実 %s: 出典が 推計 (%s) なのに estimate=true が 無い"
                          % (f["id"], f.get("source", "")[:40]))
        if f.get("estimate") is True:
            est_ids.add(f["id"])
    est_seats = 0
    for kind, st in all_items:
        mine = [fid for fid in st.get("facts", []) if fid in est_ids]
        if not mine:
            continue
        said = " ".join(story_texts(st))
        nums_said = set(num_values(said))
        nums_est = set()
        for fid in mine:
            nums_est |= set(num_values(facts[fid]["claim"]))
        spoke = sorted(x for x in nums_said & nums_est if x not in ("1", "2", "3"))
        if spoke:
            est_seats += 1
            if not any(h in said for h in EST_HEDGE):
                errors.append("%s %s: 推計の事実 %s の 数字 %s を 語るのに、推し量った数だという 断り (%s) が 無い"
                              % (kind, st["id"], ",".join(mine), spoke[:3], " / ".join(EST_HEDGE)))
        said_ban = " ".join(story_texts(dict(st, hondai=[
            h for h in st.get("hondai", []) if isinstance(h, str) or h.get("who") != "客"])))
        for w in EST_BAN:
            if w in said_ban:
                errors.append("%s %s: 推計の事実を 引く席で「%s」と 言い切っている" % (kind, st["id"], w))

    # 19. ★県から 一席目への つなぎ (prefBridge。2026-11-15)
    #   ★一席目の 前に 噺家が 言う 2〜3 行。★席では ないので ここまでの 検査 (all_items) が 素通り する → ここで 同じ 作法を かける
    #   (a) 47 都道府県 そろっている / 行は 2〜3 本・1 行 60 字まで / 最後の 行は「…ひとつ。」で 結ぶ (どの 席にも 合う 結び)
    #   (b) 事実 ID が 台帳に ある / ★数字は 参照事実の claim・quote の 中の ものだけ (# 3 と 同じ 照合) / 数字は 2 粒まで
    #   (c) ★推計の 事実を 引いて 数字を 言う 行には、その 行の 中に「推し量った」の 断り (# 13 と 同じ 語)
    #   (d) 推計で「ひとりも」「誰もいな」などと 言い切らない / 不採用の 言い回し・誘い文句・「……」を 入れない
    #   (e) その 県の 名を 言う (県を 受けた つなぎで ある こと。福井は「福井」)
    pb = b.get("prefBridge")
    pb_nums = 0
    if not isinstance(pb, dict):
        errors.append("つなぎ (prefBridge) が 無い か 形が 違う ({県: {lines, facts}})")
        pb = {}
    elif sorted(pb) != sorted(b.get("prefectures", [])) or len(pb) != 47:
        errors.append("つなぎ (prefBridge) が 47 都道府県 そろっていない (%d 件。足りない %s)"
                      % (len(pb), " ".join(p for p in b.get("prefectures", []) if p not in pb)[:60]))
    for pref, v in pb.items():
        label = "つなぎ " + pref
        lines = (v or {}).get("lines")
        refs = (v or {}).get("facts")
        if not isinstance(lines, list) or not 2 <= len(lines) <= 3 or not all(isinstance(x, str) and x.strip() for x in lines):
            errors.append("%s: lines は 2〜3 本の 文字列 (%r)" % (label, lines))
            continue
        if not isinstance(refs, list) or not refs:
            errors.append(label + ": 参照する事実IDが無い")
            refs = []
        for fid in refs:
            if fid not in facts:
                errors.append(label + ": 台帳に無い事実ID " + fid)
        src_ok, claim_ok = src_claim_allowed({}, refs, facts)
        est = any(fid in est_ids for fid in refs)
        joined = " ".join(lines)
        for ln in lines:
            if len(ln) > 60:
                errors.append("%s: 1 行が %d 字 (60 字まで) → 「%s」" % (label, len(ln), ln[:30]))
            ok, conly, bad = classify_nums(ln, src_ok, claim_ok, rounded_all)
            pb_nums += len(ok) + len(conly) + len(bad)
            for n in conly:
                claim_only.append((label, n, ln))
            for n in bad:
                errors.append("%s: 数字「%s」が参照事実に無い → 「%s」" % (label, n, ln[:60]))
            for n, m, u in digit_slips(ln, conly, refs, facts):
                errors.append("%s: 数字「%s%s」は 要約 (claim) にだけ あり、原文 (quote) は「%s%s」(桁だけ 違う) → 「%s」"
                              % (label, n, u, m, u, ln[:60]))
            if est and numbers(ln) and not any(h in ln for h in EST_HEDGE):
                errors.append("%s: 推計の 数字を 言う 行に、推し量った数だという 断り (%s) が 無い → 「%s」"
                              % (label, " / ".join(EST_HEDGE), ln[:40]))
        if len(num_values(joined)) > 2:
            errors.append("%s: 数字が %d 粒 (2 粒まで) → %s" % (label, len(num_values(joined)), num_values(joined)[:6]))
        if not re.search(r"ひとつ。$", lines[-1]):
            errors.append("%s: 最後の 行が「…ひとつ。」で 結んでいない (どの 席にも 合う 結びに する) → 「%s」"
                          % (label, lines[-1][-20:]))
        short = pref if pref == "北海道" else pref[:-1]
        if short not in joined:
            errors.append("%s: 県の 名「%s」を 言っていない (県を 受けた つなぎに する)" % (label, short))
        if est:
            for w in EST_BAN:
                if w in joined:
                    errors.append("%s: 推計の事実を 引く つなぎで「%s」と 言い切っている" % (label, w))
        for r in rejected:
            if r in joined:
                errors.append("%s: 不採用の言い回し「%s」が入っている" % (label, r))
        for w in INVITE_WORDS:
            if w in joined:
                errors.append("%s: 誘い文句「%s」が入っている" % (label, w))
        if "……" in joined:
            errors.append(label + ": 「……」を使っている (間は語尾で作る)")

    # 14. ★現地の 謎かけ (genchi) の 台帳 (2026-11-14)
    #   ★出すのは verified_onsite に 日付が 入った ものだけ (app.js)。ここでは 台帳の 形を 見る。
    #   ★開く 席が 現地の 席で ある / 根拠の 事実が 台帳に ある / 答えが 空で ない
    stories_by_id = {s["id"]: s for s in b["stories"]}
    live = 0
    for g in b.get("genchi", []):
        gid = g.get("id", "?")
        v = g.get("verified_onsite")
        if v is not None and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(v)):
            errors.append("現地の謎かけ %s: verified_onsite は null か YYYY-MM-DD (%r)" % (gid, v))
        for fid in g.get("facts", []):
            if fid not in facts or facts[fid].get("verified") is not True:
                errors.append("現地の謎かけ %s: 根拠の事実 %s が 台帳に 無い / 確かめていない" % (gid, fid))
        if not g.get("riddle"):
            continue                       # ★G4 (未定) のように 謎かけの 無い 場所は 形だけ
        st = stories_by_id.get(g.get("story"))
        # ★alt_of が 無いときに None を 並べると、genchi の 無い ふだんの 席 (None) が 通ってしまう
        allowed = [x for x in (gid, g.get("alt_of")) if x]
        if not st or st.get("genchi") not in allowed:
            errors.append("現地の謎かけ %s: 開く席 %s が 無いか、現地の席 (genchi) で ない" % (gid, g.get("story")))
        if not g.get("answers"):
            errors.append("現地の謎かけ %s: 答えが 空" % gid)
        if v:
            live += 1
    for s in b["stories"]:
        if s.get("genchi") and not any(g.get("story") == s["id"] for g in b.get("genchi", [])):
            errors.append("台本 %s: 現地の席 (genchi=%s) なのに 開く 謎かけが 無い (誰にも 届かない)"
                          % (s["id"], s["genchi"]))

    # 15. ★場面 (scenes) の 形と、写真の 指定が 目録 (_keys.js) に ある ものか (2026-11-14 / 2026-11-15 に 場面の 配列へ)
    #   ★scenes = [{head, from, to, img?, img2?, fig?, label?}, ...]。from / to = 本題の 行 (0 始まり・両端を 含む)
    #   ★img / img2 は「群」「群@名前」「群#番号」。★fig は "main" (その席の 図) だけ
    #   ★app.js は 合わない 指定を 黙って 出さない (null 扱い) ので、★書き損じは 画面では 気づけない
    #   → ここで 群・名前・番号を 目録と 突き合わせる
    with open(os.path.join(ROOT, "app", "data", "img", "_keys.js"), encoding="utf-8") as _f:
        _km = re.search(r"window\.HANASHI_IMG_KEYS = (\{.*\});?\s*$", _f.read(), re.S)
    img_small = json.loads(_km.group(1))["small"] if _km else {}
    if not _km:
        errors.append("_keys.js の 形式が 想定と 違う (window.HANASHI_IMG_KEYS = {...} が 無い)")
    scene_seats, scene_spots = 0, 0
    for kind, st in all_items:
        if "scenes" not in st:
            continue
        sc = st["scenes"]
        hon_n = len(st.get("hondai") or [])
        if not isinstance(sc, list) or not sc or not all(isinstance(x, dict) for x in sc):
            errors.append("%s %s: scenes は 場面 {head, from, to, …} の 配列 (%r)" % (kind, st["id"], sc))
            continue
        scene_seats += 1
        # ★本題を すき間・重なり 無く 覆う (0 から 本題の 最後の 行まで)
        want = 0
        for x in sc:
            if not isinstance(x.get("from"), int) or not isinstance(x.get("to"), int) or x["from"] != want or x["to"] < x["from"]:
                errors.append("%s %s: 場面の from / to が 本題を すき間 無く 覆っていない (%r)"
                              % (kind, st["id"], [(y.get("from"), y.get("to")) for y in sc]))
                break
            want = x["to"] + 1
        else:
            if hon_n and want != hon_n:
                errors.append("%s %s: 場面の 最後 (to=%d) が 本題の 最後の 行 (%d) と 合わない" % (kind, st["id"], want - 1, hon_n - 1))
        for x in sc:
            if not isinstance(x.get("head", ""), str):
                errors.append("%s %s: 場面の head は 文字列 (%r)" % (kind, st["id"], x.get("head")))
            if x.get("fig") is not None and (x["fig"] != "main" or not st.get("fig")):
                errors.append("%s %s: 場面の fig は \"main\" (その席に 図が ある とき) だけ (%r)" % (kind, st["id"], x["fig"]))
            if x.get("fig") and x.get("img"):
                errors.append("%s %s: 場面に img と fig を 両方 置かない" % (kind, st["id"]))
        for sp in [x.get(k) for x in sc for k in ("img", "img2")]:
            if sp is None:
                continue
            if not isinstance(sp, str):
                errors.append("%s %s: 写真の指定 は null か 文字列 (%r)" % (kind, st["id"], sp))
                continue
            scene_spots += 1
            m = re.match(r"^([^@#]+)(?:@(.+)|#(.+))?$", sp)
            grp = img_small.get(m.group(1)) if m else None
            if not m or grp is None:
                errors.append("%s %s: 写真の指定 %r の 群が 目録 (_keys.js) に 無い" % (kind, st["id"], sp))
                continue
            if m.group(2) is not None and m.group(2) not in (grp.get("names") or []):
                errors.append("%s %s: 写真の指定 %r の 名前が 群の names に 無い" % (kind, st["id"], sp))
            if m.group(3) is not None:
                n = grp.get("n", 0)
                if not re.match(r"^\d+$", m.group(3)) or not int(m.group(3)) < n:
                    errors.append("%s %s: 写真の指定 %r の 番号が 範囲外 (0〜%d)" % (kind, st["id"], sp, n - 1))

    # 16. ★場面の 見出し (head) の 作法 (2026-11-15。作業計画 §2-4・§2-5)
    #   ★見出しが オチの 先回りに なるのが いちばん 恐い。★空の head は 見ない (書き起こし前 = 画面は 演目名を 出す)
    #   (a) 1 行・16 字まで (スマホの 1 行)  (b) 数字 (算用・漢数字) を 入れない (本文の 数字 2 粒と ぶつかる)
    #   (c) 段の 名 (本題・まくら・サゲ・続き…) だけに しない = 中身を 言う
    #   (d) 問いの 正解の 札 / サゲの 最後の 語 (2 字以上) を 含めない
    #   (e) 見出しの ある 席は 場面 3〜4 (本題 3 行以下は 2 も可)。5 以上は 注意
    #   (f) 1 席に 最低 1 枚 写真 (作者の判断 2026-11-15)。★撮影が 済むまでは 注意 (warns) に とどめる
    #       ★scenes の 無い 席 (自動の 席) は 写真を 画面 (app.js sceneList) が 選ぶ ので ここでは 見ない
    head_seats, head_n = 0, 0
    nophoto, nophoto_seen, auto_seats = [], set(), set()
    for kind, st in all_items:
        sc = st.get("scenes")
        if not isinstance(sc, list) or not sc or not all(isinstance(x, dict) for x in sc):
            if "scenes" not in st:
                auto_seats.add(st["id"])
            continue                       # ★形の 誤りは # 15 が 出す
        label = "%s %s" % (kind, st["id"])
        if not any(x.get("img") or x.get("img2") for x in sc) and st["id"] not in nophoto_seen:
            nophoto_seen.add(st["id"])
            nophoto.append(st["id"])
        heads = [x["head"] for x in sc if isinstance(x.get("head"), str) and x["head"].strip()]
        if not heads:
            continue
        head_seats += 1
        head_n += len(heads)
        q = st.get("question") or {}
        chs, ai = q.get("choices") or [], q.get("answer", -1)
        ans = _nospace(chs[ai]) if isinstance(ai, int) and 0 <= ai < len(chs) else ""
        sw = sage_last_word(st.get("sage", ""))
        for h in heads:
            hk = _nospace(h)
            if "\n" in h or "\r" in h:
                errors.append("%s: 見出しが 2 行 以上 (1 行に する) → %r" % (label, h))
            if len(h.strip()) > HEAD_MAX:
                errors.append("%s: 見出しが %d 字 (%d 字まで) → 「%s」" % (label, len(h.strip()), HEAD_MAX, h))
            if HEAD_NUM.search(h):
                errors.append("%s: 見出しに 数字 (算用・漢数字) が 入っている → 「%s」" % (label, h))
            if is_stage_only(h):
                errors.append("%s: 見出しが 段の 名だけ (中身を 言う) → 「%s」" % (label, h))
            if len(ans) >= 2 and ans in hk:
                errors.append("%s: 見出しが 問いの 答え「%s」を 含む (オチの 先回り) → 「%s」" % (label, ans, h))
            if len(sw) >= 2 and sw in hk:
                errors.append("%s: 見出しが サゲの 最後の 語「%s」を 含む (オチの 先回り) → 「%s」" % (label, sw, h))
        hon_n = len(st.get("hondai") or [])
        lo = 2 if hon_n <= 3 else 3
        if len(sc) < lo:
            errors.append("%s: 見出しの ある 席の 場面が %d (%d〜4 に する。本題 %d 行)" % (label, len(sc), lo, hon_n))
        elif len(sc) > 4:
            warns.append("%s: 場面が %d (4 まで が 目安)" % (label, len(sc)))
        if len(heads) < len(sc):
            warns.append("%s: 見出しの 空の 場面が 混ざる (%d / %d 場面に 見出し)" % (label, len(heads), len(sc)))
    if nophoto:
        warns.append("写真の 無い 席 (1 席に 最低 1 枚。撮影が 済むまで 注意): %d 席 → %s"
                     % (len(nophoto), " ".join(nophoto)))
    # 16g. ★見出しの 無い 席を 残さない (2026-11-15 見直し)
    #   ★自動の 82 席に 見出しが 1 本も 無く、22 席は scenes そのものが 無かった (= ここまでの 検査が 素通り)。
    #   ★11/28 の「もう一席」(P-茨城県・P-福井県) が ちょうど そこに 当たっていた
    for kind, st in all_items:
        sc = st.get("scenes")
        if not isinstance(sc, list) or not sc or not all(isinstance(x, dict) for x in sc):
            errors.append("%s %s: 場面 (scenes) が 無い (見出しの 無い 席を 残さない)" % (kind, st["id"]))
        elif not any(isinstance(x.get("head"), str) and x["head"].strip() for x in sc):
            errors.append("%s %s: 場面の 見出しが 1 本も 無い" % (kind, st["id"]))

    # 17. ★題 (演目名) の 先回り (2026-11-15 見直し)
    #   ★題は めくりに 席の 間 ずっと 出ている (見出しと 同じ 場所・同じ 大きさ)。★#16 は 見出しだけ 見ていた
    #   (a) 問いの 正解の 札を 含まない (1 字でも。「桜が先だった」← 答え「桜」)
    #   (b) サゲの 最後の 語 (2 字以上) を 含まない (「寝耳ベンチ」「達成」)
    #   (c) 正解の 中の 数を 含まない (漢数字も 数に 直して 見る。「二十五株」← 答え「25株」)
    #   (d) 題 (3 字以上) が サゲの 最後の 句 (最後の「、」の 後ろ) に そのまま 入っていない (「鳥のほうが多い」)
    #       ★サゲの 前半 (振りの 側。「アンコールのあとも、」) を 題に するのは 許す
    for kind, st in all_items:
        title = st.get("title") or ""
        tk = _nospace(title)
        if not tk:
            continue
        label = "%s %s" % (kind, st["id"])
        q = st.get("question") or {}
        chs, ai = q.get("choices") or [], q.get("answer", -1)
        ans = _nospace(chs[ai]) if isinstance(ai, int) and 0 <= ai < len(chs) else ""
        sw = sage_last_word(st.get("sage", ""))
        tail = (st.get("sage", "") or "").strip().rstrip("。．.!?！？ ").rsplit("、", 1)[-1]
        sage_k = _nospace(norm(tail))
        if ans and ans in tk:
            errors.append("%s: 題「%s」が 問いの 答え「%s」を 含む (めくりで 先に 出る)" % (label, title, ans))
        if len(sw) >= 2 and sw in tk:
            errors.append("%s: 題「%s」が サゲの 最後の 語「%s」を 含む (めくりで 先に 出る)" % (label, title, sw))
        if ans:
            tnums = set(re.findall(r"\d+", title.translate(str.maketrans("０１２３４５６７８９", "0123456789"))))
            for m in _KANJI.finditer(title):
                v = kanji_to_num(m.group(0))
                if v is not None and m.group(0) != "一":
                    tnums.add(str(v))
            hit = tnums & numbers(chs[ai])
            if hit:
                errors.append("%s: 題「%s」が 問いの 答えの 数 %s を 含む" % (label, title, "/".join(sorted(hit))))
        if len(tk) >= 3 and (tk in _nospace(tail) or _nospace(norm(title)) in sage_k):
            errors.append("%s: 題「%s」が サゲの 中に そのまま ある (めくりが オチを 言う)" % (label, title))

    # 18. ★答えの 言い直し (2026-11-15 見直し。「問いの 答えを サゲで 言い直さない」)
    #   (a) 答え合わせの あとに 出す 図 (when=after) が サゲの 数字を 先に 見せない
    #   (b) ★自動の 席 (県の噺・暦の噺) の サゲは 問いの 答えを そのまま 含まない
    #       (★手書きの 席は 並びの 型 (三つ目が 答え) が あるので 人が 読む)
    #   (c) 外れの 返しが 答えの 語を 言う (注意。外れた 客には そこで 答えが 出る)
    #   (d) yokoku (サゲ前の 予告を 言うか) は true / false だけ
    for kind, st in all_items:
        label = "%s %s" % (kind, st["id"])
        q = st.get("question") or {}
        chs, ai = q.get("choices") or [], q.get("answer", -1)
        ans = chs[ai] if isinstance(ai, int) and 0 <= ai < len(chs) else ""
        f = st.get("fig")
        if f and f.get("when") == "after":
            shown = {str(it.get("value")) for it in f.get("items", [])}
            hit = shown & numbers(st.get("sage", ""))
            if hit:
                errors.append("%s: 答えの あとの 図が サゲの 数字 %s を 先に 見せる" % (label, "/".join(sorted(hit))))
        if kind != "台本" and ans and len(_nospace(ans)) >= 2 and _nospace(ans) in _nospace(st.get("sage", "")):
            errors.append("%s: サゲが 問いの 答え「%s」を 言い直している (答えの 一つ先を 言う)" % (label, ans))
        r = st.get("reply") or {}
        for w in [r.get("wrong")] + list(r.get("wrongEach") or []):
            if w and len(_nospace(ans)) >= 2 and _nospace(ans) in _nospace(w):
                warns.append("%s: 外れの 返し「%s」が 答え「%s」を 言う" % (label, w, ans))
        if "yokoku" in st and not isinstance(st["yokoku"], bool):
            errors.append("%s: yokoku は true / false (%r)" % (label, st["yokoku"]))

    # 19b. ★同じ サゲを 複数の 席で 使わない (2026-11-20 作者の判断「重なったサゲを 調べて 書き分ける」)
    #   ★11/15 に 自動の 席の サゲを 書き直したとき、似た形が まとまり ★異なりが 107 → 88 に 減っていた
    #   (誕生日 23 席が 6 本・県の噺 47 席の 中で 2〜4 席ずつ 同じ 文)。★同じ 文 = 同じ 札 に なる
    #   (a) 句読点・空白を 除いて 同じ 文が 2 席 以上 → 誤り
    #   (b) 県名・「」の 中の 名・数字を 伏せて 同じ 型が 2 席 以上 → 注意 (名前だけ 差し替えた 書き分けは 書き分けに ならない)
    sage_seen, sage_skel = defaultdict(list), defaultdict(list)
    _prefs = sorted(b.get("prefectures", []), key=len, reverse=True)
    for kind, st in all_items:
        sg = st.get("sage") or ""
        if not sg.strip():
            continue
        k0 = re.sub(r"[、。，．,.！？!?\s]", "", sg)
        sage_seen[k0].append(st["id"])
        sk = re.sub(r"「[^」]*」", "「名」", k0)
        for p_ in _prefs:
            sk = sk.replace(p_, "〇県")
        sk = re.sub(r"\d+", "9", sk)
        sage_skel[sk].append((st["id"], k0))
    for k, ids in sage_seen.items():
        if len(ids) >= SAGE_DUP_SEATS:
            errors.append("同じ サゲを %d 席で 使っている (書き分ける) → %s「%s」"
                          % (len(ids), " ".join(ids[:6]), k[:30]))
    for k, pairs in sage_skel.items():
        if len(pairs) >= SAGE_DUP_SEATS and len({t for _, t in pairs}) > 1:   # ★文 そのものが 同じ ものは (a) が 出す
            warns.append("サゲの 型が 名前・県名・数字の 差し替えだけで %d 席 → %s「%s」"
                         % (len(pairs), " ".join(i for i, _ in pairs[:6]), k[:30]))

    # 20. ★オチが 西山公園の 何の ことか (ochiWhat。2026-11-15 作者の案)
    #   ★画面は サゲの すぐ 下に「↳ <ochiWhat>のこと」と 小さく 出す。★story_texts には 入れない
    #     (入れると # 13 の 断りの 判定が「註に 推し量った と ある」で 席 全体を 通して しまう) → ここで 同じ 作法を かける
    #   (a) 全 130 席に ある / 文字列 / 40 字まで / 末尾が「のこと」で ない (画面が 付けるので 二重に なる)
    #   (b) 数字は その席の 参照事実の claim・quote (と evidence) の 中の ものだけ (# 3 と 同じ 照合)
    #   (c) 推計の 事実の 数字を 言うなら ★註の 中に 断り (# 13 と 同じ 語)。推計で「ひとりも」等と 言い切らない
    #   (d) 不採用の 言い回し・誘い文句・「……」・手元の パス・改行を 入れない
    OW_MAX = 40
    ow_n, ow_nums = 0, 0
    for kind, st in all_items:
        label = "%s %s" % (kind, st["id"])
        ow = st.get("ochiWhat")
        if ow is None:
            errors.append("%s: オチの 註 (ochiWhat) が 無い (サゲが 西山公園の 何の ことかを 書く)" % label)
            continue
        if not isinstance(ow, str) or not ow.strip():
            errors.append("%s: オチの 註 (ochiWhat) は 空で ない 文字列 (%r)" % (label, ow))
            continue
        ow_n += 1
        if len(ow) > OW_MAX:
            errors.append("%s: オチの 註が %d 字 (%d 字まで) → 「%s」" % (label, len(ow), OW_MAX, ow[:30]))
        if re.search(r"のこと[。.]?$", ow.strip()):
            errors.append("%s: オチの 註の 末尾が「のこと」(画面が 付ける) → 「%s」" % (label, ow))
        if "\n" in ow or "\r" in ow:
            errors.append("%s: オチの 註に 改行が ある → %r" % (label, ow))
        refs = st.get("facts", [])
        src_ok, claim_ok = src_claim_allowed(st, refs, facts)
        ok, conly, bad = classify_nums(ow, src_ok, claim_ok, rounded_all)
        ow_nums += len(ok) + len(conly) + len(bad)
        for n in conly:
            claim_only.append((label + " (註)", n, ow))
        for n in bad:
            errors.append("%s: オチの 註の 数字「%s」が参照事実に無い → 「%s」" % (label, n, ow))
        for n, m, u in digit_slips(ow, conly, refs, facts):
            errors.append("%s: オチの 註の 数字「%s%s」は 要約 (claim) にだけ あり、原文 (quote) は「%s%s」(桁だけ 違う)"
                          % (label, n, u, m, u))
        mine = [fid for fid in refs if fid in est_ids]
        if mine:
            nums_est = set()
            for fid in mine:
                nums_est |= set(num_values(facts[fid]["claim"]))
            spoke = sorted(x for x in set(num_values(ow)) & nums_est if x not in ("1", "2", "3"))
            if spoke and not any(h in ow for h in EST_HEDGE):
                errors.append("%s: オチの 註が 推計の事実 %s の 数字 %s を 言うのに、推し量った数だという 断り (%s) が 無い → 「%s」"
                              % (label, ",".join(mine), spoke[:3], " / ".join(EST_HEDGE), ow))
            for w in EST_BAN:
                if w in ow:
                    errors.append("%s: オチの 註で 推計を「%s」と 言い切っている" % (label, w))
        for r in rejected:
            if r in ow:
                errors.append("%s: オチの 註に 不採用の言い回し「%s」が入っている" % (label, r))
        for w in INVITE_WORDS:
            if w in ow:
                errors.append("%s: オチの 註に 誘い文句「%s」が入っている" % (label, w))
        if "……" in ow:
            errors.append(label + ": オチの 註に「……」を使っている")
        if PATHS.search(ow):
            errors.append("%s: オチの 註に 手元のパス → 「%s」" % (label, ow))

    # 10. ★画面に出る文字のうち、台本では なく ★app.js に 直接 書いてある もの
    with open(os.path.join(ROOT, "app", "app.js"), encoding="utf-8") as _f:
        appsrc = _f.read()
    app_errors, n_app = check_app_text(appsrc, rejected)
    errors += app_errors

    print("検査した語り: %d 件 / 検査した数字: %d 個 / 事実: %d 件 / 画面に出る文字 %d 本"
          % (len(all_items), checked_numbers, len(facts), n_str))
    print("app.js に 直接 書いてある 文言: %d 本 も 同じ作法で 見た" % n_app)
    print("CREDITS.md と 突き合わせた 出典の URL: %d 本 (足りないもの %d 本)"
          % (len(fact_urls), len(missing_url)))
    print("entities.json に 紐づいた 事実: %d / %d 件"
          % (len(b["facts"]) - len(orphan), len(b["facts"])))
    print("推計の事実: %d 件 / その数字を 語る席: %d 席 (断りを 見た)" % (len(est_ids), est_seats))
    print("つなぎ (県から 一席目へ): %d 県 / 照合した 数字 %d 個" % (len(pb), pb_nums))
    print("現地の謎かけ: %d か所 / うち 現地で 確かめて 画面に 出るもの %d か所"
          % (len(b.get("genchi", [])), live))
    print("写真の指定: %d 席 / %d か所" % (scene_seats, scene_spots))
    print("見出し: %d 席 / %d 本" % (head_seats, head_n))
    print("オチの 註 (ochiWhat): %d / %d 席 / 照合した 数字 %d 個" % (ow_n, len(all_items), ow_nums))
    print("サゲの 異なり: %d / %d 席 (型の 異なり %d。# 19b)" % (len(sage_seen), sum(len(v) for v in sage_seen.values()), len(sage_skel)))
    print("写真の無い席: %d 席 (scenes を 持つ %d 席の 中で。scenes の 無い 自動の 席 %d 席は 画面が 選ぶので 見ていない)"
          % (len(nophoto), scene_seats, len(auto_seats)))
    # ★claim にだけ ある 数 (2026-11-20)。★止めないが、数と 一覧を 毎回 出す
    if claim_only:
        seats = sorted({x[0] for x in claim_only})
        warns.append("語りの 数字の うち、出典の 原文 (quote)・根拠 (evidence) に 無く、作り手の 要約 (claim) に だけ ある もの: "
                     "%d 個 / %d 席 (止めない。下の 一覧。原文を 足すか、語りを 原文の 数に 寄せる)" % (len(claim_only), len(seats)))
    if rounded_all:
        warns.append("丸めた 数 (元の 数の 上 2 桁を 残して 位を 落とした もの。止めない): %d 個 → %s"
                     % (len(rounded_all), " / ".join("%s←%s「%s」" % (n, m, t[:20].replace(chr(10), " ")) for n, m, t in rounded_all)))
    for w in warns:
        print("  注意:", w)
    if claim_only:
        by = defaultdict(list)
        for lab, n, t in claim_only:
            by[lab].append((n, t))
        print("  claim にだけ ある 数 (%d 個):" % len(claim_only))
        for lab in sorted(by):
            print("    %s: %s" % (lab, " / ".join("%s「%s」" % (n, t[:36]) for n, t in by[lab])))
    if errors:
        print("NG: %d 件" % len(errors))
        for e in errors:
            print("  ✕", e)
        sys.exit(1)
    print("OK: 語りの数字はすべて出典の事実に含まれ、不採用の言い回し・誘い文句はありません")


if __name__ == "__main__":
    main()
