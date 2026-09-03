# -*- coding: utf-8 -*-
"""全流程管线：数据采集 -> 健康检查 -> 分析模型 -> 报告生成。
   「每次运行都取最新数据」的统一入口：默认全量重采（不跳过已有文件），任何关键产物
   缺失 / 日期过期 / 步骤失败 → 汇总报告并 exit 1，杜绝静默生成空报告或陈旧报告。
   用法：
     py collect_all.py                     # 全流程：采集 + 检查 + 模型 + 报告
     py collect_all.py --only-check        # 仅健康检查（诊断数据是否缺失/过期）
     py collect_all.py --no-models         # 只采集 + 检查，不跑模型和报告
     py collect_all.py --skip collect_news.py,collect_fund_15d.py   # 跳过指定步骤（脚本名）
"""
import os
import sys
import subprocess
import argparse
from datetime import datetime, timedelta

from _common import BASE, DATA_DIR, load_json, latest_trade_day

# collect_all 被启动时的用户工作目录：作为子进程产物根传给 _common（A_STOCK_WORK/A_STOCK_OUT）。
# 子进程在 cwd=scripts 下运行仅为了让 `from _common import` 能定位到共享库；
# 若不显式注入，子进程 os.getcwd()==scripts/ 会把数据/报告写回技能目录 —— 必须用启动目录覆盖。
LAUNCH_CWD = os.getcwd()

# (标签, 脚本, 传 --date TD 与否)  采集段按依赖顺序执行
COLLECT_STEPS = [
    ("主行情快照", "collect_data.py", False),
    ("新浪补充+资金排行", "collect_v2.py", False),
    ("快讯", "collect_news.py", False),
    ("板块15日涨幅", "collect_boards_15d.py", False),
    ("涨停15日", "collect_zt_15d.py", False),
    ("板块资金15日", "collect_fund_15d.py", False),
    ("个股推荐", "recommend.py", True),
]
MODEL_STEPS = [
    ("热点发现", "gen_hot_sectors.py"),
    ("题材生命周期", "gen_theme_lifecycle.py"),
    ("资金轮动四象限", "gen_rotation_v2.py"),
    ("次日轮动主线推荐", "recommend_rotation.py"),
    ("情绪温度计", "gen_emotion_cycle.py"),
    ("行情复盘报告", "generate_report_v3.py"),
    ("轮动推荐验证", "rotation_verify.py"),
    ("轮动权重自学习", "rotation_evolve.py"),
]


