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
| レッサーパンダの個体別の写真 (個体ごとのデータセット) | 噺の途中の写真 22 枚 (名前の出る席ではその子の写真) | 縮小・再エンコード (EXIF 除去) |

★**音声** (2026-09-25 追加): レッサーパンダの鳴き声 1 本を `app/data/koe.js` に
data URI で埋め込んでいます (鯖江市オープンデータ「レッサーパンダ鳴き声」CC BY 2.1 JP)。
**自動では鳴りません。**「鳴き声を聞く」を押したときだけ再生します。
埋め込みなので、再生時も外部への通信は発生しません。

**人流データの出典：株式会社Agoop「マチレポ」提供データ**。数値は個人情報保護等の観点から端数処理されています。

取得日: 2026-09-16 (写真は 2026-09-21 に取得・加工。古い写真・個体写真の一部は 2026-11-14 に追加。外部の写真は下の「外部の自由に使える写真」を参照)

★写真とイラストは `app/data/img/` (場所・季節の群ごとのファイル) に data URI として埋め込んでいます。

| 使い所 | 枚数 | 元データ |
|---|---|---|
| 噺の途中 (小・480×320 の枠に収まる大きさ。場面の背景に敷く) | **82 枚** (40 ファイル) = 写真 65 枚 (23 ファイル) + イラスト 17 枚 (17 ファイル) | 下の表のとおり |
| 札の背景 (帯・幅810px。レッサーパンダは 640px) | 51 枚 (18 ファイル) | **オチが指すものの写真** (2026-11-20 から)。つつじ 7 / 紅葉 7 (鯖江市オープンデータ) / レッサーパンダ 22 (鯖江市オープンデータ) / 嚮陽庭園・夜桜 (福井ふるさと百景) / 莇生田スキー場 (古い写真) / 村上市 若林邸・イルミネーション (下の表のとおり) / イラスト 10。合うものが無い噺は つつじ か 紅葉 |

噺の途中の 82 枚の出どころ:

| 出どころ | 枚数 | ライセンス | 中身 |
|---|---|---|---|
| 鯖江市オープンデータ (画像のデータセット) | 39 | CC BY 2.1 JP | つつじ 7 / 紅葉 7 / レッサーパンダの個体写真 22 / ほかの動物 3 |
| 鯖江市オープンデータ「古い写真」 | 8 | CC BY (1 枚は CC BY 3.0) | 西山公園・西山橋・鯖江駅など 7 / 莇生田スキー場 1 |
| 鯖江市オープンデータ「360photo」 | 1 | **CC BY-SA 4.0** | 西山公園のイルミネーション (全天球から切り出し) |
| 福井県オープンデータ「福井ふるさと百景」 | 10 | CC BY 4.0 | 西山公園 4 / 西山動物園 1 / 恐竜博物館 4 / 北潟湖の花菖蒲園 1 |
| Wikimedia Commons | 7 | CC BY 2.1 JP 1 / CC BY 4.0 4 / **CC BY-SA 4.0 2** | 北陸新幹線と駅 3 / 恐竜博物館の入口 1 / 村上市の若林邸 1 / サンドーム福井 1 / 西山公園の夜の噴水 1 |
| イラスト (作者 Mugi-mugi-Mugi) | 17 | CC BY 4.0 | 西山公園・西山動物園・道の駅などの場所 (下の「イラスト」の節) |

以前の版で使っていた鯖江市の公式ページの写真 (園内の施設など) は、利用条件を確かめ直した結果、2026-11-14 に外しました。
いまの版には入っていません。

レッサーパンダとほかの動物の写真は、**個体ごとに別のデータセット**です
(`18207_redpanda〈個体名〉picture` / `18207_redpanda〈個体名〉pictures` / `18207_boribiarisuzarupictures` /
`18207_furansowarutonpicture` / `18207_shirotetenagazarupicture`)。
名前の分かる個体のうち タカシ / シュララ / ソウソウ / ミルキー / ライト / ニーコ の 6 枚は 2026-11-14 に追加しました。

