const fs = require('node:fs/promises');
const path = require('node:path');

const PAGE_1_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'catalogue-page-1.html');
const USER_AGENT =
  'FlyRankInternship-A9/1.0 (+https://github.com/<YOUR_GITHUB_USERNAME>/polite-web-scraper)';
const TIMEOUT_MS = 10000;

async function fetchWithCache(url, cacheFilePath) {
  try {
    const cachedHtml = await fs.readFile(cacheFilePath, 'utf8');
    console.log(`CACHE HIT | ${url} | size=${Buffer.byteLength(cachedHtml, 'utf8')} bytes`);
    return cachedHtml;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status !== 200) {
    throw new Error(`Unexpected HTTP status ${response.status} for ${url}`);
  }

  const html = await response.text();
  await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
  await fs.writeFile(cacheFilePath, html, 'utf8');

  console.log(`FETCH     | ${url} | status=${response.status} | size=${Buffer.byteLength(html, 'utf8')} bytes`);
  return html;
}

async function main() {
  await fetchWithCache(PAGE_1_URL, CACHE_FILE);
}

main().catch((err) => {
  console.error('Stage 1 failed:', err.message);
  process.exit(1);
});