// 動きの 試験 (2026-11-15。見直し ①②⑤⑧ で 見つかった 崩れを 二度と 出さない ため)
//   node tools/test_motion.js            … いまの app.js を 試す
//   node tools/test_motion.js 古い.js    … 別の app.js を 試す (★直す 前の 版で NG が 出る ことを 確かめる 用)
// ★模擬 DOM + 仮想時計 (motion_harness.js)。タイマーは 時刻順に 回し、clearTimeout も 効く
const fs = require("fs");
const { makeApp } = require("./motion_harness");
const alt = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : null;
// ★2026-11-15「次へ」(長く 読んだ ところで 止める): ★settle は「次へ」を 押して 進む (keepPause で 止まる)
const mk = (o) => {
  const a = makeApp(Object.assign(alt ? { srcPatch: () => alt } : {}, o));
  const s0 = a.settle.bind(a);
  a.settle = (lim) => {
    let n = 0;
    for (let k = 0; k < 200; k += 1) {
      n += s0(lim);
      const ls = a.labels();
      if (!(o && o.keepPause) && ls.length === 1 && ls[0] === "次へ") { a.pick("次へ"); continue; }
      return n;
    }
    return n;
  };
  return a;
};
const fail = [];
const ok = (c, m) => { console.log((c ? "  OK   " : "  NG   ") + m); if (!c) fail.push(m); };
const isImg = (s) => /img\/(?!_keys)/.test(s);
const has = (c, k) => new RegExp("(^| )" + k + "( |$)").test(c.className || "");
const txt = (c) => (c._html ? c._html.replace(/<[^>]+>/g, "") : c.textContent) || "";
const END = /[。」?？！!…）)』]$/;
// ★実演の 筋 (命日)
function toFirstSeat(a) {
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "茨城県"]) { a.pick(l); a.settle(); }
  a.pick("思う");
}
const partial = (a) => {
  const t = a.talkEls().filter((c) => has(c, "line") && !has(c, "kyaku"));
  return t.filter((c, i) => i < t.length - 1 && txt(c) && !END.test(txt(c))).length;
};

// ① 語りの 途中で「別の噺」→ 席が 二重に 走らない・打ちかけの 行が 残らない
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.advance(2500); a.click("other"); a.settle();
  const sh = a.shown();
  ok(sh.length === 2 && sh[0] === "T-1128", "語りの 途中で 別の噺 → 席は 2 つ だけ (" + sh.join(">") + ")");
  ok(partial(a) === 0, "語りの 途中で 別の噺 → 打ちかけの 行が 残らない (" + partial(a) + ")");
  ok(a.errors.length === 0, "語りの 途中で 別の噺 → 例外 0");
}

// ② 早送り (既定の 一字ずつ) は 数回で 問いに 届く
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a);
  let p = 0;
  while (!a.labels().length && p < 50) { a.advance(600); a.click("skip"); p += 1; }
  ok(p <= 4, "一字ずつ でも 早送り 4 回 以内で 問いに 届く (" + p + " 回)");
  ok(a.labels().indexOf("吉田松陰") >= 0, "早送りで 問いを 飛ばさない (選択肢が 出ている)");
}

// ③ 写真の 読み込み中に 同じ 群を 頼んでも、読み終わりを 待つ (命日の 胸像が 出る)
for (const d of [300, 1500]) {
  const a = mk({ date: "2026-11-28", store: { "hanashiyama.type.v1": "0" }, loadDelay: (s) => (isImg(s) ? d : 0) });
  toFirstSeat(a);
  a.click("skip"); a.click("skip");
  a.settle();
  const s0 = a.talkEls().find((c) => has(c, "midashi-sr") && c.dataset.scene === "0");
  ok(!!s0 && s0.dataset.shown === "1", "一度に + 早送り・読み込み " + d + "ms でも 命日の 1 場面目に 写真が 出る");
}

// ④ サゲの 瞬間、直前の 語り (答え) は 畳まれて いない / サゲは 札まで 畳まれない
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.settle();
  a.pick("吉田松陰");
  let atSage = null;
  for (let k = 0; k < 4000 && a.byId.sageBox.hidden; k += 1) {
    a.advance(50);
    if (a.labels().length === 1 && a.labels()[0] === "次へ") a.pick("次へ");
    const ks = a.talkEls();
    const si = ks.findIndex((c) => has(c, "sage"));
    if (si >= 0 && atSage === null) {
      const prev = ks.slice(0, si).filter((c) => !has(c, "ma") && !has(c, "sr") && !has(c, "sensu") && !has(c, "yokoku") && !/ここからがオチ/.test(txt(c))).pop();   // ★予告の 一行は 語りに 数えない
      atSage = prev ? !has(prev, "tatami") : false;
    }
  }
  a.settle();
  ok(atSage === true, "サゲの 瞬間、直前の 語りが 見えている");
  const sg = a.talkEls().find((c) => has(c, "sage"));
  ok(!a.byId.sageBox.hidden && !!sg && !has(sg, "tatami"), "札が 出た とき、サゲの 行は 畳まれていない");
}

// ⑤ 乱打 (タップ・早送り・別の噺・もう一席・文字の 出し方) で 例外・行き止まり・打ちかけ 0
{
  let seed = 4242;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let err = 0, stuck = 0, part = 0, runs = 0;
  for (let r = 0; r < 30; r += 1) {
    const a = mk({ date: rnd() < 0.5 ? "2026-11-28" : "2026-07-15", loadDelay: (s) => (/img\/(?!_)/.test(s) ? Math.floor(rnd() * 400) : 0) });
    a.click("open");
    for (let st = 0; st < 3000; st += 1) {
      a.advance(Math.floor(rnd() * 900));
      const x = rnd();
      if (x < 0.35) a.tap();
      else if (x < 0.45) a.click("skip");
      else if (x < 0.48) a.click("typeBtn");
      else if (x < 0.52) a.click(a.byId.sageBox.hidden ? "other" : "again");
      const ls = a.labels();
      if (ls.length && rnd() < 0.5) {
        if (ls.indexOf("(form)") >= 0) a.submit(rnd() < 0.5 ? "" : "つつじ"); else a.pick(Math.floor(rnd() * ls.length));
      }
      if (a.shown().length >= 3) break;
      const last = a.talkEls().slice(-1)[0];
      if (!a.pending && !a.labels().length && a.byId.sageBox.hidden && a.shown().length && !/ごゆるりと|種切れ/.test(last ? txt(last) : "")) { stuck += 1; break; }
    }
    runs += 1;
    err += a.errors.length;
    part += partial(a);
  }
  ok(err === 0, "乱打 " + runs + " 回: 例外 0 (" + err + ")");
  ok(stuck === 0, "乱打 " + runs + " 回: 行き止まり 0 (" + stuck + ")");
  ok(part === 0, "乱打 " + runs + " 回: 打ちかけの 行 0 (" + part + ")");
}

// ⑥ 読み上げ (見直し): 打ち出し中の 行は aria-hidden、全文は 読み上げ用の 行に 先に 1 回
{
  const a = mk({ date: "2026-11-28" });
  a.click("open");
  a.advance(120);                                   // ★1 行目を 打っている 途中
  const ks = a.talkEls();
  const vis = ks.filter((c) => has(c, "line")).pop();
  const sr = vis ? ks[ks.indexOf(vis) - 1] : null;
  const typed = vis ? vis.textContent : "";
  ok(!!vis && vis.getAttribute("aria-hidden") === "true", "打ち出し中の 行は 読み上げから 外す (aria-hidden)");
  ok(!!sr && has(sr, "sr") && /はなし山と申します。$/.test(sr.textContent) && typed.length < sr.textContent.length,
     "打ち出し中でも 読み上げ用の 行には 全文が 入っている (打った " + typed.length + " 字 / 全文 " + (sr ? sr.textContent.length : 0) + " 字)");
  a.settle();
  const yomi = a.talkEls().filter((c) => has(c, "yomi")).length, lines = a.talkEls().filter((c) => has(c, "line") && !has(c, "kyaku")).length;
  ok(yomi === lines && lines >= 3, "読み上げ用の 行は 打つ 行と 同じ 数 (書き換えずに 1 回ずつ: " + yomi + " / " + lines + ")");
}

