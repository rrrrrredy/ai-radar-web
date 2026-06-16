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
  itemCountLabel = "已检索条目",
  timeWindow,
  title = "证据栏"
}: {
  citationsCount: number;
  context?: EvidenceRailContextItem[];
  dataSource: DataSource;
  freshnessNote?: string;
  generationMode: GenerationMode;
  itemCount?: number;
  itemCountLabel?: string;
  timeWindow: ResolvedTimeWindow;
  title?: string;
}) {
  const dataSourceCaveat = getDataSourceCaveat(dataSource);
  const liveModelLabel = generationMode === "live" ? "DeepSeek" : "证据草稿";

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
            ariaLabel={`数据来源为 ${dataSource}`}
            source={dataSource}
          />
          <EvidenceBadge
            detail={`${timeWindow.start} 至 ${timeWindow.end}`}
            kind="freshness"
            label="时间窗口"
          />
          <EvidenceBadge
            detail={String(citationsCount)}
            kind="citation"
            label="引用"
          />
          <StatusChip
            label="生成"
            tone={generationMode === "live" ? "evidence" : "caution"}
            value={liveModelLabel}
          />
        </div>
      </div>

      <div className={`rounded-md border p-3 ${dataSourceCaveat.className}`}>
        <p className="text-xs font-semibold uppercase tracking-normal">
          数据局限
        </p>
        <p className="mt-2 text-sm leading-6">{dataSourceCaveat.copy}</p>
      </div>

      <dl className="space-y-3 text-sm">
        <RailRow label="解析时间窗口" value={`${timeWindow.start} 至 ${timeWindow.end}`} />
        <RailRow label="时间窗口规则" value={timeWindow.explanation} />
        {freshnessNote ? <RailRow label="新鲜度" value={freshnessNote} /> : null}
        {itemCount !== undefined ? (
          <RailRow label={itemCountLabel} value={String(itemCount)} />
        ) : null}
        <RailRow label="引用数量" value={String(citationsCount)} />
        <RailRow label="生成方式" value={liveModelLabel} />
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
      copy: "使用公开安全证据库检索，只展示可公开引用、可复核的结构化字段。"
    };
  }

  if (source === "local_understanding_output") {
    return {
      className: "border-radar-freshness/30 bg-white text-radar-freshness",
      copy: "使用本地理解输出。覆盖范围和新鲜度取决于生成的本地文件。"
    };
  }

  if (source === "mock_data") {
    return {
      className: "border-radar-caution/30 bg-white text-radar-caution",
      copy: "当前只展示演示证据，不应视为生产情报。"
    };
  }

  if (source === "empty") {
    return {
      className: "border-radar-line bg-white text-radar-muted",
      copy: "未检索到雷达证据。任何综合都必须明确标注限制。"
    };
  }

  return {
    className: "border-radar-line bg-white text-radar-muted",
    copy: "检索来源未知，因此置信度应保持较低。"
  };
}
