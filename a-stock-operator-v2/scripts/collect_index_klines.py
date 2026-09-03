# -*- coding: utf-8 -*-
"""采集 8 大指数近 ~30 个交易日收盘价，写入 data/index_klines.json，供行情复盘报告 sparkline 使用。
接口：腾讯财经 q 主动态日 K 线（Qtaryi），返回逗号分隔 OHLC，取收盘价（第 4 列）。
用法：python collect_index_klines.py [--days 30]
"""
import os
import sys
import json
import argparse
import requests

from _common import BASE, DATA_DIR, load_json

INDEXES = {
    "sh000001": "上证指数",
    "sz399001": "深证成指",
    "sz399006": "创业板指",
    "sh000688": "科创50",
    "sh000300": "沪深300",
    "sh000905": "中证500",
    "sh000852": "中证1000",
    "sh000016": "上证50",
}

# 腾讯 q 主动态日线：q=code,day,,,N,qfq
KLINE_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},day,,,{n},qfq"

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117.0.0.0 Safari/537.36",
      "Referer": "https://gu.qq.com/"}


def fetch_closes(code, n):
    try:
        r = requests.get(KLINE_URL.format(code=code, n=n), headers=UA, timeout=15)
        r.encoding = "utf-8"
        d = r.json()
        node = (d.get("data") or {}).get(code) or {}
        # 指数 K 线位于 data[code]["day"]；个股可能为 qfqday
        for key in ("day", "qfqday"):
            arr = node.get(key)
            if arr:
                return [round(float(row[2]), 2) for row in arr]  # row[2] = 收盘价
        return []
    except Exception as e:
        print(f"  !! {code} 失败: {e}")
        return []


def main():
    ap = argparse.ArgumentParser(description="采集指数近 N 日收盘价 -> index_klines.json")
    ap.add_argument("--days", type=int, default=30, help="取近 N 个交易日，默认 30")
    args = ap.parse_args()

    result = {}
    for code, name in INDEXES.items():
        closes = fetch_closes(code, args.days)
        result[code] = closes
        print(f"  {name}({code}): {len(closes)} 个交易日, 最新 {closes[-1] if closes else '-'}")
    out = os.path.join(DATA_DIR, "index_klines.json")
    # 失败指数保留旧文件数据，避免空列表覆盖好数据
    old = load_json(out, {})
    for k in list(result.keys()):
        if not result[k] and old.get(k):
            result[k] = old[k]
            print(f"  !! {k} 本次失败，保留旧 {len(old[k])} 日")
    if not any(result.values()):
        print("  !! 全部指数采集失败，保留旧文件")
        sys.exit(1)
    # 对齐长度：不同指数可能返回略不同天数，统一截断到最短
    min_len = min((len(v) for v in result.values() if v), default=0)
    for k in result:
        if len(result[k]) > min_len:
            result[k] = result[k][-min_len:]
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f"\n完成 -> {out} (每指数 {min_len} 日)")


if __name__ == "__main__":
    main()
