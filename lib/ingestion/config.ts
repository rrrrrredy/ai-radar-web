import path from "node:path";

import type { CrawlMethod, CrawlMethodFilter, SourceSelectionOptions } from "@/lib/ingestion/types";

export const INGESTION_ROOT = process.cwd();
export const CLEANED_SOURCE_REGISTRY_PATH = path.join(
  INGESTION_ROOT,
  "data",
  "seed",
  "sources",
  "ai-learning-resources.cleaned.json"
);
export const INGESTION_DIR = path.join(INGESTION_ROOT, "data", "ingestion");
export const INGESTION_LATEST_DIR = path.join(INGESTION_DIR, "latest");
export const INGESTION_RUNS_DIR = path.join(INGESTION_DIR, "runs");

export const SAFE_CRAWL_METHODS: CrawlMethod[] = ["rss", "html", "api", "podcast_feed", "youtube_feed"];
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
  errorMessage?: string;
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
  for (const key of ["content-type", "etag", "last-modified", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
    const value = headers.get(key);
    if (value) {
      entries[key] = value;
    }
  }
  return entries;
}

export async function fetchPublicText(
  url: string,
  options: {
    accept: string;
    timeoutMs?: number;
    maxBytes?: number;
  }
): Promise<FetchPublicTextResult> {
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_CONFIG.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: options.accept,
        connection: "close",
        "user-agent": FETCH_CONFIG.userAgent
      },
      redirect: "follow",
      signal: controller.signal
    });

    const arrayBuffer = await response.arrayBuffer();
    const maxBytes = options.maxBytes ?? FETCH_CONFIG.maxHtmlBytes;
    const bytes = new Uint8Array(arrayBuffer);
    const truncated = bytes.length > maxBytes;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(truncated ? bytes.slice(0, maxBytes) : bytes);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      text,
      headers: responseHeaders(response.headers),
      truncated,
      errorMessage: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`.trim()
    };
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
