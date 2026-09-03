# -*- coding: utf-8 -*-
"""两策略筛选 + 评分（0~100）+ 第二日操作建议（数据驱动模板）。

会消费 data/pools_{T}.json 与 data/stocks_{T}.json，产出 data/screen_{T}.json：
  screen = { T, strategy1: [选股记录...], strategy2: [选股记录...], backup: {...} }
每选股记录含：评分画像(metrics)、评分、操作建议(advice)、备选信息。
"""
import os
import sys
import argparse
import statistics

from _common import (BASE, load_json, dump_json, safe_float)

ap = argparse.ArgumentParser(description="两策略筛选评分 + 操作建议")
ap.add_argument("--date", default=None, help="目标交易日 YYYYMMDD")
_args = ap.parse_args()


def resolve_target():
    import glob
    if _args.date:
        return _args.date
    files = sorted(glob.glob(os.path.join(BASE, "data", "pools_*.json")))
    if not files:
        raise SystemExit("!! 未找到 data/pools_*.json")
    return files[-1].split("pools_")[-1].split(".")[0]


# ---------- 技术指标 ----------
def ma(closes, n):
    if len(closes) < n:
        return None
    return sum(closes[-n:]) / n


def pct(a, b):
    if not b:
        return 0.0
    return (a - b) / b * 100


def metrics_from_klines(klines, target, base_price=None, prev_close=None):
    """根据日K计算画像指标。klines: 升序（旧→新）列表。"""
    if not klines:
        return None
    closes = [k["c"] for k in klines]
    highs = [k["h"] for k in klines]
    lows = [k["l"] for k in klines]
    vols = [k["v"] for k in klines]
    price = closes[-1]
    ma5, ma10, ma21, ma60 = ma(closes, 5), ma(closes, 10), ma(closes, 21), ma(closes, 60)

    # T 日（最后一根）的量价
    cur = klines[-1]
    prev = klines[-2] if len(klines) >= 2 else cur
    chg_t = pct(cur["c"], prev["c"])
    vol_ratio = cur["v"] / (sum(vols[-6:-1]) / 5) if len(vols) >= 5 and vols[-5] > 0 else 0
    if not (len(vols) >= 5 and sum(vols[-6:-1]) > 0):
        vol_ratio = cur["v"] / (sum(vols[:-1]) / len(vols[:-1])) if sum(vols[:-1]) > 0 else 0
    body = cur["c"] - cur["o"]
    upper_shadow = (cur["h"] - max(cur["o"], cur["c"])) if cur["h"] > 0 else 0
    is_yang = cur["c"] >= cur["o"]

    high250 = max(highs[-250:]) if len(highs) >= 250 else max(highs)
    low250 = min(lows[-250:]) if len(lows) >= 250 else min(lows)
    drawdown = (high250 - price) / high250 * 100 if high250 else 0
    # 位置画像：250日区间相对位置(0~100%) / 距250日高回撤 / 20日涨幅（用于"从底部起来"判断）
    pos_range = (price - low250) / (high250 - low250) * 100 if high250 > low250 else 100.0
    chg20 = pct(price, closes[-21]) if len(closes) > 21 else 0.0
    # 波动率因子：20 日收益率标准差（%），量化风险因子，越低越稳
    vol20 = None
    if len(closes) > 20:
        rets = [pct(closes[i], closes[i - 1]) for i in range(len(closes) - 20, len(closes))]
        if len(rets) > 2:
            vol20 = statistics.stdev(rets)

    # 分时画像（回填在 collect 后由本脚本单独算，这里不依赖）
    return {
        "price": round(price, 2), "chg_t": round(chg_t, 2), "vol_ratio": round(vol_ratio, 2),
        "ma5": round(ma5, 2) if ma5 else None, "ma10": round(ma10, 2) if ma10 else None,
        "ma21": round(ma21, 2) if ma21 else None, "ma60": round(ma60, 2) if ma60 else None,
        "drawdown": round(drawdown, 2), "chg60": round(pct(price, closes[-61]) if len(closes) > 61 else 0, 2),
        "high250": round(high250, 2) if high250 else None, "low250": round(low250, 2) if low250 else None,
        "cur": cur, "prev": prev,
        "is_yang": is_yang, "body": round(body, 3), "upper_shadow": round(upper_shadow, 3),
        "above_ma60": bool(ma60 and price > ma60),
        "above_ma5": bool(ma5 and price >= ma5),
        "vol_ratio": round(vol_ratio, 2),
        "pos_range": round(pos_range, 1), "chg20": round(chg20, 1),
        "vol20": round(vol20, 2) if vol20 else None,
    }


# ---------- 技术趋势分析（资金/趋势维度共用）----------
def _ema(vals, n):
    if not vals:
        return None
    k = 2.0 / (n + 1)
    e = vals[0]
    for x in vals[1:]:
        e = x * k + e * (1 - k)
    return e


def _rsi(closes, n=14):
    """RSI(14)，简单法；数据不足返回 None。超买>85/超卖<30 标记。"""
    if len(closes) <= n:
        return None
    gains = losses = 0.0
    for i in range(len(closes) - n, len(closes)):
        ch = closes[i] - closes[i - 1]
        if ch >= 0:
            gains += ch
        else:
            losses -= ch
    if gains + losses == 0:
        return 50.0
    return 100.0 - 100.0 / (1.0 + gains / losses)


def macd_vals(closes, short=12, long=26, signal=9):
    """MACD：{dif, dea, hist, golden金叉, die死叉, above_zero}；数据不足返回 None。"""
    if len(closes) < long + signal:
        return None
    difs = []
    for idx in range(long, len(closes)):
        e_s = _ema(closes[:idx + 1], short)
        e_l = _ema(closes[:idx + 1], long)
        difs.append(e_s - e_l)
    if not difs:
        return None
    dea = _ema(difs, signal)
    if dea is None or difs[-1] is None:
        return None
    golden = die = False
    if len(difs) >= 2:
        dea_prev = _ema(difs[:-1], signal)
        if dea_prev is not None:
            if difs[-1] > dea and difs[-2] <= dea_prev:
                golden = True
            if difs[-1] < dea and difs[-2] >= dea_prev:
                die = True
    return {"dif": round(difs[-1], 3), "dea": round(dea, 3),
            "hist": round((difs[-1] - dea) * 2, 3),
            "golden": golden, "die": die, "above_zero": difs[-1] > 0}


