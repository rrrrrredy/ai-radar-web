import type { FailureFamilyCounts } from "@/lib/ops/failure-families";

export type PublicCoverageRates = {
  sourceRawCoverage: number | null;
  rawRadarConversion: number | null;
  radarPublicVisibility: number | null;
  sourcePublicVisibility: number | null;
};

export type PublicSourceHealthCounts = {
  succeeded: number;
  failed: number;
  timeout: number;
  "403": number;
  rate_limit: number;
  no_items: number;
  duplicate_only: number;
  manual_blocked: number;
  unsupported_source: number;
  low_relevance_excluded: number;
};

export type PublicSourceFamilyHealth = PublicSourceHealthCounts & {
  family: string;
  configured: number;
  automated_eligible: number;
  attempted: number;
  skipped: number;
};

export type PublicSourceHealthScope = {
  run_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  attempted_sources: number;
};

export type PublicSourceFailureDetail = {
  source_slug: string;
  source_name: string;
  source_family: string;
  reason: string;
};

export type PublicDataCompletenessSummary = {
  generatedAt: string;
  sourcesTotal: number;
  automatedEligibleSources: number;
  attemptedSources: number;
  fetchedSources: number;
  skippedSources: number;
  failedSources: number;
  blockedManualSources: number;
  sourcesWithRawItems: number | null;
  sourcesWithRadarItems: number | null;
  sourcesWithPublicItems: number | null;
  rawItems: number | null;
  rawItemsWithRadarItems: number | null;
  radarItems: number | null;
  publicRadarItems: number | null;
  included: number | null;
  needsReview: number | null;
  excluded: number | null;
  failedRadarItems: number | null;
  latestRefresh: string | null;
  latestIngestion: string | null;
  latestUnderstanding: string | null;
  failureFamilies: FailureFamilyCounts;
  sourceFamilyHealth: PublicSourceFamilyHealth[];
  sourceHealthScope: PublicSourceHealthScope;
  failedSourceReasons: Record<string, number>;
  failedSourceDetails: PublicSourceFailureDetail[];
  skippedSourceReasons: Record<string, number>;
  rates: PublicCoverageRates;
  warnings: string[];
};
