import "server-only";

import {
  loadPublicDataCompletenessSummary,
  type PublicDataCompletenessSummary
} from "@/lib/data-completeness/public-summary";
import { loadRadarFeed, type RadarFeed, itemEvidenceTimestamp } from "@/lib/radar/feed";
import { loadReportWorkflowData } from "@/lib/reports/load-report-data";
import type { ReportWorkflowDocument } from "@/lib/reports/types";
import type { RetrievalRadarItem } from "@/lib/retrieval/types";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { UnderstandingStatus } from "@/lib/understanding/types";

export type CountEntry = {
  label: string;
  count: number;
  href?: string;
};

export type ProductDataSummary = {
  dataSource: RadarFeed["data_source"];
  counts: {
    sources: number | null;
    rawItems: number | null;
    radarItems: number | null;
    visibleRadarItems: number;
    included: number;
    needsReview: number;
    excluded: number;
    failed: number;
    reportCandidates: number | null;
    citations: number;
  };
  latest: {
    ingestion: string | null;
    understanding: string | null;
    radar: string | null;
  };
  freshnessNote: string;
  topCategories: CountEntry[];
  topSources: CountEntry[];
  topSourceFamilies: CountEntry[];
  latestSignals: Array<{
    id: string;
    title: string;
    source: string;
    status: UnderstandingStatus;
    timestamp: string;
    href: string;
    categories: string[];
  }>;
  reports: {
    daily: ReportWorkflowDocument | null;
    weekly: ReportWorkflowDocument | null;
    savedCount: number;
  };
  caveats: string[];
  warnings: string[];
  coverage: PublicDataCompletenessSummary;
};

type OperationalSummary = {
  sources: number | null;
  rawItems: number | null;
  radarItems: number | null;
  reportCandidates: number | null;
  statusCounts: Partial<Record<UnderstandingStatus, number>>;
  latestIngestion: string | null;
  latestUnderstanding: string | null;
  warnings: string[];
};

type SupabaseCountQuery = {
  count: number | null;
  error: { message: string } | null;
};

const emptyOperationalSummary: OperationalSummary = {
  latestIngestion: null,
  latestUnderstanding: null,
  radarItems: null,
  rawItems: null,
  reportCandidates: null,
  sources: null,
  statusCounts: {},
  warnings: []
};

export async function loadProductDataSummary(): Promise<ProductDataSummary> {
  const [feed, reportData, operational, coverage] = await Promise.all([
    loadRadarFeed(),
    loadReportWorkflowData(),
    loadOperationalSummary(),
    loadPublicDataCompletenessSummary()
  ]);
  const reportsByType = new Map(reportData.reports.map((report) => [report.report_type, report]));
  const caveats = Array.from(new Set([...feed.caveats, ...reportData.warnings]));
  const warnings = Array.from(new Set([...operational.warnings, ...reportData.warnings]));

  return {
    dataSource: feed.data_source,
    counts: {
      sources: operational.sources,
      rawItems: operational.rawItems,
      radarItems: operational.radarItems,
      visibleRadarItems: feed.counts.total,
      included: operational.statusCounts.included ?? feed.counts.included,
      needsReview: operational.statusCounts.needs_review ?? feed.counts.needs_review,
      excluded: operational.statusCounts.excluded ?? feed.counts.excluded,
      failed: operational.statusCounts.failed ?? feed.counts.failed,
      reportCandidates: operational.reportCandidates,
      citations: feed.citations.length
    },
    latest: {
      ingestion: operational.latestIngestion,
      radar: feed.freshness.latestTimestamp ?? feed.processed_at ?? null,
      understanding: operational.latestUnderstanding
    },
    freshnessNote: feed.freshness_note,
    topCategories: countEntries(feed.counts.by_category, (category) => ({
      href: `/radar?category=${encodeURIComponent(category)}`,
      label: labelize(category)
    })),
    topSources: countEntries(feed.counts.by_source),
    topSourceFamilies: countSourceFamilies(feed.items),
    latestSignals: feed.items.slice(0, 6).map((item) => ({
      categories: item.categories.map(labelize),
      href: item.url,
      id: item.id,
      source: item.source_name,
      status: item.status,
      timestamp: itemEvidenceTimestamp(item),
      title: item.title
    })),
    reports: {
      daily: reportsByType.get("daily") ?? null,
      weekly: reportsByType.get("weekly") ?? null,
      savedCount: reportData.reports.filter((report) => report.read_source === "supabase").length
    },
    caveats,
    warnings,
    coverage
  };
}

