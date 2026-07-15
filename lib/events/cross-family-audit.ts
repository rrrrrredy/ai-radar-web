import {
  sourceFamilyForEvent,
  type ClusterableRadarItem,
  type PublicEventLayer
} from "@/lib/events/clustering";

export type CrossFamilyCandidate = {
  candidate_score: number;
  hours_apart: number;
  item_ids: [string, string];
  likely_gap_type: "clustering_rule_gap" | "needs_editorial_review";
  reasons: string[];
  shared_categories: string[];
  shared_entities: string[];
  source_families: [string, string];
  source_names: [string, string];
  text_similarity: number;
  title_similarity: number;
  titles: [string, string];
  urls: [string, string];
};

export type CrossFamilyAudit = {
  cross_family_events: Array<{
    canonical_title: string;
    event_cluster_id: string;
    related_item_count: number;
    source_count: number;
    source_families: string[];
  }>;
  diagnosis: {
    current_cross_family_event_count: number;
    likely_clustering_rule_gap_count: number;
    near_cross_family_candidate_count: number;
    source_coverage_is_primary_blocker: boolean;
  };
  family_distribution: Record<string, number>;
  item_count: number;
  near_cross_family_candidates: CrossFamilyCandidate[];
  source_distribution: Record<string, number>;
};

const maxCandidateHours = 24 * 7;
const candidateThreshold = 5.5;
const strongCandidateThreshold = 9;

const genericEntities = new Set([
  "ai",
  "agent",
  "agents",
  "artificial intelligence",
  "benchmark",
  "github",
  "llm",
  "model",
  "models",
  "open source",
  "paper",
  "research",
  "人工智能",
  "智能体",
  "模型",
  "研究"
]);

const stopwords = new Set([
  "about",
  "after",
  "announced",
  "announces",
  "before",
  "from",
  "into",
  "launch",
  "launches",
  "model",
  "models",
  "release",
  "released",
  "releases",
  "that",
  "this",
  "update",
  "updates",
  "using",
  "with",
  "发布",
  "更新",
  "模型"
]);

export function auditCrossFamilyCandidates(
  items: ClusterableRadarItem[],
  layer: PublicEventLayer,
  options: { candidateLimit?: number } = {}
): CrossFamilyAudit {
  const eventByItem = new Map<string, string>();
  for (const event of layer.event_clusters) {
    for (const itemId of event.related_item_ids) {
      eventByItem.set(itemId, event.event_cluster_id);
    }
  }

  const familyDistribution = countBy(items.map(sourceFamilyForEvent));
  const sourceDistribution = countBy(items.map((item) => item.source_name));
  const candidates: CrossFamilyCandidate[] = [];

  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const candidate = scoreCandidatePair(items[leftIndex], items[rightIndex], eventByItem);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort(
    (left, right) =>
      right.candidate_score - left.candidate_score ||
      left.hours_apart - right.hours_apart ||
      left.titles[0].localeCompare(right.titles[0], "en")
  );

  const limitedCandidates = candidates.slice(0, options.candidateLimit ?? 50);
  const crossFamilyEvents = layer.event_clusters
    .filter((event) => event.source_families.length > 1)
    .map((event) => ({
      canonical_title: event.canonical_title,
      event_cluster_id: event.event_cluster_id,
      related_item_count: event.related_item_ids.length,
      source_count: event.source_count,
      source_families: event.source_families
    }));
  const likelyClusteringGaps = limitedCandidates.filter(
    (candidate) => candidate.likely_gap_type === "clustering_rule_gap"
  ).length;

  return {
    cross_family_events: crossFamilyEvents,
    diagnosis: {
      current_cross_family_event_count: crossFamilyEvents.length,
      likely_clustering_rule_gap_count: likelyClusteringGaps,
      near_cross_family_candidate_count: limitedCandidates.length,
      source_coverage_is_primary_blocker: crossFamilyEvents.length === 0 && likelyClusteringGaps === 0
    },
    family_distribution: sortCounts(familyDistribution),
    item_count: items.length,
    near_cross_family_candidates: limitedCandidates,
    source_distribution: sortCounts(sourceDistribution)
  };
}

