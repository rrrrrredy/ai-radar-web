import { WriteRadarClient } from "@/components/write-radar-client";
import { loadProductDataSummary } from "@/lib/product/data-summary";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function WritePage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const summary = await loadProductDataSummary();
  const categoryPrompts = summary.topCategories.slice(0, 3).map((category) => {
    return `Turn current ${category.label} signals into editorial topic candidates.`;
  });
  const suggestedPrompts = [
    ...categoryPrompts,
    "Build a weekly observation outline from the strongest current evidence.",
    "Find weak signals and missing evidence for a cautious industry note.",
    "Group current model, product, and agent/tooling updates into writing angles."
  ];
  const initialPrompt = firstParam(params.prompt) ?? suggestedPrompts[0] ?? "";

  return (
    <WriteRadarClient
      dataSummary={{
        dataSource: summary.dataSource,
        latestRadarTime: formatTimestamp(summary.latest.radar),
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
