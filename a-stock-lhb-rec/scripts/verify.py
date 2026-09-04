# -*- coding: utf-8 -*-
"""验证历史推荐: 用实际 K 线核对昨日/前几日推荐的 T+1/T+2/T+3 涨停命中
读取 recommend_{DATE}.csv, 结合 kline 计算真实后续涨幅, 与模型P对照, 追加 verify_history.csv
用法: python verify.py [DATE]   (缺省=最近一个已生成 recommend 的日期)
"""
import os, sys
import numpy as np
import pandas as pd
import _common as C

VERIFY_WINDOW = 3  # 验证到 T+3


def actual_limits(kl, code, dt):
    """返回 (t1,t2,t3) 是否涨停, 未知为 None"""
    res = []
    for n in range(1, VERIFY_WINDOW + 1):
        ret = C.kline_ret(kl, code, dt, n)
        if pd.isna(ret):
            res.append(None)
        else:
            res.append(1 if ret >= C.zt_threshold(code) else 0)
    return res


def main(date=None):
    kl = C.load_klines()
    files = sorted(glob_recommend())
    if not files:
        print("[verify] 无 recommend 文件, 请先运行 recommend"); return
    if date is None:
        # 取文件名里日期最新且 T+3 可能已部分可验证的
        date = files[-1].split("recommend_")[1].split(".")[0]
    path = os.path.join(C.RUNTIME, f"recommend_{date}.csv")
    if not os.path.exists(path):
        print(f"[verify] 无 {path}"); return
    rec = pd.read_csv(path, dtype={"CODE": str})
    rec["P"] = pd.to_numeric(rec["P"], errors="coerce") / 100.0
    t1h = t2h = t3h = 0
    rows = []
    for _, r in rec.iterrows():
        code, dt = r["CODE"], r["TRADE_DATE"]
        t1, t2, t3 = actual_limits(kl, code, dt)
        any_zt = (t1 == 1) or (t2 == 1) or (t3 == 1)
        if t3 is not None:
            t3h += int(t3 == 1)
        if t1 is not None:
            t1h += int(t1 == 1)
        if t2 is not None:
            t2h += int(t2 == 1)
        rows.append({"DATE": date, "CODE": code, "NAME": r["NAME"], "P": round(r["P"], 4),
                     "T1涨停": t1, "T2涨停": t2, "T3涨停": t3,
                     "纳入观察": r.get("纳入观察", False)})
    res = pd.DataFrame(rows)
    n = len(res)
    t1k = res["T1涨停"].sum(); t2k = res["T2涨停"].sum(); t3k = res["T3涨停"].sum()
    # 可验证样本数: T+3 已结算(非 NaN)才算「可验证」
    t3_valid = int(res["T3涨停"].notna().sum())
    t1_valid = int(res["T1涨停"].notna().sum())
    # 若 T+3 尚未结算(推荐日距今 <3 个交易日), 跳过写入, 避免写出全 0 的误导记录
    if t3_valid == 0:
        print(f"[verify] {date} 推荐 T+3 尚未结算(距今<3个交易日), 暂不写入 verify_history, 待后续 daily 自动回填")
        return None
    # 写入历史(按 date 去重追加)
    hist = pd.read_csv(C.VERIFY_PATH, dtype={"DATE": str}) if os.path.exists(C.VERIFY_PATH) else pd.DataFrame()
    if len(hist) and "DATE" in hist.columns:
        hist = hist[hist["DATE"] != date]
    summary = pd.DataFrame([{"DATE": date, "推荐数": n,
                             "T1涨停数": int(t1k), "T2涨停数": int(t2k), "T3涨停数": int(t3k),
                             "T1命中率": round(t1k / max(1, t1_valid) * 100, 1),
                             "T3命中率": round(t3k / max(1, t3_valid) * 100, 1)}])
    hist = pd.concat([hist, summary], ignore_index=True)
    hist.to_csv(C.VERIFY_PATH, index=False, encoding="utf-8-sig")
    print(f"\n=== 验证 {date} 推荐 (共 {n} 只, T+3 可验证 {t3_valid}) ===")
    print(f"  T+1 涨停: {int(t1k)}  T+2 涨停: {int(t2k)}  T+3 涨停: {int(t3k)}")
    print(f"  T+1 命中率(可验证样本): {summary['T1命中率'].iloc[0]}%  T+3 命中率: {summary['T3命中率'].iloc[0]}%")
    print(f"  已写入 {C.VERIFY_PATH}")
    # 打印命中明细(Top10 高P)
    top = res.sort_values("P", ascending=False).head(12)
    for _, r in top.iterrows():
        hit = "✓" if (r["T1涨停"] == 1 or r["T2涨停"] == 1 or r["T3涨停"] == 1) else ("✗" if (r["T3涨停"] == 0) else "·")
        print(f"  {r['CODE']} {str(r['NAME'])[:8]:<8} P={r['P']*100:5.1f}% {hit} T1={r['T1涨停']} T2={r['T2涨停']} T3={r['T3涨停']}")
    return summary


def glob_recommend():
    import glob
    return sorted(glob.glob(os.path.join(C.RUNTIME, "recommend_*.csv")))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) >= 2 else None)
