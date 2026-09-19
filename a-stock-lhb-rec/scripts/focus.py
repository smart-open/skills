# -*- coding: utf-8 -*-
"""低位连板聚焦筛选（1-2板）—— 在每日全量推荐之上叠加一层「可执行」过滤。

背景：模型每日对全部上榜股打分(TopN=20)，用于自学习/回测足够，但给人看太多。
本模块把当日候选压缩成一份「低位连板聚焦清单」：
  1) 硬剔除 高度板(BOARDS>=3) 与 今日未涨停上榜(BOARDS==0)
  2) 只保留 刚刚 1-2 板 的标的
  3) 按「综合分」排序给 TopN（默认 5）

综合分 = 0.40*P + 0.20*净买比 + 0.18*质量(主线/游资) + 0.12*换手健康 + 0.10*位置
         - 透支惩罚 - 纯机构主买惩罚
各分量均已归一化到 0~1，最终分域约 0~1（越大越好），全部可解释。

用法：python focus.py [DATE] [TOPN]
产物：<RUNTIME>/focus_{DATE}.csv  +  <REPORT_ROOT>/低位连板聚焦-{DATE}.md
"""
import os, sys
import numpy as np
import pandas as pd
import _common as C

TOPN_DEFAULT = 5
BOARD_HIGH = 3          # >=3 板视为高度板
WEAK_MKT_PCTILE = 30

W_P, W_NR, W_Q, W_TR, W_POS = 0.40, 0.20, 0.18, 0.12, 0.10
PURE_INST_TOL = 0.65
ZHI_25, ZHI_35 = 25.0, 35.0


def consec_boards(kl, code, dt):
    """截止 dt 的真实连续涨停板数（从 dt 向前逐日判定，无未来泄漏）"""
    m = kl.get(str(code))
    if not m or dt not in m:
        return np.nan
    ds = sorted(m)
    i = ds.index(dt)
    thr = C.zt_threshold(code)
    cnt, k = 0, i
    while k >= 1:
        prev_c = m[ds[k - 1]]
        if prev_c and (m[ds[k]] / prev_c - 1) * 100 >= thr:
            cnt += 1
            k -= 1
        else:
            break
    return cnt


def _clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def _turnover_health(v):
    """换手健康度：2%~16% 为理想带；<2% 缩量惜售(略扣)；>16% 分歧放大递减"""
    if pd.isna(v):
        return 0.5
    v = float(v)
    if 2.0 <= v <= 16.0:
        return 1.0
    if v < 2.0:
        return 0.70
    if v <= 25.0:
        return 1.0 - (v - 16.0) / 9.0 * 0.5
    return _clamp(0.5 - (v - 25.0) / 25.0 * 0.5)


def _penalty(r):
    pen, why = 0.0, []
    p3 = r.get("PRE3_RET")
    if pd.notna(p3):
        if p3 >= ZHI_35:
            pen += 0.25; why.append("透支≥35")
        elif p3 >= ZHI_25:
            pen += 0.12; why.append("透支25-35")
    pure_inst = (r.get("HAS_INST") == 1 and r.get("FAMOUS_YZ") == 0
                 and pd.notna(r.get("NET_BUY_RATIO")) and r.get("NET_BUY_RATIO") < PURE_INST_TOL)
    if pure_inst:
        pen += 0.18; why.append("纯机构主买")
    return pen, why


def _market_regime(today_zt):
    if not os.path.exists(C.DATASET_CSV) or pd.isna(today_zt):
        return "normal", None
    try:
        hist = pd.to_numeric(pd.read_csv(C.DATASET_CSV, usecols=["MARKET_ZT"])["MARKET_ZT"],
                             errors="coerce").dropna()
    except Exception:
        return "normal", None
    if len(hist) < 20:
        return "normal", None
    pct = float((hist < today_zt).mean() * 100)
    return ("weak" if pct <= WEAK_MKT_PCTILE else "normal"), pct


