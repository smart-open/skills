---
name: "talkshow-studio-kling"
description: "生产级 AI 脱口秀视频工坊（可灵版）。用户提供脱口秀简稿（演员图片/舞台图片可选，未提供时自动生成默认演员：现代都市美女模特），按生产级 SOP 一次成片：资产锁定（单首帧基准图）→ 分镜表 → 单首帧锁定批量生成带原生口型语音的分镜视频 → 和谐转场拼接 + 响度归一 + 字幕压制。基于 Kling Video 3.0 Turbo（720P，原生音画同步）+ Kling Image 3.0（kling-v3，2K）+ OpenAI 兼容文本模型（分镜拆解）+ FFmpeg，内置电影级质感与真人级细腻表演指令。当用户想用可灵制作脱口秀视频、单口喜剧舞台视频、需要人物/声音/字幕一致性与电影质感的成片时调用此 Skill。"
---

# TalkShow Studio Kling — 生产级 AI 脱口秀视频工坊（可灵版）

基于《AI脱口秀视频创作操作流程（生产级 SOP）》实现的一次成片流水线，对接**可灵（Kling）**官方 API。核心目标：**人物形象、声音音色、字幕样式三条线全程一致，转场和谐，最小化抽卡返工**，并在此基础上强化**电影级画质**与**真人级细腻表演**。

## 与 talkshow-studio（Agnes 版）的区别

| 维度 | talkshow-studio（Agnes） | talkshow-studio-kling（本技能） |
|---|---|---|
| 视频模型 | agnes-video-2.5-flash（多参考图 reference 模式） | **Kling Video 3.0 Turbo**（720P/1080P，3–15s，原生音画同步） |
| 图像模型 | agnes-image-2.5-flash | **Kling Image 3.0（kling-v3）**，2K 高清，异步任务 |
| 文本模型 | agnes-2.0-flash | OpenAI 兼容接口（可灵不提供 LLM；默认 agnes-2.0-flash，可换任意兼容服务） |
| 一致性机制 | 双参考图（定妆照 + 舞台合成图）+ Prompt 锚点 | **单首帧基准图**（演员+舞台合成图，全片共用）+ Prompt 锚点 |
| 鉴权 | Bearer Key | **JWT（AccessKey+SecretKey HS256）** 或代理明文 Key |
| 单镜时长 | 5–12s | 5–15s（可灵 3.0 上限 15s） |
| 画质增强 | 基础电影感措辞 | 内置 CINEMATIC_VISUAL（电影布光/景深/胶片颗粒/真实肤色）+ PERFORMANCE_REALISM（呼吸/眨眼/微表情）+ 按景别匹配镜头语言 |

## 环境要求

- Node.js 14+（零 npm 依赖，纯内置模块）
- FFmpeg 4.4+ 完整版（含 xfade/acrossfade/subtitles/libass）
  ```powershell
  winget install Gyan.FFmpeg
  ```
- 可灵开放平台凭据（视频+图像）
- 分镜拆解文本模型 Key（OpenAI 兼容，如 Agnes；可灵不提供 LLM）

## 工作流（对应 SOP 五阶段）

