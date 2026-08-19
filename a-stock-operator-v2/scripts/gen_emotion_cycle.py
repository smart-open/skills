# -*- coding: utf-8 -*-
"""Model 04 情绪温度计：温度 + 风险双维、五阶段判定、仓位建议。
   用法：python scripts/gen_emotion_cycle.py --date 20260818
   输出：data/emotion_{date}.json"""
import os, argparse
from datetime import datetime

from _common import (BASE, load_json, dump_json, safe_float,
                      TEMPERATURE_W, RISK_W, PROFIT_FULL, today_ymd, seal_break_rates)

ap = argparse.ArgumentParser(description="情绪温度计 Model 04")
ap.add_argument("--date", default=today_ymd(), help="目标交易日 YYYYMMDD")
_args = ap.parse_args()
TD = _args.date

# ===== 配置常量（阈值集中管理，便于调参）=====
# 温度满温基准（达到即 100 分）
ZT_FULL = 60            # 涨停家数满温
HEIGHT_FULL = 6         # 连板高度满温（板）
LIANBAN_FULL = 15       # 连板家数满温（只）
# 风险：跌停家数满风险基准
ZD_FULL = 20
# 过热风险阈值
OVERHEAT_TEMP = 70      # 温度高于此值视为过热
EXTREME_LBC = 7         # 极端连板高度
# 背离风险阈值
DIVERGE_UP = 40         # 涨停家数阈值
DIVERGE_WIDTH = 45      # 上涨占比阈值
DIVERGE_BREAK = 35      # 炸板率阈值
# 五阶段温度阈值
STAGE_ICE = 30          # < 30 冰点
STAGE_HIGH = 65         # >= 65 高潮/分歧
STAGE_FERM = 45         # >= 45 发酵/分歧
# 分歧风险阈值端点（温度滑动线：温度越高，触发分歧所需的风险越低）
RISK_HIGH = 55          # 温度 >= 65（高潮区）的分歧风险阈值
RISK_START = 65         # 温度 <= 45（发酵/启动区）的分歧风险阈值
# 仓位建议区间（成，0~10：1 成 = 10% 仓位）
POS_ICE = (0, 2)
POS_START = (2, 3)
POS_FERM = (4, 6)
POS_HIGH = (3, 5)
POS_DIVERGE = (2, 4)

market_path = os.path.join(BASE, f"data/market_{TD}.json")
if not os.path.exists(market_path):
    print(f"⚠️ 缺少 data/market_{TD}.json，情绪温度计跳过")
    raise SystemExit(0)

d = load_json(market_path)
_emk_td = str(d.get("trade_date") or "").replace("-", "")
if _emk_td and _emk_td != TD:
    print(f"⚠️ market 内 trade_date={d.get('trade_date')} 与目标日 {TD} 不符，结果基于旧数据")
lu = d.get("limit_up", {}).get("list", [])
total_up = d.get("limit_up", {}).get("total", 0)
zb = d.get("broken", {}).get("list", [])
total_zb = d.get("broken", {}).get("total", 0)
total_dn = d.get("limit_down", {}).get("total", 0)
breadth = d.get("breadth", {"up": 0, "down": 0, "flat": 0, "total": 0})

seal_rate, break_rate = seal_break_rates(total_up, total_zb)
max_lbc = max((x.get("lbc", 1) for x in lu), default=0)
lianban_cnt = sum(1 for x in lu if x.get("lbc", 1) >= 2)
up_cnt = breadth.get("up", 0)
down_cnt = breadth.get("down", 0)
big_loss_cnt = sum(1 for x in zb if safe_float(x.get("chg_pct")) < -5)

# ===== 赚钱效应（Model 04 新增因子）：昨日涨停池 → 今日晋级率 =====
# 数据源：zt_pool_15d.json（collect_zt_15d 采的同花顺每日涨停池个股 code）。
# 取 TD 之前最近一个交易日的池，与今日涨停池（market 的 limit_up list）做 code 交集。
zt_pool = load_json(os.path.join(BASE, "data/zt_pool_15d.json"))
_prev_dates = sorted([dd for dd in zt_pool if dd < TD])
_prev_date = _prev_dates[-1] if _prev_dates else None
prev_codes = {str(it.get("code", "")).zfill(6) for it in zt_pool.get(_prev_date, [])} if _prev_date else set()
today_codes = {str(x.get("code", "")).zfill(6) for x in lu if x.get("code")}
advance_cnt = len(prev_codes & today_codes) if prev_codes else 0
advance_rate = round(advance_cnt / len(prev_codes) * 100, 1) if prev_codes else 0.0

# ===== 情绪温度（0-100 · 六因子加权，含赚钱效应） =====
zt_temp = min(total_up / ZT_FULL, 1.0) * 100
seal_temp = seal_rate
height_temp = min(max_lbc / HEIGHT_FULL, 1.0) * 100
lianban_temp = min(lianban_cnt / LIANBAN_FULL, 1.0) * 100
up_pct = up_cnt / (up_cnt + down_cnt) * 100 if (up_cnt + down_cnt) else 50.0
breadth_temp = up_pct
profit_temp = min(advance_rate / PROFIT_FULL, 1.0) * 100 if prev_codes else 50.0

temperature = (TEMPERATURE_W["zt"] * zt_temp + TEMPERATURE_W["seal"] * seal_temp
               + TEMPERATURE_W["height"] * height_temp + TEMPERATURE_W["lianban"] * lianban_temp
               + TEMPERATURE_W["breadth"] * breadth_temp + TEMPERATURE_W["profit"] * profit_temp)

