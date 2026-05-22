import "@/lib/config/load-cli-env";

import fs from "node:fs/promises";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadPublicDataCompletenessSummary,
  type PublicDataCompletenessSummary
} from "@/lib/data-completeness/public-summary";
import { buildRadarFeed } from "@/lib/radar/feed";
import { loadRadarItems } from "@/lib/retrieval/load-radar-items";
import type {
  RetrievalDataSource,
  RetrievalLanguage,
  RetrievalRadarItem
} from "@/lib/retrieval/types";
import type { ReportPreviewType } from "@/lib/reports/types";
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
  data_source: RetrievalDataSource | "unknown";
  time_window: {
    start: string;
    end: string;
  };
  generated_at?: string;
  saved_at?: string;
  source_item_count: number;
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
    data_source: RetrievalDataSource;
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
    failed_source_reasons: Record<string, number>;
    skipped_source_reasons: Record<string, number>;
  };
  top_categories: CountEntry[];
  top_sources: CountEntry[];
  top_source_tiers: CountEntry[];
  radar_items: PublicRadarSnapshotItem[];
  reports: PublicReportSnapshot[];
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

    return readLocalFallbackSnapshot(generatedAt, supabaseSnapshot.warnings);
  }

  return readLocalFallbackSnapshot(generatedAt, [
    "Supabase public URL and anon key are not configured for this process; local generated radar data was used."
  ]);
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
  const [candidates, reports] = await Promise.all([
    readPublicReportCandidates(supabase),
    readPublicReports(supabase)
  ]);

  return {
    reports: [...candidates.reports, ...reports.reports]
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
  const reportCitationCount = input.reports.reduce((count, report) => count + report.citations.length, 0);

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
      data_source: input.dataSource,
      kind: input.sourceKind,
      local_data_used: input.fallbackUsed,
      warnings: dedupe(input.warnings)
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
      report_snapshots: input.reports.length,
      saved_report_candidates: input.reports.filter((report) => report.mode === "saved_candidate").length,
      scores: input.operationalCounts.scores,
      sources: input.operationalCounts.sources,
      snapshot_radar_items: input.items.length,
      understanding_runs: input.operationalCounts.understanding_runs,
      visible_radar_items: input.exactVisibleRows
    },
    coverage: {
      attempted_sources: input.publicCoverage.attemptedSources,
      automated_eligible_sources: input.publicCoverage.automatedEligibleSources,
      failed_source_reasons: input.publicCoverage.failedSourceReasons,
      failed_sources: input.publicCoverage.failedSources,
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
    radar_items: input.items,
    reports: input.reports,
    caveats: dedupe([
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      input.fallbackUsed
        ? "This snapshot used local generated data because Supabase public reads were unavailable to the export process."
        : "Snapshot data came from Supabase public-safe read views using anon read access.",
      ...input.caveats,
      ...input.warnings,
      ...input.operationalCounts.warnings
    ])
  };
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

  return {
    id,
    caveats: stringArray(draft.caveats, 8, 700),
    citations: normalizeReportCitations(draft.citations),
    confidence: optionalScore(row.confidence),
    data_source: dataSourceValue(draft.data_source) ?? "supabase_radar_items",
    executive_summary: optionalText(draft.executive_summary),
    generated_at: optionalText(draft.generated_at) ?? optionalText(row.updated_at),
    missing_evidence: stringArray(draft.missing_evidence, 8, 700),
    mode: "saved_candidate",
    report_type: reportType,
    saved_at: optionalText(row.created_at),
    sections: normalizeReportSections(draft.sections),
    source_item_count: sourceItemIds.length || draftSourceItemIds.length,
    status: text(row.status) || "draft",
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
  const title = text(row.title);

  if (!id || !reportType || !title) {
    return null;
  }

  const draft = record(row.report_draft);
  const draftSourceItemIds = stringArray(draft.source_item_ids, 100, 120);

  return {
    id,
    caveats: stringArray(draft.caveats, 8, 700),
    citations: normalizeReportCitations(draft.citations),
    data_source: dataSourceValue(draft.data_source) ?? "supabase_radar_items",
    executive_summary: text(draft.executive_summary, 2200) || text(row.body, 2200) || undefined,
    generated_at: optionalText(draft.generated_at) ?? optionalText(row.published_at) ?? optionalText(row.created_at),
    missing_evidence: stringArray(draft.missing_evidence, 8, 700),
    mode: "saved_report",
    report_type: reportType,
    saved_at: optionalText(row.published_at) ?? optionalText(row.created_at),
    sections: normalizeReportSections(draft.sections),
    source_item_count: draftSourceItemIds.length,
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
