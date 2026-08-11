import assert from "node:assert/strict";

import {
  canonicalizeUrl,
  collectSource,
  discoverArticleLinks,
  parseFeed,
  parseHtmlArticle
} from "../supabase/functions/radar-cloud-refresh/parser";

const feed = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>OpenAI releases a new model for developers</title>
    <link>https://example.com/news/model?utm_source=rss</link>
    <pubDate>Tue, 11 Aug 2026 01:15:00 GMT</pubDate>
    <description><![CDATA[The new model adds stronger tool use and lower latency for API applications.]]></description>
  </item>
  <item>
    <title>Research benchmark measures agent reliability</title>
    <link>https://example.com/research/agent-benchmark</link>
    <pubDate>Mon, 10 Aug 2026 23:00:00 GMT</pubDate>
    <description>A new benchmark evaluates long-running AI agents across realistic tasks.</description>
  </item>
</channel></rss>`;

const parsedFeed = parseFeed(feed, 3);
assert.equal(parsedFeed.length, 2);
assert.equal(parsedFeed[0]?.url, "https://example.com/news/model");
assert.equal(parsedFeed[0]?.publishedAt, "2026-08-11T01:15:00.000Z");

const html = `
<!doctype html>
<html>
  <head><title>Company updates</title></head>
  <body>
    <a href="/about">About the company</a>
    <a href="/blog/2026/08/new-reasoning-model">Introducing our new reasoning model for production agents</a>
    <a href="/privacy">Privacy policy</a>
  </body>
</html>`;

assert.deepEqual(
  discoverArticleLinks(html, "https://example.com/blog/", 3),
  ["https://example.com/blog/2026/08/new-reasoning-model"]
);

const article = parseHtmlArticle(`
<html>
  <head>
    <meta property="og:title" content="Introducing Model X">
    <meta name="description" content="Model X improves tool use, reliability, and inference efficiency.">
    <meta property="article:published_time" content="2026-08-11T01:05:00Z">
    <link rel="canonical" href="https://example.com/blog/model-x?utm_campaign=launch">
  </head>
</html>`, "https://example.com/blog/model-x");

assert.equal(article?.title, "Introducing Model X");
assert.equal(article?.url, "https://example.com/blog/model-x");
assert.equal(article?.publishedAt, "2026-08-11T01:05:00.000Z");

async function testCollection() {
  let attempts = 0;
  const result = await collectSource({
    id: "00000000-0000-4000-8000-000000000001",
    slug: "example-feed",
    name: "Example AI",
    url: "https://example.com/",
    rss_url: "https://example.com/feed.xml",
    crawl_method: "rss",
    category: "official_company",
    type: "official_blog",
    language: "en",
    topics: ["models"],
    tags: ["official"],
    source_tier: 1,
    weight: 0.95
  }, 3, async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response("temporary", { status: 503 });
    }
    return new Response(feed, { status: 200 });
  });

  assert.equal(attempts, 2);
  assert.equal(result.fetch_succeeded, true);
  assert.equal(result.items.length, 2);
  assert.ok((result.items[0]?.overall_score || 0) >= 0.8);
  assert.ok(result.items[0]?.why_it_matters.includes("Example AI"));

  assert.equal(
    canonicalizeUrl("https://example.com/a/?utm_source=x&keep=yes#section"),
    "https://example.com/a?keep=yes"
  );

  console.log("Radar cloud parser test passed.");
}

testCollection().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