def trend_analysis(metrics, klines):
    """技术趋势画像（纯 K线，无外联）：均线多头排列 / MACD / RSI / 量能趋势 → trend 分(0~100)+标签。
    metrics 为 metrics_from_klines 输出。返回 dict(score, label, bull, macd_txt, rsi, vol_trend, desc)。"""
    empty = {"score": 50, "label": "数据不足", "bull": None, "macd_txt": "—",
             "rsi": None, "vol_trend": None, "desc": "K线不足，趋势暂无法评估"}
    if not metrics or not klines or len(klines) < 30:
        return empty
    closes = [k["c"] for k in klines]
    vols = [k["v"] for k in klines]
    price = metrics.get("price") or 0
    ma5, ma10, ma21, ma60 = (metrics.get("ma5"), metrics.get("ma10"),
                             metrics.get("ma21"), metrics.get("ma60"))

    # ① 均线多头排列强度 (0~1)
    bull = None
    if ma5 and ma10 and ma21 and ma60:
        bull = round(((ma5 >= ma10) + (ma10 >= ma21) + (ma21 >= ma60)) / 3.0, 2)
    elif ma5 and ma10 and ma21:
        bull = round(((ma5 >= ma10) + (ma10 >= ma21)) / 2.0, 2)

    # ② MACD
    mv = macd_vals(closes)

    # ③ 量能趋势（5日均量/20日均量）
    vol_trend = None
    if len(vols) >= 21:
        v5 = sum(vols[-5:]) / 5
        v20 = sum(vols[-21:-1]) / 20
        vol_trend = round(v5 / v20, 2) if v20 else None

    # ④ RSI
    rsi = _rsi(closes, 14)

    score = 0.0
    score += (bull if bull else 0) * 30
    if ma21 and price >= ma21:
        score += 15
    if ma60 and price >= ma60:
        score += 10
    if mv:
        if mv["golden"]:
            score += 15
        elif mv["dif"] > mv["dea"]:
            score += 8
        if mv["above_zero"]:
            score += 6
        if mv["die"]:
            score -= 12
    if rsi is not None:
        if 40 <= rsi <= 78:
            score += 12
        elif rsi < 30:
            score += 8
        elif rsi > 85:
            score -= 10
    dd = metrics.get("drawdown", 0) or 0
    if dd >= 20:
        score += 8
    elif dd >= 8:
        score += 5
    if metrics.get("pos_range") and metrics["pos_range"] > 72:
        score -= 12
    score = round(min(max(score, 0), 100))

    # 标签：先看强弱趋势，再退到中性风险描述（避免把 MACD 刚转强、刚站上短均线的抄底票误标为空头）
    if bull and bull >= 0.666 and ma21 and price >= ma21:
        label = "多头上升"
    elif dd >= 20:
        label = "低位启动"
    elif mv and mv["golden"]:
        label = "底部金叉"
    elif price < ma60 and not (mv and mv["dif"] > mv["dea"]):
        label = "空头下行"
    elif price < ma60:
        label = "超跌企稳"
    elif metrics.get("pos_range") and metrics["pos_range"] > 72:
        label = "高位偏风险"
    else:
        label = "平台整理"

    macd_txt = ("金叉" if mv and mv["golden"]
                else (("多头" if mv and mv["dif"] > mv["dea"] else "偏弱")
                      if mv else "—"))
    vol_txt = ("放量" if vol_trend and vol_trend >= 1.2
               else ("缩量" if vol_trend and vol_trend <= 0.8 else "平量")
               if vol_trend else "—")
    plt = "多头排列" if bull and bull >= 0.666 else (("偏多" if bull and bull >= 0.5 else "杂乱/偏空") if bull is not None else "—")
    desc = (f"均线{plt} · MACD {macd_txt}{'(水上)' if mv and mv['above_zero'] else ''} · "
            f"量能{vol_txt} · RSI {round(rsi, 0) if rsi is not None else '—'}")
    return {"score": score, "label": label, "bull": bull, "macd_txt": macd_txt,
            "rsi": round(rsi, 1) if rsi is not None else None,
            "vol_trend": vol_trend, "desc": desc}


def minute_metrics(minute_rows, prev_close, limit_up_price):
    """分时画像：强洗盘意图相关。

    - 收盘上涨幅 / 高点涨幅 / 低点涨幅
    - 收盘相对分时均价（VWAP）：
      * close_above_avg：收盘站上全天均价（承接强）
      * vwap_gap% = 收盘距全天均价幅度（越大越强，全天压购销盘）
    - 是否盘中触/封过涨停（hit_limit）
    - 距日高回吐 pull_from_high_pct = 高点涨幅 - 收盘涨幅（越小=收在高位=洗盘强）
    - 振幅 amplitude
    """
    if not minute_rows or not prev_close:
        return None
    ps = [m["p"] for m in minute_rows]
    avgs = [m["avg"] for m in minute_rows if m.get("avg")]
    hi, lo = max(ps), min(ps)
    last = ps[-1]
    avg_last = avgs[-1] if avgs else None
    high_pct = round(pct(hi, prev_close), 2)
    close_pct = round(pct(last, prev_close), 2)
    vwap_gap = round((last - avg_last) / avg_last * 100, 2) if avg_last else None
    return {
        "high_pct": high_pct,
        "low_pct": round(pct(lo, prev_close), 2),
        "close_pct": close_pct,
        "close_above_avg": bool(avg_last and last >= avg_last),
        "vwap_gap": vwap_gap,
        "hit_limit": bool(limit_up_price and hi >= limit_up_price * 0.995),
        "pull_from_high": round(high_pct - close_pct, 2),
        "amplitude": round((hi - lo) / prev_close * 100, 2),
    }


