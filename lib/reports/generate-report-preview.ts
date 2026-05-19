import { citationFromItem } from "@/lib/retrieval/citations";
import { itemEvidenceTimestamp, type RadarFeed } from "@/lib/radar/feed";
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
    title: "Model / product / company updates",
    categories: ["model_release", "product_update", "benchmark", "business", "funding"]
  },
  {
    id: "research_open_source",
    title: "Research / open-source",
    categories: ["research", "open_source", "benchmark"]
  },
  {
    id: "agents_products",
    title: "Agents / products",
    categories: ["agent", "product_update"]
  },
  {
    id: "business_ecosystem",
    title: "Business / ecosystem",
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
          ? "Daily preview window uses the 24 hours ending at the latest visible radar timestamp."
          : "Weekly preview window uses the 7 days ending at the latest visible radar timestamp.",
      matched_phrase: reportType === "daily" ? "daily preview" : "weekly preview"
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
    buildSection("weak_signals_needs_review", "Weak signals / needs_review", weakSignals)
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
        ? "No retrieved radar items in this window support this section."
        : `${items.length} radar item(s) matched this section. ${
            needsReviewCount > 0 ? `${needsReviewCount} still need review. ` : ""
          }${excludedCount > 0 ? `${excludedCount} are excluded or failed and are shown only as weak signals.` : ""}`.trim(),
    items: items.map(mapPreviewItem),
    caveats: [
      needsReviewCount > 0 ? "needs_review items should use cautious language and require confirmation." : "",
      excludedCount > 0 ? "Excluded or failed rows are not report evidence." : ""
    ].filter(Boolean),
    missing_evidence:
      usableItems.length === 0
        ? ["No usable included or needs_review item currently supports this section."]
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
    summary: item.summary_en || item.summary_zh || "No summary is available for this radar item.",
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

    const scoreDelta = right.overall_score - left.overall_score;
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
    return `No ${reportType} preview can be supported because no radar items were retrieved.`;
  }

  if (usableItems.length === 0) {
    return `The ${reportType} preview has no usable included or needs_review radar evidence in the resolved window.`;
  }

  const categories = Array.from(new Set(usableItems.flatMap((item) => item.categories))).slice(0, 5);
  const top = usableItems[0];

  return [
    `Deterministic ${reportType} preview from ${usableItems.length} usable radar item(s).`,
    `${includedCount} included and ${needsReviewCount} needs_review item(s).`,
    `Top visible signal: "${top.title}" from ${top.source_name}.`,
    `Visible categories: ${categories.join(", ") || "uncategorized"}.`
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
    "This is a deterministic preview, not a published report.",
    "No live DeepSeek call, Supabase write, or scheduled persistence job was run.",
    feed.data_source === "mock_data"
      ? "Mock data cannot support claims about current AI industry activity."
      : "",
    feed.data_source === "local_understanding_output"
      ? "Local output may be stale or metadata-only; verify source pages before publication."
      : "",
    feed.data_source === "supabase_radar_items"
      ? "Supabase coverage depends on rows already persisted into the public retrieval view."
      : "",
    usableItems.length < 3
      ? "The preview has fewer than 3 usable items, so report synthesis should remain narrow."
      : "",
    usableItems.every((item) => item.status !== "included") && usableItems.length > 0
      ? "No usable item in this window is marked included; report language must remain provisional."
      : "",
    excludedOrFailed > 0
      ? `${excludedOrFailed} excluded or failed row(s) are visible only as weak signals.`
      : ""
  ]);
}

function buildMissingEvidence(
  feed: RadarFeed,
  usableItems: RetrievalRadarItem[],
  citations: RetrievalCitation[]
) {
  return dedupe([
    usableItems.length === 0 ? "At least one included or reviewed radar item is needed." : "",
    usableItems.length < 3 ? "More independent items are needed for a broad daily or weekly synthesis." : "",
    usableItems.every((item) => item.status !== "included") && usableItems.length > 0
      ? "Human review is needed before treating any item as confirmed."
      : "",
    usableItems.some((item) => item.evidence_notes.some((note) => note.toLowerCase().includes("metadata-level")))
      ? "Full article text or original announcements are needed beyond metadata-level evidence."
      : "",
    citations.length === 0 ? "No citations are available for this preview." : "",
    feed.data_source === "mock_data" ? "Real local understanding output or Supabase retrieval data is needed." : "",
    feed.data_source === "empty" ? "A populated retrieval source is needed." : ""
  ]);
}

function sectionMissingEvidence(items: RetrievalRadarItem[]) {
  return dedupe([
    items.some((item) => item.status === "needs_review") ? "Human confirmation for needs_review items." : "",
    items.length < 2 ? "Additional independent evidence for section-level synthesis." : "",
    items.some((item) => item.evidence_notes.length === 0) ? "Evidence notes or source excerpts for each item." : ""
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