```
输入：简稿(txt) 必填；演员图 + 舞台图可选（缺演员图 → 自动生成默认演员：现代都市美女模特）
   │
   ├─ [阶段零] 缺图自动补齐（未提供演员图时）：kling-v3 文生图默认演员定妆照（3:4，2K，禁麦禁道具）→ URL 持久化到 state.json
   │    └─ 音色联动：自动生成演员时，未显式指定 --voice-desc 则自动切换为内置女声（声画性别匹配）
   ├─ [阶段一] 资产锁定（kling-v3，2K）
   │    └─ 图生图合成：演员图（参考）+ 舞台文字模板（--stage-desc 可覆盖）→ stage_composite
   │       （★ 全片唯一首帧基准图；Kling 视频仅支持单首帧参考，故不再单独产出定妆照）
   ├─ [阶段二] 脚本拆解（OpenAI 兼容文本模型）
   │    └─ 台词逐字保留 → 分镜表 JSON（单镜 5–15s，笑点不跨镜，景别有变化）→ storyboard.md
   ├─ [阶段三] 分镜视频批量生成（/image-to-video/kling-3.0-turbo，720P）
   │    └─ first_frame=合成图（全片同一张）+ 一致性锚点段 + 完整台词
   │       → 每镜 5–15s 视频，原生音画同步（口型与台词同步）
   └─ [阶段四] 后期合并（FFmpeg）
        ├─ xfade 交叉淡化拼接（默认 fade 0.4s，可 cut）+ acrossfade 音频过渡
        ├─ loudnorm 响度归一（-16 LUFS）→ H.264/AAC
        ├─ SRT 字幕生成（18 字/行，按语义换行）→ 统一样式压制
        └─ 成片 + qc_report.md（自动 QC 数据 + 人工检查清单）
```

### 一致性保障机制（核心，不可绕过）

1. **首帧第一锁**：所有分镜视频的 `first_frame` 固定为同一张「演员+舞台合成图」URL，全流程不更换
2. **Prompt 第二锁**：每镜 prompt 开头逐字复制一致性锚点段（`prompts.js` 的 `consistencyAnchor(propDesc)`），不得省略改写
3. **声音锁定**：音色描述（VOICE_PROFILE）全片固定；可灵 3.0 按 prompt 音色描述生成语音，台词逐字传入保证口型同步
4. **字幕锁定**：SRT 由分镜表自动生成（台词逐字），统一样式：微软雅黑粗体、白色、黑描边 2px、底部居中
5. **表演强度锁**：`--expression` 值写入 state.json，全片共用同一强度；分镜 `emotion` 用词受同源规则约束，并对夸张词自动降级
6. **段子特定道具白名单（可选）**：`--prop <preset|text>`，默认无道具（舞台除立式麦外保持干净）。预设：`thermos`（黑色保温杯+茶几）、`coffee`（白色咖啡杯）、`none` 或省略；也可自由文本。锚点段/合成图/分镜规则三处联动

### 电影级质感与真实表演（本技能核心增强）

每镜视频 prompt 内置三段增强指令（`prompts.js`）：

- **CINEMATIC_VISUAL**：ARRI 电影机实拍质感、胶片颗粒 + halation 光晕、三点布光（3200K 暖钨丝主光 + 轮廓光分离肩颈与发丝）、体积光烟雾、大光圈焦外光斑、真实皮肤纹理（毛孔/绒毛/油光过渡）、影调层次（高光不过曝暗部不死黑，禁磨皮/美颜/CG 感）
- **PERFORMANCE_REALISM**：呼吸节拍（停顿处胸口起伏、吸气可见）、真实眨眼频率与视线调度、手势加减速与语言重音同步、身体微动作（点头侧倾/重心微移/下巴微抬收）、微表情先行（包袱前嘴角先动、包袱后停顿等待观众）、连续情绪弧线（禁僵硬定格/循环假动作/念稿/舞台剧式夸张）
- **lensByShotSize**：按景别匹配镜头语言——特写/近景→85mm f/1.8 浅景深人像（睫毛发丝纤毫毕现、奶油焦外光斑）；全景→24mm f/4 广角（体积光穿雾+观众席剪影）；中景→50mm f/2.8（肩部微虚化突出面部）；其余 35mm f/2.8 纪录片式构图

配套：负向提示词（文生图）含「过度美颜/网红同款脸/塑料皮肤」拦截；默认舞台模板内置暖钨丝色温 + 深色吸光幕布强对比。

### 防抽卡策略（已内置）

