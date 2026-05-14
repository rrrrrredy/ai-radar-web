import { buildCitations } from "@/lib/retrieval/citations";
import { loadRadarItems } from "@/lib/retrieval/load-radar-items";
import { normalizeQuery } from "@/lib/retrieval/normalize-query";
import { rankRadarItems } from "@/lib/retrieval/rank";
import { resolveTimeWindow } from "@/lib/retrieval/time-window";
import type { RetrievalPurpose, RetrievalRadarItem, RetrievalResult } from "@/lib/retrieval/types";

export async function retrieveRadarEvidence(
  rawQuery: string,
  purpose: RetrievalPurpose,
  options: { limit?: number; now?: Date } = {}
): Promise<RetrievalResult> {
  const normalizedQuery = normalizeQuery(rawQuery);
  const resolvedTimeWindow = resolveTimeWindow(normalizedQuery, purpose, options.now);
  const loaded = await loadRadarItems();
  const filtered = filterItems(loaded.items, normalizedQuery, resolvedTimeWindow);
  const baseFiltered = filterItems(loaded.items, normalizedQuery, resolvedTimeWindow, { useHints: false });
  const searchPool = filtered.length > 0 ? filtered : baseFiltered;
  const rankedItems = rankRadarItems(searchPool, normalizedQuery, resolvedTimeWindow).slice(0, options.limit ?? 8);

  return {
    normalizedQuery,
    resolvedTimeWindow,
    dataSource: loaded.dataSource,
    freshness: loaded.freshness,
    warnings: loaded.warnings,
    rankedItems,
    citations: buildCitations(rankedItems)
  };
}

function filterItems(
  items: RetrievalRadarItem[],
  query: ReturnType<typeof normalizeQuery>,
  timeWindow: ReturnType<typeof resolveTimeWindow>,
  options: { useHints: boolean } = { useHints: true }
) {
  const startMs = Date.parse(timeWindow.start);
  const endMs = Date.parse(timeWindow.end);

  return items.filter((item) => {
    if (item.status !== "included" && item.status !== "needs_review") {
      return false;
    }

    const timestamp = Date.parse(item.published_at ?? item.collected_at ?? item.processed_at);
    if (Number.isFinite(timestamp) && (timestamp < startMs || timestamp > endMs)) {
      return false;
    }

    if (options.useHints && query.category_hints.length > 0 && !query.category_hints.some((category) => item.categories.includes(category))) {
      return false;
    }

    if (options.useHints && query.entity_hints.length > 0) {
      const haystack = [
        item.title,
        item.summary_zh,
        item.summary_en,
        item.source_name,
        item.entities.map((entity) => entity.name).join(" "),
        item.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();
      const hasEntity = query.entity_hints.some((entity) => haystack.includes(entity.toLowerCase()));

      if (!hasEntity) {
        return false;
      }
    }

    return true;
  });
}
