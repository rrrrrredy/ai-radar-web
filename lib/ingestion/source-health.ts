import { hasUnsafeFragment, isAllowedCrawlMethod, isPublicHttpUrl } from "@/lib/ingestion/config";
import type { CleanedSource } from "@/lib/ingestion/types";

export function isSourceHealthEligible(source: CleanedSource) {
  if (source.status !== "active" && source.status !== "trial") {
    return false;
  }

  if (!isAllowedCrawlMethod(source.crawl_method)) {
    return false;
  }

  if (!source.url || !isPublicHttpUrl(source.url)) {
    return false;
  }

  if (source.risk_flags.includes("needs_public_url")) {
    return false;
  }

  return [source.url, source.rss_url, source.github_url, source.youtube_url, source.podcast_url, source.notes].every(
    (value) => !hasUnsafeFragment(value)
  );
}
