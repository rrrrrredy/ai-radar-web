import "@/lib/config/load-cli-env";

import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isPublicHttpUrl } from "@/lib/ingestion/config";
import { readCleanedSources, sourceFamily } from "@/lib/ingestion/select-sources";
import type { CleanedSource, IngestionRawItem, IngestionSourceSummary } from "@/lib/ingestion/types";
import {
  categorizeFailureFamily,
  compactFailureFamilyCounts,
  incrementFailureFamily,
  type FailureFamilyCounts
} from "@/lib/ops/failure-families";
import { isSourceHealthEligible } from "@/lib/supabase/persistence";
import { getSupabaseServiceClient, getSupabaseServiceStatus } from "@/lib/supabase/service";
import type { UnderstandingRadarItem, UnderstandingStatus } from "@/lib/understanding/types";

type FinalSourceStatus =
  | "fetched"
  | "no_new_items"
  | "deduped"
  | "skipped_not_automated"
  | "skipped_low_priority"
  | "failed_timeout"
  | "failed_403"
  | "failed_rate_limit"
  | "failed_parse"
  | "blocked_requires_manual"
  | "unsupported_source"
  | "needs_review";

type SourceAuditRow = {
  source_slug: string;
  source_name: string;
  source_type_family: string;
  source_tier: string;
  source_status: string;
  crawl_method: string;
  automated_eligible: boolean;
  selected_in_latest_run: boolean;
  fetched: boolean;
  raw_item_count: number;
  radar_item_count: number;
  public_visible_item_count: number;
  latest_raw_item_timestamp: string | null;
  latest_radar_item_timestamp: string | null;
  latest_error_warning: string | null;
  final_status: FinalSourceStatus;
  reason: string;
};

type ActivationCheckpoint = {
  run_id: string;
  mode: string;
  limit: number;
  chunk_size: number;
  max_items_per_source: number;
  selected_source_ids: string[];
  started_at: string;
  updated_at: string;
  chunks: Array<{
    index: number;
    source_ids: string[];
    status: "completed" | "failed" | "persist_failed";
    output_file?: string;
    persisted: boolean;
    persist_counts?: Record<string, number>;
    raw_item_count: number;
    radar_item_count: number;
    included_count: number;
    needs_review_count: number;
    excluded_count: number;
    failed_count: number;
    duplicate_count: number;
    source_results: IngestionSourceSummary[];
    warnings: string[];
    error?: string;
  }>;
  warnings: string[];
};

type ChunkOutput = {
  raw_items: IngestionRawItem[];
  radar_items: UnderstandingRadarItem[];
};

type SupabaseSourceRow = {
  id: string;
  slug: string | null;
  status: string | null;
  risk_flags: string[] | null;
};

type SupabaseRawRow = {
  id: string;
  local_id: string | null;
  source_id: string | null;
  published_at: string | null;
  collected_at: string | null;
  retrieved_at: string | null;
  status: string | null;
  error_message: string | null;
  source_snapshot: {
    source_id?: string | null;
  } | null;
};

type SupabaseRadarRow = {
  id: string;
  local_id: string | null;
  raw_item_id: string | null;
  source_id: string | null;
  source_name: string | null;
  title: string | null;
  url: string | null;
  published_at: string | null;
  collected_at: string | null;
  processed_at: string | null;
  status: string | null;
  understanding_status: string | null;
  exclusion_reason: string | null;
  summary_zh: string | null;
  summary_en: string | null;
};

type SupabasePublicRadarRow = {
  id: string;
  local_id: string | null;
  source_id: string | null;
  title: string | null;
  url: string | null;
  collected_at: string | null;
  processed_at: string | null;
  understanding_status: string | null;
};

type LatestRunRow = {
  started_at?: string | null;
  finished_at?: string | null;
  ended_at?: string | null;
  metadata?: {
    source_results?: IngestionSourceSummary[];
  } | null;
};

type SupabaseAuditData = {
  available: boolean;
  sources: SupabaseSourceRow[];
  rawItems: SupabaseRawRow[];
  radarItems: SupabaseRadarRow[];
  publicRadarItems: SupabasePublicRadarRow[];
  reportCandidateCount: number | null;
  ingestionRunCount: number | null;
  understandingRunCount: number | null;
  latestIngestion: string | null;
  latestUnderstanding: string | null;
  warnings: string[];
};

type SourceStats = {
  rawItemCount: number;
  radarItemCount: number;
  publicVisibleItemCount: number;
  latestRawItemTimestamp: string | null;
  latestRadarItemTimestamp: string | null;
};

type PipelineAudit = {
  sources_total: number;
  automated_eligible_sources: number;
  sources_attempted_latest_run: number;
  sources_fetched_latest_run: number;
  sources_skipped_latest_run: number;
  sources_failed_latest_run: number;
  sources_blocked_manual: number;
  sources_with_at_least_one_raw_item: number;
  sources_with_at_least_one_radar_item: number;
  sources_with_at_least_one_public_radar_item: number;
  raw_items_total: number;
  raw_items_with_radar_items: number;
  radar_items_total: number;
  radar_items_included: number;
  radar_items_needs_review: number;
  radar_items_excluded: number;
  radar_items_failed: number;
  public_radar_items_total: number;
  report_candidates_total: number | null;
  latest_ingestion_timestamp: string | null;
  latest_understanding_timestamp: string | null;
  excluded_reasons_distribution: Record<string, number>;
  failure_family_distribution: FailureFamilyCounts;
  failed_source_reason_distribution: Record<string, number>;
  conversion_rates: {
    source_to_raw_coverage: string;
    raw_to_radar_conversion: string;
    radar_to_public_visibility: string;
    public_visible_sources_over_total_configured_sources: string;
  };
};

