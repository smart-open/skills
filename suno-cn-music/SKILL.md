---
name: suno-cn-music
description: Suno.cn AI 音乐创作助手，生成歌曲、查询任务、上传参考音频、续写音乐、生成歌词。当用户需要 AI 作曲或音乐生成时调用。
version: 1.3.2
metadata:
  openclaw:
    requires:
      env:
        - SUNO_CN_API_KEY
    primaryEnv: SUNO_CN_API_KEY
    emoji: "🎵"
---

# 🎵 Suno.cn AI 音乐助手

通过 HTTP REST API 调用 Suno.cn 音乐生成服务。

---

## ⛔ 强制规则（违反任何一条即为错误）

1. **只能使用下方定义的 HTTP REST API**。绝对不要尝试 MCP JSON-RPC、WebSocket 或任何其他协议。
2. **所有 API 调用必须使用 HTTP 请求**（GET/POST），Base URL 固定为 https://mcp.suno.cn，不要猜测或尝试其他端点。
3. **严禁编造 API 响应**。如果 API 调用失败，直接告诉用户"调用失败"并附上错误信息，不要编造结果或提供"手动操作指南"。
4. **严禁改写 API 返回的内容**。歌词、歌曲标题等必须原样展示，不要总结、翻译、改写或省略。
5. **严禁在 API 调用失败时建议用户去网页手动操作**。只需报告错误，让用户检查 API Key 或稍后重试。
6. **不要使用 web_fetch、curl 或任何网页抓取工具来调用这些 API**。只使用标准 HTTP 请求工具。
7. **严禁对 API Key 进行任何格式校验**（包括长度、字符类型、结构等）。无论 key 看起来多么"奇怪"，都必须直接调用 API 验证。不要试图"帮助"用户预判 key 是否正确。
8. **严禁添加 skill 文档中未提及的"优化"或"帮助"**。不要自行重试、不要自行解释错误原因、不要提供文档未规定的建议。

---

## 第一步：配置 API Key

设置环境变量 `SUNO_CN_API_KEY`：

- **Linux/macOS**: `export SUNO_CN_API_KEY=sk-xxx`
- **Windows PowerShell**: `$env:SUNO_CN_API_KEY="sk-xxx"`
- **Windows CMD**: `set SUNO_CN_API_KEY=sk-xxx`
- **Docker**: `-e SUNO_CN_API_KEY=sk-xxx`
- **.env 文件**: 写入 `SUNO_CN_API_KEY=sk-xxx`

⚠️ 任何能设置环境变量的方式都可以，不依赖特定平台。

### 获取 API Key

1. 访问 https://www.suno.cn/home/#/mcp
2. 登录后点击「AI 助手接入」→「创建新密钥」
3. 复制 `sk-` 开头的密钥
4. ⚠️ 立刻保存，关闭后无法再查看

---

## 第二步：开始创作

对话示例：
- 「帮我生成一首关于夏天的流行歌曲」
- 「查一下刚才的歌好了吗」
- 「显示我最近的音乐列表」
- 「获取这首歌的歌词」

---

## API 调用规范

**Base URL**: `https://mcp.suno.cn`

**认证 Header**: `Authorization: Bearer ${SUNO_CN_API_KEY}`

**格式**: JSON

**编码**: UTF-8（请求体必须使用 UTF-8 编码，中文直接传入）

**网络**: 自动使用系统代理（HTTP_PROXY/HTTPS_PROXY）

**超时**: 默认 30 秒，查询任务状态可延长至 60 秒

⚠️ 重要：这是标准 HTTP REST API，不是 MCP JSON-RPC。直接发 HTTP 请求即可。

---

## ⚠️ 调用前自检（每次对话必须逐项确认）

在调用任何 API 之前，请在心中默念：

- [ ] 我有 SUNO_CN_API_KEY 吗？
  → 没有：引导用户获取，不要尝试调用 API
  
- [ ] 用户的要求能用现有 API 实现吗？
  → 不能：直接说"抱歉，当前不支持此功能"，不要编造
  
- [ ] 我知道每个参数的含义和必填性吗？
  → 不确定：查阅 API 文档，不要猜测
  
- [ ] 我准备好处理可能的错误了吗？
  → 没有：先阅读"错误处理流程"章节

