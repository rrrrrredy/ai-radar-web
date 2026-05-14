import { readCleanedSources } from "@/lib/ingestion/select-sources";
import { getSupabaseServiceClientForWrite } from "@/lib/supabase/service";
import { countBy, sourceUpsertRows, upsertRows } from "@/lib/supabase/persistence";

type CliOptions = {
  write: boolean;
  limit?: number;
  sourceId?: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const allSources = readCleanedSources();
  const sources = allSources
    .filter((source) => (options.sourceId ? source.id === options.sourceId : true))
    .slice(0, options.limit ?? allSources.length);
  const rows = sourceUpsertRows(sources);

  printSummary(options, allSources.length, sources);

  if (!options.write) {
    console.log("Dry run only. No Supabase writes were attempted.");
    return;
  }

  const supabase = getSupabaseServiceClientForWrite();
  const affected = await upsertRows(supabase, "sources", rows, "slug");
  console.log(`Supabase source rows upserted: ${affected}`);
}

function printSummary(options: CliOptions, registryCount: number, sources: ReturnType<typeof readCleanedSources>) {
  console.log(`Supabase source import mode: ${options.write ? "write" : "dry-run"}`);
  console.log(`Registry sources available: ${registryCount}`);
  console.log(`Sources selected: ${sources.length}`);
  console.log(`By status: ${formatCounts(countBy(sources, (source) => source.status))}`);
  console.log(`By crawl method: ${formatCounts(countBy(sources, (source) => source.crawl_method))}`);
  console.log(`Rows that would be upserted by slug: ${sources.length}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    write: false
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
      case "--limit":
        options.limit = readPositiveNumber(args, index);
        index += 1;
        break;
      case "--source":
        options.sourceId = readStringArg(args, index);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readStringArg(args: string[], index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${args[index]}`);
  }
  return value;
}

function readPositiveNumber(args: string[], index: number) {
  const value = Number(readStringArg(args, index));
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${args[index]} must be a positive number.`);
  }
  return Math.floor(value);
}

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
