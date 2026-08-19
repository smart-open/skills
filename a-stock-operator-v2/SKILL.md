---
name: a-stock-operator-v2
description: |
  生成 A 股「行情复盘报告」与「个股诊断报告」（金融数据终端深色主题 HTML，红涨绿跌，结论前置）。
  行情模式：市场全景（指数 sparkline / 情绪周期定位 / 连板 / 主线题材 / 政策 / 热点）+ 近一月板块轮动专题（日期列头 × 每日 Top7 板块、动态色标记轮动、全量标注涨幅% 与涨停数 ×N + 资金轮动四象限 + 板块多因子趋势榜）。
  情绪周期定位：基于「情绪温度计」（Model 04，温度+风险双维、五阶段、仓位建议）研判情绪阶段（冰点/启动/发酵/高潮/分歧）+ 短线操作建议 + 仓位参考；主线题材采用「动态热点发现引擎」（Model 01，五因子评分 + 每日动态 Top N，新热点自动纳入）+ 题材生命周期定位（Model 02，萌芽/启动/发酵/高潮/退潮五阶段 + 短线/中线策略）；板块轮动采用「资金轮动四象限」（Model 03，主线/接力/脉冲/退潮 + 轮动速度 + 扩散指数）与「板块趋势多因子」（Model 06，15日涨幅+5日动量+资金持续+涨停持续加权，标记启动/加速/减速/回落）。
  个股模式：单只个股六维诊断（评分 / SWOT / 估值 / 龙虎榜 / 筹码 / 关键价位）+ 最终诊断操作建议（渐变环形评分 + 关键价位双栏 + 操作策略 3 卡 + 避坑提示），卡片化、有层次。
  自包含：脚本/数据/输出全在技能目录内，相对路径免配置；「今日」默认真实交易日（--date 可覆盖），联网实时采集。
  加载后先让用户选择模式。适用：行情复盘、个股诊断、生成股票报告、板块轮动、情绪周期、短线/中线操作建议、重新生成报告。
agent_created: true
version: 1.17.0
display_name: A股行情与个股报告生成器 v2
display_name_en: A-Share Market & Stock Report Generator v2
description_zh: A股行情复盘与个股诊断报告生成器（自包含 + 默认真实今日 + 双模式）
description_en: A-share market review and stock diagnosis report generator (self-contained, real-today default, dual-mode)
visibility: public
disable-model-invocation: false
---

# A股行情与个股报告生成器 v2（a-stock-operator-v2）

