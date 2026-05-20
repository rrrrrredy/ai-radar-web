import Link from "next/link";

import { AdminCommandBlock } from "@/components/admin-command-block";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin-data-table";
import { AdminStatusCard } from "@/components/admin-status-card";
import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { getAppConfig } from "@/lib/config";
import { loadRadarItems } from "@/lib/retrieval/load-radar-items";
import type { UnderstandingStatus } from "@/lib/understanding/types";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const supportedMethods = ["rss", "html", "api", "podcast_feed", "youtube_feed"];

const outputRows = [
  {
    path: "data/ingestion/latest/raw-items.json",
    stage: "Ingestion raw items",
    status: "ignored generated JSON"
  },
  {
    path: "data/ingestion/latest/ingestion-run.json",
    stage: "Ingestion run summary",
    status: "ignored generated JSON"
  },
  {
    path: "data/ingestion/runs/*.json",
    stage: "Historical ingestion runs",
    status: "ignored generated JSON"
  },
  {
    path: "data/understanding/latest/radar-items.json",
    stage: "Understanding radar items",
    status: "ignored generated JSON"
  },
  {
    path: "data/understanding/latest/understanding-run.json",
    stage: "Understanding run summary",
    status: "ignored generated JSON"
  },
  {
    path: "data/understanding/runs/*.json",
    stage: "Historical understanding runs",
    status: "ignored generated JSON"
  },
  {
    path: "data/scheduled/latest/scheduled-run.json",
    stage: "Scheduled dry-run summary",
    status: "ignored generated JSON"
  },
  {
    path: "data/scheduled/runs/*.json",
    stage: "Historical scheduled dry-runs",
    status: "ignored generated JSON"
  }
];

const latestLocalSummary = {
  id: "phase4-local-latest",
  startedAt: "2026-05-13T09:00:00.000Z",
  status: "local-ready",
  selectedSources: 10,
  rawItems: 0,
  duplicates: 0,
  errors: 0
};

const pipelineStages = [
  {
    detail: "Cleaned public registry rows are selected only when status, crawl method, public URL, and safety checks pass.",
    label: "Source registry",
    tone: "admin" as const
  },
  {
    detail: "Local fetchers collect public metadata/feed items and write ignored JSON artifacts.",
    label: "Ingestion",
    tone: "freshness" as const
  },
  {
    detail: "Mock mode is deterministic by default. Live DeepSeek requires explicit live mode and credentials.",
    label: "Understanding",
    tone: "caution" as const
  },
  {
    detail: "Supabase persistence scripts are dry-run first and require both CLI and env write gates.",
    label: "Supabase persistence",
    tone: "risk" as const
  },
  {
    detail: "Ask and Write can read Supabase public view when enabled, then local output, then mock data.",
    label: "Retrieval",
    tone: "evidence" as const
  }
];

const dryRunCommands = [
  {
    command: "npm run ingest:sources:dry-run",
    detail: "Plans source selection and ingestion work without writing generated JSON artifacts.",
    title: "Ingestion plan"
  },
  {
    command: "npm run understand:items:mock",
    detail: "Runs deterministic mock understanding over local raw items without live provider calls.",
    title: "Understanding mock"
  },
  {
    command: "npm run supabase:import:sources",
    detail: "Prints the cleaned source import plan. Default mode does not write to Supabase.",
    title: "Source import"
  },
  {
    command: "npm run supabase:persist:ingestion",
    detail: "Prints the ingestion persistence plan. Default mode does not write to Supabase.",
    title: "Ingestion persistence"
  },
  {
    command: "npm run supabase:persist:understanding",
    detail: "Prints the understanding persistence plan. Default mode does not write to Supabase.",
    title: "Understanding persistence"
  },
  {
    command: "npm run source-health:dry-run",
    detail: "Reviews source-health eligibility in dry-run mode only. This page does not run checks.",
    title: "Source health"
  },
  {
    command: "npm run scheduled:hourly:dry-run",
    detail: "Runs bounded public ingestion and mock understanding, then writes an ignored scheduled summary artifact.",
    title: "Scheduled dry-run"
  }
];

