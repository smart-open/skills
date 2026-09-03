# -*- coding: utf-8 -*-
"""拉 15 个交易日涨停股（同花顺强势股 reason），按概念板块匹配涨停数。
关键词 = 14 核心同花顺短名 + boards_15d 全部动态板块名 + 当日 hot_sectors 热点名，
使轮动表 ×N 对动态热点同样有效。
boards_15d 缺失时按工作日日历回溯兜底；采集全失败不落盘（保留旧数据）并 exit 1。
使用 urllib（内置库），避免第三方请求库触发代理配额。
"""
import os
import sys
import json
import time
import urllib.request
from datetime import datetime, timedelta

from _common import (BASE, DATA_DIR, load_json, dump_json_guard, today_ymd,
                     THS_BOARD_KEYWORDS)

boards = load_json(os.path.join(DATA_DIR, "boards_15d.json"))
all_dates = set()
for v in boards.values():
    for d, _ in v:
        all_dates.add(d)
dates = sorted(all_dates)[-15:]

if not dates:
    # boards_15d 缺失/为空：按工作日日历回溯 15 日兜底
    d = datetime.now()
    cnt = 0
    cal = []
    while cnt < 15:
        if d.weekday() < 5:
            cal.append(d.strftime("%Y%m%d"))
            cnt += 1
        d -= timedelta(days=1)
    dates = sorted(cal)
    print("  !! boards_15d 为空，按工作日日历回溯 15 日兜底")

# 关键词映射：THS 14 短名为基础，动态并入 boards_15d 板块名与当日热点名
kw_map = dict(THS_BOARD_KEYWORDS)
for name in boards.keys():
    if name:
        kw_map.setdefault(name, [name])
_hs = load_json(os.path.join(DATA_DIR, f"hot_sectors_{today_ymd()}.json"))
for s in (_hs.get("hot_sectors") or []):
    nm = s.get("name")
    if nm:
        kw_map.setdefault(nm, [nm])


def fetch_reason(date):
    d = f"{date[:4]}-{date[4:6]}-{date[6:]}"
    url = f"http://zx.10jqka.com.cn/event/api/getharden/date/{d}/orderby/date/orderway/desc/charset/GBK/"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0",
        "Referer": "http://www.10jqka.com.cn/"
    })
    for _ in range(2):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8", "ignore")).get("data", [])
        except Exception as e:
            last = e
            time.sleep(1)
    print(f"  !! {d} 拉取失败: {last}")
    return []

result = {}
pools = {}
total_stocks = 0
for date in dates:
    stocks = fetch_reason(date)
    counts = {}
    pool = []
    for s in stocks:
        reason = s.get("reason", "")
        for board, kws in kw_map.items():
            if any(k in reason for k in kws):
                counts[board] = counts.get(board, 0) + 1
        code = str(s.get("code") or s.get("c") or "").strip()
        if code:
            pool.append({"code": code.zfill(6), "lbc": int(s.get("lbc", 1) or 1)})
    result[date] = counts
    pools[date] = pool
    total_stocks += len(pool)
    d = f"{date[4:6]}-{date[6:]}"
    top = sorted(counts.items(), key=lambda x: -x[1])[:4]
    print(f"  {d}: 涨停 {len(stocks)} 只, 匹配板块 {len(counts)} 个, 前4: {top}")
    time.sleep(0.4)

# 全部日期均拉取失败（0 只涨停股）→ 接口异常，不落盘
if total_stocks == 0:
    print("  !! 全部日期涨停股为 0，疑似同花顺接口失败，保留旧数据")
    sys.exit(1)

ok1 = dump_json_guard(result, os.path.join(DATA_DIR, "zt_15d.json"), "涨停板块计数")
ok2 = dump_json_guard(pools, os.path.join(DATA_DIR, "zt_pool_15d.json"), "涨停池个股")
if not (ok1 and ok2):
    sys.exit(1)
print(f"\n完成，共 {len(result)} 个交易日 -> data/zt_15d.json（板块计数）+ data/zt_pool_15d.json（涨停池个股，供赚钱效应）")
