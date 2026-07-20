import "@/lib/config/load-cli-env";

import { spawnSync } from "node:child_process";
import path from "node:path";

import { DEFAULT_SELECTION_OPTIONS } from "@/lib/ingestion/config";
import { readCleanedSources, selectSources } from "@/lib/ingestion/select-sources";
import { isEnabled } from "@/lib/utils";

type OperatingLoopMode = "dry-run" | "refresh-data";

type CliOptions = {
  mode: OperatingLoopMode;
  live: boolean;
  persist: boolean;
  limit: number;
  maxItemsPerSource: number;
  skipIngest: boolean;
  skipUnderstand: boolean;
  json: boolean;
};

type StageResult = {
  label: string;
  status: "ok" | "failed" | "skipped";
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

type OperatingLoopSummary = {
  run_id: string;
  mode: OperatingLoopMode;
  started_at: string;
  ended_at?: string;
  source_count: number;
  selected_source_count: number;
  raw_item_count: number;
  radar_item_count: number;
  included: number;
  needs_review: number;
  excluded: number;
  failed: number;
  deepseek_api_call_count: number;
  supabase_persist_counts: Record<string, number>;
  supabase_write_attempted: boolean;
  scheduled_job_attempted: false;
  x_wechat_attempted: false;
  warnings: string[];
  errors: string[];
  next_recommended_operator_action: string;
  stages: StageResult[];
};

const tsxCliPath = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const summary = initialSummary(options, startedAt);

  try {
    assertSafeOptions(options);

    if (shouldRunRefresh(options)) {
      const result = runActivation(options);
      summary.stages.push(result);
      applyActivationOutput(summary, result.stdout);

      if (result.status === "failed") {
        summary.errors.push(stageError("refresh-data", result));
      }
    }

  } catch (error) {
    summary.errors.push(sanitizeLogValue(error instanceof Error ? error.message : String(error)));
  } finally {
    summary.ended_at = new Date().toISOString();
    summary.warnings = uniqueMessages(summary.warnings);
    summary.errors = uniqueMessages(summary.errors);
    summary.next_recommended_operator_action = nextAction(summary, options);
    printSummary(summary, options.json);
  }

  if (summary.errors.length > 0) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: "dry-run",
    live: false,
    persist: false,
    limit: 20,
    maxItemsPerSource: 3,
    skipIngest: false,
    skipUnderstand: false,
    json: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--mode":
        options.mode = readMode(readArg(args, index));
        index += 1;
        break;
      case "--live":
        options.live = true;
        break;
      case "--persist":
        options.persist = true;
        break;
      case "--limit":
        options.limit = readPositiveNumber(args, index);
        index += 1;
        break;
      case "--max-items-per-source":
        options.maxItemsPerSource = readPositiveNumber(args, index);
        index += 1;
        break;
      case "--skip-ingest":
        options.skipIngest = true;
        break;
      case "--skip-understand":
        options.skipUnderstand = true;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function assertSafeOptions(options: CliOptions) {
  if (options.mode === "dry-run" && options.persist) {
    throw new Error("--mode dry-run cannot be combined with --persist. Use --mode refresh-data for controlled writes.");
  }

  if (options.persist && !isEnabled(process.env.ENABLE_SUPABASE_WRITES)) {
    throw new Error("Supabase writes require ENABLE_SUPABASE_WRITES=true before the operating loop starts. No writes were attempted.");
  }
}

function shouldRunRefresh(options: CliOptions) {
  return options.mode === "dry-run" || options.mode === "refresh-data";
}

function runActivation(options: CliOptions): StageResult {
  const args = [
    "scripts/activate-radar-data.ts",
    "--limit",
    String(options.limit),
    "--max-items-per-source",
    String(options.maxItemsPerSource)
  ];

  if (options.live) {
    args.push("--live");
  }

  if (options.persist) {
    args.push("--persist");
  }

  if (options.skipIngest) {
    args.push("--skip-ingest");
  }

  if (options.skipUnderstand) {
    args.push("--skip-understand");
  }

  return runStage("refresh-data", args);
}

function runStage(label: string, args: string[]): StageResult {
  const result = spawnSync(process.execPath, [tsxCliPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    windowsHide: true
  });

  const spawnError = result.error ? sanitizeLogValue(result.error.message) : "";

  return {
    label,
    status: result.status === 0 ? "ok" : "failed",
    stdout: sanitizeLogValue(result.stdout ?? ""),
    stderr: sanitizeLogValue([spawnError, result.stderr ?? ""].filter(Boolean).join("\n")),
    exitCode: result.status
  };
}

function initialSummary(options: CliOptions, startedAt: string): OperatingLoopSummary {
  const sources = readCleanedSources();
  const selection = selectSources({
    limit: options.limit,
    method: DEFAULT_SELECTION_OPTIONS.method,
    maxItemsPerSource: options.maxItemsPerSource
  });

  return {
    run_id: `ops_${options.mode}_${timestampForId(startedAt)}`,
    mode: options.mode,
    started_at: startedAt,
    source_count: sources.length,
    selected_source_count: selection.sources.length,
    raw_item_count: 0,
    radar_item_count: 0,
    included: 0,
    needs_review: 0,
    excluded: 0,
    failed: 0,
    deepseek_api_call_count: 0,
    supabase_persist_counts: {},
    supabase_write_attempted: options.persist,
    scheduled_job_attempted: false,
    x_wechat_attempted: false,
    warnings: selection.warnings.map(sanitizeLogValue),
    errors: [],
    next_recommended_operator_action: "Review the operating-loop summary.",
    stages: []
  };
}

function applyActivationOutput(summary: OperatingLoopSummary, stdout: string) {
  summary.selected_source_count = numberAfter(stdout, "Ingestion selected sources:", summary.selected_source_count);
  summary.raw_item_count = numberAfter(stdout, "Raw items collected:", summary.raw_item_count);
  summary.radar_item_count = numberAfter(stdout, "Radar items generated:", summary.radar_item_count);
  summary.included = numberAfter(stdout, "Included:", summary.included);
  summary.needs_review = numberAfter(stdout, "Needs review:", summary.needs_review);
  summary.excluded = numberAfter(stdout, "Excluded:", summary.excluded);
  summary.failed = numberAfter(stdout, "Failed:", summary.failed);
  summary.deepseek_api_call_count += numberAfter(stdout, "API call count:", 0);
  Object.assign(summary.supabase_persist_counts, countsAfter(stdout, "Supabase persist success counts:"));
  summary.warnings.push(...warningsFromOutput(stdout));
}

function numberAfter(output: string, label: string, fallback: number) {
  const line = output.split(/\r?\n/).find((value) => value.trim().startsWith(label));
  if (!line) {
    return fallback;
  }

  const value = Number(line.slice(label.length).trim().match(/^-?\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(value) ? value : fallback;
}

function countsAfter(output: string, label: string) {
  const line = output.split(/\r?\n/).find((value) => value.trim().startsWith(label));
  if (!line) {
    return {};
  }

  const counts: Record<string, number> = {};
  for (const match of line.slice(label.length).matchAll(/([a-z_]+)=(-?\d+)/g)) {
    counts[match[1]] = Number(match[2]);
  }

  return counts;
}

function warningsFromOutput(output: string) {
  const lines = output.split(/\r?\n/);
  const warnings: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === "Warnings/caveats:" || line === "Caveats:") {
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const warning = lines[cursor].trim();
        if (!warning.startsWith("- ")) {
          break;
        }
        warnings.push(warning.slice(2));
      }
    }
  }

  return warnings;
}

