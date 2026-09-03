# -*- coding: utf-8 -*-
"""采集目标交易日全天东财快讯，供行情报告「重点政策/消息」章节做关键词筛选。

用法：python collect_news.py [--date YYYYMMDD]
  默认取真实今日（datetime.now()）。盘中采集以「当前时刻」为游标起点往回翻，
  历史日采集以「当日 15:00」为起点，翻到当日 8:30 之前停止。
"""
import os
import sys
import datetime
import uuid
import argparse
import requests

from _common import BASE, DATA_DIR, dump_json

ap = argparse.ArgumentParser(description="采集目标交易日东财快讯 -> data/news_{date}.json")
ap.add_argument("--date", default=datetime.datetime.now().strftime("%Y%m%d"),
                help="目标交易日 YYYYMMDD，默认取真实今日")
args = ap.parse_args()
TD = args.date
Y, M, D = int(TD[:4]), int(TD[4:6]), int(TD[6:8])
DATE_STR = f"{Y}-{M:02d}-{D:02d}"

S = requests.Session()
S.headers.update({"User-Agent": "Mozilla/5.0", "Referer": "https://kuaixun.eastmoney.com/"})

def ts(dt):
    return int(dt.timestamp() * 1000000)

day_end = ts(datetime.datetime(Y, M, D, 15, 0, 0))
now_ts = ts(datetime.datetime.now())
start_ts = min(now_ts, day_end)
floor_ts = ts(datetime.datetime(Y, M, D, 8, 30, 0))

all_news = []
cursor = start_ts
for _ in range(15):  # 最多翻 15 页
    url = "https://np-weblist.eastmoney.com/comm/web/getFastNewsList"
    params = {"client": "web", "biz": "web_724", "fastColumn": "102",
              "sortEnd": str(cursor), "pageSize": "100", "req_trace": str(uuid.uuid4())}
    try:
        d = S.get(url, params=params, timeout=15).json()
    except Exception as e:
        print("请求失败:", e)
        break
    data = d.get("data") or {}
    lst = data.get("fastNewsList", [])
    if not lst:
        break
    all_news.extend(lst)
    cursor = data.get("sortEnd", "")
    earliest = min((int(n["realSort"]) for n in lst if n.get("realSort")), default=floor_ts)
    if earliest < floor_ts:
        break

# 去重
seen = set()
uniq = []
for n in all_news:
    c = n["code"]
    if c not in seen:
        seen.add(c)
        uniq.append(n)
print(f"共拉取 {len(all_news)} 条，去重后 {len(uniq)} 条")

# 只保留目标日当天
day_news = [n for n in uniq if n["showTime"].startswith(DATE_STR)]
print(f"{DATE_STR} 当天 {len(day_news)} 条")

out = os.path.join(DATA_DIR, f"news_{TD}.json")
if not day_news:
    # 空结果不覆盖旧文件（接口失败或翻页中断），交由健康检查兜底
    if os.path.exists(out):
        print(f"  !! 当日快讯为 0 条，保留旧文件 {os.path.basename(out)}")
    else:
        print("  !! 当日快讯为 0 条，未落盘")
    sys.exit(1)
dump_json(day_news, out)
print(f"已写入 {out}")

# 打印标题（供人工核对）
print(f"\n=== {DATE_STR} 快讯标题（按时间倒序，前 60 条） ===")
for n in day_news[:60]:
    print(f"  {n['showTime'][11:16]} | {n['title'][:70]}")
