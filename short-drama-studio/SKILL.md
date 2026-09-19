---
name: short-drama-studio
description: "爆款短剧/短视频 AI 成片工作台。当用户给出一个故事、主题、灵感或一句话想法，想做成 3-5 分钟（18-30 个 10 秒分镜）的短视频/小短剧/竖屏短剧，要求开头抓人、结尾留悬念、融合搞笑/忧愁/悬念、快节奏、大众共鸣，并要求人物长相、声音、场景跨镜头一致、电影感成片时使用。基于 Agnes AI（agnes-3.0-flash 编剧、agnes-image-2.5-flash 定妆照与首尾关键帧、agnes-video-2.5-flash 首尾帧视频）+ 本地 ffmpeg，产出剧本、分镜表、关键帧、单镜视频、字幕、配音混音和最终 MP4。触发词：短剧、短视频、分镜、剧本改视频、爆款短片、首尾帧成片、故事做成视频。"
---

# Short Drama Studio（爆款短剧成片工作台）

把“一个想法”变成可直接发布的 3–5 分钟短剧：**剧本 → 分镜 → 定妆照 → 首尾关键帧 →
单镜视频 → 配音字幕 → 成片**。人物长相、场景、声音跨镜头一致，靠“角色圣经 +
多图合成定妆照 + N+1 张共享边界关键帧”三层锁定。

## 技术底座（已由脚本封装，细节按需查 references/02-agnes-api.md）

- 文本编剧：`agnes-3.0-flash`（OpenAI 兼容，512K 上下文，支持图像 URL 输入做帧质检）
- 图像：`agnes-image-2.5-flash`（2K、9:16/16:9，多图合成定妆照/关键帧）
- 视频：`agnes-video-2.5-flash`（异步任务，**固定 720P**，单镜 4–12s，
  keyframe 模式吃首尾帧；reference 模式图 ≤5、音频 ≤3、不支持视频参考）
- 本地：ffmpeg/ffprobe（拼接、字幕、混音、响度归一）

## 前置条件

1. 环境变量 `AGNES_API_KEY`（用户未提供时，引导其在 Agnes 控制台生成后以
   `export AGNES_API_KEY=...` 注入；**禁止**把密钥写进文件或日志）。
2. 新建工程目录 `out/`（建议与成片同名），所有产物落在其中，与源码分离。
3. 依赖 `requests` 与**全功能 ffmpeg**（拼接需 concat demuxer、烧字幕需 subtitles 滤镜、
   混音需 amix/loudnorm/apad/aresample）。`assemble.py` 会自动探测可用的全功能 ffmpeg
   （含 Windows 上 WinGet 安装的 Gyan FFmpeg 构建），PATH 里只有精简版时会给出明确指引，
   不会静默产出损坏成片。先跑一次自检：`python3 scripts/agnes_client.py ping`。

## 输入与默认值（最多问用户 3 个问题，其余用默认）

- 必需：故事/主题/灵感（任意长度）。
- 只在用户没说明时确认：① 竖屏 9:16（默认）还是横屏 16:9；
  ② 时长 3/4/5 分钟（默认 3 分钟 = 18 镜）；③ 题材偏好或禁区。
- 视角默认**第一人称 POV**（`camera_mode: first`）：脚本自动把帧与视频 prompt 写成视角主角的
  眼睛；需让观众看到主角本人的镜头（反应特写/镜面/大远景建立镜）置 `camera_pov: third`。
- 用户没回答就按默认开工，不允许把选择题留给用户。

## 标准工作流（7 个阶段，3 个人工确认点）

脚本位于本 skill 的 `scripts/`，工程模板在 `assets/templates/production_template.json`。
所有阶段都可断点续跑；脚本逐帧/逐镜跳过已完成产物。

### 阶段 1｜编剧（agent 用文本模型完成，读 references/01-craft-playbook.md）

用 `agnes-3.0-flash`（temperature 0.85–1.0）依次产出，并在对话中给用户确认（**确认点 1：剧本**）：

