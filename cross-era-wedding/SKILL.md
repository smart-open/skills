---
name: "cross-era-wedding"
description: "Generates a cinematic cross-era wedding movie from two personal photos across 2-4 Chinese dynasties. Invoke when user wants to create an AI wedding film, cross-time love story video, or dynasty-themed couple video with face-swap enhancement."
---

# Cross-Era Wedding - AI 跨时空婚礼电影生成器

从两张个人照片出发，穿越 2–4 个中国历史朝代，生成一段"几生几世跨时空相爱"的电影级婚礼短片。

## 功能概述

1. **首帧生成**：为每个选中的朝代生成电影级双人婚礼场景首帧（Agnes Image t2i）
2. **换脸增强**（可选但强烈推荐）：通过 FaceFusion 将用户真实面部替换到场景中，实现 80%+ 面部复刻
3. **视频生成**：以首帧驱动生成每朝代约 5–8 秒电影级视频（Agnes Video image2video）
4. **合并输出**：通过 FFmpeg 将所有朝代视频合并为一段带转场的完整 MP4，可选片头片尾

## 支持的朝代

| ID | 朝代 | 核心主题 |
|---|---|---|
| xia | 夏 | 上古盟誓 |
| xizhou | 西周 | 礼乐婚典 |
| warring | 战国 | 剑客侠侣 |
| han | 汉 | 汉风红妆 |
| jin | 晋 | 魏晋风骨 |
| nanbeichao | 南北朝 | 丝路情缘 |
| tang | 唐 | 大唐盛世 |
| song | 宋 | 宋韵清雅 |
| yuan | 元 | 草原盟约 |
| ming | 明 | 凤冠霞帔 |
| qing | 清 | 满汉合璧 |
| minguo | 民国 | 十里洋场 |
| modern | 现代 | 永恒誓言 |

## 依赖要求

### 必需
- **Node.js 12+**（仅使用内置模块，无需 npm install）
- **Agnes API Key**（环境变量 `agnes-api-key` 或 `--api-key`）
- **FFmpeg 4.4+**（用于视频合并与转场，旧版自动降级为无转场拼接）

### 强烈推荐（实现 80%+ 面部复刻）
- **Python 3.10+**
- **FaceFusion**（开源换脸工具，支持 CPU 运行）

### FaceFusion 安装（Windows）
```powershell
# 方式1：手动安装
git clone https://github.com/facefusion/facefusion.git
cd facefusion
python install.py --onnxruntime cpu

# 方式2：使用附带脚本（如果存在）
.\.trae\skills\cross-era-wedding\scripts\install_facefusion.bat
```

安装后设置环境变量：
```powershell
$env:FACEFUSION_PATH="C:\facefusion\run.py"
```

## 使用方法

### 基本用法（2–4 个朝代）

```bash
node .trae/skills/cross-era-wedding/scripts/cross_era_wedding.js \
  --male-photo "D:\photos\groom.jpg" \
  --female-photo "D:\photos\bride.jpg" \
  --dynasties tang,song,ming,modern \
  --output "D:\output\wedding.mp4"
```

### 完整参数示例

```bash
node .trae/skills/cross-era-wedding/scripts/cross_era_wedding.js \
  --male-photo "D:\photos\groom.jpg" \
  --female-photo "D:\photos\bride.jpg" \
  --dynasties tang,song,ming,modern \
  --transition-duration 1.0 \
  --add-title \
  --add-ending \
  --num-frames 121 \
  --frame-rate 24 \
  --output "D:\output\wedding.mp4"
```

### 断点续跑

如果中途中断，使用 `--resume` 从上次状态继续：

```bash
node .trae/skills/cross-era-wedding/scripts/cross_era_wedding.js \
  --resume \
  --work-dir "D:\...\work\20250101-120000-xxxx"
```

### 重生成单个朝代

```bash
node .trae/skills/cross-era-wedding/scripts/cross_era_wedding.js \
  --resume \
  --work-dir "D:\...\work\20250101-120000-xxxx" \
  --regenerate tang
```

### 禁用换脸（纯 Agnes 模式）

如果不安装 FaceFusion，使用 `--no-face-swap` 运行。面部相似度约 50–60%，流程仍然完整：

```bash
node .trae/skills/cross-era-wedding/scripts/cross_era_wedding.js \
  --male-photo "D:\photos\groom.jpg" \
  --female-photo "D:\photos\bride.jpg" \
  --dynasties tang,song,ming,modern \
  --no-face-swap \
  --output "D:\output\wedding.mp4"
```

