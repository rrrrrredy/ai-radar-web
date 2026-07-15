import { createHash } from "node:crypto";

import { assessPublicSignalQuality, type PublicSignalQuality } from "@/lib/radar/public-signal-quality";
import type { RetrievalLanguage } from "@/lib/retrieval/types";
import type { RadarCategory, UnderstandingEntity, UnderstandingStatus } from "@/lib/understanding/types";

export type EventScoreLabel = "高优先级" | "关注" | "观察" | "噪音/低相关";

export type ClusterableRadarItem = {
  id: string;
  source_id?: string;
  title: string;
  url: string;
  source_name: string;
  status: UnderstandingStatus;
  language?: RetrievalLanguage;
  published_at?: string;
  collected_at: string;
  processed_at: string;
  summary_zh?: string;
  summary_en?: string;
  categories: RadarCategory[];
  tags: string[];
  source_tier: string;
  confidence: number;
  scores: {
    ai_relevance: number;
    credibility: number;
    freshness: number;
    importance: number;
    novelty: number;
    overall: number;
  };
  why_it_matters?: string;
  evidence_notes: string[];
  entities?: UnderstandingEntity[];
};

export type PublicEventTimelineEntry = {
  item_id: string;
  title: string;
  source_name: string;
  timestamp: string;
  url: string;
};

export type PublicEventCitation = {
  item_id: string;
  title: string;
  source_name: string;
  url: string;
  published_at?: string;
  collected_at: string;
};

export type PublicEventCluster = {
  event_cluster_id: string;
  canonical_title: string;
  summary_zh: string;
  category: string;
  event_score: number;
  event_score_label: EventScoreLabel;
  score_reason: string;
  source_count: number;
  source_tier_max: string;
  source_families: string[];
  first_seen_at: string;
  latest_seen_at: string;
  related_item_ids: string[];
  related_entities: string[];
  timeline: PublicEventTimelineEntry[];
  citations: PublicEventCitation[];
  caveats: string[];
};

export type PublicEventClusterItem = {
  event_cluster_id: string;
  radar_item_id: string;
  role: "primary" | "supporting";
  source_name: string;
};

export type PublicTimelineEntry = PublicEventTimelineEntry & {
  event_cluster_id: string;
  event_title: string;
  event_score_label: EventScoreLabel;
};

export type PublicEventLayer = {
  event_clusters: PublicEventCluster[];
  event_cluster_items: PublicEventClusterItem[];
  event_count: number;
  curated_events: PublicEventCluster[];
  timeline: PublicTimelineEntry[];
};

type WorkingCluster = {
  idSeed: string;
  items: ClusterableRadarItem[];
  keywords: Set<string>;
  entities: Set<string>;
  categories: Set<string>;
  strongEntities: Set<string>;
};

type ScoredCandidate = {
  cluster: WorkingCluster;
  score: number;
};

const genericEntityTerms = new Set([
  "ai",
  "agent",
  "agents",
  "model",
  "models",
  "llm",
  "open source",
  "research",
  "paper",
  "benchmark",
  "tool",
  "tools",
  "人工智能",
  "智能体",
  "模型",
  "大模型",
  "研究",
  "开源",
  "工具",
  "基准"
]);

const stopwords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "about",
  "after",
  "this",
  "that",
  "new",
  "update",
  "release",
  "launch",
  "announces",
  "announced",
  "says",
  "will",
  "can",
  "how",
  "why",
  "what",
  "发布",
  "推出",
  "更新",
  "宣布",
  "上线",
  "开源",
  "最新",
  "如何",
  "为什么",
  "什么"
]);

const knownEntityPatterns = [
  "openai",
  "anthropic",
  "google",
  "deepmind",
  "gemini",
  "meta",
  "llama",
  "deepseek",
  "qwen",
  "通义",
  "kimi",
  "moonshot",
  "minimax",
  "mistral",
  "perplexity",
  "xai",
  "grok",
  "cursor",
  "github",
  "copilot",
  "hugging face",
  "huggingface",
  "nvidia",
  "英伟达",
  "microsoft",
  "微软",
  "apple",
  "苹果"
];

const eventActionPatterns = [
  ["legal", /\b(?:sue|sues|sued|suing|lawsuit|litigation|court|complaint)\b|诉讼|起诉|法律行动/i],
  ["funding", /\b(?:raise|raises|raised|funding|fundraise|financing|investment)\b|融资|投资/i],
  ["acquisition", /\b(?:acquire|acquires|acquired|acquisition|buyout|merger)\b|收购|并购/i]
] as const;

const eventConceptPatterns = [
  {
    anchors: [/\banthropic\b/i, /\bclaude\b/i],
    aliases: [/\bj[ -]?space\b/i, /\bjacobian lens\b/i, /\bglobal workspace\b/i],
    name: "anthropic-claude-j-space"
  }
] as const;

const itemKeywordCache = new WeakMap<ClusterableRadarItem, string[]>();
const itemEntityCache = new WeakMap<ClusterableRadarItem, string[]>();
const itemStrongEntityCache = new WeakMap<ClusterableRadarItem, string[]>();
const itemEventConceptCache = new WeakMap<ClusterableRadarItem, string[]>();
const signalQualityCache = new WeakMap<ClusterableRadarItem, PublicSignalQuality>();
const normalizedTextCache = new Map<string, string>();

