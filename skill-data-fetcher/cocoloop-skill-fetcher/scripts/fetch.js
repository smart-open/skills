const https = require('https');
const fs = require('fs');
const path = require('path');

const PAGE_SIZE = 100;
const DELAY_MS = 800;
const OUTPUT = path.join(process.cwd(), 'cocoloop-skill.txt');

function fetchPage(page) {
  return new Promise((resolve, reject) => {
    const url = `https://api.cocoloop.cn/api/v1/store/skills?page=${page}&page_size=${PAGE_SIZE}&sort=downloads&tab=overall`;
    https.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const skills = [];
  const seenIds = new Set();
  let page = 1;

  while (true) {
    process.stdout.write(`Fetching page ${page}... `);
    try {
      const res = await fetchPage(page);
      if (res.code !== 0 || !res.data || !res.data.items) break;
      const items = res.data.items;
      if (items.length === 0) break;

      for (const item of items) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        skills.push({
          name: item.name || '',
          subtitle: item.subtitle || '',
          brief: (item.brief || '').replace(/[\r\n]+/g, ' '),
          category: item.category || '',
          url: `https://hub.cocoloop.cn/skills/${item.id}`,
          stars: item.github_stars || ''
        });
      }
      console.log(`collected ${skills.length}`);
      if (items.length < PAGE_SIZE) break;
      page++;
      await sleep(DELAY_MS);
    } catch (err) {
      console.log(`Error: ${err.message}, retrying...`);
      await sleep(3000);
    }
  }

  const lines = skills.map(s => [
    s.name, s.subtitle, s.brief, s.category, s.url, s.stars
  ].join('\t'));
  fs.writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf-8');
  console.log(`\nDone! Wrote ${skills.length} skills to ${OUTPUT}`);
}

main().catch(console.error);
