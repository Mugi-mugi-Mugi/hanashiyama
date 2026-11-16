# -*- coding: utf-8 -*-
"""はなし山: 語りの検査 (validate.py) が、わざと壊したものを本当に捕まえるか。

なぜ要るか
  検査は「通った」だけでは信用できない。★通らないはずのものが通らないことを見る。
  2026-09-22 に、検査が通っているのに 40 席で問いの答えが絵図に写っていた。
  そのとき効いていなかった検査を、ここで一本ずつ壊して確かめる。

やり方
  いまの bundle.js を読み、1 か所だけ壊した写しを作って validate.py にかける。
  ★本物の bundle.js は書き換えない (HANASHI_BUNDLE で写しを指す)。

実行: python tools/test_validate.py
"""
import io
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validate                      # ★app.js の文言の検査を 直に 呼ぶ
BUNDLE = os.path.join(ROOT, "app", "data", "bundle.js")
fail = []


def load():
    t = io.open(BUNDLE, encoding="utf-8").read()
    return json.loads(re.search(r"window\.HANASHI = (\{.*\});\s*$", t, re.S).group(1))


def run(mod, name, want_ng=True, expect=None, expect_warn=None):
    """expect = ★その検査が 止めたことを 確かめる 文字列 (別の検査で 落ちて 通った ことに しない)
       expect_warn = ★注意 (warns) として 出たことを 確かめる 文字列"""
    b = load()
    try:
        mod(b)
    except StopIteration:
        print("  --   " + name + " (当てはまる噺が無いので飛ばす)")
        return
    d = tempfile.mkdtemp()
    p = os.path.join(d, "bundle.js")
    with io.open(p, "w", encoding="utf-8", newline=chr(10)) as f:
        f.write("window.HANASHI = " + json.dumps(b, ensure_ascii=False) + ";" + chr(10))
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "validate.py")],
                       capture_output=True,
                       env=dict(os.environ, HANASHI_BUNDLE=p, PYTHONIOENCODING="utf-8"))
    ng = r.returncode != 0
    okk = ng == want_ng
    out = r.stdout.decode("utf-8", "replace")
    if okk and ng and expect:
        okk = any(l.strip().startswith("✕") and expect in l for l in out.splitlines())
        if not okk:
            name += " (★別の検査で 止まった。「" + expect + "」が 出ていない)"
    if okk and expect_warn:
        okk = any(l.strip().startswith("注意:") and expect_warn in l for l in out.splitlines())
        if not okk:
            name += " (★注意「" + expect_warn + "」が 出ていない)"
    print(("  OK   " if okk else "  NG   ") + name)
    if not okk:
        fail.append(name)
    if ng:
        hit = [l.strip() for l in r.stdout.decode("utf-8", "replace").splitlines()
               if l.strip().startswith("✕")][:1]
        for h in hit:
            print("       " + h[:120])


def any_fig(b):
    return next(x for x in b["stories"] if x.get("fig"))


# ---- 語りの数字 ----
def m_num(b):
    any_fig(b)["hondai"].append("その数、9,876,543 でございます。")


def m_fignum(b):
    any_fig(b)["fig"]["items"][0]["value"] = 987654


def m_figtype(b):
    any_fig(b)["fig"]["items"][0]["value"] = "たくさん"


# ---- 問いの答えの先出し ----
def m_spoil_fig(b):
    s = next(x for x in b["stories"] if x.get("fig") and x["fig"].get("when") == "after")
    s["fig"]["when"] = "hondai"


# ---- 画面に出る文字に手元のパス ----
def m_path(b):
    b["facts"][0]["source"] = "docs/調査/20260916_なにか.md"


# ---- 噂の一言 ----
def m_uwasa_num(b):
    s = b["stories"][0]
    s["uwasa"] = {"text": "噂ですが、その数は 8,888 とも申します。", "nums": ["420", "400"]}


def m_uwasa_head(b):
    s = b["stories"][0]
    s["uwasa"] = {"text": "その数は、数え方で変わるそうでございます。", "nums": []}


def m_uwasa_long(b):
    s = b["stories"][0]
    s["uwasa"] = {"text": "噂ですが、" + "あ" * 95, "nums": []}


# ---- サゲの作法 ----
def m_sage_long(b):
    b["stories"][0]["sage"] = "あ" * 60


