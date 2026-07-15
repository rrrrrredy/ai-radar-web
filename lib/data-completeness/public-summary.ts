import { readCleanedSources, sourceFamily } from "@/lib/ingestion/select-sources";
import {
  categorizeFailureFamily,
  compactFailureFamilyCounts,
  incrementFailureFamily,
  type FailureFamilyCounts
} from "@/lib/ops/failure-families";
import { isSourceHealthEligible } from "@/lib/ingestion/source-health";
import { getSupabaseServiceClient, getSupabaseServiceStatus } from "@/lib/supabase/service";
import type {
  PublicDataCompletenessSummary,
  PublicSourceFamilyHealth,
  PublicSourceHealthCounts
} from "@/lib/data-completeness/types";
import type { UnderstandingStatus } from "@/lib/understanding/types";

export type { PublicCoverageRates, PublicDataCompletenessSummary } from "@/lib/data-completeness/types";

type CountResult = number | { error: string };

type SourceRow = {
  id: string;
  slug: string | null;
};

type RawItemRow = {
  source_id: string | null;
  source_snapshot?: {
    source_id?: string | null;
  } | null;
};

type RadarItemRow = {
  exclusion_reason?: string | null;
  raw_item_id: string | null;
  source_id: string | null;
  understanding_status: string | null;
};

type PublicRadarItemRow = {
  source_id: string | null;
};

type IngestionRunRow = {
  local_run_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  metadata?: {
    source_results?: Array<{
      source_id?: string | null;
      status?: string | null;
      item_count?: number | null;
      error_message?: string | null;
      warnings?: string[] | null;
      metadata?: Record<string, unknown> | null;
    }>;
  } | null;
};

type UnderstandingRunRow = {
  started_at?: string | null;
  ended_at?: string | null;
};

const emptyStatusCounts: Record<UnderstandingStatus, number> = {
  excluded: 0,
  failed: 0,
  included: 0,
  needs_review: 0
};

