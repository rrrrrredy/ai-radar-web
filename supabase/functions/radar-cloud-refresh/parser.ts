export type CloudSource = {
  id: string;
  slug: string;
  name: string;
  name_en?: string | null;
  url: string;
  rss_url?: string | null;
  github_url?: string | null;
  podcast_url?: string | null;
  crawl_method: string;
  category?: string | null;
  type?: string | null;
  language?: string | null;
  topics?: string[] | null;
  tags?: string[] | null;
  source_tier?: number | null;
  weight?: number | null;
};

export type CloudReaderItem = {
  title: string;
  url: string;
  published_at: string | null;
  summary: string;
  categories: string[];
  tags: string[];
  language: "zh" | "en" | "mixed" | "unknown";
  why_it_matters: string;
  ai_relevance_score: number;
  credibility_score: number;
  novelty_score: number;
  importance_score: number;
  freshness_score: number;
  overall_score: number;
  confidence: number;
};

export type CloudCollectionResult = {
  fetch_succeeded: boolean;
  items: CloudReaderItem[];
  error_message: string | null;
};

type DraftItem = {
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;
};

type FetchTextResult = {
  ok: boolean;
  status: number;
  text: string;
  url: string;
};

const USER_AGENT = "AI-Industry-Radar/1.0 (+https://ai-industry-radar.pages.dev/)";
const MAX_RESPONSE_BYTES = 2_000_000;

export async function collectSource(
  source: CloudSource,
  maxItems = 3,
  fetcher: typeof fetch = fetch
): Promise<CloudCollectionResult> {
  try {
    const drafts = await collectDrafts(source, Math.max(1, Math.min(5, maxItems)), fetcher);
    const unique = dedupeDrafts(drafts)
      .filter((item) => readerReady(item))
      .slice(0, Math.max(1, Math.min(5, maxItems)));
    return {
      fetch_succeeded: true,
      items: unique.map((item) => enrichItem(source, item)),
      error_message: null
    };
  } catch (error) {
    return {
      fetch_succeeded: false,
      items: [],
      error_message: safeError(error)
    };
  }
}

async function collectDrafts(source: CloudSource, limit: number, fetcher: typeof fetch) {
  const method = source.crawl_method.toLowerCase();
  if (method === "rss" || method === "podcast_feed" || method === "youtube_feed") {
    const feedUrl = source.rss_url || source.podcast_url || source.url;
    const response = await requestText(feedUrl, "application/rss+xml, application/atom+xml, application/xml, text/xml, */*", fetcher);
    assertOk(response, "feed");
    return parseFeed(response.text, limit);
  }

  if (method === "api" && githubRepositoryUrl(source)) {
    return collectGitHub(source, limit, fetcher);
  }

  if (method === "sitemap") {
    return collectSitemap(source, limit, fetcher);
  }

  return collectHtml(source, limit, fetcher);
}

async function collectGitHub(source: CloudSource, limit: number, fetcher: typeof fetch): Promise<DraftItem[]> {
  const repository = parseGitHubRepository(githubRepositoryUrl(source));
  if (!repository) {
    return collectHtml(source, limit, fetcher);
  }

  const apiBase = `https://api.github.com/repos/${repository.owner}/${repository.name}`;
  const releases = await requestText(`${apiBase}/releases?per_page=${limit}`, "application/vnd.github+json", fetcher, {
    "x-github-api-version": "2022-11-28"
  });
  if (releases.ok) {
    const rows = safeJsonArray(releases.text);
    const items = rows.map((row) => ({
      title: cleanText(stringValue(row.name) || stringValue(row.tag_name) || "Release"),
      url: canonicalizeUrl(stringValue(row.html_url)),
      publishedAt: safeIso(stringValue(row.published_at) || stringValue(row.created_at)),
      summary: cleanText(stringValue(row.body))
    })).filter(readerReady);
    if (items.length > 0) {
      return items.slice(0, limit);
    }
  }

  const commits = await requestText(`${apiBase}/commits?per_page=${limit}`, "application/vnd.github+json", fetcher, {
    "x-github-api-version": "2022-11-28"
  });
  assertOk(commits, "GitHub");
  return safeJsonArray(commits.text).map((row) => {
    const commit = objectValue(row.commit);
    const author = objectValue(commit.author);
    return {
      title: firstLine(stringValue(commit.message)),
      url: canonicalizeUrl(stringValue(row.html_url)),
      publishedAt: safeIso(stringValue(author.date)),
      summary: cleanText(stringValue(commit.message))
    };
  }).filter(readerReady).slice(0, limit);
}

