import "@/lib/config/load-cli-env";

import fs from "node:fs/promises";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildRadarFeed } from "@/lib/radar/feed";
import { loadRadarItems } from "@/lib/retrieval/load-radar-items";
import type {
  RetrievalDataSource,
  RetrievalLanguage,
  RetrievalRadarItem
} from "@/lib/retrieval/types";
import type { ReportPreviewType } from "@/lib/reports/types";
import { getSupabaseServerReadClient } from "@/lib/supabase/server-read";
import { RADAR_CATEGORIES, type RadarCategory, type UnderstandingStatus } from "@/lib/understanding/types";

const productionUrl = "https://ai-radar-web-luosongred-5507s-projects.vercel.app";
const outputPath = path.join(process.cwd(), "dist", "github-pages", "data", "radar-snapshot.json");
const radarLimit = 500;
const reportLimit = 24;

type SnapshotSourceKind = "supabase_public_views" | "local_fallback";
type ReportMode = "saved_candidate" | "saved_report" | "local_fallback";

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

export type PublicMirrorSnapshot = {
  schema_version: 1;
  generated_at: string;
  production_url: string;
  mirror: {
    purpose: string;
    pages_url: string;
    dynamic_app_url: string;
    read_only: true;
  };
  source: {
    kind: SnapshotSourceKind;
    data_source: RetrievalDataSource;
    fallback_used: boolean;
    warnings: string[];
  };
  freshness: {
    latest_timestamp: string | null;
    latest_timestamp_source: string | null;
    note: string;
  };
  counts: {
    visible_radar_items: number;
    snapshot_radar_items: number;
    included: number;
    needs_review: number;
    excluded: number;
    failed: number;
    report_snapshots: number;
    saved_report_candidates: number;
    citations: number;
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
      "Public mirror snapshot written:",
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
    "Supabase public URL and anon key are not configured for this process; local radar fallback was used."
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
  const warnings = [...radar.warnings, ...reports.warnings];

  if (radar.items.length === 0) {
    return {
      snapshot: null,
      warnings: [
        ...warnings,
        "Supabase public radar view returned no public-safe rows; local fallback was used."
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
    reports: [],
    sourceKind: "local_fallback",
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
    production_url: productionUrl,
    mirror: {
      dynamic_app_url: productionUrl,
      pages_url: "https://rrrrrredy.github.io/ai-radar-web/",
      purpose: "Public read-only fallback mirror for AI Industry Radar data surfaces.",
      read_only: true
    },
    source: {
      data_source: input.dataSource,
      fallback_used: input.fallbackUsed,
      kind: input.sourceKind,
      warnings: dedupe(input.warnings)
    },
    freshness: {
      latest_timestamp: latest?.value ?? null,
      latest_timestamp_source: latest?.source ?? null,
      note: latest
        ? `Latest public radar timestamp is ${latest.value} (${latest.source}).`
        : "No public radar freshness timestamp is available."
    },
    counts: {
      citations: input.items.length + reportCitationCount,
      excluded: statusCounts.excluded,
      failed: statusCounts.failed,
      included: statusCounts.included,
      needs_review: statusCounts.needs_review,
      report_snapshots: input.reports.length,
      saved_report_candidates: input.reports.filter((report) => report.mode === "saved_candidate").length,
      snapshot_radar_items: input.items.length,
      visible_radar_items: input.exactVisibleRows
    },
    top_categories: countEntries(input.items.flatMap((item) => item.categories.map(labelize))),
    top_source_tiers: countEntries(input.items.map((item) => item.source_tier)),
    top_sources: countEntries(input.items.map((item) => item.source_name)),
    radar_items: input.items,
    reports: input.reports,
    caveats: dedupe([
      "GitHub Pages is a static read-only mirror. Auth, Admin, Ask, Write, APIs, and server actions remain on Vercel Production.",
      "Only public-safe radar and report fields are included. raw_text, raw_metadata, model_metadata, private notes, service-role access, and secrets are excluded.",
      input.fallbackUsed
        ? "This snapshot used a fallback source because Supabase public reads were unavailable to the export process."
        : "Snapshot data came from Supabase public-safe read views using anon read access.",
      ...input.caveats,
      ...input.warnings
    ])
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
    return `${tableName} is not available to anon reads; fallback data was used.`;
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
  console.error(`Public mirror snapshot failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
