import { WriteRadarClient } from "@/components/write-radar-client";
import { loadProductDataSummary } from "@/lib/product/data-summary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function WritePage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const summary = await loadProductDataSummary();
  const suggestedPrompts = [
    "基于今日行业精选写一段 AI 行业观察",
    "把本周多源确认事件整理成周报提纲",
    "找出适合写成深度分析的 3 个事件",
    "列出证据不足但值得继续跟踪的弱信号",
    ...summary.curatedEvents.slice(0, 2).map((event) => `基于“${event.canonical_title}”写一个带证据边界的观察角度。`)
  ];
  const initialPrompt = firstParam(params.prompt) ?? suggestedPrompts[0] ?? "";

  return (
    <WriteRadarClient
      dataSummary={{
        attemptedSources: summary.coverage.attemptedSources,
        dataSource: summary.dataSource,
        eventCount: summary.eventCount,
        latestRadarTime: formatTimestamp(summary.latest.radar),
        sourcesWithPublicItems: summary.coverage.sourcesWithPublicItems ?? 0,
        topCategories: summary.topCategories.slice(0, 4),
        visibleRows: summary.counts.visibleRadarItems
      }}
      initialPrompt={initialPrompt}
      suggestedPrompts={suggestedPrompts}
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
