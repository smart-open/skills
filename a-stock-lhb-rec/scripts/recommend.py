# -*- coding: utf-8 -*-
"""每日龙虎榜 T+3 涨停推荐(收盘后运行)
1) 确保当日 board/seats/hot/kline 已抓(若缺失则增量抓取)
2) 构建当日特征 -> dataset
3) 用当前模型打分 -> 排序 TopN
4) 应用买入框架标记「纳入观察」候选, 存 recommend_{DATE}.csv
用法: python recommend.py [DATE]   (DATE 缺省=最近已发布交易日)
"""
import os, sys
import numpy as np
import pandas as pd
import _common as C
import dataset as D
import pipeline as P

REC_TOPN = C.REC_TOPN


def buy_candidate(r):
    """买入框架: 满足则纳入观察"""
    return (r["P"] is not None and r["P"] >= 0.30
            and r["THEME_MAIN"] == 1
            and r["NET_BUY_RATIO"] >= 0.55
            and (r["IS_LIMIT_UP"] == 1 or r["LB_FLAG"] == 1 or r["FAMOUS_YZ"] == 1)
            and r["PRE3_RET"] is not None and pd.notna(r["PRE3_RET"]) and r["PRE3_RET"] < 38
            and not (r["HAS_INST"] == 1 and r["FAMOUS_YZ"] == 0 and r["NET_BUY_RATIO"] < 0.65))


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
    # 暴雷一票否决：ST/退市/立案调查等风险股强制剔除，即使模型 P 高也不纳入观察
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
    print(f"\n=== {date} 上榜股 T+3涨停概率 Top{REC_TOPN} (共 {len(sub)} 只, 暴雷剔除 {n_risk}) ===")
    for _, r in top.iterrows():
        tag = "★候选" if r["纳入观察"] else ""
        risk_tag = "⚠暴雷" if r["_risk"] == "red" else ""
        print(f"  {r['CODE']} {str(r['NAME'])[:8]:<8} P={r['P']*100:5.1f}% "
              f"{'主线' if r['THEME_MAIN'] else '-'} {'涨停' if r['IS_LIMIT_UP'] else '-'} "
              f"{'游资' if r['FAMOUS_YZ'] else '-'} 净买比={r['NET_BUY_RATIO']:.2f} {tag}{risk_tag}")
    n_cand = int(sub["纳入观察"].sum())
    print(f"\n[recommend] 保存 {out_path}  | 纳入观察候选 {n_cand} 只 / Top{REC_TOPN}")
    return out


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) >= 2 else None)
