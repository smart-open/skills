---
name: "comedy-show"
description: "爆款舞台美女脱口秀视频生成器。用户输入脱口秀段子，自动优化剧本、分镜、生成链式视频并拼接成完整脱口秀视频。当用户想制作脱口秀视频、喜剧短视频、舞台表演视频时调用此 Skill。"
---

# Comedy Show - 爆款舞台美女脱口秀视频生成器

基于 **Agnes AI** 平台（Text + Image + Video 三模态）和 **Edge TTS** 的脱口秀视频生成 Skill。用户输入一段脱口秀段子，系统自动优化剧本、拆分分镜、生成链式舞台视频，最终输出带语音的完整脱口秀视频。

## 核心特性

- **Agnes Text API**（`agnes-2.0-flash`）优化剧本：增强幽默感、社会洞察力、大众共鸣，自动拆分为 ~10s 分镜
- **Agnes Image API**（`agnes-image-2.1-flash`）生成首帧：性感现代化长发美女手持话筒在舞台，t2i 首帧 + i2i 末帧重托管
- **Agnes Video API**（`agnes-video-v2.0`）链式生成：每场景取上一场景末帧作为首帧，保证视觉连贯
- **Edge TTS** 免费中文女声语音合成，默认 `zh-CN-XiaoxiaoNeural`（晓晓），支持多种音色
- **Wav2Lip 口型同步**：因 Agnes Video API 不支持音频输入，采用 Wav2Lip（PyTorch CPU）对每场景做后处理，驱动人像嘴部与 TTS 音频精准对齐；可用 `--no-lipsync` 跳过
- **FFmpeg** 音视频混流 + concat 拼接，输出完整 MP4
- **断点续跑**：通过 `state.json` 支持 `--resume` 和 `--regenerate`
- **可选字幕**：`--add-subtitles` 在画面底部烧录中文字幕
- **双宽高比**：支持 9:16 竖版（抖音/快手/小红书）和 16:9 横版（B站/YouTube）
- **零 npm 依赖**：纯 Node.js 内置模块 + Python（edge-tts + PyTorch/Wav2Lip）

## 环境要求

- **Node.js** 12+
- **FFmpeg** 4.4+ 完整版（需支持 `drawtext` 和 `concat`）
- **Python** + `edge-tts`（`pip install edge-tts`）
- **Agnes API Key**
- **PyTorch（CPU 版）+ Wav2Lip**（口型同步，可选但默认启用）

### FFmpeg 安装（Windows）

```powershell
winget install Gyan.FFmpeg
```

### Edge TTS 安装

```powershell
pip install edge-tts
```

### Wav2Lip 口型同步依赖

口型同步默认启用，需准备以下依赖（如不需口型同步，可加 `--no-lipsync` 跳过，则无需安装）：

- **PyTorch CPU 版**：安装到独立目录（如 `D:\ai_w2l\libs`），通过 `PYTHONPATH` 注入，不污染全局环境
- **Wav2Lip 仓库**：克隆到 `D:\ai_work\musics\Wav2Lip`，需包含 `inference.py` 与 `checkpoints/`
- **模型权重**：
  - `checkpoints/wav2lip_gan.pth`（Enhanced 质量，默认）
  - `checkpoints/wav2lip.pth`（Fast 质量）
- **完整版 FFmpeg**：Wav2Lip 内部 ffmpeg 调用需支持完整编解码（脚本通过 `WAV2LIP_FFMPEG` 环境变量指定完整版路径）

```powershell
# 1. 克隆 Wav2Lip 仓库
git clone https://github.com/Rudrabha/Wav2Lip D:\ai_work\musics\Wav2Lip

# 2. 下载预训练权重到 checkpoints/ 目录
#    wav2lip_gan.pth（推荐）、wav2lip.pth

# 3. 安装 PyTorch CPU 版（示例：安装到独立 libs 目录）
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu --target D:\ai_w2l\libs
```

## 工作流

```
用户输入脱口秀段子
       │
       ▼
┌─────────────────┐
│  Agnes Text API │  优化幽默感 + 社会洞察 + 拆分 ~10s 分镜
│  agnes-2.0-flash│  返回 JSON: optimized_script + scenes[]
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   Edge TTS      │  并行生成每场景中文语音 MP3
│  zh-CN-Xiaoxiao │  ffprobe 提取时长 → 计算 num_frames (8n+1)
└─────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  逐场景串行链式视频生成                  │
│                                         │
│  Scene 0: t2i 首帧 → URL                │
│           → image2video → MP4           │
│           → FFmpeg 提取末帧 → PNG       │
│           → i2i 重托管 → 公开 URL       │
│           → mux(视频 + 音频) → MP4      │
│           → Wav2Lip 口型同步 → MP4      │
│                                         │
│  Scene 1: 上场景 URL → image2video      │
│           → MP4 → 末帧 → i2i → mux      │
│           → Wav2Lip 口型同步 → MP4      │
│                                         │
│  Scene N: ...                           │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────┐
│  FFmpeg concat  │  合并所有场景 → 最终 MP4
│  + re-encode    │  （有画面 + 有声音 + 口型同步）
└─────────────────┘
```

