const fs = require('node:fs/promises');
const path = require('node:path');
const cheerio = require('cheerio');
const { z } = require('zod');

const START_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const MAX_CATALOGUE_PAGES = 3;
const REQUEST_DELAY_MS = 600;
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const BOOKS_OUTPUT_PATH = path.join(OUTPUT_DIR, 'books.json');
const ERRORS_OUTPUT_PATH = path.join(OUTPUT_DIR, 'errors.json');
const USER_AGENT =
  'FlyRankInternship-A9/1.0 (+https://github.com/reyjoypsabino/polite-web-scraper)';
const TIMEOUT_MS = 10000;

let liveFetchCount = 0;

// Schema defining a valid, normalized book record
const BookRecordSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  product_url: z.string().url().startsWith('https://'),
  price_text: z.string().min(1, 'Raw price text is required'),
  price_gbp: z.number().nonnegative().finite(),
  availability_text: z.string().min(1, 'Availability text is required'),
  rating_text: z.string().min(1, 'Rating text is required'),
  description: z.string().min(1).nullable(),
  source_page: z.string().url().startsWith('https://'),
  fetched_at: z.string().datetime(),
});

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

function getBookCachePath(productUrl) {
  const pathname = new URL(productUrl).pathname;
  const slug = pathname
    .replace(/^\/catalogue\//, '')
    .replace(/\/index\.html$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CACHE_DIR, 'books', `${slug}.html`);
}

function parseBookDetail(html, bookEntry) {
  const $ = cheerio.load(html);

  const product = $('article.product_page');
  const mainInfo = product.find('div.product_main');

  const title = mainInfo.find('h1').text().trim();
  const price_text = mainInfo.find('p.price_color').text().trim();
  const availability_text = mainInfo
    .find('p.instock.availability')
    .text()
    .replace(/\s+/g, ' ')
    .trim();

  const ratingClasses = (mainInfo.find('p.star-rating').attr('class') || '').split(/\s+/);
  const rating_text = ratingClasses.find((cls) => cls !== 'star-rating') || '';

  const descText = product.find('#product_description').next('p').text().trim();
  const description = descText.length > 0 ? descText : null;

  return {
    title,
    product_url: bookEntry.product_url,
    price_text,
    availability_text,
    rating_text,
    description,
    source_page: bookEntry.source_page,
    fetched_at: new Date().toISOString(),
  };
}

function parsePriceGbp(priceText) {
  const cleaned = priceText.replace(/[^0-9.]/g, '');
  if (!cleaned) return Number.NaN;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : Number.NaN;
}

function normalizeAndValidate(rawRecords) {
  const validByCanonicalUrl = new Map();
  const errors = [];

  for (const raw of rawRecords) {
    const candidate = {
      ...raw,
      price_gbp: parsePriceGbp(raw.price_text),
    };

    const result = BookRecordSchema.safeParse(candidate);
    if (!result.success) {
      errors.push({
        product_url: raw.product_url,
        reason: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        raw_record: raw,
      });
      continue;
    }

    // Deduplicate by canonical product_url for idempotent storage
    validByCanonicalUrl.set(result.data.product_url, result.data);
  }

  return {
    validRecords: Array.from(validByCanonicalUrl.values()),
    errors,
  };
}

async function extractBookDetails(books) {
  const rawRecords = [];

  for (const book of books) {
    const cacheFile = getBookCachePath(book.product_url);
    const { html } = await fetchWithCache(book.product_url, cacheFile);
    const record = parseBookDetail(html, book);
    rawRecords.push(record);
  }

  return rawRecords;
}

async function main() {
  const books = await discoverBooks();
  const rawRecords = await extractBookDetails(books);
  const { validRecords, errors } = normalizeAndValidate(rawRecords);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(BOOKS_OUTPUT_PATH, JSON.stringify(validRecords, null, 2), 'utf8');
  await fs.writeFile(ERRORS_OUTPUT_PATH, JSON.stringify(errors, null, 2), 'utf8');

  console.log(`valid_records=${validRecords.length}, invalid_records=${errors.length}`);
}

main().catch((err) => {
  console.error('Stage 4 failed:', err.message);
  process.exit(1);
});