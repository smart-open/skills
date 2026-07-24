---
name: "skillstore-fetcher"
description: "Fetches all skill listings from SkillStore (skillstore.io) API across all paginated results and saves name, subtitle, brief, category, url and stars to a tab-separated file. Invoke when the user wants to query, export or back up SkillStore skills."
---

# SkillStore Skill Fetcher

Fetches the complete skill catalog from SkillStore (skillstore.io) and writes it to a local text file.

## What it does

- Paginates through `https://skillstore.io/api/skills?sort=popular&lang=zh-hans&page={page}`
- Auto-detects `pagination.totalPages` from first response
- Extracts: `name` (displayName), `subtitle` (aiTitle), `brief` (aiDescription), `category`, `url` (slug-based), `stars` (qualityScore * 1000)
- Outputs one skill per line, tab-separated, to `skillstore-skills.txt`

## Usage

Run the helper script from the skill directory:

```bash
node .trae/skills/skillstore-fetcher/scripts/fetch.js
```

The script will:
1. Fetch page 1 to detect total pages
2. Iterate through remaining pages (259 pages, ~3.5 minutes)
3. Map fields per specification
4. Write results to `skillstore-skills.txt` in the current working directory

## Output format

```
name	subtitle	brief	category	url	stars
```

Example line:
```
jira-safe	组织 SAFe Jira 工作流	在 Jira 中进行 SAFe 规划时，很难在史诗、故事和子任务之间保持一致。此技能为 Jira 问题创建结构化工作流更新提供结构化模板和脚本。	productivity	https://skillstore.io/zh-hans/skills/01000001-01001110-jira-safe	38000
```

## Field Mapping

| Output Field | Source Field | Transformation |
|-------------|-------------|----------------|
| name | displayName | sanitize |
| subtitle | aiTitle | sanitize |
| brief | aiDescription | sanitize |
| category | category | sanitize |
| url | slug | `https://skillstore.io/zh-hans/skills/` + slug |
| stars | qualityScore | qualityScore * 1000 |

## Parameters

- `sort` — sort field (default: `popular`)
- `lang` — language (default: `zh-hans`)
- `delayMs` — delay between pages in ms (default: 800)