export function buildEventLayer(items: ClusterableRadarItem[]): PublicEventLayer {
  const publicItems = items
    .filter((item) => item.status === "included" || item.status === "needs_review")
    .filter((item) => !signalQuality(item).isLowEventSignal)
    .sort(compareClusterInputItems);
  const clusters = clusterItems(publicItems).map(materializeCluster).sort(compareEvents);
  const eventClusterItems = clusters.flatMap((cluster) =>
    cluster.related_item_ids.map((radarItemId, index) => ({
      event_cluster_id: cluster.event_cluster_id,
      radar_item_id: radarItemId,
      role: index === 0 ? "primary" as const : "supporting" as const,
      source_name: cluster.timeline.find((entry) => entry.item_id === radarItemId)?.source_name ?? "未知来源"
    }))
  );
  const curatedEvents = selectCuratedEvents(clusters);
  const timeline = clusters
    .flatMap((event) =>
      event.timeline.map((entry) => ({
        ...entry,
        event_cluster_id: event.event_cluster_id,
        event_score_label: event.event_score_label,
        event_title: event.canonical_title
      }))
    )
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, 80);

  return {
    curated_events: curatedEvents,
    event_cluster_items: eventClusterItems,
    event_clusters: clusters,
    event_count: clusters.length,
    timeline
  };
}

export function filterPublicDisplayEventLayer(layer: PublicEventLayer): PublicEventLayer {
  const events = layer.event_clusters.filter(isPublicDisplayEvent).sort(compareEvents);
  const eventIds = new Set(events.map((event) => event.event_cluster_id));
  const curated = layer.curated_events.filter((event) => eventIds.has(event.event_cluster_id));
  const fallbackCurated = selectCuratedEvents(events);

  return {
    curated_events: (curated.length > 0 ? curated : fallbackCurated).slice(0, 8),
    event_cluster_items: layer.event_cluster_items.filter((item) => eventIds.has(item.event_cluster_id)),
    event_clusters: events,
    event_count: events.length,
    timeline: layer.timeline.filter((entry) => eventIds.has(entry.event_cluster_id)).slice(0, 80)
  };
}

export function isPublicDisplayEvent(event: PublicEventCluster) {
  return event.event_score_label !== "噪音/低相关" && event.event_score >= 45 && !looksLikeSourcePageEvent(event);
}

function compareClusterInputItems(left: ClusterableRadarItem, right: ClusterableRadarItem) {
  const timestampDelta = Date.parse(itemTimestamp(right)) - Date.parse(itemTimestamp(left));
  if (timestampDelta !== 0) return timestampDelta;

  const titleDelta = left.title.localeCompare(right.title);
  if (titleDelta !== 0) return titleDelta;

  return left.id.localeCompare(right.id);
}

export function sourceFamilyForEvent(
  item: Pick<ClusterableRadarItem, "source_id" | "source_name" | "url" | "source_tier">
) {
  const domain = safeDomain(item.url);
  const sourceId = item.source_id ?? "";
  const text = `${sourceId} ${item.source_name} ${domain} ${item.source_tier}`.toLowerCase();

  if (domain === "arxiv.org" || domain === "rss.arxiv.org" || /\barxiv\b|paper feed|journal/.test(text)) {
    return "研究订阅";
  }

  if (domain === "github.com" || /github|sdk releases?|repository releases?/.test(text)) {
    return "开源项目";
  }

  if (
    [
      "anthropic.com",
      "ai.google.dev",
      "ai.meta.com",
      "blog.google",
      "blogs.nvidia.com",
      "claude.com",
      "deepmind.google",
      "developer.nvidia.com",
      "huggingface.co",
      "microsoft.com",
      "openai.com",
      "techcommunity.microsoft.com"
    ].some((officialDomain) => domain === officialDomain || domain.endsWith(`.${officialDomain}`)) ||
    ["openai", "anthropic", "google deepmind", "google gemini", "meta ai", "microsoft foundry", "nvidia"].some((term) => text.includes(term))
  ) {
    return "公司/实验室";
  }

  if (text.includes("research") || text.includes("paper")) return "研究订阅";
  if (text.includes("hugging face") || text.includes("huggingface")) return "开源项目";
  if ([
    "lex",
    "every",
    "latent",
    "lenny",
    "benedict",
    "karpathy",
    "newsletter",
    "media",
    "techcrunch",
    "venturebeat",
    "theverge",
    "the verge",
    "technologyreview",
    "technology review",
    "arstechnica",
    "ars technica"
  ].some((term) => text.includes(term))) return "分析/媒体";
  return "其他公开来源";
}

function clusterItems(items: ClusterableRadarItem[]) {
  const clusters: WorkingCluster[] = [];

  for (const item of items) {
    const candidate = bestClusterCandidate(clusters, item);

    if (candidate && candidate.score >= 0.58) {
      candidate.cluster.items.push(item);
      mergeSignals(candidate.cluster, item);
      continue;
    }

    clusters.push(newCluster(item));
  }

  return clusters;
}

