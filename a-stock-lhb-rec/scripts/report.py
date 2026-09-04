# -*- coding: utf-8 -*-
"""生成龙虎榜 T+3 涨停推荐模型 Markdown 报告
读取: model_meta_t3.json / model_data_t3.csv / model_coef_t3.csv / seat_profile.csv / model_history.json / verify_history.csv
含: 方法论 / 赢家共性 / 席位手法专题 / 模型评估 / 评分卡 / 实战验证 / 进化轨迹 / 买入策略
用法: python report.py [DATE]   (DATE 缺省=最新, 用于命名输出)
输出: 当前会话/工作目录根下 `龙虎榜T+3涨停推荐模型报告-{date}.md`
"""
import os, json, glob
import numpy as np
import pandas as pd
import joblib
import _common as C


def pct(s):
    return f"{s*100:.1f}%" if pd.notna(s) else "—"


def _rate(v, hi=None):
    """涨红跌绿标记：达到基准(hi)标红，否则普通。"""
    mark = "🔴" if (hi is not None and v >= hi) else ""
    return f"{v:.1f}% {mark}".strip()


def dim_table(col, order, train, base_rate):
    """二分因子 → Markdown 行（是/否 × 样本数 × T+3涨停率）。"""
    lines = []
    for v in order:
        sub = train[train[col] == v]
        rate = sub["T3_ZT"].mean() * 100 if len(sub) else 0
        lines.append(f"| {'是' if v == 1 else '否'} | {len(sub)} | {_rate(rate, base_rate)} |")
    return "\n".join(lines)


def bucket_table(col, edges, labels, train, base_rate):
    """分桶因子 → Markdown 行（区间 × 样本数 × T+3涨停率）。"""
    lines = []
    for e0, e1, lab in zip(edges[:-1], edges[1:], labels):
        m = (train[col] >= e0) & (train[col] < e1)
        rate = train[m]["T3_ZT"].mean() * 100 if m.sum() else 0
        lines.append(f"| {lab} | {int(m.sum())} | {_rate(rate, base_rate)} |")
    return "\n".join(lines)


