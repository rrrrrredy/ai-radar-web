import "@/lib/config/load-cli-env";

import dns from "node:dns/promises";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadPublicDataCompletenessSummary,
  type PublicDataCompletenessSummary
} from "@/lib/data-completeness/public-summary";
import {
  buildEventLayer,
  filterPublicDisplayEventLayer,
  type PublicEventLayer,
  type PublicEventCluster,
  type PublicEventClusterItem,
  type PublicTimelineEntry
} from "@/lib/events/clustering";
import { buildRadarFeed } from "@/lib/radar/feed";
import { assessPublicSignalQuality } from "@/lib/radar/public-signal-quality";
import { isExternalSourceRepairSignal } from "@/lib/radar/public-source-boundary";
import { publicInternetHttpUrl } from "@/lib/public-url";
import { loadRadarItems } from "@/lib/retrieval/load-radar-items";
import type {
  RetrievalDataSource,
  RetrievalLanguage,
  RetrievalRadarItem
} from "@/lib/retrieval/types";
import { loadLocalPublicReportSnapshotRecords } from "@/lib/reports/local-public-reports";
import {
  distinctSourcesFromCitations,
  normalizeReportQualityGate,
  reportQualityGateFields
} from "@/lib/reports/quality-gates";
import type { ReportPreviewType, ReportQualityGate } from "@/lib/reports/types";
import { getSupabaseServerReadClient } from "@/lib/supabase/server-read";
import { getSupabasePublicConfig } from "@/lib/config";
import {
  ENTITY_TYPES,
  RADAR_CATEGORIES,
  type RadarCategory,
  type UnderstandingEntity,
  type UnderstandingEntityType,
  type UnderstandingStatus
} from "@/lib/understanding/types";

const cloudflareUrl = "https://ai-industry-radar.pages.dev";
const referenceAppUrl = "https://ai-radar-web-luosongred-5507s-projects.vercel.app";
const outputPath = path.join(process.cwd(), "dist", "cloudflare-pages", "data", "radar-snapshot.json");
const radarLimit = 500;
const reportLimit = 24;
const publicEntityTypes = new Set<string>(ENTITY_TYPES);

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
  entities: PublicRadarSnapshotEntity[];
};

export type PublicRadarSnapshotEntity = {
  name: string;
  type: UnderstandingEntityType;
  confidence: number;
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
  source_item_ids: string[];
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

type PublicSnapshotCountsInput = {
  public_radar_items: number | null;
  report_candidates: number | null;
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
  source_health_scope: {
    started_at: string | null;
    finished_at: string | null;
    attempted_sources: number;
  };
  source_health_by_family: Array<{
    family: string;
    configured: number;
    automated_eligible: number;
    attempted: number;
    skipped: number;
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
  }>;
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
    public_radar_items: number | null;
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

function debugStep(message: string) {
  if (process.env.CLOUDFLARE_SNAPSHOT_DEBUG === "true") {
    console.error(`[cloudflare:snapshot] ${message}`);
    const debugFile = process.env.CLOUDFLARE_SNAPSHOT_DEBUG_FILE;
    if (debugFile) {
      fsSync.appendFileSync(debugFile, `[${new Date().toISOString()}] ${message}\n`, "utf8");
    }
  }
}

async function main() {
  debugStep("main:start");
  const snapshot = await createPublicSnapshot();
  debugStep(`main:snapshot-ready rows=${snapshot.radar_items.length}`);
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
  debugStep("create:start");

  if (process.env.CLOUDFLARE_SNAPSHOT_READ_SUPABASE !== "true") {
    debugStep("create:local-first");
    const warnings = [
      "Cloudflare static snapshot export used public-safe local snapshot mode; set CLOUDFLARE_SNAPSHOT_READ_SUPABASE=true to opt into Supabase public reads."
    ];
    const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, warnings);
    if (previousSnapshot) {
      debugStep("create:previous-found");
      return mergeLatestActivationSnapshot(previousSnapshot, generatedAt, warnings);
    }

    debugStep("create:previous-missing");
    return readLocalFallbackSnapshot(generatedAt, warnings);
  }

  const supabase = getSupabaseServerReadClient();

  if (supabase) {
    const preflight = await supabaseReadPreflight();
    if (!preflight.ok) {
      const warnings = [
        `Supabase public reads skipped before export: ${preflight.reason}`
      ];
      const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, warnings);
      if (previousSnapshot) {
        return mergeLatestActivationSnapshot(previousSnapshot, generatedAt, warnings);
      }

      return readLocalFallbackSnapshot(generatedAt, warnings);
    }

    let supabaseSnapshot: { snapshot: PublicMirrorSnapshot | null; warnings: string[] };
    try {
      supabaseSnapshot = await withTimeout(
        readSupabaseSnapshot(supabase, generatedAt),
        45_000,
        "Supabase public reads timed out before export."
      );
    } catch (error) {
      const warnings = [`Supabase public reads failed before export fallback: ${sanitizeError(error)}`];
      const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, warnings);
      if (previousSnapshot) {
        return mergeLatestActivationSnapshot(previousSnapshot, generatedAt, warnings);
      }

      return readLocalFallbackSnapshot(generatedAt, warnings);
    }

    if (supabaseSnapshot.snapshot) {
      return supabaseSnapshot.snapshot;
    }

    const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, supabaseSnapshot.warnings);
    if (previousSnapshot) {
      return mergeLatestActivationSnapshot(previousSnapshot, generatedAt, supabaseSnapshot.warnings);
    }

    return readLocalFallbackSnapshot(generatedAt, supabaseSnapshot.warnings);
  }

  const warnings = [
    "Supabase public URL and anon key are not configured for this process; local generated radar data was used."
  ];
  const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, warnings);
  if (previousSnapshot) {
    return mergeLatestActivationSnapshot(previousSnapshot, generatedAt, warnings);
  }

  return readLocalFallbackSnapshot(generatedAt, warnings);
}

