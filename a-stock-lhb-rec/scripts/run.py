# -*- coding: utf-8 -*-
"""龙虎榜 T+3 涨停推荐 · 统一入口
子命令:
  init                  首次全量构建(近90天数据 -> 画像 -> 特征 -> 训练 -> 推荐 -> 报告 -> 自动学习)
  daily [DATE]          每日收盘后主流程: 抓最新 -> 推荐 -> 验证前几日 -> 报告 -> 自动自我学习重训
  recommend [DATE]     仅对指定日(缺省=最近已发布交易日)生成 T+3 推荐候选
  verify [DATE]        验证历史推荐实际命中(缺省=最近 recommend 文件)
  optimize             手动自我进化: 补最新数据 -> 重训 -> 版本决策
  train                仅重训(不抓数据)
  report [DATE]        生成 Markdown 报告(生成后自动触发自我学习)
说明:
  每次生成报告(init/daily/report)后都自动执行自我学习(optimize)——
  把当日分析数据落到 a-stock-lhb-rec/ 并据最新实际结果重训, 无需额外定时任务。
示例:
  python run.py init
  python run.py daily
  python run.py recommend 2026-08-28
  python run.py optimize
"""
import os, sys, datetime as dtmod
import _common as C
import pipeline as P
import dataset as D
import seat_profile as SP
import train as T
import recommend as RC
import verify as V
import report as RP


def self_learn():
    """生成报告后自动自我学习: 补最新实际结果 -> 重训 -> 版本决策(时间外 AUC 不劣才 +1)。
    内嵌于每次报告生成之后, 不依赖外部 cron 定时任务。"""
    try:
        __import__("optimize").main()
    except Exception as e:
        print(f"  [自动学习] optimize 跳过: {e}")


def cmd_init():
    today = dtmod.date.today().isoformat()
    start = (dtmod.date.fromisoformat(today) - dtmod.timedelta(days=90)).isoformat()
    print("=== init: 全量构建(近90天) ===")
    P.run(start, today)
    SP.build()
    D.build_all()
    T.main()
    d = P.board_ready_day()
    RC.main(d)
    RP.main(d)
    self_learn()                           # 生成报告后自动自我学习
    print("=== init 完成 ===")


def cmd_daily(date=None):
    date = date or P.board_ready_day()
    print(f"=== daily: {date} 主流程 ===")
    P.fetch_latest()                       # 1) 抓最新(今日)龙虎榜
    RC.main(date)                          # 2) 今日推荐
    # 3) 验证前 4~10 个交易日(其 T+1..T+3 已完全结算, 才有真实命中可统计)
    for back in range(4, 11):
        pd_ = (dtmod.date.fromisoformat(date) - dtmod.timedelta(days=back)).isoformat()
        while dtmod.date.fromisoformat(pd_).weekday() >= 5:
            pd_ = (dtmod.date.fromisoformat(pd_) - dtmod.timedelta(days=1)).isoformat()
        if os.path.exists(os.path.join(C.RUNTIME, f"recommend_{pd_}.csv")):
            try:
                V.main(pd_)
            except Exception as e:
                print(f"  verify {pd_} 跳过: {e}")
    RP.main(date)                          # 4) 生成报告(基于当前模型)
    self_learn()                           # 5) 生成报告后自动自我学习优化
    print("=== daily 完成 ===")


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); return
    cmd = args[0]
    rest = args[1:]
    if cmd == "init":
        cmd_init()
    elif cmd == "daily":
        cmd_daily(rest[0] if rest else None)
    elif cmd == "recommend":
        RC.main(rest[0] if rest else None)
    elif cmd == "verify":
        V.main(rest[0] if rest else None)
    elif cmd == "optimize":
        __import__("optimize").main()
    elif cmd == "train":
        T.main()
    elif cmd == "report":
        RP.main(rest[0] if rest else None)
        self_learn()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
