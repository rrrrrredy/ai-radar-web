import assert from "node:assert/strict";

import { auditCrossFamilyCandidates } from "@/lib/events/cross-family-audit";
import { buildEventLayer, type ClusterableRadarItem } from "@/lib/events/clustering";

function item(
  overrides: Partial<ClusterableRadarItem> &
    Pick<ClusterableRadarItem, "id" | "source_name" | "title" | "url">
): ClusterableRadarItem {
  return {
    categories: ["model_release"],
    collected_at: "2026-07-15T04:00:00Z",
    confidence: 0.9,
    entities: [],
    evidence_notes: [],
    processed_at: "2026-07-15T04:05:00Z",
    published_at: "2026-07-15T02:00:00Z",
    scores: {
      ai_relevance: 0.98,
      credibility: 0.9,
      freshness: 0.98,
      importance: 0.9,
      novelty: 0.85,
      overall: 0.9
    },
    source_tier: "T1",
    status: "included",
    tags: [],
    ...overrides
  };
}

const openAiOfficial = item({
  entities: [
    { confidence: 0.98, name: "OpenAI", type: "company" },
    { confidence: 0.98, name: "GPT-6", type: "model" }
  ],
  id: "openai-gpt-6",
  source_name: "OpenAI News",
  summary_en: "OpenAI releases GPT-6 with a larger context window and new agent tools.",
  title: "Introducing GPT-6",
  url: "https://openai.com/index/introducing-gpt-6"
});

const mediaReport = item({
  entities: [
    { confidence: 0.98, name: "OpenAI", type: "company" },
    { confidence: 0.98, name: "GPT-6", type: "model" }
  ],
  id: "media-gpt-6",
  published_at: "2026-07-15T03:00:00Z",
  source_name: "The Verge AI",
  summary_en: "OpenAI has launched GPT-6 and added agent tooling plus a larger context window.",
  title: "OpenAI launches GPT-6 with new agent tools",
  url: "https://theverge.com/ai/openai-gpt-6-agent-tools"
});

const unrelatedProduct = item({
  categories: ["product_update"],
  entities: [
    { confidence: 0.98, name: "OpenAI", type: "company" },
    { confidence: 0.98, name: "Apple", type: "company" }
  ],
  id: "apple-openai-siri",
  source_name: "Example Product Desk",
  title: "Apple expands optional OpenAI assistance in Siri",
  url: "https://example.net/apple-openai-siri"
});

const emptyLayer = {
  curated_events: [],
  event_cluster_items: [],
  event_clusters: [],
  event_count: 0,
  timeline: []
};
const diagnostic = auditCrossFamilyCandidates(
  [openAiOfficial, mediaReport, unrelatedProduct],
  emptyLayer
);

assert.equal(diagnostic.diagnosis.current_cross_family_event_count, 0);
assert.equal(diagnostic.diagnosis.likely_clustering_rule_gap_count, 1);
assert.equal(diagnostic.near_cross_family_candidates.length, 1);
assert.deepEqual(diagnostic.near_cross_family_candidates[0].item_ids, ["openai-gpt-6", "media-gpt-6"]);
assert.equal(diagnostic.near_cross_family_candidates[0].likely_gap_type, "clustering_rule_gap");

const clusteredLayer = buildEventLayer([openAiOfficial, mediaReport]);
const clusteredAudit = auditCrossFamilyCandidates([openAiOfficial, mediaReport], clusteredLayer);
assert.equal(clusteredAudit.diagnosis.near_cross_family_candidate_count, 0);
assert.equal(clusteredAudit.diagnosis.current_cross_family_event_count, 1);

console.log("Cross-family audit tests passed");
