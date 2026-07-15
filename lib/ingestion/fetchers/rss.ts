import { FETCH_CONFIG, fetchPublicText, hourlyFetchCacheKeyParts } from "@/lib/ingestion/config";
import type { FetcherContext, FetcherItem, SelectedSource, SourceFetchResult } from "@/lib/ingestion/types";

export async function fetchRssSource(source: SelectedSource, context: FetcherContext): Promise<SourceFetchResult> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const feedUrl = source.rss_url ?? source.url;
  const warnings: string[] = [];

  const response = await fetchPublicText(feedUrl, {
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    maxBytes: FETCH_CONFIG.maxFeedBytes,
    cache: {
      keyParts: hourlyFetchCacheKeyParts(source.id, feedUrl, context.collectedAt, "rss"),
      bypass: context.cache.noCache,
      stats: context.cache.stats
    }
  });

  if (!response.ok) {
    return sourceResult(source, "failed", startedAt, started, [], response.errorMessage ?? "Feed fetch failed", warnings, {
      feed_url: feedUrl,
      http_status: response.status,
      response_headers: response.headers
    });
  }

  if (response.truncated) {
    warnings.push("Feed response was truncated to the configured byte limit.");
  }

  const items = parseFeedItems(response.text, context.maxItemsPerSource);

  return sourceResult(source, "success", startedAt, started, items, undefined, warnings, {
    feed_url: feedUrl,
    final_url: response.url,
    http_status: response.status,
    cache_status: response.cached ? "hit" : context.cache.noCache ? "bypassed" : "miss",
    response_headers: response.headers
  });
}

export function parseFeedItems(feedText: string, limit: number): FetcherItem[] {
  const blocks = extractBlocks(feedText, "item");
  const atomBlocks = blocks.length > 0 ? [] : extractBlocks(feedText, "entry");
  const selectedBlocks = blocks.length > 0 ? blocks : atomBlocks;

  return selectedBlocks.slice(0, limit).map((block) => {
    const title = stripXml(readXmlTag(block, "title")) || "Untitled feed item";
    const link = feedLink(block);
    const publishedAt = parseDate(readXmlTag(block, "pubDate") || readXmlTag(block, "published") || readXmlTag(block, "updated"));
    const author = stripXml(readXmlTag(block, "author") || readXmlTag(block, "dc:creator") || readXmlTag(block, "itunes:author"));
    const summary = stripXml(
      readXmlTag(block, "description") || readXmlTag(block, "summary") || readXmlTag(block, "content:encoded")
    );
    const externalId = stripXml(readXmlTag(block, "guid") || readXmlTag(block, "id")) || link || title;

    return {
      title,
      url: link || externalId,
      author: author || undefined,
      publishedAt,
      excerpt: summary || undefined,
      summary: summary || undefined,
      rawText: summary || title,
      externalId,
      metadata: {
        item_kind: "feed_item"
      }
    };
  });
}

function sourceResult(
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

function extractBlocks(value: string, tag: string) {
  const blocks: string[] = [];
  const pattern = new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, "gi");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    blocks.push(match[1] ?? "");
  }

  return blocks;
}

function readXmlTag(value: string, tag: string) {
  const pattern = new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, "i");
  const match = value.match(pattern);
  return match?.[1] ?? "";
}

function feedLink(block: string) {
  const explicitLink = stripXml(readXmlTag(block, "link"));
  if (explicitLink) {
    return explicitLink;
  }

  const atomLink = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return atomLink?.[1] ?? "";
}

function stripXml(value: string) {
  return decodeEntities(value)
    .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1")
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

function parseDate(value: string) {
  const stripped = stripXml(value);
  if (!stripped) {
    return undefined;
  }

  const date = new Date(stripped);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
