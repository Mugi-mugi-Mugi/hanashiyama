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

★**音声** (2026-09-25 追加): レッサーパンダの鳴き声 1 本を `app/data/koe.js` に
data URI で埋め込んでいます (鯖江市オープンデータ「レッサーパンダ鳴き声」CC BY 2.1 JP)。
**自動では鳴りません。**「鳴き声を聞く」を押したときだけ再生します。
埋め込みなので、再生時も外部への通信は発生しません。

**人流データの提供元：(株)Agoop** (マチレポ)。数値は個人情報保護等の観点から端数処理されています。

取得日: 2026-09-16 (写真は 2026-09-21 に取得・加工)

★写真は `app/data/img.js` に data URI として埋め込んでいます。

| 使い所 | 枚数 | 元データ |
|---|---|---|
| 噺の途中 (小・幅480px) | **49 枚** | つつじ 7 / 紅葉 7 / レッサーパンダの個体写真 16 / ほかの動物 3 / 園内の施設・景観 16 |
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

語りに使った事実は、次のページの記述を確認し、原文を短く引用しています
(`app/data/facts.json` に 1 件ずつ、出典名・原文・URL・確かさ・確認日を持たせています)。
画面の「タネ明かし」からも、その席が使った事実の出典を確かめられます。

<!-- ここから 自動生成: python tools/build_credits.py -->

### 語りに使った事実の出典 (66 件 / 出典 49 種 / URL 43 本)

★この節は `python tools/build_credits.py` が `app/data/facts.json` から作り直します。
手で書き足さないでください (足しても次の実行で消えます)。