任何一项为"否"，都不要继续调用 API。

---

## API 1：查询账户信息

用途：用户询问积分、余额、会员状态时调用。

请求：GET https://mcp.suno.cn/mcp/api/user
Header：Authorization: Bearer ${SUNO_CN_API_KEY}

响应字段：nickname（昵称）、points（积分）、vip_status（会员状态）

⚠️ 响应中的中文可能显示乱码，这是终端编码问题，不是 API 错误，原样展示即可。

---

## API 2：生成音乐

用途：用户想创作/生成音乐时调用。

### 调用决策树（严格按此流程执行）

`
当用户表达 [生成歌曲] [创作音乐] [写首歌] [做首曲子] 等意图时：

步骤 1：确认需求
  IF 用户提供了歌词：
    custom_mode = true
    prompt = 用户提供的完整歌词
  ELSE IF 用户描述了音乐风格（如"夏天的流行歌"）：
    custom_mode = false
    prompt = 用户的描述（AI 模式，由服务端生成歌词）
  ELSE:
    询问用户："请提供歌词，或描述您想要的音乐风格（例如：帮我生成一首关于夏天的流行歌曲）"
    → 停止，等待用户回复

步骤 2：构建请求
  request = {
    method: "POST",
    url: "https://mcp.suno.cn/mcp/api/generate",
    headers: {
      "Authorization": "Bearer ${SUNO_CN_API_KEY}",
      "Content-Type": "application/json; charset=utf-8"
    },
    body: {
      prompt: 步骤 1 中确定的描述或歌词，
      mv: 用户指定的版本 || "chirp-fenix",
      title: 用户指定的标题 || 不传，
      tags: 用户指定的风格（必须使用英文，如 "pop, folk, c-pop"） || 不传，
      custom_mode: 有歌词则为 true，否则为 false,
      instrumental: 用户要求纯音乐则为 true || false
    }
  }

步骤 3：发送请求并处理响应
  response = send(request)
  
  IF response.status == 200:
    serialNos = response.serial_nos
    message = response.message
    说："✅ 提交成功！正在生成中，请稍候..."
    转到 "API 3：查询任务状态" 流程
  ELSE:
    转到 "错误处理流程"
`

### 请求体字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| prompt | string | ✅ 是 | AI 模式填音乐描述，custom_mode=true 时填完整歌词 |
| mv | string | ❌ 否 | 模型版本，默认 chirp-fenix。可选：chirp-fenix(v5.5) / chirp-crow(v5) / chirp-bluejay(v4.5+) / chirp-auk(v4.5) / chirp-auk-turbo(v4.5-all) / chirp-v4(v4) / chirp-v3-5(v3.5)，也可直接传别名如 v5.5、v5、v4.5 |
| title | string | ❌ 否 | 歌曲名称 |
| tags | string | ❌ 否 | 风格标签，**必须使用英文**，如 pop, folk, electronic, pop ballad, ancient style Chinese, c-pop 等。禁止传入中文标签 |
| custom_mode | boolean | ❌ 否 | true 为自定义歌词模式，默认 false |
| instrumental | boolean | ❌ 否 | true 为纯音乐，默认 false |
| reference_operation | string | ❌ 否 | 使用上传参考音频创建任务时填写：extend / add_vocals / add_instrumental / cover / add_stem |
| continue_serial_no | string | ❌ 否 | 上传处理成功后的参考音频 serial_no，必须来自 API 8 的 GET /upload/{serial_no} 且 status=success |
| continue_at | number | ❌ 否 | 参考音频起点；添加人声/伴奏/cover/音轨通常传 0 |
| stem_control_tags | string | ❌ 否 | reference_operation=add_stem 时必填 |
| vocal_gender | string | ❌ 否 | 可选：m 男声 / f 女声 / 空字符串随机 |

### 响应字段

| 字段 | 说明 |
|------|------|
| serial_nos | 任务编号数组，例如 ["123", "456"] |
| message | 提交结果消息 |

### 完整对话示例

#### 示例 1：AI 模式生成（用户提供描述）

