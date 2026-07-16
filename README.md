# AI Skills 工程集合

一套面向 AI 多媒体创作（图片、视频、音乐、跨时空婚礼电影）的 TRAE Skills 集合，涵盖文生图、图生图、文生视频、图生视频、AI 音乐生成，以及基于真实照片的跨朝代婚礼电影自动化流水线。

## 技能总览

| 技能 | 一句话说明 | 依赖平台 | 运行依赖 |
|------|-----------|---------|---------|
| `agnes-image-gen-2` | Agnes Image 2.1 Flash 电影级图片生成（文生图 / 图生图） | Agnes Image API | Node.js 12+ |
| `agnes-video-gen-2` | Agnes Video V2.0 电影级视频生成（文生/图生/多图/关键帧） | Agnes Video API | Node.js 12+ |
| `cross-era-wedding` | 跨时空婚礼电影生成器（Agnes + FaceFusion 换脸） | Agnes Image/Video API + FaceFusion + FFmpeg | Node.js 12+、Python 3.10+（可选）、FFmpeg 4.4+ |
| `volc-wedding` | 基于 Volcengine Ark 的跨时空婚礼电影生成器 | 火山方舟 Ark API + FFmpeg | Node.js 12+、FFmpeg 4.4+ |
| `suno-cn-music` | Suno.cn AI 音乐创作助手（生成/续写/歌词/上传参考） | Suno.cn API | 无（HTTP REST 调用） |

> 全部脚本仅使用 Node.js 内置模块（`https`、`fs`、`path` 等），**无需 `npm install`**。

## 目录结构

```
d:\ai_work\skills\
├── README.md                      # 本文件
├── agnes-image-gen-2/
│   ├── SKILL.md                   # 技能定义与使用文档
│   └── scripts/
│       └── agnes_image_gen.js     # 图片生成脚本（t2i / i2i）
├── agnes-video-gen-2/
│   ├── SKILL.md
│   └── scripts/
│       └── agnes_video_gen.js     # 视频生成脚本（4 种工作流）
├── cross-era-wedding/
│   ├── SKILL.md
│   └── scripts/
│       ├── cross_era_wedding.js   # 婚礼电影主流水线
│       ├── dynasties.js           # 朝代配置（13 朝）
│       └── install_facefusion.bat # FaceFusion 安装脚本（Windows）
├── volc-wedding/
│   ├── README.md                  # Volc Wedding 专项说明
│   ├── SKILL.md
│   └── scripts/
│       ├── volc_wedding.js        # 主入口 CLI + 状态机
│       ├── ark_client.js          # Ark API 通信封装
│       ├── dynasties.js           # 13 朝代配置 + 分镜剧本
│       ├── image_pipeline.js      # Seedream 肖像 + 场景生成
│       ├── video_pipeline.js      # Seedance 5 模式视频生成
│       └── merge_engine.js        # FFmpeg 合并 + 标题卡
└── suno-cn-music/
    ├── SKILL.md                   # 完整 API 调用规范（8 个 API）
    ├── install.bat                # Windows 安装（如需）
    └── install.sh                 # Linux/macOS 安装
```

## 环境准备

### 必需环境

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | 12+ | 所有脚本运行基础 |
| FFmpeg | 4.4+ | 视频合并与转场（婚礼电影类技能） |

### API Key 配置

不同技能使用不同的 API Key，通过环境变量配置：

| 技能 | 环境变量 | 获取方式 |
|------|---------|---------|
| agnes-image-gen-2 / agnes-video-gen-2 / cross-era-wedding | `agnes-api-key` 或 `AGNES_API_KEY` | Agnes 平台 |
| volc-wedding | `ARK_API_KEY` | 火山方舟控制台 |
| suno-cn-music | `SUNO_CN_API_KEY` | https://www.suno.cn/home/#/mcp |

> 所有 API Key 也支持通过命令行参数 `--api-key` 传入（优先级高于环境变量）。

### 可选依赖

| 依赖 | 用途 | 适用技能 |
|------|------|---------|
| Python 3.10+ | FaceFusion 换脸运行环境 | cross-era-wedding |
| FaceFusion | 真实面部替换，实现 80%+ 面部复刻 | cross-era-wedding |

## 技能详解

### 1. agnes-image-gen-2 — 电影级 AI 图片生成

通过 **Agnes Image 2.1 Flash** API 生成电影级高清图片。

**支持模式：**
- **文生图（t2i）**：纯文本描述生成图片
- **图生图（i2i）**：基于现有图片转换 / 编辑

**快速示例：**
```bash
node scripts/agnes_image_gen.js \
  --mode t2i \
  --prompt "一位古典西汉美女，曲裾深衣，堕马髻，朱红宫殿背景" \
  --size 768x1024 \
  --output "output.png" \
  --api-key "sk-xxxx"
```

脚本自动追加电影质感修饰词（cinematic lighting、8K、HDR 等），支持本地图片 base64 上传、URL 输出与 base64 输出两种格式。

### 2. agnes-video-gen-2 — 电影级 AI 视频生成

通过 **Agnes Video V2.0** API 生成电影级视频，支持四种工作流。

