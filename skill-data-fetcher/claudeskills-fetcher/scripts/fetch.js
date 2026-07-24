const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://claudeskills.info/api/v1';
const LIMIT = 100;
const DELAY_MS = 1500;
const OUTPUT = path.join(process.cwd(), 'claudeskills-skills.txt');

const ALL_TYPES = [
  'skill', 'subagent', 'plugin', 'command',
  'hook', 'memory-tool', 'automation', 'claude-md-example'
];

function fetchJSON(urlPath) {
  return new Promise((resolve, reject) => {
    const url = BASE_URL + urlPath;
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      timeout: 30000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        https.get(loc.startsWith('http') ? loc : BASE_URL + loc, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
          timeout: 30000
        }, (res2) => {
          let data = '';
          res2.on('data', chunk => data += chunk);
          res2.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
          });
        }).on('error', reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
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
  const skillMap = new Map();

  // Phase 0: Fetch meta
  console.log('Fetching meta information...');
  const meta = await fetchJSON('/meta');
  console.log('Total items: ' + meta.total_items + ', Unique repos: ' + meta.unique_repos);
  console.log('Type counts: ' + JSON.stringify(meta.types));

  // Phase 1: Paginate through each type
  for (const type of ALL_TYPES) {
    const typeCount = (meta.types && meta.types[type]) || 0;
    if (typeCount === 0) {
      console.log('Type "' + type + '": 0 items, skipping.');
      continue;
    }

    let offset = 0;
    let pageNum = 0;
    console.log('\nType "' + type + '": ' + typeCount + ' items');

    while (true) {
      pageNum++;
      process.stdout.write('  page ' + pageNum + ' (offset ' + offset + ')... ');

      try {
        const res = await fetchJSON(
          '/search?q=&type=' + encodeURIComponent(type) + '&limit=' + LIMIT + '&offset=' + offset + '&sort=stars'
        );

        const results = res.results || [];
        let newCount = 0;

        for (const item of results) {
          const slug = item.slug;
          if (!slug || skillMap.has(slug)) continue;

          skillMap.set(slug, {
            name: sanitizeField(item.name),
            subtitle: '',
            brief: sanitizeField(item.description),
            category: sanitizeField(item.category),
            url: (item.source && item.source.url) || '',
            stars: item.stars || 0
          });
          newCount++;
        }

        console.log(results.length + ' returned, ' + newCount + ' new (total unique: ' + skillMap.size + ')');

        if (results.length < LIMIT) break;

        offset += LIMIT;
        await sleep(DELAY_MS);
      } catch (err) {
        console.log('Error: ' + err.message + ', retrying in 5s...');
        await sleep(5000);
        try {
          const res = await fetchJSON(
            '/search?q=&type=' + encodeURIComponent(type) + '&limit=' + LIMIT + '&offset=' + offset + '&sort=stars'
          );
          const results = res.results || [];
          let newCount = 0;
          for (const item of results) {
            const slug = item.slug;
            if (!slug || skillMap.has(slug)) continue;
            skillMap.set(slug, {
              name: sanitizeField(item.name),
              subtitle: '',
              brief: sanitizeField(item.description),
              category: sanitizeField(item.category),
              url: (item.source && item.source.url) || '',
              stars: item.stars || 0
            });
            newCount++;
          }
          console.log('Retry OK: ' + results.length + ' returned, ' + newCount + ' new');
          if (results.length < LIMIT) break;
          offset += LIMIT;
          await sleep(DELAY_MS);
        } catch (err2) {
          console.log('Retry failed: ' + err2.message + ', skipping this page');
          offset += LIMIT;
          await sleep(DELAY_MS);
        }
      }
    }

    // Delay between types
    await sleep(DELAY_MS);
  }

  // Phase 2: Write output
  const lines = [];
  for (const [, skill] of skillMap) {
    lines.push([skill.name, skill.subtitle, skill.brief, skill.category, skill.url, skill.stars].join('\t'));
  }

  fs.writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf-8');

  // Phase 3: Validation
  let withUrl = 0, withCategory = 0, withStars = 0;
  for (const [, s] of skillMap) {
    if (s.url) withUrl++;
    if (s.category) withCategory++;
    if (s.stars) withStars++;
  }

  console.log('\n--- Validation ---');
  console.log('Total unique: ' + skillMap.size);
  console.log('With URL: ' + withUrl);
  console.log('With category: ' + withCategory);
  console.log('With stars: ' + withStars);
  console.log('Output: ' + OUTPUT);
}

main().catch(console.error);