// ⑦ フォーカス (見直し): キーボードで 選んだら、次の 選択肢の 先頭へ 移る / 幕を 開けたら 高座へ
{
  const a = mk({ date: "2026-11-28" });
  a.byId.open.focus();
  a.click("open");
  ok(a.doc.activeElement === a.byId.koza, "幕を 開けたら フォーカスは 高座へ (隠れた ボタンに 残さない)");
  a.settle();
  a.pickKb("いや、べつに");
  a.settle();
  const fe = a.doc.activeElement;
  ok(!!fe && fe.tagName === "BUTTON" && a.byId.choices.contains(fe) && fe.textContent === a.labels()[0],
     "キーボードで 選ぶと 次の 選択肢の 先頭へ フォーカス (" + (fe && fe.textContent) + ")");
  // ★指で 押した (フォーカスの 付かない 押し方) ときは 動かさない
  const b = mk({ date: "2026-11-28" });
  b.click("open"); b.settle(); b.doc.activeElement = b.doc.body;
  b.pick("いや、べつに"); b.settle();
  ok(b.doc.activeElement === b.doc.body, "指で 押した ときは フォーカスを 動かさない");
}

// ⑧ パネル (見直し): 開くと 中へ / Esc で 閉じて 呼んだ ボタンへ 戻す
{
  const a = mk({ date: "2026-11-28" });
  a.click("open"); a.settle();
  a.byId.baBtn.focus();
  a.click("baBtn");
  ok(!a.byId.ba.hidden && a.doc.activeElement === a.byId.ba, "場を 開くと フォーカスは パネルへ");
  a.key("ba", "Escape");
  ok(a.byId.ba.hidden && a.doc.activeElement === a.byId.baBtn, "Esc で 閉じ、フォーカスは「場」の ボタンへ 戻る");
  const b = mk({ date: "2026-11-28" });
  b.byId.kinList.focus();
  b.click("kinList");
  b.click("closeKin");
  ok(b.byId.kin.hidden && b.doc.activeElement === b.byId.kinList, "全国の園を 閉じたら「全国の動物園から」へ 戻る");
}

// ⑨ もう一席 (見直し): 札の 箱が 隠れても フォーカスは 高座へ → 次の 選択肢の 先頭へ
{
  const a = mk({ date: "2026-11-28", store: { "hanashiyama.type.v1": "0" } });
  toFirstSeat(a); a.settle();
  a.pick("吉田松陰"); a.settle();
  ok(!a.byId.sageBox.hidden, "札まで 進んだ");
  a.byId.again.focus();
  a.click("again");
  ok(a.doc.activeElement === a.byId.koza, "もう一席: 隠れる 札の 箱から フォーカスを 高座へ");
  a.settle();
  const fe = a.doc.activeElement;
  ok(a.labels().length > 0 && !!fe && a.byId.choices.contains(fe), "もう一席の あと 次の 選択肢の 先頭へ (" + (fe && fe.textContent) + ")");
}

// ⑩ 進行の めくり (見直し): 本題の 途中で「本題」が aria-current=step
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a);
  let seen = false;
  for (let k = 0; k < 2000 && !seen; k += 1) { a.advance(50); if (a.labels().length === 1 && a.labels()[0] === "次へ") a.pick("次へ"); seen = a.byId.stg1.className === "now"; }
  ok(seen && a.byId.stg1.getAttribute("aria-current") === "step" && a.byId.stg0.getAttribute("aria-current") === "false",
     "本題の 途中: 「本題」に aria-current=step、「まくら」は false");
}

// ⑪ 再訪で「別のところから」(見直し / ): 「二つだけ」と 言った とおり 問いは 二つで 噺へ
{
  const a = mk({ date: "2026-11-28", store: { "hanashiyama.pref.v1": "茨城県" } });
  a.click("open"); a.settle();
  a.pick("いや、べつに"); a.settle();
  a.pick("別のところから"); a.settle();
  a.pick("この福井から"); a.settle();
  const said = a.talk().join(" ");
  const sh = a.log().find((e) => e.event === "shown");
  ok(/二つだけ伺います/.test(said) && !!sh && sh.mondo === 2 && !/噺の前に、ひとつ/.test(said),
     "再訪で 別のところから: 問いは 二つで 噺へ (" + (sh ? sh.mondo : "噺に 入らず") + ")");
}

// ⑦ 「はじめから」: 覚えていた 県を 忘れる / ?date= は 残す (2026-11-15 見直し・見直し)
{
  const a = mk({ date: "2026-11-28", store: { "hanashiyama.pref.v1": "茨城県" } });
  a.click("open"); a.settle();
  a.click("restart");
  const loc = a.win.location;
  ok(!a.store["hanashiyama.pref.v1"] && !(a.win.localStorage.getItem && a.win.localStorage.getItem("hanashiyama.pref.v1")),
     "はじめから で 覚えていた 県を 忘れる");
  ok(/[?&]date=2026-11-28/.test(String(loc.href)) || loc._reloaded === true, "はじめから でも ?date= を 残す (" + String(loc.href).replace(/^.*\//, "") + ")");
}

// ⑧ 問いの 文は 前の 文から 行を 改める (2026-11-15 見直し)
{
  const a = mk({ date: "2026-11-28" });
  a.click("open"); a.settle(); a.pick("いや、べつに"); a.settle();
  const q = a.talkEls().map(txt).find((s) => /どちらからお越しで/.test(s)) || "";
  ok(/。\nどちらからお越しで/.test(q), "問いの 文の 前で 改行する (" + JSON.stringify(q).slice(0, 40) + ")");
}

// ⑨ 写真の フェード (0.8 秒) の 間は 文字を 止める (2026-11-15 見直し)
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a);
  const cls = () => a.byId.haikei.className || "";
  let inN = null, inN2 = null, outN = null, outN2 = null;
  let lastSrc = String(a.byId.haikeiImg.src || "");   // ★いま 出ている 写真 (前段の 1 枚)。★替わった 瞬間を 見る
  for (let k = 0; k < 4000 && (inN2 === null || outN2 === null); k += 1) {
    a.advance(20);
    if (a.labels().length) a.pick(0);
    const chars = () => a.talkEls().reduce((s, c) => s + String(c.textContent || "").length, 0);   // ★打ち出した 字の 数
    const n = chars();
    const src = String(a.byId.haikeiImg.src || "");
    const changed = src && src !== lastSrc && !a.byId.haikei.hidden;
    lastSrc = src;
    if (inN === null && changed) { inN = n; a.advance(700); inN2 = chars(); continue; }
    if (inN !== null && outN === null && /(^| )kieru( |$)/.test(cls())) { outN = n; a.advance(700); outN2 = chars(); }
  }
  ok(inN !== null && inN === inN2, "写真が 入る フェードの 間 字は 増えない (" + inN + " → " + inN2 + ")");
  ok(outN !== null && outN === outN2, "写真が 消える フェードの 間 字は 増えない (" + outN + " → " + outN2 + ")");
}

// ⑩ 客の 相槌 + 自動の 間 (「次へ」の 代わり。2026-11-15 作者の判断): 長く 読んだら 相槌で 止め、2〜5 秒で 自動で 続く /
//    タップで 待たずに 続く / 早送りは 越えて 問いまで / ボタンは 出さない
{
  const isAiz = (c) => /(^| )aizuchi( |$)/.test(c.className || "");
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a);
  let at = null;
  for (let k = 0; k < 3000 && at === null; k += 1) { a.advance(20); if (a.talkEls().some(isAiz)) at = a.talkEls().length; }
  ok(at !== null, "命日の 席で 長く 読んだ ところに 客の 相槌が 出る");
  ok(!a.labels().some((l) => l === "次へ"), "「次へ」の ボタンは 出さない");
  a.advance(1500);
  ok(a.talkEls().length === at, "相槌の あと 少し (1.5 秒) は 語りが 進まない");
  a.advance(4000);
  ok(a.talkEls().length > at, "相槌の あと 自動で 続く (5.5 秒 以内)");
  // ★同じ 筋で「タップする」と「待つ」を 比べる (★次が 写真の 場面だと 一拍が 先に 来るので、増えるまでの 時間で 見る)
  const until = (tap) => {
    const x = mk({ date: "2026-11-28" });
    toFirstSeat(x);
    let n = null;
    for (let k = 0; k < 3000 && n === null; k += 1) { x.advance(20); if (x.talkEls().some(isAiz)) n = x.talkEls().length; }
    if (tap) x.tap();
    let ms = 0;
    while (x.talkEls().length <= n && ms < 10000) { x.advance(50); ms += 50; }
    return ms;
  };
  const tTap = until(true), tWait = until(false);
  ok(tTap + 1000 < tWait, "相槌の 間は タップで 待たずに 続く (タップ " + tTap + "ms / 待つ " + tWait + "ms)");
  const c = mk({ date: "2026-11-28" });
  toFirstSeat(c);
  let p = 0;
  while (!c.labels().some((l) => l === "吉田松陰") && p < 20) { c.advance(600); c.click("skip"); p += 1; }
  ok(c.labels().indexOf("吉田松陰") >= 0, "早送りは 相槌の 間も 越えて 問いまで 進む (" + p + " 回)");
}

