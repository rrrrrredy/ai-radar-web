import { radarSystemPromptBoundary } from "@/lib/deepseek/prompts";
import type { RetrievalResult } from "@/lib/retrieval/types";
import type { WritingAssistantRequest } from "@/lib/writing-assistant/types";

export const writingPromptVersion = "writing-assistant-v0.2.0";

export function buildWritingMessages(request: WritingAssistantRequest, retrieval: RetrievalResult) {
  return [
    {
      role: "system" as const,
      content: [
        ...radarSystemPromptBoundary,
        "You are an evidence-bound writing assistant for AI Radar.",
        "Do not invent facts or hide weak evidence.",
        "Every topic must be grounded in retrieved items and caveats.",
        "Return strict JSON with candidate_topics, counterpoints, and missing_evidence."
      ].join("\n")
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task: "Generate writing seeds from retrieved radar evidence.",
        prompt_version: writingPromptVersion,
        query: request.query,
        language: request.language,
        audience: request.audience,
        output_type: request.outputType,
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