| 工作流 | 说明 | 是否需要图片 |
|--------|------|-------------|
| `text2video` | 纯文本生成视频 | 否 |
| `image2video` | 单图驱动视频 | 是（1 张） |
| `multi2video` | 多图引导生成 | 是（≥2 张） |
| `keyframes` | 关键帧间过渡动画 | 是（≥2 张） |

默认参数：1152×768（16:9）、121 帧、24fps（约 5 秒），开箱即用。支持 `--url-only` 两步式流程确保文件持久化。

### 3. cross-era-wedding — 跨时空婚礼电影（Agnes + FaceFusion）

从两张个人照片出发，穿越 2–4 个中国历史朝代，生成"几生几世跨时空相爱"的电影级婚礼短片。

**核心流程：**
1. Agnes t2i 生成朝代双人场景首帧
2. FaceFusion 换脸增强（80%+ 面部复刻）
3. Agnes image2video 生成每朝代视频
4. FFmpeg 合并 + 转场 + 片头片尾

**支持 13 个朝代**：夏、西周、战国、汉、晋、南北朝、唐、宋、元、明、清、民国、现代。

**快速示例：**
```bash
node scripts/cross_era_wedding.js \
  --male-photo "groom.jpg" \
  --female-photo "bride.jpg" \
  --dynasties tang,song,ming,modern \
  --add-title --add-ending \
  --output "wedding.mp4"
```

支持 `--resume` 断点续跑、`--regenerate` 重生成单个朝代、`--no-face-swap` 纯 Agnes 模式。

### 4. volc-wedding — 跨时空婚礼电影（Volcengine Ark）

基于 **火山方舟 Ark** 平台，使用 **Seedream 5.0 Pro** 生成朝代 AI 肖像与场景，**Seedance 2.0** 生成电影质感动态视频。

**与 cross-era-wedding 的区别：**

| 维度 | cross-era-wedding | volc-wedding |
|------|-------------------|--------------|
| AI 平台 | Agnes Image/Video | Volcengine Ark（豆包） |
| 面部复刻 | FaceFusion 换脸（80%+） | Seedream i2i 保留五官特征 |
| 朝代数量 | 2–4 个 | 2–5 个 |
| 视频模式 | image2video | 5 种模式（first-frame / first-last-frame / multimodal / portrait-reference / text2video） |
| 标题卡片 | 可选片头片尾 | 朝代标题卡 + 片头片尾 |
| 视频模型 | 固定 | 可选标准版 / Mini 快速版 / Fast 极速版 |
| 断点续跑 | 支持 | 支持 |

**快速示例：**
```powershell
node scripts/volc_wedding.js `
  --male-photo "groom.jpg" `
  --female-photo "bride.jpg" `
  --dynasties "tang,song,ming,modern" `
  --add-title --add-ending
```

### 5. suno-cn-music — AI 音乐创作助手

通过 Suno.cn HTTP REST API 实现 AI 音乐创作，提供 8 个 API 接口。

| API | 功能 |
|-----|------|
| 生成音乐 | AI 模式 / 自定义歌词模式，支持多种模型版本（v3.5 ~ v5.5） |
| 查询任务状态 | 轮询生成进度（带 wait 参数） |
| 查询音乐列表 | 分页查看历史生成记录 |
| 获取歌词 | 获取 LRC 格式歌词 |
| 续写音乐 | 在已有歌曲基础上继续创作 |
| AI 生成歌词 | 先生成歌词再创作音乐 |
| 上传参考音频 | MP3 上传，用于 cover / 添加人声 / 伴奏 / 音轨 |
| 查询账户信息 | 积分、余额、会员状态 |

Base URL: `https://mcp.suno.cn`，标准 HTTP REST 调用。

## 通用注意事项

1. **文件持久化**：视频生成类技能生成的 MP4 文件需立即设置只读属性（`IsReadOnly=$true` / `chmod 0o444`），防止工作区自动清空为 0 字节。
2. **两步式下载**：长时间视频任务建议先用 `--url-only` 获取 URL，再用短命令下载并设只读，避免长进程退出后文件丢失。
3. **帧数规则**：Agnes 视频的 `num_frames` 必须满足 `8n+1` 且 ≤441。
4. **API Key 安全**：如上下文中直接给出 Key，通过 `--api-key` 参数传入，不要写入环境变量文件。
5. **断点续跑**：cross-era-wedding 和 volc-wedding 均通过 `state.json` 支持中断后恢复。

## 快速选择指南

| 需求 | 推荐技能 |
|------|---------|
| 生成一张精美 AI 图片 | `agnes-image-gen-2` |
| 生成一段 AI 视频 | `agnes-video-gen-2` |
| 创作一首 AI 音乐 | `suno-cn-music` |
| 用照片做跨朝代婚礼电影（需高面部相似度） | `cross-era-wedding`（FaceFusion 换脸） |
| 用照片做跨朝代婚礼电影（无需 Python，快速生成） | `volc-wedding`（Seedream i2i 保留五官） |

## 许可证

仅供个人学习和非商业用途。请遵守各 AI 平台（Agnes、Volcengine Ark、Suno.cn）的使用条款。
