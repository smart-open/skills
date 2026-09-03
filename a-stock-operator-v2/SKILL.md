---
name: a-stock-operator-v2
description: |
  生成 A 股「行情复盘报告」与「个股诊断报告」（Markdown 文档，带日期，红涨绿跌，结论前置）。
  行情模式：市场全景（核心指数 / 情绪周期定位 / 连板 / 主线题材 / 政策 / 热点）+ 近一月板块轮动专题（日期列头 × 每日 Top7 板块、动态色标记轮动、全量标注涨幅% 与涨停数 ×N + 资金轮动四象限 + 板块多因子趋势榜）。
  情绪周期定位：基于「情绪温度计」（Model 04，温度+风险双维、五阶段、仓位建议）研判情绪阶段（冰点/启动/发酵/高潮/分歧）+ 短线操作建议 + 仓位参考；主线题材采用「动态热点发现引擎」（Model 01，五因子评分 + 每日动态 Top N，新热点自动纳入）+ 题材生命周期定位（Model 02，萌芽/启动/发酵/高潮/退潮五阶段 + 短线/中线策略）；板块轮动采用「资金轮动四象限」（Model 03，主线/接力/脉冲/退潮 + 轮动速度 + 扩散指数）与「板块趋势多因子」（Model 06，15日涨幅+5日动量+资金持续+涨停持续加权，标记启动/加速/减速/回落）。
  个股模式：单只个股六维诊断（评分 / SWOT / 估值 / 龙虎榜 / 筹码 / 关键价位）+ 最终诊断操作建议（渐变环形评分 + 关键价位双栏 + 操作策略 3 卡 + 避坑提示），卡片化、有层次。
  自包含：脚本全在技能目录内，相对路径免配置；产物（采集数据/过程脚本）默认写到**当前会话/工作目录**下的 `<cwd>/a-stock-operator-v2/` 子目录，**报告统一输出为 Markdown（带日期）写到 `<cwd>` 根目录**（`A_STOCK_WORK`/`A_STOCK_OUT` 可指定工程目录），不写回技能目录；「今日」默认真实交易日（--date 可覆盖），联网实时采集。
  加载后先让用户选择模式。适用：行情复盘、个股诊断、生成股票报告、板块轮动、情绪周期、短线/中线操作建议、重新生成报告。
agent_created: true
display_name: A股行情与个股报告生成器 v2
display_name_en: A-Share Market & Stock Report Generator v2
description_zh: A股行情复盘与个股诊断报告生成器（自包含 + 默认真实今日 + 双模式）
description_en: A-share market review and stock diagnosis report generator (self-contained, real-today default, dual-mode)
visibility: public
disable-model-invocation: false
---

# A股行情与个股报告生成器 v2（a-stock-operator-v2）


## 能力说明

本技能生成两份 **Markdown 报告**（带日期，红涨绿跌语义、结论前置、结构化列表/表格布局），输出到**当前会话根目录**：

