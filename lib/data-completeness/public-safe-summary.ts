import { readCleanedSources } from "@/lib/ingestion/select-sources";
import { isSourceHealthEligible } from "@/lib/ingestion/source-health";
import type { RadarFeed } from "@/lib/radar/feed";
import { loadPublicRadarSnapshot } from "@/lib/retrieval/load-radar-items";
import type { PublicDataCompletenessSummary } from "@/lib/data-completeness/types";

type JsonRecord = Record<string, unknown>;

export async function loadPublicSafeDataCompletenessSummary(
  feed?: RadarFeed
): Promise<PublicDataCompletenessSummary> {
  const sources = readCleanedSources();
  const base = emptySummary({
    automatedEligibleSources: sources.filter(isSourceHealthEligible).length,
    blockedManualSources: sources.filter(isManualOnlySource).length,
    generatedAt: new Date().toISOString(),
    sourcesTotal: sources.length
  });
  const snapshot = await loadPublicRadarSnapshot({ localOnly: true, preferLocal: true });
  const snapshotSummary = snapshot ? summaryFromSnapshot(snapshot, base) : null;

  if (snapshotSummary) {
    return mergeFeedFallback(snapshotSummary, feed);
  }

  if (feed) {
    return summaryFromFeed(feed, base);
  }

  return {
    ...base,
    warnings: [
      "公开覆盖摘要未读取 service-role 表；当前没有可用公开快照，只展示来源注册表级别的覆盖边界。"
    ]
  };
}

function summaryFromSnapshot(
  snapshot: JsonRecord,
  base: PublicDataCompletenessSummary
): PublicDataCompletenessSummary | null {
  const counts = record(snapshot.counts);
  const coverage = record(snapshot.coverage);
  const completeness = record(snapshot.data_completeness_summary);
  const freshness = record(snapshot.freshness);
  const source = record(snapshot.source);

  if (!counts && !coverage && !completeness) {
    return null;
  }

  const sourcesTotal = integer(coverage?.sources_total) ?? integer(completeness?.sources_total) ?? base.sourcesTotal;
  const automatedEligibleSources =
    integer(coverage?.automated_eligible_sources) ??
    integer(completeness?.automated_eligible_sources) ??
    base.automatedEligibleSources;
  const publicRadarItems =
    integer(coverage?.public_radar_items) ??
    integer(completeness?.public_radar_items) ??
    integer(counts?.public_radar_items) ??
    integer(counts?.visible_radar_items);
  const radarItems = integer(completeness?.radar_items) ?? integer(counts?.radar_items) ?? publicRadarItems;
  const rawItems = integer(completeness?.raw_items) ?? integer(counts?.raw_items);
  const sourceRawCoverage =
    numberValue(coverage?.source_to_raw_coverage) ?? numberValue(completeness?.source_to_raw_coverage);
  const rawRadarConversion =
    numberValue(coverage?.raw_to_radar_conversion) ?? numberValue(completeness?.raw_to_radar_conversion);
  const radarPublicVisibility =
    numberValue(coverage?.radar_to_public_visibility) ?? numberValue(completeness?.radar_to_public_visibility);
  const sourcePublicVisibility =
    numberValue(coverage?.source_public_visibility) ?? numberValue(completeness?.source_public_visibility);

  return {
    ...base,
    attemptedSources: integer(coverage?.attempted_sources) ?? integer(completeness?.attempted_sources) ?? 0,
    automatedEligibleSources,
    blockedManualSources: integer(completeness?.blocked_manual_sources) ?? base.blockedManualSources,
    excluded: integer(counts?.excluded),
    failedRadarItems: integer(counts?.failed),
    failedSourceReasons: numericRecord(coverage?.failed_source_reasons),
    failedSources: integer(coverage?.failed_sources) ?? integer(completeness?.failed_sources) ?? 0,
    failureFamilies: numericRecord(coverage?.failure_families ?? snapshot.failure_family_summary),
    fetchedSources: integer(coverage?.fetched_sources) ?? integer(completeness?.fetched_sources) ?? 0,
    generatedAt: text(snapshot.generated_at) || base.generatedAt,
    included: integer(counts?.included),
    latestIngestion: optionalText(freshness?.latest_ingestion),
    latestRefresh: optionalText(coverage?.latest_refresh) ?? optionalText(freshness?.latest_timestamp),
    latestUnderstanding: optionalText(freshness?.latest_understanding),
    needsReview: integer(counts?.needs_review),
    publicRadarItems,
    radarItems,
    rawItems,
    rawItemsWithRadarItems: null,
    reportCandidates: integer(counts?.report_candidates ?? counts?.saved_report_candidates),
    skippedSourceReasons: numericRecord(coverage?.skipped_source_reasons),
    skippedSources: integer(coverage?.skipped_sources) ?? 0,
    sourcesTotal,
    sourcesWithPublicItems:
      integer(coverage?.sources_with_public_items) ?? integer(completeness?.sources_with_public_items),
    sourcesWithRadarItems: null,
    sourcesWithRawItems: null,
    rates: {
      radarPublicVisibility,
      rawRadarConversion,
      sourcePublicVisibility,
      sourceRawCoverage
    },
    warnings: publicWarnings([
      ...stringArray(source?.warnings),
      ...stringArray(snapshot.caveats),
      "公开覆盖摘要来自 public snapshot / public view 投影；service-role 运营明细不在公开页面读取。"
    ])
  };
}

