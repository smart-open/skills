# -*- coding: utf-8 -*-
"""一阳指·转势 / 一阳指·开门 判定引擎（纯计算）
输入：日K rows = list of [date,open,close,high,low,vol,amount]
输出：evaluate() -> dict（转势/开门信号、评分、理由、反例、买点、止损、卖点）
依据《01_一阳指转势战法》《02_一阳指开门战法》逻辑模型纯K线部分实现。
"""
from __future__ import annotations
import numpy as np
import _common as C


def _ma(a, n):
    a = np.asarray(a, dtype=float)
    out = np.full(len(a), np.nan)
    for i in range(n - 1, len(a)):
        w = a[i - n + 1:i + 1]
        if not np.isnan(w).any():
            out[i] = np.nanmean(w)
    return out


def _atr(h, l, c, n=C.ATR_N):
    h = np.asarray(h, dtype=float); l = np.asarray(l, dtype=float); c = np.asarray(c, dtype=float)
    tr = np.maximum(h[1:] - l[1:], np.maximum(np.abs(h[1:] - c[:-1]), np.abs(l[1:] - c[:-1])))
    tr = np.concatenate([[h[0] - l[0]], tr])
    return _ma_np(tr, n)


def _ma_np(a, n):
    a = np.asarray(a, dtype=float)
    out = np.full(len(a), np.nan)
    cs = np.cumsum(np.where(np.isnan(a), 0.0, a))
    cnt = np.cumsum(~np.isnan(a))
    for i in range(n - 1, len(a)):
        out[i] = (cs[i] - (cs[i - n] if i >= n else 0)) / \
                 (cnt[i] - (cnt[i - n] if i >= n else 0))
    return out


def _dir(slope, eps=C.MA_FLAT_EPS):
    if np.isnan(slope):
        return "N/A"
    if slope > eps:
        return "UP"
    if slope < -eps:
        return "DOWN"
    return "FLAT"


def compute(df):
    """df: numpy arrays -> dict 派生指标(全部对齐 len)"""
    n = len(df["close"])
    out = {"n": n}
    out["date"] = df["date"]
    out["open"] = df["open"]; out["close"] = df["close"]
    out["high"] = df["high"]; out["low"] = df["low"]; out["vol"] = df["vol"]
    out["ma6"] = _ma(df["close"], 6)
    out["ma12"] = _ma(df["close"], 12)
    out["ma21"] = _ma(df["close"], 21)
    out["volma20"] = _ma_np(df["vol"], 20)
    out["atr14"] = _atr(df["high"], df["low"], df["close"])
    return out


def bottom_wash_ok(ind, i):
    """反例E过滤（形态A）：信号日前 20 根内存在有效横盘(洗盘)，非单根孤阳高位脉冲
    判定：信号日收盘站上此前 20 根箱体上沿，且箱体幅度适中(洗盘区幅度<35%)"""
    if i - 20 < 0:
        return False
    lo = ind["low"][i - 20:i]
    hi = ind["high"][i - 20:i]
    if len(lo) == 0 or np.isnan(lo).all():
        return False
    box_min = float(np.nanmin(lo)); box_max = float(np.nanmax(hi))
    if box_min <= 0:
        return False
    span = (box_max - box_min) / box_min
    close = float(ind["close"][i])
    # 洗盘充分 + 当前突破箱体
    return span < 0.35 and close > box_max


def v_reversal_ok(ind, i):
    """反例E过滤（形态B·低位V型反转）：急跌见底后强反包，无需横盘箱体
    判定：近期(REV_LOW_WINDOW)最低点出现在最近 REV_MAX_BARS 内，
    且信号日收盘较该低点回升 ≥ REV_MIN_CLIMB(确认已反转离底)，非下跌中继孤阳"""
    if i - C.REV_LOW_WINDOW < 0:
        return False
    lo = ind["low"][max(0, i - C.REV_LOW_WINDOW):i]
    if len(lo) == 0 or np.isnan(lo).all():
        return False
    arg = int(np.nanargmin(lo))
    low_val = float(lo[arg])
    if low_val <= 0:
        return False
    global_i = (i - C.REV_LOW_WINDOW) + arg
    close = float(ind["close"][i])
    climb = close / low_val - 1
    return climb >= C.REV_MIN_CLIMB and (i - global_i) <= C.REV_MAX_BARS


