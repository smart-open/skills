# -*- coding: utf-8 -*-
"""样本分析诊断：在给定(代码,日期,战法)上回放模型，打印 K线运行参数 + 判定细节
用法: py scripts/analyze_samples.py [--top 12]
默认分析内置的 一阳指 人工标注样本(白银有色/亨通光电/英维克/金健米业/通鼎互联)"""
from __future__ import annotations
import os, sys, argparse
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C
import numpy as np
import indicators as IND

SAMPLES = [
    # ---- 第一批(已复现命中) ----
    {"code": "601212", "name": "白银有色", "date": "2026-08-21", "strategy": "open"},
    {"code": "600487", "name": "亨通光电", "date": "2026-08-05", "strategy": "turn"},
    {"code": "600487", "name": "亨通光电", "date": "2026-08-25", "strategy": "open"},
    {"code": "002837", "name": "英维克",   "date": "2026-08-25", "strategy": "open"},
    {"code": "600127", "name": "金健米业", "date": "2026-08-06", "strategy": "turn"},
    {"code": "600127", "name": "金健米业", "date": "2026-08-17", "strategy": "open"},
    {"code": "002491", "name": "通鼎互联", "date": "2026-08-05", "strategy": "turn"},
    {"code": "002491", "name": "通鼎互联", "date": "2026-08-21", "strategy": "open"},
    # ---- 第二批(新增, 跨境支付题材) ----
    {"code": "002017", "name": "东信和平", "date": "2026-08-21", "strategy": "open"},
    {"code": "002104", "name": "恒宝股份", "date": "2026-08-24", "strategy": "open"},
    {"code": "003040", "name": "楚天龙",   "date": "2026-08-24", "strategy": "open"},
    # ---- 中国软件 ----
    {"code": "600536", "name": "中国软件", "date": "2026-07-13", "strategy": "turn"},
    {"code": "600536", "name": "中国软件", "date": "2026-08-18", "strategy": "open"},
    # ---- 金牛化工(日线) ----
    {"code": "600722", "name": "金牛化工", "date": "2026-07-17", "strategy": "turn"},
    {"code": "600722", "name": "金牛化工", "date": "2026-07-22", "strategy": "open"},
    {"code": "600722", "name": "金牛化工", "date": "2026-08-10", "strategy": "open"},
    {"code": "600722", "name": "金牛化工", "date": "2026-08-18", "strategy": "open"},
    {"code": "600722", "name": "金牛化工", "date": "2026-08-28", "strategy": "open"},
    # ---- 其他 ----
    {"code": "603039", "name": "泛微网络", "date": "2026-07-30", "strategy": "turn"},
    {"code": "603466", "name": "风语筑",   "date": "2026-08-04", "strategy": "turn"},
    {"code": "000603", "name": "盛达资源", "date": "2026-07-22", "strategy": "turn"},
    {"code": "000603", "name": "盛达资源", "date": "2026-08-05", "strategy": "open"},
    {"code": "002279", "name": "久其软件", "date": "2026-07-28", "strategy": "turn"},
    {"code": "002279", "name": "久其软件", "date": "2026-08-28", "strategy": "open"},
    # ---- 第三批 ----
    {"code": "605577", "name": "龙版传媒", "date": "2026-08-31", "strategy": "open"},
    {"code": "600967", "name": "内蒙一机", "date": "2026-07-23", "strategy": "turn"},
    {"code": "600967", "name": "内蒙一机", "date": "2026-09-01", "strategy": "open"},
    {"code": "605118", "name": "力鼎光电", "date": "2026-08-31", "strategy": "turn"},
    {"code": "000062", "name": "深圳华强", "date": "2026-08-28", "strategy": "open"},
    {"code": "600869", "name": "远东股份", "date": "2026-09-02", "strategy": "open"},
    {"code": "002639", "name": "雪人集团", "date": "2026-09-02", "strategy": "open"},
    {"code": "002886", "name": "沃特股份", "date": "2026-08-21", "strategy": "open"},
    {"code": "603890", "name": "春秋电子", "date": "2026-08-13", "strategy": "turn"},
    {"code": "600186", "name": "莲花控股", "date": "2026-08-05", "strategy": "turn"},
    {"code": "600367", "name": "红星发展", "date": "2026-08-17", "strategy": "open"},
    {"code": "002636", "name": "金安国纪", "date": "2026-08-25", "strategy": "turn"},
]

