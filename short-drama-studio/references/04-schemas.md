# 数据契约 production.json

全流程围绕**一个工程文件** `production.json` 运转：agent 用文本模型生成它，脚本只消费/回填它。
模板见 `assets/templates/production_template.json`。所有生成产物（图片 URL、video_id、成片路径）
都回填到该文件，保证中断可续跑、可审计。

## 1. 顶层结构

```jsonc
{
  "project":   { ... },   // 工程级配置
  "characters":[ ... ],   // 角色圣经
  "locations": [ ... ],   // 场景圣经
  "script":    { ... },   // 故事梗概、节拍、伏笔登记
  "shots":     [ ... ]    // 分镜表（核心，N 条）
}
```

## 2. project

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| title | string | 是 | 片名 |
| logline | string | 是 | ≤25 字一句话故事 |
| genre | string | 是 | 类型：搞笑/情感/悬疑/反转/都市怪谈等 |
| orientation | string | 是 | `9:16`（默认）/ `16:9` / `1:1` |
| duration_seconds | integer | 是 | 目标总时长 180/240/300（3–5 分钟） |
| shot_seconds | integer | 是 | 单镜秒数，默认 10（接口允许 4–12） |
| style_suffix | string | 是 | 视觉风格手册固定后缀，追加到每条图像/视频 prompt |
| camera_mode | string | 否 | 全局视角：`first`（第一人称 POV，默认）/ `third`（第三人称）。POV 指令由脚本自动注入帧与视频 prompt |
| seed | integer | 否 | 工程级基准种子，缺省由脚本随机生成并回填 |
| language | string | 否 | 默认 zh-CN |
| subtitles | boolean | 否 | 是否烧录字幕，默认 true |
| audio.mode | string | 否 | `dub`（后期配音，默认）/ `none` |
| audio.bgm | boolean | 否 | 是否混音 BGM，默认 true |
| audio.lufs | number | 否 | 成片响度目标，默认 -14 |

## 3. characters[]（角色圣经）

| 字段 | 说明 |
|---|---|
| id | 稳定 ID，如 `char_zhou`，分镜用它引用 |
| name | 称呼 |
| age_role | 年龄与身份 |
| anchor | **外形锚点**（40–80 字，含脸型/发型/强识别特征/固定服装/随身道具），全片原样复用 |
| trait | 性格标签 + 反差 |
| catchphrase | 口头禅（可空） |
| voice | 音色设定（年龄感/音色/语速/口音），配音唯一依据 |
| tts | 可选 object：`{edge_rate:"+0%", edge_pitch:"+0Hz", edge_voice:"zh-CN-XiaoxiaoNeural"}`。`build_audio.py` 显式控制声线时用；缺省按 `voice` 启发式映射 |
| portrait_prompt | 定妆照生成 prompt（含 anchor + style_suffix） |
| portrait_url | 脚本回填：定妆照 URL |
| portrait_file | 脚本回填：本地路径 |
| seed | 该角色固定种子，定妆照/关键帧沿用，保证可复现 |

## 4. locations[]（场景圣经）

`id` / `name` / `anchor`（固定场景锚点：空间布局、主光源、色调、关键陈设）。
同一场景的所有关键帧 prompt 必须原样包含 anchor。

## 5. script

- `synopsis`：300–500 字完整故事梗概（含结局走向）。
- `beats`：七段式节拍登记，`{beat, name, shot_ids:[]}`，名称固定为
  冷开场钩子/建置/激励事件/升级/最低点/高潮反转/悬念收尾。
- `foreshadows`：伏笔登记 `{setup_shot, payoff_shot, note}`，反转必须至少 1 条。
- `hook_type`：开场钩子类型（反常物/冲突前置/悬念台词/身份错位/倒计时/打破第四面墙）。
- `ending_hook`：结尾悬念的具体内容描述。

## 6. shots[]（分镜表，核心）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | s01、s02… |
| index | integer | 从 1 开始 |
| beat | string | 所属节拍段 |
| seconds | integer | 该镜秒数，默认取 project.shot_seconds |
| location_id | string | 引用 locations.id |
| time_of_day | string | 日/夜/黄昏/雨中等 |
| shot_size | string | 景别：大远景/远景/全景/中景/近景/特写/大特写 |
| camera | string | 运镜：固定/缓推/缓拉/横移/升降/手持微晃/环绕/跟拍/甩镜 |
| camera_pov | string | 可选，覆盖全局视角：`first` / `third`。缺省跟随 `project.camera_mode`（默认 first，第一人称 POV）。需让观众看到主角本人（反应特写/镜面/大远景建立镜）的镜头必须设 `third` |
| scene_cn | string | 该镜完整画面与动作（中文，写给人看） |
| first_frame_prompt | string | **首帧五段式图像 prompt**（含角色锚点、场景锚点、风格后缀） |
| last_frame_prompt | string | **尾帧五段式图像 prompt** |
| dialogue | array | `{speaker, text}`，可空 |
| vo | string | 旁白，可空 |
| sfx | string | 环境声/动作声 |
| transition | string | 与下一镜衔接：硬切/动作接/视线匹配/声音先导/匹配剪辑/叠化 |
| emotion_tag | string | 搞笑/忧愁/悬念/爽/温情 |
| char_ids | array | 出场角色 ID |
| video_prompt | string | 六段式视频 prompt（agent 生成；脚本缺省时按帧描述自动拼装） |
| seed | integer | 该镜固定种子 |
| assets | object | 脚本回填，见下 |

`assets` 回填字段：`first_frame_url`、`last_frame_url`、`video_id`、`task_status`、
`clip_url`、`clip_file`、`audio_file`。

## 7. 帧链唯一性规则（脚本强校验）

N 个镜头只产生 N+1 张边界关键帧 K0…KN：

- K0 = shots[0].first_frame_prompt
- Ki（1 ≤ i ≤ N-1）= shots[i-1].last_frame_prompt ≡ shots[i].first_frame_prompt
- KN = shots[N-1].last_frame_prompt

校验：相邻镜头 `s_i.last_frame_prompt` 与 `s_{i+1}.first_frame_prompt` 去除空白后必须一致；
不一致时 `plan_production.py --fix` 以后者（下一镜首帧）为准覆盖前者，并打印告警。
镜头 i 视频任务：`first_frame=Ki`、`last_frame=Ki+1`。

## 8. 镜头数与时长校验

- 总时长 = Σ seconds，应等于 duration_seconds（容差 ±10 秒）。
- 镜头数参考：180s→18 镜、240s→24 镜、300s→30 镜（10s/镜）。
- 视频接口 seconds 仅接受字符串 "4"–"12"。

## 9. 创作质检字段（agent 生成后必须自检并在交付说明中报告）

`qa`（可选但建议写入）：

```json
{"hook_present": true, "humor_beats": 2, "sadness_beats": 1,
 "foreshadow_count": 1, "ending_hook": true, "char_count": 3,
 "continuity_closed": true, "safety_passed": true}
```

## 10. 文件与目录约定（脚本在工程目录下自动创建）

```
<project_dir>/
├── production.json              # 唯一工程文件（原地回填）
├── frames/   kf00.png ... kfNN.png（关键帧）
├── clips/    s01.mp4 ... sNN.mp4（单镜视频）
├── audio/    s01_dialogue.wav、bgm.m4a、mix/（配音与混音中间件）
├── subtitles/full.srt
└── output/   <title>_YYYYMMDD_HHMM.mp4（成片）
```

断点续跑：脚本逐帧/逐镜检查 assets 中已有 URL 与本地文件，存在即跳过；
加 `--force` 强制重做指定镜号区间。
