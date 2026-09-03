# -*- coding: utf-8 -*-
"""题材生命周期定位（Model 02）：基于多日涨停趋势 + 资金趋势，判定每个热点处于五阶段中的哪一阶段。
  萌芽→启动→发酵→高潮→退潮，输出短线/中线操作建议。
  用法：python scripts/gen_theme_lifecycle.py --date 20260818
  输出：data/theme_lifecycle_{date}.json"""
import os, argparse
from datetime import datetime
from collections import Counter

from _common import (BASE, DATA_DIR, load_json, dump_json, safe_float, today_ymd,
                      bridge_ths_name, boards_chg_lookup)

ap = argparse.ArgumentParser(description="题材生命周期定位")
ap.add_argument("--date", default=today_ymd(), help="目标交易日 YYYYMMDD")
ap.add_argument("--lookback", type=int, default=10, help="回溯天数（默认 10）")
_args = ap.parse_args()
TD = _args.date
LB = _args.lookback

# ===== 1. 加载热点数据 =====
hot_path = os.path.join(DATA_DIR, f"hot_sectors_{TD}.json")
if not os.path.exists(hot_path):
    raise SystemExit(f"热点数据不存在: {hot_path}，请先运行 gen_hot_sectors.py")

hot = load_json(hot_path)
hot_sectors = hot.get("hot_sectors", [])
# 空结果保护：hot_sectors 为空说明上游失败，不落盘（保留旧文件）
if not hot_sectors:
    print("!! hot_sectors 为空（上游 gen_hot_sectors 可能失败），不落盘")
    raise SystemExit(1)

# ===== 2. 加载涨停 15 日数据（按板块的每日涨停家数） =====
zt_path = os.path.join(DATA_DIR, "zt_15d.json")
if not os.path.exists(zt_path):
    print("!! zt_15d.json 不存在，生命周期将仅基于当日数据估算")
    zt_data = {}
else:
    zt_data = load_json(zt_path)

# 收集所有日期（降序，最新在前）
all_dates = sorted(zt_data.keys(), reverse=True) if zt_data else [TD]
lookback_dates = all_dates[:LB]

# ===== 3. 加载板块 15 日涨幅数据（用于资金趋势代理） =====
boards_path = os.path.join(DATA_DIR, "boards_15d.json")
if not os.path.exists(boards_path):
    boards_data = {}
else:
    boards_data = load_json(boards_path)

# ===== 3b. 加载真实板块资金流历史（fund_15d，缺失时资金趋势退化为涨幅代理） =====
fund_data = load_json(os.path.join(DATA_DIR, "fund_15d.json"))

# ===== 3c. 加载全市场涨停总数（用于生命周期阶段阈值相对化） =====
mkt = load_json(os.path.join(DATA_DIR, f"market_{TD}.json"))
zt_total = safe_float(mkt.get("limit_up", {}).get("total", 0))

