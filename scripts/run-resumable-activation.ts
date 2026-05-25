import "@/lib/config/load-cli-env";

import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createFetchCacheStats, DEFAULT_SELECTION_OPTIONS } from "@/lib/ingestion/config";
import { dedupeRawItems } from "@/lib/ingestion/dedupe";
import { runIngestion } from "@/lib/ingestion/run";
import { readCleanedSources, selectSources, sourceFamily } from "@/lib/ingestion/select-sources";
import type {
  CleanedSource,
  FetchCacheStats,
  IngestionRawItem,
  IngestionRunSummary,
  IngestionSourceSummary,
  RunStatus,
  SelectedSource
} from "@/lib/ingestion/types";
import {
  entityKey,
  ingestionRunRow,
  loadLocalIds,
  loadSourceIds,
  radarItemRows,
  rawItemRows,
  sourceUpsertRows,
  understandingRunRow,
  uniqueStrings,
  upsertRows,
  type EntityIdRow
} from "@/lib/supabase/persistence";
import {
  getSupabaseServiceClient,
  getSupabaseServiceClientForWrite,
  getSupabaseServiceStatus
} from "@/lib/supabase/service";
import { getSupabaseServerReadClient } from "@/lib/supabase/server-read";
import { runUnderstanding } from "@/lib/understanding/run";
import type {
  UnderstandingMode,
  UnderstandingRadarItem,
  UnderstandingRunSummary,
  UnderstandingStatus
} from "@/lib/understanding/types";

type CliOptions = {
  mode: UnderstandingMode;
  limit: number | null;
  chunkSize: number;
  maxItemsPerSource: number;
  sourceIds: string[] | null;
  persist: boolean;
  resume: boolean;
  reset: boolean;
  maxChunks: number | null;
  json: boolean;
  statusOnly: boolean;
};

type ChunkStatus = "completed" | "failed" | "persist_failed";

type ChunkCheckpoint = {
  index: number;
  source_ids: string[];
  status: ChunkStatus;
  started_at: string;
  ended_at: string;
  output_file?: string;
  raw_item_count: number;
  radar_item_count: number;
  included_count: number;
  needs_review_count: number;
  excluded_count: number;
  failed_count: number;
  duplicate_count: number;
  persisted: boolean;
  persist_counts?: PersistCounts;
  source_results: IngestionSourceSummary[];
  warnings: string[];
  error?: string;
};

type ActivationCheckpoint = {
  schema_version: 1;
  run_id: string;
  mode: UnderstandingMode;
  limit: number;
  chunk_size: number;
  max_items_per_source: number;
  selected_source_ids: string[];
  started_at: string;
  updated_at: string;
  chunks: ChunkCheckpoint[];
  warnings: string[];
};

type ChunkOutput = {
  schema_version: 1;
  run_id: string;
  chunk_index: number;
  source_ids: string[];
  ingestion_run: IngestionRunSummary;
  understanding_run: UnderstandingRunSummary;
  raw_items: IngestionRawItem[];
  radar_items: UnderstandingRadarItem[];
  warnings: string[];
};

type PersistCounts = {
  sourceRowsUpserted: number;
  ingestionRunsUpserted: number;
  rawItemRowsUpserted: number;
  understandingRunsUpserted: number;
  radarItemRowsUpserted: number;
  entityRowsUpserted: number;
  itemEntityRowsUpserted: number;
  scoreRowsUpserted: number;
  apiUsageRowsInserted: number;
};

type SupabaseCounts = {
  sources: number | null;
  raw_items: number | null;
  radar_items: number | null;
  public_radar_items: number | null;
  included: number | null;
  needs_review: number | null;
  excluded: number | null;
  entities: number | null;
  item_entities: number | null;
  scores: number | null;
  ingestion_runs: number | null;
  understanding_runs: number | null;
  report_candidates: number | null;
  warnings: string[];
};

