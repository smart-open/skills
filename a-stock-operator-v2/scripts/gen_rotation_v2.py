# -*- coding: utf-8 -*-
"""P1 优化：资金轮动四象限（Model 03） + 板块趋势多因子（Model 06）。
  用法：python scripts/gen_rotation_v2.py --date 20260818
  输出：data/rotation_{date}.json（四象限 + 轮动速度 + 多因子趋势榜）"""
import os, argparse
from datetime import datetime
from collections import defaultdict

from _common import (BASE, load_json, dump_json, safe_float,
                      today_ymd, seal_break_rates, BOARD_FALLBACK_COLOR,
                      trend_tag, bridge_ths_name, boards_chg_lookup)

ap = argparse.ArgumentParser(description="资金轮动四象限 + 板块趋势多因子")
ap.add_argument("--date", default=today_ymd(), help="目标交易日 YYYYMMDD")
ap.add_argument("--lookback", type=int, default=5, help="资金/趋势一致性回溯天数（默认5）")
_args = ap.parse_args()
TD = _args.date
LB = _args.lookback


# ===== 1. 加载数据 =====
market = load_json(os.path.join(BASE, f"data/market_{TD}.json"))
hot = load_json(os.path.join(BASE, f"data/hot_sectors_{TD}.json"))
boards = load_json(os.path.join(BASE, "data/boards_15d.json"))
zt = load_json(os.path.join(BASE, "data/zt_15d.json"))

hot_sectors = hot.get("hot_sectors", [])
total_up = market.get("limit_up", {}).get("total", 0)
total_zb = market.get("broken", {}).get("total", 0)
seal_rate, _ = seal_break_rates(total_up, total_zb)

# 真实板块资金流历史（fund_15d）；缺失时四象限/趋势多因子退化为涨停/涨幅代理
fund_hist = load_json(os.path.join(BASE, "data/fund_15d.json"))

# 反向桥：同花顺短名 → 东财名（供 Model 06 从 boards_15d 短名回查真实资金流）
_ths_to_em = {}
for _em in fund_hist:
    _ths = bridge_ths_name(_em)
    if _ths:
        _ths_to_em.setdefault(_ths, _em)


# ===== 2. 工具：从 zt_15d / boards_15d 提取某板块近 LB 日趋势 =====
def _zt_trend(name):
    """近 LB 日涨停家数序列（旧→新），经同花顺短名桥接对齐动态热点名。"""
    dates = sorted(zt.keys())[-LB:]
    key = bridge_ths_name(name) or name
    return [zt.get(d, {}).get(key, 0) for d in dates], len(dates)


def _chg_trend(name):
    """从 boards_15d 提取近 LB 日涨幅序列（旧→新），东财名精确匹配、同花顺短名桥接兜底。"""
    daily = boards_chg_lookup(boards, name)
    if not daily:
        return [], 0
    recent = daily[-LB:]
    return [chg for _, chg in recent], len(recent)


def _up_ratio(seq):
    """上升天数占比（空序列返回 0）"""
    if not seq:
        return 0.0
    n = len(seq)
    up = sum(1 for i in range(1, n) if seq[i] > seq[i - 1])
    return round(up / max(n - 1, 1), 2)


def _fund_trend(name):
    """近 LB 日主力净流入序列（旧→新）；东财名直接匹配，同花顺短名经反向桥匹配。"""
    fm = fund_hist.get(name)
    if not fm:
        em = _ths_to_em.get(bridge_ths_name(name) or name)
        fm = fund_hist.get(em) if em else None
    if not fm:
        return [], 0
    dates = sorted(fm.keys())[-LB:]
    return [safe_float(fm[d]) for d in dates], len(dates)


def _fund_pos_ratio(seq):
    """近 LB 日资金为正天数占比（资金持续性）。空序列返回 None。"""
    if not seq:
        return None
    return round(sum(1 for v in seq if v > 0) / len(seq), 2)


