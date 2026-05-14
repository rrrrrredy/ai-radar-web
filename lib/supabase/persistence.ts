import type { SupabaseClient } from "@supabase/supabase-js";

import { hasUnsafeFragment, isAllowedCrawlMethod, isPublicHttpUrl } from "@/lib/ingestion/config";
import type {
  CleanedSource,
  IngestionRawItem,
  IngestionRunSummary,
  RunStatus,
  SourceTier
} from "@/lib/ingestion/types";
import type {
  UnderstandingRadarItem,
  UnderstandingRunStatus,
  UnderstandingStatus
} from "@/lib/understanding/types";

export type DatabaseIngestionStatus = "succeeded" | "failed" | "partial";
export type DatabaseContentStatus = "draft" | "reviewed" | "published" | "archived";

export type IdRow = {
  id: string;
};

export type SourceIdRow = IdRow & {
  slug: string;
};

export type LocalIdRow = IdRow & {
  local_id: string;
};

export type EntityIdRow = IdRow & {
  entity_key: string;
};

export function mapRunStatus(status: RunStatus | UnderstandingRunStatus): DatabaseIngestionStatus {
  return status === "success" ? "succeeded" : status;
}

export function mapContentStatus(status: UnderstandingStatus): DatabaseContentStatus {
  switch (status) {
    case "included":
      return "reviewed";
    case "needs_review":
      return "draft";
    case "excluded":
    case "failed":
      return "archived";
  }
}

export function sourceTierNumber(tier: SourceTier) {
  switch (tier) {
    case "T1":
      return 1;
    case "T1.5":
      return 2;
    case "T2":
      return 3;
    case "T3":
    case "unreviewed":
      return 4;
  }
}

export function entityKey(type: string, name: string) {
  return `${type}:${name.trim().toLowerCase()}`;
}

export function countBy<T>(items: T[], getKey: (item: T) => string | undefined | null) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function chunkRows<T>(rows: T[], size = 200) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export function isSourceHealthEligible(source: CleanedSource) {
  if (source.status !== "active" && source.status !== "trial") {
    return false;
  }

  if (!isAllowedCrawlMethod(source.crawl_method)) {
    return false;
  }

  if (!source.url || !isPublicHttpUrl(source.url)) {
    return false;
  }

  if (source.risk_flags.includes("needs_public_url")) {
    return false;
  }

  return [source.url, source.rss_url, source.github_url, source.youtube_url, source.podcast_url, source.notes].every(
    (value) => !hasUnsafeFragment(value)
  );
}

export function sourceUpsertRows(sources: CleanedSource[]) {
  return sources.map((source) => ({
    slug: source.id,
    name: source.name,
    name_en: source.name_en,
    url: source.url,
    type: source.type,
    source_tier: sourceTierNumber(source.tier),
    tier_label: source.tier,
    language: source.language,
    region: source.region,
    topics: source.tags,
    status: source.status,
    weight: source.weight,
    risk_notes: source.risk_flags.length > 0 ? source.risk_flags.join(", ") : null,
    category: source.category,
    description: source.description,
    rss_url: source.rss_url,
    x_handle: source.x_handle,
    github_url: source.github_url,
    youtube_url: source.youtube_url,
    podcast_url: source.podcast_url,
    crawl_method: source.crawl_method,
    update_frequency: source.update_frequency,
    tags: source.tags,
    risk_flags: source.risk_flags,
    notes: source.notes,
    source_origin: source.source_origin,
    created_at: nullableTimestamp(source.created_at),
    updated_at: nullableTimestamp(source.updated_at)
  }));
}

export function ingestionRunRow(run: IngestionRunSummary) {
  return {
    local_run_id: run.id,
    started_at: run.started_at,
    finished_at: run.ended_at,
    status: mapRunStatus(run.status),
    trigger: "manual",
    source_count: run.selected_source_count,
    selected_source_count: run.selected_source_count,
    raw_item_count: run.raw_item_count,
    radar_item_count: 0,
    error_count: run.error_count,
    duplicate_count: run.duplicate_count,
    skipped_count: run.skipped_count,
    duration_ms: run.duration_ms,
    warnings: run.warnings,
    output_files: run.output_files,
    options: run.options,
    metadata: {
      source_results: run.source_results,
      item_count: run.item_count
    }
  };
}