1. ≤25 字 logline + 开场钩子类型（六选一）+ 结尾悬念设定。
2. 300–500 字完整故事（七段式：钩子/建置/激励事件/升级笑点/最低点忧愁/高潮反转/悬念收尾），
   登记伏笔（setup/payoff 镜号）。
3. 角色圣经（主角 1 + 配角 ≤3，字段见 references/04-schemas.md §3）与场景圣经。
4. 硬性自检：钩子、笑点 ≥2、忧愁点 ≥1、伏笔可回收、结尾留钩、合规红线。

### 阶段 2｜分镜与工程文件（读 references/03-visual-bible.md、04-schemas.md）

用文本模型（temperature 0.3，输出 JSON）生成完整 `production.json`（复制模板改写）：

- 镜头数 = 时长/10（180s→18、240s→24、300s→30），每镜含五段式首/尾帧 prompt、
  六段式 video_prompt（可留空由脚本拼装）、台词/旁白、音效、景别、运镜、转场。
- **帧链闭合**：相邻镜头“上一镜尾帧描述 = 下一镜首帧描述”。
- 帧 prompt 用纯文字锚点，**不要写 `<Picture N>`**（脚本自动注入参考图映射）。
- 填好 `qa` 字段。生成后必须校验：

```bash
python3 scripts/plan_production.py /path/to/production.json --fix --init-dirs
```

有 ERROR 必须回去改 JSON；WARN 逐条评估。校验通过后**必须跑一次成本预估**并
在对话中播报（预算防线：先确认，后投放）：

```bash
python3 scripts/estimate_cost.py /path/to/production.json
```

### 阶段 3｜定妆照与角色设定卡（**确认点 2：人物长相**）

```bash
python3 scripts/pipeline.py /path/to/production.json --stage portraits   # 单人正面定妆照
python3 scripts/make_sheets.py /path/to/production.json                  # 角色设定卡（推荐先跑这个）
```

**方法论（先定“数字演员”，再做分镜）**：出正式画面之前，先为每个角色生成一张
**角色设定卡**——正面/90°侧面/背面全身三视图 + 上半身特写 + 表情库的组合图，
把所有视角写成“同一张脸、同一体型、同一发型、同一套服装与配饰”，作为后续
**所有分镜/视频的唯一垫图基准**。比“垫一张正面照再逐视角展开”一致性高得多
（单张正面图会把近景与全身当成两档分别精修→人物漂移，组合卡一次生图语义统一→四视角同脸）。

- 角色设定卡用**纯文生组合图**（`make_sheets.py`），把 `characters.anchor`（含体型/年龄）
  写死进 prompt，并强调“四视角必须同一张脸、同一体型胖瘦、同一发型结构、同一套服装”。
  生成的卡存 `out/frames/sheets/<char_id>.png`，写入 `characters.character_sheet_url/file`。
- 场景设定图（可选但推荐）：`make_locations.py` 为每个 location 生成一张**纯空镜场景图**
  （`out/frames/locs/<loc_id>.png`，写入 `locations.loc_url/file`），作为该场景所有镜头的
  背景/光照参考。场景图**严禁出现人物**；把环境与人物拆成两套资产，分别锁定。
- `make_keyframes.py` 参考图**优先用角色卡**（`character_sheet_url`），缺卡才回退定妆照；
  并自动把所属场景图（`loc_url`）作为最后一个参考垫入，锁该镜环境/光照一致。
- 定妆照 `out/frames/portraits/*.png` 仍保留，作为角色卡缺失时的兜底与单人脸基准。

不满意就改 `characters.anchor` 后分别加 `--force` 重跑，直到人物形象确认。
这是全片认脸一致性的基准，不能跳过。

### 阶段 4｜边界关键帧 + 视觉质检

```bash
python3 scripts/pipeline.py /path/to/production.json --stage frames
```