// ---- 県の つなぎを 前段 (県を 伺った 直後) へ 移した (2026-11-15): 早送り・タップを 乱打しても 順が 崩れない ----
{
  const a = mk({ date: "2026-11-28" });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東"]) { a.pick(l); a.settle(); }
  a.pick("埼玉県");
  for (let k = 0; k < 8; k += 1) { a.advance(120); if (k % 2) a.click("skip"); else a.tap(); }
  a.settle();
  const T = a.talkEls().filter((c) => has(c, "line") && !has(c, "kyaku")).map(txt);
  const iPb = T.findIndex((t) => t.indexOf("川の国、埼玉県のお客さんでございますな。") === 0);
  const iLast = T.findIndex((t) => t.indexOf("そのお国からこの小さな山まで、話はひと跳びでございます") === 0);
  const iToi = T.findIndex((t) => /^噺の前に、ひとつ。/.test(t));
  ok(!a.errors.length && iPb >= 0 && iLast > iPb && iToi > iLast && T.filter((t) => /^噺の前に/.test(t)).length === 1 && a.labels().indexOf("思う") >= 0,
     "県の つなぎは 早送り・タップを 乱打しても 思い込みの 問いの 前に 揃って 1 回 (つなぎ " + iPb + "〜" + iLast + " / 問い " + iToi + ")");
  ok(partial(a) === 0 && !T.some((t) => /珍しいお客さんに、ひとつ。$/.test(t)), "県の つなぎの 行は 打ちかけで 残らず、最後の「では、…ひとつ。」は 言わない");
  a.pick("思う"); a.settle();
  ok(a.shown()[0] === "T-1128" && !a.errors.length, "その あと 一席目 (T-1128) に 入る");
}

// ⑪ オチの 註 (↳ 西山公園の ○○の こと): サゲの すぐ 下 / 札まで 畳まない (2026-11-15 作者の案)
//   ★2026-11-20: T-1128 の 註は「西山公園のはじまりの庭」(追い足しの「嚮陽渓」と 重ねない)
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.settle();
  a.pick("吉田松陰"); a.settle();
  const ks = a.talkEls();
  const si = ks.findIndex((c) => /(^| )sage( |$)/.test(c.className || ""));
  const note = ks[si + 1];
  ok(!!note && /(^| )ochi-what( |$)/.test(note.className || "") && /^↳ 西山公園の.*はじまり.*のこと$/.test(String(note.textContent)),
     "サゲの すぐ 下に オチの 註 (" + (note ? String(note.textContent) : "-") + ")");
  ok(!a.byId.sageBox.hidden && note && !/(^| )tatami( |$)/.test(note.className || ""), "札が 出た とき、オチの 註は 畳まれていない");
}

// ⑫ 札の あと「もう一席」: 新しい 席の 頭を 画面の 上へ 送る (2026-11-15 見直しの 声「画面が ずれた まま」)
//   ★2026-11-22: 前の 席の 語りは 畳まない (上へ 戻れば 読める)
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.settle();
  a.pick("吉田松陰"); a.settle();
  const nBefore = a.talkEls().length;
  const s0 = (a.win._scrollTo || []).length;
  a.click("again");
  const furiN = () => a.talkEls().filter((c) => /(^| )furi( |$)/.test(c.className || "")).length;
  const f0 = furiN();
  for (let k = 0; k < 2000 && furiN() === f0; k += 1) a.advance(20);
  ok((a.win._scrollTo || []).length > s0, "もう一席で 新しい 席の 頭へ 送る (scrollTo)");
  ok(a.talkEls().some((c) => has(c, "seat-start") && !has(c, "sr")), "席の 頭の 印は 高さ 0 の 行 (位置を 測れる。sr では ない)");
  const old = a.talkEls().slice(0, nBefore).filter((c) => /(^| )line( |$)/.test(c.className || ""));
  const open = old.filter((c) => !/(^| )tatami( |$)/.test(c.className || ""));
  ok(old.length > 5 && open.length === old.length, "もう一席でも 前の 席の 語りは 畳まない (残り " + open.length + " / " + old.length + ")");
}

