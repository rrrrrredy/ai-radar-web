import fs from "node:fs";
import path from "node:path";

import type { UnderstandingRadarItem, UnderstandingRunSummary } from "@/lib/understanding/types";
import { getSupabaseServiceClientForWrite } from "@/lib/supabase/service";
import {
  countBy,
  entityKey,
  loadLocalIds,
  loadSourceIds,
  radarItemRows,
  understandingRunRow,
  uniqueStrings,
  upsertRows,
  type EntityIdRow
} from "@/lib/supabase/persistence";

const defaultRadarItemsPath = path.join(process.cwd(), "data", "understanding", "latest", "radar-items.json");
const defaultRunPath = path.join(process.cwd(), "data", "understanding", "latest", "understanding-run.json");

type CliOptions = {
  write: boolean;
  radarItemsPath: string;
  runPath: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const radarItems = readJsonArray<UnderstandingRadarItem>(options.radarItemsPath);
  const run = readJsonObject<UnderstandingRunSummary>(options.runPath);
  const sourceSlugs = uniqueStrings(radarItems.map((item) => item.source_id));
  const rawLocalIds = uniqueStrings(radarItems.map((item) => item.raw_item_id));

  printSummary(options, radarItems, run, sourceSlugs.length, rawLocalIds.length);

  if (!options.write) {
    console.log("Dry run only. No Supabase writes were attempted.");
    return;
  }

  const supabase = getSupabaseServiceClientForWrite();
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

  const radarRows = radarItemRows(radarItems, sourceIds, rawItemIds, persistedRun.id);
  await upsertRows(supabase, "radar_items", radarRows, "local_id");
  const radarIds = await loadLocalIds(supabase, "radar_items", radarItems.map((item) => item.id));
  const entityIds = await upsertEntities(supabase, radarItems);
  await upsertItemEntities(supabase, radarItems, radarIds, entityIds);
  await upsertScoreRows(supabase, radarItems, radarIds);
  await insertApiUsageIfNeeded(supabase, run);

  console.log(`Supabase radar item rows upserted: ${radarRows.length}`);
}

function printSummary(
  options: CliOptions,
  radarItems: UnderstandingRadarItem[],
  run: UnderstandingRunSummary,
  sourceCount: number,
  rawCount: number
) {
  const entityCount = radarItems.reduce((sum, item) => sum + item.entities.length, 0);
  const scoreCount = radarItems.length * scoreTypes.length;

  console.log(`Supabase understanding persistence mode: ${options.write ? "write" : "dry-run"}`);
  console.log(`Run: ${run.run_id} (${run.status}, ${run.mode})`);
  console.log(`Input radar items: ${radarItems.length}`);
  console.log(`Unique source slugs required: ${sourceCount}`);
  console.log(`Unique raw item local ids required: ${rawCount}`);
  console.log(`By understanding status: ${formatCounts(countBy(radarItems, (item) => item.status))}`);
  console.log(`Rows that would be upserted: understanding_runs=1, radar_items=${radarItems.length}, item_entities=${entityCount}, scores=${scoreCount}`);
  console.log(`API usage log rows that would be inserted: ${run.api_call_count > 0 ? 1 : 0}`);
}

async function upsertEntities(supabase: ReturnType<typeof getSupabaseServiceClientForWrite>, radarItems: UnderstandingRadarItem[]) {
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
            source: "phase5_understanding"
          }
        });
      }
    }
  }

  if (entityRows.size === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("entities")
    .upsert(Array.from(entityRows.values()), { onConflict: "entity_key" })
    .select("id, entity_key");

  if (error) {
    throw new Error(`Unable to upsert entities: ${error.message}`);
  }

  const rows = (data ?? []) as EntityIdRow[];
  return new Map(rows.map((row) => [row.entity_key, row.id]));
}

async function upsertItemEntities(
  supabase: ReturnType<typeof getSupabaseServiceClientForWrite>,
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

  if (rows.length > 0) {
    await upsertRows(supabase, "item_entities", rows, "radar_item_id,entity_id,relationship");
  }
}

async function upsertScoreRows(
  supabase: ReturnType<typeof getSupabaseServiceClientForWrite>,
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

  await upsertRows(supabase, "scores", rows, "local_score_key");
}

async function insertApiUsageIfNeeded(
  supabase: ReturnType<typeof getSupabaseServiceClientForWrite>,
  run: UnderstandingRunSummary
) {
  if (run.api_call_count <= 0) {
    return;
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
}

const scoreTypes = ["ai_relevance", "importance", "credibility", "novelty", "freshness", "overall", "source_weight"] as const;

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

function runForPersistence(run: UnderstandingRunSummary) {
  return {
    ...run,
    categories_count: run.categories_count as Record<string, number>,
    output_files: run.output_files as Record<string, string | undefined>
  };
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    write: false,
    radarItemsPath: defaultRadarItemsPath,
    runPath: defaultRunPath
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--write":
        options.write = true;
        break;
      case "--dry-run":
        options.write = false;
        break;
      case "--radar-items":
        options.radarItemsPath = path.resolve(readStringArg(args, index));
        index += 1;
        break;
      case "--run":
        options.runPath = path.resolve(readStringArg(args, index));
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
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

function readStringArg(args: string[], index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${args[index]}`);
  }
  return value;
}

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function relative(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
