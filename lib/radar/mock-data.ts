import type {
  Entity,
  EventCluster,
  IngestionRun,
  RadarItem,
  Report,
  Score,
  Source
} from "@/lib/radar/types";

export const mockSources: Source[] = [
  {
    id: "demo-official-lab",
    name: "Demo Official Lab",
    url: "https://example.com/ai-radar/demo-official-lab",
    type: "official_blog",
    tier: 1,
    language: "en",
    region: "global",
    topics: ["models", "research"],
    status: "active",
    weight: 0.92,
    riskNotes: "Synthetic Phase 2 source used only for UI and schema testing.",
    lastCheckedAt: "2026-05-12T22:30:00.000Z"
  },
  {
    id: "demo-builder-notes",
    name: "Demo Builder Notes",
    url: "https://example.com/ai-radar/demo-builder-notes",
    type: "product_builder",
    tier: 2,
    language: "en",
    region: "global",
    topics: ["agents", "products"],
    status: "monitor",
    weight: 0.64,
    riskNotes: "Synthetic non-primary source. Use for interface placeholders only.",
    lastCheckedAt: "2026-05-12T20:15:00.000Z"
  },
  {
    id: "demo-open-source-index",
    name: "Demo Open Source Index",
    url: "https://example.com/ai-radar/demo-open-source-index",
    type: "github",
    tier: 2,
    language: "en",
    region: "global",
    topics: ["open-source", "tooling"],
    status: "active",
    weight: 0.74,
    riskNotes: "Synthetic public repository feed for demo rows.",
    lastCheckedAt: "2026-05-12T18:05:00.000Z"
  }
];

export const mockSourceRegistrySample: Source[] = [
  {
    id: "source-841f9d0e",
    name: "机器之心",
    url: null,
    type: "ai_media",
    tier: "unreviewed",
    language: "zh",
    region: "china",
    topics: ["domestic-media", "technical"],
    status: "needs_public_url",
    weight: 0.3,
    crawlMethod: "unknown",
    riskFlags: ["needs_public_url", "image_only_contact_removed", "manual_review_required"],
    riskNotes: "Phase 3 cleaned registry sample. Image-only contact was removed; public homepage is required before ingestion."
  },
  {
    id: "semianalysis",
    name: "SemiAnalysis",
    url: "https://semianalysis.com/",
    type: "tech_media",
    tier: "T2",
    language: "en",
    region: "overseas",
    topics: ["infrastructure", "technical"],
    status: "active",
    weight: 0.58,
    crawlMethod: "html",
    riskFlags: ["paywall_possible", "rss_missing", "duplicate_possible"],
    riskNotes: "Cleaned public source with duplicate entries merged; paywall and missing RSS need review."
  },
  {
    id: "lex-fridman",
    name: "Lex Fridman",
    url: "https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1434243584",
    type: "podcast",
    tier: "T2",
    language: "mixed",
    region: "global",
    topics: ["podcast", "interview"],
    status: "active",
    weight: 0.58,
    crawlMethod: "podcast_feed",
    riskFlags: [],
    riskNotes: "Cleaned podcast source with an explicit public RSS feed recorded in the registry."
  },
  {
    id: "x-lilianweng",
    name: "Lilian Weng",
    url: "https://x.com/lilianweng",
    type: "x_account",
    tier: "T1.5",
    language: "mixed",
    region: "global",
    topics: ["x-account", "technical"],
    status: "trial",
    weight: 0.78,
    crawlMethod: "x_api_future",
    riskFlags: ["x_api_required_or_manual"],
    riskNotes: "High-signal public X account retained for a future API or manual workflow."
  }
];

