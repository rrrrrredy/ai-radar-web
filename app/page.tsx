import Link from "next/link";

import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import {
  type CountEntry,
  type ProductDataSummary,
  loadProductDataSummary
} from "@/lib/product/data-summary";
import type { ReportWorkflowDocument } from "@/lib/reports/types";

export default async function HomePage() {
  const summary = await loadProductDataSummary();

  return (
    <div className="space-y-10">
      <section className="grid gap-8 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceChip detail="production read path" source={summary.dataSource} />
            <StatusChip label="Public information only" tone="evidence" />
            <StatusChip label="Coverage" tone="caution" value="improving" />
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-radar-ink sm:text-5xl">
            AI Industry Radar
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-radar-muted">
            Editorial Intelligence Desk for AI signals: source coverage,
            retrieved evidence, report candidates, and caveats in one public
            data surface.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              href="/radar"
            >
              Open radar
            </Link>
            <Link
              className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
              href="/reports"
            >
              Review reports
            </Link>
            <Link
              className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
              href="/ask"
            >
              Ask with evidence
            </Link>
          </div>
        </div>

        <ProductionStatusPanel summary={summary} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <RadarPulse summary={summary} />
        <LatestReports summary={summary} />
      </section>

      <RelationshipPreview summary={summary} />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <QueryHubPanel summary={summary} />
        <CaveatPanel caveats={summary.caveats} warnings={summary.warnings} />
      </section>
    </div>
  );
}

