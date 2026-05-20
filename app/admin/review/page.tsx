import Link from "next/link";

import { AdminCommandBlock } from "@/components/admin-command-block";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin-data-table";
import { AdminStatusCard } from "@/components/admin-status-card";
import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import {
  submitCreateReportCandidate,
  submitCreateReviewTask,
  submitCreateSourceChangeRequest,
  submitPublishReportCandidate,
  submitUpdateReportCandidateStatus,
  submitUpdateReviewTaskStatus,
  submitUpdateSourceChangeRequestStatus
} from "@/lib/admin/actions";
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
          <StatusChip label="Controlled review workflow" tone="admin" />
          <StatusChip label="Admin role required" tone="risk" />
          <StatusChip label="Audited mutations" tone="success" />
          <StatusChip label="No scheduled writes" tone="caution" />
          <StatusChip label="No live DeepSeek" tone="caution" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">
          Review queue
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Operational review surface for radar items, missing public source
          URLs, source change requests, report candidates, and audit events.
          Mutations are server actions that re-check the signed-in admin role,
          sanitize inputs, and write admin audit events. Public Ask and Write
          routes remain open.
        </p>
      </section>

      <section
        aria-label="Review workflow overview"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
      >
        <AdminStatusCard
          detail="Persisted task queue rows after the review migration is manually applied."
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
          detail="Source add, update URL, trial, approve, reject, pause, and resume requests."
          label="Source changes"
          tone="admin"
          value={data.sourceChangeRequests.rows.length}
        />
        <AdminStatusCard
          detail="Candidate daily, weekly, topic, or observation report seeds awaiting review."
          label="Reports"
          tone="evidence"
          value={data.reportCandidates.rows.length}
        />
        <AdminStatusCard
          detail="Recent admin audit rows written by controlled server-side mutations."
          label="Audit"
          tone="admin"
          value={data.auditEvents.rows.length}
        />
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Report candidate focus
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              Daily and weekly candidates are reviewed in the report candidate
              table. Approve, reject, and defer actions are shown on persisted
              rows; approval does not publish by itself.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip label="daily" tone="evidence" />
            <StatusChip label="weekly" tone="evidence" />
            <StatusChip label="approve / reject / defer" tone="caution" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
          <a className="text-radar-admin hover:text-radar-evidence" href="#report-candidates">
            Jump to report candidates
          </a>
          <Link className="text-radar-admin hover:text-radar-evidence" href="/reports">
            Open reports
          </Link>
        </div>
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
              The page reads local review candidates and authenticated Supabase
              workflow rows. Writes are limited to explicit admin server actions;
              this route does not apply migrations, run scheduled writes, call DeepSeek, or
              write source-health history.
            </p>
          </div>
          <DataSourceChip detail="or local preview" source="supabase_radar_items" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <AdminCommandBlock
            command="supabase/migrations/202605140005_admin_review_workflows.sql"
            detail="Must be applied manually before persisted review actions can read and write workflow tables."
            label="manual review"
            title="Review schema"
            tone="admin"
          />
          <AdminCommandBlock
            command="lib/admin/actions.ts"
            detail="Server actions require admin role, sanitize inputs, use service role only after authorization, write audit events, and can publish approved report candidates."
            label="server-only"
            title="Workflow actions"
            tone="success"
          />
          <AdminCommandBlock
            command="scheduled writes and live DeepSeek: not run by this route"
            detail="Review mutations do not start ingestion, source-health checks, scheduled jobs, or live model calls."
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
                These notes explain which authenticated reads are unavailable or
                empty in the current environment.
              </p>
            </div>
            <StatusChip label="Mutation errors sanitized" tone="success" />
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

      <section
        aria-label="Create admin review records"
        className="grid gap-4 xl:grid-cols-[1fr_1fr]"
      >
        <CreateReviewTaskPanel />
        <CreateReportCandidatePanel />
      </section>

      <ReviewTable
        ariaLabel="Review task queue"
        columns={reviewTaskColumns}
        description="Generic task queue for reviewable targets. Persisted rows can be moved through in-review, approve, reject, defer, and resolve states."
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
        description="Source add, URL update, trial, approve, reject, pause, and resume requests. Status changes are explicit audited admin actions."
        emptyLabel="No source change request rows"
        minWidth="1040px"
        result={data.sourceChangeRequests}
        rowKey={(row) => row.id}
        title="Source approve / trial / reject workflow"
      />

      <ReviewTable
        ariaLabel="Report candidates"
        columns={reportCandidateColumns}
        description="Candidate report seeds for daily, weekly, topic, or observation reports. Approved daily, weekly, and topic candidates can be saved as reviewed reports or published as public reports."
        emptyLabel="No report candidates"
        id="report-candidates"
        minWidth="1080px"
        result={data.reportCandidates}
        rowKey={(row) => row.id}
        title="Report candidate review"
      />

      <ReviewTable
        ariaLabel="Recent admin audit events"
        columns={auditEventColumns}
        description="Recent admin audit event rows written by controlled review mutations."
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
  id,
  minWidth,
  result,
  rowKey,
  title
}: {
  ariaLabel: string;
  columns: AdminDataTableColumn<T>[];
  description: string;
  emptyLabel: string;
  id?: string;
  minWidth: string;
  result: AdminReviewReadResult<T>;
  rowKey: (row: T) => string;
  title: string;
}) {
  return (
    <section
      className="min-w-0 rounded-lg border border-radar-line bg-white p-4 shadow-soft"
      id={id}
    >
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

function CreateReviewTaskPanel() {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-radar-ink">Create review task</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-radar-muted">
            Creates a persisted task and audit row through the admin server action.
          </p>
        </div>
        <StatusChip label="Admin action" tone="risk" />
      </div>
      <form action={submitCreateReviewTask} className="mt-4 grid gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          <label className={fieldClassName}>
            <span className={labelClassName}>Target</span>
            <select className={inputClassName} name="targetType" required>
              <option value="radar_item">Radar item</option>
              <option value="source">Source</option>
              <option value="report_candidate">Report candidate</option>
              <option value="source_change">Source change</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className={fieldClassName}>
            <span className={labelClassName}>Priority</span>
            <select className={inputClassName} name="priority" required>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className={fieldClassName}>
            <span className={labelClassName}>Target UUID</span>
            <input className={inputClassName} name="targetId" placeholder="optional persisted id" />
          </label>
        </div>
        <label className={fieldClassName}>
          <span className={labelClassName}>Task title</span>
          <input className={inputClassName} maxLength={160} name="title" required />
        </label>
        <label className={fieldClassName}>
          <span className={labelClassName}>Local id</span>
          <input className={inputClassName} maxLength={160} name="targetLocalId" placeholder="optional source slug or local id" />
        </label>
        <label className={fieldClassName}>
          <span className={labelClassName}>Description</span>
          <textarea className={textareaClassName} maxLength={800} name="description" rows={3} />
        </label>
        <label className={fieldClassName}>
          <span className={labelClassName}>Reason</span>
          <textarea className={textareaClassName} maxLength={500} name="reason" rows={2} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-radar-muted">
            Submit only reviewed admin notes; the mutation writes an audit event.
          </p>
          <button className={buttonClassName("admin")} type="submit">
            Create task
          </button>
        </div>
      </form>
    </section>
  );
}

function CreateReportCandidatePanel() {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-radar-ink">Create report candidate</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-radar-muted">
            Adds a needs-review report candidate without publishing a report.
          </p>
        </div>
        <StatusChip label="No publish side effect" tone="caution" />
      </div>
      <form action={submitCreateReportCandidate} className="mt-4 grid gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          <label className={fieldClassName}>
            <span className={labelClassName}>Type</span>
            <select className={inputClassName} name="reportType" required>
              <option value="topic">Topic</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="observation">Observation</option>
            </select>
          </label>
          <label className={fieldClassName}>
            <span className={labelClassName}>Window start</span>
            <input className={inputClassName} name="timeWindowStart" type="datetime-local" />
          </label>
          <label className={fieldClassName}>
            <span className={labelClassName}>Window end</span>
            <input className={inputClassName} name="timeWindowEnd" type="datetime-local" />
          </label>
        </div>
        <label className={fieldClassName}>
          <span className={labelClassName}>Title</span>
          <input className={inputClassName} maxLength={180} name="title" required />
        </label>
        <label className={fieldClassName}>
          <span className={labelClassName}>Summary</span>
          <textarea className={textareaClassName} maxLength={1200} name="summary" required rows={4} />
        </label>
        <label className={fieldClassName}>
          <span className={labelClassName}>Source item UUIDs</span>
          <textarea
            className={textareaClassName}
            maxLength={2000}
            name="sourceItemIds"
            placeholder="optional comma-separated UUIDs"
            rows={2}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-radar-muted">
            Approval and rejection remain separate audited actions.
          </p>
          <button className={buttonClassName("evidence")} type="submit">
            Create candidate
          </button>
        </div>
      </form>
    </section>
  );
}

