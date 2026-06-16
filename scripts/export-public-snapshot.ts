import "@/lib/config/load-cli-env";

import fs from "node:fs/promises";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadPublicDataCompletenessSummary,
  type PublicDataCompletenessSummary
} from "@/lib/data-completeness/public-summary";
import {
  buildEventLayer,
  type PublicEventLayer,
  type PublicEventCluster,
  type PublicEventClusterItem,
  type PublicTimelineEntry
} from "@/lib/events/clustering";
import { buildRadarFeed } from "@/lib/radar/feed";
import { loadRadarItems } from "@/lib/retrieval/load-radar-items";
import type {
  RetrievalDataSource,
  RetrievalLanguage,
  RetrievalRadarItem
} from "@/lib/retrieval/types";
import {
  distinctSourcesFromCitations,
  normalizeReportQualityGate,
  reportQualityGateFields
} from "@/lib/reports/quality-gates";
import type { ReportPreviewType, ReportQualityGate } from "@/lib/reports/types";
import { getSupabaseServerReadClient } from "@/lib/supabase/server-read";
import { getSupabaseServiceClient, getSupabaseServiceStatus } from "@/lib/supabase/service";
import { RADAR_CATEGORIES, type RadarCategory, type UnderstandingStatus } from "@/lib/understanding/types";

const cloudflareUrl = "https://ai-industry-radar.pages.dev";
const referenceAppUrl = "https://ai-radar-web-luosongred-5507s-projects.vercel.app";
const outputPath = path.join(process.cwd(), "dist", "cloudflare-pages", "data", "radar-snapshot.json");
const radarLimit = 500;
const reportLimit = 24;

type SnapshotSourceKind = "supabase_public_views" | "local_files";
type ReportMode = "saved_candidate" | "saved_report" | "local_preview";

export type PublicRadarSnapshotItem = {
  id: string;
  title: string;
  url: string;
  source_name: string;
  status: UnderstandingStatus;
  language: RetrievalLanguage;
  published_at?: string;
  collected_at: string;
  processed_at: string;
  summary_zh?: string;
  summary_en?: string;
  categories: RadarCategory[];
  tags: string[];
  source_tier: string;
  confidence: number;
  scores: {
    ai_relevance: number;
    credibility: number;
    freshness: number;
    importance: number;
    novelty: number;
    overall: number;
  };
  why_it_matters?: string;
  evidence_notes: string[];
};

export type PublicReportSnapshot = {
  id: string;
  report_type: ReportPreviewType;
  mode: ReportMode;
  status: string;
  title: string;
  summary: string;
  executive_summary?: string;
  data_source: string;
  time_window: {
    start: string;
    end: string;
  };
  generated_at?: string;
  saved_at?: string;
  source_item_count: number;
  usable_item_count: number;
  citation_count: number;
  distinct_source_count: number;
  category_count: number;
  quality_gate_passed: boolean;
  quality_gate_reasons: string[];
  quality_gate: ReportQualityGate;
  confidence?: number;
  sections: Array<{
    title: string;
    summary: string;
    bullets: string[];
    citations: string[];
    caveats: string[];
  }>;
  citations: Array<{
    id: string;
    title: string;
    source_name: string;
    url: string;
    published_at?: string;
    collected_at?: string;
    status?: UnderstandingStatus;
    confidence?: number;
  }>;
  caveats: string[];
  missing_evidence: string[];
};

type CountEntry = {
  label: string;
  count: number;
};

type OperationalCounts = {
  sources: number | null;
  raw_items: number | null;
  radar_items: number | null;
  public_radar_items: number | null;
  report_candidates: number | null;
  ingestion_runs: number | null;
  understanding_runs: number | null;
  entities: number | null;
  item_entities: number | null;
  scores: number | null;
  latest_ingestion: string | null;
  latest_understanding: string | null;
  warnings: string[];
};

export type PublicMirrorSnapshot = {
  schema_version: 1;
  generated_at: string;
  reference_app_url: string;
  public_site: {
    purpose: string;
    cloudflare_url: string;
    reference_app_url: string;
    read_only: true;
  };
  source: {
    kind: SnapshotSourceKind;
    data_source: string;
    local_data_used: boolean;
    warnings: string[];
  };
  freshness: {
    latest_timestamp: string | null;
    latest_timestamp_source: string | null;
    latest_ingestion: string | null;
    latest_understanding: string | null;
    note: string;
  };
  counts: {
    sources: number | null;
    raw_items: number | null;
    radar_items: number | null;
    public_radar_items: number | null;
    visible_radar_items: number;
    snapshot_radar_items: number;
    included: number;
    needs_review: number;
    excluded: number;
    failed: number;
    report_candidates: number | null;
    report_snapshots: number;
    saved_report_candidates: number;
    citations: number;
    ingestion_runs: number | null;
    understanding_runs: number | null;
    entities: number | null;
    item_entities: number | null;
    scores: number | null;
    event_clusters: number;
  };
  coverage: {
    label: "public snapshot";
    sources_total: number;
    automated_eligible_sources: number;
    attempted_sources: number;
    fetched_sources: number;
    failed_sources: number;
    skipped_sources: number;
    sources_with_public_items: number | null;
    public_radar_items: number | null;
    latest_refresh: string | null;
    source_to_raw_coverage: number | null;
    raw_to_radar_conversion: number | null;
    radar_to_public_visibility: number | null;
    source_public_visibility: number | null;
    failure_families: Record<string, number>;
    failed_source_reasons: Record<string, number>;
    skipped_source_reasons: Record<string, number>;
  };
  top_categories: CountEntry[];
  top_sources: CountEntry[];
  top_source_tiers: CountEntry[];
  event_clusters: PublicEventCluster[];
  event_cluster_items: PublicEventClusterItem[];
  event_count: number;
  curated_events: PublicEventCluster[];
  timeline: PublicTimelineEntry[];
  source_health_summary: {
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
  failure_family_summary: Record<string, number>;
  report_quality_summary: {
    daily: ReportQualitySummary | null;
    weekly: ReportQualitySummary | null;
  };
  data_completeness_summary: {
    sources_total: number;
    automated_eligible_sources: number;
    attempted_sources: number;
    fetched_sources: number;
    failed_sources: number;
    blocked_manual_sources: number;
    sources_with_public_items: number | null;
    raw_items: number | null;
    radar_items: number | null;
    public_radar_items: number | null;
    raw_to_radar_conversion: number | null;
    radar_to_public_visibility: number | null;
    source_public_visibility: number | null;
  };
  radar_items: PublicRadarSnapshotItem[];
  reports: PublicReportSnapshot[];
  caveats: string[];
};

type ReportQualitySummary = {
  id: string;
  status: string;
  quality_gate_passed: boolean;
  usable_item_count: number;
  citation_count: number;
  distinct_source_count: number;
  category_count: number;
  quality_gate_reasons: string[];
  top_event_ids: string[];
  missing_evidence: string[];
  caveats: string[];
};

type SupabaseRadarRead = {
  count: number;
  items: PublicRadarSnapshotItem[];
  warnings: string[];
};

type SupabaseReportRead = {
  reports: PublicReportSnapshot[];
  warnings: string[];
};

type SupabaseReadError = {
  code?: string;
  details?: string;
  hint?: string;
  message: string;
};

type SupabaseRadarRow = Record<string, unknown>;
type SupabaseReportRow = Record<string, unknown>;

async function main() {
  const snapshot = await createPublicSnapshot();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(
    [
      "Cloudflare public snapshot written:",
      path.relative(process.cwd(), outputPath),
      `source=${snapshot.source.data_source}`,
      `visibleRows=${snapshot.counts.visible_radar_items}`,
      `snapshotRows=${snapshot.counts.snapshot_radar_items}`,
      `reports=${snapshot.counts.report_snapshots}`
    ].join(" ")
  );
}

async function createPublicSnapshot(): Promise<PublicMirrorSnapshot> {
  const generatedAt = new Date().toISOString();
  const supabase = getSupabaseServerReadClient();

  if (supabase) {
    const supabaseSnapshot = await readSupabaseSnapshot(supabase, generatedAt);
    if (supabaseSnapshot.snapshot) {
      return supabaseSnapshot.snapshot;
    }

    const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, supabaseSnapshot.warnings);
    if (previousSnapshot) {
      return previousSnapshot;
    }

    return readLocalFallbackSnapshot(generatedAt, supabaseSnapshot.warnings);
  }

  const warnings = [
    "Supabase public URL and anon key are not configured for this process; local generated radar data was used."
  ];
  const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, warnings);
  if (previousSnapshot) {
    return previousSnapshot;
  }

  return readLocalFallbackSnapshot(generatedAt, warnings);
}

