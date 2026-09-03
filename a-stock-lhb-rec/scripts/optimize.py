# -*- coding: utf-8 -*-
"""自我进化: 用最新实际结果重训模型, 让预测越来越准
流程:
  1) 增量抓取最新龙虎榜数据(补入尚未可知的 T+3 实际结果)
  2) 重建席位画像(含新数据)
  3) 重建特征集(新数据行获得标签 / 旧未标签行若 T+3 已到期也补标签)
  4) 若有新增标签样本则重训(时间外 AUC 不劣于当前则版本+1, 见 train.py)
  5) 打印进化轨迹
用法: python optimize.py
"""
import os, sys, json
import datetime as dtmod
import pandas as pd
import _common as C
import pipeline as P
import dataset as D
import train as T
import seat_profile as SP


def labeled_count():
    if not os.path.exists(C.DATASET_CSV):
        return 0
    d = pd.read_csv(C.DATASET_CSV)
    return int(d["T3_ZT"].notna().sum())


def main():
    today = dtmod.date.today().isoformat()
    start = (dtmod.date.fromisoformat(today) - dtmod.timedelta(days=30)).isoformat()
    print(f"[optimize] 增量抓取 {start} ~ {today}")
    before = labeled_count()
    P.run(start, today)                       # 1) 补最新数据(跳过已有)
    SP.build()                                # 2) 重建席位画像(含新数据)
    print("[optimize] 重建席位画像完成")
    D.build_all()                             # 3) 重建特征(标签随 kline 延伸而补全)
    after = labeled_count()
    if after > before:
        print(f"[optimize] 新增标签样本 {after - before} 条, 触发重训")
        rec = T.main()                        # 4) 重训 + 版本决策 + 写 history
    else:
        print(f"[optimize] 标签样本无新增({after} 条), 跳过重训(模型已是最新)")
        rec = None
    # 5) 进化轨迹
    if os.path.exists(C.HISTORY_PATH):
        hist = json.load(open(C.HISTORY_PATH, encoding="utf-8"))
        print("\n=== 模型进化轨迹 ===")
        for h in hist[-8:]:
            rz = h.get("realized") or {}
            rz_s = f"  真实T3命中={rz.get('t3_hit')}%" if rz.get("t3_hit") is not None else ""
            wsum = f"  加权样本={h.get('wsum')}" if h.get("wsum") is not None else ""
            gap = f"  过拟合差={h.get('overfit_gap')}" if h.get("overfit_gap") is not None else ""
            print(f"  v{h['version']} {h['date']}  样本={h['n']}{wsum}  时间外AUC={h['auc_temporal']}  "
                  f"Top20={h['top20']}%{gap}{rz_s}  接受={h['accepted']}  {h['note']}")
    return rec


if __name__ == "__main__":
    main()
