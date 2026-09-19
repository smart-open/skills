---
name: "timeless-wedding-volc"
description: "AI 跨时空婚礼电影生成器。上传男女照片，选择中国朝代，自动生成电影质感的跨时代婚礼视频。当用户想要制作 AI 婚礼视频、跨朝代爱情电影、上传照片生成视频时调用此 Skill。"
---

# Timeless Wedding Volc - AI 跨时空婚礼电影生成器

基于 **Volcengine Ark（豆包）** 平台的 AI 婚礼电影生成 Skill。用户上传男女两张照片，选择 2-5 个中国朝代，即可自动生成一部跨越时空的 cinematic 婚礼电影。

## 核心特性

- **Seedream 5.0 Pro** 生成朝代 AI 肖像与场景首帧（i2i 保留面部五官）
- **Seedance 2.0** 生成电影质感动态视频（支持 5 种模式）
- **13 个朝代**完整配置，每个朝代配有独立服装、场景、风俗、时间分段视频分镜剧本
- **朝代标题卡片**：每个朝代转场后显示朝代名 + 核心故事概述
- **FFmpeg 合并**：concat demuxer + 片头片尾 + 朝代标题卡
- **零依赖**：纯 Node.js 内置模块，无需 npm install
- **断点续跑**：通过 `state.json` 支持 `--resume` 和 `--regenerate`

## 模型说明

### 图片生成（固定，无需指定）

| 模型 | 模型 ID | 说明 |
|------|---------|------|
| Seedream 5.0 Pro | `doubao-seedream-5-0-pro-260628` | i2i 肖像 + multi-i2i 场景，最小 921,600 像素 |

### 视频生成（用户可选）

通过 `--video-model` 参数指定：

| 选项 | 模型 ID | 特点 | 适用场景 |
|------|---------|------|----------|
| **标准版**（默认） | `doubao-seedance-2-0-260128` | Seedance 2.0，画质最佳，生成较慢 | **正式输出**，婚礼电影成片 |
| **Mini 快速版** | `doubao-seedance-2-0-mini-260615` | Seedance 2.0 Mini，速度更快 | 快速预览效果、调试分镜 |
| **Fast 版** | `doubao-seedance-2-0-fast-260128` | Seedance 2.0 Fast，极速生成 | 最快验证，牺牲部分画质 |

> Mini/Fast 模型不支持 `resolution` 参数，代码会自动移除该参数。
> 标准版支持完整参数：`duration`、`ratio`、`resolution`、`generate_audio`、`return_last_frame`。

### 使用示例

```powershell
# 标准版（默认，无需指定 --video-model）
node timeless_wedding_volc.js --dynasties "tang,ming" --male-photo ... --female-photo ...

# Mini 快速版（预览效果）
node timeless_wedding_volc.js --dynasties "tang,ming" --video-model doubao-seedance-2-0-mini-260615 --male-photo ... --female-photo ...

# Fast 极速版（最快验证）
node timeless_wedding_volc.js --dynasties "tang,ming" --video-model doubao-seedance-2-0-fast-260128 --male-photo ... --female-photo ...
```

## 环境要求

- **Node.js** 12+
- **FFmpeg** 4.4+（完整版，需支持 `drawtext` 和 `concat`）
- **Volcengine Ark API Key**

### FFmpeg 安装（Windows）

```powershell
winget install Gyan.FFmpeg
```

## 工作流

```
用户照片（男女各1张）
       │
       ▼
┌─────────────────┐
│  Seedream i2i   │  生成朝代 AI 肖像（保留五官特征，朝代服饰）
│  单人肖像生成    │  size: 1424x800
└─────────────────┘
       │
       ▼
┌─────────────────┐
│ Seedream multi- │  男女肖像参考生成双人场景首帧
│    i2i 场景图   │  couplePrompt + portrait references
└─────────────────┘
       │
       ▼
┌─────────────────┐
│  Seedance 视频  │  首帧/参考图驱动生成 cinematic 视频
│    生成         │  无音频，纯画面叙事
└─────────────────┘
       │
       ▼
┌─────────────────┐
│  FFmpeg 合并    │  朝代标题卡 → 视频 → 片头片尾
│    输出         │  concat demuxer, 无音频
└─────────────────┘
```

## 使用方法

### 设置 API Key

```powershell
$env:ARK_API_KEY = "your-ark-api-key"
```

### 基础用法

```powershell
cd .trae/skills/timeless-wedding-volc/scripts

node timeless_wedding_volc.js `
  --male-photo "C:\Photos\groom.jpg" `
  --female-photo "C:\Photos\bride.jpg" `
  --dynasties "tang,song,ming,modern" `
  --add-title --add-ending
```

