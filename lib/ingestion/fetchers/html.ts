import {
  FETCH_CONFIG,
  canonicalizeUrl,
  fetchPublicText,
  hourlyFetchCacheKeyParts,
  isPublicHttpUrl
} from "@/lib/ingestion/config";
import { parseSitemapArticle } from "@/lib/ingestion/fetchers/sitemap";
import type { FetcherContext, FetcherItem, SelectedSource, SourceFetchResult } from "@/lib/ingestion/types";

export type HtmlArticleCandidate = {
  score: number;
  title: string;
  url: string;
};

export async function fetchHtmlSource(source: SelectedSource, context: FetcherContext): Promise<SourceFetchResult> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const warnings: string[] = [];

  if (isLoginUrl(source.url)) {
    return buildResult(source, "skipped", startedAt, started, [], "Source URL appears to be a sign-in page.", warnings, {
      url: source.url
    });
  }

  const response = await fetchPublicText(source.url, {
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    maxBytes: FETCH_CONFIG.maxHtmlBytes,
    cache: {
      keyParts: hourlyFetchCacheKeyParts(source.id, source.url, context.collectedAt, "html"),
      bypass: context.cache.noCache,
      stats: context.cache.stats
    }
  });

  if (!response.ok) {
    return buildResult(source, "failed", startedAt, started, [], response.errorMessage ?? "HTML fetch failed", warnings, {
      http_status: response.status,
      response_headers: response.headers
    });
  }

  if (response.truncated) {
    warnings.push("HTML response was truncated to the configured byte limit.");
  }

  if (looksLikeLoginPage(response.text)) {
    return buildResult(source, "skipped", startedAt, started, [], "Fetched page appears to require sign-in.", warnings, {
      final_url: response.url,
      http_status: response.status,
      cache_status: response.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
      response_headers: response.headers
    });
  }

  const candidates = discoverHtmlArticleLinks(response.text, response.url, context.maxItemsPerSource);
  const items: FetcherItem[] = [];

  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    const fetched = await Promise.all(batch.map((candidate) => fetchHtmlArticle(source, candidate, context)));
    for (const result of fetched) {
      if (result.item) {
        items.push(result.item);
      }
      if (result.warning) {
        warnings.push(result.warning);
      }
    }
  }

  if (items.length > 0) {
    return buildResult(source, "success", startedAt, started, items, undefined, warnings, {
      article_candidates: candidates.length,
      article_failures: warnings.length,
      final_url: response.url,
      http_status: response.status,
      cache_status: response.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
      response_headers: response.headers
    });
  }

  const item = buildHtmlHomepageItem(source, response.text, response.url, {
    cacheStatus: response.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
    candidates,
    httpStatus: response.status,
    responseHeaders: response.headers
  });

  return buildResult(source, "success", startedAt, started, [item], undefined, warnings, {
    article_candidates: candidates.length,
    article_failures: warnings.length,
    final_url: response.url,
    http_status: response.status,
    cache_status: response.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
    response_headers: response.headers
  });
}

