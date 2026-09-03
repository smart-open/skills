# -*- coding: utf-8 -*-
"""个股诊断报告生成器（数据驱动 + 参数化）。

用法：
  python generate_stock_report.py \
      --name 通鼎互联 --code 002491 \
      --data data/tdhl_analysis.json --kline data/tdhl_kline.json \
      --date 20260818 --outdir output

参数：
  --name  股票全称（如「通鼎互联」）。与 --code 至少提供一个，用于确定诊断目标。
  --code  股票代码（如 002491）。与 --name 至少提供一个。
  --exchange 交易所前缀（SZ / SH），默认取 JSON，再默认 SZ
  --date  报告基准日期（默认真实今日 YYYY-MM-DD，仅用于文件名与页脚标注）
  --data  个股分析 JSON（六维/SWOT/龙虎榜/筹码/价位/操作建议等）。
          缺省时按 name/code 推导 data/{name|code}_analysis.json，再回退 tdhl 样例。
  --kline 个股 K 线 JSON（含 closes 列表）。
          缺省时按 name/code 推导，再回退 tdhl 样例。
  --outdir 输出目录（默认 output）
  --cost  持仓成本价（可选）；传入则在 07 综合评级处追加持仓成本/盈亏

注意：持仓成本价通过 --cost 传入，若提供则在本报告 07「最终诊断操作建议」章节的
综合评级处追加持仓成本/盈亏（成本若有，主要应用于操作建议）。
"""
import argparse
import os
from datetime import datetime

from _common import BASE, DATA_DIR, REPORT_ROOT, load_json, dim_weight

ap = argparse.ArgumentParser(description="个股诊断报告生成器")
ap.add_argument("--name", default=None, help="股票全称；与 --code 至少提供一个，用于确定诊断目标")
ap.add_argument("--code", default=None, help="股票代码；与 --name 至少提供一个")
ap.add_argument("--exchange", default=None)
ap.add_argument("--date", default=datetime.now().strftime("%Y-%m-%d"), help="报告基准日期 YYYY-MM-DD，默认真实今日，仅用于文件名与页脚标注")
ap.add_argument("--data", default=None, help="个股分析 JSON；缺省按 name/code 推导 data/{name|code}_analysis.json，再回退 tdhl 样例")
ap.add_argument("--kline", default=None, help="个股 K 线 JSON；缺省按 name/code 推导，再回退 tdhl 样例")
ap.add_argument("--outdir", default=REPORT_ROOT)
ap.add_argument("--cost", type=float, default=None, help="持仓成本价（可选）；传入则在 07 综合评级处追加持仓成本/盈亏")
args = ap.parse_args()

# name / code 至少提供一个，用于确定诊断目标
if not args.name and not args.code:
    ap.error("股票全称(--name) 与 股票代码(--code) 至少需提供一个，用于确定诊断目标")

# data / kline 按 name/code 智能推导（缺省回退 tdhl 样例）
if not args.data:
    cands = []
    if args.name:
        cands.append(os.path.join(DATA_DIR, f"{args.name}_analysis.json"))
    if args.code:
        cands.append(os.path.join(DATA_DIR, f"{args.code}_analysis.json"))
    for c in cands:
        if os.path.exists(c):
            args.data = c
            break
    if not args.data:
        args.data = os.path.join(DATA_DIR, "tdhl_analysis.json")
if not args.kline:
    cands = []
    if args.name:
        cands.append(os.path.join(DATA_DIR, f"{args.name}_kline.json"))
    if args.code:
        cands.append(os.path.join(DATA_DIR, f"{args.code}_kline.json"))
    for c in cands:
        if os.path.exists(c):
            args.kline = c
            break
    if not args.kline:
        args.kline = os.path.join(DATA_DIR, "tdhl_kline.json")

# ---------- 加载数据 ----------
D = load_json(args.data, {})
K = load_json(args.kline, {})

name = args.name or D.get("name", "Unknown")
code = args.code or D.get("code", "000000")
exchange = args.exchange or D.get("exchange", "SZ")
asof = D.get("asof", args.date)

# ---------- 价格面板 ----------
pp = D.get("price_panel", {})

