# Polite Web Scraper

A polite Node.js web scraping pipeline (`fetch` + `Cheerio` + `Zod`) built for FlyRank Backend Track Assignment `BE-05` (`W5 · A9`). It crawls the first three catalogue pages of Books to Scrape, extracts and normalizes 60 book records, validates them against a strict schema, isolates page failures without crashing, and writes a structured run report.

---

## 1. Target Classification

- **Target Site:** [Books to Scrape](https://books.toscrape.com/) (introduced at [toscrape.com](https://toscrape.com/))
- **Why This Target:** The site explicitly states on its homepage that it is a public practice sandbox created specifically for learning and testing web scraping.
- **Scope (How Much):** The first **3 catalogue pages** only (`page-1.html` through `page-3.html`), totaling **60 book detail pages**.
- **Data Collected:** Public book catalogue metadata (`title`, `product_url`, `price_text`, `price_gbp`, `availability_text`, `rating_text`, `description`) plus provenance fields (`source_page`, `fetched_at`).
- **`robots.txt` Result:** Requested `/robots.txt` once and received `404 Not Found` (no robots file found). A missing `robots.txt` file is not permission on its own; authorization comes solely from the site's explicit sandbox purpose, and requests are still throttled politely.
- **Scope & Reuse Rule:** I will not reuse this code on another site without checking its rules and terms first.

---

## 2. Lane, Installation & Run Command

- **Technical Lane:** JavaScript (`Node.js 20+`, built-in `fetch`, `Cheerio`, `Zod`, built-in `fs/promises`)

### Install Dependencies
```bash
cd scraper
npm install
```

### Run the Scraper (Copy-Pasteable Command)
```bash
node src/index.js
```
*(Optional failure-resilience test with 1 simulated `404` URL: `node src/index.js --test-failure`)*

### Outputs Generated
- `output/books.json` — Idempotent, schema-validated canonical book records (`60` records)
- `output/errors.json` — Records that failed Zod schema validation with issue details
- `output/run-report.json` — Summary metrics from the run

---

## 3. Record Schema (`output/books.json`)

Every record is validated with **Zod** (`BookRecordSchema`) before storage:

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `title` | `string` | Yes | Book title extracted from `div.product_main h1` |
| `product_url` | `string` (`https://` URL) | Yes | Canonical absolute URL of the book detail page |
| `price_text` | `string` | Yes | Raw price string as displayed on the page (e.g. `"£51.77"`) |
| `price_gbp` | `number` | Yes | Parsed numeric GBP price rounded to 2 decimal places (e.g. `51.77`) |
| `availability_text` | `string` | Yes | Normalized stock availability string (e.g. `"In stock (22 available)"`) |
| `rating_text` | `string` | Yes | Star rating text extracted from CSS class (e.g. `"Three"`) |
| `description` | `string \| null` | Nullable | Product description text, or `null` when absent on the page |
| `source_page` | `string` (`https://` URL) | Yes | Catalogue page URL where the book link was discovered |
| `fetched_at` | `string` (ISO 8601) | Yes | UTC timestamp recording when the record was extracted |

---

## 4. Politeness Rules & Architecture Notes

- **Honest `User-Agent`:** Identifies the internship project and links back to this GitHub repository on every HTTP request.
- **Rate Limiting:** Enforces a minimum `600ms` delay (`>= 0.5s`) between live network requests; cached reads incur zero delay.
- **Request Timeouts:** Every `fetch` call uses `AbortSignal.timeout(10000)` (`10s`) so stalled connections never hang indefinitely.
- **Local HTML Cache (`cache/`):** Saves downloaded HTML to `cache/` (excluded from Git via `.gitignore`) so repeated development runs read from disk (`CACHE HIT`) instead of re-fetching from the server.
- **Targeted Retries:** Retries transient timeouts or `5xx` server errors at most once after `1000ms`, and never retries `404` or `403` responses.
- **Why No Headless Browser Was Needed:** This assignment needed no headless browser because all book data is already present in the static HTML the server sends, so launching a browser would only add CPU, memory, and latency cost.
- **Honest Limitation:** Extraction relies on CSS selectors tied to Books to Scrape's current HTML structure (`article.product_pod` and `article.product_page`) and assumes GBP (`£`) currency formatting, so layout or currency changes on the site would require selector and parser updates.

---

## 5. Sample Run Report (`output/run-report.json`)

```json
{
  "started_at": "2026-11-13T02:56:59.841Z",
  "finished_at": "2026-11-13T02:57:00.171Z",
  "duration_ms": 330,
  "pages_fetched": 0,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0,
  "failures": []
}
```

---

## 6. Ethics Note

Responsible web scraping means treating external servers as shared resources rather than free APIs: always check for and use an official API when one exists, respect site boundaries by never bypassing logins, paywalls, rate limits, or blocks, and collect only the minimal public data needed for the task.