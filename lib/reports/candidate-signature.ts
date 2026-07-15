import { createHash } from "node:crypto";

export const reportCandidateSignatureVersion = 2;

export type ReportCandidateSignatureInput = {
  data_source: string;
  report_type: string;
  source_item_ids: string[];
  time_window: {
    end: string;
    start: string;
  };
  usable_item_count: number;
  citation_count: number;
  distinct_source_count: number;
  category_count: number;
  quality_gate_passed: boolean;
  quality_gate_reasons: string[];
  caveats: string[];
  missing_evidence: string[];
};

export function reportCandidateSignature(report: ReportCandidateSignatureInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        signature_version: reportCandidateSignatureVersion,
        data_source: report.data_source,
        report_type: report.report_type,
        source_item_ids: stableStringArray(report.source_item_ids),
        time_window_end: report.time_window.end,
        time_window_start: report.time_window.start,
        content_contract: reportCandidateContentContract(report)
      })
    )
    .digest("hex");
}

export function reportCandidateContentMatches(left: unknown, right: unknown) {
  const leftContract = reportCandidateContentContract(left);
  const rightContract = reportCandidateContentContract(right);
  return leftContract !== null && rightContract !== null && JSON.stringify(leftContract) === JSON.stringify(rightContract);
}

function reportCandidateContentContract(value: unknown) {
  if (!isRecord(value)) return null;

  return {
    category_count: integer(value.category_count),
    citation_count: integer(value.citation_count),
    distinct_source_count: integer(value.distinct_source_count),
    quality_gate_passed: value.quality_gate_passed === true,
    usable_item_count: integer(value.usable_item_count),
    caveats: stableStringArray(stringArray(value.caveats)),
    missing_evidence: stableStringArray(stringArray(value.missing_evidence)),
    quality_gate_reasons: stableStringArray(stringArray(value.quality_gate_reasons))
  };
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
}

function stableStringArray(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
