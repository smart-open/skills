# -*- coding: utf-8 -*-
"""因果特征索引(消除未来泄漏)
问题: 原实现用「全期」席位画像(含上榜后 T+5 涨幅)与「全期」主线题材 TopK,
      训练样本在日期 d 就用到了 d 之后的信息, 导致时间外 AUC 虚高。
解决: 对每个样本日期 d, 只用「截至 d 已可观测」的信息:
      · 席位分: 行为(打板/低吸/净买, 当日盘后已知)累计到 d; T+5 表现仅计入已结算(结算日<=d)的记录。
      · 主线题材: 题材累计计数仅统计热榜日期 <= d 的文件。
提供两个 scorer: build_seat_scorer() / build_theme_scorer()
"""
import os, json, re
import numpy as np
import pandas as pd
import _common as C

# 席位打板/低吸阈值(与 seat_profile 口径一致, 主板为主)
_ZT_CHG = 9.5
_DIP_CHG = -7.0


def _settle_date(kl, code, dt):
    """上榜日 dt 之后第 5 个交易日的日期(该记录的 T+5 表现的结算日), 未知返回 None"""
    m = kl.get(str(code))
    if not m or dt not in m:
        return None
    ds = sorted(m)
    i = ds.index(dt)
    return ds[i + 5] if i + 5 < len(ds) else None


def build_seat_scorer():
    """返回 scorer(seat, date)->float 综评(因果)；seat 无历史或 date 前无记录返回 np.nan"""
    sb = C.load_seats_buy()
    if len(sb) == 0:
        return lambda seat, date: np.nan

    kl = C.load_klines()
    b = C.load_board()
    d5 = b[["TRADE_DATE", "SECURITY_CODE", "D5_CLOSE_ADJCHRATE"]].drop_duplicates(
        subset=["TRADE_DATE", "SECURITY_CODE"])
    sb = sb.merge(d5, on=["TRADE_DATE", "SECURITY_CODE"], how="left")
    sb = sb.copy()
    sb["CHG"] = pd.to_numeric(sb.get("CHANGE_RATE"), errors="coerce")
    sb["NET"] = pd.to_numeric(sb.get("NET"), errors="coerce")
    sb["D5"] = pd.to_numeric(sb.get("D5_CLOSE_ADJCHRATE"), errors="coerce")
    sb["SETTLE"] = [ _settle_date(kl, c, d) for c, d in zip(sb["SECURITY_CODE"], sb["TRADE_DATE"]) ]

    # EB 先验中枢: 上榜>=20次席位的 D5 全局均值(仅作收缩目标, 影响被 K 限制)
    n_by_seat = sb.groupby("OPERATEDEPT_NAME")["OPERATEDEPT_NAME"].transform("size")
    prior = float(sb.loc[n_by_seat >= 20, "D5"].mean()) if (n_by_seat >= 20).any() else 0.0
    if not np.isfinite(prior):
        prior = 0.0
    K = C.EB_K

    # 每个席位构建前缀聚合: 行为按 TRADE_DATE 累计, T5 按 SETTLE 累计
    series = {}
    for seat, g in sb.groupby("OPERATEDEPT_NAME"):
        g = g.sort_values("TRADE_DATE")
        t_dates = g["TRADE_DATE"].astype(str).values
        chg = pd.to_numeric(g["CHG"], errors="coerce").fillna(0).values
        net = pd.to_numeric(g["NET"], errors="coerce").fillna(0).values
        d5v = g["D5"].values
        settle = g["SETTLE"].values
        # 行为前缀
        zt_cnt = np.cumsum(chg >= _ZT_CHG)
        n_cum = np.arange(1, len(g) + 1)
        net_cum = np.cumsum(net)
        # T5 已结算前缀: 仅取 SETTLE 非空, 按 SETTLE 排序
        mset = pd.notna(settle)
        st_idx = np.where(mset)[0]
        st_dates = np.array([str(x) for x in settle[mset]])
        st_d5 = d5v[mset]
        order = np.argsort(st_dates, kind="stable")
        st_dates = st_dates[order]
        st_d5_sum = np.cumsum(np.nan_to_num(st_d5[order], nan=0.0))
        st_d5_n = np.cumsum(pd.notna(st_d5[order]).astype(int))
        series[seat] = (t_dates, zt_cnt, n_cum, net_cum, st_dates, st_d5_sum, st_d5_n)

    def scorer(seat, date):
        s = series.get(seat)
        if s is None:
            return np.nan
        t_dates, zt_cnt, n_cum, net_cum, st_dates, st_d5_sum, st_d5_n = s
        d = str(date)
        ib = int(np.searchsorted(t_dates, d, side="right"))   # 行为截止(<=date)
        if ib <= 0:
            return np.nan
        n = int(n_cum[ib - 1])
        dapan = float(zt_cnt[ib - 1]) / n * 100.0
        net_yi = float(net_cum[ib - 1]) / 1e8
        it = int(np.searchsorted(st_dates, d, side="right"))  # T5 结算截止(<=date)
        t5_n = int(st_d5_n[it - 1]) if it > 0 else 0
        t5_sum = float(st_d5_sum[it - 1]) if it > 0 else 0.0
        momentum = (K * prior + t5_sum) / (K + t5_n) if t5_n > 0 else prior
        score = momentum * 0.6 + np.clip(net_yi, -5.0, 40.0) * 0.3 + dapan * 0.05
        return round(float(score), 2)

    return scorer


def build_theme_scorer():
    """返回 scorer(date)->set(主线题材Tag)；基于截至 date 的题材累计计数 TopK, 消除未来泄漏"""
    if not os.path.isdir(C.HOT_DIR):
        return lambda date: set()

    # 按日期升序累计题材计数 -> 每个热榜日期的主线集合
    cnt = {}
    seq = []  # (date, snapshot_set)
    fns = sorted(f for f in os.listdir(C.HOT_DIR) if f.endswith(".json"))
    for fn in fns:
        dt = os.path.basename(fn)[4:14]
        try:
            data = json.load(open(os.path.join(C.HOT_DIR, fn), encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, dict):
            data = data.get("data") or []
        for r in data:
            reason = str(r.get("reason", "") or "")
            tags = [t.strip() for t in re_split_tags(reason) if t.strip()]
            for t in tags:
                cnt[t] = cnt.get(t, 0) + 1
        up = set(sorted(cnt, key=lambda k: cnt[k], reverse=True)[:C.TOPK_THEME])
        seq.append((dt, frozenset(up)))

    from bisect import bisect_right
    ds = [x[0] for x in seq]

    def scorer(date):
        d = str(date)
        i = bisect_right(ds, d) - 1
        return set(seq[i][1]) if i >= 0 else set()

    return scorer


def re_split_tags(reason):
    import re
    return re.split(r"[+＋、,，/]", str(reason))