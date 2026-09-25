// はなし山: 画面を通しで動かす煙試験。実行: node tools/test_flow.js
//
// なぜ要るか
//   ブラウザが無い場所でも、「ボタンの id を間違えた」「絵図で落ちる」「札の描画で落ちる」
//   といった、開いた瞬間に全部止まる類の壊れ方だけは先に捕まえたい。
//   ★見た目・速さ・実際の描画結果は分からない。それは人がブラウザで見るしかない。
//
// やること
//   index.html の id を拾って最小の DOM を作り、app.js を読み込み、
//   幕を開けてから選択肢を順に押していき、札が出るところまで通す。

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
let fail = [];
const ok = (c, m) => { console.log((c ? "  OK   " : "  NG   ") + m); if (!c) fail.push(m); };

// ---- 最小の DOM -------------------------------------------------------
function el(tag) {
  const e = {
    tagName: (tag || "div").toUpperCase(),
    children: [], _text: "", _html: "", handlers: {}, style: {}, dataset: {},
    hidden: false, value: "", className: "",
    classList: { _s: new Set(), add(x) { this._s.add(x); }, remove(x) { this._s.delete(x); }, contains(x) { return this._s.has(x); } },
    get textContent() { return this._text || this.children.map((c) => c.textContent).join(""); },
    set textContent(v) { this._text = String(v); this.children = []; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); if (v === "") this.children = []; },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    get offsetWidth() { return 100; },
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { cs.forEach((c) => this.children.push(c)); },
    addEventListener(n, f) { (this.handlers[n] = this.handlers[n] || []).push(f); },
    setAttribute() {}, focus() {}, remove() {},
    getBoundingClientRect() { return { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 }; },
    click() { (this.handlers.click || []).forEach((f) => f({ preventDefault() {}, stopPropagation() {} })); },
    toBlob(cb) { cb({}); },
    getContext() { return ctx; },
    width: 1080, height: 1350,
  };
  return e;
}
let drawCalls = 0, textCalls = 0;
const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 30 }),
                        createLinearGradient: () => ({ addColorStop() {} }) }, {
  get(t, k) {
    if (k in t) return t[k];
    return (...a) => { drawCalls += 1; if (k === "fillText") textCalls += 1; return undefined; };
  },
  set() { return true; },
});

const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const appSrc = fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8");
const bundleSrc = fs.readFileSync(path.join(ROOT, "app", "data", "bundle.js"), "utf8");
const imgSrc = fs.readFileSync(path.join(ROOT, "app", "data", "img.js"), "utf8");
const kinSrc = fs.readFileSync(path.join(ROOT, "app", "data", "kin.js"), "utf8");

