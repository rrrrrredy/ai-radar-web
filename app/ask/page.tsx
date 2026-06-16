import { AskRadarClient } from "@/components/ask-radar-client";
import { loadProductDataSummary } from "@/lib/product/data-summary";
import { evidenceFreshnessStatus } from "@/lib/product/freshness";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AskPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const summary = await loadProductDataSummary();
  const freshness = evidenceFreshnessStatus(summary.latest.radar);
  const windowLabel = freshness.isStale ? "这批公开快照" : "今天";
  const periodLabel = freshness.isStale ? "最近可见窗口" : "过去 24 小时";
  const curatedLabel = freshness.isStale ? "行业精选快照" : "今日行业精选";
  const suggestedQuestions = [
    `${windowLabel}有哪些多源确认的模型发布？`,
    `${periodLabel} Agent / 开发工具 有哪些重要变化？`,
    "哪些事件只有单一来源，可信度较低？",
    freshness.isStale ? "哪些来源在本轮刷新失败或没有新内容？" : "哪些来源今天失败或没有新内容？",
    `把${curatedLabel}按重要性排序`,
    ...summary.curatedEvents.slice(0, 2).map((event) => `围绕“${event.canonical_title}”有哪些证据和不确定性？`)
  ];
  const initialQuestion = firstParam(params.question) ?? suggestedQuestions[0] ?? "";

  return (
    <AskRadarClient
      dataSummary={{
        attemptedSources: summary.coverage.attemptedSources,
        dataSource: summary.dataSource,
        eventCount: summary.eventCount,
        freshnessWarning: freshness.warning,
        latestRadarTime: formatTimestamp(summary.latest.radar),
        sourcesWithPublicItems: summary.coverage.sourcesWithPublicItems ?? 0,
        topCategories: summary.topCategories.slice(0, 4),
        visibleRows: summary.counts.visibleRadarItems
      }}
      initialQuestion={initialQuestion}
      suggestedQuestions={suggestedQuestions}
    />
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "待补证据";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(date)} UTC`;
}
