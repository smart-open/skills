---
name: "learning-handbook-pipeline"
description: "Creates illustrated PDF learning handbooks from theory text via guizang illustrations, fireworks diagrams, and frontend design. Invoke when user asks for learning manuals, tutorial handbooks, or knowledge guides with PDF output."
---

# Learning Handbook Pipeline

把理论文本蒸馏成图文并茂的 PDF 学习手册的完整流水线。协调三个技能：`guizang-material-illustration`（概念插图）、`fireworks-tech-graph`（技术图表）、`design-taste-frontend-v1`（前端设计系统），产出 HTML 并转 PDF。

## 何时触发

- 用户要求生成"学习手册""教程手册""知识手册"并转 PDF
- 用户提供理论学习法或知识体系文本，要求可落地、图文并茂
- 用户要求"由浅入深""实战贯穿"的系统性学习材料

## 工作流总览（5 阶段）

1. **规划**：章节结构 + 视觉资产清单 + 设计方案
2. **视觉资产生成**：插图（guizang）+ 图表（fireworks）并行
3. **HTML 构建**：字体 + CSS + 图文穿插内容
4. **PDF 转换**：Puppeteer + 分页优化
5. **验证迭代**：页数、空白页、白边框、图文配比检查

## 三技能协作架构

```
design-taste-frontend-v1（设计总指挥）
  提供设计系统：字体/配色/Bento Grid/反俗套/动效
  │
  ├── guizang-material-illustration（概念视觉）
  │     产出 3D 瑞士编辑风格 PNG，作为内容插图
  │
  └── fireworks-tech-graph（技术图表）
        产出 SVG，作为信息图表嵌入正文

最终 HTML → Puppeteer → PDF
```

**关键**：三者视觉语言必须预先对齐（配色、强调色、线条、留白），避免风格割裂。

## Phase 1：规划

### 章节结构模板

```
封面页（主视觉插图）
序章（心法总览图）
第一章 · 方法论（道）—— 4 方法 + 5 误区
第二章 · 入门篇（术·入门）—— Day1-Day7 每日配图
第三章 · 进阶篇（术·进阶）—— 技能体系
第四章 · 深耕篇（术·深耕）—— 专业迁移
第五章 · 实战项目库（战）—— 阶梯项目
第六章 · 复盘成长（续）—— 闭环与变现
附录（快捷键/FAQ/资源/术语表）
```

### 视觉资产清单规则

- **每章至少 3 张大图**（插图或图表）
- **每个 Day/小节至少 1 张配图**
- **关键操作步骤必须配示意图**
- **专业术语首次出现配 callout 解释块**
- 图文比 ≥ 1:3（每 3 段文字至少 1 张视觉）

### 文件组织

```
<project>/
├── index.html              # 主 HTML（屏幕预览 + PDF 源）
├── <output>.pdf            # 最终 PDF
├── generate-pdf.js         # Puppeteer 脚本（放交付目录）
├── assets/
│   ├── css/                # fonts.css + main.css + print.css
│   ├── js/                 # main.js（动效）
│   ├── fonts/              # woff2 字体
│   └── images/
│       ├── illustrations/  # guizang PNG
│       └── diagrams/       # fireworks SVG
└── package.json
```

## Phase 2：视觉资产生成

### 概念插图（guizang-material-illustration）

**统一风格基调**：3D 材质渲染、瑞士编辑式构图、克制定色、留白充足。

**Prompt 模板**（每张图按此结构）：

```
[插图名称]: 3D Swiss editorial style illustration, cinematic material rendering.
<主题隐喻的具体描述>.
Dark background (#141416), amber accent (#F59E0B) on <关键元素>.
Minimalist Swiss design, 3D material rendering with soft studio lighting,
generous whitespace. Premium editorial quality. No text, no logos, no watermarks.
```

**关键约束**：
- prompt 末尾必须写 `No text, no logos, no watermarks` 防水印
- 所有图配色统一：暗色背景 + 单一琥珀强调色 `#F59E0B`
- 尺寸：封面 16:9，章节配图方形，其余 4:3
- 批量生成时每批 5 张并行

**插图类型分层**：
- 概念插图：抽象概念具象化（如"关键帧=书签"）
- 操作示意图：步骤可视化（如裁剪拼接）
- 对比图：左右分屏前后对照（如调色前后）

### 技术图表（fireworks-tech-graph）

**统一视觉**：暗色底 + 单一强调色 + 细线条 + 编辑式排版。

**生成方式**：Python 列表法逐行 append SVG，避免语法错误。

```python
lines = []
lines.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600">')
lines.append('  <defs>...</defs>')
# ... 每行独立
with open('output.svg', 'w') as f:
    f.write('\n'.join(lines))
```

**验证**：
```python
import xml.etree.ElementTree as ET
ET.parse('file.svg')  # 验证 XML 合法性
```

**配色 token**：
- 背景：`#0A0A0B` / `#141416`
- 文字：`#FAFAFA` / `#A1A1AA`
- 强调色：`#F59E0B`
- 边框：`#27272A`

## Phase 3：HTML 构建

### 设计系统基线（design-taste-frontend-v1）

**字体**：
- 拉丁/数字：Geist + Geist Mono
- 中文：Noto Sans SC / HarmonyOS Sans SC，fallback 微软雅黑
- 通过 Google Fonts CDN 引入：`@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@300;400;500;700;900&display=swap');`

**配色（暗色主基调）**：
- 背景：`#0A0A0B` / `#141416` / `#1C1C1F`
- 文字：`#FAFAFA` / `#A1A1AA` / `#71717A`
- 强调色：单一琥珀 `#F59E0B`（全书只用一个）
- 边框：`#27272A` / `#3F3F46`

