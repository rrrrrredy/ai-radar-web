export const FAILURE_FAMILIES = [
  "timeout",
  "403",
  "rate_limit",
  "parse_error",
  "no_items",
  "duplicate_only",
  "manual_blocked",
  "unsupported_source",
  "low_relevance_excluded"
] as const;

export type FailureFamily = (typeof FAILURE_FAMILIES)[number];
export type FailureFamilyCounts = Record<string, number>;

export type FailureFamilyInput = {
  status?: string | null;
  errorMessage?: string | null;
  warnings?: string[] | null;
  metadata?: Record<string, unknown> | null;
  itemCount?: number | null;
  duplicateCount?: number | null;
  crawlMethod?: string | null;
  sourceStatus?: string | null;
  riskFlags?: string[] | null;
  exclusionReason?: string | null;
};

export function emptyFailureFamilyCounts(): Record<FailureFamily, number> {
  return Object.fromEntries(FAILURE_FAMILIES.map((family) => [family, 0])) as Record<FailureFamily, number>;
}

export function incrementFailureFamily(
  counts: FailureFamilyCounts,
  family: FailureFamily | null | undefined,
  amount = 1
) {
  if (!family || amount <= 0) {
    return counts;
  }

  counts[family] = (counts[family] ?? 0) + amount;
  return counts;
}

export function mergeFailureFamilyCounts(values: FailureFamilyCounts[]) {
  const merged: FailureFamilyCounts = {};

  for (const value of values) {
    for (const family of FAILURE_FAMILIES) {
      incrementFailureFamily(merged, family, value[family] ?? 0);
    }
  }

  return compactFailureFamilyCounts(merged);
}

export function compactFailureFamilyCounts(counts: FailureFamilyCounts) {
  return Object.fromEntries(
    FAILURE_FAMILIES
      .map((family) => [family, counts[family] ?? 0] as const)
      .filter(([, count]) => count > 0)
  ) as FailureFamilyCounts;
}

export function categorizeFailureFamily(input: FailureFamilyInput): FailureFamily | null {
  const haystack = [
    input.status ?? "",
    input.errorMessage ?? "",
    ...(input.warnings ?? []),
    input.exclusionReason ?? "",
    JSON.stringify(input.metadata ?? {})
  ].join(" ").toLowerCase();
  const crawlMethod = input.crawlMethod?.toLowerCase() ?? "";
  const sourceStatus = input.sourceStatus?.toLowerCase() ?? "";
  const riskFlags = (input.riskFlags ?? []).map((flag) => flag.toLowerCase());

  if (
    crawlMethod === "manual" ||
    crawlMethod === "x_api_future" ||
    crawlMethod === "no_crawl" ||
    sourceStatus === "needs_public_url" ||
    riskFlags.some((flag) => flag.includes("needs_public_url") || flag.includes("manual"))
  ) {
    return "manual_blocked";
  }

  if (
    haystack.includes("unsupported") ||
    haystack.includes("no fetcher") ||
    haystack.includes("not automated") ||
    haystack.includes("unsupported crawl") ||
    crawlMethod === "unsupported"
  ) {
    return "unsupported_source";
  }

  if (haystack.includes("rate limit") || haystack.includes("429") || haystack.includes("too many requests")) {
    return "rate_limit";
  }

  if (haystack.includes("403") || haystack.includes("forbidden")) {
    return "403";
  }

  if (
    haystack.includes("timeout") ||
    haystack.includes("timed out") ||
    haystack.includes("aborted") ||
    haystack.includes("fetch failed") ||
    haystack.includes("econnreset") ||
    haystack.includes("etimedout")
  ) {
    return "timeout";
  }

  if (
    haystack.includes("parse") ||
    haystack.includes("invalid json") ||
    haystack.includes("invalid xml") ||
    haystack.includes("malformed") ||
    haystack.includes("not valid")
  ) {
    return "parse_error";
  }

  if (
    haystack.includes("low relevance") ||
    haystack.includes("below relevance") ||
    haystack.includes("not ai relevant") ||
    haystack.includes("ai_relevance") ||
    input.status === "excluded"
  ) {
    return "low_relevance_excluded";
  }

  if ((input.duplicateCount ?? 0) > 0 && (input.itemCount ?? 0) === 0) {
    return "duplicate_only";
  }

  if (
    (input.itemCount ?? 0) === 0 &&
    (input.status === "success" ||
      input.status === "skipped" ||
      haystack.includes("no item") ||
      haystack.includes("no entries") ||
      haystack.includes("empty feed"))
  ) {
    return "no_items";
  }

  return null;
}