async function readSupabaseSnapshot(
  supabase: SupabaseClient,
  generatedAt: string
): Promise<{ snapshot: PublicMirrorSnapshot | null; warnings: string[] }> {
  const [radar, reports] = await Promise.all([
    readSupabaseRadarItems(supabase),
    readSupabaseReports(supabase)
  ]);
  const operationalCounts = await readOperationalCounts(radar.count, reports.reports.length);
  const warnings = [...radar.warnings, ...reports.warnings, ...operationalCounts.warnings];

  if (radar.items.length === 0) {
    return {
      snapshot: null,
      warnings: [
        ...warnings,
        "Supabase public radar view returned no public-safe rows; local generated radar data was used."
      ]
    };
  }

  return {
    snapshot: buildSnapshot({
      caveats: [],
      dataSource: "supabase_radar_items",
      exactVisibleRows: radar.count,
      fallbackUsed: false,
      generatedAt,
      items: radar.items,
      operationalCounts,
      publicCoverage: await loadPublicDataCompletenessSummary(),
      reports: reports.reports,
      sourceKind: "supabase_public_views",
      warnings
    }),
    warnings
  };
}

async function readSupabaseRadarItems(supabase: SupabaseClient): Promise<SupabaseRadarRead> {
  try {
    const { count, data, error } = await supabase
      .from("public_radar_items")
      .select(
        [
          "id",
          "local_id",
          "source_name",
          "title",
          "url",
          "published_at",
          "collected_at",
          "processed_at",
          "language",
          "summary_zh",
          "summary_en",
          "topics",
          "categories",
          "tags",
          "status",
          "understanding_status",
          "exclusion_reason",
          "ai_relevance_score",
          "importance_score",
          "credibility_score",
          "novelty_score",
          "freshness_score",
          "overall_score",
          "source_tier",
          "confidence",
          "why_it_matters",
          "evidence_notes",
          "updated_at"
        ].join(","),
        { count: "exact" }
      )
      .in("understanding_status", ["included", "needs_review"])
      .order("processed_at", { ascending: false, nullsFirst: false })
      .limit(radarLimit);

    if (error) {
      return {
        count: 0,
        items: [],
        warnings: [readErrorMessage("public_radar_items", error as SupabaseReadError)]
      };
    }

    const rows = (data ?? []) as unknown as SupabaseRadarRow[];
    const items = rows
      .map(normalizeSupabaseRadarRow)
      .filter((item): item is PublicRadarSnapshotItem => Boolean(item));
    const warnings =
      rows.length > items.length
        ? ["Some Supabase public radar rows were skipped because required public fields were missing."]
        : [];

    if ((count ?? items.length) > items.length) {
      warnings.push(`Snapshot includes the newest ${items.length} of ${count ?? items.length} visible public radar rows.`);
    }

    return {
      count: count ?? items.length,
      items,
      warnings
    };
  } catch (error) {
    return {
      count: 0,
      items: [],
      warnings: [`public_radar_items read failed: ${sanitizeError(error)}`]
    };
  }
}

async function readSupabaseReports(supabase: SupabaseClient): Promise<SupabaseReportRead> {
  const [candidates, reports, service] = await Promise.all([
    readPublicReportCandidates(supabase),
    readPublicReports(supabase),
    readServiceReports()
  ]);

  return {
    reports: mergeReports([...service.reports, ...candidates.reports, ...reports.reports])
      .sort(compareReports)
      .slice(0, reportLimit),
    warnings: [...candidates.warnings, ...reports.warnings, ...service.warnings]
  };
}

async function readPublicReportCandidates(supabase: SupabaseClient): Promise<SupabaseReportRead> {
  try {
    const { data, error } = await supabase
      .from("public_report_candidates")
      .select(
        "id, report_type, title, summary, time_window_start, time_window_end, source_item_ids, status, confidence, created_at, updated_at, report_draft"
      )
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(reportLimit);

    if (error) {
      return {
        reports: [],
        warnings: [readErrorMessage("public_report_candidates", error as SupabaseReadError)]
      };
    }

    return {
      reports: ((data ?? []) as unknown as SupabaseReportRow[])
        .map(normalizeCandidateReportRow)
        .filter((report): report is PublicReportSnapshot => Boolean(report)),
      warnings: []
    };
  } catch (error) {
    return {
      reports: [],
      warnings: [`public_report_candidates read failed: ${sanitizeError(error)}`]
    };
  }
}

async function readPublicReports(supabase: SupabaseClient): Promise<SupabaseReportRead> {
  try {
    const { data, error } = await supabase
      .from("public_reports")
      .select("id, type, title, language, time_window_start, time_window_end, body, status, created_at, published_at, report_draft")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(reportLimit);

    if (error) {
      return {
        reports: [],
        warnings: [readErrorMessage("public_reports", error as SupabaseReadError)]
      };
    }

    return {
      reports: ((data ?? []) as unknown as SupabaseReportRow[])
        .map(normalizeSavedReportRow)
        .filter((report): report is PublicReportSnapshot => Boolean(report)),
      warnings: []
    };
  } catch (error) {
    return {
      reports: [],
      warnings: [`public_reports read failed: ${sanitizeError(error)}`]
    };
  }
}

async function readServiceReports(): Promise<SupabaseReportRead> {
  const serviceStatus = getSupabaseServiceStatus();

  if (!serviceStatus.publicConfigConfigured || !serviceStatus.serviceRoleConfigured) {
    return {
      reports: [],
      warnings: []
    };
  }

  try {
    const supabase = getSupabaseServiceClient();
    const [candidates, reports] = await Promise.all([
      readServiceReportCandidates(supabase),
      readServiceSavedReports(supabase)
    ]);

    return {
      reports: [...candidates.reports, ...reports.reports],
      warnings: [...candidates.warnings, ...reports.warnings]
    };
  } catch (error) {
    return {
      reports: [],
      warnings: [`service report read failed: ${sanitizeError(error)}`]
    };
  }
}