function bestClusterCandidate(clusters: WorkingCluster[], item: ClusterableRadarItem): ScoredCandidate | null {
  let best: ScoredCandidate | null = null;

  for (const cluster of clusters) {
    const score = clusterSimilarity(cluster, item);
    if (!best || score > best.score) {
      best = { cluster, score };
    }
  }

  return best;
}

function newCluster(item: ClusterableRadarItem): WorkingCluster {
  const cluster: WorkingCluster = {
    categories: new Set(),
    entities: new Set(),
    idSeed: titleFingerprint(item.title) || item.id,
    items: [item],
    keywords: new Set(),
    strongEntities: new Set()
  };
  mergeSignals(cluster, item);
  return cluster;
}

function mergeSignals(cluster: WorkingCluster, item: ClusterableRadarItem) {
  for (const keyword of itemKeywords(item)) cluster.keywords.add(keyword);
  for (const entity of itemEntities(item)) cluster.entities.add(entity);
  for (const entity of strongItemEntities(item)) cluster.strongEntities.add(entity);
  for (const category of item.categories) cluster.categories.add(category);
}

function clusterSimilarity(cluster: WorkingCluster, item: ClusterableRadarItem) {
  const itemKeywordSet = new Set(itemKeywords(item));
  const itemEntitySet = new Set(itemEntities(item));
  const strongItemEntitySet = new Set(strongItemEntities(item));
  const itemCategorySet = new Set(item.categories);
  const keywordOverlap = jaccard(cluster.keywords, itemKeywordSet);
  const entityOverlap = jaccard(cluster.entities, itemEntitySet);
  const categoryOverlap = jaccard(cluster.categories, itemCategorySet);
  const titleOverlap = Math.max(...cluster.items.map((clusterItem) => titleSimilarity(clusterItem.title, item.title)), 0);
  const timeScore = Math.max(...cluster.items.map((clusterItem) => timeWindowScore(clusterItem, item)), 0);
  const domainScore = cluster.items.some((clusterItem) => safeDomain(clusterItem.url) === safeDomain(item.url)) ? 0.08 : 0;
  const sourceNameOverlap = cluster.items.some((clusterItem) => normalizeEntity(clusterItem.source_name) === normalizeEntity(item.source_name));
  const openSourceProjectConflict =
    sourceFamilyForEvent(item) === "开源项目" &&
    cluster.items.some((clusterItem) => sourceFamilyForEvent(clusterItem) === "开源项目") &&
    !sourceNameOverlap;
  const versionConflict = cluster.items.some((clusterItem) => hasVersionConflict(clusterItem.title, item.title));
  const releaseSeriesMatch = cluster.items.some((clusterItem) => isSameReleaseSeries(clusterItem, item));
  const partnerConflict = cluster.items.some((clusterItem) => hasPartnerConflict(clusterItem, item));
  const strongEntityConflict =
    cluster.strongEntities.size > 0 &&
    strongItemEntitySet.size > 0 &&
    intersectionSize(cluster.strongEntities, strongItemEntitySet) === 0;
  const weakGenericOnly = entityOverlap > 0 && intersectionValues(cluster.entities, itemEntitySet).every((entity) => genericEntityTerms.has(entity));
  const sharedStrongEntityCount = canonicalStrongEntityOverlap(cluster.strongEntities, strongItemEntitySet);
  const specificEventActionMatch = cluster.items.some((clusterItem) => sharesSpecificEventAction(clusterItem.title, item.title));
  const specificEventConceptMatch = cluster.items.some((clusterItem) => sharesSpecificEventConcept(clusterItem, item));
  const corroboratedActionMatch =
    specificEventActionMatch &&
    sharedStrongEntityCount >= 2 &&
    timeScore >= 0.7 &&
    titleOverlap >= 0.04 &&
    keywordOverlap >= 0.12;
  const corroboratedConceptMatch =
    specificEventConceptMatch &&
    sharedStrongEntityCount >= 2 &&
    timeScore >= 0.35;

  if (openSourceProjectConflict && !releaseSeriesMatch && (versionConflict || isReleaseVersionTitle(item.title) || cluster.items.some((clusterItem) => isReleaseVersionTitle(clusterItem.title)))) {
    return 0;
  }

  if (partnerConflict) {
    return 0;
  }

  if (versionConflict && !releaseSeriesMatch) {
    return 0;
  }

  let score =
    titleOverlap * 0.34 +
    entityOverlap * 0.24 +
    keywordOverlap * 0.18 +
    categoryOverlap * 0.12 +
    timeScore * 0.08 +
    domainScore;

  if (corroboratedActionMatch) {
    score += 0.28;
  }

  if (corroboratedConceptMatch) {
    score = Math.max(score, 0.72);
  }

  if (releaseSeriesMatch) {
    score = Math.max(score, 0.66);
  }

  if (strongEntityConflict && titleOverlap < 0.72) {
    score -= 0.32;
  }

  if (openSourceProjectConflict && titleOverlap < 0.78) {
    score -= 0.34;
  }

  if (partnerConflict && titleOverlap < 0.86) {
    score -= 0.32;
  }

  if (weakGenericOnly && titleOverlap < 0.7) {
    score -= 0.18;
  }

  return Math.max(0, Math.min(1, score));
}

