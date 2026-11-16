// はなし山: 選び方 (Core.pick) のテスト。実行: node tools/test_pick.js
const fs = require("fs");
const vm = require("vm");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require("path").join(__dirname, "..", "app", "data", "bundle.js"), "utf8").replace("window.HANASHI", "globalThis.HANASHI"), ctx);
// ★HANASHI_APP = 別の app.js (直す 前の 版を 渡して、試験が NG を 出すか = 効きを 見る)
const APP_PATH = process.env.HANASHI_APP || require("path").join(__dirname, "..", "app", "app.js");
const APP_SRC = fs.readFileSync(APP_PATH, "utf8");
vm.runInContext(APP_SRC, ctx);
const H = ctx.HANASHI, C = ctx.HanashiCore;
// ★選び方は 2026-11-15 から ランダム。★試験は 固定の 乱数で 決定的に 回す
const { makeApp, seeded } = require("./motion_harness");
C.rng = seeded(1);
const cases = [
  ["なにも答えない・普通の日", { date: "2026-09-17" }],
  ["山口県", { pref: "山口県", date: "2026-09-17" }],
  ["東京都 + 信念カード(パンダは白黒)", { pref: "東京都", beliefs: ["b_panda_bw"], date: "2026-09-17" }],
  ["神奈川県だけ", { pref: "神奈川県", date: "2026-09-17" }],
  ["審査会の日 (何も答えない)", { date: "2026-11-28" }],
  ["パンダデー期間 2026", { date: "2026-09-20" }],
  ["パンダデー期間 2027 (出ないはず)", { date: "2027-09-20" }],
  ["双子の誕生日 6/26 (記録上の誕生日)", { date: "2026-06-26" }],
  ["信念カード(地方の夜は何もない)", { beliefs: ["b_night_nothing"], date: "2026-11-14" }],
];
let fail = 0;
for (const [name, input] of cases) {
  const r = C.pick(H, input);
  console.log("■", name, "→", r.length, "件:", r.slice(0, 4).map(x => x.story.id + "(" + x.score + ":" + x.reasons.join("+") + ")").join(", "));
}
const expect = (cond, msg) => { if (!cond) { fail++; console.log("  ✕", msg); } else console.log("  ✓", msg); };
expect(C.pick(H, { date: "2026-03-15" }).length === 0,
       "手がかりが無い日は語らない(第二条)  ★暦から 遠い 日で 見る");
expect(C.pick(H, { date: "2026-09-17" }).length > 0,
       "  対照: 暦の 2 日前なら 候補が 出る (数え方は 壊れていない)");
