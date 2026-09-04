# -*- coding: utf-8 -*-
"""模型可靠性校验 + 阈值优化
思路：对真实历史日K逐日回放——凡「转势/开门」规则某日触发，统计其后 T+5 涨幅≥5%的命中率，
据命中率校准 VOL_RATIO_MIN 等阈值(样本不足时保默认)，输出 Markdown 可靠性报告。
用法：
  py scripts/optimize.py [--codes a,b,c] [--top 60] [--min-samples 30] [--horizon 5]
"""
from __future__ import annotations
import os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C
import indicators as IND


def _iter_historical(rows, code="000001", horizon=5):
    """逐日回放; 返回列表 of (kind,date,score,chg,fwd1,fwd3,fwd5)。仅回放最近 3 个月窗口内的日期。"""
    import numpy as np
    df = {
        "date": [r[0] for r in rows],
        "open": np.array([r[1] for r in rows], dtype=float),
        "close": np.array([r[2] for r in rows], dtype=float),
        "high": np.array([r[3] for r in rows], dtype=float),
        "low": np.array([r[4] for r in rows], dtype=float),
        "vol": np.array([r[5] for r in rows], dtype=float),
    }
    ind = IND.compute(df)
    n = len(df["close"])
    # 最近 3 个月窗口起始日（YYYYMMDD 字符串），仅回放窗口内的触发日。
    # 注意：腾讯 K 线日期为 YYYY-MM-DD（带横杠），需去横杠再与无横杠的 wstart 比较。
    wstart = C.window_start_ymd()
    dates = [str(d).replace("-", "") for d in df["date"]]
    out = []
    for i in range(22, n - horizon):
        if dates[i] < wstart:
            continue
        chg = (df["close"][i] / df["close"][i - 1] - 1) * 100
        fwd1 = (df["close"][i + 1] / df["close"][i] - 1) * 100 if i + 1 < n else None
        fwd3 = (df["close"][i + 3] / df["close"][i] - 1) * 100 if i + 3 < n else None
        fwd5 = (df["close"][i + horizon] / df["close"][i] - 1) * 100 if i + horizon < n else None
        t = IND.judge_turn(ind, i, code=code)
        o = IND.judge_open(ind, i, code=code)
        if not t.get("insufficient") and t["signal"]:
            out.append(("turn", df["date"][i], t["score"], chg, fwd1, fwd3, fwd5))
        if not o.get("insufficient") and o["signal"]:
            out.append(("open", df["date"][i], o["score"], chg, fwd1, fwd3, fwd5))
    return out


