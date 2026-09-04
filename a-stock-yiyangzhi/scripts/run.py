# -*- coding: utf-8 -*-
"""一阳指转势/开门 量化技能 · 入口编排
用法:
  py scripts/run.py scan [YYYY-MM-DD] [--live] [--minpct 3] [--maxpct 10.9] [--force]
  py scripts/run.py judge <代码或名称> [YYYY-MM-DD]
  py scripts/run.py optimize [--codes a,b,c] [--top 60] [--min-samples 30]
  py scripts/run.py verify [--date YYYYMMDD]
"""
from __future__ import annotations
import os, sys, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C

SP = os.path.join(os.path.dirname(os.path.abspath(__file__)))


def _py():
    # 首选当前运行本脚本的解释器（环境无关），回退系统 python
    cands = [sys.executable, "python", "py"]
    seen = set()
    for c in cands:
        if not c or c in seen:
            continue
        seen.add(c)
        try:
            r = subprocess.run([c, "-c", "import numpy"], capture_output=True, text=True,
                               timeout=20)
            if r.returncode == 0:
                return c
        except Exception:
            continue
    return sys.executable


def main(argv):
    if not argv or argv[0] == "-h":
        print(__doc__)
        return 0
    cmd = argv[0]
    rest = argv[1:]
    if cmd == "scan":
        status = subprocess.call([_py(), os.path.join(SP, "scan.py")] + rest)
    elif cmd == "judge":
        if not rest:
            print("用法: py scripts/run.py judge <代码或名称> [日期]")
            return 2
        status = subprocess.call([_py(), os.path.join(SP, "judge.py")] + rest)
    elif cmd == "optimize":
        status = subprocess.call([_py(), os.path.join(SP, "optimize.py")] + rest)
    elif cmd == "verify":
        status = subprocess.call([_py(), os.path.join(SP, "verify.py")] + rest)
    else:
        print(f"未知命令: {cmd}")
        print(__doc__)
        return 2
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))