async function collectHtml(source: CloudSource, limit: number, fetcher: typeof fetch): Promise<DraftItem[]> {
  const home = await requestText(source.url, "text/html, application/xhtml+xml, */*", fetcher);
  assertOk(home, "HTML");
  const links = discoverArticleLinks(home.text, home.url, limit);
  const articles = await Promise.all(links.map(async (url) => {
    const response = await requestText(url, "text/html, application/xhtml+xml, */*", fetcher);
    return response.ok ? parseHtmlArticle(response.text, response.url) : null;
  }));
  const ready = articles.filter((item): item is DraftItem => Boolean(item && readerReady(item)));
  if (ready.length > 0) {
    return ready.slice(0, limit);
  }

  const homepage = parseHtmlArticle(home.text, home.url);
  return homepage && readerReady(homepage) ? [homepage] : [];
}

async function collectSitemap(source: CloudSource, limit: number, fetcher: typeof fetch): Promise<DraftItem[]> {
  const candidates = [source.url];
  try {
    const origin = new URL(source.url).origin;
    candidates.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`);
  } catch {
    return collectHtml(source, limit, fetcher);
  }

  for (const candidate of Array.from(new Set(candidates))) {
    const response = await requestText(candidate, "application/xml, text/xml, text/html, */*", fetcher);
    if (!response.ok) {
      continue;
    }
    if (!/<(?:urlset|sitemapindex|url|loc)\b/i.test(response.text)) {
      if (candidate === source.url) {
        const links = discoverArticleLinks(response.text, response.url, limit);
        if (links.length > 0) {
          const pages = await Promise.all(links.map(async (url) => {
            const page = await requestText(url, "text/html, */*", fetcher);
            return page.ok ? parseHtmlArticle(page.text, page.url) : null;
          }));
          const ready = pages.filter((item): item is DraftItem => Boolean(item && readerReady(item)));
          if (ready.length > 0) {
            return ready.slice(0, limit);
          }
        }
      }
      continue;
    }

    const urls = parseSitemapUrls(response.text, limit);
    const pages = await Promise.all(urls.map(async (entry) => {
      const page = await requestText(entry.url, "text/html, */*", fetcher);
      if (!page.ok) {
        return {
          title: titleFromUrl(entry.url),
          url: entry.url,
          publishedAt: entry.lastModified
        };
      }
      const parsed = parseHtmlArticle(page.text, page.url);
      return parsed ? { ...parsed, publishedAt: parsed.publishedAt || entry.lastModified } : null;
    }));
    const ready = pages.flatMap((item) =>
      item && readerReady(item) ? [item] : []
    );
    if (ready.length > 0) {
      return ready.slice(0, limit);
    }
  }

  return collectHtml(source, limit, fetcher);
}

export function parseFeed(xml: string, limit = 3): DraftItem[] {
  const rss = extractBlocks(xml, "item");
  const blocks = rss.length > 0 ? rss : extractBlocks(xml, "entry");
  return blocks.map((block) => {
    const title = stripMarkup(readTag(block, "title"));
    const url = canonicalizeUrl(feedLink(block) || stripMarkup(readTag(block, "guid")) || stripMarkup(readTag(block, "id")));
    const publishedAt = safeIso(
      stripMarkup(readTag(block, "pubDate")) ||
      stripMarkup(readTag(block, "published")) ||
      stripMarkup(readTag(block, "updated"))
    );
    const summary = stripMarkup(
      readTag(block, "description") ||
      readTag(block, "summary") ||
      readTag(block, "content:encoded")
    );
    return { title, url, publishedAt, summary };
  }).filter(readerReady).slice(0, limit);
}

export function discoverArticleLinks(html: string, baseUrl: string, limit = 3): string[] {
  const candidates = new Map<string, number>();
  const linkPattern = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  let inspected = 0;
  while ((match = linkPattern.exec(html)) !== null && inspected < 400) {
    inspected += 1;
    const title = stripMarkup(match[2] || "");
    if (title.length < 8 || genericTitle(title)) {
      continue;
    }
    const url = resolveUrl(match[1] || "", baseUrl);
    if (!safePublicUrl(url) || !sameHost(url, baseUrl) || rejectedPath(url)) {
      continue;
    }
    const score = articleScore(url, title);
    if (score < 3) {
      continue;
    }
    const canonical = canonicalizeUrl(url);
    candidates.set(canonical, Math.max(score, candidates.get(canonical) || 0));
  }
  return [...candidates.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([url]) => url);
}

export function parseHtmlArticle(html: string, pageUrl: string): DraftItem | null {
  const title =
    metaContent(html, "property", "og:title") ||
    metaContent(html, "name", "twitter:title") ||
    stripMarkup(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "") ||
    stripMarkup(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const canonicalTag = html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i)?.[0] || "";
  const canonical = canonicalizeUrl(resolveUrl(attribute(canonicalTag, "href") || pageUrl, pageUrl));
  const summary =
    metaContent(html, "name", "description") ||
    metaContent(html, "property", "og:description") ||
    firstUsefulParagraph(html);
  const rawDate =
    metaContent(html, "property", "article:published_time") ||
    metaContent(html, "name", "date") ||
    metaContent(html, "name", "publish-date") ||
    attribute(html.match(/<time\b[^>]*datetime=["'][^"']+["'][^>]*>/i)?.[0] || "", "datetime") ||
    html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1] ||
    "";
  const item = {
    title: cleanText(title),
    url: canonical,
    publishedAt: safeIso(rawDate),
    summary: cleanText(summary)
  };
  return readerReady(item) ? item : null;
}

export function canonicalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid|mc_cid|mc_eid)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return "";
  }
}

function enrichItem(source: CloudSource, draft: DraftItem): CloudReaderItem {
  const title = cleanText(draft.title).slice(0, 240);
  const summary = cleanText(draft.summary || title).slice(0, 700);
  const publishedAt = safeIso(draft.publishedAt || "");
  const language = detectLanguage(`${title} ${summary}`);
  const categories = inferCategories(source, `${title} ${summary}`);
  const tags = uniqueStrings([...(source.tags || []), ...(source.topics || [])]).slice(0, 12);
  const sourceWeight = clamp(numberValue(source.weight, tierWeight(source.source_tier)), 0.45, 1);
  const freshness = freshnessScore(publishedAt);
  const relevance = aiRelevance(`${title} ${summary}`);
  const importance = clamp(0.68 + freshness * 0.18 + (importantSignal(title) ? 0.1 : 0), 0, 0.98);
  const credibility = clamp(0.62 + sourceWeight * 0.36, 0, 0.99);
  const novelty = clamp(0.72 + freshness * 0.2, 0, 0.96);
  const overall = clamp(
    0.22 * relevance + 0.22 * credibility + 0.2 * importance + 0.18 * novelty + 0.18 * freshness,
    0.72,
    0.98
  );
  return {
    title,
    url: canonicalizeUrl(draft.url),
    published_at: publishedAt || null,
    summary,
    categories,
    tags,
    language,
    why_it_matters: whyItMatters(source, categories[0] || "AI", language),
    ai_relevance_score: round(relevance),
    credibility_score: round(credibility),
    novelty_score: round(novelty),
    importance_score: round(importance),
    freshness_score: round(freshness),
    overall_score: round(overall),
    confidence: round(clamp(0.62 + sourceWeight * 0.3, 0, 0.95))
  };
}

function inferCategories(source: CloudSource, text: string) {
  const lower = text.toLowerCase();
  const categories: string[] = [];
  if (/open.?source|github|repository|release|sdk|api|developer|code|agent|tool/.test(lower)) categories.push("开发工具");
  if (/research|paper|arxiv|benchmark|evaluation|study|研究|论文/.test(lower)) categories.push("研究");
  if (/funding|acqui|revenue|partnership|business|融资|收购|商业/.test(lower)) categories.push("商业");
  if (/policy|regulat|law|government|政策|监管|法规/.test(lower)) categories.push("政策");
  if (/safety|security|risk|alignment|安全|风险|对齐/.test(lower)) categories.push("安全");
  if (/model|llm|multimodal|reasoning|inference|模型|推理/.test(lower)) categories.push("模型");
  const sourceCategory = cleanText(source.category || "");
  if (categories.length === 0 && sourceCategory) categories.push(sourceCategory);
  if (categories.length === 0) categories.push("行业动态");
  return uniqueStrings(categories).slice(0, 4);
}

function whyItMatters(source: CloudSource, category: string, language: CloudReaderItem["language"]) {
  if (language === "zh" || language === "mixed") {
    return `来自${source.name}的一手${category}动态，可结合原文判断其对产品、开发或行业走向的影响。`;
  }
  return `A direct ${category} update from ${source.name}; the original source provides the details needed to assess its product and industry impact.`;
}

function freshnessScore(value?: string) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return 0.72;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  if (ageDays <= 1) return 0.98;
  if (ageDays <= 3) return 0.92;
  if (ageDays <= 7) return 0.84;
  if (ageDays <= 30) return 0.7;
  return 0.55;
}

function aiRelevance(text: string) {
  return /\b(?:ai|llm|model|agent|inference|multimodal|transformer|machine learning)\b|人工智能|模型|智能体|推理|多模态/i.test(text)
    ? 0.96
    : 0.78;
}

function importantSignal(text: string) {
  return /launch|release|introduc|announce|funding|acqui|policy|regulat|benchmark|发布|推出|宣布|融资|收购|政策|监管|评测/i.test(text);
}

async function requestText(
  url: string,
  accept: string,
  fetcher: typeof fetch,
  extraHeaders: Record<string, string> = {}
): Promise<FetchTextResult> {
  if (!safePublicUrl(url)) {
    throw new Error("Source URL is not a public HTTP URL.");
  }
  let lastStatus = 0;
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(url, {
        redirect: "follow",
        headers: { accept, "user-agent": USER_AGENT, ...extraHeaders },
        signal: AbortSignal.timeout(22_000)
      });
      lastStatus = response.status;
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer.slice(0, MAX_RESPONSE_BYTES));
      const text = new TextDecoder().decode(bytes);
      if (response.ok || !retryableStatus(response.status) || attempt === 2) {
        return { ok: response.ok, status: response.status, text, url: response.url || url };
      }
    } catch (error) {
      lastError = safeError(error);
      if (attempt === 2) break;
    }
    await delay(250 * (attempt + 1));
  }
  return { ok: false, status: lastStatus, text: lastError, url };
}

function parseSitemapUrls(xml: string, limit: number) {
  const entries = extractBlocks(xml, "url").map((block) => ({
    url: canonicalizeUrl(stripMarkup(readTag(block, "loc"))),
    lastModified: safeIso(stripMarkup(readTag(block, "lastmod")))
  })).filter((entry) => safePublicUrl(entry.url) && !rejectedPath(entry.url));
  return entries
    .sort((left, right) => Date.parse(right.lastModified || "1970-01-01") - Date.parse(left.lastModified || "1970-01-01"))
    .slice(0, limit);
}

function extractBlocks(value: string, tag: string) {
  return [...value.matchAll(new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, "gi"))]
    .map((match) => match[1] || "");
}

function readTag(value: string, tag: string) {
  return value.match(new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, "i"))?.[1] || "";
}

function feedLink(block: string) {
  const plain = stripMarkup(readTag(block, "link"));
  return plain || attribute(block.match(/<link\b[^>]*href=["'][^"']+["'][^>]*>/i)?.[0] || "", "href");
}

function metaContent(html: string, attributeName: "name" | "property", value: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((candidate) => attribute(candidate, attributeName).toLowerCase() === value.toLowerCase());
  return cleanText(attribute(tag || "", "content"));
}

function attribute(tag: string, name: string) {
  return decodeEntities(tag.match(new RegExp(`${escapeRegExp(name)}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] || "");
}