function stageError(label: string, result: StageResult) {
  const detail = result.stderr || result.stdout || `exit code ${result.exitCode ?? "unknown"}`;
  return `${label} failed: ${detail.slice(0, 900)}`;
}

function nextAction(summary: OperatingLoopSummary, options: CliOptions) {
  if (summary.errors.length > 0) {
    return "Resolve the listed errors, then rerun npm run ops:dry-run before attempting any write-gated command.";
  }

  if (!options.persist) {
    return "Review data quality, then use npm run ops:refresh:live or a temporary ENABLE_SUPABASE_WRITES=true refresh command if persistence is approved.";
  }

  return "Open /admin/ingestion for current operating-loop state and exact safe commands.";
}

function printSummary(summary: OperatingLoopSummary, json: boolean) {
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("Operating loop summary");
  console.log(`Run ID: ${summary.run_id}`);
  console.log(`Mode: ${summary.mode}`);
  console.log(`Started: ${summary.started_at}`);
  console.log(`Ended: ${summary.ended_at ?? "not finished"}`);
  console.log(`Sources: ${summary.source_count}; selected: ${summary.selected_source_count}`);
  console.log(`Raw items: ${summary.raw_item_count}`);
  console.log(`Radar items: ${summary.radar_item_count}`);
  console.log(`Included: ${summary.included}`);
  console.log(`Needs review: ${summary.needs_review}`);
  console.log(`Excluded: ${summary.excluded}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`DeepSeek API calls: ${summary.deepseek_api_call_count}`);
  console.log(`Supabase persistence counts: ${formatCounts(summary.supabase_persist_counts)}`);
  console.log(`Supabase write attempted: ${summary.supabase_write_attempted ? "yes" : "no"}`);
  console.log("Scheduled job attempted: false");
  console.log("X/WeChat attempted: false");
  printList("Warnings", summary.warnings);
  printList("Errors", summary.errors);
  console.log(`Next action: ${summary.next_recommended_operator_action}`);
}

function formatCounts(counts: Record<string, number>) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([key, value]) => `${key}=${value}`).join(" ");
}

function printList(label: string, values: string[]) {
  if (values.length === 0) {
    console.log(`${label}: none`);
    return;
  }

  console.log(`${label}:`);
  for (const value of values) {
    console.log(`- ${value}`);
  }
}

function readArg(args: string[], index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${args[index]} requires a value.`);
  }
  return value;
}

function readMode(value: string): OperatingLoopMode {
  if (value === "dry-run" || value === "refresh-data") {
    return value;
  }

  throw new Error("--mode must be dry-run or refresh-data.");
}

function readPositiveNumber(args: string[], index: number) {
  const value = readArg(args, index);
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 1) {
    throw new Error(`${args[index]} must be a positive number.`);
  }

  return Math.floor(numberValue);
}

function timestampForId(value: string) {
  return value.replace(/[-:.]/g, "").replace("T", "_").replace("Z", "Z");
}

function uniqueMessages(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sanitizeLogValue(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/g, "[github-token-redacted]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/gi, "[github-token-redacted]")
    .replace(/\b(DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|X_BEARER_TOKEN|WECHAT_APP_SECRET)\s*=\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

main().catch((error) => {
  console.error(sanitizeLogValue(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
