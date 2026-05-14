import { radarSystemPromptBoundary } from "@/lib/deepseek/prompts";
import type { RetrievalResult } from "@/lib/retrieval/types";

export const askPromptVersion = "answer-radar-question-v0.2.0";

export function buildAskMessages(question: string, retrieval: RetrievalResult) {
  return [
    {
      role: "system" as const,
      content: [
        ...radarSystemPromptBoundary,
        "Answer only from retrieved AI Radar items.",
        "Separate facts, evidence-backed inference, and uncertainty.",
        "State the time window and data-source limitations.",
        "Return strict JSON with short_answer, facts, evidence_backed_inference, and uncertainty."
      ].join("\n")
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task: "Answer a user question using retrieved AI Radar evidence.",
        prompt_version: askPromptVersion,
        question,
        time_window: retrieval.resolvedTimeWindow,
        data_source: retrieval.dataSource,
        freshness: retrieval.freshness,
        retrieved_items: retrieval.rankedItems.map(({ item, score, matchReasons }) => ({
          id: item.id,
          title: item.title,
          source_name: item.source_name,
          url: item.url,
          published_at: item.published_at,
          collected_at: item.collected_at,
          processed_at: item.processed_at,
          status: item.status,
          confidence: item.confidence,
          categories: item.categories,
          tags: item.tags,
          entities: item.entities,
          summary_zh: item.summary_zh,
          summary_en: item.summary_en,
          why_it_matters: item.why_it_matters,
          evidence_notes: item.evidence_notes,
          retrieval_score: score,
          match_reasons: matchReasons
        }))
      })
    }
  ];
}
