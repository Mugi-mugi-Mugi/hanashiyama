# -*- coding: utf-8 -*-
"""はなし山: style.css の 動きの 決めごと (P1-4) の 歯止め。

決めごと (docs/企画/20261114_追加改修計画_P0-3_P1-3_P1-4.md §3)
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

実行: python tools/test_css.py   (陰性テストか style.css の どちらかが 落ちれば 終了コード 1)
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, "app", "style.css")

T_MIN, T_MAX = 0.15, 0.30
T_STOP = 0.01                    # ★これ 以下の 時間は「止めた」と 見る (0.01ms 型の 止め方)
ICHIBYO = 0.8                    # ★写真の 一拍の 間 (ユーザー決定 2026-11-15)。★JS の タイマーで 作る
MOVE_OK = ("transform", "opacity")
KF_META = ("animation-timing-function",)          # keyframes の 中で 書いてよい (性質を 動かさない)
NO_ANIM = ("filter", "-webkit-filter", "backdrop-filter", "-webkit-backdrop-filter", "box-shadow")
BACKDROP = ("backdrop-filter", "-webkit-backdrop-filter")
TIMING = {"ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-start", "step-end"}
ANIM_KW = TIMING | {"infinite", "normal", "reverse", "alternate", "alternate-reverse", "none",
                    "forwards", "backwards", "both", "running", "paused", "initial", "inherit", "unset"}
# ★減らす 設定でも 残してよい 動き = 写真の 出入りの フェード (opacity だけ)。2026-11-15 ユーザー判断
RED_FADE_OK = (".haikei", ".haikei-cap", ".haikei-in::after", ".haikei.kawari #haikeiImg")
FADE_KF = ("usu",)                # ★opacity だけを 動かす keyframes
T_FADE = 0.80                     # ★写真の フェードだけ 0.8 秒まで (2026-11-15 ユーザー「もう少し 長く」)
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

    cur = {"fade": False}             # ★いま 見ている 宣言が 写真の フェード (opacity だけ・決めた 選択子) か

    def time_check(where, ln, ts, what):
        for k, x in enumerate(ts):
            if k == 0 and cur["fade"] and T_MIN - 1e-9 <= x <= T_FADE + 1e-9:
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
            if p == "animation":
                fade_only = vl != "none" and all(
                    any(w.lower() in FADE_KF for w in words(item)) for item in split_top(v, ","))
                cur["fade"] = fade_only and all(s in RED_FADE_OK for s in r.sels)
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


def main():
    real = io.open(CSS, encoding="utf-8").read()
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
    if fail:
        print("陰性テスト FAIL %d 件" % len(fail))
    sys.exit(1 if (errs or fail) else 0)


if __name__ == "__main__":
    main()
