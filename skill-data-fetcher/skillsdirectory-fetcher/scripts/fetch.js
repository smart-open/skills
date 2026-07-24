const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'www.skillsdirectory.com';
const SORT = 'stars';
const MAX_PAGE = 1000;
const CONCURRENCY = 5;
const DELAY_MS = 300;
const OUTPUT = path.join(process.cwd(), 'skillsdirectory-skills.txt');

function fetchJSON(page) {
  return new Promise((resolve, reject) => {
    const urlPath = '/api/skills?sort=' + SORT + '&page=' + page;
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
    name: sanitizeField(s.name),
    subtitle: '',
    brief: sanitizeField(s.description),
    category: sanitizeField(s.category),
    url: 'https://www.skillsdirectory.com/skills/' + (s.slug || ''),
    stars: s.githubStars || 0
  };
}

async function fetchBatch(pages) {
  const results = await Promise.all(
    pages.map(page =>
      fetchJSON(page).then(res => ({ page, data: res.skills || [] })).catch(err => {
        console.log('  Page ' + page + ' error: ' + err.message);
        return { page, data: [] };
      })
    )
  );
  return results;
}

async function main() {
  const allSkills = [];
  const seenSlugs = new Set();

  // Fetch first page to get total info
  console.log('Fetching page 1...');
  let totalPages = MAX_PAGE;
  try {
    const first = await fetchJSON(1);
    totalPages = Math.min((first.pagination && first.pagination.totalPages) || MAX_PAGE, MAX_PAGE);
    const skills = first.skills || [];
    for (const s of skills) {
      if (!seenSlugs.has(s.slug)) {
        seenSlugs.add(s.slug);
        allSkills.push(mapSkill(s));
      }
    }
    console.log('Page 1: ' + skills.length + ' skills, totalPages=' + (first.pagination && first.pagination.totalPages) + ', capping at ' + totalPages);
  } catch (err) {
    console.error('Failed to fetch page 1: ' + err.message);
    process.exit(1);
  }

  // Fetch remaining pages in batches
  const remainingPages = [];
  for (let p = 2; p <= totalPages; p++) {
    remainingPages.push(p);
  }

  for (let i = 0; i < remainingPages.length; i += CONCURRENCY) {
    const batch = remainingPages.slice(i, i + CONCURRENCY);
    process.stdout.write('Batch ' + (Math.floor(i / CONCURRENCY) + 1) + '/' + Math.ceil(remainingPages.length / CONCURRENCY) + ' (pages ' + batch[0] + '-' + batch[batch.length - 1] + ')... ');

    const results = await fetchBatch(batch);
    let batchNew = 0;
    for (const r of results) {
      for (const s of r.data) {
        if (!seenSlugs.has(s.slug)) {
          seenSlugs.add(s.slug);
          allSkills.push(mapSkill(s));
          batchNew++;
        }
      }
    }
    console.log(batchNew + ' new (total: ' + allSkills.length + ')');

    if (i + CONCURRENCY < remainingPages.length) {
      await sleep(DELAY_MS);
    }
  }

  // Write output
  const lines = allSkills.map(s => {
    return [s.name, s.subtitle, s.brief, s.category, s.url, s.stars].join('\t');
  });

  fs.writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf-8');

  // Validation
  let withName = 0, withUrl = 0, withStars = 0;
  for (const s of allSkills) {
    if (s.name) withName++;
    if (s.url) withUrl++;
    if (s.stars) withStars++;
  }

  console.log('\n--- Validation ---');
  console.log('Total unique: ' + allSkills.length);
  console.log('With name: ' + withName);
  console.log('With URL: ' + withUrl);
  console.log('With stars: ' + withStars);
  console.log('Output: ' + OUTPUT);
}

main().catch(console.error);