> 自包含版本（v1.14.0）：全部采集/组装/加工脚本与数据资源已打包进本技能目录，脚本用相对路径（`BASE = 脚本自身位置的技能根目录`）免配置；「今日」默认取真实交易日（`datetime.now()`，`--date` 可覆盖），联网实时采集；行情报告定性内容（定调/主线/热点/推荐/轮动节奏）已数据驱动，**换日期重跑即自动更新**。新增「情绪周期定位」（短线辅助）与「板块中线趋势榜」（中线辅助）。**P0（v1.6.0）上线「动态热点发现引擎」（Model 01）与「题材生命周期定位」（Model 02）**：主线题材/热点板块不再写死，改为五因子（涨停家数/主力资金/涨幅/连板高度/扩散度）实时聚类每日 Top N 热点，并对每个热点判定萌芽→启动→发酵→高潮→退潮五阶段与短线/中线策略。**P1（v1.7.0）上线「资金轮动四象限」（Model 03）与「板块趋势多因子」（Model 06）**：按「资金净流入 × 趋势一致性」将热点板块切分为主线/接力/脉冲/退潮四象限（附轮动速度与扩散指数），并用 15 日涨幅 40% + 5 日动量 30% + 资金持续 20% + 涨停持续 10% 加权出趋势分、标记启动/加速/减速/回落。**P2（v1.8.0）上线「情绪温度计」（Model 04）**：将情绪周期定位升级为「温度 + 风险」双维量化——温度由五因子（涨停家数 25% + 封板率 25% + 连板高度 20% + 连板家数 15% + 市场宽度 15%）合成 0~100，风险由四因子（炸板率 30% + 亏钱效应 30% + 过热 20% + 背离 20%）合成 0~100，据此判定冰点/启动/发酵/高潮/分歧五阶段并给出 0~10 成仓位区间建议；报告情绪卡升级为温度计 + 风险条 + 8 指标 + 仓位建议。**P3（v1.9.0）健壮性全面加固与代码去重**：修复 17 项审查问题（P0×5 崩溃级 / P1×6 数据一致性 / P2×6 可维护性）——① 统一 `sectors` 结构（dict/list 归一化）并兼容 `leader_name`/`leader` 键，只跑第一步采集不再崩溃；② `recommend_{date}.json`、`index_klines.json` 等缺失时优雅降级；③ 空 `indexes` 列表 `max()` 用 `default` 兜底；④ 个股诊断报告全字段 `.get()` 防御化；⑤ 新增 `scripts/_common.py` 共享工具（BASE / load_json / dump_json / read_text / write_text / safe_float / sparkline），统一用 `with` 关闭文件句柄（消除 15+ 处句柄泄漏）并消除 BASE/safe_float/sparkline 多处重复定义；⑥ 情绪阈值常量化、生命周期「高潮/发酵」区间去重、轮动每日 Top7 缓存等。采集/生成脚本已做健壮性防御：单个数据项采集失败时报告**优雅降级**（空章节）而非崩溃。**P4（v1.10.0）情绪周期精细化 + 个股诊断联动（E1/E2/L1）**：① E1——情绪卡新增「温度因子 · 权重加权」与「风险因子 · 权重加权」两组分解条（温度五因子 25/25/20/15/15、风险四因子 30/30/20/20，逐条标注权重% 与数值）；② E2——情绪温度计刻度补全为「冰点/启动/发酵/高潮/分歧」五档并**高亮当前阶段**（`.gs-on`）；③ L1——个股推荐卡片在对应诊断报告存在时自动注入「查看个股诊断 →」跳转链接（`output/{name}_个股诊断_{date}.html`），无诊断报告时优雅降级为纯文本标题。**P5（v1.11.0）分歧阈值滑动 + 仓位进度条（E3/E4）**：① E3——分歧风险阈值由三段式硬阈值（55/60/65）改为**温度滑动线**（温度≥65 → 55、温度≤45 → 65、中间线性插值），温度越高越易触发分歧，消除边缘跳跃；背离因子由二元跳变（0/60/55）改为**连续梯度**（宽度背离与炸板背离分别连续计分 0~100 取较大者，越严重背离分越高）；② E4——情绪卡新增**仓位进度条**，用 `position_min`/`position_max` 映射 0~10 成区间并在轨道上高亮建议档位（`position_min/max` 缺失时优雅降级为纯文本仓位）。**P6（v1.12.0）提取重复常量与硬编码（P2 低优先级收尾）**：将跨脚本重复的常量与公式集中到 `scripts/_common.py` 单一来源——① 配色常量（`UP_COLOR`/`DOWN_COLOR`/`WARN_COLOR`/`MUTED_COLOR`/`GOLD_COLOR`/`ACC_COLOR`/`ACC2_COLOR`/`BOARD_FALLBACK_COLOR` 八色），报告 CSS `:root` 调色板改为由 Python 常量插值渲染，消除 Python 逻辑与 CSS 两处各写一套调色板；② 情绪周期五阶段 `EMOTION_STAGES` 与阶段配色 `EMOTION_STAGE_COLORS`；③ 温度/风险因子权重 `TEMPERATURE_W`/`RISK_W` 与因子标签 `TEMP_FACTOR_LABELS`/`RISK_FACTOR_LABELS`；④ 工具函数 `today_ymd()`（统一 `--date` 默认值）与 `seal_break_rates(total_up, total_zb)`（统一封板率/炸板率公式，消除 gen_hot_sectors / gen_rotation_v2 / gen_emotion_cycle / generate_report_v3 四处重复实现）。已接入 Model 01/02/03/04/06 与主报告脚本，端到端验证无误。**P7（v1.13.0）贴合热点·行情轮动的资金维度升级**：① 新增 `scripts/collect_fund_15d.py`——从东财 `push2his` 板块资金流日线接口采集近 15 日「行业+概念」板块主力净流入历史，落地 `data/fund_15d.json`（`{板块名: {日期: 主力净流入亿}}`），为题材生命周期（Model 02）、资金轮动四象限（Model 03）+ 板块多因子（Model 06）提供真实资金趋势维度，取代原先的「涨幅代理」；② 修正「板块池数据源」错误——`gen_hot_sectors.py` 此前误把 `fund_rank`（个股主力资金）当作板块池，现改为优先从 `sectors`（东财行业/概念板块，含每板块 `main_net_yi` 资金流）构建板块池，`hybk`（涨停股行业板块）补充、`fund_rank` 仅极端降级兜底，热点名与资金流全部来自真实板块；③ `collect_v2.py` 不再用新浪行业板块覆盖东财板块资金流，新浪数据改存 `sina_sectors` 键、仅当 `sectors` 缺失时兜底，保住板块级 `main_net_yi`；④ `generate_report_v3.py` 板块涨幅榜对 dict/list 两种 `sectors` 结构统一按涨幅排序；⑤ 趋势状态标签统一为 `启动/加速/减速/回落`（`trend_tag`），修正「反转」歧义。**P8（v1.14.0）命名桥接·补齐历史涨停/涨幅维度**：修复「动态热点名（东财板块名，如 CPO概念/机器人概念）与历史数据短名（同花顺，如 CPO/机器人）匹配不上」的系统性偏差——① 在 `_common.py` 新增 `THS_BOARD_KEYWORDS`（14 同花顺短名 × 匹配关键词，单一来源）与 `bridge_ths_name()`（东财名 → 同花顺短名）；② `collect_zt_15d.py` 改为复用该单一来源（消除本地重复字典）；③ `gen_theme_lifecycle.py`（Model 02）的涨停趋势/涨幅趋势经桥接对齐，动态热点不再退化为「单点估算」；④ `gen_rotation_v2.py`（Model 03/06）四象限的涨停/涨幅趋势一致性、趋势榜的资金持续性经桥接取到真实 `fund_15d` 资金流（此前 `name in fund_map` 对同花顺短名恒为 False、资金持续性永远走涨幅代理）。至此「热点发现（Model 01）→ 生命周期（Model 02）→ 资金轮动（Model 03）→ 趋势多因子（Model 06）」的涨停/涨幅/资金三维历史全部对齐到动态热点名。**P9（v1.15.0）短线赚钱效应 + 双权重 + 全量板块覆盖**：① 新增「赚钱效应」温度因子（昨日涨停池今日晋级率，权重 20%，`collect_zt_15d.py` 产出 `zt_pool_15d.json`）；② `collect_boards_15d.py` 重写为动态采集东财「行业+概念」全量板块近 15 日涨幅历史（键=东财板块名，消除原 14 同花顺板块覆盖上限，新热点自动纳入）；③ 个股六维诊断新增短线/中线双权重（`DIM_SHORT_W`/`DIM_MID_W` + `dim_weight()`），报告按持仓周期切换评分口径。**P10（v1.16.0）采集链路全面加固（防失败/防旧数据）**：① 空数据保护——所有采集脚本统一 `dump_json_guard()`，请求全失败时不再写空 `{}` 覆盖好数据（保留旧文件并 exit 1）；② `collect_data.py` 改合并模式——本次失败项沿用旧文件值（`stale_kept` 标记），重跑不再挤掉上次成功数据；`breadth` 分页中断/全失败视为异常（交新浪兜底）；③ `collect_zt_15d.py` 关键词动态化（THS 14 短名 + boards_15d 全板块名 + 当日热点名），boards 缺失时按工作日日历兜底回溯 15 日；④ 新增 `scripts/collect_all.py` 一键编排 7 个采集脚本 + 15 项健康检查（完整性/新鲜度/步骤失败，任何关键产物缺失或过期 → 汇总报告 + exit 1，杜绝静默生成空报告）；⑤ 修复 `gen_rotation_columns.py` ×N 涨停数桥接 bug（东财板块名直查 `zt_15d` 同花顺短名恒为 0，现经 `bridge_ths_name()` 兜底）。**P11（v1.17.0）健壮性二轮加固 + 全流程管线（每次取最新）**：① `collect_all.py` 升级为全流程入口——「采集 → 16 项严格健康检查 + 2 类警告 → 模型 → 报告」一条命令，默认全量重采（本地已有文件不跳过），模型/报告仅在数据校验全过后执行，杜绝「重采数据但忘跑模型」的陈旧报告；新增 `--no-models` 选项，`--skip` 兼容模型脚本；健康检查新增 market 数据日期一致（trade_date==TD）与 recommend 当日新鲜两项严格校验，stale_kept（同日早间值）与步骤级失败降为警告（产物新鲜度才是唯一闸门，避免盘中偶发风控导致管线永远无法完成）；② `recommend.py` 加固——market 缺失/涨停池空/数据日期不符早退 exit 1（避免无效网络请求与空推荐）、新浪涨幅榜停牌行 float 解析安全跳过（原 `float(None)` 崩溃风险）、行字段 `.get()` 防御、腾讯 K 线单次重试、新浪首页失败显式告警；③ 模型脚本空结果不落盘——`gen_hot_sectors`（board_scores 空 exit 1）、`gen_theme_lifecycle`（hot_sectors 空 exit 1）、`gen_rotation_v2`（热点+趋势榜均空 exit 1），防止上游失败时空文件覆盖旧结果；④ 数据日期校验——`gen_hot_sectors`/`recommend` 对 market 内 trade_date 与目标日不符直接拒绝，`gen_emotion_cycle` 给出旧数据警告；⑤ `gen_hot_sectors` 涨停池行按 code/name 有效性过滤 + 全字段 `.get()` 防御。