function scoreCandidatePair(
  left: ClusterableRadarItem,
  right: ClusterableRadarItem,
  eventByItem: Map<string, string>
): CrossFamilyCandidate | null {
  const leftFamily = sourceFamilyForEvent(left);
  const rightFamily = sourceFamilyForEvent(right);
  if (leftFamily === rightFamily) {
    return null;
  }

  const leftEvent = eventByItem.get(left.id);
  const rightEvent = eventByItem.get(right.id);
  if (leftEvent && leftEvent === rightEvent) {
    return null;
  }

  const hoursApart = Math.abs(itemTimestamp(left) - itemTimestamp(right)) / 3_600_000;
  if (!Number.isFinite(hoursApart) || hoursApart > maxCandidateHours) {
    return null;
  }

  const leftEntities = entitySet(left);
  const rightEntities = entitySet(right);
  const sharedEntities = intersection(leftEntities, rightEntities);
  const sharedCategories = intersection(new Set(left.categories), new Set(right.categories));
  const titleSimilarity = jaccard(tokenize(left.title), tokenize(right.title));
  const textSimilarity = jaccard(
    tokenize(`${left.title} ${left.summary_en ?? ""} ${left.summary_zh ?? ""}`),
    tokenize(`${right.title} ${right.summary_en ?? ""} ${right.summary_zh ?? ""}`)
  );

  if (sharedCategories.length === 0 && titleSimilarity < 0.32) {
    return null;
  }

  if (sharedEntities.length === 0 && titleSimilarity < 0.28) {
    return null;
  }

  if (sharedEntities.length < 2 && titleSimilarity < 0.22 && textSimilarity < 0.2) {
    return null;
  }

  const sameDomainPenalty = safeDomain(left.url) === safeDomain(right.url) ? 2 : 0;
  const timeBonus = hoursApart <= 48 ? 2 : hoursApart <= 96 ? 1 : 0;
  const candidateScore =
    sharedEntities.length * 4 +
    sharedCategories.length * 1.5 +
    titleSimilarity * 8 +
    textSimilarity * 4 +
    timeBonus -
    sameDomainPenalty;

  if (candidateScore < candidateThreshold) {
    return null;
  }

  const likelyClusteringGap =
    candidateScore >= strongCandidateThreshold &&
    sharedCategories.length > 0 &&
    sharedEntities.length > 0 &&
    (titleSimilarity >= 0.22 || textSimilarity >= 0.2);

  return {
    candidate_score: round(candidateScore),
    hours_apart: round(hoursApart),
    item_ids: [left.id, right.id],
    likely_gap_type: likelyClusteringGap ? "clustering_rule_gap" : "needs_editorial_review",
    reasons: candidateReasons({
      hoursApart,
      sharedCategories,
      sharedEntities,
      textSimilarity,
      titleSimilarity
    }),
    shared_categories: sharedCategories.sort(),
    shared_entities: sharedEntities.sort(),
    source_families: [leftFamily, rightFamily],
    source_names: [left.source_name, right.source_name],
    text_similarity: round(textSimilarity),
    title_similarity: round(titleSimilarity),
    titles: [left.title, right.title],
    urls: [left.url, right.url]
  };
}

function candidateReasons(input: {
  hoursApart: number;
  sharedCategories: string[];
  sharedEntities: string[];
  textSimilarity: number;
  titleSimilarity: number;
}) {
  return [
    input.sharedEntities.length > 0 ? `共享实体：${input.sharedEntities.join("、")}` : "",
    input.sharedCategories.length > 0 ? `共享类别：${input.sharedCategories.join("、")}` : "",
    input.titleSimilarity >= 0.22 ? `标题相似度 ${round(input.titleSimilarity)}` : "",
    input.textSimilarity >= 0.2 ? `正文摘要相似度 ${round(input.textSimilarity)}` : "",
    input.hoursApart <= 96 ? `时间差 ${round(input.hoursApart)} 小时` : ""
  ].filter(Boolean);
}

function entitySet(item: ClusterableRadarItem) {
  return new Set(
    (item.entities ?? [])
      .map((entity) => normalizeEntity(entity.name))
      .filter((entity) => entity && !genericEntities.has(entity))
  );
}

function normalizeEntity(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(?:incorporated|inc|corp|corporation|company|co|ltd|limited)\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^open ai$/, "openai");
}

function tokenize(value: string) {
  return new Set(
    value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !stopwords.has(token))
  );
}

function itemTimestamp(item: ClusterableRadarItem) {
  return Date.parse(item.published_at ?? "");
}

function safeDomain(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function jaccard(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right]);
  return union.size > 0 ? intersection(left, right).length / union.size : 0;
}

function intersection<T>(left: Set<T>, right: Set<T>) {
  return [...left].filter((value) => right.has(value));
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sortCounts(counts: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(counts).sort(
      ([leftName, leftCount], [rightName, rightCount]) =>
        rightCount - leftCount || leftName.localeCompare(rightName, "zh-CN")
    )
  );
}

function round(value: number) {
  return Number(value.toFixed(2));
}
