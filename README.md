# AI Skills 工程集合

> 一套面向 AI 多媒体创作的 Skills 集合 — 涵盖文生图、图生图、文生视频、图生视频、AI 音乐、跨朝代婚礼电影、脱口秀视频、技术文章、学习手册、企业门户，以及 A 股量化分析与技能数据抓取。

[![Platform](https://img.shields.io/badge/Platform-TRAE-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-12%2B-green)]()
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)]()
[![License](https://img.shields.io/badge/License-Personal%20Use-lightgrey)]()
[![Skills](https://img.shields.io/badge/Skills-18-orange)]()

---

## 目录

- [简介](#简介)
- [技能总览](#技能总览)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [环境准备](#环境准备)
- [技能详解](#技能详解)
  - [AI 图片与视频](#ai-图片与视频)
  - [婚礼电影](#婚礼电影)
  - [脱口秀视频](#脱口秀视频)
  - [AI 音乐与下载](#ai-音乐与下载)
  - [内容创作与网站](#内容创作与网站)
  - [A 股量化分析](#a-股量化分析)
  - [技能数据抓取](#技能数据抓取)
- [朝代列表](#朝代列表)
- [婚礼电影方案对比](#婚礼电影方案对比)
- [通用注意事项](#通用注意事项)
- [故障排查](#故障排查)
- [快速选择指南](#快速选择指南)
- [许可证](#许可证)

---

## 简介

本工程聚合了 **18 个独立 Skills**（外加 8 个技能数据抓取子技能），覆盖 AI 创作与数据分析的核心场景：**图片生成、视频生成、音乐创作、音乐下载、跨时空婚礼电影、脱口秀视频、技术文章、学习手册、企业门户网站、A 股操盘分析、首板洗盘选股、龙虎榜涨停推荐、一阳指量化扫描、软件开发流程编排、技能数据抓取**。

**核心亮点：**

- **零 npm 依赖**：Node.js 类技能仅用内置模块（`https`、`fs`、`path` 等），开箱即用
- **多平台支持**：Agnes、火山方舟 Ark、Suno.cn、可灵 Kling 四大 AI 平台
- **电影级画质**：自动追加 cinematic lighting、8K、HDR 等修饰词
- **断点续跑**：婚礼电影与脱口秀类技能支持 `state.json` 中断恢复
- **跨朝代叙事**：13 个中国历史朝代完整配置，每个朝代独立服装 / 场景 / 风俗
- **面部复刻**：FaceFusion 换脸（80%+）或 Seedream i2i 保留五官特征
- **口型同步**：脱口秀视频通过 Wav2Lip 后处理或原生音画同步实现口型对齐
- **产物外置**：所有运行时产物（数据/报告/视频）跟随**当前会话工作目录**（`os.getcwd()` / `process.cwd()`），不写回技能安装目录，保持技能库纯净
- **A 股分析**：个股六维诊断、市场选股、行情复盘、首板洗盘选股、龙虎榜 T+3 模型、一阳指战法扫描，报告统一为 Markdown（`{报告完整中文名称}-{YYYY-MM-DD}.md`）
- **技能数据抓取**：8 个主流 Skill 市场（Smithery、ClaudeSkills 等）的批量抓取备份工具

---

## 技能总览

| 技能 | 一句话说明 | 依赖平台 | 运行依赖 | 耗时参考 |
|------|-----------|---------|---------|---------|
| `agnes-image-gen-2` | Agnes Image 2.5 Flash 电影级图片生成（文生图 / 图生图） | Agnes Image API | Node.js 12+ | 单张约 10–30 秒 |
| `agnes-video-gen-2` | Agnes Video 2.5 Flash 电影级视频生成（4 种工作流） | Agnes Video API | Node.js 12+ | 单段约 1–5 分钟 |
| `timeless-wedding` | 跨时空婚礼电影生成器（Agnes + FaceFusion 换脸） | Agnes API + FaceFusion + FFmpeg | Node.js 12+、Python 3.10+（可选）、FFmpeg 4.4+ | 2 朝代约 10–15 分钟，4 朝代约 20–30 分钟 |
| `timeless-wedding-volc` | 基于 Volcengine Ark 的跨时空婚礼电影生成器 | 火山方舟 Ark API + FFmpeg | Node.js 12+、FFmpeg 4.4+ | 4 朝代约 15–25 分钟 |
| `suno-cn-music` | Suno.cn AI 音乐创作助手（8 个 REST API） | Suno.cn API | 无（HTTP REST 调用） | 单首约 1–3 分钟 |
| `talkshow` | 爆款舞台美女脱口秀视频生成器（剧本优化 + TTS + Wav2Lip 口型同步） | Agnes Text/Image/Video API + Edge TTS + Wav2Lip + FFmpeg | Node.js 12+、Python、FFmpeg 4.4+、PyTorch（可选） | 单场景约 3–8 分钟 |
| `talkshow-studio` | 生产级脱口秀视频工坊（Agnes 全模态 + 原生口型语音） | Agnes 全模态 API + FFmpeg | Node.js 12+、FFmpeg 4.4+ | 单场景约 3–8 分钟 |
| `talkshow-studio-kling` | 生产级脱口秀视频工坊（可灵版） | 可灵 Kling Video/Image + FFmpeg | Node.js 12+、FFmpeg 4.4+ | 单场景约 3–8 分钟 |
| `tech-article-craft` | 自包含技术文章生成器（内联 CSS/JS HTML + AI 配图 + 图表组件） | GenerateImage + WebSearch/WebFetch | 无（纯模板生成） | 单篇约 5–15 分钟 |
| `learning-handbook-pipeline` | 图文并茂 PDF 学习手册生成流水线（三技能协作） | guizang 插图 + fireworks 图表 + design-taste-frontend | Node.js（Puppeteer）、Python（PyMuPDF 验证） | 单本约 20–60 分钟 |
| `enterprise-portal-generator` | 企业门户网站一键生成器（6 页生产级网站 + 12 行业预设） | GenerateImage（Hero 图） | 无（纯 HTML/CSS/JS 模板） | 单站点约 10–30 分钟 |
| `music-downloader` | 国内 5 大音乐平台歌曲下载器（MP3 + LRC 歌词） | 网易云/QQ/酷狗/咪咕/汽水 API | Python 3.8+ | 单首约 3–10 秒 |
| `a-stock-operator` | A 股市场操盘手（个股六维诊断 + 市场资讯选股推荐） | 东方财富 API（12 端点）+ 财联社等 5 大财经网站 | 无（纯规范型，通过 MCP 调用 API） | 个股诊断约 2–5 分钟，市场报告约 5–10 分钟 |
| `a-stock-operator-v2` | A 股行情复盘 + 个股诊断（情绪温度计 + 板块轮动专题 + 双权重评分） | 东方财富/腾讯/新浪公开 API + 财联社 | Python 3.10+ | 全流程约 5–10 分钟（`collect_all.py` 一条命令） |
| `a-stock-yiyangzhi` | A 股一阳指战法量化扫描（转势/开门 + 主线标签 + 可靠性优化） | 东方财富/腾讯公开接口 | Python 3.12+（numpy/requests） | 全市场扫描约 3–8 分钟 |
| `a-stock-lhb-rec` | 龙虎榜 T+3 涨停推荐与自进化模型 | 东方财富/同花顺/腾讯 K 线公开接口 | Python 3.10+（pandas/scikit-learn） | 首次 init 约 10–15 分钟，daily 每条约 1–3 分钟 |
| `a-stock-board-washout` | A 股首板洗盘 / 炸板洗盘选股器（双策略 + 第二日操作建议） | 东方财富/新浪/腾讯公开接口 | Python 3.10+ | 单次约 2–5 分钟 |
| `dev-lifecycle` | 端到端软件开发流程编排（5 阶段 + 每阶段 HITL 确认） | 无（纯规范型，仅 SKILL.md） | 无 | 按项目规模而定 |
| `skill-data-fetcher`（8 子技能） | 主流 Skill 市场批量抓取备份（Smithery / ClaudeSkills 等 8 家） | 各家 Skill 市场 API | Node.js 12+ | 单家约 1–3 分钟 |

---

## 目录结构

```
skills/
├── README.md                          # 本文件
│
├── agnes-image-gen-2/                 # 电影级图片生成
│   ├── SKILL.md
│   └── scripts/agnes_image_gen.js
├── agnes-video-gen-2/                 # 电影级视频生成
│   ├── SKILL.md
│   └── scripts/agnes_video_gen.js
├── timeless-wedding/                 # 跨时空婚礼电影（Agnes + FaceFusion）
│   ├── SKILL.md
│   └── scripts/
│       ├── timeless_wedding.js
│       ├── dynasties.js               # 13 朝配置
│       └── install_facefusion.bat
├── timeless-wedding-volc/                      # 跨时空婚礼电影（火山方舟 Ark）
│   ├── README.md                      # 产品说明
│   ├── SKILL.md
│   └── scripts/                       # 6 文件，约 2,070 行
│       ├── timeless_wedding_volc.js
│       ├── ark_client.js
│       ├── dynasties.js
│       ├── image_pipeline.js
│       ├── video_pipeline.js
│       └── merge_engine.js
├── suno-cn-music/                     # AI 音乐创作
│   ├── SKILL.md
│   ├── install.bat
│   └── install.sh
│
├── talkshow/                          # 脱口秀视频（段子优化 + Wav2Lip）
│   ├── SKILL.md
│   └── scripts/
│       ├── talkshow.js
│       ├── agnes_text_gen.js
│       ├── tts_engine.js
│       ├── lipsync_engine.js
│       ├── merge_engine.js
│       └── character_config.js
├── talkshow-studio/                   # 脱口秀工坊（Agnes 原生口型）
│   ├── SKILL.md
│   └── scripts/
│       ├── talkshow_produce.js
│       ├── agnes_client.js
│       ├── prompts.js
│       └── ffmpeg_tools.js
├── talkshow-studio-kling/             # 脱口秀工坊（可灵版）
│   ├── SKILL.md
│   └── scripts/
│       ├── talkshow_produce.js
│       ├── kling_client.js
│       ├── prompts.js
│       └── ffmpeg_tools.js
│
├── tech-article-craft/                # 自包含技术文章
│   └── SKILL.md
├── learning-handbook-pipeline/        # PDF 学习手册流水线
│   └── SKILL.md
├── enterprise-portal-generator/       # 企业门户生成
│   ├── SKILL.md
│   └── references/                    # 4 个引用文件
│       ├── design-system.md
│       ├── industry-presets.md
│       ├── page-architecture.md
│       └── optimization-checklist.md
│
├── music-downloader/                  # 音乐下载
│   ├── SKILL.md
│   ├── requirements.txt
│   └── scripts/batch_download_v4.py
│
├── a-stock-operator/                  # A 股操盘手（纯规范型）
│   └── SKILL.md
├── a-stock-operator-v2/               # A 股行情复盘 + 个股诊断
│   ├── SKILL.md
│   └── scripts/                       # 全流程管线（collect_all.py 一键）
├── a-stock-yiyangzhi/                 # A 股一阳指战法量化扫描
│   ├── SKILL.md
│   └── scripts/
├── a-stock-lhb-rec/                   # 龙虎榜 T+3 涨停推荐模型
│   ├── SKILL.md
│   └── scripts/                       # run.py init/daily/optimize 等 12 脚本
├── a-stock-board-washout/             # 首板洗盘 / 炸板洗盘选股器
│   ├── SKILL.md
│   └── scripts/                       # 采集 + 筛选 + 出图 + 报告
│
├── dev-lifecycle/                     # 软件开发流程编排（纯规范型）
│   └── SKILL.md
│
├── skill-data-fetcher/                # Skill 市场数据抓取（8 子技能）
│   ├── agent-skills-fetcher/
│   ├── claudeskills-fetcher/
│   ├── cocoloop-skill-fetcher/
│   ├── skill-cn-fetcher/
│   ├── skillsdirectory-fetcher/
│   ├── skillsmp-skill-fetcher/
│   ├── skillstore-fetcher/
│   └── smithery-skill-fetcher/
│
└── demo/                              # 各技能生成效果示例（不纳入版本控制）
    ├── comedy_show.mp4
    ├── timeless_wedding_movie.mp4
    ├── timeless_wedding_volc_movie.mp4
    ├── corp-site/                     # 企业门户示例
    └── mingzhong-machinery/           # 企业门户示例（制造业）
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
$env:agnes-api-key = "sk-xxxx"        # Agnes 图片/视频/timeless-wedding/talkshow
$env:ARK_API_KEY = "your-ark-key"     # timeless-wedding-volc
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
node timeless-wedding-volc/scripts/timeless_wedding_volc.js \
  --male-photo "groom.jpg" --female-photo "bride.jpg" \
  --dynasties "tang,song,ming,modern" --add-title --add-ending

# 生成脱口秀视频（段子自动优化 + 口型同步）
node talkshow/scripts/talkshow.js \
  --script "早高峰挤地铁，我被压成二维码，扫出来全是救命。" \
  --ratio 9:16 --add-subtitles
```

> **产物落点**：所有技能的输出（视频、数据、报告）默认写到**运行命令时的当前工作目录**，不写回技能安装目录。详见各技能的 SKILL.md。

---

## 环境准备

### 必需环境

| 依赖 | 版本 | 说明 | 安装方式 |
|------|------|------|---------|
| Node.js | 12+ | Node.js 类技能运行基础 | [nodejs.org](https://nodejs.org/) |
| FFmpeg | 4.4+ | 视频合并与转场（婚礼电影/脱口秀类技能） | `winget install Gyan.FFmpeg`（Windows） |

### API Key 配置

不同技能使用不同的 API Key：

| 技能 | 环境变量 | 命令行参数 | 获取方式 |
|------|---------|-----------|---------|
| agnes-image-gen-2 / agnes-video-gen-2 / timeless-wedding / talkshow / talkshow-studio | `agnes-api-key` 或 `AGNES_API_KEY` | `--api-key` | Agnes 平台 |
| timeless-wedding-volc | `ARK_API_KEY` | `--api-key` | [火山方舟控制台](https://console.volcengine.com/ark) |
| suno-cn-music | `SUNO_CN_API_KEY` | — | https://www.suno.cn/home/#/mcp |
| talkshow-studio-kling | `KLING_API_KEY` | `--api-key` | 可灵（Kling）平台 |

> **优先级**：命令行参数 `--api-key` > 环境变量。如上下文中直接给出 Key，务必通过 `--api-key` 传入，不要写入环境变量文件。

### 可选依赖

| 依赖 | 版本 | 用途 | 适用技能 | 安装方式 |
|------|------|------|---------|---------|
| Python | 3.10+ | FaceFusion / A 股技能运行环境 | timeless-wedding / a-stock-* | [python.org](https://www.python.org/) |
| FaceFusion | 最新 | 真实面部替换，80%+ 面部复刻 | timeless-wedding | `scripts/install_facefusion.bat` 或 `git clone https://github.com/facefusion/facefusion.git` |
| Git | 任意 | FaceFusion 安装需要 | timeless-wedding | [git-scm.com](https://git-scm.com/) |
| edge-tts | 最新 | 中文语音合成（TTS） | talkshow | `pip install edge-tts` |
| PyTorch（CPU 版） | 最新 | Wav2Lip 推理运行环境 | talkshow | `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu` |
| Wav2Lip | 最新 | 口型同步后处理 | talkshow | `git clone https://github.com/Rudrabha/Wav2Lip` |
| pandas / scikit-learn / requests / joblib | 最新 | 龙虎榜模型训练 | a-stock-lhb-rec | `pip install pandas scikit-learn requests joblib` |
| numpy / requests | 最新 | 一阳指量化扫描 | a-stock-yiyangzhi | `pip install numpy requests` |

---

## 技能详解

### AI 图片与视频

#### 1. agnes-image-gen-2 — 电影级 AI 图片生成

通过 **Agnes Image 2.5 Flash** 官方 API 生成电影级、高清、精美的图片。

**支持模式：** 文生图（t2i）、图生图（i2i）

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

> 脚本自动追加电影质感修饰词（cinematic lighting、8K、HDR 等），支持本地图片 base64 上传。

---

#### 2. agnes-video-gen-2 — 电影级 AI 视频生成

通过 **Agnes Video 2.5 Flash** 官方 API 生成电影级视频，支持四种工作流。

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

> `num_frames` 必须满足 `8n+1` 规则且 ≤441。推荐两步式流程：`--url-only` 获取 URL（长进程），再下载并设只读。

---

### 婚礼电影

#### 3. timeless-wedding — 跨时空婚礼电影（Agnes + FaceFusion）

从两张个人照片出发，穿越 2–4 个中国历史朝代，生成"几生几世跨时空相爱"的电影级婚礼短片。

**核心流程：**
```
用户照片(男/女)
      ↓
① Agnes t2i 生成朝代双人场景首帧
      ↓
② FaceFusion 换脸增强（80%+ 面部复刻）
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
node timeless-wedding/scripts/timeless_wedding.js \
  --male-photo "groom.jpg" \
  --female-photo "bride.jpg" \
  --dynasties tang,song,ming,modern \
  --add-title --add-ending \
  --output "wedding.mp4"
```

**断点续跑 / 重生成 / 禁用换脸：**
```bash
# 断点续跑
node timeless-wedding/scripts/timeless_wedding.js --resume --work-dir "work/20250101-120000-xxxx"

# 重生成单个朝代
node timeless-wedding/scripts/timeless_wedding.js --resume --work-dir "..." --regenerate tang

# 禁用换脸（纯 Agnes 模式，面部相似度约 50–60%）
node timeless-wedding/scripts/timeless_wedding.js --male-photo "groom.jpg" --female-photo "bride.jpg" \
  --dynasties tang,song,ming,modern --no-face-swap --output "wedding.mp4"
```

---

#### 4. timeless-wedding-volc — 跨时空婚礼电影（Volcengine Ark）

基于 **火山方舟 Ark** 平台，使用 **Seedream 5.0 Pro** 生成朝代 AI 肖像与场景，**Seedance 2.0** 生成电影质感动态视频。无需 Python，画质更精细。

**核心流程：**
```
用户照片（男女各1张）
      ↓
Seedream i2i → 生成朝代 AI 肖像（保留五官，1424×800）
      ↓
Seedream multi-i2i → 男女肖像参考生成双人场景首帧
      ↓
Seedance 视频生成 → 首帧/参考图驱动生成 cinematic 视频
      ↓
FFmpeg 合并 → 朝代标题卡 → 视频 → 片头片尾
```

**基本用法：**
```powershell
$env:ARK_API_KEY = "your-ark-api-key"

node timeless-wedding-volc/scripts/timeless_wedding_volc.js `
  --male-photo "groom.jpg" `
  --female-photo "bride.jpg" `
  --dynasties "warring,tang,ming,modern" `
  --add-title --add-ending
```

**视频生成模式：** `first-frame`（默认）/ `first-last-frame` / `multimodal` / `portrait-reference` / `text2video`

**视频模型：** 标准版 `doubao-seedance-2-0-260128`（默认）/ Mini `doubao-seedance-2-0-mini-260615` / Fast `doubao-seedance-2-0-fast-260128`

> 详见 `timeless-wedding-volc/README.md` 产品说明，或 `timeless-wedding-volc/SKILL.md` 完整规范。

---

### 脱口秀视频

三个脱口秀技能，按需求选择：

| 技能 | 口型方案 | 差异 |
|------|---------|------|
| `talkshow` | Wav2Lip 后处理（需 Python + PyTorch） | 段子自动优化 + 链式场景，最灵活 |
| `talkshow-studio` | Agnes 原生音画同步（免 Python） | 生产级 SOP，人物/声音/字幕三线一致 |
| `talkshow-studio-kling` | 可灵原生音画同步（免 Python） | 可灵 Kling Video 3.0，720P 原生口型 |

#### 5. talkshow — 爆款舞台美女脱口秀视频生成器

基于 **Agnes AI**（Text + Image + Video 三模态）和 **Edge TTS**。用户输入一段脱口秀段子，系统自动优化剧本、拆分分镜、生成链式舞台视频，最终输出带语音和口型同步的完整脱口秀视频。

**核心流程：**
```
用户输入段子
      ↓
Agnes Text API → 优化幽默感 + 拆分 ~10s 分镜
      ↓
Edge TTS → 并行生成每场景中文语音 MP3（计算 num_frames）
      ↓
逐场景链式视频生成（t2i → image2video → 末帧 → i2i 重托管）
      ↓
音视频混流 + Wav2Lip 口型同步
      ↓
FFmpeg concat 合并 → 最终 MP4
```

**基本用法：**
```powershell
node talkshow/scripts/talkshow.js `
  --script "早高峰挤地铁，我被压成二维码，扫出来全是救命。" `
  --ratio 9:16 --api-key "sk-xxxx"
```

**跳过口型同步（加快速度）：**
```powershell
node talkshow/scripts/talkshow.js `
  --script "段子内容" --no-lipsync --api-key "sk-xxxx"
```

---

#### 6. talkshow-studio — 生产级脱口秀视频工坊（Agnes 版）

按生产级 SOP 一次成片：**资产锁定（人物/舞台/声音三线一致）→ 分镜表 → 双参考图锁定批量生成带原生口型语音的分镜视频 → 和谐转场拼接 + 响度归一 + 字幕压制**。基于 Agnes 全模态 API（`agnes-2.0-flash` / `agnes-image-2.5-flash` / `agnes-video-2.5-flash`）+ FFmpeg。

> 相比 `talkshow` 的 Wav2Lip 后处理方案，本技能利用 Agnes 视频模型的**原生音画同步**能力，免去 Python + PyTorch 依赖，且人物/声音/字幕一致性更佳。

---

#### 7. talkshow-studio-kling — 生产级脱口秀视频工坊（可灵版）

与 `talkshow-studio` 相同的生产级 SOP，但基于**可灵 Kling Video 3.0 Turbo（720P，原生音画同步）+ Kling Image 3.0（kling-v3，2K）+ OpenAI 兼容文本模型（分镜拆解）**。

---

### AI 音乐与下载

#### 8. suno-cn-music — AI 音乐创作助手

通过 Suno.cn HTTP REST API 实现 AI 音乐创作，提供 8 个 API 接口。

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

**Base URL:** `https://mcp.suno.cn`　**认证:** `Authorization: Bearer ${SUNO_CN_API_KEY}`

> `tags` 风格标签**必须使用英文**（如 `pop, folk, electronic`），禁止中文标签。上传音频仅支持 MP3，最大 50MB。

---

#### 9. music-downloader — 国内 5 大音乐平台歌曲下载器

根据演唱者和歌曲名称，从国内 5 大主流音乐平台搜索并下载歌曲（MP3）及歌词（LRC）。

| 平台 | 搜索 | 下载 | 歌词 |
|------|------|------|------|
| 网易云音乐 | 官方 API | 4 个第三方 API 回退 | 有 |
| QQ音乐 | 官方 API | 2 个第三方 API 回退 | 有 |
| 酷狗音乐 | 官方 API | 2 个第三方 API 回退 | 有 |
| 咪咕音乐 | 官方 API | 官方下载接口 | 有 |
| 汽水音乐 | 官方 API | 第三方 API + 官方试听 | 有 |

**命令行用法：**
```bash
# 单首下载
python scripts/batch_download_v4.py -s "陈奕迅" -n "孤勇者" -q high

# 指定音质
python scripts/batch_download_v4.py -s "周杰伦" -n "晴天" -q lossless

# 批量文件
python scripts/batch_download_v4.py --file songs.txt --era "2000年代" --level "S级" -q high

# Excel 批量
python scripts/batch_download_v4.py --excel "歌曲列表.xlsx" -q high
```

**音质参数：** `standard`（128kbps）/ `high`（320kbps，默认）/ `lossless`（FLAC）

**核心特性：** 5 平台逐层回退、多 API 回退、断点续传、自动歌词、音质可选、多种输入（dict/字符串/文本/文件/Excel）

---

### 内容创作与网站

#### 10. tech-article-craft — 自包含技术文章生成器

生成**单个自包含、独立可发布的 HTML 技术文章**，内联 CSS/JS + AI 配图 + HTML/CSS 图表组件，输出可直接发布到任何地方。

**7 步工作流：** 调研规划 → Hero 图 → 内联配图 → 技术图表（13 种 HTML/CSS 组件）→ 自包含 HTML → 验证 → 可选单文件化（base64 内嵌图片）

> 核心原则：一个 HTML 文件 + 一个 images 文件夹，通过 `file://` 即可打开，无需服务器。

---

#### 11. learning-handbook-pipeline — 图文并茂 PDF 学习手册生成流水线

把理论文本蒸馏成图文并茂的 PDF 学习手册，协调三个技能：`guizang-material-illustration`（概念插图）、`fireworks-tech-graph`（技术图表）、`design-taste-frontend-v1`（前端设计系统），产出 HTML 并转 PDF。

**5 阶段工作流：** 规划 → 视觉资产生成（插图 + 图表并行）→ HTML 构建 → PDF 转换（Puppeteer）→ 验证迭代

> 图文比 ≥ 1:3；单一琥珀强调色 `#F59E0B`；反 AI 俗套（无居中 hero、无紫蓝渐变、无 emoji 图标）。

---

#### 12. enterprise-portal-generator — 企业门户网站一键生成器

从单一用户简介生成**完整、生产就绪的 6 页企业门户网站**（首页/产品/新闻/关于/招聘/咨询），自适应 12 个行业预设。

**7 步工作流：** 解析简介选行业 → 设计令牌 → CSS 设计系统 → 页面资产 → 6 页 HTML → JS 交互 → 预飞检查（60+ 项）

**12 行业预设：** 软件/科技、金融/金融科技、医疗/健康、制造/工业、零售/电商、政府/公共、教育/培训、法律/专业、房地产/物业、咨询/顾问、物流/供应链、能源/清洁技术

> 三个调节盘：`DESIGN_VARIANCE`（1–10）、`MOTION_INTENSITY`（1–10）、`VISUAL_DENSITY`（1–10）。

---

### A 股量化分析

五个 A 股技能，各有侧重：

| 技能 | 核心能力 | 报告格式 |
|------|---------|---------|
| `a-stock-operator` | 个股六维诊断 + 市场资讯选股（纯规范型，经 MCP） | Markdown（带日期） |
| `a-stock-operator-v2` | 行情复盘 + 个股诊断（情绪温度计 + 板块轮动 + 双权重） | Markdown（带日期） |
| `a-stock-yiyangzhi` | 一阳指战法量化扫描（转势/开门 + 主线标签） | Markdown + CSV + JSON |
| `a-stock-lhb-rec` | 龙虎榜 T+3 涨停推荐（逻辑回归模型 + 自进化） | Markdown（带日期） |
| `a-stock-board-washout` | 首板洗盘 / 炸板洗盘选股（双策略 + 内联 SVG 图） | Markdown（带日期） |

> **产物落点**：五个技能的运行时产物（数据/CSV/JSON）默认写到 `<cwd>/<技能名>/`，报告（Markdown，带日期）写到 `<cwd>` 根目录，均不写回技能安装目录。可用环境变量覆盖（如 `A_STOCK_WORK`/`A_STOCK_OUT`、`LHB_RUNTIME`/`LHB_OUT`、`YZ_RUNTIME`/`YZ_OUT`、`WASHOUT_OUT`）。
>
> **报告命名规范**：所有 A 股技能报告统一为 `{报告完整中文名称}-{YYYY-MM-DD}.md`（连字符分隔，日期用 `YYYY-MM-DD`），例如 `行情复盘-2026-09-03.md`、`贵州茅台_个股诊断-2026-09-03.md`、`首板炸板洗盘-2026-09-03.md`。

#### 13. a-stock-operator — A 股市场操盘手

A 股市场操盘手技能，提供**个股六维诊断分析**和**市场资讯与选股推荐**两大能力。纯规范型技能（仅 SKILL.md），通过 `integrated_code_mode` MCP 调用东方财富 API 获取实时行情数据。

**三种输出模式：**

| 模式 | 触发条件 | 输出 |
|:---:|:---|:---|
| 模式A：仅个股诊断 | 提及个股名称/代码 + 成本价 | 个股六维诊断报告 |
| 模式B：仅行情分析 | 要求"行情分析/涨停/选股"等 | 市场资讯与选股报告 |
| 模式C：两者都要 | 同时提及个股诊断 + 行情分析 | 两份报告 |

**个股六维诊断（40+ 指标加权评分）：** 宏观行业（15%）、财务基本面（30%，一票否决）、估值性价比（20%）、技术面筹码（15%）、股东管理层（10%）、预期差催化剂（10%）。

**市场选股输出：** Top 10 资讯（每条含 2 只个股推荐）、首板低位突破（5 只）、突破放量热点（5 只），默认排除创业板/科创板，ST 永远排除。

---

#### 14. a-stock-operator-v2 — A 股行情复盘与个股诊断（增强版）

生成 A 股**行情复盘报告**与**个股诊断报告**，红涨绿跌、结论前置。Python 实现，公开财经 API 直采，一条命令完成「采集→健康检查→模型→报告」全流程。

**核心能力：** 市场全景（情绪温度计 + 连板梯队 + 主线题材）、近一月板块轮动、资金轮动四象限、个股六维双权重诊断。

**全流程一键管线：**
```bash
python scripts/collect_all.py                    # 采集 → 15 项健康检查 → 模型 → 报告
python scripts/collect_all.py --only-check       # 仅健康检查
python scripts/collect_all.py --skip collect_news.py  # 跳过指定步骤
```

> 报告输出到当前工程目录（Markdown，带日期），`A_STOCK_OUT` 可覆盖。

---

#### 15. a-stock-yiyangzhi — A 股一阳指战法量化扫描

自包含的 A 股「一阳指战法」量化技能，依据《一阳指·转势》《一阳指·开门》逻辑模型实现。

**核心能力：**
- **全市场扫描**：识别当日涨幅约 5%（3%~8% 带）且符合「转势」「开门」的个股，输出 Markdown + CSV + JSON（含买点/止损/卖点监控）
- **主线标签**：打「热点 / 中期主线 / 边缘偶发」标签，自动剔除边缘偶发股
- **个股单查**：输入代码/名称 + 日期，逐条判定
- **模型可靠性**：历史日K回放统计 T+5 命中率，校准量比阈值

**用法：**
```bat
py scripts\run.py scan 2026-09-02            :: 全市场扫描
py scripts\run.py scan --live --minpct 4 --maxpct 7   :: 盘中扫描
py scripts\run.py judge 600519 2026-09-02    :: 个股单查
py scripts\run.py optimize                   :: 可靠性优化
```

---

#### 16. a-stock-lhb-rec — 龙虎榜 T+3 涨停推荐与自进化模型

把「龙虎榜上榜个股 → 后期（T+1~T+3）仍有涨停冲高」做成可复用的可解释概率模型：每天收盘后自动出候选，每天用「昨日推荐 vs 今日实际涨停」验证并把新结果喂回训练，模型版本按时间外 AUC 不劣则 +1，越用越准。

**核心能力：** 盘后推荐（`P(T+3涨停)` 排序）、三维归因（技术 × 席位 × 行情）、席位画像（游资风格聚类）、自进化（时间衰减 + walk-forward 门控）。

**用法：**
```bash
python scripts/run.py init                 # 首次全量构建（约 10–15 分钟）
python scripts/run.py daily                # 每日盘后：抓榜 → 推荐 → 验证 → 进化 → 报告
python scripts/run.py optimize             # 手动触发自我进化重训
python scripts/run.py recommend 2026-08-31 # 单日推荐（用缓存）
```

---

#### 17. a-stock-board-washout — A 股首板洗盘 / 炸板洗盘选股器

分析最近一个结束交易日，用两条**首板洗盘**战法精选个股并给出第二日操作建议，输出原生 Markdown 报告（内联 K 线 / 量能 / 分时 SVG 图，红涨绿跌）。

**两条策略：**
- **策略一 · 首板后放量洗盘**：上一交易日首板（`lbc==1`）、本交易日未涨停，且非科创板/创业板，结合 K 线 + 量能 + 分时 + 热点/资金/位置，推荐 3 只。
- **策略二 · 炸板洗盘**：本交易日涨停炸板、非科创板/创业板，识别「炸板但强势、次日可低吸」标的，推荐 3 只。

**核心能力：** 质量闸门（流通市值 ≥50 亿 / 换手 ≥5% / 成交额 ≥5 亿 / 非高位）、强洗盘意图四维打分、分时强弱洗盘定级、多因子横截面评分（MAD 去极值 + 均秩分位 + 小样本收缩 + 缺失中性 50）、因子覆盖度自适应降权、每只候选内联 SVG 图（K 线 + 量能 + 分时）。

**用法：**
```bash
python scripts/all.py                      # 一键：采集 → 筛选 → 出图 → 报告
python scripts/generate_report.py          # 渲染 Markdown 报告 -> {cwd}/首板炸板洗盘-{YYYY-MM-DD}.md
```

> 报告输出到当前会话根目录（Markdown，带日期），`WASHOUT_OUT` 可覆盖输出目录。

---

### 技能数据抓取

#### 18. skill-data-fetcher — Skill 市场数据抓取工具集

一组（8 个）批量抓取主流 Skill 市场榜单并备份到本地文件的子技能，每个子技能独立可运行。

| 子技能 | 数据源 | 抓取内容 |
|--------|--------|---------|
| `smithery-skill-fetcher` | smithery.ai | slug、description、URL |
| `claudeskills-fetcher` | claudeskills.info | name、subtitle、brief、category、url、stars |
| `skillstore-fetcher` | skillstore.io | name、subtitle、brief、category、url、stars |
| `agent-skills-fetcher` | agent-skills.md | name、brief、url、stars |
| `skillsdirectory-fetcher` | skillsdirectory.com | name、brief、category、url、stars |
| `skill-cn-fetcher` | skill-cn.com | name、brief、category、url、stars |
| `cocoloop-skill-fetcher` | api.cocoloop.cn | name、subtitle、brief、category、URL |
| `skillsmp-skill-fetcher` | skillsmp.com | name、brief、url、stars |

> 每个子技能独立：`node skill-data-fetcher/<name>/scripts/fetch.js`，抓取结果保存到当前目录的 tab-separated 文件。

---

## 朝代列表

timeless-wedding 和 timeless-wedding-volc 均支持以下 13 个中国历史朝代：

| ID | 朝代 | 核心主题 | 年代 | 故事概述（timeless-wedding-volc） |
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

> timeless-wedding-volc 中带"故事概述"的朝代已配置完整的电影级时间分段分镜剧本（0–2s / 2–5s / 5–8s）。

---

## 婚礼电影方案对比

两个婚礼电影技能各有优势，根据需求选择：

| 维度 | timeless-wedding | timeless-wedding-volc |
|------|-------------------|--------------|
| AI 平台 | Agnes Image/Video | Volcengine Ark（豆包） |
| 图片模型 | Agnes Image 2.5 Flash | Seedream 5.0 Pro |
| 视频模型 | Agnes Video 2.5 Flash（固定） | Seedance 2.0（3 个版本可选） |
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

1. **产物落点**：所有技能的输出（视频、数据、报告）默认写到**运行命令时的当前工作目录**（`process.cwd()` / `os.getcwd()`），不写回技能安装目录。可用各技能的环境变量覆盖。

2. **文件持久化（关键）**：视频生成类技能生成的 MP4 文件需立即设置只读属性，防止工作区自动清空为 0 字节。
   ```powershell
   (Get-Item "output.mp4").IsReadOnly = $true    # Windows
   ```
   ```bash
   chmod 444 output.mp4                            # Linux/macOS
   ```

3. **两步式下载**：长时间视频任务建议先用 `--url-only` 获取 URL（长进程），再用短命令下载并设只读。

4. **帧数规则**：Agnes 视频的 `num_frames` 必须满足 `8n+1`（如 1, 9, 17, ..., 121, 241, 441）且 ≤441。

5. **API Key 安全**：如上下文中直接给出 Key，通过 `--api-key` 参数传入，不要写入环境变量文件或代码中。

6. **断点续跑**：timeless-wedding 和 timeless-wedding-volc 均通过 `state.json` 支持中断后恢复，使用 `--resume` + `--work-dir` 继续。

7. **照片建议**：婚礼电影类技能使用正面清晰照片，光线均匀，面部无遮挡，效果最佳。

8. **并发控制**：视频生成任务并发数为 2，避免 API 限流。

9. **FFmpeg 降级**：若 FFmpeg < 4.4，自动使用 `concat demuxer` 无转场拼接。

---

## 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| `FFmpeg not found` | 未安装 FFmpeg | Windows: `winget install Gyan.FFmpeg` |
| `Request body size exceeds 64MB` | 照片文件过大 | 压缩照片至 2MB 以下 |
| 视频任务 `failed` | 首帧敏感内容 / API 限流 | 用 `--regenerate <id>` 重试 |
| 面部保留度低 | 照片角度 / 光线不佳 | 使用正面高清照片，timeless-wedding-volc 尝试 `--mode multimodal` |
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
| A 股技能报告找不到 | 报告写到 cwd 根目录 | 检查运行时当前工作目录，或设置 `A_STOCK_OUT` / `LHB_OUT` / `YZ_OUT` |

---

## 快速选择指南

| 需求 | 推荐技能 | 理由 |
|------|---------|------|
| 生成一张精美 AI 图片 | `agnes-image-gen-2` | 电影级画质，文生图 / 图生图 |
| 生成一段 AI 视频 | `agnes-video-gen-2` | 4 种工作流，灵活选择 |
| 创作一首 AI 音乐 | `suno-cn-music` | 8 个 API，全流程覆盖 |
| 下载已有歌曲（MP3 + 歌词） | `music-downloader` | 5 平台回退，批量下载，自动歌词 |
| 婚礼电影 — 需高面部相似度 | `timeless-wedding` | FaceFusion 换脸 80%+ |
| 婚礼电影 — 无需 Python，快速生成 | `timeless-wedding-volc` | Seedream i2i 保留五官，零额外依赖 |
| 婚礼电影 — 需要分镜剧本 | `timeless-wedding-volc` | 战国/唐/明/现代已配置时间分段剧本 |
| 婚礼电影 — 朝代较多（5 个） | `timeless-wedding-volc` | 支持 2–5 个朝代 |
| 脱口秀 — 段子自动优化 + Wav2Lip 口型 | `talkshow` | 剧本优化 + TTS + Wav2Lip，最灵活 |
| 脱口秀 — 免 Python，原生口型 | `talkshow-studio` | Agnes 原生音画同步，生产级 SOP |
| 脱口秀 — 可灵生态 | `talkshow-studio-kling` | Kling Video 3.0，720P 原生口型 |
| 撰写可发布的技术文章 | `tech-article-craft` | 自包含 HTML + AI 配图 + 13 种图表组件 |
| 制作图文并茂的 PDF 学习手册 | `learning-handbook-pipeline` | 三技能协作 + Puppeteer 转 PDF |
| 生成企业门户网站 | `enterprise-portal-generator` | 6 页生产级网站 + 12 行业预设 + 60+ 项预飞检查 |
| A 股个股诊断分析 | `a-stock-operator` | 六维评分体系 + 12 API 实时数据 + 6 层验证 |
| A 股市场行情与选股 | `a-stock-operator` | 涨停池 + 板块排行 + 龙虎榜 + 情绪指标 |
| A 股行情复盘（板块轮动+情绪温度计） | `a-stock-operator-v2` | 一键管线 + 情绪温度计 + 板块轮动 + 资金四象限 |
| A 股一阳指战法量化扫描 | `a-stock-yiyangzhi` | 转势/开门判定 + 主线标签 + 可靠性优化 |
| A 股龙虎榜 T+3 涨停预判 | `a-stock-lhb-rec` | 逻辑回归概率模型 + 席位画像 + 自进化 |
| A 股首板洗盘 / 炸板洗盘选股 | `a-stock-board-washout` | 双策略洗盘识别 + 内联 K 线/量能/分时 SVG + 第二日操作建议 |
| 从需求到代码的完整开发流程编排 | `dev-lifecycle` | 5 阶段 + HITL 确认 + SOP 6 步开发 |
| 批量备份 Skill 市场榜单 | `skill-data-fetcher` | 8 家主流 Skill 市场，独立运行 |

---

## 许可证

仅供个人学习和非商业用途。请遵守各 AI 平台的使用条款：

- **Agnes** — Agnes Image / Video / Text API 使用条款
- **Volcengine Ark** — 火山方舟平台使用条款
- **Suno.cn** — Suno.cn 服务条款
- **Kling（可灵）** — 快手可灵平台使用条款
- **FaceFusion** — [MIT License](https://github.com/facefusion/facefusion/blob/master/LICENSE)