expect(C.pick(H, { pref: "山口県", date: "2026-09-17" })[0].story.id === "S01", "山口県は松陰の話が先頭");
expect(C.pick(H, { date: "2026-11-28" })[0].story.id === "T-1128", "11/28 は命日の話が先頭");
// ★現地の 謎かけの 答え合わせ (全角/半角・かな/カナ を 吸収 / 打ち消しは 外れ。2026-11-15)
{
  const g1 = { answers: ["あか", "赤", "アカ", "レッド", "red", "赤色", "あかいろ"] };
  const g2 = { answers: ["あしあと", "足跡", "足あと", "アシアト", "あしあとのかたち"] };
  ["ｱｶ", "アカ", "赤", "赤い", "赤色です", "あかいろ", "ＲＥＤ", " あか "].forEach((v) => expect(C.riddleOk(g1, v), "謎かけ G1 「" + v + "」は 当たり"));
  ["赤じゃない", "あかくない", "きいろ", "あ", ""].forEach((v) => expect(!C.riddleOk(g1, v), "謎かけ G1 「" + v + "」は 外れ"));
  ["ｱｼｱﾄ", "足あとの形", "あしあとです"].forEach((v) => expect(C.riddleOk(g2, v), "謎かけ G2 「" + v + "」は 当たり"));
  expect(!C.riddleOk(g2, "あしあとじゃない"), "謎かけ G2 「あしあとじゃない」は 外れ");
}
// ★その県の 客に 話しかける 席 (onlyPref) は その県の 客にだけ (2026-11-15。S13 が 青森の 客に 出ていた)
expect(C.fitsPref({ onlyPref: true, hooks: { prefectures: ["東京都"] } }, "青森県") === false, "東京の 客 向けの 席は 青森の 客に 出さない");
expect(C.fitsPref({ onlyPref: true, hooks: { prefectures: ["東京都"] } }, "東京都") === true, "東京の 客 向けの 席は 東京の 客に 出す");
expect(C.fitsPref({ hooks: { prefectures: ["新潟県"] } }, "青森県") === true, "印の 無い 県の 席は よその 客にも 出す (入りの 一言は 言い換える)");
expect(H.stories.filter((s) => s.onlyPref).map((s) => s.id).sort().join(",") === "S10,S13", "onlyPref の 席は S10・S13");
expect(C.sageExtra({ yearsSince: 1884 }, "2026-11-28") === "(没後142年)", "没後142年を計算 (yearsSince を 持つ 席)");
// ★2026-11-15: 命日の 席は サゲが「この山」で 落ちるので 没後の 年を 付けない (サゲの 後ろに 付くと オチが 濁る)
expect(C.sageExtra(H.today["11-28"][0], "2026-11-28") === "", "命日の 席の サゲには 没後の 年を 付けない");
expect(C.pick(H, { date: "2027-09-20" }).every(x => !x.story.onlyYear), "2027年にはパンダデー2026を出さない");
expect(C.pick(H, { beliefs: ["b_zoo_big"], date: "2026-09-17" }).every(x => x.source !== "pref"), "信念カードだけでは県の噺を出さない");
// 自由入力の照合 (match)
const freeCases = [
  ["旭山動物園が好き", { belief: "b_zoo_big", pref: "北海道" }],
  ["城巡りが趣味", { belief: "b_castle_town" }],
  ["うどん", { pref: "香川県" }],
  ["パンダが見たい", { belief: "b_panda_bw" }],
  ["雪が好き", { belief: "b_snow_nothing", season: "winter" }],
  ["福井から来ました", { pref: "福井県" }],
  ["恐竜", { belief: "b_dino_only" }],
  ["めがね", { belief: "b_sabae_glasses" }],
];
freeCases.forEach(([text, want]) => {
  const m = C.match(H, text);
  const got = { belief: m.belief, pref: m.pref, season: m.season };
  const ok = Object.entries(want).every(([k, v]) => got[k] === v);
  console.log("■ 「" + text + "」→", JSON.stringify(got), m.hits.slice(0, 2).map(h => h.word).join(","));
  expect(ok, "自由入力「" + text + "」が意図どおり引ける");
});
expect(C.match(H, "特に無い").hits.length === 0, "「特に無い」は何も引かない");
expect(C.match(H, "").hits.length === 0, "空欄は何も引かない");
expect(C.match(H, "おもしろい話が聞きたい").hits.every(h => h.word !== "城"), "「おもしろい」から城を引かない");
expect(C.match(H, "アサヒヤマドウブツエン").pref === "北海道", "カタカナ表記でも引ける");

// どれを語るか (choose): 客が最後に答えたものを立てる
const chDino = C.choose(H, { pref: "", beliefs: ["b_dino_only"], date: "2026-09-20" }, "b_dino_only", []);
console.log("■ 9/20(パンダデー期間)に「恐竜」と答えた →", chDino.story.id, chDino.chosenBy);
expect(chDino.story.id === "S12", "答えた信念の噺を、暦の噺より先に出す");
expect(chDino.switchNote === null, "話題を変えていないので断りは入れない");

const chPref = C.choose(H, { pref: "山口県", beliefs: [], date: "2026-09-20" }, null, []);
console.log("■ 9/20 に県だけ答えた(山口県) →", chPref.story.id, chPref.chosenBy);
expect(chPref.chosenBy === "pref", "県を答えたら、その県の噺を暦より先に出す");

const chSwitch = C.choose(H, { pref: "山口県", beliefs: ["b_dino_only"], date: "2026-09-20" }, "b_dino_only", ["S12"]);
console.log("■ 恐竜の噺を聞き終えたあと →", chSwitch.story.id, chSwitch.chosenBy, "/ 断り:", chSwitch.switchNote);
expect(chSwitch.chosenBy === "pref" && !!chSwitch.switchNote, "噺を切り替えるときは断りを入れる");

const chToday = C.choose(H, { pref: "", beliefs: [], date: "2026-11-28" }, null, []);
expect(chToday.story.id === "T-1128" && chToday.switchNote === null, "手がかりが日付だけなら暦の噺");

// 噺家が伺う順番 (askOrder)
const ord = C.askOrder(H, "山口県");
console.log("■ 伺う順番(山口県):", ord.map(b => b.label).join(" / "));
expect(ord.length <= 3, "伺うのは3つまで");
expect(ord.every(b => H.beliefs.some(x => x.id === b.id)), "信念カードから選ぶ");
expect(C.askOrder(H, "").length > 0, "県を言わなくても伺える");
expect(ord.some(b => b.id === "b_bakumatsu"), "山口県には幕末の問いが候補に入る");
expect(new Set(["山口県","東京都","香川県","北海道","沖縄県"].map(p => C.askOrder(H, p)[0].id)).size >= 4, "第1問が県ごとに分かれる (42県が同じ問いに寄らない)");
expect(C.askOrder(H, "東京都").every(b => b.id !== "b_local_park"), "地元向けの問いは福井の客にだけ伺う");
expect(C.askOrder(H, "福井県").some(b => b.id === "b_local_park"), "福井の客には地元向けの問いを伺う");

