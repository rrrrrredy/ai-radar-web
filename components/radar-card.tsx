import { SourceBadge } from "@/components/source-badge";
import { formatPercent, formatScore } from "@/lib/utils";
import { calculateCompositeScore, getSignalLabel } from "@/lib/radar/scoring";
import type { RadarItem, Source } from "@/lib/radar/types";

export function RadarCard({ item, source }: { item: RadarItem; source?: Source }) {
  const compositeScore = calculateCompositeScore(item);

  return (
    <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-radar-cyan px-2 py-1 text-xs font-semibold text-white">
          {getSignalLabel(compositeScore)}
        </span>
        <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
          {item.category}
        </span>
        {source ? <SourceBadge source={source} /> : null}
      </div>
      <h2 className="mt-4 text-lg font-semibold leading-7 text-radar-ink">{item.title}</h2>
      <p className="mt-3 text-sm leading-6 text-radar-muted">{item.summaryEn}</p>
      <p className="mt-3 text-sm leading-6 text-radar-muted">{item.summaryZh}</p>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-radar-muted">Composite</p>
          <p className="font-semibold text-radar-ink">{formatScore(compositeScore)}</p>
        </div>
        <div>
          <p className="text-xs text-radar-muted">Credibility</p>
          <p className="font-semibold text-radar-ink">{formatPercent(item.credibilityScore)}</p>
        </div>
        <div>
          <p className="text-xs text-radar-muted">Novelty</p>
          <p className="font-semibold text-radar-ink">{formatPercent(item.noveltyScore)}</p>
        </div>
        <div>
          <p className="text-xs text-radar-muted">Importance</p>
          <p className="font-semibold text-radar-ink">{formatPercent(item.importanceScore)}</p>
        </div>
      </div>
    </article>
  );
}