function materializeCluster(cluster: WorkingCluster): PublicEventCluster {
  const items = [...cluster.items].sort(compareClusterItems);
  const primary = items[0];
  const sourceFamilies = unique(items.map(sourceFamilyForEvent));
  const sourceNames = unique(items.map((item) => item.source_name));
  const relatedItemIds = items.map((item) => item.id);
  const canonicalTitle = publicEventTitle(primary);
  const timeline = items
    .map((item) => ({
      item_id: item.id,
      source_name: item.source_name,
      timestamp: itemTimestamp(item),
      title: item.title,
      url: item.url
    }))
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const citations = items.slice(0, 6).map((item) => ({
    collected_at: item.collected_at,
    item_id: item.id,
    published_at: item.published_at,
    source_name: item.source_name,
    title: item.title,
    url: item.url
  }));
  const score = eventScore(items, sourceFamilies, sourceNames);
  const label = eventScoreLabel(score);
  const relatedEntities = unique(items.flatMap(itemEntities)).filter((entity) => !genericEntityTerms.has(entity)).slice(0, 10);
  const firstSeen = timeline[0]?.timestamp ?? itemTimestamp(primary);
  const latestSeen = timeline[timeline.length - 1]?.timestamp ?? itemTimestamp(primary);

  return {
    canonical_title: canonicalTitle,
    category: dominantCategory(items),
    caveats: eventCaveats(items, sourceFamilies),
    citations,
    event_cluster_id: stableEventId(cluster.idSeed, relatedItemIds),
    event_score: score,
    event_score_label: label,
    first_seen_at: firstSeen,
    latest_seen_at: latestSeen,
    related_entities: relatedEntities,
    related_item_ids: relatedItemIds,
    score_reason: scoreReason(score, sourceNames.length, sourceFamilies, primary),
    source_count: sourceNames.length,
    source_families: sourceFamilies,
    source_tier_max: bestSourceTier(items.map((item) => item.source_tier)),
    summary_zh: publicSummary(primary, items, sourceFamilies),
    timeline
  };
}

function compareEvents(left: PublicEventCluster, right: PublicEventCluster) {
  return right.event_score - left.event_score ||
    right.source_count - left.source_count ||
    Date.parse(right.latest_seen_at) - Date.parse(left.latest_seen_at) ||
    left.canonical_title.localeCompare(right.canonical_title, "zh-CN");
}

function compareCuratedEvents(left: PublicEventCluster, right: PublicEventCluster) {
  const editorialDelta = editorialPriority(right) - editorialPriority(left);
  if (editorialDelta !== 0) return editorialDelta;

  const scoreDelta = right.event_score - left.event_score;
  if (scoreDelta !== 0) return scoreDelta;

  const multiSourceDelta = Number(right.source_count > 1) - Number(left.source_count > 1);
  if (multiSourceDelta !== 0) return multiSourceDelta;

  return right.source_count - left.source_count ||
    Date.parse(right.latest_seen_at) - Date.parse(left.latest_seen_at) ||
    left.canonical_title.localeCompare(right.canonical_title, "zh-CN");
}

function selectCuratedEvents(events: PublicEventCluster[]) {
  const referenceTime = Math.max(...events.map((event) => Date.parse(event.latest_seen_at)).filter(Number.isFinite), 0);
  const eligible = events
    .filter((event) => isCuratedEventCandidate(event, referenceTime))
    .sort(compareCuratedEvents);
  const selected: PublicEventCluster[] = [];

  for (const event of eligible.filter((candidate) => candidate.source_count > 1)) {
    addCurated(selected, event);
  }

  for (const event of eligible.filter((candidate) => candidate.source_count === 1 && editorialPriority(candidate) >= 3)) {
    addCurated(selected, event);
  }

  for (const event of eligible) {
    addCurated(selected, event);
  }

  return selected.slice(0, 8);
}

function addCurated(selected: PublicEventCluster[], event: PublicEventCluster) {
  if (selected.length >= 8 || selected.some((candidate) => candidate.event_cluster_id === event.event_cluster_id)) {
    return;
  }

  selected.push(event);
}

function isCuratedEventCandidate(event: PublicEventCluster, referenceTime: number) {
  if (!isPublicDisplayEvent(event) || event.event_score < 62 || looksLikeSourcePageEvent(event)) {
    return false;
  }

  const latestSeen = Date.parse(event.latest_seen_at);
  if (referenceTime > 0 && Number.isFinite(latestSeen) && referenceTime - latestSeen > 30 * 24 * 60 * 60 * 1000) {
    return false;
  }

  if (event.source_count <= 1 && event.event_score < 70) {
    return false;
  }

  if (event.source_count <= 1 && event.source_families.length <= 1 && event.source_families[0] === "研究订阅" && event.event_score < 74) {
    return false;
  }

  return editorialPriority(event) > 0;
}

