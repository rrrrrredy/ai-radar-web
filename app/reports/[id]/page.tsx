import { notFound } from "next/navigation";

import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EmptyState } from "@/components/empty-state";
import { EvidenceBadge } from "@/components/evidence-badge";
import { ReportMarkdownExport } from "@/components/report-markdown-export";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { loadReportWorkflowData } from "@/lib/reports/load-report-data";
import type { GeneratedReportSection, ReportWorkflowDocument } from "@/lib/reports/types";

export default async function ReportDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadReportWorkflowData();
  const report = data.reports.find((candidate) => candidate.id === decodeURIComponent(id));

  if (!report) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <section className="border-b border-radar-line pb-8">
        <div className="flex flex-wrap gap-2">
          <DataSourceChip detail={modeLabel(report)} source={report.data_source} />
          <StatusChip label="Report status" tone={statusTone(report.status)} value={report.status} />
          <StatusChip label="Publication" tone={publicationTone(report)} value={publicationLabel(report)} />
          <EvidenceBadge detail={String(report.citations.length)} kind="citation" label="Citations" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">{report.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          {report.executive_summary}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            className="inline-flex rounded-md border border-radar-line bg-white px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-admin hover:text-radar-admin"
            href={`/reports?type=${report.report_type}`}
          >
            Back to reports
          </a>
          <a
            className="inline-flex rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            href="/write"
          >
            Expand in Write
          </a>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DetailMetric label="Type" value={report.report_type} />
        <DetailMetric label="Mode" value={modeLabel(report)} />
        <DetailMetric label="Saved at" value={report.saved_at ?? "not saved"} />
        <DetailMetric label="Generated at" value={report.generated_at} />
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap gap-2">
          <EvidenceBadge kind="evidence" label="Summary" />
          <EvidenceBadge detail={`${report.usable_item_count}/${report.retrieved_item_count}`} kind="evidence" label="Usable" />
        </div>
        <p className="mt-4 text-lg leading-8 text-radar-ink">
          {report.one_sentence_summary}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-radar-ink">Report sections</h2>
        {report.sections.length > 0 ? (
          report.sections.map((section) => <ReportSection key={section.id} section={section} />)
        ) : (
          <EmptyState
            description="This saved row does not include structured report sections."
            title="No structured sections"
          />
        )}
      </section>

      <DetailList items={report.caveats} title="Caveats" tone="caution" />
      <DetailList items={report.missing_evidence} title="Missing evidence" tone="risk" />

      <CitationList
        citations={report.citations}
        emptyMessage="No citations are available for this report."
        title="Report citations"
      />

      <ReportMarkdownExport markdown={report.markdown} />
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">{label}</p>
      <p className="mt-2 break-words text-sm leading-6 text-radar-ink">{value}</p>
    </div>
  );
}

function ReportSection({ section }: { section: GeneratedReportSection }) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <h3 className="text-base font-semibold text-radar-ink">{section.title}</h3>
      <p className="mt-2 text-sm leading-6 text-radar-muted">{section.summary}</p>
      {section.bullets.length > 0 ? (
        <ul className="mt-4 grid gap-2 text-sm leading-6 text-radar-muted">
          {section.bullets.map((bullet) => (
            <li className="rounded-md border border-radar-line bg-radar-panel px-3 py-2" key={bullet}>
              {bullet}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-radar-muted">No section bullets recorded.</p>
      )}
    </section>
  );
}

function DetailList({
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
        <p className="mt-3 text-sm leading-6 text-radar-muted">No notes recorded.</p>
      )}
    </section>
  );
}

function statusTone(status: ReportWorkflowDocument["status"]): StatusTone {
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
    return report.status === "approved" ? "approved candidate" : "saved candidate";
  }

  if (report.status === "published") {
    return "published report";
  }

  if (report.status === "reviewed") {
    return "approved report";
  }

  return "saved report";
}

function modeLabel(report: ReportWorkflowDocument) {
  if (report.mode === "saved_candidate") {
    return report.status === "approved" ? "approved report candidate" : "saved report candidate";
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