// 場 (Δq の集計)
const ev = [
  { event: "delta", story: "S01", title: "松陰が狙った男", delta: 2, input: { pref: "山口県" } },
  { event: "delta", story: "S01", title: "松陰が狙った男", delta: 1, input: { pref: "東京都" } },
  { event: "delta", story: "S05", title: "祈りの道の石像", delta: -1, input: { pref: "東京都" } },
  { event: "shown", story: "S05", input: {} },
];
const ba = C.ba(ev);
console.log("■ 場:", ba.stories.map(r => r.key + "(" + r.n + "回, 平均" + r.avg.toFixed(1) + ")").join(", "));
expect(ba.stories[0].key === "S01" && ba.stories[0].n === 2 && ba.stories[0].avg === 1.5, "噺ごとの平均Δqを集計");
expect(ba.prefs.find(r => r.key === "東京都").avg === 0, "県ごとの平均Δqを集計");
expect(ba.stories.length === 2, "delta 以外のイベントは数えない");

// 数字の絵図 (figSvg)
const withFig = [...H.stories, ...H.prefStories, ...Object.values(H.today).flat()].filter(s => s.fig);
console.log("■ 絵図つきの噺:", withFig.length + " 席 / 本題で見せる " +
  withFig.filter(s => (s.fig.when || "hondai") === "hondai").length +
  " 席 / 答え合わせのあと " + withFig.filter(s => s.fig.when === "after").length + " 席");
expect(withFig.length > 0, "絵図のついた噺がある");
expect(withFig.every(s => s.fig.items && s.fig.items.length), "絵図には項目がある");
expect(withFig.every(s => s.fig.items.every(i => typeof i.value === "number" && isFinite(i.value))),
  "絵図の値はすべて数");
const svgs = withFig.map(s => C.figSvg(s.fig));
expect(svgs.every(v => v.startsWith("<svg") && v.endsWith("</svg>")), "絵図が SVG になる");
expect(svgs.every(v => !/NaN|undefined|Infinity/.test(v)), "絵図に NaN / undefined が出ない");
expect(svgs.every(v => (v.match(/<rect /g) || []).length >= 1), "棒が 1 本以上ある");
// 棒の幅が 0 以下や はみ出しに ならないか
const widths = svgs.join("").match(/width="([\d.]+)"/g).map(w => parseFloat(w.slice(7)));
expect(widths.every(w => w >= 3 && w <= 640), "棒の幅が 3〜640 に収まる (はみ出さない)");
expect(C.figSvg({ items: [] }) === "", "項目が無ければ 何も描かない");
// 値 0 の項目でも 落ちない (2026年1月24日の 0 人)
const zero = C.figSvg({ title: "t", unit: "人", items: [{ label: "雪の日", value: 0 }, { label: "連休", value: 4550 }] });
expect(zero.includes("0人") && zero.includes("4,550人"), "0 の項目も 値が出る");


// ---- もう一席が 前の席と 似ないこと (2026-09-23 スマホ確認で 指摘) ----------
//   ★「似ている」= 出典の事実が 同じ / 立てた 思い込みが 同じ。
//   ★これが 重なると、オチの型が 違っても 客には「さっきと同じ話」に 聞こえる。
const simInput = { pref: "", beliefs: ["b_shinkansen"], date: "2026-09-23" };
const s1 = C.choose(H, simInput, "b_shinkansen", [], []);
expect(s1 && (s1.story.hooks.beliefs || []).includes("b_shinkansen"),
       "新幹線の手がかり → 新幹線の噺 (" + (s1 && s1.story.id + " " + s1.story.title) + ")");
const s2 = C.choose(H, simInput, "b_shinkansen", [s1.story.id], [s1.story.sage]);
const shareF = s2 ? (s2.story.facts || []).filter((f) => (s1.story.facts || []).includes(f)) : [];
const shareB = s2 ? ((s2.story.hooks || {}).beliefs || []).filter((b) => (s1.story.hooks.beliefs || []).includes(b)) : [];
expect(s2 && !shareF.length, "二席目が 一席目と 出典を 共有しない (" + (s2 && s2.story.id) + " 共有 " + shareF.join(",") + ")");
expect(s2 && !shareB.length, "二席目が 一席目と 思い込みを 共有しない (共有 " + shareB.join(",") + ")");
expect(s2 && /似てまいります|持ち合わせ/.test(s2.switchNote || ""), "筋を 変えるときは つなぎを 言う");

