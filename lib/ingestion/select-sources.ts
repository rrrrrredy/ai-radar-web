import fs from "node:fs";

import {
  CLEANED_SOURCE_REGISTRY_PATH,
  DEFAULT_SELECTION_OPTIONS,
  INGESTION_LATEST_DIR,
  SOURCE_REGISTRY_PATHS,
  canonicalizeUrl,
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
const sourceFamilyOrder = ["official_company", "arxiv_research", "github_open_source", "specialist_analysis", "podcast_video"];

export function readCleanedSources(filePath = CLEANED_SOURCE_REGISTRY_PATH): CleanedSource[] {
  if (filePath === CLEANED_SOURCE_REGISTRY_PATH) {
    return readMergedSourceRegistries(SOURCE_REGISTRY_PATHS);
  }

  return readSourceRegistryFile(filePath);
}

export function readMergedSourceRegistries(filePaths = SOURCE_REGISTRY_PATHS): CleanedSource[] {
  const sources = filePaths.flatMap((registryPath) => (fs.existsSync(registryPath) ? readSourceRegistryFile(registryPath) : []));
  return mergeSourceRegistries(sources);
}

function readSourceRegistryFile(filePath: string): CleanedSource[] {
  const text = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(text) as unknown;

  if (!Array.isArray(data)) {
    throw new Error(`${filePath} must be a source registry array.`);
  }

  return data as CleanedSource[];
}

function mergeSourceRegistries(sources: CleanedSource[]) {
  const merged: CleanedSource[] = [];
  const sourceByKey = new Map<string, CleanedSource>();

  for (const source of sources) {
    const keys = registryDedupeKeys(source);
    const existing = keys.map((key) => sourceByKey.get(key)).find(Boolean);

    if (!existing) {
      merged.push(source);
      keys.forEach((key) => sourceByKey.set(key, source));
      continue;
    }

    mergeSource(existing, source);
    registryDedupeKeys(existing).forEach((key) => sourceByKey.set(key, existing));
  }

  return merged;
}

function mergeSource(existing: CleanedSource, incoming: CleanedSource) {
  existing.tags = Array.from(new Set([...existing.tags, ...incoming.tags])).sort();
  existing.risk_flags = Array.from(new Set([...existing.risk_flags, ...incoming.risk_flags])).sort();

  if (!existing.description && incoming.description) {
    existing.description = incoming.description;
  }

  for (const field of ["url", "rss_url", "sitemap_url", "github_url", "youtube_url", "podcast_url", "x_handle"] as const) {
    if (!existing[field] && incoming[field]) {
      existing[field] = incoming[field];
    }
  }

  if (!existing.notes && incoming.notes) {
    existing.notes = incoming.notes;
  }
}

function registryDedupeKeys(source: CleanedSource) {
  const keys = new Set<string>([`slug:${source.id}`]);

  for (const url of [source.url, source.rss_url, source.github_url, source.youtube_url, source.podcast_url]) {
    if (url) {
      keys.add(`url:${canonicalizeUrl(url).toLowerCase().replace(/^https?:\/\/www\./, "https://")}`);
    }
  }

  return Array.from(keys);
}

export function selectSources(options: Partial<SourceSelectionOptions> = {}): SourceSelectionResult {
  const normalizedOptions = normalizeSelectionOptions(options);
  const sources = readCleanedSources();
  const warnings: string[] = [];
  const recentFailedSourceIds = readRecentFailedSourceIds();
  const eligibleSources = sortEligibleSources(sources.filter(isEligibleSource), recentFailedSourceIds);
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

  if (!normalizedOptions.sourceId && normalizedOptions.method === "all") {
    selected = diversifySources(selected, normalizedOptions.limit);
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
    maxItemsPerSource,
    noCache: Boolean(options.noCache)
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

function sortEligibleSources(sources: SelectedSource[], recentFailedSourceIds: Set<string>) {
  return [...sources].sort((left, right) => {
    const priorityDelta = sourcePriority(left, recentFailedSourceIds) - sourcePriority(right, recentFailedSourceIds);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const weightDelta = right.weight - left.weight;
    if (weightDelta !== 0) {
      return weightDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

function diversifySources(sources: SelectedSource[], limit: number) {
  const buckets = new Map<string, SelectedSource[]>();

  for (const source of sources) {
    const family = sourceFamily(source);
    buckets.set(family, [...(buckets.get(family) ?? []), source]);
  }

  const familyOrder = [
    ...sourceFamilyOrder.filter((family) => buckets.has(family)),
    ...Array.from(buckets.keys())
      .filter((family) => !sourceFamilyOrder.includes(family))
      .sort()
  ];
  const selected: SelectedSource[] = [];
  const counts = new Map<string, number>();
  const maxPerFamily = Math.max(1, Math.ceil(limit * 0.35));

  while (selected.length < limit) {
    let progressed = false;

    for (const family of familyOrder) {
      if (selected.length >= limit) {
        break;
      }

      if ((counts.get(family) ?? 0) >= maxPerFamily) {
        continue;
      }

      const next = buckets.get(family)?.shift();
      if (!next) {
        continue;
      }

      selected.push(next);
      counts.set(family, (counts.get(family) ?? 0) + 1);
      progressed = true;
    }

    if (!progressed) {
      break;
    }
  }

  if (selected.length < limit) {
    for (const family of familyOrder) {
      const bucket = buckets.get(family) ?? [];
      while (selected.length < limit && bucket.length > 0) {
        selected.push(bucket.shift() as SelectedSource);
      }
    }
  }

  return selected;
}

export function sourceFamily(source: { category?: string | null; type?: string | null; crawl_method?: string | null }) {
  if (source.category === "github" || source.type === "github" || source.crawl_method === "api") {
    return "github_open_source";
  }

  if (source.category === "arxiv" || source.type === "arxiv") {
    return "arxiv_research";
  }

  if (["official_company", "official_blog", "research_lab", "huggingface"].includes(source.category ?? "")) {
    return "official_company";
  }

  if (source.category === "podcast" || source.type === "podcast" || source.crawl_method === "podcast_feed") {
    return "podcast_video";
  }

  return "specialist_analysis";
}

function sourcePriority(source: SelectedSource, recentFailedSourceIds: Set<string>) {
  return originRank(source) * 100 + tierRank(source.tier) * 10 + methodRank(source.crawl_method) + recentFailurePenalty(source, recentFailedSourceIds);
}

function originRank(source: SelectedSource) {
  return source.source_origin === "official-ai-sources.json" ? 0 : 1;
}

function tierRank(tier: CleanedSource["tier"]) {
  switch (tier) {
    case "T1":
      return 0;
    case "T1.5":
      return 1;
    case "T2":
      return 2;
    case "T3":
      return 3;
    case "unreviewed":
      return 4;
  }
}

function methodRank(method: SelectedSource["crawl_method"]) {
  switch (method) {
    case "rss":
      return 0;
    case "sitemap":
      return 1;
    case "api":
      return 2;
    case "html":
      return 3;
    case "podcast_feed":
      return 4;
    case "youtube_feed":
      return 5;
  }
}

function recentFailurePenalty(source: SelectedSource, recentFailedSourceIds: Set<string>) {
  return recentFailedSourceIds.has(source.id) ? 8 : 0;
}

function readRecentFailedSourceIds() {
  const runPath = `${INGESTION_LATEST_DIR}/ingestion-run.json`;
  try {
    const parsed = JSON.parse(fs.readFileSync(runPath, "utf8")) as {
      source_results?: Array<{ source_id?: string; status?: string }>;
    };

    return new Set(
      (parsed.source_results ?? [])
        .filter((result) => result.status === "failed")
        .map((result) => result.source_id)
        .filter((sourceId): sourceId is string => Boolean(sourceId))
    );
  } catch {
    return new Set<string>();
  }
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