function ReviewTaskActions({ row }: { row: ReviewTaskRow }) {
  if (row.source !== "supabase") {
    return <StatusChip label="Persisted row required" tone="neutral" />;
  }

  if (row.status === "approved" || row.status === "rejected" || row.status === "deferred" || row.status === "resolved") {
    return <StatusChip label="Terminal status" tone={reviewStatusTone(row.status)} />;
  }

  return (
    <div className="grid gap-2">
      <p className="text-xs leading-5 text-radar-muted">
        Each status write is audited.
      </p>
      <div className="flex flex-wrap gap-2">
        {row.status === "open" ? (
          <StatusActionForm
            action={submitUpdateReviewTaskStatus}
            buttonLabel="Mark in review"
            id={row.id}
            noteName="resolutionNote"
            status="in_review"
            tone="admin"
          />
        ) : null}
        <StatusActionForm
          action={submitUpdateReviewTaskStatus}
          buttonLabel="Approve"
          id={row.id}
          noteName="resolutionNote"
          status="approved"
          tone="success"
        />
        <StatusActionForm
          action={submitUpdateReviewTaskStatus}
          buttonLabel="Defer"
          id={row.id}
          noteName="resolutionNote"
          status="deferred"
          tone="caution"
        />
        <StatusActionForm
          action={submitUpdateReviewTaskStatus}
          buttonLabel="Resolve"
          id={row.id}
          noteName="resolutionNote"
          status="resolved"
          tone="neutral"
        />
        <StatusActionForm
          action={submitUpdateReviewTaskStatus}
          buttonLabel="Reject"
          id={row.id}
          noteName="resolutionNote"
          status="rejected"
          tone="risk"
        />
      </div>
    </div>
  );
}

