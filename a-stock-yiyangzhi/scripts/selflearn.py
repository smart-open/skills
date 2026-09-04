# -*- coding: utf-8 -*-
"""一阳指 自学习闭环（scan 后自动触发）：
  1) verify    回填最近 scan 信号的真实 T+1/T+3/T+5 命中与收益 -> verify_history.csv / verify_summary.json
  2) optimize  基于全部缓存日K线重新校准量比阈值 -> params_best.json（仅用缓存，不联网）
  3) 诊断     收益口径回放：按 评分档/档位/涨停/战法 分层统计 T+3/T+5 平均收益，
              检测「评分倒挂」，写 selflearn_{date}.md 报告 + 累计 selflearn_history.json
用法：py scripts/selflearn.py [--date YYYYMMDD] [--skip-optimize]
"""
from __future__ import annotations
import os, sys, subprocess, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C
import indicators as IND

SP = os.path.dirname(os.path.abspath(__file__))


def _py():
    cands = [sys.executable, "python", "py"]
    seen = set()
    for c in cands:
        if not c or c in seen:
            continue
        seen.add(c)
        try:
            r = subprocess.run([c, "-c", "import numpy"], capture_output=True,
                               text=True, timeout=20)
            if r.returncode == 0:
                return c
        except Exception:
            continue
    return sys.executable


def _run_verify(date=None):
    cmd = [_py(), os.path.join(SP, "verify.py")]
    if date:
        cmd += ["--date", date]
    subprocess.call(cmd)


def _run_optimize():
    subprocess.call([_py(), os.path.join(SP, "optimize.py"), "--cache-only"])


# ===== 收益口径回放诊断（口径B·实战：信号日收盘选出 -> T+1开盘买入，剔除一字板） =====
def _diagnose():
    codes = sorted(f[:-5] for f in os.listdir(C.KLINE_DIR) if f.endswith(".json"))
    if not codes:
        return None
    wstart = C.window_start_ymd()  # 最近3个月窗口起始 YYYYMMDD
    recs = []
    n_code = 0
    skipped_one_zt = 0
    import numpy as np
    for code in codes:
        rows = C.load_json(os.path.join(C.KLINE_DIR, code + ".json"), [])
        if not isinstance(rows, list) or len(rows) < 66:
            continue
        try:
            rows = [r for r in rows if isinstance(r, (list, tuple)) and len(r) >= 6]
            df = {
                "date": [str(r[0]).replace("-", "") for r in rows],
                "open": np.array([float(r[1]) for r in rows]),
                "close": np.array([float(r[2]) for r in rows]),
                "high": np.array([float(r[3]) for r in rows]),
                "low": np.array([float(r[4]) for r in rows]),
                "vol": np.array([float(r[5]) for r in rows]),
            }
        except Exception:
            continue
        ind = IND.compute(df)
        n = len(df["close"])
        ztp = C.zt_threshold(code) / 100.0   # 涨停阈值(比率, 含容差)
        for i in range(22, n - 5):
            if df["date"][i] < wstart:
                continue
            chg = (df["close"][i] / df["close"][i - 1] - 1) * 100
            t = IND.judge_turn(ind, i, code=code)
            o = IND.judge_open(ind, i, code=code)
            if not (t.get("signal") or o.get("signal")):
                continue
            # 实战成本：T+1 开盘价买入；T+1 开盘即涨停(一字/秒板封死)无法成交 -> 剔除
            cost = float(df["open"][i + 1]) if i + 1 < n else None
            if cost is None or cost <= 0:
                continue
            if (cost / float(df["close"][i]) - 1) >= ztp - 0.005:
                skipped_one_zt += 1
                continue
            is_zt = C.is_limit_up(chg, code)
            tier = C.recommend_tier(t.get("signal"), o.get("signal"), chg, is_zt)
            strategy = "+".join((["转势"] if t.get("signal") else []) +
                                (["开门"] if o.get("signal") else []))
            score = max(t.get("score", 0), o.get("score", 0))
            def _f(k):
                return (df["close"][i + k] / cost - 1) * 100 if i + k < n else None
            exit_ret = _sim_exit(cost, df, i, n)
            recs.append({"date": df["date"][i], "code": code, "strategy": strategy,
                         "score": int(score), "tier": tier, "is_zt": bool(is_zt),
                         "chg": round(chg, 2),
                         "r1": _f(1), "r3": _f(3), "r5": _f(5), "exit": exit_ret})
        n_code += 1
        if n_code % 500 == 0:
            print(f"  [selflearn] 回放 {n_code}/{len(codes)}  信号 {len(recs)}")
    return {"codes": n_code, "recs": recs, "skipped_one_zt": skipped_one_zt,
            "win0": wstart, "win1": C.latest_trade_date(sep="")}