def m_ochi(b):
    b["stories"][0]["ochiType"] = "なんとなく"


# ---- 誘い文句・不採用の言い回し ----
def m_invite(b):
    b["stories"][0]["atogaki"] = "ぜひ、お越しください。"


def m_rejected(b):
    b["stories"][0]["hondai"].append("なにしろ日本で最も古い公園でございます。")


def m_yen_n(b):
    b["stories"][0]["card"]["big"] = "あ" + chr(92) + "nい"


# ---- 外れの返しの 向き ----
def m_dir(b):
    """★答えが 真ん中の 問いで、向きのある 返しを 出しっぱなしに する。
       ★実際に あった 壊れ方 (S08「19時/21時/23時/朝まで」正解 21時 に
         「もう少し、粘るんでございます」)。★朝まで を 選んだ人には 逆に なる。"""
    st = b["stories"][0]
    st["question"] = {"text": "何時まででしょう。",
                      "choices": ["19時", "日の暮れ", "23時", "25時"], "answer": 1}
    st["reply"] = {"correct": "ご名答。", "wrong": "それが、もっと多いんで。"}
    st.pop("fig", None)


def m_dir_ok(b):
    """★通り越した札に 別の返しを 用意すれば 通る"""
    m_dir(b)
    b["stories"][0]["reply"]["wrongEach"] = [None, None, "それが、その手前で。", "そこまでは。"]


def m_ok(b):
    pass


def m_nophoto(b):
    """★1 席の 写真を わざと 外す (★2026-11-15 に 本物の 台本で 写真の 無い 席が 0 に なった。本物に 頼らない)"""
    for x in b["stories"][0]["scenes"]:
        x.pop("img", None)
        x.pop("img2", None)


def m_genchi_story(b):
    """★謎かけが ふだんの 席を 開こうとする (現地の 席で ない)"""
    next(g for g in b["genchi"] if g["id"] == "G1")["story"] = "S01"


def m_genchi_date(b):
    """★確認日の 書き損じ (「済」と 書いた)"""
    next(g for g in b["genchi"] if g["id"] == "G1")["verified_onsite"] = "済"


def _story(b, sid):
    return next(x for x in b["stories"] if x["id"] == sid)


def m_est_hedge(b):
    """★推計の 数字を 語るのに「推し量った」を 消す (2026-11-14)"""
    s = _story(b, "S09")
    s["hondai"] = [h.replace("携帯の位置から、人の数を推し量った表", "人の数の表") if isinstance(h, str) else h
                   for h in s["hondai"]]
    if s.get("fig"):                          # ★絵図の 足の「推計」も 断りとして 効くので 消す
        s["fig"]["note"] = s["fig"].get("note", "").replace("推計。", "")


def m_est_ban(b):
    """★推計の 0 を「ひとりも来なかった」と 言い切る"""
    _story(b, "S09")["hondai"].append("その日は、ひとりも来なかったんで。")


def m_est_ban_nobody(b):
    """★推計の 0 を サゲで「表の上で誰もいなかった」と 言い切る (監査⑦ B5 で 実際に あった形)"""
    _story(b, "S09")["sage"] = "表の上で誰もいなかったその雪の山に、市の年表は、スキー場。"


def m_est_ban_kyaku(b):
    """★客の 台詞 (思い込み) の「ひとりも」は 止めない"""
    s = _story(b, "S09")
    k = next(h for h in s["hondai"] if isinstance(h, dict) and h.get("who") == "客")
    k["text"] = "雪の日なんて、ひとりも来ないでしょう。"     # ★行の数は 変えない (場面の 区切りが ずれる)


def m_est_flag(b):
    """★出典が 人流データなのに 推計の印を 外す"""
    next(f for f in b["facts"] if f["id"] == "F22").pop("estimate", None)


def m_entity(b):
    """★entities に 紐づかない 事実を 足す (URL は 既存の ものを 借りて CREDITS の 検査を 巻き込まない)"""
    f0 = dict(b["facts"][0])
    f0["id"] = "F99"
    b["facts"].append(f0)


def m_credit(b):
    """★CREDITS に 無い URL の 事実 (id は 既存 = entities の 検査を 巻き込まない)"""
    b["facts"][0]["url"] = "https://example.invalid/not-in-credits"


