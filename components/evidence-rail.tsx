import { DataSourceChip, type DataSource } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import type { GenerationMode } from "@/lib/qa/types";
import type { ResolvedTimeWindow } from "@/lib/retrieval/types";

export type EvidenceRailContextItem = {
  label: string;
  value: string | number;
  tone?: StatusTone;
};

export function EvidenceRail({
  citationsCount,
  context = [],
  dataSource,
  freshnessNote,
  generationMode,
  itemCount,
  itemCountLabel = "Retrieved items",
  modelMetadata,
  timeWindow,
  title = "Evidence rail"
}: {
  citationsCount: number;
  context?: EvidenceRailContextItem[];
  dataSource: DataSource;
  freshnessNote?: string;
  generationMode: GenerationMode;
  itemCount?: number;
  itemCountLabel?: string;
  modelMetadata?: {
    provider: string;
    model?: string;
    prompt_version: string;
    api_call_count: number;
  };
  timeWindow: ResolvedTimeWindow;
  title?: string;
}) {
  const dataSourceCaveat = getDataSourceCaveat(dataSource);
  const liveModelLabel = generationMode === "live" ? "live" : "disabled/mock";

  return (
    <aside
      aria-label={title}
      className="space-y-4 rounded-lg border border-radar-line bg-radar-panel p-4"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
          {title}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <DataSourceChip
            ariaLabel={`Data source is ${dataSource}`}
            source={dataSource}
          />
          <EvidenceBadge
            detail={`${timeWindow.start} to ${timeWindow.end}`}
            kind="freshness"
            label="Window"
          />
          <EvidenceBadge
            detail={String(citationsCount)}
            kind="citation"
            label="Citations"
          />
          <StatusChip
            label="Live model"
            tone={generationMode === "live" ? "risk" : "caution"}
            value={liveModelLabel}
          />
        </div>
      </div>

      <div className={`rounded-md border p-3 ${dataSourceCaveat.className}`}>
        <p className="text-xs font-semibold uppercase tracking-normal">
          Data caveat
        </p>
        <p className="mt-2 text-sm leading-6">{dataSourceCaveat.copy}</p>
      </div>

      <dl className="space-y-3 text-sm">
        <RailRow label="Resolved window" value={`${timeWindow.start} to ${timeWindow.end}`} />
        <RailRow label="Window rule" value={timeWindow.explanation} />
        {freshnessNote ? <RailRow label="Freshness" value={freshnessNote} /> : null}
        {itemCount !== undefined ? (
          <RailRow label={itemCountLabel} value={String(itemCount)} />
        ) : null}
        <RailRow label="Citation count" value={String(citationsCount)} />
        <RailRow label="Generation mode" value={generationMode} />
        {modelMetadata ? (
          <>
            <RailRow label="Model provider" value={modelMetadata.provider} />
            <RailRow label="API calls" value={String(modelMetadata.api_call_count)} />
            <RailRow label="Prompt version" value={modelMetadata.prompt_version} />
            {modelMetadata.model ? <RailRow label="Model" value={modelMetadata.model} /> : null}
          </>
        ) : null}
        {context.map((item) => (
          <RailRow key={item.label} label={item.label} tone={item.tone} value={String(item.value)} />
        ))}
      </dl>
    </aside>
  );
}

function RailRow({
  label,
  tone,
  value
}: {
  label: string;
  tone?: StatusTone;
  value: string;
}) {
  return (
    <div className="border-t border-radar-line pt-3 first:border-t-0 first:pt-0">
      <dt className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words leading-6 text-radar-ink">
        {tone ? <StatusChip label={value} tone={tone} /> : value}
      </dd>
    </div>
  );
}

function getDataSourceCaveat(source: DataSource) {
  if (source === "supabase_radar_items") {
    return {
      className: "border-radar-success/30 bg-white text-radar-success",
      copy: "Supabase public radar view was used for read-only retrieval. No Supabase write path is implied."
    };
  }

  if (source === "local_understanding_output") {
    return {
      className: "border-radar-freshness/30 bg-white text-radar-freshness",
      copy: "Local understanding output was used. Coverage and freshness depend on generated local files."
    };
  }

  if (source === "mock_data") {
    return {
      className: "border-radar-caution/30 bg-white text-radar-caution",
      copy: "Synthetic mock data was used. Treat this as workflow evidence, not production-current intelligence."
    };
  }

  if (source === "empty") {
    return {
      className: "border-radar-line bg-white text-radar-muted",
      copy: "No radar evidence was retrieved. Any synthesis should remain explicitly limited."
    };
  }

  return {
    className: "border-radar-line bg-white text-radar-muted",
    copy: "The retrieval source is unknown, so confidence should stay low."
  };
}
