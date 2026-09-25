# -*- coding: utf-8 -*-
"""はなし山: 説明資料に貼る数字を、1 か所で測る。

★なぜ分けたか
  同じ数字を pptx と html の 2 か所で 数えると、★必ず 片方だけ 古くなる。
  (このプロジェクトでは 絵図のネタバレ判定を 2 か所に 書いて 実際に やった)
  ★測るのは ここだけ。使う側は 読むだけ。

使う側: tools/make_slides.py (PowerPoint) / tools/make_slides_html.py (HTML)
"""
import collections
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def P(*a):
    return os.path.join(ROOT, *a)


def load_bundle():
    t = io.open(P("app", "data", "bundle.js"), encoding="utf-8").read()
    return json.loads(re.search(r"window\.HANASHI = (\{.*\});\s*$", t, re.S).group(1))


def load_graph():
    return json.load(io.open(P("data", "derived", "graph.json"), encoding="utf-8"))


def measure():
    """★書く直前に 測る。★資料に 古い数字を 残さない"""
    b = load_bundle()
    g = load_graph()
    raw = json.load(io.open(P("app", "data", "facts.json"), encoding="utf-8"))
    kt = io.open(P("app", "data", "kin.js"), encoding="utf-8").read()
    kin = json.loads(re.search(r"window\.HANASHI_KIN = (\{.*\});\s*$", kt, re.S).group(1))
    img = io.open(P("app", "data", "img.js"), encoding="utf-8").read()
    vsrc = io.open(P("tools", "validate.py"), encoding="utf-8").read()
    allst = b["stories"] + b["prefStories"] + [x for v in b["today"].values() for x in v]
    conf = collections.Counter(f.get("confidence", "") for f in b["facts"])
    dom = [z for z in kin["items"] if z.get("pref")]
    return {
        "hand": len(b["stories"]), "pref": len(b["prefStories"]),
        "today": len([x for v in b["today"].values() for x in v]), "all": len(allst),
        "facts": len(b["facts"]),
        "sources": len(set(f["source"] for f in b["facts"])),
        "urls": len(set(f.get("url", "") for f in b["facts"])),
        "high": conf.get("high", 0), "medium": conf.get("medium", 0),
        "rejected": len(raw.get("rejected", [])),
        "beliefs": len(b["beliefs"]), "keywords": len(b["keywords"]),
        "prefs": len(b["prefectures"]),
        "nodes": len(g["nodes"]), "edges": len(g["edges"]),
        "ek": dict(collections.Counter(e["kind"] for e in g["edges"])),
        "entities": sum(1 for n in g["nodes"] if str(n.get("id", "")).startswith("E")),
        "fig": sum(1 for s in allst if s.get("fig")),
        "guess": sum(1 for s in allst if s.get("guess")),
        "uwasa": sum(1 for s in allst if s.get("uwasa")),
        "figwhen": dict(collections.Counter(s["fig"].get("when", "hondai")
                                            for s in allst if s.get("fig"))),
        "sageuniq": len(set(s["sage"] for s in allst)),
        "wrongeach": sum(1 for s in allst if (s.get("reply") or {}).get("wrongEach")),
        "vchecks": vsrc.count("errors.append"),
        "photos": img.count("dataUri"),
        "zoos": len(kin["items"]), "zoodom": len(dom),
        "zoopref": len(set(z["pref"] for z in dom)),
        "imgmb": os.path.getsize(P("app", "data", "img.js")) / 1048576.0,
        "applines": sum(1 for _ in io.open(P("app", "app.js"), encoding="utf-8")),
        "builtAt": b.get("builtAt", ""),
        "graphAt": g.get("builtAt", ""),
    }


# ★パターン数は node で 全通り 通して 測った値 (2026-09-24 実測)。
#   ★条件が 変われば 変わる。★条件も 一緒に 持っておく (条件抜きの「何万通り」は 言わない)
PAT = {
    "combo": 38640, "prefs": 48, "beliefs": 23, "dates": 35,
    "first_nofree": 63, "first_free": 103, "reach": 107, "silent": 1,
}
# ★2026-09-25 再測。★暦の噺が ふえ (32→35)、★一席目の 選び方も 変わった
#   (県の手書きの噺を 先に / 似た噺を 後ろへ / 暦は 7 日前から)
#   → ★「一席目に なりうる」が 減ったのは ★似た噺を 外す 仕組みが 効いているため。
#   ★もう一席まで 含めた 到達は 107/127 (★前は 110/110 = 取りこぼし 0 だった)

# ★measure_gap.py を その場で 走らせて 読む。
#   ★手で 書き写すと 古くなる ―― 実際に auto_avg を 0.11 のまま 資料に 出していた (2026-09-24)。
def gap():
    import subprocess
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    r = subprocess.run([sys.executable, P("tools", "measure_gap.py")],
                       capture_output=True, text=True, encoding="utf-8", env=env, cwd=ROOT)
    o = r.stdout
    g = lambda pat, d=0: (float(re.search(pat, o).group(1)) if re.search(pat, o) else d)
    return {
        "far": int(g(r"ズレ [\d.]+ 以上\s*:\s*(\d+) 席")),
        "farpct": int(g(r"ズレ [\d.]+ 以上\s*:\s*\d+ 席 \((\d+)%\)")),
        "stuck": int(g(r"サゲが動いていない\s*:\s*(\d+) 席")),
        "stuckpct": int(g(r"サゲが動いていない\s*:\s*\d+ 席 \((\d+)%\)")),
        "lonely": int(g(r"事実 1 本だけ\s*:\s*(\d+) 席")),
        "unmeasurable": int(g(r"測れない\s*:\s*(\d+) 席")),
        "hand_avg": g(r"手書きの平均ズレ\s*:\s*([\d.]+)"),
        "auto_avg": g(r"自動生成の平均\s*:\s*([\d.]+)"),
    }


GAP = gap()
CHECKS = {"ng": 5, "caution": 8, "info": 3, "caution_now": 27}
