import {
  FETCH_CONFIG,
  canonicalizeUrl,
  fetchPublicText,
  hourlyFetchCacheKeyParts
} from "@/lib/ingestion/config";
import type {
  FetcherContext,
  FetcherItem,
  SelectedSource,
  SourceFetchResult
} from "@/lib/ingestion/types";

export type SitemapEntry = {
  lastmod?: string;
  url: string;
};

export async function fetchSitemapSource(
  source: SelectedSource,
  context: FetcherContext
): Promise<SourceFetchResult> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const sitemapUrl = source.sitemap_url ?? new URL("/sitemap.xml", source.url).toString();
  const warnings: string[] = [];
  const response = await fetchPublicText(sitemapUrl, {
    accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
    maxBytes: FETCH_CONFIG.maxFeedBytes,
    cache: {
      keyParts: hourlyFetchCacheKeyParts(source.id, sitemapUrl, context.collectedAt, "sitemap"),
      bypass: context.cache.noCache,
      stats: context.cache.stats
    }
  });

  if (!response.ok) {
    return buildResult(
      source,
      "failed",
      startedAt,
      started,
      [],
      response.errorMessage ?? "Sitemap fetch failed",
      warnings,
      {
        http_status: response.status,
        sitemap_url: sitemapUrl
      }
    );
  }

  const entries = parseSitemapEntries(response.text, source.url);
  if (entries.length === 0) {
    return buildResult(
      source,
      "failed",
      startedAt,
      started,
      [],
      "Sitemap contained no same-domain article URLs under the configured source path.",
      warnings,
      {
        http_status: response.status,
        sitemap_url: sitemapUrl
      }
    );
  }

  const candidates = entries.slice(0, Math.max(context.maxItemsPerSource, 1));
  const items: FetcherItem[] = [];

  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    const fetched = await Promise.all(
      batch.map((entry) => fetchSitemapArticle(source, entry, context))
    );

    for (const result of fetched) {
      if (result.item) {
        items.push(result.item);
      }
      if (result.warning) {
        warnings.push(result.warning);
      }
    }
  }

  return buildResult(
    source,
    items.length > 0 ? "success" : "failed",
    startedAt,
    started,
    items,
    items.length > 0 ? undefined : "No sitemap articles could be fetched.",
    warnings,
    {
      article_candidates: candidates.length,
      article_failures: warnings.length,
      cache_status: response.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
      final_url: response.url,
      http_status: response.status,
      sitemap_url: sitemapUrl
    }
  );
}

export function parseSitemapEntries(sitemapText: string, sourceUrl: string): SitemapEntry[] {
  const source = new URL(sourceUrl);
  const sourcePath = source.pathname.replace(/\/+$/, "") || "/";
  const entries: SitemapEntry[] = [];
  const blocks = sitemapText.match(/<url(?:\s[^>]*)?>[\s\S]*?<\/url>/gi) ?? [];

  for (const block of blocks) {
    const location = xmlText(block, "loc");
    if (!location) {
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(location);
    } catch {
      continue;
    }

    const candidatePath = parsed.pathname.replace(/\/+$/, "") || "/";
    const isWithinSourcePath =
      sourcePath === "/"
        ? candidatePath !== "/"
        : candidatePath.startsWith(`${sourcePath}/`);
    if (parsed.hostname !== source.hostname || !isWithinSourcePath) {
      continue;
    }

    entries.push({
      lastmod: normalizedDate(xmlText(block, "lastmod")),
      url: canonicalizeUrl(parsed.toString())
    });
  }

  const deduped = new Map(entries.map((entry) => [entry.url, entry]));
  return [...deduped.values()].sort(
    (left, right) => timestamp(right.lastmod) - timestamp(left.lastmod) || left.url.localeCompare(right.url)
  );
}

