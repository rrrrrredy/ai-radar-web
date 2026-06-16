import { citationFromItem } from "@/lib/retrieval/citations";
import { itemEvidenceTimestamp, type RadarFeed } from "@/lib/radar/feed";
import { publicSignalAdjustedScore } from "@/lib/radar/public-signal-quality";
import type { RetrievalCitation, RetrievalRadarItem } from "@/lib/retrieval/types";
import type { RadarCategory } from "@/lib/understanding/types";
import type {
  ReportPreview,
  ReportPreviewItem,
  ReportPreviewSection,
  ReportPreviewSectionId,
  ReportPreviewType
} from "@/lib/reports/types";

const oneDayMs = 24 * 60 * 60 * 1000;

type SectionDefinition = {
  id: ReportPreviewSectionId;
  title: string;
  categories: RadarCategory[];
};

const sectionDefinitions: SectionDefinition[] = [
  {
    id: "model_product_company_updates",
    title: "模型 / 产品 / 公司动态",
    categories: ["model_release", "product_update", "benchmark", "business", "funding"]
  },
  {
    id: "research_open_source",
    title: "研究 / 开源",
    categories: ["research", "open_source", "benchmark"]
  },
  {
    id: "agents_products",
    title: "智能体 / 产品",
    categories: ["agent", "product_update"]
  },
  {
    id: "business_ecosystem",
    title: "商业 / 生态",
    categories: ["business", "funding", "infrastructure", "regulation", "safety", "media_interview", "opinion", "other"]
  }
];

export function generateReportPreview(feed: RadarFeed, reportType: ReportPreviewType): ReportPreview {
  const anchor = anchorDate(feed);
  const windowDuration = reportType === "daily" ? oneDayMs : 7 * oneDayMs;
  const windowStart = new Date(anchor.getTime() - windowDuration);
  const windowItems = feed.items.filter((item) => isInsideWindow(item, windowStart, anchor));
  const usableItems = sortReportItems(
    windowItems.filter((item) => item.status === "included" || item.status === "needs_review")
  );
  const topItems = usableItems.slice(0, 5);
  const sections = buildSections(windowItems);
  const citations = buildPreviewCitations(topItems, windowItems, sections);
  const includedCount = usableItems.filter((item) => item.status === "included").length;
  const needsReviewCount = usableItems.filter((item) => item.status === "needs_review").length;

  return {
    report_type: reportType,
    title: titleForReport(reportType, anchor),
    time_window: {
      start: windowStart.toISOString(),
      end: anchor.toISOString(),
      explanation:
        reportType === "daily"
          ? "日报预览窗口使用截至最新可见雷达时间戳的 24 小时。"
          : "周报预览窗口使用截至最新可见雷达时间戳的 7 天。",
      matched_phrase: reportType === "daily" ? "日报预览" : "周报预览"
    },
    data_source: feed.data_source,
    summary: summaryForReport(reportType, usableItems, includedCount, needsReviewCount, feed.counts.total),
    top_items: topItems.map(mapPreviewItem),
    sections,
    caveats: buildReportCaveats(feed, usableItems, windowItems),
    citations,
    missing_evidence: buildMissingEvidence(feed, usableItems, citations),
    generated_at: anchor.toISOString(),
    retrieved_item_count: windowItems.length,
    usable_item_count: usableItems.length
  };
}

function buildSections(windowItems: RetrievalRadarItem[]): ReportPreviewSection[] {
  const standardSections = sectionDefinitions.map((section) => {
    const items = sortReportItems(
      windowItems.filter(
        (item) =>
          (item.status === "included" || item.status === "needs_review") &&
          item.categories.some((category) => section.categories.includes(category))
      )
    ).slice(0, 5);

    return buildSection(section.id, section.title, items);
  });

  const weakSignals = sortReportItems(
    windowItems.filter(
      (item) =>
        item.status === "needs_review" ||
        item.status === "excluded" ||
        item.status === "failed" ||
        item.confidence < 0.55 ||
        item.credibility_score < 0.55
    )
  ).slice(0, 6);

  return [
    ...standardSections,
    buildSection("weak_signals_needs_review", "弱信号 / 待复核", weakSignals)
  ];
}