| 事実 | 出典 | URL |
|---|---|---|
| F31 | Wikipedia「北陸新幹線」 | <https://ja.wikipedia.org/wiki/%E5%8C%97%E9%99%B8%E6%96%B0%E5%B9%B9%E7%B7%9A> |
| F25 | Wikipedia「日本の動物園一覧」ほか 各園の公式サイト (2026-09-16 調査) | <https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E3%81%AE%E5%8B%95%E7%89%A9%E5%9C%92%E4%B8%80%E8%A6%A7> |
| F20 | ふくいドットコム イベント情報 | <https://www.fuku-e.com/event/detail_5740.html> |
| F08 | ふるさとチョイス ガバメントクラウドファンディング(福井県鯖江市のプロジェクト) | <https://www.furusato-tax.jp/gcf/988> |
| F05 | コトバンク「吉田松陰」(日本大百科全書ニッポニカ / 改訂新版 世界大百科事典) | <https://kotobank.jp/word/%E5%90%89%E7%94%B0%E6%9D%BE%E9%99%B0> |
| F06 | コトバンク「間部詮勝」(ブリタニカ国際大百科事典 小項目事典 / デジタル版 日本人名大辞典+Plus) | <https://kotobank.jp/word/%E9%96%93%E9%83%A8%E8%A9%AE%E5%8B%9D-16651> |
| F04 | コトバンク「間部詮勝」(日本大百科全書ニッポニカ) / 鯖江市「先人を偲ぶ 間部詮勝」 | <https://kotobank.jp/word/%E9%96%93%E9%83%A8%E8%A9%AE%E5%8B%9D-16651> |
| F32 | 各都道府県の公式観光サイト | <https://www.fuku-e.com/> |
| F53 | 国土交通省 近畿地方整備局「道の駅 西山公園」 | <https://www.kkr.mlit.go.jp/road/michi_no_eki/contents/fukui/nisiyamakouen.html> |
| F35 | 太田市 公式 / 鯖江市 公式（沿革） | <https://www.city.ota.gunma.jp/> |
| F34 | 新宿区 公式（こどもページ） | <https://www.city.shinjuku.lg.jp/kids/about_0001.html> |
| F33 | 日本動物園水族館協会 飼育動物検索 と 各園の公式サイト | <https://www.jaza.jp/> |
| F36 | 村上市 公式 / 鯖江市 公式 | <https://www.city.murakami.lg.jp/> |
| F27 | 福井県「福井県観光客入込数(推計) 令和6年」(023.pdf) | <https://www.pref.fukui.lg.jp/doc/kankou/fukuiken-kankoukyakusu_d/fil/023.pdf> |
| F26 F28 F29 F30 | 福井県「福井県観光客入込数(推計) 令和7年」(024.pdf) | <https://www.pref.fukui.lg.jp/doc/kankou/fukuiken-kankoukyakusu_d/fil/024.pdf> |
| F51 | 道の駅西山公園 公式サイト 利用案内(指定管理者 株式会社ネクサス富士屋) | <https://nishiyama-park.jp/guide/> |
| F54 | 鯖江市 公園緑地課「西山公園 施設のご案内」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/Nishiyama-Shisetsu.html> |
| F58 | 鯖江市 公園緑地課「西山公園「こぱんだらんど」」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/kopanda-open.html> |
| F50 F57 | 鯖江市 公園緑地課「西山公園の歴史」年表 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/koenrekishi.html> |
| F37 | 鯖江市 公式 | <https://www.city.sabae.fukui.jp/about_city/shinoshokai/sabaenohana.html> |
| F61 | 鯖江市 公式(西山公園のページ) | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/> |
| F42 | 鯖江市 公式「西山公園」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/> |
| F60 | 鯖江市 公式ドメイン上の配布資料(ポスター PDF) | <https://www.city.sabae.fukui.jp/> |
| F03 | 鯖江市 観光「西山公園」特集 | <https://www.city.sabae.fukui.jp/kanko/feature/nishiyama.html> |
| F02 | 鯖江市 観光「鯖江の歴史」 | <https://www.city.sabae.fukui.jp/kanko/about/history.html> |
| F55 | 鯖江市 観光特集「西山公園でたっぷり遊ぼ！」／鯖江市 公園緑地課「西山公園 北の庭」 | <https://www.city.sabae.fukui.jp/kanko/feature/nishiyama.html> |
| F56 | 鯖江市 観光特集「西山公園でたっぷり遊ぼ！」／鯖江市 公園緑地課「西山公園の歴史」年表 | <https://www.city.sabae.fukui.jp/kanko/feature/nishiyama.html> |
| F12 | 鯖江市「「祈りの道」について」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/inorinomichi.html> |
| F07 | 鯖江市「先人を偲ぶ 間部詮勝」(見出し: 出世と幻の鯖江城) | <https://www.city.sabae.fukui.jp/about_city/shinoshokai/sonota/senjinwoshinobu/senjin-manabe.html> |
| F14 | 鯖江市「西山公園に眼鏡型の時計モニュメントが設置されました」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/Keikaku0120215.html> |
| F01 F10 F13 F40 | 鯖江市「西山公園の歴史」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/koenrekishi.html> |
| F52 | 鯖江市「西山動物園レッサーパンダライブカメラ」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/nishiyamadobutsuen/panda-raibu.html> |
| F22 F62 F65 F66 F67 | 鯖江市オープンデータ「【日別】令和７年度 西山公園東側来訪者数(人流データ)」 | <https://ckan.odp.jig.jp/dataset/18207_nishiyamakoenhigashigawanraihosyasu> |
| F21 | 鯖江市オープンデータ「【都道府県別割合】令和７年度 西山公園入場者(人流データ)」 | <https://ckan.odp.jig.jp/dataset/18207_nishiyamakoentodohukenbetsuwariai> |
| F63 F64 | 鯖江市オープンデータ「レッサーパンダ家系図」と「レッサーパンダ飼育個体情報」 | <https://ckan.odp.jig.jp/dataset/0bc03d58-8121-4ec3-8325-80212b662a38/resource/b39b92d9-8312-4755-b492-35aeb025f019/download/20260228.xlsx> |
| F68 | 鯖江市オープンデータ「レッサーパンダ家系図」と「レッサーパンダ飼育個体情報」 | <https://ckan.odp.jig.jp/dataset/0bc03d58-8121-4ec3-8325-80212b662a38/resource/b39b92d9-8312-4755-b49d-9a3a6f9c3a5f> |
| F15 F24 | 鯖江市オープンデータ「レッサーパンダ飼育個体情報」 | <https://ckan.odp.jig.jp/dataset/https-ckan-odp-jig-jp-dataset-18207_redpandashiikukotai> |
| F16 | 鯖江市オープンデータ「レッサーパンダ飼育個体情報」(2026-09-17 集計) | <https://ckan.odp.jig.jp/dataset/https-ckan-odp-jig-jp-dataset-18207_redpandashiikukotai> |
| F73 | 鯖江市オープンデータ「動物園関係(福井県鯖江市)」 | <https://ckan.odp.jig.jp/dataset/jp-fukui-sabae-174-odp> |
| F72 | 鯖江市オープンデータ「嚮陽会館駐車場 出庫台数（日別）」 | <https://ckan.odp.jig.jp/dataset/kyouyouparkingfacilityapril2026> |
| F71 | 鯖江市オープンデータ「市営駐車場情報」と「嚮陽会館駐車場 出庫台数（日別）」 | <https://ckan.odp.jig.jp/dataset/kyouyouparkingfacilityapril2025> |
| F11 F38 | 鯖江市オープンデータ「西山公園のツツジ種類・株数」 | <https://ckan.odp.jig.jp/dataset/18207_nishiyamatsutsuji> |
| F69 F70 | 鯖江市オープンデータ「西山動物園入場者数(月別)」 | <https://ckan.odp.jig.jp/dataset/18207_nyujoshasu2> |
| F23 | 鯖江市公式サイト | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/inorinomichi.html> |
| F17 F18 | 鯖江市西山動物園 お知らせ | <https://www.city.sabae.fukui.jp/nishiyama_zoo/news/index.html> |
| F41 | 鯖江市西山動物園 公式「動物紹介」 | <https://www.city.sabae.fukui.jp/nishiyama_zoo/animals/animal.html> |
| F39 | 鯖江市西山動物園 公式「沿革」 | <https://www.city.sabae.fukui.jp/nishiyama_zoo/info/history.html> |
| F59 | 鯖江市西山動物園「リスザルとのふれあい体験」 | <https://www.city.sabae.fukui.jp/nishiyama_zoo/risuzaruevent.html> |
| F09 | 鯖江市西山動物園「レッサーパンダ よくある質問」 | <https://www.city.sabae.fukui.jp/nishiyama_zoo/panda/redpanda_faq.html> |
| F19 | 鯖江市議会 会議録(令和8年3月定例会 一般質問、文書Id 1393) | <https://www.city.sabae.fukui.dbsr.jp/100000?Template=document&Id=1393> |

<!-- ここまで 自動生成 -->

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
