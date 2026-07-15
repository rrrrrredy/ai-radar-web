import type {
  GeneratedReportDraft,
  ReportPreview,
  ReportPreviewItem,
  ReportPreviewType,
  ReportQualityGate,
  ReportQualityGateThresholds
} from "@/lib/reports/types";

export const reportQualityGateThresholds: Record<ReportPreviewType, ReportQualityGateThresholds> = {
  daily: {
    categories: 2,
    citations: 3,
    distinct_sources: 2,
    usable_items: 5
  },
  weekly: {
    categories: 3,
    citations: 8,
    distinct_sources: 5,
    usable_items: 20
  }
};

export const DAILY_REPORT_INSUFFICIENT_DATA_MESSAGE = "今日数据不足，需补充信源或等待下一轮刷新";

const hourMs = 60 * 60 * 1000;
const futureTimestampToleranceMs = 5 * 60 * 1000;
const evidenceFreshnessMaxAgeHours: Record<ReportPreviewType, number> = {
  daily: 24,
  weekly: 7 * 24
};

type ReportQualityGateInput = {
  reportType: ReportPreviewType;
  usableItemCount: number;
  citationCount: number;
  distinctSourceCount: number;
  categoryCount: number;
  categoryGateApplicable?: boolean;
  evidenceWindowEnd?: string | null;
  evidenceTimestamps?: string[];
  evaluatedAt?: Date | string;
  freshnessGateApplicable?: boolean;
};

export type ReportEvidenceFreshnessEvaluation = {
  ageHours: number | null;
  evaluatedAt: string;
  latestEvidenceAt: string | null;
  maxAgeHours: number;
  passed: boolean;
  reason: string | null;
  windowEnd: string | null;
};

export type ReportCandidateQualityGateValidation = {
  gate: ReportQualityGate | null;
  passed: boolean;
  reasons: string[];
};

export function reportQualityGateFromPreview(
  preview: ReportPreview,
  evaluatedAt: Date | string = new Date()
): ReportQualityGate {
  const usableItems = uniquePreviewItems(preview.evidence_items)
    .filter((item) => item.status === "included" || item.status === "needs_review");
  const sourceNames = usableItems.map((item) => item.source_name);
  const categories = usableItems.flatMap((item) => item.categories);
  const evidenceTimestamps = dedupeStrings([
    ...usableItems.map((item) => item.timestamp),
    ...preview.citations.map(citationEvidenceTimestamp)
  ]);

  return evaluateReportQualityGate({
    categoryCount: uniqueCount(categories),
    categoryGateApplicable: categories.length > 0,
    citationCount: preview.citations.length,
    distinctSourceCount: uniqueCount(sourceNames),
    evaluatedAt,
    evidenceTimestamps,
    evidenceWindowEnd: preview.time_window.end,
    freshnessGateApplicable: true,
    reportType: preview.report_type,
    usableItemCount: preview.usable_item_count
  });
}

export function reportQualityGateFromDraft(
  report: GeneratedReportDraft,
  evaluatedAt: Date | string = new Date()
): ReportQualityGate {
  const evidenceItems = uniqueReportEvidenceItems(report.evidence_items).filter(
    (item) => item.status === "included" || item.status === "needs_review"
  );
  return evaluateReportQualityGate({
    categoryCount: uniqueCount(evidenceItems.flatMap((item) => item.categories)),
    categoryGateApplicable: evidenceItems.some((item) => item.categories.length > 0),
    citationCount: uniqueCount(report.citations.map((citation) => citation.id)),
    distinctSourceCount: uniqueCount(evidenceItems.map((item) => item.source_name)),
    evaluatedAt,
    evidenceTimestamps: evidenceItems.map((item) => item.timestamp),
    evidenceWindowEnd: report.time_window.end,
    freshnessGateApplicable: true,
    reportType: report.report_type,
    usableItemCount: evidenceItems.length
  });
}