function buildSection(
  id: ReportPreviewSectionId,
  title: string,
  items: RetrievalRadarItem[]
): ReportPreviewSection {
  const usableItems = items.filter((item) => item.status === "included" || item.status === "needs_review");
  const needsReviewCount = usableItems.filter((item) => item.status === "needs_review").length;
  const excludedCount = items.filter((item) => item.status === "excluded" || item.status === "failed").length;

  return {
    id,
    title,
    summary:
      items.length === 0
        ? "当前时间窗口没有雷达条目支撑本章节。"
        : `${items.length} 条雷达条目匹配本章节。${
            needsReviewCount > 0 ? `${needsReviewCount} 条仍需复核。` : ""
          }${excludedCount > 0 ? `${excludedCount} 条已排除或失败，只作为弱信号展示。` : ""}`.trim(),
    items: items.map(mapPreviewItem),
    caveats: [
      needsReviewCount > 0 ? "待复核条目需要谨慎措辞并确认。" : "",
      excludedCount > 0 ? "已排除或失败记录不能作为报告证据。" : ""
    ].filter(Boolean),
    missing_evidence:
      usableItems.length === 0
        ? ["当前没有可用的已纳入或待复核条目支撑本章节。"]
        : sectionMissingEvidence(usableItems)
  };
}

function mapPreviewItem(item: RetrievalRadarItem): ReportPreviewItem {
  return {
    id: item.id,
    database_id: item.database_id,
    title: item.title,
    source_name: item.source_name,
    url: item.url,
    timestamp: itemEvidenceTimestamp(item),
    summary: item.summary_zh || item.summary_en || "当前条目暂无摘要。",
    categories: item.categories,
    tags: item.tags,
    source_tier: item.source_tier,
    status: item.status,
    confidence: item.confidence,
    overall_score: item.overall_score,
    why_it_matters: item.why_it_matters,
    evidence_notes: item.evidence_notes
  };
}

