import "@/lib/config/load-cli-env";

import fs from "node:fs";
import path from "node:path";

import { runIngestion } from "@/lib/ingestion/run";
import type { CrawlMethodFilter, RunStatus } from "@/lib/ingestion/types";
import { runUnderstanding } from "@/lib/understanding/run";
import type { UnderstandingMode, UnderstandingRunStatus } from "@/lib/understanding/types";

type ScheduledMode = "hourly-dry-run";

type ModeConfig = {
  ingestion: {
    limit: number;
    method: CrawlMethodFilter;
    maxItemsPerSource: number;
  };
  understandingLimit: number;
  maxTextChars: number;
};

type ScheduledRunSummary = {
  run_id: string;
  mode: ScheduledMode;
  started_at: string;
  ended_at?: string;
  ingestion_status: RunStatus | "not_started" | "error";
  raw_item_count: number;
  understanding_status: UnderstandingRunStatus | "not_started" | "error";
  radar_item_count: number;
  ingestion: {
    selected_source_count: number;
    item_count: number;
    duplicate_count: number;
    skipped_count: number;
    error_count: number;
    output_files?: {
      latest_raw_items: string;
      latest_run: string;
    };
  };
  understanding: {
    mode: UnderstandingMode | "not_started";
    processed_count: number;
    included_count: number;
    needs_review_count: number;
    excluded_count: number;
    failed_count: number;
    api_call_count: number;
  };
  warnings: string[];
  errors: string[];
  write_attempted: false;
  live_deepseek_attempted: false;
  source_health_write_attempted: false;
};

const modeConfigs: Record<ScheduledMode, ModeConfig> = {
  "hourly-dry-run": {
    ingestion: {
      limit: 3,
      method: "all",
      maxItemsPerSource: 3
    },
    understandingLimit: 9,
    maxTextChars: 6000
  }
};

const scheduledDir = path.join(process.cwd(), "data", "scheduled");
const latestDir = path.join(scheduledDir, "latest");
const runsDir = path.join(scheduledDir, "runs");
const disabledJobFlags = [
  "ENABLE_SUPABASE_WRITES",
  "ENABLE_SUPABASE_RETRIEVAL",
  "ENABLE_SCHEDULED_PERSISTENCE",
  "ENABLE_LIVE_DEEPSEEK_IN_JOBS",
  "ENABLE_X_API",
  "ENABLE_WECHAT_AUTH"
] as const;

async function main() {
  const mode = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const summary = initialSummary(mode, startedAt);
  let hardFailure = false;

  try {
    enforceDryRunEnvironment(summary.warnings);
    console.log(`[scheduled] Starting ${mode} (${summary.run_id}).`);

    const config = modeConfigs[mode];
    const ingestion = await runIngestion(config.ingestion);
    summary.ingestion_status = ingestion.run.status;
    summary.raw_item_count = ingestion.run.raw_item_count;
    summary.ingestion = {
      selected_source_count: ingestion.run.selected_source_count,
      item_count: ingestion.run.item_count,
      duplicate_count: ingestion.run.duplicate_count,
      skipped_count: ingestion.run.skipped_count,
      error_count: ingestion.run.error_count,
      output_files: {
        latest_raw_items: ingestion.run.output_files.latest_raw_items,
        latest_run: ingestion.run.output_files.latest_run
      }
    };
    summary.warnings.push(...ingestion.run.warnings.map(sanitizeLogValue));
    summary.errors.push(...ingestion.run.source_results.map((result) => result.error_message).filter(isNonEmptyString).map(sanitizeLogValue));

    const understanding = await runUnderstanding({
      inputPath: ingestion.run.output_files.latest_raw_items,
      limit: config.understandingLimit,
      mode: "mock",
      maxTextChars: config.maxTextChars,
      dryRun: true
    });

    summary.understanding_status = understanding.run.status;
    summary.radar_item_count = understanding.radarItems.length;
    summary.understanding = {
      mode: understanding.run.mode,
      processed_count: understanding.run.processed_count,
      included_count: understanding.run.included_count,
      needs_review_count: understanding.run.needs_review_count,
      excluded_count: understanding.run.excluded_count,
      failed_count: understanding.run.failed_count,
      api_call_count: understanding.run.api_call_count
    };
    summary.warnings.push(...understanding.run.warnings.map(sanitizeLogValue));
    summary.errors.push(...understanding.run.errors.map(sanitizeLogValue));

    if (understanding.run.mode !== "mock" || understanding.run.api_call_count > 0) {
      hardFailure = true;
      summary.errors.push("Scheduled understanding must remain mock-only and record zero API calls.");
    }
  } catch (error) {
    hardFailure = true;
    summary.errors.push(sanitizeLogValue(error instanceof Error ? error.message : String(error)));

    if (summary.ingestion_status === "not_started") {
      summary.ingestion_status = "error";
    }

    if (summary.understanding_status === "not_started") {
      summary.understanding_status = "error";
    }
  } finally {
    summary.ended_at = new Date().toISOString();
    writeSummary(summary);
    console.log(
      `[scheduled] Completed ${summary.run_id}: ingestion=${summary.ingestion_status}, raw_items=${summary.raw_item_count}, understanding=${summary.understanding_status}, radar_items=${summary.radar_item_count}.`
    );
    console.log("[scheduled] Summary artifact: data/scheduled/latest/scheduled-run.json");
  }

  if (hardFailure) {
    process.exitCode = 1;
  }
}

