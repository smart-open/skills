---
name: "agnes-video-gen-2"
description: "Generates cinematic videos via Agnes Video V2.0 API. Invoke when user asks to generate/create/animate a video from text or images, or transform images into video."
---

# Agnes Video Generation 2 (agnes-video-gen-2)

通过 **Agnes Video V2.0** 官方 API 生成电影级视频。支持 **文生视频、图生视频、多图视频、关键帧动画** 四种工作流，自动创建任务、轮询结果并下载 MP4。

## 何时调用本 Skill

当用户出现以下意图时调用：
- 要求"生成 / 创建 / 做一个视频"（文生视频）
- 要求"让这张图片动起来 / 把图片变成视频"（图生视频）
- 要求"用多张图生成视频 / 图间过渡动画"（多图视频 / 关键帧）
- 明确提到 Agnes / agnes-video 模型
- 需要电影质感、高质量 AI 视频生成

## 运行环境与依赖

- 仅依赖 **Node.js 内置模块**（`https`、`fs`、`path` 等），**无需 npm 安装任何包**，要求 Node.js 12+。
- 辅助脚本路径：`<skill-dir>/scripts/agnes_video_gen.js`

## API 密钥获取（关键）

API key 按以下优先级解析（脚本自动处理）：

1. **命令行参数** `--api-key`（最高优先级）
2. **环境变量** `agnes-api-key`
3. **环境变量** `AGNES_API_KEY`

> 调用约定：如果用户在**提示词上下文中直接给出了 API key**（例如消息里写了 `sk-xxxx`），务必通过 `--api-key` 参数传给脚本，**不要**把它写进环境变量后再调用，以免泄露。若上下文中没有 key，则依赖环境变量 `agnes-api-key`，脚本会自动读取。

## 工作流总览

| 工作流 | `--workflow` 值 | 说明 | 是否需要图片 |
|---|---|---|---|
| 文生视频 | `text2video` | 纯文本描述生成视频（默认） | 否 |
| 图生视频 | `image2video` | 为单张图片添加动画 | 是（1 张） |
| 多图视频 | `multi2video` | 多张参考图引导生成 | 是（≥2 张） |
| 关键帧动画 | `keyframes` | 在关键帧之间生成流畅过渡 | 是（≥2 张） |

## 默认优化参数（开箱即用）

脚本已内置文档推荐的优化默认值，未指定参数时自动采用：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `width` × `height` | `1152×768`（16:9，720p） | 标准视频生成尺寸，API 会自动标准化到最近档位 |
| `num_frames` | `121` | 遵循 8n+1 规则 |
| `frame_rate` | `24` | 约 5 秒时长，运动流畅 |
| 画质增强 | 自动开启 | 追加电影质感修饰词（keyframes 模式除外，避免与过渡指令冲突） |

> 即不传任何尺寸/帧数参数，即可生成一段约 5 秒、720p、24fps、电影质感的视频。

## 文生视频（text2video）

```bash
node "<skill-dir>/scripts/agnes_video_gen.js" \
  --workflow text2video \
  --prompt "一只猫在日落时的海滩上漫步，柔和的海浪，温暖的金色光线，逼真的运动" \
  --output "C:\Users\tianw\Desktop\test\cat_beach.mp4" \
  --api-key "sk-xxxx"
```

## 图生视频（image2video）

```bash
node "<skill-dir>/scripts/agnes_video_gen.js" \
  --workflow image2video \
  --prompt "女子缓缓转身回望镜头，自然的表情，电影感运镜" \
  --image "https://example.com/woman.png" \
  --output "C:\Users\tianw\Desktop\test\woman_turn.mp4" \
  --api-key "sk-xxxx"
```

## 多图视频（multi2video）

```bash
node "<skill-dir>/scripts/agnes_video_gen.js" \
  --workflow multi2video \
  --prompt "在两张参考图之间创建平滑的变换场景，电影级光照，保持人物身份一致，自然运动" \
  --image "https://example.com/img1.png" "https://example.com/img2.png" \
  --output "C:\Users\tianw\Desktop\test\transform.mp4" \
  --api-key "sk-xxxx"
```

## 关键帧动画（keyframes）

```bash
node "<skill-dir>/scripts/agnes_video_gen.js" \
  --workflow keyframes \
  --prompt "在关键帧之间生成流畅的电影级过渡，保持视觉一致性，自然的镜头运动" \
  --image "https://example.com/keyframe1.png" "https://example.com/keyframe2.png" \
  --output "C:\Users\tianw\Desktop\test\keyframe_transition.mp4" \
  --api-key "sk-xxxx"
```