// ---- app.js が触る id が index.html にあるか (1 回だけ) ----------------
const used = [...appSrc.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
const missing = [...new Set(used)].filter((i) => !ids.includes(i));
ok(missing.length === 0, "app.js が触る id はすべて index.html にある" +
   (missing.length ? " → 無い: " + missing.join(", ") : ""));

// ---- 1 回ぶん、幕から札まで通す -----------------------------------------
/**
 * @param seed  選択肢の何番目を押すか (0 なら常に先頭、1 なら 2 番目…)
 * @param date  今日の日付 (暦の噺を出すため)
 */
function runPass(seed, date, word, kin, viaList, plan) {
  const byId = {};
  ids.forEach((i) => {
    byId[i] = el("div");
    const tag = html.match(new RegExp('<[^>]*id="' + i + '"[^>]*>'));
    byId[i].hidden = !!(tag && /\shidden(\s|>|=)/.test(tag[0]));
  });
  drawCalls = 0; textCalls = 0;
  const timers = [];
  const store = {};
  const win = {
    scrollTo() {}, scrollBy() {}, innerHeight: 800, confirm: () => true,
    requestAnimationFrame: (f) => f(),
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    location: { search: "?date=" + date + (kin ? "&kin=" + kin : ""),
                href: "file:///app/index.html?date=" + date + (kin ? "&kin=" + kin : ""),
                reload: function () { this._reloaded = true; } },
    URL: { createObjectURL: () => "blob:", revokeObjectURL() {} },
  };
  // ★head を 持たせる。★app.js の lazy() が ここへ <script> を 足す。
  //   ★src は 読まない (最小 DOM なので) が、★落ちずに 進むことを 確かめる。
  const head = el("head");
  const doc = { createElement: el, getElementById: (i) => byId[i] || null, body: el("body"),
                head: head, execCommand: () => true };
  win.history = { replaceState: () => {} };
  const st = (f) => { timers.push(f); return timers.length; };
  const Img = function () { this.complete = false; this.naturalWidth = 0; };
  const load = (src) => new Function("window", "document", "localStorage", "location", "setTimeout",
    "clearTimeout", "requestAnimationFrame", "Image", "self", "history", src)
    .call(win, win, doc, win.localStorage, win.location, st, () => {}, win.requestAnimationFrame,
          Img, win, win.history);

  let bootErr = null;
  try { load(bundleSrc); load(imgSrc); load(kinSrc); load(appSrc); } catch (e) { bootErr = e; }
  if (bootErr) return { err: bootErr };

  /** #choices の中から、押せるものを 1 つ見つける */
  const clickable = (node, nth) => {
    const btns = [];
    (function walk(n) {
      n.children.forEach((c) => {
        if (c.handlers.click && c.handlers.click.length) btns.push({ t: c.textContent, f: () => c.click() });
        else if (c.handlers.submit && c.handlers.submit.length) {
          const inp = c.children.find((x) => x.tagName === "INPUT");
          if (inp) inp.value = word !== undefined ? word
            : ["", "旭山動物園", "恐竜", "つつじ", "ぜんぜん知らない言葉"][nth % 5];
          btns.push({ t: "(打ち込み)", f: () => c.handlers.submit.forEach((f) => f({ preventDefault() {} })) });
        } else walk(c);
      });
    })(node);
    if (!btns.length) return null;
    // ★答えを 指定して 通す (県を 選ばせる ような 筋を 試すのに 要る)
    if (plan && plan.length) {
      const i = btns.findIndex((b) => b.t.indexOf(plan[0]) >= 0);
      if (i >= 0) { plan.shift(); return btns[i].f; }
    }
    return btns[Math.min(seed, btns.length - 1)].f;
  };

  let err = null, clicks = 0, listPicked = false, listCount = 0;
  try {
    if (viaList) {
      byId.kinList.click();                       // 「全国の動物園から」
      const btns = [];
      byId.kinBody.children.forEach((g) => {
        if (g.className === "kingrid") g.children.forEach((b) => btns.push(b));
      });
      listCount = btns.length;
      if (btns.length) { btns[0].click(); listPicked = true; }
    } else {
      byId.open.click();
    }
    for (let step = 0; step < 4000; step += 1) {
      while (timers.length) { timers.shift()(); }
      const hit = clickable(byId.choices, clicks);
      if (hit) { hit(); clicks += 1; } else break;
    }
  } catch (e) { err = e; }
  const log = JSON.parse(win.localStorage.getItem("hanashiyama.log.v1") || "[]");
  const all = [...win.HANASHI.stories, ...win.HANASHI.prefStories, ...Object.values(win.HANASHI.today).flat()];
  return {
    err, clicks, byId, log, all, draw: drawCalls, text: textCalls, listPicked, listCount,
    href: win.location.href,
    figs: byId.talk.children.filter((c) => c.className === "figure").length,
    scenes: byId.talk.children.filter((c) => c.className === "shashin").length,
    told: log.filter((e) => e.event === "shown").map((e) => e.story),
  };
}

// ---- 何通りか通す ------------------------------------------------------
const passes = [
  [0, "2026-09-22"], [1, "2026-05-05"], [2, "2026-11-28"], [3, "2026-09-19"],
  [0, "2026-09-22", "吉田松陰"],   // ★噂の一言がつく噺 (S01) を通るように 自由入力で狙う
  [0, "2026-09-23", "", "kushiro"],  // ★v2: 園の入口から 入る (釧路)
  [0, "2026-09-23", "", "ikeda"],    // ★alias (岡山=池田) でも 引けるか
];
let totalScene = 0, totalFig = 0, totalWant = 0, totalClicks = 0, sawSage = false, sawTane = false, sawDelta = false, uwasaSeen = 0;
passes.forEach(([seed, date, word, kin]) => {
  const r = runPass(seed, date, word, kin);
  if (r.err) { ok(false, "通し " + seed + " (" + date + ") で落ちた → " + r.err.message + " | " + String(r.err.stack).split("\n")[1]); return; }
  const figStories = r.told.map((id) => r.all.find((x) => x.id === id)).filter((x) => x && x.fig);
  const want = figStories.length;
  // 絵図の出し所: hondai は問いより前、after は問いより後
  figStories.forEach((s2) => {
    const kids = r.byId.talk.children;
    const iFig = kids.findIndex((c) => c.className === "figure");
    const iQ = kids.findIndex((c) => c.textContent === (s2.question && s2.question.text));
    if (iFig < 0 || iQ < 0) return;
    const after = s2.fig.when === "after";
    ok(after ? iFig > iQ : iFig < iQ,
       "  " + s2.id + " の絵図は問いの" + (after ? "あと" : "前") + "に出る (絵図 " + iFig + " / 問い " + iQ + ")");
  });
  totalFig += r.figs; totalWant += want; totalClicks += r.clicks;
  const txt = r.byId.talk.children.map((c) => c.textContent).join(" ");
  if (/札を一枚、お出しします/.test(txt)) sawSage = true;
  const tane = JSON.stringify(r.byId.sources.children.map(function f(c) { return [c.tagName, c._text, c.children.map(f)]; }));
  // ★2026-09-22: 一覧は画面から外した (見る人に要らない)。出典だけが出ること
  if (tane.length > 2 && !/語らないと決めた話|数字が割れているもの/.test(tane)) sawTane = true;
  // 噂の一言がついた噺では、それが語られていること
  r.told.forEach((id) => {
    const s3 = r.all.find((x) => x.id === id);
    if (s3 && s3.uwasa && s3.uwasa.text) {
      ok(txt.indexOf(s3.uwasa.text) >= 0, "  " + id + " の噂の一言が語られる");
      uwasaSeen += 1;
    }
  });
  if (r.log.some((e) => e.event === "delta")) sawDelta = true;
  ok(r.clicks >= 5 && r.byId.sageBox.hidden === false && r.text >= 6,
     "通し " + seed + " (" + date + (word ? " / " + word : "") + "): " + r.clicks + " 回押して 札まで届いた [" + r.told.join(" → ") + "]");
  ok(r.figs >= want, "  絵図: 出た " + r.figs + " 枚 / 出るはず " + want + " 枚");
  ok(r.scenes >= 1, "  噺の途中に 小さい写真が 出た (" + r.scenes + " 枚 / " + r.told.length + " 席)");
  totalScene += r.scenes;
  ok(r.log.every((e) => !e.text || e.text.length <= 30), "  自由入力は 30 字まで");
});
ok(totalWant >= 1, "4 通りのうち 絵図のある噺を " + totalWant + " 席 通った (1 席以上)");
ok(totalFig === totalWant, "絵図の出た数と 出るはずの数が 合う (" + totalFig + " / " + totalWant + ")");
ok(totalScene >= passes.length, "どの通しでも 写真が 出た (" + totalScene + " 枚)");
ok(sawSage, "札を出す前に「お出しします」と断っている");
ok(sawTane, "タネ明かしは出典だけ (語らなかった話・割れた数字の一覧は画面に出さない)");
ok(uwasaSeen >= 1, "噂の一言のついた噺を 1 席以上通り、それが語られた (" + uwasaSeen + " 席)");
ok(sawDelta, "気持ちの動き (delta) が記録された");
// ★v2: 幕の「全国の動物園から」→ 園を選ぶ → その場で 幕が開く (再読み込み なし)
const rl = runPass(0, "2026-09-23", "", null, true);
ok(!rl.err, "一覧から選んで 通しで 落ちない" + (rl.err ? " → " + rl.err.message : ""));
ok(rl.listPicked, "一覧に 園のボタンが 並んだ (" + rl.listCount + " 件)");
ok(!rl.err && rl.byId.maku.hidden === true && rl.byId.koza.hidden === false,
   "園を選んだら その場で 幕が開いた");
ok(!rl.err && rl.byId.kin.hidden === true, "一覧は 閉じた");
ok(/から お越しでございますか/.test(rl.err ? "" : rl.byId.talk.children.map((c) => c.textContent).join(" ")),
   "園の名前で 迎える (一覧から でも)");
// ★一覧から選んでも URL を 書き換えない (リロード・F5 で 園に 貼り付かない)
ok(rl.href.indexOf("kin=") < 0,
   "一覧から選んでも URL に kin= を 足さない (リロードで 園が 残らない) → " + rl.href);
// ★トップの 一席目は 観光地の噺 (去年との 差別化。SPEC §11)
const tops = [0, 1, 2, 3].map((sd) => runPass(sd, "2026-09-23"))
  .filter((r) => !r.err).map((r) => r.told[0]);
ok(tops.every((id) => ["S11", "S12", "S08"].indexOf(id) >= 0),
   "トップの一席目が 観光地の噺で 固定されている (" + tops.join(", ") + ")");
const kinFirst = runPass(0, "2026-09-23", "", "kushiro");
ok(!kinFirst.err && kinFirst.told[0] && ["S11", "S12", "S08"].indexOf(kinFirst.told[0]) < 0,
   "園の入口からは 固定を かけない (" + (kinFirst.told[0] || "?") + ")");
// ★v2: 園の入口 (?kin=) と 出口固定
const rk = runPass(0, "2026-09-23", "", "kushiro");
const txtk = rk.err ? "" : rk.byId.talk.children.map((c) => c.textContent).join(" ");
ok(!rk.err, "園の入口から 通しで 落ちない" + (rk.err ? " → " + rk.err.message : ""));
ok(/釧路市動物園から お越し/.test(txtk), "園の名前で 迎える");
ok(/うちから渡った子が おる/.test(txtk), "その園に 鯖江から 渡った子が いる、と 言う");
ok(!/どちらからお越しで/.test(txtk), "県を 聞き直さない (入口で 分かっている)");
const ra = runPass(0, "2026-09-23", "", "ikeda");
ok(/池田動物園から お越し/.test(ra.err ? "" : ra.byId.talk.children.map((c) => c.textContent).join(" ")),
   "alias (ikeda) でも 園を 引ける");


// ★README の 決まり 1「あなたの県から 始める」が 本当に 効いているか
//   ★2026-09-23 まで TOP_FIRST が これを 押しのけ、★県の噺が 一度も 出ていなかった
const prefCase = (label, plan, want) => {
  const r = runPass(0, "2026-09-23", "", "", false, plan.slice());
  const first = r.err ? "(落ちた)" : r.told[0];
  ok(first === want, label + " の一席目が " + want + " (" + first + ")" +
     (r.err ? " → " + r.err.message : ""));
};
prefCase("山口県", ["県外から", "中国・四国", "山口県", "思う"], "S01");
prefCase("福井県", ["この福井から", "思う"], "S10");
prefCase("新潟県", ["県外から", "中部", "新潟県", "思う"], "S14");
const tk = runPass(0, "2026-09-23", "", "", false, ["県外から", "関東", "東京都", "思う"]);
ok(!tk.err && ["S02", "S13"].indexOf(tk.told[0]) >= 0,
   "東京都 の一席目が 東京の噺 (" + (tk.told[0] || "?") + ")");
// ★県を 言わない客は これまで通り 観光地の噺から (SPEC §11)
const deny3 = ["いや、どうだか", "いや、どうだか", "いや、どうだか"];
const noPref = runPass(0, "2026-09-23", "", "", false, ["言わずにおく"].concat(deny3));
ok(!noPref.err && ["S11", "S12", "S08"].indexOf(noPref.told[0]) >= 0,
   "県を 言わない客は 観光地の噺から (" + (noPref.told[0] || "?") + ")");
// ★手書きの噺が 無い県は 観光地の噺に 落ちる (レッサーパンダの 自動席を 先頭に しない)
const noStory = runPass(0, "2026-09-23", "", "", false,
                        ["県外から", "九州・沖縄", "佐賀県"].concat(deny3));
ok(!noStory.err && ["S11", "S12", "S08"].indexOf(noStory.told[0]) >= 0,
   "手書きの噺が 無い県は 観光地の噺から (" + (noStory.told[0] || "?") + ")");
// ★その県の 問いを 否定した客には、その噺で 落とさない
//   (★「そうは思わない」と 言われた ものを ひっくり返しても、客の中で もう 立っていない)
const denied = runPass(0, "2026-09-23", "", "", false,
                       ["県外から", "中国・四国", "山口県"].concat(deny3));
ok(!denied.err && denied.told[0] !== "S01",
   "否定された 思い込みの噺では 始めない (" + (denied.told[0] || "?") + ")");

console.log(fail.length ? "FAIL " + fail.length + " 件" : "ALL OK");
process.exit(fail.length ? 1 : 0);
