# -*- coding: utf-8 -*-
"""动态热点发现引擎（Model 01）：从涨停池 + 板块资金流 + 概念涨幅 实时聚类当日热点 Top N。
  替代写死的 14 板块池与 theme_map 题材词典，新热点自动纳入，无需手改代码。
  用法：python scripts/gen_hot_sectors.py --date 20260818
  输出：data/hot_sectors_{date}.json"""
import os, math, argparse
from datetime import datetime
from collections import defaultdict, Counter

from _common import BASE, DATA_DIR, load_json, dump_json, safe_float, today_ymd, seal_break_rates

ap = argparse.ArgumentParser(description="动态热点发现引擎")
ap.add_argument("--date", default=today_ymd(), help="目标交易日 YYYYMMDD")
ap.add_argument("--top", type=int, default=14, help="返回热点数量（默认 14，与旧版色板兼容）")
_args = ap.parse_args()
TD = _args.date
TOP_N = _args.top

# ===== 1. 加载数据 =====
market_path = os.path.join(DATA_DIR, f"market_{TD}.json")
if not os.path.exists(market_path):
    raise SystemExit(f"数据文件不存在: market_{TD}.json，请先运行 collect_data.py + collect_v2.py")

mkt = load_json(market_path)
_mkt_td = str(mkt.get("trade_date") or "").replace("-", "")
if _mkt_td and _mkt_td != TD:
    raise SystemExit(f"!! market_{TD}.json 内 trade_date={mkt.get('trade_date')} 与目标日 {TD} 不符，数据过期，请重新采集")
lu_list = [r for r in mkt.get("limit_up", {}).get("list", []) if r.get("code") and r.get("name")]
total_up = mkt.get("limit_up", {}).get("total", 0)
fund_rank = mkt.get("fund_rank", [])
hot_reason = mkt.get("hot_reason", {}).get("rows", [])
_sectors_raw = mkt.get("sectors", [])
if isinstance(_sectors_raw, dict):
    _sectors_raw = (_sectors_raw.get("industry", []) or []) + (_sectors_raw.get("concept", []) or [])
sectors = _sectors_raw if isinstance(_sectors_raw, list) else []
total_zb = mkt.get("broken", {}).get("total", 0)
seal_rate, _ = seal_break_rates(total_up, total_zb)

# ===== 2. 构建概念板块池（真实板块数据源 + 涨停股行业板块补充） =====
# 2a. 从 sectors（东财行业/概念板块）取板块名 + 涨幅 + 主力资金流；同名板块保留资金绝对值更大者
fund_by_name = {}
for s in sectors:
    name = s.get("name", "")
    if not name:
        continue
    cur = {
        "name": name, "code": s.get("code", ""),
        "chg_pct": safe_float(s.get("chg_pct")),
        "main_net_yi": safe_float(s.get("main_net_yi")),
        "source": "sectors",
    }
    prev = fund_by_name.get(name)
    if prev is None or abs(cur["main_net_yi"]) > abs(prev["main_net_yi"]):
        fund_by_name[name] = cur

# 2b. 从涨停股 hybk 字段聚合，补 sectors 未覆盖的板块（无资金/涨幅，主要靠涨停家数因子）
hybk_counter = Counter(r.get("hybk", "") for r in lu_list if r.get("hybk"))
for name, cnt in hybk_counter.most_common(30):
    if name and name not in fund_by_name:
        fund_by_name[name] = {
            "name": name, "code": "", "chg_pct": 0, "main_net_yi": 0,
            "source": "hybk"
        }

# 2c. 极端降级：sectors 与 hybk 均缺失时才回退用 fund_rank 兜底，保证板块池非空
if not fund_by_name:
    for s in fund_rank:
        name = s.get("name", "")
        if not name:
            continue
        fund_by_name[name] = {
            "name": name, "code": s.get("code", ""),
            "chg_pct": safe_float(s.get("chg_pct")),
            "main_net_yi": safe_float(s.get("main_net_yi")),
            "source": "fund_rank"
        }

# ===== 3. 每个板块：匹配涨停股 + 计算 5 因子 =====
def _reason_str(r):
    """归一化 reason 字段（涨停池中可能是 dict 或 str）。"""
    if isinstance(r, dict):
        return r.get("reason", "") or ""
    return r or ""


def match_board(hybk, reason, board_name):
    if hybk == board_name:
        return True
    if board_name in _reason_str(reason):
        return True
    return False

# 聚合每个板块的涨停股
board_stocks = defaultdict(list)
for r in lu_list:
    hybk = r.get("hybk", "") or ""
    reason = _reason_str(r.get("reason"))
    for bname in fund_by_name:
        if match_board(hybk, reason, bname):
            board_stocks[bname].append(r)
            break  # 每只股票只归入一个板块

# 从 hot_reason 补漏（涨停池中没匹配到的，在 hot_reason 中可能有）
lu_codes = {r.get("code") for r in lu_list}
for r in hot_reason:
    if not r.get("code") or r.get("code") in lu_codes:
        continue
    reason = _reason_str(r.get("reason"))
    for bname in fund_by_name:
        if match_board("", reason, bname):
            board_stocks[bname].append(r)
            break

