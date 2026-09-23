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
BUNDLE = os.path.join(ROOT, "app", "data", "bundle.js")
fail = []


def load():
    t = io.open(BUNDLE, encoding="utf-8").read()
    return json.loads(re.search(r"window\.HANASHI = (\{.*\});\s*$", t, re.S).group(1))


def run(mod, name, want_ng=True):
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


def m_ok(b):
    pass


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
run(m_ok, "壊していない状態 (ここは通るのが正しい)", want_ng=False)

print("FAIL %d 件" % len(fail) if fail else "ALL OK")
sys.exit(1 if fail else 0)
