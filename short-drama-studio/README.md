# 🎬 Short Drama Studio 可落地设计方案

> 把「一个故事 / 主题 / 灵感」做成可直接发布的 **3–5 分钟爆款短剧**：剧本 → 分镜 → 定妆照 →
> 首尾关键帧 → 单镜视频 → 配音字幕 → 成片。本方案基于 **Agnes AI 三模型**（agnes-3.0-flash 编剧 /
> agnes-image-2.5-flash 出图 / agnes-video-2.5-flash 出视频）+ **本地 ffmpeg** 封装成完整 Skill。
>
> 版本时间：2026-09·完善后终稿。所有脚本均已离线语法校验通过。

---

## 📋 1. 方案总览

| 维度 | 约定 |
|---|---|
| 目标产物 | 竖屏 9:16（默认）单条 MP4，时长 3/4/5 分钟，18/24/30 个分镜（10s/镜） |
| 叙事要求 | 开头 3s 钩子、结尾悬念、笑点 ≥2 / 忧愁 ≥1、快节奏、大众共鸣、反转有伏笔 |
| 一致性 | **三层锁定**：角色圣经(文字锚点) + 定妆照(参考图绑定) + 首尾帧链(N+1 张共享边界关键帧) |
| 声音 | 后期配音管线，每个角色固定同一音色，与画面模型解耦 |
| 引擎 | 单一工程文件 `production.json`，脚本只消费/回填，可审计、可断点续跑 |
| 人工确认 | 3 个确认点：剧本 → 定妆照认脸 → 成片回看 |

一句话：**不靠抽卡碰运气，靠「确定性流水线 + 三层一致性锁定 + 多模态自动质检」批量生产电影级成片。**

---

## 🔧 2. 技术栈与依赖

- **文本编剧 / 质检**：`agnes-3.0-flash`，OpenAI 兼容，512K 上下文，支持 `image_url` 入参做帧质检，temperature 0.85–1.0（编剧）/ 0.3（分镜 JSON）。
- **图像**：`agnes-image-2.5-flash`，2K，9:16/16:9，**多图合成**（定妆照/关键帧）、固定 seed 可复现。
- **视频**：`agnes-video-2.5-flash`，异步任务，**固定 720P**，单镜 4–12s，`keyframe` 模式吃首尾帧；`reference` 模式图 ≤5、音频 ≤3、不支持视频参考。
- **本地**：`requests` + **全功能 ffmpeg/ffprobe**（concat demuxer / subtitles 滤镜 / amix、loudnorm、apad、aresample）+ 可选 `edge-tts` 配音。
- **环境变量**：`AGNES_API_KEY`（禁止落盘/入日志）；`AGNES_FFMPEG` 可指定全功能 ffmpeg 路径。
- **脚本语言**：Python 3（无第三方重依赖，edge-tts 缺失时优雅降级）。

---

## 🚀 3. 端到端流水线（7 阶段 + 3 人工确认点）

```
输入(故事/主题/灵感，≤3 个问题)
   │
   ▼
┌──────────────┐
│ 1 编剧(钩子+七段式) │←─ 确认点①：剧本
└──────────────┘
   ▼
┌──────────────┐
│ 2 分镜+工程文件 │← plan_production.py --fix --init-dirs 校验
└──────────────┘
   ▼
┌──────────────┐
│ 3 定妆照      │←─ 确认点②：人物认脸（不可跳过）
└──────────────┘
   ▼
┌──────────────┐
│ 4 边界关键帧+质检│← qa_frames.py 多模态巡检
└──────────────┘
   ▼
┌──────────────┐
│ 5 单镜视频(首尾帧)│← make_clips.py，3 并发，3 级重试
└──────────────┘
   ▼
┌──────────────┐
│ 6 配音(固定音色) │← build_audio.py（edge-tts / 手动 / 跳过降级）
└──────────────┘
   ▼
┌──────────────┐
│ 7 成片+封面交付 │←─ 确认点③：回看首末镜、ffprobe 核对
└──────────────┘
```

阶段可**断点续跑**：脚本逐帧/逐镜检查 assets 已有 URL 与本地文件，存在即跳过；`--force` 强制重做。

---

## 🎯 4. 爆款内容引擎

### 4.1 开场钩子（开头 3 秒必须抓人）

六选一，禁止空镜/旁白铺背景开场：
反常物 / 冲突前置 / 悬念台词 / 身份错位 / 倒计时 / 打破第四面墙。

### 4.2 七段式节拍（全片 18–30 镜分配到 7 个情绪段）

