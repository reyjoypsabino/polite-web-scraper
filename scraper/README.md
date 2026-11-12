# Polite Web Scraper

A polite Node.js web scraping pipeline (`fetch` + `Cheerio` + `Zod`) built for FlyRank Backend Track Assignment `BE-05` (`W5 · A9`).

## Target Classification

- **Target Site:** [Books to Scrape](https://books.toscrape.com/) (introduced at [toscrape.com](https://toscrape.com/))
- **Why This Target:** The site explicitly states that it is a public practice sandbox created for learning and testing web scraping.
- **Scope (How Much):** The first **3 catalogue pages** only (`page-1.html` through `page-3.html`), totaling **60 book detail pages**.
- **Data Collected:** Public book catalogue metadata (`title`, `product_url`, `price_text`, `price_gbp`, `availability_text`, `rating_text`, `description`) plus provenance fields (`source_page`, `fetched_at`).
- **`robots.txt` Result:** Requested `/robots.txt` once and received `404 Not Found` (no robots file found). A missing `robots.txt` file is not permission on its own; authorization comes solely from the site's explicit sandbox purpose, and requests are still throttled politely.
- **Scope & Reuse Rule:** I will not reuse this code on another site without checking its rules and terms first.