产出 `out/frames/kf00.png … kfNN.png`（N+1 张，相邻镜头共享）。默认跳过已存在帧；可用
`--force` 强制重做。**定妆照与关键帧均固定 seed**，重生成沿用同 seed + 同描述即可复现。

**帧质检（推荐，用 `agnes-3.0-flash` 多模态自动巡检）**：

```bash
python3 scripts/qa_frames.py /path/to/production.json          # 核对所有关键帧
python3 scripts/qa_frames.py /path/to/production.json --delete-bad  # 不合格帧删本地文件并清 assets，重跑 frames 补缺
python3 scripts/qa_frames.py /path/to/production.json --offline     # 只看本次将检查的帧清单（dry-run）
```

`qa_frames.py` 把“定妆照 + 待检帧（+上一帧）”发给文本模型，按
`face_match / feature_match / hair_match / outfit_match / scene_continuity / pose_bridge`
（必须 true）与 `extra_hands / watermark_or_text`（必须 false）逐项判定，生成
`out/work/frame_qa.json` 报告；`--delete-bad` 会把不合格帧的本地文件删掉并清空 `production.json`
相关 assets URL，重跑 frames 阶段即自动补缺。不一致时也可手动：修正该帧 prompt → 删除对应
`out/frames/kfXX.png` 并清 assets URL → 重跑 frames。

### 阶段 5｜单镜视频（首尾帧）

```bash
python3 scripts/pipeline.py /path/to/production.json --stage clips --workers 3
```

- 每镜 keyframe 模式：首帧 Ki、尾帧 Ki+1、`seconds="10"`、720P、同画幅。
- 失败自动 3 次重试（原样 → 换 seed → 仅首帧）；仍失败按报错排查
  （常见错误见 references/02-agnes-api.md §3）。
- 支持 `--only s05-s09 --force` 局部重做。任务异步，单任务最长等 20 分钟。

### 阶段 6｜配音与声音一致性（录音管线，不靠视频模型念台词）

声音一致性落地为确定性步骤，首选自动编排：

```bash
python3 scripts/build_audio.py /path/to/production.json
```

`build_audio.py` 从 `production.json` 扫描全部对白/旁白，按角色分组：**每个角色用同一把固定
音色**（优先 `characters[].tts.edge_voice` 显式声线，否则按 `voice` 字段性别/年龄启发式映射），
逐句合成后按镜号拼成 `out/audio/s01.wav … sNN.wav`（长度 ≤ 该镜秒数）供 assemble 混音。
其依赖 edge-tts（`pip install edge-tts`）；**未安装时自动优雅降级**：生成 `out/audio/dub_plan.json`
对白清单并按镜号提示放置音频文件。三种落地路径按可用性任选其一：
1. 本机装了 edge-tts → 自动逐角色固定音色合成（推荐）。
2. Agent 用运行环境内其他配音能力，按 `out/audio/dub_plan.json` 或分镜对白，为每个角色固定同一音色
   生成 `out/audio/sNN.wav`。
3. 用户自备配音/音乐 → 按 `out/audio/sNN.wav`、`out/audio/bgm.m4a` 路径放入。
4. 不做配音则跳过（成片保留模型生成的环境声）。

BGM 放 `out/audio/bgm.m4a`（2–3 段按情绪自行拼接成一条）；环境声直接保留视频原声。

### 阶段 7｜成片

```bash
python3 scripts/pipeline.py /path/to/production.json
# 或只重跑封装：
python3 scripts/assemble.py /path/to/production.json [--no-subs] [--no-bgm]
```

脚本自动：统一 24fps/画幅/yuv420p → 拼接 → 生成并烧录中文字幕（Windows 自动用
Microsoft YaHei；无中文字体才退软字幕）→ 环境声 0.55、配音 1.0、BGM 0.12 混音 →
−14 LUFS 响度归一 → `out/final/<片名>_时间戳.mp4`。

**给分发的封面帧与交付摘要（可选）**：