function ProductionStatusPanel({ summary }: { summary: ProductDataSummary }) {
  const coverage = summary.coverage;
  const metrics = [
    { label: "Sources total", value: coverage.sourcesTotal, tone: "evidence" as const },
    { label: "Attempted", value: coverage.attemptedSources, tone: "freshness" as const },
    { label: "Sources public", value: formatCount(coverage.sourcesWithPublicItems), tone: "success" as const },
    { label: "Public rows", value: formatCount(coverage.publicRadarItems), tone: "success" as const },
    { label: "Failed/skipped", value: coverage.failedSources + coverage.skippedSources, tone: "risk" as const },
    { label: "Report candidates", value: formatCount(summary.counts.reportCandidates), tone: "admin" as const },
    { label: "Citations", value: summary.counts.citations, tone: "neutral" as const }
  ];

  return (
    <aside className="rounded-lg border border-radar-line bg-radar-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
          Production data status
        </h2>
        <DataSourceChip detail="homepage status" source={summary.dataSource} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {metrics.map((metric) => (
          <div className="rounded-md border border-radar-line bg-white p-3" key={metric.label}>
            <dt className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
              {metric.label}
            </dt>
            <dd className={`mt-2 text-2xl font-semibold ${metricToneClass(metric.tone)}`}>
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid gap-2 text-sm">
        <RailRow label="Data source" value={summary.dataSource} />
        <RailRow label="Automated eligible sources" value={String(coverage.automatedEligibleSources)} />
        <RailRow label="Included / needs_review / excluded" value={`${summary.counts.included} / ${summary.counts.needsReview} / ${summary.counts.excluded}`} />
        <RailRow label="Latest refresh" value={formatTimestamp(coverage.latestRefresh ?? summary.latest.radar)} />
        <RailRow label="Latest ingestion" value={formatTimestamp(coverage.latestIngestion ?? summary.latest.ingestion)} />
        <RailRow label="Latest understanding" value={formatTimestamp(coverage.latestUnderstanding ?? summary.latest.understanding)} />
        <RailRow label="Source to raw coverage" value={formatRate(coverage.rates.sourceRawCoverage)} />
      </div>
    </aside>
  );
}

function RadarPulse({ summary }: { summary: ProductDataSummary }) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">Radar Pulse</h2>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            Live public retrieval counts, category concentration, source mix,
            and the newest visible signals from Supabase.
          </p>
        </div>
        <Link className="text-sm font-semibold text-radar-evidence" href="/radar">
          Open full radar
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <CountList entries={summary.topCategories} title="Top categories" />
        <CountList entries={summary.topSources} title="Top sources" />
        <CountList entries={summary.topSourceFamilies} title="Source families" />
      </div>

      <section className="overflow-hidden rounded-lg border border-radar-line bg-white shadow-soft">
        <div className="border-b border-radar-line bg-radar-panel px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-radar-ink">Latest signals</h3>
            <EvidenceBadge detail={String(summary.latestSignals.length)} kind="freshness" label="Rows" />
          </div>
        </div>
        <div className="divide-y divide-radar-line">
          {summary.latestSignals.map((signal, index) => (
            <article className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px]" key={signal.id}>
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="font-mono text-xs font-semibold text-radar-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <StatusChip label={signal.status} tone={statusTone(signal.status)} />
                  {signal.categories.slice(0, 2).map((category) => (
                    <StatusChip key={category} label={category} tone="neutral" />
                  ))}
                </div>
                <h3 className="mt-2 text-base font-semibold leading-7 text-radar-ink">
                  <a className="hover:text-radar-evidence" href={signal.href} rel="noreferrer" target="_blank">
                    {signal.title}
                  </a>
                </h3>
              </div>
              <aside className="rounded-md border border-radar-line bg-radar-panel p-3 text-sm">
                <RailRow label="Source" value={signal.source} />
                <RailRow label="Timestamp" value={formatTimestamp(signal.timestamp)} />
              </aside>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function LatestReports({ summary }: { summary: ProductDataSummary }) {
  const reports = [summary.reports.daily, summary.reports.weekly].filter(
    (report): report is ReportWorkflowDocument => Boolean(report)
  );

  return (
    <aside className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-radar-ink">Saved candidates</h2>
        <p className="mt-2 text-sm leading-6 text-radar-muted">
          Daily and weekly candidates are saved workflow records, not published reports.
        </p>
      </div>
      {reports.map((report) => (
        <Link
          className="block rounded-lg border border-radar-line bg-white p-4 shadow-soft hover:border-radar-evidence"
          href={`/reports?type=${report.report_type}`}
          key={report.report_type}
        >
          <div className="flex flex-wrap gap-2">
            <StatusChip label={report.report_type} tone="evidence" />
            <StatusChip label={report.status} tone={statusTone(report.status)} />
            <EvidenceBadge detail={String(report.citations.length)} kind="citation" label="Citations" />
            <EvidenceBadge detail={String(report.usable_item_count)} kind="evidence" label="Usable" />
          </div>
          <h3 className="mt-3 text-base font-semibold leading-7 text-radar-ink">
            {report.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            {report.one_sentence_summary}
          </p>
          <p className="mt-3 text-xs leading-5 text-radar-muted">
            Window: {formatTimestamp(report.time_window.start)} to {formatTimestamp(report.time_window.end)}
          </p>
        </Link>
      ))}
      <Link
        className="inline-flex rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
        href="/reports"
      >
        Open report desk
      </Link>
    </aside>
  );
}

function RelationshipPreview({ summary }: { summary: ProductDataSummary }) {
  const categories = summary.topCategories.slice(0, 5);
  const sources = summary.topSources.slice(0, 5);

  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">Relationship preview</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
            Inspired by the reference knowledge graph: this is a real, lightweight
            map of how current Supabase radar rows connect sources, categories,
            and saved report candidates.
          </p>
        </div>
        <StatusChip label="Graph preview" tone="admin" value="real counts" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative min-h-72 overflow-hidden rounded-md border border-radar-line bg-radar-panel p-4">
          <svg aria-hidden="true" className="absolute inset-0 h-full w-full" role="img" viewBox="0 0 720 300">
            <line className="stroke-radar-line" strokeWidth="1.5" x1="360" x2="155" y1="150" y2="58" />
            <line className="stroke-radar-line" strokeWidth="1.5" x1="360" x2="145" y1="150" y2="142" />
            <line className="stroke-radar-line" strokeWidth="1.5" x1="360" x2="170" y1="150" y2="230" />
            <line className="stroke-radar-line" strokeWidth="1.5" x1="360" x2="560" y1="150" y2="58" />
            <line className="stroke-radar-line" strokeWidth="1.5" x1="360" x2="575" y1="150" y2="145" />
            <line className="stroke-radar-line" strokeWidth="1.5" x1="360" x2="545" y1="150" y2="230" />
            <circle className="fill-radar-evidence/15 stroke-radar-evidence" cx="360" cy="150" r="54" strokeWidth="2" />
            <circle className="fill-radar-freshness/15 stroke-radar-freshness" cx="155" cy="58" r="34" strokeWidth="2" />
            <circle className="fill-radar-freshness/15 stroke-radar-freshness" cx="145" cy="142" r="28" strokeWidth="2" />
            <circle className="fill-radar-freshness/15 stroke-radar-freshness" cx="170" cy="230" r="24" strokeWidth="2" />
            <circle className="fill-radar-admin/10 stroke-radar-admin" cx="560" cy="58" r="34" strokeWidth="2" />
            <circle className="fill-radar-admin/10 stroke-radar-admin" cx="575" cy="145" r="28" strokeWidth="2" />
            <circle className="fill-radar-admin/10 stroke-radar-admin" cx="545" cy="230" r="24" strokeWidth="2" />
          </svg>
          <div className="relative grid min-h-64 grid-cols-[1fr_1.1fr_1fr] items-center gap-3 text-center">
            <NodeColumn entries={categories} label="Categories" tone="freshness" />
            <div className="rounded-full border border-radar-evidence bg-white px-5 py-6 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
                Data source
              </p>
              <p className="mt-2 text-sm font-semibold text-radar-ink">supabase_radar_items</p>
              <p className="mt-1 text-2xl font-semibold text-radar-evidence">
                {summary.counts.visibleRadarItems}
              </p>
            </div>
            <NodeColumn entries={sources} label="Sources" tone="admin" />
          </div>
        </div>

        <aside className="space-y-3">
          <GraphLegendRow label="Category nodes" value={categories.length} tone="freshness" />
          <GraphLegendRow label="Source nodes" value={sources.length} tone="admin" />
          <GraphLegendRow label="Report nodes" value={summary.reports.savedCount} tone="evidence" />
          <div className="rounded-md border border-radar-caution/30 bg-radar-caution/5 p-3 text-sm leading-6 text-radar-caution">
            Relationship depth is intentionally limited to public-safe retrieval
            fields. Entity extraction can deepen this in a later milestone.
          </div>
        </aside>
      </div>
    </section>
  );
}

function QueryHubPanel({ summary }: { summary: ProductDataSummary }) {
  const categoryQueries = summary.topCategories.slice(0, 3).map((category) => ({
    href: `/ask?question=${encodeURIComponent(`What changed in ${category.label} signals?`)}`,
    label: `What changed in ${category.label}?`,
    meta: `${category.count} visible rows`
  }));
  const prompts = [
    ...categoryQueries,
    {
      href: "/ask?question=Which signals are strong enough for a weekly report?",
      label: "Which signals are strong enough for a weekly report?",
      meta: `${summary.counts.visibleRadarItems} radar rows`
    },
    {
      href: "/write",
      label: "Turn current signals into editorial topic candidates",
      meta: "Write desk"
    }
  ];

  return (
    <section className="rounded-lg border border-radar-line bg-radar-panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold text-radar-ink">Analyst query hub</h2>
        <DataSourceChip source={summary.dataSource} />
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
        Action-oriented entry points mirror the query-hub reference pattern:
        start from current data shape, then move into Ask or Write.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {prompts.map((prompt, index) => (
          <Link
            className="rounded-md border border-radar-line bg-white p-4 hover:border-radar-evidence"
            href={prompt.href}
            key={prompt.label}
          >
            <span className="font-mono text-xs font-semibold text-radar-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="mt-2 text-sm font-semibold leading-6 text-radar-ink">{prompt.label}</p>
            <p className="mt-1 text-xs leading-5 text-radar-muted">{prompt.meta}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CaveatPanel({ caveats, warnings }: { caveats: string[]; warnings: string[] }) {
  const visible = Array.from(new Set([...caveats, ...warnings])).slice(0, 6);

  return (
    <aside className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-radar-ink">Coverage notes</h2>
        <StatusChip label="Caveats" tone="caution" value={visible.length} />
      </div>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-radar-muted">
        {visible.map((note) => (
          <li className="rounded-md border border-radar-line bg-radar-panel px-3 py-2" key={note}>
            {note}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function CountList({ entries, title }: { entries: CountEntry[]; title: string }) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
      <h3 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
        {title}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {entries.length > 0 ? (
          entries.map((entry) =>
            entry.href ? (
              <Link
                className="inline-flex items-center gap-1 rounded-md border border-radar-line bg-radar-panel px-2 py-1 text-xs font-semibold text-radar-muted hover:border-radar-evidence hover:text-radar-evidence"
                href={entry.href}
                key={entry.label}
              >
                <span>{entry.label}</span>
                <span className="font-medium opacity-80">{entry.count}</span>
              </Link>
            ) : (
              <StatusChip key={entry.label} label={entry.label} tone="neutral" value={entry.count} />
            )
          )
        ) : (
          <StatusChip label="none" tone="neutral" />
        )}
      </div>
    </section>
  );
}

function NodeColumn({
  entries,
  label,
  tone
}: {
  entries: CountEntry[];
  label: string;
  tone: StatusTone;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">{label}</p>
      {entries.slice(0, 3).map((entry) => (
        <div className="rounded-full border border-radar-line bg-white px-3 py-2" key={entry.label}>
          <StatusChip label={entry.label} tone={tone} value={entry.count} />
        </div>
      ))}
    </div>
  );
}

function GraphLegendRow({
  label,
  tone,
  value
}: {
  label: string;
  tone: StatusTone;
  value: number;
}) {
  return (
    <div className="rounded-md border border-radar-line bg-radar-panel p-3">
      <StatusChip label={label} tone={tone} value={value} />
    </div>
  );
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-radar-line pt-2 first:border-t-0 first:pt-0">
      <dt className="text-xs font-semibold uppercase tracking-normal text-radar-muted">{label}</dt>
      <dd className="mt-1 break-words leading-6 text-radar-ink">{value}</dd>
    </div>
  );
}

function formatCount(value: number | null) {
  return value === null ? "n/a" : value;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(date)} UTC`;
}

function formatRate(value: number | null) {
  return value === null ? "not available" : `${Math.round(value * 1000) / 10}%`;
}

function statusTone(status: string): StatusTone {
  if (status === "included" || status === "approved" || status === "published" || status === "reviewed") {
    return "success";
  }

  if (status === "needs_review" || status === "draft" || status === "preview") {
    return "caution";
  }

  if (status === "excluded" || status === "failed" || status === "rejected" || status === "archived") {
    return "risk";
  }

  return "neutral";
}

function metricToneClass(tone: StatusTone) {
  if (tone === "evidence") {
    return "text-radar-evidence";
  }

  if (tone === "freshness") {
    return "text-radar-freshness";
  }

  if (tone === "success") {
    return "text-radar-success";
  }

  if (tone === "admin") {
    return "text-radar-admin";
  }

  if (tone === "risk") {
    return "text-radar-risk";
  }

  if (tone === "caution") {
    return "text-radar-caution";
  }

  return "text-radar-ink";
}