# ===== 4. 计算 5 因子评分 =====
board_scores = []
for bname, info in fund_by_name.items():
    stocks = board_stocks.get(bname, [])
    zt_cnt = len(stocks)
    if zt_cnt == 0 and info["chg_pct"] <= 0:
        continue  # 无涨停且无涨幅的板块跳过

    # 主力净流入（亿）
    fund = safe_float(info["main_net_yi"])

    # 板块涨幅
    chg = safe_float(info["chg_pct"])

    # 最高连板高度
    lbc_max = max((r.get("lbc", 0) or 0 for r in stocks), default=0)

    # 扩散度：涨停股覆盖的子题材数 / 涨停家数
    sub_reasons = set()
    for r in stocks:
        reason = _reason_str(r.get("reason"))
        # 提取独立关键词（中文题材多以 + / 、 分隔）
        for token in (reason or "").replace("+", " ").replace("/", " ").replace("、", " ").split():
            if len(token) >= 2:
                sub_reasons.add(token)
    spread = len(sub_reasons) / max(zt_cnt, 1) if zt_cnt > 0 else 0

    board_scores.append({
        "name": bname,
        "code": info.get("code", ""),
        "zt_cnt": zt_cnt,
        "fund_net_yi": round(fund, 2),
        "chg_pct": round(chg, 2),
        "lbc_max": lbc_max,
        "spread": round(spread, 2),
        "stocks": [{"name": r.get("name", ""), "code": r.get("code", ""),
                     "reason": _reason_str(r.get("reason"))[:20],
                     "lbc": r.get("lbc", 0)}
                    for r in stocks[:6]],
        "source": info.get("source", "unknown"),
        "_raw": {"zt_cnt": zt_cnt, "fund": fund, "chg": chg, "lbc_max": lbc_max, "spread": spread}
    })

# 归一化（Min-Max，空样本时跳过；长尾指标先 log1p 保号压缩，避免单一极端板块压扁其余区分度）
_LONGTAIL = {"zt_cnt", "fund", "lbc_max"}


def _robust(v, key):
    if key in _LONGTAIL:
        return math.copysign(math.log1p(abs(v)), v) if v else 0.0
    return v


def norm_vals(items, key):
    vals = [_robust(it["_raw"][key], key) for it in items]
    if not vals:
        return
    mn, mx = min(vals), max(vals)
    if mx == mn:
        for it in items:
            it[f"_{key}_norm"] = 0.5 if mx > 0 else 0.0
        return
    for it, tv in zip(items, vals):
        it[f"_{key}_norm"] = (tv - mn) / (mx - mn)

for key in ["zt_cnt", "fund", "chg", "lbc_max", "spread"]:
    norm_vals(board_scores, key)

# 加权总分
WEIGHTS = {"zt_cnt": 0.30, "fund": 0.25, "chg": 0.15, "lbc_max": 0.15, "spread": 0.15}
for it in board_scores:
    score = sum(WEIGHTS[k] * it[f"_{k}_norm"] for k in WEIGHTS)
    it["score"] = round(score, 4)
    # 星级（0-1 映射到 1-5 星）
    if score >= 0.8:
        it["stars"] = "★★★★★"
    elif score >= 0.6:
        it["stars"] = "★★★★"
    elif score >= 0.4:
        it["stars"] = "★★★"
    elif score >= 0.2:
        it["stars"] = "★★"
    else:
        it["stars"] = "★"

# 按总分排序
board_scores.sort(key=lambda x: -x["score"])

# ===== 5. 取 Top N + 自动分配颜色（热度越高颜色越稳定） =====
# 预设色板（20 色，足够覆盖 Top N）
COLOR_PALETTE = [
    "#ff5c7a","#ff8a5c","#ffb84d","#ffd23f","#8fd14f","#4cd07d",
    "#4d9fff","#6cb6ff","#9b6bff","#b58cff","#ff6bb5","#3ddbd9",
    "#2dd4a8","#9aa5b5","#ff9370","#7ecba1","#a78bfa","#f472b6",
    "#38bdf8","#fbbf24"
]
hot_sectors = []
for i, it in enumerate(board_scores[:TOP_N]):
    color = COLOR_PALETTE[i % len(COLOR_PALETTE)]
    hot_sectors.append({
        "rank": i + 1,
        "name": it["name"],
        "code": it["code"],
        "score": it["score"],
        "stars": it["stars"],
        "zt_cnt": it["zt_cnt"],
        "fund_net_yi": it["fund_net_yi"],
        "chg_pct": it["chg_pct"],
        "lbc_max": it["lbc_max"],
        "spread": it["spread"],
        "color": color,
        "stocks": it["stocks"],
        "source": it["source"],
    })

# 溢出校验：取封板率 + 总涨停家数备用
zt_total = total_up
zb_total = total_zb

result = {
    "date": TD,
    "model": "hot_sectors_v1",
    "generated": datetime.now().isoformat(),
    "params": {"top_n": TOP_N, "weights": WEIGHTS},
    "market_context": {
        "zt_total": zt_total, "zb_total": zb_total,
        "seal_rate": seal_rate,
        "total_sectors_found": len(board_scores),
    },
    "hot_sectors": hot_sectors,
}

# ===== 6. 落盘 =====
# 空结果保护：极端情形（sectors/hybk/涨停池全缺失）不落盘，保留旧文件，exit 1
if not board_scores:
    print("!! 未发现任何有效板块（sectors 与涨停池可能采集失败），不落盘")
    raise SystemExit(1)
out_path = os.path.join(DATA_DIR, f"hot_sectors_{TD}.json")
dump_json(result, out_path)
print(f"✅ 动态热点发现完成 → {out_path}")
print(f"   共发现 {len(board_scores)} 个有效板块，取 Top {len(hot_sectors)}")
print(f"   当日涨停 {zt_total} 只，炸板 {zb_total} 只，封板率 {seal_rate}%")
print(f"   Top 5 热点：")
for s in hot_sectors[:5]:
    print(f"   {s['rank']:2d}. {s['name']:<12s} 得分 {s['score']:.3f}  {s['stars']}  "
          f"涨停{s['zt_cnt']}只 · 资金{s['fund_net_yi']:+.1f}亿 · 涨幅{s['chg_pct']:+.1f}%")