# ===== 用户硬性门槛（质量闸门）=====
# 流通市值 ≥50 亿（100~300 亿最佳）；放量换手 ≥5%；成交额 ≥5 亿；量比 ≥2
def hard_gate(v, liutong_min=50.0, turnover_min=5.0, amount_min=5.0, vr_min=2.0):
    """返回 (是否全过门槛, {各维度是否达标, 市值档位, 量比参考门槛})。
    新增位置维度：非高位 / 从底部起来。高位(贴顶/区间上沿/短期暴涨过热)一律剔除。
    量比门槛随市值自适应放宽：大票(300亿+)天然放量比低，改以成交额/换手(量能)为主要判据；
    中大盘(100-300亿)适度放宽到 1.5；小盘仍从严 2.0。"""
    lt = v["liutong_yi"]
    band = "300+" if lt > 300 else ("100-300" if 100 <= lt <= 300 else ("50-100" if lt >= 50 else "<50"))
    vr_req = 1.2 if band == "300+" else (1.5 if band == "100-300" else vr_min)
    checks = {
        "liutong": lt >= liutong_min,
        "turnover": v["turnover"] >= turnover_min,
        "amount": v["amount_yi"] >= amount_min,
        "vol_ratio": v["vol_ratio"] >= vr_req,
        "position": v["pos_ok"],
    }
    ok = all(checks.values())
    band_rank = {"100-300": 3, "50-100": 2, "300+": 1, "<50": 0}[band]
    return ok, {"checks": checks, "band": band, "band_rank": band_rank, "vr_req": vr_req}


def position_ok(metrics):
    """从底部起来 / 非高位：距250日高≥8%、位居250区间≤68%、20日涨幅≤40%（排除贴顶/区间上沿/短期暴涨）。"""
    dd = metrics.get("drawdown") or 0
    pr = metrics.get("pos_range")
    g20 = metrics.get("chg20") or 0
    return bool(dd >= 8.0 and (pr is None or pr <= 68.0) and g20 <= 40.0)


def limit_up_price(idx, base_price, prev_close=None):
    """非ST/主板按集合竞价位估算涨停价（round 至 0.01）。未命中返回 None。"""
    if idx in (0, 1):
        if prev_close:
            return round(prev_close * 1.1, 2)
        if base_price:
            return round(base_price * 1.1, 2)
    if idx in (2, 3, 5):
        return round(prev_close * 1.2, 2)
    return None


# ---------- 评分模型 ----------
def _clamp01(x):
    return min(max(x, 0.0), 1.0)


def _washout_qual(m):
    """强洗盘意图综合（分时 + 量能），返回 0~1 强度。由两个策略共用。"""
    mm = m.get("minute") or {}
    vr = m.get("vol_ratio", 0) or 0
    tt = m.get("turnover", 0) or 0
    # ① 放量（量比 + 换手）：放量力度
    vq = _clamp01((vr - 1.0) / 2.0) * 0.55 + _clamp01((tt - 5.0) / 12.0) * 0.45
    # ② 承接（分时站在全天均价上方 + 收盘距VWAP为正）
    hq = 0.0
    if mm.get("close_above_avg"):
        hq += 0.6
        gap = mm.get("vwap_gap") or 0
        hq += 0.4 * _clamp01((gap or 0) / 3.0)
    # ③ 强意图（盘中触/封过涨停）
    iq = 1.0 if mm.get("hit_limit") else _clamp01(((mm.get("high_pct") or 0) - 4.0) / 6.0)
    # ④ 收在高位（距日高回吐小）
    rq = 1.0 - _clamp01((mm.get("pull_from_high") or 0) / 8.0)
    # 位置维度移出洗盘（否则与 pos/trend 因子对"回撤"三重计数），由独立「位置安全」因子承载
    return {
        "vq": round(vq, 2), "hq": round(hq, 2), "iq": round(iq, 2),
        "rq": round(rq, 2),
        "washout": round(0.33 * vq + 0.31 * hq + 0.20 * iq + 0.16 * rq, 3),
    }


# ============================================================
# 多因子横截面标准化评分模型（量化选股核心）
# 原则：① 因子先提原始值 ② 在候选池内做横截面分位 (0~100)
#       ③ 按集中配置的权重加权合成（和为 1，可解释、可回测调整）
# ============================================================
FACTORS = {
    "washout": {"higher": True,  "label": "洗盘强度"},
    "trend":   {"higher": True,  "label": "趋势"},
    "fund":    {"higher": True,  "label": "资金"},
    "vol":     {"higher": False, "label": "低波动"},
    "pos":     {"higher": True,  "label": "位置安全"},
    "liq":     {"higher": True,  "label": "流动性"},
}
# 因子覆盖度门槛：有效样本占比/数量低于此的因子视作无信息，自动降权让位
MIN_FACTOR_COVERAGE = 0.2
MIN_FACTOR_N = 2

# 两策略权重（和为 1）。S2 炸板更重洗盘强度与资金承接；S1 首板更重趋势与位置安全。
FACTOR_WEIGHTS = {
    "S1": {"washout": 0.30, "trend": 0.20, "fund": 0.14, "vol": 0.10, "pos": 0.16, "liq": 0.10},
    "S2": {"washout": 0.36, "trend": 0.16, "fund": 0.18, "vol": 0.12, "pos": 0.10, "liq": 0.08},
}

# 权重和必须为 1（集中配置便于调参/回测，运行期自检防误改）
for _stg, _wts in FACTOR_WEIGHTS.items():
    _s = sum(_wts.values())
    assert abs(_s - 1.0) < 1e-9, f"!! {_stg} 因子权重和={_s}，必须=1"