def _sim_exit(cost, df, i, n, tp=C.TP_PCT, sl=C.SL_PCT):
    """退出纪律模拟（8%止盈/3%止损，日K区间近似，保守先止损）：T+1~T+5 逐日检查，
    触及止损记 -3%、触及止盈记 +8%，均未触发则持有到 T+5 收盘。返回收益%或 None。"""
    last_close = None
    for k in range(i + 1, min(i + 6, n)):
        lo = float(df["low"][k])
        hi = float(df["high"][k])
        last_close = float(df["close"][k])
        if lo <= cost * (1 - sl):
            return -sl * 100
        if hi >= cost * (1 + tp):
            return tp * 100
    return (last_close / cost - 1) * 100 if last_close else None


def _avg(vals):
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else 0.0


def _win(vals):
    vals = [v for v in vals if v is not None]
    return sum(1 for v in vals if v > 0) / len(vals) if vals else 0.0


def _seg(recs, pred):
    sub = [r for r in recs if pred(r)]
    return {
        "n": len(sub),
        "r1": round(_avg([r["r1"] for r in sub]), 3),
        "r3": round(_avg([r["r3"] for r in sub]), 3),
        "r5": round(_avg([r["r5"] for r in sub]), 3),
        "win3": round(sum(1 for r in sub if (r["r3"] or 0) > 0) / max(len(sub), 1), 4),
    }


def _render_report(diag, date):
    recs = diag["recs"]
    L = [f"# 一阳指模型自学习报告 {date}", ""]
    L.append(f"- 回放窗口：`{diag['win0']} ~ {diag['win1']}`（最近3个月，缓存日K）")
    L.append(f"- 缓存样本池：{diag['codes']} 只，输出信号 {len(recs)} 条（口径B·实战：信号日收盘选出 → T+1 开盘买入，剔除一字板）")
    if diag.get("skipped_one_zt"):
        L.append(f"- 已剔除 T+1 一字/秒板无法成交：{diag['skipped_one_zt']} 条")
    L.append("")

    # 整体
    L.append("## 一、整体收益口径")
    L.append("| 指标 | 信号数 | T+1 | T+3 | T+5 | T+3胜率 |")
    L.append("|------|------|------|------|------|------|")
    alls = _seg(recs, lambda r: True)
    L.append(f"| 整体 | {alls['n']} | {alls['r1']:+.2f}% | {alls['r3']:+.2f}% | {alls['r5']:+.2f}% | {alls['win3']*100:.1f}% |")
    L.append("")

    # 评分倒挂检测
    L.append("## 二、评分档位（检测评分倒挂）")
    L.append("| 评分档 | 信号数 | T+3 | T+5 | T+3胜率 |")
    L.append("|------|------|------|------|------|")
    bands = [(">=90", lambda r: r["score"] >= 90),
             ("80-89", lambda r: 80 <= r["score"] < 90),
             ("70-79", lambda r: 70 <= r["score"] < 80),
             ("<70", lambda r: r["score"] < 70)]
    stats = {}
    for label, p in bands:
        m = _seg(recs, p)
        stats[label] = m
        L.append(f"| {label} | {m['n']} | {m['r3']:+.2f}% | {m['r5']:+.2f}% | {m['win3']*100:.1f}% |")
    L.append("")
    hi = stats["<70"]["r3"]; lo = stats[">=90"]["r3"]
    if stats[">=90"]["n"] >= 10 and stats["<70"]["n"] >= 10 and lo < hi:
        L.append(f"⚠️ **评分倒挂仍在**：高分(≥90) T+3 {lo:+.2f}% < 低分(<70) {hi:+.2f}%。"
                 f"建议复核打分中涨停/爆量/追涨项是否仍被过度加分。")
    else:
        L.append("✅ 未检测到显著评分倒挂（或样本不足，需继续累积观察）。")
    L.append("")

    # 档位
    L.append("## 三、推荐档位")
    L.append("| 档位 | 信号数 | T+3 | T+5 | T+3胜率 |")
    L.append("|------|------|------|------|------|")
    for tier in ("首选", "关注", "追高风险"):
        m = _seg(recs, lambda r, t=tier: r["tier"] == t)
        L.append(f"| {tier} | {m['n']} | {m['r3']:+.2f}% | {m['r5']:+.2f}% | {m['win3']*100:.1f}% |")
    L.append("")

    # 涨停/非涨停 + 战法
    L.append("## 四、涨停 vs 非涨停 / 战法")
    L.append("| 分组 | 信号数 | T+3 | T+5 |")
    L.append("|------|------|------|------|")
    for label, p in (("非涨停", lambda r: not r["is_zt"]),
                     ("信号日涨停", lambda r: r["is_zt"]),
                     ("转势", lambda r: r["strategy"] == "转势"),
                     ("开门", lambda r: r["strategy"] == "开门"),
                     ("转势+开门", lambda r: "转势" in r["strategy"] and "开门" in r["strategy"])):
        m = _seg(recs, p)
        L.append(f"| {label} | {m['n']} | {m['r3']:+.2f}% | {m['r5']:+.2f}% |")
    L.append("")

    # 退出纪律 vs 持有
    L.append("## 五、退出纪律 vs 持有（口径B）")
    L.append("| 口径 | 信号数 | 平均收益 | 胜率 |")
    L.append("|------|------|------|------|")
    hold_r5 = [r.get("r5") for r in recs if r.get("r5") is not None]
    hold_exit = [r.get("exit") for r in recs if r.get("exit") is not None]
    L.append(f"| 持有至 T+5（基线） | {len(hold_r5)} | {_avg(hold_r5):+.2f}% | {_win(hold_r5)*100:.1f}% |")
    L.append(f"| 8%止盈/3%止损纪律 | {len(hold_exit)} | {_avg(hold_exit):+.2f}% | {_win(hold_exit)*100:.1f}% |")
    L.append("")
    L.append(f"> 8/3 纪律收益 = 触及止盈/止损即兑现，否则持有到 T+5；短线主看纪律能否把负收益转正。")
    L.append("")
    L.append("> 本报告基于缓存历史行情统计回放，含简化假设，仅供复盘参考，不构成投资建议。")
    return "\n".join(L) + "\n"


