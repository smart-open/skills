# Agnes API 手册（短剧流水线专用）

本文件是流水线脚本调用 Agnes API 的唯一事实依据，内容摘自官方文档（2026-09 抓取）。
所有请求走服务端，密钥从环境变量 `AGNES_API_KEY` 读取，禁止写入前端、日志或仓库。

- Base URL：`https://api.agnes-ai.cn/v1`
- 认证头：`Authorization: Bearer $AGNES_API_KEY`
- 内容类型：`Content-Type: application/json`
- 中国站模型清单：
  - 文本/编剧：`agnes-3.0-flash`
  - 图像/关键帧：`agnes-image-2.5-flash`
  - 视频/镜头：`agnes-video-2.5-flash`

---

## 1. 文本模型 agnes-3.0-flash

- 端点：`POST /v1/chat/completions`（OpenAI 兼容，流水线默认使用）
- 能力：文本 + 图像 URL 输入，文本输出；上下文 512K，最大输出 65,536 token
- 用途：故事完善、剧本、分镜表、关键帧提示词、质检与改写

### 请求字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| model | string | 是 | `agnes-3.0-flash` |
| messages | array | 是 | system/user/assistant 消息 |
| messages[].content | string / array | 是 | 纯文本，或 text + image_url 内容块 |
| temperature | number | 否 | 随机性，剧本建议 0.8-1.0，结构化解析建议 0.2-0.4 |
| top_p | number | 否 | 核采样 |
| max_tokens | integer | 否 | 输出上限 |
| stream | boolean | 否 | 流水线用 false |
| chat_template_kwargs | object | 否 | `{"enable_thinking": true}` 开启 Thinking（复杂结构拆解时用） |

图像输入块格式：

```json
{"role": "user", "content": [
  {"type": "text", "text": "检查这张关键帧与角色设定是否一致"},
  {"type": "image_url", "image_url": {"url": "https://example.com/kf01.png"}}
]}
```

### 响应

从 `choices[0].message.content` 取文本；`usage` 含 token 计数。
要求模型输出 JSON 时，在 system 中明确“只输出 JSON、不要代码块”，客户端仍要做容错解析（剥离 ```json 围栏、截取首个 `{` 到末个 `}`）。

### 价格（现价）

输入缓存命中 ¥0.035、输入 ¥0.35、输出 ¥1.00 / 百万 token，**当前三项均 ¥0**。

---

## 2. 图像模型 agnes-image-2.5-flash

- 端点：`POST /v1/images/generations`
- 能力：文生图、图生图、多图合成（角色定妆照、关键帧一致性靠它）
- 结果：URL 或 Base64；取 `data[0].url` / `data[0].b64_json`

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| model | string | 是 | `agnes-image-2.5-flash` |
| prompt | string | 是 | 画面指令 |
| size | string | 是 | 档位 `1K`/`2K`/`3K`/`4K`（推荐），也兼容 `1024x768` 类旧写法 |
| ratio | string | 否 | `1:1` `3:4` `4:3` `16:9` `9:16` `2:3` `3:2` `21:9`，默认 1:1 |
| extra_body.response_format | string | 否 | `url`（默认推荐）或 `b64_json` |
| extra_body.image | string[] | 图生图/多图必填 | 参考图 URL 或 Data URI 数组 |
| return_base64 | boolean | 否 | 仅文生图需要 base64 时用 |

注意（官方“重要说明”）：

1. **不要**在顶层放 `response_format`，URL/Base64 选择一律走 `extra_body.response_format`。
2. 图生图、多图合成的参考图放 **`extra_body.image`**（不要传 `tags: ["img2img"]`）。
   客户端保留兜底：若服务端对 `extra_body.image` 返回 400，再用顶层 `image` 重试一次。
3. 不支持的精确像素尺寸会被标准化映射；要 16:9 素材就用 `size:"2K", ratio:"16:9"`。

### 流水线使用的尺寸（与视频画幅对齐）

| ratio | 1K | 2K（关键帧默认） |
|---|---|---|
| 16:9（横屏短剧） | 1312x736 | 2624x1472 |
| 9:16（竖屏短剧，默认） | 736x1312 | 1472x2624 |
| 1:1 | 1024x1024 | 2048x2048 |

关键帧统一用 **2K**：与视频同为 16:9 / 9:16，比例一致，仅做缩放不拉伸。

### 多图合成用法（角色一致性核心）

把“角色定妆照 + 场景参考 + 上一关键帧”一起放进 `extra_body.image`（建议 ≤5 张，
与视频 reference 上限对齐，避免触发计费/限制），prompt 中说明每张图的用途，例如：

```json
{
  "model": "agnes-image-2.5-flash",
  "prompt": "以<Picture 1>为角色外貌唯一基准（同一张脸、同一发型、同一件外套），延续<Picture 2>的构图与光线，生成：深夜便利店内，男主攥着一张彩票愣住，中景，冷白荧光灯，电影感",
  "size": "2K", "ratio": "9:16",
  "extra_body": {"response_format": "url", "image": [
    "https://.../char_male_hero.png",
    "https://.../kf07.png"
  ]}
}
```

### 价格（现价）

1K ¥0.07/张、2K ¥0.12/张、3K ¥0.14/张、4K ¥0.16/张；前 3 张输入参考图免费，第 4 张起 ¥0.02/张。
**当前全部 ¥0**。

---

## 3. 视频模型 agnes-video-2.5-flash

异步任务：先创建，后轮询。

- 创建：`POST /v1/videos`
- 轮询：`GET https://api.agnes-ai.cn/agnesapi?video_id=<ID>&model_name=agnes-video-2.5-flash`
  （必须带 model_name；不带 model_name 的纯 video_id 查询只对 text 模式有效）
