# -*- coding: utf-8 -*-
import os
import sys
from _common import BASE, load_json, dump_json
"""补充采集：新浪涨跌家数/涨跌幅榜/行业板块 + 东财资金排行(重试)"""
import json
import time
import random
import requests
import argparse
from datetime import datetime

ap = argparse.ArgumentParser(description="补充采集：新浪涨跌家数/涨跌幅榜/行业板块 + 东财资金排行，合并进 market_{date}.json")
ap.add_argument("--date", default=datetime.now().strftime("%Y%m%d"),
                help="目标交易日 YYYYMMDD，默认取真实今日")
_args = ap.parse_args()
TD = _args.date

S = requests.Session()
S.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117.0.0.0 Safari/537.36",
    "Referer": "https://finance.sina.com.cn",
})

def sina_get(url, retries=3):
    for i in range(retries):
        try:
            r = S.get(url, timeout=15)
            return r.text
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(1.5)

# ===== 1. 新浪全市场：涨跌家数 + 涨跌幅榜 =====
def fetch_breadth_rank():
    total = int(json.loads(sina_get(
        "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hs_a")))
    up = down = flat = 0
    page = 1
    num = 100
    while (page - 1) * num < total:
        url = (f"https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
               f"Market_Center.getHQNodeData?page={page}&num={num}&sort=symbol&asc=1&node=hs_a")
        rows = json.loads(sina_get(url))
        if not rows:
            break
        for r in rows:
            cp = r.get("changepercent")
            if cp is None or cp == "":
                flat += 1
            elif float(cp) > 0:
                up += 1
            elif float(cp) < 0:
                down += 1
            else:
                flat += 1
        page += 1
        time.sleep(random.uniform(0.3, 0.6))
    # 涨幅榜 TOP20
    top_url = (f"https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
               f"Market_Center.getHQNodeData?page=1&num=20&sort=changepercent&asc=0&node=hs_a")
    top = [{"code": r["code"], "name": r["name"], "chg": r["changepercent"],
            "price": r["trade"]} for r in json.loads(sina_get(top_url))]
    # 跌幅榜 TOP20
    bottom_url = (f"https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
                  f"Market_Center.getHQNodeData?page=1&num=20&sort=changepercent&asc=1&node=hs_a")
    bottom = [{"code": r["code"], "name": r["name"], "chg": r["changepercent"],
               "price": r["trade"]} for r in json.loads(sina_get(bottom_url))]
    return {"total": total, "up": up, "down": down, "flat": flat,
            "top_gainers": top, "top_losers": bottom}

# ===== 2. 新浪行业板块排行 =====
def fetch_sina_sectors():
    text = sina_get("https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php")
    # 提取 {...} JSON 部分（非 JSON 返回时降级为空列表）
    try:
        start = text.index("{")
        end = text.rindex("}")
        obj = json.loads(text[start:end + 1])
    except (ValueError, TypeError):
        return []
    rows = []
    for v in obj.values():
        parts = v.split(",")
        if len(parts) < 9:
            continue
        rows.append({
            "code": parts[0], "name": parts[1],
            "count": parts[2],
            "chg_pct": round(float(parts[4]), 2),
            "amount": parts[7],
            "leader_code": parts[8],
            "leader_name": parts[-1] if len(parts) > 9 else "",
        })
    rows.sort(key=lambda x: x["chg_pct"], reverse=True)
    return rows

# ===== 3. 东财资金排行（重试，多 ut） =====
def fetch_fund_rank():
    for ut in ["b2884a393a59ad64002292a3e90d46a5", "bd1d9ddb04089700cf9c27f6f7426281"]:
        url = ("https://push2.eastmoney.com/api/qt/clist/get"
               f"?fid=f62&po=1&pz=20&pn=1&np=1&fltt=2&invt=2&ut={ut}"
               "&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23"
               "&fields=f12,f14,f2,f3,f62")
        try:
            d = json.loads(S.get(url, timeout=12, headers={"Referer": "https://quote.eastmoney.com/"}).text)
            diff = (d.get("data") or {}).get("diff", [])
            if diff:
                return [{"code": s.get("f12"), "name": s.get("f14"),
                         "chg_pct": s.get("f3"),
                         "main_net_yi": round((s.get("f62") or 0) / 1e8, 2)} for s in diff]
        except Exception:
            pass
        time.sleep(1)
    return []

def main():
    result = {}
    errors = {}

    def safe(key, fn):
        try:
            result[key] = fn()
            print(f"  ✓ {key}")
        except Exception as e:
            errors[key] = str(e)
            print(f"  ✗ {key}: {e}")

    print("[1/3] 新浪涨跌家数 + 涨跌幅榜")
    safe("breadth", fetch_breadth_rank)
    if "breadth" in result:
        b = result["breadth"]
        print(f"  涨{b['up']} 跌{b['down']} 平{b['flat']} (共{b['total']})")
    print("[2/3] 新浪行业板块")
    safe("sina_sectors", fetch_sina_sectors)
    print("[3/3] 东财主力资金排行(重试)")
    safe("fund_rank", fetch_fund_rank)

    # 合并到已有 JSON（仅覆盖成功项，缺文件时明确提示）
    path = os.path.join(BASE, f"data/market_{TD}.json")
    if not os.path.exists(path):
        print(f"!! 未找到 {path}，请先运行 collect_data.py")
        sys.exit(1)
    d = load_json(path, {})
    # 空结果不合并：避免失败项以空值挤掉旧数据
    if result.get("breadth", {}).get("total", 0) > 0:
        d["breadth"] = result["breadth"]
        d.setdefault("errors", {}).pop("breadth", None)
    if result.get("fund_rank"):
        d["fund_rank"] = result["fund_rank"]
        d.setdefault("errors", {}).pop("fund_rank", None)
    # 保留 collect_data 的东财板块资金流（dict 含 main_net_yi），新浪行业板块存入 sina_sectors，仅当 sectors 缺失时兜底
    if result.get("sina_sectors"):
        if not d.get("sectors"):
            d["sectors"] = result["sina_sectors"]
        d["sina_sectors"] = result["sina_sectors"]
        d.setdefault("errors", {}).pop("sina_sectors", None)
    if errors:
        d.setdefault("errors", {}).update(errors)
    dump_json(d, path)
    print(f"\n已合并写入 market_{TD}.json（成功 {len(result)}/3 项）")

if __name__ == "__main__":
    main()