`
用户：帮我生成一首关于夏天的流行歌曲

AI: 好的，我来帮您创作一首夏天主题的流行歌曲。
    [执行：POST https://mcp.suno.cn/mcp/api/generate]
    [请求体] {"prompt": "关于夏天的流行歌曲", "mv": "chirp-fenix", "custom_mode": false}
    
    ✅ 提交成功！正在生成中，请稍候...
    [执行：GET https://mcp.suno.cn/mcp/api/task/123?wait=45]
    
    🎵 生成完成！
    歌曲名：夏日微风
    时长：3:24
    ▶️ 点击播放：https://cdn.suno.cn/xxx.mp3
`

#### 示例 2：自定义歌词模式

`
用户：我想用这首歌词生成音乐：
[Verse]
阳光洒在海面
微风吹拂着脸

[Chorus]
这是我们的夏天
永远不变的画面

AI: 收到！我将用您提供的歌词生成音乐。
    [执行：POST https://mcp.suno.cn/mcp/api/generate]
    [请求体] {"prompt": "[Verse]\n阳光洒在海面...", "custom_mode": true}
    
    ✅ 提交成功！正在生成中，请稍候...
    [后续流程同上]
`

#### 示例 3：指定模型版本

`
用户：用 v5.5 模型生成一首电子音乐

AI: 好的，使用最新的 v5.5 模型为您创作电子音乐。
    [执行：POST https://mcp.suno.cn/mcp/api/generate]
    [请求体] {"prompt": "电子音乐", "mv": "chirp-fenix", "tags": "electronic"}
    
    ✅ 提交成功！正在生成中...
`

#### 示例 4：需求不明确时的询问

`
用户：帮我写首歌

AI: 请问您想要什么样的歌曲呢？您可以选择：
    1. 提供完整歌词（我会用您的歌词生成音乐）
    2. 描述音乐风格（例如：关于爱情的抒情歌、欢快的舞曲等）
    
    请告诉我更多细节~
`

### ⚠️ 关键注意事项

1. **提交后必须立即查询状态**（带 wait=45）
   `
   步骤：
   1. POST /generate → 获得 serial_nos
   2. 立即 GET /task/{serial_no}?wait=45
   3. 根据 status 决定下一步
   `

2. **轮询限制**（必须严格遵守）
   - 第一次查询必须加 `?wait=45`
   - 如果返回 status 为 queued/processing，告诉用户"还在生成中，请稍后再问我'好了吗'"
   - **绝对不要**自己循环调用查询接口
   - **最多调用 1 次**查询接口（带 wait=45），如果还没好就让用户主动再问
   - **禁止在一次对话中调用超过 2 次**

3. **编码要求**
   - 请求体必须使用 UTF-8 编码
   - 中文歌词直接传入，不要转义

---

## API 3：查询任务状态

用途：查询生成进度，或生成后轮询。

### 调用决策树

`
当需要查询任务状态时（生成后自动查询 / 用户主动询问）：

步骤 1：确定要查询的任务编号
  IF 是刚生成的任务：
    serialNos = 上一步 POST /generate 返回的 serial_nos
  ELSE IF 用户提供了编号（如"查一下 123 的状态"）：
    serialNos = 用户提供的编号
  ELSE IF 用户说"刚才的歌/最近的任务"：
    serialNos = 最近一次提交的任务编号（需要从上下文记忆）
  ELSE:
    询问用户："请问要查询哪个任务？请提供任务编号"
    → 停止，等待用户回复

步骤 2：构建请求
  request = {
    method: "GET",
    url: "https://mcp.suno.cn/mcp/api/task/" + serialNos + "?wait=45",
    headers: {
      "Authorization": "Bearer ${SUNO_CN_API_KEY}"
    }
  }
  
  ⚠️ 注意：
  - 如果是生成后的第一次查询，必须加 ?wait=45
  - 如果用户在任务进行中再次询问，不加 wait 参数（立即返回当前状态）

步骤 3：发送请求并处理响应
  response = send(request)
  
  IF response.status == 200:
    tasks = response.tasks
    
    FOR EACH task IN tasks:
      status = task.status
      
      IF status == "success":
        展示：
          🎵 歌曲名：{task.title}
          ⏱️ 时长：{task.duration}秒
          ▶️ 播放：{task.play_url}
      
      ELSE IF status == "queued" 或 "processing":
        说：
          ⏳ 音乐还在生成中，当前状态：{status}
          请您过 1-2 分钟再问我"好了吗"，我会继续为您查询。
        → 停止，不要再调用 API
      
      ELSE IF status == "failed":
        说：
          ❌ 生成失败
          原因：{task.fail_msg_show}
        → 停止，不要重试
      
      ELSE:
        说：
          ⚠️ 未知状态：{status}
  ELSE:
    转到 "错误处理流程"
`

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| serial_no | string | 任务编号 |
| status | string | queued（排队中）/ processing（处理中）/ success（成功）/ failed（失败） |
| title | string | 歌曲名（仅 success 时有值） |
| duration | number | 时长，单位秒（仅 success 时有值） |
| play_url | string | 播放链接（仅 success 时有值，直接展示给用户点击） |
| fail_msg_show | string | 失败原因（仅 failed 时有值） |

