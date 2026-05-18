import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EmptyState } from "@/components/empty-state";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { loadRadarFeed } from "@/lib/radar/feed";
import { generateReportPreview } from "@/lib/reports/generate-report-preview";
import type {
  ReportPreview,
  ReportPreviewItem,
  ReportPreviewSection,
  ReportPreviewType
} from "@/lib/reports/types";
import { formatPercent, formatScore } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const selectedType = readReportType(firstParam(params.type));
  const feed = await loadRadarFeed();
  const previews = [
    generateReportPreview(feed, "daily"),
    generateReportPreview(feed, "weekly")
  ];
  const selectedPreview =
    previews.find((preview) => preview.report_type === selectedType) ?? previews[0];

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip detail="shared radar feed" source={feed.data_source} />
            <StatusChip label="Report status" tone="caution" value="preview only" />
            <StatusChip label="Live DeepSeek" tone="caution" value="not run" />
            <StatusChip label="Publication" tone="neutral" value="future workflow" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">
            Reports
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            Daily and weekly previews are generated deterministically from
            retrieved radar items. They are evidence previews for editorial
            planning, not published reports and not live-model synthesis.
          </p>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            Preview boundaries
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <RailRow label="Freshness" value={feed.freshness_note} />
            <RailRow label="Retrieved items" value={String(feed.counts.total)} />
            <RailRow
              label="Review pressure"
              value={`${feed.counts.needs_review} needs_review / ${feed.counts.excluded} excluded / ${feed.counts.failed} failed`}
            />
            <RailRow
              label="Generated from evidence"
              value={selectedPreview.generated_at}
            />
          </dl>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Report preview tabs">
        {previews.map((preview) => (
          <PreviewTabCard
            isSelected={preview.report_type === selectedPreview.report_type}
            key={preview.report_type}
            preview={preview}
          />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-lg border border-radar-line bg-radar-panel p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
              Selected preview
            </p>
            <h2 className="mt-2 text-lg font-semibold leading-7 text-radar-ink">
              {selectedPreview.title}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip source={selectedPreview.data_source} />
            <EvidenceBadge
              detail={`${selectedPreview.usable_item_count}/${selectedPreview.retrieved_item_count}`}
              kind="evidence"
              label="Usable"
            />
            <EvidenceBadge
              detail={String(selectedPreview.citations.length)}
              kind="citation"
              label="Citations"
            />
          </div>
          <dl className="space-y-3 text-sm">
            <RailRow
              label="Window"
              value={`${selectedPreview.time_window.start} to ${selectedPreview.time_window.end}`}
            />
            <RailRow label="Window rule" value={selectedPreview.time_window.explanation} />
            <RailRow label="Generated at" value={selectedPreview.generated_at} />
            <RailRow
              label="Publication state"
              value="Preview only; full report publication is a future workflow."
            />
          </dl>
          <a
            className="inline-flex rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            href="/write"
          >
            Expand in Write
          </a>
        </aside>

        <div className="space-y-5">
          <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
            <div className="flex flex-wrap gap-2">
              <EvidenceBadge kind="evidence" label="Summary" />
              <StatusChip label="Model calls" tone="success" value="0" />
              <StatusChip label="Supabase writes" tone="risk" value="not run" />
            </div>
            <p className="mt-4 text-lg leading-8 text-radar-ink">
              {selectedPreview.summary}
            </p>
          </section>

          <ReportItemsSection
            empty="No top items are available for this preview window."
            items={selectedPreview.top_items}
            title="Top items"
          />

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">
                Preview sections
              </h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                Sections are deterministic groupings from item categories and
                review status. Empty sections are kept visible to show missing
                coverage.
              </p>
            </div>
            {selectedPreview.sections.map((section) => (
              <ReportSectionView key={section.id} section={section} />
            ))}
          </section>

          <PlanningList
            items={selectedPreview.caveats}
            tone="caution"
            title="Caveats"
          />
          <PlanningList
            items={selectedPreview.missing_evidence}
            tone="risk"
            title="Missing evidence"
          />

          <CitationList
            citations={selectedPreview.citations}
            emptyMessage="No citations are available for this preview."
            title="Report preview citations"
          />
        </div>
      </section>
    </div>
  );
}

function PreviewTabCard({
  isSelected,
  preview
}: {
  isSelected: boolean;
  preview: ReportPreview;
}) {
  return (
    <a
      aria-current={isSelected ? "page" : undefined}
      className={`rounded-lg border p-5 shadow-soft ${
        isSelected
          ? "border-radar-evidence bg-radar-evidence/5"
          : "border-radar-line bg-white hover:border-radar-evidence"
      }`}
      href={`/reports?type=${preview.report_type}`}
    >
      <div className="flex flex-wrap gap-2">
        <StatusChip
          label={preview.report_type}
          tone={isSelected ? "evidence" : "neutral"}
        />
        <EvidenceBadge
          detail={String(preview.usable_item_count)}
          kind="evidence"
          label="Usable items"
        />
        <EvidenceBadge
          detail={String(preview.missing_evidence.length)}
          kind="uncertainty"
          label="Gaps"
        />
      </div>
      <h2 className="mt-4 text-xl font-semibold leading-7 text-radar-ink">
        {preview.title}
      </h2>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-radar-muted">
        {preview.summary}
      </p>
    </a>
  );
}

function ReportSectionView({ section }: { section: ReportPreviewSection }) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-radar-ink">
            {section.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            {section.summary}
          </p>
        </div>
        <EvidenceBadge
          detail={String(section.items.length)}
          kind={section.items.length > 0 ? "evidence" : "uncertainty"}
          label="Items"
        />
      </div>

      {section.items.length > 0 ? (
        <div className="mt-4 space-y-3">
          {section.items.map((item) => (
            <ReportItemRow item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          description="This section has no retrieved radar evidence in the selected window."
          title="No section evidence"
        />
      )}

      {section.caveats.length > 0 || section.missing_evidence.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <InlineList items={section.caveats} label="Section caveats" tone="caution" />
          <InlineList
            items={section.missing_evidence}
            label="Section missing evidence"
            tone="risk"
          />
        </div>
      ) : null}
    </section>
  );
}

function ReportItemsSection({
  empty,
  items,
  title
}: {
  empty: string;
  items: ReportPreviewItem[];
  title: string;
}) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <h2 className="text-lg font-semibold text-radar-ink">{title}</h2>
      {items.length > 0 ? (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <ReportItemRow item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-radar-muted">{empty}</p>
      )}
    </section>
  );
}

