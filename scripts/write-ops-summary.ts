import "@/lib/config/load-cli-env";

import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { loadPublicDataCompletenessSummary } from "@/lib/data-completeness/public-summary";
import { buildEventLayer } from "@/lib/events/clustering";
import { loadRadarFeed } from "@/lib/radar/feed";
import { generateReportDraft } from "@/lib/reports/generate-live-report";
import {
  distinctSourcesFromCitations,
  normalizeReportQualityGate
} from "@/lib/reports/quality-gates";
import type { ReportPreviewType, ReportQualityGate } from "@/lib/reports/types";
import { getSupabaseServerReadClient } from "@/lib/supabase/server-read";
import { getSupabaseServiceClient, getSupabaseServiceStatus } from "@/lib/supabase/service";

type CliOptions = {
  stage: "before" | "after";
  runId: string;
  mode: "mock" | "live";
  persist: boolean;
  deployCloudflare: boolean;
  generateReports: boolean;
  runEventsCluster: boolean;
  cloudflareUrl?: string;
  outputDir: string;
  warnings: string[];
  errors: string[];
};

type OpsCounts = {
  raw_items: number | null;
  radar_items: number | null;
  public_radar_items: number | null;
  included: number | null;
  needs_review: number | null;
  excluded: number | null;
  failed: number | null;
  report_candidates: number | null;
};

type ReportCandidateSummary = {
  id: string | null;
  status: string;
  quality_gate: ReportQualityGate;
};

type ActivationSummary = {
  run_id?: string;
  totals?: {
    chunks_attempted?: number;
    chunks_succeeded?: number;
    chunks_failed?: number;
    raw_items?: number;
    radar_items?: number;
    included?: number;
    needs_review?: number;
    excluded?: number;
    failed?: number;
    deepseek_api_calls?: number;
  };
  failure_families?: Record<string, number>;
  warnings?: string[];
};