### 完整对话示例

#### 示例 1：生成后自动查询（带 wait=45）

`
AI: [刚执行完 POST /generate，获得 serial_nos: ["789"]]
    ✅ 提交成功！正在生成中，请稍候...
    
    [执行：GET https://mcp.suno.cn/mcp/api/task/789?wait=45]
    
    🎵 生成完成！
    歌曲名：夏日微风
    时长：204 秒（3 分 24 秒）
    ▶️ 点击播放：https://cdn.suno.cn/audio/789.mp3
`

#### 示例 2：用户主动询问（不带 wait）

`
用户：刚才那首歌好了吗

AI: [执行：GET https://mcp.suno.cn/mcp/api/task/789]
    ⏳ 音乐还在生成中，当前状态：processing
    请您过 1-2 分钟再问我"好了吗"，我会继续为您查询。
    
    → 停止，不要再调用查询接口
`

#### 示例 3：批量查询多个任务

`
用户：帮我查一下 123、456、789 这三个任务

AI: [执行：GET https://mcp.suno.cn/mcp/api/task/123,456,789?wait=45]
    
    任务 123：✅ 已完成
      歌曲名：春之歌
      播放：https://cdn.suno.cn/audio/123.mp3
    
    任务 456：⏳ 生成中（processing）
      请稍后再问
    
    任务 789：❌ 失败
      原因：内容违规，请修改后重试
`

### ⚠️ 关键注意事项

1. **wait 参数使用规则**
   - 生成后的**第一次查询**：必须加 `?wait=45`
   - 用户**主动再次询问**：不加 wait（立即返回当前状态）
   - wait 最大值：60，不要超过

2. **轮询限制**（违反会导致限流）
   - ✅ 允许：生成后查询 1 次（带 wait=45）
   - ✅ 允许：用户询问时再查询 1 次
   - ❌ 禁止：自己循环调用查询接口
   - ❌ 禁止：在一次对话中查询超过 2 次
   - ❌ 禁止：在任务未完成时连续查询

3. **状态处理优先级**
   `
   success → 立即展示播放链接
   failed → 展示失败原因，不要重试
   queued/processing → 告知用户稍后再问，然后停止
   `

---

## API 4：查询音乐列表

用途：用户查看历史生成记录。

### 调用决策树

`
当用户表达 [查看历史] [我的歌曲] [音乐列表] [生成记录] 等意图时：

步骤 1：构建请求
  request = {
    method: "GET",
    url: "https://mcp.suno.cn/mcp/api/music?page=1&page_size=10",
    headers: {
      "Authorization": "Bearer ${SUNO_CN_API_KEY}"
    }
  }
  
  可选参数：
  - page：页码，默认 1
  - page_size：每页数量，默认 10，最大 50

步骤 2：发送请求并处理响应
  response = send(request)
  
  IF response.status == 200:
    list = response.list
    page = response.page
    
    IF list 为空：
      说："您还没有生成过任何音乐，快来创作第一首吧！"
    ELSE:
      说："这是您最近生成的音乐："
      FOR EACH item IN list:
        展示：
          [{item.serial_no}] {item.title}
          状态：{item.status}
          播放：{item.play_url || "生成中"}
  ELSE:
    转到 "错误处理流程"
`

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| list | array | 音乐列表数组 |
| list[].serial_no | string | 任务编号 |
| list[].title | string | 歌曲标题 |
| list[].status | string | success / failed / processing |
| list[].play_url | string | 播放链接（仅 success 时有值） |
| page | number | 当前页码 |
| total | number | 总页数（如有） |