async function readServiceReportCandidates(supabase: SupabaseClient): Promise<SupabaseReportRead> {
  try {
    const { data, error } = await supabase
      .from("report_candidates")
      .select(
        "id, report_type, title, summary, time_window_start, time_window_end, source_item_ids, status, confidence, created_at, updated_at, metadata"
      )
      .in("report_type", ["daily", "weekly"])
      .in("status", ["draft", "needs_review", "approved", "deferred", "published"])
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(reportLimit);

    if (error) {
      return {
        reports: [],
        warnings: [`report_candidates service read failed: ${sanitizeError(error.message)}`]
      };
    }

    return {
      reports: ((data ?? []) as unknown as SupabaseReportRow[])
        .map(withReportDraftFromMetadata)
        .map(normalizeCandidateReportRow)
        .filter((report): report is PublicReportSnapshot => Boolean(report)),
      warnings: []
    };
  } catch (error) {
    return {
      reports: [],
      warnings: [`report_candidates service read failed: ${sanitizeError(error)}`]
    };
  }
}

async function readServiceSavedReports(supabase: SupabaseClient): Promise<SupabaseReportRead> {
  try {
    const { data, error } = await supabase
      .from("reports")
      .select("id, type, title, language, time_window_start, time_window_end, body, status, created_at, published_at, metadata")
      .in("type", ["daily", "weekly"])
      .in("status", ["draft", "reviewed", "published"])
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(reportLimit);

    if (error) {
      return {
        reports: [],
        warnings: [`reports service read failed: ${sanitizeError(error.message)}`]
      };
    }

    return {
      reports: ((data ?? []) as unknown as SupabaseReportRow[])
        .map(withReportDraftFromMetadata)
        .map(normalizeSavedReportRow)
        .filter((report): report is PublicReportSnapshot => Boolean(report)),
      warnings: []
    };
  } catch (error) {
    return {
      reports: [],
      warnings: [`reports service read failed: ${sanitizeError(error)}`]
    };
  }
}

async function readLocalFallbackSnapshot(
  generatedAt: string,
  warnings: string[]
): Promise<PublicMirrorSnapshot> {
  const loaded = await loadRadarItems();
  const feed = buildRadarFeed(loaded);

  return buildSnapshot({
    caveats: feed.caveats,
    dataSource: loaded.dataSource,
    exactVisibleRows: feed.counts.total,
    fallbackUsed: true,
    generatedAt,
    items: feed.items.map(mapRetrievalItem),
    operationalCounts: await readOperationalCounts(feed.counts.total, 0),
    publicCoverage: await loadPublicDataCompletenessSummary(),
    reports: [],
    sourceKind: "local_files",
    warnings: [...warnings, ...loaded.warnings]
  });
}

async function readPreviousPublicSnapshot(
  generatedAt: string,
  warnings: string[]
): Promise<PublicMirrorSnapshot | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(outputPath, "utf8")) as Partial<PublicMirrorSnapshot>;
    const items = Array.isArray(parsed.radar_items) ? parsed.radar_items : [];
    const reports = Array.isArray(parsed.reports) ? parsed.reports : [];

    if (parsed.schema_version !== 1 || items.length < 50) {
      return null;
    }

    const previousWarnings = Array.isArray(parsed.source?.warnings) ? parsed.source.warnings : [];

    return sanitizePublicSnapshot({
      ...(parsed as PublicMirrorSnapshot),
      generated_at: generatedAt,
      source: {
        ...(parsed.source as PublicMirrorSnapshot["source"]),
        data_source: publicSnapshotDataSource(parsed.source?.data_source),
        local_data_used: true,
        warnings: publicSafeNotes([
          ...warnings,
          "Supabase public reads were unavailable during export; reused the previous public-safe Cloudflare snapshot instead of degrading to incomplete local data.",
          ...previousWarnings
        ])
      },
      counts: {
        ...(parsed.counts as PublicMirrorSnapshot["counts"]),
        report_snapshots: (parsed.counts?.report_snapshots ?? reports.length) as number,
        snapshot_radar_items: (parsed.counts?.snapshot_radar_items ?? items.length) as number,
        visible_radar_items: (parsed.counts?.visible_radar_items ?? items.length) as number
      }
    });
  } catch {
    return null;
  }
}

function buildSnapshot(input: {
  caveats: string[];
  dataSource: RetrievalDataSource;
  exactVisibleRows: number;
  fallbackUsed: boolean;
  generatedAt: string;
  items: PublicRadarSnapshotItem[];
  operationalCounts: OperationalCounts;
  publicCoverage: PublicDataCompletenessSummary;
  reports: PublicReportSnapshot[];
  sourceKind: SnapshotSourceKind;
  warnings: string[];
}): PublicMirrorSnapshot {
  const latest = latestTimestamp(input.items);
  const statusCounts = countStatuses(input.items);
  const rawEventLayer = buildEventLayer(input.items);
  const eventLayer = publicDisplayEventLayer(rawEventLayer);
  const reports = buildEventAwareReports(input.reports.map(publicSafeReport), eventLayer, latest?.value ?? null);
  const reportCitationCount = reports.reduce((count, report) => count + report.citations.length, 0);

  return {
    schema_version: 1,
    generated_at: input.generatedAt,
    reference_app_url: referenceAppUrl,
    public_site: {
      cloudflare_url: cloudflareUrl,
      reference_app_url: referenceAppUrl,
      purpose: "Primary Cloudflare public read surface for AI Industry Radar data.",
      read_only: true
    },
    source: {
      data_source: publicSnapshotDataSource(input.dataSource),
      kind: input.sourceKind,
      local_data_used: input.fallbackUsed,
      warnings: publicSafeNotes(input.warnings)
    },
    freshness: {
      latest_ingestion: input.operationalCounts.latest_ingestion,
      latest_timestamp: latest?.value ?? null,
      latest_timestamp_source: latest?.source ?? null,
      latest_understanding: input.operationalCounts.latest_understanding,
      note: latest
        ? `Latest public radar timestamp is ${latest.value} (${latest.source}).`
        : "No public radar freshness timestamp is available."
    },
    counts: {
      citations: input.items.length + reportCitationCount,
      entities: input.operationalCounts.entities,
      excluded: statusCounts.excluded,
      failed: statusCounts.failed,
      included: statusCounts.included,
      ingestion_runs: input.operationalCounts.ingestion_runs,
      item_entities: input.operationalCounts.item_entities,
      needs_review: statusCounts.needs_review,
      public_radar_items: input.operationalCounts.public_radar_items,
      radar_items: input.operationalCounts.radar_items,
      raw_items: input.operationalCounts.raw_items,
      report_candidates: input.operationalCounts.report_candidates,
      report_snapshots: reports.length,
      saved_report_candidates: reports.filter((report) => report.mode === "saved_candidate").length,
      scores: input.operationalCounts.scores,
      sources: input.operationalCounts.sources,
      snapshot_radar_items: input.items.length,
      understanding_runs: input.operationalCounts.understanding_runs,
      visible_radar_items: input.exactVisibleRows,
      event_clusters: eventLayer.event_count
    },
    coverage: {
      attempted_sources: input.publicCoverage.attemptedSources,
      automated_eligible_sources: input.publicCoverage.automatedEligibleSources,
      failed_source_reasons: input.publicCoverage.failedSourceReasons,
      failed_sources: input.publicCoverage.failedSources,
      failure_families: input.publicCoverage.failureFamilies,
      fetched_sources: input.publicCoverage.fetchedSources,
      label: "public snapshot",
      latest_refresh: input.publicCoverage.latestRefresh,
      public_radar_items: input.publicCoverage.publicRadarItems,
      radar_to_public_visibility: input.publicCoverage.rates.radarPublicVisibility,
      raw_to_radar_conversion: input.publicCoverage.rates.rawRadarConversion,
      skipped_source_reasons: input.publicCoverage.skippedSourceReasons,
      skipped_sources: input.publicCoverage.skippedSources,
      source_public_visibility: input.publicCoverage.rates.sourcePublicVisibility,
      source_to_raw_coverage: input.publicCoverage.rates.sourceRawCoverage,
      sources_total: input.publicCoverage.sourcesTotal,
      sources_with_public_items: input.publicCoverage.sourcesWithPublicItems
    },
    top_categories: countEntries(input.items.flatMap((item) => item.categories.map(labelize))),
    top_source_tiers: countEntries(input.items.map((item) => item.source_tier)),
    top_sources: countEntries(input.items.map((item) => item.source_name)),
    curated_events: eventLayer.curated_events,
    data_completeness_summary: {
      attempted_sources: input.publicCoverage.attemptedSources,
      automated_eligible_sources: input.publicCoverage.automatedEligibleSources,
      blocked_manual_sources: input.publicCoverage.blockedManualSources,
      failed_sources: input.publicCoverage.failedSources,
      fetched_sources: input.publicCoverage.fetchedSources,
      public_radar_items: input.publicCoverage.publicRadarItems,
      radar_items: input.publicCoverage.radarItems,
      radar_to_public_visibility: input.publicCoverage.rates.radarPublicVisibility,
      raw_items: input.publicCoverage.rawItems,
      raw_to_radar_conversion: input.publicCoverage.rates.rawRadarConversion,
      source_public_visibility: input.publicCoverage.rates.sourcePublicVisibility,
      sources_total: input.publicCoverage.sourcesTotal,
      sources_with_public_items: input.publicCoverage.sourcesWithPublicItems
    },
    event_cluster_items: eventLayer.event_cluster_items,
    event_clusters: eventLayer.event_clusters,
    event_count: eventLayer.event_count,
    failure_family_summary: input.publicCoverage.failureFamilies,
    report_quality_summary: {
      daily: reportQualitySummary(reports, "daily", eventLayer.curated_events),
      weekly: reportQualitySummary(reports, "weekly", eventLayer.curated_events)
    },
    radar_items: input.items,
    reports,
    source_health_summary: {
      "403": input.publicCoverage.failureFamilies["403"] ?? input.publicCoverage.failureFamilies.failed_403 ?? 0,
      duplicate_only: input.publicCoverage.failureFamilies.duplicate_only ?? 0,
      failed: input.publicCoverage.failedSources,
      low_relevance_excluded: input.publicCoverage.failureFamilies.low_relevance_excluded ?? 0,
      manual_blocked: input.publicCoverage.blockedManualSources,
      no_items: input.publicCoverage.failureFamilies.no_items ?? input.publicCoverage.failureFamilies.no_new_items ?? 0,
      rate_limit: input.publicCoverage.failureFamilies.rate_limit ?? 0,
      succeeded: input.publicCoverage.fetchedSources,
      timeout: input.publicCoverage.failureFamilies.timeout ?? 0,
      unsupported_source: input.publicCoverage.failureFamilies.unsupported_source ?? 0
    },
    timeline: eventLayer.timeline,
    caveats: publicSafeNotes([
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      input.fallbackUsed
        ? "This snapshot used local generated data because Supabase public reads were unavailable to the export process."
        : "Radar rows came from Supabase public-safe read views. Report candidates are projected to the same public-safe field allowlist during export.",
      ...input.caveats,
      ...input.warnings,
      ...input.operationalCounts.warnings
    ])
  };
}