function initialSummary(mode: ScheduledMode, startedAt: string): ScheduledRunSummary {
  return {
    run_id: `scheduled_${mode}_${timestampForId(startedAt)}`,
    mode,
    started_at: startedAt,
    ingestion_status: "not_started",
    raw_item_count: 0,
    understanding_status: "not_started",
    radar_item_count: 0,
    ingestion: {
      selected_source_count: 0,
      item_count: 0,
      duplicate_count: 0,
      skipped_count: 0,
      error_count: 0
    },
    understanding: {
      mode: "not_started",
      processed_count: 0,
      included_count: 0,
      needs_review_count: 0,
      excluded_count: 0,
      failed_count: 0,
      api_call_count: 0
    },
    warnings: [],
    errors: [],
    write_attempted: false,
    live_deepseek_attempted: false,
    source_health_write_attempted: false
  };
}

function parseArgs(args: string[]): ScheduledMode {
  let mode: ScheduledMode | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--mode":
        mode = readMode(args, index);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!mode) {
    throw new Error("--mode is required. Use hourly-dry-run.");
  }

  return mode;
}

function readMode(args: string[], index: number): ScheduledMode {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error("--mode requires a value.");
  }

  if (value !== "hourly-dry-run") {
    throw new Error("--mode must be hourly-dry-run.");
  }

  return value;
}

function enforceDryRunEnvironment(warnings: string[]) {
  for (const flag of disabledJobFlags) {
    if (isEnabled(process.env[flag])) {
      warnings.push(`${flag} was forced false for this scheduled dry-run job.`);
    }

    process.env[flag] = "false";
  }

  if (process.env.DEEPSEEK_API_KEY?.trim()) {
    warnings.push("DEEPSEEK_API_KEY was present but ignored for scheduled mock understanding.");
    process.env.DEEPSEEK_API_KEY = "";
  }
}

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function writeSummary(summary: ScheduledRunSummary) {
  fs.mkdirSync(latestDir, { recursive: true });
  fs.mkdirSync(runsDir, { recursive: true });

  const text = `${JSON.stringify(summary, null, 2)}\n`;
  fs.writeFileSync(path.join(latestDir, "scheduled-run.json"), text);
  fs.writeFileSync(path.join(runsDir, `${summary.run_id}.json`), text);
}

function timestampForId(value: string) {
  return value.replace(/[-:.]/g, "").replace("T", "_").replace("Z", "Z");
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function sanitizeLogValue(value: string) {
  return value
    .replace(/\b(DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|X_BEARER_TOKEN|WECHAT_APP_SECRET)\s*=\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .slice(0, 500);
}

main().catch((error) => {
  const message = sanitizeLogValue(error instanceof Error ? error.message : String(error));
  console.error(message);
  process.exit(1);
});
