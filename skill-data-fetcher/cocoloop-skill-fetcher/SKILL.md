---
name: "cocoloop-skill-fetcher"
description: "Fetches all skill listings from CoCoLoop hub (api.cocoloop.cn) with pagination and saves name, subtitle, brief, category and URL to a file. Invoke when the user wants to query, export or back up CoCoLoop skills."
---

# CoCoLoop Skill Fetcher

Fetches the complete skill catalog from the CoCoLoop store API and writes it to a local text file.

## What it does

- Paginates through `https://api.cocoloop.cn/api/v1/store/skills`
- Extracts: `name`, `subtitle`, `brief`, `category`, `id`
- Builds per-skill page URL: `https://hub.cocoloop.cn/skills/{id}`
- Outputs one skill per line, tab-separated, to `skills.txt`

## Usage

Run the helper script from the skill directory:

```bash
node .trae/skills/cocoloop-skill-fetcher/scripts/fetch.js
```

The script will:
1. Auto-detect total pages from the API
2. Fetch 100 items per page
3. De-duplicate by skill id
4. Write results to `skills.txt` in the current working directory

## Output format

```
name\tsubtitle\tbrief\tcategory\turl
```

Example line:
```
Self-Improving Agent\t让AI记住教训，不再重复犯错\t安全的自改进日志系统...\t专业技能\thttps://hub.cocoloop.cn/skills/12277
```

## Parameters

- `pageSize` — items per page (default: 100)
- `outputFile` — destination path (default: `./skills.txt`)
- `delayMs` — delay between pages in ms (default: 800)