function MissingPublicUrlRequestForm({ row }: { row: SourceMissingPublicUrlRow }) {
  return (
    <form action={submitCreateSourceChangeRequest} className="grid gap-2">
      <input name="requestType" type="hidden" value="update_url" />
      <input name="sourceSlug" type="hidden" value={row.id} />
      <input name="proposedStatus" type="hidden" value="trial" />
      <input
        name="rationale"
        type="hidden"
        value={`Reviewed public URL proposed for ${row.name}.`}
      />
      <label className={fieldClassName}>
        <span className={labelClassName}>Public URL</span>
        <input
          className={inputClassName}
          name="proposedUrl"
          placeholder="https://example.com"
          required
          type="url"
        />
      </label>
      <button className={buttonClassName("admin")} type="submit">
        Create URL request
      </button>
    </form>
  );
}

function SourceChangeRequestActions({ row }: { row: SourceChangeRequestRow }) {
  if (row.source !== "supabase") {
    return <StatusChip label="Persisted row required" tone="neutral" />;
  }

  if (row.status !== "open") {
    return <StatusChip label="Reviewed status" tone={sourceChangeStatusTone(row.status)} />;
  }

  return (
    <div className="grid gap-2">
      <p className="text-xs leading-5 text-radar-muted">
        Approve, reject, or defer writes an audit event.
      </p>
      <div className="flex flex-wrap gap-2">
        <StatusActionForm
          action={submitUpdateSourceChangeRequestStatus}
          buttonLabel="Approve"
          id={row.id}
          noteName="reviewNote"
          status="approved"
          tone="success"
        />
        <StatusActionForm
          action={submitUpdateSourceChangeRequestStatus}
          buttonLabel="Defer"
          id={row.id}
          noteName="reviewNote"
          status="deferred"
          tone="caution"
        />
        <StatusActionForm
          action={submitUpdateSourceChangeRequestStatus}
          buttonLabel="Reject"
          id={row.id}
          noteName="reviewNote"
          status="rejected"
          tone="risk"
        />
      </div>
    </div>
  );
}

function ReportCandidateActions({ row }: { row: ReportCandidateRow }) {
  if (row.source !== "supabase") {
    return <StatusChip label="Persisted row required" tone="neutral" />;
  }

  if (row.status === "published") {
    return <StatusChip label="Published report" tone="success" />;
  }

  if (row.status === "approved") {
    if (!canBecomeReportRecord(row.reportType)) {
      return <StatusChip label="Report record unsupported" tone="neutral" />;
    }

    return (
      <div className="grid gap-2">
        <p className="text-xs leading-5 text-radar-muted">
          Approved candidates can become reviewed or published report records.
        </p>
        <div className="flex flex-wrap gap-2">
          <ReportPublicationForm
            buttonLabel="Save report"
            id={row.id}
            reportStatus="reviewed"
            tone="admin"
          />
          <ReportPublicationForm
            buttonLabel="Publish report"
            id={row.id}
            reportStatus="published"
            tone="success"
          />
        </div>
      </div>
    );
  }

  if (row.status === "deferred" || row.status === "rejected") {
    return <StatusChip label="Reviewed status" tone={reportStatusTone(row.status)} />;
  }

  return (
    <div className="grid gap-2">
      <p className="text-xs leading-5 text-radar-muted">
        Approval does not publish a report.
      </p>
      <div className="flex flex-wrap gap-2">
        <StatusActionForm
          action={submitUpdateReportCandidateStatus}
          buttonLabel="Approve"
          id={row.id}
          noteName="reviewNote"
          status="approved"
          tone="success"
        />
        <StatusActionForm
          action={submitUpdateReportCandidateStatus}
          buttonLabel="Reject"
          id={row.id}
          noteName="reviewNote"
          status="rejected"
          tone="risk"
        />
        <StatusActionForm
          action={submitUpdateReportCandidateStatus}
          buttonLabel="Defer"
          id={row.id}
          noteName="reviewNote"
          status="deferred"
          tone="caution"
        />
      </div>
    </div>
  );
}