function sortReportItems(items: RetrievalRadarItem[]) {
  return [...items].sort((left, right) => {
    const statusDelta = reportStatusRank(left) - reportStatusRank(right);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const scoreDelta = publicSignalAdjustedScore(right.overall_score, right) - publicSignalAdjustedScore(left.overall_score, left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const timeDelta =
      Date.parse(itemEvidenceTimestamp(right)) - Date.parse(itemEvidenceTimestamp(left));
    if (Number.isFinite(timeDelta) && timeDelta !== 0) {
      return timeDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

function reportStatusRank(item: RetrievalRadarItem) {
  if (item.status === "included") {
    return 0;
  }

  if (item.status === "needs_review") {
    return 1;
  }

  if (item.status === "excluded") {
    return 2;
  }

  return 3;
}

function buildPreviewCitations(
  topItems: RetrievalRadarItem[],
  windowItems: RetrievalRadarItem[],
  sections: ReportPreviewSection[]
): RetrievalCitation[] {
  const citations = new Map<string, RetrievalCitation>();
  const windowItemById = new Map(windowItems.map((item) => [item.id, item]));
  const sectionItemIds = sections.flatMap((section) =>
    section.items
      .filter((item) => item.status === "included" || item.status === "needs_review")
      .map((item) => item.id)
  );
  const sectionItems = sectionItemIds
    .map((id) => windowItemById.get(id))
    .filter((item): item is RetrievalRadarItem => Boolean(item));
  const candidates = [...topItems, ...sectionItems];

  for (const item of candidates) {
    citations.set(item.id, citationFromItem(item));
  }

  return Array.from(citations.values()).slice(0, 12);
}

function summaryForReport(
  reportType: ReportPreviewType,
  usableItems: RetrievalRadarItem[],
  includedCount: number,
  needsReviewCount: number,
  totalCount: number
) {
  if (totalCount === 0) {
    return `${reportType === "daily" ? "日报" : "周报"}暂时缺少可用雷达证据，不能形成可靠报告。`;
  }

  if (usableItems.length === 0) {
    return `${reportType === "daily" ? "日报" : "周报"}时间窗口内没有可用或待复核证据。`;
  }

  const categories = Array.from(new Set(usableItems.flatMap((item) => item.categories))).slice(0, 5);
  const top = usableItems[0];

  return [
    `${reportType === "daily" ? "日报" : "周报"}证据预览基于 ${usableItems.length} 条可用雷达条目。`,
    `${includedCount} 条已纳入，${needsReviewCount} 条待复核。`,
    `最高可见信号："${top.title}" 来自 ${top.source_name}。`,
    `可见类别：${categories.join("、") || "未分类"}。`
  ].join(" ");
}

function buildReportCaveats(
  feed: RadarFeed,
  usableItems: RetrievalRadarItem[],
  windowItems: RetrievalRadarItem[]
) {
  const excludedOrFailed = windowItems.filter((item) => item.status === "excluded" || item.status === "failed").length;

  return dedupe([
    ...feed.caveats,
    "这是证据预览，不是已发布报告。",
    "本次预览未运行写入或定时任务。",
    feed.data_source === "mock_data"
      ? "演示数据不能支撑当前 AI 行业判断。"
      : "",
    feed.data_source === "local_understanding_output"
      ? "本地理解输出可能滞后或只含元数据，发布前需要复核原始来源。"
      : "",
    feed.data_source === "supabase_radar_items"
      ? "公开覆盖范围取决于已经入库或快照化的可公开证据。"
      : "",
    usableItems.length < 3
      ? "可用条目少于 3 条，报告综合应保持窄范围。"
      : "",
    usableItems.every((item) => item.status !== "included") && usableItems.length > 0
      ? "当前窗口没有已纳入条目，报告措辞必须保持暂定。"
      : "",
    excludedOrFailed > 0
      ? `${excludedOrFailed} 条排除或失败记录只能作为弱信号。`
      : ""
  ]);
}

function buildMissingEvidence(
  feed: RadarFeed,
  usableItems: RetrievalRadarItem[],
  citations: RetrievalCitation[]
) {
  return dedupe([
    usableItems.length === 0 ? "至少需要一条已纳入或待复核雷达条目。" : "",
    usableItems.length < 3 ? "需要更多独立条目才能形成宽口径日报或周报。" : "",
    usableItems.every((item) => item.status !== "included") && usableItems.length > 0
      ? "在作为确认事实前需要人工复核。"
      : "",
    usableItems.some((item) => item.evidence_notes.some((note) => note.toLowerCase().includes("metadata-level")))
      ? "除元数据级证据外，还需要完整原文或官方公告。"
      : "",
    citations.length === 0 ? "当前预览没有可引用来源。" : "",
    feed.data_source === "mock_data" ? "需要真实理解输出或公开证据库数据。" : "",
    feed.data_source === "empty" ? "需要先补充可检索证据源。" : ""
  ]);
}

function sectionMissingEvidence(items: RetrievalRadarItem[]) {
  return dedupe([
    items.some((item) => item.status === "needs_review") ? "待复核条目需要人工确认。" : "",
    items.length < 2 ? "章节级综合需要更多独立证据。" : "",
    items.some((item) => item.evidence_notes.length === 0) ? "每条证据需要补充证据说明或来源摘录。" : ""
  ]);
}

function anchorDate(feed: RadarFeed) {
  const timestamp =
    feed.freshness.latestTimestamp ?? feed.processed_at ?? feed.collected_at ?? feed.generated_at;
  const parsed = Date.parse(timestamp);

  return Number.isFinite(parsed) ? new Date(parsed) : new Date();
}

function isInsideWindow(item: RetrievalRadarItem, start: Date, end: Date) {
  const timestamp = Date.parse(itemEvidenceTimestamp(item));
  return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp <= end.getTime();
}

function titleForReport(reportType: ReportPreviewType, anchor: Date) {
  const date = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(anchor);

  return reportType === "daily"
    ? `Daily AI Radar preview - ${date}`
    : `Weekly AI Radar preview - ending ${date}`;
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