// ⑬ 札の 写真は オチの 註が 指す もの (2026-11-20 作者の判断): 命日 → 嚮陽庭園 の 札用の 写真を 読む
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.settle();
  a.pick("吉田松陰"); a.settle();
  const srcs = (a.scriptLog || []).map((s) => String(s.src));
  ok(srcs.some((s) => /card_kyoyo_teien\.js$/.test(s)) && !srcs.some((s) => /card_tsutsuji\.js$/.test(s)),
     "命日の 札は 嚮陽庭園の 写真 (読んだ 札の 群: " + srcs.filter((s) => /card_/.test(s)).map((s) => s.replace(/^.*\//, "")).join(",") + ")");
}

// ---- 2026-11-21 組版・間の 直し (作者の判断。見直し r7 の 1・9・案B) --------------------------------------
//   ★node tools/test_motion.js 直す前の.js で ここが NG に なる ことで 効きを 見る
const hasC = (c, k) => new RegExp("(^| )" + k + "( |$)").test((c && c.className) || "");
const findEl = (a, k, from) => a.talkEls().slice(from || 0).find((c) => hasC(c, k));
/** 行が 打ち終わった (land = 飾りつきの 全文が 入った) 時刻 */
const landed = (c) => !!(c && c._html);
// ★実演の 筋 (埼玉県) で 二席目 (P-埼玉県) の 4 択まで
function toSaitama(a) {
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "埼玉県"]) { a.pick(l); a.settle(); }
  a.pick("思う"); a.settle();
  a.pick("吉田松陰"); a.settle();
  a.click("again"); a.settle();
  for (let k = 0; k < 20 && a.labels().length && a.labels().indexOf("3園") < 0; k += 1) { a.pick(0); a.settle(); }
}
/** サゲ → 註 → 推量 の 時刻 (5ms 刻み) */
function yoinTimes(a, startIdx) {
  let sage = null, tLand = null, tNote = null, tSui = null;
  for (let k = 0; k < 6000 && tSui == null; k += 1) {
    a.advance(5);
    if (!sage) sage = findEl(a, "sage", startIdx);
    if (sage && tLand == null && landed(sage)) tLand = a.now;
    if (tLand != null && tNote == null && findEl(a, "ochi-what", startIdx)) tNote = a.now;
    if (tNote != null && tSui == null && findEl(a, "suiryo", startIdx)) tSui = a.now;
  }
  return { tLand, tNote, tSui, note: tNote - tLand, sui: tSui - tNote };
}
// ⑭ サゲの あとの 余韻: 打ち終えてから 註まで 2.4 秒・註から 推量まで 1.2 秒 (一字ずつ / 一度に / 動きを 減らす)
for (const [name, o] of [["一字ずつ", {}], ["一度に", { store: { "hanashiyama.type.v1": "0" } }], ["動きを 減らす", { reduce: true }]]) {
  const a = mk(Object.assign({ date: "2026-11-28" }, o));
  toFirstSeat(a); a.settle();
  a.pick("吉田松陰");
  const y = yoinTimes(a, 0);
  ok(y.tLand != null && Math.abs(y.note - 2400) <= 10 && Math.abs(y.sui - 1200) <= 10,
     "⑭ " + name + ": サゲを 打ち終えて 註まで " + y.note + "ms (2400)・註から 推量まで " + y.sui + "ms (1200)");
  a.settle();
  ok(!a.errors.length && !a.byId.sageBox.hidden, "  " + name + ": その あと 札まで 進む (例外 " + a.errors.length + ")");
}
// ⑭ 余韻は タップで 飛ばせる (1 回で 註・もう 1 回で 推量)。★早送りは 1 回で 札まで
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.settle();
  a.pick("吉田松陰");
  let sage = null;
  for (let k = 0; k < 6000 && !(sage && landed(sage)); k += 1) { a.advance(5); sage = sage || findEl(a, "sage"); }
  a.advance(800);                                   // ★行末の 間 (0.7 秒) の あと = 余韻の 中
  const n0 = !!findEl(a, "ochi-what");
  a.tap();
  const n1 = !!findEl(a, "ochi-what"), s1 = !!findEl(a, "suiryo");
  a.tap();
  const s2 = !!findEl(a, "suiryo");
  ok(!n0 && n1 && !s1 && s2, "⑭ 余韻の 中の タップ: 1 回目で 註 (推量は まだ)・2 回目で 推量 (" + [n0, n1, s1, s2].join(",") + ")");
  const b = mk({ date: "2026-11-28" });
  toFirstSeat(b); b.settle();
  b.pick("吉田松陰");
  let sg = null;
  for (let k = 0; k < 6000 && !(sg && landed(sg)); k += 1) { b.advance(5); sg = sg || findEl(b, "sage"); }
  b.click("skip"); b.advance(100);
  ok(!b.byId.sageBox.hidden && !b.errors.length, "⑭ サゲの あと 早送り 1 回で 余韻を 越えて 札まで");
}
// ⑮ 打ち出しの 速さ: 倍率の ある 行は 字の 大きさの 補正で 1 倍 未満に しない / サゲの 中の「、」は 600ms
{
  const PX = { sage: 25.9, kotae: 22.1, makura: 22.7 };
  const sizes = (c) => { const s = " " + c + " "; for (const k of Object.keys(PX)) if (s.indexOf(" " + k + " ") >= 0) return PX[k]; return 18.9; };
  const a = mk({ date: "2026-11-28", sizes });
  toFirstSeat(a); a.settle();
  // ★文字ごとの 出た 時刻 (1ms 刻み)
  const gaps = (k) => {
    let el = null, last = 0, tPrev = null; const g = [];
    for (let n = 0; n < 20000; n += 1) {
      a.advance(1);
      el = el || findEl(a, k);
      if (!el) continue;
      if (landed(el)) break;
      const t = String(el.textContent || "");
      if (t.length > last) { if (tPrev != null) g.push([t[last - 1], a.now - tPrev]); last = t.length; tPrev = a.now; }
    }
    return g;
  };
  const med = (xs) => { const s = xs.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const kana = (g) => g.filter(([c]) => /[ぁ-ゖ]/.test(c)).map(([, w]) => w);
  a.pick("吉田松陰");
  const gk = gaps("kotae");
  const gs = gaps("sage");
  const toten = gs.filter(([c]) => c === "、").map(([, w]) => w);
  ok(med(kana(gk)) >= 46, "⑮ 返し (22.1px): かな 1 字 " + med(kana(gk)) + "ms (32 × 1.45 = 46 を 割らない)");
  ok(med(kana(gs)) >= 51, "⑮ サゲ (25.9px): かな 1 字 " + med(kana(gs)) + "ms (32 × 1.6 = 51 を 割らない)");
  ok(toten.length >= 2 && toten.every((w) => w === 600), "⑮ サゲの 中の「、」は 600ms (" + toten.join(",") + ")");
  // ★対照: 倍率の 無い 行 (地の文 18.9px = 32ms・まくら 22.7px は 補正で 速い まま) は 変えない
  const b = mk({ date: "2026-11-28", sizes });
  b.click("open");
  const gm = (() => { const g = []; let el = null, last = 0, tp = null;
    for (let n = 0; n < 20000; n += 1) { b.advance(1); el = el || b.talkEls().find((c) => hasC(c, "line") && hasC(c, "shi"));
      if (!el) continue; if (landed(el)) break; const t = String(el.textContent || "");
      if (t.length > last) { if (tp != null) g.push([t[last - 1], b.now - tp]); last = t.length; tp = b.now; } } return g; })();
  ok(med(kana(gm)) === 32, "  対照: 地の文 (18.9px) の かな 1 字は 32ms の まま (" + med(kana(gm)) + ")");
}
// ⑯ 正解の 1 行 (案B): 外れの 返し (hazure) を 打ち終えてから 正解まで 900ms (返しの 前の 一拍と 同じ)
{
  const a = mk({ date: "2026-11-28" });
  toSaitama(a);
  ok(a.shown()[1] === "P-埼玉県" && a.labels().indexOf("3園") >= 0, "⑯ 実演の 筋で 二席目 P-埼玉県 の 4 択 (" + a.shown().join(">") + ")");
  const from = a.talkEls().length;
  const tPick = a.now;
  a.pick("3園");
  let k0 = null, tK = null, tKL = null, tS = null;
  for (let n = 0; n < 4000 && tS == null; n += 1) {
    a.advance(5);
    k0 = k0 || findEl(a, "kotae", from);
    if (k0 && tK == null) tK = a.now;
    if (k0 && tKL == null && landed(k0)) tKL = a.now;
    if (tKL != null && findEl(a, "seikai", from)) tS = a.now;
  }
  ok(!!k0 && hasC(k0, "hazure"), "⑯ 外れの 返しの cls に hazure (" + (k0 ? k0.className : "-") + ")");
  ok(tS != null && Math.abs(tS - tKL - 900) <= 10, "⑯ 返しを 打ち終えて 正解まで " + (tS - tKL) + "ms (900。返しの 前の 一拍 " + (tK - tPick) + "ms)");
  const ks = a.talkEls().slice(from).filter((c) => !hasC(c, "sr"));
  const iK = ks.indexOf(k0);
  ok(iK >= 0 && hasC(ks[iK + 1], "seikai"), "⑯ 返しと 正解の 間に 空き (ma) を 挟まない (" + (ks[iK + 1] ? ks[iK + 1].className : "-") + ")");
  a.settle();
  ok(!a.errors.length && !a.byId.sageBox.hidden, "  その あと 札まで 進む");
}

// ⑰ あて推量の「……」(表示だけ。2026-11-21 作者の判断): 打ち出しは「……」で 約 0.8 秒 止まる / タップで 越えられる / 一度に 出す でも「……」は 出る
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.settle();
  a.pick("吉田松陰");
  let el = null, last = 0, tPrev = null, ma = null;
  for (let n = 0; n < 30000; n += 1) {
    a.advance(1);
    el = el || findEl(a, "suiryo");
    if (!el) continue;
    if (landed(el)) break;
    const t = String(el.textContent || "");
    if (t.length > last) {
      if (tPrev != null && t[last - 1] === "…" && t[last - 2] === "…") ma = a.now - tEll;
      if (t[t.length - 1] === "…" && t[t.length - 2] !== "…") var tEll = a.now;
      last = t.length; tPrev = a.now;
    }
  }
  ok(ma != null && ma >= 790 && ma <= 820, "⑰ 推量の「……」で 打ち出しが 止まる " + ma + "ms (約 800)");
  const b = mk({ date: "2026-11-28", store: { "hanashiyama.type.v1": "0" } });
  toFirstSeat(b); b.settle(); b.pick("吉田松陰"); b.settle();
  const s2 = findEl(b, "suiryo");
  ok(!!s2 && /……/.test(s2._html || "") && /<strong class="point">/.test(s2._html || ""), "  一度に 出す でも「……」と 太字の ポイントが 出る");
  const c = mk({ date: "2026-11-28" });
  toFirstSeat(c); c.settle(); c.pick("吉田松陰");
  let e3 = null;
  for (let n = 0; n < 30000; n += 1) { c.advance(1); e3 = e3 || findEl(c, "suiryo"); if (e3 && /……$/.test(String(e3.textContent || ""))) break; }
  c.tap();
  ok(!!e3 && landed(e3) && /ないでしょうか。/.test(e3._html || ""), "  「……」の 間で タップ → 行の 終わりまで 出る");
}

// ⑱ 扇子 (場面の 区切り) は 語りを 止めない (2026-11-22: 扇子の 動きを 2.4 秒に した。★語りは 扇子の 下に 続けて 出る = 待たない)
//   ★CSS の 長さ・回数・動きを 減らす 設定は test_css (L11・扇子の 例外・K6) で 見る
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a);
  let se = null, tS = null, tNext = null, nSensu = 0;
  for (let n = 0; n < 40000 && tNext == null; n += 1) {
    a.advance(5);
    const ks = a.talkEls();
    if (!se) { se = ks.find((c) => hasC(c, "sensu")); if (se) { tS = a.now; nSensu = ks.indexOf(se); } continue; }
    if (ks.slice(nSensu + 1).some((c) => hasC(c, "line"))) tNext = a.now;
  }
  ok(!!se && se.getAttribute("aria-hidden") === "true" && tNext != null && tNext - tS < 2400,
     "⑱ 扇子の あと 語りは 扇子の 動き (2.4 秒) を 待たずに 続く (" + (tNext - tS) + "ms)");
}