function reportQualitySummary(
  reports: PublicReportSnapshot[],
  reportType: ReportPreviewType,
  curatedEvents: PublicEventCluster[]
): ReportQualitySummary | null {
  const report = reports.find((candidate) => candidate.report_type === reportType);

  if (!report) {
    return null;
  }

  const citationIds = new Set(report.citations.map((citation) => citation.id));
  const topEventIds = curatedEvents
    .filter((event) => event.related_item_ids.some((itemId) => citationIds.has(itemId)))
    .map((event) => event.event_cluster_id)
    .slice(0, 6);

  return {
    category_count: report.category_count,
    caveats: report.caveats,
    citation_count: report.citation_count,
    distinct_source_count: report.distinct_source_count,
    id: report.id,
    missing_evidence: report.missing_evidence,
    quality_gate_passed: report.quality_gate_passed,
    quality_gate_reasons: report.quality_gate_reasons,
    status: report.status,
    top_event_ids: topEventIds,
    usable_item_count: report.usable_item_count
  };
}

function publicDisplayEventLayer(layer: PublicEventLayer): PublicEventLayer {
  const events = layer.event_clusters.filter(isPublicDisplayEvent).sort(comparePublicEvents);
  const eventIds = new Set(events.map((event) => event.event_cluster_id));
  const curated = layer.curated_events.filter((event) => eventIds.has(event.event_cluster_id));
  const fallbackCurated = events.filter((event) => event.event_score >= 64).slice(0, 8);
  const curatedEvents = (curated.length > 0 ? curated : fallbackCurated).slice(0, 8);

  return {
    curated_events: curatedEvents,
    event_cluster_items: layer.event_cluster_items.filter((item) => eventIds.has(item.event_cluster_id)),
    event_clusters: events,
    event_count: events.length,
    timeline: layer.timeline.filter((entry) => eventIds.has(entry.event_cluster_id)).slice(0, 80)
  };
}

function isPublicDisplayEvent(event: PublicEventCluster) {
  return event.event_score_label !== "噪音/低相关" && event.event_score >= 45;
}

function comparePublicEvents(left: PublicEventCluster, right: PublicEventCluster) {
  return right.event_score - left.event_score ||
    right.source_count - left.source_count ||
    Date.parse(right.latest_seen_at) - Date.parse(left.latest_seen_at) ||
    left.canonical_title.localeCompare(right.canonical_title, "zh-CN");
}

function buildEventAwareReports(
  reports: PublicReportSnapshot[],
  eventLayer: PublicEventLayer,
  latestTimestamp: string | null
): PublicReportSnapshot[] {
  if (reports.length === 0 || eventLayer.event_clusters.length === 0) {
    return reports;
  }

  return reports.map((report) => eventAwareReport(report, selectReportEvents(report.report_type, eventLayer), latestTimestamp));
}

function selectReportEvents(reportType: ReportPreviewType, eventLayer: PublicEventLayer) {
  const preferred = reportType === "daily"
    ? [...eventLayer.curated_events, ...eventLayer.event_clusters]
    : eventLayer.event_clusters;
  const seen = new Set<string>();
  const limit = reportType === "daily" ? 8 : 24;

  return preferred
    .filter((event) => {
      if (seen.has(event.event_cluster_id)) return false;
      seen.add(event.event_cluster_id);
      return true;
    })
    .slice(0, limit);
}

