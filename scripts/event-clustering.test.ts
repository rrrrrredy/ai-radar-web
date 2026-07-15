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
assert.equal(
  sourceFamilyForEvent({
    source_id: "anthropic-research",
    source_name: "Anthropic Research",
    source_tier: "T1",
    url: "https://www.anthropic.com/research/tracing-thoughts"
  }),
  "公司/实验室"
);
assert.equal(
  sourceFamilyForEvent({
    source_id: "arxiv-cs-ai",
    source_name: "arXiv cs.AI",
    source_tier: "T1",
    url: "https://arxiv.org/abs/2607.12345"
  }),
  "研究订阅"
);
assert.equal(
  sourceFamilyForEvent({
    source_id: "huggingface-blog",
    source_name: "Hugging Face Blog",
    source_tier: "T1",
    url: "https://huggingface.co/blog/example-release"
  }),
  "公司/实验室"
);
assert.equal(
  sourceFamilyForEvent({
    source_id: "huggingface-transformers",
    source_name: "Hugging Face Transformers",
    source_tier: "T1",
    url: "https://github.com/huggingface/transformers/releases/tag/v5.13.0"
  }),
  "开源项目"
);

const releaseItems = ["b9994", "b9993", "b9992"].map((version, index) => radarItem({
  categories: ["open_source"],
  entities: [{ confidence: 0.98, name: "llama.cpp", type: "project" as const }],
  id: `llama-${version}`,
  published_at: `2026-07-${String(14 - index).padStart(2, "0")}T02:00:00Z`,
  source_name: "GitHub Releases",
  title: `llama.cpp 发布 ${version} 版本`,
  url: `https://github.com/ggerganov/llama.cpp/releases/tag/${version}`
}));
const llamaReleaseLayer = buildEventLayer(releaseItems);
assert.equal(llamaReleaseLayer.event_count, releaseItems.length, "adjacent llama.cpp releases must remain separate events");
for (const releaseItem of releaseItems) {
  const releaseEvent = llamaReleaseLayer.event_clusters.find((event) => event.related_item_ids.includes(releaseItem.id));
  assert.ok(releaseEvent, `expected a standalone event for ${releaseItem.id}`);
  assert.deepEqual(releaseEvent.related_item_ids, [releaseItem.id], "a release event must not absorb a different llama.cpp version");
  assert.equal(releaseEvent.timeline.length, 1);
}

const ollamaPreviousRelease = radarItem({
  categories: ["open_source"],
  entities: [{ confidence: 0.98, name: "Ollama", type: "project" as const }],
  id: "ollama-v0.12.10",
  published_at: "2026-07-13T20:00:00Z",
  source_name: "GitHub Releases",
  title: "Ollama v0.12.10 release",
  url: "https://github.com/ollama/ollama/releases/tag/v0.12.10"
});
const ollamaCurrentRelease = radarItem({
  categories: ["open_source"],
  entities: [{ confidence: 0.98, name: "Ollama", type: "project" as const }],
  id: "ollama-v0.12.11-github",
  published_at: "2026-07-14T01:00:00Z",
  source_name: "GitHub Releases",
  title: "Ollama v0.12.11 release",
  url: "https://github.com/ollama/ollama/releases/tag/v0.12.11"
});
const ollamaCurrentCoverage = radarItem({
  categories: ["open_source"],
  entities: [{ confidence: 0.98, name: "Ollama", type: "project" as const }],
  id: "ollama-0.12.11-coverage",
  published_at: "2026-07-14T02:00:00Z",
  source_name: "Example AI Media",
  title: "Ollama 0.12.11 release",
  url: "https://example.com/ollama-0-12-11-release"
});
const ollamaReleaseLayer = buildEventLayer([
  ollamaPreviousRelease,
  ollamaCurrentRelease,
  ollamaCurrentCoverage
]);
const ollamaPreviousEvent = ollamaReleaseLayer.event_clusters.find((event) =>
  event.related_item_ids.includes(ollamaPreviousRelease.id)
);
const ollamaCurrentEvent = ollamaReleaseLayer.event_clusters.find((event) =>
  event.related_item_ids.includes(ollamaCurrentRelease.id)
);
assert.ok(ollamaPreviousEvent, "expected a standalone Ollama v0.12.10 event");
assert.deepEqual(ollamaPreviousEvent.related_item_ids, [ollamaPreviousRelease.id]);
assert.ok(ollamaCurrentEvent, "expected an Ollama v0.12.11 event");
assert.deepEqual(
  new Set(ollamaCurrentEvent.related_item_ids),
  new Set([ollamaCurrentRelease.id, ollamaCurrentCoverage.id]),
  "same-release multi-source coverage should merge despite an optional v prefix"
);
assert.equal(ollamaReleaseLayer.event_count, 2, "different Ollama semantic versions must remain separate events within seven days");