type DataCompletenessReport = {
  schema_version: 1;
  generated_at: string;
  latest_run: {
    run_id: string | null;
    mode: string | null;
    selected_sources: number;
    chunks_attempted: number;
    chunks_completed: number;
    chunks_persisted: number;
  };
  pipeline: PipelineAudit;
  persistence: {
    unpersisted_chunks_found: boolean;
    completed_chunks: number;
    persisted_chunks: number;
    persist_failed_chunks: number;
    missing_raw_item_ids_in_supabase: number;
    missing_radar_item_ids_in_supabase: number;
    persisted_counts_from_latest_checkpoint: Record<string, number>;
    duplicate_upsert_behavior: string;
  };
  public_visibility: {
    public_view_gap_count: number;
    valid_included_or_needs_review_missing_public_view_count: number;
    gap_reason_distribution: Record<string, number>;
    public_view_gap_fixed: boolean;
  };
  github_rate_limit: {
    token_present: boolean | null;
    min_remaining: number | null;
    latest_reset_at: string | null;
    sources_observed: number;
  };
  source_rows: SourceAuditRow[];
  safety: {
    supabase_writes_run: boolean;
    scheduled_jobs_run: false;
    x_wechat_auto_crawl_run: false;
    secrets_printed: false;
    env_local_committed: false;
  };
  warnings: string[];
};

const docsPath = path.join(process.cwd(), "docs", "data-completeness-release-candidate.md");
const jsonPath = path.join(process.cwd(), "data", "reports", "data-completeness.latest.json");
const checkpointPath = path.join(process.cwd(), "data", "activation", "latest", "checkpoint.json");