### 完整参数列表

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--male-photo <path>` | 是 | - | 男方照片路径 |
| `--female-photo <path>` | 是 | - | 女方照片路径 |
| `--dynasties <ids>` | 是 | - | 逗号分隔的朝代 ID（2-5 个） |
| `--custom-desc <text>` | 否 | - | 个人故事描述，融入场景生成 |
| `--mode <mode>` | 否 | `first-frame` | 视频模式（见下文） |
| `--video-model <id>` | 否 | 标准版 | Seedance 模型 ID |
| `--duration <s>` | 否 | `8` | 每段视频时长（4-15 秒） |
| `--ratio <r>` | 否 | `16:9` | 宽高比：`16:9` / `9:16` |
| `--resolution <r>` | 否 | `720p` | 分辨率：`480p` / `720p` / `1080p` |
| `--transition-duration <s>` | 否 | `1.0` | 转场时长（秒） |
| `--add-title` | 否 | false | 添加片头（"几生几世 跨时空相爱"） |
| `--add-ending` | 否 | false | 添加片尾（"今生今世 永不分离"） |
| `--add-subtitles` | 否 | false | 每段添加朝代信息字幕 |
| `--bgm <path\|auto>` | 否 | auto | BGM：`auto`=按朝代 mood 情绪弧分段（bgm_arc.js + sidechain 避让）；`<path>`=自备曲目 amix 垫底 + loudnorm −14 LUFS |
| `--no-bgm` | 否 | 关闭 | 关闭 BGM 声音层 |
| `--dry-run` | 否 | 关闭 | 只打印全部 ffmpeg 命令（合并/情绪弧/混音），不执行、不消耗额度 |
| `--output <path>` | 否 | 自动 | 最终输出 MP4 路径 |
| `--resume` | 否 | false | 从 state.json 断点续跑 |
| `--regenerate <id>` | 否 | - | 重生成指定朝代 |
| `--api-key <key>` | 否 | 环境变量 | Ark API Key |
| `--work-dir <dir>` | 否 | 自动 | 工作目录 |

## 视频生成模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `first-frame` | 场景图作首帧，Seedance 延续画面 | **默认推荐**，场景一致性最佳 |
| `first-last-frame` | 首尾帧双约束，生成过渡视频 | 需要明确起止画面 |
| `multimodal` | 肖像作参考 + 场景作首帧 | 增强面部一致性 |
| `portrait-reference` | 仅肖像参考，文字驱动场景 | 自由度高 |
| `text2video` | 纯文本，跳过图片生成 | 最快但一致性最低 |

## 可用朝代

| ID | 朝代 | 主题 | 年代 | 故事概述 |
|----|------|------|------|----------|
| `xia` | 夏 | 华夏初光 | c.2070-1600 BCE | - |
| `xizhou` | 西周 | 礼乐天下 | 1046-771 BCE | - |
| `warring` | 战国 | 烽火佳人 | 475-221 BCE | 烽火连天下的重逢之誓 |
| `han` | 汉 | 大汉雄风 | 202 BCE-220 CE | - |
| `jin` | 晋 | 魏晋风流 | 265-420 | - |
| `nanbeichao` | 南北朝 | 乱世情缘 | 420-589 | - |
| `tang` | 唐 | 大唐盛世 | 618-907 | 长安灯火下的千年之约 |
| `song` | 宋 | 宋韵清雅 | 960-1279 | - |
| `yuan` | 元 | 草原雄鹰 | 1271-1368 | - |
| `ming` | 明 | 凤冠霞帔 | 1368-1644 | 紫禁城中的凤冠之约 |
| `qing` | 清 | 满汉情深 | 1644-1912 | - |
| `minguo` | 民国 | 十里洋场 | 1912-1949 | - |
| `modern` | 现代 | 永恒誓言 | 1949-Present | 山海之间的永恒承诺 |

> 带"故事概述"的朝代已配置完整的电影级时间分段分镜剧本。

## 输出结构

```
work/
└── 20260716-143022-a1b2/
    ├── state.json              # 进度状态（支持 resume）
    ├── portraits/              # 朝代 AI 肖像
    ├── scenes/                 # 双人场景首帧
    ├── videos/                 # 朝代视频片段
    ├── last_frames/            # 视频末帧截图
    ├── temp/                   # 标题卡、concat list、字体
    └── final/                  # 最终合并输出
