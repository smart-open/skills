---
name: "xiaoe-course-downloader"
description: "小鹅通（xet/xiaoeknow）课程批量下载与备份：用户只提供 Cookie 与任意店铺/课程链接，自动抓取课程、校验权限、下载可访问课时并生成清单，默认输出到当前会话根目录。用户没提供 Cookie 时先引导其从浏览器导出。Invoke when user wants to download or back up xiaoeknow/xet (小鹅通) courses/videos, or asks what courses a shop offers."
---

# 小鹅通课程批量下载

把「当前账号有权限」的课程视频备份到本地，并生成课程清单（含需购买课程、0 元课、试看课时）。原理：H5 页面接口 + HLS 分片 AES-128 解密 + ffmpeg 无损转封装 + 硬链接去重。

## 前置条件

```bash
pip install requests pycryptodome
ffmpeg -version            # 必须可执行，用于 ts -> mp4 转封装
```

## 输入

1. **链接**：任选其一即可
   - 店铺首页 `https://<app_id>.h5.xet.pomoho.com`
   - 课程详情页 `.../p/course/ecourse/course_xxx?type=2`（自动只抓这一门）
   - 分类页 `.../p/decorate/more/<base64>`
   - 自建域名（`learn.example.com` 之类）也可，app_id 用 `--app-id` 指定
2. **Cookie（必需，缺了先引导获取）**：`--cookie "a=1; b=2"`、`--cookie-file cookies.txt`、或环境变量 `XET_COOKIE`

Cookie 支持三种格式，脚本自动识别：
- 纯 Cookie 串（分号分隔一行）
- 完整 curl 命令（自动提取 `-b` / `--cookie` 参数）
- Netscape 格式 `cookies.txt`（浏览器插件导出）

**用户没提供 Cookie 时，不要直接跑脚本，也不要替用户瞎猜**——按下方「缺少 Cookie 时」引导用户导出，拿到后再执行。

**输出目录默认为当前会话根目录**，可用 `-o` 改。元数据统一落在 `<out>/.xet/`。

## 缺少 Cookie 时：先引导用户获取

只要 `--cookie` / `--cookie-file` / `XET_COOKIE` 都没有，就停下来说明需要登录态，并按「推荐方式」给出可直接照做的步骤；脚本也会在检测到缺 Cookie 时打印同样的指引。

### 推荐方式：浏览器开发者工具复制整行（电脑端）

1. 电脑浏览器打开店铺链接（如 `https://<app_id>.h5.xet.pomoho.com`）并登录（微信扫码 / 手机号均可）
2. 按 `F12` 打开开发者工具 → `Network`（网络）面板 → 刷新页面
3. 在请求列表里点任意一个 `h5_index` 或 `xe.` 开头的请求
4. 在 `Request Headers` 里找到 `Cookie`，把**冒号后的整行值全部复制**
5. 在当前工作目录新建 `cookies.txt`，粘贴保存

然后先验证再下载：

```bash
python <skill>/scripts/run.py --url "<链接>" --cookie-file cookies.txt --report-only
```

能列出课程 = Cookie 有效；报空响应 / 未登录 / 无访问权限 = Cookie 不完整或已过期，回第 1 步重新登录再取。

### 备选导出方式

| 方式 | 操作 | 产物 |
|---|---|---|
| Copy as cURL | DevTools 右键目标请求 → Copy → Copy as cURL → 整段粘贴进 `cookies.txt` | 脚本自动提取 `-b` / `--cookie` |
| Cookie 插件 | 安装 Cookie-Editor（Chrome/Edge）→ 在店铺域名下 Export → 粘贴进 `cookies.txt` | Netscape 格式，自动识别 |
| 直接粘贴 | 不走文件，直接 `--cookie "<整行>"` | 纯 Cookie 串（含引号时注意转义） |

### 引导时必须说清

- 必须先在**该店铺自己的域名**下登录（Cookie 与登录态、app_id 绑定，换店铺要重取）
- **整行复制**，不要只挑几个字段；缺登录 token 会取不到任何播放地址
- 优先用电脑浏览器；移动端微信内置浏览器导出困难，可登录同一账号后在电脑上操作
- Cookie 等同账号登录凭证：只在本机使用，不要贴到公开群聊 / 仓库 / 第三方网站；用完可退出登录使其失效
- 用户给出的是「手机截图 / 部分字段 / 别的网站 Cookie」时，明确说明不可用，请其按上面步骤重取

