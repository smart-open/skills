# -*- coding: utf-8 -*-
import os
from _common import BASE, load_json, dump_json, safe_float
"""个股推荐计算 — 基于 a-stock-operator 方法论
输出一：主板首板·低位突破（5只）
输出二：主板突破+放量+热点（5只，涨幅5%~9.9%非涨停）
数据：涨停池/题材(已有JSON) + 新浪涨幅榜 + 腾讯前复权K线
"""
import json
import time
import requests
import argparse
from datetime import datetime

S = requests.Session()
S.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117.0.0.0 Safari/537.36"})

ap = argparse.ArgumentParser(description="个股推荐计算（基于当日涨停池/题材）")
ap.add_argument("--date", default=datetime.now().strftime("%Y%m%d"),
                help="目标交易日 YYYYMMDD，默认取真实今日")
_args = ap.parse_args()
TD = _args.date

mkt_path = os.path.join(BASE, f"data/market_{TD}.json")
if not os.path.exists(mkt_path):
    raise SystemExit(f"!! 数据文件不存在: market_{TD}.json，请先运行 collect_data.py")
d = load_json(mkt_path)
if d.get("trade_date") and d["trade_date"].replace("-", "") != TD:
    raise SystemExit(f"!! market_{TD}.json 内 trade_date={d['trade_date']} 与目标日 {TD} 不符，数据过期，请重新采集")
lu = d.get("limit_up", {}).get("list", [])
if not lu:
    raise SystemExit("!! market 涨停池为空（采集失败或非交易日），请重跑 collect_data.py")

# 题材映射（code -> reason）
reason_map = {r.get("code", ""): (r.get("reason", "") or "") for r in d.get("hot_reason", {}).get("rows", [])}

def is_main_board(code):
    return code.startswith(("600", "601", "603", "605", "000", "001", "002"))

def is_st(name):
    return "ST" in name.upper() or "退" in name

def tencent_code(code):
    return ("sh" if code.startswith(("6", "9")) else "sz") + code

def fetch_kline(code, n=260):
    tc = tencent_code(code)
    url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={tc},day,,,{n},qfq"
    for _ in range(2):
        try:
            r = S.get(url, timeout=12)
            data = r.json().get("data", {}).get(tc, {})
            k = data.get("qfqday") or data.get("day") or []
            return k
        except Exception:
            time.sleep(0.8)
    return []

def calc_metrics(code):
    """返回 (均线站上情况, 回撤%, 60日跌幅%, 量能倍数, 突破高点, 近250日高低)"""
    k = fetch_kline(code)
    if len(k) < 30:
        return None
    closes = [float(row[2]) for row in k]
    highs = [float(row[3]) for row in k]
    vols = [float(row[5]) for row in k]
    price = closes[-1]
    def ma(n):
        if len(closes) < n:
            return None
        return sum(closes[-n:]) / n
    ma6, ma21, ma60 = ma(6), ma(21), ma(60)
    high250 = max(highs[-250:]) if len(highs) >= 250 else max(highs)
    low250 = min([float(row[4]) for row in k][-250:]) if len(k) >= 250 else min(float(row[4]) for row in k)
    drawdown = round((high250 - price) / high250 * 100, 1)  # 距高点回撤%
    chg60 = round((price - closes[-61]) / closes[-61] * 100, 1) if len(closes) > 61 else 0  # 近60日涨幅
    # 量能：近5日均量 / 前20日均量
    v5 = sum(vols[-5:]) / 5 if len(vols) >= 5 else 0
    v20 = sum(vols[-25:-5]) / 20 if len(vols) >= 25 else 0
    vol_ratio = round(v5 / v20, 2) if v20 > 0 else 0
    # 突破近期高点（近20日收盘高点是否被突破）
    high20 = max(closes[-21:-1]) if len(closes) > 21 else max(closes[:-1])
    breakout = price >= high20 * 0.995
    # 均线多头
    ma_bull = (ma6 is not None and ma21 is not None and ma6 >= ma21)
    above_ma60 = ma60 is not None and price > ma60
    return {
        "price": price, "ma6": ma6, "ma21": ma21, "ma60": ma60,
        "drawdown": drawdown, "chg60": chg60, "vol_ratio": vol_ratio,
        "breakout": breakout, "ma_bull": ma_bull, "above_ma60": above_ma60,
        "high250": high250, "low250": low250,
    }

# ===== 候选1：主板首板（lbc==1 且主板 且非ST） =====
first_board = [x for x in lu
               if (x.get("lbc") or 0) == 1 and x.get("code") and is_main_board(x["code"])
               and not is_st(x.get("name", ""))]
print(f"主板首板候选: {len(first_board)} 只")

