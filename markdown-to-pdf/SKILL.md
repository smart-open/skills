---
name: markdown-to-pdf
description: 把 Markdown 文档（尤其是含大量表格、代码块、内嵌 SVG 图片、告警块、脚注的中文技术手册）批量转换为保真 PDF，零 npm 依赖、零样式丢失，并带产物自检。Invoke when user asks to export Markdown to PDF、把 md 转 PDF、批量转 PDF、保留排版导出 PDF.
---

# Markdown → PDF 保真转换

一个只做一件事、但做扎实的工具：**把 Markdown 转成 PDF，且不丢样式、不错乱格式**。

内置 `marked` 解析器（已 vendored 到 `assets/`，无需 `npm install`），调用系统 Chrome/Edge 无头打印。表格不错位、代码块不溢出、GitHub 告警块正确着色、脚注不再丢失、中文字体矢量嵌入。

## 何时触发

- 用户要求「把这几份 md 转 PDF」「导出 PDF」「批量转 PDF」
- 用户已有写好的 Markdown 技术文档/手册/面试题，需要可分发、可打印的 PDF
- 用户抱怨某个 PDF 工具「表格错乱 / 图片丢了 / 代码溢出 / 中文乱码」

**不适用**：需要从零生成图文并茂的出版物（那是 `learning-handbook-pipeline` 的活）；需要 Word/PPT 的场合（用对应 office 技能）。

## 快速开始

```bash
# 单文件，输出到源文件同目录
node scripts/md2pdf.mjs 手册.md

# 多文件
node scripts/md2pdf.mjs a.md b.md c.md

# 整个目录（递归，跳过 node_modules 与隐藏目录，保留子目录结构）
node scripts/md2pdf.mjs ./docs -o ./pdf

# 暗色主题 + 保留中间 HTML 便于排查
node scripts/md2pdf.mjs 手册.md --theme dark --keep-html

# 带页码页眉
node scripts/md2pdf.mjs 手册.md --header-footer
```

转换后立即自检（见下文「产物自检」）是推荐流程：`md2pdf` 负责生成，`verify_pdf.py` 负责判定能否交付。

### 参数

| 参数 | 说明 |
|---|---|
| `-o, --out <dir>` | 输出目录，默认写回源文件同目录；递归转换时保留子目录结构 |
| `--theme <t>` | `light`（默认）\| `dark` |
| `--paper <p>` | `A4`（默认）\| `Letter` \| `A3` \| `Legal`（不区分大小写，非法值直接报错） |
| `--browser <path>` | 指定 Chrome/Edge 可执行文件 |
| `--font-chain <css>` | 覆盖中文字体链，默认自动探测（见「字体链」一节） |
| `--keep-html` | 保留中间 HTML（调试样式用） |
| `--header-footer` | 打印页码与标题页眉（默认关闭） |
| `--quiet` | 静默模式，仅在有失败/缺失资源时输出 |
| `-h, --help` / `-v, --version` | 帮助 / 版本 |

支持的后缀：`.md` `.markdown` `.mdown` `.mkd`。

退出码：`0` 全部成功；`1` 有失败项（逐条打印原因）；`2` 参数或环境错误。

## 内置的 12 个坑与对策

以下问题都是实测踩到的，脚本已全部内置修复，**不需要人工处理**。

| # | 现象 | 根因 | 脚本对策 |
|---|---|---|---|
| 1 | 首个 `# 标题` 显示成普通文本 | 文件带 UTF-8 BOM，`#` 前有不可见字符 | 读入即剥离 BOM |
| 2 | `60~90 h（8~12 周）` 被划掉且错位 | GFM 把单个 `~` 当删除线定界符 | 覆盖 `del` tokenizer，只承认成对 `~~`；真删除线仍有效 |
| 3 | `> [!warning] 高发事故` 显示成裸文本 | GitHub 告警块非标准 Markdown | marked 扩展识别 13 种类型，渲染成带徽标与配色的 callout |
| 4 | 告警块里再套引用时，排版整体错乱 | 事后正则扫 HTML 会把嵌套标签切坏 | 在词法层接管，内层继续走正常解析 |
| 5 | 脚注 `[^1]` 变成怪链接、脚注正文消失 | 内置 marked 不支持脚注，`[^1]: 文本` 被当成链接定义 | 摘出定义、引用转上标、文末补回脚注区，双向可跳转 |
| 6 | YAML 头变成一条横线 + 一行二级标题 | `---` 被解析成 `hr` + setext `h2` | 转换前剥离 front matter |
| 7 | 目录里的 `[章节](#章节)` 点了没反应 | marked 默认不给标题生成 `id` | 标题加 slug（含中文），PDF 内跳转真实可用 |
| 8 | `![点位](assets/点位 图.png)` 直接显示成文本 | CommonMark 要求含空格的目的地用 `<>` 包裹 | 路径含空格时自动补 `<>`，保留 title 语法 |
| 9 | 图片路径失效（中文/空格） | 相对路径 + 非 ASCII 未编码 | `pathToFileURL` 逐段编码，保留 `#fragment`，不误伤 `//cdn`、`/abs`、`mailto:` |
| 10 | PDF 里中文放大发糊、体积暴涨 | 字体链选中可变字体（`NotoSansSC-VF.ttf`），Chrome 无法矢量嵌入，退化成 Type3 位图 | 扫描字体表目录剔除含 `fvar` 的家族，优先静态字体 |
| 11 | 批量转换后部分文档「凭空消失」 | 不同子目录的同名文件扁平输出时互相覆盖 | `-o` 保留目录结构；仍冲突则加父目录名后缀并明确告警 |
| 12 | 表格列宽挤成一列 / 长英文溢出 / 代码被裁切 | 缺少 `word-break`、`pre` 用 `white-space: pre` | `table-layout:auto` + `overflow-wrap:anywhere` + `thead` 跨页重复 + 代码 `pre-wrap` |

