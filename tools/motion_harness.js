// 動きの 試験 (test_motion.js) 用の 模擬 DOM + 仮想時計 (2026-11-15。見直しの 道具を 写した)
// ★test_flow.js の el() を 下敷きに 拡張。app/ の ファイルは 読むだけ
//   test_flow.js との 違い:
//     ・タイマーは 仮想時計で 時刻順に 回す。clearTimeout が 効く
//     ・<script> の 遅延読み込みを 遅らせる / 失敗させる ことが できる
//     ・タイマーの 中の 例外を 拾って 数える
//     ・好きな 時刻に 利用者の 操作 (タップ・足元の ボタン) を 差し込める
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const html = read("app/index.html");
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const SRC = {
  app: read("app/app.js"), bundle: read("app/data/bundle.js"),
  keys: read("app/data/img/_keys.js"), kin: read("app/data/kin.js"),
};
const fileCache = {};
// ★固定の 乱数 (mulberry32)。★選び方が ランダムに なった (2026-11-15) ので 試験は 種を 決めて 回す
function seeded(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeApp(opt) {
  opt = opt || {};
  let now = 0, seq = 0;
  const q = [];                                      // [time, seq, fn, id]
  const errors = [];
  const setT = (f, ms) => { const id = ++seq; q.push([now + (ms || 0), id, f, id]); return id; };
  const clearT = (id) => { const i = q.findIndex((x) => x[3] === id); if (i >= 0) q.splice(i, 1); };
  const runOne = () => {
    q.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const [t, , f] = q.shift();
    now = Math.max(now, t);
    try { f(); } catch (e) { errors.push({ at: now, e }); }
  };

  let ctxCalls = 0;
  const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 30 }),
                          createLinearGradient: () => ({ addColorStop() {} }) }, {
    get(t, k) { if (k in t) return t[k]; return () => { ctxCalls += 1; }; },
    set() { return true; },
  });
  const byId = {};
  function el(tag) {
    const e = {
      tagName: (tag || "div").toUpperCase(), parent: null,
      children: [], _text: "", _html: "", handlers: {}, style: {}, dataset: {},
      hidden: false, value: "", className: "", src: "", disabled: false,
      classList: { _s: new Set(), add(x) { this._s.add(x); }, remove(x) { this._s.delete(x); }, contains(x) { return this._s.has(x); } },
      get textContent() { return this._text || this.children.map((c) => c.textContent).join(""); },
      set textContent(v) { this._text = String(v); this.children = []; },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); if (v === "") this.children.forEach((c) => { c.parent = null; }), this.children = []; },
      get lastElementChild() { return this.children[this.children.length - 1] || null; },
      get offsetWidth() { return 100; },
      appendChild(c) { c.parent = this; this.children.push(c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parent = null; return c; },
      append(...cs) { cs.forEach((c) => { c.parent = this; this.children.push(c); }); },
      addEventListener(n, f) { (this.handlers[n] = this.handlers[n] || []).push(f); },
      attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      // ★フォーカスの 行き先を 見る (2026-11-15 見直し): focus() で doc.activeElement を 替える / contains() は 親を たどる
      focus() { doc.activeElement = this; }, remove() {}, select() {},
      contains(n) { while (n) { if (n === this) return true; n = n.parent; } return false; },
      closest(sel) { let n = this; while (n) { if (sel === "button" && n.tagName === "BUTTON") return n; if (sel === "a" && n.tagName === "A") return n; n = n.parent; } return null; },
      getBoundingClientRect() { return { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 }; },
      click() { if (this.disabled) return; const ev = { target: this, preventDefault() {}, stopPropagation() { ev._stop = true; } };
                (this.handlers.click || []).forEach((f) => f(ev));
                // 泡立ち (koza の タップ = hurry) を 再現する: 親へ
                let p = this.parent; while (p && !ev._stop) { (p.handlers.click || []).forEach((f) => f(ev)); p = p.parent; } },
      toBlob(cb) { cb({}); },
      getContext() { return ctx; },
      width: 1080, height: 1350,
    };
    return e;
  }
  ids.forEach((i) => {
    const tag = html.match(new RegExp('<([a-z0-9]+)[^>]*id="' + i + '"[^>]*>'));
    byId[i] = el(tag ? tag[1] : "div");
    byId[i].hidden = !!(tag && /\shidden(\s|>|=)/.test(tag[0]));
  });
  // 親子 (泡立ちを 見るため): footbar・sageBox の ボタン → koza
  ["skip", "typeBtn", "other", "baBtn", "restart", "talk", "choices", "tatami", "sageBox", "midashi", "zu", "haikei", "mekuri"].forEach((i) => { byId[i].parent = byId.koza; });
  ["save", "copyCard", "koe", "again", "sourcesBtn", "sources", "card"].forEach((i) => { byId[i].parent = byId.sageBox; });
  ["exportLog", "clearLog", "closeBa", "baBody", "baH"].forEach((i) => { if (byId[i]) byId[i].parent = byId.ba; });
  ["closeKin", "kinBody", "kinNote", "kinH"].forEach((i) => { if (byId[i]) byId[i].parent = byId.kin; });
  byId.koza.tagName = "MAIN";

  const store = Object.assign({}, opt.store || {});
  let lsBroken = !!opt.noStorage;
  const quota = opt.quota || Infinity;
  const ls = {
    getItem: (k) => { if (lsBroken) throw new Error("SecurityError"); return k in store ? store[k] : null; },
    setItem: (k, v) => { if (lsBroken) throw new Error("SecurityError");
      const size = Object.keys(store).reduce((a, x) => a + (x === k ? 0 : String(store[x]).length), 0) + String(v).length;
      if (size > quota) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
      store[k] = String(v); },
    removeItem: (k) => { if (lsBroken) throw new Error("SecurityError"); delete store[k]; },
  };
  const search = opt.search != null ? opt.search : "?date=" + (opt.date || "2026-11-28");
  const loc = { search, href: "file:///C:/x/app/index.html" + search, _nav: null,
                reload() { this._reloaded = true; } };
  Object.defineProperty(loc, "hrefSet", { set(v) { this._nav = v; } });
  const loaded = [], scriptLog = [];
  const head = el("head");
  head.appendChild = (s) => {
    const src = s.src || "";
    scriptLog.push({ at: now, src });
    const delay = typeof opt.loadDelay === "function" ? opt.loadDelay(src) : (opt.loadDelay || 0);
    const fail = opt.failLoad && opt.failLoad(src);
    const go = () => {
      const f = path.join(ROOT, "app", src);
      if (!fail && fs.existsSync(f)) {
        if (!fileCache[f]) fileCache[f] = fs.readFileSync(f, "utf8");
        try { load(fileCache[f]); } catch (e) { errors.push({ at: now, e }); }
        loaded.push({ at: now, src });
        if (s.onload) s.onload();
      } else if (s.onerror) s.onerror();
    };
    if (opt.syncLoad) go(); else setT(go, delay);
    return s;
  };
  const sizes = opt.sizes || null;              // class → px (打ち出しの 速さの 見積もり)
  const win = {
    scrollTo(x, y) { (this._scrollTo = this._scrollTo || []).push([x, y]); }, scrollBy() {}, innerHeight: 800,   // ★scrollTo は 記録する (もう一席で 頭へ 戻すかを 見る) confirm: () => (opt.confirm !== false),
    matchMedia: (qq) => ({ matches: (!!opt.reduce && /prefers-reduced-motion:\s*reduce/.test(qq)) || (!!opt.mobile && /max-width/.test(qq)) }),
    requestAnimationFrame: (f) => f(),
    localStorage: ls, location: loc,
    URL: { createObjectURL: () => "blob:", revokeObjectURL() {} },
    history: { replaceState() {}, scrollRestoration: "auto" },
    navigator: { clipboard: null },
  };
  // ★選び方の 乱数 (app.js の Core.rng が window.HANASHI_RNG を 見る)。opt.rng / opt.seed で 替える
  win.HANASHI_RNG = opt.rng || seeded(opt.seed == null ? 1 : opt.seed);
  if (sizes) win.getComputedStyle = (n) => ({ fontSize: String(sizes(n.className || "")) + "px" });
  const doc = { createElement: el, getElementById: (i) => byId[i] || null, body: el("body"), head, execCommand: () => true, activeElement: null };
  doc.activeElement = doc.body;
  const Img = function () { this.complete = true; this.naturalWidth = 10; };
  const load = (src) => new Function("window", "document", "localStorage", "location", "setTimeout",
    "clearTimeout", "requestAnimationFrame", "Image", "self", "history", "getComputedStyle", "navigator", "URLSearchParams", "URL", src)
    .call(win, win, doc, win.localStorage, loc, setT, clearT, win.requestAnimationFrame, Img, win, win.history,
          win.getComputedStyle, win.navigator, URLSearchParams, win.URL);
  let bootErr = null;
  try {
    load(SRC.bundle); load(SRC.keys); load(SRC.kin);
    if (opt.patch) opt.patch(win);
    load(opt.srcPatch ? opt.srcPatch(SRC.app) : SRC.app);
  } catch (e) { bootErr = e; }

  const api = {
    win, doc, byId, store, errors, bootErr, loaded, scriptLog, get now() { return now; },
    get pending() { return q.length; },
    breakStorage(v) { lsBroken = v; },
    // 時計を ms 進める (その間の タイマーを 回す)
    advance(ms) { const end = now + ms; while (q.length) { q.sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (q[0][0] > end) break; runOne(); } now = end; },
    // タイマーが 尽きるまで (= 客の 操作待ち)
    settle(limit) { let n = 0; while (q.length && n < (limit || 200000)) { runOne(); n += 1; } return n; },
    choices() {
      const out = [];
      (function walk(n) { n.children.forEach((c) => {
        if (c.handlers.click && c.handlers.click.length && c.tagName === "BUTTON") out.push(c);
        else if (c.handlers.submit) out.push(c); else walk(c); }); })(byId.choices);
      return out;
    },
    labels() { return api.choices().map((c) => c.tagName === "FORM" ? "(form)" : c.textContent); },
    pick(label) {
      const cs = api.choices();
      const c = typeof label === "number" ? cs[Math.min(label, cs.length - 1)] : cs.find((x) => x.textContent.indexOf(label) >= 0);
      if (!c) throw new Error("選択肢が 無い: " + label + " / ある: " + api.labels().join(","));
      if (c.tagName === "FORM") throw new Error("form");
      try { c.click(); } catch (e) { errors.push({ at: now, e }); }
      return c;
    },
    // ★キーボードで 選ぶ (フォーカスを 当ててから 押す)
    pickKb(label) {
      const cs = api.choices();
      const c = typeof label === "number" ? cs[Math.min(label, cs.length - 1)] : cs.find((x) => x.textContent.indexOf(label) >= 0);
      if (!c) throw new Error("選択肢が 無い: " + label + " / ある: " + api.labels().join(","));
      c.focus();
      try { c.click(); } catch (e) { errors.push({ at: now, e }); }
      return c;
    },
    key(id, k) { try { (byId[id].handlers.keydown || []).forEach((f) => f({ key: k, shiftKey: false, preventDefault() {}, stopPropagation() {} })); } catch (e) { errors.push({ at: now, e }); } },
    submit(text) {
      const f = api.choices().find((c) => c.tagName === "FORM");
      if (!f) throw new Error("form が 無い");
      const inp = f.children.find((x) => x.tagName === "INPUT");
      inp.value = text;
      try { f.handlers.submit.forEach((h) => h({ preventDefault() {} })); } catch (e) { errors.push({ at: now, e }); }
    },
    tap() { try { const ev = { target: byId.talk, preventDefault() {}, stopPropagation() {} }; byId.koza.handlers.click.forEach((f) => f(ev)); } catch (e) { errors.push({ at: now, e }); } },
    click(id) { try { byId[id].click(); } catch (e) { errors.push({ at: now, e }); } },
    talk() { return byId.talk.children.map((c) => c.textContent); },
    talkEls() { return byId.talk.children; },
    log() { try { const v = JSON.parse(store["hanashiyama.log.v1"] || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
    shown() { return api.log().filter((e) => e.event === "shown").map((e) => e.story); },
    bg() { return byId.haikei.hidden ? null : { src: String(byId.haikeiImg.src).slice(0, 40), label: byId.haikeiLabel.textContent }; },
    get ctxCalls() { return ctxCalls; },
  };
  return api;
}
module.exports = { makeApp, ROOT, SRC, seeded };