| 节拍 | 情绪 | 作用 |
|---|---|---|
| ① 冷开场钩子 | 好奇 | 3 秒内吸引，制造"看下去"的推力 |
| ② 建置 | 带入 | 人物 + 场景快速建立 |
| ③ 激励事件 | 转折 | 打破平衡，故事启动 |
| ④ 升级笑点 | 欢乐 | 快节奏推进，≥2 个笑点 |
| ⑤ 最低点忧愁 | 共情 | ≥1 个心酸点，引发情感共鸣 |
| ⑥ 高潮反转 | 爽 | 必须有前置伏笔（setup/payoff 登记） |
| ⑦ 悬念收尾 | 意犹未尽 | 结尾留钩，不把话说满 |

### 4.3 硬性自检（`production.json` 的 `qa` 字段，agent 生成后必须报告）

```json
{"hook_present": true, "humor_beats": 2, "sadness_beats": 1,
 "foreshadow_count": 1, "ending_hook": true, "char_count": 3,
 "continuity_closed": true, "safety_passed": true}
```

`qa.safety_passed=false` 的工程**禁止进入制作**（合规红线见 `references/01-craft-playbook.md` §8）。

### 4.4 分镜节奏

- 每 10 秒必须有新信息；每镜 `emotion_tag` ∈ 搞笑/忧愁/悬念/爽/温情。
- 相邻镜用 `transition` 衔接：硬切/动作接/视线匹配/声音先导/匹配剪辑/叠化，保证和谐。

---

## 🧩 5. 数据契约 production.json（全流程唯一数据源）

```jsonc
{
  "project":    { ... },   // 工程级：title/logline/genre/orientation/duration/seed/language/subtitles/audio.{mode,bgm,lufs}
  "characters": [ ... ],   // 角色圣经（见下）
  "locations":  [ ... ],   // 场景圣经（id/name/anchor 固定空间锚点）
  "script":     { ... },   // synopsis(300–500字) + beats(七段) + foreshadows(setup/payoff) + hook_type + ending_hook
  "shots":      [ ... ]    // 分镜表核心，N 条
}
```

### 5.1 characters[]（角色圣经——全片文字锚点）

| 字段 | 说明 |
|---|---|
| id | 稳定 ID（如 `char_zhou`），分镜引用 |
| name / age_role | 称呼 / 年龄身份 |
| anchor | **外形锚点**（40–80 字：脸型/发型/强识别特征/固定服装/随身道具），全片原样复用 |
| trait | 性格标签 + 反差 |
| catchphrase | 口头禅（可空） |
| voice | 音色设定（年龄感/音色/语速/口音），配音唯一依据 |
| tts | 可选：`{edge_rate,edge_pitch,edge_voice}`，`build_audio.py` 显式锁声线用 |
| portrait_prompt | 定妆照 prompt（anchor + style_suffix） |
| portrait_url / portrait_file / seed | 脚本回填与固定种子 |

### 5.2 shots[]（单镜字段合同）

`id / index / beat / seconds / location_id / time_of_day / shot_size / camera /
scene_cn / first_frame_prompt / last_frame_prompt / dialogue[] / vo / sfx /
transition / emotion_tag / char_ids[] / video_prompt / seed / assets{}`
（assets 回填 `first_frame_url/last_frame_url/video_id/task_status/clip_url/clip_file/audio_file`）

### 5.3 帧链唯一性规则（脚本强校验）

N 个镜头只产生 **N+1 张**边界关键帧 `K0…KN`：

```
K0 = shots[0].first_frame_prompt
Ki (1≤i≤N-1) = shots[i-1].last_frame_prompt ≡ shots[i].first_frame_prompt
KN = shots[N-1].last_frame_prompt
镜头 i 视频任务：首帧 Ki、尾帧 Ki+1
```

校验：相邻镜 `last_frame_prompt` 与 `first_frame_prompt` 去空白后必须一致；不一致时
`plan_production.py --fix` 以后者覆盖前者并告警。**这是画面跨镜流畅的关键。**

---

## 🔒 6. 一致性三层锁定（人物 / 场景 / 声音）

| 层 | 机制 | 作用 | 落地脚本 |
|---|---|---|---|
| ① 文字锚点 | 角色圣经 `anchor` / 场景圣经 `anchor` 全片原样复用 | 所有 prompt 的语义地基 | agent 生成 |
| ② 参考图绑定 | 定妆照(多图合成) + 固定 seed | 关键帧以定妆照为参考，补齐人像细节 | `make_keyframes.py` |
| ③ 帧链层 | N+1 张共享边界关键帧 | 相邻镜头首尾同帧、无缝咬合 | `plan_production.py --fix` |

