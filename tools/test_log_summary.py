# -*- coding: utf-8 -*-
"""はなし山: 記録の集計 (log_summary.py) が、実際の記録の形で落ちないかを見る。

なぜ要るか
  記録には、噺に紐づかない行 (はじめの気持ち q0 / 自由入力 free / 語らなかった silent) が混ざる。
  ★2026-09-22: story が null の行で集計が落ちていた (人に試す前に見つかった)。

実行: python tools/test_log_summary.py
"""
import io
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fail = []


def run(events, name, expect_ok=True):
    d = tempfile.mkdtemp()
    p = os.path.join(d, "log.json")
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(events, f, ensure_ascii=False)
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "log_summary.py"), p],
                       capture_output=True, env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    out = r.stdout.decode("utf-8", "replace") + r.stderr.decode("utf-8", "replace")
    ok = (r.returncode == 0) == expect_ok
    print(("  OK   " if ok else "  NG   ") + name)
    if not ok:
        fail.append(name)
        print("       " + out.strip().replace("\n", "\n       ")[:600])
    return out


base = {"t": "2026-09-22T13:00:00", "input": {"pref": "東京都", "beliefs": [], "date": "2026-09-22"}}

# ① 噺に紐づかない行だけ (一席も聞かずに閉じた人)
run([dict(base, event="q0", story=None, title=None, n=0, value=3),
     dict(base, event="free", story=None, title=None, n=0, text="城めぐり", hit=["城"])],
    "一席も聞いていない記録でも落ちない")

# ② 通しで一席ぶん
one = dict(base, story="S01", title="松陰が狙った男", n=1)
out = run([dict(base, event="q0", story=None, title=None, n=0, value=1),
           dict(one, event="shown"),
           dict(one, event="answer_wrong"),
           dict(one, event="q1", value=5),
           dict(one, event="delta", delta=4, before=1, after=5),
           dict(one, event="saved"),
           dict(base, event="silent", story=None, title=None, n=1)],
          "一席ぶんの記録を集計できる")
for w in ["松陰が狙った男", "+4.00", "1席目", "語らなかった回数 (手がかり不足) 1"]:
    if w not in out:
        fail.append("出力に「%s」が無い" % w)
        print("  NG   出力に「%s」が無い" % w)
    else:
        print("  OK   出力に「%s」が出る" % w)

# ③ 記録が空
run([], "空の記録でも落ちない")

print("FAIL %d 件" % len(fail) if fail else "ALL OK")
sys.exit(1 if fail else 0)
