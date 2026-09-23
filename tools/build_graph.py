# -*- coding: utf-8 -*-
"""はなし山: 情報のつながり (共起ネットワーク) を組み立てる。

なぜ要るか:
  噺・事実・魅力が増えるほど、同じものを別の噺が別々に語り、つじつまが合わなくなる。
  「誰が・何が・どこが」を明示のデータにして、機械で見張れるようにする。

  出典 ──→ 事実(F) ──→ 噺(S) ──→ 札(ゴール)
              │           ↑
              └→ 登場するもの(E) ←── 魅力台帳(PF)

入力
  app/data/facts.json            事実 (出典つき)
  app/data/stories.json          手書きの噺
  app/data/bundle.js             自動生成ぶんを含む全席
  data/derived/entities.json     登場するもの (別に作る。無ければ claim から機械で拾う)
  data/derived/park_features.json 魅力台帳
出力
  data/derived/graph.json        ノードと辺 / 共起 / 指標

実行: python tools/build_graph.py
"""
import collections
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

# entities.json がまだ無いときに拾う語 (最低限の受け皿)
FALLBACK_ENTITIES = [
    "間部詮勝", "吉田松陰", "ミンファ", "かのこ", "ライト", "アケビ",
    "レッサーパンダ", "嚮陽渓", "祈りの道", "パンダらんど", "こぱんだらんど",
    "道の駅西山公園", "西山動物園", "嚮陽会館", "つつじ", "ヒラドツツジ", "PGMツツジ",
    "桜", "もみじ", "イルミネーション", "日本の歴史公園100選", "村上市", "新宿区",
]


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_bundle():
    text = open(P("app", "data", "bundle.js"), encoding="utf-8").read()
    m = re.search(r"window\.HANASHI = (\{.*\});\s*$", text, re.S)
    return json.loads(m.group(1))


def all_stories(b):
    out = [("手書き", s) for s in b["stories"]]
    out += [("県", s) for s in b["prefStories"]]
    for md, lst in b["today"].items():
        out += [("暦", s) for s in lst]
    return out


def hondai_lines(s):
    """本題は 地の文 (文字列) と 台詞 ({who, text}) が 混ざる (2026-09-22)"""
    return [h if isinstance(h, str) else (h.get("who", "") + "「" + h.get("text", "") + "」")
            for h in s.get("hondai", [])]


def story_text(s):
    q = s.get("question") or {}
    return " ".join(
        [s.get("bridge", ""), s.get("furi", ""), s.get("makura", ""), s.get("sage", ""),
         s.get("atogaki", ""), q.get("text", "")] + hondai_lines(s) + list(q.get("choices", []))
    )


def write_pairs(cooccur, label, co_min=2):
    """2 席以上で 一緒に語られた 組を 書き出す (噂の種を 足すときの 取り合わせ表)"""
    rows = [c for c in cooccur if c["n"] >= co_min]
    dst = P("data", "derived", "cooccur_pairs.md")
    L = []
    L.append("# 一緒に語られている組 (共起) — %d 組" % len(rows))
    L.append("")
    L.append("自動生成: `python tools/build_graph.py` (手で編集しない)")
    L.append("")
    L.append("同じ噂の中で %d 席以上一緒に出てきた組。" % co_min)
    L.append("新しい噂を作るときの「素材の取り合わせ」に使う。")
    L.append("ここに無い組み合わせを選ぶと 新しい取り合わせになる。")
    L.append("")
    L.append("| 組 | 席数 |")
    L.append("|---|---|")
    for c in rows:
        L.append("| %s × %s | %d |" % (label.get(c["a"], c["a"]), label.get(c["b"], c["b"]), c["n"]))
    L.append("")
    with open(dst, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(L))
    print("  書き出し:", dst, "(%d 組)" % len(rows))


