# -*- coding: utf-8 -*-
"""采集东财板块（行业+概念）主力资金流历史（近 N 日），落地 data/fund_15d.json。
   key = 板块名称（与 gen_hot_sectors 动态热点名对齐，可取东财行业/概念板块名），
   value = {YYYYMMDD: 主力净流入(亿, 保留 2 位)}。
   用法：python scripts/collect_fund_15d.py --top 40 --days 15
   依赖：push2(push2his) 东财公开接口；单板块/单日失败均降级跳过，保证部分数据可用。
"""
import os
import sys
import json
import time
import argparse
import urllib.request

from _common import BASE, DATA_DIR, dump_json, dump_json_guard

ap = argparse.ArgumentParser(description="采集东财板块主力资金流历史")
ap.add_argument("--top", type=int, default=40, help="采集资金活跃度前 N 的板块（默认 40）")
ap.add_argument("--days", type=int, default=15, help="回溯交易日天数（默认 15）")
_args = ap.parse_args()
TOP = _args.top
DAYS = _args.days

BOARD_MARKET = "90"  # 东财板块 secid 市场前缀（行业/概念均用 90）
UT = "b2884a393a59ad64002292a3e90d46a5"


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
    """东财 push2his 板块资金流日线，返回 {YYYYMMDD: 主力净流入(亿)}。"""
    url = ("https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
           f"?lmt=0&klt=101&secid={secid}"
           "&fields1=f1,f2,f3,f7"
           "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65"
           f"&ut={UT}")
    d = http_json(url)
    klines = ((d.get("data") or {}).get("klines")) or []
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


def main():
    print(f"[collect_fund_15d] 拉取东财板块资金流历史（Top {TOP} × 近 {DAYS} 日）")
    boards = fetch_board_list(TOP)
    print(f"  板块列表：{len(boards)} 个")
    if not boards:
        print("  !! 板块列表拉取失败（东财 push2 可能被风控），终止，旧数据不动")
        sys.exit(1)
    result = {}
    for i, b in enumerate(boards, 1):
        try:
            hist = fetch_fund_history(b["secid"], DAYS)
            if hist:
                result[b["name"]] = hist
                latest = sorted(hist.items())[-1] if hist else ("", 0.0)
                print(f"  [{i:2d}/{len(boards)}] {b['name']}  近{len(hist)}日 "
                      f"最新 {latest[0]} 主力 {latest[1]:+.2f}亿")
            else:
                print(f"  [{i:2d}/{len(boards)}] {b['name']}  无历史数据")
        except Exception as e:
            print(f"  [{i:2d}/{len(boards)}] {b['name']}  失败: {e}")
        time.sleep(0.5)

    # 成功率过低视为接口异常（push2his 风控），不覆盖旧数据
    if result and len(result) < len(boards) * 0.3:
        print(f"  !! 成功率过低（{len(result)}/{len(boards)}），疑似接口风控，保留旧数据")
        sys.exit(1)
    if not dump_json_guard(result, os.path.join(DATA_DIR, "fund_15d.json"), "板块资金流历史"):
        sys.exit(1)
    print(f"\n完成：共 {len(result)} 个板块 → data/fund_15d.json")


if __name__ == "__main__":
    main()