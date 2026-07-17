# AI Skills 工程集合

> 一套面向 AI 多媒媒体创作的 TRAE Skills 集合 — 涵盖文生图、图生图、文生视频、图生视频、AI 音乐生成，以及基于真实照片的跨朝代婚礼电影自动化流水线。

[![Platform](https://img.shields.io/badge/Platform-TRAE-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-12%2B-green)]()
[![License](https://img.shields.io/badge/License-Personal%20Use-lightgrey)]()
[![Skills](https://img.shields.io/badge/Skills-5-orange)]()

---

## 目录

- [简介](#简介)
- [技能总览](#技能总览)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [环境准备](#环境准备)
- [技能详解](#技能详解)
  - [agnes-image-gen-2 — 电影级 AI 图片生成](#1-agnes-image-gen-2--电影级-ai-图片生成)
  - [agnes-video-gen-2 — 电影级 AI 视频生成](#2-agnes-video-gen-2--电影级-ai-视频生成)
  - [cross-era-wedding — 跨时空婚礼电影（Agnes + FaceFusion）](#3-cross-era-wedding--跨时空婚礼电影agnes--facefusion)
  - [volc-wedding — 跨时空婚礼电影（Volcengine Ark）](#4-volc-wedding--跨时空婚礼电影volcengine-ark)
  - [suno-cn-music — AI 音乐创作助手](#5-suno-cn-music--ai-音乐创作助手)
- [朝代列表](#朝代列表)
- [婚礼电影方案对比](#婚礼电影方案对比)
- [通用注意事项](#通用注意事项)
- [故障排查](#故障排查)
- [快速选择指南](#快速选择指南)
- [许可证](#许可证)

---

## 简介

本工程聚合了 5 个独立的 TRAE Skills，覆盖 AI 创作的核心场景：**图片生成、视频生成、音乐创作、跨时空婚礼电影**。所有脚本仅使用 Node.js 内置模块（`https`、`fs`、`path` 等），**无需 `npm install`**，开箱即用。

**核心亮点：**

- **零依赖**：纯 Node.js 内置模块，无需安装任何 npm 包
- **多平台支持**：Agnes、火山方舟 Ark、Suno.cn 三大 AI 平台
- **电影级画质**：自动追加 cinematic lighting、8K、HDR 等修饰词
- **断点续跑**：婚礼电影类技能支持 `state.json` 中断恢复
- **跨朝代叙事**：13 个中国历史朝代完整配置，每个朝代独立服装 / 场景 / 风俗
- **面部复刻**：FaceFusion 换脸（80%+）或 Seedream i2i 保留五官特征
- **文件持久化**：两步式下载 + 只读属性，确保视频文件不被清空

---

## 技能总览

| 技能 | 一句话说明 | 依赖平台 | 运行依赖 | 耗时参考 |
|------|-----------|---------|---------|---------|
| `agnes-image-gen-2` | Agnes Image 2.1 Flash 电影级图片生成（文生图 / 图生图） | Agnes Image API | Node.js 12+ | 单张约 10–30 秒 |
| `agnes-video-gen-2` | Agnes Video V2.0 电影级视频生成（4 种工作流） | Agnes Video API | Node.js 12+ | 单段约 1–5 分钟 |
| `cross-era-wedding` | 跨时空婚礼电影生成器（Agnes + FaceFusion 换脸） | Agnes API + FaceFusion + FFmpeg | Node.js 12+、Python 3.10+（可选）、FFmpeg 4.4+ | 2 朝代约 10–15 分钟，4 朝代约 20–30 分钟 |
| `volc-wedding` | 基于 Volcengine Ark 的跨时空婚礼电影生成器 | 火山方舟 Ark API + FFmpeg | Node.js 12+、FFmpeg 4.4+ | 4 朝代约 15–25 分钟 |
| `suno-cn-music` | Suno.cn AI 音乐创作助手（8 个 REST API） | Suno.cn API | 无（HTTP REST 调用） | 单首约 1–3 分钟 |

---

## 目录结构

```
d:\ai_work\skills\
├── README.md                          # 本文件
├── agnes-image-gen-2/
│   ├── SKILL.md                       # 技能定义与使用文档
│   └── scripts/
│       └── agnes_image_gen.js         # 图片生成脚本（t2i / i2i）
├── agnes-video-gen-2/
│   ├── SKILL.md
│   └── scripts/
│       └── agnes_video_gen.js         # 视频生成脚本（4 种工作流）
├── cross-era-wedding/
│   ├── SKILL.md
│   └── scripts/
│       ├── cross_era_wedding.js       # 婚礼电影主流水线
│       ├── dynasties.js               # 朝代配置（13 朝）
│       └── install_facefusion.bat     # FaceFusion 安装脚本（Windows）
├── volc-wedding/
│   ├── README.md                      # Volc Wedding 专项说明
│   ├── SKILL.md
│   └── scripts/
│       ├── volc_wedding.js            # 主入口 CLI + 状态机（432 行）
│       ├── ark_client.js              # Ark API 通信封装（151 行）
│       ├── dynasties.js               # 13 朝代配置 + 分镜剧本（536 行）
│       ├── image_pipeline.js          # Seedream 肖像 + 场景生成（221 行）
│       ├── video_pipeline.js          # Seedance 5 模式视频生成（321 行）
│       └── merge_engine.js            # FFmpeg 合并 + 标题卡（409 行）
└── suno-cn-music/
    ├── SKILL.md                       # 完整 API 调用规范（8 个 API）
    ├── install.bat                    # Windows 安装脚本
    └── install.sh                     # Linux/macOS 安装脚本
```

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/smart-open/skills.git
cd skills
```

### 2. 配置 API Key

根据你要使用的技能，设置对应的环境变量（任选一种方式）：

```powershell
# Windows PowerShell
$env:agnes-api-key = "sk-xxxx"        # Agnes 图片/视频/cross-era-wedding
$env:ARK_API_KEY = "your-ark-key"     # volc-wedding
$env:SUNO_CN_API_KEY = "sk-xxxx"      # suno-cn-music
```

```bash
# Linux/macOS
export agnes-api-key="sk-xxxx"
export ARK_API_KEY="your-ark-key"
export SUNO_CN_API_KEY="sk-xxxx"
```

### 3. 运行技能

```bash
# 生成一张电影级图片
node agnes-image-gen-2/scripts/agnes_image_gen.js \
  --mode t2i --prompt "日落时分薄雾峡谷上方的发光浮空城市" \
  --output "output.png"

# 生成一段 AI 视频
node agnes-video-gen-2/scripts/agnes_video_gen.js \
  --workflow text2video --prompt "猫在日落海滩漫步" \
  --output "cat.mp4"

# 生成跨时空婚礼电影（火山方舟版）
node volc-wedding/scripts/volc_wedding.js \
  --male-photo "groom.jpg" --female-photo "bride.jpg" \
  --dynasties "tang,song,ming,modern" --add-title --add-ending
```

---

## 环境准备

### 必需环境

| 依赖 | 版本 | 说明 | 安装方式 |
|------|------|------|---------|
| Node.js | 12+ | 所有脚本运行基础 | [nodejs.org](https://nodejs.org/) |
| FFmpeg | 4.4+ | 视频合并与转场（婚礼电影类技能） | `winget install Gyan.FFmpeg`（Windows） |

### API Key 配置

不同技能使用不同的 API Key：

| 技能 | 环境变量 | 命令行参数 | 获取方式 |
|------|---------|-----------|---------|
| agnes-image-gen-2 / agnes-video-gen-2 / cross-era-wedding | `agnes-api-key` 或 `AGNES_API_KEY` | `--api-key` | Agnes 平台 |
| volc-wedding | `ARK_API_KEY` | `--api-key` | [火山方舟控制台](https://console.volcengine.com/ark) |
| suno-cn-music | `SUNO_CN_API_KEY` | — | https://www.suno.cn/home/#/mcp |

> **优先级**：命令行参数 `--api-key` > 环境变量。如上下文中直接给出 Key，务必通过 `--api-key` 传入，不要写入环境变量文件。

### 可选依赖

| 依赖 | 版本 | 用途 | 适用技能 | 安装方式 |
|------|------|------|---------|---------|
| Python | 3.10+ | FaceFusion 运行环境 | cross-era-wedding | [python.org](https://www.python.org/) |
| FaceFusion | 最新 | 真实面部替换，80%+ 面部复刻 | cross-era-wedding | `scripts/install_facefusion.bat` 或 `git clone https://github.com/facefusion/facefusion.git` |
| Git | 任意 | FaceFusion 安装需要 | cross-era-wedding | [git-scm.com](https://git-scm.com/) |

**FaceFusion 安装（Windows）：**

```powershell
# 方式1：使用附带脚本
.\cross-era-wedding\scripts\install_facefusion.bat

# 方式2：手动安装
git clone https://github.com/facefusion/facefusion.git
cd facefusion
python install.py --onnxruntime cpu

# 安装后设置环境变量
$env:FACEFUSION_PATH = "C:\facefusion\run.py"
```

---

## 技能详解

### 1. agnes-image-gen-2 — 电影级 AI 图片生成

通过 **Agnes Image 2.1 Flash** 官方 API 生成电影级、高清、精美的图片。

**支持模式：**
- **文生图（t2i）**：纯文本描述生成图片
- **图生图（i2i）**：基于现有图片转换 / 编辑

**文生图示例：**
```bash
node agnes-image-gen-2/scripts/agnes_image_gen.js \
  --mode t2i \
  --prompt "一位古典西汉美女，曲裾深衣，堕马髻，朱红宫殿背景" \
  --size 768x1024 \
  --output "output.png" \
  --api-key "sk-xxxx"
```

**图生图示例：**
```bash
node agnes-image-gen-2/scripts/agnes_image_gen.js \
  --mode i2i \
  --prompt "将场景转换为雨夜赛博朋克霓虹，保留原始构图" \
  --image "input.png" \
  --output "out_i2i.png" \
  --api-key "sk-xxxx"
```

**推荐尺寸：**

| 用途 | 尺寸 | 比例 | 适用场景 |
|------|------|------|---------|
| 社交媒体竖版 / 手机海报 | `1080x1920` | 9:16 | 抖音、朋友圈、小红书封面 |
| 社交媒体方形海报 | `1024x1024` | 1:1 | Instagram、朋友圈九宫格 |
| 电商 / 活动横版海报 | `1920x600` | 16:9 | 网站 Banner、视频封面 |

**参数速查：**

| 参数 | 说明 | 必填 | 默认 |
|------|------|------|------|
| `--prompt` / `-p` | 文本指令 | 是 | — |
| `--mode` / `-m` | `t2i` 或 `i2i` | 否 | `t2i` |
| `--size` / `-s` | 输出尺寸 | 否 | `1024x1024` |
| `--image` / `-i` | 图生图输入（路径/URL/data URI，可多个） | 图生图必填 | — |
| `--output` / `-o` | 输出文件路径 | 否 | 自动命名 |
| `--format` / `-f` | `url` 或 `b64_json` | 否 | `url` |
| `--api-key` | API key | 视情况 | 环境变量 |
| `--no-enhance` | 关闭自动电影质感增强 | 否 | 开启 |

> 脚本自动追加电影质感修饰词（cinematic lighting、8K、HDR 等），支持本地图片 base64 上传。

---

### 2. agnes-video-gen-2 — 电影级 AI 视频生成

通过 **Agnes Video V2.0** 官方 API 生成电影级视频，支持四种工作流。

| 工作流 | `--workflow` 值 | 说明 | 是否需要图片 |
|--------|----------------|------|-------------|
| 文生视频 | `text2video` | 纯文本描述生成视频（默认） | 否 |
| 图生视频 | `image2video` | 为单张图片添加动画 | 是（1 张） |
| 多图视频 | `multi2video` | 多张参考图引导生成 | 是（≥2 张） |
| 关键帧动画 | `keyframes` | 在关键帧之间生成流畅过渡 | 是（≥2 张） |

**默认参数：** 1152×768（16:9）、121 帧、24fps（约 5 秒），开箱即用。

**文生视频示例：**
```bash
node agnes-video-gen-2/scripts/agnes_video_gen.js \
  --workflow text2video \
  --prompt "一只猫在日落时的海滩上漫步，柔和海浪，温暖金色光线" \
  --output "cat_beach.mp4" \
  --api-key "sk-xxxx"
```

**时长与帧数对照：**

| 目标时长 | num_frames | frame_rate | 备注 |
|---------|------------|------------|------|
| 约 3 秒 | `81` | `24` | 短视频 |
| 约 5 秒（默认） | `121` | `24` | 最稳妥 |
| 约 10 秒 | `241` | `24` | 较长 |
| 约 18 秒（最长） | `441` | `24` | 上限 |

> `num_frames` 必须满足 `8n+1` 规则且 ≤441。

**参数速查：**

| 参数 | 说明 | 必填 | 默认 |
|------|------|------|------|
| `--prompt` / `-p` | 文本描述 | 是 | — |
| `--workflow` / `-w` | `text2video`/`image2video`/`multi2video`/`keyframes` | 否 | `text2video` |
| `--image` / `-i` | 图片 URL（可多个） | 图生/多图/关键帧必填 | — |
| `--width` | 视频宽度 | 否 | `1152` |
| `--height` | 视频高度 | 否 | `768` |
| `--num-frames` / `-n` | 帧数（8n+1，≤441） | 否 | `121` |
| `--frame-rate` | 帧率 1–60 | 否 | `24` |
| `--seed` | 随机种子（可复现） | 否 | 随机 |
| `--negative-prompt` | 反向提示词 | 否 | — |
| `--output` / `-o` | 输出文件路径 | 否 | 自动命名 |
| `--url-only` | 只获取 VIDEO_URL，不下载（推荐） | 否 | 关闭 |
| `--max-wait` | 最长等待（秒） | 否 | `1200` |

> **推荐两步式流程**：第 1 步用 `--url-only` 获取 URL（长进程），第 2 步用短命令下载并立即设只读属性。

---

### 3. cross-era-wedding — 跨时空婚礼电影（Agnes + FaceFusion）

从两张个人照片出发，穿越 2–4 个中国历史朝代，生成"几生几世跨时空相爱"的电影级婚礼短片。

**核心流程：**

```
用户照片(男) ──┐
用户照片(女) ──┤
               │
     ① Agnes t2i 生成朝代双人场景首帧
               ↓
     ② FaceFusion 换脸增强（男→女顺序替换，80%+ 面部复刻）
               ↓
     ③ Agnes i2i 上传换脸后首帧获取公开 URL
               ↓
     ④ Agnes image2video 生成每朝代视频（约 5–8 秒）
               ↓
     ⑤ FFmpeg xfade/acrossfade 合并 + 片头片尾
               ↓
          最终婚礼电影 MP4
```

**基本用法：**
```bash
node cross-era-wedding/scripts/cross_era_wedding.js \
  --male-photo "groom.jpg" \
  --female-photo "bride.jpg" \
  --dynasties tang,song,ming,modern \
  --add-title --add-ending \
  --output "wedding.mp4"
```

**断点续跑：**
```bash
node cross-era-wedding/scripts/cross_era_wedding.js \
  --resume \
  --work-dir "work/20250101-120000-xxxx"
```

**重生成单个朝代：**
```bash
node cross-era-wedding/scripts/cross_era_wedding.js \
  --resume \
  --work-dir "work/20250101-120000-xxxx" \
  --regenerate tang
```

**禁用换脸（纯 Agnes 模式，面部相似度约 50–60%）：**
```bash
node cross-era-wedding/scripts/cross_era_wedding.js \
  --male-photo "groom.jpg" \
  --female-photo "bride.jpg" \
  --dynasties tang,song,ming,modern \
  --no-face-swap \
  --output "wedding.mp4"
```

**参数速查：**

| 参数 | 说明 | 必填 | 默认 |
|------|------|------|------|
| `--male-photo <path>` | 男方照片路径 | 是 | — |
| `--female-photo <path>` | 女方照片路径 | 是 | — |
| `--dynasties <ids>` | 逗号分隔的朝代 ID（2–4 个） | 是 | — |
| `--transition-duration <s>` | 转场时长（秒） | 否 | `1.0` |
| `--add-title` | 添加片头 | 否 | 关闭 |
| `--add-ending` | 添加片尾 | 否 | 关闭 |
| `--output <path>` | 最终输出 MP4 路径 | 否 | 自动 |
| `--resume` | 从 state.json 断点续跑 | 否 | 关闭 |
| `--regenerate <id>` | 重生成指定朝代 | 否 | — |
| `--no-face-swap` | 禁用 FaceFusion 换脸 | 否 | 关闭 |
| `--facefusion-path <path>` | FaceFusion run.py 路径 | 否 | 自动检测 |
| `--api-key <key>` | Agnes API Key | 否 | 环境变量 |
| `--num-frames <n>` | 每朝代视频帧数 | 否 | `121`（约 5 秒） |
| `--frame-rate <n>` | 视频帧率 | 否 | `24` |

**帧数与时长对照：**

| 帧数 | 时长（@24fps） | 备注 |
|------|---------------|------|
| `121` | ~5.0 秒 | 默认，最稳妥 |
| `169` | ~7.0 秒 | 推荐 |
| `193` | ~8.0 秒 | 推荐 |
| `241` | ~10.0 秒 | 较长 |

**输出文件结构：**
```
work/{YYYYMMDD-HHMMSS-sessionId}/
├── state.json                 # 断点状态
├── frames/                    # 原始首帧
│   └── {dynasty}_scene.jpg
├── swapped/                   # 换脸后首帧
│   ├── {dynasty}_male_swapped.jpg
│   └── {dynasty}_final.jpg
├── videos/                    # 单朝代视频
│   └── {dynasty}.mp4
├── temp/                      # 中间文件
│   ├── title.mp4
│   ├── ending.mp4
│   └── concat_list.txt
└── final/                     # 最终输出
    └── wedding_movie_{id}.mp4
```

---

### 4. volc-wedding — 跨时空婚礼电影（Volcengine Ark）

基于 **火山方舟 Ark** 平台，使用 **Seedream 5.0 Pro** 生成朝代 AI 肖像与场景，**Seedance 2.0** 生成电影质感动态视频。

**核心流程：**

```
用户照片（男女各1张）
       │
       ▼
  Seedream i2i     →  生成朝代 AI 肖像（保留五官，朝代服饰，1424×800）
       │
       ▼
  Seedream multi-  →  男女肖像参考生成双人场景首帧
    i2i 场景图
       │
       ▼
  Seedance 视频    →  首帧/参考图驱动生成 cinematic 视频（无音频）
    生成
       │
       ▼
  FFmpeg 合并      →  朝代标题卡 → 视频 → 片头片尾（concat demuxer）
    输出
```

**效果预览（战国/唐/明/现代 四朝代，约 50 秒）：**

| 片段 | 时长 | 内容 |
|------|------|------|
| 片头 | 4s | 黑底金字 "几生几世 跨时空相爱" |
| 战国 | 2.5s 标题卡 + 8s 视频 | 烽火佳人 — 烽火连天下的重逢之誓 |
| 唐朝 | 2.5s 标题卡 + 8s 视频 | 大唐盛世 — 长安灯火下的千年之约 |
| 明朝 | 2.5s 标题卡 + 8s 视频 | 凤冠霞帔 — 紫禁城中的凤冠之约 |
| 现代 | 2.5s 标题卡 + 8s 视频 | 永恒誓言 — 山海之间的永恒承诺 |
| 片尾 | 5s | 黑底白字 "今生今世 永不分离" |

**基本用法：**
```powershell
$env:ARK_API_KEY = "your-ark-api-key"

node volc-wedding/scripts/volc_wedding.js `
  --male-photo "groom.jpg" `
  --female-photo "bride.jpg" `
  --dynasties "warring,tang,ming,modern" `
  --add-title --add-ending
```

**视频生成模式：**

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `first-frame`（默认） | 场景图作首帧，Seedance 延续画面 | 场景一致性最佳 |
| `first-last-frame` | 首尾帧双约束，生成过渡视频 | 需要明确起止画面 |
| `multimodal` | 肖像作参考 + 场景作首帧 | 增强面部一致性 |
| `portrait-reference` | 仅肖像参考，文字驱动场景 | 自由度高 |
| `text2video` | 纯文本，跳过图片生成 | 最快但一致性最低 |

**视频模型选择：**

| 版本 | 模型 ID | 特点 | 适用场景 |
|------|---------|------|---------|
| 标准版（默认） | `doubao-seedance-2-0-260128` | 画质最佳 | 正式输出 |
| Mini 快速版 | `doubao-seedance-2-0-mini-260615` | 速度更快 | 快速预览 |
| Fast 极速版 | `doubao-seedance-2-0-fast-260128` | 极速生成 | 最快验证 |

**参数速查：**

| 参数 | 说明 | 必填 | 默认 |
|------|------|------|------|
| `--male-photo <path>` | 男方照片路径 | 是 | — |
| `--female-photo <path>` | 女方照片路径 | 是 | — |
| `--dynasties <ids>` | 逗号分隔的朝代 ID（2–5 个） | 是 | — |
| `--custom-desc <text>` | 个人故事描述，融入场景生成 | 否 | — |
| `--mode <mode>` | 视频模式 | 否 | `first-frame` |
| `--video-model <id>` | Seedance 模型 ID | 否 | 标准版 |
| `--duration <s>` | 每段视频时长（4–15 秒） | 否 | `8` |
| `--ratio <r>` | 宽高比：`16:9` / `9:16` | 否 | `16:9` |
| `--resolution <r>` | 分辨率：`480p` / `720p` / `1080p` | 否 | `720p` |
| `--transition-duration <s>` | 转场时长（秒） | 否 | `1.0` |
| `--add-title` | 添加片头 | 否 | false |
| `--add-ending` | 添加片尾 | 否 | false |
| `--add-subtitles` | 每段添加朝代信息字幕 | 否 | false |
| `--output <path>` | 最终输出 MP4 路径 | 否 | 自动 |
| `--resume` | 从 state.json 断点续跑 | 否 | false |
| `--regenerate <id>` | 重生成指定朝代 | 否 | — |
| `--api-key <key>` | Ark API Key | 否 | 环境变量 |

**技术架构：**

| 文件 | 行数 | 职责 |
|------|------|------|
| `volc_wedding.js` | 432 | 主入口 CLI，状态机，流水线编排 |
| `ark_client.js` | 151 | Ark API 通信封装，指数退避重试 |
| `dynasties.js` | 536 | 13 朝代配置，英文 prompt，时间分段剧本 |
| `image_pipeline.js` | 221 | Seedream i2i 肖像 + multi-i2i 场景 |
| `video_pipeline.js` | 321 | Seedance 5 模式提交、轮询、下载 |
| `merge_engine.js` | 409 | FFmpeg concat 合并、标题卡、片头片尾 |

> 纯 Node.js 实现，零外部依赖，全部代码约 2,070 行。

---

### 5. suno-cn-music — AI 音乐创作助手

通过 Suno.cn HTTP REST API 实现 AI 音乐创作，提供 8 个 API 接口。

**API 列表：**

| API | 方法 | 端点 | 功能 |
|-----|------|------|------|
| 查询账户信息 | GET | `/mcp/api/user` | 积分、余额、会员状态 |
| 生成音乐 | POST | `/mcp/api/generate` | AI 模式 / 自定义歌词模式 |
| 查询任务状态 | GET | `/mcp/api/task/{serial_no}` | 轮询生成进度 |
| 查询音乐列表 | GET | `/mcp/api/music` | 分页查看历史记录 |
| 获取歌词 | GET | `/mcp/api/lyrics/{serial_no}` | 获取 LRC 格式歌词 |
| 续写音乐 | POST | `/mcp/api/extend` | 在已有歌曲基础上续写 |
| AI 生成歌词 | POST | `/mcp/api/gen-lyrics` | 先生成歌词再创作音乐 |
| 上传参考音频 | POST | `/mcp/api/upload` | MP3 上传（cover/添加人声/伴奏/音轨） |

**Base URL:** `https://mcp.suno.cn`
**认证:** `Authorization: Bearer ${SUNO_CN_API_KEY}`

**支持的模型版本：**

| 别名 | 模型版本 | 说明 |
|------|---------|------|
| v5.5 | `chirp-fenix` | 最新，默认 |
| v5 | `chirp-crow` | — |
| v4.5+ | `chirp-bluejay` | — |
| v4.5 | `chirp-auk` | — |
| v4.5-all | `chirp-auk-turbo` | — |
| v4 | `chirp-v4` | — |
| v3.5 | `chirp-v3-5` | — |

**生成音乐示例（AI 模式）：**
```bash
POST https://mcp.suno.cn/mcp/api/generate
Body: {
  "prompt": "关于夏天的流行歌曲",
  "mv": "chirp-fenix",
  "custom_mode": false
}
```

**生成音乐示例（自定义歌词模式）：**
```bash
POST https://mcp.suno.cn/mcp/api/generate
Body: {
  "prompt": "[Verse]\n阳光洒在海面\n微风吹拂着脸\n\n[Chorus]\n这是我们的夏天",
  "custom_mode": true,
  "tags": "pop, folk, c-pop"
}
```

> `tags` 风格标签**必须使用英文**（如 `pop, folk, electronic`），禁止传入中文标签。

**上传参考音频支持的操作：**

| 用户意图 | reference_operation | 时长限制 |
|---------|---------------------|---------|
| 扩展/续写 | `extend` | 10–120 秒 |
| 添加人声 | `add_vocals` | 20–240 秒 |
| 添加伴奏 | `add_instrumental` | 20–240 秒 |
| cover/翻唱 | `cover` | 10–480 秒 |
| 添加音轨 | `add_stem` | 10–240 秒 |

> 仅支持 MP3 格式，最大 50MB。

---

## 朝代列表

cross-era-wedding 和 volc-wedding 均支持以下 13 个中国历史朝代：

| ID | 朝代 | 核心主题 | 年代 | 故事概述（volc-wedding） |
|----|------|---------|------|--------------------------|
| `xia` | 夏 | 华夏初光 / 上古盟誓 | c.2070–1600 BCE | — |
| `xizhou` | 西周 | 礼乐天下 / 礼乐婚典 | 1046–771 BCE | — |
| `warring` | 战国 | 烽火佳人 / 剑客侠侣 | 475–221 BCE | 烽火连天下的重逢之誓 |
| `han` | 汉 | 大汉雄风 / 汉风红妆 | 202 BCE–220 CE | — |
| `jin` | 晋 | 魏晋风流 / 魏晋风骨 | 265–420 | — |
| `nanbeichao` | 南北朝 | 乱世情缘 / 丝路情缘 | 420–589 | — |
| `tang` | 唐 | 大唐盛世 | 618–907 | 长安灯火下的千年之约 |
| `song` | 宋 | 宋韵清雅 | 960–1279 | — |
| `yuan` | 元 | 草原雄鹰 / 草原盟约 | 1271–1368 | — |
| `ming` | 明 | 凤冠霞帔 | 1368–1644 | 紫禁城中的凤冠之约 |
| `qing` | 清 | 满汉情深 / 满汉合璧 | 1644–1912 | — |
| `minguo` | 民国 | 十里洋场 | 1912–1949 | — |
| `modern` | 现代 | 永恒誓言 | 1949–Present | 山海之间的永恒承诺 |

> volc-wedding 中带"故事概述"的朝代已配置完整的电影级时间分段分镜剧本（0–2s / 2–5s / 5–8s）。

---

## 婚礼电影方案对比

两个婚礼电影技能各有优势，根据需求选择：

| 维度 | cross-era-wedding | volc-wedding |
|------|-------------------|--------------|
| AI 平台 | Agnes Image/Video | Volcengine Ark（豆包） |
| 图片模型 | Agnes Image 2.1 Flash | Seedream 5.0 Pro |
| 视频模型 | Agnes Video V2.0（固定） | Seedance 2.0（3 个版本可选） |
| 面部复刻方式 | FaceFusion 换脸（80%+） | Seedream i2i 保留五官特征 |
| 面部复刻依赖 | 需 Python + FaceFusion | 无额外依赖 |
| 朝代数量 | 2–4 个 | 2–5 个 |
| 视频生成模式 | image2video | 5 种模式（first-frame / first-last-frame / multimodal / portrait-reference / text2video） |
| 朝代标题卡 | 可选片头片尾 | 每朝代标题卡 + 片头片尾 |
| 分镜剧本 | 无 | 战国/唐/明/现代已配置时间分段剧本 |
| 断点续跑 | 支持 | 支持 |
| 单段重生成 | 支持 | 支持 |
| 代码规模 | ~3 个文件 | ~6 个文件，约 2,070 行 |
| 适用场景 | 需要高面部相似度 | 无需 Python，快速生成，画质更精细 |

---

## 通用注意事项

1. **文件持久化（关键）**：视频生成类技能生成的 MP4 文件需立即设置只读属性，防止工作区自动清空为 0 字节。
   ```powershell
   # Windows PowerShell
   (Get-Item "output.mp4").IsReadOnly = $true
   ```
   ```bash
   # Linux/macOS
   chmod 444 output.mp4
   ```

2. **两步式下载**：长时间视频任务建议先用 `--url-only` 获取 URL（长进程），再用短命令下载并设只读，避免长进程退出后文件丢失。

3. **帧数规则**：Agnes 视频的 `num_frames` 必须满足 `8n+1`（如 1, 9, 17, ..., 121, 241, 441）且 ≤441。

4. **API Key 安全**：如上下文中直接给出 Key，通过 `--api-key` 参数传入，不要写入环境变量文件或代码中。

5. **断点续跑**：cross-era-wedding 和 volc-wedding 均通过 `state.json` 支持中断后恢复，使用 `--resume` + `--work-dir` 继续。

6. **照片建议**：婚礼电影类技能使用正面清晰照片，光线均匀，面部无遮挡，效果最佳。

7. **并发控制**：视频生成任务并发数为 2，避免 API 限流。

8. **FFmpeg 降级**：若 FFmpeg < 4.4，自动使用 `concat demuxer` 无转场拼接。

---

## 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| `FFmpeg not found` | 未安装 FFmpeg | Windows: `winget install Gyan.FFmpeg` |
| `Request body size exceeds 64MB` | 照片文件过大 | 压缩照片至 2MB 以下 |
| 视频任务 `failed` | 首帧敏感内容 / API 限流 | 用 `--regenerate <id>` 重试 |
| 面部保留度低 | 照片角度 / 光线不佳 | 使用正面高清照片，volc-wedding 尝试 `--mode multimodal` |
| 朝代标题卡片乱码 | 缺少中文字体 | 确认 `C:\Windows\Fonts\simhei.ttf` 存在 |
| 断点续跑找不到目录 | 工作目录路径错误 | 用 `--work-dir` 指定之前的完整工作目录路径 |
| 生成的 MP4 变为 0 字节 | 未设只读属性 | 下载后立即 `IsReadOnly=$true` 或 `chmod 444` |
| API 401/403 | API Key 无效或过期 | 检查对应环境变量或 `--api-key` 参数 |
| API 5xx / 超时 | 服务器繁忙 | 稍后重试，脚本已内置指数退避重试 |
| FaceFusion 未检测到 | 未安装或路径未配置 | 运行 `install_facefusion.bat` 或设置 `FACEFUSION_PATH` |
| Agnes 视频帧数报错 | `num_frames` 不满足 8n+1 | 使用合法值：81, 121, 169, 193, 241, 441 |
| Suno.cn 中文标签报错 | tags 传入中文 | 改用英文标签：`pop, folk, electronic` |

---

## 快速选择指南

| 需求 | 推荐技能 | 理由 |
|------|---------|------|
| 生成一张精美 AI 图片 | `agnes-image-gen-2` | 电影级画质，文生图 / 图生图 |
| 生成一段 AI 视频 | `agnes-video-gen-2` | 4 种工作流，灵活选择 |
| 创作一首 AI 音乐 | `suno-cn-music` | 8 个 API，全流程覆盖 |
| 婚礼电影 — 需高面部相似度 | `cross-era-wedding` | FaceFusion 换脸 80%+ |
| 婚礼电影 — 无需 Python，快速生成 | `volc-wedding` | Seedream i2i 保留五官，零额外依赖 |
| 婚礼电影 — 需要分镜剧本 | `volc-wedding` | 战国/唐/明/现代已配置时间分段剧本 |
| 婚礼电影 — 朝代较多（5 个） | `volc-wedding` | 支持 2–5 个朝代 |

---

## 许可证

仅供个人学习和非商业用途。请遵守各 AI 平台的使用条款：

- **Agnes** — Agnes Image / Video API 使用条款
- **Volcengine Ark** — 火山方舟平台使用条款
- **Suno.cn** — Suno.cn 服务条款
- **FaceFusion** — [MIT License](https://github.com/facefusion/facefusion/blob/master/LICENSE)
