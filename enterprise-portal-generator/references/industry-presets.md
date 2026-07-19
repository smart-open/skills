# Industry Presets Reference

12 industry presets that adapt palette, typography, layout density, content patterns, and hero imagery. Load this when selecting industry adaptation in Step 1.

## How to Use

1. Match the user's industry to the closest preset below
2. If no exact match, blend the two closest presets (e.g., "fintech" = Finance + Software/Tech)
3. Extract: accent colors, typography mood, dial values, content patterns, hero image style
4. Honor user's explicit color preference if they name one ("we want green")

## Preset Table

| # | Industry | Accent | Mood | Variance | Motion | Density |
|---|----------|--------|------|----------|--------|---------|
| 1 | Software/Tech | Blue `#2E67E0` | Trust + tech | 6 | 5 | 4 |
| 2 | Finance/Fintech | Teal `#0F766E` | Stability + growth | 5 | 4 | 5 |
| 3 | Medical/Healthcare | Teal-cyan `#0D9488` | Health + calm | 5 | 3 | 4 |
| 4 | Manufacturing/Industrial | Burnt orange `#C2410C` | Industrial + energy | 6 | 4 | 5 |
| 5 | Retail/E-commerce | Rose `#BE185D` | Vibrant + commerce | 7 | 5 | 3 |
| 6 | Government/Public | Deep blue `#1E40AF` | Authority + trust | 4 | 3 | 5 |
| 7 | Education/Training | Violet `#7C3AED` | Knowledge + curiosity | 6 | 4 | 4 |
| 8 | Legal/Professional | Amber-bronze `#854D0E` | Heritage + gravitas | 5 | 3 | 4 |
| 9 | Real Estate/Property | Forest `#166534` | Growth + property | 6 | 5 | 3 |
| 10 | Consulting/Advisory | Navy `#1E3A5F` | Premium + strategic | 6 | 5 | 4 |
| 11 | Logistics/Supply Chain | Deep rose `#9F1239` | Motion + urgency | 6 | 5 | 5 |
| 12 | Energy/Cleantech | Amber `#B45309` | Power + warmth | 6 | 5 | 4 |

---

## Detailed Presets

### 1. Software/Tech (Default)

```yaml
accent: "#2E67E0"
accent_2: "#5B89F0"
typography: "Noto Sans SC (CN) / Geist (EN) + JetBrains Mono"
tone: "technical, confident, no-fluff"
density: "compact bento grids, code snippets, architecture diagrams"
hero_style: "abstract tech imagery: code blocks, network nodes, layered architecture"
services_template:
  - "企业应用定制开发"
  - "SaaS 产品研发"
  - "系统集成"
  - "技术咨询"
  - "UI/UX 设计"
  - "运维与持续演进"
trust_signals: ["founded_year", "team_size", "projects_delivered", "industries_covered"]
case_metrics: ["delivery_weeks", "concurrency_multiplier", "data_accuracy"]
cta_primary: "免费咨询方案"
cta_secondary: "查看客户案例"
```

### 2. Finance/Fintech

```yaml
accent: "#0F766E"
accent_2: "#14B8A6"
typography: "Noto Sans SC (CN) / Inter (EN) + JetBrains Mono"
tone: "formal, precise, trust-first"
density: "data tables, compliance badges, rate cards"
hero_style: "clean financial dashboards, abstract growth curves, secure vault imagery"
services_template:
  - "风控系统开发"
  - "支付与清结算"
  - "数据中台与监管报送"
  - "智能投研平台"
  - "开放银行 API 网关"
  - "合规与审计系统"
trust_signals: ["licenses", "transaction_volume", "uptime_sla", "audit_certifications"]
case_metrics: ["transaction_tps", "risk_detection_rate", "compliance_pass_rate"]
cta_primary: "预约合规咨询"
cta_secondary: "查看金融案例"
special: "Must include risk disclaimer in footer. License numbers prominently displayed."
```

### 3. Medical/Healthcare