// ⑲ 追従 (2026-11-22 畳まずに 流す): 上へ 戻して 読み返している 間は 下へ 引き戻さない /「▼ 語りの続きへ」で 戻る /
//    自分で 動かした スクロール・タップだけの あとの 縮みは 読み返しと 見ない / どの 行も 畳まない
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.advance(1500);
  const btn = a.byId.tsuzuki;
  ok(btn && btn.hidden === true, "⑲ 追っている 間は「▼ 語りの続きへ」を 出さない");
  // ★人が 上へ 戻す (ホイール → スクロールが 上へ)
  a.fireWin("wheel", { deltaY: -120 });
  a.win.scrollY = (a.win.scrollY || 0) - 300; a.fireWin("scroll");
  ok(btn.hidden === false, "⑲ ホイールで 上へ 戻したら「▼ 語りの続きへ」が 出る");
  const b0 = (a.win._scrollBy || []).length;
  a.advance(4000);
  ok((a.win._scrollBy || []).length === b0, "⑲ 読み返している 間は 語りが 進んでも 下へ 引き戻さない (" + ((a.win._scrollBy || []).length - b0) + " 回)");
  ok(a.talkEls().filter((c) => has(c, "line")).length > 3, "⑲ 読み返している 間も 語りは 止めない");
  a.click("tsuzuki");
  ok(btn.hidden === true && (a.win._scrollBy || []).length > b0, "⑲「▼ 語りの続きへ」を 押すと 消えて、いちばん 新しい 行へ 送る");
  // ★人の 操作が 無い (1 秒 以上 前) まま 上へ 動いた (選択肢を 消して 下が 縮んだ など) → 読み返しと 見ない
  a.advance(1500);
  a.win.scrollY = (a.win.scrollY || 0) - 200; a.fireWin("scroll");
  ok(btn.hidden === true, "⑲ 人の 操作の 無い 上への 動き (下が 縮んだ など) は 読み返しと 見ない");
  // ★自分で 動かした スクロール (隠れた 新しい 行へ なめらかに 上へ 戻す 等) の 直後は、マウスを 押した あとでも 読み返しと 見ない
  //   (★模擬画面では 行の 位置が 固定 = 新しい 行は いつも 見出しの 裏 → scroll() は 上へ 戻す)
  a.win.scrollY = 3000; a.fireWin("scroll");
  a.advance(1500);
  a.fireWin("wheel", { deltaY: -60 });
  const y0 = a.win.scrollY;
  a.click("tsuzuki");
  ok(a.win.scrollY < y0, "⑲ (前提) 隠れた 行へ 上へ 戻した (" + y0 + " → " + a.win.scrollY + ")");
  a.fireWin("scroll");
  ok(btn.hidden === true, "⑲ 自分で 上へ 戻した スクロールは、ホイールを 回した 直後でも 読み返しと 見ない");
  a.settle(); a.pick("吉田松陰"); a.settle();
  a.click("again");
  a.settle();
  const tk = a.talkEls().filter((c) => has(c, "tatami")).length;
  ok(tk === 0 && a.errors.length === 0, "⑲ 二席 聴いても 畳んだ 行は 0・例外 0 (" + tk + " / " + a.errors.length + ")");
}

// ⑳ 見直し r8 (2026-11-22): 読み返しの あと 選択肢を 押したら 追い直す (H1) / タップ・下回し・語の キーは 読み返しと 見ない (M2)
{
  const a = mk({ date: "2026-11-28" });
  a.click("open"); a.settle();
  const btn = a.byId.tsuzuki;
  a.win.scrollY = 2000; a.fireWin("scroll"); a.advance(1500);
  a.fireWin("wheel", { deltaY: -120 }); a.win.scrollY = 1700; a.fireWin("scroll");
  ok(btn.hidden === false, "⑳ (前提) 上へ 戻して 読み返し中");
  a.pick(a.labels()[0]);
  ok(btn.hidden === true, "⑳ 読み返し中に 選択肢を 押したら 追い直す (「▼ 語りの続きへ」が 消える)");
  const b0 = (a.win._scrollBy || []).length;
  a.advance(3000);
  ok((a.win._scrollBy || []).length > b0, "⑳ 押した あとは また 送る (" + ((a.win._scrollBy || []).length - b0) + " 回)");
  // ★読み返しと 見ない 操作: 要素への mousedown (スマホの タップでも 出る)・ホイールの 下回し・↓キー
  const notBack = [["mousedown", { target: a.byId.talk }], ["wheel", { deltaY: 120 }], ["keydown", { key: "ArrowDown" }], ["touchstart", { touches: [{ clientY: 300 }] }]];
  const bad = [];
  notBack.forEach(([n, ev]) => {
    a.advance(1500);
    a.fireWin(n, ev);
    a.win.scrollY = (a.win.scrollY || 0) - 150; a.fireWin("scroll");
    if (btn.hidden !== true) { bad.push(n); a.click("tsuzuki"); }
  });
  ok(!bad.length, "⑳ タップ (mousedown・touchstart)・ホイールの 下回し・↓ の あとの 上への 動きは 読み返しと 見ない (" + (bad.join(",") || "誤り 0") + ")");
  // ★指を 下へ なぞる (= 画面は 上へ) は 読み返し
  a.advance(1500);
  a.fireWin("touchstart", { touches: [{ clientY: 300 }] }); a.fireWin("touchmove", { touches: [{ clientY: 420 }] });
  a.win.scrollY = (a.win.scrollY || 0) - 150; a.fireWin("scroll");
  ok(btn.hidden === false, "⑳ 指を 下へ なぞって 上へ 戻したら 読み返し");
}

// ㉑ 写真が 入って 空ける 幅が 広がっても 一気に 飛ばさない (2026-11-22 見直し): 打ち出し中は 1 字ごとに 6px まで / 新しい 行が 画面から 落ちそうなら すぐ 送る
{
  const a = mk({ date: "2026-12-03" });
  a.click("open"); a.advance(300);
  a.byId.koza.className += " haikei-on";
  const img = a.byId.haikeiImg; img.naturalWidth = 4; img.naturalHeight = 3;
  img.getBoundingClientRect = () => ({ top: 0, bottom: 700, left: 0, right: 400, width: 400, height: 700 });   // ★写真の 上端 = 400 (画面 800 の 半分)
  const last = a.byId.talk.lastElementChild;
  last.getBoundingClientRect = () => ({ top: 600, bottom: 640, left: 0, right: 100, width: 100, height: 40 });
  const b0 = (a.win._scrollBy || []).length;
  a.advance(400);
  const s1 = (a.win._scrollBy || []).slice(b0).filter((d) => d > 0);
  ok(s1.length > 0 && Math.max.apply(null, s1) <= 6, "㉑ 写真で 空ける 幅が 広がっても、打ち出し中は 少しずつ 送る (" + s1.length + " 回・最大 " + (s1.length ? Math.max.apply(null, s1) : "-") + "px)");
  const low = () => ({ top: 720, bottom: 760, left: 0, right: 100, width: 100, height: 40 });
  const b1 = (a.win._scrollBy || []).length;
  for (let k = 0; k < 40; k += 1) { a.byId.talk.children.forEach((c) => { c.getBoundingClientRect = low; }); a.advance(50); }
  const s2 = (a.win._scrollBy || []).slice(b1).filter((d) => d > 0);
  ok(s2.length > 0 && s2.every((d) => d >= 30 && d <= 36), "㉑ 新しい 行が 画面から 落ちそうなら 落ちる ぶん (30px) + 6px まで すぐ 送る (見直し r9 H2: 上限を 丸ごと 外さない。" + s2.slice(0, 3).join(",") + ")");
}

// ㉒ 札は「お持ち帰りを」を 言い終えて 間を 空けて から 送る (2026-11-24 作者の案・判断「謎かけの 前に 札を 上へ」)。
//    ★送り先は 語りの 終わり (★札の 上端では ない。謎かけの 文は 語りの 終わりに 足される = 2026-11-24 見直しの 声「文面が 題目の 下に 入る」)
//    ★模擬の 行は 下端 680・札の 上端 700・見出しの 下端 100 → 680 − 108 = 572
const pinTalk = (a, top, bottom) => a.byId.talk.children.forEach((c) => { c.getBoundingClientRect = () => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top }); });
const step = (a, top, bottom) => { pinTalk(a, top, bottom); a.advance(20); };
{
  const a = mk({ date: "2026-11-28", keepGenchi: true });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "埼玉県", "思う"]) { a.pick(l); a.settle(); }
  a.pick("吉田松陰"); a.settle();
  a.byId.sageBox.getBoundingClientRect = () => ({ top: 700, bottom: 1300, left: 0, right: 100, width: 100, height: 600 });
  const b0 = (a.win._scrollBy || []).length;
  const want = a.labels().indexOf("行ってみたい") >= 0 ? "行ってみたい" : a.labels()[0];
  a.pick(want);
  const told = () => a.talkEls().some((c) => /この札を お持ち帰りを/.test(txt(c)));
  for (let k = 0; k < 600 && !told(); k += 1) step(a, 640, 680);
  const early = (a.win._scrollBy || []).slice(b0).indexOf(572);
  const sent = () => (a.win._scrollBy || []).slice(b0).indexOf(572) >= 0;
  const lead = () => a.talkEls().some((c) => /現地でだけ聞ける/.test(txt(c)));
  const tDone = a.now;
  for (let k = 0; k < 600 && !sent(); k += 1) step(a, 640, 680);
  const tSent = a.now;
  for (let k = 0; k < 600 && !lead(); k += 1) step(a, 640, 680);
  const tLead = a.now;
  const atLead = sent();
  for (let k = 0; k < 600 && a.labels().indexOf("(form)") < 0; k += 1) step(a, 640, 680);
  const s = (a.win._scrollBy || []).slice(b0);
  ok(told() && s.indexOf(572) >= 0 && s.indexOf(592) < 0 && s.indexOf(400) < 0, "㉒ 語りの 終わり (680) を 見出しの 下 (108) へ 送る (572px。札の 上端 (592) ・半分 (400) では ない。" + s.filter((d) => d > 6).slice(0, 6).join(",") + ")");
  ok(early < 0 && atLead && lead() && tLead - tSent >= 500, "㉒ 送るのは「お持ち帰りを」の 後・謎かけの 文の 前 (行が 出て から (打ち出しを 含む) " + (tSent - tDone) + "ms・送って から 謎かけまで " + (tLead - tSent) + "ms・早い送り " + early + ")");
}