def high_zone_risk(ind, i):
    """反例F：当前价处于历史高位(近120日最高价±3%内) -> 高位风险"""
    if i - 120 < 0:
        return False
    hi = ind["high"][max(0, i - 120):i]
    if len(hi) == 0 or np.isnan(hi).all():
        return False
    prev_high = float(np.nanmax(hi))
    return prev_high > 0 and float(ind["close"][i]) >= prev_high * 0.97


def hist_new_high(ind, i):
    """是否收盘创近120日历史新高(收盘≥期间最高价, 无容差)"""
    if i - 120 < 0:
        return False
    hi = ind["high"][max(0, i - 120):i]
    if len(hi) == 0 or np.isnan(hi).all():
        return False
    ph = float(np.nanmax(hi))
    return ph > 0 and float(ind["close"][i]) >= ph


def judge_turn(ind, i):
    """一阳指·转势判定（目标日收盘口径）"""
    n = ind["n"]
    if i < 22 or np.isnan(ind["ma6"][i]) or np.isnan(ind["ma21"][i]) or np.isnan(ind["volma20"][i]):
        return {"signal": False, "insufficient": True, "score": 0, "reasons": [],
                "counter": "DATA_INSUFFICIENT"}
    close = float(ind["close"][i]); prev = float(ind["close"][i - 1])
    chg = (close / prev - 1) if prev else 0.0
    volr = float(ind["vol"][i]) / float(ind["volma20"][i]) if ind["volma20"][i] > 0 else 0.0
    ma6, ma21 = float(ind["ma6"][i]), float(ind["ma21"][i])
    sl6 = (float(ind["ma6"][i]) / float(ind["ma6"][i - 1]) - 1) if ind["ma6"][i - 1] > 0 else 0
    sl21 = (float(ind["ma21"][i]) / float(ind["ma21"][i - 1]) - 1) if ind["ma21"][i - 1] > 0 else 0
    d6, d21 = _dir(sl6), _dir(sl21)
    gap = (ma6 - ma21) / ma21 if ma21 else 0

    big_yang = chg >= C.TURN_BIGYANG_MIN
    # 双阳确认: 前日≈涨停(≥9.4%) + 当日续阳≥4% 视为满足"大阳"(蓄能续攻转势)
    prev_chg = (float(ind["close"][i - 1]) / float(ind["close"][i - 2]) - 1) if float(ind["close"][i - 2]) > 0 else 0.0
    double_yang = chg >= C.TURN_NEXT_MIN and prev_chg >= C.TURN_PREV_ZT_MIN
    big_yang = big_yang or double_yang
    stand = close > ma6                      # 反转日收复短均线即可(MA21仍在上方属常态)
    ma6_ok = d6 in ("UP", "FLAT")
    ma21_ok = d21 in ("UP", "FLAT")          # 仅供评分, 不作为硬门槛(早段反转MA21仍向下)
    vol_ok = volr >= C.TURN_VOL_MIN          # 资金线: 量能/资金够大(当日量≥20日均量)
    # 量比上限闸门: 当日量过大(≥TURN_VOL_MAX倍20日均量)多为情绪脉冲/出货, 转势后易回落
    vol_over = volr >= C.TURN_VOL_MAX
    wash = bottom_wash_ok(ind, i)
    vrev = v_reversal_ok(ind, i)
    # 新规·MA21结构(MA21不作硬门槛): 收盘上穿21日线 OR 趋势走平/向上 OR 低位V反转豁免(深超跌)
    up_cross_21 = bool(close > ma21 and float(ind["close"][i - 1]) <= float(ind["ma21"][i - 1]))
    # 上穿21日线需「强确认」: 实体阳线(收盘>开盘) + 非爆量脉冲, 否则视为假突破弱反弹
    solid_yang = float(ind["close"][i]) > float(ind["open"][i])
    up_cross_21 = up_cross_21 and solid_yang and not vol_over
    # 反例E: 箱体横盘 / 低位V转 / 今日上穿21日线(强反转确认) 三者任一满足即算有底部结构
    base_ok = wash or vrev or up_cross_21
    ma21_struct = up_cross_21 or d21 in ("FLAT", "UP") or vrev
    high_risk = high_zone_risk(ind, i)

    reasons, score = [], 0
    score += 15 if stand else 0
    score += 10 if ma6_ok else 0
    score += 10 if ma21_ok else 0
    score += 15 if ma21_struct else 0
    # 量能档(资金)
    if vol_ok:
        if volr >= C.VOL_RATIO_BURST:
            score += 45
        elif volr >= C.VOL_RATIO_STRONG:
            score += 35
        else:
            score += 20
    if abs(gap) < C.MA_GAP_TIGHT:
        score += 10  # 双线黏合
    if base_ok:
        score += 15
    if not high_risk:
        score += 5

    if big_yang:
        if double_yang:
            reasons.append(f"双阳确认(前日+{prev_chg*100:.1f}%涨停+当日续阳{chg*100:.1f}%)")
        else:
            reasons.append(f"当日大阳 {chg*100:.1f}%")
    if stand:
        reasons.append(f"收盘站上短均线(MA6={ma6:.2f})")
    reasons.append(f"MA6方向={d6}, MA21方向={d21}")
    reasons.append(f"量比={volr:.2f}({'达标' if vol_ok else '不足'})")
    if up_cross_21:
        reasons.append("今日上穿21日均线")
    elif d21 in ("FLAT", "UP"):
        reasons.append("MA21趋势走平/向上")
    if vrev:
        reasons.append("低位V型反转(反例E·形态B通过)")
    if wash:
        reasons.append("底部箱体横盘充分(反例E·形态A通过)")
    if high_risk:
        reasons.append("【高位风险·反例F】临近历史高位")
    if vol_over:
        reasons.append(f"【量能脉冲·反例G】量比{volr:.1f}≥{C.TURN_VOL_MAX}倍, 疑似情绪脉冲/出货")

    signal = big_yang and stand and ma6_ok and vol_ok and not vol_over \
        and ma21_struct and base_ok and not high_risk
    counter = None
    if not signal:
        if not big_yang:
            counter = "非大阳"
        elif not vol_ok:
            counter = "资金不足(量比<%.2f, 缩量反弹)" % C.TURN_VOL_MIN
        elif vol_over:
            counter = "量能脉冲(量比≥%.1f倍, 疑似出货, 反例G)" % C.TURN_VOL_MAX
        elif not base_ok or not ma21_struct:
            counter = "既无底部形态(箱体/V转)也未上穿或走平21线: 单根孤阳脉冲(反例E)"
        elif high_risk:
            counter = "高位-近历史新高(反例F)"
        elif not ma6_ok:
            counter = "短均线仍向下(反例A/B)"
        elif not stand:
            counter = "未收复短均线"
        else:
            counter = "条件未全满足"

    buy = None
    stop = None
    if signal:
        yanglow = float(ind["low"][i])
        base = ind["atr14"][i] if not np.isnan(ind["atr14"][i]) else (close * 0.02)
        stop = round(yanglow - C.STOP_ALPHA[0] * float(base), 3)
        buy = {"type": "回踩低吸", "detail": "缩1级周期回踩MA6/MA21不破低吸(P1+P2)",
               "ref": f"一阳指启动低点 {yanglow:.2f}"}
    return {"signal": signal, "insufficient": False, "score": min(score, 100),
            "reasons": reasons, "counter": counter, "big_yang": big_yang,
            "chg": round(chg * 100, 2), "volr": round(volr, 2),
            "ma6": round(ma6, 3), "ma21": round(ma21, 3),
            "ma6_dir": d6, "ma21_dir": d21, "gap_pct": round(abs(gap) * 100, 2),
            "buy": buy, "stop": stop}


