---
name: "skillsmp-skill-fetcher"
description: "Fetches all skill listings from SkillsMP (skillsmp.com) across 8 occupation categories with pagination and saves name, brief, url and stars to a file. Invoke when the user wants to query, export or back up SkillsMP skills."
---

# SkillsMP Skill Fetcher

Fetches the complete skill catalog from SkillsMP (Agent Skills Marketplace) and writes it to a local text file.

## What it does

- Paginates through `https://skillsmp.com/api/skills?page={page}&limit=100&sortBy=stars&occupation={occ}`
- Iterates 8 occupation categories (computer-and-mathematical, business-and-financial, arts-design-entertainment, office-and-administrative, legal, educational-instruction, life-physical-science, management)
- De-duplicates all results by skill `id`
- Extracts: `name`, `subtitle` (empty), `brief` (description), `category` (empty), `url` (githubUrl), `stars`
- Outputs one skill per line, tab-separated, to `skillsmp-skills.txt`

## Important: Cloudflare Protection

SkillsMP is protected by Cloudflare Bot Protection. Direct HTTP requests (Node.js `https.get`, `fetch`) are blocked with HTTP 403. Data must be collected through a browser context where Cloudflare challenge has been passed.

## Usage (Browser-Based Collection)

Since the API requires browser context, there is no standalone `fetch.js` script. Use this workflow:

### Step 1: Navigate to SkillsMP

Navigate the browser to `https://skillsmp.com` and wait for Cloudflare to pass.

### Step 2: Start Local HTTP Server

Start a local HTTP server to receive the collected data:

```bash
node .trae/skills/skillsmp-skill-fetcher/scripts/server.js
```

### Step 3: Inject Collection Script

In the browser, evaluate this JavaScript (uses `var` and `function()` syntax for compatibility):

```javascript
window._td=false;window._t='';
var occs=['computer-and-mathematical-occupations','business-and-financial-operations-occupations','arts-design-entertainment-sports-and-media-occupations','office-and-administrative-support-occupations','legal-occupations','educational-instruction-and-library-occupations','life-physical-and-social-science-occupations','management-occupations'];
var T=String.fromCharCode(9);var N=String.fromCharCode(10);
var ps=[];
for(var i=0;i<occs.length;i++){
  for(var p=1;p<=5;p++){
    ps.push(fetch('/api/skills?page='+p+'&limit=100&sortBy=stars&occupation='+occs[i]).then(function(r){return r.json()}))
  }
}
Promise.all(ps).then(function(rs){
  var seen=new Set();
  for(var i=0;i<rs.length;i++){
    var ss=rs[i].skills||[];
    for(var j=0;j<ss.length;j++){
      var s=ss[j];
      if(!seen.has(s.id)){
        seen.add(s.id);
        var e=String(s.name||'').replace(/\t/g,' ').replace(/[\r\n]+/g,' ').trim();
        var d=String(s.description||'').replace(/\t/g,' ').replace(/[\r\n]+/g,' ').trim();
        var u=String(s.githubUrl||'').replace(/\t/g,' ').replace(/[\r\n]+/g,' ').trim();
        window._t+=e+T+T+d+T+T+u+T+(s.stars||0)+N;
      }
    }
  }
  window._td=true;
});
return 'started';
```

### Step 4: Wait and POST Data

Wait ~10 seconds, then evaluate:

```javascript
return fetch('http://127.0.0.1:34567',{method:'POST',body:window._t,headers:{'Content-Type':'text/plain'}}).then(function(r){return r.text()})
```

The local server writes the data to `skillsmp-skills.txt`.

## Output format

```
name	subtitle	brief	category	url	stars
```

Example line:
```
agent-transcript		Add a redacted agent transcript section to GitHub PR or issue bodies...		https://github.com/openclaw/openclaw/tree/main/.agents/skills/agent-transcript	381980
```

## API Parameters

- `page` — page number (starts at 1, max = `pagination.totalPages`, typically 5)
- `limit` — items per page (100, API caps at 480 per occupation)
- `sortBy` — sort field (`stars` for most starred first)
- `occupation` — one of 8 occupation category slugs

## Notes

- API is Cloudflare-protected: browser context required
- 8 occupations x 5 pages x 100 items = ~4000 raw items, ~3840 after de-duplication
- `subtitle` and `category` are empty (API does not provide these fields)
- `occupation` is a filter dimension, not a field in the skill data
- Uses parallel fetch (40 concurrent requests) for ~5 second total collection time