def main(argv=None):
    argv = list(argv or sys.argv[1:])
    date = None
    if "--date" in argv:
        date = argv[argv.index("--date") + 1]
    skip_opt = "--skip-optimize" in argv

    print("[selflearn] ① 验证回填（真实 T+1/T+3/T+5 收益/命中）...")
    _run_verify(date)
    print("[selflearn] ② 阈值重校准（仅缓存，回写 params_best.json）...")
    if not skip_opt:
        _run_optimize()
    else:
        print("[selflearn] 跳过 optimize（--skip-optimize）")
    print("[selflearn] ③ 收益口径回放诊断...")
    diag = _diagnose()
    if not diag:
        print("[selflearn] 无可用缓存K线，跳过诊断，返回")
        return 0
    d = date or C.latest_trade_date(sep="-")
    # 回放窗口末根：用缓存最新交易日（非今天，避免盘中未收盘）
    md = _render_report(diag, d)
    md_path = os.path.join(C.REPORT_ROOT, f"一阳指自学习-{d}.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(md)

    # 累计历史（供持续观察漂移/倒挂是否修复）
    hist_path = os.path.join(C.DATA, "selflearn_history.json")
    hist = C.load_json(hist_path, {})
    hist[d] = {
        "codes": diag["codes"], "signals": len(diag["recs"]),
        "overall": _seg(diag["recs"], lambda r: True),
        "by_tier": {t: _seg(diag["recs"], lambda r, t=t: r["tier"] == t)
                    for t in ("首选", "关注", "追高风险")},
        "by_score": {lbl: _seg(diag["recs"], p) for lbl, p in (
            (">=90", lambda r: r["score"] >= 90),
            ("80-89", lambda r: 80 <= r["score"] < 90),
            ("70-79", lambda r: 70 <= r["score"] < 80),
            ("<70", lambda r: r["score"] < 70))},
        "exit_vs_hold": {
            "hold_avg": round(_avg([r.get("r5") for r in diag["recs"] if r.get("r5") is not None]), 4),
            "exit_avg": round(_avg([r.get("exit") for r in diag["recs"] if r.get("exit") is not None]), 4),
        },
    }
    C.dump_json(hist_path, hist)
    print(f"[selflearn] 完成 → 报告 {md_path}")
    print(f"            历史 {hist_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))