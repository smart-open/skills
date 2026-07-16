# Volc Wedding - AI 跨时空婚礼电影生成器

> 上传两张照片，穿越千年，生成属于你们的跨时空爱情电影。

## 效果预览

选择战国、唐朝、明朝、现代四个朝代，生成约 50 秒的电影质感婚礼视频：

- **片头**（4s）：黑底金字 "几生几世 跨时空相爱"
- **战国**（2.5s 标题卡 + 8s 视频）：烽火佳人 - 烽火连天下的重逢之誓
- **唐朝**（2.5s 标题卡 + 8s 视频）：大唐盛世 - 长安灯火下的千年之约
- **明朝**（2.5s 标题卡 + 8s 视频）：凤冠霞帔 - 紫禁城中的凤冠之约
- **现代**（2.5s 标题卡 + 8s 视频）：永恒誓言 - 山海之间的永恒承诺
- **片尾**（5s）：黑底白字 "今生今世 永不分离"

每个朝代的视频中，男女主角的面部特征与上传照片保持一致，服饰、发型、场景均严格还原对应时代。

## 它是如何工作的

```
用户照片 → Seedream AI 肖像 → Seedream 场景首帧 → Seedance 动态视频 → FFmpeg 合并输出
```

1. **AI 肖像生成**：将用户的照片通过 Seedream i2i 转换为对应朝代的古装肖像，保留五官特征
2. **场景首帧生成**：以男女肖像为参考，生成符合朝代背景的双人场景图
3. **动态视频生成**：以场景图为首帧，通过 Seedance 生成 8 秒电影质感动态视频
4. **合并输出**：FFmpeg 将朝代标题卡、视频片段、片头片尾拼接为完整电影

## 快速开始

### 前置条件

- Node.js 12+
- FFmpeg 4.4+（完整版）
- Volcengine Ark API Key

### 安装 FFmpeg（如尚未安装）

```powershell
winget install Gyan.FFmpeg
```

### 一键生成

```powershell
# 设置 API Key
$env:ARK_API_KEY = "your-ark-api-key"

# 进入脚本目录
cd .trae/skills/volc-wedding/scripts

# 运行（选择4个朝代，带片头片尾）
node volc_wedding.js `
  --male-photo "C:\Photos\groom.jpg" `
  --female-photo "C:\Photos\bride.jpg" `
  --dynasties "warring,tang,ming,modern" `
  --add-title --add-ending
```

生成完成后，视频输出在 `work/<session>/final/` 目录下。

## 可选参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--custom-desc` | 融入个人故事 | `"我们在西湖相识"` |
| `--mode` | 视频模式（默认 first-frame） | `multimodal` |
| `--duration` | 每段时长（默认 8s） | `10` |
| `--ratio` | 宽高比（默认 16:9） | `9:16`（竖屏） |
| `--resolution` | 分辨率（默认 720p） | `1080p` |
| `--resume` | 断点续跑 | - |
| `--regenerate` | 重生成指定朝代 | `tang` |

## 13 个朝代可选

夏、西周、战国、汉、晋、南北朝、唐、宋、元、明、清、民国、现代

其中 **战国、唐、明、现代** 已配置完整的电影级时间分段分镜剧本（0-2s / 2-5s / 5-8s），画面感更强。

## 文件结构

```
volc-wedding/
├── SKILL.md              # Skill 定义文档
├── README.md             # 本文件
└── scripts/
    ├── volc_wedding.js   # 主入口（CLI + 状态机）
    ├── ark_client.js     # Ark API 通信层
    ├── dynasties.js       # 13 朝代 prompt 配置
    ├── image_pipeline.js  # 图片生成流水线
    ├── video_pipeline.js  # 视频生成流水线
    └── merge_engine.js   # FFmpeg 合并引擎
```

纯 Node.js 实现，零外部依赖，所有代码约 2,070 行。

## 断点续跑

生成过程中断后，使用 `--resume` 从上次进度继续：

```powershell
node volc_wedding.js `
  --male-photo "C:\Photos\groom.jpg" `
  --female-photo "C:\Photos\bride.jpg" `
  --dynasties "warring,tang,ming,modern" `
  --work-dir "work\20260716-143022-a1b2" `
  --resume
```

对某个朝代不满意？单独重生成：

```powershell
node volc_wedding.js `
  --dynasties "warring,tang,ming,modern" `
  --work-dir "work\20260716-143022-a1b2" `
  --regenerate "tang"
```

## 技术栈

- **Seedream 5.0 Pro**（doubao-seedream-5-0-pro-260628）：i2i 图片生成
- **Seedance 2.0** 视频生成（3 个版本可选）：

| 版本 | 模型 ID | 特点 |
|------|---------|------|
| 标准版（默认） | `doubao-seedance-2-0-260128` | 画质最佳，适合正式输出 |
| Mini 快速版 | `doubao-seedance-2-0-mini-260615` | 速度更快，适合预览 |
| Fast 极速版 | `doubao-seedance-2-0-fast-260128` | 最快验证，牺牲部分画质 |

```powershell
# 使用 Mini 快速版预览
node volc_wedding.js --dynasties "tang,ming" --video-model doubao-seedance-2-0-mini-260615 ...

# 使用 Fast 极速版
node volc_wedding.js --dynasties "tang,ming" --video-model doubao-seedance-2-0-fast-260128 ...
```

> Mini/Fast 模型不支持 `resolution` 参数，代码会自动处理。

- **FFmpeg 8.1.1**：concat demuxer 合并 + drawtext 中文字幕
- **Node.js**：零依赖纯内置模块实现

## 许可证

仅供个人学习和非商业用途。请遵守 Volcengine Ark 平台使用条款。