# 周线样例(自动由日线聚合)
WEEK_SAMPLES = [
    {"code": "600722", "name": "金牛化工", "date": "2026-07-24", "strategy": "turn"},
    {"code": "600722", "name": "金牛化工", "date": "2026-08-21", "strategy": "open"},
]


def find_index(rows, date):
    best = None
    for i, r in enumerate(rows):
        d = str(r[0]).replace("/", "-")
        if d == date:
            return i
        if best is None and d < date:
            best = i
    return best


def build_df(rows):
    return {
        "date": [str(r[0]) for r in rows],
        "open": np.array([r[1] for r in rows], dtype=float),
        "close": np.array([r[2] for r in rows], dtype=float),
        "high": np.array([r[3] for r in rows], dtype=float),
        "low": np.array([r[4] for r in rows], dtype=float),
        "vol": np.array([r[5] for r in rows], dtype=float),
    }


def fmt(x): return f"{x:+.2f}" if isinstance(x, (int, float)) else str(x)


def build_weekly(rows):
    """日线 -> 周线聚合. bar=[周最后交易日, 周首开, 周末收, 周最高, 周最低, 周总量]"""
    import datetime as dt
    weeks, order = {}, []
    for r in rows:
        d = str(r[0]).replace("/", "-")
        try:
            yy, mm, dd = int(d[:4]), int(d[5:7]), int(d[8:10])
        except ValueError:
            continue
        iso = dt.date(yy, mm, dd).isocalendar()
        wk = (iso[0], iso[1])
        if wk not in weeks:
            weeks[wk] = []
            order.append(wk)
        weeks[wk].append(r)
    bars = []
    for wk in order:
        g = weeks[wk]
        bars.append([g[-1][0], g[0][1], g[-1][2],
                     max(r[3] for r in g), min(r[4] for r in g),
                     sum(r[5] for r in g)])
    return bars


def report_one(s, top):
    rows = C.get_daily_kline(s["code"])
    if not rows:
        print(f"== {s['code']} {s['name']} {s['date']} {s['strategy']}: 无K线数据 ==")
        return
    df = build_df(rows)
    ind = IND.compute(df)
    i = find_index(rows, s["date"])
    if i is None or i < 0:
        print(f"== {s['code']} {s['name']}: 找不到日期 {s['date']} ==")
        return
    n = len(df["close"])
    print("=" * 78)
    print(f"== {s['code']} {s['name']} {s['date']}  标注:一阳指·{s['strategy']} ==")
    clo, ope, hi, lo, vol = (df["close"][i], df["open"][i], df["high"][i],
                             df["low"][i], df["vol"][i])
    pchg = (clo / df["close"][i - 1] - 1) * 100 if i > 0 else 0
    vma = ind["volma20"][i]
    vr = vol / vma if vma > 0 else 0
    print(f"  当日 O{ope:.2f} C{clo:.2f} H{hi:.2f} L{lo:.2f} V{vol:.0f}  涨幅{pchg:+.2f}% 量比{vr:.2f}")
    ma6, ma12, ma21 = ind["ma6"][i], ind["ma12"][i], ind["ma21"][i]
    print(f"  MA6 {ma6:.2f} MA12 {ma12:.2f} MA21 {ma21:.2f} | 多头排列:{clo > ma6 > ma12 > ma21}")
    end = min(n, i + top)
    print("   - - 最近交易日轨迹(涨%/量比/ML) - -")
    for k in range(max(0, i - top), end):
        kc = df["close"][k]
        kchg = (kc / df["close"][k - 1] - 1) * 100 if k > 0 else 0
        kvma = ind["volma20"][k]
        kvolr = df["vol"][k] / kvma if kvma > 0 else 0
        kbig = 1 if kchg >= 5.0 else 0
        mark = "  <== 信号日" if k == i else ""
        print(f"   {df['date'][k]} C{kc:7.2f} {kchg:+6.2f}% 量比{kvolr:4.2f} "
              f"阳5%:{kbig} 多头:{int(kc>ind['ma6'][k]>ind['ma12'][k]>ind['ma21'][k])}{mark}")
    print(f"   - - forward(T+5起) - -")
    for g in range(i + 1, min(n, i + 7)):
        gchg = (df["close"][g]/df["close"][g-1]-1)*100
        cum = (df["close"][g]/clo-1)*100
        print(f"   {df['date'][g]} {gchg:+5.2f}%  累计{cum:+.2f}%")
    print("   - - 模型判定(历史回放) - -")
    for label, fn, kw in (("转势", IND.judge_turn, {"code": s["code"]}),
                          ("开门", IND.judge_open, {"code": s["code"]})):
        r = fn(ind, i, **kw)
        if r.get("insufficient"):
            print(f"   {label}: 数据不足 {r.get('reason')}")
            continue
        tag = "✔命中" if r["signal"] else "✘未中"
        print(f"   {label} {tag}  评分{r['score']}")
        for k in (r.get("reasons") or []):
            print(f"       + {k}")
        if not r["signal"]:
            print(f"       未成立: {r.get('counter')}")
        if r.get("stop"):
            print(f"       止损: {r['stop']}")
    print()
    print(f"VERDICT {s['code']} {s['name']} {s['date']} label={s['strategy']} "
          f"turn={'HIT' if IND.judge_turn(ind,i,code=s['code']).get('signal') else 'miss'} "
          f"open={'HIT' if IND.judge_open(ind,i,code=s['code']).get('signal') else 'miss'}")
    print()