## 能力说明

本技能生成两份深色「金融数据终端」风格 HTML 报告（红涨绿跌、结论前置、卡片化布局）：

- **行情分析模式**：市场全景复盘（核心指数 sparkline / 市场情绪 + **情绪周期定位** / 连板梯队 / 主线题材 / 重点政策消息 / 热点可持续板块）+ **近一月板块轮动**专题（日期为列头 × 每日 Top7 板块，动态色标记轮动轨迹，全量标注涨幅% 与涨停数 ×N，底部含颜色图例 + **资金轮动四象限** + **板块多因子趋势榜**）。
  - **情绪温度计（Model 04 · 短线择时）**：将情绪周期定位升级为「温度 + 风险」双维量化。**情绪温度**（0~100）由五因子合成——涨停家数 25% / 封板率 25% / 连板高度 20% / 连板家数（≥2 板）15% / 市场宽度（上涨占比）15%；**风险度**（0~100）由四因子合成——炸板率 30% / 亏钱效应（大面率+跌停强度）30% / 过热（高温+极端连板）20% / 背离（涨停多但宽度差或炸板高，连续梯度 0~100）20%。据此判定 冰点/启动/发酵/高潮/分歧 五阶段——**分歧阈值随温度滑动**（温度≥65 → 阈值 55、≤45 → 阈值 65、中间线性插值，温度越高越易分歧），并输出 0~10 成仓位区间建议（冰点 0-2 成 / 启动 2-3 成 / 发酵 4-6 成 / 高潮 3-5 成 / 分歧 2-4 成）。报告情绪卡渲染温度计（刻度含五档并**高亮当前阶段**）+ 风险条 + 8 指标（涨停/连板高度/连板家数/封板率/炸板率/跌停/涨跌家数/大面家数）+ **温度/风险因子分解条**（逐条标注权重% 与数值）+ 仓位建议 + **仓位进度条**（用 `position_min`/`position_max` 映射 0~10 成并高亮建议档位）；`emotion_{date}.json` 缺失时**优雅降级**为旧版 5 指标情绪卡。
  - **主线题材（贴合热点 · 动态引擎）**：由「动态热点发现引擎」实时聚类当日 Top N 热点（五因子加权：涨停家数 0.30 / 主力净流入 0.25 / 板块涨幅 0.15 / 连板高度 0.15 / 扩散度 0.15），**不再写死题材词典，新热点自动纳入**；配合「题材生命周期定位」标注每个热点的萌芽/启动/发酵/高潮/退潮阶段与短线/中线策略。
  - **资金轮动四象限（Model 03 · 短线择时）**：按「资金净流入 × 趋势一致性」把热点板块切入主线（流入+趋势一致）/ 接力（流入但未确认或新热点）/ 脉冲（流出但当日涨）/ 退潮（流出+转弱）四象限，输出轮动速度与扩散指数，辅助判断资金切换方向与快慢。
  - **板块多因子趋势榜（Model 06 · 中线选板块）**：对全量板块按 15 日涨幅 40% + 5 日动量 30% + 资金持续 20% + 涨停持续 10% 加权出 0~1 趋势分并排名，标记启动/加速/减速/回落状态，辅助判断板块趋势方向与持续性。
  - **个股诊断联动（L1）**：行情报告「个股推荐」卡片（07 章）在对应诊断报告 `output/{name}_个股诊断_{date}.html` 存在时，自动把个股标题改为跳转链接并追加「查看个股诊断 →」按钮，实现行情 → 个股诊断交叉导航；诊断报告缺失时优雅降级为纯文本标题。
