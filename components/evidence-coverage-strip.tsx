import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip } from "@/components/status-chip";
import type { GenerationMode } from "@/lib/qa/types";
import type { RetrievalCitation, RetrievalDataSource } from "@/lib/retrieval/types";

export function EvidenceCoverageStrip({
  citations,
  dataSource,
  gapCount,
  gapLabel,
  generationMode,
  itemCount,
  itemLabel = "检索条目"
}: {
  citations: RetrievalCitation[];
  dataSource: RetrievalDataSource;
  gapCount: number;
  gapLabel: string;
  generationMode: GenerationMode;
  itemCount: number;
  itemLabel?: string;
}) {
  const sourceCount = new Set(citations.map((citation) => citation.source_name)).size;
  const needsReviewCount = citations.filter((citation) => citation.status === "needs_review").length;
  const latestEvidenceTime = latestCitationTimestamp(citations);

  return (
    <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-radar-ink">证据覆盖度</h2>
        <DataSourceChip detail="输出依据" source={dataSource} />
        <StatusChip
          label="外部模型"
          tone={generationMode === "live" ? "evidence" : "caution"}
          value={generationMode === "live" ? "已调用" : "未调用"}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <EvidenceBadge detail={String(itemCount)} kind="evidence" label={itemLabel} />
        <EvidenceBadge detail={String(citations.length)} kind="citation" label="引用" />
        <EvidenceBadge detail={String(sourceCount)} kind="freshness" label="来源" />
        <EvidenceBadge detail={formatTimestamp(latestEvidenceTime)} kind="freshness" label="最新内容发布时间" />
        <EvidenceBadge
          detail={String(needsReviewCount)}
          kind={needsReviewCount > 0 ? "needs_review" : "evidence"}
          label="待复核"
        />
        <EvidenceBadge
          detail={String(gapCount)}
          kind={gapCount > 0 ? "uncertainty" : "evidence"}
          label={gapLabel}
        />
      </div>
    </section>
  );
}

function latestCitationTimestamp(citations: RetrievalCitation[]) {
  return citations
    .map((citation) => citation.published_at)
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function formatTimestamp(value: string | undefined) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(date);
}