def m_scene_group(b):
    """★目録に 無い 群を 指す (綴り違い)"""
    b["stories"][0]["scenes"] = [{"head": "", "from": 0, "to": len(b["stories"][0]["hondai"]) - 1, "img": "tsutsuuji"}]


def m_scene_name(b):
    """★群は あるが、その 名前の 写真が 無い"""
    b["stories"][0]["scenes"] = [{"head": "", "from": 0, "to": len(b["stories"][0]["hondai"]) - 1, "img": "panda@いない子"}]


def m_scene_index(b):
    """★群の 枚数を 越えた 番号 (0 始まり。panda は 22 枚なので #99 は 範囲外。★めがね時計の 群は 2026-11-14 に 外した)"""
    b["stories"][0]["scenes"] = [{"head": "", "from": 0, "to": len(b["stories"][0]["hondai"]) - 1, "img": "panda#99"}]


# ---- 場面の 見出し (# 16。2026-11-15) ----
#   ★見出しは いま 全部 空。★書き起こしが 入る 前に、作法が 効くことを ここで 示す
_DIG = re.compile(r"\d|[〇零一二三四五六七八九十百千万億]")


def _head_seat(b):
    """★試験に 使う 席: 本題 5 行以上 / 問いの 答えが 2〜12 字で 数字なし / サゲの 最後の 語が 2〜12 字で 数字なし"""
    for s in b["stories"]:
        q = s.get("question")
        if not q or len(s.get("hondai") or []) < 5:
            continue
        a = q["choices"][q["answer"]]
        w = validate.sage_last_word(s.get("sage", ""))
        if 2 <= len(a) <= 12 and not _DIG.search(a) and 2 <= len(w) <= 12 and not _DIG.search(w) and w not in a and a not in w:
            return s
    raise StopIteration