function eventAwareReport(
  report: PublicReportSnapshot,
  selectedEvents: PublicEventCluster[],
  latestTimestamp: string | null
): PublicReportSnapshot {
  if (selectedEvents.length === 0) {
    return report;
  }

  const citations = reportEventCitations(selectedEvents);
  const relatedItemIds = dedupe(selectedEvents.flatMap((event) => event.related_item_ids));
  const categories = dedupe(selectedEvents.map((event) => event.category).filter(Boolean));
  const sourceNames = dedupe(citations.map((citation) => citation.source_name));
  const gate = eventReportQualityGate(report.report_type, {
    category_count: categories.length,
    citation_count: citations.length,
    distinct_source_count: sourceNames.length,
    usable_item_count: relatedItemIds.length
  });
  const reportLabel = report.report_type === "daily" ? "日报" : "周报";
  const multiSourceEvents = selectedEvents.filter((event) => event.source_count > 1);
  const latestLabel = latestTimestamp ? formatPublicDate(latestTimestamp) : "未知时间";
  const evidenceBoundary = `公开证据最新到 ${latestLabel}；当前页面展示的是公开快照，不代表今日实时全网覆盖。`;
  const summary = `${reportLabel}事件预览基于 ${selectedEvents.length} 个公开事件、${relatedItemIds.length} 条相关信号、${citations.length} 条引用和 ${sourceNames.length} 个来源生成；已过滤目录页、文档首页、仓库元数据等低事件性内容。`;

  return {
    ...report,
    category_count: categories.length,
    caveats: publicSafeNotes(dedupe([
      evidenceBoundary,
      "这是事件感知的公开报告视图；原始信号仍可在“全部信号”中审计。",
      multiSourceEvents.length === 0 ? "当前精选事件多为单源信号，写作时需要保留不确定性。" : "",
      ...report.caveats
    ])),
    citation_count: citations.length,
    citations,
    distinct_source_count: sourceNames.length,
    executive_summary: summary,
    missing_evidence: publicSafeNotes(dedupe([
      multiSourceEvents.length < 3 ? "多源确认事件数量仍偏少，需要补充官方博客、研究源、开源 release 与媒体/分析源的交叉证据。" : "",
      "X 和 WeChat 未自动抓取；相关信号只能通过人工或合规来源补充。",
      evidenceBoundary,
      ...report.missing_evidence
    ])),
    quality_gate: gate,
    quality_gate_passed: gate.passed,
    quality_gate_reasons: gate.reasons,
    sections: [
      {
        bullets: selectedEvents.slice(0, 6).map(eventReportBullet),
        caveats: selectedEvents.some((event) => event.source_count === 1) ? ["部分事件仍是单源确认，不能写成已被广泛验证的行业结论。"] : [],
        citations: citations.slice(0, 8).map((citation) => citation.id),
        summary: "按事件分数、来源可信度、来源多样性和新鲜度排序，优先保留能说明行业变化的事件。",
        title: "行业精选事件"
      },
      {
        bullets: multiSourceEvents.length > 0
          ? multiSourceEvents.slice(0, 6).map((event) => `${event.canonical_title}：${event.source_count} 个来源，覆盖 ${event.source_families.join("、")}。`)
          : ["本轮公开快照中多源确认不足，重点事件仍需要等待下一轮刷新或人工补证。"],
        caveats: [],
        citations: [],
        summary: `本轮报告候选中有 ${multiSourceEvents.length} 个多源确认事件；其余事件主要作为待跟踪信号处理。`,
        title: "多源确认与可信度"
      },
      {
        bullets: [
          evidenceBoundary,
          "目录页、文档首页、仓库元数据和低信息量 release tag 已从事件精选与报告正文中降级。",
          "公开报告不包含私有原文、供应商原始响应、内部模型运行细节、私有备注或运行日志。"
        ],
        caveats: [],
        citations: [],
        summary: "报告只使用公开安全字段，强调证据边界和数据缺口。",
        title: "证据边界"
      }
    ],
    source_item_count: relatedItemIds.length,
    status: gate.passed ? report.status : "needs_review",
    summary,
    title: `AI 行业雷达${reportLabel} - 事件预览`,
    usable_item_count: relatedItemIds.length
  };
}

function reportEventCitations(events: PublicEventCluster[]) {
  const byKey = new Map<string, PublicReportSnapshot["citations"][number]>();

  for (const event of events) {
    for (const citation of event.citations) {
      const key = citation.item_id || citation.url;
      if (!byKey.has(key)) {
        byKey.set(key, {
          collected_at: citation.collected_at,
          id: citation.item_id,
          published_at: citation.published_at,
          source_name: citation.source_name,
          title: citation.title,
          url: citation.url
        });
      }
    }
  }

  return [...byKey.values()];
}

function eventReportBullet(event: PublicEventCluster) {
  return `${event.canonical_title}：${event.summary_zh}（${event.event_score_label}，${event.source_count} 个来源，${event.source_families.join("、")}）`;
}

function eventReportQualityGate(
  reportType: ReportPreviewType,
  metrics: Pick<ReportQualityGate, "usable_item_count" | "citation_count" | "distinct_source_count" | "category_count">
): ReportQualityGate {
  const thresholds = reportType === "daily"
    ? { categories: 2, citations: 3, distinct_sources: 2, usable_items: 5 }
    : { categories: 3, citations: 8, distinct_sources: 5, usable_items: 20 };
  const reasons = [
    metrics.usable_item_count < thresholds.usable_items ? `${metrics.usable_item_count} 条可用条目低于${reportType === "daily" ? "日报" : "周报"}最低要求 ${thresholds.usable_items} 条` : "",
    metrics.citation_count < thresholds.citations ? `${metrics.citation_count} 条引用低于${reportType === "daily" ? "日报" : "周报"}最低要求 ${thresholds.citations} 条` : "",
    metrics.distinct_source_count < thresholds.distinct_sources ? `${metrics.distinct_source_count} 个独立来源低于${reportType === "daily" ? "日报" : "周报"}最低要求 ${thresholds.distinct_sources} 个` : "",
    metrics.category_count < thresholds.categories ? `${metrics.category_count} 个类别低于${reportType === "daily" ? "日报" : "周报"}最低要求 ${thresholds.categories} 个` : ""
  ].filter(Boolean);

  return {
    category_count: metrics.category_count,
    category_gate_applicable: true,
    citation_count: metrics.citation_count,
    distinct_source_count: metrics.distinct_source_count,
    passed: reasons.length === 0,
    reasons,
    report_type: reportType,
    thresholds,
    usable_item_count: metrics.usable_item_count
  };
}

function formatPublicDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

async function readOperationalCounts(publicRadarFallback: number, reportCandidatesFallback: number): Promise<OperationalCounts> {
  const empty: OperationalCounts = {
    sources: null,
    raw_items: null,
    radar_items: null,
    public_radar_items: publicRadarFallback,
    report_candidates: reportCandidatesFallback,
    ingestion_runs: null,
    understanding_runs: null,
    entities: null,
    item_entities: null,
    scores: null,
    latest_ingestion: null,
    latest_understanding: null,
    warnings: []
  };
  const serviceStatus = getSupabaseServiceStatus();

  if (!serviceStatus.publicConfigConfigured || !serviceStatus.serviceRoleConfigured) {
    return {
      ...empty,
      warnings: ["Supabase service count access is unavailable; public snapshot counts are limited to public views."]
    };
  }

  try {
    const supabase = getSupabaseServiceClient();
    const tableNames = [
      "sources",
      "raw_items",
      "radar_items",
      "public_radar_items",
      "report_candidates",
      "ingestion_runs",
      "understanding_runs",
      "entities",
      "item_entities",
      "scores"
    ] as const;
    const results = await Promise.all(tableNames.map((table) => exactCount(supabase, table)));
    const counts = Object.fromEntries(results.map((result) => [result.table, result.count]));
    const [ingestionRun, understandingRun] = await Promise.all([
      supabase
        .from("ingestion_runs")
        .select("finished_at,started_at")
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(1),
      supabase
        .from("understanding_runs")
        .select("ended_at,started_at")
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(1)
    ]);

    return {
      ...empty,
      ...counts,
      latest_ingestion: latestRunTimestamp((ingestionRun.data ?? [])[0] as Record<string, unknown> | undefined, "finished_at"),
      latest_understanding: latestRunTimestamp((understandingRun.data ?? [])[0] as Record<string, unknown> | undefined, "ended_at"),
      warnings: [
        ...results.map((result) => result.warning ?? ""),
        ingestionRun.error ? `ingestion_runs latest timestamp failed: ${sanitizeError(ingestionRun.error.message)}` : "",
        understandingRun.error ? `understanding_runs latest timestamp failed: ${sanitizeError(understandingRun.error.message)}` : ""
      ].filter(Boolean)
    };
  } catch (error) {
    return {
      ...empty,
      warnings: [`Supabase operational counts unavailable: ${sanitizeError(error)}`]
    };
  }
}

