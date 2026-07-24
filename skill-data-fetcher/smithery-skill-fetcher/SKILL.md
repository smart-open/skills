---
name: "smithery-skill-fetcher"
description: "Fetches all skill listings from Smithery (smithery.ai) across paginated result pages and saves slug, description and URL to a file. Invoke when the user wants to query, export or back up Smithery skills."
---

# Smithery Skill Fetcher

Fetches the complete skill catalog from Smithery and writes it to a local text file.

## What it does

- Paginates through `https://smithery.ai/skills?page={page}`, auto-detecting the last page from pagination nav
- Parses Next.js RSC embedded JSON to extract skill arrays
- Extracts: `slug`, `description`, `namespace`
- Builds per-skill page URL: `https://smithery.ai/skills/{namespace}/{slug}`
- Outputs one skill per line, tab-separated, to `smithery-skills.txt`

## Usage

Run the helper script from the skill directory:

```bash
node .trae/skills/smithery-skill-fetcher/scripts/fetch.js
```

The script will:
1. Fetch page 1 and auto-detect max page from `<nav aria-label="pagination">`
2. Iterate all detected pages
3. Extract skills from `self.__next_f.push` RSC payloads
4. De-duplicate by full URL
5. Write results to `smithery-skills.txt` in the current working directory

## Output format

```
slug\tdescription\turl
```

Example line:
```
cli\tFind, connect, and use MCP tools and skills via the Smithery CLI...\thttps://smithery.ai/skills/smithery-ai/cli
```

## Parameters

- `outputFile` — destination path (default: `./smithery-skills.txt`)
- `delayMs` — delay between pages in ms (default: 1200)
