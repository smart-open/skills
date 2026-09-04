# -*- coding: utf-8 -*-
"""全流程编排：采集池 -> 采集个股 -> 筛选评分 -> 渲染报告 -> 验证回填 -> 权重自学习。

用法（脚本用 sys.executable 调子脚本，跟随当前解释器）：
  python scripts/all.py                  # 最近结束交易日，全流程
  python scripts/all.py --date 20260825  # 指定交易日
  python scripts/all.py --no-report      # 只采集+筛选，不出图

过程数据落 WASHOUT_DATA（缺省 <cwd>/a-stock-board-washout/data），报告落 cwd / WASHOUT_OUT。
"""
import os
import sys
import argparse
import subprocess

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
SCRIPT_DIR = os.path.join(BASE, "scripts")
sys.path.insert(0, SCRIPT_DIR)
from _common import DATA_DIR, data_path  # noqa: E402


def _resolved_T():
    """读 collect_pools 写入的解析后 T（_last_T.txt），供后续步骤显式传 --date。"""
    p = data_path("_last_T.txt")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            v = f.read().strip()
        if v:
            return v
    return None


def run(step, script, target, extra=None):
    print(f"\n===== [{step}] {script} =====")
    args = [PY, os.path.join(SCRIPT_DIR, script)]
    if target:
        args += ["--date", target]
    if extra:
        args += extra
    # 子进程继承当前 cwd（会话根目录），使 WASHOUT_DATA / WASHOUT_OUT 缺省落到会话根而非 scripts 目录
    r = subprocess.run(args, cwd=os.getcwd())
    if r.returncode != 0:
        print(f"!! [{step}] {script} 失败 (exit {r.returncode})")
        sys.exit(r.returncode)


def main():
    ap = argparse.ArgumentParser(description="首板洗盘选股 全流程编排")
    ap.add_argument("--date", default=None, help="目标交易日 YYYYMMDD（默认最近结束交易日）")
    ap.add_argument("--no-report", action="store_true", help="只采集+筛选，不出图")
    ap.add_argument("--no-selflearn", action="store_true", help="跳过盘后验证回填+权重自学习")
    _a = ap.parse_args()

    os.makedirs(os.path.join(DATA_DIR, "data"), exist_ok=True)
    run("1/3 采集池", "collect_pools.py", _a.date)
    target = _resolved_T()
    if not target:
        print("!! 未解析到目标交易日 T，请检查 collect_pools 是否成功")
        sys.exit(1)

    run("2/3 采集个股", "collect_stocks.py", target)
    run("筛选评分", "screen_washout.py", target)
    if not _a.no_report:
        run("渲染报告", "generate_report.py", target)
    if not _a.no_selflearn:
        # 自学习闭环（盘后）：验证历史推荐 -> 反推权重回写 params_best.json
        run("验证回填", "verify.py", target)
        run("权重自学习", "evolve.py", None)
    print("\n===== 全流程完成 =====")


if __name__ == "__main__":
    main()