def main(date=None):
    if not os.path.exists(C.MODEL_META):
        print("[report] 模型未训练, 先 run.py init/train"); return None
    meta = json.load(open(C.MODEL_META, encoding="utf-8"))
    df = pd.read_csv(C.DATASET_CSV)
    coef = pd.read_csv(os.path.join(C.DATA, "model_coef_t3.csv")) if os.path.exists(os.path.join(C.DATA, "model_coef_t3.csv")) else pd.DataFrame()
    seat = pd.read_csv(C.SEAT_PROFILE_CSV) if os.path.exists(C.SEAT_PROFILE_CSV) else pd.DataFrame()
    ART = joblib.load(C.MODEL_PATH)
    train = df.dropna(subset=["T3_ZT"]).copy()
    win = train[train["T3_ZT"] == 1].copy()
    base_rate = train["T3_ZT"].mean() * 100
    dmin, dmax = df["TRADE_DATE"].min(), df["TRADE_DATE"].max()

    # 赢家清单(最近 3 个月)
    recent = win[win["TRADE_DATE"] >= (pd.Timestamp(dmax) - pd.Timedelta(days=90)).strftime("%Y-%m-%d")].sort_values("TRADE_DATE")
    win_rows = ""
    for _, r in recent.head(45).iterrows():
        win_rows += (f"| {r['TRADE_DATE']} | {r['CODE']} | **{r['NAME']}** | "
                     f"{r['CHANGE_RATE']:.1f} | {r['TURNOVERRATE']:.1f} | {r['NET_YI']:.2f} | {r['REASON']} | "
                     f"{'主线' if r['THEME_MAIN'] else '—'} | {'Y' if r['FAMOUS_YZ'] else '—'} | {'Y' if r['HAS_INST'] else '—'} | "
                     f"{r['BUYER_TOP_SCORE']:.1f} | {r['NET_BUY_RATIO']:.2f} | {pct(r['D1'])}/{pct(r['D2'])}/{pct(r['D3'])} |")

    coef_rows = ""
    if len(coef):
        for _, r in coef.iterrows():
            coef_rows += f"| {r['feature']} | {r['coef']:+.3f} | {r['odds']:.2f} |"
    else:
        coef_rows = "| 无系数文件 | — | — |"

    tt = meta.get("temporal_top", {})
    top_rows = "".join(f"| Top{k.strip('top')} | {v}% |" for k, v in tt.items())

    # 实战验证(时间外窗口)
    verify_rows = ""
    te_hit = 0
    ttd = meta.get("temporal_test_dates")
    if ttd:
        te = train[(train["TRADE_DATE"] >= ttd[0]) & (train["TRADE_DATE"] <= ttd[1])].copy()
        if len(te):
            Xte = C.prep_features(te, ART)
            te = te.copy(); te["P"] = ART["model"].predict_proba(ART["scaler"].transform(Xte.values))[:, 1]
            te = te.sort_values("P", ascending=False)
            for _, r in te.head(20).iterrows():
                hit = r["T3_ZT"] == 1
                verify_rows += (f"| {r['TRADE_DATE']} | {r['CODE']} | **{r['NAME']}** | "
                                f"{r['P']*100:.1f}% | {'✅涨停' if hit else '❌未涨'} | "
                                f"{'主线' if r['THEME_MAIN'] else '—'} | {'Y' if r['IS_LIMIT_UP'] else '—'} | "
                                f"{'Y' if r['FAMOUS_YZ'] else '—'} | {r['NET_BUY_RATIO']:.2f} | {pct(r['D1'])}/{pct(r['D2'])}/{pct(r['D3'])} |")
            te_hit = int(te.head(20)["T3_ZT"].sum())

    # 席位手法专题
    style_rows = seat_rows = ""
    if len(seat):
        style_cnt = seat["风格"].value_counts()
        style_rows = "".join(f"| {k} | {v} | {round(v/len(seat)*100,1)}% |" for k, v in style_cnt.items())
        sd = seat[(seat["样本可信度"] == "高") & (seat["风格"] == "打板")].sort_values("综评", ascending=False).head(12)
        for _, r in sd.iterrows():
            seat_rows += (f"| {r['OPERATEDEPT_NAME']} | {r['上榜次数']} | "
                          f"{r['买入总额亿']:.1f} | {r['净买入亿']:.1f} | {r['单票均买万']:.0f} | "
                          f"{r['打板率']:.1f} | {r['T5均值_s']:.1f} | {r['T5胜率_s']:.1f} | {r['综评']:.1f} |")

    zy_match = seat[seat["OPERATEDEPT_NAME"].str.contains("紫阳东路")] if len(seat) else pd.DataFrame()
    zy = zy_match.iloc[0] if len(zy_match) else None
    zy_md = ""
    if zy is not None:
        zy_md = (f"> **紫阳东路（国泰海通武汉紫阳东路，重点关注的席位）**\n>\n"
                 f"> 风格：**{zy['风格']}** ｜ 三个月上榜 **{int(zy['上榜次数'])}** 次 ｜ 买入 **{zy['买入总额亿']:.1f}** 亿 ｜ 净买入 {zy['净买入亿']:.1f} 亿 ｜ 单票均买 {zy['单票均买万']:.0f} 万\n>\n"
                 f"> 打板率 **{zy['打板率']:.1f}%** ｜ T+5均值(收缩) **{zy['T5均值_s']:.1f}%** ｜ T+5胜率(收缩) **{zy['T5胜率_s']:.1f}%** ｜ 综评 **{zy['综评']:.1f}**\n>\n"
                 f"> 典型重仓打板游资，是「龙头确认/加速器」而非埋伏者；当其出现在**主线+连板+优质买方共振**个股时作为强度确认信号。")

    # 进化轨迹
    evo_rows = ""
    if os.path.exists(C.HISTORY_PATH):
        hist = json.load(open(C.HISTORY_PATH, encoding="utf-8"))
        for h in hist[-10:]:
            evo_rows += (f"| v{h['version']} | {h['date']} | {h['n']} | "
                         f"{h['auc_temporal']} | {h['top20']}% | {'✅接受' if h['accepted'] else '✗保留'} | {h['note']} |")
    # 最近验证
    ver_rows = ""
    if os.path.exists(C.VERIFY_PATH):
        vh = pd.read_csv(C.VERIFY_PATH, dtype={"DATE": str}).tail(10)
        for _, r in vh.iterrows():
            ver_rows += (f"| {r['DATE']} | {r['推荐数']} | {int(r['T1涨停数'])} | "
                         f"{int(r['T3涨停数'])} | {r['T3命中率']}% |")

    n_seat = len(seat)
    top20 = tt.get('top20', '—')
    _tb = max(float(meta.get('temporal_base', 0)), 1e-9)
    _mult = round(float(top20) / _tb, 1) if isinstance(top20, (int, float)) else '—'
    MD = f"""# 龙虎榜「后期涨停」推荐模型报告

> 标签 = T+1/T+2/T+3 任一涨停 · 数据 {dmin} ~ {dmax} · 个股技术 × 席位手法 × 行情研判 · 自我进化

## 核心指标

| 训练样本 | T+3涨停率 | 时间外AUC | 随机AUC | GB时间外AUC | Top20命中 |
|---|---|---|---|---|---|
| {meta['n']} | {meta['pos_rate']}% | {meta['auc_temporal']} | {meta['auc_random']} | {meta['auc_gb']} | {top20}% |

## 一、方法论

- **目标**：从龙虎榜个股中筛出**上榜后 3 个交易日内仍有涨停**的标的。标签取 T+1/T+2/T+3 任一收盘达涨停阈值（主板 10% / 双创 20% / 北交所 30%，-0.6% 容差）为正例。
- **特征三维**：① 个股技术（涨幅/换手/市值/净买/是否涨停/前3日透支/原因）② 席位手法（买方质量/家数/净比/游资占比/机构/北向/知名游资/低吸）③ 行情研判（题材主线/强度/涨停情绪/连板）。
- **验证**：逻辑回归（类别平衡 + 正则化搜索）+ GB 对照；含随机与时间外（按日期 80/20，测试集均为已可知标签的前瞻样本，杜绝未来泄漏）。
- **防泄漏**：席位质量分与题材主线均仅用「截至样本日期」已可观测信息（因果指数），规避全期统计造成的未来泄漏。

## 二、三维赢家共性

> 共 **{len(win)}** 只上榜后 3 日内再涨停（占 {meta['pos_rate']}%，基准 {base_rate:.1f}%）。最强共性：**位置 + 主线 + 资金主动**。

### 2.1 个股位置 / 行情研判

| 因子 | 赢家数 | T+3涨停率 |
|---|---|---|
{dim_table('LB_FLAG',[1,0],train,base_rate)}
{dim_table('IS_LIMIT_UP',[1,0],train,base_rate)}
{dim_table('THEME_MAIN',[1,0],train,base_rate)}
{dim_table('LOW_XI',[1,0],train,base_rate)}

| 前3日透支度 | 赢家数 | T+3涨停率 |
|---|---|---|
{bucket_table('PRE3_RET',[-999,0,10,20,35,999],['<0','0-10','10-20','20-35','≥35(过度炒作)'],train,base_rate)}

### 2.2 席位手法

| 因子 | 赢家数 | T+3涨停率 |
|---|---|---|
{dim_table('FAMOUS_YZ',[1,0],train,base_rate)}
{dim_table('HAS_INST',[1,0],train,base_rate)}
{dim_table('HAS_HK',[1,0],train,base_rate)}

| 买卖净比 | 赢家数 | T+3涨停率 |
|---|---|---|
{bucket_table('NET_BUY_RATIO',[0,0.4,0.55,0.7,1.01],['<0.4','0.4-0.55','0.55-0.7','≥0.7'],train,base_rate)}

> 反直觉：机构/北向参与反而**降低**后续涨停率（多借涨停出货）；**买卖净比 ≥ 0.7** 显著提升命中；知名游资单席贡献有限（拥挤度），但买方均值质量为正因子。

### 2.3 近一月赢家清单（Top45）

| 日期 | 代码 | 名称 | 涨幅% | 换手% | 净买亿 | 原因 | 题材 | 游资 | 机构 | 买方质量 | 净买比 | D1/D2/D3 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
{win_rows or '| — | — | — | — | — | — | — | — | — | — | — | — | — |'}

## 三、席位操作手法专题

基于 seats 构建 {n_seat} 个席位画像（上榜 ≥3 次），按手法分群：

| 风格 | 席位数 | 占比 |
|---|---|---|
{style_rows or '| — | — | — |'}

> **打板**型是最主流——专攻涨停确认与加速；**低吸**在大跌偏离榜介入；**接力**做连板换手。打板型优质席位介入的个股连板惯性最强。

### 3.1 高可信度打板席位 Top12

| 席位 | 上榜次数 | 买入亿 | 净买亿 | 单票均买万 | 打板率 | T5均值_s | T5胜率_s | 综评 |
|---|---|---|---|---|---|---|---|---|
{seat_rows or '| — | — | — | — | — | — | — | — | — |'}

{zy_md}

## 四、模型评估

- 时间外验证 AUC = **{meta['auc_temporal']}**，GB AUC = **{meta['auc_gb']}**，基准 {meta['temporal_base']}%。
- 推荐 TopN 命中：

| 档位 | 命中率 |
|---|---|
{top_rows or '| — | — |'}

> Top20 T+3 涨停率 **{top20}%**，约为基准的 **{_mult} 倍**。

## 五、评分卡系数（正 = 提升概率）

| 特征 | 系数 | Odds |
|---|---|---|
{coef_rows}

## 六、实战验证：时间外 Top20 vs 实际

> Top20 中 **{te_hit}/20** 只实际 T+3 涨停（命中 {round(te_hit/20*100) if te_hit else 0}%）。

| 日期 | 代码 | 名称 | 模型P | 实际 | 题材 | 涨停 | 游资 | 净买比 | D1/D2/D3 |
|---|---|---|---|---|---|---|---|---|---|
{verify_rows or '| 无时间外窗口数据 | — | — | — | — | — | — | — | — | — |'}

## 七、模型进化轨迹（自我优化）

> 每次 optimize 重训并与当前模型在**同一时间外测试集**上比较 AUC，不劣则版本 +1。模型随实际结果累积越来越贴合近期行情。

| 版本 | 时间 | 样本 | 时间外AUC | Top20 | 决策 | 说明 |
|---|---|---|---|---|---|---|
{evo_rows or '| 尚无进化记录（先运行 optimize） | — | — | — | — | — | — |'}

### 7.1 最近推荐验证

| 推荐日 | 推荐数 | T+1涨停 | T+3涨停 | T+3命中率 |
|---|---|---|---|---|
{ver_rows or '| 尚无验证记录（先运行 verify） | — | — | — | — |'}

## 八、每日买入策略

- **收盘后**：`python recommend.py` 输出当日 Top20 候选，存 recommend_日期.csv。
- **纳入观察条件**：P≥30% 且 题材主线 且 净买比≥0.55 且（涨停/连板/知名游资其一）且 前3日透支<38% 且 非纯机构主买。
- **回避**：纯机构主买 / 前3日透支≥38% / 高位连板≥5 / 科创创业涨停上榜。
- **风控**：T+1 不涨停即减仓，跌破上榜日收盘止损；市场涨停情绪<10% 停用。

> ⚠️ 基于历史龙虎榜统计回测，**不构成投资建议**。模型强势市命中更高、弱势市失效；席位质量分与题材主线已按因果窗口构建（消除未来泄漏），但样本量有限仍易受阶段行情影响；建议每个交易日运行 optimize 持续自我进化。
"""
    out = os.path.join(C.REPORT_ROOT, f"龙虎榜T+3涨停推荐模型报告-{date or dmax}.md")
    open(out, "w", encoding="utf-8").write(MD)
    print(f"[report] 已生成: {out}  ({len(MD)//1024}KB)  赢家 {len(win)} 席位 {n_seat}")
    return out


if __name__ == "__main__":
    import sys
    main(sys.argv[1] if len(sys.argv) >= 2 else None)