def raw_factors(v):
    """从选股记录提取原始因子值。缺失一律 None（评分记中性 50，不做 0 惩罚）。"""
    k = v.get("metrics") or {}
    fr = v.get("fund_ratio")
    return {
        "washout": _washout_qual(v)["washout"],          # 0~1 洗盘强度（分时承接+触板+收高+放量）
        "trend": (v.get("trend") or {}).get("score"),    # 0~100 趋势（均线/MACD/RSI/量能）
        "fund": fr if fr is not None and fr != 0 else None,  # 主力净流入强度（占成交额%），去规模化
        "vol": k.get("vol20"),                            # 20 日收益波动率（%）
        "pos": v.get("drawdown"),                         # 距 250 日高回撤（%），越大安全边际越高
        "liq": v.get("amount_yi") if v.get("amount_yi") else None,  # 成交额（亿）
    }


def _mad_winsorize(vals):
    """稳健去极值：median ± 3×1.4826×MAD 截断，防止单只离群票主导整列分位。"""
    if len(vals) < 3:
        return list(vals)
    med = statistics.median(vals)
    mad = statistics.median([abs(x - med) for x in vals]) or 0.0
    if mad == 0:
        return list(vals)
    lo = med - 3.0 * 1.4826 * mad
    hi = med + 3.0 * 1.4826 * mad
    return [min(max(x, lo), hi) for x in vals]


def cross_rank_pct(values, higher=True, shrink_k=2.0):
    """稳健横截面分位（0~100）：去极值 → 均秩分位（并列值同分）→ 小样本收缩。

    缺失 None 记中性 50（不惩罚）；单样本给 50。样本越小对极端分位越向 50 收缩，
    避免 2~3 只候选池内打出 100/0 的过度自信分。返回与输入等长 list[float]。"""
    n = len(values)
    out = [50.0] * n
    idxs = [i for i, x in enumerate(values)
            if x is not None and isinstance(x, (int, float))]
    if not idxs:
        return out
    m = len(idxs)
    if m == 1:
        return out
    ws = _mad_winsorize([values[i] for i in idxs])
    pairs = sorted(zip(idxs, ws), key=lambda p: p[1], reverse=higher)
    i = 0
    while i < m:
        j = i
        while j + 1 < m and pairs[j + 1][1] == pairs[i][1]:
            j += 1
        # 并列值取平均秩 → 同分
        pct = 100.0 * (1.0 - (i + j) / 2.0 / (m - 1.0))
        for t in range(i, j + 1):
            out[pairs[t][0]] = pct
        i = j + 1
    shrink = m / (m + shrink_k)
    for idx in idxs:
        out[idx] = 50.0 + (out[idx] - 50.0) * shrink
    return out


def score_by_factors(pool, strategy):
    """对候选池做横截面标准化 + 加权合成（原地写回 score 与因子分解）。

    稳健化三件套：
    ① 先按因子覆盖度降权：有效样本占比 < MIN_FACTOR_COVERAGE 或样本 < MIN_FACTOR_N 的因子
       （如炸板池资金 90% 缺失）视作无信息，权重置 0 并按比例重分配给其余因子，避免噪声因子硬占权重。
    ② 横截面均秩分位（并列同分）＋ MAD 去极值 ＋ 小样本收缩。
    ③ 缺失值记中性 50，不惩罚。

    写回 v["score"]/v["score2"]、v["factors"]；
    返回 (pool, eff_meta)：{key: {valid, masked, w_eff}} 供诊断/报告。"""
    keys = list(FACTOR_WEIGHTS[strategy].keys())
    w_prior = FACTOR_WEIGHTS[strategy]

    # ① 覆盖度：有效样本占比与数量
    valid_n = {}
    for key in keys:
        valid_n[key] = sum(1 for v in pool
                           if (v.get("raw_f", {}) or {}).get(key) is not None)
    n_pool = len(pool)
    active = {}
    for key in keys:
        cov = valid_n[key] / n_pool if n_pool else 0.0
        active[key] = bool(cov >= MIN_FACTOR_COVERAGE and valid_n[key] >= MIN_FACTOR_N)
    if not any(active.values()):
        # 极端兜底：全缺失时还原先验权重，避免总权重为 0
        active = {k: True for k in keys}
    active_sum = sum(w_prior[k] for k in keys if active[k]) or 1.0
    w_eff = {k: (w_prior[k] / active_sum if active[k] else 0.0) for k in keys}

    # ② 横截面分位
    pct_maps = {}
    for key in keys:
        vals = [v.get("raw_f", {}).get(key) for v in pool]
        pct_maps[key] = cross_rank_pct(vals, FACTORS[key]["higher"])

    # ③ 加权合成 + 因子分解
    for pidx, v in enumerate(pool):
        total = 0.0
        factors = {}
        for key in keys:
            w = w_eff[key]
            pct_ = pct_maps[key][pidx]
            raw = v.get("raw_f", {}).get(key)
            contrib = pct_ * w
            total += contrib
            factors[key] = {
                "raw": raw, "pct": round(pct_, 1), "w": round(w, 3),
                "w_prior": w_prior[key], "masked": not active[key],
                "contrib": round(contrib, 1),
                "label": FACTORS[key]["label"], "higher": FACTORS[key]["higher"],
            }
        score = round(total)
        if strategy == "S1":
            v["score"] = score
        else:
            v["score2"] = score
        v["factors"] = factors

    eff_meta = {k: {"valid": valid_n[k], "masked": not active[k],
                    "w_eff": round(w_eff[k], 3), "w_prior": w_prior[k]} for k in keys}
    return pool, eff_meta


