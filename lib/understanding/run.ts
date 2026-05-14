import fs from "node:fs";
import path from "node:path";

import {
  buildUnderstandingConfig,
  relativePath,
  UNDERSTANDING_LATEST_DIR,
  UNDERSTANDING_RUNS_DIR,
  type UnderstandingConfigInput
} from "@/lib/understanding/config";
import { UnderstandingLogger } from "@/lib/understanding/logger";
import { transformRawItemToRadarItem } from "@/lib/understanding/transform";
import type {
  RadarCategory,
  UnderstandingConfig,
  UnderstandingRadarItem,
  UnderstandingRunResult,
  UnderstandingRunStatus,
  UnderstandingRunSummary
} from "@/lib/understanding/types";

export async function runUnderstanding(input: UnderstandingConfigInput = {}): Promise<UnderstandingRunResult> {
  const config = buildUnderstandingConfig(input);
  const logger = new UnderstandingLogger();
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const runId = buildRunId(startedAt);
  const rawItems = loadRawItems(config.inputPath);
  const selectedItems = rawItems.slice(0, config.limit);

  if (rawItems.length > config.limit) {
    logger.warn(`Input contains ${rawItems.length} items; processing first ${config.limit}.`);
  }

  logger.info(`Understanding ${selectedItems.length} raw items in ${config.mode} mode.`);

  const radarItems: UnderstandingRadarItem[] = [];
  for (const rawItem of selectedItems) {
    const radarItem = await transformRawItemToRadarItem(rawItem, config);
    radarItems.push(radarItem);

    if (radarItem.status === "failed") {
      logger.error(`${radarItem.raw_item_id}: ${radarItem.model_metadata.error ?? "understanding failed"}`);
    }
  }

  const endedAt = new Date().toISOString();
  const outputFiles = outputFilePaths(config, runId);
  const summary = buildSummary({
    runId,
    startedAt,
    endedAt,
    durationMs: Date.now() - started,
    config,
    rawItemCount: rawItems.length,
    radarItems,
    warnings: logger.warnings(),
    errors: logger.errors(),
    outputFiles
  });

  if (!config.dryRun) {
    writeOutputs(radarItems, summary, outputFiles.absolute);
    logger.info(`Wrote ${radarItems.length} radar items and run summary for ${runId}.`);
  } else {
    logger.info("Dry run enabled; no understanding outputs were written.");
  }

  return {
    radarItems,
    run: summary
  };
}

export function loadRawItems(inputPath: string): unknown[] {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input raw items file does not exist: ${relativePath(inputPath)}`);
  }

  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Input raw items file must contain a JSON array: ${relativePath(inputPath)}`);
  }

  return parsed;
}

function buildSummary(input: {
  runId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  config: UnderstandingConfig;
  rawItemCount: number;
  radarItems: UnderstandingRadarItem[];
  warnings: string[];
  errors: string[];
  outputFiles: ReturnType<typeof outputFilePaths>;
}): UnderstandingRunSummary {
  const includedCount = input.radarItems.filter((item) => item.status === "included").length;
  const excludedCount = input.radarItems.filter((item) => item.status === "excluded").length;
  const needsReviewCount = input.radarItems.filter((item) => item.status === "needs_review").length;
  const failedCount = input.radarItems.filter((item) => item.status === "failed").length;
  const categoriesCount = countCategories(input.radarItems);
  const entitiesCount = input.radarItems.reduce((sum, item) => sum + item.entities.length, 0);
  const apiCallCount = input.radarItems.reduce((sum, item) => sum + (item.model_metadata.api_call_count ?? 0), 0);
  const estimatedTokenCount = input.radarItems.reduce((sum, item) => sum + (item.model_metadata.estimated_token_count ?? 0), 0);
  const status = summaryStatus(input.radarItems.length, failedCount, input.errors.length);

  return {
    run_id: input.runId,
    started_at: input.startedAt,
    ended_at: input.endedAt,
    duration_ms: input.durationMs,
    mode: input.config.mode,
    input_path: relativePath(input.config.inputPath),
    output_path: relativePath(input.config.latestRadarItemsPath),
    raw_item_count: input.rawItemCount,
    processed_count: input.radarItems.length,
    included_count: includedCount,
    excluded_count: excludedCount,
    needs_review_count: needsReviewCount,
    failed_count: failedCount,
    categories_count: categoriesCount,
    entities_count: entitiesCount,
    api_call_count: apiCallCount,
    estimated_token_count: estimatedTokenCount || undefined,
    warnings: input.warnings,
    errors: input.errors,
    status,
    output_files: input.outputFiles.relative
  };
}

function writeOutputs(
  radarItems: UnderstandingRadarItem[],
  summary: UnderstandingRunSummary,
  files: ReturnType<typeof outputFilePaths>["absolute"]
) {
  fs.mkdirSync(UNDERSTANDING_LATEST_DIR, { recursive: true });
  fs.mkdirSync(UNDERSTANDING_RUNS_DIR, { recursive: true });
  fs.writeFileSync(files.latest_radar_items, `${JSON.stringify(radarItems, null, 2)}\n`);
  fs.writeFileSync(files.latest_run, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(files.run_radar_items, `${JSON.stringify(radarItems, null, 2)}\n`);
  fs.writeFileSync(files.run_summary, `${JSON.stringify(summary, null, 2)}\n`);
}

function outputFilePaths(config: UnderstandingConfig, runId: string) {
  const absolute = {
    latest_radar_items: config.latestRadarItemsPath,
    latest_run: config.latestRunPath,
    run_radar_items: path.join(config.runsDir, `${runId}.radar-items.json`),
    run_summary: path.join(config.runsDir, `${runId}.understanding-run.json`)
  };

  return {
    absolute,
    relative: {
      latest_radar_items: relativePath(absolute.latest_radar_items),
      latest_run: relativePath(absolute.latest_run),
      run_radar_items: relativePath(absolute.run_radar_items),
      run_summary: relativePath(absolute.run_summary)
    }
  };
}

function countCategories(items: UnderstandingRadarItem[]) {
  const counts: Partial<Record<RadarCategory, number>> = {};
  for (const item of items) {
    for (const category of item.categories) {
      counts[category] = (counts[category] ?? 0) + 1;
    }
  }

  return counts;
}

function summaryStatus(processedCount: number, failedCount: number, errorCount: number): UnderstandingRunStatus {
  if (processedCount === 0 || failedCount === processedCount) {
    return "failed";
  }

  if (failedCount > 0 || errorCount > 0) {
    return "partial";
  }

  return "success";
}

function buildRunId(startedAt: string) {
  return `run_${startedAt.replace(/[-:.]/g, "").replace("T", "_").replace("Z", "Z")}`;
}
