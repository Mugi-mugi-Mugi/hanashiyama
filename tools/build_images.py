# -*- coding: utf-8 -*-
"""はなし山: 札 (オチの画像) に使う写真を用意する。

鯖江市オープンデータの公式写真 (CC BY 2.1 JP) を、札の大きさに縮めて
app/data/img.js に data URI として書き出す。

なぜ data URI か:
  file:// で開いたとき、外部ファイルの画像を canvas に描くと
  「汚染された canvas」になり、札を保存できなくなる (SecurityError)。
  data URI なら汚染されないので、ダブルクリックで開いても札を保存できる。

EXIF (撮影機種・日時・GPS) は再エンコードで落ちる。

実行: python tools/build_images.py
"""
import base64
import io
import json
import os

import fitz  # PyMuPDF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

# 使う写真 (鯖江市オープンデータ / CC BY 2.1 JP)
#   ★2026-09-22: 1 枚ずつだと「もう一席」で 同じ絵が 続いて 飽きる → 群で 持ち、選ぶ側で 散らす
GROUPS = [
    {
        "key": "tsutsuji",
        "files": ["18207_nishiyamakoentsutsuzipicture_%d.jpg" % i for i in range(1, 8)],
        "credit": "鯖江市オープンデータ「西山公園ツツジ画像」(CC BY 2.1 JP)",
        "url": "https://ckan.odp.jig.jp/dataset/18207_nishiyamakoentsutsuzipicture",
    },
    {
        "key": "koyo",
        "files": ["18207_nishiyamakoenkoyopicture_%d.jpg" % i for i in range(1, 8)],
        "credit": "鯖江市オープンデータ「西山公園の紅葉画像」(CC BY 2.1 JP)",
        "url": "https://ckan.odp.jig.jp/dataset/18207_nishiyamakoenkoyopicture",
    },
]


# ★園内の 場所ごとの 写真 (鯖江市 公式ページ / 2026-09-23 取得)
#   噺に出てくる 場所を 名指しで 出せるようにするため。CKAN の 画像データセットには
#   つつじ・紅葉・動物しか 無かった。
BASE_SHISETSU = ("https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/"
                 "nishiyama/Nishiyama-Shisetsu.html")
PLACES = [
    ("michinoeki", "_ls/shisetsu1.jpg", "道の駅西山公園", BASE_SHISETSU),
    ("shibafu", "_ls/shisetsu2.jpg", "芝生広場 (お祭り広場)", BASE_SHISETSU),
    ("musubi", "_ls/shisetsu12.JPG", "結びの広場 (結びのチャイム)", BASE_SHISETSU),
    ("funsui", "_ls/shisetsu4.jpg", "大噴水", BASE_SHISETSU),
    ("nishiyamabashi", "_ls/shisetsu5.jpg", "西山橋", BASE_SHISETSU),
    ("jodan", "_ls/shisetsu6.jpg", "上段の庭", BASE_SHISETSU),
    ("kitanoniwa", "_ls/shisetsu7.jpg", "北の庭", BASE_SHISETSU),
    ("pandarando", "_ls/shisetsu8.jpg", "冒険の森「パンダらんど」", BASE_SHISETSU),
    ("ainokane", "_ls/shisetsu9.jpg", "愛の鐘", BASE_SHISETSU),
    ("tenbodai", "_ls/shisetsu10.jpg", "展望台", BASE_SHISETSU),
    ("shodoan", "_ls/shisetsu11.jpg", "松堂庵", BASE_SHISETSU),
    ("inorinomichi", "_ls/inorinomichi.jpg", "祈りの道",
     "https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/inorinomichi.html"),
    ("koen", "_ls/No16.jpg", "鯖江百景 西山公園",
     "https://www.city.sabae.fukui.jp/kanko_sangyo/kankoshisetsu_meisho/sabaehyakkei/"),
    ("kyoyokaikan", "_ls/No20.jpg", "鯖江百景 嚮陽会館周辺",
     "https://www.city.sabae.fukui.jp/kanko_sangyo/kankoshisetsu_meisho/sabaehyakkei/"),
    ("rekishinomichi", "_ls/No51.jpg", "鯖江百景 歴史の道",
     "https://www.city.sabae.fukui.jp/kanko_sangyo/kankoshisetsu_meisho/sabaehyakkei/"),
    ("sanjusan", "_ls/No52.jpg", "鯖江百景 小黒町信仰の道「三十三間堂」",
     "https://www.city.sabae.fukui.jp/kanko_sangyo/kankoshisetsu_meisho/sabaehyakkei/"),
]


def extracted():
    """zip から取り出した個体写真。★1 枚ずつ出どころ (CKAN の dataset) が違うので、
    まとめて 1 つの出典にせず、写真ごとに dataset 名を持たせる。"""
    idx = P("data", "raw", "media", "_extract", "_index.txt")
    if not os.path.exists(idx):
        return {}
    LABEL = {"panda": "西山動物園のレッサーパンダ写真", "zoo": "西山動物園の動物写真"}
    got = {}
    for line in io.open(idx, encoding="utf-8").read().splitlines():
        if not line.strip():
            continue
        key, fn, ds = line.split("	")
        got.setdefault(key, {"label": LABEL.get(key, key), "files": []})
        got[key]["files"].append(("_extract/" + fn, ds))
    return got
