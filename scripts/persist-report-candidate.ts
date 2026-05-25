import "@/lib/config/load-cli-env";

import { createHash } from "node:crypto";
import { type SupabaseClient } from "@supabase/supabase-js";

import { loadRadarFeed } from "@/lib/radar/feed";
import { formatMarkdownReport, generateReportDraft } from "@/lib/reports/generate-live-report";
import type { GeneratedReportDraft, ReportLanguage, ReportPreviewType } from "@/lib/reports/types";
import { getSupabaseServiceClientForWrite, getSupabaseServiceStatus } from "@/lib/supabase/service";

type CliOptions = {
  audience?: string;
  language: ReportLanguage;
  live: boolean;
  type: ReportPreviewType;
  write: boolean;
};

type CandidateWriteResult = {
  auditEventId?: string;
  candidateId: string;
  existingKind?: "report" | "report_candidate";
  skipped: boolean;
  status: string;
};

const duplicateCandidateStatuses = ["draft", "needs_review", "approved", "deferred", "published"] as const;
const duplicateReportStatuses = ["reviewed", "published"] as const;
const duplicateCheckedAt = () => new Date().toISOString();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const feed = await loadRadarFeed();
  const report = await generateReportDraft(feed, options.type, {
    audience: options.audience,
    language: options.language,
    live: options.live
  });

  printCandidateSummary(report, options, null);

  if (!options.write) {
    console.log("Supabase write attempted: no (dry-run)");
    return;
  }

  assertWriteReady(report);
  const supabase = getSupabaseServiceClientForWrite();
  const result = await persistCandidate(supabase, report, options);
  printCandidateSummary(report, options, result);
  console.log(
    result.skipped
      ? "Supabase write attempted: skipped new row after duplicate check"
      : "Supabase write attempted: yes (report_candidates and admin_audit_events only)"
  );
}

function printCandidateSummary(
  report: GeneratedReportDraft,
  options: CliOptions,
  result: CandidateWriteResult | null
) {
  const candidateDraft = candidateDraftForPersistence(report);

  console.log("Report candidate generation");
  console.log(`Type: ${candidateDraft.report_type}`);
  console.log(`Mode: ${candidateDraft.mode}`);
  console.log(`Status: ${result?.status ?? candidateDraft.status}`);
  console.log(`Data source: ${candidateDraft.data_source}`);
  console.log(`Time window: ${candidateDraft.time_window.start} to ${candidateDraft.time_window.end}`);
  console.log(`Retrieved items: ${candidateDraft.retrieved_item_count}`);
  console.log(`Usable items: ${candidateDraft.usable_item_count}`);
  console.log(`Source item UUIDs: ${candidateDraft.source_item_ids.length}`);
  console.log(`Citations: ${candidateDraft.citations.length}`);
  console.log(`Quality gate: ${candidateDraft.quality_gate_passed ? "passed" : "needs_more_data"}`);
  console.log(`Distinct sources: ${candidateDraft.distinct_source_count}`);
  console.log(`Categories: ${candidateDraft.category_count}`);
  console.log(`Caveats: ${candidateDraft.caveats.length}`);
  console.log(`Missing evidence: ${candidateDraft.missing_evidence.length}`);
  console.log(`Live requested: ${options.live ? "yes" : "no"}`);
  console.log(`Live DeepSeek used: ${candidateDraft.model_metadata.mode === "live_deepseek" ? "yes" : "no"}`);
  console.log(`API calls: ${candidateDraft.model_metadata.api_call_count}`);
  if (candidateDraft.model_metadata.error) {
    console.log(`Live fallback reason: ${sanitizeLogValue(candidateDraft.model_metadata.error)}`);
  }
  if (candidateDraft.quality_gate_reasons.length > 0) {
    console.log("Quality gate reasons:");
    for (const reason of candidateDraft.quality_gate_reasons) {
      console.log(`- ${sanitizeLogValue(reason)}`);
    }
  }
  console.log(`Markdown bytes: ${Buffer.byteLength(candidateDraft.markdown, "utf8")}`);
  console.log(`Write requested: ${options.write ? "yes" : "no"}`);
  if (result) {
    if (result.skipped) {
      console.log(`Duplicate suppression: skipped new insert because ${result.existingKind} ${result.candidateId} already matches.`);
    } else {
      console.log(`Report candidate id: ${result.candidateId}`);
      console.log(`Admin audit event id: ${result.auditEventId}`);
    }
  }
}

