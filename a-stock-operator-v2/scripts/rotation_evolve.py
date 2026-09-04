# -*- coding: utf-8 -*-
"""轮动推荐强化自学习：用 rotation_history.csv 累计样本反推四维因子权重，回写 rotation_params.json。

方法（与洗盘/一阳指自学习同构，可解释抗过拟合）：
  ① 读 rotation_history.csv，取 T+3 可判定（known>=3）样本。
  ② 因子原始值优先用推荐时落盘的『当日真实快照』（position/fund/strength/heat 列，由
     recommend_rotation v2 写入）；旧样本无快照列时回退反查重建（heat/emotion 无法还原）。
  ③ 对每因子做 Spearman 秩相关（因子 × 命中0/1），方向正确放大、方向错误削弱。
  ④ EMA 平滑到先验权重，归一化和为 1。
  ⑤ 回写 rotation_params.json（含权重 + 样本统计 + 生成时间），recommend_rotation.py 下次自动加载。

emotion(封板率)为市场级常量、无截面区分，已移出打分维度，改由 recommend_rotation 风控门控处理。

用法：python scripts/rotation_evolve.py [--min-samples 20] [--alpha 0.3]
"""
import os
import csv
import argparse
import statistics
from datetime import datetime

from _common import (BASE, DATA_DIR, load_json, dump_json, safe_float,
                     seal_break_rates, bridge_ths_name, boards_chg_lookup, window_start_ymd)

PARAMS_PATH = os.path.join(DATA_DIR, "rotation_params.json")
# 方向：position/fund/strength/heat 越大越好（strength 已改「趋势内强度」Z 分，剥离过热后越大越强）
FACTOR_KEYS = ("position", "fund", "strength", "heat")
FACTOR_DIR = {"position": True, "fund": True, "strength": True, "heat": True}
PRIOR_W = {"position": 0.48, "fund": 0.08, "strength": 0.09, "heat": 0.35}

ap = argparse.ArgumentParser(description="轮动推荐 权重自学习")
ap.add_argument("--min-samples", type=int, default=20, help="最小样本数（不足不改权）")
ap.add_argument("--alpha", type=float, default=0.3, help="EMA 平滑系数")
_args = ap.parse_args()