// ---- 客が 打った 手がかりが、一席目の固定より 優先されること ----------------
//   ★前は「動物園」と 打っても TOP_FIRST が 勝ち、新幹線の噺が 出ていた
const mz = C.match(H, "動物園");
expect(mz.belief === "b_zoo_big", "「動物園」が 辞書に 当たる (" + mz.belief + ")");
const z1 = C.choose(H, { pref: "", beliefs: [mz.belief], date: "2026-09-23" }, mz.belief, [], []);
expect(z1 && (z1.story.hooks.beliefs || []).includes("b_zoo_big"),
       "「動物園」→ 動物園の噺 (" + (z1 && z1.story.id + " " + z1.story.title) + ")");
expect(z1 && ["S11", "S12", "S08"].indexOf(z1.story.id) < 0, "手がかりが あるとき 一席目の固定に 落ちない");

// ---- 全席を ひと並びに できること (似ているかの 判定が これに 乗っている) ----
expect(C.allStories(H).length === H.stories.length + H.prefStories.length +
       Object.keys(H.today).reduce((n, k) => n + H.today[k].length, 0),
       "allStories が 手書き + 県 + 今日 を すべて 返す (" + C.allStories(H).length + " 席)");


// ---- 暦の噺を、その日 以外でも 出す (2026-09-25 ユーザー指示) ----------------
//   ① 手前 7 日 …「もうすぐ」  ② 好きなものが 合えば いつでも「こういう情報も」
//   ★当日 (+4) を 押しのけない ことが 大事
const tsu = (d) => C.pick(H, { pref: "", beliefs: [], date: d })
  .filter((x) => x.story.id.indexOf("T-tsutsuji") === 0);
expect(tsu("2026-04-25").length === 0, "8 日以上 前は 出ない");
expect(tsu("2026-05-01").length > 0, "2 日前は 出る (もうすぐ)");
expect(tsu("2026-05-06").length === 0, "過ぎたら 出ない");
const onDay = tsu("2026-05-03");
const same = onDay.find((x) => x.story.id === "T-tsutsuji-03");
const other = onDay.find((x) => x.story.id !== "T-tsutsuji-03");
expect(same && other && same.score > other.score,
       "当日の席が 手前の席より 点が 高い (" + (same && same.score) + " > " + (other && other.score) + ")");
expect(same && same.reasons.indexOf("today") >= 0, "当日は today、手前は soon");

const byLike = (w) => {
  const m = C.match(H, w);
  return C.pick(H, { pref: "", beliefs: [m.belief], date: "2026-09-25" })
    .filter((x) => x.story.isToday);
};
expect(byLike("歴史").some((x) => x.story.id === "T-1128"),
       "「歴史」から 命日の噺が 候補に 入る (日付は 9/25)");
expect(byLike("雪").some((x) => x.story.id === "T-0124"),
       "「雪」から 0 人の日が 候補に 入る");
expect(C.daysUntil({ md: "05-03" }, "2026-05-01") === 2, "daysUntil が 日数を 返す");
expect(C.daysUntil({ md: "05-03" }, "2026-05-03") === 0, "当日は 0");


// ---- 絵図: 棒の中に 置く 数字は ★白で 出ること (2026-09-26) ----
//   ★SVG の fill="#fff" 属性は ★CSS の .figv { fill: var(--ink) } に 負ける。
//   ★2026-09-26 まで 棒の朱に 黒い数字が 埋もれていた (ユーザー指摘・画面で 発覚)。
//   ★クラス (figv-in) で 当てること。★属性で 書くと また 埋もれる。
const svgLong = C.figSvg({ title: "長い棒", unit: "株",
  items: [{ label: "多い", value: 31400 }, { label: "少ない", value: 25 }] });
expect(svgLong.indexOf('fill="#fff"') < 0,
       "棒の中の 数字に ★属性の fill を 使っていない (CSS に 負けるため)");
expect(svgLong.indexOf("figv-in") >= 0,
       "棒の中の 数字に ★クラス figv-in が 付いている");
expect((svgLong.match(/figv-in/g) || []).length === 1,
       "短い棒の 数字には 付かない (外に 黒で 出す)");
