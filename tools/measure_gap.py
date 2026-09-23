# -*- coding: utf-8 -*-
"""はなし山: オチの「ズレの大きさ」を、共起ネットワークの上で測る。

★2026-09-22 ユーザーの定義
  「ネットワークに乗ってはいるけれど、想像の線上にない (共起として遠い) もの。
   さらに別の情報を加えると、その存在が大きくなって、はっと気が付く。」

★ノードに 何を 使うか (★一度 しくじって 変えた)
  はじめ「登場するものの 名前」で 測ったら、110 席のうち 81 席が 測れなかった。
  理由は 作法 §4⑦ そのもの —— ★良いサゲほど 固有名詞で 落とさない。
  (「鍬」「ドラえもん」「灯り」「ご近所」「駅長」で 落ちている)
  → ★ノードを ★事実 (F##) に 変えた。どの席も 事実は 必ず 参照しているので 全席 測れる。

測り方
  ① まくら側の事実   まくら・枕の文に いちばん 近い 参照事実
  ② サゲ側の事実     サゲの文に いちばん 近い 参照事実
  ③ 遠さ             ①→② が 知識の網で 何歩か
                       ・網の辺 = ★同じ「登場するもの」を 持つ 事実どうし
                       ・★噺の辺は 使わない (その噺が つないだから 近い、の 堂々めぐりを 避ける)
  ④ 共起             ★ほかの 何席が ①と② を 一緒に 参照しているか (多い = 想像の線上)
  ⑤ 効き             その席が 持ちこんだ 事実のうち、②の まわり (同じ登場するものを 持つ) に
                       集まる 本数。★別の情報で 存在が 大きくなる ぶん

  ズレ = 歩数 ÷ (1 + 共起) × 効き
  ★① と ② が 同じ事実なら 歩数 0 = ★サゲが まくらから 動いていない

★測れないもの
  笑うかどうか。これは 遠さの 代理にすぎない。手ごたえは Δq で 測る。

実行: python tools/measure_gap.py        (先に build.py と build_graph.py)
      python tools/measure_gap.py --all  (全席)
"""
import collections
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

FAR_ENOUGH = 1.0     # これ未満は「予想の線上」とみなす
HOP_CAP = 5


def load_bundle():
    t = io.open(P("app", "data", "bundle.js"), encoding="utf-8").read()
    return json.loads(re.search(r"window\.HANASHI = (\{.*\});\s*$", t, re.S).group(1))


def grams(s, n=2):
    s = re.sub(r"[、。「」()（）・\s]", "", s or "")
    return {s[i:i + n] for i in range(max(0, len(s) - n + 1))}


def nearest(text, fids, facts):
    """文に いちばん 近い 事実を 返す (2 文字の 重なりで 測る)"""
    g = grams(text)
    if not g:
        return None
    best, bs = None, -1
    for fid in fids:
        f = facts.get(fid)
        if not f:
            continue
        sc = len(g & grams(f["claim"] + " " + f.get("quote", "")))
        if sc > bs:
            best, bs = fid, sc
    return best