def build_advice(m, strategy, target):
    """第二日操作建议（数据驱动模板）。m 为画像 dict。"""
    k = m.get("metrics") or {}
    mm = m.get("minute") or {}
    price = k.get("price", 0)
    ma5 = k.get("ma5")
    ma21 = k.get("ma21")
    high250 = k.get("high250")
    vr = m.get("vol_ratio", 0) or 0
    cp = mm.get("close_pct", 0) or 0

    target_price = None
    if high250 and high250 > price:
        target_price = round(price + (high250 - price) * 0.25, 2)  # 前高回补的第一目标区域
    else:
        target_price = round(price * 1.06, 2)
    stop_price = None
    if ma5:
        stop_price = round(ma5 * 0.97, 2)
    elif ma21:
        stop_price = round(ma21 * 0.95, 2)

    # 强洗盘信号由 _washout_qual 给出，替换易误判的单因子判定
    wq = _washout_qual(m)
    wash = wq["washout"]
    # 主力筛洗特征：放量(vq) + 承接(hq) + 收在高位(rq) 都偏强
    strong = wash >= 0.62 and k.get("above_ma5") and mm.get("close_above_avg")
    weak = k.get("upper_shadow", 0) > (k.get("cur", {}).get("h", 0) - k.get("cur", {}).get("l", 0)) * 0.5 or not k.get("above_ma5")
    # 分时强弱洗盘信号：弱势(下砸黄线下/收水下/拉升无量)一票降级为谨慎，与报告"综合判定"一致
    sig = m.get("wash_sig") or {}
    for_cautious = bool(sig.get("tag") == "洗盘偏弱，防出货")
    # 趋势维度：空头下行 / 高位偏风险 / 趋势分偏低 → 同样降级为谨慎
    tr = m.get("trend") or {}
    if tr.get("label") in ("空头下行", "高位偏风险") or (tr.get("score") or 50) < 45:
        for_cautious = True

    if strategy == "S1":
        if weak or for_cautious:
            mode, tag = "等企稳再低吸", "谨慎"
        elif strong:
            mode, tag = "回踩低吸", "积极"
        else:
            mode, tag = "观察+回踩低吸", "稳健"
    else:
        # 炸板洗盘：触板且收在高位=最强；收绿或放量杀跌/弱势洗盘=谨慎
        if weak or for_cautious or (k.get("is_yang") is False and cp < 0):
            mode, tag = "规避/等次日企稳", "谨慎"
        elif strong or (mm.get("hit_limit") and cp >= 3):
            mode, tag = "次日低吸", "积极"
        else:
            mode, tag = "低吸观察", "稳健"

    entry = round(price * 0.985, 2) if strategy == "S2" else round(price * 0.992, 2)
    pos = "3-5成" if tag == "积极" else ("2-3成" if tag == "稳健" else "1-2成")
    fund = m.get("pool_fund", 0) or 0
    fr = m.get("fund_ratio") or 0
    fund_txt = f"{fund:+.2f}亿（占成交 {fr:+.1f}%）"

    return {
        "tag": tag, "mode": mode,
        "lines": [
            ["主力资金", fund_txt],
            ["操作方式", mode],
            ["触发条件", f"不破 {entry}（约现价 -{(1 - entry / price) * 100:.1f}%）且分时企稳"],
            ["目标位", f"第一目标 {target_price}（{(target_price / price - 1) * 100:.1f}% 上方）"],
            ["止损位", f"跌破 {stop_price} 离场" if stop_price else "跌破 MA5 离场"],
            ["仓位参考", pos],
        ],
        "memo": (
            "首板次日放量洗盘" if strategy == "S1"
            else "炸板洗盘，次日看承接" if mm.get("hit_limit")
            else "炸板回落，关注分时企稳"
        ),
    }


def wash_signals(v):
    """从分时图(逐分钟价/均价/量)提炼强弱洗盘信号，供 分时文字描述、选股评分、操作建议 三处共用。

    强信号 strong(0~3)：①收盘站上均价且距均价为正 ②炸板不破位、收在高位 ③抛压轻(缩量回踩/温和换手不破均线)。
    弱信号 weak(0~3)：①下砸后整日在分时黄线下方且收于其下 ②收盘在水下 ③拉升无量(低点回升量占比低且未收复均价)。
    返回 dict。"""
    rows = v.get("minute_rows") or []
    prev = v.get("prev_close") or 0
    mm = v.get("minute") or {}
    sig = {"ok": False, "hit_idx": None, "brk_idx": None, "above_pct": None, "vwap_gap": None,
           "close_above_avg": bool(mm.get("close_above_avg")), "close_pct": round((mm.get("close_pct") or 0), 2),
           "strong": 0, "weak": 0, "weak_reasons": [], "tag": "数据暂缺", "note": ""}
    if not rows or not prev:
        return sig
    ps = [m["p"] for m in rows]
    avgs = [m.get("avg") for m in rows if m.get("avg")]
    vs = [m.get("v", 0) or 0 for m in rows]
    n = len(rows)
    last, hi, lo = ps[-1], max(ps), min(ps)
    avg_last = avgs[-1] if avgs else None
    close_pct = (last - prev) / prev * 100
    lup = round(prev * 1.1, 2) if prev else None
    tot = sum(vs) or 1
    sig["close_pct"] = round(close_pct, 2)
    sig["close_above_avg"] = bool(avg_last and last >= avg_last)

    hit_idx = brk_idx = None
    if lup:
        for i, m in enumerate(rows):
            if m["p"] >= lup * 0.998:
                hit_idx = i
                break
    if hit_idx is not None:
        for i, m in enumerate(rows):
            if i >= hit_idx and m["p"] < lup * 0.995:
                brk_idx = i
                break
    sig["hit_idx"], sig["brk_idx"] = hit_idx, brk_idx

    if avg_last:
        sig["above_pct"] = sum(1 for i, m in enumerate(rows) if m.get("avg") and m["p"] >= m["avg"]) / n * 100
        sig["vwap_gap"] = (last - avg_last) / avg_last * 100

    seg_a = seg_b = None
    if hit_idx is not None and brk_idx is not None:
        seg_a, seg_b = sum(vs[:brk_idx + 1]), sum(vs[brk_idx + 1:])

    strong = 0
    if sig["close_above_avg"] and (sig["vwap_gap"] or 0) > 0:
        strong += 1
    if hit_idx is not None and brk_idx is not None and close_pct >= 3 and (sig["vwap_gap"] or 0) > 0:
        strong += 1
    if seg_b is not None:
        if seg_b < 0.6 * (seg_a or 1):
            strong += 1
        elif seg_b < 1.0 * (seg_a or 1) and sig["close_above_avg"]:
            strong += 1

    weak, weak_reasons = 0, []
    if sig["above_pct"] is not None and sig["above_pct"] < 50 and not sig["close_above_avg"]:
        weak += 1
        weak_reasons.append(f"下砸后整日多数时间在分时黄线下方(在均价线上方仅{sig['above_pct']:.0f}%)且收于其下")
    if close_pct < 0:
        weak += 1
        weak_reasons.append(f"收盘 {close_pct:+.1f}% 在水下")
    if avg_last and not sig["close_above_avg"] and ps.index(lo) < n - 1:
        reb_share = sum(vs[ps.index(lo) + 1:]) / tot * 100
        if reb_share < 40:
            weak += 1
            weak_reasons.append(f"低点后回升无量(量占比仅{reb_share:.0f}%)、未收复均价——拉升无量偏弱")

    if strong >= 3 and weak == 0:
        tag, note = "强洗盘", "浮筹已充分换手，次日可分时企稳低吸"
    elif weak >= 2 or strong == 0:
        tag, note = "洗盘偏弱，防出货", "次日高开谨慎，跌破均价即离场"
    else:
        tag, note = "温和洗盘", "次日观察承接再定，不宜追高"
    sig.update(ok=True, strong=strong, weak=weak, weak_reasons=weak_reasons, tag=tag, note=note)
    return sig


