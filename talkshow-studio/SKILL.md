---
name: "talkshow-studio"
description: "生产级 AI 脱口秀视频工坊。用户提供脱口秀简稿（演员图片/舞台图片可选，未提供时自动生成默认演员：现代都市美女模特），按生产级 SOP 一次成片：资产锁定（人物/舞台/声音三线一致）→ 分镜表 → 双参考图锁定批量生成带原生口型语音的分镜视频 → 和谐转场拼接 + 响度归一 + 字幕压制。基于 Agnes 全模态 API（agnes-3.0-flash / agnes-image-2.5-flash / agnes-video-2.5-flash）+ FFmpeg。当用户想制作脱口秀视频、单口喜剧舞台视频、需要人物/声音/字幕一致性的成片时调用此 Skill。"
---

# TalkShow Studio — 生产级 AI 脱口秀视频工坊

基于《AI脱口秀视频创作操作流程（生产级 SOP）》实现的一次成片流水线。核心目标：**人物形象、声音音色、字幕样式三条线全程一致，转场和谐，最小化抽卡返工**。

## 与 talkshow 的区别

| 维度 | talkshow（旧） | talkshow-studio（本技能） |
|---|---|---|
| 人物一致性 | 文生图首帧 + 末帧链式重托管（易漂移） | 双参考图锁定（定妆照 + 舞台合成图）+ Prompt 锚点段逐字复制 |
| 声音 | Edge TTS（与画面无口型关系） | 视频模型**原生音画同步**（台词写进 prompt，口型+语音同源生成） |
| 输入 | 纯文本段子 | 简稿必填；演员图/舞台图可选（未提供时自动生成默认演员：现代都市美女模特 + 自动舞台） |
| 转场 | 硬切 concat | xfade 交叉淡化 + acrossfade 音频过渡（和谐转场） |
| 后期 | 无字幕规范 | 响度归一（-16 LUFS）+ 统一样式字幕压制 + QC 报告 |

## 环境要求

- Node.js 14+（零 npm 依赖，纯内置模块；代码用到空值合并运算符 `??`，需 Node 14+）
- FFmpeg 4.4+ 完整版（含 xfade/acrossfade/subtitles/libass）
  ```powershell
  winget install Gyan.FFmpeg
  ```
- Agnes API Key（覆盖文本/图像/视频三模态，无需其他服务）

## 工作流（对应 SOP 五阶段）

```
输入：简稿(txt) 必填；演员图 + 舞台图可选（缺演员图 → 自动生成默认演员：现代都市美女模特，缺舞台图 → 自动生成舞台）
   │
   ├─ [阶段零] 缺图自动补齐（未提供演员图时）：文生图默认演员定妆照（3:4，禁麦禁道具）→ URL 持久化到 state.json
   │    └─ 音色联动：自动生成演员时，未显式指定 --voice-desc 则自动切换为内置女声（声画性别匹配）
   ├─ [阶段一] 资产锁定（agnes-image-2.5-flash）
   │    ├─ 多图合成：演员图 + 舞台图 → stage_composite（同时解决本地图 → 公开 URL 托管）
   │    └─ 图生图：stage_composite → 横版定妆照 model_reference（人物一致性锚点）
   │
   ├─ [阶段二] 脚本拆解（agnes-3.0-flash）
   │    └─ 台词逐字保留 → 分镜表 JSON（单镜 ≤12s，笑点不跨镜，景别有变化）→ storyboard.md
   │
   ├─ [阶段三] 分镜视频批量生成（agnes-video-2.5-flash，mode=reference）
   │    └─ images=[定妆照, 舞台合成图]（顺序固定）+ 一致性锚点段 + 完整台词
   │       → 每镜 5-12s 720P 视频，原生音画同步（口型与台词同步）
   │
   └─ [阶段四] 后期合并（FFmpeg）
        ├─ xfade 交叉淡化拼接（默认 fade 0.4s，可 cut）+ acrossfade 音频过渡
        ├─ loudnorm 响度归一（-16 LUFS）→ H.264/AAC 720P
        ├─ SRT 字幕生成（18 字/行，按语义换行）→ 统一样式压制
        └─ 成片 + qc_report.md（自动 QC 数据 + 人工检查清单）
```

### 一致性保障机制（核心，不可绕过）