async function persistCandidate(
  supabase: SupabaseClient,
  report: GeneratedReportDraft,
  options: CliOptions
): Promise<CandidateWriteResult> {
  const candidateDraft = candidateDraftForPersistence(report);
  const candidateSignature = reportCandidateSignature(candidateDraft);
  const existing = await findExistingReportSeed(supabase, candidateDraft, candidateSignature);
  if (existing) {
    return {
      candidateId: existing.id,
      existingKind: existing.kind,
      skipped: true,
      status: existing.status
    };
  }
  const overlap = await findOverlappingReportSeed(supabase, candidateDraft);
  const checkedAt = duplicateCheckedAt();

  const { data, error } = await supabase
    .from("report_candidates")
    .insert({
      confidence: confidenceForReport(candidateDraft),
      metadata: {
        candidate_signature: candidateSignature,
        category_count: candidateDraft.category_count,
        citation_count: candidateDraft.citation_count,
        created_from: "report_candidate_cli",
        distinct_source_count: candidateDraft.distinct_source_count,
        duplicate_check: overlap
          ? {
              action: "created_new_candidate",
              checked_at: checkedAt,
              existing_id: overlap.id,
              existing_kind: overlap.kind,
              existing_status: overlap.status,
              reason: "Same report type and overlapping time window exists, but the evidence signature differs."
            }
          : {
              action: "no_overlap_found",
              checked_at: checkedAt
        },
        live_requested: options.live,
        quality_gate: candidateDraft.quality_gate,
        quality_gate_passed: candidateDraft.quality_gate_passed,
        quality_gate_reasons: candidateDraft.quality_gate_reasons,
        report_draft: candidateDraft
      },
      report_type: candidateDraft.report_type,
      source_item_ids: candidateDraft.source_item_ids,
      status: "needs_review",
      summary: candidateDraft.one_sentence_summary.slice(0, 1200),
      time_window_end: candidateDraft.time_window.end,
      time_window_start: candidateDraft.time_window.start,
      title: candidateDraft.title.slice(0, 180)
    })
    .select("id, status")
    .single();

  if (error || !isRecord(data) || typeof data.id !== "string" || typeof data.status !== "string") {
    throw new Error(`Report candidate write failed: ${sanitizeLogValue(error?.message ?? "No row returned.")}`);
  }

  const auditEventId = await insertAuditEvent(supabase, candidateDraft, data.id, options, candidateSignature);

  return {
    auditEventId,
    candidateId: data.id,
    skipped: false,
    status: data.status
  };
}

async function insertAuditEvent(
  supabase: SupabaseClient,
  report: GeneratedReportDraft,
  candidateId: string,
  options: CliOptions,
  candidateSignature: string
) {
  const { data, error } = await supabase
    .from("admin_audit_events")
    .insert({
      action: "report_candidate.generated",
      metadata: {
        api_call_count: report.model_metadata.api_call_count,
        candidate_signature: candidateSignature,
        category_count: report.category_count,
        caveats_count: report.caveats.length,
        citation_count: report.citation_count,
        citations_count: report.citations.length,
        data_source: report.data_source,
        distinct_source_count: report.distinct_source_count,
        live_requested: options.live,
        missing_evidence_count: report.missing_evidence.length,
        quality_gate_passed: report.quality_gate_passed,
        quality_gate_reasons: report.quality_gate_reasons,
        source_item_count: report.source_item_ids.length,
        report_type: report.report_type
      },
      summary: `Generated ${report.report_type} report candidate for review: ${report.title}`,
      target_id: candidateId,
      target_type: "report_candidate"
    })
    .select("id")
    .single();

  if (error || !isRecord(data) || typeof data.id !== "string") {
    throw new Error(`Admin audit event write failed: ${sanitizeLogValue(error?.message ?? "No row returned.")}`);
  }

  return data.id;
}

