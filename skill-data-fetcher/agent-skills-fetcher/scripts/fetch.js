const https = require('https');
const fs = require('fs');
const path = require('path');

const MAX_PAGE = 1000;
const DELAY_MS = 1500;
const OUTPUT = path.join(process.cwd(), 'agent-skills.txt');

function fetchPage(page) {
  return new Promise((resolve, reject) => {
    const url = `https://agent-skills.md/?page=${page}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractMain(html) {
  const start = html.indexOf('<main');
  if (start === -1) return html;
  const end = html.indexOf('</main>', start);
  if (end === -1) return html;
  return html.substring(start, end + 7);
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(str) {
  return decodeEntities(str.replace(/<[^>]+>/g, '').trim());
}

function parseSkills(html) {
  const main = extractMain(html);
  const skills = [];

  // Match each <a> card with href="/skills/..."
  const cardRegex = /<a\s+[^>]*class="group block[^"]*"[^>]*href="(\/skills\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = cardRegex.exec(main)) !== null) {
    const href = m[1];
    const cardHtml = m[2];

    // Extract h3 (name)
    const h3Match = cardHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const name = h3Match ? stripTags(h3Match[1]) : '';

    // Extract p (brief)
    const pMatch = cardHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const brief = pMatch ? stripTags(pMatch[1]).replace(/[\r\n]+/g, ' ') : '';

    // Extract stars: find span containing lucide-star SVG, get text after </svg>
    const starMatch = cardHtml.match(/<span[^>]*>[\s\S]*?lucide-star[\s\S]*?<\/svg>\s*([^<]*)<\/span>/);
    const stars = starMatch ? starMatch[1].trim() : '';

    const url = `https://agent-skills.md${href}`;

    skills.push({
      name,
      subtitle: '',
      brief,
      category: '',
      url,
      stars
    });
  }

  return skills;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const seenUrls = new Set();
  const allSkills = [];

  for (let page = 1; page <= MAX_PAGE; page++) {
    process.stdout.write(`Page ${page}/${MAX_PAGE}... `);
    try {
      const html = await fetchPage(page);
      const skills = parseSkills(html);
      let newCount = 0;
      for (const s of skills) {
        if (!seenUrls.has(s.url)) {
          seenUrls.add(s.url);
          allSkills.push(s);
          newCount++;
        }
      }
      console.log(`${skills.length} cards, ${newCount} new`);

      if (skills.length === 0) {
        console.log('No more skills, stopping.');
        break;
      }

      if (page < MAX_PAGE) await sleep(DELAY_MS);
    } catch (err) {
      console.log(`Error: ${err.message}, retrying in 5s...`);
      await sleep(5000);
      // Retry once
      try {
        const html = await fetchPage(page);
        const skills = parseSkills(html);
        let newCount = 0;
        for (const s of skills) {
          if (!seenUrls.has(s.url)) {
            seenUrls.add(s.url);
            allSkills.push(s);
            newCount++;
          }
        }
        console.log(`Retry OK: ${skills.length} cards, ${newCount} new`);
        if (skills.length === 0) { console.log('No more skills, stopping.'); break; }
        if (page < MAX_PAGE) await sleep(DELAY_MS);
      } catch (err2) {
        console.log(`Retry failed: ${err2.message}, skipping page`);
      }
    }
  }

  const lines = allSkills.map(s => [
    s.name, s.subtitle, s.brief, s.category, s.url, s.stars
  ].join('\t'));

  fs.writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf-8');
  console.log(`\nDone! Wrote ${allSkills.length} unique skills to ${OUTPUT}`);
}

main().catch(console.error);