def fenshi_analysis(v, sig=None):
    """分时洗盘文字理由。sig 由 wash_signals 提供；缺省自动计算。返回 str（多行）。"""
    if sig is None:
        sig = wash_signals(v)
    rows = v.get("minute_rows") or []
    prev = v.get("prev_close") or 0
    if not rows or not prev:
        return "分时数据暂缺，无法做逐笔承接分析。"
    k = v.get("metrics") or {}
    ps = [m["p"] for m in rows]
    vs = [m.get("v", 0) or 0 for m in rows]
    avgs = [m.get("avg") for m in rows if m.get("avg")]
    n = len(rows)
    hi, last = max(ps), ps[-1]
    hi_t = next((m["t"] for m in rows if m["p"] == hi), "—")
    avg_last = avgs[-1] if avgs else None
    open_pct = (ps[0] - prev) / prev * 100
    close_pct = (last - prev) / prev * 100
    lup = round(prev * 1.1, 2) if prev else None
    hit_idx, brk_idx = sig.get("hit_idx"), sig.get("brk_idx")
    tot = sum(vs) or 1
    above_pct, vwap_gap = sig.get("above_pct"), sig.get("vwap_gap")

    L = []
    # ① 开盘主动性
    if open_pct >= 2:
        L.append(f"高开 {open_pct:+.1f}% 开局，资金主动")
    elif open_pct <= -2:
        L.append(f"低开 {open_pct:+.1f}% 开局，逆向捡筹（洗盘节奏）")
    else:
        L.append(f"平开( {open_pct:+.1f}%) 开局，先震荡蓄势")

    # ② 触板/炸板承接
    if hit_idx is not None:
        L.append(f"{rows[hit_idx]['t']} 放量拉板触涨停 {lup:.2f}")
        if brk_idx is not None:
            brk_t = rows[brk_idx]["t"]
            post = rows[brk_idx + 1:] or rows[-1:]
            post_lo = min(m["p"] for m in post)
            post_lo_t = next((m["t"] for m in post if m["p"] == post_lo), "—")
            pull = (post_lo - prev) / prev * 100
            rec = (last - post_lo) / post_lo * 100 if post_lo else 0
            L.append(f"{brk_t} 炸板回落，{post_lo_t} 最低踩 {post_lo:.2f}({pull:+.1f}%)，随后收回 {rec:+.1f}%")
        else:
            L.append("触板后未炸板，一路封死至尾盘")
    else:
        L.append(f"盘中最高冲 {(hi - prev) / prev * 100:+.1f}%（未触板，高点 {hi_t}）")

    # ③ 全天均价线承接（VWAP）
    if above_pct is not None:
        if above_pct >= 60:
            L.append(f"全天约 {above_pct:.0f}% 时间运行均价线上方(VWAP承接)，收盘距均价 {vwap_gap:+.1f}%")
        elif above_pct >= 40:
            L.append(f"均价线上方约 {above_pct:.0f}% 时间，多空拉锯，收盘距均价 {vwap_gap:+.1f}%")
        else:
            L.append(f"多数时间在均价线下方(GAP谨慎)，仅尾盘回抽均价 {vwap_gap:+.1f}%")

    # ④ 量能结构：放量分布 + 炸板缩量
    peak_i = vs.index(max(vs))
    peak_share = vs[peak_i] / tot * 100
    open30 = sum(m["v"] for m in rows[:30] if m.get("v"))
    tail30 = sum(m["v"] for m in rows[-30:] if m.get("v"))
    vol_note = (f"量能峰值 {rows[peak_i]['t']}（单分钟占全天 {peak_share:.0f}%），"
                f"开30分占 {open30/tot*100:.0f}%、尾30分占 {tail30/tot*100:.0f}%")
    if hit_idx is not None and brk_idx is not None:
        seg_a = sum(vs[:brk_idx + 1]); seg_b = sum(vs[brk_idx + 1:])
        rb = seg_b / seg_a if seg_a else 0
        if rb < 0.5:
            vol_note += f"；炸板后量仅 {rb*10:.1f} 成——缩量回踩，抛压不重"
        elif rb < 1.0:
            vol_note += f"；炸板后量约 {rb*10:.1f} 成——温和换手"
        else:
            vol_note += f"；炸板后量达 {rb*10:.1f} 成未回封——抛压偏重"
    L.append(vol_note)

    # ⑤ 尾盘收盘质量
    tail = [m for m in rows if m["t"] >= "1430"]
    if tail and tail[-1]["p"] >= tail[0]["p"] and close_pct > 0:
        L.append("14:30后价格仍收高位，尾盘未大幅回吐")
    elif last < (avg_last or prev):
        L.append("尾盘回落、收盘在均价下方/水下，次日需确认均价支撑")
    else:
        L.append("尾盘小幅回吐，关注次日分时均价支撑")

    # ⑥ 弱势信号 + 综合定级
    if sig.get("weak_reasons"):
        L.append(f"弱势信号({sig['weak']})：" + "；".join(sig["weak_reasons"]))
    L.append(f"综合判定：**{sig['tag']}**（强信号{sig['strong']}/3、弱势{sig['weak']}）——{sig['note']}")

    # ⑦ 位置安全边际
    dd = k.get("drawdown", 0) or 0
    if dd >= 15:
        L.append(f"现价距250日高回撤 {dd:.0f}%，属低位/底部区域，洗盘安全边际更高")
    return "\n".join("· " + s for s in L)


