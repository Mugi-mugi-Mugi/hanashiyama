# CREDITS — データと出典

このアプリの**プログラム**は MIT License です。
以下の**データ・引用**は MIT の対象外で、それぞれの出典の条件に従います。

## オープンデータ (データの加工あり)

提供: 福井県鯖江市 (オープンデータプラットフォーム https://ckan.odp.jig.jp/)
ライセンス: クリエイティブ・コモンズ 表示 2.1 日本 (CC BY 2.1 JP) https://creativecommons.org/licenses/by/2.1/jp/

| データセット | 使い方 | 加工 |
|---|---|---|
| レッサーパンダ飼育個体情報 | 県の話・誕生日の話・事実 F15 / F16 / F24 | 移動先の都道府県を付与、集計 |
| 西山公園のツツジ種類・株数 | 事実 F11 | 合計の確認 |
| 【都道府県別割合】令和７年度 西山公園入場者（人流データ） | 事実 F21 | 数値の引用 |
| 【日別】令和７年度 西山公園東側来訪者数（人流データ） | 事実 F22 | 最大・最小日の抽出 |
| 西山公園ツツジ画像 | ★札(オチの画像)の背景 7 枚 | 中央を帯に切り出し・縮小・再エンコード (EXIF 除去) |
| 西山公園の紅葉画像 | ★札(オチの画像)の背景 7 枚 | 同上 |
| レッサーパンダ飼育個体情報 ほか | 県の噺・暦の噺・事実 F15/F16/F24 | 集計・都道府県の付与 |

**人流データの提供元：(株)Agoop** (マチレポ)。数値は個人情報保護等の観点から端数処理されています。

取得日: 2026-09-16 (写真は 2026-09-21 に取得・加工)

★写真は `app/data/img.js` に data URI として埋め込んでいます。

| 使い所 | 枚数 | 元データ |
|---|---|---|
| 噺の途中 (小・幅480px) | **33 枚** | つつじ 7 / 紅葉 7 / レッサーパンダの個体写真 16 / ほかの動物 3 |
| 札の背景 (帯・幅810px) | 14 枚 | つつじ 7 / 紅葉 7 |

レッサーパンダとほかの動物の写真は、**個体ごとに別のデータセット**です
(`18207_redpanda〈個体名〉picture` / `18207_boribiarisuzarupictures` /
`18207_furansowarutonpicture` / `18207_shirotetenagazarupicture`)。
画面では**写真ごとに出どころを表示**しています。
生成は `python tools/build_images.py`。元データは上記 CC BY 2.1 JP のデータセットです。
「もう一席」のたびに、まだ出していない 1 枚を選びます。

★2026-09-23: 噺の途中に出していた**手描きの挿し絵は削除**し、
**関係する写真を小さく出す**形に変えました (抽象的すぎて噺とのつながりが分からなかったため)。

## 語りの出典 (短い引用)

語りに使った事実は、次のページの記述を確認し、原文を短く引用しています (`app/data/facts.json`)。

- 鯖江市「西山公園の歴史」 https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/koenrekishi.html
- 鯖江市「先人を偲ぶ 間部詮勝」 https://www.city.sabae.fukui.jp/about_city/shinoshokai/sonota/senjinwoshinobu/senjin-manabe.html
- 鯖江市 観光「鯖江の歴史」 https://www.city.sabae.fukui.jp/kanko/about/history.html
- 鯖江市 観光「西山公園」 https://www.city.sabae.fukui.jp/kanko/feature/nishiyama.html
- 鯖江市「「祈りの道」について」 https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/inorinomichi.html
- 鯖江市「西山公園に眼鏡型の時計モニュメントが設置されました」 https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/Keikaku0120215.html
- 鯖江市西山動物園「レッサーパンダ よくある質問」 https://www.city.sabae.fukui.jp/nishiyama_zoo/panda/redpanda_faq.html
- 鯖江市西山動物園 お知らせ https://www.city.sabae.fukui.jp/nishiyama_zoo/news/index.html
- 鯖江市議会 会議録 https://www.city.sabae.fukui.dbsr.jp/
- ふるさとチョイス ガバメントクラウドファンディング (福井県鯖江市) https://www.furusato-tax.jp/gcf/988
- コトバンク「間部詮勝」(ブリタニカ国際大百科事典 小項目事典 / デジタル版 日本人名大辞典+Plus / 日本大百科全書ニッポニカ) https://kotobank.jp/word/%E9%96%93%E9%83%A8%E8%A9%AE%E5%8B%9D-16651
- コトバンク「吉田松陰」(日本大百科全書ニッポニカ / 改訂新版 世界大百科事典) https://kotobank.jp/word/%E5%90%89%E7%94%B0%E6%9D%BE%E9%99%B0
- ふくいドットコム イベント情報 https://www.fuku-e.com/event/detail_5740.html
- Wikipedia「日本の動物園一覧」(動物園の所在都道府県の対応づけ) https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E3%81%AE%E5%8B%95%E7%89%A9%E5%9C%92%E4%B8%80%E8%A6%A7

確認日: 2026-09-17

---

## 鯖江市の公式ページに掲載されている写真 (★オープンデータではありません)

園内の場所の写真は CKAN のオープンデータに無かったため、**鯖江市の公式ページに掲載されている
写真**を使わせていただきました。**CC BY ではありません。**出典を明記して使用しています。

| 使っている写真 | 掲載ページ |
|---|---|
| 道の駅西山公園 / 芝生広場 / 結びの広場 / 大噴水 / 西山橋 / 上段の庭 / 北の庭 / パンダらんど / 愛の鐘 / 展望台 / 松堂庵 (11 枚) | 鯖江市「西山公園の施設」 https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/Nishiyama-Shisetsu.html |
| 祈りの道 (1 枚) | 鯖江市「「祈りの道」について」 |
| 鯖江百景 西山公園 / 嚮陽会館周辺 / 歴史の道 / 三十三間堂 (4 枚) | 鯖江市「鯖江百景」 https://www.city.sabae.fukui.jp/kanko_sangyo/kankoshisetsu_meisho/sabaehyakkei/ |

画面では**写真ごとに出どころを表示**しています。取得日: 2026-09-23

## レッサーパンダ家系図 (CC BY 2.1 JP)

| データセット | 使い方 | 加工 |
|---|---|---|
| レッサーパンダ家系図 | どの都道府県につながりがあるかの発見 / 事実 F63・F64 | **XLSX 内の EMF 画像から文字を機械抽出**し、個体・園に分解して集計 |

提供: 福井県鯖江市 https://ckan.odp.jig.jp/
ライセンス: CC BY 2.1 JP https://creativecommons.org/licenses/by/2.1/jp/

## ★データの改変について (CC BY の表示義務)

CC BY 2.1 JP の「表示」は、原著作者名・作品タイトル・ライセンスに加えて
**改変した場合はその旨**を求めます。このアプリは次の改変をしています。

| データ | 改変の中身 |
|---|---|
| レッサーパンダ家系図 | 図の中の文字を機械抽出 → 個体・園に分解 → 集計。**園の正式名は当方の推定を含みます** |
| レッサーパンダ飼育個体情報 | 移動先の都道府県を付与、集計 |
| 人流データ / 観光客入込数 | 数値の引用、最大・最小日の抽出 |
| ツツジ種類・株数 | 合計の確認 |
| 写真 | 中央を帯に切り出し・縮小・再エンコード (EXIF 除去) |

★**「園の推定正式名」は鯖江市のデータに書かれていません。**当方が飼育個体情報と
突き合わせて当てたものです。そう読まれない形にしています。

★家系図から抽出したデータには、**機械抽出による壊れが 27 件**あることを確認しています
(名前の取り違え・生年の桁の入れ替わり・園名の推定誤り・図の凡例の混入)。
語りに使っているのは、**飼育個体情報と名前・生年が一致した 52 行だけ**です。

## 出典表示ではないもの (数値の引用のみ)

次は CC BY ではないため、**再配布せず、数値の引用と出典明記に留めています。**

- 福井県「観光客入込数(推計)」 https://www.pref.fukui.lg.jp/doc/kankou/fukuiken-kankoukyakusu.html