function latestRunTimestamp(row: Record<string, unknown> | undefined, endField: "ended_at" | "finished_at") {
  const ended = text(row?.[endField]);
  const started = text(row?.started_at);
  return ended || started || null;
}

async function exactCount(supabase: SupabaseClient, table: string) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });

  if (error) {
    return {
      table,
      count: null,
      warning: `${table} count failed: ${sanitizeError(error.message)}`
    };
  }

  return {
    table,
    count: count ?? 0
  };
}

function normalizeSupabaseRadarRow(row: SupabaseRadarRow): PublicRadarSnapshotItem | null {
  const id = text(row.local_id) || text(row.id);
  const title = text(row.title);
  const url = text(row.url);
  const sourceName = text(row.source_name);
  const collectedAt = text(row.collected_at);
  const processedAt = text(row.processed_at) || text(row.updated_at) || collectedAt;

  if (!id || !title || !isPublicHttpUrl(url) || !sourceName || !collectedAt || !processedAt) {
    return null;
  }

  return {
    id,
    categories: categories(row.categories ?? row.topics),
    collected_at: collectedAt,
    confidence: score(row.confidence),
    evidence_notes: stringArray(row.evidence_notes, 8, 600),
    language: normalizeLanguage(row.language),
    processed_at: processedAt,
    published_at: optionalText(row.published_at),
    scores: {
      ai_relevance: score(row.ai_relevance_score),
      credibility: score(row.credibility_score),
      freshness: score(row.freshness_score),
      importance: score(row.importance_score),
      novelty: score(row.novelty_score),
      overall: score(row.overall_score)
    },
    source_name: sourceName,
    source_tier: text(row.source_tier) || "unreviewed",
    status: normalizeStatus(row.understanding_status ?? row.status),
    summary_en: optionalText(row.summary_en),
    summary_zh: optionalText(row.summary_zh),
    tags: stringArray(row.tags, 12, 80),
    title,
    url,
    why_it_matters: optionalText(row.why_it_matters)
  };
}

function mapRetrievalItem(item: RetrievalRadarItem): PublicRadarSnapshotItem {
  return {
    id: item.id,
    categories: item.categories,
    collected_at: item.collected_at,
    confidence: item.confidence,
    evidence_notes: item.evidence_notes.slice(0, 8),
    language: item.language,
    processed_at: item.processed_at,
    published_at: item.published_at,
    scores: {
      ai_relevance: item.ai_relevance_score,
      credibility: item.credibility_score,
      freshness: item.freshness_score,
      importance: item.importance_score,
      novelty: item.novelty_score,
      overall: item.overall_score
    },
    source_name: item.source_name,
    source_tier: item.source_tier,
    status: item.status,
    summary_en: item.summary_en || undefined,
    summary_zh: item.summary_zh || undefined,
    tags: item.tags.slice(0, 12),
    title: item.title,
    url: item.url,
    why_it_matters: item.why_it_matters
  };
}

function normalizeCandidateReportRow(row: SupabaseReportRow): PublicReportSnapshot | null {
  const id = text(row.id);
  const reportType = reportTypeValue(row.report_type);
  const title = text(row.title);

  if (!id || !reportType || !title) {
    return null;
  }

  const draft = record(row.report_draft);
  const sourceItemIds = stringArray(row.source_item_ids, 100, 120);
  const draftSourceItemIds = stringArray(draft.source_item_ids, 100, 120);
  const citations = normalizeReportCitations(draft.citations);
  const sourceItemCount = sourceItemIds.length || draftSourceItemIds.length;
  const qualityGate = normalizeReportQualityGate(draft.quality_gate, {
    categoryCount: integer(draft.category_count),
    categoryGateApplicable: integer(draft.category_count) > 0,
    citationCount: integer(draft.citation_count, citations.length),
    distinctSourceCount: integer(draft.distinct_source_count, distinctSourcesFromCitations(citations)),
    reportType,
    usableItemCount: integer(draft.usable_item_count, sourceItemCount)
  });

  return {
    id,
    caveats: stringArray(draft.caveats, 8, 700),
    citations,
    confidence: optionalScore(row.confidence),
    data_source: dataSourceValue(draft.data_source) ?? "supabase_radar_items",
    executive_summary: optionalText(draft.executive_summary),
    generated_at: optionalText(draft.generated_at) ?? optionalText(row.updated_at),
    missing_evidence: stringArray(draft.missing_evidence, 8, 700),
    mode: "saved_candidate",
    report_type: reportType,
    saved_at: optionalText(row.created_at),
    sections: normalizeReportSections(draft.sections),
    source_item_count: sourceItemCount,
    ...reportQualityGateFields(qualityGate),
    status: qualityGate.passed ? text(row.status) || "draft" : "needs_review",
    summary:
      text(row.summary, 1200) ||
      text(draft.one_sentence_summary, 1200) ||
      text(draft.executive_summary, 1200) ||
      "No public candidate summary recorded.",
    time_window: normalizeReportTimeWindow(row, draft),
    title
  };
}

function withReportDraftFromMetadata(row: SupabaseReportRow): SupabaseReportRow {
  const metadata = record(row.metadata);

  return {
    ...row,
    report_draft: isRecord(metadata.report_draft) ? metadata.report_draft : row.report_draft
  };
}

function normalizeSavedReportRow(row: SupabaseReportRow): PublicReportSnapshot | null {
  const id = text(row.id);
  const reportType = reportTypeValue(row.type);
  const title = text(row.title);

  if (!id || !reportType || !title) {
    return null;
  }

  const draft = record(row.report_draft);
  const draftSourceItemIds = stringArray(draft.source_item_ids, 100, 120);
  const citations = normalizeReportCitations(draft.citations);
  const qualityGate = normalizeReportQualityGate(draft.quality_gate, {
    categoryCount: integer(draft.category_count),
    categoryGateApplicable: integer(draft.category_count) > 0,
    citationCount: integer(draft.citation_count, citations.length),
    distinctSourceCount: integer(draft.distinct_source_count, distinctSourcesFromCitations(citations)),
    reportType,
    usableItemCount: integer(draft.usable_item_count, draftSourceItemIds.length)
  });

  return {
    id,
    caveats: stringArray(draft.caveats, 8, 700),
    citations,
    data_source: dataSourceValue(draft.data_source) ?? "supabase_radar_items",
    executive_summary: text(draft.executive_summary, 2200) || text(row.body, 2200) || undefined,
    generated_at: optionalText(draft.generated_at) ?? optionalText(row.published_at) ?? optionalText(row.created_at),
    missing_evidence: stringArray(draft.missing_evidence, 8, 700),
    mode: "saved_report",
    report_type: reportType,
    saved_at: optionalText(row.published_at) ?? optionalText(row.created_at),
    sections: normalizeReportSections(draft.sections),
    source_item_count: draftSourceItemIds.length,
    ...reportQualityGateFields(qualityGate),
    status: text(row.status) || "draft",
    summary:
      text(draft.one_sentence_summary, 1200) ||
      firstParagraph(text(row.body, 2200)) ||
      "No public report summary recorded.",
    time_window: normalizeReportTimeWindow(row, draft),
    title
  };
}