- **镜头 i 视频**：边模型以 Ki 为首帧、Ki+1 为尾帧 → 首尾已锚定，中间由视频模型补全。
- **声音一致性**（第 7 阶段）：每个角色用同一把固定音色合成全部台词，与画面模型完全解耦；
  声线优先级：`characters[].tts.edge_voice` 显式 > 按 `voice` 性别/年龄启发式映射。

---

## 🌐 7. Agnes API 映射与硬约束

| 能力 | 端点（经 `agnes_client.py` 封装） | 关键参数 |
|---|---|---|
| 文本 | agnes-3.0-flash | model / messages / temperature |
| 图像 | agnes-image-2.5-flash | prompt / ratio / size=2K / seed / ref_urls(≤N) |
| 视频 | agnes-video-2.5-flash（异步） | keyframe 首帧+尾帧 / seconds="4"–"12"(字符串) / 720P |

### 7.1 视频任务状态机与轮询

```
CREATE → PENDING(轮询) → SUCCEEDED(拿 clip_url)
                      → FAILED(3 级重试)
                      → 超时(单任务最多等 20 分钟)
```

3 级重试：**原样 → 换 seed → 仅首帧**；仍失败按报错排查（`references/02-agnes-api.md` §3）。

### 7.2 Flash 专属硬约束（违反即 HTTP 400，已在客户端前置校验）

- 视频固定 720P、单镜 `seconds` 必须是字符串 `"4"`–`"12"`。
- 新工程首启前自检：`python3 scripts/agnes_client.py ping`。
- `reference` 模式：图 ≤5、音频 ≤3、不支持视频参考；short-drama 走 `keyframe` 模式规避。

---

## ✅ 8. 质量门与验收清单

| 关卡 | 工具/脚本 | 判定 |
|---|---|---|
| 分镜合法性 | `plan_production.py` | 无 ERROR；WARN 逐条评估 |
| 画面一致 | `qa_frames.py` | `face/feature/hair/outfit_match`、`scene_continuity`、`pose_bridge` 必须 true；`extra_hands`、`watermark_or_text` 必须 false；`--delete-bad` 删除不合格帧并补缺 |
| 成片合规 | ffprobe | 时长≈目标、分辨率=720P、有音轨 |
| 内容自检 | `qa` 字段 | 钩子/笑点×2/忧愁×1/悬念/伏笔/合规 |

---

## 📁 9. 工程目录与脚本职责

```
<工程目录>/
├── production.json              # 唯一工程文件（原地回填）
├── frames/portraits/            # 角色定妆照
├── frames/kf00.png … kfNN.png   # N+1 张边界关键帧
├── clips/s01.mp4 … sNN.mp4      # 单镜视频
├── audio/ sNN.wav、bgm.m4a、mix/、dub_plan.json   # 配音与混音，edge-tts 缺省时降级清单
├── subtitles/full.srt
├── work/                        # 规范化/拼接/质检报告(frame_qa.json)/TTS 中间件（可删）
└── output/<片名>_<时间戳>.mp4、<片名>_cover.jpg、delivery.json
```

| 脚本 | 职责 |
|---|---|
| `agnes_client.py` | API 封装：ping、chat、image_generate、video_create/poll |
| `plan_production.py` | 校验/规范化 production.json，`--fix` 闭合帧链，`--init-dirs` 建目录 |
| `make_keyframes.py` | 定妆照（确认点②）+ N+1 张边界关键帧（含 style_suffix、固定 seed） |
| `qa_frames.py` | 关键帧多模态巡检（`--delete-bad` / `--offline` dry-run），产出 `frame_qa.json` |
| `make_clips.py` | 逐镜 keyframe 模式视频生成，3 并发、3 级重试、局部 `--only`/`--force` |
| `build_audio.py` | 逐角色固定音色对白编排成 `audio/sNN.wav`，edge-tts 缺失时降级 `dub_plan.json` |
| `assemble.py` | 统一 24fps/画幅/yuv420p → 拼接 → 烧中文字幕(Windows 自动用 Microsoft YaHei) → 混音(-14 LUFS) → 成片 |
| `finalize.py` | 高潮/反转镜提取封面帧（可 `--cover-shot`）+ 可选叠标题 + `delivery.json` 交付摘要 |
| `pipeline.py` | 编排上述各阶段（`--stage portraits/frames/clips`） |