async function supabaseReadPreflight(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const publicConfig = getSupabasePublicConfig();
  if (!publicConfig) {
    return { ok: false, reason: "public Supabase config is not available." };
  }

  try {
    const hostname = new URL(publicConfig.url).hostname;
    await withTimeout(dns.lookup(hostname), 5_000, "Supabase hostname lookup timed out.");

    const healthUrl = new URL("/rest/v1/", publicConfig.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch(healthUrl, {
        headers: {
          apikey: publicConfig.anonKey
        },
        signal: controller.signal
      });

      if (response.status >= 500) {
        return { ok: false, reason: `Supabase REST preflight returned HTTP ${response.status}.` };
      }
    } finally {
      clearTimeout(timeout);
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: sanitizeError(error) };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function readSupabaseSnapshot(
  supabase: SupabaseClient,
  generatedAt: string
): Promise<{ snapshot: PublicMirrorSnapshot | null; warnings: string[] }> {
  const [radar, reports] = await Promise.all([
    readSupabaseRadarItems(supabase),
    readSupabaseReports(supabase)
  ]);
  const publicCounts = publicSnapshotCounts(radar.count, reports.reports.length);
  const warnings = [...radar.warnings, ...reports.warnings, ...publicCounts.warnings];

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
      publicCounts,
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
          "entities",
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
  const [candidates, reports] = await Promise.all([
    readPublicReportCandidates(supabase),
    readPublicReports(supabase)
  ]);

  return {
    reports: mergeReports([...candidates.reports, ...reports.reports])
      .sort(compareReports)
      .slice(0, reportLimit),
    warnings: [...candidates.warnings, ...reports.warnings]
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

async function readLocalFallbackSnapshot(
  generatedAt: string,
  warnings: string[]
): Promise<PublicMirrorSnapshot> {
  const [loaded, localReports] = await Promise.all([
    loadRadarItems(),
    readLocalPublicReports()
  ]);
  const feed = buildRadarFeed(loaded);

  return buildSnapshot({
    caveats: feed.caveats,
    dataSource: loaded.dataSource,
    exactVisibleRows: feed.counts.total,
    fallbackUsed: true,
    generatedAt,
    items: feed.items.map(mapRetrievalItem),
    publicCounts: publicSnapshotCounts(feed.counts.total, 0),
    publicCoverage: await loadPublicDataCompletenessSummary(),
    reports: localReports.reports,
    sourceKind: "local_files",
    warnings: [...warnings, ...loaded.warnings, ...localReports.warnings]
  });
}

async function readLocalPublicReports(): Promise<SupabaseReportRead> {
  const loaded = await loadLocalPublicReportSnapshotRecords();
  const reports = loaded.records
    .map((record) => publicSafeReport(record as PublicReportSnapshot))
    .filter(isPublicReportSnapshotCandidate)
    .sort(compareReports)
    .slice(0, reportLimit);

  return {
    reports,
    warnings:
      reports.length > 0
        ? [`Loaded ${reports.length} reviewed local public report snapshot(s).`, ...loaded.warnings]
        : loaded.warnings
  };
}

async function readPreviousPublicSnapshot(
  generatedAt: string,
  warnings: string[]
): Promise<PublicMirrorSnapshot | null> {
  try {
    debugStep("previous:read");
    const parsed = JSON.parse(await fs.readFile(outputPath, "utf8")) as Partial<PublicMirrorSnapshot>;
    const items = Array.isArray(parsed.radar_items) ? parsed.radar_items : [];
    const reports = Array.isArray(parsed.reports) ? parsed.reports : [];
    const publicItems = (items as PublicRadarSnapshotItem[]).map(publicSafeRadarItem).filter(isPublicSnapshotRadarCandidate);
    const publicReports = (reports as PublicReportSnapshot[]).map(publicSafeReport).filter(isPublicReportSnapshotCandidate);
    const droppedItems = items.length - publicItems.length;
    const droppedReports = reports.length - publicReports.length;

    if (parsed.schema_version !== 1 || items.length < 50) {
      debugStep(`previous:rejected items=${items.length}`);
      return null;
    }

    const previousWarnings = Array.isArray(parsed.source?.warnings) ? parsed.source.warnings : [];
    debugStep(`previous:sanitize-start items=${publicItems.length} dropped=${droppedItems}`);

    const snapshot = sanitizePublicSnapshot({
      ...(parsed as PublicMirrorSnapshot),
      generated_at: generatedAt,
      radar_items: publicItems,
      reports: publicReports,
      source: {
        ...(parsed.source as PublicMirrorSnapshot["source"]),
        data_source: publicSnapshotDataSource(parsed.source?.data_source),
        local_data_used: true,
        warnings: publicSafeNotes([
          ...warnings,
          droppedItems > 0 ? `${droppedItems} 条旧快照低事件性源页或目录页已从公开快照中过滤。` : "",
          droppedReports > 0 ? `${droppedReports} 个旧快照非公开报告状态已从公开快照中过滤。` : "",
          "Supabase public reads were unavailable during export; reused the previous public-safe Cloudflare snapshot instead of degrading to incomplete local data.",
          ...previousWarnings
        ])
      },
      counts: {
        ...(parsed.counts as PublicMirrorSnapshot["counts"]),
        report_candidates: publicReports.filter((report) => report.mode === "saved_candidate").length,
        report_snapshots: publicReports.length,
        saved_report_candidates: publicReports.filter((report) => report.mode === "saved_candidate").length,
        snapshot_radar_items: publicItems.length,
        visible_radar_items: publicItems.length
      }
    });
    debugStep(`previous:sanitize-done events=${snapshot.event_count}`);
    return snapshot;
  } catch {
    debugStep("previous:missing");
    return null;
  }
}

type LatestActivationRead = {
  droppedCount: number;
  items: PublicRadarSnapshotItem[];
  latestTimestamp: string | null;
  runId: string | null;
  warnings: string[];
};

async function mergeLatestActivationSnapshot(
  snapshot: PublicMirrorSnapshot,
  generatedAt: string,
  warnings: string[]
): Promise<PublicMirrorSnapshot> {
  debugStep(`activation-merge:start previous=${snapshot.radar_items.length}`);
  const activation = await readLatestActivationRadarItems();
  const localReports = await readLocalPublicReports();
  debugStep(`activation-merge:read items=${activation.items.length} dropped=${activation.droppedCount}`);
  debugStep(`activation-merge:local-reports=${localReports.reports.length}`);
  const mergedReports = mergeReports([...localReports.reports, ...snapshot.reports])
    .sort(compareReports)
    .slice(0, reportLimit);
  const sourceWarnings = publicSafeNotes([
    ...warnings,
    ...snapshot.source.warnings,
    ...activation.warnings,
    ...localReports.warnings
  ]);

  if (activation.items.length === 0) {
    return withFinalPublicSnapshotCounts(sanitizePublicSnapshot({
      ...snapshot,
      generated_at: generatedAt,
      reports: mergedReports,
      source: {
        ...snapshot.source,
        local_data_used: true,
        warnings: sourceWarnings
      }
    }));
  }

  const previousItemCount = snapshot.radar_items.length;
  const mergedItems = mergePublicRadarItems([...activation.items, ...snapshot.radar_items]);
  debugStep(`activation-merge:merged rows=${mergedItems.length}`);
  const addedCount = Math.max(0, mergedItems.length - previousItemCount);
  const latest = latestTimestamp(mergedItems);
  const statusCounts = countStatuses(mergedItems);
  const activationNote = [
    `本轮公开证据更新合并 ${activation.items.length} 条事件信号。`,
    `去重后新增 ${addedCount} 条，当前静态快照公开信号 ${mergedItems.length} 条。`,
    activation.droppedCount > 0 ? `${activation.droppedCount} 条非公开状态、低事件性或字段不完整的刷新信号未进入公开快照。` : ""
  ].filter(Boolean).join(" ");

  debugStep("activation-merge:sanitize-start");
  const draft = sanitizePublicSnapshot({
    ...snapshot,
    caveats: publicSafeNotes([
      ...snapshot.caveats,
      "公开证据库本轮暂不可读，因此快照复用上一版公开证据，并合并最新公开证据更新。",
      activationNote
    ]),
    coverage: {
      ...snapshot.coverage,
      latest_refresh: activation.latestTimestamp ?? snapshot.coverage.latest_refresh,
      public_radar_items: mergedItems.length
    },
    data_completeness_summary: {
      ...snapshot.data_completeness_summary,
      public_radar_items: mergedItems.length
    },
    freshness: {
      ...snapshot.freshness,
      latest_timestamp: latest?.value ?? snapshot.freshness.latest_timestamp,
      latest_timestamp_source: latest?.source ?? snapshot.freshness.latest_timestamp_source,
      latest_understanding: activation.latestTimestamp ?? snapshot.freshness.latest_understanding,
      note: latest
        ? `Latest public radar timestamp is ${latest.value} (${latest.source}); includes latest public evidence update.`
        : snapshot.freshness.note
    },
    generated_at: generatedAt,
    counts: {
      ...snapshot.counts,
      excluded: statusCounts.excluded,
      failed: statusCounts.failed,
      included: statusCounts.included,
      needs_review: statusCounts.needs_review,
      public_radar_items: mergedItems.length,
      snapshot_radar_items: mergedItems.length,
      visible_radar_items: mergedItems.length
    },
    radar_items: mergedItems,
    reports: mergedReports,
    source: {
      data_source: "local_understanding_output",
      kind: "local_files",
      local_data_used: true,
      warnings: publicSafeNotes([...sourceWarnings, activationNote])
    },
    top_categories: countEntries(mergedItems.flatMap((item) => item.categories.map(labelize))),
    top_source_tiers: countEntries(mergedItems.map((item) => item.source_tier)),
    top_sources: countEntries(mergedItems.map((item) => item.source_name))
  });
  debugStep(`activation-merge:sanitize-done events=${draft.event_count}`);

  return withFinalPublicSnapshotCounts(draft);
}

function withFinalPublicSnapshotCounts(draft: PublicMirrorSnapshot): PublicMirrorSnapshot {
  const sanitizedStatusCounts = countStatuses(draft.radar_items);
  const reportCitationCount = draft.reports.reduce((count, report) => count + report.citations.length, 0);

  return {
    ...draft,
    counts: {
      ...draft.counts,
      citations: draft.radar_items.length + reportCitationCount,
      event_clusters: draft.event_count,
      excluded: sanitizedStatusCounts.excluded,
      failed: sanitizedStatusCounts.failed,
      included: sanitizedStatusCounts.included,
      needs_review: sanitizedStatusCounts.needs_review,
      public_radar_items: draft.radar_items.length,
      report_snapshots: draft.reports.length,
      saved_report_candidates: draft.reports.filter((report) => report.mode === "saved_candidate").length,
      snapshot_radar_items: draft.radar_items.length,
      visible_radar_items: draft.radar_items.length
    }
  };
}

async function readLatestActivationRadarItems(): Promise<LatestActivationRead> {
  debugStep("activation:read-summary");
  const empty: LatestActivationRead = {
    droppedCount: 0,
    items: [],
    latestTimestamp: null,
    runId: null,
    warnings: []
  };
  const summaryPath = path.join(process.cwd(), "data", "activation", "latest", "summary.json");

  let summary: Record<string, unknown>;
  try {
    summary = record(JSON.parse(await fs.readFile(summaryPath, "utf8")));
  } catch {
    return {
      ...empty,
      warnings: ["No latest public evidence update summary was available for public snapshot merge."]
    };
  }

  const mode = text(summary.mode, 24);
  const runId = text(summary.run_id, 120) || null;
  if (mode !== "live") {
    return {
      ...empty,
      runId,
      warnings: [`Latest public evidence update is ${mode || "unknown"}; only public-readable output is merged into the public snapshot.`]
    };
  }

  const chunkFiles = await discoverActivationChunkFiles();
  const items: PublicRadarSnapshotItem[] = [];
  const warnings: string[] = [];
  const runIds = new Set<string>();
  let droppedCount = 0;
  let completedChunks = 0;

  for (const chunkPath of chunkFiles) {
    completedChunks += 1;

    try {
      debugStep(`activation:read-chunk ${path.basename(chunkPath)}`);
      const parsed = record(JSON.parse(await fs.readFile(chunkPath, "utf8")));
      const understandingRun = record(parsed.understanding_run);
      const chunkMode = text(understandingRun.mode, 24);
      if (chunkMode && chunkMode !== "live") {
        continue;
      }

      const chunkRunId = text(parsed.run_id, 120);
      if (chunkRunId) {
        runIds.add(chunkRunId);
      }

      const rows = Array.isArray(parsed.radar_items) ? parsed.radar_items.filter(isRecord) : [];

      for (const row of rows) {
        const item = normalizeSupabaseRadarRow(row);
        if (!item || !isPublicSnapshotRadarCandidate(item)) {
          droppedCount += 1;
          continue;
        }

        items.push(item);
      }
    } catch (error) {
      warnings.push(`Activation chunk ${path.basename(chunkPath)} read failed: ${sanitizeError(error)}`);
    }
  }

  const mergedItems = mergePublicRadarItems(items);
  debugStep(`activation:filtered items=${mergedItems.length} dropped=${droppedCount}`);
  const duplicateCount = Math.max(0, items.length - mergedItems.length);
  const latest = latestTimestamp(mergedItems)?.value ?? (text(summary.updated_at, 80) || null);

  return {
    droppedCount: droppedCount + duplicateCount,
    items: mergedItems,
    latestTimestamp: latest,
    runId,
    warnings: publicSafeNotes([
      `Public evidence update contributed ${mergedItems.length} radar items from ${completedChunks} completed chunks.`,
      duplicateCount > 0 ? `${duplicateCount} duplicate refresh rows were removed before public snapshot merge.` : "",
      ...warnings
    ])
  };
}

async function discoverActivationChunkFiles() {
  const runsDir = path.join(process.cwd(), "data", "activation", "runs");

  try {
    const names = await fs.readdir(runsDir);
    return names
      .filter((name) => /^activation_\d{8}_\d+Z-chunk-\d+\.json$/i.test(name))
      .filter((name) => !/raw-items\.json$/i.test(name))
      .sort()
      .map((name) => path.join(runsDir, name));
  } catch {
    return [];
  }
}

function isPublicSnapshotRadarCandidate(item: PublicRadarSnapshotItem) {
  if (isExternalSourceRepairSignal(item)) {
    return false;
  }

  if (item.status !== "included" && item.status !== "needs_review") {
    return false;
  }

  if (item.scores.ai_relevance < 0.55 || item.scores.overall < 0.45) {
    return false;
  }

  const quality = assessPublicSignalQuality(item);
  if (quality.isLowEventSignal) {
    return false;
  }

  const weakCategoryOnly = item.categories.every((category) =>
    category === "other" || category === "opinion" || category === "media_interview"
  );

  return !weakCategoryOnly || hasAiIndustryCue(item);
}

function hasAiIndustryCue(item: PublicRadarSnapshotItem) {
  const haystack = [
    item.title,
    item.summary_zh ?? "",
    item.summary_en ?? "",
    item.source_name,
    ...item.tags
  ].join(" ");

  return /\b(AI|OpenAI|Anthropic|DeepMind|Gemini|Claude|GPT|LLM|Llama|agent|model|benchmark|SDK|API|Lean|autoformalization|transformer|vision|diffusion)\b|人工智能|模型|智能体|大模型|基准|开源|安全|对齐/i.test(haystack);
}

function mergePublicRadarItems(items: PublicRadarSnapshotItem[]) {
  const byKey = new Map<string, PublicRadarSnapshotItem>();

  for (const item of items) {
    if (!isPublicSnapshotRadarCandidate(item)) {
      continue;
    }

    const key = radarItemKey(item);
    if (!key || byKey.has(key)) {
      continue;
    }

    byKey.set(key, item);
  }

  return [...byKey.values()]
    .sort((left, right) => itemTime(right) - itemTime(left))
    .slice(0, radarLimit);
}

function radarItemKey(item: PublicRadarSnapshotItem) {
  const urlKey = normalizedUrlKey(item.url);
  return urlKey || `id:${item.id}`;
}

function normalizedUrlKey(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function itemTime(item: PublicRadarSnapshotItem) {
  const value = Date.parse(item.processed_at || item.collected_at || item.published_at || "");
  return Number.isFinite(value) ? value : 0;
}

function buildSnapshot(input: {
  caveats: string[];
  dataSource: RetrievalDataSource;
  exactVisibleRows: number;
  fallbackUsed: boolean;
  generatedAt: string;
  items: PublicRadarSnapshotItem[];
  publicCounts: PublicSnapshotCountsInput;
  publicCoverage: PublicDataCompletenessSummary;
  reports: PublicReportSnapshot[];
  sourceKind: SnapshotSourceKind;
  warnings: string[];
}): PublicMirrorSnapshot {
  const items = input.items.map(publicSafeRadarItem).filter(isPublicSnapshotRadarCandidate);
  const droppedItems = input.items.length - items.length;
  const warnings = publicSafeNotes([
    ...input.warnings,
    droppedItems > 0 ? `${droppedItems} local/supabase radar row(s) were blocked by final public snapshot safety filters.` : ""
  ]);
  const latest = latestTimestamp(items);
  const statusCounts = countStatuses(items);
  const eventInputItems = items.map((item) => ({ ...item, evidence_notes: [] }));
  const rawEventLayer = buildEventLayer(eventInputItems);
  const eventLayer = publicDisplayEventLayer(rawEventLayer);
  const reports = mergeReports(
    buildEventAwareReports(
      input.reports.map(publicSafeReport).filter(isPublicReportSnapshotCandidate),
      eventLayer,
      latest?.value ?? null
    )
  );
  const savedReportCandidates = reports.filter((report) => report.mode === "saved_candidate").length;
  const reportCitationCount = reports.reduce((count, report) => count + report.citations.length, 0);
  const sourceHealthSummary = aggregateSourceFamilyHealth(input.publicCoverage.sourceFamilyHealth);
  const sourceHealthFailureFamilies = sourceHealthFailureFamilySummary(sourceHealthSummary);

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
      warnings
    },
    freshness: {
      latest_ingestion: input.publicCounts.latest_ingestion,
      latest_timestamp: latest?.value ?? null,
      latest_timestamp_source: latest?.source ?? null,
      latest_understanding: input.publicCounts.latest_understanding,
      note: latest
        ? `Latest public radar timestamp is ${latest.value} (${latest.source}).`
        : "No public radar freshness timestamp is available."
    },
    counts: {
      citations: items.length + reportCitationCount,
      excluded: statusCounts.excluded,
      failed: statusCounts.failed,
      included: statusCounts.included,
      needs_review: statusCounts.needs_review,
      public_radar_items: input.publicCounts.public_radar_items,
      report_candidates: savedReportCandidates,
      report_snapshots: reports.length,
      saved_report_candidates: savedReportCandidates,
      snapshot_radar_items: items.length,
      visible_radar_items: items.length,
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
      skipped_source_reasons: input.publicCoverage.skippedSourceReasons,
      skipped_sources: input.publicCoverage.skippedSources,
      source_public_visibility: input.publicCoverage.rates.sourcePublicVisibility,
      sources_total: input.publicCoverage.sourcesTotal,
      sources_with_public_items: input.publicCoverage.sourcesWithPublicItems
    },
    top_categories: countEntries(items.flatMap((item) => item.categories.map(labelize))),
    top_source_tiers: countEntries(items.map((item) => item.source_tier)),
    top_sources: countEntries(items.map((item) => item.source_name)),
    curated_events: eventLayer.curated_events,
    data_completeness_summary: {
      attempted_sources: input.publicCoverage.attemptedSources,
      automated_eligible_sources: input.publicCoverage.automatedEligibleSources,
      blocked_manual_sources: input.publicCoverage.blockedManualSources,
      failed_sources: input.publicCoverage.failedSources,
      fetched_sources: input.publicCoverage.fetchedSources,
      public_radar_items: input.publicCoverage.publicRadarItems,
      radar_to_public_visibility: input.publicCoverage.rates.radarPublicVisibility,
      source_public_visibility: input.publicCoverage.rates.sourcePublicVisibility,
      sources_total: input.publicCoverage.sourcesTotal,
      sources_with_public_items: input.publicCoverage.sourcesWithPublicItems
    },
    event_cluster_items: eventLayer.event_cluster_items,
    event_clusters: eventLayer.event_clusters,
    event_count: eventLayer.event_count,
    failure_family_summary: sourceHealthFailureFamilies,
    report_quality_summary: {
      daily: reportQualitySummary(reports, "daily", eventLayer.curated_events),
      weekly: reportQualitySummary(reports, "weekly", eventLayer.curated_events)
    },
    radar_items: items,
    reports,
    source_health_by_family: input.publicCoverage.sourceFamilyHealth,
    source_health_scope: {
      attempted_sources: input.publicCoverage.sourceHealthScope.attempted_sources,
      finished_at: input.publicCoverage.sourceHealthScope.finished_at,
      started_at: input.publicCoverage.sourceHealthScope.started_at
    },
    source_health_summary: sourceHealthSummary,
    timeline: eventLayer.timeline,
    caveats: publicSafeNotes([
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      input.fallbackUsed
        ? "This snapshot used local generated data because Supabase public reads were unavailable to the export process."
        : "Radar rows came from Supabase public-safe read views. Report candidates are projected to the same public-safe field allowlist during export.",
      ...input.caveats,
      ...warnings,
      ...input.publicCounts.warnings
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
  return filterPublicDisplayEventLayer(layer);
}

function buildEventAwareReports(
  reports: PublicReportSnapshot[],
  eventLayer: PublicEventLayer,
  latestTimestamp: string | null
): PublicReportSnapshot[] {
  if (reports.length === 0 || eventLayer.event_clusters.length === 0) {
    return reports;
  }

  return reports
    .map((report) =>
      shouldPreserveReviewedPublicReport(report)
        ? report
        : eventAwareReport(
            report,
            selectReportEvents(report.report_type, eventLayer, latestTimestamp),
            latestTimestamp
          )
    )
    .filter(isPublicReportSnapshotCandidate);
}

function shouldPreserveReviewedPublicReport(report: PublicReportSnapshot) {
  return report.mode === "saved_report" &&
    publicSavedReportStatus(report.status) !== null &&
    report.quality_gate_passed &&
    report.sections.length > 0 &&
    report.citations.length > 0 &&
    report.source_item_ids.length > 0;
}

function selectReportEvents(
  reportType: ReportPreviewType,
  eventLayer: PublicEventLayer,
  latestTimestamp: string | null
) {
  const preferred = reportType === "daily"
    ? [...eventLayer.curated_events, ...eventLayer.event_clusters]
    : eventLayer.event_clusters;
  const seen = new Set<string>();
  const limit = reportType === "daily" ? 8 : 24;
  const cutoff = reportWindowCutoff(reportType, latestTimestamp);

  return preferred
    .filter((event) => {
      if (seen.has(event.event_cluster_id)) return false;
      if (cutoff && eventLatestTime(event) < cutoff) return false;
      seen.add(event.event_cluster_id);
      return true;
    })
    .slice(0, limit);
}

function reportWindowCutoff(reportType: ReportPreviewType, latestTimestamp: string | null) {
  const latest = latestTimestamp ? Date.parse(latestTimestamp) : NaN;
  if (!Number.isFinite(latest)) {
    return null;
  }

  const windowMs = reportType === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return latest - windowMs;
}

function eventLatestTime(event: PublicEventCluster) {
  const candidates = [event.latest_seen_at, event.first_seen_at, ...event.timeline.map((entry) => entry.timestamp)];
  const times = candidates
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  return times.length > 0 ? Math.max(...times) : 0;
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
  const multiReportEvents = selectedEvents.filter((event) => event.source_count > 1);
  const crossFamilyEvents = multiReportEvents.filter((event) => event.source_families.length > 1);
  const sameFamilyEvents = multiReportEvents.filter((event) => event.source_families.length === 1);
  const latestLabel = latestTimestamp ? formatPublicDate(latestTimestamp) : "未知时间";
  const evidenceBoundary = `公开证据最新到 ${latestLabel}；当前页面展示的是公开快照，不代表今日实时全网覆盖。`;
  const summary = `${reportLabel}事件预览基于 ${selectedEvents.length} 个公开事件、${relatedItemIds.length} 条相关信号、${citations.length} 条引用和 ${sourceNames.length} 个来源生成；已过滤目录页、文档首页、仓库元数据等低事件性内容。`;

  return {
    ...report,
    category_count: categories.length,
    caveats: publicSafeNotes(dedupe([
      evidenceBoundary,
      "这是事件感知的公开报告视图；原始信号仍可在“全部信号”中审计。",
      crossFamilyEvents.length === 0 ? "当前没有跨来源家族确认事件，报告判断中需要保留不确定性。" : "",
      ...report.caveats
    ])),
    citation_count: citations.length,
    citations,
    distinct_source_count: sourceNames.length,
    executive_summary: summary,
    missing_evidence: publicSafeNotes(dedupe([
      crossFamilyEvents.length < 3 ? "跨来源家族确认事件数量仍偏少，需要补充官方博客、研究源、开源 release 与媒体/分析源的交叉证据。" : "",
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
        caveats: selectedEvents.some((event) => event.source_count === 1) ? ["部分事件仍是单源观察，不能写成已被广泛验证的行业结论。"] : [],
        citations: citations.slice(0, 8).map((citation) => citation.id),
        summary: "按事件分数、来源可信度、来源多样性和新鲜度排序，优先保留能说明行业变化的事件。",
        title: "行业精选事件"
      },
      {
        bullets: [
          ...crossFamilyEvents.slice(0, 3).map((event) => `跨家族确认：${event.canonical_title}，${event.source_count} 个来源，覆盖 ${event.source_families.join("、")}。`),
          ...sameFamilyEvents.slice(0, 3).map((event) => `同家族多源复述：${event.canonical_title}，${event.source_count} 个来源，均属于 ${event.source_families.join("、")}。`),
          ...(multiReportEvents.length === 0 ? ["本轮公开快照中没有多条报道事件，重点事件仍需要等待下一轮刷新或人工补证。"] : [])
        ],
        caveats: [],
        citations: [],
        summary: `本轮报告候选中有 ${crossFamilyEvents.length} 个跨家族确认事件、${sameFamilyEvents.length} 个同家族多源复述事件；其余事件主要作为单源待跟踪信号处理。`,
        title: "来源家族确认与可信度"
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
    source_item_ids: relatedItemIds,
    status: report.status,
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

function publicSnapshotCounts(publicRadarFallback: number, reportCandidatesFallback: number): PublicSnapshotCountsInput {
  return {
    public_radar_items: publicRadarFallback,
    report_candidates: reportCandidatesFallback,
    latest_ingestion: null,
    latest_understanding: null,
    warnings: []
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
    entities: publicSafeEntities(row.entities ?? row.extracted_entities ?? row.item_entities),
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
    entities: publicSafeEntities(item.entities),
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
  const status = publicCandidateReportStatus(row.status);
  const title = text(row.title);

  if (!id || !reportType || !status || !title) {
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
    source_item_ids: sourceItemIds.length > 0 ? sourceItemIds : draftSourceItemIds,
    source_item_count: sourceItemCount,
    ...reportQualityGateFields(qualityGate),
    status,
    summary:
      text(row.summary, 1200) ||
      text(draft.one_sentence_summary, 1200) ||
      text(draft.executive_summary, 1200) ||
      "No public candidate summary recorded.",
    time_window: normalizeReportTimeWindow(row, draft),
    title
  };
}

function normalizeSavedReportRow(row: SupabaseReportRow): PublicReportSnapshot | null {
  const id = text(row.id);
  const reportType = reportTypeValue(row.type);
  const status = publicSavedReportStatus(row.status);
  const title = text(row.title);

  if (!id || !reportType || !status || !title) {
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
    source_item_ids: draftSourceItemIds,
    source_item_count: draftSourceItemIds.length,
    ...reportQualityGateFields(qualityGate),
    status,
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
  const priority = reportSnapshotPriority(right) - reportSnapshotPriority(left);
  if (priority !== 0) {
    return priority;
  }

  const leftTime = Date.parse(left.saved_at ?? left.generated_at ?? left.time_window.end);
  const rightTime = Date.parse(right.saved_at ?? right.generated_at ?? right.time_window.end);

  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
}

function reportSnapshotPriority(report: PublicReportSnapshot) {
  if (report.mode === "saved_report" && report.status === "published") {
    return 40;
  }

  if (report.mode === "saved_report" && report.status === "reviewed") {
    return 30;
  }

  if (report.mode === "saved_candidate" && report.status === "approved") {
    return 20;
  }

  return 0;
}

function mergeReports(reports: PublicReportSnapshot[]) {
  const byKey = new Map<string, PublicReportSnapshot>();

  for (const report of [...reports].sort(compareReports)) {
    const sourceIds = [...report.source_item_ids].sort();
    const key =
      report.mode === "saved_candidate" && sourceIds.length > 0
        ? `candidate:${report.report_type}:${sourceIds.join(",")}`
        : `id:${report.id}`;
    if (!byKey.has(key)) {
      byKey.set(key, report);
    }
  }

  return Array.from(byKey.values());
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

function publicCandidateReportStatus(value: unknown): "approved" | "draft" | "needs_review" | "published" | null {
  return value === "approved" || value === "draft" || value === "needs_review" || value === "published"
    ? value
    : null;
}

function publicSavedReportStatus(value: unknown): "reviewed" | "published" | null {
  return value === "reviewed" || value === "published" ? value : null;
}

function isPublicReportSnapshotCandidate(report: PublicReportSnapshot) {
  if (report.mode === "saved_candidate") {
    return publicCandidateReportStatus(report.status) !== null;
  }

  if (report.mode === "saved_report") {
    return publicSavedReportStatus(report.status) !== null;
  }

  return false;
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

function nullableInteger(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return Math.floor(numberValue);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function numericRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, count]) => [text(key, 120), integer(count)] as const)
      .filter(([key]) => key.length > 0)
  );
}

function countEntryList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): CountEntry | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const label = publicSafeNote(text(entry.label, 160));
      if (!label) {
        return null;
      }

      return {
        count: integer(entry.count),
        label
      };
    })
    .filter((entry): entry is CountEntry => Boolean(entry));
}

function reportModeValue(value: unknown): ReportMode {
  return value === "saved_report" || value === "local_preview" ? value : "saved_candidate";
}

function publicHttpUrl(value: unknown) {
  return publicInternetHttpUrl(text(value, 2000));
}

function isPublicHttpUrl(value: string) {
  return publicInternetHttpUrl(value) !== "";
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sanitizePublicSnapshot(snapshot: PublicMirrorSnapshot): PublicMirrorSnapshot {
  const radarItems = snapshot.radar_items.map(publicSafeRadarItem).filter(isPublicSnapshotRadarCandidate);
  debugStep(`sanitize:build-event-layer-start rows=${radarItems.length}`);
  const eventInputItems = radarItems.map((item) => ({ ...item, evidence_notes: [] }));
  const rawEventLayer = buildEventLayer(eventInputItems);
  debugStep(`sanitize:build-event-layer-done events=${rawEventLayer.event_count}`);
  const eventLayer = publicDisplayEventLayer(rawEventLayer);
  debugStep(`sanitize:public-filter-done events=${eventLayer.event_count}`);
  debugStep(`sanitize:reports-start reports=${snapshot.reports.length}`);
  const reports = mergeReports(
    buildEventAwareReports(
      snapshot.reports.map(publicSafeReport).filter(isPublicReportSnapshotCandidate),
      eventLayer,
      snapshot.freshness.latest_timestamp
    )
  );
  debugStep(`sanitize:reports-done reports=${reports.length}`);

  return {
    schema_version: 1,
    generated_at: text(snapshot.generated_at) || new Date().toISOString(),
    reference_app_url: referenceAppUrl,
    public_site: {
      cloudflare_url: cloudflareUrl,
      purpose: "Primary Cloudflare public read surface for AI Industry Radar data.",
      read_only: true,
      reference_app_url: referenceAppUrl
    },
    counts: {
      citations: integer(snapshot.counts.citations),
      event_clusters: eventLayer.event_count,
      excluded: integer(snapshot.counts.excluded),
      failed: integer(snapshot.counts.failed),
      included: integer(snapshot.counts.included),
      needs_review: integer(snapshot.counts.needs_review),
      public_radar_items: nullableInteger(snapshot.counts.public_radar_items),
      report_candidates: nullableInteger(snapshot.counts.report_candidates),
      report_snapshots: reports.length,
      saved_report_candidates: reports.filter((report) => report.mode === "saved_candidate").length,
      snapshot_radar_items: radarItems.length,
      visible_radar_items: radarItems.length
    },
    coverage: {
      attempted_sources: integer(snapshot.coverage.attempted_sources),
      automated_eligible_sources: integer(snapshot.coverage.automated_eligible_sources),
      failed_source_reasons: numericRecord(snapshot.coverage.failed_source_reasons),
      failed_sources: integer(snapshot.coverage.failed_sources),
      failure_families: numericRecord(snapshot.coverage.failure_families),
      fetched_sources: integer(snapshot.coverage.fetched_sources),
      label: "public snapshot",
      latest_refresh: optionalText(snapshot.coverage.latest_refresh) ?? null,
      public_radar_items: nullableInteger(snapshot.coverage.public_radar_items),
      radar_to_public_visibility: nullableNumber(snapshot.coverage.radar_to_public_visibility),
      skipped_source_reasons: numericRecord(snapshot.coverage.skipped_source_reasons),
      skipped_sources: integer(snapshot.coverage.skipped_sources),
      source_public_visibility: nullableNumber(snapshot.coverage.source_public_visibility),
      sources_total: integer(snapshot.coverage.sources_total),
      sources_with_public_items: nullableInteger(snapshot.coverage.sources_with_public_items)
    },
    source: {
      kind: snapshot.source.kind === "supabase_public_views" ? "supabase_public_views" : "local_files",
      data_source: publicSnapshotDataSource(snapshot.source.data_source),
      local_data_used: Boolean(snapshot.source.local_data_used),
      warnings: publicSourceWarnings(snapshot)
    },
    freshness: {
      latest_ingestion: optionalText(snapshot.freshness.latest_ingestion) ?? null,
      latest_timestamp: optionalText(snapshot.freshness.latest_timestamp) ?? null,
      latest_timestamp_source: optionalText(snapshot.freshness.latest_timestamp_source) ?? null,
      latest_understanding: optionalText(snapshot.freshness.latest_understanding) ?? null,
      note: publicSafeNote(text(snapshot.freshness.note) || "No public radar freshness timestamp is available.")
    },
    top_categories: countEntryList(snapshot.top_categories),
    top_sources: countEntryList(snapshot.top_sources),
    top_source_tiers: countEntryList(snapshot.top_source_tiers),
    curated_events: eventLayer.curated_events,
    event_cluster_items: eventLayer.event_cluster_items,
    event_clusters: eventLayer.event_clusters,
    event_count: eventLayer.event_count,
    source_health_summary: {
      "403": integer(snapshot.source_health_summary["403"]),
      duplicate_only: integer(snapshot.source_health_summary.duplicate_only),
      failed: integer(snapshot.source_health_summary.failed),
      low_relevance_excluded: integer(snapshot.source_health_summary.low_relevance_excluded),
      manual_blocked: integer(snapshot.source_health_summary.manual_blocked),
      no_items: integer(snapshot.source_health_summary.no_items),
      rate_limit: integer(snapshot.source_health_summary.rate_limit),
      succeeded: integer(snapshot.source_health_summary.succeeded),
      timeout: integer(snapshot.source_health_summary.timeout),
      unsupported_source: integer(snapshot.source_health_summary.unsupported_source)
    },
    source_health_scope: publicSourceHealthScope(snapshot.source_health_scope),
    source_health_by_family: publicSourceFamilyHealth(snapshot.source_health_by_family),
    failure_family_summary: numericRecord(snapshot.failure_family_summary),
    report_quality_summary: {
      daily: publicSafeReportQuality(reportQualitySummary(reports, "daily", eventLayer.curated_events)),
      weekly: publicSafeReportQuality(reportQualitySummary(reports, "weekly", eventLayer.curated_events))
    },
    data_completeness_summary: {
      attempted_sources: integer(snapshot.data_completeness_summary.attempted_sources),
      automated_eligible_sources: integer(snapshot.data_completeness_summary.automated_eligible_sources),
      blocked_manual_sources: integer(snapshot.data_completeness_summary.blocked_manual_sources),
      failed_sources: integer(snapshot.data_completeness_summary.failed_sources),
      fetched_sources: integer(snapshot.data_completeness_summary.fetched_sources),
      public_radar_items: nullableInteger(snapshot.data_completeness_summary.public_radar_items),
      radar_to_public_visibility: nullableNumber(snapshot.data_completeness_summary.radar_to_public_visibility),
      source_public_visibility: nullableNumber(snapshot.data_completeness_summary.source_public_visibility),
      sources_total: integer(snapshot.data_completeness_summary.sources_total),
      sources_with_public_items: nullableInteger(snapshot.data_completeness_summary.sources_with_public_items)
    },
    radar_items: radarItems,
    reports,
    timeline: eventLayer.timeline,
    caveats: publicSafeNotes(snapshot.caveats)
  };
}

function publicSafeReport(report: PublicReportSnapshot): PublicReportSnapshot {
  const qualityGate = report.quality_gate ?? {
    category_count: integer(report.category_count),
    category_gate_applicable: integer(report.category_count) > 0,
    citation_count: integer(report.citation_count),
    distinct_source_count: integer(report.distinct_source_count),
    passed: Boolean(report.quality_gate_passed),
    reasons: [],
    report_type: reportTypeValue(report.report_type) ?? "daily",
    thresholds: {
      categories: 0,
      citations: 0,
      distinct_sources: 0,
      usable_items: 0
    },
    usable_item_count: integer(report.usable_item_count)
  };
  const sections = Array.isArray(report.sections) ? report.sections : [];
  const citations = Array.isArray(report.citations) ? report.citations : [];

  return {
    id: text(report.id, 160),
    report_type: reportTypeValue(report.report_type) ?? "daily",
    mode: reportModeValue(report.mode),
    status: text(report.status, 40),
    data_source: publicSnapshotDataSource(report.data_source),
    title: publicSafeNote(report.title),
    summary: publicSafeNote(report.summary),
    executive_summary: report.executive_summary ? publicSafeNote(report.executive_summary) : undefined,
    time_window: {
      end: text(report.time_window?.end, 80) || new Date().toISOString(),
      start: text(report.time_window?.start, 80) || new Date(0).toISOString()
    },
    generated_at: optionalText(report.generated_at),
    saved_at: optionalText(report.saved_at),
    source_item_ids: stringArray(report.source_item_ids, 100, 160),
    source_item_count: integer(report.source_item_count),
    usable_item_count: integer(report.usable_item_count),
    citation_count: integer(report.citation_count),
    distinct_source_count: integer(report.distinct_source_count),
    category_count: integer(report.category_count),
    quality_gate_passed: Boolean(report.quality_gate_passed),
    quality_gate_reasons: publicSafeNotes(report.quality_gate_reasons),
    quality_gate: {
      category_count: integer(qualityGate.category_count),
      category_gate_applicable: Boolean(qualityGate.category_gate_applicable),
      citation_count: integer(qualityGate.citation_count),
      distinct_source_count: integer(qualityGate.distinct_source_count),
      passed: Boolean(qualityGate.passed),
      reasons: publicSafeNotes(qualityGate.reasons),
      report_type: reportTypeValue(qualityGate.report_type) ?? (reportTypeValue(report.report_type) ?? "daily"),
      thresholds: {
        categories: integer(qualityGate.thresholds?.categories),
        citations: integer(qualityGate.thresholds?.citations),
        distinct_sources: integer(qualityGate.thresholds?.distinct_sources),
        usable_items: integer(qualityGate.thresholds?.usable_items)
      },
      usable_item_count: integer(qualityGate.usable_item_count)
    },
    confidence: optionalScore(report.confidence),
    sections: sections.map((section) => ({
      title: publicSafeNote(section.title),
      summary: publicSafeNote(section.summary),
      bullets: publicSafeNotes(section.bullets),
      citations: publicSafeNotes(section.citations),
      caveats: publicSafeNotes(section.caveats)
    })),
    citations: citations.map((citation) => ({
      collected_at: optionalText(citation.collected_at),
      confidence: optionalScore(citation.confidence),
      id: text(citation.id, 160),
      published_at: optionalText(citation.published_at),
      source_name: publicSafeNote(citation.source_name),
      status: statusValue(citation.status) ?? undefined,
      title: publicSafeNote(citation.title),
      url: publicHttpUrl(citation.url)
    })),
    caveats: publicSafeNotes(report.caveats),
    missing_evidence: publicSafeNotes(report.missing_evidence)
  };
}

function publicSafeRadarItem(item: PublicRadarSnapshotItem): PublicRadarSnapshotItem {
  const scores = item.scores ?? {
    ai_relevance: 0,
    credibility: 0,
    freshness: 0,
    importance: 0,
    novelty: 0,
    overall: 0
  };

  return {
    id: text(item.id, 160),
    title: publicSafeNote(item.title),
    url: publicHttpUrl(item.url),
    source_name: publicSafeNote(item.source_name) || "Unknown source",
    status: normalizeStatus(item.status),
    language: normalizeLanguage(item.language),
    published_at: optionalText(item.published_at),
    collected_at: text(item.collected_at, 80) || new Date(0).toISOString(),
    processed_at: text(item.processed_at, 80) || new Date().toISOString(),
    summary_zh: item.summary_zh ? publicSafeNote(item.summary_zh) : undefined,
    summary_en: item.summary_en ? publicSafeNote(item.summary_en) : undefined,
    categories: categories(item.categories),
    tags: publicSafeNotes(stringArray(item.tags, 12, 80)),
    source_tier: text(item.source_tier, 20) || "unreviewed",
    confidence: score(item.confidence),
    scores: {
      ai_relevance: score(scores.ai_relevance),
      credibility: score(scores.credibility),
      freshness: score(scores.freshness),
      importance: score(scores.importance),
      novelty: score(scores.novelty),
      overall: score(scores.overall)
    },
    why_it_matters: item.why_it_matters ? publicSafeNote(item.why_it_matters) : undefined,
    entities: publicSafeEntities(item.entities)
  };
}

function publicSafeEntities(value: unknown): PublicRadarSnapshotEntity[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const entities: PublicRadarSnapshotEntity[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }

    const entity = entry as Partial<UnderstandingEntity>;
    const name = publicSafeNote(text(entity.name, 80));
    if (!name) {
      continue;
    }

    const type = entityTypeValue(entity.type);
    const key = `${type}:${name.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entities.push({
      confidence: score(entity.confidence),
      name,
      type
    });

    if (entities.length >= 12) {
      break;
    }
  }

  return entities;
}

function entityTypeValue(value: unknown): UnderstandingEntityType {
  const normalized = text(value, 40).toLowerCase().replace(/\s+/g, "_");
  return publicEntityTypes.has(normalized) ? (normalized as UnderstandingEntityType) : "other";
}

function aggregateSourceFamilyHealth(
  rows: PublicDataCompletenessSummary["sourceFamilyHealth"]
): PublicMirrorSnapshot["source_health_summary"] {
  return rows.reduce<PublicMirrorSnapshot["source_health_summary"]>(
    (summary, row) => ({
      "403": summary["403"] + row["403"],
      duplicate_only: summary.duplicate_only + row.duplicate_only,
      failed: summary.failed + row.failed,
      low_relevance_excluded: summary.low_relevance_excluded + row.low_relevance_excluded,
      manual_blocked: summary.manual_blocked + row.manual_blocked,
      no_items: summary.no_items + row.no_items,
      rate_limit: summary.rate_limit + row.rate_limit,
      succeeded: summary.succeeded + row.succeeded,
      timeout: summary.timeout + row.timeout,
      unsupported_source: summary.unsupported_source + row.unsupported_source
    }),
    {
      "403": 0,
      duplicate_only: 0,
      failed: 0,
      low_relevance_excluded: 0,
      manual_blocked: 0,
      no_items: 0,
      rate_limit: 0,
      succeeded: 0,
      timeout: 0,
      unsupported_source: 0
    }
  );
}

function sourceHealthFailureFamilySummary(
  summary: PublicMirrorSnapshot["source_health_summary"]
) {
  return Object.fromEntries(
    [
      ["timeout", summary.timeout],
      ["403", summary["403"]],
      ["rate_limit", summary.rate_limit],
      ["no_items", summary.no_items],
      ["duplicate_only", summary.duplicate_only],
      ["manual_blocked", summary.manual_blocked],
      ["unsupported_source", summary.unsupported_source],
      ["low_relevance_excluded", summary.low_relevance_excluded]
    ].filter(([, count]) => Number(count) > 0)
  ) as Record<string, number>;
}

function publicSourceHealthScope(value: unknown): PublicMirrorSnapshot["source_health_scope"] {
  const row = isRecord(value) ? value : {};
  return {
    attempted_sources: integer(row.attempted_sources),
    finished_at: optionalText(row.finished_at) ?? null,
    started_at: optionalText(row.started_at) ?? null
  };
}

function publicSourceFamilyHealth(value: unknown): PublicMirrorSnapshot["source_health_by_family"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((row) => ({
      "403": integer(row["403"]),
      attempted: integer(row.attempted),
      automated_eligible: integer(row.automated_eligible),
      configured: integer(row.configured),
      duplicate_only: integer(row.duplicate_only),
      failed: integer(row.failed),
      family: text(row.family, 80) || "other",
      low_relevance_excluded: integer(row.low_relevance_excluded),
      manual_blocked: integer(row.manual_blocked),
      no_items: integer(row.no_items),
      rate_limit: integer(row.rate_limit),
      skipped: integer(row.skipped),
      succeeded: integer(row.succeeded),
      timeout: integer(row.timeout),
      unsupported_source: integer(row.unsupported_source)
    }))
    .sort((left, right) => right.attempted - left.attempted || right.configured - left.configured || left.family.localeCompare(right.family));
}

function publicSafeReportQuality(summary: ReportQualitySummary | null): ReportQualitySummary | null {
  if (!summary) {
    return null;
  }

  return {
    id: text(summary.id, 160),
    status: text(summary.status, 40),
    quality_gate_passed: Boolean(summary.quality_gate_passed),
    usable_item_count: integer(summary.usable_item_count),
    citation_count: integer(summary.citation_count),
    distinct_source_count: integer(summary.distinct_source_count),
    category_count: integer(summary.category_count),
    quality_gate_reasons: publicSafeNotes(summary.quality_gate_reasons),
    missing_evidence: publicSafeNotes(summary.missing_evidence),
    caveats: publicSafeNotes(summary.caveats),
    top_event_ids: stringArray(summary.top_event_ids, 12, 160)
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
  return dedupe(values.map(publicSafeNote).filter((value) => value && !isInternalRunLogNote(value)));
}

function publicSourceWarnings(snapshot: PublicMirrorSnapshot) {
  const warnings = [
    "此快照仅展示可公开引用的结构化证据字段，不包含内部采集日志、后台运行状态或凭据。"
  ];

  if (snapshot.source.local_data_used || snapshot.source.kind !== "supabase_public_views") {
    warnings.push("当前展示使用已生成的公开证据快照；新鲜度以页面时间戳和来源引用为准。");
  }

  if (snapshot.counts.visible_radar_items === 0) {
    warnings.push("当前公开快照没有可展示雷达条目。");
  }

  return dedupe(warnings);
}

function publicSafeNote(value: string) {
  return value
    .replace(
      /\b(NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|DEEPSEEK_API_KEY|api[\s_-]?key|token|cookie|authorization)\b\s*[:=]\s*[^\s,;]+/gi,
      "[redacted credential]"
    )
    .replace(/\b(NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|DEEPSEEK_API_KEY)\b/gi, "credential")
    .replace(/AI Radar reviewed daily evidence snapshot/g, "AI 行业雷达已复核日报")
    .replace(/reviewed or published/gi, "已复核或已发布")
    .replace(/reviewed\/published/gi, "已复核或已发布")
    .replace(/without running live model generation or writing to Supabase/gi, "基于既有公开证据完成复核")
    .replace(/without writing to Supabase/gi, "基于既有公开证据")
    .replace(/local public report/g, "公开报告")
    .replace(/local repository snapshot/gi, "当前公开证据快照")
    .replace(/repository snapshot/gi, "公开证据快照")
    .replace(
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "此页面是公开只读情报快照，不提供账号、后台操作或写入能力。"
    )
    .replace(
      "Cloudflare Pages 是主要公开只读页面；登录、Admin、服务端操作和写入流程不在公开页面中运行。",
      "此页面是公开只读情报快照，不提供账号、后台操作或写入能力。"
    )
    .replace(
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      "只纳入可公开引用的雷达和报告字段；私有原文、内部备注和凭据均不展示。"
    )
    .replace(
      "只纳入公开安全的雷达和报告字段；私有原文、供应商元数据、内部备注、service-role 访问和密钥均已排除。",
      "只纳入可公开引用的雷达和报告字段；私有原文、内部备注和凭据均不展示。"
    )
    .replace(
      "Read-only Supabase public radar retrieval was used; no Supabase write path ran.",
      "使用公开证据库进行检索；只展示可公开引用的结构化字段。"
    )
    .replace(
      "Radar rows came from Supabase public-safe read views. Report candidates are projected to the same public-safe field allowlist during export.",
      "雷达条目和报告摘要使用同一组公开可读字段。"
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
      "本次展示复用上一版公开快照，避免因来源暂不可用而降级为空数据。"
    )
    .replace(
      "Supabase public radar view returned no public-safe rows; local generated radar data was used.",
      "公开雷达视图没有返回可展示条目，本次展示使用已生成的公开证据数据。"
    )
    .replace(
      "This snapshot used local generated data because Supabase public reads were unavailable to the export process.",
      "本次展示使用已生成的公开证据数据。"
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
    .replace(/reports service read failed: TypeError: fetch failed/g, "报告服务读取失败：网络连接失败")
    .replace(/includes newest public-safe live DeepSeek activation output/gi, "includes latest public evidence update")
    .replace(/includes newest public-safe refresh output/gi, "includes latest public evidence update")
    .replace(/includes latest public-safe refresh output/gi, "includes latest public evidence update")
    .replace(/live DeepSeek activation/gi, "public evidence update")
    .replace(/public-safe refresh/gi, "public evidence update")
    .replace(/public evidence refresh/gi, "public evidence update")
    .replace(/activation_[a-z0-9_-]+/gi, "refresh run")
    .replace(/\bactivation\b/gi, "refresh");
}

function isInternalRunLogNote(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("refresh run") ||
    normalized.includes("public-safe refresh public-safe refresh") ||
    normalized.includes("public evidence update contributed") ||
    normalized.includes("cloudflare_snapshot") ||
    normalized.includes("cloudflare static snapshot export") ||
    normalized.includes("getaddrinfo") ||
    normalized.includes("enotfound") ||
    normalized.includes("typeerror: fetch failed") ||
    normalized.includes("read failed") ||
    normalized.includes("count failed") ||
    normalized.includes("latest timestamp failed") ||
    normalized.includes("读取失败") ||
    normalized.includes("计数读取失败") ||
    normalized.includes("最新时间读取失败") ||
    normalized.includes("网络连接失败") ||
    normalized.includes("duplicate refresh rows") ||
    normalized.includes("reviewed local public report snapshot") ||
    (normalized.includes("loaded ") && normalized.includes("public report")) ||
    (normalized.includes("loaded ") && normalized.includes("公开报告")) ||
    normalized.includes("去重后新增") ||
    normalized.includes("本轮 public evidence update") ||
    normalized.includes("本轮公开证据更新") ||
    normalized.includes("supabase public reads were unavailable") ||
    normalized.includes("public-safe cloudflare") ||
    normalized.includes("activation_") ||
    normalized.includes("live deepseek activation") ||
    normalized.includes("activation merge")
  );
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
    .replace(
      /\b(authorization|api[-_]?key|token|cookie|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|DEEPSEEK_API_KEY)\b\s*[:=]\s*[^\s,;]+/gi,
      "[redacted secret]"
    )
    .slice(0, 400);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(`Cloudflare public snapshot failed: ${sanitizeError(error)}`);
    process.exit(1);
  });