- 先锁人物再合成：演员图作图生图参考生成合成图，人物一致性优先
- 台词逐字校验：分镜表台词拼接 ≠ 原文时自动重试（最多 3 次，LCS 相似度 ≥0.92 容错）
- 单镜失败不中断：记录后继续，最后用 `--regenerate` 补拍
- API 层 5xx/429 自动指数退避重试（图像任务 6 次、视频任务 4 次）
- 每镜末尾要求"说完台词自然停顿"，转场落在停顿点，拼接无痕

## 使用方法

### 凭据（二选一注入，不落盘）

```powershell
# 1. 可灵官方（JWT，推荐）—— 开放平台控制台获取 AccessKey/SecretKey
$env:KLING_ACCESS_KEY = "ak-..."
$env:KLING_SECRET_KEY = "sk-..."
# 永久生效（PowerShell）
[Environment]::SetEnvironmentVariable("KLING_ACCESS_KEY", "ak-...", "User")
[Environment]::SetEnvironmentVariable("KLING_SECRET_KEY", "sk-...", "User")

# 2. 代理服务明文 Key（如经第三方网关转发）
$env:KLING_API_KEY = "sk-..."

# 3. 分镜拆解文本模型 Key（OpenAI 兼容；默认走 Agnes，也可换任意兼容服务）
$env:TEXT_API_KEY = "sk-..."          # 回退读取 AGNES_API_KEY
$env:TEXT_BASE_URL = "https://api.agnes-ai.cn/v1"   # 可选，默认 Agnes

# 4. 命令行参数（单次运行）：--access-key/--secret-key/--api-key/--text-api-key
```

> **API 域名（重要）**：新系统官方网关为 `https://api-beijing.klingai.com`（脚本默认值，单 API Key 即 Bearer 鉴权）。`api.klingai.com` 是旧版 JWT 网关（AK/SK 成对签名），单 Key 直连会报 `401 Auth failed`。国际站为 `https://api-singapore.klingai.com`。

### 基础用法（一次成片）

```powershell
cd D:\ai_work\skills\talkshow-studio-kling\scripts

# 标准用法：提供演员图
node talkshow_produce.js `
  --script-file "D:\script.txt" `
  --actor-image "D:\actor.png"

# 全自动（零图片）：自动生成默认演员（现代都市美女模特）+ 电影感剧场舞台，音色自动匹配女声
node talkshow_produce.js --script-file "D:\script.txt"
```

### 常用变体

```powershell
# 竖版（抖音/快手）+ 关闭字幕
node talkshow_produce.js --script-file s.txt --actor-image a.png --ratio 9:16 --no-subtitles

# 自定义舞台场景描述
node talkshow_produce.js --script-file s.txt --actor-image a.png --stage-desc "深夜小剧场，红丝绒幕布，一束顶光"

# 1080P 输出（默认 720P）
node talkshow_produce.js --script-file s.txt --actor-image a.png --quality 1080p

# 表情强度 6/10（冷面克制风格）
node talkshow_produce.js --script-file s.txt --expression 6

# 断点续跑 / 重拍
node talkshow_produce.js --resume --work-dir work/20260902-143000-abcd --regenerate 3
node talkshow_produce.js --resume --work-dir work/20260902-143000-abcd --expression 8 --regenerate all
```

