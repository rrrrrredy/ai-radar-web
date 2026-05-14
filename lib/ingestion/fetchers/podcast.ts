import type { FetcherContext, SelectedSource, SourceFetchResult } from "@/lib/ingestion/types";
import { fetchRssSource } from "@/lib/ingestion/fetchers/rss";

export async function fetchPodcastSource(source: SelectedSource, context: FetcherContext): Promise<SourceFetchResult> {
  if (!source.rss_url) {
    const now = new Date().toISOString();

    return {
      sourceId: source.id,
      sourceName: source.name,
      crawlMethod: source.crawl_method,
      status: "skipped",
      startedAt: now,
      endedAt: now,
      durationMs: 0,
      itemCount: 0,
      items: [],
      errorMessage: "Podcast source has no public feed URL.",
      warnings: ["Podcast source skipped because no public feed URL is present."],
      metadata: {
        podcast_url: source.podcast_url ?? source.url
      }
    };
  }

  const result = await fetchRssSource(source, context);
  return {
    ...result,
    metadata: {
      ...result.metadata,
      podcast_url: source.podcast_url ?? source.url
    }
  };
}
