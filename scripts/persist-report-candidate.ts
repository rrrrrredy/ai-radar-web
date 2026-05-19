import "@/lib/config/load-cli-env";

import { type SupabaseClient } from "@supabase/supabase-js";

import { loadRadarFeed } from "@/lib/radar/feed";
import { generateReportDraft } from "@/lib/reports/generate-live-report";
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
  auditEventId: string;
  candidateId: string;
  status: string;
};

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
  console.log("Supabase write attempted: yes (report_candidates and admin_audit_events only)");
}

function printCandidateSummary(
  report: GeneratedReportDraft,
  options: CliOptions,
  result: CandidateWriteResult | null
) {
  console.log("Report candidate generation");
  console.log(`Type: ${report.report_type}`);
  console.log(`Mode: ${report.mode}`);
  console.log(`Status: ${result?.status ?? "needs_review"}`);
  console.log(`Data source: ${report.data_source}`);
  console.log(`Time window: ${report.time_window.start} to ${report.time_window.end}`);
  console.log(`Retrieved items: ${report.retrieved_item_count}`);
  console.log(`Usable items: ${report.usable_item_count}`);
  console.log(`Source item UUIDs: ${report.source_item_ids.length}`);
  console.log(`Citations: ${report.citations.length}`);
  console.log(`Caveats: ${report.caveats.length}`);
  console.log(`Missing evidence: ${report.missing_evidence.length}`);
  console.log(`Live requested: ${options.live ? "yes" : "no"}`);
  console.log(`Live DeepSeek used: ${report.model_metadata.mode === "live_deepseek" ? "yes" : "no"}`);
  console.log(`API calls: ${report.model_metadata.api_call_count}`);
  if (report.model_metadata.error) {
    console.log(`Live fallback reason: ${sanitizeLogValue(report.model_metadata.error)}`);
  }
  console.log(`Write requested: ${options.write ? "yes" : "no"}`);
  if (result) {
    console.log(`Report candidate id: ${result.candidateId}`);
    console.log(`Admin audit event id: ${result.auditEventId}`);
  }
}

async function persistCandidate(
  supabase: SupabaseClient,
  report: GeneratedReportDraft,
  options: CliOptions
): Promise<CandidateWriteResult> {
  const { data, error } = await supabase
    .from("report_candidates")
    .insert({
      confidence: confidenceForReport(report),
      metadata: {
        created_from: "report_candidate_cli",
        live_requested: options.live,
        report_draft: report
      },
      report_type: report.report_type,
      source_item_ids: report.source_item_ids,
      status: "needs_review",
      summary: report.one_sentence_summary.slice(0, 1200),
      time_window_end: report.time_window.end,
      time_window_start: report.time_window.start,
      title: report.title.slice(0, 180)
    })
    .select("id, status")
    .single();

  if (error || !isRecord(data) || typeof data.id !== "string" || typeof data.status !== "string") {
    throw new Error(`Report candidate write failed: ${sanitizeLogValue(error?.message ?? "No row returned.")}`);
  }

  const auditEventId = await insertAuditEvent(supabase, report, data.id, options);

  return {
    auditEventId,
    candidateId: data.id,
    status: data.status
  };
}

async function insertAuditEvent(
  supabase: SupabaseClient,
  report: GeneratedReportDraft,
  candidateId: string,
  options: CliOptions
) {
  const { data, error } = await supabase
    .from("admin_audit_events")
    .insert({
      action: "report_candidate.generated",
      metadata: {
        api_call_count: report.model_metadata.api_call_count,
        data_source: report.data_source,
        live_requested: options.live,
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
