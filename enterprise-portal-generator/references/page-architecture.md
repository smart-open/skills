# Page Architecture Reference

Complete section structure for all 6 pages, plus shared components. Load this when building HTML pages in Step 5.

## Shared Components (All Pages)

### HTML Head Template

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{Page Title} - {Company Name} | {One-line value prop}</title>
<meta name="description" content="{120-160 char meta description}" />
<meta name="theme-color" content="#0A0A0B" />
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="css/style.css" />
</head>
<body>
```

### Navigation (shared on all 6 pages)

```html
<header class="nav" id="top">
  <div class="container nav-inner">
    <a href="index.html" class="brand" aria-label="{Company}首页">
      <svg class="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <!-- Brand mark SVG: rounded square + abstract shape in accent color -->
        <rect width="64" height="64" rx="16" fill="#18181B"/>
        <!-- Custom path based on company initials or logo concept -->
      </svg>
      <span class="brand-name">{Company}<span>科技</span></span>
    </a>
    <nav class="nav-links" aria-label="主导航">
      <a class="nav-link" href="index.html">首页</a>
      <a class="nav-link" href="products.html">产品中心</a>
      <a class="nav-link" href="news.html">新闻动态</a>
      <a class="nav-link" href="about.html">关于我们</a>
      <a class="nav-link" href="recruitment.html">在线招聘</a>
      <a class="nav-link {active}" href="consultation.html">在线咨询</a>
    </nav>
    <div class="nav-cta">
      <a href="consultation.html" class="btn btn-sm">免费咨询
        <svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </a>
      <button class="nav-toggle" aria-label="打开菜单" aria-expanded="false"><span></span></button>
    </div>
  </div>
</header>

<!-- Mobile menu -->
<div class="mobile-menu" id="mobileMenu">
  <!-- Same nav links as desktop -->
  <a href="consultation.html" class="btn" style="margin-top:2rem">免费咨询</a>
</div>
```

**Rules**:
- Set `aria-current="page"` and `.active` class on the current page's nav link
- Mobile menu contains ALL nav links plus a CTA button
- Nav is `position: fixed` — first section needs `padding-top` to clear it

### Footer (shared on all 6 pages)

```html
<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a href="index.html" class="brand"><!-- brand mark + name --></a>
        <p>{Company} · {English name}，{one-line description}。</p>
        <div class="mono" style="margin-top:1.5rem;color:var(--ink-4)">
          <span class="dot" style="background:var(--success)"></span> {City} · 当前可接洽新项目
        </div>
      </div>
      <div>
        <h4>服务</h4>
        <ul>
          <li><a href="products.html">{Service 1}</a></li>
          <li><a href="products.html">{Service 2}</a></li>
          <li><a href="products.html">{Service 3}</a></li>
          <li><a href="products.html">{Service 4}</a></li>
        </ul>
      </div>
      <div>
        <h4>公司</h4>
        <ul>
          <li><a href="about.html">关于我们</a></li>
          <li><a href="news.html">新闻动态</a></li>
          <li><a href="recruitment.html">人才招聘</a></li>
          <li><a href="consultation.html">联系我们</a></li>
        </ul>
      </div>
      <div>
        <h4>联系</h4>
        <ul>
          <li><a>微信：{wechat_id}</a></li>
          <li><a>邮箱：{email}</a></li>
          <li><a>电话：{phone}</a></li>
          <li><a>QQ：{qq}</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; {Year} {Company} · {English name}. All rights reserved.</span>
      <div style="display:flex;gap:1.5rem">
        <a href="#">营业执照</a>
        <a href="#">隐私政策</a>
        <a href="#">服务条款</a>
      </div>
    </div>
  </div>
</footer>

<!-- Back to top -->
<button class="back-to-top" aria-label="返回顶部">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
</button>

<script src="js/main.js"></script>
</body>
</html>
```

**Rules**:
- Footer ALWAYS has a breathing status dot (green) with city + availability text
- Use `&copy;` not `(c)` for copyright
- Legal links can point to `#` if real pages don't exist yet

---

## Page 1: index.html (Homepage)

**Primary job**: Promise + proof. Make the visitor trust within 10 seconds.

### Section Structure