const activationRoot = path.join(process.cwd(), "data", "activation");
const latestDir = path.join(activationRoot, "latest");
const runsDir = path.join(activationRoot, "runs");
const checkpointPath = path.join(latestDir, "checkpoint.json");
const summaryPath = path.join(latestDir, "summary.json");
const scoreTypes = ["ai_relevance", "importance", "credibility", "novelty", "freshness", "overall", "source_weight"] as const;

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.statusOnly) {
    await printStatus(options.json);
    return;
  }

  if (options.reset) {
    await fs.rm(latestDir, { force: true, recursive: true });
  }

  if (options.persist) {
    assertPersistReady();
  }

  await fs.mkdir(latestDir, { recursive: true });
  await fs.mkdir(runsDir, { recursive: true });

  const selectedSources = selectedSourcesForOptions(options);
  const checkpoint = await initializeCheckpoint(options, selectedSources);
  const sourceById = new Map(selectedSources.map((source) => [source.id, source]));
  const registryById = new Map(readCleanedSources().map((source) => [source.id, source]));
  const chunks = chunkArray(checkpoint.selected_source_ids.slice(0, checkpoint.limit), checkpoint.chunk_size);
  let actions = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    const existing = checkpoint.chunks.find((chunk) => chunk.index === index);

    if (existing?.status === "completed") {
      if (options.persist && !existing.persisted && existing.output_file) {
        if (shouldStop(options, actions)) {
          break;
        }

        actions += 1;
        await persistExistingChunk(checkpoint, existing);
      }
      continue;
    }

    if (shouldStop(options, actions)) {
      break;
    }

    actions += 1;
    const chunkSources = chunks[index]
      .map((sourceId) => sourceById.get(sourceId) ?? registryById.get(sourceId))
      .filter((source): source is SelectedSource => isSelectedSource(source));

    const chunkCheckpoint = await runChunk({
      checkpoint,
      chunkIndex: index,
      options,
      sources: chunkSources
    });
    upsertChunkCheckpoint(checkpoint, chunkCheckpoint);
    await writeCheckpointAndSummary(checkpoint, selectedSources);
  }

  checkpoint.updated_at = new Date().toISOString();
  await writeCheckpointAndSummary(checkpoint, selectedSources);
  const summary = await buildSummary(checkpoint, selectedSources);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printSummary(summary);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: "mock",
    limit: null,
    chunkSize: 5,
    maxItemsPerSource: 3,
    sourceIds: null,
    persist: false,
    resume: false,
    reset: false,
    maxChunks: null,
    json: false,
    statusOnly: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--":
        break;
      case "--mode":
        options.mode = readModeArg(args, index);
        index += 1;
        break;
      case "--limit":
        options.limit = readNumberArg(args, index);
        index += 1;
        break;
      case "--chunk-size":
        options.chunkSize = readNumberArg(args, index);
        index += 1;
        break;
      case "--max-items-per-source":
        options.maxItemsPerSource = readNumberArg(args, index);
        index += 1;
        break;
      case "--source-id":
        options.sourceIds = uniqueMessages([...(options.sourceIds ?? []), readStringArg(args, index)]);
        index += 1;
        break;
      case "--source-ids":
        options.sourceIds = uniqueMessages([
          ...(options.sourceIds ?? []),
          ...readStringArg(args, index).split(",").map((value) => value.trim())
        ]);
        index += 1;
        break;
      case "--persist":
        options.persist = true;
        break;
      case "--resume":
        options.resume = true;
        break;
      case "--reset":
        options.reset = true;
        break;
      case "--max-chunks":
        options.maxChunks = readNumberArg(args, index);
        index += 1;
        break;
      case "--json":
        options.json = true;
        break;
      case "--status":
        options.statusOnly = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readModeArg(args: string[], index: number): UnderstandingMode {
  const value = readStringArg(args, index);
  if (value !== "mock" && value !== "live") {
    throw new Error("--mode must be live or mock.");
  }
  return value;
}

function readStringArg(args: string[], index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${args[index]}.`);
  }
  return value;
}

function readNumberArg(args: string[], index: number) {
  const value = Number(readStringArg(args, index));
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${args[index]} must be a positive number.`);
  }
  return Math.floor(value);
}

function selectedSourcesForOptions(options: CliOptions) {
  if (options.sourceIds?.length) {
    const sources = options.sourceIds.flatMap((sourceId) =>
      selectSources({
        limit: 1,
        method: DEFAULT_SELECTION_OPTIONS.method,
        maxItemsPerSource: options.maxItemsPerSource,
        sourceId
      }).sources
    );
    const selectedIds = new Set(sources.map((source) => source.id));
    const missing = options.sourceIds.filter((sourceId) => !selectedIds.has(sourceId));

    if (missing.length > 0) {
      throw new Error(`No eligible sources matched requested source ids: ${missing.join(", ")}`);
    }

    return sources;
  }

  const selection = selectSources({
    limit: options.limit ?? 10,
    method: DEFAULT_SELECTION_OPTIONS.method,
    maxItemsPerSource: options.maxItemsPerSource
  });

  if (selection.sources.length === 0) {
    throw new Error("No eligible sources were selected for activation.");
  }

  return selection.sources;
}

async function initializeCheckpoint(options: CliOptions, selectedSources: SelectedSource[]): Promise<ActivationCheckpoint> {
  if (options.resume && fsSync.existsSync(checkpointPath)) {
    const checkpoint = await readJson<ActivationCheckpoint>(checkpointPath);
    return {
      ...checkpoint,
      limit: Math.min(options.limit ?? checkpoint.limit, checkpoint.selected_source_ids.length),
      mode: options.mode,
      updated_at: new Date().toISOString()
    };
  }

  const now = new Date().toISOString();
  const requestedLimit = options.limit ?? (options.sourceIds?.length ? selectedSources.length : 10);
  const limit = Math.min(requestedLimit, selectedSources.length);
  return {
    schema_version: 1,
    run_id: `activation_${now.replace(/[-:.]/g, "").replace("T", "_").replace("Z", "Z")}`,
    mode: options.mode,
    limit,
    chunk_size: options.chunkSize,
    max_items_per_source: options.maxItemsPerSource,
    selected_source_ids: selectedSources.map((source) => source.id),
    started_at: now,
    updated_at: now,
    chunks: [],
    warnings: []
  };
}