### 完整对话示例

`
用户：显示我最近的音乐列表

AI: [执行：GET https://mcp.suno.cn/mcp/api/music?page=1&page_size=10]
    
    这是您最近生成的音乐（第 1 页，共 10 首）：
    
    1. [789] 夏日微风
       状态：✅ 已完成
       ▶️ 播放：https://cdn.suno.cn/audio/789.mp3
    
    2. [456] 夜的钢琴曲
       状态：✅ 已完成
       ▶️ 播放：https://cdn.suno.cn/audio/456.mp3
    
    3. [123] 春之序曲
       状态：⏳ 生成中
    
    如需查看更多，请说"下一页"或"查看第 2 页"
`

---

## API 5：获取歌词

用途：用户想查看某首歌的歌词。

### 调用决策树

`
当用户表达 [看歌词] [显示歌词] [这首歌写的什么] 等意图时：

步骤 1：确定任务编号
  IF 用户提供了编号（如"看 789 的歌词"）：
    serialNo = 用户提供的编号
  ELSE IF 用户说"刚才那首歌的歌词"：
    serialNo = 最近一次生成的任务编号
  ELSE:
    询问用户："请问要查看哪首歌的歌词？请提供任务编号"
    → 停止，等待用户回复

步骤 2：构建请求
  request = {
    method: "GET",
    url: "https://mcp.suno.cn/mcp/api/lyrics/" + serialNo,
    headers: {
      "Authorization": "Bearer ${SUNO_CN_API_KEY}"
    }
  }

步骤 3：发送请求并处理响应
  response = send(request)
  
  IF response.status == 200:
    lyrics = response.lyrics
    
    ⚠️ 重要：必须完整原样展示 lyrics 字段内容
    说："这是歌曲的歌词："
    `
    {lyrics 完整内容，一字不改}
    `
    
    ❌ 禁止行为：
    - 不要总结歌词大意
    - 不要翻译歌词
    - 不要改写或省略
    - 不要说"大概意思是..."
  ELSE:
    转到 "错误处理流程"
`

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| serial_no | string | 任务编号 |
| lyrics | string | LRC 格式歌词文本（可能包含时间轴标记） |

### 完整对话示例

#### 示例 1：成功获取歌词

`
用户：显示 789 的歌词

AI: [执行：GET https://mcp.suno.cn/mcp/api/lyrics/789]
    
    这是歌曲《夏日微风》的歌词：
    
    `
    [00:00.00] 夏日微风
    [00:15.20] 阳光洒在海面
    [00:18.50] 微风吹拂着脸
    [00:22.10] 这是我们的夏天
    [00:25.80] 永远不变的画面
    ...
    `
    
    （必须完整展示，不要省略任何内容）
`

#### 示例 2：歌词不存在

`
用户：看 123 的歌词

AI: [执行：GET https://mcp.suno.cn/mcp/api/lyrics/123]
    
    ❌ 未找到该任务的歌词，可能原因：
    - 任务尚未完成
    - 该任务是纯音乐（无歌词）
    - 任务编号不正确
`

### ⚠️ 关键注意事项

1. **必须原样展示**
   - 即使歌词中有错别字，也不要纠正
   - 即使显示乱码，也不要尝试"修复"
   - 即使歌词很短，也不要"补充"

2. **LRC 格式说明**
   - 歌词可能包含时间轴标记 [00:00.00]
   - 直接展示即可，不要解释格式

---

## API 6：续写音乐

用途：在某首歌基础上继续创作。

### 调用决策树

`
当用户表达 [续写] [接着写] [继续创作] [从 XX 秒开始续] 等意图时：

步骤 1：确认原任务编号和续写位置
  IF 用户提供了编号和时间（如"从 789 的 30 秒处续写"）：
    serialNo = 789
    continueAt = 30
  ELSE IF 用户只说"续写刚才的歌"：
    serialNo = 最近一次生成的任务编号
    continueAt = 0（从结尾续写）
  ELSE:
    询问用户："请问要续写哪首歌？请提供任务编号，以及从第几秒开始续写（默认从结尾）"
    → 停止，等待用户回复

步骤 2：构建请求
  request = {
    method: "POST",
    url: "https://mcp.suno.cn/mcp/api/extend",
    headers: {
      "Authorization": "Bearer ${SUNO_CN_API_KEY}",
      "Content-Type": "application/json; charset=utf-8"
    },
    body: {
      serial_no: serialNo,
      continue_at: continueAt,
      mv: 用户指定的版本 || "chirp-fenix"
    }
  }

步骤 3：发送请求并处理响应
  response = send(request)
  
  IF response.status == 200:
    newSerialNo = response.serial_no
    message = response.message
    
    说："✅ 续写提交成功！新任务编号：{newSerialNo}"
    转到 "API 3：查询任务状态" 流程
  ELSE:
    转到 "错误处理流程"
`