```

## 故障排查

| 问题 | 解决方案 |
|------|----------|
| "FFmpeg not found" | `winget install Gyan.FFmpeg`，确保完整版 |
| "Request body size exceeds 64MB" | 压缩照片至 2MB 以下 |
| 视频任务 failed | 首帧敏感内容/限流，用 `--regenerate <id>` 重试 |
| 面部保留度低 | 使用正面高清照片，尝试 `--mode multimodal` |
| 朝代标题卡片乱码 | 确认 `C:\Windows\Fonts\simhei.ttf` 存在 |
| 断点续跑找不到目录 | 用 `--work-dir` 指定之前的工作目录 |

## 技术架构

| 文件 | 行数 | 职责 |
|------|------|------|
| `timeless_wedding_volc.js` | 432 | 主入口 CLI，状态机，流水线编排 |
| `ark_client.js` | 151 | Ark API 通信封装，指数退避重试 |
| `dynasties.js` | 536 | 13 朝代配置，英文 prompt，时间分段剧本 |
| `image_pipeline.js` | 221 | Seedream i2i 肖像 + multi-i2i 场景 |
| `video_pipeline.js` | 321 | Seedance 5 模式提交、轮询、下载 |
| `merge_engine.js` | 409 | FFmpeg concat 合并、标题卡、片头片尾 |

## 许可证

仅供个人学习和非商业用途。请遵守 Volcengine Ark 平台使用条款。

## 完善记录（2026-09 借鉴 short-drama-studio 一致性方法论）

- **固定 seed 可复现**：新增 `--seed <n>` 参数；首次运行自动生成 seed 并持久化到 `state.json`，续跑/重生成沿用同一 seed + 同描述即可复现。Seedream 肖像/场景 payload 与 Seedance 视频 payload 均透传该 seed（各朝代共用同一 seed）。
- **identity-lock 身份锚点（三层落点）**：
  - 肖像层：`image_pipeline.js` 的 portrait prompt 追加"面容/脸型/五官/肤色与参考照片完全一致，强识别特征（痣/疤）必须原样保留，禁止美颜漂移"；
  - 场景层：couple scene prompt 追加"男女面容必须与各自参考肖像一致，整幅画面保持不变，无多余人物"；
  - 视频层：`video_pipeline.js` 新增统一 `CONSISTENCY_SUFFIX` 追加到每个朝代 videoPrompt 末尾——"全片同男主同女主、同脸同发型同服装、不新增角色、物件不消失"（对应 short-drama-studio 视频 prompt 六段式中的"一致性要求"段）。
- 之前 volc 版 `videoPrompt` 无一致性要求段（Agnes 免费版有），本次补齐对齐。
- **多模态自动质检（qa_scenes.js，借鉴 qa_frames.py）**：对每个朝代场景帧，把「男方定妆照 + 女方定妆照 + 待检场景帧」喂给 Ark doubao 视觉模型（默认 `doubao-seed-1-6-flash-250615`，可 `--qa-model` 覆盖），按固定 JSON 维度判定：硬性通过 `couple_present / face_match_male / face_match_female / outfit_match（朝代婚礼服饰）/ scene_match（朝代场景、无现代穿帮）`，硬性排除 `extra_person / watermark_or_text`。输出 `work/scene_qa.json`；`--delete-bad` 把坏帧归档到 `scenes/versions/`（保留 3 版）并清 `state.scenes[id]`，重跑主程序即可补缺。用法：`node qa_scenes.js --work-dir work/xxx [--only tang,ming] [--delete-bad] [--offline]`。
- **多宫格批量定妆照（grid_portraits.js，借鉴 grid_gen.py）**：把 N 个朝代的同性别定妆照塞进一张 2xN 宫格图一次生成（i2i 单人参考照 + identity-lock），ffmpeg crop 切格后回填 `state.portraits`（结构与逐张生成完全一致，场景帧阶段可直接使用），省 N-1 张图成本；旧图归档到 `portraits/versions/`。⚠ 宫格内一致性弱于逐张 i2i，适合草稿/初稿；对一致性要求高走主流程。用法：`node grid_portraits.js --male-photo him.jpg --female-photo her.jpg --work-dir work/xxx [--gender both] [--grid auto] [--force]`。`ark_client.js` 新增 `postChatCompletion`（OpenAI 兼容 /chat/completions）供质检复用。

## 完善记录（2026-09-19 统一方法论 P0 落地）

- **BGM 声音层（P0-3，借鉴 ManjuForge 声音四层设计）**：`merge_engine.js` 新增 `mixBgm()` +
  `hasAudioStream()`，`--bgm <path>` 参数三处联动（parseArgs/help/merge options）。
  成片若有原声：BGM 以 0.28 音量 amix 垫底 + loudnorm −14 LUFS；若无原声：BGM 成为音轨。
  循环铺满、淡入 1.5s/淡出 2.5s；混音失败仅告警、不影响原片。
- **预算防线（P0-2）**：`validateInputs()` 配置面板新增 Estimate 行——按朝代数估算
  图像调用（肖像 ×2 + 场景 ×1）与视频调用（N × duration），并给出整片耗时区间。

## 完善记录（2026-09-19 补课轮：BGM 情绪弧）
- **BGM 情绪弧（P0-3 补全）**：`--bgm` 默认 `auto`——13 朝代 dynasties.js 各配 `mood` 字段
  （majestic/solemn/tense/serene/lush/nostalgic/warm），`bgm_arc.js` 按 mood 分段选曲、
  段间 0.8s 淡入淡出拼接成整条情绪弧；成片有原声时 `sidechaincompress` 自动避让
  （人声压 BGM，标题卡/转场处原声静默 → 音乐自然浮起）。
- **内置曲库**：`bgm/manifest.json` 声明 mood→曲目（`bgm/<mood>.mp3`，自备放入即生效）；
  缺文件时按和弦参数用 ffmpeg lavfi 合成 64s 环境垫乐占位（零新增依赖，可听但简单）。
- **`--dry-run` / `--no-bgm`**：dry-run 全链路（合并+情绪弧+混音）只打印 ffmpeg 命令不执行。