---

## 🏃 10. 端到端运行手册

1. **配 Key（不落盘）**：`export AGNES_API_KEY=...`；自检 `python3 scripts/agnes_client.py ping`。
2. **编剧（确认点①）**：文本模型读 `references/01-craft-playbook.md`，产出 logline + 七段式剧本，向用户确认。
3. **分镜与工程文件**：文本模型按模板生成 `production.json`，跑 `plan_production.py --fix --init-dirs` 校验。
4. **定妆照（确认点②）**：`pipeline.py --stage portraits`，展示定妆照，不满意改 `anchor` 后 `--force` 重跑（认脸基准，不可跳过）。
5. **边界关键帧 + 质检**：`pipeline.py --stage frames` → `qa_frames.py [--delete-bad]`。
6. **单镜视频**：`pipeline.py --stage clips --workers 3`。
7. **配音**：`build_audio.py`（edge-tts / 按 dub_plan 手动 / 用户自备 / 跳过，四选一）。
8. **成片（确认点③）**：`pipeline.py` 走 `assemble.py` 拼接成片；`finalize.py` 出封面 + 交付摘要；ffprobe 核对后回看首镜（钩子）与末镜（悬念）。

---

## 💰 11. 成本与耗时测算

- **图片**：定妆照(≤4) + 关键帧(N+1=19/25/31) ≈ 23–35 张。
- **视频**：N=18/24/30 个任务，3 并发估算 **≈8–15 分钟**（取决于服务端排队）。
- 单条 3 分钟竖屏短剧的 API 成本按 Agnes Flash 计费表与图片/视频数量核算（见 `references/02-agnes-api.md` 计费节）。

---

## ⚠️ 12. 风险与降级矩阵

| 风险 | 应对 |
|---|---|
| 系统 ffmpeg 是精简版 | `assemble.py` 自动探测全功能版；找不到给出明确指引（WinGet 装 Gyan FFmpeg 并 `AGNES_FFMPEG` 指向），绝不静默产出损坏成片 |
| 帧格式/图片失败 | 定妆照/关键帧固定 seed 可复现；`--force` 重做 |
| 视频任务失败 | 3 级重试 + 局部重做 `--only s05-s09 --force` |
| edge-tts 缺席 | 降级为 `dub_plan.json` 对白清单，Agent/用户按清单产音频 |
| 中文字体缺失 | Windows 自动取 Microsoft YaHei；无字体退软字幕 |
| 关键帧不一致 | `qa_frames.py --delete-bad` 删劣帧，重跑 frames 补缺 |
| 内容不合规 | `qa.safety_passed=false` 工程禁止进入制作 |

---

## 🗓️ 13. 落地里程碑

| 阶段 | 内容 | 状态 |
|---|---|---|
| M1 技术选型与差距分析 | 核对三份 Agnes API 文档，确定帧链/一致性方案 | ✅ 完成 |
| M2 核心脚本 | agnes_client / plan_production / make_keyframes / make_clips / assemble | ✅ 完成 |
| M3 一致性加固 | 定妆照固定 seed、frames 固定 seed、`--fix` 帧链闭合 | ✅ 完成 |
| M4 完善模块 | 新增 build_audio / qa_frames / finalize，修复 Windows 字幕转义 | ✅ 完成 |
| M5 文档与校验 | SKILL.md + references 更新，全脚本离线语法校验通过 | ✅ 完成 |
| M6 端到端实测 | 用真实 AGNES_API_KEY 跑一条 3 分钟成片，回看首末镜 | ⏳ 待用户提供 Key |

---

## 📎 附录：参考文件导航

- `short-drama-studio-design.html`：早期设计的交互式 HTML 版本（本 md 为其权威终稿）。
- Skill 内部：
  - `references/01-craft-playbook.md`：爆款方法论（钩子库/七段节拍/共鸣选题/对白规则/自检/合规红线）
  - `references/02-agnes-api.md`：三模型端点参数/尺寸表/状态机/错误码/计费
  - `references/03-visual-bible.md`：角色圣经/风格手册/帧链连续性/镜头运镜词表/配音混音规范
  - `references/04-schemas.md`：production.json 完整字段契约与帧链唯一性规则
  - `assets/templates/production_template.json`：工程文件模板（含示例镜头）

---

*本方案为可落地终稿：脚本、文档、校验均已就位，唯一阻塞点是需用户提供 `AGNES_API_KEY` 后执行 M6 端到端实测。*