# -*- coding: utf-8 -*-
"""はなし山: つながりの検査。噺を増やしても つじつまが 合うようにする。

見ること
  1. 矛盾      同じものを指す記述が 違う数を 言っていないか (entities.json の conflicts)
  2. 時制      死亡・移動の記録があるものを 現在形で語っていないか
  3. 注意無視  エンティティの cautions を 破っていないか
  4. 重複      同じエンティティ × 同じ型の噺が 2 つ以上ないか
  5. 孤児      どの噺にも使われていない事実 / どのゴールにも届かない噺
               ★どの噺にも出てこない「登場するもの」(= 次に書く噺の種)
  6. 偏り      どのエンティティに噺が集まっているか (件数の表示のみ)
  7. 取り合わせ ★共起 (同じ噺で一緒に語られた組) が まるかぶりの噺が ないか
  8. 鮮度      ★graph.json が bundle.js より古くないか

実行: python tools/check_graph.py   (NG があれば 終了コード 1)
      先に python tools/build_graph.py を 走らせる
"""
import collections
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

# 現在形で語ってはいけない 言い回し (移動・死亡の記録があるもの)
PRESENT = ["がいます", "がおります", "暮らしています", "で元気", "にいます", "住んでいます"]


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_bundle():
    t = open(P("app", "data", "bundle.js"), encoding="utf-8").read()
    return json.loads(re.search(r"window\.HANASHI = (\{.*\});\s*$", t, re.S).group(1))


def hondai_lines(s):
    """本題は 地の文 (文字列) と 台詞 ({who, text}) が 混ざる (2026-09-22)"""
    return [h if isinstance(h, str) else (h.get("who", "") + "「" + h.get("text", "") + "」")
            for h in s.get("hondai", [])]


def story_text(s):
    q = s.get("question") or {}
    return " ".join([s.get("bridge", ""), s.get("furi", ""), s.get("makura", ""), s.get("sage", ""),
                     s.get("atogaki", ""), q.get("text", "")] + hondai_lines(s))


