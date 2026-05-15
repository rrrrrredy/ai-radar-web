import { StatusChip, type StatusTone } from "@/components/status-chip";

const toneBorders: Record<StatusTone, string> = {
  admin: "border-radar-admin/30",
  caution: "border-radar-caution/40",
  evidence: "border-radar-evidence/30",
  freshness: "border-radar-freshness/30",
  neutral: "border-radar-line",
  risk: "border-radar-risk/40",
  success: "border-radar-success/30"
};

export function AdminCommandBlock({
  command,
  detail,
  label,
  title,
  tone = "neutral"
}: {
  command: string;
  detail: string;
  label: string;
  title: string;
  tone?: StatusTone;
}) {
  return (
    <section
      aria-label={`${title}: ${label}`}
      className={`rounded-lg border bg-white p-4 ${toneBorders[tone]}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-radar-ink">{title}</h3>
        <StatusChip label={label} tone={tone} />
      </div>
      <pre className="mt-3 overflow-x-auto rounded-md border border-radar-line bg-radar-panel px-3 py-2">
        <code className="whitespace-pre text-xs leading-6 text-radar-code">
          {command}
        </code>
      </pre>
      <p className="mt-3 text-sm leading-6 text-radar-muted">{detail}</p>
    </section>
  );
}
