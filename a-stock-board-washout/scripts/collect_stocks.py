# -*- coding: utf-8 -*-
"""采集候选个股的日K线（腾讯前复权）+ T日分时（腾讯 minute）-> data/stocks_{T}.json

候选清单来自 data/screen 之前的策略规则：本脚本直接对「策略一候选（T0首板&T日未板）
∪ 策略二候选（T日炸板）」逐只抓取日K+分时并缓存为 per-code 记录。
"""
import sys
import json
import time
import argparse
import requests

from _common import (load_json, dump_json, safe_float, tencent_code, data_path,
                     fmt_dash, is_main_board, is_st, is_risk_reason)

ap = argparse.ArgumentParser(description="采集候选个股日K线 + T日分时")
ap.add_argument("--date", default=None, help="目标交易日 YYYYMMDD（缺省读 pools 推断）")
_args = ap.parse_args()

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "Chrome/117.0.0.0 Safari/537.36")
S = requests.Session()
S.headers.update({"User-Agent": UA})


def resolve_target():
    if _args.date:
        return _args.date
    # 找最近一个 pools 文件
    import glob
    files = sorted(glob.glob(data_path("pools_*.json")))
    if not files:
        raise SystemExit("!! 未找到 pools_*.json，请先运行 collect_pools.py 或 --date")
    return files[-1].split("pools_")[-1].split(".")[0]


def fetch_kline(code, n=130):
    tc = tencent_code(code)
    # 原 web.ifzq.gtimg.cn/appstock/app/fqkline/get 在本环境返回 501，改用腾讯官方镜像 host
    url = f"https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get?param={tc},day,,,{n},qfq"
    for _ in range(2):
        try:
            data = S.get(url, timeout=12).json().get("data", {}).get(tc, {})
            return data.get("qfqday") or data.get("day") or []
        except Exception:
            time.sleep(0.6)
    return []


def fetch_minute(code):
    """腾讯分时。返回 [ {t,p,v,avg}, ... ]。data 为纯 JSON，行 = [hhmm, price, volume(手), 累计成交额]；
    均价 avg 由「累计成交额 / 累计成交量(股)」推算。"""
    tc = tencent_code(code)
    url = f"https://web.ifzq.gtimg.cn/appstock/app/minute/query?code={tc}"
    for _ in range(3):
        try:
            j = S.get(url, timeout=12).json()
            node = j.get("data", {}).get(tc, {})
            rows = node.get("data", {}).get("data", []) or []
            out = []
            prev_cum = 0.0
            for r in rows:
                parts = r.split()
                if len(parts) < 3:
                    continue
                t_ = parts[0]
                p = safe_float(parts[1])
                vol_hand = safe_float(parts[2])   # 累计成交量(手)
                amount = safe_float(parts[3]) if len(parts) >= 4 else 0.0  # 累计成交额(元)
                shares = vol_hand * 100
                avg = round(amount / shares, 4) if shares > 0 else None      # VWAP=累计额/累计量
                dm = vol_hand - prev_cum                                       # 当分钟成交量(手)
                prev_cum = vol_hand
                out.append({"t": t_, "p": p, "v": round(max(dm, 0.0), 0), "avg": avg})
            return out
        except Exception:
            time.sleep(0.6)
    return []


def fetch_quote(code):
    """腾讯实时行情：流通市值(亿)/总市值(亿)/换手率%/成交额(亿)/振幅%。
    qt.gtimg 字段（~分隔）：[3]价 [37]成交额万 [38]换手% [43]振幅% [44]流通亿 [45]总亿。"""
    tc = tencent_code(code)
    url = f"https://qt.gtimg.cn/q={tc}"
    try:
        txt = S.get(url, timeout=12).text
        line = [l for l in txt.split(";") if '="' in l]
        if not line:
            return {}
        v = line[0].split('"')[1].split("~")

        def g(i):
            return v[i] if i < len(v) else "0"

        return {
            "price": safe_float(g(3)),
            "amount_yi": round(safe_float(g(37)) / 1e4, 2),
            "turnover": round(safe_float(g(38)), 2),
            "amplitude": round(safe_float(g(43)), 2),
            "liutong_yi": round(safe_float(g(44)), 2),
            "total_yi": round(safe_float(g(45)), 2),
        }
    except Exception:
        return {}


def _sina_code(code):
    if code.startswith("6"):
        return "sh" + code
    if code.startswith(("0", "3")):
        return "sz" + code
    if code.startswith(("4", "8")):
        return "bj" + code
    return "sz" + code