function ReportPublicationForm({
  buttonLabel,
  id,
  reportStatus,
  tone
}: {
  buttonLabel: string;
  id: string;
  reportStatus: "reviewed" | "published";
  tone: StatusTone;
}) {
  return (
    <form action={submitPublishReportCandidate}>
      <input name="id" type="hidden" value={id} />
      <input name="reportStatus" type="hidden" value={reportStatus} />
      <input name="publicationNote" type="hidden" value={`${buttonLabel} from approved report candidate.`} />
      <button className={buttonClassName(tone)} type="submit">
        {buttonLabel}
      </button>
    </form>
  );
}

function StatusActionForm({
  action,
  buttonLabel,
  id,
  noteName,
  status,
  tone
}: {
  action: (formData: FormData) => Promise<void>;
  buttonLabel: string;
  id: string;
  noteName: "resolutionNote" | "reviewNote";
  status: string;
  tone: StatusTone;
}) {
  return (
    <form action={action}>
      <input name="id" type="hidden" value={id} />
      <input name="status" type="hidden" value={status} />
      <input name={noteName} type="hidden" value={`${buttonLabel} from admin review queue.`} />
      <button className={buttonClassName(tone)} type="submit">
        {buttonLabel}
      </button>
    </form>
  );
}

const fieldClassName = "grid gap-1.5";
const labelClassName = "text-xs font-semibold uppercase tracking-normal text-radar-muted";
const inputClassName =
  "w-full rounded-md border border-radar-line bg-white px-3 py-2 text-sm text-radar-ink shadow-sm placeholder:text-radar-muted/70 focus:border-radar-admin focus:outline-none focus:ring-2 focus:ring-radar-admin/20";
const textareaClassName = `${inputClassName} min-h-[76px] resize-y`;

function buttonClassName(tone: StatusTone) {
  const toneClasses: Record<StatusTone, string> = {
    admin: "border-radar-admin/30 bg-radar-admin text-white hover:bg-radar-evidence",
    caution: "border-radar-caution/40 bg-radar-caution/10 text-radar-caution hover:bg-radar-caution/15",
    evidence: "border-radar-evidence/30 bg-radar-evidence text-white hover:bg-radar-admin",
    freshness: "border-radar-freshness/30 bg-radar-freshness/10 text-radar-freshness hover:bg-radar-freshness/15",
    neutral: "border-radar-line bg-white text-radar-ink hover:border-radar-admin hover:text-radar-admin",
    risk: "border-radar-risk/40 bg-radar-risk/10 text-radar-risk hover:bg-radar-risk/15",
    success: "border-radar-success/30 bg-radar-success/10 text-radar-success hover:bg-radar-success/15"
  };

  return `rounded-md border px-3 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-admin ${toneClasses[tone]}`;
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
  },
  {
    className: "min-w-[250px]",
    header: "Admin actions",
    render: (row) => <ReviewTaskActions row={row} />
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
  },
  {
    className: "min-w-[300px]",
    header: "Create request",
    render: (row) => <MissingPublicUrlRequestForm row={row} />
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
    className: "min-w-[250px]",
    header: "Admin actions",
    render: (row) => <SourceChangeRequestActions row={row} />
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
        <EvidenceBadge detail={String(row.citationsCount)} kind="citation" label="citations" />
        <EvidenceBadge detail={String(row.caveats.length)} kind="uncertainty" label="caveats" />
        <EvidenceBadge detail={String(row.missingEvidence.length)} kind="needs_review" label="gaps" />
      </div>
    )
  },
  {
    header: "Caveats / missing evidence",
    render: (row) => (
      <div className="grid max-w-md gap-1 text-sm leading-6 text-radar-muted">
        {[...row.caveats, ...row.missingEvidence].slice(0, 3).map((item) => (
          <p key={item}>{item}</p>
        ))}
        {row.caveats.length === 0 && row.missingEvidence.length === 0 ? (
          <p>No report caveats or missing-evidence notes recorded.</p>
        ) : null}
      </div>
    )
  },
  {
    className: "min-w-[220px]",
    header: "Admin actions",
    render: (row) => <ReportCandidateActions row={row} />
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

  if (status === "needs_review" || status === "draft" || status === "deferred") {
    return "caution";
  }

  return "neutral";
}

function canBecomeReportRecord(reportType: ReportCandidateRow["reportType"]) {
  return reportType === "daily" || reportType === "weekly" || reportType === "topic";
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
