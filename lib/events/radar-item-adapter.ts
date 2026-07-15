import type { ClusterableRadarItem } from "@/lib/events/clustering";
import type { RetrievalRadarItem } from "@/lib/retrieval/types";

export function toClusterableRadarItem(item: RetrievalRadarItem): ClusterableRadarItem {
  return {
    categories: item.categories,
    collected_at: item.collected_at,
    confidence: item.confidence,
    entities: item.entities,
    evidence_notes: item.evidence_notes,
    id: item.id,
    language: item.language,
    processed_at: item.processed_at,
    published_at: item.published_at,
    scores: {
      ai_relevance: item.ai_relevance_score,
      credibility: item.credibility_score,
      freshness: item.freshness_score,
      importance: item.importance_score,
      novelty: item.novelty_score,
      overall: item.overall_score
    },
    source_id: item.source_id,
    source_name: item.source_name,
    source_tier: item.source_tier,
    status: item.status,
    summary_en: item.summary_en,
    summary_zh: item.summary_zh,
    tags: item.tags,
    title: item.title,
    url: item.url,
    why_it_matters: item.why_it_matters
  };
}
