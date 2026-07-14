import Link from "next/link";

import { AdminCommandBlock } from "@/components/admin-command-block";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin-data-table";
import { AdminStatusCard } from "@/components/admin-status-card";
import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { SAFE_CRAWL_METHODS } from "@/lib/ingestion/config";
import { readCleanedSources } from "@/lib/ingestion/select-sources";
import type { CleanedSource } from "@/lib/ingestion/types";
import { isSourceHealthEligible } from "@/lib/ingestion/source-health";
import { countBy } from "@/lib/supabase/persistence";

export default function AdminSourcesPage() {
  const cleanedSources = readCleanedSources();
  const healthEligibleCount = cleanedSources.filter(isSourceHealthEligible).length;
  const statusCounts = countBy(cleanedSources, (source) => source.status);
  const crawlCounts = countBy(cleanedSources, (source) => source.crawl_method);
  const tierCounts = countBy(cleanedSources, (source) => source.tier);
  const safeMethodRows = methodRows(crawlCounts);
  const reviewRows = cleanedSources
    .toSorted(compareReviewPriority)
    .slice(0, 18);
  const xOrManualCount =
    (crawlCounts.x_api_future ?? 0) +
    (crawlCounts.manual ?? 0) +
    (crawlCounts.no_crawl ?? 0);
  const wechatLikeCount = cleanedSources.filter(isWechatLike).length;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="Read-only review surface" tone="admin" />
          <StatusChip label="Dry-run import" tone="caution" />
          <StatusChip label="No source-health history" tone="risk" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">
          Source registry
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Cleaned public source registry for analyst review. This page shows
          status, crawl eligibility, tier distribution, and import boundaries
          without running source-health checks or inventing missing public URLs.
        </p>
      </section>

      <section
        aria-label="Source status counts"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
      >
        <AdminStatusCard
          detail="Rows in the cleaned public source registry."
          label="Total"
          tone="admin"
          value={cleanedSources.length}
        />
        <AdminStatusCard
          detail="Active rows that can proceed only when crawl and URL gates also pass."
          label="Active"
          tone="success"
          value={statusCounts.active ?? 0}
        />
        <AdminStatusCard
          detail="Trial rows retained for cautious review and eligibility checks."
          label="Trial"
          tone="freshness"
          value={statusCounts.trial ?? 0}
        />
        <AdminStatusCard
          detail="Requires a reviewed public URL before ingestion eligibility."
          label="Needs URL"
          tone="caution"
          value={statusCounts.needs_public_url ?? 0}
        />
        <AdminStatusCard
          detail="Retained but not selected for current ingestion."
          label="Deferred"
          tone="neutral"
          value={statusCounts.deferred ?? 0}
        />
        <AdminStatusCard
          detail="Rejected rows remain excluded from automated workflows."
          label="Rejected"
          tone="risk"
          value={statusCounts.rejected ?? 0}
        />
      </section>

      <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Review workflow handoff
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Missing public URLs and source approve/trial/reject decisions now
              have a review queue surface. The workflow is review-only here;
              source mutations remain future role-gated server actions.
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
          <StatusChip label="Approve/reject disabled" tone="risk" />
          <StatusChip label="No source-health history" tone="risk" />
        </div>
      </section>

      <section
        aria-labelledby="source-operations-title"
        className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"
      >
        <div className="min-w-0 rounded-lg border border-radar-line bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                className="text-lg font-semibold text-radar-ink"
                id="source-operations-title"
              >
                Crawl eligibility
              </h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                Eligibility requires active/trial status, a reviewed public URL,
                and one of the supported crawl methods. X, manual, unknown, and
                no-crawl rows stay review-only.
              </p>
            </div>
            <StatusChip
              label="Eligible"
              tone="success"
              value={healthEligibleCount}
            />
          </div>
          <div className="mt-4">
            <AdminDataTable
              ariaLabel="Crawl method distribution"
              columns={crawlMethodColumns}
              minWidth="680px"
              rowKey={(row) => row.method}
              rows={safeMethodRows}
            />
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-lg font-semibold text-radar-ink">
            Source limitations
          </h2>
          <div className="mt-4 grid gap-3">
            <LimitItem
              detail="X account rows are retained for future API/manual workflows. ENABLE_X_API does not enable crawling here."
              label="X/manual queue"
              tone="caution"
              value={xOrManualCount}
            />
            <LimitItem
              detail="WeChat auth remains a setup placeholder. No auto-crawl path is implemented."
              label="WeChat placeholder"
              tone="caution"
              value={wechatLikeCount}
            />
            <LimitItem
              detail="Rows missing public URLs require analyst completion from public evidence. The system must not invent URLs."
              label="Missing public URL"
              tone="risk"
              value={statusCounts.needs_public_url ?? 0}
            />
          </div>
        </div>
      </section>

      <section className="min-w-0 rounded-lg border border-radar-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Registry review queue
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Prioritized rows show public URL status, crawl method, tier, source
              weight, and risk flags. This is a review table only.
            </p>
          </div>
          <StatusChip label="No mutation controls" tone="risk" />
        </div>
        <div className="mt-4">
          <AdminDataTable
            ariaLabel="Cleaned source registry review queue"
            columns={reviewColumns}
            minWidth="1120px"
            rowKey={(source) => source.id}
            rows={reviewRows}
          />
        </div>
      </section>

      <section className="min-w-0 rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Source tier distribution
            </h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              Tiers and source weights inform scoring, but they do not override
              relevance, credibility, or review thresholds.
            </p>
          </div>
          <EvidenceBadge
            detail={`${Object.keys(tierCounts).length} tiers`}
            kind="evidence"
            label="Tier spread"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(tierCounts)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([tier, count]) => (
              <StatusChip
                key={tier}
                label={tier}
                tone={tier === "unreviewed" ? "caution" : "evidence"}
                value={count}
              />
            ))}
        </div>
      </section>

      <section
        aria-labelledby="supabase-source-import-title"
        className="min-w-0 rounded-lg border border-radar-line bg-radar-panel p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold text-radar-ink"
              id="supabase-source-import-title"
            >
              Supabase import boundary
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              The import script upserts cleaned registry rows by stable slug. Dry
              run and mutation-gated commands are documentation surfaces, not UI
              actions.
            </p>
          </div>
          <DataSourceChip detail="public read view only" source="supabase_radar_items" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <AdminCommandBlock
            command="npm run supabase:import:sources"
            detail="Dry-run plan for cleaned source rows. No Supabase mutations are performed in default mode."
            label="dry-run"
            title="Import sources"
            tone="caution"
          />
          <AdminCommandBlock
            command="npm run supabase:import:sources -- --write"
            detail="Mutation-gated CLI path. Requires ENABLE_SUPABASE_WRITES=true and service-role credentials outside the browser."
            label="mutation-gated"
            title="Import sources"
            tone="risk"
          />
          <AdminCommandBlock
            command="npm run source-health:dry-run"
            detail="Dry-run source-health review only. This page does not run checks and source-health history persistence is not enabled."
            label="dry-run only"
            title="Source health"
            tone="caution"
          />
        </div>
      </section>
    </div>
  );
}