# ===== 3. Model 03：资金轮动四象限 =====
# 优先用 zt_15d 涨停趋势作趋势一致性，缺则退化用 boards_15d 涨幅趋势
quad = {"mainline": [], "relay": [], "pulse": [], "fade": [], "neutral": []}

for s in hot_sectors:
    name = s["name"]
    fund_day = safe_float(s.get("fund_net_yi"))
    chg_day = safe_float(s.get("chg_pct"))

    zt_seq, zt_n = _zt_trend(name)
    chg_seq, chg_n = _chg_trend(name)
    fund_seq, fund_n = _fund_trend(name)

    # 趋势一致性优先用真实资金持续性，缺则退化为涨停/涨幅上升占比
    if fund_n >= 2 and any(v != 0 for v in fund_seq):
        up_ratio = _fund_pos_ratio(fund_seq)
        has_history = True
        sig = f"资金趋势{fund_seq[-3:] if fund_seq else []}"
    elif zt_n >= 2 and any(zt_seq):
        up_ratio = _up_ratio(zt_seq)
        has_history = True
        sig = f"涨停趋势{zt_seq[-3:] or zt_seq}"
    elif chg_n >= 2:
        up_ratio = _up_ratio(chg_seq)
        has_history = True
        sig = f"涨幅趋势{chg_seq[-3:] or chg_seq}"
    else:
        up_ratio = 0.5  # 无历史，中性
        has_history = False
        sig = "无历史（新热点）"

    # 四象限分类
    if fund_day < 0 and (chg_day < 0 or up_ratio <= 0.4):
        q = "fade"
    elif fund_day > 0 and has_history and up_ratio >= 0.6:
        q = "mainline"
    elif fund_day > 0 and (up_ratio < 0.4 or not has_history):
        q = "relay"
    elif fund_day <= 0 and chg_day > 0:
        q = "pulse"
    else:
        q = "neutral"

    quad[q].append({
        "name": name,
        "color": s.get("color", BOARD_FALLBACK_COLOR),
        "fund_net_yi": round(fund_day, 2),
        "chg_pct": round(chg_day, 2),
        "up_ratio": up_ratio,
        "zt_cnt": s.get("zt_cnt", 0),
        "score": s.get("score", 0),
        "signal": sig,
    })

# 轮动速度 = 切换型象限（接力+脉冲）占比（短线博弈/脉冲资金占比越高，资金切换越频繁）
_active = len(quad["mainline"]) + len(quad["relay"]) + len(quad["pulse"]) + len(quad["fade"])
_churn = len(quad["relay"]) + len(quad["pulse"])
rotation_speed = round(_churn / _active, 2) if _active else 0.0

# 扩散指数 = 热点板块覆盖的涨停家数 / 总涨停家数
covered_zt = sum(s.get("zt_cnt", 0) for s in hot_sectors)
breadth_index = round(min(covered_zt / total_up, 1.0), 2) if total_up else 0.0


# ===== 4. Model 06：板块趋势多因子 =====
def _cum(daily, ndays):
    cum = 1.0
    for _, chg in daily[-ndays:]:
        cum *= (1 + chg / 100)
    return round((cum - 1) * 100, 2)


# 归一化助手
def _norm(seq):
    if not seq:
        return []
    mn, mx = min(seq), max(seq)
    if mx == mn:
        return [0.5] * len(seq)
    return [(v - mn) / (mx - mn) for v in seq]


# 先算原始值
trend_raw = []
for name, daily in boards.items():
    if not daily:
        continue
    cum15 = _cum(daily, 15)
    cum5 = _cum(daily, 5)
    # 资金持续性：优先真实资金流 fund_15d（经同花顺短名反向桥），缺则用近5日上涨占比
    fseq, _ = _fund_trend(name)
    if fseq:
        fund_persist = _fund_pos_ratio(fseq) or 0.5
    else:
        chg_seq, _ = _chg_trend(name)
        pos = sum(1 for c in chg_seq if c > 0) / max(len(chg_seq), 1) if chg_seq else 0.5
        fund_persist = round(pos, 3)
    fund_persist = round(min(fund_persist, 1.0), 3)
    # 涨停家数持续性：近 LB 日涨停家数之和归一化（raw，稍后统一 norm）
    zt_seq, _ = _zt_trend(name)
    zt_persist = sum(zt_seq)
    trend_raw.append({
        "name": name, "cum15": cum15, "cum5": cum5,
        "fund_persist": fund_persist, "zt_persist": zt_persist,
        "_daily": daily,
    })