def _set_heads(s, heads):
    """本題を 見出しの 数で 割った 場面に する (★1 場面目に 写真を 1 枚 残す = 写真の 注意を 巻き込まない)"""
    n, k = len(s["hondai"]), len(heads)
    img = next((x.get("img") for x in s.get("scenes") or [] if isinstance(x, dict) and x.get("img")), None)
    s["scenes"] = [{"head": h, "from": i * n // k, "to": (i + 1) * n // k - 1} for i, h in enumerate(heads)]
    if img:
        s["scenes"][0]["img"] = img


OK_HEADS = ["山の昔ばなし", "名の移り変わり", "いまの姿"]


def m_head_ok(b):
    _set_heads(_head_seat(b), OK_HEADS)


def m_head_long(b):
    _set_heads(_head_seat(b), ["あ" * 17] + OK_HEADS[1:])


def m_head_num(b):
    _set_heads(_head_seat(b), ["2頭の名"] + OK_HEADS[1:])


def m_head_kanji(b):
    _set_heads(_head_seat(b), ["三頭の名"] + OK_HEADS[1:])


def m_head_stage(b):
    _set_heads(_head_seat(b), ["本題の続き"] + OK_HEADS[1:])


def m_head_ans(b):
    s = _head_seat(b)
    _set_heads(s, OK_HEADS[:2] + [s["question"]["choices"][s["question"]["answer"]] + "の話"])


def m_head_sage(b):
    s = _head_seat(b)
    _set_heads(s, OK_HEADS[:2] + [validate.sage_last_word(s["sage"]) + "の噺"])


def m_head_2lines(b):
    _set_heads(_head_seat(b), ["上の段" + chr(10) + "下の段"] + OK_HEADS[1:])


def m_head_few(b):
    """★本題 5 行以上の 席を 2 場面で 済ませる"""
    _set_heads(_head_seat(b), OK_HEADS[:2])


def m_head_many(b):
    """★5 場面 = 注意 (止めない)"""
    _set_heads(_head_seat(b), OK_HEADS + ["その日の空", "帰り道の話"])


# ---- 題 (演目名) の 先回り / 答えの 言い直し / 見出しの 無い 席 (2026-11-15 反論監査② F2・F4 / ③ 重1) ----
def m_title_ans(b):
    """★題に 問いの 答え (前の S49「金曜の顔」の 形)"""
    s = _head_seat(b)
    s["title"] = s["question"]["choices"][s["question"]["answer"]] + "の顔"


def m_title_ans1(b):
    """★答えが 1 字でも 止める (前の S18「桜が先だった」← 答え「桜」)"""
    s = _story(b, "S18")
    s["title"] = "桜が先だった"


def m_title_kanji(b):
    """★漢数字の 題が 答えの 数を 言う (前の S16「二十五株」← 答え「25株」)"""
    s = _story(b, "S16")
    s["question"]["choices"][s["question"]["answer"]] = "25株"
    s["title"] = "二十五株"


def m_title_sage(b):
    """★題が サゲの 最後の 語を 含む (前の S39「寝耳ベンチ」)"""
    s = _head_seat(b)
    s["title"] = validate.sage_last_word(s["sage"])


def m_title_insage(b):
    """★題が サゲの 最後の 句に そのまま ある (前の S19「鳥のほうが多い」の 一部「鳥のほう」= 最後の 語の 検査では 拾えない形)"""
    s = _story(b, "S19")
    s["title"] = "鳥のほう"


def m_title_front_ok(b):
    """★サゲの 前半 (振りの 側) を 題に するのは 通る (S08「アンコールのあと」)"""
    _story(b, "S08")["title"] = "アンコールのあと"


def m_auto_sage_ans(b):
    """★自動の 席の サゲが 問いの 答えを 言い直す (前の 暦の噺 23 席・県の噺)"""
    s = b["prefStories"][0]
    s["sage"] = "その答えが、" + s["question"]["choices"][s["question"]["answer"]] + "。"


def m_fig_after_sage(b):
    """★答えの あとの 図が サゲの 数字を 先に 見せる (前の S16・T-0505)"""
    s = _story(b, "S16")
    s["fig"]["items"].append({"label": "PGMツツジ", "value": 25})


def m_wrong_ans(b):
    """★外れの 返しが 答えを 言う = 注意 (止めない)"""
    s = _story(b, "S33")
    s["reply"]["wrong"] = "それが、" + s["question"]["choices"][s["question"]["answer"]] + "なんで。"


def m_no_scenes(b):
    """★scenes の 無い 自動の 席 (前は 22 席 = 検査が 素通り)"""
    b["prefStories"][0].pop("scenes", None)


def m_no_heads(b):
    """★見出しが 1 本も 無い 席 (前は 自動の 82 席)"""
    for x in b["prefStories"][0]["scenes"]:
        x["head"] = ""


def m_yokoku(b):
    b["prefStories"][0]["yokoku"] = "いいえ"


run(m_title_ans, "題が 問いの 答えを 含む", expect="が 問いの 答え")
run(m_title_ans1, "題が 1 字の 答え (桜) を 含む", expect="が 問いの 答え「桜」")
run(m_title_kanji, "題が 漢数字で 答えの 数を 言う", expect="問いの 答えの 数")
run(m_title_sage, "題が サゲの 最後の 語を 含む", expect="が サゲの 最後の 語")
run(m_title_insage, "題が サゲの 最後の 句に そのまま ある", expect="サゲの 中に そのまま")
run(m_title_front_ok, "サゲの 前半を 題に するのは 通る", want_ng=False)
run(m_auto_sage_ans, "自動の 席の サゲが 答えを 言い直す", expect="言い直している")
run(m_fig_after_sage, "答えの あとの 図が サゲの 数字を 見せる", expect="サゲの 数字")
run(m_wrong_ans, "外れの 返しが 答えを 言う は 注意 (止めない)", want_ng=False, expect_warn="外れの 返し")
run(m_no_scenes, "場面の 無い 自動の 席", expect="場面 (scenes) が 無い")
run(m_no_heads, "見出しが 1 本も 無い 席", expect="見出しが 1 本も 無い")
run(m_yokoku, "yokoku が 真偽で ない", expect="yokoku は")

run(m_head_ok, "作法どおりの 見出しは 通る", want_ng=False)
run(m_head_long, "見出しが 16 字を 越えた", expect="16 字まで")
run(m_head_num, "見出しに 算用数字", expect="見出しに 数字")
run(m_head_kanji, "見出しに 漢数字", expect="見出しに 数字")
run(m_head_stage, "見出しが 段の 名だけ", expect="段の 名だけ")
run(m_head_ans, "見出しが 問いの 答えを 含む", expect="見出しが 問いの 答え")
run(m_head_sage, "見出しが サゲの 最後の 語を 含む", expect="見出しが サゲの 最後の 語")
run(m_head_2lines, "見出しが 2 行", expect="見出しが 2 行")
run(m_head_few, "本題 5 行以上で 場面が 2", expect="見出しの ある 席の 場面が")
run(m_head_many, "場面が 5 は 注意 (止めない)", want_ng=False, expect_warn="場面が 5")
run(m_nophoto, "写真の 無い 席は 注意に 出る (止めない)", want_ng=False, expect_warn="写真の 無い 席")

run(m_num, "出典に無い数字を 語りに 入れた")
run(m_fignum, "出典に無い数字を 絵図に 入れた")
run(m_figtype, "絵図の値が 数でない")
run(m_spoil_fig, "答えが写る絵図を 本題に 出した")
run(m_path, "画面に出る出典に 手元のパスを 書いた")
run(m_uwasa_num, "噂の一言に 出どころに無い数字を 入れた")
run(m_uwasa_head, "噂の一言に 前置きが 無い")
run(m_uwasa_long, "噂の一言が 長すぎる")
run(m_sage_long, "サゲが 長すぎる")
run(m_ochi, "オチの型が 作法に無い語")
run(m_invite, "誘い文句を 入れた")
run(m_rejected, "語らないと決めた言い回しを 入れた")
run(m_yen_n, "改行のつもりの 円記号 n を 文字として 書いた")
run(m_dir, "外れの返しの 向きが 選んだ札と 逆")
run(m_dir_ok, "通り越した札に 別の返しを 書けば 通る", want_ng=False)
run(m_est_hedge, "推計の数字を 断りなしで 語った", expect="推し量った数だという 断り")
run(m_est_ban, "推計の0を「ひとりも来なかった」と 言い切った", expect="言い切っている")
run(m_est_ban_nobody, "推計の0を「表の上で誰もいなかった」と 言い切った", expect="言い切っている")
run(m_est_ban_kyaku, "客の 台詞の「ひとりも」は 思い込みなので 通る", want_ng=False)
run(m_est_flag, "出典が 推計なのに 印 (estimate) が 無い", expect="estimate=true が 無い")
run(m_entity, "entities に 紐づかない 事実を 足した", expect="entities.json に F99")
run(m_credit, "CREDITS に 無い 出典の URL", expect="CREDITS.md に 事実の出典が 無い")
run(m_genchi_story, "謎かけが 現地の席で ない 噺を 開く", expect="現地の席 (genchi) で ない")
run(m_genchi_date, "謎かけの 確認日を 日付で 書かなかった", expect="verified_onsite は null か")
run(m_scene_group, "写真の指定が 目録に 無い 群", expect="の 群が 目録 (_keys.js) に 無い")
run(m_scene_name, "写真の指定の 名前が 群の names に 無い", expect="の 名前が 群の names に 無い")
run(m_scene_index, "写真の指定の 番号が 群の 枚数を 越えた", expect="の 番号が 範囲外")
run(m_ok, "壊していない状態 (ここは通るのが正しい)", want_ng=False)


# ---- 県から 一席目への つなぎ (prefBridge。2026-11-15) ----
def _pb(b, pref):
    return b["prefBridge"][pref]["lines"]


def m_pb_missing(b):
    """★47 県の うち 1 県が 抜けた"""
    del b["prefBridge"]["沖縄県"]


def m_pb_num(b):
    """★表の 割合を 書き違えた (4% → 14%)。★5〜10 は 表の 順位として 台帳に あるので 通ってしまう"""
    ln = _pb(b, "石川県")
    ln[1] = ln[1].replace("4%", "14%")


def m_pb_hedge(b):
    """★推計の 割合を 言う 行から「推し量った」を 消した"""
    ln = _pb(b, "石川県")
    ln[1] = ln[1].replace("推し量った", "まとめた")


def m_pb_hedge_far(b):
    """★断りが 別の 行に だけ ある (数字を 言う 行には 無い) も 止める"""
    ln = _pb(b, "福井県")
    ln[0] = ln[0].replace("推し量った", "まとめた")
    ln[1] = "推し量った話でございますが、" + ln[1]


def m_pb_three(b):
    """★数字を 3 粒 言う"""
    ln = _pb(b, "石川県")
    ln[2] = "福井は84%、平日は93%。" + ln[2]


def m_pb_long(b):
    """★1 行が 60 字を 越える"""
    ln = _pb(b, "北海道")
    ln[0] = ln[0] + "はるばる海を越え、山を越え、峠を越えて、ようやくこの小さな山の麓まで。"


def m_pb_end(b):
    """★最後の 行が 結びに なっていない (特定の 噺を 前提に した 言い方)"""
    _pb(b, "北海道")[-1] = "では、その山の名前の話を。"


def m_pb_ban(b):
    """★表に 載らない 県を「ひとりも来ない」と 言い切る"""
    ln = _pb(b, "沖縄県")
    ln[1] = ln[1] + "ひとりも来ないお国で。"


def m_pb_rejected(b):
    _pb(b, "北海道")[0] = "日本で最も古い公園へ、北海道から。"


def m_pb_invite(b):
    _pb(b, "北海道")[1] = _pb(b, "北海道")[1] + "ぜひ。"


def m_pb_path(b):
    _pb(b, "北海道")[1] = "docs/参考 によりますと、北海道は。"


def m_pb_nopref(b):
    """★県の 名を 言わない (県を 受けた つなぎに なっていない)"""
    b["prefBridge"]["青森県"]["lines"] = [x.replace("青森", "そちら") for x in _pb(b, "青森県")]


def m_pb_fact(b):
    b["prefBridge"]["石川県"]["facts"] = ["F99"]


run(m_pb_missing, "つなぎが 47 県 そろっていない", expect="47 都道府県 そろっていない")
run(m_pb_num, "つなぎの 割合を 書き違えた", expect="つなぎ 石川県: 数字「14」")
run(m_pb_hedge, "つなぎで 推計の 数字を 断りなしで 言った", expect="数字を 言う 行に")
run(m_pb_hedge_far, "つなぎの 断りが 別の 行に だけ ある", expect="つなぎ 福井県: 推計の 数字を 言う 行に")
run(m_pb_three, "つなぎの 数字が 3 粒", expect="つなぎ 石川県: 数字が 3 粒")
run(m_pb_long, "つなぎの 1 行が 60 字を 越えた", expect="つなぎ 北海道: 1 行が")
run(m_pb_end, "つなぎの 最後の 行が 結びで ない", expect="で 結んでいない")
run(m_pb_ban, "つなぎで 推計を「ひとりも」と 言い切った", expect="つなぎ 沖縄県: 推計の事実を 引く つなぎで")
run(m_pb_rejected, "つなぎに 語らないと決めた言い回し", expect="つなぎ 北海道: 不採用の言い回し")
run(m_pb_invite, "つなぎに 誘い文句", expect="つなぎ 北海道: 誘い文句")
run(m_pb_path, "つなぎに 手元のパス", expect="画面に出る文字に手元のパス: bundle.prefBridge")
run(m_pb_nopref, "つなぎが 県の 名を 言わない", expect="県の 名「青森」")
run(m_pb_fact, "つなぎが 台帳に 無い 事実を 引く", expect="つなぎ 石川県: 台帳に無い事実ID")


# ---- オチの 註 (ochiWhat。サゲの 下に「↳ ○○のこと」。2026-11-15) ----
def _pref_story(b, pid):
    return next(x for x in b["prefStories"] if x["id"] == pid)


def _today_story(b, sid):
    return next(x for v in b["today"].values() for x in v if x["id"] == sid)


def m_ow_missing(b):
    _story(b, "S04").pop("ochiWhat", None)


def m_ow_missing_auto(b):
    """★自動の 席 (build.py が 付ける) の 註が 抜けた"""
    _pref_story(b, "P-青森県").pop("ochiWhat", None)


def m_ow_empty(b):
    _today_story(b, "T-1128")["ochiWhat"] = "  "


def m_ow_notstr(b):
    _story(b, "S04")["ochiWhat"] = ["西山公園のつつじ"]


def m_ow_long(b):
    _story(b, "S04")["ochiWhat"] = "西山公園のつつじ" + "の植えはじめ" * 6


def m_ow_koto(b):
    """★「のこと」は 画面が 付ける → 二重に なる"""
    _story(b, "S04")["ochiWhat"] = "西山公園のつつじのこと"


def m_ow_num(b):
    """★参照事実に 無い 数 (台帳は 約5万株・50,025株)"""
    _story(b, "S04")["ochiWhat"] = "西山公園のつつじ（9,876株）"


def m_ow_est(b):
    """★推計 (F21) の 数を 断りなしで 言う"""
    _story(b, "S45")["ochiWhat"] = "西山公園の休日のお客（84%が県内）"


def m_ow_est_ban(b):
    """★推計の 0 を 註で「ひとりも」と 言い切る (★本文には 断りが ある 席)"""
    _today_story(b, "T-0505")["ochiWhat"] = "雪の日、ひとりも来なかった西山公園"


def m_ow_rejected(b):
    _story(b, "S06")["ochiWhat"] = "城の代わりに造った西山公園の庭"


def m_ow_invite(b):
    _story(b, "S06")["ochiWhat"] = "ぜひ見ていただきたい西山公園の庭"


def m_ow_path(b):
    _story(b, "S06")["ochiWhat"] = "docs/参考 に書いた西山公園の庭"


def m_ow_ok(b):
    """★書き換えても 作法どおりなら 通る (推計の 数に 断りつき)"""
    _story(b, "S45")["ochiWhat"] = "西山公園の休日のお客（推し量って84%が県内）"
    _story(b, "S04")["ochiWhat"] = "西山公園のつつじ（約5万株）"


run(m_ow_missing, "オチの 註が 手書きの 席から 抜けた", expect="台本 S04: オチの 註 (ochiWhat) が 無い")
run(m_ow_missing_auto, "オチの 註が 自動の 席から 抜けた", expect="県の話 P-青森県: オチの 註 (ochiWhat) が 無い")
run(m_ow_empty, "オチの 註が 空白だけ", expect="T-1128: オチの 註 (ochiWhat) は 空で ない 文字列")
run(m_ow_notstr, "オチの 註が 文字列で ない", expect="S04: オチの 註 (ochiWhat) は 空で ない 文字列")
run(m_ow_long, "オチの 註が 40 字を 越えた", expect="S04: オチの 註が")
run(m_ow_koto, "オチの 註の 末尾に「のこと」", expect="末尾が「のこと」")
run(m_ow_num, "オチの 註に 台帳に 無い 数", expect="S04: オチの 註の 数字「9876」")
run(m_ow_est, "オチの 註で 推計の 数を 断りなしで 言った", expect="S45: オチの 註が 推計の事実")
run(m_ow_est_ban, "オチの 註で 推計を「ひとりも」と 言い切った", expect="T-0505: オチの 註で 推計を「ひとりも」")
run(m_ow_rejected, "オチの 註に 語らないと決めた言い回し", expect="S06: オチの 註に 不採用の言い回し")
run(m_ow_invite, "オチの 註に 誘い文句", expect="S06: オチの 註に 誘い文句")
run(m_ow_path, "オチの 註に 手元のパス", expect="S06: オチの 註に 手元のパス")
run(m_ow_ok, "オチの 註を 作法どおりに 書き換えた (通るのが正しい)", want_ng=False)


# ---- app.js に 直接 書いてある 文言 (台本では ない = 台帳を 壊しても 試せない) ----
#   ★実際に「……」が 1 本 紛れていた。★台本の検査だけでは 届かない ことの 試験。
for _bad, _why in [("えー、ぜひ お越しください。", "誘い文句"),
                   ("さようで。……それはそれは。", "「……」"),
                   ("docs/参考 を ご覧ください。", "手元のパス")]:
    _e, _n = validate.check_app_text('const a = "' + _bad + '";', ["日本で最も古い公園"])
    _ok = bool(_e)
    print(("  OK   " if _ok else "  NG   ") + "app.js の文言の " + _why + " を 捕まえる")
    if not _ok:
        fail.append("app.js " + _why)
_e, _n = validate.check_app_text('const a = "ふつうの 文言でございます。";', [])
print(("  OK   " if not _e else "  NG   ") + "app.js の まともな文言は 通る")
if _e:
    fail.append("app.js 正常系")

print("FAIL %d 件" % len(fail) if fail else "ALL OK")
sys.exit(1 if fail else 0)