## 字体链（最容易踩的一个）

Chrome **不能把可变字体作为 Type0 子集嵌入**，会逐字退化成 Type3 位图：文字仍可搜索，但放大发糊、体积暴涨。实测同一份 3 页文档：

| 字体链 | 体积 | 字体类型 |
|---|---|---|
| 原链（`Noto Sans SC` 在前） | 549 KB | 矢量 3 / 栅格 154 |
| 自动探测（静态字体在前） | 215 KB | 矢量 9 / 栅格 13 |

脚本会扫描本机字体目录、解析 sfnt 表目录、剔除含 `fvar` 的家族，把可矢量嵌入的家族排在链首；等宽字体链同理（`Cascadia Mono` 在 Windows 上也是可变字体）。想固定行为可用 `--font-chain` 覆盖，自检脚本会抓出误用可变字体的产物。

## 排版规格

- 正文 10.5pt / 行高 1.75；页边距由 `@page` 控制（`17mm 15mm 19mm 15mm`），正文不再用 padding 顶开，页眉页脚不会压到内容
- 标题分级：H1 21pt 蓝色粗底边；H2 15.5pt 带下划线；H3/H4 逐级递减
- 表格 8.8pt，斑马纹，表头浅蓝底，跨页自动重复表头
- 代码块 `Consolas` 等等宽字体，浅灰底 + 圆角边框，字号 8.3pt
- 告警块配色按主题派生：暗色下不会继承浅色的淡彩底（实测那样正文会糊成一片）
- 打印友好：`h2/h3/pre/img/tr` 均 `break-inside: avoid`，标题 `break-after: avoid`
- `print-color-adjust: exact` 保证背景色与强调色不被省墨模式吃掉

### 页码页眉

`--header-footer` 用 CSS `@page` 页边框实现（`counter(page) / counter(pages)` + 右上角标题），**不含本地文件路径**。

原生 `--print-to-pdf` 默认页眉会打印 `file:///…` 完整路径与时间戳——对外分发会泄露本机目录结构，因此脚本始终带 `--no-pdf-header-footer`，页码改由 CSS 提供。

## 产物自检（强烈建议）

转换后用 `verify_pdf.py` 审计质量：

```bash
python scripts/verify_pdf.py out.pdf
python scripts/verify_pdf.py *.pdf --render-dir ./_review   # 同时导出问题页截图
python scripts/verify_pdf.py out.pdf --expect-images 3      # 断言位图数量下限
```

输出示例：

```
=== 手册.pdf ===
总页数: 3 | 含位图页: 1 | 中文字体页: 3
字体: 矢量 9 / 栅格化 13
✅ 未发现空白页 / 内容越界 / 图片缺失 / 文字栅格化
```

退出码 `0` = 通过；`1` = 有可疑页（可在流水线里拦截返工）；`2` = 文件不可读或缺依赖。

### 自检判定逻辑

- **空白页**：文字 < 20 字且无有效图形、无位图。注意 Chrome 会给每页铺一层整页背景色块，判定时必须先排除它，否则空白页永远检不出来
- **内容越界**：任一文本块 `x1 > 页宽+6` 或 `y1 > 页高+6` 或 `x0 < -6`
- **文字栅格化**：单页 > 15% 字符用 Type3 渲染 → 提示误用可变字体
- **图片未落地**：正文（非等宽字体部分）残留 `![` 或 `broken image` 等 alt 占位。代码块里讲 Markdown 语法的 `![` 不算，否则教程文档会被误报
- **中文字体**：按 CJK 统一表意文字码位判定页面是否含中文，再对照矢量/栅格字体计数