## 使用方法

### 设置 API Key

```powershell
# 方式 1：环境变量（注意 PowerShell 中变量名含连字符需用大括号）
${env:agnes-api-key} = "your-agnes-api-key"

# 方式 2：命令行参数
--api-key "your-agnes-api-key"
```

### 基础用法

```powershell
cd D:\ai_work\musics\.trae\skills\comedy-show\scripts

node comedy_show.js `
  --script "早高峰挤地铁，我被压成二维码，扫出来全是救命。老板说效益不好要渡劫，我看工资条苦笑：这劫上个月就渡完了！" `
  --api-key "your-agnes-api-key" `
  --ratio 9:16
```

### 从文件读取段子

```powershell
node comedy_show.js --script-file joke.txt --api-key "your-key"
```

### 横版视频 + 字幕

```powershell
node comedy_show.js --script "段子内容" --ratio 16:9 --add-subtitles --api-key "your-key"
```

### 断点续跑

```powershell
# 中途中断后恢复
node comedy_show.js --resume --work-dir "work/20260716-143022-a1b2" --api-key "your-key"
```

### 重新生成指定场景

```powershell
# 从场景 1 开始重新生成（场景 0 保留）
node comedy_show.js --resume --work-dir "work/20260716-143022-a1b2" --regenerate 1 --api-key "your-key"
```

## 完整参数列表

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--script <text>` | 是* | - | 脱口秀段子文本（与 `--script-file` 二选一） |
| `--script-file <path>` | 是* | - | 从文件读取段子 |
| `--api-key <key>` | 是 | 环境变量 | Agnes API Key |
| `--ratio <r>` | 否 | `9:16` | 宽高比：`9:16`（竖版）/ `16:9`（横版） |
| `--voice <v>` | 否 | `zh-CN-XiaoxiaoNeural` | Edge TTS 语音（见下表） |
| `--rate <r>` | 否 | 默认 | 语速调节（如 `+20%`、`-10%`） |
| `--character-desc <text>` | 否 | 内置默认 | 角色描述（自定义舞台形象） |
| `--output <path>` | 否 | 自动 | 最终输出 MP4 路径 |
| `--add-subtitles` | 否 | false | 在画面底部烧录中文字幕 |
| `--no-lipsync` | 否 | false | 跳过 Wav2Lip 口型同步后处理（加快速度，但口型不对齐） |
| `--no-enhance` | 否 | false | 关闭图片质量增强修饰词 |
| `--resume` | 否 | false | 从 state.json 断点续跑 |
| `--regenerate <n>` | 否 | - | 从场景 n 开始重新生成 |
| `--work-dir <dir>` | 否 | 自动 | 工作目录 |

### 可用语音

| 语音 ID | Edge TTS 声音 | 风格 |
|---------|---------------|------|
| `zh-CN-XiaoxiaoNeural` | 晓晓 | 自然温暖（**默认**，吐字清晰，适合脱口秀） |
| `zh-CN-XiaoyiNeural` | 晓伊 | 活泼（语速较快） |
| `zh-CN-XiaoyanNeural` | 晓颜 | 亲切 |
| `zh-CN-XiaoruiNeural` | 晓睿 | 成熟 |
| `zh-CN-XiaomoNeural` | 晓墨 | 温柔 |

## 输出结构

```
work/
└── 20260716-143022-a1b2/
    ├── state.json              # 进度状态（支持 resume）
    ├── input_script.txt        # 原始段子备份
    ├── audio/                  # TTS 音频 per scene
    │   ├── scene_0.mp3
    │   └── scene_1.mp3
    ├── frames/                 # 首帧图片（t2i / i2i 重托管）
    │   ├── scene_0.png
    │   └── scene_0_rehosted.png
    ├── last_frames/            # 末帧截图
    │   └── scene_0_last.png
    ├── videos/                 # 无音频视频片段
    │   ├── scene_0.mp4
    │   └── scene_1.mp4
    ├── muxed/                  # 音视频混流片段（+口型同步版 +字幕版）
    │   ├── scene_0_muxed.mp4
    │   ├── scene_0_lipsynced.mp4
    │   ├── scene_0_subtitled.mp4
    │   └── ...
    ├── temp/                   # 临时文件（字体、concat list）
    └── final/                  # 最终输出
        └── comedy_show_20260716-143022-a1b2.mp4
```

## 技术架构

