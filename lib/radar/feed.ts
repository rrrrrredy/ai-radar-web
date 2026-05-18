import "server-only";

import { citationFromItem } from "@/lib/retrieval/citations";
import { loadRadarItems } from "@/lib/retrieval/load-radar-items";
import type {
  LoadedRadarItems,
  RetrievalCitation,
  RetrievalDataSource,
  RetrievalLanguage,
  RetrievalRadarItem
} from "@/lib/retrieval/types";
import type { RadarCategory, UnderstandingStatus } from "@/lib/understanding/types";

export type RadarFeedCounts = {
  total: number;
  included: number;
  needs_review: number;
  excluded: number;
  failed: number;
  by_status: Record<UnderstandingStatus, number>;
  by_category: Partial<Record<RadarCategory, number>>;
  by_source_tier: Record<string, number>;
  by_language: Partial<Record<RetrievalLanguage, number>>;
  by_source: Record<string, number>;
};

export type RadarFeed = {
  items: RetrievalRadarItem[];
  citations: RetrievalCitation[];
  data_source: RetrievalDataSource;
  freshness: LoadedRadarItems["freshness"];
  freshness_note: string;
  generated_at: string;
  processed_at?: string;
  collected_at?: string;
  published_at?: string;
  caveats: string[];
  counts: RadarFeedCounts;
};

const statusOrder: Record<UnderstandingStatus, number> = {
  included: 0,
  needs_review: 1,
  excluded: 2,
  failed: 3
};

export async function loadRadarFeed(): Promise<RadarFeed> {
  return buildRadarFeed(await loadRadarItems());
}

export function buildRadarFeed(loaded: LoadedRadarItems): RadarFeed {
  const items = sortFeedItems(loaded.items);
  const counts = countFeedItems(items);
  const processedAt = latestTimestamp(items.map((item) => item.processed_at));
  const collectedAt = latestTimestamp(items.map((item) => item.collected_at));
  const publishedAt = latestTimestamp(items.map((item) => item.published_at));
  const generatedAt = loaded.freshness.latestTimestamp ?? processedAt ?? collectedAt ?? new Date().toISOString();
  const citations = items
    .filter((item) => item.status === "included" || item.status === "needs_review")
    .map(citationFromItem);

  return {
    items,
    citations,
    data_source: loaded.dataSource,
    freshness: loaded.freshness,
    freshness_note: freshnessNote(loaded),
    generated_at: generatedAt,
    processed_at: processedAt,
    collected_at: collectedAt,
    published_at: publishedAt,
    caveats: buildCaveats(loaded, counts),
    counts
  };
}

export function itemEvidenceTimestamp(item: RetrievalRadarItem) {
  return item.published_at ?? item.collected_at ?? item.processed_at;
}

function sortFeedItems(items: RetrievalRadarItem[]) {
  return [...items].sort((left, right) => {
    const statusDelta = statusOrder[left.status] - statusOrder[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const scoreDelta = right.overall_score - left.overall_score;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const timeDelta =
      Date.parse(itemEvidenceTimestamp(right)) - Date.parse(itemEvidenceTimestamp(left));
    if (Number.isFinite(timeDelta) && timeDelta !== 0) {
      return timeDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

function countFeedItems(items: RetrievalRadarItem[]): RadarFeedCounts {
  const byStatus: Record<UnderstandingStatus, number> = {
    included: 0,
    needs_review: 0,
    excluded: 0,
    failed: 0
  };
  const byCategory: Partial<Record<RadarCategory, number>> = {};
  const bySourceTier: Record<string, number> = {};
  const byLanguage: Partial<Record<RetrievalLanguage, number>> = {};
  const bySource: Record<string, number> = {};

  for (const item of items) {
    byStatus[item.status] += 1;
    byLanguage[item.language] = (byLanguage[item.language] ?? 0) + 1;
    bySourceTier[item.source_tier] = (bySourceTier[item.source_tier] ?? 0) + 1;
    bySource[item.source_name] = (bySource[item.source_name] ?? 0) + 1;

    for (const category of item.categories) {
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }
  }

  return {
    total: items.length,
    included: byStatus.included,
    needs_review: byStatus.needs_review,
    excluded: byStatus.excluded,
    failed: byStatus.failed,
    by_status: byStatus,
    by_category: byCategory,
    by_source_tier: bySourceTier,
    by_language: byLanguage,
    by_source: bySource
  };
}

function buildCaveats(loaded: LoadedRadarItems, counts: RadarFeedCounts) {
  return dedupe([
    ...loaded.warnings,
    dataSourceCaveat(loaded.dataSource),
    counts.included === 0 && counts.total > 0
      ? "No retrieved item is currently marked included; treat the list as review material, not confirmed coverage."
      : "",
    counts.needs_review > 0
      ? `${counts.needs_review} item(s) are marked needs_review and require human confirmation before confident synthesis.`
      : "",
    counts.excluded + counts.failed > 0
      ? "Excluded or failed rows are surfaced for transparency and should not be used as report evidence."
      : "",
    counts.total === 0
      ? "No radar items were retrieved from Supabase, local understanding output, or mock data."
      : "",
    "This surface shows available AI Radar evidence only; it is not a claim of complete current AI industry coverage."
  ]);
}

function dataSourceCaveat(dataSource: RetrievalDataSource) {
  if (dataSource === "supabase_radar_items") {
    return "Read-only Supabase public radar retrieval was used; no Supabase write path ran.";
  }

  if (dataSource === "local_understanding_output") {
    return "Local understanding output was used; freshness and coverage depend on generated local files.";
  }

  if (dataSource === "mock_data") {
    return "Synthetic mock radar data was used; it is workflow data, not production-current intelligence.";
  }

  return "No usable radar data source is currently available.";
}

function freshnessNote(loaded: LoadedRadarItems) {
  const latest = loaded.freshness.latestTimestamp;
  if (!latest) {
    return "No processed, collected, published, or file-modified freshness timestamp is available.";
  }

  const source = loaded.freshness.latestTimestampSource ?? "unknown timestamp";
  const fileMtime =
    loaded.freshness.fileMtime && loaded.freshness.fileMtime !== latest
      ? ` File modified at ${loaded.freshness.fileMtime}.`
      : "";

  return `Latest visible radar timestamp is ${latest} (${source}).${fileMtime}`;
}

function latestTimestamp(values: Array<string | undefined>) {
  return values
    .filter(
      (value): value is string =>
        typeof value === "string" && Number.isFinite(Date.parse(value))
    )
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