export const mockRadarItems: RadarItem[] = [
  {
    id: "demo-radar-model-release",
    rawItemId: "demo-raw-model-release",
    sourceId: "demo-official-lab",
    title: "Example AI model release",
    summaryZh: "示例实验室发布了一个合成模型更新，用于展示雷达条目的可信度、重要性和双语摘要字段。",
    summaryEn:
      "A synthetic lab announcement used to demonstrate credibility, importance, and bilingual summary fields.",
    topics: ["models", "research"],
    category: "Models",
    region: "Global",
    status: "published",
    confidence: "high",
    credibilityScore: 0.9,
    noveltyScore: 0.72,
    importanceScore: 0.78,
    createdAt: "2026-05-12T08:00:00.000Z",
    updatedAt: "2026-05-12T12:00:00.000Z"
  },
  {
    id: "demo-radar-agent-product",
    rawItemId: "demo-raw-agent-product",
    sourceId: "demo-builder-notes",
    title: "Example agent product update",
    summaryZh: "一个合成产品团队展示了代理工作流改进，用于说明产品、公司和功能信号的展示方式。",
    summaryEn:
      "A synthetic product-team update used to show how agent workflow, company, and product signals appear.",
    topics: ["agents", "products"],
    category: "Products",
    region: "Global",
    status: "reviewed",
    confidence: "medium",
    credibilityScore: 0.64,
    noveltyScore: 0.68,
    importanceScore: 0.61,
    createdAt: "2026-05-12T09:30:00.000Z",
    updatedAt: "2026-05-12T11:15:00.000Z"
  },
  {
    id: "demo-radar-open-source",
    rawItemId: "demo-raw-open-source",
    sourceId: "demo-open-source-index",
    title: "Example open-source project milestone",
    summaryZh: "一个合成开源项目达到里程碑，用于展示开源生态、工具链和社区信号。",
    summaryEn:
      "A synthetic open-source milestone used to display ecosystem, tooling, and community signals.",
    topics: ["open-source", "tooling"],
    category: "Open source",
    region: "Global",
    status: "published",
    confidence: "medium",
    credibilityScore: 0.72,
    noveltyScore: 0.58,
    importanceScore: 0.66,
    createdAt: "2026-05-12T10:45:00.000Z",
    updatedAt: "2026-05-12T13:10:00.000Z"
  }
];

export const mockEventClusters: EventCluster[] = [
  {
    id: "demo-cluster-model-release",
    titleZh: "示例模型发布事件",
    titleEn: "Example model release event",
    summaryZh:
      "该聚类把同一真实世界事件的公告、后续分析和生态反馈聚合在一起，而不是按文章标题简单合并。",
    summaryEn:
      "This cluster groups announcements, follow-up analysis, and ecosystem reactions by real-world event instead of matching article titles.",
    status: "published",
    confidence: "high",
    importanceScore: 0.79,
    firstSeenAt: "2026-05-12T08:00:00.000Z",
    updatedAt: "2026-05-12T12:10:00.000Z",
    radarItemIds: ["demo-radar-model-release"],
    entityIds: ["demo-entity-model", "demo-entity-lab"],
    openQuestions: [
      "Which benchmark claims need independent confirmation?",
      "Which product surfaces will expose the model first?"
    ]
  },
  {
    id: "demo-cluster-agent-tools",
    titleZh: "示例代理工具更新",
    titleEn: "Example agent tooling update",
    summaryZh:
      "该聚类展示产品更新、开源里程碑和开发者反馈如何成为同一趋势的多个证据。",
    summaryEn:
      "This cluster shows how product updates, open-source milestones, and builder feedback can become evidence for one trend.",
    status: "reviewed",
    confidence: "medium",
    importanceScore: 0.64,
    firstSeenAt: "2026-05-12T09:30:00.000Z",
    updatedAt: "2026-05-12T13:10:00.000Z",
    radarItemIds: ["demo-radar-agent-product", "demo-radar-open-source"],
    entityIds: ["demo-entity-product", "demo-entity-project"],
    openQuestions: [
      "Is adoption broad or limited to early users?",
      "Which workflow metrics are observable from public evidence?"
    ]
  }
];

