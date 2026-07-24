---
name: "skillsdirectory-fetcher"
description: "Fetches skill listings from SkillsDirectory (skillsdirectory.com) API across paginated results and saves name, brief, category, url and stars to a tab-separated file. Invoke when the user wants to query, export or back up SkillsDirectory skills."
---

# SkillsDirectory Skill Fetcher

Fetches the skill catalog from SkillsDirectory (skillsdirectory.com) and writes it to a local text file.

## What it does

- Paginates through `https://www.skillsdirectory.com/api/skills?sort=stars&page={page}`
- Fetches up to 1000 pages (20 items per page, ~20,000 skills)
- De-duplicates by `slug`
- Extracts: `name`, `subtitle` (empty), `brief` (description), `category`, `url` (slug-based), `stars` (githubStars)
- Outputs one skill per line, tab-separated, to `skillsdirectory-skills.txt`

## Usage

Run the helper script from the skill directory:

```bash
node .trae/skills/skillsdirectory-fetcher/scripts/fetch.js
```

The script will:
1. Fetch page 1 to detect total pages
2. Iterate through pages 2-1000 in concurrent batches of 5
3. De-duplicate by slug
4. Write results to `skillsdirectory-skills.txt` in the current working directory

## Output format

```
name\tsubtitle\tbrief\tcategory\turl\tstars
```

Example line:
```
Uncloud\t\tUse when managing an Uncloud cluster — deploying services, configuring Caddy ingress, and managing TLS certificates.\tdata-ai\thttps://www.skillsdirectory.com/skills/affaan-m-uncloud\t193429
```

## Field Mapping

| Output Field | Source Field | Transformation |
|-------------|-------------|----------------|
| name | name | sanitize |
| subtitle | — | empty string |
| brief | description | sanitize |
| category | category | sanitize |
| url | slug | `https://www.skillsdirectory.com/skills/` + slug |
| stars | githubStars | direct value |

## Parameters

- `maxPage` — maximum pages to fetch (default: 1000)
- `concurrency` — concurrent requests per batch (default: 5)
- `delayMs` — delay between batches in ms (default: 300)