function editorialPriority(event: PublicEventCluster) {
  const text = `${event.canonical_title} ${event.summary_zh} ${event.category} ${event.related_entities.join(" ")} ${event.source_families.join(" ")}`.toLowerCase();
  let priority = 0;

  if (event.source_count > 1) priority += 4;
  if (event.source_families.length > 1) priority += 2;
  if (/official|公司\/实验室/.test(`${event.source_tier_max} ${event.source_families.join(" ")}`.toLowerCase())) priority += 2;
  if (/model_release|product_update|tooling|infrastructure|benchmark|safety|policy|regulation|business|funding|open_source/.test(event.category)) priority += 3;
  if (/openai|anthropic|google|deepmind|meta|llama|deepseek|qwen|kimi|microsoft|nvidia|hugging face|github|copilot|mistral|gemini|claude|gpt|codex/.test(text)) priority += 2;
  if (/发布|推出|上线|合作|融资|收购|开源|基准|安全|监管|release|launch|partner|funding|acquire|benchmark|agent|tool|api/.test(text)) priority += 2;
  if (event.source_families.length === 1 && event.source_families[0] === "研究订阅") priority -= 2;
  if (event.caveats.some((caveat) => caveat.includes("单条公开信号"))) priority -= 1;

  return priority;
}

function looksLikeSourcePageEvent(event: PublicEventCluster) {
  const text = `${event.canonical_title} ${event.summary_zh} ${event.score_reason} ${event.citations.map((citation) => `${citation.title} ${citation.source_name}`).join(" ")}`.toLowerCase();
  const hasBareRootCitation = event.citations.some((citation) => isBareRootUrl(citation.url));

  if (hasBareRootCitation && !/发布|推出|上线|合作|融资|收购|开源|基准|安全|监管|release|launch|partner|funding|acquire|benchmark|api|sdk|model|agent|tool/i.test(text)) {
    return true;
  }

  return /\b(homepage|landing page|substack|publication|subscriber|articles|stories|thoughts|newsroom|documentation|docs|overview|repository metadata)\b/.test(text) ||
    /主页|目录页|入口页|出版物|订阅者|文章列表|个人博客|个人网站|博客主要|仓库元数据|文档入口/.test(text);
}

function compareClusterItems(left: ClusterableRadarItem, right: ClusterableRadarItem) {
  return eventAdjustedScore(right) - eventAdjustedScore(left) ||
    right.scores.importance - left.scores.importance ||
    Date.parse(itemTimestamp(right)) - Date.parse(itemTimestamp(left)) ||
    left.title.localeCompare(right.title, "zh-CN");
}

function eventAdjustedScore(item: ClusterableRadarItem) {
  return Math.max(0, item.scores.overall - signalQuality(item).penalty * 0.45);
}

function signalQuality(item: ClusterableRadarItem) {
  const cached = signalQualityCache.get(item);
  if (cached) {
    return cached;
  }

  const quality = assessPublicSignalQuality(item);
  signalQualityCache.set(item, quality);
  return quality;
}

function eventScore(items: ClusterableRadarItem[], sourceFamilies: string[], sourceNames: string[]) {
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const qualities = items.map(signalQuality);
  const base = average(items.map((item) => item.scores.overall || item.scores.importance || 0.45)) * 52;
  const aiRelevance = average(items.map((item) => item.scores.ai_relevance || 0.45)) * 12;
  const credibility = average(items.map((item) => item.scores.credibility || item.confidence || 0.45)) * 10;
  const novelty = average(items.map((item) => item.scores.novelty || 0.4)) * 8;
  const diversityBonus = Math.min(12, Math.max(0, sourceFamilies.length - 1) * 5 + Math.max(0, sourceNames.length - 1) * 2);
  const highTierBonus = items.some((item) => /official|tier[_ -]?1|high|primary/i.test(item.source_tier)) ? 6 : 0;
  const hasHighTierSource = highTierBonus > 0;
  const freshnessBonus = Math.max(...items.map(freshnessBonusForItem), 0);
  const averageQualityPenalty = average(qualities.map((quality) => quality.penalty)) * 40;
  const allLowEventSignals = qualities.every((quality) => quality.isLowEventSignal);
  const importantCategoryBonus = items.some((item) =>
    item.categories.some((category) =>
      ["model_release", "product_update", "tooling", "benchmark", "infrastructure", "safety", "policy", "business", "open_source", "research"].includes(category)
    )
  )
    ? 5
    : 0;
  const singleSourcePenalty = sourceNames.length <= 1 ? 8 : 0;
  const singleFamilyPenalty = sourceFamilies.length <= 1 ? 3 : 0;
  const singleResearchPenalty = sourceNames.length <= 1 && sourceFamilies.length === 1 && sourceFamilies[0] === "研究订阅" ? 7 : 0;
  const rawScore = base + aiRelevance + credibility + novelty + diversityBonus + highTierBonus + freshnessBonus + importantCategoryBonus - averageQualityPenalty - singleSourcePenalty - singleFamilyPenalty - singleResearchPenalty;
  const singleSourceCap = sourceNames.length <= 1 ? (hasHighTierSource ? 76 : 70) : 100;
  const singleFamilyMultiSourceCap = sourceNames.length > 1 && sourceFamilies.length <= 1 ? 77 : 100;
  const researchCap = sourceNames.length <= 1 && sourceFamilies.length === 1 && sourceFamilies[0] === "研究订阅" ? 68 : 100;
  const cappedScore = allLowEventSignals ? Math.min(rawScore, 44) : Math.min(rawScore, singleSourceCap, singleFamilyMultiSourceCap, researchCap);

  return Math.max(0, Math.min(100, Math.round(cappedScore)));
}