function firstUsefulParagraph(html: string) {
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripMarkup(match[1] || ""))
    .filter((value) => value.length >= 60);
  return paragraphs[0] || "";
}

function titleFromUrl(value: string) {
  try {
    const segment = new URL(value).pathname.split("/").filter(Boolean).at(-1) || "";
    return cleanText(segment.replace(/[-_]+/g, " "));
  } catch {
    return "";
  }
}

function readerReady(item: Partial<DraftItem>) {
  return Boolean(
    cleanText(item.title || "").length >= 6 &&
    safePublicUrl(item.url || "") &&
    !genericTitle(cleanText(item.title || ""))
  );
}

function genericTitle(value: string) {
  return /^(?:home|news|latest|update|updates|blog|research|release notes?|untitled|首页|新闻|最新|更新)$/i.test(value.trim());
}

function dedupeDrafts(items: DraftItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = canonicalizeUrl(item.url).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safePublicUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      host !== "localhost" &&
      !host.endsWith(".local") &&
      !/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|::1$)/.test(host) &&
      !/^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

function sameHost(left: string, right: string) {
  try {
    return new URL(left).hostname.toLowerCase() === new URL(right).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function rejectedPath(value: string) {
  try {
    const path = new URL(value).pathname;
    return /\/(?:login|signin|auth|account|privacy|terms|cookies?|search|tags?|categories?|authors?|careers?|jobs?|contact|about)(?:\/|$)/i.test(path) ||
      /\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js)$/i.test(path);
  } catch {
    return true;
  }
}

function articleScore(value: string, title: string) {
  let score = title.length >= 24 ? 2 : 1;
  try {
    const path = new URL(value).pathname;
    if (/\/(?:blog|news|research|article|post|insight|update|changelog|release|announcement)/i.test(path)) score += 4;
    if (/\/20\d{2}(?:\/|-)(?:0?[1-9]|1[0-2])(?:\/|-)/.test(path)) score += 2;
    if (path.split("/").filter(Boolean).length >= 2) score += 1;
  } catch {
    return 0;
  }
  return score;
}

function resolveUrl(value: string, base: string) {
  try {
    return new URL(decodeEntities(value), base).toString();
  } catch {
    return "";
  }
}

function githubRepositoryUrl(source: CloudSource) {
  return source.github_url || (source.url.includes("github.com/") ? source.url : "");
}

function parseGitHubRepository(value: string) {
  try {
    const url = new URL(value);
    if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return null;
    const [owner, name] = url.pathname.split("/").filter(Boolean);
    return owner && name ? { owner, name: name.replace(/\.git$/i, "") } : null;
  } catch {
    return null;
  }
}

function safeJsonArray(value: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row === "object") : [];
  } catch {
    return [];
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function assertOk(response: FetchTextResult, label: string) {
  if (!response.ok) throw new Error(`${label} fetch failed with HTTP ${response.status || 0}.`);
}

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function stripMarkup(value: string) {
  return cleanText(value
    .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function cleanText(value: string) {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function safeIso(value: string) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function detectLanguage(value: string): CloudReaderItem["language"] {
  const cjk = value.match(/[\p{Script=Han}]/gu)?.length || 0;
  const latin = value.match(/[A-Za-z]/g)?.length || 0;
  if (cjk >= 8 && latin >= 20) return "mixed";
  if (cjk >= 8) return "zh";
  if (latin >= 20) return "en";
  return "unknown";
}

function firstLine(value: string) {
  return cleanText(value.split(/\r?\n/)[0] || "");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function tierWeight(tier?: number | null) {
  if (tier === 1) return 0.94;
  if (tier === 2) return 0.82;
  if (tier === 3) return 0.68;
  return 0.58;
}

function numberValue(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Source collection failed.";
  return message.replace(/https?:\/\/\S+/g, "[source-url]").slice(0, 300);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