- **个股诊断模式**：单只个股六维诊断（综合评分 / SWOT / 估值分情景 / 龙虎榜席位 / 筹码与股东结构 / 关键价位）+ **最终诊断操作建议**（渐变描边环形评分 + 关键价位止损/目标双栏 + 操作策略 3 卡：回踩观察/突破确认/回避情形 + 避坑提示警示卡），层次清晰、不堆积。

## 何时使用

- 用户说「行情复盘 / 生成行情报告 / 板块轮动 / 市场复盘」→ 行情模式
- 用户说「个股诊断 / 分析某只股票 / 操作建议」→ 个股模式
- 用户说「重新生成报告 / 两份都来」→ 两者

## 运行要求（自包含）

| 依赖 | 说明 |
|------|------|
| Python 3.12+ | 运行 `scripts/*.py`。可用系统 `python`，或 `C:/Users/tianw/AppData/Local/Programs/Python/Python312/python.exe` |
| 脚本 | **本技能目录内** `scripts/*.py`（已相对化，`BASE` 由 `__file__` 自动推导，无需改路径） |
| 数据 | **本技能目录内** `data/*.json`（行情 `market_{date}.json`、个股 `tdhl_*.json`、轮动 `boards_15d.json` / `zt_15d.json`、指数 `index_klines.json`） |
| 输出 | **本技能目录内** `output/*.html` |
| 联网 | 生成「今日真实数据」时需联网（东方财富 / 腾讯 / 新浪 / 同花顺公开接口）；已有数据可离线重跑 |