// ㉓ 節目で 見出しの 枠 (見出し・図) の 高さが 変わっても 語りを 動かさない (2026-11-23 見直しの 声「節目で 飛ぶ」)
{
  const a = mk({ date: "2026-11-28" });
  // ★模擬の 枠の 高さ = 見出しが 出ていれば 30 + 図が 出ていれば 300
  Object.defineProperty(a.byId.kozahead, "offsetHeight", { get: () => (a.byId.midashi.hidden ? 0 : 30) + (a.byId.zu.hidden ? 0 : 300) });
  a.click("open"); a.settle();
  a.win.scrollY = 500; a.fireWin("scroll");
  const b0 = (a.win._scrollBy || []).length;
  for (const l of ["いや、べつに", "県外から", "関東", "茨城県"]) { a.pick(l); a.settle(); }
  a.pick("思う");
  const m0 = a.byId.midashi.hidden;
  for (let k = 0; k < 400 && a.byId.midashi.hidden; k += 1) { a.win.scrollY = 5000; a.advance(20); }
  const s = (a.win._scrollBy || []).slice(b0);
  ok(m0 === true && !a.byId.midashi.hidden && s.indexOf(30) >= 0, "㉓ 見出しが 出て 枠が 30px 高く なったら、画面も 30px 合わせる (" + s.filter((d) => d !== 0).slice(0, 5).join(",") + ")");
}

// ㉗ 枠が 伸びた (表・見出し) とき、流れていた 行を 枠の 裏に 置かない (2026-11-24 見直しの 声「途中に 表が 入った 際に、今 流していた 文字が 隠れた」)
//    ★語りが 画面の 上の ほう (行の 下端 340・置き場 710) → 補正 +30 の あと すぐ −30 で 戻す / 画面が ほぼ 語りで 埋まって いる (下端 640・写真の ある 場面の 置き場 660) → 戻すのは 20 だけ
for (const [bottom, want] of [[340, -30], [640, -20]]) {
  const a = mk({ date: "2026-11-28" });
  Object.defineProperty(a.byId.kozahead, "offsetHeight", { get: () => (a.byId.midashi.hidden ? 0 : 30) + (a.byId.zu.hidden ? 0 : 300) });
  const at = () => ({ top: bottom - 40, bottom: bottom, left: 0, right: 100, width: 100, height: 40 });
  a.click("open"); a.settle();
  a.win.scrollY = 500; a.fireWin("scroll");
  const b0 = (a.win._scrollBy || []).length;
  for (const l of ["いや、べつに", "県外から", "関東", "茨城県"]) { a.pick(l); a.settle(); }
  a.pick("思う");
  for (let k = 0; k < 400 && a.byId.midashi.hidden; k += 1) { a.byId.talk.children.forEach((c) => { c.getBoundingClientRect = at; }); a.win.scrollY = 5000; a.advance(20); }
  const s = (a.win._scrollBy || []).slice(b0);
  const i = s.indexOf(30);
  ok(!a.byId.midashi.hidden && i >= 0 && s[i + 1] === want, "㉗ 枠が 30px 伸びた あと、新しい 行の 下端 " + bottom + " → " + want + "px 戻す (" + s.slice(Math.max(0, i), i + 3).join(",") + ")");
}

// ㉔ 本物の 台帳 (2026-11-23 から G1・G2 が 出る) の まま 実演の 筋: 一席目の 札の あと 謎かけが 出て も「もう一席」で 二席目へ 進める
{
  const a = mk({ date: "2026-11-28", keepGenchi: true });
  a.click("open"); a.settle();
  const first = a.labels();
  for (const l of ["いや、べつに", "県外から", "関東", "埼玉県", "思う"]) { a.pick(l); a.settle(); }
  a.pick("吉田松陰"); a.settle();
  const want = a.labels().indexOf("行ってみたい") >= 0 ? "行ってみたい" : a.labels()[0];
  a.pick(want); a.settle();
  const riddle = a.talkEls().some((c) => /めがねの形の時計/.test(txt(c))) && a.labels().indexOf("(form)") >= 0;
  a.click("again"); a.settle();
  const sh = a.shown();
  ok(first.indexOf("いま、公園におります") >= 0, "㉔ 本物の 台帳でも 最初の 問いに「いま、公園におります」(" + first.join("/") + ")");
  ok(riddle && sh[0] === "T-1128" && sh[1] === "P-埼玉県" && a.errors.length === 0,
     "㉔ 一席目の 札の あと G1 の 謎かけが 出て、「もう一席」で 二席目 P-埼玉県 へ (" + sh.join(">") + ")");
}

// ㉕ 謎かけで 札が 押し出されても 画面から 消さない (2026-11-23 作者の判断「画面から 消えない 程度なら 押し出して よい」。見直し r9 H1)
//    ★謎かけの 文 (模擬の 上端 400) が 見出しの 下に 十分 残る とき
// ㉘ ★ただし 謎かけの 文を 見出しの 裏へ 押し上げて まで 札を 残さない (2026-11-24 見直しの 声「文面が 題目の 下に 入る」)
//    ★謎かけの 文の 上端 150 → 見出しの 下 (108) まで 42px だけ 送る (札の 上 140px の ための 240px は 送らない)
for (const [top, want, bad, name] of [[400, 240, null, "㉕ 謎かけの 欄が 出た あとも 札の 上 140px が 画面に 残る ように 送る (900 → 660)"],
                                     [150, 42, 240, "㉘ 謎かけの 文が 長い ときは 文を 見出しの 下に 残す ほうを 先に (42px まで。240px は 送らない)"]]) {
  const a = mk({ date: "2026-11-28", keepGenchi: true });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "埼玉県", "思う"]) { a.pick(l); a.settle(); }
  a.pick("吉田松陰"); a.settle();
  a.byId.sageBox.getBoundingClientRect = () => ({ top: 900, bottom: 1500, left: 0, right: 100, width: 100, height: 600 });   // ★謎かけの 文で 札が 画面の 下 (800) より 外へ
  const b0 = (a.win._scrollBy || []).length;
  const want0 = a.labels().indexOf("行ってみたい") >= 0 ? "行ってみたい" : a.labels()[0];
  a.pick(want0);
  for (let k = 0; k < 1500 && a.labels().indexOf("(form)") < 0; k += 1) step(a, top, top + 40);
  for (let k = 0; k < 20; k += 1) step(a, top, top + 40);
  const s = (a.win._scrollBy || []).slice(b0);
  const riddle = a.labels().indexOf("(form)") >= 0;
  ok(riddle && s.indexOf(want) >= 0 && (bad == null || s.indexOf(bad) < 0), name + " (" + s.filter((d) => d > 6).slice(0, 6).join(",") + ")");
}

// ㉖ 札を 見せた あと 読み返しに 入ったら、札まわりの 送り (cardPeek ほか) を しない (見直し r9 H3。「読み返している 間は 引き戻さない」)
{
  const a = mk({ date: "2026-11-28", keepGenchi: true });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "埼玉県", "思う"]) { a.pick(l); a.settle(); }
  a.pick("吉田松陰"); a.settle();
  a.byId.sageBox.getBoundingClientRect = () => ({ top: 900, bottom: 1500, left: 0, right: 100, width: 100, height: 600 });
  const want = a.labels().indexOf("行ってみたい") >= 0 ? "行ってみたい" : a.labels()[0];
  a.pick(want); a.advance(1300);
  a.fireWin("wheel", { deltaY: -120 }); a.win.scrollY = (a.win.scrollY || 0) - 300; a.fireWin("scroll");
  const paused = a.byId.tsuzuki.hidden === false;
  const b0 = (a.win._scrollBy || []).length;
  a.settle();
  const s = (a.win._scrollBy || []).slice(b0).filter((d) => d > 0);
  ok(paused && s.length === 0, "㉖ 読み返し中は 謎かけの 文が 足されても 札まわりの 送りを しない (読み返し " + paused + " / 送り " + s.slice(0, 5).join(",") + ")");
}

