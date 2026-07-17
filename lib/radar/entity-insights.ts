import type { RetrievalRadarItem } from "@/lib/retrieval/types";
import type { RadarCategory, UnderstandingEntityType, UnderstandingStatus } from "@/lib/understanding/types";

import { entityCandidatesForItem } from "@/lib/radar/entities";
import { itemEvidenceTimestamp } from "@/lib/radar/feed";

export type EntitySummary = {
  categories: Map<RadarCategory, number>;
  confidenceTotal: number;
  evidenceTexts: Set<string>;
  latestTimestamp?: string;
  name: string;
  sourceCounts: Map<string, number>;
  statusCounts: Record<UnderstandingStatus, number>;
  topItem: RetrievalRadarItem;
  totalSignals: number;
  type: UnderstandingEntityType;
};

export type EntityTrackingInsight = {
  nextQuestions: string[];
  priorityLabel: string;
  priorityScore: number;
  reasons: string[];
  watchLabel: string;
};

export type EntityEvidenceGraph = {
  categoryCounts: Map<RadarCategory, number>;
  firstTimestamp?: string;
  items: RetrievalRadarItem[];
  latestTimestamp?: string;
  sourceCounts: Map<string, number>;
  statusCounts: Record<UnderstandingStatus, number>;
};

export function buildEntitySummaries(items: RetrievalRadarItem[]) {
  const summaries = new Map<string, EntitySummary>();

  for (const item of items.filter((entry) => entry.status === "included" || entry.status === "needs_review")) {
    for (const entity of entityCandidatesForItem(item)) {
      const name = entity.name.trim();
      if (!name) {
        continue;
      }

      const key = `${entity.type}:${name.toLowerCase()}`;
      const existing = summaries.get(key);
      const timestamp = itemEvidenceTimestamp(item);
      const summary =
        existing ??
        {
          categories: new Map<RadarCategory, number>(),
          confidenceTotal: 0,
          evidenceTexts: new Set<string>(),
          latestTimestamp: undefined,
          name,
          sourceCounts: new Map<string, number>(),
          statusCounts: {
            excluded: 0,
            failed: 0,
            included: 0,
            needs_review: 0
          },
          topItem: item,
          totalSignals: 0,
          type: entity.type
        };

      summary.totalSignals += 1;
      summary.confidenceTotal += entity.confidence;
      summary.statusCounts[item.status] += 1;
      summary.sourceCounts.set(item.source_name, (summary.sourceCounts.get(item.source_name) ?? 0) + 1);
      for (const category of item.categories) {
        summary.categories.set(category, (summary.categories.get(category) ?? 0) + 1);
      }
      if (entity.evidence_text) {
        summary.evidenceTexts.add(entity.evidence_text);
      }
      if (!summary.latestTimestamp || Date.parse(timestamp) > Date.parse(summary.latestTimestamp)) {
        summary.latestTimestamp = timestamp;
      }
      if (item.overall_score > summary.topItem.overall_score) {
        summary.topItem = item;
      }

      summaries.set(key, summary);
    }
  }

  return [...summaries.values()].sort(compareEntitySummaries);
}

export function entityRouteId(entity: Pick<EntitySummary, "name" | "type">) {
  return `${entity.type}:${normalizeEntityName(entity.name)}`;
}

export function entityHref(entity: Pick<EntitySummary, "name" | "type">) {
  return `/entities/${encodeURIComponent(entityRouteId(entity))}`;
}

export function findEntitySummaryByRouteId(items: RetrievalRadarItem[], routeId: string) {
  const normalizedId = normalizeRouteId(routeId);
  return buildEntitySummaries(items).find((entity) => entityRouteId(entity) === normalizedId) ?? null;
}

export function buildEntityEvidenceGraph(items: RetrievalRadarItem[], entity: EntitySummary): EntityEvidenceGraph {
  const evidenceItems = entityEvidenceItems(items, entity);
  const categoryCounts = new Map<RadarCategory, number>();
  const sourceCounts = new Map<string, number>();
  const statusCounts: Record<UnderstandingStatus, number> = {
    excluded: 0,
    failed: 0,
    included: 0,
    needs_review: 0
  };
  let firstTimestamp: string | undefined;
  let latestTimestamp: string | undefined;

  for (const item of evidenceItems) {
    const timestamp = itemEvidenceTimestamp(item);
    statusCounts[item.status] += 1;
    sourceCounts.set(item.source_name, (sourceCounts.get(item.source_name) ?? 0) + 1);
    for (const category of item.categories) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }

    if (!firstTimestamp || Date.parse(timestamp) < Date.parse(firstTimestamp)) {
      firstTimestamp = timestamp;
    }
    if (!latestTimestamp || Date.parse(timestamp) > Date.parse(latestTimestamp)) {
      latestTimestamp = timestamp;
    }
  }

  return {
    categoryCounts,
    firstTimestamp,
    items: evidenceItems,
    latestTimestamp,
    sourceCounts,
    statusCounts
  };
}