- **行情分析模式**：市场全景复盘（核心指数 / 市场情绪 + **情绪周期定位** / 连板梯队 / 主线题材 / 重点政策消息 / 热点可持续板块）+ **近一月板块轮动**专题（日期为列头 × 每日 Top7 板块，动态色标记轮动轨迹，全量标注涨幅% 与涨停数 ×N，底部含颜色图例 + **资金轮动四象限** + **板块多因子趋势榜**）。
  - **情绪温度计（Model 04 · 短线择时）**：将情绪周期定位升级为「温度 + 风险」双维量化。**情绪温度**（0~100）由五因子合成——涨停家数 25% / 封板率 25% / 连板高度 20% / 连板家数（≥2 板）15% / 市场宽度（上涨占比）15%；**风险度**（0~100）由四因子合成——炸板率 30% / 亏钱效应（大面率+跌停强度）30% / 过热（高温+极端连板）20% / 背离（涨停多但宽度差或炸板高，连续梯度 0~100）20%。据此判定 冰点/启动/发酵/高潮/分歧 五阶段——**分歧阈值随温度滑动**（温度≥65 → 阈值 55、≤45 → 阈值 65、中间线性插值，温度越高越易分歧），并输出 0~10 成仓位区间建议（冰点 0-2 成 / 启动 2-3 成 / 发酵 4-6 成 / 高潮 3-5 成 / 分歧 2-4 成）。报告情绪卡渲染温度计（刻度含五档并**高亮当前阶段**）+ 风险条 + 8 指标（涨停/连板高度/连板家数/封板率/炸板率/跌停/涨跌家数/大面家数）+ **温度/风险因子分解条**（逐条标注权重% 与数值）+ 仓位建议 + **仓位进度条**（用 `position_min`/`position_max` 映射 0~10 成并高亮建议档位）；`emotion_{date}.json` 缺失时**优雅降级**为旧版 5 指标情绪卡。
  - **主线题材（贴合热点 · 动态引擎）**：由「动态热点发现引擎」实时聚类当日 Top N 热点（五因子加权：涨停家数 0.30 / 主力净流入 0.25 / 板块涨幅 0.15 / 连板高度 0.15 / 扩散度 0.15），**不再写死题材词典，新热点自动纳入**；配合「题材生命周期定位」标注每个热点的萌芽/启动/发酵/高潮/退潮阶段与短线/中线策略。
  - **资金轮动四象限（Model 03 · 短线择时）**：按「资金净流入 × 趋势一致性」把热点板块切入主线（流入+趋势一致）/ 接力（流入但未确认或新热点）/ 脉冲（流出但当日涨）/ 退潮（流出+转弱）四象限，输出轮动速度与扩散指数，辅助判断资金切换方向与快慢。
  - **板块多因子趋势榜（Model 06 · 中线选板块）**：对全量板块按 15 日涨幅 40% + 5 日动量 30% + 资金持续 20% + 涨停持续 10% 加权出 0~1 趋势分并排名，标记启动/加速/减速/回落状态，辅助判断板块趋势方向与持续性。
  - **个股诊断联动（L1）**：行情报告「个股推荐」卡片（07 章）在对应诊断报告 `{name}_个股诊断-{YYYY-MM-DD}.md` 存在时，自动把个股标题改为跳转链接，实现行情 → 个股诊断交叉导航；诊断报告缺失时优雅降级为纯文本标题。
- **个股诊断模式**：单只个股六维诊断（综合评分 / SWOT / 估值分情景 / 龙虎榜席位 / 筹码与股东结构 / 关键价位）+ **最终诊断操作建议**（渐变描边环形评分 + 关键价位止损/目标双栏 + 操作策略 3 卡：回踩观察/突破确认/回避情形 + 避坑提示警示卡），层次清晰、不堆积。

## 何时使用

- 用户说「行情复盘 / 生成行情报告 / 板块轮动 / 市场复盘」→ 行情模式
- 用户说「个股诊断 / 分析某只股票 / 操作建议」→ 个股模式
- 用户说「重新生成报告 / 两份都来」→ 两者

## 运行要求（自包含）

| 依赖 | 说明 |
|------|------|
| Python 3.12+ | 运行 `scripts/*.py`。任意 Python 3.12+ 解释器均可（系统 `python` / `python3` / `py`） |
| 脚本 | **本技能目录内** `scripts/*.py`（已相对化，`BASE` 由 `__file__` 自动推导，无需改路径） |
| 数据 | 采集/分析数据写到**当前会话/工作目录**下的 `<cwd>/a-stock-operator-v2/data/*.json`（行情 `market_{date}.json`、个股 `*_analysis.json`、轮动 `boards_15d.json` / `zt_15d.json` / `fund_15d.json`）；可用 `A_STOCK_WORK` 指定到某工程目录。**不写回技能目录** |
| 输出 | 生成的 **Markdown 报告写到当前会话/工作目录根**（`REPORT_ROOT` = 当前工作目录，可用环境变量 `A_STOCK_OUT` 指定到某工程目录），**不写回技能目录** |
| 联网 | 生成「今日真实数据」时需联网（东方财富 / 腾讯 / 新浪 / 同花顺公开接口）；已有数据可离线重跑 |

> **无需 `cd` 到特定目录**：脚本代码用 `BASE`（由 `__file__` 推导）定位技能根目录下的 `scripts/`；但**采集数据(data/)**默认写到 `<cwd>/a-stock-operator-v2/data`，**报告(Markdown)**默认写到 `<cwd>` 根目录（`DATA_DIR`=`<cwd>/a-stock-operator-v2/data`、`REPORT_ROOT`=`<cwd>`，可用 `A_STOCK_WORK`/`A_STOCK_OUT` 指向固定工程目录），技能库只保留代码、保持纯净。

