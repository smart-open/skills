# -*- coding: utf-8 -*-
"""采集东财板块（行业+概念）主力资金流历史（近 N 日），落地 data/fund_15d.json。
   key = 板块名称（与 gen_hot_sectors 动态热点名对齐，可取东财行业/概念板块名），
   value = {YYYYMMDD: 主力净流入(亿, 保留 2 位)}。
   用法：python scripts/collect_fund_15d.py --top 40 --days 15
   数据源：主源东财 fflow（push2his）；东财失败时兜底同花顺板块指数涨跌幅作「资金方向代理」
          （资金流与涨跌幅正相关，方向一致，仅作降级近似，保证数据不空缺）。
   依赖：urllib 无 requests；单板块/单日失败均降级跳过，保证部分数据可用。
"""
import os
import sys
import json
import time
import argparse
import urllib.request

from _common import (BASE, DATA_DIR, dump_json, dump_json_guard,
                     fetch_ths_board_codes, ths_board_chg_history)

ap = argparse.ArgumentParser(description="采集东财板块主力资金流历史")
ap.add_argument("--top", type=int, default=40, help="采集资金活跃度前 N 的板块（默认 40）")
ap.add_argument("--days", type=int, default=15, help="回溯交易日天数（默认 15）")
_args = ap.parse_args()
TOP = _args.top
DAYS = _args.days

BOARD_MARKET = "90"  # 东财板块 secid 市场前缀（行业/概念均用 90）
UT = "b2884a393a59ad64002292a3e90d46a5"
# 备用 UT（东财 fflow 主 UT 失效时轮换重试，规避单 token 风控）
UT_BACKUPS = ["fa5fd1943c7b386f172d6893dbbd1d0c", "7eea3edcaed734bea9cbfc24409ed989"]


def http_json(url, referer="https://data.eastmoney.com/", retries=3):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": referer,
    })
    last = None
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8", "ignore"))
        except Exception as e:
            last = e
            time.sleep(1.2)
    if last:
        raise last
    return {}


def fetch_board_list(top):
    """按今日主力净流入降序，拉取行业+概念板块列表 [{名称, secid, 今日资金亿}]。"""
    rows = []
    for fs in ("m:90+t:3+f:!50", "m:90+t:2+f:!50"):
        url = ("https://push2.eastmoney.com/api/qt/clist/get"
               f"?fid=f62&po=1&pz={top}&pn=1&np=1&fltt=2&invt=2&ut={UT}"
               f"&fs={fs}&fields=f12,f14,f3,f62")
        try:
            d = http_json(url, referer="https://data.eastmoney.com/")
            diff = (d.get("data") or {}).get("diff", [])
            for s in diff:
                code = s.get("f12") or ""
                name = s.get("f14") or ""
                if not code or not name:
                    continue
                rows.append({
                    "name": name,
                    "secid": f"{BOARD_MARKET}.{code}",
                    "fund_today_yi": round((s.get("f62") or 0) / 1e8, 2),
                })
        except Exception as e:
            print(f"  !! 板块列表 {fs} 拉取失败: {e}")
        time.sleep(0.6)
    # 去重（概念与行业可能同名），保留资金绝对值更大的
    merged = {}
    for r in rows:
        key = r["name"]
        if key not in merged or abs(r["fund_today_yi"]) > abs(merged[key]["fund_today_yi"]):
            merged[key] = r
    ranked = sorted(merged.values(), key=lambda x: -abs(x["fund_today_yi"]))[:top]
    return ranked


def fetch_fund_history(secid, days):
    """东财 push2his 板块资金流日线，返回 {YYYYMMDD: 主力净流入(亿)}。
    主 UT 失败时轮换备用 UT 重试，全部失败返回 {}。"""
    for ut in (UT, *UT_BACKUPS):
        url = ("https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
               f"?lmt=0&klt=101&secid={secid}"
               "&fields1=f1,f2,f3,f7"
               "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65"
               f"&ut={ut}")
        try:
            d = http_json(url)
        except Exception:
            continue
        klines = ((d.get("data") or {}).get("klines")) or []
        if klines:
            out = {}
            for line in klines[-days:]:
                p = line.split(",")
                if len(p) < 2:
                    continue
                date = p[0].replace("-", "")
                try:
                    # f52 = 主力净流入(元) → 亿
                    out[date] = round(float(p[1]) / 1e8, 2)
                except (ValueError, IndexError):
                    continue
            return out
    return {}


def resolve_ths_code(name):
    """东财板块名 → 同花顺板块代码（兜底用）。精确同名 → 去后缀 → 双向包含，命中返回代码。"""
    codes = fetch_ths_board_codes()
    if not codes:
        return None
    if name in codes:
        return codes[name]
    stripped = name
    for suf in ("概念", "板块", "行业", "指数"):
        if stripped.endswith(suf):
            stripped = stripped[:-len(suf)]
            if stripped in codes:
                return codes[stripped]
    for ths_name, code in codes.items():
        if ths_name and (ths_name in name or name in ths_name):
            return code
    return None


def main():
    print(f"[collect_fund_15d] 拉取东财板块资金流历史（Top {TOP} × 近 {DAYS} 日，兜底：同花顺指数代理）")
    boards = fetch_board_list(TOP)
    print(f"  板块列表：{len(boards)} 个")
    if not boards:
        print("  !! 板块列表拉取失败（东财 push2 可能被风控），终止，旧数据不动")
        sys.exit(1)
    ths_codes = fetch_ths_board_codes()
    print(f"  同花顺板块代码映射：{len(ths_codes)} 个（兜底源）")
    result = {}
    fallback_cnt = 0
    for i, b in enumerate(boards, 1):
        src = "东财"
        hist = {}
        try:
            hist = fetch_fund_history(b["secid"], DAYS)
        except Exception:
            hist = {}
        if not hist:
            # 兜底：同花顺板块指数涨跌幅作资金方向代理（正负与资金流方向一致）
            ths_code = resolve_ths_code(b["name"])
            chg = ths_board_chg_history(ths_code, DAYS) if ths_code else []
            if chg:
                hist = {d: v for d, v in chg if v != 0}   # 仅保留非零涨跌日（方向信号）
                src = "同花顺代理"
                fallback_cnt += 1
        if hist:
            result[b["name"]] = hist
            latest = sorted(hist.items())[-1] if hist else ("", 0.0)
            print(f"  [{i:2d}/{len(boards)}] {b['name']}  近{len(hist)}日 "
                  f"最新 {latest[0]} 主力 {latest[1]:+.2f}亿 [{src}]")
        else:
            print(f"  [{i:2d}/{len(boards)}] {b['name']}  无历史数据")
        time.sleep(0.5)

    # 成功率过低视为接口异常（push2his 风控），不覆盖旧数据
    if result and len(result) < len(boards) * 0.3:
        print(f"  !! 成功率过低（{len(result)}/{len(boards)}），疑似接口风控，保留旧数据")
        sys.exit(1)
    if not dump_json_guard(result, os.path.join(DATA_DIR, "fund_15d.json"), "板块资金流历史"):
        sys.exit(1)
    print(f"\n完成：共 {len(result)} 个板块（同花顺代理 {fallback_cnt} 个）→ data/fund_15d.json")


if __name__ == "__main__":
    main()