| # | Section | Class | Layout | Content |
|---|---------|-------|--------|---------|
| 1 | Hero | `.hero` | 2-col grid (text 1.1fr + visual 0.9fr) | Eyebrow (optional), display title, lead paragraph, 2 CTAs, status dot |
| 2 | Trust strip | `.trust-strip` | 4-col grid (stats) | 4 metrics: founded year, team size, projects, industries |
| 3 | Services | `.section` | Bento (6 items, mixed sizes) | 6 service cards with icons, titles, descriptions |
| 4 | Architecture/Tech stack | `.section.dark-slab` | Split (text + layered diagram) | Tech stack layers with tags, visual on right |
| 5 | Industries | `.section` | Grid-3 (or 2x3) | 5 industry cards: icon, title, one-line description |
| 6 | Case studies | `.section` | Zigzag (2 items, alternating) | 2 case studies with image, title, description, 3 metrics each |
| 7 | Testimonial | `.section` | Centered single quote | Client quote, attribution, company |
| 8 | Final CTA | `.section` | Centered text + buttons | Title, subtitle, primary + secondary CTA |

### Key HTML Patterns

**Hero**:
```html
<section class="hero">
  <div class="container">
    <div class="hero-grid">
      <div data-reveal>
        <span class="eyebrow"><span>{Company} / {ENGLISH}</span></span>
        <h1 class="hero-title">{Benefit-led headline, max 2 lines}</h1>
        <p class="lead">{2-3 sentence value prop}</p>
        <div class="btn-group" style="margin-top:2rem">
          <a href="consultation.html" class="btn btn-lg">{Primary CTA} <svg class="arrow">...</svg></a>
          <a href="#cases" class="btn btn-ghost btn-lg">{Secondary CTA}</a>
        </div>
        <div class="mono line-reveal" style="margin-top:2.5rem;display:flex;align-items:center;gap:.6rem">
          <span style="display:flex;align-items:center;gap:.6rem"><span class="dot"></span>{Status text}</span>
        </div>
      </div>
      <div data-reveal="right" data-reveal-delay=".1s">
        <div class="hero-visual">
          <img src="assets/images/hero.jpg" alt="{descriptive alt}" loading="eager" />
        </div>
      </div>
    </div>
  </div>
</section>
```

**Trust Strip**:
```html
<section class="trust-strip" data-stagger>
  <div class="trust-cell">
    <div class="trust-num"><span data-count="{year}">0</span></div>
    <div class="trust-label">成立于{City}</div>
  </div>
  <!-- 3 more cells: team size, projects, industries -->
</section>
```

**Case Study (Zigzag)**:
```html
<div class="zigzag-item">
  <div class="zigzag-text" data-reveal="left">
    <h3 class="h3">{Case title}</h3>
    <p class="body">{2-3 sentence case description}</p>
    <ul class="case-metrics">
      <li><strong>{number}</strong> {metric_label}</li>
      <!-- 2-3 metrics -->
    </ul>
  </div>
  <div data-reveal="right">
    <div class="hero-visual"><img src="assets/images/case-{n}.jpg" alt="{alt}" loading="lazy" /></div>
  </div>
</div>
```

### Content Rules
- Hero headline: benefit-led, not feature-led. "把复杂系统，做成简单体验" not "我们提供软件开发服务"
- Trust numbers: specific, not round. "127+" not "百余"
- Case metrics: 3 per case, each with a number and label
- Eyebrow in hero only. Max 1 more eyebrow on the page (in another section).

---

## Page 2: products.html (Services Detail)

**Primary job**: Depth. Show the engineering rigor behind each service.

### Section Structure

| # | Section | Layout | Content |
|---|---------|--------|---------|
| 1 | Page hero | 1-col (breadcrumb + title + lead) | Title, lead, 2 CTAs |
| 2 | Service bento | Bento (4-6 items, mixed sizes) | Each service: icon, title, description, output tag |
| 3 | Delivery process | Split (text + process card) | 4-step process with numbered steps |
| 4 | Tech stack | `.dark-slab` | Layered architecture with tech tags per layer |
| 5 | FAQ | Grid-2 (Q&A cards) | 6 common questions with answers |

### Key Patterns

**Service Bento Card**:
```html
<article class="card card-spot b-half">
  <h3 class="h3">{Service name}</h3>
  <p>{Service description, 2-3 sentences}</p>
  <span class="card-tag">产出：{deliverables}</span>
</article>
```
**Rules**: Do NOT add a card-tag above the h3 that duplicates the h3 text. The card-tag goes at the bottom and describes the output, not the service name.