async function runChunk(input: {
  checkpoint: ActivationCheckpoint;
  chunkIndex: number;
  options: CliOptions;
  sources: SelectedSource[];
}): Promise<ChunkCheckpoint> {
  const startedAt = new Date().toISOString();
  const sourceIds = input.sources.map((source) => source.id);
  const chunkBase = `chunk-${String(input.chunkIndex + 1).padStart(4, "0")}`;
  const rawInputPath = path.join(runsDir, `${input.checkpoint.run_id}-${chunkBase}.raw-items.json`);
  const chunkOutputPath = path.join(runsDir, `${input.checkpoint.run_id}-${chunkBase}.json`);

  try {
    const sourceRuns = await Promise.all(
      input.sources.map((source) =>
        runIngestion({
          limit: 1,
          method: DEFAULT_SELECTION_OPTIONS.method,
          maxItemsPerSource: input.options.maxItemsPerSource,
          sourceId: source.id
        })
      )
    );
    const fetchedRawItems = sourceRuns.flatMap((run) => run.rawItems);
    const deduped = dedupeRawItems(fetchedRawItems);
    await writeJson(rawInputPath, deduped.items);

    const ingestionRun = buildChunkIngestionRun({
      checkpoint: input.checkpoint,
      chunkIndex: input.chunkIndex,
      duplicateCount: sourceRuns.reduce((sum, run) => sum + run.run.duplicate_count, deduped.duplicateCount),
      rawInputPath,
      rawItems: deduped.items,
      sourceIds,
      sourceRuns,
      startedAt
    });
    const understanding = await runUnderstanding({
      inputPath: rawInputPath,
      limit: Math.max(1, deduped.items.length),
      maxTextChars: 6000,
      mode: input.options.mode
    });
    const warnings = uniqueMessages([
      ...sourceRuns.flatMap((run) => run.run.warnings),
      ...understanding.run.warnings,
      ...understanding.run.errors
    ]);

    const output: ChunkOutput = {
      schema_version: 1,
      run_id: input.checkpoint.run_id,
      chunk_index: input.chunkIndex,
      source_ids: sourceIds,
      ingestion_run: ingestionRun,
      understanding_run: understanding.run,
      raw_items: deduped.items,
      radar_items: understanding.radarItems,
      warnings
    };

    let persistCounts: PersistCounts | undefined;
    let persisted = false;
    if (input.options.persist) {
      persistCounts = await persistActivationData(output.raw_items, output.ingestion_run, output.radar_items, output.understanding_run);
      persisted = true;
    }

    await writeJson(chunkOutputPath, output);

    return {
      index: input.chunkIndex,
      source_ids: sourceIds,
      status: "completed",
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      output_file: relative(chunkOutputPath),
      raw_item_count: output.raw_items.length,
      radar_item_count: output.radar_items.length,
      ...statusCountFields(output.radar_items),
      duplicate_count: ingestionRun.duplicate_count,
      persisted,
      persist_counts: persistCounts,
      source_results: ingestionRun.source_results,
      warnings
    };
  } catch (error) {
    return {
      index: input.chunkIndex,
      source_ids: sourceIds,
      status: "failed",
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      raw_item_count: 0,
      radar_item_count: 0,
      included_count: 0,
      needs_review_count: 0,
      excluded_count: 0,
      failed_count: 0,
      duplicate_count: 0,
      persisted: false,
      source_results: [],
      warnings: [],
      error: sanitizeLogValue(error instanceof Error ? error.message : String(error))
    };
  }
}

async function persistExistingChunk(checkpoint: ActivationCheckpoint, chunk: ChunkCheckpoint) {
  if (!chunk.output_file) {
    throw new Error(`Chunk ${chunk.index + 1} has no output file to persist.`);
  }

  const output = await readJson<ChunkOutput>(path.join(process.cwd(), chunk.output_file));
  try {
    const persistCounts = await persistActivationData(output.raw_items, output.ingestion_run, output.radar_items, output.understanding_run);
    chunk.persisted = true;
    chunk.persist_counts = persistCounts;
    chunk.status = "completed";
    chunk.ended_at = new Date().toISOString();
    checkpoint.updated_at = chunk.ended_at;
  } catch (error) {
    chunk.status = "persist_failed";
    chunk.error = sanitizeLogValue(error instanceof Error ? error.message : String(error));
    checkpoint.updated_at = new Date().toISOString();
  }

  await writeCheckpointAndSummary(checkpoint, []);
}

