const fs = require('node:fs/promises');
const path = require('node:path');
const cheerio = require('cheerio');

const START_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const MAX_CATALOGUE_PAGES = 3;
const REQUEST_DELAY_MS = 600;
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const USER_AGENT =
  'FlyRankInternship-A9/1.0 (+https://github.com/<YOUR_GITHUB_USERNAME>/polite-web-scraper)';
const TIMEOUT_MS = 10000;

let liveFetchCount = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithCache(url, cacheFilePath) {
  try {
    const cachedHtml = await fs.readFile(cacheFilePath, 'utf8');
    console.log(`CACHE HIT | ${url} | size=${Buffer.byteLength(cachedHtml, 'utf8')} bytes`);
    return { html: cachedHtml, fromCache: true };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // Wait >= 0.5s between real network requests (never for cached reads)
  if (liveFetchCount > 0) {
    await sleep(REQUEST_DELAY_MS);
  }

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status !== 200) {
    throw new Error(`Unexpected HTTP status ${response.status} for ${url}`);
  }

  const html = await response.text();
  liveFetchCount += 1;

  await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
  await fs.writeFile(cacheFilePath, html, 'utf8');

  console.log(`FETCH     | ${url} | status=${response.status} | size=${Buffer.byteLength(html, 'utf8')} bytes`);
  return { html, fromCache: false };
}

async function discoverBooks() {
  let currentUrl = START_URL;
  let pageCount = 0;
  const discovered = [];

  while (currentUrl && pageCount < MAX_CATALOGUE_PAGES) {
    pageCount += 1;
    const cacheFile = path.join(CACHE_DIR, `catalogue-page-${pageCount}.html`);
    const { html } = await fetchWithCache(currentUrl, cacheFile);

    const $ = cheerio.load(html);

    $('article.product_pod h3 a').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const absoluteUrl = new URL(href, currentUrl).href;
        discovered.push({
          product_url: absoluteUrl,
          source_page: currentUrl,
        });
      }
    });

    if (pageCount < MAX_CATALOGUE_PAGES) {
      const nextHref = $('li.next a').attr('href');
      currentUrl = nextHref ? new URL(nextHref, currentUrl).href : null;
    } else {
      currentUrl = null;
    }
  }

  const uniqueByUrl = new Map();
  for (const entry of discovered) {
    if (!uniqueByUrl.has(entry.product_url)) {
      uniqueByUrl.set(entry.product_url, entry);
    }
  }

  const uniqueBooks = Array.from(uniqueByUrl.values());
  console.log(
    `catalogue_pages=${pageCount}, discovered=${discovered.length}, unique_urls=${uniqueBooks.length}`
  );

  return uniqueBooks;
}

async function main() {
  await discoverBooks();
}

main().catch((err) => {
  console.error('Stage 2 failed:', err.message);
  process.exit(1);
});