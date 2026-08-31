# -*- coding: utf-8 -*-
"""构建 T+3 龙虎榜涨停预测特征集 -> RUNTIME/data/model_data_t3.csv
标签: T+1/T+2/T+3 任一交易日涨停(统一由 K 线收盘价计算, 与 verify 口径一致)
特征三维: 个股技术 / 席位手法(因果席位分) / 行情研判(因果主线题材)
无未来泄漏: 席位分与主线题材均仅用「截至样本日期」已可观测信息(见 causal.py)
支持 build_all()(全量重算) 与 build_date(dt)(增量追加单日)
"""
import os
import numpy as np
import pandas as pd
import _common as C
import causal as CL

NUM_BASE = ["CHANGE_RATE", "TURNOVERRATE", "LOG_CAP", "NET_YI", "IS_LIMIT_UP", "PRE3_RET",
            "BUYER_TOP_SCORE", "BUYER_MEAN_SCORE", "BUYER_COUNT", "NET_BUY_RATIO",
            "RETAIL_RATIO", "HAS_INST", "HAS_HK", "FAMOUS_YZ", "THEME_MAIN",
            "THEME_STRENGTH", "MARKET_ZT", "LOW_XI", "LB_FLAG",
            "SELLER_TOP_SCORE", "SELLER_MEAN_SCORE"]


def _row_features(r, kl):
    dt, code = r["TRADE_DATE"], r["SECURITY_CODE"]
    name = str(r.get("SECURITY_NAME_ABBR", ""))
    lp = C.limit_pct(code)
    thr = C.zt_threshold(code)
    d1 = C.kline_ret(kl, code, dt, 1)
    d2 = C.kline_ret(kl, code, dt, 2)
    d3 = C.kline_ret(kl, code, dt, 3)
    has = pd.notna(d1) or pd.notna(d2) or pd.notna(d3)
    t3 = (1 if ((pd.notna(d1) and d1 >= thr) or (pd.notna(d2) and d2 >= thr)
                or (pd.notna(d3) and d3 >= thr)) else 0) if has else np.nan
    pre3 = C.pre3_ret(kl, code, dt)
    cap_v = pd.to_numeric(r.get("FREE_MARKET_CAP"), errors="coerce")
    log_cap = float(np.log10(cap_v)) if pd.notna(cap_v) and cap_v > 0 else np.nan
    net_bs = pd.to_numeric(r.get("NET_BS_AMT"), errors="coerce")
    net_yi = float(net_bs / 1e8) if pd.notna(net_bs) else np.nan
    is_zt = 1 if C.is_limit_up(r.get("CHANGE_RATE"), code) else 0
    return {"dt": dt, "code": code, "name": name, "lp": lp, "d1": d1, "d2": d2, "d3": d3,
            "t3": t3, "pre3": pre3, "log_cap": log_cap, "net_yi": net_yi, "is_zt": is_zt}


def _seat_features(r, sb, ss, seat_scorer):
    """个股席位侧特征: 买方(现有) + 卖方席位质量 + 筹码集中度(盘后已知, 因果无泄漏)"""
    dt, code = r["TRADE_DATE"], r["SECURITY_CODE"]
    # ---- 买方 ----
    g = sb[(sb["TRADE_DATE"] == dt) & (sb["SECURITY_CODE"] == code)]
    if len(g) == 0:
        return None
    names = g["OPERATEDEPT_NAME"].astype(str)
    scores = pd.to_numeric(names.apply(lambda n: seat_scorer(n, dt)), errors="coerce").fillna(0.0)
    buyer_top = round(float(scores.max()), 2)
    buyer_mean = round(float(scores.mean()), 2)
    buyer_count = int(names.nunique())
    has_inst = 1 if names.str.contains("机构").any() else 0
    has_hk = 1 if names.str.contains("沪股通|深股通|陆股通").any() else 0
    retail_buy = g.loc[~names.str.contains("机构"), "BUY"].sum()
    total_buy = g["BUY"].sum()
    retail_ratio = round(float(retail_buy / total_buy), 3) if total_buy > 0 else 0.0
    famous = 1 if names.apply(lambda x: any(f in str(x) for f in C.FAMOUS)).any() else 0
    sb_amt = pd.to_numeric(r.get("SUM_BUY_AMT"), errors="coerce")
    ss_amt = pd.to_numeric(r.get("SUM_SELL_AMT"), errors="coerce")
    net_buy_ratio = (round(float(sb_amt / (sb_amt + ss_amt)), 3)
                     if pd.notna(sb_amt) and pd.notna(ss_amt) and (sb_amt + ss_amt) > 0 else 0.5)
    # ---- 卖方席位质量 ----
    gg = ss[(ss["TRADE_DATE"] == dt) & (ss["SECURITY_CODE"] == code)]
    if len(gg) == 0:
        seller_top, seller_mean = np.nan, np.nan
    else:
        snames = gg["OPERATEDEPT_NAME"].astype(str)
        sscores = pd.to_numeric(snames.apply(lambda n: seat_scorer(n, dt)), errors="coerce").dropna()
        seller_top = round(float(sscores.max()), 2) if len(sscores) else np.nan
        seller_mean = round(float(sscores.mean()), 2) if len(sscores) else np.nan
    return (buyer_top, buyer_mean, buyer_count, has_inst, has_hk, retail_ratio, famous,
            net_buy_ratio, seller_top, seller_mean)


def _theme_features(r, code2theme, theme_daily, theme_scorer):
    dt, code = r["TRADE_DATE"], r["SECURITY_CODE"]
    tags = code2theme.get((dt, code), [])
    up = theme_scorer(dt)
    theme_main = 1 if any(t in up for t in tags) else 0
    theme_strength = max([theme_daily.get(dt, {}).get(t, 0) for t in tags], default=0)
    return theme_main, theme_strength


