# -*- coding: utf-8 -*-
"""はなし山: 鯖江市オープンデータの CSV を、文字コードを間違えずに読む。

★なぜ要るか (2026-09-23 に実際に起きた)
  この CKAN の CSV は Shift_JIS (cp932)。
  UTF-8 前提で読むと ★壊れるのではなく「もっともらしい別物に化ける」ことがある。
  同じ URL を二度取ったところ、一度目「福島県84%・農業生産」、
  二度目「宮城県84%・来訪者数」と ★県名も項目も入れ替わった。
  構造と数値だけが一致していた ―― つまり数字は実在し、県名だけが作り話だった。

  ★「文字化けしていないから正しい」と思わないこと。化けたほうがまだ安全。

使い方
  python tools/read_csv.py data/raw/jinryu_todofuken.csv
  python tools/read_csv.py data/raw/jinryu_todofuken.csv --expect 福井県
      → 1 行目〜数行を表示し、--expect の語が出てこなければ ★終了コード 1

  from read_csv import read_rows
  rows = read_rows("data/raw/xxx.csv")      # cp932 → utf-8 の順に試す
"""
import csv
import io
import sys

# ★cp932 を先に試す。utf-8-sig はそのあと。
ENCODINGS = ["cp932", "utf-8-sig", "utf-8"]


def read_rows(path, encodings=None):
    """CSV を行の配列で返す。使えた文字コードも返す。"""
    last = None
    for enc in (encodings or ENCODINGS):
        try:
            with io.open(path, encoding=enc, newline="") as f:
                rows = list(csv.reader(f))
            return rows, enc
        except UnicodeDecodeError as e:
            last = e
    raise last


def main(argv):
    if not argv:
        sys.exit(__doc__)
    path = argv[0]
    expect = None
    if "--expect" in argv:
        expect = argv[argv.index("--expect") + 1]

    rows, enc = read_rows(path)
    print("文字コード: %s / %d 行" % (enc, len(rows)))
    for r in rows[:6]:
        print("  " + " | ".join(x[:24] for x in r))

    if expect:
        # ★人が知っている値で検算する。無ければ「化けている」疑い。
        hit = any(expect in (c or "") for r in rows for c in r)
        print("検算「%s」: %s" % (expect, "見つかった" if hit else "★見つからない"))
        if not hit:
            print("★この CSV は、読めているように見えて別物かもしれません。"
                  "文字コードと出どころを確かめてください。")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
