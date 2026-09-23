# -*- coding: utf-8 -*-
"""はなし山: 絵図が問いの答えを先に見せていないか (figs.spoils) のテスト。

なぜ要るか
  ★2026-09-22: 絵図を入れたとき、40 席で問いの答えが絵図に写っていた。
  ・「約5万株」と「50,025」を別物として見ていた (16 席)
  ・「6月40頭 + 7月24頭」の足し算で「64頭」が出ることを見ていなかった (24 席)
  どちらも検査は通っていた。★同じ穴を二度開けないための陰性テスト。

実行: python tools/test_figs.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import figs  # noqa: E402

fail = []


def check(want, fig, answer, name):
    got = figs.spoils(fig, answer)
    okk = got == want
    print(("  OK   " if okk else "  NG   ") + name + ("" if okk else "  (期待 %s / 実際 %s)" % (want, got)))
    if not okk:
        fail.append(name)


def f(items, title="", unit=""):
    return {"title": title, "unit": unit, "items": [{"label": a, "value": b} for a, b in items]}


# ★見逃していた形 (ここが通らないと 実害が戻る)
check(True, f([("昭和33年", 2100), ("いま", 50025)]), "約5万株",
      "「約5万株」を 50,025 の絵図が 先に見せている")
check(True, f([("6月生まれ", 40), ("7月生まれ", 24)]), "64頭",
      "足し算 (40+24) で 答え 64 が出てしまう")
check(True, f([("名前にある数", 100), ("実際に選ばれた数 (か所)", 250)]), "250か所",
      "そのままの数が写っている")
check(True, f([("ヒラドツツジ", 31400), ("PGMツツジ", 25)]), "25株",
      "小さいほうの数が写っている")
check(True, f([("2025年5月5日", 4550), ("2026年1月24日 (雪)", 0)]), "0人",
      "0 も 答えとして 見る")
check(True, f([("4月12日", 2050), ("5月5日", 4550), ("11月16日", 1310)]), "11月",
      "ラベルの中の 月が 答えを 見せている")
check(True, f([("けもの", 4), ("鳥", 7)], unit="種"), "7種",
      "項目の値が そのまま 答え")

# ★見せていない形 (ここが False でないと 絵図が 全部 答え合わせ送りになる)
check(False, f([("県内から", 648), ("県外から", 216)]), "嚮陽渓",
      "答えが言葉なら 見せていない")
check(False, f([("昭和33年", 2100), ("いま", 50025)]), "ドラえもん",
      "数のない答えは 見せていない")
check(False, f([("借りる", 1), ("払うのは", 3)], unit="時間"), "変わらない",
      "数のない答え (時間の絵図)")
check(False, f([("県内から", 94), ("県外から", 1468)]), "3,000千人",
      "近くない数は 見せていない")
check(False, f([("福井県内から", 84)], unit="%"), "嚮陽渓",
      "棒 1 本の割合図でも 言葉の答えは 見せていない")

# 数量の読み方そのもの
for text, want in [("約5万株", 50000.0), ("2,100株", 2100.0), ("5千両", 5000.0), ("64頭", 64.0)]:
    got = figs._amounts(text)
    okk = want in got
    print(("  OK   " if okk else "  NG   ") + "「%s」から %s を読む" % (text, want))
    if not okk:
        fail.append(text)

print("FAIL %d 件" % len(fail) if fail else "ALL OK")
sys.exit(1 if fail else 0)