1. **人物第一锁**：所有分镜视频的 `images[0]` 固定为同一张定妆照 URL，全流程不更换
2. **场景第一锁**：所有分镜视频的 `images[1]` 固定为同一张舞台合成图 URL
3. **Prompt 第二锁**：每镜 prompt 开头逐字复制一致性锚点段（`prompts.js` 的 `CONSISTENCY_ANCHOR`），不得省略改写
4. **声音锁定**：音色描述（VOICE_PROFILE）全片固定；视频模型按 prompt 音色描述生成语音，台词逐字传入保证口型同步
5. **字幕锁定**：SRT 由分镜表自动生成（台词逐字），统一样式：微软雅黑粗体、白色、黑描边 2px、底部居中
6. **表演强度锁**：`--expression` 值写入 state.json，全片共用同一强度；分镜 `emotion` 用词受同源规则约束，并对夸张词自动降级，避免镜间表演风格跳变
7. **段子特定道具白名单（可选 feature）**：通过 `--prop <preset\|text>` 参数控制。`prompts.js` 提供 `consistencyAnchor(propDesc)` / `stageCompositePrompt(propDesc)` / SOP 8.5 三处联动，**默认无道具**（舞台除立式麦外保持干净）。仅当段子原文明确出现某个关键道具时（如保温杯、咖啡杯、书本）才加 `--prop`，模型会在锚点段、合成图、分镜规则中允许该道具作为「小茶几 + 唯一道具」陈设跨镜稳定出现，与「立式麦 + 演员手空」主锁定不冲突。预设：`thermos`（黑色保温杯+茶几）、`coffee`（白色咖啡杯）、`none`/省略（无道具），或自由文本。详见故障排查表与「段子特定道具」章节

### 防抽卡策略（已内置）

- 先合成再定妆：定妆照背景简化，减少视频生成场景漂移
- 台词逐字校验：分镜表台词拼接 ≠ 原文时自动重试（最多 3 次）
- 单镜失败不中断：记录后继续，最后用 `--regenerate` 补拍
- API 层 503/429 自动重试：图像 6 次指数退避；视频任务 4 次，其中**队列满（503 `video_queue_full`）走 70 秒长退避**（短退避扛不住平台级拥堵）、429 限速固定等 70s
- **舞台调度锁（STAGE_LOCK）**：每镜 prompt 注入"禁烧字幕（霓虹灯布景除外）+ 演员全程立麦前 + 机位平缓推拉 + 观众仅在台前观众席（可鼓掌欢呼），不得出现在舞台上或演员身后"
- 每镜末尾要求"说完台词自然停顿"，转场落在停顿点，拼接无痕

## 使用方法

### API Key（二选一，不落盘）

Key 不写死在技能内，通过环境变量注入或运行时提供；缺失时脚本会明确报错提示。

```powershell
# 1. 环境变量（推荐）
# PowerShell（当前会话）
$env:AGNES_API_KEY = "sk-..."
# Git Bash（当前会话）
export AGNES_API_KEY=sk-...
# 永久生效（PowerShell，写入用户级环境变量）
[Environment]::SetEnvironmentVariable("AGNES_API_KEY", "sk-...", "User")

# 2. 命令行参数（单次运行）
--api-key "sk-..."
```

### 基础用法（一次成片）

```powershell
cd D:\ai_work\skills\talkshow-studio\scripts

# 标准用法：提供演员图 + 舞台图
node talkshow_produce.js `
  --script-file "D:\script.txt" `
  --actor-image "D:\actor.png" `
  --stage-image "D:\stage.png"

# 全自动（零图片）：不提供演员图时自动生成默认演员（现代都市美女模特），
# 舞台图也自动生成，音色自动匹配女声
node talkshow_produce.js --script-file "D:\script.txt"
```

### 常用变体

```powershell
# 竖版（抖音/快手）+ 关闭字幕
node talkshow_produce.js --script-file s.txt --actor-image a.png --stage-image st.png --ratio 9:16 --no-subtitles

# 自定义默认演员形象（仅在未提供 --actor-image 时生效）
node talkshow_produce.js --script-file s.txt --actor-desc "干练短发都市女性，深蓝西装"

# 转场模式：默认 auto（同景别同机位硬切、变化处溶解）；也可统一硬切
node talkshow_produce.js ... --transition cut

# 表情强度 6/10（冷面克制风格）
node talkshow_produce.js --script-file s.txt --expression 6

# 断点续跑
node talkshow_produce.js --resume --work-dir work/20260901-143000-abcd

# 从第 3 镜起重拍（前 2 镜保留）
node talkshow_produce.js --resume --work-dir work/20260901-143000-abcd --regenerate 3