def judge_open(ind, i, code="000001"):
    """一阳指·开门判定（目标日收盘口径；code 用于按板块区分涨停阈值）"""
    n = ind["n"]
    if i < 60 or np.isnan(ind["ma6"][i]) or np.isnan(ind["ma12"][i]) or np.isnan(ind["ma21"][i]) \
            or np.isnan(ind["volma20"][i]):
        return {"signal": False, "insufficient": True, "score": 0, "reasons": [],
                "counter": "DATA_INSUFFICIENT"}
    close = float(ind["close"][i]); prev = float(ind["close"][i - 1])
    chg = (close / prev - 1) if prev else 0.0
    volr = float(ind["vol"][i]) / float(ind["volma20"][i]) if ind["volma20"][i] > 0 else 0.0
    ma6, ma12, ma21 = float(ind["ma6"][i]), float(ind["ma12"][i]), float(ind["ma21"][i])
    s6 = (float(ind["ma6"][i]) / float(ind["ma6"][i - 1]) - 1)
    s12 = (float(ind["ma12"][i]) / float(ind["ma12"][i - 1]) - 1)
    s21 = (float(ind["ma21"][i]) / float(ind["ma21"][i - 1]) - 1)
    # 近期(近20日)前高为准——避免"创60日新高"过苛, 开门=突破近期箱体前高
    prior_high = float(np.nanmax(ind["high"][max(0, i - C.PRIOR_HIGH_WINDOW):i]))
    dist_prior = (close / prior_high - 1) * 100 if prior_high > 0 else 0.0
    # 双通道突破：a) 站稳/逼近近期前高；b) 创近3日新高(放量大阳打开新一轮上行=开门启动)
    fresh3 = (i >= 3) and close > float(np.nanmax(ind["high"][i - 3:i]))
    breakout = (close >= prior_high * C.OPEN_BREAK_TOL) or fresh3

    big_yang = chg >= C.OPEN_BIGYANG_MIN
    aligned = close > ma6 and close > ma12 and close > ma21   # 价站上三线(允许洗盘MA6/<MA12)
    up_cnt = int(_dir(s6) == "UP") + int(_dir(s12) == "UP") + int(_dir(s21) == "UP")
    slope_ok = up_cnt >= 2                            # 至少两线上行(允许一根洗盘走平)
    vol_ok = volr >= C.OPEN_VOL_MIN
    seal_vol = False
    if not vol_ok:
        # 开门·缩量一字/秒板(地量洗盘后涨停=惜售启动): 近3日均量≤50%volma20 且 当日量≥近3日均量1.5倍
        if i >= 3:
            base3 = float(np.nanmean(ind["vol"][i - 3:i])) if ind["vol"][i - 3:i].size else 0.0
            vma20 = float(ind["volma20"][i])
            if base3 > 0 and vma20 > 0 and (base3 / vma20) <= C.OPEN_SEAL_BASE_PCT \
                    and (float(ind["vol"][i]) / base3) >= C.OPEN_SEAL_LIFT:
                vol_ok = True
                seal_vol = True
    zt_chg = C.zt_threshold(code) / 100.0          # 当日涨停阈值(按代码区分, 比率)
    # 续攻开门: 近10日内有过涨停(按代码涨停阈值判定), 今日非大阳但续阳(+3%)守住/突破前高
    recent_zt = any(
        (float(ind["close"][k]) / float(ind["close"][k - 1]) - 1) >= zt_chg
        for k in range(max(1, i - C.OPEN_RECENT_ZT_DAYS), i)
    )
    follow_up = (not big_yang) and recent_zt and chg >= C.OPEN_FOLLOW_UP_MIN \
        and breakout and aligned and slope_ok \
        and (vol_ok or volr >= C.OPEN_FOLLOW_VOL_MIN)
    big_yang = big_yang or follow_up
    # 反例F(收紧): 真正创近120日历史新高才有高位追高风险;
    #   且"大行情"豁免——当日涨停/爆量/近10日有涨停(主线强势股)
    new_high = hist_new_high(ind, i)
    big_move = chg >= zt_chg or volr >= C.VOL_RATIO_BURST or recent_zt
    high_risk = new_high and not big_move

    reasons, score = [], 0
    score += 20 if aligned else 0
    score += 15 if slope_ok else 0
    if breakout:
        score += 20 + min(15, int(dist_prior))
    if vol_ok:
        score += 20 if volr >= C.VOL_RATIO_BURST else (35 if volr >= C.VOL_RATIO_STRONG else 25)
    if chg >= zt_chg:
        reasons.append("涨停形态")
        score += 10
    if not high_risk:
        score += 5
    if high_risk:
        score -= 15
        reasons.append("【反例F】创历史新高且非强势(除非当日涨停/爆量/近10日涨停否则谨慎)")
    elif new_high:
        reasons.append("创历史新高但属强势股(当日涨停/爆量/近10日有涨停), 豁免高位风险")

    reasons.append(f"涨幅={chg*100:.1f}%, 量比={volr:.2f}")
    if seal_vol:
        reasons.append("地量洗盘后缩量涨停(惜售, 开门启动)")
    if follow_up:
        reasons.append(f"续攻开门(近{C.OPEN_RECENT_ZT_DAYS}日内涨停后续阳{chg*100:.1f}%突破前高)")
    reasons.append(f"近{C.PRIOR_HIGH_WINDOW}日前高={prior_high:.2f}(站稳{close >= prior_high*C.OPEN_BREAK_TOL}), 创近3日新高={fresh3}")
    reasons.append(f"价站三线={aligned}, MA6/12/21斜率={_dir(s6)}/{_dir(s12)}/{_dir(s21)}"
                  f"(向上{up_cnt}条)")

    signal = big_yang and aligned and slope_ok and breakout and (vol_ok or follow_up) and not high_risk
    counter = None
    if not signal:
        if not big_yang:
            counter = "非大阳"
        elif not breakout:
            counter = f"未突破近期前高({prior_high:.2f})"
        elif not aligned:
            counter = "收盘未站上三均线"
        elif not slope_ok:
            counter = "均线未能两线向上(洗盘过深)"
        elif not vol_ok:
            counter = "量能不足(缩量突破为反例)"
        elif high_risk:
            counter = "创历史新高且非强势(反例F, 除非当日涨停/爆量/近10日涨停)"
        else:
            counter = "条件未全满足"

    buy = None
    stop = None
    if signal:
        stop = round(float(ind["low"][i]) * 0.985, 3)
        # 次日弱转强(盘后口径)：高开>=1% & 收盘>当日开盘 近似
        buy = {"type": "半路/弱转强", "detail": "次日竞价高开>=1%且分时站上均价线试错；跌破启动低点止损",
               "ref": f"突破前高 {prior_high:.2f}"}
    return {"signal": signal, "insufficient": False, "score": min(max(score, 0), 100),
            "reasons": reasons, "counter": counter, "big_yang": big_yang,
            "chg": round(chg * 100, 2), "volr": round(volr, 2),
            "aligned": aligned, "breakout": breakout,
            "high_risk": high_risk, "new_high": new_high,
            "prior_high": round(prior_high, 3), "dist_prior": round(dist_prior, 2),
            "buy": buy, "stop": stop}