**Delivery Process** (in page-hero right column or a dedicated section):
```html
<div class="card" style="background:var(--bg-2)">
  <div class="mono" style="margin-bottom:1.5rem">交付流程 / PROCESS</div>
  <div style="display:flex;flex-direction:column;gap:1.3rem">
    <div style="display:flex;gap:1rem">
      <span style="font-family:var(--font-mono);color:var(--accent);font-size:.78rem;font-weight:600">01</span>
      <div>
        <div style="font-weight:600">{Step name}</div>
        <div style="font-size:.88rem;color:var(--ink-2)">{Step description}</div>
      </div>
    </div>
    <!-- 3 more steps -->
  </div>
</div>
```

---

## Page 3: news.html (News/List)

**Primary job**: Cadence. Show the company is alive and publishing.

### Section Structure

| # | Section | Layout | Content |
|---|---------|--------|---------|
| 1 | Page hero | 1-col | Title, lead |
| 2 | News filter + grid | Filter bar + 3-col grid | Category filter buttons, news cards with date, category, title, excerpt |

### Key Patterns

**News Card**:
```html
<article class="news-card" data-category="{category}">
  <div class="news-card-img"><img src="assets/images/news-{n}.jpg" alt="{alt}" loading="lazy" /></div>
  <div class="news-card-body">
    <div class="news-meta"><span class="tag">{Category}</span><time>{Date}</time></div>
    <h3 class="h3"><a href="#">{News title}</a></h3>
    <p class="body">{Excerpt, 2-3 sentences}</p>
    <a href="#" class="news-link">阅读全文 →</a>
  </div>
</article>
```

**Filter Bar**:
```html
<div class="news-filter" data-reveal>
  <button class="filter-btn active" data-filter="all">全部</button>
  <button class="filter-btn" data-filter="company">公司动态</button>
  <button class="filter-btn" data-filter="tech">技术分享</button>
  <button class="filter-btn" data-filter="industry">行业观察</button>
</div>
```

---

## Page 4: about.html (About Us)

**Primary job**: Trust. Show the people, history, and values behind the company.

### Section Structure

| # | Section | Layout | Content |
|---|---------|--------|---------|
| 1 | Page hero | 2-col (text + team image) | Title, lead, 2 CTAs |
| 2 | Company intro | Split (text + metrics grid) | 3 paragraphs of company story, 4 metric cards |
| 3 | Mission/Vision/Values | `.dark-slab` Bento | 1 wide mission card, 1 tall vision card, 4 half values cards |
| 4 | Timeline | Split (timeline + image) | 6 milestone items: year, title, description |
| 5 | Team composition | Split (text + team grid) | Team breakdown by role with counts |
| 6 | Culture | Grid-2 (4 culture cards) | 4 culture items: title, description |
| 7 | Contact CTA | Centered | Title, lead, button to consultation page |

### Key Patterns

**Mission/Vision Bento (Dark Slab)**:
```html
<section class="section dark-slab">
  <div class="container">
    <div class="section-head"><h2 class="h1">{Section title}</h2></div>
    <div class="bento" data-stagger>
      <article class="dark-card b-wide">
        <div class="mono" style="color:var(--accent-2)">使命 / MISSION</div>
        <h3 class="h2" style="color:#fff">{Mission statement}</h3>
        <p>{Mission description}</p>
      </article>
      <article class="dark-card b-tall">
        <div class="mono" style="color:var(--accent-2)">愿景 / VISION</div>
        <h3 class="h3" style="color:#fff">{Vision statement}</h3>
        <p>{Vision description}</p>
      </article>
      <article class="dark-card b-half">
        <div class="mono" style="color:var(--accent-2)">价值观 01</div>
        <h3 class="h3" style="color:#fff">{Value name}</h3>
        <p>{Value description}</p>
      </article>
      <!-- 3 more value cards -->
    </div>
  </div>
</section>
```
**Rules**: Values use real names ("工程师前置", "诚实交付"), NOT numbered tags ("价值观 01" is acceptable as a mono label, but the h3 MUST be a real name, not "Step 01").

**Timeline**:
```html
<div class="timeline">
  <div class="tl-item">
    <div class="tl-year">{Year}</div>
    <div class="tl-title">{Milestone title}</div>
    <div class="tl-desc">{Description}</div>
  </div>
  <!-- 5 more items -->
</div>
```

---

## Page 5: recruitment.html (Careers)

**Primary job**: Hiring. Make talented people want to join.

### Section Structure

| # | Section | Layout | Content |
|---|---------|--------|---------|
| 1 | Page hero | 2-col (text + culture image) | Title, lead, 2 CTAs (投递简历 + 了解团队) |
| 2 | Open positions | Split (text + positions list) | 4-6 position cards: title, department, location, salary, requirements |
| 3 | Culture | `.dark-slab` Grid-2 | 4 culture cards: title, description |
| 4 | Benefits | Grid-3 | 6 benefit cards: icon, title, description |
| 5 | Interview process | Split (text + process card) | 4-step process: 投递, 初聊, 技术面, Offer |