function normalizeReportTimeWindow(row: SupabaseReportRow, draft: Record<string, unknown>) {
  const draftWindow = record(draft.time_window);
  const start = text(row.time_window_start) || text(draftWindow.start) || new Date(0).toISOString();
  const end = text(row.time_window_end) || text(draftWindow.end) || new Date().toISOString();

  return {
    end,
    start
  };
}

function normalizeReportSections(value: unknown): PublicReportSnapshot["sections"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((section): PublicReportSnapshot["sections"][number] | null => {
      if (!isRecord(section)) {
        return null;
      }

      const title = text(section.title, 240);
      if (!title) {
        return null;
      }

      return {
        bullets: stringArray(section.bullets, 8, 700),
        caveats: stringArray(section.caveats, 5, 700),
        citations: stringArray(section.citations, 8, 220),
        summary: text(section.summary, 1200) || "No public section summary recorded.",
        title
      };
    })
    .filter((section): section is PublicReportSnapshot["sections"][number] => Boolean(section))
    .slice(0, 6);
}

function normalizeReportCitations(value: unknown): PublicReportSnapshot["citations"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((citation): PublicReportSnapshot["citations"][number] | null => {
      if (!isRecord(citation)) {
        return null;
      }

      const id = text(citation.id, 160);
      const title = text(citation.title, 500);
      const url = text(citation.url, 1200);

      if (!id || !title || !isPublicHttpUrl(url)) {
        return null;
      }

      return {
        id,
        collected_at: optionalText(citation.collected_at),
        confidence: optionalScore(citation.confidence),
        published_at: optionalText(citation.published_at),
        source_name: text(citation.source_name, 240) || "Unknown source",
        status: statusValue(citation.status) ?? undefined,
        title,
        url
      };
    })
    .filter((citation): citation is PublicReportSnapshot["citations"][number] => Boolean(citation))
    .slice(0, 24);
}

function readErrorMessage(tableName: string, error: SupabaseReadError) {
  if (isMissingPublicViewError(tableName, error)) {
    return `${tableName} is not available to anon reads; local generated data was used.`;
  }

  return `${tableName} read failed: ${sanitizeError(error.message)}`;
}

function isMissingPublicViewError(tableName: string, error: SupabaseReadError) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (haystack.includes(tableName.toLowerCase()) &&
      (haystack.includes("does not exist") ||
        haystack.includes("not find") ||
        haystack.includes("not found") ||
        haystack.includes("schema cache")))
  );
}

function latestTimestamp(items: PublicRadarSnapshotItem[]) {
  return items
    .flatMap((item) => [
      timestampCandidate(item.processed_at, "processed_at"),
      timestampCandidate(item.collected_at, "collected_at"),
      timestampCandidate(item.published_at, "published_at")
    ])
    .filter((candidate): candidate is { value: string; source: string } => Boolean(candidate))
    .sort((left, right) => Date.parse(right.value) - Date.parse(left.value))[0];
}

function timestampCandidate(value: string | undefined, source: string) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return null;
  }

  return {
    source,
    value
  };
}

function countStatuses(items: PublicRadarSnapshotItem[]) {
  return items.reduce<Record<UnderstandingStatus, number>>(
    (counts, item) => {
      counts[item.status] += 1;
      return counts;
    },
    {
      excluded: 0,
      failed: 0,
      included: 0,
      needs_review: 0
    }
  );
}

function countEntries(values: string[]): CountEntry[] {
  const counts = values.reduce<Record<string, number>>((accumulator, value) => {
    const label = value.trim();
    if (label) {
      accumulator[label] = (accumulator[label] ?? 0) + 1;
    }
    return accumulator;
  }, {});

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([label, count]) => ({ count, label }));
}

function compareReports(left: PublicReportSnapshot, right: PublicReportSnapshot) {
  const leftTime = Date.parse(left.saved_at ?? left.generated_at ?? left.time_window.end);
  const rightTime = Date.parse(right.saved_at ?? right.generated_at ?? right.time_window.end);

  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
}

function mergeReports(reports: PublicReportSnapshot[]) {
  const byId = new Map<string, PublicReportSnapshot>();

  for (const report of reports) {
    if (!byId.has(report.id)) {
      byId.set(report.id, report);
    }
  }

  return Array.from(byId.values());
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function firstParagraph(value: string) {
  return value.split(/\n\s*\n/)[0]?.trim() ?? value;
}

function categories(value: unknown): RadarCategory[] {
  const allowed = new Set<RadarCategory>(RADAR_CATEGORIES);
  const values = stringArray(value, 10, 80).filter((category): category is RadarCategory =>
    allowed.has(category as RadarCategory)
  );

  return values.length > 0 ? values : ["other"];
}

function normalizeLanguage(value: unknown): RetrievalLanguage {
  return value === "zh" || value === "en" || value === "mixed" || value === "unknown" ? value : "unknown";
}

function normalizeStatus(value: unknown): UnderstandingStatus {
  return statusValue(value) ?? "needs_review";
}

function statusValue(value: unknown): UnderstandingStatus | null {
  return value === "included" || value === "excluded" || value === "needs_review" || value === "failed"
    ? value
    : null;
}

function reportTypeValue(value: unknown): ReportPreviewType | null {
  return value === "daily" || value === "weekly" ? value : null;
}

function dataSourceValue(value: unknown): RetrievalDataSource | null {
  return value === "supabase_radar_items" ||
    value === "local_understanding_output" ||
    value === "mock_data" ||
    value === "empty"
    ? value
    : null;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maxLength = 5000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || undefined;
}

function stringArray(value: unknown, limit: number, itemMaxLength: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => text(item, itemMaxLength)).filter(Boolean))).slice(0, limit);
}

function score(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numberValue));
}

function optionalScore(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, numberValue));
}