# ===== 候选2：主板涨幅 5%~9.9% 非涨停（新浪涨幅榜） =====
gain_candidates = []
for page in range(1, 4):  # 拉前300只涨幅榜
    url = (f"https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
           f"Market_Center.getHQNodeData?page={page}&num=100&sort=changepercent&asc=0&node=hs_a")
    rows = None
    for _ in range(2):  # 单页重试一次，避免首页偶发失败静默截断
        try:
            rows = json.loads(S.get(url, timeout=15, headers={"Referer": "https://finance.sina.com.cn"}).text)
            break
        except Exception:
            time.sleep(1)
            rows = None
    if not rows:
        if page == 1:
            print("!! 新浪涨幅榜第1页拉取失败，突破候选将为空")
        break
    for r in rows:
        code = str(r.get("code") or "")
        name = str(r.get("name") or "")
        chg_raw = r.get("changepercent")
        try:
            chg = float(chg_raw)
        except (TypeError, ValueError):
            continue  # 停牌/异常行跳过
        trade = r.get("trade")
        if not code or not name or trade in (None, "", "0.00"):
            continue
        if is_main_board(code) and not is_st(name) and 5.0 <= chg < 9.9:
            try:
                price = float(trade)
            except (TypeError, ValueError):
                continue
            gain_candidates.append({"code": code, "name": name, "chg_pct": chg, "price": price})
    time.sleep(0.4)
print(f"主板涨幅5%~9.9%候选: {len(gain_candidates)} 只")

# ===== 计算指标 =====
def enrich_first_board():
    out = []
    for x in first_board:
        m = calc_metrics(x["code"])
        if not m:
            continue
        # 低位判定：回撤≥30% 或 近60日跌幅≥15%（chg60≤-15）或 横盘
        low_pos = m["drawdown"] >= 30 or m["chg60"] <= -15
        out.append({
            "code": x.get("code", ""), "name": x.get("name", ""),
            "chg_pct": safe_float(x.get("chg_pct")),
            "hybk": x.get("hybk", "") or "—",
            "fund_yi": safe_float(x.get("fund_yi")),
            "hs": safe_float(x.get("hs")),
            "reason": reason_map.get(x.get("code", ""), ""),
            **m, "low_pos": low_pos,
        })
        time.sleep(0.2)
    return out

def enrich_gain():
    out = []
    for x in gain_candidates:
        m = calc_metrics(x["code"])
        if not m:
            continue
        out.append({
            "code": x["code"], "name": x["name"], "chg_pct": x["chg_pct"],
            "reason": reason_map.get(x["code"], ""),
            **m,
        })
        time.sleep(0.2)
    return out

print("计算首板指标...")
fb = enrich_first_board()
print("计算突破候选指标...")
gb = enrich_gain()

# ===== 评分排序 =====
# 首板低位突破：优先"低位 + 均线突破/站上60日线"
fb_sorted = sorted(fb, key=lambda x: (
    (x["low_pos"] and (x["ma_bull"] or x["above_ma60"])),  # 低位+突破优先
    -x["drawdown"],  # 回撤越大越低位
    -(x["vol_ratio"] or 0),
), reverse=True)
# 修正排序：先按"低位且突破"降序，再回撤降序
fb_sorted = sorted(fb, key=lambda x: (1 if (x["low_pos"] and (x["ma_bull"] or x["above_ma60"])) else 0,
                                       x["drawdown"] if x["low_pos"] else 0), reverse=True)

# 突破放量热点：优先"均线多头 + 突破高点 + 放量"
gb_sorted = sorted(gb, key=lambda x: ((x["ma_bull"] and x["breakout"]), x["vol_ratio"]), reverse=True)

result = {
    "first_board": fb_sorted[:8],   # 多给几个候选
    "breakout": gb_sorted[:8],
}
dump_json(result, os.path.join(BASE, f"data/recommend_{TD}.json"))

print("\n===== 主板首板·低位突破候选 =====")
for x in fb_sorted[:8]:
    flag = "【低位+突破】" if (x["low_pos"] and (x["ma_bull"] or x["above_ma60"])) else ("【低位】" if x["low_pos"] else "")
    print(f"  {x['name']}({x['code']}) {x['hybk']} 回撤{x['drawdown']}% 60日{x['chg60']}% 量比{x['vol_ratio']} {flag} | {x['reason'][:30]}")

print("\n===== 主板突破+放量+热点候选 =====")
for x in gb_sorted[:8]:
    flag = "【多头+突破】" if (x["ma_bull"] and x["breakout"]) else ("【突破】" if x["breakout"] else "")
    print(f"  {x['name']}({x['code']}) 涨{x['chg_pct']}% 回撤{x['drawdown']}% 量比{x['vol_ratio']} {flag} | {x['reason'][:30]}")
