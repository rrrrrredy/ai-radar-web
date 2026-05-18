import { AdminStatusCard } from "@/components/admin-status-card";
import { AdminSection } from "@/components/admin-section";
import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip } from "@/components/status-chip";
import { readCleanedSources } from "@/lib/ingestion/select-sources";
import { mockRadarItems } from "@/lib/radar/mock-data";
import { countBy, isSourceHealthEligible } from "@/lib/supabase/persistence";

const sections = [
  {
    boundary: "review-only",
    href: "/admin/review",
    title: "Review queue",
    description: "Inspect radar review needs, missing public URLs, source-change previews, report candidates, and audit rows.",
    metric: "workflow foundation",
    tone: "caution" as const
  },
  {
    boundary: "review queue",
    href: "/admin/sources",
    title: "Sources",
    description: "Inspect cleaned public sources, review blockers, crawl eligibility, and dry-run import status.",
    metric: "cleaned registry",
    tone: "admin" as const
  },
  {
    boundary: "local/dry-run",
    href: "/admin/ingestion",
    title: "Ingestion",
    description: "Trace source selection, local artifacts, understanding output, and write-gated persistence commands.",
    metric: "manual only",
    tone: "caution" as const
  },
  {
    boundary: "formula gated",
    href: "/admin/scoring",
    title: "Scoring",
    description: "Audit score dimensions, thresholds, model-output limits, source weight, and review states.",
    metric: "6 dimensions",
    tone: "evidence" as const
  },
  {
    boundary: "booleans only",
    href: "/admin/settings",
    title: "Settings",
    description: "Check feature flags, secret boundaries, placeholders, and admin-safe environment status.",
    metric: "no secret values",
    tone: "risk" as const
  }
];

export default function AdminPage() {
  const cleanedSources = readCleanedSources();
  const statusCounts = countBy(cleanedSources, (source) => source.status);
  const healthEligibleCount = cleanedSources.filter(isSourceHealthEligible).length;
  const reviewCount =
    (statusCounts.needs_public_url ?? 0) +
    (statusCounts.deferred ?? 0) +
    (statusCounts.rejected ?? 0);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="Production-safe Analyst Console" tone="admin" />
          <StatusChip label="Writes gated" tone="risk" />
          <StatusChip label="No scheduled jobs" tone="caution" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">
          Admin console
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Operations entry point for source review, local ingestion, understanding
          scoring, read-only retrieval, and feature-flag boundaries. This console
          documents state and commands; it does not enable production writes,
          scheduled jobs, live model calls, source-health writes, or review
          action writes.
        </p>
      </section>

      <section
        aria-label="Operational overview"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
      >
        <AdminStatusCard
          detail="Review workflow foundation is available at /admin/review; approve/reject/publish actions remain disabled."
          label="Review"
          tone="caution"
          value={reviewCount}
        />
        <AdminStatusCard
          detail="Cleaned public registry rows available for source review and dry-run import planning."
          label="Sources"
          tone="admin"
          value={cleanedSources.length}
        />
        <AdminStatusCard
          detail="Rows eligible for supported public crawl methods and source-health dry-run selection."
          label="Ingestion"
          tone="freshness"
          value={healthEligibleCount}
        />
        <AdminStatusCard
          detail="Mock/local radar rows remain evidence fixtures; model output is not final authority."
          label="Understanding"
          tone="evidence"
          value={mockRadarItems.length}
        />
        <AdminStatusCard
          detail="Supabase retrieval is read-only; persistence scripts remain dry-run unless CLI and env gates both allow writes."
          label="Persistence"
          tone="risk"
          value="gated"
        />
        <AdminStatusCard
          detail="Feature flags and provider setup are shown as booleans/placeholders only."
          label="Settings"
          tone="caution"
          value="flags"
        />
      </section>

      <section
        aria-labelledby="system-boundaries-title"
        className="rounded-lg border border-radar-line bg-radar-panel p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold text-radar-ink"
              id="system-boundaries-title"
            >
              System boundaries
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Read-only status, dry-run scripts, and write-gated scripts are
              separate concepts. No admin surface here executes commands.
            </p>
          </div>
          <DataSourceChip
            detail="fallback chain"
            source="local_understanding_output"
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <BoundaryItem
            detail="Supabase persistence requires explicit CLI write mode and ENABLE_SUPABASE_WRITES=true; admin UI remains non-writing."
            label="Supabase writes"
            tone="risk"
          />
          <BoundaryItem
            detail="DeepSeek live mode requires explicit live mode and local credentials; admin pages do not call the provider."
            label="Live DeepSeek"
            tone="caution"
          />
          <BoundaryItem
            detail="No Vercel Cron, GitHub Actions schedule, or background job is enabled by this console."
            label="Scheduled jobs"
            tone="caution"
          />
          <BoundaryItem
            detail="Source-health status can be dry-run reviewed only; write history is not enabled here."
            label="Source-health writes"
            tone="risk"
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-radar-line bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
            Review pressure
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip
              label="Needs URL"
              tone="caution"
              value={statusCounts.needs_public_url ?? 0}
            />
            <StatusChip
              label="Deferred"
              tone="neutral"
              value={statusCounts.deferred ?? 0}
            />
            <StatusChip
              label="Rejected"
              tone="risk"
              value={statusCounts.rejected ?? 0}
            />
            <EvidenceBadge
              detail={String(reviewCount)}
              kind="uncertainty"
              label="Review total"
            />
          </div>
        </div>
        <div className="rounded-lg border border-radar-line bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
            Retrieval posture
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <DataSourceChip detail="when enabled" source="supabase_radar_items" />
            <DataSourceChip detail="fallback" source="local_understanding_output" />
            <DataSourceChip detail="last resort" source="mock_data" />
          </div>
        </div>
        <div className="rounded-lg border border-radar-line bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
            Operator safety
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip label="Commands are docs" tone="admin" />
            <StatusChip label="No API shape changes" tone="success" />
            <StatusChip label="No secrets shown" tone="risk" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {sections.map((section) => (
          <AdminSection key={section.href} {...section} />
        ))}
      </section>
    </div>
  );
}

function BoundaryItem({
  detail,
  label,
  tone
}: {
  detail: string;
  label: string;
  tone: "caution" | "risk";
}) {
  return (
    <div className="rounded-md border border-radar-line bg-white p-3">
      <StatusChip label={label} tone={tone} />
      <p className="mt-3 text-sm leading-6 text-radar-muted">{detail}</p>
    </div>
  );
}
