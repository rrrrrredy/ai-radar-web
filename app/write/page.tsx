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
    return `把当前 ${category.label} 信号整理成编辑选题候选。`;
  });
  const suggestedPrompts = [
    ...categoryPrompts,
    "基于最强证据生成一份周观察提纲。",
    "找出弱信号和缺失证据，形成谨慎的行业笔记。",
    "把当前模型、产品和智能体/工具更新分组成写作角度。"
  ];
  const initialPrompt = firstParam(params.prompt) ?? suggestedPrompts[0] ?? "";

  return (
    <WriteRadarClient
      dataSummary={{
        attemptedSources: summary.coverage.attemptedSources,
        dataSource: summary.dataSource,
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
