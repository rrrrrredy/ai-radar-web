import fs from "node:fs";

import {
  CLEANED_SOURCE_REGISTRY_PATH,
  DEFAULT_SELECTION_OPTIONS,
  hasUnsafeFragment,
  isAllowedCrawlMethod,
  isPublicHttpUrl
} from "@/lib/ingestion/config";
import type {
  CleanedSource,
  CrawlMethodFilter,
  SelectedSource,
  SourceSelectionOptions,
  SourceSelectionResult
} from "@/lib/ingestion/types";

const eligibleStatuses = new Set(["active", "trial"]);

export function readCleanedSources(filePath = CLEANED_SOURCE_REGISTRY_PATH): CleanedSource[] {
  const text = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(text) as unknown;

  if (!Array.isArray(data)) {
    throw new Error("Cleaned source registry must be an array.");
  }

  return data as CleanedSource[];
}

export function selectSources(options: Partial<SourceSelectionOptions> = {}): SourceSelectionResult {
  const normalizedOptions = normalizeSelectionOptions(options);
  const sources = readCleanedSources();
  const warnings: string[] = [];
  const eligibleSources = sources.filter(isEligibleSource);
  let selected = eligibleSources;

  if (normalizedOptions.method !== "all") {
    selected = selected.filter((source) => source.crawl_method === normalizedOptions.method);
  }

  if (normalizedOptions.sourceId) {
    selected = selected.filter((source) => source.id === normalizedOptions.sourceId);
    if (selected.length === 0) {
      warnings.push(`No eligible source matched ${normalizedOptions.sourceId}.`);
    }
  }

  return {
    sources: selected.slice(0, normalizedOptions.limit),
    totalRegistrySources: sources.length,
    eligibleSourceCount: eligibleSources.length,
    warnings
  };
}

export function normalizeSelectionOptions(options: Partial<SourceSelectionOptions>): SourceSelectionOptions {
  const limit = positiveInteger(options.limit, DEFAULT_SELECTION_OPTIONS.limit);
  const maxItemsPerSource = positiveInteger(options.maxItemsPerSource, DEFAULT_SELECTION_OPTIONS.maxItemsPerSource);
  const method = normalizeMethod(options.method);

  return {
    limit,
    method,
    sourceId: options.sourceId,
    maxItemsPerSource
  };
}

function isEligibleSource(source: CleanedSource): source is SelectedSource {
  if (!eligibleStatuses.has(source.status)) {
    return false;
  }

  if (!isAllowedCrawlMethod(source.crawl_method)) {
    return false;
  }

  if (!source.url || !isPublicHttpUrl(source.url)) {
    return false;
  }

  if (source.risk_flags.includes("needs_public_url")) {
    return false;
  }

  return [source.url, source.rss_url, source.github_url, source.youtube_url, source.podcast_url, source.notes].every(
    (value) => !hasUnsafeFragment(value)
  );
}

function normalizeMethod(value: CrawlMethodFilter | undefined): CrawlMethodFilter {
  if (!value || value === "all") {
    return "all";
  }

  if (isAllowedCrawlMethod(value)) {
    return value;
  }

  throw new Error(`Unsupported crawl method: ${value}`);
}

function positiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}