# ===== 风险度（0-100 · 四因子加权） =====
break_risk = break_rate
big_loss_rate = big_loss_cnt / max(len(zb), 1) * 100
loss_risk = 0.5 * big_loss_rate + 0.5 * min(total_dn / ZD_FULL, 1.0) * 100
overheat = 0.0
if temperature >= OVERHEAT_TEMP:
    overheat = min((temperature - OVERHEAT_TEMP) / (100 - OVERHEAT_TEMP), 1.0) * 100
if max_lbc >= EXTREME_LBC:
    overheat = max(overheat, OVERHEAT_TEMP)
diverge = 0.0
if total_up >= DIVERGE_UP:
    # 背离连续化：涨停多但上涨占比差 / 炸板率高，越严重背离分越高（0~100）
    diverge_width = min((DIVERGE_WIDTH - up_pct) / DIVERGE_WIDTH, 1.0) * 100 if up_pct < DIVERGE_WIDTH else 0.0
    diverge_break = min((break_rate - DIVERGE_BREAK) / (100 - DIVERGE_BREAK), 1.0) * 100 if break_rate >= DIVERGE_BREAK else 0.0
    diverge = max(diverge_width, diverge_break)

risk = (RISK_W["break"] * break_risk + RISK_W["loss"] * loss_risk
        + RISK_W["overheat"] * overheat + RISK_W["diverge"] * diverge)

def diverge_risk_threshold(temp):
    """分歧风险阈值（温度滑动线）：温度越高，触发分歧所需的风险越低。
    温度 >= 65 → 55；温度 <= 45 → 65；中间线性插值，消除三段式硬阈值的边缘跳跃。"""
    if temp >= STAGE_HIGH:
        return float(RISK_HIGH)
    if temp <= STAGE_FERM:
        return float(RISK_START)
    return RISK_START + (RISK_HIGH - RISK_START) * (temp - STAGE_FERM) / (STAGE_HIGH - STAGE_FERM)

# ===== 五阶段 + 仓位建议 =====
_diverge_th = diverge_risk_threshold(temperature)
if temperature < STAGE_ICE:
    stage, stage_tone = "冰点", "情绪冰点"
    pos_range = POS_ICE
    advice = "交投清淡，空仓等待或关注超跌反抽，不抢反弹"
elif temperature >= STAGE_HIGH:
    if risk >= _diverge_th:
        stage, stage_tone = "分歧", "情绪分歧"
        pos_range = POS_DIVERGE
        advice = "情绪高位分化，控制仓位，聚焦核心辨识度个股"
    else:
        stage, stage_tone = "高潮", "情绪高潮"
        pos_range = POS_HIGH
        advice = "主线明牌但风险累积，去弱留强、不追高位连板，警惕退潮"
elif temperature >= STAGE_FERM:
    if risk >= _diverge_th:
        stage, stage_tone = "分歧", "情绪分歧"
        pos_range = POS_DIVERGE
        advice = "情绪分歧加剧，控制仓位，聚焦核心辨识度个股"
    else:
        stage, stage_tone = "发酵", "情绪发酵"
        pos_range = POS_FERM
        advice = "主线清晰，积极参与主线龙头与低位补涨"
else:  # STAGE_ICE <= temperature < STAGE_FERM
    if risk >= _diverge_th:
        stage, stage_tone = "分歧", "情绪分歧"
        pos_range = POS_DIVERGE
        advice = "情绪回归谨慎，控制仓位观察，等待情绪修复"
    else:
        stage, stage_tone = "启动", "情绪启动"
        pos_range = POS_START
        advice = "新题材初现，轻仓试错首板，观察连板高度能否打开"

position = f"{pos_range[0]}-{pos_range[1]}成"

result = {
    "date": TD,
    "model": "emotion_v1",
    "generated": datetime.now().isoformat(),
    "params": {"temperature_weights": TEMPERATURE_W, "risk_weights": RISK_W},
    "temperature": round(temperature, 1),
    "risk": round(risk, 1),
    "stage": stage,
    "stage_tone": stage_tone,
    "position": position,
    "position_min": pos_range[0],
    "position_max": pos_range[1],
    "advice": advice,
    "metrics": {
        "zt_total": total_up, "zb_total": total_zb, "zd_total": total_dn,
        "seal_rate": seal_rate, "break_rate": break_rate,
        "max_lbc": max_lbc, "lianban_cnt": lianban_cnt,
        "up_cnt": up_cnt, "down_cnt": down_cnt, "big_loss_cnt": big_loss_cnt,
        "advance_rate": advance_rate, "advance_cnt": advance_cnt, "prev_pool_cnt": len(prev_codes),
    },
    "factors": {
        "temperature": {"zt": round(zt_temp, 1), "seal": round(seal_temp, 1),
                        "height": round(height_temp, 1), "lianban": round(lianban_temp, 1),
                        "breadth": round(breadth_temp, 1), "profit": round(profit_temp, 1)},
        "risk": {"break": round(break_risk, 1), "loss": round(loss_risk, 1),
                 "overheat": round(overheat, 1), "diverge": round(diverge, 1)},
    },
}

out_path = os.path.join(BASE, f"data/emotion_{TD}.json")
dump_json(result, out_path)
print(f"✅ 情绪温度计完成 → {out_path}")
print(f"   情绪={stage} 温度={temperature:.1f} 风险={risk:.1f} 仓位={position}")
print(f"   建议：{advice}")