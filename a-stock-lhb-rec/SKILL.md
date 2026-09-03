---
name: a-stock-lhb-rec
description: |
  龙虎榜「后期涨停」个股推荐与自进化模型技能。基于近三个月龙虎榜数据训练逻辑回归模型，
  预测个股「上榜后 T+1/T+2/T+3 任一交易日涨停」的概率，收盘后（17:00 后）生成推荐候选，
  并据「昨日龙虎榜+今日涨停+今日龙虎榜」持续自我验证与重训，让模型随真实结果累积越来越精准。
  特征三维：个股技术面（涨幅/换手/市值/净买/是否涨停/前3日透支/上榜原因）、席位操作手法
  （买方质量/家数/买卖净比/游资占比/机构/北向/知名游资/低吸）、行情研判
  （题材主线/板块强度/市场涨停情绪/连板强势）。含游资席位画像、紫阳东路专项、模型进化轨迹。
  适用：盘后龙虎榜选股、游资后期涨停预判、T+3 买入候选、席位手法分析、模型自迭代优化。
agent_created: true
display_name: 龙虎榜T+3涨停推荐与自进化模型
display_name_en: Dragon-Tiger T+3 Limit-Up Recommender (Self-Evolving)
description_zh: 龙虎榜后期涨停推荐与自我进化模型（盘后生成候选、据实际结果持续重训）
description_en: Dragon-Tiger board T+3 limit-up recommendation with self-optimizing retraining
visibility: public
disable-model-invocation: false
---

# 龙虎榜 T+3 涨停推荐与自进化模型（a-stock-lhb-rec）

> 把「龙虎榜上榜个股 → 后期（T+1~T+3）仍有涨停冲高」做成可复用的概率模型。
> 每天收盘后自动出候选；每天用「昨日推荐 vs 今日实际涨停」验证，并把新实际结果喂回训练，
> 模型版本随时间外 AUC 不劣则 +1，**越用越准**。

## 能力说明

- **盘后推荐**：每个交易日 17:00 后，拉取当日龙虎榜，用当前模型对全部上榜股输出 `P(T+3涨停)` 并排序，给出「纳入观察」候选（满足 主线+连板+净买比+优质买方+未过度透支）。
- **三维归因**：个股技术 × 席位手法 × 行情研判，可解释（逻辑回归评分卡）。
- **席位画像**：自动构建游资席位画像（打板/低吸/接力风格、EB 收缩综评、样本可信度），含紫阳东路专项解读。
- **自我进化**：`optimize` 补最新实际结果 → 重训 → 时间外 AUC 不劣于当前则版本 +1，轨迹写入 `model_history.json`；`verify` 逐日核对推荐命中率。
- **Markdown 报告**：方法论 / 赢家共性 / 席位手法 / 评估 / 评分卡 / 实战验证 / 进化轨迹 / 买入策略（带日期，落 `<cwd>` 根目录）。

## 何时使用

- 用户说「龙虎榜推荐 / 盘后选龙虎榜 / T+3 涨停预测 / 游资后期涨停 / 上榜后还能涨的票」
- 用户说「每天收盘后给我龙虎榜候选 / 5点后龙虎榜」→ 跑 `daily`
- 用户说「优化模型 / 让模型更准 / 模型迭代」→ 跑 `optimize`
- 用户说「某席位手法 / 紫阳东路怎么样」→ 看席位画像章节
- 定时自动化（建议）：每个交易日 17:10 触发 `daily`，自动完成「抓榜→推荐→验证→进化→报告」

## 运行要求（自包含）

| 依赖 | 说明 |
|------|------|
| Python | 任意 Python 3.9+ 解释器（`python` / `python3` / `py`，下称 `py`）。需预装 pandas/scikit-learn/requests/joblib；若缺失：`py -m pip install pandas scikit-learn requests joblib` |
| 脚本 | 技能目录内 `scripts/*.py`（已相对化，`BASE` 由 `__file__` 推导，无需改路径） |
| 运行时 | 产物默认写到**当前会话/工作目录**下的 `<cwd>/a-stock-lhb-rec/`（数据+模型+历史），可用环境变量 `LHB_RUNTIME` 显式指定目录；报告（Markdown，带日期）写到 `<cwd>` 根目录（可用 `LHB_OUT` 指定）；产物**不写回技能安装目录** |
| 联网 | 抓取龙虎榜/题材/K线需联网（东财 datacenter + 同花顺 + 腾讯 K线）；已有缓存可离线重跑 |

> **无需 `cd` 到特定目录**：脚本代码用 `BASE = 脚本自身位置的技能根目录` 定位，任意位置运行皆可；但**运行时产物（数据/模型）默认写到运行时的当前工作目录** `<cwd>/a-stock-lhb-rec/`（可用 `LHB_RUNTIME` 指向固定工程目录），**报告（Markdown）写到 `<cwd>` 根目录**（可用 `LHB_OUT` 指定），确保技能库保持纯净。

## 第一步：首次全量构建（仅一次）

```bash
py scripts/run.py init
```
- 拉取近 90 天龙虎榜（board / 买卖席位 / 同花顺题材 / 全量日 K线，约 10~15 分钟，增量可断点续跑）
- 构建席位画像 → 特征集 → 训练首版模型（v1）→ 生成当日推荐 → 生成报告
- 产物：`a-stock-lhb-rec/data/*` + `a-stock-lhb-rec/model/model_t3.joblib` + `a-stock-lhb-rec/model_history.json` + `龙虎榜T+3涨停推荐模型报告-*.md`（报告落 `<cwd>` 根目录）

## 第二步：每日盘后主流程（核心，可自动化）

