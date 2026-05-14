import "@/lib/config/load-cli-env";

import fs from "node:fs";
import path from "node:path";

import type { IngestionRawItem, IngestionRunSummary } from "@/lib/ingestion/types";
import { getSupabaseServiceClientForWrite } from "@/lib/supabase/service";
import {
  countBy,
  ingestionRunRow,
  loadSourceIds,
  rawItemRows,
  uniqueStrings,
  upsertRows
} from "@/lib/supabase/persistence";

const defaultRawItemsPath = path.join(process.cwd(), "data", "ingestion", "latest", "raw-items.json");
const defaultRunPath = path.join(process.cwd(), "data", "ingestion", "latest", "ingestion-run.json");

type CliOptions = {
  write: boolean;
  rawItemsPath: string;
  runPath: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rawItems = readJsonArray<IngestionRawItem>(options.rawItemsPath);
  const run = readJsonObject<IngestionRunSummary>(options.runPath);
  const sourceSlugs = uniqueStrings(rawItems.map((item) => item.source_id));

  printSummary(options, rawItems, run, sourceSlugs.length);

  if (!options.write) {
    console.log("Dry run only. No Supabase writes were attempted.");
    return;
  }

  const supabase = getSupabaseServiceClientForWrite();
  const sourceIds = await loadSourceIds(supabase, sourceSlugs);
  const missingSources = sourceSlugs.filter((slug) => !sourceIds.has(slug));
  if (missingSources.length > 0) {
    throw new Error(`Import sources before persisting ingestion. Missing source slugs: ${missingSources.join(", ")}`);
  }

  const { data, error } = await supabase
    .from("ingestion_runs")
    .upsert(ingestionRunRow(run), { onConflict: "local_run_id" })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to upsert ingestion run: ${error.message}`);
  }

  const persistedRun = data as { id: string } | null;
  if (!persistedRun) {
    throw new Error("Supabase did not return the persisted ingestion run id.");
  }

  const affected = await upsertRows(supabase, "raw_items", rawItemRows(rawItems, sourceIds, persistedRun.id), "local_id");
  console.log(`Supabase raw item rows upserted: ${affected}`);
}

function printSummary(options: CliOptions, rawItems: IngestionRawItem[], run: IngestionRunSummary, sourceCount: number) {
  console.log(`Supabase ingestion persistence mode: ${options.write ? "write" : "dry-run"}`);
  console.log(`Run: ${run.id} (${run.status})`);
  console.log(`Input raw items: ${rawItems.length}`);
  console.log(`Unique source slugs required: ${sourceCount}`);
  console.log(`By raw item status: ${formatCounts(countBy(rawItems, (item) => item.status))}`);
  console.log(`Rows that would be upserted: ingestion_runs=1, raw_items=${rawItems.length}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    write: false,
    rawItemsPath: defaultRawItemsPath,
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
      case "--raw-items":
        options.rawItemsPath = path.resolve(readStringArg(args, index));
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
