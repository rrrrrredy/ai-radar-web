export type StatusTone =
  | "neutral"
  | "evidence"
  | "freshness"
  | "caution"
  | "risk"
  | "success"
  | "admin";

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-radar-line bg-radar-panel text-radar-muted",
  evidence: "border-radar-evidence/30 bg-radar-evidence/10 text-radar-evidence",
  freshness: "border-radar-freshness/30 bg-radar-freshness/10 text-radar-freshness",
  caution: "border-radar-caution/30 bg-radar-caution/10 text-radar-caution",
  risk: "border-radar-risk/30 bg-radar-risk/10 text-radar-risk",
  success: "border-radar-success/30 bg-radar-success/10 text-radar-success",
  admin: "border-radar-admin/30 bg-radar-admin/10 text-radar-admin"
};

export function StatusChip({
  ariaLabel,
  label,
  tone = "neutral",
  value,
  title
}: {
  ariaLabel?: string;
  label: string;
  tone?: StatusTone;
  value?: string | number;
  title?: string;
}) {
  return (
    <span
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${toneClasses[tone]}`}
      title={title}
    >
      <span>{label}</span>
      {value !== undefined ? <span className="font-medium opacity-80">{value}</span> : null}
    </span>
  );
}
