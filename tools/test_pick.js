// はなし山: 選び方 (Core.pick) のテスト。実行: node tools/test_pick.js
const fs = require("fs");
const vm = require("vm");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require("path").join(__dirname, "..", "app", "data", "bundle.js"), "utf8").replace("window.HANASHI", "globalThis.HANASHI"), ctx);
vm.runInContext(fs.readFileSync(require("path").join(__dirname, "..", "app", "app.js"), "utf8"), ctx);
const H = ctx.HANASHI, C = ctx.HanashiCore;
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
expect(C.sageExtra(H.today["11-28"][0], "2026-11-28") === "(没後142年)", "没後142年を計算");
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

console.log(fail ? "FAIL " + fail : "ALL OK");
process.exit(fail ? 1 : 0);