export async function loadPublicDataCompletenessSummary(): Promise<PublicDataCompletenessSummary> {
  const sources = readCleanedSources();
  const automatedEligibleSources = sources.filter(isSourceHealthEligible).length;
  const blockedManualSources = sources.filter(isManualOnlySource).length;
  const base = emptySummary({
    automatedEligibleSources,
    blockedManualSources,
    generatedAt: new Date().toISOString(),
    sourceFamilyHealth: baseSourceFamilyHealth(sources),
    sourcesTotal: sources.length
  });

  const serviceStatus = getSupabaseServiceStatus();
  if (!serviceStatus.publicConfigConfigured || !serviceStatus.serviceRoleConfigured) {
    return {
      ...base,
      warnings: [
        "Supabase service count access is unavailable; coverage summary is limited to configured source counts."
      ]
    };
  }

  try {
    const supabase = getSupabaseServiceClient();
    const [sourceRows, rawRows, radarRows, publicRows, reportCandidates, ingestionRuns, latestUnderstanding] =
      await Promise.all([
        selectAll<SourceRow>("sources", "id, slug"),
        selectAll<RawItemRow>("raw_items", "source_id, source_snapshot"),
        selectAll<RadarItemRow>("radar_items", "raw_item_id, source_id, understanding_status, exclusion_reason"),
        selectAll<PublicRadarItemRow>("public_radar_items", "source_id"),
        exactCount("report_candidates"),
        supabase
          .from("ingestion_runs")
          .select("local_run_id, started_at, finished_at, metadata")
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(120),
        supabase
          .from("understanding_runs")
          .select("started_at, ended_at")
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(1)
      ]);

    const warnings = [
      sourceRows.warning,
      rawRows.warning,
      radarRows.warning,
      publicRows.warning,
      typeof reportCandidates === "object" ? reportCandidates.error : "",
      ingestionRuns.error ? `Latest ingestion run read failed: ${sanitizeReason(ingestionRuns.error.message)}` : "",
      latestUnderstanding.error
        ? `Latest understanding run read failed: ${sanitizeReason(latestUnderstanding.error.message)}`
        : ""
    ].filter(Boolean);
    const sourceIdToSlug = new Map(sourceRows.rows.map((row) => [row.id, row.slug ?? row.id]));
    const rawSourceSlugs = new Set(rawRows.rows.map((row) => rawSourceSlug(row, sourceIdToSlug)).filter(Boolean));
    const radarSourceSlugs = new Set(radarRows.rows.map((row) => sourceIdToSlug.get(row.source_id ?? "")).filter(Boolean));
    const publicSourceSlugs = new Set(publicRows.rows.map((row) => row.source_id).filter(Boolean));
    const radarRawIds = new Set(radarRows.rows.map((row) => row.raw_item_id).filter(Boolean));
    const statusCounts = radarRows.rows.reduce<Record<UnderstandingStatus, number>>((counts, row) => {
      const status = normalizeStatus(row.understanding_status);
      counts[status] += 1;
      return counts;
    }, { ...emptyStatusCounts });
    const latestIngestionRows = selectLatestIngestionRunRows((ingestionRuns.data ?? []) as IngestionRunRow[]);
    const sourceHealthRows = selectSourceHealthRunRows(
      (ingestionRuns.data ?? []) as IngestionRunRow[],
      automatedEligibleSources
    );
    const latestUnderstandingRow = (latestUnderstanding.data ?? [])[0] as UnderstandingRunRow | undefined;
    const sourceResults = latestIngestionRows.flatMap((row) => row.metadata?.source_results ?? []);
    const attemptedSources = new Set(sourceResults.map((result) => result.source_id).filter(isNonEmptyString));
    const fetchedSources = new Set(
      sourceResults
        .filter((result) => result.status === "success" && Number(result.item_count ?? 0) > 0)
        .map((result) => result.source_id)
        .filter(isNonEmptyString)
    );
    const skippedSources = sourceResults.filter((result) => result.status === "skipped").length;
    const failedResults = sourceResults.filter((result) => result.status === "failed");
    const sourceBySlug = new Map(sources.map((source) => [source.id, source]));
    const failedSourceDetails = uniqueSourceResults(sourceHealthRows)
      .filter((result) => result.status === "failed")
      .map((result) => {
        const slug = text(result.source_id);
        const source = sourceBySlug.get(slug);
        return {
          reason: categorizeFailureFamily({
            errorMessage: result.error_message,
            itemCount: result.item_count,
            metadata: result.metadata,
            status: result.status,
            warnings: result.warnings
          }) ?? "failed",
          source_family: source ? sourceFamily(source) : "other",
          source_name: source?.name ?? slug,
          source_slug: slug
        };
      })
      .sort((left, right) => left.source_family.localeCompare(right.source_family) || left.source_name.localeCompare(right.source_name));
    const failedSourceReasons = countReasons(failedResults.map((result) => sourceFailureReason(result)));
    const skippedSourceReasons = countReasons(
      sourceResults.filter((result) => result.status === "skipped").map((result) => sourceSkipReason(result))
    );
    const failureFamilies = buildFailureFamilies(sourceResults, radarRows.rows);
    const sourceFamilyHealth = buildSourceFamilyHealth({
      radarRows: radarRows.rows,
      runRows: sourceHealthRows,
      sourceIdToSlug,
      sources
    });
    const latestIngestionTimestamp = latestTimestamp(
      latestIngestionRows.map((row) => latestRunTimestamp(row, "finished_at"))
    );
    const latestUnderstandingTimestamp = latestRunTimestamp(latestUnderstandingRow, "ended_at");

    return {
      ...base,
      attemptedSources: attemptedSources.size,
      failedSourceReasons,
      failedSourceDetails,
      failedSources: failedResults.length,
      fetchedSources: fetchedSources.size,
      included: statusCounts.included,
      latestIngestion: latestIngestionTimestamp,
      latestRefresh: latestTimestamp([latestUnderstandingTimestamp, latestIngestionTimestamp]),
      latestUnderstanding: latestUnderstandingTimestamp,
      needsReview: statusCounts.needs_review,
      excluded: statusCounts.excluded,
      failureFamilies,
      sourceFamilyHealth,
      sourceHealthScope: sourceHealthScope(sourceHealthRows),
      failedRadarItems: statusCounts.failed,
      publicRadarItems: publicRows.rows.length,
      radarItems: radarRows.rows.length,
      rawItems: rawRows.rows.length,
      rawItemsWithRadarItems: radarRawIds.size,
      reportCandidates: typeof reportCandidates === "number" ? reportCandidates : null,
      skippedSourceReasons,
      skippedSources,
      sourcesWithPublicItems: publicSourceSlugs.size,
      sourcesWithRadarItems: radarSourceSlugs.size,
      sourcesWithRawItems: rawSourceSlugs.size,
      rates: {
        sourceRawCoverage: ratio(rawSourceSlugs.size, automatedEligibleSources),
        rawRadarConversion: ratio(radarRawIds.size, rawRows.rows.length),
        radarPublicVisibility: ratio(publicRows.rows.length, radarRows.rows.length),
        sourcePublicVisibility: ratio(publicSourceSlugs.size, sources.length)
      },
      warnings
    };
  } catch (error) {
    return {
      ...base,
      warnings: [`Coverage summary read failed: ${sanitizeReason(error instanceof Error ? error.message : String(error))}`]
    };
  }
}