export function parseSitemapArticle(
  html: string,
  pageUrl: string,
  sitemapLastmod?: string
): FetcherItem {
  const title =
    metaContent(html, "property", "og:title") ||
    readTitle(html) ||
    titleFromUrl(pageUrl);
  const description =
    metaContent(html, "name", "description") ||
    metaContent(html, "property", "og:description");
  const canonical = sameHostCanonical(html, pageUrl);
  const articleExcerpt = extractArticleExcerpt(html);
  const publishedAt = normalizedDate(
    metaContent(html, "property", "article:published_time") ||
      metaContent(html, "name", "datePublished") ||
      embeddedJsonValue(html, "datePublished") ||
      embeddedJsonValue(html, "publishedOn") ||
      timeDateTime(html)
  );

  return {
    canonicalUrl: canonicalizeUrl(canonical),
    excerpt: description || undefined,
    externalId: canonicalizeUrl(canonical),
    metadata: {
      article_excerpt_chars: articleExcerpt.length,
      item_kind: "sitemap_article",
      sitemap_lastmod: sitemapLastmod
    },
    publishedAt,
    rawText: [title, description, articleExcerpt].filter(Boolean).join("\n"),
    summary: description || undefined,
    title,
    url: canonical
  };
}

function extractArticleExcerpt(html: string) {
  const scope =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    "";
  const withoutNonContent = scope
    .replace(/<(script|style|svg|nav|footer|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const paragraphs = [...withoutNonContent.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanHtml(match[1] ?? ""))
    .filter((paragraph) => paragraph.length >= 60);
  const selected: string[] = [];
  let length = 0;

  for (const paragraph of paragraphs) {
    if (selected.includes(paragraph)) {
      continue;
    }
    if (length + paragraph.length > 4_000) {
      break;
    }
    selected.push(paragraph);
    length += paragraph.length;
    if (selected.length >= 8) {
      break;
    }
  }

  return selected.join("\n");
}

async function fetchSitemapArticle(
  source: SelectedSource,
  entry: SitemapEntry,
  context: FetcherContext
) {
  const response = await fetchPublicText(entry.url, {
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    maxBytes: FETCH_CONFIG.maxHtmlBytes,
    cache: {
      keyParts: hourlyFetchCacheKeyParts(source.id, entry.url, context.collectedAt, "sitemap-article"),
      bypass: context.cache.noCache,
      stats: context.cache.stats
    }
  });

  if (!response.ok) {
    return {
      item: null,
      warning: `Article fetch failed (${response.status}) for ${entry.url}`
    };
  }

  const item = parseSitemapArticle(response.text, response.url, entry.lastmod);
  item.metadata = {
    ...item.metadata,
    cache_status: response.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
    http_status: response.status,
    source_homepage: source.url
  };

  return { item, warning: "" };
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
  return {
    crawlMethod: source.crawl_method,
    durationMs: Date.now() - started,
    endedAt: new Date().toISOString(),
    errorMessage,
    itemCount: items.length,
    items,
    metadata,
    sourceId: source.id,
    sourceName: source.name,
    startedAt,
    status,
    warnings
  };
}

function xmlText(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeEntities(match?.[1] ?? "").replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1").trim();
}

function metaContent(html: string, attribute: "name" | "property", name: string) {
  const tag = html.match(new RegExp(`<meta\\b[^>]*${attribute}=["']${escapeRegExp(name)}["'][^>]*>`, "i"))?.[0] ?? "";
  return cleanHtml(readAttribute(tag, "content"));
}

function readTitle(html: string) {
  return cleanHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
}

function sameHostCanonical(html: string, fallbackUrl: string) {
  const tag = html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i)?.[0] ?? "";
  const href = readAttribute(tag, "href") || metaContent(html, "property", "og:url");

  try {
    const fallback = new URL(fallbackUrl);
    const candidate = new URL(href || fallbackUrl, fallbackUrl);
    return candidate.hostname === fallback.hostname ? candidate.toString() : fallback.toString();
  } catch {
    return fallbackUrl;
  }
}

function embeddedJsonValue(html: string, key: string) {
  const normalizedJsonQuotes = decodeEntities(html).replace(/\\+"/g, '"');
  return decodeEntities(
    normalizedJsonQuotes.match(
      new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"([^"]+)"`, "i")
    )?.[1] ?? ""
  );
}

function timeDateTime(html: string) {
  const tag = html.match(/<time\b[^>]*datetime=["'][^"']+["'][^>]*>/i)?.[0] ?? "";
  return readAttribute(tag, "datetime");
}

function readAttribute(tag: string, attribute: string) {
  return tag.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"))?.[1] ?? "";
}

function titleFromUrl(rawUrl: string) {
  try {
    const slug = new URL(rawUrl).pathname.split("/").filter(Boolean).at(-1) ?? "Untitled article";
    return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
  } catch {
    return "Untitled article";
  }
}

function cleanHtml(value: string) {
  return decodeEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function normalizedDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function timestamp(value: string | undefined) {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
