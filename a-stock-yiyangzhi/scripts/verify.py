# -*- coding: utf-8 -*-
"""一阳指 历史推荐验证：回填 scan 已出信号标的的真实 T+1/T+3/T+5 涨幅与涨停，累计 verify_history.csv。

命中口径（贴合短线可买入性）：
  - T+N 收盘涨幅 ret_c = (close[T+N] / close[T]) - 1
  - T+N 最高涨幅 ret_h = (high[T+N] / close[T]) - 1
  - T+N 涨停 zt = 当日相对前日涨幅 >= 涨停阈值（按板块）
  - 命中 hit = 任一 T+1~T+5 收盘 >= 5% 或 涨停

用法：python verify.py [--date YYYYMMDD] [--top 100]
  缺省回填最近一个 scan 文件；只验证已出信号(turn/open)的标的。
"""
import os
import sys
import csv
import glob
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C

VERIFY_PATH = os.path.join(C.DATA, "verify_history.csv")

ap = argparse.ArgumentParser(description="一阳指 次日验证回填")
ap.add_argument("--date", default=None, help="目标交易日 YYYYMMDD（缺省=最近 scan）")
ap.add_argument("--top", type=int, default=100, help="最多验证信号数")
_args = ap.parse_args()


def resolve_date():
    if _args.date:
        return _args.date
    files = sorted(glob.glob(os.path.join(C.OUT_DIR, "scan_*.json")))
    if not files:
        raise SystemExit("!! 未找到 scan_*.json，请先跑 scan")
    # 仅回看最近 3 个月窗口内的 scan 文件
    wstart = C.window_start_ymd()
    files = [f for f in files if f.split("scan_")[-1].split(".")[0] >= wstart]
    if not files:
        raise SystemExit(f"!! 最近 3 个月（≥{wstart}）无 scan 文件，请先跑 scan")
    return files[-1].split("scan_")[-1].split(".")[0]


def zt_threshold(code):
    return C.zt_threshold(code)  # 已含容差（主板9.4/创业19.4/北交29.4）


def _fwd(rows, idx, code):
    base_c = float(rows[idx][2])
    out = {}
    for n in (1, 3, 5):
        j = idx + n
        if j >= len(rows):
            out[n] = None
            continue
        k = rows[j]
        ret_c = (float(k[2]) / base_c - 1) * 100
        ret_h = (float(k[3]) / base_c - 1) * 100
        prev_c = float(rows[j - 1][2])
        chg = (float(k[2]) / prev_c - 1) * 100 if prev_c else 0.0
        out[n] = {"ret_c": round(ret_c, 2), "ret_h": round(ret_h, 2),
                  "zt": 1 if chg >= zt_threshold(code) else 0}
    return out


def _eval(code, rows, target):
    if not rows:
        return None
    idx = None
    for i in range(len(rows) - 1, -1, -1):
        if str(rows[i][0]) <= target:
            idx = i
            break
    if idx is None or idx >= len(rows) - 1:
        return None
    f = _fwd(rows, idx, code)
    hit = any(v and (v["ret_c"] >= 5.0 or v["zt"] == 1) for v in f.values() if v)
    known = sum(1 for v in f.values() if v)
    return {"f": f, "hit": 1 if hit else 0, "known": known}


def main():
    date = resolve_date()
    sc = C.load_json(os.path.join(C.OUT_DIR, f"scan_{date}.json"), {})
    items = sc.get("items") or []
    signals = []
    for ev in items:
        t = ev.get("turn") or {}
        o = ev.get("open") or {}
        if t.get("signal") or o.get("signal"):
            signals.append({
                "code": ev.get("code"), "name": ev.get("name"),
                "strategy": "+".join(["转势"] if t.get("signal") else [] +
                                     ["开门"] if o.get("signal") else []),
                "score": max(t.get("score", 0), o.get("score", 0)),
                "chg": ev.get("chg_today"),
                "theme": ev.get("theme", ""),
            })
    if not signals:
        print("!! 该日无出信号标的，无需验证")
        return
    signals = signals[:_args.top]

    def _pull(s):
        rows = C.get_daily_kline(s["code"])
        return s, rows

    rows_map = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        for fu in as_completed([ex.submit(_pull, s) for s in signals]):
            s, rows = fu.result()
            if rows:
                rows_map[s["code"]] = rows

    rows_out = []
    for s in signals:
        kl = rows_map.get(s["code"])
        ev = _eval(s["code"], kl, date) if kl else None
        if ev is None:
            continue
        r = {"date": date, "code": s["code"], "name": s["name"],
             "strategy": s["strategy"], "score": s["score"], "chg": s["chg"],
             "theme": s["theme"], "known": ev["known"], "hit": ev["hit"]}
        for n in (1, 3, 5):
            f = ev["f"].get(n)
            r[f"T{n}_ret_c"] = f["ret_c"] if f else ""
            r[f"T{n}_ret_h"] = f["ret_h"] if f else ""
            r[f"T{n}_zt"] = f["zt"] if f else ""
        rows_out.append(r)

    if not rows_out:
        print("!! 无可验证样本（K线未覆盖 T 日之后）")
        return

    fieldnames = ["date", "code", "name", "strategy", "score", "chg", "theme",
                  "T1_ret_c", "T1_ret_h", "T1_zt",
                  "T3_ret_c", "T3_ret_h", "T3_zt",
                  "T5_ret_c", "T5_ret_h", "T5_zt",
                  "known", "hit"]
    existing = []
    if os.path.exists(VERIFY_PATH):
        with open(VERIFY_PATH, "r", encoding="utf-8-sig", newline="") as f:
            existing = list(csv.DictReader(f))
    keys = {(r.get("date"), r.get("code")) for r in existing}
    added = 0
    for r in rows_out:
        if (r["date"], r["code"]) in keys:
            continue
        existing.append(r)
        added += 1
    with open(VERIFY_PATH, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(existing)

    n = len(rows_out)
    n_known5 = sum(1 for r in rows_out if r["known"] >= 3)
    hit = sum(r["hit"] for r in rows_out)
    print(f"✅ 验证回填完成 → {VERIFY_PATH}（新增 {added}，累计 {len(existing)}）")
    print(f"   {date} 验证样本 {n}（T+5 可判定 {n_known5}）命中 {hit}，命中率 {hit/max(n,1)*100:.0f}%")
    for r in sorted(rows_out, key=lambda x: -x["score"])[:10]:
        t1 = r["T1_ret_c"]
        t1s = f"{t1:+.1f}%" if t1 != "" else "—"
        mark = "✓" if r["hit"] else ("·" if r["known"] >= 3 else "待")
        print(f"     {r['code']} {r['name'][:6]:<6} {r['strategy']:<4} 分{r['score']:>3} T1 {t1s} {mark}")


if __name__ == "__main__":
    main()