def report_week(s, top):
    rows = C.get_daily_kline(s["code"])
    if not rows:
        print(f"== W[{s['code']} {s['name']} {s['date']} {s['strategy']}: 无K线数据 ==")
        return
    w = build_weekly(rows)
    df = build_df(w)
    ind = IND.compute(df)
    i = find_index(w, s["date"])
    if i is None or i < 0:
        print(f"== W[{s['code']} {s['name']}]: 找不到周收盘 {s['date']} ==")
        return
    n = len(df["close"])
    clo, ope, hi, lo, vol = (df["close"][i], df["open"][i], df["high"][i],
                             df["low"][i], df["vol"][i])
    pchg = (clo / df["close"][i - 1] - 1) * 100 if i > 0 else 0
    vma = ind["volma20"][i]
    vr = vol / vma if vma > 0 else 0
    print("=" * 78)
    print(f"== 周线 {s['code']} {s['name']} 周收{dict((str(r[0]),r) for r in w).get('x',{})} "
          f"标注:一阳指·{s['strategy']} ==")
    print(f"  当周 O{ope:.2f} C{clo:.2f} H{hi:.2f} L{lo:.2f}  涨幅{pchg:+.2f}% 量比{vr:.2f}")
    for k in range(max(0, i - 6), min(n, i + 4)):
        kc = df["close"][k]
        kchg = (kc / df["close"][k - 1] - 1) * 100 if k > 0 else 0
        mark = "  <== 信号周" if k == i else ""
        print(f"   {df['date'][k]} C{kc:7.2f} {kchg:+6.2f}%{mark}")
    print("   - - 模型判定(周线回放) - -")
    for label, fn, kw in (("转势", IND.judge_turn, {"code": s["code"]}),
                          ("开门", IND.judge_open, {"code": s["code"]})):
        r = fn(ind, i, **kw)
        if r.get("insufficient"):
            print(f"   {label}: 数据不足")
            continue
        tag = "✔命中" if r["signal"] else "✘未中"
        print(f"   {label} {tag}  评分{r['score']}")
        for k in (r.get("reasons") or []):
            print(f"       + {k}")
        if not r["signal"]:
            print(f"       未成立: {r.get('counter')}")
    print(f"VERDICT WEEK {s['code']} {s['name']} {s['date']} label={s['strategy']} "
          f"turn={'HIT' if IND.judge_turn(ind,i,code=s['code']).get('signal') else 'miss'} "
          f"open={'HIT' if IND.judge_open(ind,i,code=s['code']).get('signal') else 'miss'}")
    print()


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=12)
    ap.add_argument("--codes", type=str, default="")
    ap.add_argument("--week", action="store_true", help="额外输出周线样例")
    args = ap.parse_args(argv)
    samples = SAMPLES
    if args.codes:
        wanted = [c.strip() for c in args.codes.split(",")]
        samples = [s for s in SAMPLES if s["code"] in wanted or s["name"] in wanted]
    for s in samples:
        report_one(s, args.top)
    if args.week:
        for s in WEEK_SAMPLES:
            report_week(s, args.top)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))