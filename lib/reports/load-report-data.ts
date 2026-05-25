import "server-only";

import { loadRadarFeed, type RadarFeed } from "@/lib/radar/feed";
import { buildDeterministicReportDraft, formatMarkdownReport } from "@/lib/reports/generate-live-report";
import { generateReportPreview } from "@/lib/reports/generate-report-preview";
import {
  distinctSourcesFromCitations,
  normalizeReportQualityGate,
  reportQualityGateFields
} from "@/lib/reports/quality-gates";
import type {
  GeneratedReportDraft,
  GeneratedReportMode,
  GeneratedReportSection,
  GeneratedReportStatus,
  ReportLanguage,
  ReportPreviewType,
  ReportWorkflowData,
  ReportWorkflowDocument,
  SafeReportModelMetadata
} from "@/lib/reports/types";
import type { RetrievalCitation, RetrievalDataSource, ResolvedTimeWindow } from "@/lib/retrieval/types";
import { getSupabaseServerReadClient } from "@/lib/supabase/server-read";

type PublicCandidateRow = Record<string, unknown>;
type PublicReportRow = Record<string, unknown>;
type SupabaseReadError = {
  code?: string;
  details?: string;
  hint?: string;
  message: string;
};

const reportTypes: ReportPreviewType[] = ["daily", "weekly"];
const publicReportCandidateSelect =
  "id, report_type, title, summary, time_window_start, time_window_end, source_item_ids, status, confidence, created_at, updated_at, report_draft";
const publicReportSelect =
  "id, type, title, language, time_window_start, time_window_end, body, status, created_at, published_at, report_draft";

export async function loadReportWorkflowData(): Promise<ReportWorkflowData> {
  const [feed, saved] = await Promise.all([loadRadarFeed(), loadSavedReportDocuments()]);
  const savedByType = latestByType(saved.documents);
  const reports = reportTypes.map((reportType) => {
    const savedDocument = savedByType.get(reportType);
    if (savedDocument) {
      return savedDocument;
    }

    const draft = buildDeterministicReportDraftFromFeed(feed, reportType);
    return {
      ...draft,
      read_source: "generated_preview" as const
    };
  });

  return {
    reports,
    warnings: [...saved.warnings]
  };
}

export async function loadReportWorkflowDocumentById(
  id: string
): Promise<ReportWorkflowDocument | null> {
  const targetId = id.trim();

  if (!targetId) {
    return null;
  }

  const savedDocument = await loadSavedReportDocumentById(targetId);

  if (savedDocument) {
    return savedDocument;
  }

  const data = await loadReportWorkflowData();

  return data.reports.find((report) => report.id === targetId) ?? null;
}

function buildDeterministicReportDraftFromFeed(
  feed: RadarFeed,
  reportType: ReportPreviewType
): GeneratedReportDraft {
  return buildDeterministicReportDraft(
    generateReportPreview(feed, reportType),
    "zh"
  );
}

async function loadSavedReportDocuments(): Promise<{
  documents: ReportWorkflowDocument[];
  warnings: string[];
}> {
  const supabase = getSupabaseServerReadClient();

  if (!supabase) {
    return {
      documents: [],
      warnings: ["Supabase public read config is unavailable; reports are generated from radar items."]
    };
  }

  const [reports, candidates] = await Promise.all([
    readPublicReports(supabase),
    readPublicReportCandidates(supabase)
  ]);

  return {
    documents: [...reports.documents, ...candidates.documents].sort(compareSavedDocuments),
    warnings: [...reports.warnings, ...candidates.warnings]
  };
}

async function loadSavedReportDocumentById(id: string) {
  const supabase = getSupabaseServerReadClient();

  if (!supabase) {
    return null;
  }

  const [candidate, report] = await Promise.all([
    readPublicReportCandidateById(supabase, id),
    readPublicReportById(supabase, id)
  ]);

  return candidate ?? report;
}

async function readPublicReportCandidates(supabase: NonNullable<ReturnType<typeof getSupabaseServerReadClient>>) {
  try {
    const { data, error } = await supabase
      .from("public_report_candidates")
      .select(publicReportCandidateSelect)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(12);

    if (error) {
      return {
        documents: [],
        warnings: [readErrorMessage("public_report_candidates", error as SupabaseReadError)]
      };
    }

    return {
      documents: ((data ?? []) as PublicCandidateRow[])
        .map(normalizeCandidateRow)
        .filter((row): row is ReportWorkflowDocument => Boolean(row)),
      warnings: []
    };
  } catch (error) {
    return {
      documents: [],
      warnings: [`public_report_candidates read failed: ${sanitizeReadError(error)}`]
    };
  }
}

