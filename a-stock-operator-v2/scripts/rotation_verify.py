# -*- coding: utf-8 -*-
"""轮动推荐验证：回填 rotation_rec_{T}.json 推荐板块的次日(T+1)/T+2/T+3 真实涨幅，
累计 rotation_history.csv（含推荐时落盘的因子快照），供 rotation_evolve.py 反推因子权重。

板块次日涨幅口径：boards_15d 里该板块的次日涨跌幅（东财行业/概念板块指数）。
命中 hit = 任一 T+1~T+3 涨幅 >= 1.5%（板块级阈值，比个股更严苛但贴合板块持续性）。

用法：
  python scripts/rotation_verify.py [--date YYYYMMDD]  # 无 --date：批量回填所有 T+3 已可判定的历史推荐
"""
import os
import sys
import csv
import glob
import argparse

from _common import BASE, DATA_DIR, load_json, safe_float, bridge_ths_name, boards_chg_lookup, window_start_ymd

VERIFY_PATH = os.path.join(DATA_DIR, "rotation_history.csv")

ap = argparse.ArgumentParser(description="轮动推荐 次日验证")
ap.add_argument("--date", default=None, help="目标交易日 YYYYMMDD（缺省=批量回填所有可判定历史推荐）")
_args = ap.parse_args()


def _iter_rec_dates():
    """返回窗口内所有 rotation_rec 日期（升序，8 位日期）。"""
    wstart = window_start_ymd()
    dates = []
    for f in glob.glob(os.path.join(DATA_DIR, "rotation_rec_*.json")):
        d = f.split("rotation_rec_")[-1].split(".")[0]
        if len(d) == 8 and d >= wstart:
            dates.append(d)
    return sorted(dates)


def _pending_dates(boards):
    """返回「T+3 已可判定」的 rec 日期：boards 里存在该日期之后第 3 个交易日数据。"""
    if not boards:
        return []
    # A 股交易日全局一致，取任意板块的日期序列作交易日历即可
    cal = sorted({dd for daily in boards.values() for dd, _ in daily})
    if len(cal) < 3:
        return []
    out = []
    for d in _iter_rec_dates():
        later = [dd for dd in cal if dd > d]
        if len(later) >= 3:
            out.append(d)
    return out


def resolve_dates(boards):
    if _args.date:
        return [_args.date]
    return _pending_dates(boards)


def _fwd_chg(boards, name, target):
    """返回 [T+1涨跌, T+2, T+3]，未知为 None。"""
    daily = boards_chg_lookup(boards, name)
    if not daily:
        return [None, None, None]
    date_chg = dict(daily)
    dates = sorted(date_chg.keys())
    out = []
    for n in (1, 2, 3):
        idx = None
        for i, d in enumerate(dates):
            if d > target:
                idx = i
                break
        if idx is None or idx + n - 1 >= len(dates):
            out.append(None)
        else:
            out.append(safe_float(date_chg[dates[idx + n - 1]], None))
    return out


def _rows_for_date(target, boards):
    """组装某推荐日的候选验证行（含因子快照，缺列留空）。"""
    rec = load_json(os.path.join(DATA_DIR, f"rotation_rec_{target}.json"), {})
    if not rec:
        return []
    rows = []
    for layer in ("mainline", "relay", "latent"):
        for d in rec.get(layer, []):
            fac = d.get("factors") or {}
            name = d.get("name", "")
            fwd = _fwd_chg(boards, name, target)
            hit = any(v is not None and v >= 1.5 for v in fwd)
            known = sum(1 for v in fwd if v is not None)
            rows.append({
                "date": target, "name": name, "layer": layer, "score": d.get("score", 0),
                "position": fac.get("position", ""), "fund": fac.get("fund", ""),
                "strength": fac.get("strength", ""), "heat": fac.get("heat", ""),
                "emotion": (d.get("emotion_env") if d.get("emotion_env") is not None else ""),
                "T1_chg": fwd[0] if fwd[0] is not None else "",
                "T2_chg": fwd[1] if fwd[1] is not None else "",
                "T3_chg": fwd[2] if fwd[2] is not None else "",
                "known": known, "hit": 1 if hit else 0,
            })
    return rows


def main():
    boards = load_json(os.path.join(DATA_DIR, "boards_15d.json"), {})
    targets = resolve_dates(boards)
    if not targets:
        # 全新会话首跑：仅当日刚生成的推荐、尚未到 T+3，属正常，不视为失败（exit 0）
        print("无 T+3 已可判定的历史推荐（或 boards_15d 缺数据），本次跳过回填")
        return

    fieldnames = ["date", "name", "layer", "score", "position", "fund", "strength",
                  "heat", "emotion", "T1_chg", "T2_chg", "T3_chg", "known", "hit"]

    existing = []
    if os.path.exists(VERIFY_PATH):
        with open(VERIFY_PATH, "r", encoding="utf-8-sig", newline="") as f:
            existing = list(csv.DictReader(f))
    for r in existing:
        for fk in ("position", "fund", "strength", "heat", "emotion"):
            r.setdefault(fk, "")
    keys = {(r.get("date"), r.get("name")) for r in existing}

    added = 0
    n_known = 0
    hit = 0
    processed = 0
    for target in targets:
        rows = _rows_for_date(target, boards)
        if not rows:
            continue
        processed += 1
        for r in rows:
            if (r["date"], r["name"]) in keys:
                # 已记录过的（可能因子快照缺失）做一次补齐：仅当旧行因子为空时回填
                for i, old in enumerate(existing):
                    if old.get("date") == r["date"] and old.get("name") == r["name"]:
                        for fk in ("position", "fund", "strength", "heat", "emotion"):
                            if old.get(fk) in (None, "") and r.get(fk) not in (None, ""):
                                old[fk] = r[fk]
                        break
                continue
            existing.append(r)
            keys.add((r["date"], r["name"]))
            added += 1
            if r["known"] >= 3:
                n_known += 1
                hit += r["hit"]

    with open(VERIFY_PATH, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(existing)

    print(f"✅ 轮动验证回填完成 → {VERIFY_PATH}（新增 {added}，累计 {len(existing)}，处理 {processed} 个推荐日）")
    if n_known:
        print(f"   本批 T+3 可判定 {n_known} 条，命中 {hit}，命中率 {hit / n_known * 100:.0f}%")
    else:
        print(f"   本批无新增 T+3 可判定样本（已全部回填或有待未来交易日）")


if __name__ == "__main__":
    main()