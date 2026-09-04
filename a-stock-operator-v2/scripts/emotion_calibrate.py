# -*- coding: utf-8 -*-
"""情绪温度计权重观测校准（轻量，仅供调参参考，不强制回写）。

情绪温度计本质是「日内情绪状态描述」，非「次日预测模型」；其六因子权重是经验设定。
本脚本用已累积的 emotion_{date}.json + 次日 market 数据，计算：
  ① 当日温度/各因子分 与「次日实际赚钱效应(涨停晋级率)」的 Spearman 相关；
  ② 温度对次日涨停家数/封板率的方向性预测力；
  ③ 给出各因子权重的调参建议（相关性高 → 建议上调，低/反向 → 建议下调）。

输出：{cwd}/情绪温度计权重校准-{date}.md（观测报告）。样本不足（<10 个交易日）时仅提示，不给出调参建议。

用法：python scripts/emotion_calibrate.py
"""
import os
import glob
import argparse
import statistics
from datetime import datetime

from _common import (BASE, DATA_DIR, REPORT_ROOT, load_json, safe_float,
                     TEMPERATURE_W, TEMP_FACTOR_LABELS, seal_break_rates, today_ymd,
                     window_start_ymd)

MIN_DAYS = 10  # 最少交易日样本，不足则不给出调参建议
MONTHS_BACK = 3  # 统一数据窗口：最近 3 个月


def _rank(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    ranks = [0.0] * len(vals)
    i, n = 0, len(vals)
    while i < n:
        j = i
        while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman(x, y):
    if len(x) < 3:
        return 0.0
    rx, ry = _rank(x), _rank(y)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = sum((a - mx) ** 2 for a in rx)
    dy = sum((b - my) ** 2 for b in ry)
    den = (dx * dy) ** 0.5
    return num / den if den else 0.0


def _next_trade_date(date, all_dates):
    """date 之后最近一个交易日。"""
    later = [d for d in all_dates if d > date]
    return min(later) if later else None


def main():
    # 收集最近 3 个月内的 emotion_*.json
    wstart = window_start_ymd(MONTHS_BACK)
    emo_files = sorted(glob.glob(os.path.join(DATA_DIR, "emotion_*.json")))
    emo_files = [f for f in emo_files
                 if os.path.basename(f).split("_")[1].split(".")[0] >= wstart]
    if len(emo_files) < 2:
        print(f"!! 最近 3 个月（≥{wstart}）仅 {len(emo_files)} 个情绪文件，不足以做校准，请先累积多日 emotion 数据")
        return

    dates = [os.path.basename(f).split("_")[1].split(".")[0] for f in emo_files]
    emos = {}
    for f, d in zip(emo_files, dates):
        e = load_json(f, {})
        if e.get("temperature") is not None:
            emos[d] = e

    # 次日赚钱效应：从 market_{next}.json 提取涨停晋级率（用 zt_pool 近似）
    zt_pool = load_json(os.path.join(DATA_DIR, "zt_pool_15d.json"), {})
    pool_dates = sorted(zt_pool.keys())

    rows = []  # 每行: date, temperature, 各因子分, next_advance_rate
    for d in sorted(emos.keys()):
        e = emos[d]
        nd = _next_trade_date(d, pool_dates) if pool_dates else None
        if not nd:
            continue
        prev_codes = {str(it.get("code", "")).zfill(6) for it in zt_pool.get(d, [])}
        mkt = load_json(os.path.join(DATA_DIR, f"market_{nd}.json"), {})
        lu = mkt.get("limit_up", {}).get("list", [])
        today_codes = {str(x.get("code", "")).zfill(6) for x in lu if x.get("code")}
        if not prev_codes:
            continue
        adv = len(prev_codes & today_codes) / len(prev_codes) * 100
        factors = e.get("factors", {}).get("temperature", {})
        rows.append({
            "date": d, "temp": e["temperature"], "adv": adv,
            "zt": factors.get("zt", 0), "seal": factors.get("seal", 0),
            "height": factors.get("height", 0), "lianban": factors.get("lianban", 0),
            "breadth": factors.get("breadth", 0), "profit": factors.get("profit", 0),
        })

    if len(rows) < MIN_DAYS:
        print(f"!! 有效样本仅 {len(rows)} 日（<{MIN_DAYS}），不足以给出调参建议，仅记录观测")
    else:
        print(f"观测样本 {len(rows)} 日")

    # 相关性：温度 及 各因子 与 次日晋级率
    temps = [r["temp"] for r in rows]
    advs = [r["adv"] for r in rows]
    rho_temp = spearman(temps, advs)
    factor_rho = {}
    for fk in TEMPERATURE_W:
        factor_rho[fk] = spearman([r[fk] for r in rows], advs)

    # 渲染 Markdown
    date_disp = datetime.now().strftime("%Y-%m-%d")
    L = [f"# 情绪温度计权重校准 {date_disp}\n"]
    L.append(f"- 观测样本：`{len(rows)}` 个交易日")
    L.append(f"- 当日情绪温度 与 次日涨停晋级率 的 Spearman 相关：`{rho_temp:+.3f}`")
    L.append("")
    L.append("## 各因子与次日晋级率的相关性\n")
    L.append("| 因子 | 当前权重 | 与次日晋级率相关 | 调参建议 |")
    L.append("|---|---|---|---|")
    for fk in TEMPERATURE_W:
        rho = factor_rho[fk]
        if len(rows) < MIN_DAYS:
            advice = "样本不足，暂不调整"
        elif rho > 0.3:
            advice = "相关强，可上调"
        elif rho > 0.1:
            advice = "相关中等，维持"
        elif rho >= -0.1:
            advice = "相关弱，可下调"
        else:
            advice = "反向，建议下调/替换"
        L.append(f"| {TEMP_FACTOR_LABELS.get(fk, fk)} | {TEMPERATURE_W[fk]*100:.0f}% | {rho:+.3f} | {advice} |")
    L.append("")
    L.append("## 说明")
    L.append("- 情绪温度计是**日内情绪状态描述**，非次日预测模型；本校准仅观察「温度对次日赚钱效应」的方向性，作为人工调参参考。")
    L.append(f"- 样本稀疏时 Spearman 噪声大，样本<{MIN_DAYS} 个交易日不给出调参建议，避免过拟合。")
    L.append("- 如需正式校准，建议积累 ≥30 个交易日后再据相关性微调 `_common.py` 的 `TEMPERATURE_W`。")
    L.append("")
    L.append("> 仅供复盘参考，不构成投资建议。")
    md = "\n".join(L) + "\n"
    out = os.path.join(REPORT_ROOT, f"情绪温度计权重校准-{date_disp}.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"✅ 校准观测报告 → {out}")
    print(f"   温度↔次日晋级率 相关 {rho_temp:+.3f}")
    for fk in TEMPERATURE_W:
        print(f"   {TEMP_FACTOR_LABELS.get(fk,fk)}: {factor_rho[fk]:+.3f}")


if __name__ == "__main__":
    main()
