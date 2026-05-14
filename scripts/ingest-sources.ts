import "@/lib/config/load-cli-env";

import { DEFAULT_SELECTION_OPTIONS, CRAWL_METHOD_FILTERS } from "@/lib/ingestion/config";
import { runIngestion } from "@/lib/ingestion/run";
import { selectSources } from "@/lib/ingestion/select-sources";
import type { CrawlMethodFilter, SourceSelectionOptions } from "@/lib/ingestion/types";

type CliOptions = SourceSelectionOptions & {
  dryRun: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.dryRun) {
    const selection = selectSources(options);
    console.log(`Selected ${selection.sources.length} sources (${selection.eligibleSourceCount} eligible of ${selection.totalRegistrySources}).`);
    selection.sources.forEach((source) => {
      console.log(`- ${source.id} | ${source.crawl_method} | ${source.name} | ${source.url}`);
    });
    selection.warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
    return;
  }

  const result = await runIngestion(options);
  const run = result.run;
  console.log(`Run ${run.id}: ${run.status}`);
  console.log(`Sources fetched: ${run.selected_source_count}`);
  console.log(`Raw items collected: ${run.raw_item_count}`);
  console.log(`Duplicates: ${run.duplicate_count}`);
  console.log(`Skipped: ${run.skipped_count}`);
  console.log(`Errors: ${run.error_count}`);
  console.log(`Latest raw items: ${run.output_files.latest_raw_items}`);
  console.log(`Latest run summary: ${run.output_files.latest_run}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    ...DEFAULT_SELECTION_OPTIONS,
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--limit":
        options.limit = readNumberArg(args, index);
        index += 1;
        break;
      case "--method":
        options.method = readMethodArg(args, index);
        index += 1;
        break;
      case "--source":
        options.sourceId = readStringArg(args, index);
        index += 1;
        break;
      case "--max-items-per-source":
        options.maxItemsPerSource = readNumberArg(args, index);
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

function readNumberArg(args: string[], index: number) {
  const value = Number(readStringArg(args, index));
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${args[index]} must be a positive number.`);
  }
  return Math.floor(value);
}

function readMethodArg(args: string[], index: number): CrawlMethodFilter {
  const value = readStringArg(args, index);
  if (!CRAWL_METHOD_FILTERS.includes(value as CrawlMethodFilter)) {
    throw new Error(`--method must be one of: ${CRAWL_METHOD_FILTERS.join(", ")}`);
  }
  return value as CrawlMethodFilter;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
