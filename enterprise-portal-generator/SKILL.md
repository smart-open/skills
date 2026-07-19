---
name: "enterprise-portal-generator"
description: "One-click generates a complete 6-page enterprise portal website adapted to any industry. Invoke when user asks to build/create/generate a corporate website, company portal, or business site from company info."
---

# Enterprise Portal Generator

Generates a **complete, production-ready 6-page enterprise portal website** from a single user brief. The output adapts its palette, typography, layout density, and content patterns to the user's industry — no two industries look the same, but all share the same engineering quality and anti-slop discipline.

**Core principle**: One folder, six HTML pages, one CSS design system, one JS interaction layer. Open `index.html` via `file://` or any static server — it just works. No build step, no framework, no CDN dependencies beyond Google Fonts.

## When to Invoke

- User asks to "build a company website" / "做个企业网站" / "生成门户网站"
- User provides company info (name, industry, services) and wants a full site
- User asks for a "corporate portal" / "企业门户" / "公司官网"
- User wants to adapt an existing portal to a different industry

## Output Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| HTML pages | `{output-dir}/{slug}/index.html` + 5 more | 6 pages: index, products, news, about, recruitment, consultation |
| CSS | `{output-dir}/{slug}/css/style.css` | Single design system file with all tokens + components |
| JS | `{output-dir}/{slug}/js/main.js` | Nav toggle, scroll reveal, counters, form validation, back-to-top |
| Favicon | `{output-dir}/{slug}/assets/favicon.svg` | Inline SVG brand mark |
| Hero images | `{output-dir}/{slug}/assets/images/*.jpg` | Generated via GenerateImage tool |

**Naming convention**: `{slug}` = company English name in kebab-case (e.g. `sourcelead`, `acme-corp`). All pages live flat in the slug folder, not nested.

## The 6 Pages

| Page | File | Primary Job |
|------|------|-------------|
| Homepage | `index.html` | Promise + proof: hero, trust strip, services, architecture, industries, cases, testimonial, CTA |
| Products/Services | `products.html` | Depth: service bento, delivery process, tech stack, FAQ |
| News | `news.html` | Cadence: news grid with category filter, featured article |
| About | `about.html` | Trust: intro, mission/vision/values, timeline, team, culture, contact |
| Recruitment | `recruitment.html` | Hiring: open positions, culture, benefits, interview process |
| Consultation | `consultation.html` | Convert: contact channels, consultation form, service hours, FAQ |

## Brief Inference (Read the Room First)

Before generating anything, infer from the user's input and **declare a one-line Design Read**:

> "Reading this as: {industry} {company-type} for {audience}, with a {vibe} language, leaning toward {palette family} + {typography mood}."

### Required input signals (ask if missing)

If the user's brief lacks any of these, ask **one consolidated question** — never a multi-question dump:

1. **Company name** (Chinese + English if available)
2. **Industry** (maps to an industry preset — see `references/industry-presets.md`)
3. **Core services** (3-6 service lines for the products page)
4. **Tone** (professional / approachable / technical / premium / playful)
5. **Differentiator** (one sentence: why pick them over competitors)

### Optional signals (infer if absent)

- Founding year, team size, project count (for trust strip)
- Contact channels (WeChat, QQ, email, phone)
- Office location
- Brand color preference (if user says "blue" or "green", honor it)

## Three Dials

Set these based on the industry preset, then let them drive every layout, motion, and density decision.

- **`DESIGN_VARIANCE`** (1-10): 1 = Perfect Symmetry, 10 = Artsy Chaos. B2B corporate default: 5-7.
- **`MOTION_INTENSITY`** (1-10): 1 = Static, 10 = Cinematic. B2B corporate default: 4-6.
- **`VISUAL_DENSITY`** (1-10): 1 = Airy Gallery, 10 = Packed Cockpit. B2B corporate default: 4-5.

Dial overrides by industry tone:

| Tone | VARIANCE | MOTION | DENSITY |
|------|----------|--------|---------|
| Professional / trust-first (finance, government, medical, legal) | 4-5 | 3-4 | 4-5 |
| Technical / engineering (software, manufacturing, logistics) | 5-7 | 4-6 | 4-5 |
| Premium / brand (luxury, real estate, consulting) | 6-8 | 5-7 | 3-4 |
| Approachable / consumer (retail, education, food) | 6-8 | 5-6 | 3-4 |

## Full Workflow (7 Steps)

### Step 1: Parse Brief & Select Industry Preset

1. Extract the 5 required signals from the user's input
2. Match the industry to a preset in `references/industry-presets.md`
3. If no exact match, blend the two closest presets and document the blend
4. Declare the Design Read line + dial values

### Step 2: Generate Design Tokens

Based on the industry preset, produce the CSS custom properties:

- **Colors**: primary accent, neutral ink scale, background tiers, semantic colors
- **Typography**: display font, body font, mono font; size scale via `clamp()`
- **Spacing**: section padding, card padding, gaps — all via `clamp()` for fluid responsiveness
- **Radii**: one corner-radius system (sm, md, lg, xl)
- **Shadows**: subtle (sm), medium (default), large (hover)
- **Easing**: one primary cubic-bezier for all transitions

See `references/design-system.md` for the full token spec and component CSS.

### Step 3: Build the CSS Design System

Write `css/style.css` following this layer order:

1. **Reset & base** (box-sizing, margin reset, smooth scroll, font smoothing)
2. **Design tokens** (`:root` custom properties)
3. **Typography** (display, h1-h4, body, lead, mono, eyebrow)
4. **Layout primitives** (container, section, split, grid, bento)
5. **Components** (nav, hero, card, zigzag, timeline, form, footer, back-to-top)
6. **Animations** (reveal, line-reveal, stagger, hero-float, breathe, counter)
7. **Responsive** (768px, 480px breakpoints with reduced padding/spacing)

### Step 4: Generate Page Assets

1. **Favicon**: inline SVG brand mark derived from company initials or logo concept
2. **Hero images**: use `GenerateImage` tool with industry-appropriate prompts
   - Homepage hero: abstract representation of the company's craft
   - Page heroes: lighter, scene-specific imagery
   - **CRITICAL**: No hex codes, no text, no watermarks, no UI borders in image prompts
   - Use natural language colors matching the palette
3. **Case images**: for case study cards on homepage

### Step 5: Build 6 HTML Pages

Follow `references/page-architecture.md` for each page's section structure. Shared elements across all pages:

- **Navigation**: brand logo + 6 nav links + CTA button + mobile hamburger
- **Footer**: brand block + 3 link columns + contact + legal row + status dot
- **Back-to-top**: fixed bottom-right, appears after scroll
- **Mobile menu**: slide-down panel with all nav links

### Step 6: Build JS Interactions

Write `js/main.js` with these modules (vanilla JS, no dependencies):

1. **Nav toggle**: hamburger opens/closes mobile menu, aria-expanded sync
2. **Scroll reveal**: `IntersectionObserver` on `[data-reveal]` elements
3. **Stagger**: child elements of `[data-stagger]` get incremental delays
4. **Counters**: `[data-count]` elements animate from 0 to target on reveal
5. **Form validation**: required fields, phone/email format, error messages
6. **Back-to-top**: show/hide on scroll, smooth scroll to top on click
7. **News filter**: category buttons filter news cards (news.html only)

### Step 7: Pre-Flight Checklist & Browser Verification

Run through `references/optimization-checklist.md` mechanically:

1. **Anti-slop audit**: no em-dashes, no AI-purple, no eyebrow soup, no empty bento cells
2. **Engineering audit**: section padding halved, form padding sufficient, clamp syntax valid
3. **Visual polish**: breathing dots, hero gradients, text-wrap balance, scroll-margin-top
4. **Browser verification**: navigate to each page, check computed styles, take screenshots
5. **Responsive check**: resize to 768px and 480px, verify no horizontal scroll

## Routing to References

| Reference | When to load |
|-----------|-------------|
| `references/design-system.md` | Step 2-3: building the CSS |
| `references/industry-presets.md` | Step 1: selecting industry adaptation |
| `references/page-architecture.md` | Step 5: building HTML pages |
| `references/optimization-checklist.md` | Step 7: pre-flight verification |

Load all four references at the start — they are small and cross-referenced.

## Anti-Slop Discipline (Non-Negotiable)

These rules apply to ALL generated sites regardless of industry:

1. **No em-dashes or en-dashes** in any visible text. Use commas, periods, or restructure the sentence.
2. **No AI-purple / blue glow** as default aesthetic. Use industry-appropriate palettes.
3. **Eyebrow restraint**: max 1 eyebrow per 3 sections. Hero counts as 1.
4. **No empty bento cells**. N items to N cells. Remove the grid if fewer than 3 items.
5. **No duplicate CTA intent**. One label per intent per page.
6. **No decorative dots, numbered card-tags, or horizontal scrollers**. Use real names.
7. **No glassmorphism on everything**. Only where materially justified.
8. **No magnetic button effects**. Use gradient sweep on hover instead.
9. **One corner-radius system**. Do not mix 4px with 16px with 24px.
10. **One accent color** across the whole page. Neutrals carry the rest.

See `references/optimization-checklist.md` for the full 60+ item checklist.

## Engineering Conventions

- **`clamp()` syntax**: `+` and `-` MUST have whitespace on both sides. `clamp(2rem, 1rem + 2vw, 4rem)` is valid; `clamp(2rem,1rem+2vw,4rem)` silently fails to 0.
- **Container widths**: `.container` = 1320px, `.container-wide` = 1480px. Do not mix them in the same section (causes left-edge misalignment).
- **Section padding**: `clamp(1.6rem, 0.75rem + 2.5vw, 3rem)` — kept tight for density.
- **Form padding**: `clamp(3.6rem, 2.6rem + 5vw, 5.8rem)` — generous for breathing room.
- **Card hover**: `translateY(-4px)` with shadow elevation. Not -2px (too subtle).
- **Scroll margin**: `scroll-margin-top: 80px` on all `[id]` sections (nav height offset).
- **Text wrap**: `text-wrap: balance` on all headings for even line breaks.
- **Reduced motion**: all non-essential animations wrapped in `@media not all and (prefers-reduced-motion: reduce)`.
- **Fonts**: self-host or Google Fonts via `<link>`. Always include `font-display: swap`.
- **Images**: `loading="lazy"` except hero (eager). Always include descriptive `alt`.

## Content Voice

- **Headlines**: short, declarative, benefit-led. Max 2 lines on desktop.
- **Body**: conversational but professional. Avoid jargon unless the audience is technical.
- **CTAs**: action verb + object. "免费咨询方案" not "了解更多".
- **Trust signals**: specific numbers over vague claims. "127+ 交付项目" not "众多成功案例".
- **Tone match**: if industry is finance/legal, be formal. If education/retail, be warmer.