## 第一步：模式选择（必做）

加载技能后，**先**用 `AskUserQuestion` 让用户选择：

- 问题：「要生成哪种报告？」
- 选项 1：**行情分析**（市场复盘 + 板块轮动）
- 选项 2：**个股诊断**（单只个股六维 + 操作建议）
- 选项 3：**两者都生成**

若用户在提问中已明确指定模式，则跳过选择直接进入对应流程。

> **个股诊断必须先收集输入**：选「个股诊断」或「两者都生成」时，先向用户索取 **① 股票全称 ② 股票代码**（两者至少提供一个，用于确定诊断目标），以及**③ 持仓成本价**（可选）。用 `AskUserQuestion` 一次问齐（成本价标注「可选」），不要凭空编造代码/名称。收集完成后再执行模式 B。

## 模式 A：行情分析

### A.1 数据采集（联网，生成真实今日数据时执行）
> **采集脚本依赖 `requests`**：若默认 `python` 未装 requests，请换用已装 requests 的 Python 3.12+ 解释器（下称 `py312`，任意环境，如 conda/venv/系统 Python 均可）。生成脚本无此依赖，任意 `python` 均可。
>
> **推荐入口——全流程管线，每次运行都取最新数据**：
> ```bash
> py312 scripts/collect_all.py            # 采集 → 健康检查 → 模型 → 报告，一条命令全流程
> py312 scripts/collect_all.py --only-check   # 仅健康检查（诊断数据是否缺失/过期）
> py312 scripts/collect_all.py --no-models    # 只采集+检查，不跑模型和报告
> py312 scripts/collect_all.py --skip collect_news.py,collect_fund_15d.py  # 跳过指定步骤
> ```
> 默认**全量重采**（本地已有文件不跳过），模型与报告仅在数据校验全过后执行——报告永远基于当日新数据，杜绝「重采数据但忘跑模型」的陈旧报告。
> 健康检查 15 项严格校验（任一不过 → 汇总失败清单 + exit 1，停止生成）+ 2 类警告（不阻断）：严格项 = market 关键项（指数/涨停池/炸板池/涨跌家数/时间戳/数据日期一致）、news 条数、boards_15d 覆盖与新鲜度、zt_15d 有效天数与新鲜度、fund_15d 覆盖与新鲜度、recommend 当日新鲜；警告项 = market 部分项沿用同日早间值（stale_kept，按日分键无跨日污染）、采集步骤部分失败（产物仍新鲜则继续，避免盘中偶发风控导致永远无法完成）。新鲜度基准 = 目标日往前最近工作日（盘中容忍 T-1，收盘后应为 T 日）。
>
> 逐个采集（collect_all 内部即按此顺序执行，通常无需单跑）：
```bash
cd <你的工作目录>   # 产物(data/、Markdown 报告)落在这里，不写回技能目录
py312 scripts/collect_data.py          # 东财：指数/涨停池/炸板池/跌停池/涨跌家数/热因 -> market_{今日}.json（合并模式：失败项沿用旧值，关键项缺失 exit 1）
py312 scripts/collect_v2.py            # 新浪：涨跌家数(含涨跌幅榜)+行业板块 东财资金 -> 合并进 market_{今日}.json（空结果不合并）
py312 scripts/collect_news.py          # 东财快讯 -> news_{今日}.json（空结果不覆盖旧文件，exit 1）
py312 scripts/collect_boards_15d.py    # 东财行业+概念全量板块近 15 日涨幅（键=东财板块名；东财失败兜底同花顺板块指数；成功率<30% 视为风控不落盘）
py312 scripts/collect_zt_15d.py        # 15 日涨停池按板块关键词匹配涨停数（关键词=THS 14 短名+全量板块名+当日热点；boards 缺失按工作日日历兜底）
py312 scripts/collect_fund_15d.py      # 东财板块主力资金流历史（行业+概念近15日）-> fund_15d.json（东财失败轮换备用 UT + 同花顺指数涨跌幅作资金方向代理；成功率<30% 不落盘）
py312 scripts/recommend.py --date 20260818  # 个股推荐（首板突破 + 放量热点）-> recommend_{date}.json（market 缺失/涨停池空/日期不符 → exit 1；新浪停牌行安全跳过）
python scripts/gen_hot_sectors.py --date 20260818       # 动态热点发现引擎（Model 01）-> hot_sectors_{date}.json
python scripts/gen_theme_lifecycle.py --date 20260818   # 题材生命周期定位（Model 02）-> theme_lifecycle_{date}.json
python scripts/gen_emotion_cycle.py --date 20260818     # 情绪温度计（Model 04）-> emotion_{date}.json（依赖 market_{date}.json）
```
> **「今日」= 真实交易日**：各采集/生成脚本默认 `datetime.now()`，`--date YYYYMMDD` 可覆盖。`collect_boards_15d.py` / `collect_zt_15d.py` 为滚动采集（自动取最新），无需传日期。
> 联网采集可能遇 429/断连/东财 IP 风控（push2/push2his 全系列 `RemoteDisconnected`，约 20 小时自动解除，换网络即刻恢复）。**失败不再污染数据**：空结果不落盘/不覆盖旧文件、失败项沿用旧值（`stale_kept` 标记）、关键项缺失 exit 1；重跑 `collect_all.py` 或换网络后再跑即可。`collect_news.py` 盘中采集只含开盘至今快讯、收盘后采集才完整。

