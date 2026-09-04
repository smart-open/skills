# -*- coding: utf-8 -*-
"""自学习：用 verify_history.csv 累计样本反推六因子权重，回写 params_best.json。

方法（可解释、抗过拟合）：
  ① 读 verify_history.csv，取 T+3 可判定（known>=3）的样本。
  ② 每只样本附六因子原始值 f_*（raw_factors 的截面分位前的原始值）。
  ③ 对单因子做标准化后，用「因子值 × 命中(0/1)」的秩相关（Spearman 简化版）估计方向与强度。
  ④ 方向正确（higher=True 且正相关 / higher=False 且负相关）的因子保留先验权重并按 |rho| 调权，
     方向错误或样本不足的因子维持先验、不放大。
  ⑤ 归一化到和为 1，与先验做 EMA 平滑（alpha 可配，默认 0.3），避免单日剧烈漂移。
  ⑥ 回写 params_best.json（含 S1/S2 两套权重 + 样本统计 + 生成时间）。

用法：python evolve.py [--min-samples 30] [--alpha 0.3]
"""
import os
import csv
import json
import argparse
import statistics
from datetime import datetime

from _common import (VERIFY_PATH, PARAMS_PATH, load_json, dump_json,
                     window_start_ymd, FACTOR_WEIGHTS as PRIOR, FACTORS)

ap = argparse.ArgumentParser(description="首板洗盘 因子权重自学习")
ap.add_argument("--min-samples", type=int, default=30, help="单策略最小样本数（不足则不改权）")
ap.add_argument("--alpha", type=float, default=0.3, help="EMA 平滑系数（0~1，越小越保守）")
_args = ap.parse_args()


def _rank(vals):
    """返回 vals 的秩（并列取平均秩），升序。"""
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
    """Spearman 秩相关（x、y 等长，无缺失）。"""
    if len(x) < 3:
        return 0.0
    rx, ry = _rank(x), _rank(y)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = sum((a - mx) ** 2 for a in rx)
    dy = sum((b - my) ** 2 for b in ry)
    den = (dx * dy) ** 0.5
    return num / den if den else 0.0


def load_samples():
    if not os.path.exists(VERIFY_PATH):
        return []
    with open(VERIFY_PATH, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    # 仅取最近 3 个月窗口内的样本（避免陈旧样本污染权重）
    wstart = window_start_ymd()
    out = []
    for r in rows:
        if (r.get("date") or "") < wstart:
            continue
        # 仅取 T+3 可判定的样本
        try:
            if int(r.get("known", 0)) < 3:
                continue
        except (TypeError, ValueError):
            continue
        try:
            hit = int(r.get("hit", 0))
        except (TypeError, ValueError):
            hit = 0
        rec = {"strategy": r.get("strategy", "S1"), "hit": hit}
        # 提取因子原始值
        ok = True
        for fk in FACTORS:
            v = r.get(f"f_{fk}", "")
            if v == "" or v is None:
                ok = False
                break
            try:
                rec[fk] = float(v)
            except (TypeError, ValueError):
                ok = False
                break
        if ok:
            out.append(rec)
    return out


def evolve(samples, min_samples, alpha):
    result = {"S1": None, "S2": None, "samples": {}, "generated": datetime.now().isoformat()}
    for stg in ("S1", "S2"):
        sub = [s for s in samples if s["strategy"] == stg]
        n = len(sub)
        result["samples"][stg] = n
        if n < min_samples:
            result[stg] = {"ok": False, "reason": f"样本不足（{n}<{min_samples}），维持先验权重",
                           "weights": dict(PRIOR[stg])}
            continue

        hits = [s["hit"] for s in sub]
        base_hit = statistics.mean(hits)
        new_w = {}
        info = {}
        for fk, meta in FACTORS.items():
            higher = meta["higher"]
            vals = [s[fk] for s in sub]
            rho = spearman(vals, hits)
            # 方向正确性：higher=True 期望正相关，higher=False 期望负相关
            aligned = (rho > 0) if higher else (rho < 0)
            strength = min(abs(rho), 0.5)
            if aligned:
                w = PRIOR[stg][fk] * (1.0 + 2.0 * strength)
            else:
                w = PRIOR[stg][fk] * (1.0 - 0.5 * strength)  # 方向错则削弱，但不清零
            w = max(w, 0.02)
            new_w[fk] = w
            info[fk] = {"rho": round(rho, 3), "aligned": aligned, "n": n}
        # 归一化
        tot = sum(new_w.values())
        new_w = {k: round(v / tot, 4) for k, v in new_w.items()}
        # EMA 平滑到先验
        smoothed = {k: round(alpha * new_w[k] + (1 - alpha) * PRIOR[stg][k], 4)
                    for k in new_w}
        # 再次归一化（平滑后和可能≠1）
        tot2 = sum(smoothed.values())
        smoothed = {k: round(v / tot2, 4) for k, v in smoothed.items()}
        result[stg] = {
            "ok": True, "n": n, "base_hit": round(base_hit, 3),
            "weights": smoothed, "raw_weights": new_w, "factor_info": info,
        }
    return result


def main():
    samples = load_samples()
    if not samples:
        print("!! 无 verify_history.csv 样本，请先运行 verify.py 累积数日")
        return
    res = evolve(samples, _args.min_samples, _args.alpha)
    # 读旧 params（若有），合并保留非权重字段
    old = load_json(PARAMS_PATH, {})
    old.update(res)
    dump_json(old, PARAMS_PATH)
    print(f"✅ 权重自学习完成 → {PARAMS_PATH}")
    for stg in ("S1", "S2"):
        r = res[stg]
        if not r or not r.get("ok"):
            print(f"   [{stg}] {r['reason'] if r else '无数据'}")
            continue
        w = r["weights"]
        print(f"   [{stg}] n={r['n']} 基线命中 {r['base_hit']*100:.0f}% | 权重 " +
              " ".join(f"{fk}={w[fk]*100:.0f}%" for fk in w))
        print(f"        因子相关: " + " ".join(
            f"{fk}={r['factor_info'][fk]['rho']:+.2f}{'' if r['factor_info'][fk]['aligned'] else '✗'}"
            for fk in r["factor_info"]))


if __name__ == "__main__":
    main()