// ★数字が 枠から はみ出さない
const W = Number(svgLong.match(/viewBox="0 0 (\d+)/)[1]);
let over = 0;
for (const m of svgLong.matchAll(/<text x="([\d.]+)" y="[\d.]+" class="figv"(?![^>]*text-anchor)[^>]*>([^<]+)</g)) {
  let w = 0;
  for (const ch of m[2]) w += /[0-9,.-]/.test(ch) ? 11 : 20;
  if (Number(m[1]) + w > W) over += 1;
}
expect(over === 0, "棒の外に 置いた 数字が 枠を はみ出さない");



// ==== 選び方の 偏りを 直す (2026-11-15 ユーザー判断「次回、同じ人が見たときに違う話に」) ====
//   ★直す 前は 点が 同じ 席を 毎回 同じ 順で 選び、はじめからの 3 席目 S44・4 席目 S45 に ほぼ 固定、
//     園の 入口は 2〜4 席目が 58 園中 41 園で S54→S51→S41 だった (C:\tmp\bias の 模擬の 通し)。
//   ★ここでは 画面を 通しで 動かす (motion_harness)。★写真の 選び (Math.random) は 毎回 同じ 種に 固定し、
//     ★選び方の 乱数 (HANASHI_RNG) だけを 替える。
const DATE = "2026-11-15";
const MR = Math.random;
function drive(opt, plan, N) {
  Math.random = seeded(7);
  const a = makeApp(Object.assign({ srcPatch: () => APP_SRC }, opt));
  a.click("open");
  for (let k = 0; k < 400; k++) {
    a.settle();
    if (a.shown().length - (opt.before || 0) >= N && !a.byId.sageBox.hidden) break;
    const ls = a.labels();
    if (!ls.length) { if (!a.byId.sageBox.hidden) { a.click("again"); continue; } break; }
    if (ls.length === 1 && ls[0] === "次へ") { a.pick(0); continue; }
    if (ls.includes("(form)")) { a.submit(""); continue; }
    const i = plan.length ? ls.indexOf(plan[0]) : -1;
    if (i >= 0) { plan.shift(); a.pick(i); continue; }
    if (ls.includes("はい、また")) { a.pick("はい、また"); continue; }
    if (ls.includes("お願いします")) { a.pick("お願いします"); continue; }
    if (ls.includes("ふつう")) { a.pick("ふつう"); continue; }
    a.pick(0);
  }
  Math.random = MR;
  return { seats: a.shown().slice(opt.before || 0), store: a.store, errors: a.errors.length, talk: a.talk().join("\n") };
}
const IBARAKI = (ans) => ["いや、べつに", "県外から", "関東", "茨城県", ans || "思う"];
const again = (store) => { const s = Object.assign({}, store); delete s["hanashiyama.pref.v1"]; return s; };  // ★はじめから と 同じ (県は 忘れ、記録は 残す)

// ---- ① 同じ 条件でも 乱数を 替えると 3・4 席目が 変わる ----
const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((sd) => drive({ date: DATE, seed: sd }, IBARAKI(), 4));
expect(runs.every((r) => r.seats.length === 4 && !r.errors), "茨城県・思う を 種 8 通りで 4 席まで 通る (落ちない)");
const tail = new Set(runs.map((r) => r.seats.slice(2, 4).join(">")));
console.log("■ 茨城県・思う 3・4 席目 (種 1〜8):", [...tail].join(" / "));
expect(tail.size >= 3, "乱数を 替えると 3・4 席目が 変わる (" + tail.size + " 通り / 8)");
const rep = drive({ date: DATE, seed: 3 }, IBARAKI(), 4);
expect(rep.seats.join() === runs[2].seats.join(), "同じ 種なら 同じ 並び (試験が 決定的)");

// ---- ② 前に 聞いた 席が 記録に あると 避ける (次回は 違う 噺) ----
const v1 = runs[0];
const v2 = drive({ date: DATE, seed: 1, store: again(v1.store), before: v1.seats.length }, IBARAKI(), 4);
const dup = v2.seats.filter((x) => v1.seats.includes(x));
console.log("■ 同じ 端末で 2 回目 (同じ 種):", v1.seats.join(" "), "→", v2.seats.join(" "));
expect(v2.seats.length === 4 && dup.length === 0, "2 回目は 1 回目に 聞いた 席を 出さない (重なり " + dup.join(",") + ")");
// ★Core: 前に 聞いた 席を 後ろへ / 全部 聞いていたら 戻す (★直す 前の 版には pickOne が 無い → NG に 落とす)
const po = (a, o) => (C.pickOne ? C.pickOne(a, o) : { story: { id: "(pickOne が 無い)" } });
const pc = [{ story: { id: "A" }, score: 5 }, { story: { id: "B" }, score: 5 }];
expect([1, 2, 3, 4, 5].every((sd) => po(pc, { rng: seeded(sd), heard: ["A"] }).story.id === "B"), "pickOne: 聞いた 席 A を 避けて B");
expect(po(pc, { rng: seeded(1), heard: ["A", "B"] }) !== null, "pickOne: 全部 聞いていたら 戻す (null に しない)");

// ---- ③ 点の 幅: 最高点 − BAND 以上から 選ぶ。★当日の 席は 押しのけない ----
const band = [7, 6, 5, 4].map((sc, k) => ({ story: { id: "X" + k }, score: sc }));
const got = {};
const r0 = seeded(11);
for (let k = 0; k < 300; k++) { const c = po(band, { rng: r0 }); got[c.story.id] = (got[c.story.id] || 0) + 1; }
console.log("■ pickOne 点 7/6/5/4 を 300 回:", JSON.stringify(got), "BAND", C.BAND);
expect(!got.X3 && got.X0 && got.X1 && got.X2, "最高点との 差 2 以内 (7・6・5) だけを 選び、4 は 選ばない");
expect(got.X0 > got.X2, "点の 高い 席ほど 選ばれやすい (重み)");
const tcs = [{ story: { id: "T" }, score: 7, reasons: ["today"] }, { story: { id: "Y" }, score: 7, reasons: ["soon"] }];
expect([1, 2, 3, 4, 5, 6].every((sd) => po(tcs, { rng: seeded(sd) }).story.id === "T"), "当日の 暦の 席が 先頭なら 当日の 席だけから 選ぶ");

// ---- ④ 11/28 の 一席目は T-1128 のまま (審査会の 実演: 茨城県・思う) ----
const d28 = [1, 2, 3, 4, 5].map((sd) => drive({ date: "2026-11-28", search: "?date=2026-11-28", seed: sd }, IBARAKI(), 2));
console.log("■ 11/28 茨城県・思う (種 1〜5):", d28.map((r) => r.seats.join(">")).join(" / "));
expect(d28.every((r) => r.seats[0] === "T-1128"), "11/28 の 一席目は どの 種でも T-1128");
expect(d28.every((r) => r.seats[1] === "P-茨城県"), "11/28 の 二席目は その県の 噺 P-茨城県 (記録が 空の とき)");
const d28b = drive({ date: "2026-11-28", search: "?date=2026-11-28", seed: 9, store: again(d28[0].store), before: 2 }, IBARAKI(), 1);
expect(d28b.seats[0] === "T-1128", "前に T-1128 を 聞いていても 11/28 の 一席目は T-1128 (今日の 暦は 固定)");

// ---- ⑤ 手がかり (県・好き) を 握りつぶさない (㉞) / 県の 手書きの 噺 (㊱) ----
const yg = [1, 2, 3].map((sd) => drive({ date: DATE, seed: sd }, ["いや、べつに", "県外から", "中国・四国", "山口県", "思う"], 1));
expect(yg.every((r) => r.seats[0] === "S01"), "山口県は どの 種でも 一席目が 県の 手書きの 噺 S01");
const yg2 = drive({ date: DATE, seed: 1, store: again(yg[0].store), before: 1 }, ["いや、べつに", "県外から", "中国・四国", "山口県", "思う"], 1);
expect(["S11", "S12", "S08", "S17", "S32", "S39", "S42", "S44", "S54", "P-山口県"].includes(yg2.seats[0]), "前に S01 を 聞いていたら 一席目の 候補 (TOP_FIRST + 動物 6 + 県の 噺) へ (" + yg2.seats[0] + ")");
const shin = C.allStories(H).filter((s) => !s.genchi && ((s.hooks || {}).beliefs || []).includes("b_shinkansen")).map((s) => s.id);
const zin = { pref: "", beliefs: ["b_shinkansen"], date: "2026-09-23" };
expect([1, 2, 3, 4, 5, 6].every((sd) => {
  const c = C.choose(H, zin, "b_shinkansen", [], [], { rng: seeded(sd) });
  return c && shin.includes(c.story.id) && c.chosenBy === "belief";
}), "「新幹線」の 手がかりは どの 種でも 新幹線の 噺 (" + shin.join(",") + ")");
const zh = C.choose(H, zin, "b_shinkansen", [], [], { rng: seeded(1), heard: [shin[0]] });
expect(zh && (shin.length < 2 || (zh.story.id !== shin[0] && shin.includes(zh.story.id))),
       "前に 聞いた 新幹線の 噺を 避け、同じ 筋の 別の 噺へ (" + (zh && zh.story.id) + ")");
const zall = C.choose(H, zin, "b_shinkansen", [], [], { rng: seeded(1), heard: shin });
expect(!zall || /前に お聞き/.test(zall.switchNote || ""), "筋の 噺を 全部 聞いていたら「前に お聞きいただいた」と 言い分ける");
const kz = [1, 2, 3, 4, 5, 6].map((sd) => C.choose(H, { pref: "", beliefs: ["b_zoo_big"], date: DATE }, "b_zoo_big", [], [], { rng: seeded(sd) }));
expect(kz.every((c) => c && (c.story.hooks.beliefs || []).includes("b_zoo_big")), "「動物園」の 手がかりは どの 種でも 動物園の 噺");

// ---- ⑥ 園の 入口: 2〜4 席目が 一つの 並びに 固まらない ----
const kinS = fs.readFileSync(require("path").join(__dirname, "..", "app", "data", "kin.js"), "utf8");
const slug = [...new Set([...kinS.matchAll(/"slug":\s*"([^"]+)"/g)].map((m) => m[1]))][3];
const kr = [1, 2, 3, 4, 5, 6, 7, 8].map((sd) => drive({ date: DATE, seed: sd, search: "?kin=" + slug + "&date=" + DATE }, ["いや、べつに", "思う"], 4));
const kt = new Set(kr.map((r) => r.seats.slice(1, 4).join(">")));
console.log("■ 園の 入口 (" + slug + ") 2〜4 席目 (種 1〜8):", [...kt].join(" / "));
expect(kr.every((r) => r.seats.length === 4 && !r.errors) && kt.size >= 2, "園の 入口の 2〜4 席目が 種で 変わる (" + kt.size + " 通り)");

// ---- ⑦ 筋が 飛ぶ ときは 強引な つなぎを 言う (㉟)。★一席目の 前には 言わない ----
const JL = (C.JUMP_LINES || []);
const said = runs.map((r) => {
  const first = r.talk.indexOf("もう一席");
  const at = JL.map((t) => r.talk.indexOf(t)).filter((x) => x >= 0);
  return { n: at.length, early: at.some((x) => first < 0 || x < first) };
});
expect(JL.length >= 3 && said.some((x) => x.n > 0), "見繕いで 筋が 飛ぶ 席に つなぎの 一言が 入る (種 8 通りで " + said.reduce((a, x) => a + x.n, 0) + " 回)");
expect(said.every((x) => !x.early), "つなぎの 一言は 一席目の 前には 言わない");
expect(JL.every((t) => !/[0-9０-９]/.test(t)), "つなぎの 一言に 数字を 入れない");

// ---- ⑧ 席の 入り (bridge) を 前後に 合わせる (2026-11-15。ランダムで 選ぶと かみ合わない 所が 出た) ----
//   ★台本の 文は 変えず、画面に 出す ときに 言い換える (Core.bridgeText / seatLines / prefBridgeLead)
{
  const fn = (k) => typeof C[k] === "function";
  const ALL = [].concat(H.stories, H.prefStories || []);
  const byId = (id) => ALL.find((s) => s.id === id);
  const PREFS = H.prefectures;
  const bt = (id, o) => (fn("bridgeText") ? C.bridgeText(byId(id), Object.assign({ prefs: PREFS }, o)) : byId(id).bridge);
  // (a) 県の つなぎを 前段で 言う 形: 最後の「では、…ひとつ。」を 言わない。前半は 残す
  const leads = PREFS.map((p) => [p, H.prefBridge[p].lines, fn("prefBridgeLead") ? C.prefBridgeLead(H.prefBridge[p].lines) : H.prefBridge[p].lines]);
  expect(leads.every(([, , l]) => l.length >= 1 && !/ひとつ。\s*$/.test(l[l.length - 1])),
         "県の つなぎ (前段の 形) は 47 件とも「…ひとつ。」で 終わらない");
  expect(leads.some(([, src]) => /ひとつ。$/.test(src[src.length - 1])), "  対照: 台本の 県の つなぎは「…ひとつ。」で 終わる (数え方は 壊れていない)");
  const ib = leads.find(([p]) => p === "茨城県")[2];
  expect(ib[ib.length - 1] === "知られていないのは、こちらの山のほうでございます。", "最後の 行の 前半は 残す (茨城県: " + ib[ib.length - 1] + ")");
  // (b)「その」は 直前の 客の 答えを 受けて 選んだ 席だけ
  expect(bt("S12", { pref: "茨城県", answered: false }) === "では、恐竜の話から。" && bt("S12", { pref: "茨城県", answered: true }) === "では、その恐竜の話から。",
         "「では、その恐竜の話から。」は 答えを 受けた ときだけ「その」を 残す");
  expect(bt("S06", { pref: "" }) === "城の話で。", "「その、城の話で。」→「城の話で。」");
  // (c) 県の噺 (P-○○): 同じ 県なら 挨拶を 省く / 違う 県なら「話は ○○へ 飛びまして」・客向けに しない
  const pIds = ALL.filter((s) => /^P-/.test(s.id));
  const same = pIds.map((s) => [s, bt(s.id, { pref: s.hooks.prefectures[0] })]);
  expect(pIds.length === 47 && same.every(([, b]) => !/からでございますか|お膝元でございますか|そのお国/.test(b)),
         "県の噺の 入り: 客と 同じ 県なら 挨拶を 省き「そのお国」を 県名に (47 件)");
  expect(bt("P-北海道", { pref: "北海道" }) === "北海道と この町の、行き来の話で ひとつ。" && bt("P-茨城県", { pref: "茨城県" }) === "茨城県のお客さんに、名前の話で ひとつ。",
         "  例: " + bt("P-北海道", { pref: "北海道" }) + " / " + bt("P-茨城県", { pref: "茨城県" }));
  const other = pIds.map((s) => [s, bt(s.id, { pref: s.hooks.prefectures[0] === "茨城県" ? "東京都" : "茨城県" })]);
  expect(other.every(([s, b]) => /^話は [^、]+(へ 飛びまして|に 戻りまして)、/.test(b) && !/お客さんに|からでございますか|そのお国/.test(b)),
         "県の噺の 入り: 客と 違う 県なら「話は ○○へ 飛びまして」で 始め、客向けの 言い方を しない (47 件)");
  expect(bt("P-北海道", { pref: "茨城県" }) === "話は 北海道へ 飛びまして、北海道と この町の、行き来の話で ひとつ。", "  例: " + bt("P-北海道", { pref: "茨城県" }));
  // (d) 1 県の 客向けの 入り (S14「新潟のお客さんに」) は よその 県の 客には 向きを 変える
  expect(bt("S14", { pref: "北海道" }) === "話は 新潟へ 飛びまして、ひとつ。" && bt("S14", { pref: "新潟県" }) === "新潟のお客さんに、ひとつ。",
         "S14 は 新潟の 客には そのまま・よその 県の 客には「話は 新潟へ 飛びまして」");
  // (e) どの 席 × どの 客の 県 (と 県なし) でも、客の 県と 違う 県名で 客向けに 話しかけない
  const short = (p) => (p === "北海道" ? p : p.replace(/(都|府|県)$/, ""));
  let bad = [], n = 0, ctl = 0;
  ALL.forEach((s) => PREFS.concat([""]).forEach((cp) => {
    const b = bt(s.id, { pref: cp });
    n += 1;
    PREFS.forEach((p) => {
      if (p === cp) return;
      const re = new RegExp("(^|[^一-龠])(" + p + "|" + short(p) + ")(からでございますか|のお客さんに)");
      if (re.test(b)) bad.push(s.id + "→" + (cp || "県なし"));
      if (re.test(s.bridge || "")) ctl += 1;
    });
  }));
  expect(!bad.length, "客の 県と 違う 県名で 客向けに 話しかける 入り 0 (" + n + " 通り) " + bad.slice(0, 3).join(","));
  expect(ctl > 0, "  対照: 台本の 文の ままなら " + ctl + " 通りで 話しかける (数え方は 壊れていない)");
  // (f) 頭と 入りの 重なり: では / ひとつ / 飛びます / ○○のお客さんに
  const sl = (h, b, o) => (fn("seatLines") ? C.seatLines(h, b, o) : h.concat(o && o.prefHead ? [o.prefHead + "のお客さんに、ひとつ。"] : [], [b]));
  const r1 = sl([], "では、恐竜の話から。", { prev: "さようで。手強いお客さんだ。では、別の筋で一席。" });
  expect(r1.join("") === "恐竜の話から。", "「では、…」の 直後の 入りは「では、」を 外す (" + r1.join(" / ") + ")");
  const r2 = sl([], "パンダの話で、ひとつ。", { prefHead: "東京都" });
  expect(r2.length === 1 && r2[0] === "東京都のお客さんに、パンダの話で ひとつ。", "「○○のお客さんに、ひとつ。」+「…ひとつ。」は 1 文に (" + r2.join(" / ") + ")");
  const r3 = sl(["その話は、またの機会に。お客さんの土地の噺を、ひとつ。"], "うちの裏の山の話で ひとつ。", {});
  expect(!/ひとつ。$/.test(r3[r3.length - 1]), "「…ひとつ。」が 二つ 続かない (" + r3.join(" / ") + ")");
  const r4 = sl([JL[0]], "話は 北海道へ 飛びまして、北海道と この町の、行き来の話で ひとつ。", {});
  expect(r4.length === 1, "つなぎの 一言と「話は ○○へ 飛びまして」を 重ねない (" + r4.join(" / ") + ")");
  const r5 = sl([], "名の通ったところからの お客さんに、名前の話で ひとつ。", { prefHead: "宮城県" });
  expect(r5.length === 1 && r5[0].indexOf("宮城県のお客さんに") < 0, "入りに「お客さんに」が あれば「○○のお客さんに」を 足さない");
}

console.log(fail ? "FAIL " + fail : "ALL OK");
process.exit(fail ? 1 : 0);