> **无需 `cd` 到特定目录**：脚本用 `BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))` 定位技能根目录，任意位置运行皆可。建议 `cd` 到技能目录以简化相对引用。

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
> **采集脚本依赖 `requests`**：默认 `python`（WorkBuddy 托管 3.13）未装 requests，请用系统 Python 3.12：`C:/Users/tianw/AppData/Local/Programs/Python/Python312/python.exe`（下称 `py312`）。生成脚本无此依赖，任意 `python` 均可。
>
> **推荐入口（v1.17.0）——全流程管线，每次运行都取最新数据**：
> ```bash
> py312 scripts/collect_all.py            # 采集 → 健康检查 → 模型 → 报告，一条命令全流程
> py312 scripts/collect_all.py --only-check   # 仅健康检查（诊断数据是否缺失/过期）
> py312 scripts/collect_all.py --no-models    # 只采集+检查，不跑模型和报告
> py312 scripts/collect_all.py --skip collect_news.py,collect_fund_15d.py  # 跳过指定步骤
> ```
> 默认**全量重采**（本地已有文件不跳过），模型与报告仅在数据校验全过后执行——报告永远基于当日新数据，杜绝「重采数据但忘跑模型」的陈旧报告。
> 健康检查 16 项严格校验（任一不过 → 汇总失败清单 + exit 1，停止生成）+ 2 类警告（不阻断）：严格项 = market 关键项（指数/涨停池/炸板池/涨跌家数/时间戳/数据日期一致）、news 条数、boards_15d 覆盖与新鲜度、zt_15d 有效天数与新鲜度、fund_15d 覆盖与新鲜度、指数 K 线、recommend 当日新鲜；警告项 = market 部分项沿用同日早间值（stale_kept，按日分键无跨日污染）、采集步骤部分失败（产物仍新鲜则继续，避免盘中偶发风控导致永远无法完成）。新鲜度基准 = 目标日往前最近工作日（盘中容忍 T-1，收盘后应为 T 日）。
>
> 逐个采集（collect_all 内部即按此顺序执行，通常无需单跑）：
```bash
cd C:/Users/tianw/.workbuddy/skills/a-stock-operator-v2
py312 scripts/collect_data.py          # 东财：指数/涨停池/炸板池/跌停池/涨跌家数/热因 -> market_{今日}.json（合并模式：失败项沿用旧值，关键项缺失 exit 1）
py312 scripts/collect_v2.py            # 新浪：涨跌家数(含涨跌幅榜)+行业板块 东财资金 -> 合并进 market_{今日}.json（空结果不合并）
py312 scripts/collect_news.py          # 东财快讯 -> news_{今日}.json（空结果不覆盖旧文件，exit 1）
py312 scripts/collect_boards_15d.py    # 东财行业+概念全量板块近 15 日涨幅（键=东财板块名；成功率<30% 视为风控不落盘）
py312 scripts/collect_zt_15d.py        # 15 日涨停池按板块关键词匹配涨停数（关键词=THS 14 短名+全量板块名+当日热点；boards 缺失按工作日日历兜底）
py312 scripts/collect_fund_15d.py      # 东财板块主力资金流历史（行业+概念近15日）-> fund_15d.json（成功率<30% 不落盘）
py312 scripts/collect_index_klines.py  # 8 大指数近 30 日收盘价 -> index_klines.json（失败指数保留旧值）
py312 scripts/recommend.py --date 20260818  # 个股推荐（首板突破 + 放量热点）-> recommend_{date}.json（market 缺失/涨停池空/日期不符 → exit 1；新浪停牌行安全跳过）
python scripts/gen_hot_sectors.py --date 20260818       # 动态热点发现引擎（Model 01）-> hot_sectors_{date}.json
python scripts/gen_theme_lifecycle.py --date 20260818   # 题材生命周期定位（Model 02）-> theme_lifecycle_{date}.json
python scripts/gen_emotion_cycle.py --date 20260818     # 情绪温度计（Model 04）-> emotion_{date}.json（依赖 market_{date}.json）
```
> **「今日」= 真实交易日**：各采集/生成脚本默认 `datetime.now()`，`--date YYYYMMDD` 可覆盖。`collect_boards_15d.py` / `collect_zt_15d.py` / `collect_index_klines.py` 为滚动采集（自动取最新），无需传日期。
> 联网采集可能遇 429/断连/东财 IP 风控（push2/push2his 全系列 `RemoteDisconnected`，约 20 小时自动解除，换网络即刻恢复）。**v1.16.0 起失败不再污染数据**：空结果不落盘/不覆盖旧文件、失败项沿用旧值（`stale_kept` 标记）、关键项缺失 exit 1；重跑 `collect_all.py` 或换网络后再跑即可。`collect_news.py` 盘中采集只含开盘至今快讯、收盘后采集才完整。

### A.2 生成报告
```bash
cd C:/Users/tianw/.workbuddy/skills/a-stock-operator-v2
python scripts/gen_hot_sectors.py --date 20260818     # 必须先跑：产出 hot_sectors_{date}.json
python scripts/gen_theme_lifecycle.py --date 20260818 # 依赖上一步：产出 theme_lifecycle_{date}.json
python scripts/gen_rotation_v2.py --date 20260818    # P1：资金四象限 + 多因子趋势 -> rotation_{date}.json（供轮动章节引用）
python scripts/gen_emotion_cycle.py --date 20260818 # P2：情绪温度计 -> emotion_{date}.json（供情绪卡引用，缺失回退旧情绪卡）
python scripts/generate_report_v3.py --date 20260818 # 基础 8 章（主线题材/热点板块引用动态热点+生命周期，情绪卡引用温度计）-> output/行情复盘_{date}.html
python scripts/gen_rotation_columns.py --date 20260818 # 插入 07「近一月板块轮动」（资金四象限 + 多因子趋势榜，日期降序）并重编号 -> 9 章
```
> **动态热点引擎是主线题材/热点板块的数据源**：`generate_report_v3.py` 会尝试读取 `hot_sectors_{date}.json` 与 `theme_lifecycle_{date}.json`；若文件缺失则相应章节降级为空（旧版写死的 20+ 题材词典已移除），故生成报告前必须保证这两个文件已产出。
> **P2 情绪温度计数据源**：`generate_report_v3.py` 优先读取 `emotion_{date}.json`（`gen_emotion_cycle.py` 产出）渲染温度计/风险条/8 指标/仓位建议；若该文件缺失则**优雅降级**为旧版硬编码 5 指标情绪卡，不报错。
> **P1 资金四象限/多因子趋势数据源**：`gen_rotation_columns.py` 优先读取 `rotation_{date}.json`（`gen_rotation_v2.py` 产出）渲染「资金轮动四象限」卡片与「板块多因子趋势榜」；若该文件缺失则**优雅降级**为旧版「轮动节奏解读 4 卡片 + 15 日累计涨幅趋势榜」，不报错。

