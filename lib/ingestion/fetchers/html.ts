import { FETCH_CONFIG, canonicalizeUrl, fetchPublicText, hourlyFetchCacheKeyParts } from "@/lib/ingestion/config";
import type { FetcherContext, FetcherItem, SelectedSource, SourceFetchResult } from "@/lib/ingestion/types";

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

  const title = metaContent(response.text, "property", "og:title") || readTitle(response.text) || source.name;
  const canonical = canonicalUrl(response.text, response.url);
  const description =
    metaContent(response.text, "name", "description") || metaContent(response.text, "property", "og:description") || source.description;
  const links = extractLinks(response.text, canonical).slice(0, 10);
  const item: FetcherItem = {
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
      http_status: response.status,
      cache_status: response.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
      response_headers: response.headers,
      links,
      link_count: links.length
    }
  };

  return buildResult(source, "success", startedAt, started, [item], undefined, warnings, {
    final_url: response.url,
    http_status: response.status,
    cache_status: response.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
    response_headers: response.headers
  });
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

function extractLinks(html: string, baseUrl: string) {
  const links: Array<{ title: string; url: string }> = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null && links.length < 20) {
    const url = absolutizeUrl(match[1] ?? "", baseUrl);
    const title = cleanHtml(match[2] ?? "");
    if (url.startsWith("http") && title) {
      links.push({ title: title.slice(0, 120), url: canonicalizeUrl(url) });
    }
  }

  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) {
      return false;
    }
    seen.add(link.url);
    return true;
  });
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
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
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