```bash
python3 scripts/finalize.py final/<片名>_时间戳.mp4 /path/to/production.json \
    [--cover-shot s15] [--title 片名] [--no-title]
```

`finalize.py` 自动选「高潮/反转/悬念」那一镜提取封面帧（也可 `--cover-shot` 指定），
可选叠加大标题，并输出 `out/final/delivery.json` 交付摘要（片名/路径/时长/封面/分镜数）。

交付前用 ffprobe 核对：时长 ≈ 目标、分辨率正确、有音轨；并回看首镜（钩子）与末镜（悬念）。

## 目录产物

```
out/                          # 工程根目录（所有产物都在这里，与源码分离）
├── production.json           # 唯一工程文件（URL/状态全部回填，可审计、可续跑）
├── frames/portraits/         # 角色定妆照（单人脸基准）
│   └── versions/             # 旧版归档（--force 时自动保留最近 3 版）
├── frames/sheets/            # 角色设定卡（三视图组合图，分镜/视频唯一垫图基准）
│   └── versions/
├── frames/locs/              # 场景设定图（纯空镜，作为该场景全部镜头的背景/光照参考）
│   └── versions/
├── frames/sNN_first/last.png # 边界关键帧（独立帧模式）或 kf00..kfNN（链式模式）
│   └── versions/
├── clips/s01..sNN.mp4        # 单镜视频
│   └── versions/
├── audio/                    # sNN.wav、bgm.m4a、dub_plan.json（edge-tts 未装时）
├── subtitles/full.srt        # 字幕
├── work/                     # 中间产物：QA报告/TTS/成本追踪/宫格原图/幂等标记
└── final/                    # 成片与交付：<片名>_*.mp4、<片名>_cover.jpg、delivery.json
```

## 创作红线

- 开头 3 秒必须是钩子，禁止空镜/旁白铺背景开场；每 10 秒必须有新信息。
- 笑点、心酸点、悬念缺一不可；反转必须有前置伏笔；结尾必须留钩。
- 遵守 references/01-craft-playbook.md §8 合规红线；`qa.safety_passed=false`
  的工程禁止进入制作。
- 关键帧/视频 prompt 中不要出现真实名人、品牌侵权或违法违规内容。

## 参考文件导航

- `references/01-craft-playbook.md`：爆款方法论（钩子库、七段节拍表、共鸣选题、对白与分镜规则、
  §9 六大题材风格模板（甜宠/虐恋/悬疑/校园/古风/玄幻）、§10 对话戏镜头语法（争吵/告白/审问/谈判
  权力流拆镜）、自检清单）
- `references/02-agnes-api.md`：三个模型的端点、参数、尺寸表、状态机、错误码与计费（脚本排错先查它）
- `references/03-visual-bible.md`：角色圣经、风格手册、帧链连续性、镜头/运镜词表、配音混音规范
- `references/04-schemas.md`：production.json 完整字段契约与帧链唯一性规则
- `assets/templates/production_template.json`：工程文件模板（含一个示例镜头）

## 完善记录（2026-09）

- `assemble.py`：新增全功能 ffmpeg 自动探测（绕开精简版静默失败）、Windows 中文字幕硬烧
  （Microsoft YaHei + 路径转义，fc-list 缺省时自动取系统字体）、本地路径 filtergraph 转义。
- `make_keyframes.py`：定妆照与关键帧固定 seed，保证可复现；`--force` 重做沿用同 seed。
- `assemble.py`：配音与字幕定位改用**真实时长**（ffprobe 探测规范化后每镜时长，失败退回名义
  seconds），避免视频模型时长漂移导致的音画/字幕错位；规范化片段强制**首帧为关键帧**
  （`-force_key_frames`），保证 concat `-c copy` 硬切边界可独立解码、不定格不花屏。
- 新增 `qa_frames.py`（关键帧多模态质检，`--offline` 可 dry-run）、`build_audio.py`
  （逐角色固定音色对白编排，edge-tts 未装时优雅降级为清单）、`finalize.py`（封面帧 + 交付摘要）。
  均已离线验证通过。