def main():
    facts = {f["id"]: f for f in load(P("app", "data", "facts.json"))["facts"]}
    bundle = load_bundle()
    stories = all_stories(bundle)
    ents_file = load(P("data", "derived", "entities.json"))
    features = (load(P("data", "derived", "park_features.json")) or {}).get("items", [])

    # ---- ノード -------------------------------------------------------
    nodes, edges = [], []
    for fid, f in facts.items():
        nodes.append({"id": fid, "kind": "fact", "label": f["claim"][:28], "confidence": f.get("confidence")})
        edges.append({"from": fid, "to": "src:" + f["url"], "kind": "出典"})
        nodes.append({"id": "src:" + f["url"], "kind": "source", "label": f.get("source", "")[:26]})
    for kind, s in stories:
        nodes.append({"id": s["id"], "kind": "story", "label": s.get("title", s["id"]), "group": kind,
                      "ochiType": s.get("ochiType")})
        for fid in s.get("facts", []):
            edges.append({"from": s["id"], "to": fid, "kind": "参照"})
        goal = s["card"]["big"].replace("\n", "")
        nodes.append({"id": "goal:" + goal, "kind": "goal", "label": goal})
        edges.append({"from": s["id"], "to": "goal:" + goal, "kind": "ゴール"})

    # ---- 登場するもの --------------------------------------------------
    if ents_file:
        ent_list = ents_file["entities"]
        for e in ent_list:
            nodes.append({"id": e["id"], "kind": "entity", "label": e["name"], "type": e.get("type"),
                          "state": e.get("state"), "cautions": e.get("cautions", [])})
            for fid in e.get("facts", []):
                edges.append({"from": fid, "to": e["id"], "kind": "登場"})
            for pf in e.get("features", []):
                edges.append({"from": pf, "to": e["id"], "kind": "登場"})
        names = {e["name"]: e["id"] for e in ent_list}
        for e in ent_list:
            for a in e.get("aliases", []):
                names[a] = e["id"]
    else:  # entities.json が無いときの受け皿
        names = {}
        for i, w in enumerate(FALLBACK_ENTITIES):
            eid = "E%03d" % (i + 1)
            names[w] = eid
            nodes.append({"id": eid, "kind": "entity", "label": w, "type": "auto"})
        for fid, f in facts.items():
            for w, eid in names.items():
                if w in f["claim"] + f["quote"]:
                    edges.append({"from": fid, "to": eid, "kind": "登場"})

    for pf in features:
        nodes.append({"id": pf["id"], "kind": "feature", "label": pf["name"], "category": pf.get("category")})

    # 噺 → 登場するもの (本文に名が出ていれば)
    for kind, s in stories:
        t = story_text(s)
        for w, eid in names.items():
            if w in t:
                edges.append({"from": s["id"], "to": eid, "kind": "語る"})

    # ---- 共起 (同じ噺で一緒に語られた組) --------------------------------
    co = collections.Counter()
    for kind, s in stories:
        t = story_text(s)
        hit = sorted({eid for w, eid in names.items() if w in t})
        for i in range(len(hit)):
            for j in range(i + 1, len(hit)):
                co[(hit[i], hit[j])] += 1
    cooccur = [{"a": a, "b": b, "n": n} for (a, b), n in co.most_common()]

    # ---- 噺に一度も出てこない「登場するもの」= 次に書く噺の種 --------
    spoken = {e["to"] for e in edges if e["kind"] == "語る"}
    orphans = [{"id": e["id"], "name": e["name"], "type": e.get("type"),
                "facts": e.get("facts", []), "features": e.get("features", [])}
               for e in (ents_file["entities"] if ents_file else [])
               if e["id"] not in spoken]

    label = {n["id"]: n.get("label", n["id"]) for n in nodes}
    out = {
        "builtAt": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M"),
        "nodes": list({n["id"]: n for n in nodes}.values()),
        "edges": edges,
        "cooccur": cooccur,
        "orphanEntities": orphans,
        "labels": label,
    }
    dst = P("data", "derived", "graph.json")
    with open(dst, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    write_pairs(cooccur, label, co_min=2)

    kinds = collections.Counter(n["kind"] for n in out["nodes"])
    print("built:", dst)
    print("  ノード", len(out["nodes"]), dict(kinds))
    print("  辺", len(edges), "/ 共起の組", len(cooccur),
          "/ 話に出てこないもの", len(orphans))
    for c in cooccur[:5]:
        print("   よく一緒に語られる: %s × %s (%d席)" % (label.get(c["a"]), label.get(c["b"]), c["n"]))


if __name__ == "__main__":
    main()