### A.3 坑点
- `gen_rotation_columns.py` 为**插入模式**：基础报告无轮动章节时，插入到「个股推荐」前并自动重编号 07→08、08→09。若基础已含 07 轮动则走替换模式，幂等安全。
- **数据链路依赖（已防御化）**：`generate_report_v3.py` 依赖 `market_{date}.json` 与 `recommend_{date}.json`、`index_klines.json`，但**均已做缺失兜底**（v1.9.0）：`sectors` 兼容 dict/list 两种结构、`breadth.top_gainers/top_losers` 缺失时降级为空表、`recommend`/`index_klines` 缺失时不报错。`collect_data.py`（东财）产出不含正确的 `sectors` 涨跌幅榜与 `top_gainers`，**建议仍跑 `collect_v2.py`（新浪）合并**以补齐板块与涨跌幅榜数据（不跑不再崩溃，但相应章节数据为空）。
- **政策章节依赖 `news_{date}.json`**：05 章「重点政策/消息」由 `generate_report_v3.py` 内的 `build_policies()` 从 `data/news_{date}.json`（`collect_news.py` 产出）按关键词加权筛选 Top5。**若无该文件则 05 章为空**（不报错），跑一次 `collect_news.py --date {date}` 即可补齐。
- **定性内容已数据驱动**：verdict 定调 / 副标题 / 主线题材 / 热点板块 / 推荐 pick / 轮动节奏解读 均从 `market` / `recommend` / `boards_15d` 数据自动生成，**换日期重跑即自动更新，无需手改脚本**。
- **动态热点色板**：`gen_rotation_columns.py` 的板块池与配色已动态化——优先读 `hot_sectors_{date}.json` 中的热点名+颜色，未覆盖的 `boards_15d.json` 板块自动补色（回退旧 14 板块固定色 CPO=红 / F5G=橙红 / 光纤=橙黄 / 铜缆高速连接=琥珀 / 液冷服务器=青 / 存储芯片=蓝绿 / 创新药=蓝 / CRO=浅蓝 / 减肥药=靛 / 重组蛋白=紫 / 稀土永磁=粉 / 青蒿素=绿 / 机器人=青绿 / 光刻机=洋红）。热点跑出越频繁，颜色越稳定；新热点自动获得颜色并纳入图例。
- **板块池数据源（v1.13.0 修正）**：热点板块池不再来自 `fund_rank`（那是「个股」主力资金排行，误当板块会用股票名污染聚类），现改为 `sectors`（东财行业/概念板块，含每板块 `main_net_yi`）+ `hybk`（涨停股行业板块）补充，`fund_rank` 仅极端降级兜底。`collect_v2.py` 的新浪行业板块改存 `sina_sectors` 键、仅当 `sectors` 缺失时兜底填充，不再覆盖以保住板块级资金流。
- **资金维度历史来源 `fund_15d.json`**：`gen_theme_lifecycle.py`（生命周期资金正天数）与 `gen_rotation_v2.py`（趋势一致性/资金持续性）优先读 `data/fund_15d.json`（`collect_fund_15d.py` 采集，键=东财板块名，与 hot_sectors 动态名对齐）；缺失时优雅降级为涨停/涨幅代理（已验证不崩溃）。
- **命名桥接（v1.14.0 引入，v1.15.0 起全量动态）**：`boards_15d.json` 由 `collect_boards_15d.py` 动态采集东财「行业+概念」全量板块（键=东财板块名），新热点自动纳入涨幅历史，无覆盖上限；`zt_15d.json` 关键词 = THS 14 短名（`_common.py` 单一来源）+ boards 全量板块名 + 当日热点名。历史遗留的同花顺短名数据经 `bridge_ths_name()` 桥接兼容。`gen_rotation_columns.py` 的 ×N 涨停数查询已做双路兜底（东财名直查 → 短名桥接）。
- **绝不**对 `<style>` 做 `.replace("{{","{").replace("}}","}")` 全局替换——这会破坏合法的嵌套结尾 `}}`（如 `@media{...{...}}`），导致 CSS 语法错误、布局全乱。如必须修双花括号，改用「重跑基础 + 重新插入」策略。

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
cd C:/Users/tianw/.workbuddy/skills/a-stock-operator-v2
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
cd C:/Users/tianw/.workbuddy/skills/a-stock-operator-v2
python scripts/generate_stock_report.py \
  --name 通鼎互联 --code 002491 --exchange SZ \
  --data data/tdhl_analysis.json --kline data/tdhl_kline.json --date 20260818