def main():
    target = resolve_target()
    pools = load_json(os.path.join(BASE, f"data/pools_{target}.json"))
    stocks_data = load_json(os.path.join(BASE, f"data/stocks_{target}.json"))
    if pools.get("T") != target:
        raise SystemExit(f"!! pools_{target}.json T 不符")
    stocks = (stocks_data or {}).get("stocks", {})

    hot_t0 = pools.get("hot_reason_T0", {})
    hot_t = pools.get("hot_reason_T", {})
    pools_t = pools.get("T_pool", {})
    pools_t0 = pools.get("T0_pool", {})
    zt_t = {r.get("code"): r for r in (pools_t.get("limit_up", {}).get("list", [])) if r.get("code")}
    zt_t0 = {r.get("code"): r for r in (pools_t0.get("limit_up", {}).get("list", [])) if r.get("code")}
    zb_t = {r.get("code"): r for r in (pools_t.get("broken", {}).get("list", [])) if r.get("code")}

    all_s1, all_s2, near = [], [], []
    for code, rec in stocks.items():
        name = rec.get("name", "")
        if not (rec.get("kline_ok") or rec.get("klines")):
            continue
        kl = rec.get("klines", [])
        base_price = safe_float((zt_t0.get(code) or {}).get("price")) or safe_float((zb_t.get(code) or {}).get("price")) or 0
        # T日昨收：用K线最后一根的前收盘
        prev = kl[-2]["c"] if len(kl) >= 2 else base_price
        mtr = metrics_from_klines(kl, target, base_price=base_price, prev_close=prev)
        if not mtr:
            continue
        lup = limit_up_price(0, base_price, prev)  # 主板10%
        mmin = minute_metrics(rec.get("minute", []), prev, lup)
        reason_t0 = hot_t0.get(code, "")
        reason_t = hot_t.get(code, "")
        # 资金口径：统一新浪逐股（MoneyFlow.ssl_qsfx_zjlrqs），失败 {} 记 0，绝不阻塞、不回退池口径
        ff = rec.get("fund_flow") or {}
        ff_main = safe_float(ff.get("zjlx")) or 0.0
        fund = round(ff_main / 1e8, 2) if ff_main else 0.0
        fund_src = "新浪" if ff_main else ""
        hybk = (zt_t0.get(code) or zb_t.get(code) or {}).get("hybk", "") or "—"

        # 行情硬性指标（腾讯 quote）
        quote = rec.get("quote") or {}
        liutong = safe_float(quote.get("liutong_yi")) or 0
        turnover = safe_float(quote.get("turnover")) or 0
        amount = safe_float(quote.get("amount_yi")) or 0
        v = {
            "code": code, "name": name, "hybk": hybk,
            "price": mtr["price"], "chg_t": mtr["chg_t"],
            "vol_ratio": mtr["vol_ratio"], "drawdown": mtr["drawdown"],
            "chg60": mtr["chg60"], "metrics": mtr, "minute": mmin,
            "reason_t0": reason_t0, "reason_t": reason_t,
            "pool_fund": fund, "base_price": base_price, "prev_close": prev,
            "fund_src": fund_src,
            "liutong_yi": liutong, "turnover": turnover, "amount_yi": amount,
            "in_zt_t": code in zt_t, "in_zt_t0": code in zt_t0, "in_zb_t": code in zb_t,
            "zt_t0_rec": zt_t0.get(code, {}), "zt_t_rec": zt_t.get(code, {}),
            "zb_rec": zb_t.get(code, {}),
            "klines": kl[-80:],             # 报告画 K线/量能
            "minute_rows": rec.get("minute", []),  # 报告画分时
        }
        reason = reason_t0 or reason_t
        v["reason"] = reason
        v["pos_ok"] = position_ok(mtr)
        # 分时强弱洗盘信号 + 文字理由（供 报告展示 / 评分 / 操作建议 共用）
        v["wash_sig"] = wash_signals(v)
        v["fs_analysis"] = fenshi_analysis(v, v["wash_sig"])
        # 技术趋势画像（均线多头/MACD/RSI/量能趋势）
        v["trend"] = trend_analysis(mtr, kl)
        # 主力净流入占成交额 %：去规模后的资金强度（缺失记 None，评分记中性，不惩罚）
        v["fund_ratio"] = round(fund / amount * 100, 2) if amount else None

        # 硬性质量门槛：流通≥50亿(100~300最佳) & 换手≥5% & 成交≥5亿 & 量比≥2 & 非高位(从底部起来)
        pass_gate, gate = hard_gate(v)
        v["gate"] = gate
        v["gate_ok"] = pass_gate

        is_s1 = v["in_zt_t0"] and v["zt_t0_rec"].get("lbc") == 1 and not v["in_zt_t"]
        is_s2 = v["in_zb_t"] and bool(v["zb_rec"])

        # 提取原始因子 + 洗盘强度（供横截面标准化评分）
        v["raw_f"] = raw_factors(v)
        v["washout"] = v["raw_f"]["washout"]

        # 操作建议（不依赖评分，可先就绪）
        if is_s1:
            v["advice"] = build_advice(v, "S1", target)
        if is_s2:
            v["advice2"] = build_advice(v, "S2", target)

        # 全量评分池（含未过门槛，供补足推荐位）
        if is_s1:
            all_s1.append(v)
        if is_s2:
            all_s2.append(v)
        # 未过门槛但强洗盘意图较高 -> 邻近达标榜
        # 高位(非从底部起来)一律不再考虑，不进观察栏；洗盘强度用 washout，避免漏掉金安这类仅量比偏低者
        if not pass_gate and v["pos_ok"] and (is_s1 or is_s2):
            if v["washout"] >= 0.55:
                near.append(v)

    # 两阶段评分：先对候选池做横截面标准化 + 加权合成，再排序
    _, _eff1 = score_by_factors(all_s1, "S1")
    _, _eff2 = score_by_factors(all_s2, "S2")

    all_s1.sort(key=lambda x: x["score"], reverse=True)
    all_s2.sort(key=lambda x: x["score2"], reverse=True)
    # 邻近达标按「强洗盘强度」排序：让强洗盘但差门槛的（联合精密/金安国纪）置顶可见
    near.sort(key=lambda x: x["washout"], reverse=True)

    def pick_with_fill(all_, strict, no):
        """推荐池 = 过门槛优先；不足 no 只时补足。
        补足位优先「逼近门槛」者：按 未达标维度数升序 → 洗盘得分降序。
        这样宁可收留仅差量比的中大盘(如金安国纪)，也不塞小盘/低成交，符合质量优先。"""
        gate_ok = [x for x in all_ if x["gate_ok"]]
        rest = [x for x in all_ if not x["gate_ok"]]

        def relax_key(x):
            n_fail = sum(1 for ok_ in x["gate"]["checks"].values() if not ok_)
            return (n_fail, -max(x.get("score", 0), x.get("score2", 0)))

        rest.sort(key=relax_key)
        return (gate_ok + rest)[:no]

    s1 = pick_with_fill(all_s1, None, 3)
    s2 = pick_with_fill(all_s2, None, 3)

    # 模型诊断（因子有效样本 / 权重），供报告"模型说明"与调参回测参考
    eff_map = {"S1": _eff1, "S2": _eff2}
    model = {}
    for _stg, _pool in (("S1", all_s1), ("S2", all_s2)):
        _wts = FACTOR_WEIGHTS[_stg]
        _eff = eff_map[_stg]
        model[_stg] = {
            "universe": len(_pool),
            "weights": {fk: round(_eff[fk]["w_eff"], 2) for fk in _wts},
            "factor_n": {fk: _eff[fk]["valid"] for fk in _wts},
            "masked": {fk: _eff[fk]["masked"] for fk in _wts},
        }

    out = {
        "T": target,
        "model": model,
        "strategy1": [dict(x, _relaxed=not x["gate_ok"]) for x in s1],
        "strategy2": [dict(x, _relaxed=not x["gate_ok"]) for x in s2],
        "all_s1": [dict(x, _relaxed=not x["gate_ok"]) for x in all_s1[:6]],
        "all_s2": [dict(x, _relaxed=not x["gate_ok"]) for x in all_s2[:6]],
        "near_qualify": [dict(x, _relaxed=True) for x in near[:10]],
        "counts": {"s1": len(s1), "s2": len(s2), "s1_true": sum(1 for x in s1 if x["gate_ok"]),
                   "s2_true": sum(1 for x in s2 if x["gate_ok"]), "near": len(near),
                   "gate_table": {"liutong": ">=50亿", "turnover": ">=5%",
                                  "amount": ">=5亿", "vol_ratio": ">=2"}},
    }
    path = os.path.join(BASE, f"data/screen_{target}.json")
    dump_json(out, path)
    print(f"===== 筛选完成 (T={target}) =====")
    print(f"[S1 首板洗盘] 推荐 {len(s1)}（严格过关 {sum(1 for x in s1 if x['gate_ok'])}）")
    for x in s1[:3]:
        tag = "" if x["gate_ok"] else " (量比/门槛放宽)"
        print(f"  {x['name']}({x['code']}) {x['score']}分 流通{x['liutong_yi']:.0f}亿 换手{x['turnover']:.1f}% 量比{x['vol_ratio']}{tag} | {x['reason'][:22]}")
    print(f"[S2 炸板] 推荐 {len(s2)}（严格过关 {sum(1 for x in s2 if x['gate_ok'])}）")
    for x in s2[:3]:
        tag = "" if x["gate_ok"] else " (量比放宽)"
        print(f"  {x['name']}({x['code']}) {x['score2']}分 流通{x['liutong_yi']:.0f}亿 换手{x['turnover']:.1f}% 量比{x['vol_ratio']}{tag}")
    print(f"[临近达标·评分高但门槛未全过] {len(near)}")
    for x in near[:5]:
        ch = ", ".join(k2 for k2, ok_ in x["gate"]["checks"].items() if not ok_)
        print(f"  {x['name']}({x['code']}) {max(x.get('score',0),x.get('score2',0))}分 差项[{ch}]")
    for _stg, _info in model.items():
        parts = []
        for fk in FACTOR_WEIGHTS[_stg]:
            w = _info["weights"].get(fk, 0)
            nm = _info["factor_n"].get(fk, 0)
            mk = "✗" if _info.get("masked", {}).get(fk) else ""
            parts.append(f"{fk}{mk}={w*100:.0f}%(n={nm})")
        print(f"[模型 {_stg}] 候选 {_info['universe']} 只 | " + " ".join(parts))
    print(f"  -> {path}")


if __name__ == "__main__":
    main()