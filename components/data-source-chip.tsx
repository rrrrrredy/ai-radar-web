export type DataSource =
  | "supabase_radar_items"
  | "local_understanding_output"
  | "mock_data"
  | "empty"
  | "unknown";

const sourceLabels: Record<DataSource, string> = {
  supabase_radar_items: "Supabase",
  local_understanding_output: "Local",
  mock_data: "Mock",
  empty: "Empty",
  unknown: "Unknown"
};

const sourceClasses: Record<DataSource, string> = {
  supabase_radar_items: "border-radar-success/30 bg-radar-success/10 text-radar-success",
  local_understanding_output: "border-radar-freshness/30 bg-radar-freshness/10 text-radar-freshness",
  mock_data: "border-radar-caution/30 bg-radar-caution/10 text-radar-caution",
  empty: "border-radar-line bg-radar-panel text-radar-muted",
  unknown: "border-radar-line bg-radar-panel text-radar-muted"
};

export function DataSourceChip({
  ariaLabel,
  source,
  detail
}: {
  ariaLabel?: string;
  source: DataSource;
  detail?: string;
}) {
  return (
    <span
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${sourceClasses[source]}`}
    >
      <span>Data: {sourceLabels[source]}</span>
      {detail ? <span className="font-medium opacity-80">{detail}</span> : null}
    </span>
  );
}
