# -*- coding: utf-8 -*-
"""每日龙虎榜 T+3 涨停推荐（收盘后运行）
主口径 = TopN 概率排序（含 P 值）＋市场强弱门控；「纳入观察」仅作辅助标注，
不再用「主线 + 净买比≥0.55」等硬门槛筛掉高 P 股票（90 日 PIT 回溯证明该框拖累精度）。
流程:
1) 确保当日 board/seats/hot/kline 已抓(缺失则增量抓取)
2) 构建当日特征 -> dataset
3) 用当前模型打分 -> 排序 TopN
4) 市场强弱门控(弱市降级) + 暴雷一票否决 + 辅助「纳入观察」标注, 存 recommend_{DATE}.csv
用法: python recommend.py [DATE]   (DATE 缺省=最近已发布交易日)
"""
import os, sys
import numpy as np
import pandas as pd
import _common as C
import dataset as D
import pipeline as P

REC_TOPN = C.REC_TOPN
WEAK_MKT_PCTILE = 30      # 当日上榜涨停占比(MARKET_ZT)处于历史后 30% 分位 → 弱市降级
PURE_INST_TOL = 0.65      # 净买比低于此且纯机构(游资=0 且 HAS_INST=1) → 纯机构主买


def market_regime(today_zt):
    """用当日上榜股涨停占比(MARKET_ZT)在全量历史中的分位判定市场强弱。
    弱市 Top20 命中显著低于强市(90日回溯: 24.5% vs 37.2%), 据此自动降级。"""
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


def buy_candidate(r):
    """辅助「纳入观察」标注: P≥阈值 且 未过度透支 且 非纯机构主买。
    主口径为 TopN 概率排序, 本标注仅是辅助提示, 不筛除高 P 股票。"""
    hit = (r["P"] is not None and r["P"] >= 0.30
           and pd.notna(r["PRE3_RET"]) and r["PRE3_RET"] < 38
           and not (r["HAS_INST"] == 1 and r["FAMOUS_YZ"] == 0
                    and r["NET_BUY_RATIO"] < PURE_INST_TOL))
    return bool(hit)


def main(date=None):
    date = date or P.board_ready_day()
    print(f"[recommend] 目标交易日 {date}")
    # 确保数据: 增量抓取当日(若 board 无此日)
    b = C.load_board()
    if len(b) == 0 or date not in set(b["TRADE_DATE"]):
        print(f"[recommend] 抓取 {date} 数据...")
        P.run(date, date)
    # 重建当日特征
    D.build_date(date)
    ART = C.load_model()
    if ART is None:
        print("[recommend] 模型未训练, 请先运行 run.py init/train"); return
    df = pd.read_csv(C.DATASET_CSV, dtype={"CODE": str})
    sub = df[df["TRADE_DATE"] == date].copy()
    if len(sub) == 0:
        print(f"[recommend] {date} 无特征数据"); return
    sub["P"] = C.predict(sub, ART)
    sub = sub.sort_values("P", ascending=False).reset_index(drop=True)
    # 市场强弱门控(用当日上榜涨停占比在全量历史中的分位)
    today_zt = pd.to_numeric(sub["MARKET_ZT"], errors="coerce").mean()
    regime, pctile = market_regime(today_zt)
    # 暴雷一票否决：ST/退市/立案调查等风险股即使 P 高也不纳入观察
    sub["_risk"] = [C.risk_level(r["NAME"]) for _, r in sub.iterrows()]
    n_risk = int((sub["_risk"] == "red").sum())
    sub["纳入观察"] = [buy_candidate(r) and sub["_risk"][i] != "red"
                       for i, r in enumerate(sub.to_dict("records"))]
    sub["状态"] = sub["T3_ZT"].apply(lambda v: "✓涨停" if (pd.notna(v) and v == 1) else ("✗未涨" if pd.notna(v) else "待验证"))
    out_cols = ["TRADE_DATE", "CODE", "NAME", "P", "状态", "THEME_MAIN", "IS_LIMIT_UP", "LB_FLAG",
                "FAMOUS_YZ", "NET_BUY_RATIO", "PRE3_RET", "BUYER_MEAN_SCORE", "纳入观察"]
    out = sub[out_cols].copy()
    out["P"] = (out["P"] * 100).round(1)
    out_path = os.path.join(C.RUNTIME, f"recommend_{date}.csv")
    out.to_csv(out_path, index=False, encoding="utf-8-sig")
    # 打印
    top = sub.head(REC_TOPN)
    regime_tag = "🔴弱市(仅供参考, 不推荐追高)" if regime == "weak" else "🟢正常"
    print(f"\n=== {date} 上榜股 T+3涨停概率 Top{REC_TOPN} (共 {len(sub)} 只, 暴雷剔除 {n_risk}) 市场:{regime_tag} ===")
    for _, r in top.iterrows():
        tag = "★候选" if r["纳入观察"] else ""
        risk_tag = "⚠暴雷" if r["_risk"] == "red" else ""
        print(f"  {r['CODE']} {str(r['NAME'])[:8]:<8} P={r['P']*100:5.1f}% "
              f"{'主线' if r['THEME_MAIN'] else '-'} {'涨停' if r['IS_LIMIT_UP'] else '-'} "
              f"{'游资' if r['FAMOUS_YZ'] else '-'} 净买比={r['NET_BUY_RATIO']:.2f} {tag}{risk_tag}")
    n_cand = int(sub["纳入观察"].sum())
    print(f"\n[recommend] 保存 {out_path}  | 主口径=Top{REC_TOPN} 概率排序, 纳入观察(辅助) {n_cand} 只")
    if regime == "weak":
        print(f"[recommend] 弱市提示: 当日上榜涨停占比 {today_zt*100:.0f}% 处历史 {pctile:.0f}% 分位, 建议降级观察、勿追高")
    return out


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) >= 2 else None)