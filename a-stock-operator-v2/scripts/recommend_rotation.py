# -*- coding: utf-8 -*-
"""次日轮动主线题材/板块推荐（强化自学习版）。

消费 rotation_{T}.json（四象限 + 多因子趋势榜）+ boards_15d + zt_15d + fund_15d，
融合「位置(趋势) / 资金 / 强度(涨停家数) / 情绪(封板率环境) / 热度(扩散度)」五维打分，
输出次日轮动主线题材/板块推荐，分三层：
  - 主线（mainline）：资金+趋势+强度共振，持续性最强，可中线跟踪
  - 接力（relay）：资金/强度抬头、趋势尚未确认，短线博弈为主
  - 潜伏（latent）：趋势+位置健康但当日资金/热度未爆发，具备补涨潜力

自学习：启动时优先读 rotation_params.json（rotation_evolve.py 回写）覆盖内置权重，
缺省回落内置权重，形成「推荐→验证→反推→更准」闭环。

用法：python scripts/recommend_rotation.py --date 20260903 [--top 5]
输出：data/rotation_rec_{T}.json + {cwd}/次日轮动主线推荐-{YYYY-MM-DD}.md
"""
import os
import argparse
import statistics
from datetime import datetime

from _common import (BASE, DATA_DIR, REPORT_ROOT, load_json, dump_json, safe_float,
                     today_ymd, seal_break_rates, trend_tag, bridge_ths_name,
                     boards_chg_lookup, BOARD_FALLBACK_COLOR)

ap = argparse.ArgumentParser(description="次日轮动主线题材/板块推荐")
ap.add_argument("--date", default=today_ymd(), help="目标交易日 YYYYMMDD")
ap.add_argument("--top", type=int, default=5, help="每层推荐数量（默认5）")
_args = ap.parse_args()
TD = _args.date
TOP = _args.top

# ===== 内置因子权重（可被 rotation_params.json 覆盖）=====
# 位置(趋势) / 资金 / 强度(涨停家数) / 情绪(封板率) / 热度(扩散度)
PRIOR_W = {"position": 0.26, "fund": 0.24, "strength": 0.20, "emotion": 0.14, "heat": 0.16}
PARAMS_PATH = os.path.join(DATA_DIR, "rotation_params.json")


def _load_weights():
    p = load_json(PARAMS_PATH, {})
    w = p.get("weights")
    if isinstance(w, dict) and set(w.keys()) == set(PRIOR_W.keys()) and abs(sum(w.values()) - 1.0) < 1e-3:
        return w, True
    return dict(PRIOR_W), False


WEIGHTS, _used_evolved = _load_weights()


# ===== 1. 加载数据 =====
def _load_rotation():
    rot = load_json(os.path.join(DATA_DIR, f"rotation_{TD}.json"), {})
    return rot


def _gather():
    rot = _load_rotation()
    boards = load_json(os.path.join(DATA_DIR, "boards_15d.json"), {})
    zt = load_json(os.path.join(DATA_DIR, "zt_15d.json"), {})
    fund = load_json(os.path.join(DATA_DIR, "fund_15d.json"), {})
    hot = load_json(os.path.join(DATA_DIR, f"hot_sectors_{TD}.json"), {})
    market = load_json(os.path.join(DATA_DIR, f"market_{TD}.json"), {})
    return rot, boards, zt, fund, hot, market


def _trend_seq(boards, name, lookback=5):
    daily = boards_chg_lookup(boards, name)
    if not daily:
        return []
    return [chg for _, chg in daily[-lookback:]]


def _fund_seq(fund, name):
    fm = fund.get(name)
    if not fm:
        ths = bridge_ths_name(name)
        for k, v in fund.items():
            if bridge_ths_name(k) == ths:
                fm = v
                break
    if not fm:
        return []
    dates = sorted(fm.keys())
    return [safe_float(fm[d]) for d in dates]