python scripts/rewrite_advice_v5.py \
  --path output/通鼎互联_个股诊断_20260818.html \
  --data data/tdhl_analysis.json --cost 18.50
```
- `--name/--code/--exchange`：来自 B.0 用户输入，**两者至少提供一个**（脚本会校验，缺失则报错）；`--data/--kline` 缺省时按 name/code 智能推导 `data/{name|code}_*.json`，再回退通鼎样例。
- `--date`：默认真实今日（`datetime.now()`），用于文件名与页脚标注。
- `--cost` 只传给 **v5（07 操作建议）**，基础报告不接收成本价（成本仅作用于操作建议章节）。不给 `--cost` 则不显示持仓盈亏。
- `--path`：基础报告输出路径（文件名格式 `{name}_个股诊断_{date}.html`，随名称/日期变化）。
- 输出文件名、报告标题、页眉代码、持仓盈亏全部随参数动态生成。

### B.3 坑点（关键！）
- **基础报告 `generate_stock_report.py` 重跑只产 6 章，不含 07 章节。** `rewrite_advice_v5.py` 已改造为「正则匹配替换优先 + footer 前插入兜底」，能稳定补建 07 章节，重跑可复现。
- v5 脚本**不再做任何全局 `{{`→`{` 替换**（避免破坏合法嵌套 CSS）；它只：① 清除旧 advice CSS 块（幂等）② 从 `--data` 的 `advice` 段构建 07 章节 ③ 注入 DV-CSS（带 `/*DV-CSS-START/END*/` 哨兵，幂等不膨胀）。
- 持仓成本价盈亏 = `(现价 - 成本) / 成本`，现价取分析 JSON 内 `price_panel.price`，故盈亏随数据基准日计算。
- **环形评分居中约束**：`.dv-ring` 必须为 `display:flex; flex-direction:column; align-items:center; justify-content:center`，否则 `5.15` 与 `/10` 会落回圆环左上角（曾因此返工）。`.dv-num` 额外 `margin-top:-6px` 做光学居中，改动此布局时务必保留。

## 通用坑点与修复（必读）

1. **CSS 双花括号失效 bug（最隐蔽）**：追加章节的脚本用**普通字符串**写 CSS 时，必须用单花括号 `{ }`。误用 `{{ }}`（那是 f-string 才需要的转义）会导致注入的 CSS **整段无效**，卡片布局「看起来没生效、文本堆积、没层次感」——这正是反复返工的根因。基础报告用 f-string（`{{` 正确转义为 `{`），正常。
2. **采集两步不可省**：`collect_data.py`（东财）产出缺少正确 `sectors`/涨跌幅榜，**必须接 `collect_v2.py`（新浪）合并**。
3. **重跑前先备份成品**：`cp output/xxx.html output/xxx.bak`，避免覆盖后丢失追加章节。
4. **CSS 注入幂等**：所有追加 CSS 必须带哨兵注释（`ROT-CSS-START/END`、`DV-CSS-START/END`），重复运行不膨胀。
5. **校验三件套**（每次生成后必须执行）：① div 开/闭数量相等 ② `<style>` 内 `{`/`}` 数量相等且无 `{{` 残留 ③ 关键章节/类存在。

## 校验清单（每次生成后执行）

```python
import re
def verify(fn, kws):
    t = open(fn, encoding='utf-8').read()
    st = t[t.find('<style>'):t.find('</style>')]
    o = len(re.findall(r'<div[^>]*>', t)); c = len(re.findall(r'</div>', t))
    print('div', o, c, '平衡' if o == c else '不平衡!',
          '| CSS', st.count('{'), st.count('}'), '双括号', st.count('{{'))
    for k in kws:
        print('  ', k, k in t)
# 行情：verify(f'output/行情复盘_{date}.html', ['近一月板块轮动','板块颜色图例','轮动节奏解读','bcell','×N'])
# 个股：verify(f'output/{name}_个股诊断_{date}.html', ['最终诊断操作建议','dv-hero','dv-risk','避坑提示','观察评级','持仓成本' if cost else 'dv-ind'])
```

## 文件索引

| 用途 | 路径 |
|------|------|
| 共享工具库 | `scripts/_common.py`（BASE / load_json / dump_json / dump_json_guard / read_text / write_text / safe_float / sparkline + 公共常量：八色配色 / 情绪五阶段与配色 / 温度与风险因子权重与标签，以及 today_ymd、latest_trade_day、seal_break_rates、trend_tag、THS_BOARD_KEYWORDS、bridge_ths_name 工具函数，供全部脚本复用） |
| 一键采集+健康检查 | `scripts/collect_all.py`（v1.16.0，按序编排 7 个采集脚本 + 15 项完整性/新鲜度校验，失败汇总 + exit 1；`--only-check` 仅检查、`--skip` 跳步） |
| 行情基础采集（东财） | `scripts/collect_data.py`（指数/涨停/炸板/跌停/涨跌家数/热因；合并模式：失败项沿用旧值 stale_kept，关键项缺失 exit 1） |
| 行情补充采集（新浪+资金） | `scripts/collect_v2.py`（涨跌幅榜/行业板块/主力资金，合并进 market；空结果不合并） |
| 政策快讯采集 | `scripts/collect_news.py`（东财快讯 -> `news_{date}.json`，供 05 章筛选；空结果不覆盖） |
| 板块 15 日数据采集 | `scripts/collect_boards_15d.py`（东财行业+概念全量板块，自动最新；成功率<30% 不落盘） |
| 涨停 15 日数据采集 | `scripts/collect_zt_15d.py`（按板块关键词匹配） |
| 板块资金流历史采集 | `scripts/collect_fund_15d.py`（东财行业+概念板块近15日主力净流入 -> `fund_15d.json`，urllib 无 requests 依赖） |
| 指数 K 线采集 | `scripts/collect_index_klines.py`（8 指数近 30 日收盘价） |
| 个股推荐计算 | `scripts/recommend.py`（首板突破 + 放量热点） |
| 动态热点发现引擎 | `scripts/gen_hot_sectors.py`（Model 01，板块池来自 `sectors` 东财板块+`hybk` 补充，五因子评分 -> `hot_sectors_{date}.json`） |
| 题材生命周期定位 | `scripts/gen_theme_lifecycle.py`（Model 02，多日涨停趋势 + `fund_15d` 真实资金趋势 + 阈值随市场相对化，五阶段 -> `theme_lifecycle_{date}.json`） |
| 资金轮动四象限 + 趋势多因子 | `scripts/gen_rotation_v2.py`（Model 03 + Model 06，接入 `fund_15d` 真实资金持续性与动态资金分母，启动/加速/减速/回落标签 -> `rotation_{date}.json`） |
| 情绪温度计 | `scripts/gen_emotion_cycle.py`（Model 04，温度+风险双维 + factors 因子分解 + 分歧阈值温度滑动 + 背离连续化 -> `emotion_{date}.json`） |
| 行情基础报告 | `scripts/generate_report_v3.py`（情绪卡优先读 `emotion_{date}.json`，渲染温度/风险因子分解条 + 五档刻度高亮 + 仓位进度条(position_min/max) + 推荐跳转，缺失回退硬编码） |
| 轮动章节插入 | `scripts/gen_rotation_columns.py`（引用 `rotation_{date}.json` 渲染四象限/多因子，缺失回退旧节奏卡） |
| 个股基础报告 | `scripts/generate_stock_report.py` |
| 个股操作建议美化 | `scripts/rewrite_advice_v5.py` |
| 个股分析数据(样例) | `data/tdhl_analysis.json`（六维/SWOT/龙虎榜/价位/操作建议，通鼎互联） |
| 个股 K 线数据 | `data/tdhl_kline.json`（含 closes 列表，用于 sparkline） |
| 输出·行情复盘 | `output/行情复盘_{date}.html` |
| 输出·个股诊断 | `output/{name}_个股诊断_{date}.html`（文件名随名称/日期动态生成） |

> 另有历史/备用脚本（`generate_report.py` / `generate_report_v2.py`、`gen_heatmap*.py`、`rewrite_advice_v1~v4.py`、`gen_policy_section.py`、`gen_recommend_section.py`、`gen_sector_rotation*.py`、`fix_rotation_section.py`、`gen_advice_section.py`、`polish_*.py` 等）一并打包在 `scripts/` 内，已做路径相对化（`BASE` 自动推导），非主流程，按需取用。历史废弃采集脚本 `collect_news.py` / `collect_sector_15d*.py` / `collect_sector_month.py` 已被主流程替代，未打包进本技能（留在开发工作区 `D:\ai_work\stock-report\scripts\` 作历史存档）。

## 数据基准说明

- **「今日」= 真实交易日**：所有采集/生成脚本默认取 `datetime.now()` 的日期；`--date YYYYMMDD` 可指定任意交易日覆盖。
- `collect_boards_15d.py` / `collect_zt_15d.py` / `collect_index_klines.py` 为**滚动采集**（自动取最新 N 日），无日期参数。
- `market_{date}.json`、`recommend_{date}.json`、`output/*_{date}.html` 的文件名均随日期动态生成。
- 若仅做**离线重跑 / 美化 / 换股诊断**，无需联网，直接用现有 `data/` 内数据即可（`--date` 指向已存在数据的日期）。
- **日日自动生成（数据驱动）**：verdict 定调、副标题、主线题材、热点板块、推荐 pick、轮动节奏解读均已数据驱动，`--date` 换日期重跑即自动更新，**无需手改脚本**。唯一例外是 05 章「重点政策/消息」依赖 `news_{date}.json`（`collect_news.py` 按关键词规则筛选 Top5，语义质量弱于人工精选，属可接受的自动化折中）；轮动表头日期为**降序**（最近交易日排最前）。

## 合规

报告末尾固定声明：「以上基于公开行情整理，仅供复盘参考，不构成投资建议。」
