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

export function reportQualityGateFromPreview(
  preview: ReportPreview,
  evaluatedAt: Date | string = new Date()
): ReportQualityGate {
  const usableItems = uniquePreviewItems([
    ...preview.top_items,
    ...preview.sections.flatMap((section) => section.items)
  ]).filter((item) => item.status === "included" || item.status === "needs_review");
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
  return evaluateReportQualityGate({
    categoryCount: report.category_count,
    categoryGateApplicable: report.category_count > 0,
    citationCount: report.citation_count || report.citations.length,
    distinctSourceCount: report.distinct_source_count || distinctSourcesFromCitations(report.citations),
    evaluatedAt,
    evidenceTimestamps: report.citations.map(citationEvidenceTimestamp),
    evidenceWindowEnd: report.time_window.end,
    freshnessGateApplicable: true,
    reportType: report.report_type,
    usableItemCount: report.usable_item_count
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
    const reasons = stringArray(value.reasons);
    const passed = typeof value.passed === "boolean" ? value.passed : evaluated.passed;

    return {
      ...evaluated,
      passed,
      reasons: passed ? [] : reasons.length > 0 ? reasons : evaluated.reasons
    };
  }

  return evaluateReportQualityGate(fallback);
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

function uniqueCount(values: string[]) {
  return new Set(values.map((value) => value.trim()).filter(Boolean)).size;
}

function citationEvidenceTimestamp(citation: { published_at?: string; collected_at: string }) {
  return citation.published_at ?? citation.collected_at;
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
