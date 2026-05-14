import type {
  NormalizedQuery,
  RankedRadarItem,
  RetrievalRadarItem,
  ResolvedTimeWindow
} from "@/lib/retrieval/types";

export function rankRadarItems(
  items: RetrievalRadarItem[],
  query: NormalizedQuery,
  timeWindow: ResolvedTimeWindow
): RankedRadarItem[] {
  const endMs = Date.parse(timeWindow.end);

  return items
    .map((item) => scoreItem(item, query, endMs))
    .filter((ranked) => ranked.score > 0)
    .sort((left, right) => right.score - left.score);
}

function scoreItem(item: RetrievalRadarItem, query: NormalizedQuery, endMs: number): RankedRadarItem {
  const haystack = searchableText(item);
  const keywords = query.keywords.map((keyword) => keyword.toLowerCase());
  const textMatches = keywords.filter((keyword) => haystack.includes(keyword));
  const entityMatches = query.entity_hints.filter((entity) => haystack.includes(entity.toLowerCase()));
  const categoryMatches = query.category_hints.filter((category) => item.categories.includes(category));
  const scoreParts = {
    text: Math.min(0.35, textMatches.length * 0.06),
    entity: Math.min(0.16, entityMatches.length * 0.08),
    category: Math.min(0.12, categoryMatches.length * 0.06),
    overall: item.overall_score * 0.14,
    source: item.source_weight * 0.08,
    credibility: item.credibility_score * 0.08,
    freshness: freshnessBoost(item, endMs) * 0.05,
    status: item.status === "included" ? 0.08 : item.status === "needs_review" ? 0.03 : -0.2
  };
  const base = Object.values(scoreParts).reduce((sum, value) => sum + value, 0);
  const fallbackScore = keywords.length === 0 ? item.overall_score * 0.4 : 0;
  const score = Number(Math.max(0, base + fallbackScore).toFixed(4));
  const matchReasons = [
    textMatches.length > 0 ? `keyword:${textMatches.slice(0, 4).join(",")}` : "",
    entityMatches.length > 0 ? `entity:${entityMatches.join(",")}` : "",
    categoryMatches.length > 0 ? `category:${categoryMatches.join(",")}` : "",
    item.status === "needs_review" ? "needs_review" : "",
    item.status === "included" ? "included" : ""
  ].filter(Boolean);

  return {
    item,
    score,
    matchReasons
  };
}

function searchableText(item: RetrievalRadarItem) {
  return [
    item.title,
    item.summary_zh,
    item.summary_en,
    item.categories.join(" "),
    item.tags.join(" "),
    item.entities.map((entity) => `${entity.name} ${entity.type} ${entity.evidence_text ?? ""}`).join(" "),
    item.source_name,
    item.url,
    item.why_it_matters,
    item.evidence_notes.join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function freshnessBoost(item: RetrievalRadarItem, endMs: number) {
  const timestamp = Date.parse(item.published_at ?? item.collected_at ?? item.processed_at);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const ageDays = Math.max(0, (endMs - timestamp) / (24 * 60 * 60 * 1000));
  return Math.max(0, Math.min(1, 1 - ageDays / 7));
}