## 参数列表

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `--script-file <path>` | 是 | - | 脱口秀简稿 txt（建议 ≥200 字） |
| `--actor-image <path\|url>` | 否 | 自动生成 | 演员图片；**不提供时自动生成默认演员（现代都市美女模特）**，生成 URL 写入 state.json |
| `--actor-desc <text>` | 否 | 内置美女模特 | 默认演员形象描述（仅未提供 `--actor-image` 时生效） |
| `--stage-image <path\|url>` | 否 | 忽略 | **兼容参数**：Kling 仅支持单图参考，舞台由文字模板描述；此参数当前不参与合成（见已知限制） |
| `--stage-desc <text>` | 否 | 内置电影感剧场 | 舞台场景文字描述（合成图阶段使用） |
| `--voice-desc <text>` | 否 | 智能 | 音色描述；优先级最高，覆盖一切默认 |
| `--voice <female\|male>` | 否 | 智能 | 音色性别预设（female=28岁清亮女声；male=30岁中音男声）。**提供女性演员图时务必 `--voice female`** |
| `--prop <preset\|text>` | 否 | 无道具 | 段子特定道具白名单：`thermos`/`coffee`/`none` 或自由文本 |
| `--expression <0-10>` | 否 | `8` | 表情与肢体夸张程度。10=极度夸张；**8=自然克制（默认）**；6=冷面；≤4=近乎无表情 |
| `--ratio <r>` | 否 | `16:9` | 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 21:9 |
| `--max-shot <n>` | 否 | `12` | 单镜最大秒数（可灵 3.0 上限 15） |
| `--quality <q>` | 否 | `720p` | 视频清晰度 720p / 1080p |
| `--transition <t>` | 否 | `auto` | `auto`（相邻两镜景别+机位相同→硬切，变化处→溶解）或统一 fade / cut / wipeleft... |
| `--transition-dur <n>` | 否 | `0.4` | 溶解转场时长秒 |
| `--no-subtitles` | 否 | - | 不压制字幕（默认压制） |
| `--image-reference <t>` | 否 | - | 图生图参考类型 `subject`/`face`（调优人物相似度） |
| `--work-dir <dir>` | 否 | 自动 | 工作目录 |
| `--resume` | 否 | - | 断点续跑 |
| `--regenerate <list>` | 否 | - | 重拍指定镜：`3`（从 S03 到末尾）/`1,5`（仅指定镜）/`3,3`（仅单镜）/`all`，配合 `--resume` |
| `--access-key` / `--secret-key` | 否 | - | 可灵 JWT 凭据（默认读 KLING_ACCESS_KEY/KLING_SECRET_KEY） |
| `--api-key` | 否 | - | 可灵明文 Key（代理用；默认读 KLING_API_KEY，优先于 JWT） |
| `--base-url` | 否 | `https://api-beijing.klingai.com` | 官方新系统网关（默认）；`https://api.klingai.com` 为旧版 JWT 网关（AK/SK） |
| `--text-api-key` / `--text-base-url` | 否 | Agnes | 分镜拆解文本模型凭据与地址（OpenAI 兼容） |
| `--model-video/image/text` | 否 | 见下 | 模型覆盖：`kling-3.0-turbo` / `kling-v3` / `agnes-2.0-flash` |

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

1. **验收输入**：简稿 < 50 字要提示用户扩稿；演员图要求面部清晰、正面、≤10MB、宽高比 1:2.5~2.5:1
2. **分镜评审**：跑完阶段二后向用户展示 `storyboard.md` 要点（镜数/总时长/笑点分布），用户确认再批量生成（可选）
3. **首批 QC**：S01/S02 生成后提示用户核对人物一致性（漂移判定：脸型变/换装=重拍；发型微变=可接受）
4. **交付**：成片 + qc_report.md 一起交付
5. **URL 传参**：在 Git Bash 中传 URL 参数时使用 `MSYS_NO_PATHCONV=1`（防路径转换）；脚本已内置 URL 反斜杠自愈

## 故障排查