// ---- 見直し r10 (2026-11-24 作者の案「スクロール以外で 文字が 飛ぶ・隠れる」) ----
// ㉙ 札の 写真を 読み込む 間に「別の噺」→ 前の 席の 札・最後の 問いを 新しい 席に 割り込ませない (r10 A-1)
{
  const a = mk({ date: "2026-11-28", loadDelay: (s) => (/img\/card_/.test(s) ? 600000 : 0) });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "茨城県"]) { a.pick(l); a.settle(); }
  a.pick("思う");
  for (let k = 0; k < 400 && a.labels().indexOf("吉田松陰") < 0; k += 1) { a.advance(500); if (a.labels()[0] === "次へ") a.pick("次へ"); }
  a.pick("吉田松陰");
  for (let k = 0; k < 4000 && !a.talkEls().some((c) => /札を一枚、お出しします/.test(txt(c))); k += 1) a.advance(100);
  a.advance(3000);
  a.click("other");
  a.advance(20000);
  const labels0 = a.labels().join("/");
  a.advance(600000);
  const old = a.talkEls().some((c) => /いま、いかがです/.test(txt(c)));
  ok(a.byId.sageBox.hidden && !old && a.labels().indexOf("行ってみたい") < 0 && a.errors.length === 0,
     "㉙ 札の 読み込み中に「別の噺」→ 読み終わっても 前の 席の 札・問いは 出ない (札 " + (a.byId.sageBox.hidden ? "隠れた まま" : "出た") + " / 選択肢 " + labels0 + " → " + a.labels().join("/") + ")");
}
// ㉚ 「場」を 開いて いる 間は 語りを 止め、閉じたら 続ける (r10 A-2・作者の判断)
{
  const a = mk({ date: "2026-11-28" });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "茨城県"]) { a.pick(l); a.settle(); }
  a.pick("思う");
  a.advance(3000);
  const n = () => a.talkEls().filter((c) => hasC(c, "line")).length;
  const n0 = n();
  a.click("baBtn");
  a.advance(30000);
  const n1 = n();
  a.click("closeBa");
  a.advance(10000);
  const n2 = n();
  ok(!a.byId.ba.hidden === false && n1 === n0 && n2 > n1, "㉚ 「場」を 開いた 30 秒は 行が 増えず (" + n0 + " → " + n1 + ")、閉じたら 続く (→ " + n2 + ")");
}
// ㉛ 打っている 行の 頭を 見出しの 裏へ 送らない (r10 B-2・A-5: 行の 上端 104 = 見出しの 下端 100 + 4)
{
  const a = mk({ date: "2026-11-28" });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "茨城県"]) { a.pick(l); a.settle(); }
  a.pick("思う");
  a.advance(2000);
  const b0 = (a.win._scrollBy || []).length;
  for (let k = 0; k < 150; k += 1) { pinTalk(a, 104, 760); a.advance(20); }
  const s = (a.win._scrollBy || []).slice(b0).filter((d) => d > 0);
  ok(s.length === 0, "㉛ 長い 行 (上端 104・下端 760) を 打っている 間、行の 頭を 見出しの 裏へ 送らない (送り " + s.slice(0, 5).join(",") + ")");
}
// ㉜ 足元が 2 段 (92px) に 折れたら、その ぶん 上に 置く (r10 B-3・A-6。前は 決め打ちの「下から 90px」)
{
  const a = mk({ date: "2026-11-28" });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "茨城県"]) { a.pick(l); a.settle(); }
  a.pick("思う");
  a.advance(2000);
  a.byId.footbar.getBoundingClientRect = () => ({ top: 708, bottom: 800, left: 0, right: 100, width: 100, height: 92 });
  const b0 = (a.win._scrollBy || []).length;
  for (let k = 0; k < 150; k += 1) { pinTalk(a, 660, 700); a.advance(20); }
  const s = (a.win._scrollBy || []).slice(b0).filter((d) => d > 0);
  // ★落ちる 線 = 足元の 上端 708 − 22 = 686 (前は 決め打ちの 800 − 70 = 730)。下端 700 は 14px 落ちる → 打ち出し中は 14 + 6 = 20px ずつ (前は 6px ずつ)
  ok(s.length > 0 && s.indexOf(20) >= 0 && s.every((d) => d <= 20), "㉜ 足元 92px なら 落ちる 線を 足元の 上 (686) に 置き、行の 下端 700 を すぐ 上げる (20px ずつ。送り " + s.slice(0, 5).join(",") + ")");
}
// ㉝ 札の 上の タップは 早送りに しない (r10 A-11)
{
  const a = mk({ date: "2026-11-28" });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "茨城県"]) { a.pick(l); a.settle(); }
  a.pick("思う");
  a.advance(1500);
  const n = () => a.talkEls().filter((c) => hasC(c, "line")).length;
  const n0 = n();
  for (let k = 0; k < 6; k += 1) a.byId.card.click();
  const n1 = n();
  for (let k = 0; k < 6; k += 1) a.byId.talk.click();
  const n2 = n();
  ok(n1 === n0 && n2 > n1, "㉝ 札の タップでは 進まず (" + n0 + " → " + n1 + ")、語りの タップでは 進む (→ " + n2 + ")");
}

// ---- 見直し r11 (2026-11-24 作者の案「修正の 結果と 影響の 見直し」) ----
// ㉞ 鳴き声の 出典は 一席目でも 出る・札の 下の 決まった 場所・何度 押しても 語りに 行を 足さない (r11 A-1 の 回帰)
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.settle();
  a.pick("吉田松陰"); a.settle();
  const n0 = a.talkEls().length;
  const shown0 = !a.byId.sageBox.hidden;
  a.byId.koe.click(); a.settle();
  a.byId.koe.click(); a.settle();
  const cr = a.byId.koeCredit;
  ok(shown0 && cr && cr.hidden === false && /鳴き声/.test(cr.textContent) && a.talkEls().length === n0,
     "㉞ 一席目の 札で 鳴き声を 2 回 押すと 出典が 札の 下に 出て (" + (cr ? (cr.hidden ? "隠れた まま" : "出た") : "欄 なし") + ")、語りの 行は 増えない (" + n0 + " → " + a.talkEls().length + ")");
  a.click("again"); a.settle();
  ok(cr && cr.hidden === true, "㉞ 次の 席では 出典を 隠す");
}
// ㉟ 問いが 1px だけ 見出しに かかって いても 守る (r11 A-2: 上端で 見ていたので 守りが 外れ、窓の 大きさ変更・早送りで 問いを 見出しの 裏へ 押し上げた)
//    ★問いの 上端 99・下端 140 (見出しの 下端 100)、選択肢の 下端 740 → 送るのは 落ちる ぶん (740 − 730 = 10px) だけ
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.settle();
  const q = a.talkEls().filter((c) => hasC(c, "toi")).pop();
  q.getBoundingClientRect = () => ({ top: 99, bottom: 140, left: 0, right: 100, width: 100, height: 41 });
  a.byId.choices.children.forEach((c) => { c.getBoundingClientRect = () => ({ top: 700, bottom: 740, left: 0, right: 100, width: 100, height: 40 }); });
  const b0 = (a.win._scrollBy || []).length;
  a.fireWin("resize"); a.advance(400);
  const s = (a.win._scrollBy || []).slice(b0).filter((d) => d > 0);
  ok(!!q && s.length > 0 && Math.max.apply(null, s) <= 10, "㉟ 窓の 大きさ変更の あと、1px かかった 問いを それ以上 見出しの 裏へ 送らない (送り " + s.slice(0, 4).join(",") + "。10px まで)");
}
// ㊱ 打ち込み欄に 触れたら (キーボード)、見出しの 裏の 問いを 戻す。★ただし 欄を キーボード・足元の 下へ 入れる ほどは 戻さない (r10 B-4 / r11 B-3)
//    ★問いの 上端 50 (見出しの 下 108 まで 58px)・足元の 上端 752 → 欄の 下端の 限り 744。欄の 下端 500 → 58px 戻す / 720 → 24px だけ
for (const [fb, want] of [[500, -58], [720, -24]]) {
  const a = mk({ date: "2026-11-28", keepGenchi: true });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "埼玉県", "思う"]) { a.pick(l); a.settle(); }
  a.pick("吉田松陰"); a.settle();
  const want0 = a.labels().indexOf("行ってみたい") >= 0 ? "行ってみたい" : a.labels()[0];
  a.pick(want0); a.settle();
  const form = a.byId.choices.children[0];
  const input = form && form.children[0];
  const q = a.talkEls().filter((c) => hasC(c, "toi")).pop();
  if (q) q.getBoundingClientRect = () => ({ top: 50, bottom: 90, left: 0, right: 100, width: 100, height: 40 });
  if (input) input.getBoundingClientRect = () => ({ top: fb - 40, bottom: fb, left: 0, right: 100, width: 100, height: 40 });
  const b0 = (a.win._scrollBy || []).length;
  if (input) (input.handlers.focus || []).forEach((f) => f({ type: "focus" }));
  a.advance(400);
  const s = (a.win._scrollBy || []).slice(b0);
  ok(!!input && s.indexOf(want) >= 0, "㊱ 欄の 下端 " + fb + " で 触れたら 問いを " + want + "px 戻す (送り " + s.slice(0, 4).join(",") + ")");
}

