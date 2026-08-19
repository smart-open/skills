# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""近一月板块涨幅 + 轮动节奏（v2：限流 + 重试）"""
import json, time, requests

S = requests.Session()
S.headers.update({"User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/"})

def get_sectors():
    url = ("https://push2delay.eastmoney.com/api/qt/clist/get"
           "?fid=f3&po=1&pz=120&pn=1&np=1&fltt=2&invt=2"
           "&ut=bd1d9ddb04089700cf9c27f6f7426281&fs=m:90+t:2&fields=f12,f14,f3")
    d = S.get(url, timeout=15).json()
    diff = (d.get("data") or {}).get("diff", [])
    return [(s["f12"], s["f14"], s.get("f3")) for s in diff]

def get_sector_kline(bk, retries=3):
    url = ("https://push2his.eastmoney.com/api/qt/stock/kline/get"
           f"?secid=90.{bk}&fields1=f1,f2,f3,f4,f5,f6"
           "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
           "&klt=101&fqt=1&beg=20260701&end=20260814&ut=fa5fd1943c7b386f172d6893dbbd1d0c")
    for i in range(retries):
        try:
            d = S.get(url, timeout=12).json()
            k = (d.get("data") or {}).get("klines", [])
            return [float(r.split(",")[2]) for r in k]
        except Exception:
            if i == retries - 1:
                return []
            time.sleep(1.5 * (i + 1))
    return []

def chg(closes, n):
    if len(closes) <= n:
        return None
    return round((closes[-1] - closes[-1 - n]) / closes[-1 - n] * 100, 2)

sectors = get_sectors()
print(f"行业板块数: {len(sectors)}")

rows = []
for idx, (bk, name, _) in enumerate(sectors):
    closes = get_sector_kline(bk)
    if len(closes) < 25:
        time.sleep(0.3)
        continue
    c20 = chg(closes, 20)
    c10 = chg(closes, 10)
    c5 = chg(closes, 5)
    if c20 is None:
        time.sleep(0.3)
        continue
    if c5 is not None and c10 is not None:
        if c20 > 0 and c5 < 0:
            rhythm = "高位退潮"
        elif c20 > 0 and c5 > c20:
            rhythm = "加速上攻"
        elif c20 > 0 and c10 <= 0:
            rhythm = "低位启动"
        elif c20 > 0 and c5 > 0:
            rhythm = "持续强势"
        else:
            rhythm = "震荡整理"
    else:
        rhythm = "-"
    rows.append({"bk": bk, "name": name, "c20": c20, "c10": c10, "c5": c5, "rhythm": rhythm})
    time.sleep(0.35)
    if (idx + 1) % 20 == 0:
        print(f"  已处理 {idx + 1}/{len(sectors)}")

rows.sort(key=lambda x: x["c20"], reverse=True)
json.dump(rows, open(os.path.join(BASE, "data/sector_month.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("\n=== 近20日行业板块涨幅 TOP12 ===")
for r in rows[:12]:
    print(f"  {r['name']} 20日{r['c20']:+}% 10日{r['c10']:+}% 5日{r['c5']:+}% [{r['rhythm']}]")
print(f"\n共 {len(rows)} 个板块有效，已保存")