def main():
    graph = load(P("data", "derived", "graph.json"))
    if not graph:
        sys.exit("graph.json が無い。先に python tools/build_graph.py を実行する")
    ents = (load(P("data", "derived", "entities.json")) or {})
    bundle = load_bundle()
    stories = bundle["stories"] + bundle["prefStories"] + [s for v in bundle["today"].values() for s in v]
    facts = {f["id"]: f for f in bundle["facts"]}

    errors, warns, notes = [], [], []

    # 8. 鮮度: graph.json が いまの bundle.js から 作られたものか
    graph_stories = {n["id"] for n in graph["nodes"] if n.get("kind") == "story"}
    now_stories = {s["id"] for s in stories}
    if graph_stories != now_stories:
        errors.append("graph.json が古い (噺 %d 席 ⇔ いまの bundle %d 席)。先に build_graph.py を実行する"
                      % (len(graph_stories), len(now_stories)))

    # 1. 矛盾
    for c in ents.get("conflicts", []):
        vals = " / ".join("%s (%s)" % (v.get("value"), v.get("source")) for v in c.get("values", []))
        warns.append("矛盾あり: %s → %s ※%s" % (c.get("about"), vals, c.get("advice", "")))

    ent_by_name = {}
    for e in ents.get("entities", []):
        for n in [e["name"]] + e.get("aliases", []):
            ent_by_name[n] = e

    # 2. 時制 / 3. 注意
    for s in stories:
        t = story_text(s)
        for name, e in ent_by_name.items():
            if name not in t:
                continue
            if e.get("state") in ("died", "moved"):
                for w in PRESENT:
                    if w in t:
                        errors.append("%s: 「%s」は%sの記録があるのに現在形「%s」" % (s["id"], name, e["state"], w))
            for c in e.get("cautions", []):
                # 注意書きには「こう言え」と「こう言うな」の両方がある。
                # 「〜」と語らない / 「〜」とは書かない の形だけを 禁止として 読む
                for m in re.finditer(r"「(.+?)」\s*(?:と|を)?\s*(?:は)?\s*(語らない|言わない|書かない|使わない|出さない|入れない|数えない)", c):
                    if m.group(1) and m.group(1) in t:
                        errors.append("%s: 「%s」の注意で禁じた語「%s」を使っている" % (s["id"], name, m.group(1)))

    # 2b. 他所の園に「いまもいる」と書いていないか (公式で確認できるのは在園の記載だけ)
    zoos = [e["name"] for e in ents.get("entities", []) if e.get("type") == "place" and "動物園" in e["name"]]
    zoos += ["旭山", "王子動物園", "多摩動物公園"]
    for s in stories:
        t = story_text(s)
        if not any(z in t for z in zoos):
            continue
        if re.search(r"(いまも|今も|現在)[^。]{0,20}(います|おります|暮らして)", t):
            errors.append("%s: 他所の園に「いまもいる」と書いている (記録で言えるのは過去の移動まで)" % s["id"])

    # 4. 重複 (同じエンティティ × 同じ型)
    pair = collections.defaultdict(list)
    for s in stories:
        t = story_text(s)
        for name, e in ent_by_name.items():
            if name in t:
                pair[(e["id"], s.get("ochiType"))].append(s["id"])
    for (eid, oc), ids in pair.items():
        hand = [i for i in ids if i.startswith("S")]
        if len(hand) > 2:
            warns.append("重複ぎみ: %s の「%s」型が %d 席 (%s)" % (eid, oc, len(hand), ", ".join(hand)))

    # 5. 孤児
    used = {f for s in stories for f in s.get("facts", [])}
    for fid in facts:
        if fid not in used:
            warns.append("使われていない事実: %s %s" % (fid, facts[fid]["claim"][:24]))
    for s in stories:
        if not s.get("card", {}).get("big"):
            errors.append("%s: 札 (ゴール) が無い" % s["id"])

    # 5b. どの噺にも出てこない「登場するもの」= 次に書く噺の種 (graph.json から)
    orphan_ents = graph.get("orphanEntities", [])
    if orphan_ents:
        by_type = collections.Counter(o.get("type") or "?" for o in orphan_ents)
        warns.append("噺に出てこない登場するもの %d 件 (= 次に書く噺の種): %s"
                     % (len(orphan_ents), " / ".join("%s %d" % kv for kv in by_type.most_common())))
        warns.append("  ※「出てこない」は本文にその名前が無いという意味。"
                     "語ってはいるが名前を出していない場合もある (例: 祈りの道 は S05 で「山の中の道」と語っている)")
        has_fact = [o for o in orphan_ents if o.get("facts")]
        if has_fact:
            warns.append("  うち出典つき %d 件 (すぐ噺にできる): %s"
                         % (len(has_fact), " / ".join(o["name"] for o in has_fact[:8])))

    # 7. 取り合わせ: 同じ「組」を同じ型で 2 席以上やっていないか (graph.json の 語る 辺から)
    spoken = collections.defaultdict(set)
    for e in graph["edges"]:
        if e["kind"] == "語る":
            spoken[e["from"]].add(e["to"])
    otype = {s["id"]: s.get("ochiType") for s in stories}
    combo = collections.defaultdict(list)
    for sid, ents_of in spoken.items():
        if len(ents_of) < 2:
            continue
        combo[(tuple(sorted(ents_of)), otype.get(sid))].append(sid)
    gen_dup = 0
    for (key, oc), ids in combo.items():
        if len(ids) < 2:
            continue
        names = " + ".join(graph["labels"].get(k, k) for k in key[:4])
        hand = [i for i in ids if i.startswith("S")]
        if len(hand) > 1:  # 手書き同士が かぶるのは 直す対象
            warns.append("取り合わせがまるかぶり: %s の「%s」型が %d 席 (%s)"
                         % (names, oc, len(hand), ", ".join(sorted(hand))))
        else:
            gen_dup += 1   # 自動生成は 雛形が同じ = 想定内
    if gen_dup:
        notes.append("自動生成の噺で 取り合わせが同じ組: %d 組 (雛形が同じため。手書きと混ざっていないかだけ見る)" % gen_dup)

    # 9. かみ砕きの 抜け (★2026-09-22)
    #    「大名」「老中」「入込数」のような 語を いきなり 出すと、聞く人は 像を 結べない。
    #    その席の どこかに ★かみ砕きの 一言が あるかを 見る (★人が 読んで 直す)
    NEED_KAMI = ["大名", "藩主", "老中", "入封", "石高", "安政の大獄", "西丸",
                 "人流データ", "入込数", "対前年", "千人", "嚮陽渓", "領民", "藩"]
    KAMI = ["たとえるなら", "いまでいえば", "つまり", "と申しますのは", "のことでございます",
            "ということは", "平たく申せば", "言いかえれば", "数え方で", "と申しまして"]
    bare = []
    for s in stories:
        t = story_text(s)
        used = [w for w in NEED_KAMI if w in t]
        if used and not any(k in t for k in KAMI):
            bare.append((s["id"], used[:3]))
    if bare:
        hand = [x for x in bare if x[0].startswith("S")]
        warns.append("かみ砕きの無い席 %d 件 (うち手書き %d 件): 説明の要る語を そのまま 出している"
                     % (len(bare), len(hand)))
        for sid, ws in hand[:6]:
            warns.append("  %s: %s" % (sid, " / ".join(ws)))

    # 10. 時の札 (★2026-09-22 ユーザー指摘「状況の時間がいきなり変わるので読みづらい」)
    #     いまの話と 昔の話が 同じ席に あるのに、移る合図が 無いと 読む人が 迷子になる
    IMA = ["令和", "平成", "いま", "今年", "昨年", "きょう", "今日", "現在", "シーズン"]
    MUKASHI = ["安政", "享保", "明治", "大正", "昭和", "幕末", "江戸", "藩主", "お殿様", "大名", "藩"]
    FUDA = ["話は", "時は", "さかのぼり", "戻ります", "そのころ、", "当時", "むかし", "ころのこと"]
    jump = []
    for s in stories:
        t = story_text(s)
        if any(w in t for w in IMA) and any(w in t for w in MUKASHI) and not any(w in t for w in FUDA):
            jump.append(s["id"])
    if jump:
        hand = [x for x in jump if x.startswith("S")]
        warns.append("時の札が無い席 %d 件 (うち手書き %d 件): いまと昔が同じ席にあるのに移る合図が無い"
                     % (len(jump), len(hand)))
        if hand:
            warns.append("  " + " / ".join(hand[:10]))

    # 11. 会話比率 (法則6: 滑稽噺は 会話が 多い。地の文が 厚いと しみじみに なる)
    thin = []
    for s in stories:
        hon = s.get("hondai") or []
        se = sum(len(h.get("text", "")) for h in hon if not isinstance(h, str))
        ji = sum(len(h) for h in hon if isinstance(h, str))
        if se + ji and s.get("tone") == "滑稽" and se / (se + ji) < 0.5:
            thin.append(s["id"])
    if thin:
        warns.append("滑稽なのに 台詞が 半分未満の席 %d 件 (法則6。地の文を削るか 台詞を足す)" % len(thin))
        warns.append("  " + " / ".join(thin[:10]) + (" ほか" if len(thin) > 10 else ""))

    # 12. 枝雀の 4 分類の 偏り (訂正1)。「謎解き」「合わせ」は ★なるほど止まりに なりやすい
    zk = collections.Counter(s.get("zekai") for s in stories if s.get("zekai"))
    if zk:
        soft = zk.get("謎解き", 0) + zk.get("合わせ", 0)
        notes.append("客の心の動き: " + " / ".join("%s %d" % kv for kv in zk.most_common()) +
                     "  ★なるほど止まり (謎解き+合わせ) = %d 席 (%.0f%%)"
                     % (soft, 100.0 * soft / max(sum(zk.values()), 1)))

    # 6. 偏り
    cnt = collections.Counter()
    for s in stories:
        t = story_text(s)
        for name, e in ent_by_name.items():
            if name in t:
                cnt[e["name"]] += 1
    if cnt:
        notes.append("噺が多いもの: " + " / ".join("%s %d席" % (k, v) for k, v in cnt.most_common(5)))

    print("検査: 噺 %d 席 / 事実 %d 件 / 登場するもの %d 件" % (len(stories), len(facts), len(ent_by_name)))
    for n in notes:
        print("  ", n)
    for w in warns:
        print("  注意:", w)
    if errors:
        print("NG: %d 件" % len(errors))
        for e in errors:
            print("  ✕", e)
        sys.exit(1)
    print("検査に使った graph.json:", graph.get("builtAt"))
    print("OK: 時制・注意・ゴールの取りこぼしはありません" + ("" if not warns else " (注意 %d 件は人が見ること)" % len(warns)))


if __name__ == "__main__":
    main()