export function rawItemRows(items: IngestionRawItem[], sourceIds: Map<string, string>, ingestionRunId: string) {
  return items.map((item) => {
    const sourceId = sourceIds.get(item.source_id);
    if (!sourceId) {
      throw new Error(`Source ${item.source_id} must be imported before raw item ${item.id} can be persisted.`);
    }

    return {
      local_id: item.id,
      ingestion_run_id: ingestionRunId,
      source_id: sourceId,
      external_id: item.external_id ?? null,
      url: item.url,
      canonical_url: item.canonical_url,
      title: item.title,
      author: item.author ?? null,
      published_at: item.published_at ?? null,
      retrieved_at: item.retrieved_at,
      collected_at: item.collected_at,
      raw_text: item.raw_text,
      summary: item.summary,
      raw_metadata: item.raw_metadata,
      hash: item.hash,
      language: item.language,
      source_snapshot: {
        source_id: item.source_id,
        source_name: item.source_name,
        source_type: item.source_type,
        source_tier: item.source_tier
      },
      source_tier: item.source_tier,
      crawl_method: item.crawl_method,
      status: item.status,
      error_message: item.error_message ?? null
    };
  });
}

export function understandingRunRow(run: {
  run_id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  status: UnderstandingRunStatus;
  mode: string;
  input_path: string;
  output_path: string;
  raw_item_count: number;
  processed_count: number;
  included_count: number;
  excluded_count: number;
  needs_review_count: number;
  failed_count: number;
  categories_count: Record<string, number>;
  entities_count: number;
  api_call_count: number;
  estimated_token_count?: number;
  warnings: string[];
  errors: string[];
  output_files: Record<string, string | undefined>;
}) {
  return {
    local_run_id: run.run_id,
    started_at: run.started_at,
    ended_at: run.ended_at,
    duration_ms: run.duration_ms,
    status: mapRunStatus(run.status),
    mode: run.mode,
    input_path: run.input_path,
    output_path: run.output_path,
    raw_item_count: run.raw_item_count,
    processed_count: run.processed_count,
    included_count: run.included_count,
    excluded_count: run.excluded_count,
    needs_review_count: run.needs_review_count,
    failed_count: run.failed_count,
    categories_count: run.categories_count,
    entities_count: run.entities_count,
    api_call_count: run.api_call_count,
    estimated_token_count: run.estimated_token_count ?? null,
    warnings: run.warnings,
    errors: run.errors,
    output_files: run.output_files
  };
}

export function radarItemRows(
  items: UnderstandingRadarItem[],
  sourceIds: Map<string, string>,
  rawItemIds: Map<string, string>,
  understandingRunId: string
) {
  return items.map((item) => {
    const rawItemId = rawItemIds.get(item.raw_item_id);
    if (!rawItemId) {
      throw new Error(`Raw item ${item.raw_item_id} must be persisted before radar item ${item.id} can be persisted.`);
    }

    return {
      local_id: item.id,
      raw_item_id: rawItemId,
      source_id: sourceIds.get(item.source_id) ?? null,
      source_name: item.source_name,
      title: item.title,
      url: item.url,
      published_at: item.published_at ?? null,
      collected_at: item.collected_at,
      processed_at: item.processed_at,
      language: item.language,
      summary_zh: item.summary_zh,
      summary_en: item.summary_en,
      topics: item.categories,
      categories: item.categories,
      tags: item.tags,
      status: mapContentStatus(item.status),
      understanding_status: item.status,
      credibility_score: item.credibility_score,
      novelty_score: item.novelty_score,
      importance_score: item.importance_score,
      ai_relevance_score: item.ai_relevance_score,
      freshness_score: item.freshness_score,
      overall_score: item.overall_score,
      source_tier: item.source_tier,
      source_weight: item.source_weight,
      confidence: item.confidence,
      exclusion_reason: item.exclusion_reason ?? null,
      why_it_matters: item.why_it_matters ?? null,
      evidence_notes: item.evidence_notes,
      model_metadata: item.model_metadata,
      understanding_run_id: understandingRunId
    };
  });
}

export async function loadSourceIds(supabase: SupabaseClient, slugs: string[]) {
  if (slugs.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase.from("sources").select("id, slug").in("slug", slugs);
  if (error) {
    throw new Error(`Unable to load source ids: ${error.message}`);
  }

  const rows = (data ?? []) as SourceIdRow[];
  return new Map(rows.map((row) => [row.slug, row.id]));
}

export async function loadLocalIds(supabase: SupabaseClient, table: "raw_items" | "radar_items", localIds: string[]) {
  if (localIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase.from(table).select("id, local_id").in("local_id", localIds);
  if (error) {
    throw new Error(`Unable to load ${table} ids: ${error.message}`);
  }

  const rows = (data ?? []) as LocalIdRow[];
  return new Map(rows.map((row) => [row.local_id, row.id]));
}

export async function upsertRows(
  supabase: SupabaseClient,
  table: string,
  rows: Array<Record<string, unknown>>,
  onConflict: string,
  batchSize = 200
) {
  let affected = 0;

  for (const chunk of chunkRows(rows, batchSize)) {
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) {
      throw new Error(`Unable to upsert ${table}: ${error.message}`);
    }
    affected += chunk.length;
  }

  return affected;
}

function nullableTimestamp(value: string) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return null;
  }

  return value;
}