def build(date, topn=TOPN_DEFAULT):
    """返回 (focus_df, dropped_df, info) 并落盘 csv/md；数据缺失返回 (None,None,{})"""
    kl = C.load_klines()
    df = pd.read_csv(C.DATASET_CSV, dtype={"CODE": str})
    sub = df[df["TRADE_DATE"] == date].copy()
    if len(sub) == 0:
        print(f"[focus] {date} 无特征数据"); return None, None, {}
    ART = C.load_model()
    if ART is None:
        print("[focus] 模型未训练"); return None, None, {}
    sub["BOARDS"] = [consec_boards(kl, r["CODE"], r["TRADE_DATE"]) for _, r in sub.iterrows()]
    sub["P"] = C.predict(sub, ART)
    sub["_risk"] = [C.risk_level(r["NAME"]) for _, r in sub.iterrows()]
    sub = sub.sort_values("P", ascending=False).reset_index(drop=True)

    today_zt = pd.to_numeric(sub["MARKET_ZT"], errors="coerce").mean()
    regime, pctile = _market_regime(today_zt)

    # 硬剔除：高度板 / 今日未涨停 / 暴雷
    high = sub[sub["BOARDS"] >= BOARD_HIGH].copy()
    low = sub[(sub["BOARDS"].isin([1, 2])) & (sub["_risk"] != "red")].copy()

    recs = []
    for _, r in low.iterrows():
        p_n = _clamp(float(r["P"]) / 0.90)
        nr = r.get("NET_BUY_RATIO")
        nr_n = _clamp((float(nr) - 0.40) / 0.45) if pd.notna(nr) else 0.0
        q = 0.55 * float(r.get("THEME_MAIN") or 0) + 0.45 * float(r.get("FAMOUS_YZ") or 0)
        tr_n = _turnover_health(r.get("TURNOVERRATE"))
        pos = 1.0 if int(r["BOARDS"]) == 2 else 0.90
        pen, why = _penalty(r)
        base = W_P * p_n + W_NR * nr_n + W_Q * q + W_TR * tr_n + W_POS * pos
        recs.append({
            "CODE": r["CODE"], "NAME": r["NAME"], "P": round(float(r["P"]) * 100, 1),
            "BOARDS": int(r["BOARDS"]), "NET_BUY_RATIO": nr,
            "PRE3_RET": r.get("PRE3_RET"), "TURNOVERRATE": r.get("TURNOVERRATE"),
            "THEME_MAIN": int(r.get("THEME_MAIN") or 0), "FAMOUS_YZ": int(r.get("FAMOUS_YZ") or 0),
            "HAS_INST": int(r.get("HAS_INST") or 0), "REASON": r.get("REASON"),
            "_p_n": round(p_n, 3), "_nr_n": round(nr_n, 3), "_q": round(q, 3),
            "_tr_n": round(tr_n, 3), "_pos": pos, "_pen": round(pen, 3),
            "惩罚项": "/".join(why), "SCORE": round(max(0.0, base - pen), 4),
        })
    foc = pd.DataFrame(recs).sort_values("SCORE", ascending=False).reset_index(drop=True)

    info = {"date": date, "n_all": int(len(sub)), "n_low": int(len(foc)),
            "regime": regime, "pctile": pctile, "today_zt": today_zt, "n_risk": int((sub["_risk"] == "red").sum())}

    csv_path = os.path.join(C.RUNTIME, f"focus_{date}.csv")
    foc.to_csv(csv_path, index=False, encoding="utf-8-sig")

    # ---- 打印 ----
    print(f"\n=== 低位连板聚焦 {date} | 上榜 {len(sub)} → 高度板剔除 {len(high)} → 1-2板 {len(foc)} → Top{topn} ===")
    if regime == "weak":
        print(f"  ⚠ 弱市(上榜涨停占比 {today_zt*100:.0f}%, 处历史 {pctile:.0f}% 分位)：建议降级、勿追高")
    if len(high):
        hl = "  ".join(f"{r['CODE']}{r['NAME']}({int(r['BOARDS'])}板)" for _, r in high.iterrows())
        print(f"  已剔除高度板: {hl}")
    for i, (_, r) in enumerate(foc.head(topn).iterrows(), 1):
        print(f"  #{i} {r['CODE']} {str(r['NAME'])[:8]:<8} {r['BOARDS']}板 "
              f"P={r['P']:5.1f}% 综合={r['SCORE']:.3f} 净买比={r['NET_BUY_RATIO']} "
              f"{'主线' if r['THEME_MAIN'] else '--'} {'游资' if r['FAMOUS_YZ'] else '--'} "
              f"{'⚠'+r['惩罚项'] if r['惩罚项'] else ''}")

    md = _render_md(info, foc, high, topn)
    md_path = os.path.join(C.REPORT_ROOT, f"低位连板聚焦-{date}.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"[focus] 已生成: {md_path}  ({len(md)} chars)  明细: {csv_path}")
    return foc, high, info


def _render_md(info, foc, high, topn):
    d = info["date"]
    L = []
    L.append(f"# 低位连板聚焦清单（1-2 板）· {d}\n")
    L.append("> 数据源：a-stock-lhb-rec 龙虎榜 T+3 模型当日全量打分（自学习仍用全量，本清单仅供执行）。\n")
    reg = "🔴 弱市（建议降级、勿追高）" if info["regime"] == "weak" else "🟢 正常"
    pct = f"{info['pctile']:.0f}% 分位" if info["pctile"] is not None else "—"
    L.append("## 一、市场门控\n")
    L.append("| 当日上榜数 | 1-2板标的 | 高度板剔除 | 上榜涨停占比 | 历史分位 | 门控 |")
    L.append("|---|---|---|---|---|---|")
    L.append(f"| {info['n_all']} | {info['n_low']} | {len(high)} | {info['today_zt']*100:.1f}% | {pct} | {reg} |\n")
    L.append("## 二、剔除的高度板（不做推荐，仅留档）\n")
    if len(high):
        L.append("| 代码 | 名称 | 连板高度 | P | 说明 |")
        L.append("|---|---|---|---|---|")
        for _, r in high.iterrows():
            L.append(f"| {r['CODE']} | {r['NAME']} | {int(r['BOARDS'])}板 | {float(r['P'])*100:.1f}% | 高位板，接力风险大 |")
    else:
        L.append("_无_")
    L.append("")
    L.append(f"## 三、聚焦 Top{topn}（刚刚 1-2 板）\n")
    L.append("| # | 代码 | 名称 | 板数 | 综合分 | P(T+3) | 净买比 | 前3日透支 | 换手% | 主线 | 游资 | 上榜原因 |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for i, (_, r) in enumerate(foc.head(topn).iterrows(), 1):
        p3 = f"{r['PRE3_RET']:.1f}" if pd.notna(r["PRE3_RET"]) else "—"
        tr = f"{r['TURNOVERRATE']:.1f}" if pd.notna(r["TURNOVERRATE"]) else "—"
        L.append(f"| {i} | {r['CODE']} | **{r['NAME']}** | {r['BOARDS']}板 | {r['SCORE']:.3f} | "
                 f"{r['P']:.1f}% | {r['NET_BUY_RATIO']} | {p3} | {tr} | "
                 f"{'Y' if r['THEME_MAIN'] else '—'} | {'Y' if r['FAMOUS_YZ'] else '—'} | {r['REASON']} |")
    L.append("")
    L.append(f"## 四、1-2 板全量清单（{len(foc)} 只，按综合分）\n")
    L.append("| 代码 | 名称 | 板数 | 综合分 | P | 净买比 | 透支 | 换手% | 惩罚项 |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for _, r in foc.iterrows():
        p3 = f"{r['PRE3_RET']:.1f}" if pd.notna(r["PRE3_RET"]) else "—"
        tr = f"{r['TURNOVERRATE']:.1f}" if pd.notna(r["TURNOVERRATE"]) else "—"
        L.append(f"| {r['CODE']} | {r['NAME']} | {r['BOARDS']}板 | {r['SCORE']:.3f} | {r['P']:.1f}% | "
                 f"{r['NET_BUY_RATIO']} | {p3} | {tr} | {r['惩罚项'] or '—'} |")
    L.append("")
    L.append("## 五、综合分口径\n")
    L.append("- 综合分 = **0.40×P** + **0.20×净买比** + **0.18×质量(主线/游资)** + **0.12×换手健康** + **0.10×位置** − 透支惩罚 − 纯机构主买惩罚。")
    L.append("- 换手健康：2%~16% 为理想带；`<2%` 缩量惜售略扣（0.70）；`>16%` 分歧放大递减，`>25%` 加速扣分。")
    L.append("- 惩罚：前3日透支 ≥35% 扣 0.25、25~35% 扣 0.12；纯机构主买(机构=1 且 游资=0 且 净买比<0.65) 扣 0.18。")
    L.append("- 硬剔除：**≥3 板高度板**、**今日未涨停上榜**、ST/退市/立案等暴雷股。\n")
    L.append("## 六、执行与风控\n")
    L.append("- 只做 **Top5** 头部；T+1 不涨停即减仓，跌破上榜日收盘止损。")
    L.append("- 弱市（上方门控为🔴）自动降级：仓位减半或空仓，仅对绝对龙头出手。")
    L.append("- 高位板（≥3板）不参与，本清单已剔除；如需博弈高位属另一套逻辑，不在本模型口径内。\n")
    L.append("> ⚠️ 以上基于公开行情整理，仅供复盘参考，不构成投资建议。")
    return "\n".join(L)


def main(date=None, topn=TOPN_DEFAULT):
    import pipeline as P
    date = date or P.board_ready_day()
    return build(date, topn)


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0] if a else None, int(a[1]) if len(a) >= 2 else TOPN_DEFAULT)