### Key Patterns

**Position Card**:
```html
<div class="position-card">
  <div class="position-header">
    <h3 class="h3">{Position title}</h3>
    <div class="position-meta">
      <span class="tag">{Department}</span>
      <span class="tag">{Location}</span>
      <span class="tag">{Salary range}</span>
    </div>
  </div>
  <div class="position-body">
    <div class="position-section">
      <h4>职责</h4>
      <ul><li>{Responsibility 1}</li><li>{Responsibility 2}</li></ul>
    </div>
    <div class="position-section">
      <h4>要求</h4>
      <ul><li>{Requirement 1}</li><li>{Requirement 2}</li></ul>
    </div>
  </div>
  <a href="consultation.html" class="btn btn-sm">投递简历</a>
</div>
```
**Rules**: Salary range uses hyphens ("15k-25k"), not em-dashes. Department tags use real names, not "STEP 01".

**Benefits Card**:
```html
<article class="card">
  <div class="card-icon"><svg>...</svg></div>
  <h3 class="h3">{Benefit title}</h3>
  <p>{Benefit description}</p>
</article>
```

---

## Page 6: consultation.html (Contact/Convert)

**Primary job**: Convert. Make it frictionless to reach out.

### Section Structure

| # | Section | Layout | Content |
|---|---------|--------|---------|
| 1 | Page hero | 2-col (text + process card) | Title, lead, 2 CTAs, status dot |
| 2 | Contact channels | Split (channel grid + image) | 4 contact cards: WeChat, QQ, Email, Phone |
| 3 | Consultation form | Form section (bg-2) | Full form: name, company, phone, email, type, message, submit |
| 4 | Service hours | Bento (3-4 cards) | Work hours, response time, holiday policy |
| 5 | FAQ | Grid-2 | 4-6 common questions about the consultation process |

### Key Patterns

**Contact Channel Card**:
```html
<div class="contact-card">
  <div class="cc-icon"><svg>...</svg></div>
  <div>
    <div class="cc-label">{Channel} / {English}</div>
    <div class="cc-value">{Contact value}</div>
  </div>
</div>
```

**Consultation Form** (CRITICAL — padding must be correct):
```html
<section class="section" id="brief" style="background:var(--bg-2)">
  <div class="container">
    <div class="section-head" data-reveal>
      <h2 class="h1">{Form title}</h2>
      <p class="lead">{Form description}</p>
    </div>
    <div data-reveal style="background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:clamp(3.6rem, 2.6rem + 5vw, 5.8rem);box-shadow:var(--shadow-sm)">
      <!-- CRITICAL: clamp() + and - MUST have spaces on both sides -->
      <form id="consult-form" novalidate>
        <div class="form-grid cols-2">
          <!-- Fields: name, company, phone, email, type (full-width), message (full-width), submit (full-width) -->
        </div>
      </form>
    </div>
  </div>
</section>
```

**Form field types**:
- `data-required`: triggers validation
- `data-type="phone"`: phone format validation
- `data-type="email"`: email format validation
- Full-width fields use `style="grid-column:1 / -1"`

---

## Section Layout Variety Rules

To avoid repetitive layouts (AI tell), ensure NO two consecutive sections share the same layout family:

| Layout Family | Examples |
|---------------|----------|
| Full-width centered | hero, CTA, testimonial |
| 2-column split | split, zigzag-item |
| Grid (equal) | grid-2, grid-3 |
| Bento (mixed) | bento with b-wide/b-half/b-tall |
| Dark slab | dark-slab with bento or split inside |
| Trust strip | 4-col stat bar |
| Timeline | vertical timeline |

**Rule**: If section N is a Split, section N+1 must NOT be a Split. Use a Bento, Grid, or Dark Slab instead.

## Content Density Guidelines

- **Homepage**: 8 sections, ~800-1200 words total
- **Products**: 5 sections, ~600-900 words total
- **News**: 2 sections, ~200 words + 6-9 news cards
- **About**: 7 sections, ~1000-1400 words total
- **Recruitment**: 5 sections, ~500-800 words + 4-6 position cards
- **Consultation**: 5 sections, ~300-500 words + form

**Rule**: If a section has fewer than 7 characters in its summary/description, set its quality score to 0. Every description must be substantive.
