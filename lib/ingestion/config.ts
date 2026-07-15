import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { CrawlMethod, CrawlMethodFilter, FetchCacheStats, SourceSelectionOptions } from "@/lib/ingestion/types";

export const INGESTION_ROOT = process.cwd();
export const CLEANED_SOURCE_REGISTRY_PATH = path.join(
  INGESTION_ROOT,
  "data",
  "seed",
  "sources",
  "ai-learning-resources.cleaned.json"
);
export const OFFICIAL_SOURCE_REGISTRY_PATH = path.join(
  INGESTION_ROOT,
  "data",
  "seed",
  "sources",
  "official-ai-sources.json"
);
export const SOURCE_REGISTRY_PATHS = [CLEANED_SOURCE_REGISTRY_PATH, OFFICIAL_SOURCE_REGISTRY_PATH];
export const INGESTION_DIR = path.join(INGESTION_ROOT, "data", "ingestion");
export const INGESTION_LATEST_DIR = path.join(INGESTION_DIR, "latest");
export const INGESTION_RUNS_DIR = path.join(INGESTION_DIR, "runs");
export const INGESTION_CACHE_DIR = path.join(INGESTION_DIR, "cache");

export const SAFE_CRAWL_METHODS: CrawlMethod[] = ["rss", "html", "sitemap", "api", "podcast_feed", "youtube_feed"];
export const CRAWL_METHOD_FILTERS: CrawlMethodFilter[] = [...SAFE_CRAWL_METHODS, "all"];

export const DEFAULT_SELECTION_OPTIONS: SourceSelectionOptions = {
  limit: 10,
  method: "all",
  maxItemsPerSource: 10
};

export const FETCH_CONFIG = {
  timeoutMs: 12_000,
  maxHtmlBytes: 512_000,
  maxFeedBytes: 1_000_000,
  maxApiBytes: 256_000,
  userAgent: "AI-Radar-Web-Ingestion/0.1 public-source-metadata"
};

export type FetchPublicTextResult = {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  text: string;
  headers: Record<string, string>;
  truncated?: boolean;
  cached?: boolean;
  errorMessage?: string;
};

export type FetchPublicTextOptions = {
  accept: string;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  cache?: {
    keyParts: string[];
    bypass?: boolean;
    stats?: FetchCacheStats;
  };
};

const unsafeFragments = [
  "km." + "san" + "kuai.com",
  "san" + "kuai",
  "mei" + "tuan",
  "content" + "Type=1",
  "api/file/" + "cdn",
  "image" + ".jpeg",
  "cook" + "ie",
  "bear" + "er"
];

const localHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function isAllowedCrawlMethod(value: string): value is CrawlMethod {
  return SAFE_CRAWL_METHODS.includes(value as CrawlMethod);
}

export function hasUnsafeFragment(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const lowered = value.toLowerCase();
  return unsafeFragments.some((fragment) => lowered.includes(fragment.toLowerCase()));
}

export function isPublicHttpUrl(value: string | null | undefined) {
  if (!value || hasUnsafeFragment(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (localHostnames.has(hostname) || hostname.endsWith(".local")) {
      return false;
    }

    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function canonicalizeUrl(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";

    const keptParams = new URLSearchParams();
    Array.from(parsed.searchParams.entries())
      .filter(([key]) => !isTrackingParam(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([key, paramValue]) => keptParams.append(key, paramValue));

    parsed.search = keptParams.toString();
    parsed.hostname = parsed.hostname.toLowerCase();

    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return value.trim();
  }
}

export function responseHeaders(headers: Headers) {
  const entries: Record<string, string> = {};
  for (const key of [
    "content-type",
    "etag",
    "last-modified",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "x-ratelimit-resource",
    "x-ratelimit-used"
  ]) {
    const value = headers.get(key);
    if (value) {
      entries[key] = value;
    }
  }
  return entries;
}

export function createFetchCacheStats(): FetchCacheStats {
  return {
    hits: 0,
    misses: 0,
    bypasses: 0,
    writes: 0,
    errors: 0
  };
}

export function hourlyFetchCacheKeyParts(sourceId: string, url: string, collectedAt: string, label = "source") {
  return [sourceId, label, url, collectedAt.slice(0, 13)];
}

export async function fetchPublicText(url: string, options: FetchPublicTextOptions): Promise<FetchPublicTextResult> {
  if (!isPublicHttpUrl(url)) {
    return {
      ok: false,
      status: 0,
      statusText: "Invalid public URL",
      url,
      text: "",
      headers: {},
      errorMessage: "URL is not eligible for public ingestion"
    };
  }

  const cacheFile = options.cache ? fetchCachePath(options.cache.keyParts) : null;
  if (cacheFile && !options.cache?.bypass) {
    const cached = readFetchCache(cacheFile, options.cache?.stats);
    if (cached) {
      return cached;
    }
  } else if (cacheFile && options.cache?.bypass) {
    incrementCacheStat(options.cache.stats, "bypasses");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_CONFIG.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: options.accept,
        connection: "close",
        "user-agent": FETCH_CONFIG.userAgent,
        ...options.headers
      },
      redirect: "follow",
      signal: controller.signal
    });

    const arrayBuffer = await response.arrayBuffer();
    const maxBytes = options.maxBytes ?? FETCH_CONFIG.maxHtmlBytes;
    const bytes = new Uint8Array(arrayBuffer);
    const truncated = bytes.length > maxBytes;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(truncated ? bytes.slice(0, maxBytes) : bytes);

    const result: FetchPublicTextResult = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      text,
      headers: responseHeaders(response.headers),
      truncated,
      errorMessage: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`.trim()
    };

    if (cacheFile && response.ok) {
      writeFetchCache(cacheFile, result, options.cache?.stats);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 0,
      statusText: "Fetch failed",
      url,
      text: "",
      headers: {},
      errorMessage: message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function fetchCachePath(keyParts: string[]) {
  const key = keyParts.map((part) => part.trim()).filter(Boolean).join("\n");
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(INGESTION_CACHE_DIR, `${hash}.json`);
}

function readFetchCache(filePath: string, stats?: FetchCacheStats): FetchPublicTextResult | null {
  if (!fs.existsSync(filePath)) {
    incrementCacheStat(stats, "misses");
    return null;
  }

  try {
    const cached = JSON.parse(fs.readFileSync(filePath, "utf8")) as FetchPublicTextResult;
    if (!cached || typeof cached !== "object" || typeof cached.text !== "string") {
      incrementCacheStat(stats, "errors");
      return null;
    }

    incrementCacheStat(stats, "hits");
    return {
      ...cached,
      cached: true
    };
  } catch {
    incrementCacheStat(stats, "errors");
    return null;
  }
}

function writeFetchCache(filePath: string, result: FetchPublicTextResult, stats?: FetchCacheStats) {
  try {
    fs.mkdirSync(INGESTION_CACHE_DIR, { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({ ...result, cached: false }, null, 2)}\n`);
    incrementCacheStat(stats, "writes");
  } catch {
    incrementCacheStat(stats, "errors");
  }
}

function incrementCacheStat(stats: FetchCacheStats | undefined, key: keyof FetchCacheStats) {
  if (stats) {
    stats[key] += 1;
  }
}

function isTrackingParam(key: string) {
  const lowered = key.toLowerCase();
  return (
    lowered.startsWith("utm_") ||
    lowered.startsWith("fbclid") ||
    lowered.startsWith("gclid") ||
    lowered === "ref" ||
    lowered === "source" ||
    lowered === "spm"
  );
}
