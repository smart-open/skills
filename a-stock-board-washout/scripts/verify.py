# -*- coding: utf-8 -*-
"""验证历史推荐：用实际 K 线回填 screen 候选的 T+1/T+2/T+3 表现，累计到 verify_history.csv。

命中口径（贴合短线可买入性，规避一字/高开不可买陷阱）：
  - T+N 收盘涨幅 ret_c   = (close[T+N] / close[T]) - 1
  - T+N 最高涨幅 ret_h   = (high[T+N] / close[T]) - 1   （次日冲高可离场，用于"最高触及"口径）
  - T+N 是否涨停 zt      = close[T+N] 相对 close[T+N-1] 涨幅 >= 涨停阈值（主板 9.8%）
综合命中 hit = 任一 T+1~T+3 收盘涨幅 >= 5% 或 涨停。

用法：python verify.py [--date YYYYMMDD] [--no-fetch]
  缺省回填最近一个 screen 文件；--no-fetch 仅重算已缓存 K 线（离线）。
"""
import os
import sys
import csv
import glob
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed

from _common import (BASE, VERIFY_PATH, load_json, dump_json, safe_float,
                     fmt_dash, fetch_kline)

ap = argparse.ArgumentParser(description="首板洗盘 次日验证回填")
ap.add_argument("--date", default=None, help="目标交易日 YYYYMMDD（缺省=最近 screen）")
ap.add_argument("--no-fetch", action="store_true", help="不联网拉新K线，仅用缓存")
_args = ap.parse_args()

KLINE_CACHE = os.path.join(BASE, "data", "_verify_klines.json")


def resolve_target():
    if _args.date:
        return _args.date
    files = sorted(glob.glob(os.path.join(BASE, "data", "screen_*.json")))
    if not files:
        raise SystemExit("!! 未找到 data/screen_*.json，请先跑 screen_washout.py")
    return files[-1].split("screen_")[-1].split(".")[0]


def zt_threshold(code):
    # 主板 10%（创业板 300/301、科创板 688 用 20%，本技能仅主板，但保守兼容）
    return 9.8 if not code.startswith(("300", "301", "688")) else 19.5


def _fwd_metrics(klines, idx):
    """klines 升序，idx 为 T 日（触发日）位置。返回 [t1,t2,t3] 各自 dict 或 None。"""
    base_c = klines[idx]["c"]
    out = []
    for n in (1, 2, 3):
        j = idx + n
        if j >= len(klines):
            out.append(None)
            continue
        k = klines[j]
        prev_c = klines[j - 1]["c"]
        ret_c = (k["c"] / base_c - 1) * 100 if base_c else 0.0
        ret_h = (k["h"] / base_c - 1) * 100 if base_c else 0.0
        chg_day = (k["c"] / prev_c - 1) * 100 if prev_c else 0.0
        zt = 1 if chg_day >= zt_threshold(str(_code_holder.get("c", ""))) else 0
        out.append({"ret_c": round(ret_c, 2), "ret_h": round(ret_h, 2), "zt": zt})
    return out


_code_holder = {}  # 供 _fwd_metrics 取 code（简单闭包替代）


def _eval_one(code, klines, target):
    """定位 target 在 K 线中的位置，返回 T+1~T+3 表现。target 可能不在（假期/停牌），找 <= target 的最近一根。"""
    if not klines:
        return None
    _code_holder["c"] = code
    idx = None
    for i in range(len(klines) - 1, -1, -1):
        if klines[i]["d"] <= target:
            idx = i
            break
    if idx is None or idx >= len(klines) - 1:
        return None  # 无后续数据
    fwd = _fwd_metrics(klines, idx)
    hit = any(f and (f["ret_c"] >= 5.0 or f["zt"] == 1) for f in fwd if f)
    return {
        "t1": fwd[0] if len(fwd) > 0 else None,
        "t2": fwd[1] if len(fwd) > 1 else None,
        "t3": fwd[2] if len(fwd) > 2 else None,
        "hit": 1 if hit else 0,
        "known": sum(1 for f in fwd if f),
    }