def judge_sell(ind, i):
    """卖点监控 S1/S2/S3（供候选/个股详情建议）"""
    n = ind["n"]
    if i < 22 or np.isnan(ind["ma6"][i]) or np.isnan(ind["ma21"][i]) or np.isnan(ind["volma20"][i]):
        return []
    close = float(ind["close"][i]); prev = float(ind["close"][i - 1])
    open_ = float(ind["open"][i]); ma6 = float(ind["ma6"][i]); ma21 = float(ind["ma21"][i])
    volr = float(ind["vol"][i]) / float(ind["volma20"][i]) if ind["volma20"][i] > 0 else 0.0
    sells = []
    if (close / ma21 - 1) >= C.BIAS_MA21_FAR:
        sells.append({"S1": f"乖离21均线{((close/ma21-1)*100):.1f}%≥{C.BIAS_MA21_FAR*100:.0f}%, 离场/减仓"})
    if prev > 0 and (open_ - close) / prev >= 0.05 and volr >= 2.0:
        sells.append({"S2": "放量阴线跌破MA6, 坚决离场"})
    cnt = 0
    for k in range(max(0, i - 4), i + 1):
        if not np.isnan(ind["low"][k]) and not np.isnan(ind["ma6"][k]) and ind["low"][k] <= ind["ma6"][k]:
            cnt += 1
    if cnt >= 3:
        sells.append({"S3": f"近5根回踩MA6 {cnt}次, 趋势力量减弱"})
    return sells


