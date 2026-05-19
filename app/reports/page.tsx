import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EmptyState } from "@/components/empty-state";
import { EvidenceBadge } from "@/components/evidence-badge";
import { ReportMarkdownExport } from "@/components/report-markdown-export";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { loadReportWorkflowData } from "@/lib/reports/load-report-data";
import type {
  GeneratedReportSection,
  GeneratedReportStatus,
  ReportPreviewType,
  ReportWorkflowDocument
} from "@/lib/reports/types";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const selectedType = readReportType(firstParam(params.type));
  const data = await loadReportWorkflowData();
  const selectedReport =
    data.reports.find((report) => report.report_type === selectedType) ?? data.reports[0];

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip detail={modeLabel(selectedReport)} source={selectedReport.data_source} />
            <StatusChip label="Report status" tone={statusTone(selectedReport.status)} value={selectedReport.status} />
            <StatusChip label="Saved mode" tone={selectedReport.read_source === "supabase" ? "success" : "caution"} value={readSourceLabel(selectedReport)} />
            <StatusChip label="Publication" tone={publicationTone(selectedReport)} value={publicationLabel(selectedReport)} />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">Reports</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            Daily and weekly report drafts now prefer saved Supabase report workflow rows.
            When no saved row is available, this page falls back to a deterministic
            draft from retrieved radar evidence and keeps uncertainty visible.
          </p>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            Workflow boundaries
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <RailRow label="Selected type" value={selectedReport.report_type} />
            <RailRow label="Saved/generated" value={readSourceLabel(selectedReport)} />
            <RailRow label="Generated at" value={selectedReport.generated_at} />
            <RailRow label="Time window" value={`${selectedReport.time_window.start} to ${selectedReport.time_window.end}`} />
          </dl>
        </aside>
      </section>

      {data.warnings.length > 0 ? (
        <section className="rounded-lg border border-radar-caution/40 bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-radar-ink">Read notes</h2>
            <StatusChip label={String(data.warnings.length)} tone="caution" />
          </div>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-radar-muted">
            {data.warnings.map((warning) => (
              <li className="rounded-md border border-radar-line bg-radar-panel px-3 py-2" key={warning}>
                {warning}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Report selector">
        {data.reports.map((report) => (
          <ReportTabCard
            isSelected={report.report_type === selectedReport.report_type}
            key={report.report_type}
            report={report}
          />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-lg border border-radar-line bg-radar-panel p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
              Selected draft
            </p>
            <h2 className="mt-2 text-lg font-semibold leading-7 text-radar-ink">
              {selectedReport.title}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip source={selectedReport.data_source} />
            <EvidenceBadge detail={`${selectedReport.usable_item_count}/${selectedReport.retrieved_item_count}`} kind="evidence" label="Usable" />
            <EvidenceBadge detail={String(selectedReport.citations.length)} kind="citation" label="Citations" />
            <EvidenceBadge detail={String(selectedReport.missing_evidence.length)} kind="uncertainty" label="Gaps" />
          </div>
          <dl className="space-y-3 text-sm">
            <RailRow label="Status" value={selectedReport.status} />
            <RailRow label="Mode" value={modeLabel(selectedReport)} />
            <RailRow label="Publication" value={publicationLabel(selectedReport)} />
            <RailRow label="Saved at" value={selectedReport.saved_at ?? "not saved"} />
            <RailRow label="Model/API calls" value={`${selectedReport.model_metadata.provider}; ${selectedReport.model_metadata.api_call_count} call(s)`} />
            <RailRow label="Window rule" value={selectedReport.time_window.explanation} />
          </dl>
          <div className="flex flex-wrap gap-2">
            {selectedReport.id ? (
              <a
                className="inline-flex rounded-md border border-radar-line bg-white px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-admin hover:text-radar-admin"
                href={`/reports/${selectedReport.id}`}
              >
                Open detail
              </a>
            ) : null}
            <a
              className="inline-flex rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              href="/write"
            >
              Expand in Write
            </a>
          </div>
        </aside>

        <div className="space-y-5">
          <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
            <div className="flex flex-wrap gap-2">
              <EvidenceBadge kind="evidence" label="Summary" />
              <StatusChip label="Report status" tone={statusTone(selectedReport.status)} value={selectedReport.status} />
              <StatusChip label="Supabase writes" tone="neutral" value={selectedReport.read_source === "supabase" ? "saved row" : "none"} />
            </div>
            <p className="mt-4 text-lg leading-8 text-radar-ink">
              {selectedReport.one_sentence_summary}
            </p>
            <p className="mt-3 text-sm leading-6 text-radar-muted">
              {selectedReport.executive_summary}
            </p>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">Report sections</h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                Sections preserve the evidence boundary and keep empty or weak areas explicit.
              </p>
            </div>
            {selectedReport.sections.length > 0 ? (
              selectedReport.sections.map((section) => (
                <ReportSectionView key={section.id} section={section} />
              ))
            ) : (
              <EmptyState
                description="This saved row does not include structured report sections."
                title="No structured sections"
              />
            )}
          </section>

          <PlanningList items={selectedReport.caveats} tone="caution" title="Caveats" />
          <PlanningList items={selectedReport.missing_evidence} tone="risk" title="Missing evidence" />

          <CitationList
            citations={selectedReport.citations}
            emptyMessage="No citations are available for this report draft."
            title="Report citations"
          />

          <ReportMarkdownExport markdown={selectedReport.markdown} />
        </div>
      </section>
    </div>
  );
}

function ReportTabCard({
  isSelected,
  report
}: {
  isSelected: boolean;
  report: ReportWorkflowDocument;
}) {
  return (
    <a
      aria-current={isSelected ? "page" : undefined}
      className={`rounded-lg border p-5 shadow-soft ${
        isSelected
          ? "border-radar-evidence bg-radar-evidence/5"
          : "border-radar-line bg-white hover:border-radar-evidence"
      }`}
      href={`/reports?type=${report.report_type}`}
    >
      <div className="flex flex-wrap gap-2">
        <StatusChip label={report.report_type} tone={isSelected ? "evidence" : "neutral"} />
        <StatusChip label={report.status} tone={statusTone(report.status)} />
        <StatusChip label={modeLabel(report)} tone={publicationTone(report)} />
        <StatusChip label={readSourceLabel(report)} tone={report.read_source === "supabase" ? "success" : "caution"} />
        <EvidenceBadge detail={String(report.citations.length)} kind="citation" label="Citations" />
      </div>
      <h2 className="mt-4 text-xl font-semibold leading-7 text-radar-ink">
        {report.title}
      </h2>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-radar-muted">
        {report.one_sentence_summary}
      </p>
    </a>
  );
}

function ReportSectionView({ section }: { section: GeneratedReportSection }) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-radar-ink">{section.title}</h3>
          <p className="mt-2 text-sm leading-6 text-radar-muted">{section.summary}</p>
        </div>
        <EvidenceBadge detail={String(section.bullets.length)} kind={section.bullets.length > 0 ? "evidence" : "uncertainty"} label="Bullets" />
      </div>

      {section.bullets.length > 0 ? (
        <ul className="mt-4 grid gap-2 text-sm leading-6 text-radar-muted">
          {section.bullets.map((bullet) => (
            <li className="rounded-md border border-radar-line bg-radar-panel px-3 py-2" key={bullet}>
              {bullet}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          description="This section has no generated bullets from the available evidence."
          title="No section bullets"
        />
      )}

      {section.citations.length > 0 || section.caveats.length > 0 || section.missing_evidence.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <InlineList items={section.citations} label="Citation ids" tone="evidence" />
          <InlineList items={section.caveats} label="Section caveats" tone="caution" />
          <InlineList items={section.missing_evidence} label="Missing evidence" tone="risk" />
        </div>
      ) : null}
    </section>
  );
}

function PlanningList({
  items,
  title,
  tone
}: {
  items: string[];
  title: string;
  tone: StatusTone;
}) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-radar-ink">{title}</h2>
        <StatusChip label={String(items.length)} tone={tone} />
      </div>
      {items.length > 0 ? (
        <ul className="mt-4 grid gap-2 text-sm leading-6 text-radar-muted">
          {items.map((item) => (
            <li className="rounded-md border border-radar-line bg-radar-panel px-3 py-2" key={item}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-radar-muted">No notes returned for this draft.</p>
      )}
    </section>
  );
}

function InlineList({
  items,
  label,
  tone
}: {
  items: string[];
  label: string;
  tone: StatusTone;
}) {
  return (
    <div className="rounded-md border border-radar-line bg-radar-panel p-3">
      <StatusChip label={label} tone={tone} value={items.length} />
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-radar-muted">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6 text-radar-muted">None.</p>
      )}
    </div>
  );
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-radar-line pt-2 first:border-t-0 first:pt-0">
      <dt className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words leading-6 text-radar-ink">{value}</dd>
    </div>
  );
}

function readReportType(value: string | undefined): ReportPreviewType {
  return value === "weekly" ? "weekly" : "daily";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusTone(status: GeneratedReportStatus): StatusTone {
  if (status === "published" || status === "approved" || status === "reviewed") {
    return "success";
  }

  if (status === "rejected" || status === "archived") {
    return "risk";
  }

  if (status === "needs_review" || status === "deferred" || status === "draft" || status === "preview") {
    return "caution";
  }

  return "neutral";
}

function publicationTone(report: ReportWorkflowDocument): StatusTone {
  if (report.status === "published") {
    return "success";
  }

  if (report.mode === "saved_report" || report.status === "approved" || report.status === "reviewed") {
    return "admin";
  }

  if (report.read_source === "generated_preview" || report.status === "needs_review" || report.status === "deferred" || report.status === "draft") {
    return "caution";
  }

  if (report.status === "rejected" || report.status === "archived") {
    return "risk";
  }

  return "neutral";
}

function publicationLabel(report: ReportWorkflowDocument) {
  if (report.read_source === "generated_preview") {
    return "generated preview";
  }

  if (report.mode === "saved_candidate") {
    if (report.status === "approved") {
      return "approved candidate";
    }

    if (report.status === "published") {
      return "candidate published";
    }

    return "saved candidate";
  }

  if (report.mode === "saved_report") {
    if (report.status === "published") {
      return "published report";
    }

    if (report.status === "reviewed") {
      return "approved report";
    }

    return "saved report";
  }

  return modeLabel(report);
}

function readSourceLabel(report: ReportWorkflowDocument) {
  return report.read_source === "supabase" ? "saved workflow" : "generated preview";
}

function modeLabel(report: ReportWorkflowDocument) {
  if (report.mode === "saved_candidate") {
    if (report.status === "approved") {
      return "approved report candidate";
    }

    return "saved report candidate";
  }

  if (report.mode === "saved_report") {
    if (report.status === "published") {
      return "published report";
    }

    if (report.status === "reviewed") {
      return "approved saved report";
    }

    return "saved report record";
  }

  if (report.model_metadata.mode === "live_deepseek") {
    return "live DeepSeek draft";
  }

  return "deterministic draft";
}