### A.2 生成报告
```bash
cd <你的工作目录>   # 产物(data/、Markdown 报告)落在这里，不写回技能目录
python scripts/gen_hot_sectors.py --date 20260818     # 必须先跑：产出 hot_sectors_{date}.json
python scripts/gen_theme_lifecycle.py --date 20260818 # 依赖上一步：产出 theme_lifecycle_{date}.json
python scripts/gen_rotation_v2.py --date 20260818    # P1：资金四象限 + 多因子趋势 -> rotation_{date}.json（供轮动章节引用）
python scripts/gen_emotion_cycle.py --date 20260818 # P2：情绪温度计 -> emotion_{date}.json（供情绪卡引用，缺失回退旧情绪卡）
python scripts/generate_report_v3.py --date 20260818 # 生成 9 章（含 07 近一月板块轮动：轮动矩阵 + 资金四象限 + 多因子趋势榜）-> 行情复盘-2026-08-18.md（<cwd> 根目录）
```
> **动态热点引擎是主线题材/热点板块的数据源**：`generate_report_v3.py` 会尝试读取 `hot_sectors_{date}.json` 与 `theme_lifecycle_{date}.json`；若文件缺失则相应章节降级为空（旧版写死的 20+ 题材词典已移除），故生成报告前必须保证这两个文件已产出。
> **P2 情绪温度计数据源**：`generate_report_v3.py` 优先读取 `emotion_{date}.json`（`gen_emotion_cycle.py` 产出）渲染温度计/风险条/8 指标/仓位建议；若该文件缺失则**优雅降级**为旧版硬编码 5 指标情绪卡，不报错。
> **P1 资金四象限/多因子趋势数据源**：`generate_report_v3.py` 内置 `_build_rotation_md()` 读取 `rotation_{date}.json`（`gen_rotation_v2.py` 产出）渲染「板块轮动矩阵 + 资金轮动四象限 + 板块多因子趋势榜」；若该文件缺失则相应小节降级为「数据暂缺」，不报错。