古い写真は、鯖江市オープンデータ「古い写真」(CC BY) の 7 枚です (提供: 福井県鯖江市 https://ckan.odp.jig.jp/ 。縮小・再エンコード・EXIF 除去の加工あり):
西山公園のつつじ植樹 (1958年) / 開園まもない西山公園 (1959年) / 西山橋からの風景 南・北 (1964年) /
西山の切割り (年は記録なし) / 鯖江駅のホーム (1958年) / 鯖江駅前の通り (1968年)。
同じデータセットの莇生田スキー場 (1973年) の 1 枚は、下の「外部の自由に使える写真」に載せています。

画面では**写真の隅に「何の写真か」と、1 枚ごとの出どころ・利用条件を 1 行で常に表示**しています (例「福井ふるさと百景 (CC BY 4.0)」「Wikimedia Commons・作者名 (CC BY-SA 4.0)」「イラスト: Mugi-mugi-Mugi (CC BY 4.0)」)。
作品名・提供者・ライセンスの全文などの正式な表示は、この CREDITS.md の各表に載せています。
生成は `python tools/build_images.py`。元データは上記の鯖江市オープンデータと、下の「外部の自由に使える写真」「イラスト」です。
写真は噺の場面に合わせて選びます。手書きの席は台本で場面ごとに写真を指定し、県の噺・暦の噺は噺に出てくる名前 (その子の写真) と場所の語で選びます。
**合う写真が無い場面では出しません。** オチや問いの答えを先に見せる写真も置きません。
同じ群の中から選ぶときは、まだ出していない 1 枚を選びます。

★2026-09-23: 噺の途中に出していた**手描きの挿し絵は削除**し、
**関係する写真を小さく出す**形に変えました (抽象的すぎて噺とのつながりが分からなかったため)。
2026-11-15 に足した 17 枚のイラスト (下の節) は、噺に出てくる場所を描いたもので、その場所を語る場面にだけ出します (写真の無い場面を埋めるため)。

## イラスト (2026-11-15 追加。17 枚)

画面の出典表示は「イラスト: Mugi-mugi-Mugi (CC BY 4.0)」。縮小・再エンコードして埋め込んでいます。

| ファイル (`app/data/img/`) | 何の絵か | 出る席 | 注意 |
|---|---|---|---|
| `illust_meganetokei.js` | めがね時計 (西山公園の入口にある眼鏡型の時計モニュメント) | 「めがね時計」(現地の謎かけを解いたあとに開く席) | 文字盤の社名は描いていません。**レンズの中の絵は想像**で、実物とは違います |
| `illust_pandabench.js` | 結びの広場のレッサーパンダベンチ | 「広場のベンチ」(現地の謎かけを解いたあとに開く席) | 斜め上から見た絵です |
| `illust_bust.js` | 幕末の老中の胸像 | 「命日」(11 月 28 日) / 「のんびり見えた殿様」の席 2 つ | **姿は想像**です。実物の胸像を写したものではありません |
| `illust_zoo_gate.js` / `illust_zoo_gate_summer.js` | 西山動物園の入口 (秋 / 夏) | 動物園の噺 3 席 / 誕生日の噺 (夏の日) | 看板の字・動物は描いていません |
| `illust_east_gate.js` / `illust_east_gate_winter.js` | 西山公園の東側の入口 (晴れ / 冬) | 人の数を推し量った表の噺 | 雪は描いていません |
| `illust_entrance.js` | 正面入口の広場 | 1 席 | 時計は描いていません |
| `illust_pandarando3.js` | パンダらんどの遊具 | 2 席 | |
| `illust_kopanda.js` | こぱんだらんど | 1 席 | |
| `illust_inori2.js` | 祈りの道のお地蔵さん | 1 席 | |
| `illust_parking.js` | 嚮陽会館前の駐車場 (工事中) | 2 席 | 車のナンバーは描いていません |
| `illust_baseball.js` | 野球場 | 1 席 | |
| `illust_fountain_am.js` | 朝の大噴水 | 1 席 | 細部は想像です |
| `illust_koryu.js` | 道の駅の交流室の入口 | 1 席 | |
| `illust_michinoeki.js` | 道の駅西山公園 | 1 席 | 建物の形は想像で、実物とは違います |
| `illust_shinryoku.js` | 西山公園の夏の木立 | 夏 (7〜8 月) に開いたときの、噺に入る前の 1 枚 | |

17 枚とも画像生成 AI (ChatGPT) を使って作成しました。実在の場所の雰囲気を描いたもので、**細部は想像**を含みます。

**利用条件: クリエイティブ・コモンズ 表示 4.0 国際 (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/deed.ja)。** 表示は「イラスト: Mugi-mugi-Mugi」。
生成 AI で作った部分に著作権が生じない場合、その部分はこの条件にかかわらず自由に使えます。

## 語りの出典 (短い引用)

語りに使った事実は、次のページの記述を確認し、原文を短く引用しています
(`app/data/facts.json` に 1 件ずつ、出典名・原文・URL・確かさ・確認日を持たせています)。
画面の「タネ明かし」からも、その席が使った事実の出典を確かめられます。

<!-- ここから 自動生成: python tools/build_credits.py -->

### 語りに使った事実の出典 (77 件 / 出典 56 種 / URL 47 本)

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
| F81 | 中日新聞「眼鏡形の映えるベンチ登場 鯖江・西山公園の展望デッキ」(2023年10月11日) | <https://www.chunichi.co.jp/article/786256> |
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
| F79 | 鯖江市 報道機関連絡票「レッサーパンダベンチ完成」(2026年8月20日) | <https://www.city.sabae.fukui.jp/about_city/koho_kocho/kishahappyo/reiwa8/20260820.files/20260820-4.pdf> |
| F03 | 鯖江市 観光「西山公園」特集 | <https://www.city.sabae.fukui.jp/kanko/feature/nishiyama.html> |
| F02 | 鯖江市 観光「鯖江の歴史」 | <https://www.city.sabae.fukui.jp/kanko/about/history.html> |
| F80 | 鯖江市 観光ページ「西山公園でたっぷり遊ぼ！」 | <https://www.city.sabae.fukui.jp/kanko/feature/nishiyama.html> |
| F55 | 鯖江市 観光特集「西山公園でたっぷり遊ぼ！」／鯖江市 公園緑地課「西山公園 北の庭」 | <https://www.city.sabae.fukui.jp/kanko/feature/nishiyama.html> |
| F56 | 鯖江市 観光特集「西山公園でたっぷり遊ぼ！」／鯖江市 公園緑地課「西山公園の歴史」年表 | <https://www.city.sabae.fukui.jp/kanko/feature/nishiyama.html> |
| F12 | 鯖江市「「祈りの道」について」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/inorinomichi.html> |
| F07 | 鯖江市「先人を偲ぶ 間部詮勝」(見出し: 出世と幻の鯖江城) | <https://www.city.sabae.fukui.jp/about_city/shinoshokai/sonota/senjinwoshinobu/senjin-manabe.html> |
| F78 | 鯖江市「眼鏡型時計モニュメントに掲載する鯖江市のＰＲデザイン募集要項」(令和4年) | <https://www.city.sabae.fukui.jp/about_city/koho_kocho/kishahappyo/reiwa4/20220406.files/20220406-05.pdf> |
| F74 F75 F76 F77 | 鯖江市「第458回鯖江市議会定例会 提案理由説明要旨(令和8年8月26日)」 | <https://www.city.sabae.fukui.jp/about_city/shichonoheya/shoshinhyomei/reiwa8/CmsAdmin202608263.html> |
| F14 | 鯖江市「西山公園に眼鏡型の時計モニュメントが設置されました」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/Keikaku0120215.html> |
| F01 F10 F13 F40 | 鯖江市「西山公園の歴史」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/koen/nishiyama/koenrekishi.html> |
| F84 | 鯖江市「西山公園・西山動物園」パンフレット | <https://www.city.sabae.fukui.jp/nishiyama_zoo/guide/images/pamphlet.pdf.pdf> |
| F52 | 鯖江市「西山動物園レッサーパンダライブカメラ」 | <https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/nishiyamadobutsuen/panda-raibu.html> |
| F22 F62 F65 F66 F67 | 鯖江市オープンデータ「【日別】令和７年度 西山公園東側来訪者数(人流データ)」(株式会社Agoop「マチレポ」提供データ) | <https://ckan.odp.jig.jp/dataset/18207_nishiyamakoenhigashigawanraihosyasu> |
| F21 F83 | 鯖江市オープンデータ「【都道府県別割合】令和７年度 西山公園入場者(人流データ)」(株式会社Agoop「マチレポ」提供データ) | <https://ckan.odp.jig.jp/dataset/18207_nishiyamakoentodohukenbetsuwariai> |
| F63 F64 | 鯖江市オープンデータ「レッサーパンダ家系図」と「レッサーパンダ飼育個体情報」 | <https://ckan.odp.jig.jp/dataset/0bc03d58-8121-4ec3-8325-80212b662a38/resource/b39b92d9-8312-4755-b492-35aeb025f019/download/20260228.xlsx> |
| F68 | 鯖江市オープンデータ「レッサーパンダ家系図」と「レッサーパンダ飼育個体情報」 | <https://ckan.odp.jig.jp/dataset/0bc03d58-8121-4ec3-8325-80212b662a38/resource/b39b92d9-8312-4755-b49d-9a3a6f9c3a5f> |
| F15 F24 | 鯖江市オープンデータ「レッサーパンダ飼育個体情報」 | <https://ckan.odp.jig.jp/dataset/https-ckan-odp-jig-jp-dataset-18207_redpandashiikukotai> |
| F16 | 鯖江市オープンデータ「レッサーパンダ飼育個体情報」(2026-09-17 集計) | <https://ckan.odp.jig.jp/dataset/https-ckan-odp-jig-jp-dataset-18207_redpandashiikukotai> |
| F82 | 鯖江市オープンデータ「レッサーパンダ飼育個体情報」(2026-11-15 集計) | <https://ckan.odp.jig.jp/dataset/https-ckan-odp-jig-jp-dataset-18207_redpandashiikukotai> |
| F73 | 鯖江市オープンデータ「動物園関係(福井県鯖江市)」 | <https://ckan.odp.jig.jp/dataset/jp-fukui-sabae-174-odp> |
| F72 | 鯖江市オープンデータ「嚮陽会館駐車場 出庫台数（日別）」 | <https://ckan.odp.jig.jp/dataset/kyouyouparkingfacilityapril2025> |
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

## 外部の自由に使える写真 (2026-11-14 追加。19 枚)

1 枚ずつ、元のページでライセンスと写っているものを確かめてから使っています。
画面では写真ごとに「何の写真か」と出典を表示しています。取得日: 2026-11-14

### 福井県オープンデータ「福井ふるさと百景」(CC BY 4.0) 10 枚

このアプリは以下の著作物を改変して利用しています (縮小・再エンコード・EXIF 除去)。

| 何の写真か | 出典表示 | 元のページ |
|---|---|---|
| 西山公園 さくらのライトアップ（鯖江市・2008年） | 福井ふるさと百景「西山公園（さくらのライトアップ）」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） | https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/list6_hyakkei41-60.html |
| 西山公園のつつじ（鯖江市・2013年以前） | 福井ふるさと百景「西山公園（つつじまつり（毎年5月3～5日開催））」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） | https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/list6_hyakkei41-60.html |
| 西山公園のもみじ（鯖江市・2013年以前） | 福井ふるさと百景「西山公園（もみじまつり（毎年11月1～30日開催））」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） | https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/list6_hyakkei41-60.html |
| 嚮陽庭園の紅葉（西山公園・2007年） | 福井ふるさと百景「紅葉に映える日本庭園（嚮陽庭園）」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） | https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/list6_hyakkei41-60.html |
| 西山動物園のレッサーパンダと桜（2007年） | 福井ふるさと百景「西山動物園」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） | https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/list6_hyakkei41-60.html |
| 福井県立恐竜博物館の全景（勝山市・2007年） | 福井ふるさと百景「恐竜博物館全景」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） | https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/list6_hyakkei1-20.html |
| 村岡山から見た恐竜博物館（勝山市・2009年） | 福井ふるさと百景「村岡山山頂から見る恐竜博物館」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） | https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/list6_hyakkei1-20.html |
| 恐竜博物館の館内（勝山市・2006年） | 福井ふるさと百景「恐竜博物館内」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） | https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/list6_hyakkei1-20.html |
| 恐竜博物館の骨格展示（勝山市・2013年以前） | 福井ふるさと百景「恐竜博物館内」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） | https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/list6_hyakkei1-20.html |
| 北潟湖の花菖蒲園（あわら市・2009年） | 福井ふるさと百景「300種20万株の花菖蒲（花菖蒲園）」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） | https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/list6_hyakkei1-20.html |

### Wikimedia Commons 7 枚

どれも縮小・再エンコード (EXIF 除去) の改変をしています。

| 何の写真か | 出典表示 | ライセンス | 元のページ |
|---|---|---|---|
| 福井県立恐竜博物館の入口（勝山市・2025年） | Wikimedia Commons「福井県立恐竜博物館.jpg」 GIGA146587 (CC BY 4.0) | CC BY 4.0 https://creativecommons.org/licenses/by/4.0/deed.ja | https://commons.wikimedia.org/wiki/File:%E7%A6%8F%E4%BA%95%E7%9C%8C%E7%AB%8B%E6%81%90%E7%AB%9C%E5%8D%9A%E7%89%A9%E9%A4%A8.jpg |
| 北陸新幹線 W7系（富山県内・2015年） | Wikimedia Commons「W7 series set W3 20150207.jpg」 i北陸 (i Hokuriku) (CC BY 2.1 JP) | CC BY 2.1 JP https://creativecommons.org/licenses/by/2.1/jp/ | https://commons.wikimedia.org/wiki/File:W7_series_set_W3_20150207.jpg |
| 北陸新幹線 福井駅のホーム（福井市・2024年） | Wikimedia Commons「Fukui Station Hokuriku Shinkansen Platform 01.jpg」 Suikotei (CC BY 4.0) | CC BY 4.0 https://creativecommons.org/licenses/by/4.0/deed.ja | https://commons.wikimedia.org/wiki/File:Fukui_Station_Hokuriku_Shinkansen_Platform_01.jpg |
| 越前たけふ駅（2025年） | Wikimedia Commons「越前たけふ駅（北陸新幹線）20251010-P1074062.jpg」 くろふね (CC BY 4.0) | CC BY 4.0 https://creativecommons.org/licenses/by/4.0/deed.ja | https://commons.wikimedia.org/wiki/File:%E8%B6%8A%E5%89%8D%E3%81%9F%E3%81%91%E3%81%B5%E9%A7%85%EF%BC%88%E5%8C%97%E9%99%B8%E6%96%B0%E5%B9%B9%E7%B7%9A%EF%BC%8920251010-P1074062.jpg |
| 若林邸（新潟県村上市） | Wikimedia Commons「Niigata-Wakabayashi-tei House-m.jpg」 find47 (CC BY 4.0) | CC BY 4.0 https://creativecommons.org/licenses/by/4.0/deed.ja | https://commons.wikimedia.org/wiki/File:Niigata-Wakabayashi-tei_House-m.jpg |
| サンドーム福井（2014年冬） | Wikimedia Commons「Sundome Fukui 2014-12-27 01.JPG」 賀正 (CC BY-SA 4.0) | CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/deed.ja (★下の CC BY-SA の節) | https://commons.wikimedia.org/wiki/File:Sundome_Fukui_2014-12-27_01.JPG |
| 西山公園の噴水と夜桜（鯖江市・2016年） | Wikimedia Commons「Nishiyama park.JPG」 Jjp 233 (CC BY-SA 4.0) | CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/deed.ja (★下の CC BY-SA の節) | https://commons.wikimedia.org/wiki/File:Nishiyama_park.JPG |

### 鯖江市オープンデータ 2 枚

| 何の写真か | 出典表示 | ライセンス | 元のページ |
|---|---|---|---|
| 西山公園のイルミネーション（鯖江市・2018年） | 鯖江市「360photo（鯖江市西山公園など３６０写真）」R0010038 を切り出して使用 (CC BY-SA 4.0) | CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/deed.ja (★下の CC BY-SA の節) | https://ckan.odp.jig.jp/dataset/20190209 |
| 莇生田スキー場（鯖江市・1973年）※西山公園ではありません | 鯖江市「古い写真」(CC BY 3.0) | CC BY 3.0 https://creativecommons.org/licenses/by/3.0/deed.ja | https://ckan.odp.jig.jp/dataset/photo |

- 莇生田スキー場の写真は、配布元のファイルの表示が CC BY 3.0、CKAN の表示は CC BY (版の記載なし) です。版の分かる CC BY 3.0 として表示しています。縮小・再エンコード (EXIF 除去) の改変をしています。
- 360photo は、CKAN の表示が CC BY-SA 4.0、配布元のファイルの表示が CC BY 3.0 と分かれています。条件の重い **CC BY-SA 4.0 として扱っています。**

## ★CC BY-SA 4.0 の写真 (表示—継承)

次の 3 枚は **CC BY-SA 4.0** です。ライセンス: https://creativecommons.org/licenses/by-sa/4.0/deed.ja

**この 3 枚を収めた次の 4 ファイル (とその中の画像) は、CC BY-SA 4.0 で提供します** (イルミネーションの写真は、場面用と札用の 2 ファイルにあります)。
MIT License の対象外です。これらを改変して配布する場合も、CC BY-SA 4.0 (または互換のライセンス) で提供してください。
SA の写真は群ごとに別のファイル (名前が `_sa.js` で終わるもの) に分けてあり、ほかのファイルには入っていません。
札 (保存される画像) にイルミネーションの写真が敷かれた場合、その札の画像も CC BY-SA 4.0 の写真を含みます。

| ファイル | 何の写真か | 出典表示 | 元のページ | 改変 |
|---|---|---|---|---|
| `app/data/img/sundome_sa.js` | サンドーム福井（2014年冬） | Wikimedia Commons「Sundome Fukui 2014-12-27 01.JPG」 賀正 (CC BY-SA 4.0) | https://commons.wikimedia.org/wiki/File:Sundome_Fukui_2014-12-27_01.JPG | 縮小・再エンコード (EXIF 除去) |
| `app/data/img/nishiyama_fountain_sa.js` | 西山公園の噴水と夜桜（鯖江市・2016年） | Wikimedia Commons「Nishiyama park.JPG」 Jjp 233 (CC BY-SA 4.0) | https://commons.wikimedia.org/wiki/File:Nishiyama_park.JPG | 縮小・再エンコード (EXIF 除去) |
| `app/data/img/illumination_sa.js` | 西山公園のイルミネーション（鯖江市・2018年） | 鯖江市「360photo（鯖江市西山公園など３６０写真）」R0010038 を切り出して使用 (CC BY-SA 4.0) | https://ckan.odp.jig.jp/dataset/20190209 | **切り出し**: 全天球の画像 (正距円筒図法・5376×2688) から前方の 2688×1512 を長方形に切り出し、縮小・再エンコード (EXIF 除去)。透視変換はしていないため、床の目地が少し曲がって見えます |
| `app/data/img/card_illumination_sa.js` | 西山公園のイルミネーション（鯖江市・2018年）— 札用 | 鯖江市「360photo（鯖江市西山公園など３６０写真）」R0010038 を切り出して使用 (CC BY-SA 4.0) | https://ckan.odp.jig.jp/dataset/20190209 | 上の切り出しから、さらに**札の帯 (横長) に切り出し**・縮小・再エンコード (EXIF 除去) |

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
| 写真 (札の背景) | 中央を帯に切り出し・縮小・再エンコード (EXIF 除去) |
| 写真 (噺の途中) | 縮小・再エンコード (EXIF 除去)。外部の写真の改変は上の「外部の自由に使える写真」「CC BY-SA 4.0 の写真」の節に書いています。イラスト 17 枚は写真ではありません (上の「イラスト」の節) |

★**「園の推定正式名」は鯖江市のデータに書かれていません。**当方が飼育個体情報と
突き合わせて当てたものです。そう読まれない形にしています。

★家系図から抽出したデータには、**機械抽出による壊れが 27 件**あることを確認しています
(名前の取り違え・生年の桁の入れ替わり・園名の推定誤り・図の凡例の混入)。
語りに使っているのは、**飼育個体情報と名前・生年が一致した 52 行だけ**です。

## 出典表示ではないもの (数値の引用のみ)

次は CC BY ではないため、**再配布せず、数値の引用と出典明記に留めています。**

- 福井県「観光客入込数(推計)」 https://www.pref.fukui.lg.jp/doc/kankou/fukuiken-kankoukyakusu.html
