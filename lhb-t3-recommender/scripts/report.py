# -*- coding: utf-8 -*-
"""生成龙虎榜 T+3 涨停推荐模型 HTML 报告(深色金融终端风)
读取: model_meta_t3.json / model_data_t3.csv / model_coef_t3.csv / seat_profile.csv / model_history.json / verify_history.csv
含: 方法论 / 赢家共性 / 席位手法专题 / 模型评估 / 评分卡 / 实战验证 / 进化轨迹 / 买入策略
用法: python report.py [DATE]   (DATE 缺省=最新, 用于命名输出)
"""
import os, json, glob
import numpy as np
import pandas as pd
import joblib
import _common as C

CSS = """
<style>
body{background:#0d1117;color:#c9d1d9;font-family:'Microsoft YaHei',Segoe UI,sans-serif;margin:0;padding:28px 34px;line-height:1.62}
h1{color:#e6edf3;font-size:25px;border-bottom:2px solid #30363d;padding-bottom:12px;margin-bottom:6px}
h2{color:#58a6ff;font-size:19px;margin-top:36px;border-left:4px solid #58a6ff;padding-left:10px}
h3{color:#d2a8ff;font-size:15px;margin-top:20px}
.card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:15px 19px;margin:13px 0}
.warn{background:#2d1f1f;border:1px solid #f85149;color:#ffb3ab;border-radius:8px;padding:12px 16px;margin:12px 0}
.ok{background:#0f2417;border:1px solid #3fb950;color:#a6f0c6;border-radius:8px;padding:12px 16px;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:13px;margin:10px 0}
th,td{border:1px solid #30363d;padding:6px 9px;text-align:right}
th{background:#21262d;color:#8b949e}
td:nth-child(2),td:nth-child(3){text-align:left}
.red{color:#ff4d4f;font-weight:600}.grn{color:#3fb950}.blu{color:#58a6ff}.mut{color:#8b949e}.ylw{color:#e3b341}
code{background:#21262d;padding:2px 6px;border-radius:4px;color:#ffa657}
.kpi{display:inline-block;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:9px 16px;margin:5px}
.kpi b{color:#58a6ff;font-size:21px;display:block}
</style>"""


def pct(s):
    return f"{s*100:.1f}%" if pd.notna(s) else "—"


def cell(v, hi=None):
    c = "red" if (hi is not None and v >= hi) else "mut"
    return f"<td class='{c}'>{v:.1f}%</td>"


def dim_table(col, order, train, base_rate):
    rows = ""
    for v in order:
        sub = train[train[col] == v]
        rate = sub["T3_ZT"].mean() * 100 if len(sub) else 0
        rows += f"<tr><td style='text-align:left'>{'是' if v == 1 else '否'}</td><td>{len(sub)}</td>{cell(rate, base_rate)}</tr>"
    return rows