## 参数速查

| 参数 | 说明 | 必填 | 默认 |
|---|---|---|---|
| `--male-photo <path>` | 男方照片路径 | 是 | — |
| `--female-photo <path>` | 女方照片路径 | 是 | — |
| `--dynasties <ids>` | 逗号分隔的朝代 ID（2–4 个） | 是 | — |
| `--transition-duration <s>` | 转场时长（秒） | 否 | `1.0` |
| `--add-title` | 添加片头 | 否 | 关闭 |
| `--add-ending` | 添加片尾 | 否 | 关闭 |
| `--output <path>` | 最终输出 MP4 路径 | 否 | `work/{session}/final/wedding_movie_{id}.mp4` |
| `--resume` | 从 state.json 断点续跑 | 否 | 关闭 |
| `--regenerate <id>` | 重生成指定朝代 | 否 | — |
| `--no-face-swap` | 禁用 FaceFusion 换脸 | 否 | 关闭 |
| `--facefusion-path <path>` | FaceFusion run.py 路径 | 否 | 自动检测 |
| `--api-key <key>` | Agnes API Key | 否 | 环境变量 `agnes-api-key` |
| `--work-dir <dir>` | 工作目录 | 否 | `work/{sessionId}/` |
| `--num-frames <n>` | 每朝代视频帧数 | 否 | `121`（约 5 秒） |
| `--frame-rate <n>` | 视频帧率 | 否 | `24` |

## 帧数与时长对照

| 帧数 | 时长（@24fps） | 备注 |
|---|---|---|
| 121 | ~5.0 秒 | 默认，最稳妥 |
| 169 | ~7.0 秒 | 推荐 |
| 193 | ~8.0 秒 | 推荐 |
| 241 | ~10.0 秒 | 较长 |

**注意**：`num-frames` 必须满足 `8n+1` 规则且 `<= 441`。

## 工作流程详解

```
用户照片(男) ──┐
用户照片(女) ──┤
               │
     步骤1: Agnes t2i 生成朝代双人场景首帧
               ↓
     步骤2: FaceFusion 换脸增强（男→女顺序替换）
               ↓
     步骤3: Agnes i2i 上传换脸后首帧获取公开 URL
               ↓
     步骤4: Agnes image2video 生成每朝代视频
               ↓
     步骤5: FFmpeg xfade/acrossfade 合并 + 片头片尾
               ↓
          最终婚礼电影 MP4
```

## 文件结构

```
work/
└── {YYYYMMDD-HHMMSS-sessionId}/
    ├── state.json                 # 断点状态
    ├── frames/
    │   └── {dynasty}_scene.jpg    # 原始首帧
    ├── swapped/
    │   ├── {dynasty}_male_swapped.jpg
    │   └── {dynasty}_final.jpg    # 换脸后最终首帧
    ├── videos/
    │   └── {dynasty}.mp4          # 单朝代视频
    ├── temp/
    │   ├── {dynasty}_uploaded.jpg # 上传用中间文件
    │   ├── title.mp4              # 片头（如启用）
    │   ├── ending.mp4             # 片尾（如启用）
    │   └── concat_list.txt        # FFmpeg 合并列表
    └── final/
        └── wedding_movie_{id}.mp4 # 最终输出
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `agnes-api-key` | Agnes Image/Video API Key |
| `AGNES_API_KEY` | Agnes API Key（备用） |
| `FACEFUSION_PATH` | FaceFusion run.py 的绝对路径 |

## 注意事项

1. **API Key 优先级**：`--api-key` > 环境变量 `agnes-api-key` > `AGNES_API_KEY`
2. **FaceFusion 检测**：脚本会自动检测 FaceFusion，未安装时提示安装指引并降级运行
3. **视频下载**：每段视频下载后立即设为只读，防止工作区清空为 0 字节
4. **并发控制**：视频生成任务并发数为 2，避免 API 限流
5. **FFmpeg 降级**：若 FFmpeg < 4.4，自动使用 `concat demuxer` 无转场拼接
6. **照片建议**：使用正面清晰照片，光线均匀，面部无遮挡，换脸效果最佳
7. **生成耗时**：2 个朝代约 10–15 分钟，4 个朝代约 20–30 分钟（取决于 API 排队情况）
