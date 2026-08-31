# -*- coding: utf-8 -*-
"""构建游资席位画像 -> RUNTIME/data/seat_profile.csv
含: 上榜次数/买入总额/净买入/单票均买/打板率/低吸率/风格/T5均值&T5胜率(EB收缩)/综评/样本可信度
用途: (1) 报告「席位操作手法专题」展示 (2) 席位画像解读
注意: 此处综评基于全期统计(含未来 T5, 属展示口径); 模型特征一律使用 causal.py 的因果席位分,
      避免未来泄漏。切勿用本文件的 load_seat_score 复用作训练特征。
"""
import os
import numpy as np
import pandas as pd
import _common as C


def _build():
    sb = C.load_seats_buy()
    if len(sb) == 0:
        print("[seat_profile] 无 seats 数据, 先运行 pipeline")
        return None
    b = C.load_board()
    if len(b) == 0:
        print("[seat_profile] 无 board 数据, 先运行 pipeline")
        return None
    b5 = b[["TRADE_DATE", "SECURITY_CODE", "D5_CLOSE_ADJCHRATE"]].copy()
    sb = sb.merge(b5, on=["TRADE_DATE", "SECURITY_CODE"], how="left")
    sb = sb.copy()
    sb["CHG"] = pd.to_numeric(sb["CHANGE_RATE"], errors="coerce")
    sb["D5"] = pd.to_numeric(sb["D5_CLOSE_ADJCHRATE"], errors="coerce")
    sb["NET"] = pd.to_numeric(sb["NET"], errors="coerce")
    sb["BUY"] = pd.to_numeric(sb["BUY"], errors="coerce")

    big = sb.groupby("OPERATEDEPT_NAME").filter(lambda x: len(x) >= 20)
    prior_t5_mean = float(big["D5"].mean()) if len(big) else 0.0
    K = C.EB_K

    def shr_mean(x, k=K, prior=prior_t5_mean):
        x = x.dropna(); n = len(x)
        if n == 0:
            return np.nan
        return (k * prior + x.sum()) / (k + n)

    rows = []
    for name, gg in sb.groupby("OPERATEDEPT_NAME"):
        n = len(gg)
        if n < 3:
            continue
        buy = gg["BUY"].sum(); net = gg["NET"].sum(); chg = gg["CHG"]
        dapan = float((chg >= 9.5).mean() * 100)
        dip = float((chg <= -7).mean() * 100)
        t5 = gg["D5"].dropna(); t5_n = len(t5)
        t5_mean = float(t5.mean()) if t5_n else np.nan
        t5_win = float((t5 > 0).mean() * 100) if t5_n else np.nan
        t5_mean_s = shr_mean(t5)
        t5_win_s = (K * 50 + (t5 > 0).sum() * 100) / (K + t5_n) if t5_n else 50.0
        if dapan >= 45:
            style = "打板"
        elif dip >= 35:
            style = "低吸/抄底"
        else:
            style = "接力/趋势"
        momentum = t5_mean_s if pd.notna(t5_mean_s) else 0.0
        zong = round(momentum * 0.6 + np.clip(net / 1e8, -5, 40) * 0.3 + dapan * 0.05, 2)
        cred = "高" if n >= 20 and t5_n >= 15 else ("中" if n >= 10 else "低")
        rows.append({
            "OPERATEDEPT_NAME": name, "上榜次数": n, "买入总额亿": round(buy / 1e8, 2),
            "净买入亿": round(net / 1e8, 2), "单票均买万": round(buy / n / 1e4, 1),
            "打板率": round(dapan, 1), "低吸率": round(dip, 1), "风格": style,
            "T5均值": round(t5_mean, 2) if pd.notna(t5_mean) else np.nan,
            "T5胜率": round(t5_win, 1) if pd.notna(t5_win) else np.nan,
            "T5均值_s": round(t5_mean_s, 2) if pd.notna(t5_mean_s) else np.nan,
            "T5胜率_s": round(t5_win_s, 1), "样本": n, "T5样本": t5_n,
            "样本可信度": cred, "综评": zong,
        })

    prof = pd.DataFrame(rows).sort_values("综评", ascending=False).reset_index(drop=True)
    prof.to_csv(C.SEAT_PROFILE_CSV, index=False, encoding="utf-8-sig")
    print(f"[seat_profile] {len(prof)} 个席位 (上榜>=3次), 先验T5中枢 {prior_t5_mean:.2f}%")
    print(prof["风格"].value_counts().to_string())
    return prof


def build():
    """构建席位画像(供 optimize/init 调用)"""
    return _build()


if __name__ == "__main__":
    _build()