export const mockEntities: Entity[] = [
  {
    id: "demo-entity-lab",
    type: "company",
    name: "Example AI Lab",
    aliases: ["Demo Lab"],
    description: "Synthetic organization used to exercise company/entity UI states.",
    homepageUrl: "https://example.com/ai-radar/entities/example-ai-lab",
    metadata: {
      region: "global",
      demo: true
    }
  },
  {
    id: "demo-entity-model",
    type: "model",
    name: "Example Model V",
    aliases: ["Example V"],
    description: "Synthetic model entity for radar linking and report placeholders.",
    homepageUrl: "https://example.com/ai-radar/entities/example-model-v",
    metadata: {
      modality: "text",
      demo: true
    }
  },
  {
    id: "demo-entity-product",
    type: "product",
    name: "Example Agent Workspace",
    aliases: ["Agent Workspace Demo"],
    description: "Synthetic agent product entity used for product tracking cards.",
    homepageUrl: "https://example.com/ai-radar/entities/example-agent-workspace",
    metadata: {
      category: "agents",
      demo: true
    }
  },
  {
    id: "demo-entity-project",
    type: "project",
    name: "Example Open Agent Kit",
    aliases: ["Open Agent Kit Demo"],
    description: "Synthetic open-source project entity for ecosystem tracking.",
    homepageUrl: "https://example.com/ai-radar/entities/example-open-agent-kit",
    metadata: {
      category: "open-source",
      demo: true
    }
  }
];

export const mockScores: Score[] = [
  {
    id: "demo-score-credibility",
    targetType: "radar_item",
    targetId: "demo-radar-model-release",
    scoreType: "credibility",
    score: 0.9,
    explanation: "Primary synthetic source with clear attribution.",
    model: "rules-v0",
    ruleVersion: "phase-2-demo",
    createdAt: "2026-05-12T12:00:00.000Z"
  },
  {
    id: "demo-score-velocity",
    targetType: "event_cluster",
    targetId: "demo-cluster-agent-tools",
    scoreType: "velocity",
    score: 0.55,
    explanation: "Multiple synthetic signals but no verified independent adoption data.",
    model: "rules-v0",
    ruleVersion: "phase-2-demo",
    createdAt: "2026-05-12T13:00:00.000Z"
  }
];

export const mockReports: Report[] = [
  {
    id: "demo-report-daily",
    type: "daily",
    title: "Demo daily AI radar brief",
    language: "bilingual",
    timeWindowStart: "2026-05-12T00:00:00.000Z",
    timeWindowEnd: "2026-05-12T23:59:59.000Z",
    body: "Phase 2 placeholder. Future daily reports will rank events, explain importance, cite evidence, and state uncertainty.",
    status: "draft",
    createdAt: "2026-05-12T14:00:00.000Z"
  },
  {
    id: "demo-report-weekly",
    type: "weekly",
    title: "Demo weekly trend synthesis",
    language: "bilingual",
    timeWindowStart: "2026-05-06T00:00:00.000Z",
    timeWindowEnd: "2026-05-12T23:59:59.000Z",
    body: "Phase 2 placeholder. Future weekly reports will synthesize models, agents, infrastructure, papers, funding, and regulation.",
    status: "draft",
    createdAt: "2026-05-12T15:00:00.000Z"
  }
];

export const mockIngestionRuns: IngestionRun[] = [
  {
    id: "demo-ingestion-001",
    startedAt: "2026-05-12T20:00:00.000Z",
    finishedAt: "2026-05-12T20:03:00.000Z",
    status: "succeeded",
    trigger: "scheduled",
    sourceCount: 3,
    rawItemCount: 8,
    radarItemCount: 3,
    errorCount: 0,
    metadata: {
      demo: true,
      scheduler: "placeholder"
    }
  },
  {
    id: "demo-ingestion-002",
    startedAt: "2026-05-12T22:00:00.000Z",
    finishedAt: "2026-05-12T22:04:30.000Z",
    status: "partial",
    trigger: "manual",
    sourceCount: 3,
    rawItemCount: 5,
    radarItemCount: 2,
    errorCount: 1,
    metadata: {
      demo: true,
      note: "Synthetic partial run for admin UI"
    }
  }
];