const writeGatedCommands = [
  {
    command: "npm run supabase:import:sources -- --write",
    detail: "Requires ENABLE_SUPABASE_WRITES=true, public Supabase config, and service-role credentials.",
    title: "Source import write"
  },
  {
    command: "npm run supabase:persist:ingestion -- --write",
    detail: "Requires the same write gate and persists local ingestion run/raw item records.",
    title: "Ingestion write"
  },
  {
    command: "npm run supabase:persist:understanding -- --write",
    detail: "Requires the same write gate and persists validated understanding output.",
    title: "Understanding write"
  },
  {
    command: "source-health write path: not enabled",
    detail: "No source-health write command is exposed for this phase. Keep source-health review dry-run only.",
    title: "Source-health writes"
  }
];

const operatingLoopCommands: Array<{
  command: string;
  detail: string;
  label: string;
  title: string;
  tone: StatusTone;
}> = [
  {
    command: "npm run ops:dry-run",
    detail: "Runs the full mock operating loop summary without Supabase writes, scheduled jobs, X/WeChat crawl, or live DeepSeek by default.",
    label: "dry-run",
    title: "Operating loop dry-run",
    tone: "success"
  },
  {
    command: "npm run ops:refresh:live -- --limit 10 --max-items-per-source 3",
    detail: "Runs bounded public ingestion plus live understanding only when DeepSeek is available; output remains local artifacts unless persist is requested.",
    label: "live opt-in",
    title: "Live refresh",
    tone: "caution"
  },
  {
    command: "$env:ENABLE_SUPABASE_WRITES=\"true\"\nnpm run ops:refresh:live:persist -- --limit 10 --max-items-per-source 3\nRemove-Item Env:ENABLE_SUPABASE_WRITES",
    detail: "Requires the temporary write gate, Supabase public config, service role credentials, and live DeepSeek readiness in the CLI process.",
    label: "write-gated",
    title: "Live refresh + persist",
    tone: "risk"
  },
  {
    command: "npm run ops:reports",
    detail: "Generates daily and weekly candidate previews from current radar evidence. Add -- --persist with the temporary write gate to save needs_review candidates.",
    label: "candidate generation",
    title: "Report candidates",
    tone: "evidence"
  }
];

