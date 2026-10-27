#!/usr/bin/env python3
"""
pipeline.py — 短剧全流程一键编排

阶段：plan → portraits → frames → clips → assemble

用法：
  python3 pipeline.py production.json                      # 跑完全流程
  python3 pipeline.py production.json --stage portraits    # 只做到定妆照（供人工确认长相）
  python3 pipeline.py production.json --stage frames --workers 4
  python3 pipeline.py production.json --stage clips --only s01-s06 --force
  python3 pipeline.py production.json --stage final --no-subs

阶段名：plan / portraits / frames / clips / final

预算防线（P0-2）：进入 frames（首个批量生成交付）之前自动运行 estimate_cost.py
播报预估；非交互环境（stdin 非 TTY）必须显式 --yes 才会放行，否则拦截退出。
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAGES = ["plan", "portraits", "frames", "clips", "final"]


def run(cmd):
    print("\n" + "=" * 60 + "\n> " + " ".join(cmd) + "\n" + "=" * 60, flush=True)
    r = subprocess.run(cmd)
    if r.returncode != 0:
        sys.exit(r.returncode)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("--stage", default="final", choices=STAGES,
                    help="执行到哪个阶段为止（默认 final=全部完成）")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--poll-timeout", type=int, default=1200)
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-subs", action="store_true")
    ap.add_argument("--no-bgm", action="store_true")
    ap.add_argument("--yes", action="store_true", help="非交互环境跳过预算确认")
    args = ap.parse_args()

    prod = str(Path(args.production).resolve())
    py = sys.executable

    def s(name):
        return str(HERE / name)

    if STAGES.index(args.stage) >= 0:
        run([py, s("plan_production.py"), prod, "--fix", "--init-dirs"])
    if args.stage == "plan":
        return

    if STAGES.index(args.stage) >= 1:
        cmd = [py, s("make_keyframes.py"), prod, "--portraits-only"]
        if args.force:
            cmd.append("--force")
        run(cmd)
        print("\n[人工检查点] 请查看 out/frames/portraits/ 下定妆照；不满意可修改角色 anchor 后"
              "重跑 --stage portraits --force；满意后继续 frames 阶段。")
    if args.stage == "portraits":
        return

    if STAGES.index(args.stage) >= 2:
        # ---- 预算防线（强制门禁）：批量投放前预估 + 确认，非零退出即拦截 ----
        print("\n[预算防线] frames 阶段开始批量消耗 API 额度，先播报生成前预估：", flush=True)
        r = subprocess.run([py, s("estimate_cost.py"), prod])
        if r.returncode != 0:
            sys.exit(f"预算预估失败（estimate_cost.py 退出码 {r.returncode}），已拦截。"
                     "请先修复 production.json 再重跑。")
        if not args.yes:
            try:
                ans = input("\n[预算防线] 确认按上述预估投放 frames/clips 批量生成？[y/N] ").strip().lower()
            except EOFError:
                ans = ""
            if ans != "y":
                sys.exit("已拦截：预算未确认。确认后重跑并加 --yes（非交互环境必须显式 --yes）。")
        cmd = [py, s("make_keyframes.py"), prod]
        if args.force:
            cmd.append("--force")
        run(cmd)
    if args.stage == "frames":
        return

    if STAGES.index(args.stage) >= 3:
        cmd = [py, s("make_clips.py"), prod, "--workers", str(args.workers),
               "--poll-timeout", str(args.poll_timeout)]
        if args.only:
            cmd += ["--only", args.only]
        if args.force:
            cmd.append("--force")
        run(cmd)
    if args.stage == "clips":
        return

    cmd = [py, s("assemble.py"), prod]
    if args.no_subs:
        cmd.append("--no-subs")
    if args.no_bgm:
        cmd.append("--no-bgm")
    run(cmd)
    print("\n全流程完成。")


if __name__ == "__main__":
    main()