**版式**：Bento Grid 非对称网格，大字号编辑式标题，章节大留白。

### 反 AI 俗套清单（必须规避）

- 禁止居中 hero 三件套
- 禁止 3 列等高 feature 卡（改 Bento 非对称）
- 禁止紫色/蓝紫渐变
- 禁止 emoji 当图标（用自定义 SVG）
- 禁止 Inter 字体（用 Geist）
- 禁止圆角 2xl 滥用 + 玻璃拟态

### 图文并茂策略（核心）

- 每个知识点"图主导 + 文辅助"：先放图，下方配 2-3 句白话解读
- 杜绝"大段文字后集中放图"的学术论文式排版
- 长章节每滚动 1 屏（约 600px）必须出现至少 1 个视觉元素

### 通俗化写作规范

- 短句优先，单句不超过 25 字
- 口语化："这个功能就是用来..."、"简单说就是..."
- 多用类比：关键帧=书签、LUT=滤镜配方、码率=画质密度
- 专业术语首次出现配括号大白话：如"关键帧（就是给软件做个标记）"
- 步骤用数字编号 + 短动词开头
- 验收标准用可勾选清单

## Phase 4：PDF 转换（Puppeteer）

### 工具选型：Puppeteer

理由：Node.js 亲和；Chromium 渲染与现代 CSS（Bento Grid/Flexbox）兼容最佳；Windows 中文字体开箱即用；`printBackground:true` 保留暗色背景。

### generate-pdf.js 核心模板

```javascript
const puppeteer = require('puppeteer');
const path = require('path');

async function generatePDF() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 60000
  });
  
  // 等待字体加载
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 2000));
  
  // 模拟打印媒体
  await page.emulateMediaType('print');
  
  // 注入 CSS 确保背景铺满整页（无白边）
  await page.addStyleTag({
    content: `
      @media print {
        html, body {
          background: #0A0A0B !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      }
    `
  });
  
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    displayHeaderFooter: false,
    preferCSSPageSize: true,
    printScaling: 'fit'
  });
  
  await browser.close();
}
```

### 关键配置说明

- `executablePath`：指定系统 Chrome，避免下载 Chromium
- `emulateMediaType('print')`：确保 `@media print` 样式生效
- `addStyleTag` 注入背景色：解决白边框问题
- `margin: 0` + `@page margin: 0`：全幅背景填充
- `displayHeaderFooter: false`：去掉页眉页脚占用空间

## Phase 5：踩坑记录与对策（关键经验）

### 问题 1：PDF 空白页多

**根因**：`break-before: page` 每章强制分页 + `break-inside: avoid` 卡片被推到下页。

**对策**：
- 只在封面、序章、第一章用 `break-before: page`，后续章节自然流动
- Bento Grid 打印时降级为双列（`grid-template-columns: repeat(2, 1fr)`）
- 图片限制高度 `max-height: 220px`，避免独占整页
- 字体压缩：正文 10pt，卡片 9.5pt
- 用 `orphans: 3; widows: 3` 控制孤行

### 问题 2：PDF 白色边框

**根因**：`@page margin` 和 Puppeteer `margin` 未设为 0。

**对策**：
- `@page { size: A4; margin: 0; }`
- Puppeteer `margin: { top: '0', bottom: '0', left: '0', right: '0' }`
- 注入 `html, body { background: #0A0A0B !important; }`
- 容器加 `padding: 0 10mm` 保证内容不贴边，但背景铺满

### 问题 3：中文字体乱码

**根因**：web font 加载失败。

**对策**：
- Google Fonts CDN 引入 Noto Sans SC
- CSS font-family 链 fallback 微软雅黑：`'Noto Sans SC', 'Microsoft YaHei', sans-serif`
- Puppeteer `document.fonts.ready` 等待字体加载
- 额外等待 2 秒确保渲染

### 问题 4：图片有水印

**根因**：AI 文生图偶发水印。

**对策**：prompt 末尾强制写 `No text, no logos, no watermarks`；生成后检查，有水印则重新生成（不去除，直接重生成更干净）。

## 验证清单

### 内容完整性
- [ ] 理论框架（方法/阶段/误区）全部成节且配图
- [ ] 每个知识点都有配图，无纯文字段落超过 3 段
- [ ] 专业术语首次出现均有括号大白话解释
- [ ] 单句不超过 25 字

### PDF 质量
- [ ] 用 PyMuPDF 检查每页文字量，无空白页（文字<20字且无图=空白）
- [ ] 四角像素采样验证背景填充（RGB<30 = 暗色填充）
- [ ] 中文字体已嵌入，无乱码
- [ ] 章节分页正确，无标题孤立页底
- [ ] SVG 矢量清晰，PNG 插图无压缩伪影

### 验证脚本模板

```python
import fitz
doc = fitz.open('output.pdf')
for i in range(doc.page_count):
    page = doc[i]
    text = page.get_text().strip()
    imgs = page.get_images()
    status = '空白' if len(text) < 20 and len(imgs) == 0 else '正常'
    # 四角像素采样
    pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))
    r, g, b = pix.pixel(5, 5)[:3]
    is_dark = r < 30 and g < 30 and b < 30
    print(f'第{i+1}页 [{status}] 文字{len(text)}字 图{len(imgs)}张 四角{"暗色" if is_dark else "白色"}')
doc.close()
```

## 适用场景扩展

本流水线不仅限于视频剪辑学习手册，可复用于：
- AI 创作教程手册
- 编程入门指南
- 任何"理论 + 实战 + 图文"的知识手册

替换章节结构和领域内容即可，视觉资产生成和 PDF 转换流程完全复用。
