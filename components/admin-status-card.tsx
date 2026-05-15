import { StatusChip, type StatusTone } from "@/components/status-chip";

export function AdminStatusCard({
  detail,
  label,
  tone = "neutral",
  value
}: {
  detail: string;
  label: string;
  tone?: StatusTone;
  value: string | number;
}) {
  return (
    <section
      aria-label={`${label}: ${value}`}
      className="rounded-lg border border-radar-line bg-white p-4 shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
          {label}
        </p>
        <StatusChip label={String(value)} tone={tone} />
      </div>
      <p className="mt-3 text-sm leading-6 text-radar-muted">{detail}</p>
    </section>
  );
}
