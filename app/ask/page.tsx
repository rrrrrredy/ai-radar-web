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
    return `What changed in ${category.label} signals?`;
  });
  const suggestedQuestions = [
    ...categoryQuestions,
    "Which signals are strong enough for a weekly report?",
    "Which items still need human review?",
    "What are the newest product or model updates?"
  ];
  const initialQuestion = firstParam(params.question) ?? suggestedQuestions[0] ?? "";

  return (
    <AskRadarClient
      dataSummary={{
        dataSource: summary.dataSource,
        latestRadarTime: formatTimestamp(summary.latest.radar),
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
    return "not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(date)} UTC`;
}
