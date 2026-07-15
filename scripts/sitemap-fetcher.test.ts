import assert from "node:assert/strict";

import {
  parseSitemapArticle,
  parseSitemapEntries
} from "@/lib/ingestion/fetchers/sitemap";

const sitemap = `
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://www.anthropic.com/news/older-item</loc><lastmod>2026-07-13T10:00:00Z</lastmod></url>
    <url><loc>https://www.anthropic.com/research/not-news</loc><lastmod>2026-07-15T10:00:00Z</lastmod></url>
    <url><loc>https://www.anthropic.com/news/new-item</loc><lastmod>2026-07-14T10:00:00Z</lastmod></url>
    <url><loc>https://example.com/news/external</loc><lastmod>2026-07-15T12:00:00Z</lastmod></url>
    <url><loc>https://www.anthropic.com/news</loc><lastmod>2026-07-15T11:00:00Z</lastmod></url>
  </urlset>
`;

const entries = parseSitemapEntries(sitemap, "https://www.anthropic.com/news");
assert.deepEqual(
  entries.map((entry) => entry.url),
  [
    "https://www.anthropic.com/news/new-item",
    "https://www.anthropic.com/news/older-item"
  ]
);

const article = parseSitemapArticle(
  `
    <html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="Claude for Teachers" />
      <meta name="description" content="Anthropic introduces a new education product." />
      <meta property="article:published_time" content="2026-07-14T17:00:00Z" />
      <link rel="canonical" href="https://www.anthropic.com/news/claude-for-teachers" />
    </head><body><main>
      <p>Anthropic is launching Claude for Teachers with classroom planning tools and education-specific safeguards for schools.</p>
      <p>The release includes implementation guidance for administrators and a staged rollout for verified educators.</p>
    </main></body></html>
  `,
  "https://www.anthropic.com/news/claude-for-teachers?ref=sitemap",
  "2026-07-14T18:00:00Z"
);

assert.equal(article.title, "Claude for Teachers");
assert.equal(article.url, "https://www.anthropic.com/news/claude-for-teachers");
assert.equal(article.publishedAt, "2026-07-14T17:00:00.000Z");
assert.equal(article.summary, "Anthropic introduces a new education product.");
assert.match(article.rawText ?? "", /classroom planning tools/);
assert.ok(Number(article.metadata?.article_excerpt_chars) > 200);

console.log("Sitemap fetcher tests passed");