async function main() {
  const report = await buildReport();
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(docsPath, renderMarkdown(report), "utf8");

  console.log("Data completeness audit written");
  console.log(`Markdown: ${path.relative(process.cwd(), docsPath)}`);
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Sources audited: ${report.pipeline.sources_total}`);
  console.log(`Public radar items: ${report.pipeline.public_radar_items_total}`);
  console.log(`Public view gaps: ${report.public_visibility.public_view_gap_count}`);
}

async function buildReport(): Promise<DataCompletenessReport> {
  const generatedAt = new Date().toISOString();
  const sources = readCleanedSources();
  const checkpoint = await readCheckpoint();
  const chunks = checkpoint ? await readChunkOutputs(checkpoint) : [];
  const latestSourceResults = latestSourceResultsBySlug(checkpoint?.chunks.flatMap((chunk) => chunk.source_results) ?? []);
  const selectedSourceIds = new Set((checkpoint?.selected_source_ids ?? []).slice(0, checkpoint?.limit ?? 0));
  const localStats = buildLocalStats(chunks);
  const supabase = await loadSupabaseAuditData();
  const sourceIdToSlug = new Map(supabase.sources.map((source) => [source.id, source.slug ?? source.id]));
  const sourceRowsBySlug = new Map(supabase.sources.map((source) => [source.slug ?? source.id, source]));
  const productionStats = supabase.available ? buildSupabaseStats(supabase, sourceIdToSlug) : localStats;
  const sourceRows = sources.map((source) =>
    buildSourceAuditRow({
      latestSourceResults,
      productionStats,
      selectedSourceIds,
      source
    })
  );
  const pipeline = buildPipelineAudit({
    checkpoint,
    localStats,
    sourceRows,
    sources,
    sourceIdToSlug,
    supabase
  });
  const persistence = buildPersistenceAudit({ checkpoint, chunks, supabase });
  const publicVisibility = buildPublicVisibilityAudit({ sourceRowsBySlug, supabase });

  return {
    schema_version: 1,
    generated_at: generatedAt,
    latest_run: {
      chunks_attempted: checkpoint?.chunks.length ?? 0,
      chunks_completed: checkpoint?.chunks.filter((chunk) => chunk.status === "completed").length ?? 0,
      chunks_persisted: checkpoint?.chunks.filter((chunk) => chunk.persisted).length ?? 0,
      mode: checkpoint?.mode ?? null,
      run_id: checkpoint?.run_id ?? null,
      selected_sources: (checkpoint?.selected_source_ids ?? []).slice(0, checkpoint?.limit ?? 0).length
    },
    pipeline,
    persistence,
    public_visibility: publicVisibility,
    github_rate_limit: githubRateLimitStatus(checkpoint),
    source_rows: sourceRows,
    safety: {
      env_local_committed: false,
      scheduled_jobs_run: false,
      secrets_printed: false,
      supabase_writes_run: false,
      x_wechat_auto_crawl_run: false
    },
    warnings: dedupe([...(checkpoint?.warnings ?? []), ...supabase.warnings].map(sanitizeLogValue))
  };
}

async function readCheckpoint() {
  if (!fsSync.existsSync(checkpointPath)) {
    return null;
  }

  return JSON.parse(await fs.readFile(checkpointPath, "utf8")) as ActivationCheckpoint;
}

async function readChunkOutputs(checkpoint: ActivationCheckpoint) {
  const outputs: ChunkOutput[] = [];

  for (const chunk of checkpoint.chunks) {
    if (!chunk.output_file || chunk.status !== "completed") {
      continue;
    }

    const outputPath = path.join(process.cwd(), chunk.output_file);
    if (!fsSync.existsSync(outputPath)) {
      continue;
    }

    outputs.push(JSON.parse(await fs.readFile(outputPath, "utf8")) as ChunkOutput);
  }

  return outputs;
}

async function loadSupabaseAuditData(): Promise<SupabaseAuditData> {
  const status = getSupabaseServiceStatus();
  const empty: SupabaseAuditData = {
    available: false,
    ingestionRunCount: null,
    latestIngestion: null,
    latestUnderstanding: null,
    publicRadarItems: [],
    radarItems: [],
    rawItems: [],
    reportCandidateCount: null,
    sources: [],
    understandingRunCount: null,
    warnings: []
  };

  if (!status.publicConfigConfigured || !status.serviceRoleConfigured) {
    return {
      ...empty,
      warnings: ["Supabase service read config unavailable; audit used local activation outputs where possible."]
    };
  }

  try {
    const supabase = getSupabaseServiceClient();
    const [sources, rawItems, radarItems, publicItems, reportCandidates, ingestionRuns, understandingRuns, latestIngestion, latestUnderstanding] =
      await Promise.all([
        selectAll<SupabaseSourceRow>(supabase, "sources", "id, slug, status, risk_flags"),
        selectAll<SupabaseRawRow>(
          supabase,
          "raw_items",
          "id, local_id, source_id, published_at, collected_at, retrieved_at, status, error_message, source_snapshot"
        ),
        selectAll<SupabaseRadarRow>(
          supabase,
          "radar_items",
          "id, local_id, raw_item_id, source_id, source_name, title, url, published_at, collected_at, processed_at, status, understanding_status, exclusion_reason, summary_zh, summary_en"
        ),
        selectAll<SupabasePublicRadarRow>(
          supabase,
          "public_radar_items",
          "id, local_id, source_id, title, url, collected_at, processed_at, understanding_status"
        ),
        exactCount(supabase, "report_candidates"),
        exactCount(supabase, "ingestion_runs"),
        exactCount(supabase, "understanding_runs"),
        supabase
          .from("ingestion_runs")
          .select("started_at, finished_at, metadata")
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(1),
        supabase
          .from("understanding_runs")
          .select("started_at, ended_at")
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(1)
      ]);
    const warnings = [
      sources.warning,
      rawItems.warning,
      radarItems.warning,
      publicItems.warning,
      countWarning(reportCandidates),
      countWarning(ingestionRuns),
      countWarning(understandingRuns),
      latestIngestion.error ? `Latest ingestion read failed: ${sanitizeLogValue(latestIngestion.error.message)}` : "",
      latestUnderstanding.error ? `Latest understanding read failed: ${sanitizeLogValue(latestUnderstanding.error.message)}` : ""
    ].filter(Boolean);
    const latestIngestionRow = (latestIngestion.data ?? [])[0] as LatestRunRow | undefined;
    const latestUnderstandingRow = (latestUnderstanding.data ?? [])[0] as LatestRunRow | undefined;

    return {
      available: true,
      ingestionRunCount: readCount(ingestionRuns),
      latestIngestion: latestRunTimestamp(latestIngestionRow, "finished_at"),
      latestUnderstanding: latestRunTimestamp(latestUnderstandingRow, "ended_at"),
      publicRadarItems: publicItems.rows,
      radarItems: radarItems.rows,
      rawItems: rawItems.rows,
      reportCandidateCount: readCount(reportCandidates),
      sources: sources.rows,
      understandingRunCount: readCount(understandingRuns),
      warnings
    };
  } catch (error) {
    return {
      ...empty,
      warnings: [`Supabase audit read failed: ${sanitizeLogValue(error instanceof Error ? error.message : String(error))}`]
    };
  }
}

async function selectAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string
): Promise<{ rows: T[]; warning: string }> {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) {
      return {
        rows,
        warning: `${table} read failed: ${sanitizeLogValue(error.message)}`
      };
    }

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
  }

  return { rows, warning: "" };
}

async function exactCount(supabase: SupabaseClient, table: string) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) {
    return { table, count: null, warning: `${table} count failed: ${sanitizeLogValue(error.message)}` };
  }

  return { table, count: count ?? 0, warning: "" };
}

function buildLocalStats(chunks: ChunkOutput[]) {
  const stats = new Map<string, SourceStats>();

  for (const rawItem of chunks.flatMap((chunk) => chunk.raw_items)) {
    const current = ensureStats(stats, rawItem.source_id);
    current.rawItemCount += 1;
    current.latestRawItemTimestamp = latestTimestamp([
      current.latestRawItemTimestamp,
      rawItem.published_at ?? null,
      rawItem.collected_at,
      rawItem.retrieved_at
    ]);
  }

  for (const radarItem of chunks.flatMap((chunk) => chunk.radar_items)) {
    const current = ensureStats(stats, radarItem.source_id);
    current.radarItemCount += 1;
    if (radarItem.status === "included" || radarItem.status === "needs_review") {
      current.publicVisibleItemCount += 1;
    }
    current.latestRadarItemTimestamp = latestTimestamp([
      current.latestRadarItemTimestamp,
      radarItem.processed_at,
      radarItem.collected_at,
      radarItem.published_at ?? null
    ]);
  }

  return stats;
}

function buildSupabaseStats(supabase: SupabaseAuditData, sourceIdToSlug: Map<string, string>) {
  const stats = new Map<string, SourceStats>();

  for (const rawItem of supabase.rawItems) {
    const slug = rawItem.source_snapshot?.source_id ?? sourceIdToSlug.get(rawItem.source_id ?? "");
    if (!slug) {
      continue;
    }

    const current = ensureStats(stats, slug);
    current.rawItemCount += 1;
    current.latestRawItemTimestamp = latestTimestamp([
      current.latestRawItemTimestamp,
      rawItem.published_at,
      rawItem.collected_at,
      rawItem.retrieved_at
    ]);
  }

  for (const radarItem of supabase.radarItems) {
    const slug = sourceIdToSlug.get(radarItem.source_id ?? "");
    if (!slug) {
      continue;
    }

    const current = ensureStats(stats, slug);
    current.radarItemCount += 1;
    current.latestRadarItemTimestamp = latestTimestamp([
      current.latestRadarItemTimestamp,
      radarItem.processed_at,
      radarItem.collected_at,
      radarItem.published_at
    ]);
  }

  for (const publicItem of supabase.publicRadarItems) {
    const slug = publicItem.source_id;
    if (!slug) {
      continue;
    }

    const current = ensureStats(stats, slug);
    current.publicVisibleItemCount += 1;
  }

  return stats;
}

function ensureStats(stats: Map<string, SourceStats>, slug: string) {
  const current = stats.get(slug) ?? {
    latestRadarItemTimestamp: null,
    latestRawItemTimestamp: null,
    publicVisibleItemCount: 0,
    radarItemCount: 0,
    rawItemCount: 0
  };
  stats.set(slug, current);
  return current;
}

function buildSourceAuditRow(input: {
  latestSourceResults: Map<string, IngestionSourceSummary>;
  productionStats: Map<string, SourceStats>;
  selectedSourceIds: Set<string>;
  source: CleanedSource;
}): SourceAuditRow {
  const result = input.latestSourceResults.get(input.source.id);
  const stats = input.productionStats.get(input.source.id) ?? ensureStats(new Map(), input.source.id);
  const automatedEligible = isSourceHealthEligible(input.source);
  const selected = input.selectedSourceIds.has(input.source.id);
  const latestErrorWarning = latestErrorOrWarning(result);
  const final = finalSourceStatus(input.source, automatedEligible, selected, result, stats);

  return {
    automated_eligible: automatedEligible,
    crawl_method: input.source.crawl_method,
    fetched: result?.status === "success",
    final_status: final.status,
    latest_error_warning: latestErrorWarning,
    latest_radar_item_timestamp: stats.latestRadarItemTimestamp,
    latest_raw_item_timestamp: stats.latestRawItemTimestamp,
    public_visible_item_count: stats.publicVisibleItemCount,
    radar_item_count: stats.radarItemCount,
    raw_item_count: stats.rawItemCount,
    reason: final.reason,
    selected_in_latest_run: selected,
    source_name: input.source.name,
    source_slug: input.source.id,
    source_status: input.source.status,
    source_tier: input.source.tier,
    source_type_family: sourceFamily(input.source as Parameters<typeof sourceFamily>[0])
  };
}

function finalSourceStatus(
  source: CleanedSource,
  automatedEligible: boolean,
  selected: boolean,
  result: IngestionSourceSummary | undefined,
  stats: SourceStats
): { status: FinalSourceStatus; reason: string } {
  if (!automatedEligible) {
    if (isManualOnlySource(source)) {
      return {
        status: "blocked_requires_manual",
        reason: "Source is configured for manual/future crawl or needs a public URL; it was not automatically crawled."
      };
    }

    return {
      status: "skipped_not_automated",
      reason: "Source status, crawl method, URL, or risk flags make it ineligible for safe automated crawl."
    };
  }

  if (!selected) {
    return {
      status: "skipped_low_priority",
      reason:
        stats.publicVisibleItemCount > 0
          ? "Automated eligible but not selected in the latest activation window; prior public rows exist."
          : "Automated eligible but not selected in the latest activation window."
    };
  }

  if (!result) {
    return {
      status: "needs_review",
      reason: "Source was selected in the checkpoint but no source result was recorded."
    };
  }

  if (result.status === "failed") {
    const status = failedStatus(result);
    return {
      status,
      reason: latestErrorOrWarning(result) ?? `Latest source fetch failed with ${status}.`
    };
  }

  if (result.status === "skipped") {
    return {
      status: "no_new_items",
      reason: latestErrorOrWarning(result) ?? "Source was skipped by the ingestion pipeline."
    };
  }

  if (result.item_count === 0) {
    return {
      status: "no_new_items",
      reason: "Latest fetch succeeded but returned no new items."
    };
  }

  if (stats.rawItemCount > 0 && stats.radarItemCount === 0) {
    return {
      status: "needs_review",
      reason: "Raw items exist but no radar items are persisted for this source."
    };
  }

  if (stats.rawItemCount === 0 && result.item_count > 0) {
    return {
      status: "deduped",
      reason: "Latest fetch returned items, but no persisted raw rows are currently associated with this source."
    };
  }

  return {
    status: "fetched",
    reason:
      stats.publicVisibleItemCount > 0
        ? "Latest fetch succeeded and at least one item is visible through the public radar view."
        : "Latest fetch succeeded; generated items are either excluded, awaiting review, or not visible in the public view."
  };
}

function buildPipelineAudit(input: {
  checkpoint: ActivationCheckpoint | null;
  localStats: Map<string, SourceStats>;
  sourceRows: SourceAuditRow[];
  sources: CleanedSource[];
  sourceIdToSlug: Map<string, string>;
  supabase: SupabaseAuditData;
}): PipelineAudit {
  const latestResults = input.checkpoint?.chunks.flatMap((chunk) => chunk.source_results) ?? [];
  const attempted = new Set(latestResults.map((result) => result.source_id));
  const fetched = new Set(
    latestResults
      .filter((result) => result.status === "success" && result.item_count > 0)
      .map((result) => result.source_id)
  );
  const failedResults = latestResults.filter((result) => result.status === "failed");
  const sourceRowsWithRaw = input.sourceRows.filter((row) => row.raw_item_count > 0).length;
  const sourceRowsWithRadar = input.sourceRows.filter((row) => row.radar_item_count > 0).length;
  const sourceRowsWithPublic = input.sourceRows.filter((row) => row.public_visible_item_count > 0).length;
  const radarRows = input.supabase.available ? input.supabase.radarItems : localRadarRows(input.localStats);
  const rawTotal = input.supabase.available
    ? input.supabase.rawItems.length
    : Array.from(input.localStats.values()).reduce((sum, stats) => sum + stats.rawItemCount, 0);
  const rawWithRadar = input.supabase.available
    ? new Set(input.supabase.radarItems.map((item) => item.raw_item_id).filter(Boolean)).size
    : Math.min(rawTotal, radarRows.length);
  const statusCounts = radarRows.reduce<Record<UnderstandingStatus, number>>(
    (counts, row) => {
      counts[normalizeStatus(row.understanding_status)] += 1;
      return counts;
    },
    { excluded: 0, failed: 0, included: 0, needs_review: 0 }
  );
  const publicTotal = input.supabase.available
    ? input.supabase.publicRadarItems.length
    : input.sourceRows.reduce((sum, row) => sum + row.public_visible_item_count, 0);
  const automatedEligible = input.sources.filter(isSourceHealthEligible).length;

  return {
    automated_eligible_sources: automatedEligible,
    conversion_rates: {
      public_visible_sources_over_total_configured_sources: rate(sourceRowsWithPublic, input.sources.length),
      radar_to_public_visibility: rate(publicTotal, radarRows.length),
      raw_to_radar_conversion: rate(rawWithRadar, rawTotal),
      source_to_raw_coverage: rate(sourceRowsWithRaw, automatedEligible)
    },
    excluded_reasons_distribution: excludedReasonsDistribution(radarRows),
    failure_family_distribution: failureFamilyDistribution(latestResults, radarRows),
    failed_source_reason_distribution: countBy(failedResults.map((result) => failedStatus(result))),
    latest_ingestion_timestamp: input.supabase.latestIngestion,
    latest_understanding_timestamp: input.supabase.latestUnderstanding,
    public_radar_items_total: publicTotal,
    radar_items_excluded: statusCounts.excluded,
    radar_items_failed: statusCounts.failed,
    radar_items_included: statusCounts.included,
    radar_items_needs_review: statusCounts.needs_review,
    radar_items_total: radarRows.length,
    raw_items_total: rawTotal,
    raw_items_with_radar_items: rawWithRadar,
    report_candidates_total: input.supabase.reportCandidateCount,
    sources_attempted_latest_run: attempted.size,
    sources_blocked_manual: input.sources.filter(isManualOnlySource).length,
    sources_failed_latest_run: failedResults.length,
    sources_fetched_latest_run: fetched.size,
    sources_skipped_latest_run: latestResults.filter((result) => result.status === "skipped").length,
    sources_total: input.sources.length,
    sources_with_at_least_one_public_radar_item: sourceRowsWithPublic,
    sources_with_at_least_one_radar_item: sourceRowsWithRadar,
    sources_with_at_least_one_raw_item: sourceRowsWithRaw
  };
}

function buildPersistenceAudit(input: {
  checkpoint: ActivationCheckpoint | null;
  chunks: ChunkOutput[];
  supabase: SupabaseAuditData;
}) {
  const completedChunks = input.checkpoint?.chunks.filter((chunk) => chunk.status === "completed") ?? [];
  const persistedChunks = completedChunks.filter((chunk) => chunk.persisted);
  const persistFailedChunks = input.checkpoint?.chunks.filter((chunk) => chunk.status === "persist_failed") ?? [];
  const persistedCounts = completedChunks.reduce<Record<string, number>>((counts, chunk) => {
    for (const [key, value] of Object.entries(chunk.persist_counts ?? {})) {
      counts[key] = (counts[key] ?? 0) + value;
    }
    return counts;
  }, {});
  const localRawIds = new Set(input.chunks.flatMap((chunk) => chunk.raw_items.map((item) => item.id)));
  const localRadarIds = new Set(input.chunks.flatMap((chunk) => chunk.radar_items.map((item) => item.id)));
  const supabaseRawIds = new Set(input.supabase.rawItems.map((item) => item.local_id).filter(isString));
  const supabaseRadarIds = new Set(input.supabase.radarItems.map((item) => item.local_id).filter(isString));
  const missingRaw = input.supabase.available ? setDifferenceCount(localRawIds, supabaseRawIds) : 0;
  const missingRadar = input.supabase.available ? setDifferenceCount(localRadarIds, supabaseRadarIds) : 0;
  const unpersisted = completedChunks.length > persistedChunks.length || persistFailedChunks.length > 0 || missingRaw > 0 || missingRadar > 0;

  return {
    completed_chunks: completedChunks.length,
    duplicate_upsert_behavior:
      "Activation persistence upserts sources by slug, ingestion/understanding runs by local_run_id, raw_items/radar_items by local_id, scores by local_score_key, and item_entities by radar_item_id/entity_id/relationship.",
    missing_radar_item_ids_in_supabase: missingRadar,
    missing_raw_item_ids_in_supabase: missingRaw,
    persist_failed_chunks: persistFailedChunks.length,
    persisted_chunks: persistedChunks.length,
    persisted_counts_from_latest_checkpoint: persistedCounts,
    unpersisted_chunks_found: unpersisted
  };
}

function buildPublicVisibilityAudit(input: {
  sourceRowsBySlug: Map<string, SupabaseSourceRow>;
  supabase: SupabaseAuditData;
}) {
  if (!input.supabase.available) {
    return {
      gap_reason_distribution: {},
      public_view_gap_count: 0,
      public_view_gap_fixed: false,
      valid_included_or_needs_review_missing_public_view_count: 0
    };
  }

  const publicIds = new Set(input.supabase.publicRadarItems.map((item) => item.local_id ?? item.id));
  const gaps = input.supabase.radarItems
    .filter((item) => !publicIds.has(item.local_id ?? item.id))
    .map((item) => publicGapReason(item, input.sourceRowsBySlug));
  const validMissing = gaps.filter((reason) => reason === "missing_public_view_unknown").length;

  return {
    gap_reason_distribution: countBy(gaps),
    public_view_gap_count: gaps.length,
    public_view_gap_fixed: false,
    valid_included_or_needs_review_missing_public_view_count: validMissing
  };
}

function publicGapReason(row: SupabaseRadarRow, sourceRowsBySlug: Map<string, SupabaseSourceRow>) {
  const status = normalizeStatus(row.understanding_status ?? row.status);
  if (status !== "included" && status !== "needs_review") {
    return row.exclusion_reason ? `excluded:${sanitizeReasonKey(row.exclusion_reason)}` : "status_not_public";
  }

  if (!row.title || !row.url) {
    return "missing_title_or_url";
  }

  if (!isPublicHttpUrl(row.url)) {
    return "invalid_public_url";
  }

  if (!row.collected_at || !row.processed_at) {
    return "missing_public_timestamp";
  }

  const source = Array.from(sourceRowsBySlug.values()).find((candidate) => candidate.id === row.source_id);
  if (source?.status && ["rejected", "needs_public_url", "deferred"].includes(source.status)) {
    return `source_status:${source.status}`;
  }

  if (source?.risk_flags?.some((flag) => ["needs_public_url", "private_url_removed", "image_only_contact_removed"].includes(flag))) {
    return "source_risk_flags";
  }

  return "missing_public_view_unknown";
}

function githubRateLimitStatus(checkpoint: ActivationCheckpoint | null) {
  const rateLimits = (checkpoint?.chunks ?? [])
    .flatMap((chunk) => chunk.source_results)
    .map((result) => result.metadata?.github_rate_limit as Record<string, unknown> | undefined)
    .filter((value): value is Record<string, unknown> => Boolean(value));
  const remaining = rateLimits
    .map((limit) => Number(limit.remaining))
    .filter((value) => Number.isFinite(value));
  const resetTimes = rateLimits.map((limit) => text(limit.reset_at)).filter(Boolean);
  const tokenPresentValues = (checkpoint?.chunks ?? [])
    .flatMap((chunk) => chunk.source_results)
    .map((result) => result.metadata?.github_token_present)
    .filter((value): value is boolean => typeof value === "boolean");

  return {
    latest_reset_at: latestTimestamp(resetTimes),
    min_remaining: remaining.length > 0 ? Math.min(...remaining) : null,
    sources_observed: rateLimits.length,
    token_present: tokenPresentValues.length > 0 ? tokenPresentValues.some(Boolean) : null
  };
}

function latestSourceResultsBySlug(results: IngestionSourceSummary[]) {
  const bySlug = new Map<string, IngestionSourceSummary>();
  for (const result of results) {
    bySlug.set(result.source_id, result);
  }
  return bySlug;
}

function latestErrorOrWarning(result: IngestionSourceSummary | undefined) {
  if (!result) {
    return null;
  }

  return sanitizeLogValue(result.error_message ?? result.warnings[0] ?? "");
}

function failedStatus(result: IngestionSourceSummary): FinalSourceStatus {
  const haystack = [
    result.error_message ?? "",
    ...(result.warnings ?? []),
    JSON.stringify(result.metadata ?? {})
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("rate limit")) {
    return "failed_rate_limit";
  }

  if (haystack.includes("403") || haystack.includes("forbidden")) {
    return "failed_403";
  }

  if (haystack.includes("timeout") || haystack.includes("aborted") || haystack.includes("fetch failed")) {
    return "failed_timeout";
  }

  if (haystack.includes("parse") || haystack.includes("invalid json") || haystack.includes("invalid xml")) {
    return "failed_parse";
  }

  return "needs_review";
}

function failureFamilyDistribution(
  sourceResults: IngestionSourceSummary[],
  radarRows: Array<{ exclusion_reason?: string | null; understanding_status?: string | null }>
) {
  const counts: FailureFamilyCounts = {};

  for (const result of sourceResults) {
    const family = categorizeFailureFamily({
      crawlMethod: result.crawl_method,
      errorMessage: result.error_message,
      itemCount: result.item_count,
      metadata: result.metadata,
      status: result.status,
      warnings: result.warnings
    });
    incrementFailureFamily(counts, family);
  }

  for (const row of radarRows) {
    const status = normalizeStatus(row.understanding_status);
    if (status !== "excluded" && status !== "failed") {
      continue;
    }
    const family = categorizeFailureFamily({
      exclusionReason: row.exclusion_reason,
      status
    });
    incrementFailureFamily(counts, family);
  }

  return compactFailureFamilyCounts(counts);
}

function excludedReasonsDistribution(rows: Array<{ exclusion_reason?: string | null; understanding_status?: string | null }>) {
  return countBy(
    rows
      .filter((row) => {
        const status = normalizeStatus(row.understanding_status);
        return status === "excluded" || status === "failed";
      })
      .map((row) => sanitizeReasonKey(row.exclusion_reason ?? "status_excluded"))
  );
}

function localRadarRows(stats: Map<string, SourceStats>): SupabaseRadarRow[] {
  return Array.from(stats.entries()).flatMap(([sourceId, value]) =>
    Array.from({ length: value.radarItemCount }, (_, index) => ({
      collected_at: value.latestRadarItemTimestamp,
      exclusion_reason: null,
      id: `${sourceId}:${index}`,
      local_id: `${sourceId}:${index}`,
      processed_at: value.latestRadarItemTimestamp,
      published_at: null,
      raw_item_id: null,
      source_id: sourceId,
      source_name: sourceId,
      status: "reviewed",
      summary_en: null,
      summary_zh: null,
      title: sourceId,
      understanding_status: "included",
      url: "https://example.com"
    }))
  );
}

function isManualOnlySource(source: CleanedSource) {
  return (
    source.crawl_method === "manual" ||
    source.crawl_method === "x_api_future" ||
    source.crawl_method === "no_crawl" ||
    source.status === "needs_public_url" ||
    source.risk_flags.includes("needs_public_url")
  );
}

function normalizeStatus(value: string | null | undefined): UnderstandingStatus {
  if (value === "included" || value === "needs_review" || value === "excluded" || value === "failed") {
    return value;
  }

  return "needs_review";
}

function latestRunTimestamp(row: LatestRunRow | undefined, endField: "ended_at" | "finished_at") {
  return text(row?.[endField]) || text(row?.started_at) || null;
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = value || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function countWarning(value: { warning?: string }) {
  return value.warning ?? "";
}

function readCount(value: { count: number | null }) {
  return value.count ?? null;
}

function setDifferenceCount(left: Set<string>, right: Set<string>) {
  let missing = 0;
  for (const value of left) {
    if (!right.has(value)) {
      missing += 1;
    }
  }
  return missing;
}

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return "n/a";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function latestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function isString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function renderMarkdown(report: DataCompletenessReport) {
  return [
    "# Data Completeness Release Candidate",
    "",
    `Generated: ${report.generated_at}`,
    "",
    "## Gate Summary",
    "",
    `- Sources total: ${report.pipeline.sources_total}`,
    `- Automated eligible sources: ${report.pipeline.automated_eligible_sources}`,
    `- Attempted sources in latest run: ${report.pipeline.sources_attempted_latest_run}`,
    `- Fetched sources in latest run: ${report.pipeline.sources_fetched_latest_run}`,
    `- Skipped sources in latest run: ${report.pipeline.sources_skipped_latest_run}`,
    `- Failed sources in latest run: ${report.pipeline.sources_failed_latest_run}`,
    `- Blocked/manual sources: ${report.pipeline.sources_blocked_manual}`,
    `- Sources with public visible items: ${report.pipeline.sources_with_at_least_one_public_radar_item}`,
    `- Raw items: ${report.pipeline.raw_items_total}`,
    `- Radar items: ${report.pipeline.radar_items_total}`,
    `- Public radar items: ${report.pipeline.public_radar_items_total}`,
    "",
    "## Conversion Rates",
    "",
    `- Source to raw coverage: ${report.pipeline.conversion_rates.source_to_raw_coverage}`,
    `- Raw to radar conversion: ${report.pipeline.conversion_rates.raw_to_radar_conversion}`,
    `- Radar to public visibility: ${report.pipeline.conversion_rates.radar_to_public_visibility}`,
    `- Public visible sources / total configured sources: ${report.pipeline.conversion_rates.public_visible_sources_over_total_configured_sources}`,
    "",
    "## Pipeline Counts",
    "",
    `- Sources with at least one raw item: ${report.pipeline.sources_with_at_least_one_raw_item}`,
    `- Sources with at least one radar item: ${report.pipeline.sources_with_at_least_one_radar_item}`,
    `- Sources with at least one public radar item: ${report.pipeline.sources_with_at_least_one_public_radar_item}`,
    `- Raw items with radar items: ${report.pipeline.raw_items_with_radar_items}`,
    `- Included / needs_review / excluded / failed radar items: ${report.pipeline.radar_items_included} / ${report.pipeline.radar_items_needs_review} / ${report.pipeline.radar_items_excluded} / ${report.pipeline.radar_items_failed}`,
    `- Report candidates: ${report.pipeline.report_candidates_total ?? "unavailable"}`,
    `- Latest ingestion timestamp: ${report.pipeline.latest_ingestion_timestamp ?? "unavailable"}`,
    `- Latest understanding timestamp: ${report.pipeline.latest_understanding_timestamp ?? "unavailable"}`,
    "",
    "## Persistence Audit",
    "",
    `- Unpersisted chunks found: ${yesNo(report.persistence.unpersisted_chunks_found)}`,
    `- Completed chunks: ${report.persistence.completed_chunks}`,
    `- Persisted chunks: ${report.persistence.persisted_chunks}`,
    `- Persist-failed chunks: ${report.persistence.persist_failed_chunks}`,
    `- Missing latest raw item ids in Supabase: ${report.persistence.missing_raw_item_ids_in_supabase}`,
    `- Missing latest radar item ids in Supabase: ${report.persistence.missing_radar_item_ids_in_supabase}`,
    `- Duplicate/upsert behavior: ${report.persistence.duplicate_upsert_behavior}`,
    "",
    "## Public Visibility Audit",
    "",
    `- Public view gaps: ${report.public_visibility.public_view_gap_count}`,
    `- Valid included/needs_review rows missing public view: ${report.public_visibility.valid_included_or_needs_review_missing_public_view_count}`,
    `- Public view gaps fixed in this audit: ${yesNo(report.public_visibility.public_view_gap_fixed)}`,
    "",
    "### Public Gap Reasons",
    "",
    renderDistribution(report.public_visibility.gap_reason_distribution),
    "",
    "### Excluded Reasons",
    "",
    renderDistribution(report.pipeline.excluded_reasons_distribution),
    "",
    "### Failed Source Reasons",
    "",
    renderDistribution(report.pipeline.failed_source_reason_distribution),
    "",
    "### Failure Families",
    "",
    renderDistribution(report.pipeline.failure_family_distribution),
    "",
    "## GitHub Rate Limit",
    "",
    `- GitHub token present: ${report.github_rate_limit.token_present === null ? "unknown" : yesNo(report.github_rate_limit.token_present)}`,
    `- Minimum remaining observed: ${report.github_rate_limit.min_remaining ?? "unavailable"}`,
    `- Latest reset at: ${report.github_rate_limit.latest_reset_at ?? "unavailable"}`,
    `- Sources observed: ${report.github_rate_limit.sources_observed}`,
    "",
    "## Safety",
    "",
    `- Supabase writes run by audit script: ${yesNo(report.safety.supabase_writes_run)}`,
    `- Scheduled jobs run: ${yesNo(report.safety.scheduled_jobs_run)}`,
    `- X/WeChat auto crawl run: ${yesNo(report.safety.x_wechat_auto_crawl_run)}`,
    `- Secrets printed: ${yesNo(report.safety.secrets_printed)}`,
    `- .env.local committed: ${yesNo(report.safety.env_local_committed)}`,
    "",
    "## Source Completeness Rows",
    "",
    "| source slug | source name | source type/family | tier | source status | crawl method | automated eligible | selected latest | fetched | raw item count | radar item count | public visible item count | latest raw item timestamp | latest radar item timestamp | latest error/warning | final status | reason |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |",
    ...report.source_rows.map(renderSourceRow),
    "",
    "## Warnings",
    "",
    report.warnings.length > 0 ? report.warnings.map((warning) => `- ${escapeMarkdown(warning)}`).join("\n") : "- None.",
    ""
  ].join("\n");
}

function renderDistribution(distribution: Record<string, number>) {
  const entries = Object.entries(distribution).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (entries.length === 0) {
    return "- None.";
  }

  return entries.map(([reason, count]) => `- ${escapeMarkdown(reason)}: ${count}`).join("\n");
}

function renderSourceRow(row: SourceAuditRow) {
  return [
    row.source_slug,
    row.source_name,
    row.source_type_family,
    row.source_tier,
    row.source_status,
    row.crawl_method,
    yesNo(row.automated_eligible),
    yesNo(row.selected_in_latest_run),
    yesNo(row.fetched),
    String(row.raw_item_count),
    String(row.radar_item_count),
    String(row.public_visible_item_count),
    row.latest_raw_item_timestamp ?? "",
    row.latest_radar_item_timestamp ?? "",
    row.latest_error_warning ?? "",
    row.final_status,
    row.reason
  ]
    .map(escapeMarkdown)
    .join(" | ")
    .replace(/^/, "| ")
    .replace(/$/, " |");
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeReasonKey(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "url")
    .replace(/[^a-z0-9:_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function sanitizeLogValue(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/g, "[github-token-redacted]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/gi, "[github-token-redacted]")
    .replace(/\b(DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|X_BEARER_TOKEN|WECHAT_APP_SECRET)\s*=\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 500);
}

function escapeMarkdown(value: string) {
  return sanitizeLogValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

main().catch((error) => {
  console.error(sanitizeLogValue(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