function emptySummary(input: {
  automatedEligibleSources: number;
  blockedManualSources: number;
  generatedAt: string;
  sourceFamilyHealth: PublicSourceFamilyHealth[];
  sourcesTotal: number;
}): PublicDataCompletenessSummary {
  return {
    ...input,
    attemptedSources: 0,
    excluded: null,
    failureFamilies: {},
    failedRadarItems: null,
    failedSourceReasons: {},
    failedSourceDetails: [],
    failedSources: 0,
    fetchedSources: 0,
    included: null,
    latestIngestion: null,
    latestRefresh: null,
    latestUnderstanding: null,
    needsReview: null,
    publicRadarItems: null,
    radarItems: null,
    rawItems: null,
    rawItemsWithRadarItems: null,
    reportCandidates: null,
    skippedSourceReasons: {},
    skippedSources: 0,
    sourceFamilyHealth: input.sourceFamilyHealth,
    sourceHealthScope: {
      attempted_sources: 0,
      finished_at: null,
      run_id: null,
      started_at: null
    },
    sourcesWithPublicItems: null,
    sourcesWithRadarItems: null,
    sourcesWithRawItems: null,
    rates: {
      radarPublicVisibility: null,
      rawRadarConversion: null,
      sourcePublicVisibility: null,
      sourceRawCoverage: null
    },
    warnings: []
  };
}

async function selectAll<T>(table: string, columns: string): Promise<{ rows: T[]; warning: string }> {
  const supabase = getSupabaseServiceClient();
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select(columns).range(from, to);
    if (error) {
      return {
        rows,
        warning: `${table} read failed: ${sanitizeReason(error.message)}`
      };
    }

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
  }

  return {
    rows,
    warning: ""
  };
}

async function exactCount(table: string): Promise<CountResult> {
  const supabase = getSupabaseServiceClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });

  if (error) {
    return {
      error: `${table} count failed: ${sanitizeReason(error.message)}`
    };
  }

  return count ?? 0;
}

function rawSourceSlug(row: RawItemRow, sourceIdToSlug: Map<string, string>) {
  return row.source_snapshot?.source_id ?? sourceIdToSlug.get(row.source_id ?? "") ?? null;
}

function normalizeStatus(value: string | null | undefined): UnderstandingStatus {
  if (value === "included" || value === "needs_review" || value === "excluded" || value === "failed") {
    return value;
  }

  return "needs_review";
}

function sourceFailureReason(result: {
  error_message?: string | null;
  warnings?: string[] | null;
  metadata?: Record<string, unknown> | null;
}) {
  return categorizeReason({
    errorMessage: result.error_message,
    metadata: result.metadata,
    status: "failed",
    warnings: result.warnings
  });
}

function sourceSkipReason(result: { error_message?: string | null; warnings?: string[] | null; metadata?: Record<string, unknown> | null }) {
  return categorizeReason({
    errorMessage: result.error_message,
    metadata: result.metadata,
    status: "skipped",
    warnings: result.warnings
  }) || "no_items";
}