```yaml
accent: "#0D9488"
accent_2: "#2DD4BF"
typography: "Noto Sans SC (CN) / Inter (EN) + JetBrains Mono"
tone: "calm, reassuring, professional"
density: "moderate, clean cards, certification badges"
hero_style: "clean medical environments, abstract health data, caring imagery (no graphic medical procedures)"
services_template:
  - "HIS/EMR 系统开发"
  - "互联网医院平台"
  - "慢病管理系统"
  - "医疗数据中台"
  - "AI 辅助诊断"
  - "医保结算系统"
trust_signals: ["hipaa_compliance", "iso_certification", "hospital_partners", "data_security"]
case_metrics: ["patient_satisfaction", "diagnosis_accuracy", "system_uptime"]
cta_primary: "预约方案咨询"
cta_secondary: "查看医疗案例"
special: "Privacy and data security prominently featured. No patient data in case studies."
```

### 4. Manufacturing/Industrial

```yaml
accent: "#C2410C"
accent_2: "#F97316"
typography: "Noto Sans SC (CN) / Satoshi (EN) + JetBrains Mono"
tone: "practical, robust, no-nonsense"
density: "dense spec sheets, equipment grids, process diagrams"
hero_style: "factory floors, IoT dashboards, robotics, production lines (warm industrial lighting)"
services_template:
  - "MES 制造执行系统"
  - "设备物联与远程运维"
  - "智能排产与调度"
  - "质量追溯与良率分析"
  - "供应链协同平台"
  - "数字孪生与产线仿真"
trust_signals: ["factory_connections", "equipment_online", "efficiency_gain", "cost_reduction"]
case_metrics: ["equipment_count", "fault_detection_time", "efficiency_improvement"]
cta_primary: "申请产线诊断"
cta_secondary: "查看智造案例"
```

### 5. Retail/E-commerce

```yaml
accent: "#BE185D"
accent_2: "#EC4899"
typography: "Noto Sans SC (CN) / Cabinet Grotesk (EN) + JetBrains Mono"
tone: "vibrant, approachable, conversion-focused"
density: "airy product showcases, lifestyle imagery, bright cards"
hero_style: "lifestyle retail scenes, shopping experiences, vibrant product photography"
services_template:
  - "全渠道商城系统"
  - "会员中台与营销自动化"
  - "智慧门店与 POS"
  - "供应链与仓储管理"
  - "数据驱动的选品平台"
  - "直播电商系统"
trust_signals: ["gmv_processed", "merchants_served", "conversion_uplift", "peak_orders"]
case_metrics: ["gmv_growth", "conversion_rate", "peak_order_tps"]
cta_primary: "开启增长对话"
cta_secondary: "查看零售案例"
```

### 6. Government/Public Sector

```yaml
accent: "#1E40AF"
accent_2: "#3B82F6"
typography: "Noto Sans SC (CN) / Inter (EN) + JetBrains Mono"
tone: "formal, authoritative, accessibility-first"
density: "structured, text-heavy, clear hierarchy, high contrast"
hero_style: "clean civic imagery, public service scenes, abstract government tech (no political figures)"
services_template:
  - "一网通办平台"
  - "数据共享与交换"
  - "信创适配与迁移"
  - "智慧城市大脑"
  - "政务协同办公"
  - "公共数据开放平台"
trust_signals: ["security_level", "compliance_certifications", "government_partners", "system_scale"]
case_metrics: ["citizen_coverage", "processing_efficiency", "data_integration_count"]
cta_primary: "咨询合作意向"
cta_secondary: "查看政务案例"
special: "Must include 信创 compliance mentions. Accessibility WCAG 2.1 AA minimum."
```

### 7. Education/Training

