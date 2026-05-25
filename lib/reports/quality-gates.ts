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

type ReportQualityGateInput = {
  reportType: ReportPreviewType;
  usableItemCount: number;
  citationCount: number;
  distinctSourceCount: number;
  categoryCount: number;
  categoryGateApplicable?: boolean;
};

export function reportQualityGateFromPreview(preview: ReportPreview): ReportQualityGate {
  const usableItems = uniquePreviewItems([
    ...preview.top_items,
    ...preview.sections.flatMap((section) => section.items)
  ]).filter((item) => item.status === "included" || item.status === "needs_review");
  const sourceNames = usableItems.map((item) => item.source_name);
  const categories = usableItems.flatMap((item) => item.categories);

  return evaluateReportQualityGate({
    categoryCount: uniqueCount(categories),
    categoryGateApplicable: categories.length > 0,
    citationCount: preview.citations.length,
    distinctSourceCount: uniqueCount(sourceNames),
    reportType: preview.report_type,
    usableItemCount: preview.usable_item_count
  });
}

export function reportQualityGateFromDraft(report: GeneratedReportDraft): ReportQualityGate {
  return evaluateReportQualityGate({
    categoryCount: report.category_count,
    categoryGateApplicable: report.category_count > 0,
    citationCount: report.citation_count || report.citations.length,
    distinctSourceCount: report.distinct_source_count || distinctSourcesFromCitations(report.citations),
    reportType: report.report_type,
    usableItemCount: report.usable_item_count
  });
}

export function evaluateReportQualityGate(input: ReportQualityGateInput): ReportQualityGate {
  const thresholds = reportQualityGateThresholds[input.reportType];
  const categoryGateApplicable = input.categoryGateApplicable ?? input.categoryCount > 0;
  const reasons = [
    input.usableItemCount < thresholds.usable_items
      ? `usable_items ${input.usableItemCount} is below ${input.reportType} minimum ${thresholds.usable_items}`
      : "",
    input.citationCount < thresholds.citations
      ? `citations ${input.citationCount} is below ${input.reportType} minimum ${thresholds.citations}`
      : "",
    input.distinctSourceCount < thresholds.distinct_sources
      ? `distinct_sources ${input.distinctSourceCount} is below ${input.reportType} minimum ${thresholds.distinct_sources}`
      : "",
    categoryGateApplicable && input.categoryCount < thresholds.categories
      ? `categories ${input.categoryCount} is below ${input.reportType} minimum ${thresholds.categories}`
      : ""
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
    "Report quality gate did not pass; keep this candidate in needs_review until more data is available.",
    ...gate.reasons
  ];
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
