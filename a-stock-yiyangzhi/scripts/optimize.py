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


def _iter_historical(rows, code="000001"):
    """逐日回放 measures; 返回列表 of (kind,i,score,chg,fwd)"""
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
    out = []
    for i in range(22, n - 5):
        chg = (df["close"][i] / df["close"][i - 1] - 1) * 100
        fwd = (df["close"][i + 5] / df["close"][i] - 1) * 100
        t = IND.judge_turn(ind, i)
        o = IND.judge_open(ind, i, code=code)
        if not t.get("insufficient") and t["signal"]:
            out.append(("turn", df["date"][i], t["score"], chg, fwd))
        if not o.get("insufficient") and o["signal"]:
            out.append(("open", df["date"][i], o["score"], chg, fwd))
    return out


def _metric(samples):
    if not samples:
        return None
    fwd = [s[3] for s in samples]
    hit = sum(1 for x in fwd if x >= 5.0)
    return {"n": len(fwd), "hit_rate": hit / len(fwd), "avg": sum(fwd) / len(fwd),
            "median": sorted(fwd)[len(fwd) // 2]}


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
            for k, d, score, chg, fwd in _iter_historical(rows, code):
                if k == kind:
                    samples.append((d, score, chg, fwd))
        records[v] = _metric(samples)
    setattr(C, attr, dflt)  # 恢复
    return dflt, records


def _pick_best(dflt, records, min_samples):
    """在 records 中选命中率最高且样本≥min_samples 的阈值；提升不足 2pp 则维持默认"""
    base_hit = (records[dflt] or {}).get("hit_rate", 0) if records.get(dflt) else 0
    best_v, best_hit = dflt, base_hit
    for v, m in records.items():
        if not m or m["n"] < min_samples:
            continue
        if v != dflt and m["hit_rate"] > best_hit:
            best_v, best_hit = v, m["hit_rate"]
    if best_v != dflt and best_hit <= base_hit + 0.02:
        best_v = dflt
    return best_v


def optimize(min_samples=30, horizon=5, top_n=0, codes=None, min_top_n=60):
    univ = collect_universe(top_n=top_n or min_top_n, codes=codes)
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

    # 分战法阈值搜索：转势校准 TURN_VOL_MIN，开门校准 OPEN_VOL_MIN（判定引擎实际读取量）
    turn_cands = sorted(set([C.TURN_VOL_MIN, 0.8, 0.9, 1.0, 1.2, 1.5]))
    open_cands = sorted(set([C.OPEN_VOL_MIN, 0.9, 1.1, 1.2, 1.5, 2.0]))
    dflt_turn, turn_records = _scan_threshold("turn", turn_cands, rows_map)
    dflt_open, open_records = _scan_threshold("open", open_cands, rows_map)

    chosen_turn = _pick_best(dflt_turn, turn_records, min_samples)
    chosen_open = _pick_best(dflt_open, open_records, min_samples)

    return {"ok": True, "n_codes": len(rows_map),
            "turn": {"default": dflt_turn, "chosen": chosen_turn,
                     "changed": chosen_turn != dflt_turn, "records": turn_records},
            "open": {"default": dflt_open, "chosen": chosen_open,
                     "changed": chosen_open != dflt_open, "records": open_records}}


def main(argv):
    codes = []
    top_n = 0
    min_samples = 30
    if "--codes" in argv:
        codes = [c.strip() for c in argv[argv.index("--codes") + 1].split(",")]
    if "--top" in argv:
        top_n = int(argv[argv.index("--top") + 1])
    if "--min-samples" in argv:
        min_samples = int(argv[argv.index("--min-samples") + 1])

    res = optimize(min_samples=min_samples, top_n=top_n, codes=codes)
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
    L.append(f"- **开门** 量比阈值 `{res['open']['default']}` → 优化后 `{res['open']['chosen']}`"
             f"（{'已调整' if res['open']['changed'] else '维持默认：提升不足或样本不足'}）")
    L.append("")

    for key, label, thr in (("turn", "转势", "TURN_VOL_MIN"), ("open", "开门", "OPEN_VOL_MIN")):
        rec = res[key]["records"]
        chosen = res[key]["chosen"]
        L.append(f"## {label} · 阈值档位表现（命中=触发后T+5涨幅≥5%，校准 `{thr}`）\n")
        L.append(f"| {thr} | 信号样本数 | 命中率 | 平均T+5% | 中位T+5% |")
        L.append("|:---:|:---:|:---:|:---:|:---:|")
        for v in sorted(rec.keys()):
            m = rec[v] or {"n": 0, "hit_rate": 0, "avg": 0, "median": 0}
            mark = " ◀" if v == chosen else ""
            L.append(f"| {v}{mark} | {m['n']} | {m['hit_rate']*100:.1f}% | {m['avg']:+.1f}% | {m['median']:+.1f}% |")
        L.append("")
    L.append("## 结论与说明")
    L.append("- 命中率受样本量与题材环境波动影响；随每日 `scan` 累积更多历史K线，'模型可靠性'会逐步趋于稳定(可重跑 optimize)。")
    L.append("- 阈值仅用于观察，如命中率最优档位明显偏离默认值，可回写 `_common.py` 中 `TURN_VOL_MIN`/`OPEN_VOL_MIN`。")
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