# ===== 2. 候选构建：热点板块 ∪ 趋势榜板块（去重）=====
def _build_candidates(rot, boards, zt, fund, hot):
    hot_sectors = hot.get("hot_sectors", [])
    trend_board = rot.get("trend_board", [])
    quad = rot.get("quadrants", {})

    cands = {}
    # 热点板块（含涨停家数、资金、涨幅、扩散度、连板高度）
    for s in hot_sectors:
        name = s.get("name", "")
        if not name:
            continue
        cands[name] = {
            "name": name, "color": s.get("color", BOARD_FALLBACK_COLOR),
            "zt_cnt": s.get("zt_cnt", 0), "fund_net_yi": safe_float(s.get("fund_net_yi")),
            "chg_pct": safe_float(s.get("chg_pct")), "spread": safe_float(s.get("spread")),
            "lbc_max": s.get("lbc_max", 0), "score": safe_float(s.get("score")),
        }
    # 趋势榜板块（含 15日/5日累计涨幅、资金持续性、涨停持续性）
    for t in trend_board:
        name = t.get("name", "")
        if not name:
            continue
        d = cands.setdefault(name, {"name": name, "color": t.get("color", BOARD_FALLBACK_COLOR)})
        d.update({
            "trend_score": safe_float(t.get("trend_score")),
            "cum15": safe_float(t.get("cum15")), "cum5": safe_float(t.get("cum5")),
            "tag": t.get("tag", ""),
        })
    # 补充四象限里的板块（可能不在热点/趋势榜，但资金方向明确）
    for q in ("mainline", "relay", "pulse"):
        for x in quad.get(q, []):
            name = x.get("name", "")
            if not name:
                continue
            d = cands.setdefault(name, {"name": name, "color": x.get("color", BOARD_FALLBACK_COLOR)})
            d.setdefault("fund_net_yi", safe_float(x.get("fund_net_yi")))
            d.setdefault("chg_pct", safe_float(x.get("chg_pct")))
    return cands


# ===== 3. 五维因子原始值 =====
def _raw_factors(name, d, boards, zt, fund, seal_rate):
    # position：趋势分（0~1，缺省用 5 日累计涨幅代理）
    ts = d.get("trend_score")
    if ts is not None:
        pos = ts
    else:
        seq = _trend_seq(boards, name, 5)
        pos = sum(seq) / max(len(seq), 1) / 100.0 if seq else 0.0
        pos = max(0.0, min(1.0, (pos + 0.1) / 0.3))  # 粗略映射到 0~1

    # fund：资金持续性（近5日为正占比，0~1），缺省用当日净流入方向
    fseq = _fund_seq(fund, name)
    if len(fseq) >= 2:
        fund_persist = sum(1 for v in fseq if v > 0) / len(fseq)
    else:
        fund_persist = 1.0 if d.get("fund_net_yi", 0) > 0 else 0.0

    # strength：涨停家数（相对强度，后续截面归一化）
    strength = d.get("zt_cnt", 0)

    # emotion：情绪环境（封板率）对板块的加成——封板率高时强势板块更易延续
    emotion = seal_rate / 100.0 if seal_rate else 0.5

    # heat：扩散度（子题材扩散，0~1 已归一）
    heat = d.get("spread", 0.0)

    return {"position": pos, "fund": fund_persist, "strength": strength,
            "emotion": emotion, "heat": heat}


# ===== 4. 横截面归一化 + 加权合成 =====
def _norm(vals):
    if not vals:
        return []
    vals = [v for v in vals]
    mn, mx = min(vals), max(vals)
    if mx == mn:
        return [0.5] * len(vals)
    return [(v - mn) / (mx - mn) for v in vals]


def _score(cands, boards, zt, fund, seal_rate):
    items = list(cands.values())
    raws = {name: _raw_factors(name, d, boards, zt, fund, seal_rate)
            for name, d in cands.items()}
    # 逐因子截面归一化
    norm = {}
    for fk in WEIGHTS:
        vals = [raws[n][fk] for n in cands]
        nm = _norm(vals)
        for i, n in enumerate(cands):
            norm.setdefault(n, {})[fk] = nm[i]
    # 加权合成
    for name, d in cands.items():
        total = sum(WEIGHTS[fk] * norm[name][fk] for fk in WEIGHTS)
        d["rec_score"] = round(total, 4)
        d["_raw"] = raws[name]
        d["_norm"] = {fk: round(norm[name][fk], 3) for fk in WEIGHTS}
    return items


# ===== 5. 分层推荐 =====
def _classify(items):
    mainline, relay, latent = [], [], []
    for d in items:
        r = d["_raw"]
        fund_pos = r["fund"] >= 0.6
        trend_ok = r["position"] >= 0.5
        strong = d.get("zt_cnt", 0) >= 2 or d.get("lbc_max", 0) >= 2
        if fund_pos and (trend_ok or strong):
            mainline.append(d)
        elif (r["fund"] > 0 and r["position"] < 0.5) or d.get("zt_cnt", 0) >= 1:
            relay.append(d)
        elif r["position"] >= 0.5:
            latent.append(d)
    for group in (mainline, relay, latent):
        group.sort(key=lambda x: -x["rec_score"])
    return mainline, relay, latent


# ===== 6. 生成推荐 JSON + Markdown =====
def _reason(d):
    r = d["_raw"]
    parts = []
    if d.get("zt_cnt"):
        parts.append(f"涨停{d['zt_cnt']}只")
    if d.get("lbc_max"):
        parts.append(f"最高{d['lbc_max']}板")
    if d.get("fund_net_yi"):
        parts.append(f"资金{d['fund_net_yi']:+.1f}亿")
    if d.get("cum5") is not None:
        parts.append(f"5日{d['cum5']:+.1f}%")
    if d.get("cum15") is not None:
        parts.append(f"15日{d['cum15']:+.1f}%")
    if d.get("tag"):
        parts.append(f"状态{d['tag']}")
    return " · ".join(parts) if parts else "—"


