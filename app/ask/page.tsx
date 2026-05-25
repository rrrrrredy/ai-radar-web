import { AskRadarClient } from "@/components/ask-radar-client";
import { loadProductDataSummary } from "@/lib/product/data-summary";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AskPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const summary = await loadProductDataSummary();
  const categoryQuestions = summary.topCategories.slice(0, 3).map((category) => {
    return `${category.label} 信号最近有什么变化？`;
  });
  const suggestedQuestions = [
    ...categoryQuestions,
    "哪些信号已经足够支撑周报？",
    "哪些条目仍然需要人工复核？",
    "最新的产品或模型更新是什么？"
  ];
  const initialQuestion = firstParam(params.question) ?? suggestedQuestions[0] ?? "";

  return (
    <AskRadarClient
      dataSummary={{
        attemptedSources: summary.coverage.attemptedSources,
        dataSource: summary.dataSource,
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
    return "不可用";
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
