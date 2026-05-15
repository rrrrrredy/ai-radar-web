import Link from "next/link";

import { StatusChip, type StatusTone } from "@/components/status-chip";

export function AdminSection({
  boundary,
  href,
  title,
  description,
  metric,
  tone = "admin"
}: {
  boundary: string;
  href: string;
  title: string;
  description: string;
  metric: string;
  tone?: StatusTone;
}) {
  return (
    <Link
      className="block rounded-lg border border-radar-line bg-white p-4 shadow-soft transition hover:border-radar-evidence focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-evidence"
      href={href}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
          {metric}
        </p>
        <StatusChip label={boundary} tone={tone} />
      </div>
      <h2 className="mt-3 text-base font-semibold text-radar-ink">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-radar-muted">{description}</p>
    </Link>
  );
}