export function evaluateReportQualityGate(input: ReportQualityGateInput): ReportQualityGate {
  const thresholds = reportQualityGateThresholds[input.reportType];
  const categoryGateApplicable = input.categoryGateApplicable ?? input.categoryCount > 0;
  const freshnessGateApplicable =
    input.freshnessGateApplicable ?? input.evidenceWindowEnd !== undefined;
  const freshness = freshnessGateApplicable
    ? evaluateReportEvidenceFreshness(
        input.reportType,
        input.evidenceWindowEnd,
        input.evidenceTimestamps ?? [],
        input.evaluatedAt
      )
    : null;
  const reportLabel = input.reportType === "daily" ? "日报" : "周报";
  const reasons = [
    input.usableItemCount < thresholds.usable_items
      ? `可用条目 ${input.usableItemCount} 条，低于${reportLabel}最低要求 ${thresholds.usable_items} 条。`
      : "",
    input.citationCount < thresholds.citations
      ? `引用 ${input.citationCount} 条，低于${reportLabel}最低要求 ${thresholds.citations} 条。`
      : "",
    input.distinctSourceCount < thresholds.distinct_sources
      ? `独立来源 ${input.distinctSourceCount} 个，低于${reportLabel}最低要求 ${thresholds.distinct_sources} 个。`
      : "",
    categoryGateApplicable && input.categoryCount < thresholds.categories
      ? `类别 ${input.categoryCount} 个，低于${reportLabel}最低要求 ${thresholds.categories} 个。`
      : "",
    freshness?.reason ?? ""
  ].filter(Boolean);

  return {
    category_count: input.categoryCount,
    category_gate_applicable: categoryGateApplicable,
    citation_count: input.citationCount,
    distinct_source_count: input.distinctSourceCount,
    passed: reasons.length === 0,
    reasons,
    report_type: input.reportType,
    thresholds,
    usable_item_count: input.usableItemCount
  };
}

export function normalizeReportQualityGate(
  value: unknown,
  fallback: ReportQualityGateInput
): ReportQualityGate {
  if (isRecord(value)) {
    const reportType = reportTypeValue(value.report_type) ?? fallback.reportType;
    const usableItemCount = integer(value.usable_item_count, fallback.usableItemCount);
    const citationCount = integer(value.citation_count, fallback.citationCount);
    const distinctSourceCount = integer(value.distinct_source_count, fallback.distinctSourceCount);
    const categoryCount = integer(value.category_count, fallback.categoryCount);
    const categoryGateApplicable =
      typeof value.category_gate_applicable === "boolean"
        ? value.category_gate_applicable
        : fallback.categoryGateApplicable;
    const evaluated = evaluateReportQualityGate({
      categoryCount,
      categoryGateApplicable,
      citationCount,
      distinctSourceCount,
      evaluatedAt: fallback.evaluatedAt,
      evidenceTimestamps: fallback.evidenceTimestamps,
      evidenceWindowEnd: fallback.evidenceWindowEnd,
      freshnessGateApplicable: fallback.freshnessGateApplicable,
      reportType,
      usableItemCount
    });
    const storedReasons = stringArray(value.reasons);
    const passed = value.passed === true && evaluated.passed;
    const reasons = passed
      ? []
      : evaluated.passed
        ? storedReasons.length > 0
          ? storedReasons
          : ["质量门禁缺少明确的 passed=true，按未通过处理。"]
        : Array.from(new Set([...evaluated.reasons, ...storedReasons]));

    return {
      ...evaluated,
      passed,
      reasons
    };
  }

  const evaluated = evaluateReportQualityGate(fallback);
  if (!evaluated.passed) {
    return evaluated;
  }

  return {
    ...evaluated,
    passed: false,
    reasons: ["质量门禁元数据缺失，不能按通过处理。"]
  };
}

