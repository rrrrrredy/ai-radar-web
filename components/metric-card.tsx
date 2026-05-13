export function MetricCard({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <p className="text-sm font-medium text-radar-muted">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-radar-ink">{value}</p>
      <p className="mt-2 text-sm leading-6 text-radar-muted">{detail}</p>
    </div>
  );
}