## 视频时长与帧数控制

公式：`seconds = num_frames / frame_rate`

- `num_frames` 必须 ≤ **441**，且遵循 **8n + 1** 规则（如 1, 9, 17, ..., 121, 241, 441）。
- `frame_rate` 支持 1–60。

常用时长（脚本默认即"约 5 秒"那一行）：

| 目标时长 | num_frames | frame_rate |
|---|---|---|
| 约 3 秒 | `81` | `24` |
| 约 5 秒（默认） | `121` | `24` |
| 约 10 秒 | `241` | `24` |
| 约 18 秒（最长） | `441` | `24` |

示例：生成约 10 秒横版视频
```bash
node "<skill-dir>/scripts/agnes_video_gen.js" --workflow text2video \
  --prompt "城市夜景延时摄影，霓虹灯光流转" \
  --num-frames 241 --frame-rate 24 --output "city_night.mp4" --api-key "sk-xxxx"
```

## 推荐尺寸（标准档位）

API 会自动将尺寸标准化到最近档位：**480p / 720p / 1080p**。按宽高比选择：

| 宽高比 | 推荐尺寸（width×height） | 适用场景 |
|---|---|---|
| 16:9 | `1152×768`（默认） | 横版视频、产品演示、YouTube |
| 9:16 | `720×1280` 或 `1080×1920` | 竖版短视频、TikTok / Reels / Shorts |
| 1:1 | `1024×1024` 或 `720×720` | 方形视频、社交流 |
| 4:3 | `1024×768` | 传统横版、通用演示 |
| 3:4 | `768×1024` | 竖版演示、肖像/产品为主 |

示例：生成竖版短视频（约 3 秒）
```bash
node "<skill-dir>/scripts/agnes_video_gen.js" --workflow text2video \
  --prompt "美食特写，蒸汽升腾，慢动作" \
  --width 720 --height 1280 --num-frames 81 --frame-rate 24 \
  --output "food_vertical.mp4" --api-key "sk-xxxx"
```

## 提示词最佳实践

脚本已自动补充电影质感修饰词（文生/图生/多图模式），主体描述仍需清晰。建议结构：

```
[主体] + [动作/运动] + [场景/环境] + [风格] + [光照] + [镜头运动]
```

- 文生视频：`一只猫在日落海滩漫步，柔和海浪，温暖金色光线，逼真运动，电影级`
- 图生视频：清楚描述图片中主体应有的动作（如"缓缓转身""微微一笑""风吹动头发"）
- 关键帧：说明过渡方式 + 需保持一致的内容

用 `--negative-prompt` 排除不想要的内容，用 `--seed` 固定可复现结果。

## 执行流程（推荐两步式，确保文件持久）

> **重要**：视频生成是长时间任务，需用长进程执行。但长进程退出后其写入的文件可能被环境清空（变为 0 字节）。因此采用**两步式**：长进程只获取视频 URL，短命令负责下载文件——短命令写入的文件持久可靠。

### 第 1 步：创建任务 + 轮询获取 VIDEO_URL（长进程，`--url-only`）

```bash
node "<skill-dir>/scripts/agnes_video_gen.js" \
  --url-only \
  --workflow text2video \
  --prompt "你的视频描述" \
  --num-frames 241 --frame-rate 24 \
  --api-key "sk-xxxx"
```

脚本完成后输出 `VIDEO_URL=https://...mp4`。从输出中解析该 URL。

### 第 2 步：下载视频文件（短命令，确保持久）

从第 1 步输出的 `VIDEO_URL` 下载到本地（任选其一）。**下载后必须立即设置只读属性**，否则工作区会自动将文件清空为 0 字节。

**PowerShell 方式（Windows 推荐）**：
```powershell
Invoke-WebRequest -Uri "VIDEO_URL" -OutFile "C:\Users\tianw\Desktop\test\out.mp4" -UseBasicParsing
(Get-Item "C:\Users\tianw\Desktop\test\out.mp4").IsReadOnly = $true
```

