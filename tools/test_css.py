# -*- coding: utf-8 -*-
"""はなし山: style.css の 動きの 決めごと (P1-4) の 歯止め。

決めごと (作業計画 (公開に含めない) §3)
  K1  @keyframes の 中で 動かす 性質は transform と opacity だけ
  K2  animation / transition の 時間は 0.15〜0.3 秒 (遅らせる delay も 0.3 秒まで)
      ★写真の「一拍の 間」(0.8 秒) は JS の タイマーで 作る。CSS の 動きに しない
  K3  infinite (無限の 繰り返し) を 使わない
  K4  filter (blur など) / backdrop-filter / box-shadow を 動かさない。
      ★backdrop-filter は 使うこと 自体を 止める (文字の 帯は 半透明の 単色で 作る)
  K5  transition で 動かす 性質も transform と opacity だけ (all も 不可 = 何が 動くか 読めない)
  K6  動きの ある 選択子は すべて @media (prefers-reduced-motion: reduce) の 中で 止まる
      (・`*` で 一括に 止めるなら !important が 要る。無いと 詳しい 選択子の 動きが 勝つ
       ・同じ 選択子で 止めるなら、動きより 後ろに 置くか !important
       ・@media (prefers-reduced-motion: no-preference) の 中の 動きは 初めから 止まっている)

やり方
  コメントを 消し (行は 保つ)、規則を 選択子・宣言・囲みの @ 規則 に ばらして 見る。
  ★先に 陰性テスト (わざと 壊した CSS を 止めるか) を 回し、そのあと app/style.css を 見る。
  ★陰性テストは「止まった」だけでなく ★その 規則 (K1〜K6) が 止めたことまで 見る。

限界
  - app.js が 直に 付ける 動き (element.animate / style.transition) は 見ない
  - 選択子の 詳しさ (specificity) は「`*` か、同じ 選択子か」の 2 通りしか 比べない

実行: python tools/test_css.py [別の style.css]   (陰性テストか style.css の どちらかが 落ちれば 終了コード 1)
  ★2026-11-21: 組版の 決めごと (L1〜L11) も 見る (check_layout)
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, "app", "style.css")

T_MIN, T_MAX = 0.15, 0.30
T_STOP = 0.01                    # ★これ 以下の 時間は「止めた」と 見る (0.01ms 型の 止め方)
ICHIBYO = 0.8                    # ★写真の 一拍の 間 (作者の判断 2026-11-15)。★JS の タイマーで 作る
MOVE_OK = ("transform", "opacity")
KF_META = ("animation-timing-function",)          # keyframes の 中で 書いてよい (性質を 動かさない)
NO_ANIM = ("filter", "-webkit-filter", "backdrop-filter", "-webkit-backdrop-filter", "box-shadow")
BACKDROP = ("backdrop-filter", "-webkit-backdrop-filter")
TIMING = {"ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-start", "step-end"}
ANIM_KW = TIMING | {"infinite", "normal", "reverse", "alternate", "alternate-reverse", "none",
                    "forwards", "backwards", "both", "running", "paused", "initial", "inherit", "unset"}
# ★減らす 設定でも 残してよい 動き = 写真の 出入りの フェード (opacity だけ)。2026-11-15 作者の判断
RED_FADE_OK = (".haikei", ".haikei-cap", ".haikei-in::after", ".haikei.kawari #haikeiImg")
FADE_KF = ("usu",)                # ★opacity だけを 動かす keyframes
T_FADE = 0.80                     # ★写真の フェードだけ 0.8 秒まで (2026-11-15 見直しの 声「もう少し 長く」)
# ★扇子 (場面の 区切り) だけの 例外 (2026-11-22 作者の判断「倍の ゆっくりに して 2 回」):
#   開いて 閉じる 1 回 = 1.2 秒まで (開く 0.6 + 閉じる 0.6)・繰り返しは 2 回まで・動かすのは transform だけ (K1 は そのまま)。
#   ★動きを 減らす 設定では 止める (K6 は そのまま)。★ほかの 選択子・ほかの keyframes には 効かない
SENSU_OK = (".sensu .hane",)
SENSU_KF = ("hirakutoji",)
T_SENSU = 1.20
N_SENSU = 2
RE_RED = re.compile(r"prefers-reduced-motion\s*:\s*reduce", re.I)
RE_NOPREF = re.compile(r"prefers-reduced-motion\s*:\s*no-preference", re.I)
RE_KF = re.compile(r"^@(-webkit-)?keyframes\b", re.I)
_TIME = re.compile(r"(?<![\w.#-])((?:\d+\.?\d*|\.\d+))(ms|s)(?![\w-])", re.I)


def strip_comments(t):
    """コメントを 空白に (★行と 位置は 保つ)"""
    return re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), t, flags=re.S)


def split_top(s, sep):
    """括弧の 外の sep で 割る (cubic-bezier(0.2, 0, 0, 1) の , で 割らない)"""
    out, depth, cur = [], 0, []
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == sep and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur))
    return [x.strip() for x in out if x.strip()]


def times(v):
    return [float(a) / (1000.0 if u.lower() == "ms" else 1.0) for a, u in _TIME.findall(v)]


def words(item):
    """関数 (cubic-bezier(...) / steps(...)) と 時間を 除いた 語"""
    item = re.sub(r"[\w-]+\([^)]*\)", " ", item)
    return [w for w in item.split() if not _TIME.fullmatch(w)]


class Rule(object):
    def __init__(self, sels, decls, ctx, line):
        self.sels, self.decls, self.ctx, self.line = sels, decls, ctx, line


def parse(text):
    """→ [Rule]。decls = [(性質, 値, important, 行)]。ctx = 囲みの @ 規則の 頭 (外から 順に)"""
    t = strip_comments(text)
    n = len(t)
    rules = []

    def line_at(i):
        return t.count("\n", 0, i) + 1

    def skip_str(i):
        q = t[i]
        i += 1
        while i < n and t[i] != q:
            if t[i] == "\\":
                i += 1
            i += 1
        return i + 1

    def match_close(i):
        depth = 1
        while i < n:
            c = t[i]
            if c in "\"'":
                i = skip_str(i)
                continue
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return i
            i += 1
        return n

    def decls(start, end):
        out, seg, i, depth = [], start, start, 0
        while i < end:
            c = t[i]
            if c in "\"'":
                i = skip_str(i)
                continue
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
            elif c == ";" and depth == 0:
                out.append((seg, i))
                seg = i + 1
            i += 1
        out.append((seg, end))
        res = []
        for a, z in out:
            s = t[a:z]
            if ":" not in s:
                continue
            p, v = s.split(":", 1)
            if not p.strip():
                continue
            off = a + len(s) - len(s.lstrip())
            imp = bool(re.search(r"!\s*important\s*$", v, re.I))
            v = re.sub(r"!\s*important\s*$", "", v, flags=re.I).strip()
            res.append((p.strip().lower(), v, imp, line_at(off)))
        return res

    def block(i, end, ctx):
        seg = i
        while i < end:
            c = t[i]
            if c in "\"'":
                i = skip_str(i)
                continue
            if c in ";}":
                seg = i + 1
            elif c == "{":
                close = match_close(i + 1)
                pre = t[seg:i]
                off = seg + len(pre) - len(pre.lstrip())
                pre = " ".join(pre.split())
                if pre.startswith("@"):
                    block(i + 1, close, ctx + [pre])
                else:
                    sels = [" ".join(s.split()) for s in split_top(pre, ",")]
                    rules.append(Rule(sels, decls(i + 1, close), ctx, line_at(off)))
                i = close + 1
                seg = i
                continue
            i += 1

    block(0, n, [])
    return rules


def check(text):
    """→ (errors [(規則, 行, 文)], 数えたもの {keyframes, animation, transition})"""
    errs, seen = [], {"keyframes": set(), "animation": 0, "transition": 0}
    movers, stops = [], []          # movers = (選択子, 種類, 行, important) / stops = (選択子, 種類, important, 行)

    def err(code, line, msg):
        errs.append((code, line, msg))

    cur = {"fade": False, "sensu": False}   # ★いま 見ている 宣言が 写真の フェード / 扇子 (決めた 選択子・決めた keyframes) か

    def time_check(where, ln, ts, what):
        for k, x in enumerate(ts):
            if k == 0 and cur["fade"] and T_MIN - 1e-9 <= x <= T_FADE + 1e-9:
                continue
            if k == 0 and cur["sensu"] and T_MIN - 1e-9 <= x <= T_SENSU + 1e-9:
                continue
            if k == 0 and not (T_MIN - 1e-9 <= x <= T_MAX + 1e-9):
                m = "%s の %s が %g 秒 (%.2f〜%.2f 秒)" % (where, what, x, T_MIN, T_MAX)
                if abs(x - ICHIBYO) < 1e-9:
                    m += " ★0.8 秒の「一拍の 間」は JS の タイマーで 作る 決まり (CSS の 動きに しない)"
                err("K2", ln, m)
            if k == 1 and x > T_MAX + 1e-9:
                err("K2", ln, "%s の %s の 遅らせ (delay) が %g 秒 (%.2f 秒まで。文字を 待たせない)" % (where, what, x, T_MAX))

    for r in rules_of(text):
        kf = next((p for p in r.ctx if RE_KF.match(p)), None)
        red = any(RE_RED.search(p) for p in r.ctx)
        nopref = any(RE_NOPREF.search(p) for p in r.ctx)
        sel_s = ", ".join(r.sels)
        for p, v, imp, ln in r.decls:
            vl = v.lower().strip()
            if p in BACKDROP:
                err("K4", ln, "%s で %s を 使っている (文字の 帯は 半透明の 単色で 作る。ぼかし なし)" % (sel_s, p))
            if kf:
                seen["keyframes"].add(kf)
                if p in KF_META:
                    continue
                if p in NO_ANIM:
                    if p not in BACKDROP:
                        err("K4", ln, "%s で %s を 動かしている (ぼかし・影は 動かさない)" % (kf, p))
                elif p not in MOVE_OK:
                    err("K1", ln, "%s で %s を 動かしている (transform / opacity だけ)" % (kf, p))
                continue

            kind, moving, stopping = None, False, False
            fade_only = False             # ★opacity だけの フェードか (減らす 設定の 例外に 使う)
            cur["fade"] = False
            cur["sensu"] = False
            if p == "animation":
                fade_only = vl != "none" and all(
                    any(w.lower() in FADE_KF for w in words(item)) for item in split_top(v, ","))
                cur["fade"] = fade_only and all(s in RED_FADE_OK for s in r.sels)
                cur["sensu"] = vl != "none" and all(s in SENSU_OK for s in r.sels) and all(
                    any(w.lower() in SENSU_KF for w in words(item)) for item in split_top(v, ","))
                if cur["sensu"]:
                    for item in split_top(v, ","):
                        nums = [w for w in words(item) if re.fullmatch(r"\d+(\.\d+)?", w)]
                        if nums and float(nums[0]) > N_SENSU:
                            err("K3", ln, "%s の 扇子の 繰り返しが %s 回 (%d 回まで)" % (sel_s, nums[0], N_SENSU))
                kind = "animation"
                seen["animation"] += 1
                if vl == "none":
                    stopping = True
                else:
                    for item in split_top(v, ","):
                        ws = [w.lower() for w in words(item)]
                        if "none" in ws and not times(item):
                            stopping = True
                            continue
                        moving = True
                        if "infinite" in ws:
                            err("K3", ln, "%s の animation が infinite (無限の 繰り返しは 使わない)" % sel_s)
                        ts = times(item)
                        if not ts:
                            err("K2", ln, "%s の animation に 時間が 書いていない (0.15〜0.3 秒を 書く)" % sel_s)
                        elif ts[0] <= T_STOP:
                            stopping, moving = True, False
                        else:
                            time_check(sel_s, ln, ts, "animation")
            elif p == "animation-name":
                kind = "animation"
                seen["animation"] += 1
                if vl == "none":
                    stopping = True
                else:
                    moving = True
            elif p in ("animation-duration", "transition-duration"):
                kind = p.split("-")[0]
                ts = times(v)
                if ts and max(ts) <= T_STOP:
                    stopping = True
                else:
                    for x in ts:
                        time_check(sel_s, ln, [x], p)
            elif p in ("animation-delay", "transition-delay"):
                for x in times(v):
                    if x > T_MAX + 1e-9:
                        err("K2", ln, "%s の %s が %g 秒 (%.2f 秒まで。文字を 待たせない)" % (sel_s, p, x, T_MAX))
            elif p == "animation-iteration-count":
                if "infinite" in vl:
                    err("K3", ln, "%s の animation-iteration-count が infinite (無限の 繰り返しは 使わない)" % sel_s)
            elif p == "transition":
                kind = "transition"
                seen["transition"] += 1
                fade_only = vl != "none" and all(
                    ([w.lower() for w in words(item) if w.lower() not in ANIM_KW] or ["all"])[0] == "opacity"
                    for item in split_top(v, ","))
                cur["fade"] = fade_only and all(s in RED_FADE_OK for s in r.sels)
                if vl == "none":
                    stopping = True
                else:
                    for item in split_top(v, ","):
                        ws = [w.lower() for w in words(item) if w.lower() not in ANIM_KW]
                        prop = ws[0] if ws else "all"
                        ts = times(item)
                        if prop == "none":
                            stopping = True
                            continue
                        if ts and ts[0] <= T_STOP:
                            stopping = True
                            continue
                        moving = True
                        if prop in NO_ANIM:
                            err("K4", ln, "%s の transition で %s を 動かしている (ぼかし・影は 動かさない)" % (sel_s, prop))
                        elif prop not in MOVE_OK:
                            err("K5", ln, "%s の transition で %s を 動かしている (transform / opacity だけ。all も 不可)" % (sel_s, prop))
                        if not ts:
                            err("K2", ln, "%s の transition に 時間が 書いていない (0.15〜0.3 秒を 書く)" % sel_s)
                        else:
                            time_check(sel_s, ln, ts, "transition")
            elif p == "transition-property":
                kind = "transition"
                seen["transition"] += 1
                if vl == "none":
                    stopping = True
                else:
                    moving = True
                    for prop in [x.strip().lower() for x in v.split(",")]:
                        if prop in NO_ANIM:
                            err("K4", ln, "%s の transition で %s を 動かしている (ぼかし・影は 動かさない)" % (sel_s, prop))
                        elif prop not in MOVE_OK:
                            err("K5", ln, "%s の transition で %s を 動かしている (transform / opacity だけ。all も 不可)" % (sel_s, prop))
            if not kind:
                continue
            for s in r.sels:
                if moving and red:
                    if s in RED_FADE_OK and fade_only:
                        continue          # ★写真の フェード (opacity だけ) は 減らす 設定でも 残す
                    err("K6", ln, "%s の %s が 動きを 減らす 設定の 中で 動いている (止める)" % (s, kind))
                elif moving and not nopref:
                    movers.append((s, kind, ln, imp))
                if stopping and red:
                    stops.append((s, kind, imp, ln))

    done = set()
    for s, kind, ln, mimp in movers:
        if (s, kind, ln) in done:
            continue
        done.add((s, kind, ln))
        pe = re.search(r"::?(before|after|first-line|first-letter|marker|placeholder)\b", s)
        blanket = {"*::" + pe.group(1), "*:" + pe.group(1)} if pe else {"*"}
        ok, hint = False, ""
        for ss, sk, simp, sln in stops:
            if sk != kind:
                continue
            if ss in blanket:
                if simp and not mimp:
                    ok = True
                    break
                hint = " (★`*` で 止めるときは !important が 要る。無いと 詳しい 選択子の 動きが 勝つ)"
            elif ss == s:
                if (simp or sln > ln) and (simp or not mimp):
                    ok = True
                    break
                hint = " (★止める 規則が 動きより 前に あり、後ろの 動きが 勝つ。!important か 後ろに 置く)"
        if not ok:
            err("K6", ln, "%s の %s が 動きを 減らす 設定 (prefers-reduced-motion: reduce) で 止まらない%s" % (s, kind, hint))
    seen["keyframes"] = len(seen["keyframes"])
    return sorted(errs, key=lambda e: (e[1], e[0])), seen


def rules_of(text):
    return parse(text)


# ============================ 陰性テスト ============================
CLEAN = """
.a { animation: rise 0.25s ease; }
.b { transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0, 0, 1); }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
"""
SPECIFIC = """
.a { animation: rise 0.25s ease; }
.b { transition: opacity 0.2s ease; }
@keyframes rise { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .a { animation: none; }
  .b { transition: none; }
}
"""
SELF = [
    # (名前, CSS, 止めるはずの 規則 / None = 通るのが 正しい)
    ("決めごとどおりの CSS は 通る", CLEAN, None),
    ("同じ 選択子で 後ろから 止めても 通る", SPECIFIC, None),
    ("no-preference の 中の 動きは 止めなくても 通る",
     "@keyframes rise { to { opacity: 1; } }\n"
     "@media (prefers-reduced-motion: no-preference) { .a { animation: rise 0.2s; } }", None),
    ("コメントの 中の 動きは 見ない", CLEAN + "/* .z { animation: rise 2s infinite; } */", None),
    ("0.5 秒の 動き", CLEAN + ".z { animation: rise 0.5s ease; }", "K2"),
    ("0.1 秒の 動き (短すぎ)", CLEAN + ".z { transition: opacity 100ms; }", "K2"),
    ("0.8 秒の transition (一拍の 間を CSS で 作った)", CLEAN + ".z { transition: opacity 0.8s; }", "K2"),
    ("遅らせ 0.5 秒", CLEAN + ".z { animation: rise 0.2s ease 0.5s; }", "K2"),
    ("width を 動かす keyframes", CLEAN + "@keyframes grow { from { width: 0; } to { width: 100%; } }", "K1"),
    ("infinite", CLEAN + ".z { animation: rise 0.2s ease infinite; }", "K3"),
    ("animation-iteration-count: infinite", CLEAN + ".z { animation: rise 0.2s; animation-iteration-count: infinite; }", "K3"),
    ("box-shadow を 動かす keyframes", CLEAN + "@keyframes glow { to { box-shadow: 0 0 8px red; } }", "K4"),
    ("blur を 動かす keyframes", CLEAN + "@keyframes soft { to { filter: blur(4px); } }", "K4"),
    ("backdrop-filter を 使う", CLEAN + ".z { backdrop-filter: blur(6px); }", "K4"),
    ("box-shadow の transition", CLEAN + ".z { transition: box-shadow 0.2s; }", "K4"),
    ("width の transition", CLEAN + ".z { transition: width 0.2s; }", "K5"),
    ("all の transition", CLEAN + ".z { transition: all 0.2s; }", "K5"),
    ("減らす 設定で 止まらない 動き", SPECIFIC + ".z { animation: rise 0.2s; }", "K6"),
    ("`*` で 止めたが !important が 無い",
     ".a { animation: rise 0.2s; }\n@keyframes rise { to { opacity: 1; } }\n"
     "@media (prefers-reduced-motion: reduce) { * { animation: none; } }", "K6"),
    ("止める 規則が 動きより 前に ある",
     "@media (prefers-reduced-motion: reduce) { .a { animation: none; } }\n"
     ".a { animation: rise 0.2s; }\n@keyframes rise { to { opacity: 1; } }", "K6"),
    ("減らす 設定の 中で 動かす",
     CLEAN + "@media (prefers-reduced-motion: reduce) { .z { animation: rise 0.2s !important; } }", "K6"),
    ("減らす 設定でも 写真の フェード (opacity) は 残せる",
     CLEAN + "@media (prefers-reduced-motion: reduce) { .haikei { transition: opacity 0.3s ease !important; } }", None),
    ("写真の 層でも 減らす 設定で transform を 動かすのは 止める",
     CLEAN + "@media (prefers-reduced-motion: reduce) { .haikei { transition: transform 0.3s ease !important; } }", "K6"),
    ("写真の フェードは 0.8 秒まで 長くできる", CLEAN + ".haikei { transition: opacity 0.8s ease; }", None),
    ("写真の フェードでも 1.2 秒は 長すぎ", CLEAN + ".haikei { transition: opacity 1.2s ease; }", "K2"),
    ("写真の 層でも transform の 0.8 秒は 止める", CLEAN + ".haikei { transition: transform 0.8s ease; }", "K2"),
    ("扇子は 1.2 秒 × 2 回まで 動かせる", CLEAN + "@keyframes hirakutoji { to { transform: rotate(10deg); } }\n.sensu .hane { animation: hirakutoji 1.2s 2; }", None),
    ("扇子でも 1.6 秒は 長すぎ", CLEAN + ".sensu .hane { animation: hirakutoji 1.6s 2; }", "K2"),
    ("扇子でも 3 回は 多すぎ", CLEAN + ".sensu .hane { animation: hirakutoji 1.2s 3; }", "K3"),
    ("扇子 以外の 選択子の 1.2 秒は 止める", CLEAN + ".z { animation: hirakutoji 1.2s 2; }", "K2"),
    ("扇子でも 別の keyframes の 1.2 秒は 止める", CLEAN + ".sensu .hane { animation: rise 1.2s; }", "K2"),
    ("写真 以外の 選択子の フェードは 減らす 設定で 止める",
     CLEAN + "@media (prefers-reduced-motion: reduce) { .z { transition: opacity 0.3s ease !important; } }", "K6"),
]


def self_test(real_text):
    fail = []

    def report(name, ok, got):
        print(("  OK   " if ok else "  NG   ") + name)
        if not ok:
            fail.append(name)
            for e in got[:3]:
                print("       [%s] %d 行: %s" % e)

    for name, css, want in SELF:
        got, _ = check(css)
        if want is None:
            report(name, not got, got)
        else:
            report(name + " を 止める (" + want + ")", any(e[0] == want for e in got), got)

    # ★本物の style.css の 写しに 足す。★足した 行で その 規則が 止めたことを 見る
    #   (★本物に もとから ある 違反で「止まった」ことに しない)
    base_n = real_text.count("\n") + 1
    red_off = re.sub(r"prefers-reduced-motion\s*:\s*reduce", "min-width: 99999px", real_text)
    for name, css, want in [
        ("0.5 秒の 動き", real_text + "\n.zz { animation: rise 0.5s ease; }\n", "K2"),
        ("width を 動かす keyframes", real_text + "\n@keyframes zz { from { width: 0; } to { width: 10px; } }\n", "K1"),
        ("infinite", real_text + "\n.zz { animation: rise 0.2s ease infinite; }\n", "K3"),
        ("減らす 設定を 外した 写しに 足した 動き", red_off + "\n.zz { animation: rise 0.2s ease; }\n", "K6"),
    ]:
        got, _ = check(css)
        new = [e for e in got if e[1] > base_n]
        report("style.css の 写しに 足した " + name + " を 止める (" + want + ")",
               any(e[0] == want for e in new), new or got)
    return fail


# ---- 組版の 決めごと (2026-11-21 作者の判断。見直し r7 の 4・7・8・12・13 と 案B・文節の 改行) ----------------
#   L1  外れの 返し (.kotae.hazure) と 正解の 1 行 (.seikai) は 同じ 大きさ・同じ 金の 罫で つなぐ (間の 余白 0)。
#       ★外れの 返しは 赤茶・正解は 墨の 太字。★正解の 行は 動かさない (animation: none)
#   L2  サゲが いちばん 大きい (PC・スマホ とも。返し・まくら・振り・問い・台詞・正解・地の文より 大きい)
#   L3  本文の 行 (地・台詞・推量・追い足し・噂) は 16px (1rem) 未満に しない (PC・スマホ とも)
#   L4  文節で 改行: .talk .line に word-break: auto-phrase / 効かない ブラウザ用に @supports not (…) の 中で keep-all。
#       ★index.html の html に lang="ja" (auto-phrase は 言語で 効く)
#   L5  強弱の 直し (返し (当たり) は 墨・左の 空き・推量の 塗りは 元の #efeadc・スマホの 見出し 1rem・めくり 太字)
#   L6  あて推量の ラベルは 箱の 外に 1 回だけ / L7 めくりと 段の 札は 折らない / L8 キーとなる 単語は 太字だけ / L9 推量の ポイントは 太字だけ / L10 名前の まとまりは 折らない / L11 扇子は 倍の ゆっくり × 2 回
#   ★python tools/test_css.py 古い.css で 直す 前の style.css を 見る (★L1〜L4 が NG に なる ことで 効きを 見る)
HTML = os.path.join(ROOT, "app", "index.html")
MOBILE = "@media (max-width: 480px)"
FS_KEYS = [  # (選択子, 名前)。★後ろの 規則ほど 効く (同じ 名前は 最後の 値)
    (".line", "base"), (".line.sage", "sage"), (".line.kotae", "kotae"), (".talk .line.kotae.hazure", "hazure"),
    (".talk .line.seikai", "seikai"), (".line.makura", "makura"), (".line.furi", "furi"), (".line.toi", "toi"),
    (".line.serifu", "serifu"), (".line.suiryo", "suiryo"), (".line.ato", "ato"), (".line.uwasa", "uwasa"),
]


def rem(v):
    m = re.match(r"^\s*([\d.]+)rem\s*$", v or "")
    return float(m.group(1)) if m else None


def font_sizes(rules):
    """→ {"pc": {名前: rem}, "sp": {...}}。★スマホは PC の 値に メディアの 中の 値を 重ねる"""
    pc, sp = {}, {}
    for r in rules:
        media = r.ctx[-1] if r.ctx else ""
        if r.ctx and not (len(r.ctx) == 1 and media == MOBILE):
            continue
        for sel in r.sels:
            for key, name in FS_KEYS:
                if sel == key:
                    for p, v, imp, ln in r.decls:
                        if p == "font-size" and rem(v) is not None:
                            (sp if media == MOBILE else pc)[name] = rem(v)
    full_sp = dict(pc)
    full_sp.update(sp)
    return {"pc": pc, "sp": full_sp}


def decl(rules, sel, prop, media=None):
    """その 選択子の 最後の 宣言の 値 (無ければ None)。media=None は 囲みの 無い 規則だけ"""
    got = None
    for r in rules:
        if (media is None and r.ctx) or (media is not None and (not r.ctx or r.ctx[-1] != media)):
            continue
        if sel in r.sels:
            for p, v, imp, ln in r.decls:
                if p == prop:
                    got = v
    return got


def check_layout(text, html_text):
    """→ [(規則, 文)]"""
    errs = []
    rules = parse(text)
    H, S = ".talk .line.kotae.hazure", ".talk .line.seikai"
    if decl(rules, H, "font-size") is None or decl(rules, S, "font-size") is None:
        errs.append(("L1", "外れの 返し (%s) と 正解の 1 行 (%s) の 規則が 無い" % (H, S)))
    else:
        if decl(rules, H, "font-size") != decl(rules, S, "font-size"):
            errs.append(("L1", "外れの 返しと 正解の 大きさが 違う (%s / %s)" % (decl(rules, H, "font-size"), decl(rules, S, "font-size"))))
        bh, bs = decl(rules, H, "border-left"), decl(rules, S, "border-left")
        if not bh or bh != bs or "gold" not in bh:
            errs.append(("L1", "返しと 正解を 同じ 金の 罫で つないでいない (%s / %s)" % (bh, bs)))
        if (decl(rules, H, "margin-bottom") or "").strip() != "0" or (decl(rules, S, "margin-top") or "").strip() != "0":
            errs.append(("L1", "返しと 正解の 間に 余白が ある (margin-bottom / margin-top を 0 に)"))
        if (decl(rules, H, "color") or "").lower() != "#7b2b25":
            errs.append(("L1", "外れの 返しが 赤茶 (#7b2b25) で ない (%s)" % decl(rules, H, "color")))
        if decl(rules, S, "color") != "var(--ink)" or decl(rules, S, "font-weight") != "bold":
            errs.append(("L1", "正解が 墨の 太字で ない"))
        if (decl(rules, S, "animation") or "") != "none":
            errs.append(("L1", "正解の 行 (新しい 罫) が 動く (animation: none に)"))
        mh = [r for r in rules if r.ctx and r.ctx[-1] == MOBILE and H in r.sels and S in r.sels
              and any(p == "font-size" for p, v, i, l in r.decls)]
        if not mh:
            errs.append(("L1", "スマホで 返しと 正解を 同じ 大きさに する 規則が 無い"))
    fs = font_sizes(rules)
    for w in ("pc", "sp"):
        f = fs[w]
        if "sage" not in f:
            errs.append(("L2", "%s: サゲの 大きさが 読めない" % w))
            continue
        for k in ("kotae", "hazure", "seikai", "makura", "furi", "toi", "serifu", "base"):
            if k in f and not f[k] < f["sage"]:
                errs.append(("L2", "%s: %s (%grem) が サゲ (%grem) より 小さく ない" % (w, k, f[k], f["sage"])))
        for k in ("base", "serifu", "suiryo", "ato", "uwasa"):
            if k in f and f[k] < 1.0:
                errs.append(("L3", "%s: 本文の %s が %grem (16px 未満)" % (w, k, f[k])))
    wb = [r for r in rules if not r.ctx and ".talk .line" in r.sels
          and any(p == "word-break" and v == "auto-phrase" for p, v, i, l in r.decls)]
    if not wb:
        errs.append(("L4", ".talk .line に word-break: auto-phrase が 無い"))
    ka = [r for r in rules if r.ctx and re.match(r"@supports\s+not\s*\(\s*word-break\s*:\s*auto-phrase\s*\)", r.ctx[-1])
          and ".talk .line" in r.sels and any(p == "word-break" and v == "keep-all" for p, v, i, l in r.decls)]
    if not ka:
        errs.append(("L4", "auto-phrase が 効かない ブラウザ用の keep-all (@supports not (word-break: auto-phrase)) が 無い"))
    if not re.search(r'<html[^>]*\slang="ja"', html_text):
        errs.append(("L4", 'index.html の html に lang="ja" が 無い (auto-phrase が 効かない)'))
    # L5 強弱の 直し (見直し r7 の 4・7・8・12・13): 返し (当たり) は 墨 / 左の 空きを 戻す / 推量は 紙色 / 見出し・めくり
    want5 = [
        (".line.kotae", "color", None, lambda v: v == "var(--ink)", "返し (当たり) が 墨で ない"),
        (".talk .line.sage", "padding", None, lambda v: (v or "").split()[-1:] == ["16px"], "サゲの 左の 空きが 16px で ない"),
        (".talk .line.sage", "padding-left", MOBILE, lambda v: v == "12px", "スマホの サゲの 左の 空きが 12px で ない"),
        (".talk .line.kotae", "padding", None, lambda v: (v or "").split()[-1:] == ["14px"], "返しの 左の 空きが 14px で ない"),
        (".talk .line.ato", "padding-left", None, lambda v: v == "30px", "追い足しの 下げ (30px) が 無い"),
        (".talk .line.uwasa", "padding-left", None, lambda v: v == "20px", "噂の 左の 空き (20px) が 無い"),
        (".line.suiryo", "background", None, lambda v: (v or "").lower() == "#efeadc", "あて推量の 塗りが 元の #efeadc で ない"),
        (".midashi", "font-size", MOBILE, lambda v: (rem(v) or 0) >= 1.0, "スマホの 見出しが 1rem 未満"),
        (".mekuri", "font-weight", None, lambda v: v == "bold", "めくり (題) が 太字で ない"),
    ]
    for sel, prop, media, good, msg in want5:
        v = decl(rules, sel, prop, media)
        if not good(v):
            errs.append(("L5", "%s (%s %s = %s)" % (msg, sel, prop, v)))
    # L6 あて推量の ラベルは 箱の 外に 1 回だけ (破線の 上の 縁に かかる 見出し)。★読める 大きさ (0.8rem 以上)・紙の 地
    labels = [r for r in rules if any(p == "content" and "あて推量" in v for p, v, i, l in r.decls)]
    if len(labels) != 1:
        errs.append(("L6", "「あて推量」の ラベルの 規則が %d 個 (1 個だけ)" % len(labels)))
    pos6 = decl(rules, ".line.suiryo::before", "position")
    tr6 = decl(rules, ".line.suiryo::before", "transform") or ""
    top6 = decl(rules, ".line.suiryo::before", "top") or ""
    if pos6 != "absolute" or not ("translateY(-" in tr6 or top6.startswith("-")):
        errs.append(("L6", "あて推量の ラベルが 箱の 中に ある (position: absolute で 上の 縁の 外へ。position=%s transform=%s top=%s)" % (pos6, tr6, top6)))
    if (rem(decl(rules, ".line.suiryo::before", "font-size")) or 0) < 0.8:
        errs.append(("L6", "あて推量の ラベルが 0.8rem 未満"))
    bg6 = decl(rules, ".line.suiryo::before", "background") or ""
    if not ("var(--paper)" in bg6 and "#efeadc" in bg6.lower()):
        errs.append(("L6", "あて推量の ラベルの 地が 外 (紙) と 中 (#efeadc) の 両方に 合っていない (%s)" % bg6))
    if decl(rules, ".talk .line.suiryo", "position") != "relative":
        errs.append(("L6", "あて推量の 箱が ラベルの 基準 (position: relative) に なっていない"))
    # L7 めくり (題) と 段の 札は 折らない (white-space: nowrap)。並ばない ときは 段の 札ごと 下の 行へ (flex-wrap)。
    #     ★スマホの めくりは 題の 字数 (data-n) で 小さく するが 0.95rem 未満に しない
    for sel in (".mekuri", ".shinko li"):
        if not any(sel in r.sels and any(p == "white-space" and v == "nowrap" for p, v, i, l in r.decls) for r in rules if not r.ctx):
            errs.append(("L7", "%s が white-space: nowrap で ない (語の 途中で 折れる)" % sel))
    if decl(rules, ".kozatop", "flex-wrap") != "wrap":
        errs.append(("L7", ".kozatop が flex-wrap: wrap で ない (並ばない ときに 札が 縮んで 折れる)"))
    tiers = [(r, v) for r in rules if r.ctx and r.ctx[-1] == MOBILE for s_ in r.sels if s_.startswith('.mekuri[data-n=')
             for p, v, i, l in r.decls if p == "font-size"]
    if not tiers:
        errs.append(("L7", "スマホの めくりを 題の 字数で 小さく する 規則 (.mekuri[data-n=…]) が 無い"))
    elif min(rem(v) or 0 for r, v in tiers) < 0.95:
        errs.append(("L7", "スマホの めくりが 0.95rem 未満に なる"))
    # L8 キーとなる 単語 (サゲが 受け返す 語句) は 太字だけ (色・大きさは 変えない)
    if decl(rules, ".line .key", "font-weight") != "bold" or decl(rules, ".line .key", "color") != "inherit":
        errs.append(("L8", ".line .key が 太字だけ (色は 行の まま) に なっていない"))
    # L9 あて推量の ポイント (「ではないか / のでは」の 直前の 句) は 太字だけ (推量の 箱の 中)
    if decl(rules, ".line.suiryo .point", "font-weight") != "bold" or decl(rules, ".line.suiryo .point", "color") != "inherit":
        errs.append(("L9", ".line.suiryo .point が 太字だけ (色は 行の まま) に なっていない"))
    # L10 名前の まとまり (<span class="nb">) は 折らない (white-space: nowrap)。★Safari の keep-all + <wbr> でも auto-phrase でも 効く
    if decl(rules, ".nb", "white-space") != "nowrap":
        errs.append(("L10", ".nb が white-space: nowrap で ない (「道の駅」が「道の」で 折れる)"))
    # L11 扇子は 開く 0.6 秒・閉じる 0.6 秒 (前の 倍) を 2 回 (2026-11-22 作者の判断)。★動きを 減らす 設定で 止まるのは K6 が 見る
    an11 = decl(rules, ".sensu .hane", "animation") or ""
    ws11 = an11.split()
    t11 = times(an11)
    kf11 = [r for r in rules if r.ctx and RE_KF.match(r.ctx[-1]) and "hirakutoji" in r.ctx[-1]]
    if not (ws11[:1] == ["hirakutoji"] and t11[:1] == [T_SENSU] and "2" in ws11):
        errs.append(("L11", "扇子が 開いて 閉じる 1.2 秒 (開く 0.6 + 閉じる 0.6) を 2 回 で ない (%s)" % an11))
    elif not any("50%" in r.sels for r in kf11):
        errs.append(("L11", "扇子の keyframes に 開ききる 50% が 無い (開く と 閉じる を 半分ずつ)"))
    return errs


def json_short(d):
    return " ".join("%s %g" % (k, d[k]) for k in sorted(d))


def layout_main(real, path):
    html_text = io.open(HTML, encoding="utf-8").read()
    fail = []
    print("組版の 決めごと (L1〜L11) — 陰性テスト")
    for name, css, want in [
        ("正解の 1 行の 規則を 消した 写し", re.sub(r"\.talk \.line\.seikai \{[^}]*\}", "", real, count=1), "L1"),
        ("スマホの サゲを 1rem に した 写し", real + "\n@media (max-width: 480px) { .line.sage { font-size: 1rem; } }\n", "L2"),
        ("追い足しを 0.9rem に した 写し", real + "\n.line.ato { font-size: 0.9rem; }\n", "L3"),
        ("keep-all を 消した 写し", real.replace("word-break: keep-all", "word-break: normal"), "L4"),
        ("推量の 塗りを 紙色に した 写し", real + "\n.line.suiryo { background: var(--paper); }\n", "L5"),
        ("推量の ラベルを 箱の 中に 戻した 写し", real + "\n.line.suiryo::before { position: static; transform: none; }\n", "L6"),
        ("めくりの nowrap を 消した 写し", real.replace(".mekuri, .shinko, .shinko li { white-space: nowrap; }", ""), "L7"),
        ("キーの 太字を 消した 写し", real.replace(".line .key { font-weight: bold;", ".line .key { font-weight: normal;"), "L8"),
        ("推量の ポイントの 太字を 消した 写し", real.replace(".line.suiryo .point { font-weight: bold;", ".line.suiryo .point { font-weight: normal;"), "L9"),
        ("名前の 包みの nowrap を 消した 写し", real.replace(".nb { white-space: nowrap; }", ".nb { }"), "L10"),
        ("扇子を 1 回に 戻した 写し", real.replace("animation: hirakutoji 1.2s 2;", "animation: hirakutoji 1.2s;"), "L11"),
    ]:
        got = check_layout(css, html_text)
        okk = any(e[0] == want for e in got)
        print(("  OK   " if okk else "  NG   ") + name + " を 止める (" + want + ")")
        if not okk:
            fail.append(name)
    errs = check_layout(real, html_text)
    fs = font_sizes(parse(real))
    print("%s: 大きさ (rem) PC %s / スマホ %s" % (os.path.basename(path), json_short(fs["pc"]), json_short(fs["sp"])))
    if errs:
        print("NG: 組版 %d 件" % len(errs))
        for code, msg in errs:
            print("  ✕ [%s] %s" % (code, msg))
    else:
        print("OK: 組版の 決めごと (L1〜L11) に 合っています")
    return fail, errs



def main():
    path = sys.argv[1] if len(sys.argv) > 1 else CSS          # ★別の style.css (直す 前の 版) を 見る
    real = io.open(path, encoding="utf-8").read()
    print("陰性テスト (わざと 壊した CSS を 止めるか)")
    fail = self_test(real)
    errs, seen = check(real)
    print("app/style.css: @keyframes %d / animation の 宣言 %d / transition の 宣言 %d を 見た"
          % (seen["keyframes"], seen["animation"], seen["transition"]))
    if errs:
        print("NG: %d 件" % len(errs))
        for code, ln, msg in errs:
            print("  ✕ [%s] %d 行: %s" % (code, ln, msg))
    else:
        print("OK: 動きの 決めごと (K1〜K6) に 合っています")
    lfail, lerrs = layout_main(real, path)
    fail = fail + lfail
    if fail:
        print("陰性テスト FAIL %d 件" % len(fail))
    sys.exit(1 if (errs or fail or lerrs) else 0)


if __name__ == "__main__":
    main()