def _risk_tip(seal_rate, rotation_speed):
    tips = []
    if seal_rate < 60:
        tips.append("封板率偏低，短线情绪偏弱，次日主线以低吸不追高为主")
    if rotation_speed is not None and rotation_speed >= 0.6:
        tips.append("轮动速度快，主线易切换，注意快进快出、避免恋战")
    return tips


def main():
    rot, boards, zt, fund, hot, market = _gather()
    hot_sectors = hot.get("hot_sectors", [])
    total_up = market.get("limit_up", {}).get("total", 0)
    total_zb = market.get("broken", {}).get("total", 0)
    seal_rate, _ = seal_break_rates(total_up, total_zb)

    cands = _build_candidates(rot, boards, zt, fund, hot)
    if not cands:
        print("!! 无可推荐候选（hot_sectors 与 trend_board 均为空），请先跑采集 + gen_rotation_v2")
        raise SystemExit(1)

    items = _score(cands, boards, zt, fund, seal_rate)
    mainline, relay, latent = _classify(items)

    rotation_speed = rot.get("rotation_speed")
    breadth = rot.get("breadth_index")
    risks = _risk_tip(seal_rate, rotation_speed)

    # 落盘 JSON
    result = {
        "date": TD,
        "model": "rotation_rec_v1",
        "generated": datetime.now().isoformat(),
        "params": {"weights": WEIGHTS, "evolved": _used_evolved},
        "market_context": {"zt_total": total_up, "zb_total": total_zb,
                           "seal_rate": seal_rate, "rotation_speed": rotation_speed,
                           "breadth_index": breadth},
        "mainline": [{"name": d["name"], "score": d["rec_score"], "reason": _reason(d)}
                     for d in mainline[:TOP]],
        "relay": [{"name": d["name"], "score": d["rec_score"], "reason": _reason(d)}
                  for d in relay[:TOP]],
        "latent": [{"name": d["name"], "score": d["rec_score"], "reason": _reason(d)}
                   for d in latent[:TOP]],
        "risks": risks,
    }
    out_json = os.path.join(DATA_DIR, f"rotation_rec_{TD}.json")
    dump_json(result, out_json)

    # 渲染 Markdown
    date_disp = f"{TD[:4]}-{TD[4:6]}-{TD[6:8]}"
    L = [f"# 次日轮动主线题材/板块推荐 {date_disp}\n"]
    L.append("## 概览\n")
    L.append(f"- 目标交易日：`{date_disp}`")
    L.append(f"- 封板率 `{seal_rate}%` · 轮动速度 `{rotation_speed if rotation_speed is not None else '—'}` · 扩散指数 `{breadth if breadth is not None else '—'}`")
    L.append(f"- 因子权重：{'、'.join(f'{k}={v*100:.0f}%' for k, v in WEIGHTS.items())}" +
             ("（自学习回写）" if _used_evolved else "（内置先验）"))
    L.append("")

    for title, group, cn in (("主线（资金+趋势+强度共振，可持续跟踪）", mainline, "主线"),
                              ("接力（短线博弈，快进快出）", relay, "接力"),
                              ("潜伏（趋势健康、资金热度未爆发，补涨潜力）", latent, "潜伏")):
        L.append(f"## {cn} · {title}\n")
        if group:
            L.append("| # | 板块/题材 | 推荐分 | 依据 |")
            L.append("|---|---|---|---|")
            for i, d in enumerate(group[:TOP], 1):
                L.append(f"| {i} | **{d['name']}** | {d['rec_score']:.3f} | {_reason(d)} |")
            L.append("")
        else:
            L.append("本层暂无候选。\n")

    if risks:
        L.append("## 风险提示\n")
        for r in risks:
            L.append(f"- ⚠ {r}")
        L.append("")

    L.append("---\n")
    L.append("> 基于公开行情整理，仅供复盘参考，不构成投资建议。次日主线需结合竞价/集合竞价与早盘强度二次确认。")
    md = "\n".join(L) + "\n"
    out_md = os.path.join(REPORT_ROOT, f"次日轮动主线推荐-{date_disp}.md")
    with open(out_md, "w", encoding="utf-8") as f:
        f.write(md)

    print(f"✅ 次日轮动推荐完成 → {out_md}")
    print(f"   JSON → {out_json}")
    print(f"   主线 {len(mainline[:TOP])} | 接力 {len(relay[:TOP])} | 潜伏 {len(latent[:TOP])}")
    for i, d in enumerate(mainline[:TOP], 1):
        print(f"   主线{i}. {d['name']} 分{d['rec_score']:.3f} | {_reason(d)}")


if __name__ == "__main__":
    main()
