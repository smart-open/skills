# -*- coding: utf-8 -*-
"""个股单查：输入股票代码或名称，判定是否符合「一阳指·转势」「一阳指·开门」
用法：
  py scripts/judge.py 002491 [YYYY-MM-DD]     # 按代码
  py scripts/judge.py 通鼎互联 [YYYY-MM-DD]   # 按名称(自动解析代码)
输出 runtime/output/judge_{code}_{yyyymmdd}.json + 控制台结论文本
"""
from __future__ import annotations
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C
import indicators as IND


def resolve(kw):
    """代码/名称 → (code, name)；代码也尽量补全名称"""
    kw = str(kw).strip()
    code_only = kw.isdigit() and len(kw) == 6
    if code_only:
        code_input = kw
    else:
        code_input = None
    try:
        import requests
        r = requests.get(
            "https://searchapi.eastmoney.com/api/suggest/get",
            params={"input": kw, "type": "14", "count": "10"},
            headers={"User-Agent": C.UA}, timeout=10)
        data = (r.json().get("QuotationCodeTable") or {}).get("Data") or []
        for d in data:
            mkt, code, name = d.get("MktNum"), d.get("Code"), d.get("Name")
            if not code:
                continue
            if code_only and code == code_input:
                return code, name
            if not code_only and name and kw in name:
                return code, name
        if data and not code_only:
            return data[0]["Code"], data[0]["Name"]
    except Exception:
        pass
    if code_only:
        return kw, kw
    return None, None


def main(argv):
    if not argv:
        print("用法: py scripts/judge.py <代码或名称> [日期]")
        print("示例: py scripts/judge.py 002491 2026-08-31")
        return 2
    kw = argv[0]
    when = next((a for a in argv[1:] if a.startswith("20") and len(a) >= 8), None)
    code, name = resolve(kw)
    if not code:
        print(f"[judge] 无法解析「{kw}」为有效代码/名称")
        return 1
    code = str(code).zfill(6)
    print(f"[judge] {kw} -> {code} {name}, 抓取日K线 ...")
    rows = C.get_daily_kline(code, refresh=True)
    if not rows:
        print(f"[judge] 获取 {code} K线失败(网络受限?), 尝试缓存 ...")
        rows = C.get_daily_kline(code)
        if not rows:
            print("[judge] 仍无数据, 退出")
            return 1
    ev = IND.evaluate(rows, code=code)
    ev["code"] = code
    ev["name"] = name
    date = ev.get("date", "")

    _print(ev)
    dfile = os.path.join(C.OUT_DIR, f"judge_{code}_{date.replace('-','')}.json")
    C.dump_json(dfile, ev)
    print(f"\n[judge] 详情已存 -> {dfile}")
    return 0


def _r(sig):
    return "✔ 成立" if sig else "✘ 不成立"


def _print(ev):
    if ev.get("insufficient"):
        print(f"\n[结论] 数据不足：{ev.get('reason','')}")
        return
    t, o = ev["turn"], ev["open"]
    print(f"\n===== {ev.get('name','')} {ev.get('code','')}  基准日 {ev['date']}  收盘 {ev['close']}  当日涨幅 {ev['chg_today']}% =====")
    print(f"\n【一阳指·转势】{_r(t['signal'])}  评分 {t['score']}")
    for r_ in t["reasons"]:
        print(f"  · {r_}")
    if t["signal"]:
        print(f"  买点: {t['buy']['detail']} ({t['buy']['ref']})")
        print(f"  止损位: {t['stop']}")
    else:
        print(f"  未成立原因: {t['counter']}")
    print(f"\n【一阳指·开门】{_r(o['signal'])}  评分 {o['score']}")
    for r_ in o["reasons"]:
        print(f"  · {r_}")
    if o["signal"]:
        print(f"  买点: {o['buy']['detail']} ({o['buy']['ref']})")
        print(f"  止损位: {o['stop']}")
    else:
        print(f"  未成立原因: {o['counter']}")
    if ev.get("sells"):
        print("\n【卖点监控】")
        for s in ev["sells"]:
            for k, v in s.items():
                print(f"  · {k}: {v}")
    print("\n【战法提示】转势=底部反转寻起点；开门=趋势延续半路介入；做T仅适用于趋势向上个股。")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))