---
name: "skill-cn-fetcher"
description: "Fetches all skill listings from Skill-CN (skill-cn.com) with pagination and saves name, brief, category, url and stars to a file. Invoke when the user wants to query, export or back up Skill-CN skills."
---

# Skill-CN Skill Fetcher

Fetches the complete skill catalog from Skill-CN (skill-cn.com) and writes it to a local text file.

## What it does

- Paginates through `https://www.skill-cn.com/api/skills?page={page}&size=12&sort=heat`
- Auto-detects `totalPages` from first response
- Extracts: `name`, `subtitle` (empty), `brief` (description), `category` (tag), `url` (source_url), `stars` (heat_score * 10, rounded)
- Outputs one skill per line, tab-separated, to `skill-cn-skills.txt`

## Usage

Run the helper script from the skill directory:

```bash
node .trae/skills/skill-cn-fetcher/scripts/fetch.js
```

The script will:
1. Fetch page 1 to detect total pages
2. Iterate through remaining pages
3. Map fields as specified
4. Write results to `skill-cn-skills.txt` in the current working directory

## Output format

```
name\tsubtitle\tbrief\tcategory\turl\tstars
```

Example line:
```
skill-creator\t\t指导用户如何创建、组织和发布高质量的 Skills\t编程\thttps://github.com/anthropics/skills/tree/main/skills/skill-creator\t629721
```

## Parameters

- `outputFile` — destination path (default: `./skill-cn-skills.txt`)
- `size` — items per page (default: 12)
- `sort` — sort field (default: `heat`)
- `delayMs` — delay between pages in ms (default: 800)