**Node.js 方式（跨平台）**：
```bash
node -e "const https=require('https');const fs=require('fs');const u='VIDEO_URL';const o='out.mp4';const f=(url,p,r)=>{r=r||0;return new Promise((res,rej)=>{if(r>5)return rej(new Error('redirects'));const c=url.startsWith('https')?https:http;c.get(url,{headers:{'User-Agent':'Mozilla/5.0','Connection':'close'},timeout:300000},s=>{if(s.statusCode>=300&&s.statusCode<400&&s.headers.location){s.resume();return res(f(new URL(s.headers.location,url).href,p,r+1));}if(s.statusCode!==200){s.resume();return rej(new Error('HTTP '+s.statusCode));}const ch=[];let n=0;s.on('data',d=>{ch.push(d);n+=d.length;});s.on('end',()=>{const b=Buffer.concat(ch,n);fs.writeFileSync(p,b);try{fs.chmodSync(p,0o444)}catch(e){}console.log('OK '+n+' bytes');res();});s.on('error',rej);}).on('error',rej).on('timeout',function(){this.destroy(new Error('timeout'));});});};f(u,o).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});"
```

> **关键**：只读属性（PowerShell `IsReadOnly=$true` / Node.js `chmod 0o444`）是防止工作区清空文件的唯一可靠手段。已验证：设只读后文件持久保持，不设只读则数分钟内被清空为 0 字节。

任务状态：`queued`（排队）→ `in_progress`（生成中）→ `completed`（成功）/ `failed`（失败）。

## 执行后必做

1. 从第 1 步输出解析 `VIDEO_URL=...`。
2. 用第 2 步短命令下载到 `c:\Users\tianw\Desktop\test\` 下。
3. 下载后立即验证文件大小非 0：`Get-Item <文件> | Select Length`。
4. 向用户提供 `computer://` 链接，例如：`[查看视频](computer://C:\Users\tianw\Desktop\test\out.mp4)`
5. 如效果不符，优化提示词 / 调整帧数与尺寸后重试。
6. **注意**：视频生成耗时较长（几十秒到数分钟），第 1 步默认最长等待 20 分钟（`--max-wait 1200`）。请用长进程执行第 1 步，短命令执行第 2 步。

## 注意事项

1. **图片输入仅支持公开 URL**：图生/多图/关键帧的 `--image` 必须是 `https://` 开头的公开可访问链接。本地文件需先上传（可用 `agnes-image-gen-2` skill 生成后取 URL，或任意图床）。脚本检测到非 URL 会直接报错提示。
2. **帧数规则**：`num_frames` 必须满足 8n+1 且 ≤441，脚本会校验并提示最近合法值。
3. **尺寸标准化**：API 会把请求尺寸映射到 480p/720p/1080p 最近档位，最终输出以响应 `size` 为准。
4. **模型名称**：固定 `agnes-video-v2.0`。
5. **结果获取**：新接入一律用 `video_id`（GET `/agnesapi?video_id=`），不用旧版 task_id 接口。
6. **超时与重试**：视频创建接口响应可能较慢（模型加载排队），脚本已将创建任务超时设为 **10 分钟**，并自动重试 5 次（递增等待）；偶发 503/超时属正常。
7. **文件持久性（关键）**：工作区会自动将非只读的视频文件清空为 0 字节。**务必使用 `--url-only` 两步式流程**：第 1 步长进程只获取 VIDEO_URL（不写文件），第 2 步用短命令下载并**立即设置只读属性**（PowerShell `IsReadOnly=$true` / Node.js `chmod 0o444`）。已验证只读文件持久保持，非只读文件数分钟内被清空。

## 参数速查

| 参数 | 说明 | 必填 | 默认 |
|---|---|---|---|
| `--prompt` / `-p` | 文本描述 | 是 | — |
| `--workflow` / `-w` | `text2video`/`image2video`/`multi2video`/`keyframes` | 否 | `text2video` |
| `--image` / `-i` | 图片 URL（可多个） | 图生/多图/关键帧必填 | — |
| `--width` | 视频宽度 | 否 | `1152` |
| `--height` | 视频高度 | 否 | `768` |
| `--num-frames` / `-n` | 帧数（8n+1，≤441） | 否 | `121` |
| `--frame-rate` | 帧率 1–60 | 否 | `24` |
| `--steps` | 推理步数 | 否 | 模型默认 |
| `--seed` | 随机种子（可复现） | 否 | 随机 |
| `--negative-prompt` | 反向提示词 | 否 | — |
| `--output` / `-o` | 输出文件路径 | 否 | `agnes_<workflow>_<时间戳>.mp4` |
| `--api-key` | API key（覆盖环境变量） | 视情况 | — |
| `--no-enhance` | 关闭自动电影质感增强 | 否 | 开启 |
| `--url-only` | 只创建任务+轮询，输出 VIDEO_URL，不下载（推荐） | 否 | 关闭 |
| `--poll-interval` | 轮询间隔（秒） | 否 | `10` |
| `--max-wait` | 最长等待（秒） | 否 | `1200` |