# 觉得表情太夸张：调低强度后整片重拍（资产/分镜缓存复用，只重出视频）
node talkshow_produce.js --resume --work-dir work/20260901-143000-abcd --expression 8 --regenerate all
```

## 参数列表

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `--script-file <path>` | 是 | - | 脱口秀简稿 txt（建议 ≥200 字） |
| `--actor-image <path\|url>` | 否 | 自动生成 | 演员图片；**不提供时自动生成默认演员（现代都市美女模特）**，生成 URL 写入 state.json 保证续跑/重拍一致 |
| `--actor-desc <text>` | 否 | 内置美女模特 | 默认演员形象描述（仅未提供 `--actor-image` 时生效） |
| `--stage-image <path\|url>` | 否 | 自动生成 | 舞台图片；不提供时自动生成脱口秀剧场舞台 |
| `--voice-desc <text>` | 否 | 智能 | 音色描述；优先级最高，会覆盖一切默认。**注意：若不提供且提供的是女性演员图，仍默认走男声 profile，需显式 `--voice female` 才女声匹配** |
| `--voice <female\|male>` | 否 | 智能 | 音色性别预设（female=28岁清亮女声；male=30岁中音男声），不传 `--voice-desc` 时生效。**提供女性演员图时务必 `--voice female`，否则女演员会配男声**（声画不匹配，已修复：旧版静默走男声） |
| `--prop <preset\|text>` | 否 | 无道具 | **段子特定道具白名单**。预设：`thermos`=哑光黑色保温杯（带吸管杯盖，配小茶几）、`coffee`=白色陶瓷咖啡杯、 `none`=无道具。也可写自定义描述（自由文本，如 `--prop "一只银色保温杯"`）。仅当段子明确需要该道具时使用，无关段子不要加，否则画面漂移。`--prop none` 或省略 → 舞台除立式麦外保持干净，演员双手空手。 |
| `--outfit-lock <text>` | 否 | 空 | **服装/发型逐字锁定段**（新建与 `--resume` 均可传，存 `state.inputs.outfitLock` 全片复用）。把服装款式、剪裁、开衩位置、裙长、鞋款、发型发色写成一句"服装宪法"注入每镜视频 prompt，并明令"不得把开衩裙画成直筒裙、不得丢失外套"。**提供演员图时强烈建议使用**：仅靠参考图 + 泛化"服装一致"锚点，视频模型在全身镜头会把服装细节自由发挥（实测：高开衩包臀裙被画成普通黑裙、脸型变圆）；逐字锁定段写入后此类漂移根治 |
| `--expression <0-10>` | 否 | `8` | **表情与肢体夸张程度**。10=极度夸张（瞪眼张嘴、舞台剧式）；**8=自然克制（默认）**，微表情为主、五官不变形；6=内敛冷面喜剧；≤4=近乎无表情。同时约束分镜 `emotion` 用词与每镜视频 prompt，并对旧分镜中的夸张词自动降级 |
| `--ratio <r>` | 否 | `16:9` | 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9 |
| `--max-shot <n>` | 否 | `12` | 单镜最大秒数（模型上限 12） |
| `--transition <t>` | 否 | `auto` | `auto`（推荐：相邻两镜景别+机位相同 → 硬切，景别/机位变化 → 溶解）或统一指定 fade / cut / wipeleft / smoothleft... |
| `--transition-dur <n>` | 否 | `0.4` | 溶解转场时长秒（auto 模式下仅作用于景别/机位变化的边界） |
| `--no-subtitles` | 否 | - | 不压制字幕（默认压制） |
| `--work-dir <dir>` | 否 | 自动 | 工作目录 |
| `--resume` | 否 | - | 断点续跑 |
| `--regenerate <list>` | 否 | - | 重拍指定镜：单个镜号（如 `3`，表示从 S03 重拍到末尾）、镜号列表（如 `1,5`，仅重拍 S01 与 S05；仅重拍单个镜可用重复镜号 `3,3`）、或 `all`（整片重拍），配合 `--resume` |
| `--seed <n>` | 否 | 随机 | 视频生成种子 |
| `--api-key` / `--base-url` | 否 | - | API 凭据与地址 |
| `--model-video/image/text` | 否 | - | 模型覆盖（默认 2.5-flash 三件套） |

## 输出结构

```
work/<session>/
├── state.json          # 全流程状态（断点续跑依据）
├── input_script.txt    # 简稿备份
├── storyboard.md       # 人类可读分镜表（镜号/时长/景别/台词/动作/笑点）
├── videos/             # shot_S01_10s.mp4 ...
├── final/
│   ├── video_concat.mp4        # 转场拼接 + 响度归一
│   ├── subtitles_final.srt     # SRT 字幕
│   └── 脱口秀_<主题>_<日期>_final.mp4   # ★ 最终成片
└── qc_report.md        # 自动 QC 数据 + 人工检查清单
```

## Agent 执行规范（供调用本技能的 AI 遵循）

1. **验收输入**：简稿 < 50 字要提示用户扩稿；演员图要求面部清晰、正面；舞台图 ≥ 1024px
2. **脚本创作前置（可选）**：用户只有主题没有成稿时，先跑 `node scripts/draft.js --topic "<主题>"`——
   读 `scripts/kb/`（framework/triggers/styles/hot 四知识库）一题 5 角度出稿
   （干货效率/痛点共鸣/悬念反转/对比冲击/热点借势），产出 `work/drafts/<时间戳>/drafts.md`
   供用户选稿；选中的 script 全文存 txt 后作为 `--script-file` 输入
3. **预算播报（预算防线）**：阶段二完成后、批量生成前，必须向用户播报制作预估
   （镜数 × 单镜秒数 × ¥0.15/s 刊例价；Agnes 限时免费期实际 ¥0，仍要提示限流 1 次/分钟）
4. **分镜评审**：跑完阶段二后向用户展示 `storyboard.md` 要点（镜数/总时长/笑点分布），用户确认再批量生成（可选）
3. **首批 QC**：S01/S02 生成后提示用户核对人物一致性（漂移判定：脸型变/换装=重拍；发型微变=可接受）
4. **交付**：成片 + qc_report.md 一起交付，报告人工清单供用户勾选
5. **URL 传参**：在 Git Bash 中传 URL 参数时使用 `MSYS_NO_PATHCONV=1`（防路径转换）；脚本已内置 URL 反斜杠自愈

### Agent 兜底循环（拥堵期标准运行范式，强烈推荐）

平台免费视频队列在白天常整小时 503 饱和、深夜零星放行（实测规律：深夜 22 点后至清晨为放行窗口）。单次运行扛不住，**Agent 应把流水线包进外层智能循环**后台运行：

```bash
STATE="<work-dir>/state.json"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  # ① 存在失败镜时清除旧 merged，强制阶段四重合并（防"缺镜成片"被当成功）
  node -e "const fs=require('fs');const s=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
    if(s.videos&&s.videos.some(v=>!v.ok)&&s.merged){s.merged=null;s.done=false;
    fs.writeFileSync(process.argv[1],JSON.stringify(s,null,2));}" "$STATE"
  # ② 首轮可带 --regenerate 重拍指定镜；后续轮普通 --resume
  node talkshow_produce.js --resume --work-dir <work-dir> [--outfit-lock "..."]
  # ③ 成功判据：全部镜 ok 且 merged.final 存在——不能只看退出码（部分镜失败仍 exit 0）
  node -e "const s=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
    const ok=s.videos&&s.videos.length&&s.videos.every(v=>v.ok)&&s.merged&&s.merged.final;
    if(!ok)process.exit(1)" "$STATE" && break
  sleep 120