def _fund_flow_sina(code, target):
    """新浪个股资金流（兜底源，稳定不封）。MoneyFlow.ssl_qsfx_zjlrqs 逐日返回：
    netamount主力净流入(元) ratioamount净流入占成交额比例 r0_net超大单净。匹配目标交易日。"""
    daima = _sina_code(code)
    url = ("https://vip.stock.finance.sina.com.cn/quotes_service/"
           "api/json_v2.php/MoneyFlow.ssl_qsfx_zjlrqs")
    params = {"page": "1", "num": "10", "sort": "opendate", "asc": "0", "daima": daima}
    try:
        r = S.get(url, params=params,
                  headers={"Referer": "https://finance.sina.com.cn"}, timeout=8)
        arr = json.loads(r.text)
        if not isinstance(arr, list) or not arr:
            return {}
        tkey = f"{target[:4]}-{target[4:6]}-{target[6:]}"
        rec = next((it for it in arr if str(it.get("opendate", ""))[:10] == tkey), None)
        if rec is None:
            rec = arr[0]
        net = safe_float(rec.get("netamount"))
        ratio = safe_float(rec.get("ratioamount"))
        if not net:
            return {}
        return {"date": str(rec.get("opendate", ""))[:10], "src": "sina",
                "zjlx": net, "net_pct": round(ratio * 100, 2) if ratio else None}
    except Exception:
        return {}


def fetch_fund_flow(code, target):
    """个股主力资金流：统一新浪逐股口径（MoneyFlow.ssl_qsfx_zjlrqs），失败返回 {}，绝不阻塞。"""
    return _fund_flow_sina(code, target)


def enrich_code(code, name, target, base_price=None, prev_close=None):
    rec = {"code": code, "name": name}
    k = fetch_kline(code)
    if len(k) < 30:
        rec["kline_ok"] = False
        return rec
    dates = []
    for row in k:
        # [date, open, close, high, low, volume, ...]
        if len(row) < 6:
            continue
        dates.append({
            "d": str(row[0]), "o": safe_float(row[1]), "c": safe_float(row[2]),
            "h": safe_float(row[3]), "l": safe_float(row[4]), "v": safe_float(row[5]),
        })
    rec.update({
        "kline_ok": True, "klines": dates,
        "target": target, "base_price": base_price, "prev_close": prev_close,
    })
    mn = fetch_minute(code)
    rec["minute_ok"] = bool(mn)
    rec["minute"] = mn
    rec["quote"] = fetch_quote(code)
    rec["fund_flow"] = fetch_fund_flow(code, target)
    time.sleep(0.2)
    return rec


def candidates_from_pools(p):
    """按策略规则给出候选 code/name 并标注其来源策略集。"""
    def pool_list(top, sub):
        x = p.get(top, {})
        x = x.get(sub, {}) if isinstance(x, dict) else {}
        return x.get("list", []) if isinstance(x, dict) else (x or [])

    zt_t0 = {r["code"]: r for r in pool_list("T0_pool", "limit_up") if r.get("code")}
    zt_t = {r["code"]: r for r in pool_list("T_pool", "limit_up") if r.get("code")}
    zb_t = {r["code"]: r for r in pool_list("T_pool", "broken") if r.get("code")}

    def ok(r):
        # 仅主板，剔除 ST/退，剔除暴雷（立案/退市风险等）
        return (is_main_board(r.get("code") or "")
                and not is_st(r.get("name") or "")
                and not is_risk_reason(r.get("reason") or r.get("fbt") or ""))

    cands = {}
    # 策略一：T0 首板 & 不在 T 涨停池
    for code, r in zt_t0.items():
        if ok(r) and r.get("lbc") == 1 and code not in zt_t:
            cands[code] = {"name": r.get("name", ""), "pool": "S1", "pool_info": r}
    # 策略二：T 炸板（可叠加 S1，保留 S2 标记）
    for code, r in zb_t.items():
        if not ok(r):
            continue
        if code in cands:
            cands[code]["pool"] = "S1+S2"
            cands[code].setdefault("pool_info", {})
            cands[code]["zb_info"] = r
        else:
            cands[code] = {"name": r.get("name", ""), "pool": "S2", "pool_info": {}, "zb_info": r}
    return cands


def main():
    target = resolve_target()
    path = data_path(f"pools_{target}.json")
    p = load_json(path)
    if not p or p.get("T") != target:
        raise SystemExit(f"!! pools_{target}.json 缺失或 T 不符，请先跑 collect_pools.py --date {target}")

    cands = candidates_from_pools(p)
    print(f"候选 {len(cands)} 只（含 S1 首板洗盘 / S2 炸板）")
    if not cands:
        print("  !! 无候选，跳过个股采集")
        dump_json({"T": target, "stocks": {}}, data_path(f"stocks_{target}.json"))
        return

    stocks = {}
    for code, info in cands.items():
        rec = enrich_code(code, info["name"], target)
        rec["pool"] = info["pool"]
        rec["pool_info"] = info.get("pool_info", {})
        rec["zb_info"] = info.get("zb_info", {})
        stocks[code] = rec
        ok = "K✓" if rec.get("kline_ok") else "K✗"
        mo = "分时✓" if rec.get("minute_ok") else "分时✗"
        print(f"  {info['name']}({code}) [{info['pool']}] {ok} {mo}")

    out_path = data_path(f"stocks_{target}.json")
    dump_json({"T": target, "stocks": stocks}, out_path)
    print(f"  写入 {out_path}")
    sys.stdout.flush()


if __name__ == "__main__":
    main()