const ollamaHiddenSuffixItems = [
  radarItem({
    categories: ["open_source"],
    entities: [{ confidence: 0.98, name: "Ollama", type: "project" as const }],
    id: "ollama-v0.30.0-rc22",
    published_at: "2026-07-14T02:00:00Z",
    source_name: "GitHub Releases",
    title: "Ollama v0.30.0 release",
    url: "https://github.com/ollama/ollama/releases/tag/v0.30.0-rc22"
  }),
  radarItem({
    categories: ["open_source"],
    entities: [{ confidence: 0.98, name: "Ollama", type: "project" as const }],
    id: "ollama-v0.30.0-rc23",
    published_at: "2026-07-14T03:00:00Z",
    source_name: "GitHub Releases",
    title: "Ollama v0.30.0 release",
    url: "https://github.com/ollama/ollama/releases/tag/v0.30.0-rc23"
  }),
  radarItem({
    categories: ["open_source"],
    entities: [{ confidence: 0.98, name: "Ollama", type: "project" as const }],
    id: "ollama-v0.30.0-rc23-coverage",
    published_at: "2026-07-14T04:00:00Z",
    source_name: "Example AI Media",
    title: "Ollama 0.30.0-rc23 release",
    url: "https://example.com/ollama-0-30-0-rc23"
  })
];
const ollamaHiddenSuffixLayer = buildEventLayer(ollamaHiddenSuffixItems);
const ollamaRc22Event = ollamaHiddenSuffixLayer.event_clusters.find((event) =>
  event.related_item_ids.includes("ollama-v0.30.0-rc22")
);
const ollamaRc23Event = ollamaHiddenSuffixLayer.event_clusters.find((event) =>
  event.related_item_ids.includes("ollama-v0.30.0-rc23")
);
assert.ok(ollamaRc22Event, "expected a standalone Ollama rc22 event");
assert.deepEqual(ollamaRc22Event.related_item_ids, ["ollama-v0.30.0-rc22"]);
assert.ok(ollamaRc23Event, "expected an Ollama rc23 event");
assert.deepEqual(
  new Set(ollamaRc23Event.related_item_ids),
  new Set(["ollama-v0.30.0-rc23", "ollama-v0.30.0-rc23-coverage"]),
  "the canonical rc23 tag should merge with exact cross-source coverage even when the GitHub title hides the suffix"
);
assert.equal(
  ollamaHiddenSuffixLayer.event_count,
  2,
  "distinct canonical GitHub tags must not merge when their release titles are identical"
);

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

const falseModelReleaseCases: Array<[ClusterableRadarItem, string]> = [
  [
    radarItem({
      categories: ["model_release"],
      entities: [company("OpenAI"), { confidence: 0.98, name: "GPT-5.6", type: "model" as const }],
      id: "openai-python-sdk-v2.45.0",
      source_id: "openai-python",
      source_name: "OpenAI Python SDK",
      summary_en: "The SDK release adds GPT-5.6 API fields and restores beta resource accessors.",
      title: "OpenAI Python SDK v2.45.0 release",
      url: "https://github.com/openai/openai-python/releases/tag/v2.45.0"
    }),
    "open_source"
  ],
  [
    radarItem({
      categories: ["model_release"],
      entities: [{ confidence: 0.98, name: "Hugging Face Transformers", type: "project" as const }],
      id: "transformers-v5.13.0",
      source_id: "huggingface-transformers",
      source_name: "Hugging Face Transformers",
      summary_en: "This framework release adds support for several existing model architectures.",
      title: "Hugging Face Transformers v5.13.0 release",
      url: "https://github.com/huggingface/transformers/releases/tag/v5.13.0"
    }),
    "open_source"
  ],
  [
    radarItem({
      categories: ["model_release"],
      entities: [{ confidence: 0.98, name: "llama.cpp", type: "project" as const }],
      id: "llama-cpp-b9297-category",
      source_id: "llama-cpp",
      source_name: "llama.cpp",
      summary_en: "The runtime release adds support for model tensor formats and new platform binaries.",
      title: "llama.cpp b9297 release",
      url: "https://github.com/ggml-org/llama.cpp/releases/tag/b9297"
    }),
    "open_source"
  ],
  [
    radarItem({
      categories: ["model_release"],
      id: "gem-4d-paper-category",
      source_id: "arxiv-cs-cv",
      source_name: "arXiv cs.CV",
      summary_en: "A research paper describing geometry-enhanced video world models for robot manipulation.",
      title: "GEM-4D: Geometry-Enhanced Video World Models for Robot Manipulation",
      url: "https://arxiv.org/abs/2605.22882"
    }),
    "research"
  ]
];
for (const [item, expectedCategory] of falseModelReleaseCases) {
  assert.equal(
    buildEventLayer([item]).event_clusters[0]?.category,
    expectedCategory,
    `${item.source_name} must not inherit a false model_release category`
  );
}