function freshnessBonusForItem(item: ClusterableRadarItem) {
  const ageMs = Date.now() - Date.parse(itemTimestamp(item));
  if (!Number.isFinite(ageMs)) return 0;
  if (ageMs <= 24 * 60 * 60 * 1000) return 7;
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) return 4;
  if (ageMs <= 30 * 24 * 60 * 60 * 1000) return 2;
  return 0;
}

function eventScoreLabel(score: number): EventScoreLabel {
  if (score >= 78) return "高优先级";
  if (score >= 64) return "关注";
  if (score >= 45) return "观察";
  return "噪音/低相关";
}

function scoreReason(score: number, sourceCount: number, sourceFamilies: string[], primary: ClusterableRadarItem) {
  const quality = signalQuality(primary);
  const pieces = [
    `综合分 ${score}`,
    sourceCount > 1 && sourceFamilies.length > 1
      ? `${sourceCount} 个来源、${sourceFamilies.length} 个来源家族交叉确认`
      : sourceCount > 1
        ? `${sourceCount} 个来源报道，但集中在同一来源家族`
        : "单一来源，需继续观察",
    sourceFamilies.length > 1 ? `覆盖 ${sourceFamilies.join("、")}` : `来源家族：${sourceFamilies[0] ?? "未知"}`,
    `AI 相关度 ${Math.round((primary.scores.ai_relevance || 0) * 100)}%`,
    `重要性 ${Math.round((primary.scores.importance || 0) * 100)}%`,
    quality.isLowEventSignal ? `事件性不足：${quality.reasons.join("、") || "低信息量信号"}` : ""
  ];

  return pieces.filter(Boolean).join("；");
}

function publicSummary(primary: ClusterableRadarItem, items: ClusterableRadarItem[], sourceFamilies: string[]) {
  const summary = primary.summary_zh || primary.why_it_matters || primary.summary_en;
  if (summary) {
    return summary;
  }

  const multiSource = items.length > 1 ? `该事件合并了 ${items.length} 条相关信号` : "该事件目前只有 1 条公开信号";
  return `${multiSource}，来源覆盖 ${sourceFamilies.join("、") || "未知来源家族"}。`;
}

function publicEventTitle(primary: ClusterableRadarItem) {
  const title = primary.title.trim();
  const source = primary.source_name.trim();
  const summary = (primary.summary_zh || primary.summary_en || "").trim();

  if (/^release\s+v?\d+(?:\.\d+){1,3}/i.test(title)) {
    const version = title.match(/v?\d+(?:\.\d+){1,3}/i)?.[0] ?? title.replace(/^release\s+/i, "");
    return source ? `${source} 发布 ${version} 版本` : title;
  }

  if (/^v?\d+(?:\.\d+){1,3}(?:[-_][\w.-]+)?$/i.test(title)) {
    return source ? `${source} 发布 ${title} 版本` : title;
  }

  if (/^[a-z]+-\d+(?:\.\d+){1,3}$/i.test(title)) {
    return source ? `${source} 发布 ${title} 版本` : title;
  }

  if (/^b\d{4,}$/i.test(title)) {
    return source ? `${source} 发布 ${title} 版本` : title;
  }

  if (/^[a-f0-9]{6,12}$/i.test(title)) {
    return source ? `${source} 发布 ${title} 版本` : title;
  }

  if (/^(research|news|newsroom|blog|overview|documentation|docs|home|homepage|release notes|releases|changelog)$/i.test(title)) {
    return source ? `${source} 公开页面信号` : title;
  }

  if (title.length <= 18 && summary) {
    const firstSentence = summary.split(/[。.!?]/)[0]?.trim();
    if (firstSentence && firstSentence.length >= 12 && firstSentence.length <= 72) {
      return firstSentence;
    }
  }

  return title;
}

function eventCaveats(items: ClusterableRadarItem[], sourceFamilies: string[]) {
  return [
    items.length === 1 ? "目前只有单条公开信号，可信度需要后续来源补强。" : "",
    sourceFamilies.length === 1 ? "来源家族仍然集中，需关注是否有独立来源确认。" : "",
    items.some((item) => item.status === "needs_review") ? "包含待复核信号，报告中应保留不确定性。" : ""
  ].filter(Boolean);
}