```bash
py scripts/run.py daily            # 默认=最近已发布交易日(今天需≥17:00)
py scripts/run.py daily 2026-08-28 # 指定日
```
`daily` 依次执行：
1. `pipeline.fetch_latest()` —— 增量抓取当日龙虎榜（board/seats/hot/kline，跳过已有）
2. `recommend` —— 对当日全部上榜股打分，输出 Top20 候选 + `recommend_{日期}.csv`
3. `verify` —— 核对前 1~3 个交易日的推荐实际 T+1/T+2/T+3 涨停，追加 `verify_history.csv`
4. `optimize` —— 把最新实际结果补入训练集、重训、版本决策（时间外 AUC 不劣则 +1）
5. `report` —— 刷新 Markdown 报告（含最新进化轨迹与验证记录）

> **5 点以后逻辑**：`pipeline.board_ready_day()` 在 17:00 前返回上一交易日、17:00 后返回当日，确保龙虎榜数据已发布。

## 第三步：按需子命令

```bash
py scripts/run.py recommend 2026-08-28   # 单日推荐(不抓数据, 用缓存)
py scripts/run.py verify 2026-08-28      # 验证某日推荐命中(需 T+1..T+3 已可得)
py scripts/run.py optimize               # 手动触发自我进化重训
py scripts/run.py report                 # 仅重新生成报告
py scripts/run.py train                   # 仅重训(不抓数据)
```

## 自进化机制（为什么越来越准）

- **数据闭环**：每个交易日 `daily` 抓取的新龙虎榜，其 T+1/T+2/T+3 实际涨幅随 K 线延伸而「解冻」为标签；`optimize` 把这些真实结果并入训练集，模型持续吸收近期行情特征。
- **版本门控（同集可比）**：`train` 用按日期 80/20 的时间外切分（测试集均为已可知标签的前瞻样本，杜绝未来泄漏）；并在【同一个时间外测试集】上同时评估新旧模型 AUC，新模型不劣于当前（-1% 容差）才接受并版本 +1，否则保留旧模型。避免旧版「不同测试集 AUC 直接比」导致的退化误判。
- **防未来泄漏（因果特征）**：`causal.py` 保证席位质量分与题材主线仅用「截至样本日期」已可观测信息——席位 T+5 表现只计入已结算(结算日≤样本日)的记录，主线题材 TopK 只用该日前的热榜累计；榜单标签统一由 K 线收盘价按板块阈值计算，与 `verify` 完全同口径。
- **正则化稳健**：训练集内部分层 5 折 CV 自动选 `C`（不用测试集选超参），并对样本量/正例数过少给出提示。
- **轨迹可查**：`a-stock-lhb-rec/model_history.json` 记录每版样本量/时间外 AUC/同集旧模型 AUC/Top20 命中/决策；报告第七章展示进化轨迹与逐日验证命中率。
- **局限**：因果化后 AUC 更真实（不会虚高）；但弱势市（涨停情绪<10%）模型仍失效，应停用；样本量有限，建议每个交易日跑 `daily` 保持新鲜。

## 买入策略（推荐输出口径）

- **纳入观察**：`P≥30%` 且 `题材主线` 且 `买卖净比≥0.55` 且（涨停/连板 LB_FLAG/知名游资其一）且 `前3日透支<38%` 且 非纯机构主买。
- **回避**：纯机构主买 / 前3日透支≥38% / 高位连板≥5 / 科创创业涨停上榜（已充分定价）。
- **风控**：T+1 不涨停即减仓，跌破上榜日收盘止损；弱势/退潮期停用。

## 文件索引

| 用途 | 路径 |
|------|------|
| 统一入口 | `scripts/run.py`（init/daily/recommend/verify/optimize/train/report） |
| 共享配置/特征 | `scripts/_common.py`（BASE/运行时路径/limit_pct/zt_threshold/is_limit_up/reason_cat/FAMOUS/load_klines/load_model/predict） |
| 因果索引 | `scripts/causal.py`（无未来泄漏的席位评分/主线题材 scorer，供特征构建） |
| 数据管道 | `scripts/pipeline.py`（fetch board/seats/hot/kline，参数化+增量，含 board_ready_day） |
| 席位画像 | `scripts/seat_profile.py` → `a-stock-lhb-rec/data/seat_profile.csv`（展示口径，含未来 T5；勿用于训练特征） |
| 特征集 | `scripts/dataset.py`（build_all/build_date，因果特征+统一K线标签）→ `a-stock-lhb-rec/data/model_data_t3.csv` |
| 训练+版本 | `scripts/train.py` → `a-stock-lhb-rec/model/model_t3.joblib` + `model_meta_t3.json` + `a-stock-lhb-rec/model_history.json` |
| 每日推荐 | `scripts/recommend.py` → `a-stock-lhb-rec/recommend_{日期}.csv` |
| 验证 | `scripts/verify.py` → `a-stock-lhb-rec/verify_history.csv` |
| 自我进化 | `scripts/optimize.py`（抓新数据→重训→版本决策） |
| 报告 | `scripts/report.py` → `龙虎榜T+3涨停推荐模型报告-{YYYY-MM-DD}.md`（落 `<cwd>` 根目录） |

> 产物（数据+模型+历史）落在**运行时当前工作目录**的 `<cwd>/a-stock-lhb-rec/`（可设 `LHB_RUNTIME` 指向任意工程目录），**报告（Markdown）落在 `<cwd>` 根目录**（可设 `LHB_OUT`）；**分发技能时仅打包 `SKILL.md` + `scripts/`**，产物不入技能目录、不打包。

## 合规

报告末尾固定声明：「以上基于公开行情整理，仅供复盘参考，不构成投资建议。」
