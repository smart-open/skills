---
name: "cross-era-wedding"
description: "AI 跨时空婚礼电影生成器（免费 API 版）。基于 Agnes 免费图片/视频 API，上传男女照片穿越 2-4 个中国历史朝代生成电影级婚礼短片。当用户想要免费制作 AI 婚礼视频、跨朝代爱情电影、或 dynasty-themed couple video with face-swap enhancement 时调用此 Skill。"
---

# Cross-Era Wedding - AI 跨时空婚礼电影生成器（免费 API 版）

> **核心优势**：基于 **Agnes 免费图片/视频 API**，零成本生成跨时空婚礼电影。上传两张个人照片，穿越 2–4 个中国历史朝代，生成一段"几生几世跨时空相爱"的电影级婚礼短片。

## 功能概述

1. **首帧生成**：为每个选中的朝代生成电影级双人婚礼场景首帧（Agnes Image t2i，**免费**）
2. **AI 肖像**（可选）：为每个朝代生成保留面部特征的古装单人肖像（Agnes Image i2i，**免费**）
3. **换脸增强**（可选但强烈推荐）：通过 FaceFusion 将用户真实面部替换到场景中，实现 80%+ 面部复刻
4. **视频生成**：以首帧驱动生成每朝代约 5–8 秒电影级视频（Agnes Video image2video，**免费**），含时间分段分镜剧本
5. **合并输出**：通过 FFmpeg 将所有片段合并为完整 MP4，含**朝代标题卡片**（朝代名 + 核心故事概述）、片头片尾

## API 费用说明

| 服务 | 提供商 | 费用 |
|------|--------|------|
| 图片生成（t2i / i2i） | Agnes Image Gen 2 | **免费** |
| 视频生成（image2video） | Agnes Video Gen 2 | **免费** |
| 视频合并 | FFmpeg（本地） | **免费** |
| 换脸增强 | FaceFusion（本地开源） | **免费** |

> 本 Skill 全程使用 Agnes 免费 API，无需付费即可生成完整婚礼电影。仅当 API 限流或内容审核失败时需要重试。

## 支持的朝代

每个朝代均配有：年代范围、核心故事概述、电影级时间分段分镜剧本（0-2s / 2-5s / 5-8s）。

| ID | 朝代 | 主题 | 年代 | 核心故事概述 |
|---|---|---|---|---|
| xia | 夏 | 上古盟誓 | c.2070–1600 BCE | 黄河岸边的远古盟誓 |
| xizhou | 西周 | 礼乐婚典 | 1046–771 BCE | 青铜礼器前的神圣盟约 |
| warring | 战国 | 剑客侠侣 | 475–221 BCE | 烽火连天下的重逢之誓 |
| han | 汉 | 汉风红妆 | 202 BCE–220 CE | 未央宫中结发同心的誓言 |
| jin | 晋 | 魏晋风骨 | 265–420 | 竹林曲水间的琴瑟和鸣 |
| nanbeichao | 南北朝 | 丝路情缘 | 420–589 | 石窟佛像前的千年祈愿 |
| tang | 唐 | 大唐盛世 | 618–907 | 长安灯火下的千年之约 |
| song | 宋 | 宋韵清雅 | 960–1279 | 汴河虹桥上的柔情蜜意 |
| yuan | 元 | 草原盟约 | 1271–1368 | 草原落日中的敖包相会 |
| ming | 明 | 凤冠霞帔 | 1368–1644 | 紫禁城中的凤冠之约 |
| qing | 清 | 满汉合璧 | 1644–1912 | 红墙喜堂里的跨族之缘 |
| minguo | 民国 | 十里洋场 | 1912–1949 | 外滩钟声里的西洋誓约 |
| modern | 现代 | 永恒誓言 | 1949–Present | 山海之间的永恒承诺 |

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
     步骤1: Agnes t2i 生成朝代双人场景首帧（免费）
               ↓
     步骤2（可选）: Agnes i2i 生成朝代 AI 肖像（保留五官，免费）
               ↓
     步骤3（可选）: FaceFusion 换脸增强（男→女顺序替换，本地免费）
               ↓
     步骤4: Agnes i2i 上传首帧获取公开 URL（免费）
               ↓
     步骤5: Agnes image2video 生成每朝代视频（免费）
               ↓
     步骤6: FFmpeg concat demuxer 合并 + 朝代标题卡 + 片头片尾
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
    ├── portraits/
    │   ├── {dynasty}_male.jpg     # AI 肖像（男）
    │   └── {dynasty}_female.jpg   # AI 肖像（女）
    ├── swapped/
    │   ├── {dynasty}_male_swapped.jpg
    │   └── {dynasty}_final.jpg    # 换脸后最终首帧
    ├── videos/
    │   └── {dynasty}.mp4          # 单朝代视频
    ├── temp/
    │   ├── {dynasty}_uploaded.jpg # 上传用中间文件
    │   ├── {dynasty}_card.mp4     # 朝代标题卡（朝代名+故事概述）
    │   ├── title.mp4              # 片头（"几生几世 跨时空相爱"）
    │   ├── ending.mp4             # 片尾（"今生今世 永不分离"）
    │   ├── simhei.ttf             # 中文字体（自动复制）
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

1. **API 完全免费**：本 Skill 全程使用 Agnes 免费 API（图片生成 + 视频生成），无需任何付费
2. **API Key 优先级**：`--api-key` > 环境变量 `agnes-api-key` > `AGNES_API_KEY`
3. **FFmpeg 路径检测**：脚本自动检测完整版 FFmpeg（winget 安装路径），避免使用 TRAE 内置轻量版（缺少 drawtext/concat）
4. **中文字体处理**：Windows 下自动将 `simhei.ttf` 复制到工作目录，使用相对路径避免 FFmpeg filter 冒号解析错误
5. **FaceFusion 检测**：脚本自动检测 FaceFusion，未安装时提示安装指引并降级运行
6. **视频下载**：每段视频下载后立即设为只读，防止工作区清空为 0 字节
7. **并发控制**：视频生成任务并发数为 2，避免 API 限流
8. **合并策略**：默认使用 `concat demuxer + re-encode`（更可靠），避免 xfade 导致的视频流截断问题
9. **照片建议**：使用正面清晰照片，光线均匀，面部无遮挡，换脸效果最佳
10. **生成耗时**：2 个朝代约 10–15 分钟，4 个朝代约 20–30 分钟（取决于 API 排队情况）
11. **Prompt 长度**：Agnes API 对长 prompt 敏感，所有 image/video prompt 均保持简洁（~200 字符），避免 content_policy_violation
