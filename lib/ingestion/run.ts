import fs from "node:fs";
import path from "node:path";

import {
  createFetchCacheStats,
  DEFAULT_SELECTION_OPTIONS,
  INGESTION_LATEST_DIR,
  INGESTION_RUNS_DIR
} from "@/lib/ingestion/config";
import { dedupeRawItems } from "@/lib/ingestion/dedupe";
import { fetchGithubSource } from "@/lib/ingestion/fetchers/github";
import { fetchHtmlSource } from "@/lib/ingestion/fetchers/html";
import { fetchPodcastSource } from "@/lib/ingestion/fetchers/podcast";
import { fetchRssSource } from "@/lib/ingestion/fetchers/rss";
import { fetchYoutubeSource } from "@/lib/ingestion/fetchers/youtube";
import { IngestionLogger } from "@/lib/ingestion/logger";
import { normalizeFetchedItem } from "@/lib/ingestion/normalize";
import { normalizeSelectionOptions, selectSources } from "@/lib/ingestion/select-sources";
import type {
  FetcherContext,
  IngestionRawItem,
  IngestionRunSummary,
  SelectedSource,
  SourceFetchResult,
  SourceSelectionOptions
} from "@/lib/ingestion/types";

export async function runIngestion(options: Partial<SourceSelectionOptions> = {}) {
  const normalizedOptions = normalizeSelectionOptions({
    ...DEFAULT_SELECTION_OPTIONS,
    ...options
  });
  const logger = new IngestionLogger();
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const runId = buildRunId(startedAt);
  const selection = selectSources(normalizedOptions);
  const cacheStats = createFetchCacheStats();
  const fetchedItems: IngestionRawItem[] = [];
  const sourceResults: SourceFetchResult[] = [];
  const warnings = [...selection.warnings];
  const context: FetcherContext = {
    maxItemsPerSource: normalizedOptions.maxItemsPerSource,
    collectedAt: startedAt,
    cache: {
      noCache: Boolean(normalizedOptions.noCache),
      stats: cacheStats
    }
  };

  logger.info(`Selected ${selection.sources.length} sources from ${selection.eligibleSourceCount} eligible registry entries.`);

  for (const source of selection.sources) {
    const result = await fetchSource(source, context);
    sourceResults.push(result);

    if (result.status === "failed") {
      logger.warn(result.errorMessage ?? "Source fetch failed.", source.id);
    }

    if (result.status === "skipped") {
      logger.warn(result.errorMessage ?? "Source skipped.", source.id);
    }

    result.warnings.forEach((warning) => logger.warn(warning, source.id));
    fetchedItems.push(...result.items.map((item) => normalizeFetchedItem(source, item, context.collectedAt)));
  }

  warnings.push(...logger.warnings());
  const deduped = dedupeRawItems(fetchedItems);
  const endedAt = new Date().toISOString();
  const outputFiles = outputFilePaths(runId);
  const errorCount = sourceResults.filter((result) => result.status === "failed").length + deduped.items.filter((item) => item.status === "failed").length;
  const skippedCount = sourceResults.filter((result) => result.status === "skipped").length + deduped.items.filter((item) => item.status === "skipped").length;
  const status = runStatus(selection.sources.length, deduped.items.length, errorCount);
  const summary: IngestionRunSummary = {
    id: runId,
    started_at: startedAt,
    selected_source_count: selection.sources.length,
    source_results: sourceResults.map((result) => ({
      source_id: result.sourceId,
      source_name: result.sourceName,
      crawl_method: result.crawlMethod,
      status: result.status,
      item_count: result.itemCount,
      duration_ms: result.durationMs,
      error_message: result.errorMessage,
      warnings: result.warnings,
      metadata: result.metadata
    })),
    item_count: deduped.items.length,
    raw_item_count: deduped.items.filter((item) => item.status === "collected").length,
    duplicate_count: deduped.duplicateCount,
    skipped_count: skippedCount,
    error_count: errorCount,
    ended_at: endedAt,
    duration_ms: Date.now() - started,
    status,
    warnings,
    cache_stats: cacheStats,
    output_files: outputFiles.relative,
    options: {
      limit: normalizedOptions.limit,
      method: normalizedOptions.method,
      source_id: normalizedOptions.sourceId,
      max_items_per_source: normalizedOptions.maxItemsPerSource,
      no_cache: normalizedOptions.noCache
    }
  };

  writeOutputs(deduped.items, summary, outputFiles.absolute);
  logger.info(`Wrote ${deduped.items.length} raw items and run summary for ${runId}.`);

  return {
    rawItems: deduped.items,
    run: summary,
    sourceResults
  };
}

async function fetchSource(source: SelectedSource, context: FetcherContext): Promise<SourceFetchResult> {
  switch (source.crawl_method) {
    case "rss":
      return fetchRssSource(source, context);
    case "html":
      return fetchHtmlSource(source, context);
    case "api":
      return fetchGithubSource(source, context);
    case "podcast_feed":
      return fetchPodcastSource(source, context);
    case "youtube_feed":
      return fetchYoutubeSource(source);
  }
}

function runStatus(selectedSourceCount: number, itemCount: number, errorCount: number) {
  if (selectedSourceCount === 0 || (errorCount > 0 && itemCount === 0)) {
    return "failed";
  }

  if (errorCount > 0) {
    return "partial";
  }

  return "success";
}

function writeOutputs(items: IngestionRawItem[], summary: IngestionRunSummary, files: ReturnType<typeof outputFilePaths>["absolute"]) {
  fs.mkdirSync(INGESTION_LATEST_DIR, { recursive: true });
  fs.mkdirSync(INGESTION_RUNS_DIR, { recursive: true });
  fs.writeFileSync(files.latest_raw_items, `${JSON.stringify(items, null, 2)}\n`);
  fs.writeFileSync(files.latest_run, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(files.run_raw_items, `${JSON.stringify(items, null, 2)}\n`);
  fs.writeFileSync(files.run_summary, `${JSON.stringify(summary, null, 2)}\n`);
}

function outputFilePaths(runId: string) {
  const absolute = {
    latest_raw_items: path.join(INGESTION_LATEST_DIR, "raw-items.json"),
    latest_run: path.join(INGESTION_LATEST_DIR, "ingestion-run.json"),
    run_raw_items: path.join(INGESTION_RUNS_DIR, `${runId}.raw-items.json`),
    run_summary: path.join(INGESTION_RUNS_DIR, `${runId}.ingestion-run.json`)
  };

  return {
    absolute,
    relative: {
      latest_raw_items: slash(path.relative(process.cwd(), absolute.latest_raw_items)),
      latest_run: slash(path.relative(process.cwd(), absolute.latest_run)),
      run_raw_items: slash(path.relative(process.cwd(), absolute.run_raw_items)),
      run_summary: slash(path.relative(process.cwd(), absolute.run_summary))
    }
  };
}

function buildRunId(startedAt: string) {
  return `run_${startedAt.replace(/[-:.]/g, "").replace("T", "_").replace("Z", "Z")}`;
}

function slash(value: string) {
  return value.replace(/\\/g, "/");
}