async function findExistingReportSeed(
  supabase: SupabaseClient,
  report: GeneratedReportDraft,
  candidateSignature: string
) {
  const [candidate, savedReport] = await Promise.all([
    findExistingCandidate(supabase, report, candidateSignature),
    findExistingReport(supabase, report, candidateSignature)
  ]);

  return candidate ?? savedReport;
}

async function findExistingCandidate(
  supabase: SupabaseClient,
  report: GeneratedReportDraft,
  candidateSignature: string
) {
  const { data, error } = await supabase
    .from("report_candidates")
    .select("id, status, title, source_item_ids, time_window_start, time_window_end, metadata")
    .eq("report_type", report.report_type)
    .lte("time_window_start", report.time_window.end)
    .gte("time_window_end", report.time_window.start)
    .in("status", [...duplicateCandidateStatuses])
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(12);

  if (error) {
    throw new Error(`Report candidate duplicate check failed: ${sanitizeLogValue(error.message)}`);
  }

  const match = ((data ?? []) as Record<string, unknown>[]).find((row) =>
    isMatchingSeed(row, report, candidateSignature)
  );
  const id = text(match?.id);
  const status = text(match?.status);

  return id
    ? {
        id,
        kind: "report_candidate" as const,
        status: status || "needs_review"
      }
    : null;
}

async function findExistingReport(
  supabase: SupabaseClient,
  report: GeneratedReportDraft,
  candidateSignature: string
) {
  const { data, error } = await supabase
    .from("reports")
    .select("id, status, title, time_window_start, time_window_end, metadata")
    .eq("type", report.report_type)
    .lte("time_window_start", report.time_window.end)
    .gte("time_window_end", report.time_window.start)
    .in("status", [...duplicateReportStatuses])
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(12);

  if (error) {
    throw new Error(`Saved report duplicate check failed: ${sanitizeLogValue(error.message)}`);
  }

  const match = ((data ?? []) as Record<string, unknown>[]).find((row) =>
    isMatchingSeed(row, report, candidateSignature)
  );
  const id = text(match?.id);
  const status = text(match?.status);

  return id
    ? {
        id,
        kind: "report" as const,
        status: status || "published"
      }
    : null;
}

async function findOverlappingReportSeed(
  supabase: SupabaseClient,
  report: GeneratedReportDraft
) {
  const [candidate, savedReport] = await Promise.all([
    findOverlappingCandidate(supabase, report),
    findOverlappingReport(supabase, report)
  ]);

  return candidate ?? savedReport;
}

async function findOverlappingCandidate(supabase: SupabaseClient, report: GeneratedReportDraft) {
  const { data, error } = await supabase
    .from("report_candidates")
    .select("id, status")
    .eq("report_type", report.report_type)
    .lte("time_window_start", report.time_window.end)
    .gte("time_window_end", report.time_window.start)
    .in("status", [...duplicateCandidateStatuses])
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Report candidate overlap check failed: ${sanitizeLogValue(error.message)}`);
  }

  return toExistingSeed(data, "report_candidate");
}

async function findOverlappingReport(supabase: SupabaseClient, report: GeneratedReportDraft) {
  const { data, error } = await supabase
    .from("reports")
    .select("id, status")
    .eq("type", report.report_type)
    .lte("time_window_start", report.time_window.end)
    .gte("time_window_end", report.time_window.start)
    .in("status", [...duplicateReportStatuses])
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Saved report overlap check failed: ${sanitizeLogValue(error.message)}`);
  }

  return toExistingSeed(data, "report");
}

