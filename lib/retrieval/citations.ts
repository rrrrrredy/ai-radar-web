import type { RankedRadarItem, RetrievalCitation, RetrievalRadarItem } from "@/lib/retrieval/types";

export function citationFromItem(item: RetrievalRadarItem): RetrievalCitation {
  return {
    id: item.id,
    title: item.title,
    source_name: item.source_name,
    url: item.url,
    published_at: item.published_at,
    collected_at: item.collected_at,
    status: item.status,
    confidence: item.confidence
  };
}

export function buildCitations(rankedItems: RankedRadarItem[], limit = 8): RetrievalCitation[] {
  const citations = new Map<string, RetrievalCitation>();

  for (const ranked of rankedItems) {
    if (!citations.has(ranked.item.id)) {
      citations.set(ranked.item.id, citationFromItem(ranked.item));
    }

    if (citations.size >= limit) {
      break;
    }
  }

  return Array.from(citations.values());
}