async function readPublicReportCandidateById(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerReadClient>>,
  id: string
) {
  try {
    const { data, error } = await supabase
      .from("public_report_candidates")
      .select(publicReportCandidateSelect)
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return normalizeCandidateRow(data as PublicCandidateRow);
  } catch {
    return null;
  }
}

async function readPublicReports(supabase: NonNullable<ReturnType<typeof getSupabaseServerReadClient>>) {
  try {
    const { data, error } = await supabase
      .from("public_reports")
      .select(publicReportSelect)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(12);

    if (error) {
      return {
        documents: [],
        warnings: [readErrorMessage("public_reports", error as SupabaseReadError)]
      };
    }

    return {
      documents: ((data ?? []) as PublicReportRow[])
        .map(normalizeReportRow)
        .filter((row): row is ReportWorkflowDocument => Boolean(row)),
      warnings: []
    };
  } catch (error) {
    return {
      documents: [],
      warnings: [`public_reports read failed: ${sanitizeReadError(error)}`]
    };
  }
}

async function readPublicReportById(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerReadClient>>,
  id: string
) {
  try {
    const { data, error } = await supabase
      .from("public_reports")
      .select(publicReportSelect)
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return normalizeReportRow(data as PublicReportRow);
  } catch {
    return null;
  }
}

function normalizeCandidateRow(row: PublicCandidateRow): ReportWorkflowDocument | null {
  const id = text(row.id);
  const reportType = reportTypeValue(row.report_type);
  const title = text(row.title);

  if (!id || !reportType || !title) {
    return null;
  }

  const draft = normalizeReportDraft(row.report_draft, {
    dataSource: "supabase_radar_items",
    generatedAt: optionalText(row.updated_at) ?? optionalText(row.created_at) ?? new Date().toISOString(),
    id,
    mode: "saved_candidate",
    reportType,
    savedAt: optionalText(row.created_at),
    status: candidateStatus(row.status),
    summary: text(row.summary) || "No candidate summary recorded.",
    timeWindow: timeWindow(row.time_window_start, row.time_window_end),
    title
  });

  return {
    ...draft,
    id,
    mode: "saved_candidate",
    read_source: "supabase",
    saved_at: optionalText(row.created_at),
    source_item_ids: stringArray(row.source_item_ids),
    status: draft.quality_gate_passed ? candidateStatus(row.status) : "needs_review"
  };
}

function normalizeReportRow(row: PublicReportRow): ReportWorkflowDocument | null {
  const id = text(row.id);
  const reportType = reportTypeValue(row.type);
  const title = text(row.title);

  if (!id || !reportType || !title) {
    return null;
  }

  const draft = normalizeReportDraft(row.report_draft, {
    dataSource: "supabase_radar_items",
    generatedAt: optionalText(row.published_at) ?? optionalText(row.created_at) ?? new Date().toISOString(),
    id,
    mode: "saved_report",
    reportType,
    savedAt: optionalText(row.published_at) ?? optionalText(row.created_at),
    status: reportStatus(row.status),
    summary: text(row.body) || "No report body recorded.",
    timeWindow: timeWindow(row.time_window_start, row.time_window_end),
    title
  });

  return {
    ...draft,
    id,
    language: languageValue(row.language),
    mode: "saved_report",
    read_source: "supabase",
    saved_at: optionalText(row.published_at) ?? optionalText(row.created_at),
    status: reportStatus(row.status)
  };
}

function normalizeReportDraft(
  value: unknown,
  fallback: {
    dataSource: RetrievalDataSource;
    generatedAt: string;
    id: string;
    mode: GeneratedReportMode;
    reportType: ReportPreviewType;
    savedAt?: string;
    status: GeneratedReportStatus;
    summary: string;
    timeWindow: ResolvedTimeWindow;
    title: string;
  }
): GeneratedReportDraft {
  if (!isRecord(value)) {
    return minimalSavedDraft(fallback);
  }

  const reportType = reportTypeValue(value.report_type) ?? fallback.reportType;
  const timeWindowValue = normalizeTimeWindow(value.time_window) ?? fallback.timeWindow;
  const generatedAt = optionalText(value.generated_at) ?? fallback.generatedAt;
  const modelMetadata = normalizeModelMetadata(value.model_metadata);
  const citations = normalizeCitations(value.citations);
  const usableItemCount = integer(value.usable_item_count);
  const citationCount = optionalInteger(value.citation_count) ?? citations.length;
  const distinctSourceCount =
    optionalInteger(value.distinct_source_count) ?? distinctSourcesFromCitations(citations);
  const categoryCount = optionalInteger(value.category_count) ?? 0;
  const qualityGate = normalizeReportQualityGate(value.quality_gate, {
    categoryCount,
    categoryGateApplicable: categoryCount > 0,
    citationCount,
    distinctSourceCount,
    reportType,
    usableItemCount
  });
  const draft: GeneratedReportDraft = {
    caveats: stringArray(value.caveats),
    citations,
    data_source: dataSourceValue(value.data_source) ?? fallback.dataSource,
    executive_summary: text(value.executive_summary) || fallback.summary,
    generated_at: generatedAt,
    id: fallback.id,
    language: languageValue(value.language),
    missing_evidence: stringArray(value.missing_evidence),
    mode: fallback.mode,
    model_metadata: modelMetadata,
    one_sentence_summary: text(value.one_sentence_summary) || fallback.summary,
    report_type: reportType,
    retrieved_item_count: integer(value.retrieved_item_count),
    sections: normalizeSections(value.sections),
    source_item_ids: stringArray(value.source_item_ids),
    status: fallback.status,
    time_window: timeWindowValue,
    title: text(value.title) || fallback.title,
    ...reportQualityGateFields(qualityGate),
    markdown: text(value.markdown)
  };

  return {
    ...draft,
    markdown: draft.markdown || formatMarkdownReport(draft)
  };
}