def _metric(samples):
    """三档命中口径：T+1/T+3/T+5 各算命中率(≥5%)，主口径用 T+3。"""
    if not samples:
        return None
    def _rate(seq):
        seq = [x for x in seq if x is not None]
        if not seq:
            return 0.0, 0
        return sum(1 for x in seq if x >= 5.0) / len(seq), len(seq)
    f1 = [s[4] for s in samples]
    f3 = [s[5] for s in samples]
    f5 = [s[6] for s in samples]
    h1, n1 = _rate(f1)
    h3, n3 = _rate(f3)
    h5, n5 = _rate(f5)
    fwd = [s[5] for s in samples if s[5] is not None]  # T+3 作主口径
    return {"n": len(samples), "n3": n3,
            "hit1": round(h1, 4), "hit3": round(h3, 4), "hit5": round(h5, 4),
            "hit_rate": h3,  # 兼容旧字段（=T+3命中率）
            "avg": sum(fwd) / len(fwd) if fwd else 0.0,
            "median": sorted(fwd)[len(fwd) // 2] if fwd else 0.0}


def collect_universe(top_n=0, codes=None):
    codes = [c for c in (codes or []) if c]
    # 已有缓存
    cache_codes = {f[:-5] for f in os.listdir(C.KLINE_DIR) if f.endswith(".json")}
    got = set(codes) | cache_codes
    if top_n > 0:
        try:
            uni = C.fetch_universe(min_pct=0.0, max_pct=30.0)[:top_n]
            got |= {u["code"] for u in uni}
        except Exception:
            pass
    return sorted(got)


def _pull_code(code):
    rows = C.get_daily_kline(code)
    return code, rows


def _scan_threshold(kind, cands, rows_map):
    """按指定战法(kind='turn'/'open')逐阈值回放，返回 {v: metric_or_None}，并恢复默认常量"""
    attr = "TURN_VOL_MIN" if kind == "turn" else "OPEN_VOL_MIN"
    dflt = getattr(C, attr)
    records = {}
    for v in cands:
        setattr(C, attr, v)
        samples = []
        for code, rows in rows_map.items():
            for rec in _iter_historical(rows, code):
                if rec[0] == kind:
                    samples.append(rec)
        records[v] = _metric(samples)
    setattr(C, attr, dflt)  # 恢复
    return dflt, records


def _scan_vol_max(cands, rows_map):
    """转势·量比上限闸门(TURN_VOL_MAX)逐档回放：值越小越严格(剔除更多脉冲)，返回 {v: metric}"""
    dflt = C.TURN_VOL_MAX
    records = {}
    for v in cands:
        C.TURN_VOL_MAX = v
        samples = []
        for code, rows in rows_map.items():
            for rec in _iter_historical(rows, code):
                if rec[0] == "turn":
                    samples.append(rec)
        records[v] = _metric(samples)
    C.TURN_VOL_MAX = dflt  # 恢复
    return dflt, records


def _pick_vol_max(dflt, records, min_samples):
    """选量比上限：优先最大化平均 T+3 涨幅(解决负收益)，命中率次之；样本不足维持默认。
    返回 (chosen, dict)。"""
    base = records.get(dflt)
    base_avg = (base or {}).get("avg", 0.0)
    base_hit = (base or {}).get("hit_rate", 0.0)
    best_v, best_avg, best_hit = dflt, base_avg, base_hit
    for v, m in records.items():
        if not m or m["n"] < min_samples:
            continue
        if v == dflt:
            continue
        # 平均收益提升优先(核心诉求=负收益转正)
        if m["avg"] > best_avg + 1e-9:
            best_v, best_avg, best_hit = v, m["avg"], m["hit_rate"]
        elif abs(m["avg"] - best_avg) < 1e-9 and m["hit_rate"] > best_hit:
            best_v, best_hit = v, m["hit_rate"]
    # 平均收益提升不足 0.5pp 且命中率未提升则维持默认
    if best_v != dflt and best_avg <= base_avg + 0.5 and best_hit <= base_hit:
        best_v = dflt
    return best_v, records


def _pick_best(dflt, records, min_samples):
    """在 records 中选综合最优阈值：T+3命中率优先，同时要求平均T+3涨幅不显著为负
    （避免选到「命中率略高但平均收益为负」的档位）；提升不足则维持默认。"""
    base = records.get(dflt)
    base_hit = (base or {}).get("hit_rate", 0)
    base_avg = (base or {}).get("avg", 0.0)
    best_v, best_hit, best_avg = dflt, base_hit, base_avg
    for v, m in records.items():
        if not m or m["n"] < min_samples:
            continue
        if v == dflt:
            continue
        # 命中率提升幅度需超过默认值；若命中率相当则看平均收益
        if m["hit_rate"] > best_hit + 1e-9:
            # 仅在平均收益不显著劣于默认(≥默认-1pp)时才接受更高命中率的档位
            if m["avg"] >= base_avg - 1.0:
                best_v, best_hit, best_avg = v, m["hit_rate"], m["avg"]
        elif abs(m["hit_rate"] - best_hit) < 1e-9 and m["avg"] > best_avg:
            best_v, best_avg = v, m["avg"]
    # 提升不足 2pp 且平均收益未改善时维持默认
    if best_v != dflt and best_hit <= base_hit + 0.02 and best_avg <= base_avg:
        best_v = dflt
    return best_v


def _write_params(chosen):
    """将优化结果回写 params_best.json（供 _common._apply_params 下次加载覆盖常量）。"""
    path = C.PARAMS_PATH
    p = C.load_json(path, {})
    p.update(chosen)
    p["updated"] = C.latest_trade_date(sep="-")
    C.dump_json(path, p)
    return path


def optimize(min_samples=30, horizon=5, top_n=0, codes=None, min_top_n=60, cache_only=False):
    # cache_only: 自学习闭环仅用本地缓存，不联网扩样本
    real_top = 0 if cache_only else (top_n or min_top_n)
    univ = collect_universe(top_n=real_top, codes=codes)
    if not univ:
        return {"ok": False, "reason": "无可回放的历史K线：请先运行 scan 缓存数据，或 --codes 指定样本，或联网 --top N 抓取"}
    print(f"[optimize] 样本池 {len(univ)} 只，并发拉取日K并逐日回放 ...")
    rows_map = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        for fu in as_completed([ex.submit(_pull_code, c) for c in univ]):
            c, rows = fu.result()
            if rows:
                rows_map[c] = rows
    if not rows_map:
        return {"ok": False, "reason": "样本池无可回放的有效日K（缓存/网络均空）"}

    # 分战法阈值搜索：转势校准 TURN_VOL_MIN + TURN_VOL_MAX，开门校准 OPEN_VOL_MIN
    turn_cands = sorted(set([C.TURN_VOL_MIN, 0.8, 0.9, 1.0, 1.2, 1.5]))
    volmax_cands = sorted(set([C.TURN_VOL_MAX, 2.5, 3.0, 4.0, 5.0, 6.0, 100.0]))
    open_cands = sorted(set([C.OPEN_VOL_MIN, 0.9, 1.1, 1.2, 1.5, 2.0]))
    dflt_turn, turn_records = _scan_threshold("turn", turn_cands, rows_map)
    dflt_open, open_records = _scan_threshold("open", open_cands, rows_map)
    dflt_vmax, volmax_records = _scan_vol_max(volmax_cands, rows_map)

    chosen_turn = _pick_best(dflt_turn, turn_records, min_samples)
    chosen_open = _pick_best(dflt_open, open_records, min_samples)
    chosen_vmax, _ = _pick_vol_max(dflt_vmax, volmax_records, min_samples)

    # 自动回写 params_best.json（供下次 scan/judge 覆盖常量）
    write_path = _write_params({"TURN_VOL_MIN": chosen_turn,
                                "TURN_VOL_MAX": chosen_vmax,
                                "OPEN_VOL_MIN": chosen_open})

    return {"ok": True, "n_codes": len(rows_map), "params_path": write_path,
            "turn": {"default": dflt_turn, "chosen": chosen_turn,
                     "changed": chosen_turn != dflt_turn, "records": turn_records},
            "vmax": {"default": dflt_vmax, "chosen": chosen_vmax,
                     "changed": chosen_vmax != dflt_vmax, "records": volmax_records},
            "open": {"default": dflt_open, "chosen": chosen_open,
                     "changed": chosen_open != dflt_open, "records": open_records}}


def main(argv):
    codes = []
    top_n = 0
    min_samples = 30
    cache_only = "--cache-only" in argv
    if "--codes" in argv:
        codes = [c.strip() for c in argv[argv.index("--codes") + 1].split(",")]
    if "--top" in argv:
        top_n = int(argv[argv.index("--top") + 1])
    if "--min-samples" in argv:
        min_samples = int(argv[argv.index("--min-samples") + 1])

    res = optimize(min_samples=min_samples, top_n=top_n, codes=codes, cache_only=cache_only)
    date = C.latest_trade_date(sep="-")  # YYYY-MM-DD，用于报告文件名与标题
    md_path = os.path.join(C.REPORT_ROOT, f"一阳指模型可靠性_优化-{date}.md")
    if not res.get("ok"):
        md = (f"# 模型可靠性 & 阈值优化报告 {date}\n\n> ⚠ {res['reason']}\n\n"
              "运行 `py scripts/run.py scan` 缓存历史K线后重跑；或 `--top 60` 联网抓取样本。")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(md)
        print(res["reason"])
        print(f"已生成占位报告 {md_path}")
        return 0

    L = [f"# 模型可靠性 & 阈值优化报告 {date}", ""]
    L.append(f"样本股票数：`{res['n_codes']}`")
    L.append(f"- **转势** 资金线阈值 `{res['turn']['default']}` → 优化后 `{res['turn']['chosen']}`"
             f"（{'已调整' if res['turn']['changed'] else '维持默认：提升不足或样本不足'}）")
    L.append(f"- **转势** 量比上限 `{res['vmax']['default']}` → 优化后 `{res['vmax']['chosen']}`"
             f"（{'已调整' if res['vmax']['changed'] else '维持默认'}，越大越宽松）")
    L.append(f"- **开门** 量比阈值 `{res['open']['default']}` → 优化后 `{res['open']['chosen']}`"
             f"（{'已调整' if res['open']['changed'] else '维持默认：提升不足或样本不足'}）")
    L.append(f"- 已回写参数文件 `{res.get('params_path','')}`（下次 scan/judge 自动加载覆盖常量）")
    L.append("")

    for key, label, thr in (("turn", "转势", "TURN_VOL_MIN"), ("vmax", "转势·量比上限", "TURN_VOL_MAX"),
                            ("open", "开门", "OPEN_VOL_MIN")):
        rec = res[key]["records"]
        chosen = res[key]["chosen"]
        L.append(f"## {label} · 阈值档位表现（三档命中口径，主看 T+3 命中率与平均 T+3 涨幅，校准 `{thr}`）\n")
        L.append(f"| {thr} | 信号样本数 | T+1命中 | T+3命中 | T+5命中 | 平均T+3% |")
        L.append("|:---:|:---:|:---:|:---:|:---:|:---:|")
        for v in sorted(rec.keys()):
            m = rec[v] or {"n": 0, "hit1": 0, "hit3": 0, "hit5": 0, "avg": 0}
            mark = " ◀" if v == chosen else ""
            L.append(f"| {v}{mark} | {m['n']} | {m['hit1']*100:.1f}% | {m['hit3']*100:.1f}% | "
                     f"{m['hit5']*100:.1f}% | {m['avg']:+.1f}% |")
        L.append("")
    L.append("## 结论与说明")
    L.append("- 命中口径：触发后 T+N 收盘涨幅≥5% 记为命中；短线以 **T+1/T+3** 为主参考，T+5 仅作趋势延续参考。")
    L.append("- **平均 T+3 涨幅** 是衡量转势信号「是否真的赚钱」的核心指标——命中率再高、若平均收益为负，信号依然亏钱。本报告同时校准命中率与平均收益。")
    L.append("- 量比上限(TURN_VOL_MAX)用于剔除「情绪脉冲/出货」型转势信号(当日爆量后次日易回落，是负收益主因之一)。")
    L.append("- 命中率受样本量与题材环境波动影响；随每日 `scan` 累积更多历史K线，'模型可靠性'会逐步趋于稳定(可重跑 optimize)。")
    L.append("- 阈值择优后已**自动回写** `params_best.json`，下次运行 `scan`/`judge` 自动加载生效（缺省回落 `_common.py` 默认值）。")
    L.append("- 本校验基于价格逐日回放，不含基本面/题材/情绪，仅从纯量价视角评估『一阳指』信号的可信度。")
    L.append("- 供复盘参考，不构成投资建议。")
    L.append("")
    md = "\n".join(L)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(md)
    print(f"\n[optimize] 报告已生成 → {md_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))