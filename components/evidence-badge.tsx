type EvidenceBadgeKind = "evidence" | "freshness" | "uncertainty" | "citation" | "needs_review";

const kindClasses: Record<EvidenceBadgeKind, string> = {
  evidence: "border-radar-evidence/30 bg-radar-evidence/10 text-radar-evidence",
  freshness: "border-radar-freshness/30 bg-radar-freshness/10 text-radar-freshness",
  uncertainty: "border-radar-caution/30 bg-radar-caution/10 text-radar-caution",
  citation: "border-radar-line bg-radar-panel text-radar-muted",
  needs_review: "border-radar-caution/40 bg-radar-caution/10 text-radar-caution"
};

export function EvidenceBadge({
  label,
  kind = "evidence",
  detail
}: {
  label: string;
  kind?: EvidenceBadgeKind;
  detail?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${kindClasses[kind]}`}
    >
      <span>{label}</span>
      {detail ? <span className="font-medium opacity-80">{detail}</span> : null}
    </span>
  );
}
