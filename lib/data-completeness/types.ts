import type { FailureFamilyCounts } from "@/lib/ops/failure-families";

export type PublicCoverageRates = {
  sourceRawCoverage: number | null;
  rawRadarConversion: number | null;
  radarPublicVisibility: number | null;
  sourcePublicVisibility: number | null;
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
  reportCandidates: number | null;
  latestRefresh: string | null;
  latestIngestion: string | null;
  latestUnderstanding: string | null;
  failureFamilies: FailureFamilyCounts;
  failedSourceReasons: Record<string, number>;
  skippedSourceReasons: Record<string, number>;
  rates: PublicCoverageRates;
  warnings: string[];
};