function dominantCategory(items: ClusterableRadarItem[]) {
  const eventText = items
    .map((item) => `${item.title} ${item.summary_zh ?? ""} ${item.summary_en ?? ""} ${item.tags.join(" ")}`)
    .join(" ")
    .toLowerCase();
  if (/lawsuit|litigation|sues?|court|antitrust|copyright|trade secrets?|intellectual property|知识产权|诉讼|起诉|法院|反垄断/.test(eventText)) {
    return "regulation";
  }
  if (/vulnerabilit|exploit|breach|prompt injection|security incident|安全|漏洞|攻击|泄露/.test(eventText)) {
    return "safety";
  }

  const counts = new Map<string, number>();
  for (const item of items) {
    for (const category of item.categories) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "other";
}

function itemKeywords(item: ClusterableRadarItem) {
  const cached = itemKeywordCache.get(item);
  if (cached) {
    return cached;
  }

  const text = normalizeText(`${item.title} ${item.summary_zh ?? ""} ${item.summary_en ?? ""} ${item.tags.join(" ")}`);
  const keywords = unique(text.split(/\s+/).filter((token) => token.length >= 3 && !stopwords.has(token))).slice(0, 20);
  itemKeywordCache.set(item, keywords);
  return keywords;
}

function itemEntities(item: ClusterableRadarItem) {
  const cached = itemEntityCache.get(item);
  if (cached) {
    return cached;
  }

  const explicit = (item.entities ?? []).map((entity) => normalizeEntity(entity.name)).filter(Boolean);
  const inferred = knownEntityPatterns.filter((entity) =>
    normalizeText(`${item.title} ${item.summary_zh ?? ""} ${item.summary_en ?? ""}`).includes(normalizeEntity(entity))
  );
  const entities = unique([...explicit, ...inferred]);
  itemEntityCache.set(item, entities);
  return entities;
}

function strongItemEntities(item: ClusterableRadarItem) {
  const cached = itemStrongEntityCache.get(item);
  if (cached) {
    return cached;
  }

  const entities = itemEntities(item).filter((entity) => !genericEntityTerms.has(entity));
  itemStrongEntityCache.set(item, entities);
  return entities;
}

function itemEventConcepts(item: ClusterableRadarItem) {
  const cached = itemEventConceptCache.get(item);
  if (cached) {
    return cached;
  }

  const text = [
    item.title,
    item.summary_zh ?? "",
    item.summary_en ?? "",
    item.tags.join(" "),
    ...(item.entities ?? []).map((entity) => entity.name)
  ].join(" ");
  const concepts = eventConceptPatterns
    .filter((concept) =>
      concept.anchors.every((pattern) => pattern.test(text)) &&
      concept.aliases.some((pattern) => pattern.test(text))
    )
    .map((concept) => concept.name);
  itemEventConceptCache.set(item, concepts);
  return concepts;
}

function titleSimilarity(left: string, right: string) {
  const leftFingerprint = titleFingerprint(left);
  const rightFingerprint = titleFingerprint(right);
  if (leftFingerprint && leftFingerprint === rightFingerprint) {
    return 1;
  }

  return jaccard(new Set(normalizeText(left).split(/\s+/)), new Set(normalizeText(right).split(/\s+/)));
}

function titleFingerprint(title: string) {
  return normalizeText(title)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopwords.has(token))
    .slice(0, 10)
    .join(" ");
}

function hasVersionConflict(leftTitle: string, rightTitle: string) {
  const leftVersion = releaseVersion(leftTitle);
  const rightVersion = releaseVersion(rightTitle);
  return Boolean(leftVersion && rightVersion && leftVersion !== rightVersion);
}

function releaseVersion(title: string) {
  return title.match(/\b(?:(?:python|dotnet|java|js|node|go|rust)-|v)?\d+(?:\.\d+){1,3}(?:[-_][\w.-]+)?\b|\bb\d{4,}\b/i)?.[0]?.toLowerCase() ?? null;
}

function isSameReleaseSeries(left: ClusterableRadarItem, right: ClusterableRadarItem) {
  if (!hasVersionConflict(left.title, right.title)) return false;
  const leftTrack = releaseTrack(left.title);
  const rightTrack = releaseTrack(right.title);
  if (leftTrack && rightTrack && leftTrack !== rightTrack) return false;

  const leftTime = Date.parse(itemTimestamp(left));
  const rightTime = Date.parse(itemTimestamp(right));
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime) || Math.abs(leftTime - rightTime) > 7 * 24 * 60 * 60 * 1000) {
    return false;
  }

  const leftProject = releaseProjectKey(left.url);
  const rightProject = releaseProjectKey(right.url);
  if (leftProject && rightProject && leftProject === rightProject) return true;

  if (sourceFamilyForEvent(left) !== "开源项目" || sourceFamilyForEvent(right) !== "开源项目") return false;
  const leftSubject = releaseSubject(left.title);
  const rightSubject = releaseSubject(right.title);
  if (!leftSubject || leftSubject !== rightSubject) return false;

  return canonicalStrongEntityOverlap(new Set(strongItemEntities(left)), new Set(strongItemEntities(right))) > 0;
}

function releaseTrack(title: string) {
  const version = releaseVersion(title);
  const prefix = version?.match(/^([a-z]+)-?/i)?.[1]?.toLowerCase() ?? null;
  return prefix && prefix !== "v" && prefix !== "b" ? prefix : null;
}

