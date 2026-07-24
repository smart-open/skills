const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'skillstore.io';
const SORT = 'popular';
const LANG = 'zh-hans';
const DELAY_MS = 800;
const OUTPUT = path.join(process.cwd(), 'skillstore-skills.txt');

function fetchJSON(page) {
  return new Promise((resolve, reject) => {
    const urlPath = '/api/skills?sort=' + SORT + '&lang=' + LANG + '&page=' + page;
    const options = {
      hostname: BASE_URL,
      path: urlPath,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      timeout: 30000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function sanitizeField(str) {
  if (!str) return '';
  return String(str).replace(/\t/g, ' ').replace(/[\r\n]+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function mapSkill(s) {
  return {
    name: sanitizeField(s.displayName),
    subtitle: sanitizeField(s.aiTitle),
    brief: sanitizeField(s.aiDescription),
    category: sanitizeField(s.category),
    url: 'https://skillstore.io/zh-hans/skills/' + (s.slug || ''),
    stars: (s.qualityScore || 0) * 1000
  };
}

async function main() {
  const allSkills = [];

  // Phase 0: Fetch first page to get totalPages
  console.log('Fetching page 1 to detect totalPages...');
  let totalPages = 1;
  try {
    const first = await fetchJSON(1);
    totalPages = (first.pagination && first.pagination.totalPages) || 1;
    const data = first.data || [];
    for (const s of data) {
      allSkills.push(mapSkill(s));
    }
    console.log('Page 1: ' + data.length + ' skills, totalPages=' + totalPages + ', total=' + (first.pagination && first.pagination.total));
  } catch (err) {
    console.error('Failed to fetch page 1: ' + err.message);
    process.exit(1);
  }

  // Phase 1: Fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    process.stdout.write('Page ' + page + '/' + totalPages + '... ');
    try {
      await sleep(DELAY_MS);
      const res = await fetchJSON(page);
      const data = res.data || [];
      for (const s of data) {
        allSkills.push(mapSkill(s));
      }
      console.log(data.length + ' skills (total: ' + allSkills.length + ')');
    } catch (err) {
      console.log('Error: ' + err.message + ', retrying in 3s...');
      await sleep(3000);
      try {
        const res = await fetchJSON(page);
        const data = res.data || [];
        for (const s of data) {
          allSkills.push(mapSkill(s));
        }
        console.log('Retry OK: ' + data.length + ' skills');
      } catch (err2) {
        console.log('Retry failed: ' + err2.message + ', skipping page');
      }
    }
  }

  // Phase 2: Write output
  const lines = allSkills.map(s => {
    return [s.name, s.subtitle, s.brief, s.category, s.url, s.stars].join('\t');
  });

  fs.writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf-8');

  // Phase 3: Validation
  let withName = 0, withUrl = 0, withStars = 0, withSubtitle = 0, withCategory = 0;
  for (const s of allSkills) {
    if (s.name) withName++;
    if (s.url) withUrl++;
    if (s.stars) withStars++;
    if (s.subtitle) withSubtitle++;
    if (s.category) withCategory++;
  }

  console.log('\n--- Validation ---');
  console.log('Total: ' + allSkills.length);
  console.log('With name: ' + withName);
  console.log('With subtitle: ' + withSubtitle);
  console.log('With category: ' + withCategory);
  console.log('With URL: ' + withUrl);
  console.log('With stars: ' + withStars);
  console.log('Output: ' + OUTPUT);
}

main().catch(console.error);
