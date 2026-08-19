# -*- coding: utf-8 -*-
import os
"""A股行情数据采集脚本 v2 — requests 会话 + 分页 + 重试
目标交易日：2026-08-14（周五）
"""
import json
import sys
import time
import random
import requests
import argparse
from datetime import datetime

from _common import BASE, load_json, dump_json

ap = argparse.ArgumentParser(description="A股行情数据采集（默认真实今日，可用 --date 覆盖）")
ap.add_argument("--date", default=datetime.now().strftime("%Y%m%d"),
                help="目标交易日 YYYYMMDD，默认取真实今日")
_args = ap.parse_args()
TRADE_DATE = _args.date
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117.0.0.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA})

def http_get(url, referer=None, timeout=15, gbk=False, retries=3):
    headers = {"Referer": referer} if referer else {}
    for i in range(retries):
        try:
            r = S.get(url, headers=headers, timeout=timeout)
            r.encoding = "gbk" if gbk else "utf-8"
            return r.text
        except Exception as e:
            if i == retries - 1:
                raise
            time.sleep(1.5 * (i + 1))

def parse_indexes(text):
    out = []
    for line in text.strip().split(";"):
        if '="' not in line:
            continue
        vals = line.split('"')[1].split("~")
        if len(vals) < 40:
            continue
        out.append({
            "code": vals[2], "name": vals[1],
            "price": round(float(vals[3]), 2),
            "change_pct": round(float(vals[32]), 2) if vals[32] else 0,
            "change_amt": round(float(vals[31]), 2) if vals[31] else 0,
            "amount_yi": round(float(vals[37]) / 10000, 2) if vals[37] else 0,
        })
    return out

def fetch_pool(kind):
    name_map = {"ZT": "getTopicZTPool", "ZB": "getTopicZBPool", "DT": "getTopicDTPool"}
    url = (f"https://push2ex.eastmoney.com/{name_map[kind]}"
           f"?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt"
           f"&Pageindex=0&Pagesize=600&sort=fbt%3Aasc&date={TRADE_DATE}")
    d = json.loads(http_get(url, referer="https://quote.eastmoney.com/"))
    data = d.get("data") or {}
    return {"total": data.get("tc", 0), "pool": data.get("pool", [])}

def parse_pool(pool):
    out = []
    for p in pool:
        out.append({
            "code": p.get("c"), "name": p.get("n"),
            "price": round((p.get("p") or 0) / 1000, 2),
            "chg_pct": round(p.get("zdp") or 0, 2),
            "amount_yi": round((p.get("amount") or 0) / 1e8, 2),
            "lbc": p.get("lbc", 1),
            "zbc": p.get("zbc", 0),
            "fund_yi": round((p.get("fund") or 0) / 1e8, 2),
            "fbt": p.get("fbt"), "lbt": p.get("lbt"),
            "hs": round(p.get("hs") or 0, 2),
            "hybk": p.get("hybk", ""),
        })
    return out

def fetch_breadth():
    """分页拉全市场统计涨跌家数"""
    up = down = flat = 0
    total = 0
    pn = 1
    pz = 500
    while True:
        url = ("https://push2.eastmoney.com/api/qt/clist/get"
               f"?pn={pn}&pz={pz}&po=1&np=1&fltt=2&invt=2&fid=f3"
               "&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23"
               "&fields=f3")
        try:
            d = json.loads(http_get(url, referer="https://quote.eastmoney.com/"))
        except Exception:
            break
        data = d.get("data") or {}
        diff = data.get("diff", [])
        if not diff:
            break
        if total == 0:
            total = data.get("total", 0)
        for s in diff:
            c = s.get("f3")
            if c is None or c == "-":
                flat += 1
            elif c > 0:
                up += 1
            elif c < 0:
                down += 1
            else:
                flat += 1
        if pn * pz >= total:
            break
        pn += 1
        time.sleep(random.uniform(0.8, 1.1))
    if total == 0:
        raise RuntimeError("涨跌家数分页全部失败（push2 可能被风控）")
    # 分页中断保护：计数明显少于总量说明中途断页，视为失败（交由新浪兜底）
    if up + down + flat < total * 0.9:
        raise RuntimeError(f"涨跌家数分页中断：仅统计 {up + down + flat}/{total}")
    return {"total": total, "up": up, "down": down, "flat": flat}

def fetch_sectors():
    result = {}
    for t, key in [("2", "industry"), ("3", "concept")]:
        url = ("https://push2.eastmoney.com/api/qt/clist/get"
               f"?fid=f3&po=1&pz=100&pn=1&np=1&fltt=2&invt=2"
               f"&fs=m:90+t:{t}"
               "&fields=f12,f14,f2,f3,f62,f104,f105,f128,f136,f140")
        d = json.loads(http_get(url, referer="https://quote.eastmoney.com/"))
        diff = (d.get("data") or {}).get("diff", [])
        rows = []
        for s in diff:
            rows.append({
                "code": s.get("f12"), "name": s.get("f14"),
                "chg_pct": s.get("f3"),
                "main_net_yi": round((s.get("f62") or 0) / 1e8, 2),
                "up": s.get("f104"), "down": s.get("f105"),
                "leader_name": s.get("f140"),
                "leader_chg": s.get("f136"),
            })
        result[key] = rows
        time.sleep(random.uniform(0.8, 1.1))
    return result