export default async function AdminIngestionPage() {
  const config = getAppConfig();
  const activationState = await getLatestActivationState();

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="Manual/local pipeline" tone="admin" />
          <StatusChip label="ENABLE_SUPABASE_WRITES" tone={config.featureFlags.enableSupabaseWrites ? "risk" : "success"} value={String(config.featureFlags.enableSupabaseWrites)} />
          <StatusChip label="Scheduled dry-run only" tone="caution" />
          <StatusChip label="No live DeepSeek by default" tone="caution" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">
          Ingestion
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Operational view of the source registry to ingestion to understanding
          to persistence to retrieval chain. Command blocks below are
          documentation surfaces only; they are not executable UI controls.
        </p>
      </section>

      <section
        aria-label="Pipeline stages"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
      >
        {pipelineStages.map((stage) => (
          <AdminStatusCard
            detail={stage.detail}
            key={stage.label}
            label={stage.label}
            tone={stage.tone}
            value={stage.label === "Supabase persistence" ? "gated" : "visible"}
          />
        ))}
      </section>

      <section
        aria-labelledby="operating-loop-title"
        className="rounded-lg border border-radar-line bg-white p-4 shadow-soft"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold text-radar-ink"
              id="operating-loop-title"
            >
              Operating loop
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Current data state and safe CLI sequence for manual activation.
              Commands are documentation only; this page does not execute them.
            </p>
          </div>
          <DataSourceChip detail="latest known" source={activationState.dataSource} />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-md border border-radar-line bg-radar-panel p-3">
            <div className="flex flex-wrap gap-2">
              <EvidenceBadge
                detail={String(activationState.total)}
                kind="evidence"
                label="Items"
              />
              <EvidenceBadge
                detail={String(activationState.citations)}
                kind="citation"
                label="Citations"
              />
              <StatusChip
                label="Latest"
                tone={activationState.latestTimestamp ? "freshness" : "neutral"}
                value={activationState.latestTimestamp ?? "not available"}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusChip label="included" tone="evidence" value={activationState.counts.included} />
              <StatusChip label="needs_review" tone="caution" value={activationState.counts.needs_review} />
              <StatusChip label="excluded" tone="risk" value={activationState.counts.excluded} />
              <StatusChip label="failed" tone="risk" value={activationState.counts.failed} />
            </div>
            {activationState.warnings.length > 0 ? (
              <p className="mt-3 text-sm leading-6 text-radar-muted">
                Caveat: {activationState.warnings[0]}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <BoundaryItem
              detail="No Vercel Cron, GitHub Actions schedule, or background persistence job is enabled from this page."
              label="Scheduled jobs"
              tone="caution"
              value="disabled"
            />
            <BoundaryItem
              detail="Supabase writes require an explicit CLI write path plus ENABLE_SUPABASE_WRITES=true and service credentials."
              label="Writes"
              tone="risk"
              value="CLI gate"
            />
            <BoundaryItem
              detail="Live understanding is opt-in and falls back unless DEEPSEEK_API_KEY is available to the CLI process."
              label="Live DeepSeek"
              tone="caution"
              value="opt-in"
            />
            <BoundaryItem
              detail="X accounts and WeChat-style sources are review inputs only here; they are not automatically crawled."
              label="X / WeChat"
              tone="success"
              value="not auto-crawled"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {operatingLoopCommands.map((command) => (
            <AdminCommandBlock
              command={command.command}
              detail={command.detail}
              key={command.title}
              label={command.label}
              title={command.title}
              tone={command.tone}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
          <Link className="text-radar-admin hover:text-radar-evidence" href="/admin/review">
            Open admin review
          </Link>
          <Link className="text-radar-admin hover:text-radar-evidence" href="/reports">
            Open reports
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Review queue handoff
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Ingestion and understanding outputs can now feed review-only
              admin queues for radar items, source changes, report candidates,
              and audit visibility. No scheduled write job, live DeepSeek, source-health
              write, or Supabase write is started by the review route.
            </p>
          </div>
          <Link
            className="rounded-md border border-radar-admin/30 bg-white px-3 py-2 text-sm font-semibold text-radar-admin hover:border-radar-evidence hover:text-radar-evidence focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-evidence"
            href="/admin/review"
          >
            Open review queue
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusChip label="Review-only" tone="admin" />
          <StatusChip label="Writes gated" tone="risk" />
          <StatusChip label="No write jobs run" tone="caution" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="min-w-0 rounded-lg border border-radar-line bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">
                Latest local run shape
              </h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                Static admin summary of the local artifact contract, not a live
                job monitor.
              </p>
            </div>
            <StatusChip label={latestLocalSummary.status} tone="freshness" />
          </div>
          <dl className="mt-4 grid gap-3 text-sm">
            <RunRow label="Run ID" value={latestLocalSummary.id} />
            <RunRow label="Started" value={formatDate(latestLocalSummary.startedAt)} />
            <RunRow label="Selected sources" value={String(latestLocalSummary.selectedSources)} />
            <RunRow label="Raw items" value={String(latestLocalSummary.rawItems)} />
            <RunRow label="Duplicates" value={String(latestLocalSummary.duplicates)} />
            <RunRow label="Errors" value={String(latestLocalSummary.errors)} />
          </dl>
        </div>

        <div className="min-w-0 rounded-lg border border-radar-line bg-radar-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">
                Operational boundaries
              </h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                These states must stay visibly separate from successful
                read-only status.
              </p>
            </div>
            <DataSourceChip detail="read-only fallback" source="local_understanding_output" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <BoundaryItem
              detail="False means Supabase write scripts cannot obtain a write client. True would still require CLI write mode."
              label="ENABLE_SUPABASE_WRITES"
              tone={config.featureFlags.enableSupabaseWrites ? "risk" : "success"}
              value={String(config.featureFlags.enableSupabaseWrites)}
            />
            <BoundaryItem
              detail="GitHub Actions can run dry-run summaries only. Scheduled persistence and report jobs remain disabled."
              label="Scheduled jobs"
              tone="caution"
              value="dry-run only"
            />
            <BoundaryItem
              detail="Understanding mock mode is default. Live mode requires an explicit live request and local key."
              label="Live DeepSeek"
              tone="caution"
              value="opt-in only"
            />
            <BoundaryItem
              detail="Source-health history writes are not enabled; keep source-health review dry-run only."
              label="Source-health writes"
              tone="risk"
              value="not enabled"
            />
          </div>
        </div>
      </section>

      <section className="min-w-0 rounded-lg border border-radar-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Local output artifacts
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Generated ingestion and understanding JSON is intentionally local
              and ignored by git. Do not commit generated runs.
            </p>
          </div>
          <EvidenceBadge
            detail="gitignored"
            kind="freshness"
            label="Generated files"
          />
        </div>
        <div className="mt-4">
          <AdminDataTable
            ariaLabel="Generated local output paths"
            columns={outputColumns}
            minWidth="860px"
            rowKey={(row) => row.path}
            rows={outputRows}
          />
        </div>
      </section>

      <section
        aria-labelledby="dry-run-commands-title"
        className="min-w-0 rounded-lg border border-radar-line bg-radar-panel p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold text-radar-ink"
              id="dry-run-commands-title"
            >
              Dry-run and local commands
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              These commands are listed for operator reference. They are not
              buttons and are not run by this page.
            </p>
          </div>
          <StatusChip label="Documentation only" tone="admin" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {dryRunCommands.map((command) => (
            <AdminCommandBlock
              command={command.command}
              detail={command.detail}
              key={command.command}
              label="dry-run/local"
              title={command.title}
              tone="caution"
            />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="write-gated-commands-title"
        className="min-w-0 rounded-lg border border-radar-risk/30 bg-white p-4 shadow-soft"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold text-radar-ink"
              id="write-gated-commands-title"
            >
              Write-gated commands
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              These are high-risk CLI documentation paths. They require explicit
              operator intent and environment gates outside the browser.
            </p>
          </div>
          <StatusChip label="Not executed here" tone="risk" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {writeGatedCommands.map((command) => (
            <AdminCommandBlock
              command={command.command}
              detail={command.detail}
              key={command.command}
              label="write-gated"
              title={command.title}
              tone="risk"
            />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Supported public methods
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              X accounts, WeChat-style sources, books, courses, private links,
              missing URLs, and manual-only rows are not auto-crawled.
            </p>
          </div>
          <StatusChip label="Public metadata only" tone="freshness" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {supportedMethods.map((method) => (
            <StatusChip key={method} label={method} tone="freshness" />
          ))}
        </div>
      </section>
    </div>
  );
}

type OutputRow = (typeof outputRows)[number];

const outputColumns: AdminDataTableColumn<OutputRow>[] = [
  {
    header: "Stage",
    render: (row) => <p className="font-semibold text-radar-ink">{row.stage}</p>
  },
  {
    header: "Path",
    render: (row) => (
      <p className="break-words font-mono text-xs leading-5 text-radar-code">
        {row.path}
      </p>
    )
  },
  {
    header: "Git status",
    render: (row) => <StatusChip label={row.status} tone="success" />
  }
];

function RunRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 border-t border-radar-line pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[160px_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
        {label}
      </dt>
      <dd className="break-words text-radar-ink">{value}</dd>
    </div>
  );
}

async function getLatestActivationState() {
  const loaded = await loadRadarItems();
  const counts: Record<UnderstandingStatus, number> = {
    excluded: 0,
    failed: 0,
    included: 0,
    needs_review: 0
  };

  for (const item of loaded.items) {
    counts[item.status] += 1;
  }

  return {
    citations: loaded.items.filter(
      (item) => item.url && (item.status === "included" || item.status === "needs_review")
    ).length,
    counts,
    dataSource: loaded.dataSource,
    latestTimestamp: loaded.freshness.latestTimestamp
      ? formatDate(loaded.freshness.latestTimestamp)
      : undefined,
    total: loaded.items.length,
    warnings: loaded.warnings
  };
}

function BoundaryItem({
  detail,
  label,
  tone,
  value
}: {
  detail: string;
  label: string;
  tone: StatusTone;
  value: string;
}) {
  return (
    <div className="rounded-md border border-radar-line bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-radar-ink">{label}</p>
        <StatusChip label={value} tone={tone} />
      </div>
      <p className="mt-2 text-sm leading-6 text-radar-muted">{detail}</p>
    </div>
  );
}