type MethodRow = {
  count: number;
  handling: string;
  method: string;
  tone: StatusTone;
};

const crawlMethodColumns: AdminDataTableColumn<MethodRow>[] = [
  {
    header: "Method",
    render: (row) => (
      <StatusChip label={row.method} tone={row.tone} value={row.count} />
    )
  },
  {
    header: "Handling",
    render: (row) => (
      <p className="max-w-xl text-sm leading-6 text-radar-muted">
        {row.handling}
      </p>
    )
  }
];

const reviewColumns: AdminDataTableColumn<CleanedSource>[] = [
  {
    header: "Source",
    render: (source) => (
      <div>
        <p className="font-semibold text-radar-ink">{source.name}</p>
        <p className="mt-1 text-xs text-radar-muted">{source.type}</p>
      </div>
    )
  },
  {
    header: "Status",
    render: (source) => (
      <StatusChip
        label={source.status}
        tone={sourceStatusTone(source.status)}
      />
    )
  },
  {
    header: "Tier",
    render: (source) => (
      <EvidenceBadge
        detail={source.weight.toFixed(2)}
        kind={source.tier === "unreviewed" ? "needs_review" : "evidence"}
        label={source.tier}
      />
    )
  },
  {
    header: "Crawl",
    render: (source) => (
      <StatusChip
        label={source.crawl_method}
        tone={isSafeCrawlMethod(source.crawl_method) ? "freshness" : "caution"}
      />
    )
  },
  {
    header: "Public URL",
    render: (source) =>
      source.url ? (
        <p className="max-w-[220px] break-words font-mono text-xs leading-5 text-radar-code">
          {hostLabel(source.url)}
        </p>
      ) : (
        <div>
          <StatusChip label="missing" tone="caution" />
          <p className="mt-1 text-xs leading-5 text-radar-muted">
            Reviewed public URL required.
          </p>
        </div>
      )
  },
  {
    header: "Risk flags",
    render: (source) => (
      <div className="flex max-w-[300px] flex-wrap gap-1.5">
        {source.risk_flags.length > 0 ? (
          source.risk_flags.slice(0, 3).map((flag) => (
            <StatusChip
              key={flag}
              label={flag}
              tone={flag === "needs_public_url" ? "caution" : "neutral"}
            />
          ))
        ) : (
          <StatusChip label="none recorded" tone="success" />
        )}
      </div>
    )
  },
  {
    header: "Notes",
    render: (source) => (
      <p className="max-w-sm text-sm leading-6 text-radar-muted">
        {source.notes || "No note recorded."}
      </p>
    )
  }
];