### A.3 坑点
- **数据链路依赖（已防御化）**：`generate_report_v3.py` 依赖 `market_{date}.json` 与 `recommend_{date}.json`，但**均已做缺失兜底**：`sectors` 兼容 dict/list 两种结构、`breadth.top_gainers/top_losers` 缺失时降级为空表、`recommend` 缺失时不报错。`collect_data.py`（东财）产出不含正确的 `sectors` 涨跌幅榜与 `top_gainers`，**建议仍跑 `collect_v2.py`（新浪）合并**以补齐板块与涨跌幅榜数据（不跑不再崩溃，但相应章节数据为空）。
- **政策章节依赖 `news_{date}.json`**：05 章「重点政策/消息」由 `generate_report_v3.py` 内的 `build_policies()` 从 `data/news_{date}.json`（`collect_news.py` 产出）按关键词加权筛选 Top5。**若无该文件则 05 章为空**（不报错），跑一次 `collect_news.py --date {date}` 即可补齐。
- **定性内容已数据驱动**：verdict 定调 / 副标题 / 主线题材 / 热点板块 / 推荐 pick / 板块轮动 均从 `market` / `recommend` / `boards_15d` / `rotation` 数据自动生成，**换日期重跑即自动更新，无需手改脚本**。
- **板块池数据源**：热点板块池不再来自 `fund_rank`（那是「个股」主力资金排行，误当板块会用股票名污染聚类），现改为 `sectors`（东财行业/概念板块，含每板块 `main_net_yi`）+ `hybk`（涨停股行业板块）补充，`fund_rank` 仅极端降级兜底。`collect_v2.py` 的新浪行业板块改存 `sina_sectors` 键、仅当 `sectors` 缺失时兜底填充，不再覆盖以保住板块级资金流。
- **资金维度历史来源 `fund_15d.json`**：`gen_theme_lifecycle.py`（生命周期资金正天数）与 `gen_rotation_v2.py`（趋势一致性/资金持续性）优先读 `data/fund_15d.json`（`collect_fund_15d.py` 采集，键=东财板块名，与 hot_sectors 动态名对齐）；缺失时优雅降级为涨停/涨幅代理（已验证不崩溃）。
- **命名桥接**：`boards_15d.json` 由 `collect_boards_15d.py` 动态采集东财「行业+概念」全量板块（键=东财板块名），新热点自动纳入涨幅历史，无覆盖上限；`zt_15d.json` 关键词 = THS 14 短名（`_common.py` 单一来源）+ boards 全量板块名 + 当日热点名。历史遗留的同花顺短名数据经 `bridge_ths_name()` 桥接兼容。`generate_report_v3.py` 的轮动矩阵 ×N 涨停数查询已做双路兜底（东财名直查 → 短名桥接）。

## 模式 B：个股诊断（用户提供 股票全称 / 代码 / 成本价）

### B.0 收集用户输入（必做，先于一切生成）
向用户索取（用 `AskUserQuestion` 一次问齐）：
- **股票全称**（如「通鼎互联」）—— 与代码**至少提供一个**
- **股票代码**（如 `002491`）—— 与全称**至少提供一个**
- **持仓成本价**（如 `18.50`）—— **可选**

> **「全称 / 代码至少提供一个」的目的**：用于**确定诊断目标**——脚本据此定位该股票的分析 JSON（`data/{name|code}_analysis.json`，缺省回退通鼎样例）、生成动态文件名与标题。
> 若用户只给了其一（如仅代码 002491），可直接继续；**不要编造**另一个。若两者都未给，必须回问。
> **成本价（可选）的使用定位**：若有，主要应用于 **07「最终诊断操作建议」章节**（在综合评级卡展示「持仓成本 / 持仓盈亏%」），**不进入基础报告 01–06 章**。基础报告只做客观诊断，持仓视角单列在操作建议。
> 个股分析数据（六维/SWOT/龙虎榜/价位/操作建议等）来自一个**个股分析 JSON**（`--data`）。默认样例为 `data/tdhl_analysis.json`（通鼎互联）。**换成别的股票时，必须提供该股票的分析 JSON**（结构见 `data/tdhl_analysis.json`）；脚本不会凭空生成其他股票的真实分析。

### B.1 数据准备（可选）
若目标股票的分析 JSON 缺失 / 需刷新，按对应采集脚本更新后写入该 JSON。已有数据时跳过。
```bash
cd <你的工作目录>   # 产物(data/、Markdown 报告)落在这里，不写回技能目录
# 通鼎互联样例（默认）：data/tdhl_analysis.json + data/tdhl_kline.json
# 其他股票：自备 <名称>_analysis.json（结构见下方「分析 JSON 字段结构」）
```