- **第一人称视角**：项目缺省 `camera_mode: first`，`plan_production.py` 校验并回填默认；
  `make_keyframes.py` / `make_clips.py` 通过共享 `pov_instruction()` 自动把 POV 指令注入帧与
  视频 prompt，单镜用 `camera_pov: third` 覆盖。
- **角色设定卡先行**：新增 `make_sheets.py`，为每个角色生成「正面/侧面/背面三视图 +
  上半身特写 + 表情库」组合角色卡（纯文生、锚点写死、强调四视角同一张脸），作为后续
  所有分镜/视频的唯一垫图基准；`make_keyframes.py` 参考图改为**优先用角色卡**
  （`character_sheet_url`），缺卡回退定妆照。解决单张正面定妆照导致的隔镜人物漂移。
- **角色卡三元结构（identity-lock）**：`make_keyframes.py` 的 `identity_lock()` 从角色
  anchor 抽出「发色/发型/脸型/眉眼/鼻/痣/疤/肤色」等**全剧不可变**的身份锚点，单独拼进
  prompt；配合镜头级 `recast`（可变服装/发型）实现「身份锁定 + 本场可变」分离，避免把
  可变状态混入身份描述导致脸漂（依据：角色卡 = identity-lock + mutable-state + voice）。
- **场景设定图（资产先行）**：新增 `make_locations.py`，为每个 location 生成一张**纯空镜**
  场景图（严禁人物，环境/陈设/光照/色温锁定），`make_keyframes.py` 自动把所属场景图作为
  该镜参考垫入。把人 与 场景拆成两套可复用资产分别锚定，避免“每新增场景=光照一致风险”。
- **成本追踪（预估 vs 实际）**：新增 `cost_tracker.py` 单例追踪器，`agnes_client.py` 在
  文本/图像/视频生成成功后自动记录（文本按 token、图像按张、视频按秒），输出到
  `out/work/cost_tracking.json`，包含汇总（text/image/video 数量与费用）+ 最近事件列表。
  让用户知道每一步花了多少钱，符合「生成前报预估、生成后结算」的行业最佳实践。
- **分镜铁律校验**：`plan_production.py` validate 阶段新增两条分镜铁律警告——① 台词保护
    （镜头 `camera` 含「快切/甩镜/快速横移」且该镜有 dialogue 时警告口型易崩，建议固定/缓推）；
    ② 动作安全区（多角色同镜且场景含「拥抱/交手/递物/打斗」等复杂肢体交互时警告穿模风险，
    建议拆景别/反应镜头）。纯警告不阻断，让高返工镜头提前暴露。
- **统一路径管理（paths.py）**：新增 `scripts/paths.py` 统一管理所有输出目录，所有脚本基于
  `production.json` 所在位置（即 out/ 根）推导路径，**不依赖任何绝对路径或环境变量**。
  产物与源码彻底分离——技能源码在 `scripts/`/`references/`/`SKILL.md`，全部输出在 out/ 下。
  改目录结构只需改 paths.py 一处。
- **人物换装/改发型（recast 锁脸 v3）**：`make_keyframes.py` `ref_mapping()` 支持镜头级 `recast`。
  经过 3 轮迭代的三明治锁脸策略：① recast 时改用**单张正脸定妆照**作参考（而非四视图角色卡，
  避免多视图混淆）；② `identity_lock(for_recast=True)` 只锁脸型/五官/年龄/体型/胡须等
  身份级特征，排除发型/服装等可变项，消除"既要锁又要改"的指令冲突；③ 提取眼镜/胡须/痣/疤
  等**强识别特征单独点名**，明确说"任何场景下都必须保留"，防止模型被"监狱/古装"等场景语义
  冲掉标志性特征。实测 s13 监狱镜从"完全换了个人"→ PASS。