function minimalSavedDraft(fallback: {
  dataSource: RetrievalDataSource;
  generatedAt: string;
  id: string;
  mode: GeneratedReportMode;
  reportType: ReportPreviewType;
  status: GeneratedReportStatus;
  summary: string;
  timeWindow: ResolvedTimeWindow;
  title: string;
}): GeneratedReportDraft {
  const qualityGate = normalizeReportQualityGate(null, {
    categoryCount: 0,
    categoryGateApplicable: false,
    citationCount: 0,
    distinctSourceCount: 0,
    reportType: fallback.reportType,
    usableItemCount: 0
  });
  const draft: GeneratedReportDraft = {
    caveats: ["Saved report metadata does not include a structured report draft payload."],
    citations: [],
    data_source: fallback.dataSource,
    executive_summary: fallback.summary,
    generated_at: fallback.generatedAt,
    id: fallback.id,
    language: "zh",
    missing_evidence: ["Structured citations, caveats, and missing-evidence fields were not stored with this saved row."],
    mode: fallback.mode,
    model_metadata: {
      api_call_count: 0,
      mode: fallback.mode,
      provider: "supabase"
    },
    one_sentence_summary: fallback.summary,
    report_type: fallback.reportType,
    retrieved_item_count: 0,
    sections: [],
    source_item_ids: [],
    status: fallback.status,
    time_window: fallback.timeWindow,
    title: fallback.title,
    ...reportQualityGateFields(qualityGate),
    markdown: ""
  };

  return {
    ...draft,
    markdown: formatMarkdownReport(draft)
  };
}

function latestByType(documents: ReportWorkflowDocument[]) {
  const byType = new Map<ReportPreviewType, ReportWorkflowDocument>();

  for (const document of documents) {
    if (!byType.has(document.report_type)) {
      byType.set(document.report_type, document);
    }
  }

  return byType;
}

function compareSavedDocuments(left: ReportWorkflowDocument, right: ReportWorkflowDocument) {
  const priority = savedDocumentPriority(right) - savedDocumentPriority(left);
  if (priority !== 0) {
    return priority;
  }

  return Date.parse(right.saved_at ?? right.generated_at) - Date.parse(left.saved_at ?? left.generated_at);
}

function savedDocumentPriority(document: ReportWorkflowDocument) {
  if (document.mode === "saved_report" && document.status === "published") {
    return 6;
  }

  if (document.mode === "saved_report" && document.status === "reviewed") {
    return 5;
  }

  if (document.mode === "saved_report") {
    return 4;
  }

  if (document.mode === "saved_candidate" && document.status === "approved") {
    return 3;
  }

  if (document.mode === "saved_candidate" && (document.status === "draft" || document.status === "needs_review")) {
    return 2;
  }

  if (document.mode === "saved_candidate" && document.status === "deferred") {
    return 1;
  }

  return 0;
}

function normalizeSections(value: unknown): GeneratedReportSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((section) => {
      if (!isRecord(section)) {
        return null;
      }

      const id = sectionId(section.id);
      const title = text(section.title);

      if (!id || !title) {
        return null;
      }

      return {
        bullets: stringArray(section.bullets),
        caveats: stringArray(section.caveats),
        citations: stringArray(section.citations),
        id,
        missing_evidence: stringArray(section.missing_evidence),
        summary: text(section.summary) || "No section summary recorded.",
        title
      };
    })
    .filter((section): section is GeneratedReportSection => Boolean(section));
}

function normalizeCitations(value: unknown): RetrievalCitation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((citation): RetrievalCitation | null => {
      if (!isRecord(citation)) {
        return null;
      }
      const id = text(citation.id);
      const title = text(citation.title);
      const url = text(citation.url);

      if (!id || !title || !url) {
        return null;
      }

      const normalized: RetrievalCitation = {
        collected_at: text(citation.collected_at) || new Date().toISOString(),
        confidence: score(citation.confidence),
        id,
        source_name: text(citation.source_name) || "Unknown source",
        status: statusForCitation(citation.status),
        title,
        url
      };

      const publishedAt = optionalText(citation.published_at);
      if (publishedAt) {
        normalized.published_at = publishedAt;
      }

      return normalized;
    })
    .filter((citation): citation is RetrievalCitation => Boolean(citation));
}