def evaluate(rows, live=False, code="000001"):
    """主入口：对日K全部序列求 target=最后1根 的判定结果(code 用于按板块区分涨停阈值)"""
    n = len(rows)
    if n < 61:
        return {"insufficient": True, "reason": f"日K不足({n}<61)，无法判定", "n": n}
    df = {
        "date": [r[0] for r in rows],
        "open": np.array([r[1] for r in rows], dtype=float),
        "close": np.array([r[2] for r in rows], dtype=float),
        "high": np.array([r[3] for r in rows], dtype=float),
        "low": np.array([r[4] for r in rows], dtype=float),
        "vol": np.array([r[5] for r in rows], dtype=float),
    }
    ind = compute(df)
    i = n - 1
    turn = judge_turn(ind, i)
    open_ = judge_open(ind, i, code=code)
    sells = judge_sell(ind, i)
    return {
        "date": str(rows[-1][0]),
        "close": round(float(ind["close"][i]), 3),
        "chg_today": round((float(ind["close"][i]) / float(ind["close"][i - 1]) - 1) * 100, 2),
        "live": live,
        "insufficient": turn.get("insufficient", False) and open_.get("insufficient", False),
        "turn": turn, "open": open_, "sells": sells}


if __name__ == "__main__":
    # 合成数据自测：底部洗盘→大阳突破(真转势)、脉冲孤阳(反例E)、多头排列+破前高(真开门)
    import random
    rng = random.Random(7)

    def build(mode):
        rows = []
        def add(d, op, cl, hi, lo, vo):
            rows.append([d, round(op, 2), round(cl, 2), round(hi, 2), round(lo, 2),
                         int(vo), int(vo * 10)])
        p = 30.0
        base_vol = 120000
        # 构造 60 根形态
        for k in range(60):
            d = "2026%02d%02d" % ((k // 28) + 1, (k % 28) + 1)
            vol = int(base_vol * (0.8 + 0.4 * (k % 3)))
            if mode == "turn_ok":
                if k < 28:                      # 上涨后段
                    op = p; cl = p * (1 + 0.01); hi = cl * 1.008; lo = op * 0.996
                else:                           # 底部横盘洗盘(28根之后)
                    op = p; cl = p * (1 + rng.uniform(-0.006, 0.006))
                    hi = max(op, cl) * 1.003; lo = min(op, cl) * 0.997
                    vol = int(base_vol * 0.6)   # 洗盘缩量
            elif mode == "turn_pulse":
                op = p; cl = p * (1 - 0.01)     # 持续下跌,无底部洗盘
                hi = op * 1.003; lo = cl * 0.998
            else:                               # open_ok: 上升→回调(前高)→再上→突破
                if k < 38:
                    op = p; cl = p * (1 + 0.011); hi = cl * 1.006; lo = op * 0.995
                elif k < 50:                    # 回调制造前期高点
                    op = p; cl = p * (1 - 0.006)
                    hi = op * 1.004; lo = cl * 0.996
                else:                           # 再上, 收复前高
                    op = p; cl = p * (1 + 0.008)
                    hi = cl * 1.005; lo = op * 0.997
            add(d, op, cl, hi, lo, vol)
            p = cl
        last = "20261230"
        if mode == "turn_ok":
            add(last, p, p * 1.06, p * 1.062, p * 1.0, base_vol * 3)
        elif mode == "turn_pulse":
            add(last, p, p * 1.06, p * 1.062, p * 1.0, base_vol * 3)  # 下跌中孤阳(反例E)
        else:
            add(last, p, p * 1.055, p * 1.058, p * 0.99, base_vol * 3)
        # 补齐 amount 位
        for r in rows:
            if len(r) == 6:
                r.append(r[5] * 10)
        return rows

    for mode in ("turn_ok", "turn_pulse", "open_ok"):
        ev = evaluate(build(mode))
        t = ev["turn"]; o = ev["open"]
        print(f"[{mode}] close={ev['close']} chg={ev['chg_today']}%  turn信号={t['signal']}(分{t['score']},反例={t['counter']})  "
              f"open信号={o['signal']}(分{o['score']},反例={o['counter']})")
    assert evaluate(build("turn_ok"))["turn"]["signal"] is True, "turn_ok 应为真转势"
    assert evaluate(build("turn_pulse"))["turn"]["signal"] is False, "turn_pulse 应为反例E(脉冲)"
    ev = evaluate(build("open_ok"))
    assert ev["open"]["signal"] is True, "open_ok 应为真开门"
    print("自测通过 ✔")