function countReasons(reasons: string[]) {
  return reasons.reduce<Record<string, number>>((counts, reason) => {
    const key = reason || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function selectLatestIngestionRunRows(rows: IngestionRunRow[]) {
  const latestActivationBase = rows.map((row) => activationRunBase(row.local_run_id)).find(isNonEmptyString);

  if (latestActivationBase) {
    return rows.filter((row) => activationRunBase(row.local_run_id) === latestActivationBase);
  }

  return rows[0] ? [rows[0]] : [];
}

function selectSourceHealthRunRows(rows: IngestionRunRow[], automatedEligibleSources: number) {
  const grouped = new Map<string, IngestionRunRow[]>();

  for (const row of rows) {
    const key = activationRunBase(row.local_run_id) ?? text(row.local_run_id);
    if (!key) {
      continue;
    }
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const minimumBroadAttempt = Math.max(1, Math.min(30, Math.ceil(automatedEligibleSources * 0.5)));
  const groups = [...grouped.values()];
  return groups.find((group) => uniqueSourceResults(group).length >= minimumBroadAttempt) ?? groups[0] ?? [];
}

function uniqueSourceResults(rows: IngestionRunRow[]) {
  const bySource = new Map<string, NonNullable<NonNullable<IngestionRunRow["metadata"]>["source_results"]>[number]>();

  for (const result of rows.flatMap((row) => row.metadata?.source_results ?? [])) {
    const sourceId = text(result.source_id);
    if (sourceId) {
      bySource.set(sourceId, result);
    }
  }

  return [...bySource.values()];
}

function baseSourceFamilyHealth(sources: ReturnType<typeof readCleanedSources>) {
  const rows = new Map<string, PublicSourceFamilyHealth>();

  for (const source of sources) {
    const family = sourceFamily(source);
    const row = ensureSourceFamilyHealth(rows, family);
    row.configured += 1;
    if (isSourceHealthEligible(source)) {
      row.automated_eligible += 1;
    } else if (isManualOnlySource(source)) {
      row.manual_blocked += 1;
    } else {
      row.unsupported_source += 1;
    }
  }

  return sortedSourceFamilyHealth(rows);
}

function buildSourceFamilyHealth(input: {
  radarRows: RadarItemRow[];
  runRows: IngestionRunRow[];
  sourceIdToSlug: Map<string, string>;
  sources: ReturnType<typeof readCleanedSources>;
}) {
  const rows = new Map(baseSourceFamilyHealth(input.sources).map((row) => [row.family, { ...row }]));
  const sourceBySlug = new Map(input.sources.map((source) => [source.id, source]));

  for (const result of uniqueSourceResults(input.runRows)) {
    const sourceId = text(result.source_id);
    const source = sourceBySlug.get(sourceId);
    const family = source ? sourceFamily(source) : "other";
    const row = ensureSourceFamilyHealth(rows, family);
    const status = text(result.status);
    const itemCount = Number(result.item_count ?? 0);
    row.attempted += 1;

    if (status === "success") {
      if (itemCount > 0) {
        row.succeeded += 1;
      } else {
        row.no_items += 1;
      }
    } else if (status === "failed") {
      row.failed += 1;
    } else if (status === "skipped") {
      row.skipped += 1;
    }

    const failureFamily = categorizeFailureFamily({
      errorMessage: result.error_message,
      itemCount: result.item_count,
      metadata: result.metadata,
      status: result.status,
      warnings: result.warnings
    });
    incrementSourceHealthFamily(row, failureFamily);
  }

  for (const radarRow of input.radarRows) {
    if (normalizeStatus(radarRow.understanding_status) !== "excluded") {
      continue;
    }

    const failureFamily = categorizeFailureFamily({
      exclusionReason: radarRow.exclusion_reason,
      status: "excluded"
    });
    if (failureFamily !== "low_relevance_excluded") {
      continue;
    }

    const slug = input.sourceIdToSlug.get(radarRow.source_id ?? "") ?? "";
    const source = sourceBySlug.get(slug);
    const family = source ? sourceFamily(source) : "other";
    ensureSourceFamilyHealth(rows, family).low_relevance_excluded += 1;
  }

  return sortedSourceFamilyHealth(rows);
}

function ensureSourceFamilyHealth(rows: Map<string, PublicSourceFamilyHealth>, family: string) {
  const existing = rows.get(family);
  if (existing) {
    return existing;
  }

  const created: PublicSourceFamilyHealth = {
    family,
    configured: 0,
    automated_eligible: 0,
    attempted: 0,
    skipped: 0,
    ...emptySourceHealthCounts()
  };
  rows.set(family, created);
  return created;
}

function emptySourceHealthCounts(): PublicSourceHealthCounts {
  return {
    "403": 0,
    duplicate_only: 0,
    failed: 0,
    low_relevance_excluded: 0,
    manual_blocked: 0,
    no_items: 0,
    rate_limit: 0,
    succeeded: 0,
    timeout: 0,
    unsupported_source: 0
  };
}

function incrementSourceHealthFamily(row: PublicSourceHealthCounts, family: string | null) {
  switch (family) {
    case "timeout":
      row.timeout += 1;
      break;
    case "failed_403":
    case "403":
      row["403"] += 1;
      break;
    case "rate_limit":
      row.rate_limit += 1;
      break;
    case "duplicate_only":
      row.duplicate_only += 1;
      break;
    case "manual_blocked":
      row.manual_blocked += 1;
      break;
    case "unsupported_source":
      row.unsupported_source += 1;
      break;
    case "no_items":
    case "no_new_items":
      row.no_items += 1;
      break;
  }
}

function sortedSourceFamilyHealth(rows: Map<string, PublicSourceFamilyHealth>) {
  return [...rows.values()].sort(
    (left, right) => right.attempted - left.attempted || right.configured - left.configured || left.family.localeCompare(right.family)
  );
}

function sourceHealthScope(rows: IngestionRunRow[]) {
  const runId = rows.map((row) => activationRunBase(row.local_run_id) ?? text(row.local_run_id)).find(Boolean) ?? null;
  const timestamps = rows.flatMap((row) => [text(row.started_at), text(row.finished_at)]).filter(Boolean);
  const sorted = timestamps.filter((value) => Number.isFinite(Date.parse(value))).sort((left, right) => Date.parse(left) - Date.parse(right));

  return {
    attempted_sources: uniqueSourceResults(rows).length,
    finished_at: sorted.at(-1) ?? null,
    run_id: runId,
    started_at: sorted[0] ?? null
  };
}

function activationRunBase(localRunId: string | null | undefined) {
  const match = text(localRunId).match(/^(activation_.+)_chunk_\d+$/);
  return match?.[1] ?? null;
}

function categorizeReason(input: Parameters<typeof categorizeFailureFamily>[0]) {
  return categorizeFailureFamily(input) ?? "no_items";
}

function buildFailureFamilies(
  sourceResults: NonNullable<NonNullable<IngestionRunRow["metadata"]>["source_results"]> = [],
  radarRows: RadarItemRow[] = []
) {
  const counts: FailureFamilyCounts = {};

  for (const result of sourceResults ?? []) {
    const family = categorizeFailureFamily({
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

    incrementFailureFamily(
      counts,
      categorizeFailureFamily({
        exclusionReason: row.exclusion_reason,
        status
      })
    );
  }

  return compactFailureFamilyCounts(counts);
}

function latestRunTimestamp(
  row: IngestionRunRow | UnderstandingRunRow | undefined,
  endField: "ended_at" | "finished_at"
) {
  const ended =
    endField === "ended_at"
      ? text((row as UnderstandingRunRow | undefined)?.ended_at)
      : text((row as IngestionRunRow | undefined)?.finished_at);

  return ended || text(row?.started_at) || null;
}

function latestTimestamp(values: Array<string | null>) {
  return values
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(4));
}

function isManualOnlySource(source: ReturnType<typeof readCleanedSources>[number]) {
  return (
    source.crawl_method === "manual" ||
    source.crawl_method === "x_api_future" ||
    source.crawl_method === "no_crawl" ||
    source.status === "needs_public_url" ||
    source.risk_flags.includes("needs_public_url")
  );
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeReason(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/g, "[github-token-redacted]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/gi, "[github-token-redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 300);
}