def _build_rows(board, sb, ss, kl, market_zt, seat_scorer, theme_scorer, code2theme, theme_daily):
    rows = []
    for _, r in board.iterrows():
        code = str(r.get("SECURITY_CODE", ""))
        name = str(r.get("SECURITY_NAME_ABBR", ""))
        if "ST" in name.upper():
            continue
        if code.startswith(("900", "200")):   # B股(深B/沪B)排除, 涨跌幅/流动性异于A股
            continue
        sf = _seat_features(r, sb, ss, seat_scorer)
        if sf is None:
            continue
        f = _row_features(r, kl)
        (buyer_top, buyer_mean, buyer_count, has_inst, has_hk, retail_ratio, famous,
         net_buy_ratio, seller_top, seller_mean) = sf
        (theme_main, theme_strength) = _theme_features(r, code2theme, theme_daily, theme_scorer)
        reason = C.reason_cat(r.get("EXPLANATION", ""))
        rows.append({
            "TRADE_DATE": f["dt"], "CODE": f["code"], "NAME": f["name"],
            "CHANGE_RATE": r.get("CHANGE_RATE"), "TURNOVERRATE": r.get("TURNOVERRATE"),
            "LOG_CAP": f["log_cap"], "NET_YI": f["net_yi"], "IS_LIMIT_UP": f["is_zt"],
            "PRE3_RET": f["pre3"], "REASON": reason,
            "BUYER_TOP_SCORE": buyer_top, "BUYER_MEAN_SCORE": buyer_mean,
            "BUYER_COUNT": buyer_count, "NET_BUY_RATIO": net_buy_ratio,
            "RETAIL_RATIO": retail_ratio, "HAS_INST": has_inst, "HAS_HK": has_hk,
            "FAMOUS_YZ": famous, "THEME_MAIN": theme_main,
            "THEME_STRENGTH": theme_strength, "MARKET_ZT": round(market_zt.get(f["dt"], 0.0), 3),
            "LOW_XI": 1 if reason == "跌幅偏离" else 0,
            "SELLER_TOP_SCORE": seller_top, "SELLER_MEAN_SCORE": seller_mean,
            "LB_FLAG": 1 if (f["is_zt"] and pd.notna(f["pre3"]) and f["pre3"] >= 18) else 0,
            "LIMIT": f["lp"], "D1": f["d1"], "D2": f["d2"], "D3": f["d3"], "T3_ZT": f["t3"],
        })
    return rows


def _market_zt(board):
    board = board.copy()
    board["_zt"] = [int(C.is_limit_up(board["CHANGE_RATE"].iloc[i], board["SECURITY_CODE"].iloc[i]))
                    for i in range(len(board))]
    mkt = board.groupby("TRADE_DATE").agg(zt=("_zt", "sum"), tot=("_zt", "size"))
    return (mkt["zt"] / mkt["tot"]).to_dict()


def build_all():
    board = C.load_board()
    if len(board) == 0:
        print("[dataset] 无 board 数据"); return None
    sb = C.load_seats_buy()
    ss = C.load_seats_sell()
    kl = C.load_klines()
    market_zt = _market_zt(board)
    seat_scorer = CL.build_seat_scorer()
    theme_scorer = CL.build_theme_scorer()
    _, code2theme, theme_daily = C.load_theme_map()
    rows = _build_rows(board, sb, ss, kl, market_zt, seat_scorer, theme_scorer, code2theme, theme_daily)
    df = pd.DataFrame(rows).drop_duplicates(subset=["TRADE_DATE", "CODE"]).reset_index(drop=True)
    df.to_csv(C.DATASET_CSV, index=False, encoding="utf-8-sig")
    lab = df.dropna(subset=["T3_ZT"])
    print(f"[dataset] 行数 {len(df)}  有标签 {len(lab)}  正例 {int(lab['T3_ZT'].sum())} ({lab['T3_ZT'].mean()*100:.1f}%)")
    return df


def build_date(dt):
    """增量: 仅重算 dt 当日行并合并"""
    board = C.load_board()
    sub = board[board["TRADE_DATE"] == dt]
    if len(sub) == 0:
        print(f"[dataset] {dt} 无 board 数据"); return None
    sb = C.load_seats_buy()
    ss = C.load_seats_sell()
    kl = C.load_klines()
    market_zt = _market_zt(board)  # 市场情绪用全期(各日期独立, 无泄漏)
    seat_scorer = CL.build_seat_scorer()
    theme_scorer = CL.build_theme_scorer()
    _, code2theme, theme_daily = C.load_theme_map()
    rows = _build_rows(sub, sb, ss, kl, market_zt, seat_scorer, theme_scorer, code2theme, theme_daily)
    new = pd.DataFrame(rows)
    old = pd.read_csv(C.DATASET_CSV, dtype={"CODE": str}) if os.path.exists(C.DATASET_CSV) else pd.DataFrame()
    if len(old):
        old = old[old["TRADE_DATE"] != dt]
        df = pd.concat([old, new], ignore_index=True)
    else:
        df = new
    df = df.drop_duplicates(subset=["TRADE_DATE", "CODE"]).reset_index(drop=True)
    df.to_csv(C.DATASET_CSV, index=False, encoding="utf-8-sig")
    print(f"[dataset] {dt} 追加 {len(new)} 行, 总计 {len(df)} 行")
    return df


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 2:
        build_date(sys.argv[1])
    else:
        build_all()