def bucket_table(col, edges, labels, train, base_rate):
    rows = ""
    for e0, e1, lab in zip(edges[:-1], edges[1:], labels):
        m = (train[col] >= e0) & (train[col] < e1)
        rate = train[m]["T3_ZT"].mean() * 100 if m.sum() else 0
        rows += f"<tr><td style='text-align:left'>{lab}</td><td>{int(m.sum())}</td>{cell(rate, base_rate)}</tr>"
    return rows


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

    # 赢家清单(近一月)
    recent = win[win["TRADE_DATE"] >= (pd.Timestamp(dmax) - pd.Timedelta(days=30)).strftime("%Y-%m-%d")].sort_values("TRADE_DATE")
    win_rows = ""
    for _, r in recent.head(45).iterrows():
        win_rows += (f"<tr><td>{r['TRADE_DATE']}</td><td>{r['CODE']}</td><td style='text-align:left;font-weight:600'>{r['NAME']}</td>"
                     f"<td class='{'red' if r['CHANGE_RATE'] >= 9.5 else ''}'>{r['CHANGE_RATE']:.1f}</td>"
                     f"<td>{r['TURNOVERRATE']:.1f}</td><td>{r['NET_YI']:.2f}</td><td style='text-align:left'>{r['REASON']}</td>"
                     f"<td class='{'blu' if r['THEME_MAIN'] else 'mut'}'>{'主线' if r['THEME_MAIN'] else '—'}</td>"
                     f"<td>{'Y' if r['FAMOUS_YZ'] else '—'}</td><td>{'Y' if r['HAS_INST'] else '—'}</td>"
                     f"<td>{r['BUYER_TOP_SCORE']:.1f}</td><td>{r['NET_BUY_RATIO']:.2f}</td>"
                     f"<td class='red'>{pct(r['D1'])}/{pct(r['D2'])}/{pct(r['D3'])}</td></tr>")

    coef_rows = ""
    if len(coef):
        for _, r in coef.iterrows():
            color = "red" if r["coef"] > 0 else "grn"
            coef_rows += f"<tr><td style='text-align:left'>{r['feature']}</td><td class='{color}'>{r['coef']:+.3f}</td><td class='{color}'>{r['odds']:.2f}</td></tr>"
    else:
        coef_rows = "<tr><td colspan=3 class='mut'>无系数文件</td></tr>"

    tt = meta.get("temporal_top", {})
    top_rows = "".join(f"<tr><td>Top{k.strip('top')}</td><td class='red'>{v}%</td></tr>" for k, v in tt.items())

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
                hit = r["T3_ZT"] == 1; color = "red" if hit else "grn"
                verify_rows += (f"<tr><td>{r['TRADE_DATE']}</td><td>{r['CODE']}</td><td style='text-align:left;font-weight:600'>{r['NAME']}</td>"
                                f"<td class='blu'>{r['P']*100:.1f}%</td><td class='{color}'>{'✓涨停' if hit else '✗未涨'}</td>"
                                f"<td class='{'blu' if r['THEME_MAIN'] else 'mut'}'>{'主线' if r['THEME_MAIN'] else '—'}</td>"
                                f"<td>{'Y' if r['IS_LIMIT_UP'] else '—'}</td><td>{'Y' if r['FAMOUS_YZ'] else '—'}</td>"
                                f"<td>{r['NET_BUY_RATIO']:.2f}</td><td class='red'>{pct(r['D1'])}/{pct(r['D2'])}/{pct(r['D3'])}</td></tr>")
            te_hit = int(te.head(20)["T3_ZT"].sum())

    # 席位手法专题
    style_rows = seat_rows = ""
    if len(seat):
        style_cnt = seat["风格"].value_counts()
        style_rows = "".join(f"<tr><td style='text-align:left'>{k}</td><td>{v}</td><td>{round(v/len(seat)*100,1)}%</td></tr>" for k, v in style_cnt.items())
        sd = seat[(seat["样本可信度"] == "高") & (seat["风格"] == "打板")].sort_values("综评", ascending=False).head(12)
        for _, r in sd.iterrows():
            seat_rows += (f"<tr><td style='text-align:left'>{r['OPERATEDEPT_NAME']}</td><td>{r['上榜次数']}</td>"
                          f"<td>{r['买入总额亿']:.1f}</td><td>{r['净买入亿']:.1f}</td><td>{r['单票均买万']:.0f}</td>"
                          f"<td>{r['打板率']:.1f}</td><td class='{'red' if pd.notna(r['T5均值_s']) else 'mut'}'>{r['T5均值_s']:.1f}</td>"
                          f"<td>{r['T5胜率_s']:.1f}</td><td class='ylw'>{r['综评']:.1f}</td></tr>")

    zy_match = seat[seat["OPERATEDEPT_NAME"].str.contains("紫阳东路")] if len(seat) else pd.DataFrame()
    zy = zy_match.iloc[0] if len(zy_match) else None
    zy_html = ""
    if zy is not None:
        zy_html = (f"<div class='card'><b>紫阳东路（国泰海通武汉紫阳东路，重点关注的席位）</b><br>"
                   f"风格：<span class='blu'>{zy['风格']}</span> ｜ 三个月上榜 <b>{int(zy['上榜次数'])}</b> 次 ｜ 买入 <b>{zy['买入总额亿']:.1f}</b> 亿 ｜ 净买入 {zy['净买入亿']:.1f} 亿 ｜ 单票均买 {zy['单票均买万']:.0f} 万<br>"
                   f"打板率 <b>{zy['打板率']:.1f}%</b> ｜ T+5均值(收缩) <b>{zy['T5均值_s']:.1f}%</b> ｜ T+5胜率(收缩) <b>{zy['T5胜率_s']:.1f}%</b> ｜ 综评 <b class='ylw'>{zy['综评']:.1f}</b><br>"
                   f"<span class='mut'>典型重仓打板游资，是「龙头确认/加速器」而非埋伏者；当其出现在<b>主线+连板+优质买方共振</b>个股时作为强度确认信号。</span></div>")

    # 进化轨迹
    evo_rows = ""
    if os.path.exists(C.HISTORY_PATH):
        hist = json.load(open(C.HISTORY_PATH, encoding="utf-8"))
        for h in hist[-10:]:
            evo_rows += (f"<tr><td>v{h['version']}</td><td>{h['date']}</td><td>{h['n']}</td>"
                         f"<td class='{'blu' if h['accepted'] else 'mut'}'>{h['auc_temporal']}</td>"
                         f"<td class='red'>{h['top20']}%</td><td>{'✓接受' if h['accepted'] else '✗保留'}</td>"
                         f"<td style='text-align:left' class='mut'>{h['note']}</td></tr>")
    # 最近验证
    ver_rows = ""
    if os.path.exists(C.VERIFY_PATH):
        vh = pd.read_csv(C.VERIFY_PATH, dtype={"DATE": str}).tail(10)
        for _, r in vh.iterrows():
            ver_rows += (f"<tr><td>{r['DATE']}</td><td>{r['推荐数']}</td><td>{int(r['T1涨停数'])}</td>"
                         f"<td>{int(r['T3涨停数'])}</td><td class='red'>{r['T3命中率']}%</td></tr>")

    n_seat = len(seat)
    HTML = f"""<!doctype html><html lang='zh'><head><meta charset='utf-8'><title>龙虎榜 T+3 涨停推荐模型</title>{CSS}</head><body>
<h1>龙虎榜「后期涨停」推荐模型<br><span class='mut' style='font-size:13px'>标签=T+1/T+2/T+3 任一涨停 · 数据 {dmin}~{dmax} · 个股技术 × 席位手法 × 行情研判 · 自我进化</span></h1>
<div class='card'>
  <div class='kpi'>训练样本<b>{meta['n']}</b></div><div class='kpi'>T+3涨停率<b>{meta['pos_rate']}%</b></div>
  <div class='kpi'>时间外AUC<b>{meta['auc_temporal']}</b></div><div class='kpi'>随机AUC<b>{meta['auc_random']}</b></div>
  <div class='kpi'>GB时间外AUC<b>{meta['auc_gb']}</b></div><div class='kpi'>Top20命中<b>{tt.get('top20','—')}%</b></div>
</div>
<h2>一、方法论</h2>
<div class='card'><b>目标</b>：从龙虎榜个股中筛出<span class='red'>上榜后3个交易日内仍有涨停</span>的标的。标签取 T+1/T+2/T+3 任一收盘达涨停阈值(主板10%/双创20%/北交所30%, -0.6%容差)为正例。<br>
<b>特征三维</b>：①个股技术(涨幅/换手/市值/净买/是否涨停/前3日透支/原因) ②席位手法(买方质量/家数/净比/游资占比/机构/北向/知名游资/低吸) ③行情研判(题材主线/强度/涨停情绪/连板)。<br>
<b>验证</b>：逻辑回归(类别平衡+正则化搜索)+GB对照；含随机与时间外(按日期80/20, 测试集均为已可知标签的前瞻样本, 杜绝未来泄漏)。<br>
<b>防泄漏</b>：席位质量分与题材主线均仅用「截至样本日期」已可观测信息(因果指数), 规避全期统计造成的未来泄漏。</div>

<h2>二、三维赢家共性</h2>
<div class='ok'>共 <b>{len(win)}</b> 只上榜后3日内再涨停(占 {meta['pos_rate']}%, 基准 {base_rate:.1f}%)。最强共性:<b>位置+主线+资金主动</b>。</div>
<h3>2.1 个股位置 / 行情研判</h3>
<table><thead><tr><th>因子</th><th>赢家数</th><th>T+3涨停率</th></tr></thead><tbody>
{dim_table('LB_FLAG',[1,0],train,base_rate)}{dim_table('IS_LIMIT_UP',[1,0],train,base_rate)}{dim_table('THEME_MAIN',[1,0],train,base_rate)}{dim_table('LOW_XI',[1,0],train,base_rate)}
</tbody></table>
<table><thead><tr><th>前3日透支度</th><th>赢家数</th><th>T+3涨停率</th></tr></thead><tbody>{bucket_table('PRE3_RET',[-999,0,10,20,35,999],['<0','0-10','10-20','20-35','≥35(过度炒作)'],train,base_rate)}</tbody></table>
<h3>2.2 席位手法</h3>
<table><thead><tr><th>因子</th><th>赢家数</th><th>T+3涨停率</th></tr></thead><tbody>{dim_table('FAMOUS_YZ',[1,0],train,base_rate)}{dim_table('HAS_INST',[1,0],train,base_rate)}{dim_table('HAS_HK',[1,0],train,base_rate)}</tbody></table>
<table><thead><tr><th>买卖净比</th><th>赢家数</th><th>T+3涨停率</th></tr></thead><tbody>{bucket_table('NET_BUY_RATIO',[0,0.4,0.55,0.7,1.01],['<0.4','0.4-0.55','0.55-0.7','≥0.7'],train,base_rate)}</tbody></table>
<div class='mut'>反直觉: 机构/北向参与反而<span class='grn'>降低</span>后续涨停率(多借涨停出货); <b>买卖净比≥0.7</b>显著提升命中; 知名游资单席贡献有限(拥挤度), 但买方均值质量为正因子。</div>
<h3>2.3 近一月赢家清单(Top45)</h3>
<table><thead><tr><th>日期</th><th>代码</th><th>名称</th><th>涨幅%</th><th>换手%</th><th>净买亿</th><th>原因</th><th>题材</th><th>游资</th><th>机构</th><th>买方质量</th><th>净买比</th><th>D1/D2/D3</th></tr></thead><tbody>{win_rows or '<tr><td colspan=13 class=mut>—</td></tr>'}</tbody></table>

<h2>三、席位操作手法专题</h2>
<div class='card'>基于 seats 构建 {n_seat} 个席位画像(上榜≥3次), 按手法分群:</div>
<table><thead><tr><th>风格</th><th>席位数</th><th>占比</th></tr></thead><tbody>{style_rows or '<tr><td colspan=3 class=mut>—</td></tr>'}</tbody></table>
<div class='ok'><b>打板</b>型是最主流——专攻涨停确认与加速; <b>低吸</b>在大跌偏离榜介入; <b>接力</b>做连板换手。打板型优质席位介入的个股连板惯性最强。</div>
<h3>3.1 高可信度打板席位 Top12</h3>
<table><thead><tr><th>席位</th><th>上榜次数</th><th>买入亿</th><th>净买亿</th><th>单票均买万</th><th>打板率</th><th>T5均值_s</th><th>T5胜率_s</th><th>综评</th></tr></thead><tbody>{seat_rows or '<tr><td colspan=9 class=mut>—</td></tr>'}</tbody></table>
{zy_html}

<h2>四、模型评估</h2>
<div class='card'>时间外验证 AUC=<b class='blu'>{meta['auc_temporal']}</b>, GB AUC=<b class='blu'>{meta['auc_gb']}</b>, 基准 {meta['temporal_base']}%。推荐 TopN 命中:<br>{top_rows or '<span class=mut>—</span>'}
<div class='ok'>Top20 T+3涨停率 <b>{tt.get('top20','—')}%</b>, 约为基准的 <b>{round(float(tt.get('top20',0))/max(float(meta['temporal_base']),1e-9),1)} 倍</b>。</div></div>

<h2>五、评分卡系数(红=提升概率)</h2>
<table><thead><tr><th>特征</th><th>系数</th><th>Odds</th></tr></thead><tbody>{coef_rows}</tbody></table>

<h2>六、实战验证: 时间外 Top20 vs 实际</h2>
<div class='card'>Top20 中 <b class='red'>{te_hit}/20</b> 只实际 T+3 涨停(命中 {round(te_hit/20*100) if te_hit else 0}%)。</div>
<table><thead><tr><th>日期</th><th>代码</th><th>名称</th><th>模型P</th><th>实际</th><th>题材</th><th>涨停</th><th>游资</th><th>净买比</th><th>D1/D2/D3</th></tr></thead><tbody>{verify_rows or '<tr><td colspan=10 class=mut>无时间外窗口数据</td></tr>'}</tbody></table>

<h2>七、模型进化轨迹(自我优化)</h2>
<div class='card'>每次 optimize 重训并与当前模型在<b>同一时间外测试集</b>上比较 AUC, 不劣则版本+1。模型随实际结果累积越来越贴合近期行情。</div>
<table><thead><tr><th>版本</th><th>时间</th><th>样本</th><th>时间外AUC</th><th>Top20</th><th>决策</th><th>说明</th></tr></thead><tbody>{evo_rows or '<tr><td colspan=7 class=mut>尚无进化记录(先运行 optimize)</td></tr>'}</tbody></table>
<h3>7.1 最近推荐验证</h3>
<table><thead><tr><th>推荐日</th><th>推荐数</th><th>T+1涨停</th><th>T+3涨停</th><th>T+3命中率</th></tr></thead><tbody>{ver_rows or '<tr><td colspan=5 class=mut>尚无验证记录(先运行 verify)</td></tr>'}</tbody></table>

<h2>八、每日买入策略</h2>
<div class='card'><b>收盘后</b>: <code>python recommend.py</code> 输出当日 Top20 候选, 存 recommend_日期.csv。<br>
<b>纳入观察条件</b>: P≥30% 且 题材主线 且 净买比≥0.55 且 (涨停/连板/知名游资其一) 且 前3日透支<38% 且 非纯机构主买。<br>
<b>回避</b>: 纯机构主买 / 前3日透支≥38% / 高位连板≥5 / 科创创业涨停上榜。 <b>风控</b>: T+1不涨停即减仓, 跌破上榜日收盘止损; 市场涨停情绪<10% 停用。</div>

<div class='warn'>⚠️ 基于历史龙虎榜统计回测, <b>不构成投资建议</b>。模型强势市命中更高、弱势市失效; 席位质量分与题材主线已按因果窗口构建(消除未来泄漏), 但样本量有限仍易受阶段行情影响; 建议每个交易日运行 optimize 持续自我进化。</div>
</body></html>"""
    out = os.path.join(C.RUNTIME, f"龙虎榜T+3涨停推荐模型报告_{date or dmax}.html")
    open(out, "w", encoding="utf-8").write(HTML)
    print(f"[report] 已生成: {out}  ({len(HTML)//1024}KB)  赢家 {len(win)} 席位 {n_seat}")
    return out


if __name__ == "__main__":
    import sys
    main(sys.argv[1] if len(sys.argv) >= 2 else None)