function normalizeModelMetadata(value: unknown): SafeReportModelMetadata {
  if (!isRecord(value)) {
    return {
      api_call_count: 0,
      mode: "saved_candidate",
      provider: "supabase"
    };
  }

  const provider = value.provider === "deepseek" || value.provider === "deterministic" ? value.provider : "supabase";
  const mode = modeValue(value.mode) ?? "saved_candidate";

  return {
    api_call_count: integer(value.api_call_count),
    error: optionalText(value.error),
    live_requested: typeof value.live_requested === "boolean" ? value.live_requested : undefined,
    mode,
    model: optionalText(value.model),
    prompt_version: optionalText(value.prompt_version),
    provider,
    token_usage: isRecord(value.token_usage)
      ? {
          completion_tokens: optionalInteger(value.token_usage.completion_tokens),
          prompt_tokens: optionalInteger(value.token_usage.prompt_tokens),
          total_tokens: optionalInteger(value.token_usage.total_tokens)
        }
      : undefined
  };
}

function timeWindow(start: unknown, end: unknown): ResolvedTimeWindow {
  const startText = optionalText(start) ?? new Date(0).toISOString();
  const endText = optionalText(end) ?? new Date().toISOString();

  return {
    end: endText,
    explanation: "Saved report workflow time window from Supabase.",
    matched_phrase: "saved report",
    start: startText
  };
}

function normalizeTimeWindow(value: unknown): ResolvedTimeWindow | null {
  if (!isRecord(value)) {
    return null;
  }

  const start = text(value.start);
  const end = text(value.end);
  if (!start || !end) {
    return null;
  }

  return {
    end,
    explanation: text(value.explanation) || "Saved report workflow time window from Supabase.",
    matched_phrase: optionalText(value.matched_phrase),
    start
  };
}

function readErrorMessage(tableName: string, error: SupabaseReadError) {
  if (isMissingPublicViewError(tableName, error)) {
    return `${tableName} is not available yet; generated radar-item previews were used.`;
  }

  return `${tableName} read failed: ${sanitizeReadError(error.message)}`;
}

function isMissingPublicViewError(tableName: string, error: SupabaseReadError) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (haystack.includes(tableName.toLowerCase()) &&
      (haystack.includes("does not exist") ||
        haystack.includes("not find") ||
        haystack.includes("not found") ||
        haystack.includes("schema cache")))
  );
}

function reportTypeValue(value: unknown): ReportPreviewType | null {
  return value === "weekly" ? "weekly" : value === "daily" ? "daily" : null;
}

function candidateStatus(value: unknown): GeneratedReportStatus {
  return isOneOf(value, ["draft", "needs_review", "approved", "deferred", "rejected", "published"]) ?? "draft";
}

function reportStatus(value: unknown): GeneratedReportStatus {
  return isOneOf(value, ["draft", "reviewed", "published", "archived"]) ?? "draft";
}

function dataSourceValue(value: unknown): RetrievalDataSource | null {
  return isOneOf(value, ["supabase_radar_items", "local_understanding_output", "mock_data", "empty"]);
}

function languageValue(value: unknown): ReportLanguage {
  if (value === "en" || value === "mixed") {
    return value;
  }

  if (value === "bilingual") {
    return "mixed";
  }

  return "zh";
}

function sectionId(value: unknown) {
  return isOneOf(value, [
    "model_product_company_updates",
    "research_open_source",
    "agents_products",
    "business_ecosystem",
    "weak_signals_needs_review"
  ]);
}

function modeValue(value: unknown) {
  return isOneOf(value, ["deterministic_preview", "live_deepseek", "saved_candidate", "saved_report"]);
}

function statusForCitation(value: unknown): RetrievalCitation["status"] {
  return isOneOf(value, ["included", "excluded", "needs_review", "failed"]) ?? "needs_review";
}

function isOneOf<const T extends readonly string[]>(value: unknown, options: T): T[number] | null {
  if (typeof value !== "string") {
    return null;
  }

  return options.includes(value as T[number]) ? (value as T[number]) : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(text).filter(Boolean))).slice(0, 32);
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 5000) : "";
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || undefined;
}

function integer(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return 0;
  }

  return Math.floor(numberValue);
}

function optionalInteger(value: unknown) {
  const valueAsInteger = integer(value);
  return valueAsInteger > 0 ? valueAsInteger : undefined;
}

function score(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numberValue));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeReadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 400);
}