function ReportItemRow({ item }: { item: ReportPreviewItem }) {
  return (
    <article className="rounded-md border border-radar-line bg-radar-panel p-4">
      <div className="flex flex-wrap gap-2">
        <StatusChip label={item.status} tone={statusTone(item.status)} />
        <StatusChip
          label="Confidence"
          tone={confidenceTone(item)}
          value={formatPercent(item.confidence)}
        />
        <EvidenceBadge
          detail={formatScore(item.overall_score)}
          kind="evidence"
          label="Overall"
        />
        <EvidenceBadge detail={item.source_tier} kind="citation" label="Tier" />
      </div>
      <h3 className="mt-3 text-base font-semibold leading-7 text-radar-ink">
        <a
          className="hover:text-radar-evidence"
          href={item.url}
          rel="noreferrer"
          target="_blank"
        >
          {item.title}
        </a>
      </h3>
      <p className="mt-2 text-sm leading-6 text-radar-muted">{item.summary}</p>
      {item.why_it_matters ? (
        <p className="mt-2 text-sm leading-6 text-radar-muted">
          <span className="font-semibold text-radar-ink">Why it matters: </span>
          {item.why_it_matters}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <EvidenceBadge detail={item.source_name} kind="citation" label="Source" />
        <EvidenceBadge
          detail={formatTimestamp(item.timestamp)}
          kind="freshness"
          label="Timestamp"
        />
        {item.categories.map((category) => (
          <StatusChip key={category} label={category.replace(/_/g, " ")} tone="neutral" />
        ))}
      </div>
    </article>
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
            <li
              className="rounded-md border border-radar-line bg-radar-panel px-3 py-2"
              key={item}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-radar-muted">
          No notes returned for this preview.
        </p>
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

function statusTone(status: ReportPreviewItem["status"]): StatusTone {
  if (status === "included") {
    return "evidence";
  }

  if (status === "needs_review") {
    return "caution";
  }

  return "risk";
}

function confidenceTone(item: ReportPreviewItem): StatusTone {
  if (item.status === "needs_review") {
    return "caution";
  }

  if (item.confidence >= 0.75) {
    return "success";
  }

  if (item.confidence >= 0.55) {
    return "caution";
  }

  return "risk";
}

function formatTimestamp(value: string) {
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