# ---------- 六维评分（短线/中线双权重） ----------
dims = D.get("dims", [])


def _score(horizon):
    s = sum((d.get("score", 0) or 0) * dim_weight(d, horizon) for d in dims)
    wsum = sum(dim_weight(d, horizon) for d in dims)
    return round(s / wsum, 2) if wsum else 0.0


total_short = _score("short")
total_mid = _score("mid")
rating_short = "中性 · 观望" if total_short < 6.5 else "推荐"
rating_mid = "中性 · 观望" if total_mid < 6.5 else "推荐"

# ---------- SWOT ----------
swot = D.get("swot", {})
swot_colors = [("S", "优势", "#ff4d5e"), ("W", "劣势", "#2bd99f"),
               ("O", "机会", "#4f8cff"), ("T", "威胁", "#ffb454")]

# ---------- 估值分情景 ----------
scenarios = D.get("scenarios", [])
scen_note = D.get("scenarios_note", "")

# ---------- 龙虎榜 ----------
lhb = D.get("lhb", {})
lhb_buy = lhb.get("buy", [])
lhb_sell = lhb.get("sell", [])

# ---------- 筹码与股东 ----------
chip = D.get("chip", {})
holders = D.get("holders", [])
holders_note = D.get("holders_note", "")

# ---------- 关键价位 ----------
levels = D.get("levels", {})
support = levels.get("support", [])
resist = levels.get("resist", [])

# ---------- 持仓成本价 ----------
# 说明：成本价经 --cost 传入，若提供则在 07「最终诊断操作建议」章节的综合评级处
# 追加持仓成本/盈亏（成本若有，主要应用于操作建议）。

# ---------- 构建 Markdown 片段 ----------
tags_md = " ".join(f"`{t}`" for t in D.get("tags", []))

dims_md = ""
for d in dims:
    _sc = d.get("score", 0) or 0
    _ws = int(dim_weight(d, "short"))
    _wm = int(dim_weight(d, "mid"))
    dims_md += (
        f"| {d.get('code', '')} | {d.get('name', '')} | {_ws}% | {_wm}% | "
        f"{_sc}/10 | {d.get('detail', '')} | {d.get('verdict', '')} |\n"
    )

swot_md = ""
for key, label, _color in swot_colors:
    items = "".join(f"- {x}\n" for x in swot.get(key, []))
    swot_md += f"\n### {key} {label}\n{items}"

scen_md = "".join(
    f"| {s.get('name', '')} | {s.get('cond', '')} | {s.get('val', '')} |\n"
    for s in scenarios)

lhb_buy_md = "".join(f"| {n} | {amt} | {t} |\n" for n, amt, t, _c in lhb_buy)
lhb_sell_md = "".join(f"| {n} | {amt} | {t} |\n" for n, amt, t, _c in lhb_sell)

holders_md = "".join(f"| {n} | {p} | {t} |\n" for n, p, t in holders)

support_md = "".join(f"| {lbl} | {v} |\n" for lbl, v in support)
resist_md = "".join(f"| {lbl} | {v} |\n" for lbl, v in resist)

risk06 = D.get("risk_06", [])
risk06_md = "".join(f"- **{t}**：{d}\n" for t, d in risk06)

# ---------- 07 最终诊断操作建议 ----------
A = D.get("advice", {})
inds_md = "".join(f"- {k}：**{v}** — {d}\n" for k, v, d in A.get("inds", []))
stop_md = "".join(f"- {k}：**{v}** — {d}\n" for k, v, d in A.get("stop", []))
target_md = "".join(f"- {k}：**{v}** — {d}\n" for k, v, d in A.get("target", []))

strats_md = ""
for s in A.get("strats", []):
    lines = "".join(f"- **{k}**：{txt}\n" for k, txt in s.get("lines", []))
    strats_md += f"\n#### {s.get('no', '')} {s.get('name', '')}（{s.get('tag', '')}）\n{lines}"

risk_md = "".join(f"- **{t}**：{d}\n" for t, d in A.get("risk_items", []))

