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
  // ★似ている 判定 (㉟) に 数えない 事実 = 多くの 噺の 前提に なる もの
  //   (F08 日本一小さな動物園 / F84 西山動物園は 西山公園の 中腹。★F84 は 動物園の 註を 支える 事実で、ひっくり返す 中身では ない)
  const SIM_FREE = new Set(["F08", "F84"]);
  // ★題材 (2026-11-20 作者の判断): 前の 席と ★題材が 同じ 席も 後ろへ (例: 一席目 S11・三席目 S33 が どちらも 新幹線)。
  //   ★台本の 題・振り・サゲ・見出しに この 語が あれば その 題材 (★台本に 印を 足さず、少数の 語の 辞書で 決める)。
  //   ★動物園・レッサーパンダは 二席目の 交互の 決まりが あるので ここには 入れない。
  //   ★語を 足すときは 誤って 当たる 席が 無いかを 見る (例:「何人」は ライブカメラの「何人まで」に 当たる → 入れない)
  const TOPICS = {
    "新幹線": ["新幹線"],
    "つつじ": ["つつじ", "ツツジ", "株", "赤い山"],
    "駐車場": ["駐車", "車"],
    "人の数": ["人出", "人流", "推し量", "人の数", "来た人", "人が来る", "人 来る", "人の少ない", "賑わ", "入込"],
    "恐竜": ["恐竜"],
    "噴水": ["噴水"],
    "鐘": ["鐘"],
    "雪": ["雪", "スキー"],
    "殿様の庭": ["嚮陽渓", "殿様", "老中", "鍬", "大名"],
    "めがね": ["めがね", "眼鏡"],
    "遊び場": ["らんど", "遊具", "遊び場"],
  };
  const Core = {
    monthDay(dateStr) {
      return dateStr ? dateStr.slice(5, 10) : "";
    },

    pick(data, { pref = "", beliefs = [], date = "" } = {}) {
      const year = date ? Number(date.slice(0, 4)) : null;
      const md = Core.monthDay(date);
      const out = [];
      const consider = (st, source, days) => {
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
      // ★現地の席 (genchi) は 謎かけに 答えた 人にだけ 開く。★ふだんの 候補に 入れない
      data.stories.filter((st) => !st.genchi).forEach((st) => consider(st, "story"));
      data.prefStories
        .filter((st) => pref && st.hooks.prefectures.includes(pref))
        .forEach((st) => consider(st, "pref"));
      // ★暦の 席 (isToday) は ★その日 だけ (2026-11-20)。
      //   ★前は 手前 7 日 (「もうすぐ」) と 好きなもので 当たった とき (「お手がかりから すこし 外れますが」) にも 出していたが、
      //   ★台本の 入り・本題・追い足しが「今日」「本日」と 言い切るので、別の 日に 出すと 嘘に なる
      (data.today[md] || [])
        .filter((st) => !st.onlyYear || st.onlyYear === year)
        .forEach((st) => consider(st, "today"));
      out.sort((a, b) => b.score - a.score || a.story.id.localeCompare(b.story.id));
      return out;
    },

    /** ★その暦の噺が 何日後か。★当日 0 / 分からなければ -1 */
    daysUntil(st, date) {
      if (!st.md || !date) return -1;
      const base = new Date(date + "T00:00:00");
      if (isNaN(base)) return -1;
      for (let k = 0; k <= 14; k += 1) {
        const dt = new Date(base.getTime() + k * 86400000);
        const md = String(dt.getMonth() + 1).padStart(2, "0") + "-" +
                   String(dt.getDate()).padStart(2, "0");
        if (md === st.md) return k;
      }
      return -1;
    },

    /** ★指定の日から 前 n 日 以内に ある 暦の噺を 拾う。
     *  ★返り = [{ story, days }]  days = 何日後か (0 = 当日)
     *  ★年をまたぐ 12月→1月 も 拾う。 */
    nearDays(data, date, n) {
      if (!date) return [];
      const base = new Date(date + "T00:00:00");
      if (isNaN(base)) return [];
      const out = [];
      for (let k = 1; k <= n; k += 1) {
        const dt = new Date(base.getTime() + k * 86400000);
        const md = String(dt.getMonth() + 1).padStart(2, "0") + "-" +
                   String(dt.getDate()).padStart(2, "0");
        (data.today[md] || []).forEach((st) => out.push({ story: st, days: k, md: md }));
      }
      return out;
    },

    /** 手書き・県・今日 を ひと並びに (似ているかを 見るのに 要る) */
    /** ★台本の 題材 (TOPICS の 鍵の 並び)。題・振り・サゲ・見出しの 語で 決める */
    topics(st) {
      if (!st) return [];
      const t = [st.title, st.furi, st.sage].concat((st.scenes || []).map((x) => x && x.head))
        .filter(Boolean).join(" ");
      return Object.keys(TOPICS).filter((k) => TOPICS[k].some((w) => t.indexOf(w) >= 0));
    },
    TOPICS,

    /**
     * ★前に 語った 席 (shownIds) と どれだけ 似ているか を 返す 関数 (㉟)。語った 席が 無ければ null。
     *  事実の 重なり 1 / 思い込みの 重なり 2 / ★題材の 重なり 2 (2026-11-20)
     */
    simTo(data, shownIds) {
      const shown = new Set(shownIds || []);
      const told = Core.allStories(data).filter((s) => shown.has(s.id));
      if (!told.length) return null;
      const usedF = new Set(), usedB = new Set(), usedT = Core.toldTopics(data, shownIds);
      told.forEach((s) => {
        (s.facts || []).forEach((f) => usedF.add(f));
        ((s.hooks || {}).beliefs || []).forEach((b) => usedB.add(b));
      });
      // ★F08 (日本一小さな動物園) は 多くの 噺の 前提で、客が「何を ひっくり返されたか」とは 別もの。
      //   ★似ている 判定から 外す (2026-11-15 作者の判断。外さないと 園の 入口の 2 席目が 58 園中 41 園で 同じ 席だった)
      //   ★同じ 話 (Core.sameTalk。2026-11-21 (60)) は SAME_W を 足す = ほかの 席が あれば 必ず 後ろ (県の 噺の 加点より 先に 効く)
      return (s) =>
        (s.facts || []).filter((f) => usedF.has(f) && !SIM_FREE.has(f)).length +
        2 * (((s.hooks || {}).beliefs || []).filter((b) => usedB.has(b)).length) +
        2 * Core.topics(s).filter((t) => usedT.has(t)).length +
        (told.some((t) => Core.sameTalk(data, s, t)) ? Core.SAME_W : 0);
    },
    /** ★同じ 話の 重み (似ている 点の 最大より ずっと 大きく) */
    SAME_W: 100,
    /** ★前に 語った 席と 同じ 話か */
    sameAsTold(data, shownIds, st) {
      const shown = new Set(shownIds || []);
      return Core.allStories(data).some((t) => shown.has(t.id) && Core.sameTalk(data, st, t));
    },

    /** ★前に 語った 席の 題材 (Set) */
    toldTopics(data, shownIds) {
      const shown = new Set(shownIds || []);
      const out = new Set();
      Core.allStories(data).filter((s) => shown.has(s.id)).forEach((s) => Core.topics(s).forEach((t) => out.add(t)));
      return out;
    },

    /** ★候補 [{ story, … }] のうち、前に 語った 席と いちばん 似ていない ものだけ 残す (見繕いにも 同じ 判定を かける) */
    leastSimilar(data, shownIds, cands) {
      const sim = Core.simTo(data, shownIds);
      if (!sim || !cands || !cands.length) return cands || [];
      const lo = Math.min.apply(null, cands.map((c) => sim(c.story)));
      return cands.filter((c) => sim(c.story) === lo);
    },

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
      data.stories.filter((st) => !st.genchi).forEach((st) => {
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
    /** ★写真の 出典を 1 行に 縮める (2026-11-16)。出どころ (Wikimedia は 作者も) + 条件 */
    shortCredit(c) {
      c = String(c || "");
      const lic = /BY-SA|表示-継承/.test(c) ? "CC BY-SA 4.0"
        : /表示4\.0|CC BY 4\.0/.test(c) ? "CC BY 4.0"
        : /CC BY 2\.1/.test(c) ? "CC BY 2.1 JP"
        : /CC BY 3\.0/.test(c) ? "CC BY 3.0"
        : /CC BY/.test(c) ? "CC BY" : "";
      let src = c;
      if (/^イラスト/.test(c)) src = "イラスト: Mugi-mugi-Mugi";
      else if (/^写真:\s*Mugi-mugi-Mugi/.test(c)) src = "写真: Mugi-mugi-Mugi";   // ★現地で 撮った 写真 (2026-11-23)
      else if (/^福井ふるさと百景/.test(c)) src = "福井ふるさと百景";
      else if (/^鯖江市/.test(c)) src = "鯖江市オープンデータ";
      else if (/^Wikimedia Commons/.test(c)) {
        const m = c.match(/」\s*(.+?)\s*\(CC/);
        src = "Wikimedia Commons" + (m ? "・" + m[1] : "");
      }
      return lic ? src + " (" + lic + ")" : src;
    },
    /** ★札 (保存される 画像) に 書く 写真の 出典 (2026-11-20)。★札は 端末の 外へ 出るので 正式な 表示に 近づける:
     *  作品名・提供元・ライセンス (と その URL)。★継承 (BY-SA) の 写真なら 札も BY-SA と 書く。
     *  ★2026-11-22 作者の判断: 札は 簡素に。★加工の 中身は CREDITS.md (改変の 節) に 書く。★イラスト (作者の 絵) は 作者と ライセンスだけ (URL も 付けない)。
     *  ★同日 (見直し B-1 を 受けた 作者の判断): ★CC BY 4.0・BY-SA 4.0 の 写真だけ「(一部を切り出して使用)」を 残す (4.0 は 改変の 表示を 求める・福井県の 規約も) */
    cardCredit(c) {
      c = String(c || "").replace(/\s*\/\s*(一部を)?(切り出して)?縮小して使用\s*$/, "").trim();
      c = c.replace(/\s*[A-Z]*\d*\s*を\s*切り出して使用\s*/, "");   // ★(2026-11-22) 札は 簡素に: 元の 番号と「切り出して使用」も 札には 書かない (CREDITS.md に 書く)
      if (!c) return "";
      const LIC = [
        // ★下の URL 4 本は ★札に 書く 文字 (ライセンスの 正式な 表示)。★読みに 行かない (通信は しない。fetch も リンクも 作らない)
        [/BY-SA|表示-継承/, "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/deed.ja"],
        [/表示4\.0|CC BY 4\.0/, "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/deed.ja"],
        [/CC BY 2\.1/, "CC BY 2.1 JP", "https://creativecommons.org/licenses/by/2.1/jp/"],
        [/CC BY 3\.0/, "CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/deed.ja"],
      ];
      if (/^(イラスト|写真):\s*Mugi-mugi-Mugi/.test(c)) return c.replace(/\s+https?:\/\/[^\s)）]+/g, "").trim();
      const hit = LIC.find((x) => x[0].test(c));
      let s = c;
      // ★福井ふるさと百景の 長い 書き方 (「クリエイティブ・コモンズ・ライセンス 表示4.0 国際（URL）」) は 略号 + URL に まとめる
      s = s.replace(/、?\s*クリエイティブ・コモンズ・ライセンス\s*表示4\.0\s*国際（[^）]*）/, " (CC BY 4.0)");
      if (hit && s.indexOf(hit[2]) < 0) s = s.replace(/\)\s*$/, "") + (/\)\s*$/.test(s) ? " " : " (") + hit[2] + ")";
      const sa = hit && hit[1] === "CC BY-SA 4.0";
      const v4 = hit && /4\.0/.test(hit[1]);
      return "写真: " + s + (v4 ? " (一部を切り出して使用)" : "") + (sa ? "。札も CC BY-SA 4.0" : "");
    },
    /** ★その 席が 扱う 思い込み (hooks.beliefs + 前段で 問う furiBelief)。★否定された 思い込みの 判定に 使う (2026-11-20) */
    beliefsOf(st) {
      const out = ((((st || {}).hooks || {}).beliefs) || []).slice();
      if (st && st.furiBelief && out.indexOf(st.furiBelief) < 0) out.push(st.furiBelief);
      return out;
    },
    /** ★その 席が ひっくり返す (前段で 問う) 思い込み = 台本の furiBelief。無い 席は hooks.beliefs の 先頭 (askBeliefFor と 同じ)。
     *  ★客が「そうは 思わない」と 答えた 思い込みで 外すのは この 1 つが 一致する 席だけ (2026-11-21)。
     *  ★副の 思い込み (hooks.beliefs の 2 つ目 以降) で 外すと、県の 噺が ほぼ 全部 消え、県を 答えた 客に 一席で「手がかりは ここまで」と 言っていた */
    askedBelief(st) {
      if (!st) return null;
      return st.furiBelief || ((((st.hooks || {}).beliefs) || [])[0]) || null;
    },
    /** ★否定された 思い込みの 席か (askedBelief が 否定の 中に ある) */
    deniedSeat(st, denied) {
      const b = Core.askedBelief(st);
      if (!b || !denied) return false;
      return typeof denied.has === "function" ? denied.has(b) : denied.indexOf(b) >= 0;
    },
    /** ★4 択を 外した ときに 言う 正解の 1 行 (2026-11-21 作者の判断)。例「答えは、29園でございます。」
     *  ★札の 文は 変えない。★言い切りの 形で 終わる 札 (「静止画に変わる」) は 「」で 包む (「答えは、静止画に変わるでございます」に しない)。
     *  ★外れの 返しが もう 正解を 言って いる (T-1128「それが、あの吉田松陰なんでございます。」) ときは "" (重ねない) */
    answerLine(q, reply) {
      if (!q || !Array.isArray(q.choices) || typeof q.answer !== "number") return "";
      const a = String(q.choices[q.answer] == null ? "" : q.choices[q.answer]).trim().replace(/[。、.,]+$/, "");
      if (!a) return "";
      if (reply && String(reply).indexOf(a) >= 0) return "";
      const quote = /[ぁ-ゟ]$/.test(a) && !/^「.*」$/.test(a);
      return "答えは、" + (quote ? "「" + a + "」" : a) + "でございます。";
    },
    /** ★動物園・動物の 噺か (★オチが 何の ことか = ochiWhat で 決める。台本に animal (真偽) が あれば そちら)。2026-11-20 */
    isAnimal(st) {
      if (!st) return false;
      return typeof st.animal === "boolean" ? st.animal : /動物園|レッサーパンダ/.test(st.ochiWhat || "");
    },
    /** ★動物の 噺が 続けて いくつ 出たか (語った 順の 末尾から 数える)。2026-11-21 (60) */
    animalRun(data, shownIds) {
      const all = Core.allStories(data);
      const ids = (shownIds || []).slice();
      let n = 0;
      for (let k = ids.length - 1; k >= 0; k -= 1) {
        const s = all.find((x) => x.id === ids[k]);
        if (!Core.isAnimal(s)) break;
        n += 1;
      }
      return n;
    },
    /** ★動物の 噺が この 数だけ 続いたら、次は 動物で ない 噺から (ほかが あれば)。二席目の 交互 (53) とは 別に 効く */
    ANIMAL_MAX: 3,
    /** ★4 択の 正解の 文 (無ければ "") */
    answerText(st) {
      const q = st && st.question;
      if (!q || !Array.isArray(q.choices) || typeof q.answer !== "number") return "";
      return String(q.choices[q.answer] == null ? "" : q.choices[q.answer]).trim();
    },
    /**
     * ★同じ 話か (2026-11-21 (60)「同じ 話を 二度 聞かせない」)。台本から 決める (★席の 番号を 並べて 持たない):
     *  ① 4 択の 正解が 同じで、事実を 1 つ 以上 分け合う (SIM_FREE を 除く) = 同じ 問いに 同じ 答え
     *     例: S03 と 渡った 記録の 型 (P-北海道 ほか。答え 29園) / S04 と つつじの 型 (約5万株)
     *  ② 片方が「型」(正解を 同じくする 席が 3 席 以上ある 組) の 席で、もう片方が その 席と ひっくり返す 思い込みが 同じで、事実を 分け合う
     *     例: S02 (元祖パンダ) と 名前の 型 (P-宮城県 ほか・T-pandaday。思い込み「パンダは白黒」・F09)
     *  ★紛らわしさ: simTo (似ている = 点で 後ろへ) とは 別。同じ 話は 点に 大きく 足して、ほかが あれば 出さない
     */
    sameTalk(data, a, b) {
      if (!a || !b || a.id === b.id) return false;
      const fb = b.facts || [];
      if (!(a.facts || []).some((f) => !SIM_FREE.has(f) && fb.indexOf(f) >= 0)) return false;
      const xa = Core.answerText(a), xb = Core.answerText(b);
      if (xa && xa === xb) return true;
      const ba = Core.askedBelief(a);
      if (!ba || ba !== Core.askedBelief(b)) return false;
      return Core.kataSize(data, xa) >= 3 || Core.kataSize(data, xb) >= 3;
    },
    /** ★同じ 正解を 持つ 席の 数 (型の 大きさ)。data ごとに 一度だけ 数える */
    kataSize(data, ans) {
      if (!ans || !data) return 0;
      if (!data._kata) {
        const m = {};
        Core.allStories(data).forEach((s) => { const t = Core.answerText(s); if (t) m[t] = (m[t] || 0) + 1; });
        try { Object.defineProperty(data, "_kata", { value: m, enumerable: false }); } catch (e) { return m[ans] || 0; }
      }
      return data._kata[ans] || 0;
    },
    /** ★その県の 客に 話しかける 作りの 席 (onlyPref) は、その県の 客にだけ 出す (2026-11-15) */
    fitsPref(st, pref) {
      return !st.onlyPref || (((st.hooks || {}).prefectures) || []).includes(pref || "");
    },
    choose(data, input, preferBelief, shownIds, usedSages, opt) {
      opt = opt || {};
      const rng = opt.rng || Core.rng;
      const heard = new Set(opt.heard || []);   // ★この端末で 前に 聞いた 席 (記録の shown)
      const shownList = shownIds || [];
      const shown = new Set(shownList);
      const sages = new Set(usedSages || []);
      const denied = new Set(opt.denied || []);
      const hasB = (st, b) => ((((st || {}).hooks || {}).beliefs) || []).indexOf(b) >= 0;
      const isHint = (c) => (preferBelief && hasB(c.story, preferBelief)) ||
        (input.pref && ((c.story.hooks || {}).prefectures || []).includes(input.pref));
      // ★opt.realPref = 客が 自分で 言った 県 (打ち込みの 語から 推した 県は 選び方にだけ 使い、その県の 客 向けの 席 (onlyPref) には 使わない)
      const fitPref = opt.realPref !== undefined ? opt.realPref : input.pref;
      const base = Core.pick(data, input).filter((c) => Core.fitsPref(c.story, fitPref));
      // ★手がかりの 噺が そもそも あったか (語った 席も 含めて) / まだ 残っているか (外す 前) — 断りの 言い分けに 使う (2026-11-20)
      const hintAny = base.some(isHint);
      let all = base.filter((c) => !shown.has(c.story.id));
      // ★客が「そうは 思わない」と 答えた 思い込みの 席は 二席目 以降も 出さない (2026-11-20)。
      //   ★暦の 席だけは 残す (画面の 側で 振りを 飛ばす)
      //   ★2026-11-21: 外すのは その 席が ひっくり返す 思い込み (askedBelief) が 一致する 席だけ。副の 思い込みでは 外さない
      if (denied.size) all = all.filter((c) => c.story.isToday || !Core.deniedSeat(c.story, denied));
      const hintLeft = all.some(isHint);
      // ★避けたい 種類 (例: 一席目が 動物なら 動物の 噺) は、ほかが あれば 外す (無ければ 外さない)
      if (opt.avoid) { const keep = all.filter((c) => !opt.avoid(c.story)); if (keep.length) all = keep; }
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
      //   ★2026-11-20: ★題材 (新幹線・つつじ・駐車場 …) の 重なりも 数える (Core.simTo)
      all = Core.leastSimilar(data, shownList, all);
      //   ★残りが みな 前の 席と 題材の 重なる 席なら、手がかりの 噺は 尽きた と みなす (null = 画面が 見繕う 側へ。そこでも 似ない 席から)。
      //   ★外すと 手がかりの 候補が 少ない ときに 重なる 席が そのまま 出る (一席目 S11 → 三席目 S33 の 新幹線)
      const usedT = Core.toldTopics(data, shownList);
      if (usedT.size && all.every((c) => Core.topics(c.story).some((t) => usedT.has(t)))) return null;
      //   ★残りが みな 前に 語った 席と 同じ 話 (Core.sameTalk) でも 尽きた と みなす (見繕いの 側でも 同じ 話は 後ろ)。2026-11-21 (60)
      if (shownList.length && all.every((c) => Core.sameAsTold(data, shownList, c.story))) return null;
      const has = (c, key, v) => ((c.story.hooks && c.story.hooks[key]) || []).includes(v);
      const byBelief = preferBelief ? all.filter((c) => has(c, "beliefs", preferBelief)) : [];
      // ★同じ筋の噺は 在るが、似るので 外した ―― のか
      //   ★そもそも 持ち合わせが 無い のか。★客には 別ごとなので 言い分ける
      //   ★2026-11-20: ★交互 (動物の 噺を 続けない)・似ている・同じ 落ち所 で 外しただけ (手がかりの 席が まだ 残る) も「趣を変えて」。
      //     ★手がかりの 席を もう 語り終えた ときは「もう お出しした」。★本当に 無い ときだけ「持ち合わせが ございません」
      const NOTE_KAERU = "その筋の噺は もう一席ございますが、続けますと 似てまいります。趣を変えて。";
      const NOTE_NONE = "いただいた手がかりの噺は、あいにく持ち合わせがございません。";
      const NOTE_DONE = "いただいた手がかりの噺は、もう お出しいたしました。";
      const note = (hadBelief && !byBelief.length) || hintLeft ? NOTE_KAERU : hintAny ? NOTE_DONE : NOTE_NONE;
      const byPref = input.pref ? all.filter((c) => has(c, "prefectures", input.pref)) : [];
      const why = () => null;
      // ★2026-11-15 作者の判断「次回、同じ人が見たときに違う話に」:
      //   ★前に 聞いた 席 (heard) は 後ろへ。★手がかりの 筋 (思い込み > 県) の 順は 変えない (㉞)。
      //   ★筋の 中が 全部 聞いた 席なら、次の 筋へ 移り「前に お聞きいただいた」と 言い分ける。
      //   ★候補が 全部 聞いた 席なら null (= 画面が 見繕う 側へ。そこでも 聞いていない 席を 先に 出す)。
      const nh = (arr) => arr.filter((c) => !heard.has(c.story.id));
      const nb = nh(byBelief), np = nh(byPref), na = nh(all);
      const heardNote = "その筋の噺は、前に お聞きいただいたようで。趣を変えて。";
      // ★筋が 替わる とき (㉟)。手がかりで 選んで いない 席が 前の 席と 思い込みを 共有しないなら、強引に つなぐ
      const prevId = shownList[shownList.length - 1];
      const prev = prevId ? Core.allStories(data).find((s) => s.id === prevId) : null;
      const far = (st) => !!prev && !st.isToday &&
        !(((st.hooks || {}).beliefs) || []).some((b) => (((prev.hooks || {}).beliefs) || []).includes(b));
      const one = (arr, chosenBy, switchNote) => {
        const c = Core.pickOne(arr, { rng });
        // ★「今日という日で一席」は 暦の 席の ときだけ (★ほかの 席の 前で 言うと 嘘に なる)
        if (switchNote === NOTE_NONE || switchNote === NOTE_DONE) {
          switchNote += c.story.isToday ? "かわりに、今日という日で一席。"
            : switchNote === NOTE_NONE ? "かわりに、こちらで 見立てて 一席。" : "ここからは、こちらで 見立てて 一席。";
        }
        return { story: c.story, chosenBy, when: why(c), switchNote,
                 jump: !switchNote && chosenBy === "today" && far(c.story) };
      };
      if (nb.length) return one(nb, "belief", null);
      if (np.length) {
        return one(np, "pref", preferBelief
          ? (byBelief.length ? heardNote : "その話は、またの機会に。お客さんの土地の噺を、ひとつ。") : null);
      }
      if (na.length) {
        return one(na, "today", byBelief.length || byPref.length ? heardNote
                              : preferBelief || input.pref ? note : null);
      }
      return null;
    },

    /** ★乱数 (差し替えられる。試験は 固定の 乱数を 渡す)。window.HANASHI_RNG が あれば そちら */
    rng() { return (root.HANASHI_RNG || Math.random)(); },

    /** ★点の 幅 (最高点から この差 以内を 候補に する)。★2026-11-15 実測で 2 に 決めた (理由は pickOne) */
    BAND: 2,

    /**
     * ★候補から 1 つ 選ぶ (2026-11-15 作者の判断「多少 点数選択幅を 広げて ランダムでも 良い」)。
     *  ① heard (前に 聞いた 席) を 外す。★全部 聞いていたら 戻す
     *  ② 先頭が 当日の 暦の 席 (today) なら 当日の 席だけに 絞る (★当日を 押しのけない)
     *  ③ 最高点 − BAND 以上を 候補に し、点で 重みを 付けて 選ぶ (最高点 BAND+1 : … : 1)
     *  ★BAND = 2 の 理由: 点は 強さ 2〜5 + 県 3 + 思い込み 2 + 当日 4 (★暦の 席は 当日 だけ。2026-11-20 から「もうすぐ」は 無い)。
     *    ★2 なら 手がかり 1 つ ぶん (県 +3) の 差は 越えない = 手がかりの 筋を 崩さない。
     *    ★見繕い (強さだけ) では 強さ 3〜5 の 42 席が 候補に なり、最弱 (強さ 2) の 6 席は 入らない。
     *    ★1 だと 見繕いの 候補が 24 席に 減り、3 だと 強さ 2 の 席まで 入る (実測は 返しの 報告)。
     * @param cands [{ story, score, reasons? }]
     */
    pickOne(cands, opt) {
      opt = opt || {};
      const rng = opt.rng || Core.rng;
      const band = opt.band == null ? Core.BAND : opt.band;
      let pool = (cands || []).slice();
      if (opt.heard) {
        const h = opt.heard instanceof Set ? opt.heard : new Set(opt.heard);
        const fresh = pool.filter((c) => !h.has(c.story.id));
        if (fresh.length) pool = fresh;
      }
      if (!pool.length) return null;
      pool.sort((a, b) => b.score - a.score || a.story.id.localeCompare(b.story.id));
      const isT = (c) => (c.reasons || []).indexOf("today") >= 0;
      if (isT(pool[0])) pool = pool.filter(isT);
      const floor = pool[0].score - band;
      pool = pool.filter((c) => c.score >= floor);
      const w = pool.map((c) => c.score - floor + 1);
      let r = rng() * w.reduce((a, b) => a + b, 0);
      for (let k = 0; k < pool.length; k += 1) {
        r -= w[k];
        if (r < 0) return pool[k];
      }
      return pool[pool.length - 1];
    },

    /** ★筋が ぽんと 飛ぶ ときの つなぎ (㉟)。★数字・事実を 足さない。★同じ 一言を 続けない */
    JUMP_LINES: [
      "話は ぽんと 飛びますが、これも 同じ 山の 勘定で。",
      "がらりと 変わりまして、帳面の 別の 頁を めくります。",
      "前の噺とは 縁もゆかりも ございませんが、同じ レジの 前の 話で。",
      "飛び石を ひとつ またぎまして、お次は こちら。",
      "筋は 替わりますが、山は 同じで ございます。",
    ],
    jumpLine(used, rng) {
      // ★使い切ったら ひと回り させる (2026-11-20。前は 使い切った あと 乱数で 同じ 一言を 引き、6〜8 席目で 3 回 続いた)。
      //   ★いまの 回り (used の うち 最後の 端数) で 言った ものは 避け、★回りの 頭では 直前の 一言も 避ける
      const N = Core.JUMP_LINES.length;
      const u = (used || []).slice();
      const cur = u.slice(Math.floor(u.length / N) * N);
      const last = u[u.length - 1];
      let pool = Core.JUMP_LINES.filter((t) => cur.indexOf(t) < 0 && !(cur.length === 0 && t === last));
      if (!pool.length) pool = Core.JUMP_LINES.filter((t) => t !== last);
      return pool[Math.floor((rng || Core.rng)() * pool.length) % pool.length];
    },

    /** ★現地の謎かけの 答え合わせ用に ならす (全角/半角・かな/カナ・空白・長音・句読点の 揺れ) */
    normAnswer(t) {
      let s = String(t || "");
      if (s.normalize) s = s.normalize("NFKC");
      s = Core.hira(s.toLowerCase());
      return s.replace(/[\s　ー〜~、。.,!！?？「」『』()（）]/g, "");
    },

    /** 謎かけに 当たったか。★「赤い」「赤色」「足あとの形です」のように ★答えに 付く 自然な 言い方だけ 外して ぴったり 比べる。
     *  ★2026-11-15: 前は 頭が 合えば 当たりに していて「赤じゃない」も 当たりに なっていた */
    riddleOk(spot, input) {
      const x0 = Core.normAnswer(input);
      if (!x0) return false;
      const TAIL = /(のかたち|の形|かたち|形|いろ|色|い|です|でした|でしょう|ですか|だ|かな)$/;
      const cands = [x0];
      let x = x0;
      for (let k = 0; k < 3; k += 1) {
        const y = x.replace(TAIL, "");
        if (!y || y === x) break;
        x = y;
        cands.push(x);
      }
      return (spot.answers || []).some((a) => {
        const y = Core.normAnswer(a);
        return !!y && cands.indexOf(y) >= 0;
      });
    },

    /** ★出してよい 謎かけ = 現地で 確かめた 日付が 入っている もの だけ */
    liveSpots(data) {
      return (data.genchi || []).filter((g) =>
        g.verified_onsite && g.riddle && g.story && (g.answers || []).length);
    },

    sageExtra(st, date) {
      if (st.yearsSince && date) {
        const n = Number(date.slice(0, 4)) - st.yearsSince;
        if (n > 0) return "(没後" + n + "年)";
      }
      return "";
    },

    /** ★」の 後で 改行 (2026-11-21 作者の判断)。★」で 文が 終わり (」。・」? など) 同じ 行に 次の 文が 続く ときは、
     *  ★句点まで 前の 行に 残して 改行する。★行 全体が 台詞 (客「…」・私「…」) は 触らない。
     *  ★」の すぐ 後に 助詞が 続く (「…」と・の・は・が) ときは 改行しない (「…」と で 一つの 文節。文節の 途中で 切らない)。
     *  ★もう 改行が ある (問いの 前の 改行 qBreak) ときは 重ねない
     *  ★(同日 追加) 文の 途中から 始まる「 の 前でも 改行 = 句点 (。? など) の あとに 同じ 行で「 が 始まる とき。
     *    ★行の 頭が もう「 / 「 の 前が 助詞・読点 (文が 続いている) ときは 改行しない */
    kagiBreak(text, opt) {
      if (!text || !/[「」]/.test(String(text))) return text;
      const s = String(text);
      const quote = !(opt && opt.quote === false);            // ★サゲは 人の 言葉の 引用でも 改行しない (文節の 折り返しだけ)
      const m = s.match(/^([^「」\n]{0,3})「([\s\S]*)」$/);
      if (m) {                                                  // ★行 全体が 台詞 (客「…」・私「…」) の 外の「」は 触らない
        return quote && m[1] === "私" ? m[1] + "「" + Core.quoteBreak(m[2]) + "」" : s;   // ★私の 台詞の 中の 引用だけ
      }
      const r = s.replace(/」([。．！？!?]+)(?=[^\s」』）)])/g, "」$1\n")
        .replace(/([。．！？!?])[ 　]*(?=「)/g, "$1\n");
      return quote ? Core.quoteBreak(r) : r;
    },
    /** ★人の 言葉の 引用 (「」の 中が 8 字 以上、または 読点・?・! を 含む) は「 の 前と 」の 後で 改行して ひと続きの 行に (2026-11-21 見直し)。
     *  ★後ろの 助詞 (と・を・って) は 次の 行の 頭で よい。★」、 なら 読点まで 前の 行に。★」の 後が「の。」の ように 2 字 以下で 文が 終わる ときは 切らない (1 行に 1〜2 字を 残さない)。
     *  ★語の 引用 (7 字 以下・読点なし。「パンダ」「この札をもらう」) は 改行しない。★行の 頭・もう 改行が ある 所には 重ねない */
    quoteBreak(s) {
      return String(s).replace(/「([^「」\n]*)」([、，]?)/g, (all, x, comma, off, str) => {
        if (!(Array.from(x).length >= 8 || /[、，？?！!。]/.test(x))) return all;
        const prev = off > 0 ? str[off - 1] : "";
        const pre = !prev || prev === "\n" || /[「『（(]/.test(prev) ? "" : "\n";
        const rest = str.slice(off + all.length);
        const tail = (rest.match(/^[^。．！？!?\n]*/) || [""])[0];
        const nx = rest[0];
        const post = !rest || nx === "\n" || /[。．！？!?」』）)]/.test(nx) || (!comma && tail.length <= 2) ? "" : "\n";
        return pre + all + post;
      });
    },
    /** ★キーとなる 単語 = サゲが あとで 受け返す 語句 (2026-11-21 作者の判断)。★返り = 太字に する 語句 (無ければ null)。
     *  ★サゲと 共通の 3 字 以上の 連なりで、漢字・カナ・数字を 含む もの (助詞だけ・「でございます」の ような 言い回しは 除く)。
     *  ★端の 助詞・句読点・括弧は 落とす。★1 行に 1 か所 (いちばん 長い もの)。
     *  ★問いの 答え (choices[answer]) と 2 字 以上 重なる 語句は 先に 答えを 見せるので 太字に しない。
     *  ★keys (台本の 行・席に 任意で 持てる 太字の 語の 並び) が あれば そちらを 優先 */
    keyPhrase(line, sage, answer, keys) {
      const s = String(line || ""), g = String(sage || "");
      if (!s) return null;
      if (Array.isArray(keys) && keys.length) {
        const hit = keys.filter((k) => k && s.indexOf(k) >= 0).sort((x, y) => y.length - x.length);
        return hit.length ? hit[0] : null;
      }
      if (!g) return null;
      const CONTENT = /[一-龠々〆ヵヶァ-ヺー0-9０-９A-Za-zＡ-Ｚａ-ｚ]/g;
      const EDGE_L = /^[のがをにはでとへもやねよ、。，．！？!?「」『』（）()\s]+/;
      const EDGE_R = /[のがをにはでとへもやねよ、。，．！？!?「」『』（）()\s]+$/;
      // ★語の 区切り: 始まりは 文節の 切れ目 (phraseBreaks) か 行頭 / 終わりは 切れ目・行末・助詞や 句読点の 前
      const starts = [0].concat(Core.phraseBreaks(s));
      for (let k = 1; k < s.length; k += 1) if (/\s/.test(s[k - 1])) starts.push(k);
      const endOk = (j) => j >= s.length || starts.indexOf(j) >= 0 || /[のがをにはでとへもやねなだか、。，．！？!?」』）)\s]/.test(s[j]);
      const ans = String(answer == null ? "" : answer).replace(/[。、\s]/g, "");
      const share2 = (x, y) => { for (let k = 0; k + 2 <= x.length; k += 1) if (y.indexOf(x.slice(k, k + 2)) >= 0) return true; return false; };
      let best = "";
      for (let i = 0; i < s.length; i += 1) {
        for (let j = s.length; j - i >= 3 && j - i > best.length; j -= 1) {
          const sub = s.slice(i, j);
          if (g.indexOf(sub) < 0) continue;
          const l = (sub.match(EDGE_L) || [""])[0].length;
          const p = sub.slice(l).replace(EDGE_R, "");
          const a = i + l, b = a + p.length;
          const nC = (p.match(CONTENT) || []).length;
          // ★漢字・カナ・数字が 2 字 以上 (1 字なら 4 字 以上の 語句)。★「お思い」「申しま」の ような 言い回しを 拾わない。★読点を またがない
          if (p.length >= 3 && p.length > best.length && (nC >= 2 || (nC === 1 && p.length >= 4)) && !/[、。，．,!?！？\s]/.test(p)
              && starts.indexOf(a) >= 0 && endOk(b) && !(ans && share2(p, ans))) best = p;
        }
      }
      return best || null;
    },
    /** ★席の 行ごとの キー (keyPhrase)。★同じ 語句は 席で 1 回 (最初の 行) / 1 席 3 か所まで (付けすぎない)。
     *  @param raws 行の 字 (台詞は 中身)。★返り = 行と 同じ 長さの 配列 (語句 か null) */
    seatKeys(raws, st) {
      const q = st && st.question;
      const ansT = q && Array.isArray(q.choices) ? q.choices[q.answer] : "";
      const used = [];
      return raws.map((r) => {
        if (used.length >= 3) return null;
        const line = r && typeof r === "object" ? r.text : r;
        const keys = r && typeof r === "object" && Array.isArray(r.keys) ? r.keys : st && st.keys;
        const k = Core.keyPhrase(line, st && st.sage, ansT, keys);
        if (!k || used.indexOf(k) >= 0) return null;
        used.push(k);
        return k;
      });
    },
    /** ★html (飾りつき) の 中の 語句を <strong class="key"> で 包む。★飾りの 途中を またぐ・「」の 飾り (もう 太字) の 中 → 包まない */
    /** ★あて推量の 形を 整える (表示だけ。台本の 文は 変えない)。★返り = { text (「……」を 足した 文), point (太字の 句) } か null。
     *  ・「のではないでしょうか」の 形 → 「のでは」の 直後に「……」/ それ 以外で「ではないか」→ その 直後に「……」/「のでは」だけ → その 直後
     *  ・ポイント = 最後の 読点の あとから「ではないか / のでは」の 手前まで (「の」は 含めない)
     *  ★くすっと 笑って もらう ための 間と 強調 (2026-11-21 作者の判断) */
    guessShape(text) {
      const s = Array.isArray(text) ? text.join("") : String(text || "");
      if (!s || s.indexOf("……") >= 0) return null;
      let at = -1, cut = -1;                                  // at = ポイントの 終わり / cut = 「……」を 入れる 位置
      let k = s.lastIndexOf("のではないでしょうか");
      if (k >= 0) { at = k; cut = k + 3; }
      else if ((k = s.lastIndexOf("ではないか")) >= 0) { at = s[k - 1] === "の" ? k - 1 : k; cut = k + 5; }
      else if ((k = s.lastIndexOf("のでは")) >= 0) { at = k; cut = k + 3; }
      if (at < 0) return null;
      let from = s.lastIndexOf("、", at - 1) + 1;
      let point = s.slice(from, at);
      // ★2 字 以下 (「迷うから、なのでは」の「な」) なら 一つ 前の 読点からの 句 (「迷うから」まで)
      if (Array.from(point).length <= 2 && from > 0) {
        const f2 = s.lastIndexOf("、", from - 2) + 1;
        point = s.slice(f2, from - 1);
        from = f2;
      }
      // ★頭の 主題 (「国元では」「…のは」) は 外す = 笑いどころの 句だけ 太字 (残りが 3 字 以上の とき)。
      //   ★主題の 後に 漢字・カナの 語が 続く ときだけ (「ならではの」「気では なかった」は 主題で ない)
      const tm = point.match(/^.*?(?:では|には|のは|とは)\s*(?=[一-龠々ァ-ヺ])/);
      if (tm && Array.from(point.slice(tm[0].length)).length >= 3) point = point.slice(tm[0].length);
      point = point.trim();
      // ★長い 句 (13 字 以上) は 後ろの 要だけ (2026-11-21 作者の判断)。★文節の 塊 (分かち書きの 空白、無ければ 文節の 切れ目) で
      //   後ろから 1 つ 取り、3 字 以下なら 一つ 前の 塊も 足す (例「人の集まる用事が あった」「迷うから」)
      if (Array.from(point).length >= 13) {
        const parts = [];
        if (/\s/.test(point)) point.split(/\s+/).forEach((x) => { if (x) parts.push(x); });
        else { let k0 = 0; Core.phraseBreaks(point).concat([point.length]).forEach((q) => { parts.push(point.slice(k0, q)); k0 = q; }); }
        const sep = /\s/.test(point) ? " " : "";
        let suf = parts.pop() || "";
        while (Array.from(suf).length <= 3 && parts.length) suf = parts.pop() + sep + suf;
        if (suf && point.indexOf(suf) >= 0) point = suf;
      }
      if (!point || point.indexOf("書いてはおりませんが") >= 0) return null;
      return { text: s.slice(0, cut) + "……" + s.slice(cut), point: point };
    },
    /** ★折らない 名前 (2026-11-22)。★台本に 出る 固有名 (data/derived/entities.json の 名と 別名から 拾い、手で 足した もの)。長い 順 */
    NB_NAMES: ["リスザルとのふれあい体験", "西山公園のはじまりの庭", "国際レッサーパンダデー", "道の駅西山公園の駅長", "シセンレッサーパンダ", "仙台市八木山動物公園", "鯖江ライオンズクラブ", "日本動物園水族館協会", "日本一小さな動物園", "ジャイアントパンダ", "神戸市立王子動物園", "東京都多摩動物公園", "秋田市大森山動物園", "めがねのまちさばえ", "株式会社Agoop", "さばえつつじまつり", "レッサーパンダデー", "福井ふるさと百景", "ボリビアリスザル", "鯖江市西山動物園", "旭川市旭山動物園", "イルミネーション", "道の駅西山公園", "こぱんだらんど", "レッサーパンダ", "八木山動物公園", "京都の都ホテル", "パンダらんど", "日本一小さい", "多摩動物公園", "大森山動物園", "水戸の偕楽園", "ヒラドツツジ", "PGMツツジ", "群馬県太田市", "つつじまつり", "結びの広場", "西山動物園", "めがね時計", "旭山動物園", "王子動物園", "大久保通り", "安政の大獄", "祈りの道", "西山公園", "嚮陽会館", "嚮陽庭園", "間部詮勝", "吉田松陰", "リスザル", "おしどり", "都ホテル", "道の駅", "愛の鐘", "嚮陽渓", "北の庭", "大噴水", "野球場", "偕楽園", "花菖蒲", "鯖江市", "福井県", "新宿区", "村上市", "はなし山"],
    /** ★名前の 位置 (字の 数え) = [[始め, 終わり], …]。★長い 名前から 取り、重ならない ように */
    nbRanges(plain) {
      const out = [];
      Core.NB_NAMES.slice().sort((x, y) => y.length - x.length).forEach((n) => {
        for (let i = plain.indexOf(n); i >= 0; i = plain.indexOf(n, i + 1)) {
          const j = i + n.length;
          if (!out.some(([a, b]) => i < b && j > a)) out.push([i, j]);
        }
      });
      return out.sort((x, y) => x[0] - y[0]);
    },
    /** ★html (飾りつき) の 字の 位置 a〜b (b は 含まない) を open / close で 包む。★飾りの 途中を またぐ (入れ子が 壊れる) なら null */
    wrapAt(html, a, b, open, close) {
      const pos = [], len = [];
      for (let i = 0; i < html.length;) {
        if (html[i] === "<") { i = html.indexOf(">", i) + 1; continue; }
        const ch = html[i] === "&" ? html.slice(i, html.indexOf(";", i) + 1) : html[i];
        pos.push(i); len.push(ch.length);
        i += ch.length;
      }
      if (a < 0 || b > pos.length || a >= b) return null;
      let pa = pos[a], pb = pos[b - 1] + len[b - 1];
      while (pa > 0 && html[pa - 1] === ">") { const t0 = html.lastIndexOf("<", pa - 1); if (html[t0 + 1] === "/" || /^<wbr/i.test(html.slice(t0))) break; pa = t0; }
      while (html.slice(pb, pb + 2) === "</") pb = html.indexOf(">", pb) + 1;
      const mid = html.slice(pa, pb);
      let depth = 0, okk = true;
      (mid.match(/<[^>]+>/g) || []).forEach((t) => { if (/^<wbr/i.test(t)) return; depth += t[1] === "/" ? -1 : 1; if (depth < 0) okk = false; });
      if (!okk || depth !== 0) return null;
      return html.slice(0, pa) + open + mid + close + html.slice(pb);
    },
    /** ★行の 仕上げ: 名前を 折らない 包み (<span class="nb">) + (auto-phrase の 効かない ブラウザ = iPhone の Safari など で) 文節の 切れ目の <wbr>。
     *  ★名前の 中には <wbr> を 入れない。★包めない (飾りを またぐ) 名前も <wbr> は 入れない (keep-all で 折れない) */
    finish(html, wbr) {
      const plain = html.replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">" }[k]));
      const R = Core.nbRanges(plain);
      let h = html;
      for (let k = R.length - 1; k >= 0; k -= 1) {
        const w = Core.wrapAt(h, R[k][0], R[k][1], '<span class="nb">', "</span>");
        if (w) h = w;
      }
      if (!wbr) return h;
      const br = Core.phraseBreaks(plain).filter((q) => !R.some(([a, b]) => q > a && q < b));
      return Core.withWbr(h, br);
    },
    withKey(html, key, opt) {
      if (!key) return html;
      const pos = [], len = [];
      let plain = "";
      for (let i = 0; i < html.length;) {
        if (html[i] === "<") { i = html.indexOf(">", i) + 1; continue; }
        const ch = html[i] === "&" ? html.slice(i, html.indexOf(";", i) + 1) : html[i];
        pos.push(i); len.push(ch.length);
        plain += ch.length > 1 ? ({ "&amp;": "&", "&lt;": "<", "&gt;": ">" }[ch] || "?") : ch;
        i += ch.length;
      }
      const a = opt && opt.last ? plain.lastIndexOf(key) : plain.indexOf(key);   // ★推量の ポイントは 後ろから
      if (a < 0) return html;
      const b = a + key.length - 1;
      let pa = pos[a], pb = pos[b] + len[b];
      // ★語句が 飾りの 頭から 始まる / 尻で 終わる ときは 飾りごと 包む (数字の 飾りは 中に 残る)
      while (pa > 0 && html[pa - 1] === ">") { const t0 = html.lastIndexOf("<", pa - 1); if (html[t0 + 1] === "/") break; pa = t0; }
      while (html.slice(pb, pb + 2) === "</") pb = html.indexOf(">", pb) + 1;
      const mid = html.slice(pa, pb);
      let depth = 0, okk = true;
      (mid.match(/<[^>]+>/g) || []).forEach((t) => { if (/^<wbr/i.test(t)) return; depth += t[1] === "/" ? -1 : 1; if (depth < 0) okk = false; });
      if (!okk || depth !== 0) return html;
      // ★「」の 飾り (kagi) の 中・語句の 中に kagi が ある → もう 太字。★二重に しない
      const before = html.slice(0, pa);
      const openKagi = (before.match(/<em class="kagi">/g) || []).length - (before.match(/<\/em>/g) || []).length > 0
        && before.lastIndexOf('<em class="kagi">') > before.lastIndexOf("</em>");
      if (openKagi || /class="kagi"/.test(mid)) return html;
      return html.slice(0, pa) + '<strong class="' + ((opt && opt.cls) || "key") + '">' + mid + "</strong>" + html.slice(pb);
    },
    /** ★文節の まとまりで 改行する ための 切れ目 (2026-11-21 作者の判断)。★返り = 改行して よい 位置 (その 字の 前) の 列。
     *  ★CSS の word-break: auto-phrase が 効かない ブラウザ (iPhone の Safari など) で、<wbr> + keep-all の 代わりに 使う。
     *  ★辞書は 持たない (外部の ライブラリも 使わない)。目安:
     *    ・句読点・閉じ括弧の 後 (閉じ括弧 + 助詞 は 切らない) / 開き括弧の 前 / かな → 漢字・カナ・数字 (文節の 頭の 目安)
     *    ・お・ご (接頭) と この・その・あの・これ・それ・あれ・ひと は 後ろの 語に 付ける / 8 字 以下の「…」(語・短い 言い回し) の 中は 切らない
     *    ・漢字 + 送りがな 1 字 + 漢字 (送り主) は 切らない
     *    ・漢字・カナ・数字の 並び (人名・数字 + 単位) の 中は 切らない */
    phraseBreaks(text) {
      const s = String(text || "");
      const HIRA = /[ぁ-ゖ]/;
      const CONTENT = /[一-龠々〆ヵヶァ-ヺー0-9０-９A-Za-zＡ-Ｚａ-ｚ]/;
      const KANJI = /[一-龠々〆ヵヶ]/;
      const OPEN = /[「『（(〈]/;
      const CLOSE = /[、。，．！？!?」』）)〉…]/;
      const inShort = [];
      s.replace(/「[^「」\n]{1,8}」/g, (m, off) => { for (let k = off + 1; k < off + m.length; k += 1) inShort[k] = true; return m; });
      const out = [];
      const add = (p) => { if (p > 0 && p < s.length && !inShort[p] && out.indexOf(p) < 0) out.push(p); };
      for (let p = 1; p < s.length; p += 1) {
        const a = s[p - 1], b = s[p];
        if (a === "\n" || b === "\n" || /\s/.test(a) || /\s/.test(b)) continue;
        if (CLOSE.test(b)) continue;                         // ★句読点・閉じ括弧は 行の 頭に 置かない
        if (b === "ー" || b === "ゝ" || b === "ゞ") continue;  // ★長音・踊り字は 前の 字から 離さない (「えー」)
        if (a === "か" && b === "所" && /[0-9０-９一二三四五六七八九十何数]/.test(s[p - 2] || "")) continue;   // ★数 + か所
        if (CLOSE.test(a)) {
          if (/[」』）)〉]/.test(a) && HIRA.test(b)) continue;    // ★「…」と・「…」が は 一つの 文節 (閉じ括弧と 助詞の 間で 切らない)
          add(p);
          continue;
        }
        if (OPEN.test(b)) { if (!OPEN.test(a) && p > 1) add(p); continue; }   // ★台詞の 話し手 (客「・私「) と「 の 間は 切らない
        if (HIRA.test(a) && CONTENT.test(b)) {
          // ★漢字 1〜3 字 + の + 漢字 1〜2 字 (道の駅・愛の鐘・市の木・鯖江の藩・山の中腹) は 一つの 名前 → 「の」の 後で 切らない (2026-11-22)
          if (a === "の" && p - 2 >= 0 && KANJI.test(s[p - 2]) && KANJI.test(b)) {
            let L = 0; while (p - 2 - L >= 0 && KANJI.test(s[p - 2 - L])) L += 1;
            let R2 = 0; while (p + R2 < s.length && KANJI.test(s[p + R2])) R2 += 1;
            if (L <= 3 && R2 <= 2) continue;
          }
          // ★漢字 + かな 1 字 + 漢字 で、かなが 助詞で ない (送り主・取り締まり の「り」) ときは 一つの 語
          if (p - 2 >= 0 && KANJI.test(s[p - 2]) && KANJI.test(b) && !/[がをにはのでとへもや]/.test(a)) continue;
          // ★後ろの 語に 付く かな: 接頭の お・ご (お殿様・ご縁) / この・その・あの・これ・それ・あれ / ひと (ひと跳び)
          const tail2 = s.slice(Math.max(0, p - 2), p);
          const pre = /[おご]/.test(a) ? 1 : /^(?:[こそあ][のれ]|ひと)$/.test(tail2) && !/[こそよ]/.test(s[p - 3] || "") ? 2 : 0;
          if (pre) {
            const q = p - pre;
            if (q - 1 >= 0 && HIRA.test(s[q - 1])) add(q);   // ★かなの 続きの 中なら その 前で 切る。★文の 頭・漢字の 後なら 切らない
            continue;
          }
          add(p);
        }
      }
      return out.sort((x, y) => x - y);
    },
    /** ★html (飾りつき) の 字の 位置 (タグを 除いた 字の 数え) に <wbr> を 入れる。★開きタグの 直後の 字なら タグの 前に 入れる */
    withWbr(html, breaks) {
      if (!breaks || !breaks.length) return html;
      const set = {};
      breaks.forEach((p) => { set[p] = true; });
      let out = "", n = 0, done = -1;
      for (let i = 0; i < html.length;) {
        const c = html[i];
        if (c === "<") {
          const j = html.indexOf(">", i);
          if (html[i + 1] !== "/" && set[n] && done !== n) { out += "<wbr>"; done = n; }
          out += html.slice(i, j + 1);
          i = j + 1;
          continue;
        }
        const ch = c === "&" ? html.slice(i, html.indexOf(";", i) + 1) : c;
        if (set[n] && done !== n) { out += "<wbr>"; done = n; }
        out += ch;
        i += ch.length;
        n += 1;
      }
      return out;
    },

    /** @param extra ★足す 事実 (一席目の 前の 県の つなぎ prefBridge の facts)。★重ねない */
    factsOf(data, st, extra) {
      const byId = Object.fromEntries(data.facts.map((f) => [f.id, f]));
      const ids = [];
      (st.facts || []).concat(extra || []).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
      return ids.map((id) => byId[id]).filter(Boolean);
    },

    /** ★県ごとの つなぎ (bundle の prefBridge)。★無い・形が 違う ときは null (★何も 言わない) */
    prefBridgeOf(data, pref) {
      const pb = pref && data && data.prefBridge && data.prefBridge[pref];
      if (!pb || !Array.isArray(pb.lines)) return null;
      const lines = pb.lines.filter((t) => typeof t === "string" && t.trim());
      if (!lines.length) return null;
      return { lines, facts: Array.isArray(pb.facts) ? pb.facts.slice() : [] };
    },

    /** ★県の つなぎを 前段 (県を 伺った 直後) で 言う ときの 形 (2026-11-15)。
     *  ★最後の 文「では、…ひとつ。」は 言わない (後ろに「噺の前に、ひとつ。」が 続く)。★その行の 前半は 残す */
    prefBridgeLead(lines) {
      const out = (lines || []).slice();
      if (!out.length) return out;
      const last = out[out.length - 1];
      const ss = last.match(/[^。]*。|[^。]+$/g) || [last];
      if (/ひとつ。\s*$/.test(ss[ss.length - 1])) ss.pop();
      const rest = ss.join("").trim();
      if (rest) out[out.length - 1] = rest;
      else out.pop();
      return out;
    },

    /** 「新潟県」→「新潟」(★北海道は そのまま) */
    prefShort(p) { return p === "北海道" ? p : String(p || "").replace(/(都|府|県)$/, ""); },

    /**
     * ★席の 入りの 一言 (bridge) を 前後に 合わせて 言い換える (2026-11-15。選び方が ランダムに なって かみ合わない 所が 出た)。
     *  ★台本の 文は 変えない。★数字・事実を 足さない。
     * @param o { pref: 客の 県, answered: 直前の 客の 答え (思い込み・打ち込み) を 受けて 選んだ 席か, prefs: 都道府県の 一覧 }
     */
    bridgeText(st, o) {
      o = o || {};
      let b = String((st && st.bridge) || "");
      if (!b) return "";
      const sp = ((st.hooks || {}).prefectures) || [];
      const own = sp.length === 1 ? sp[0] : null;
      // ① 県の噺 (P-○○)「○○からでございますか。<名物>の。 <結び>」
      const m = own && b.match(/^(?:\S+?からでございますか。|お膝元でございますか。)[^。]*。\s*(.+)$/);
      if (m) {
        let tail = m[1].replace(/^そのお国と/, own + "と");
        // ★同じ 県: 挨拶は 県の つなぎで 済んでいる → 最初の 文を 省く。
        //   ★「名の通ったところ」は 省いた 文の 名物を 受けていた → 県名で 言う
        if (own === o.pref) return tail.replace(/^名の通ったところからの お客さんに、/, own + "のお客さんに、");
        // ★違う 県 (見繕い・別の 筋): 客向けの 言い方 (お客さんに) を 外し、話が 飛ぶと 断る
        tail = tail.replace(/^[^、]*お客さんに[^、]*、/, "");
        return (own === "福井県" ? "話は 地元の 福井県に 戻りまして、" : "話は " + own + "へ 飛びまして、") + tail;
      }
      // ② その県の 客に 話しかける 入り (S14「新潟のお客さんに、ひとつ。」)。★客の 県と 違えば 向きを 変える
      (o.prefs || (own ? [own] : [])).some((p) => {
        if (p === o.pref) return false;
        const names = [p, Core.prefShort(p)].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const re = new RegExp("^(?:" + names.join("|") + ")(?:のお客さんに、|からでございますか。)\\s*");
        if (!re.test(b)) return false;
        b = "話は " + Core.prefShort(p) + "へ 飛びまして、" + b.replace(re, "");
        return true;
      });
      // ③「その」は 直前の 客の 答えを 受けて 選んだ 席だけ。★ほかは 受ける 相手が 無いので 外す
      if (!o.answered) b = b.replace(/^(では、)?その、?/, "$1");
      return b;
    },

    /**
     * ★席の 頭 (つなぎ・断り) と 入り (bridge) の 重なりを ほどく (2026-11-15)。
     * @param head  bridge の 前に 言う 行 (switchNote / jumpNote / 暦の 断り)
     * @param o { prev: 直前に 言った 噺家の 行, prefHead: 「○○のお客さんに」を 言う 県 (無ければ "") }
     * @return 行の 配列 (head + bridge)
     */
    seatLines(head, bridge, o) {
      o = o || {};
      let h = (head || []).slice();
      let b = bridge || "";
      // ★bridge が「話は ○○へ 飛びまして」なら、つなぎの 一言 (話は ぽんと 飛びますが…) を 重ねない
      if (/^話は [^、]+(飛びまして|戻りまして)、/.test(b)) h = h.filter((t) => Core.JUMP_LINES.indexOf(t) < 0);
      const ends1 = (t) => /ひとつ。\s*$/.test(t || "");
      if (o.prefHead && !(b && (b.indexOf(o.prefHead) >= 0 || b.indexOf("お客さんに") >= 0))) {
        // ★「○○のお客さんに、ひとつ。」+「…ひとつ。」は 1 文に まとめる
        //   ★2026-11-21:「では、新宿の話から。」の ように「では、」で 始まる 入りも 1 文に (前は「○○のお客さんに、ひとつ。」+「では、…」の 二重の 入り)。
        //   ★まとめられない 入りが ある ときは 入りだけを 言う (★入りを 二つ 重ねない)
        if (b && (ends1(b) || /^では、/.test(b)) && !/^話は /.test(b)) b = o.prefHead + "のお客さんに、" + b.replace(/^では、/, "").replace(/話で、ひとつ。$/, "話で ひとつ。");
        else if (!b) h.push(o.prefHead + "のお客さんに、ひとつ。");
      }
      if (b) {
        const prev = h.length ? h[h.length - 1] : (o.prev || "");
        const ss = String(prev).match(/[^。]*。|[^。]+$/g) || [""];
        // ★「では、…」の 直後に「では、…」を 重ねない
        if (/^では、/.test(b) && /(^|\s)では、/.test(ss[ss.length - 1].trim())) b = b.replace(/^では、/, "");
        // ★「…ひとつ。」の 直後に「…ひとつ。」を 重ねない
        if (ends1(prev) && ends1(b)) {
          b = /話[でを][ 、]?ひとつ。\s*$/.test(b) ? b.replace(/話[でを][ 、]?ひとつ。\s*$/, "話でございます。")
                                                   : b.replace(/[、 ]?ひとつ。\s*$/, "。");
        }
      }
      return h.concat(b ? [b] : []);
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
      // ★現地で 開いた 数 / うち 一席目から 1 時間 以上 あとに 開いた 数 (★来訪の 代理指標)
      const un = events.filter((e) => e.event === "genchi_unlock");
      const genchi = {
        offer: events.filter((e) => e.event === "genchi_offer").length,
        unlock: un.length,
        prior: un.filter((e) => (e.hoursSinceFirst || 0) >= 1).length,
        miss: events.filter((e) => e.event === "genchi_miss").length,
      };
      return { stories: rows(byStory), prefs: rows(byPref), genchi: genchi };
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
        // ★数字が 棒 (朱) に かぶると 黒が 読めない (2026-09-26 指摘)。
        //   ★前は「棒が W-110 より 長ければ 中」という 決め打ちで、
        //   ★桁数を 見ていなかったので ★外に 置いた 黒が 棒に 乗ることが あった。
        //   → ★実際の 文字幅で 判る。半角 11px / 全角 20px で 見積もる。
        const txt = fmt(it.value);
        let vw = 0;
        for (let k = 0; k < txt.length; k += 1) vw += /[0-9,.\-]/.test(txt[k]) ? 11 : 20;
        const inside = w + 10 + vw > W;        // ★外に 置くと はみ出す = 中に 入れる
        svg += '<text x="0" y="' + (y + 12) + '" class="figl">' + esc(it.label) + "</text>";
        if (fig.max) svg += '<rect x="0" y="' + (y + 20) + '" width="' + W + '" height="20" class="figt2"/>';
        svg += '<rect x="0" y="' + (y + 20) + '" width="' + w.toFixed(1) + '" height="20" class="figb"/>';
        if (inside && w < vw + 20) {
          // ★棒が 短くて 中にも 入らない ときは ★棒の上に 白縁つきで 置く
          svg += '<text x="' + (W - 4) + '" y="' + (y + 36) + '" class="figv figv-out" ' +
                 'text-anchor="end">' + esc(txt) + "</text>";
        } else {
          svg += '<text x="' + (inside ? w - 8 : w + 8).toFixed(1) + '" y="' + (y + 36) +
                 '" class="figv' + (inside ? " figv-in" : "") + '"' +
                 (inside ? ' text-anchor="end"' : "") + ">" + esc(txt) + "</text>";
        }
      });
      // ★「864千人」が読めない、という声があった → 単位の読み方を添える (出典の数字は変えない)
      const unitNote = { "千人": "千人 = 1,000人", "万人": "万人 = 10,000人" }[fig.unit];
      // ★足元 (単位の 読み方 / 出典) は 幅 440 に 収まる よう 折る (2026-11-20)。
      //   ★1 行の ままだと 長い 出典 (人流データの「株式会社Agoop「マチレポ」提供データ」) が 図の 右で 切れて 見えない
      const ew = (t) => Array.from(t).reduce((n, c) => n + (c.charCodeAt(0) < 0x2000 ? 0.55 : 1), 0);   // 全角 = 1
      const FOOT_N = 25;                                // 17px の 字で 440 に 収まる 全角の 字数
      const fold = (t) => {
        const out = [];
        while (ew(t) > FOOT_N) {
          let cut = -1;
          for (let k = 1; k < t.length; k += 1) {
            if (ew(t.slice(0, k)) > FOOT_N) break;
            if ("。、・".indexOf(t[k - 1]) >= 0 || (t[k] === " " || t[k] === "(")) cut = k;
          }
          if (cut < 4) { cut = 1; while (cut < t.length && ew(t.slice(0, cut + 1)) <= FOOT_N) cut += 1; }
          out.push(t.slice(0, cut).replace(/ +$/, ""));
          t = t.slice(cut).replace(/^ +/, "");
        }
        return out.concat(t ? [t] : []);
      };
      const fl = [];
      [unitNote, fig.note ? "出典: " + fig.note : ""].filter(Boolean).forEach((p) => {
        const last = fl.length ? fl[fl.length - 1] + "  /  " + p : null;
        if (last && ew(last) <= FOOT_N) fl[fl.length - 1] = last;
        else fold(p).forEach((x) => fl.push(x));
      });
      if (fl.length > 1) {
        const add = (fl.length - 1) * 20;
        svg = svg.replace('viewBox="0 0 ' + W + " " + H2 + '"', 'viewBox="0 0 ' + W + " " + (H2 + add) + '"');
        fl.forEach((t, i) => { svg += '<text x="0" y="' + (H + add - 8 - (fl.length - 1 - i) * 20) + '" class="fign">' + esc(t) + "</text>"; });
      } else if (fl.length) svg += '<text x="0" y="' + (H - 8) + '" class="fign">' + esc(fl[0]) + "</text>";
      return svg + "</svg>";
    },
  };

  root.HanashiCore = Core;
  if (typeof document === "undefined" || !root.HANASHI) return;

  /** ★あとから 読む (同じフォルダの ファイルだけ。★外部は 読まない) */
  //   ★2026-11-15 (見直し): 前は 読み始めた 時点で「済み」に して いたので、
  //     読み込み中に 2 回目を 頼むと ★待たずに 先へ 進み、写真が 黙って 出なかった。
  //     ★読み込み中は 頼んだ 人を 溜めて、★読み終わり (か 失敗) で 全員 呼ぶ。
  function lazy(src, after) {
    if (lazy._done[src]) return after();
    if (lazy._wait[src]) { lazy._wait[src].push(after); return; }
    // ★読み込む 場所が 無い ところ (煙試験の 最小 DOM など) では 何もしない。
    //   ★写真も 音も 無くて 噺は 成り立つ ように 作ってある。
    const host = (document.head || document.body);
    if (!host || !host.appendChild || !document.createElement) {
      lazy._done[src] = true;
      return after();
    }
    lazy._wait[src] = [after];              // ★二重に 読まない
    const fin = () => {
      const q = lazy._wait[src] || [];
      lazy._done[src] = true;
      delete lazy._wait[src];
      q.forEach((f) => f());
    };
    const s = document.createElement("script");
    s.src = src;
    s.onload = fin;
    s.onerror = fin;                        // ★読めなくても 噺は 続ける
    host.appendChild(s);
  }
  lazy._done = {};
  lazy._wait = {};

  // ★読み直し (F5) でも 一番上から 見せる。
  //   ブラウザは 既定で「前に 見ていた 高さ」に 戻すので、幕の 途中から 始まる
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // ★データを いつ 作ったか。★幕の 中に 出す (★2026-11-22 から 足元には 出さない。足元は 権利の 一文だけ)。
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

  const state = { input: { pref: "", beliefs: [], date: "" }, q0: null, current: null, shown: new Set(), heard: new Set(), sages: new Set(), asked: [], lastCorrect: null, count: 0, kin: null, mondo: 0, photo: null };
  let typing = null; // 表示中の行 { el, full, i, timer, done }
  let pending = null; // 次の一手
  let panelFrom = null; // ★場・全国の園の パネルを 開いた ボタン (閉じたら フォーカスを 戻す)

  // ★レッサーパンダに 触れている 事実。★鳴き声の ボタンだけで 使う (★声は レッサーパンダの もの しか 無い)
  const RP = ["F09", "F15", "F17", "F18", "F24", "F33", "F39", "F52", "F58", "F63", "F73", "F75", "F79"];
  const hasRP = (st) => (st.facts || []).some((f) => RP.indexOf(f) >= 0);
  // ★動物園・動物の 噺か (二席目の 交互・暦の 一席目)。★2026-11-20: 事実で なく ★オチが 何の ことか (ochiWhat) で 決める。
  //   ★前は レッサーパンダの 事実の 有無で 決めていて、S51・S50・S19・S34・S41 (西山動物園の 噺) が「動物で ない」、
  //     S39・S44 (遊具「こぱんだらんど」) が「動物」に なり、動物園の 噺が 3 席 続いていた。★台本に animal (真偽) が あれば そちら
  const isAnimal = Core.isAnimal;

  // ★前に 来たときの 県 (再訪なら「また○○から?」と 確かめるだけに する。2026-11-14)
  const PREF_KEY = "hanashiyama.pref.v1";
  const FIRST_KEY = "hanashiyama.first.v1";     // ★この端末で はじめて 一席 聴いた 時刻
  const GENCHI_KEY = "hanashiyama.genchi.v1";   // ★現地の 謎かけの お預け / 開いた もの
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ---- 語りは 畳まずに 流す (2026-11-22 作者の判断。前は 2026-11-14 から「いま + 直前」の 2 塊だけ 残して 畳んでいた)
  //   ★畳むと 追っかけで 読んでいる 途中の 行が 消えた (実演の 席で 語り 20 塊の うち 6〜10 塊が 読み終わる 前に 畳まれていた)。
  //   ★いまは 消さずに 上へ 流す。★写真が 出ている 間は 語りの 最後の 行を 写真の 上端より 上に 保つ (bottomRoom)。
  //   ★読み返しは 上へ 戻す (戻している 間は 下へ 引き戻さない = 追従の 一時停止。follow)。設計と 評価 = (作業メモ。公開に含めない)
  function hasCls(n, c) { return (" " + (n.className || "") + " ").indexOf(" " + c + " ") >= 0; }
  function addCls(n, c) { if (!hasCls(n, c)) n.className = ((n.className || "") + " " + c).trim(); }
  function put(node) {
    $("talk").appendChild(node);
    return node;
  }
  function rmCls(n, c) { n.className = (" " + (n.className || "") + " ").replace(" " + c + " ", " ").trim(); }

  // ---- 進みぐあい (まくら → 本題 → サゲ) ----------------------------------
  //   ★初見で「いま どこか / あと どれくらいか」が 分かるように (P1-2)
  //   ★羽織を 脱ぐ (P1-3) = 本題の 入り (stage(1)) で 高座の 地の 色調を 一度だけ 切り替える。
  //     ★進行が「本題」に 替わるのと 同じ 瞬間。★席の 頭 (stage(0)) で 元に 戻す。
  //     ★演目名の めくり (#mekuri) は 席の 頭の まま (tell の 頭)。羽織とは 別の 瞬間
  //     (寄席でも めくりは 高座に 上がった 時点、羽織は マクラから 本題に 移る とき)。
  //     ★色は CSS の 重ねた 層を opacity で 出す だけ (transform / opacity の 決めごと)
  //   ★2026-11-15 (見直し): 高座の 地の 色替え (1.09:1) は 背景の 写真に 覆われて 見えなかった。
  //     ★見出しの 帯 (写真より 上の 層) を まくらの 間は 羽織の 濃い 色、本題で 紙の 色に 替える (CSS)
  function stage(n) {
    $("shinko").hidden = n < 0;
    ["stg0", "stg1", "stg2"].forEach((id, i) => {
      $(id).className = i < n ? "done" : i === n ? "now" : "";
      // ★いまの 段を 色だけで 示さない (見直し)。★読み上げにも「いま」を 渡す
      $(id).setAttribute("aria-current", i === n ? "step" : "false");
    });
    if (n === 1) addCls($("koza"), "haori-nugi");
    else if (n <= 0) rmCls($("koza"), "haori-nugi");
  }

  /** ★問答を 1 つ 数える。★県外 → 地方 → 県 は 1 つ (P0-2 の 数え方) */
  function toi() { state.mondo += 1; }

  // ---- 記録 -----------------------------------------------------------
  function readLog() {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  /** ★この 端末で 前に 聞いた 席 (記録の shown)。★幕を 開けた 時点で 読む = いまの 回の 席は 入らない。
   *  ★選ぶときに 後ろへ 回す (2026-11-15 作者の判断「次回、同じ人が見たときに違う話に」)。
   *  ★「場の表」の 記録を 消すと 忘れる */
  function heardBefore() {
    return new Set(readLog().filter((e) => e && e.event === "shown" && e.story).map((e) => e.story));
  }
  function log(event, st, extra) {
    try {
      const arr = readLog();
      arr.push(Object.assign({ t: new Date().toISOString(), event, story: st ? st.id : null, title: st ? st.title : null, n: state.count, input: state.input }, extra || {}));
      localStorage.setItem(LOG_KEY, JSON.stringify(arr.slice(-2000)));
    } catch (e) {}
  }

  // ★打ち出し (1 文字ずつ) は ★噺の 命。既定は 入 (2026-09-23 作者の判断で 戻した)
  //   OS の「動きを減らす」設定では ★勝手に 止めず、★足元の 切り替えで 選べるようにする。
  const TYPE_KEY = "hanashiyama.type.v1";
  let typeOn = true;
  try {
    const saved = localStorage.getItem(TYPE_KEY);
    if (saved !== null) typeOn = saved === "1";
  } catch (e) {}

  // ---- 語り (1 行ずつ、間を置いて) ---------------------------------------
  //   ★2026-11-15 (見直し): 一字ずつの 打ち出しを aria-live の 中で 書き換えると、読み上げが
  //     1 字ごとに 騒いだり 二度 読んだり する。★打ち出す 行は 読み上げから 外し (aria-hidden)、
  //     ★全文を 持つ 読み上げ用の 行 (sr yomi) を ★先に 1 回だけ 足す (★書き換えない = 1 回だけ 読まれる)
  /** ★問いの 文は 前の 文から 行を 改めて 出す (2026-11-15 見直し)。
   *  ★「…。そう思っておいでで?」→「…。」+ 改行 +「そう思っておいでで?」。★改行は CSS の pre-line で 出す */
  function qBreak(text) {
    if (!text || !/[?？]$/.test(text)) return text;
    return text.replace(/^([\s\S]*。」?)\s*([^。\n]+[?？])$/, "$1\n$2");
  }
  // ★聞くのと 見るのでは 情報量が 違う (2026-11-15 見直し)。★続けて 読ませた 字の 数を 数え、
  //   ★長く なったら「次へ」で 止める (tell の next)。★客が 何か 選んだら 数え直す
  const READ_SCENE = 100;   // ★場面の 切れ目で、これ 以上 読んでいたら 止める (字)
  const READ_MAX = 200;     // ★場面の 途中でも、これを 越えたら 次の 行の 前で 止める (字)
  function say(text, cls, after) {
    // ★」で 文が 終わって 次の 文が 続く ときも 改行 / 人の 言葉の 引用は「」の 前後で 改行 (サゲは 除く) (2026-11-21)
    text = Core.kagiBreak(qBreak(text), { quote: !/(^| )sage( |$)/.test(cls || "") });
    state.readChars = (state.readChars || 0) + (text ? text.length : 0);
    if (text && /^shi\b/.test(cls || "")) state.lastSaid = String(text);   // ★次の 席の 入りの 重なりを 見る (seatLines)
    if (text) state.lastLine = { text: String(text), cls: cls || "" };      // ★相槌を 挟んで よいかを 見る (pauseNext)
    if (text) {
      const sr = document.createElement("p");
      sr.className = "sr yomi";
      sr.textContent = String(text).replace(/[〈〉]/g, "");
      put(sr);
    }
    const p = document.createElement("p");
    p.className = "line " + (cls || "");
    p.setAttribute("aria-hidden", "true");
    put(p);
    scroll();
    const c2 = " " + (cls || "") + " ";
    const slow = c2.indexOf(" shi sage") >= 0 || / sage /.test(c2) ? 1.6
               : / kotae /.test(c2) ? 1.45
               : / furi /.test(c2) ? 1.3 : / suiryo /.test(c2) ? 1.2 : 1;
    // ★倍率の ある 行 (サゲ・返し・振り・推量) は 字の 大きさの 補正で 1 倍 未満に しない
    //   (2026-11-21 見直し r7 項目 9: 大きい 字ほど 速く 打たれ、サゲ 1.6 倍が 実効 1.3 倍・返しと ほぼ 同じ 速さに なっていた)
    const sf = sizeFactor(p);
    const key = state.sayKey || null;                 // ★キーとなる 単語 (tell が 行の 前に 置く。この 行 限り)
    state.sayKey = null;
    typing = { el: p, full: text, i: 0, done: false, after: after || null, slow: slow,
               sizeF: slow > 1 ? Math.max(1, sf) : sf, sage: slow === 1.6, key: key };
    // ★2026-11-15 見直しの 声「改行位置が ずれる」: 打ち終わりに 数字・「」が 太く 大きく なって 行が 組み直されていた。
    //   ★最初から 飾りつきの 全文を 置き、★まだの 字は 見えない (.mada) ように して 1 字ずつ 見せる
    if (typeOn && text) typing.chars = reserve(p, text, key);
    if (!typeOn) {                 // ★足元で「一度に出す」を 選んだとき
      typing.i = text.length;
      step();
      return;
    }
    step();
  }

  /** 打ち終わった行に 強弱を つける (声の 大小の 代わり)。
   *  数字と 鉤括弧だけを 立てる。★文言は 変えない */
  function deco(text, key) {
    // ★key = 語句 (キーとなる 単語) か { text, cls, last } (推量の ポイント)
    const h = !key ? decoBare(text) : typeof key === "object" ? Core.withKey(decoBare(text), key.text, key) : Core.withKey(decoBare(text), key);
    return Core.finish(h, NEED_WBR);                 // ★名前を 折らない 包み + (Safari などで) 文節の <wbr>
  }
  const escHtml = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const plainOf = (h) => h.replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">" }[k]));
  // ★文節で 改行する (2026-11-21 作者の判断)。★CSS の word-break: auto-phrase (Chrome・Edge 119〜) が 効く ところは CSS に 任せる。
  //   ★効かない ところ (iPhone の Safari など) は 文節の 切れ目に <wbr> を 入れ、CSS の keep-all と 組む (Core.phraseBreaks)
  const NEED_WBR = (() => {
    try { return !(root.CSS && typeof root.CSS.supports === "function" && root.CSS.supports("word-break", "auto-phrase")); }
    catch (e) { return true; }
  })();
  /** ★飾りの 無い 行 (見出し・オチの 註) にも 文節の 切れ目を。★包めない 所 (煙試験の 最小 DOM) では 字の まま */
  function setPhrase(el, text) {
    el.textContent = text;
    if (!text || typeof document === "undefined" || !document.createTreeWalker) return;
    el.innerHTML = Core.finish(escHtml(text), NEED_WBR);   // ★名前の 包みは どの ブラウザでも (auto-phrase でも 名前の 中で 折れない)
  }
  function decoBare(text) {
    return escHtml(text)
      .replace(/([0-9０-９][0-9０-９,\.]*)\s*((?:千|万)?(?:人|頭|羽|株|本|体|基|園|席|か所|種|件|年|月|日|時間|分|円|%|％))?/g,
        (m, n, u) => '<b class="kazu">' + n + (u || "") + "</b>")
      .replace(/「([^」]{1,30})」/g, '<em class="kagi">「$1」</em>')
      // ★傍点 — 台本で 〈…〉 と 囲んだ ところ。太字より 弱く、話芸の 抑揚に 近い
      .replace(/〈([^〉]{1,20})〉/g, '<em class="ten">$1</em>');
  }

  function land(t) {
    t.el.innerHTML = deco(t.full, t.key);
    t.chars = null;
  }
  /** ★飾りつきの 全文を 置き、字を 1 字ずつ 見えない span に 包む。★包めない 所 (煙試験の 最小 DOM) では null */
  function reserve(el, text, key) {
    if (typeof document === "undefined" || !document.createTreeWalker) return null;
    try {
      el.innerHTML = deco(text, key);
      const nodes = [];
      const w = document.createTreeWalker(el, 4);           // 4 = NodeFilter.SHOW_TEXT
      while (w.nextNode()) nodes.push(w.currentNode);
      const chars = [];
      nodes.forEach((n) => {
        const frag = document.createDocumentFragment();
        Array.from(n.nodeValue).forEach((c) => {
          const s = document.createElement("span");
          s.className = "mada";
          s.textContent = c;
          frag.appendChild(s);
          chars.push(s);
        });
        n.parentNode.replaceChild(frag, n);
      });
      // ★サロゲート (絵文字など) で 数が 合わない ときは 使わない (★従来の 打ち方に 戻す)
      if (chars.length !== text.length) { el.textContent = ""; return null; }
      return chars;
    } catch (e) {
      el.textContent = "";
      return null;
    }
  }

  /** ★一字ごとの 速さ。声の 抑揚の 代わりに ★速さで 強弱を つける
   *    ・数字と 単位      … ゆっくり (聞かせどころ)
   *    ・〈傍点〉の 中     … いちばん ゆっくり
   *    ・「鉤括弧」の 中   … 少し ゆっくり
   *    ・サゲ・振り        … 行ぜんたいを ゆっくり
   *    ・読点で 一拍、句点で 二拍
   */
  const SPEED = { base: 32, kagi: 52, kazu: 86, ten: 120, ten_line: 1.5 };
  const SAGE_TOTEN = 600;                     // ★サゲの 中の「、」(ms)
  const GUESS_MA = 800;                       // ★あて推量の「……」の 間 (ms。2 字で)

  /** ★小さい字ほど 遅く 打つ (2026-09-25 実測の 声: 「小さい文字は 速くて 追いつけない」)。
   *  ★同じ 32ms/字 でも、字が 小さいと 目が 追いつかない。
   *  ★CSS の 実寸を その場で 読む。★表を 持つと CSS と ずれる。 */
  const BASE_PX = 18.9;                       // 本文 1.18rem = 18.88px
  function sizeFactor(el) {
    try {
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (!px) return 1;
      return Math.min(1.7, Math.max(0.82, Math.pow(BASE_PX / px, 0.8)));
    } catch (e) {
      return 1;                               // ★DOM が 無い ところ (煙試験) では かけない
    }
  }
  function waitFor(t) {
    const i = t.i - 1;
    const c = t.full[i];
    // ★サゲの 中の 読点は 噺家の 間の 置き場 (2026-11-21 見直し r7 項目 9)。★地の文の 倍
    if (c === "、") return t.sage ? SAGE_TOTEN : 300;
    if (c === "。" || c === "?" || c === "？") return 420;
    if (c === "…") return t.slow === 1.2 ? GUESS_MA / 2 : 200;   // ★推量の「……」は 2 字で 約 0.8 秒 (くすっと 笑う 間)
    let w = SPEED.base;
    if (/[0-9０-９]/.test(c) || /[0-9０-９][,，\.]?$/.test(t.full.slice(Math.max(0, i - 1), i))) w = SPEED.kazu;
    // 括弧の 内側か どうかは、そこまでの 開き括弧の 数で 見る
    const upto = t.full.slice(0, t.i);
    const inTen = (upto.split("〈").length - 1) > (upto.split("〉").length - 1);
    const inKagi = (upto.split("「").length - 1) > (upto.split("」").length - 1);
    if (inTen) w = SPEED.ten;
    else if (inKagi) w = Math.max(w, SPEED.kagi);
    if (t.slow) w = Math.round(w * t.slow);
    if (t.sizeF) w = Math.round(w * t.sizeF);
    return w;
  }

  /** 行を 打ち終えてから 次へ 渡すまでの 間 (ms)。★句点・問いで 終われば 長く */
  function endPause(text) {
    const ch = String(text || "").slice(-1);
    return ch === "。" || ch === "?" || ch === "？" ? 700 : 350;
  }

  function step() {
    if (!typing) return;
    const t = typing;
    if (t.i >= t.full.length) {
      t.done = true;
      if (t.full) land(t);
      const pause = endPause(t.full);
      t.timer = setTimeout(() => {
        typing = null;
        if (t.after) t.after();
      }, pause);
      return;
    }
    t.i += 1;
    if (t.chars) t.chars[t.i - 1].className = "";          // ★1 字 見せる (行の 幅は 最初から 最後の 形)
    else t.el.textContent = t.full.slice(0, t.i);
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

  /** 下に 空けて おく 高さ。★写真の 隅書き (出典) が 出ている ときは ★その 上端より 上に 語り・選択肢を 置く
   *  (★2026-11-15 見直し: 長い 出典が 5 行に なり、決め打ちの 140 / 160px では 選択肢に かぶっていた)。
   *  ★2026-11-22: 畳まずに 流す ように したので、★写真の 上端より 上にも 置く (語りが 積もって 写真に かぶらない)。
   *  ★測れない・おかしな 値の ときは 決め打ちの base の まま。★画面の 半分を 超えては 空けない */
  function bottomRoom(base) {
    try {
      const h = window.innerHeight;
      let room = base;
      const cap = $("haikeiCap");
      if (cap && !cap.hidden) {
        const top = cap.getBoundingClientRect().top;
        if (top > 0 && top < h) room = Math.max(room, Math.round(h - top + 12));
      }
      const pt = photoTop();
      if (pt !== null && pt > 0 && pt < h) room = Math.max(room, Math.round(h - pt + 8));
      return Math.min(Math.round(h * 0.5), room);
    } catch (e) {
      return base;
    }
  }
  /** 背景の 写真の 見えている 上端 (画面の 座標)。★枠に 全体を 入れて 下に 寄せる (contain・bottom) ので 元の 縦横比から 出す。
   *  ★写真が 出ていない・読み込み前 (縦横が 0) は null */
  function photoTop() {
    const img = $("haikeiImg");
    if (!img || !hasCls($("koza"), "haikei-on") || !(img.naturalWidth > 0 && img.naturalHeight > 0)) return null;
    const r = img.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return r.bottom - Math.min(r.height, r.width * img.naturalHeight / img.naturalWidth);
  }

  // ---- 追従 (2026-11-22) ------------------------------------------------------
  //   ★語りの 最後を 画面の 下 (写真の 上) に 保つ。★指・ホイール・キーで 上へ 戻したら 追うのを やめ (読み返している)、
  //     ★「▼ 語りの続きへ」を 出す。★押すか、いちばん 新しい 行まで 戻ったら また 追う。★語り そのものは 止めない
  const follow = { on: true, inputAt: -1e9, ignoreUntil: 0, lastY: 0 };
  const nowMs = () => (typeof root.HANASHI_NOW === "function" ? root.HANASHI_NOW() : Date.now());   // ★試験は 仮想の 時計を 渡す
  const scrollY = () => window.scrollY || window.pageYOffset || 0;
  function setFollow(on) {
    follow.on = on;
    const b = $("tsuzuki");
    if (b) b.hidden = on;
  }
  /** 自分で 動かす スクロール。★その あいだの スクロールを 人の 操作と 見ない */
  function autoScrollBy(dy, smooth) {
    follow.ignoreUntil = Math.max(follow.ignoreUntil, nowMs() + (smooth ? 900 : 200));   // ★前の なめらかな 送りの 待ちを 縮めない (見直し r9 H6)
    if (smooth) window.scrollBy({ top: dy, behavior: "smooth" });
    else window.scrollBy(0, dy);
  }
  function autoScrollTo(y, smooth) {
    follow.ignoreUntil = Math.max(follow.ignoreUntil, nowMs() + (smooth ? 1200 : 200));
    if (smooth) window.scrollTo({ top: y, behavior: "smooth" });
    else window.scrollTo(0, y);
    follow.lastY = y;
  }
  /** いちばん 新しい 行 (か 選択肢) が 画面の 下の 置き場に 見えて いるか */
  function atLatest() {
    const last = $("choices").lastElementChild || $("talk").lastElementChild;
    if (!last) return true;
    const r = last.getBoundingClientRect();
    return r.bottom <= window.innerHeight - bottomRoom(90) + 24;
  }
  /** ★上へ 戻そうと した 操作 だけを 数える (2026-11-22 見直し: スマホの タップでも mousedown が 出て、
   *  タップの 直後の 上への 動き (図が 消えた・文字盤が 閉じた 等) を 読み返しと 取り違えうる)。
   *  ホイールの 上回し / 指を 下へ なぞる / ↑・PageUp・Home・Shift+空白 / スクロールバーを つまむ (html への mousedown) */
  function onUserInput(e) {
    const k = e && e.type;
    if (k === "touchstart") { const t0 = e.touches && e.touches[0]; follow.touchY = t0 ? t0.clientY : null; return; }
    if (k === "wheel" && !(e.deltaY < 0)) return;
    if (k === "touchmove") {
      const t1 = e.touches && e.touches[0];
      if (!t1 || follow.touchY == null || !(t1.clientY > follow.touchY + 6)) return;
    }
    if (k === "keydown" && ["ArrowUp", "PageUp", "Home"].indexOf(e.key) < 0 && !(e.key === " " && e.shiftKey)) return;
    if (k === "mousedown" && e.target !== document.documentElement) return;
    follow.inputAt = nowMs();
  }
  function onScroll() {
    const y = scrollY();
    const up = y < follow.lastY - 4;
    follow.lastY = y;
    if (nowMs() < follow.ignoreUntil || $("koza").hidden) return;
    // ★上へ 動いた + 直前 1 秒に 上へ 戻そうと した 操作 (onUserInput) が あった = 読み返し
    //   ★(タップ だけ は 数えない。★選択肢を 押して 下が 縮んでも 読み返しと 見ない)
    if (up && nowMs() - follow.inputAt < 1000) { if (follow.on) setFollow(false); return; }
    if (!follow.on && atLatest()) setFollow(true);
  }
  if (root.addEventListener) {
    ["wheel", "touchstart", "touchmove", "keydown", "mousedown"].forEach((n) => root.addEventListener(n, onUserInput, { passive: true }));
    root.addEventListener("scroll", onScroll, { passive: true });
  }

  /** 見出し (高座の 上に 残る 枠) の 下端 */
  function headBottom() {
    try { const hb = $("kozahead").getBoundingClientRect(); return Math.max(0, hb.bottom); } catch (e) { return 0; }
  }
  /** ★見出しの 下に 残す 行 (2026-11-22 見直し): 選択肢が 出ている 間は その 問い / それ以外は いまの 席の サゲ。
   *  ★写真の 上で 止める 窓が 狭い (投影・スマホ) ので、送りすぎて 問いの 頭や サゲを 見出しの 裏へ 押し出さない */
  function anchorEl() {
    const kids = $("talk").children;
    if ($("choices").children.length) {
      for (let i = kids.length - 1; i >= Math.max(0, kids.length - 4); i -= 1) if (hasCls(kids[i], "toi")) return kids[i];
    }
    const sid = state && state.current ? state.current.id : null;
    if (sid) for (let i = kids.length - 1; i >= 0; i -= 1) if (hasCls(kids[i], "sage") && kids[i].dataset && kids[i].dataset.sid === sid) return kids[i];
    return null;
  }
  /** 下へ 送る 量を 決める。★順番 = ①いちばん 新しい 行が 画面から 落ちない ②残す 行が 見出しの 下に 見える ③写真に かぶらない */
  function sendBy(dy, lastBottom) {
    if (!(dy > 0)) return dy;
    const a = anchorEl();
    if (!a) return dy;
    const keep = a.getBoundingClientRect().top - (headBottom() + 6);
    const must = lastBottom - (window.innerHeight - 70);
    return Math.max(Math.min(dy, keep), must, 0);
  }
  // ★一度に 送る 量の 上限 (2026-11-22 見直しの 声「写真を 入れる・変える 際に、流れていた 文章が 一気に 飛ぶ」)。
  //   ★写真が 入ると 写真の 上に 空ける 幅が いきなり 画面の 半分 近くに 広がり、その 差を 一度に 押し上げていた。
  //   ★打ち出しの 途中は 1 字ごとに DRIFT px まで (少しずつ 上へ 流れる)。★選択肢などで 一度だけ 送る ときは JUMP px まで。
  //   ★ただし いちばん 新しい 行が 画面から 落ちそうな ときは すぐ 送る (読めない ほうが 困る)
  const DRIFT = 6, JUMP = 72;
  function mustBy(lastBottom) { return lastBottom - (window.innerHeight - 70); }
  /** 打っている最中は、行の下端が画面に収まるまでだけ追う (画面が跳ねないように) */
  function keepBottom() {
    if (!typing || !follow.on) return;
    const r = typing.el.getBoundingClientRect();
    const margin = bottomRoom(160); // 選択肢と足元のぶん
    if (r.bottom > window.innerHeight - margin) {
      let dy = sendBy(r.bottom - (window.innerHeight - margin), r.bottom);
      if (dy > 0) dy = Math.min(dy, Math.max(DRIFT, mustBy(r.bottom) + DRIFT));   // ★落ちそうな ときも 落ちる ぶん + DRIFT まで (見直し r9 H2: 前は 上限が 丸ごと 外れ 409px 送った)
      if (dy > 0) autoScrollBy(dy, false);
    }
    cardPeek(true);                                  // ★札の 上に 謎かけの 文が 足されても 札を 消さない
  }

  /** ★動きを 減らす 設定か (★なめらかな スクロールも 動き。止める) */
  function lessMotion() {
    try { return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    catch (e) { return false; }
  }
  function scroll() {
    requestAnimationFrame(() => {
      if (!follow.on) return;
      const last = $("choices").lastElementChild || $("talk").lastElementChild;
      if (!last) return;
      const r = last.getBoundingClientRect();
      // ★写真の ある ときは 隅の 出典の ぶん 余白を 多めに (選択肢が 出典の 下に 入らないように)
      const room = bottomRoom(hasCls($("koza"), "haikei-on") ? 140 : 90);
      const goal = window.innerHeight - room;
      // ★下に はみ出したら 上げる。★新しい 行が 画面の 上に 隠れて いたら (見出しの 裏より 上) 見える ところまで 下げる
      //   (★上の ほうに 見えて いる ときは 動かさない = 二席目の 頭を 画面の 上へ 送った 直後を 崩さない)
      //   ★札を 見ている (札が 出ている) 間は 上へ 戻さない (見直し: 札・タネ明かしを 見に 下へ 送った 直後に 引き戻された)
      if (r.bottom > goal) {
        let dy = sendBy(r.bottom - goal, r.bottom);
        if (dy > 0) dy = Math.min(dy, Math.max(JUMP, mustBy(r.bottom) + JUMP));   // ★一気に 飛ばさない (上の DRIFT / JUMP。落ちそうな ときも 落ちる ぶん + JUMP まで)
        if (dy > 0) autoScrollBy(dy, !lessMotion());
      } else if (r.bottom < headBottom() + 8 && $("sageBox").hidden) autoScrollBy(r.bottom - goal, !lessMotion());
      cardPeek();
    });
  }

  // ---- フォーカスの 行き先 (2026-11-15 見直し) ------------------------------
  //   ★押した 選択肢を 消すと フォーカスが 行き場を 失う (body に 落ちる)。
  //   ★選択肢の 中に フォーカスが あった (= キーボード / フォーカスの 付く 押し方) ときだけ 覚えておき、
  //     ★次の 選択肢が 出たら その 先頭へ 移す。★指で 押す 人の 画面は 動かさない (preventScroll)
  function activeIn(node) {
    try {
      const a = document.activeElement;
      return !!(a && node && a !== node && typeof node.contains === "function" && node.contains(a));
    } catch (e) {
      return false;
    }
  }
  function focusTo(node) {
    try { if (node && typeof node.focus === "function") node.focus({ preventScroll: true }); } catch (e) {}
  }
  /** 高座を フォーカスの 受け皿に する。★tabindex は その時だけ 付け、離れたら 外す
   *  (★常に 付けると、語りを タップする たびに 高座に フォーカスが 移る) */
  function focusKoza() {
    const k = $("koza");
    k.setAttribute("tabindex", "-1");
    focusTo(k);
  }
  /** 選択肢を 下げる。★フォーカスが 中に あったら 覚える (次の 選択肢の 先頭へ 移す) */
  function clearChoices() {
    const box = $("choices");
    state.pauseFn = null;
    if (activeIn(box)) state.focusChoices = true;
    box.innerHTML = "";
    setFollow(true);   // ★客が 選んだ・打ち込んだ = 先へ 進む 合図 → 追い直す (2026-11-22 見直し: 読み返しの あと 押しても 追わなかった)
  }
  /** ★長く 読んだ ところで 止める。★「次へ」か 画面の タップで 続ける (★早送りは 越えて 進む) */
  // ★2026-11-15 作者の判断:「次へ」は 分かりづらい → ★客の 相槌 + 自動の 間 (寄席の 客は ボタンを 押さない。うなずく)。
  //   ★待つ 長さは 読んだ 字数で 決める (一字ずつ 2〜5 秒 / 一度に 出す ときは 2.5〜8 秒)。★タップで 待たずに 進む・早送りも 越える
  const AIZUCHI = ["ほう。", "へえ。", "それで?", "なるほど。", "ふむ、ふむ。"];
  function pauseNext(after, nextKyaku) {
    const rc = state.readChars || 0;
    state.readChars = 0;
    // ★2026-11-20: 直前が 客の 台詞 か「?」で 終わる 問いなら、客の 相槌は 出さず ★間だけ 置く
    //   (★客が 自分で 言った 直後に 客が「それで?」と 続く / 噺家の 問いに 客が「ほう。」と 返す 形に なっていた)
    //   ★2026-11-21: 直後が 客の 台詞 (nextKyaku) の ときも 間だけ (★相槌「それで?」の すぐ 後に 客の 台詞が 続いていた)
    const ll = state.lastLine || {};
    if (nextKyaku || /(^| )kyaku2?( |$)/.test(ll.cls || "") || /[?？]\s*$/.test(ll.text || "")) {
      const ms0 = typeOn ? Math.min(5000, Math.max(2000, rc * 20)) : Math.min(8000, Math.max(2500, rc * 40));
      const b = document.createElement("div");
      b.className = "ma ma-s";
      put(b);
      scroll();
      const t0 = { el: b, full: "", i: 0, done: true, after: after };
      typing = t0;
      t0.timer = setTimeout(() => { if (typing === t0) { typing = null; after(); } }, ms0);
      return;
    }
    state.aizuchiI = ((state.aizuchiI == null ? -1 : state.aizuchiI) + 1) % AIZUCHI.length;
    const p = document.createElement("p");
    p.className = "line serifu kyaku2 aizuchi";
    p.textContent = "客「" + AIZUCHI[state.aizuchiI] + "」";
    put(p);
    scroll();
    const ms = typeOn ? Math.min(5000, Math.max(2000, rc * 20)) : Math.min(8000, Math.max(2500, rc * 40));
    const t = { el: p, full: "", i: 0, done: true, after: after };
    typing = t;
    t.timer = setTimeout(() => { if (typing === t) { typing = null; after(); } }, ms);
  }
  /** 選択肢を 出した あと: ★読み上げに「選べます」を 1 行 / ★覚えて いれば 先頭へ フォーカス */
  function choicesShown(first, text) {
    srLine("sentaku-sr", text);
    if (state.focusChoices) {
      state.focusChoices = false;
      focusTo(first);
    }
  }

  function ask(choices, onPick) {
    const box = $("choices");
    box.innerHTML = "";
    let first = null;
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "btn choice";
      b.type = "button";
      setPhrase(b, c.label);                       // ★選択肢も 名前・文節の 途中で 折らない (2026-11-22)
      b.addEventListener("click", () => {
        clearChoices();
        state.readChars = 0;                       // ★客が 選んだ = ここまで 読んだ
        const me = document.createElement("p");
        me.className = "line kyaku";
        setPhrase(me, c.label);                    // ★客の 吹き出しも 名前・文節の 途中で 折らない (2026-11-22)
        put(me);
        scroll();
        onPick(c.value, c.label);
      });
      box.appendChild(b);
      if (!first) first = b;
    });
    choicesShown(first, "（選べます：" + choices.map((c) => c.label).join("／") + "）");
    scroll();
  }

  /** オチの直前の 空白。★声なら 息を のむ ところ (法則2) */
  /** ★短い 間。★答えの 直前に 一拍 置く (2026-09-25 の 声: 「もったいぶって」) */
  function ma(ms, after) {
    const b = document.createElement("div");
    b.className = "ma ma-s";
    put(b);
    scroll();
    const t = { el: b, full: "", i: 0, done: true, after: after };
    typing = t;
    t.timer = setTimeout(() => { if (typing === t) { typing = null; after(); } }, ms);
  }

  /** ★空きを 作らない 間 (時間だけ)。★サゲと 註を 離さない・返しと 正解の 罫を 切らない ときに 使う。
   *  ★タップ・早送りで 飛ばせる (打ち終わった 行と 同じ 扱い)。★el を 持たない = 早送りの 止まり所 (isStop) に ならない */
  function matsu(ms, after) {
    const t = { el: null, full: "", i: 0, done: true, after: after };
    typing = t;
    t.timer = setTimeout(() => { if (typing === t) { typing = null; after(); } }, ms);
  }
  // ★サゲの あとの 余韻 (2026-11-21 作者の判断。見直し r7 項目 1)。
  //   ★サゲを 打ち終えてから 註まで YOIN.note、註から 推量 (または 次の 行) まで YOIN.next
  //   (★前は 行末の 0.7 秒 だけで、サゲを 読み終わる 前に 推量が 打ち始まっていた)
  const YOIN = { note: 2400, next: 1200 };
  const KOTAE_SEIKAI = 900;   // ★外れの 返しと 正解の 1 行の 間 (返しの 前の 一拍と 同じ)

  function blank(after) {
    const b = document.createElement("div");
    b.className = "ma";
    put(b);
    scroll();
    const t = { el: b, full: "", i: 0, done: true, after: after };
    typing = t;
    t.timer = setTimeout(() => { if (typing === t) { typing = null; after(); } }, 1600);
  }

  // ---- 場面の写真 (★前段 1 枚 + 場面ごと (背景の 層) + 札) ---------------------
  /** 噺家のしぐさの代わり。★2026-09-23: 手描きの絵は抽象的すぎたので、
   *  関係する写真を ★小さく 出す形に変えた (鯖江市オープンデータ CC BY 2.1 JP ほか)。
   *  ★2026-11-14: 目で 見えるものを 増やす → 前段で 1 枚 + 本題で 2 枚 + 札。
   *  ★2026-11-15: 行の 間に 挟まず ★背景の 層に 出す (setHaikei)。★場面ごとに 1 枚 (+ 長い 場面は img2)。
   *  ★写真は 群ごとの ファイル (data/img/<群>.js)。★その席に 要る 群だけを 席の 頭で 読む。 */
  const IMG = "data/img/";
  const imgKeys = () => root.HANASHI_IMG_KEYS || { small: {}, card: {} };
  /** 群を 順に 読む。★無い 群・読めない 群は 飛ばす (写真が 無くても 噺は 続く) */
  function loadImg(names, after) {
    const ks = imgKeys();
    const list = names.filter((n) => n && (ks.small[n] || (n.indexOf("card_") === 0 && ks.card[n.slice(5)])));
    let i = 0;
    const next = () => (i < list.length ? lazy(IMG + list[i++] + ".js", next) : after());
    next();
  }
  // ★写真の 指定 = 「群」/「群@名前」(その子の 写真) /「群#番号」(群の 中の 何枚目)
  //   手書きの 席は 台本の scenes に ★人が 選んで 書く (2026-11-14 見直しの 声「これは何?」)。
  //   ★合う 写真が 無ければ 出さない。★季節の 写真への ランダムな 逃げは やめた
  //   (前は 2 枚目の 半分 = 63 / 130 席が 噺と 関係の ない 写真だった)。
  const specGroup = (sp) => (sp ? String(sp).split(/[@#]/)[0] : null);
  // ★自動の 席 (県の噺・暦の噺) だけが 使う。★語が はっきり 場所を 指す ものだけ
  //   ★「花」「春」「夜」「年表」「ベンチ」のような 広い 語では 選ばない (雪の噺に つつじ が 出ていた)
  // ★2026-11-23: 現地で 撮った 写真の 群 (photo_*) を 場所に 当てた。★ただし 全 130 席に 台本の 場面 (scenes) が ある ので、いまは この 表は 使われない (見直し r9 B-8)。
  //   ★「愛の鐘」の 行の ainokane は 群が 無い = 当たらない (★写真は S57 の 札 だけ)
  const PLACE = [
    [/パンダらんど|遊具|すべり台/, "photo_pandarando"],
    [/祈りの道|お地蔵|地蔵|石像|石仏/, "photo_inori"],
    [/愛の鐘|マリンバ/, "ainokane"],
    [/噴水/, "photo_fountain"],
    [/北の庭/, "photo_north_garden"],
    [/展望台/, "tenbodai"],
    [/松堂|茶室|呈茶/, "shodoan"],
    [/道の駅|交流室/, "photo_michinoeki"],
    [/嚮陽会館|駐車場/, "photo_parking"],
    [/三十三間堂|信仰の道/, "sanjusan"],
    [/西山橋/, "nishiyamabashi"],
    [/嚮陽渓|上段の庭|庭を造|鋤|鍬/, "jodan"],
    [/歴史の道/, "rekishinomichi"],
    [/芝生|まつり|祭り/, "shibafu"],
    [/結びの広場|チャイム/, "musubi"],
    [/リスザル|ルトン|テナガザル/, "zoo"],
    [/紅葉|もみじ/, "koyo"],
    [/鯖江駅/, "furui_eki"],
    [/レッサーパンダ|動物園/, "panda"],
    // ★2026-11-14 に 足した 外部の 自由に 使える 写真 (福井県百景 CC BY 4.0 / Commons ほか)
    [/つつじまつり|つつじ祭り/, "nishiyama_tsutsuji"],
    [/嚮陽庭園/, "kyoyo_teien"],
    [/新幹線/, "shinkansen"],
    [/恐竜/, "dino"],
    [/サンドーム|コンサート/, "sundome_sa"],
    [/村上/, "murakami"],
    [/イルミ/, "illumination_sa"],
    [/つつじ|ツツジ/, "tsutsuji"],
  ];
  /** 文から 群を 決める (自動の 席だけ)。★当たらなければ null = 出さない */
  function sceneKey(text, avoid) {
    const ks = imgKeys().small;
    for (let i = 0; i < PLACE.length; i += 1) {
      const k = PLACE[i][1];
      if (PLACE[i][0].test(text) && ks[k] && k !== avoid) return k;
    }
    return null;
  }
  /** 文に 出てくる レッサーパンダの 名前 (★写真の ある 子だけ)。→「panda@名前」 */
  //   ★「」に 入った 名前か、★カタカナの 名前が 前後を カタカナ以外で 区切られている ときだけ 当てる
  //     (★「フェニックス」の「クス」に 当たり、宮崎の噺に 別の子の 写真が 出ていた。2026-11-14 見直し)
  function nameSpec(text) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hit = (n) => text.indexOf("「" + n + "」") >= 0 ||
      (/^[ァ-ヶー]+$/.test(n) && new RegExp("(^|[^ァ-ヶー])" + esc(n) + "([^ァ-ヶー]|$)").test(text));
    const nm = ((imgKeys().small.panda || {}).names || [])
      .filter((n) => n.length >= 2 && hit(n))
      .sort((a, b) => b.length - a.length)[0];
    return nm ? "panda@" + nm : null;
  }
  /** この 席の 場面 (★2026-11-15: 台本の scenes = 場面の 配列 {head, from, to, img?, img2?, fig?, label?})。
   *  from / to = 本題の 何行目から 何行目まで (0 始まり・両端を 含む)。
   *  ★場面が 無い 席 (自動の 席) は 本題を 2 つに 割り、写真は 名前と 場所の 語で 選ぶ */
  function sceneList(st) {
    if (Array.isArray(st.scenes) && st.scenes.length && st.scenes[0] && typeof st.scenes[0] === "object") return st.scenes;
    const hon = st.hondai || [];
    const n = hon.length;
    const txt = (xs) => xs.map((h) => (typeof h === "string" ? h : h.text)).join(" ");
    const all = [st.furi, txt(hon), st.title].join(" ");
    const k1 = nameSpec(all) || sceneKey(all, null);
    if (n < 2) return [{ head: "", from: 0, to: Math.max(0, n - 1), img: k1 }];
    const half = Math.ceil(n / 2);
    // ★2 枚目は 本題の 後半だけで 決める (★サゲの 語では 選ばない = オチを 先に 見せない)
    const k2 = n >= 3 ? sceneKey(txt(hon.slice(half)), specGroup(k1)) : null;
    return [{ head: "", from: 0, to: half - 1, img: k1 }, { head: "", from: half, to: n - 1, img: k2 }];
  }
  /** ★点検の 道具が 使う (場面ごとの 写真の 指定だけを 並べる) */
  function seatScenes(st) { return sceneList(st).map((s) => s.img || null); }
  /** 季節の 群 (前段の 1 枚。★動物の 写真は 出さない = 一席目は 動物に しない の 延長) */
  function seasonKey() {
    const m = Number((state.input.date || "").slice(5, 7)) || 0;
    // ★「koen」(市の 公式ページの 写真) は 使わなく なった (2026-11-14)。
    //   3〜4 月 = 夜桜 (福井県百景) / 5〜6 月 = つつじ / 9〜11 月 = 紅葉 /
    //   12〜1 月 = イルミネーション (11/1〜1/15 の 催し。鯖江市 360photo) / 2・7・8 月 = つつじまつりの 写真 (福井県百景)
    return m >= 3 && m <= 4 ? "nishiyama_sakura" : m >= 5 && m <= 6 ? "tsutsuji"
         : m >= 9 && m <= 11 ? "koyo" : (m === 12 || m === 1) ? "illumination_sa"
         : (m === 7 || m === 8) ? "illust_shinryoku" : "nishiyama_tsutsuji";   // ★夏は 新緑の 絵 (満開の つつじは 季節外れ)
  }
  const smallUsed = {};
  function smallPhoto(spec) {
    const key = specGroup(spec);
    const bank = root.HANASHI_IMG && root.HANASHI_IMG._small;
    const g = bank && key && bank[key];
    if (!g || !g.shots || !g.shots.length) return null;
    const want = String(spec).indexOf("@") > 0 ? String(spec).split("@")[1] : null;
    const at = String(spec).indexOf("#") > 0 ? Number(String(spec).split("#")[1]) : -1;
    let idx = -1;
    if (want) idx = g.shots.findIndex((s) => (s.names || [s.name]).indexOf(want) >= 0);
    else if (at >= 0 && at < g.shots.length) idx = at;
    if (want && idx < 0) return null;                 // ★名指しの 子の 写真が 無ければ 出さない (別の子を 出さない)
    if (idx < 0) {
      const used = smallUsed[key] || (smallUsed[key] = []);
      let pool = g.shots.map((_, i) => i).filter((i) => used.indexOf(i) < 0);
      if (!pool.length) { used.length = 0; pool = g.shots.map((_, i) => i); }
      idx = pool[Math.floor(Math.random() * pool.length)];
      used.push(idx);
    }
    const sh = g.shots[idx];
    // ★名指しの 無い レッサーパンダは ★名札を 外す。「旭山へ 移った子」の 噺で
    //   ランダムな 子の 名前が 出ると、写っている子が 移った子だと 読まれる (2026-11-14 見直し)
    const label = key === "panda" && !want ? "西山動物園の レッサーパンダ" : (sh.label || g.label || "");
    return { shot: sh, credit: sh.credit || g.credit, label: label };
  }

  // ---- 背景の 写真・場面の 見出し (2026-11-15 P0-3 第 1 段) ---------------------
  //   ★写真は 行の 間に 挟まない。★高座の 後ろの 層 (#haikei) に 1 枚 置き、
  //     ★場面が 替わった ときだけ 差し替える (★畳みの 回数では 決めない)。
  //   ★隅に「何の 写真か」と 出典を 常に 出す。★背景を 動かす 演出 (ズーム 等) は 入れない。
  const FADE = 800;        // ★写真の 出入りの フェード (ms。CSS の transition と 同じ)。★2026-11-15 見直しの 声「もう少し 長く」 0.3 → 0.8 秒
  /** 写真を 下げる。★出ていた ときは true (= フェードが 始まった) */
  function bgOut() {
    const box = $("haikei");
    const was = !box.hidden && !hasCls(box, "kieru");
    setHaikei(null);
    return was;
  }
  /** ★写真の フェードの 間は 文字を 止める (2026-11-15 見直しの 声「文字の 動きと フェードを 同時に すると 訳が 分からない」)。
   *  ★タップ・早送りで 飛ばせる (打ち終わった 行と 同じ 扱い) */
  function waitFade(after) {
    const t = { el: $("talk").lastElementChild || $("talk"), full: "", i: 0, done: true, after: after };
    typing = t;
    t.timer = setTimeout(() => { if (typing === t) { typing = null; after(); } }, FADE);
  }
  const HITOIKI = 800;     // ★写真の ある 場面の 頭で 写真だけを 見せる 間 (ms)。★動きでは なく 間
  /** 背景の 写真を 替える。★pick = smallPhoto() の 返り / null = 紙の 地に 戻す */
  function setHaikei(pick) {
    const box = $("haikei");
    const cap = $("haikeiCap");
    clearTimeout(setHaikei.off);
    if (!pick) {
      rmCls($("koza"), "haikei-on");
      state.bg = null;
      if (box.hidden) return;
      // ★2026-11-15 見直しの 声「消えるのも 急」: 薄く して から 隠す (opacity 0.3 秒)
      const done = () => {
        if (!state.bg) { box.hidden = true; cap.hidden = true; }
        rmCls(box, "kieru"); rmCls(cap, "kieru"); rmCls(box, "miseru");
      };
      addCls(box, "kieru"); addCls(cap, "kieru");
      // ★写真の フェードは「動きを 減らす」設定でも 残す (濃淡だけ。2026-11-15 作者の判断) → 時間も 同じに 取る
      setHaikei.off = setTimeout(done, FADE);
      return;
    }
    // ★いま 画面に 出ている 写真 (消えかけ = kieru は 出ていない ものと 見る)
    const img = $("haikeiImg"), old = $("haikeiOld");
    const uri = pick.shot.dataUri;
    const was = !box.hidden && !hasCls(box, "kieru") && img.getAttribute ? img.getAttribute("src") : null;
    rmCls(box, "kieru"); rmCls(cap, "kieru");
    $("haikeiLabel").textContent = pick.label || "";
    // ★隅書きは 1 行 (2026-11-16 見直し)。★出どころ (と 作者)・条件を 短く。★正式な 表示は CREDITS.md / 読み上げと title には 全文
    $("haikeiCredit").textContent = Core.shortCredit(pick.credit || "");
    if ($("haikeiCap").setAttribute) $("haikeiCap").setAttribute("title", (pick.label || "") + " ／ " + (pick.credit || ""));
    box.hidden = false;
    cap.hidden = false;
    addCls($("koza"), "haikei-on");
    state.bg = pick;
    // ★写真の 置き場所は CSS だけで 決める (高座の 中・画面の 高さの 枠の 中央)
    // ★クロスフェード (2026-11-15 見直し 2 回): ★新しい 写真を 先に 裏で 読み込み (decode) →
    //   ★済んでから 古い 写真を 下の 層に 残し、新しい 写真を 上に 0.3 秒で 重ねる (★紙の 地が 一瞬も 見えない)
    const tok = (setHaikei.tok = (setHaikei.tok || 0) + 1);
    const swap = () => {
      if (tok !== setHaikei.tok) return;                 // ★待つ 間に 別の 写真が 頼まれた
      if (was === uri) { img.src = uri; return; }        // ★同じ 写真なら フェードし直さない
      if (old) {
        if (was) old.setAttribute("src", was);
        else if (old.removeAttribute) old.removeAttribute("src");
        clearTimeout(setHaikei.oldOff);
        setHaikei.oldOff = setTimeout(() => { if (old.removeAttribute) old.removeAttribute("src"); }, FADE + 80);
      }
      img.src = uri;
      rmCls(box, "kawari");
      void box.offsetWidth;
      addCls(box, "kawari");
    };
    let pre = null;
    try { pre = typeof Image === "function" ? new Image() : null; } catch (e) { pre = null; }
    if (pre && typeof pre.decode === "function") {
      pre.src = uri;
      pre.decode().then(swap, swap);                     // ★読めなくても 替える
    } else {
      swap();
    }
  }
  /** ★高座の 上に 残る 枠 (見出し・図) を 替える ときは、★替わった 高さの ぶん 画面を 合わせて 語りの 位置を 動かさない
   *  (2026-11-23 見直しの 声「節目で 飛ぶ」: 見出しが 1 行 ↔ 2 行・図が 出る / 消える と、枠の 下の 語りが 一度に ずれていた)。
   *  ★合わせた あとの 送りは ふだんの 追従 (少しずつ) に 任せる */
  function withHead(fn) {
    const hd = $("kozahead");
    const h0 = (hd && hd.offsetHeight) || 0;
    fn();
    const d = ((hd && hd.offsetHeight) || 0) - h0;
    if (d && scrollY() > 0) autoScrollBy(d, false);
  }
  /** 見出し (★高座の 上に 残る 1 行)。★空なら 隠す */
  function setMidashi(text) {
    setPhrase($("midashi"), text || "");
    $("midashi").hidden = !text;
  }
  /** 図の 場面: 図を 上に 固定する (★背景に しない。★文字を 重ねない) */
  function showZu(fig) {
    $("zu").innerHTML = '<figure class="figure">' + Core.figSvg(fig) + "</figure>";
    $("zu").hidden = false;
  }
  function hideZu() {
    if ($("zu").hidden) return;
    $("zu").hidden = true;
    $("zu").innerHTML = "";
  }
  /** 読み上げ用の 行 (★画面には 出さない)。★aria-live で 1 回だけ 読まれる */
  function srLine(cls, text) {
    const p = document.createElement("p");
    p.className = "sr " + cls;
    p.textContent = text;
    return put(p);
  }
  /** 写真を 一拍 見せる。★タップ・早送りで 飛ばせる (打ち終わった 行と 同じ 扱い) */
  function hitoiki(after) {
    const kz = $("koza");
    const box = $("haikei");
    addCls(kz, "hitoiki");
    addCls(box, "miseru");                  // ★紙の 覆いを 薄く = 写真を はっきり 見せる (読んでいた 文字は 残す)
    const t = { el: $("talk").lastElementChild || $("talk"), full: "", i: 0, done: true,
                after: () => { rmCls(kz, "hitoiki"); rmCls(box, "miseru"); after(); } };
    typing = t;
    // ★写真が 入りきって (FADE) から 0.8 秒。★写真の フェードは「動きを 減らす」設定でも 残すので 同じ 時間
    t.timer = setTimeout(() => { if (typing === t) { typing = null; t.after(); } }, HITOIKI + FADE);
  }
  // ---- 扇子 = 場面の 区切り (P1-3 噺家の 道具) ----------------------------------
  //   ★噺家が 扇子で 床を 叩いて 場面を 切る ところ。★閉じた 扇子の 形の 区切り線を 1 本。
  //   ★出すのは 場面が 替わる とき だけ (2 場面目 以降の 頭)。★席の 頭と 終わりには 出さない
  //     → 1 席に (場面数 − 1) 本。★飾りなので 読み上げには 出さない (aria-hidden)。
  //   ★形 (左から): 要 (かなめ) の 丸 / 骨 / 扇面 (折り目 4 本)。色は CSS で 当てる
  // ★2026-11-15 見直しの 声「これは何ですか？」→ 作者の案: ★中央は 区切り線、★左右に 小さい 扇子が 開いて 閉じる。
  //   ★扇子 = 要 (かなめ) を 中心に 扇面 5 枚。★開く・閉じるは 扇面の 回転 (transform) だけ (CSS の hiraku / tojiru)
  const SENSU_HANE = [-50, -25, 0, 25, 50].map((a, k) =>
    '<path class="hane' + (k % 2 ? " ura" : "") + '" style="--a:' + a + 'deg" d="M0 0 L-3.4 -17 A17.3 17.3 0 0 1 3.4 -17 Z"/>').join("");
  const SENSU_OGI = (x) => '<g transform="translate(' + x + ' 25)">' + SENSU_HANE + '<circle class="kaname" r="2.2"/></g>';
  const SENSU_SVG =
    '<svg viewBox="0 0 240 30" width="240" height="30" focusable="false">' +
    '<line class="sen" x1="46" y1="22" x2="194" y2="22"/>' +
    SENSU_OGI(24) + SENSU_OGI(216) + "</svg>";
  function sensu() {
    const d = document.createElement("div");
    d.className = "sensu";
    d.setAttribute("aria-hidden", "true");
    d.innerHTML = SENSU_SVG;
    return put(d);
  }
  /** 場面に 入る。★見出しを 替え、★写真 (か 図 か 無し) を 替える (★2026-11-22 から 前の 場面は 畳まない)。
   *  ★写真の ある 場面だけ 一拍 置く。★2 場面目 以降は 見出し行の 直前に 扇子の 区切りを 置く */
  function enterScene(st, s, j, useFig, after) {
    const head = s.head || st.title;              // ★見出しが まだ 無い 場面は 演目名
    // ★2026-11-15 見直し: 写真が 出る ときに 文字も 替わり (見出し・畳み)、読んでいた 所が 分からなく なった。
    //   ★写真は 読んでいた 文字を 残した まま 入れ (一拍)、★入って から 見出しを 替え・語りを 続ける
    const finish = (pick) => {
      withHead(() => { setMidashi(head); hideZu(); if (useFig) showZu(st.fig); });
      const what = pick ? "（写真：" + (pick.label || "西山公園の写真") + "）" : useFig ? "（図：" + st.fig.title + "）" : "";
      if (j > 0) sensu();
      const sr = srLine("midashi-sr", head + what);
      sr.dataset.scene = String(j);
      sr.dataset.head = head;
      sr.dataset.shown = pick ? "1" : "";
      sr.dataset.label = pick ? pick.label || "" : "";
      scroll();
      return after();
    };
    if (useFig || !s.img) return bgOut() ? waitFade(() => finish(null)) : finish(null);
    const gen = state.gen;
    loadImg([specGroup(s.img)], () => {
      if (state.gen !== gen) return;              // ★読み終わる 前に 別の 噺へ 移った → 前の 席は 続けない
      const pick = smallPhoto(s.img);
      if (pick && s.label) pick.label = s.label;  // ★場面の label が あれば そちら (例: 園名を 外す)
      if (!pick) return bgOut() ? waitFade(() => finish(null)) : finish(null);
      setHaikei(pick);
      hitoiki(() => finish(pick));                // ★写真が 入りきって から 次の 場面へ
    });
  }
  /** 長い 場面の 途中で 写真を 1 枚 差し替える (img2)。★一拍は 置かない。★畳まない */
  function swapImg2(s, after) {
    loadImg([specGroup(s.img2)], () => {
      const pick = smallPhoto(s.img2);
      if (!pick) return after();
      if (s.label2) pick.label = s.label2;
      setHaikei(pick);
      const sr = srLine("shashin-sr", "（写真：" + (pick.label || "西山公園の写真") + "）");
      sr.dataset.label = pick.label || "";
      waitFade(after);                            // ★替わり終わるまで 文字を 止める
    });
  }

  /** ★前段の 1 枚 (県を 伺った 直後 / 園の 挨拶の 直後)。★文字だけで 3 問 続けない。
   *  ★背景の 層に 出す (場面と 同じ)。★一拍は 置かない (場面の 頭だけ) */
  function showOpening(after) {
    if (state.openingShown) return after();
    state.openingShown = true;
    const spec = state.kin ? "panda" : seasonKey();
    loadImg([specGroup(spec)], () => {
      const pick = smallPhoto(spec);
      if (pick) {
        pick.opening = true;
        setHaikei(pick);
        const sr = srLine("shashin-sr", "（写真：" + (pick.label || "西山公園の写真") + "）");
        sr.dataset.label = pick.label || "";
        return waitFade(after);                   // ★入り終わるまで 文字を 止める
      }
      after();
    });
  }

  // ---- 数字の絵図 (本題で1枚) ------------------------------------------
  function showFig(fig, after) {
    const svg = Core.figSvg(fig);
    if (!svg) return after();
    const box = document.createElement("figure");
    box.className = "figure";
    box.innerHTML = svg;
    put(box);
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

  /** 足元の 実際の 高さを 隅書きの 位置 (--footh) に 渡す (★狭い 画面で 足元が 2 段に 折れても 重ならない) */
  function setFootH() {
    try {
      const h = $("footbar").offsetHeight;
      const st = $("koza").style;
      if (h > 0 && st && typeof st.setProperty === "function") st.setProperty("--footh", h + "px");
    } catch (e) {}
  }
  /** 幕 (や 一覧) から 高座へ。★押した ボタンが 隠れて フォーカスが 行き場を 失わないよう 高座へ 移す */
  function enterKoza() {
    $("maku").hidden = true;
    $("kin").hidden = true;
    panelFrom = null;
    $("koza").hidden = false;
    // ★足元の 権利表示は 高座に 入ってから。
    //   ★幕は それ自体が 画面いっぱいなので、下に 覗くと
    //   ★幕の 注意書きと 同じことが 二度 並ぶ (2026-09-23 指摘)
    $("foot").hidden = false;
    autoScrollTo(0);
    setFollow(true);
    setFootH();
    focusKoza();
  }

  /** @param zoo 一覧から選ばれた園 (無ければ ?kin= を見る) */
  function open(zoo) {
    enterKoza();
    const e = entry();
    state.input.date = e.date || Core.todayString();
    state.kin = zoo || e.zoo;
    if (state.kin && state.kin.pref) state.input.pref = state.kin.pref;  // 県は 聞かずに 済む
    state.heard = heardBefore();
    // ★再訪: 前に 伺った 県を 覚えている (★この端末の 中だけ。外へは 送らない)
    state.lastPref = state.kin ? "" : (store.get(PREF_KEY) || "");
    // ★前段の 写真を 先に 読み始めておく (★幕が 出るのは 待たせない)
    loadImg([state.kin ? "panda" : seasonKey()], () => {});
    // ★一覧から 選んだときに URL は 書き換えない。
    //   書き換えると ★リロード / F5 で その園に 貼り付いてしまう (2026-09-23 に 発覚)。
    //   ?kin= を 手で 打った人は entry() が 拾うので、入口としては 生きている。
    greet();
  }

  // ★前段の 問答 (2026-11-14 噺に 早く 入る)
  //   標準 3 = 行きたい度 → どちらから → 思い込み (★噺の 振りの 形で)
  //   園の入口 2 = 行きたい度 → 思い込み (★園で 県が 分かる)
  //   再訪 2 = 行きたい度 →「また○○から?」(★はい なら そのまま 噺へ)
  //   ★本人が「ほかに 言いたい」を 選んだ ときだけ 増える (最大 6)
  //   ★冒頭で 数を 言い、★その数で 終わる。★返しの 無い 問いは 置かない
  const howMany = () => (state.kin || state.lastPref ? "二つ" : "三つ");

  function greet() {
    if (state.kin) return greetKin(state.kin);
    say("えー、いらっしゃいまし。道の駅西山公園のレジに立っております、はなし山と申します。", "shi", () =>
      say("はい、これは鯖江の公園の話でございます。宣伝でございます。", "shi", () =>
        say("お客さんに合わせて噺を選びますので、" + howMany() + "だけ伺います。", "shi", askWant)
      )
    );
  }

  /** ★園の入口から 来た人への 名乗り。その園に 鯖江うまれが いることから 入る */
  function greetKin(z) {
    const nm = kinName(z);
    // ★うちから 渡った 子が 記録に 無く、向こうから 来た 子だけの 園 (海外の 一部) は 向きを 逆に 言う (2026-11-20)
    const fromThere = !(z.out > 0) && !(z.sabae_born > 0) && z.in > 0;
    const en = fromThere ? "その " + nm + " から、記録をたどりますと、うちへ 渡ってきた レッサーパンダが おるのでございます。"
                         : "その " + nm + " におります レッサーパンダ。記録をたどりますと、うちから渡った子が おるのでございます。";
    say("えー、" + nm + "から お越しでございますか。", "shi", () =>
      say("わたくし、福井県鯖江市、道の駅西山公園のレジに立っております、はなし山と申します。", "shi", () =>
        say(en, "shi", () =>
          showOpening(() =>
            say("噺を選びますので、" + howMany() + "だけ伺います。", "shi", askWant)
          )
        )
      )
    );
  }

  function askWant() {
    toi();
    say("はじめと終わりに、同じことを伺います。西山公園、行ってみたい気持ちは、おありで?", "shi", () =>
      ask(
        [
          { label: "いや、べつに", value: 1 },
          { label: "ふつう", value: 3 },
          { label: "行きたい", value: 5 },
          // ★2026-11-20 作者の判断: 公園で 開いた 人に「行ってみたい」は 噛み合わない。★位置情報は 使わない (本人が 言う)
          { label: "いま、公園におります", value: 0 },
        ],
        (v, label) => {
          if (v === 0) {
            // ★終わりの 問いも 出さない。★気持ちの 動き (Δq) にも 混ぜない
            state.onsite = true;
            state.q0 = null;
            state.q0label = null;
            log("onsite", null, {});
            return say("おや、もう お越しで。ありがたいことで。では、終わりに 伺うのは よしておきます。", "shi",
              state.kin ? askBeliefFor : state.lastPref ? askAgain : askPref);
          }
          state.q0 = v;
          state.q0label = label;
          log("q0", null, { value: v });
          const r = v === 1 ? "結構でございます。わたくしも、ここに立つまではそうでした。" : v === 3 ? "正直でよろしい。わたくしも長らくそうでございました。" : "おや、奇特なお方だ。";
          say(r, "shi", state.kin ? askBeliefFor : state.lastPref ? askAgain : askPref);
        }
      )
    );
  }

  /** 県が 決まったら 覚えておく (★次に 来たとき「また○○から?」) */
  function setPref(p) {
    state.input.pref = p || "";
    if (p && !state.kin) store.set(PREF_KEY, p);
  }

  /** ★再訪: 県を 一から 聞き直さない */
  function askAgain() {
    toi();
    say("また" + state.lastPref + "からで?", "shi", () =>
      ask([{ label: "はい、また", value: 1 }, { label: "別のところから", value: 0 }], (v) => {
        if (!v) return say("おや、失礼を。", "shi", () => askPref(true));
        setPref(state.lastPref);
        // ★二つで 終える 約束。★思い込みは 噺の 振りが 自分で 問う
        say("毎度、ありがとうございます。", "shi", () => {
          // ★一席目を 先に 決めてから 県の つなぎを 言う (★一席目と 同じ 数を つなぎで 先に 言わない。sayPrefBridge)
          const c = firstCandidate([]);
          sayPrefBridge(c && c.story, () => showOpening(() => tellFirst(c)));
        });
      })
    );
  }

  /** 県を 伺った あと。★ふだんは 3 問目 (思い込み) へ。
   *  ★再訪の「別のところから」(言い直し) は ★冒頭で「二つだけ」と 言って いるので 思い込みは 伺わず 噺へ
   *  (★2026-11-15 見直し: 言い直しの あとに 思い込みを 伺い、二つと 言って 三つに なっていた。) */
  function afterPref() {
    // ★一席目を 先に 決める (2026-11-20)。★県の つなぎが 一席目の オチ・数を 先に 言わない ように (sayPrefBridge)。
    //   ★決めた 席は 3 問目 (askBeliefFor) が そのまま 使う (★乱数の 引き方は 前と 同じ 1 回)
    const c = firstCandidate(state.denied || []);
    state.cand = c;
    state.candReady = true;
    sayPrefBridge(c && c.story, () => {
      if (state.prefRedo) { state.candReady = false; return showOpening(() => tellFirst(c)); }
      showOpening(askBeliefFor);
    });
  }

  /** ★県の つなぎ (prefBridge) を 県が 決まった 直後に 1 回 (2026-11-15)。
   *  ★前は 一席目の 頭で 言っていて、前段の 思い込みと 噺の 入り「その○○の話から」の 間に 挟まり、受ける 相手が 遠かった。
   *  ★最後の「では、…ひとつ。」は 言わない (Core.prefBridgeLead)。★園の 入口・県を 言わない 人には 出さない */
  function sayPrefBridge(st, after) {
    const pb = !state.kin && !state.pbSaid ? Core.prefBridgeOf(H, state.input.pref) : null;
    if (!pb) return after();
    state.pbSaid = true;
    state.pbFacts = pb.facts;                // ★一席目の タネ明かしに 足す (tell → renderSources)
    const ls = bridgeLines(pb, st);
    const go = (k) => (k < ls.length ? say(ls[k], "shi", () => go(k + 1)) : after());
    go(0);
  }
  // ★県の つなぎの 行を 一席目に 合わせて 選ぶ (2026-11-20)
  //   ① 一席目が 県の 推し量った 入込数・人流 (F21 / F26) を 使う 席 (S10・S11・S12・S45) なら、
  //      ★「大半が 地元」「84%」の 行を 言わない (★一席目の オチ・数を 先に 言い、同じ 数を 重ねる)
  //   ②「どうりで、…」は 前の 行と「手強い 地元の お客さん」の 返しを 受ける 文。★どちらかが 無ければ 言わない (再訪の 福井)
  //   ③ 公園に いない 客には「このレジの前まで」を「画面ごしに、このレジの前まで」に (★まだ 来ていない 人を レジの 前に 立たせない)
  const LOCAL_FACTS = ["F21", "F26"];
  const LOCAL_LINE = /大半が|84[%％]/;   // ★福井の つなぎ「休日に…大半が、福井のお客さん」も 同じ 数 (F21)
  const isLocalSeat = (st) => !!st && (st.facts || []).some((f) => LOCAL_FACTS.indexOf(f) >= 0);
  function awayText(t) {
    if (state.onsite || /画面ごし/.test(t)) return t;
    return t.replace(/(この(?:小さな山の麓のレジ|裏山の麓|レジの前)まで)/, "画面ごしに、$1");
  }
  function bridgeLines(pb, st) {
    const out = [];
    let prevDropped = false;
    Core.prefBridgeLead(pb.lines).forEach((t) => {
      const drop = (isLocalSeat(st) && LOCAL_LINE.test(t)) || (/^どうりで/.test(t) && (prevDropped || !state.tegowai));
      prevDropped = drop;
      if (!drop) out.push(awayText(t));
    });
    // ★「大半が 地元」を 言った あとで 一席目を 選び直す (否定) ときは、同じ 数の 席を 外す (firstCandidate)
    state.pbLocal = out.some((t) => LOCAL_LINE.test(t));
    return out;
  }

  /** @param redo 再訪の「別のところから」(★同じ 問答の 言い直しなので 数えない) */
  function askPref(redo) {
    state.prefRedo = redo === true;
    if (redo !== true) toi();
    // ★再訪の「別のところから」は「また○○からで?」の 続きの 選択肢 (県外 → 地方 → 県 と 同じ 1 問)。
    //   ★「どちらからお越しで?」と 問い直すと、冒頭で「二つだけ」と 言ったのに 三つ 伺う ことに なる (2026-11-21)
    const q = redo === true ? (f) => f() : (f) => say("ときに、お客さん。どちらからお越しで?", "shi", f);
    q(() =>
      ask(
        [
          { label: "この福井から", value: "福井県" },
          { label: "県外から", value: "__out" },
          { label: "言わずにおく", value: "" },
        ],
        (v) => {
          if (v === "__out") return askBlock();
          setPref(v);
          state.tegowai = v === "福井県";            // ★県の つなぎの「どうりで」が この 返しを 受ける (sayPrefBridge)
          // ★「言わずにおく」に「遠いところを」と 返していた (2026-11-14 に 発覚)
          const r = v === "福井県" ? "お膝元でございますか。レジでいちばん手強いのが、地元のお客さんで。"
                  : v ? "遠いところを、ようこそ。" : "結構でございます。";
          say(r, "shi", afterPref);
        }
      )
    );
  }

  function askBlock() {
    say("ほう。どのあたりで?", "shi", () =>
      ask(
        BLOCKS.map((b) => ({ label: b.label, value: b.label })).concat([{ label: "やっぱり言わない", value: "" }]),
        (v) => {
          if (!v) return say("結構でございます。", "shi", afterPref);
          const block = BLOCKS.find((b) => b.label === v);
          ask(block.prefs.map((p) => ({ label: p, value: p })), (p) => {
            setPref(p);
            // ★2026-11-20: 県の つなぎを 言う 県では お礼を 重ねない (★つなぎも「わざわざの お運び」「○○からでございますか」と 言う)。
            //   ★つなぎが「○○からでございますか」で 始まる 県は 返しを 言わない。ほかは「さようで、○○から。」だけ
            const pb = Core.prefBridgeOf(H, p);
            if (!pb) return say("遠いところを、ありがとうございます。", "shi", afterPref);
            const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (new RegExp("^(?:" + esc(p) + "|" + esc(Core.prefShort(p)) + ")からでございますか").test(pb.lines[0])) return afterPref();
            // ★2026-11-21: つなぎの 1 行目が その県を 名指しして 受ける (「熊野古道の三重県からのお客さんで。」) なら 返しを 言わない
            //   (★「さようで、三重県から。」と ほぼ 同じ ことを 二度 言っていた)
            if (new RegExp(esc(p) + "(?:から|のお客さん)").test(pb.lines[0])) return afterPref();
            say("さようで、" + p + "から。", "shi", afterPref);
          });
        }
      )
    );
  }

  // ★トップの 一席目は 観光地の噺で 固定 (SPEC §11)
  //   昨年の 応募 6 件は ★全件が レッサーパンダ題材。トップで 動物園の話が 出ると
  //   構造が まるで 違っても「去年の 焼き直し」に 見える。
  //   ★血統・動物の 噺は ★園の 入口 (?kin=) から 来た人と、二席目以降に 回す。
  const TOP_FIRST = ["S11", "S12", "S08"];   // 新幹線 / 恐竜との落差 / コンサートの夜
  // ★2026-11-15 作者の判断: 一席目を 動物の 噺へも 広げる (SPEC §11「既定で 動物の 噺から 始めない」を この 41 県の 分だけ 外す)。
  //   ★単独で 始められる (前の 話を「その」で 受けない) 強さ 4 以上の 手書きの 動物の 噺。★これに その県の 噺 (P-○○) を 足して 10 席
  const FIRST_ANIMAL = ["S17", "S32", "S39", "S42", "S44", "S54"];   // 年表 / ライブカメラ / 遊具の名 / 県ごとの勘定 / 小さい子 / えさの時刻

  /** ★一席目を ★先に 決める (2026-11-14)。★その噺の 思い込みを 振りとして 伺う。
   *  順 = ① 今日ちょうどの 暦の噺 (動物で ないもの) ② その県の 手書きの噺 ③ TOP_FIRST
   *  ★園の入口からは 固定を かけない (Core の 点数で 選ぶ)。
   *  ★否定された 思い込みの 噺は 外す (★「そうは 思わない」と 言われた ものを
   *    ひっくり返しても、客の 中では もう 立っていない)。 */
  function firstCandidate(denied) {
    const heard = state.heard || new Set();
    const ok = (s) => s && !s.genchi && !state.shown.has(s.id) &&
      !Core.deniedSeat(s, denied) &&               // ★その 席が ひっくり返す 思い込みを 否定された 席は 外す (副の 思い込みでは 外さない)
      !(state.pbLocal && isLocalSeat(s));          // ★県の つなぎで「大半が 地元」と 言った あとは 同じ 数の 席を 一席目に しない
    if (!state.kin) {
      const md = Core.monthDay(state.input.date);
      const year = Number(state.input.date.slice(0, 4));
      const today = (H.today[md] || []).filter((s) => (!s.onlyYear || s.onlyYear === year) && !isAnimal(s) && ok(s));
      // ★今日の 暦の 席は 前に 聞いていても 固定 (発表会の 実演 11/28 = T-1128)
      if (today.length) return { story: today[0], chosenBy: "today" };
      // ★県を いただいていたら ★その県の 手書きの噺から (README の 決まり 1)。
      //   ★自動生成の 県の噺 (prefStories) は レッサーパンダ題材なので ここでは 使わない
      //   ★2026-11-15: ★前に 聞いた 席なら TOP_FIRST へ (次回は 違う 噺に)
      const mine = state.input.pref
        ? H.stories.filter((s) => ok(s) && !heard.has(s.id) && (s.hooks.prefectures || []).includes(state.input.pref))
        : [];
      if (mine.length) return { story: Core.pickOne(byStrength(mine)).story, chosenBy: "pref" };
      // ★一席目の 候補 = TOP_FIRST 3 + 動物 6 + その県の 噺 (2026-11-15)。★★均等に ランダム
      //   (★別の 人が 同じ 場で 始めても かぶりにくく: 10 席なら 約 10%)。★前に 聞いた 席は 後ろへ (全部 聞いていたら 戻す)
      const own = state.input.pref ? Core.allStories(H).find((x) => x.id === "P-" + state.input.pref) : null;
      const pool = TOP_FIRST.concat(FIRST_ANIMAL).map((id) => H.stories.find((x) => x.id === id))
        .concat(own ? [own] : []).filter(ok).filter((s) => Core.fitsPref(s, state.input.pref));
      if (pool.length) {
        const fresh = pool.filter((s) => !heard.has(s.id));
        const from = fresh.length ? fresh : pool;
        const s = from[Math.floor(Core.rng() * from.length) % from.length];
        return { story: s, chosenBy: own && s.id === own.id ? "pref" : "top" };
      }
    }
    const got = Core.pick(H, state.input).filter((c) => ok(c.story) && Core.fitsPref(c.story, state.input.pref));
    if (got.length) {
      const c = Core.pickOne(got, { heard });
      return { story: c.story, chosenBy: c.reasons.indexOf("pref") >= 0 ? "pref" : "today" };
    }
    const any = Core.pickOne(byStrength(H.stories.filter((x) => ok(x) && Core.fitsPref(x, state.input.pref))), { heard });
    return any ? { story: any.story, chosenBy: "any" } : null;
  }

  /** ★強さを 点に した 候補 (見繕い用) */
  function byStrength(list) {
    return list.map((s) => ({ story: s, score: s.strength || 1 }));
  }

  function tellFirst(c) {
    if (!c) return begin(null);
    state.chosenBy = c.chosenBy;
    tell(c.story);
  }

  /** ★3 問目: 決めた 噺の 思い込みを ★振りの 形で 伺う。★返しを 必ず つける */
  function askBeliefFor() {
    const c = state.candReady ? state.cand : firstCandidate(state.denied || []);
    state.candReady = false;
    state.cand = c;
    // ★問うのは その 席が ひっくり返す 思い込み (台本の furiBelief)。★無い 席は これまでどおり hooks.beliefs の 先頭 (2026-11-20)
    const bid = c && (c.story.furiBelief || ((c.story.hooks || {}).beliefs || [])[0]);
    const b = bid && H.beliefs.find((x) => x.id === bid);
    if (!b) return tellFirst(c);                  // ★伺う 思い込みが 無い 噺は そのまま
    toi();
    state.asked.push(b.id);
    say("噺の前に、ひとつ。「" + b.label + "」。そう思っておいでで?", "shi", () =>
      ask(
        [
          { label: "思う", value: "yes" },
          { label: "いや、どうだか", value: "no" },
          { label: "ほかに言いたいことがある", value: "free" },
        ],
        (v) => {
          if (v === "free") return askFree();
          if (v === "yes") {
            state.input.beliefs.push(b.id);
            state.answered = b.id;          // ★噺の 入りの「その○○」が この 答えを 受ける (Core.bridgeText)
            state.furiAsked = c.story.id;   // ★同じ ことを 振りで もう一度 問わない (tell)
            // ★噺の 入り (bridge) が「では、…」で 始まるので、ここでは 言わない
            return say("でしょうな。みなさん、そうおっしゃいます。", "shi", () => tellFirst(c));
          }
          (state.denied = state.denied || []).push(b.id);
          // ★もう 伺わない (数を 言った 約束)。★否定された 筋を 外して 選び直す
          const alt = firstCandidate(state.denied);
          say("さようで。手強いお客さんだ。では、別の筋で一席。", "shi", () => tellFirst(alt));
        }
      )
    );
  }

  /** ★本人が 選んだときだけの 4 問目 (好きなもの) */
  function askFree() {
    toi();
    say("では、お好きなものを ひとことで。", "shi", () => {
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
      skip.textContent = "やっぱり いい";
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
      const narrow = !!(root.matchMedia && root.matchMedia("(max-width: 640px)").matches);
      if (!narrow) input.focus();
      choicesShown(narrow ? ok : input, "（お好きなものを 打ち込めます。ほかに「やっぱり いい」）");
      const done = (text) => {
        clearChoices();
        state.readChars = 0;                       // ★客が 打った = ここまで 読んだ (★相槌が 次の 席の 頭に 出ていた)
        if (text) {
          const me = document.createElement("p");
          me.className = "line kyaku";
          me.textContent = text;
          put(me);
        }
        const m = Core.match(H, text || "");
        // ★辞書に 当たった = 客が 手がかりを 出した。一席目の固定より こちらを 立てる
        state.gaveHandle = m.hits.length > 0;
        // ★記録に 生の入力を 長く残さない (辞書を育てるのに要る ぶんだけ)
        log("free", null, { text: (text || "").slice(0, 30), hit: m.hits.map((h) => h.word).slice(0, 5) });
        // ★当たらなければ ★伺い直さない (問いを 増やさない)。さきほど 決めた 噺へ
        if (!m.hits.length) {
          return say(text ? "ほう、" + text + "。それにちなんだ噺は、まだ持っておりませんで。では、さきほどの噺を。"
                          : "さようで。では、さきほどの噺を。", "shi", () => tellFirst(state.cand));
        }
        // ★打ち込みの 語から 取った 県は ★選び方にだけ 使う (2026-11-20)。★県の つなぎ・「○○のお客さん」・次回の「また○○から?」には 使わない
        //   (★「言わずにおく」と 断った 客を 好きな 動物園から その県の 人と 決めつけていた)
        if (m.pref && !state.input.pref) state.hintPref = m.pref;
        if (m.belief) {
          if (!state.input.beliefs.includes(m.belief)) state.input.beliefs.push(m.belief);
          state.answered = m.belief;        // ★打ち込みを 受けて 選ぶ 席は「その○○」を 残す
          // ★語と 噺の あいだに ★一言 挟む。★無いと「静か」→ 石像の噺 が 唐突に なる
          return say("ほう、" + m.hits[0].word + "。それでしたら、こんな話がございます。", "shi",
                     () => begin(m.belief));
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

  /** 二席目から (と、好きなもので 手がかりを もらった 一席目) は Core の 点数で 選ぶ */
  /** @param o { noJump: つなぎの 一言を 言わない, noSwitch: 断り (switchNote) を 言わない, avoid: 避けたい 席 (ほかが あれば) } */
  function begin(preferBelief, o) {
    o = o || {};
    // ★二席目は 動物と 動物で ない 噺を 交互に (2026-11-15 作者の判断)。★一席目が 動物 (その県の 噺 含む) なら 動物で ない 噺から
    //   ★2026-11-21 (60): ★動物の 噺が 3 席 続いたら (Core.ANIMAL_MAX)、次も 動物で ない 噺から (手がかり・見繕い・在庫切れ・園の 送り の どの 経路でも)
    const avoidAnimal = (state.count === 1 && !!state.current && isAnimal(state.current)) ||
      Core.animalRun(H, [...state.shown]) >= Core.ANIMAL_MAX;
    // ★避けたい 席 (ほかが あれば 外す)。★2026-11-21: 県の つなぎで「大半が 地元」と 言った あとは 同じ 数の 席 (F21・F26) も 後ろへ (二席目 以降も)。
    //   ★園の 送り (o.home)「生まれた 山の話を」の あとは 西山公園の 席 (県の 噺・よその 県へ「飛びまして」の 席 で ない もの) から
    const avoid = (s) => (avoidAnimal && isAnimal(s)) || (!!o.avoid && o.avoid(s)) ||
      (!!state.pbLocal && isLocalSeat(s)) || (!!o.home && !homeSeat(s));
    const denied = state.denied || [];
    const okDen = (x) => !Core.deniedSeat(x, denied);
    /** ★手書きの 席から 見繕う (must = 必ず 満たす 条件)。★否定された 思い込みの 席・避けたい 席は ほかが あれば 外す */
    const pickFrom = (must) => {
      let pool = H.stories.filter((x) => !x.genchi && !state.shown.has(x.id) && Core.fitsPref(x, state.input.pref) && (!must || must(x)));
      const p2 = pool.filter((x) => okDen(x) && !avoid(x));
      if (p2.length) pool = p2;
      return Core.pickOne(Core.leastSimilar(H, [...state.shown], byStrength(pool)), { heard: state.heard });
    };
    // ★打ち込みの 語から 推した 県 (hintPref) は 選び方にだけ 使う (askFree)
    const input = !state.input.pref && state.hintPref ? Object.assign({}, state.input, { pref: state.hintPref }) : state.input;
    let got = Core.choose(H, input, preferBelief, [...state.shown], [...state.sages],
      { heard: state.heard, avoid, denied, realPref: state.input.pref });
    if (got && input !== state.input && got.switchNote) got.switchNote = got.switchNote.replace("お客さんの土地の噺", "お好きなものに ちなんだ 土地の噺");
    // ★手がかりの 候補が 動物の 噺 だけ だった ときも 交互を 守る: ★動物で ない 席から 見繕う (その県の 噺は 三席目 以降へ)
    if (avoidAnimal && got && isAnimal(got.story)) {
      const c = pickFrom((x) => !isAnimal(x));
      if (c) got = { story: c.story, chosenBy: "any", jump: true };
    }
    // ★園の 送りの あとは 西山公園の 席だけ (★「話は ○○へ 飛びまして」を 送りの 直後に 言わない)
    if (o.home && got && !homeSeat(got.story)) {
      const c = pickFrom(homeSeat);
      if (c) got = { story: c.story, chosenBy: "any" };
    }
    if (!got) {
      log("silent", null);
      // ★見繕いも 強さの 幅の 中から ランダム。★前に 聞いた 席は 後ろへ (2026-11-15)
      //   ★前の 席と 似ない ものから (★2026-11-20 題材の 重なり)。★2026-11-21: 交互 (一席目が 動物なら 動物で ない 席) も 守る
      const mitsukurou = (quiet) => {
        const c = pickFrom(null);
        if (!c) return say("種切れでございます。", "shi");
        state.chosenBy = "any";
        state.jumpNote = state.count && !quiet ? jumpNote() : null;   // ★前の 席が ある ときだけ。★断りを 言った 直後は 重ねない
        tell(c.story);
      };
      // ★「在庫切れ」の 断りは 1 回の 中で 最初の 1 度だけ (2026-11-15)。★2 度目からは 断らずに 見繕い、つなぎの 一言で 入る
      //   ★園の 送り「生まれた 山の話を」の あとは 断らずに 西山公園の 席へ
      if (state.mitsukuriOk || o.home) return mitsukurou(!!o.home);
      // ★「もう一席」を 頼まれた 直後に 素っ気なく 断らない (2026-11-20)。★まず 頼まれた ことを 受ける
      //   ★「さて、次のお客さんの話を、もう一席。」は 言わない (★頼まれた ことを「ありがたいことで」と 受けるので 重なる)
      const lead = (state.nextLead || []).filter((t) => t !== LEAD_NEXT);
      state.nextLead = null;
      const sayAll = (ls, then) => (ls.length ? say(ls[0], "shi", () => sayAll(ls.slice(1), then)) : then());
      if (state.count) {
        // ★2026-11-21:「もう一席」を 押した = もう 頼まれている。★「お願いします / また来る」で もう一度 頼ませない
        //   (★三席目を 頼むと 席より 先に 問いが 出ていた)。★断りを 言って そのまま 見繕う
        state.mitsukuriOk = true;
        return sayAll(lead.concat(["ありがたいことで。ただ、いただいた手がかりの噺は ここまでで、レジの在庫切れでございます。",
                                   "ここからは、こちらで 見繕いまして、もう一席。"]), () => mitsukurou(true));
      }
      // ★一席目 (まだ 何も 頼まれて いない) だけ 問う。★「また来る」を 選んだ 人には 次も 問う
      sayAll(lead.concat(["いただいた手がかりの噺は、ここまででございます。レジの在庫切れでございます。"]), () =>
        say("では、こちらで見繕いましょう。", "shi", () =>
          ask([{ label: "お願いします", value: 1 }, { label: "また来る", value: 0 }], (v) => {
            if (!v) return say("ごゆるりと。", "shi");
            state.mitsukuriOk = true;
            mitsukurou();
          })
        )
      );
      return;
    }
    state.chosenBy = got.chosenBy;
    state.switchNote = o.noSwitch ? null : got.switchNote;
    state.jumpNote = got.jump && !o.noJump ? jumpNote() : null;
    state.when = got.when || null;
    state.whenStory = got.story;
    tell(got.story);
  }
  /** ★西山公園の 席か (園の 送り「その子らが 生まれた 山の話を」の あとに 出して よい 席)。
   *  ★県の 噺 (P-○○) と、入りが「話は ○○へ 飛びまして」に なる 席 (よその 県の 客に 話しかける 席) は 違う */
  function homeSeat(s) {
    if (!s || /^P-/.test(s.id)) return false;
    return !/^話は /.test(Core.bridgeText(s, { pref: state.input.pref, prefs: H.prefectures }));
  }

  /** ★筋が 飛ぶ ときの 強引な つなぎ (㉟)。★この 回で 言った ものは 続けない */
  function jumpNote() {
    const t = Core.jumpLine(state.jumpUsed);
    (state.jumpUsed = state.jumpUsed || []).push(t);
    return t;
  }

  function tell(st) {
    state.current = st;
    state.shown.add(st.id);
    state.count += 1;
    if (state.count === 1) state.firstId = st.id;
    const lead = state.nextLead || [];            // ★「もう一席」の 一言・園の 送り (nextStory)
    state.nextLead = null;
    // ★2026-11-15 見直し: 札を 見た あと「もう一席」で 画面が ずれた まま 進んだ (scroll は 下へ 追う だけ)。
    //   ★二席目 から: 席の 頭の 印を 置き、★その 印を 画面の 上 (見出しの 下) へ 送る (★2026-11-23 から なめらかに。動きを 減らす 設定では 瞬時)。
    //   ★2026-11-22: 前の 席は 畳まない (上へ 戻れば 読める)。★印は 高さ 0 の 行 (画面の 位置を 測る ため。読み上げには 出ない)
    if (state.count > 1) {
      const m = document.createElement("div");
      m.className = "seat-start";
      m.setAttribute("aria-hidden", "true");
      put(m);
      setFollow(true);
      hideZu(); setMidashi(st.title);                 // ★枠を 先に 替えて から 測る (見直し r9 H5: 後で 替えると 瞬時の 補正が なめらかな 送りを 打ち切る)
      try {
        const head = $("kozahead").getBoundingClientRect();
        const top = m.getBoundingClientRect().top + scrollY() - Math.max(0, head.bottom - head.top);
        autoScrollTo(Math.max(0, Math.round(top)), !lessMotion());   // ★二席目の 頭へも スクロールで (2026-11-23 見直しの 声「節目で 飛ぶ」)
      } catch (e) {}
    }
    state.lastCorrect = null;
    state.sages.add(st.sage);
    $("sageBox").hidden = true;
    state.cardShown = false;
    $("sources").hidden = true;
    $("sourcesBtn").setAttribute("aria-expanded", "false");
    $("mekuri").textContent = st.title;
    // ★題の 字数 (スマホで 大きさを 変える。16 字 以上は 16)。★めくりを 折らない (2026-11-21)
    $("mekuri").dataset.n = String(Math.min(16, Array.from(String(st.title || "")).length));
    $("mekuri").classList.remove("flip");
    void $("mekuri").offsetWidth;
    $("mekuri").classList.add("flip");
    stage(0);
    // ★席の 頭: 前の 写真・図を 下げ、見出しは 演目名 (まくらまでは 場面に 入れない)。
    //   ★前段の 写真だけは 最初の 場面まで 残す (★下げると 再訪の 筋で 一瞬で 消える)
    const fadeOut = !(state.bg && state.bg.opening) && bgOut();   // ★消え終わるまで 語りを 待たせる (最後の next)
    withHead(() => { hideZu(); setMidashi(st.title); });
    // ★この端末で はじめて 一席 聴いた 時刻 (現地で 開いたとき「何時間 前に 聴いたか」を 出す)
    if (!store.get(FIRST_KEY)) store.set(FIRST_KEY, new Date().toISOString());
    // ★mondo = 本題に 入るまでの 問答の 数 (★一席目の 約束「三つだけ」の 見張り)
    log("shown", st, { mondo: state.mondo, by: state.chosenBy || null });
    // ★この席の 写真を 決めて ★先に 読み始める (場面ごとの 写真 / 札)
    const hon = st.hondai || [];
    const scenes = sceneList(st);
    state.scenes = scenes;
    state.photo = { ck: cardKey(st) };
    loadImg(scenes.map((s) => specGroup(s.img)).concat(["card_" + state.photo.ck]), () => {});
    const head = [];
    // ★県の つなぎ (prefBridge。2026-11-15 作者の判断「噺に つなげる つなぎを 都道府県別で」)
    //   ★はじめから (園の 入口で ない) で 県を いただいた 人の ★一席目の 前に 1 回だけ。地の文で 順に 言う。
    //   ★園の 入口には 園の 挨拶が あるので 出さない。★現地の 謎かけから 入った 席にも 出さない。
    //   ★bundle に まだ 無い / その県が 無い ときは 何も 言わない
    //   ★2026-11-15: ★ふだんは 県を 伺った 直後に 言う (sayPrefBridge)。★ここは その あとで 県が 分かった
    //   (打ち込みで 県が 当たった) ときの 控え。★最後の「では、…ひとつ。」は どちらでも 言わない
    state.pbFor = null;
    const pb = !state.kin && state.count === 1 && state.chosenBy !== "genchi" && !state.pbSaid
      ? Core.prefBridgeOf(H, state.input.pref) : null;
    if (pb) {
      bridgeLines(pb, st).forEach((t) => head.push(t));   // ★前段と 同じ 選び方 (一席目と 同じ 数の 行は 言わない・「大半が」を 覚える)
      state.pbSaid = true;
      state.pbFacts = pb.facts;
    }
    if (state.count === 1 && state.pbSaid && state.chosenBy !== "genchi") state.pbFor = st.id;   // ★タネ明かしに 足す (renderSources)
    const saidPb = state.pbSaid;
    let noted = false;
    if (state.switchNote) {
      // ★同じ 断りは 1 回の 中で 1 度だけ (2026-11-20。二席目・三席目で 同じ 言い訳が 聞こえていた)
      //   ★2026-11-21: 暦の 席へ 入る ときは 断りを 言わない (★入り「では、今日という日の話を。」の 1 行で 足りる。
      //   前は「その筋の噺は…趣を変えて」「…かわりに、今日という日で一席」と 重ね、「今日という日」を 二度 言っていた)
      state.notesSaid = state.notesSaid || [];
      if (!st.isToday && state.notesSaid.indexOf(state.switchNote) < 0) { head.push(state.switchNote); state.notesSaid.push(state.switchNote); noted = true; }
      state.switchNote = null;
    }
    if (state.jumpNote) {
      head.push(state.jumpNote);
      state.jumpNote = null;
    }
    // ★暦の 席は 当日 だけ 出る (Core.pick。2026-11-20)。★別の 日の 断り (「もうすぐ」「外れますが」) は 要らなく なった
    // ★席の 入り (bridge) を 前後に 合わせる (2026-11-15。Core.bridgeText / seatLines)
    //   ★「その○○」は 直前の 客の 答えを 受けて 選んだ 席だけ / ★県の噺の 挨拶は 二度 言わない・よその 県の 客に 話しかけない
    //   ★「○○のお客さんに、ひとつ。」は 一席目で 県の つなぎを 言った ときは 言わない。★bridge と 1 文に まとめる
    const answered = !!state.answered && Core.beliefsOf(st).indexOf(state.answered) >= 0;
    state.answered = null;
    let bridge = Core.bridgeText(st, { pref: state.input.pref, answered, prefs: H.prefectures });
    // ★暦の 席が 二つ 続く ときは 二つ目の 入りを 替える (★「今日という日の話を」を 二度 言わない。2026-11-21)
    if (st.isToday && state.todayTold && /今日という日/.test(bridge)) bridge = "もう一つ、今日の話を。";
    if (st.isToday) state.todayTold = (state.todayTold || 0) + 1;
    // ★園の 送り「生まれた 山の話を ひとつ。」の あとに 入り (「では、…の話を。」) が 続く なら、送りは 入りに しない (二重の 入り)
    const lead2 = bridge ? lead.map((t) => (t === SEND_HOME ? SEND_HOME2 : t)) : lead;
    const prefHead = !(saidPb && state.count === 1) && state.chosenBy === "pref" && state.input.pref ? state.input.pref : "";
    const intro = Core.seatLines(lead2.concat(head), bridge, { prev: state.lastSaid, prefHead });
    // ★「次のお客さんの話を」の 直後に「○○のお客さんに」と 目の前の 客へ 話しかけない (2026-11-20)
    //   ★2026-11-21: 断り (「その筋の噺は…」「いただいた手がかりの噺は…」= この 客の 話) が 続く ときも「次のお客さん」と 言わない
    if (lead2[0] === LEAD_NEXT && (noted || intro.slice(1).some((t) => t.indexOf("お客さんに") >= 0))) intro[0] = LEAD_SHORT;
    const nIntro = intro.length;
    // 振り = ★何の噺かを 名乗り、客の 頭に 問いを 立てる (★答えは 言わない)
    //   ★2026-11-20: ★前段で 同じ 思い込みを 問うた 席 / 客が 否定した 思い込みの 席 (暦の 席) は 振りを 飛ばして まくらから
    //   (★「そう思っておいでで?」→「思う」の 直後に 振りで 同じ ことを 問い直していた)
    const deniedNow = Core.deniedSeat(st, state.denied || []);
    const furi = st.furi && state.furiAsked !== st.id && !deniedNow ? st.furi : null;
    if (state.furiAsked === st.id) state.furiAsked = null;
    // ★本題は 地の文 (文字列) と 台詞 ({who, text}) を 混ぜられる (圓朝の 一字+カギ括弧)
    const lines = intro.concat(furi ? [furi] : [], [st.makura], hon);
    const makuraAt = nIntro + (furi ? 1 : 0);
    // ★キーとなる 単語 (サゲが 受け返す 語句) を 太字に (2026-11-21)。★振り・まくら・本題の 行だけ (席の 入りの 行は 除く)
    const seatKeyList = Core.seatKeys(lines.slice(nIntro), st);
    // ★場面の 頭 (= 本題の from 行目の 前) で、見出しと 写真 (か 図) を 替える。
    //   ★img2 は その 場面の 真ん中の 行の 前で 差し替える (★本題を 2 つに 割る ときと 同じ 切り方)
    const sceneAt = {}, img2At = {};
    scenes.forEach((s, j) => {
      const from = s.from || 0, to = s.to == null ? from : s.to;
      sceneAt[makuraAt + 1 + from] = j;
      if (s.img2 && to > from) img2At[makuraAt + 1 + from + Math.ceil((to - from + 1) / 2)] = j;
    });
    const sceneDone = {}, img2Done = {};
    // ★図の 場面 (fig: "main") は ★答えを 先に 見せない 図 (when = hondai) の ときだけ。
    //   ★答え合わせの あとに 出す 図 (when = after) は これまでどおり あとで 出す
    const figMain = !!(st.fig && (st.fig.when || "hondai") === "hondai" && Core.figSvg(st.fig));
    let i = 0;
    let figShown = false, stage1 = false;
    // ★仕草 = 上下 (かみしも) の 首振り (P1-3)。★台詞の 話し手が 前の 台詞と 替わった ときだけ
    //   吹き出しを 左右から わずかに 寄せて 出す (客は 右から、私は 左から。CSS の shigusa)。
    //   ★比べるのは「この 席の 前の 台詞の 話し手」。地の文を 挟んでも 同じ 話し手なら 動かさない
    //   (首を 振るのは 人物を 替える とき)。★席の 頭で 忘れる = その席の 最初の 台詞は 寄せる。
    //   ★動きを 減らす 設定では 付けない (CSS でも 止まる)
    let lastWho = null;
    const next = () => {
      // ★長く 読んだら「次へ」で 止める (場面の 切れ目で READ_SCENE / 途中でも READ_MAX)
      const atScene = i in sceneAt && !sceneDone[i];
      const rc = state.readChars || 0;
      if (i > 0 && (i < lines.length || atScene) && ((atScene && rc >= READ_SCENE) || rc >= READ_MAX)) {
        const nx = lines[i];
        return pauseNext(next, !!nx && typeof nx === "object" && nx.who === "客");
      }
      if (i === makuraAt + 1 && !stage1) { stage1 = true; stage(1); }
      if (i in sceneAt && !sceneDone[i]) {
        sceneDone[i] = true;
        const s = scenes[sceneAt[i]];
        const useFig = s.fig === "main" && figMain;
        if (useFig) figShown = true;               // ★本題の 後で もう一度 出さない
        return enterScene(st, s, sceneAt[i], useFig, next);
      }
      if (i in img2At && !img2Done[i]) {
        img2Done[i] = true;
        return swapImg2(scenes[img2At[i]], next);
      }
      if (i >= lines.length && st.fig && (st.fig.when || "hondai") === "hondai" && !figShown) {
        figShown = true;
        return say("ひとつ、数字をお目にかけます。", "shi", () => showFig(st.fig, next));
      }
      if (i < lines.length) {
        const furiAt = nIntro;
        let cls = i === makuraAt ? "shi makura" : (furi && i === furiAt ? "shi furi" : "shi");
        let text = lines[i];
        // ★キーとなる 単語 (サゲが 受け返す 語句) を 太字に (2026-11-21)。★席の 入りの 行 (intro) には 付けない
        if (i >= nIntro) state.sayKey = seatKeyList[i - nIntro] || null;
        if (text && typeof text === "object") {          // 台詞
          cls = "serifu " + (text.who === "客" ? "kyaku2" : "watashi");
          if (text.who !== lastWho && !lessMotion()) cls += " shigusa";
          lastWho = text.who;
          text = text.who + "「" + text.text + "」";
        }
        say(text, cls, () => {
          i += 1;
          next();
        });
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
              // ★外れた ときは 返しの あとに 正解を 1 行 (2026-11-21 作者の判断)。★返しが もう 正解を 言って いれば 重ねない
              const seikai = ok ? "" : Core.answerLine(st.question, r);
              // ★オチの 直前に 空白を 置く (法則2: 笑いを 一度 切ってから 落とす)
              const toSage = toOchi;
              // 答えが写ってしまう絵図は、答え合わせのあとで見せる。★正解を 言った あとは「答えは」を 重ねない
              const afterFig = st.fig && st.fig.when === "after"
                ? () => say(seikai ? "数字で並べますと、この一枚で。" : "答えは、この一枚で。", "shi", () => showFig(st.fig, toSage))
                : toSage;
              // ★正解の 1 行は 返しと「一続きの 一声」(2026-11-21 作者の判断。見直し r7 案B)。
              //   ★返しを hazure に して 一段 下げ、正解と 同じ 金の 罫で つなぐ (CSS)。
              //   ★間は 返しを 打ち終えてから 正解まで KOTAE_SEIKAI (行末の 間を 含む。空きは 作らない)
              //   ★返しが もう 正解を 言って いる (正解の 1 行が 無い) ときは 今までの 返しの まま
              const afterR = seikai
                ? () => matsu(Math.max(0, KOTAE_SEIKAI - endPause(r)), () => say(seikai, "shi seikai", afterFig))
                : afterFig;
              // ★一拍 置いてから、★大きく 遅く 出す。★ここが 噺家の 強弱の 山
              ma(900, () => say(r, seikai ? "shi kotae hazure" : "shi kotae", afterR));
            }
          )
          )
        );
      } else {
        toOchi();
      }
    };
    // ★あて推量 (guess) は ★サゲの あと・追い足しの 前 (2026-11-21 作者の判断。sage())。
    //   ★問いの 前だと 問いの 答えを、サゲの 直前だと オチを 先に 言っていた (S43・S55・T-1128 ほか)。★台本の 文は 変えない
    // ★「さて、ここからが オチで ございます」で 写真 (と 図) を 下げる。★サゲは 紙の 地で 出す
    //   (★いちばん 読ませたい 一行を 写真に 重ねない)
    //   ★2026-11-15: 台本に "yokoku": false の 席 (自動の 席) は ★予告の 一行を 言わない
    //     (4 択の 直後の「さて、ここからがオチ」が 肩透かしに なっていた 見直し)。★写真と 図を 下げる のは 同じ
    const toOchi = () => {
      const out = bgOut();
      withHead(hideZu);
      const go = () => {
        if (st.yokoku === false) return blank(sage);
        say("さて、ここからがオチでございます。", "shi yokoku", () => blank(sage));
      };
      return out ? waitFade(go) : go();          // ★写真が 消え終わるまで 文字を 止める
    };
    return fadeOut ? waitFade(next) : next();
  }

  function sage() {
    const st = state.current;
    stage(2);
    const sageText = st.sage + Core.sageExtra(st, state.input.date);
    say(sageText, "shi sage", () => {
      const then = () => uwasa(st, () => afterSage(st));
      const ato = () => (st.atogaki ? say(st.atogaki, "shi ato", then) : then());
      // ★あて推量は サゲ (と 註) の あと・追い足しの 前 (2026-11-21 作者の判断)。
      //   ★順 = サゲ → 註 → 推量 → 追い足し。★註は サゲの「何の ことか」なので サゲの すぐ 下に 置き、
      //   ★推量は サゲで 割れた 事実の「なぜ」を 受ける (出典に「なぜ」が無いとき、噺家が 引き受けて 推し量る。事実としては 語らない)
      // ★推量は ポイントを 太字・「ではないか / のでは」の 後に「……」(表示だけ。2026-11-21 作者の判断)
      const rest = () => {
        if (!st.guess) return ato();
        const g = Core.guessShape(st.guess);
        if (g) state.sayKey = { text: g.point, cls: "point", last: true };
        return say(g ? g.text : st.guess, "shi suiryo", ato);
      };
      // ★余韻 (YOIN)。★行末の 間 (endPause) を 含めて 打ち終わりから 註まで YOIN.note
      matsu(Math.max(0, YOIN.note - endPause(sageText)), () => {
        // ★オチが 西山公園の 何の ことか (2026-11-15 作者の案)。★噺家の 台詞では なく 画面の 小さな 註 (余韻を 壊さない)。
        //   ★サゲと 同じく 札まで 畳まない (data-sid)
        if (!st.ochiWhat) return rest();
        const n = document.createElement("p");
        n.className = "ochi-what";
        n.dataset.sid = st.id;
        setPhrase(n, "↳ " + st.ochiWhat + "のこと");
        put(n);
        scroll();
        matsu(YOIN.next, rest);
      });
    });
    // ★この 席の サゲの 行に 印 (data-sid。★前は 畳みで 札まで 残す ため。いまは 畳まない)
    if (typing && typing.el && typing.el.dataset) typing.el.dataset.sid = st.id;
  }

  /** 数字が割れているところは、一覧で見せずに「噂ですが」の一言として置く */
  function uwasa(st, after) {
    const u = st.uwasa && st.uwasa.text;
    if (!u) return after();
    say(u, "shi uwasa", after);
  }

  function afterSage(st) {
    // ★札は「出します」と言ってから出す (黙って出ると 何の絵か 分からない)
    // ★札の 写真 (3 枚目) を 読み終えてから 描く
    say("ここで、今日のオチを書いた札を一枚、お出しします。", "shi", () =>
      loadImg(["card_" + ((state.photo && state.photo.ck) || cardKey(st))], () => showCard(st)));
  }

  /** ★札を 渡した あと (「お持ち帰りを」の 一言の あと)、画面を 半分 ほど 下へ 送って 札を 見せる
   *  (2026-11-22 見直しの 声「下へ スクロールしないと 出てこない」。★札は 選択肢の 下に あり、追従は 語りと 選択肢しか 見ていなかった)。
   *  ★札の 上端が 見出しの 下に 来たら そこで 止める (送りすぎない) */
  function revealCard() {
    try {
      const box = $("sageBox");
      if (!box || box.hidden || !follow.on) return;   // ★読み返し中は 引き戻さない (見直し r9 H3)
      state.cardShown = true;
      const top = box.getBoundingClientRect().top;
      const dy = Math.min(Math.round(window.innerHeight * 0.5), Math.round(top - (headBottom() + 8)));
      if (dy > 0) autoScrollBy(dy, !lessMotion());
    } catch (e) {}
  }
  /** ★札を 一度 見せた あとは、謎かけの 文などで 下へ 押し出されても ★画面から 消さない (上の CARD_PEEK px は 見えている)
   *  (2026-11-23 作者の判断「画面から 消えない 程度で 札を 下へ 押し出すのは OK」。見直し r9 H1: 謎かけで 札が 画面の 外へ 押し戻されていた) */
  const CARD_PEEK = 140;
  function cardPeek(instant) {
    try {
      const box = $("sageBox");
      if (!box || box.hidden || !follow.on || !state.cardShown) return;
      const top = box.getBoundingClientRect().top;
      const lim = window.innerHeight - CARD_PEEK;
      if (top > lim) autoScrollBy(Math.round(top - lim), !instant && !lessMotion());
    } catch (e) {}
  }
  function showCard(st) {
    {
      drawCard(st);
      // ★札は 絵 (canvas)。★読み上げには オチの 文を 渡す (見直し)
      $("card").setAttribute("aria-label", "オチ札：" + st.sage);
      renderSources(st);
      $("sageBox").hidden = false;
      stage(3);
      showKoe(st);
      scroll();
      if ($("genchiAgain")) $("genchiAgain").hidden = true;   // ★札の 流れの 終わりで 出し直す (refreshGenchi)
      // ★2026-11-20 作者の判断: ★もう 公園に いる 人 (謎かけで 開いた 現地の 席 / 最初に「いま、公園におります」) には
      //   「行ってみたい気持ち」を 聞かない。★札 → 次の 謎かけへ。★来訪は 謎かけに 当たった 記録で 測る
      if (st.genchi || state.onsite) {
        return say("よろしければ、この札を お持ち帰りを。「この札をもらう」で、お手元に 残ります。", "shi", () => { revealCard(); offerGenchi(st); });
      }
      // ★二席目 からは「さきほどは、「…」で」(2026-11-20。前の 席の 終わりにも 伺って いるので「はじめに」では 合わない)
      //   ★2026-11-21: 何も 伺って いない 回 (前の 答えが 無い) に「はじめに、お気持ちを伺いました」と 言わない
      const first = state.q0label ? "はじめに伺ったときは、「" + state.q0label + "」でございました。"
        : state.q1label ? "さきほどは、「" + state.q1label + "」でございました。" : "";
      const sayFirst = (f) => (first ? say(first, "shi", f) : f());
      sayFirst(() =>
        say("いま、いかがです。西山公園、行ってみたい気持ちは。", "shi", () =>
        ask(
          [
            { label: "やっぱり、べつに", value: 1 },
            { label: "ふつう", value: 3 },
            { label: "行ってみたい", value: 5 },
          ],
          (v, label) => {
            const d = state.q0 == null ? null : v - state.q0;
            log("q1", st, { value: v });
            if (d != null) log("delta", st, { delta: d, before: state.q0, after: v });
            state.q0 = v; // 次の席は、いまの気持ちを基準に測る
            state.q0label = null;
            state.q1label = label;
            // ★前も いまも いちばん 上 (行ってみたい) なら「動かない = しくじり」では ない (2026-11-21。乗り気の 客を がっかりした 声で 受けていた)
            const r = d == null ? (v >= 5 ? "ありがたいことで。" : "さようで。")
              : d > 0 ? "おや。ひとつ動きましたな。"
              : d === 0 && v >= 5 ? "変わらず、行ってみたいと。ありがたいことで。"
              : d === 0 ? "動きませんか。精進いたします。" : "しくじりました。次で挽回を。";
            // ★「お持ちを」だけでは 何を 持つか 分からない (2026-11-15 見直し) → 札だと 言う
            say(r, "shi", () => say("よろしければ、この札を お持ち帰りを。「この札をもらう」で、お手元に 残ります。", "shi", () => { revealCard(); offerGenchi(st); }));
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
    Core.factsOf(H, st, state.pbFor === st.id ? state.pbFacts : null).forEach((f) => {
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
    setFollow(true);                                       // ★別の噺・もう一席 = 先へ (見直し)
    // ★2026-11-15 (見直し): 語りの 途中で 押すと、走っている 文字送りの タイマーが 前の 席の 筋を
    //   続けて ★席が 二重に 走っていた。★まず 止める。★写真待ちの 呼び戻しも 世代で 捨てる (enterScene)
    if (typing) {
      clearTimeout(typing.timer);
      if (!typing.done && typing.full) land(typing);   // ★打ちかけの 行は 全文に して から 止める
      typing = null;
    }
    state.pauseFn = null;
    state.readChars = 0;
    rmCls($("koza"), "hitoiki");
    state.gen = (state.gen || 0) + 1;
    // ★「もう一席」は 札の 箱ごと 隠れる → ★フォーカスを 高座へ 移し、次の 選択肢の 先頭へ 渡す (見直し)
    if (activeIn($("sageBox")) || activeIn($("choices"))) { state.focusChoices = true; focusKoza(); }
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
    //   ★2026-11-20: 送りの 2 行は ★一席目が 本当に その園 (か その県の 園) の 噺 だった ときだけ。
    //     ★その園の 話を して いないのに「ここまで」と 言っていた。★送った あとは 断り (switchNote) を 重ねず、その園・県の 園の 噺は 後ろへ
    //   ★送りの 行・「もう一席」の 一言は 次の 席の 頭で 言う (tell。★次の 席が「○○のお客さんに」で 入る なら 言い方を 変える)
    if (state.kin && !state.sentHome) {
      state.sentHome = true;
      const z = state.kin;
      const firstSt = Core.allStories(H).find((s) => s.id === state.firstId);
      const tie = kinTie(firstSt, z);
      if (tie) {
        state.nextLead = ["さて、" + (tie === "zoo" ? kinName(z) : Core.prefShort(z.pref) + "の園") + "の話は ここまでで。", SEND_HOME];
        // ★送りの あとは 西山公園の 席だけ (home。2026-11-21: 送りの 直後に「話は 新潟へ 飛びまして」と 言っていた)
        return begin(last, { noJump: true, noSwitch: true, avoid: (s) => !!kinTie(s, z), home: true });
      }
    }
    state.nextLead = [LEAD_NEXT];
    begin(last);
  }
  const LEAD_NEXT = "さて、次のお客さんの話を、もう一席。";
  // ★園の 送りの 2 行目。★次の 席に 入り (bridge「では、…の話を。」) が ある ときは 入りを 二つ 重ねないよう SEND_HOME2 に 替える (tell)
  const SEND_HOME = "ここからは、その子らが 生まれた 山の話を ひとつ。";
  const SEND_HOME2 = "ここからは、その子らが 生まれた 山へ 戻りまして。";
  const LEAD_SHORT = "さて、もう一席。";
  /** ★園の 入口: 表に 出す 園の 名 (★海外は 国・都市の 名なので「…の動物園」と 言う。「中国から」が 地方の 名と 読めた) */
  function kinName(z) {
    return z.pref ? z.name : String(z.name || "").replace(/（[^）]*）\s*$/, "") + "の動物園";
  }
  /** ★その 席が 園の 入口の 園に 触れて いるか: "zoo" = その園の 名が 出る / "pref" = その県の 園の 噺 (動物の 噺で 県が 同じ) / null */
  function kinTie(st, z) {
    if (!st || !z) return null;
    const txt = [st.title, st.bridge, st.furi, st.makura, Core.hondaiText(st), st.sage, st.atogaki].filter(Boolean).join(" ");
    const nm = String(z.name || "");
    const nm2 = nm.replace(/^[^市区町村]{1,6}[市区町村]立?/, "");
    if ((nm && txt.indexOf(nm) >= 0) || (nm2.length >= 4 && nm2 !== nm && txt.indexOf(nm2) >= 0)) return "zoo";
    if (z.pref && isAnimal(st) && (((st.hooks || {}).prefectures) || []).indexOf(z.pref) >= 0) return "pref";
    return null;
  }

  // ---- 現地の二席目 (2026-11-14 画面の 外の 公園へ 足を 運ぶ 楽しみを 置く) -------
  //   ★一席目は どこでも 聴けて 完結する。★その あとに「続きの オチは 西山公園に」と 言い、
  //     現地で しか 分からない 謎かけを 1 つ 出す。★答えると その場所の 席が 開く。
  //   ★verified_onsite が null の 謎かけは 出さない (Core.liveSpots)。
  //   ★答えは ソースに 見える。鍵では なく 楽しみの 仕掛け。開いた数は 来訪の 代理指標。
  function genchiState() {
    try { return JSON.parse(store.get(GENCHI_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveGenchi(g) { store.set(GENCHI_KEY, JSON.stringify(g)); }

  /** この席の あとに 出す 謎かけ。★一席目の あと → 道の起点 / 現地の席の あと → その次 */
  function nextSpot(st) {
    const live = Core.liveSpots(H);
    const opened = genchiState().opened || [];
    // ★差し替え (alt_of) は 自分の 席を 持つ ときだけ (2026-11-20)。★元と 同じ 席 (G2b の story が G2 と 同じ S56) なら 出さない
    //   (★展望デッキの 眼鏡の ベンチで 答えた 直後に、結びの 広場の 足あとの ベンチの 噺が 始まっていた)
    const mainOf = (id) => (H.genchi || []).find((m) => m.id === id) || {};
    const byId = (id) => live.find((g) => g.id === id ||
      (g.alt_of === id && !live.some((x) => x.id === id) && g.story && g.story !== mainOf(id).story));
    if (st.genchi) {
      const me = (H.genchi || []).find((g) => g.id === st.genchi);
      const nx = me && me.next ? byId(me.next) : null;
      // ★nextLine (「この続きは、坂の中ほど、結びの広場に 置いてまいりました。」) を 言って よいのは
      //   ★次の 謎かけを 出す とき と ★道の 終わり (next が 無い。G3 の 結び) だけ (2026-11-21)。
      //   ★次の 場所が まだ 現地で 確かめて いない (出ない) ときに 言うと、行っても 何も 無い 場所へ 客を 送る。
      //   ★台本に その ときの 一言 (nextLineClosed) が あれば そちら。無ければ 何も 言わない
      const end = !!me && !me.next;
      const line = !me ? "" : nx || end ? me.nextLine : (typeof me.nextLineClosed === "string" ? me.nextLineClosed : "");
      return { spot: nx && opened.indexOf(nx.id) < 0 ? nx : null, line: line || "" };
    }
    if (state.count !== 1 || state.genchiOffered) return { spot: null };
    const first = live.filter((g) => !g.alt_of && opened.indexOf(g.id) < 0)[0];
    return { spot: first || null, line: "" };
  }

  function offerGenchi(st) {
    const n = nextSpot(st);
    if (!n.spot) {
      // ★道の 終わり (または 先が まだ 確かめて いない) は 場所だけ 言って 送る
      if (st.genchi && n.line) return say(n.line, "shi", refreshGenchi);
      return refreshGenchi();
    }
    state.genchiOffered = true;
    const g = genchiState();
    g.pending = n.spot.id;
    saveGenchi(g);
    log("genchi_offer", st, { spot: n.spot.id });
    // ★「二席目」とは 呼ばない (★家で「もう一席」を 押すと 始まる 席と 呼び方が 重なる。2026-11-20)
    const lead = st.genchi ? n.line : "この噺の続き、現地でだけ聞ける一席を、西山公園に置いてまいりました。";
    say(lead, "shi", () =>
      say("その場所へ 行けば 分かる 謎かけを、ひとつ。", "shi", () => askRiddle(n.spot)));
  }

  function askRiddle(spot) {
    say(spot.riddle, "shi toi", () => {
      const box = $("choices");
      box.innerHTML = "";
      const form = document.createElement("form");
      form.className = "freeform";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "その場で 見て、答えを";
      input.setAttribute("aria-label", "謎かけの答え");
      input.setAttribute("enterkeyhint", "send");
      const ok = document.createElement("button");
      ok.type = "submit";
      ok.className = "btn choice";
      ok.textContent = "答える";
      const later = document.createElement("button");
      later.type = "button";
      later.className = "btn choice";
      later.textContent = "いまは よしておく";
      const row = document.createElement("div");
      row.className = "freebtn";
      row.append(ok, later);
      form.append(input, row);
      box.appendChild(form);
      choicesShown(input, "（答えを 打ち込めます。ほかに「いまは よしておく」）");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return;
        clearChoices();
        state.readChars = 0;                       // ★客が 答えた = ここまで 読んだ
        const me = document.createElement("p");
        me.className = "line kyaku";
        me.textContent = v;
        put(me);
        if (Core.riddleOk(spot, v)) return unlock(spot);
        log("genchi_miss", null, { spot: spot.id });
        // ★「惜しい」では なく ★ヒントを 一つ
        say("それが、違うんで。ヒントを ひとつ。" + (spot.hint || ""), "shi", () => askRiddle(spot));
      });
      later.addEventListener("click", () => {
        clearChoices();
        state.readChars = 0;
        // ★2026-11-20: 「幕の 上の」は 画面の 上の ほうと 読めた → ★どこに 出るかを 言う
        say("結構でございます。続きは、いつか 現地で。札の 下か、次に 開いた ときの 最初の 画面の「現地の謎かけに答える」から、いつでも どうぞ。", "shi", refreshGenchi);
      });
      scroll();
    });
  }

  function unlock(spot) {
    const st = H.stories.find((s) => s.id === spot.story);
    if (!st) return say("おや、その噺が 見当たりません。", "shi");
    const g = genchiState();
    g.opened = (g.opened || []).concat([spot.id]);
    if (g.pending === spot.id) delete g.pending;
    saveGenchi(g);
    refreshGenchi();
    const first = store.get(FIRST_KEY);
    const hours = first ? Math.round((Date.now() - new Date(first).getTime()) / 36e5 * 10) / 10 : null;
    log("genchi_unlock", st, { spot: spot.id, firstSeenAt: first || null, hoursSinceFirst: hours, pref: state.input.pref || "" });
    state.chosenBy = "genchi";
    state.readChars = 0;
    // ★謎かけに 当たった = もう 公園に いる (2026-11-21)。★この あとの 席でも「行ってみたい気持ち」を 聞かない (2026-11-20 の 判断の 続き)。
    //   ★表紙の「現地の謎かけに答える」から 入った 回でも 同じ (★前は 何も 伺って いないのに「はじめに 伺いました」と 言っていた)
    state.onsite = true;
    ma(700, () => say("ご名答。現地まで、ようこそ。", "shi kotae", () => tell(st)));
  }

  /** ★幕から 直に 謎かけへ (★一席目は 前に 聴いた。現地で 答えるだけの 人) */
  function openGenchi() {
    const g = genchiState();
    const spot = Core.liveSpots(H).find((x) => x.id === g.pending);
    if (!spot) return open();
    enterKoza();
    state.input.date = entry().date || Core.todayString();
    state.input.pref = store.get(PREF_KEY) || "";
    state.heard = heardBefore();
    state.genchiOffered = true;
    say("おや、お預けの 続きで ございますね。", "shi", () => askRiddle(spot));
  }
  /** ★「現地の謎かけに答える」(表紙 + 札の 下) = ★答えて いない 謎かけが ある ときだけ。
   *  ★前は 開いた ときに 1 回だけ 決めていて、同じ 画面の ままでは どこにも 出なかった (2026-11-20 見直し) */
  function refreshGenchi() {
    const g = genchiState();
    const on = Core.liveSpots(H).some((x) => x.id === g.pending);
    $("genchiBtn").hidden = !on;
    if ($("genchiAgain")) $("genchiAgain").hidden = !on;
  }
  refreshGenchi();

  /** ★札の 下から お預けの 謎かけへ (★高座の 中で そのまま) */
  function genchiAgain() {
    const g = genchiState();
    const spot = Core.liveSpots(H).find((x) => x.id === g.pending);
    if (!spot) return refreshGenchi();
    $("genchiAgain").hidden = true;
    clearChoices();
    state.genchiOffered = true;
    say("では、お預けの 謎かけを。", "shi", () => askRiddle(spot));
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
    openPanel("kin");
  }

  // ---- 場 --------------------------------------------------------------
  function clearLog() {
    if (!window.confirm("この端末に貯めた記録を、すべて消します。よろしいですか。")) return;
    // ★「すべて 消します」と 言うので、★前回の 県・初回の 時刻・謎かけの お預けも 消す
    //   (★発表会の 実演前の リセットに 使う。消さないと「また○○からで?」に なる)
    try { [LOG_KEY, PREF_KEY, FIRST_KEY, GENCHI_KEY].forEach((k) => localStorage.removeItem(k)); } catch (e) {}
    $("baBody").textContent = "記録を消しました。";
  }

  function showBa() {
    const { stories, prefs, genchi } = Core.ba(readLog());
    const body = $("baBody");
    body.innerHTML = "";
    if (genchi.offer || genchi.unlock) {
      const t = document.createElement("table");
      t.className = "batable";
      t.innerHTML = "<thead><tr><th>現地の謎かけ</th><th>数</th></tr></thead>";
      const tb = document.createElement("tbody");
      [["出した", genchi.offer], ["現地で開いた", genchi.unlock],
       ["うち、事前に一席聴いていた端末 (一席目から1時間以上あと)", genchi.prior], ["外れ (回数)", genchi.miss]].forEach((r) => {
        const tr = document.createElement("tr");
        r.forEach((c) => { const td = document.createElement("td"); td.textContent = String(c); tr.appendChild(td); });
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      body.appendChild(t);
    }
    if (!stories.length) {
      body.textContent = "まだ記録がありません。一席聞いて、前と後の気持ちに答えると貯まります。";
    } else {
      body.appendChild(table("噺", stories.map((r) => [r.title || r.key, r.n + " 回", fmt(r.avg)])));
      body.appendChild(table("どちらから", prefs.map((r) => [r.key, r.n + " 回", fmt(r.avg)])));
    }
    openPanel("ba");
  }

  // ---- 重ねて 出す パネル (場・全国の園)。★dialog の 役割 / 開いたら 中へ / Esc で 閉じる / 閉じたら 戻す
  //   (2026-11-15 見直し)。★Tab は パネルの 中を 回す (aria-modal)
  function openPanel(id) {
    const a = document.activeElement;
    if (!panelFrom && a && a !== document.body) panelFrom = a;
    $(id).hidden = false;
    focusTo($(id));
  }
  function closePanel(id) {
    if ($(id).hidden) return;
    $(id).hidden = true;
    const back = panelFrom;
    panelFrom = null;
    if (back && back.isConnected !== false) focusTo(back);
  }
  function panelKeys(id) {
    return (e) => {
      if (e.key === "Escape" || e.key === "Esc") {
        e.stopPropagation();
        return closePanel(id);
      }
      if (e.key !== "Tab") return;
      const p = $(id);
      if (typeof p.querySelectorAll !== "function") return;
      const f = Array.prototype.filter.call(p.querySelectorAll("button, a[href], input"),
        (x) => !x.disabled && !x.hidden && x.getClientRects().length > 0);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (e.shiftKey && (a === first || a === p)) { e.preventDefault(); focusTo(last); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); focusTo(first); }
    };
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
      ctx.fillText(state.kin ? kinName(state.kin) + "のお客さんへ"
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

      // ★写真の 出典 (2026-11-20)。★札は 端末の 外 (SNS など) へ 出るので、画面の 隅書き (1 行) より 長く
      //   作品名・提供元・ライセンス (URL)。★4.0 の 写真だけ「(一部を切り出して使用)」(2026-11-22。cardCredit)。★継承 (BY-SA) の 写真なら 札も BY-SA と 書く (Core.cardCredit)
      //   ★行が 増えたら 判子・問いの 結果・下の 文を その ぶん 上へ
      ctx.font = "20px " + sans;
      const credLines = wrapLines(ctx, (img ? Core.cardCredit(img.credit) + " / " : "") + "出典は「タネ明かし」", W - 120);
      const CLH = 26;
      const off = Math.max(0, credLines.length - 2) * CLH;

      ctx.font = "34px " + serif;
      ctx.fillStyle = "#4a4036";
      wrap(ctx, st.card.bottom, W / 2, Hh - 240 - Math.max(0, off - CLH), W - 160, 48);

      if (state.lastCorrect !== null) {
        // ★「× 外れ」だけだと 何の × か 分からない → 何の結果かを 添える
        ctx.textAlign = "left";
        ctx.font = "26px " + sans;
        ctx.fillStyle = "#6d6256";
        ctx.fillText("この噺の問い", 60, Hh - 148 - off);
        ctx.font = "38px " + sans;
        ctx.fillStyle = state.lastCorrect ? "#b8322a" : "#6d6256";
        ctx.fillText(state.lastCorrect ? "○ ご名答" : "× 惜しい", 60, Hh - 110 - off);
      }
      ctx.textAlign = "center";
      ctx.font = "20px " + sans;
      ctx.fillStyle = "#6d6256";
      credLines.forEach((l, i) => ctx.fillText(l, W / 2, Hh - 46 - (credLines.length - 1 - i) * CLH));

      ctx.fillStyle = "#b8322a";
      ctx.fillRect(W - 230, Hh - 172 - off, 160, 84);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 40px " + serif;
      ctx.fillText("はなし山", W - 150, Hh - 130 - off);
    };
    if (img && !img.el.complete) img.el.onload = paint;
    paint();
  }

  /** 札に 敷く 写真の 群 (つつじ / 紅葉)。★席の 頭で 決めて 先に 読む */
  function cardKey(st) {
    // ★2026-11-20 作者の判断: 札の 写真は オチの 註が 指す もの の 写真 (台本の cardImg = 群[@名])。
    //   ★札用の 群が 無ければ 今どおり 季節の 写真 (紅葉 / つつじ)
    const ci = String(st.cardImg || "").split("@")[0];
    const keys = (root.HANASHI_IMG_KEYS && root.HANASHI_IMG_KEYS.card) || {};
    if (ci && keys[ci]) return ci;
    const text = st.makura + " " + Core.hondaiText(st) + " " + st.sage;
    return /紅葉|もみじ|秋/.test(text) ? "koyo" : "tsutsuji";
  }
  /** 噺に合う写真を選ぶ。★もう一席で 同じ絵が 続かないよう、群の中から 散らす */
  const photoCache = {};
  const photoUsed = {};
  function pickPhoto(st) {
    const bank = root.HANASHI_IMG;
    if (!bank) return null;
    let key = (state.photo && state.photo.ck) || cardKey(st);
    if (!bank[key]) key = bank.tsutsuji ? "tsutsuji" : bank.koyo ? "koyo" : null;
    const g = key && bank[key];
    if (!g || !g.shots || !g.shots.length) return null;
    // ★名を 言う 子 (cardImg = panda@名) なら その子の 1 枚
    const nm = String(st.cardImg || "").split("@")[1];
    if (nm) {
      const j = g.shots.findIndex((s) => s.name === nm || (s.names || []).indexOf(nm) >= 0);
      if (j >= 0) {
        const id0 = key + ":" + j;
        if (!photoCache[id0]) {
          const el0 = new Image();
          el0.src = g.shots[j].dataUri;
          photoCache[id0] = { el: el0, credit: g.shots[j].credit || g.credit };
        }
        return photoCache[id0];
      }
    }
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
      photoCache[id] = { el, credit: g.shots[idx].credit || g.credit };
    }
    return photoCache[id];
  }

  /** 幅 maxW に 収まるよう 字で 折った 行の 配列 */
  function wrapLines(ctx, text, maxW) {
    const lines = [];
    let line = "";
    for (const ch of String(text || "")) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }
  function wrap(ctx, text, x, y, maxW, lh) {
    const lines = wrapLines(ctx, text, maxW);
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

  function exportLog() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(readLog())], { type: "application/json" }));
    a.download = "hanashiyama_log_" + Core.todayString() + ".json";
    a.click();
  }

  // ---- 入り口 -----------------------------------------------------------
  $("open").addEventListener("click", () => open());
  $("genchiBtn").addEventListener("click", (e) => { e.stopPropagation(); openGenchi(); });
  $("genchiAgain").addEventListener("click", genchiAgain);
  // ★「▼ 語りの続きへ」= 読み返しを やめて いちばん 新しい 行へ (2026-11-22)
  $("tsuzuki").addEventListener("click", (e) => {
    e.stopPropagation();
    setFollow(true);
    scroll();
  });
  $("koza").addEventListener("blur", () => {
    const k = $("koza");
    if (typeof k.removeAttribute === "function") k.removeAttribute("tabindex");
  });
  $("koza").addEventListener("click", (e) => {
    if (e.target.closest("button") || e.target.closest("a")) return;
    setFollow(true);                                       // ★画面の タップ = 先へ (見直し)
    if (!typing && state.pauseFn) return state.pauseFn();   // ★「次へ」で 止めている ときは 画面の タップでも 続ける
    hurry();
  });
  // ★足元の「早送り」は ★次の 問い (または サゲ) まで 飛ぶ (2026-09-25)。
  //   ★画面の タップは これまで通り 1 行ずつ。★飛ばしたい人と 読みたい人を 分ける。
  //   ★上限を 置くのは ★万一 止まらない ときに 固まらせないため。
  $("skip").addEventListener("click", (e) => {
    e.stopPropagation();
    setFollow(true);                                       // ★早送り = 先へ (見直し)
    //   ★2026-11-15 (見直し): 前は 打ちかけの 行を 打ち終えた ところで「進まなかった」と 見て 止まり、
    //     既定の「一字ずつ」では 1 回 1 行しか 進まなかった。★打ち終えたら もう一度 押して 次へ。
    const isStop = (t) => / toi | sage | kotae /.test(" " + ((t && t.el && t.el.className) || "") + " ");
    for (let i = 0; i < 120 && (typing || state.pauseFn); i += 1) {
      if (!typing && state.pauseFn) { state.pauseFn(); continue; }   // ★早送りは「次へ」を 越えて 進む
      const before = typing;
      const wasDone = before.done;
      hurry();
      if (typing === before) {
        if (wasDone || isStop(before)) break;          // ★進まなくなった / 問い・答え・サゲは 打ち終えて 止める
        continue;                                      // ★打ち終えただけ → 次の 周で 先へ
      }
      if (isStop(typing)) break;                       // ★問い・答え・サゲで 止める
    }
    if (!typing) scroll();
  });
  $("other").addEventListener("click", nextStory);
  $("again").addEventListener("click", nextStory);
  $("save").addEventListener("click", saveCard);
  $("sourcesBtn").addEventListener("click", () => {
    $("sources").hidden = !$("sources").hidden;
    $("sourcesBtn").setAttribute("aria-expanded", $("sources").hidden ? "false" : "true");
  });
  $("baBtn").addEventListener("click", showBa);
  $("closeBa").addEventListener("click", () => closePanel("ba"));
  $("ba").addEventListener("keydown", panelKeys("ba"));
  $("kin").addEventListener("keydown", panelKeys("kin"));
  $("exportLog").addEventListener("click", exportLog);
  $("clearLog").addEventListener("click", clearLog);
  $("kinList").addEventListener("click", (e) => { e.stopPropagation(); showKin(); });
  $("closeKin").addEventListener("click", () => closePanel("kin"));
  const typeLabel = () => { $("typeBtn").textContent = typeOn ? "文字: 一字ずつ" : "文字: 一度に"; };
  typeLabel();
  $("typeBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    typeOn = !typeOn;
    try { localStorage.setItem(TYPE_KEY, typeOn ? "1" : "0"); } catch (x) {}
    typeLabel();
    setFootH();
  });
  if (typeof root.addEventListener === "function") root.addEventListener("resize", setFootH);
  // ★「はじめから」は ★園の入口も 含めて まっさらに 戻す
  //   単に reload すると ?kin= が 残り、同じ園から 始まってしまう
  showBuilt();

  // ★鳴き声 (2026-09-25)。★手元の mp3 を data URI で 埋め込み = ★外部通信 0。
  //   ★自動では 鳴らさない。★押したときだけ。★ で 見送った 読み上げとは 別もの
  //   (見送りの 理由は「ネットワーク音声を 使う 場合が ある」こと。手元の 音は それに 当たらない)
  let koeEl = null;
  function showKoe(st) {
    const btn = $("koe");
    if (!btn) return;
    // ★手元に あるのは ★レッサーパンダの 声だけ。
    //   ★鳥・サルの 噺で 出すと「その生きものの 声」だと 思わせる (2026-09-26 指摘)。
    //   ★文面の 言い回しで 判ると 取り違える (「鳥のほうが多い」で 出てしまった) ので
    //   ★★参照している 事実で 判る。★レッサーパンダに 触れている 事実を 引いた席だけ。
    btn.hidden = !hasRP(st);
    // ★何の 鳴き声か 名前に 出す
    if (!btn.hidden) btn.textContent = "レッサーパンダの鳴き声を聞く";
  }
  $("koe").addEventListener("click", () => {
    if (!root.HANASHI_KOE) {                 // ★押されて はじめて 読む (279KB)
      $("koe").disabled = true;
      $("koe").textContent = "読み込んでいます…";
      return lazy("data/koe.js", () => {
        $("koe").textContent = "レッサーパンダの鳴き声を聞く";
        $("koe").disabled = false;
        $("koe").click();
      });
    }
    const bank = (root.HANASHI_KOE || {}).redpanda;
    if (!bank) return;
    if (!koeEl) {
      koeEl = document.createElement("audio");
      koeEl.src = bank.dataUri;
      koeEl.preload = "none";
    }
    koeEl.currentTime = 0;
    const pr = koeEl.play();
    if (pr && pr.catch) pr.catch(() => {});
    log("koe", state.current);
    const c = document.createElement("p");
    c.className = "line ato";
    c.textContent = bank.credit;
    put(c);
    scroll();
    $("koe").disabled = true;
    setTimeout(() => { $("koe").disabled = false; }, 1200);
  });

  $("restart").addEventListener("click", () => {
    // ★読み直しでも 入口へ 戻す。★そのままだと ブラウザが
    //   ★前に 見ていた 高さを 覚えていて、少し 下がった ところに 出る (2026-09-23)
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    autoScrollTo(0);
    setFollow(true);
    // ★2026-11-15 見直し: はじめから に したのに「また○○からで?」と 聞いた
    //   (再訪の ために この端末に 覚えていた 県が 残っていた)。★はじめから は 新しい お客さんとして 始める。
    //   ★Δq の 記録 (場の 表) は 消さない。★?date= は 残す (発表会の リハーサルで 命日が 出る ように。見直し)
    store.del(PREF_KEY);
    const base = location.href.split("?")[0].split("#")[0];
    let q = "";
    try {
      const d = new URLSearchParams(location.search).get("date");
      if (d) q = "?date=" + encodeURIComponent(d);
    } catch (e) {}
    if (location.href === base + q) location.reload();
    else location.href = base + q;
  });
})(typeof window !== "undefined" ? window : globalThis);