**分析 JSON 字段结构**（`data/tdhl_analysis.json` 为权威样例，换股时照此构建；字段名必须与脚本读取点一致）：
```jsonc
{
  "name": "通鼎互联", "code": "002491", "exchange": "SZ",
  "asof": "2026-08-14",                        // 数据基准日（页脚/标题标注）
  "tags": ["光纤光缆", "光通信", "AI算力基建"],    // 顶部标签（hero tag-row）
  "price_panel": {                             // 价格面板 KPI（基础报告 overview）
    "price": "19.65", "chg": "+3.75%", "up": true,   // up 决定涨跌颜色
    "market_cap": "225亿", "pb": "8.9x", "pb_note": "PB(行业2.4)",
    "turnover": "9.98%", "amount": "55.4亿"
  },
  "dims": [                                    // 六维诊断（score 0-10；weight 合计 100）
    {"code":"D1","name":"宏观行业","score":8,"weight":15,
     "detail":"...","verdict":"..."}, ...
  ],
  "swot": {"S":[...],"W":[...],"O":[...],"T":[...]},
  "scenarios": [                               // 估值分情景
    {"name":"悲观","cond":"...","val":"60–90 亿","color":"#2bd99f"}, ...
  ],
  "scenarios_note": "估值情景补充说明",
  "lhb": {                                     // 龙虎榜（04 章）
    "date":"2026-08-12","desc":"上榜原因",
    "buy_total":"3.61 亿","sell_total":"1.82 亿","net":"1.79 亿",
    "inst_net":"+403 万","north_net":"-4869 万","seat_net":"+2.24 亿",
    "buy":[["席位名","+金额","类型","#颜色"],...],   // 四元组 [名, 额, 类, 色]
    "sell":[["席位名","-金额","类型","#颜色"],...]
  },
  "chip": {                                    // 筹码结构（05 章）
    "holders":"14.46万","holders_pct":"+59.35%","holders_note":"环比 +59.35% ↑ 散户涌入",
    "avg_cost":"18.29元","profit":"81.73%","profit_note":"获利盘抛压存在",
    "top10":"45.6%","top10_note":"通鼎集团 31.51%"
  },
  "holders": [["股东名","持股","性质"],...],        // 前十大股东表（三元组）
  "holders_note": "股东结构解读",
  "levels": {                                  // 关键价位（06 章，[标签, 价位] 二元组）
    "support": [["MA10","17.02"],["MA20","16.39"],["近60日低点","13.44"]],
    "resist":  [["MA60","22.68"],["MA120","18.74"],["近250日高点","39.71"]]
  },
  "risk_06": [["风险标题","风险说明"],...],        // 06 章避坑提示（二元组）
  "advice": {                                  // 07 章「最终诊断操作建议」
    "score":"5.15", "rating":"中性观望",           // score 驱动环形 conic-gradient 百分比
    "inds":  [["仓位参考","5-10%","小仓位观察"],...],  // 指标三元组 [标签, 值, 说明]
    "stop":  [["技术止损","16.39","MA20 破位离场"],...], // 止损位三元组
    "target":[["第一压力","22.68","MA60 · +15.4%"],...], // 目标位三元组
    "strats":[                                     // 操作策略卡（tag=="强制" 渲染为红色回避卡）
      {"no":"①","name":"回踩观察","tag":"谨慎型",
       "lines":[["条件","回踩 MA20 16.39 附近缩量止跌"],
                ["操作","小仓位试探建仓"],["止损","跌破 15.50 离场"]]}, ...
    ],
    "risk_items":[["游资主导","说明"],...]           // 07 章避坑提示（红色警示卡，二元组）
  }
}
```
> **字段名必须精确匹配**：脚本按上述 key 直接读取（如 `d['weight']`、`d['detail']`、`d['verdict']`、`s['cond']`、`s['color']`、`s['val']`、`chip['holders_note']`、`levels['support']` 为 `[标签, 价位]` 二元组列表、`advice['inds']/['stop']/['target']` 为 `[标签, 值, 说明]` 三元组列表、`strats[].lines` 为 `[标签, 文本]` 二元组）。`score` 直接驱动环形进度（`conic-gradient(... {score*10}% ...)`），`price_panel.price` 用于成本价盈亏计算（`(现价-成本)/成本`）。换股只需照此构建 JSON，无需改代码。

### B.2 生成报告（参数化）
```bash
cd <你的工作目录>   # 产物(data/、Markdown 报告)落在这里，不写回技能目录
python scripts/generate_stock_report.py \
  --name 通鼎互联 --code 002491 --exchange SZ \
  --data data/tdhl_analysis.json --kline data/tdhl_kline.json --date 2026-08-18 \
  --cost 18.50
```
- `--name/--code/--exchange`：来自 B.0 用户输入，**两者至少提供一个**（脚本会校验，缺失则报错）；`--data/--kline` 缺省时按 name/code 智能推导 `data/{name|code}_*.json`，再回退通鼎样例。
- `--date`：默认真实今日（`datetime.now()`），用于文件名与页脚标注（报告文件名与页脚日期用 `YYYY-MM-DD` 格式）。
- `--cost`：**可选**，持仓成本价。传入则在 07「最终诊断操作建议」的综合评级处追加「持仓成本 / 盈亏%」一行；不给则不显示持仓盈亏。
- 输出为 **Markdown**（`{name}_个股诊断-{YYYY-MM-DD}.md`，落到 `<cwd>` 根目录），文件名、标题、代码、持仓盈亏全部随参数动态生成。