function methodRows(crawlCounts: Record<string, number>): MethodRow[] {
  return Object.entries(crawlCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([method, count]) => {
      if (isSafeCrawlMethod(method)) {
        return {
          count,
          handling: "Eligible only after active/trial status and public URL checks pass.",
          method,
          tone: "freshness"
        };
      }

      if (method === "x_api_future") {
        return {
          count,
          handling: "Future X API or manual review path. Not auto-crawled in this phase.",
          method,
          tone: "caution"
        };
      }

      return {
        count,
        handling: "Review-only or unsupported for current automated ingestion.",
        method,
        tone: "neutral"
      };
    });
}

function isSafeCrawlMethod(method: string) {
  return SAFE_CRAWL_METHODS.includes(method as (typeof SAFE_CRAWL_METHODS)[number]);
}

function compareReviewPriority(left: CleanedSource, right: CleanedSource) {
  const leftPriority = statusPriority(left.status);
  const rightPriority = statusPriority(right.status);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return right.weight - left.weight || left.name.localeCompare(right.name);
}

function statusPriority(status: CleanedSource["status"]) {
  const priorities: Record<CleanedSource["status"], number> = {
    needs_public_url: 0,
    deferred: 1,
    rejected: 2,
    trial: 3,
    active: 4
  };

  return priorities[status];
}

function sourceStatusTone(status: CleanedSource["status"]): StatusTone {
  if (status === "active") {
    return "success";
  }

  if (status === "trial") {
    return "freshness";
  }

  if (status === "needs_public_url") {
    return "caution";
  }

  if (status === "rejected") {
    return "risk";
  }

  return "neutral";
}

function hostLabel(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function isWechatLike(source: CleanedSource) {
  const searchable = [
    source.name,
    source.name_en,
    source.type,
    source.category,
    source.description,
    source.notes,
    source.tags.join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes("wechat") || searchable.includes("微信");
}

function LimitItem({
  detail,
  label,
  tone,
  value
}: {
  detail: string;
  label: string;
  tone: StatusTone;
  value: number;
}) {
  return (
    <div className="rounded-md border border-radar-line bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-radar-ink">{label}</p>
        <StatusChip label={String(value)} tone={tone} />
      </div>
      <p className="mt-2 text-sm leading-6 text-radar-muted">{detail}</p>
    </div>
  );
}
