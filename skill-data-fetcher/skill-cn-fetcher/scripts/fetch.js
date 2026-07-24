const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'www.skill-cn.com';
const SIZE = 12;
const SORT = 'heat';
const DELAY_MS = 800;
const OUTPUT = path.join(process.cwd(), 'skill-cn-skills.txt');

function fetchJSON(page) {
  return new Promise((resolve, reject) => {
    const urlPath = '/api/skills?page=' + page + '&size=' + SIZE + '&sort=' + SORT;
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

async function main() {
  const allSkills = [];

  // Phase 0: Fetch first page to get totalPages
  console.log('Fetching page 1 to detect totalPages...');
  let totalPages = 1;
  try {
    const first = await fetchJSON(1);
    totalPages = first.totalPages || 1;
    const data = first.data || [];
    for (const s of data) {
      allSkills.push({
        name: sanitizeField(s.name),
        subtitle: '',
        brief: sanitizeField(s.description),
        category: sanitizeField(s.tag),
        url: sanitizeField(s.source_url),
        stars: Math.round((s.heat_score || 0) * 10)
      });
    }
    console.log('Page 1: ' + data.length + ' skills, totalPages=' + totalPages);
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
        allSkills.push({
          name: sanitizeField(s.name),
          subtitle: '',
          brief: sanitizeField(s.description),
          category: sanitizeField(s.tag),
          url: sanitizeField(s.source_url),
          stars: Math.round((s.heat_score || 0) * 10)
        });
      }
      console.log(data.length + ' skills');
    } catch (err) {
      console.log('Error: ' + err.message + ', retrying in 3s...');
      await sleep(3000);
      try {
        const res = await fetchJSON(page);
        const data = res.data || [];
        for (const s of data) {
          allSkills.push({
            name: sanitizeField(s.name),
            subtitle: '',
            brief: sanitizeField(s.description),
            category: sanitizeField(s.tag),
            url: sanitizeField(s.source_url),
            stars: Math.round((s.heat_score || 0) * 10)
          });
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
  let withName = 0, withUrl = 0, withStars = 0;
  for (const s of allSkills) {
    if (s.name) withName++;
    if (s.url) withUrl++;
    if (s.stars) withStars++;
  }

  console.log('\n--- Validation ---');
  console.log('Total: ' + allSkills.length);
  console.log('With name: ' + withName);
  console.log('With URL: ' + withUrl);
  console.log('With stars: ' + withStars);
  console.log('Output: ' + OUTPUT);
}

main().catch(console.error);
