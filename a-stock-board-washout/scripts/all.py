# -*- coding: utf-8 -*-
"""全流程编排：采集池 -> 采集个股 -> 筛选评分 -> 渲染报告。

用法（脚本用 sys.executable 调子脚本，跟随当前解释器）：
  python scripts/all.py                  # 最近结束交易日，全流程
  python scripts/all.py --date 20260825  # 指定交易日
  python scripts/all.py --no-report      # 只采集+筛选，不出图
"""
import os
import sys
import argparse
import subprocess

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable


def run(step, script, target, extra=None):
    print(f"\n===== [{step}] {script} =====")
    args = [PY, os.path.join(BASE, "scripts", script)]
    if target:
        args += ["--date", target]
    if extra:
        args += extra
    r = subprocess.run(args, cwd=os.path.join(BASE, "scripts"))
    if r.returncode != 0:
        print(f"!! [{step}] {script} 失败 (exit {r.returncode})")
        sys.exit(r.returncode)


def main():
    ap = argparse.ArgumentParser(description="首板洗盘选股 全流程编排")
    ap.add_argument("--date", default=None, help="目标交易日 YYYYMMDD（默认最近结束交易日）")
    ap.add_argument("--no-report", action="store_true", help="只采集+筛选，不出图")
    _a = ap.parse_args()
    target = _a.date

    run("1/3 采集池", "collect_pools.py", target)
    # 由 collect_pools 判定的 T（若未指定则读产物）；逐股资金统一新浪口径（collect_stocks 内建）
    run("2/3 采集个股", "collect_stocks.py", None)
    run("筛选评分", "screen_washout.py", None)
    if not _a.no_report:
        run("渲染报告", "generate_report.py", None)
    # 自学习闭环（盘后）：验证历史推荐 -> 反推权重回写 params_best.json
    run("验证回填", "verify.py", None)
    run("权重自学习", "evolve.py", None)
    print("\n===== 全流程完成 =====")


if __name__ == "__main__":
    main()