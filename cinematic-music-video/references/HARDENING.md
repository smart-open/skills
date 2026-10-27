---
name: cmv-hardening-playbook
description: （已并入 cinematic-music-video 主技能，原 cmv-run-hardening 技能全文）实战加固手册：开篇 8 条跨阶段「核心定律」（方法论层，制作前先读）+ 100+ 条实测坑位（判定标准、处置顺序）。配套补丁脚本在主技能 assets/ 目录（patch-refs.js、plan-resilient.js）；强一致性 SOP 另见 references/CONSISTENCY-SOP.md。
agent_created: true
---

# cinematic-music-video 实战加固手册

> **先读「核心定律」八条，再看坑位。** 定律是方法论层（为什么会踩、下次怎么绕），
> 坑位是经验层（某一次具体踩到了什么）。遇到新坑先判断它触犯了哪条定律。
>
> **本文档原为独立技能 `cmv-run-hardening`，2026-09-29 并入主技能。**
> 文中提到的 `assets/plan-resilient.js`、`assets/patch-refs.js` 现位于主技能根目录 `assets/` 下。
> 坑位 70+（秦淮灯下影一轮的新经验）见同目录 `CONSISTENCY-SOP.md`。
> 原文提到 `out/_qa/` 的脚本路径均为各项目侧的历史产物，已随项目清理，遇到同类问题按文中思路重建即可。

`cinematic-music-video` 这条流水线设计得相当完备，但它的**四个失效模式**在真实运行里一定会遇到，
而且每一个都会以"看起来像卡死"的形式出现，非常容易被误判为网络问题或额度问题。
本手册给出判定标准、处置顺序和两个开箱即用的补丁脚本。

**总原则：优先用 `node -r <preload.js>` 预加载钩子打补丁，不改动技能安装目录的源码。**
理由有三：技能可能被升级覆盖；预加载只影响本次进程；补丁的每一处都对应一个**实测到的**模型行为，
换了模型行为该补丁就该重写，而不是留在源码里变成"神秘历史包袱"。

> **唯一的例外：纯实现 bug 直接改源码。**
> 判据很简单——**"换个模型行为，这个补丁还需要吗？"**
> 需要（如参考图压构图、流式截断）→ 用钩子；
> 不需要（如参数没注册、变量没透传、默认值算错、文件挑选顺序不确定）→ 这是写出错的行，直接改掉，
> 用钩子去绕只会让下一个人继续踩。哪些已按此原则改过源码，见「坑位 5」。

---

## 核心定律（跨阶段通用 · 制作前先读这八条）

> 坑位是"某一次具体踩到了什么"，定律是"为什么会踩、下次怎么绕"。
> 这八条不是某个模型的怪癖，而是**图像 / 视频 / 视觉判定三类模型共享的行为规律**，
> 因此它们跨项目、跨歌曲、跨画幅都成立。
> **遇到新坑，先判断它触犯了哪条定律，再按定律给的方向处置** —— 比照着症状翻坑位更快。

### 定律 1｜一致性 = 共享可复用资产 + 显式引用

**不要在提示词里把同一个东西"重新描述一遍"** —— 那是三次独立生成，必漂。
会反复出现的东西（脸 / 地点 / 配饰道具）先做成**资产**（设定表、身份锁、锚点图、特写参考），
再让每个镜头**显式引用**它。
- 出处：三条一致性线贯穿全手册 —— 脸（§2.1–2.3）、地点（§2.4）、道具（§2.4b）。
- 判据：出现"同一个 X 在不同镜头里长得不一样"，先问"它有资产吗？镜头引用它了吗？"，而不是先改文案。

### 定律 2｜图能定，字不能

**参考图 / 锚点图能锁住结构、环境、光位、尺度、景别；文字推不动它们。**
想改这些，要改图（换盘 / 换档 / 加锚点），不是加形容词。
- 出处：650 字场景文字注入 `SETTING` 段，S04 依旧是"樱花花园"；挂上锚点图后书斋立刻还原（§2.3、坑位 75 补记六）。
- 出处：想让人变小，尺度句 34%→52% 越写越大，换盘才动（坑位 88）；"人比建筑大"只能靠改盘档（坑位 94/95）。
- **推论**：提示词里所有"希望它看起来怎样"的句式，都不如**换一张正确的图**。

### 定律 3｜一个镜头只能有一种描述（同构律）

`keyframe_prompt`（含 `[[SCALE]]`）、`shot_size`、`visual`、`video_prompt` 是**同一个镜头的四种说法**，
必须**同构**。改了其中任何一处，都要回头检查另外三处。
- 出处：S19 关键帧是远景、`video_prompt` 是面部特写 → 成片出了面部特写（坑位 97）。
  **视频模型对强语义文字（景别）的服从度，高于对首帧的模仿度。**
- **推论**：`keyframe_prompt` 与 `video_prompt` 的排除句必须**双双**写，只改一处 = 白改（坑位 100）。
- 工具：`images.js --show-prompt` / `videos.js --show-prompt`（零额度打印最终下发提示词）。

### 定律 4｜没写死的，模型会自己改

**最容易被低估的元定律。** 首帧看着没问题 ≠ 视频里没问题 ——
模型会在你没约束的维度上"自由发挥"：她站进水里（只写了水怎么动、没写她站在哪，坑位 99）、
空镜凭空长出一朵花（只给"花瓣"这个裸名词、没写它长在哪，坑位 100）、
镜头自己重新取景（`static` 只锁相机、不锁构图，坑位 99）。
- **处置方向（三条必做）**：
  1. **主体成对出现**：写"它是什么"的同时写"它长在哪 / 挂在哪 / 落在哪"（承载物，坑位 100）。
  2. **危险元素显式否定**：画面里有水 / 悬崖 / 车流 / 火时，写一句"她不在其中、水位不涨、衣摆不没入"（坑位 99）。
  3. **"不动"要写全**：`static` **+** `the scene does not re-compose` **+** 背景元素位置与大小锁定（坑位 99）。

### 定律 5｜控制权归"最像目标输出的那张图"

多张参考图同处提示词时，**最贴近镜头取景的那张会夺取构图控制权**。三个旋钮：**张数**（越多越爱出多人）、
**景别档**（比镜头更远的图会把构图拽远）、**结构**（多格输入必产多格输出）。
- 出处：近景挂 2~3 张每轮都出双人、挂 1 张从未出过（§2.3）；全景地点盘把 close-up 拽成全身（坑位 75 补记六）。
- **推论**：近景镜身份图恒为 **1 张**；地点盘必须与镜头**同档**（§2.4）。

### 定律 6｜判定分层：机器只报事实，判定归人

**凡是让视觉模型"看着给个结论"的检查，都不能当门禁 —— 只能当线索。**
同一张图两次能跑出相反结论（坑位 96）。
- **要模型值钱，就让它报坐标 / 报事实**（头顶 y、脚底 y、构件 y、差异清单），推导与判定留给代码和人。
- 门禁必须用**可复算的量**（像素几何、帧数、LAB 亮度），并写明容差来自哪几格已通过的镜头。
- **写实小人物镜头一律人眼终审**（坑位 53）；门禁只回答它被设计的问题（是不是同一个人 / 有没有字）。
- 工具：`assets/measure-scale.js`（坐标法）、`assets/drift-check.py`（可复算亮度差）、`assets/montage.js`（人眼核验图）。

### 定律 7｜修法要落进"项目真源"，不能停在命令行开关

命令行开关（`--scene-image`、`--ref-framing`…）**只修这一次跑**，下次 `images.js` 重跑就蒸发；
更糟的是 `--force` 还可能级联重建签过字的真源（坑位 76）。
- **凡是要长期成立的修法，写进分镜字段**：`shot.ref_framing` / `shot.scene_framing` / `shot.scene_plate`（坑位 94/95）。
- 字段优先于 `shot_size` 推导、**非法值直接抛错**、可被下次重跑复现。
- **自检**：修完问一句"我这次是用开关修的，还是写进真源了？"

### 定律 8｜档位是有限集合，需求是无限的

场景盘、参考图景别都是**有限档位**；当某个场景的**所有档位**都不满足需求时，
**正确的动作不是继续换档**，而是**补一张新资产**（同场景、不同机位的新盘），并立刻给它一个字段（坑位 95）。
- 反例：S13/S16 靠换档解决后 `medium` 档被占满，S18/S21 再换档只会让"构图雷同"从 4 格扩散到 6 格。
- 新资产要**用米制数字锁真实尺寸**（月洞门 2.2 m、院墙 3 m），**绝不写"人很小"**（坑位 88 会反向放大）。

---

## 坑位 0（每次都要先做）：Windows/bash 的 PATH 劣化

本机 bash 的 PATH 会在会话中劣化，`ls / cp / sed / head / basename / dirname` 全部报
`command not found`，看起来像脚本坏了，其实是环境问题。

**每条 shell 命令前都加：**

```bash
export PATH="/usr/bin:/bin:/c/Windows/System32:/c/Windows:$PATH"
```

> 注意 `/c/Windows` 必须在里面，否则 `cp` 仍然找不到（它依赖 Windows 自带的工具链）。

---

## 坑位 1：plan.js 连续 `JSON parse failed`

### 判定

日志形如：

```
planner replied in 168.0s (30776 chars)
attempt 1: JSON parse failed, repairing ...
```

**关键判据是字符数**：两次独立请求都停在 ~30k 字符附近（相差几个百分点），
说明**流式响应被中途切断**，不是模型的语法错误。
对照实验：同样请求在另一次运行里返回了 66,826 字符的完整分镜 → 说明是偶发截断。

`lib/agnes.js` 的 `chatStreamRequest` 只用 `res.on("end")` resolve，
**不校验内容完整性**，所以截断的响应会被当作成功返回给上层。

### 处置

用 `assets/plan-resilient.js`：

```bash
node -r "<skill-dir>/assets/plan-resilient.js" "<cmv>/scripts/plan.js" \
  --song "<mp3>" --lyrics "<lrc>" --title "<名>" --aspect 16:9 --shots <N> \
  --brief "<创作要求>" --style "<风格>"
```

它包装 `agnes.chat`：拿到内容后先跑 `extractJson`，**失败就重新请求**（最多 5 次），
只把"结构完整"的响应交给 plan.js。有效来源就是这一层重试。

**代价**：每次重试约 3–7 分钟。实测最坏 4 次全断（15 分钟），最好 1 次成功（7 分钟）。

---

## 坑位 2：镜头数与时长总和不满足结构校验

### 判定

```
attempt 1: 1 structural problem(s):
  - 镜头时长之和为 712.0s，与歌曲总时长 289.2s 相差过大（超过 25%）。请重新分配，使之和接近总时长。
```

**根因**（本次实测）：规划器看到 N 行带时间戳的歌词，就生成 N 个镜头，并把每个 duration
写成**允许区间的上界 12s**。289.2 秒的歌、60 行歌词 → 60 镜 × 12s = 712s。
它**不会**主动把时长和收敛到歌曲长度。

### 处置（两道，都要做）

**其一，在 `--brief` 里把数量约束写成显式硬要求。** `brief` 会被原样拼进用户提示词，
权重足够，实测能让规划器从 60 镜回到 36 镜：

```
【硬性数量要求】全片必须正好 36 个镜头，不要把每一行歌词都拆成一个镜头——请把 60 行歌词
合并到 36 个镜头里（平均每个镜头覆盖 1-2 行歌词）；36 个镜头的 duration 之和必须精确等于
289.2 秒（平均约 8.0 秒/镜），绝对不要把每个镜头都写成 12 秒。
```

**其二，让 `plan-resilient.js` 兜底归一化时长。** 它会把 `shots[].duration` 按比例缩放、
夹到 [4,12]、迭代分摊并吸收舍入残差，使其**精确等于**歌曲总时长。

> 这一步是安全的：`plan.js` 下游的 `fitTimeline()` 本来就要做同一件事，
> 我们只是把"校验失败 → 再花 6 分钟问模型"提前变成了确定性修正。
> 它还会在镜头数超过 `CMV_MAX_SHOTS`（默认 40）时按相邻合并收敛，
> 但遵守 `ceil(n/2) * 12 >= 总时长` 这条可行性边界（本歌最短 25 镜），合并过度会导致时间轴无解。

**环境变量**：`CMV_TOTAL_DURATION`（歌曲秒数）、`CMV_MAX_SHOTS`（镜头数上限）。

> **2026-09-23 更新**：这条已经从"项目侧补丁"升级为**技能源码内建**，见坑位 41。
> `fitTimeline()` 现在自带 `reconcileShotCount()`（数量不可行时自动合并/拆分），
> `prompts.js` 会把 `floor(总时长/4)` 作为硬上界写进提示词，`plan.js` 也会在拟合前落
> `01_plan/storyboard.raw.json`。新项目**不需要再挂 `plan-resilient.js`**。

---

## 坑位 3：视觉服务挂起，流水线"推进不动"

### 判定

`images.log` 里出现连续的

```
[vision] transient error (Request timed out after 300000ms), retry in 12s (attempt 3/7)
```

且**首帧计数长时间不动**（实测 10 分钟 0 推进）。

根因：`lib/vision.js` 的 `chatVision` 用的是 **`stream: false`**，并硬编码 `timeout: 300000`。
非流式请求在响应就绪前不发任何字节，所以这个"空闲超时"实际上等于**总超时**；
服务端一旦排队/挂起，每次尝试就实打实烧 300 秒，`withKeyRetry` 最多 7 次 → 单个镜头可卡 35 分钟。

### 先确认服务到底是不是整体不可用

**别猜，直接探测。** 连一个 `max_tokens: 8` 的 `ping` 都超时，才是服务端问题：

```bash
node -e '
const https=require("https");
const body=JSON.stringify({model:"agnes-3.0-flash",messages:[{role:"user",content:"ping"}],max_tokens:8,stream:true});
const t0=Date.now();
const req=https.request({host:"api.agnes-ai.cn",path:"/v1/chat/completions",method:"POST",
 headers:{Authorization:"Bearer "+process.env.AGNES_API_KEY,"Content-Type":"application/json","Content-Length":Buffer.byteLength(body),Connection:"close"},timeout:45000},
 res=>res.on("data",()=>{console.log("OK in",((Date.now()-t0)/1000).toFixed(1));process.exit(0);}));
req.on("timeout",()=>{console.log("TIMEOUT");process.exit(0)});
req.on("error",e=>{console.log("ERR",e.message);process.exit(0)});
req.write(body);req.end();'
```

（流式与非流式都超时 = 服务端不可用；只有非流式超时 = 坑位 3 的缓冲问题。）

### 处置：`--skip-refs --no-verify` 续跑

好消息是**图像模型是另一个服务**，往往仍然正常（实测首帧照常出图）。
所以不要重启整个阶段，直接用：

```bash
node "<cmv>/scripts/images.js" --project "<项目>" \
  --concurrency 3 --skip-refs --no-verify
```

- `--skip-refs` **不是**丢弃已有素材，而是"不要再花 API 生成参考图"——
  它会 `loadCharacterAssets` / `loadSceneAssets` **复用磁盘上的设定表、角度图、场景锚点**，
  身份锚定依然生效。
- `--no-verify` 关掉全部视觉核验。
- 已完成的首帧自动跳过（断点续跑）。

实测：卡在 13/36 十分钟后改用它，**5.7 分钟**跑完剩余 23 张。

> 代价要如实告诉用户：被跳过的镜头**没有过身份门禁**，
> `identity_report.json` 只覆盖门禁开启期间完成的那些镜头。

---

## 坑位 4（本次最大发现）：参考图会覆盖景别指令，把所有镜头压成"居中全身站立照"

### 判定

首帧在**构图上高度雷同**：无论提示词写 `extreme close-up` 还是 `extreme wide`，
出来的都是"人物站在画面正中、头顶到脚底、背景是场景"。
用 ffmpeg 拼接触表一眼就能看出来：

```bash
cd "<项目>/02_images"
ffmpeg -y -f image2 -i "shot_S%02d.png" -vf "scale=300:-1,tile=6x6:padding=4:color=black" -frames:v 1 sheet.jpg
```

### 根因（同提示词、四种参考组合的实测矩阵）

提示词本身是**正确**的：`SHOT:` 块写着 `Extreme close-up of the protagonist's face`，
`FRAMING:` 块写着 `shot size extreme close-up`，
`REFERENCE HANDLING` 块甚至明确写了
`NONE of the references may dictate this frame's shot size, camera angle or composition`。
**模型照样无视。**

| 参考图组合 | 结果 |
|---|---|
| **无参考图** | ✅ 正确呈现面部特写，服装/发型/配色都对 |
| **只带面部特写** | ✅ 景别正确（背景可能被模型自由发挥） |
| **只带场景锚点**（无人空镜街道） | ❌ 被压成居中全身站立照 |
| **面部 + 场景锚点** | ❌ 同样被压成全身照 |

结论：**9:16 的全身站立棚拍图、以及无人空镜的场景锚点图，都会让模型输出
"人站在画面正中、头顶到脚底"**。这条覆盖了提示词里所有显式的构图指令。

### 处置

用 `assets/patch-refs.js` 改写 `assets.pickShotRefs`（不改源码）：

```bash
node -r "<skill-dir>/assets/patch-refs.js" "<cmv>/scripts/images.js" \
  --project "<项目>" --force --skip-refs --no-verify --concurrency 3
```

策略：

1. **含主角的镜头** → 参考图只留**面部特写**（身份锚点），**丢弃全身图与场景锚点**；
   地点交给镜头自身的文字描述承担（规划器写的 `keyframe_prompt` 通常已含地点，如
   `sitting on damp concrete steps in a narrow alley`）。
2. **空镜（无主角）** → 保留**场景锚点** + 风格板。那里没有人物可以被错放，锚点纯赚不亏。
3. **画面主体是物体/身体局部的镜头**（鞋、手、影子、窗、面部大特写）→ **彻底不挂参考图**。
   用环境变量点名：`CMV_NO_REF_SHOTS="S08,S11,S13,S15,S17,S27"`。

实测效果：一次全量重生成 + 一轮 8 镜定向重生成后，
36 镜里约 26–28 镜构图正确，其余为"接近但非精确景别"，
关键情绪落点（面部特写、镜子、桥洞、铁链、餐盒、航拍小人影）全部到位。

**这条规律的普适性**：任何"多参考图 i2i + 要求指定构图"的图像流水线都会遇到。
**参考图不仅传递内容，还传递结构；结构优先级高于提示词里的文字指令。**
想要某个景别，就**不要给它看任何带相反景别结构的图**。

### 强化手段：接触表

不要逐张 Read 看首帧（36 张就是 36 次工具调用）。用上面那条 ffmpeg 命令拼一张 6×6 接触表，
**一次 Read 看完全片构图分布**，再决定哪几个镜头要 `--only` 重修。

---

## 坑位 5：字幕烧不进去 / 字号怎么调都不变 / 挑错歌词文件（`subtitles.js`）

**这三个都是技能源码里的实现缺陷，已直接改源码修复（2026-09-21），不是靠钩子绕。**
记录在此是因为它们的**表现形式极具误导性**，下次遇到别的技能也会是同一类坑。

### 5.1 传了 `--font-size` 却报 `unknown argument`

```
ERROR: unknown argument --font-size
...

Options:
  --font-size <px>      Font size in px (default playResY/28, one line, no wrap)
```

**报错信息和帮助文本自相矛盾**——帮助里明明列了这个参数。
根因：`main()` 里的 `SPEC` 参数表**只注册了 `--project/--video/--lyrics/--out/--style/--font/--srt-only`**，
而 `--font-size`、`--max-line`、`--offset` 三个只写进了 `USAGE` 字符串。
而下游代码一直在读 `args.fontSize` / `args.maxLine` / `args.offset`——**读得到才算有**。

### 5.2 参数注册了、也不报错了，但字号还是没变

`buildAss({ lines, playResX, playResY, font, styleKey, title })` —— **漏传了 `fontSize`**。
函数签名里有 `fontSize`，函数体里也用了 `fontSize || playResY / 28`，
但调用处根本没传 → 参数永远走默认分支。

> **这两个 bug 叠加的效果就是"无论怎么调，字号都锁死在默认值"**，
> 而且不会有任何报错。排查顺序：先看 `SPEC` 有没有注册，再看调用处有没有透传。

### 5.3 默认字号在横屏下小到看不清

`playResY / 28` 是**按竖屏短视频假设写的**：720×1280 → 46px（合适），
但 1280×704 横屏 → 只有 **25px**（偏小，投屏/手机上吃力）。
已改为 `min(playResX, playResY) / 18`：横屏 1280×704 → **39px**、竖屏 720×1280 → **40px**，
两种画布观感一致。需要更大就显式 `--font-size`。

### 5.4 同目录有多个 LRC 时会挑错文件

旧逻辑只按"结尾是不是 `.lrc`"排序，三类变体（`.lrc` / `.aligned.lrc` / `.corrected.lrc`）
**排出来全是同分**，最终选谁取决于 `fs.readdirSync` 的返回顺序（在 Windows 上不是稳定的按名排序）。
有概率把 **ASR 对齐版**当成字幕源烧进成片。
已加入确定性优先级 `lyricsRank()`：

| 优先级 | 文件 | 含义 |
|---|---|---|
| 0 | `*.corrected.lrc` | 人工/AI 修正后的时间轴，最可信 |
| 1 | `*.lrc`（非 aligned/auto/raw） | 官方原始 LRC |
| 2 | `*.aligned.lrc` | ASR 实测对齐，仅供参考 |
| 3 | `*.txt` 等 | 纯文本，按片长均分 |

同时新增 `[lrc]` 日志行打印**实际选中的歌词文件与时间戳行数**——这类"选错源"的 bug 必须靠日志暴露。

### 5.5 附带改进：合并 LRC 重复延音行

LRC 常把长音/延音写成**两条时间戳不同、文本相同**的行。
直接输出会让同一句话在接缝处"淡出(`\fad`)又淡入"抖一下。
已在 `buildLines()` 里合并相邻同文本行（本片 60 行 → 56 行）。

### 本项目复核结果

```
[lrc] out/mv-秦淮灯下影/00_source/秦淮灯下影.corrected.lrc  (时间戳行 60 条)
[srt] out/mv-秦淮灯下影/04_build/秦淮灯下影_MV.srt  (56 句)
[ass] out/mv-秦淮灯下影/04_build/subs.ass  (style=gold, font=楷体, size=39px, ... 1280x704, duration=289.21s)
[done] out/mv-秦淮灯下影/05_output/秦淮灯下影_MV_字幕.mp4  (118.4 MB)
```

交付前必查三项：**音频 MD5 与原片一致**（字幕烧录应走音频直通，不一致说明被重编码了）、
**总时长与帧数一致**、**抽 2–3 帧肉眼确认字号与位置**。

---

## 坑位 6（最危险）：`--force` 会静默摧毁手工修正过的身份锁

**这是本次 MV 全片"人脸不对、人偏胖、服装漂移"的总根因，而且是一个会反复踩的陷阱。**

### 表现形式

重跑阶段 2（`images.js`）时，最自然的做法就是加 `--force`。
但 `--force` 除了重画图，还会**把 `02_images/character_lock.json` 重新用"视觉反读"覆盖一遍**，
于是你之前对身份锁做的任何修正全部作废，36 张首帧又一次全部画错人。
**没有任何报错，日志里只会静静地多一行 `从真实设定表反向提取结构化五官参数 ...`。**

### 根因（`scripts/lib/assets.js`）

```js
if (!o.force && fs.existsSync(lockPath)) {      // ← force 时跳过复用
  identity = JSON.parse(fs.readFileSync(lockPath, "utf8"));
}
if (!identity) {
  if (verify) identity = await vision.extractIdentity(pool, sheetPath);  // ← 反读覆盖
  identity._source = "vision-from-sheet";
  agnes.writeFileSyncDurable(lockPath, ...);    // ← 写回，原内容永久丢失
}
```

`--force` 把"复用已有身份锁"的分支短路了，于是必然走进"反读 + 写回"。
设计意图是"设定表是唯一真源，参数从图上读回来"——但**反读是有损的**：
它会把你设计好的 22 岁/下颌收窄/娇小体型/白T+灰运动裤，读成
二十几岁末/下颌圆润/高挑腿长/白背心+黑长裤。而且反读结果的 `_source` 会被标成
`vision-from-sheet`，**从名字上完全看不出它是"被降级过的"**。

### 处置

**已直接改源码修好（2026-09-21）**：`assets.js` 新增 `AUTHORITATIVE_LOCK_SOURCES`，
当身份锁的 `_source` 属于 `storyboard` / `planner-params` / `manual` 时，
`--force` **只重画图、保留身份锁**，并打印 `[keep]` 日志说明原因。
确实想按新设定表反读，就先手动删掉 `character_lock.json`——把破坏性操作变成显式动作。

### 判定：我怎么知道身份锁被读歪了

一行命令就能看出来，**重跑任何阶段之前都该先跑**：

```bash
node -e "const l=require('./<项目>/02_images/character_lock.json');
console.log('_source =', l._source);
console.log(l.age_range,'|',l.face_shape,'|',l.physique);
console.log(l.wardrobe_layers)"
```

- `_source: "vision-from-sheet"` → **可疑**，务必和 `01_plan/storyboard.json` 的
  `character.params` 逐字段对一遍（年龄 / 下颌 / 发型 / 体型 / 内搭 / 下装 / 鞋 / 配饰）。
- `_source: "storyboard" / "planner-params"` → 是设计真源，可以放心。

对不上就用「分镜设计作唯一真源」重建：

```bash
# 备份原锁 -> 用 sb.character.params 覆盖 character_lock.json，_source 置为 "storyboard"
node <项目>/../../_qa/rebuild-identity.js
```

### 一句话总结

**"重画图"和"重定身份"必须分开。** 任何"生成 → 反读 → 用反读结果当后续真源"的流水线
都有这个结构性风险：反读是单向有损的，而 `--force` 这类"全都重来"的开关会把它触发得悄无声息。

---

## 坑位 7：`node -r <preload>` 必须传**绝对路径**

### 判定

```
Error: Cannot find module 'out/_qa/harden.js'
Require stack:
- internal/preload
    code: 'MODULE_NOT_FOUND'
```

明明 `out/_qa/harden.js` 就在当前目录下。

### 根因

`-r`/`--require` 走的是 Node 自己的模块解析，**不按 cwd 解析相对路径**，也不接受 `./` 前缀的快捷解析。

### 处置

一律传绝对路径（Windows 下正斜杠可用）：

```bash
node -r "D:/ai_work/test/out/_qa/harden.js" "<技能>/scripts/images.js" --project "<项目>" ...
```

---

## 坑位 8：`ref_face.png` 其实是第二张**全身照**（`buildFaceRefPrompt` 把服装写了进去）

### 判定

打开 `02_images/ref_face.png`，看到的不是头肩特写，而是**从头到脚的全身站姿照**，文件名和 label 却都写着"面部特写参考"。

### 危害（这是"特写被拉成全身"的隐藏源头之一）

`pickShotRefs` 给绝大多数镜头挂的是"面部特写"这一张，本意是"只锁脸、不注入全身构图"。
可这张图本身就是全身照 —— 于是**每一镜都在被一张全身站姿照往"全身像"上拽**。
坑位 4 讲的"参考图压构图"，这一张就是最隐蔽的一路。

### 根因（`scripts/lib/render.js`）

`buildFaceRefPrompt()` 里嵌的是 `identityBlock(id)`，而该函数默认**把整套服装逐层写进提示词**
（含 `bottoms` 与 `footwear` —— 高跟鞋、丝袜）。模型读到鞋，就把人画全了。

技能自己其实早就提供了开关：`identityImmutableBlock()` 用的正是 `identityBlock(id, { noWardrobe: true })`，
只是面部参考这一处漏了。

### 处置（已按"纯实现 bug 直接改源码"处理）

```js
// render.js -> buildFaceRefPrompt()
parts.push(identityBlock(id, { noWardrobe: true }));   // 只留脸 / 发型 / 肤色 / 体型 / 痣
```

改完必须**重画面部锚点**（旧的全身照要作废）。生成后自检：

- 打开 `ref_face.png` 确认是头肩特写；
- 或查提示词：`Wardrobe \(layer by layer\)` 必须为 `false`。

> 顺手清一下 `distinctive_marks` 里的服装字样（例如 "…visible above the qipao's open back" 里的 `qipao`）——
> 这个字段会进**每一镜**的提示词，留着就会持续暗示服装。

只重建面部锚点、不重跑整套角色资产，用 `reface.js`：生成 N 个候选 → 视觉模型逐个判取景
（`headshot` / `head_and_shoulders` / `half_body` / `full_body`，并看 `sees_legs`/`sees_feet`）→ 取最优写回。
实测 3 候选里 2 个合格（101 / 99 分），不合格的那个是 `half_body`。

---

## 坑位 9：局部镜（BODY-PART）会被"空镜门禁"卡死

### 判定

日志形如：

```
[ok] 镜头 S08 -> shot_S08.png
[QA] S08 空镜 文字=无 人物数=1
↻ S08 未达标，依据差异重新生成（第 2 次）...
（连续 3 次，最终"最佳尝试一致度仅 40"）
```

而实际打开图看，**画面完全正确**（只有一只脚与裙摆，构图精准）。

### 根因

为了不让"完整的人"被画进局部镜，加固层刻意**不给局部镜挂任何参考图**。
但 `images.js` 的分支是：

```js
if (t.hasCharacter && t.refs.paths.length) { compareIdentity(...) }
else { auditKeyframe({ expectCharacter: false }) }   // ← 零人物才算过
```

`refs.paths` 一空就掉进"空镜分支"，要求 `human_count === 0`。
可局部镜里必然有手/脚/腿 —— **结构性必失败**，每个局部镜白烧 3 次重画。

### 处置：hook `vision.auditKeyframe`，替换判定口径

不要"零人物"，改为只问两件事：**有没有可读文字**、**有没有出现"完整的人"**
（能同时看到头与躯干才算），只出现肢体局部不算。

```js
const origAuditKeyframe = vision.auditKeyframe;
vision.auditKeyframe = async function (pool, o) {
  const m = String(o && o.candPath || "").match(/shot_(S\d+)/);
  const id = m && m[1];
  if (!id || !PART_HINT[id]) return origAuditKeyframe.call(this, pool, o);
  const v = await vision.chatVisionJson(pool, { text: PART_AUDIT_TEXT, images: [o.candPath], maxPx: o.maxPx });
  return {                                   // 折算回 images.js 读得懂的两个字段
    has_text: !!v.has_text,
    text_content: v.text_content || "",
    human_count: v.complete_person ? 1 : 0,  // 只有"完整的人"才触发重画
  };
};
```

实测修复后：`局部镜门禁: 文字=无 完整的人=无` → 1 次通过，一致度 90。

---

## 坑位 10：影棚**站姿**参考图会压掉镜头里的一切姿态

### 判定

分镜写"坐在湿台阶上吃一碗冷汤圆"，出图是**站立的正面半身肖像**；
分镜写"坐在石桥栏杆上抱膝看河面"，出图是**两个并排站着的女人**（一黑一红两件旗袍）。
镜头描述被完全无视，且永远回到"居中站姿正面"。

### 根因（两层叠加）

1. `ref_body_*` 是**白底影棚站姿正面照**。模型对"人物参考图"的默认行为是连姿势一起复刻，
   而它并不区分"这张图是给你看脸和比例的"。
2. 加固层的 `COMPOSITION LOCK` 按景别给的措辞（medium = "从腰部以上取景"）
   **等于又提供了一个"半身站姿"的默认解**，与分镜里的坐/走/躺直接打架。

### 处置（三处一起改，缺一不可）

1. `compLock` 末尾追加：参考图是影棚站姿照，**禁止复制其站姿、正面机位与相机位置**；
   姿势一律以 SHOT 块为准，并明确"如果 SHOT 说她是坐着的，她就要坐在可见的支撑物上"。
2. 新增 **POSE LOCK**：从 SHOT 文本反推姿态，给一记强声明，例如
   `SHE IS SEATED — her hips are lowered onto the surface described … She is NOT standing.`
   坐 / 走 / 跑 / 躺 / 蹲 / 倚 各一条。放在锁的最前段（优先级高于参考图）。
3. `ONE_PERSON_LOCK` 补一句：**"不同颜色旗袍的第二位女性也算硬失败"**
   （实测模型会凭空补一个穿黑旗袍的女人来"配戏"）。

> ⚠ POSE 正则极易误伤：`lying abandoned`（口红掉在地上）、`rain running through the powder`
> 都会命中"躺"和"跑"。**只对有人物的镜头启用 POSE LOCK**，且动词规则要收紧
> （`she is lying` / `rushing out` / `she runs` 这类，而不是裸的 `lying` / `running`）。

### 与"不要写否定句"的关系

见下节——本轮实测**推翻了**"负向约束一定反噬"的绝对说法。

---

```
0. export PATH=...                                    ← 每次都做
1. plan.js 报 JSON parse failed          → plan-resilient.js 包装（重试直到 JSON 完整）
2. 报时长之和不符                         → brief 写死数量约束 + 包装器归一化时长
3. 首帧全是居中全身照                     → patch-refs.js 改写参考图策略
4. vision 超时且计数不动                  → 先 ping 探活；确认服务不可用则 --skip-refs --no-verify 续跑
5. （可选）--no-enhance 无助于构图问题；不要试图靠加更多否定词解决（见下）
6. 字幕：报 unknown argument / 字号调不动 → 查 SPEC 是否注册 + 调用处是否透传 fontSize（源码已修，见坑位 5）
7. ★ 重跑阶段 2 之前              → 先查 character_lock.json 的 _source；用 --force 前确认身份锁是设计真源（见坑位 6）
```

## 坑位 11：用户要"换个主角 / 换个视角"重做一版（重定向工作流）

### 判定

用户已经看过成片，说类似："全量重修复，但把主角换成穿旗袍的性感美女、20 来岁，以第三人称看整个故事场景。"

### 关键决策：**不要重跑 plan.js**

重跑分镜会把 36 个镜头的镜头语言、景别节奏、场景分配**整体洗一遍**，结果随机且要重新校验；
而用户的诉求通常只是"换个人、换个看法"，故事骨架是要保留的。
正确做法是**在原分镜上做外科手术**。

### 先量化渗透面（10 分钟内就能算清）

用关键词统计旧设定绑定了哪些镜头，"换主角"的真实工作量立刻可见：

```js
const KW = { 头盔:/头盔|helmet/i, 外卖:/外卖|delivery|rider/i, 电动车:/电动|摩托|scooter/i, ... };
for (const s of sb.shots) { const t = JSON.stringify(s); for (const k in KW) if (KW[k].test(t)) cnt[k].push(s.id); }
```

实测《秦淮灯下影》：外卖骑手设定只强绑定 **12 镜**（头盔 4 / 外卖 4 / 电动车 2 / 奶茶店 3 / 桥洞 3 / 盒饭 1），
**其余 24 镜是环境镜与情绪镜，本来就是通用的** —— 换主角的成本一下从"全部重做"降到"改 12 镜 + 换服装"。

同时统计 `characters_view`，判断"第三人称"这个需求是否已经满足
（实测原分镜已是 front 10 / back 8 / side 4 / three-quarter 5 / none 9，本就无 POV 镜；
用户真正的意思往往是"**每一镜都要能看到她本人**"，而不是改视角字段）。

### 执行顺序（可幂等重跑）

1. **备份**：把原 `storyboard.json` 存成 `storyboard_backup/storyboard.original.json`，之后每次从它复原再打补丁。
2. 改 `sb.character`（**唯一真源**）：`name` / `params.*`（尤其 `physique`、`hair_structure`、`wardrobe_layers`、`signature_actions`、`scene_affinity`）/ `identity_lock(_en)` / `persona`。
3. 逐镜改 **`keyframe_prompt`** —— 注意 `visual` 与 `subject_action` **不进生成提示词**（`buildKeyframePrompt` 只取 `shot.keyframe_prompt`，回退 `visual`），只改那两个等于白改。
4. **新提示词里不要重复描述整套服装**。服装由身份锁的 `wardrobe_layers` 单点注入
   （`localStateBlock` 的 "wardrobe in this shot"）；再在 SHOT 里写一遍会互相打架 ——
   原分镜每镜都写死 "denim jacket / delivery helmet"，正是它把服装钉死在旧设定上。
5. 空镜配额按需调：要"每镜都看到她"，就把 `characters_in_shot` 补上、空镜压到 3 个以内，并同步 `characters_view`。
6. 重跑 `rebuild-identity.js`（身份锁）+ 重制角色资产 + 重制场景锚点。
7. **重新校准加固层的参考图分流常量**：空镜集合变了，`REF_SCENE` / `REF_FULL` / `PART_HINT` 全都要跟着改，
   并复核"有主角的镜头是否都拿得到身份参考"（目标 0 风险镜）。
8. 全量重跑首帧 → 视频 → 拼接。

### 两个易漏点

- **场景锚点的文字描述里不能出现服装或人影词**。实测"出租屋里墙上挂着一件旗袍"这句，
  让无人场景锚点直接画出一个穿旗袍的女人 + 一片乱码文字块，门禁 25 分不合格。
  场景锚点描述要主动写 "completely deserted / empty of people"。
- **`scene_id` 可能被沿用错**：原分镜里"奶茶店"三个镜头挂的是 `SC4`（出租屋）的 id。
  重定向时顺手把 `scene_id` 归位，并重算每个场景的 `used_by`。

---

## 坑位 12：场景锚点提示词被"人物约束"污染（锚点自己长出旗袍 / 远处人影）

### 判定

场景锚点图里出现不该有的东西：墙上挂着一件旗袍、远处站着一个人影、天空是黄昏蓝调而不是深夜。
而且这些锚点一改，**所有复用该地点的镜头会跟着一起歪** —— 它是"凭空多一个女人"的隐藏源头之一。

### 根因

加固层（preload 脚本）里有**两处** `render.buildSceneRefPrompt` 包装：后加的那一处把 `FINAL_CHECK`
（内含 "a tall, slender, graceful young woman in a qipao / exactly one fully visible person in frame"）
追加到了场景锚点上。场景锚点本来要求 "EMPTY FRAME（零人物）"，两条指令直接互斥 ——
模型只好折中：画一个空场景，再挂一件旗袍、或补一个远处人影。

### 自检（两秒出结论）

```js
require("<preload 脚本的绝对路径>");
const render = require("<skill>/scripts/lib/render.js");
const p = render.buildSceneRefPrompt(scene, sb);
console.log(/FINAL CHECK/.test(p), /young woman|qipao/i.test(p)); // 两个都必须是 false
```

### 处置

- 锚点提示词里**绝不注入任何人物约束**；`FINAL_CHECK` 只属于首帧。
- **数据层也要清**：`scene.architecture` 里若写了 "Distant modern towers appear only as soft dark blocks..."，
  它会原样进提示词，锚点就长出玻璃高楼（实测 SC1）。必须先改 storyboard 数据，再谈提示词。
- 给锚点补 `SCENE HARD LOCK`：TIME（深夜）/ ERA（民国、一切可见物皆前现代）/ SURFACES（无文字）/
  SET DRESSING（场景里只有建筑与无生命道具）/ OCCUPANCY（绝对空无一人）。
- **用正面表述替代 "no X"**："every surface is bare and unmarked" 优于 "no calligraphy"；
  "the set contains only the architecture and the inanimate props named above" 优于 "no qipao"
  —— 写 `no qipao` 反而更容易画出旗袍。

---

## 坑位 13（本次最贵的一课）：传"全身立姿参考图"会让模型把主角复制成两个人

### 判定

门禁报告 `主角=2`（或 3），而分数并不低（85~95），提示词里早就写着 "exactly ONE woman"。
看图：画面里**两个穿同款旗袍、长相相似的女子** —— 一个是照着参考图摆的正面立姿，
另一个在执行 SHOT 里描述的动作（走路 / 奔跑 / 坐着）。

### 根因

`REF_FULL` 会把 `ref_body_*.png`（一张**清晰的单人全身立姿影棚照**）和面部特写一起喂给模型。
模型把这张全身图理解成"画面里的第二个人"，于是生成"参考里的她 + prompt 里的她"。
> 这不是"补了个路人配角"，而是**复制主角** —— 所以再怎么加"只有一个人 / 不要第二个人"都压不住，
> 因为模型认为自己画的就是"一个人"（参考里的那一个）。这条是本次唯一一个"加约束无效、只能改输入"的坑。

### 实测对照（同一批镜头、同一批提示词，只改参考图分流）

| 参考组合 | 镜头 | 结果 |
|---|---|---|
| full（面部 + 全身立姿） | S12/S18/S22/S34 | 首轮全部 `主角=2`；通过 1/6；平均 86.7 |
| fsc（面部 + 场景锚点） | 同上 | `主角=2` 基本消失，首轮全部 `主角=1`；平均 92.8 |
| face（仅面部） | S04 | 通过，配角=0 |

### 处置

- **全片人物镜头一律不传全身站姿参考**：`modeFor` 里让 `REF_FULL` 直接返回 `"fsc"`。
- 体型一致性交给文字锁（`PHYSIQUE_LOCK`），不要再指望全身图去锁身材。
- **非站姿镜头（坐 / 卧 / 蹲）尤其致命**：模型会同时画出"站着的参考人"和"坐着的 prompt 人"
  （S14 连续三次 `protagonist_count=2`）。
- 降级成 fsc 后 `主角=2` 消失，但会残留 `配角=1(醒目)`（门禁仍然判失败，通过 1/6、平均 92.8）。
  **再进一步：人物镜头连场景锚点也不传，只留面部特写一张** —— 即 `face` 模式。
  同一批 5 个难镜一次性 **5/5 通过、配角全 0、平均 92.4、零次自动重画**。
- 这个取舍要想清楚：地点一致性从"像素级复用场景锚点"退化为"`LOCATION_LOCK` 文字 + 全片统一风格"。
  在"每镜要看到女主、且画面里只能有女主一个人"的诉求下，**单人 > 地点像素级一致**；
  空镜（本来就无人）仍保留场景锚点，作为全片的地点基准。

### 一句话总结

**参考图解决"给不给"，但"全身立姿参考"解决不了"只给一个" —— 它本身就是一个可以变成第二个人的人。**

---

## 坑位 14（最高优先级 —— 一招解决坑位 4 / 10 / 13 的全部纠结）：参考图只用于比对，不用于生成

### 判定

你在"参考图分流"上不停地打地鼠：全身参考 → 复制主角；场景锚点 → 冒出醒目配角；
只留面部 → 全片又退化成同一张"居中正面半身像"。无论怎么调组合，总有新的构图塌陷。

### 根因

`images.js` 其实把两件事分得很干净，只是被同一个 `refs` 对象串在了一起：

```js
// 生成（第 318 行）：refs 进模型 → 模型把它当成"目标构图模板"
const rec = await assets.makeImage(pool, { prompt, refs: t.refs.urls, ... });

// 门禁（第 336 行）：refs 只用来比对身份
if (t.hasCharacter && t.refs.paths.length) {
  verdict = await vision.compareIdentity(pool, { refPaths: t.refs.paths, ... });
}
```

参考图一旦进入**生成**，它携带的构图信息就会压过文字里的景别 / 姿态 / 朝向锁；
而它进入**门禁**是纯粹有益的。两者本该分开。

### 处置（改动只有两行）

hook `assets.pickShotRefs`，**清空 `urls`、保留 `paths`**：

```js
if (mode === "face" && process.env.CMV_REF_GEN !== "on") {
  out.genUrls = out.urls;  // 留档便于调试
  out.urls = [];           // 生成端：一张参考图都不给
}
```

空镜（`scene` 模式）不必清 —— 它们本来就没有人物，场景锚点只贡献地点、不会把构图压错。

### 实测收益（《秦淮灯下影》同批镜头）

| 参考策略 | 结果 |
|---|---|
| full（面部 + 全身立姿） | 复制主角，`主角=2~3`；通过 1/6；平均 86.7 |
| fsc（面部 + 场景锚点） | 残留 `配角=1(醒目)`；通过 1/6；平均 92.8 |
| face（仅面部，**仍参与生成**） | 全片退化成同一张"居中正面半身像"，景别/姿态/场景全丢 |
| **face 且 `urls` 清空** | **通过 3/3、构图与姿态全部正确、零次重画**；首轮 36 镜 25/26 通过 |

### 为什么门禁不受影响

- `compareIdentity` 读的是 `refPaths`（本地路径）→ 面部锚点照旧比对，身份漂移依然拦得住。
- `render.buildKeyframePrompt` **根本不引用 `refs`**（`grep -n "refs" render.js` 无结果），
  所以清空 urls 不会让提示词出现"某张参考图如何如何"的自相矛盾。

### 一句话总结

**"给模型看图"和"验证模型画得像不像"是两件事。上游用同一个 `refs` 对象把它们串了起来 ——
拆开它，两个目标同时达成。**

### 2026-09-22「爱你老己」复现与补强：**这条必须是加固层的基线，不是可选项**

该项目的症状伪装成了"镜子问题"：SC1 场景锚点里有一面全身镜，同场景 8/10 镜出现"本人 + 镜中倒影"。
**把锚点里的镜子彻底去掉之后，S01/S04 仍然出现"同一个角色的一立一坐两个版本"**
（门禁报 `主角=2`，或"没有主角"），说明复制源不是镜子，而是**挂上去的人物参考图本身**：

| 配置 | S01 / S04 结果 |
|---|---|
| 锚点含镜 + 挂"全身参考 + 面部" | `主角=2` 或 `0`，反复重试不通过 |
| 锚点去镜 + 挂"面部 + 全身参考" | **仍然** `主角=2`（S01 一立一坐、S04 一坐一立） |
| 锚点去镜 + **生成端清空 urls**（门禁保留面部 paths） | **首轮 1 次通过，`主角=1 配角=0`，一致度 88** |

同时这张"复制"其实是**因祸得福的反证**：清空参考图后，服装完全由提示词决定，
于是修正过的身份锁（见坑位 36）立刻生效 —— 米白背心 / 麂皮短靴一次性到位。

**落进加固层时要注意三点**：

1. 分流要按镜头类型给 `mode`：人物镜 `face`（清 urls）；**空镜与物件微距给 `scene`**
   （保留场景锚点/风格板 —— 它们本来没有人，不会复制人，而且空阔远景正是最需要地点锚定的）。
   一律清空会把空镜的空间一致性也清掉。
2. 清空以后，**身份门禁是唯一的一致性保障**（`compareIdentity` 读 `refPaths`），
   所以 `--skip-refs` 必须保留、`identity_report.json` 必须看。首轮通过率约等于"文字锁写得够不够细"。
3. 局部镜（BODY-PART）清空后就是**零参考图纯 t2i**，正好与坑位 33 的"紧缩纯 t2i"合流。

---

## 坑位 15：LEAN 契约把"画面里恰好一个女人"套到了空镜上

### 判定

无人空镜（开场空景、天空镜）里凭空冒出一个女主，站在船头或河边；而她穿的是与全片设定无关的现代装。
门禁**不会**报错 —— 空镜走的是另一套"零人物"判定，视觉模型对小尺寸远景人物的漏检率很高。

### 根因

`leanHead(shot, hasChar)` 是按"有主角"写的，第 0/3 条写着
`the frame contains exactly ONE living person: the lead`。
而 LEAN 分支的条件是 `if (LEAN && !part) return leanHead(shot, hasChar) + ...` ——
**它只排除了局部镜（BODY-PART），空镜（`hasChar === false`）同样会走进来**。
于是模型忠实执行"画面里要有一个女人"，在纯环境镜里派了一个女主。

### 处置

让 `leanHead` 按 `hasChar` 分岔，空镜走另一套契约：

```
2. PEOPLE — NOBODY AT ALL. This is a pure environment frame of the location, with no living being in it:
   no person, no figure, no silhouette, no boatman, no boat passenger, no crowd, no hands, no reflection.
```

### 教训（比这个 bug 本身更重要）

**任何"按镜头类型分岔"的加固函数，都要先确认分岔条件覆盖了全部类型。**
这里漏掉 `hasChar === false`，结果通用契约恰好把最特殊的一类镜头（空镜）改坏了 ——
而门禁又查不出来，只能靠肉眼逐张开图。

### 检测

空镜首帧**必须逐张开图看**。`identity_report.json` 里没有它们，门禁报告"全部通过"这四个字在这里毫无意义。

---

## 坑位 16：`HTTP 400: prompt 超过 10000 个字符`

### 判定

重跑某批镜头时**全部**失败，报 `prompt 超过 10000 个字符 (request id: ...)`；
并且脚本最后那行 `IMAGE_USAGE=sk-xxx=0, sk-yyy=0, ...` **全是 0** —— 这是"一次成功调用都没有"的快速判据，
几秒钟就能把它和"网络抖动 / 限流"区分开。通常出现在"给某类特殊镜头补了几条锁"之后。

### 根因

加固层把锁块一路叠在提示词头上：
`compLock + partLock + ANATOMY + ONE_PERSON + ERA + LOCATION + timeLock + NO_TEXT + base + FINAL_CHECK`。

精简模式（`CMV_LEAN=1`）当初只覆盖了"有人物的普通镜"——条件写的是 `if (LEAN && !part)`，
**局部镜被排除在精简之外**，于是给它补两条锁（ERA / PART_FINAL_CHECK）之后就冲破了 API 上限。

### 处置

1. 让**所有**镜头都走精简契约：

```js
if (LEAN) {
  return (part ? leanPart(shot) : leanHead(shot, hasChar)) + "\n\n---\n\n" + base;
}
```

2. 加锁前后都做一次逐镜长度自检：

```js
for (const s of sb.shots) {
  const p = render.buildKeyframePrompt(s, sb, { hasCharacter: (s.characters_in_shot || []).length > 0 });
  if (p.length > 10000) console.log("超上限:", s.id, p.length);
}
```

### 教训

**精简模式必须覆盖全部镜头类型**（人物镜 / 空镜 / 局部镜三条路都要精简）。
这与坑位 15 是同一个病根：**分岔条件漏掉了一类镜头** ——
补锁时先问一句"这个分支到底覆盖了哪些镜头"。

---

## 坑位 17：改了首帧却忘了重跑视频 —— 成片里混进旧画面

### 判定

对 `03_clips/shot_XX.mp4` 抽出第一帧，发现它和磁盘上的 `02_images/shot_XX.png` **对不上**
（画面是修改前的版本）。最容易发生在"视频还在批量生成，回头又修了几张首帧"的时候。

### 根因

`videos.js` 在**启动时**就把全部镜头的首帧 URL 快照下来，之后中途替换 `shot_XX.png` 与它的 `.url`
sidecar，**不会影响已经启动的那一轮任务**。危险之处在于：视频文件的 mtime 看起来比首帧还新，
"按时间戳判断"会得出"已经用上新首帧"的错误结论 —— 只有抽帧看图才靠得住。

### 处置

- 任何首帧改动之后，**按 id 补跑对应视频**：

```bash
node videos.js --project <dir> --only S13,S19,S32 --force --concurrency 3
```

- 收尾检查用**抽帧**，不要用时间戳：

```bash
for id in S13 S19 S32; do ffmpeg -y -i 03_clips/shot_$id.mp4 -frames:v 1 -q:v 2 vf_$id.jpg; done
```

再把这几张抽帧图与磁盘上的 `shot_XX.png` 并排看一眼。

### 教训

**视频阶段的输入是"首帧 URL 的快照"，不是"磁盘上的当前首帧"。**
流水线里任何"回头改上游产物"的动作，都要显式补跑下游，别指望它自动感知。

### 这条坑会反复踩（本项目就踩了两次）

第二次是"27 段视频已经跑起来之后，才把 S02 的首帧换成清理版"。
由于 S02 是那一轮第 1 个完成的镜头，它**必然**用的是旧首帧。

**规则固化：批次一旦启动，就维护一份"补跑清单"。**
凡是在批次运行期间动过首帧的镜头，全部记进清单，批次结束后逐个 `--only ... --force` 补跑。
不要依赖记忆，也不要依赖 mtime。

---

## 坑位 18：**通用"地点锁"会把开阔远景压成狭窄巷道**

### 判定

分镜写的是"极远景俯拍的开阔石砌河堤 + 薄雾 + 远处低伏瓦脊"，成片里却是一条**狭窄的青石巷道**。
门禁照常通过（人数 1、一致度 85），只有独立内容质检才发现"场景整体错误"（严重度 9）。

### 根因

精简契约（`leanHead`）里有一条**全片通用**的 PLACE 行：

```
5. PLACE — Jiangnan Nanjing, the Qinhuai district: whitewashed plaster walls, dark grey clay-tile
   roofs with upturned eaves, red silk lanterns, wet grey stone paving.
```

"白墙 / 灰瓦 / 红灯笼 / 湿石板路"这组词在语义上**强烈指向临水窄巷**。
它作为全片地域锚是成立的，但一旦镜头要的是"开阔河堤大远景"，两者就直接打架 —— 模型选了更"典型"的那一个。

类似的隐性冲突还有时间：场景层写 `Deep night`、个别镜头写 `early morning`，也会互相抵消。

### 处置

为开阔远景镜单独提供一条"开阔"地点锁，**不要试图在通用锁里加"有时也可以是开阔的"这种兼顾式表述**（模型不会做这种条件判断）。

```js
const OPEN_PLACE_SHOTS = new Set(["S35"]);
const PLACE_OPEN =
  "PLACE — seen from very far away: a VAST, WIDE-OPEN stone river embankment running horizontally " +
  "right across the frame, low pale mist drifting over it, the far bank barely visible. " +
  "This is an expansive open vista — NEVER a narrow lane, never a close alley, never a walled courtyard.";
function placeLine(shot) { return OPEN_PLACE_SHOTS.has(shot.id) ? PLACE_OPEN : PLACE_BASE; }
```

实测：地点判定从"完全错误"变成"高度吻合，仅剩极远景下不可辨的细节"，严重度 9 → 2。

顺带把 `keyframe_prompt` 里也补上"NOT a narrow lane, NOT a close alley"（同一句话在两处都写，比只写一处稳）。

---

## 坑位 19：**"服装清单"会覆盖镜头里的**物理状态**（要求赤足却画成穿鞋拎包）

### 判定

分镜：「从背后拍她走远，手里提着黑色缎面高跟鞋，赤足踩在湿石上，另一只手把长裙幅拎离地面」。
成片：**穿着鞋**、手里**拎着包**、地上还多出一把伞（严重度 8）。

### 根因

身份 / 服装块里必然带着 `footwear: black satin stiletto heels with thin ankle straps` 和
`accessories: ... a small beaded evening clutch, a black oil-paper umbrella`。
模型读到"细高跟"就让她穿上，读到"手袋 / 油纸伞"就顺手给一件 —— 而 SHOT 块里的
`barefoot / carrying her heels in one hand` 优先级不够，压不住这份装备清单。

注意这里**不能靠删服装清单解决**：清单是跨镜身份一致性的来源，删了别处就会漂。

### 处置

加一条**最高优先级的物理状态覆盖句**，把它排在契约最后（模型对"最后出现的强声明"更敏感），
并且明确点名要清掉的物件：

```js
const BAREFOOT_RE = /barefoot|carrying (?:her|the) [a-z ]{0,24}heels|heels in (?:one|her) hand/i;
function stateLine(shot) {
  if (!BAREFOOT_RE.test(String(shot.keyframe_prompt || shot.visual || ""))) return null;
  return "STATE OVERRIDE (highest priority — this beats the wardrobe list above): HER FEET ARE " +
    "COMPLETELY BARE. Both high-heeled shoes are OFF her feet and carried together in one hand. " +
    "She carries NO handbag and NO clutch. She holds NO umbrella. Nothing lies on the ground beside her.";
}
```

实测：严重度 8 → 2，一致度 75 → 100，动作与服装全部正确。

### 教训

**跨镜一致性的信息（服装 / 配饰清单）与单镜状态（此刻穿没穿、手里拿什么）是两种东西，必须分层写。**
凡是"这个镜头里她暂时不是常规状态"的设定 —— 赤足、脱外套、解下发簪、卷起袖子 ——
都要额外补一句状态覆盖，不能指望模型自己从 SHOT 描述里推断。

---

## 坑位 20：**只想重画 2 镜，却连带重制了全部角色素材与场景锚点**

### 判定

```
node -r harden.js images.js --project <P> --only S29,S35 --force --keys-file <keys>
```

日志里出现 `[1/3] Character identity assets ...` 与 `生成 4 张场景锚点图` ——
它把**设定表（2 张候选）、面部参考、5 张全身参考、风格板、4 张场景锚点全部重画了一遍**。

### 为什么危险（不只是浪费额度）

1. **门禁基准在项目中途漂移**：重制后的 `ref_face.png` / `ref_charsheet.png` 与
   已定稿的 24 张首帧不再是同一个锚点，此后任何复检的一致度分数都不可比。
2. **场景锚点可能变差**：本次重制的 SC1 锚点就带上了瑕疵（远处船舱浮出一个模糊红衣人影，评分从 92 掉到 82）。
   虽然该锚点只服务 3 个空镜、而空镜已定稿，但项目文件已经不如从前干净。

### 处置

**定点重画必须带 `--skip-refs`**：

```bash
node -r harden.js images.js --project <P> --only S29,S35 --force --skip-refs --keys-file <keys>
```

`--skip-refs` 会复用磁盘上已有的设定表 / 角度图 / 场景锚点，只跑被点名的镜头。

### 事后补救

若已经误重制：**不要再连锁重跑**。先确认这批锚点是否真的劣化（看门禁评分与缺陷描述），
空镜若已定稿就不必回炉；把结论如实写进交付报告即可（"该锚点是本步骤中被动重制的，因空镜已定稿故不影响成片"）。

### 一句话总结

**`--force` 的语义是"忽略磁盘已有产物"，不是"只重画我点名的那几个"。**
任何定点操作都要同时交代"哪些上游产物允许被动"。

---

## 坑位 21：**"给参考图就退化构图、不给参考图就脸乱"——这是个二元陷阱**

### 判定

用户反馈"很多画面人物面部错乱"。先量化：对全部可辨面部的镜头读结构化面部指纹后聚类，
**23 镜聚成 18 个不同的"脸"** —— 几乎没有两镜是同一个人。
最刺眼的是 `hair_length`（盘发 17 / 齐肩 3 / 短发 2 / 长披 1）与 `age_band`（early20s 14 / mid20s 8 / late20s 1）。

但此时**门禁仍在给高分**（各镜与设定表 82–100）。原因是：

> 「单镜 vs 设定表」的比对**结构上看不见跨镜不一致**。
> 每镜都能拿 80+ 分，而它们彼此之间差异巨大。

**这是上一轮踩坑 14 的代价**：为了让构图指令生效，把参考图从生成阶段整个摘掉了
（`out.urls = []`，只留 `out.paths` 供门禁比对）。构图自由度换回来了，身份锚定也一起丢了。

### 为什么"再挂回参考图"解决不了

用视觉通道反读全部身份锚资产，`composition_risk` **无一例外全是 high**：

| 资产 | 内容 | 会被复制成 |
|---|---|---|
| `ref_face.png` | 居中半身肖像 | 正面半身像 |
| `ref_body_front.png` | 居中全身站姿 + 纯灰背景 | 全身站立照 |
| `ref_charsheet.png` | 多格拼贴（含全身三视图） | 多格拼贴 / 全身 |

**参考图是"身份 + 构图"的双载荷。** 只要它是一张正常构图的人像，模型就会把构图一起抄走。
**不存在"只带脸、不带构图"的人像参考图** —— 这条路走不通，别在上面反复试。

### 处置：两阶段「定点身份校正」

把构图与身份拆到两次调用里：

1. **阶段 1（已有产物）**：纯文字生成首帧 —— 构图/景别/姿态/场景已逐镜验收
2. **阶段 2（本坑位新增）**：把「阶段 1 的首帧」当**内容源**、「面部锚」当**身份源**，
   发一次**编辑型指令**，只替换身份（完整可控文案见 `out/_qa/reface-all.js` 的 `PROMPT`）：

```
TASK: IDENTITY CORRECTION. This is an image EDITING job, not a fresh generation.
IMAGE 1 is the target frame — the authority for EVERYTHING except her identity.
IMAGE 2 is the identity reference — the authority for her identity ONLY.
Reproduce IMAGE 1 with maximum fidelity: framing / shot size / lens / perspective / crop /
head angle / gaze / pose / costume / accessories / environment / props / lighting / grade /
grain / aspect ratio, and the same number of people.
Replace ONLY the identity: bone structure, chin, eyebrows, eyes, eyelids, eye spacing,
nose, lips, face shape, apparent age, make-up, and the hairstyle of IMAGE 2.
Keep the head angle, gaze and expression already in IMAGE 1. Do not add or remove any person.
If anyone else appears, keep them exactly as they are and keep them out of focus.
```

实测（4 镜 A/B）：**构图/姿势/服装/场景 4/4 全保、人数不变、身份 95/96/95/95、拒用 0**。
**画幅 2624×1472 与原图逐像素对齐** —— i2i 继承输入画幅，`ratio` 参数被忽略，**不会裁切**。
视频端复核：S36 由「同镜三帧不是同一个人」变为「三帧同人 + 与设定 98 分」。

### 落地脚本

`out/_qa/reface-all.js` —— 遍历所有含主角的镜头批量换脸，自动跳过局部镜
（`S03/S05/S08/S13/S17/S19/S32`，它们要的是"不要出现人"），
原图先备份到 `_qa/pre_reface/`（幂等，可回滚），并校验新旧画幅一致才落盘。

### 验收指标要选对

**不要用"指纹簇数"当验收指标**。指纹里 `age_band` / `jaw` / `brow` / `bangs` 这类字段
受评估模型的主观判断影响很大（同一张脸换个光线换个景别就判得不一样），簇数会给出误导结论。

要盯**客观字段**：修复后 `face_shape` **oval 26/26**、`eyes` **almond 26/26**、
`eye_spacing` **normal 26/26**、`nose` **slim_straight 26/26**（全部 100% 统一），
`hair_length` 由 4 种收敛到 2 种，与设定表的"同一人"评分 85–100（均值 92.6）。

---

## 坑位 22：**局部镜只写"no face"不够，要说清画框切在哪里**

### 判定

S17 分镜是「特写：她的双手互搓取暖，指尖冻得泛红，腕上一只翡翠镯」，画面里**不该有头和脸**。
实际画成女性面部特写（嘴、下巴入画，严重度 10）。
即便 PART 契约里已经写了 `no face, no head, no torso`，模型照样把下巴带进画面（10 → 5）。

### 处置

**光否定"结果"没用，要直接给出"构图几何"** —— 说清画框的上边缘落在哪儿、上方那部分画的是什么：

```
only her two hands, pressed together and rubbed for warmth, fingertips reddened by the cold,
one pale jade bangle loose at her wrist — the hands occupy the LOWER THIRD of the frame
while the upper two thirds are filled by the lacquered table top and the soft unfocused
glow of a candle; her chin, lips, neck, head and shoulders all lie outside the frame
and must not appear
```

实测：严重度 10 → **0**，`has_face_or_head=false`、`has_person=false`。

**原理**：给模型一个"填满画面上方"的具体物件，它就没有位置再塞一个头。
这比单纯说"不要出现头部"有效得多。

---

## 坑位 23：**背景里"多余且面部清晰"的配角，是"面部错乱"观感的放大器**

### 判定

`person_count` 只回答"几个人"，还要看**这些人的脸清不清楚**。本轮复核结果：

- S02 画舫内 **7 个人**，两侧男性面部清晰 → 观感上就是"一堆不认识的脸"→ **算问题**
- S07（5 人）/ S16（3 人）：分镜本身就写了"背景里衣香鬓影的游人""卖热食的旧推车" → **合理**
- S22 雨中路人 / S35 远景背对者 / S36 镜中倒影 → **合理**
- S16 摊主是模糊的、S35 背对不可辨 → **不算问题**

**只有"既多余、又清晰"的才是问题。** 判断时务必回到分镜原文，别只看数字。

> **本项目在这条上翻过一次车，值得记住。**
> S02 的分镜原文写着 `Blurred silhouettes of well-dressed guests in the background`
> —— 背景有**虚化**的华服宾客本来就是设计。但复检时我用了"她必须独自一人"的自造口径，
> 把一段**符合分镜**的画面判成了 `fail`，还为此白白重跑了两轮视频。
> **自造验收标准比缺陷本身更贵。** 每次复检前，先把分镜原文里跟"人"有关的字句摘出来当 rubric。

### 处置

不要重画（会丢掉刚校正好的身份），直接发一次**背景清理**编辑指令（脚本：`out/_qa/edit-img.js`）：

```
TASK: BACKGROUND CLEANUP. This is an image EDITING job.
Keep EVERYTHING identical: framing, crop, composition; the leading woman (face, hairstyle,
costume, pose, jewellery) completely unchanged; the interior, lanterns, woodwork, lighting,
colour grade, grain.
Change ONLY this: remove every other human figure. The interior must contain ONLY her —
no patrons, no guests, no additional faces, no silhouettes of people anywhere.
Where those figures stood, continue the existing panelling, drapery and deep shadow exactly
as they would look with nobody there, blending seamlessly into the surroundings.
Do not crop, do not zoom, do not reframe, do not alter the leading woman.
```

实测：人物 **7 → 1**，构图/主角/场景全保，无涂抹重影，可直接用于成片。

---

## 坑位 24：**首帧干净 ≠ 成片干净 —— i2v 会在镜头内部自己长出新瑕疵**

### 判定

首帧质检（`qa-final.js`）全过，用户看片仍然能指出问题。典型症状：

- 同一镜头里**脸中途换人**：首帧是 A，末帧变成 B
- 某一帧眼睛**发出异常金光**、眼角**长出纹身状线条**
- 中/末帧**凭空多出一个背景人物**，而首帧明明只有主角
- 首帧干净，第二帧起人物开始"融化"

### 根因

图生视频是**独立的一次生成**，首帧只是它的起点，不是它的约束。
"首帧质检"只能证明**起点正确**，结构上覆盖不到镜头内部的时间轴。
本项目实测：S24 金眼、S34 眼角线条、S02 多出背景女子，**三处首帧经查全部干净**，
问题 100% 出在 i2v 阶段。

### 处置

1. **每镜抽三帧**（首 / 中 / 末），用同一套 rubric 做「镜内一致性」核验
   （脚本 `out/_qa/verify-reface-video.js`，问法形如"三帧是否为同一个人"，并给出与身份锚的一致分）。
2. 发现瑕疵**先别改首帧** —— 首帧是干净的，改它等于白费。
   直接 `--force` 重跑该段视频，i2v 的随机性通常一次就过：

```bash
node videos.js --project <dir> --only S02,S24,S34 --force --concurrency 2
```

3. 只有当**同一瑕疵连续两次出现**时，才回头怀疑首帧。

### 成本与收益

重跑 1 段 ≈ 4 分钟（含排队）；26 镜全量三帧核验 ≈ 3.5 分钟。
成本极低，却抓出了"镜内换人 / 金眼 / 多出背景人"三类**首帧质检永远看不见**的问题。

**这是"用户说脸不对"这类反馈的最终验收手段 —— 没有它，交付前的"全绿"是假的。**

---

## 坑位 25（隐蔽性最高）：**首帧全换成新形象了，成片里还是旧形象 —— 缓存的中间片没跟着重建**

### 判定

- `02_images/shot_*.png` 打开看**已经是新形象**（换脸后的）
- `03_clips/shot_*.mp4` 也是新的
- 但**成片里（以及 `04_build/norm/n_*.mp4`）仍是旧形象**
- 用户只点名了**其中一两镜**，因为那几镜旧版偏差最大（例如旧版直接是"牛仔外套现代女孩"这种人设外的画面），
  其余镜头只是"同样构图、换脸前的那张脸"，被构图相似性掩盖了

**光看目录时间戳会误判**：`norm/` 里每个文件都存在、都有合理大小、帧数也对，肉眼完全看不出它已经过期。

### 根因（`scripts/assemble.js` 的归一化复用条件）

```js
// 旧代码 —— 只比几何，不比源
if (!args.force && fs.existsSync(out)) {
  const pr = ff.probeMedia(out);
  if (pr.width === canvas.width && pr.height === canvas.height && pr.frameCount === wantFrames) {
    normFiles.push(out);
    agnes.log(`      [skip] ${s.shot.id} already normalised`);   // ← 静默复用陈旧产物
    continue;
  }
}
```

微调首帧（换脸 / 修构图）时，**clips 会被重渲染，但画布尺寸和帧数分配都不变**。
于是条件全部成立，那批在换脸**之前**生成的 `norm/*.mp4` 被整批 `[skip]`，
**旧形象就这样一路带进了成片**，而且流水线日志里全是 `[skip] already normalised`，看起来一切正常。

### 处置

**1) 已修源码** —— 复用条件必须把"源文件新鲜度"也算进去：

```js
if (!args.force && fs.existsSync(out)) {
  const pr = ff.probeMedia(out);
  let fresh = true;
  try { fresh = fs.statSync(out).mtimeMs >= fs.statSync(s.file).mtimeMs; } catch (_) { fresh = false; }
  if (pr.width === canvas.width && pr.height === canvas.height
      && pr.frameCount === wantFrames && fresh) {
    normFiles.push(out);
    agnes.log(`      [skip] ${s.shot.id} already normalised`);
    continue;
  }
  agnes.log(fresh ? `      [redo] ${s.shot.id} geometry mismatch -> re-normalising`
                  : `      [stale] ${s.shot.id} source clip is newer than the intermediate -> re-normalising`);
}
```

同理 `videos.js` 也加了**非破坏预警**：首帧 `mtime` 比成片新时打印
"首帧改过但镜头没重拍"，把这类静默失效变成显式告警（不改变跳过行为、不多耗额度）。

**2) 存量项目一次性全量重建**（本次做法）：

```bash
node assemble.js --project <P> --transition dissolve --force   # 转场参数必须与上一版一致
node subtitles.js --project <P> --style gold                    # 成片换了，字幕必须重烧
```

**3) 一定要做"成片级"复核，而不是"素材级"复核** —— 这是发现本坑位的唯一手段：

```bash
node out/_qa/verify-final-frames.js    # 按每镜槽位中心时间从「成片」抽帧
```

再与 `02_images/shot_*.png` 并排比对。只想快速定位问题范围时，用
"**逐镜比对 `norm/` 首帧 vs `03_clips/` 首帧的平均像素差**"即可一眼分出陈旧与新鲜
（本次结果：27 / 36 陈旧；判定为"一致"的 9 镜正好是**无需换脸、本来就没重渲染**的镜头 —— 这反过来验证了根因）。

### 通用教训

> **任何"已有产物就跳过"的缓存判断，都必须把源文件时间戳纳入条件。**
> 只比对几何（尺寸 / 帧数 / 时长）的缓存 = 把"改了上游没重跑下游"变成**静默的数据损坏**。
> 交付前请务必做一次**从成片反向抽帧**的复核，素材目录全绿不代表成片是对的。

---

## 处置顺序总览

```
0. export PATH=...                                     ← 每次都做
★ 首帧的构图/姿态/景别怎么调都不对            → 参考图只比对不生成：pickShotRefs 清空 urls（坑位 14）
1. plan.js 报 JSON parse failed           → plan-resilient.js 包装（重试直到 JSON 完整）
2. 报时长之和不符                          → brief 写死数量约束 + 包装器归一化时长
3. 首帧全是居中全身照                      → 参考图分流 + COMPOSITION LOCK（坑位 4）
4. vision 超时且计数不动                   → 先 ping 探活；确认服务不可用则 --skip-refs --no-verify 续跑
5. 字幕报 unknown argument / 字号调不动     → 查 SPEC 是否注册 + 调用处是否透传 fontSize（源码已修，坑位 5）
6. ★ 重跑阶段 2 之前                        → 先查 character_lock.json 的 _source（坑位 6）
7. 预加载脚本报 MODULE_NOT_FOUND            → -r 一律传绝对路径（坑位 7）
8. 打开 ref_face.png 发现是全身照           → buildFaceRefPrompt 已修 + 重画面部锚点（坑位 8）
9. 局部镜反复"空镜中出现 1 个人"             → hook auditKeyframe 换判定口径（坑位 9）
10. 出图永远是站立正面肖像／凭空多一个女人   → compLock + POSE LOCK + 单人锁（坑位 10）
11. 用户要"换个主角/视角重做一版"            → 走重定向工作流，别重跑 plan.js（坑位 11）
12. 场景锚点长出旗袍／人影／现代高楼          → 锚点提示词不得含人物约束 + 清 scene 数据（坑位 12）
13. 门禁报"主角=2"且怎么加约束都无效          → 弃用全身立姿参考，REF_FULL 降级为 fsc（坑位 13）
14. 构图/姿态/景别怎么调都不对                → 参考图只比对不生成：pickShotRefs 清空 urls（坑位 14）
15. 无人空镜里凭空站出一个女主                → leanHead 按 hasChar 分岔，空镜走 NOBODY AT ALL（坑位 15）
16. 某批镜头全部失败且 IMAGE_USAGE 全为 0      → 提示词超 10000 字符上限；让局部镜也走精简（坑位 16）
17. 改了首帧成片里还是旧画面                  → 按镜 --only ... --force 补跑视频（坑位 17）
18. 开阔远景被画成狭窄巷道／场景整体错         → 为开阔镜单独写"开阔地点锁"（坑位 18）
19. 要求赤足却穿鞋、手里多出一个包            → 加最高优先级"物理状态覆盖句"（坑位 19）
20. 只重画 2 镜却连带重制了全部参考资产        → 定点重画一律带 --skip-refs（坑位 20）
21. 给参考图就退化构图／不给参考图脸就乱        → 两阶段「定点身份校正」：首帧当内容源+面部锚当身份源（坑位 21）
22. 局部镜只写 no face，下巴照样入画            → 用构图级描述说清画框切在哪（坑位 22）
23. 背景"多余且清晰"的配角放大面部错乱观感      → 发一次背景清理编辑指令，不要重画（坑位 23）
24. 首帧全过，成片仍有金眼／换脸／多出人物      → 抽三帧做镜内一致性核验，然后 --force 重跑该段（坑位 24）
25. 首帧/clips 都是新的，成片里却是旧形象        → norm 中间片被"只比几何"的缓存跳过了；--force 全量重建 + 从成片反向抽帧复核（坑位 25）
26. 空镜/影子镜画进人物；微距镜长出手；天空镜画成街景 → 三层矛盾：空镜误挂 FINAL_CHECK / 局部镜误挂人物参考 / 锚点视角拽构图；修 harden 三处 + 物件镜走"底图→编辑"两步法（坑位 26）
27. 空镜出图是"物件浮在上半 + 风格板风景贴在下半"的拼贴 → 微距/特写空镜断掉**全部**参考图（含风格板）：`CMV_REFMODE="Sxx=none"`（坑位 30）；宽景 establishing 才留锚点
28. 空镜只跑一次、门禁判失败也照收 → images.js 空镜重试（源码已修，坑位 31）
29. 局部镜的视频被 i2v 推成"完整人物" → 视频锁加 BODY-PART 档（只许那一处局部存在与运动，禁脸/头/躯干/拉远）
30. 双色调片子里空镜出"左右硬接缝双联画"（左冷都市/右暖水乡） → GRADE 与 timeLock 的两段式"都市线…故乡线…"被注入每镜；空镜改**单色调**时间光锁 + 剥掉注入 GRADE + 加 `NO_SPLIT_LOCK`（坑位 32）
31. 空镜加满文本锁仍出人、且被拉成全景 → 场景锁里的实景词是负债；改**紧缩纯 t2i**（删净场景词 + 微距句式 + 物件清单），生成后过 `auditKeyframe` 自检（`human_count=0 && !has_text && !is_collage_or_sheet_layout`）（坑位 33）
32. Windows 图形会话里 PowerShell/Bash stdout 恒为空、`ls/dirname` 找不到 → 用"落盘 runner"（子进程自己写 log 文件，再用 Read 读）（坑位 34）
```

## 定点修复的最小动作链（本轮实测，约 25 分钟跑完）

```bash
# 1) 只重画被点名的首帧（务必带 --skip-refs）
node -r harden.js images.js --project <P> --only S29,S35 --force --skip-refs --keys-file <keys>
# 2) 独立复检这两镜（不要只看门禁分数）
node out/_qa/qa-final.js "S29,S35" round2
# 3) 补跑这两段视频（首帧 URL 是启动时快照的）
node -r harden.js videos.js --project <P> --only S29,S35 --force --keys-file <keys>
# 4) 重新拼接（转场/参数必须与首次组装完全一致，否则全片观感会变）
node assemble.js --project <P> --transition dissolve --fade --thumbnails 12
# 5) 重烧字幕（成片换了，旧字幕文件必须重生成）
node subtitles.js --project <P> --style gold
# 6) 四合一核验：画幅/帧数/音频 MD5/字幕检出
node out/_qa/final-verify.js
```

> 第 4 步的两个坑：`assemble.js` **不认 `--keys-file`**（它不调 API），传了会直接
> `ERROR: unknown argument`；而转场 / 淡入淡出这些参数**必须与上一版一致**，否则等于换了个片子。

## "脸不对"类反馈的标准动作链（本轮实测）

触发场景：用户看完成片后说"很多人物的面部错乱"。

```bash
# 1) 量化：每镜抽 首/中/末 三帧，读结构化面部指纹，跨镜聚类
node out/_qa/diag-face.js "" final          # -> face_diag_final.json
#    看"发型 / 年龄感 / 下颌"等字段的取值种类数 —— 种类数就是"这部片里有几张脸"
# 2) 反读参考资产的构图风险（参考图是"身份+构图"双载荷，见坑位 21）
node out/_qa/describe-ref.js
# 3) A/B 验证换脸方案（先 4 镜，别一上来全量）
node out/_qa/exp-reface.js "S04,S15,S36,S22"
node out/_qa/eval-reface.js "S04,S15,S36,S22"   # 查"构图保持度 + 身份一致度"两项
# 4) 全量换脸（原图自动备份到 _qa/pre_reface/，可回滚）
node out/_qa/reface-all.js --conc 3
# 5) 首帧指纹复检
node out/_qa/face-id-only.js "<26 镜>" after    # -> face_id_after.json
# 6) 逐镜三帧稳定性核验（必须做，见坑位 24）
node out/_qa/verify-reface-video.js "<27 镜>"
# 7) 生成并排对比证据（给用户看）
python out/_qa/make-face-compare.py
```

### 要点

- 换脸指令必须写成 **"IMAGE 1 是除身份之外一切事项的权威"**，并逐项列出要锁的东西：
  构图/裁切、头部角度与视线、姿势与手位、服装纹样配饰、环境道具、光线色阶颗粒、画幅、人数。
  最后一句收成"**同一颗镜头，只是换上了正确的演员**"。
- 身份评分要拿**面部锚**当基准，**不要拿"上一张自己"当基准**（那只能证明"没跳变"，证明不了"是设定的人"）。
- `face_id_after.json` 里的**脸型 / 眼型 / 鼻型 / 眼距**这类**客观字段**是好指标
  （本项目 26/26 全部统一）；而"指纹簇数"会随评估模型的主观判断波动，
  **不要拿它当结论**，用并排接触表说话。
- 局部镜（只拍手/脚/影子）要**排除在换脸清单之外**，但它们仍需单独重跑视频，因为首帧重画了。

## 两条反直觉的注意点

- **否定句不是禁忌，但必须否对"对象"。** 上游技能原话是"不要写'不要全身照'，负向约束会反噬"，
  本轮的实测把它修正为：**光否定"结果"没用，要否定"干扰源"。**
  单纯堆 "no full body" 确实无效；但写明"参考图是影棚站姿照，**禁止复制它的站姿、正面机位与相机位置**"，
  再加一句"她现在是坐着的，NOT standing"，就能把姿态掰回来（见坑位 10）。
  一句话：参考图组合解决"给不给"，姿势声明解决"听谁的"——两件事都要做。
- **`--force` 只影响首帧循环，配合 `--skip-refs` 时不会重建参考图**，
  所以"重生成 36 张首帧"只要 6 分钟左右，不要因为怕重建素材而不敢重跑。

## 交付时必须如实告知用户的三件事

1. 哪些镜头**没有过视觉一致性门禁**（因服务不可用而跳过），`identity_report.json` 覆盖多少。
2. 哪些**场景锚点被丢弃**（如"秦淮河夜"因画面必然出现游客而 3 次未过无人门禁），
   其相关镜头回退到了文字描述。
3. 哪些镜头**景别与分镜不完全一致**——列表给出，让用户决定是否 `--only` 重修。

---

## 坑位 26：空镜被画进人物 —— 三层矛盾叠加（2026-09-22 实测）

**症状**：D2 重出 36 镜后，用户指出 S01/S13/S26/S28"服装不对"——这四个都是无人物镜
（全景／影子／物件微距／天空），但画面里全站着一个旗袍女人；S13 更是"无头人偶"。
首轮日志里 QA 其实每次都判了"人物数=1 → 未达标"，重试 3 次耗尽后**把不合格图当最终结果收下**，
第二轮又因"文件已存在"被 `[skip]` 跳过——两道机制联手把错误固化。

**三层根因（缺一不会复发，全中必翻车）**：

1. **空镜误挂 FINAL_CHECK**：`tail()` 对"非局部镜"一律挂 FINAL_CHECK，而它第 (1)(2) 条是
   "一位 175cm 黑金旗袍美女 / 画面中恰好一个完整可见的人物"——**直接命令模型画一个人**，
   与 EMPTY FRAME RULE 自相矛盾，重试永远不可能通过。
   修法：新增 `emptyFinal`（FULL/SHORT 各一版），空镜专用终检，绝不出现任何人物要求。
2. **带角色的局部镜误挂人物参考**：S13（影子镜）`characters_in_shot=["沈棠"]` →
   images.js 走 hasCharacter 分支挂全身+面部参考 → PART CHECK 压不住参考图，必出人形。
   修法：harden 导出 `globalThis.CMV_PART_SHOTS`，images.js 对局部镜**不挂人物参考、不传 identity**
   （identity 为 null 时 render.js 也不会追加"IDENTITY RE-CHECK 同一人"）。
3. **场景锚点视角拽构图**：S26（物件微距）挂后巷锚 → 长出悬空大手；S28（天空为主）挂街景锚
   → 连出街景。修法：harden 导出 `CMV_NO_SCENE_ANCHOR`，images.js 对这些镜**不挂锚点、回退风格板**。

**即便修完三层，"口红+花"这类美词语义仍会诱导模型画美人（连续 3 版：假人/现代装/大手）**。
此时文本已无杠杆，改用**两步确定性生成**（绕开流水线，直接调 agnes）：

```
step1  纯底图：只写"湿石板雨夜微距/纯天空+屋脊剪影"，提示词里【完全不提】口红等诱导词
step2  编辑调用（i2i）：以底图为内容源，指令"加入半截口红与白兰花，其余保持不变，禁止任何人手"
```

实测两镜一次通过。脚本范式：`_qa/s26-build.js`、`_qa/s28-build.js`（generateImage 纯 t2i →
读 `.url` 旁挂 → generateImage 编辑 → copy 回 `02_images/shot_*.png` + `.url`）。

**通用教训**：`auditKeyframe` 门禁"重试耗尽后照收不合格图"是静默失败源——收图前应检查
最后一次 QA 是否达标，不达标应在日志顶格告警；第二轮批量补齐时 `[skip]` 只看文件存在，
等于替首轮的失败兜了底。凡"重试 N 次仍失败"的镜头必须进显式失败清单，而不是带病交付。

## 坑位 27：阶段三（i2v）提示词完全裸奔 —— 视频端必须单独加锁（2026-09-22 实测）

**症状**：harden.js 只 patch 了 `render.buildKeyframePrompt`（图像阶段）。阶段三的提示词
直接来自 `shot.video_prompt`，**没有任何身份/服装/无字锁**。i2v 在 8~12 秒里会自由漂移，
本轮 36 镜首跑即中三类招：

- S12：凭空长出**带汉字的绿色霓虹灯牌**（首帧根本没有，违反 NO TEXT）
- S21：手中凭空出现**发光球体道具**（首帧手里是空的）
- S24：末帧**眼睛变成金色发光**（义眼感，EYE LOCK 一版措辞还没拦住，换"ABSOLUTE"级才修掉）

**修法（不要去 patch videos.js 内部函数——`lintMotionPrompt` 不在 render 导出里，hook 不到）**：
直接改 storyboard 的 `video_prompt`（先备份 `storyboard.pre-videolock.json`），按镜头类型分流注入：

- 人物镜 → `IDENTITY LOCK`（脸/发型/妆容/旗袍/高挑沙漏身材与首帧逐项相同 + 只许运镜与既定动作）
- 空镜（与图像阶段 NO_HUMAN 集合一致）→ `EMPTY FRAME LOCK`（全程禁任何人形/剪影/反射）
- 通用 → `NO TEXT LOCK`（无字/水印/字幕/logo）
- 镜头级禁令（重跑仍有残留时）：`NEON BAN` / `PROP LOCK` / `ABSOLUTE EYE LOCK`，措辞要
  "ABSOLUTE / overrides everything"级并写明"即使灯光打在脸上也保持暗色"，弱措辞拦不住特写末帧

脚本范式：`_qa/video-lock.py`（幂等：注入前先剥离旧锁句，可重复跑）。
注入后三镜复查流程：`_qa/video-qa.py`（ffmpeg 抽首/中/末三帧 → 拼 36×3 接触表 + 首帧 6×6 表），
先看整表，再对可疑镜出 640px 放大三联（zoom_*），**末帧是漂移高发区**。

**复查判例**（同轮实测）：S25 首帧远景红衣→末帧黑发露背背影近景，判定"推门+转身"合理运镜保留；
S27 镜头上摇到屋檐人物出画，判定合理。**抽帧脚本注意**：tag 用 `chr()` 算出 's','t','h' 的
低级错（应为 's','m','h'）会让"中帧"静默缺图——拼表时 N/A 灰字是唯一的暴露线索。

**成本注记**：36 镜 4 并发约 31 分钟；--candidates 2/3 只对问题镜用（×N 视频额度）。
429 限流会自动退避（cooldown 45s），无需干预。

**坑位 27 补遗：三帧抽查的盲区 —— 特写镜必须做全程扫描（S15 实测）**：
首/中/末三帧全过 ≠ 全程干净。S15（extreme close-up）三帧正常，但 8.4s~12s 持续金眼，
在成片 12 格抽帧（108.45s 处）才暴露。定式：所有面部特写镜（shot_size 含 close-up）
在阶段三自查时按 `t = d*(i+0.5)/8` 全程抽 8 帧扫一遍；"金色发光眼"在 S15/S24 两镜
重复出现，是该 i2v 模型处理"灯笼暖光打在脸上的大特写"时的系统性伪影，措辞必须
ABSOLUTE 级 + candidates≥3 才压得住。修复后必须重新 assemble（--force 刷 norm）+ 重烧字幕。

## 坑位 28：跨画幅重制（9:16 → 16:9）—— 全量重做流水线（2026-09-22「春风许我再少年」实测）

**触发**：用户要求把旧竖屏 MV 改为横屏参考片（1280x704）的画质与比例。竖屏构图无法转横屏，
必须全量重做：分镜 → 关键帧 → 视频 → 组装。

**定式（一次跑通，28/28 零补拍）**：
1. 备份旧项目到 `_backup_9x16/`（全目录）。
2. 重写 brief：显式写"16:9 横屏电影构图"+ **景别强制分布**（≥5 空镜含 ≥3 物件微距、
   ≥5 面部特写、大远景、每镜构图唯一、禁连续同机位站立居中）—— 这条是解决旧版
   "24 镜里 2/3 站立居中同质化"的关键；不改 brief 只改 aspect，LLM 规划器会复刻旧毛病。
3. 重跑 `plan.js --aspect 16:9 --shots N --strict-profile`（28 镜 166s 歌曲约 6 分钟/轮，
   首轮时长分配可能超标自动修复 1-2 轮，全程 ~18 分钟）。
4. **新分镜的 shot id 会变**：harden 锁文件必须为新项目重写（锁世界观/服装/年代按新 brief；
   PART_HINT / OBJECT_MACRO / NO_SCENE_ANCHOR 集合按新分镜重排；本项目无局部镜则
   `CMV_PART_SHOTS = new Set()`）。时间锁按 scene_id 动态而非 shot_id 硬编码。
5. 空镜物件微距照旧走"文本锁 + 两步确定性生成"兜底（「古书」必画满书法 → brief/锁里写死
   "pages COMPLETELY BLANK"；QA 判人物数=1 仍收图时用 s02-build 式两步法重做）。
6. 视频锁注入（video-lock 同构脚本）→ videos.js → 三帧表 + 特写镜全程 8 帧扫描 → assemble。
7. 字幕 size 手动 `--font-size 39`（704 高按默认 playResY/28 只有 25px，太小）。

**实测结果**：28 镜一次通过（仅 S02 空镜画出人，两步法重做即好），人物一致度 92，
8 个特写镜 64 帧全程扫描零伪影（无金眼/无凭空道具——harden 锁前置的收益）。

## 坑位 29：**双主角（男女主双线、不同框）—— 单主角架构的扩展（2026-09-22「月照他乡」实测）**

**触发**：故事需要两个主角（如夫妻异地双线望月），但 `sb.character` 是**单对象**，
参考图也只有一套 `ref_charsheet / ref_face / ref_body_*`。直接规划会因为"两个主角"让 LLM
把两套形象混进同一个 character，导致服装/脸部在镜头间漂移。

**核心约束（不可动摇的铁律）：双主角永远不同框。**
团圆/互动一律用**景别切换+反应镜**表达（一镜拍男主推门 → 下一镜拍女主回头 → 再下一镜拍
交叠的影子/门外背影），严禁同框、拥抱、牵手、递物。这条要先写进 brief 顶层，
否则规划器会自然地写出"两人在门槛处"这类同框镜头。

**定式（32 镜一次跑通，32/32 达标）**：
1. **档案结构**：主角挂 `character`，第二主角挂 `character2`（字段名自定义，harden 里读）。
   两个档案各含 physique / wardrobe / expression_bank / hair 等。
2. **两遍生成 + 资产归档**：`buildCharacterAssets` 与 `--only` 无关、会无条件跑，
   所以按"第一遍 character=男主 → 出男主设定表/脸/5张全身 → `cp` 归档到 `_refs_male/`；
   第二遍 character=女主 → 归档到 `_refs_female/`"处理。关键帧可一次性全量出，
   由 harden 按镜选参考。
3. **harden 动态注入（本坑位最关键的一步）**：`render.buildKeyframePrompt` 里**不要全局一套锁**，
   而是按 `shot.characters_in_shot[0]` 选 `YUNZHOU_PHYSIQUE/WARDROBE` 或 `QINGHE_...`：
   ```js
   const who = (shot.characters_in_shot || [])[0];
   const lock = who === "Yunzhou" ? YUNZHOU_LOCK : who === "Qinghe" ? QINGHE_LOCK : EMPTY_LOCK;
   ```
4. **排他锁（不同框的技术保证）**：每镜在锁里写明只允许一个主角 ——
   男主镜：`No woman and no second person may enter the frame`；
   女主镜：`No man and no second person may enter the frame`。
   这条比"只描述本镜主角"更能压住模型自发加人的倾向。
5. **锁按 scene_id 注入场景（本坑位第二大坑）**：`LOCATION_LOCK` **绝不能**把全部场景写进每一镜，
   否则故乡镜头会漂出都市高楼。改为 `settingLock(shot)` 按 `shot.scene_id` 注入**对应**场景，
   并给"故乡/年代线"显式加否定：`no modern high-rise towers, no skyscrapers, no city skyline`。
   （本项目 S27/S29/S31 都因早期版本一次性注入全场景而混入都市天际线，按 scene_id 修正后重画通过。）
6. **视频端锁同样按镜注入**：harden 只锁图像提示词；`video_prompt` 要单独用 video-lock 脚本注入，
   并按 `characters_in_shot[0]` 分别写 IDENTITY LOCK / EMPTY FRAME LOCK。
7. **中文元数据残留清理（交付前必做）**：`visual / subject_action / camera_movement` 等**中文字段**
   容易残留 `两人 / 看到男主 / 左右两人` 这类跨角色描述（规划期陈旧遗留），
   而英文 `video_prompt` 往往是干净的 —— 生成不受影响，但会污染后续重推导与 storyboard.md 展示。
   交付前跑一遍扫描：单主角镜的中文字段里不得出现另一主角的指称。
   （本项目仅 S29 的 `camera_movement` 残留"展现两人在门槛处"，video_prompt 本身干净。）

**实测数据（32 镜）**：男主 15 + 女主 12 + 空镜 5；关键帧男主/空镜门禁均分 88.8、女主 84.7，
修 S01(畸形腿)+S27/S29/S31(都市泄漏) 后 32/32 达标；视频 4 并发 25 分钟 32/32、运动量 2.37~21.66
全过 1.2；特写镜 13 个 ×8 帧全程眼部扫描零金眼；assemble dissolve0.5s+fade，verify 6/6 PASS。
总时长 267.2s 与音频 267.17s 吻合（LLM 时长分配先在 brief 里写死"32 镜、总和 245–275 秒、单镜 4–12s"，
否则首轮会算出 194s 这种严重不足的总长）。

## 坑位 30：**空镜的"风格板拼贴" —— 断锚点不等于没参考图**（2026-09-22「三部 MV 追加 9:16」实测）

**症状**：微距/物件空镜出图是一张**拼贴**：主体物件（纸页 / 油纸伞 / 灯笼）浮在上方，下方
整块贴着"风格基调板"（ref_style.png）里的那幅风景。门禁 **完全查不出来** —— 画面里没有人物、
没有文字，`auditKeyframe` 给 90~100 分"通过"。只有肉眼看接触表才发现是合成怪。

**根因**：`CMV_NO_SCENE_ANCHOR` 的本意是"这个镜头的构图与场景锚点冲突，别挂锚点"，
但 `modeFor` 里断锚后回退到 `"scene"` 模式，而 `"scene"` 模式保留 `场景锚点 + 风格板` 两组标签——
锚点被 `images.js` 摘掉了，**风格板还在**。而 `ref_style.png` 是一张完整的风景构图图，
i2i 把它当成"构图模板"，于是主体物件 + 整幅风景被合成到同一张画面里。

**判定**（三秒）：

```bash
# 空镜出图必须逐张开图看，或拼接触表（ffmpeg tile）一次看完
# 症状：画面能明显切成上下两块，下半块的构图/元素与 ref_style.png 高度雷同
```

**处置**：

1. **微距 / 局部 / 构图特写的空镜，一律不给任何参考图** —— 包括风格板。
   这些镜头的构图由文字锁承担，色调一致性交给 `render` 的 GRADE 块与全片统一风格。
   用现成的逃生口（harden 钩子里的 `modeFor` 已支持）：
   ```bash
   CMV_REFMODE="S01=none;S03=none;S09=none;S12=none;S23=none;S25=none;S28=none" \
     node -r harden.js images.js --project <P> --only <空镜列表> --skip-refs --force --concurrency 3
   ```
   `mode="none"` → `keep=[]` → 生成端零参考图，纯 t2i。
2. **宽景 establishing 空镜可以保留场景锚点**（锚点是同地同景的无人全景，构图本来就对得上）。
   判据：这一镜的构图是否与锚点视角一致？一致 → 留锚点；是微距/俯拍/特写 → 断干净。
3. `--skip-refs` 千万别漏（见坑位 20）。

**与坑位 26 的关系**：26 讲"空镜被画进人物"（语义诱导 + 锚点拽构图），
30 讲"空镜被合成拼贴"（参考图当构图模板）。**两者的解法方向相同：减少输入侧的自由度来源。**
一句话记法：**空镜的参考图，只在"构图确实一致"时才是资产，否则一律是负债。**

**顺带一条**：门禁只回答"有没有人、有没有字"，**它结构上看不见构图错误**。
交付前每个空镜都必须目视（接触表最快），别把"门禁全绿"当成"空镜没问题"。

## 坑位 31（纯实现 bug，已改源码）：**空镜没有重试机会 —— 门禁判失败也照收**

**判定**：空镜日志只出现一次 `[QA] Sxx 空镜 ... 人物数=N`，**没有任何 `↻ 未达标，重新生成`**，
不合格图直接被当作最终产物落盘（`identity_report.json` 里这些镜的 `attempts` 只有 1 次）。

**根因**（`scripts/images.js`）：

```js
const totalAttempts = 1 + (t.hasCharacter ? Math.max(0, args.identityRetries) : 0);
//                      ↑ 空镜（hasCharacter=false）只有 1 次机会
```

空镜有完整的 QA 门禁（文字 / 人物数）与 `fix` 修复通道，却**被排除在重试之外** ——
门禁对空镜形同虚设。而 `fix` 通道本身是通用的（`render.buildKeyframePrompt` 不区分是否角色镜），
所以只要放开次数就能立刻生效。

**已改源码（2026-09-22）**：

```js
const totalAttempts = 1 + Math.max(0, args.identityRetries);   // 空镜同样重试
```

同时把"最佳尝试仍不达标"的告警从"仅角色镜"扩展到**空镜也告警**
（`⚠ Sxx 最佳尝试空镜 QA 仅 40，建议人工复核或 --only Sxx --force 重跑`），
并让 `render.js` 的 CORRECTION 块表头按 `hasCharacter` 分岔 —— 空镜不再显示
"the previous render produced a person who did not match the reference" 这种角色镜措辞。

**实测收益**：春风 9:16 三个空镜里，S01 第 2 次即 `人物数=0`、S28 第 1 次通过。

**教训**：**任何"有门禁但没重试"的分支都是静默失败源。** 加 QA 之前先问一句
"它失败了会怎样" —— 答案必须是"按差异重画"，而不是"照收"。

## 坑位 32：**"双色调风格（都市线/故乡线）"会被注入每一镜，把空镜压成左右硬接缝拼贴**（2026-09-22「月照他乡」9:16 实测）

**症状**：S08（月饼 + 青花茶盏微距空镜）出图是**一张左右硬分割的双联画**：左半冷蓝都市夜景街，
右半暖金江南水乡，中央竖着一条笔直接缝，还漂着一只**没有身体的裸臂与赤足**，茶碗悬空。
门禁报 `人物数=0`（它只数"完整的人"），**完全漏检**。断掉参考图（`CMV_REFMODE="S08=none"`）
之后**仍然出分割**。

**根因（两处叠加，都在提示词正文里，与参考图无关）**：

1. `storyboard.visual_style` 本身就是"双色调"写法，会被 `render.buildKeyframePrompt` 逐镜注入
   `GRADE:` 行：
   > `GRADE: 电影级双色调：都市线冷峻钢蓝与暖黄窗光，故乡线暖金月色与靛青屋檐…`
2. 加固钩子的 `timeLock()` 也写成两段式：
   > `City side (SC1, SC2) — cold steel-blue… Hometown side (SC3, SC4) — warm golden moonlight…`

两句话都在描述**两个色彩世界**。对角色镜无所谓（SHOT 块指定了具体场景，模型会选一个）；
但**空镜没有人物/场景可锚定**，模型就把"两个世界"直接理解成**并置的两幅画面** → 硬接缝拼贴。

**判定**：空镜出现笔直的竖/横分界线，两侧色温明显不同；
或提示词里出现 "Left side: … Right side: …" / "都市线…故乡线…" 这类并列句式。

**处置（三步，缺一不可）**：

1. **空镜专用单色调时间光锁**：按该镜自己的 `scene_id` 只给一个色彩世界，
   并显式声明"另一侧不存在"。别复用两段式 `timeLock()`。
2. **剥掉注入的 GRADE 行，换成单一色调 GRADE**：
   ```js
   const stripped = base.replace(/\n?GRADE:[^\n]*/g, "").replace(/\n{3,}/g, "\n\n").trim();
   return stripped + "\n\n" + emptyGrade(shot);
   ```
3. **加 `NO_SPLIT_LOCK`**（对所有空镜、特别是微距/物件镜）：
   > `SINGLE-FRAME RULE (mandatory): ONE background, ONE location, ONE unified grade… STRICTLY
   > FORBIDDEN: split-screen, diptych, two-panel, side-by-side, collage, montage, before/after,
   > and above all any vertical or horizontal seam dividing the frame into two differently-lit halves.`

   **实测**：加锁后 3 连尝试全部不再是拼贴（分割问题解决），但紧接着暴露出坑位 33。

**顺带**：`style_board_prompt` 本身就是一张"左右分割"的风格板，`ref_style.png` 会被 i2i 当构图模板
（与坑位 30 同源）。**双色调片子的微距空镜，参考图必须断干净。**

## 坑位 33：**物件微距空镜里，文本锁对"出人/出全景"完全没有杠杆 → 必须走"紧缩纯 t2i + 门禁自检"闭环**（2026-09-22 实测）

**症状**：S08 加上 `NO_SPLIT_LOCK` + 单色调 + `EMPTY FRAME RULE` + 物件正向锁 +
"THE ONLY SUBJECT OF THIS FRAME" + 零参考图之后，**三次尝试仍是 `人物数 1/2/1`**，
而且构图被拽成**全景**（整条水乡街道 + 一个人 + 一个人端着茶杯的手），
与声明的 `extreme close-up` 完全不符。

**为什么**：`settingLock(shot)` 会给场景锚点写一大段实景词
（`old family courtyard and its lane … a bamboo chair …`）。
对**物件微距镜**来说，这些场景词是纯负债：模型会优先满足"把场景画完整"，
于是拉成全景，并**自动补一个人来配戏**。文本里的"不要人"压不过"场景要完整"。

**处置：把构图收紧到物理上放不下人、也放不下场景**（与坑位 26 的两步法同源）：

1. **完全绕开锁栈**，走纯 t2i（零参考图、零场景锚点），提示词里
   **删掉一切会引出人的场景词**（`courtyard / lane / street / buildings / chair`），
   只留：**物件 + 承载它的那一小块表面（桌面/窗台/门板）+ "背景完全溶进模糊"**。
2. 一律用**微距句式**开头：`Extreme macro photograph … shot from very close so X fills most of the frame`，
   并写死 `Everything beyond falls away into a soft … blur with nothing recognisable in it`。
3. 结尾固定一句"画面里只有这几件东西"，逐镜列举：
   `The frame contains ONLY <物件清单> — no people, no person, no hands, no fingers, no arms,
   no feet, no faces, no bodies, no silhouettes, … no architecture, no buildings, no street, no text …`
4. **生成后必须过 `vision.auditKeyframe({expectCharacter:false})` 自检**，
   判据 `human_count===0 && !has_text && !is_collage_or_sheet_layout`，不达标自动重写，
   最多 3 次取最优。`is_collage_or_sheet_layout` 是这一轮**唯一能自动发现拼贴**的字段，一定要用上。

**落地脚本**：`out/_qa/yue916-obj-build.js`（`node yue916-obj-build.js S01,S17,S22,S25`）。
**实测**：S08 第 2 次通过；S01 / S17 / S22 / S25 全部第 1 次通过（人物=0 / 无文字 / 非拼贴）。

**教训**：**"声明式否定"在语义层没有杠杆时，就要改用"物理层排除"** ——
不是告诉模型"不要画人"，而是让画面里**根本没有放得下人的空间**。

## 坑位 34：**Windows 图形会话里终端 stdout 捕获不可靠 → 用"落盘 runner"代替管道**

**症状**：`Bash` 工具报 `ls: command not found` / `dirname: command not found`（PATH 劣化，见坑位 0）；
`PowerShell` 工具执行成功但 **stdout 恒为空**（连 `echo` 都拿不到），
`*>` 重定向还写成 UTF-16 让 Read 认成二进制文件。

**处置**：不要让 shell 去传递输出，**让子进程自己写文件**：

```js
// out/_qa/run916.js —— node run916.js <logfile> <node 参数...>
const child = spawn(NODE, argv, { stdio: ["ignore", fd, fd], env: process.env });
child.on("close", (code) => { fs.writeSync(fd, `\nEXIT=${code}\n`); });
```

用法（PowerShell 里也能正常跑）：
```powershell
$env:CMV_REFMODE="S08=none"
& $n "D:\...\_qa\run916.js" "D:\...\_qa\x.log" "-r" "D:\...\harden.js" "<skill>\scripts\images.js" `
   "--project" "<P>" "--keys-file" "C:/Users/<u>/.agnes-keys.txt" "--only" "S08" "--skip-refs" "--force"
```

**要点**：
- 长任务加 `run_in_background`，然后**读 log 文件**（不要去读工具 stdout）。
- 需要看命令输出时，一律 `node -e "require('fs').writeFileSync(...)"` 或让脚本自己写文件，
  再用 `Read` 读（Read 能自动识别 UTF-8）。
- 本次一度误判"任务没跑"，实际是输出被吞；落盘后一次定位全部问题。

## 坑位 35（一个锚点毁掉一整组镜头）：**场景锚点里有一面镜子（或任何能映人的反射面）→ 同地点全部镜头都长出"本人 + 镜中倒影"两具人形**（2026-09-22「爱你老己」实测）

**症状**：SC1（卧室梳妆区）的 **10 个镜头里有 8 个**被画成"女人站在镜前 + 镜里一个倒影"，
连本该是**茶杯微距空镜的 S03** 都长出了一个女人加一个倒影；S02 门禁报 `主角=2`，
S03 报 `主角=1 配角=1`（倒影被算成"配角"而不是第二个主角，所以**部分镜头的门禁规则会直接放行**）。

**根因**：`sb.scenes[SC1].description` 里写了
`A large full-length mirror stands next to the window.`，
于是 SC1 的场景锚点图里就有一面**铜框全身镜**。而 `images.js` 会把场景锚点作为
`sceneRef` 挂给该场景的**每一个**镜头（`pickShotRefs` 里 `if (o.sceneRef && o.sceneRef.url) push(...)`），
i2v/i2i 铁律"参考图的结构必然被复制" —— 锚点里有镜子，模型就给每个镜头都补上一面镜子，
并把分镜文字里的 `the reflection of the protagonist` 字面执行成**另画一个完整的人**。

**注意**：光把分镜文字里的镜子删掉**没有用**（本项目先删过 S01/S15 的文字，图像里镜子照旧），
因为镜子在**参考图**里，不在文字里。

**处置（两步，都要做）**：

1. **让锚点里根本没有镜子**。包裹 `render.buildSceneRefPrompt`，对该场景的
   `description / lighting / architecture / prompt` 逐字段剥掉含 `mirror` 的**整句**；
   architecture 常把镜子写在**从句**里（`… pale cream tone, and a large mirror with a thin, brushed brass frame.`），
   按整句删会把材质描述一起删掉，所以还要再摘一次从句（`,\s*(?:and\s+)?[^.;]*\bmirror\b[^.;]*`）。
   删完必须**渲染出来亲眼看** —— 本项目的模型在"没有镜子"的空屋子里**自作主张**给梳妆台加了一面小方镜，
   所以在字段末尾再补一句显式否定：`This room contains no mirror of any kind — no wall mirror,
   no vanity mirror, no mirror on or above the dresser, no reflective panel anywhere.`
2. **删掉旧锚点文件再重跑**。`ref_scene_SCx.png` 已存在时 `buildSceneAssets` 会
   `[skip] already exists`，删掉它再跑才会重画（不要用 `--force`，那会连设定表/全身参考一起重制，见坑位 20）。
   一次性重画锚点而不动镜头的小技巧：`--only __NONE__`（`wants()` 匹配不到任何镜头 → 只跑 `[1/3]` 参考阶段）。

**镜头端的兜底锁**（锚点修干净后仍要加，防窗玻璃/抛光地面再映出人）：
- 普通人物镜：`SINGLE SUBJECT LOCK`（画面里恰好一个人一次）+ `NO-REFLECTION LOCK`
  （"她绝不在镜面/窗玻璃/玻璃门/屏幕/任何抛光面上留下倒影；画面里每一块玻璃只映出空房间和光"）。
- 真正需要镜子的那 2 镜（本项目的 S02/S21）：改用 `MIRROR SHOT` 锁
  ——"唯一的脸是镜子里那张，镜面占满画幅，真人站在摄影机后面不可见；恰好一张脸，出现一次"。
- 分镜文字提到镜子但画面里不该有镜子的镜头（S17/S23）：另加 `NO-MIRROR SHOT` 锁。

**教训**：**场景锚点是"该地点所有镜头"的构图供体，它里面任何可被"字面执行"的物件都会污染整组镜头**。
给锚点写设定时，逐一自问："这个物件如果被每个镜头都复制一遍，会不会变成第二个人/第二件主体？"

## 坑位 36：**`character_lock.json` 的"服装"字段被视觉反读读错 → `identityBlock()` 把它逐层写进每一条提示词 → 全片服装漂移**（2026-09-22「爱你老己」实测）

**症状**：角色设定图、`sb.character.params.wardrobe_layers` 里明明写的是
`light beige cotton ribbed tank top` + `soft suede flat ankle boots` + `small silver stud earrings`，
但生成出来的**每一个人物镜**内搭都是**鼠尾草绿背心**、脚上是**米色浅口平底鞋**、耳饰是**金色圈环**。
全片 38 镜里凡是露衣服的全部一致地错，**但彼此一致** —— 所以只看成片不容易发现，只有和设定表对照才暴露。

**根因（两层）**：

1. `02_images/character_lock.json` 是 `vision.extractIdentity()` 从设定表**反读**出来的
   （`_source: vision-from-sheet`）。这次反读把**米白读成了 sage green**、
   把**麂皮短靴读成 tan leather flat slippers**、把**银色耳钉读成 gold hoop earrings**，
   连身高都从 165cm 读成 170cm。颜色相近的哑光材质是这类反读的高发区。
2. `render.identityBlock()` 里有 `Wardrobe (layer by layer): inner layer: …; outer layer: …; …`，
   它把锁里的 `wardrobe_layers` **逐层原样**写进**每一条**关键帧提示词。
   于是"文字说墨绿、参考图是米白"形成直接冲突 —— **实测模型听文字的**（成片全是墨绿）。
   也就是说：**参考图定脸，文字定衣服**。

**判定**：把设定表 `ref_charsheet.png` 和任意一张中景人物镜**并排看**。
两者服装颜色/鞋型不一致 = 中招。别只看门禁分数 —— 身份门禁对服装几乎不敏感
（本项目服装全错，一致度照样 82~94 通过）。

**处置**：用 `sb.character.params`（规划器的**设计原意**）把锁的服装字段改回来，
并把 `_source` 置为 `"manual"`：

```python
# out/_qa/fix-char-lock.py —— 两个画幅项目的 lock 一起改
d["wardrobe_layers"] = { "inner": "light beige cotton ribbed tank top",
                         "footwear": "soft suede flat ankle boots",
                         "accessories": "a delicate thin gold pendant necklace, small silver stud earrings", ... }
d["wardrobe"] = "light beige tank top, cream cardigan, brown trousers, suede boots, ..."
d["identity_lock_en"] = ...; d["identity_lock"] = ...
d["_source"] = "manual"        # ← 关键
```

`_source` 必须落在 `assets.js` 的
`AUTHORITATIVE_LOCK_SOURCES = new Set(["storyboard","planner-params","manual"])` 里，
这样后续**任何** `--force` 都只重画图、不会再把锁反读覆盖掉（与坑位 6 同一个保险丝）。

改完只能**重画受影响的人物镜**（服装在提示词里，改锁不会自动改已有图）。
`sidecar` 与 `.url` 都跟着换，所以后续视频阶段会自动用新首帧。

**一句话总结**：**设定表读出来的锁，脸可以信、服装必须核对**；
而一旦锁错了，它的错会以"提示词"的形式**均匀地**刷满全片，比"某几镜翻车"更难发现。


## 坑位 37：**只给 `video_prompt`/镜头加 "NO-MIRROR LOCK" 而不改原文 → 画面照样出镜**（2026-09-22「爱你老己」实测）

**症状**：SC1 锚点已去镜、`SINGLE SUBJECT LOCK` 也加上了，但 **S17 仍然画出"本人正面 + 左后穿衣镜里的背影"**，
一帧里两个完整人形（门禁记为 `主角=1 配角=1`，82 分让它通过了）。

**根因**：分镜原文写的是
`slowly turning away from the mirror to walk towards the open doorway`。
我当时的处置只是在**追加**的锁块里写"不要镜子"，**没有动原句**。
模型对**主干里的名词**（mirror）远比**追加的否定句**敏感 —— 尤其"离开某物"这种语义里，
"某物"必须存在才成立，模型于是**忠实地把镜子画出来**。
追加锁只在"模型本没打算画"时有效；一旦原文点名，锁就被原文压过去了。

**处置**：把原文里的镜子**删掉**，与锚点用同一把手术刀：

```python
OLD = "slowly turning away from the mirror to walk towards"
NEW = "slowly turning away to walk towards"        # 主干里不再有 mirror
```

两个画幅的 `storyboard.json` 都要改（9:16 是从 16:9 克隆的，**克隆会把原文一起带过来**）。
改完 `--only S17 --force` 重画首帧（16:9 一次 25 分 → 重画 76 分通过；9:16 一次 92 分通过）。

**判定顺序**：先 `re.finditer(r'.{50}mirror.{50}', kp, re.I)` 扫 **keyframe_prompt**（`video_prompt`
里的 mirror 基本都是锁自己的否定文字，不用管），逐个确认是"设计内"（真镜面镜）还是"残留"。

**教训**：**锁是补丁，不是修正。** 凡是"画面里不该出现某物"的问题，
都先删原文里的那个词，再考虑加锁；顺序反了就白跑一轮额度。

## 坑位 38：**局部镜"跳过门禁"的意图从未生效，反被空镜门禁兜住 → 恒判 40 分，连烧三轮额度**（2026-09-22「爱你老己」实测 · 已修源码）

**症状**：S16（麂皮短靴在木地板上行走）、S28（手放木桌上握拳再松开）—— 这两个是
`characters_view: "none"` 的人体局部特写，被 `CMV_PART_SHOTS` 正确识别为局部镜，但结果是：

```
[QA] S16 空镜 文字=无 人物数=1     → 重画
[QA] S16 空镜 文字=无 人物数=1     → 重画
[QA] S16 空镜 文字=无 人物数=1     → 重画
⚠ S16 最佳尝试一致度仅 40
```

**根因（两处，缺一不可）**：

1. `tasks.push({ ... })` 里**漏了 `isPartShot`**。`images.js` 的门禁分发写的是
   `if (t.isPartShot) { verdict = null; }`（意图：局部镜无脸可比，跳过门禁），
   但 `t.isPartShot` 恒为 `undefined` → 分支永不命中 → 全部落到最后的
   `else { auditKeyframe(...) }`，也就是**空镜门禁**上。
2. 空镜门禁的判据是 `same_person: n === 0`。可局部特写画的就是**手／脚／耳**，
   检测器必然记 `human_count = 1` —— 这是一条**注定失败**的门禁。
   更坏的是重画会按"减少人物"改提示词，把特写一点点推向"什么都没有"，或反过来
   "把人补全"（坑位 13 的翻版）。

**判定**：**看图**。把被判 40 分的那几张放大 —— 如果画面正是"一只手／一双靴子"的
**干净特写**、没有多余的脸或第二主体，那就是**假失败，直接放行**。
本项目两版最终都是 `38/38 READY`，门禁分数只写进 `identity_report.json`，不阻塞就绪判定。

**源码修复（已落地）**：

```js
// ① tasks.push 必须带上它，否则下面那个 if 永远不成立
tasks.push({ shot, shotId, outPath, hasCharacter, isPartShot, hasScene, refs, prompt });

// ② 局部镜走自己的宽松审计：允许 1 个人形（那正是被拍的手／脚），
//    仍然看住"可读文字"和"第二个人形"这两件真正要紧的事
if (t.isPartShot) {
  const a = await vision.auditKeyframe(pool, { candPath: attemptPath, expectCharacter: false, maxPx });
  const n = Number(a.human_count) || 0;
  const ok = !a.has_text && n <= 1;          // ← 关键是 <= 1，不是 === 0
  verdict = { same_person: ok, score: ok ? 90 : 40, ... };
}
```

修完请跑 `test/asset-pipeline.js` 等四套离线自检（本次 47/47、48/48、66/66、15/15 全绿）。

**教训**：**"跳过门禁"也要写测试。** 一个 `verdict = null` 的意图，因为上游少传一个字段，
就变成"静默走了另一条更严的门禁"——而且它的症状（恒 40 分）看起来像模型不听话，
完全不像接线错误。凡是"刻意不做某事"的分支，都要能证明它真的走到了。


---

## 坑位 39 — 中文歌词站的 LRC 会直接把字幕烧坏：段落标签 + 逐字空格 + `WrapStyle: 2` 三杀

**现象**（《爱你老己》，两版都中）：

- 字幕**左右被裁掉**。9:16 竖屏 704px 宽下，一行渲染成 `erse 1]镜子里的女孩眼神有点`——
  开头少了 `[V`、结尾少了 `累`，居中溢出两侧，**不是换行而是硬裁**。
- 有几句**两行同屏叠字**。t=140.0s 处 `允许慢慢来也允许喘息` 出现重影。
- 画面里直接烧着 `[Verse 1]`、`[Chorus]`、`[Final Chorus]` 这类**结构标签**。

**根因（三个因素叠加，缺一不可）**：

1. **行内段落标签**：歌词站把结构标记写进正文 `[00:11.88][Verse 1]镜 子 里 的 女 孩…`。
   `parseLrc` 只剥时间戳、把剩下的**原样**当歌词。
2. **逐字空格（KTV 逐字高亮残留）**：`从 从 容 容 才 是 真 本 事`。
   每个空格吃掉约一个字宽 → 12 字歌词实际占宽 23 字，轻松超过可用宽度。
3. **`subtitles.js` 的 `WrapStyle: 2`**（不换行，只认 `\N`）。
   有了它，超宽的行**不会被折行，只会被裁**。

**第 4 个隐藏问题 —— 近似重复行**：同一句因延音/合唱被拆成两条时间戳极近（0.5s）的行，
差别**只在字符间空格**：
```
[02:19.46]允许 慢慢来 也 允许 喘息
[02:20.02]允许 慢 慢 来 也 允许 喘息
```
原去重逻辑是 `prev._raw === text`（**严格相等**）→ 判定为两行不同 → 双双上屏叠字。
同理 `[01:46.83]` 与 `[01:48.67]` 两句完全相同的 Bridge 也被当成两句。

**修法（两层，都在源码里）**：

`lib/lyrics.js` — 新增并在 `parseLrc` / `parsePlainLyrics` 里生效：

```js
const SECTION_TAG = /^\s*[\[(【]\s*(?:intro|verse|pre[\s-]?chorus|chorus|bridge|final|outro|interlude|hook|refrain|instrumental|solo|主歌|副歌|前奏|间奏|尾奏|尾声|桥段|过渡|合唱|独唱|念白)\s*\d*\s*[^\])】]*[\])】]\s*/i;

function collapseCjkSpaces(s) {           // "从 从 容 容" -> "从从容容"
  const CJK = "\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
  const re = new RegExp(`([${CJK}])[ \\t]+(?=[${CJK}])`, "g");
  let prev, out = String(s == null ? "" : s);
  do { prev = out; out = out.replace(re, "$1"); } while (out !== prev); // 重叠匹配要循环
  return out;
}

function cleanLyricText(raw) { /* 去段首标签 + 折叠字间空格 + 收拢标点两侧空白 */ }
function lyricSection(raw)   { /* 取出段落标记纯文本，没有则 null */ }
```

- `parseLrc` 现在产出 `{ time, text, section }`：**`text` 是纯歌词**（标签剥离、空格折叠），
  `section` 单独存。**字幕端只吃 `text`**，干净。
- `lyricsForPlanner` 把 `[section]` **拼回行首**再喂规划器 —— 结构提示不丢，视觉污染不传下去。
- **空行兜底**：整行只是个 `[Chorus]` 时 `text` 为空，直接 `continue`，不再产出空字幕。
- 导出 `cleanLyricText` / `lyricSection` / `collapseCjkSpaces` 供字幕端复用，
  保证"规划器看到的"和"烧进画面的"是同一份文本。

`subtitles.js`：

- `buildLines` 用 `lyrics.cleanLyricText` 清洗每行；
- 去重键从"原文严格相等"改成 **`s.replace(/\s+/g,'')` 归一化后比较**，
  上面两组重复行因此正确合并（46 → 44 句；Bridge 合成 `1:46.83→1:51.62`，
  副歌合成 `2:19.46→2:22.42`）；
- `WrapStyle: 2` → **`WrapStyle: 0`**（智能折行兜底，宁可折不可裁）；
- 新增 `estimateLineWidth()`（CJK 1em / ASCII 0.55em + 字距）逐行预判，
  超宽的行自动插 `{\fsN}` **缩字**而不是任其溢出。

**验证**：两版重烧后 46 → 44 句，`@12.0s` 单行完整 `镜子里的女孩眼神有点累`（无标签、无裁切），
`@140.0s` 单行 `允许慢慢来也允许喘息`（无叠字）。四套离线自检 47/47、48/48、66/66、15/15 全绿。

**一句话**：**"原文相等"不等于"视觉相同"**。中文歌词的"同一句话"有无数种空格写法，
去重、量宽、判定溢出，全部要先**归一化**再算；字幕渲染器不换行时，超宽就是永久性损坏。

**排查捷径**：抽帧只看**最低 175px**那条带（`MarginV = playResY/14`）。字幕的裁切与叠字
在整图缩略里几乎看不出来，裁成窄带放大 2 倍立刻现形。

## 坑位 40 — 坑位 39 的**白名单漏洞**：`SECTION_TAG` 少了 `rap`，段落标签照样烧进画面（2026-09-23「月饼卖不动」实测）

**症状**：坑位 39 修完之后，换一首歌又出现"段落标签进字幕"。
`[Intro]` / `[Verse 1]` / `[Pre-Chorus]` / `[Final Chorus]` 全部正常剥离，
**只有 `[Rap]` 漏了**：

```
19 t=41.56 sec=null  text="[Rap]哎 —— 别卷包装卷到老"     ← 标签留在正文里，section 也是 null
```

**根因**：坑位 39 的 `SECTION_TAG` 是一份**手写白名单**：

```js
/(?:intro|verse|pre[\s-]?chorus|chorus|bridge|final|outro|interlude|hook|refrain|...)/i
```

有 `refrain` 却没有 **`rap`** —— 一个在中文歌词里极常见的段落名。
白名单没盖到的标签不会被剥，于是又变成字幕正文。

**修法**：补齐候选名，并把复合名放在前面（否则 `[Pre-Chorus]` 只会匹配到 `chorus` 那半截）：

```js
const SECTION_TAG = /^\s*[\[(【]\s*(?:intro|outro|interlude|instrumental|
  pre[\s-]?chorus|post[\s-]?chorus|chorus|verse|bridge|refrain|hook|rap|spoken|solo|tag|coda|drop|break|final|
  主歌|副歌|前奏|间奏|尾奏|尾声|桥段|过渡|合唱|独唱|念白|说唱)\s*\d*\s*[^\])】]*[\])】]\s*/i;
```

同类问题还有一处：**全角引号内侧的空格**。`collapseCjkSpaces` 只折叠"字与字之间"，
盖不到标点旁，于是 `小手马上点下 “ 购”` 把引号内那格空格也烧进了行宽。
`cleanLyricText` 的标点收拢字符类必须带上全角引号：

```js
  .replace(/\s+([，。！？、；：…）】」』》〕”’"'])/g, "$1")
  .replace(/([（【「『《〔“‘"'])\s+/g, "$1")
```

**验证**：修后该行 `sec="Rap" text="哎 —— 别卷包装卷到老"`，全片最宽行 **12.9 → 10.2**。
四套离线自检 47/47、48/48、66/66、15/15 全绿。

**教训（比修法更重要）**：**"正则白名单"这类修法天然会留同类尾巴。**
坑位 39 的修法方向是对的，但它把"枚举所有段落名"当成了完备方案 —— 而枚举永远不完备，
下一次换歌就再咬一口。因此：

- 每次换新歌，**先跑一次歌词预检**（离线解析 + 打宽度），别等烧完字幕再抽帧找问题；
- 预检里直接断言 **"所有 `text` 都不含 `[...]`/`【...】`"**，把这类问题变成"跑之前就报错"。

一个现成的预检脚本：

```js
// out/_qa/check-lyrics-yb.js —— 加载歌词 -> 打印 {time, section, text} -> 复刻 buildLines 口径算行宽
// 断言：无 text 含残留标签；max_width 不超过画面可容纳字数
node check-lyrics-yb.js
```

---

## 坑位 41 — 规划器把"镜头数"交超了**物理上限**，`fitTimeline()` 把整轮 10 分钟的规划直接扔掉（2026-09-23「月饼卖不动」实测 · 已修源码）

### 症状

```
[4/6] Fitting shot timeline to the exact song duration ...
plan.js FAILED: fitTimeline: cannot fit 66.09s into 18 shots
  (legal range 4-12s → total 72-216s). Ask the planner for roughly 6-16 shots.
```

而且这是**最坏的一种失败**：提示词跑了 4 轮、`10m46s` 的模型调用全部白花，
`01_plan/` 目录是**空的** —— 因为写盘发生在时间轴拟合**之后**。

### 根因（两层叠加，缺任何一层都不会出事）

**其一，提示词把镜头数写成了柔性约束。**

```
- 镜头数量目标：约 16 个镜头（每个镜头 4-12 秒）
...
要求：镜头数与 16 相近（可在 ±20% 内浮动）
```

`±20%` 让 16 合法地漂到 19。而 66.09s 的歌**最多只能装 16 镜**
（16×4=64 ≤ 66.09 < 17×4=68）。规划器交了 **18 镜 —— 完全符合提示词，但物理上无解**。

**其二，`fitTimeline()` 只会调"时长"，不会调"数量"。**

n 个镜头只能覆盖 `[4n, 12n]` 秒。18 镜最短 72s > 66.09s，
水位法算出 `totalCap = 0`，于是 `throw`。它把数量当成了不可动的输入。

### 修法（三处，全部落在技能源码里）

**1. `lib/prompts.js` —— 把数量边界算出来，当硬约束写进提示词**

```js
const minShots = Math.max(1, Math.ceil(totalDuration / 12));   // 全是 12s 时的最少镜头数
const maxShots = Math.max(1, Math.floor(totalDuration / 4));   // 全是 4s 时的最多镜头数
const targetShots = Math.min(Math.max(shotCountTarget, minShots), maxShots);
```

文案从"约 N 个（±20% 内浮动）"改成
`镜头数量：N 个。**硬边界：不得少于 6 个，不得超过 16 个**`。

**2. `lib/lyrics.js` —— `fitTimeline()` 新增第 3.5 步 `reconcileShotCount()`：数量不可行时改数量，而不是抛错**

- **太多** → 合并"最便宜"的相邻对（合并后时长最小的那对；`scene_id` 相同的优先，
  这样合并完不用换景）。合并**保留前一镜**的视觉 / 运镜 / 景别，
  把后一镜的 `lyrics_line` 折进 `extra_lyrics` —— 字幕两行都不会丢。
- **太少** → 把最长的一镜对半拆开，`camera_movement` 带 `(continued)` 后缀，
  读起来仍是一个连续动作而不是重复两遍。
- 第 5 步水位法若**仍**算出零容量，就**再调和一次**（`continue` 而不是 `throw`），
  只有真正无解才抛错。
- 新 id 走 `uniqueShotId()`（探测已占用后缀），避免和规划器自己的 id 撞车。

**3. `plan.js` —— `--shots` 只是"请求"；且在拟合之前先落 checkpoint**

```js
const targetShots = Math.min(Math.max(requestedShots, minFeasibleShots), maxFeasibleShots);
// 拟合之前就把规划器输出写下来
agnes.writeFileSyncDurable(path.join(planDir, "storyboard.raw.json"), JSON.stringify(sb, null, 2));
```

> 第三条比修 bug 本身更重要：**任何机械步骤都不该把 10 分钟模型调用的产物毁尸灭迹。**
> 有了 `storyboard.raw.json`，拟合失败也只是"重跑机械步骤"，不是"重问一遍模型"。

### 验证

`out/_qa/test-fitcount.js`，6 组场景，每组都断言
**总和精确 / 每镜时长 ∈ [4,12] / id 唯一 / 数量落在可行窗口 / 时间轴末端精确等于总时长**：

```
18 镜 /  66.09s → 16 镜（合并 2 对，extra_lyrics 各带 1 行）   ALL GREEN
 5 镜 /  66.09s →  6 镜（拆最长的一镜）
16 镜 /  66.09s → 16 镜（原先可行 → 一镜不动，且不输出调和提示）
12 镜 / 240s    → 20 镜（拆）
30 镜 /  40s    → 10 镜（合并）
```

提示词断言：`不得超过 16 个`、`不得少于 6 个` 均命中，`±20%` 已消失；
`--shots 999` 在 240s 的歌上被夹成 60。
四套离线自检 **47/47、48/48、66/66、15/15 全绿**。

### 教训

- **"镜头数"和"总时长"是两类约束，冲突时永远牺牲数量。**
  总时长是物理硬约束（视频 API 的 4-12s 限制），镜头数只是创作者的偏好；
  而此前的拟合器只会牺牲时长 —— 于是在数量超限时必然无解。
- 规划器的"符合提示词"和"可执行"是两件事。**凡是能被算出来的硬边界，就不要交给模型去猜**：
  把 `floor(total/4)` 直接写进提示词，比任何措辞强化都可靠。
- 坑位 2 的项目侧补丁 `plan-resilient.js`（`CMV_MAX_SHOTS`）做的是同一件事，
  这条把它修进了技能源码，新项目**不再需要那个脚本**。

---

## 坑位 42 — 规划器的「重复镜头」与「能量错配」：每一镜都合法，成片却难看（2026-09-23「月饼卖不动」实测 · 已修源码）

### 症状

16 镜一次性全部通过校验（`hard=0`、`soft` 只有 3 条运动措辞），
**生成前人工过目才发现三处问题**：

- **S06 与 S11 是同一个镜头**：同 `shot_size=close-up`、同 `expression=开怀`，
  `subject_action` 一字不差（「双手捧起油纸包月饼，凑到嘴边，做出夸张的咬合动作，嘴角上扬至最大」），
  分别落在 **20s 与 40s**。66 秒的片子里，观众会在两处看到同一张图。
- **S12 与 S16 同构**：都是「SC3 天台 + medium close-up + 满足」，相隔 16 秒。
- **S13（48–52s）能量错配**：天台上的静止特写、`motion_intensity=1`，
  但 49.38s 起已经是 `[Final Chorus]`「打折打折没人要 / 便宜便宜抢着跑」——
  全片最响的段落配了全片最静的镜头。

### 根因

**既有校验全是"逐镜"的，而重复和错配是"跨镜"的属性。**

每一镜单独看都无可指摘：景别对、表情取自 `expression_bank`、动作可拍、
prompt 写了运动、排期不撞、`scene_id` 有效。
**没有任何一条校验会问「这一镜和另一镜是不是同一张图」。**

能量错配同理：`motion_intensity` 与 `section` 各自都合法，
但把两者和 **LRC 里真实的段落标签**放在一起看就矛盾了 ——
规划器把 44–52s 标成 Bridge，而 LRC 在 49.38s 写着 `[Final Chorus]`。

### 处置（已写进 `plan.js` 的 `validateStoryboard`）

**1. 把"跨镜重复"变成确定性检查，两个判据缺一不可**

```js
// A. 同景别 + 同表情 + 同场景  → 同机位同地点，观众直接读成同一张图
// B. 同景别 + 同表情 + 动作近乎相同 → 换场景也救不了（夜市摊位近景本来就长得一样）
const actionSim = bigramJaccard(a.subject_action, b.subject_action);   // 中文二元组 Jaccard
```

**只查 A 会漏掉 S06/S11** —— 它们分属 SC2/SC4 两个场景，但动作重合度 100%。
中文没有可靠分词，所以用「去标点后的字符二元组 Jaccard ≥ 0.7」，
实测既能抓逐字重复、也能抓近似改写（S06/S11 判为 100%）。

**2. 新增 `advisory` 通道：`validateStoryboard` 现在返回 `{ hard, soft, advisory }`**

`advisory` **只打印给操作者，绝不送回模型返修**。
这类"口味级"问题让模型花 3 分钟去改，有把一份本来没问题的分镜改坏的风险
（`soft` 本来就会占用那唯一一轮返修额度，运动措辞交给 `videos.js` 自动补就够）。

**3. 表情单调度**：某个表情占到含主角镜头的 **≥50%** 时提示
（`expression_bank` 里不同名字才算不同表情）。

> 阈值刻意留在 50%：本片修正后 开怀 6/16=37.5%、修正前 7/16=43.75%，**都不报**。
> 把正常幅度的偏好当缺陷，会让人开始忽略提示 —— 验证器宁少勿滥。

**4. 规划收尾直接打印两行分布**，一眼看出"16 个镜头是不是 16 张一样的脸"：

```
景别分布   : medium close-up×7  medium×4  wide×3  close-up×2
表情分布   : 开怀×6  得意×4  懊恼×3  满足×2  neutral×1
```

### 人工定点修正的姿势（本轮实测，零额度成本）

只改文字、不动时长 / 时间轴 / 画幅 ⇒ **不需要重跑 `plan.js`**。
写一个带**前置断言**的补丁脚本（本轮：`out/_qa/patch-yb-shots.js`）：

1. **先断言"问题确实存在"**（`S06.shot_size === S11.shot_size && S06.expression === S11.expression && S06.subject_action === S11.subject_action`），
   前提不成立就**不写盘** —— 避免脚本在别人手里跑出静默的错改；
2. 改完跑一遍**全量不变量**（镜头数 / id 唯一 / 时长∈[4,12] / 时间轴连续且末端精确 /
   `scene_id` 存在 / `expression` 在 bank 里 / 每个 `video_prompt` 都有摄影机运动 / 无重复对），
   **任何一条不过就整份不写盘**；
3. 先备份（`storyboard.beforeEdit.json`），再同步 `storyboard.md` 的详案与镜头表、
   以及 `scenes[].used_by`（改 `scene_id` 后它一定过期）。

> 本轮的守门断言还**额外查出第三处重复**（S12/S16）—— 我肉眼只看出两处。
> 写断言的成本远低于它替你拦下的返工。

### 教训

- **"每镜合法"不等于"成片好看"。** 校验必须覆盖跨镜关系，而不只是单镜字段。
- **尚未实现、但值得做的下一项检查**：把 `sections[]` 的边界与 **LRC 自带的段落标签**
  （`[Final Chorus]`、`[Rap]` 等）做对齐比对。本轮的能量错配正是
  「section 写着 Bridge、而 49.38s 已是 Final Chorus」，现有校验发现不了，
  是按 LRC 时间戳人工对出来的。

---

## 坑位 43（本轮最贵的一课）：人物参考图连废三轮，都是"提示词对了、模型没照做"（2026-09-23「月饼卖不动」实测 · 已修源码）

### 症状：参考图就是身份基准，基准错了比门禁失败更危险

跑第一轮参考图（role: 设定表 + 面部锚点 + 5 个全身体位）后，读 `character_lock.json`：

| 字段 | 设计意图（storyboard） | 视觉反读（lock） |
|---|---|---|
| `age_range` | mid-teen（17 岁） | **child, approximately 6-8 years old** |
| `eye_shape` | large round cartoon-eyes, visible double eyelid | **small, almond-shaped, monolid** |
| `physique` | rounded plump body | small, child proportions, **slender limbs** |
| `wardrobe_layers.outer` | **bright red Chinese qipao-style dress** | **"none"** ← 红裙整个消失 |
| `garment_palette` | `#C41E3A #FFB700 #FFFFFF #2A1515` | `#F5F5F5 #E0E0E0 #C8C8C8 #000000`（全灰白黑） |

**危险的不是"画错了"，而是"门禁拿这张错图当唯一比对基准"**：
关键帧会**全部通过门禁、却全部是错的人**。这比门禁失败严重得多 —— 失败会报警，这个不会。

### 根因一：设计意图被"有损观测"覆盖（`lib/assets.js`，已修源码）

`wardrobe_layers`、`garment_palette`、`wardrobe`、`physique` 原本都属于 `VISUAL_FIELDS`，
而视觉反读的结果只在 `!identity.wardrobe_layers` 时才让位给规划器 ——
反读既然返回了一个 `outer:"none"` 的对象，**设计意图就被永久删除**，之后每一条提示词都写"白 T 恤"。

修法：新增 `DESIGN_INTENT_FIELDS`，反读之后**强制以规划器设定为准**，并把不一致打进日志：

```js
const DESIGN_INTENT_FIELDS = ["wardrobe_layers", "garment_palette", "wardrobe", "physique"];
// 脸/发/肤是"相机能看到的东西"，反读权威；
// 服装与体型是"设计决定"，画面画歪了不该反过来改写设计。
```

一句话判据：**"这个字段，反读错了会怎样？"** 脸反读错 → 该修图；
服装反读错 → 该修图，而不是把"设计里没有红裙子"写进身份锁。

### 根因二：多条强约束互相抢注意力（`harden-cmv.js` 新增 `refGuard`）

设定表提示词里明明写着 `mid-teen` + `bright red Chinese qipao-style dress`，模型却画了个穿白 T 的小孩。
三轮实测说明这不是"提示词没说清"，而是**注意力分配问题**：

| 轮次 | refGuard 写法 | 结果 |
|---|---|---|
| 1 | 无 | 小孩 + **红裙全丢**（长提示词里排在后面的服装最容易被丢，只留下最先列的白色内搭） |
| 2 | AGE 否定句 + EYES + GARMENT（约 800 字符） | **17 岁✔ 红裙✔** 但双马尾没画出来（披散直发） |
| 3 | HAIR 提到第 1 条、写了一大段多重否定（约 1000 字符） | **双马尾✔ 红裙✔** 但年龄**退回小孩** |
| 4 | 每条压成**一句话**、按"代价从高到低"排序（435 字符） | 双马尾✔ 红裙✔ 表情✔ 年龄=少女（可接受） |

**结论（可复用）**：
- **强约束之间会互相抢注意力，谁写得最长、否定最多，谁就赢，代价是别条被清空。**
- 所以 refGuard 要**每条一句话**，并按**"错了代价从高到低"排序** —— 排在前面的话更管用。
- 非致命约束（如眼型）宁可去掉，别去挤致命约束的注意力。
- **否定句对某些字段极其有效**（AGE 用 `NOT a child, NOT a schoolgirl` 立刻生效），但不是免费的：它会占额度。

### 处置流程（三轮返工换来的 SOP）

1. **参考图出图后、关键帧开跑前，必须读 `character_lock.json` 并与 storyboard 对表**，
   再**目检** `ref_charsheet.png`。这一步是本轮唯一能拦住 16 张废图的地方。
2. 跑批期间**盯住设定表**：用一段有上限的等待（等文件出现即返回）而不是轮询；
   一旦发现不对，**立刻 kill 整个任务** —— 参考图阶段只花了 1-3 分钟，关键帧阶段会贵一个数量级。
3. 把废图**归档留证，不要删**（`_qa/wrongrefs-<歌名>/roundN-.../` + `README.txt` 写明那一轮错在哪），
   它们是把"模型行为"讲清楚的唯一证据。
4. 修完基准后，**用 `--force` 重跑参考图**：`assets.js` 的 `AUTHORITATIVE_LOCK_SOURCES`
   包含 `storyboard` / `planner-params` / `manual`，带这三种 `_source` 的 lock 在 `--force` 下不会被反读覆盖。
5. 把"设计意图 vs 反读 vs 修复后"做成对照表交付（本轮：`out/_qa/身份基准修复对照表-月饼卖不动.md`）。

### 一句话教训

**流水线里任何"图 → 文字"的反读，都必须明确区分"可观测"与"设计意图"。**
把设计意图交给反读，等于让一次画错永久改写人设 —— 而且它不会报错，只会安静地把整部片子改成另一个人。


## 坑位 44 — `refGuard` 只挂在**参考图**提示词上，关键帧一条都没带（2026-09-23「月饼卖不动」实测 · 项目侧已修）

### 现场

参考图第 4 轮定稿（双马尾 / 红短裙 / 17 岁）后跑完 16 张关键帧，逐张目检发现两张明显不对：

- **S05**：参考图与另外 15 镜都是高扎双马尾，这一镜却是**披散长发 + 额前刘海**；
- 而且一致性门禁给了它 **92 分**放行。

### 根因

`harden-cmv.js`（以及上一首歌的 `harden-aini.js`）里那段"不容商量的关键设定"是这样挂的：

```js
const withGuard = (orig) => function (identity, ...rest) { return orig.call(this, identity, ...rest) + "\n\n" + REF_GUARD; };
render.buildCharacterSheetPrompt = withGuard(render.buildCharacterSheetPrompt);
render.buildAngleRefPrompt      = withGuard(render.buildAngleRefPrompt);
render.buildFaceRefPrompt       = withGuard(render.buildFaceRefPrompt);
```

**三个都是参考图构建函数**。`render.buildKeyframePrompt` 从头到尾没被包装过 ——
于是"年龄 / 发型 / 服装"这几条硬约束在关键帧阶段**等于不存在**，
只靠"图生图 + 参考图"去兜。偏偏这几镜都是 5-6k 字符的长提示词，发型这种细节最容易在长提示词里被丢掉。

**误判点**：我在参考图阶段做过冒烟测试，断言"关键帧里含 `bright red Chinese qipao-style dress`"并且通过了 ——
但那句话是 `character_lock.json` 里的 `wardrobe` 字段经 `localStateBlock()` 拼进去的，
**不是 REF_GUARD**。断言挑了一个"两处都会出现"的字符串，于是把"守卫根本没挂上"这件事判成了通过。

### 处置

1. 在 `buildKeyframePrompt` 的包装里，对**含主角**的镜头也追加 `REF_GUARD`（放在最末尾，作为最后一条指令）：

```js
const guard = (!isEmpty && REF_GUARD) ? REF_GUARD : "";
while (base.length + tail.length + guard.length + 4 > LIMIT && extra.length > 1) { extra.pop(); tail = extra.join("\n\n"); }
return base + "\n\n" + tail + (guard ? "\n\n" + guard : "");
```

2. 新增 `shotLocks`（逐镜定点锁，**优先级最高**、最后才被裁掉）：

```json
"shotLocks": { "S05": "HAIR IN THIS SHOT — MANDATORY: ...", "S16": "STYLE IN THIS SHOT — MANDATORY: ..." }
```

3. **冒烟测试的断言必须挑"只会由守卫产生"的字符串**（例如守卫特有的句首标记
   `HAIR IN THIS SHOT` / `NOT a 3D cartoon`），不要再挑人设字段里也有的名词。
   修好后 16 镜的长度从 5.3k 涨到 5.9-6.5k，全部 < 10000 上限。

### 一句话教训

**"我给每一镜都加了锁"这句话，必须用"只在守卫里出现的字符串"来验证，不能用"人设里也有的字符串"。**
假阳性断言比没有断言更危险 —— 它会让你确信一件事已经做了。

## 坑位 45 — 一致性门禁只问"**是不是同一个人**"，从不问"**是不是同一种媒介**"；选片又只比分数（2026-09-23「月饼卖不动」实测 · 已修源码）

### 现场

S16（全片最后一镜，特写：天台圆桌前咬月饼看月亮）被渲染成 **Q 版 3D 卡通**，
和参考图、以及其余 15 镜的实拍摄影风完全断裂 —— 而门禁给了它 **92 分**并放行。
同一轮里还有 S05（发型错）也是 92 分通过。

### 两个叠加的机制

1. **裁判提示词里没有"媒介"这一维**。`COMPARE_RUBRIC` 只有脸型 / 眼型 / 眉 / 鼻 / 唇 / 肤色 / 发型 / 年龄感，
   `same_person` 的判据是"五官是不是同一个人"。一张画得很像、但整张变成卡通的脸，在这一维上完全无懈可击。
2. **选片逻辑是"分数最大者胜"**：`const better = !best || (verdict && verdict.score > best.score);`
   于是一张"很像但不是同一媒介"的高分图，会**挤掉**一张"确实是同一个人、分数略低"的图成为最终产物。

**这两条叠加的效果是：门禁的失分方向和选片的偏好方向一致，错误会被放大而不是抵消。**

### 处置（已改源码）

1. `lib/vision.js` 的 `COMPARE_RUBRIC` 增加 `rendering_style 渲染媒介（实拍摄影 / 3D CG / 二次元动画 / Q版卡通 / 插画）`，
   并给媒介一致性**一票否决权**：媒介不同则 `same_style=false` **且** `same_person=false`，
   不论五官多像；同时明确"同一媒介下因镜头/灯光/景深/调色/修图造成的差异**不算**风格不一致"（否则会把正常镜头也判失败）。
   JSON 契约增加 `same_style` / `style_note`。
2. `images.js` 里 `if (verdict.same_style === false) verdict.same_person = false;`，
   并把理由写进 `differences`（它同时是下一次重画的依据）。
3. **选片改为先比"是否同一人"、再比分数**：

```js
const rankOf = (v) => { if (!v) return 1; if (v.same_person && v.score >= minScore) return 3; if (v.same_person) return 2; return 0; };
const accepted = !verdict || rankOf(verdict) === 3;
const rNew = rankOf(verdict), rOld = best ? rankOf(best.verdict) : -1;
const better = !best || rNew > rOld || (rNew === rOld && verdict && verdict.score > best.score);
```

   报告侧同步：`per_shot` 增加 `style_break` / `style_note`，末尾单独列出"风格断裂"的镜头
   （**风格断裂和"一致度低"是两种病，要分开报**：前者毁的是全片统一感，后者毁的是"这是不是同一个人"）。
   回归测试 `out/_qa/test-style-gate.js`（19 项，含"旧排序会选错成卡通"这条反向断言）。
4. 生成侧的杠杆是**在守卫里写一条 STYLE**（单句、最短、放在第一条）：
   `photorealistic live-action photograph of a real girl ... NOT a 3D cartoon, NOT anime, NOT an illustration, NOT a doll.`

### 一句话教训

**"同一个人"和"同一种媒介"是两个独立的门禁，缺一个都会静默放行。**
而选片规则如果不与门禁的判据同向，"高分但错误"的产物一定会胜出。

## 坑位 46 — 门禁判失败，人眼判通过：**低分不等于坏图**，必须逐张目检再决定重画（2026-09-23「月饼卖不动」实测）

### 现场

16 镜跑完后报告是 `通过 12/16`，四个"未达标"：S06=25、S09=35、S10=35、S13=35。
但把 16 张拼成接触表逐张看：**这四张都是同一张脸、同一条红裙、同一种实拍摄影风**，肉眼没有任何问题，
而且都在中景/远景、光线复杂（夜市红灯笼）—— 正是视觉裁判最容易误判的场景。
反而真正有问题的两张（S05 发型、S16 卡通）**都拿了 92 分**。

### 结论

- **一致性分数的两个方向都不可靠**：它会误杀（光线/景别/角度造成的差异被当成"不同人"），
  也会漏放（"像同一个人"就通过，不管媒介和发型细节）。
- 所以 **`identity_report.json` 是线索不是判决**。每轮关键帧跑完，标准动作是
  **拼一张接触表目检**（16 张用 `ffmpeg -start_number 1 -i "shot_S%02d.png" -filter_complex "scale=440:-1,tile=4x4"`），
  再对被报警的镜头**单张放大**确认，然后才决定重画哪几张。
- 一条实用的分界线：
  - 门禁报警 **+ 人眼也看出不对** → 立刻 `--only <镜号> --force`（配 `shotLocks` 定点锁）；
  - 门禁报警 **+ 人眼看不出问题** → 接受，并在 QA 记录里写明"门禁误判，理由"；
  - 门禁给高分 **+ 人眼看出不对** → **最危险的一种**，必须重画（这正是 S05/S16 的情况）。

### 一句话教训

**门禁负责把可疑的挑出来，人眼负责判决；两者不一致时，人眼赢 —— 但要把判决理由写下来。**

### 一句话教训（本轮三连）

**模型不会因为你"写了"就照做，它只会因为"某一条写得最响"而照做。**
所以：关键约束要**短、要少、要按代价排序**；验证要用**只属于该约束的字符串**；
而门禁与人眼不一致时，永远**相信你眼睛看到的那张图**。

---

## 坑位 47 — 9:16 派生版**只搬分镜不搬人物资产**，竖屏版会另起炉灶生成另一个主角（2026-09-23「月饼卖不动」实测 · 项目侧已修）

### 现场

`make-916-clone.v2.js --src <16:9> --dst <9:16>` 跑完打印 `CLONE_OK shots=16 kf_patched=16`，
看起来很成功。但目标目录里只有 `00_source/` + `01_plan/` + `project.json` —— **没有 `02_images/`**。

这时如果直接 `node images.js --project <9:16 项目>`：

1. 没有 `ref_*.png` → 它会**从头生成一套新的人物参考图**；
2. 没有 `character_lock.json` → 它会**重新做一次视觉反读**，得到一份新的身份锁。

结果就是：16:9 的阿满和 9:16 的阿满是**两个人**。而两版本来应该是
「同一个 MV 换画幅」（这正是当初不做二次规划、改用克隆的理由），
一旦人物分叉，这个前提就作废了 —— 而且门禁不会报错，因为每一版各自内部都是"一致"的。

更糟的是，重生成参考图意味着**把坑位 43 那一整套返工再走一遍**（本片参考图连废三轮）。

### 修法（三件事，缺一不可）

```js
// 1. 把人物/场景参考资产原样搬到竖屏项目（关键帧必须重画，参考图绝不能重画）
复制 ref_*.png（含 .url） + character_lock.json —— 不要复制 shot_S??.png

// 2. 把加固配置一起搬过去，否则 harden 钩子读不到 refGuard / shotLocks
复制 <16:9>/_qa/harden.yb.json -> <9:16>/_qa/harden.yb.json

// 3. 跑关键帧时显式 --skip-refs，禁止它再动参考图
node step-yb.js images --portrait --skip-refs
```

**断言**：搬完必须确认 `character_lock.json` 里 `_source === "storyboard"`。
如果是 `vision-from-sheet`，说明搬错文件或锁被反读过，竖屏版的人设仍会漂。

### 为什么参考图可以跨画幅复用

`ref_face.png` 是面部特写、`ref_charsheet.png` 是设定表、`ref_body_*.png` 是全身转体 ——
它们承载的是**身份**（脸、发型、服装），不是构图；画幅是写在提示词里的构图指令。
`ref_scene_*.png` 是横屏场景锚点，也可以复用（竖屏提示词里的
`Vertical 9:16 portrait composition` 会压过锚点的横屏倾向，实测两版场景仍然认得出是同一处）。
真正必须按 9:16 重画的只有 `shot_S??.png`。

### 一句话教训

**派生版"共享资产"这句话，必须落到具体文件上核对 —— 克隆脚本没搬的，就是你以为它搬了的。**
克隆完成后先列一遍目标目录，缺 `02_images/` 就补，再去跑生图。

---

## 坑位 48 — 克隆把 `project.json` 里的**绝对路径**也一起搬了，派生项目一直在读母版分镜（2026-09-23「月饼卖不动」实测 · 已修脚本）

### 现场

`make-916-clone.v2.js` 打印 `CLONE_OK shots=16 kf_patched=16 vp_patched=16`，
派生目录里 `01_plan/storyboard.json` 的 `meta.aspectRatio` 也确实是 `9:16`，
关键帧提示词末尾也确实挂上了 `Vertical 9:16 portrait composition`。

于是竖屏关键帧跑了 11 分钟、消耗 8 次生图额度，出来 16 张图 —— **全是 2624×1472 的横图**。

日志里唯一的线索是一行不起眼的 `aspect=16:9`：

```
shots=16  aspect=16:9  size=2K  concurrency=2  keys=4
```

查下去发现：

```
cli.loadProject("<9:16 项目>").storyboard
  -> D:\...\mv-月饼卖不动\01_plan\storyboard.json     ← 母版的！
```

`project.json` 里躺着 `"storyboard": "<母版>\\01_plan\\storyboard.json"`。
plan/images/videos 各阶段都会往 `project.json` 写绝对路径，克隆时原样复制过去，
于是派生项目读的是**母版分镜**——横屏 prompt + `meta.aspectRatio=16:9`，
**竖屏构图指令压根没进过提示词**。画幅是 `meta.aspectRatio` 决定的，不是提示词里的文字。

### 为什么难发现

三个"看起来都对"的信号把人骗过去了：克隆成功打印、目标分镜确实是 9:16、
提示词里的竖屏指令确实存在。**只有 `aspect=16:9` 那一行是真的**，而它混在启动横幅里。

### 修法

1. **克隆脚本**：复制 `project.json` 后，把所有以母版目录开头的绝对路径改写到目标目录
   （递归处理所有字符串值，别只改 `storyboard` 一个键），并保证 `storyboard` 指向自己：
   ```js
   const relocate = (v) =>
     typeof v === "string"
       ? (norm(v).startsWith(SRC_N + "/") ? DST + norm(v).slice(SRC_N.length) : v)
       : Array.isArray(v) ? v.map(relocate)
       : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, relocate(x)]))
       : v;
   ```
   打印里带上 `paths_relocated=N` 和 `storyboard=...`，让这一步**可见**。
2. **已跑歪的项目**：`out/_qa/fix-916-project-json.js --src <母版> --dst <派生>`
   （改写路径 + 清空 `stages.images` + 断言 `cli.loadProject` 解析到自己的分镜、分镜 `meta.aspectRatio === "9:16"`、
   每镜 `keyframe_prompt` 含 `9:16 portrait composition`）。
3. 然后 `--force` 重画关键帧。旧图不要删，归档留证。

### 一句话教训

**画幅由 `meta.aspectRatio` 决定，不由提示词里的"竖屏构图"四个字决定；
而 `meta` 来自 `loadProject` 解析到的那份分镜 —— 先确认它解析到了哪一份，再花额度。**

---

## 坑位 49 — 分镜**自己**就写着"卡通化"，污染每一镜；守卫再强也压不过原生字段（2026-09-23「月饼卖不动」实测 · 已修源码 + 已加规划期检查）

### 症状

16 镜里冒出多张 3D 卡通／二次元渲染（16:9 的 S04 整张都是，竖屏更多），
而参考图与设定表是实拍摄影，两相对照完全断裂。一致性门禁**全部放行**。

### 根因：污染源不止一处，且每一处都覆盖全片

全字段扫描分镜后发现 5 处：

| # | 字段 | 原值 | 为什么致命 |
|---|---|---|---|
| 1 | `meta.styleHint` | 「卡通化的夸张俏皮质感…**不要写实纪录片质感**」 | 进每一镜 GRADE 行 |
| 2 | `visual_style.look` | 「卡通化夸张俏皮」 | **就是 GRADE 行的主体**，覆盖每一镜关键帧与场景锚点 |
| 3 | `visual_style.negatives` | 含 `documentary` | 否定"纪录片/写实"＝把画面往卡通推，**反向助力** |
| 4 | `character.params.eye_shape` | `large round **cartoon**-eyes` | 进身份段，每镜都念一遍"cartoon" |
| 5 | S14/S15/S16 的 `keyframe_prompt` / `video_prompt` | 内嵌 `cartoon-eyes`、`cartoonish smile` | 直接进模型 |

**为什么守卫输了**：守卫是**后置追加**的抽象措辞（`photorealistic, NOT a 3D cartoon`），
分镜字段是**原生、具体、位置靠前**的措辞。同一条提示词里两条指令打架，后者赢。

**为什么门禁全放行**：坑位 45 的同一条——门禁只比"是不是同一个人"，不管媒介。
（坑位 45 修完 `same_style` 后，本轮竖屏关键帧才第一次*自动*抓出 S05/S12 的卡通断裂。）

### 处置顺序

1. **先全字段扫描，别只改你看到的那一个**。一个脚本扫完所有字符串字段，
   命中 `cartoon|anime|卡通|二次元|动画|CGI|documentary|写实` 就打出来：
   ```js
   const scan = (o, p) => { /* 递归所有字符串 */ };
   scan(storyboard, "");
   ```
2. **区分正向与负向再判定**。`negatives` 里的 `cartoon` 是解药，
   styleHint 里「不要 3D 卡通」也是解药——**只看词不看语境会把修好的文案误判成病因**。
   判定写法：命中后回溯 24 字符，看到 `不要|NOT|not |never|without|avoid` 就放过。
3. `negatives` 里的 **`documentary` 必须删**：要实拍却否定纪录片，是自相矛盾。
4. 逐镜提示词里内嵌的 `cartoon-eyes` / `cartoonish` 一并替换。
5. 改完断言：镜头数／时间轴末端／时长和／画幅／id 序列**一字未动**，才准写盘。
   现成脚本：`out/_qa/fix-cartoon-style.js`（本片用它，18 项断言全绿）。

### 已修进源码：规划期就能抓住

`plan.js` 的 `validateStoryboard()` 新增 **advisory：媒介自相矛盾**，放在所有结构性早退**之前**
（它是 advisory 里代价最高的一条，分镜哪怕不完整也值得先说）。

只报**纯自相矛盾**两种：
- 正向要求卡通，负向清单里却又写着 `cartoon`
- 正向要求写实，负向却又否定 `写实／documentary`

**故意不报**「正向卡通 + 负向写实」——那正是想要卡通时的正当写法，
规划阶段无从知道参考图走哪种媒介，报了就是误伤。
回归测试 `out/_qa/test-medium-contradiction.js`（5 组，含"干净的纯卡通分镜不该误报"）。

### 一句话教训

**媒介是唯一一个"分镜里写错一个词就污染全部镜头"的字段。**
改它不花一分钱，而等出完 16 张图再靠人眼发现、整轮重做，代价是一整个下午。

---

## 坑位 50 — `--force` 重画后，视觉判分缓存仍按**文件名**返回旧缩略图（2026-09-23「月饼卖不动」实测）

### 症状

修好提示词、清空污染后 `--force` 重画，门禁分数却和上一轮一模一样——
包括那些你**已经确认改对**的镜。

### 根因

`02_images/.vision_cache/` 里存的是送进视觉模型前的缩略图，文件名形如
`shot_S01.png.v768.jpg`——**按源文件名索引**。
`--force` 覆盖的是 `shot_S01.png` 的**内容**，文件名没变、mtime 也不参与 key，
于是门禁拿上一轮的旧缩略图去判这一轮的新图。

危险在于它不会报错：**分数照给，只是给的是错的**。
刚装上的 `same_style` 判据（坑位 45）也会因此失效——它比的是旧图对旧图。

### 处置

重画前先把缓存挪走（**重命名，别删**，它是可重建的但要留证据）：

```js
fs.renameSync(dir + "/.vision_cache", dir + "/.vision_cache_stale_" + yyyymmdd);
```

每次 `--force` 重跑前都做一遍，尤其是"改了提示词再重画"的场景。

### 一句话教训

**任何按路径缓存的派生数据，在"内容变了名字没变"的重跑里都是脏的。**
重跑前问一句：这一步有没有读缓存？缓存的 key 是什么？


## 坑位 51 — API 服务端 hang 时，流水线**静默卡死**几十分钟，不报错也不退出（2026-09-23「月饼卖不动」实测）

### 症状

`--only S11,S12 --force` 只重画 2 张图，却跑了 29 分钟没有任何新产出。
日志停更、进程还在、CPU 不动。上一轮 16 镜也才 26 分钟，明显不正常。

### 根因

`api.agnes-ai.cn` 的 `/v1/chat/completions` 端点**连得上但不应答**：

| 检查 | 结果 |
|---|---|
| DNS | ✅ 解析正常 |
| TCP 443 | ✅ 握手成功 |
| HTTP POST | ❌ 45s 无响应（4 个 key 全部） |

`vision.js` 的超时是 `timeout: 300000`，外面还套着 `withKeyRetry` 的 key 轮转重试。
于是「一次 5 分钟超时 × 4 个 key × 若干轮」可以静默拖到几十分钟——
**没有报错、没有退出码、没有 stderr**，看起来就像"还在慢慢跑"。

同源问题早些时候还表现为 **HTTP 401**（4 个 key 同时），那是另一种失败模式：
key 失效时也是静默重试，不会立刻崩。

### 怎么发现（本环境 stdout 不可靠，必须看文件）

① **看产物文件的 mtime idle**：

```js
const st = fs.statSync(path.join(dir, f));
console.log(f, "idle=" + Math.round((Date.now() - st.mtimeMs) / 1000) + "s");
```

`idle` 稳定在几十秒 → 还在推进；持续增大到 5 分钟以上 → 基本可以判定卡死。

② **单独探测服务端**（不要靠流水线日志）：

```js
// DNS -> TCP -> HTTP 三级定位，45s 硬超时，结果落盘后 Read
dns.lookup("api.agnes-ai.cn")            // 解析
net.connect({ host, port: 443 })         // 握手
https.request({ ..., timeout: 45000 })   // 真正的应用层
```

三级分开测才能区分「网络断了」「服务挂了」「key 废了」。

### 处置

1. 先 kill 卡死的后台任务（`TaskStop`），别让它继续空转烧重试。
2. **已生成的图不受影响**——判分是后置的，图已经落盘。
   立刻改走**人工目检**（拼接触表，零额度），这本来就是闸门流程的正路。
3. 服务端恢复后，**不带 `--force`** 重跑一次即可补上判分：已存在的图会被复用，
   只补跑缺失的判分，不重复烧图像额度。
4. 重跑前先清掉这两镜的 `.vision_cache` 条目（坑位 50）。

### 一句话教训

**「还在跑」和「还活着」是两回事。**流水线没有心跳、没有超时上限时，
判断存活状态只能看**产物 mtime**，判断根因只能**分层探测**。


## 坑位 52 — `spawnSync` 把 stdin 开成管道 → Windows 上 EBUSY，且**门禁被静默跳过**（2026-09-23「月饼卖不动」实测 · 已修源码）

### 症状（三重，一层比一层隐蔽）

```
[QA] S11 视觉校验失败（跳过，按通过处理）: Failed to launch ffmpeg: spawnSync ffmpeg EBUSY. Is ffmpeg installed and on PATH?
```

1. **spawn 直接失败**：`status=null`、`error.code = "EBUSY"`、stderr 为空、**0 秒返回**。
2. **门禁被跳过且按"通过"处理**——画面质量检查整段不执行，日志里只有一行警告。
3. **收尾照常写报告** → 把 `identity_report.json` 从 `14/16` 覆盖成 **`0/0`**。
   图一张没丢，丢的是元数据；而下游和人工审查都拿这份报告当依据。

`ffmpeg -version` 在 bash/cmd 里跑得好好的，所以很容易误判成"ffmpeg 没装/PATH 不对"。

### 根因

`child_process.spawnSync` 的默认 `stdio` 是 `['pipe','pipe','pipe']`——**stdin 也是匿名管道**。
Windows 上，MSYS2/MinGW 构建的 `ffmpeg.exe` 遇到管道 stdin 会 spawn 失败并报 EBUSY。
实测对照（同一个 ffmpeg、-version）：

| stdio | 结果 |
|---|---|
| 默认（stdin=pipe） | ❌ EBUSY |
| `['ignore','pipe','pipe']` | ✅ |
| `'ignore'` | ✅ |
| `shell: true` | ❌ EBUSY（默认也是 pipe） |

**不只是 ffmpeg**——`spawnSync(node, …)` 启动子脚本同样会中招，
表现为"启动器 0 秒退出、EXIT=null、什么输出都没有"。

### 处置

凡是 `spawnSync`，**stdin 一律 `ignore`**，只在真要写 stdin 时才开 pipe：

```js
spawnSync(cmd, args, {
  encoding: "utf8",
  stdio: opts.input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  input: opts.input,
});
```

已修：`scripts/lib/ffmpeg.js` 的 `run()`，以及自建的启动器与拼图脚本。

### 更重要的教训：失败必须"响"，不能"静默放行"

这次真正的损失不是 spawn 失败，而是**失败后按通过处理并把报告清零**。
凡是"检查失败就跳过"的分支，都要问三句：
- 会不会**覆盖**已有报告？
- 结果里能不能**看得出这是跳过而不是通过**？
- 关键校验（风格/人数/文字）失败时，该**中断**还是放行？

**门禁的意义在于挡住坏图；一个会静默放行的门禁比没有门禁更危险**，
因为它让人以为自己有把关。

### 一句话教训

**Windows 上 spawnSync 失败先看 stdin，别急着怀疑 PATH。**
而任何"失败即跳过"的兜底，都必须留下无法被误读成"通过"的痕迹。


## 坑位 53 — VLM 一致性判分噪声极大：同一张图两次能差 60 分，**单次分数不能当裁决依据**（2026-09-23「月饼卖不动」实测）

### 症状

一张**从未改动**的关键帧，第 5 轮门禁判 92 分通过，重判一次变成 28 分不通过——
而且两次的 `differences` 描述**几乎一字不差**（都说"参考图双马尾、待检图单马尾"）。
同样的差异，一个给 92，一个给 28。

另一镜三次重判：**35 / 35 / 92**，极差 57。

### 为什么危险

流水线把 70 分当硬门槛，于是"过不过"变成了抽奖：
- 噪声让好图被判死 → 反复重画，白烧图像额度（本次 S11 连画 6 次）
- 噪声让坏图被放行 → 与门禁存在的意义相反

### 判据：用**分布**而不是单次值

对存疑镜头重复判 3 次（`compareIdentity` 同一个 pool 即可），看两件事：

| 观测量 | 判读 |
|---|---|
| 中位数 ≥70 且极差小 | 稳定通过，低分那次是噪声 |
| 三次都低（如 30/35/15） | 多半**真有问题**，去看图 |
| 极差 >40 | 判分在该图上不可靠，**必须人眼裁决** |

再加一条**交叉信号**：统计 3 次里被反复提到（≥2 次）的关键词。
真硬伤会每次都点到同一处（如"单马尾""丸子头"）；
噪声则每次换个说法。

本次用这个方法把 3 个"未过"镜区分开：
S03 中位 92（噪声，过）、S05 极差 57（不可信，交人眼）、S06 三次全低（真可疑，交人眼）。

### 顺带：判分自己也在报参考图的问题

多次出现「**参考图**为 AI 3D CG 质感，待检图为实拍摄影」——
如果参考资产本身就偏 CG/幼态，所有镜头都会比对困难，
且 `same_style` 会因为"参考图是 CG"而把正确的实拍图判成风格断裂。
碰到这种反向指控时，**先怀疑参考资产，再怀疑镜头**。

### 一句话教训

**VLM 判分是意见，不是测量。**单次分数只能当线索；
要下结论就重复采样看分布，最终裁决永远是人眼。

## 坑位 54 — 拼目检图时 xstack 的 layout 用「自身宽高」当累计偏移，画面会**互相重叠**，目检结论随之失效（2026-09-23「月饼卖不动」实测）

### 症状

横排 4 张对比图写成：

```
layout = "0_0|w0_0|w1_0|w2_0"
```

看起来像"第 3 张放在前两张之后"，实际 `w1` 是**第 1 个输入自身的宽度**（`w1 == w0`），
不是累计偏移。于是第 2/3/4 张全部落在 `x=w0` 的同一个位置，**只露出最上面那张**。

更隐蔽的是：**ffmpeg 不报错，照常出图**。文件存在、尺寸正常、脚本输出 "OK"，
只有把图打开才看得出少了几张——而 AI 看不了图，用户又默认"脚本给的就是对的"。

### 后果有多严重

本项目里用户基于这张失真的对比图对 S05/S06 作出了"可以"的裁决。
等发现时，视频（烧额度）已经跑完了。**目检工具出错 = 整条闸门失效**。

### 正确写法

偏移量必须是**累计和**，等宽/等高时可重复引用 `w0`/`h0`：

```js
const cellX = (c) => (c === 0 ? "0" : Array(c).fill("w0").join("+")); // w0, w0+w0, w0+w0+w0
const cellY = (r) => (r === 0 ? "0" : Array(r).fill("h0").join("+"));
const layout = items.map((_, i) => `${cellX(i % COLS)}_${cellY(Math.floor(i / COLS))}`).join("|");
```

### 自检（必做，零成本）

拼完用 ffprobe 量输出尺寸，跟"格数 × 单格宽高"对一下：

```
1600x880  ==  4 列 × 400 宽 ×  4 行 × 220 高   ✅
800x220   ==  全叠在一起                        ❌
```

`tile=WxH` 滤镜不走 layout，**不受此 bug 影响**（本项目 `make-contact-sheet.js` 的 shots 模式因此幸免）。

### 一句话教训

**目检工具本身也要被目检。**凡是用来支撑"过/不过"裁决的脚本，
第一次产出时都要用一个能自动验证的旁证（尺寸、格数、文件数）确认它没骗你。

---

## 坑位 55 — 对比图格子高度不齐 → 用户看到"第一张只有一半"（2026-09-23「月饼卖不动」实测）

xstack 的每一格保持**自身缩放后的尺寸**。把长宽比不同的图（参考图 149×386、关键帧 1472×2624）
并排时，矮的格子下方会露出大片黑底 —— 用户看到的直观描述是"第一张只有一半"。

**修法**：`--h N` 统一格高，用 pad 居中补边：

```
scale=W:H:force_original_aspect_ratio=decrease, pad=W:H:(ow-iw)/2:(oh-ih)/2
```

**自检**：拼完量输出宽高是否等于 `格数 × 单格尺寸`（如 4 格 × 300 宽 = 1200）。

---

## 坑位 56 — `videos.js` 遇到已存在的 clip 会**静默跳过**，退出码仍是 0（2026-09-24 实测）

### 症状

关键帧全量重做（16 张全换）之后跑视频，输出：

```
to generate: 0    already present: 16    blocked: 0
⚠ 16 个已存在的镜头其首帧比成片更新（首帧改过但镜头没重拍），本次仍沿用旧镜头
Nothing to do.
EXIT=0
```

**它只打一行 ⚠ 就正常退出。**不报错、不失败、退出码 0。
如果不读 stdout，会以为视频已经重做完了 —— 成片里留的全是旧形象。

### 为什么容易中招

这是「跳过已完成工作」的设计（续跑中断任务时很有用），
但它**无法区分**"这个 clip 是上一轮中断留下的、可以继续用"
和"这个 clip 的首帧已经被替换、必须重拍"。

同类模式在本项目已出现三次（坑位 25 缓存中间片、坑位 52 门禁静默放行、本条）：
**会静默放行的东西比没有的更危险** —— 它给了你一个假的"已完成"。

### 正确做法

重做关键帧之后、跑视频之前，**必须**先清空或归档 `03_clips/shot_*.mp4`：

```js
// archive-clips-yb.js：归档而不是删除，出问题还能捞回来
for (const f of readdirSync(clipsDir)) if (/^shot_S\d+\.mp4$/.test(f)) rename(...)
```

**自检**：跑完视频后立刻核 `CLIPS_READY=16/16` 且 `to generate` 等于镜头数，
而不是只看退出码。

---

## 坑位 57 — 同步脚本整体 `copyFileSync`，会冲掉目标项目**自有**的 shotLocks（2026-09-24 实测）

双画幅项目里，`sync-harden-*.js` 的用途是把母版 16:9 的 `harden.json` 同步到 9:16。
原来的实现是一行 `fs.copyFileSync(A, B)`。

**后果**：9:16 那套经用户目检单独调过的「清瘦鹅蛋脸」shotLocks 被母版整体覆盖，
S03 的分数当场从 82 掉到 35 —— **修好的问题被脚本改回去了**。

### 正确做法：合并，且目标项目已有键优先

```js
const merged = Object.assign({}, a.shotLocks, b.shotLocks); // b 是目标，冲突时 b 赢
const out = Object.assign({}, a, b, { refGuard: a.refGuard, shotLocks: merged });
```

- **全局项**（refGuard / subjectNoun / mirrorShots…）照抄母版 —— 它们必须一致
- **shotLocks 合并**，目标项目已有的键优先 —— 那是按该版本的实际出图调过的

**自检**：同步脚本必须打印「同步前 / 同步后」的 key 列表并断言 `丢失 = 0`。

---

## 坑位 58 — 辅助脚本写死 16:9 路径，竖屏项目会去判**母版**的图（2026-09-24 实测）

`crosscheck-*.js`、`scores-*.js` 这类自研排查脚本，第一版几乎都会把
`mv-XXX/02_images` 写死。在双画幅项目里跑竖屏时，它会——

**拿着竖屏的分镜去判母版的图**，出来的分数看着"有高有低"，其实跟竖屏一点关系都没有。

**修法**：统一加 `--portrait` 开关，路径和日志都跟着切：

```js
const PORTRAIT = process.argv.includes("--portrait");
const ROOT = PORTRAIT ? ".../mv-XXX-9x16" : ".../mv-XXX";
const LOG  = PORTRAIT ? "crosscheck-916.txt" : "crosscheck.txt";
const argv = process.argv.slice(2).filter(a => a !== "--portrait"); // 位置参数要重算
```

注意：`argv` 过滤 flag 之后**位置参数的下标会变**，`argv[0]` 才是 shots，别再用 `argv[2]`。

---

## 坑位 59 — 配饰/道具描述不到"识别级"，每镜自由发挥；几何朝向必须显式写（2026-09-24「月饼卖不动」实测）

### 症状
主角的挎包样式每镜在变（颜色变、横竖变、徽章时有时无），运动镜头里还长出"不合理的包"。
而锁里明明写了包——`a small canvas crossbody bag with red tassels`。

### 根因
这句话**没有任何可识别特征**：什么颜色？横的还是竖的？有没有盖？有没有徽章？系带什么样？
全都没写，模型每镜只能自由发挥。文字锁的粒度必须到"看一眼能从画面里认出来"的程度：
**颜色 + 材质 + 形状结构（含几何朝向）+ 标志性装饰 + 携带方式**，五项缺一不可。

最隐蔽的是**朝向**：写了 `full-width front flap`（全宽翻盖）——"全宽"这个词本身暗示横向，
模型就画横向包。带几何朝向的道具（包/挂牌/灯笼/立牌）必须显式写
`VERTICAL — clearly TALLER than it is WIDE` 或 `WIDER than TALL`。

### 处置（四步，与主技能 1.1b / 2.4b 对应）
1. 用户指定"保持这个样式"→ **直接要一张特写参考图**（入库 `ref_<道具>.png`），按图逐项写锁；
2. 锁写进 `character_lock` 的 accessories + 加固层 `refGuard` 单句条（不挤占原有 4 条）；
3. **试点**：先重画 1 个道具戏份最重的镜，人工对比参考图验收（见坑位 60）；
4. 试点通过 → **全量重做关键帧 + 视频**（道具描述随 wardrobe 注入全部 16 镜，
   指认个别镜头只能救急）。

### 服饰同理：必须用户逐项确认
实测锁里鞋写"白鞋红带"，用户参考图是"红鞋白带"——**最初设定表就是错的，从未逐项确认过**。
用户给全身参考图后逐件核对颜色方向。写锁脚本要做成**幂等单一锁源**（可重跑、带断言、
断言里放反向检查：不得再出现 `full-width front flap` 这类已证错的措辞）。

### 一句话教训
**门禁只判人脸，道具必须人眼验**；文字锁的粒度 = "识别级"，朝向 = 显式 orientation。

---

## 坑位 60 — 视频阶段静默跳过：`videos.js` 遇到已存在 clip 直接复用，成片保留旧形象（2026-09-24 实测）

### 症状
关键帧全量重画后跑 `videos`，十几秒就结束，输出 `to generate: 0 / already present: 16`，
stdout 打一行 ⚠ 就正常退出（EXIT=0）。直接 assemble 下去，**成片里全是旧形象**——
首帧换了、镜头没重拍。

### 根因
`videos.js` 的断点续跑逻辑：`03_clips/shot_SXX.mp4` 存在 → 跳过生成。这是为"断点续跑"
设计的，但**重做关键帧之后它就变成了静默陷阱**——没有"首帧变了、clip 该重拍"的判断。

### 处置
重做关键帧后、跑视频前，**先归档旧片段**：

```js
// out/_qa/archive-clips-yb.js —— mv 与 mv-9x16 两版一起处理
// 03_clips/*.mp4、04_build 中间产物、05_output 成片 → _archive/old_<原因>_<时间戳>/
// 同时把 project.json 的 stages 里 clips/assemble/subtitles/verify 置 done=false
```

这类"会静默放行的门禁比没有门禁更危险"的模式已经见到第三次了
（坑位 31 空镜门禁判失败照收、坑位 52 校验失败按通过处理、本条 clip 复用不重拍）。
**凡是"已存在就跳过"的逻辑，重做上游之后都要显式清空下游。**

### 一句话教训
关键帧重做 ≠ 成片更新。中间产物不会自己知道上游变了，**重做链路上每一层的旧产物都要人工清**。

---

## 坑位 61 — 同步脚本整体覆盖会冲掉目标项目自有的逐镜锁（2026-09-24 实测）

### 症状
把母版新加的 shotLocks 同步到 9:16 项目后，9:16 的 S03 从 82 掉到 35——
它自己那套「清瘦鹅蛋脸」锁（用户目检确认的方向）**被母版覆盖没了**。

### 根因
同步脚本用 `copyFileSync` 把母版 `harden.yb.json` 整个复制过去。母版文件里没有 9:16 的
S01/S03/S09 瘦脸锁（那是竖屏独有调出来的），复制即删除。

### 处置：合并，且目标项目已有键优先
```js
function mergeHarden(master, target) {
  const out = { ...master };                                  // 全局项照抄母版
  out.shotLocks = { ...master.shotLocks, ...target.shotLocks }; // 逐镜锁合并，目标已有键优先
  return out;
}
```
**双画幅项目里，两个项目的 shotLocks 是两套独立调参结果，不是一份配置的两次拷贝。**
全局项（refGuard/styleGuard/subjectNoun）可以单向同步；逐镜锁必须合并。

### 一句话教训
配置同步先分清**全局项**（可覆盖）和**项目独有调参**（必须合并保留），后者覆盖 = 静默回退到未调参状态。

---

## 坑位 62 — 队列满 503（video_queue_full）是限流不是故障，自动重试可全收（2026-09-24 实测）

### 症状
视频批量生成时反复出现 `HTTP 503: video_queue_full 视频队列已满`，最多连吃 6 次。

### 处置
**不用干预**。`videos.js` 内建退避重试（最多 31 次，间隔递增），实测 32 段视频全部成功。
判据：重试日志后面跟着 `task created` 就是恢复了；只有连续 31 次都失败才是真不可用。
批量跑视频时看到 503 继续等即可，不要手动 kill 重跑——那反而会浪费已入队的任务。

### 一句话教训
**先看重试上限和退出码，再决定要不要人工干预**；限流类错误的正确姿势是等，不是重跑。

---

## 坑位 63 — video-lock-cmv.py 剥锁白名单不含自定义锁，重跑会重复注入（2026-09-24 实测）

### 症状
`shotLocks` 里写了自定义锁（如 `FOOTWEAR MOTION LOCK (mandatory)`、`HAND LOCK`），
第二次跑 `video-lock-cmv.py` 时 video_prompt 里出现**两份一样的锁**，提示词越滚越长，
挤占预算后真正重要的镜头动作描述被 API 截断。

### 根因
注入器 `strip_locks()` 只按内置 `MARKERS` 白名单剥锁（IDENTITY/EMPTY/BODY-PART/MIRROR/
NO-TEXT 等 9 个），**自定义逐镜锁不在名单里**——剥不掉，注入时又追加一份。幂等只对内置锁成立。

### 处置（已修在 `out/_qa/video-lock-cmv.py`）
剥锁加一条兜底正则，与白名单并用：
```python
keep = [s for s in keep if not re.search(r"LOCK \(mandatory|NO TEXT LOCK", s)]
```
所有锁句（内置 + 自定义）统一含 `LOCK (mandatory` 短语；新增自定义锁时只要保持这个
命名约定，剥锁就自动覆盖，不用再改白名单。

### 一句话教训
**白名单式剥离天然追不上新增锁类型**；锁句要有统一命名签名（如 `LOCK (mandatory`），
剥离按签名兜底，注入按配置驱动，才能真幂等。

---

## 坑位 64：API 端间歇性丢任务（404 任务不存在）

**现象**：视频生成任务创建成功（拿到 task_id），但轮询时持续返回
HTTP 404「任务不存在」，多把 key 轮流惩罚冷却也没用，每镜 3 次重试全 404 后放弃。
**判定**：与提示词/参数无关——同一批里其他镜头正常完成，甚至同一镜头之前也遇到过
404 但自愈成功，说明是**服务端间歇性抖动**（任务被服务端丢弃）。
**处置**：不要浪费时间排查提示词，直接 `--only` 补跑缺失镜头，实测 9/9 全部一次成功。
**关键动作**：批量跑片结束后**必须核对 03_clips 的 clip 数量**（videos.js 只在日志里报
progress N/28，`| tail` 切片会把单镜失败详情吞掉），缺几镜补几镜再进 assemble。

### 一句话教训
**服务端丢任务≠本地配置错**；先数片段、再补跑、别动提示词。

## 坑位 65：ffmpeg/ffprobe 选项混淆

`-print_format` 是 **ffprobe** 的选项，ffmpeg 不认（报 Unrecognized option）。
取时长/元数据用 ffprobe：`ffprobe -v quiet -print_format json -show_format <file>`。

## 坑位 66：tile 滤镜只接受单输入流

多图拼网格时 `tile` 不能直接接多个输入（报 More input link labels specified）。
必须先 `concat=n=N:v=1:a=0` 串成单流，再 `scale=...,tile=CxR`：

```
[i0:v][i1:v]...[iN:v]concat=n=N:v=1:a=0[cat];[cat]scale=W:-1,tile=3x4[out]
```

（xstack 能接多输入但 layout 要手算坐标；3×4 这类规则网格用 concat+tile 最省事。）

### 一句话教训
**tile 是单流滤镜**；多输入先 concat，规则网格不用 xstack。

## 坑位 68：图像模型对性感措辞安全降级 + 独立脚本漏挂 refGuard

**现象 A（措辞降级）**：设定表提示词写 "DEEP plunging keyhole ... framing her generous cleavage / full bust"，
图像模型会整句吞掉服装描述，回退成「素黑旗袍+闭领+无 cape+平跟鞋」的保守默认（4 张全中）。
**处置**：改用**结构化裁剪语言**——"deep V-shaped keyhole opening from the collar down to the mid-chest,
V edges trimmed with gold piping"、"curvaceous full-figured hourglass figure (full bust line, tiny waist)"，
并在 refGuard 尾注里写成 HARD requirement（"never close it, never shrink it"）。
**现象 B（独立脚本漏挂守卫）**：绕过管线手工调 `agnes.generateImage` 画设定表时，若不经
`-r harden-cmv.js` 预加载，prompt 末尾就没有 refGuard——cape/配饰/体型会被模型静默丢弃。
**处置**：独立测试脚本必须自己拼 `prompt + "\n\n" + harden.refGuard`（最后一条指令权重最高）。
**验证**：管线同款方式 + 结构化措辞后，评审 100 PASS（深 V 到胸口中央 + 丰腴体型 + 全套配饰）。

### 一句话教训
**"cleavage" 这类词会让模型连整套服装一起扔掉；写"领口开到哪、边缘怎么收"，别写"露什么"。**

## 坑位 69：局部改设定图用 i2i 定向编辑，别 t2i 重抽

**现象**：设定图整体已对、只想微调局部（口子深浅/体型胖瘦）时，改提示词重跑 t2i
方差极大——同一 prompt 连出白衬衫、闭领、素黑等完全崩坏结果（10 张里 2 张达标率），
且负向边界句（"must NOT run past the sternum"）会把整套设计一起压制回保守默认。
**处置**：走 **i2i 定向编辑**——`agnes.generateImage` 传 `images:[公网URL]`（生成时落盘的
`.url` sidecar；本地路径会 400，必须 URL 或 base64），prompt 写"只改 X、其余全部锁定"。
实测一次命中（95 PASS）：同脸同发型同构图，仅改指定部位。
**配套**：`.url` sidecar 是 i2i 与视频阶段的共同依赖，合格的候选图连同 `.url` 一起保留。

### 一句话教训
**微调用 i2i 锚定原图，重抽是抽奖；负向边界句是设计毒药，边界只许肯定式写。**

---

## 坑位 67：空镜斗不过生成先验——改意图，别死磕

**现象**：分镜要求空镜（characters_in_shot=[]），但生成模型给「漂走的画舫」反复画人影。
空镜锁（内置 emptyFrame）+ shotLock 空镜锁 + 基础提示词写死 "no one aboard" 三管齐下，
12 次尝试全部失败——生图模型对"无人的船"先验极强。
**处置**：烧到 3 次失败就该停，检查叙事上"有人"是否同样成立（船尾女子剪影与
本片 S03 的视觉语言一致），然后**把分镜意图改齐**：keyframe_prompt 改写成人影版、
characters_in_shot 改为 ["主角"]、video_prompt 剥掉 EMPTY FRAME LOCK 换身份锁句、
harden.shotLocks 里矛盾的空镜锁删掉。改齐后重拍一次即过（95 分）。
**注意**：改意图后务必同步 harden 配置，否则视频阶段的空镜锁会和画面里的人影打架。

### 一句话教训
**生成先验斗不过就顺着改意图**；意图改了，四处锁文（keyframe/video/characters/harden）必须一起改，不然自相矛盾。

## 坑位 68：QA 空镜检查的门禁误报与设计性镜像

- **设计性镜像**：分镜明确要求镜中倒影的镜头（如"坐在裂镜前，倒影展现半卸妆的脸"），
  身份门禁会报"主角出现 2 次"——这是误报，判定看分镜原文。处理：保留，标注交用户目检。
- **手部/腿部特写**：一致性门禁对无脸特写报"无法比对/低分"——设计使然，不是缺陷。
- 处置原则同坑位 67：**先读分镜原文，再决定是缺陷还是设计**。

### 坑位 69 补充（2026-09-25）：i2i 里调身材比例的措辞
- 绝对罩杯字母（"full C-cup bust"）在 i2i 里会被软化成 modest；
- 有效措辞是**相对量**："make her bust ONE FULL CUP SIZE LARGER than in the source image" +
  具体视觉描述（heavy/round/swelling above the opening/satin stretching over the curves）；
- 发型/配饰漂移时在 KEEP 列表加 "DO NOT change the hairstyle" 单独点名，比塞进长句有效；
- 评审打分解析用 /VERDICT[^\d]*(\d{1,3})/ 优先，别假设 "N/100" 格式（模型常写 "85 / PASS"）。

### 坑位 69 补充2（2026-09-25）：i2i 链式退化与混合路线
- **i2i 跳数越多脸越差**：T11→T12 连续两跳后脸糊+卡通化（用户实测反馈）；
- **绘画隐喻词会把 t2i/i2i 带成 CG 感**："gongbi-painting beauty"/"porcelain skin" → 三张全 CG；
  改 "refined classical Chinese beauty"+"natural skin texture with visible pores" 才保住实拍；
- **"real actress"/"film star"+身体描述会触发内容安全 400**（确定性拦截），一律不用真人指称；
- **混合路线最稳**：t2i（管线 prompt+refGuard）出脸（实拍+清晰+古典，但罩杯被安全软化）
  → 以 t2i 图为底**单跳 i2i** 用相对措辞补身材（one cup size larger），脸用 sharp 检查守住。

---

## 坑位 70（本次最有价值的预防性发现）：i2v 中途「多长一只手」＝ video_prompt 的否定枚举在反向召唤

**现象**（2026-10-03，916-S02 实测）：关键帧干净（双手交叠）、六项门禁全过、motion 达标；
但用户在成片里看到**从第 4 秒起变成 3 只手 + 第 4 条前臂**。

**判定**：静态看关键帧永远查不出来。必须**全时段抽帧数肢体**：

```bash
ffmpeg -ss $t -i cand.mp4 -frames:v 1 -vf "crop=iw:ih*0.16:0:ih*0.54,scale=1400:-1" out.jpg
```

⚠️ **数数量的裁切必须保留整幅宽度**。窄裁切会把另一只手切出画外，看着像"只剩一只手"，
反而误判（本次就踩到）。

**根因（三条，全在 `video_prompt` 的文字里，与画面/模型无关）**：

1. **否定枚举 = 反向召唤**。拼接的 `BODY-PART LOCK` 连着写
   `no face, no eyes, no head, no torso` / `No extra limb, no duplicated hand` / `no second person`
   —— 按坑位 55 / SOP §3.16、§3.28，"别多画一只手"实际是在点名那只手。
2. **与首帧自相矛盾**。该锁声称"全程不得出现躯干"，可**关键帧本身就是胸+手的构图**
   —— 提示词打自己的输入，i2v 只能"各执行一半"，画面开始漂。
3. **给没有脸的镜头写面部锁**。`NATURAL PERFORMANCE LOCK` 里的"自然眨眼、唇部微动"，
   而这一镜根本没有头 —— 又是在召唤头部与躯干回画。

**处置（已验证有效）**：把否定全部换成正向「数量锁 + 单动作 + 同景别锁」：

- `COUNT LOCK`：`EXACTLY TWO HANDS — one left hand and one right hand … one woman with exactly
  two arms and exactly two hands. The same two hands are present in every single frame from the
  first frame to the last.`（**正向点名数量 + 全程在场**，而非"不要多的"）
- 动作收敛成**一个明确、单调、不回头**的运动（"双手缓缓分开，a single unhurried separation
  that never reverses"），别让模型自己补戏。
- 构图锁改成**正向的"与首帧同景别"**（`holds the same close scale and the same amount of her
  body as the first frame`），删掉所有"不要出现 X"。
- **同步改 `subject_action`**，让 videos.js 的 motion-lint 兜底补写时也拿到同一套动作。

**预防（这次新加的工具）**：`assets/lint-prompts.js` —— 开跑视频前静态扫描整份 storyboard，
把上述三类句型和"首帧含手却无数量锁"一次性扫出来（零依赖、可当门禁，退出码非 0 即拦）：

```bash
node "<skill-dir>/assets/lint-prompts.js" --project "./mv-夜曲"          # 全量
node "<skill-dir>/assets/lint-prompts.js" --project "./mv-夜曲" --strict # WARN 也算失败（CI）
```

**本次用它复扫全片的结果**（工具随手做的第一次实战体检）：

| 版本 | 干净 | ERROR | WARN |
|---|---|---|---|
| 916（41 镜） | 29 | 20 | 8 |
| 169（36 镜） | 27 | 5 | 6 |

- **916 有 7 镜**（S07 / S13 / S20 / S26 / S28 / S34 / S39）带着与 S02 **完全相同**的三条坏句型
  —— 同一批局部肢体镜复制了同一段 `BODY-PART LOCK`。它们当时**碰巧**没出可见瑕疵
  （门禁全过、反向抽帧也过），但风险一直在，下次重跑随时可能爆。
- **169 有 5 镜**报 ERROR：S17（局部肢体镜的面部锁）、S21（一口气并列 8 条否定枚举）、
  S12 / S15 / S24（人物镜里的场景/年代护栏，如 `no smartphones, no screens, no phone…`）。

**结论**：这三类句型是可**静态**查出来的，成本几乎为零。**先跑 lint 再烧视频额度**，
比出片次日才被用户发现"多了一只手"再回滚便宜得多。

### 一句话教训
**i2v 里"不要多画一只手"会招来那只手**；肢体/人物数量必须**正向点名**，且"不该出现的东西"
用**裁切**或**锁与首帧一致**来实现，绝不能写成一串 `no X`。开跑前先过 `lint-prompts.js`。

---

## 坑位 71（2026-10-03，春风 v2 定妆实测）：正面构图 + 高领交领宽袍 ⇒ 胸前体积画不出来

**现象**：用户要求"用正面那张、胸前适当加大一小档"。连出 **6 张全部落空**，胸前一律是平直衣襟。

| 试法 | 写法 | 结果 |
|---|---|---|
| ① 形体句夹在构图段中段 | `bust one notch fuller … silk drawn taut` | 无效 |
| ② 形体句**压到提示词最末端**（权重最高区）+「腰比胸窄」对比锚点 | 同上 + `waist visibly much narrower than her bust is full` | 无效 |
| ③ 微侧 15°（脸仍正面） | `shoulders turn about fifteen degrees` | 无效 |
| ④ **以已签图为底做 i2i**，`Make ONLY ONE change` | 底图 = 已签的 A | **仍无效，且脸部身份漂移**（全图 i2i 把脸换成另一个人）→ 废片，不可当真源 |

**根因（两条）**：

1. **服饰形制先验压过形体描述**。高领 + 交领叠襟 + 宽袖外袍，模型把"胸前"理解成一片平整衣襟，
   丝绸像纸板；形容词权重再高也顶不过形制先验。
2. **正面投影天生没有体积线索**。胸廓的"饱满"靠**侧向轮廓线**表达；正面只能靠衣料被撑起的阴影，
   而这恰是模型最不愿意画的部分（要留白、要"仙气"）。

**处置（按成本排序）**：

1. **改角度**（最省，首选）：给 15–30° 侧身，或直接走侧向轮廓。本项目候选 A2 一次命中，曲线立刻读得出来。
2. **改形制**（须重签服装，**实测首选**）：内衬换成**齐胸 / 抹胸式**（唐制 qixiong：真丝横向束胸、肩颈敞开）。

   实测对比（同一天、同人设、同正面构图）：

   | 形制 | 结果 |
   |---|---|
   | **齐胸式**（横向束胸） | ✅ **一次命中**：真丝在胸前被撑成圆润隆起并带下方阴影，腰胸对比清楚 |
   | 交领敞成 V（领口开到胸下） | ❌ 无效：模型把 V 领画成**两片平板**，同样没有体积 |

   **关键不是"露出多少胸口"，而是"真丝横向束胸"这个结构本身** —— 横向的受力面才给体积一个落点。
   形制一对，再写"加大一档"就立刻落地（同一批里，V 领加不进去的量，齐胸版加得进去）。

   "轻纱流彩"的形制天生适合齐胸，与"丰韵"诉求自洽 —— 比在覆胸形制上死磕划算得多。
3. **局部裁切重绘**（最保形，已工具化 → `assets/local-redraw.js`）：裁目标区域 → i2i 重绘 → 羽化贴回。

   **全图 i2i 不可取**：它会在改一处的同时把脸一起重画（本次实例已证实）；
   **「参考图给脸 + 文字给服装」也不成立**：脸和发饰会一起被重画（同批实测，A6 的珍珠金步摇被画成白色发箍）。
   裁切块里**没有脸**，模型就没有脸可动 —— 这是唯一能既保脸又改局部的路径。

   三个必须避开的坑（都是实测踩出来的，`local-redraw.js` 已内置规避）：

   | 坑 | 现象 | 修法 |
   |---|---|---|
   | 整块贴回 | 出现整片**矩形色块** —— 重绘块的背景灰度与原图不同，贴回是一块方斑 | 遮罩只覆盖目标局部，背景 / 头发 / 皮肤保持原图像素 |
   | 遮罩上边界切在**衣领内部** | 羽化带把「白领 + 肤色」混成一条**浅色方块**，或直接挖出方洞 | 上边界落在**皮肤对皮肤**（颈根）或同一材质处 |
   | 重绘块**自己加件** | 给颈部自作主张补了一圈白色环领；肤色与原图也有偏差 | 色差用取样带做逐通道线性匹配（脚本内置）；多加的部件改 prompt，或合并后再单独处理一次 |

   **实测代价参考**：改胸前一处，全流程 ≈ 裁 1 张 + 重绘 2 张 + 合并 3 轮 ——
   只有重绘烧额度，合并全是本地操作。比"重画整张再赌脸不漂"便宜得多，且脸是**像素级不动**。

**预防**：定妆阶段一旦"形体诉求"与"正面构图 + 覆胸形制"同时成立，**先出侧身版验货再定**。
正面硬攻的期望收益为 0（本次 6 张全部落空），只会烧额度。

**补充（同日结论）**：若必须保住正面构图，走"改形制"这条路 —— **齐胸式一次命中**（见上表），
代价是需要重签一次服装设定（`wardrobe_layers.inner` / `wardrobe` / `identity_lock` 三处同步）。
"改角度"与"改形制"二者**任选其一即可，不必都做**。

### 一句话教训
**想让人看见曲线，先给曲线一个看得见的几何条件**——要么给角度，要么给形制，要么给裁切；
在提示词里加形容词不算。

---

## 坑位 72（2026-10-04，春风定妆实测）：正视人像的「颈部留白」是负向召唤 —— 模型一定要给脖子加东西

**现象**：齐胸形制生效后，颈部裸露区被模型**自作主张加了一圈 choker 白环**（真丝项圈）。
连跑两版都加，第二版的 choker 反而画得更规整、更"像设计"。

**四种写法全部落空**（按投入递增）：

| 做法 | 结果 |
|---|---|
| 整块 i2i + `Her throat, neck and collarbones are bare smooth skin … with nothing worn around her neck` | 照旧画 choker |
| 整块 i2i + 把齐胸上缘明确写到锁骨之下 | 照旧画 choker |
| 双图参考 i2i（图1 = 带项圈的脖子，图2 = 真·裸颈同角色）→"照图2 改图1" | 照旧画 choker，**还把交领改成了吊带** |
| 局部小块裁切重绘（只给脖子，不给脸） | 照旧画 choker |

**结论**：**正面人像 + 颈部留白 ⇒ 模型必填一个 choker / 高领**。这与坑位 71 的"覆胸形制"
是同一类问题：**结构先验压过形容词**，且**参考图也压不过**（它连"同角色的裸颈范例"都不看）。
再加一条：**i2i 的本质是保结构**，指望它"把一块白布改画成皮肤"从一开始就方向错了。

### 处置（按成本排序）

1. **改角度**：让颈部不处于正面留白（微侧 15° 即可破）—— 最便宜，但要重签定妆角度。
2. **改形制**：把领口提到锁骨之上（等于承认那圈白环是高领内衬）—— 但那就不再是"裸颈"。
3. **像素级修复**（本次采用）：把 choker 从已签图上"删除 + 补皮"。配方见下，脚本 `assets/neck-fix.js`。
4. **源头规避**：定妆阶段若同时要"齐胸 / 裸颈"，**先出一版 t2i 验收颈部**——
   本次 Q3 一次就有干净裸颈（同角色同光照），只是脸不是用户选定的那版。

### 像素级去饰品的可行配方

**判据必须用色度（R−B），不要用亮度** —— 这是本次唯一的关键突破：

| 材质 | R−B | 亮度 L |
|---|---|---|
| 白丝带 | **10..20** | 183..223 |
| 皮肤（含投影中） | **54..69** | 130..190 |
| 头发 | **60..90** | 20..160 |

亮度切不开：A6 的颈部本身处在**下巴投影**里（皮肤 L≈130..160），与白环暗部（L≈183）在 180 附近擦边，
用亮度做蒙版只会切出「左侧一块白斑」（实测两轮都栽在这里）。
换成色度后三者彻底分开，蒙版覆盖列数从 116/222 一步升到 200/222。

配方：

1. **种子**：`R−B < 26 且 L > 118`；逐列取最长连续段，间隙 < 40px 的相邻段合并（吃进褶皱阴影）；
2. **外扩**：沿 `R−B < 52` 向外扩到边界（皮肤/头发天然就是停止边界），再**额外外扩 4px**，
   让 alpha 羽化落在皮肤上（不外扩会留下白环边缘的高光残影线）；
3. **填充**：上边界皮肤行 → 下边界皮肤行**逐列线性插值**；
   边界值必须先做**水平低通（半径 16）**，否则相邻列差异会拉出竖条纹；
4. **纹理**：从**同一张图**的颈根皮肤提取高频（`原图 − blur(1.6)`），拉伸到替换区尺寸后 **×1.6 叠加**
   —— 免掉"塑料平面感"。素材取自本图，色调天然连续；
5. **混合**：alpha 轻模糊（`blur(3.4)`）后混合回原图。

**局限（务必事先向用户说明）**：这是"删除 + 低频补全"，填充区是**渐变 + 拉伸纹理**，
**1:1 正常观看看不出，2× 放大能看到一块略平的皮肤**。
属于"去除"而非"重建"，**大特写镜头慎用**；一旦要做颈部大特写，改走"改角度/改形制/重出 t2i"。

### 一句话教训
**先问"模型肯不肯"，再问"要花多少"** —— 结构性先验（颈部留白必填项、覆胸形制无体积）
用提示词和参考图都推不动，只有**几何**（角度 / 形制 / 裁切）或**像素**能解决。


## 坑位 73（2026-10-04，春风派生实测）：`noWardrobe` 连带丢掉**头饰**

### 现象
`ref_charsheet.png`（= 已签字的 `lookA6_c1.png`）两侧挂着**珍珠金步摇**，
但派生出来的 `ref_face.png` 是一张**中分无饰**的脸 —— 步摇没了，脸也略圆了一档。
而 `ref_body_*.png` 五个视角**步摇都在**。同一套资产，只有面部锚点掉饰。

### 根因
`buildFaceRefPrompt` 为了避免把"面部锚点"画成第二张全身照，用
`identityBlock(id, { noWardrobe: true })` 整段砍掉服装。
但**配饰（`wardrobe_layers.accessories`）是服装层的一部分**，
而步摇/发簪/发冠长在**头上** —— 它属于这张图唯一该管的区域，却被一起砍掉了。

放大影响：`pickShotRefs` 给**每一个角色镜**都挂这张锚点（全身参考在前、面部特写在后），
所以「脸上少一步摇」不是丢一张图，是丢**全片每一张关键帧**。

### 修法（已落进 `render.js`）
拆**子句**而不是拆字段 —— 一条 `accessories` 字符串常常把"头饰"和"腰带飘带"写在一起：

```js
// render.js
const HEAD_ORNAMENT_RE =
  /(hairpin|hair\s*(pin|ornament|jewel|piece|clip|comb)|buyao|circlet|tiara|diadem|headdress|fascinator|headpiece|步摇|发簪|簪|发钗|钗|发冠|冠|头饰|额饰|珠花|绢花|发饰)/i;

function headOrnaments(id) {           // 按 ; / ； 切子句，只留命中头饰词的那些
  const acc = (id?.wardrobe_layers?.accessories) || "";
  return String(acc).split(/[;；]/).map(s => s.trim())
    .filter(s => s && HEAD_ORNAMENT_RE.test(s)).join("; ");
}
```

`identityBlock` 新增 `o.headOrnaments`：**`noWardrobe` 时仍然渲染头饰段**。
`buildFaceRefPrompt` 改为 `{ noWardrobe: true, headOrnaments: true }`，
并补一句**正向**约束（不写否定枚举 —— 否定=反向召唤，坑位 70）：

> HEAD, EXACTLY AS REFERENCED: the same hairline and parting, the same length and fall of the hair,
> and the same hair ornaments reproduced in full — including any beaded or tasselled ornament hanging
> at the sides of the head. The same age impression.

> ⚠️ **已被坑位 74 取代**：`buildFaceRefPrompt` 不再用 `headOrnaments: true` 这个开关，
> 改为与全身参考**共用** `headOrnamentBlock(id)`。原因：本坑位只解决了"丢"，没解决"漂" ——
> 修完之后脸部锚点把步摇做**大**了、5 张全身参考把步摇做**没了一侧**。
> 一句话：丢一件配饰是"缺席"，两处措辞不同是"两个角色"。两件事都要治。

### 重出锚点：`assets/reface.js`
不要为了一张脸重跑整套角色资产（会把设定表/风格板/场景锚点/5 张全身参考一起重画）。
`reface.js` 只重画 `ref_face.png`：读身份锁 → N 个候选 → `compareIdentity` 对设定表打分 → 取高分者。
旧图备份到 `<项目>/_qa/reface_backup-<ts>/`，落败候选留 `_face_rejected*.png`。

**实测**：修前派生锚点与 A6 的比对明显偏低且无饰；修后两版候选分别取到 **98 / 98**（`same_person=true`）。
成本 4 张图（2 版 × 2 候选）。

### 预防 / 自检
1. 角色有头饰时，**派生完必须打开 `ref_face.png` 核对头饰在不在** —— 门禁只比对"是不是同一个人"，
   **不会**因为少一件配饰而报警（两次候选都 `same_person=true`，其中一次 92 分也没提步摇）。
2. 项目 `_qa/` 里保留一份 `ref_charsheet.png` 的可见清单（头饰 / 发式 / 配色），
   派生后逐项对脸锚点核一遍。**人眼终审，布尔判分不算数**（坑位 46）。
3. 提示词自检：`/Hair ornaments/.test(render.buildFaceRefPrompt(identity))` 必须为 `true`
   （`reface.js --dry-run` 会打印这一行）。

### 一句话教训
**"不要画全身"和"要戴头饰"是两条独立的约束** —— 为了避免一条而砍掉整层服装，
会顺手把长在头上的东西也砍掉。裁掉一层之前，先问这层里有没有东西属于"被保留的那部分身体"。


---

## 坑位 74（2026-10-04，春风派生实测）：同一个头饰，被两类参考图各画成一个版本

**现象**：坑位 73 修好之后（脸部锚点不再丢步摇），用户打开派生图一眼看出
**「头饰发簪 不一致」**。把两版 7 张图的头部裁切放大并排比对（`out/_qa/headcheck-cf.js`），
同一个配件出现了三种形态：

| 图 | 步摇表现 |
|---|---|
| `ref_charsheet.png`（签字真源 A6） | **两侧对称一对**，小巧金丝托 + 细链各坠一颗小珠，链尾约在下颌 |
| `ref_face.png`（脸部锚点） | 一对，但**明显放大加长**——金托变大、链子垂过下巴、末端变成一串珠（像个吊坠） |
| `ref_body_*.png`（5 张全身） | **只有一侧**、且只有**一个小件**，另一侧的步摇整个消失；`back` 还变成了珍珠花形 |

**根因**：两类参考图**各写各的头饰提示词**。
- 脸部锚点走 `identityBlock(..., { headOrnaments: true })` + 一段专属的 HEAD 段落
  → 两侧都在，但原句 *"chains swinging past her shoulders"* 是**长度邀请**，模型顺势把它做长做华丽；
- 全身参考走 `identityBlock(id)`，头饰只是 wardrobe 层里**六个子句之一**，埋在段落中段
  → 全身构图下头只占画面 ~5%，模型把它降级成一个"点缀性小件"，
  而且**只画能看见的那一侧**（正面/背面视角天然只露出一侧，模型就真只画一侧）。

**这是"同一个事实写两遍就会漂移"的典型**：两份提示词只要有一处措辞不同，
产出的就是两个不同的角色。而 `pickShotRefs` 会把脸锚点 + 全身参考一起喂给 48 张关键帧，
refs 之间不一致 ⇒ 全片随机继承。

### 修法：把这段抽成**唯一真源** `headOrnamentBlock(id)`

```js
// render.js —— buildFaceRefPrompt 与 buildAngleRefPrompt 共用同一段，
// 不再各自拼自己的头饰句子
function headOrnamentBlock(id) {
  const ho = headOrnaments(id);
  if (!ho) return "";
  const paired = /(both sides|either side|\bpair\b|a pair|两侧|左右|一对|双)/i.test(ho);
  ...
}
```

三道锁，措辞**全部正向**（否定枚举=反向召唤，坑位 70）：

1. **数量锁**：`There are TWO of them, one pinned on each side of the parting.`
   —— 把"一对"数出来，防止只画一侧。
2. **镜像锁**：`mirrored: identical shape, identical size, identical drop, and both are present
   and clearly visible.` —— 否则模型画一个、另一边留空。
3. **尺寸锁**：`the pin is small, no larger than the section of hair it grips, and the chain falls
   only as far as referenced — it ends level with the jaw, staying above the collarbone.`
   —— 没有尺寸上限时，"垂链"会被读成"越长越华丽越好"，这正是脸部锚点膨胀的原因。

全身参考额外补一句**反向的构图提醒**（头小不等于可以简化）：
> The figure is full length, so the head is small within the frame — that does not license
> simplifying the hair ornaments. They keep the exact shape, size, count and chain length
> they have in the reference, readable at true scale against the head.

同时把项目人设里的 `wardrobe_layers.accessories` 从**无上限描述**
（`their fine gold chains swinging past her shoulders`）
改成**锚定描述**：
> a symmetric pair of small gold filigree hairpins (buyao) — one pinned on each side of the
> centre parting, each a small gold ornament set with a cluster of tiny white pearls, and each
> dropping a single fine gold chain that ends in one small pearl at about jaw level

### 预防 / 自检
1. **凡"两类参考图都该长同一个样"的东西，只允许有一段提示词。**
   一旦发现 `buildFaceRefPrompt` 和 `buildAngleRefPrompt` 里有语义重复的句子，就是漂移的种子。
2. 描述配饰时**给尺寸锚点**（相对头/锁骨/下颌），不要只给动作词（hanging / swinging / flowing）。
   动作词会让模型自由发挥到最大值。
3. **重复是特效药**：关键配件在提示词里出现两次（wardrobe 层 + 专属段）是**好**的，
   因为强调>简洁；但两次的**措辞必须同源**。
4. 派生完的验收动作：跑 `out/_qa/headcheck-cf.js` 生成头部裁切对照图，**人眼横向比对**
   （坑位 46：布尔判分对"配饰一致性"完全无感，两次 `same_person=true` 都漏掉了头饰走样）。

### 一句话教训
**"同一个角色"不是靠一份人设文档保证的，是靠每一处引用都指向同一个字符串保证的。**
写第二遍就是写第二个角色。

---

### 坑位 74 补记（同日，第二轮实测）：存在性锁 ≠ 度量锁

第一轮修完（三道锁全部写上、`--rebuild-refs` 重出 12 张）的验收结果：

| 指标 | 结果 |
|---|---|
| **数量** | ✅ 修好。front / 3q-left / 3q-right / back 现在**两侧都有**（此前只画一侧） |
| **形态** | ✅ 修好。不再出现 `back` 的珍珠花形变体 |
| **尺寸 / 链长** | ⚠️ **没修好**。真源链尾约在下颌，重出后链尾垂到颈根/锁骨，约 1.5~2 倍；金托也略大 |

原因：`small` / `no larger than the section of hair it grips` 是**形容词**，
模型会把它当"语气"而不是**约束**——照做七成，剩下三成按自己的审美补。
`chain ends level with the jaw` 也一样：模型把"jaw"读成"大概那个区域"。

**改法：把尺寸写成可量化的相对量，锚在参考物上。**

```
SIZE AND SCALE ARE LOCKED TO THE REFERENCE, measured against the head:
the pin is a small flat ornament gripping a short section of hair above and behind the ear,
and the whole piece — pin and chain together — spans only about a third of the height of the head.
The lowest bead hangs level with the jawline and stays well above the shoulder.
```

三处改动，都是"把形容词换成比例"：
- `small` → **`about a third of the height of the head`**（给分母：头高）
- `no larger than the section of hair it grips` → **`gripping a short section of hair above and
  behind the ear`**（给位置：耳上后方，顺便纠正常见的"挂到耳前"错位）
- `ends level with the jaw` → **`The lowest bead hangs level with the jawline and stays well
  above the shoulder`**（给两个参照点：下颌为上界、肩为禁区）

**通用结论**：写约束时分三层，缺一层就漏一种走样 ——
1. **存在性**（有没有：`TWO of them, one on each side`）
2. **同一性**（是不是同一个：`mirrored, identical shape/size/drop`）
3. **度量**（多大：必须写成**相对参考物的比例**，不能只写形容词）

第 3 层最容易漏，因为"small" 写起来太顺手了。**凡是形容词，模型都会打折执行。**

---

## 坑位 75（2026-10-04，春风开关键帧试点实测）：参考图分工块**一行都没输出**，于是同一个女孩被画成两个人

### 现象
头饰修完、派生图验收通过后开第一轮关键帧试点（`--only S01,S04,S13`，16:9）。
S01 空镜正常；**S04 与 S13 里都出现了两个女人**，而且分镜写的 `close-up` / `medium close-up`
被画成了**全身双人远景**。S13 还被门禁判成"通过 88 分"——
**因为门禁把第二个人算成了"背景配角"**，于是一个明显违反"单一主角"的画面拿到了绿灯。

### 取证
把管道**真实**会发出的 S04 提示词打出来，`REFERENCE HANDLING` 段只有一句：

```
REFERENCE HANDLING — each attached image has one job:
  • NONE of the references may dictate this frame's shot size, camera angle or composition —
    those come from the SHOT block below. Never reproduce a reference's own framing, backdrop
    or camera position.
```

**逐图分工的三行全丢**。S04 实际挂了 3 张图：`全身参考(3q-left)` + `面部特写` + `场景锚点 SC1`，
其中**前两张是同一个女孩的两种角度**。提示词里没有任何一句说明"它们同属一个人"，
模型面对"两张人像 + 无分工说明"的歧义，直接输出**两个并排的女人**；
构图则被那张**全身**参考拽走，把 `close-up` 拉成全身远景。

### 根因：参数形状不匹配，且静默降级
```js
// images.js → render.buildKeyframePrompt
refRoles: refs.roles            // ← pickShotRefs 产出的是【字符串】数组
                                //    ["identity","identity","scene"]

// render.js
function refHandlingBlock(roles) {
  const pick = (r) => roles.map((x, i) => (x.role === r ? i + 1 : 0)).filter(Boolean);
  //                                        ^^^^^^^ 字符串上没有 .role
}
```
字符串取 `.role` 得到 `undefined`，于是 `pick("identity")` / `pick("scene")` / `pick("style")`
**全部返回空数组**，三个 `if` 都不进，只剩最后那句通用话。
**函数照常返回、断言不响、日志不报** —— 一个纯静默的降级。

注意这不是"文档和代码不一致"，而是**代码内部两处不一致**：函数的 JSDoc 写的是
`@param {{label:string, role:...}[]}`（对象），调用方给的是字符串。**类型注释不参与运行**，
所以这类错误只能靠"把真实提示词打出来看"来抓。

### 修法
1. `refHandlingBlock` 做**形状归一化**，两种入参都吃：
```js
const norm = (Array.isArray(roles) ? roles : []).map((x) =>
  typeof x === "string" ? { role: x, label: x }
                        : { role: (x && x.role) || "", label: (x && x.label) || "" });
```
2. `idIdx.length > 1` 时**追加一句正向人数锁**（不是否定枚举，见坑位 70）：
   > Those identity images all show ONE AND THE SAME individual, photographed from different angles.
   > This frame contains exactly one person: merge every one of those references into a single woman,
   > standing on her own. She appears once.
3. `buildKeyframePrompt` 在 `characters_in_shot.length === 1` 时再补一句 `ON SCREEN: exactly one person …`
   —— 因为 `EXCLUSION_SUFFIX` 那句 `absent: a second person` 是**否定枚举**，按坑位 70 它在反向召唤。

### 预防 / 自检
1. **参考图分工块必须"看得见"**：任何"把 N 张图各自的职责写进提示词"的代码，
   都要有一处能把**真实产出的那一段**打印出来的自检。函数静默返回 `""` 或只返回尾巴，
   是大模型管道里最贵的一类 bug —— 不报错、不失败，只是画错。
2. **一个字段两种形状 = 定时炸弹**。`pickShotRefs` 产字符串、`refHandlingBlock` 读对象，
   两边各自都"对"，接口处才错。要么统一形状，要么在入口归一化。
3. 门禁对"画面里有两个人"**不可靠**：S13 把第二人算作配角给了 88 分通过。
   凡是"单一主角"的项目，**关键帧必须人眼过一遍**（坑位 46：布尔判分不算数）。
4. 试点纪律再次显灵：**先跑 3 个镜头**（含 1 近景 + 1 中近景 + 1 空镜），
   9 分 50 秒就抓出了一个会让 48 张关键帧全废的问题。若直接全量，代价是 48 张。

### 一句话教训
**"两张同一个人不同角度的图"对模型来说默认是两个人。**
写进提示词里不行，还得写对；而"写对了没有"，只能看真实产出的那一段，不能看代码。

---

### 坑位 75 补记（同日，第三轮）：分工块修好之后，暴露出**景别被参考图拽走**

修完 `refHandlingBlock` 的形状 bug 后重跑 S04 / S13：

| 镜头 | 分镜景别 | 修前 | 修后 | 人与景别 |
|---|---|---|---|---|
| S04 | `close-up` | 35 分，两个女人，全身横移双人镜 | **91 分，一次通过** | ✅ 单人 ／ ❌ 仍是全身 |
| S13 | `medium close-up` | 85 分，两个女人（第二个是现代装） | **88 分，通过** | ✅ 单人 ／ ❌ 仍是中远景 |

**双人问题彻底解决**，但景别仍不对：分镜写 `Close-up of the protagonist's face … fine hair strands
drifting across the cheek, a silk sash near her fingers`，出来的却是一个站着的全身像，
手还交叠在身前、没有笑。也就是说**参考图的构图惯性压过了 SHOT 段一整段散文**。

根因（结构性）：
- `pickShotRefs` 恒定挂 **全身参考 + 面部特写** 两张身份图。`close-up` 镜也照挂全身参考，
  等于给模型一张"站直的全身照"当构图模板；
- 压制它的那句 `NONE of the references may dictate this frame's shot size …` 是**否定句**，
  按坑位 70 力度打折；
- `FRAMING: shot size close-up` 只有三个词，信息量等于零。

已做的（零额度，已生效）：`render.js` 新增 `SHOT_SIZE_CLAUSE` + `normaliseSize()`，
把景别从一个词展开成**正向构图句**，例如
> `close-up` → "The frame is cropped tight on the head and shoulders: the face is large, central and
> sharply detailed, with the surroundings soft behind her."

覆盖 24/24（9:16 的 `macro` 是第一个漏网值，已补；同时补了 insert / detail / full / establishing 同义词）。
实测覆盖：`wide / medium wide / medium / close-up / medium close-up / extreme wide / macro`。

**尚未做（待定，会动到参考图选择逻辑）**：按景别**挑身份参考**——
`close-up` / `medium close-up` 只挂**面部特写**（这才是该镜的构图锚），
`wide` / `extreme wide` 才挂全身参考；或对特写镜把全身参考降级为"仅供服装参考"。
这是从根上断开"全身参考 → 全身构图"的传导，但属于参考图策略变更，需单独验证。

### 一句话教训（新增）
**景别不是标签，是构图。** 写 `close-up` 三个词，等于什么都没写；
必须写成"画面被裁到哪里、脸占多大、背景怎样"。同时记住：
**挂了一张全身参考，就默认会得到一个全身构图** —— 想拍特写，就别把全身照递过去。

---

## 坑位 76（2026-10-04，春风实测）：镜头级 `--force` 级联重建了**签字的身份真源**，全片人物悄悄换了人

### 现象
用户在关键帧试点图上直接看出 **「人物、配件等和之前敲定的完全不一样」**。
不是"不像"，是"(前)不是那个人"：步摇只剩一侧、头发变黑、脸也换了。

### 取证
查 `02_images/` 的文件时间戳，一眼看穿：

| 文件 | 时间戳 | 实际内容 |
|---|---|---|
| `ref_charsheet.png` | **10:49** | 七格设定表，**素发无步摇** ← 不是签字的 A6 |
| `ref_face.png` | 10:49 | 黑发、**单侧**发饰 |
| `ref_body_*.png` ×5 | 10:50-10:51 | 与上面两张又不同的第三种 |
| 签字的 A6 原图 | 10 月 3 日 23:37 | 在 `out/_qa/look-cf/lookA6_c1.png`，**完好** |

而派生重出（`derive-cf.js --rebuild-refs`）发生在 **09:57**。
⇒ 10:49-10:51 那批**不是派生出的，是被整批重建的**。
⇒ 三张参考图互不相同 ⇒ 关键帧随机继承 ⇒ 人物不像任何已签字版本。

### 根因：`--force` 从「重画这一镜」一路级联到「重建角色真源」
```js
// images.js --only S04,S13 --force
buildCharacterAssets(pool, { ..., force: args.force })   // ← images.js:173
// assets.js:300
if (!o.force && isUsable(sheetPath)) { skip }            // ← force=true 时判假
else { /* 重新生成设定表 + 从新设定表派生 ref_face / ref_body_* */ }
```
`--force` 的文档语义是 "regenerate everything"，调用方只想重画两个镜头，
但 force 被**透传**给了身份资产构建 —— 于是签字的设定表、验收过的 6 张参考图，
连同它们之间的父子关系，全部被重画成"另一个角色"。

**最致命的一点**：技能**自己**在 teaching 这个用法 ——
```js
// images.js:595 门禁失败时的提示
`建议：node images.js --project "<项目>" --only ${r.shot} --force`
```
任何一个用户照着这条建议重画一个镜头，都会丢掉签字形象。这不是操作失误，是**技能缺陷**。

### 修法（三层）

**1. 拆开两个语义**（`images.js`）
```js
"--force":       keyframes only — "Redraw the selected KEYFRAMES even if they exist"
"--force-refs":  references only — "Rebuild the character sheet / face / body angles /
                                    style board / scene anchors"
```
`buildCharacterAssets` / `buildSceneAssets` / 风格板统一收 `force: args.forceRefs`，
**镜头侧**保留 `args.force`。`--force` 从此不再能碰到身份资产。
第 595 行的建议文案同步说明这一点。

**2. 存在但不可用 ⇒ 抛错，不静默重建**（`assets.js`）
```js
if (!o.force && fs.existsSync(sheetPath) && !isUsable(sheetPath)) {
  throw new Error("ref_charsheet.png 已存在（N 字节）但被判为不可用：缺少 .url 边车…" +
                  "这份设定表可能是人工签字过的角色真源 —— 静默重建会把整片换成另一个人，故已中止。")
}
```
原先的写法是 `if (!isUsable) → 重新生成`：**边车一丢就重画**。
机器生成的资产丢了可以重画，**人工签字的资产丢了必须停下问人**。

**3. 把"人工指定设定表"固化为工具**（新增 `assets/set-charsheet.js`）
过去这个动作靠一次性脚本临时完成，没有备份、没有边车规范、没有签字记录。
现在统一为：
```bash
node assets/set-charsheet.js --project "<项目>" --from "<签字图.png>" [--url <u>] [--apply]
```
校验真源 → 备份现有 7 张 → 落位 `ref_charsheet.png` + `.url` → 写 `ref_charsheet.signed.json`
（来源路径 / url / 字节数 / md5 / 时间）→ 移除待重派生的 ref_face / ref_body_*。

### 恢复动作（本次实际执行，零额度部分）
```bash
node out/_qa/restore-a6.js --apply          # A6 落位回 ref_charsheet + 清理被污染派生图
node out/_qa/derive-cf.js 2 --rebuild-refs --only-169   # 只重出 16:9 的 6 张
```
- 事故现场备份：`out/_qa/overwrite_backup-<ts>/`
- 9:16 版**未受波及**（那次 `--force` 只跑了 16:9；它的 `ref_charsheet.png` 仍是 10-03 23:37 的 A6）
  ⇒ 所以派生脚本加了 `--only-169` / `--only-916`：**只重出被污染的那一版，另一版不动**。
- 重出结果：6 张 QA 95–100，`headcheck` 人眼复核 **7 张步摇两侧都在、形态统一、链长齐下颌**。

### 预防 / 自检
1. **"重画某个产物"绝不能级联到"重画它的依赖真源"。** 任何 `--force` 一类的开关，
   都要问一句：它最远会改到哪一层？人工签字过的产物必须在调用链上被**显式保护**。
2. **人工签字资产 = 代码级保护，不是纪律。** 靠"记得加 --skip-refs"必然失手。
3. 门禁提示里给出的**命令**要当成产品的一部分来审：它会不会毁掉别的东西？
4. **验收要看文件时间戳**。这次能 5 分钟定位，靠的就是 `ls --time-style=long-iso`
   把"谁什么时候覆盖了谁"摆出来。只对比内容会误判成"模型画得不像"。
5. 多画幅项目里，**两个版本要分开重出**（`--only-169` / `--only-916`）。
   一版被污染不代表另一版也被污染，无脑重出等于双重浪费 + 二次风险。

### 一句话教训
**用户说"人物不像"，先别怀疑模型 —— 先看参考图还是不是原来那张。**
真源被覆盖时，模型每一步都做对了，只是它照着另一张脸在做。

---

### 坑位 75 补记二（同日，第五轮）：景别的真正阻力是**场景锚点图**，不是措辞

第一轮"按景别挑参考图"（近景只挂面部锚点）上线后重跑，**仍不对**。逐步排除：

| 轮次 | 改动 | S04（close-up） | S13（medium close-up） |
|---|---|---|---|
| 1 | 近景只挂面部锚点（去掉全身参考） | 全身 → **七分身**（有改善） | **几乎没变**，仍是山巅大远景 + 站直的小人 |
| 2 | 场景说明改正向（"Reproduce the PLACE, not the picture"）+ 通用句由否定改正向 + SHOT 段开头重复景别句 | — | — |

把**真实参考图分配**打出来才看清：

```
S04  close-up           refs: [1]面部特写  [2]场景锚点 SC1
S13  medium close-up    refs: [1]面部特写  [2]场景锚点 SC3
```

全身参考已经去掉了，但**场景锚点图的构图惯性一点没减**。而这两个锚点分别是
"室内全景空镜"和"云雾山巅大远景" —— 模型看到一张大远景，就还你一张大远景，
提示词里写多少句 close-up 都不好使。

**规律（本轮最重要的结论）**：
> **文字的"地方"不携带构图；图片的"地方"携带构图。**
> 想让模型拍近景，就不要把一张全景照递给它 —— 哪怕那张照里没有人。

#### 修法：近景镜用**场景文字**替代场景锚点图

`storyboard.scenes[]` 里每个场景本来就有 `description` + `architecture` + `lighting` 三段文字
（场景锚点图就是照着它们画的）。所以环境信息一个字都不缺，只是不再以图片形式携带构图。

```js
// images.js —— 只对「角色镜 + tight 景别」生效；空镜与中远景镜照旧带锚点图
const tightShot = wantsCharRefs && assets.refPlanFor(shot.shot_size) === "tight";
const sceneRef = noAnchor || tightShot ? null : assets.sceneRefFor(shot, sceneAssets);
const sceneText = tightShot ? assets.sceneTextFor(shot, sb) : "";
```

```js
// render.js —— 注入 SETTING 段（紧跟在 SHOT 散文之后）
SETTING — the place she is in, given in words rather than attached as a picture: <description + architecture + lighting>
This frame takes in only as much of that place as the shot size above names; the rest of it falls away,
softly out of focus, behind her.
```

`assets.sceneTextFor(shot, sb)` 按 `shot.scene_id` 取场景（回退到 `used_by` 包含本镜的场景）。

实测分配（16:9）：

| 镜 | 景别 | plan | 参考图 | SETTING |
|---|---|---|---|---|
| S02 | medium wide | wide | 全身参考 + 面部特写 + 场景锚点 SC1 | 无（有图） |
| S04 | close-up | tight | **仅面部特写** | 有（868 字符） |
| S13 | medium close-up | tight | **仅面部特写** | 有（782 字符） |

**副作用与取舍**：近景镜的背景不再逐像素对齐锚点，而是按同一段文字重画 ——
近景背景本来就浅景深虚化，一致性风险低；换来的是**景别终于归 SHOT 块管**。
中远景镜保留锚点图（那里环境是主角，必须像素级一致）。

**仍未验证**：本轮之后 S04/S13 的实际出图效果。若 tight 镜"只挂一张面部锚点 + 文字场景"
仍出远景，下一步是给 tight 镜**裁切版锚点**，但那需要公网 URL（`agnes.generateImage` 的
`extra_body.image` 只吃 URL，不吃本地路径），属于另一条工程路径。

---

### 坑位 75 补记三（同日，第六轮，**收敛**）：真凶是**参考图张数** —— 用旁证对照锁定，不再靠推理

补记二的方案回退后，改走"保留全景锚点 + 追加中心裁切版"（裁切图托管成公网 URL）。
仍是两人。门禁给出 S13 **98 分**、S04 **88 分**，`same_person` 全部成立，
**唯一失分项每次都是同一条**：

> 「除主角外还有 1 个醒目的人物。背景里可以有远处虚化的路人，但不能有面部可辨认或占据画面比例较大的其他人。」

也就是说：人物已经对了、质感已经对了，**只是画面里多了一个人**。而且这两个人是
"并排站着、穿不同颜色衣服的两位汉服女子" —— 与 `render.js:802` 早就记下的那次
实测（"two portraits … rendered as TWO DIFFERENT WOMEN standing side by side，
composition taken from the full-body reference"）**是同一个症状**。
说明"逐图写明职责"这条修法**压不住它**。

#### 取证：横向对照通过的项目，而不是继续在本项目里试参数

本项目所有轮的参考图都是 2~3 张，样本早已被污染。于是转头去看**历史通过记录**：

```
mv-月照他乡   passed 3/3  avg 92
  S27 [medium close-up] score=92 passed=true proto=1 others=0   refs: ["面部特写"]
  S29 [medium]          score=92 passed=true proto=1 others=0   refs: ["面部特写"]
  S31 [medium close-up] score=92 passed=true proto=1 others=0   refs: ["面部特写"]

mv-月饼卖不动 passed 3/4  avg 91.8
  S02 [medium]          score=88 passed=true proto=1 others=0   refs: ["面部特写"]
  S14 [medium close-up] score=92 passed=true proto=1 others=3   refs: ["面部特写"]
```

**所有通过的近景/中近景角色镜，参考图都只有 `["面部特写"]` 一张。** 一张都没有例外。

那为什么它们只有一张？因为这两个项目里 `sceneRefFor()` **静默返回 null** ——
`loadSceneAssets()` 解析不到 `refs`（`.url` 边车/索引格式不匹配），
场景锚点从来没有真的挂上去过：

```
$ node -e "... assets.sceneRefFor(shot, sceneAssets) ..."
mv-月照他乡   S27 scene_id=SC4 -> NULL
mv-月饼卖不动 S02 scene_id=SC1 -> NULL
```

**一个 bug（场景锚点挂不上）意外提供了一个干净的对照组**：这些片子是在
"近景角色镜 = 只有面部锚点一张参考"的条件下跑出来的，而且全过。

#### 结论

> **病根是参考图的张数，不是参考图的解释不够。**
> 每多一张参考图，就多一次"把同一张脸的多个来源读成多个角色"的机会。
> 两轮实测把这件事说得很直白：近景镜挂 2~3 张的**每一轮**都出两个人；
> 挂 1 张的**从来没有**出过（包括旁证项目里 6 个通过的近景镜）。

补记二里那句"只挂脸、不给全景场景图 ⇒ 模型会画出两个女孩"因此**不再成立** ——
那是当时**分工块还缺行、否定枚举还在**的条件下测出来的，把两个自变量混在了一起。
本轮把"张数"单独当自变量之后，旧的结论被推翻，保留原文仅作历史记录。

#### 修法（已落进代码）

```js
// assets.js pickShotRefs —— 近景镜只挂面部锚点一张
if (plan === "tight") {
  push(face, "identity", "面部特写");
  if (!face) push(body, "identity", `全身参考(${useView})`);
}
// 场景锚点加闸门：近景角色镜不挂
if (o.sceneRef && o.sceneRef.url && out.plan !== "tight") {
  push(o.sceneRef, "scene", o.sceneRef.label || "场景锚点");
}
```

```js
// images.js —— 「全景锚点 + 中心裁切版」降级为实验开关，默认关闭
if (args.tightCrop && tightPlan && sceneRef && sceneRef.url) { ... }
```

```js
// render.js —— ON SCREEN 的合并句只在真的挂了多张身份图时才写
// （近景只有一张，写"多张参考是同一个人的不同角度"自相矛盾，
//   而且 "different angles" 反而在暗示"多拍几张/多个人"）
const idRefCount = (o.refRoles||[]).filter(x => x === "identity").length;
```

保留 `tightSceneRef` / `tightCropRatio` / `sceneTextFor`，但都不在默认路径上。

#### 复现与判据

```bash
node images.js --project "<项目>" --keys-file <keys> --concurrency 2 \
  --only S04,S13 --force --skip-refs
# 判据三条：proto=1 && others=0（人数）、S04 出 close-up、S13 出 medium close-up
# 以及人眼复核：画面里只有她一个人
```

#### 一句话教训

**参考图是"主体 + 构图"的双重强约束，数量本身就是最强的那个旋钮。**
想让景别归 SHOT 块管，就不该递给它任何一张"已经取好景"的照片 —— 哪怕是空镜；
想让人数归剧本管，减少张数比加强措辞有效得多。措辞只能修正模型对参考图的**理解**，
改不了它**照抄**参考图的倾向。

---

### 坑位 75 补记四（同日，第七轮）：人数修好了，但**文字管不住环境与景别**

补记三的闸门（近景只挂面部锚点一张）上线后连跑两轮，结论要分开记：

| 轮 | 配置 | S04（close-up，书斋 SC1） | S13（mcu，山巅云海 SC3） | 人数 |
|---|---|---|---|---|
| v2 | 仅面部锚点，**不给**地点文字 | 92 分 ✓ 通过 · 竹林亭台 · 全身 | 82 分 ✓ 通过 · 花园 · 全身 | **配角=0**，两镜全对 |
| v3 | 仅面部锚点，**给** 650 字地点文字（`SETTING` 段） | 92 分 ✗ · **多出一个人** · 樱花花园 · 全身 | 92 分 ✓ 通过 · 樱花花园 · 全身 | S13 对，S04 复现 |

#### 结论一：张数闸门有效，**人数问题已收敛**

v2 两镜全部 `配角=0`、全部通过，且是连续一轮内两个不同镜位都成立。
这是本项目第一次拿到"单人"的通过记录 —— 补记三的结论成立，可以推广。

#### 结论二：`sceneText` **不能**替代地点锚点图

v3 把 650 字的 `sceneTextFor()` 注入 `SETTING` 段（已确认真的进了提示词：
提示词总长 8889 字符、`SETTING` 段在、文字 650 字符），实跑结果与文字内容**无关**：

```
分镜里写的是：An airy traditional study with pale wooden lattice windows,
              low bookcases with rolled bamboo scrolls, a silk curtain on the left …
实际画出来的是：樱花树下的花园，有池塘和石桥
```

S13 同理：文字写"云雾山巅、石板平台、云海" → 画出来还是花园。
**文字在环境这一维度上基本没有服从度。** 而同一套管线里，**参考图是被照抄的**
（12:22 那轮挂上锚点时，书斋和山巅都还原得很准）。所以：

> **图能定环境，字不能。文字能定的是"是什么人、穿什么、什么情绪"这一类主体属性。**

#### 结论三：景别仍然失控，且很可能不是"措辞不够"

`close-up` / `medium close-up` 的字样在提示词里出现了**三次**
（`SHOT` 段前的正向景别句、`FRAMING:` 行、`IDENTITY RE-CHECK` 旁的构图句），
实跑四次（v2/v3 各两镜）**没有一次**收进近景，全是全身站姿、
双臂向两侧张开展示大袖。后一条是服装文字的副作用 ——
wardrobe 里写了 "very wide drifting sleeves … so light it floats and billows"，
模型把它执行成了"张开双臂展示袖子"这个姿势，而这个姿势天然要求全身景别。

#### 与"能跑通的项目"的差异（横向对照，2026-09-22 / 09-24 的报告）

```
mv-月照他乡 S27 [medium close-up] 通过 92
  keyframe_prompt: "A medium close-up of the protagonist, an East Asian female,
                     sitting indoors at a wooden desk …"
  → 实际出图：室内木桌前的中近景，一人物，环境正确

mv-月饼卖不动 S14 [medium close-up] 通过 92
  keyframe_prompt: "A medium close-up of the protagonist facing the camera directly,
                     standing in a dense street …"
  → 实际出图：灯笼街里的中近景
```

两者共同的形态：**景别 + 主体 + 具体地点，写在同一句摄影句里，放在提示词最前面。**
春风的 `keyframe_prompt` 则是**风格句**（"pale gold and cyan tones, shallow depth of field,
delicate film grain, Song-dynasty inspired aesthetic"）+ **没有地点**。

另外值得注意的是：那两个项目的世界是**现代写实**（木桌、灯笼街、面包店），
春风是**古风 + 宋代美学** —— 后者自带"花园/樱花/张袖"的强类型先验，
同样一句"medium close-up"要对抗的先验强得多。

#### 下一步（未执行，待签字）

把近景镜的 `SHOT` 段**首句**改写成上面那种摄影句形态 ——
`A <shot size> of the protagonist, <年龄/性别>, <地点短语>.` ——
把景别与地点**并进同一句话**，而不是拆成 `FRAMING:` / `SETTING:` 两个标签段。
在 S04/S13 上试点两镜即可判定。若这也不动，那就说明**这个模型在古风题材上
不接受文字构图指令**，只能改走"先出人物板 → 后期合成到地点板"的合成路线。

#### 一句话教训

**不要假设"图能做的，文字也能做"。** 图像模型对参考图的服从近乎照抄，
对文字里"环境 / 构图"这一类的服从度极低 —— 所以凡是"地点一致性""景别归位"
这类诉求，唯一可靠的通道仍然是**图**；文字通道留给主体属性（长相、服装、表情）。
把环境交给文字 = 把方向盘交给一个不听指挥的乘客。

---

### 坑位 75 补记五（同日，第八轮）：参考图是**双轴**的 —— (景别→取景档) × (朝向→角度)

补记三收敛到"张数 = 人数旋钮"，补记四确认"图能定环境、字不能"。补记五把两条合起来，
给出**参考图选型规则**：每镜一张身份图，由两条轴共同决定。

#### 规则

| 轴 | 取值 | 来源 |
|---|---|---|
| 取景 framing | `close` / `waistup` / `full` | `shot.shot_size` → `assets.framingForShotSize()` |
| 角度 angle | `front` / `3q-left` / `3q-right` / `side` / `back` | `shot.characters_view` → `assets.normaliseView()` |

景别 → 取景档：

```
extreme close-up / close-up / macro / insert / detail   -> close
medium close-up / medium                                -> waistup
medium wide / wide / extreme wide                       -> full
```

角度 + 取景档 → 文件：

```
close  + front    -> ref_face.png
close  + 3q       -> ref_waistup_3q-*.png   （正面脸锚点丢失转向，半身图同时带回转向和够大的头）
waistup + <angle> -> ref_waistup_<angle>.png
full   + <angle>  -> ref_body_<angle>.png
```

缺失时回退链：`waistup[angle] → waistup[front] → bodies[angle] → bodies[front]`，
最后兜底 `ref_face.png` —— 角色镜**永远不许没有身份锚**。

#### 为什么"同档"是关键

参考图是"主体 + 构图"的**双重强约束**。递一张已经取好景的全身照过去，
模型就把那个全景抄回来（本轮实测：close-up 镜挂全身参考 → 出七分身/远景）。
只有参考图与镜头**同景别**时，它才从"对手"变成"同盟" —— 这正是"选项 1（按景别挑参考图）"
真正落地的地方。

#### 落地清单

| 文件 | 改动 |
|---|---|
| `lib/render.js` | 新增 `FRAMINGS`（`intro` / `framingPhrase` / `composition` / `headNote` / `setting`）；`buildAngleRefPrompt(id, angle, framing)` 接受取景档；`anglePose` 回退文案去掉 "full figure" |
| `lib/assets.js` | `buildCharacterAssets` 新增 `o.framings`（默认 `["full"]`）；`full` 保留 `ref_body_<angle>.png` 旧名，其余写 `ref_<framing>_<angle>.png` 并挂在 `bodies[<framing>][<angle>]`；`loadCharacterAssets` 载入 `bodies.waistup[angle]`；新增 `framingForShotSize()` / `pickFramedRef()` / `refBucket()`；`pickShotRefs` 改为双轴选图、每镜恒 1 张身份图 |
| `lib/vision.js` | `auditStudioRef` 新增 `framing` 判据 —— 半身图**不能**用 "head_to_toe" 卡（半身本来就裁在腰部），改卡 `head_visible` + `cut_at_waist` |
| `images.js` | 新增 `--framings` / `--waist-ratio` / `--refs-only` / `--tight-no-scene`；`sceneText` 降级为"仅 `--tight-no-scene` 时注入" |
| `assets/check-prompts.js` | 角色镜参考图形状改为 `["identity","scene"]`（每镜 1 身份 + 1 地点） |

#### 复现

```bash
# 1) 补半身参考资产（--refs-only 保证不碰任何关键帧）
node images.js --project "<项目>" --keys-file <keys> --refs-only --framings waistup
# 2) 零额度看每镜会挂哪些参考图
node <cwd>/out/_qa/ref-matrix.js "<项目>"
# 3) 跑关键帧（--force 只重画关键帧，身份参考受保护）
node images.js --project "<项目>" --keys-file <keys> --only S04,S13 --force --skip-refs
```

#### 一句话教训

**参考图的两个维度（是谁 + 怎么取景）都得对齐，缺一个都会被拽。**
只对齐身份 → 构图被参考图接管；只对齐构图 → 身份漂移。

---

### 坑位 75 补记六（同日，第九轮）：地点锚点也要**按景别出** —— 双轴规则的另一半

补记五解决了**人**的取景档，但景别**仍然没归位**：S04/S13 在"半身身份图 + 全景地点锚点"
的组合下依旧是全身站姿、双臂张开展示大袖。人眼看图定性后确认，拽构图的这次是
**地点锚点那张全景空镜**（S04 出书斋 ✓、S13 出山巅 ✓，环境都对，但取景全是远景）。

也就是说：**只要递过去的任何一张参考图比镜头本身更"远"，构图就归它**。

#### 解法：地点锚点也建取景档（`render.SCENE_FRAMINGS`）

| 档 | 内容 | 文件 |
|---|---|---|
| `full` | 整个空间（历史命名） | `ref_scene_<key>.png` |
| `medium` | 空间的一角：一面墙 / 一个角落 + 它的家具 | `ref_scene_<key>_medium.png` |
| `close` | 一个表面 / 构件，一臂之遥 | `ref_scene_<key>_close.png` |

镜头按自己的景别取对应档（`assets.sceneFramingForShotSize`）：

```
close-up                                  -> 近景盘
medium close-up / medium                  -> 中景盘
medium wide / wide / extreme wide         -> 全景盘
```

实测（2026-10-04）：SC1 三档 = 整间书斋 / 书架占主体 / 木格窗与障子门局部；
SC3 三档 = 全景云海 / 石栏 + 云海 / 石栏局部 —— 同一空间的不同距离，
材质、色调、光位一致，10 张 QA 全部 `人数=0` 通过。

#### 落地

- `render.SCENE_FRAMINGS` + `buildSceneRefPrompt(scene, sb, framing)`
- `assets.sceneRefPath(dir, key, framing)` / `buildSceneAssets(o.sceneFramings)` /
  `loadSceneAssets`（返回 `{[key]: {full, medium, close}}`）/
  `sceneRefFor` 按景别挑档（兼容旧的单张 entry：有 `.url` 就直接返回）
- `images.js` 加 `--scene-framings`

```bash
node images.js --project "<项目>" --keys-file <keys> --refs-only --scene-framings medium,close
```

#### 一句话教训

**"参考图要和镜头同档"这条规则对**人**成立，对**地方**同样成立。**
只把人物对齐、把地方交给一张全景空镜，等于让地点锚点替镜头决定取景 ——
而这恰恰是它最擅长的事（照抄自己的构图）。

---

### 坑位 77（同日）：闸门必须走**同一条代码路径** —— 猜出来的形状测不出真实装配链的错

#### 现象

放量 22 镜（`--only ... --force --skip-refs`）时，提示词闸门 `check-prompts.js`
两版**全绿**（分工块 3 条 •、头饰段三处一致、FRAMING 覆盖 24/24），
`node --check` 也全过。实跑却在第一步就停：

```
[2/3] Shot keyframes (22 of 24) ...
images.js FAILED: refAssets is not defined
```

**一整批调用处于"随时会崩"的状态，而所有闸门都说没问题。**

#### 根因

两件事叠在一起：

1. `images.js` 的空镜分支残留了一个改造时已删除的旧变量：
   ```js
   } else if (sceneRef && sceneRef.url) {
     refs = assets.pickShotRefs(shot, refAssets, { hasCharacter: false, sceneRef: refScene });
                                    ^^^^^^^^^  ^^^^^^^^ 这两个变量已不存在
   ```
   角色镜走的是另一条分支（`wantsCharRefs`），所以之前所有试点（S04/S13）都碰不到它 ——
   **只有空镜（S01）会踩到**，而空镜恰好被排在 `--only` 列表第一位。

2. `check-prompts.js` 的参考图形状是**手写猜的**：
   ```js
   const refRoles = hasCharacter ? ["identity", "scene"] : ["scene"];   // 猜的
   ```
   它用猜出来的 roles 去调 `render.buildKeyframePrompt()`，**从不调用
   `assets.pickShotRefs()`**。于是装配链里的未定义变量对它完全不可见 ——
   闸门检查的是"提示词长什么样"，而崩的是"参考图怎么装"。

#### 修法（两层）

**第一层：闸门改用真实装配函数。** `check-prompts.js` 不再猜，直接调
`assets.pickShotRefs()` + `assets.sceneRefFor()` 求真实 `roles`：

```js
const charAssets = assets.loadCharacterAssets(dir);
const sceneAssets = assets.loadSceneAssets(dir, sb);
for (const shot of sb.shots || []) {
  const refs = assets.pickShotRefs(shot, charAssets, {
    hasCharacter, sceneRef: assets.sceneRefFor(shot, sceneAssets),
  });
  const refRoles = refs.roles;                 // 真实值，不是猜值
  ...
}
```

**第二层：`images.js` 新增 `--dry-run`。** 走完整装配链（参考图选型 + 提示词构建），
一次 API 不调、一个文件不写，把每镜的参考图与提示词长度打出来：

```
[dry-run] 22 镜待生成（不调用 API、不写文件）：
  S01   wide             空镜  refs=1 [场景锚点 SC1·全景]  prompt=2400字
  S02   medium wide      角色  refs=2 [全身参考(side) | 场景锚点 SC1·全景]  prompt=8300字
  ...
[dry-run] 结束 —— 参考图异常 0 镜，未调用 API，未写任何文件。
```

#### 规则（写进习惯）

> **任何放量之前先 `--dry-run`。30 秒换一整批不白烧。**
>
> **闸门只在它真的调用了被测代码时才算闸门。** 复制一份逻辑来"模拟"被测代码，
> 得到的是一份**看起来一样的假证据** —— 它连"变量是否存在"这种最基本的错误都测不出来。

这条对本技能尤其致命，因为参考图装配（`pickShotRefs`）是整条流水线里
**分支最多、最常改、又最不容易从产物反查**的一环：空镜 / 局部镜 / 近景角色镜 /
中远景角色镜各走各的，任何一支断了，只有那种镜头会崩。

#### 一句话教训

**别在闸门里重新实现一遍被测逻辑。** 闸门唯一的价值来自"和实跑走同一条路"；
一旦分叉，它就从护栏变成了安慰剂。

---

### 坑位 78（同日）：空镜里画了一个人 —— 凶手是**角色版景别句**

#### 现象

放量 24 镜后，空镜 S01（`shot_size: wide`，`characters_in_shot: []`，
分镜 prompt 结尾自带 `no people`）连续 **3 次**都画出一个人：
一个蓝绿裙女子站在窗边。门禁每次都正确判 `人物数=1`（空镜 QA 40 分），
但**告警只落在日志里，没进最终报告表**（报告表只统计角色镜），
所以第一眼很容易漏掉。

#### 根因：不是否定枚举，是**串了另一张表**

一开始按坑位 70（否定=反向召唤）怀疑 `no people` / `no figures, no faces,
no silhouettes, no crowd`。但把 S01 的**真实提示词**打出来（零额度）之后，
凶手非常直白：

```
SHOT:
The frame takes in the whole figure with generous space around her.      <<< 这一行
A wide static frame of an airy traditional study, ... no people          <<< 分镜自带
FRAMING: shot size wide, camera angle eye level.
The frame takes in the whole figure with generous space around her.      <<< 同一句又来一次
```

`SHOT_SIZE_CLAUSE` 是**给角色镜写的**表，每一句都假设画面里有人
（`the whole figure`、`around her`、`the face is large`），
而它被**无条件套用到了空镜**上。于是提示词同时给出两个互相矛盾的指令：

| 指令 | 来源 | 模型选了 |
|---|---|---|
| "画面容纳**整个人物**，周围留出空间" | `SHOT_SIZE_CLAUSE.wide` | ✅ 这个 |
| "no people" | 分镜作者 | ❌ 忽略 |

**模型挑的是具体、正向、可执行的那一条。** `no people` 只是一个否定短语，
而"the whole figure ... her"是明确的构图要求 —— 后者赢了。

#### 修法：空镜有自己的景别表

```js
// render.js —— 与 SHOT_SIZE_CLAUSE 一一对应，但一个字都不提人
const SHOT_SIZE_CLAUSE_EMPTY = {
  "wide": "The frame is a wide establishing view of this place, with generous space and depth across it.",
  "close up": "The frame is cropped tight on one surface or fixture of this place, close enough to read its material and its grain.",
  "medium": "The frame takes in one part of this place — a wall, a corner, or the furniture that belongs to it — filling the upper two thirds of the picture.",
  ...
};
// 两处注入点都按 hasCharacter 选表（SHOT 段与 FRAMING 行必须同源）
const SIZE_TABLE = o.hasCharacter ? SHOT_SIZE_CLAUSE : SHOT_SIZE_CLAUSE_EMPTY;
```

空镜的景别只能描述**取景范围**（画面收进这块空间的多少），
**不能描述"人物在画面里多大"** —— 因为它根本不该有人。

#### 零额度验证法

```bash
# 直接拼出空镜的真实提示词，断言里面不出现人
node -e "...buildKeyframePrompt(S01, {hasCharacter:false})..." | grep -cE '\bher\b|\bfigure\b'
# 修前：命中；修后：0 命中
```

#### 一句话教训

**同一张"景别→句型"表不能同时服务"有人"和"没人"两种镜头。**
角色版的每一句都在描述人在画面里多大；把它套到空镜上，等于用最具体的措辞
要求模型画一个人 —— 而分镜里那句 `no people` 只是一条否定短语，压不住它。

---

### 坑位 75 补记七（同日，第十轮）：稳定出双人的镜头，最后只能靠**张数或裁切**收场

补记三收敛到"张数=人数旋钮"，本轮把它推到边界：**有两格镜头，任何参数都救不回来。**

#### 现象

春风的 24 镜里，S15（medium / front / SC4 水乡石桥）与 S21（medium / front / SC5 月下庭院）
在第一次放量后稳定出两个人。横向对照给出一个很强的信号：

| 参考角度 | 该角度的镜头 | 结果 |
|---|---|---|
| `side` / `3q-left` / `3q-right` | S09 S10 S17 S19 S20 | **5/5 单人** |
| `front` | S13 S15 S21 | **1/3**（S15、S21 双人） |

于是按"嫌疑优先级"逐个排查，每一步都跑真图（不是推理）：

| # | 尝试 | 结果 |
|---|---|---|
| 1 | 原样重跑（3 次/轮 × 2 轮） | S15 6/6、S21 3/3 双人 |
| 2 | `--ref-view S15=3q-left,S21=3q-right`（换参考角度） | S15 0/3、S21 0/3 |
| 3 | `--no-scene-ref`（降到**1 张**参考图，环境改走文字） | **两镜都一次通过**，但环境**彻底失控** —— 分镜是"烟雨水乡石桥"和"月下庭院"，两张都画成了**桃花园林** |
| 4 | 给 prompt 补"facing the camera + 面部居中"（比对成功镜发现：S13/S17 的 prompt 都有面部焦点，S15/S21 没有） | **S21 一次通过 ✓**；S15 仍 0/3 |
| 5 | 把 S15 的动作从 `walking slowly across`（"横穿"易生成两侧各一人）改成 `standing still at the centre` | 更差（35→25→88，出现"主角=2"分身） |

S15 累计 **15 次尝试、0 次单人**。这不是随机失败，是系统性的。

#### 结论一：**"人数"这条轴，文字管不了**

第 3 步（`--no-scene-ref`）反过来证明：撤掉参考图，人数立刻对了（1/1），
但环境从"水乡石桥"变成"桃花园林" —— 即使 keyframe_prompt 里明明白白写着
`walking slowly across a low stone bridge`。**这已经是第三次验证"图能定环境、字不能"**
（补记四、补记六、补记七）。所以：

> **环境**只能靠图；**人数**只能靠"少给图"或"后期裁"。
> 两者在个别镜头上会**直接冲突**，这时没有"更聪明的措辞"，只有取舍。

#### 结论二：面部焦点是**低成本的加分项**，不是万能药

第 4 步救回了 S21（也让它 1 次就过），值得保留：

- 失败镜 S15/S21 的 prompt 是 `Medium shot of the protagonist walking … / standing …`（只有身体动作）
- 成功镜 S13/S17 的 prompt 都有面部焦点（`facing the camera with a bright open smile`）
- 补上 `facing the camera, her face clearly visible and centred in the frame` 之后，S21 通过

**规则**：分镜标注 `characters_view: front` 时，`keyframe_prompt` 里就应该有
"面朝镜头"的字样 —— 两者不一致是分镜自身的漏洞。这条写进分镜检查清单。

#### 结论三：救不回来的那一格，用**裁切**收场

S15 的双人版有一个特点：**两个人是同一个角色的两个复制体**（同款衣装、同款发型），
左右对称站在石桥两侧，环境完全正确。于是：

```python
# 从 2624×1472 的双人图里，裁一个 1200×675 的 16:9 窗口对准左侧那位
im.crop((202, 257, 1402, 932)).resize((1920, 1080), Image.LANCZOS)
# → 单人、A6 的脸、水乡石桥木构 + 雨丝、三分法构图
```

**裁切是零额度、零风险、确定有效的最后一张牌。** 代价是分辨率从 2K 降到 1080p
（放大后略有软化），以及景别会比分镜标注更近半档 —— 这两条在 MV 里都可以接受
（视频模型本来就会重采样到 1080p）。

**判断顺序**（从便宜到贵）：
```
重跑（1–3 次）→ 换参考角度 --ref-view → 补面部焦点措辞 →
降到 1 张参考 --no-scene-ref（换环境）→ 裁切补救（零额度，最后一张牌）
```

#### 落地

| 改动 | 说明 |
|---|---|
| `images.js --ref-view "S15=3q-left"` | 按镜覆盖**参考图角度**，不动分镜朝向（`assets.pickShotRefs` 的 `o.viewOverride`） |
| `images.js --no-scene-ref` | 任意景别都不挂地点锚点，环境改走文字（`--tight-no-scene` 的全局版） |
| 分镜 `keyframe_prompt` | S21 补入"面朝镜头 + 面部居中"（S15 的改动已回退，因无效） |

#### 一句话教训

**"人物"是提示词能管的；"人数"最终仍要靠张数或裁切。**
当一格镜头稳定地要画两个人时，继续调措辞是在错误的维度上加力 ——
要么把参考图减到一张（拿环境换），要么接受生成结果、在后期裁掉（拿分辨率换）。
没有第三条免费的午餐。

## 坑位 79（2026-10-04，第 4 步视频试点实测）：`--only` 的**部分完成**被当成失败 —— 试点永远"看起来崩了"

### 现象

第 4 步（图生视频）按纪律先跑 3 镜试点：

```
node videos.js --project "…/mv-春风许我再少年" --keys-file … --only S01,S05,S13
```

**三条全部成功**，运动量全部达标（S01=3.49 / S05=8.40 / S13=3.54，阈值 1.2），
产物落在 `03_clips/`。但脚本：

- **`EXIT=1`**（进程退出码 = 失败）
- 输出 `CLIPS_FAILED=S02,S03,S04,S06,…,S24` —— **21 个从未打算生成的镜头被列为"失败"**
- 把 `project.json` 的 `stages.clips.done` 写成 **`false`**

### 根因

report 段只问"文件在不在"，没问"这次要不要生成"：

```js
if (!fs.existsSync(p)) { rows.push([shot.id, "MISSING", …]); failed.push(shot.id); continue; }
```

`--only` 排除掉的镜头**天然没有文件** ⇒ 全部落进 `failed` ⇒ 退出码非零、
`done = failed.length === 0` 为假。**这不是"跑挂了"，是"没跑完"，两者必须分开。**

### 影响（为什么必须修）

1. **人眼/自动化会把成功的试点判成失败**，于是丢掉一次已经付过额度的验收机会
   （或者反过来，有人看到 `EXIT=1` 就去重跑，把额度再烧一遍）。
2. `run.js:165` 用 `project.stages.clips.done` 决定"视频阶段是否已完成" ——
   状态被污染后，整条 `run.js` 流水线的阶段判断跟着错。

### 修法（`videos.js` report 段）

```js
const notRequested = [];
if (!fs.existsSync(p)) {
  // 本次 --only 就没要它 ⇒ pending，不是 failed
  if (!wants(shot.id)) { rows.push([shot.id, "—", …]); notRequested.push(shot.id); continue; }
  rows.push([shot.id, "MISSING", …]); failed.push(shot.id); continue;
}
```

配套三处：

| 项 | 修前 | 修后 |
|---|---|---|
| `ready` 口径 | `r[1] !== "MISSING"` | `r[1] !== "MISSING" && r[1] !== "—"` |
| `stages.clips.done` | `failed.length === 0` | `failed.length === 0 && ready === shots.length` |
| 退出码 | 只要有"缺失"就 1 | 只有 `failed`（真正失败）才 1；纯 `--only` 未跑完 → **0** + 提示续跑 |

新增输出行 `SHOTS_PENDING=…`（本次没请求、不算失败的镜头）。

### 规则

> **分阶段跑（`--only` 试跑）的完成语义，必须与"全量跑"区分开。
> 退出码回答的是"本次请求的是否都做完了"，不是"全片是否做完了"。**

凡是"用子集换便宜"的开关（`--only`、`--candidates` 试跑、按章节跑），
报告层都要把 **pending** 与 **failed** 分成两个集合 —— 否则"省钱跑试点"这个动作
本身就会持续产出假的失败信号。

### 附：第 4 步的实测数据（16:9，Agnes 视频 API）

- 输出规格固定 **1280×704（720P）@ 24fps**，与关键帧的 2K 无关
  （1280/704 = 1.818 略宽于 16:9 = 1.778，`assemble.js --canvas auto` 取众数画布，无需手工干预）。
  关键帧 2K → 视频 720P 是这条链路的**固有降采样**，不是配置错误。
- 时长由 `shot.api_seconds` 决定（歌曲时长向上取整到整数秒），实际落盘会多零点几秒
  （S01 请求 7s → 7.30s），由 `assemble.js` 按歌曲时间轴裁切。
- **`HTTP 503 video_queue_full`（视频队列已满）是常态**，脚本内置退避重试
  （4s→8s…，最多 49 次）后自动成功，无需人工干预。
- 3 镜试点总耗时 **6 分 0 秒**（并发 2），每条命中 1 个 key。

## 坑位 80（2026-10-04，第 4 步视频实测）：**半身首帧 + 要全身的动作** ⇒ 视频模型把主角复制成两个人

### 现象

S15（medium / front / SC4，`visual: 她缓步走过石桥`）：
关键帧是**单人半身**（该镜在关键帧阶段稳定双人 15 次 0 成功，最后靠裁切补救），
分镜动作是 `向镜头方向缓慢走两步`。生成的 9s 视频 —— **4 个取样帧全是双人**
（两个同款女子并排走在石板路上）。

### 三次尝试，全败

| 尝试 | 改动 | 结果 |
|---|---|---|
| 1 | 原样重跑 | 双人 |
| 2 | 改运镜：删掉 `the camera pulls back gently to reveal more of the bridge and water`，改「跟随 + 单人居中」 | 双人 |
| 3 | 改动作：`走两步` → `静立侧首`，video_prompt 重写为 stands still | **仍双人** |

**措辞、运镜、动作全部不是变量。** 改了三处，一模一样。

### 根因

**首帧能给到的景别，装不下分镜要求的动作。**

- 源图 `shot_S15.att2.png` 是两人并排、几乎占满画面宽度 ⇒ **裁不出"单人全身"的 16:9 窗口**
  （裁宽就带进第二人，裁窄就丢头或丢脚）。所以首帧只能是半身。
- 动作是"走路"⇒ 模型必须**推远**才装得下全身 ⇒ 推远时要**凭空画出**新的身体与空间 ⇒ 复制主角。

与关键帧阶段同源：**这个镜头的内容稳定地要画两个人**（坑位 75 补记七）。
换到视频阶段，这个性质没有消失。

### 最重要的判定：视频阶段「人数」是不可修的

| 阶段 | 可用的"人数旋钮" |
|---|---|
| 关键帧 | 少给参考图（张数）✅ / 裁切 ✅ ／ 换角度 ✅ |
| **视频** | **没有张数可减**（只有一个首帧）／ **裁切不可用**（16:9 裁窄必丢头脚）／ 重跑无效（实测 0/3） |

> **必须在关键帧阶段就保证"首帧的景别装得下分镜要求的动作"。**
> 分镜动作是位移型（走 / 走过 / 走向 / 跑 / 奔 / 跳 / 转身），首帧就必须是**全身或至少中景**；
> 给一张半身首帧配走路动作 = **埋雷**，到视频阶段无解。

### 落地（预防，全部在关键帧阶段）

1. **分镜检查清单新增一条**：`subject_action` 含位移动词
   （走 / 走过 / 走向 / 跑 / 奔 / 跳 / 转身 / 前行）时，`shot_size` **不得**是
   `close-up` / `medium close-up`。分镜确实这么写 ⇒ 改景别（拉到 medium wide / wide）或改动作。
2. **视频阶段遇到人数问题，不要重跑** —— 实测 3 次全败，是纯烧额度。
   正确动作：回到关键帧阶段换首帧，或接受该镜。
3. **视频阶段没有人数门禁**（`motionScore` 只管运动量），全片人数核验只能靠人眼。
   标准动作（零额度）：
   ```
   node assets/shot-times.js --project <dir> --ratio 0.5 > times.txt
   while read id t; do ffmpeg -ss "$t" -i 成片_字幕.mp4 -frames:v 1 "$id.jpg"; done < times.txt
   node assets/montage.js scan.jpg 6 480 264 "S01:a.jpg" "S02:b.jpg" …   # 6×4 一眼扫全片
   ```

### 实测数据

S15 三次重跑共 3 条视频（各 9s），全部双人；运动量均达标（2.61–6.94），
**说明运动门禁完全看不见这个缺陷**。本片 24 镜最终 23 镜单人、S15 唯一双人。

### 落地：`lint-prompts.js` 新增 `MOVE_IN_CLOSEUP`（已实现并校验）

```js
const MOVING_ACTION = ["走过","走向","走两步","迈步","前行","向前走","跑","奔","跳"];
const sizeNorm = String(s.shot_size||"").toLowerCase().replace(/[-_]/g," ").replace(/\s+/g," ").trim();
const tooCloseForMove = /^(close ?up|medium close ?up|mcu|medium)$/.test(sizeNorm);
if (charsN > 0 && tooCloseForMove && MOVING_ACTION.some(w => actForMove.includes(w))) add("ERROR", "MOVE_IN_CLOSEUP", …);
```

**两处靠真实数据校准出来的细节（别改回去）**：

1. **判定档位是 `close-up / medium close-up / medium` 三档，不是只有 close-up。**
   第一版只写 close-up ⇒ **S15（medium）漏网**，闸门全绿而缺陷仍在。
2. **`medium wide` 必须排除。** 用精确正则 `^(…|medium)$` 而非 `includes("medium")`，
   否则 `"medium wide"` 会被 `includes` 误抓（本项目 S06/S11/S14/S23 全是 medium wide，
   实测全部单人）。
3. **`转身` 不属于位移动作。** 第一版收进列表 ⇒ 误报 S17（medium + 缓慢转身，实测单人通过）。
   只有"位置真的变了"的动作才算。

**校验证据**：
- 当前分镜（S15 已改静立）：`24 镜，干净 24，ERROR 0` ✅
- 改动前的分镜：`干净 23，ERROR 1`，且**只命中 S15**（零误报）✅
- `lint-prompts.js --selftest`：`8 PASS / 0 FAIL` ✅

> 通用教训：**新增 lint 规则必须拿历史真实数据回测**。这一条规则改了三版才准
> （漏网 → 误报 → 正确），纯靠推理写不出来。

---

## 坑位 81（2026-10-04，单镜返修实测）：**"只重画一镜"与"整片重跑"选的参考图不一样**

**症状**：修 S03/S09 的服装，习惯性写了
`images.js --only S03,S09 --force`。干跑显示每镜挂的是 **全身参考**；
而当初拍整片的那一轮（`_run_full169.log`）用的是 `--skip-refs`，挂的是 **半身参考**。
同一个镜头，两条命令选出**不同取景档的参考图** —— 返修出来的画面自然和整片不是一套。

**根因**：`buildCharacterAssets` / `buildSceneAssets` 的派生循环**只遍历本次
`--framings` / `--scene-framings` 请求的档位**。
- 默认 `--framings full` ⇒ 只把全身库写进返回值 `bodies`，
  磁盘上明明躺着 `ref_waistup_*.png`（5 张，QA 全 100）却**不被采纳** ⇒
  中景镜走回退链掉到 `bodies[angle]` ⇒ 拿到全身参考。
- 场景同理：默认 `--scene-framings full` ⇒ 中景镜拿到**全景盘**而非中景盘。
- 而 `--skip-refs` 走 `loadCharacterAssets` / `loadSceneAssets`，
  它们**扫描磁盘**、把存在的档位全收进来 —— 所以只有 `--skip-refs` 那条路是对的。

**修法**：两个 build 函数在派生循环之后各加一段"采纳磁盘已有档位"的循环
（本次没请求、但磁盘上存在且可用的档位，一律收进返回值）。
修完两条路径的输出**逐字一致**：

```
--- A) 不带 --skip-refs ---
  S03   medium  角色  refs=2 [半身参考(3q-left) | 场景锚点 SC1·中景]  prompt=8007字
--- B) 带 --skip-refs ---
  S03   medium  角色  refs=2 [半身参考(3q-left) | 场景锚点 SC1·中景]  prompt=8007字
```

> 通用教训：**"磁盘上有什么"必须和"本次要生成什么"分开**。
> 一个"只要 full"的请求，不等于"只有 full 可用"。
> 任何"按请求档位建索引"的资产加载器，都要补一条"照单收下磁盘已有档位"的兜底，
> 否则**单镜返修与整片重跑会走上两条不同的取景链**，而且是静默的。

---

## 坑位 82（2026-10-04，S03 实测）：**服装"款式"由参考图定，背影参考定不出开襟**

**症状**：用户指着缩略图说 "S03 衣服款式不对"。签字款是
**月白交领内衬（开口）+ 半透明粉大袖外披 + 粉蓝渐变百褶裙**；
S03 生成成了 **粉色闭襟长袍 + 纯蓝裙** —— 粉色外袍"合上"了，白色内衬整个不见了。

**根因**：S03 是 `medium` + `characters_view: back`，拿到的是
`ref_waistup_back.png`（背影参考）。**背影看不到开襟结构** ——
从背后看，粉色外披覆盖了整个背部，模型无从推断"它是开襟的、里面还有白色交领"，
于是按最省事的先验渲染成"一件粉色袍子"。
`character_lock.json` 里那段服装文字（`wardrobe_layers.inner/outer/bottoms`）
写得**完全正确**、也**确实进了提示词**，但压不过参考图 ——
与坑位 75 补记二同一条规律：**图能定环境，字不能**；这里推广成 **图能定服装，字不能**。

**实测**：同一镜连跑 2 次（默认背影参考）**2/2 都是闭襟粉袍**。

**修法（已采用）**：`--ref-view S03=3q-left` —— 只换**参考图的角度**，
换成能看清"白交领 + 开襟粉大袖"结构的 3q 半身参考。一次通过，一致度 92，
服装结构与签字款完全对上。

**代价（必须记账）**：参考图赢了分镜文字里的 `back`，人物**转成了正面 3/4**。
这正是"图压字"的又一例：你换了图，图就会连朝向一起带走。
所以同时把 `characters_view` 从 `back` 改成 `three-quarter-left`，
让分镜、参考图、画面三者自洽（否则视频阶段仍会按 `back` 出提示词）。

> 通用教训：**"这个镜头的服装需要被看清"时，别给它挂看不清那件衣服的角度。**
> 需要展示的是**款式**（领型、开襟、层次）时，参考图的角度优先于分镜标注的朝向；
> 反过来，如果这一镜的重点就是"背影/远景"，那就要接受服装细节在那一格里不可读。
> 两者不可兼得 —— 与坑位 75 补记七"没有第三条免费的午餐"同源。

---

## 坑位 83（2026-10-04，9x16 第 3 步试点实测）：**`images.js --only` 硬编码了"整片跑完"的退出语义**

**症状**：`images.js --only S01,S02,S11`（3 镜试点）**3/3 全部成功**、
每张 QA 通过，脚本却返回 **`EXIT=1`**，并在 `project.json` 里把
`stages.images.done` 写成 **`false`**、`KEYFRAMES_MISSING` 列出另外 21 个
**本次根本没打算生成**的镜头。

**根因**：收尾清点只问"文件在不在"，没问"这次要不要生成"。
`missingUrls` 把"未请求"和"做了没成"混为一谈。这与 `videos.js` 的
**坑位 79 是同一处缺陷的孪生** —— 当时只修了视频脚本，图片脚本原样留着。

**危害**：不是"多打印一行"，而是**污染 `run.js` 的阶段判断**。
`run.js` 靠 `stages.images.done` 决定第 3 步要不要重跑；被写成 `false`
会让"已经跑好的 3 镜试点"看起来像"整批失败"。

**修法（已采用，与 videos.js 对齐）**：
- 未请求的镜头进 `pendingShots`，单独打印 `SHOTS_PENDING=`，**不计入失败**；
- `KEYFRAMES_MISSING=` 只列**本次请求过**却没产出的镜头；
- `done` 改为 `okCount === total && missingUrls.length === 0`（两个条件都要）；
- 退出码只在"请求过的镜头确实失败"时为 1；纯 `--only` 试点返回 **0**。

**实测**：改后重跑 `--only S01,S02,S11` → `KEYFRAMES_READY=3/24`、
`SHOTS_PENDING=` 列出其余 21 镜、**`EXIT=0`**。

> 通用教训：**"完成"是相对"本次请求范围"而言的。**
> 凡是支持 `--only` / 分批的脚本，收尾清点都必须区分三种状态：
> 请求且成功 / 请求但失败 / **未请求**。第三种既不是成功也不是失败，
> 把它算进任何一边都会骗过下游的阶段判断。

---

## 坑位 84（2026-10-04，双画幅工程笔记）：**哪些资产跟着成片画幅走，哪些不跟**

做同一首歌的 16:9 + 9:16 两版时，"9:16 要重画什么"不是凭感觉，是**由资产的
画幅来源字段决定**的。逐条实测：

| 资产 | 画幅来源 | 9:16 要不要重画 |
|---|---|---|
| `ref_charsheet.png`（定妆图） | `ratio: "1:1"` 固定 | **不用**（可直接复用/同签） |
| `ref_face.png`（面部锚点） | `ratio: "1:1"` 固定 | **不用** |
| `ref_body_<angle>.png`（全身参考） | `--ref-ratio`（默认 **9:16**） | **不用**（与成片画幅无关） |
| `ref_waistup_<angle>.png`（半身参考） | `--waist-ratio`（默认 **3:4**） | **不用** |
| `ref_style.png`（风格板） | `o.aspect`（**成片画幅**） | 要重画（横板竖板构图不同） |
| `ref_scene_<key>*.png`（场景锚点） | `o.aspect`（**成片画幅**） | **必须重画** —— 横屏盘子塞进竖屏会变形 |
| `shot_*.png`（关键帧） | `sb.meta.aspectRatio` → **成片画幅** | **必须重画** |
| `03_clips/*.mp4`（成片片段） | 视频 API 按画幅出 | **必须重跑** |

**一句话**：**角色资产与画幅无关，场景/关键帧/视频与画幅强绑定。**
所以"补 9:16"实际是"第 1 步基本白拿、从第 2 步的重画开始"。

**⚠️ 配套时序坑**：`images.js --dry-run` 的 `return` 语句在**资产构建段之后**。
所以 `images.js --dry-run`（不带 `--skip-refs`）会**先真的把缺失的参考资产烧出来**，
再打印关键帧计划 —— 想零额度干跑关键帧，**必须同时带 `--skip-refs`**。

**9x16 实测成本**：复用第 1 步（body 5 + charsheet + face）→ 只补
半身 5 张 + 风格板 1 + 场景盘 4×3=12，共 **18 张**，5 分 10 秒。

> 通用教训：**双画幅不是"再跑一遍全流程"，而是"从画幅敏感的那一步才开始"。**
> 判断依据是代码里那个 `ratio` 从哪来，不是"看起来像参考图所以应该一样"。

---

## 坑位 85（2026-10-04，9x16 竖版实测）：**竖屏近景镜更爱"多画一个人"，而 `--ref-view` 能同时保住环境和单人**

**症状**：9x16 竖版 24 镜首轮跑完，**4 个角色镜出双人**（S06 close-up / S08 extreme
close-up / S16 medium wide / S17 close-up），**1 个空镜里混进一个人**（S22）。
而同一首歌的 16:9 版只有 1 个双人镜。竖屏的双人率（4/24）明显高于横屏（1/24）。

**排查**：分镜措辞全部是单人描述（"主角侧脸""主角的眼睛""主角走在青石板路上"），
**不是文字诱因**。共同点是这几镜的景别句在竖屏下都偏宽（模型固有倾向，HARDENING
"景别偏宽半档"）—— **竖屏画布一旦被撑成中景/全景，空出来的地方就会被补成第二个人**。
横屏同样的偏宽只是"人小"，竖屏的偏宽却是"多一个人"。

**分两类处置，结果差别很大**：

| 镜 | 处置 | 结果 |
|---|---|---|
| S06 / S08 / S16 | 原样 `--force` 重跑（保留 2 张参考） | **一次全过**（94 / 82 / 88），单人 ✓ |
| S22（空镜） | 原样 `--force` 重跑 | 一次过，零人物 ✓ |
| **S17** | 原样重跑 3 次 | **3/3 双人**（顽固） |
| **S17** | `--no-scene-ref`（只挂 1 张） | 单人 ✓ 但**环境漂成"白天花园"**（月下庭院丢了）✗ |
| **S17** | `--ref-view S17=3q-right`（保场景） | 92 分同一人，但**配角=1（醒目）** ✗ |
| **S17** | **`--ref-view S17=side`（保场景）** | **88 分、单人、环境正确** ✓ |

**关键洞察**：`--ref-view` 对**近景镜**的作用不只是"换角度"——它会把 tight 档的
身份参考从 **`面部特写`（1:1 正方形）换成 `半身参考`**（见 dry-run：
`refs=2 [半身参考(3q-right) | 场景锚点 SC4·近景]`）。
**面部特写这张"没有身体结构"的图，在竖屏近景镜里反而更容易诱发第二个人**
（模型拿一张纯脸去补全身，空间不够就复制）；换成有肩线/衣料的半身参考，
再配一个侧向角度，双人消失且场景锚点还在。

**必须记账的代价**：`--ref-view` **不持久化**。修完当场好看，将来整片重跑
会退回 `front` → 又出双人（与坑位 81/82 同一类"单镜返修≠整片重跑"的病）。
所以修完要**把 `characters_view` 一并改成与画面一致的值**（本例 `front → side-left`），
并用 dry-run 复核"重跑时会选哪张参考"。实测改后重跑选型 =
`[半身参考(side) | 场景锚点 SC4·近景]`，与已通过的画面自洽。

> 通用教训：**竖屏把"景别偏宽"的代价从"人小一点"升级成"多一个人"。**
> 竖屏近景镜如果首轮出双人，优先级应当是：
> 原样重跑 → **`--ref-view` 换成侧向角度（保场景，最省）** → 最后才是
> `--no-scene-ref`（保单人、丢环境）。

## 坑位 86（2026-10-04，9x16 实测）：**「人物比整栋建筑还大」不是人画大了，是建筑被画小了；而加"尺度锚句"会顺手招来并排双胞胎**

**症状**（用户人眼终审提出）：9x16 水乡/庭院段（SC4，S13–S23）"人物和建筑大小不协调，
有人物比整个建筑还大"。逐格放大后确认了具体形态：

| 对照件 | 画面里的实际高度 | 真实尺度应为 |
|---|---|---|
| 月洞门（圆形门洞） | 约 **0.3 倍**主角身高（到她膝盖） | 一个成年人能走进去，1.2~1.5 倍人身高 |
| 院墙（含瓦顶屋脊） | 墙脊到主角**腰** | 高于人头，约 1.3 倍人身高 |

所以失真方向是**建筑被缩成模型玩具**，不是主角被放大。16:9 版同一地点没有此问题——
因为 16:9 的 SC4 场景盘本身是"水巷+大石桥"的近景，建筑在画面里本来就大。

**根因**：场景盘按景别取档（`sceneFramingForShotSize`：wide→full 盘）。9:16 的
`ref_scene_SC4.png`（full 档）是一张**远景 vista**——月洞门、院墙在盘里就只占很小一块。
关键帧把这张盘近乎照抄（核心定律 2：图能定环境），再按肖像尺度放一个全身角色进去，
两者尺度立刻打架。

**处置一（弱杠杆，已实测）**：给 `keyframe_prompt` 追加"尺度锚句"——
把真实构件点名（月洞门是齐人高的门洞、院墙高过人头），并给出身高预算
（"占画面高度约 1/3"）。实测 S13/S19：月洞门确实变大、人略缩小，
**但改善幅度有限**，符合"文字对环境的服从度极低"。别指望它单独解决问题。

**处置二（强杠杆，首选）**：让**参考图**承担尺度——把该地点换成"近景档"场景盘
（建筑在盘中占画面），或重画该场景的 full 盘为近景构图。图能定尺度。

**⚠️ 副作用（同样是坑）**：这次给 S13 加尺度锚句后，**第一次就画出并排的两个
一模一样的主角**（门禁报"主角出现了 2 次"、一致度 5）。去掉句中的 `a person` 字样
（原句写了 "a doorway standing taller than a person"）后**第一发仍然是双人**，
第二次自动重画才恢复单人（92 分 / 主角 1 / 配角 0）。
→ **给镜头加长句会改变参考图的"信息配比"，长句 + 多张参考图是双人的高发组合。**
  加句后必须过身份门禁（`--force` 单镜重画会自带重试），**不要关 `--verify`**。

> 结论：建筑与人的比例问题，**优先改参考图（换档/重画盘），其次才加文字**；
> 加文字后必须复跑身份门禁，因为它同时抬高了双人概率。

## 坑位 87（2026-10-04）：**`scalecheck` 把并发数当 worker 传进 `runPool`，24 个镜头静默返回 0 条结果**

**症状**：首次跑 `assets/scalecheck.js`，日志明明打印 `24 个镜头，并发 3`，
末尾表格却是**只有表头、零行**，报告 JSON `checked: 0`，退出码 0（看起来"全绿"）。

**根因**：`agnes.runPool(items, worker, concurrency)` 是**三参数**。写成了
`runPool(files.map(f => async () => {...}), args.concurrency)`——第二个参数成了数字，
`worker(...)` 抛 TypeError 被 `runPool` 内部 try/catch 吞掉，
自己的 `results.push` 一次都没执行。**又是一个"静默零结果"。**

**处置**：① 改成三参数正确接线；② 跑完断言 `results.length === files.length`，
不等就打印 `! 结果条数异常`；③ **自检里补一条并发接线的真跑断言**
（`runPool([1..5], async x => seen.push(x), 3)` → 断言 `seen.length === 5`）。
这条断言是这个 bug 的唯一保险——纯逻辑自检（参数解析、判定函数）**全都是绿的**。

> 通用教训：**任何"并发跑 N 个任务再汇总"的工具，自检必须覆盖"N 条进 → N 条出"。**
> 只自检参数解析和判定函数，等于没测到主链路。

## 坑位 88（2026-10-04，9x16 S19 实测 12 轮）：**"让人物在画面里更小"是一个几乎推不动的旋钮 —— 竖屏人像尺度下限 ≈ 34%，而且越写"人小"画得越大**

**起因**：用户看完 9:16 环境/月洞门那一段，提出"人物和建筑大小不协调，有的比建筑还大"，
选定其中一格后要求"**人物再小 1/4**"（画面里人高 34% → 目标 ≈ 26%）。

**做过的 8 种尝试与实测人高占比**（同一格，同一身份门禁，全部单人通过）：

| # | 手段 | 参考图组合 | 结果人高 | 结论 |
|---|---|---|---|---|
| 0 | 起点（半身锚 + 中景盘 + "占 1/3"句） | 2 张 | **34%** | 基准，也是全场最小 |
| 1 | 尺度句改写为"占 1/4、小人" | 同上 | 34% | **文字无效**（0 变化） |
| 2 | `--ref-framing full`（全身锚） | 2 张 | **46%** | **反向**：参考图里的人越完整，成图越大 |
| 3 | `shot_size: establishing`（句="环境主导，人很小"） | 2 张（盘被换成远景 vista） | 35% | 比例协调，但**构图被盘拽走** |
| 4 | `--ref-image` 指该图自身 + "拉远"指令 | 1 张 | **48%** | **反向**：i2i 有"放大主体"惯性 |
| 5 | `establishing` + 构图参考图 | 1 张 | 43% | 反向 |
| 6 | 近景盘（月洞门放大 2 倍）+ 半身锚 | 2 张 | 48%（**双人**） | 门确实变大，但人更大 |
| 7 | 近景盘 + 全身锚 | 2 张 | 48%，单人 ✓ | 门 25%（放大近 2 倍），人/门比 2.6 → 1.9 |
| 8 | `extreme wide` 句 + 近景盘 | 2 张 | **52%** | **措辞越狠人越大** |

**结论（三条，按可靠性排序）**

1. **文字景别句对"人物在画面里的高度"几乎没有权威**（0~2 个百分点），而且方向经常**相反**：
   写 "she is small in the frame / the environment dominates" 会让模型**强化主体**（34% → 52%）。
   与核心定律 2 一致 —— 图能定，字不能。
2. **参考图档位也不是单调杠杆**：半身锚 34% 已经是下限；换全身锚反而 46%。原因是模型把
   "完整人形参考"读成"要把这个人完整画出来"，于是放大。**参考图里的人越小 → 成图越小，
   但项目里所有角色参考图都是"人占满画面"的**，没有可用的"小人参考图"。
3. **唯一真正能动的是"建筑"这一侧**：把月洞门在盘里放大 2 倍，成图里门就放大近 2 倍
   （13% → 25%），人/门比从 **2.6 降到 1.9**。所以"人显得比建筑大"这个问题，
   **正解是放大建筑，不是缩小人**。

> 处置建议：遇到"人物比建筑大"的反馈，**先量人高占比**。
> - 若人高 > 40%：换**更远的场景盘**（vista），环境变大，人自然显小（实测 35%）。
> - 若人高在 34% 左右：已是模型下限，**不要再试图缩小人**；改为**放大建筑**（近景盘）。
> - 若客户坚持"人绝对要更小"：生成模型做不到，只能走**抠图合成**（脱离管线，见坑位 91）。

## 坑位 89（2026-10-04）：**身份参考的"景别档"与场景盘的"取景档"被 `shot_size` 绑死**

**症状**：想只把身份参考换成更远的档（让人变小），却发现 `shot_size: establishing`
会同时把场景盘从 `medium` 跳到 `full`（远景 vista），**构图整个被拽走**
（实测：石榴树 + 月洞门的庭院，变成了水乡石拱桥远景）。

**根因**：`assets.framingForShotSize(shot_size)` 一个输入同时喂两个人：
身份参考档（`pickFramedRef`）和场景盘档（`sceneFramingForShotSize` → `sceneRefFor`）。

**处置**：`assets.pickShotRefs` 新增 `o.framingOverride`；`images.js` 新增
**`--ref-framing "S19=full"`**（值 close | waistup | full）—— **只覆盖身份参考档，
场景盘仍按 `shot_size` 取**。非法值直接报错退出（不会静默退回默认）。

## 坑位 90（2026-10-04）：**单镜替换参考图的两把刀 —— `--ref-image`（连脸一起换掉）与 `--scene-image`（只换盘，保脸）**

返修某一镜时经常需要"照着我给的这张图重画"。新增两个开关：

| 开关 | 换掉什么 | 保什么 | 代价 |
|---|---|---|---|
| `--ref-image "S19=路径"` | **全部**参考图（身份锚 + 场景盘） | — | **脸会丢**：喂一张空镜盘，一致度只有 15（模型自由发挥五官） |
| `--scene-image "S19=路径"` | 只换**场景盘** | 身份锚照常按 `shot_size` 选 | 参考图仍是 2 张，**双人概率回升** |

- 两者都接受**本地路径**（优先读旁边 `.url` sidecar；没有 sidecar 时自动转 **data URI**，
  所以几何合成的图不用先上传就能喂进去）或 **http(s) URL**。
- 用 `--ref-image` 时**必须**同时给 `--ref-framing`/`shot_size` 一个像样的景别句，
  否则模型只按那张图构图。
- 实测：`--scene-image`（近景盘）+ 半身锚 → **双人**；+ 全身锚 → 单人。
  参考图张数仍是人数的主旋钮（坑位 75 补记三）。

## 坑位 91（2026-10-04）：**"几何缩小 + 镜像补边"造小人参考图 —— 伪影会被模型照抄**

**想法**：既然模型照抄参考图的构图，那就先把原图整体缩小 65%（人 34% → 22%），
四周用 `reflect` 镜像补齐，再把这张"小人图"当参考喂回去。

**结果**：人物**没有变小**（33%），而镜像伪影被**完整照抄** —— 画面里出现了
**两个月亮、左右各一个圆洞门、树冠镜像对称**。模型分不清"这是构图指令"
还是"这是场景内容"，它一律当内容抄。

> 教训：**几何合成图只能用于"结构正确"的参考（如裁切、拼接的同源图），
> 不能用来表达"我希望这个人更小"的意图** —— 伪影会变成画面的新内容。
> 要表达"更小"，唯一可靠的是**换一张本来就人小的图**（而项目里没有这样的资产）。

## 坑位 92（2026-10-04，9x16 试点实测）：**写了「固定机位 / static」的镜头，被自动补了一句推镜 —— `CAMERA_KEYS` 里根本没有 "static"**

**症状**：9:16 S19 分镜明确写 `camera_movement: 固定机位（static）`、`video_prompt: The camera remains static…`，
但成片是一条**从全身推到面部特写的推镜**（7 秒里构图完全改变）。
日志里躺着凶手：`[lint] S19: 补写摄影机运动`。

**根因**：`videos.js` 的 `CAMERA_KEYS` 收录了 dolly/pan/track/crane/orbit/推进/横移… ，
**唯独没有 static / locked off / 固定机位 / 静止**。"static" 不是运镜词，所以
`hasAny(original, CAMERA_KEYS)` 判为"没写运镜" → 自动补一句
（intensity 1 → "摄影机近乎静止，只做极缓慢的微推移"）；
再叠加默认增强句 **"严禁静止帧、严禁定格、严禁缓慢到近乎不动的镜头"** →
模型老老实实推了过去。

**双杀**：这不只是"多了一句"，而是**管线的自动修补静默覆盖了分镜的显式意图**。
用户看到的是"我明明写了固定机位，为什么是推镜"。

**处置**（三处，全部已落地）
1. `CAMERA_KEYS` 补入 `static / locked off / fixed camera / still camera / no camera movement / 固定机位 / 镜头静止 / 机位固定 / 静止 / 固定`。
2. 新增 `STATIC_CAMERA_KEYS`，命中即视为**声明固定机位**：
   - 增强句换成锁定版：**"摄影机全程锁定不动，机位与构图恒定，画面不出现推、拉、摇、移"** +
     "画面内保持连续细微的自然运动（呼吸、眨眼、发丝与薄雾轻动、尘埃漂浮），严禁定格帧、严禁画面冻结"；
   - **不触发**"太静 → 加运动重跑"（`retries = declaredStatic ? 0 : args.motionRetries`），
     否则静镜会被重跑成推镜；
   - 运动量低于阈值的报告里**不再列它**（静是设计意图，不是缺陷），日志改写
     `motion=x.xx -> ok (固定机位，静是设计意图)`。

> 通用教训：**关键词白名单是"用户意图"与"自动修补"之间唯一的接口。
> 白名单漏一个词，自动修补就会覆盖一条明确的创作决策，而且日志只写"补写了XX"，不会报错。**

## 坑位 93（2026-10-04，9x16 试点实测）：**镜内"入夜" —— 关键帧是黄昏粉调，视频提示词写着 "dark sky / stars / night"，模型在 6 秒内自己把天黑了**

**症状**（逐帧亮度量化，见 `_qa/_916_pilot_lumchart.png`）：同一镜首帧还亮着，末帧已入夜：

| 镜 | 首帧亮度 | 末帧亮度 | 跨度 | 形态 |
|---|---|---|---|---|
| S01 书斋空镜 | 123.8 | 136.0 | +12 | 稳定 |
| S16 水乡跟拍 | 108.3 | 78.4 | **-30** | 秒级持续变暗 |
| S19 庭院固定 | 89.6 | 45.8(t=1) → 79.7 | **-44** | 先骤暗再回亮（推镜所致） |

对照已交付的 16:9 成片：**24 镜里 21 镜镜内跨度 <10**（稳定），说明这不是管线常态。

**根因**：两版 SC4 是不同的场景设计——
- 16:9 的 SC4 是**烟雨水乡（雨景）**，其 `video_prompt` 里**夜间词 = 0**；
- 9:16 的 SC4 是**月下庭院（月夜）**，`video_prompt` 里 **6 镜含夜间词**
  （S16 `dark sky, stars`；S18/S20/S22 `moonlight`；S19 `night`；S21 `night`）。

而**关键帧渲染出来是偏亮的黄昏粉调**（9:16 SC4 关键帧亮度 92–145）。
于是视频阶段"向文字靠拢"：**每镜都从关键帧的亮起手，在自己的 6~9 秒里跑到夜**。
更糟的是 S16→S22 是**连续 7 镜**，每切一刀都回到亮、每镜末都变暗 →
成片会读作**逐镜明暗闪烁**，而不是"天色渐晚"。

**处置**
1. **代码侧（已落地）**：新增 `LIGHT_LOCK_CLAUSE`，**无条件**追加到每一条视频提示词尾部：
   → **"光照与时间保持不变：整段画面维持与首帧一致的光线色温与明暗，不得在镜头内发生昼夜或天气变化。"**
   目的不是"变暗"，而是**把光照钉在首帧**，让相邻镜能干净地剪。
2. **环境补写句同步改**：`环境持续运动：空气流动、光线缓变、细小颗粒漂浮`
   → `环境持续运动：空气流动、薄雾缓缓飘移、细小颗粒漂浮（光照保持不变）`。
   原来的"**光线缓变**"是全片唯一一条**主动授权光照变化**的措辞，属埋雷，已移除。
3. **内容侧（需创作决策）**：若某镜的目标就是夜色（如 S21 "渐暗的夜色"），
   那是**关键帧就该是夜色**，而不是让视频在镜头内变夜。**关键帧与 video_prompt 的
   光线描述必须一致**，否则视频必然漂移。

> 通用教训：**关键帧与视频提示词是两套文字，任何一方的"时间/光线"描述不一致，
> 视频阶段一定会漂移（并且是单向的：向文字靠拢）。定稿关键帧时，
> 顺手检查 `video_prompt` 里有没有与画面矛盾的"夜色 / 星光 / 正午"字样。**

## 附：`videos.js --show-prompt`（零额度）

排查提示词类问题不再需要烧额度试跑：**打印每条镜头最终真正下发的提示词**
（含 lint 修补 + 增强句 + 风格/光线句）后直接退出。

```bash
node scripts/videos.js --project <dir> --only S19 --force --show-prompt --keys-file <keys>
```

输出会标注该镜是"声明固定机位"还是"有运镜"，一眼看出自动修补有没有动手。

## 坑位 94（2026-10-04，9x16 S13/S16 实测）：**「人物比建筑大」的根治在场景盘的"档位"，而档位被 `shot_size` 焊死了 —— 加两个分镜字段把两条轴拆开**

**症状**（用户人眼终审）：9:16 SC4 段的 S13、S16「**人物和建筑的大小很不协调**」。
放大核对后的实际画面：主角站在庭院里，**月洞门只到她的膝盖**、院墙墙脊齐腰，
整片水乡屋顶像**桌面模型**。S13 与 S16 还几乎**同一张**。

**先量，别猜**。叠加百分比网格逐格量：

| 镜 | 人高占比 | 同框建筑 |
|---|---|---|
| S13 | 46% | 月洞门 ≈ 人身高的 **0.26 倍** |
| S16 | 43% | 同上 |
| S19（用户已认可） | 47% | 月洞门 = **真实门洞**（1.2~1.5 倍人身高） |

**三个人的绝对高度几乎一样（43~47%）**——所以**问题不在"人太大"**，
而在**同框建筑被画小了一个数量级**。同一条结论在坑位 86/88 已经出现过两次，
这次拿到了最干净的一组对照（同一场景、同一角色、只有参考图组合不同）。

**根因（管线结构缺陷）**：参考图选型有**两条独立的轴**，
却都由**同一个输入 `shot_size`** 推导：

```
shot_size ──┬─→ framingForShotSize()      ─→ 身份锚档 (close|waistup|full)
            └─→ sceneFramingForShotSize() ─→ 场景盘档 (close|medium|full)
```

`wide` 这个景别，把身份锚推到 **full（全身参考）**、把场景盘推到 **full（全景 vista）**。
而 SC4 那张全景盘是一张**跨河远景**——月洞门在盘里本来就只占画面约 10%。
模型照抄这张盘（核心定律 2：图能定环境），再按人像尺度放一个全身角色 → 尺度立刻打架。
S13/S16/S18/S21 四格都踩了这个组合（全片共 11 镜是"全身锚 + 全景盘"）。

**处置（已落地，实测有效）**：把两条轴拆开，各给一个**分镜字段**：

| 字段 | 覆盖什么 | 取值 |
|---|---|---|
| `shot.ref_framing` | **身份锚**的档位 | `close` \| `waistup` \| `full` |
| `shot.scene_framing` | **场景盘**的档位 | `close` \| `medium` \| `full` |

两者都是"**分镜字段优先，非法值直接抛错**"（不静默退回默认，坑位 89 的同一条规矩）。
S13/S16 写成 `ref_framing: waistup` + `scene_framing: medium` 后重画：
一致度 **92 / 单人 / 一次过**，月洞门回到真实门洞尺寸、院墙高过人头、石榴树占满画面。

> 为什么必须做成字段而不是继续用 `--ref-framing`/`--scene-image` 这类命令行开关：
> **开关只修这一次跑**。项目真正的真源是 `01_plan/storyboard.json`；
> 下次谁重跑一次 `images.js`，一次性的命令行修复就无声蒸发了。
> **凡是"这一次的效果必须是常态"的修复，都要落到分镜/资产里，不能停在命令行。**

**附带发现（下一层问题，尚未处置）**：把 S13/S16 挪到中景盘后，
SC4 段出现 **S13 / S15 / S16 / S19 四格构图雷同**（都是"树 + 庭院 + 月洞门"）。
即：**修尺度会移动"构图重复"的分布，不会消除它**——因为一个场景只有
full / medium / close 三张盘，而 11 个镜头要在这三张盘上分。
根治要靠**为同一场景生成多张不同机位/构图的盘**，而不是反复在这三张里挑。

> 通用教训：**参考图的两个维度（"谁"和"在哪、多大"）只要共用一个输入，
> 就一定会出现"想调 A 却动了 B"**。先把轴拆成独立字段，再谈调参。

---

## 坑位 95（2026-10-05，9x16 S18/S21 实测）：**当场景的三张盘档位"全都是错的"，唯一的修法是再画一张盘 —— 新增分镜字段 `shot.scene_plate`**

**症状**：用户看完整段 SC4 后只留一句 ——「S18 S21 换一个场景，人物和建筑依旧不协调」。

**根因不在人，在盘**。SC4（烟雨水乡与月下庭院）只有三张盘，而它的 `full` 档是一张**跨河远景**：
镜头离建筑极远，整条水乡被压成模型玩具（月洞门只占画面约 10%、石拱桥像摆件）。
盘里又没有人物做尺度参照，模型就按人像尺度往前景塞一个全身角色 →
**人比整面院墙还高、比整个村还大**（坑位 86 的同一条病，出现在 S18/S21 两格）。

- S13/S16 当初靠**换档**解决（`scene_framing: medium`，见坑位 94），代价是那几格构图雷同；
- 到 S18/S21 时，`medium` 档已经被 S13/S15/S16/S19 四格占满 —— **再换档只是让"雷同"从 4 格变 6 格**。
- 于是用户选了对的路：**同一个庭院，换一台机位，重画一张盘**。

**问题**：`scene_framing` 只能在场景**已有的档位里挑**，挑不出"还不存在的这张新盘"。
命令行 `--scene-image` 能指任意文件，但它**只修这一次跑**（坑位 94 的同一课）。

**处置（已落地）**：给分镜加一个字段，把"这一镜用哪张盘"变成项目真源的一部分。

| 字段 | 值 | 说明 |
|---|---|---|
| `shot.scene_plate` | **绝对路径**（本机图，有 `.url` 边车走 URL，没有则自动转 data URI）或 `http(s)` URL | 优先级压过 `scene_framing` 与 `shot_size` 推导 |

实现要点（`scripts/lib/assets.js: readScenePlateOverride` / `sceneRefFor`）：

1. **未设置 → 完全走原逻辑**，对既有项目零影响。
2. **相对路径 → 直接抛错**，不解析。相对路径会随工作目录落到不同文件，
   这种"静默指向别处"正是坑位 89/94 反复咬人的那类 bug。
3. **文件不存在 → 抛错**；不退回场景默认盘。
4. 本地图**没有 `.url` 边车也能用**：自动转 data URI 交给 i2i
   （视频阶段的 first_frame 才强制要公网 URL；**场景盘只活在图片阶段**）。
   体积控制：盘文件先缩到长边 1800 再落地，data URI ≈ 2.9 MB。
5. 自检 7 项（绝对路径/url 直通/相对路径报错/缺文件报错/未设置回落/档位推导不变）。

**实测**：S18/S21 写 `scene_plate` 后各**一次过、单人**，一致度 96 / 92 / 82，配角 = 0。

**新盘的生成口径（可复用）**：以已有中景盘做 i2i 源，提示词里**用米制数字锁建筑尺寸**——
「月洞门约 2.2 m 高 2.2 m 宽，院墙含水瓦脊约 3 m，铺地砖约 40 cm，石凳座面约 45 cm；
这里没有任何东西是微缩玩具」。
**不要写"人很小"**（坑位 88 实测会把主体画大），**要写建筑的真实尺寸**，让人自己落到正确的相对大小上。

> 通用教训：**"档位"是有限集合，而创作需求是无限的。**
> 一旦某个场景的**所有档位**都不满足需求，正确的动作不是继续换档，而是**补一张新盘**，
> 并且立刻给它一个**字段**——否则这次的修复会在下一次 `images.js` 重跑时蒸发。
> （**核心定律 8「档位有限，需求无限」+ 定律 7「修法落进真源」**）

---

## 坑位 96（2026-10-05）：**`scalecheck` 的 `ok / too_large` 判定不可复现 —— 同一张图两次跑出相反结论，它不能当门禁**

**现象**：修完 S18/S21 后复跑审计，**同一张、未被改动的 S21**：

- 第一次：`身高占比 1.80  ok  头顶明显低于门洞上沿，比例符合正常成年女性`
- 第二次：`身高占比 0.80  too_large  头顶几乎与月洞门顶部齐平，明显比真实人体偏大`

是/否完全相反.jpg。同一张图、同一个提示词、只是重跑了一次。

**为什么**：该判定是**视觉模型对"建筑构件"的自由解读**——它会自己挑一个参照物并猜它的真实尺寸，
换一次采样就可能挑到不同的构件（远桥 vs 近墙 vs 屋顶）。**这不是可复算的测量，是意见。**

**处置**：改索取**坐标**，自己算。新增 `_qa/measure.js`（模板可直接复用）：
让视觉模型只输出归一化坐标（头顶 y、脚底 y、月洞门顶/底 y、墙脊 y），
再由脚本算「人高占画面比」「门高/人高」「头顶是否高于墙脊」。
**数值由我们算，判断权交回人眼。**

同一批实测（9:16，1472×2624）：

| 镜头 | 人高 | 月洞门高 | 门/人 | 结论 |
|---|---|---|---|---|
| S13（用户已通过） | 0.49 | 0.12 | 0.24 | 参照基线 |
| S16（用户已通过） | 0.50 | 0.15 | 0.30 | 参照基线 |
| S18 旧 | 0.47 | 0.11 | 0.23 | 远景微缩 |
| S18 新 | 0.60 | 0.15 | 0.25 | 落在基线区间 |
| S21 旧 | 0.52 | 0.12 | 0.23 | 同上 |
| S21 新 | 0.60 | 0.17 | 0.28 | 落在基线区间 |

> 通用教训（与"写实小人物镜头人眼终审"同源）：
> **凡是让视觉模型"看着给个结论"的检查，都不能当门禁 —— 只能当线索。**
> 要让模型值钱，就让它**报坐标/报事实**，把推导与判定留在代码和人这边。
> 需要门禁时，用**可复算的量**（这里是像素几何），并明确写下容差来自哪几格已通过的镜头。
> （**核心定律 6「机器只报事实，判定归人」**）

---

## 补记：`images.js --show-prompt`（2026-10-05）

与 `videos.js` 同名的开关补齐到图片阶段：**零额度**打印每一镜**最终下发**的提示词
（走的是和真实跑完全同一条装配路径：参考图选型 → 提示词构建 → lint 修复 → 增强），然后退出。

```bash
node scripts/images.js --project <dir> --only S18,S21 --force --show-prompt
```

为什么需要：图片阶段的提示词里有一大段是**装配出来的**（身份块 + SHOT-LOCAL STATE +
REFERENCE HANDLING 的逐图职责 + 景别句 + [[SCALE]] + GRADE + 排除句），
**只读 storyboard 看不到最终长什么样**；而每一跑都是真金白银。
放量前先 `--show-prompt`，可以一眼看出"参考图挂了几张、挂的是哪张、锚句有没有被吞"。

---

## 坑位 97（2026-10-05，9x16 S19 实测）：**改了关键帧的构图，就必须同步改 `video_prompt` —— 视频模型跟随"文字"胜过跟随"首帧"**

**症状**：S19 的关键帧是**庭院远景**（人约占画面 1/4，用户验收过的 A 版），
但成片里 S19 却是**面部特写**（闭眼微笑、泪光）。首尾构图完全对不上。

**根因是"一个镜头有两种自相矛盾的描述"**：

| 来源 | 说的是什么 |
|---|---|
| `keyframe_prompt` 的 `[[SCALE]]` 锚句 | 「人站远处，只占画面约 1/4 高，建筑真实尺寸主导画面」 |
| `shot_size` / `visual` / `video_prompt` | 「面部特写，镜头聚焦主角的脸，微笑、闭眼、泪珠滑落」 |

图片阶段照 `[[SCALE]]` 画出了远景；视频阶段却照 `video_prompt` 出了面部特写。
**首帧被无视了** —— 视频模型对「景别」这类强语义文字的服从度高于对首帧构图的模仿度。

**排查手段（可复算）**：把成片按 assemble 的真实槽位抽帧，与对应关键帧做灰度直方图相关。
`corr < 0.5 且首尾构图肉眼不同` = 高度可疑（S19 为 0.53，全场最低之一）。

**处置**：把 `video_prompt` 改写成与关键帧同一构图（远景、人小、镜头锁定不动）+ 明确写
「the camera never approaches her face / there is no close-up」，重跑该镜即恢复一致。

> 通用教训：**关键帧与 `video_prompt` 是同一个镜头的两种描述，必须同构。**
> 凡是为了构图/尺度去改 `keyframe_prompt`（例如加 `[[SCALE]]`），
> 都要回头检查 `shot_size`、`visual`、`video_prompt` 有没有被留在旧景别上。
> （**核心定律 3「同构律」**）

---

## 坑位 98（2026-10-05，9x16 全片实测）：**首帧是"暮色/月光"时，视频模型会自发演出入夜或过曝 —— prompt 层拦不住，只能后期校**

**症状**（同一批 24 镜，抽首帧/尾帧比对亮度）：

| 镜头 | 机位 | 首帧 lum | 尾帧 lum | 判定 |
|---|---|---|---|---|
| S19 | 固定机位 | 123 | 79 | 淡紫渐入深蓝 ❌ |
| S14 | **固定机位** | 142 | **26** | 几乎入黑 ❌ |
| S24 | 缓慢推近 | 131 | **238** | 渐进过曝近白 ❌ |
| S07/S08/S11/S12/S15/S17 | 有运镜（拉远/推近） | — | 变暗 15–64 | **属设计内**：拉远后天空/暗部占比变大，自然变暗 |

**关键判据**：**先把"运镜导致的内容变化"排除掉**。缓慢拉远会让画面自然变暗变蓝，
那不是漂移。**固定机位（`static`）下出现的任何亮度/色温变化才是真漂移** ——
S14 正是固定机位却暗到 lum 26，铁证。

**prompt 层无效（已实测）**：给 S19 连写两版、逐版加强措辞
（"the lighting, colour balance and time of day stay exactly as in the first frame …
it must never darken into deep night"），**两版都照样漂移**（123→79）。
这已经是 `LIGHT_LOCK_CLAUSE` 之外的第二道文字保险，仍然拦不住。

**处置（零额度、可复算）**：**镜内时间色调稳定化** ——
逐帧求 LAB 的均值/标准差，以本镜**起始若干帧**为目标做均值+方差迁移；
对均值序列先做**滑动平均（窗口约 9 帧）再施加校正**，避免逐帧校正产生闪烁。
实测效果：S14 142/26 → 140/140；S19 123/79 → 121/119；S24 131/238 → 129/127。

**局限（重要）**：**过曝是不可逆的**。S24 那种 lum 238 的帧，高光细节已经丢失，
后期只能把亮度"拉回来"，找不回信息。所以**优先别让它过曝**（首帧别给太亮的亮部，
或缩短单镜时长），后期稳定化只当兜底。

> 通用教训：**"光照恒定"不是 prompt 能保证的事，是需要在成片阶段"验证 + 兜底"的事。**
> 流水线应该固定带两步：① 逐镜 `drift-check`（首帧 vs 尾帧，先排除运镜）；
> ② 对判定为真漂移的镜做 `stabilize-color`，再进 assemble。
> （**核心定律 4「没写死的模型会自己改」+ 定律 6「判定分层」**）

---

## 坑位 99（2026-10-05，9x16 S14 实测）：**首帧在岸上，`video_prompt` 只写"水" → 模型把水面扩到人物脚下，人"站进水里"**

**症状**：9:16 成片第 90s（S14，`SC4` 岸边放花瓣入水）里，主角**站在水面上**——
裙摆直接没入水中，脚下没有岸。但**首帧是正常的**（她站在干石板上）。

**关键区分**：这不是首帧坏，也不是 `[[SCALE]]` 那类尺度问题，而是
**`video_prompt` 缺一条"她站在什么上面"的锚句**。

原来的 `video_prompt` 通篇是水：

> places a flower petal into the moving water … The petal floats away …
> Ripples spread … reflections of white walls shimmer **on the water's surface**

——**一句都没提"岸"**。而这一镜的场景盘恰好是 `SC4` 的 `close` 档，
**那张盘本身右侧一大块就是河面**（岸边+河面混合盘）。
模型顺着"水"的语义把水面往人物脚下扩张，于是人下水了。

**附带的第二症状**：镜头还自己**重新构了图**——背景从「院墙 + 月洞门」漂成「石拱桥 + 桃花枝」，
人物从画面左侧移到中央。说明 **`static` 只约束"相机不移动"，不约束"不重新取景"**
（`camera_movement: 固定机位（static）` 已在，仍然重排了）。
这和坑位 97 同源：**文字里没写死的东西，模型会自己改。**

**处置（改 `video_prompt`，不重画关键帧）**，加三类锚句：

1. **站位锚**：「全程站在干燥的石砌驳岸上，双脚踩在岸上铺地石、**明显在水线之上**；
   绝不涉水、绝不站在水中、衣摆与鞋任何部分都不得没入水中」。
2. **水位锚**：「河道在她**身前、下方**，水位全程**保持原位**，**不得朝她上涨**」。
3. **构图锚**：「不重新取景（the scene does not re-compose）——左侧白墙、月洞门、
   石拱桥保持与首帧相同的大小与位置；她的身形在画面中的大小与位置从头到尾不变；
   镜头不推近、**不向下摇向水面**、**不出现特写**」。

**结果**：重跑 1 镜即修复——双脚回到石板上，水面退到画面下缘；头尾亮度 142 → 132
（修前是 142 → 26），顺手把坑位 98 的入暗一并解决。

> 通用教训：**先写"她站在什么上面"，再写"她做什么"。**
> 凡画面里存在**水 / 悬崖 / 车流 / 火**这类"危险元素"，
> 都要显式写一句「**她不在其中**」；只描述"水怎么动"，模型就会让水去够她。
> 另外：**`static` ≠ 构图锁定**——锁定相机之外，还要单独写"不重新取景"。
> （**核心定律 4「没写死的模型会自己改」**）

---

## 坑位 100（2026-10-05，9x16 S20/S23 实测）：**空镜的"孤立名词"会被模型造成一朵凭空的花 —— 主体必须有物理支撑**

**症状**：用户看片后一句 ——「花在这个场景不自然」。
两枚 SC4 空镜（Outro 段）：

| 镜 | `keyframe_prompt` 原文 | 成片实际画出来的 |
|---|---|---|
| S20 | *a single tear drop falling onto **a flower petal*** | 一朵**比石拱桥还大的白花浮在水面上**，无茎无根 |
| S23 | *dew drop on **a pomegranate flower petal*** | 一朵**大红花直接长在铺地石上**，无茎无根 |

两朵花的共同点：**没有茎、没有枝叶、没有根系、没有落瓣**，
孤零零"悬"在水面/石板上，而且因为 `shot_size` 是 `close-up` / `macro`，
花被放大到比背景建筑还大 —— 写实水乡里这叫"贴纸"，不叫园艺。

**根因**：提示词只给了**孤立的名词**（"花瓣"），**没给"它长在哪 / 挂在哪 / 落在哪"**。
模型拿到一个裸名词，就自己造出一朵完整的花，再随手找个位置放下。
**这是坑位 99 的同一条病，从"人站在哪"扩到"物件长在哪"。**

**附带的隐性诱导**：全局 `GRADE` 串里有一句「结合薄雾与**花瓣**折射的漫射光」——
`GRADE` 是每条提示词都会拼上去的公共块，所以**每一镜都在被提醒"花瓣"**。
排除句（`NO flowers`）比它更具体，实测压得住，但这类词应当从公共块里清掉。

**处置**（用户拍板的方向：不要凭空的花）：

1. **换承载物**，而不是换花：把主体从"花"换成**这个场景里真实存在、且有物理支撑的东西**——
   - S20 → **石桥的石栏杆上**一颗水珠映月（`a bead of water on the weathered stone railing of the bridge`）；
   - S23 → **石榴树叶尖**悬着的一颗露珠映庭院与月（`a dew drop hanging from the tip of a pomegranate leaf`，
     并写 `surrounded by further pomegranate leaves and thin twigs` 给出枝叶环境）。
2. **两个提示词都要写死排除句**：`keyframe_prompt` 与 `video_prompt` **双双**加
   「no flowers, no petals and no blossoms anywhere in the frame」。
   只改一处 = 坑位 97（一个镜头两种描述）。
3. **`scene_framing` 字段对空镜同样有效**：S23 是 `macro`，默认会拿 `SC4` 的 `close` 档
   （水边+河面），而"露珠映庭院"需要**石榴树**做环境 → 写 `shot.scene_framing: "medium"`，
   拿到含石榴树 + 月洞门 + 庭院的中景盘，装配日志确认 `场景锚点 SC4·中景`。

**结果**：两枚新关键帧一次过 —— S20 是"石栏上的一颗水珠映着月亮"，
S23 是"石榴叶尖垂下的露珠，珠中映出庭院与月亮"，全程无花，构图自然。

> 通用教训：**空镜写主体时，"它是什么"和"它在哪"必须成对出现。**
> 只写"花瓣"，模型就给你一朵没有根的花；
> 写"石栏上的水珠"、"石榴叶尖的露珠"，模型才把主体落到场景的物理结构上。
> 顺带：**公共块（`GRADE` / `LIGHT`）里的名词会被每一镜继承**，
> 它同时是"风格锚"也是"污染源"，发现某类物体反复乱入时，先回头翻公共块。
> （**核心定律 4「没写死的模型会自己改」+ 定律 3「同构律」**）

## 坑位 101（2026-10-06，《三生三世·终得卿》实测）：**双主角归档后，全片 36 镜被判成空镜 —— `--skip-refs` 的资产入口是根目录，`hasCharacter` 也只看根目录那一套**

**症状**：两套角色资产分别生成并归档到 `02_images/_refs_female/` 与 `_refs_male/` 之后，
`images.js --skip-refs` 的日志写着 `[1/3] No character assets found on disk … shots will render without
identity anchoring`，随后的 `--dry-run` 把**每一个角色镜都打印成"空镜 refs=1 [场景锚点]"**。
没有任何报错、没有门禁告警 —— 图会照常生成，只是**每一镜都是模型自己编的一张新脸**。

**根因（两处，缺一不可）**：

1. `loadCharacterAssets(dir)` 只认 `<dir>/ref_charsheet.png` / `ref_face.png` / `ref_body_*.png` ——
   单主角架构的固有一处硬编码。双主角必须把两套挪到子目录（否则第二遍生成会被
   `if (!o.force && isUsable(sheetPath))` 判成"已存在"直接 skip），一挪就谁也找不到。
2. `images.js` 里 `hasCharacter = characterNames(shot).length > 0 && !!(charAssets.face || …)` ——
   它问的是"根目录那一套在不在"，而不是"**这一镜那位主角的资产在不在**"。

**判定（三秒）**：跑 `--dry-run`，看人物镜的类型列。正常应是 `角色 refs=2`；
如果**全是** `空镜 refs=1`，就是这个坑。

**处置**：在 `node -r` 预加载的双主角补丁里同时做两件事 ——

```
assets.assetsFor = assetsFor;              // 按镜 → 该镜主角的资产桶
images.js 侧：const shotAssets = assets.assetsFor(shot) || charAssets;
              hasCharacter 改用 shotAssets 判定
```

**顺带三条同源教训**（同一晚连续踩到，都是"静默回退"形态）：

- **调用方和被调用方的函数名必须逐个核对**。补丁里先写了 `assets.assetsForShot`，
  而 harden 导出的是 `assets.assetsFor` —— `typeof` 判假、静默走空壳分支，
  日志上完全看不出异常。**任何"取不到就回退"的写法都必须配一句 `[warn]`**，
  否则它就是一个只在成片上才暴露的 bug。
- **`.url` 边车必须跟图一起归档**。只搬 `.png` 不搬 `.png.url`，`isUsable` 会判
  "边车丢失"并**抛错中止**（这是坑位 76 的保护，别绕过）。本机 `fs.rename` 是托管 shim，
  同一批里对 `x.png` 与 `x.png.url` 连续 rename 会误报 `ENOENT` —— 每步 try/catch、
  最后统一核对，不要因为一个文件失败就中断整个归档。
- **定妆图必须人眼终审，门禁会漏掉它没被要求看的东西**。同晚女主重出的一版候选，
  **三视图人物完全裸体、服装全丢**，却被评测器判 `达标 92 分` —— 因为它只检查了
  "有没有下方表情带"，把裸体当作"未展示服装层次"顺带描述过去。
  人物资产的门禁分**不能代替看图**（对照坑位 30 结尾"门禁结构上看不见构图错误"）。

> （**核心定律 1「一致性 = 共享可复用资产 + 显式引用」** —— 资产在，引用断了，等于没做）

---

### 坑位 102｜`KEYFRAMES_READY=36/36` 不等于台账齐全 —— 续跑跳过的镜不写 `identity_report`

**症状**：日志尾部 `KEYFRAMES_READY=36/36 / KEYFRAMES_MISSING=none` 一片大好，
但打开 `identity_report.json` 只有 **24 条**，比故事板里 27 个人物镜少 3 条。

**根因**：`images.js` 断点续跑时，`.png` 已存在的镜会**直接跳过生成**，于是这一镜的
验收记录（`qa[]`）从未产生；而报告是从 `qa[]` 汇总的：

```js
for (const r of qa) { if (!r.has_character || r.score === null) continue; … }
for (const [shot, attempts] of byShot) { perShot.push({ … }) }
```

**没有 `qa` 记录 = 没有台账条目**。文件齐全与台账齐全是两件事。

**判定（十秒）**：生成收尾后必做一次交叉核对 ——

```
人物镜数 = storyboard.shots.filter(s => s.characters_in_shot.length).length
台账条数 = identity_report.per_shot.length
两者必须相等，差额就是"跳过未验收"的镜
```

**处置**：差额部分事后用 `compareIdentity` 补检（ roles-for-shot 取该镜主角的
`ref_face.png` + 一张 `ref_body_*.png`），命中 `protagonist_count===1 && other_people_count===0`
即可补进台账，并打 `_source:"census-patch"` 标记以便区分。

> 本例补检结果 92 / 90 / 85 分，画面本身没问题 —— **是账缺了，不是图坏了**。
> 但如果图确实是被当成空镜跑出来的呢？所以这一步不能省：差额必须补检，不能默认"早跑的就是对的"。

> （**核心定律：daemon 的 readiness 输出只证明"文件在"，不证明"验收过"** —— 收尾必查台账闭合性）

### 坑位 103｜`video_prompt` 的锁必须单独校验，且别用猜的正则去验

图像端的 `node -r` 补丁只作用于 `keyframe_prompt`。**视频模型同样会顺着 `video_prompt`
加戏**（多出一个人 / 换性别），所以 `video_prompt` 要按镜单独注入同一套锁
（参见坑位 29 第 6 条）。

注入后**必须**校验，而校验本身也会踩坑 —— 本例写的正则 `/EMPTY FRAME LOCK|no person/i`
对实际文案 `"This frame stays completely empty of people"` **匹配不上**，
于是 9 个空镜全部误报"缺锁"，差点回头改一处根本没有问题的东西。

**正确做法**：先用 `--dry` 打一行真实文案出来看见它长什么样，**再照着它写正则**，
并用"三分支精确判定"（女主镜要求 `Qingyuan…No man, no second woman`、
男主镜要求 `Xuanye…No woman, no second man`、空镜要求 `stays completely empty of people`），
同时用出现次数做**幂等校验**（同样的锁重复注入会把 prompt 撑爆）。

> （**核心定律：验证断言本身也是代码，也会错** —— 一处"9 条异常"先怀疑自己的正则，再怀疑流水线）

---

### 坑位 104｜不要相信单次视觉评审的绝对分数 —— 连跑三次能翻盘三次

**实测**：同一批 9 张抽帧，用 `compareIdentity` 连跑三轮，得到的分数是

| | 轮 1 | 轮 2 | 轮 3 |
|---|---|---|---|
| S07（青鸢） | 82/95/92 → 稳定 | 96/90/93 → 稳定 | **55/10/22 → 飘移** |
| S27（玄夜） | 92/**45**/94 → 飘移 | **25**/95/94 → 飘移 | 94/95/90 → **稳定** |
| S36（空镜） | 0 人 | 0 人 | 0 人 |

温度已经压到 0.1，绝对分数依然能整体翻转。**任何基于单次分数的"最优 Greenwich 帧淘汰"判定都是假的。**

**可靠的是评语里的重复项，不是分数。** 三轮里反复出现的那条差异描述才是真信号
（本例 S27 的"脸圆/下颌宽"在轮 1 轮 2 都出现了，尽管分数和所在帧不同）。

**做法**：把判定从"绝对打分"改成"组内相对比较"——同一段的几帧连同参考图一起喂进去，
只问 **"哪一帧最不像"**（`worst_frame`），跑 3 轮取多数票。相对任务稳定得多：

```
三轮投票 → S07 公认最差帧 p20（3/3 全票）
        → S27 公认最差帧 p95（2/3 多数）
```

配套脚本：`scripts/census.js`（单帧清点人数）、`video-probe.js`（抽帧 + 段级汇总）、
`video-compare.js`（多投票组内比较）、`eye-probe.js`（单特征专项，多次采样）。

**单帧结论必须 ≥3 次采样**，并且：** tally 票数 + 评语一致性，两者都看，别只看分。**

> （**核心定律：一个会波动的度量更安全 —— LLM 评委给的是意见，不是测量值**）

### 坑位 105｜提示词里的情绪隐喻会被视频模型字面执行

**实测**：S27 剧情写的是「他缓缓举起剑，**眼里终于有了光**」。这句话直译成
`a faint light appears in his eyes` 后：

- 关键帧 `shot_S27.png`：**0/3 发光，虹膜深褐，完全正常**
- 视频末帧 `S27_p95`：**3/3 确认发光，虹膜金黄**

关键帧干净 ⇒ 病在**视频阶段**，不在图像阶段。

**为什么危险**：这类失效**不是随机的**，是可预见的、能在开跑前静态扫出来的。
它浪费的是最贵的额度 —— 全片跑完才发现奇观。

**做法一（治标）**：改写成动词主语是"表情 / 眼神"而不是"光"的句子
`his expression eases and his gaze steadies`，并显式反锁：

```
His eyes stay their natural deep brown for the entire shot: no glowing pupils,
no luminous or discoloured iris, no light emanating from the eyes, and no glow,
halo or supernatural visual effect anywhere on his body or his sword.
```

**做法二（治本，必做）**：进 `videos.js` **之前**用 `scripts/prompt-scan.js` 全量扫一遍，
零额度。它会揪出：

- 「眼里有光 / 瞳孔发光」类：light|glow|shine|gleam|spark + eye 的组合
- 「身体发光 / 灵光」类：glow|halo|aura + body 的组合
- 「兵器发光」：sword + glow|flame
- 「变身变形」：transform|morph|shape-shift
- 「服装发型改变」：change + garment|hair（与 identity lock 直接冲突）
- 「多人物暗示」：side by side|face to face|embrace（严格不同框项目的雷）
- 「多宫格暗示」：three views|contact sheet|grid

> **扫描器自身的两个坑（都踩过）**：
> ① 只扫**真正喂给模型**的字段（`keyframe_prompt` / `video_prompt`）。
>    把 `visual` 这类剧本文案也扫进来，会被"中文残留"淹没 36 镜，真雷反而看不见。
> ② 必须豁免**否定语境**。自己写的防护 `"no glow, halo or supernatural visual effect"`
>    会被自己的规则命中；且判断要用 `[^.;]{0,60}$` 而非 `[^.,;]{0,45}$` ——
>    逗号列举（"no A, no B, and no C"）是最常见的负向写法，把逗号排除就整条漏判。

> （**核心定律：可预见的失效要在最便宜的环节拦截** —— 一句情感隐喻的代价，
> 在写提示词时是 0 元，在扫描写阶段是 0 额度，在全片视频跑完后是整套重做。
> 补 Todo：`prompt-scan.js` 应该在 `plan.js` 之后、`images.js` 之前就跑一次，
> 而不是只等到 `videos.js` 之前。）

---

### 坑位 106 — 空镜的"无人"约束会被稀释，必须三层堵（一句锁不够）

**症状**：空镜的 `keyframe_prompt` 里明确写了 `no people`，末尾还追加了一句
`EMPTY FRAME LOCK — this frame contains NO people at all`，**结果关键帧里照样站了 4 个古装人物**。
视频阶段更离谱：S24 中途长出 3–4 个行人（"两个站立，一个端坐"），S35 把一双靴子补成了
"一双穿黑色长靴的人腿"。成片反向抽帧才暴露出来。

**根因**：三处叠加，每一处都削弱了那句锁。

1. **位置**：`EMPTY FRAME LOCK` 追加在 2500 字提示词的**最末尾**，
   后面还跟着一大段中文运镜/风格增强词。越靠后权重越低，等于没写。
2. **CMV 自带负面词块写的是 `absent: a second person`** —— 这句话只在禁"**第二个**人"，
   等于明确默许画一个人出来。空镜必须改成 `no person at all`。
3. **诱导词具象化**：`boots`（靴子）会被模型补成"穿着靴子的腿"；
   extreme wide 山景会被自动铺一条石板路再往上点景人物（提示词里根本没写路）。

**修法（三层堵，缺一层就会漏）**：
```
① NEG   —— 把负面块的 "a second person" 替换成 "no person at all"（空镜专用）
② PRE   —— 把"无人"声明插到 SHOT 正文**之前**，抢占权重最高的位置
③ POST  —— 末尾逐镜定制，专门堵这一镜被观察到的具体漏法
           S24: no traveller on any path/ridge/terrace, no distant crowd（路是模型自己铺的）
           S35: EMPTY and UNWORN, no feet inside, no legs（靴子不许长腿）
```
**注意**：`--show-prompt` **必须带 `node -r <harden>.js` 一起跑**。
不带补丁跑出来的是 CMV 原版提示词，你以为"锁没生效"，其实只是你没加载自己写的补丁
（这次就白查了一轮）。

**更狠的一张牌**：提示词三层都堵上后 S24 仍是 1 人（4→1 有改善但没清零），
重画 3 次全败。此时用**坑位 75 的张数=人数旋钮** —— 空镜唯一的图像输入是场景锚点，
用 `o.noSceneRef` 把它摘掉（CMV 只有全局 `--no-scene-ref`，按镜生效得在补丁里传），
`refs=0` 之后**第一次就 0 人通过**。代价是环境改由文字描述。
> 顺序：先改提示词（便宜、无副作用），不行再摘锚点（有效但伤场景一致性）。


---

### 坑位 107 — 台账闭合性要连空镜一起算（坑位 102 的漏网之鱼）

**症状**：Stage 3 台账报 `27/27 passed，平均 90`，于是判定"关键帧全部验收过"。
成片反向抽帧却发现两个空镜里站着人 —— 而且**关键帧本身就脏**（S24 关键帧 4 人）。

**根因**：`identity_report.json` 的 `per_shot[]` **只收角色镜**
（只有角色镜才调 `vision.compareIdentity`）。本片 36 镜里 9 个空镜走的是
`vision.auditKeyframe`（空镜零人物校验），**结果不落台账**。
于是"27/27"读起来像全片通关，实际只覆盖了 27 个角色镜，**9 个空镜根本没人记账**。

**规矩**：台账分子分母要按 `storyboard` 的真实构成拆开报：
```
角色镜 27/27 通过（compareIdentity，平均 90）
空镜    9/9  通过（auditKeyframe，human_count=0）   ← 必须单列
```
**凡是"某类镜头不在台账里"就是验收盲区**。空镜恰恰是最容易出事的那一类
（坑位 106：模型的点景人物倾向专门挑空镜下手）。

**配套**：成片出来后必须再跑一次**反向抽帧核验**（从成片按 storyboard 时间表逐镜抽帧，
复核人数/文字/双人同框）。`verify.js` **完全不看画面内容** —— 它查不出
"第 3 分 20 秒多了一个人"，而这正是双主角项目最致命的失效。
> 三级判据：关键帧台账 → 视频抽帧 → **成片反向抽帧**。最后一级是唯一能抓住
> "assemble 切错帧 / 视频中途加戏"的手段，不能省。

---

### 坑位 108 — 用正则改提示词会静默吃掉身份锁（本轮最贵的一个坑）

**症状**：批量替换 `keyframe_prompt` 的动作句，跑完锁校验全绿、QA 分也正常，
但成片里某一镜的身份一致性塌了。

**根因**：写了 `/<动作句>[^.]*\./i` 这种正则。`[^.]*` 是贪婪的，它会一路吃到
**下一句话的句号**才停 —— 实际吞掉的是后面那整句
`The ONE person in frame throughout is the SAME man already shown in the first frame: ...`。
身份锁被删得干干净净，而校验脚本只查"锁还在不在"的时候已经晚了。

**规矩**：改 storyboard 提示词**只用精确字符串替换，绝不用正则**。
数组形式 `[原文逐字拷贝, 新文]`，`vp.includes(from)` 匹配不上就 `process.exit(1)`，**不猜、不模糊匹配**。
替换后再对**备份文件**逐条断言所有锁都还在，少一条就拒绝写文件。
每次改之前先 `cp storyboard.pre-xxx.json storyboard.json` 留回滚点。

---

### 坑位 109 — 否定声明是在给模型"提词"，越描越黑

**症状**：想让剑不要挂在腰上，于是在提示词里写
`his hands are FAR FROM his belt — the sword is NOT being inserted into any scabbard on his belt or hip, there is no scabbard hanging at his waist`。
结果模型**照样画出一个腰间鞘**，而且每一版都画。

**根因**：图像模型对否定词的处理是"先生成被否定的概念，再试图压制"。
你写 `waist / belt / scabbard` 越多次，这些概念的激活强度越高。
**"腰间没有剑鞘"这句话本身就把"腰间剑鞘"塞进了模型的候选集。**

**规矩**：写道具约束时**只正面描述唯一想要的那个状态**，
把不想要的东西的名称从提示词里**彻底删干净**，一个字都别出现。
想让剑在手上，就只写 `he grips the sheathed sword with both hands across his chest`，
不要提 belt、waist、hip、scabbard 中的任何一个。

---

### 坑位 110 — 罗列"不是什么"同样失效，要靠正面类比物锚定

**症状**：想要一支细长白玉簪，模型第一版画成「银色圆环 + 链条」，
于是把形态写死：`a straight slender stick-like body ... NOT a ring, NOT a hoop, NOT a chain, NOT a bracelet`。
第二版**依然画成白色圆环** —— 负面清单一个都没挡住，反而全部应验。

**根因**：同坑位 109。负面清单在语义上等于逐一点名错误形状。
模型真正缺的不是"不要画什么"，而是**一个它熟悉的、形状明确的类比物**。

**规矩**：把物体锚定到一个模型绝对熟悉的东西上：
```
a long thin straight white-jade stick, the same shape as a slender chopstick,
one small silver cherry-blossom ornament fixed to its head end
```
`chopstick` 一上去，细长直杆的形状立刻就对了，两轮评审都确认"细长光滑的簪子，顶端花形装饰"。

---

### 坑位 111 — 道具画错时，先查景别，别死磕提示词

**症状**：同一个"手持带鞘"的写法，S19（close-up）一次就过，
S34（medium）连改三版全被判成"剑挂在腰间"。提示词逐字抄过去也没用。

**根因**：**景别决定了什么东西会进画框，也就决定了模型的默认先验能不能落地**。
中景里腰带和胯部在框内，而"武侠男主腰间佩剑"是模型最强的一条先验 ——
只要腰带进画框，剑就会被挂上去，跟提示词怎么写无关。
S19 是特写，只到胸，腰带压根不在框里，模型只能画手持。

**规矩**：道具位置反复画错时，按顺序排查：
```
① 提示词里有没有在提词（坑位 109/110）→ 改成纯正面描述
② 场景锚点是不是在把构图拉偏（坑位 75）→ 摘锚点
③ 景别是不是让"错误位置"进了画框             ← 最容易被忽略，但常常是决定性的一条
```
想让道具在 A 位置，就**从构图上把 B 位置裁出画外**。
改景别要连 `shot_size` 字段一起改 —— 光改提示词不够，CMV 会拿这个字段参与构图。

---

### 坑位 112 — 拗不过模型时，就把它立为官方设定

**症状**：S34 四版全败（垂在身侧 / 腰腹高度 / 横在胸前 / 收到近景），
无论怎么写，模型都把玄夜的剑画成腰间佩剑。

**决策**：别再烧额度了。**顺应模型，把"剑稳稳挂在腰间、全程不动"立为这一镜的官方终态**，
然后把 video_prompt 锁死：`it is never drawn, never raised, never slides onto his back and never leaves his hip`。
改完之后**一次过，92 分，无需自动重画**。

**为什么这是对的**：用户的真实诉求是"剑不要突然瞬移到背后"，不是"剑必须拿在手里"。
腰间佩剑 + 全程不动同样满足诉求，而且是模型画得最稳的形态。
叙事上也通：前一镜"缓缓收剑" → 这一镜"剑已归鞘悬于腰侧，双手空垂"。

**规矩**：一个道具连续 3 版画不出目标形态时，停下来自问一句 ——
**"这个形态是不是在模型的能力边界外？"**（参考坑位 104 的结论：先用探针把
同类镜头全查一遍，确认模型到底会画哪几种形态，再决定要哪一种。）
若确认是硬先验，就把模型最稳的那种形态**反向立为设定**，改剧本和 video_prompt 去适配它。
**在能力边界外硬拗，每多跑一版都是纯浪费。**

---

### 坑位 113 — 同一个"长直道具"要按顺序列一遍，别让它扫读到哪儿算哪儿

**症状**：S21（剑的特写）在同一份提示词下，一次画出银环首、一次画成金色圆头，
外观随机漂移。

**处置**：把道具拆成**从一端到另一端的固定顺序清单**，每一项都先 generalizations
再给细节，让模型逐项走一遍：

```
SWORD SPEC — the ONE sword in this frame reads end to end exactly as follows:
a matte jet-black lacquered sheath covering the entire blade,
then a straight CROSS-SHAPED guard in matte gold,
then a black cord-wrapped grip,
and at the extreme end of the grip a plain SILVER RING pommel —
a small round ring of pale silver metal, like a silver finger ring threaded onto
the grip end, the brightest pale-metal part of the sword.
```

**为什么有效**：散落的形容词没有阅读顺序，模型每次挑其中几个词来画；
列成有序清单后，每一段都有确定的位置，遗漏会明显减少。
给关键部件再加一句**类比物**（`like a silver finger ring`）比单纯润色形容词有效得多（同坑位 110）。

---

### 坑位 114 — 要某个部件被看见，就把它放到构图里最亮、最高的地方

**症状**：改对了结构还是出不来 —— 柄首在这些判读里大量被判"看不清"。

**处置**：**位置优先于描述**。让柄底端位于画面上方、逆着开阔天空：

```
the sword leans diagonally against the stone with its GRIP END AT THE TOP of the
frame — the grip and its silver ring pommel are highest, lifted clearly against
the open storm sky and fully lit, while the sheath tip rests on the stone below.
```

**理由**：物体的细节能不能被画出来，取决于它在画面里**有多少像素、受不受光**，
不取决于提示词写得多细。被手挡住、被腰带给遮住、压在暗部的部件，
写一百遍也是白写。（配套判据见坑位 117：**"看不清"的占比就是可行性的天花板**。）

---

### 坑位 115 — 提示词里的否定词要全项目搜一遍再删

**症状**：v3 的样式锁写了 `no sword tassel, and no second sword anywhere in the frame`，
S21 反而长出了一把**黑色剑穗** —— 全片其他 10 个剑镜都没有。典型的反向召唤（坑位 109）。

**第二次仍然长出剑穗**：删掉了 `fix-sword-style.js` 里的那句，
**但漏了 `fix-v2-shots.js` 里 S21 关键帧提示词里同一意思的那一句**
（`One sword only, no sword tassel, no sword knot, no second sword.`）。
同一条约束散在两个文件里，改一处不生效。

**规矩**：删否定词必须在整个 `_cmv/` 下全局搜一遍同类表述，
把所有出现的地方一起删。**一个概念有多处落地点时，改一处等于没改。**

---

### 坑位 116 — 给长直道具换个"平稳放法"，可能反而把它画断

**症状**：为了修"剑在石栏边缘像被折断"，把 S21 从**斜倚**改成**平放在石台上**。
结果关键帧丢了刚画对的银环，视频连续两轮都判
**"剑身中段错位、柄端与鞘端分离悬空"**——反而更糟。

**推测**：斜倚时有一个明确的支撑点（"倚在什么上面"），
模型有几何参照；平放在台面上时失去了这个参照，
长直物体很容易被画成不相接的两段。

**处置**：**回退**到斜倚版。断/错位这类硬伤比"边缘构图略怪"严重得多，
要优先保住几何完整性。

**教训**：返工时给新版本留个判断 ——
**如果新版引入了比旧版更严重的硬伤（断裂、错位、凭空增物），立刻回退，别往前修。**

---

### 坑位 117 — "看不清"的占比就是某部件能不能统一的上限

**症状**：全片剑样式体检跑完，22 个样本里 `pommel_ring` 字段
**有 5 个直接判"看不清"**，柄首 Field 统一率始终上不去（v2 5/22 → v3 6/22，加满锁也没动）。

**判据**：先统计体检结果里**有多少比例直接写了"看不清"**。
这个比例就是天花板 ——
它说明该部件在这些镜里**压根不在画框内**或**被遮挡**，模型画不出来，
加多强的提示词锁都提高不了统一率。

**动作**：看到某个字段"看不清"占比过高，直接**停止投入**，
把结论写进交付报告据实告知，而不是继续重写提示词。
（本轮据此判据止损，省下了多轮视频重跑的额度。）

---

### 坑位 118 — VLM 给不出可靠的边界框，别拿它做裁图/几何计算

**症状**：想从一张"画对了"的关键帧里裁出道具做参考图，于是让 VLM 报 bbox。
结果三轮下来数量级完全不一致 ——
第一轮给的是**像素坐标**（`x0:0, x1:901`），第二轮给的是**百分比**（`x0:0, x1:90`），
第三轮直接不是数字。改成问"从 x=N% 竖切掉簪子"，同一张图两轮的答案是
**"不可行"** 和 **"x=90"**，互相打架。

**结论**：这批 VLM **在空间定位任务上不可靠**，它的强项是"描述看到了什么"，
不是"这个东西在第几像素"。让它报坐标，等于拿一个不确定的量去做精确操作。

**备选路线**（若确实要做视觉上的裁剪/去物）：
1. 先用 VLM 确认**哪张图里那个部件是对的**（这个它答得准，见坑位 104 的多次采样投票）
2. 再用 CMV 自带的 `--ref-image <shotId>=<path>` 把整图挂上去
   （支持本地图自动转 data URI，会自动一句话提示缩到合适大小）
3. 真需要精确切除 → 找专门的分割模型 / 传统 CV，**不要指望通用 VLM 报坐标**

**注意** `--ref-image` 会把该镜**所有**参考图替换掉（身份锚和场景盘一起），
且 role 固定写成 `identity`，所以它只适合"这一镜整体翻拍"，
不适合"在不破坏原有锚点的前提下偷偷加一张道具图"。

---

### 坑位 119 — 半身档（waistup）在这个模型上画不出来，别再试了

**症状**：`images.js --refs-only --framings waistup` 让模型派生半身参考图，
**5 个角度 × 3 次重试全部失败**，评审理由高度一致：

> 「取景为全身照，不符合半身（腰以上）要求」
> 「画面完整包含人物下半身长裙与双脚，属于全身棚拍照」
> 「截断线位于脚部而非腰部」

**已经排除了参考源的问题**：CMV 用「面部特写」当源（无取景可复制，见 assets.js 的
`bodyRef`），模型**仍然**输出全身。所以这不是"源图带偏"，而是模型的强先验：
**"studio photograph of a person" 就默认拍全身**。

**结论**：`--framings waistup` 这个档位在本模型上**不可用**。
不要为了它反复重试烧额度（实测 15 张图、3 分钟，产出 0 张可用）。

**替代做法**（按代价从低到高）：
1. **让中近景镜直接用全身档参考** —— 这是当前实际走的路。CMV 的
   `pickShotRefs` 在 waistup 缺失时回退到 full，画面仍然能出，只是取景可能被
   拽宽一点（坑位 75 的老问题）。
2. **改 `shot_size` 到 `close-up`/`extreme close-up`** —— 这两档吃 `ref_face.png`
   （面部特写，本来就存在），靠**景别字段**控制取景，比生成半身参考图可靠。
   代价：分镜的景别字段被改了。
3. **手工裁一张半身图**当 waistup 档 —— 用 ffmpeg 从全身图裁掉下半身，
   写进 `ref_waistup_<angle>.png` + `.url` 边车。**最省、最直接**，
   因为裁切是确定性的，不像生成那样随机。

---

### 坑位 120 — 生成目录与读取目录不一致，额度全白烧

**症状**：给两个角色补参考资产，模型日志一路 `[ok] xxx -> 1.88 MB`，
看起来全部成功；实际上关键帧阶段**一张都没用上**。

**根因**：`harden-sansheng.js` 的 `buildCharacterAssets` 补丁只做了
「切换角色源」（`sb.character2` 顶替 `sb.character`），**没切换输出目录**。
于是：
- **生成**写进 `stageDir(project, "images")` = `02_images/` 根目录
- **读取**（`loadCast()` → `loadCharacterAssets`）读 `02_images/_refs_female|_refs_male/` 子目录

两边根本不是一份东西。而且两个角色都往同一个根目录写，**谁后跑谁覆盖谁**：
跑完 female 再跑 male，根目录里就只剩 male 的资产了。

**修法**：补丁里连 `o.dir` 一起换到角色子目录，
让生成路径与加载路径指向同一个地方（`path.join(path.dirname(o.dir), SUBDIR[role])`）。

**判据**：任何"生成资产 → 另跑一阶段消费它"的流水线，都要**显式验证
「写进去的那份」和「读出来的那份」是同一个文件**。
最省事的验证：跑完生成后 `ls` 一下消费端读的那个目录，别只看生成日志的 `[ok]`。
类似的前科见坑位 81（`--only` 单跑与全量跑选到不同参考图）。


---

## 坑位 121 — 视频队列满时的三重误判：把服务端拥堵当成代码 bug

**2026-10-09 实测。** 全量重跑 36 镜，连续四次启动都被判为"卡死/静默退出"，实际原因完全不同。记下来，因为每一层误判都会让人去改本来没坏的代码。

### 现象链

| 观察 | 第一反应（错） | 真相 |
|---|---|---|
| 后台任务 4 分钟无输出 | 进程卡死 | 服务端 503 退避中，`tail -80` 管道把输出缓冲住了 |
| 日志 7 分钟不动 | 死锁 | 单 key 被罚到 300s 冷却上限，每轮都在干等 |
| `mv` 日志文件成功 → 判定进程已死 | 进程退出了 | **`mv` 探测法有 false positive**，不可信 |
| 单镜跑到 `progress=10%` 后无输出 | 轮询坏了 | 轮询**只在进度变化时打日志**（`if (progress !== lastProgress)`），10% 停留期间无输出是正常的 |

### 真因：Agnes 视频队列持续满

```
[video-create] HTTP 503 {"code":"video_queue_full","message":"视频队列已满"}
[video-create] 429 rate limited
[keys] penalized (429); cooldown 45s
[S01] take 1/1 failed: HTTP 503 video_queue_full     ← 7 次重试全败
[S01] motion retry 1: regenerating with stronger motion  ← 然后进入第二轮，继续 503
```

连续 11 次创建请求全被 503 拒绝。**这是服务端容量问题，不是代码问题**。正确的应对是**停下等窗口**，不是改代码。

### 三条代码修复（这些是真 bug，已修）

1. **`agnes.js penalize` 冷却上限没考虑 key 数量。**
   单 key 场景下 `Math.min(..., 300000)` 会把唯一通道锁 5 分钟，每轮请求都插在长等待里，看起来像死锁。
   修：`const cap = this.keys.length > 1 ? 300000 : 60000;`

2. **`agnes.js acquire` 的 `sleep(Infinity)` 风险。**
   若 `failures` 被并发 worker 抢先清空，`earliest` 保持 `Infinity`，`sleep(Infinity)` 无日志永久挂起。
   修：`const wait = Number.isFinite(earliest) ? Math.max(1000, earliest - Date.now()) : 3000;`
   顺带把单 key 的日志文案改成 `the only key is cooling down`，避免 `all keys` 的误导。

3. **`acquire` 与 `penalize` 的竞争放大。** `concurrency > 1` + 单 key 时，两个 worker 互相推高对方冷却，形成活锁。
   应对：**单 key 时用 `--concurrency 1`**，把并发度留给多 key 场景。

### 排查纪律

- **不要用 `mv` 探测文件占用判断进程存活** —— 有 false positive，本次据此误杀了两个健康任务。
- **后台跑长任务，让工具托管（`run_in_background`），不要 `nohup ... &`** —— 后者会随 Shell 会话结束被回收，且输出走管道会被缓冲。
- **判定"任务死了"之前，先看 API 是不是在 503**。队列满时一切"卡住"都是正常退避。
- **看产物目录，不看日志行数** —— `ls -lat 03_clips/*.mp4` 的时间戳才是事实。

### 什么时候该等

队列满通常会自己恢复（本次 06:28 打满，反复探到 06:32 仍未恢复）。建议：
- 先只跑 1 镜探路，成功再放全量；
- 若 1 镜在 7 次重试内都拿不到 503 通过，说明窗口没开，**停下，过 30~60 分钟再来**。

### 补记：单次探测成功 ≠ 容量可用（2026-10-09 06:35）

本次踩了一个更细的坑：用 `createVideoTask` 手工探一次，**成功了**，于是判定"队列恢复"并启动全量 36 镜。结果正式跑起来第一镜就 7 次重试全 503。

差别在于**请求密度**：

| | 探测 | 全量 36 镜 |
|---|---|---|
| 请求数 | 1 | 36（逐镜串行） |
| 需要的 | 抢到一个瞬时空闲位 | 持续数十分钟的稳定容量 |

饱和队列会**零星放出空隙**，所以单发探测很容易命中；但连续请求会立刻撞回 503。**探测只能证明"服务活着"，证明不了"容量够用"。**

正确的判断方式：
- 探路要用**真实批量**（2~3 镜），不是 1 发；
- 或者干脆不看探测，直接跑小批量，用产物落地与否说话。

同理，`[keys] penalized (429)` 与 `503 queue_full` 是两件事，不要混为一谈：
- **429** = 我们的请求频率高了 → 退避即可，与队列容量无关；
- **503 queue_full** = 服务端容量满了 → 退避也没用，只能等。
本次两者交替出现，容易把"我们的节奏问题"和"服务端的容量问题"看成同一个。

---

## 坑位 122 — 只重跑视频不重跑关键帧：改了 prompt 却以为改了画面

### 症状

一轮"重做"跑完 4 个多小时，36 条视频全部重出（时间戳全新），信心满满地交付。
事后核查磁盘才发现：**关键帧 `02_images/shot_*.png` 还是上一轮的旧图，一条都没重出。**

### 根因：两层资产，只有一层被重跑

MV 流水线里，一个镜头的画面由**两层**决定：

| 层 | 产物 | 决定画面的是什么 |
|---|---|---|
| image 层 | `02_images/shot_<id>.png` | `shot.keyframe_prompt`（生成时读取） |
| video 层 | `03_clips/shot_<id>.mp4` | 首帧 = 上面那张 png（运行时读取） |

`videos.js` 第 300 行：

```js
const kf = path.join(imgDir, `shot_${String(shot.id).replace(/[^\w.-]/g, "_")}.png`);
```

它**无条件读 `02_images/` 里已存在的关键帧**当 i2i 首帧。
所以当你只改了 `storyboard.json` 的 `keyframe_prompt`（例如注入道具样式锁）、
**却没有重跑 `images.js`** 时：

- 视频层会老老实实重跑，产出全新时间戳，看起来"重做了"；
- 但它动的是**旧关键帧**，新 prompt 一个像素都没进去。

### 危险之处：脚本的 `staleClips` 检测抓不到这种情况

`videos.js` 第 348-349 行有一个陈旧检测：

```js
if (fs.statSync(kf).mtimeMs > fs.statSync(out).mtimeMs) staleClips.push(shot.id);
```

它比较的是 **关键帧 vs 成品视频** 的时间：关键帧比视频新 → 标 stale。
但本情况的时序恰好相反：

```
prompt 改了 (10-08)  →  关键帧没动 (10-06)  →  视频重跑 (10-09)
```

关键帧比视频**旧**，于是检测判定"不陈旧"，**静默通过**。
这个检测能防"改了图没重跑视频"，防不住"改了 prompt 没重跑图"。

### 规则

**prompt 层改动 ⇒ 必须重跑 image 层，再重跑 video 层。顺序不能省。**

改动内容与需要重跑的层对照：

| 你改了什么 | 需要重跑 |
|---|---|
| reference 参考图（角色/场景/道具板） | video 层（运行时读取，image 层不用动）★ |
| `keyframe_prompt`（文本锁、构图、服饰描述） | **image 层 → 然后 video 层** |
| `shot.duration` / 运动描述 | video 层 |
| section / 剪辑结构 | 都不重跑，直接重新 assemble |

★ 这就是为什么"角色一致性、场景一致性、尾帧接力"三条原则能生效（它们作用在运行时读取的
参考图上），而"物件一致性文本锁"会落空（它作用在生成时读取的 prompt 上）。

### 交付前自检（30 秒）

```bash
# 关键帧的最新时间 vs storyboard 的修改时间：storyboard 更新 ⇒ 关键帧必须也更新
stat -c '%y %n' 01_plan/storyboard.json
ls -lt --time-style=+'%m-%d_%H:%M' 02_images/shot_*.png | head -3
```

若 storyboard 的时间**晚于**所有关键帧 ⇒ 有一轮 prompt 改动没落到画面上。

### 一次误判的代价

本次为此白烧了一轮 4h24m 的 video 额度（36 镜），拿到的却是"旧画面 + 新运镜"的成品。
**这比完全不跑更糟**：它看起来像成功了，只有逐帧对图才能发现。

排查顺序应当是：**先问"画面由哪个产物决定"，再问"那个产物重跑了没有"。**
不要在没确认 image 层状态的情况下启动 video 层批量。

### 补充：接力帧会掩盖"关键帧是旧的"这件事

本项目的实际情况比上面更绕一层。某个镜头的 i2i 首帧来源有两个，**接力帧优先**：

```js
let kfUrl = urlSidecar(kf);              // A. 关键帧 02_images/shot_<id>.png
if (args.relayDir) {                     // B. 接力帧 _relay/<id>.first.png（优先）
  relayUrl = urlSidecar(rp);
  if (relayUrl) kfUrl = relayUrl;        // ← 有接力帧时，关键帧被整个忽略
}
```

于是本次三个镜的磁盘时间戳长这样：

| 镜 | 关键帧 | 接力帧 | 视频 |
|---|---|---|---|
| S30 | 10-06 21:39 | **10-08 21:25** | 10-09 11:23 |
| S32 | 10-06 21:40 | **10-08 21:26** | 10-09 11:33 |
| S34 | 10-07 11:42 | **10-08 21:27** | 10-09 12:00 |

**接力帧是新的（说明接力链真的在跑），关键帧是旧的，视频是新的。**
从"有没有接力"的角度看，一切正常；从"画面里有没有新 prompt"的角度看，落空。
两个层看着各管各的，只有在核对"prompt 注入时间 vs 关键帧时间"时才暴露。

**教训**：`--relay-dir` 让"首帧"这个位置有了两个候选，**不能只看首帧是否新鲜就断定画面是新的**。
接力帧本身是"上一镜旧视频"的尾帧 —— 它是新文件，但承载的是旧画面。
所以在接力链上，**改 prompt 必须从链头（该场景第一镜）开始重跑**，否则下游拿到的一直是旧画面的尾巴。

