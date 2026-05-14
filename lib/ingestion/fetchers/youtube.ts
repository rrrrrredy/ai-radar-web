import type { FetcherItem, SelectedSource, SourceFetchResult } from "@/lib/ingestion/types";

export async function fetchYoutubeSource(source: SelectedSource): Promise<SourceFetchResult> {
  const now = new Date().toISOString();
  const channelUrl = source.youtube_url ?? source.url;
  const item: FetcherItem = {
    title: `${source.name} channel metadata placeholder`,
    url: channelUrl,
    summary: "YouTube channel ingestion is not implemented in Phase 4.",
    rawText: "",
    externalId: `youtube-placeholder:${source.id}`,
    status: "skipped",
    errorMessage: "youtube_feed_not_implemented",
    metadata: {
      item_kind: "youtube_channel_placeholder",
      reason: "youtube_feed_not_implemented"
    }
  };

  return {
    sourceId: source.id,
    sourceName: source.name,
    crawlMethod: source.crawl_method,
    status: "skipped",
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    itemCount: 1,
    items: [item],
    errorMessage: "youtube_feed_not_implemented",
    warnings: ["YouTube scraping is intentionally disabled in Phase 4."],
    metadata: {
      channel_url: channelUrl,
      reason: "youtube_feed_not_implemented"
    }
  };
}
