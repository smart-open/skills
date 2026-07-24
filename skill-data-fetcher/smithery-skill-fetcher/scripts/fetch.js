const https = require('https');
const fs = require('fs');
const path = require('path');

const DELAY_MS = 3000;
const OUTPUT = path.join(process.cwd(), 'smithery-skills.txt');

function getMaxPage(html) {
  const navMatch = html.match(/<nav[^>]*aria-label="pagination"[\s\S]*?<\/nav>/i);
  if (!navMatch) return 1;
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const items = [];
  let m;
  while ((m = liRegex.exec(navMatch[0])) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text) items.push(text);
  }
  if (items.length < 2) return 1;
  const num = parseInt(items[items.length - 2], 10);
  return isNaN(num) ? 1 : num;
}

function fetchPage(page) {
  return new Promise((resolve, reject) => {
    const url = `https://smithery.ai/skills?page=${page}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractRSCSkills(html) {
  const pushRegex = /self\.__next_f\.push\(\[\d+,\s*"([\s\S]*?)"\s*\]\)/g;
  let combined = '';
  let m;
  while ((m = pushRegex.exec(html)) !== null) combined += m[1];
  if (!combined) return [];

  let str = combined.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const idx = str.indexOf('"skills":[');
  if (idx === -1) return [];

  const start = idx + '"skills":'.length;
  let depth = 1, inString = false, escapeNext = false, end = start;
  for (let i = start + 1; i < str.length; i++) {
    const ch = str[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\') { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
  }
  try { return JSON.parse(str.substring(start, end)); } catch (e) { return []; }
}

function extractHTMLLinks(html) {
  const links = [];
  const aRegex = /<a[^>]*href="(\/skills\/([^"]+))"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = aRegex.exec(html)) !== null) {
    links.push({
      href: m[1],
      fullPath: m[2],
      text: m[3].replace(/<[^>]+>/g, '').trim()
    });
  }
  return links;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Detect max page from first page
  console.log('Detecting max page number...');
  const firstHtml = await fetchPage(1);
  const MAX_PAGE = getMaxPage(firstHtml);
  console.log(`Max page detected: ${MAX_PAGE}\n`);

  // Phase 1: Collect all unique URLs across all pages via HTML links
  const uniqueUrls = new Map(); // fullPath -> { page, order }
  console.log('=== Phase 1: Scanning all pages for unique URLs ===');

  for (let page = 1; page <= MAX_PAGE; page++) {
    process.stdout.write(`Page ${page}/${MAX_PAGE}... `);
    try {
      const html = await fetchPage(page);
      const links = extractHTMLLinks(html);
      let newCount = 0;
      for (const l of links) {
        if (!uniqueUrls.has(l.fullPath)) {
          uniqueUrls.set(l.fullPath, { page, order: uniqueUrls.size });
          newCount++;
        }
      }
      console.log(`${links.length} links, ${newCount} new unique`);
      await sleep(DELAY_MS);
    } catch (err) { console.log(`Error: ${err.message}`); }
  }

  console.log(`\nTotal unique URLs found: ${uniqueUrls.size}`);

  // Phase 2: Re-scan pages to extract RSC JSON details, matching by URL
  console.log('\n=== Phase 2: Extracting details from RSC payloads ===');
  const skillDetails = new Map(); // fullPath -> { slug, description, totalActivations }

  for (let page = 1; page <= MAX_PAGE; page++) {
    process.stdout.write(`Page ${page}/${MAX_PAGE}... `);
    try {
      const html = await fetchPage(page);
      const skills = extractRSCSkills(html);
      let newDetails = 0;
      for (const s of skills) {
        const fp = `${s.namespace}/${s.slug}`;
        if (!skillDetails.has(fp)) {
          skillDetails.set(fp, {
            slug: s.slug || '',
            description: (s.description || '').replace(/[\r\n]+/g, ' '),
            totalActivations: s.totalActivations || ''
          });
          newDetails++;
        }
      }
      console.log(`${skills.length} RSC skills, ${newDetails} new details`);
      await sleep(DELAY_MS);
    } catch (err) { console.log(`Error: ${err.message}`); }
  }

  // Phase 3: Merge - output all unique URLs, enrich with RSC data where available
  console.log(`\n=== Phase 3: Merging ${uniqueUrls.size} URLs with ${skillDetails.size} RSC details ===`);
  const lines = [];
  for (const [fullPath, meta] of uniqueUrls) {
    const parts = fullPath.split('/');
    const name = parts[parts.length - 1] || fullPath;
    const detail = skillDetails.get(fullPath) || {};
    lines.push([
      name,
      '',
      detail.description || '',
      '',
      `https://smithery.ai/skills/${fullPath}`,
      detail.totalActivations || ''
    ].join('\t'));
  }

  fs.writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf-8');
  console.log(`Done! Wrote ${lines.length} unique skills to ${OUTPUT}`);
}

main().catch(console.error);
