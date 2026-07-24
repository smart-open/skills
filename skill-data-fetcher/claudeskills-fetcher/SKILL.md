---
name: "claudeskills-fetcher"
description: "Fetches all skill listings from ClaudeSkills Hub (claudeskills.info) API across all types and paginated results, deduplicates by slug, and saves name, subtitle, brief, category, url and stars to a tab-separated file. Invoke when the user wants to query, export or back up ClaudeSkills skills."
---

# ClaudeSkills Fetcher

Fetches the complete skill catalog from ClaudeSkills Hub (claudeskills.info) and writes it to a local text file.

## What it does

1. Calls `GET /api/v1/meta` to discover total counts and type breakdown
2. For each type (skill, subagent, plugin, command, hook, memory-tool, automation, claude-md-example), paginates through `GET /api/v1/search?type={type}&limit=100&offset={n}&sort=stars`
3. De-duplicates all results by `slug`
4. Extracts: `name`, `subtitle` (empty), `brief` (description), `category`, `url` (source.url), `stars`
5. Outputs one skill per line, tab-separated, to `claudeskills-skills.txt`

## Usage

Run the helper script from the skill directory:

```bash
node .trae/skills/claudeskills-fetcher/scripts/fetch.js
```

The script will:
1. Fetch meta information (total items, type counts)
2. Iterate through all 8 types, paginating with offset=0,100,200,...
3. De-duplicate by slug across all types
4. Write results to `claudeskills-skills.txt` in the current working directory

## Output format

```
name\tsubtitle\tbrief\tcategory\turl\tstars
```

Example line:
```
Code Reviewer\t\tExpert code review subagent.\t\thttps://github.com/ChrisRoyse/610ClaudeSubagents/blob/main/code-reviewer.md\t596
```

## Parameters

- `outputFile` -- destination path (default: `./claudeskills-skills.txt`)
- `delayMs` -- delay between API requests in ms (default: 1500)
- `limit` -- items per page (default: 100, max 100)
