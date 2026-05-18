import { AdminCommandBlock } from "@/components/admin-command-block";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin-data-table";
import { AdminStatusCard } from "@/components/admin-status-card";
import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import {
  getReviewDashboardData,
  type NeedsReviewRadarItemRow,
  type ReportCandidateRow,
  type ReviewTaskPriority,
  type ReviewTaskRow,
  type ReviewTaskStatus,
  type SourceChangeRequestRow,
  type SourceMissingPublicUrlRow
} from "@/lib/admin/review";
import type { AdminAuditEventRow, AdminReviewReadResult, AdminReviewReadSource } from "@/lib/admin/audit";
import type { RetrievalDataSource } from "@/lib/retrieval/types";
import { formatDate, formatScore } from "@/lib/utils";

export default async function AdminReviewPage() {
  const data = await getReviewDashboardData();
  const openTaskCount = data.reviewTasks.rows.filter((row) => row.status === "open" || row.status === "in_review").length;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="Review-only foundation" tone="admin" />
          <StatusChip label="Write actions gated" tone="risk" />
          <StatusChip label="No scheduled jobs" tone="caution" />
          <StatusChip label="No live DeepSeek" tone="caution" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">
          Review queue
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Operational review surface for radar items, missing public source
          URLs, source change requests, report candidates, and audit events. In
          this phase all actions are read-only previews; approve, trial, reject,
          resolve, publish, and audit writes remain gated for a later controlled
          server-side workflow.
        </p>
      </section>

      <section
        aria-label="Review workflow overview"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
      >
        <AdminStatusCard
          detail="Derived task queue, or persisted rows after the review migration is manually applied."
          label="Tasks"
          tone={openTaskCount > 0 ? "caution" : "success"}
          value={openTaskCount}
        />
        <AdminStatusCard
          detail="Radar rows from Supabase/local/mock retrieval that still need human review."
          label="Radar review"
          tone={data.radarItemsNeedingReview.rows.length > 0 ? "caution" : "success"}
          value={data.radarItemsNeedingReview.rows.length}
        />
        <AdminStatusCard
          detail="Cleaned registry rows blocked because a public URL is missing or still flagged."
          label="Missing URLs"
          tone={data.missingPublicUrlSources.rows.length > 0 ? "caution" : "success"}
          value={data.missingPublicUrlSources.rows.length}
        />
        <AdminStatusCard
          detail="Source add, update URL, trial, approve, reject, pause, and resume workflow shape."
          label="Source changes"
          tone="admin"
          value={data.sourceChangeRequests.rows.length}
        />
        <AdminStatusCard
          detail="Candidate daily, weekly, topic, or observation report seeds awaiting future review actions."
          label="Reports"
          tone="evidence"
          value={data.reportCandidates.rows.length}
        />
        <AdminStatusCard
          detail="Read-only audit surface; persistent writes are not enabled by this UI."
          label="Audit"
          tone="admin"
          value={data.auditEvents.rows.length}
        />
      </section>

      <section
        aria-labelledby="review-boundaries-title"
        className="rounded-lg border border-radar-line bg-radar-panel p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold text-radar-ink"
              id="review-boundaries-title"
            >
              Review workflow boundaries
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              The page can read local previews and authenticated Supabase rows
              when policies are ready. It does not apply migrations, does not
              run jobs, does not call DeepSeek, and does not execute writes.
            </p>
          </div>
          <DataSourceChip detail="or local preview" source="supabase_radar_items" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <AdminCommandBlock
            command="supabase/migrations/202605140005_admin_review_workflows.sql"
            detail="Reviewable migration only. Apply manually in Supabase after Phase 9.5 auth/admin RLS; validation does not apply it."
            label="manual review"
            title="Review schema"
            tone="admin"
          />
          <AdminCommandBlock
            command="approve / trial / reject / publish actions: disabled in browser"
            detail="Future workflow writes must be server-side, role-gated, audited, and explicitly enabled in a controlled write phase."
            label="write-gated"
            title="Workflow actions"
            tone="risk"
          />
          <AdminCommandBlock
            command="scheduled jobs and live DeepSeek: not run by this route"
            detail="This page is an inspection surface. It does not start ingestion, source-health checks, scheduled jobs, or live model calls."
            label="read-only"
            title="Runtime side effects"
            tone="caution"
          />
        </div>
      </section>

      {data.warnings.length > 0 ? (
        <section className="rounded-lg border border-radar-caution/40 bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">
                Persistence notes
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
                These notes explain why local preview rows may appear before the
                review migration is applied or populated.
              </p>
            </div>
            <StatusChip label="No writes attempted" tone="success" />
          </div>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-radar-muted">
            {data.warnings.map((warning) => (
              <li className="rounded-md border border-radar-line bg-radar-panel px-3 py-2" key={warning}>
                {warning}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ReviewTable
        ariaLabel="Review task queue"
        columns={reviewTaskColumns}
        description="Generic task queue for reviewable targets. Persisted rows take precedence after the migration is applied; otherwise the table shows derived local previews."
        emptyLabel="No review tasks"
        minWidth="1040px"
        result={data.reviewTasks}
        rowKey={(row) => row.id}
        title="Review tasks"
      />

      <ReviewTable
        ariaLabel="Radar items needing review"
        columns={radarReviewColumns}
        description="Radar rows with needs_review status, low confidence, or weak credibility. Public Ask and Write access is unchanged."
        emptyLabel="No radar rows need review from the current fallback source"
        minWidth="1040px"
        result={data.radarItemsNeedingReview}
        rowKey={(row) => row.id}
        title="Radar items needing review"
      />

      <ReviewTable
        ariaLabel="Sources missing public URLs"
        columns={missingUrlColumns}
        description="Cleaned source registry rows that require a reviewed public URL before ingestion or source-health eligibility."
        emptyLabel="No missing public URL rows"
        minWidth="1080px"
        result={data.missingPublicUrlSources}
        rowKey={(row) => row.id}
        title="Missing public URL source review"
      />

      <ReviewTable
        ariaLabel="Source change requests"
        columns={sourceChangeColumns}
        description="Foundation for source add, URL update, trial, approve, reject, pause, and resume review. Write actions are intentionally disabled."
        emptyLabel="No source change request rows"
        minWidth="1040px"
        result={data.sourceChangeRequests}
        rowKey={(row) => row.id}
        title="Source approve / trial / reject workflow"
      />

      <ReviewTable
        ariaLabel="Report candidates"
        columns={reportCandidateColumns}
        description="Candidate report seeds for daily, weekly, topic, or observation reports. Publish remains a future controlled write action."
        emptyLabel="No report candidates"
        minWidth="1080px"
        result={data.reportCandidates}
        rowKey={(row) => row.id}
        title="Report candidate review"
      />

      <ReviewTable
        ariaLabel="Recent admin audit events"
        columns={auditEventColumns}
        description="Recent admin audit event rows when the migration is applied, with preview rows before persistent audit writes exist."
        emptyLabel="No audit events"
        minWidth="980px"
        result={data.auditEvents}
        rowKey={(row) => row.id}
        title="Recent audit events"
      />
    </div>
  );
}

function ReviewTable<T>({
  ariaLabel,
  columns,
  description,
  emptyLabel,
  minWidth,
  result,
  rowKey,
  title
}: {
  ariaLabel: string;
  columns: AdminDataTableColumn<T>[];
  description: string;
  emptyLabel: string;
  minWidth: string;
  result: AdminReviewReadResult<T>;
  rowKey: (row: T) => string;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-radar-line bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-radar-ink">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
            {description}
          </p>
        </div>
        <StatusChip
          label={readSourceLabel(result.source)}
          tone={readSourceTone(result.source)}
          value={result.rows.length}
        />
      </div>
      <div className="mt-4">
        {result.rows.length > 0 ? (
          <AdminDataTable
            ariaLabel={ariaLabel}
            columns={columns}
            minWidth={minWidth}
            rowKey={rowKey}
            rows={result.rows}
          />
        ) : (
          <div className="rounded-md border border-radar-line bg-radar-panel p-4">
            <StatusChip label={emptyLabel} tone="neutral" />
          </div>
        )}
      </div>
    </section>
  );
}

const reviewTaskColumns: AdminDataTableColumn<ReviewTaskRow>[] = [
  {
    header: "Task",
    render: (row) => (
      <div>
        <p className="font-semibold text-radar-ink">{row.title}</p>
        <p className="mt-1 max-w-xl text-sm leading-6 text-radar-muted">
          {row.description}
        </p>
      </div>
    )
  },
  {
    header: "Target",
    render: (row) => (
      <div className="flex max-w-[220px] flex-wrap gap-1.5">
        <StatusChip label={row.targetType} tone="admin" />
        {row.targetLocalId ? (
          <EvidenceBadge detail={row.targetLocalId} kind="citation" label="local" />
        ) : null}
      </div>
    )
  },
  {
    header: "Status",
    render: (row) => <StatusChip label={row.status} tone={reviewStatusTone(row.status)} />
  },
  {
    header: "Priority",
    render: (row) => <StatusChip label={row.priority} tone={priorityTone(row.priority)} />
  },
  {
    header: "Reason",
    render: (row) => (
      <p className="max-w-xs text-sm leading-6 text-radar-muted">
        {row.reason ?? "No reason recorded."}
      </p>
    )
  },
  {
    header: "Created",
    render: (row) => (
      <p className="font-mono text-xs leading-5 text-radar-code">
        {formatOptionalDate(row.createdAt)}
      </p>
    )
  }
];

const radarReviewColumns: AdminDataTableColumn<NeedsReviewRadarItemRow>[] = [
  {
    header: "Item",
    render: (row) => (
      <div>
        <p className="font-semibold text-radar-ink">{row.title}</p>
        <p className="mt-1 text-xs text-radar-muted">{row.sourceName}</p>
      </div>
    )
  },
  {
    header: "Retrieval",
    render: (row) => <DataSourceChip detail="read-only" source={dataSourceForRetrieval(row.retrievalSource)} />
  },
  {
    header: "Status",
    render: (row) => (
      <StatusChip
        label={row.status}
        tone={row.status === "needs_review" ? "caution" : "neutral"}
      />
    )
  },
  {
    header: "Scores",
    render: (row) => (
      <div className="flex flex-wrap gap-1.5">
        <EvidenceBadge detail={formatScore(row.overallScore)} kind="evidence" label="overall" />
        <EvidenceBadge detail={formatScore(row.credibilityScore)} kind="needs_review" label="credibility" />
        <EvidenceBadge detail={formatScore(row.confidence)} kind="uncertainty" label="confidence" />
      </div>
    )
  },
  {
    header: "Review reason",
    render: (row) => (
      <p className="max-w-sm text-sm leading-6 text-radar-muted">{row.reason}</p>
    )
  },
  {
    header: "Processed",
    render: (row) => (
      <p className="font-mono text-xs leading-5 text-radar-code">
        {formatOptionalDate(row.processedAt)}
      </p>
    )
  }
];

const missingUrlColumns: AdminDataTableColumn<SourceMissingPublicUrlRow>[] = [
  {
    header: "Source",
    render: (row) => (
      <div>
        <p className="font-semibold text-radar-ink">{row.name}</p>
        <p className="mt-1 font-mono text-xs text-radar-code">{row.id}</p>
      </div>
    )
  },
  {
    header: "Status",
    render: (row) => (
      <StatusChip
        label={row.status}
        tone={row.status === "needs_public_url" ? "caution" : "neutral"}
      />
    )
  },
  {
    header: "Crawl / tier",
    render: (row) => (
      <div className="flex flex-wrap gap-1.5">
        <StatusChip label={row.crawlMethod} tone="caution" />
        <EvidenceBadge detail={formatScore(row.weight)} kind="citation" label={String(row.tier)} />
      </div>
    )
  },
  {
    header: "Risk flags",
    render: (row) => (
      <div className="flex max-w-[300px] flex-wrap gap-1.5">
        {row.riskFlags.length > 0 ? (
          row.riskFlags.slice(0, 4).map((flag) => (
            <StatusChip
              key={flag}
              label={flag}
              tone={flag === "needs_public_url" ? "caution" : "neutral"}
            />
          ))
        ) : (
          <StatusChip label="none recorded" tone="neutral" />
        )}
      </div>
    )
  },
  {
    header: "Review note",
    render: (row) => (
      <p className="max-w-sm text-sm leading-6 text-radar-muted">{row.reason}</p>
    )
  }
];

const sourceChangeColumns: AdminDataTableColumn<SourceChangeRequestRow>[] = [
  {
    header: "Request",
    render: (row) => (
      <div className="flex flex-wrap gap-1.5">
        <StatusChip label={row.requestType} tone="admin" />
        <StatusChip label={row.status} tone={sourceChangeStatusTone(row.status)} />
      </div>
    )
  },
  {
    header: "Source",
    render: (row) => (
      <div>
        <p className="font-semibold text-radar-ink">
          {row.sourceName ?? row.sourceSlug ?? "Unlinked source"}
        </p>
        {row.sourceSlug ? (
          <p className="mt-1 font-mono text-xs text-radar-code">{row.sourceSlug}</p>
        ) : null}
      </div>
    )
  },
  {
    header: "Proposal",
    render: (row) => (
      <div className="flex max-w-[320px] flex-wrap gap-1.5">
        {row.proposedStatus ? (
          <StatusChip label={`status ${row.proposedStatus}`} tone="caution" />
        ) : null}
        {row.proposedTier ? (
          <EvidenceBadge detail={row.proposedTier} kind="citation" label="tier" />
        ) : null}
        {row.proposedUrl ? (
          <p className="break-words font-mono text-xs leading-5 text-radar-code">
            {row.proposedUrl}
          </p>
        ) : null}
      </div>
    )
  },
  {
    header: "Rationale",
    render: (row) => (
      <p className="max-w-sm text-sm leading-6 text-radar-muted">{row.rationale}</p>
    )
  },
  {
    header: "Write gate",
    render: () => <StatusChip label="action disabled" tone="risk" />
  }
];

const reportCandidateColumns: AdminDataTableColumn<ReportCandidateRow>[] = [
  {
    header: "Candidate",
    render: (row) => (
      <div>
        <p className="font-semibold text-radar-ink">{row.title}</p>
        <p className="mt-1 max-w-md text-sm leading-6 text-radar-muted">
          {row.summary}
        </p>
      </div>
    )
  },
  {
    header: "Type / status",
    render: (row) => (
      <div className="flex flex-wrap gap-1.5">
        <StatusChip label={row.reportType} tone="evidence" />
        <StatusChip label={row.status} tone={reportStatusTone(row.status)} />
      </div>
    )
  },
  {
    header: "Window",
    render: (row) => (
      <p className="max-w-[220px] font-mono text-xs leading-5 text-radar-code">
        {formatTimeWindow(row)}
      </p>
    )
  },
  {
    header: "Evidence",
    render: (row) => (
      <div className="flex flex-wrap gap-1.5">
        <EvidenceBadge detail={String(row.sourceItemCount)} kind="citation" label="items" />
        {row.confidence !== undefined ? (
          <EvidenceBadge detail={formatScore(row.confidence)} kind="uncertainty" label="confidence" />
        ) : (
          <EvidenceBadge detail="unset" kind="uncertainty" label="confidence" />
        )}
      </div>
    )
  },
  {
    header: "Write gate",
    render: () => <StatusChip label="publish disabled" tone="risk" />
  }
];

const auditEventColumns: AdminDataTableColumn<AdminAuditEventRow>[] = [
  {
    header: "Action",
    render: (row) => <StatusChip label={row.action} tone="admin" />
  },
  {
    header: "Target",
    render: (row) => (
      <div className="flex max-w-[280px] flex-wrap gap-1.5">
        <StatusChip label={row.targetType} tone="neutral" />
        {row.targetLocalId ? (
          <EvidenceBadge detail={row.targetLocalId} kind="citation" label="local" />
        ) : null}
      </div>
    )
  },
  {
    header: "Summary",
    render: (row) => (
      <p className="max-w-xl text-sm leading-6 text-radar-muted">{row.summary}</p>
    )
  },
  {
    header: "Created",
    render: (row) => (
      <p className="font-mono text-xs leading-5 text-radar-code">
        {formatOptionalDate(row.createdAt)}
      </p>
    )
  },
  {
    header: "Source",
    render: (row) => <StatusChip label={readSourceLabel(row.source)} tone={readSourceTone(row.source)} />
  }
];

function readSourceLabel(source: AdminReviewReadSource) {
  if (source === "supabase") {
    return "Supabase read";
  }

  if (source === "local_preview") {
    return "Local preview";
  }

  return "Unavailable";
}

function readSourceTone(source: AdminReviewReadSource): StatusTone {
  if (source === "supabase") {
    return "success";
  }

  if (source === "local_preview") {
    return "caution";
  }

  return "risk";
}

function reviewStatusTone(status: ReviewTaskStatus): StatusTone {
  if (status === "approved" || status === "resolved") {
    return "success";
  }

  if (status === "rejected") {
    return "risk";
  }

  if (status === "open" || status === "in_review") {
    return "caution";
  }

  return "neutral";
}

function priorityTone(priority: ReviewTaskPriority): StatusTone {
  if (priority === "urgent") {
    return "risk";
  }

  if (priority === "high") {
    return "caution";
  }

  if (priority === "normal") {
    return "admin";
  }

  return "neutral";
}

function sourceChangeStatusTone(status: SourceChangeRequestRow["status"]): StatusTone {
  if (status === "approved") {
    return "success";
  }

  if (status === "rejected") {
    return "risk";
  }

  if (status === "open") {
    return "caution";
  }

  return "neutral";
}

function reportStatusTone(status: ReportCandidateRow["status"]): StatusTone {
  if (status === "approved" || status === "published") {
    return "success";
  }

  if (status === "rejected") {
    return "risk";
  }

  if (status === "needs_review" || status === "draft") {
    return "caution";
  }

  return "neutral";
}

function dataSourceForRetrieval(source: RetrievalDataSource) {
  if (source === "supabase_radar_items" || source === "local_understanding_output" || source === "mock_data") {
    return source;
  }

  return "empty";
}

function formatTimeWindow(row: ReportCandidateRow) {
  if (!row.timeWindowStart && !row.timeWindowEnd) {
    return "window unset";
  }

  return `${formatOptionalDate(row.timeWindowStart)} to ${formatOptionalDate(row.timeWindowEnd)}`;
}

function formatOptionalDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return "not persisted";
  }

  return formatDate(value);
}
