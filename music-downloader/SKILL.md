---
name: "music-downloader"
description: "根据演唱者和歌曲名称从国内主流音乐平台（网易云/QQ/酷狗/咪咕/汽水）下载歌曲MP3和歌词LRC。Invoke when user asks to download songs and lyrics by artist and song name from Chinese music platforms."
---

# 音乐下载 Skill

根据演唱者和歌曲名称，从国内5大主流音乐平台搜索并下载歌曲(MP3)及歌词(LRC)。

## 支持平台

| 平台 | 搜索 | 下载 | 歌词 |
|---|---|---|---|
| 网易云音乐 | 官方API | 4个第三方API回退 | 有 |
| QQ音乐 | 官方API | 2个第三方API回退 | 有 |
| 酷狗音乐 | 官方API | 2个第三方API回退 | 有 |
| 咪咕音乐 | 官方API | 官方下载接口 | 有 |
| 汽水音乐 | 官方API | 第三方API+官方试听 | 有 |

## 稳健下载策略（网易云优先）

网易云为首选源，采用「**演唱者校验 + 完整音频 + 真实时间轴歌词**」三重保障，避免拿到翻唱/Remix 或截断的 Live 片段：

1. **演唱者校验**：取搜索结果的歌曲详情，比对 `artist` 是否包含目标演唱者；仅当命中才接受该音轨（防止误抓 Montagem 翻唱等）。
2. **完整音频校验**：通过 cenguigui / haitangw / rrvenn 镜像取直链，写入临时 `.part.mp3`，达标（默认 ≥1.5MB，杜绝 470KB 截断片段）才原子改名为最终 `.mp3`。
3. **真实时间轴歌词**：优先用网易云官方歌词接口 `/api/song/lyric` 取带时间戳 LRC；缺失时回退镜像内联歌词；都没有则写占位「暂无歌词」。
4. **原版优先**：同名多版本时，对命中演唱者的候选按名称"原版度"打分（Live/翻唱/DJ/乐器版等后缀扣分），优先最像原版的一条。

> ⚠️ 若搜索接口降级（返回结果不含原唱、或混入无关歌曲），脚本会**跳过网易云并明确告警**，而非静默返回错误版本。此时请改用 `--id` 精确下载（见下）。

## 按 NetEase 歌曲 ID 精确下载（搜索降级时的可靠通道）

当搜索接口不可用、或需要指定确切音轨时，直接用歌曲 ID 下载（ID 取自 `https://music.163.com/#/song?id=XXXXXX`）：

```bash
python batch_download_v4.py --id 2731417637 -s "王力宏" -n "爱错" -q high -o "输出目录"
```

按 ID 取详情/歌词/音频的接口在搜索降级时通常仍可用，是兜底首选。

## 环境依赖

- 仅需 `requests`（Excel 批量功能另需 `pandas`，已做懒加载，单曲下载不依赖）。
- 脚本启动时会**自动检测并引导安装** `requests`（在脚本目录生成 `.venv` 并 `pip install requests`），无需手动配置。
- 也可手动安装：`pip install -r requirements.txt`。

## 核心接口

脚本位置: `scripts/batch_download_v4.py`（569 行）

### 下载单首歌曲

```python
import sys; sys.path.insert(0, r'scripts')
from batch_download_v4 import MusicDownloader

dl = MusicDownloader(output_dir=r'D:\音乐目录', default_quality='high')

# 最简用法
result = dl.download('陈奕迅', '孤勇者')

# 指定音质
result = dl.download('周杰伦', '晴天', quality='lossless')
# quality可选: 'standard'(标准) / 'high'(高品质) / 'lossless'(无损)

# 带分类
result = dl.download('周深', '大鱼', era='2010年代', level='S级')
```

### 批量下载