### 请求体字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| serial_no | string | ✅ 是 | 原任务编号 |
| continue_at | number | ❌ 否 | 从第几秒续写，0 为从结尾续写，默认 0 |
| mv | string | ❌ 否 | 模型版本，默认 chirp-fenix |

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| serial_no | string | 新任务编号（续写生成的任务） |
| message | string | 提交结果消息 |

### 完整对话示例

`
用户：从刚才那首歌的 30 秒处开始续写

AI: 好的，我将从原歌曲的 30 秒处继续创作。
    [执行：POST https://mcp.suno.cn/mcp/api/extend]
    [请求体] {"serial_no": "789", "continue_at": 30, "mv": "chirp-fenix"}
    
    ✅ 续写提交成功！新任务编号：890
    正在生成中，请稍候...
    
    [执行：GET https://mcp.suno.cn/mcp/api/task/890?wait=45]
    
    🎵 续写完成！
    歌曲名：夏日微风（续）
    时长：180 秒
    ▶️ 播放：https://cdn.suno.cn/audio/890.mp3
`

---

## API 7：AI 生成歌词

用途：先生成歌词再创作音乐。

### 调用决策树

`
当用户表达 [先写歌词] [生成歌词] [帮我写词] 等意图时：

步骤 1：确认歌词需求
  IF 用户提供了灵感描述（如"写一首关于离别的歌"）：
    inspiration = 用户的描述
  ELSE:
    询问用户："请告诉我您想要的歌词主题或灵感（例如：关于离别、爱情、梦想等）"
    → 停止，等待用户回复
  
  可选确认：
  - title = 用户提到的标题
  - style = 用户提到的风格（古风、流行等）

步骤 2：构建请求
  request = {
    method: "POST",
    url: "https://mcp.suno.cn/mcp/api/gen-lyrics",
    headers: {
      "Authorization": "Bearer ${SUNO_CN_API_KEY}",
      "Content-Type": "application/json; charset=utf-8"
    },
    body: {
      inspiration: inspiration,
      title: title || 不传，
      style: style || 不传
    }
  }

步骤 3：发送请求并处理响应
  response = send(request)
  
  IF response.status == 200:
    lyrics = response.lyrics
    
    说："这是为您生成的歌词："
    `
    {lyrics 完整内容}
    `
    
    然后询问：
    "要用这首歌词生成音乐吗？我将使用 custom_mode=true 模式。"
    → 等待用户确认
    
    IF 用户确认：
      转到 "API 2：生成音乐" 流程（custom_mode=true）
  ELSE:
    转到 "错误处理流程"
`

### 请求体字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| inspiration | string | ✅ 是 | 灵感描述，如"关于离别情的歌" |
| title | string | ❌ 否 | 歌曲标题 |
| style | string | ❌ 否 | 风格，如古风、流行、电子 |

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| lyrics | string | AI 生成的完整歌词 |

### 完整对话示例

`
用户：帮我生成一首关于离别的歌词，要古风风格

AI: 好的，我来为您创作一首古风离别歌词。
    [执行：POST https://mcp.suno.cn/mcp/api/gen-lyrics]
    [请求体] {"inspiration": "关于离别的歌", "style": "古风"}
    
    这是为您生成的歌词：
    
    `
    [Verse 1]
    长亭外古道边
    芳草碧连天
    晚风拂柳笛声残
    夕阳山外山
    
    [Chorus]
    天之涯地之角
    知交半零落
    一壶浊酒尽余欢
    今宵别梦寒
    `
    
    要用这首歌词生成音乐吗？我将为您创作一首古风歌曲。
    （等待用户回复"好的"或"生成"后再调用 API 2）

用户：好的，用这个歌词生成音乐

AI: [执行：POST https://mcp.suno.cn/mcp/api/generate]
    [请求体] {"prompt": "[Verse 1]\n长亭外古道边...", "custom_mode": true, "tags": "ancient style Chinese, folk"}
    
    ✅ 提交成功！正在生成中...
`