图片路径失效在**转换阶段**就会告警（`! 手册：图片不存在 → …`）并在汇总里计数——因为 Chrome 只会把 alt 文本留在 PDF 里，事后从 PDF 反查不可靠。

## SVG 为什么能保真

`<img src="*.svg">` 在 Chrome 中按矢量渲染再打印，**图形路径与色块在 PDF 内以矢量存储**，放大不糊。**不要**为了省事把 SVG 转成 PNG 再嵌入，那会引入压缩伪影并暴涨体积。

同一页只换一张图的实测（页数固定）：

| 内容 | 体积 | 说明 |
|---|---|---|
| 纯文字 | 33.5 KB | 基准 |
| + 无文字 SVG | 35.4 KB | 矢量图形几乎不要钱 |
| + 含文字 SVG | 82.5 KB | 多出 17 个 Type3 字形 |

需要知道的细节：SVG **内部的文字**会被逐个唯一字形转成 Type3 位图（约 2.8 KB/字形，重复字形只存一份）。这些文字仍然可提取、可搜索（`采集层` 能直接搜到），只是不再是可重绘的字体子集。图多字多的手册因此会比纯文字大不少——若对体积极敏感，把 SVG 里的文字改成路径轮廓即可。

若某张图在 PDF 中缺失或白块，先看转换阶段的「图片不存在」告警；再用 `--keep-html` 保留 HTML，浏览器打开按 F12 看 `src` 是否 404。

## 与其他技能的关系

- `learning-handbook-pipeline`：**生成**图文并茂的手册（插图 + 图表 + 排版设计），它的 PDF 环节可直接调用本技能，或参考本技能的踩坑清单
- `tech-article-craft`：产出的是自包含 HTML 文章；若用户要 PDF，把 HTML 交给 Chrome 打印即可（本技能入口是 Markdown）

## 环境要求

| 依赖 | 说明 |
|---|---|
| Node.js 18+ | 运行 `md2pdf.mjs`（使用 ESM 与 `node:` 前缀） |
| Chrome 或 Edge | 任选其一，脚本按环境变量与常见路径自动探测，再退回 `PATH`；找不到用 `--browser` 指定 |
| Python 3.8+ + PyMuPDF | 仅 `verify_pdf.py` 需要，`pip install pymupdf` |

零 npm 依赖：`marked` 已随技能打包在 `assets/marked.umd.js`（v18，MIT，见 `assets/LICENSE-marked.md`）。

## 安全

内置 `marked` v18 **不清洗 URL**（实测 `javascript:`、`vbscript:`、`data:text/html` 原样写进 `href`），而本技能又自定义了 link/image renderer，少了一层保护。因此 `safeHref()` 会拦掉这些协议、把对应链接降级为空 `href`（保留可见文字），PDF 里点不动。

`data:image/...`、`mailto:`、`http(s):`、`file:` 不受影响。实体编码（`java&#115;cript:`）与制表符绕过（`jav&#x0A;ascript:`）也进不来——它们不匹配严格的协议白名单，会被当作相对路径补上 `file://` 前缀，从而失去脚本语义。

转换的是自己写的文档时这些无所谓；转换来路不明的 Markdown 时，这一层是必要的。

## 性能

实测（Chrome 157 / Windows）：单文件约 **0.7 秒**，10 个文件约 **5 秒**。批量转换的耗时主要是浏览器进程启动，不在解析。

## 设计取舍

**为什么用 Chrome 打印而不是 Puppeteer**：Puppeteer 要下载 ~150MB Chromium，且版本与 CSS 支持常滞后；直接 `--headless=new --print-to-pdf` 调用系统浏览器，零安装、渲染与用户日常所见一致。

**为什么在词法层修 Markdown，而不是事后正则扫 HTML**：本技能前两版都靠正则扫最终 HTML，结果在嵌套引用、脚注、`#` 锚点上接连出问题——HTML 是结构化产物，用正则改结构迟早会切坏标签。现在告警块是 marked 扩展、锚点是 heading renderer、删除线是 tokenizer 覆盖，路径改写也在 renderer 里做，互不打架。

**为什么不引入 CSS 框架/高亮库**：技术文档的价值在「打印后清晰可读」而非屏幕炫技。手写 CSS 已覆盖标题、表格、代码、引用、告警、图片、脚注全部场景，体积小、无外部请求、离线可用。代码高亮由语法结构本身承担（等宽字体 + 浅底），不追求 token 着色。

**为什么 marked 要 vendor 进去**：技能要能离线、开箱即用。52KB 的单文件 UMD 比要求用户 `npm install` 更可靠。
