# -*- coding: utf-8 -*-
"""はなし山: 札 (オチの画像) に使う写真を用意する。

鯖江市オープンデータの公式写真 (CC BY 2.1 JP) を、札の大きさに縮めて
app/data/img/ に 群ごとの data URI として書き出す (★2026-11-14 から 分割)。

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
import sys

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

# ★2026-11-14: 噺の途中の 写真が「これは何?」に なっていた (見直し)。
#   ①写真 1 枚ずつに「何の写真か」(label) を 持たせ、画面の 写真の 下に 出す
#   ②噺の 場面に 合う 素材を 足す (古い写真 / 市の資料の 写真 / 名前の 分かる レッサーパンダ)
# ★古い写真 = 鯖江市オープンデータ「古い写真」(furui_shashin.csv。CC BY)。★2026-11-14 に 生きていた 7 件
FURUI = [
    # (群, ファイル, 何の写真か)
    ("furui_tsutsuji1958", "furui/084.jpg", "西山公園の つつじ植樹 (1958年)"),
    ("furui_koen1959", "furui/085.jpg", "開園まもない 西山公園 (1959年)"),
    ("furui_bashi1964", "furui/091.jpg", "西山橋からの 風景・南 (1964年)"),
    ("furui_bashi1964", "furui/092.jpg", "西山橋からの 風景・北 (1964年)"),
    ("furui_kiriwari", "furui/094.jpg", "西山の 切割りの ようす (年は 記録なし)"),
    ("furui_eki", "furui/003.jpg", "鯖江駅の ホーム (1958年)"),
    ("furui_eki", "furui/016.jpg", "鯖江駅前の 通り (1968年)"),
]
FURUI_CREDIT = "鯖江市オープンデータ「古い写真」(CC BY)"
FURUI_URL = "https://ckan.odp.jig.jp/"
# ★市の 資料に 載っている 写真 (★オープンデータでは ない。出典を 明記して 使う = 公式ページの 写真と 同じ 扱い)
DOCS = [
    ("meganetokei", "../web_20261114/img/20220406-05_p1_2.png", "西山公園 入口の めがね時計",
     "鯖江市「眼鏡型時計モニュメントに掲載する鯖江市のＰＲデザイン募集要項」(令和4年) 掲載の写真",
     "https://www.city.sabae.fukui.jp/about_city/koho_kocho/kishahappyo/reiwa4/20220406.files/20220406-05.pdf"),
    ("meganetokei", "../web_20261114/img/20220406-05_p1_0.png", "めがね時計の 近景 (片方の レンズが 時計)",
     "鯖江市「眼鏡型時計モニュメントに掲載する鯖江市のＰＲデザイン募集要項」(令和4年) 掲載の写真",
     "https://www.city.sabae.fukui.jp/about_city/koho_kocho/kishahappyo/reiwa4/20220406.files/20220406-05.pdf"),
    ("pandabench", "../web_20261114/img/20260820-4_p1_0.png", "結びの広場の レッサーパンダベンチ (背もたれの 顔)",
     "鯖江市 報道機関連絡票「レッサーパンダベンチ完成」(2026年8月20日) 掲載の写真",
     "https://www.city.sabae.fukui.jp/about_city/koho_kocho/kishahappyo/reiwa8/20260820.files/20260820-4.pdf"),
]
USE_CITY_PHOTOS = False   # ★市の 許可が 取れるまで False

# ★外部の 自由に 使える 写真 (2026-11-14 作者の判断「自由に使える写真か確認して全て足して」)
#   条件・中身の 確認は data/raw/ext_20261114/_manifest.tsv (1 枚ずつ 原文の ライセンスと 目視)。
#   ★福井県オープンデータ「福井ふるさと百景」= CC BY 4.0 / ★Wikimedia Commons = 1 枚ずつ CC BY 2.1 JP・4.0・BY-SA 4.0
#   ★鯖江市 360photo = CC BY-SA 4.0 (切り出した 改変物) / ★鯖江市「古い写真」083 = CC BY 3.0
#   ★群の 名に _sa が 付くものは CC BY-SA (★その 群の ファイルは CC BY-SA で 出す。CREDITS に 明記)
#   ★順番が「群#番号」の 番号に なる。並べ替えない
EXT = [
    ("pref_hyakkei_471.jpg", "nishiyama_sakura"),
    ("pref_hyakkei_472.jpg", "nishiyama_tsutsuji"),
    ("pref_hyakkei_473.jpg", "nishiyama_momiji"),
    ("pref_hyakkei_474.jpg", "kyoyo_teien"),
    ("pref_hyakkei_475.jpg", "zoo_sakura"),
    ("commons_dinosaur_museum_2025.jpg", "dino"),
    ("pref_hyakkei_164.jpg", "dino"),
    ("pref_hyakkei_161.jpg", "dino"),
    ("pref_hyakkei_162.jpg", "dino_inside"),
    ("pref_hyakkei_163.jpg", "dino_inside"),
    ("pref_hyakkei_22.jpg", "hanashobu_awara"),
    ("commons_w7_w3_2015.jpg", "shinkansen"),
    ("commons_fukui_st_shinkansen_platform_2024.jpg", "shinkansen"),
    ("commons_echizen_takefu_st_2025.jpg", "shinkansen"),
    ("commons_murakami_wakabayashi_tei.jpg", "murakami"),
    ("commons_sundome_fukui_2014.jpg", "sundome_sa"),
    ("commons_nishiyama_fountain_2016.jpg", "nishiyama_fountain_sa"),
    ("sabae_360_R0010038_front_crop.jpg", "illumination_sa"),
    ("sabae_furui_083.jpg", "furui_ski"),
]


# ★自分たちで 描いた イラスト (2026-11-15)。★元の 写真と 構図を 変えた ものだけ (翻案に しない)
#   ★めがね時計は 文字盤の 社名を 消した 版。★レンズの 中の 絵は 想像 (実物と 違う ことが ある)
OWN = [
    ("city_photos_for_illust_20261115/manga_illustrations/manga_14_nologo.png", "illust_meganetokei",
     "めがね時計 (イラスト。レンズの 絵は 想像)"),
    ("city_photos_for_illust_20261115/manga_illustrations/manga_18.png", "illust_pandabench",
     "結びの広場の レッサーパンダベンチ (イラスト)"),
    # ★2026-11-15: 写真の 無い 席を 埋める 13 枚 (イラスト依頼表。描かない もの = オチの 先回り を 外して 描いた)
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_bust.png", "illust_bust",
     "間部詮勝の 胸像 (イラスト。姿は 想像)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_zoo_gate.png", "illust_zoo_gate",
     "西山動物園の 入口 (イラスト)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_east_gate.png", "illust_east_gate",
     "西山公園の 東側の 入口 (イラスト)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_14-16/illust_pandarando3.png", "illust_pandarando3",   # ★2 は 動物の 顔の 飾りが あり 描き直し (16)
     "パンダらんどの 遊具 (イラスト)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_kopanda.png", "illust_kopanda",
     "こぱんだらんど (イラスト)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_inori2.png", "illust_inori2",
     "祈りの道の お地蔵さん (イラスト)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_parking.png", "illust_parking",
     "嚮陽会館前の 駐車場 (イラスト。工事中)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_baseball.png", "illust_baseball",
     "西山公園の 野球場 (イラスト)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_fountain_am.png", "illust_fountain_am",
     "朝の 大噴水 (イラスト。形は 想像)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_entrance.png", "illust_entrance",
     "西山公園の 正面入口の 広場 (イラスト)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_koryu.png", "illust_koryu",
     "道の駅の 交流室の 入口 (イラスト)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_michinoeki.png", "illust_michinoeki",
     "道の駅西山公園 (イラスト。形は 想像)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_all_13/illust_shinryoku.png", "illust_shinryoku",
     "西山公園の 夏の 木立 (イラスト)"),
    # ★2026-11-15: 季節の 食い違いを 直す 版 (14・15)
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_14-16/illust_east_gate_winter.png", "illust_east_gate_winter",
     "西山公園の 東側の 入口・冬 (イラスト)"),
    ("city_photos_for_illust_20261115/manga_illustrations/nishiyama_illust_14-16/illust_zoo_gate_summer.png", "illust_zoo_gate_summer",
     "西山動物園の 入口・夏 (イラスト)"),
]
OWN_CREDIT = "イラスト: Mugi-mugi-Mugi (CC BY 4.0)"


def ext_manifest():
    """_manifest.tsv → {ファイル名: {label, credit, license, url, sa}}"""
    m = P("data", "raw", "ext_20261114", "_manifest.tsv")
    out = {}
    if not os.path.exists(m):
        return out
    rows = io.open(m, encoding="utf-8").read().splitlines()
    head = rows[0].split("\t")
    for line in rows[1:]:
        c = line.split("\t")
        if len(c) < len(head):
            continue
        r = dict(zip(head, c))
        out[r["ファイル名"]] = {"label": r["何の写真か"], "credit": r["出典表示の文言"],
                               "license": r["ライセンス"], "url": r["元のページのURL"].split(" / ")[0],
                               "sa": r["継承(SA)の有無"].startswith("あり")}
    return out

# ★写真の 中身に 合わせた「何の写真か」(★ページの 見出しの ままだと 語りと 食い違う。2026-11-14 見直し)
#   愛の鐘 = 写っているのは ★いまの 姿 (柱の 上の スピーカー)。木の鐘・鉄筋コンクリートの 鐘 では ない
#   大噴水 = 写っているのは ★夜の ライトアップ
LABEL_OVERRIDE = {"ainokane": "いまの 愛の鐘 (頂上)", "funsui": "大噴水 (夜の ライトアップ)"}
# ★群の「何の写真か」(1 枚ずつの label が 無いとき)
GROUP_LABEL = {"tsutsuji": "西山公園の つつじ", "koyo": "西山公園の 紅葉",
               "panda": "西山動物園の レッサーパンダ", "zoo": "西山動物園の 動物"}


def zip_name(ds):
    """個体写真の zip の 中の フォルダ名 = その子の 名前。
    ★名前は UTF-8 で 入っている (旗が 立っていなくても)。★cp932 で 読むと
      「タカシ」が「繧ｿ繧ｫ繧ｷ」に 化ける = もっともらしい 別物。★UTF-8 を 先に 試す"""
    import zipfile
    p = P("data", "raw", "media", ds + ".zip")
    if not os.path.exists(p):
        return None
    for info in zipfile.ZipFile(p).infolist():
        try:
            raw = info.filename.encode("utf-8") if (info.flag_bits & 0x800) else info.filename.encode("cp437")
            n = raw.decode("utf-8")
        except UnicodeEncodeError:
            n = info.filename                           # ★Unicode の 名前の 欄を zipfile が もう 読んでいる
        except UnicodeDecodeError:
            continue                                    # ★読めない 名前は 使わない (化けたまま 出さない)
        if n.lower().endswith((".jpg", ".jpeg", ".png")) and "/" in n:
            return n.split("/")[0]
    return None


def clean_name(raw):
    """zip の フォルダ名を 表示用に 整える。→ (表示名, 照合に 使う 名の 一覧)
    ★市の ファイル名には 飾りが 付いている: 「レッサーパンダ画像(アケビ)サイズ変更」「梅花（めいしゃん）」
      「ボリビアリスザル個体画像」。★かっこの 中が 読みなら それも 照合に 使う"""
    import re
    if not raw:
        return "", []
    s = raw.strip()
    m = re.search(r"画像[(（]([^)）]+)[)）]", s)            # 「…画像(アケビ)…」→ アケビ
    if m:
        s = m.group(1)
    s = re.sub(r"(個体)?画像$|サイズ変更$", "", s).strip()
    names = [s]
    m = re.match(r"^(.+?)[(（]([^)）]+)[)）]$", s)           # 「楠（クス）」→ 楠 / クス
    if m:
        names = [m.group(1), m.group(2), s]
    return s, names


def extracted():
    """zip から取り出した個体写真。★1 枚ずつ出どころ (CKAN の dataset) が違うので、
    まとめて 1 つの出典にせず、写真ごとに dataset 名を持たせる。"""
    LABEL = {"panda": "西山動物園のレッサーパンダ写真", "zoo": "西山動物園の動物写真"}
    got = {}
    # ★_extract2 = 2026-11-14 に 足した 名前の 分かる 個体 (噺に 名前が 出る 子)
    for sub in ("_extract", "_extract2"):
        idx = P("data", "raw", "media", sub, "_index.txt")
        if not os.path.exists(idx):
            continue
        for line in io.open(idx, encoding="utf-8").read().splitlines():
            if not line.strip():
                continue
            key, fn, ds = line.split("	")[:3]
            got.setdefault(key, {"label": LABEL.get(key, key), "files": []})
            got[key]["files"].append((sub + "/" + fn, ds))
    return got
# 札は 1080 幅だが、写真は 810 幅で持って canvas 側で 伸ばす。
# 14 枚を 1080/品質62 で持つと 2.2MB を超え、file:// の 読み込みが 重くなるため。
WIDTH = 810
BAND = 360
QUALITY = 46
# ★噺の途中に 小さく 出す 写真 (挿し絵の 代わり。2026-09-23 作者の判断)
#   手描きの SVG は 抽象的すぎて 噺との つながりが 分からなかった。
SMALL_W = 480
SMALL_H = 320
SMALL_Q = 48


# ★札に 使う 群 (2026-11-20。札の 写真の 割り当ての 手順書 = 作業メモ)。★つつじ・紅葉は 前から ある (GROUPS)
CARD_FROM_SMALL = ["panda", "kyoyo_teien", "furui_ski", "murakami", "illumination_sa", "nishiyama_sakura",
                   "illust_east_gate", "illust_kopanda", "illust_parking", "illust_meganetokei", "illust_inori2",
                   "illust_koryu", "illust_michinoeki", "illust_fountain_am", "illust_baseball", "illust_pandabench"]


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
                "w": pix.width, "h": pix.height, "bytes": len(data), "_src": src}   # ★_src = 札用の 帯を 作る ため (書き出す 前に 消す)

    small, total = {}, 0
    for g in GROUPS:                      # つつじ / 紅葉 (群で 1 つの 出典)
        ss = []
        for name in g["files"]:
            src = P("data", "raw", "media", name)
            if os.path.exists(src):
                ss.append(dict(shrink_small(src), credit=g["credit"], url=g["url"],
                               label=GROUP_LABEL.get(g["key"], "")))
        if ss:
            small[g["key"]] = {"credit": g["credit"], "url": g["url"], "shots": ss}
    for key, info in extracted().items():  # 個体写真 (1 枚ずつ 出どころが 違う)
        ss = []
        for name, ds in info["files"]:
            src = P("data", "raw", "media", name)
            if os.path.exists(src):
                nm, alias = clean_name(zip_name(ds))   # ★その子の 名前 (zip の 中の フォルダ名を 整えたもの)
                lab = GROUP_LABEL.get(key, "")
                if nm:
                    lab = (lab + "「" + nm + "」") if key == "panda" else ("西山動物園の " + nm)
                ss.append(dict(shrink_small(src),
                               credit="鯖江市オープンデータ「" + info["label"] + "」(CC BY 2.1 JP)",
                               url="https://ckan.odp.jig.jp/dataset/" + ds,
                               name=nm or "", names=alias, label=lab))
        if ss:
            small[key] = {"credit": "鯖江市オープンデータ「" + info["label"] + "」(CC BY 2.1 JP)",
                          "url": "https://ckan.odp.jig.jp/", "shots": ss}
    # ★★2026-11-14: 鯖江市の 公式ページ・資料の 写真は ★使わない (PLACES / DOCS を 読まない)。
    #   市の「公式ホームページの考え方」に「画像…の 著作権は 鯖江市に 帰属」
    #   「許可なく 使用・複製・転載…二次利用 することを 禁止」(例外は 個人的・非営利 だけ) と ある。
    #   ★公開する 作品への 埋め込みは 例外に 当たらない。→ 外して、自由に 使える 写真で 差し替える。
    #   ★一覧は 経緯として 残す (使うなら 市の 許可を 取ってから USE_CITY_PHOTOS = True)
    for key, name, label, url in (PLACES if USE_CITY_PHOTOS else []):      # 場所ごとの 写真 (1 枚 = 1 か所)
        src = P("data", "raw", "media", name)
        if not os.path.exists(src):
            print("  見つからない:", src)
            continue
        credit = "鯖江市「" + label + "」(市公式ページ)"
        small[key] = {"credit": credit, "url": url,
                      "shots": [dict(shrink_small(src), credit=credit, url=url,
                                     label=LABEL_OVERRIDE.get(key, label))],
                      "label": label}
    for key, name, label in FURUI:            # ★古い写真 (CC BY)。1 枚ずつ 何の写真か
        src = P("data", "raw", "media", name)
        if not os.path.exists(src):
            print("  見つからない:", src)
            continue
        g = small.setdefault(key, {"credit": FURUI_CREDIT, "url": FURUI_URL, "shots": []})
        g["shots"].append(dict(shrink_small(src), credit=FURUI_CREDIT, url=FURUI_URL, label=label))
    for name, key, label in OWN:              # ★自分たちで 描いた イラスト
        src = P("data", "raw", *name.split("/"))
        if not os.path.exists(src):
            print("  見つからない:", src)
            continue
        g = small.setdefault(key, {"credit": OWN_CREDIT, "url": "", "shots": []})
        g["shots"].append(dict(shrink_small(src), credit=OWN_CREDIT, url="", label=label))
    man = ext_manifest()
    for fn, key in EXT:                       # ★外部の 自由に 使える 写真 (1 枚ずつ 条件を 確かめた もの)
        src = P("data", "raw", "ext_20261114", fn)
        info = man.get(fn)
        if not os.path.exists(src) or not info:
            print("  見つからない / 目録に 無い:", fn)
            continue
        g = small.setdefault(key, {"credit": info["credit"], "url": info["url"], "shots": []})
        if info["sa"]:
            g["sa"] = True
        # ★画面の 出典にも 縮小 (改変) した ことを 書く (CC BY は 変更の 明示が 要る。
        #   福井県の 利用規約も 改変した 場合の 書き方を 求めている)。★切り出しは 目録の 文言に 書いてある
        cr = info["credit"]
        if "切り出して" not in cr:
            cr += " / 縮小して使用"
        g["shots"].append(dict(shrink_small(src), credit=cr, url=info["url"],
                               label=info["label"], license=info["license"], sa=info["sa"]))
    for key, name, label, credit, url in (DOCS if USE_CITY_PHOTOS else []):  # ★市の 資料の 写真 (★使わない)
        src = P("data", "raw", "media", name)
        if not os.path.exists(src):
            print("  見つからない:", src)
            continue
        g = small.setdefault(key, {"credit": credit, "url": url, "shots": []})
        g["shots"].append(dict(shrink_small(src), credit=credit, url=url, label=label))

    for k, v in small.items():
        n = sum(x["bytes"] for x in v["shots"])
        total += n
        print("  小 %-9s %2d 枚 / %.0f KB" % (k, len(v["shots"]), n / 1024))
    print("  小 合計 %d 枚 / %.0f KB" % (sum(len(v["shots"]) for v in small.values()), total / 1024))
    # ★2026-11-20 作者の判断: 札の 写真を オチの 註が 指す もの の 写真に。★札に 使う 群だけ 札用の 帯を 元の 写真から 作る
    #   (★場面の 小さい 版を 伸ばすと 粗い)。★パンダは 22 枚 あるので 幅 640 で 軽く
    for k in CARD_FROM_SMALL:
        g = small.get(k)
        if not g or k in out:
            continue
        w = 640 if k == "panda" else WIDTH
        cs = []
        for s in g["shots"]:
            if not s.get("_src") or not os.path.exists(s["_src"]):
                continue
            data, cw, ch = shrink(s["_src"], w, int(BAND * w / WIDTH))
            c = {"dataUri": "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii"),
                 "w": cw, "h": ch, "bytes": len(data), "credit": s.get("credit", g["credit"])}
            if s.get("name"):
                c["name"] = s["name"]
            if s.get("names"):
                c["names"] = s["names"]
            cs.append(c)
        if cs:
            out[k] = {"credit": g["credit"], "url": g.get("url", ""), "shots": cs}
            if g.get("sa"):
                out[k]["sa"] = True
            print("  札 %-20s %2d 枚 / %.0f KB" % (k, len(cs), sum(x["bytes"] for x in cs) / 1024))
    for v in small.values():                   # ★元の 場所は 書き出さない (手元の パス = )
        for s in v["shots"]:
            s.pop("_src", None)
    out["_small"] = small

    write_split(out)


SHRINK_LIMIT = 0.8      # ★前の 目録の 8 割 未満に 減ったら 止める


def existing_groups(d):
    """いまの 目録 (_keys.js) に ある 群の 名 → {"small:…", "card:…"}。無ければ 空"""
    p = os.path.join(d, "_keys.js")
    if not os.path.exists(p):
        return set()
    t = io.open(p, encoding="utf-8").read()
    try:
        keys = json.loads(t.split("=", 1)[1].strip().rstrip(";"))
    except (IndexError, ValueError):
        return set()
    return {"small:" + k for k in keys.get("small", {})} | {"card:" + k for k in keys.get("card", {})}


def count_existing(d):
    """いまの 目録 (_keys.js) に ある 写真の 枚数 (場面 + 札)。無ければ 0"""
    p = os.path.join(d, "_keys.js")
    if not os.path.exists(p):
        return 0
    t = io.open(p, encoding="utf-8").read()
    try:
        keys = json.loads(t.split("=", 1)[1].strip().rstrip(";"))
    except (IndexError, ValueError):
        return 0
    return sum(v.get("n", 0) for v in keys.get("small", {}).values()) +         sum(v.get("n", 0) for v in keys.get("card", {}).values())


def write_split(out):
    """★群ごとに ファイルを 分けて 書く (2026-11-14)。
    ★前は 1 本の img.js (2.3MB) を 幕を 開けたときに 丸ごと 読んでいた。
    ★いまは 席に 要る 群だけを その席の 頭で 読む (app.js の loadImg)。
      data/img/<key>.js       … 噺の途中の 小さい写真 (群 1 つ)
      data/img/card_<key>.js  … 札に 敷く 写真 (つつじ / 紅葉)
      data/img/_keys.js       … どの群が あるか (★これだけ 最初に 読む。1KB 未満)
    ★どれも 同じ フォルダの ファイル = 外部通信は 増えない。"""
    d = P("app", "data", "img")
    os.makedirs(d, exist_ok=True)
    # ★消す 前に 数を 比べる (2026-11-20)。
    #   ★前は 入力の 写真が 1 枚も 無くても (= data/raw の 無い 公開物の 写しで 回すと)、
    #     ここで 全部 消して 空の 目録を 書き、終了コード 0 を 返していた。
    #   ★入力が 0 枚、または 前の 目録より 大きく 減ったら ★消さずに 止める (終了コード 1)。
    #     わざと 減らす ときは --force
    n_new = sum(len(v["shots"]) for v in out["_small"].values()) +         sum(len(v["shots"]) for k, v in out.items() if k != "_small")
    n_old = count_existing(d)
    # ★(2026-11-21) 枚数が 8 割を 越えて 残っても、★群が まるごと 消える ときは 止める
    #   (前は パンダの 群 22 枚 = 全体の 17% が そっくり 無くても 消して 終了コード 0 だった)
    gone = sorted(existing_groups(d) - ({"small:" + k for k in out["_small"]} |
                                        {"card:" + k for k in out if k != "_small"}))
    if gone and "--force" not in sys.argv:
        print("★止めました: いまの 目録に ある 群が %d 個 無くなります (%s)。app/data/img/ は 消していません。"
              % (len(gone), " ".join(gone)))
        print("  ★元の 写真 (data/raw/) の 置き場所を 確かめる。わざと 群を 外す ときは python tools/build_images.py --force")
        sys.exit(1)
    if n_new == 0 or (n_old and n_new < n_old * SHRINK_LIMIT and "--force" not in sys.argv):
        print("★止めました: 書き出す 写真が %d 枚 (いまの 目録は %d 枚)。app/data/img/ は 消していません。" % (n_new, n_old))
        print("  ★元の 写真 (data/raw/) が 無いと 作り直せません (data/raw は 公開物に 入っていません)。")
        print("  ★わざと 減らす ときは python tools/build_images.py --force")
        sys.exit(1)
    for name in os.listdir(d):                 # ★消えた 群の ファイルを 残さない
        if name.endswith(".js"):
            os.remove(os.path.join(d, name))
    head = ("/* 自動生成: python tools/build_images.py  (手で編集しない) */\n"
            "/* 写真と イラスト。出どころと 利用条件は 各群の credit と CREDITS.md。EXIF は除去済み */\n"   # ★2026-11-15: イラストの 群にも「公式写真」と 出ていた
            "window.HANASHI_IMG = window.HANASHI_IMG || {_small: {}};\n")
    keys = {"small": {}, "card": {}}
    def put(fn, lhs, obj):
        h = head
        if isinstance(obj, dict) and obj.get("sa"):
            # ★CC BY-SA の 群は ★先頭の 注記も SA に する (「CC BY 2.1 JP ほか」と 書かない)
            h = ("/* 自動生成: python tools/build_images.py  (手で編集しない) */\n"
                 "/* ★このファイルの 写真は CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.ja)。"
                 "このファイルは CC BY-SA 4.0 で 提供する。出典は 各写真の credit と CREDITS.md */\n"
                 "window.HANASHI_IMG = window.HANASHI_IMG || {_small: {}};\n")
        with io.open(os.path.join(d, fn), "w", encoding="utf-8", newline="\n") as f:
            f.write(h + lhs + " = ")
            json.dump(obj, f, ensure_ascii=False)
            f.write(";\n")
    for k, v in out["_small"].items():
        put(k + ".js", 'window.HANASHI_IMG._small["%s"]' % k, v)
        # ★名前の 一覧も 目録に 持つ (噺に 名前が 出たら その子の 写真を 選べるように。群を 読む 前に 分かる)
        nms = sorted(set(x for s in v["shots"] for x in (s.get("names") or ([s["name"]] if s.get("name") else []))))
        keys["small"][k] = {"n": len(v["shots"]), "label": v.get("label")}
        if nms:
            keys["small"][k]["names"] = nms
    for k, v in out.items():
        if k == "_small":
            continue
        put("card_" + k + ".js", 'window.HANASHI_IMG["%s"]' % k, v)
        keys["card"][k] = {"n": len(v["shots"])}
    with io.open(os.path.join(d, "_keys.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("/* 自動生成: python tools/build_images.py */\nwindow.HANASHI_IMG_KEYS = ")
        json.dump(keys, f, ensure_ascii=False)
        f.write(";\n")
    total = sum(os.path.getsize(os.path.join(d, n)) for n in os.listdir(d))
    print("written: %s (%d 本 / %.0f KB)" % (d, len(os.listdir(d)), total / 1024))
    old = P("app", "data", "img.js")
    if os.path.exists(old):
        os.remove(old)
        print("  ★古い 1 本ものの img.js を 消しました (GitHub 上でも 消してください)")


if __name__ == "__main__":
    main()
