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
assert.equal(corroboratedEvent.category, "regulation", "legal events must not inherit a generic business impact template");
assert.deepEqual(
  new Set(corroboratedEvent.related_item_ids),
  new Set([arsAppleLawsuit.id, vergeAppleLawsuit.id]),
  "same legal event from two media sources should merge without absorbing adjacent stories"
);
assert.equal(corroboratedEvent.source_count, 2);
assert.equal(corroboratedEvent.citations.length, 2);
assert.equal(corroboratedEvent.source_families.length, 1);
assert.equal(corroboratedEvent.event_score <= 77, true, "same-family multi-source coverage must not enter the high-priority score band");
assert.equal(layer.event_count, 3, "unrelated product and legal events must remain separate");

assert.equal(sourceFamilyForEvent(arsAppleLawsuit), "分析/媒体");
assert.equal(sourceFamilyForEvent(vergeAppleLawsuit), "分析/媒体");

const releaseItems = ["b9994", "b9993", "b9992"].map((version, index) => radarItem({
  categories: ["open_source"],
  entities: [{ confidence: 0.98, name: "llama.cpp", type: "project" as const }],
  id: `llama-${version}`,
  published_at: `2026-07-${String(14 - index).padStart(2, "0")}T02:00:00Z`,
  source_name: "GitHub Releases",
  title: `llama.cpp 发布 ${version} 版本`,
  url: `https://github.com/ggerganov/llama.cpp/releases/tag/${version}`
}));
const vllmRelease = radarItem({
  categories: ["open_source"],
  entities: [{ confidence: 0.98, name: "vLLM", type: "project" as const }],
  id: "vllm-v0.25.0",
  published_at: "2026-07-14T01:00:00Z",
  source_name: "GitHub Releases",
  title: "vLLM 发布 v0.25.0 版本",
  url: "https://github.com/vllm-project/vllm/releases/tag/v0.25.0"
});
const releaseLayer = buildEventLayer([...releaseItems, vllmRelease]);
const llamaReleaseSeries = releaseLayer.event_clusters.find((event) => event.related_item_ids.includes("llama-b9994"));
assert.ok(llamaReleaseSeries, "expected a llama.cpp release series");
assert.deepEqual(new Set(llamaReleaseSeries.related_item_ids), new Set(releaseItems.map((item) => item.id)));
assert.equal(llamaReleaseSeries.timeline.length, 3, "consecutive releases from the same project should become one version timeline");
assert.equal(releaseLayer.event_count, 2, "a different project release must remain a separate event");

const semanticKernelTracks = [
  radarItem({
    categories: ["open_source"],
    entities: [{ confidence: 0.98, name: "Microsoft Semantic Kernel", type: "project" as const }],
    id: "semantic-kernel-python",
    source_name: "GitHub Releases",
    title: "Microsoft Semantic Kernel 发布 python-1.44.0 版本",
    url: "https://github.com/microsoft/semantic-kernel/releases/tag/python-1.44.0"
  }),
  radarItem({
    categories: ["open_source"],
    entities: [{ confidence: 0.98, name: "Microsoft Semantic Kernel", type: "project" as const }],
    id: "semantic-kernel-dotnet",
    source_name: "GitHub Releases",
    title: "Microsoft Semantic Kernel 发布 dotnet-1.78.0 版本",
    url: "https://github.com/microsoft/semantic-kernel/releases/tag/dotnet-1.78.0"
  })
];
assert.equal(buildEventLayer(semanticKernelTracks).event_count, 2, "different release tracks in one repository must remain separate events");

const historicalItem = radarItem({
  categories: ["model_release"],
  entities: [company("OpenAI")],
  id: "historical-openai-release",
  published_at: "2025-01-10T02:00:00Z",
  source_name: "OpenAI",
  source_tier: "official",
  title: "OpenAI launches archived model release",
  url: "https://openai.com/index/archived-model-release"
});
const freshnessLayer = buildEventLayer([historicalItem, arsAppleLawsuit, vergeAppleLawsuit]);
assert.equal(
  freshnessLayer.curated_events.some((event) => event.related_item_ids.includes(historicalItem.id)),
  false,
  "events older than 30 days relative to the latest evidence must not enter the curated view"
);

console.log("Event clustering tests passed.");
