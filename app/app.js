/* はなし山 — 西山公園がオチを探す
 *
 * 行動原理 (3 条)
 *   一. 西山公園の話から始めない。相手の県・信じていること・今日の日付から始める
 *   二. 相手に届く手がかりが無ければ、語らない
 *   三. 「来て」と言わない。サゲで相手が自分で思う
 *
 * 画面は「一席」。噺家が話しかけ、客が答え、噺家が返す。
 * 語りは data/bundle.js の台本と事実台帳から選ぶ。外部への通信はしない。
 */
(function (root) {
  "use strict";

  // ==================================================================
  // 選び方 (純粋関数。node から検査できるよう DOM に触らない)
  // ==================================================================
  const Core = {
    monthDay(dateStr) {
      return dateStr ? dateStr.slice(5, 10) : "";
    },

    pick(data, { pref = "", beliefs = [], date = "" } = {}) {
      const year = date ? Number(date.slice(0, 4)) : null;
      const md = Core.monthDay(date);
      const out = [];
      const consider = (st, source) => {
        const hooks = st.hooks || {};
        const reasons = [];
        let score = st.strength || 1;
        if (pref && (hooks.prefectures || []).includes(pref)) {
          score += 3;
          reasons.push("pref");
        }
        const hits = (hooks.beliefs || []).filter((b) => beliefs.includes(b));
        if (hits.length) {
          score += 2 * hits.length;
          reasons.push("belief");
        }
        if (source === "today") {
          score += 4;
          reasons.push("today");
        }
        if (reasons.length) out.push({ story: st, score, reasons, source });
      };
      data.stories.forEach((st) => consider(st, "story"));
      data.prefStories
        .filter((st) => pref && st.hooks.prefectures.includes(pref))
        .forEach((st) => consider(st, "pref"));
      (data.today[md] || [])
        .filter((st) => !st.onlyYear || st.onlyYear === year)
        .forEach((st) => consider(st, "today"));
      out.sort((a, b) => b.score - a.score || a.story.id.localeCompare(b.story.id));
      return out;
    },

    /** 手書き・県・今日 を ひと並びに (似ているかを 見るのに 要る) */
    allStories(data) {
      return (data.stories || []).concat(
        data.prefStories || [],
        Object.keys(data.today || {}).reduce((a, k) => a.concat(data.today[k]), [])
      );
    },

    /** カタカナ → ひらがな */
    hira(t) {
      return (t || "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    },

    /**
     * 客が打った言葉を、手元の辞書だけで 信念 / 県 / 季節 に結びつける。
     * 照合: ①語がそのまま入っている ②かなだけの語は3文字以上でひらがな化した文に
     *       ③読み(kana)は4文字以上のときだけ / そのあと「長い語に含まれる短い語」を捨てる
     */
    match(data, text) {
      if (!text || !text.trim()) return { hits: [], belief: null, pref: null, season: null };
      const raw = text.trim();
      const hira = Core.hira(raw);
      const kanaOnly = (w) => /^[ぁ-ゟァ-ヶー]+$/.test(w);
      let hits = (data.keywords || []).filter((e) => {
        if (raw.includes(e.word)) return true;
        if (kanaOnly(e.word) && e.word.length >= 3 && hira.includes(Core.hira(e.word))) return true;
        if (e.kana && e.kana.length >= 4 && hira.includes(e.kana)) return true;
        return false;
      });
      // 「城」は「城下町」に含まれる → 長いほうを残す
      hits = hits.filter((e) => !hits.some((o) => o !== e && o.word.length > e.word.length && o.word.includes(e.word)));
      hits.sort((a, b) => (b.weight || 1) - (a.weight || 1) || b.word.length - a.word.length);
      const first = (k) => (hits.find((h) => h[k]) || {})[k] || null;
      return { hits, belief: first("belief"), pref: first("pref"), season: first("season") };
    },

    /** 噺家が伺う順番: その客に噺がある信念を先に、強い噺の順で */
    askOrder(data, pref, limit = 3) {
      const score = {};
      const pinned = new Set(); // その県に 結びついた 問いは 先に 伺う
      const add = (st, w, pin) => (st.hooks.beliefs || []).forEach((b) => {
        score[b] = Math.max(score[b] || 0, (st.strength || 1) + w);
        if (pin) pinned.add(b);
      });
      // 手書きの噺が その県に 結びついている ときだけ 前に 固定する
      data.stories.forEach((st) => {
        const hit = pref && st.hooks.prefectures.includes(pref);
        add(st, hit ? 3 : 0, hit);
      });
      // 県の噺は どの県にも 同じ 問い (パンダ・動物園) なので 固定しない
      data.prefStories.filter((st) => pref && st.hooks.prefectures.includes(pref)).forEach((st) => add(st, 1, false));
      let list = data.beliefs
        .filter((b) => score[b.id])
        .filter((b) => !b.onlyPref || b.onlyPref === pref)
        .sort((a, b) => score[b.id] - score[a.id]);
      // その県に 結びついた 問いは 前に 置き、残りだけ 回す (42 県が 同じ第1問に 寄らないように)
      const head = list.filter((b) => pinned.has(b.id) || (b.onlyPref && b.onlyPref === pref));
      let tail = list.filter((b) => !head.includes(b));
      if (pref && tail.length > 1) {
        const i = (data.prefectures || []).indexOf(pref);
        const k = ((i < 0 ? 0 : i) * 3) % tail.length;
        tail = tail.slice(k).concat(tail.slice(0, k));
      }
      return head.concat(tail).slice(0, limit);
    },

    /**
     * どの噺を語るか。客が最後に答えたものを立てる: 信念 > 県 > 今日。
     * 返り値 { story, chosenBy, switchNote } / 候補が無ければ null
     */
    choose(data, input, preferBelief, shownIds, usedSages) {
      const shown = new Set(shownIds || []);
      const sages = new Set(usedSages || []);
      let all = Core.pick(data, input).filter((c) => !shown.has(c.story.id));
      // 同じ落ち所を 続けて 出さない (札まで 同じに なるため)
      const fresh = all.filter((c) => !sages.has(c.story.sage));
      if (fresh.length) all = fresh;
      if (!all.length) return null;
      // ★もう一席が 前の席と 似ないように (2026-09-23 スマホ確認で 指摘)
      //   ★「似ている」= ★出典の事実が 同じ / ★立てた 思い込みが 同じ。
      //   ここが 重なると、オチの型が 違っても ★客には「さっきと同じ話」に 聞こえる。
      //   思い込みの 重なりを 事実の 2 倍で 数えるのは、客が 覚えて帰るのが
      //   ★数字では なく「何を ひっくり返されたか」の ほうだから。
      const has0 = (c, key, v) => ((c.story.hooks && c.story.hooks[key]) || []).includes(v);
      const hadBelief = preferBelief ? all.some((c) => has0(c, "beliefs", preferBelief)) : false;
      const told = Core.allStories(data).filter((s) => shown.has(s.id));
      if (told.length) {
        const usedF = new Set(), usedB = new Set();
        told.forEach((s) => {
          (s.facts || []).forEach((f) => usedF.add(f));
          ((s.hooks || {}).beliefs || []).forEach((b) => usedB.add(b));
        });
        const sim = (s) =>
          (s.facts || []).filter((f) => usedF.has(f)).length +
          2 * (((s.hooks || {}).beliefs || []).filter((b) => usedB.has(b)).length);
        const lo = Math.min.apply(null, all.map((c) => sim(c.story)));
        all = all.filter((c) => sim(c.story) === lo);
      }
      const has = (c, key, v) => ((c.story.hooks && c.story.hooks[key]) || []).includes(v);
      const byBelief = preferBelief ? all.filter((c) => has(c, "beliefs", preferBelief)) : [];
      // ★同じ筋の噺は 在るが、似るので 外した ―― のか
      //   ★そもそも 持ち合わせが 無い のか。★客には 別ごとなので 言い分ける
      const note = hadBelief && !byBelief.length
        ? "その筋の噺は もう一席ございますが、続けますと 似てまいります。趣を変えて。"
        : "いただいた手がかりの噺は、あいにく持ち合わせがございません。かわりに、今日という日で一席。";
      const byPref = input.pref ? all.filter((c) => has(c, "prefectures", input.pref)) : [];
      if (byBelief.length) return { story: byBelief[0].story, chosenBy: "belief", switchNote: null };
      if (byPref.length) {
        return {
          story: byPref[0].story,
          chosenBy: "pref",
          switchNote: preferBelief ? "その話は、またの機会に。お客さんの土地の噺を、ひとつ。" : null,
        };
      }
      return {
        story: all[0].story,
        chosenBy: "today",
        switchNote: preferBelief || input.pref ? note : null,
      };
    },

    sageExtra(st, date) {
      if (st.yearsSince && date) {
        const n = Number(date.slice(0, 4)) - st.yearsSince;
        if (n > 0) return "(没後" + n + "年)";
      }
      return "";
    },

    factsOf(data, st) {
      const byId = Object.fromEntries(data.facts.map((f) => [f.id, f]));
      return (st.facts || []).map((id) => byId[id]).filter(Boolean);
    },

    ba(events) {
      const byStory = {};
      const byPref = {};
      events.forEach((e) => {
        if (e.event !== "delta") return;
        const s = (byStory[e.story] = byStory[e.story] || { n: 0, sum: 0, title: e.title || e.story });
        s.n += 1;
        s.sum += e.delta;
        const pref = (e.input && e.input.pref) || "(言わず)";
        const p = (byPref[pref] = byPref[pref] || { n: 0, sum: 0 });
        p.n += 1;
        p.sum += e.delta;
      });
      const rows = (obj) =>
        Object.entries(obj)
          .map(([k, v]) => ({ key: k, n: v.n, avg: v.sum / v.n, title: v.title }))
          .sort((a, b) => b.avg - a.avg || b.n - a.n);
      return { stories: rows(byStory), prefs: rows(byPref) };
    },

    todayString(d = new Date()) {
      const p = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    },

    /** 本題を 1 本の文字列に ならす (地の文 + 台詞) */
    hondaiText(st) {
      return (st.hondai || [])
        .map((h) => (typeof h === "string" ? h : (h && h.text) || ""))
        .join(" ");
    },

    /** 数字の絵図を SVG 文字列にする (値は bundle の fig = 参照事実の中の数字だけ) */
    figSvg(fig) {
      const items = (fig && fig.items) || [];
      if (!items.length) return "";
      const max = fig.max || Math.max.apply(null, items.map((i) => Math.abs(i.value))) || 1;
      // ★スマホ (幅 375px) では 使える幅が 343px。viewBox 640 だと 倍率 0.54 になり
      //   文字が 8〜11px まで 縮んで 読めなかった (2026-09-23 計算で 発見)。
      //   viewBox を 440 に 狭めて 倍率を 0.78 に 上げ、机上では .figure の max-width で 抑える。
      const W = 440, rowH = 58, top = 44, barW = W;
      const H = top + items.length * rowH + 30;
      const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      const fmt = (v) => Number(v).toLocaleString("ja-JP") + (fig.unit || "");
      const wrapT = (t, n) => {                       // ★見出しが 幅を 超えたら 2 行に
        if (t.length <= n) return [t];
        let cut = t.lastIndexOf("・", n);
        if (cut < n * 0.4) cut = t.lastIndexOf(" ", n);
        if (cut < n * 0.4) cut = n;
        return [t.slice(0, cut), t.slice(cut).replace(/^[ ・]/, "")];
      };
      const tl = wrapT(fig.title, 21);
      const H2 = H + (tl.length - 1) * 24;
      let svg = '<svg viewBox="0 0 ' + W + " " + H2 + '" role="img" aria-label="' + esc(fig.title) + '">';
      tl.forEach((t, i) => {
        svg += '<text x="0" y="' + (20 + i * 24) + '" class="figt">' + esc(t) + "</text>";
      });
      const shift = (tl.length - 1) * 24;
      items.forEach((it, i) => {
        const y = top + shift + i * rowH;
        const w = Math.max(3, (Math.abs(it.value) / max) * barW);
        const inside = w > W - 110;      // 棒が長いときは 値を 棒の中に 白で置く
        svg += '<text x="0" y="' + (y + 12) + '" class="figl">' + esc(it.label) + "</text>";
        if (fig.max) svg += '<rect x="0" y="' + (y + 20) + '" width="' + W + '" height="20" class="figt2"/>';
        svg += '<rect x="0" y="' + (y + 20) + '" width="' + w.toFixed(1) + '" height="20" class="figb"/>';
        svg += '<text x="' + (inside ? w - 8 : w + 8).toFixed(1) + '" y="' + (y + 36) + '" class="figv"' +
               (inside ? ' text-anchor="end" fill="#fff"' : "") + ">" + esc(fmt(it.value)) + "</text>";
      });
      // ★「864千人」が読めない、という声があった → 単位の読み方を添える (出典の数字は変えない)
      const unitNote = { "千人": "千人 = 1,000人", "万人": "万人 = 10,000人" }[fig.unit];
      const foot = [unitNote, fig.note ? "出典: " + fig.note : ""].filter(Boolean).join("  /  ");
      if (foot) svg += '<text x="0" y="' + (H - 8) + '" class="fign">' + esc(foot) + "</text>";
      return svg + "</svg>";
    },
  };

  root.HanashiCore = Core;
  if (typeof document === "undefined" || !root.HANASHI) return;

  // ★読み直し (F5) でも 一番上から 見せる。
  //   ブラウザは 既定で「前に 見ていた 高さ」に 戻すので、幕の 途中から 始まる
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // ★データを いつ 作ったか。★幕の 中と ページの 足元、両方に 出す。
  //   ★前は 幕を 開けた あとにしか 入らず、★TOP からは 見えなかった (2026-09-23 指摘)
  function showBuilt() {
    const s = "データ作成: " + root.HANASHI.builtAt;
    const a = document.getElementById("built2");
    if (a) a.textContent = s;
    const b = document.getElementById("built");
    if (b) b.textContent = " / " + s;
  }

  // ==================================================================
  // 高座 (語りの進行)
  // ==================================================================
  const H = root.HANASHI;
  const $ = (id) => document.getElementById(id);
  const LOG_KEY = "hanashiyama.log.v1";

  const BLOCKS = [
    { label: "北海道・東北", prefs: ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
    { label: "関東", prefs: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"] },
    { label: "中部", prefs: ["新潟県", "富山県", "石川県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県"] },
    { label: "近畿", prefs: ["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] },
    { label: "中国・四国", prefs: ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"] },
    { label: "九州・沖縄", prefs: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"] },
  ];

  const state = { input: { pref: "", beliefs: [], date: "" }, q0: null, current: null, shown: new Set(), sages: new Set(), asked: [], lastCorrect: null, count: 0, kin: null };
  let typing = null; // 表示中の行 { el, full, i, timer, done }
  let pending = null; // 次の一手

  // ---- 記録 -----------------------------------------------------------
  function readLog() {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function log(event, st, extra) {
    try {
      const arr = readLog();
      arr.push(Object.assign({ t: new Date().toISOString(), event, story: st ? st.id : null, title: st ? st.title : null, n: state.count, input: state.input }, extra || {}));
      localStorage.setItem(LOG_KEY, JSON.stringify(arr.slice(-2000)));
    } catch (e) {}
  }

  // ★打ち出し (1 文字ずつ) は ★噺の 命。既定は 入 (2026-09-23 ユーザー指示で 戻した)
  //   OS の「動きを減らす」設定では ★勝手に 止めず、★足元の 切り替えで 選べるようにする。
  const TYPE_KEY = "hanashiyama.type.v1";
  let typeOn = true;
  try {
    const saved = localStorage.getItem(TYPE_KEY);
    if (saved !== null) typeOn = saved === "1";
  } catch (e) {}

  // ---- 語り (1 行ずつ、間を置いて) ---------------------------------------
  function say(text, cls, after) {
    const p = document.createElement("p");
    p.className = "line " + (cls || "");
    $("talk").appendChild(p);
    scroll();
    const c2 = " " + (cls || "") + " ";
    const slow = c2.indexOf(" shi sage") >= 0 || / sage /.test(c2) ? 1.6
               : / furi /.test(c2) ? 1.3 : / suiryo /.test(c2) ? 1.2 : 1;
    typing = { el: p, full: text, i: 0, done: false, after: after || null, slow: slow };
    if (!typeOn) {                 // ★足元で「一度に出す」を 選んだとき
      typing.i = text.length;
      step();
      return;
    }
    step();
  }

  /** 打ち終わった行に 強弱を つける (声の 大小の 代わり)。
   *  数字と 鉤括弧だけを 立てる。★文言は 変えない */
  function deco(text) {
    const esc = (x) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    return esc(text)
      .replace(/([0-9０-９][0-9０-９,\.]*)\s*((?:千|万)?(?:人|頭|羽|株|本|体|基|園|席|か所|種|件|年|月|日|時間|分|円|%|％))?/g,
        (m, n, u) => '<b class="kazu">' + n + (u || "") + "</b>")
      .replace(/「([^」]{1,30})」/g, '<em class="kagi">「$1」</em>')
      // ★傍点 — 台本で 〈…〉 と 囲んだ ところ。太字より 弱く、話芸の 抑揚に 近い
      .replace(/〈([^〉]{1,20})〉/g, '<em class="ten">$1</em>');
  }

  function land(t) {
    t.el.innerHTML = deco(t.full);
  }

  /** ★一字ごとの 速さ。声の 抑揚の 代わりに ★速さで 強弱を つける
   *    ・数字と 単位      … ゆっくり (聞かせどころ)
   *    ・〈傍点〉の 中     … いちばん ゆっくり
   *    ・「鉤括弧」の 中   … 少し ゆっくり
   *    ・サゲ・振り        … 行ぜんたいを ゆっくり
   *    ・読点で 一拍、句点で 二拍
   */
  const SPEED = { base: 32, kagi: 52, kazu: 86, ten: 120, ten_line: 1.5 };
  function waitFor(t) {
    const i = t.i - 1;
    const c = t.full[i];
    if (c === "、") return 300;
    if (c === "。" || c === "?" || c === "？") return 420;
    if (c === "…") return 200;
    let w = SPEED.base;
    if (/[0-9０-９]/.test(c) || /[0-9０-９][,，\.]?$/.test(t.full.slice(Math.max(0, i - 1), i))) w = SPEED.kazu;
    // 括弧の 内側か どうかは、そこまでの 開き括弧の 数で 見る
    const upto = t.full.slice(0, t.i);
    const inTen = (upto.split("〈").length - 1) > (upto.split("〉").length - 1);
    const inKagi = (upto.split("「").length - 1) > (upto.split("」").length - 1);
    if (inTen) w = SPEED.ten;
    else if (inKagi) w = Math.max(w, SPEED.kagi);
    if (t.slow) w = Math.round(w * t.slow);
    return w;
  }

  function step() {
    if (!typing) return;
    const t = typing;
    if (t.i >= t.full.length) {
      t.done = true;
      if (t.full) land(t);
      const ch = t.full.slice(-1);
      const pause = ch === "。" || ch === "?" || ch === "？" ? 700 : 350;
      t.timer = setTimeout(() => {
        typing = null;
        if (t.after) t.after();
      }, pause);
      return;
    }
    t.el.textContent = t.full.slice(0, ++t.i);
    keepBottom();
    t.timer = setTimeout(step, waitFor(t));
  }

  /** タップ: 表示中なら全文表示、表示済みなら次へ */
  function hurry() {
    if (!typing) return;
    const t = typing;
    clearTimeout(t.timer);
    if (!t.done) {
      t.el.textContent = t.full;
      t.i = t.full.length;
      t.done = true;
      if (t.full) land(t);
      t.timer = setTimeout(() => {
        typing = null;
        if (t.after) t.after();
      }, 200);
    } else {
      typing = null;
      if (t.after) t.after();
    }
  }

  /** 打っている最中は、行の下端が画面に収まるまでだけ追う (画面が跳ねないように) */
  function keepBottom() {
    if (!typing) return;
    const r = typing.el.getBoundingClientRect();
    const margin = 160; // 選択肢と足元のぶん
    if (r.bottom > window.innerHeight - margin) {
      window.scrollBy(0, r.bottom - (window.innerHeight - margin));
    }
  }

  function scroll() {
    requestAnimationFrame(() => {
      const last = $("choices").lastElementChild || $("talk").lastElementChild;
      if (!last) return;
      const r = last.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 90) {
        window.scrollBy({ top: r.bottom - (window.innerHeight - 90), behavior: "smooth" });
      }
    });
  }

  function ask(choices, onPick) {
    const box = $("choices");
    box.innerHTML = "";
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "btn choice";
      b.textContent = c.label;
      b.addEventListener("click", () => {
        box.innerHTML = "";
        const me = document.createElement("p");
        me.className = "line kyaku";
        me.textContent = c.label;
        $("talk").appendChild(me);
        scroll();
        onPick(c.value, c.label);
      });
      box.appendChild(b);
    });
    scroll();
  }

  /** オチの直前の 空白。★声なら 息を のむ ところ (法則2) */
  function blank(after) {
    const b = document.createElement("div");
    b.className = "ma";
    $("talk").appendChild(b);
    scroll();
    const t = { el: b, full: "", i: 0, done: true, after: after };
    typing = t;
    t.timer = setTimeout(() => { if (typing === t) { typing = null; after(); } }, 1600);
  }

  // ---- 場面の挿し絵 (まくらのあとに1枚) ---------------------------------
  /** 噺家のしぐさの代わり。★2026-09-23: 手描きの絵は抽象的すぎたので、
   *  関係する写真を ★小さく 出す形に変えた (鯖江市オープンデータ CC BY 2.1 JP) */
  const smallUsed = {};
  function smallPhoto(st) {
    const bank = root.HANASHI_IMG && root.HANASHI_IMG._small;
    if (!bank) return null;
    // ★まくらは どの席も レジの失敗談なので、場所選びの手がかりから外す
    const t = [st.furi, Core.hondaiText(st), st.sage, st.title].join(" ");
    // ★噺に出てくる「場所」を先に見て、それが無ければ 季節・生きもの、
    //   どれにも当たらなければ その公園の景色 (2026-09-23)
    const PLACE = [
      [/パンダらんど|こぱんだらんど|遊具|すべり台|寝耳/, "pandarando"],
      [/祈りの道|お地蔵|地蔵|石像|石仏|ドラえもん/, "inorinomichi"],
      [/愛の鐘|鐘/, "ainokane"],
      [/噴水/, "funsui"],
      [/花菖蒲|北の庭|藤/, "kitanoniwa"],
      [/展望台/, "tenbodai"],
      [/松堂|茶室|呈茶/, "shodoan"],
      [/道の駅|交流室|駅長/, "michinoeki"],
      [/嚮陽会館/, "kyoyokaikan"],
      [/三十三間堂|信仰の道/, "sanjusan"],
      [/西山橋|夜|灯り|イルミ/, "nishiyamabashi"],
      [/嚮陽渓|上段の庭|庭を造|鋤|鍬/, "jodan"],
      [/歴史公園|百選|年表/, "rekishinomichi"],
      [/芝生|まつり|祭り|広場/, "shibafu"],
      [/結び|チャイム/, "musubi"],
      [/リスザル|ルトン|テナガザル|鳥類|けもの/, "zoo"],
      [/紅葉|もみじ|秋/, "koyo"],
      [/レッサーパンダ|パンダ|動物園|双子|赤ちゃん|獣/, "panda"],
      [/つつじ|ツツジ|株|花|春/, "tsutsuji"],
    ];
    let key = null;
    for (let i = 0; i < PLACE.length; i += 1) {
      if (PLACE[i][0].test(t) && bank[PLACE[i][1]]) { key = PLACE[i][1]; break; }
    }
    if (!key) key = ["tsutsuji", "koyo", "koen"][Math.floor(Math.random() * 3)];
    const g = key && bank[key];
    if (!g || !g.shots || !g.shots.length) return null;
    const used = smallUsed[key] || (smallUsed[key] = []);
    let pool = g.shots.map((_, i) => i).filter((i) => used.indexOf(i) < 0);
    if (!pool.length) { used.length = 0; pool = g.shots.map((_, i) => i); }
    const idx = pool[Math.floor(Math.random() * pool.length)];
    used.push(idx);
    const sh = g.shots[idx];
    return { shot: sh, credit: sh.credit || g.credit, label: g.label };
  }

  function showScene(st, after) {
    const pick = smallPhoto(st);
    if (!pick) return after();
    const box = document.createElement("figure");
    box.className = "shashin";
    const im = document.createElement("img");
    im.src = pick.shot.dataUri;
    im.alt = "西山公園の写真";
    im.loading = "eager";
    const cap = document.createElement("figcaption");
    cap.textContent = pick.credit;
    if (pick.label) im.alt = pick.label;
    box.appendChild(im);
    box.appendChild(cap);
    $("talk").appendChild(box);
    scroll();
    const t = { el: box, full: "", i: 0, done: true, after: after };
    typing = t;
    t.timer = setTimeout(() => { if (typing === t) { typing = null; after(); } }, 900);
  }

  // ---- 数字の絵図 (本題で1枚) ------------------------------------------
  function showFig(fig, after) {
    const svg = Core.figSvg(fig);
    if (!svg) return after();
    const box = document.createElement("figure");
    box.className = "figure";
    box.innerHTML = svg;
    $("talk").appendChild(box);
    scroll();
    // ★見ている間もタップで先へ行けるように、打ち終わった行と同じ扱いにする
    const t = { el: box, full: "", i: 0, done: true, after: after };
    typing = t;
    t.timer = setTimeout(() => { if (typing === t) { typing = null; after(); } }, 1400);
  }

  // ---- 流れ ------------------------------------------------------------
  /** ★v2: 入口を 増やす (2026-09-23)
   *  file:// でも 動かすため、path ではなく ?kin=<slug> で 入口を 分ける。
   *  ★入口は 入口であって 出口では ない。どの入口から 来ても
   *    最後は 必ず 西山公園の 噺へ 送る (下の nextStory)。
   */
  function entry() {
    const q = new URLSearchParams(location.search);
    const kin = (q.get("kin") || "").replace(/[^a-z0-9_-]/g, "");
    const bank = (root.HANASHI_KIN && root.HANASHI_KIN.items) || [];
    const zoo = kin ? bank.find((z) => z.slug === kin ||
                                       (z.aliases || []).indexOf(kin) >= 0) : null;
    return { zoo: zoo || null, date: (q.get("date") || "").match(/^\d{4}-\d{2}-\d{2}$/) ? q.get("date") : null };
  }

  /** @param zoo 一覧から選ばれた園 (無ければ ?kin= を見る) */
  function open(zoo) {
    $("maku").hidden = true;
    $("kin").hidden = true;
    $("koza").hidden = false;
    // ★足元の 権利表示は 高座に 入ってから。
    //   ★幕は それ自体が 画面いっぱいなので、下に 覗くと
    //   ★幕の 注意書きと 同じことが 二度 並ぶ (2026-09-23 指摘)
    $("foot").hidden = false;
    window.scrollTo(0, 0);
    const e = entry();
    state.input.date = e.date || Core.todayString();
    state.kin = zoo || e.zoo;
    if (state.kin && state.kin.pref) state.input.pref = state.kin.pref;  // 県は 聞かずに 済む
    // ★一覧から 選んだときに URL は 書き換えない。
    //   書き換えると ★リロード / F5 で その園に 貼り付いてしまう (2026-09-23 に 発覚)。
    //   ?kin= を 手で 打った人は entry() が 拾うので、入口としては 生きている。
    greet();
  }

  function greet() {
    if (state.kin) return greetKin(state.kin);
    say("えー、いらっしゃいまし。道の駅西山公園のレジに立っております、はなし山と申します。", "shi", () =>
      say("はい、これは鯖江の公園の話でございます。宣伝でございます。", "shi", () =>
        say("ただ、レジに立っておりますと、数字のほうが、どうもおかしいんで。", "shi", () =>
          say("一席お付き合いいただいて、ちょっと気になった——そのくらいになれば上出来でございます。", "shi", askWant)
        )
      )
    );
  }

  /** ★園の入口から 来た人への 名乗り。その園に 鯖江うまれが いることから 入る */
  function greetKin(z) {
    const nm = z.name;
    say("えー、" + nm + "から お越しでございますか。", "shi", () =>
      say("わたくし、福井県鯖江市、道の駅西山公園のレジに立っております、はなし山と申します。", "shi", () =>
        say("はい、これは鯖江の公園の話でございます。宣伝でございます。", "shi", () =>
          say("ただ、ひとつ申し上げたいことがございまして。", "shi", () =>
            say("その " + nm + " におります レッサーパンダ。記録をたどりますと、うちから渡った子が おるのでございます。", "shi", () =>
              say("一席お付き合いいただいて、ちょっと気になった——そのくらいになれば上出来でございます。", "shi", askWant)
            )
          )
        )
      )
    );
  }

  function askWant() {
    say("そこで、はじめと終わりに同じことを伺います。まず、正直なところを。西山公園、行ってみたい気持ちは、おありで?", "shi", () =>
      ask(
        [
          { label: "いや、べつに", value: 1 },
          { label: "ふつう", value: 3 },
          { label: "行きたい", value: 5 },
        ],
        (v, label) => {
          state.q0 = v;
          state.q0label = label;
          log("q0", null, { value: v });
          const r = v === 1 ? "結構でございます。わたくしも、ここに立つまではそうでした。" : v === 3 ? "正直でよろしい。わたくしも長らくそうでございました。" : "おや、奇特なお方だ。";
          say(r, "shi", askPref);
        }
      )
    );
  }

  function askPref() {
    if (state.kin && state.input.pref) {                 // 入口で 分かっている
      return say("お住まいは、" + state.input.pref + "のあたりで?", "shi", () =>
        ask([{ label: "はい", value: 1 }, { label: "いや、別のところ", value: 0 }], (v) => {
          if (v) return say("さようで。", "shi", askFree);
          state.input.pref = "";
          askBlock();
        })
      );
    }
    say("ときに、お客さん。どちらからお越しで?", "shi", () =>
      ask(
        [
          { label: "この福井から", value: "福井県" },
          { label: "県外から", value: "__out" },
          { label: "言わずにおく", value: "" },
        ],
        (v) => {
          if (v === "__out") return askBlock();
          state.input.pref = v;
          const r = v === "福井県" ? "お膝元でございますか。レジでいちばん手強いのが、地元のお客さんで。" : "遠いところを、ようこそ。";
          say(r, "shi", askFree);
        }
      )
    );
  }

  function askBlock() {
    say("ほう。どのあたりで?", "shi", () =>
      ask(
        BLOCKS.map((b) => ({ label: b.label, value: b.label })).concat([{ label: "やっぱり言わない", value: "" }]),
        (v) => {
          if (!v) return say("結構でございます。", "shi", askFree);
          const block = BLOCKS.find((b) => b.label === v);
          ask(block.prefs.map((p) => ({ label: p, value: p })), (p) => {
            state.input.pref = p;
            say("遠いところを、ありがとうございます。", "shi", askFree);
          });
        }
      )
    );
  }

  function askFree() {
    say("ほかに、お好きなものがあれば。ひとことで結構でございます。", "shi", () => {
      const box = $("choices");
      box.innerHTML = "";
      const form = document.createElement("form");
      form.className = "freeform";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "例: 旭山動物園 / 城めぐり / 雪";
      input.setAttribute("aria-label", "お好きなもの");
      input.setAttribute("enterkeyhint", "send");
      const ok = document.createElement("button");
      ok.type = "submit";
      ok.className = "btn choice";
      ok.textContent = "言ってみる";
      const skip = document.createElement("button");
      skip.type = "button";
      skip.className = "btn choice";
      skip.textContent = "とくに無い";
      // ★ボタンは 打ち込み口と ★別の行に 分ける (2026-09-23)。
      //   ★同じ行に 置くと、幅が 足りないとき ★ボタンが 縮められ、
      //   ★枠だけ 残って 中の字が 消える。★縮みようの ない 組み方に する。
      const row = document.createElement("div");
      row.className = "freebtn";
      row.append(ok, skip);
      form.append(input, row);
      box.appendChild(form);
      // ★スマホでは 触れて 初めて 文字盤を 出す。
      //   先に 出すと 文字盤が 下半分を 覆い、下の ボタンが 隠れる (2026-09-23)
      if (!(root.matchMedia && root.matchMedia("(max-width: 640px)").matches)) input.focus();
      const done = (text) => {
        box.innerHTML = "";
        if (text) {
          const me = document.createElement("p");
          me.className = "line kyaku";
          me.textContent = text;
          $("talk").appendChild(me);
        }
        const m = Core.match(H, text || "");
        // ★辞書に 当たった = 客が 手がかりを 出した。一席目の固定より こちらを 立てる
        state.gaveHandle = m.hits.length > 0;
        // ★記録に 生の入力を 長く残さない (辞書を育てるのに要る ぶんだけ)
        log("free", null, { text: (text || "").slice(0, 30), hit: m.hits.map((h) => h.word).slice(0, 5) });
        if (!m.hits.length) return say(text ? "ほう、" + text + "。……それにちなんだ噺は、まだ持っておりません。こちらから伺います。" : "さようで。では、こちらから伺います。", "shi", askBelief);
        if (m.pref && !state.input.pref) state.input.pref = m.pref;
        if (m.belief) {
          if (!state.input.beliefs.includes(m.belief)) state.input.beliefs.push(m.belief);
          return say("ほう、" + m.hits[0].word + "。よろしゅうございます。", "shi", () => begin(m.belief));
        }
        say("ほう、" + m.hits[0].word + "。", "shi", () => begin(null));
      };
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        done(input.value.trim());
      });
      skip.addEventListener("click", () => done(""));
      scroll();
    });
  }

  function askBelief() {
    const order = Core.askOrder(H, state.input.pref).filter((b) => !state.asked.includes(b.id));
    if (!order.length) return afterBeliefs();
    const b = order[0];
    state.asked.push(b.id);
    say("ひとつ伺いますが、「" + b.label + "」。そう思っておいでで?", "shi", () =>
      ask(
        [
          { label: "思う", value: true },
          { label: "いや、どうだか", value: false },
        ],
        (yes) => {
          if (yes) {
            state.input.beliefs.push(b.id);
            say("でしょうな。では、その話を一席。", "shi", () => begin(b.id));
          } else if (state.asked.length >= 3) {
            (state.denied = state.denied || []).push(b.id);
            say("手強いお客さんだ。では、今日という日で一席。", "shi", begin);
          } else {
            (state.denied = state.denied || []).push(b.id);
            say("さようで。", "shi", askBelief);
          }
        }
      )
    );
  }

  function afterBeliefs() {
    say("伺うことは、これくらいで。", "shi", begin);
  }

  // ★トップの 一席目は 観光地の噺で 固定 (SPEC §11)
  // ★2026-09-23 に 範囲を 狭めた: ★「手がかりを もらっていない ときだけ」掛ける。
  //   ★前は 客が「動物園」と 打っても、「思う」と 答えても この固定が 勝ち、
  //     ★「では、その話を一席」と 言った 直後に 新幹線の噺が 出ていた。
  //   ★§11 の ねらいは「既定で 動物の噺から 始めない」こと であって、
  //     ★客が 自分で 言ったものを 握りつぶす ことでは ない。
  //   昨年の 応募 6 件は ★全件が レッサーパンダ題材。トップで 動物園の話が 出ると
  //   構造が まるで 違っても「去年の 焼き直し」に 見える。
  //   ★血統・動物の 噺は ★園の 入口 (?kin=) から 来た人と、二席目以降に 回す。
  const TOP_FIRST = ["S11", "S12", "S08"];   // 新幹線 / 恐竜との落差 / コンサートの夜

  function begin(preferBelief) {
    // ★TOP_FIRST は「手がかりが 何も 無いとき の 一席目」。
    //   ★客が「動物園」と 言ったのに 新幹線の噺を 出しては いけない (2026-09-23 指摘)。
    //   ★昨年と 似て見えるのを 避けるのが 目的なので、★客が 自分で 言った ときは 外す。
    if (!state.kin && state.count === 0 && !preferBelief && !state.gaveHandle) {
      // ★県を いただいていたら ★その県の 手書きの噺から 始める。
      //   ★README の 決まり 1「あなたの県から 始める」。
      //   ★TOP_FIRST が これを 押しのけていて、★県の噺が 一度も 出ていなかった
      //     (2026-09-23 指摘「あなたの県からの始まりが 一度も 当たりません」)。
      //   ★自動生成の 県の噺 (prefStories) は レッサーパンダ題材なので ここでは 使わない
      //     —— ★§11 の「既定で 動物の噺から 始めない」は 残す。
      //   ★否定された 思い込みの 噺は 外す。★「そうは思わない」と 言われた ものを
      //     ひっくり返しても、客の 中では もう 立っていない。
      const denied = state.denied || [];
      const mine = state.input.pref
        ? H.stories
            .filter((s) => (s.hooks.prefectures || []).includes(state.input.pref))
            .filter((s) => !state.shown.has(s.id))
            .filter((s) => !(s.hooks.beliefs || []).some((b) => denied.includes(b)))
            .sort((a, b) => (b.strength || 1) - (a.strength || 1))
        : [];
      if (mine.length) {
        state.chosenBy = "pref";
        return tell(mine[0]);
      }
      const pick = TOP_FIRST
        .map((id) => H.stories.find((x) => x.id === id))
        .filter((x) => x && !state.shown.has(x.id));
      if (pick.length) {
        state.chosenBy = "top";
        return tell(pick[Math.floor(Math.random() * pick.length)]);
      }
    }
    const got = Core.choose(H, state.input, preferBelief, [...state.shown], [...state.sages]);
    if (!got) {
      log("silent", null);
      say("いただいた手がかりの噺は、ここまででございます。レジの在庫切れでございます。", "shi", () =>
        say("では、こちらで見繕いましょう。", "shi", () =>
          ask([{ label: "お願いします", value: 1 }, { label: "また来る", value: 0 }], (v) => {
            if (!v) return say("ごゆるりと。", "shi");
            const any = H.stories.filter((x) => !state.shown.has(x.id)).sort((x, y) => (y.strength || 1) - (x.strength || 1))[0];
            if (!any) return say("種切れでございます。", "shi");
            state.chosenBy = "any";
            tell(any);
          })
        )
      );
      return;
    }
    state.chosenBy = got.chosenBy;
    state.switchNote = got.switchNote;
    tell(got.story);
  }

  function tell(st) {
    state.current = st;
    state.shown.add(st.id);
    state.count += 1;
    state.lastCorrect = null;
    state.sages.add(st.sage);
    $("sageBox").hidden = true;
    $("sources").hidden = true;
    $("mekuri").textContent = st.title;
    $("mekuri").classList.remove("flip");
    void $("mekuri").offsetWidth;
    $("mekuri").classList.add("flip");
    log("shown", st);
    const head = [];
    if (state.switchNote) {
      head.push(state.switchNote);
      state.switchNote = null;
    }
    if (state.chosenBy === "pref" && state.input.pref && !(st.bridge || "").includes(state.input.pref)) {
      head.push(state.input.pref + "のお客さんに、ひとつ。");
    }
    // 振り = ★何の噺かを 名乗り、客の 頭に 問いを 立てる (★答えは 言わない)
    // ★本題は 地の文 (文字列) と 台詞 ({who, text}) を 混ぜられる (圓朝の 一字+カギ括弧)
    const lines = head.concat(st.bridge ? [st.bridge] : [], st.furi ? [st.furi] : [],
                              [st.makura], st.hondai || []);
    let i = 0;
    let figShown = false, sceneShown = false, guessShown = false;
    const next = () => {
      const makuraAt = head.length + (st.bridge ? 1 : 0) + (st.furi ? 1 : 0);
      // まくらを 言い終わったら、場面の絵を 1 枚 (しぐさの代わり)
      if (i === makuraAt + 1 && !sceneShown) {
        sceneShown = true;
        return showScene(st, next);
      }
      if (i >= lines.length && st.fig && (st.fig.when || "hondai") === "hondai" && !figShown) {
        figShown = true;
        return say("ひとつ、数字をお目にかけます。", "shi", () => showFig(st.fig, next));
      }
      if (i < lines.length) {
        const furiAt = head.length + (st.bridge ? 1 : 0);
        let cls = i === makuraAt ? "shi makura" : (st.furi && i === furiAt ? "shi furi" : "shi");
        let text = lines[i];
        if (text && typeof text === "object") {          // 台詞
          cls = "serifu " + (text.who === "客" ? "kyaku2" : "watashi");
          text = text.who + "「" + text.text + "」";
        }
        say(text, cls, () => {
          i += 1;
          next();
        });
      } else if (st.guess && !guessShown) {
        // 出典に「なぜ」が無いとき、噺家が引き受けて推し量る (事実としては語らない)
        guessShown = true;
        return say(st.guess, "shi suiryo", next);
      } else if (st.question) {
        say("さて、ここでひとつ、伺いましょう。", "shi", () =>
          say(st.question.text, "shi toi", () =>
          ask(
            st.question.choices.map((c, j) => ({ label: c, value: j })),
            (j) => {
              const ok = j === st.question.answer;
              state.lastCorrect = ok;
              log(ok ? "answer_correct" : "answer_wrong", st);
              // ★外れの 返しは ★選んだ札ごとに 変えられる (2026-09-23)。
              //   ★「もっと多いんで」は ★答えより 小さい札を 選んだ人にしか 合わない。
              //   ★答えを 通り越した人に 言うと ★逆のことを 言うことに なる。
              //   ★wrongEach[選んだ番号] が あれば そちら。無ければ これまで通り wrong。
              const rep = st.reply || {};
              const each = rep.wrongEach && rep.wrongEach[j];
              const r = (ok ? rep.correct : (each || rep.wrong)) || (ok ? "ご名答。" : "それが、違うんで。");
              // ★オチの 直前に 空白を 置く (法則2: 笑いを 一度 切ってから 落とす)
              const toSage = () => say("さて、ここからがオチでございます。", "shi",
                                       () => blank(sage));
              // 答えが写ってしまう絵図は、答え合わせのあとで見せる
              const afterFig = st.fig && st.fig.when === "after"
                ? () => say("答えは、この一枚で。", "shi", () => showFig(st.fig, toSage))
                : toSage;
              say(r, "shi", afterFig);
            }
          )
          )
        );
      } else {
        say("さて、ここからがオチでございます。", "shi", () => blank(sage));
      }
    };
    next();
  }

  function sage() {
    const st = state.current;
    say(st.sage + Core.sageExtra(st, state.input.date), "shi sage", () => {
      const then = () => uwasa(st, () => afterSage(st));
      if (st.atogaki) return say(st.atogaki, "shi ato", then);
      then();
    });
  }

  /** 数字が割れているところは、一覧で見せずに「噂ですが」の一言として置く */
  function uwasa(st, after) {
    const u = st.uwasa && st.uwasa.text;
    if (!u) return after();
    say(u, "shi uwasa", after);
  }

  function afterSage(st) {
    // ★札は「出します」と言ってから出す (黙って出ると 何の絵か 分からない)
    say("ここで、今日のオチを書いた札を一枚、お出しします。", "shi", () => showCard(st));
  }

  function showCard(st) {
    {
      drawCard(st);
      renderSources(st);
      $("sageBox").hidden = false;
      scroll();
      const first = state.q0label ? "はじめに伺ったときは、「" + state.q0label + "」でございました。" : "はじめに、お気持ちを伺いました。";
      say(first, "shi", () =>
        say("いま、いかがです。西山公園、行ってみたい気持ちは。", "shi", () =>
        ask(
          [
            { label: "やっぱり、べつに", value: 1 },
            { label: "ふつう", value: 3 },
            { label: "行ってみたい", value: 5 },
          ],
          (v) => {
            const d = state.q0 == null ? null : v - state.q0;
            log("q1", st, { value: v });
            if (d != null) log("delta", st, { delta: d, before: state.q0, after: v });
            state.q0 = v; // 次の席は、いまの気持ちを基準に測る
            state.q0label = null;
            const r = d > 0 ? "おや。ひとつ動きましたな。" : d === 0 ? "動きませんか。精進いたします。" : "しくじりました。次で挽回を。";
            say(r, "shi", () => say("よろしければ、お持ちを。", "shi"));
          }
        )
        )
      );
    }
  }

  function renderSources(st) {
    const box = $("sources");
    box.innerHTML = "";
    const ul = document.createElement("ul");
    Core.factsOf(H, st).forEach((f) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = f.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = f.source;
      const bq = document.createElement("blockquote");
      bq.textContent = f.quote;
      li.appendChild(a);
      li.appendChild(bq);
      ul.appendChild(li);
    });
    (st.extraSources || []).forEach((x) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = x.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = x.source;
      li.appendChild(a);
      if (x.quote) {
        const bq = document.createElement("blockquote");
        bq.textContent = x.quote;
        li.appendChild(bq);
      }
      ul.appendChild(li);
    });
    if (st.generated) {
      const li = document.createElement("li");
      li.textContent = "この噺は、公開データから組み立てています。";
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }

  function nextStory() {
    $("choices").innerHTML = "";
    $("sageBox").hidden = true;
    // ★同じ 思い込みで 二席 続けない (続けると「さっきと同じ話」に なる)
    const usedB = new Set();
    Core.allStories(H)
      .filter((s) => state.shown.has(s.id))
      .forEach((s) => ((s.hooks || {}).beliefs || []).forEach((b) => usedB.add(b)));
    const rest = state.input.beliefs.filter((b) => !usedB.has(b));
    const last = rest[rest.length - 1] || null;
    // ★出口固定 (SPEC §2)。園の入口は「入口」であって「出口」では ない。
    //   よその園の話で 終わらせず、★必ず 西山公園そのものの 噺へ 送る。
    if (state.kin && !state.sentHome) {
      state.sentHome = true;
      return say("さて、" + state.kin.name + "の話は ここまでで。", "shi", () =>
        say("ここからは、その子らが 生まれた 山の話を ひとつ。", "shi", () => begin(last))
      );
    }
    say("では、次のお客さんの話を、もう一席。", "shi", () => begin(last));
  }

  // ---- 全国の園からの入口 (?kin=<slug>) ----------------------------------
  /** ★入口を 増やすための 一覧。ここから 入ると 県を 聞かずに 済み、
   *  「あなたの町の園に 鯖江うまれが いる」から 噺が 始まる。★出口は 必ず 西山公園。 */
  function showKin() {
    const bank = (root.HANASHI_KIN && root.HANASHI_KIN.items) || [];
    const body = $("kinBody");
    body.innerHTML = "";
    // ★国内だけ。海外 8 件は「国・都市名」であって 施設名では ないので 入口に しない
    const dom = bank.filter((z) => z.pref);
    const withSabae = dom.filter((z) => (z.sabae_born || 0) > 0).length;
    $("kinNote").textContent = dom.length
      ? "鯖江市の公開している家系図に名前の出てくる園です。お客さんの町の園を選ぶと、そこから一席はじまります。"
        + "（図から機械で読み取ったもので、園の名前は推定を含みます）"
      : "園のデータがまだ入っていません。";
    const byPref = {};
    dom.forEach((z) => { (byPref[z.pref] = byPref[z.pref] || []).push(z); });
    Object.keys(byPref).forEach((pref) => {
      const h = document.createElement("p");
      h.className = "kinpref";
      h.textContent = pref;
      body.appendChild(h);
      const g = document.createElement("div");
      g.className = "kingrid";
      byPref[pref].sort((a, b) => (b.total || 0) - (a.total || 0)).forEach((z) => {
        const a = document.createElement("button");
        a.type = "button";
        a.textContent = z.name;
        a.addEventListener("click", (ev) => { ev.stopPropagation(); open(z); });
        if (z.needs_verify) {
          const b = document.createElement("b");
          b.textContent = "名前は推定";
          a.appendChild(b);
        }
        g.appendChild(a);
      });
      body.appendChild(g);
    });
    $("kin").hidden = false;
  }

  // ---- 場 --------------------------------------------------------------
  function clearLog() {
    if (!window.confirm("この端末に貯めた記録を、すべて消します。よろしいですか。")) return;
    try { localStorage.removeItem(LOG_KEY); } catch (e) {}
    $("baBody").textContent = "記録を消しました。";
  }

  function showBa() {
    const { stories, prefs } = Core.ba(readLog());
    const body = $("baBody");
    body.innerHTML = "";
    if (!stories.length) {
      body.textContent = "まだ記録がありません。一席聞いて、前と後の気持ちに答えると貯まります。";
    } else {
      body.appendChild(table("噺", stories.map((r) => [r.title || r.key, r.n + " 回", fmt(r.avg)])));
      body.appendChild(table("どちらから", prefs.map((r) => [r.key, r.n + " 回", fmt(r.avg)])));
    }
    $("ba").hidden = false;
  }
  function fmt(v) {
    return (v > 0 ? "+" : "") + v.toFixed(1);
  }
  function table(head, rows) {
    const t = document.createElement("table");
    t.className = "batable";
    t.innerHTML = "<thead><tr><th>" + head + "</th><th>回数</th><th>気持ちの動き</th></tr></thead>";
    const tb = document.createElement("tbody");
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      r.forEach((c) => {
        const td = document.createElement("td");
        td.textContent = c;
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }

  // ---- オチ札 -----------------------------------------------------------
  function drawCard(st) {
    const cv = $("card");
    const ctx = cv.getContext("2d");
    const W = cv.width, Hh = cv.height;
    const serif = '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", serif';
    const sans = '"Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif';
    const img = pickPhoto(st);

    const paint = () => {
      ctx.fillStyle = "#fbf7ee";
      ctx.fillRect(0, 0, W, Hh);
      const hasImg = img && img.el.complete && img.el.naturalWidth;
      if (hasImg) {
        ctx.drawImage(img.el, 0, 0, W, 480);
        // ★白い花の上に白文字が乗ると読めない → 上端に暗い帯を敷く
        const top = ctx.createLinearGradient(0, 0, 0, 150);
        top.addColorStop(0, "rgba(20,16,12,0.62)");
        top.addColorStop(1, "rgba(20,16,12,0)");
        ctx.fillStyle = top;
        ctx.fillRect(0, 0, W, 150);
        const g = ctx.createLinearGradient(0, 290, 0, 480);
        g.addColorStop(0, "rgba(251,247,238,0)");
        g.addColorStop(1, "rgba(251,247,238,1)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 290, W, 190);
      }
      ctx.fillStyle = "#b8322a";
      ctx.fillRect(0, 0, W, 26);
      ctx.fillRect(0, Hh - 26, W, 26);

      ctx.textBaseline = "middle";
      ctx.font = "34px " + sans;
      ctx.fillStyle = hasImg ? "#fff" : "#6d6256";
      if (hasImg) {          // ★写真の明るい所でも 輪郭が残るように
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 1;
      }
      ctx.textAlign = "left";
      ctx.fillText(state.kin ? state.kin.name + "のお客さんへ"
                             : state.input.pref ? state.input.pref + "のお客さんへ" : "お越しの方へ", 60, 72);
      ctx.textAlign = "right";
      ctx.fillText(state.input.date + "  " + state.count + "席目", W - 60, 72);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.textAlign = "center";
      ctx.fillStyle = "#1d1a16";
      ctx.font = "52px " + serif;
      wrap(ctx, st.card.top, W / 2, 620, W - 160, 70);
      const big = st.card.big.split("\n");
      let size = big.some((l) => l.length > 9) ? 100 : 126;
      ctx.font = "bold " + size + "px " + serif;
      // 1 行が 札の幅を 超えるときは 収まるまで 小さくする
      while (size > 56 && big.some((l) => ctx.measureText(l).width > W - 120)) {
        size -= 6;
        ctx.font = "bold " + size + "px " + serif;
      }
      const total = big.length * size * 1.25;
      big.forEach((line, i2) => ctx.fillText(line, W / 2, 900 - total / 2 + size * 0.62 + i2 * size * 1.25));

      ctx.font = "34px " + serif;
      ctx.fillStyle = "#4a4036";
      wrap(ctx, st.card.bottom, W / 2, Hh - 240, W - 160, 48);

      if (state.lastCorrect !== null) {
        // ★「× 外れ」だけだと 何の × か 分からない → 何の結果かを 添える
        ctx.textAlign = "left";
        ctx.font = "26px " + sans;
        ctx.fillStyle = "#6d6256";
        ctx.fillText("この噺の問い", 60, Hh - 148);
        ctx.font = "38px " + sans;
        ctx.fillStyle = state.lastCorrect ? "#b8322a" : "#6d6256";
        ctx.fillText(state.lastCorrect ? "○ ご名答" : "× 惜しい", 60, Hh - 110);
      }
      ctx.textAlign = "center";
      ctx.font = "22px " + sans;
      ctx.fillStyle = "#6d6256";
      wrap(ctx, (img ? img.credit + " / " : "") + "語りの出典はアプリ内「タネ明かし」", W / 2, Hh - 60, W - 120, 28);

      ctx.fillStyle = "#b8322a";
      ctx.fillRect(W - 230, Hh - 172, 160, 84);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 40px " + serif;
      ctx.fillText("はなし山", W - 150, Hh - 130);
    };
    if (img && !img.el.complete) img.el.onload = paint;
    paint();
  }

  /** 噺に合う写真を選ぶ。★もう一席で 同じ絵が 続かないよう、群の中から 散らす */
  const photoCache = {};
  const photoUsed = {};
  function pickPhoto(st) {
    const bank = root.HANASHI_IMG;
    if (!bank) return null;
    const text = st.makura + " " + Core.hondaiText(st) + " " + st.sage;
    const key = /紅葉|もみじ|秋/.test(text) && bank.koyo ? "koyo" : "tsutsuji";
    const g = bank[key];
    if (!g || !g.shots || !g.shots.length) return null;
    // まだ出していない 1 枚から選ぶ。出し切ったら ひと回りさせる
    const used = photoUsed[key] || (photoUsed[key] = []);
    let pool = g.shots.map((_, i) => i).filter((i) => used.indexOf(i) < 0);
    if (!pool.length) {
      used.length = 0;
      pool = g.shots.map((_, i) => i);
    }
    const idx = pool[Math.floor(Math.random() * pool.length)];
    used.push(idx);
    const id = key + ":" + idx;
    if (!photoCache[id]) {
      const el = new Image();
      el.src = g.shots[idx].dataUri;
      photoCache[id] = { el, credit: g.credit };
    }
    return photoCache[id];
  }

  function wrap(ctx, text, x, y, maxW, lh) {
    const lines = [];
    let line = "";
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + (i - (lines.length - 1) / 2) * lh));
  }

  function saveCard() {
    const st = state.current;
    $("card").toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hanashiyama_" + st.id + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    log("saved", st);
  }

  /** ★札の 文を 写す。★画像より 軽く、そのまま 人に 渡せる。
   *  外へは 送らない (クリップボードに 置くだけ)。 */
  function copyCard() {
    const st = state.current;
    const line = [
      st.card.big.split("\n").join(""),
      "— " + (st.sage || ""),
      "はなし山 / 福井県鯖江市 西山公園",
      st.card.bottom,
    ].join("\n");
    const done = () => {
      $("copyCard").textContent = "写しました";
      setTimeout(() => { $("copyCard").textContent = "オチの文を写す"; }, 1600);
      log("copied", st);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(line).then(done, () => fallback(line, done));
      } else fallback(line, done);
    } catch (e) { fallback(line, done); }
  }

  function fallback(text, done) {
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    document.body.removeChild(t);
  }

  function exportLog() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(readLog())], { type: "application/json" }));
    a.download = "hanashiyama_log_" + Core.todayString() + ".json";
    a.click();
  }

  // ---- 入り口 -----------------------------------------------------------
  $("open").addEventListener("click", () => open());
  $("koza").addEventListener("click", (e) => {
    if (e.target.closest("button") || e.target.closest("a")) return;
    hurry();
  });
  $("skip").addEventListener("click", hurry);
  $("other").addEventListener("click", nextStory);
  $("again").addEventListener("click", nextStory);
  $("save").addEventListener("click", saveCard);
  $("sourcesBtn").addEventListener("click", () => ($("sources").hidden = !$("sources").hidden));
  $("baBtn").addEventListener("click", showBa);
  $("closeBa").addEventListener("click", () => ($("ba").hidden = true));
  $("exportLog").addEventListener("click", exportLog);
  $("clearLog").addEventListener("click", clearLog);
  $("kinList").addEventListener("click", (e) => { e.stopPropagation(); showKin(); });
  $("copyCard").addEventListener("click", (e) => { e.stopPropagation(); copyCard(); });
  $("closeKin").addEventListener("click", () => { $("kin").hidden = true; });
  const typeLabel = () => { $("typeBtn").textContent = typeOn ? "文字: 一字ずつ" : "文字: 一度に"; };
  typeLabel();
  $("typeBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    typeOn = !typeOn;
    try { localStorage.setItem(TYPE_KEY, typeOn ? "1" : "0"); } catch (x) {}
    typeLabel();
  });
  // ★「はじめから」は ★園の入口も 含めて まっさらに 戻す
  //   単に reload すると ?kin= が 残り、同じ園から 始まってしまう
  showBuilt();

  $("restart").addEventListener("click", () => {
    // ★読み直しでも 入口へ 戻す。★そのままだと ブラウザが
    //   ★前に 見ていた 高さを 覚えていて、少し 下がった ところに 出る (2026-09-23)
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    root.scrollTo(0, 0);
    const base = location.href.split("?")[0].split("#")[0];
    if (location.href === base) location.reload();
    else location.href = base;
  });
})(typeof window !== "undefined" ? window : globalThis);