## 一键流程（推荐）

```bash
python <skill>/scripts/run.py --url "<链接>" --cookie-file cookies.txt
```

只出清单不下载：

```bash
python <skill>/scripts/run.py --url "<链接>" --cookie-file cookies.txt --report-only
```

只下某一门课：

```bash
python <skill>/scripts/run.py --url "https://xxx.h5.xet.pomoho.com/p/course/ecourse/course_ABC123" --cookie-file cookies.txt
```

扫描全店但只下含关键字的课程：

```bash
python <skill>/scripts/run.py --url "<店铺首页>" --cookie-file cookies.txt --only Halcon
```

## 分步执行（需要精细控制时）

```bash
# 1. 抓课程 + 目录 + 权限校验 -> <out>/.xet/catalog.json、courses.json
python <skill>/scripts/fetch_catalog.py --url "<链接>" --cookie-file cookies.txt --out .

# 2. 出清单 -> <out>/店铺课程清单.txt
python <skill>/scripts/gen_report.py --out .

# 3. 下载（网络差时降并发，避免 CDN 限流卡死）
python <skill>/scripts/download.py --url "<链接>" --cookie-file cookies.txt --out . \
  --video-workers 1 --seg-workers 3

# 4. 重出清单（区分已下载/待下载）
python <skill>/scripts/gen_report.py --out .
```

下载可反复重跑：已存在且 >10KB 的 mp4 自动跳过，只补缺失部分。

## 输出结构

```
<out>/<课程名>/<序号 课时名>.mp4
<out>/店铺课程清单.txt
<out>/download.log
<out>/.xet/catalog.json     # 课时索引（rid/目录/文件名/course_id）
<out>/.xet/courses.json     # 课程汇总（价格/视频数/可访问数/试看数/时长）
<out>/.xet/fails.txt        # 失败清单（全部成功时自动删除）
```

同一课时出现在多门课程时：首个位置实存，其余用 NTFS 硬链接（`os.link`），不占额外空间；失败回退复制。

## 关键判断

- **权限判定用「探测」**：目录接口的 `subscribe`/`available` 不可靠（已购课程也可能返回 0，且 `is_display_auth_sections=1` 时根本不返回这两个字段）。可靠做法是调用 `video.detail_info.get`，能取到播放地址即有权限（`Shop.check_access`）。
- **抓目录要请求两次**：`is_display_auth_sections=0` 才返回权限字段，`=1` 才返回 `is_try`，必须合并。
- **试看课时 `is_try=1`**：未购买也能取流，付费课唯一可下载的部分。
- **0 元课程不等于可领取**：要看课程页是否有「立即学习 / 0 元领取」入口；没有入口就不产生权益。但已能取流的仍可直接下载。
- **无法绕过鉴权**：播放地址由服务端按权益签发，分片带 `sign` + `t` 时效签名。

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 提示「未找到 Cookie」 | 用户还没导出 Cookie。按「缺少 Cookie 时」5 步引导，拿到 `cookies.txt` 后再跑 |
| Cookie 有了但 0 门课程 / 空响应 | Cookie 不完整、已过期，或登的是别的店铺/账号。回到该店铺重新登录后整行重取 |
| 全部请求失败，连不上 `127.0.0.1:7788` | 本机代理端口失效。加 `--no-proxy`，或修好代理 |
| 下载到一半卡住、`.part.ts` 不增长 | CDN 限流。降并发 `--video-workers 1 --seg-workers 3` |
| `blocked: empty response` | 触发风控，自动等 90s 重试；持续出现则停 10 分钟 |
| Cookie 失效 | 播放接口返回未登录/无权限，重新导出 Cookie |
| `ConnectionResetError` / DNS 解析失败 | 网络瞬断，直接重跑同一条命令即可续传 |
| 找不到 catalog | 先跑 `fetch_catalog.py`，或检查 `--out` 与 `--catalog` 是否一致 |
| 文件名超长/非法字符 | `xet.sani()` 已处理：非法字符替换、截断 110 字符 |

## 接口速查

见 `references/api.md`（接口路径、参数与响应要点）。
