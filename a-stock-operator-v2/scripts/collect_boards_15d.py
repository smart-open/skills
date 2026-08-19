# -*- coding: utf-8 -*-
"""动态采集「东财行业+概念」板块近 15 日涨幅历史，落地 data/boards_15d.json。
   key = 东财板块名（与 gen_hot_sectors 动态热点名对齐），value = [(YYYYMMDD, 涨跌幅%), ...]。
   消除原「14 核心同花顺板块」覆盖上限：全新热点（如固态电池/飞行汽车）自动纳入涨幅历史。
   用法：python scripts/collect_boards_15d.py [--top N] [--days 15]
   依赖：东财 push2his 公开接口（urllib，无 requests 依赖）；单板块失败降级跳过，保证部分数据可用。
"""
import os
import sys
import time
import json
import argparse
import urllib.request
from datetime import datetime, timedelta

from _common import BASE, dump_json, dump_json_guard, safe_float

ap = argparse.ArgumentParser(description="采集东财行业+概念板块近15日涨幅历史")
ap.add_argument("--top", type=int, default=0, help="仅采集按今日主力净流入绝对值前 N 的板块（0=全部）")
ap.add_argument("--days", type=int, default=15, help="回溯交易日天数（默认 15）")
_args = ap.parse_args()
TOP = _args.top
DAYS = _args.days

BOARD_MARKET = "90"  # 东财板块 secid 市场前缀（行业/概念均用 90）
UT = "fa5fd1943c7b386f172d6893dbbd1d0c"


def http_json(url, referer="https://quote.eastmoney.com/", retries=3):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": referer,
    })
    for _ in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8", "ignore"))
        except Exception:
            time.sleep(1.2)
    return {}


def fetch_board_list():
    """东财行业+概念板块全量清单 [{name, code}]，按今日主力净流入绝对值降序。"""
    merged = {}
    for fs in ("m:90+t:3+f:!50", "m:90+t:2+f:!50"):
        url = ("https://push2.eastmoney.com/api/qt/clist/get"
               f"?fid=f62&po=1&pz=500&pn=1&np=1&fltt=2&invt=2&ut={UT}"
               f"&fs={fs}&fields=f12,f14,f62")
        try:
            d = http_json(url)
        except Exception:
            continue
        for s in ((d.get("data") or {}).get("diff", [])):
            code = s.get("f12") or ""
            name = s.get("f14") or ""
            if not code or not name:
                continue
            f62 = safe_float(s.get("f62"))
            cur = {"name": name, "code": code, "fund": abs(f62)}
            if name not in merged or cur["fund"] > merged[name]["fund"]:
                merged[name] = cur
        time.sleep(0.5)
    return sorted(merged.values(), key=lambda x: -x["fund"])


def fetch_kline(code):
    """东财 push2his 板块日线，返回 [(YYYYMMDD, 涨跌幅%), ...]，取最近 DAYS+1 根。"""
    end_dt = datetime.now()
    beg_dt = end_dt - timedelta(days=DAYS * 2 + 15)  # 覆盖 DAYS 个交易日绰绰有余
    url = ("https://push2his.eastmoney.com/api/qt/stock/kline/get"
           f"?secid={BOARD_MARKET}.{code}"
           "&fields1=f1,f2,f3,f4,f5,f6"
           "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
           f"&klt=101&fqt=1&beg={beg_dt.strftime('%Y%m%d')}&end={end_dt.strftime('%Y%m%d')}"
           f"&ut={UT}")
    try:
        d = http_json(url)
    except Exception:
        return []
    klines = ((d.get("data") or {}).get("klines")) or []
    out = []
    for line in klines[-DAYS:]:
        p = line.split(",")
        if len(p) < 9:
            continue
        date = p[0].replace("-", "")
        try:
            out.append((date, round(float(p[8]), 2)))  # f59 涨跌幅
        except (ValueError, IndexError):
            continue
    return out


def main():
    print(f"[collect_boards_15d] 拉取东财行业+概念板块近 {DAYS} 日涨幅历史")
    boards = fetch_board_list()
    if TOP and TOP > 0:
        boards = boards[:TOP]
    print(f"  板块列表：{len(boards)} 个")
    if not boards:
        print("  !! 板块列表拉取失败（东财 push2 可能被风控），终止，旧数据不动")
        sys.exit(1)
    result = {}
    for i, b in enumerate(boards, 1):
        k = fetch_kline(b["code"])
        if k:
            result[b["name"]] = k
        elif i <= 20 or i % 50 == 0:
            print(f"  [{i:3d}/{len(boards)}] {b['name']}  无历史数据")
        if i % 50 == 0:
            print(f"  ...已处理 {i}/{len(boards)}，成功 {len(result)}")
        time.sleep(0.25)

    # 部分失败保护：成功率过低视为接口异常，不覆盖旧数据
    if result and len(result) < len(boards) * 0.3:
        print(f"  !! 成功率过低（{len(result)}/{len(boards)}），疑似接口风控，保留旧数据")
        sys.exit(1)
    if not dump_json_guard(result, os.path.join(BASE, "data/boards_15d.json"), "板块涨幅历史"):
        sys.exit(1)
    print(f"\n完成：共 {len(result)}/{len(boards)} 个板块 → data/boards_15d.json")


if __name__ == "__main__":
    main()