def _rank(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    ranks = [0.0] * len(vals)
    i = 0
    n = len(vals)
    while i < n:
        j = i
        while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman(x, y):
    if len(x) < 3:
        return 0.0
    rx, ry = _rank(x), _rank(y)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = sum((a - mx) ** 2 for a in rx)
    dy = sum((b - my) ** 2 for b in ry)
    den = (dx * dy) ** 0.5
    return num / den if den else 0.0


def _reconstruct_factors(name, date, boards, zt, fund, seal_rate):
    """反查某板块在推荐日的因子原始值（旧样本无快照时回退用）。"""
    # position：趋势分近似 = 5日累计涨幅
    daily = boards_chg_lookup(boards, name)
    cum5 = 0.0
    if daily:
        recent = daily[-5:]
        cum5 = sum(chg for _, chg in recent)
    pos = max(0.0, min(1.0, (cum5 / 100.0 + 0.1) / 0.3))

    # fund：近5日资金为正占比
    fm = fund.get(name)
    if not fm:
        ths = bridge_ths_name(name)
        for k, v in fund.items():
            if bridge_ths_name(k) == ths:
                fm = v
                break
    if fm:
        fseq = [safe_float(fm[d]) for d in sorted(fm.keys())][-5:]
        fund_persist = sum(1 for v in fseq if v > 0) / len(fseq) if fseq else 0.0
    else:
        fund_persist = 0.5

    # strength：涨停家数（回退用裸值；有 zt_15d 时仍给原始涨停家数供秩相关）
    strength = 0
    for d_, cnt in zt.get(date, {}).items():
        if d_ == name or bridge_ths_name(d_) == bridge_ths_name(name):
            strength = cnt
            break

    # heat：扩散度（无历史则中性 0.5）
    heat = 0.5

    return {"position": pos, "fund": fund_persist, "strength": float(strength), "heat": heat}


def load_samples():
    vp = os.path.join(DATA_DIR, "rotation_history.csv")
    if not os.path.exists(vp):
        return []
    with open(vp, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    # 仅取最近 3 个月窗口内的样本（避免陈旧样本污染权重）
    wstart = window_start_ymd()
    out = []
    for r in rows:
        if (r.get("date") or "") < wstart:
            continue
        try:
            if int(r.get("known", 0)) < 3:
                continue
            hit = int(r.get("hit", 0))
        except (TypeError, ValueError):
            continue
        # 优先用推荐时落盘的因子快照（新 rotation_verify v2 写入）；缺列则留空走反查回退
        snap = {}
        for fk in FACTOR_KEYS:
            v = r.get(fk)
            snap[fk] = v if v not in (None, "") else None
        out.append({"date": r.get("date", ""), "name": r.get("name", ""),
                    "hit": hit, "snap": snap})
    return out


def main():
    samples = load_samples()
    if not samples:
        print("!! 无 rotation_history.csv 样本，请先跑 rotation_verify.py 累积数日")
        return

    boards = load_json(os.path.join(DATA_DIR, "boards_15d.json"), {})
    zt = load_json(os.path.join(DATA_DIR, "zt_15d.json"), {})
    fund = load_json(os.path.join(DATA_DIR, "fund_15d.json"), {})

    n = len(samples)
    result = {"ok": False, "samples": n, "generated": datetime.now().isoformat(),
              "weights": dict(PRIOR_W), "factor_info": {}, "base_hit": 0.0}

    if n < _args.min_samples:
        result["reason"] = f"样本不足（{n}<{_args.min_samples}），维持先验权重"
        dump_json(load_json(PARAMS_PATH, {}) | {"status": "insufficient", "samples": n},
                  PARAMS_PATH)
        print(result["reason"])
        return

    # 组装因子 + 命中：快照优先，缺列反查回退
    recs = []
    n_snapshot = 0
    for i, s in enumerate(samples):
        date = s["date"]
        snap = s["snap"]
        complete = all(snap[fk] is not None for fk in FACTOR_KEYS)
        if complete:
            fac = {fk: safe_float(snap[fk], 0.0) for fk in FACTOR_KEYS}
            n_snapshot += 1
        else:
            mkt = load_json(os.path.join(DATA_DIR, f"market_{date}.json"), {})
            tu = mkt.get("limit_up", {}).get("total", 0)
            tz = mkt.get("broken", {}).get("total", 0)
            seal, _ = seal_break_rates(tu, tz)
            fac = _reconstruct_factors(s["name"], date, boards, zt, fund, seal)
        fac["hit"] = s["hit"]
        recs.append(fac)

    hits = [r["hit"] for r in recs]
    base_hit = statistics.mean(hits)

    new_w = {}
    info = {}
    for fk, higher in FACTOR_DIR.items():
        vals = [r[fk] for r in recs]
        rho = spearman(vals, hits)
        aligned = (rho > 0) if higher else (rho < 0)
        strength = min(abs(rho), 0.5)
        w = PRIOR_W[fk] * (1.0 + 2.0 * strength) if aligned else PRIOR_W[fk] * (1.0 - 0.5 * strength)
        w = max(w, 0.02)
        new_w[fk] = w
        info[fk] = {"rho": round(rho, 3), "aligned": aligned, "n": n}
    tot = sum(new_w.values())
    new_w = {k: round(v / tot, 4) for k, v in new_w.items()}
    smoothed = {k: round(_args.alpha * new_w[k] + (1 - _args.alpha) * PRIOR_W[k], 4) for k in new_w}
    tot2 = sum(smoothed.values())
    smoothed = {k: round(v / tot2, 4) for k, v in smoothed.items()}

    result.update({"ok": True, "n": n, "base_hit": round(base_hit, 3),
                   "n_snapshot": n_snapshot,
                   "weights": smoothed, "raw_weights": new_w, "factor_info": info})
    old = load_json(PARAMS_PATH, {})
    old.update(result)
    dump_json(old, PARAMS_PATH)

    print(f"✅ 轮动权重自学习完成 → {PARAMS_PATH}")
    print(f"   样本 {n}（因子快照 {n_snapshot}），基线命中 {base_hit*100:.0f}% | 权重 " +
          " ".join(f"{fk}={smoothed[fk]*100:.0f}%" for fk in smoothed))
    print("   因子相关: " + " ".join(
        f"{fk}={info[fk]['rho']:+.2f}{'' if info[fk]['aligned'] else '✗'}" for fk in info))


if __name__ == "__main__":
    main()
