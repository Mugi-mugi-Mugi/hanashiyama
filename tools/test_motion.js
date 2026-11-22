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

// ⑫ 札の あと「もう一席」: 高座の 頭へ 戻す / 前の 席の 語りは 全部 畳む (2026-11-15 見直しの 声「画面が ずれた まま」)
{
  const a = mk({ date: "2026-11-28" });
  toFirstSeat(a); a.settle();
  a.pick("吉田松陰"); a.settle();
  const nBefore = a.talkEls().length;
  const s0 = (a.win._scrollTo || []).length;
  a.click("again");
  // ★新しい 席の 振りが 出た 瞬間に 見る (★あとで 見ると 普通の 畳みでも 畳まれて いて 差が 出ない)
  const furiN = () => a.talkEls().filter((c) => /(^| )furi( |$)/.test(c.className || "")).length;
  const f0 = furiN();
  for (let k = 0; k < 2000 && furiN() === f0; k += 1) a.advance(20);
  ok((a.win._scrollTo || []).length > s0, "もう一席で 高座の 頭へ 戻す (scrollTo)");
  const old = a.talkEls().slice(0, nBefore).filter((c) => /(^| )line( |$)/.test(c.className || ""));
  const open = old.filter((c) => !/(^| )tatami( |$)/.test(c.className || ""));
  ok(old.length > 5 && open.length === 0, "もう一席で 前の 席の 語りは 全部 畳む (残り " + open.length + " / " + old.length + ")");
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

console.log(fail.length ? "NG " + fail.length + " 件" : "ALL OK");
process.exit(fail.length ? 1 : 0);