function mergeFeedFallback(
  summary: PublicDataCompletenessSummary,
  feed: RadarFeed | undefined
): PublicDataCompletenessSummary {
  if (!feed) {
    return summary;
  }

  return {
    ...summary,
    excluded: summary.excluded ?? feed.counts.excluded,
    failedRadarItems: summary.failedRadarItems ?? feed.counts.failed,
    included: summary.included ?? feed.counts.included,
    latestRefresh: summary.latestRefresh ?? feed.freshness.latestTimestamp ?? feed.processed_at ?? null,
    needsReview: summary.needsReview ?? feed.counts.needs_review,
    publicRadarItems: summary.publicRadarItems ?? feed.counts.total,
    radarItems: summary.radarItems ?? feed.counts.total,
    sourcesWithPublicItems: summary.sourcesWithPublicItems ?? visibleSourceCount(feed),
    warnings: publicWarnings([...summary.warnings, ...feed.caveats])
  };
}

function summaryFromFeed(
  feed: RadarFeed,
  base: PublicDataCompletenessSummary
): PublicDataCompletenessSummary {
  const sourceCount = visibleSourceCount(feed);

  return {
    ...base,
    excluded: feed.counts.excluded,
    failedRadarItems: feed.counts.failed,
    included: feed.counts.included,
    latestRefresh: feed.freshness.latestTimestamp ?? feed.processed_at ?? null,
    needsReview: feed.counts.needs_review,
    publicRadarItems: feed.counts.total,
    radarItems: feed.counts.total,
    sourcesWithPublicItems: sourceCount,
    sourcesWithRadarItems: sourceCount,
    warnings: publicWarnings([
      ...feed.caveats,
      "公开覆盖摘要由当前可见 feed 推导；采集运行、原始条目和失败明细保留在 Admin/导出流程。"
    ])
  };
}

function emptySummary(input: {
  automatedEligibleSources: number;
  blockedManualSources: number;
  generatedAt: string;
  sourcesTotal: number;
}): PublicDataCompletenessSummary {
  return {
    ...input,
    attemptedSources: 0,
    excluded: null,
    failureFamilies: {},
    failedRadarItems: null,
    failedSourceReasons: {},
    failedSources: 0,
    fetchedSources: 0,
    included: null,
    latestIngestion: null,
    latestRefresh: null,
    latestUnderstanding: null,
    needsReview: null,
    publicRadarItems: null,
    radarItems: null,
    rawItems: null,
    rawItemsWithRadarItems: null,
    reportCandidates: null,
    skippedSourceReasons: {},
    skippedSources: 0,
    sourcesWithPublicItems: null,
    sourcesWithRadarItems: null,
    sourcesWithRawItems: null,
    rates: {
      radarPublicVisibility: null,
      rawRadarConversion: null,
      sourcePublicVisibility: null,
      sourceRawCoverage: null
    },
    warnings: []
  };
}

function visibleSourceCount(feed: RadarFeed) {
  return new Set(feed.items.map((item) => item.source_name.trim()).filter(Boolean)).size;
}

function isManualOnlySource(source: ReturnType<typeof readCleanedSources>[number]) {
  return (
    source.crawl_method === "manual" ||
    source.crawl_method === "x_api_future" ||
    source.crawl_method === "no_crawl" ||
    source.status === "needs_public_url" ||
    source.risk_flags.includes("needs_public_url")
  );
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function integer(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.floor(parsed);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(text).filter(Boolean).slice(0, 20);
}

function numericRecord(value: unknown) {
  const source = record(value);
  if (!source) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(source)
      .map(([key, rawValue]) => [key, integer(rawValue) ?? 0] as const)
      .filter(([key, count]) => key && count > 0)
  );
}

function publicWarnings(values: string[]) {
  return Array.from(new Set(values.map(publicWarningText).filter(Boolean))).slice(0, 8);
}

function publicWarningText(value: string) {
  return value
    .replace(
      "Cloudflare static snapshot export used public-safe local snapshot mode; set CLOUDFLARE_SNAPSHOT_READ_SUPABASE=true to opt into Supabase public reads.",
      "当前公开页面使用 public-safe 快照；不会从公开页面读取 service-role 运营表。"
    )
    .replace(
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "Cloudflare Pages 是主要公开只读页面；登录、Admin、服务端操作和写入流程不在公开页面中运行。"
    )
    .replace(
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      "只纳入公开安全的雷达和报告字段；私有原文、供应商元数据、内部备注、service-role 访问和密钥均已排除。"
    )
    .replace(/\b(service-role|SUPABASE_SERVICE_ROLE_KEY|api[-_]?key|token|cookie|authorization)\b/gi, "server-only")
    .trim();
}
