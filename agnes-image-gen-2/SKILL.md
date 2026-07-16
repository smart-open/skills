---
name: "agnes-image-gen-2"
description: "Generates cinematic high-definition images via Agnes Image 2.1 Flash API. Invoke when user asks to generate (text-to-image) or transform/edit (image-to-image) AI images with cinematic, HD quality."
---

# Agnes Image Generation 2 (agnes-image-gen-2)

通过 **Agnes Image 2.1 Flash** 官方 API 生成电影级、高清、精美的图片。支持 **文生图（text-to-image）** 与 **图生图（image-to-image）** 两种工作流。

## 何时调用本 Skill

当用户出现以下意图时调用：
- 要求"生成 / 画 / 创建一张图片"（文生图）
- 要求"修改 / 转换 / 编辑某张现有图片"（图生图）
- 明确提到 Agnes / agnes-image 模型
- 需要电影质感、高清、精美画质的 AI 出图

## 运行环境与依赖

- 仅依赖 **Node.js 内置模块**（`https`、`fs`、`path` 等），**无需 npm 安装任何包**，要求 Node.js 12+。
- 辅助脚本路径：`<skill-dir>/scripts/agnes_image_gen.js`

## API 密钥获取（关键）

API key 按以下优先级解析（脚本自动处理）：

1. **命令行参数** `--api-key`（最高优先级）
2. **环境变量** `agnes-api-key`
3. **环境变量** `AGNES_API_KEY`

> 调用约定：如果用户在**提示词上下文中直接给出了 API key**（例如消息里写了 `sk-xxxx`），务必通过 `--api-key` 参数传给脚本，**不要**把它写进环境变量后再调用，以免泄露。若上下文中没有 key，则依赖环境变量 `agnes-api-key`，脚本会自动读取。

## 文生图（text-to-image）

```bash
node "<skill-dir>/scripts/agnes_image_gen.js" \
  --mode t2i \
  --prompt "一位古典西汉美女，曲裾深衣，堕马髻，朱红宫殿背景" \
  --size 768x1024 \
  --output "C:\Users\tianw\Desktop\test\out.png" \
  --api-key "sk-xxxx"
```

- `--prompt` 必填：图像描述。
- `--size` 默认 `1024x1024`。
- `--output`：保存路径（建议保存到用户工作区 `c:\Users\tianw\Desktop\test`）。
- 脚本会**自动追加电影质感 / 高清画质修饰词**（cinematic lighting、8K、HDR 等），无需手动写。

## 图生图（image-to-image）

```bash
node "<skill-dir>/scripts/agnes_image_gen.js" \
  --mode i2i \
  --prompt "将场景转换为雨夜赛博朋克霓虹，保留原始构图" \
  --image "C:\Users\tianw\Desktop\test\input.png" \
  --size 1024x768 \
  --output "C:\Users\tianw\Desktop\test\out_i2i.png" \
  --api-key "sk-xxxx"
```

- `--image` 必填：可传**本地路径**、**公开 URL** 或 `data:` URI，可多个。
- 本地图片会被自动转为 base64 data URI 上传。
- 图生图使用**不破坏构图**的画质修饰词（ultra-detailed、sharp focus、8K），避免与"保留原始构图"冲突。
- 提示词中应**同时说明**：要改变什么 + 要保留什么。

## 输出格式

- `--format url`（默认）：API 返回图片 URL，脚本自动下载保存为本地文件。
- `--format b64_json`：API 直接返回 base64，脚本解码保存。适合 URL 不可直连下载时使用。

## 推荐尺寸（标准尺寸）

"标准尺寸"需根据**发布平台**或**用途**选择。最通用的默认推荐是 `1024x1024`（方形）或 `1080x1920`（竖版）。

脚本默认 `1024x1024`；若用户未指定尺寸，海报/封面类需求优先建议竖版 `1080x1920`。

常见场景推荐尺寸（像素）：

| 用途 | 尺寸 | 比例 | 适用场景 |
|---|---|---|---|
| 社交媒体竖版 / 手机海报 | `1080x1920` | 9:16 | 抖音、朋友圈、小红书封面等主流移动端展示 |
| 社交媒体方形海报 | `1080x1080` 或 `1024x1024` | 1:1 | Instagram、朋友圈九宫格、通用网络传播 |
| 电商 / 活动横版海报 | `1920x600` 或 `1024x576` | 16:9 | 网站 Banner、视频封面、PPT 背景 |

印刷类海报说明：
- 建议按物理尺寸换算，如 A3（297×420mm）或 A2（420×594mm），且分辨率需设为 **300 DPI**。
- **注意**：AI 生图通常为 72–150 DPI，印刷前需专业放大处理。如需印刷用途，生成后请用专业工具（如 Photoshop、Topaz Gigapixel）放大至目标 DPI，并补充文字层。

> 尺寸兼容提示：`size` 为 API 必填项。上述尺寸均为常见支持规格；若请求某尺寸返回错误，请改用最接近的支持尺寸（如 `1080x1080`→`1024x1024`）。

## 提示词结构最佳实践

为获得**精美、高清、电影质感**的效果，建议按以下结构组织提示词（脚本已自动补充画质词，主体描述仍需清晰）：

```
[主体] + [场景/环境] + [风格] + [光照] + [构图] + [细节级别]
```

示例：
- 文生图：`日出时分薄雾峡谷上方的发光浮空城市，电影级写实风格，广角构图，丰富的建筑细节，柔和金色光线`
- 图生图：`将白天街道改为赛博朋克雨夜，添加霓虹招牌与湿滑路面倒影，保留原始街道布局与相机角度`

## 注意事项（官方文档坑点）

1. **`response_format` 不能放在请求体顶层**，必须放在 `extra_body` 内（脚本已正确处理）。
2. 文生图需要 URL 输出用 `extra_body.response_format="url"`；需要 base64 输出用顶层 `return_base64=true`（脚本已处理）。
3. 图生图的 `image` 数组放在 `extra_body` 内，**不要**传 `tags:["img2img"]`（脚本已处理）。
4. 图生图输入图片 URL 必须为**公开可访问**的 HTTPS 链接；不可访问时改用本地文件（脚本会转 base64）。
5. 请求可能耗时几秒到几十秒，脚本已设置 360 秒超时。
6. 模型名称固定为 `agnes-image-2.1-flash`（注意是 `2.1`，不是 `21`）。

## 执行后必做

1. 脚本成功后会打印 `OUT_PATH=<绝对路径>`，从输出中解析该路径。
2. 用 `Read` 工具读取生成的图片，确认画质与内容符合用户预期。
3. 向用户提供 `computer://` 链接以便查看，例如：
   `[查看图片](computer://C:\Users\tianw\Desktop\test\out.png)`
4. 如效果不符，优化提示词后重试；图生图可多次迭代。

## 参数速查

| 参数 | 说明 | 必填 |
|---|---|---|
| `--prompt` / `-p` | 文本指令 | 是 |
| `--mode` / `-m` | `t2i`（默认）或 `i2i` | 否 |
| `--size` / `-s` | 输出尺寸，默认 `1024x1024` | 否 |
| `--image` / `-i` | 图生图输入（路径/URL/data URI，可多个） | 图生图必填 |
| `--output` / `-o` | 输出文件路径 | 否 |
| `--format` / `-f` | `url`（默认）或 `b64_json` | 否 |
| `--api-key` | API key（覆盖环境变量） | 视情况 |
| `--no-enhance` | 关闭自动电影质感增强 | 否 |