const actualModelReleaseCases = [
  radarItem({
    categories: ["model_release"],
    entities: [company("OpenAI"), { confidence: 0.99, name: "GPT-5.6", type: "model" as const }],
    id: "gpt-5.6-release-category",
    source_name: "OpenAI",
    source_tier: "official",
    summary_en: "OpenAI released GPT-5.6 as a new reasoning model.",
    title: "OpenAI launches GPT-5.6 reasoning model",
    url: "https://openai.com/index/gpt-5-6"
  }),
  radarItem({
    categories: ["model_release"],
    entities: [company("DeepSeek"), { confidence: 0.99, name: "DeepSeek-V4", type: "model" as const }],
    id: "deepseek-v4-release-category",
    source_name: "DeepSeek",
    source_tier: "official",
    summary_en: "DeepSeek published the DeepSeek-V4 model weights and checkpoints.",
    title: "DeepSeek releases DeepSeek-V4 model weights",
    url: "https://github.com/deepseek-ai/DeepSeek-V4"
  })
];
for (const item of actualModelReleaseCases) {
  assert.equal(
    buildEventLayer([item]).event_clusters[0]?.category,
    "model_release",
    `${item.title} should retain real model_release classification`
  );
}

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

const anthropicWorkspace = radarItem({
  categories: ["research"],
  entities: [
    company("Anthropic"),
    { confidence: 0.98, name: "Claude", type: "model" as const },
    { confidence: 0.94, name: "J-space", type: "other" as const }
  ],
  id: "anthropic-global-workspace",
  published_at: "2026-07-06T09:00:00Z",
  source_name: "Anthropic Research",
  source_tier: "T1",
  summary_en: "Anthropic reports that Claude uses an emergent global workspace called J-space.",
  title: "A global workspace in language models",
  url: "https://www.anthropic.com/research/global-workspace"
});
const mitJacobianLens = radarItem({
  categories: ["research"],
  entities: [
    company("Anthropic"),
    { confidence: 0.98, name: "Claude", type: "model" as const },
    { confidence: 0.94, name: "Jacobian lens", type: "other" as const }
  ],
  id: "mit-claude-jacobian-lens",
  published_at: "2026-07-09T06:30:00Z",
  source_name: "MIT Technology Review AI",
  summary_en: "MIT Technology Review explains the Jacobian lens finding inside Claude.",
  title: "Anthropic found a hidden space where Claude puzzles over concepts",
  url: "https://www.technologyreview.com/2026/07/09/anthropic-hidden-space"
});
const anthropicRobotics = radarItem({
  categories: ["research"],
  entities: [company("Anthropic"), { confidence: 0.98, name: "Claude", type: "model" as const }],
  id: "anthropic-robotics",
  published_at: "2026-07-05T08:00:00Z",
  source_name: "Anthropic Research",
  summary_en: "Anthropic evaluates Claude on robotics tasks.",
  title: "How Claude performs on robotics tasks",
  url: "https://www.anthropic.com/research/claude-plays-robotics"
});
const deepmindWorkspace = radarItem({
  categories: ["research"],
  entities: [company("Google DeepMind"), { confidence: 0.98, name: "Gemini", type: "model" as const }],
  id: "deepmind-global-workspace",
  published_at: "2026-07-08T08:00:00Z",
  source_name: "Google DeepMind Blog",
  summary_en: "DeepMind studies a global workspace hypothesis in Gemini.",
  title: "A global workspace hypothesis for Gemini",
  url: "https://deepmind.google/blog/global-workspace-gemini"
});
const conceptLayer = buildEventLayer([
  anthropicWorkspace,
  mitJacobianLens,
  anthropicRobotics,
  deepmindWorkspace,
  radarItem({
    categories: ["research"],
    entities: [company("Anthropic"), { confidence: 0.98, name: "Claude", type: "model" as const }],
    id: "anthropic-research-landing-page",
    published_at: "2026-07-10T08:00:00Z",
    source_name: "Anthropic Research",
    summary_en: "Anthropic research page with links to papers, articles, and research updates.",
    title: "Research",
    url: "https://www.anthropic.com/research"
  })
]);
const workspaceEvent = conceptLayer.event_clusters.find((event) => event.related_item_ids.includes(anthropicWorkspace.id));
assert.ok(workspaceEvent, "expected an Anthropic J-space event");
assert.deepEqual(
  new Set(workspaceEvent.related_item_ids),
  new Set([anthropicWorkspace.id, mitJacobianLens.id]),
  "specific concept aliases should merge the official J-space item with the Jacobian-lens coverage only"
);
assert.equal(workspaceEvent.source_families.length, 2, "the merged event should preserve cross-family coverage");
assert.equal(
  workspaceEvent.caveats.some((caveat) => caveat.includes("尚未建立来源独立性关系")),
  true,
  "cross-family coverage must disclose that source independence is unverified"
);
assert.equal(conceptLayer.event_count, 3, "robotics and another lab's global-workspace research must remain separate");
assert.equal(
  conceptLayer.event_cluster_items.some((item) => item.radar_item_id === "anthropic-research-landing-page"),
  false,
  "directory and landing-page signals must remain outside the public event evidence layer"
);