```python
# dict列表
songs = [
    {'singer': '陈奕迅', 'song_name': '孤勇者'},
    {'singer': '周杰伦', 'song_name': '晴天', 'era': '2000年代', 'level': 'S级'},
]
dl.download_batch(songs, quality='high')

# 字符串列表（自动解析）
songs = ['陈奕迅的孤勇者', '周杰伦 晴天', '林俊杰,江南']
dl.download_batch(songs, era='2000年代', quality='high')

# 从文本
dl.download_from_text('陈奕迅 孤勇者\n周杰伦 晴天', era='2000年代')

# 从文件
dl.download_from_file('songs.txt', era='2000年代')

# 从Excel（自动过滤经典选曲占位符）
dl.download_from_excel('歌曲列表.xlsx', quality='high')
```

### 命令行用法

```bash
# 单首下载（网易云稳健路径：原唱校验 + 完整音频 + 真实歌词）
python batch_download_v4.py -s "陈奕迅" -n "孤勇者" -q high

# 指定音质
python batch_download_v4.py -s "周杰伦" -n "晴天" -q lossless

# 按歌曲ID精确下载（搜索不可用时的兜底）
python batch_download_v4.py --id 2731417637 -s "王力宏" -n "爱错" -q high

# 批量文本
python batch_download_v4.py --text "陈奕迅 孤勇者\n周杰伦 晴天" -q high

# 批量文件
python batch_download_v4.py --file songs.txt --era "2000年代" --level "S级" -q high

# Excel批量
python batch_download_v4.py --excel "歌曲列表.xlsx" -q high
```

## 输入格式自动解析

`_parse_song_item()` 支持以下格式，无需手动预处理：

| 格式 | 示例 | 结果 |
|---|---|---|
| dict | `{'singer': '陈奕迅', 'song_name': '孤勇者'}` | 陈奕迅 / 孤勇者 |
| tuple | `('陈奕迅', '孤勇者')` | 陈奕迅 / 孤勇者 |
| "XX的XX" | `"陈奕迅的孤勇者"` | 陈奕迅 / 孤勇者 |
| 空格分隔 | `"陈奕迅 孤勇者"` | 陈奕迅 / 孤勇者 |
| 逗号分隔 | `"陈奕迅,孤勇者"` | 陈奕迅 / 孤勇者 |
| Tab分隔 | `"陈奕迅\t孤勇者"` | 陈奕迅 / 孤勇者 |

## 音质参数

| 参数值 | 说明 | 建议场景 |
|---|---|---|
| `standard` | 标准音质 (128kbps) | 快速试听、节省空间 |
| `high` | 高品质 (320kbps) | 默认推荐 |
| `lossless` | 无损音质 (FLAC) | 收藏级，文件较大 |

## 特性

- **5平台回退**: 网易云→QQ→酷狗→咪咕→汽水，逐层回退
- **多API回退**: 每平台2-4个第三方API
- **原唱校验**: 网易云路径比对演唱者，拒绝翻唱/Remix 误抓
- **完整音频校验**: 临时文件达标后才落盘，杜绝截断片段
- **真实时间轴歌词**: 官方歌词接口优先，带时间戳 LRC
- **按ID精确下载**: 搜索降级时的可靠兜底通道
- **依赖自举**: 缺 requests 时自动建 .venv 安装
- **断点续传**: 默认跳过已下载文件
- **音质可选**: standard/high/lossless
- **灵活分类**: era/level参数控制目录结构

## 已知限制

- **网易云搜索接口偶发降级**：某些网络环境下 `cloudsearch/pc` 会返回空 artist 或无关结果，此时原唱校验无法命中，脚本会跳过网易云并告警。解决：用 `--id` 直接指定歌曲 ID 下载。
- **非网易云平台受限**：QQ音乐/汽水音乐的搜索在部分网络被拦截（返回 0 条）；酷狗下载 API、咪咕接口在本环境可能失效。这些仅作为网易云之后的回退，不影响主路径。
- **歌词依赖数据源**：个别音轨在网易云无歌词，会落占位「暂无歌词」。