- **QA 体系优化**：`qa_frames.py` 多项优化：① 图片压缩到 512px JPEG 再转 base64，payload
  从 ~4MB 降到 ~200KB，彻底解决多角色镜超时问题；② 参考图基准对齐——优先用角色卡
  （和生成时一致），缺省回退定妆照，避免"用 A 生成、用 B 质检"的基准错位；③ recast 白名单
  ——recast 镜头的发型/服装不作为硬失败项，且 QA 模型会收到【recast 白名单】提示，
  不会把故意改变的发型服装判为失败；④ 独立模式（frame_mode=independent）自动跳过
  `scene_continuity` 和 `pose_bridge` 检查，因为独立模式下每镜场景本来就可能不同。
- **版本历史（archive_old_file）**：`versioned.py` 提供 `archive_old_file()`，`--force`
  强制重生成时自动把旧文件复制到 `versions/` 子目录，保留最近 3 版。覆盖不再等于销毁，
  可对比不同 seed/不同 prompt 的生成结果，也可手动回滚。
- **幂等任务（pending_guard）**：`versioned.py` 提供 `pending_guard` 上下文管理器，生成前写
  `.pending` 标记、完成后写 `.done` 并清标记。进程崩溃重启时：已完成的任务直接跳过
  （不重扣费）；崩在中间的任务保留 pending 标记，下次启动能识别并走兜底逻辑。
  所有生成脚本（make_keyframes / make_sheets / make_locations / make_clips）均已接入。
- **多宫格批量生成（grid_gen.py）**：新增 `grid_gen.py`，支持 portraits/locations 两种模式，
  把 N 个同类型资产塞一张宫格图生成后自动切分，省 N-1 张图的 API 费用。适合项目早期
  快速出草稿/验证风格；对一致性要求高的阶段仍建议逐张独立生成。
  支持 `--grid 2x2/3x3/2x4` 等任意布局，幂等 + 版本历史同样生效。
- **创作知识库扩充（2026-09-19，借鉴 YvonneMovingon/ManjuForge）**：
  `01-craft-playbook.md` 新增 §9 六大题材风格模板（甜宠/虐恋/悬疑/校园/古风/玄幻，
  各含钩子变体/节拍变体/关键词库/禁区）与 §10 对话戏镜头语法（按权力流动拆
  争吵/告白/审问/谈判四类场景，含台词保护与反应镜比例红线）；自检清单同步加两项。
- **预算防线（estimate_cost.py，借鉴 drama-skills 提示词先落盘思想）**：新增
  `scripts/estimate_cost.py`，阶段 2 校验通过后运行，按 production.json 预估
  图像/视频/文本调用次数与刊例费用（含 15% QA 重画余量），零 API 调用；
  与 cost_tracker.py 的实际结算构成「预估 vs 实际」闭环。

## 完善记录（2026-09-19 补课轮）
- **预算门禁硬接线**：`pipeline.py` 进入 frames（首个批量消耗额度阶段）前自动调用
  `estimate_cost.py` 播报预估；预估失败（退出码非 0）或未确认即拦截退出。非交互环境
  （stdin 非 TTY）必须显式 `--yes`。预算防线从"文档约定"升级为"代码门禁"。
- **out/ 契约化迁移**：旧契约时代的 `projects/`（247M 旧工程 da-ge-san-ge-laopo）与
  `kf_run*.log`/`qa_run*.log` 迁入 `out/`；根目录只保留 SKILL.md/assets/references/scripts + out/。
  旧工程要续跑需把其 production.json 移到 out/ 根（paths.py 契约：production.json 锚定 out/ 根）。
- **情绪 TTS 六类映射**：`build_audio.py` 新增 `EMOTION_PRESETS`
  （neutral/happy/excited/sad/angry/tense/gentle → rate/pitch，借鉴 cyuanxv 6 类情绪表，
  解决配音"念稿感"）。优先级：`tts.edge_rate/edge_pitch` 显式值 > `tts.emotion`/`emotion`
  预设 > 关键词启发式。production.json 角色 JSON 加 `"emotion": "sad"` 即生效。