function integer(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return Math.floor(numberValue);
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sanitizePublicSnapshot(snapshot: PublicMirrorSnapshot): PublicMirrorSnapshot {
  const eventLayer = publicDisplayEventLayer(buildEventLayer(snapshot.radar_items));
  const reports = buildEventAwareReports(
    snapshot.reports.map(publicSafeReport),
    eventLayer,
    snapshot.freshness.latest_timestamp
  );

  return {
    ...snapshot,
    counts: {
      ...snapshot.counts,
      event_clusters: eventLayer.event_count
    },
    source: {
      ...snapshot.source,
      data_source: publicSnapshotDataSource(snapshot.source.data_source),
      warnings: publicSafeNotes(snapshot.source.warnings)
    },
    curated_events: eventLayer.curated_events,
    event_cluster_items: eventLayer.event_cluster_items,
    event_clusters: eventLayer.event_clusters,
    event_count: eventLayer.event_count,
    report_quality_summary: {
      daily: publicSafeReportQuality(reportQualitySummary(reports, "daily", eventLayer.curated_events)),
      weekly: publicSafeReportQuality(reportQualitySummary(reports, "weekly", eventLayer.curated_events))
    },
    reports,
    timeline: eventLayer.timeline,
    caveats: publicSafeNotes(snapshot.caveats)
  };
}

function publicSafeReport(report: PublicReportSnapshot): PublicReportSnapshot {
  return {
    ...report,
    data_source: publicSnapshotDataSource(report.data_source),
    title: publicSafeNote(report.title),
    summary: publicSafeNote(report.summary),
    executive_summary: report.executive_summary ? publicSafeNote(report.executive_summary) : undefined,
    quality_gate_reasons: publicSafeNotes(report.quality_gate_reasons),
    quality_gate: {
      ...report.quality_gate,
      reasons: publicSafeNotes(report.quality_gate.reasons)
    },
    sections: report.sections.map((section) => ({
      ...section,
      summary: publicSafeNote(section.summary),
      bullets: publicSafeNotes(section.bullets),
      caveats: publicSafeNotes(section.caveats)
    })),
    caveats: publicSafeNotes(report.caveats),
    missing_evidence: publicSafeNotes(report.missing_evidence)
  };
}

function publicSafeReportQuality(summary: ReportQualitySummary | null): ReportQualitySummary | null {
  if (!summary) {
    return null;
  }

  return {
    ...summary,
    quality_gate_reasons: publicSafeNotes(summary.quality_gate_reasons),
    missing_evidence: publicSafeNotes(summary.missing_evidence),
    caveats: publicSafeNotes(summary.caveats)
  };
}

function publicSnapshotDataSource(value: string | null | undefined) {
  if (!value) {
    return "public_evidence_store";
  }

  if (value === "supabase_radar_items" || value === "public_radar_items" || value.startsWith("supabase_")) {
    return "public_evidence_store";
  }

  if (value === "local_understanding_output" || value.startsWith("local_")) {
    return "local_evidence_files";
  }

  if (value === "mock_data") {
    return "demo_evidence";
  }

  if (value === "empty") {
    return "empty_evidence";
  }

  return value;
}

function publicSafeNotes(values: string[]) {
  return dedupe(values.map(publicSafeNote));
}

function publicSafeNote(value: string) {
  return value
    .replace(
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "Cloudflare Pages 是主要公开只读页面；登录、Admin、服务端操作和写入流程不在公开页面中运行。"
    )
    .replace(
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      "只纳入公开安全的雷达和报告字段；私有原文、供应商元数据、内部备注、service-role 访问和密钥均已排除。"
    )
    .replace(
      "Read-only Supabase public radar retrieval was used; no Supabase write path ran.",
      "使用公开证据库进行检索；只展示可公开引用的结构化字段。"
    )
    .replace(
      "Radar rows came from Supabase public-safe read views. Report candidates are projected to the same public-safe field allowlist during export.",
      "雷达条目来自公开安全证据视图；报告候选在导出时投影到同一组公开安全字段。"
    )
    .replace(
      "No live DeepSeek call, Supabase write, or scheduled persistence job was run.",
      "报告基于当前已入库证据，仍需人工复核后发布。"
    )
    .replace(
      "Live DeepSeek synthesis failed; deterministic report draft is shown instead.",
      "DeepSeek 生成未完成，当前展示基于证据的可复核草稿。"
    )
    .replace("This is a deterministic preview, not a published report.", "这是证据预览，不是已发布报告。")
    .replace(
      "Supabase coverage depends on rows already persisted into the public retrieval view.",
      "公开覆盖范围取决于已经入库的可公开证据。"
    )
    .replace(
      "Supabase public reads were unavailable during export; reused the previous public-safe Cloudflare snapshot instead of degrading to incomplete local data.",
      "本次导出无法读取公开证据库，已复用上一版 public-safe Cloudflare 快照，避免降级为空数据。"
    )
    .replace(
      "Supabase public radar view returned no public-safe rows; local generated radar data was used.",
      "公开雷达视图没有返回可展示条目，本次导出使用本地生成数据。"
    )
    .replace(
      "This snapshot used local generated data because Supabase public reads were unavailable to the export process.",
      "本次导出使用本地生成数据，因为导出进程无法读取公开证据库。"
    )
    .replace(
      "This surface shows available AI Radar evidence only; it is not a claim of complete current AI industry coverage.",
      "此页面只展示当前可用的 AI 行业雷达证据，不声称覆盖完整实时行业。"
    )
    .replace(
      /(\d+) item\(s\) are marked needs_review and require human confirmation before confident synthesis\./g,
      "$1 条标记为待复核，需要人工确认后才能进行高置信综合。"
    )
    .replace(/Deterministic daily preview from (\d+) usable radar item\(s\)\./g, "日报证据预览基于 $1 条可用雷达条目。")
    .replace(/Deterministic weekly preview from (\d+) usable radar item\(s\)\./g, "周报证据预览基于 $1 条可用雷达条目。")
    .replace(/Weekly AI Radar preview - ending /g, "AI 行业雷达周报预览 - 截至 ")
    .replace(/Daily AI Radar preview - /g, "AI 行业雷达日报预览 - ")
    .replace(/(\d+) included and (\d+) needs_review item\(s\)\./g, "$1 条已纳入，$2 条待复核。")
    .replace(/(\d+) radar item\(s\) matched this section\./g, "$1 条雷达条目匹配本章节。")
    .replace(/(\d+) still need review\./g, "$1 条仍需复核。")
    .replace(/Visible categories: ([^.]+)\./g, (_, categories: string) => {
      return `可见类别： ${categories
        .split(",")
        .map((category) => publicReportCategoryLabel(category.trim()))
        .join("、")}。`;
    })
    .replace(/Top visible signal:/g, "最高可见信号：")
    .replace(/(最高可见信号：[^.。]+) from ([^.。]+)([.。])/g, "$1 来自 $2$3")
    .replace(/Model \/ product \/ company updates/g, "模型/产品/公司更新")
    .replace(/Research \/ open-source/g, "研究/开源")
    .replace(/Agents \/ products/g, "智能体/产品")
    .replace(/Business \/ ecosystem/g, "商业/生态")
    .replace(/Weak signals \/ needs_review/g, "弱信号/待复核")
    .replace(/No specific article content is included\./g, "未采集到具体文章正文。")
    .replace(/needs_review/g, "待复核")
    .replace(/included/g, "已纳入")
    .replace(/([a-z_]+) count failed: TypeError: fetch failed/g, (_, table: string) => `${publicMetricLabel(table)}计数读取失败：网络连接失败`)
    .replace(/([a-z_]+) latest timestamp failed: TypeError: fetch failed/g, (_, table: string) => `${publicMetricLabel(table)}最新时间读取失败：网络连接失败`)
    .replace(/public_radar_items read failed: TypeError: fetch failed/g, "公开雷达条目读取失败：网络连接失败")
    .replace(/public_report_candidates read failed: TypeError: fetch failed/g, "公开报告候选读取失败：网络连接失败")
    .replace(/public_reports read failed: TypeError: fetch failed/g, "公开报告读取失败：网络连接失败")
    .replace(/service report read failed: TypeError: fetch failed/g, "报告服务读取失败：网络连接失败")
    .replace(/report_candidates service read failed: TypeError: fetch failed/g, "报告候选服务读取失败：网络连接失败")
    .replace(/reports service read failed: TypeError: fetch failed/g, "报告服务读取失败：网络连接失败");
}

function publicReportCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    agent: "智能体",
    benchmark: "基准",
    business: "商业",
    infrastructure: "基础设施",
    model_release: "模型发布",
    open_source: "开源",
    opinion: "观点",
    other: "其他",
    policy: "政策",
    product_update: "产品更新",
    research: "研究",
    safety: "安全",
    tooling: "工具"
  };

  return labels[value] ?? value.replace(/_/g, " ");
}

function publicMetricLabel(value: string) {
  const labels: Record<string, string> = {
    entities: "实体",
    ingestion_runs: "采集运行",
    item_entities: "条目实体",
    public_radar_items: "公开雷达条目",
    radar_items: "雷达条目",
    raw_items: "原始条目",
    report_candidates: "报告候选",
    scores: "评分",
    sources: "来源",
    understanding_runs: "理解运行"
  };

  return labels[value] ?? "公开数据";
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 400);
}

main().catch((error: unknown) => {
  console.error(`Cloudflare public snapshot failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