# ===== 4. 为每个热点判定生命周期阶段 =====
def determine_stage(zt_trend, fund_trend_days):
    """根据涨停家数趋势 + 资金正向天数判定生命周期阶段。
       zt_trend: [d1, d2, ..., dn] 最近 N 日的涨停家数（d1 最旧，dn 最新）
       fund_trend_days: 最近 N 日中资金为正的天数"""
    n = len(zt_trend)
    if n == 0:
        return "萌芽", "观察，不参与", "研究储备"

    latest = zt_trend[-1]  # 最新涨停家数
    prev = zt_trend[-2] if n >= 2 else latest  # 前一日
    first_half = sum(zt_trend[:n//2]) / max(n//2, 1) if n >= 4 else zt_trend[0] if n >= 1 else 0
    second_half = sum(zt_trend[n//2:]) / max(n - n//2, 1) if n >= 4 else latest

    # 连续下降检查
    consecutive_down = 0
    for i in range(n - 1, 0, -1):
        if zt_trend[i] < zt_trend[i - 1]:
            consecutive_down += 1
        else:
            break

    # 退潮：连续 2 日下降 且 最新涨停家数 < 前一半均值
    if consecutive_down >= 2 and latest < first_half:
        return "退潮", "回避/清仓", "减仓离场"

    # 高潮：涨停 > 20 且 后一半均值 > 前一半但增速放缓
    if latest >= 20 and second_half >= first_half:
        return "高潮", "只打板不追高", "持有不加仓"

    # 发酵：涨停 8-20 且 后一半均值 > 前一半（上界 exclusive，避免与「高潮」的 latest==20 重叠）
    if 8 <= latest < 20 and second_half > first_half and fund_trend_days >= n * 0.4:
        return "发酵", "重点参与低吸", "逐步建仓"

    # 发酵（弱条件）：涨停 5-20 且 趋势上升
    if 5 <= latest < 8 and second_half > first_half * 1.2 and fund_trend_days >= n * 0.3:
        return "发酵", "重点参与低吸", "逐步建仓"

    # 启动：涨停 3-8 且 后一半 > 前一半
    if 3 <= latest <= 8 and second_half > first_half:
        return "启动", "小额试探首板", "跟踪龙头"

    # 萌芽：涨停 1-2，无显著趋势
    if latest <= 2:
        return "萌芽", "观察，不参与", "研究储备"

    # 默认分歧
    return "分歧", "观望，等待方向明确", "维持仓位观察"


def get_zt_trend(board_name):
    """从 zt_15d.json 提取某板块的涨停家数趋势（经同花顺短名桥接对齐动态热点名）。"""
    key = bridge_ths_name(board_name) or board_name
    trend = []
    for d in reversed(lookback_dates):  # 从旧到新
        day_data = zt_data.get(d, {})
        cnt = day_data.get(key, 0)
        trend.append(cnt)
    return trend

def get_fund_trend(board_name):
    """资金正天数（优先真实资金流 fund_15d，缺失时退化为涨幅代理）+ 涨幅序列（展示用）。"""
    daily = boards_chg_lookup(boards_data, board_name)
    date_map = {d: chg for d, chg in daily}
    recent_dates = sorted(date_map.keys())[-LB:]
    chg_trend = [date_map.get(d, 0) for d in recent_dates]

    fm = fund_data.get(board_name)
    if fm:
        seq_dates = sorted(fm.keys())[-LB:]
        seq = [safe_float(fm[d]) for d in seq_dates]
        positive_days = sum(1 for v in seq if v > 0)
    else:
        positive_days = sum(1 for c in chg_trend if c > 0)
    return positive_days, chg_trend


# 生命周期阈值相对化：把「绝对涨停家数阈值」映射回常规市场口径（常态全场约 60 家涨停）
ZT_BASELINE = 60


def _market_scale(total_up):
    """市场环境缩放系数：弱市放大阈值、强市压缩阈值，夹在 [0.5, 3.0]。"""
    if not total_up:
        return 1.0
    return max(0.5, min(3.0, ZT_BASELINE / total_up))

# 预期生命周期颜色映射
STAGE_COLORS = {
    "萌芽": "#5e7196",
    "启动": "#ffb454",
    "发酵": "#5b8cff",
    "高潮": "#ff5c70",
    "退潮": "#2cd89a",
    "分歧": "#8fa0bf",
}

themes = []
_scale = _market_scale(zt_total)
for s in hot_sectors:
    name = s["name"]
    zt_trend = get_zt_trend(name)
    fund_days, chg_trend = get_fund_trend(name)

    # 如果 zt_15d 中没有该板块（新板块），用当日涨停家数作为单点估算
    if not zt_trend or sum(zt_trend) == 0:
        zt_trend = [s["zt_cnt"]]
        fund_days = 1 if s["fund_net_yi"] > 0 else 0

    # 阈值相对化：将涨停趋势缩放回常规市场口径后再判段（弱市放大、强市压缩）
    adj_trend = [z * _scale for z in zt_trend]
    stage, short_strat, mid_strat = determine_stage(adj_trend, fund_days)

    themes.append({
        "name": name,
        "stage": stage,
        "stage_color": STAGE_COLORS.get(stage, "#8fa0bf"),
        "days_active": sum(1 for z in zt_trend if z > 0),
        "zt_trend": zt_trend,
        "fund_positive_days": fund_days,
        "chg_trend": [round(c, 2) for c in chg_trend],
        "lbc_max": s["lbc_max"],
        "zt_cnt_today": s["zt_cnt"],
        "short_strategy": short_strat,
        "mid_strategy": mid_strat,
        "color": s["color"],
        "score": s["score"],
    })

# ===== 5. 统计概括 =====
stage_counts = Counter(t["stage"] for t in themes)
summary = "、".join(f"{s}×{c}" for s, c in stage_counts.most_common())

result = {
    "date": TD,
    "model": "theme_lifecycle_v1",
    "generated": datetime.now().isoformat(),
    "lookback_days": LB,
    "summary": f"当前 {len(themes)} 个热点题材：{summary}",
    "themes": themes,
}

# ===== 6. 落盘 =====
out_path = os.path.join(DATA_DIR, f"theme_lifecycle_{TD}.json")
dump_json(result, out_path)
print(f"✅ 题材生命周期定位完成 → {out_path}")
print(f"   {result['summary']}")
for t in themes:
    stage_cn = t["stage"]
    zt_str = " → ".join(str(z) for z in t["zt_trend"][-5:])
    print(f"   {t['name']:<14s} {stage_cn:<4s}  涨停趋势: [{zt_str}]  "
          f"短线: {t['short_strategy']}")