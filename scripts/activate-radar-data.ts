import "@/lib/config/load-cli-env";

import fs from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient, type WebSocketLikeConstructor } from "@supabase/supabase-js";
import WebSocket from "ws";

import { getSupabasePublicConfig } from "@/lib/config";
import { DEFAULT_SELECTION_OPTIONS } from "@/lib/ingestion/config";
import { runIngestion } from "@/lib/ingestion/run";
import { readCleanedSources, selectSources } from "@/lib/ingestion/select-sources";
import type { CleanedSource, IngestionRawItem, IngestionRunSummary } from "@/lib/ingestion/types";
import { mockRadarItems } from "@/lib/radar/mock-data";
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
import { getSupabaseServiceClientForWrite, getSupabaseServiceStatus } from "@/lib/supabase/service";
import { runUnderstanding } from "@/lib/understanding/run";
import type {
  UnderstandingRadarItem,
  UnderstandingRunSummary,
  UnderstandingStatus
} from "@/lib/understanding/types";
import { isEnabled } from "@/lib/utils";

type CliOptions = {
  limit: number;
  maxItemsPerSource: number;
  live: boolean;
  persist: boolean;
  skipIngest: boolean;
  skipUnderstand: boolean;
  reportOnly: boolean;
};

type StatusCounts = Record<UnderstandingStatus, number>;

type CurrentDataStatus = {
  dataSource: "supabase_radar_items" | "local_understanding_output" | "mock_data" | "empty";
  total: number;
  counts: StatusCounts;
  citations: number;
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

const latestRawItemsPath = path.join(process.cwd(), "data", "ingestion", "latest", "raw-items.json");
const latestIngestionRunPath = path.join(process.cwd(), "data", "ingestion", "latest", "ingestion-run.json");
const latestRadarItemsPath = path.join(process.cwd(), "data", "understanding", "latest", "radar-items.json");
const latestUnderstandingRunPath = path.join(process.cwd(), "data", "understanding", "latest", "understanding-run.json");
const nodeRealtimeTransport = WebSocket as unknown as WebSocketLikeConstructor;
const scoreTypes = ["ai_relevance", "importance", "credibility", "novelty", "freshness", "overall", "source_weight"] as const;

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.reportOnly) {
    printReportOnly(await loadCurrentDataStatus());
    return;
  }

  const deepSeekConfigured = hasEnvValue("DEEPSEEK_API_KEY");
  const requestedLiveWithoutKey = options.live && !deepSeekConfigured;
  const mode = options.live && deepSeekConfigured ? "live" : "mock";
  const warnings: string[] = [];

  if (requestedLiveWithoutKey) {
    warnings.push("Live DeepSeek was requested but DEEPSEEK_API_KEY is missing or blank; using mock understanding and skipping live calls.");
  }

  if (options.persist) {
    assertPersistReady(options, requestedLiveWithoutKey);
  }

  const selection = selectSources({
    limit: options.limit,
    method: DEFAULT_SELECTION_OPTIONS.method,
    maxItemsPerSource: options.maxItemsPerSource
  });

  let rawItems: IngestionRawItem[];
  let ingestionRun: IngestionRunSummary;

  if (options.skipIngest) {
    rawItems = readJsonArray<IngestionRawItem>(latestRawItemsPath);
    ingestionRun = readJsonObject<IngestionRunSummary>(latestIngestionRunPath);
    warnings.push("Ingestion was skipped; latest local raw items were reused.");
  } else {
    const ingestion = await runIngestion({
      limit: options.limit,
      method: DEFAULT_SELECTION_OPTIONS.method,
      maxItemsPerSource: options.maxItemsPerSource
    });
    rawItems = ingestion.rawItems;
    ingestionRun = ingestion.run;
    warnings.push(...ingestion.run.warnings);
  }

  let radarItems: UnderstandingRadarItem[];
  let understandingRun: UnderstandingRunSummary;

  if (options.skipUnderstand) {
    radarItems = readJsonArray<UnderstandingRadarItem>(latestRadarItemsPath);
    understandingRun = readJsonObject<UnderstandingRunSummary>(latestUnderstandingRunPath);
    warnings.push("Understanding was skipped; latest local radar items were reused.");
  } else {
    const understanding = await runUnderstanding({
      inputPath: latestRawItemsPath,
      limit: options.limit,
      mode,
      maxTextChars: 6000
    });
    radarItems = understanding.radarItems;
    understandingRun = understanding.run;
    warnings.push(...understanding.run.warnings);
  }

  let persistCounts: PersistCounts | null = null;
  if (options.persist) {
    persistCounts = await persistActivationData(rawItems, ingestionRun, radarItems, understandingRun);
  }

  printActivationSummary({
    options,
    selectionSources: selection.sources.map((source) => source.id),
    rawItems,
    ingestionRun,
    radarItems,
    understandingRun,
    deepSeekConfigured,
    mode,
    requestedLiveWithoutKey,
    persistCounts,
    warnings: uniqueMessages([...selection.warnings, ...warnings, ...understandingRun.errors])
  });
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    limit: 10,
    maxItemsPerSource: 5,
    live: false,
    persist: false,
    skipIngest: false,
    skipUnderstand: false,
    reportOnly: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--":
        break;
      case "--limit":
        options.limit = readNumberArg(args, index);
        index += 1;
        break;
      case "--max-items-per-source":
        options.maxItemsPerSource = readNumberArg(args, index);
        index += 1;
        break;
      case "--live":
        options.live = true;
        break;
      case "--persist":
        options.persist = true;
        break;
      case "--skip-ingest":
        options.skipIngest = true;
        break;
      case "--skip-understand":
        options.skipUnderstand = true;
        break;
      case "--report-only":
        options.reportOnly = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readNumberArg(args: string[], index: number) {
  const value = args[index + 1];
  const numberValue = Number(value);
  if (!value || value.startsWith("--") || !Number.isFinite(numberValue) || numberValue < 1) {
    throw new Error(`${args[index]} must be a positive number.`);
  }
  return Math.floor(numberValue);
}