def main():
    target = resolve_target()
    screen = load_json(os.path.join(BASE, f"data/screen_{target}.json"))
    if not screen or screen.get("T") != target:
        raise SystemExit(f"!! screen_{target}.json 缺失或 T 不符")

    # 收集候选（精选 + 备选，去重）
    cands = {}
    for key in ("strategy1", "strategy2", "all_s1", "all_s2", "near_qualify"):
        for x in screen.get(key, []):
            code = x.get("code")
            if not code or code in cands:
                continue
            cands[code] = {
                "code": code, "name": x.get("name", ""),
                "strategy": "S1" if key in ("strategy1", "all_s1") else
                            ("S2" if key in ("strategy2", "all_s2") else "near"),
                "score": x.get("score", x.get("score2", 0)),
                "gate_ok": x.get("gate_ok", True),
                "raw_f": x.get("raw_f", {}),
            }
    if not cands:
        raise SystemExit("!! screen 中无可验证候选")

    # K 线：优先缓存，缺则联网拉
    kcache = load_json(KLINE_CACHE, {})
    codes = list(cands.keys())

    def _pull(code):
        if code in kcache and kcache[code]:
            return code, kcache[code]
        if _args.no_fetch:
            return code, []
        return code, fetch_kline(code)

    rows_map = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        for fu in as_completed([ex.submit(_pull, c) for c in codes]):
            c, rows = fu.result()
            if rows:
                rows_map[c] = rows
    if not _args.no_fetch:
        kcache.update({c: rows_map[c] for c in rows_map})
        dump_json(kcache, KLINE_CACHE)

    # 逐只评估
    verify_rows = []
    for code in codes:
        info = cands[code]
        kl = rows_map.get(code)
        ev = _eval_one(code, kl, target) if kl else None
        if ev is None:
            continue
        r = {
            "date": target, "code": code, "name": info["name"],
            "strategy": info["strategy"], "score": info["score"],
            "gate_ok": int(info["gate_ok"]),
        }
        for n in (1, 2, 3):
            f = ev[f"t{n}"]
            r[f"T{n}_ret_c"] = f["ret_c"] if f else ""
            r[f"T{n}_ret_h"] = f["ret_h"] if f else ""
            r[f"T{n}_zt"] = f["zt"] if f else ""
        r["known"] = ev["known"]
        r["hit"] = ev["hit"]
        # 附因子原始值，供 evolve 反推权重
        for fk, fv in (info.get("raw_f") or {}).items():
            r[f"f_{fk}"] = fv
        verify_rows.append(r)

    if not verify_rows:
        print("!! 无可验证样本（K线未覆盖 T 日之后）")
        return

    # 追加历史 CSV（按 date+code 去重）
    hist_path = VERIFY_PATH
    fieldnames = ["date", "code", "name", "strategy", "score", "gate_ok",
                  "T1_ret_c", "T1_ret_h", "T1_zt",
                  "T2_ret_c", "T2_ret_h", "T2_zt",
                  "T3_ret_c", "T3_ret_h", "T3_zt",
                  "known", "hit",
                  "f_washout", "f_trend", "f_fund", "f_vol", "f_pos", "f_liq"]
    existing = []
    if os.path.exists(hist_path):
        with open(hist_path, "r", encoding="utf-8-sig", newline="") as f:
            existing = list(csv.DictReader(f))
    keys = {(r.get("date"), r.get("code")) for r in existing}
    added = 0
    for r in verify_rows:
        if (r["date"], r["code"]) in keys:
            continue
        existing.append(r)
        added += 1
    with open(hist_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(existing)
    print(f"✅ 验证回填完成 → {hist_path}（新增 {added}，累计 {len(existing)}）")

    # 汇总命中率
    cur = [r for r in verify_rows]
    n = len(cur)
    n_known = sum(1 for r in cur if r["known"] >= 3)
    hit = sum(r["hit"] for r in cur)
    print(f"   {target} 验证样本 {n}（T+3 可判定 {n_known}）命中 {hit}，命中率 {hit/max(n,1)*100:.0f}%")
    for r in sorted(cur, key=lambda x: -x["score"])[:8]:
        t1 = r["T1_ret_c"]
        t1s = f"{t1:+.1f}%" if t1 != "" else "—"
        mark = "✓" if r["hit"] else ("·" if r["known"] >= 3 else "待")
        print(f"     {r['code']} {r['name'][:6]:<6} S={r['score']:>3} T1 {t1s} {mark}")


if __name__ == "__main__":
    main()