### B.3 坑点（关键！）
- 个股报告已**一次生成完整 7 章**（含 07「最终诊断操作建议」），无需再跑单独的 advice 后处理脚本。
- 持仓成本价盈亏 = `(现价 - 成本) / 成本`，现价取分析 JSON 内 `price_panel.price`，故盈亏随数据基准日计算。

## 通用坑点与修复（必读）

1. **数据采集两步不可省**：`collect_data.py`（东财）产出缺少正确 `sectors`/涨跌幅榜，**必须接 `collect_v2.py`（新浪）合并**。
2. **重跑前先备份成品**：`cp 行情复盘-{date}.md 行情复盘-{date}.md.bak`，避免覆盖后丢失内容。
3. **报告为原生 Markdown**：行情与个股报告均已重写为原生 Markdown（表格/列表/引用块），**无 HTML/CSS 残留**，无需再跑任何 HTML 后处理或 CSS 注入脚本。

## 校验清单（每次生成后执行）

```python
def verify(fn, kws):
    t = open(fn, encoding='utf-8').read()
    print('MD 行数', len(t.splitlines()), '| 空行', t.count('\n\n'))
    for k in kws:
        print('  ', k, k in t)
# 行情：verify(f'行情复盘-{date}.md', ['近一月板块轮动','轮动节奏解读','资金轮动四象限'])
# 个股：verify(f'{name}_个股诊断-{date}.md', ['最终诊断操作建议','避坑提示','观察评级','持仓成本' if cost else '综合评级'])
```

## 文件索引

| 用途 | 路径 |
|------|------|
| 共享工具库 | `scripts/_common.py`（BASE / load_json / dump_json / dump_json_guard / read_text / write_text / safe_float + 公共常量：八色配色 / 情绪五阶段与配色 / 温度与风险因子权重与标签，以及 today_ymd、latest_trade_day、seal_break_rates、trend_tag、THS_BOARD_KEYWORDS、bridge_ths_name 工具函数，供全部脚本复用） |
| 一键采集+健康检查 | `scripts/collect_all.py`（按序编排 6 个采集脚本 + 14 项完整性/新鲜度校验，失败汇总 + exit 1；`--only-check` 仅检查、`--skip` 跳步） |
| 行情基础采集（东财） | `scripts/collect_data.py`（指数/涨停/炸板/跌停/涨跌家数/热因；合并模式：失败项沿用旧值 stale_kept，关键项缺失 exit 1） |
| 行情补充采集（新浪+资金） | `scripts/collect_v2.py`（涨跌幅榜/行业板块/主力资金，合并进 market；空结果不合并） |
| 政策快讯采集 | `scripts/collect_news.py`（东财快讯 -> `news_{date}.json`，供 05 章筛选；空结果不覆盖） |
| 板块 15 日数据采集 | `scripts/collect_boards_15d.py`（东财行业+概念全量板块，自动最新；东财失败兜底同花顺板块指数 `d.10jqka.com.cn` 收盘价算涨跌幅；成功率<30% 不落盘） |
| 涨停 15 日数据采集 | `scripts/collect_zt_15d.py`（按板块关键词匹配） |
| 板块资金流历史采集 | `scripts/collect_fund_15d.py`（东财行业+概念板块近15日主力净流入 -> `fund_15d.json`；东财失败轮换备用 UT + 同花顺指数涨跌幅作资金方向代理，urllib 无 requests 依赖） |
| 个股推荐计算 | `scripts/recommend.py`（首板突破 + 放量热点） |
| 动态热点发现引擎 | `scripts/gen_hot_sectors.py`（Model 01，板块池来自 `sectors` 东财板块+`hybk` 补充，五因子评分 -> `hot_sectors_{date}.json`） |
| 题材生命周期定位 | `scripts/gen_theme_lifecycle.py`（Model 02，多日涨停趋势 + `fund_15d` 真实资金趋势 + 阈值随市场相对化，五阶段 -> `theme_lifecycle_{date}.json`） |
| 资金轮动四象限 + 趋势多因子 | `scripts/gen_rotation_v2.py`（Model 03 + Model 06，接入 `fund_15d` 真实资金持续性与动态资金分母，启动/加速/减速/回落标签 -> `rotation_{date}.json`） |
| 情绪温度计 | `scripts/gen_emotion_cycle.py`（Model 04，温度+风险双维 + factors 因子分解 + 分歧阈值温度滑动 + 背离连续化 -> `emotion_{date}.json`） |
| 行情基础报告 | `scripts/generate_report_v3.py`（情绪卡优先读 `emotion_{date}.json`，渲染温度/风险因子分解条 + 五档刻度高亮 + 仓位进度条(position_min/max) + 推荐跳转，缺失回退硬编码；内置 `_build_rotation_md()` 渲染 07 近一月板块轮动章节——轮动矩阵 + 资金四象限 + 多因子趋势榜，引用 `rotation_{date}.json`，缺失降级「数据暂缺」） |
| 个股基础报告 | `scripts/generate_stock_report.py`（含 07 操作建议章节，`--cost` 可选） |
> 以下 `data/…` 指**运行时当前工作目录**下 `<cwd>/a-stock-operator-v2/data`，`*.md` 报告指 `<cwd>` 根目录下的产物（主流程脚本已通过 `_common.DATA_DIR`/`REPORT_ROOT` 落到 `<cwd>`；见「运行要求」），不再落在技能安装目录。
| 个股分析数据(样例) | `data/tdhl_analysis.json`（六维/SWOT/龙虎榜/价位/操作建议，通鼎互联） |
| 个股 K 线数据 | `data/tdhl_kline.json`（含 closes 列表，供个股报告扩展使用） |
| 输出·行情复盘 | `行情复盘-{YYYY-MM-DD}.md`（= `<cwd>` 根目录） |
| 输出·个股诊断 | `{name}_个股诊断-{YYYY-MM-DD}.md`（= `<cwd>` 根目录，文件名随名称/日期动态生成） |