// ㊲ 「場」を 開いて いる 間に 画面 (パネルの 外の 縁) を タップしても 語りを 続けない (r11 A-3)
{
  const a = mk({ date: "2026-11-28" });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "茨城県"]) { a.pick(l); a.settle(); }
  a.pick("思う");
  a.advance(3000);
  const n = () => a.talkEls().filter((c) => hasC(c, "line")).length;
  a.click("baBtn");
  const n0 = n();
  for (let k = 0; k < 6; k += 1) { a.byId.talk.click(); a.advance(2000); }
  const n1 = n();
  ok(n1 === n0, "㊲ 「場」を 開いた まま 画面を 6 回 タップしても 行は 増えない (" + n0 + " → " + n1 + ")");
}

// ㊳ 謎かけに 答えた あと (外れ・いまは よしておく)、お題を 上限に 札が 見える ところまで 送る (2026-11-24 作者の判断)
//    ★お題の 上端 400 → 見出しの 下 (108) まで 292px / 札の 下端 1500 → 足元の 上 (744) まで 756px → 少ない ほう 292 (お題で 止める)
//    ★札の 下端 780 → 36px (札が 見えたら 止める)
for (const [mode, cardBottom, want] of [["miss", 1500, 292], ["miss", 780, 36], ["later", 1500, 292]]) {
  const a = mk({ date: "2026-11-28", keepGenchi: true });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "埼玉県", "思う"]) { a.pick(l); a.settle(); }
  a.pick("吉田松陰"); a.settle();
  const w0 = a.labels().indexOf("行ってみたい") >= 0 ? "行ってみたい" : a.labels()[0];
  a.pick(w0); a.settle();
  a.byId.sageBox.getBoundingClientRect = () => ({ top: cardBottom - 600, bottom: cardBottom, left: 0, right: 100, width: 100, height: 600 });
  const pinToi = () => a.talkEls().forEach((c) => { if (hasC(c, "toi")) c.getBoundingClientRect = () => ({ top: 400, bottom: 440, left: 0, right: 100, width: 100, height: 40 }); });
  pinToi();
  const form = a.byId.choices.children[0];
  const b0 = (a.win._scrollBy || []).length;
  if (mode === "miss") {
    form.children[0].value = "みどり";
    (form.handlers.submit || []).forEach((f) => f({ type: "submit", preventDefault() {} }));
  } else {
    form.children[1].children[1].click();
  }
  // ★「いまは よしておく」は 返しの あと refreshGenchi で 場所取り (yoyaku) が 外れる (2026-11-25 から 札を 出す ときに 場所を 取る)
  for (let k = 0; k < 1500 && (mode === "miss" ? a.labels().indexOf("(form)") < 0 : (a.byId.genchiAgain.hidden || hasC(a.byId.genchiAgain, "yoyaku"))); k += 1) { pinToi(); a.advance(20); }
  for (let k = 0; k < 20; k += 1) { pinToi(); a.advance(20); }
  const s = (a.win._scrollBy || []).slice(b0).filter((d) => d > 6);
  ok(s.indexOf(want) >= 0 && s.every((d) => d <= want), "㊳ " + (mode === "miss" ? "外れ" : "いまは よしておく") + "・札の 下端 " + cardBottom + " → " + want + "px 送る (送り " + s.slice(0, 5).join(",") + ")");
}

// ---- 見直し r12 (2026-11-25 見直しの 声「文字を 出した 後、スクロール すると 改行・文字間が 変わる。スマホだけ」) ----
// ㊴ 字の 包み (1 字ずつの span) の 道で、打ち終わった 行を 置き直さない (タップ・打ちかけで 別の 噺・早送り・一度に 出す でも)
//    ★模擬 DOM に 字の 包みを 持たせる (walker)。★見る もの = 包みで 打った 行 (はじめの 書き込みが html) に 2 回目の 書き込みが 無い / 見えない 字が 残らない
{
  const a = mk({ date: "2026-11-28", walker: true });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "茨城県"]) { a.pick(l); a.settle(); }
  a.pick("思う");
  a.advance(1200); for (let k = 0; k < 3; k += 1) { a.byId.talk.click(); a.advance(150); }   // ★タップ
  a.advance(1500); a.click("other"); a.settle();                                             // ★打ちかけで 別の 噺
  a.advance(800); a.click("skip"); a.settle();                                               // ★早送り
  const lines = [];
  (function walk(n) { (n.children || []).forEach((c) => { if (hasC(c, "line")) lines.push(c); }); })(a.byId.talk);
  const wrapped = lines.filter((c) => c._w && c._w[0] === "html");
  const rewritten = wrapped.filter((c) => c._w.length > 1);
  let mada = 0; (function w(n) { (n.children || []).forEach((c) => { if (c.className === "mada") mada += 1; w(c); }); })(a.byId.talk);
  ok(wrapped.length >= 10 && rewritten.length === 0 && mada === 0 && a.errors.length === 0,
     "㊴ 包みで 打った 行 " + wrapped.length + " 本、打ち終わりの 置き直し " + rewritten.length + " 本・見えない まま の 字 " + mada + " 個 (どちらも 0)");
}
// ㊵ 包みの 字が 文と 数で 合わない 文 (〈傍点〉の 括弧・数字の 後の 空白・絵文字) も 包みで 打ち、置き直さない (見直し r12 A-2・B-3)
{
  const odd = "はい、〈これ〉は 3 匹 🐼 の公園の話でございます。";
  const a = mk({ date: "2026-11-28", walker: true, srcPatch: (src) => src.replace("はい、これは鯖江の公園の話でございます。", odd) });
  a.click("open");
  for (let k = 0; k < 200; k += 1) { a.advance(50); if (a.labels().length) break; }
  const line = a.talkEls().find((c) => c._html && /3/.test(c._html) && /ござい/.test(c._html));
  let mada = 0; if (line) (function w(n) { (n.children || []).forEach((c) => { if (c.className === "mada") mada += 1; w(c); }); })(line);
  ok(!!line && line._w[0] === "html" && line._w.length === 1 && mada === 0 && a.errors.length === 0,
     "㊵ 数の 合わない 文も 包みで 打ち (はじめの 書き込み " + (line ? line._w[0] : "-") + ")、置き直さない (書き込み " + (line ? line._w.length : "-") + " 回・見えない 字 " + mada + ")");
}

// ㊶ 札の 下の「現地の謎かけに答える」は、出る 見込みの 席では 札を 出した ときから 見えない まま 場所を 取る (見直し r12 B-1)
{
  const a = mk({ date: "2026-11-28", keepGenchi: true });
  a.click("open"); a.settle();
  for (const l of ["いや、べつに", "県外から", "関東", "埼玉県", "思う"]) { a.pick(l); a.settle(); }
  a.pick("吉田松陰");
  for (let k = 0; k < 4000 && a.byId.sageBox.hidden; k += 1) a.advance(20);
  const g = a.byId.genchiAgain;
  const atCard = !g.hidden && hasC(g, "yoyaku");
  a.settle();
  const w0 = a.labels().indexOf("行ってみたい") >= 0 ? "行ってみたい" : a.labels()[0];
  a.pick(w0); a.settle();
  a.byId.choices.children[0].children[1].children[1].click(); a.settle();   // ★いまは よしておく
  ok(atCard && !g.hidden && !hasC(g, "yoyaku"), "㊶ 札を 出した ときから 場所を 取り (" + atCard + ")、お預けに なったら 見せる (" + (!g.hidden && !hasC(g, "yoyaku")) + ")");
}

console.log(fail.length ? "NG " + fail.length + " 件" : "ALL OK");
process.exit(fail.length ? 1 : 0);