---

## API 8：上传参考音频（必须绑定查询）

用途：用户要上传 MP3 参考音频，用于扩展、cover、添加人声、添加伴奏或添加音轨时调用。

⚠️ 这是一个组合流程，不是单个接口：

1. 必须先 POST https://mcp.suno.cn/mcp/api/upload 上传 MP3，获得 serial_nos。
2. 必须立刻 GET https://mcp.suno.cn/mcp/api/upload/{serial_no}?wait=45 查询最终处理结果。
3. POST /upload 只表示“已提交上传处理任务”，绝对不代表上传处理成功。
4. 只有 GET /upload/{serial_no} 返回 status=success，才能告诉用户上传成功。
5. 如果 GET 返回 status=failed，必须把 fail_msg_show 原样告诉用户，不要改写、总结或猜测原因。
6. 如果 GET 返回 queued/processing，告诉用户仍在处理中，请稍后再问，不要继续循环查询。

### 上传限制

| 项 | 规则 |
|----|------|
| 文件格式 | 仅支持 MP3 |
| 文件大小 | 最大 50MB |
| extend | 10-120 秒 |
| add_vocals | 20-240 秒 |
| add_instrumental | 20-240 秒 |
| cover | 10-480 秒 |
| add_stem | 10-240 秒 |

### POST /mcp/api/upload

请求：multipart/form-data

Header：Authorization: Bearer ${SUNO_CN_API_KEY}

字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| file | file/audio_url 二选一 | MP3 文件 |
| audio_url | file/audio_url 二选一 | 可公网访问的 HTTP/HTTPS 音频地址。服务端会下载并校验最终文件必须是有效 MP3 |
| operation | ✅ 是 | extend / add_vocals / add_instrumental / cover / add_stem |
| title | ❌ 否 | 歌曲标题，默认使用文件名 |
| mode | ❌ 否 | 普通上传不传；兼容性优化上传传 50 |

⚠️ 如果使用 audio_url，不能只看链接后缀或 Content-Type。服务端会实际下载并解析 MP3；如果最终下载内容不是有效 MP3，会返回明确错误，例如“下载地址或上传文件不是有效 MP3 文件”。遇到此错误必须原样告诉用户。

响应字段：

| 字段 | 说明 |
|------|------|
| serial_nos | 上传处理任务编号 |
| status | submitted 表示已提交，不表示成功 |
| message | 下一步查询提示 |

### GET /mcp/api/upload/{serial_no}?wait=45

响应字段：

| 字段 | 说明 |
|------|------|
| tasks[].status | queued / processing / success / failed |
| tasks[].fail_msg_show | 失败原因，仅 failed 时出现 |
| tasks[].title | 标题 |
| tasks[].play_url | 成功后的播放链接 |

### 强制调用流程

`
用户：我要上传这段 MP3 做 cover

AI:
  1. 检查文件是 MP3
  2. [执行：POST https://mcp.suno.cn/mcp/api/upload]
     form-data: file=<用户文件>, operation=cover
  3. 得到 serial_nos: ["123"]
  4. [必须执行：GET https://mcp.suno.cn/mcp/api/upload/123?wait=45]
  5. IF status == success:
       告诉用户：参考音频上传处理成功
       如果用户的目标是添加人声/伴奏/cover/音轨/扩展，必须继续调用 API 2：生成音乐，并传：
         continue_serial_no = upload.tasks[0].serial_no
         reference_operation = 用户选择的操作
         continue_at = 0（添加人声/伴奏/cover/音轨）
     ELSE IF status == failed:
       告诉用户：上传失败：{fail_msg_show}
     ELSE:
       告诉用户：音频仍在处理中，请稍后再问我“好了吗”
`

### 上传后创建任务

上传成功只代表参考音频处理完成，不代表已经执行添加人声、添加伴奏、cover 或添加音轨。

当用户的真实意图是“给这段音频添加人声 / 添加伴奏 / cover / 添加音轨 / 扩展”时，必须在 GET /upload 返回 success 后继续调用：

