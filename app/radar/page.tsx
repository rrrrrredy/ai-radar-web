import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EmptyState } from "@/components/empty-state";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { citationFromItem } from "@/lib/retrieval/citations";
import {
  itemEvidenceTimestamp,
  loadRadarFeed,
  type RadarFeed
} from "@/lib/radar/feed";
import type { RetrievalLanguage, RetrievalRadarItem } from "@/lib/retrieval/types";
import {
  RADAR_CATEGORIES,
  UNDERSTANDING_STATUSES,
  type RadarCategory,
  type UnderstandingStatus
} from "@/lib/understanding/types";
import { formatPercent, formatScore } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

type RadarFilters = {
  status: "all" | UnderstandingStatus;
  category: "all" | RadarCategory;
  sourceTier: "all" | string;
  language: "all" | RetrievalLanguage;
  window: "all" | "24h" | "7d" | "30d";
};

const languageOptions: RetrievalLanguage[] = ["zh", "en", "mixed", "unknown"];
const windowOptions: Array<{ value: RadarFilters["window"]; label: string }> = [
  { value: "all", label: "All available" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" }
];

export default async function RadarPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const feed = await loadRadarFeed();
  const filters = readFilters(params, feed);
  const filteredItems = filterItems(feed.items, filters, feed);
  const filteredCitations = filteredItems
    .filter((item) => item.status === "included" || item.status === "needs_review")
    .map(citationFromItem)
    .slice(0, 12);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceChip detail="read-only" source={feed.data_source} />
            <EvidenceBadge
              detail={String(feed.counts.total)}
              kind="evidence"
              label="Retrieved"
            />
            <StatusChip label="Live DeepSeek" tone="caution" value="not run" />
            <StatusChip label="Supabase writes" tone="risk" value="not run" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">Radar</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            Usable radar list over the currently available retrieval evidence.
            It discloses source, freshness, uncertainty, review status, and
            citations before treating any item as report-ready signal.
          </p>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            Data source and freshness
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <RailRow label="Freshness" value={feed.freshness_note} />
            <RailRow
              label="Latest processed"
              value={feed.processed_at ?? "not available"}
            />
            <RailRow
              label="Generated from evidence"
              value={feed.generated_at}
            />
            <RailRow
              label="Current filter result"
              value={`${filteredItems.length} of ${feed.counts.total} item(s)`}
            />
          </dl>
        </aside>
      </section>

      <CountRail feed={feed} filteredCount={filteredItems.length} />

      <section className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">Filters</h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              Query-param filters are applied server-side and do not change the
              retrieval source.
            </p>
          </div>
          <a
            className="rounded-md border border-radar-line px-3 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
            href="/radar"
          >
            Reset
          </a>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-5" method="get">
          <SelectField
            label="Status"
            name="status"
            options={[
              { label: "All statuses", value: "all" },
              ...UNDERSTANDING_STATUSES.map((status) => ({
                label: status,
                value: status
              }))
            ]}
            value={filters.status}
          />
          <SelectField
            label="Category"
            name="category"
            options={[
              { label: "All categories", value: "all" },
              ...RADAR_CATEGORIES.map((category) => ({
                label: categoryLabel(category),
                value: category
              }))
            ]}
            value={filters.category}
          />
          <SelectField
            label="Source tier"
            name="source_tier"
            options={[
              { label: "All tiers", value: "all" },
              ...Object.keys(feed.counts.by_source_tier)
                .sort()
                .map((tier) => ({ label: tier, value: tier }))
            ]}
            value={filters.sourceTier}
          />
          <SelectField
            label="Language"
            name="language"
            options={[
              { label: "All languages", value: "all" },
              ...languageOptions.map((language) => ({
                label: language,
                value: language
              }))
            ]}
            value={filters.language}
          />
          <SelectField
            label="Time window"
            name="window"
            options={windowOptions}
            value={filters.window}
          />
          <div className="md:col-span-5">
            <button
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              type="submit"
            >
              Apply filters
            </button>
          </div>
        </form>
      </section>

      {feed.caveats.length > 0 ? (
        <section className="rounded-lg border border-radar-caution/30 bg-radar-caution/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <EvidenceBadge kind="uncertainty" label="Caveats" />
            <StatusChip label="Completeness" tone="caution" value="not claimed" />
          </div>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-radar-muted">
            {feed.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Radar evidence list" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              Evidence rows
            </h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              Dense rows keep source, status, confidence, timing, and citation
              visible next to the claim.
            </p>
          </div>
          <StatusChip
            label="Visible items"
            tone={filteredItems.length > 0 ? "evidence" : "caution"}
            value={filteredItems.length}
          />
        </div>

        {filteredItems.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-radar-line bg-white shadow-soft">
            {filteredItems.map((item, index) => (
              <RadarItemRow index={index} item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            description="No radar rows match the selected filters. Reset filters or widen the time window to inspect the available evidence."
            title="No matching radar evidence"
          />
        )}
      </section>

      <CitationList
        citations={filteredCitations}
        emptyMessage="No included or needs_review citations are visible under the current filters."
        title="Visible citations"
      />
    </div>
  );
}

function CountRail({
  feed,
  filteredCount
}: {
  feed: RadarFeed;
  filteredCount: number;
}) {
  return (
    <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Total retrieved items" value={feed.counts.total} />
        <Metric label="Visible after filters" value={filteredCount} />
        <Metric label="Included" tone="evidence" value={feed.counts.included} />
        <Metric label="needs_review" tone="caution" value={feed.counts.needs_review} />
        <Metric label="Excluded" tone="risk" value={feed.counts.excluded} />
        <Metric label="Failed" tone="risk" value={feed.counts.failed} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <CountGroup
          counts={feed.counts.by_category}
          title="Categories"
          valueLabel={categoryLabel}
        />
        <CountGroup counts={feed.counts.by_source_tier} title="Source tiers" />
        <CountGroup counts={feed.counts.by_source} title="Sources" />
      </div>
    </section>
  );
}

function Metric({
  label,
  tone = "neutral",
  value
}: {
  label: string;
  tone?: StatusTone;
  value: number;
}) {
  return (
    <div className="rounded-md border border-radar-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${metricToneClass(tone)}`}>
        {value}
      </p>
    </div>
  );
}

function CountGroup({
  counts,
  title,
  valueLabel = (value: string) => value
}: {
  counts: Record<string, number> | Partial<Record<string, number>>;
  title: string;
  valueLabel?: (value: string) => string;
}) {
  const entries = Object.entries(counts)
    .filter(([, count]) => Boolean(count))
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, 8);

  return (
    <div className="rounded-md border border-radar-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
        {title}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {entries.length > 0 ? (
          entries.map(([label, count]) => (
            <StatusChip
              key={label}
              label={valueLabel(label)}
              tone="neutral"
              value={count}
            />
          ))
        ) : (
          <StatusChip label="none" tone="neutral" />
        )}
      </div>
    </div>
  );
}

function RadarItemRow({
  index,
  item
}: {
  index: number;
  item: RetrievalRadarItem;
}) {
  const summary = item.summary_en || item.summary_zh || "No summary available.";
  const timestampLabel = item.published_at
    ? "Published"
    : item.collected_at
      ? "Collected"
      : "Processed";
  const timestamp = itemEvidenceTimestamp(item);

  return (
    <article className="border-t border-radar-line p-4 first:border-t-0">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-radar-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <StatusChip label={item.status} tone={statusTone(item.status)} />
            <StatusChip
              label="Confidence"
              tone={confidenceTone(item)}
              value={formatPercent(item.confidence)}
            />
            <EvidenceBadge
              detail={formatScore(item.overall_score)}
              kind={item.status === "needs_review" ? "needs_review" : "evidence"}
              label="Overall"
            />
            <EvidenceBadge
              detail={item.source_tier}
              kind="citation"
              label="Tier"
            />
          </div>

          <h2 className="mt-3 text-lg font-semibold leading-7 text-radar-ink">
            <a
              className="hover:text-radar-evidence"
              href={item.url}
              rel="noreferrer"
              target="_blank"
            >
              {item.title}
            </a>
          </h2>

          <p className="mt-2 text-sm leading-6 text-radar-muted">{summary}</p>

          {item.why_it_matters ? (
            <div className="mt-3 rounded-md border border-radar-evidence/20 bg-radar-evidence/5 px-3 py-2 text-sm leading-6 text-radar-muted">
              <span className="font-semibold text-radar-ink">Why it matters: </span>
              {item.why_it_matters}
            </div>
          ) : null}

          {item.status === "needs_review" ? (
            <p className="mt-3 rounded-md border border-radar-caution/30 bg-radar-caution/5 px-3 py-2 text-sm leading-6 text-radar-caution">
              This row is marked needs_review and should not be treated as
              confirmed without human review.
            </p>
          ) : null}

          {item.status === "excluded" || item.status === "failed" ? (
            <p className="mt-3 rounded-md border border-radar-risk/30 bg-radar-risk/5 px-3 py-2 text-sm leading-6 text-radar-risk">
              {item.exclusion_reason
                ? `Not report evidence: ${item.exclusion_reason}.`
                : "Not report evidence under the current understanding status."}
            </p>
          ) : null}
        </div>

        <aside className="rounded-md border border-radar-line bg-radar-panel p-3">
          <div className="flex flex-wrap gap-2">
            <EvidenceBadge detail={item.source_name} kind="citation" label="Source" />
            <EvidenceBadge
              detail={formatTimestamp(timestamp)}
              kind="freshness"
              label={timestampLabel}
            />
            <StatusChip label={item.language} tone="neutral" />
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <RailRow label="Processed" value={formatTimestamp(item.processed_at)} />
            <RailRow label="Collected" value={formatTimestamp(item.collected_at)} />
            <RailRow
              label="Published"
              value={item.published_at ? formatTimestamp(item.published_at) : "not provided"}
            />
            <RailRow
              label="Scores"
              value={`cred ${formatScore(item.credibility_score)} / novelty ${formatScore(item.novelty_score)} / importance ${formatScore(item.importance_score)}`}
            />
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.categories.map((category) => (
              <EvidenceBadge
                detail={categoryLabel(category)}
                kind="evidence"
                key={category}
                label="Category"
              />
            ))}
            {item.tags.slice(0, 4).map((tag) => (
              <StatusChip key={tag} label={tag} tone="neutral" />
            ))}
          </div>
          <a
            className="mt-3 inline-block break-all text-sm font-semibold text-radar-evidence hover:text-radar-admin"
            href={item.url}
            rel="noreferrer"
            target="_blank"
          >
            Open citation
          </a>
        </aside>
      </div>
    </article>
  );
}

function SelectField({
  label,
  name,
  options,
  value
}: {
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="block" htmlFor={`radar-filter-${name}`}>
      <span className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
        {label}
      </span>
      <select
        className="mt-2 w-full rounded-md border border-radar-line bg-white px-3 py-2 text-sm text-radar-ink outline-none focus:border-radar-evidence"
        defaultValue={value}
        id={`radar-filter-${name}`}
        name={name}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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

function readFilters(params: SearchParams, feed: RadarFeed): RadarFilters {
  return {
    status: readOption(firstParam(params.status), ["all", ...UNDERSTANDING_STATUSES], "all"),
    category: readOption(firstParam(params.category), ["all", ...RADAR_CATEGORIES], "all"),
    sourceTier: readOption(
      firstParam(params.source_tier),
      ["all", ...Object.keys(feed.counts.by_source_tier)],
      "all"
    ),
    language: readOption(firstParam(params.language), ["all", ...languageOptions], "all"),
    window: readOption(
      firstParam(params.window),
      windowOptions.map((option) => option.value),
      "all"
    )
  };
}

function filterItems(
  items: RetrievalRadarItem[],
  filters: RadarFilters,
  feed: RadarFeed
) {
  const anchor = Date.parse(
    feed.freshness.latestTimestamp ??
      feed.processed_at ??
      feed.collected_at ??
      feed.generated_at
  );

  return items.filter((item) => {
    if (filters.status !== "all" && item.status !== filters.status) {
      return false;
    }

    if (filters.category !== "all" && !item.categories.includes(filters.category)) {
      return false;
    }

    if (filters.sourceTier !== "all" && item.source_tier !== filters.sourceTier) {
      return false;
    }

    if (filters.language !== "all" && item.language !== filters.language) {
      return false;
    }

    if (filters.window !== "all" && Number.isFinite(anchor)) {
      const timestamp = Date.parse(itemEvidenceTimestamp(item));
      const duration = filters.window === "24h" ? 1 : filters.window === "7d" ? 7 : 30;
      const start = anchor - duration * 24 * 60 * 60 * 1000;

      if (!Number.isFinite(timestamp) || timestamp < start || timestamp > anchor) {
        return false;
      }
    }

    return true;
  });
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readOption<T extends string>(
  value: string | undefined,
  options: readonly T[],
  fallback: T
) {
  return options.includes(value as T) ? (value as T) : fallback;
}

function statusTone(status: UnderstandingStatus): StatusTone {
  if (status === "included") {
    return "evidence";
  }

  if (status === "needs_review") {
    return "caution";
  }

  return "risk";
}

function confidenceTone(item: RetrievalRadarItem): StatusTone {
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

function metricToneClass(tone: StatusTone) {
  if (tone === "evidence") {
    return "text-radar-evidence";
  }

  if (tone === "caution") {
    return "text-radar-caution";
  }

  if (tone === "risk") {
    return "text-radar-risk";
  }

  return "text-radar-ink";
}

function categoryLabel(category: string) {
  return category.replace(/_/g, " ");
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