# 札は 1080 幅だが、写真は 810 幅で持って canvas 側で 伸ばす。
# 14 枚を 1080/品質62 で持つと 2.2MB を超え、file:// の 読み込みが 重くなるため。
WIDTH = 810
BAND = 360
QUALITY = 46
# ★噺の途中に 小さく 出す 写真 (挿し絵の 代わり。2026-09-23 ユーザー指示)
#   手描きの SVG は 抽象的すぎて 噺との つながりが 分からなかった。
SMALL_W = 480
SMALL_H = 320
SMALL_Q = 48


def shrink(path, width, band=BAND):
    """写真の中央を 幅width × 高さband の帯に切り出し、JPEG のバイト列で返す。

    札に敷くのは 帯だけ。全体を持つと 1 枚 500KB を超えるため。EXIF は落ちる。
    """
    doc = fitz.open(path)
    page = doc[0]
    rect = page.rect
    scale = width / rect.width
    # 切り出す高さ (元画像の座標系)
    band_h = band / scale
    top = max(0, (rect.height - band_h) / 2)
    clip = fitz.Rect(0, top, rect.width, min(rect.height, top + band_h))
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, alpha=False)
    return pix.tobytes("jpeg", jpg_quality=QUALITY), pix.width, pix.height


def main():
    out = {}
    for g in GROUPS:
        shots = []
        for name in g["files"]:
            src = P("data", "raw", "media", name)
            if not os.path.exists(src):
                print("  見つからない:", src)
                continue
            data, w, h = shrink(src, WIDTH)
            shots.append({
                "dataUri": "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii"),
                "w": w, "h": h, "bytes": len(data),
            })
            print("  %s[%d]: %dx%d / %.0f KB" % (g["key"], len(shots) - 1, w, h, len(data) / 1024))
        if shots:
            out[g["key"]] = {"credit": g["credit"], "url": g["url"], "shots": shots}

    # ★噺の途中に出す 小さい写真 (中央を 横長に 切らず、そのままの 形で 縮める)
    def shrink_small(src):
        doc = fitz.open(src)
        page = doc[0]
        r = page.rect
        sc = min(SMALL_W / r.width, SMALL_H / r.height)
        pix = page.get_pixmap(matrix=fitz.Matrix(sc, sc), alpha=False)
        data = pix.tobytes("jpeg", jpg_quality=SMALL_Q)
        return {"dataUri": "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii"),
                "w": pix.width, "h": pix.height, "bytes": len(data)}

    small, total = {}, 0
    for g in GROUPS:                      # つつじ / 紅葉 (群で 1 つの 出典)
        ss = []
        for name in g["files"]:
            src = P("data", "raw", "media", name)
            if os.path.exists(src):
                ss.append(dict(shrink_small(src), credit=g["credit"], url=g["url"]))
        if ss:
            small[g["key"]] = {"credit": g["credit"], "url": g["url"], "shots": ss}
    for key, info in extracted().items():  # 個体写真 (1 枚ずつ 出どころが 違う)
        ss = []
        for name, ds in info["files"]:
            src = P("data", "raw", "media", name)
            if os.path.exists(src):
                ss.append(dict(shrink_small(src),
                               credit="鯖江市オープンデータ「" + info["label"] + "」(CC BY 2.1 JP)",
                               url="https://ckan.odp.jig.jp/dataset/" + ds))
        if ss:
            small[key] = {"credit": "鯖江市オープンデータ「" + info["label"] + "」(CC BY 2.1 JP)",
                          "url": "https://ckan.odp.jig.jp/", "shots": ss}
    for key, name, label, url in PLACES:      # 場所ごとの 写真 (1 枚 = 1 か所)
        src = P("data", "raw", "media", name)
        if not os.path.exists(src):
            print("  見つからない:", src)
            continue
        credit = "鯖江市「" + label + "」(市公式ページ)"
        small[key] = {"credit": credit, "url": url,
                      "shots": [dict(shrink_small(src), credit=credit, url=url)],
                      "label": label}

    for k, v in small.items():
        n = sum(x["bytes"] for x in v["shots"])
        total += n
        print("  小 %-9s %2d 枚 / %.0f KB" % (k, len(v["shots"]), n / 1024))
    print("  小 合計 %d 枚 / %.0f KB" % (sum(len(v["shots"]) for v in small.values()), total / 1024))
    out["_small"] = small

    dst = P("app", "data", "img.js")
    with io.open(dst, "w", encoding="utf-8", newline="\n") as f:
        f.write("/* 自動生成: python tools/build_images.py  (手で編集しない) */\n")
        f.write("/* 鯖江市オープンデータの公式写真 (CC BY 2.1 JP)。EXIF は除去済み */\n")
        f.write("window.HANASHI_IMG = ")
        json.dump(out, f, ensure_ascii=False)
        f.write(";\n")
    print("written:", dst, "(%.0f KB)" % (os.path.getsize(dst) / 1024))


if __name__ == "__main__":
    main()
