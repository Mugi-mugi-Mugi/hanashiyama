# -*- coding: utf-8 -*-
"""はなし山: 端末の記録 (画面下「この端末の記録を書き出す」で保存した JSON) を集計する。

使い方
  python tools/log_summary.py 記録1.json [記録2.json ...]

出力
  話ごとに: 語った回数 / 正解率 / 札の保存率 / 次に語ったか (もう一席)
  と、strength を見直す目安。

記録に含まれるのは、選んだ県・好きなもの・日付と、話のID・操作だけ (名前などは含まない)。
"""
import json
import sys
from collections import defaultdict


def main(paths):
    if not paths:
        sys.exit(__doc__)
    events = []
    for p in paths:
        with open(p, encoding="utf-8") as f:
            events += json.load(f)

    stat = defaultdict(lambda: defaultdict(int))
    deltas = defaultdict(list)   # 噺ごとの Δq (気持ちの動き)
    by_seat = defaultdict(list)  # 何席目かごとの Δq (効きが落ちていないか)
    titles = {}
    silent = 0
    other = 0
    for e in events:
        if e["event"] == "silent":
            silent += 1
            continue
        # 噺に紐づかない記録 (q0 / free) は噺ごとの表に入れない
        if not e.get("story"):
            other += 1
            continue
        if e.get("title"):
            titles[e["story"]] = e["title"]
        if e["event"] == "delta":
            deltas[e["story"]].append(e["delta"])
            if e.get("n"):
                by_seat[e["n"]].append(e["delta"])
        stat[e["story"]][e["event"]] += 1

    print("記録 %d 件 / 語らなかった回数 (手がかり不足) %d / 噺に紐づかない記録 (はじめの気持ち・自由入力) %d"
          % (len(events), silent, other))
    if not stat:
        print("噺の記録がありません (一席も聞いていないか、書き出しの前に消えています)")
        return
    print("%-16s %5s %7s %7s %8s  目安" % ("噺", "語った", "正解率", "保存率", "平均Δq"))
    rows = []
    for sid, s in stat.items():
        shown = s["shown"] or 1
        answered = s["answer_correct"] + s["answer_wrong"]
        correct = s["answer_correct"] / answered if answered else 0
        saved = s["saved"] / shown
        dq = sum(deltas[sid]) / len(deltas[sid]) if deltas[sid] else None
        rows.append((dq if dq is not None else -99, sid, shown, correct, saved, dq, len(deltas[sid])))
    for _, sid, shown, correct, saved, dq, n in sorted(rows, reverse=True):
        hint = ""
        if n >= 5 and dq is not None:
            if dq >= 0.5:
                hint = "気持ちが動いた → strength を上げる候補"
            elif dq <= 0:
                hint = "動かない → まくら (近い物語) か サゲを見直す"
        if shown >= 10 and correct >= 0.9:
            hint += " / 正解率が高すぎ → 意外性が弱い"
        print("%-16s %5d %6.0f%% %6.0f%% %8s  %s" % (
            (titles.get(sid) or sid)[:16], shown, correct * 100, saved * 100,
            ("%+.2f(%d)" % (dq, n)) if dq is not None else "-", hint))

    if by_seat:
        print("\n何席目かごとの平均Δq (効きが落ちていないか)")
        for n in sorted(by_seat):
            v = by_seat[n]
            print("  %d席目: %+.2f (%d件)" % (n, sum(v) / len(v), len(v)))


if __name__ == "__main__":
    main(sys.argv[1:])
