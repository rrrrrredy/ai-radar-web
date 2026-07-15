import "server-only";

import { loadPublicSafeDataCompletenessSummary } from "@/lib/data-completeness/public-safe-summary";
import type { PublicDataCompletenessSummary } from "@/lib/data-completeness/types";
import {
  buildEventLayer,
  filterPublicDisplayEventLayer,
  type PublicEventCluster
} from "@/lib/events/clustering";
import { loadRadarFeed, type RadarFeed, itemEvidenceTimestamp } from "@/lib/radar/feed";
import { loadReportWorkflowData } from "@/lib/reports/load-report-data";
import type { ReportWorkflowDocument } from "@/lib/reports/types";
import type { RetrievalRadarItem } from "@/lib/retrieval/types";
import type { RadarCategory, UnderstandingStatus } from "@/lib/understanding/types";

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
  categorySignals: Array<{
    categories: RadarCategory[];
  }>;
  topSources: CountEntry[];
  topSourceFamilies: CountEntry[];
  eventCount: number;
  curatedEvents: PublicEventCluster[];
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

export async function loadProductDataSummary(): Promise<ProductDataSummary> {
  const feed = await loadRadarFeed();
  const [reportData, coverage] = await Promise.all([
    loadReportWorkflowData({ feed, publicSnapshotLocalOnly: true }),
    loadPublicSafeDataCompletenessSummary(feed)
  ]);
  const eventLayer = filterPublicDisplayEventLayer(buildEventLayer(
    feed.items.map((item) => ({
      categories: item.categories,
      collected_at: item.collected_at,
      confidence: item.confidence,
      entities: item.entities,
      evidence_notes: item.evidence_notes,
      id: item.id,
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
      summary_en: item.summary_en,
      summary_zh: item.summary_zh,
      tags: item.tags,
      title: item.title,
      url: item.url,
      why_it_matters: item.why_it_matters
    }))
  ));
  const reportsByType = new Map(reportData.reports.map((report) => [report.report_type, report]));
  const caveats = Array.from(new Set([...feed.caveats, ...reportData.warnings]));
  const warnings = Array.from(new Set([...coverage.warnings, ...reportData.warnings]));

  return {
    dataSource: feed.data_source,
    counts: {
      sources: coverage.sourcesTotal,
      rawItems: coverage.rawItems,
      radarItems: coverage.radarItems,
      visibleRadarItems: feed.counts.total,
      included: coverage.included ?? feed.counts.included,
      needsReview: coverage.needsReview ?? feed.counts.needs_review,
      excluded: coverage.excluded ?? feed.counts.excluded,
      failed: coverage.failedRadarItems ?? feed.counts.failed,
      reportCandidates: coverage.reportCandidates,
      citations: feed.citations.length
    },
    latest: {
      ingestion: coverage.latestIngestion,
      radar: feed.freshness.latestTimestamp ?? null,
      understanding: coverage.latestUnderstanding
    },
    freshnessNote: feed.freshness_note,
    topCategories: countEntries(feed.counts.by_category, (category) => ({
      href: `/radar?category=${encodeURIComponent(category)}`,
      label: labelize(category)
    })),
    categorySignals: feed.items.map((item) => ({
      categories: item.categories
    })),
    topSources: countEntries(feed.counts.by_source),
    topSourceFamilies: countSourceFamilies(feed.items),
    curatedEvents: eventLayer.curated_events,
    eventCount: eventLayer.event_count,
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
    agent: "智能体",
    funding: "融资",
    infrastructure: "基础设施",
    media_interview: "访谈/播客",
    model_release: "模型发布",
    open_source: "开源",
    opinion: "观点",
    policy: "政策",
    product_update: "产品更新",
    regulation: "监管",
    research: "研究",
    safety: "安全",
    tooling: "工具"
  };
  return labels[value] ?? value.replace(/_/g, " ");
}
