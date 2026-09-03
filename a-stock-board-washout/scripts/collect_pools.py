# -*- coding: utf-8 -*-
"""采集涨停/炸板/跌停池（东财）+ 涨停原因（同花顺）-> data/pools_{T}.json

目标日 T（最近结束交易日）与上一交易日 T0 由「周末回退 + 涨停池非空回溯」自动判定，
--date YYYYMMDD 可显式覆盖 T。
"""
import os
import sys
import json
import time
import random
import argparse
import requests

from _common import BASE, dump_json_guard, fmt_dash, latest_trade_day

ap = argparse.ArgumentParser(description="采集涨停/炸板/跌停池（东财）+ 涨停原因（同花顺）")
ap.add_argument("--date", default=latest_trade_day(),
                help="目标交易日 YYYYMMDD（默认最近结束交易日）")
_args = ap.parse_args()
TD = _args.date

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "Chrome/117.0.0.0 Safari/537.36")
S = requests.Session()
S.headers.update({"User-Agent": UA})


def http_get(url, referer=None, timeout=15, retries=3):
    headers = {"Referer": referer} if referer else {}
    for i in range(retries):
        try:
            r = S.get(url, headers=headers, timeout=timeout)
            return r.text
        except Exception as e:
            if i == retries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def fetch_pool(kind, date):
    """东财某日涨停/炸板/跌停池。kind: ZT/ZB/DT。返回 {total, list[...]} 或 None(异常/无数据)。"""
    name_map = {"ZT": "getTopicZTPool", "ZB": "getTopicZBPool", "DT": "getTopicDTPool"}
    url = (f"https://push2ex.eastmoney.com/{name_map[kind]}"
           f"?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt"
           f"&Pageindex=0&Pagesize=800&sort=fbt%3Aasc&date={date}")
    try:
        d = json.loads(http_get(url, referer="https://quote.eastmoney.com/"))
    except Exception as e:
        print(f"    ✗ {kind}@{date} 拉取异常: {e}")
        return None
    data = d.get("data") or {}
    pool = data.get("pool") or []
    rows = []
    for p in pool:
        rows.append({
            "code": p.get("c"), "name": p.get("n"),
            "price": round((p.get("p") or 0) / 1000, 2),
            "chg_pct": round(p.get("zdp") or 0, 2),
            "amount_yi": round((p.get("amount") or 0) / 1e8, 2),
            "lbc": p.get("lbc", 1),
            "zbc": p.get("zbc", 0),
            "fund_yi": round((p.get("fund") or 0) / 1e8, 2),
            "fbt": p.get("fbt"), "lbt": p.get("lbt"),
            "hs": round(p.get("hs") or 0, 2),
            "hybk": p.get("hybk", "") or "",
            "zt_days": p.get("days") or 0,
        })
    return {"total": data.get("tc", len(rows)), "date": fmt_dash(date), "list": rows}


def pool_has_data(date):
    """探测某日是否交易日（涨停池有数据）。"""
    r = fetch_pool("ZT", date)
    return bool(r and r["total"] > 0)


def resolve_dates(target):
    """确定 T 与 T0（均为最近有涨停池数据的交易日）：
    T = target 起逐日回退直到 ZT 池非空（兜底 12 天）；
    T0 = T 起向前回退直到 ZT 池非空且日期 < T（可能为 None）。"""
    from datetime import datetime as _dt, timedelta as _td

    def prev_workday(d):
        dd = _dt.strptime(d, "%Y%m%d") - _td(days=1)
        while dd.weekday() >= 5:
            dd -= _td(days=1)
        return dd.strftime("%Y%m%d")

    t = target
    for _ in range(12):
        if pool_has_data(t):
            break
        t = prev_workday(t)
    else:
        raise SystemExit(f"!! 无法找到有涨停池数据的交易日（自 {target} 回溯 12 天），请检查网络或 --date")

    t0 = None
    probe = t
    for _ in range(12):
        probe = prev_workday(probe)
        if pool_has_data(probe):
            t0 = probe
            break
    return t, t0


def fetch_hot_reason(date):
    """同花顺涨停原因 -> {code: reason}。失败返回 {}。"""
    d = fmt_dash(date)
    url = (f"http://zx.10jqka.com.cn/event/api/getharden/"
           f"date/{d}/orderby/date/orderway/desc/charset/GBK/")
    try:
        txt = http_get(url, referer="http://www.10jqka.com.cn/", timeout=12)
        arr = json.loads(txt)
        return {str(r.get("code", "")): (r.get("reason", "") or "")
                for r in (arr.get("data") or [])}
    except Exception as e:
        print(f"  ✗ 涨停原因({date}) 拉取失败: {e}")
        return {}


def build_pool_json():
    t, t0 = resolve_dates(TD)
    print(f"目标日 T = {t} ({fmt_dash(t)})  上一交易日 T0 = {t0 or '无'}")

    out = {"T": t, "T0": t0, "collected_at": time.strftime("%Y-%m-%d %H:%M:%S")}

    def fetch_day(date, key):
        day = {}
        for kind, k in [("ZT", "limit_up"), ("ZB", "broken"), ("DT", "limit_down")]:
            r = fetch_pool(kind, date)
            day[k] = r if r else []
            time.sleep(random.uniform(0.5, 0.8))
        out[key] = day

    if t0:
        fetch_day(t0, "T0_pool")
    else:
        out["T0_pool"] = {}
    fetch_day(t, "T_pool")

    out["hot_reason_T0"] = fetch_hot_reason(t0) if t0 else {}
    time.sleep(0.5)
    out["hot_reason_T"] = fetch_hot_reason(t)

    path = os.path.join(BASE, f"data/pools_{t}.json")
    if not dump_json_guard(out, path, "pools"):
        sys.exit(1)
    print(f"  写入 {path}")
    print(f"  T 涨停池 {out['T_pool'].get('limit_up', {}).get('total', 0)} | "
          f"T0 涨停池 {out.get('T0_pool', {}).get('limit_up', {}).get('total', 0)}")


if __name__ == "__main__":
    build_pool_json()
    print("===== 池采集完成 =====")