export function discoverHtmlArticleLinks(html: string, sourceUrl: string, limit: number): HtmlArticleCandidate[] {
  let source: URL;
  try {
    source = new URL(sourceUrl);
  } catch {
    return [];
  }

  const sourceCanonical = canonicalizeUrl(source.toString());
  const candidates = new Map<string, HtmlArticleCandidate>();
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  let inspected = 0;

  while ((match = pattern.exec(html)) !== null && inspected < 300) {
    inspected += 1;
    const rawHref = decodeEntities(match[1] ?? "").trim();
    const title = cleanHtml(match[2] ?? "").slice(0, 180);
    if (!rawHref || !title || isGenericLinkTitle(title)) {
      continue;
    }

    const url = absolutizeUrl(rawHref, source.toString());
    if (!isPublicHttpUrl(url)) {
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }

    if (parsed.hostname !== source.hostname || isRejectedArticlePath(parsed.pathname)) {
      continue;
    }

    const canonical = canonicalizeUrl(parsed.toString());
    if (canonical === sourceCanonical) {
      continue;
    }

    const score = articleLinkScore(source, parsed, title);
    if (score < 4) {
      continue;
    }

    const existing = candidates.get(canonical);
    if (!existing || score > existing.score || (score === existing.score && title.length > existing.title.length)) {
      candidates.set(canonical, { score, title, url: canonical });
    }
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .slice(0, Math.max(0, limit));
}

export function parseHtmlArticle(html: string, pageUrl: string): FetcherItem {
  const item = parseSitemapArticle(html, pageUrl);
  return {
    ...item,
    metadata: {
      ...item.metadata,
      item_kind: "html_article"
    }
  };
}

export function buildHtmlHomepageItem(
  source: Pick<SelectedSource, "description" | "name" | "url">,
  html: string,
  pageUrl: string,
  metadata: {
    cacheStatus?: string;
    candidates?: HtmlArticleCandidate[];
    httpStatus?: number;
    responseHeaders?: Record<string, string>;
  } = {}
): FetcherItem {
  const title = metaContent(html, "property", "og:title") || readTitle(html) || source.name;
  const canonical = canonicalUrl(html, pageUrl);
  const description =
    metaContent(html, "name", "description") || metaContent(html, "property", "og:description") || source.description;
  const links = (metadata.candidates ?? discoverHtmlArticleLinks(html, pageUrl, 10)).map(({ title: linkTitle, url }) => ({
    title: linkTitle,
    url
  }));

  return {
    title,
    url: canonical,
    canonicalUrl: canonicalizeUrl(canonical),
    excerpt: description,
    summary: description,
    rawText: [title, description].filter(Boolean).join("\n"),
    externalId: canonicalizeUrl(canonical),
    metadata: {
      item_kind: "raw_html_summary",
      source_homepage: source.url,
      http_status: metadata.httpStatus,
      cache_status: metadata.cacheStatus,
      response_headers: metadata.responseHeaders,
      links,
      link_count: links.length
    }
  };
}

async function fetchHtmlArticle(
  source: SelectedSource,
  candidate: HtmlArticleCandidate,
  context: FetcherContext
) {
  const response = await fetchPublicText(candidate.url, {
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    maxBytes: FETCH_CONFIG.maxHtmlBytes,
    cache: {
      keyParts: hourlyFetchCacheKeyParts(source.id, candidate.url, context.collectedAt, "html-article"),
      bypass: context.cache.noCache,
      stats: context.cache.stats
    }
  });

  if (!response.ok) {
    return { item: null, warning: `Article fetch failed (${response.status}) for ${candidate.url}` };
  }
  if (looksLikeLoginPage(response.text)) {
    return { item: null, warning: `Article fetch returned a sign-in page for ${candidate.url}` };
  }

  const item = parseHtmlArticle(response.text, response.url);
  const articleText = item.rawText?.trim() ?? "";
  if (!item.title.trim() || articleText.length < 40) {
    return { item: null, warning: `Article content was too thin for ${candidate.url}` };
  }

  item.metadata = {
    ...item.metadata,
    cache_status: response.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
    discovery_score: candidate.score,
    http_status: response.status,
    source_homepage: source.url
  };
  return { item, warning: "" };
}

function articleLinkScore(source: URL, candidate: URL, title: string) {
  const path = candidate.pathname.replace(/\/+$/, "") || "/";
  const sourcePath = source.pathname.replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);
  let score = 0;

  if (/\/(?:blog|blogs|news|research|articles?|posts?|insights?|updates?|changelog|release-notes?|announcements?)(?:\/|$)/i.test(path)) {
    score += 4;
  }
  if (sourcePath !== "/" && path.startsWith(`${sourcePath}/`)) {
    score += 3;
  }
  if (/\/(?:20\d{2})(?:\/|-)(?:0?[1-9]|1[0-2])(?:\/|-)/.test(path)) {
    score += 2;
  }
  if (segments.length >= 2) {
    score += 1;
  }
  if (title.length >= 24) {
    score += 2;
  }
  if (title.split(/\s+/).length >= 4 || (title.match(/[\p{Script=Han}]/gu)?.length ?? 0) >= 10) {
    score += 1;
  }
  return score;
}

function isRejectedArticlePath(pathname: string) {
  return /\/(?:login|signin|sign-in|auth|account|privacy|terms|cookies?|search|tags?|categories?|topics?|authors?|careers?|jobs?|contact|about)(?:\/|$)/i.test(pathname) ||
    /\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|xml|json|css|js)$/i.test(pathname);
}

function isGenericLinkTitle(title: string) {
  return /^(?:home|about|blog|news|research|articles?|read more|learn more|view all|see all|next|previous|sign in|log in|subscribe|menu)$/i.test(title.trim());
}

function buildResult(
  source: SelectedSource,
  status: SourceFetchResult["status"],
  startedAt: string,
  started: number,
  items: FetcherItem[],
  errorMessage: string | undefined,
  warnings: string[],
  metadata: Record<string, unknown>
): SourceFetchResult {
  const endedAt = new Date().toISOString();

  return {
    sourceId: source.id,
    sourceName: source.name,
    crawlMethod: source.crawl_method,
    status,
    startedAt,
    endedAt,
    durationMs: Date.now() - started,
    itemCount: items.length,
    items,
    errorMessage,
    warnings,
    metadata
  };
}

function readTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanHtml(match?.[1] ?? "");
}

function metaContent(html: string, attribute: "name" | "property", name: string) {
  const pattern = new RegExp(`<meta\\b[^>]*${attribute}=["']${escapeRegExp(name)}["'][^>]*>`, "i");
  const match = html.match(pattern);
  return cleanHtml(readAttribute(match?.[0] ?? "", "content"));
}

function canonicalUrl(html: string, fallbackUrl: string) {
  const canonicalLink = html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i);
  const href = readAttribute(canonicalLink?.[0] ?? "", "href");
  const ogUrl = metaContent(html, "property", "og:url");

  return absolutizeUrl(href || ogUrl || fallbackUrl, fallbackUrl);
}

function readAttribute(tag: string, attribute: string) {
  const pattern = new RegExp(`${attribute}=["']([^"']+)["']`, "i");
  return tag.match(pattern)?.[1] ?? "";
}

function cleanHtml(value: string) {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function absolutizeUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function isLoginUrl(value: string) {
  try {
    const parsed = new URL(value);
    return /\/(?:login|signin|sign-in|auth|account)(?:\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function looksLikeLoginPage(html: string) {
  const title = readTitle(html).toLowerCase();
  return /(sign in|log in|login|authentication|required account)/i.test(title);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
