import { createHash } from "node:crypto";

import type { RetrievalLanguage } from "@/lib/retrieval/types";
import type { RadarCategory, UnderstandingEntity, UnderstandingStatus } from "@/lib/understanding/types";

export type EventScoreLabel = "高优先级" | "关注" | "观察" | "噪音/低相关";

export type ClusterableRadarItem = {
  id: string;
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

export function buildEventLayer(items: ClusterableRadarItem[]): PublicEventLayer {
  const publicItems = items
    .filter((item) => item.status === "included" || item.status === "needs_review")
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
  const curatedEvents = clusters
    .filter((event) => event.event_score_label !== "噪音/低相关")
    .sort(compareCuratedEvents)
    .slice(0, 8);
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

function compareClusterInputItems(left: ClusterableRadarItem, right: ClusterableRadarItem) {
  const timestampDelta = Date.parse(itemTimestamp(right)) - Date.parse(itemTimestamp(left));
  if (timestampDelta !== 0) return timestampDelta;

  const titleDelta = left.title.localeCompare(right.title);
  if (titleDelta !== 0) return titleDelta;

  return left.id.localeCompare(right.id);
}

export function sourceFamilyForEvent(item: Pick<ClusterableRadarItem, "source_name" | "url" | "source_tier">) {
  const text = `${item.source_name} ${item.url} ${item.source_tier}`.toLowerCase();
  if (text.includes("arxiv") || text.includes("paper") || text.includes("research")) return "研究订阅";
  if (text.includes("github") || text.includes("release") || text.includes("hugging face") || text.includes("huggingface")) return "开源项目";
  if (["openai", "anthropic", "google", "deepmind", "meta", "llama", "deepseek", "qwen", "microsoft", "nvidia"].some((term) => text.includes(term))) return "公司/实验室";
  if (["lex", "every", "latent", "lenny", "benedict", "karpathy", "newsletter", "media"].some((term) => text.includes(term))) return "分析/媒体";
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
  const strongEntityConflict =
    cluster.strongEntities.size > 0 &&
    strongItemEntitySet.size > 0 &&
    intersectionSize(cluster.strongEntities, strongItemEntitySet) === 0;
  const weakGenericOnly = entityOverlap > 0 && intersectionValues(cluster.entities, itemEntitySet).every((entity) => genericEntityTerms.has(entity));
  let score =
    titleOverlap * 0.34 +
    entityOverlap * 0.24 +
    keywordOverlap * 0.18 +
    categoryOverlap * 0.12 +
    timeScore * 0.08 +
    domainScore;

  if (strongEntityConflict && titleOverlap < 0.72) {
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
    canonical_title: primary.title,
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
  const multiSourceDelta = Number(right.source_count > 1) - Number(left.source_count > 1);
  if (multiSourceDelta !== 0) return multiSourceDelta;

  return right.source_count - left.source_count ||
    right.event_score - left.event_score ||
    Date.parse(right.latest_seen_at) - Date.parse(left.latest_seen_at) ||
    left.canonical_title.localeCompare(right.canonical_title, "zh-CN");
}

function compareClusterItems(left: ClusterableRadarItem, right: ClusterableRadarItem) {
  return right.scores.overall - left.scores.overall ||
    right.scores.importance - left.scores.importance ||
    Date.parse(itemTimestamp(right)) - Date.parse(itemTimestamp(left)) ||
    left.title.localeCompare(right.title, "zh-CN");
}

function eventScore(items: ClusterableRadarItem[], sourceFamilies: string[], sourceNames: string[]) {
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const base = average(items.map((item) => item.scores.overall || item.scores.importance || 0.45)) * 52;
  const aiRelevance = average(items.map((item) => item.scores.ai_relevance || 0.45)) * 12;
  const credibility = average(items.map((item) => item.scores.credibility || item.confidence || 0.45)) * 10;
  const novelty = average(items.map((item) => item.scores.novelty || 0.4)) * 8;
  const diversityBonus = Math.min(12, Math.max(0, sourceFamilies.length - 1) * 5 + Math.max(0, sourceNames.length - 1) * 2);
  const highTierBonus = items.some((item) => /official|tier[_ -]?1|high|primary/i.test(item.source_tier)) ? 6 : 0;
  const freshnessBonus = Math.max(...items.map(freshnessBonusForItem), 0);
  const importantCategoryBonus = items.some((item) =>
    item.categories.some((category) =>
      ["model_release", "product_update", "tooling", "benchmark", "infrastructure", "safety", "policy", "business", "open_source", "research"].includes(category)
    )
  )
    ? 5
    : 0;

  return Math.max(0, Math.min(100, Math.round(base + aiRelevance + credibility + novelty + diversityBonus + highTierBonus + freshnessBonus + importantCategoryBonus)));
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
  const pieces = [
    `综合分 ${score}`,
    sourceCount > 1 ? `${sourceCount} 个来源确认` : "单一来源，需继续观察",
    sourceFamilies.length > 1 ? `覆盖 ${sourceFamilies.join("、")}` : `来源家族：${sourceFamilies[0] ?? "未知"}`,
    `AI 相关度 ${Math.round((primary.scores.ai_relevance || 0) * 100)}%`,
    `重要性 ${Math.round((primary.scores.importance || 0) * 100)}%`
  ];

  return pieces.join("；");
}

function publicSummary(primary: ClusterableRadarItem, items: ClusterableRadarItem[], sourceFamilies: string[]) {
  const summary = primary.summary_zh || primary.why_it_matters || primary.summary_en;
  if (summary) {
    return summary;
  }

  const multiSource = items.length > 1 ? `该事件合并了 ${items.length} 条相关信号` : "该事件目前只有 1 条公开信号";
  return `${multiSource}，来源覆盖 ${sourceFamilies.join("、") || "未知来源家族"}。`;
}

function eventCaveats(items: ClusterableRadarItem[], sourceFamilies: string[]) {
  return [
    items.length === 1 ? "目前只有单条公开信号，可信度需要后续来源补强。" : "",
    sourceFamilies.length === 1 ? "来源家族仍然集中，需关注是否有独立来源确认。" : "",
    items.some((item) => item.status === "needs_review") ? "包含待复核信号，报告或写作中应保留不确定性。" : ""
  ].filter(Boolean);
}

function dominantCategory(items: ClusterableRadarItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const category of item.categories) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "other";
}

function itemKeywords(item: ClusterableRadarItem) {
  const text = normalizeText(`${item.title} ${item.summary_zh ?? ""} ${item.summary_en ?? ""} ${item.tags.join(" ")}`);
  return unique(text.split(/\s+/).filter((token) => token.length >= 3 && !stopwords.has(token))).slice(0, 20);
}

function itemEntities(item: ClusterableRadarItem) {
  const explicit = (item.entities ?? []).map((entity) => normalizeEntity(entity.name)).filter(Boolean);
  const inferred = knownEntityPatterns.filter((entity) =>
    normalizeText(`${item.title} ${item.summary_zh ?? ""} ${item.summary_en ?? ""}`).includes(normalizeEntity(entity))
  );
  return unique([...explicit, ...inferred]);
}

function strongItemEntities(item: ClusterableRadarItem) {
  return itemEntities(item).filter((entity) => !genericEntityTerms.has(entity));
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

function safeDomain(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeEntity(value: string) {
  return normalizeText(value).trim();
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items.filter(Boolean)));
}
