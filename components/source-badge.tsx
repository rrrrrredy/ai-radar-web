import type { Source } from "@/lib/radar/types";

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span className="inline-flex items-center rounded-md border border-radar-line bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
      Tier {source.tier} · {source.type}
    </span>
  );
}
