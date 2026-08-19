# -*- coding: utf-8 -*-
import os
from _common import BASE, dump_json
"""同花顺板块接口拉取 7 个概念板块近 15 日涨跌幅"""
import requests, time

S = requests.Session()
S.headers.update({"User-Agent": "Mozilla/5.0", "Referer": "http://q.10jqka.com.cn/"})

# 同花顺概念板块代码
boards = {
    "CPO概念": "886033",
    "F5G概念": "885998",
    "光纤概念": "886084",
    "铜缆高速连接": "886073",
    "创新药": "886015",
    "机器人概念": "885517",
    "稀土永磁": "885343",
}

def fetch_board(code):
    url = f"http://d.10jqka.com.cn/v6/line/bk_{code}/01/last.js"
    for i in range(3):
        try:
            r = S.get(url, timeout=12)
            r.encoding = "gbk"
            text = r.text
            # 提取 data 字段
            start = text.find('"data":"') + len('"data":"')
            end = text.find('",', start)
            if start <= len('"data":"'):
                return []
            data_str = text[start:end]
            rows = []
            for seg in data_str.split(";"):
                p = seg.split(",")
                if len(p) >= 6 and len(p[0]) == 8:
                    rows.append((p[0], float(p[4])))  # (日期, 收盘价 index4: 日期,开,高,低,收,量,额)
            return rows
        except Exception:
            time.sleep(1)
    return []

result = {}
for name, code in boards.items():
    rows = fetch_board(code)
    if not rows:
        print(f"  {name}: 失败")
        continue
    # 取最近 16 个交易日（用于计算15个涨跌幅）
    rows = rows[-16:]
    # 计算每日涨跌幅
    daily = []
    for i in range(1, len(rows)):
        d, c = rows[i]
        pc = rows[i-1][1]
        chg = round((c - pc) / pc * 100, 2)
        daily.append((d, chg))
    result[name] = daily
    print(f"  {name}: {len(daily)} 个交易日, 最近: {daily[-1]}")
    time.sleep(0.5)

dump_json(result, os.path.join(BASE, "data/sector_15d.json"))
print(f"\n完成，共 {len(result)} 个板块")