function toExistingSeed(data: unknown, kind: "report" | "report_candidate") {
  if (!isRecord(data)) {
    return null;
  }

  const id = text(data.id);
  const status = text(data.status);

  return id
    ? {
        id,
        kind,
        status: status || "unknown"
      }
    : null;
}

function candidateDraftForPersistence(report: GeneratedReportDraft): GeneratedReportDraft {
  const draft: GeneratedReportDraft = {
    ...report,
    markdown: "",
    status: "needs_review"
  };

  return {
    ...draft,
    markdown: formatMarkdownReport(draft)
  };
}

function reportCandidateSignature(report: GeneratedReportDraft) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        data_source: report.data_source,
        report_type: report.report_type,
        source_item_ids: stableStringArray(report.source_item_ids),
        time_window_end: report.time_window.end,
        time_window_start: report.time_window.start
      })
    )
    .digest("hex");
}

function isMatchingSeed(
  row: Record<string, unknown>,
  report: GeneratedReportDraft,
  candidateSignature: string
) {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const draft = reportDraftRecord(metadata);
  const rowSignature = text(metadata.candidate_signature) || text(draft?.candidate_signature);
  if (rowSignature && rowSignature === candidateSignature) {
    return true;
  }

  const rowSourceItemIds = Array.isArray(row.source_item_ids)
    ? stringArray(row.source_item_ids)
    : stringArray(draft?.source_item_ids);
  if (sameStringSet(rowSourceItemIds, report.source_item_ids)) {
    return true;
  }

  return report.source_item_ids.length === 0 && text(row.title) === report.title;
}

function reportDraftRecord(metadata: Record<string, unknown>) {
  return isRecord(metadata.report_draft) ? metadata.report_draft : null;
}

function assertWriteReady(report: GeneratedReportDraft) {
  const status = getSupabaseServiceStatus();
  const missing = [
    status.publicConfigConfigured ? "" : "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY",
    status.serviceRoleConfigured ? "" : "SUPABASE_SERVICE_ROLE_KEY",
    status.writesEnabled ? "" : "ENABLE_SUPABASE_WRITES=true"
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Supabase report candidate write is not configured. Missing: ${missing.join(", ")}.`);
  }

  if (report.data_source !== "supabase_radar_items") {
    throw new Error("Report candidate writes require Supabase radar items as the report evidence source.");
  }
}

function confidenceForReport(report: GeneratedReportDraft) {
  if (report.usable_item_count === 0) {
    return 0;
  }

  const citationCoverage = Math.min(1, report.citations.length / Math.max(1, report.usable_item_count));
  const gapPenalty = Math.min(0.4, report.missing_evidence.length * 0.04);

  return Number(Math.max(0.1, Math.min(0.95, 0.55 + citationCoverage * 0.3 - gapPenalty)).toFixed(3));
}

function sameStringSet(left: string[], right: string[]) {
  const sortedLeft = stableStringArray(left);
  const sortedRight = stableStringArray(right);

  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function stableStringArray(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    language: "zh",
    live: false,
    type: "daily",
    write: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--type":
        options.type = reportType(readArg(args, index));
        index += 1;
        break;
      case "--live":
        options.live = true;
        break;
      case "--write":
        options.write = true;
        break;
      case "--language":
        options.language = language(readArg(args, index));
        index += 1;
        break;
      case "--audience":
        options.audience = readArg(args, index).slice(0, 120);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readArg(args: string[], index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${args[index]} requires a value.`);
  }

  return value;
}

function reportType(value: string): ReportPreviewType {
  if (value === "daily" || value === "weekly") {
    return value;
  }

  throw new Error("--type must be daily or weekly.");
}

function language(value: string): ReportLanguage {
  if (value === "zh" || value === "en" || value === "mixed") {
    return value;
  }

  throw new Error("--language must be zh, en, or mixed.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(text).filter(Boolean)));
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeLogValue(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY)\s*=\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 600);
}

main().catch((error) => {
  console.error(sanitizeLogValue(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