```yaml
accent: "#7C3AED"
accent_2: "#A78BFA"
typography: "Noto Sans SC (CN) / Cabinet Grotesk (EN) + JetBrains Mono"
tone: "warm, curious, approachable"
density: "moderate, card-based course grids, timeline schedules"
hero_style: "learning environments, abstract knowledge imagery, student collaboration scenes"
services_template:
  - "在线教育平台"
  - "智慧校园系统"
  - "学习管理与课程分发"
  - "AI 个性化学习"
  - "考试与认证系统"
  - "教育资源中台"
trust_signals: ["students_served", "institutions", "course_count", "completion_rate"]
case_metrics: ["learning_outcome", "engagement_rate", "scale_reached"]
cta_primary: "聊聊你的教育场景"
cta_secondary: "查看教育案例"
```

### 8. Legal/Professional Services

```yaml
accent: "#854D0E"
accent_2: "#D97706"
typography: "Noto Sans SC (CN) / Playfair Display (EN) + JetBrains Mono"
tone: "formal, heritage, gravitas"
density: "text-focused, document-style layout, serif accents for headings"
hero_style: "clean office interiors, abstract justice imagery, professional consultation scenes"
services_template:
  - "合同管理与审查系统"
  - "案件管理平台"
  - "法律知识库与检索"
  - "电子签章与存证"
  - "合规风控系统"
  - "律师协作工具"
trust_signals: ["cases_handled", "law_firm_partners", "data_security", "years_experience"]
case_metrics: ["efficiency_gain", "review_accuracy", "time_saved"]
cta_primary: "预约专业咨询"
cta_secondary: "查看服务领域"
special: "Serif font acceptable for headings (heritage feel). Must include disclaimer."
```

### 9. Real Estate/Property

```yaml
accent: "#166534"
accent_2: "#16A34A"
typography: "Noto Sans SC (CN) / Satoshi (EN) + JetBrains Mono"
tone: "premium, aspirational, growth-focused"
density: "airy, large imagery, spacious cards"
hero_style: "architectural photography, property renderings, aerial views (golden hour lighting)"
services_template:
  - "智慧物业平台"
  - "房产交易系统"
  - "长租公寓管理"
  - "商业地产运营"
  - "智能家居集成"
  - "资产数字化管理"
trust_signals: ["properties_managed", "transaction_volume", "user_satisfaction", "operational_efficiency"]
case_metrics: ["occupancy_rate", "transaction_speed", "cost_reduction"]
cta_primary: "了解合作模式"
cta_secondary: "查看地产案例"
```

### 10. Consulting/Advisory

```yaml
accent: "#1E3A5F"
accent_2: "#3B5F8A"
typography: "Noto Sans SC (CN) / GT America (EN) + JetBrains Mono"
tone: "premium, strategic, confident"
density: "moderate, insight cards, framework diagrams, clean typography"
hero_style: "abstract strategy imagery, boardroom scenes, clean infographic style"
services_template:
  - "战略咨询与规划"
  - "数字化转型咨询"
  - "组织与流程优化"
  - "技术选型与架构评审"
  - "数据分析与洞察"
  - "实施陪跑与交付"
trust_signals: ["client_retention", "engagement_count", "team_credentials", "industries_served"]
case_metrics: ["roi_improvement", "transformation_speed", "cost_optimization"]
cta_primary: "预约战略对话"
cta_secondary: "查看咨询案例"
```

### 11. Logistics/Supply Chain

```yaml
accent: "#9F1239"
accent_2: "#E11D48"
typography: "Noto Sans SC (CN) / Satoshi (EN) + JetBrains Mono"
tone: "dynamic, efficient, real-time"
density: "dense data grids, route maps, timeline tracking"
hero_style: "warehouse operations, fleet management, logistics networks (dynamic lighting)"
services_template:
  - "TMS 运输管理系统"
  - "WMS 仓储管理系统"
  - "订单履约平台"
  - "供应链可视化"
  - "跨境物流系统"
  - "智能调度与路径优化"
trust_signals: ["shipments_processed", "warehouses_connected", "on_time_rate", "cost_savings"]
case_metrics: ["delivery_speed", "accuracy_rate", "cost_per_shipment"]
cta_primary: "优化你的供应链"
cta_secondary: "查看物流案例"
```