function releaseProjectKey(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const segments = parsed.pathname.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
    if (host === "api.github.com" && segments[0] === "repos" && segments.length >= 3) {
      return `github:${segments[1]}/${segments[2]}`;
    }
    if (host.endsWith("github.com") && segments.length >= 2) {
      return `github:${segments[0]}/${segments[1]}`;
    }
    if (host.endsWith("huggingface.co") && segments.length >= 2) {
      return `huggingface:${segments[0]}/${segments[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}

function releaseSubject(title: string) {
  return normalizeText(
    title
      .replace(/\b(?:(?:python|dotnet|java|js|node|go|rust)-|v)?\d+(?:\.\d+){1,3}(?:[-_][\w.-]+)?\b|\bb\d{4,}\b/gi, " ")
      .replace(/\b(?:release|released|version|changelog|update)\b|发布|版本|更新|上线/gi, " ")
  ).trim();
}

function isReleaseVersionTitle(title: string) {
  const normalized = normalizeText(title);
  return /^release\s+v?\d+(?:\s+\d+){1,3}$/.test(normalized) ||
    /^(?:python\s+)?v?\d+(?:\s+\d+){1,3}$/.test(normalized) ||
    /^b\d{4,}$/.test(normalized) ||
    /^python\s+v?\d+\s+\d+\s+\d+$/i.test(normalized);
}

function hasPartnerConflict(left: ClusterableRadarItem, right: ClusterableRadarItem) {
  const leftPartners = partnerEntities(left);
  const rightPartners = partnerEntities(right);
  if (leftPartners.size === 0 || rightPartners.size === 0) return false;
  return intersectionSize(leftPartners, rightPartners) === 0;
}

function partnerEntities(item: ClusterableRadarItem) {
  const rawText = `${item.title} ${item.summary_zh ?? ""} ${item.summary_en ?? ""}`;
  const text = normalizeText(rawText);
  if (!/\b(partner|partnership|collaborat|alliance)\b|合作|伙伴/.test(text)) {
    return new Set<string>();
  }

  const parsedPartners = [
    ...rawText.matchAll(/\b(?:openai|anthropic|google|microsoft|meta)\s+and\s+([a-z0-9][a-z0-9 .&-]{1,40}?)\s+(?:partner|partnership|collaborat)/gi),
    ...rawText.matchAll(/\bwith\s+([a-z0-9][a-z0-9 .&-]{1,40}?)\s+(?:to|on|for)\b/gi)
  ].map((match) => normalizeEntity(match[1]).replace(/\b(to|bring|all|citizens|enterprise|environments)\b.*$/g, "").trim()).filter(Boolean);
  const entities = strongItemEntities(item)
    .filter((entity) => !["openai", "microsoft", "google", "meta", "anthropic"].includes(entity));
  return new Set([...entities, ...parsedPartners]);
}

function timeWindowScore(left: ClusterableRadarItem, right: ClusterableRadarItem) {
  const leftTime = Date.parse(itemTimestamp(left));
  const rightTime = Date.parse(itemTimestamp(right));
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return 0;
  }

  const hours = Math.abs(leftTime - rightTime) / 3_600_000;
  if (hours <= 24) return 1;
  if (hours <= 72) return 0.7;
  if (hours <= 168) return 0.35;
  return 0;
}

function itemTimestamp(item: ClusterableRadarItem) {
  return item.published_at ?? item.collected_at ?? item.processed_at;
}

function stableEventId(seed: string, itemIds: string[]) {
  const hash = createHash("sha1")
    .update(`${seed}|${itemIds.slice().sort().join("|")}`)
    .digest("hex")
    .slice(0, 20);
  return `event_${hash}`;
}

function bestSourceTier(tiers: string[]) {
  const sorted = unique(tiers).sort((left, right) => tierRank(right) - tierRank(left) || left.localeCompare(right));
  return sorted[0] ?? "unreviewed";
}

function tierRank(tier: string) {
  const value = tier.toLowerCase();
  if (/official|tier[_ -]?1|high|primary/.test(value)) return 4;
  if (/tier[_ -]?2|medium/.test(value)) return 3;
  if (/tier[_ -]?3|low/.test(value)) return 2;
  return 1;
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  const intersection = intersectionSize(left, right);
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function intersectionSize(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function intersectionValues(left: Set<string>, right: Set<string>) {
  return [...left].filter((value) => right.has(value));
}

function canonicalStrongEntityOverlap(left: Set<string>, right: Set<string>) {
  const canonicalLeft = new Set([...left].map(canonicalEventEntity));
  const canonicalRight = new Set([...right].map(canonicalEventEntity));
  return intersectionSize(canonicalLeft, canonicalRight);
}

function canonicalEventEntity(value: string) {
  switch (normalizeEntity(value)) {
    case "苹果":
      return "apple";
    case "微软":
      return "microsoft";
    case "英伟达":
      return "nvidia";
    case "通义":
      return "qwen";
    case "hugging face":
      return "huggingface";
    default:
      return normalizeEntity(value);
  }
}

function sharesSpecificEventAction(leftTitle: string, rightTitle: string) {
  const leftActions = new Set(eventActionPatterns.filter(([, pattern]) => pattern.test(leftTitle)).map(([name]) => name));
  return eventActionPatterns.some(([name, pattern]) => leftActions.has(name) && pattern.test(rightTitle));
}

function sharesSpecificEventConcept(left: ClusterableRadarItem, right: ClusterableRadarItem) {
  const leftConcepts = new Set(itemEventConcepts(left));
  return itemEventConcepts(right).some((concept) => leftConcepts.has(concept));
}

function safeDomain(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isBareRootUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol.startsWith("http") && parsed.pathname.replace(/\/+$/, "") === "";
  } catch {
    return false;
  }
}

function normalizeEntity(value: string) {
  return normalizeText(value).trim();
}

function normalizeText(value: string) {
  const cached = normalizedTextCache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const normalized = value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(?:\u2018|\u2019|')s\b/g, "")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalizedTextCache.size > 5000) {
    normalizedTextCache.clear();
  }
  normalizedTextCache.set(value, normalized);
  return normalized;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items.filter(Boolean)));
}
