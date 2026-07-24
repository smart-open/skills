---
name: "agent-skills-fetcher"
description: "Fetches all skill listings from agent-skills.md across 1000 paginated result pages and saves name, brief, url and stars to a file. Invoke when the user wants to query, export or back up agent-skills.md skills."
---

# Agent-Skills.md Skill Fetcher

Fetches the complete skill catalog from agent-skills.md and writes it to a local text file.

## What it does

- Paginates through `https://agent-skills.md/?page={page}` (pages 1-1000)
- Parses HTML `<main>` content to extract skill cards
- Each `<a>` card contains: `<h3>` (name), `<p>` (description), star `<span>` (stars)
- Extracts: `name`, `subtitle` (empty), `brief`, `category` (empty), `url`, `stars`
- De-duplicates by full URL
- Outputs one skill per line, tab-separated, to `agent-skills.txt`

## Usage

Run the helper script from the skill directory:

```bash
node .trae/skills/agent-skills-fetcher/scripts/fetch.js
```

The script will:
1. Iterate pages 1 through 1000
2. Extract skill cards from `<main>` HTML
3. De-duplicate by full URL
4. Write results to `agent-skills.txt` in the current working directory
5. Stop early if a page returns 0 skills

## Output format

```
name\tsubtitle\tbrief\tcategory\turl\tstars
```

Example line:
```
github\t\tGitHub operations via `gh` CLI: issues, PRs, CI runs...\thttps://agent-skills.md/skills/steipete/clawdis/github\t341,754
```

## Parameters

- `maxPage` — last page to fetch (default: 1000)
- `outputFile` — destination path (default: `./agent-skills.txt`)
- `delayMs` — delay between pages in ms (default: 1500)
