# -*- coding: utf-8 -*-
"""はなし山: 「噂の一言」を噺につけるのと、足したあとに読む吟味レポートを書き出す。

なぜ要るか (★2026-09-22 ユーザー判断)
  「数字が割れているところ」「語らないと決めた話」は、見る人には要らない情報。
  → 画面の「タネ明かし」から外した。
  → 代わりに ① 噺のなかの「噂ですが」の一言として使う
             ② 新しい情報を足したときの アウトプット (吟味レポート) として置く
"""
import datetime
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)


def attach_uwasa(stories, conflicts):
    """割れている数字を、噺のなかの「噂ですが」の一言としてつける。

    ★uwasa に書いてよい数字は、その conflict の values に出てくる数字だけ。
      ここで nums として持たせ、tools/validate.py がそれで検査する。
    """
    n = 0
    for c in conflicts:
        text = (c.get("uwasa") or "").strip()
        need = c.get("attach") or []
        only = c.get("attachStories") or []      # 事実IDでは絞れないときに、噺IDで直に指す
        if not text or not (need or only):
            continue
        nums = set()
        for v in c.get("values", []):
            nums |= set(re.findall(r"[0-9]+", str(v.get("value", "")).replace(",", "")))
        for s in stories:
            if s.get("uwasa"):
                continue                       # 1 席に 1 つまで
            hit = (s["id"] in only) if only else (set(need) <= set(s.get("facts", [])))
            if hit:
                s["uwasa"] = {"text": text, "nums": sorted(nums)}
                n += 1
    return n


def write_report(facts, stories, conflicts, entities):
    """新しい情報を足したあとに読むレポート。★画面には出さない。

    ① 語らないと決めた話  ② 数字が割れているところ
    ③ どの噺にも使っていない事実  ④ まだ噺に出ていない登場するもの
    """
    used = set()
    for s in stories:
        used |= set(s.get("facts", []))
    unused = [f for f in facts["facts"] if f["id"] not in used]

    spoken = set()
    for s in stories:
        t = " ".join([s.get("bridge", ""), s.get("makura", ""), s.get("sage", ""),
                      s.get("atogaki", "")] + list(s.get("hondai", [])))
        for e in entities:
            for nm in [e["name"]] + e.get("aliases", []):
                if nm in t:
                    spoken.add(e["id"])
                    break
    orphan = [e for e in entities if e["id"] not in spoken]

    L = []
    A = L.append
    A("# 吟味レポート")
    A("")
    A("**自動生成: `python tools/build.py`。手で編集しない。**")
    A("新しい情報を足したあとに、ここを読んで矛盾が増えていないか見る。")
    A("画面には出さない (見る人には要らない情報)。")
    A("")
    A("作成: " + datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
    A("")
    A("| 見るもの | 件数 |")
    A("|---|---|")
    A("| ① 語らないと決めた話 | %d |" % len(facts["rejected"]))
    A("| ② 数字が割れているところ | %d |" % len(conflicts))
    A("| ③ どの噺にも使っていない事実 | %d |" % len(unused))
    A("| ④ まだ噺に出ていない登場するもの | %d |" % len(orphan))
    A("")

    A("## ① 語らないと決めた話 (%d 件)" % len(facts["rejected"]))
    A("")
    A("出どころを当たって裏が取れなかった主張。`tools/validate.py` が語りから自動ではじく。")
    A("")
    A("| 語らない言い回し | 落とした理由 |")
    A("|---|---|")
    for r in facts["rejected"]:
        A("| %s | %s |" % (r["text"], r["reason"]))
    A("")

    A("## ② 数字が割れているところ (%d 件)" % len(conflicts))
    A("")
    A("同じ対象なのに出どころで数が違うところ。★噺のなかでは「噂ですが」の一言として使う。")
    A("")
    for c in conflicts:
        A("### " + c.get("about", ""))
        for v in c.get("values", []):
            A("- %s  ← %s" % (v.get("value"), v.get("source")))
        if c.get("show"):
            A("")
            A("**どういうことか:** " + c["show"])
        if c.get("advice"):
            A("")
            A("**扱い (作り手向け):** " + c["advice"])
        if (c.get("uwasa") or "").strip():
            A("")
            A("**噂の一言:** " + c["uwasa"])
            A("**付ける先:** " + ("/".join((c.get("attach") or []) + (c.get("attachStories") or []))
                                 or "まだ決めていない"))
        else:
            A("")
            A("**噂の一言:** なし (ネタにしない)")
        A("")

    A("## ③ どの噺にも使っていない事実 (%d 件)" % len(unused))
    A("")
    if unused:
        for f in unused:
            A("- **%s** %s" % (f["id"], f["claim"][:60]))
    else:
        A("なし。")
    A("")

    A("## ④ まだ噺に出ていない登場するもの (%d 件)" % len(orphan))
    A("")
    A("※「出ていない」は本文にその名前が無いという意味。")
    A("語ってはいるが名前を出していない場合もある (祈りの道は S05 で「山の中の道」と語っている)。")
    A("")
    by = {}
    for e in orphan:
        by.setdefault(e.get("type") or "?", []).append(e["name"])
    for k in sorted(by, key=lambda x: -len(by[x])):
        A("- **%s** (%d 件): %s" % (k, len(by[k]), " / ".join(by[k])))
    A("")

    dst = P("data", "derived", "吟味レポート.md")
    with open(dst, "w", encoding="utf-8", newline=chr(10)) as f:
        f.write(chr(10).join(L))
    return dst, {"rejected": len(facts["rejected"]), "conflicts": len(conflicts),
                 "unused": len(unused), "orphan": len(orphan)}
