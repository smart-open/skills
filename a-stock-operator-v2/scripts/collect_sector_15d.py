# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""拉取 7 个概念板块近 15 日 K 线（循环重试 push2his 直到风控解除）"""
import requests, time, json

S = requests.Session()
S.headers.update({"User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/"})

boards = {
    "CPO概念": "BK1128",
    "F5G概念": "BK1088",
    "光通信模块": "BK1136",
    "光纤概念": "BK1660",
    "创新药": "BK1106",
    "机器人": "BK1408",
    "稀土永磁": "BK0578",
}

def fetch_kline(bk, retries=2):
    url = ("https://push2his.eastmoney.com/api/qt/stock/kline/get"
           f"?secid=90.{bk}&fields1=f1,f2,f3,f4,f5,f6"
           "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
           "&klt=101&fqt=1&beg=20260720&end=20260814&ut=fa5fd1943c7b386f172d6893dbbd1d0c")
    for i in range(retries):
        try:
            d = S.get(url, timeout=12).json()
            k = (d.get("data") or {}).get("klines", [])
            if k:
                # 返回 [(日期, 涨跌幅), ...]
                return [(r.split(",")[0][5:], round(float(r.split(",")[8]), 2)) for r in k]
        except Exception:
            pass
        time.sleep(1)
    return []

# 循环重试直到成功
result = {}
max_attempts = 20
for attempt in range(max_attempts):
    test = fetch_kline("BK1128")
    if test:
        print(f"第 {attempt + 1} 次尝试成功，开始拉取全部板块")
        break
    print(f"第 {attempt + 1} 次尝试失败，等待 50s...")
    time.sleep(50)
else:
    print("多次重试仍失败")
    exit(1)

for name, bk in boards.items():
    k = fetch_kline(bk)
    if k:
        result[name] = k
        print(f"  {name}: {len(k)} 根 K 线, 最近: {k[-1]}")
    else:
        print(f"  {name}: 拉取失败")
    time.sleep(1.5)

json.dump(result, open(os.path.join(BASE, "data/sector_15d.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(f"\n完成，共 {len(result)} 个板块，已保存 sector_15d.json")