function buildChunkIngestionRun(input: {
  checkpoint: ActivationCheckpoint;
  chunkIndex: number;
  duplicateCount: number;
  rawInputPath: string;
  rawItems: IngestionRawItem[];
  sourceIds: string[];
  sourceRuns: Array<Awaited<ReturnType<typeof runIngestion>>>;
  startedAt: string;
}): IngestionRunSummary {
  const endedAt = new Date().toISOString();
  const sourceResults = input.sourceRuns.flatMap((run) => run.run.source_results);
  const errorCount = sourceResults.filter((result) => result.status === "failed").length +
    input.rawItems.filter((item) => item.status === "failed").length;
  const skippedCount = sourceResults.filter((result) => result.status === "skipped").length +
    input.rawItems.filter((item) => item.status === "skipped").length;
  const runId = `${input.checkpoint.run_id}_chunk_${String(input.chunkIndex + 1).padStart(4, "0")}`;
  const output = relative(input.rawInputPath);

  return {
    id: runId,
    started_at: input.startedAt,
    selected_source_count: input.sourceIds.length,
    source_results: sourceResults,
    item_count: input.rawItems.length,
    raw_item_count: input.rawItems.filter((item) => item.status === "collected").length,
    duplicate_count: input.duplicateCount,
    skipped_count: skippedCount,
    error_count: errorCount,
    ended_at: endedAt,
    duration_ms: Date.parse(endedAt) - Date.parse(input.startedAt),
    status: runStatus(input.sourceIds.length, input.rawItems.length, errorCount),
    warnings: uniqueMessages(input.sourceRuns.flatMap((run) => run.run.warnings)),
    cache_stats: sumCacheStats(input.sourceRuns.map((run) => run.run.cache_stats)),
    output_files: {
      latest_raw_items: output,
      latest_run: output,
      run_raw_items: output,
      run_summary: output
    },
    options: {
      limit: input.sourceIds.length,
      method: DEFAULT_SELECTION_OPTIONS.method,
      max_items_per_source: input.checkpoint.max_items_per_source
    }
  };
}

function runStatus(selectedSourceCount: number, itemCount: number, errorCount: number): RunStatus {
  if (selectedSourceCount === 0 || (errorCount > 0 && itemCount === 0)) {
    return "failed";
  }

  if (errorCount > 0) {
    return "partial";
  }

  return "success";
}

function sumCacheStats(stats: FetchCacheStats[]) {
  return stats.reduce<FetchCacheStats>((sum, value) => ({
    hits: sum.hits + value.hits,
    misses: sum.misses + value.misses,
    bypasses: sum.bypasses + value.bypasses,
    writes: sum.writes + value.writes,
    errors: sum.errors + value.errors
  }), createFetchCacheStats());
}

function statusCountFields(items: UnderstandingRadarItem[]) {
  const counts = statusCounts(items.map((item) => item.status));
  return {
    included_count: counts.included,
    needs_review_count: counts.needs_review,
    excluded_count: counts.excluded,
    failed_count: counts.failed
  };
}

async function persistActivationData(
  rawItems: IngestionRawItem[],
  ingestionRun: IngestionRunSummary,
  radarItems: UnderstandingRadarItem[],
  understandingRun: UnderstandingRunSummary
): Promise<PersistCounts> {
  const supabase = getSupabaseServiceClientForWrite();
  const sourceRowsUpserted = await persistRequiredSources(supabase, rawItems, ingestionRun);
  const { ingestionRunsUpserted, rawItemRowsUpserted } = await persistIngestion(supabase, rawItems, ingestionRun);
  const understandingCounts = await persistUnderstanding(supabase, radarItems, understandingRun);

  return {
    sourceRowsUpserted,
    ingestionRunsUpserted,
    rawItemRowsUpserted,
    ...understandingCounts
  };
}

async function persistRequiredSources(
  supabase: SupabaseClient,
  rawItems: IngestionRawItem[],
  ingestionRun: IngestionRunSummary
) {
  const requiredSlugs = uniqueStrings([
    ...rawItems.map((item) => item.source_id),
    ...ingestionRun.source_results.map((source) => source.source_id)
  ]);
  if (requiredSlugs.length === 0) {
    return 0;
  }

  const registryById = new Map(readCleanedSources().map((source) => [source.id, source]));
  const sources = requiredSlugs.map((slug) => registryById.get(slug)).filter((source): source is CleanedSource => Boolean(source));
  const missing = requiredSlugs.filter((slug) => !registryById.has(slug));
  if (missing.length > 0) {
    throw new Error(`Cleaned source registry is missing selected source ids: ${missing.join(", ")}`);
  }

  return upsertRows(supabase, "sources", sourceUpsertRows(sources), "slug");
}