### 12. Energy/Cleantech

```yaml
accent: "#B45309"
accent_2: "#F59E0B"
typography: "Noto Sans SC (CN) / Satoshi (EN) + JetBrains Mono"
tone: "warm, powerful, sustainable"
density: "moderate, dashboard-style metrics, infrastructure imagery"
hero_style: "renewable energy installations, grid infrastructure, clean tech (warm golden tones)"
services_template:
  - "能源管理系统"
  - "智能电网平台"
  - "新能源监控与运维"
  - "碳排放追踪与报告"
  - "储能系统管理"
  - "能源数据分析"
trust_signals: ["capacity_managed", "efficiency_improvement", "carbon_reduction", "installations"]
case_metrics: ["energy_saved", "carbon_offset", "efficiency_gain"]
cta_primary: "聊聊你的能源场景"
cta_secondary: "查看能源案例"
```

---

## Blending Rules

When the user's industry doesn't match any preset exactly:

1. **Identify the two closest presets** (e.g., "edtech" = Education + Software/Tech)
2. **Take the accent from the dominant industry** (edtech = Education violet, not Tech blue)
3. **Blend the dial values** by averaging, then round to the dominant industry's side
4. **Merge service templates**, keeping the 4-6 most relevant services
5. **Document the blend** in the Design Read line: "Reading this as: EdTech platform..."

## Custom Color Override

If the user explicitly names a brand color:

1. Honor it as `--accent`
2. Generate a lighter variant for `--accent-2` (mix with white 20-30%)
3. Generate `--accent-soft` as `rgba(accent, 0.1)` and `--accent-softer` as `rgba(accent, 0.05)`
4. Keep all other tokens from the closest industry preset

## Hero Image Prompt Templates

Use these with the `GenerateImage` tool. ALWAYS use natural language colors, NEVER hex codes.

| Industry | Prompt Template |
|----------|----------------|
| Software/Tech | "Abstract software engineering illustration: layered architecture blocks, connected nodes, code fragments floating in space, deep blue and dark charcoal palette, cinematic lighting, no text, no watermark" |
| Finance | "Abstract financial technology illustration: growth curves, secure data vaults, transaction flows, teal and dark navy palette, clean professional lighting, no text, no watermark" |
| Medical | "Clean medical technology illustration: health data visualization, connected care network, calm teal and white palette, soft natural lighting, no text, no watermark" |
| Manufacturing | "Industrial IoT illustration: factory floor with connected sensors, robotics arm, production dashboard, burnt orange and steel grey palette, warm industrial lighting, no text, no watermark" |
| Retail | "Vibrant retail commerce illustration: shopping experience, product cards floating, customer journey map, rose and warm white palette, bright cheerful lighting, no text, no watermark" |
| Government | "Civic technology illustration: connected public services, data flow between departments, deep blue and white palette, clean authoritative lighting, no text, no watermark" |
| Education | "Learning platform illustration: knowledge network, interactive courses, student collaboration, violet and cream palette, warm curious lighting, no text, no watermark" |
| Legal | "Professional legal services illustration: justice scales abstracted, document flow, professional office, amber-bronze and dark charcoal palette, heritage lighting, no text, no watermark" |
| Real Estate | "Architectural property illustration: modern building renderings, aerial city view, key handover, forest green and warm white palette, golden hour lighting, no text, no watermark" |
| Consulting | "Strategic consulting illustration: chess pieces, framework diagrams, boardroom abstract, navy and silver palette, confident professional lighting, no text, no watermark" |
| Logistics | "Logistics network illustration: warehouse with conveyor systems, delivery routes on map, fleet management, deep rose and steel palette, dynamic motion lighting, no text, no watermark" |
| Energy | "Clean energy illustration: solar panels, wind turbines, smart grid, amber and warm grey palette, golden hour lighting, no text, no watermark" |