- 鉴权：轮询同样带 `Authorization: Bearer`

### 公共参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| model | string | 是 | `agnes-video-2.5-flash` |
| prompt | string | 是 | 视频内容描述；reference 模式可用 `<Picture N>` `<Audio N>` 指代素材 |
| mode | string | 是 | `text` / `keyframe` / `reference` |
| seconds | string | 否 | `"4"`–`"12"`，默认 `"5"`；**字符串**。分镜统一用 `"10"` |
| size | string | 否 | Flash **固定 `"720P"`**，其他值 HTTP 400 |
| aspect_ratio | string | 否 | 见下表，默认 16:9 |
| seed | integer | 否 | 同种子提高可复现性 |
| n | integer | 否 | 仅支持 1 |

### 模式规则（流水线主用 keyframe）

| mode | 用途 | 必需媒体 | 禁止字段 |
|---|---|---|---|
| text | 纯文生视频 | 无 | first_frame/last_frame/images/audios/videos |
| **keyframe** | **首帧/尾帧/首尾帧锁定，分镜流水线主模式** | first_frame、last_frame 至少一个 | images、audios、videos |
| reference | 图/音频参考生成 | images 或 audios 至少一类非空 | first_frame、last_frame、videos |

- keyframe 模式专属：`first_frame`（string，图片 URL）、`last_frame`（string，图片 URL）。
  只给首帧 = 约束起点；首尾同给 = 锁定起止构图，模型补间运动。
- reference 模式 Flash 限制：`images` 最多 5 张、`audios` 最多 3 段；**不支持 videos**（传有效内容 400）。
- 所有媒体 URL 必须公网可访问，且在任务完成前保持有效；图像接口返回的
  `storage.googleapis.com/...` URL 满足要求，关键帧生成后不要立即清理。

### Flash 画幅像素（size 恒为 720P）

| aspect_ratio | 输出像素 | 用途 |
|---|---|---|
| 21:9 | 1680x720 | 超宽银幕 |
| 16:9 | 1280x704 | 横屏（默认） |
| 4:3 | 960x720 | 传统画幅 |
| 1:1 | 720x720 | 方形 |
| 3:4 | 720x960 | 竖版人物 |
| 9:16 | 720x1280 | **竖屏短视频默认** |

### 任务状态机

创建响应：

```json
{"id":"task_xxx","task_id":"task_xxx","video_id":"video_xxx","object":"video",
 "model":"agnes-video-2.5-flash","status":"queued","progress":0,"created_at":1786900000,
 "seconds":"10","size":"720P"}
```

轮询完成响应：

```json
{"video_id":"video_xxx","status":"completed","progress":100,
 "completed_at":1786900120,"metadata":{"url":"https://.../xxx.mp4"}}
```

- status：`queued` → `in_progress` → `completed` / `failed`
- 仅 `completed` 时 `metadata.url` 才可交付；失败读 `error.message`
- 轮询间隔 1–2 秒；**必须设最大轮询时长**（脚本默认 20 分钟/任务）；
  HTTP 429 与网络错误指数退避（1s→2s→4s…封顶 30s）

### Flash 专属 400 错误（按 size→images→audios→videos 顺序只返回首个）

- `size must be 720P`
- `images length must not exceed 5`
- `audios length must not exceed 3`
- `videos is not supported`

其他：401/403 密钥问题、404 video_id 不存在、429 限流、500 服务端错误（稍后重试）。

### 提示词顺序（官方建议，直接作为分镜 prompt 拼装顺序）

1. 主体与场景（人物、物体、环境、时间）
2. 动作与变化（主体如何运动、场景如何变化）
3. 镜头语言（推/拉/摇/移/跟/固定、景别）
4. 视觉风格（光线、色彩、材质、写实度、氛围）
5. 声音与节奏（环境声、动作声；人声/对白由后期配音保证，不要依赖模型念台词）
6. 一致性要求（保持角色外貌、服装、构图不变）

### 价格（现价）

720P 刊例 ¥0.15/秒，**当前限时 ¥0/秒**。恢复收费后按输出秒数计费。

---

## 4. 流水线选型结论

| 环节 | 模型 | 模式/参数要点 |
|---|---|---|
| 故事→剧本→分镜表→帧提示词 | agnes-3.0-flash | chat completions，低温输出 JSON |
| 角色定妆照 | agnes-image-2.5-flash | 文生图 2K，固定 seed 描述锚点 |
| 分镜边界关键帧 K0..KN | agnes-image-2.5-flash | 多图合成（定妆照 + 上一帧），2K 同画幅 |
| 每个 10s 镜头 | agnes-video-2.5-flash | mode=keyframe，first_frame=Ki，last_frame=Ki+1 |
| 人声/对白 | 运行环境配音能力 | 每角色固定音色，后期合成，不依赖视频模型 |
| 成片 | 本地 ffmpeg | 拼接 + 字幕 + 混音 |
