import {
  buildUnderstandingConfig,
  DEFAULT_UNDERSTANDING_INPUT,
  DEFAULT_PROMPT_VERSION,
  UNDERSTANDING_LIMITS,
  relativePath
} from "@/lib/understanding/config";
import { loadRawItems, runUnderstanding } from "@/lib/understanding/run";
import type { UnderstandingMode } from "@/lib/understanding/types";

type CliOptions = {
  inputPath: string;
  limit: number;
  mode: UnderstandingMode;
  maxTextChars: number;
  promptVersion: string;
  dryRun: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = buildUnderstandingConfig(options);

  if (options.dryRun) {
    const rawItems = loadRawItems(config.inputPath);
    const selectedCount = Math.min(rawItems.length, config.limit);
    console.log(`Understanding dry run: ${selectedCount} of ${rawItems.length} raw items would be processed.`);
    console.log(`Mode: ${config.mode}`);
    console.log(`Input: ${relativePath(config.inputPath)}`);
    console.log(`Output: ${relativePath(config.latestRadarItemsPath)}`);
    console.log(`Fast model: ${config.fastModel}`);
    console.log(`Smart model: ${config.smartModel}`);
    console.log(`Prompt version: ${config.promptVersion}`);
    return;
  }

  const result = await runUnderstanding(options);
  const run = result.run;
  console.log(`Run ${run.run_id}: ${run.status}`);
  console.log(`Mode: ${run.mode}`);
  console.log(`Raw items available: ${run.raw_item_count}`);
  console.log(`Processed: ${run.processed_count}`);
  console.log(`Included: ${run.included_count}`);
  console.log(`Needs review: ${run.needs_review_count}`);
  console.log(`Excluded: ${run.excluded_count}`);
  console.log(`Failed: ${run.failed_count}`);
  console.log(`API calls: ${run.api_call_count}`);
  console.log(`Latest radar items: ${run.output_files.latest_radar_items}`);
  console.log(`Latest run summary: ${run.output_files.latest_run}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: DEFAULT_UNDERSTANDING_INPUT,
    limit: UNDERSTANDING_LIMITS.defaultLimit,
    mode: "mock",
    maxTextChars: UNDERSTANDING_LIMITS.defaultMaxTextChars,
    promptVersion: DEFAULT_PROMPT_VERSION,
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--input":
        options.inputPath = readStringArg(args, index);
        index += 1;
        break;
      case "--limit":
        options.limit = readNumberArg(args, index);
        index += 1;
        break;
      case "--mode":
        options.mode = readModeArg(args, index);
        index += 1;
        break;
      case "--max-text-chars":
        options.maxTextChars = readNumberArg(args, index);
        index += 1;
        break;
      case "--prompt-version":
        options.promptVersion = readStringArg(args, index);
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

function readModeArg(args: string[], index: number): UnderstandingMode {
  const value = readStringArg(args, index);
  if (value !== "mock" && value !== "live") {
    throw new Error("--mode must be mock or live.");
  }

  return value;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