function assertPersistReady(options: CliOptions, requestedLiveWithoutKey: boolean) {
  const status = getSupabaseServiceStatus();

  if (requestedLiveWithoutKey) {
    throw new Error("Live persist was requested, but DEEPSEEK_API_KEY is missing or blank. No Supabase writes were attempted.");
  }

  if (!status.writesEnabled) {
    throw new Error("Supabase persist requires ENABLE_SUPABASE_WRITES=true for this process. No Supabase writes were attempted.");
  }

  const missing = [
    status.publicConfigConfigured ? "" : "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY",
    status.serviceRoleConfigured ? "" : "SUPABASE_SERVICE_ROLE_KEY"
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Supabase persist is not configured. Missing: ${missing.join(", ")}. No Supabase writes were attempted.`);
  }

  if (!options.persist) {
    throw new Error("Internal activation error: persist readiness was checked without --persist.");
  }
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
            source: "radar_data_activation"
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

async function loadCurrentDataStatus(): Promise<CurrentDataStatus> {
  const supabase = await loadCurrentSupabaseStatus();
  if (supabase) {
    return supabase;
  }

  const local = loadCurrentLocalStatus();
  if (local) {
    return local;
  }

  return loadMockStatus();
}

async function loadCurrentSupabaseStatus(): Promise<CurrentDataStatus | null> {
  if (!isEnabled(process.env.ENABLE_SUPABASE_RETRIEVAL)) {
    return null;
  }

  const publicConfig = getSupabasePublicConfig();
  if (!publicConfig) {
    return {
      dataSource: "empty",
      total: 0,
      counts: emptyCounts(),
      citations: 0,
      warnings: ["Supabase retrieval is enabled but public Supabase config is missing."]
    };
  }

  try {
    const supabase = createClient(publicConfig.url, publicConfig.anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      realtime: {
        transport: nodeRealtimeTransport
      }
    });
    const { data, error } = await supabase
      .from("public_radar_items")
      .select("understanding_status,url")
      .in("understanding_status", ["included", "needs_review"])
      .limit(1000);

    if (error) {
      return {
        dataSource: "empty",
        total: 0,
        counts: emptyCounts(),
        citations: 0,
        warnings: [`Supabase retrieval read failed: ${sanitizeLogValue(error.message)}`]
      };
    }

    const rows = (data ?? []) as Array<{ understanding_status?: string; url?: string }>;
    if (rows.length === 0) {
      return null;
    }

    return {
      dataSource: "supabase_radar_items",
      total: rows.length,
      counts: statusCounts(rows.map((row) => normalizeStatus(row.understanding_status))),
      citations: rows.filter((row) => Boolean(row.url)).length,
      warnings: []
    };
  } catch (error) {
    return {
      dataSource: "empty",
      total: 0,
      counts: emptyCounts(),
      citations: 0,
      warnings: [`Supabase retrieval read failed: ${sanitizeLogValue(error instanceof Error ? error.message : String(error))}`]
    };
  }
}

function loadCurrentLocalStatus(): CurrentDataStatus | null {
  if (!fs.existsSync(latestRadarItemsPath)) {
    return null;
  }

  try {
    const radarItems = readJsonArray<UnderstandingRadarItem>(latestRadarItemsPath);
    return {
      dataSource: "local_understanding_output",
      total: radarItems.length,
      counts: statusCounts(radarItems.map((item) => item.status)),
      citations: radarItems.filter((item) => item.url && (item.status === "included" || item.status === "needs_review")).length,
      warnings: []
    };
  } catch (error) {
    return {
      dataSource: "empty",
      total: 0,
      counts: emptyCounts(),
      citations: 0,
      warnings: [`Local understanding output could not be read: ${sanitizeLogValue(error instanceof Error ? error.message : String(error))}`]
    };
  }
}

function loadMockStatus(): CurrentDataStatus {
  const statuses = mockRadarItems.map((item): UnderstandingStatus => {
    if (item.status === "published") {
      return "included";
    }

    if (item.status === "archived") {
      return "excluded";
    }

    return "needs_review";
  });

  return {
    dataSource: mockRadarItems.length > 0 ? "mock_data" : "empty",
    total: mockRadarItems.length,
    counts: statusCounts(statuses),
    citations: statuses.filter((status) => status === "included" || status === "needs_review").length,
    warnings: ["Using synthetic mock radar items because no Supabase or local output is available."]
  };
}

function printReportOnly(status: CurrentDataStatus) {
  console.log("Radar data status");
  console.log(`Data source: ${status.dataSource}`);
  console.log(`Total items: ${status.total}`);
  console.log(`Included: ${status.counts.included}`);
  console.log(`Needs review: ${status.counts.needs_review}`);
  console.log(`Excluded: ${status.counts.excluded}`);
  console.log(`Failed: ${status.counts.failed}`);
  console.log(`Citations: ${status.citations}`);
  console.log(`DeepSeek key present: ${hasEnvValue("DEEPSEEK_API_KEY") ? "yes (redacted)" : "no"}`);
  console.log(`Supabase public config present: ${getSupabaseServiceStatus().publicConfigConfigured ? "yes (redacted)" : "no"}`);
  console.log(`Supabase service key present: ${getSupabaseServiceStatus().serviceRoleConfigured ? "yes (redacted)" : "no"}`);
  console.log(`Supabase writes enabled: ${getSupabaseServiceStatus().writesEnabled ? "yes" : "no"}`);
  printWarnings(status.warnings);
}

function printActivationSummary(input: {
  options: CliOptions;
  selectionSources: string[];
  rawItems: IngestionRawItem[];
  ingestionRun: IngestionRunSummary;
  radarItems: UnderstandingRadarItem[];
  understandingRun: UnderstandingRunSummary;
  deepSeekConfigured: boolean;
  mode: "mock" | "live";
  requestedLiveWithoutKey: boolean;
  persistCounts: PersistCounts | null;
  warnings: string[];
}) {
  const counts = statusCounts(input.radarItems.map((item) => item.status));
  const liveAttempted = input.understandingRun.mode === "live" && input.understandingRun.api_call_count > 0;

  console.log("Radar data activation summary");
  console.log(`Ingestion selected sources: ${input.ingestionRun.selected_source_count}`);
  console.log(`Selected source ids: ${input.selectionSources.join(", ") || "none"}`);
  console.log(`Raw items collected: ${input.ingestionRun.raw_item_count}`);
  console.log(`Raw items written locally: ${input.rawItems.length}`);
  console.log(`Understanding mode: ${input.mode}`);
  console.log(`Radar items generated: ${input.radarItems.length}`);
  console.log(`Included: ${counts.included}`);
  console.log(`Needs review: ${counts.needs_review}`);
  console.log(`Excluded: ${counts.excluded}`);
  console.log(`Failed: ${counts.failed}`);
  console.log(`Live DeepSeek attempted: ${liveAttempted ? "yes" : "no"}`);
  console.log(`DeepSeek key present: ${input.deepSeekConfigured ? "yes (redacted)" : "no"}`);
  console.log(`API call count: ${input.understandingRun.api_call_count}`);
  console.log(`Supabase persist attempted: ${input.options.persist ? "yes" : "no"}`);

  if (input.persistCounts) {
    console.log(
      [
        "Supabase persist success counts:",
        `sources=${input.persistCounts.sourceRowsUpserted}`,
        `ingestion_runs=${input.persistCounts.ingestionRunsUpserted}`,
        `raw_items=${input.persistCounts.rawItemRowsUpserted}`,
        `understanding_runs=${input.persistCounts.understandingRunsUpserted}`,
        `radar_items=${input.persistCounts.radarItemRowsUpserted}`,
        `entities=${input.persistCounts.entityRowsUpserted}`,
        `item_entities=${input.persistCounts.itemEntityRowsUpserted}`,
        `scores=${input.persistCounts.scoreRowsUpserted}`,
        `api_usage_logs=${input.persistCounts.apiUsageRowsInserted}`
      ].join(" ")
    );
  } else {
    console.log("Supabase persist success counts: none");
  }

  printWarnings(input.warnings);
  console.log(`Next action: ${nextAction(input)}`);
}

function nextAction(input: {
  options: CliOptions;
  deepSeekConfigured: boolean;
  requestedLiveWithoutKey: boolean;
  persistCounts: PersistCounts | null;
}) {
  if (input.requestedLiveWithoutKey || !input.deepSeekConfigured) {
    return "Add DEEPSEEK_API_KEY to an untracked local/deployment environment, then run npm run data:activate:live.";
  }

  if (!input.options.persist) {
    return "If the live output looks usable, run with temporary ENABLE_SUPABASE_WRITES=true and --persist.";
  }

  if (input.persistCounts) {
    return "Verify product pages with ENABLE_SUPABASE_RETRIEVAL=true in the process environment.";
  }

  return "Review warnings before enabling retrieval.";
}

function printWarnings(warnings: string[]) {
  const cleanWarnings = uniqueMessages(warnings.map(sanitizeLogValue).filter(Boolean));
  if (cleanWarnings.length === 0) {
    console.log("Warnings/caveats: none");
    return;
  }

  console.log("Warnings/caveats:");
  for (const warning of cleanWarnings) {
    console.log(`- ${warning}`);
  }
}

function readJsonArray<T>(filePath: string): T[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${relative(filePath)} must contain a JSON array.`);
  }
  return parsed as T[];
}

function readJsonObject<T>(filePath: string): T {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${relative(filePath)} must contain a JSON object.`);
  }
  return parsed as T;
}

function statusCounts(statuses: UnderstandingStatus[]): StatusCounts {
  const counts = emptyCounts();
  for (const status of statuses) {
    counts[status] += 1;
  }
  return counts;
}

function emptyCounts(): StatusCounts {
  return {
    included: 0,
    needs_review: 0,
    excluded: 0,
    failed: 0
  };
}

function normalizeStatus(value: unknown): UnderstandingStatus {
  if (value === "included" || value === "needs_review" || value === "excluded" || value === "failed") {
    return value;
  }

  return "needs_review";
}

function hasEnvValue(key: string) {
  return Boolean(process.env[key]?.trim());
}

function uniqueMessages(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function relative(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
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
  const message = sanitizeLogValue(error instanceof Error ? error.message : String(error));
  console.error(message);
  process.exit(1);
});