export function entityEvidenceItems(items: RetrievalRadarItem[], entity: Pick<EntitySummary, "name" | "type">) {
  const routeId = entityRouteId(entity);

  return items
    .filter((item) => item.status === "included" || item.status === "needs_review")
    .filter((item) =>
      entityCandidatesForItem(item).some((candidate) => entityRouteId(candidate) === routeId)
    )
    .toSorted(
      (left, right) =>
        Date.parse(itemEvidenceTimestamp(right)) - Date.parse(itemEvidenceTimestamp(left)) ||
        right.overall_score - left.overall_score ||
        left.title.localeCompare(right.title)
    );
}

export function entityAverageConfidence(entity: EntitySummary) {
  return entity.confidenceTotal / Math.max(entity.totalSignals, 1);
}

export function entityTrackingInsight(entity: EntitySummary): EntityTrackingInsight {
  const confidence = entityAverageConfidence(entity);
  const sourceCount = entity.sourceCounts.size;
  const needsReview = entity.statusCounts.needs_review;
  const priorityScore = entityPriorityScore(entity);
  const reasons: string[] = [];

  if (entity.totalSignals >= 3) {
    reasons.push(`出现 ${entity.totalSignals} 条公开信号，已超过单条新闻噪音。`);
  } else {
    reasons.push(`当前只有 ${entity.totalSignals} 条公开信号，尚缺独立来源扩散证据。`);
  }

  if (sourceCount >= 2) {
    reasons.push(`证据覆盖 ${sourceCount} 个来源，可比较报道差异；来源家族独立性仍需单独核对。`);
  } else {
    reasons.push("目前主要来自单一来源，发布前需要独立来源确认。");
  }

  if (needsReview > 0) {
    reasons.push(`${needsReview} 条相关信号仍待复核，不应直接写成确定结论。`);
  } else if (confidence >= 0.6) {
    reasons.push("相关信号置信度较稳，可以进入持续跟踪队列。");
  }

  if (entity.topItem.why_it_matters) {
    reasons.push(`最高分信号的影响判断：${entity.topItem.why_it_matters}`);
  }

  return {
    nextQuestions: nextQuestionsForEntity(entity),
    priorityLabel: priorityLabel(priorityScore),
    priorityScore,
    reasons: reasons.slice(0, 4),
    watchLabel: watchLabel(entity)
  };
}

export function compareEntitySummaries(left: EntitySummary, right: EntitySummary) {
  return (
    entityPriorityScore(right) - entityPriorityScore(left) ||
    right.totalSignals - left.totalSignals ||
    right.topItem.overall_score - left.topItem.overall_score ||
    left.name.localeCompare(right.name)
  );
}

export function entityPriorityScore(entity: EntitySummary) {
  const confidence = entityAverageConfidence(entity);
  const sourceScore = Math.min(entity.sourceCounts.size, 5) * 8;
  const signalScore = Math.min(entity.totalSignals, 8) * 7;
  const confidenceScore = Math.round(confidence * 20);
  const topItemScore = Math.round(entity.topItem.overall_score * 20);
  const reviewPenalty = Math.min(entity.statusCounts.needs_review, 4) * 4;

  return Math.max(0, signalScore + sourceScore + confidenceScore + topItemScore - reviewPenalty);
}

function priorityLabel(score: number) {
  if (score >= 80) {
    return "高优先级";
  }

  if (score >= 55) {
    return "持续跟踪";
  }

  return "观察中";
}

function watchLabel(entity: EntitySummary) {
  if (entity.statusCounts.needs_review > 0) {
    return "先复核";
  }

  if (entity.sourceCounts.size >= 2 && entity.totalSignals >= 3) {
    return "报告候选";
  }

  return "补证据";
}

function nextQuestionsForEntity(entity: EntitySummary) {
  const questions = [
    "是否有官方、论文、代码仓库或一线用户证据支持这个变化？",
    "它影响的是模型能力、开发者工具、商业化、算力供应，还是监管环境？"
  ];

  if (entity.sourceCounts.size < 2) {
    questions.push("能否找到第二个独立来源，避免单源叙事？");
  }

  if (entity.statusCounts.needs_review > 0) {
    questions.push("待复核信号被确认或排除后，结论是否会改变？");
  }

  return questions.slice(0, 3);
}

function normalizeRouteId(routeId: string) {
  const decoded = safeDecodeURIComponent(routeId);
  const [type, ...nameParts] = decoded.split(":");
  return `${type}:${normalizeEntityName(nameParts.join(":"))}`;
}

function normalizeEntityName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