const latestOpsDir = path.join(process.cwd(), "data", "ops", "latest");
const beforeCountsPath = path.join(latestOpsDir, "before-counts.json");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.outputDir, { recursive: true });

  const counts = await loadCounts();
  if (options.stage === "before") {
    await writeJson(beforeCountsPath, counts);
  }

  const beforeCounts = options.stage === "after" ? await readOptionalJson<OpsCounts>(beforeCountsPath) : counts;
  const activation = await readOptionalJson<ActivationSummary>(path.join(process.cwd(), "data", "activation", "latest", "summary.json"));
  const coverage = await loadPublicDataCompletenessSummary();
  const [dailyCandidate, weeklyCandidate] = await Promise.all([
    latestReportCandidate("daily"),
    latestReportCandidate("weekly")
  ]);
  const warnings = uniqueStrings([
    ...options.warnings,
    ...(activation?.warnings ?? []),
    ...coverage.warnings
  ]).map(sanitizeLogValue);
  const errors = uniqueStrings(options.errors).map(sanitizeLogValue);
  const summary = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    run_id: options.runId,
    stage: options.stage,
    mode: options.mode,
    persist: options.persist,
    deploy_cloudflare: options.deployCloudflare,
    generate_reports: options.generateReports,
    run_events_cluster: options.runEventsCluster,
    counts: {
      before: beforeCounts,
      after: counts
    },
    status_counts: {
      included: counts.included,
      needs_review: counts.needs_review,
      excluded: counts.excluded,
      failed: counts.failed
    },
    chunks: {
      attempted: activation?.totals?.chunks_attempted ?? 0,
      succeeded: activation?.totals?.chunks_succeeded ?? 0,
      failed: activation?.totals?.chunks_failed ?? 0
    },
    deepseek_api_calls: activation?.totals?.deepseek_api_calls ?? 0,
    failure_families: activation?.failure_families ?? coverage.failureFamilies,
    event_clusters: await eventClusterCount(),
    source_problem_counts: {
      timeout: (activation?.failure_families ?? coverage.failureFamilies).timeout ?? 0,
      "403": (activation?.failure_families ?? coverage.failureFamilies)["403"] ?? 0,
      rate_limit: (activation?.failure_families ?? coverage.failureFamilies).rate_limit ?? 0
    },
    daily_candidate: dailyCandidate,
    weekly_candidate: weeklyCandidate,
    cloudflare_url: options.deployCloudflare ? options.cloudflareUrl ?? "https://ai-industry-radar.pages.dev" : null,
    warnings,
    errors,
    safety: {
      supabase_writes_requested: options.persist,
      scheduled_jobs_run: false,
      x_wechat_auto_crawl_run: false,
      source_health_writes_run: false,
      secrets_printed: false
    }
  };
  const jsonPath = path.join(options.outputDir, "radar-refresh-summary.json");
  const markdownPath = path.join(options.outputDir, "radar-refresh-summary.md");

  await writeJson(jsonPath, summary);
  await fs.writeFile(markdownPath, renderMarkdown(summary), "utf8");

  console.log(`Ops summary written: ${relative(jsonPath)} ${relative(markdownPath)}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    deployCloudflare: false,
    errors: [],
    generateReports: false,
    mode: "mock",
    outputDir: latestOpsDir,
    persist: false,
    runEventsCluster: false,
    runId: process.env.GITHUB_RUN_ID ? `github_${process.env.GITHUB_RUN_ID}` : `local_${timestampForId(new Date().toISOString())}`,
    stage: "after",
    warnings: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--stage":
        options.stage = stage(readArg(args, index));
        index += 1;
        break;
      case "--run-id":
        options.runId = sanitizeIdentifier(readArg(args, index));
        index += 1;
        break;
      case "--mode":
        options.mode = mode(readArg(args, index));
        index += 1;
        break;
      case "--persist":
        options.persist = booleanValue(readArg(args, index));
        index += 1;
        break;
      case "--deploy-cloudflare":
        options.deployCloudflare = booleanValue(readArg(args, index));
        index += 1;
        break;
      case "--generate-reports":
        options.generateReports = booleanValue(readArg(args, index));
        index += 1;
        break;
      case "--run-events-cluster":
        options.runEventsCluster = booleanValue(readArg(args, index));
        index += 1;
        break;
      case "--cloudflare-url":
        options.cloudflareUrl = readArg(args, index).slice(0, 240);
        index += 1;
        break;
      case "--output-dir":
        options.outputDir = path.resolve(readArg(args, index));
        index += 1;
        break;
      case "--warning":
        options.warnings.push(readArg(args, index));
        index += 1;
        break;
      case "--error":
        options.errors.push(readArg(args, index));
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function loadCounts(): Promise<OpsCounts> {
  const coverage = await loadPublicDataCompletenessSummary();
  return {
    excluded: coverage.excluded,
    failed: coverage.failedRadarItems,
    included: coverage.included,
    needs_review: coverage.needsReview,
    public_radar_items: coverage.publicRadarItems,
    radar_items: coverage.radarItems,
    raw_items: coverage.rawItems,
    report_candidates: coverage.reportCandidates
  };
}

async function latestReportCandidate(reportType: ReportPreviewType): Promise<ReportCandidateSummary> {
  const serviceStatus = getSupabaseServiceStatus();

  if (serviceStatus.publicConfigConfigured && serviceStatus.serviceRoleConfigured) {
    const { data } = await getSupabaseServiceClient()
      .from("report_candidates")
      .select("id, report_type, status, source_item_ids, metadata, created_at")
      .eq("report_type", reportType)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (isRecord(data)) {
      const metadata = record(data.metadata);
      const draft = record(metadata.report_draft);
      return summarizeCandidateDraft(data, draft, reportType);
    }
  }

  const supabase = getSupabaseServerReadClient();

  if (supabase) {
    const { data } = await supabase
      .from("public_report_candidates")
      .select("id, report_type, status, source_item_ids, report_draft")
      .eq("report_type", reportType)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (isRecord(data)) {
      const draft = record(data.report_draft);
      return summarizeCandidateDraft(data, draft, reportType);
    }
  }

  const feed = await loadRadarFeed();
  const draft = await generateReportDraft(feed, reportType, { language: "zh", live: false });
  return {
    id: null,
    quality_gate: draft.quality_gate,
    status: draft.status
  };
}

function summarizeCandidateDraft(
  data: Record<string, unknown>,
  draft: Record<string, unknown>,
  reportType: ReportPreviewType
): ReportCandidateSummary {
  const citations = citationsFromDraft(draft.citations);
  const sourceItemCount = stringArray(data.source_item_ids).length || stringArray(draft.source_item_ids).length;
  const qualityGate = normalizeReportQualityGate(draft.quality_gate, {
    categoryCount: integer(draft.category_count),
    categoryGateApplicable: integer(draft.category_count) > 0,
    citationCount: integer(draft.citation_count, citations.length),
    distinctSourceCount: integer(draft.distinct_source_count, distinctSourcesFromCitations(citations)),
    reportType,
    usableItemCount: integer(draft.usable_item_count, sourceItemCount)
  });

  return {
    id: text(data.id) || null,
    quality_gate: qualityGate,
    status: qualityGate.passed ? text(data.status) || "draft" : "needs_review"
  };
}

async function eventClusterCount() {
  const feed = await loadRadarFeed();
  return buildEventLayer(
    feed.items.map((item) => ({
      categories: item.categories,
      collected_at: item.collected_at,
      confidence: item.confidence,
      entities: item.entities,
      evidence_notes: item.evidence_notes,
      id: item.id,
      language: item.language,
      processed_at: item.processed_at,
      published_at: item.published_at,
      scores: {
        ai_relevance: item.ai_relevance_score,
        credibility: item.credibility_score,
        freshness: item.freshness_score,
        importance: item.importance_score,
        novelty: item.novelty_score,
        overall: item.overall_score
      },
      source_name: item.source_name,
      source_tier: item.source_tier,
      status: item.status,
      summary_en: item.summary_en,
      summary_zh: item.summary_zh,
      tags: item.tags,
      title: item.title,
      url: item.url,
      why_it_matters: item.why_it_matters
    }))
  ).event_count;
}

function renderMarkdown(summary: Awaited<ReturnType<typeof main>> extends never ? never : Record<string, unknown>) {
  const value = summary as {
    generated_at: string;
    run_id: string;
    mode: string;
    persist: boolean;
    deploy_cloudflare: boolean;
    counts: { before: OpsCounts | null; after: OpsCounts };
    status_counts: Record<string, number | null>;
    chunks: Record<string, number>;
    deepseek_api_calls: number;
    event_clusters: number;
    failure_families: Record<string, number>;
    daily_candidate: ReportCandidateSummary;
    weekly_candidate: ReportCandidateSummary;
    cloudflare_url: string | null;
    warnings: string[];
    errors: string[];
  };

  return [
    "# Radar Refresh Ops Summary",
    "",
    `Generated: ${value.generated_at}`,
    `Run id: ${value.run_id}`,
    `Mode: ${value.mode}`,
    `Persist: ${yesNo(value.persist)}`,
    `Deploy Cloudflare: ${yesNo(value.deploy_cloudflare)}`,
    "",
    "## Counts",
    "",
    `- Raw items before/after: ${formatNullable(value.counts.before?.raw_items ?? null)} / ${formatNullable(value.counts.after.raw_items)}`,
    `- Radar items before/after: ${formatNullable(value.counts.before?.radar_items ?? null)} / ${formatNullable(value.counts.after.radar_items)}`,
    `- Public radar items before/after: ${formatNullable(value.counts.before?.public_radar_items ?? null)} / ${formatNullable(value.counts.after.public_radar_items)}`,
    `- Included / needs_review / excluded / failed: ${formatNullable(value.status_counts.included)} / ${formatNullable(value.status_counts.needs_review)} / ${formatNullable(value.status_counts.excluded)} / ${formatNullable(value.status_counts.failed)}`,
    `- Report candidates before/after: ${formatNullable(value.counts.before?.report_candidates ?? null)} / ${formatNullable(value.counts.after.report_candidates)}`,
    "",
    "## Run",
    "",
    `- Chunks attempted/succeeded/failed: ${value.chunks.attempted} / ${value.chunks.succeeded} / ${value.chunks.failed}`,
    `- DeepSeek API calls: ${value.deepseek_api_calls}`,
    `- Failure families: ${formatDistribution(value.failure_families)}`,
    `- Event clusters: ${value.event_clusters}`,
    "",
    "## Reports",
    "",
    reportLine("Daily", value.daily_candidate),
    reportLine("Weekly", value.weekly_candidate),
    "",
    "## Cloudflare",
    "",
    `- URL: ${value.cloudflare_url ?? "not deployed"}`,
    "",
    "## Warnings",
    "",
    value.warnings.length > 0 ? value.warnings.map((warning) => `- ${warning}`).join("\n") : "- None.",
    "",
    "## Errors",
    "",
    value.errors.length > 0 ? value.errors.map((error) => `- ${error}`).join("\n") : "- None.",
    ""
  ].join("\n");
}

function reportLine(label: string, candidate: ReportCandidateSummary) {
  return `- ${label}: id=${candidate.id ?? "not available"} status=${candidate.status} quality=${candidate.quality_gate.passed ? "passed" : "needs_more_data"} usable=${candidate.quality_gate.usable_item_count} citations=${candidate.quality_gate.citation_count} sources=${candidate.quality_gate.distinct_source_count} categories=${candidate.quality_gate.category_count} reasons=${candidate.quality_gate.reasons.join("; ") || "none"}`;
}

function citationsFromDraft(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((citation) => {
      if (!isRecord(citation)) {
        return null;
      }

      const id = text(citation.id);
      const title = text(citation.title);
      const sourceName = text(citation.source_name);
      const url = text(citation.url);

      return id && title && sourceName && url
        ? {
            collected_at: text(citation.collected_at) || new Date(0).toISOString(),
            confidence: 0,
            id,
            source_name: sourceName,
            status: "needs_review" as const,
            title,
            url
          }
        : null;
    })
    .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));
}

async function readOptionalJson<T>(filePath: string): Promise<T | null> {
  if (!fsSync.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readArg(args: string[], index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${args[index]} requires a value.`);
  }

  return value;
}

function stage(value: string): CliOptions["stage"] {
  if (value === "before" || value === "after") {
    return value;
  }

  throw new Error("--stage must be before or after.");
}

function mode(value: string): CliOptions["mode"] {
  if (value === "mock" || value === "live") {
    return value;
  }

  throw new Error("--mode must be mock or live.");
}

function booleanValue(value: string) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("Boolean options must be true or false.");
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(text).filter(Boolean)));
}

function integer(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return Math.floor(numberValue);
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function formatNullable(value: number | null) {
  return value === null ? "unavailable" : String(value);
}

function formatDistribution(value: Record<string, number>) {
  const entries = Object.entries(value).filter(([, count]) => count > 0);
  return entries.length > 0 ? entries.map(([key, count]) => `${key}=${count}`).join(" ") : "none";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function relative(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function timestampForId(value: string) {
  return value.replace(/[-:.]/g, "").replace("T", "_").replace("Z", "Z");
}

function sanitizeIdentifier(value: string) {
  return value.replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 120);
}

function sanitizeLogValue(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/g, "[github-token-redacted]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/gi, "[github-token-redacted]")
    .replace(/\b(DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)\s*=\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 600);
}

main().catch((error) => {
  console.error(sanitizeLogValue(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