const publicationTimeItems = [
  radarItem({
    categories: ["model_release"],
    collected_at: "2026-07-14T12:00:00Z",
    entities: [company("OpenAI"), { confidence: 0.99, name: "GPT-5.7", type: "model" as const }],
    id: "gpt-5.7-official-time",
    processed_at: "2026-07-14T12:05:00Z",
    published_at: "2026-07-01T08:00:00Z",
    source_name: "OpenAI",
    source_tier: "official",
    title: "OpenAI launches GPT-5.7 reasoning model",
    url: "https://openai.com/index/gpt-5-7"
  }),
  radarItem({
    categories: ["model_release"],
    collected_at: "2026-07-03T09:00:00Z",
    entities: [company("OpenAI"), { confidence: 0.99, name: "GPT-5.7", type: "model" as const }],
    id: "gpt-5.7-coverage-time",
    processed_at: "2026-07-03T09:05:00Z",
    published_at: "2026-07-02T08:00:00Z",
    source_name: "Example AI Media",
    title: "OpenAI launches GPT-5.7 reasoning model",
    url: "https://example.com/openai-gpt-5-7"
  }),
  radarItem({
    categories: ["model_release"],
    collected_at: "2026-07-15T09:00:00Z",
    entities: [company("OpenAI"), { confidence: 0.99, name: "GPT-5.7", type: "model" as const }],
    id: "gpt-5.7-missing-publication-time",
    processed_at: "2026-07-15T09:05:00Z",
    published_at: undefined,
    source_name: "Undated Feed",
    title: "OpenAI launches GPT-5.7 reasoning model",
    url: "https://example.org/undated-openai-gpt-5-7"
  })
];
const publicationTimeLayer = buildEventLayer(publicationTimeItems);
const publicationTimeEvent = publicationTimeLayer.event_clusters.find((event) =>
  event.related_item_ids.includes("gpt-5.7-official-time")
);
assert.ok(publicationTimeEvent, "expected a GPT-5.7 event with public publication times");
assert.equal(publicationTimeEvent.first_seen_at, "2026-07-01T08:00:00Z");
assert.equal(publicationTimeEvent.latest_seen_at, "2026-07-02T08:00:00Z");
assert.deepEqual(
  publicationTimeEvent.timeline.map((entry) => entry.timestamp),
  ["2026-07-01T08:00:00Z", "2026-07-02T08:00:00Z"],
  "event time fields and timeline ordering must use published_at rather than collection or processing time"
);
assert.equal(
  publicationTimeLayer.event_cluster_items.some((item) => item.radar_item_id === "gpt-5.7-missing-publication-time"),
  false,
  "signals without a valid public published_at must fail closed instead of borrowing internal collection time"
);

console.log("Event clustering tests passed.");
