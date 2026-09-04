# -*- coding: utf-8 -*-
"""轮动推荐验证：回填 rotation_rec_{T}.json 推荐板块的次日(T+1)/T+2/T+3 真实涨幅，
累计 rotation_history.csv，供 rotation_evolve.py 反推因子权重。

板块次日涨幅口径：boards_15d 里该板块的次日涨跌幅（东财行业/概念板块指数）。
命中 hit = 任一 T+1~T+3 涨幅 >= 1.5%（板块级阈值，比个股更严苛但贴合板块持续性）。

用法：python scripts/rotation_verify.py [--date YYYYMMDD]
"""
import os
import sys
import csv
import glob
import argparse

from _common import BASE, DATA_DIR, load_json, safe_float, bridge_ths_name, boards_chg_lookup, window_start_ymd

VERIFY_PATH = os.path.join(DATA_DIR, "rotation_history.csv")

ap = argparse.ArgumentParser(description="轮动推荐 次日验证")
ap.add_argument("--date", default=None, help="目标交易日 YYYYMMDD（缺省=最近 rotation_rec）")
_args = ap.parse_args()


def resolve_date():
    if _args.date:
        return _args.date
    files = sorted(glob.glob(os.path.join(DATA_DIR, "rotation_rec_*.json")))
    if not files:
        raise SystemExit("!! 未找到 rotation_rec_*.json，请先跑 recommend_rotation.py")
    # 仅回看最近 3 个月窗口内的推荐文件
    wstart = window_start_ymd()
    files = [f for f in files if f.split("rotation_rec_")[-1].split(".")[0] >= wstart]
    if not files:
        raise SystemExit(f"!! 最近 3 个月（≥{wstart}）无 rotation_rec 文件，请先跑 recommend_rotation.py")
    return files[-1].split("rotation_rec_")[-1].split(".")[0]


def _fwd_chg(boards, name, target):
    """返回 [T+1涨跌, T+2, T+3]，未知为 None。"""
    daily = boards_chg_lookup(boards, name)
    if not daily:
        return [None, None, None]
    date_chg = dict(daily)
    dates = sorted(date_chg.keys())
    out = []
    for n in (1, 2, 3):
        # 找 target 之后第 n 个交易日
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


def main():
    target = resolve_date()
    rec = load_json(os.path.join(DATA_DIR, f"rotation_rec_{target}.json"), {})
    boards = load_json(os.path.join(DATA_DIR, "boards_15d.json"), {})
    if not rec:
        raise SystemExit(f"!! rotation_rec_{target}.json 为空")

    # 候选 = 三层推荐（含 name、score、层级）
    cands = []
    for layer in ("mainline", "relay", "latent"):
        for d in rec.get(layer, []):
            cands.append({"name": d.get("name", ""), "score": d.get("score", 0), "layer": layer})
    if not cands:
        print("!! 推荐为空，无法验证")
        return

    rows = []
    for c in cands:
        name = c["name"]
        fwd = _fwd_chg(boards, name, target)
        hit = any(v is not None and v >= 1.5 for v in fwd)
        known = sum(1 for v in fwd if v is not None)
        rows.append({
            "date": target, "name": name, "layer": c["layer"], "score": c["score"],
            "T1_chg": fwd[0] if fwd[0] is not None else "",
            "T2_chg": fwd[1] if fwd[1] is not None else "",
            "T3_chg": fwd[2] if fwd[2] is not None else "",
            "known": known, "hit": 1 if hit else 0,
        })

    # 累计写入 CSV
    fieldnames = ["date", "name", "layer", "score", "T1_chg", "T2_chg", "T3_chg", "known", "hit"]
    existing = []
    if os.path.exists(VERIFY_PATH):
        with open(VERIFY_PATH, "r", encoding="utf-8-sig", newline="") as f:
            existing = list(csv.DictReader(f))
    keys = {(r.get("date"), r.get("name")) for r in existing}
    added = 0
    for r in rows:
        if (r["date"], r["name"]) in keys:
            continue
        existing.append(r)
        added += 1
    with open(VERIFY_PATH, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(existing)

    n = len(rows)
    n_known = sum(1 for r in rows if r["known"] >= 3)
    hit = sum(r["hit"] for r in rows)
    print(f"✅ 轮动验证回填完成 → {VERIFY_PATH}（新增 {added}，累计 {len(existing)}）")
    print(f"   {target} 验证 {n}（T+3可判定 {n_known}）命中 {hit}，命中率 {hit/max(n,1)*100:.0f}%")
    for r in sorted(rows, key=lambda x: -x["score"])[:8]:
        t1 = r["T1_chg"]
        t1s = f"{t1:+.1f}%" if t1 != "" else "—"
        mark = "✓" if r["hit"] else ("·" if r["known"] >= 3 else "待")
        print(f"     {r['name'][:10]:<10} [{r['layer']}] 分{r['score']:.3f} T1 {t1s} {mark}")


if __name__ == "__main__":
    main()