def fetch_fund_rank():
    url = ("https://push2.eastmoney.com/api/qt/clist/get"
           "?fid=f62&po=1&pz=30&pn=1&np=1&fltt=2&invt=2"
           "&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23"
           "&fields=f12,f14,f2,f3,f62,f184")
    d = json.loads(http_get(url, referer="https://quote.eastmoney.com/"))
    diff = (d.get("data") or {}).get("diff", [])
    rows = []
    for s in diff:
        rows.append({
            "code": s.get("f12"), "name": s.get("f14"),
            "price": s.get("f2"), "chg_pct": s.get("f3"),
            "main_net_yi": round((s.get("f62") or 0) / 1e8, 2),
            "main_ratio": s.get("f184"),
        })
    return rows

def fetch_hot_reason():
    date = f"{TRADE_DATE[:4]}-{TRADE_DATE[4:6]}-{TRADE_DATE[6:8]}"
    url = (f"http://zx.10jqka.com.cn/event/api/getharden/"
           f"date/{date}/orderby/date/orderway/desc/charset/GBK/")
    d = json.loads(http_get(url, referer="http://www.10jqka.com.cn/", timeout=12))
    rows = []
    for r in (d.get("data") or []):
        rows.append({
            "code": r.get("code"), "name": r.get("name"),
            "reason": r.get("reason", ""),
            "chg_pct": r.get("zhangfu"),
            "hs": r.get("huanshou"),
            "amount": r.get("chengjiaoe"),
        })
    return {"rows": rows}

def main():
    result = {"trade_date": f"{TRADE_DATE[:4]}-{TRADE_DATE[4:6]}-{TRADE_DATE[6:8]}", "collected_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    errors = {}

    def safe(key, fn):
        try:
            result[key] = fn()
            print(f"  ✓ {key}")
        except Exception as e:
            errors[key] = str(e)
            print(f"  ✗ {key}: {e}")

    print("[1/6] 指数")
    safe("indexes", lambda: parse_indexes(http_get(
        "https://qt.gtimg.cn/q=sh000001,sz399001,sz399006,sh000688,sh000300,sh000905,sh000852,sh000016",
        gbk=True)))
    def fetch_pool_group(kind):
        """单次拉取涨停/炸板/跌停池，避免重复请求导致 total 与 pool 不一致。"""
        p = fetch_pool(kind)
        return {"total": p["total"], "list": parse_pool(p["pool"])}

    print("[2/6] 涨停池")
    safe("limit_up", lambda: fetch_pool_group("ZT"))
    time.sleep(1)
    print("[3/6] 炸板池")
    safe("broken", lambda: fetch_pool_group("ZB"))
    time.sleep(1)
    print("[4/6] 跌停池")
    safe("limit_down", lambda: fetch_pool_group("DT"))
    time.sleep(1)
    print("[5/6] 涨跌家数(分页)")
    safe("breadth", fetch_breadth)
    print("[6/6] 板块/资金/强势股")
    safe("sectors", fetch_sectors)
    safe("fund_rank", fetch_fund_rank)
    safe("hot_reason", fetch_hot_reason)

    result["errors"] = errors
    path = os.path.join(BASE, f"data/market_{TRADE_DATE}.json")

    # 合并模式：本次失败的项保留旧文件值（标记 stale_kept），避免重跑挤掉上次成功数据
    prev = load_json(path, {}) if os.path.exists(path) else {}
    stale_kept = []
    for key in ("indexes", "limit_up", "broken", "limit_down",
                "breadth", "sectors", "fund_rank", "hot_reason"):
        if key not in result and prev.get(key):
            result[key] = prev[key]
            stale_kept.append(key)
    if stale_kept:
        result["stale_kept"] = stale_kept
        print(f"  !! 本次失败、沿用旧值的项: {stale_kept}")
    dump_json(result, path)

    print("\n===== 采集完成 =====")
    if result.get("indexes"):
        for x in result["indexes"][:3]:
            print(f"  {x['name']}: {x['price']} ({x['change_pct']:+}%)")
    print(f"  涨停 {result.get('limit_up',{}).get('total')} | 炸板 {result.get('broken',{}).get('total')} | "
          f"跌停 {result.get('limit_down',{}).get('total')}")
    if result.get("breadth"):
        b = result["breadth"]
        print(f"  涨跌家数: 涨{b['up']} 跌{b['down']} 平{b['flat']} (共{b['total']})")
    if errors:
        print("  未成功项:", list(errors.keys()))

    # 关键项（指数/涨停/炸板）缺失且无旧值兜底 → 非零退出，编排层可感知
    critical_missing = [k for k in ("indexes", "limit_up", "broken") if not result.get(k)]
    if critical_missing:
        print(f"  !! 关键数据缺失: {critical_missing}")
        sys.exit(1)

if __name__ == "__main__":
    main()
