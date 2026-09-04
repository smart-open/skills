# -*- coding: utf-8 -*-
"""补齐 board 中所有缺失的 K 线(并发抓取腾讯K线, 已有缓存跳过)"""
import os, json, time, sys
import requests, pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # scripts/（使直接 python 运行时也能 import _common）
import _common as C
from pipeline import UA

def calc_prefix(c):
    return "bj" if str(c).startswith(("8", "4", "920")) else (
        "sh" if str(c).startswith(("6", "9")) else "sz")

board = C.load_board()
all_codes = sorted(set(board["SECURITY_CODE"].astype(str).str.zfill(6)))
have = {os.path.splitext(f)[0] for f in os.listdir(C.KLINE_DIR)}
missing = [c for c in all_codes if c not in have]
print(f"board 代码 {len(all_codes)}, 已有缓存 {len(have)}, 缺失 {len(missing)}")

os.makedirs(C.KLINE_DIR, exist_ok=True)
_sl = [0.0]
_LOCK = None

def tick():
    d = time.time() - _sl[0]
    if d < 0.15:
        time.sleep(0.15 - d)
    _sl[0] = time.time()

def grab(c):
    tick()
    p = os.path.join(C.KLINE_DIR, f"{c}.json")
    prefix = calc_prefix(c)
    if prefix == "bj":   # 北交所在 fqkline?qfq 下会被腾讯 WAF 拦截, 用 kline 接口(原始日K)
        url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/kline"
        params = {"param": f"bj{c},day,,,200"}
    else:
        url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get"
        params = {"param": f"{prefix}{c},day,,,200,qfq"}
    try:
        r = requests.get(url, params=params, headers={"User-Agent": UA}, timeout=10)
        d = r.json()["data"][f"{prefix}{c}"]
        kl = d.get("qfqday") or d.get("day") or []
        if kl:
            json.dump(kl, open(p, "w", encoding="utf-8"), ensure_ascii=False)
            return c, True, len(kl)
        return c, False, 0
    except Exception:
        return c, False, 0

ok = fail = 0
t0 = time.time()
with ThreadPoolExecutor(max_workers=6) as ex:
    futs = {ex.submit(grab, c): c for c in missing}
    for i, fu in enumerate(as_completed(futs), 1):
        c, s, n = fu.result()
        if s:
            ok += 1
        else:
            fail += 1
        if i % 200 == 0 or i == len(missing):
            print(f"  进度 {i}/{len(missing)}  成功累计 {ok}  失败累计 {fail}  已用 {round(time.time()-t0,1)}s")

now_have = {os.path.splitext(f)[0] for f in os.listdir(C.KLINE_DIR)}
print(f"完成: 新增成功 {ok}, 仍失败 {fail}, 缓存总数 {len(now_have)}")