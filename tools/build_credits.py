# -*- coding: utf-8 -*-
"""はなし山: CREDITS.md の 出典一覧を、事実台帳から 作り直す。

★なぜ道具にするか (2026-09-24 に 実際に ずれた)
  CREDITS.md は ★公開される。しかも 本文で「出典は 一件ずつ 書いています」と 言い切っている。
  ところが 事実の URL 38 本のうち ★21 本が 載っていなかった。
  ★事実を 足すたび 手で 書き写す 作りに していたのが 原因。
  → ★facts.json を 正にして、印の あいだだけ 機械が 書き直す。

  ★印の 外 (ライセンス・加工の説明・写真の表) は 人が 書く。機械は 触らない。

実行: python tools/build_credits.py          → CREDITS.md の 印の あいだを 書き直す
      python tools/build_credits.py --check  → 書き直さず、ずれているかだけ 見る (終了コード 1)
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRED = os.path.join(ROOT, "CREDITS.md")
FACTS = os.path.join(ROOT, "app", "data", "facts.json")

BEGIN = "<!-- ここから 自動生成: python tools/build_credits.py -->"
END = "<!-- ここまで 自動生成 -->"


def build():
    d = json.load(io.open(FACTS, encoding="utf-8"))
    facts = d["facts"]
    # 出典名ごとに まとめる (同じ URL に 複数の 事実が ぶら下がる)
    by = {}
    for f in facts:
        key = (f.get("source", ""), f.get("url", ""))
        by.setdefault(key, []).append(f["id"])
    rows = sorted(by.items(), key=lambda kv: kv[0][0])

    out = [BEGIN, "",
           "### 語りに使った事実の出典 (%d 件 / 出典 %d 種 / URL %d 本)"
           % (len(facts), len(set(f.get("source", "") for f in facts)),
              len(set(f.get("url", "") for f in facts if f.get("url")))),
           "",
           "★この節は `python tools/build_credits.py` が `app/data/facts.json` から作り直します。",
           "手で書き足さないでください (足しても次の実行で消えます)。",
           "",
           "| 事実 | 出典 | URL |", "|---|---|---|"]
    for (src, url), ids in rows:
        out.append("| %s | %s | %s |"
                   % (" ".join(ids), src.replace("|", "／"),
                      ("<%s>" % url) if url else "—"))
    out += ["", END]
    return "\n".join(out)


def main(check_only=False):
    cur = io.open(CRED, encoding="utf-8").read()
    block = build()
    if BEGIN in cur and END in cur:
        head = cur[:cur.index(BEGIN)]
        tail = cur[cur.index(END) + len(END):]
        new = head + block + tail
    else:
        # ★印が 無ければ 末尾に 足す
        new = cur.rstrip() + "\n\n" + block + "\n"

    if new == cur:
        print("CREDITS.md の出典一覧は最新です")
        return 0
    if check_only:
        print("★CREDITS.md の出典一覧が facts.json とずれています")
        print("  → python tools/build_credits.py で書き直してください")
        return 1
    io.open(CRED, "w", encoding="utf-8", newline="\n").write(new)
    print("CREDITS.md の出典一覧を書き直しました")
    return 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