> **脚本清单已清理**：`scripts/` 仅保留生产主流程脚本（上表所列）。历史一次性/废弃脚本（`generate_report.py` / `generate_report_v2.py`、`gen_heatmap*.py`、`rewrite_advice.py`/`_v3`/`_v4`、`gen_policy_section.py`、`gen_recommend_section.py`、`gen_sector_rotation*.py`、`fix_rotation_section.py`、`gen_advice_section.py`、`polish_dots.py`、`polish_reports.py`，以及被 `collect_boards_15d.py` 取代的 `collect_sector_15d.py`/`collect_sector_15d_v2.py`/`collect_sector_month.py`）均已删除，产物路径也已统一外置（见「运行要求」），不再写回技能安装目录。`collect_news.py` 为现行生产脚本（政策快讯采集，被 `collect_all` 调度），保留。

## 数据基准说明

- **「今日」= 真实交易日**：所有采集/生成脚本默认取 `datetime.now()` 的日期；`--date YYYYMMDD` 可指定任意交易日覆盖（行情数据文件用 `YYYYMMDD`，如 `market_20260818.json`；**报告文件名用 `YYYY-MM-DD`**，如 `行情复盘-2026-08-18.md`）。
- `collect_boards_15d.py` / `collect_zt_15d.py` 为**滚动采集**（自动取最新 N 日），无日期参数。
- `market_{date}.json`、`recommend_{date}.json` 等数据文件名用 `YYYYMMDD` 随日期动态生成；`行情复盘-{YYYY-MM-DD}.md`、`{name}_个股诊断-{YYYY-MM-DD}.md` 等报告文件名用 `YYYY-MM-DD` 随日期动态生成。
- 若仅做**离线重跑 / 美化 / 换股诊断**，无需联网，直接用现有 `data/` 内数据即可（`--date` 指向已存在数据的日期）。
- **日日自动生成（数据驱动）**：verdict 定调、副标题、主线题材、热点板块、推荐 pick、轮动节奏解读均已数据驱动，`--date` 换日期重跑即自动更新，**无需手改脚本**。唯一例外是 05 章「重点政策/消息」依赖 `news_{date}.json`（`collect_news.py` 按关键词规则筛选 Top5，语义质量弱于人工精选，属可接受的自动化折中）；轮动表头日期为**降序**（最近交易日排最前）。

## 合规

报告末尾固定声明：「以上基于公开行情整理，仅供复盘参考，不构成投资建议。」
