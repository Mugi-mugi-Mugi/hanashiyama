# -*- coding: utf-8 -*-
"""はなし山: 語りのハルシネーション検査。

検査すること
  1. 事実台帳: ID の重複なし / verified / 出典URL / 原文引用 がそろっている
  2. 語り (手書き台本・自動生成・今日の話) が参照する事実IDが台帳にある
  3. ★語りに出てくる数字は、参照している事実の claim / quote か、生成時の evidence に必ず含まれる
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
     (公開時に docs/ や data/ は含めない = 見た人が開けない。出典は「名前」で書く)

限界 (docs/手順 に記載)
  - 漢数字 (三、五千) は数字として検査しない
  - 固有名詞・言い回しの正しさは人が原文と照合する (台帳の quote を必ず読む)

実行: python tools/validate.py   (失敗があれば終了コード 1)
"""
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
_K = {"〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
      "六": 6, "七": 7, "八": 8, "九": 9}
_UNIT = {"十": 10, "百": 100, "千": 1000}
_BIG = {"万": 10000, "億": 100000000}


def kanji_to_num(t):
    """「二十三」→23 / 「五万」→50000 / 「十一」→11。読めなければ None"""
    total, cur, digit, seen = 0, 0, 0, False
    for ch in t:
        if ch in _K:
            digit = _K[ch]; seen = True
        elif ch in _UNIT:
            cur += (digit or 1) * _UNIT[ch]; digit = 0; seen = True
        elif ch in _BIG:
            total += (cur + digit or 1) * _BIG[ch]; cur = digit = 0; seen = True
        else:
            return None
    return total + cur + digit if seen else None


_KANJI = re.compile(r"[〇零一二三四五六七八九十百千万億]{1,8}")


def norm(s):
    s = s.translate(str.maketrans("０１２３４５６７８９，", "0123456789,"))
    s = re.sub(r"(?<=\d),(?=\d)", "", s)
    # 単位のつく 漢数字だけを 数として 読む (「一つ」「三度」などの 数え方も 含む)
    def rep(m):
        v = kanji_to_num(m.group(0))
        return str(v) if v is not None else m.group(0)
    # ★漢数字を 数として 読むのは ★次の 条件を すべて 満たす ときだけ。
    #   ここを ゆるめると「兼六園」の 六、「四万十川」の 四 を 数として 拾ってしまう。
    #     ・直前が 漢字で ない (= 熟語の 途中では ない)
    #     ・単位 (数える語) が すぐ 後ろに ある
    #     ・「一」ひと文字だけ の ものは 数えない (「一頭」「一年」は たいてい 数えことば)
    s = s.replace("十人が十人", "みなさん")
    return re.sub(r"(?<![一-龥])(" + _KANJI.pattern + r")(?=頭|人|種|株|本|園|件|か所|年|月|日|時間|羽|体|基|席)",
                  lambda m: m.group(0) if m.group(1) == "一" else rep(m), s)


def numbers(s):
    return set(re.findall(r"\d+", norm(s)))


def num_values(s):
    """108.4% は 1 つと数える (2.274 → 1 つ)"""
    return re.findall(r"\d+(?:\.\d+)*", norm(s))


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
        allowed = set()
        for fid in refs:
            if fid in facts:
                allowed |= numbers(facts[fid]["claim"] + " " + facts[fid]["quote"])
        allowed |= numbers(json.dumps(st.get("evidence", []), ensure_ascii=False))
        # 噂の一言に出てよい数字は、その「割れている数字」の値に出てくるものだけ
        allowed |= set((st.get("uwasa") or {}).get("nums", []))
        for t in story_texts(st):
            for n in numbers(t):
                checked_numbers += 1
                if n not in allowed:
                    errors.append("%s: 数字「%s」が参照事実に無い → 「%s」" % (label, n, t[:60]))
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
        # 8. サゲの作法 (docs/参考/20260920_はなし山のサゲ作法.md)
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

        # V1 (禁3 / 法則13): 本文に出す数字は 2 粒まで。残りは出典カードへ
        body = " ".join([st.get("furi", ""), st.get("makura", "")] + hondai_lines(st) + [st.get("sage", "")])
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
    PATHS = re.compile(r"docs/|data/derived|data/raw|app/data|tools/|\.csv|\.md|\.py|\.xlsx")
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

    print("検査した語り: %d 件 / 検査した数字: %d 個 / 事実: %d 件 / 画面に出る文字 %d 本"
          % (len(all_items), checked_numbers, len(facts), n_str))
    for w in warns:
        print("  注意:", w)
    if errors:
        print("NG: %d 件" % len(errors))
        for e in errors:
            print("  ✕", e)
        sys.exit(1)
    print("OK: 語りの数字はすべて出典の事実に含まれ、不採用の言い回し・誘い文句はありません")


if __name__ == "__main__":
    main()
