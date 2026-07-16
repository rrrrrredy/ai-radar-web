import assert from "node:assert/strict";

import {
  buildHtmlHomepageItem,
  discoverHtmlArticleLinks,
  parseHtmlArticle
} from "@/lib/ingestion/fetchers/html";

const indexHtml = `
  <html>
    <head><title>Example AI Blog</title><meta name="description" content="AI product and research updates." /></head>
    <body>
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/privacy">Privacy</a>
        <a href="https://accounts.example.com/login">Sign in</a>
      </nav>
      <main>
        <a href="/blog/2026/07/gpt-red-safety">GPT-Red improves automated model safety testing</a>
        <a href="/blog/2026/07/gpt-red-safety?utm_source=nav">GPT-Red improves automated model safety testing</a>
        <a href="/changelog/2026-07-15-api-tools">API tools add structured agent tracing</a>
        <a href="https://external.example.net/blog/copied-story">A story on another domain must be ignored</a>
        <a href="/tag/ai">Artificial intelligence</a>
      </main>
    </body>
  </html>
`;

const candidates = discoverHtmlArticleLinks(indexHtml, "https://example.com/blog", 10);
assert.deepEqual(
  candidates.map((candidate) => candidate.url),
  [
    "https://example.com/blog/2026/07/gpt-red-safety",
    "https://example.com/changelog/2026-07-15-api-tools"
  ],
  "HTML discovery should keep high-confidence same-domain articles and reject navigation, login and cross-domain links"
);
assert.equal(
  discoverHtmlArticleLinks(indexHtml, "https://example.com/blog", 1).length,
  1,
  "HTML discovery must respect the per-source item limit"
);

const article = parseHtmlArticle(
  `
    <html>
      <head>
        <title>Fallback title</title>
        <meta property="og:title" content="GPT-Red improves automated model safety testing" />
        <meta name="description" content="An independent evaluation of a named safety system." />
        <meta property="article:published_time" content="2026-07-15T10:00:00Z" />
        <link rel="canonical" href="https://example.com/blog/2026/07/gpt-red-safety?utm_campaign=test" />
      </head>
      <body><article><p>This paragraph is deliberately long enough to be retained as article evidence for deterministic ingestion testing and validation.</p></article></body>
    </html>
  `,
  "https://example.com/blog/2026/07/gpt-red-safety"
);
assert.equal(article.title, "GPT-Red improves automated model safety testing");
assert.equal(article.canonicalUrl, "https://example.com/blog/2026/07/gpt-red-safety");
assert.equal(article.publishedAt, "2026-07-15T10:00:00.000Z");
assert.match(article.rawText ?? "", /deterministic ingestion testing/);
assert.equal(article.metadata?.item_kind, "html_article");

const noArticleHtml = `
  <html>
    <head><title>Company documentation</title><meta name="description" content="Product documentation homepage." /></head>
    <body><a href="/privacy">Privacy</a><a href="/account">Account</a></body>
  </html>
`;
assert.equal(
  discoverHtmlArticleLinks(noArticleHtml, "https://docs.example.com/", 3).length,
  0,
  "an index without credible article links must not invent candidates"
);
const fallback = buildHtmlHomepageItem(
  { description: "Fallback description", name: "Example Docs", url: "https://docs.example.com/" },
  noArticleHtml,
  "https://docs.example.com/",
  { candidates: [] }
);
assert.equal(fallback.title, "Company documentation");
assert.equal(fallback.metadata?.item_kind, "raw_html_summary");
assert.equal(fallback.metadata?.link_count, 0);

console.log("HTML fetcher tests passed.");