def main(show_all=False):
    graph = json.load(io.open(P("data", "derived", "graph.json"), encoding="utf-8"))
    b = load_bundle()
    facts = {f["id"]: f for f in b["facts"]}
    stories = b["stories"] + b["prefStories"] + [x for v in b["today"].values() for x in v]

    # ---- 知識の網: 同じ「登場するもの」を持つ事実どうしを つなぐ -------
    fact_ents = collections.defaultdict(set)
    ent_facts = collections.defaultdict(set)
    for e in graph["edges"]:
        if e["kind"] == "登場" and e["from"].startswith("F"):
            fact_ents[e["from"]].add(e["to"])
            ent_facts[e["to"]].add(e["from"])
    adj = collections.defaultdict(set)
    for eid, fs in ent_facts.items():
        for a in fs:
            for c in fs:
                if a != c:
                    adj[a].add(c)

    # ---- ほかの席で 一緒に 参照された 回数 -----------------------------
    pair = collections.Counter()
    for s in stories:
        fs = sorted(set(s.get("facts", [])))
        for i in range(len(fs)):
            for j in range(i + 1, len(fs)):
                pair[(fs[i], fs[j])] += 1
                pair[(fs[j], fs[i])] += 1

    def hops(a, c):
        if a == c:
            return 0
        seen, front = {a}, [a]
        for d in range(1, HOP_CAP + 1):
            nxt = []
            for x in front:
                for y in adj[x]:
                    if y in seen:
                        continue
                    if y == c:
                        return d
                    seen.add(y)
                    nxt.append(y)
            if not nxt:
                return None
            front = nxt
        return None

    rows = []
    for s in stories:
        fids = s.get("facts", [])
        hon = [h if isinstance(h, str) else h.get("text", "") for h in s.get("hondai", [])]
        # ★まくらまで + 本題ぜんぶ + 問い = 客が サゲを 聞く 直前までに 知っていること
        head = " ".join([s.get("bridge", ""), s.get("furi", ""), s.get("makura", "")] + hon +
                        [(s.get("question") or {}).get("text", "")])
        a = nearest(head, fids, facts)
        c = nearest(s.get("sage", ""), fids, facts)
        if not a or not c:
            rows.append((0.0, s, "参照事実が取れない", None, 0, 0, a, c))
            continue
        h = hops(a, c)
        n = pair.get((a, c), 0) - 1 if a != c else 0     # 自分の席は 引く
        n = max(n, 0)
        # 効き: サゲ側の事実の まわりに、この席の 事実が 何本 集まるか
        around = adj[c] | {c}
        kiki = len(set(fids) & around)
        if h is None:
            rows.append((0.0, s, "つながっていない", None, n, kiki, a, c))
        else:
            rows.append((h / (1.0 + n) * max(kiki, 1), s, "", h, n, kiki, a, c))

    rows.sort(key=lambda r: -r[0])
    hand = [r for r in rows if r[1]["id"].startswith("S")]

    def line(r):
        sc, s, note, h, n, k, a, c = r
        print("%-16s %6.2f %4s %4s %4s  %s" % (s["id"], sc, "-" if h is None else h, n, k, s["sage"][:30]))
        print("%-16s %s" % ("", note or ("%s → %s%s" % (a, c, "  ★動いていない" if h == 0 else ""))))

    print("ズレ = 歩数 ÷ (1 + ほかの席での共起) × 効き   ★ノードは 事実 (F##)")
    print("★知識の網の 辺 = 同じ「登場するもの」を 持つ 事実どうし (噺の辺は 使わない)")
    print()
    print("席 %d / 手書き %d" % (len(rows), len(hand)))
    print()
    print("%-16s %6s %4s %4s %4s  %s" % ("噺", "ズレ", "歩", "共起", "効き", "サゲ"))
    if show_all:
        for r in rows:
            line(r)
    else:
        print("--- 手書き: ズレが 大きい 6 席 ---")
        for r in hand[:6]:
            line(r)
        print("--- 手書き: ズレが 小さい 6 席 (★直す候補) ---")
        for r in hand[-6:]:
            line(r)

    stuck = [r for r in rows if r[3] == 0]
    lone = [r for r in rows if len(r[1].get("facts", [])) == 1]
    far = [r for r in rows if r[0] >= FAR_ENOUGH]
    ng = [r for r in rows if r[2]]
    print()
    print("ズレ %.1f 以上        : %3d 席 (%.0f%%)" % (FAR_ENOUGH, len(far), 100.0 * len(far) / len(rows)))
    print("サゲが動いていない   : %3d 席 (%.0f%%)  ★まくらと同じ事実に落ちている"
          % (len(stuck), 100.0 * len(stuck) / len(rows)))
    print("  うち 事実 1 本だけ : %3d 席  ★構造上 ズレが 作れない (事実を 1 本 足すか、噺を 統合する)"
          % len([r for r in lone if r[3] == 0]))
    print("測れない             : %3d 席  %s" % (len(ng), collections.Counter(r[2] for r in ng)))
    print("手書きの平均ズレ     : %.2f   自動生成の平均 : %.2f"
          % (sum(r[0] for r in hand) / max(len(hand), 1),
             sum(r[0] for r in rows if not r[1]["id"].startswith("S")) / max(len(rows) - len(hand), 1)))


if __name__ == "__main__":
    main("--all" in sys.argv)