`http
POST https://mcp.suno.cn/mcp/api/generate
`

请求体示例：

`json
{
  "prompt": "用户提供的歌词或创作要求",
  "custom_mode": true,
  "mv": "chirp-fenix",
  "title": "歌曲名",
  "tags": "pop",
  "reference_operation": "add_vocals",
  "continue_serial_no": "上传处理成功返回的 serial_no",
  "continue_at": 0
}
`

`reference_operation` 映射：

| 用户意图 | reference_operation |
|------|------|
| 扩展/续写上传音频 | extend |
| 添加人声 | add_vocals |
| 添加伴奏 | add_instrumental |
| cover/翻唱 | cover |
| 添加音轨 | add_stem |

添加音轨时还必须传 `stem_control_tags`，且它是音轨提示词；如果用户没给，要先询问。

⚠️ 禁止行为：
- 禁止只调用 POST /upload 后就告诉用户“上传成功”。
- 禁止在 failed 时隐藏 fail_msg_show。
- 禁止编造成功结果。
- 禁止自动循环查询；最多查询 1 次，带 wait=45。
- 禁止上传成功后漏掉 POST /generate；上传和创建任务是两个阶段。

---

## 错误提示模板（必须原样使用，不准修改）

| HTTP 状态码 | 提示语 |
|-------------|--------|
| 401/403 | "API Key 无效或已过期，请检查 SUNO_CN_API_KEY 配置" |
| 5xx | "请求服务器异常，请稍后重试" |
| 超时 | "请求超时，请稍后重试" |
| 网络错误 | "网络连接失败，请检查网络或代理设置" |

⚠️ 禁止使用其他表述，禁止添加"可能原因"、"建议检查"等额外内容。

---

## 详细错误日志输出（必须执行）

**任何 HTTP 请求失败时，除了展示上述用户友好的提示外，还必须输出详细的技术日志供排查问题。**

### 需要输出的信息

| 类别 | 信息内容 | 是否输出 | 说明 |
|------|----------|----------|------|
| **请求信息** | HTTP 方法 | ✅ 是 | GET/POST |
| | URL（不含 query 参数） | ✅ 是 | 如 `https://mcp.suno.cn/mcp/api/user` |
| | Header（隐藏 Authorization） | ✅ 是 | Authorization 显示为 `Bearer sk-********` |
| | 请求体（隐藏 key） | ✅ 是 | 如有 key 相关字段，用 `********` 替换 |
| **响应信息** | HTTP 状态码 | ✅ 是 | 如 401、500 |
| | 响应头 | ✅ 是 | 完整展示 |
| | 响应体 | ✅ 是 | 完整展示，即使是错误信息 |
| **错误信息** | 错误类型 | ✅ 是 | 如 `NetworkError`、`TimeoutError` |
| | 错误消息 | ✅ 是 | 完整的错误文本 |
| | 堆栈跟踪 | ✅ 是 | 如有，完整展示 |

### 敏感信息隐藏规则

- `Authorization: Bearer sk-xxxxxxxxxx` → `Authorization: Bearer sk-********`
- 任何 `sk-` 开头的字符串 → `sk-********`
- `SUNO_CN_API_KEY` 环境变量的完整值 → `********`

### 日志输出格式

使用代码块包裹详细日志，格式如下：

`
=== 错误详情 ===
请求：POST https://mcp.suno.cn/mcp/api/generate
状态码：503
错误：请求服务器异常

--- 请求头 ---
Content-Type: application/json
Authorization: Bearer sk-********

--- 响应头 ---
Content-Type: application/json
Retry-After: 60

--- 响应体 ---
{"error": "Service Unavailable", "message": "Please try again later"}
`

⚠️ 详细日志仅供技术排查，不要让普通用户误解。先展示用户友好提示，再展示详细日志。

---

## 版本声明

- **Skill 版本**: 1.3.2
- **API 版本**: 以 https://mcp.suno.cn/mcp/skill/version 返回为准
- **兼容性**: 不假设 API 格式固定，以实际响应为准

如果 API 响应包含未预期的字段，原样展示，不要报错。

---

## 版本检查

GET https://mcp.suno.cn/mcp/skill/version

如果 latest_version 高于 1.3.2，告知用户有新版本。