# AI Skills 工程集合

> 一套面向 AI 多媒媒体创作的 TRAE Skills 集合 — 涵盖文生图、图生图、文生视频、图生视频、AI 音乐生成，以及基于真实照片的跨朝代婚礼电影自动化流水线。

[![Platform](https://img.shields.io/badge/Platform-TRAE-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-12%2B-green)]()
[![License](https://img.shields.io/badge/License-Personal%20Use-lightgrey)]()
[![Skills](https://img.shields.io/badge/Skills-14-orange)]()

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
  - [comedy-show — 爆款舞台美女脱口秀视频生成器](#6-comedy-show--爆款舞台美女脱口秀视频生成器)
  - [tech-article-craft — 自包含技术文章生成器](#7-tech-article-craft--自包含技术文章生成器)
  - [learning-handbook-pipeline — 图文并茂 PDF 学习手册生成流水线](#8-learning-handbook-pipeline--图文并茂-pdf-学习手册生成流水线)
  - [enterprise-portal-generator — 企业门户网站一键生成器](#9-enterprise-portal-generator--企业门户网站一键生成器)
  - [music-downloader — 国内 5 大音乐平台歌曲下载器](#10-music-downloader--国内-5-大音乐平台歌曲下载器)
  - [a-stock-operator — A 股市场操盘手](#11-a-stock-operator--a-股市场操盘手)
  - [dev-lifecycle — 软件开发生命周期编排](#12-dev-lifecycle--软件开发生命周期编排)
  - [a-stock-operator-v2 — A 股行情复盘与个股诊断（增强版）](#13-a-stock-operator-v2--a-股行情复盘与个股诊断增强版)
  - [lhb-t3-recommender — 龙虎榜 T+3 涨停推荐与自进化模型](#14-lhb-t3-recommender--龙虎榜-t3-涨停推荐与自进化模型)
- [朝代列表](#朝代列表)
- [婚礼电影方案对比](#婚礼电影方案对比)
- [通用注意事项](#通用注意事项)
- [故障排查](#故障排查)
- [快速选择指南](#快速选择指南)
- [许可证](#许可证)

---

## 简介

本工程聚合了 14 个独立的 TRAE Skills，覆盖 AI 创作的核心场景：**图片生成、视频生成、音乐创作、音乐下载、跨时空婚礼电影、脱口秀视频、技术文章、学习手册、企业门户网站、A 股市场操盘分析、龙虎榜 T+3 涨停推荐、软件开发生命周期编排**。所有脚本仅使用 Node.js 内置模块（`https`、`fs`、`path` 等），**无需 `npm install`**，开箱即用。

**核心亮点：**

- **零依赖**：纯 Node.js 内置模块，无需安装任何 npm 包
- **多平台支持**：Agnes、火山方舟 Ark、Suno.cn 三大 AI 平台
- **电影级画质**：自动追加 cinematic lighting、8K、HDR 等修饰词
- **断点续跑**：婚礼电影与脱口秀类技能支持 `state.json` 中断恢复
- **跨朝代叙事**：13 个中国历史朝代完整配置，每个朝代独立服装 / 场景 / 风俗
- **面部复刻**：FaceFusion 换脸（80%+）或 Seedream i2i 保留五官特征
- **口型同步**：脱口秀视频通过 Wav2Lip 后处理实现口型与 TTS 语音精准对齐
- **文件持久化**：两步式下载 + 只读属性，确保视频文件不被清空
- **可发布技术文章**：自包含 HTML 文章生成，内联 CSS/JS + AI 配图 + HTML/CSS 图表组件
- **图文并茂学习手册**：理论文本蒸馏为 PDF 学习手册，三技能协作（插图 + 图表 + 前端设计）
- **企业门户一键生成**：从公司简介一键生成 6 页生产级企业网站，12 行业预设自适应
- **多平台音乐下载**：5 大国内音乐平台（网易云/QQ/酷狗/咪咕/汽水）搜索下载 MP3 + LRC 歌词
- **A 股操盘分析**：个股六维诊断 + 市场资讯选股推荐，12 个东方财富 API 实时数据 + 6 层数据验证体系
- **A 股行情复盘与个股诊断（增强版）**：金融终端深色主题报告，情绪温度计 + 近一月板块轮动 + 资金四象限 + 全流程一键管线
- **软件开发生命周期编排**：5 阶段 + 每阶段 HITL 确认，前 4 阶段产出文档，第 5 阶段按 SOP 6 步推进开发
- **龙虎榜 T+3 涨停推荐**：可解释逻辑回归概率模型 + 席位画像 + 每日验证重训的自进化机制，时间外 AUC 门控版本迭代

---

## 技能总览

| 技能 | 一句话说明 | 依赖平台 | 运行依赖 | 耗时参考 |
|------|-----------|---------|---------|---------|
| `agnes-image-gen-2` | Agnes Image 2.1 Flash 电影级图片生成（文生图 / 图生图） | Agnes Image API | Node.js 12+ | 单张约 10–30 秒 |
| `agnes-video-gen-2` | Agnes Video V2.0 电影级视频生成（4 种工作流） | Agnes Video API | Node.js 12+ | 单段约 1–5 分钟 |
| `cross-era-wedding` | 跨时空婚礼电影生成器（Agnes + FaceFusion 换脸） | Agnes API + FaceFusion + FFmpeg | Node.js 12+、Python 3.10+（可选）、FFmpeg 4.4+ | 2 朝代约 10–15 分钟，4 朝代约 20–30 分钟 |
| `volc-wedding` | 基于 Volcengine Ark 的跨时空婚礼电影生成器 | 火山方舟 Ark API + FFmpeg | Node.js 12+、FFmpeg 4.4+ | 4 朝代约 15–25 分钟 |
| `suno-cn-music` | Suno.cn AI 音乐创作助手（8 个 REST API） | Suno.cn API | 无（HTTP REST 调用） | 单首约 1–3 分钟 |
| `comedy-show` | 爆款舞台美女脱口秀视频生成器（剧本优化 + TTS + Wav2Lip 口型同步） | Agnes Text/Image/Video API + Edge TTS + Wav2Lip + FFmpeg | Node.js 12+、Python、FFmpeg 4.4+、PyTorch（可选） | 单场景约 3–8 分钟 |
| `tech-article-craft` | 自包含技术文章生成器（内联 CSS/JS HTML + AI 配图 + 图表组件） | GenerateImage + WebSearch/WebFetch | 无（纯模板生成） | 单篇文章约 5–15 分钟 |
| `learning-handbook-pipeline` | 图文并茂 PDF 学习手册生成流水线（三技能协作） | guizang 插图 + fireworks 图表 + design-taste-frontend | Node.js（Puppeteer）、Python（PyMuPDF 验证） | 单本手册约 20–60 分钟 |
| `enterprise-portal-generator` | 企业门户网站一键生成器（6 页生产级网站 + 12 行业预设） | GenerateImage（Hero 图） | 无（纯 HTML/CSS/JS 模板） | 单站点约 10–30 分钟 |
| `music-downloader` | 国内 5 大音乐平台歌曲下载器（MP3 + LRC 歌词） | 网易云/QQ/酷狗/咪咕/汽水 API | Python 3.8+ | 单首约 3–10 秒 |
| `a-stock-operator` | A 股市场操盘手（个股六维诊断 + 市场资讯选股推荐） | 东方财富 API（12 端点）+ 财联社等 5 大财经网站 + integrated_code_mode MCP | 无（纯规范型，通过 MCP 调用 API） | 个股诊断约 2–5 分钟，市场报告约 5–10 分钟 |
| `dev-lifecycle` | 端到端软件开发流程编排（5 阶段 + 每阶段 HITL 确认） | 无（纯规范型，仅 SKILL.md） | 无 | 按项目规模而定 |
| `a-stock-operator-v2` | A 股行情复盘 + 个股诊断（情绪温度计 + 板块轮动专题 + 双权重评分） | 东方财富/腾讯/新浪公开 API + 财联社 | Python 3.10+ | 全流程约 5–10 分钟（`collect_all.py` 一条命令） |
| `lhb-t3-recommender` | 龙虎榜「后期涨停」推荐与自进化模型（T+3 涨停概率 + 席位画像 + 每日验证重训） | 东方财富/同花顺/腾讯 K线公开接口 | Python 3.10+（pandas/scikit-learn） | 首次 init 约 10–15 分钟，其后 daily 每条命令约 1–3 分钟 |

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
├── comedy-show/
│   ├── SKILL.md
│   └── scripts/
│       ├── comedy_show.js            # 主入口 CLI + 4 阶段流水线（531 行）
│       ├── agnes_text_gen.js         # Agnes Text API 封装（158 行）
│       ├── tts_engine.js             # Edge TTS 封装 + ffprobe 时长提取（214 行）
│       ├── lipsync_engine.js         # Wav2Lip 口型同步封装（216 行）
│       ├── merge_engine.js           # FFmpeg 混流 + concat 合并 + 字幕（245 行）
│       └── character_config.js       # 角色描述、宽高比、声音映射配置（261 行）
└── tech-article-craft/
    └── SKILL.md                      # 自包含技术文章生成规范（7 步工作流 + HTML 模板）
├── learning-handbook-pipeline/
    └── SKILL.md                      # PDF 学习手册流水线规范（5 阶段 + 三技能协作）
└── enterprise-portal-generator/
    ├── SKILL.md                      # 企业门户生成规范（7 步工作流 + 3 个调节盘）
    └── references/
        ├── design-system.md          # CSS 设计令牌 + 组件规范 + 动画库
        ├── industry-presets.md       # 12 行业预设（配色/字体/密度/内容模式）
        ├── page-architecture.md      # 6 页页面架构 + 共享组件 + 布局多样性规则
        └── optimization-checklist.md # 60+ 项预飞检查清单 + 反俗套规则
├── music-downloader/
    ├── SKILL.md                      # 音乐下载技能规范（5 平台 + 多 API 回退）
    └── scripts/
        └── batch_download_v4.py      # 下载脚本（569 行，Python）
└── a-stock-operator/
    └── SKILL.md                      # A 股操盘手技能规范（900 行，六大维度 + 12 API 端点 + 6 层数据验证）
└── dev-lifecycle/
    └── SKILL.md                      # 软件开发生命周期编排技能规范（5 阶段 + HITL 确认 + SOP 6 步）
└── a-stock-operator-v2/
    ├── SKILL.md                      # A 股行情复盘 + 个股诊断技能规范（v1.17，Python 管线）
    └── scripts/                      # 全流程管线（collect_all.py 一键采集→检查→模型→报告）
└── lhb-t3-recommender/
    ├── SKILL.md                      # 龙虎榜 T+3 涨停推荐与自进化模型规范（v1.3，Python 管线）
    └── scripts/                      # 全流程管线（run.py init/daily/optimize 等 12 个脚本）
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

# 生成脱口秀视频（段子自动优化 + 口型同步）
node comedy-show/scripts/comedy_show.js \
  --script "早高峰挤地铁，我被压成二维码，扫出来全是救命。" \
  --ratio 9:16 --add-subtitles
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
| edge-tts | 最新 | 中文语音合成（TTS） | comedy-show | `pip install edge-tts` |
| PyTorch（CPU 版） | 最新 | Wav2Lip 推理运行环境 | comedy-show | `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu` |
| Wav2Lip | 最新 | 口型同步后处理 | comedy-show | `git clone https://github.com/Rudrabha/Wav2Lip` |

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

### 6. comedy-show — 爆款舞台美女脱口秀视频生成器

基于 **Agnes AI** 平台（Text + Image + Video 三模态）和 **Edge TTS** 的脱口秀视频生成 Skill。用户输入一段脱口秀段子，系统自动优化剧本、拆分分镜、生成链式舞台视频，最终输出带语音和口型同步的完整脱口秀视频。

**核心流程：**

```
用户输入脱口秀段子
       │
       ▼
  Agnes Text API    →  优化幽默感 + 社会洞察 + 拆分 ~10s 分镜
  agnes-2.0-flash      返回 JSON: optimized_script + scenes[]
       │
       ▼
  Edge TTS          →  并行生成每场景中文语音 MP3
  zh-CN-Xiaoxiao       ffprobe 提取时长 → 计算 num_frames (8n+1)
       │
       ▼
  逐场景串行链式视频生成
  Scene 0: t2i 首帧 → image2video → 末帧 → i2i 重托管
           → mux(视频+音频) → Wav2Lip 口型同步
  Scene 1: 上场景 URL → image2video → ... → Wav2Lip
  Scene N: ...
       │
       ▼
  FFmpeg concat      →  合并所有场景 → 最终 MP4（有画面 + 有声音 + 口型同步）
```

**基本用法：**
```powershell
node comedy-show/scripts/comedy_show.js `
  --script "早高峰挤地铁，我被压成二维码，扫出来全是救命。老板说效益不好要渡劫，我看工资条苦笑：这劫上个月就渡完了！" `
  --ratio 9:16 --api-key "sk-xxxx"
```

**从文件读取段子 + 横版 + 字幕：**
```powershell
node comedy-show/scripts/comedy_show.js `
  --script-file joke.txt `
  --ratio 16:9 --add-subtitles `
  --api-key "sk-xxxx"
```

**断点续跑：**
```powershell
node comedy-show/scripts/comedy_show.js `
  --resume --work-dir "work/20260717-142556-sdad" `
  --api-key "sk-xxxx"
```

**跳过口型同步（加快速度，但口型不对齐）：**
```powershell
node comedy-show/scripts/comedy_show.js `
  --script "段子内容" --no-lipsync --api-key "sk-xxxx"
```

**可用语音：**

| 语音 ID | Edge TTS 声音 | 风格 |
|---------|---------------|------|
| `zh-CN-XiaoxiaoNeural` | 晓晓 | 自然温暖（**默认**，吐字清晰） |
| `zh-CN-XiaoyiNeural` | 晓伊 | 活泼（语速较快） |
| `zh-CN-XiaoyanNeural` | 晓颜 | 亲切 |
| `zh-CN-XiaoruiNeural` | 晓睿 | 成熟 |
| `zh-CN-XiaomoNeural` | 晓墨 | 温柔 |

**参数速查：**

| 参数 | 说明 | 必填 | 默认 |
|------|------|------|------|
| `--script <text>` | 脱口秀段子文本（与 `--script-file` 二选一） | 是* | — |
| `--script-file <path>` | 从文件读取段子 | 是* | — |
| `--api-key <key>` | Agnes API Key | 是 | 环境变量 |
| `--ratio <r>` | 宽高比：`9:16` / `16:9` | 否 | `9:16` |
| `--voice <v>` | Edge TTS 语音 | 否 | `zh-CN-XiaoxiaoNeural` |
| `--rate <r>` | 语速调节（如 `+20%`、`-10%`） | 否 | 默认 |
| `--character-desc <text>` | 角色描述（自定义舞台形象） | 否 | 内置默认 |
| `--output <path>` | 最终输出 MP4 路径 | 否 | 自动 |
| `--add-subtitles` | 在画面底部烧录中文字幕 | 否 | false |
| `--no-lipsync` | 跳过 Wav2Lip 口型同步 | 否 | false |
| `--no-enhance` | 关闭图片质量增强修饰词 | 否 | false |
| `--resume` | 从 state.json 断点续跑 | 否 | false |
| `--regenerate <n>` | 从场景 n 开始重新生成 | 否 | — |
| `--work-dir <dir>` | 工作目录 | 否 | 自动 |

**技术架构：**

| 文件 | 行数 | 职责 |
|------|------|------|
| `comedy_show.js` | 531 | 主入口 CLI，4 阶段流水线编排，状态管理，断点续跑 |
| `agnes_text_gen.js` | 158 | Agnes Text API 封装（剧本优化 + 分镜拆分 + JSON 容错解析） |
| `tts_engine.js` | 214 | Edge TTS 封装（音频生成 + ffprobe 时长提取 + 8n+1 帧数计算） |
| `lipsync_engine.js` | 216 | Wav2Lip 口型同步封装（音频转 WAV + 抽取纯视频流 + Wav2Lip 推理 + 失败回退） |
| `merge_engine.js` | 245 | FFmpeg 封装（末帧提取 + 音视频混流 + concat 合并 + 字幕烧录） |
| `character_config.js` | 261 | 角色描述、宽高比、声音映射、prompt 模板配置 |

> 纯 Node.js 实现，零 npm 依赖，全部代码约 1,625 行。

**输出文件结构：**
```
work/{YYYYMMDD-HHMMSS-sessionId}/
├── state.json              # 进度状态（支持 resume）
├── input_script.txt        # 原始段子备份
├── audio/                  # TTS 音频 per scene
│   └── scene_0.mp3
├── frames/                 # 首帧图片（t2i / i2i 重托管）
│   ├── scene_0.png
│   └── scene_0_rehosted.png
├── last_frames/            # 末帧截图
│   └── scene_0_last.png
├── videos/                 # 无音频视频片段
│   └── scene_0.mp4
├── muxed/                  # 音视频混流 + 口型同步 + 字幕版
│   ├── scene_0_muxed.mp4
│   ├── scene_0_lipsynced.mp4
│   └── scene_0_subtitled.mp4
└── final/                  # 最终输出
    └── comedy_show_{id}.mp4
```

**技术约束：**
- Agnes Video API 仅接受公开 URL，链式传递时通过 i2i 重托管末帧获取公开 URL
- Agnes Video API 不支持音频输入，口型同步通过 Wav2Lip 后处理实现
- `num_frames` 必须满足 `8n+1` 且 ≤441，脚本根据 TTS 音频时长自动计算
- Wav2Lip 口型同步失败时自动回退使用原始混流视频，不中断流程

---

### 7. tech-article-craft — 自包含技术文章生成器

生成**单个自包含、独立可发布的 HTML 技术文章**。每篇文章完全独立 — 无跨文章导航、无共享 CSS/JS、无外部依赖（除 Google Fonts CDN）。输出可直接发布到任何地方：静态主机、文件夹、邮件附件或单文件分享。

**核心原则**：一个 HTML 文件 + 一个 images 文件夹。移动文件夹，文章即可正常工作。无需站点脚手架。

**7 步工作流：**

| 步骤 | 说明 |
|------|------|
| Step 1 | 调研与规划 — 读取源文档（如有）、WebSearch 最新信息、WebFetch 权威来源、规划 6–8 章结构、确定 slug |
| Step 2 | 生成 Hero 图 — `landscape_16_9`（1280×720），电影级暗黑风格，禁止 hex 色码出现在 prompt 中 |
| Step 3 | 生成内联配图 — `landscape_4_3`（1152×864），每个关键章节一张概念图 |
| Step 4 | 生成技术图表 — 优先 HTML/CSS 组件（13 种可用），复杂拓扑用内联 SVG，禁止 Mermaid |
| Step 5 | 编写自包含 HTML — 所有 CSS 内联 `<style>`、所有 JS 内联 `<script>`、图片相对路径、火箭返回顶部动画 |
| Step 6 | 验证文章 — 11 项检查（结构、外部引用、图片、TOC、独立性、footer、火箭动画等） |
| Step 7 | 可选：单文件化 — 将图片转为 base64 data URI 嵌入 HTML，删除 images 文件夹 |

**输出产物：**

| 产物 | 路径 | 说明 |
|------|------|------|
| 文章 HTML | `{output-dir}/{slug}/index.html` | slug 文件夹内固定命名 `index.html` |
| Hero 图 | `{output-dir}/{slug}/images/hero.jpg` | 1280×720，landscape_16_9 |
| 内联配图 | `{output-dir}/{slug}/images/{section}.jpg` | 1152×864，landscape_4_3 |
| SVG 图表 | 内联在 HTML 中（优先）或 `images/{section}.svg` | 小型直接内联 |

> 整个 `{slug}/` 文件夹是分发单元 — 压缩、上传或直接托管。`index.html` 通过相对路径 `images/xxx.jpg` 引用图片，无需服务器即可通过 `file://` 打开。

**内置 HTML/CSS 图表组件（13 种）：**

| 组件类名 | 用途 |
|---------|------|
| `.arch-layer-stack` | 分层架构图 |
| `.skill-cards` / `.skill-card` | 卡片网格 |
| `.hitl-flow` / `.hitl-stage` | 流程图带箭头 |
| `.dataflow-pipeline` | 数据流水线可视化 |
| `.impl-phases` | 实施阶段网格 |
| `.cost-table` | 成本对比表 |
| `.event-topics` | 事件驱动架构网格 |
| `.pain-points` / `.pain-card` | 痛点分析网格 |
| `.match-layers` | 多层匹配引擎 |
| `.router-flow` / `.router-node` | 路由流程图 |
| `.skill-tiers` | 分层架构 |
| `.compare-table` | 功能对比表（带高亮） |
| `.code-block` | 代码/配置示例（带语法高亮） |
| `.callout` | 高亮信息/警告框 |

**设计规范：**

| 变量 | 值 | 用途 |
|------|-----|------|
| `--bg-primary` | `#0a0a0f` | 主背景 |
| `--bg-secondary` | `#12121a` | 卡片、代码块 |
| `--text-primary` | `#e8e8ec` | 正文 |
| `--accent` | `#00f0ff` | 高亮、链接、激活态 |
| `--amber` | `#ffb347` | 警告提示、数字 |
| `--divider` | `#2a2a35` | 边框、分隔线 |

字体：`Inter`（正文）、`JetBrains Mono`（代码）。均从 Google Fonts CDN 加载，离线时降级到系统字体。

**关键规则：**
- 所有 CSS 内联在 `<style>`，所有 JS 内联在 `<script>` — 无外部 `.css`/`.js` 文件
- 所有 `h2` 必须有 `id="section-N"` 供 TOC 锚点
- TOC 由内联脚本自动生成 — 只需提供空 `id="articleToc"` 容器
- 图片路径相对（`images/hero.jpg`）— 禁止 `../../` 前缀
- 文章独立 — 无 `articles-data.js`、无 `articleNav`、无上下篇导航、无顶部菜单、无 footer
- favicon 为内联 SVG data URI
- 返回顶部按钮为火箭图标（内联 SVG），点击播放 `rocket-launch` 垂直升空动画
- 中文引号使用「」，引用使用 `<sup><a href="#cite-N">[N]</a></sup>`

**图片生成禁令（QA 检查清单）：**
每张生成的图片必须不含：意外 logo、水印、UI 边框/装饰、无关英文字符串、hex 色码字符串。

**文章质量检查清单：**
- [ ] 6–8 章节，逻辑清晰
- [ ] Hero 图已生成（landscape_16_9，无 hex 码）
- [ ] 2–4 张关键章节内联配图
- [ ] 2–4 个 HTML/CSS 可视化组件
- [ ] 对比表使用 `.compare-table` 类
- [ ] 代码示例使用 `.code-block` 带语法高亮
- [ ] 引用使用 `<sup>` 链接和 `<li id="cite-N">` 目标
- [ ] 所有 h2 有 `id="section-N"`
- [ ] `markdown-body` 容器类
- [ ] 侧边栏 TOC 容器 `id="articleToc"`
- [ ] 响应式 `@media (max-width: 768px)` 规则
- [ ] 所有 CSS/JS 内联，无外部文件
- [ ] 所有图片路径相对
- [ ] 图片干净（无 logo、水印、UI 边框、无关英文、hex 码）
- [ ] 火箭返回顶部按钮（垂直向上、纯垂直升空动画）
- [ ] 文章可通过 `file://` 渲染，火箭动画可播放

---

### 8. learning-handbook-pipeline — 图文并茂 PDF 学习手册生成流水线

把理论文本蒸馏成图文并茂的 PDF 学习手册的完整流水线。协调三个技能：`guizang-material-illustration`（概念插图）、`fireworks-tech-graph`（技术图表）、`design-taste-frontend-v1`（前端设计系统），产出 HTML 并转 PDF。

**三技能协作架构：**

```
design-taste-frontend-v1（设计总指挥）
  提供设计系统：字体/配色/Bento Grid/反俗套/动效
  │
  ├── guizang-material-illustration（概念视觉）
  │     产出 3D 瑞士编辑风格 PNG，作为内容插图
  │
  └── fireworks-tech-graph（技术图表）
        产出 SVG，作为信息图表嵌入正文

最终 HTML → Puppeteer → PDF
```

> **关键**：三者视觉语言必须预先对齐（配色、强调色、线条、留白），避免风格割裂。

**5 阶段工作流：**

| 阶段 | 说明 |
|------|------|
| Phase 1 | 规划 — 章节结构 + 视觉资产清单 + 设计方案 |
| Phase 2 | 视觉资产生成 — 插图（guizang）+ 图表（fireworks）并行 |
| Phase 3 | HTML 构建 — 字体 + CSS + 图文穿插内容 |
| Phase 4 | PDF 转换 — Puppeteer + 分页优化 |
| Phase 5 | 验证迭代 — 页数、空白页、白边框、图文配比检查 |

**章节结构模板：**
```
封面页（主视觉插图）
序章（心法总览图）
第一章 · 方法论（道）—— 4 方法 + 5 误区
第二章 · 入门篇（术·入门）—— Day1-Day7 每日配图
第三章 · 进阶篇（术·进阶）—— 技能体系
第四章 · 深耕篇（术·深耕）—— 专业迁移
第五章 · 实战项目库（战）—— 阶梯项目
第六章 · 复盘成长（续）—— 闭环与变现
附录（快捷键/FAQ/资源/术语表）
```

**视觉资产清单规则：**
- 每章至少 3 张大图（插图或图表）
- 每个 Day/小节至少 1 张配图
- 关键操作步骤必须配示意图
- 专业术语首次出现配 callout 解释块
- 图文比 ≥ 1:3（每 3 段文字至少 1 张视觉）

**文件组织：**
```
<project>/
├── index.html              # 主 HTML（屏幕预览 + PDF 源）
├── <output>.pdf            # 最终 PDF
├── generate-pdf.js         # Puppeteer 脚本（放交付目录）
├── assets/
│   ├── css/                # fonts.css + main.css + print.css
│   ├── js/                 # main.js（动效）
│   ├── fonts/              # woff2 字体
│   └── images/
│       ├── illustrations/  # guizang PNG
│       └── diagrams/       # fireworks SVG
└── package.json
```

**设计系统基线：**

| 维度 | 规范 |
|------|------|
| 拉丁/数字字体 | Geist + Geist Mono |
| 中文字体 | Noto Sans SC / HarmonyOS Sans SC，fallback 微软雅黑 |
| 主背景 | `#0A0A0B` / `#141416` / `#1C1C1F` |
| 正文文字 | `#FAFAFA` / `#A1A1AA` / `#71717A` |
| 强调色 | 单一琥珀 `#F59E0B`（全书只用一个） |
| 边框 | `#27272A` / `#3F3F46` |
| 版式 | Bento Grid 非对称网格，大字号编辑式标题，章节大留白 |

**概念插图 Prompt 模板（guizang）：**
```
[插图名称]: 3D Swiss editorial style illustration, cinematic material rendering.
<主题隐喻的具体描述>.
Dark background (#141416), amber accent (#F59E0B) on <关键元素>.
Minimalist Swiss design, 3D material rendering with soft studio lighting,
generous whitespace. Premium editorial quality. No text, no logos, no watermarks.
```

> prompt 末尾必须写 `No text, no logos, no watermarks` 防水印；所有图配色统一（暗色背景 + 单一琥珀强调色）；批量生成时每批 5 张并行。

**技术图表生成（fireworks）：**
- Python 列表法逐行 append SVG，避免语法错误
- 验证：`xml.etree.ElementTree.parse('file.svg')`
- 配色 token：背景 `#0A0A0B`/`#141416`，文字 `#FAFAFA`/`#A1A1AA`，强调 `#F59E0B`，边框 `#27272A`

**反 AI 俗套清单（必须规避）：**
- 禁止居中 hero 三件套
- 禁止 3 列等高 feature 卡（改 Bento 非对称）
- 禁止紫色/蓝紫渐变
- 禁止 emoji 当图标（用自定义 SVG）
- 禁止 Inter 字体（用 Geist）
- 禁止圆角 2xl 滥用 + 玻璃拟态

**图文并茂策略：**
- 每个知识点"图主导 + 文辅助"：先放图，下方配 2-3 句白话解读
- 杜绝"大段文字后集中放图"的学术论文式排版
- 长章节每滚动 1 屏（约 600px）必须出现至少 1 个视觉元素

**通俗化写作规范：**
- 短句优先，单句不超过 25 字
- 口语化："这个功能就是用来..."、"简单说就是..."
- 多用类比：关键帧=书签、LUT=滤镜配方、码率=画质密度
- 专业术语首次出现配括号大白话
- 步骤用数字编号 + 短动词开头
- 验收标准用可勾选清单

**PDF 转换关键配置（Puppeteer）：**
- `executablePath`：指定系统 Chrome，避免下载 Chromium
- `emulateMediaType('print')`：确保 `@media print` 样式生效
- `addStyleTag` 注入背景色：解决白边框问题
- `margin: 0` + `@page margin: 0`：全幅背景填充
- `displayHeaderFooter: false`：去掉页眉页脚占用空间
- `printBackground: true`：保留暗色背景

**踩坑记录与对策：**

| 问题 | 根因 | 对策 |
|------|------|------|
| PDF 空白页多 | `break-before: page` + `break-inside: avoid` | 只在封面/序章/第一章分页；Bento Grid 打印降级双列；图片限高 220px；正文 10pt |
| PDF 白色边框 | `@page margin` 和 Puppeteer margin 未设 0 | `@page { size: A4; margin: 0; }`；Puppeteer margin 全 0；注入背景色；容器 padding 0 10mm |
| 中文字体乱码 | web font 加载失败 | Google Fonts CDN 引入 Noto Sans SC；fallback 微软雅黑；`document.fonts.ready` 等待；额外等 2 秒 |
| 图片有水印 | AI 文生图偶发水印 | prompt 末尾强制 `No text, no logos, no watermarks`；有水印则重新生成 |

**验证清单：**

内容完整性：
- [ ] 理论框架（方法/阶段/误区）全部成节且配图
- [ ] 每个知识点都有配图，无纯文字段落超过 3 段
- [ ] 专业术语首次出现均有括号大白话解释
- [ ] 单句不超过 25 字

PDF 质量：
- [ ] 用 PyMuPDF 检查每页文字量，无空白页（文字<20字且无图=空白）
- [ ] 四角像素采样验证背景填充（RGB<30 = 暗色填充）
- [ ] 中文字体已嵌入，无乱码
- [ ] 章节分页正确，无标题孤立页底
- [ ] SVG 矢量清晰，PNG 插图无压缩伪影

**适用场景扩展：**
本流水线不仅限于视频剪辑学习手册，可复用于：AI 创作教程手册、编程入门指南、任何"理论 + 实战 + 图文"的知识手册。替换章节结构和领域内容即可，视觉资产生成和 PDF 转换流程完全复用。

---

### 9. enterprise-portal-generator — 企业门户网站一键生成器

从单一用户简介生成**完整、生产就绪的 6 页企业门户网站**。输出自适应配色、字体、布局密度和内容模式到用户所在行业 — 没有两个行业看起来相同，但共享相同的工程质量与反俗套纪律。

**核心原则**：一个文件夹，六个 HTML 页面，一套 CSS 设计系统，一层 JS 交互。通过 `file://` 或任何静态服务器打开 `index.html` — 开箱即用。无构建步骤、无框架、除 Google Fonts 外无 CDN 依赖。

**6 个页面：**

| 页面 | 文件 | 核心职责 |
|------|------|---------|
| 首页 | `index.html` | 承诺 + 证据：hero、信任条、服务、架构、行业、案例、证言、CTA |
| 产品/服务 | `products.html` | 深度：服务 bento、交付流程、技术栈、FAQ |
| 新闻 | `news.html` | 节奏：新闻网格 + 分类筛选 + 精选文章 |
| 关于 | `about.html` | 信任：简介、使命/愿景/价值观、时间线、团队、文化、联系 |
| 招聘 | `recruitment.html` | 招募：开放职位、文化、福利、面试流程 |
| 咨询 | `consultation.html` | 转化：联系渠道、咨询表单、服务时间、FAQ |

**7 步工作流：**

| 步骤 | 说明 |
|------|------|
| Step 1 | 解析简介 & 选择行业预设 — 提取 5 个必需信号，匹配 12 行业预设 |
| Step 2 | 生成设计令牌 — 颜色、字体、间距、圆角、阴影、缓动 |
| Step 3 | 构建 CSS 设计系统 — 7 层：reset → tokens → typography → layout → components → animations → responsive |
| Step 4 | 生成页面资产 — favicon SVG + Hero 图（GenerateImage）+ 案例图 |
| Step 5 | 构建 6 个 HTML 页面 — 遵循 page-architecture.md 的章节结构 |
| Step 6 | 构建 JS 交互 — 导航切换、滚动揭示、数字计数、表单验证、返回顶部、新闻筛选 |
| Step 7 | 预飞检查 & 浏览器验证 — 60+ 项检查清单 + 计算样式验证 + 截图 |

**三个调节盘（Three Dials）：**

| 调节盘 | 范围 | B2B 默认 | 说明 |
|--------|------|---------|------|
| `DESIGN_VARIANCE` | 1–10 | 5–7 | 1=完美对称，10=艺术混沌 |
| `MOTION_INTENSITY` | 1–10 | 4–6 | 1=静态，10=电影级 |
| `VISUAL_DENSITY` | 1–10 | 4–5 | 1=空灵画廊，10=密集驾驶舱 |

**12 行业预设：**

| # | 行业 | 强调色 | 情绪 | 变化 | 动效 | 密度 |
|---|------|--------|------|------|------|------|
| 1 | 软件/科技 | 蓝 `#2E67E0` | 信任+科技 | 6 | 5 | 4 |
| 2 | 金融/金融科技 | 青绿 `#0F766E` | 稳定+增长 | 5 | 4 | 5 |
| 3 | 医疗/健康 | 青蓝 `#0D9488` | 健康+平静 | 5 | 3 | 4 |
| 4 | 制造/工业 | 焦橙 `#C2410C` | 工业+能量 | 6 | 4 | 5 |
| 5 | 零售/电商 | 玫瑰 `#BE185D` | 活力+商业 | 7 | 5 | 3 |
| 6 | 政府/公共 | 深蓝 `#1E40AF` | 权威+信任 | 4 | 3 | 5 |
| 7 | 教育/培训 | 紫罗兰 `#7C3AED` | 知识+好奇 | 6 | 4 | 4 |
| 8 | 法律/专业 | 琥珀青铜 `#854D0E` | 传承+庄重 | 5 | 3 | 4 |
| 9 | 房地产/物业 | 森林绿 `#166534` | 增长+物业 | 6 | 5 | 3 |
| 10 | 咨询/顾问 | 海军蓝 `#1E3A5F` | 高端+战略 | 6 | 5 | 4 |
| 11 | 物流/供应链 | 深玫瑰 `#9F1239` | 动感+紧迫 | 6 | 5 | 5 |
| 12 | 能源/清洁技术 | 琥珀 `#B45309` | 力量+温暖 | 6 | 5 | 4 |

> 无精确匹配时混合两个最接近的预设（如"fintech" = 金融 + 软件/科技）。

**设计系统基线：**

| 维度 | 规范 |
|------|------|
| 中性墨色 | Zinc 系（`#18181B` / `#3F3F46` / `#71717A` / `#A1A1AA`） |
| 背景层级 | 暖白 `#FAFAF9` / `#F4F4F5` / `#E4E4E7` |
| 强调色 | 按行业替换，全页只用一个 |
| 暗色区块 | `#0A0A0B` / `#18181B` |
| 显示字体 | Noto Sans SC（中文）/ Geist, Satoshi, Cabinet Grotesk（英文） |
| 等宽字体 | JetBrains Mono / Cascadia Code |
| 容器宽度 | `.container`=1320px，`.container-wide`=1480px（不混用） |
| 圆角系统 | sm=8px / md=12px / lg=16px / xl=24px / 2xl=32px / full=999px |
| 缓动 | `cubic-bezier(0.22, 1, 0.36, 1)` |

**反俗套纪律（不可协商）：**

1. 全文无 em-dash（—）或 en-dash（–）
2. 无 AI 紫/蓝光默认美学
3. 眉题克制：每 3 个区块最多 1 个眉题
4. 无空 bento 单元格（N 项 N 格，<3 项移除网格）
5. 无重复 CTA 意图（每页每意图一个标签）
6. 无装饰性圆点、编号卡片标签、横向滚动器
7. 玻璃拟态仅在材质合理处使用
8. 无磁性按钮效果（用渐变扫光替代）
9. 一套圆角系统（不混用 4px + 16px + 24px）
10. 全页一个强调色（中性色承载其余）

**工程约定：**

- `clamp()` 语法：`+` 和 `-` 两侧必须有空白，否则静默回退为 0
- 章节内边距：`clamp(1.6rem, 0.75rem + 2.5vw, 3rem)`（紧凑密度）
- 表单内边距：`clamp(3.6rem, 2.6rem + 5vw, 5.8rem)`（充裕呼吸空间）
- 卡片悬停：`translateY(-4px)` + 阴影提升（非 -2px）
- 滚动锚点：所有 `[id]` 区块 `scroll-margin-top: 80px`
- 标题换行：所有标题 `text-wrap: balance`
- 减弱动效：非必要动画包裹在 `@media not all and (prefers-reduced-motion: reduce)`
- 图片：除 hero（eager）外 `loading="lazy"`，始终含描述性 `alt`

**输出产物：**

| 产物 | 路径 | 说明 |
|------|------|------|
| HTML 页面 | `{output-dir}/{slug}/index.html` + 5 个 | 6 页：index, products, news, about, recruitment, consultation |
| CSS | `{output-dir}/{slug}/css/style.css` | 单一设计系统文件（令牌 + 组件） |
| JS | `{output-dir}/{slug}/js/main.js` | 导航、滚动揭示、计数、表单、返回顶部 |
| Favicon | `{output-dir}/{slug}/assets/favicon.svg` | 内联 SVG 品牌标记 |
| Hero 图 | `{output-dir}/{slug}/assets/images/*.jpg` | GenerateImage 生成 |

> `{slug}` = 公司英文名 kebab-case（如 `sourcelead`、`acme-corp`）。所有页面平铺在 slug 文件夹内。

**内容语调：**
- 标题：短、陈述性、利益导向，桌面端最多 2 行
- 正文：对话式但专业，避免术语（除非受众是技术型）
- CTA：动作动词 + 对象（"免费咨询方案" 而非 "了解更多"）
- 信任信号：具体数字优于模糊声明（"127+ 交付项目" 而非 "众多成功案例"）

**预飞检查清单（60+ 项）：**
- 结构（8 项）：6 HTML + 1 CSS + 1 JS + favicon + hero 图 + 单文件夹 + 无外部依赖 + file:// 可用
- 导航（6 项）：fixed + backdrop-filter + 6 链接 + aria-current + 移动汉堡 + CTA
- 页脚（6 项）：品牌块 + 3 链接列 + 联系 + 呼吸状态点 + 版权 + 法律链接
- Hero（8 项）：径向渐变 + .h1 统一 + 2 CTA + 状态点 + 浮动动画 + 渐变遮罩 + alt + eager
- 内容（10 项）：halved clamp + border-top + scroll-margin + 布局多样性 + 无空格 + -4px 悬停 + zigzag + 暗色过渡 + 信任条计数 + 滚动揭示
- 表单（8 项）：clamp 内边距 + 空格 + data-required + phone/email 验证 + 错误消息 + btn-lg + 隐私说明
- 反俗套（10 项）：零 em-dash + 零 AI 紫 + 眉题≤2 + 无编号标签 + 无装饰点 + 无磁性按钮 + 无横向滚动 + 一个强调色 + 一套圆角
- 图片（5 项）：alt + lazy + 无水印 + 无 hex 码 + 无 UI 边框
- 响应式（5 项）：768px 汉堡 + 网格折叠 + 信任条 + 内边距 + 无横向滚动
- 无障碍（5 项）：alt + aria-label + WCAG AA + 焦点状态 + 减弱动效

**引用文件路由：**

| 引用文件 | 何时加载 |
|---------|---------|
| `references/design-system.md` | Step 2-3：构建 CSS |
| `references/industry-presets.md` | Step 1：选择行业适配 |
| `references/page-architecture.md` | Step 5：构建 HTML 页面 |
| `references/optimization-checklist.md` | Step 7：预飞验证 |

> 开头加载全部四个引用文件 — 它们体积小且交叉引用。

---

### 10. music-downloader — 国内 5 大音乐平台歌曲下载器

根据演唱者和歌曲名称，从国内 5 大主流音乐平台搜索并下载歌曲（MP3）及歌词（LRC）。支持单首下载、批量下载、文本/文件/Excel 多种输入方式。

**支持平台：**

| 平台 | 搜索 | 下载 | 歌词 |
|------|------|------|------|
| 网易云音乐 | 官方 API | 4 个第三方 API 回退 | 有 |
| QQ音乐 | 官方 API | 2 个第三方 API 回退 | 有 |
| 酷狗音乐 | 官方 API | 2 个第三方 API 回退 | 有 |
| 咪咕音乐 | 官方 API | 官方下载接口 | 有 |
| 汽水音乐 | 官方 API | 第三方 API + 官方试听 | 有 |

**5 平台回退机制：** 网易云 → QQ → 酷狗 → 咪咕 → 汽水，逐层回退，每平台 2–4 个第三方 API。

**音质参数：**

| 参数值 | 说明 | 建议场景 |
|--------|------|---------|
| `standard` | 标准音质（128kbps） | 快速试听、节省空间 |
| `high` | 高品质（320kbps） | 默认推荐 |
| `lossless` | 无损音质（FLAC） | 收藏级，文件较大 |

**单首下载示例：**
```python
import sys; sys.path.insert(0, r'scripts')
from batch_download_v4 import MusicDownloader

dl = MusicDownloader(output_dir=r'D:\音乐目录', default_quality='high')

# 最简用法
result = dl.download('陈奕迅', '孤勇者')

# 指定音质
result = dl.download('周杰伦', '晴天', quality='lossless')

# 带分类
result = dl.download('周深', '大鱼', era='2010年代', level='S级')
```

**批量下载示例：**
```python
# dict 列表
songs = [
    {'singer': '陈奕迅', 'song_name': '孤勇者'},
    {'singer': '周杰伦', 'song_name': '晴天', 'era': '2000年代', 'level': 'S级'},
]
dl.download_batch(songs, quality='high')

# 字符串列表（自动解析）
songs = ['陈奕迅的孤勇者', '周杰伦 晴天', '林俊杰,江南']
dl.download_batch(songs, era='2000年代', quality='high')

# 从文本
dl.download_from_text('陈奕迅 孤勇者\n周杰伦 晴天', era='2000年代')

# 从文件
dl.download_from_file('songs.txt', era='2000年代')

# 从 Excel（自动过滤经典选曲占位符）
dl.download_from_excel('歌曲列表.xlsx', quality='high')
```

**命令行用法：**
```bash
# 单首下载
python scripts/batch_download_v4.py -s "陈奕迅" -n "孤勇者" -q high

# 指定音质
python scripts/batch_download_v4.py -s "周杰伦" -n "晴天" -q lossless

# 批量文本
python scripts/batch_download_v4.py --text "陈奕迅 孤勇者\n周杰伦 晴天" -q high

# 批量文件
python scripts/batch_download_v4.py --file songs.txt --era "2000年代" --level "S级" -q high

# Excel 批量
python scripts/batch_download_v4.py --excel "歌曲列表.xlsx" -q high
```

**输入格式自动解析：**

| 格式 | 示例 | 结果 |
|------|------|------|
| dict | `{'singer': '陈奕迅', 'song_name': '孤勇者'}` | 陈奕迅 / 孤勇者 |
| tuple | `('陈奕迅', '孤勇者')` | 陈奕迅 / 孤勇者 |
| "XX的XX" | `"陈奕迅的孤勇者"` | 陈奕迅 / 孤勇者 |
| 空格分隔 | `"陈奕迅 孤勇者"` | 陈奕迅 / 孤勇者 |
| 逗号分隔 | `"陈奕迅,孤勇者"` | 陈奕迅 / 孤勇者 |
| Tab 分隔 | `"陈奕迅\t孤勇者"` | 陈奕迅 / 孤勇者 |

**核心特性：**
- 5 平台回退：网易云 → QQ → 酷狗 → 咪咕 → 汽水，逐层回退
- 多 API 回退：每平台 2–4 个第三方 API
- 断点续传：默认跳过已下载文件
- 自动歌词：同时下载 LRC 歌词
- 音质可选：standard / high / lossless
- 灵活分类：era / level 参数控制目录结构
- 多种输入：dict 列表、字符串列表、文本、文件、Excel

**参数速查：**

| 参数 | 说明 | 必填 | 默认 |
|------|------|------|------|
| `-s` / `--singer` | 歌手名 | 单首下载必填 | — |
| `-n` / `--song-name` | 歌曲名 | 单首下载必填 | — |
| `-q` / `--quality` | 音质：standard / high / lossless | 否 | `high` |
| `--text` | 批量文本输入 | 批量下载 | — |
| `--file` | 批量文件输入 | 批量下载 | — |
| `--excel` | Excel 批量输入 | 批量下载 | — |
| `--era` | 年代分类（如"2000年代"） | 否 | — |
| `--level` | 等级分类（如"S级"） | 否 | — |
| `-o` / `--output-dir` | 输出目录 | 否 | 当前目录 |

---

### 11. a-stock-operator — A 股市场操盘手

A 股市场操盘手技能，提供两大核心能力：**个股六维诊断分析**和**市场资讯与选股推荐**。通过 `integrated_code_mode` MCP 调用东方财富 API 获取实时行情数据，结合 5 大财经网站资讯抓取，生成专业级 HTML 报告。适用于短线博弈与长线价投，帮助系统性避开雷区、捕捉机会。

**三种输出模式（必须先判断再执行）：**

| 模式 | 触发条件 | 输出内容 |
|:---:|:---|:---|
| 模式A：仅个股诊断 | 提及个股名称/代码 + 成本价 | 个股六维诊断报告（1 份 HTML） |
| 模式B：仅行情分析 | 要求"行情分析/涨停/选股"等，未提及具体个股 | 市场资讯与选股报告（1 份 HTML） |
| 模式C：两者都要 | 同时提及个股诊断 + 行情分析 | 两份报告（2 份 HTML） |

**数据源架构：**

| 层级 | 数据源 | 用途 |
|------|--------|------|
| MCP 实时数据（必须） | 东方财富 API 12 个端点 | 实时行情、K线、资金流、财务、涨停池、板块、选股、龙虎榜等 |
| 网站抓取（补充） | 财联社、东方财富网、证监会、中登、证券时报 | 最新资讯、政策、公告、深度分析 |
| WebSearch（扩展） | 公开搜索 | 涨停、首板、龙虎榜、政策等关键词补充 |

**12 个核心 API 端点：**

| # | API | 用途 |
|---|-----|------|
| 1 | 实时行情（个股） | 价格、涨跌幅、PE、PB、成交额、换手率、量比 |
| 2 | 日K线历史 | 技术面分析（前复权 fqt=1） |
| 3 | 资金流向 | 主力/超大单/大单/中单/小单净流入 |
| 4 | 财务指标 | 最近 6 期 EPS、净资产、营收、净利、毛利率、ROE |
| 5 | 公司概况 | 总股本、行业分类、高管、主营业务 |
| 6 | 大盘指数 | 上证、深证、创业板指、沪深300、科创50 |
| 7 | 涨停池 | 全市场涨停股（首板/连板/炸板/跌停/强势股） |
| 8 | 板块排行 | 行业/概念板块涨跌排行 |
| 9 | 条件选股 | 按涨幅/成交额排序全市场股票 |
| 10 | 资金流向排行 | 主力净流入 Top50 |
| 11 | 龙虎榜 | 上榜股票明细 + 买卖席位 |
| 12 | 分时数据 | 当日分时图 + 分钟级 K 线 |

**6 层数据可靠性验证体系：**

| 层级 | 验证内容 | 示例 |
|------|---------|------|
| 第 1 层 | 交易日与时段验证 | 非交易日标注"数据为最近交易日" |
| 第 2 层 | API 响应完整性 | rc=0、data 非空、字段类型正确 |
| 第 3 层 | 数据交叉验证 | K线收盘价 vs 实时价格差异 <0.5% |
| 第 4 层 | 异常值检测 | 价格≤0、PE 为负、涨跌幅超限 |
| 第 5 层 | 停牌与特殊状态 | 成交量=0 → 停牌；名称含 ST → 红色警示 |
| 第 6 层 | 数据时效性标注 | "数据截至 2026-07-30 15:00（收盘）" |

**模块一：个股六维诊断分析**

六大维度 40+ 核心指标，按权重加权评分：

| 维度 | 权重 | 核心指标 |
|------|:---:|---------|
| 宏观行业与赛道定位 | 15% | 行业生命周期、政策面、产业链位置、市场空间 |
| 财务基本面（排雷核心） | **30%** | ROE、毛利率、经营现金流、存货/应收周转、资产负债率 |
| 估值性价比 | 20% | PE/PEG/PB 历史分位、DCF |
| 技术面与筹码博弈 | 15% | 均线排列、MACD、量价关系、筹码集中度 |
| 股东与管理层 | 10% | 机构持仓、增减持、分红历史 |
| 预期差与催化剂 | 10% | 订单产能、新产品、事件驱动 |

> 一票否决：财务维度评分 ≤3 时，最终评级不超过"持有观察"。

**仓位管理 + 止损体系：**

| 综合评分 | 仓位上限 | 止损方法（取最严格者） |
|:---:|:---:|:---|
| ≥8.0 | 30% | 技术止损 / 固定比例 / ATR / 资金管理 2% |
| 6.5-7.9 | 15-20% | 同上 |
| 5.0-6.4 | 5-10% | 同上 |
| <5.0 | 0% | 清仓 |

**模块二：市场资讯与选股推荐**

三大输出：
- **Top 10 重要资讯**：时效性 × 重要性综合排序，每条含 2 只个股推荐
- **首板低位突破（5 只）**：今日首板 + 低位 + 突破信号，默认仅主板
- **突破放量热点（5 只）**：涨幅 >5% + 均线突破 + 量能堆积 + 热点契合

**板块范围规则**：默认排除创业板/科创板，用户可显式覆盖；ST/*ST 永远排除。

**市场情绪指标（必须计算）：**

| 指标 | 判断标准 |
|------|---------|
| 涨跌家数比 | >3=强势，<0.5=弱势 |
| 涨停跌停比 | >5=情绪高涨，<1=冰点 |
| 涨停封板率 | >80%=强势，<60%=分歧大 |
| 连板高度 | ≥4板=高潮，≤2板=冰点 |
| 炸板率 | >30%=抛压重，<15%=共识强 |
| 两市成交额 | >1.2万亿=活跃，<6000亿=缩量 |

**HTML 报告设计：**
- 暗色专业主题（`--bg:#0f1115` 系列）
- A 股颜色惯例：红涨绿跌（与西方相反）
- 个股报告：六维评分雷达图、财务指标卡片、SWOT 矩阵、操作建议
- 市场报告：情绪仪表盘、资讯卡片、选股 KPI 卡片、推荐星
- 可复用组件：指标卡片、评分条形图、结论标签、推荐星

**适用场景：**
- 个股诊断：输入股票代码/名称 + 成本价 → 生成六维诊断 + 操作建议报告
- 行情分析：无特定输入 → 生成市场资讯 + 选股推荐报告
- 组合管理：仓位计算、止损设置、回撤控制

> 纯规范型技能（仅 SKILL.md，无脚本），通过 `integrated_code_mode` MCP 调用东方财富 API 获取实时数据，输出 HTML 报告。

---

### 12. dev-lifecycle — 软件开发生命周期编排

将一个模糊想法/需求，端到端推进到可交付的代码实现。核心是 **5 阶段 + 每阶段 HITL（Human-In-The-Loop）确认**，前 4 阶段产出文档，第 5 阶段按 **SOP 6 步** 逐阶段开发。

**适用场景：**

| 场景 | 第 1-4 阶段处理 | 第 5 阶段处理 |
|------|----------------|---------------|
| 新项目创建 | 完整走 4 阶段，产出 roadmap / development-plan / api-doc | 从第 1 阶段开始按 SOP 推进 |
| 需求迭代（v1→v2） | 聚焦"增量需求"分析，复用已有架构，产出迭代计划 | 仅推进新增/变更阶段 |
| 技术重构 | 聚焦"重构目标 + 风险"分析，产出重构方案与回归测试策略 | 按重构单元逐个 SOP 推进 |

**5 阶段流程：**

```
阶段 1：需求探索 → [HITL]
阶段 2：技术框架 → [HITL]
阶段 3：产品设计方案 → [HITL]
阶段 4：API 文档 + 分阶段开发计划 → [HITL]
阶段 5：分阶段 SOP 开发（每阶段 6 步，审查阶段全面）
```

**前 4 阶段产出文档：**

| 阶段 | 文档 |
|------|------|
| 需求探索 | `docs/requirements.md`（迭代为 `requirements-v{X}.md`） |
| 技术框架 | `docs/tech-framework.md` |
| 产品设计 | `docs/product-design.md` |
| API + 计划 | `docs/api-doc.md` + `docs/development-plan.md` |

**阶段 5 SOP 6 步：**

```
1. 了解需求 → 编码实现（先 Read 后 Edit）
2. 编写测试 → pytest 全绿（覆盖率 ≥ 80%）
3. 全面审查 → 文档/代码/安全/测试/配置/迁移/回归 → 修复后回归测试
4. development-plan 标 ✅ + AGENT.md 更新
5. git add 具体文件 → commit（不 push）
6. 进入下一阶段
```

**核心原则：**

- **HITL 强制确认**：每阶段产出后必须让用户确认/完善，禁止跳过直接进入下一阶段
- **文档先行**：前 4 阶段产出 Markdown 落盘到 `docs/`，作为第 5 阶段执行依据
- **最小必要**：不过度工程；不新增非必要文件；不加无关注释
- **可追溯**：每阶段产出物可追溯到上游需求；commit 信息含阶段标识
- **质量红线**：禁止跳过 HITL / 禁止跳过全面审查 / 禁止 `git add -A` / 禁止盲改代码 / 测试覆盖率 ≥ 80%

> 纯规范型技能（仅 SKILL.md，无脚本），适用于新项目、需求迭代、技术重构等需要完整开发流程编排的场景。

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

### 13. a-stock-operator-v2 — A 股行情复盘与个股诊断（增强版）

生成金融数据终端深色主题的 A 股 **行情复盘报告** 与 **个股诊断报告**，红涨绿跌、结论前置。Python 实现，公开财经 API 直采，一条命令完成「采集→健康检查→模型→报告」全流程。

**核心能力：**

| 模块 | 说明 |
|------|------|
| 市场全景 | 指数 sparkline、情绪周期定位（情绪温度计）、连板梯队、主线题材、政策、热点 |
| 近一月板块轮动 | 日期列头 × 每日 Top7 板块，动态色标记轮动，全量标注涨幅% 与涨停数 ×N |
| 资金轮动四象限 | 主线 / 接力 / 脉冲 / 退潮分类 + 板块多因子趋势榜（加速/减速/回落/启动） |
| 情绪温度计 | 温度 + 风险双维、五阶段（冰点/启动/发酵/高潮/分歧）、0-10 成仓位建议、因子分解条 |
| 个股六维诊断 | 短线 / 中线双权重评分、SWOT、估值情景、筹码、关键价位、操作建议 |

**全流程一键管线（每次取最新数据）：**

```bash
py312 scripts/collect_all.py                    # 采集 → 16 项健康检查 → 模型 → 报告
py312 scripts/collect_all.py --only-check       # 仅健康检查（数据是否缺失/过期）
py312 scripts/collect_all.py --skip collect_news.py  # 跳过指定步骤
```

管线默认**全量重采**（不跳过已有文件），模型与报告仅在数据校验全过后执行，杜绝陈旧报告；健康检查含产物新鲜度、覆盖量、时序一致性等 16 项严格校验。报告输出到当前工程目录（`A_STOCK_OUT` 可覆盖）。

---

### 14. lhb-t3-recommender — 龙虎榜 T+3 涨停推荐与自进化模型

把「龙虎榜上榜个股 → 后期（T+1~T+3）仍有涨停冲高」做成可复用的可解释概率模型：每天收盘后自动出候选，每天用「昨日推荐 vs 今日实际涨停」验证并把新结果喂回训练，模型版本按时间外 AUC 不劣则 +1，越用越准。

**核心能力：**

| 模块 | 说明 |
|------|------|
| 盘后推荐 | 每交易日 17:00 后抓当日龙虎榜，对全部上榜股输出 `P(T+3涨停)` 排序，给出「纳入观察」候选 |
| 三维归因 | 个股技术 × 席位操作手法 × 行情研判，逻辑回归评分卡可解释 |
| 席位画像 | 游资席位打板/低吸/接力风格聚类 + EB 收缩综评 + 紫阳东路专项解读 |
| 自进化 | 时间衰减样本权重 + walk-forward 防过拟合复合门控 + 真实 T+3 结果回馈 |
| HTML 报告 | 方法论文/赢家共性/席位手法/评估/评分卡/实战验证/进化轨迹/买入策略八章 |

**用法（自包含，已相对化路径）：**

```bash
py scripts/run.py init                     # 首次全量构建（近 90 天龙虎榜 + K线 + 首版模型，约 10–15 分钟）
py scripts/run.py daily                    # 每日盘后：抓榜 → 推荐 → 验证 → 进化 → 报告
py scripts/run.py optimize                 # 手动触发自我进化重训
py scripts/run.py recommend 2026-08-31     # 单日推荐（用缓存，不抓数据）
```

产物统一落在技能目录 `runtime/` 下（数据快照、`model_t3.joblib`、`model_history.json`、`recommend_{日期}.csv`、HTML 报告）；`runtime/` 为运行时产物，分发时仅打包 `SKILL.md` + `scripts/`。依赖 pandas / scikit-learn / requests / joblib。

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
| `edge-tts not found` | 未安装 edge-tts | `pip install edge-tts`，或检查 Python Scripts 目录 |
| Wav2Lip checkpoint 未找到 | 未下载模型权重 | 下载 `wav2lip_gan.pth` 到 `Wav2Lip/checkpoints/` 目录 |
| Wav2Lip `DLL load failed` | PyTorch 缺少 VC++ 运行库 | 安装 [Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe) |
| Wav2Lip `face not detected` | 首帧人物面部不清晰 | 使用面部清晰可见的首帧，调整 `pads` 参数扩大检测边界 |
| 脱口秀场景间画面不连贯 | i2i 重托管失败 | 检查 `state.json` 中的 `rehosted.url` 字段 |

---

## 快速选择指南

| 需求 | 推荐技能 | 理由 |
|------|---------|------|
| 生成一张精美 AI 图片 | `agnes-image-gen-2` | 电影级画质，文生图 / 图生图 |
| 生成一段 AI 视频 | `agnes-video-gen-2` | 4 种工作流，灵活选择 |
| 创作一首 AI 音乐 | `suno-cn-music` | 8 个 API，全流程覆盖 |
| 下载已有歌曲（MP3 + 歌词） | `music-downloader` | 5 平台回退，批量下载，自动歌词 |
| 婚礼电影 — 需高面部相似度 | `cross-era-wedding` | FaceFusion 换脸 80%+ |
| 婚礼电影 — 无需 Python，快速生成 | `volc-wedding` | Seedream i2i 保留五官，零额外依赖 |
| 婚礼电影 — 需要分镜剧本 | `volc-wedding` | 战国/唐/明/现代已配置时间分段剧本 |
| 婚礼电影 — 朝代较多（5 个） | `volc-wedding` | 支持 2–5 个朝代 |
| 生成脱口秀 / 喜剧短视频 | `comedy-show` | 剧本自动优化 + TTS 语音 + Wav2Lip 口型同步 |
| 撰写可发布的技术文章 | `tech-article-craft` | 自包含 HTML + AI 配图 + 13 种图表组件 |
| 制作图文并茂的 PDF 学习手册 | `learning-handbook-pipeline` | 三技能协作（插图 + 图表 + 前端设计）+ Puppeteer 转 PDF |
| 生成企业门户网站 | `enterprise-portal-generator` | 6 页生产级网站 + 12 行业预设自适应 + 60+ 项预飞检查 |
| A 股个股诊断分析 | `a-stock-operator` | 六维评分体系 + 12 API 实时数据 + 6 层验证 |
| A 股市场行情与选股 | `a-stock-operator` | 涨停池 + 板块排行 + 龙虎榜 + 情绪指标 |
| A 股行情复盘（板块轮动+情绪温度计） | `a-stock-operator-v2` | 一键管线 + 情绪温度计 + 近一月板块轮动 + 资金四象限 |
| A 股个股诊断（短线/中线双权重） | `a-stock-operator-v2` | 六维双权重评分 + 个股诊断报告生成 |
| 从需求到代码的完整开发流程编排 | `dev-lifecycle` | 5 阶段 + HITL 确认 + SOP 6 步开发 |
| A 股龙虎榜后期涨停预判 / T+3 候选 | `lhb-t3-recommender` | 逻辑回归概率模型 + 席位画像 + 每日验证自进化 |

---

## 许可证

仅供个人学习和非商业用途。请遵守各 AI 平台的使用条款：

- **Agnes** — Agnes Image / Video / Text API 使用条款
- **Volcengine Ark** — 火山方舟平台使用条款
- **Suno.cn** — Suno.cn 服务条款
- **FaceFusion** — [MIT License](https://github.com/facefusion/facefusion/blob/master/LICENSE)
