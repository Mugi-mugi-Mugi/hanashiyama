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
// ★固定の 乱数 (mulberry32)。★選び方が ランダムに なった (2026-11-15) ので 試験は 種を 決めて 回す
function seeded(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
    // ★属性は 覚えておく (扇子の 区切りの aria-hidden を 見る)
    attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    focus() {}, remove() {},
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
// ★HANASHI_APP_ALL = 直す 前の app.js で 全部を 通す (★試験の 効きを 見る。2026-11-20)
const appSrc = fs.readFileSync(process.env.HANASHI_APP_ALL || path.join(ROOT, "app", "app.js"), "utf8");
const bundleSrc = fs.readFileSync(path.join(ROOT, "app", "data", "bundle.js"), "utf8");
const keysSrc = fs.readFileSync(path.join(ROOT, "app", "data", "img", "_keys.js"), "utf8");
const kinSrc = fs.readFileSync(path.join(ROOT, "app", "data", "kin.js"), "utf8");

// ---- app.js が触る id が index.html にあるか (1 回だけ) ----------------
const used = [...appSrc.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
const missing = [...new Set(used)].filter((i) => !ids.includes(i));
ok(missing.length === 0, "app.js が触る id はすべて index.html にある" +
   (missing.length ? " → 無い: " + missing.join(", ") : ""));

// ---- 背景の 写真の 数え方 (2026-11-15 から 写真は 行の 間に 挟まず 背景の 層に 出す) ----
const hasC = (c, k) => new RegExp("(^| )" + k + "( |$)").test(c.className || "");
/** 写真が 出た ことを 示す 読み上げ用の 行 = 場面の 頭 (写真あり) / 前段・img2 の 差し替え */
const isPhotoLine = (c) => (hasC(c, "midashi-sr") && c.dataset.shown === "1") || hasC(c, "shashin-sr");

// ---- 1 回ぶん、幕から札まで通す -----------------------------------------
/**
 * @param seed  選択肢の何番目を押すか (0 なら常に先頭、1 なら 2 番目…)
 * @param date  今日の日付 (暦の噺を出すため)
 */
function runPass(seed, date, word, kin, viaList, plan, opt) {
  opt = opt || {};
  const byId = {};
  ids.forEach((i) => {
    byId[i] = el("div");
    const tag = html.match(new RegExp('<[^>]*id="' + i + '"[^>]*>'));
    byId[i].hidden = !!(tag && /\shidden(\s|>|=)/.test(tag[0]));
  });
  drawCalls = 0; textCalls = 0;
  const timers = [];
  const store = Object.assign({}, opt.store || {});
  const win = {
    HANASHI_RNG: seeded(opt.seed == null ? 1 : opt.seed),     // ★選び方の 乱数 (2026-11-15 から ランダム)
    scrollTo() {}, scrollBy() {}, innerHeight: 800, confirm: () => true,
    // ★opt.reduce = 端末が「動きを 減らす」設定 (prefers-reduced-motion: reduce)
    matchMedia: (q) => ({ matches: !!opt.reduce && /prefers-reduced-motion:\s*reduce/.test(q) }),
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
  // ★lazy() が 足す <script> を ★その場で 読んで onload を 呼ぶ (写真を 席ごとに 読む 流れを 通す)
  const loaded = [];
  head.appendChild = (s) => {
    const f = path.join(ROOT, "app", s.src || "");
    if (s.src && fs.existsSync(f)) { load(fs.readFileSync(f, "utf8")); loaded.push(s.src); if (s.onload) s.onload(); }
    else if (s.onerror) s.onerror();
    return s;
  };
  const doc = { createElement: el, getElementById: (i) => byId[i] || null, body: el("body"),
                head: head, execCommand: () => true };
  win.history = { replaceState: () => {} };
  // ★待ち時間 (ms) も 持つ。★足し上げると その 筋の 目安の 長さに なる (人が 押す 時間は 入らない)
  const st = (f, ms) => { timers.push([f, ms || 0]); return timers.length; };
  const Img = function () { this.complete = false; this.naturalWidth = 0; };
  const load = (src) => new Function("window", "document", "localStorage", "location", "setTimeout",
    "clearTimeout", "requestAnimationFrame", "Image", "self", "history", src)
    .call(win, win, doc, win.localStorage, win.location, st, () => {}, win.requestAnimationFrame,
          Img, win, win.history);

  let bootErr = null;
  try {
    load(bundleSrc); load(keysSrc); load(kinSrc);
    // ★現地の 謎かけを 試すときだけ「現地で 確かめた」ことに する (★本物の 台帳は 触らない)
    (opt.verify || []).forEach((id) => { const g = win.HANASHI.genchi.find((x) => x.id === id); if (g) g.verified_onsite = "2026-11-20"; });
    // ★台本を 試しに 書き換える (★図の 場面・img2 の ように まだ 台本に 無い 形を 試す。★本物は 触らない)
    if (opt.patch) opt.patch(win.HANASHI);
    load(appSrc);
  } catch (e) { bootErr = e; }
  if (bootErr) return { err: bootErr };

  /** #choices の中から、押せるものを 1 つ見つける */
  const clickable = (node, nth) => {
    const btns = [];
    (function walk(n) {
      n.children.forEach((c) => {
        if (c.handlers.click && c.handlers.click.length) btns.push({ t: c.textContent, f: () => c.click() });
        else if (c.handlers.submit && c.handlers.submit.length) {
          // ★opt.later = 謎かけで「いまは よしておく」を 押す (2026-11-20)
          if (opt.later) {
            const lb = (function find(n) {
              for (const k of n.children) { if (/いまは よしておく/.test(k.textContent || "") && k.handlers.click) return k; const r = find(k); if (r) return r; }
              return null;
            })(c);
            if (lb) { btns.push({ t: lb.textContent, f: () => { opt.later = false; lb.click(); } }); return; }
          }
          const inp = c.children.find((x) => x.tagName === "INPUT");
          // ★opt.words = 打ち込む 語の 列。★使い切ったら 打たない (外れの 謎かけが 続いて 止まらないのを 防ぐ)
          if (opt.words) { if (!opt.words.length) return; if (inp) inp.value = opt.words.shift(); }
          else if (inp) inp.value = word !== undefined ? word
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

  let err = null, clicks = 0, listPicked = false, listCount = 0, maxVisible = 0, firstText = null;
  // ★画面に 大きく 出ている 語りの 数 (畳んで いない もの。間 (ma) と 読み上げ用の 行 (sr) と 扇子の 区切り (sensu) は 数えない)
  // ★2026-11-15: オチの 予告の 一行 (yokoku) と、札まで 残す その席の サゲ (data-sid) は ㊵ の 例外 = 数えない
  // ★同日: 客の 相槌 (aizuchi。「次へ」の 代わり) と オチの 註 (ochi-what) も 数えない
  const visible = () => byId.talk.children.filter((c) => !/(^| )(tatami|ma|sr|sensu|yokoku|aizuchi|ochi-what)( |$)/.test(c.className || "") && !(c.dataset && c.dataset.sid)).length;
  // ★画面の 移り変わり (見出し・背景・一拍)。★変わった ときだけ 残す
  let clock = 0;
  const snaps = [], marks = {};
  const snap = () => {
    const s = {
      clock, n: byId.talk.children.length,
      mid: byId.midashi.hidden ? "" : byId.midashi.textContent,
      mek: byId.mekuri.textContent,
      // ★2026-11-15: 写真は 0.3 秒 かけて 消える (kieru)。★消え始めた 時点で 下げた ものと 見る
      bg: byId.haikei.hidden || /(^| )kieru( |$)/.test(byId.haikei.className || "") ? "" : String(byId.haikeiImg.src || ""),
      lab: byId.haikeiCap.hidden || /(^| )kieru( |$)/.test(byId.haikeiCap.className || "") ? "" : byId.haikeiLabel.textContent,
      cred: byId.haikeiCap.hidden || /(^| )kieru( |$)/.test(byId.haikeiCap.className || "") ? "" : byId.haikeiCredit.textContent,
      hit: /(^| )hitoiki( |$)/.test(byId.koza.className || ""),
      zu: !byId.zu.hidden,
      haori: /(^| )haori-nugi( |$)/.test(byId.koza.className || ""),   // ★羽織を 脱いだ 地 (P1-3)
      stg1: byId.stg1.className || "",                                 // ★進行の めくりの「本題」
    };
    const p = snaps[snaps.length - 1];
    if (!p || ["n", "mid", "mek", "bg", "lab", "cred", "hit", "zu", "haori", "stg1"].some((k) => p[k] !== s[k])) snaps.push(s);
    if (opt.marks) {
      // ★2026-11-20: 前段で 問うた 席は 振りを 飛ばす → 振り か まくらの 早い ほうから 数える
      if (marks.furi == null && byId.talk.children.some((c) => /(^| )(furi|makura)( |$)/.test(c.className || ""))) marks.furi = clock;
      if (marks.card == null && byId.sageBox.hidden === false) marks.card = clock;
    }
  };
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
    // ★動きを 待たずに 文字を 出す: 幕を 開けた その場で (タイマーを 1 つも 回さずに) 1 字目が 出ている
    // ★読み上げ用の 行 (sr) は 画面に 出ないので 除く (2026-11-15 から 全文の 写しが 先に 入る)
    firstText = (byId.talk.children.find((c) => !/(^| )sr( |$)/.test(c.className || "")) || { textContent: "" }).textContent;
    snap();
    const drain = () => {
      for (let step = 0; step < 4000; step += 1) {
        while (timers.length) {
          const [f, ms] = timers.shift();
          clock += ms;
          f();
          maxVisible = Math.max(maxVisible, visible());
          snap();
        }
        const hit = clickable(byId.choices, clicks);
        if (hit) { hit(); clicks += 1; snap(); } else break;
      }
    };
    drain();
    // ★opt.thenClick = 流れが 止まった あとに 押す ボタンの id (★札の 下の「現地の謎かけに答える」など)
    if (opt.thenClick) {
      opt.shownBefore = !byId[opt.thenClick].hidden;
      if (opt.shownBefore) { if (opt.thenWords) opt.words = opt.thenWords; byId[opt.thenClick].click(); drain(); }
    }
    // ★opt.until = 席の id。★札の あと「もう一席」を 押し続けて、その席が 出るまで 通す
    //   (★手がかりでは 狙えない 席 (例 S17) の 写真を 確かめるのに 要る)
    const toldNow = () => JSON.parse(win.localStorage.getItem("hanashiyama.log.v1") || "[]")
      .filter((e) => e.event === "shown").map((e) => e.story);
    for (let more = 0; opt.until && more < 80 && toldNow().indexOf(opt.until) < 0; more += 1) {
      const n = toldNow().length;
      byId.again.click();
      drain();
      if (toldNow().length === n) break;          // ★種切れ (もう 出る 席が 無い)
    }
  } catch (e) { err = e; }
  const log = JSON.parse(win.localStorage.getItem("hanashiyama.log.v1") || "[]");
  const all = [...win.HANASHI.stories, ...win.HANASHI.prefStories, ...Object.values(win.HANASHI.today).flat()];
  return {
    err, clicks, byId, log, all, draw: drawCalls, text: textCalls, listPicked, listCount,
    href: win.location.href, maxVisible, loaded, store, snaps, marks, clock, firstText,
    talkText: byId.talk.children.map((c) => c.textContent).join(" "),
    figs: byId.talk.children.filter((c) => /(^| )figure( |$)/.test(c.className)).length,
    // ★写真は 背景の 層に 出る。★出た 回数 = 読み上げ用の 行 (場面の 頭で 写真あり + 前段・img2 の 写真)
    scenes: byId.talk.children.filter(isPhotoLine).length,
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
  // ★図の 場面 (scenes に fig:"main") を 持つ 席の 図は 上に 固定して 出す = 語りの 中には 出ない (別の 試験で 見る)
  const figStories = r.told.map((id) => r.all.find((x) => x.id === id))
    .filter((x) => x && x.fig && !((x.scenes || []).some((s) => s && s.fig && (x.fig.when || "hondai") === "hondai")));
  const want = figStories.length;
  // 絵図の出し所: hondai は問いより前、after は問いより後
  figStories.forEach((s2) => {
    const kids = r.byId.talk.children;
    const iFig = kids.findIndex((c) => /(^| )figure( |$)/.test(c.className));
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
  // ★2026-11-14 から 前段の 問答は 2〜3 つ。★札の あとの 気持ちを 入れて 3 回 以上
  ok(r.clicks >= 3 && r.byId.sageBox.hidden === false && r.text >= 6,
     "通し " + seed + " (" + date + (word ? " / " + word : "") + "): " + r.clicks + " 回押して 札まで届いた [" + r.told.join(" → ") + "]");
  ok(r.figs >= want, "  絵図: 出た " + r.figs + " 枚 / 出るはず " + want + " 枚");
  ok(r.scenes >= 1, "  背景の 写真が 出た (" + r.scenes + " 回 / " + r.told.length + " 席)");
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
const tops = [0, 1, 2, 3, 4, 5].map((sd) => runPass(sd, "2026-09-23", "", "", false, ["言わずにおく", "思う"]))
  .filter((r) => !r.err).map((r) => r.told[0]);
// ★2026-11-15 作者の判断: 一席目は TOP_FIRST 3 + 手書きの 動物 6 (+ 県を いただけば その県の 噺) から 均等に
ok(tops.length && tops.every((id) => ["S11", "S12", "S08", "S17", "S32", "S39", "S42", "S44", "S54"].indexOf(id) >= 0),
   "県を 言わない 客の 一席目は 候補 9 席の 中から (" + tops.join(", ") + ")");
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
const deny3 = ["いや、どうだか"];   // ★2026-11-14 から 思い込みは 1 問だけ (三つの 約束)
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


// ==== 2026-11-14 読む負担を 減らす (受け入れ条件) ==========================
const mondoOf = (r) => { const s = r.log.find((e) => e.event === "shown"); return s ? s.mondo : -1; };
// ★P0-2 標準ルートは 問答 3 つ (県外 → 地方 → 県 は 1 つ)。★冒頭の「三つだけ」どおりに 終わる
const std = runPass(0, "2026-09-23", "", "", false, ["いや、べつに", "県外から", "関東", "茨城県", "思う"]);
ok(!std.err && mondoOf(std) === 3, "標準ルート: 本題まで 問答 3 つ (" + mondoOf(std) + ")" + (std.err ? " → " + std.err.message : ""));
ok(/三つだけ伺います/.test(std.talkText), "冒頭で「三つだけ伺います」と 数を 言う");
ok(!/どちらからお越しで/.test(std.talkText.split("噺の前に")[1] || ""), "3 問目の あとに 問いを 足さない");
// ★園の入口は 2 つ (どちらから を 省く)
const k2 = runPass(0, "2026-09-23", "", "kushiro", false, ["いや、べつに", "思う"]);
ok(!k2.err && mondoOf(k2) === 2 && /二つだけ伺います/.test(k2.talkText), "園の入口: 問答 2 つ / 「二つだけ」 (" + mondoOf(k2) + ")");
// ★再訪は 2 つ (前回の 県を 確かめるだけ)
const rv = runPass(0, "2026-09-23", "", "", false, ["いや、べつに", "はい、また"], { store: { "hanashiyama.pref.v1": "茨城県" } });
ok(!rv.err && mondoOf(rv) === 2 && /また茨城県からで/.test(rv.talkText) && /二つだけ伺います/.test(rv.talkText),
   "再訪: 「また茨城県からで?」で 問答 2 つ (" + mondoOf(rv) + ")");
// ★「別のところから」は 言い直し (数を 増やさない)。★冒頭で「二つだけ」と 言ったので ★思い込みは 伺わず 噺へ
//   (★2026-11-15 見直し: 前は ここで 思い込みを 伺い「二つ」と 言って 三つに なって いたのを、この 試験が OK に して いた)
const rv2 = runPass(0, "2026-09-23", "", "", false, ["いや、べつに", "別のところから", "この福井から"], { store: { "hanashiyama.pref.v1": "茨城県" } });
const rv2After = (rv2.talkText || "").split("別のところから")[1] || "";
ok(!rv2.err && mondoOf(rv2) === 2 && /二つだけ伺います/.test(rv2.talkText) && !/噺の前に、ひとつ/.test(rv2After) && rv2.told.length >= 1,
   "再訪で 県が 変わった: 「二つだけ」と 言った とおり 問答 2 つで 噺へ (" + mondoOf(rv2) + (/噺の前に、ひとつ/.test(rv2After) ? " / 思い込みを 伺った" : "") + ")");
ok(!rv2.err && rv2.store["hanashiyama.pref.v1"] === "福井県", "再訪で 言い直した 県を 覚えた (" + rv2.store["hanashiyama.pref.v1"] + ")");
// ★言い直しで「県外から」→ 地方 → 県 と 進んでも 同じ (問答 2 つ)
const rv3 = runPass(0, "2026-09-23", "", "", false, ["いや、べつに", "別のところから", "県外から", "関東", "群馬県"], { store: { "hanashiyama.pref.v1": "茨城県" } });
ok(!rv3.err && mondoOf(rv3) === 2 && !/噺の前に、ひとつ/.test((rv3.talkText || "").split("別のところから")[1] || ""),
   "再訪で 県外の 県に 言い直しても 問答 2 つ (" + mondoOf(rv3) + ")");
// ★本人が 話したがる ときだけ 増える (最大 6)
const fr = runPass(0, "2026-09-23", "城めぐり", "", false, ["ふつう", "この福井から", "ほかに言いたいことがある"]);
ok(!fr.err && mondoOf(fr) === 4 && mondoOf(fr) <= 6, "自由入力を 選んだ: 問答 4 つ (最大 6) (" + mondoOf(fr) + ")");
// ★県を 選んだ 直後に 新しい 県を 覚える (次に 来たとき「また○○から」)
ok(std.store["hanashiyama.pref.v1"] === "茨城県", "県を この端末に 覚えた (" + std.store["hanashiyama.pref.v1"] + ")");
// ★返しの 無い 問いを 置かない: 「言わずにおく」に「遠いところを」と 返さない
const nn = runPass(0, "2026-09-23", "", "", false, ["ふつう", "言わずにおく", "思う"]);
ok(!nn.err && /言わずにおく 結構でございます。/.test(nn.talkText.replace(/\s+/g, " ")), "「言わずにおく」には「結構でございます」と 返す");

// ★P0-3 画面に 大きく 出す 語りは ★いま + 直前 の 2 つ まで (★残りは 畳む)
const allRuns = [std, k2, rv, fr, nn];
const mx = Math.max.apply(null, allRuns.map((r) => r.maxVisible || 0));
ok(mx <= 2, "どの 時点でも 大きく 出ている 語りは 2 ブロック まで (最大 " + mx + ")");
ok(std.byId.tatami.hidden === false && /これまでの語り/.test(std.byId.tatami.textContent), "畳んだ 語りを 開く ボタンが 出る");
const tk2 = std.byId.talk.children.filter((c) => /tatami/.test(c.className || "")).length;
ok(tk2 > 5, "畳んだ 語りは 消さずに 残している (" + tk2 + " ブロック)");

// ★P0-4 写真: 前段で 1 枚 + 本題の 場面ごと + 札。★2026-11-15 から 背景の 層に 出る
const sc = std.byId.talk.children.map((c, i) => [c.className, i]);
const iFirstPhoto = std.byId.talk.children.findIndex(isPhotoLine);
const iMakura = sc.findIndex(([c]) => /makura/.test(c));
ok(iFirstPhoto >= 0 && iFirstPhoto < iMakura, "前段の うちに 写真が 1 枚 出る (写真 " + iFirstPhoto + " / まくら " + iMakura + ")");
// ★2026-11-14 から 席の 写真は ★台本の scenes で 人が 決める (null = 出さない)。
//   ★「本題で 2 枚」とは 限らない。★指定した 数だけ 出る / 指定が 無ければ 出ない、を 見る
/** 席ごとの 写真 = その席の まくら から 次の席の まくら までの 写真の 行 (読み上げ用) */
const seatPhotos = (r) => {
  const kids = r.byId.talk.children;
  const mk = kids.map((c, i) => [c, i]).filter(([c]) => /(^| )makura( |$)/.test(c.className || "")).map(([, i]) => i);
  if (mk.length !== r.told.length) return null;    // ★席と まくらが 対応しない = 数え方が 壊れた
  return r.told.map((id, n) => ({
    id, st: r.all.find((x) => x.id === id),
    photos: kids.slice(mk[n], n + 1 < mk.length ? mk[n + 1] : kids.length).filter(isPhotoLine),
  }));
};
/** 台本の 指定から 出るはずの 枚数 (★2 枚目は 本題 2 行 以上の 席だけ。app.js の midAt と 同じ) */
//   ★2026-11-15 から scenes = 場面の 配列。★写真の ある 場面の 数だけ 出る (場面の 頭で 1 枚 + img2)
const imgsOf = (st) => (Array.isArray(st.scenes) ? st.scenes.map((s) => (s && s.img) || null) : []);
const wantPhotos = (st) => imgsOf(st).filter(Boolean).length +
  (Array.isArray(st.scenes) ? st.scenes.filter((s) => s && s.img2 && s.to > s.from).length : 0);

const firstSt = std.all.find((x) => x.id === std.told[0]);
const stdSeats = seatPhotos(std);
const inSeat = stdSeats ? stdSeats[0].photos.length : -1;
ok(Array.isArray(firstSt.scenes) && inSeat === wantPhotos(firstSt),
   "一席目 (" + firstSt.id + ") の 写真は 台本の 指定どおり " + (Array.isArray(firstSt.scenes) ? wantPhotos(firstSt) : "?") +
   " 枚 (出た " + inSeat + " 枚 / scenes " + JSON.stringify(firstSt.scenes) + ")");

// ★全席を 通す (「もう一席」を 種切れまで 押す)。★台本の 席の 写真を まとめて 見る
const allSeats = runPass(0, "2026-07-15", "", "", false, ["ふつう", "言わずにおく", "いや、どうだか"], { until: "(種切れまで)" });
const seats = allSeats.err ? null : seatPhotos(allSeats);
ok(!allSeats.err && seats, "全席の 通し: 落ちず、席と まくらが 対応する (" + (allSeats.err ? allSeats.err.message : allSeats.told.length + " 席") + ")");
if (seats) {
  const hand = seats.filter((x) => x.st && Array.isArray(x.st.scenes));
  const withSpec = hand.filter((x) => wantPhotos(x.st) > 0);
  const noSpec = hand.filter((x) => wantPhotos(x.st) === 0);
  const bad1 = withSpec.filter((x) => x.photos.length !== wantPhotos(x.st));
  ok(withSpec.length >= 10 && !bad1.length,
     "scenes に 指定の ある 席は 指定した 数だけ 写真が 出る (" + withSpec.length + " 席" +
     (bad1.length ? " → 合わない: " + bad1.map((x) => x.id + " " + x.photos.length + "/" + wantPhotos(x.st) + " " + JSON.stringify(x.st.scenes)).join(", ") : "") + ")");
  const bad2 = noSpec.filter((x) => x.photos.length);
  // ★2026-11-15 から ★全席に 写真が 最低 1 枚 (作者の判断)。写真の 無い 席が 0 なら それを 確かめる
  ok(noSpec.length === 0 ? withSpec.length === hand.length
                         : noSpec.every((x) => x.photos.length === 0),
     noSpec.length === 0 ? "手書きの 席は すべて 写真が 1 枚 以上 (" + withSpec.length + " 席)"
                         : "scenes が 両方 null の 席では 本題に 写真が 出ない (" + noSpec.length + " 席)");
  // ★自動の 席 (県・暦) は 当たらなければ 出さない。★多くて 2 枚
  const auto = seats.filter((x) => x.st && !Array.isArray(x.st.scenes));
  ok(auto.every((x) => x.photos.length <= 2),
     "自動の 席 (scenes なし) の 写真は 2 枚 まで (" + auto.length + " 席 / 写真 " + auto.reduce((a, x) => a + x.photos.length, 0) + " 枚)");
  // ★手書きの 席は scenes を 必ず 持つ (★書き忘れ = 黙って 自動選びに 落ちる のを 防ぐ)
  const noArr = seats.filter((x) => x.st && !x.st.generated && !x.st.isToday && !x.st.genchi && /^S\d+$/.test(x.id) && !Array.isArray(x.st.scenes));
  ok(!noArr.length, "手書きの 席は scenes を 持つ" + (noArr.length ? " → 無い: " + noArr.map((x) => x.id).join(", ") : ""));
}

// ★背景の 写真が 出ている あいだは ★隅に「何の 写真か」と 出典が 常に ある
const figsAll = [std, allSeats].filter((r) => !r.err).flatMap((r) => r.byId.talk.children.filter(isPhotoLine));
const noLabel = figsAll.filter((f) => !(f.dataset.label || "").trim());
ok(figsAll.length >= 5 && !noLabel.length,
   "写真の 読み上げ行に「何の 写真か」が 入る (" + figsAll.length + " 枚中 無し " + noLabel.length + ")");
const bgSnaps = [std, allSeats].filter((r) => !r.err).flatMap((r) => r.snaps.filter((x) => x.bg));
const noCap = bgSnaps.filter((x) => !x.lab.trim() || !x.cred.trim());
ok(bgSnaps.length >= 5 && !noCap.length,
   "背景の 写真が 出ている あいだ 隅に「何の 写真か」と 出典が 常に 出る (" + bgSnaps.length + " 時点中 欠け " + noCap.length + ")");
const capOrder = html.indexOf('id="haikeiLabel"') >= 0 && html.indexOf('id="haikeiLabel"') < html.indexOf('id="haikeiCredit"');
ok(capOrder, "隅書きは「何の 写真か」が 先、出典が あと");

// ★名前の 指定 (S50 = 本題の 半ばに panda@ひかり。★S17 の ミンファは オチの 先回りに なるので 外した (2026-11-14 見直し)) では ★その子の 写真が 出る
// ★2026-11-20 取り込み: S50 は ひかり (2024 年に 死亡) を 名指し しなくなった (担当 A)。★名前の 指定の 仕組みは 試験の 中で タカシに 差し替えて 見る
const s50 = runPass(0, "2026-07-15", "", "", false, ["ふつう", "言わずにおく", "いや、どうだか"], { until: "S50",
  patch: (H) => { const st = H.stories.find((s) => s.id === "S50"); (st.scenes || []).forEach((sc) => { delete sc.img; }); if (st.scenes && st.scenes[1]) st.scenes[1].img = "panda@タカシ"; } });
const s50Seat = (!s50.err && seatPhotos(s50) || []).find((x) => x.id === "S50");
const s50Spec = s50Seat && s50Seat.st.scenes;
const s50Lab = s50Seat ? s50Seat.photos.map((f) => f.dataset.label || "") : [];
ok(s50Seat && imgsOf(s50Seat.st).filter(Boolean).join(",") === "panda@タカシ" &&
   s50Lab.length === 1 && s50Lab[0].indexOf("タカシ") >= 0,
   "名前の 指定 (試験で S50 に panda@タカシ) で その子の 写真が 1 枚 出る (" + (s50Seat ? s50Lab.join(" / ") || "出ず" : "S50 に 届かず [" + s50.told.join(">") + "]") + ")");
ok(std.loaded.every((s) => /^data\/img\/[a-z_]+\.js$/.test(s)) && std.loaded.length >= 2 && std.loaded.length <= 5,
   "写真は 席に 要る 群だけ 読む (" + std.loaded.length + " 本: " + std.loaded.join(", ") + ")");
ok(std.loaded.some((s) => /card_/.test(s)), "札の 写真の 群も 読んだ");
ok(std.byId.shinko.hidden === false && /now|done/.test(std.byId.stg2.className), "進みぐあい (まくら → 本題 → サゲ) が 出て サゲまで 進む");

// ★P1-1 現地の 二席目。★確かめていない (verified_onsite = null) 謎かけは 出さない
ok(!/西山公園に置いてまいりました/.test(std.talkText), "現地で 確かめていない 謎かけは 出さない");
const gj = runPass(0, "2026-09-23", "赤", "", false, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], { verify: ["G1"] });
ok(!gj.err && /西山公園に置いてまいりました/.test(gj.talkText), "確かめた 謎かけ (G1) は 一席目の あとに 出る" + (gj.err ? " → " + gj.err.message : ""));
ok(gj.told.indexOf("S55") >= 0 && gj.log.some((e) => e.event === "genchi_unlock" && e.spot === "G1" && "hoursSinceFirst" in e),
   "「赤」で 開いて 二席目 (S55) が 始まり、記録に 残る [" + gj.told.join(" → ") + "]");
ok(gj.log.some((e) => e.event === "genchi_offer"), "謎かけを 出したことも 記録する");
// ★現地の 席は 全席の 通しには 出ない (謎かけで 開く)。★ここで 写真の 数を 見る
const gjSeat = (!gj.err && seatPhotos(gj) || []).find((x) => x.id === "S55");
ok(gjSeat && Array.isArray(gjSeat.st.scenes) && gjSeat.photos.length === wantPhotos(gjSeat.st),
   "現地の 席 S55 も 台本の 指定どおりの 数の 写真 (" + (gjSeat ? gjSeat.photos.length + "/" + wantPhotos(gjSeat.st) + " " + JSON.stringify(gjSeat.st.scenes) : "席が 見つからない") + ")");
// ★2026-11-21 (文脈の 見直し): 次の 場所 (G2) が まだ 確かめて いない ときは「この続きは、結びの広場に」と 言わない (行っても 何も 出ない)
ok(!/坂の中ほど、結びの広場/.test(gj.talkText), "S55 の あと、G2 が まだ 確かめて いなければ 次の 場所 (結びの広場) へ 送らない");
const gm = runPass(0, "2026-09-23", "", "", false, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], { verify: ["G1"], words: ["あお"] });
ok(!gm.err && /ヒントを ひとつ/.test(gm.talkText) && gm.log.some((e) => e.event === "genchi_miss"),
   "外れたら「惜しい」では なく ヒントを 一つ / 外れを 数える");
ok(JSON.parse(gm.store["hanashiyama.genchi.v1"] || "{}").pending === "G1", "答えられなかった 謎かけは お預けとして 覚える (幕から 答えられる)");
const gw = runPass(0, "2026-09-23", "", "", false, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], { verify: ["G1"], words: ["あお", "ＡＫＡ", "アカ"] });
// ★2026-11-20 作者の判断: もう 公園に いる 人に「行ってみたい気持ち」を 聞かない
const IKITAI = /いま、いかがです。西山公園、行ってみたい気持ちは/g;
// ★talkText には 読み上げ用の 写し (sr) も 入る → 台詞の 回数では なく ★記録 (q1) で 数える
ok(!gj.err && gj.log.filter((e) => e.event === "q1").length === 1 && gj.log.filter((e) => e.event === "delta").length === 1,
   "謎かけで 開いた 現地の 席 (S55) では 行きたい度を 聞かない・Δq に 混ぜない (聞いた 回数 " + gj.log.filter((e) => e.event === "q1").length + ")");
const gs = runPass(0, "2026-09-23", "", "", false, ["いま、公園におります", "県外から", "関東", "茨城県", "思う"], { verify: ["G1"], words: ["赤"] });
ok(!gs.err && !IKITAI.test(gs.talkText) && gs.log.some((e) => e.event === "onsite") && !gs.log.some((e) => e.event === "q1" || e.event === "delta" || e.event === "q0"),
   "最初に「いま、公園におります」→ 終わりの 問いを 出さない・Δq に 混ぜない" + (gs.err ? " → " + gs.err.message : ""));
IKITAI.lastIndex = 0;
ok(!gs.err && /西山公園に置いてまいりました/.test(gs.talkText) && gs.told.indexOf("S55") >= 0, "公園に いる 人にも 謎かけは 出る (札 → 謎かけ → S55)");
const glOpt = { verify: ["G1"], later: true, thenClick: "genchiAgain", thenWords: ["赤"] };
const gl2 = runPass(0, "2026-09-23", "", "", false, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], glOpt);
ok(!gl2.err && glOpt.shownBefore === true && /札の 下か、次に 開いた ときの 最初の 画面/.test(gl2.talkText),
   "「いまは よしておく」の あと 札の 下に「現地の謎かけに答える」が 出る・どこに 出るかを 言う" + (gl2.err ? " → " + gl2.err.message : ""));
ok(!gl2.err && gl2.byId.genchiBtn.hidden === true && gl2.byId.genchiAgain.hidden === true && /お預けの 謎かけ/.test(gl2.talkText) && gl2.told.indexOf("S55") >= 0,
   "札の 下から 答えて S55 が 開く・開いたら ボタンは 消える (表紙の ボタンも)");
const glOpt3 = { verify: ["G1"], later: true };
const gl3 = runPass(0, "2026-09-23", "", "", false, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], glOpt3);
ok(!gl3.err && gl3.byId.genchiBtn.hidden === false && gl3.byId.genchiAgain.hidden === false && JSON.parse(gl3.store["hanashiyama.genchi.v1"] || "{}").pending === "G1",
   "よしておいた あと 表紙の ボタンも 出る 状態 (開き直さなくても)");
// ★確かめていない 謎かけでは どちらの ボタンも 出ない
ok(!std.err && std.byId.genchiAgain.hidden === true && std.byId.genchiBtn.hidden === true, "確かめていない 謎かけでは 札の 下の ボタンも 出ない");
ok(!gw.err && gw.told.indexOf("S55") >= 0 && gw.log.filter((e) => e.event === "genchi_miss").length === 2,
   "外れ 2 回の あと「アカ」(カタカナ) で 開く (全角ローマ字の ＡＫＡ は 外れ)");


// ==== 2026-11-15 P0-3 第 1 段: 場面の 見出しと 背景の 写真 ==========================
/** 通しの 中の 場面の 頭 (読み上げ用の 見出し行) を 拾い、その 直後の 画面を 見る */
const sceneChecks = (r) => {
  const kids = r.byId.talk.children;
  const at = (idx) => r.snaps.find((x) => x.n > idx);          // ★その 行が 足された 直後の 画面
  const heads = kids.map((c, i) => [c, i]).filter(([c]) => hasC(c, "midashi-sr"));
  const bad = [];
  heads.forEach(([c, i]) => {
    const s = at(i);
    if (!s) return bad.push(i + ": 画面の 記録なし");
    if (s.mid !== c.dataset.head) bad.push(i + ": 見出し「" + s.mid + "」≠「" + c.dataset.head + "」");
    if (!!s.bg !== (c.dataset.shown === "1")) bad.push(i + ": 背景 " + (s.bg ? "あり" : "なし") + " / 場面の 写真 " + (c.dataset.shown ? "あり" : "なし"));
    if (s.bg && s.lab !== c.dataset.label) bad.push(i + ": 隅書き「" + s.lab + "」≠「" + c.dataset.label + "」");
  });
  return { heads, bad };
};
/** 区切り (場面の 頭 / 写真の 差し替え / オチの 断り / 席の 頭 (めくり)) の あいだで 見出しと 背景が 替わらないか */
const steadyChecks = (r) => {
  const kids = r.byId.talk.children;
  const idx = (f) => kids.map((c, i) => [c, i]).filter(([c]) => f(c)).map(([, i]) => i);
  const cuts = [idx((c) => hasC(c, "midashi-sr")), idx((c) => hasC(c, "shashin-sr")),
                idx((c) => c.textContent === "さて、ここからがオチでございます。"),
                idx((c) => hasC(c, "ma") && !hasC(c, "ma-s"))];   // ★サゲ前の 空白 (予告を 言わない 席 = yokoku:false でも 写真を 下げる 瞬間)
  const groups = {};
  // ★2026-11-15: 写真は 場面の 見出し行より 先に 入る (読んでいた 文字を 残した まま 一拍)。★一拍の 始まりも 区切り
  // ★同日 (0.8 秒の フェード): 写真が 消え始める 瞬間も 区切り (消え終わるまで 文字を 止め、その あと 見出しを 替える)
  let beats = 0, wasHit = false, outs = 0, wasBg = "";
  r.snaps.forEach((x) => {
    if (x.hit && !wasHit) beats += 1;
    wasHit = x.hit;
    if (wasBg && !x.bg) outs += 1;
    wasBg = x.bg;
    const key = cuts.map((a) => a.filter((i) => i < x.n).length).join("/") + "/" + beats + "/" + outs + "/" + x.mek;
    const g = groups[key] || (groups[key] = { bg: new Set(), mid: new Set() });
    g.bg.add(x.bg); g.mid.add(x.mid);
  });
  return Object.keys(groups).filter((k) => groups[k].bg.size > 1 || groups[k].mid.size > 1);
};
const runs15 = [std, allSeats, k2, rv, nn].filter((r) => !r.err);
const hc = runs15.map(sceneChecks);
const nHeads = hc.reduce((a, x) => a + x.heads.length, 0);
const badHeads = hc.flatMap((x) => x.bad);
ok(nHeads >= 20 && !badHeads.length,
   "場面の 頭で 見出しと 背景が その 場面の ものに 替わる (" + nHeads + " 場面" + (badHeads.length ? " → " + badHeads.slice(0, 5).join(" / ") : "") + ")");
const unsteady = runs15.flatMap(steadyChecks);
ok(!unsteady.length, "場面の 中では 見出しと 背景が 替わらない (替わった 区間 " + unsteady.length + (unsteady.length ? ": " + unsteady.slice(0, 3).join(", ") : "") + ")");
// ★見出しが まだ 空の 場面は 演目名を 出す
const emptyHead = allSeats.err ? [] : allSeats.byId.talk.children.filter((c) => hasC(c, "midashi-sr"));
ok(emptyHead.length && emptyHead.every((c) => c.dataset.head && c.dataset.head.trim()),
   "見出しが 空の 場面では 演目名を 出す (空の 見出し " + emptyHead.filter((c) => !c.dataset.head).length + ")");

// ★サゲの 時点で 背景の 写真は 無い (紙の 地で 出す)
const atAdd = (r, f) => r.byId.talk.children.map((c, i) => [c, i]).filter(([c]) => f(c)).map(([, i]) => r.snaps.find((x) => x.n > i) || {});
const sageSnaps = runs15.flatMap((r) => atAdd(r, (c) => hasC(c, "sage")));
ok(sageSnaps.length >= 5 && sageSnaps.every((x) => x.bg === ""),
   "サゲは 背景の 写真を 下げてから 出す (" + sageSnaps.length + " 席 / 写真の 上 " + sageSnaps.filter((x) => x.bg).length + ")");
ok(sageSnaps.every((x) => !x.zu), "サゲの 時点で 図の 固定も 外れている");

// ★読み上げ用の 見出し行は 場面の 頭に 1 つ (= 台本の 場面の 数)
if (seats) {
  const kids = allSeats.byId.talk.children;
  const mk = kids.map((c, i) => [c, i]).filter(([c]) => hasC(c, "makura")).map(([, i]) => i);
  const perSeat = allSeats.told.map((id, n) => ({
    id, st: allSeats.all.find((x) => x.id === id),
    heads: kids.slice(mk[n], n + 1 < mk.length ? mk[n + 1] : kids.length).filter((c) => hasC(c, "midashi-sr")),
  }));
  const badN = perSeat.filter((x) => x.st && Array.isArray(x.st.scenes) && x.heads.length !== x.st.scenes.length);
  const autoN = perSeat.filter((x) => x.st && !Array.isArray(x.st.scenes) && (x.heads.length < 1 || x.heads.length > 3));
  ok(perSeat.length >= 20 && !badN.length && !autoN.length,
     "読み上げ用の 見出し行は 場面ごとに 1 つ (" + perSeat.length + " 席" +
     (badN.length || autoN.length ? " → 合わない: " + badN.concat(autoN).slice(0, 5).map((x) => x.id + " " + x.heads.length).join(", ") : "") + ")");
  ok(perSeat.every((x) => x.heads.every((h, j) => Number(h.dataset.scene) === j)), "見出し行は 場面の 順に 1 つずつ (0, 1, 2 …)");
}
ok(/id="midashi"[^>]*aria-hidden="true"/.test(html), "画面上の 見出しは aria-hidden (読み上げは 語りの 中の 見出し行で 1 回だけ)");

// ★写真を 一拍 見せる (0.8 秒) のは ★写真の ある 場面の 頭だけ
const beatChecks = (r) => {
  const kids = r.byId.talk.children;
  let on = 0, bad = 0, prev = false;
  r.snaps.forEach((x) => {
    if (x.hit && !prev) {
      on += 1;
      // ★2026-11-15: 一拍の あとに 来る 最初の 見出し行が 写真の ある 場面 (間に 来て よいのは 扇子と 読み上げ行だけ)
      let k = x.n;
      while (kids[k] && (hasC(kids[k], "sensu") || (hasC(kids[k], "sr") && !hasC(kids[k], "midashi-sr")))) k += 1;
      const nx = kids[k];
      if (!nx || !hasC(nx, "midashi-sr") || nx.dataset.shown !== "1") bad += 1;
      // ★畳みは 見出し行が 入った ときに 起きる = 一拍の あと (上の 順番の 検査で 担保)
    }
    prev = x.hit;
  });
  const want = kids.filter((c) => hasC(c, "midashi-sr") && c.dataset.shown === "1").length;
  return { on, bad, want };
};
const bc = runs15.map(beatChecks);
const bOn = bc.reduce((a, x) => a + x.on, 0), bWant = bc.reduce((a, x) => a + x.want, 0), bBad = bc.reduce((a, x) => a + x.bad, 0);
ok(bOn >= 5 && bOn === bWant && !bBad,
   "一拍の 間は 写真の ある 場面の 頭だけ (一拍 " + bOn + " 回 / 写真の ある 場面 " + bWant + " / 場違い " + bBad + ")");
const noPhotoHeads = runs15.flatMap((r) => r.byId.talk.children.filter((c) => hasC(c, "midashi-sr") && c.dataset.shown !== "1")).length;
ok(noPhotoHeads >= 1, "写真の 無い 場面 (紙の 地 + 見出しだけ) も 通った (" + noPhotoHeads + " 場面。ここでは 一拍を 置かない)");

// ★動きを 待たずに 文字を 出す: 打ち出しは 動きと 別の タイマー (幕を 開けた その場で 1 字目)
ok((std.firstText || "").length >= 1, "幕を 開けた その場で 1 字目が 出ている (動きを 待たない: 「" + (std.firstText || "") + "」)");

// ★図の 場面 (fig: "main") と 長い 場面の 2 枚目 (img2)。★まだ 台本に 無い 形なので 試しに 書き換えて 通す
const patchS10 = (H) => {
  const s = H.stories.find((x) => x.id === "S10");
  s.scenes = [{ head: "試しの見出し一", from: 0, to: 3, img: "tsutsuji", img2: "koyo" },
              { head: "試しの見出し二", from: 4, to: 7, fig: "main" }];
};
const pf = runPass(0, "2026-09-23", "", "", false, ["この福井から", "思う"], { patch: patchS10 });
const pfOk = !pf.err && pf.told[0] === "S10";
ok(pfOk, "図の 場面・img2 の 試し (S10) が 通る [" + (pf.err ? pf.err.message : pf.told.join(" → ")) + "]");
if (pfOk) {
  const kids = pf.byId.talk.children;
  const heads = kids.filter((c) => hasC(c, "midashi-sr"));
  const iH1 = kids.indexOf(heads[0]), iH2 = kids.indexOf(heads[1]);
  const s2 = pf.snaps.find((x) => x.n > iH2) || {};
  ok(heads.length === 2 && s2.zu === true && s2.bg === "" && s2.mid === "試しの見出し二",
     "図の 場面: 図を 上に 固定し、背景の 写真は 出さない (図 " + s2.zu + " / 背景 " + (s2.bg ? "あり" : "なし") + " / 見出し " + s2.mid + ")");
  const sest = pf.all.find((x) => x.id === "S10");
  const figInTalk = kids.filter((c) => hasC(c, "figure")).length;
  ok(figInTalk === 0, "図の 場面の 図は 語りの 中に 重ねて 出さない (語りの 中の 図 " + figInTalk + ")");
  const sw2 = kids.map((c, i) => [c, i]).filter(([c, i]) => hasC(c, "shashin-sr") && i > iH1 && i < iH2);
  // ★img2 は 場面 (0〜3 行) の 真ん中 = 2 行目 (0 始まり) の 前。★差し替えの 直前に 語った 行は 本題の 1 行目
  const iSw = sw2.length ? sw2[0][1] : -1;
  const before = iSw > 0 ? kids.slice(0, iSw).filter((c) => !hasC(c, "sr") && !hasC(c, "ma") && !hasC(c, "sensu")).pop() : null;
  const h1 = sest.hondai[1];
  const h1t = typeof h1 === "string" ? h1 : h1.who + "「" + h1.text + "」";
  ok(sw2.length === 1 && before && before.textContent === h1t,
     "img2 は 場面の 真ん中の 行の 前で 1 回 差し替える (差し替え " + sw2.length + " 回 / 直前の 行「" +
     (before ? before.textContent.slice(0, 16) : "") + "」/ " + (sw2[0] ? sw2[0][0].dataset.label : "") + ")");
  const swSnap = iSw >= 0 ? pf.snaps.find((x) => x.n > iSw) : null;
  ok(swSnap && !swSnap.hit && swSnap.bg, "img2 の 差し替えでは 一拍を 置かない (背景は 替わる)");
  ok(beatChecks(pf).on === 1, "この 席の 一拍は 写真の ある 場面の 頭の 1 回だけ (" + beatChecks(pf).on + ")");
}

// ==== 2026-11-15 P1-3 噺家の 道具 (扇子・手拭い・羽織・仕草) =========================
const runs13 = runs15.concat(pfOk ? [pf] : []);
/** 席ごとに 語りの 子を 切る (まくら から 次の 席の まくら まで)。★席と まくらが 合わなければ null */
const seatKids = (r) => {
  const kids = r.byId.talk.children;
  const mk = kids.map((c, i) => [c, i]).filter(([c]) => hasC(c, "makura")).map(([, i]) => i);
  if (mk.length !== r.told.length) return null;
  return r.told.map((id, n) => ({ id, kids: kids.slice(mk[n], n + 1 < mk.length ? mk[n + 1] : kids.length) }));
};

// ---- 扇子 = 場面の 区切り: 各席で (場面数 − 1) 本 / 席の 頭と 終わりには 無い / 読み上げに 出さない
{
  let seatsN = 0, sensuN = 0, oneScene = 0;
  const bad = [];
  runs13.forEach((r) => {
    const kids = r.byId.talk.children;
    const firstMk = kids.findIndex((c) => hasC(c, "makura"));
    if (kids.slice(0, firstMk).some((c) => hasC(c, "sensu"))) bad.push("前段に 扇子");
    (seatKids(r) || []).forEach((x) => {
      seatsN += 1;
      const heads = x.kids.filter((c) => hasC(c, "midashi-sr"));
      const ss = x.kids.map((c, i) => [c, i]).filter(([c]) => hasC(c, "sensu"));
      sensuN += ss.length;
      if (heads.length === 1) oneScene += 1;
      if (ss.length !== heads.length - 1) bad.push(x.id + " 扇子 " + ss.length + " / 場面 " + heads.length);
      ss.forEach(([c, i]) => {
        const nx = x.kids[i + 1];
        // ★扇子の 直後は 2 場面目 以降の 見出し行 = 席の 頭 (1 場面目の 前) には 出ない
        if (!nx || !hasC(nx, "midashi-sr") || !(Number(nx.dataset.scene) >= 1)) bad.push(x.id + " 扇子の 後が 2 場面目 以降の 頭で ない");
        if (c.getAttribute("aria-hidden") !== "true") bad.push(x.id + " 扇子に aria-hidden が 無い");
        if (!/<svg[\s\S]*<\/svg>/.test(c.innerHTML)) bad.push(x.id + " 扇子が 埋め込み SVG で ない");
      });
      // ★席の 終わり (最後の 場面の 頭より 後) には 出ない
      const lastHead = x.kids.lastIndexOf(heads[heads.length - 1]);
      if (ss.some(([, i]) => i > lastHead)) bad.push(x.id + " 最後の 場面の 後に 扇子");
      const h0 = x.kids.indexOf(heads[0]);
      if (h0 > 0 && hasC(x.kids[h0 - 1], "sensu")) bad.push(x.id + " 1 場面目の 頭に 扇子");
    });
  });
  ok(seatsN >= 20 && sensuN >= 20 && !bad.length,
     "扇子の 区切りは 各席 (場面数 − 1) 本・席の 頭と 終わりに 無い・aria-hidden (" + seatsN + " 席 / 扇子 " + sensuN +
     " 本 / 1 場面の 席 " + oneScene + (bad.length ? " → " + bad.slice(0, 5).join(" / ") : "") + ")");
  // ★いまの 場面の 扇子は 畳まない (場面の あいだ 見えている)。前の 場面の 扇子は 畳む
  const foldBad = [];
  runs13.forEach((r) => {
    const kids = r.byId.talk.children;
    const lastHead = kids.map((c, i) => [c, i]).filter(([c]) => hasC(c, "midashi-sr")).pop();
    kids.forEach((c, i) => {
      if (!hasC(c, "sensu")) return;
      const cur = lastHead && i === lastHead[1] - 1;
      if (cur === hasC(c, "tatami")) foldBad.push(i + (cur ? " いまの 場面なのに 畳んだ" : " 前の 場面なのに 畳んで いない"));
    });
  });
  ok(!foldBad.length, "いまの 場面の 扇子は 畳まず、前の 場面の 扇子は 畳む (" + (foldBad.length ? foldBad.slice(0, 3).join(" / ") : "崩れ 0") + ")");
}

// ---- 羽織を 脱ぐ: 1 席に 1 回 / 進行が「本題」に 替わる 瞬間 / 次の 席の 頭で 戻す / 演目名の めくりは 席の 頭
{
  let seatsN = 0, onN = 0;
  const bad = [];
  runs13.forEach((r) => {
    let on = 0, off = 0;
    r.snaps.forEach((s, k) => {
      const p = r.snaps[k - 1];
      // ★羽織を 脱いだ 地 ⇔ 進行が 本題 以降 (本題 = now / サゲ 以降 = done)
      if (s.haori !== (s.stg1 === "now" || s.stg1 === "done")) bad.push(r.told[0] + " " + k + ": 羽織 " + s.haori + " / 本題 " + (s.stg1 || "まだ"));
      if (!p) return;
      if (s.haori && !p.haori) {
        on += 1;
        if (!(s.stg1 === "now" && p.stg1 !== "now")) bad.push(k + ": 脱いだ 瞬間に 本題に 替わって いない");
        if (s.mek !== p.mek) bad.push(k + ": 脱いだ 瞬間に 演目名の めくりが 替わった (めくりは 席の 頭)");
      }
      if (!s.haori && p.haori) {
        off += 1;
        if (s.mek === p.mek && s.stg1 !== "") bad.push(k + ": 席の 頭で ない ところで 戻った");
      }
      if (s.mek !== p.mek && s.haori) bad.push(k + ": 演目名が 替わった (席の 頭) のに 羽織を 脱いだ まま");
    });
    seatsN += r.told.length; onN += on;
    if (on !== r.told.length) bad.push(r.told.join(">").slice(0, 30) + ": 脱いだ 回数 " + on + " / 席 " + r.told.length);
    if (off !== Math.max(0, r.told.length - 1)) bad.push("戻した 回数 " + off + " / 席 " + r.told.length + " − 1");
  });
  ok(seatsN >= 20 && !bad.length,
     "羽織の 切り替えは 1 席に 1 回・本題に 替わる 瞬間・次の 席の 頭で 戻す・めくりは 席の 頭 (" + seatsN + " 席 / 切り替え " + onN + " 回" +
     (bad.length ? " → " + bad.slice(0, 4).join(" / ") : "") + ")");
}

// ---- 仕草: 話し手が 替わった 台詞だけ 寄せる / 同じ 話し手が 続けば 寄せない / 動きを 減らす 設定では 付けない
{
  let serN = 0, shiN = 0, sameN = 0;
  const bad = [];
  runs13.forEach((r) => (seatKids(r) || []).forEach((x) => {
    let prev = null;                              // ★席の 頭で 忘れる
    x.kids.filter((c) => hasC(c, "serifu") && !hasC(c, "aizuchi")).forEach((c) => {   // ★相槌は 台詞の 仕草の 外
      const who = c.textContent.split("「")[0];
      const want = who !== prev;
      serN += 1;
      if (want) shiN += 1; else sameN += 1;
      if (hasC(c, "shigusa") !== want) bad.push(x.id + " 「" + c.textContent.slice(0, 10) + "」 前 " + prev + " → " + who + (want ? " 寄せて いない" : " 寄せた"));
      prev = who;
    });
  }));
  ok(serN >= 30 && shiN >= 10 && sameN >= 1 && !bad.length,
     "仕草の クラスは 話し手が 替わった 台詞だけ (台詞 " + serN + " / 替わった " + shiN + " / 同じ 話し手が 続いた " + sameN +
     (bad.length ? " → " + bad.slice(0, 3).join(" / ") : "") + ")");
  const rd = runPass(0, "2026-07-15", "", "", false, ["ふつう", "言わずにおく", "いや、どうだか"], { until: "(種切れまで)", reduce: true });
  const rdSer = rd.err ? [] : rd.byId.talk.children.filter((c) => hasC(c, "serifu"));
  ok(!rd.err && rdSer.length >= 30 && !rdSer.some((c) => hasC(c, "shigusa")),
     "動きを 減らす 設定では 仕草を 付けない (台詞 " + rdSer.length + " / 仕草 " + rdSer.filter((c) => hasC(c, "shigusa")).length + ")" + (rd.err ? " → " + rd.err.message : ""));
  // ★減らす 設定でも 噺の 流れ (扇子・羽織) は 変わらない (動きを 止める だけ)
  ok(!rd.err && rd.told.length === allSeats.told.length, "動きを 減らす 設定でも 同じ 席数を 通る (" + rd.told.length + " / " + allSeats.told.length + ")");
}

// ---- style.css を 読む (★見た目は ブラウザで しか 分からない。ここでは 値の 決めごとだけ 見る)
const cssText = fs.readFileSync(path.join(ROOT, "app", "style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const cssRules = [...cssText.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  sels: m[1].trim().split(",").map((x) => x.trim().replace(/\s+/g, " ")),
  decls: m[2].split(";").map((d) => d.split(/:(.*)/s).map((x) => (x || "").trim())).filter((d) => d[0] && d[1] !== ""),
}));
const declOf = (sel, prop) => {
  let v = null;
  cssRules.forEach((r) => { if (r.sels.indexOf(sel) >= 0) r.decls.forEach(([p, x]) => { if (p === prop) v = x; }); });
  return v;
};
const lum = (hex) => {
  const h = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ---- 手拭い: タネ明かしの 本文の 文字色・大きさ・地の 色は 今までどおり / 柄は 縁の 帯 (::before/::after) だけ
{
  const bad = [];
  // ★本文に 当たる 選択子 (.sources / .sources li / .sources a / .sources blockquote。★疑似要素は 除く)
  const TEXT = /(^|\s|\.|>)(\.sources|#sources)(\s+[a-z]+)?$/;
  const LOOK = ["color", "background", "background-color", "background-image", "font-size", "font-family", "font-weight", "opacity"];
  const WANT = { ".sources": { "font-size": "0.9rem", "font-family": "var(--sans)", "background": "var(--paper)" },
                 ".sources blockquote": { "color": "var(--muted)" } };
  const seenSel = {};
  cssRules.forEach((r) => r.sels.forEach((s) => {
    if (!TEXT.test(s) || /::?(before|after)/.test(s)) return;
    r.decls.forEach(([p, v]) => {
      if (LOOK.indexOf(p) < 0) return;
      const w = (WANT[s] || {})[p];
      seenSel[s + " " + p] = v;
      if (w !== v) bad.push(s + " { " + p + ": " + v + " } (" + (w ? "今まで " + w : "今まで 指定なし") + ")");
    });
  }));
  Object.keys(WANT).forEach((s) => Object.keys(WANT[s]).forEach((p) => { if (!(s + " " + p in seenSel)) bad.push(s + " の " + p + " が 無い"); }));
  // ★地は 紙の 色を 明示 = 高座の 地 (var(--paper)) と 同じ。羽織を 脱いだ 地に 引きずられない
  if (declOf(".koza", "background") !== "var(--paper)") bad.push(".koza の 地が var(--paper) で ない");
  // ★柄 (gradient) を 持つ 規則は 縁の 帯 (.sources::before / ::after) だけ。★本文の 選択子には 無い
  const pat = cssRules.filter((r) => r.decls.some(([p, v]) => /background/.test(p) && /radial-gradient/.test(v)));
  const patSel = [].concat(...pat.map((r) => r.sels));
  if (!pat.length) bad.push("豆絞りの 柄 (radial-gradient) が 無い");
  patSel.forEach((s) => { if (!/^\.sources::(before|after)$/.test(s)) bad.push("柄が 縁 以外に ある: " + s); });
  // ★帯は 縁に 置く (上 = top:0 / 下 = bottom:0)、高さは 本文に かからない (上下の 余白 以下)
  const bandH = parseFloat(declOf(".sources::before", "height") || "0");
  const pad = (declOf(".sources", "padding") || "").split(/\s+/).map(parseFloat);
  const padT = pad[0] || 0, padB = pad.length > 2 ? pad[2] : padT;
  if (declOf(".sources::before", "position") !== "absolute") bad.push("帯が absolute で ない");
  if (declOf(".sources::before", "top") !== "0" || declOf(".sources::after", "bottom") !== "0") bad.push("帯が 上下の 縁に ない");
  if (!(bandH > 0 && bandH + 1 <= padT && bandH + 1 <= padB)) bad.push("帯 " + bandH + "px (+ 線 1px) が 余白 上 " + padT + " / 下 " + padB + " に 収まらない");
  ok(!bad.length, "タネ明かしの 本文の 文字色・大きさ・地の 色は 変えず、豆絞りの 柄は 縁の 帯だけ (帯 " + bandH + "px / 余白 " + padT + "・" + padB + "px" +
     (bad.length ? " → " + bad.slice(0, 4).join(" / ") : "") + ")");
  // ★DOM の 側でも 柄の 要素を 本文に 足して いない (タネ明かしの 中身は 出典の 一覧 1 つ)
  const srcKids = std.err ? [] : std.byId.sources.children;
  ok(srcKids.length === 1 && srcKids[0].tagName === "UL", "タネ明かしの 中身は 出典の 一覧だけ (柄の 要素を 足して いない: " + srcKids.map((c) => c.tagName).join(",") + ")");
}

// ---- 羽織: ★見える 差 (前は 高座の 地 1.09:1 で、しかも 背景の 写真の 下) / 色の 層は opacity で 出す
//   ★2026-11-15 (見直し): 写真より 上の 層 = 見出しの 帯 で 出す。まくらの 間は 濃い 層、本題で 消える
{
  const PAPER = "#f6f0e3";
  const tone = (declOf(".kozahead::before", "background") || "").trim();
  const isHex = /^#[0-9a-f]{6}$/i.test(tone);
  const diff = isHex ? ratio(tone, PAPER) : 0;
  ok(isHex && diff >= 3, "羽織の 帯 " + tone + " と 紙の 地の 差 " + diff.toFixed(2) + ":1 (3 以上 = 見える 差。前は 1.09)");
  const onTxt = (declOf(".midashi", "color") || "").trim();
  const offTxt = (declOf(".koza.haori-nugi .midashi", "color") || "").trim().replace("var(--ink)", "#1d1a16");
  const rOn = isHex && /^#[0-9a-f]{6}$/i.test(onTxt) ? ratio(onTxt, tone) : 0;
  const rOff = /^#[0-9a-f]{6}$/i.test(offTxt) ? ratio(offTxt, PAPER) : 0;
  ok(rOn >= 4.5 && rOff >= 4.5, "見出しの 字: 羽織の 帯の 上 " + rOn.toFixed(2) + " / 脱いだ あと (紙) " + rOff.toFixed(2) + " (4.5 以上)");
  const tr = declOf(".kozahead::before", "transition") || "";
  const t = parseFloat((tr.match(/([\d.]+)s/) || [])[1]);
  ok(/^opacity\s/.test(tr) && t >= 0.15 && t <= 0.3 && declOf(".koza.haori-nugi .kozahead::before", "opacity") === "0" && declOf(".kozahead::before", "opacity") === "1",
     "羽織の 切り替えは 濃い 層の opacity だけ・0.15〜0.3 秒 (" + tr + ")");
  // ★写真の 層 (.haikei = z-index:-1) より 上の 帯で 出す (★前は 写真の 下の 層だった)
  const zHead = Number(declOf(".kozahead", "z-index")), zBg = Number(declOf(".haikei", "z-index"));
  ok(declOf(".kozahead", "position") === "sticky" && zHead > zBg && declOf(".koza::before", "background") === null,
     "羽織は 背景の 写真より 上の 見出しの 帯で 出す (帯 z " + zHead + " / 写真 z " + zBg + ")");
}

// ---- 背景の 写真: 横長の まま 全体を 見せる (cover で 切らない) / 隅書きは タップを 奪わない (2026-11-15 見直し)
{
  const fit = declOf(".haikei img", "object-fit"), h = declOf(".haikei img", "height"), pos = declOf(".haikei img", "object-position") || "";
  // ★2026-11-15 (見直しの 声「背景が おかしい」): 層は 高座の 中だけ (absolute・紙色に 塗らない = 幕を 覆わない)。
  //   ★中の 枠を sticky で 画面の 高さに 置き、写真は 枠の 中で 全体を 見せる (contain)
  // ★2026-11-16: 写真は 下に 寄せる (隅書きの 1 行の すぐ 上)。高さは 枠から 足元と 隅書きを 引いた 分
  ok(fit === "contain" && /^calc\(100% - var\(--footh/.test(h || "") && /bottom/.test(pos) && declOf(".haikei img", "width") === "100%",
     "背景の 写真は 切らずに 全体を 見せる (object-fit " + fit + " / height " + h + " / " + pos + ")");
  ok(declOf(".haikei", "position") === "absolute" && !declOf(".haikei", "background") && declOf(".haikei-in", "position") === "sticky",
     "背景の 層は 高座の 中だけ (absolute・塗らない) / 写真の 枠は sticky (" + declOf(".haikei", "position") + " / " + declOf(".haikei-in", "position") + ")");
  ok(!/marginTop/.test(appSrc), "写真の 位置を スクロールで 変わる 値から 決めない (marginTop を 使わない)");
  // ★客の 喋りは 右寄せ。★行の 下の 帯の 規則は :where で 詳細度を 上げない (前は 右寄せに 勝って 客が 左に 寄った。2026-11-15)
  ok(declOf(".talk .line.serifu.kyaku2", "margin-left") === "auto" && declOf(".talk .line.serifu.kyaku2", "text-align") === "right"
     && /\.talk \.line:where\(/.test(cssText),
     "客の 喋りは 右寄せ (行の 帯の 規則は :where で 弱く)");
  ok(!/blur|backdrop/.test(cssText), "ぼかし (blur / backdrop-filter) を 使って いない");
  ok(declOf(".haikei-cap", "pointer-events") === "none", "写真の 隅書きは pointer-events: none (下の 選択肢の タップを 奪わない)");
}

// ---- 文字の 読みやすさ (2026-11-15 見直し): ★帯の 外の 字が 4.5:1 以上
{
  const V = { "var(--muted)": "#6d6256", "var(--ink)": "#1d1a16", "var(--paper)": "#f6f0e3" };
  const hex = (v) => { const x = V[(v || "").trim()] || (v || "").trim(); return /^#[0-9a-f]{3}$/i.test(x) ? "#" + x.slice(1).split("").map((c) => c + c).join("") : x; };
  const isH = (x) => /^#[0-9a-f]{6}$/i.test(x);
  const rows = [
    ["あて推量の ラベル", hex(declOf(".line.suiryo::before", "color")), hex(declOf(".line.suiryo", "background"))],
    ["畳んだ 語りを 開いた とき", hex(declOf(".talk.open .tatami", "color")), "#f6f0e3"],
    ["進行の めくり (まだ)", hex(declOf(".shinko", "color")), hex(declOf(".shinko li", "background"))],
    ["進行の めくり (済んだ)", hex(declOf(".shinko li.done", "color")), "#f6f0e3"],
    ["進行の めくり (いま)", hex(declOf(".shinko li.now", "color")), "#b8322a"],
    ["図の 注", hex(declOf(".fign", "fill")), "#ffffff"],
  ];
  const bad = rows.filter(([, a, b]) => !(isH(a) && isH(b) && ratio(a, b) >= 4.5));
  ok(!bad.length, "帯の 外の 字は 4.5:1 以上 (" + rows.map(([n, a, b]) => n + " " + (isH(a) && isH(b) ? ratio(a, b).toFixed(2) : "?")).join(" / ") + ")");
  ok(declOf(".talk.open .tatami", "opacity") === null, "畳んだ 語りを 開いた ときに 薄く (opacity) しない");
  ok(/✓/.test(declOf(".shinko li.done::before", "content") || "") && declOf(".shinko li.now", "font-weight") === "bold",
     "進行の めくりの いまの 段を 色だけで 示さない (済んだ 段に ✓ / いまの 段は 太字)");
  ok(declOf(".footbar", "flex-wrap") === "wrap" && declOf(".footbar .link", "white-space") === "nowrap" && declOf(".footbar .link", "min-height") === "44px",
     "足元の ボタンは 語の 途中で 折れず (nowrap + wrap)、高さ 44px");
  ok(declOf(".midashi", "white-space") !== "nowrap" && declOf(".midashi", "text-overflow") === null, "見出しは 拡大しても 省略で 切らない (折り返す)");
}

// ---- 読み上げ (2026-11-15 見直し)
{
  const kids = std.err ? [] : std.byId.talk.children;
  const lines = kids.filter((c) => hasC(c, "line") && !hasC(c, "kyaku") && !hasC(c, "aizuchi"));   // ★相槌は 打ち出さない (そのまま 読ませる)
  const yomi = kids.filter((c) => hasC(c, "sr") && hasC(c, "yomi"));
  const hiddenOk = lines.length >= 10 && lines.every((c) => c.getAttribute("aria-hidden") === "true");
  // ★打ち出す 行の 直前に ★全文の 読み上げ用の 行が 1 つ (〈〉 の 印は 外す)
  const pairBad = lines.filter((c) => { const i = kids.indexOf(c); const sr = kids[i - 1];
    return !sr || !hasC(sr, "yomi") || sr.textContent !== c.textContent.replace(/[〈〉]/g, ""); }).length;
  ok(hiddenOk && yomi.length === lines.length && pairBad === 0,
     "一字ずつ 打つ 行は 読み上げから 外し (aria-hidden)、全文の 読み上げ用の 行を 1 つずつ 先に 置く (行 " + lines.length + " / 読み上げ用 " + yomi.length + " / 合わない " + pairBad + ")");
  const sentaku = kids.filter((c) => hasC(c, "sentaku-sr"));
  ok(sentaku.length >= 4 && sentaku.every((c) => /^（選べます：|^（.*打ち込めます|^（次へ で 続きます）/.test(c.textContent)),   // ★2026-11-15「次へ」も
     "選択肢が 出たことを 読み上げに 1 行で 渡す (" + sentaku.length + " 回: " + (sentaku[0] ? sentaku[0].textContent : "") + ")");
  ok(/id="choices"[^>]*role="group"/.test(html), "選択肢の 箱は role=group");
  ok(/id="ba"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html) && /id="kin"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html),
     "場・全国の園の パネルは dialog (aria-modal)");
  ok(/function focusKoza\(\)[\s\S]{0,120}setAttribute\("tabindex", "-1"\)/.test(appSrc) && !/id="koza"[^>]*tabindex/.test(html),
     "高座は その時だけ フォーカスの 受け皿 (tabindex=-1 を 付けて 移し、離れたら 外す。常には 付けない)");
  // ★札まで 進むと 3 段とも 済み (いまの 段 無し)。★いまの 段 (now) ⇔ aria-current=step が 揃って いるか を 見る (途中は test_motion)
  const stg = std.err ? [] : ["stg0", "stg1", "stg2"].map((i) => std.byId[i]);
  ok(stg.length === 3 && stg.every((e) => e.getAttribute("aria-current") !== null && (e.className === "now") === (e.getAttribute("aria-current") === "step")),
     "進行の めくりの いまの 段 ⇔ aria-current=step (" + stg.map((e) => e.className + ":" + e.getAttribute("aria-current")).join(" ") + ")");
}

// ---- オチの 予告: 台本に "yokoku": false の 席は 予告の 一行を 言わず、写真・図を 下げて サゲへ (2026-11-15)
{
  const patchYk = (H) => { const s = H.stories.find((x) => x.id === "S10"); s.yokoku = false; };
  const yk = runPass(0, "2026-09-23", "", "", false, ["この福井から", "思う"], { patch: patchYk });
  const yOk = !yk.err && yk.told[0] === "S10";
  const kids = yOk ? yk.byId.talk.children : [];
  const iSage = kids.findIndex((c) => hasC(c, "sage"));
  const firstSeat = iSage >= 0 ? kids.slice(0, iSage) : [];
  const sageSnap = iSage >= 0 ? yk.snaps.find((x) => x.n > iSage) || {} : {};
  // ★サゲの 直前は 読み上げ用の 行 (sr yomi)、その 前が サゲ前の 空白 (ma)
  ok(yOk && iSage > 1 && !firstSeat.some((c) => /ここからがオチ/.test(c.textContent)) && hasC(kids[iSage - 2], "ma") && sageSnap.bg === "" && !sageSnap.zu,
     "yokoku:false の 席は 予告の 一行を 言わず、空白の あと 写真を 下げて サゲ (" + (yOk ? "S10" : (yk.err ? yk.err.message : yk.told.join(">"))) + " / 写真 " + (sageSnap.bg ? "あり" : "なし") + ")");
  // ★印の 無い 席 (既定) は 今までどおり 言う
  const kids0 = std.err ? [] : std.byId.talk.children;
  ok(kids0.some((c) => hasC(c, "yokoku") && /ここからがオチ/.test(c.textContent)), "yokoku の 印が 無い 席は 今までどおり 予告を 言う");
}

// ---- 仕草の 動き: 客は 右から・私は 左から、4〜6px、0.15〜0.3 秒、一度きり
{
  const bad = [];
  [[".line.serifu.kyaku2.shigusa", 1], [".line.serifu.watashi.shigusa", -1]].forEach(([sel, sign]) => {
    const a = declOf(sel, "animation") || "";
    const m = a.match(/^([\w-]+)\s+([\d.]+)s/);
    if (!m) return bad.push(sel + " に 動きが 無い");
    const t = parseFloat(m[2]);
    if (!(t >= 0.15 && t <= 0.3)) bad.push(sel + " " + t + " 秒");
    if (/infinite/.test(a)) bad.push(sel + " が 繰り返す");
    const kf = cssText.match(new RegExp("@keyframes\\s+" + m[1] + "\\s*\\{\\s*from\\s*\\{([^}]*)\\}"));
    const px = kf && kf[1].match(/translateX\((-?[\d.]+)px\)/);
    const d = px ? parseFloat(px[1]) : NaN;
    if (!(Math.abs(d) >= 4 && Math.abs(d) <= 6 && Math.sign(d) === sign)) bad.push(sel + " の 寄り " + d + "px (" + (sign > 0 ? "右" : "左") + "から 4〜6px)");
    if (kf && !/opacity\s*:\s*0/.test(kf[1])) bad.push(sel + " が opacity で 出て いない");
  });
  ok(!bad.length, "仕草の 動きは 客が 右から・私が 左から 4〜6px、0.15〜0.3 秒、一度きり" + (bad.length ? " → " + bad.join(" / ") : ""));
}

// ★「命日」(T-1128) が 90 秒の 枠に 収まるかの 目安 (★合否に しない。★人が 押す 時間は 入らない)
const meinichi = runPass(0, "2026-11-28", "", "", false, ["いや、べつに", "県外から", "関東", "埼玉県", "思う"], { marks: true });   // ★実演の 筋 (2026-11-20 から 埼玉県)
if (!meinichi.err && meinichi.told[0] === "T-1128" && meinichi.marks.furi != null && meinichi.marks.card != null) {
  const m = meinichi.marks;
  const sec = (m.card - m.furi) / 1000;
  const beats = meinichi.snaps.filter((x, i, a) => x.hit && !(a[i - 1] || {}).hit && x.clock >= m.furi && x.clock <= m.card).length;
  console.log("  情報 「命日」(T-1128) 振りから 札まで 待ち時間の 合計 " + sec.toFixed(1) + " 秒 (うち 写真の 一拍 " +
              beats + " 回 × 0.8 = " + (beats * 0.8).toFixed(1) + " 秒 / 問いに 答える 時間は 含まない) [" + meinichi.told.join(" → ") + "]");
  ok(true, "「命日」の 目安を 出した (" + sec.toFixed(1) + " 秒)");
} else {
  ok(false, "「命日」の 目安を 出せなかった [" + (meinichi.err ? meinichi.err.message : meinichi.told.join(" → ")) + "]");
}

// ---- 県ごとの つなぎ (prefBridge。2026-11-15 作者の判断「噺に つなげる つなぎを 都道府県別で」) ----
//   ★はじめから で 県を 答えた 人に、★県を 伺った 直後 (県の 返しの 後・思い込みの 問いの 前) に その県の lines を 地の文で 順に 言う。
//   ★2026-11-15: 前は 一席目の 頭 (思い込みの 答えと 噺の 入りの 間) で、入り「その○○の話から」の 受ける 相手が 遠かった。
//   ★最後の 文「では、…ひとつ。」は 言わない (後ろに「噺の前に、ひとつ。」が 続く)。その行の 前半は 残す
//   ★県を 言わない 人・園の 入口には 出さない。★再訪「はい、また」でも 一席目の 前に 1 回だけ。
//   ★facts は 一席目の タネ明かしに 足す。★bundle に まだ 無くても 落ちない。
//   ★台本 (bundle) は 触らず、試験の 中で 差し込む。★HANASHI_APP = 別の app.js (直す 前の 版で NG を 見る)
{
  const MH = require("./motion_harness");
  const APPX = (process.env.HANASHI_APP || process.env.HANASHI_APP_ALL) ? fs.readFileSync(process.env.HANASHI_APP || process.env.HANASHI_APP_ALL, "utf8") : null;
  const PB = (w) => { w.HANASHI.prefBridge = {};
    w.HANASHI.prefectures.forEach((p) => { w.HANASHI.prefBridge[p] = { lines: ["試しの" + p + "の つなぎ 一。", "試しの" + p + "の つなぎ 二。では、試しの お客さんに、ひとつ。"], facts: ["F83"] }; }); };
  const F83 = JSON.parse(fs.readFileSync(path.join(ROOT, "app", "data", "facts.json"), "utf8"));
  const f83src = ((F83.facts || F83).find((f) => f.id === "F83") || {}).source;
  function go(opt, plan, N) {
    const a = MH.makeApp(Object.assign({ date: "2026-11-15", seed: 1, patch: PB }, APPX ? { srcPatch: () => APPX } : {}, opt));
    a.click("open");
    const srcs = [];
    let seen = 0;
    for (let k = 0; k < 400; k++) {
      a.settle();
      if (!a.byId.sageBox.hidden && a.shown().length > seen) {     // ★札が 出た 席の タネ明かし
        seen = a.shown().length;
        const ul = a.byId.sources.children[0];
        srcs.push(ul ? ul.children.map((li) => (li.children[0] || {}).textContent || "") : []);
      }
      if (a.shown().length >= N && !a.byId.sageBox.hidden) break;
      const ls = a.labels();
      if (!ls.length) { if (!a.byId.sageBox.hidden) { a.click("again"); continue; } break; }
      if (ls.length === 1 && ls[0] === "次へ") { a.pick(0); continue; }
      if (ls.includes("(form)")) { a.submit(""); continue; }
      const i = plan.length ? ls.indexOf(plan[0]) : -1;
      if (i >= 0) { plan.shift(); a.pick(i); continue; }
      if (ls.includes("お願いします")) { a.pick("お願いします"); continue; }
      if (ls.includes("ふつう")) { a.pick("ふつう"); continue; }
      a.pick(0);
    }
    const els = a.talkEls().filter((c) => !/(^| )sr( |$)/.test(c.className || ""));
    return { a, els, txt: els.map((c) => String(c.textContent)), srcs, errors: a.errors.length + (a.bootErr ? 1 : 0) };
  }
  const cnt = (r, w) => r.txt.filter((t) => t.indexOf(w) >= 0).length;
  // ① はじめから・茨城県
  const r1 = go({}, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], 2);
  const i1 = r1.txt.indexOf("試しの茨城県の つなぎ 一。"), i2 = r1.txt.indexOf("試しの茨城県の つなぎ 二。");
  const iPref = r1.txt.lastIndexOf("茨城県"), iToi = r1.txt.findIndex((t) => /^噺の前に、ひとつ。/.test(t));
  const iFuri = r1.els.findIndex((c) => /(^| )(furi|makura)( |$)/.test(c.className || ""));
  ok(!r1.errors && i1 > iPref && i2 === i1 + 1 && iToi > i2 && i2 < iFuri,
     "県の つなぎ: 県を 伺った 直後・思い込みの 問いの 前に 順に 言う (県 " + iPref + " / つなぎ " + i1 + "," + i2 + " / 問い " + iToi + " / 振り " + iFuri + ")");
  ok(cnt(r1, "試しの お客さんに、ひとつ。") === 0, "県の つなぎの 最後の「では、…ひとつ。」は 言わない (前半は 残す)");
  ok(cnt(r1, "の つなぎ 一。") === 1 && cnt(r1, "の つなぎ 二。") === 1, "県の つなぎは 二席目の 前には 言わない (1 回だけ)");
  // ★再訪「別のところから」: 言い直した 県の つなぎを 1 回。★思い込みは 伺わない (二つの 約束)
  const r7 = go({ store: { "hanashiyama.pref.v1": "茨城県" } }, ["いや、べつに", "別のところから", "県外から", "近畿", "京都府"], 1);
  const k1 = r7.txt.indexOf("試しの京都府の つなぎ 一。");
  const kFuri = r7.els.findIndex((c) => /(^| )(furi|makura)( |$)/.test(c.className || ""));
  ok(!r7.errors && cnt(r7, "試しの京都府の つなぎ 一。") === 1 && cnt(r7, "試しの茨城県") === 0 && k1 >= 0 && k1 < kFuri &&
     !r7.txt.some((t) => /^噺の前に、ひとつ。/.test(t)), "再訪「別のところから」: 言い直した 県の つなぎを 振りの 前に 1 回・思い込みは 伺わない");
  ok(/(^| )shi( |$)/.test((r1.els[i1] || {}).className || ""), "県の つなぎは 噺家の 地の文 (shi)");
  ok(r1.srcs.length >= 2 && r1.srcs[0].includes(f83src) && !r1.srcs[1].includes(f83src),
     "県の つなぎの facts は 一席目の タネ明かしに 入り、二席目には 入らない (" + r1.srcs.map((x) => x.length).join(",") + " 件)");
  // ② 県を 言わない / 園の 入口 には 出さない
  const r2 = go({}, ["いや、べつに", "言わずにおく", "思う"], 1);
  ok(!r2.errors && r2.a.shown().length >= 1 && cnt(r2, "の つなぎ") === 0, "県を 言わない 人には 県の つなぎを 出さない");
  const kinS2 = fs.readFileSync(path.join(ROOT, "app", "data", "kin.js"), "utf8");
  const slug2 = [...kinS2.matchAll(/"slug":\s*"([^"]+)"/g)][3][1];
  const r3 = go({ search: "?kin=" + slug2 + "&date=2026-11-15" }, ["いや、べつに", "思う"], 2);
  ok(!r3.errors && r3.a.shown().length >= 2 && cnt(r3, "の つなぎ") === 0, "園の 入口から 来た 人には 県の つなぎを 出さない (" + slug2 + ")");
  // ③ 再訪「はい、また」でも 一席目の 前に 1 回だけ
  const r4 = go({ store: { "hanashiyama.pref.v1": "茨城県" } }, ["いや、べつに", "はい、また"], 2);
  const j1 = r4.txt.indexOf("試しの茨城県の つなぎ 一。");
  const jFuri = r4.els.findIndex((c) => /(^| )(furi|makura)( |$)/.test(c.className || ""));
  ok(!r4.errors && cnt(r4, "の つなぎ 一。") === 1 && j1 >= 0 && j1 < jFuri, "再訪「はい、また」でも 一席目の 前に 1 回だけ");
  // ④ prefBridge が 無い / 形が 違う ときは 何も 言わず 落ちない
  const r5 = go({ patch: null }, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], 1);
  ok(!r5.errors && r5.a.shown().length >= 1, "prefBridge が bundle に 無くても 落ちない");
  const r6 = go({ patch: (w) => { w.HANASHI.prefBridge = { "茨城県": { lines: "壊れた形" } }; } }, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], 1);
  ok(!r6.errors && r6.a.shown().length >= 1 && cnt(r6, "壊れた形") === 0, "prefBridge の 形が 違っても 何も 言わず 落ちない");
}

// ---- 席の つなぎ目 (2026-11-15。選び方が ランダムに なって 入りの 一言が 前後と かみ合わない 所が 出た) ----
//   ★本物の 台本で 種を 変えて 回し、席の 入りの 前後を 見る。★HANASHI_APP = 直す 前の app.js で NG を 見る
{
  const MH = require("./motion_harness");
  const APPX = (process.env.HANASHI_APP || process.env.HANASHI_APP_ALL) ? fs.readFileSync(process.env.HANASHI_APP || process.env.HANASHI_APP_ALL, "utf8") : null;
  function run(opt, plan, N, onLabels) {
    const a = MH.makeApp(Object.assign({ date: "2026-11-15", seed: 1 }, APPX ? { srcPatch: () => APPX } : {}, opt));
    a.click("open");
    for (let k = 0; k < 600; k++) {
      a.settle();
      if (a.shown().length >= N && !a.byId.sageBox.hidden) break;
      const ls = a.labels();
      if (onLabels && onLabels(a, ls)) continue;
      if (!ls.length) { if (!a.byId.sageBox.hidden) { a.click("again"); continue; } break; }
      if (ls.length === 1 && ls[0] === "次へ") { a.pick(0); continue; }
      if (ls.includes("(form)")) { a.submit(""); continue; }
      const i = plan.length ? ls.indexOf(plan[0]) : -1;
      if (i >= 0) { plan.shift(); a.pick(i); continue; }
      if (ls.includes("お願いします")) { a.pick("お願いします"); continue; }
      if (ls.includes("ふつう")) { a.pick("ふつう"); continue; }
      a.pick(0);
    }
    const els = a.talkEls().filter((c) => !/(^| )(sr|ma|sensu)( |$)/.test(c.className || ""));
    const L = els.map((c) => ({ cls: c.className || "", t: String(c._html ? c._html.replace(/<[^>]+>/g, "") : c.textContent) }));
    return { a, L, errors: a.errors.length + (a.bootErr ? 1 : 0) };
  }
  const hasC = (x, k) => new RegExp("(^| )" + k + "( |$)").test(x.cls);
  /** 席の 入り (振りの 前の 行) の 位置 */
  const bridges = (L) => L.map((x, i) => (hasC(x, "makura") ? i : -1)).filter((i) => i >= 0)
    .map((m) => (hasC(L[m - 1], "furi") ? m - 2 : m - 1));
  const runs = [];
  const PL = [["茨城県", "関東"], ["東京都", "関東"], ["新潟県", "中部"], ["北海道", "北海道・東北"], ["京都府", "近畿"], ["山口県", "中国・四国"]];
  PL.forEach(([p, blk], k) => [1, 2].forEach((sd) => {
    const ans = (k + sd) % 2 ? "思う" : "いや、どうだか";
    runs.push(Object.assign(run({ seed: sd * 7 + k }, ["いや、べつに", "県外から", blk, p, ans], 4), { p, ans }));
  }));
  runs.push(Object.assign(run({ seed: 5 }, ["いや、べつに", "この福井から", "思う"], 4), { p: "福井県", ans: "思う" }));
  ok(runs.every((r) => !r.errors && r.a.shown().length >= 4), "つなぎ目の 試験: " + runs.length + " 回 × 4 席を 例外 無く 回せる");
  // (a)「その」で 始まる 入りは 直前 4 行に 客の 答えが ある ときだけ
  const sono = [], sonoAll = [];
  runs.forEach((r) => bridges(r.L).forEach((b) => {
    if (!/^(では、)?その/.test(r.L[b].t)) return;
    sonoAll.push(r.L[b].t);
    if (!r.L.slice(Math.max(0, b - 4), b).some((x) => hasC(x, "kyaku"))) sono.push(r.p + ": " + r.L[b].t);
  }));
  ok(!sono.length, "「その」で 始まる 入りの 直前に 客の 答えが 無い 所 0 (「その」の 入り " + sonoAll.length + " 所) " + sono.slice(0, 2).join(" / "));
  // (b)「では」「ひとつ。」が 続かない
  const dd = [], hh = [];
  runs.forEach((r) => bridges(r.L).forEach((b) => {
    for (let j = Math.max(1, b - 3); j <= b; j++) {
      const a0 = r.L[j - 1].t, a1 = r.L[j].t;
      if (/^では、/.test(a1) && /(^|。)では、[^。]*。$/.test(a0)) dd.push(r.p + ": " + a0.slice(-16) + " / " + a1);
      if (/ひとつ。$/.test(a0) && /ひとつ。$/.test(a1)) hh.push(r.p + ": " + a0.slice(-16) + " / " + a1);
    }
  }));
  ok(!dd.length, "席の 入りで「では、…」が 二つ 続かない " + dd.slice(0, 2).join(" | "));
  ok(!hh.length, "席の 入りで「…ひとつ。」が 二つ 続かない " + hh.slice(0, 2).join(" | "));
  // (c) 県の噺の 挨拶 (○○からでございますか) を 県の つなぎの 後に 二度 言わない
  const twice = runs.filter((r) => r.L.some((x) => x.t.indexOf(r.p + "からでございますか") >= 0 || /^お膝元でございますか。福井県立/.test(x.t)));
  const pSeat = runs.filter((r) => r.a.shown().indexOf("P-" + r.p) >= 0).length;
  ok(pSeat > 0 && !twice.length, "県の噺の 席 (" + pSeat + " 回) で 県の 挨拶を 二度 言わない " + twice.map((r) => r.p).join(","));
  // (d)「在庫切れ」の 問いは 1 回の 中で 最初の 1 度だけ。★「また来る」を 選んだら 次も 問う
  const z = [1, 2, 3, 4, 5, 6].map((sd) => run({ seed: sd }, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], 9));   // ★見繕いが 2 度 以上 起きる 筋を 作る (2026-11-15 二席目の 交互で 減った)
  const zc = z.map((r) => r.L.filter((x) => /在庫切れ/.test(x.t)).length);
  const anyN = z.map((r) => r.a.log().filter((e) => e.event === "shown" && e.by === "any").length);
  ok(zc.every((n) => n <= 1) && anyN.some((n) => n >= 2), "「在庫切れ」の 問いは 1 回に 1 度 (見繕い " + anyN.join(",") + " 席 / 問い " + zc.join(",") + " 度)");
  // ★2026-11-21: 「もう一席」を 押した あとは「お願いします / また来る」で もう一度 頼ませない (三席目を 頼むと 席より 先に 問いが 出ていた)
  const askAfter = z.filter((r) => r.L.some((x, i) => /在庫切れ/.test(x.t) && r.L.slice(i + 1, i + 4).some((y) => /^(お願いします|また来る)$/.test(y.t))));
  ok(!askAfter.length && zc.some((n) => n === 1), "「もう一席」の あとの 在庫切れは 問わずに 見繕う (問うた 回 " + askAfter.length + " / 断った 回 " + zc.filter((n) => n).length + ")");
  // (e) 実演の 筋 (11/28・埼玉県・思う): 一席目 T-1128・二席目 P-埼玉県。二席目の 入りは 挨拶の 二度目に しない
  //   ★2026-11-20 作者の判断: 実演の 二席目は P-埼玉県 (飼育記録 = オープンデータを 使う)。★種 1 だけで なく 1〜50 で 崩れない こと (見直し)
  const SEEDS = Array.from({ length: 50 }, (_, k) => k + 1);
  const demoBad = [];
  let demo1 = null;
  SEEDS.forEach((sd) => {
    const sh = run({ date: "2026-11-28", search: "?date=2026-11-28", seed: sd }, ["いや、べつに", "県外から", "関東", "埼玉県", "思う"], 2);
    const sb = bridges(sh.L);
    const good = !sh.errors && sh.a.shown().slice(0, 2).join(">") === "T-1128>P-埼玉県" && sb.length >= 2 &&
      sh.L[sb[0]].t === "では、今日という日の話を。" && sh.L[sb[1]].t.indexOf("からでございますか") < 0;
    if (!good) demoBad.push(sd + ":" + sh.a.shown().slice(0, 2).join(">"));
    if (sd === 1) demo1 = sb[1] != null ? sh.L[sb[1]].t : "?";
  });
  ok(!demoBad.length, "実演の 筋: 種 1〜50 の すべてで T-1128 > P-埼玉県・二席目の 入りは 挨拶の 二度目に しない (崩れ " + demoBad.length + ") " +
     demoBad.slice(0, 3).join(" ") + " / 種 1 の 二席目の 入り「" + demo1 + "」");
}

// ---- 見直し (2026-11-20) の 直し ----------------------------------------------------
//   ★見直しで 画面の 台詞が 前後で 通じない 所を 拾った。★直した 点ごとに 1 つ 以上の 試験。
//   ★HANASHI_APP_ALL (または HANASHI_APP) に 直す 前の app.js を 渡すと、ここの 試験が NG に なる (効きを 見る)
{
  const MH = require("./motion_harness");
  const APPY = process.env.HANASHI_APP_ALL || process.env.HANASHI_APP;
  const APPX = APPY ? fs.readFileSync(APPY, "utf8") : null;
  const HTML = fs.readFileSync(process.env.HANASHI_HTML || path.join(ROOT, "app", "index.html"), "utf8");
  // ★本物の 台本 (bundle) を 読む (席の 中身を 見る)
  const BW = {}; new Function("window", "self", bundleSrc)(BW, BW);
  const HB = BW.HANASHI;
  const ALLB = [].concat(HB.stories, HB.prefStories, Object.values(HB.today).reduce((a, x) => a.concat(x), []));
  const byIdB = (id) => ALLB.find((s) => s.id === id);
  const beliefLabel = (lab) => (HB.beliefs.find((b) => b.label === lab) || {}).id || null;
  /**
   * 1 回 通す。@param opt makeApp の 指定 + words (打ち込む 語の 列) / plan = 押す 選択肢の 列 / N = 札まで 見る 席の 数
   * 返り L = [{ k: "say"|"kyaku"|"aizuchi"|"seat"|"ma", cls, t }] (噺家・客の 台詞は 読み上げ用の 全文で 持つ)
   */
  function go2(opt, plan, N) {
    const words = (opt.words || []).slice();
    const a = MH.makeApp(Object.assign({ date: "2026-11-20", seed: 1 }, APPX ? { srcPatch: () => APPX } : {}, opt));
    a.click("open");
    for (let k = 0; k < 600; k++) {
      a.settle();
      if (a.shown().length >= N && !a.byId.sageBox.hidden) break;
      const ls = a.labels();
      if (!ls.length) { if (!a.byId.sageBox.hidden) { a.click("again"); continue; } break; }
      if (ls.includes("(form)")) {
        if (opt.later && ls.length) { const cs = a.choices(); const f = cs.find((c) => c.tagName === "FORM"); const lb = (function find(n) { for (const x of n.children) { if (/いまは よしておく/.test(x.textContent || "") && x.handlers.click) return x; const r = find(x); if (r) return r; } return null; })(f); if (lb) { opt.later = false; lb.click(); continue; } }
        a.submit(words.length ? words.shift() : ""); continue;
      }
      const i = plan.length ? ls.indexOf(plan[0]) : -1;
      if (i >= 0) { plan.shift(); a.pick(i); continue; }
      if (ls.includes("お願いします")) { a.pick("お願いします"); continue; }
      if (ls.includes("ふつう")) { a.pick("ふつう"); continue; }
      a.pick(0);
    }
    const kids = a.talkEls();
    const L = [];
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i], cls = c.className || "";
      if (/(^| )yomi( |$)/.test(cls)) { const nx = kids[i + 1] || {}; L.push({ k: "say", cls: nx.className || "", t: String(c.textContent) }); i += 1; continue; }
      if (/(^| )seat-start( |$)/.test(cls)) { L.push({ k: "seat", cls, t: "" }); continue; }
      if (/(^| )aizuchi( |$)/.test(cls)) { L.push({ k: "aizuchi", cls, t: String(c.textContent) }); continue; }
      if (/(^| )line kyaku( |$)/.test(cls) || cls === "line kyaku") { L.push({ k: "kyaku", cls, t: String(c.textContent) }); continue; }
      if (/(^| )ma( |$)/.test(cls)) { L.push({ k: "ma", cls, t: "" }); continue; }
    }
    return { a, L, txt: L.map((x) => x.t), shown: a.shown(), errors: a.errors.length + (a.bootErr ? 1 : 0), store: a.store };
  }
  const has = (r, w) => r.txt.some((t) => (w instanceof RegExp ? w.test(t) : t.indexOf(w) >= 0));
  const SAI = ["いや、べつに", "県外から", "関東", "埼玉県"];

  // #1 暦の 席 (isToday) は 当日 だけ。★「もうすぐ」「お手がかりから 外れますが」で 別の 日に 出さない
  {
    const cases = [
      [{ seed: 5, words: ["つつじ"] }, ["ふつう", "県外から", "関東", "東京都", "ほかに言いたいことがある"]],
      [{ seed: 13, words: ["パンダ"] }, ["ふつう", "県外から", "中部", "静岡県", "ほかに言いたいことがある"]],
      [{ seed: 10, words: ["雪"] }, ["ふつう", "この福井から", "ほかに言いたいことがある"]],
      [{ seed: 2, words: ["歴史"] }, ["ふつう", "言わずにおく", "ほかに言いたいことがある"]],
      [{ seed: 3, date: "2026-11-21", search: "?date=2026-11-21" }, ["ふつう", "言わずにおく", "思う"]],
      [{ seed: 4, date: "2026-11-27", search: "?date=2026-11-27" }, ["ふつう", "県外から", "北海道・東北", "宮城県", "思う"]],
      [{ seed: 6, date: "2026-07-05", search: "?date=2026-07-05" }, ["ふつう", "県外から", "北海道・東北", "青森県", "思う"]],
    ];
    const bad = [];
    let n = 0;
    cases.forEach(([o, plan]) => [0, 1].forEach((dd) => {
      const r = go2(Object.assign({}, o, { seed: o.seed + dd * 100 }), plan.slice(), 3);
      n += 1;
      const md = (o.date || "2026-11-20").slice(5);
      const off = r.shown.map(byIdB).filter((s) => s && s.isToday && s.md !== md).map((s) => s.id);
      if (r.errors || off.length || has(r, "もうすぐでございますが") || has(r, "外れますが") || has(r, "明日でございますが")) bad.push((o.words || [o.date])[0] + ":" + r.shown.join(">"));
    }));
    ok(!bad.length, "#1 暦の 席は 当日 だけ (別の 日に 出た 回 " + bad.length + " / " + n + ") " + bad.slice(0, 3).join(" / "));
    const d28 = go2({ date: "2026-11-28", search: "?date=2026-11-28", seed: 1 }, SAI.concat(["思う"]), 1);
    ok(d28.shown[0] === "T-1128", "  対照: 当日 (11/28) は 暦の 席 T-1128 が 出る (" + d28.shown[0] + ")");
  }

  // #5 園の 入口: 送りの 2 行は 一席目が その園 (か その県の 園) の 噺 だった ときだけ。送った あとに 断りを 重ねない
  {
    const KINS = ["tennoji", "asahikawa", "kushiro", "nagano", "okinawa", "tobu", "china"];
    const bad = [];
    let sent = 0, n = 0;
    KINS.forEach((kin) => [12, 14, 1].forEach((sd) => ["思う", "いや、どうだか"].forEach((ans) => {
      const r = go2({ seed: sd, search: "?kin=" + kin + "&date=2026-11-20" }, ["いや、べつに", ans], 2);
      n += 1;
      const i = r.txt.findIndex((t) => /の話は ここまでで。$/.test(t));
      if (i < 0) return;
      sent += 1;
      const first = byIdB(r.shown[0]);
      const ftxt = first ? [first.bridge, first.furi, first.makura, (first.hondai || []).map((h) => (typeof h === "string" ? h : h.text)).join(""), first.sage].join("") : "";
      const zooName = r.txt[i].replace(/^さて、/, "").replace(/の話は ここまでで。$/, "");
      const okFirst = ftxt.indexOf(zooName) >= 0 || ftxt.indexOf(zooName.replace(/^[^市区町村]{1,6}[市区町村]立?/, "")) >= 0 || /の園$/.test(zooName);
      const after = r.txt.slice(i + 1, i + 4).join(" ");
      if (!okFirst || /持ち合わせ|趣を変えて|お出しいたしました|前に お聞き/.test(after)) bad.push(kin + sd + ans + ":" + r.shown.join(">") + " / " + r.txt[i]);
    })));
    ok(sent > 0 && !bad.length, "#5 園の 送り「○○の話は ここまで」は 一席目が その園・その県の 園の 噺の ときだけ・直後に 断りなし (送った 回 " + sent + " / " + n + ") " + bad.slice(0, 2).join(" | "));
    const tn = go2({ seed: 14, search: "?kin=tennoji&date=2026-11-20" }, ["いや、べつに", "いや、どうだか"], 2);
    ok(!has(tn, "天王寺動物園の話は ここまで"), "  天王寺 (一席目 " + tn.shown[0] + " = 園と 関係ない 噺) で「天王寺動物園の話は ここまで」と 言わない");
  }

  // #33 ?kin=china:「中国から お越し」(地方の 名と 読める) と 言わない
  {
    const r = go2({ seed: 1, search: "?kin=china&date=2026-11-20" }, ["いや、べつに", "思う"], 1);
    ok(!has(r, "中国から お越し") && has(r, "中国の動物園から お越し"), "#33 ?kin=china は「中国の動物園から お越しでございますか」");
  }

  // #6 あて推量 (guess) は ★サゲの あと・追い足しの 前 (2026-11-21 作者の判断。★問いの 前でも サゲの 直前でも ない)
  {
    const runs = [go2({ date: "2026-11-28", search: "?date=2026-11-28", seed: 1 }, SAI.concat(["思う"]), 2)];
    [177, 3, 8].forEach((sd) => runs.push(go2({ seed: sd }, ["いや、べつに", "県外から", "関東", "群馬県", "思う"], 3)));
    let seen = 0; const bad = [];
    runs.forEach((r) => r.shown.forEach((id) => {
      const st = byIdB(id);
      if (!st || !st.guess || !st.question) return;
      const iG = r.txt.indexOf(st.guess), iQ = r.txt.indexOf(st.question.text), iS = r.txt.findIndex((t) => t.indexOf(st.sage) === 0);
      const iA = st.atogaki ? r.txt.indexOf(st.atogaki) : -1;
      if (iG < 0 || iQ < 0 || iS < 0) return;
      seen += 1;
      if (!(iG > iQ && iG > iS && (iA < 0 || iG < iA))) bad.push(id + " (問い " + iQ + " / サゲ " + iS + " / 推量 " + iG + " / 追い足し " + iA + ")");
    }));
    ok(seen > 0 && !bad.length, "#6 あて推量は サゲの あと・追い足しの 前 (見た 席 " + seen + ") " + bad.slice(0, 3).join(" "));
  }

  // #7 前段で 問う 思い込みは 台本の furiBelief (無い 席は hooks.beliefs の 先頭)
  {
    const FB = "b_night_nothing";
    const lab = (HB.beliefs.find((b) => b.id === FB) || {}).label;
    const patch = (w) => [].concat(w.HANASHI.stories, w.HANASHI.prefStories, Object.values(w.HANASHI.today).reduce((x, y) => x.concat(y), []))
      .forEach((s) => { if (((s.hooks || {}).beliefs || []).length) s.furiBelief = FB; });
    const rs = [1, 2, 3].map((sd) => go2({ seed: sd, patch }, ["いや、べつに", "県外から", "関東", "東京都", "思う"], 1));
    ok(!!lab && rs.every((r) => has(r, "噺の前に、ひとつ。\n「" + lab + "」")), "#7 前段の 問いは 台本の furiBelief を 問う (「" + lab + "」)");
    const r0 = go2({ seed: 1 }, ["いや、べつに", "県外から", "関東", "東京都", "思う"], 1);
    const st0 = byIdB(r0.shown[0]);
    const lab0 = st0 && (HB.beliefs.find((b) => b.id === (st0.furiBelief || st0.hooks.beliefs[0])) || {}).label;
    ok(!lab0 || has(r0, "噺の前に、ひとつ。\n「" + lab0 + "」"), "  furiBelief の 無い 席は これまでどおり 先頭の 思い込み (" + (st0 && st0.id) + ")");
  }

  // #9「言わずにおく」の 人の 県を 打ち込みの 語から 決めつけない (県の つなぎ・次回の「また○○から」に 使わない)
  {
    const r = go2({ seed: 3, words: ["旭山動物園"] }, ["ふつう", "言わずにおく", "ほかに言いたいことがある"], 1);
    const pb = (HB.prefBridge["北海道"] || { lines: [] }).lines;
    const said = pb.filter((l) => has(r, l.slice(0, 12)));
    ok(!r.errors && r.shown.length >= 1 && !r.store["hanashiyama.pref.v1"] && !said.length && !has(r, /^(北海道のお客さんに、|北海道からでございますか)/),
       "#9 打ち込み「旭山動物園」で 県を 決めつけない (覚えた 県 " + (r.store["hanashiyama.pref.v1"] || "なし") + " / 北海道の つなぎ " + said.length + " 行) [" + r.shown.join(">") + "]");
  }

  // #11 相槌: 客の 台詞・「?」で 終わる 行の 直後に 出さない / 客が 打った (答えた) あとは 読んだ 字を 数え直す
  {
    const runs = [
      go2({ seed: 51, words: ["赤", "足あと", "愛の鐘"], patch: (w) => w.HANASHI.genchi.forEach((g) => { if (["G1", "G2", "G3"].indexOf(g.id) >= 0) g.verified_onsite = "2026-11-20"; }) }, ["いや、べつに", "この福井から", "思う"], 4),
      go2({ seed: 3, words: ["旭山動物園"] }, ["ふつう", "言わずにおく", "ほかに言いたいことがある"], 2),
      go2({ seed: 7 }, ["いや、べつに", "県外から", "近畿", "兵庫県", "思う"], 3),
      go2({ seed: 12, words: ["めがね"] }, ["ふつう", "県外から", "関東", "神奈川県", "ほかに言いたいことがある"], 3),
    ];
    const bad = [];
    let nA = 0;
    runs.forEach((r, ri) => r.L.forEach((x, i) => {
      if (x.k !== "aizuchi") return;
      nA += 1;
      let j = i - 1;
      while (j >= 0 && (r.L[j].k === "ma" || r.L[j].k === "seat")) j -= 1;
      const prev = r.L[j] || {};
      if (prev.k === "kyaku" || /kyaku2/.test(prev.cls || "") || /[?？]\s*$/.test(prev.t || "")) bad.push(ri + ":直前「" + String(prev.t).slice(-14) + "」");
      // ★客が 最後に 押した・打った ところから 数えて 100 字 未満なら 早すぎる (前の 字数を 引きずっている)
      let ch = 0;
      for (let q = i - 1; q >= 0 && r.L[q].k !== "kyaku"; q--) if (r.L[q].k === "say") ch += r.L[q].t.length;
      if (ch < 100) bad.push(ri + ":客の あと " + ch + " 字で 相槌");
    }));
    ok(nA > 0 && !bad.length, "#11 相槌は 客の 台詞・問いの 直後や 打ち込みの すぐ あとに 出さない (相槌 " + nA + " 回) " + bad.slice(0, 3).join(" / "));
  }

  // #12 「持ち合わせが ございません」を 手がかりの 席が ある 客に 言わない / 同じ 断りは 1 回に 1 度
  {
    const runs = [177, 1, 2, 3, 4].map((sd) => go2({ seed: sd }, ["いや、べつに", "県外から", "関東", "群馬県", "思う"], 3))
      .concat([5, 6].map((sd) => go2({ seed: sd }, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], 4)));
    const NOTES = /持ち合わせ|趣を変えて|お出しいたしました|前に お聞き|またの機会に/;
    const bad = [];
    runs.forEach((r) => {
      if (has(r, "持ち合わせがございません")) bad.push("持ち合わせ:" + r.shown.join(">"));
      const ns = r.txt.filter((t) => NOTES.test(t));
      if (new Set(ns).size !== ns.length) bad.push("二度:" + r.shown.join(">"));
    });
    ok(!bad.length, "#12 県の 噺が ある 客に「持ち合わせが ございません」と 言わない・同じ 断りを 二度 言わない (" + runs.length + " 回) " + bad.slice(0, 2).join(" | "));
  }

  // #13 動物の 噺か = オチが 何の ことか (ochiWhat)。★S51・S50・S19・S34・S41 は 動物、S39・S44 (遊具) は 動物で ない
  {
    const fs2 = APPX || fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8");
    const W2 = {}; new Function("window", fs2)(W2);
    const C2 = W2.HanashiCore;
    const ia = (id) => (C2 && typeof C2.isAnimal === "function" ? C2.isAnimal(byIdB(id)) : null);
    ok(["S51", "S50", "S19", "S34", "S41"].every((id) => ia(id) === true) && ["S39", "S44"].every((id) => ia(id) === false),
       "#13 動物園の 噺 (S51 S50 S19 S34 S41) は 動物・遊具の 噺 (S39 S44) は 動物で ない");
    const ref = (st) => !!st && /動物園|レッサーパンダ/.test(st.ochiWhat || "");
    const runs = [177, 1, 2, 3].map((sd) => go2({ seed: sd }, ["いや、べつに", "県外から", "関東", "群馬県", "思う"], 2));
    const two = runs.filter((r) => r.shown.length >= 2 && ref(byIdB(r.shown[0])) && ref(byIdB(r.shown[1]))).map((r) => r.shown.join(">"));
    ok(!two.length, "  一席目が 動物園の 噺なら 二席目は 動物園の 噺で ない (" + runs.length + " 回) " + two.join(" "));
  }

  // #14 一席目が 県の 推し量った 数 (F21 / F26) を 使う 席なら、県の つなぎの「大半が 地元」「84%」を 言わない
  // #15 再訪の 福井は「どうりで」を 言わない (受ける 返し「手強い 地元の お客さん」が 無い)
  {
    const LOCAL = (st) => !!st && (st.facts || []).some((f) => f === "F21" || f === "F26");
    const runs = [];
    for (let sd = 300; sd < 316; sd++) runs.push(go2({ seed: sd }, ["いや、べつに", "県外から", "近畿", "大阪府", "思う"], 1));
    for (let sd = 300; sd < 306; sd++) runs.push(go2({ seed: sd }, ["いや、べつに", "県外から", "関東", "東京都", "思う"], 1));
    for (let sd = 200; sd < 212; sd++) runs.push(go2({ seed: sd }, ["いや、べつに", "この福井から", "思う"], 1));
    const loc = runs.filter((r) => LOCAL(byIdB(r.shown[0])));
    const bad = loc.filter((r) => has(r, /大半が|84[%％]/)).map((r) => r.shown[0]);
    ok(loc.length > 0 && !bad.length, "#14 一席目が 同じ 数の 席 (" + loc.length + " 回: " + [...new Set(loc.map((r) => r.shown[0]))].join(",") + ") で つなぎの「大半が地元 / 84%」を 言わない " + bad.join(","));
    const again = [22, 1, 2].map((sd) => go2({ seed: sd, store: { "hanashiyama.pref.v1": "福井県" } }, ["行きたい", "はい、また"], 1));
    ok(again.every((r) => !r.errors && !has(r, /^どうりで/)), "#15 再訪の 福井で「どうりで、…」を 言わない");
    // ★はじめての 福井は 一席目が ほぼ S10 (同じ 数の 席 = つなぎの 84% と どうりでを 言わない)。★S10 を 前に 聞いた 端末で 見る
    const heardS10 = { "hanashiyama.log.v1": JSON.stringify([{ event: "shown", story: "S10" }]) };
    const fk2 = [1, 2, 3, 4].map((sd) => go2({ seed: sd, store: heardS10 }, ["いや、べつに", "この福井から", "思う"], 1));
    const fkCtl = fk2.filter((r) => !LOCAL(byIdB(r.shown[1])) && has(r, "手強い") && has(r, /^どうりで/)).length;   // ★shown[0] は 前に 聞いた S10 (記録)
    ok(fkCtl > 0, "  対照: はじめての 福井 (「手強い」の 返しの あと) では「どうりで」を 言う (" + fkCtl + " 回)");
    // ★2026-11-20 取り込み: 県の つなぎで 同じ 数を 言うのは 福井の「大半が」だけに なった (担当 B)。★対照は S10 を 前に 聞いた 福井で 見る
    const ctl = fk2.filter((r) => !LOCAL(byIdB(r.shown[1])) && has(r, /大半が|84[%％]/)).length;
    ok(ctl > 0, "  対照: ほかの 一席目では つなぎの その 行を 言う (" + ctl + " 回)");
  }

  // #16 否定した 思い込みの 席を 二席目 以降も 出さない。暦の 席が 否定した 思い込みなら 振りを 飛ばす
  {
    const bad = [];
    let n = 0;
    for (let sd = 201; sd <= 212; sd++) {
      const r = go2({ seed: sd }, ["いや、べつに", "この福井から", "いや、どうだか"], 3);
      n += 1;
      const qi = r.txt.findIndex((t) => /^噺の前に、ひとつ。\n?「/.test(t));
      const lab = qi >= 0 ? r.txt[qi].replace(/^噺の前に、ひとつ。\n?「/, "").replace(/」[\s\S]*$/, "") : null;
      const bid = lab && beliefLabel(lab);
      const hit = r.shown.map(byIdB).filter((s) => s && !s.isToday && bid && ((s.hooks || {}).beliefs || []).concat(s.furiBelief ? [s.furiBelief] : []).indexOf(bid) >= 0);
      if (hit.length) bad.push(sd + ":" + lab + "→" + hit.map((s) => s.id).join(","));
    }
    ok(!bad.length, "#16 否定した 思い込みの 席を 二席目 以降に 出さない (" + n + " 回) " + bad.slice(0, 3).join(" "));
    const dd = go2({ date: "2026-11-28", search: "?date=2026-11-28", seed: 1 }, SAI.concat(["いや、どうだか"]), 2);
    const t28 = byIdB("T-1128");
    ok(dd.shown.indexOf("T-1128") > 0 && !has(dd, t28.furi), "  11/28 に「幕末の悪役」を 否定 → 二席目の T-1128 は 振りを 飛ばす [" + dd.shown.join(">") + "]");
  }

  // #17 公園に いない 客を レジの 前に 立たせない (県の つなぎ)。★公園に いる 客は そのまま
  {
    const away = go2({ date: "2026-11-28", search: "?date=2026-11-28", seed: 1 }, SAI.concat(["思う"]), 1);
    const here = go2({ date: "2026-11-28", search: "?date=2026-11-28", seed: 1 }, ["いま、公園におります", "県外から", "関東", "埼玉県", "思う"], 1);
    // ★2026-11-20 取り込み: 県の つなぎの 文から「このレジの前まで」が 消えた (担当 B)。★画面ごしの 付け足しは 残す (台本に 戻った とき 用)
    ok(!away.errors && !away.txt.some((t) => /この(?:小さな山の麓のレジ|裏山の麓|レジの前)まで/.test(t) && !/画面ごし/.test(t)),
       "#17 公園に いない 客を レジの 前に 立たせない (県の つなぎ)");
    ok(!here.errors && !has(here, "画面ごし"), "  公園に いる 客には「画面ごし」を 付けない");
  }

  // #20 前段で 問うた 思い込みを 振りで もう一度 問わない (実演の T-1128)
  {
    const r = go2({ date: "2026-11-28", search: "?date=2026-11-28", seed: 1 }, SAI.concat(["思う"]), 1);
    const t28 = byIdB("T-1128");
    ok(r.shown[0] === "T-1128" && !has(r, t28.furi) && r.txt.some((t) => t.replace(/\n/g, "").indexOf(t28.makura) >= 0), "#20 前段で 問うた 席は 振りを 飛ばして まくらから (T-1128)");
  }

  // #22 県の つなぎを 言う 県では お礼を 重ねない / 答えた 県を 聞き直さない
  {
    const ish = go2({ seed: 1 }, ["いや、べつに", "県外から", "中部", "石川県", "思う"], 1);
    const kan = go2({ seed: 1 }, ["いや、べつに", "県外から", "関東", "神奈川県", "思う"], 1);
    // ★2026-11-21 取り込み: つなぎの 1 行目は「千枚田の、あのお国のお客さんで。」(県名を 言わない = 担当 B)。★前段の「さようで、石川県から。」が 県を 受け、つなぎは 県名を 重ねない
    const pb1 = HB.prefBridge && HB.prefBridge["石川県"] ? HB.prefBridge["石川県"].lines[0] : "";
    ok(!ish.errors && ish.shown.length >= 1 && !has(ish, "遠いところを") && (/石川県/.test(pb1) ? !has(ish, "さようで、石川県から") : has(ish, "さようで、石川県から")) && (pb1 ? has(ish, pb1) : true),
       "#22 石川県: 「遠いところを」の お礼を 重ねない・県名は 前段か つなぎの どちらか 一度");
    ok(!has(kan, "遠いところを") && !kan.txt.some((t) => /神奈川県からでございますか/.test(t)), "  神奈川県: 答えた 県を 聞き直さない");
  }

  // #24「次のお客さんの話を」の 直後に「○○のお客さんに」と 話しかけない / #25 二席目は「さきほどは、「…」で」
  {
    const runs = [1, 2, 3].map((sd) => go2({ date: "2026-11-28", search: "?date=2026-11-28", seed: sd }, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], 2))
      .concat([1, 2].map((sd) => go2({ seed: sd }, ["いや、べつに", "県外から", "関東", "東京都", "思う"], 3)));
    const bad = [];
    runs.forEach((r) => r.txt.forEach((t, i) => {
      if (t.indexOf("次のお客さんの話を") >= 0 && r.txt.slice(i + 1, i + 3).some((u) => u.indexOf("お客さんに") >= 0)) bad.push(r.shown.join(">"));
    }));
    const pIb = runs.filter((r) => r.shown[1] === "P-茨城県").length;
    ok(pIb > 0 && !bad.length, "#24「次のお客さんの話を」の 直後に「○○のお客さんに」を 続けない (二席目 P-茨城県 " + pIb + " 回) " + bad.slice(0, 2).join(" "));
    const r2 = runs[0];
    ok(!has(r2, "はじめに、お気持ちを伺いました") && has(r2, /^さきほどは、「/), "#25 二席目の 前置きは「さきほどは、「…」でございました」");
  }

  // #27 現地の 謎かけの 前置きで「二席目」と 呼ばない (家の「もう一席」と 重なる)
  {
    const r = go2({ seed: 1, later: true, patch: (w) => w.HANASHI.genchi.forEach((g) => { if (g.id === "G1") g.verified_onsite = "2026-11-20"; }) }, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], 2);
    ok(has(r, "西山公園に置いてまいりました") && !has(r, "二席目"), "#27 現地の 謎かけは「現地でだけ聞ける一席」と 呼ぶ (「二席目」と 言わない)");
  }

  // #4 (画面の 側の 直し) 差し替えの 謎かけ (alt_of) が 元と 同じ 席なら 出さない (★G2b = 眼鏡の ベンチで 足あとの ベンチの 噺 S56 が 始まっていた)
  {
    const vf = (ids) => (w) => w.HANASHI.genchi.forEach((g) => { if (ids.indexOf(g.id) >= 0) g.verified_onsite = "2026-11-20"; });
    const r = go2({ seed: 54, words: ["赤", "めがね", "愛の鐘"], patch: vf(["G1", "G2b", "G3"]) }, ["いや、べつに", "県外から", "関東", "東京都", "思う"], 3);
    const g2b = (HB.genchi || []).find((g) => g.id === "G2b") || {};
    const g2 = (HB.genchi || []).find((g) => g.id === "G2") || {};
    const same = g2b.story && g2b.story === g2.story;
    ok(r.shown.indexOf("S55") >= 0 && (!same || r.shown.indexOf(g2b.story) < 0),
       "#4 差し替えの 謎かけ G2b が 元 (G2) と 同じ 席 (" + g2b.story + ") なら 出さない [" + r.shown.join(">") + "]");
  }

  // #35 二席目 以降の「在庫切れ」は 頼まれた ことを 受けてから
  {
    const z = [1, 2, 3, 4, 5, 6].map((sd) => go2({ seed: sd }, ["いや、べつに", "県外から", "関東", "茨城県", "思う"], 9));
    const lines = [];
    z.forEach((r) => r.txt.forEach((t, i) => { if (/在庫切れ/.test(t) && r.txt.slice(0, i).some((u) => /次のお客さんの話を|もう一席。$/.test(u))) lines.push(t); }));
    ok(lines.length > 0 && lines.every((t) => /ありがたい/.test(t)), "#35「もう一席」の あとの 在庫切れは「ありがたいことで。ただ、…」(" + lines.length + " 回)");
  }

  // L2 札の 写真の 出典は 正式な 表示に 近づける (作品名・提供元・ライセンス (URL)・加工の 旨・BY-SA)
  {
    const fs3 = APPX || fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8");
    const W3 = {}; new Function("window", fs3)(W3);
    const C3 = W3.HanashiCore;
    const cc = (c) => (C3 && typeof C3.cardCredit === "function" ? C3.cardCredit(c) : "");
    const fk = cc("福井ふるさと百景「紅葉に映える日本庭園（嚮陽庭園）」、福井県、クリエイティブ・コモンズ・ライセンス 表示4.0 国際（https://creativecommons.org/licenses/by/4.0/deed.ja） / 縮小して使用");
    const sa = cc("Wikimedia Commons「Nishiyama park.JPG」 Jjp 233 (CC BY-SA 4.0) / 縮小して使用");
    ok(/嚮陽庭園/.test(fk) && /福井県/.test(fk) && /CC BY 4\.0/.test(fk) && /creativecommons\.org\/licenses\/by\/4\.0/.test(fk) && /加工/.test(fk),
       "L2 札の 出典: 作品名・福井県・CC BY 4.0 (URL)・加工の 旨 (" + fk.slice(0, 40) + "…)");
    ok(/この札は CC BY-SA 4\.0/.test(sa) && /by-sa\/4\.0/.test(sa), "  継承 (BY-SA) の 写真なら 札も BY-SA と 書く");
    ok(/cardCredit\(img\.credit\)/.test(fs3), "  札の 描画は cardCredit を 使う");
  }

  // H2 / M3 表紙の 言い方 (index.html)
  {
    ok(!/外への通信はありません/.test(HTML) && /同じ場所/.test(HTML) && /ネットが無くても/.test(HTML),
       "M3 表紙は「外への通信はありません」と 言い切らず、同じ場所の ファイルだけ / 手元で 開けば ネットが 無くても、と 言い分ける");
    const li4 = (HTML.match(/<ol class="nagare">([\s\S]*?)<\/ol>/) || ["", ""])[1].split("<li>")[4] || "";
    ok(/確かめ/.test(li4), "H2「はじめての方へ」4 番: 現地の 謎かけは 現地で 確かめた 場所から 出る と 分かる (" + li4.replace(/<[^>]+>/g, "").trim().slice(0, 40) + ")");
  }
}

// ---- 文脈の 見直し 2 回目 (2026-11-21) の 直し ---------------------------------------------
//   ★直した 点ごとに 1 つ 以上の 試験。★HANASHI_APP_ALL (または HANASHI_APP) に 直す 前の app.js を 渡すと、ここの 試験が NG に なる (効きを 見る)
//   ★HANASHI_HTML = 直す 前の index.html (コメントの 言い方の 試験)
{
  const MH = require("./motion_harness");
  const APPY = process.env.HANASHI_APP_ALL || process.env.HANASHI_APP;
  const APPX = APPY ? fs.readFileSync(APPY, "utf8") : null;
  const APPTXT = APPX || fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8");
  const HTML = fs.readFileSync(process.env.HANASHI_HTML || path.join(ROOT, "app", "index.html"), "utf8");
  const BW = {}; new Function("window", "self", bundleSrc)(BW, BW);
  const HB = BW.HANASHI;
  const ALLB = [].concat(HB.stories, HB.prefStories, Object.values(HB.today).reduce((a, x) => a.concat(x), []));
  const byIdB = (id) => ALLB.find((s) => s.id === id);
  const W0 = {}; new Function("window", APPTXT)(W0);
  const C0 = W0.HanashiCore;
  const vf = (ids) => (w) => w.HANASHI.genchi.forEach((g) => { if (ids.indexOf(g.id) >= 0) g.verified_onsite = "2026-11-20"; });
  /**
   * 1 回 通す。opt = makeApp の 指定 + words (打ち込む 語) / ans ("correct" = 4 択は 正解を 押す / "wrong" = 正解で ない 先頭) /
   *   via (幕で 押す ボタン) / end (終わりの 問いで 押す 答え)
   * 返り L = [{ k: "say"|"kyaku"|"aizuchi"|"seat"|"ma"|"fig"|"note", cls, t }]
   */
  function go3(opt, plan, N) {
    const words = (opt.words || []).slice();
    const a = MH.makeApp(Object.assign({ date: "2026-11-20", seed: 1 }, APPX ? { srcPatch: () => APPX } : {}, opt));
    a.click(opt.via || "open");
    const cur = () => {
      const id = a.shown().slice(-1)[0];
      const H2 = a.win.HANASHI;
      return [].concat(H2.stories, H2.prefStories, Object.values(H2.today).reduce((x, y) => x.concat(y), [])).find((x) => x.id === id);
    };
    for (let k = 0; k < 600; k++) {
      a.settle();
      if (a.shown().length >= N && !a.byId.sageBox.hidden) break;
      const ls = a.labels();
      if (!ls.length) { if (!a.byId.sageBox.hidden) { a.click("again"); continue; } break; }
      if (ls.includes("(form)")) { a.submit(words.length ? words.shift() : ""); continue; }
      const i = plan.length ? ls.indexOf(plan[0]) : -1;
      if (i >= 0) { plan.shift(); a.pick(i); continue; }
      const st = cur();
      if (opt.ans && st && st.question && ls.join("|") === st.question.choices.join("|")) {
        const j = opt.ans === "correct" ? st.question.answer : (st.question.answer === 0 ? 1 : 0);
        a.pick(j); continue;
      }
      if (ls.includes("お願いします")) { a.pick("お願いします"); continue; }
      if (opt.end && ls.includes(opt.end)) { a.pick(opt.end); continue; }
      if (ls.includes("ふつう")) { a.pick("ふつう"); continue; }
      a.pick(0);
    }
    const kids = a.talkEls();
    const L = [];
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i], cls = c.className || "";
      if (/(^| )yomi( |$)/.test(cls)) { const nx = kids[i + 1] || {}; L.push({ k: "say", cls: nx.className || "", t: String(c.textContent) }); i += 1; continue; }
      if (/(^| )seat-start( |$)/.test(cls)) { L.push({ k: "seat", cls, t: "" }); continue; }
      if (/(^| )aizuchi( |$)/.test(cls)) { L.push({ k: "aizuchi", cls, t: String(c.textContent) }); continue; }
      if (/(^| )kyaku( |$)/.test(cls)) { L.push({ k: "kyaku", cls, t: String(c.textContent) }); continue; }
      if (/(^| )figure( |$)/.test(cls)) { L.push({ k: "fig", cls, t: "" }); continue; }
      if (/(^| )ochi-what( |$)/.test(cls)) { L.push({ k: "note", cls, t: String(c.textContent) }); continue; }
      if (/(^| )ma( |$)/.test(cls)) { L.push({ k: "ma", cls, t: "" }); continue; }
    }
    return { a, L, txt: L.map((x) => x.t), shown: a.shown(), errors: a.errors.length + (a.bootErr ? 1 : 0) };
  }
  const has = (r, w) => r.txt.some((t) => (w instanceof RegExp ? w.test(t) : t.indexOf(w) >= 0));
  const idx = (r, w, from) => r.txt.findIndex((t, i) => i >= (from || 0) && (w instanceof RegExp ? w.test(t) : t.indexOf(w) >= 0));
  const D28 = { date: "2026-11-28", search: "?date=2026-11-28" };
  const DEMO = ["いや、べつに", "県外から", "関東", "埼玉県", "思う"];

  // R1 (N1・N2・N10) あて推量は サゲの あと (サゲ → 註 → 推量 → 追い足し)。★実演の T-1128 で 推量が ひっくり返しを 先に 言わない
  {
    const runs = [go3(Object.assign({ seed: 1 }, D28), DEMO.slice(), 2)];
    [61, 71, 3].forEach((sd) => runs.push(go3({ seed: sd }, ["ふつう", "言わずにおく", "思う"], 3)));
    [1, 2].forEach((sd) => runs.push(go3({ seed: sd, ans: "correct" }, ["いや、べつに", "県外から", "関東", "東京都", "思う"], 3)));
    let seen = 0; const bad = [];
    runs.forEach((r) => r.shown.forEach((id) => {
      const st = byIdB(id);
      if (!st || !st.guess) return;
      const iS = r.txt.findIndex((t) => t.indexOf(st.sage) === 0), iG = r.txt.map((t) => t.replace("……", "")).indexOf(st.guess);   // ★推量の「……」(表示だけ) は 除いて 比べる
      if (iS < 0 || iG < 0) return;
      seen += 1;
      const iN = r.L.findIndex((x, i) => i > iS && x.k === "note");
      const iA = st.atogaki ? r.txt.indexOf(st.atogaki) : -1;
      if (!(iG > iS && (!st.ochiWhat || (iN > iS && iN < iG)) && (iA < 0 || iG < iA))) bad.push(id + " (サゲ " + iS + " / 註 " + iN + " / 推量 " + iG + " / 追い足し " + iA + ")");
    }));
    ok(seen >= 3 && !bad.length, "R1 あて推量は サゲ → 註 の あと・追い足しの 前 (見た 席 " + seen + ") " + bad.slice(0, 3).join(" "));
    const t28 = byIdB("T-1128"), r28 = runs[0];
    ok(r28.shown[0] === "T-1128" && idx(r28, t28.guess.slice(0, 20)) > idx(r28, t28.sage.slice(0, 12)), "  実演の T-1128: 推量 (国元では人の笑う顔…) は サゲ (自ら鍬を持って…) の あと");
  }

  // R2 (N6) 4 択を 外したら 外れの 返しの あとに 正解を 1 行。★正解なら 言わない。★返しが もう 正解を 言って いれば 重ねない
  {
    const w = go3(Object.assign({ seed: 1 }, D28), DEMO.slice(), 2);       // ★二席目 P-埼玉県 は 先頭 (3園) = 外れ
    const ps = byIdB("P-埼玉県");
    const ans = ps.question.choices[ps.question.answer];
    const iK = w.txt.indexOf(ps.question.choices[0]), iA = idx(w, "答えは、" + ans + "でございます。"), iS = w.txt.findIndex((t) => t.indexOf(ps.sage) === 0);
    ok(w.shown[1] === "P-埼玉県" && ps.question.answer !== 0 && iK >= 0 && iA > iK && iA < iS && !!w.L[iA - 1] && /kotae/.test(w.L[iA - 1].cls),
       "R2 実演の 二席目 (P-埼玉県) で 外すと、返しの すぐ あと・サゲの 前に「答えは、" + ans + "でございます。」(返し " + (iA - 1) + " / 正解 " + iA + " / サゲ " + iS + ")");
    const c = go3(Object.assign({ seed: 1, ans: "correct" }, D28), DEMO.slice(), 2);
    ok(c.shown[1] === "P-埼玉県" && !has(c, /^答えは、.*でございます。$/), "  正解を 押したら 正解の 1 行は 言わない");
    const t28w = go3(Object.assign({ seed: 1, ans: "wrong" }, D28), DEMO.slice(), 1);
    const t28 = byIdB("T-1128"), a28 = t28.question.choices[t28.question.answer];
    ok(t28w.shown[0] === "T-1128" && has(t28w, /^それが、/) && !has(t28w, "答えは、" + a28), "  返しが もう 正解 (" + a28 + ") を 言う 席 (T-1128) では 重ねない");
    const al = (C0 && typeof C0.answerLine === "function") ? C0.answerLine : () => "";
    ok(al({ choices: ["a", "静止画に変わる"], answer: 1 }) === "答えは、「静止画に変わる」でございます。" && al({ choices: ["29園", "3園"], answer: 0 }) === "答えは、29園でございます。",
       "  札が 言い切りの 形 (静止画に変わる) なら「」で 包む・数なら そのまま");
    // ★答え合わせの あとに 出す 図 (when=after) の 席: 返し → 正解 → 図 (★「答えは」を 二度 言わない)
    const figPatch = (w2) => { const s2 = w2.HANASHI.prefStories.find((x) => x.id === "P-埼玉県"); s2.fig = { when: "after", title: "試しの図", unit: "園", items: [{ label: "試し", value: 29 }] }; };
    const f = go3(Object.assign({ seed: 1, patch: figPatch }, D28), DEMO.slice(), 2);
    const iA2 = idx(f, "答えは、" + ans), iF = f.L.findIndex((x, i) => i > iA2 && x.k === "fig"), iS2 = f.txt.findIndex((t) => t.indexOf(ps.sage) === 0);
    ok(iA2 > 0 && iF > iA2 && iF < iS2 && !has(f, "答えは、この一枚で。") && has(f, "数字で並べますと、この一枚で。"),
       "  答え合わせの 図 (when=after) の 席: 返し → 正解の 1 行 → 図 → サゲ。「答えは」を 二度 言わない (正解 " + iA2 + " / 図 " + iF + " / サゲ " + iS2 + ")");
  }

  // R3 (N3) 前も いまも いちばん 上 (行ってみたい) なら「動きませんか。精進いたします。」で 受けない
  {
    const r = go3(Object.assign({ seed: 1, end: "行ってみたい" }, D28), ["行きたい", "県外から", "関東", "埼玉県", "思う"], 3);
    const n5 = r.txt.filter((t) => t === "行ってみたい").length;
    ok(n5 >= 2 && !has(r, "動きませんか") && has(r, "変わらず、行ってみたいと"), "R3「行きたい」→ 終わりも「行ってみたい」(" + n5 + " 回) で「動きませんか」と 言わない");
    const r2 = go3(Object.assign({ seed: 1 }, D28), DEMO.slice(), 3);
    ok(has(r2, "動きませんか。精進いたします。"), "  対照: ふつう → ふつう は これまでどおり「動きませんか。精進いたします。」");
  }

  // R4 (N4) 否定した 思い込みで 外すのは その 席が ひっくり返す 思い込み (furiBelief / 無ければ 先頭) が 一致する 席だけ
  {
    const ph = byIdB("P-北海道");
    const main = ph && (ph.furiBelief || ph.hooks.beliefs[0]);
    const sub = ph && ((ph.hooks || {}).beliefs || []).find((b) => b !== main);
    const count = (den) => {
      let n = 0;
      if (C0) for (let sd = 1; sd <= 30; sd++) {
        const got = C0.choose(HB, { pref: "北海道", beliefs: [], date: "2026-11-20" }, null, [], [], { denied: [den], rng: seeded(sd) });
        if (got && got.story.id === "P-北海道") n += 1;
      }
      return n;
    };
    if (sub) {
      const hit = count(sub);
      ok(hit > 0, "R4 副の 思い込み (" + sub + ") を 否定しても その県の 噺 (P-北海道) は 残る (30 回 中 " + hit + " 回 選ばれた)");
    } else {
      ok(true, "R4 (P-北海道 に 副の 思い込みが 無い 台本 = 試す 相手が 無い)");
    }
    const hit2 = count(main);
    ok(hit2 === 0, "  対照: その 席が ひっくり返す 思い込み (" + main + ") を 否定したら 外す (選ばれた " + hit2 + " 回)");
  }

  // R5 (#5・N13) 園の 送り「生まれた 山の話を」の あとは 西山公園の 席。★「話は ○○へ 飛びまして」も 二重の 入りも 言わない
  {
    const KINS = ["kushiro", "nagano", "okinawa", "tennoji", "asahikawa", "tobu"];
    let sent = 0; const bad = [];
    KINS.forEach((kin) => [1, 12, 14].forEach((sd) => ["いや、べつに", "いま、公園におります"].forEach((q) => {
      const r = go3({ seed: sd, search: "?kin=" + kin + "&date=2026-11-20" }, [q, "思う"], 2);
      const i = idx(r, /の話は ここまでで。$/);
      if (i < 0) return;
      sent += 1;
      const after = r.txt.slice(i + 1, i + 5);
      const dbl = after.some((t, j) => /ひとつ。$/.test(t) && /^では、/.test(after[j + 1] || ""));
      if (r.errors || /^P-/.test(r.shown[1] || "") || after.some((t) => /^話は [^、]+(飛びまして|戻りまして)/.test(t)) || dbl) bad.push(kin + sd + ":" + r.shown.join(">") + " " + after.slice(0, 2).join("/"));
    })));
    ok(sent > 0 && !bad.length, "R5 園の 送りの あとは 西山公園の 席・「飛びまして」も 二重の 入りも 無し (送った 回 " + sent + ") " + bad.slice(0, 2).join(" | "));
  }

  // R6 (N5) 暦の 席へ 入る ときの 断りは 1 行 (「今日という日」を 二度 言わない・「次のお客さん」と「その筋」を 並べない)
  {
    const bad = []; let n28 = 0;
    [1, 2, 3, 4, 5, 6].forEach((sd) => {
      const r = go3(Object.assign({ seed: sd }, D28), ["いや、べつに", "県外から", "関東", "埼玉県", "いや、どうだか"], 3);
      const k = r.shown.indexOf("T-1128");
      if (k < 1) return;
      n28 += 1;
      const seats = r.L.map((x, i) => (x.k === "seat" ? i : -1)).filter((i) => i >= 0);
      const s0 = seats[k - 1], mk = r.txt.map((t) => t.replace(/\n/g, "")).indexOf(byIdB("T-1128").makura, s0);   // ★引用の 前後の 改行は 除いて 比べる
      const intro = r.txt.slice(s0 + 1, mk);
      const kyo = intro.filter((t) => /今日という日/.test(t)).length;
      if (kyo !== 1 || intro.some((t) => /趣を変えて|お出しいたしました|持ち合わせ/.test(t)) || intro.length > 2) bad.push(sd + ":" + intro.join("/"));
    });
    ok(n28 > 0 && !bad.length, "R6「いや、どうだか」で 二席目 以降に 入る T-1128 の 入りは 断り 無しの「では、今日という日の話を。」(" + n28 + " 回) " + bad.slice(0, 2).join(" | "));
    const rs = [1, 2, 3, 4, 5, 6, 7, 8].map((sd) => go3({ seed: sd }, ["いや、べつに", "県外から", "関東", "群馬県", "思う"], 3));
    const both = rs.filter((r) => r.txt.some((t, i) => t === "さて、次のお客さんの話を、もう一席。" && /趣を変えて|お出しいたしました|前に お聞き|またの機会/.test(r.txt[i + 1] || "")));
    ok(!both.length, "  断り (この 客の 話) の 前に「次のお客さんの話を」と 言わない (" + rs.length + " 回) " + both.map((r) => r.shown.join(">")).join(" "));
  }

  // R7 (N7) 謎かけに 当たった 客 (= 公園に いる) には この あとの 席でも「行ってみたい気持ち」を 聞かない。何も 伺って いないのに「はじめに 伺いました」と 言わない
  {
    const cover = go3({ seed: 1, via: "genchiBtn", words: ["赤", "足あと", "愛の鐘"], patch: vf(["G1", "G2", "G3"]),
                        store: { "hanashiyama.genchi.v1": JSON.stringify({ pending: "G1" }), "hanashiyama.pref.v1": "埼玉県" } }, [], 4);
    ok(!cover.errors && cover.shown.length >= 4 && !has(cover, "はじめに、お気持ちを伺いました") && !has(cover, "行ってみたい気持ちは"),
       "R7 表紙の「現地の謎かけに答える」から 入った 回 (" + cover.shown.join(">") + ") で「はじめに、お気持ちを伺いました」も「行ってみたい気持ち」も 言わない");
    const home = go3({ seed: 51, words: ["赤", "足あと", "愛の鐘"], patch: vf(["G1", "G2", "G3"]) }, ["いや、べつに", "この福井から", "思う"], 5);
    const iU = idx(home, "ご名答。現地まで、ようこそ。");
    ok(home.shown.length >= 5 && iU > 0 && idx(home, "行ってみたい気持ちは", iU) < 0 && idx(home, "行ってみたい気持ちは") >= 0 && idx(home, "行ってみたい気持ちは") < iU,
       "  一席目の あと 謎かけを 解いた 客 (" + home.shown.join(">") + ") には、その あとの 席で 聞かない (一席目の 終わりには 聞く)");
  }

  // R8 (N8) 次の 謎かけの 場所が まだ 確かめて いない ときは「この続きは、結びの広場に」と 言わない。★確かめて あれば 言う
  {
    const PL = ["いや、べつに", "県外から", "関東", "東京都", "思う"];
    const off = go3({ seed: 54, words: ["赤", "めがね", "愛の鐘"], patch: vf(["G1", "G2b", "G3"]) }, PL.slice(), 3);
    const on = go3({ seed: 54, words: ["赤", "足あと", "愛の鐘"], patch: vf(["G1", "G2", "G3"]) }, PL.slice(), 4);
    const g1 = (HB.genchi || []).find((g) => g.id === "G1") || {};
    ok(!!g1.nextLine && off.shown.indexOf("S55") >= 0 && !has(off, g1.nextLine), "R8 G2 が まだ 確かめて いない 回は S55 の あとに「" + String(g1.nextLine).slice(0, 14) + "…」と 言わない [" + off.shown.join(">") + "]");
    ok(on.shown.indexOf("S56") >= 0 && has(on, g1.nextLine), "  対照: G2 を 確かめて あれば 言って 次の 謎かけへ [" + on.shown.join(">") + "]");
  }

  // R9 (#14) 福井の 県の つなぎで「大半が」を 言ったら、二席目 以降も 同じ 数の 席 (F21・F26) を 後ろへ
  {
    const LOCAL = (id) => { const s2 = byIdB(id); return !!s2 && (s2.facts || []).some((f) => f === "F21" || f === "F26"); };
    const heardS10 = { "hanashiyama.log.v1": JSON.stringify([{ event: "shown", story: "S10" }]) };
    let said = 0; const bad = [];
    for (let sd = 1; sd <= 25; sd++) {
      const r = go3({ seed: sd, store: heardS10 }, ["いや、べつに", "この福井から", "思う"], 5);
      if (!has(r, /大半が/)) continue;
      said += 1;
      const mine = r.shown.slice(1);                 // ★shown[0] は 前に 聞いた S10 (記録)
      if (mine.slice(1).some(LOCAL)) bad.push(sd + ":" + mine.join(">"));
    }
    ok(said > 0 && !bad.length, "R9「大半が」を 言った 回 (" + said + ") の 二席目 以降に 同じ 数の 席を 出さない " + bad.slice(0, 2).join(" "));
  }

  // R10 (N12) 暦の 席が 二つ 続く ときは「今日という日の話を」を 二度 言わない
  {
    // ★2026-11-21: 5/5 の 暦の 席どうしは 題材が 重なり、ふつうは 続かなくなった → ★試験の 中で 暦で ない 席を 抜いて 二つ 続く 形を 作る
    const r = go3({ seed: 530, date: "2026-05-05", search: "?date=2026-05-05", patch: (w) => { w.HANASHI.stories = w.HANASHI.stories.filter((s) => s.genchi); w.HANASHI.prefStories = [];
      (w.HANASHI.today["05-05"] || []).forEach((s, i) => { s.title = "暦の席" + i; s.furi = "ご存じで?"; s.sage = "試しの サゲ " + i + "。"; (s.scenes || []).forEach((sc) => { sc.head = "場面"; }); }); /* ★題材 (題・振り・サゲ・見出し) を 中立に */ } }, ["行きたい", "言わずにおく", "思う"], 2);
    const two = r.shown.length >= 2 && r.shown.slice(0, 2).every((id) => (byIdB(id) || {}).isToday);
    ok(two && r.txt.filter((t) => /今日という日の話を/.test(t)).length === 1 && has(r, "もう一つ、今日の話を。"),
       "R10 5/5 に 暦の 席が 二つ 続く 回 (" + r.shown.join(">") + "): 二つ目の 入りは「もう一つ、今日の話を。」");
  }

  // R11 (N13) 入りの 二重 (「東京都のお客さんに、ひとつ。」→「では、新宿の話から。」) を 1 文に
  {
    const rs = [1, 2, 3, 4, 5].map((sd) => go3({ seed: sd }, ["いや、べつに", "県外から", "関東", "東京都", "思う"], 2));
    const s13 = rs.filter((r) => r.shown.indexOf("S13") > 0);
    const bad = s13.filter((r) => r.txt.some((t, i) => /お客さんに、ひとつ。$/.test(t) && /^では、/.test(r.txt[i + 1] || "")));
    ok(s13.length > 0 && !bad.length, "R11 二席目の S13 (" + s13.length + " 回) で「…お客さんに、ひとつ。」の 直後に「では、…」を 重ねない");
  }

  // R12 三席目を 頼んだ とき、席より 先に「お願いします / また来る」で もう一度 頼ませない (実演の 筋)
  {
    const bad = [];
    [1, 2, 3, 4].forEach((sd) => {
      const r = go3(Object.assign({ seed: sd }, D28), DEMO.slice(), 3);
      if (r.shown.length < 3 || has(r, /^(お願いします|また来る)$/)) bad.push(sd + ":" + r.shown.join(">"));
    });
    ok(!bad.length, "R12 実演の 筋で 三席目を 頼むと、問わずに 三席目へ (崩れ " + bad.length + ") " + bad.join(" "));
  }

  // R13 (N14) 再訪で「別のところから」: 「どちらからお越しで?」と 問い直さない (★「二つだけ」の 約束)
  {
    const r = go3({ seed: 21, store: { "hanashiyama.pref.v1": "茨城県" } }, ["行きたい", "別のところから", "県外から", "関東", "東京都"], 1);
    ok(!r.errors && r.shown.length >= 1 && has(r, "二つだけ伺います") && !has(r, "どちらからお越しで"),
       "R13 再訪の「別のところから」の あとは「どちらからお越しで?」と 問い直さない [" + r.shown.join(">") + "]");
  }

  // R14 (N15) 相槌の すぐ あとに 客の 台詞が 続かない
  {
    const runs = [go3(Object.assign({ seed: 1 }, D28), DEMO.slice(), 2)].concat([3, 7, 12].map((sd) => go3({ seed: sd }, ["いや、べつに", "県外から", "近畿", "兵庫県", "思う"], 3)));
    let nA = 0; const bad = [];
    runs.forEach((r) => r.L.forEach((x, i) => {
      if (x.k !== "aizuchi") return;
      nA += 1;
      let j = i + 1;
      while (j < r.L.length && r.L[j].k === "ma") j += 1;
      const nx = r.L[j] || {};
      if (/kyaku2/.test(nx.cls || "")) bad.push("相槌の あと「" + String(nx.t).slice(0, 14) + "」");
    }));
    ok(nA > 0 && !bad.length, "R14 相槌の すぐ あとに 客の 台詞を 続けない (相槌 " + nA + " 回) " + bad.slice(0, 2).join(" / "));
  }

  // R15 (N11) 在庫切れ → 見繕いでも 二席目は 交互 (一席目が 動物なら 動物で ない 席)
  {
    const isA = (id) => (C0 && typeof C0.isAnimal === "function" ? C0.isAnimal(byIdB(id)) : false);
    const bad = []; let n = 0;
    [["中国・四国", "岡山県", 334], ["北海道・東北", "北海道", 117], ["関東", "群馬県", 180], ["九州・沖縄", "沖縄県", 432]].forEach(([b, p, sd]) => {
      const r = go3({ seed: sd }, ["いや、べつに", "県外から", b, p, "いや、どうだか"], 2);
      n += 1;
      if (r.shown.length >= 2 && isA(r.shown[0]) && isA(r.shown[1])) bad.push(p + ":" + r.shown.join(">"));
    });
    ok(!bad.length, "R15 見繕いの 経路でも 動物の 席を 続けない (" + n + " 回) " + bad.join(" "));
  }

  // R17〜R19 (2026-11-21 (60)) 動物の 噺は 3 席 まで 続けて よい / 同じ 話を 二度 聞かせない (S03 ↔ P-北海道・S02 ↔ 名前の 型)
  //   ★7 席の 筋を 通して 数える。★対照 = 動物の 噺は 3 席 続く 筋が ある (数え方は 壊れていない)
  {
    const isA = (id) => { const s = byIdB(id); return !!s && (typeof s.animal === "boolean" ? s.animal : /動物園|レッサーパンダ/.test(s.ochiWhat || "")); };
    const ansOf = (id) => { const s = byIdB(id); return s && s.question && s.question.choices ? String(s.question.choices[s.question.answer]) : ""; };
    const maxRun = (ids) => { let c = 0, m = 0; ids.forEach((id) => { c = isA(id) ? c + 1 : 0; m = Math.max(m, c); }); return m; };
    const R = [];
    [1, 2, 3, 4, 5, 6].forEach((sd) => R.push(["北海道", go3({ seed: sd }, ["いや、べつに", "県外から", "北海道・東北", "北海道", "思う"], 7)]));
    [1, 2, 3, 4].forEach((sd) => R.push(["東京都", go3({ seed: sd }, ["いや、べつに", "県外から", "関東", "東京都", "思う"], 7)]));
    ["宮城県", "群馬県", "愛知県", "福岡県", "沖縄県"].forEach((p) => [1, 2, 3, 4].forEach((sd) =>
      R.push([p, go3({ seed: sd }, ["いや、べつに", "県外から", { "宮城県": "北海道・東北", "群馬県": "関東", "愛知県": "中部", "福岡県": "九州・沖縄", "沖縄県": "九州・沖縄" }[p], p, "思う"], 7)])));
    const short = R.filter(([, r]) => r.errors || r.shown.length < 7).map(([p, r]) => p + ":" + r.shown.join(">"));
    ok(!short.length, "R17 7 席まで 通る (" + (R.length - short.length) + " / " + R.length + ") " + short.slice(0, 2).join(" "));
    const run4 = R.filter(([, r]) => maxRun(r.shown) >= 4).map(([p, r]) => p + ":" + r.shown.join(">"));
    ok(!run4.length, "R17 動物の 噺は 4 席 続けない (" + R.length + " 回) " + run4.slice(0, 2).join(" "));
    const zk = R.filter(([, r]) => has(r, "在庫切れ")).length;
    ok(zk > 0, "  対照: 在庫切れの あとの 見繕いを 通った 筋も 含む (" + zk + " / " + R.length + " 回)");
    const run3 = R.filter(([, r]) => maxRun(r.shown) === 3).length;
    ok(run3 > 0, "  対照: 3 席 続く 筋は ある (" + run3 + " 回)");
    const hk = R.filter(([p]) => p === "北海道").map(([, r]) => r);
    const dupHk = hk.filter((r) => r.shown.indexOf("S03") >= 0 && r.shown.indexOf("P-北海道") >= 0).map((r) => r.shown.join(">"));
    ok(hk.some((r) => r.shown.indexOf("S03") >= 0) && !dupHk.length, "R18 北海道の 客に S03 と P-北海道 (同じ 1993 年の 旭山・答え 29園) を 同じ 回に 出さない (" + hk.length + " 回) " + dupHk.slice(0, 2).join(" "));
    const nm = R.filter(([p]) => /^(宮城県|群馬県|愛知県|福岡県|沖縄県)$/.test(p));
    const dupNm = nm.filter(([p, r]) => r.shown.indexOf("S02") >= 0 && r.shown.some((id) => ansOf(id) === "この赤いほう")).map(([p, r]) => p + ":" + r.shown.join(">"));
    const ctlNm = nm.filter(([, r]) => r.shown.some((id) => ansOf(id) === "この赤いほう")).length;
    ok(ctlNm > 0 && !dupNm.length, "R19 名前の 型の 席 (" + ctlNm + " 回) と S02 (元祖パンダ) を 同じ 回に 出さない " + dupNm.slice(0, 2).join(" "));
    // ★見繕いの 側でも: 名前の 型を 聞いた あと、S02 しか 手がかりの 席が 無くても S02 を 出さない (Core)
    const C0s = C0 && typeof C0.sameTalk === "function";
    ok(C0s && C0.sameTalk(HB, byIdB("S03"), byIdB("P-北海道")) && C0.sameTalk(HB, byIdB("S02"), byIdB("T-pandaday-22")) &&
       !C0.sameTalk(HB, byIdB("S01"), byIdB("T-1128")) && !C0.sameTalk(HB, byIdB("S03"), byIdB("S02")),
       "  同じ 話の 判定: S03↔P-北海道・S02↔T-pandaday-22 は 同じ、S01↔T-1128・S03↔S02 は 違う");
    // ★実演の 筋 (11/28・埼玉県) は 7 席 通しても 一席目 T-1128・二席目 P-埼玉県 の まま
    const dm = [1, 2, 3].map((sd) => go3(Object.assign({ seed: sd }, D28), DEMO.slice(), 7));
    ok(dm.every((r) => !r.errors && r.shown[0] === "T-1128" && r.shown[1] === "P-埼玉県" && maxRun(r.shown) < 4),
       "  実演の 筋は T-1128 > P-埼玉県 の まま (7 席: " + dm.map((r) => r.shown.join(">")).join(" | ") + ")");
  }

  // R20〜R22 組版・間の 直し (2026-11-21 作者の判断): 外れの 返しと 正解の 1 行を「一続きの 一声」に (hazure + seikai)
  //   ★時間 (余韻 2.4 秒・註から 推量 1.2 秒・返しから 正解 0.9 秒・打ち出しの 速さ) は test_motion.js ⑭〜⑯ で 見る
  {
    const seq = (r) => r.L.filter((x) => x.k !== "aizuchi");
    const near = (r, re) => { const L = seq(r); const i = L.findIndex((x) => x.k === "say" && re.test(" " + x.cls + " ")); return { i, L }; };
    // R20 P-埼玉県 を 外す (3園): 返しは hazure、すぐ 下 (空き なし) に 正解の 1 行 (seikai)
    const w = go3(Object.assign({ seed: 1, ans: "wrong" }, D28), DEMO.slice(), 2);
    const { i: iK, L: Lw } = near(w, / kotae hazure /);
    const nx = Lw[iK + 1] || {};
    ok(!w.errors && w.shown[1] === "P-埼玉県" && iK >= 0 && /それが、思いのほか方々へ/.test(Lw[iK].t),
       "R20 外れの 返しは hazure (P-埼玉県「" + (iK >= 0 ? Lw[iK].t : "無し") + "」)");
    ok(nx.k === "say" && / seikai /.test(" " + nx.cls + " ") && /^答えは、29園でございます。$/.test(nx.t),
       "  返しの すぐ 下 (間の 空き なし) に 正解の 1 行 (" + (nx.k || "") + " " + (nx.cls || "") + " " + (nx.t || "") + ")");
    // ★外れの 返しは 一席に 1 つ。★T-1128 (外れでも 返しが 正解を 言う) は hazure に しない
    const kw = Lw.filter((x) => x.k === "say" && / kotae /.test(" " + x.cls + " "));
    ok(kw.length === 2 && / kotae /.test(" " + kw[0].cls + " ") && !/ hazure /.test(" " + kw[0].cls + " ") && /吉田松陰/.test(kw[0].t),
       "R21 返しが もう 正解を 言う 外れ (T-1128「" + (kw[0] ? kw[0].t : "") + "」) は hazure に しない・正解の 1 行も 足さない");
    // R21 正解を 押したら 今どおり (hazure なし・正解の 1 行 なし)
    const c = go3(Object.assign({ seed: 1, ans: "correct" }, D28), DEMO.slice(), 2);
    const kc = seq(c).filter((x) => x.k === "say" && / kotae /.test(" " + x.cls + " "));
    ok(!c.errors && kc.length === 2 && kc.every((x) => !/ hazure /.test(" " + x.cls + " ")) && !seq(c).some((x) => / seikai /.test(" " + x.cls + " ")),
       "  正解を 押したら 返しは 今どおり (" + kc.map((x) => x.cls.replace(/ ?tatami/, "") + "「" + x.t + "」").join(" / ") + ")");
    // R22 サゲ → 註 → 推量 → 追い足し の 順。★余韻は 時間だけ (サゲと 註の 間・註と 推量の 間に 空きの 行 (ma) を 作らない)
    const L2 = seq(w);
    const iS = L2.map((x, k) => (x.k === "say" && / sage /.test(" " + x.cls + " ") ? k : -1)).filter((k) => k >= 0);
    const okSeq = iS.length === 2 && iS.every((k) => L2[k + 1] && L2[k + 1].k === "note" && L2[k + 2] && / suiryo /.test(" " + L2[k + 2].cls + " ")
      && L2[k + 3] && / ato /.test(" " + L2[k + 3].cls + " "));
    ok(okSeq, "R22 サゲの あと 註 → 推量 → 追い足し (空きの 行を 挟まない。2 席: " +
       iS.map((k) => L2.slice(k, k + 4).map((x) => x.k === "say" ? x.cls.replace(/^line shi |\s*tatami/g, "") : x.k).join(">")).join(" | ") + ")");
  }

  // R23 」の 後の 改行 (2026-11-21 作者の判断): 」。 で 文が 終わり 次の 文が 続く ときは 句点まで 前の 行に 残して 改行
  {
    const kb = C0 && typeof C0.kagiBreak === "function" ? C0.kagiBreak : null;
    const cases = [
      ["名は「炎色のネコ」。いまも、そう呼ばれます。", "名は「炎色のネコ」。\nいまも、そう呼ばれます。"],
      ["噺の前に、ひとつ。「幕末の悪役は、悪役のまま」。\nそう思っておいでで?", "噺の前に、ひとつ。\n「幕末の悪役は、悪役のまま」。\nそう思っておいでで?"],   // ★qBreak の 後でも 二重に しない・「 の 前でも 改行
      ["青森県からでございますか。「とっておきの青森」の。 うちの裏の山の話で ひとつ。", "青森県からでございますか。\n「とっておきの青森」の。 うちの裏の山の話で ひとつ。"],   // ★句点の 後の「 の 前で 改行 (」+助詞 は そのまま)
      ["「祈りの道」は、約900メートル。", "「祈りの道」は、約900メートル。"],                         // ★行の 頭が もう「
      ["市の紹介で、「言われています」とございます。", "市の紹介で、「言われています」とございます。"],     // ★語の 引用 (7 字・読点なし) は「 の 前が 読点でも 改行しない
      ["そこで「達成」とございます。", "そこで「達成」とございます。"],                                 // ★「 の 前が 助詞 (文が 続く)
      ["名づけた庭「嚮陽渓」が、西山公園のはじまりでございます。", "名づけた庭「嚮陽渓」が、西山公園のはじまりでございます。"],   // ★語の 引用 + 助詞 は 改行しない
      ["客「そうかい。「大きな園」。なんだろうね。」", "客「そうかい。「大きな園」。なんだろうね。」"],                     // ★行 全体が 台詞
      ["年表はひとこと、「達成」。", "年表はひとこと、「達成」。"],                                                       // ★」。 で 行が 終わる
    ];
    const bad = kb ? cases.filter(([i, o]) => kb(i) !== o).map(([i]) => i) : ["kagiBreak が 無い"];
    ok(!bad.length, "R23 」の 後・「 の 前の 改行: 」。 + 次の 文 / 句点 +「 は 改行。」+助詞・読点や 助詞 +「・行頭の「・台詞・行末・qBreak 済み は そのまま (" + cases.length + " 例) " + bad.join(" | "));
    // ★実演の 前段の 振り: ひとつ。⏎「…」。⏎そう思って (qBreak と 二重に ならない)
    const r = go3(Object.assign({ seed: 1 }, D28), DEMO.slice(), 1);
    const furi0 = r.L.find((x) => x.k === "say" && /^噺の前に、ひとつ。/.test(x.t));
    ok(!!furi0 && furi0.t === "噺の前に、ひとつ。\n「幕末の悪役は、悪役のまま」。\nそう思っておいでで?", "  実演の 前段の 振りは「噺の前に、ひとつ。⏎「…」。⏎そう思っておいでで?」(改行 2 つ・二重なし)");
  }
  // R24 文節で 改行 (2026-11-21 作者の判断): auto-phrase が 効かない ブラウザ用の 切れ目 (<wbr>)。★語・数字 + 単位・人名・短い「…」の 中で 切らない
  {
    const pb = C0 && typeof C0.phraseBreaks === "function" ? C0.phraseBreaks : null;
    const wb = C0 && typeof C0.withWbr === "function" ? C0.withWbr : null;
    const cut = (t) => { const b = pb(t); let o = "", k0 = 0; b.forEach((p) => { o += t.slice(k0, p) + "|"; k0 = p; }); return o + t.slice(k0); };
    const NOCUT = ["送り主", "2011年", "29園", "東武動物公園", "レッサーパンダ", "お殿様", "ご縁", "ひと跳び", "それ以来", "」が", "」と", "吉田松陰", "間部詮勝", "「達成」", "その子", "よその", "どれほど", "私「"];
    const T = ["さぞ大きな園とお思いのその送り主が、このレジの裏の、日本一小さいといわれる園。",
      "記録によりますと2011年、福井から東武動物公園へ、レッサーパンダが移りました。その子は、もう記録の上だけでございますが。",
      "答えは、29園でございます。", "時は幕末、この鯖江の藩に、お殿様がおりました。", "私「ご自慢の園と、ここ、帳面の上ではご縁がございます。」",
      "そのお国からこの小さな山まで、話はひと跳びでございます。", "道を訊かれて、まるきり逆をお教えしたことがございます。それ以来、地図が手放せません。",
      "名づけた庭「嚮陽渓」が、西山公園のはじまりでございます。", "レジで「鯖江のお殿様は、どなたで」と訊かれまして。", "それが、あの吉田松陰なんでございます。",
      "間部詮勝、1884年の今日に亡くなりました。", "市の年表はひとこと、「達成」。", "うちの名所は、思いつきからして、よその庭。", "埼玉県へ送り出した園、どれほどの構えだとお思いで。"];
    const cutIn = [];
    if (!pb) cutIn.push("phraseBreaks が 無い");
    else T.forEach((t) => { const b = pb(t); NOCUT.forEach((w) => { let i = t.indexOf(w);
      while (i >= 0) { const j = i; if (b.some((p) => p > j && p < j + w.length)) cutIn.push(w + " ← " + cut(t)); i = t.indexOf(w, i + 1); } }); });
    ok(!cutIn.length, "R24 文節の 切れ目は 語の 中に 入らない (" + NOCUT.length + " 語 × " + T.length + " 文) " + cutIn.slice(0, 2).join(" ／ "));
    const want = pb ? [["さぞ大きな園とお思いのその送り主が、このレジの裏の、日本一小さいといわれる園。", "さぞ|大きな|園と|お思いの|その送り主が、|このレジの|裏の、|日本一小さいといわれる|園。"]]
      .filter(([t, o]) => cut(t) !== o).map(([t]) => cut(t)) : ["phraseBreaks が 無い"];
    ok(!want.length, "  P-埼玉県の サゲの 切れ目 = さぞ|大きな|園と|お思いの|その送り主が、|このレジの|裏の、|日本一小さいといわれる|園。 " + want.join(""));
    const h = wb ? wb('答えは、<b class="kazu">29園</b>でございます。', [4]) : "";
    ok(h === '答えは、<wbr><b class="kazu">29園</b>でございます。', "  <wbr> は 飾りの タグの 前に 入る (数字の 飾りの 中に 入れない) " + h);
    // ★煙試験の 最小 DOM (CSS.supports が 無い = auto-phrase が 効かない 側) で、語りの 行に <wbr> が 入り、字は 変わらない
    const r = go3(Object.assign({ seed: 1, ans: "wrong" }, D28), DEMO.slice(), 2);
    const sg = r.a.talkEls().filter((c) => /(^| )sage( |$)/.test(c.className || ""));
    ok(sg.length === 2 && sg.every((c) => /<wbr>/.test(c._html || "")) &&
       sg.every((c) => (c._html || "").replace(/<[^>]+>/g, "") === String(r.L.find((x) => x.k === "say" && / sage /.test(" " + x.cls + " ") && (c._html || "").replace(/<[^>]+>/g, "").indexOf(x.t.slice(0, 6)) === 0).t)),
       "  auto-phrase の 無い 側: サゲの 行に <wbr> が 入り、字は 読み上げ用の 行と 同じ (" + sg.length + " 席)");
  }

  // R25 キーとなる 単語 (2026-11-21 作者の判断) = サゲが あとで 受け返す 語句を 太字。1 行 1 か所・同じ 語句は 席で 1 回・1 席 3 か所まで。
  //   ★問いの 答えと 重なる 語句・サゲ / 註 / 推量 / 追い足し には 付けない。★「」の 飾り (もう 太字) と 二重に しない
  {
    const kp = C0 && typeof C0.keyPhrase === "function" ? C0.keyPhrase : null;
    const sk = C0 && typeof C0.seatKeys === "function" ? C0.seatKeys : null;
    const wk = C0 && typeof C0.withKey === "function" ? C0.withKey : null;
    const P = byIdB("P-埼玉県"), T28 = byIdB("T-1128");
    const ex = kp ? [
      [kp("そうかい、福井から来た子だったのか。さぞ大きな園なんだろうね。", P.sage, "29園"), "さぞ大きな園"],
      [kp("答えは29園でございまして、29園のうち。", "その29園のうちの一つが、うちの裏。", "29園"), null],          // ★答えと 重なる
      [kp("どれほどの構えだとお思いで。", P.sage, "29園"), null],                                                  // ★言い回し (お思い) は 拾わない
      [kp("この老中を襲う相談をしたのは、誰でしょう。", T28.sage, "吉田松陰"), null],                              // ★2 字 (老中) は 拾わない
      [kp("名の通った園と申します。", "名の通った園で。", "", ["通った園"]), "通った園"],                          // ★keys が あれば そちら
    ] : [[0, 1]];
    const bad = ex.filter(([g, w]) => g !== w).map(([g, w]) => String(g) + "≠" + String(w));
    ok(!bad.length, "R25 キーの 語句: P-埼玉県の 客の 台詞 →「さぞ大きな園」/ 答えと 重なる・言い回し・2 字 は 拾わない / keys を 優先 " + bad.join(" | "));
    // ★130 席: 1 席 3 か所まで・同じ 語句は 1 回・読点を またがない
    let over = 0, dup = 0, seatsK = 0, linesK = 0;
    if (sk) ALLB.forEach((st) => {
      const L = [].concat(st.furi ? [st.furi] : [], [st.makura], st.hondai || []).filter(Boolean);
      const ks = sk(L, st).filter(Boolean);
      if (ks.length > 3) over += 1;
      if (new Set(ks).size !== ks.length) dup += 1;
      if (ks.some((k) => /[、。]/.test(k) || k.length < 3)) over += 1;
      linesK += ks.length; if (ks.length) seatsK += 1;
    });
    ok(sk && !over && !dup && linesK > 0, "  130 席: 太字の 行 " + linesK + " / 席 " + seatsK + "・1 席 4 か所 以上 0・同じ 語句の 二度 0 (" + over + "/" + dup + ")");
    const h1 = wk ? wk('<em class="kagi">「さぞ大きな園」</em>です', "さぞ大きな園") : "";
    const h2 = wk ? wk('答えは<b class="kazu">29園</b>の園です', "29園の園") : "";
    ok(wk && h1 === '<em class="kagi">「さぞ大きな園」</em>です' && h2 === '答えは<strong class="key"><b class="kazu">29園</b>の園</strong>です',
       "  「」の 飾りの 中には 付けない / 数字の 飾りは 太字の 中に そのまま " + h2);
    // ★実演の 筋 (外れ): P-埼玉県の 客の 台詞だけ 太字。★サゲ・註・推量・追い足しには 無い。★字は 変わらない
    const r = go3(Object.assign({ seed: 1, ans: "wrong" }, D28), DEMO.slice(), 2);
    const ks2 = r.a.talkEls().filter((c) => /<strong class="key">/.test(c._html || ""));
    const where = ks2.map((c) => (c.className || "").replace(/ ?(tatami|shigusa)/g, "") + ":" + (((c._html || "").match(/<strong class="key">(.*?)<\/strong>/) || [])[1] || "").replace(/<wbr>/g, ""));
    ok(ks2.length === 1 && where[0] === "line serifu kyaku2:さぞ大きな園" &&
       !ks2.some((c) => / (sage|suiryo|ato) /.test(" " + c.className + " ")),
       "  実演の 筋: 太字は P-埼玉県の 客の 台詞「さぞ大きな園」の 1 か所だけ (" + where.join(" / ") + ")");
    const txtOf = (c) => (c._html || "").replace(/<[^>]+>/g, "");
    ok(ks2.every((c) => txtOf(c) === "客「そうかい、福井から来た子だったのか。さぞ大きな園なんだろうね。」"), "  太字を 付けても 字は 変わらない (<wbr> と 一緒でも)");
  }
  // R26 めくり (題) を 折らない (2026-11-21 見直し): 題の 字数を data-n に (スマホは 字数で 小さく)。
  //   ★130 席の 題が 360px 幅で 1 塊で 収まる (計算: 和字 1em・数字 0.55em・字間 0.02em・左右の 余白 + 枠 22px・高座の 中身 336px)
  {
    const a = MH.makeApp(Object.assign({ date: "2026-11-28", seed: 1 }, APPX ? { srcPatch: () => APPX } : {}));
    a.click("open"); a.settle();
    for (const l of ["いや、べつに", "県外から", "関東", "埼玉県", "思う"]) { a.pick(l); a.settle(); }
    ok(a.byId.mekuri.dataset.n === "6", "R26 めくりに 題の 字数 (data-n): T-1128「" + a.byId.mekuri.textContent + "」→ " + a.byId.mekuri.dataset.n);
    const css = fs.readFileSync(path.join(ROOT, "app", "style.css"), "utf8");
    const tier = {};
    (css.match(/\.mekuri\[data-n="\d+"\][^{]*\{\s*font-size:\s*[\d.]+rem/g) || []).forEach((m) => {
      const f = Number(m.match(/font-size:\s*([\d.]+)rem/)[1]);
      (m.match(/data-n="(\d+)"/g) || []).forEach((x) => { tier[Number(x.match(/\d+/)[0])] = f; });
    });
    const fsOf = (n) => tier[Math.min(16, n)] || 1.12;
    const tooWide = ALLB.filter((s) => {
      const n = Array.from(s.title).length;
      const px = fsOf(n) * 16;
      const w = Array.from(s.title).reduce((x, c) => x + (/[0-9A-Za-z]/.test(c) ? 0.55 : 1) * px + 0.02 * px, 0) + 22;
      return w > 336 || fsOf(n) < 0.95;
    }).map((s) => s.title);
    const maxN = Math.max.apply(null, ALLB.map((s) => Array.from(s.title).length));
    ok(Object.keys(tier).length > 0 && !tooWide.length, "  130 席の 題 (最長 " + maxN + " 字) が 360px で 1 塊 (0.95rem 以上) " + tooWide.join(","));
  }

  // R27 人の 言葉の 引用 (「」の 中が 8 字 以上 / 読点・?・! を 含む) は「 の 前と 」の 後で 改行 (2026-11-21 見直し)。
  //   ★語の 引用 (7 字 以下・読点なし)・行 全体が 台詞・サゲは そのまま。★私の 台詞の 中の 引用は 改行。★」の 後が 2 字 以下で 文が 終わる なら 切らない
  {
    const kb = C0 && typeof C0.kagiBreak === "function" ? C0.kagiBreak : null;
    const cases = [
      ["レジで「鯖江のお殿様は、どなたで」と訊かれまして、答えに詰まったことがございます。", "レジで\n「鯖江のお殿様は、どなたで」\nと訊かれまして、答えに詰まったことがございます。"],
      ["平成20年の欄に、「レッサーパンダのミンファが逃走し話題となる」とございます。", "平成20年の欄に、\n「レッサーパンダのミンファが逃走し話題となる」\nとございます。"],
      ["よろしければ、この札を お持ち帰りを。「この札をもらう」で、お手元に 残ります。", "よろしければ、この札を お持ち帰りを。\n「この札をもらう」で、お手元に 残ります。"],   // ★語の 引用 (7 字)
      ["私「「とっておきの青森」のお国の方に、並べてお聞かせします。」", "私「「とっておきの青森」\nのお国の方に、並べてお聞かせします。」"],   // ★私の 台詞の 中の 引用
      ["客「「入口の時計、合ってる?」って、よく訊かれるでしょう。」", "客「「入口の時計、合ってる?」って、よく訊かれるでしょう。」"],   // ★客の 台詞は 対象外
      ["青森県からでございますか。「とっておきの青森」の。 うちの裏の山の話で ひとつ。", "青森県からでございますか。\n「とっておきの青森」の。 うちの裏の山の話で ひとつ。"],   // ★」の 後が「の。」(2 字 以下) は 切らない
      ["顔のところが「入口の時計、合ってる」、尾がしっぽ。", "顔のところが\n「入口の時計、合ってる」、\n尾がしっぽ。"],   // ★」、 は 読点まで 前の 行
    ];
    const bad = kb ? cases.filter(([i, o]) => kb(i) !== o).map(([i]) => i.slice(0, 16)) : ["kagiBreak が 無い"];
    const sageOk = kb ? kb("レジで「鯖江のお殿様は、どなたで」と訊かれた山。", { quote: false }) === "レジで「鯖江のお殿様は、どなたで」と訊かれた山。" : false;
    ok(!bad.length && sageOk, "R27 人の 言葉の 引用は「」の 前後で 改行・語の 引用 / 客の 台詞 / サゲ は そのまま (" + (cases.length + 1) + " 例) " + bad.join(" | "));
    // ★実演の 筋: T-1128 の まくら・終わりの 問いの 前の「はじめに伺ったときは、「いや、べつに」でございました。」
    const r = go3(Object.assign({ seed: 1, ans: "correct" }, D28), DEMO.slice(), 1);
    const mk = r.L.find((x) => x.k === "say" && /^レジで/.test(x.t));
    const hj = r.L.find((x) => x.k === "say" && /^はじめに伺ったときは/.test(x.t));
    const sg = r.L.find((x) => x.k === "say" && / sage /.test(" " + x.cls + " "));
    ok(!!mk && mk.t === "レジで\n「鯖江のお殿様は、どなたで」\nと訊かれまして、答えに詰まったことがございます。" &&
       !!hj && hj.t === "はじめに伺ったときは、\n「いや、べつに」\nでございました。" && !!sg && sg.t.indexOf("\n") < 0,
       "  実演の 筋: T-1128 の まくら「レジで⏎「…」⏎と訊かれまして」・「はじめに伺ったときは、⏎「いや、べつに」⏎でございました。」・サゲは 改行なし");
  }

  // R28 あて推量の 表示 (2026-11-21 作者の判断): ポイント (「ではないか / のでは」の 直前の 句) を 太字・その 後に「……」の 間。★台本の 文は 変えない
  {
    const gs = C0 && typeof C0.guessShape === "function" ? C0.guessShape : null;
    const g1 = gs && gs(byIdB("P-埼玉県").guess), g2 = gs && gs(byIdB("T-1128").guess), g3 = gs && gs(byIdB("S55").guess);
    const g4 = gs && gs("書いてはおりませんが、園と園で子をやりとりするのには、それなりのわけがあるように思われます。");
    const g5 = gs && gs(byIdB("S52").guess);
    ok(!!g1 && g1.point === "血筋を絶やさぬため" && g1.text === "書いてはおりませんが、遠くまで送り出したのは、血筋を絶やさぬためではないか……と存じます。" &&
       !!g2 && g2.point === "人の笑う顔を見たかった" && g2.text === "書いてはおりませんが、京で厳しい役目を負ったぶん、国元では人の笑う顔を見たかったのでは……ないでしょうか。" &&
       !!g3 && g3.point === "迷うから" && !!g5 && g5.point === "人の集まる用事が あった" && g4 === null,
       "R28 推量の 形: P-埼玉県「血筋を絶やさぬため」ではないか……/ T-1128「人の笑う顔を見たかった」のでは……/ 長い 句は 後ろの 要 (S52「人の集まる用事が あった」S55「迷うから」) / ように思われます は そのまま");
    // ★62 席: ポイントは 3〜14 字・「……」は 1 か所・字は 台本の 文 +「……」だけ
    let bad = 0, n = 0, nOmo = 0;
    if (gs) ALLB.filter((s) => s.guess).forEach((s) => {
      if (/ように思われます/.test(Array.isArray(s.guess) ? s.guess.join("") : s.guess)) { nOmo += 1; if (gs(s.guess)) bad += 1; return; }   // ★そのまま (太字も「……」も 付けない)
      const g = gs(s.guess); if (!g) return; n += 1;
      const raw = Array.isArray(s.guess) ? s.guess.join("") : s.guess;
      const L = Array.from(g.point).length;
      if (L < 3 || L > 14 || g.text.split("……").length !== 2 || g.text.replace("……", "") !== raw || raw.indexOf(g.point) < 0) bad += 1;
    });
    ok(gs && n > 0 && nOmo === 15 && !bad, "  推量 " + n + " 席: ポイントは 3〜14 字・「……」は 1 か所・字は 台本 +「……」だけ (崩れ " + bad + ")・ように思われます の " + nOmo + " 席は そのまま");
    // ★実演の 筋: 推量の 行に 太字の ポイントと「……」。★サゲ・追い足しには 付かない
    const r = go3(Object.assign({ seed: 1, ans: "wrong" }, D28), DEMO.slice(), 2);
    const sui = r.a.talkEls().filter((c) => /(^| )suiryo( |$)/.test(c.className || ""));
    const pts = sui.map((c) => (((c._html || "").match(/<strong class="point">(.*?)<\/strong>/) || [])[1] || "").replace(/<wbr>/g, ""));
    ok(sui.length === 2 && pts[0] === "人の笑う顔を見たかった" && pts[1] === "血筋を絶やさぬため" && sui.every((c) => /……/.test(c._html || "")) &&
       !r.a.talkEls().some((c) => !/(^| )suiryo( |$)/.test(c.className || "") && /class="point"/.test(c._html || "")),
       "  実演の 筋: 推量の 行の 太字 = " + pts.join(" / ") + "・「……」あり・推量の 箱の 外には 付かない");
  }

  // R29 名前の まとまりを 折らない (2026-11-22 見直し: iPhone で「道の駅」が「道の」で 改行)。★Safari の 経路 (<wbr> + keep-all) を 主に 見る
  {
    const pb = C0 && typeof C0.phraseBreaks === "function" ? C0.phraseBreaks : null;
    const fin = C0 && typeof C0.finish === "function" ? C0.finish : null;
    const nbr = C0 && typeof C0.nbRanges === "function" ? C0.nbRanges : null;
    const inside = (t, w) => { const i = t.indexOf(w); return pb ? pb(t).some((q) => q > i && q < i + w.length) : true; };
    const T1 = ["鯖江の藩に、お殿様がおりました。", "山の中腹の、愛の鐘の下。", "市の木は、さくら。", "えー、いらっしゃいまし。"];
    const W1 = ["鯖江の藩", "山の中腹", "愛の鐘", "市の木", "えー"];
    const cut1 = [];
    T1.forEach((t) => W1.forEach((w) => { if (t.indexOf(w) >= 0 && inside(t, w)) cut1.push(w); }));
    ok(pb && !cut1.length, "R29 漢字 1〜3 字 + の + 漢字 1〜2 字 (鯖江の藩・山の中腹・愛の鐘・市の木) と「えー」の 中に 切れ目を 入れない " + cut1.join(","));
    const h1 = fin ? fin("えー、いらっしゃいまし。道の駅西山公園のレジに立っております、はなし山と申します。", true) : "";
    const h2 = fin ? fin('<em class="kagi">「愛の鐘」</em>が<strong class="key">道の駅</strong>の<b class="kazu">3か所</b>', true) : "";
    ok(/<span class="nb">道の駅西山公園<\/span>/.test(h1) && /<span class="nb">はなし山<\/span>/.test(h1) &&
       h2 === '<em class="kagi">「<span class="nb">愛の鐘</span>」</em>が<wbr><span class="nb"><strong class="key">道の駅</strong></span>の<wbr><b class="kazu">3か所</b>',
       "  名前は <span class=\"nb\"> で 包む (中に <wbr> なし)・「」の 飾り / 太字 / 数字 と 入れ子が 壊れない " + h2);
    // ★130 席の 全文: 名前の 途中に <wbr> が 入る 数 = 0 (名前の 包みの 中は 切れ目を 落とす)
    let bad = 0, nNames = 0; const ex = [];
    if (fin && nbr) {
      const strs = new Set();
      ALLB.forEach((st) => [].concat(st.furi ? [st.furi] : [], [st.makura], st.hondai || [], st.atogaki ? [st.atogaki] : [], st.guess ? [st.guess] : [],
        st.sage ? [st.sage] : [], st.ochiWhat ? [st.ochiWhat] : []).filter(Boolean).forEach((l) => strs.add(typeof l === "object" ? l.who + "「" + l.text + "」" : String(l))));
      strs.forEach((t) => {
        const h = fin(t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])), true);
        (h.match(/<span class="nb">([\s\S]*?)<\/span>/g) || []).forEach((m) => { nNames += 1; if (/<wbr>/.test(m)) { bad += 1; if (ex.length < 3) ex.push(m); } });
        C0.NB_NAMES.forEach((n) => { if (t.indexOf(n) >= 0 && !nbr(t).length) bad += 1; });
      });
    }
    ok(fin && nNames > 0 && !bad, "  130 席の 全文: 名前の 包み " + nNames + " か所・中に <wbr> 0 (" + bad + ") " + ex.join(" "));
    // ★実演の 筋: 一行目の「道の駅西山公園」・選択肢の 経路も 同じ 規則 (煙試験では 字の まま)
    const r = go3(Object.assign({ seed: 1 }, D28), DEMO.slice(), 1);
    const first = r.a.talkEls().find((c) => /道の駅/.test(c._html || ""));
    ok(!!first && /<span class="nb">道の駅西山公園<\/span>/.test(first._html) && !/道の<wbr>駅/.test(first._html),
       "  実演の 筋: 一行目の「道の駅西山公園」は 包まれ、「道の」で 折れない");
  }

  // R16 公開物の コメントに 外から 受けた 指摘を そのまま 映した 言い方 (かぎかっこで 引いた 指摘 + 手当て の 型) を 書かない / 札の ライセンスの URL は 読みに 行かない 文字と 分かる
  {
    const css = fs.readFileSync(path.join(ROOT, "app", "style.css"), "utf8");
    const me = fs.readFileSync(__filename, "utf8");
    const NG_WORDS = /への ?手当て|」への/;   // ★言い方の 型で 見る (★指摘の 文言そのものは ここにも 書かない)
    const where = [["app.js", APPTXT], ["style.css", css], ["index.html", HTML], ["test_flow.js", me.split("// R16 公開物")[0]]].filter(([, t]) => NG_WORDS.test(t)).map(([n]) => n);
    ok(!where.length, "R16 app.js・style.css・index.html・test_flow.js の コメントに 受けた 指摘を そのまま 映した 言い方 0 " + where.join(","));
    const lines = APPTXT.split("\n");
    const lic = lines.findIndex((l) => /creativecommons\.org/.test(l));
    const near = lines.slice(Math.max(0, lic - 3), lic + 1).join("\n");
    ok(lic >= 0 && /読みに 行かない/.test(near), "  札の ライセンスの URL (creativecommons.org) の 前に「読みに 行かない (札に 書く 文字)」の 注記");
    ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(APPTXT), "  app.js に 外へ 読みに 行く 処理 0 (fetch / XHR / sendBeacon / WebSocket / EventSource)");
  }
}

console.log(fail.length ? "FAIL " + fail.length + " 件" : "ALL OK");
process.exit(fail.length ? 1 : 0);