| 文件 | 职责 |
|------|------|
| `comedy_show.js` | 主入口 CLI，4阶段流水线编排，状态管理，断点续跑 |
| `agnes_text_gen.js` | Agnes Text API 封装（剧本优化 + 分镜拆分 + JSON 容错解析） |
| `tts_engine.js` | Edge TTS 封装（音频生成 + ffprobe 时长提取 + 8n+1 帧数计算） |
| `lipsync_engine.js` | Wav2Lip 口型同步封装（音频转 WAV + 抽取纯视频流 + Wav2Lip 推理 + 失败回退） |
| `merge_engine.js` | FFmpeg 封装（末帧提取 + 音视频混流 + concat 合并 + 字幕烧录） |
| `character_config.js` | 角色描述、宽高比、声音映射、prompt 模板配置 |

## state.json 结构

```json
{
  "sessionId": "20260716-143022-a1b2",
  "step": "videos",
  "inputScript": "原始段子文本",
  "ratio": "9:16",
  "voice": "zh-CN-XiaoxiaoNeural",
  "characterDesc": "一个性感现代化的长发飘逸美女...",
  "addSubtitles": false,
  "optimizedScript": {
    "optimized_script": "优化后完整文案",
    "scenes": [
      {
        "index": 0,
        "text": "口播文本",
        "visual_description": "画面描述",
        "video_motion": "Video motion description in English"
      }
    ]
  },
  "scenes": {
    "0": {
      "tts": { "audioPath": "...", "duration": 11.14, "numFrames": 265 },
      "frame": { "localPath": "...", "url": "https://...", "method": "t2i" },
      "video": { "videoPath": "...", "videoUrl": "https://..." },
      "lastFrame": { "localPath": "..." },
      "rehosted": { "localPath": "...", "url": "https://..." },
      "muxed": { "path": "..." },
      "lipsynced": { "path": "..." },
      "subtitled": { "path": "..." },
      "status": "lipsynced"
    }
  },
  "outputPath": "..."
}
```

## 故障排查

| 问题 | 解决方案 |
|------|----------|
| "edge-tts not found" | `pip install edge-tts`，或检查 TRAE Python Scripts 目录 |
| "ffmpeg not found" | `winget install Gyan.FFmpeg`，确保完整版 |
| "Agnes API key not found" | 设置环境变量 `agnes-api-key` 或使用 `--api-key` 参数 |
| i2i 503 "image queue is full" | 等待 30s 后重试，脚本已内置 5 次指数退避重试 |
| 视频生成超时 | 检查网络，或减少 `--num-frames`（缩短场景时长） |
| 字幕乱码 | 确认 `C:\Windows\Fonts\simhei.ttf` 存在 |
| 断点续跑找不到目录 | 用 `--work-dir` 指定之前的工作目录 |
| 场景间画面不连贯 | 确保 i2i 重托管成功（检查 `state.json` 中的 `rehosted.url`） |
| "Wav2Lip checkpoint not found" | 下载 `wav2lip_gan.pth` 到 `D:\ai_work\musics\Wav2Lip\checkpoints\` 目录 |
| torch DLL 加载失败 / "DLL load failed" | PyTorch CPU 版依赖 VC++ 运行库，安装 [Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe)；或确认 PyTorch 安装在 `D:\ai_w2l\libs` 且 `PYTHONPATH` 已注入 |
| Wav2Lip 口型同步太慢 | CPU 模式较慢（每场景约数分钟），属正常现象；可加 `--no-lipsync` 跳过，或缩小 `resizeFactor` |
| Wav2Lip 推理报 "face not detected" | 检查首帧人物面部是否清晰可见；调整 `pads` 参数扩大人脸检测边界 |
| Wav2Lip 失败但流程继续 | 脚本已内置回退机制：口型同步失败时自动使用原始混流视频，`state.json` 中 `lipsynced` 为 `null` |
| 口型同步后口型仍不对齐 | Agnes Video API 不支持音频输入，口型完全依赖 Wav2Lip 后处理；确认 TTS 音频与视频时长匹配 |

## 技术约束

1. **Agnes Video API 仅接受公开 URL**：image2video 的 `--image` 必须为 `https://` 开头的公开链接，不接受本地文件。链式传递时通过 Agnes Image i2i 将末帧重托管获取公开 URL。
2. **Agnes Video API 不支持音频输入**：视频生成阶段为无声视频，口型同步无法由 API 原生完成。因此采用 **Wav2Lip 后处理**方案——先生成无声视频，再用 FFmpeg 混流 TTS 音频，最后由 Wav2Lip 分析音频驱动人像嘴部运动，实现口型与语音对齐。可用 `--no-lipsync` 跳过此步骤。
3. **num_frames 规则**：必须满足 8n+1 且 ≤441。脚本根据 TTS 音频时长自动计算最近 8n+1 值。
4. **文件持久性**：下载的视频文件立即设只读（`chmod 0o444`），防止工作区清空。
5. **单一 API Key**：Agnes 平台覆盖文本、图片、视频三模态，全程只需 `agnes-api-key`。

## 许可证

仅供个人学习和非商业用途。请遵守 Agnes AI 平台使用条款。