# ---------- 持仓成本 / 盈亏（可选，仅在 07 综合评级处追加） ----------
cost_md = ""
if args.cost is not None:
    price_val = float(pp.get("price", 0) or 0)
    pnl = (price_val - args.cost) / args.cost * 100
    sign = "+" if pnl >= 0 else ""
    cost_md = f"- 持仓成本 / 盈亏：成本 **{args.cost:.2f}**，现价 **{pp.get('price', '—')}**，盈亏 **{sign}{pnl:.2f}%**\n"

md = f'''# {name}（{exchange} {code}）个股诊断报告

> 数据截至 {asof} 收盘

**标签**：{tags_md}

## 价格面板

| 指标 | 数值 |
|---|---|
| 现价 | {pp.get('price', '—')} |
| 涨跌 | {pp.get('chg', '—')} |
| 市值 | {pp.get('market_cap', '—')} |
| 市净率 | {pp.get('pb', '—')}（{pp.get('pb_note', '')}） |
| 换手率 | {pp.get('turnover', '—')} |
| 成交额 | {pp.get('amount', '—')} |

## 六维综合评分

- 短线：**{total_short} / 10**（{rating_short}）
- 中线：**{total_mid} / 10**（{rating_mid}）

## 01 六维诊断

| 代码 | 维度 | 短线权重 | 中线权重 | 评分 | 说明 | 结论 |
|---|---|---|---|---|---|---|
{dims_md}
## 02 SWOT 矩阵
{swot_md}

## 03 估值分情景

| 情景 | 条件 | 估值 |
|---|---|---|
{scen_md}
> {scen_note}

## 04 龙虎榜席位

{lhb.get('date', '')} · {lhb.get('desc', '')}

合计买入 **{lhb.get('buy_total', '—')}** · 卖出 **{lhb.get('sell_total', '—')}** · 净买入 **{lhb.get('net', '—')}**；机构净买仅 **{lhb.get('inst_net', '—')}**，深股通净卖 **{lhb.get('north_net', '—')}**，营业部席位净买 **{lhb.get('seat_net', '—')}** → 游资主导。

### 买入前五

| 席位 | 金额 | 类型 |
|---|---|---|
{lhb_buy_md}
### 卖出前五

| 席位 | 金额 | 类型 |
|---|---|---|
{lhb_sell_md}
## 05 筹码与股东结构

- 股东户数：**{chip.get('holders', '—')}**（{chip.get('holders_note', '')}）
- 筹码平均成本：**{chip.get('avg_cost', '—')}**（现价 {pp.get('price', '—')} 元）
- 筹码盈利率：**{chip.get('profit', '—')}**（{chip.get('profit_note', '')}）
- 前十大股东占比：**{chip.get('top10', '—')}**（{chip.get('top10_note', '')}）

### 前十大股东

| 股东 | 持股 | 性质 |
|---|---|---|
{holders_md}
> {holders_note}

## 06 关键价位

### 支撑位

| 标签 | 数值 |
|---|---|
{support_md}
### 压力位

| 标签 | 数值 |
|---|---|
{resist_md}
### 避坑提示

{risk06_md}
## 07 最终诊断操作建议

### 综合评级

- 评分：**{A.get('score', '—')} / 10**
- 评级：**{A.get('rating', '—')}**
{inds_md}{cost_md}
### 止损位

{stop_md}
### 目标位

{target_md}
### 操作策略
{strats_md}
### 风险提示（观察评级 · 非买卖建议）

{risk_md}
---

> 数据来源：公开行情数据（腾讯财经、东方财富、同花顺、新浪财经）与公开财经资讯聚合整理，数据截至 {asof} 收盘。盘中数据可能滞后。
>
> 以上分析基于公开数据，仅供研究参考，不构成投资建议。股市有风险，投资需谨慎。文中评分与评级为模型量化输出，不构成任何买卖依据。
'''

os.makedirs(args.outdir, exist_ok=True)
out = os.path.join(args.outdir, f"{name}_个股诊断-{args.date}.md")
with open(out, "w", encoding="utf-8") as f:
    f.write(md)
print("个股 Markdown 报告已生成:", out)
print(f"六维综合评分: 短线 {total_short}（{rating_short}） · 中线 {total_mid}（{rating_mid}）")