| 问题 | 解决方案 |
|---|---|
| `401` / `code=1000+` 鉴权失败 | 确认 base-url：官方新系统网关为 `https://api-beijing.klingai.com`（默认，单 API Key + Bearer）；单 Key 打到旧网关 `api.klingai.com` 会报 `Auth failed`；`KLING_ACCESS_KEY/KLING_SECRET_KEY`（成对 AK/SK）走 JWT 签名 |
| `code=1102 Account balance not enough` | Key 有效但额度不足：到 [klingai.com/dev/pricing](https://klingai.com/dev/pricing) 购买视频/图像资源包或领取试用包（客户端已将余额类错误识别为永久错误，立即终止不重试） |
| `first_frame` 图片被拒 | 首帧要求 .jpg/.jpeg/.png、≤50MB、≥300px、宽高比 1:2.5~2.5:1；本技能首帧始终来自可灵图像 API 的托管 URL，若手动替换需满足以上限制 |
| 提供了 `--stage-image` 但成片舞台与图不一致 | 已知限制：可灵图像 API 单次仅支持一张参考图，合成图以**演员图**为参考、舞台由 `--stage-desc` 文字描述。需要精确舞台时用 `--stage-desc` 详细描述舞台特征 |
| 人物相似度不够 | 加 `--image-reference face`（需演员图仅含 1 张人脸）或 `subject`；重拍时先删 state.json 的 `assets` 字段重新合成 |
| 429 限流 | 脚本自动等 20s 重试；持续限流说明并发额度用尽，稍后再跑 |
| 视频任务轮询超时 | 默认 25 分钟；可改 `kling_client.js` 中 `pollVideoTask` 的 `timeoutMs` |
| `查询视频任务 404` | 脚本自动回退 `/v1/tasks/{id}`；仍 404 检查 `--base-url` 站点（国内/新加坡）与任务 ID |
| 图生图不支持负向提示词警告 | 正常：`negative_prompt` 仅在文生图（无 image 参数）时发送 |
| 分镜拆解 JSON 解析失败 | 自动重试 3 次；仍失败检查 `--text-api-key`/`--text-base-url` 与简稿是否有大段英文/特殊符号 |
| 某镜生成失败 | 继续其余镜头，最后 `--resume --regenerate <n>` 补拍 |
| 人物漂移 | 确认首帧合成图 URL 未变（state.json `assets.stageComposite.url`）；重拍该镜 |
| 变声/切换声线 | `prompts.js` 已内置"声音锁定"段；分镜 action 中"扮演/模仿"类描述会被自动清洗；定位后 `--resume --regenerate <n>` 补拍 |
| 表情太夸张/五官变形 | `--expression 8`（默认）已约束微表情 + "动作与表情解耦"；仍失控时手动改 storyboard 该镜 action 措辞并 `--regenerate <n>,<n>` |
| 口型不同步 | 缩短该镜台词（拆分镜），或检查该镜 seconds 是否远大于台词所需时长 |
| 字幕乱码/方框 | SRT 为 UTF-8；确认系统有 Microsoft YaHei 字体 |
| Windows 字幕压制失败 | `ffmpeg_tools.js` 的 `burnSubtitles` 已用 cwd+basename 方案绕开盘符转义；手动跑时先 `cd` 到字幕目录 |
| 补拍后残留旧分镜文件 | 以 state.json 中 `videoPath` 为准，手动删除 `videos/` 残留文件避免混淆 |

## 技术约束

1. **可灵视频单首帧参考**：3.0 Turbo 图生视频仅支持一张首帧图（暂不支持尾帧/双帧）→ 一致性方案为"全片同一张首帧合成图 + Prompt 锚点"，相比双参考图方案更依赖合成图质量
2. **可灵图像单图参考**：`/v1/images/generations` 每次仅接受一张 `image` 参考图；演员图 + 舞台图无法同时输入，舞台以文字模板描述（`--stage-desc` 可自定义）
3. **单镜 5–15 秒**：可灵 3.0 duration 枚举 3–15；简稿 240 字 ≈ 1 分钟 ≈ 5-6 镜
4. **原生音画同步**：台词直接写进视频 prompt，语音与口型由可灵 3.0 同源生成；音色靠 prompt 音色描述 + 全片固定来保持一致
5. **图像 API Base64 规范**：本地参考图转 Base64 时**不带** `data:image/...` 前缀（官方要求，脚本已处理）
6. **费用**：可灵按量计费（视频按时长、图像按张），注意任务额度与并发限制
7. **API Key 安全**：凭据不写入技能目录任何文件，仅经环境变量或 CLI 注入

## 分发规范

打包仅含 `SKILL.md` + `scripts/`（剥离 work/、output/ 等运行时产物；技能内不含任何凭据文件）。