async function persistIngestion(
  supabase: SupabaseClient,
  rawItems: IngestionRawItem[],
  ingestionRun: IngestionRunSummary
) {
  const sourceSlugs = uniqueStrings(rawItems.map((item) => item.source_id));
  const sourceIds = await loadSourceIds(supabase, sourceSlugs);
  const missingSources = sourceSlugs.filter((slug) => !sourceIds.has(slug));
  if (missingSources.length > 0) {
    throw new Error(`Import sources before persisting ingestion. Missing source slugs: ${missingSources.join(", ")}`);
  }

  const { data, error } = await supabase
    .from("ingestion_runs")
    .upsert(ingestionRunRow(ingestionRun), { onConflict: "local_run_id" })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to upsert ingestion run: ${error.message}`);
  }

  const persistedRun = data as { id: string } | null;
  if (!persistedRun) {
    throw new Error("Supabase did not return the persisted ingestion run id.");
  }

  const rawItemRowsUpserted = await upsertRows(supabase, "raw_items", rawItemRows(rawItems, sourceIds, persistedRun.id), "local_id");
  return {
    ingestionRunsUpserted: 1,
    rawItemRowsUpserted
  };
}

async function persistUnderstanding(
  supabase: SupabaseClient,
  radarItems: UnderstandingRadarItem[],
  run: UnderstandingRunSummary
): Promise<Omit<PersistCounts, "sourceRowsUpserted" | "ingestionRunsUpserted" | "rawItemRowsUpserted">> {
  const sourceSlugs = uniqueStrings(radarItems.map((item) => item.source_id));
  const rawLocalIds = uniqueStrings(radarItems.map((item) => item.raw_item_id));
  const [sourceIds, rawItemIds] = await Promise.all([
    loadSourceIds(supabase, sourceSlugs),
    loadLocalIds(supabase, "raw_items", rawLocalIds)
  ]);
  const missingRawItems = rawLocalIds.filter((localId) => !rawItemIds.has(localId));
  if (missingRawItems.length > 0) {
    throw new Error(`Persist ingestion before understanding. Missing raw item local ids: ${missingRawItems.join(", ")}`);
  }

  const { data: runData, error: runError } = await supabase
    .from("understanding_runs")
    .upsert(understandingRunRow(runForPersistence(run)), { onConflict: "local_run_id" })
    .select("id")
    .single();

  if (runError) {
    throw new Error(`Unable to upsert understanding run: ${runError.message}`);
  }

  const persistedRun = runData as { id: string } | null;
  if (!persistedRun) {
    throw new Error("Supabase did not return the persisted understanding run id.");
  }

  const rows = radarItemRows(radarItems, sourceIds, rawItemIds, persistedRun.id);
  const radarItemRowsUpserted = await upsertRows(supabase, "radar_items", rows, "local_id");
  const radarIds = await loadLocalIds(supabase, "radar_items", radarItems.map((item) => item.id));
  const { entityIds, entityRowsUpserted } = await upsertEntities(supabase, radarItems);
  const itemEntityRowsUpserted = await upsertItemEntities(supabase, radarItems, radarIds, entityIds);
  const scoreRowsUpserted = await upsertScoreRows(supabase, radarItems, radarIds);
  const apiUsageRowsInserted = await insertApiUsageIfNeeded(supabase, run);

  return {
    understandingRunsUpserted: 1,
    radarItemRowsUpserted,
    entityRowsUpserted,
    itemEntityRowsUpserted,
    scoreRowsUpserted,
    apiUsageRowsInserted
  };
}

async function upsertEntities(supabase: SupabaseClient, radarItems: UnderstandingRadarItem[]) {
  const entityRows = new Map<string, Record<string, unknown>>();

  for (const item of radarItems) {
    for (const entity of item.entities) {
      const key = entityKey(entity.type, entity.name);
      if (!entityRows.has(key)) {
        entityRows.set(key, {
          entity_key: key,
          type: entity.type,
          name: entity.name,
          aliases: [],
          metadata: {
            source: "resumable_activation"
          }
        });
      }
    }
  }

  if (entityRows.size === 0) {
    return {
      entityIds: new Map<string, string>(),
      entityRowsUpserted: 0
    };
  }

  const { data, error } = await supabase
    .from("entities")
    .upsert(Array.from(entityRows.values()), { onConflict: "entity_key" })
    .select("id, entity_key");

  if (error) {
    throw new Error(`Unable to upsert entities: ${error.message}`);
  }

  const rows = (data ?? []) as EntityIdRow[];
  return {
    entityIds: new Map(rows.map((row) => [row.entity_key, row.id])),
    entityRowsUpserted: entityRows.size
  };
}

async function upsertItemEntities(
  supabase: SupabaseClient,
  radarItems: UnderstandingRadarItem[],
  radarIds: Map<string, string>,
  entityIds: Map<string, string>
) {
  const rows: Array<Record<string, unknown>> = [];

  for (const item of radarItems) {
    const radarItemId = radarIds.get(item.id);
    if (!radarItemId) {
      throw new Error(`Missing persisted radar id for ${item.id}.`);
    }

    for (const entity of item.entities) {
      const entityId = entityIds.get(entityKey(entity.type, entity.name));
      if (!entityId) {
        throw new Error(`Missing persisted entity id for ${entity.type}:${entity.name}.`);
      }

      rows.push({
        radar_item_id: radarItemId,
        entity_id: entityId,
        relationship: "mentioned",
        confidence: entity.confidence,
        evidence_text: entity.evidence_text ?? null
      });
    }
  }

  if (rows.length === 0) {
    return 0;
  }

  return upsertRows(supabase, "item_entities", rows, "radar_item_id,entity_id,relationship");
}

async function upsertScoreRows(
  supabase: SupabaseClient,
  radarItems: UnderstandingRadarItem[],
  radarIds: Map<string, string>
) {
  const rows: Array<Record<string, unknown>> = [];

  for (const item of radarItems) {
    const radarItemId = radarIds.get(item.id);
    if (!radarItemId) {
      throw new Error(`Missing persisted radar id for ${item.id}.`);
    }

    for (const scoreType of scoreTypes) {
      rows.push({
        local_score_key: `${item.id}:${scoreType}:${item.model_metadata.prompt_version}:${item.model_metadata.output_hash}`,
        target_type: "radar_item",
        target_id: radarItemId,
        score_type: scoreType,
        score: scoreValue(item, scoreType),
        explanation: item.why_it_matters ?? item.evidence_notes[0] ?? null,
        model: item.model_metadata.smart_model,
        rule_version: item.model_metadata.prompt_version,
        metadata: {
          local_radar_item_id: item.id,
          model_mode: item.model_metadata.mode,
          output_hash: item.model_metadata.output_hash
        }
      });
    }
  }

  return upsertRows(supabase, "scores", rows, "local_score_key");
}

async function insertApiUsageIfNeeded(supabase: SupabaseClient, run: UnderstandingRunSummary) {
  if (run.api_call_count <= 0) {
    return 0;
  }

  const { error } = await supabase.from("api_usage_logs").insert({
    provider: "deepseek",
    model: "mixed",
    purpose: "understanding",
    prompt_tokens: 0,
    completion_tokens: 0,
    status: run.status,
    metadata: {
      local_run_id: run.run_id,
      api_call_count: run.api_call_count,
      estimated_token_count: run.estimated_token_count
    }
  });

  if (error) {
    throw new Error(`Unable to insert API usage log: ${error.message}`);
  }

  return 1;
}

function runForPersistence(run: UnderstandingRunSummary) {
  return {
    ...run,
    categories_count: run.categories_count as Record<string, number>,
    output_files: run.output_files as Record<string, string | undefined>
  };
}

function scoreValue(item: UnderstandingRadarItem, scoreType: (typeof scoreTypes)[number]) {
  switch (scoreType) {
    case "ai_relevance":
      return item.ai_relevance_score;
    case "importance":
      return item.importance_score;
    case "credibility":
      return item.credibility_score;
    case "novelty":
      return item.novelty_score;
    case "freshness":
      return item.freshness_score;
    case "overall":
      return item.overall_score;
    case "source_weight":
      return item.source_weight;
  }
}

function assertPersistReady() {
  const status = getSupabaseServiceStatus();
  const missing = [
    status.publicConfigConfigured ? "" : "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY",
    status.serviceRoleConfigured ? "" : "SUPABASE_SERVICE_ROLE_KEY"
  ].filter(Boolean);

  if (!status.writesEnabled) {
    throw new Error("Supabase persist requires ENABLE_SUPABASE_WRITES=true for this process. No Supabase writes were attempted.");
  }

  if (missing.length > 0) {
    throw new Error(`Supabase persist is not configured. Missing: ${missing.join(", ")}. No Supabase writes were attempted.`);
  }
}

async function writeCheckpointAndSummary(checkpoint: ActivationCheckpoint, selectedSources: SelectedSource[]) {
  checkpoint.updated_at = new Date().toISOString();
  await writeJson(checkpointPath, checkpoint);
  await writeJson(summaryPath, await buildSummary(checkpoint, selectedSources));
}

async function buildSummary(checkpoint: ActivationCheckpoint, selectedSources: SelectedSource[]) {
  const sourceById = new Map(selectedSources.map((source) => [source.id, source]));
  const chunks = checkpoint.chunks.sort((left, right) => left.index - right.index);
  const completed = chunks.filter((chunk) => chunk.status === "completed");
  const failed = chunks.filter((chunk) => chunk.status === "failed" || chunk.status === "persist_failed");
  const totals = {
    selected_sources: checkpoint.selected_source_ids.slice(0, checkpoint.limit).length,
    chunks_total: Math.ceil(checkpoint.limit / checkpoint.chunk_size),
    chunks_attempted: chunks.length,
    chunks_succeeded: completed.length,
    chunks_failed: failed.length,
    chunks_persisted: completed.filter((chunk) => chunk.persisted).length,
    raw_items: sum(chunks.map((chunk) => chunk.raw_item_count)),
    radar_items: sum(chunks.map((chunk) => chunk.radar_item_count)),
    included: sum(chunks.map((chunk) => chunk.included_count)),
    needs_review: sum(chunks.map((chunk) => chunk.needs_review_count)),
    excluded: sum(chunks.map((chunk) => chunk.excluded_count)),
    failed: sum(chunks.map((chunk) => chunk.failed_count)),
    duplicates: sum(chunks.map((chunk) => chunk.duplicate_count))
  };

  return {
    schema_version: 1,
    run_id: checkpoint.run_id,
    mode: checkpoint.mode,
    started_at: checkpoint.started_at,
    updated_at: checkpoint.updated_at,
    options: {
      limit: checkpoint.limit,
      chunk_size: checkpoint.chunk_size,
      max_items_per_source: checkpoint.max_items_per_source
    },
    totals,
    source_families: familyStatuses(checkpoint, sourceById),
    chunks,
    supabase_counts: await loadSupabaseCounts(),
    warnings: uniqueMessages([...checkpoint.warnings, ...chunks.flatMap((chunk) => chunk.warnings)])
  };
}

function familyStatuses(checkpoint: ActivationCheckpoint, sourceById: Map<string, SelectedSource>) {
  const statuses = new Map<string, {
    selected: number;
    fetched: number;
    skipped: number;
    failed: number;
    deduped: number;
    included: number;
    needs_review: number;
    excluded: number;
  }>();

  for (const sourceId of checkpoint.selected_source_ids.slice(0, checkpoint.limit)) {
    const source = sourceById.get(sourceId);
    const family = source ? sourceFamily(source) : "unknown";
    const current = statuses.get(family) ?? emptyFamilyStatus();
    current.selected += 1;
    statuses.set(family, current);
  }

  for (const chunk of checkpoint.chunks) {
    for (const result of chunk.source_results) {
      const source = sourceById.get(result.source_id);
      const family = source ? sourceFamily(source) : "unknown";
      const current = statuses.get(family) ?? emptyFamilyStatus();

      if (result.status === "success") {
        current.fetched += 1;
      } else if (result.status === "skipped") {
        current.skipped += 1;
      } else if (result.status === "failed") {
        current.failed += 1;
      }
      statuses.set(family, current);
    }

    const families = uniqueMessages(chunk.source_ids.map((sourceId) => {
      const source = sourceById.get(sourceId);
      return source ? sourceFamily(source) : "unknown";
    }));
    for (const family of families) {
      const current = statuses.get(family) ?? emptyFamilyStatus();
      current.deduped += chunk.duplicate_count;
      current.included += chunk.included_count;
      current.needs_review += chunk.needs_review_count;
      current.excluded += chunk.excluded_count + chunk.failed_count;
      statuses.set(family, current);
    }
  }

  return Object.fromEntries(
    Array.from(statuses.entries()).sort(([left], [right]) => left.localeCompare(right))
  );
}

function emptyFamilyStatus() {
  return {
    selected: 0,
    fetched: 0,
    skipped: 0,
    failed: 0,
    deduped: 0,
    included: 0,
    needs_review: 0,
    excluded: 0
  };
}

async function loadSupabaseCounts(): Promise<SupabaseCounts> {
  const empty: SupabaseCounts = {
    sources: null,
    raw_items: null,
    radar_items: null,
    public_radar_items: null,
    included: null,
    needs_review: null,
    excluded: null,
    entities: null,
    item_entities: null,
    scores: null,
    ingestion_runs: null,
    understanding_runs: null,
    report_candidates: null,
    warnings: []
  };

  try {
    const status = getSupabaseServiceStatus();
    const supabase = status.publicConfigConfigured && status.serviceRoleConfigured
      ? getSupabaseServiceClient()
      : getSupabaseServerReadClient();

    if (!supabase) {
      return {
        ...empty,
        warnings: ["Supabase config is unavailable; production counts were not queried."]
      };
    }

    const tableNames = [
      "sources",
      "raw_items",
      "radar_items",
      "public_radar_items",
      "entities",
      "item_entities",
      "scores",
      "ingestion_runs",
      "understanding_runs",
      "report_candidates"
    ] as const;
    const tableCounts = await Promise.all(tableNames.map((table) => exactCount(supabase, table)));
    const countsByTable = Object.fromEntries(tableCounts.map((result) => [result.table, result.count]));
    const statusRows = await supabase.from("radar_items").select("understanding_status").limit(10000);
    const radarStatusCounts = statusRows.error
      ? { included: null, needs_review: null, excluded: null }
      : statusCounts(((statusRows.data ?? []) as Array<{ understanding_status?: string | null }>).map((row) => normalizeStatus(row.understanding_status)));

    return {
      ...empty,
      ...countsByTable,
      included: radarStatusCounts.included,
      needs_review: radarStatusCounts.needs_review,
      excluded: radarStatusCounts.excluded,
      warnings: [
        ...tableCounts.map((result) => result.warning ?? ""),
        statusRows.error ? `radar_items status count failed: ${sanitizeLogValue(statusRows.error.message)}` : ""
      ].filter(Boolean)
    };
  } catch (error) {
    return {
      ...empty,
      warnings: [`Supabase production counts unavailable: ${sanitizeLogValue(error instanceof Error ? error.message : String(error))}`]
    };
  }
}

async function exactCount(supabase: SupabaseClient, table: string): Promise<{ table: string; count: number | null; warning?: string }> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) {
    return {
      table,
      count: null,
      warning: `${table} count failed: ${sanitizeLogValue(error.message)}`
    };
  }
  return {
    table,
    count: count ?? 0
  };
}

async function printStatus(json: boolean) {
  const checkpoint = fsSync.existsSync(checkpointPath)
    ? await readJson<ActivationCheckpoint>(checkpointPath)
    : null;

  if (!checkpoint) {
    const payload = {
      checkpoint: null,
      supabase_counts: await loadSupabaseCounts()
    };
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log("No resumable activation checkpoint found.");
    }
    return;
  }

  const selectedSources = readCleanedSources().filter((source): source is SelectedSource => isSelectedSource(source));
  const summary = await buildSummary(checkpoint, selectedSources);
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printSummary(summary);
}

function printSummary(summary: Awaited<ReturnType<typeof buildSummary>>) {
  console.log("Resumable activation summary");
  console.log(`Run: ${summary.run_id}`);
  console.log(`Mode: ${summary.mode}`);
  console.log(`Chunks attempted/succeeded/failed: ${summary.totals.chunks_attempted}/${summary.totals.chunks_succeeded}/${summary.totals.chunks_failed}`);
  console.log(`Chunks persisted: ${summary.totals.chunks_persisted}`);
  console.log(`Raw/radar items: ${summary.totals.raw_items}/${summary.totals.radar_items}`);
  console.log(`Included / needs_review / excluded / failed: ${summary.totals.included} / ${summary.totals.needs_review} / ${summary.totals.excluded} / ${summary.totals.failed}`);
  console.log(`Duplicates: ${summary.totals.duplicates}`);
  console.log(`Checkpoint: ${relative(checkpointPath)}`);
  console.log(`Summary: ${relative(summaryPath)}`);
  console.log(`Supabase public_radar_items: ${formatNullable(summary.supabase_counts.public_radar_items)}`);
  console.log(`Supabase report_candidates: ${formatNullable(summary.supabase_counts.report_candidates)}`);

  if (summary.warnings.length > 0 || summary.supabase_counts.warnings.length > 0) {
    console.log("Warnings/caveats:");
    for (const warning of uniqueMessages([...summary.warnings, ...summary.supabase_counts.warnings])) {
      console.log(`- ${warning}`);
    }
  }
}

function upsertChunkCheckpoint(checkpoint: ActivationCheckpoint, chunk: ChunkCheckpoint) {
  const existingIndex = checkpoint.chunks.findIndex((existing) => existing.index === chunk.index);
  if (existingIndex >= 0) {
    checkpoint.chunks[existingIndex] = chunk;
  } else {
    checkpoint.chunks.push(chunk);
  }
}

function shouldStop(options: CliOptions, actions: number) {
  return options.maxChunks !== null && actions >= options.maxChunks;
}

function isSelectedSource(source: CleanedSource | SelectedSource | undefined): source is SelectedSource {
  return Boolean(source?.url && source.crawl_method);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function statusCounts(statuses: UnderstandingStatus[]): Record<UnderstandingStatus, number> {
  return statuses.reduce<Record<UnderstandingStatus, number>>((counts, status) => {
    counts[status] += 1;
    return counts;
  }, {
    included: 0,
    needs_review: 0,
    excluded: 0,
    failed: 0
  });
}

function normalizeStatus(value: unknown): UnderstandingStatus {
  if (value === "included" || value === "needs_review" || value === "excluded" || value === "failed") {
    return value;
  }
  return "needs_review";
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function uniqueMessages(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function relative(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function formatNullable(value: number | null) {
  return value === null ? "unavailable" : String(value);
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

main().catch((error) => {
  console.error(sanitizeLogValue(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
