import assert from "node:assert/strict";

import {
  buildEventLayer,
  sourceFamilyForEvent,
  type ClusterableRadarItem
} from "@/lib/events/clustering";

function radarItem(overrides: Partial<ClusterableRadarItem> & Pick<ClusterableRadarItem, "id" | "title" | "url" | "source_name">): ClusterableRadarItem {
  return {
    categories: ["business"],
    collected_at: "2026-07-14T04:00:00Z",
    confidence: 0.85,
    entities: [],
    evidence_notes: [],
    processed_at: "2026-07-14T04:05:00Z",
    published_at: "2026-07-14T02:00:00Z",
    scores: {
      ai_relevance: 0.95,
      credibility: 0.86,
      freshness: 0.98,
      importance: 0.88,
      novelty: 0.82,
      overall: 0.87
    },
    source_tier: "T1.5",
    status: "included",
    tags: [],
    ...overrides
  };
}

function company(name: string) {
  return {
    confidence: 0.95,
    name,
    type: "company" as const
  };
}

const arsAppleLawsuit = radarItem({
  categories: ["business"],
  entities: [company("Apple"), company("OpenAI")],
  id: "ars-apple-openai-lawsuit",
  published_at: "2026-07-13T19:17:51Z",
  source_name: "Ars Technica AI",
  summary_en: "Apple sues OpenAI, alleging that a former engineer conspired with OpenAI to steal trade secrets by exploiting a bug.",
  summary_zh: "苹果起诉OpenAI，指控其与前工程师合谋利用漏洞窃取商业机密。",
  tags: ["lawsuit", "trade_secrets", "apple", "openai", "legal"],
  title: "Apple sues OpenAI after ex-engineer allegedly used bug to steal trade secrets",
  url: "https://arstechnica.com/tech-policy/2026/07/apple-sues-openai-after-ex-engineer-allegedly-used-bug-to-steal-trade-secrets"
});

const vergeAppleLawsuit = radarItem({
  categories: ["regulation"],
  entities: [company("Apple"), company("OpenAI")],
  id: "verge-apple-openai-lawsuit",
  published_at: "2026-07-13T17:00:00Z",
  source_name: "The Verge AI",
  summary_en: "Apple sues OpenAI over confidential documents, unreleased hardware samples, and monitoring of prototypes.",
  summary_zh: "苹果起诉OpenAI，指控其窃取机密文件并监视未发布的硬件原型。",
  tags: ["apple", "openai", "lawsuit", "intellectual property", "trade secrets"],
  title: "The 6 wildest claims in Apple’s lawsuit against OpenAI",
  url: "https://www.theverge.com/tech/964843/apple-openai-lawsuit-wildest-claims"
});

const appleProductUpdate = radarItem({
  categories: ["product_update"],
  entities: [company("Apple"), company("OpenAI")],
  id: "apple-openai-product-update",
  published_at: "2026-07-13T18:00:00Z",
  source_name: "Example Product Desk",
  summary_en: "Apple added optional OpenAI assistance to a Siri workflow.",
  title: "Apple adds OpenAI assistance to a new Siri workflow",
  url: "https://example.com/apple-openai-siri-workflow"
});

const metaLawsuit = radarItem({
  categories: ["regulation"],
  entities: [company("Apple"), company("Meta")],
  id: "apple-meta-lawsuit",
  published_at: "2026-07-13T18:30:00Z",
  source_name: "Example Legal Desk",
  summary_en: "Apple files a separate lawsuit against Meta over an unrelated advertising dispute.",
  title: "Apple sues Meta over a separate advertising dispute",
  url: "https://example.org/apple-meta-lawsuit"
});

const layer = buildEventLayer([
  arsAppleLawsuit,
  vergeAppleLawsuit,
  appleProductUpdate,
  metaLawsuit
]);

const corroboratedEvent = layer.event_clusters.find((event) =>
  event.related_item_ids.includes(arsAppleLawsuit.id)
);

assert.ok(corroboratedEvent, "expected an Apple/OpenAI lawsuit event");
assert.deepEqual(
  new Set(corroboratedEvent.related_item_ids),
  new Set([arsAppleLawsuit.id, vergeAppleLawsuit.id]),
  "same legal event from two media sources should merge without absorbing adjacent stories"
);
assert.equal(corroboratedEvent.source_count, 2);
assert.equal(corroboratedEvent.citations.length, 2);
assert.equal(layer.event_count, 3, "unrelated product and legal events must remain separate");

assert.equal(sourceFamilyForEvent(arsAppleLawsuit), "分析/媒体");
assert.equal(sourceFamilyForEvent(vergeAppleLawsuit), "分析/媒体");

console.log("Event clustering tests passed.");