export function validateReportCandidateQualityGate(
  reportType: ReportPreviewType,
  value: unknown,
  evaluatedAt: Date | string = new Date()
): ReportCandidateQualityGateValidation {
  if (!isRecord(value)) {
    return {
      gate: null,
      passed: false,
      reasons: ["structured report draft metadata is missing or malformed"]
    };
  }

  const qualityGate = isRecord(value.quality_gate) ? value.quality_gate : null;
  const claimedUsableItemCount = strictNonNegativeInteger(value.usable_item_count);
  const claimedCitationCount = strictNonNegativeInteger(value.citation_count);
  const claimedDistinctSourceCount = strictNonNegativeInteger(value.distinct_source_count);
  const claimedCategoryCount = strictNonNegativeInteger(value.category_count);
  const citations = Array.isArray(value.citations) ? value.citations : null;
  const timeWindow = isRecord(value.time_window) ? value.time_window : null;
  const evidence = parseCandidateEvidenceItems(value.evidence_items);
  const citationEvidence = parseCandidateCitations(citations);
  const window = parseCandidateTimeWindow(timeWindow);
  const reasons: string[] = [...evidence.reasons, ...citationEvidence.reasons, ...window.reasons];
  const usableItemCount = evidence.items.length;
  const citationCount = citationEvidence.items.length;
  const distinctSourceCount = uniqueCount(evidence.items.map((item) => item.source_name));
  const categoryCount = uniqueCount(evidence.items.flatMap((item) => item.categories));

  if (value.report_type !== reportType) {
    reasons.push(`report_type must match the ${reportType} candidate`);
  }

  if (value.quality_gate_passed !== true) {
    reasons.push("quality_gate_passed must be explicitly true");
  }

  if (!qualityGate) {
    reasons.push("quality_gate metadata is missing or malformed");
  } else {
    if (qualityGate.report_type !== reportType) {
      reasons.push(`quality_gate.report_type must match the ${reportType} candidate`);
    }

    if (qualityGate.passed !== true) {
      reasons.push("quality_gate.passed must be explicitly true");
    }

    if (qualityGate.category_gate_applicable !== true) {
      reasons.push("quality_gate.category_gate_applicable must be true");
    }

    if (!thresholdsMatch(qualityGate.thresholds, reportQualityGateThresholds[reportType])) {
      reasons.push("quality_gate.thresholds do not match the current report thresholds");
    }
  }

  const draftCounts = [
    ["usable_item_count", claimedUsableItemCount, usableItemCount],
    ["citation_count", claimedCitationCount, citationCount],
    ["distinct_source_count", claimedDistinctSourceCount, distinctSourceCount],
    ["category_count", claimedCategoryCount, categoryCount]
  ] as const;

  for (const [field, claimedCount, recomputedCount] of draftCounts) {
    if (claimedCount === null) {
      reasons.push(`${field} must be a non-negative integer`);
      continue;
    }

    if (claimedCount !== recomputedCount) {
      reasons.push(`${field} must match recomputed evidence count ${recomputedCount}`);
    }

    if (qualityGate && strictNonNegativeInteger(qualityGate[field]) !== recomputedCount) {
      reasons.push(`quality_gate.${field} must match ${field}`);
    }
  }

  if (!citations) {
    reasons.push("citations must be an array");
  } else if (citations.length !== citationCount) {
    reasons.push("citation_count must match the citations array length");
  }

  const evidenceById = new Map(evidence.items.map((item) => [item.id, item]));
  for (const citation of citationEvidence.items) {
    const evidenceItem = evidenceById.get(citation.id);
    if (!evidenceItem) {
      reasons.push(`citation ${citation.id} does not map to an evidence item`);
    } else if (normalizeComparableText(evidenceItem.source_name) !== normalizeComparableText(citation.source_name)) {
      reasons.push(`citation ${citation.id} source does not match its evidence item`);
    }
  }

  if (window.start !== null && window.end !== null) {
    for (const item of evidence.items) {
      const timestamp = Date.parse(item.timestamp);
      if (timestamp < window.start || timestamp > window.end) {
        reasons.push(`evidence item ${item.id} falls outside the declared time window`);
      }
    }
  }

  const qualityGateReasons = strictStringArray(qualityGate?.reasons);
  if (qualityGateReasons === null) {
    reasons.push("quality_gate.reasons must be a string array");
  } else if (qualityGateReasons.length > 0) {
    reasons.push("quality_gate.reasons contains unresolved failures");
  }

  const draftQualityGateReasons = strictStringArray(value.quality_gate_reasons);
  if (draftQualityGateReasons === null) {
    reasons.push("quality_gate_reasons must be a string array");
  } else if (draftQualityGateReasons.length > 0) {
    reasons.push("quality_gate_reasons contains unresolved failures");
  }

  const gate = evaluateReportQualityGate({
    categoryCount,
    categoryGateApplicable: true,
    citationCount,
    distinctSourceCount,
    evaluatedAt,
    evidenceTimestamps: evidence.items.map((item) => item.timestamp),
    evidenceWindowEnd: typeof timeWindow?.end === "string" ? timeWindow.end : null,
    freshnessGateApplicable: true,
    reportType,
    usableItemCount
  });

  reasons.push(...gate.reasons);

  return {
    gate,
    passed: reasons.length === 0,
    reasons: Array.from(new Set(reasons))
  };
}

export function reportQualityGateFields(gate: ReportQualityGate) {
  return {
    category_count: gate.category_count,
    citation_count: gate.citation_count,
    distinct_source_count: gate.distinct_source_count,
    quality_gate: gate,
    quality_gate_passed: gate.passed,
    quality_gate_reasons: gate.reasons,
    usable_item_count: gate.usable_item_count
  };
}