done
```

要点：**断点机制保证已生成资产/镜头不重复计费**，循环每轮只补缺失镜；队列放行不可预测时循环接力跑（跑完 12 轮未齐就再开一轮），已到手镜头始终锁定。

### 交付前 QC 清单（必做，逐项核验）

1. **完整性**：`state.json` 全部镜 `ok:true`，且 `videos/` 下文件数与镜数一致（防旧命名残留混淆）
2. **成片时效**：`ffprobe` 最终成片时长 ≈ 分镜表总时长（±3s）；文件 mtime 晚于最后一镜生成时间——**只信 state.json 的 `merged.final` 字段会踩"旧残片"坑**
3. **逐镜抽帧审计**（30%/70% 两帧）：双字幕/烧录文字、观众位置（台上穿帮）、服装与 `--outfit-lock` 一致性、人物身份特征。可用 `node qa_shots.js --work-dir <dir>` 自动化（视觉模型按 `watermark_or_text` / `extra_person` / `outfit_match` 等维度判定）
4. **字幕唯一性**：成片中只允许 SRT 压制这一层字幕

## 故障排查

| 问题 | 解决方案 |
|---|---|
| `size must be 720P` | Flash 版视频固定 720P，脚本已固定，勿改 `--model-video` 后手动传 size |
| `images length must not exceed 5` | 双参考图方案只用 2 张，检查是否误传多图 |
| 503 queue is full | 脚本自动重试；**视频队列满（`video_queue_full`/队列已满）已改为 70 秒长退避**（短指数退避扛不住平台级拥堵），持续失败属平台级饱和（免费期白天尤甚），用外层兜底循环磨（见"Agent 兜底循环"） |
| `429 video generation rate limit exceeded (1 req/min)` | 视频接口限速 1 次/分钟（实测）；脚本命中后固定等 70s 再重试，勿缩短间隔 |
| 分镜拆解 JSON 解析失败 | 自动重试 3 次；仍失败检查简稿是否有大段英文/特殊符号 |
| 某镜生成失败 | 继续其余镜头，最后 `--resume --regenerate <n>` 补拍 |
| 人物漂移 | 确认定妆照 URL 未变；在 `prompts.js` 锚点段中追加更强描述；重拍该镜（`--regenerate <n>` 会从该镜拍到末尾，仅单镜用 `--regenerate <n>,<n>`） |
| 变声/切换声线（如演到台词中"AI 说/他人说"时变成男声或旁白声） | `prompts.js` 已内置"声音锁定"段（全片仅演员本人同一音色，引用对话须同音色转述）；分镜 action 中"切换角色/扮演/模仿"类描述会被自动清洗（会诱导模型变声）；用基频（F0）分析定位男声镜（成段 F0<165Hz 即男声，孤立 1–3 帧为观众笑声/句尾降调可忽略），`--resume --regenerate <n>` 补拍 |
| 道具数量/样式漂移（如多支话筒、手持麦替代立式麦） | 锚点段已约束"只能出现一支黑色立式麦克风"；`prompts.js` 的定妆照 prompt 严禁出现"手持麦"字样（会诱导视频模型画第二支麦），分镜 action 同理；重拍该镜（`--regenerate <n>` 会从该镜拍到末尾，仅单镜用 `--regenerate <n>,<n>`） |
| 演员位置跨镜漂移（飘来飘去） | 锚点段与每镜 prompt 已含"站位锁定"（双脚钉在麦克风正后方）；分镜规则 8.7 禁止走位类 action，旧分镜中的走位子句在生成时自动剔除；仍漂移时重拍对应镜 |
| 演员冒出外语/听不懂的音节 | 每镜 prompt 已含"台词纪律"（台词为唯一口播，禁止哼唱/呢喃/无意义音节/外语，说完闭口微笑停顿）；仍出现时用 `--voice-desc` 强调"字正腔圆标准普通话"并重拍对应镜 |
| 补拍后 QC 抽帧仍显示旧问题 | `videos/` 可能残留旧分镜文件（如 `shot_S05_10s.mp4` 与新 `shot_S05_8s.mp4` 并存），以 `state.json` 中 `videoPath` 为准抽帧，并手动删除残留文件避免混淆 |
| 表情太夸张/五官变形（瞪眼、张嘴、卡通式鬼脸） | 用 `--expression` 调低强度（10→**8 为默认自然克制**，6 为冷面）。该参数同时约束分镜 `emotion` 用词与每镜视频 prompt，并自动把旧分镜里的"爆笑/瞪大眼睛/张大嘴巴/夸张"降级。重拍：`--resume --work-dir <dir> --expression 8 --regenerate <镜号列表>`（资产/分镜缓存复用，只重出视频）。**注意：分镜 action 里的"夸张手势/比划大框/眼睛睁大"也会诱导面部表情**——`prompts.js` 在 level≤8 时自动把"眼睛睁大/瞪大眼睛/张大嘴巴/吃惊/震惊"替换为"眼神自然"；`expressionDirective` 在 ≥7 档位追加"动作与表情解耦"原则（动作大、表情平）。仍有个别镜失控时，手动改 `storyboard.md` 中该镜 action 措辞并 `--regenerate <n>` 补拍 |
| 口型不同步 | 缩短该镜台词（拆分镜），或检查该镜 seconds 是否远大于台词所需时长 |
| 拼接报错 xfade | 确认 FFmpeg 为完整版（winget Gyan.FFmpeg），片段分辨率差异已由脚本自动归一 |
| 字幕乱码/方框 | SRT 为 UTF-8；确认系统有 Microsoft YaHei 字体 |
| 视频任务轮询超时 | 默认 **40 分钟**（原 15 分钟会把已入队的任务白白丢弃——实测拥堵期任务入队后 pending 超 15 分钟属常态）；网络更慢可再调 `agnes_client.js` 中 `timeoutMs` |
| **成片出现双字幕、且两层样式不一样** | 视频模型偶发自带烧录台词字幕（白字/红字艺术字、位置随机），与后期 SRT 压制叠成双字幕。`prompts.js` 的 `STAGE_LOCK` 已含"画面严禁出现任何字幕/台词文本（舞台霓虹灯布景除外）"；仍出现时用 `qa_shots.js`（`watermark_or_text` 维度）定位坏镜，`--regenerate <n>,<n>` 补拍。**交付前必须逐镜抽帧审计**（30%/70% 处各 1 帧） |
| **观众被画到舞台上/坐在演员身后** | `STAGE_LOCK` 已约束"观众只在台前观众席（前景剪影/台下背影），可鼓掌欢呼大笑，不得出现在舞台上或演员身后"；仍穿帮时 `qa_shots.js` 的 `extra_person` 维度定位 + 补拍 |
| **部分镜失败仍 exit 0 并出"缺镜成片"** | `talkshow_produce.js` 阶段四拿现有镜直接合并，**外层循环不能以退出码判成功**——必须校验 `state.json` 全部 `v.ok` 且 `merged.final` 存在（见"Agent 兜底循环"标准范式） |
| **交付的"成片"实为旧残片（state 显示已合并）** | 循环的成功校验若只查 `merged.final` 是否存在，最后一轮重合并可能未落盘（文件还是缺镜期的残片）。**交付前必须 `ffprobe` 成片时长（应 ≈ 分镜表总时长）+ 核对文件 mtime**，不符则清 `merged` 字段 + 删 `final/` 旧文件 + `--resume` 重跑阶段四 |
| Windows 字幕压制失败（`subtitles` 滤镜报 `original_size` / 路径解析错） | FFmpeg `-vf subtitles='D\:/...'` 在 Windows 下盘符冒号转义极脆弱。`scripts/ffmpeg_tools.js` 的 `burnSubtitles` 已改用 **`cwd: 字幕目录` + `basename` + 单引号包裹** 方案彻底绕开。如手动跑命令：`cd` 到字幕所在目录，再 `ffmpeg -i in.mp4 -vf "subtitles='file.srt':force_style='...'" out.mp4` |
| 段子特定道具（如保温杯、咖啡杯、书本、手机）想作为视觉锚点跨镜稳定出现 | 用 `--prop <preset\|text>` 参数启用。可选预设：`thermos`（哑光黑色保温杯+小茶几）、`coffee`（白色陶瓷咖啡杯），或自由文本。**默认省略时舞台无道具**（`prompts.js` 的 `consistencyAnchor` / `stageCompositePrompt` / SOP 8.5 三处都会自动改为"舞台除立式麦外保持干净，禁止分镜师添加任何手持/桌面道具"）。**示例**：`--prop thermos` / `--prop "一只银色保温杯"`。如需新增预设（如书本、耳机），在 `prompts.js` 的 `PROP_PRESETS` 加一行即可，无需改三处逻辑 |
| 视频中道具位置跨镜漂移（如 S01 在右前景、S04 转左前景） | 视频生成阶段模型对小道具长时段位置保持能力有限。**视觉叙事一致性可接受**（道具仍可见且全程唯一）；如需绝对固定位置，用 `--regenerate <n>,<n>`（仅该镜）补拍 + 在对应镜 prompt 中显式写「xxx 道具始终位于画框xxx方向」 |
| 视频中某些秒出现「演员手空 + 道具陈设上空」的瞬间漂移 | 同上，模型对长时段小道具持续保持能力有限。整段快速播放观感连贯，但慢放可见该瞬间。可选 `--regenerate <n>,<n>`（仅该镜）补拍；当前 SOP 推荐「直接接受」|
| `--voice female` 未生效，生成结果仍为男声 | 检查命令行是否有重复 `--voice`（后写覆盖前写）；或 shell 历史替换把 `--voice female` 错替换为 `--voice male` |
| 提供了女性演员图但生成声音是男声 | 旧版本静默走男声 profile（声画不匹配）。新版必须显式 `--voice female`。已修复：仅 `--voice-desc` 完整覆盖；`--voice female\|male` 是性别预设；不传则按「无演员图→女声 / 有演员图→男声」智能规则选择，**强烈建议显式传** |
| `run()` 函数调用 `execFileSync` 时传 `cwd` 但被忽略 | `scripts/ffmpeg_tools.js` 的 `run()` 必须解构并透传 `cwd`（与 `env`）。**v1 修复的 burnSubtitles 改用 cwd+basename 方案的前提是 run 真的接受 cwd**，否则字幕压制仍会报 `Unable to open subtitles_final.srt`。**症状**：`stage_composite` / 拼接 / 字幕压制顺序跑完，最后字幕 step 报 `Unable to open subtitles_final.srt`。**检查**：`run(cmd, args, { timeoutMs, cwd, env } = {})` 是否含 `cwd` 字段；以及 `execFileSync` 是否 spread `{...(cwd?{cwd}:{})}` |
| `subtitles` 滤镜用 `subtitles='D\\:/...'` 转义错 | 不要再尝试反斜杠/冒号转义。**唯一可靠方案**：用 `cwd: 字幕所在目录` + `subtitles='basename.srt':force_style='...'`。完整代码见 `ffmpeg_tools.js` 的 `burnSubtitles` |

## 技术约束

1. **视频 API 需公开 URL**：`mode=reference` 的 images/audios 必须是公开 URL。本地演员/舞台图通过图像 API（支持 Data URI 输入、URL 输出）完成合成，顺带解决托管
2. **单镜 4–12 秒**：`agnes-video-2.5-flash` 硬限制；简稿 240 字 ≈ 1 分钟 ≈ 5-6 镜
3. **原生音画同步**：台词直接写进视频 prompt，语音与口型由模型同源生成；音色靠 prompt 音色描述 + 全片固定来保持一致（当前 Agnes 无独立 TTS/A2A 接口，SOP 中的 voice_reference 方案以音色描述锁定替代）
4. **费用**：撰写时图像/视频均限时免费；如计费恢复，注意视频按秒计费（¥0.15/s 刊例价）
5. **API Key 安全**：Key 不写入技能目录任何文件（无 `.local`/`.template`），仅经环境变量或 `--api-key` 注入；分发包含 0 个凭据

## 分发规范

打包仅含 `SKILL.md` + `scripts/`（剥离 work/、output/ 等运行时产物；技能内不含任何 API Key 文件）。附文件大小 / MD5 / 条目数校验。

## 完善记录（2026-09 借鉴 short-drama-studio 一致性方法论）

- **identity-lock 身份锁定段**：`prompts.js` 新增 `IDENTITY_LOCK` 常量，每镜视频 prompt 在一致性锚点之后逐字注入——把"脸型/五官/发型发色/肤色"定义为全片不可变的身份锚点，与"表情/动作/光线/景别"等本场可变项分离；要求强识别特征在任何景别、光线、角度下保留，防止远景/逆光/大动作镜把脸漂掉。
- **默认演员强识别特征锚点**：`DEFAULT_ACTOR_DESC` 增加"左眼角下方一颗明显的小痣"——强识别特征是跨镜认脸的关键，无特征泛化脸极易隔镜漂移；`modelReferencePrompt` 同步强调"强识别特征必须原样保留，不得删除或移位"。
- **重拍版本归档（archive_old_file）**：`talkshow_produce.js` 在 `--regenerate` 时把旧分镜视频归档到 `videos/versions/`（保留最近 3 版，可对比可回滚），根治"补拍后残留旧分镜文件"问题；生成循环结束后自动清扫 `videos/` 中不被 `state.json` 引用的残留旧命名文件（如改名后并存的 `shot_S05_10s.mp4`）。
- **多模态自动质检（qa_shots.js，借鉴 qa_frames.py）**：对每个已完成分镜视频抽帧（默认 2 帧，30%/70% 处），把「定妆照 + 舞台合成图 + 抽帧」喂给 `agnes-3.0-flash` 视觉模型，按固定 JSON 维度逐项判定：硬性通过 `face_match / feature_match（强识别特征）/ hair_match / outfit_match / mic_check（恰好一支立麦）/ scene_match`，硬性排除 `extra_person / extra_hands / watermark_or_text`。输出 `work/shot_qa.json`；`--delete-bad` 把坏镜头归档到 `videos/versions/` 并清 state，随后 `--resume --regenerate <n>` 补拍。用法：`node qa_shots.js --work-dir work/xxx [--only S03,S05] [--delete-bad] [--offline]`。

## 完善记录（2026-09-19 统一方法论 P0 落地）

- **脚本创作知识库（scripts/kb/，借鉴 ai-script-generation-skill）**：新增
  `framework.md`（3 种爆款叙事结构：铺垫-反转-回环 / 递进吐槽 / 故事嵌套，含节拍与结束钩规则）、
  `triggers.md`（8 类心理触发点手册 + 挂钩三问自检）、`styles.md`（5 种核心人设 + 7 条禁用词清单）、
  `hot.md`（热点库占位，只借情绪不借事实）。知识库是文件而非 prompt，可版本化迭代。
- **一题 5 角度出稿（scripts/draft.js）**：输入主题 → 读 kb → 5 角度各出一稿
  （干货效率/痛点共鸣/悬念反转/对比冲击/热点借势），每稿标注框架/触发点/人设/预估时长/难度/预计镜数，
  输出 `<cwd>/talkshow-studio/out/drafts/<时间戳>/drafts.json + drafts.md`（跟随会话工作目录）；
  零生成成本（仅文本模型），选稿后交
  talkshow_produce.js 制作。零 npm 依赖，OpenAI 兼容接口（TEXT_API_KEY/AGNES_API_KEY）。
- **预算防线**：Agent 执行规范新增"阶段二后播报制作预估"必选项。

## 完善记录（2026-09-19 补课轮：kb 单源化）
- **kb/draft.js 单源化**：本技能 `scripts/kb/`（framework/triggers/styles/hot 4 件）为
  唯一真源；`draft.js` 支持 `--kb-dir` 覆盖 → 本地 kb → 同级 `talkshow-studio/scripts/kb`
  回退链。draft.js 输出默认迁至 `<cwd>/talkshow-studio/out/drafts/<时间戳>`（跟随会话工作目录，
  不写回技能目录）。
  talkshow-studio-kling 改为经回退链引用本技能 kb，删除其重复副本，消除双份漂移。

## 完善记录（2026-10-27 实战补丁轮：队列韧性 / 服装锁定 / 舞台调度 / 交付 QC）

来源：14 镜脱口秀《出生入死》全流程实战（含跨 3 天队列拥堵攻坚与两轮用户反馈返工），以下均已落码并实战验证。

### 脚本级修复（scripts/）

1. **全脚本 UTF-8 BOM 剥离**：Windows 下技能脚本带 BOM 会让 Node 直接 SyntaxError（`node --script-file` 尚未解析就崩）。症状：`node xxx.js --help` 也报语法错误且报错行号在第 1 行。修复：`sed -i '1s/^\xEF\xBB\xBF//'`。**新增脚本文件时务必无 BOM 落盘**。
2. **agnes_client.js `withRetry` 队列满长退避**：503 `video_queue_full`/队列已满 命中 70s 固定退避（原 3/6/12s 指数退避在平台级饱和下 4 次全烧完）；429 限速仍 70s。
3. **agnes_client.js `pollVideoTask` 超时 15→40 分钟**：拥堵期任务入队后 pending 超 15 分钟属常态，短超时会**把已入队的任务白白丢弃**（丢弃后任务仍在平台侧跑，但脚本侧记为失败 → 重复提交浪费额度）。
4. **`--outfit-lock` 服装逐字锁定**（prompts.js `shotVideoPrompt` 第 5 参 + talkshow_produce.js CLI 参数，存 `state.inputs.outfitLock`，resume 可覆盖）：实测证明"参考图 + 泛化服装一致锚点"不足以约束视频模型——全身镜头会把高开衩包臀裙画成普通直筒黑裙、脸型画圆；逐字锁定段（款式/剪裁/开衩位置/裙长/鞋款/发色 + "不得把开衩裙画成直筒裙"负向禁令）写入后根治。**提供演员图时必配**。
5. **`STAGE_LOCK` 舞台调度锁定段**（prompts.js，无条件注入每镜 prompt）：修复两类实测穿帮——①视频模型自带烧录台词字幕（白字/红字艺术字，与 SRT 叠成双字幕）→ 禁令"画面严禁出现任何字幕/台词文本（舞台霓虹灯布景除外），台词只通过口型与声音呈现"；②观众被画到舞台上坐演员身后 → "观众只在台前观众席（前景剪影/台下背影），可鼓掌欢呼大笑，不得出现在舞台上或演员身后"；同时固化"演员全程立麦前 + 机位平缓推拉运镜"。
6. **`propDesc` 空值兜底**：早期 state.json 无 `propDesc` 字段，resume 时 prompt 出现 `undefined` 字样，续跑入口已补 `state.inputs.propDesc == null → ""` 兜底。

### Agent 级方法论（写入"Agent 兜底循环"与"交付前 QC 清单"两节）

- **退出码不可信**：`talkshow_produce.js` 部分镜失败仍 exit 0 并用现有镜合并出"缺镜成片"——外层循环必须以 `state.json` 全镜 `v.ok` 为成功判据，且每轮开始前清 `merged` 强制重合并。
- **交付双验证**：`ffprobe` 成片时长 + 文件 mtime，防"state 显示已合并、实为旧残片"（本次实战真实踩坑：交付前发现 final 是 3 天前 9.5s 残片）。
- **逐镜抽帧审计**：每镜 30%/70% 两帧人审或 `qa_shots.js` 机审，重点维度：双字幕、观众位置、服装一致性、人物身份。
- **队列规律**：免费视频通道白天（尤其工作日）几乎全拒，深夜 22 点后至清晨零星放行（约 1 小时 1 任务）；长片应挂循环跨夜磨，断点保证零重复计费。
