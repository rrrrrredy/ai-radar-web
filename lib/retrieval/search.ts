import { buildCitations } from "@/lib/retrieval/citations";
import { loadRadarItems } from "@/lib/retrieval/load-radar-items";
import { normalizeQuery } from "@/lib/retrieval/normalize-query";
import { rankRadarItems } from "@/lib/retrieval/rank";
import { resolveTimeWindow } from "@/lib/retrieval/time-window";
import type { RankedRadarItem, RetrievalPurpose, RetrievalRadarItem, RetrievalResult } from "@/lib/retrieval/types";

export async function retrieveRadarEvidence(
  rawQuery: string,
  purpose: RetrievalPurpose,
  options: { limit?: number; now?: Date } = {}
): Promise<RetrievalResult> {
  const normalizedQuery = normalizeQuery(rawQuery);
  const loaded = await loadRadarItems();
  const anchor = options.now ?? retrievalAnchorDate(loaded.freshness.latestTimestamp);
  const resolvedTimeWindow = resolveTimeWindow(normalizedQuery, purpose, anchor);
  const filtered = filterItems(loaded.items, normalizedQuery, resolvedTimeWindow);
  const baseFiltered = filterItems(loaded.items, normalizedQuery, resolvedTimeWindow, { useHints: false });
  const searchPool = filtered.length > 0 ? filtered : baseFiltered;
  const rankedItems = diversifyRankedItems(
    rankRadarItems(searchPool, normalizedQuery, resolvedTimeWindow),
    options.limit ?? 8
  );

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

function diversifyRankedItems(items: RankedRadarItem[], limit: number) {
  const selected: RankedRadarItem[] = [];
  const sourceCounts = new Map<string, number>();
  const familyCounts = new Map<string, number>();

  for (const ranked of items) {
    if (selected.length >= limit) {
      break;
    }

    const source = ranked.item.source_name.toLowerCase();
    const family = retrievalSourceFamily(ranked.item);
    const sourceCount = sourceCounts.get(source) ?? 0;
    const familyCount = familyCounts.get(family) ?? 0;

    if (sourceCount >= 2 || familyCount >= 3) {
      continue;
    }

    selected.push(ranked);
    sourceCounts.set(source, sourceCount + 1);
    familyCounts.set(family, familyCount + 1);
  }

  if (selected.length >= limit) {
    return selected;
  }

  const selectedIds = new Set(selected.map((ranked) => ranked.item.id));
  for (const ranked of items) {
    if (selected.length >= limit) {
      break;
    }

    if (!selectedIds.has(ranked.item.id)) {
      selected.push(ranked);
    }
  }

  return selected;
}

function retrievalSourceFamily(item: RetrievalRadarItem) {
  const text = `${item.source_name} ${item.url} ${item.source_tier}`.toLowerCase();
  if (text.includes("arxiv") || text.includes("paper") || text.includes("research")) return "research";
  if (text.includes("github") || text.includes("release") || text.includes("hugging face") || text.includes("huggingface")) return "open_source";
  if (["openai", "anthropic", "google", "deepmind", "meta", "llama", "deepseek", "qwen", "microsoft", "nvidia", "kimi"].some((term) => text.includes(term))) return "company_lab";
  return item.source_name.toLowerCase();
}

function retrievalAnchorDate(latestTimestamp?: string) {
  if (latestTimestamp) {
    const parsed = new Date(latestTimestamp);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
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

    const timestamp = Date.parse(item.published_at ?? "");
    if (!Number.isFinite(timestamp) || timestamp < startMs || timestamp > endMs) {
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