export function qualityGateCaveats(gate: ReportQualityGate) {
  if (gate.passed) {
    return [];
  }

  return [
    ...(gate.report_type === "daily" ? [DAILY_REPORT_INSUFFICIENT_DATA_MESSAGE] : []),
    "报告质量门禁未通过；在补充更多证据前，该候选应保持待复核。",
    ...gate.reasons
  ];
}

export function evaluateReportEvidenceFreshness(
  reportType: ReportPreviewType,
  evidenceWindowEnd: string | null | undefined,
  evidenceTimestamps: string[],
  evaluatedAt: Date | string = new Date()
): ReportEvidenceFreshnessEvaluation {
  const maxAgeHours = evidenceFreshnessMaxAgeHours[reportType];
  const evaluatedAtDate = validDate(evaluatedAt) ?? new Date();
  const windowEndDate = validDate(evidenceWindowEnd);
  const validEvidenceDates = evidenceTimestamps
    .map(validDate)
    .filter((value): value is Date => value !== null)
    .sort((left, right) => right.getTime() - left.getTime());
  const latestEvidenceDate = validEvidenceDates[0] ?? null;
  const base = {
    ageHours: latestEvidenceDate
      ? roundHours(Math.max(0, evaluatedAtDate.getTime() - latestEvidenceDate.getTime()))
      : null,
    evaluatedAt: evaluatedAtDate.toISOString(),
    latestEvidenceAt: latestEvidenceDate?.toISOString() ?? null,
    maxAgeHours,
    windowEnd: windowEndDate?.toISOString() ?? null
  };
  const reportLabel = reportType === "daily" ? "日报" : "周报";
  const promiseLabel = reportType === "daily" ? "今日" : "本周";

  if (!windowEndDate) {
    return {
      ...base,
      passed: false,
      reason: `${reportLabel}缺少可验证的证据窗口结束时间，不能标记为“${promiseLabel}”。`
    };
  }

  if (!latestEvidenceDate) {
    return {
      ...base,
      passed: false,
      reason: `${reportLabel}缺少可验证的证据时间戳，不能标记为“${promiseLabel}”。`
    };
  }

  if (windowEndDate.getTime() - evaluatedAtDate.getTime() > futureTimestampToleranceMs) {
    return {
      ...base,
      passed: false,
      reason: `${reportLabel}证据窗口结束时间 ${windowEndDate.toISOString()} 晚于门禁评估时间，时间元数据无效。`
    };
  }

  if (latestEvidenceDate.getTime() - evaluatedAtDate.getTime() > futureTimestampToleranceMs) {
    return {
      ...base,
      passed: false,
      reason: `${reportLabel}最新证据时间 ${latestEvidenceDate.toISOString()} 晚于门禁评估时间，不能作为有效“${promiseLabel}”证据。`
    };
  }

  if (latestEvidenceDate.getTime() - windowEndDate.getTime() > futureTimestampToleranceMs) {
    return {
      ...base,
      passed: false,
      reason: `${reportLabel}最新证据时间 ${latestEvidenceDate.toISOString()} 超出证据窗口结束时间 ${windowEndDate.toISOString()}，时间范围不一致。`
    };
  }

  const freshnessAnchor = Math.min(windowEndDate.getTime(), latestEvidenceDate.getTime());
  const ageMs = Math.max(0, evaluatedAtDate.getTime() - freshnessAnchor);
  const maxAgeMs = maxAgeHours * hourMs;

  if (ageMs > maxAgeMs) {
    const freshnessAnchorLabel = new Date(freshnessAnchor).toISOString();
    return {
      ...base,
      ageHours: roundHours(ageMs),
      passed: false,
      reason: `${reportLabel}最新可用证据截至 ${freshnessAnchorLabel}，距门禁评估时间约 ${formatAge(ageMs)}，超过 ${formatMaxAge(maxAgeHours)}的新鲜度上限，不能标记为“${promiseLabel}”。`
    };
  }

  return {
    ...base,
    ageHours: roundHours(ageMs),
    passed: true,
    reason: null
  };
}

export function distinctSourcesFromCitations(citations: Array<{ source_name: string }>) {
  return uniqueCount(citations.map((citation) => citation.source_name));
}

function uniquePreviewItems(items: ReportPreviewItem[]) {
  const seen = new Set<string>();
  const output: ReportPreviewItem[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    output.push(item);
  }

  return output;
}