async function loadOperationalSummary(): Promise<OperationalSummary> {
  try {
    const supabase = getSupabaseServiceClient();
    const [sources, rawItems, radarItems, reportCandidates, statusRows, ingestionRows, understandingRows] =
      await Promise.all([
        exactCount("sources"),
        exactCount("raw_items"),
        exactCount("radar_items"),
        exactCount("report_candidates"),
        supabase.from("radar_items").select("understanding_status").limit(5000),
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

    const warnings = [sources, rawItems, radarItems, reportCandidates]
      .filter((result): result is { error: string } => typeof result === "object" && result !== null && "error" in result)
      .map((result) => result.error);

    return {
      sources: readCount(sources),
      rawItems: readCount(rawItems),
      radarItems: readCount(radarItems),
      reportCandidates: readCount(reportCandidates),
      statusCounts: statusRows.error
        ? {}
        : countStatuses((statusRows.data ?? []) as Array<{ understanding_status?: string | null }>),
      latestIngestion: latestRunTimestamp(
        ingestionRows.error
          ? null
          : ((ingestionRows.data ?? [])[0] as { finished_at?: string | null; started_at?: string | null } | undefined)
      ),
      latestUnderstanding: latestRunTimestamp(
        understandingRows.error
          ? null
          : ((understandingRows.data ?? [])[0] as { ended_at?: string | null; started_at?: string | null } | undefined)
      ),
      warnings
    };
  } catch (error) {
    return {
      ...emptyOperationalSummary,
      warnings: [`Aggregate Supabase counts unavailable: ${sanitizeSummaryError(error)}`]
    };
  }
}

async function exactCount(table: string): Promise<number | { error: string }> {
  const supabase = getSupabaseServiceClient();
  const { count, error } = (await supabase
    .from(table)
    .select("id", { count: "exact", head: true })) as SupabaseCountQuery;

  if (error) {
    return { error: `${table} count failed: ${sanitizeSummaryError(error.message)}` };
  }

  return count ?? 0;
}

function readCount(value: number | { error: string }) {
  return typeof value === "number" ? value : null;
}

function countStatuses(rows: Array<{ understanding_status?: string | null }>) {
  const counts: Partial<Record<UnderstandingStatus, number>> = {};

  for (const row of rows) {
    const status = row.understanding_status;
    if (
      status === "included" ||
      status === "needs_review" ||
      status === "excluded" ||
      status === "failed"
    ) {
      counts[status] = (counts[status] ?? 0) + 1;
    }
  }

  return counts;
}

function latestRunTimestamp(row: { ended_at?: string | null; finished_at?: string | null; started_at?: string | null } | null | undefined) {
  return row?.ended_at ?? row?.finished_at ?? row?.started_at ?? null;
}

function countEntries(
  counts: Record<string, number> | Partial<Record<string, number>>,
  mapLabel: (label: string) => { label: string; href?: string } = (label) => ({ label })
): CountEntry[] {
  return Object.entries(counts)
    .filter((entry): entry is [string, number] => Boolean(entry[0]) && Number(entry[1]) > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([rawLabel, count]) => ({
      ...mapLabel(rawLabel),
      count
    }));
}

function countSourceFamilies(items: RetrievalRadarItem[]): CountEntry[] {
  const counts: Record<string, number> = {};

  for (const item of items) {
    const family = sourceFamily(item);
    counts[family] = (counts[family] ?? 0) + 1;
  }

  return countEntries(counts);
}

export function sourceFamily(item: Pick<RetrievalRadarItem, "source_name" | "url" | "source_tier">) {
  const haystack = `${item.source_name} ${item.url} ${item.source_tier}`.toLowerCase();

  if (haystack.includes("arxiv")) {
    return "研究订阅";
  }

  if (haystack.includes("github") || haystack.includes("release") || haystack.includes("hugging face")) {
    return "开源项目";
  }

  if (
    ["openai", "anthropic", "google", "deepmind", "gemini", "meta", "llama", "deepseek", "qwen"].some((term) =>
      haystack.includes(term)
    )
  ) {
    return "公司/实验室";
  }

  if (["lex", "every", "latent", "lenny", "benedict", "karpathy"].some((term) => haystack.includes(term))) {
    return "分析/媒体";
  }

  return "其他公开来源";
}

export function labelize(value: string) {
  const labels: Record<string, string> = {
    benchmark: "基准",
    business: "商业",
    infrastructure: "基础设施",
    model_release: "模型发布",
    open_source: "开源",
    policy: "政策",
    product_update: "产品更新",
    research: "研究",
    safety: "安全",
    tooling: "工具"
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function sanitizeSummaryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 300);
}