if trend_raw:
    n15 = _norm([r["cum15"] for r in trend_raw])
    n5 = _norm([r["cum5"] for r in trend_raw])
    nf = _norm([r["fund_persist"] for r in trend_raw])
    nz = _norm([r["zt_persist"] for r in trend_raw])
    for i, r in enumerate(trend_raw):
        r["_n15"], r["_n5"] = n15[i], n5[i]
        r["_nf"], r["_nz"] = nf[i], nz[i]

# 加权趋势分
WEIGHTS_T = {"n15": 0.40, "n5": 0.30, "nf": 0.20, "nz": 0.10}
trend_board = []
for r in trend_raw:
    score = (WEIGHTS_T["n15"] * r["_n15"] + WEIGHTS_T["n5"] * r["_n5"]
             + WEIGHTS_T["nf"] * r["_nf"] + WEIGHTS_T["nz"] * r["_nz"])
    cum15, cum5 = r["cum15"], r["cum5"]
    tag = trend_tag(cum15, cum5)
    color = next((s["color"] for s in hot_sectors if s["name"] == r["name"]), BOARD_FALLBACK_COLOR)
    trend_board.append({
        "name": r["name"],
        "color": color,
        "trend_score": round(score, 3),
        "cum15": cum15,
        "cum5": cum5,
        "fund_persist": r["fund_persist"],
        "zt_persist": r["zt_persist"],
        "tag": tag,
    })

trend_board.sort(key=lambda x: -x["trend_score"])

# ===== 5. 概括 =====
q_cn = {"mainline": "主线", "relay": "接力", "pulse": "脉冲", "fade": "退潮"}
summary_parts = [f"{q_cn[k]}×{len(v)}" for k, v in quad.items() if v and k != "neutral"]
speed_desc = "轮动快" if rotation_speed >= 0.5 else ("轮动慢·主线明确" if rotation_speed < 0.3 else "轮动中性")
summary = f"四象限 {('、'.join(summary_parts)) or '无明显象限'}｜轮动速度 {rotation_speed:.2f}（{speed_desc}）｜扩散指数 {breadth_index:.2f}"

result = {
    "date": TD,
    "model": "rotation_v1",
    "generated": datetime.now().isoformat(),
    "params": {"lookback": LB, "weights_trend": WEIGHTS_T},
    "market_context": {"zt_total": total_up, "zb_total": total_zb, "seal_rate": seal_rate},
    "rotation_speed": rotation_speed,
    "breadth_index": breadth_index,
    "quadrants": {k: v for k, v in quad.items()},
    "trend_board": trend_board,
    "summary": summary,
}

out_path = os.path.join(BASE, f"data/rotation_{TD}.json")
# 空结果保护：热点与趋势榜均空说明上游失败，不落盘（保留旧文件）
if not hot_sectors and not trend_board:
    print("!! hot_sectors 与趋势榜均为空（上游可能失败），不落盘")
    raise SystemExit(1)
dump_json(result, out_path)
print(f"✅ 资金轮动四象限 + 趋势多因子完成 → {out_path}")
print(f"   {summary}")
for k, v in quad.items():
    if v:
        names = "、".join(f"{x['name']}({x['fund_net_yi']:+.1f}亿)" for x in v[:5])
        print(f"   [{q_cn.get(k, k)}] {len(v)} 个: {names}")
print(f"   趋势榜 Top5: " + "、".join(f"{t['name']}({t['trend_score']:.2f}/{t['tag'] or '—'})" for t in trend_board[:5]))