function uniqueReportEvidenceItems(items: GeneratedReportDraft["evidence_items"]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function uniqueCount(values: string[]) {
  return new Set(values.map((value) => value.trim()).filter(Boolean)).size;
}

function citationEvidenceTimestamp(citation: { published_at?: string; collected_at: string }) {
  return citation.published_at ?? "";
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function validDate(value: Date | string | null | undefined) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function roundHours(milliseconds: number) {
  return Math.round((milliseconds / hourMs) * 10) / 10;
}

function formatAge(milliseconds: number) {
  const hours = milliseconds / hourMs;
  if (hours >= 48) {
    return `${Math.round((hours / 24) * 10) / 10} 天`;
  }

  return `${Math.round(hours * 10) / 10} 小时`;
}

function formatMaxAge(hours: number) {
  if (hours === 24) {
    return "24 小时";
  }

  return hours >= 24 && hours % 24 === 0 ? `${hours / 24} 天` : `${hours} 小时`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportTypeValue(value: unknown): ReportPreviewType | null {
  return value === "daily" || value === "weekly" ? value : null;
}

function integer(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return Math.floor(numberValue);
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)));
}

function strictNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function strictStringArray(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    return null;
  }

  return Array.from(new Set(value.map((item) => item.trim())));
}

type CandidateEvidenceItem = {
  id: string;
  database_id?: string;
  source_name: string;
  categories: string[];
  timestamp: string;
};

type CandidateCitation = {
  id: string;
  source_name: string;
};

function parseCandidateEvidenceItems(value: unknown) {
  if (!Array.isArray(value)) {
    return { items: [] as CandidateEvidenceItem[], reasons: ["evidence_items must be an array"] };
  }

  const items: CandidateEvidenceItem[] = [];
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const [index, row] of value.entries()) {
    if (!isRecord(row)) {
      reasons.push(`evidence_items[${index}] must be an object`);
      continue;
    }

    const id = typeof row.id === "string" ? row.id.trim() : "";
    const sourceName = typeof row.source_name === "string" ? row.source_name.trim() : "";
    const timestamp = typeof row.timestamp === "string" ? row.timestamp.trim() : "";
    const categories = strictStringArray(row.categories);
    if (!id || !sourceName || !timestamp || !validDate(timestamp) || categories === null) {
      reasons.push(`evidence_items[${index}] has malformed id, source, categories, or timestamp`);
      continue;
    }
    if (row.status !== "included" && row.status !== "needs_review") {
      reasons.push(`evidence_items[${index}] is not an included or needs_review item`);
      continue;
    }
    if (seen.has(id)) {
      reasons.push(`evidence_items contains duplicate id ${id}`);
      continue;
    }
    seen.add(id);
    items.push({
      categories,
      database_id: typeof row.database_id === "string" && row.database_id.trim() ? row.database_id.trim() : undefined,
      id,
      source_name: sourceName,
      timestamp
    });
  }

  return { items, reasons };
}

function parseCandidateCitations(value: unknown[] | null) {
  if (!value) {
    return { items: [] as CandidateCitation[], reasons: [] as string[] };
  }

  const items: CandidateCitation[] = [];
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const [index, row] of value.entries()) {
    if (!isRecord(row)) {
      reasons.push(`citations[${index}] must be an object`);
      continue;
    }
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const sourceName = typeof row.source_name === "string" ? row.source_name.trim() : "";
    if (!id || !sourceName) {
      reasons.push(`citations[${index}] has malformed id or source_name`);
      continue;
    }
    if (seen.has(id)) {
      reasons.push(`citations contains duplicate id ${id}`);
      continue;
    }
    seen.add(id);
    items.push({ id, source_name: sourceName });
  }
  return { items, reasons };
}

function parseCandidateTimeWindow(value: Record<string, unknown> | null) {
  const startValue = typeof value?.start === "string" ? value.start : "";
  const endValue = typeof value?.end === "string" ? value.end : "";
  const startDate = validDate(startValue);
  const endDate = validDate(endValue);
  const reasons: string[] = [];
  if (!startDate || !endDate) {
    reasons.push("time_window must contain valid start and end timestamps");
  } else if (startDate.getTime() > endDate.getTime()) {
    reasons.push("time_window start must not be after end");
  }
  return {
    end: endDate?.getTime() ?? null,
    reasons,
    start: startDate?.getTime() ?? null
  };
}

function normalizeComparableText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function thresholdsMatch(value: unknown, expected: ReportQualityGateThresholds) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    strictNonNegativeInteger(value.usable_items) === expected.usable_items &&
    strictNonNegativeInteger(value.citations) === expected.citations &&
    strictNonNegativeInteger(value.distinct_sources) === expected.distinct_sources &&
    strictNonNegativeInteger(value.categories) === expected.categories
  );
}