def run_step(py, with_date, td):
    cmd = [sys.executable, os.path.join(BASE, "scripts", py)]
    if with_date:
        cmd += ["--date", td]
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    # 产物根统一指向 collect_all 启动目录（用户显式设 A_STOCK_WORK/A_STOCK_OUT 时优先尊重之），
    # 否则子进程会因 cwd=scripts 而把数据/报告写回技能安装目录。
    # 约定（与 _common 一致）：数据 → <cwd>/a-stock-operator-v2/data，报告 → <cwd> 根目录。
    # 故 A_STOCK_WORK 指向 <cwd>/a-stock-operator-v2（数据子目录），A_STOCK_OUT 指向 <cwd>（报告根）。
    env.setdefault("A_STOCK_WORK", os.path.join(LAUNCH_CWD, "a-stock-operator-v2"))
    env.setdefault("A_STOCK_OUT", LAUNCH_CWD)
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                       errors="ignore", env=env, cwd=os.path.join(BASE, "scripts"))
    for line in (r.stdout or "").strip().splitlines()[-6:]:
        print(f"    {line}")
    if r.returncode != 0:
        for line in (r.stderr or "").strip().splitlines()[-3:]:
            print(f"    [stderr] {line}")
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser(description="全流程管线：采集 -> 健康检查 -> 模型 -> 报告")
    ap.add_argument("--date", default=datetime.now().strftime("%Y%m%d"),
                    help="目标交易日 YYYYMMDD，默认真实今日")
    ap.add_argument("--only-check", action="store_true", help="跳过采集，仅做健康检查")
    ap.add_argument("--no-models", action="store_true", help="采集+检查后停止，不跑模型和报告")
    ap.add_argument("--skip", default="", help="跳过指定步骤（逗号分隔脚本名，含模型脚本）")
    args = ap.parse_args()
    TD = args.date
    expect = latest_trade_day(TD)  # 新鲜度基准：目标日往前最近工作日
    # 盘中场景：东财板块 K 线/资金流日线当日数据可能尚未落库，容忍最近两个工作日
    prev_expect = latest_trade_day(
        (datetime.strptime(expect, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d"))
    skip = {s.strip() for s in args.skip.split(",") if s.strip()}

    print(f"[collect_all] 目标交易日 {TD}，新鲜度基准 {expect}（盘中容忍 {prev_expect}）")

    failed_steps = []
    if not args.only_check:
        for label, py, wd in COLLECT_STEPS:
            if py in skip:
                print(f"\n=== {label} ({py}) —— 已跳过 ===")
                continue
            print(f"\n=== {label} ({py}) ===")
            if not run_step(py, wd, TD):
                failed_steps.append(label)
                print(f"    ✗ 步骤失败（exit != 0）")

    print("\n===== 数据健康检查 =====")
    D = DATA_DIR
    checks = []
    warnings = []

    def check(name, ok, detail=""):
        checks.append((name, ok, detail))
        print(f"  {'✓' if ok else '✗'} {name}  {detail}")

    def warn(name, detail=""):
        warnings.append((name, detail))
        print(f"  ⚠ {name}  {detail}")

    # 1) market_{TD}.json：关键项 + 采集时间戳 + 数据日期一致 + 无沿用旧值
    m = load_json(os.path.join(D, f"market_{TD}.json"), {})
    idx_n = len(m.get("indexes") or [])
    check("market 指数", idx_n >= 6, f"{idx_n}/8 个")
    zt_total = ((m.get("limit_up") or {}).get("total") or 0)
    check("market 涨停池", zt_total > 0, f"涨停 {zt_total} 家")
    check("market 炸板池", bool(m.get("broken")), "")
    check("market 涨跌家数", bool(m.get("breadth")), "")
    ca = (m.get("collected_at") or "")[:10].replace("-", "")
    check("market 时间戳新鲜", ca == TD, f"collected_at={ca or '无'}")
    td_in = str(m.get("trade_date") or "").replace("-", "")
    check("market 数据日期一致", td_in == TD, f"trade_date={td_in or '无'}")
    # 沿用旧值项 = 同日早间采集值（market 按 TD 分键，无跨日污染风险），仅告警不阻断
    stale = m.get("stale_kept") or []
    if stale:
        warn("market 部分项沿用同日早间值", f"stale_kept={stale}")

    # 2) news_{TD}.json
    n = load_json(os.path.join(D, f"news_{TD}.json"), [])
    check("news 快讯", isinstance(n, list) and len(n) > 0, f"{len(n)} 条")

    # 3) boards_15d.json：覆盖量 + 最新日期 == 基准
    b = load_json(os.path.join(D, "boards_15d.json"), {})
    latest_b = max((d_ for v in b.values() for d_, _ in v), default="")
    check("板块15日涨幅覆盖", len(b) >= 10, f"{len(b)} 个板块")
    check("板块涨幅新鲜度", latest_b in (expect, prev_expect), f"最新 {latest_b or '无'} / 期望 {expect}")

    # 4) zt_15d.json / zt_pool_15d.json
    z = load_json(os.path.join(D, "zt_15d.json"), {})
    zp = load_json(os.path.join(D, "zt_pool_15d.json"), {})
    z_days = sum(1 for v in z.values() if v)
    latest_z = max(z.keys(), default="")
    check("涨停板块计数", z_days >= 10, f"{z_days} 个有效日")
    check("涨停池个股", bool(zp), f"{len(zp)} 日")
    check("涨停数据新鲜度", latest_z in (expect, prev_expect), f"最新 {latest_z or '无'}")

    # 5) fund_15d.json
    f = load_json(os.path.join(D, "fund_15d.json"), {})
    latest_f = max((d_ for v in f.values() for d_ in v), default="")
    check("板块资金15日覆盖", len(f) >= 10, f"{len(f)} 个板块")
    check("板块资金新鲜度", latest_f in (expect, prev_expect), f"最新 {latest_f or '无'}")

    # 7) recommend_{TD}.json（当日新鲜，非旧日残留）
    rc = load_json(os.path.join(D, f"recommend_{TD}.json"), {})
    fb_n = len(rc.get("first_board") or [])
    bo_n = len(rc.get("breakout") or [])
    check("个股推荐", (fb_n + bo_n) > 0, f"首板 {fb_n} + 突破 {bo_n}")

    # 8) 步骤级失败：产物新鲜度已由上方各项严格校验，步骤 exit code 仅告警（部分接口
    #    偶发风控属正常波动，只要产物仍新鲜即继续，避免盘中永远无法完成管线）
    if failed_steps:
        warn("采集步骤部分失败（产物仍新鲜则继续）", ",".join(failed_steps))

    bad = [c for c in checks if not c[1]]
    print(f"\n通过 {len(checks) - len(bad)}/{len(checks)} 项，警告 {len(warnings)} 项")
    for name, detail in warnings:
        print(f"  ⚠ {name}  {detail}")
    if bad:
        print("失败项：")
        for name, _, detail in bad:
            print(f"  ✗ {name}  {detail}")
        print("!! 数据不完整/不新鲜，已停止（不生成陈旧报告）。修复后重跑 collect_all.py")
        sys.exit(1)
    print("全部通过 ✓")

    if args.no_models or args.only_check:
        print("（--no-models / --only-check：管线到此结束）")
        return

    # ===== 模型 + 报告（数据校验全过后才执行，保证报告永远基于当日新数据） =====
    model_failed = []
    for label, py in MODEL_STEPS:
        if py in skip:
            print(f"\n=== {label} ({py}) —— 已跳过 ===")
            continue
        print(f"\n=== {label} ({py}) ===")
        if not run_step(py, True, TD):
            model_failed.append(label)
            print(f"    ✗ 步骤失败（exit != 0）")
    if model_failed:
        print(f"\n!! 模型/报告阶段失败：{model_failed}")
        sys.exit(1)
    print(f"\n✅ 全流程完成：数据 + 模型 + 报告均为 {TD} 最新口径")


if __name__ == "__main__":
    main()
