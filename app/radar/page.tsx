import Link from "next/link";

import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EmptyState } from "@/components/empty-state";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { RadarSavedFilters } from "@/components/radar-saved-filters";
import { citationFromItem } from "@/lib/retrieval/citations";
import {
  buildEventLayer,
  filterPublicDisplayEventLayer,
  type PublicEventCluster
} from "@/lib/events/clustering";
import {
  type PublicDataCompletenessSummary
} from "@/lib/data-completeness/types";
import { loadPublicSafeDataCompletenessSummary } from "@/lib/data-completeness/public-safe-summary";
import {
  itemEvidenceTimestamp,
  loadRadarFeed,
  type RadarFeed
} from "@/lib/radar/feed";
import { matchesEntityCandidate } from "@/lib/radar/entities";
import {
  buildEntitySummaries,
  entityHref,
  entityTrackingInsight,
  type EntitySummary
} from "@/lib/radar/entity-insights";
import { labelize, sourceFamily } from "@/lib/product/data-summary";
import { evidenceFreshnessStatus } from "@/lib/product/freshness";
import type { RetrievalLanguage, RetrievalRadarItem } from "@/lib/retrieval/types";
import {
  RADAR_CATEGORIES,
  UNDERSTANDING_STATUSES,
  type RadarCategory,
  type UnderstandingStatus
} from "@/lib/understanding/types";
import { formatPercent, formatScore } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type RadarFilters = {
  status: "all" | UnderstandingStatus;
  category: "all" | RadarCategory;
  categories: RadarCategory[];
  sourceFamily: "all" | string;
  sourceTier: "all" | string;
  language: "all" | RetrievalLanguage;
  window: "all" | "24h" | "7d" | "30d";
  entity: string;
  query: string;
};

const languageOptions: RetrievalLanguage[] = ["zh", "en", "mixed", "unknown"];
const windowOptions: Array<{ value: RadarFilters["window"]; label: string }> = [
  { value: "all", label: "全部时间" },
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" }
];

export default async function RadarPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const feed = await loadRadarFeed();
  const coverage = await loadPublicSafeDataCompletenessSummary(feed);
  const entitySummaries = buildEntitySummaries(feed.items);
  const filters = readFilters(params, feed);
  const rawFilteredItems = filterItems(feed.items, filters, feed);
  const eventLayer = filterPublicDisplayEventLayer(buildEventLayer(
    feed.items.map((item) => ({
      categories: item.categories,
      collected_at: item.collected_at,
      confidence: item.confidence,
      entities: item.entities,
      evidence_notes: item.evidence_notes,
      id: item.id,
      language: item.language,
      processed_at: item.processed_at,
      published_at: item.published_at,
      scores: {
        ai_relevance: item.ai_relevance_score,
        credibility: item.credibility_score,
        freshness: item.freshness_score,
        importance: item.importance_score,
        novelty: item.novelty_score,
        overall: item.overall_score
      },
      source_name: item.source_name,
      source_tier: item.source_tier,
      status: item.status,
      summary_en: item.summary_en,
      summary_zh: item.summary_zh,
      tags: item.tags,
      title: item.title,
      url: item.url,
      why_it_matters: item.why_it_matters
    }))
  ));
  const eventItemIds = new Set(eventLayer.event_cluster_items.map((item) => item.radar_item_id));
  const eventEligibleItems = rawFilteredItems.filter((item) => eventItemIds.has(item.id));
  const downgradedFilteredCount = rawFilteredItems.length - eventEligibleItems.length;
  const filteredCitations = eventEligibleItems
    .filter((item) => item.status === "included" || item.status === "needs_review")
    .map(citationFromItem)
    .slice(0, 12);
  const freshness = evidenceFreshnessStatus(feed.freshness.latestTimestamp);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceChip detail="只读" source={feed.data_source} />
            <EvidenceBadge
              detail={String(feed.counts.total)}
              kind="evidence"
              label="已检索"
            />
            <StatusChip label="DeepSeek 理解" tone="evidence" value="证据摘要" />
            <StatusChip label="公开字段" tone="success" value="已脱敏" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">事件雷达</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            默认先看事件层，再进入全部信号。每个事件展示来源数、来源家族、分数、时间线和引用。
          </p>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            数据来源与新鲜度
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <RailRow label="数据来源" value={dataSourceLabel(feed.data_source)} />
            <RailRow label="新鲜度" value={feed.freshness_note} />
            <RailRow
              label="最新处理"
              value={formatOptionalTimestamp(feed.processed_at)}
            />
            <RailRow
              label="生成时间"
              value={feed.generated_at}
            />
            <RailRow
              label="当前筛选结果"
              value={`${eventEligibleItems.length} 条事件信号 / ${rawFilteredItems.length} 条公开信号`}
            />
            <RailRow label="事件聚类" value={`${eventLayer.event_count} 个事件`} />
          </dl>
        </aside>
      </section>

      {freshness.warning ? <DataFreshnessAlert warning={freshness.warning} /> : null}

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-radar-ink">行业精选</h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              事件层合并相似信号；原始条目仍在下方“全部信号”保留。
            </p>
          </div>
          <StatusChip label="事件数" tone="evidence" value={eventLayer.event_count} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {eventLayer.curated_events.slice(0, 8).map((event) => (
            <article className="rounded-lg border border-radar-line bg-radar-panel p-4" key={event.event_cluster_id}>
              <div className="flex flex-wrap gap-2">
                <StatusChip label={event.event_score_label} tone={event.event_score_label === "高优先级" ? "success" : "evidence"} />
                <EvidenceBadge detail={String(event.event_score)} kind="evidence" label="分数" />
                <EvidenceBadge detail={String(event.source_count)} kind="citation" label="来源" />
                <EvidenceBadge detail={String(event.related_item_ids.length)} kind="freshness" label="信号" />
              </div>
              <h3 className="mt-3 text-base font-semibold leading-7 text-radar-ink">{event.canonical_title}</h3>
              <p className="mt-2 text-sm leading-6 text-radar-muted">{event.summary_zh}</p>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                <strong className="text-radar-ink">产业影响：</strong>
                {eventImpactNote(event)}
              </p>
              <p className="mt-1 text-sm leading-6 text-radar-muted">
                <strong className="text-radar-ink">观察点：</strong>
                {eventWatchNote(event)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {event.source_families.slice(0, 4).map((family) => (
                  <StatusChip key={family} label={family} tone="neutral" />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <CountRail coverage={coverage} feed={feed} filteredCount={rawFilteredItems.length} />
      <ReaderIntentTabs feed={feed} filters={filters} />
      <CategoryTabs feed={feed} filters={filters} />
      <EvidenceToInsightPanel
        entities={entitySummaries.slice(0, 4)}
        filteredCount={eventEligibleItems.length}
      />

      <section className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">筛选</h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              查询参数在服务端应用，不会改变检索来源。
            </p>
          </div>
          <a
            className="rounded-md border border-radar-line px-3 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
            href="/radar"
          >
            重置
          </a>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-6" method="get">
          <label className="block md:col-span-2" htmlFor="radar-filter-q">
            <span className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
              搜索
            </span>
            <input
              className="mt-2 w-full rounded-md border border-radar-line bg-white px-3 py-2 text-sm text-radar-ink outline-none focus:border-radar-evidence"
              defaultValue={filters.query}
              id="radar-filter-q"
              name="q"
              type="search"
            />
          </label>
          <label className="block" htmlFor="radar-filter-entity">
            <span className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
              实体
            </span>
            <input
              className="mt-2 w-full rounded-md border border-radar-line bg-white px-3 py-2 text-sm text-radar-ink outline-none focus:border-radar-evidence"
              defaultValue={filters.entity}
              id="radar-filter-entity"
              name="entity"
              placeholder="公司 / 模型 / 项目"
              type="search"
            />
          </label>
          <SelectField
            label="状态"
            name="status"
            options={[
              { label: "全部状态", value: "all" },
              ...UNDERSTANDING_STATUSES.map((status) => ({
                label: statusLabel(status),
                value: status
              }))
            ]}
            value={filters.status}
          />
          <SelectField
            label="类别"
            name="category"
            options={categorySelectOptions(filters)}
            value={categorySelectValue(filters)}
          />
          <SelectField
            label="来源家族"
            name="source_family"
            options={[
              { label: "全部家族", value: "all" },
              ...sourceFamilyOptions(feed).map((family) => ({
                label: family,
                value: family
              }))
            ]}
            value={filters.sourceFamily}
          />
          <SelectField
            label="来源层级"
            name="source_tier"
            options={[
              { label: "全部层级", value: "all" },
              ...Object.keys(feed.counts.by_source_tier)
                .sort()
                .map((tier) => ({ label: tier, value: tier }))
            ]}
            value={filters.sourceTier}
          />
          <SelectField
            label="语言"
            name="language"
            options={[
              { label: "全部语言", value: "all" },
              ...languageOptions.map((language) => ({
                label: language,
                value: language
              }))
            ]}
            value={filters.language}
          />
          <SelectField
            label="时间窗口"
            name="window"
            options={windowOptions}
            value={filters.window}
          />
          <div className="md:col-span-6">
            <button
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              type="submit"
            >
              应用筛选
            </button>
          </div>
        </form>
      </section>

      <RadarSavedFilters
        currentSearch={currentFilterSearch(filters)}
        defaultName={savedFilterDefaultName(filters)}
      />

      {feed.caveats.length > 0 ? (
        <section className="rounded-lg border border-radar-caution/30 bg-radar-caution/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <EvidenceBadge kind="uncertainty" label="注意事项" />
            <StatusChip label="完整性" tone="caution" value="不声称完整" />
          </div>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-radar-muted">
            {feed.caveats.map((caveat) => (
              <li key={caveat}>{publicText(caveat)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="雷达证据列表" className="space-y-3" id="radar-evidence-list">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-radar-ink">
              全部信号
            </h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              展示当前筛选命中的全部公开信号；低事件性条目保留用于审计，但不进入事件列表和精选判断。
            </p>
          </div>
          <StatusChip
            label="可见条目"
            tone={rawFilteredItems.length > 0 ? "evidence" : "caution"}
            value={rawFilteredItems.length}
          />
        </div>

        {downgradedFilteredCount > 0 ? (
          <div className="rounded-lg border border-radar-caution/40 bg-radar-caution/5 p-4 text-sm leading-6 text-radar-muted">
            其中 {downgradedFilteredCount} 条为低事件性审计信号；它们在下方继续可见，但不进入事件列表、精选判断或事件引用栏。
          </div>
        ) : null}

        {rawFilteredItems.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-radar-line bg-white shadow-soft">
            {rawFilteredItems.map((item, index) => (
              <RadarItemRow index={index} item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            description="没有雷达条目匹配当前筛选。请重置筛选或放宽时间窗口。"
            title="没有匹配的雷达证据"
          />
        )}
      </section>

      <CitationList
        citations={filteredCitations}
        emptyMessage="当前筛选下没有已纳入或待复核的引用。"
        title="可见引用"
      />
    </div>
  );
}

function CountRail({
  coverage,
  feed,
  filteredCount
}: {
  coverage: PublicDataCompletenessSummary;
  feed: RadarFeed;
  filteredCount: number;
}) {
  return (
    <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="公开雷达条目" value={feed.counts.total} />
        <Metric label="筛选后可见" value={filteredCount} />
        <Metric label="已纳入" tone="evidence" value={feed.counts.included} />
        <Metric label="待复核" tone="caution" value={feed.counts.needs_review} />
        <Metric label="已排除" tone="risk" value={feed.counts.excluded} />
        <Metric label="失败" tone="risk" value={feed.counts.failed} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="来源总数" value={coverage.sourcesTotal} />
        <Metric label="自动合格" value={coverage.automatedEligibleSources} />
        <Metric label="已尝试来源" tone="evidence" value={coverage.attemptedSources} />
        <Metric label="公开来源" tone="evidence" value={coverage.sourcesWithPublicItems ?? 0} />
        <Metric label="来源覆盖率" value={coverage.rates.sourcePublicVisibility === null ? "待补" : formatPercent(coverage.rates.sourcePublicVisibility)} />
        <Metric label="失败/跳过来源" tone="risk" value={coverage.failedSources + coverage.skippedSources} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <CountGroup
          counts={feed.counts.by_category}
          title="类别"
          valueLabel={labelize}
        />
        <CountGroup counts={sourceFamilyCounts(feed.items)} title="来源家族" />
        <CountGroup counts={feed.counts.by_source_tier} title="来源层级" />
        <CountGroup counts={feed.counts.by_source} title="来源" />
      </div>
    </section>
  );
}

function CategoryTabs({ feed, filters }: { feed: RadarFeed; filters: RadarFilters }) {
  const categories = Object.entries(feed.counts.by_category)
    .filter((entry): entry is [RadarCategory, number] => Boolean(entry[0]) && Number(entry[1]) > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8);
  const baseParams = baseFilterParams(filters);
  const hasCategoryFilter = filters.categories.length > 0;
  const categoryLabel =
    filters.categories.length === 0
      ? "全部"
      : filters.categories.length === 1
        ? labelize(filters.categories[0])
        : `${filters.categories.length} 类`;

  return (
    <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-radar-ink">类别标签</h2>
          <p className="mt-1 text-sm leading-6 text-radar-muted">
            按信号类别浏览当前可见的公开检索集合。
          </p>
        </div>
        <StatusChip
          label="已选择"
          tone={hasCategoryFilter ? "evidence" : "neutral"}
          value={categoryLabel}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <CategoryTab
          count={feed.counts.total}
          href={`/radar${queryString(baseParams, "category", null)}`}
          isSelected={!hasCategoryFilter}
          label="全部"
        />
        {categories.map(([category, count]) => (
          <CategoryTab
            count={count}
            href={`/radar${queryString(baseParams, "category", category)}`}
            isSelected={filters.categories.length === 1 && filters.categories[0] === category}
            key={category}
            label={labelize(category)}
          />
        ))}
      </div>
    </section>
  );
}

function CategoryTab({
  count,
  href,
  isSelected,
  label
}: {
  count: number;
  href: string;
  isSelected: boolean;
  label: string;
}) {
  return (
    <a
      aria-current={isSelected ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
        isSelected
          ? "border-radar-evidence bg-radar-evidence/10 text-radar-evidence"
          : "border-radar-line bg-white text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
      }`}
      href={href}
    >
      <span>{label}</span>
      <span className="font-mono text-xs opacity-75">{count}</span>
    </a>
  );
}

function Metric({
  label,
  tone = "neutral",
  value
}: {
  label: string;
  tone?: StatusTone;
  value: number | string;
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
          <StatusChip label="无" tone="neutral" />
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
  const summary = item.summary_zh || item.summary_en || "暂无摘要。";
  const timestampLabel = "发布时间";
  const timestamp = itemEvidenceTimestamp(item);

  return (
    <article className="border-t border-radar-line p-4 first:border-t-0">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-radar-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <StatusChip label={statusLabel(item.status)} tone={statusTone(item.status)} />
            <StatusChip
              label="置信度"
              tone={confidenceTone(item)}
              value={formatPercent(item.confidence)}
            />
            <EvidenceBadge
              detail={formatScore(item.overall_score)}
              kind={item.status === "needs_review" ? "needs_review" : "evidence"}
              label="综合"
            />
            <EvidenceBadge
              detail={item.source_tier}
              kind="citation"
              label="层级"
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
              <span className="font-semibold text-radar-ink">为什么重要: </span>
              {publicText(item.why_it_matters)}
            </div>
          ) : null}

          {item.status === "needs_review" ? (
            <p className="mt-3 rounded-md border border-radar-caution/30 bg-radar-caution/5 px-3 py-2 text-sm leading-6 text-radar-caution">
              此条目标记为待复核，未经人工确认前不应视为已确认结论。
            </p>
          ) : null}

          {item.status === "excluded" || item.status === "failed" ? (
            <p className="mt-3 rounded-md border border-radar-risk/30 bg-radar-risk/5 px-3 py-2 text-sm leading-6 text-radar-risk">
              {item.exclusion_reason
                ? `不作为事件判断证据：${item.exclusion_reason}。`
                : "在当前理解状态下不作为事件判断证据。"}
            </p>
          ) : null}
        </div>

        <aside className="rounded-md border border-radar-line bg-radar-panel p-3">
          <div className="flex flex-wrap gap-2">
            <EvidenceBadge detail={item.source_name} kind="citation" label="来源" />
            <EvidenceBadge
              detail={formatTimestamp(timestamp)}
              kind="freshness"
              label={timestampLabel}
            />
            <StatusChip label={item.language} tone="neutral" />
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <RailRow label="处理时间" value={formatTimestamp(item.processed_at)} />
            <RailRow label="采集时间" value={formatTimestamp(item.collected_at)} />
            <RailRow
              label="发布时间"
              value={item.published_at ? formatTimestamp(item.published_at) : "未提供"}
            />
            <RailRow
              label="评分"
              value={`可信度 ${formatScore(item.credibility_score)} / 新颖度 ${formatScore(item.novelty_score)} / 重要性 ${formatScore(item.importance_score)}`}
            />
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.categories.map((category) => (
              <EvidenceBadge
                detail={labelize(category)}
                kind="evidence"
                key={category}
                label="类别"
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
            打开引用
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

function categorySelectOptions(filters: RadarFilters) {
  const currentGroup =
    filters.categories.length > 1
      ? [
          {
            label: `当前分组：${filters.categories.map(labelize).join(" + ")}`,
            value: categoryQueryValue(filters.categories)
          }
        ]
      : [];

  return [
    { label: "全部类别", value: "all" },
    ...currentGroup,
    ...RADAR_CATEGORIES.map((category) => ({
      label: labelize(category),
      value: category
    }))
  ];
}

function categorySelectValue(filters: RadarFilters) {
  return filters.categories.length > 1 ? categoryQueryValue(filters.categories) : filters.category;
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
  const categories = readCategoryFilters(firstParam(params.category));

  return {
    status: readOption(firstParam(params.status), ["all", ...UNDERSTANDING_STATUSES], "all"),
    category: categories.length === 1 ? categories[0] : "all",
    categories,
    sourceFamily: readOption(
      firstParam(params.source_family),
      ["all", ...sourceFamilyOptions(feed)],
      "all"
    ),
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
    ),
    entity: normalizeSearch(firstParam(params.entity)),
    query: normalizeSearch(firstParam(params.q))
  };
}

function EvidenceToInsightPanel({
  entities,
  filteredCount
}: {
  entities: EntitySummary[];
  filteredCount: number;
}) {
  return (
    <section className="scroll-mt-32 rounded-lg border border-radar-line bg-white p-5 shadow-soft" id="evidence-to-insight">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">从证据到洞察</h2>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            AI Radar 的核心路径是先看公开信号，再判断实体是否值得跟踪，并持续核对事件与来源。
          </p>
        </div>
        <StatusChip label="当前信号" tone={filteredCount > 0 ? "evidence" : "caution"} value={filteredCount} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InsightStep
          detail={`${filteredCount} 条筛选后信号`}
          href="#radar-evidence-list"
          label="1. 证据"
          text="先确认这批公开信号是否新鲜、可信、可引用。"
        />
        <InsightStep
          detail={`${entities.length} 个跟踪实体`}
          href="/entities"
          label="2. 实体"
          text="把零散信号聚合到公司、模型、产品、论文和项目。"
        />
        <InsightStep
          detail="合并重复信号"
          href="/radar"
          label="3. 事件聚类"
          text="把同一主题的重复信号合并为可追踪事件，并保留来源边界。"
        />
        <InsightStep
          detail="实体与来源"
          href="/entities"
          label="4. 持续跟踪"
          text="围绕实体、来源和时间线继续核对变化，不把单一信号写成确定结论。"
        />
      </div>

      {entities.length > 0 ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {entities.map((entity) => {
            const insight = entityTrackingInsight(entity);

            return (
              <article className="rounded-lg border border-radar-line bg-radar-panel p-4" key={`${entity.type}:${entity.name}`}>
                <div className="flex flex-wrap gap-2">
                  <StatusChip label={insight.priorityLabel} tone={insight.priorityScore >= 80 ? "success" : "evidence"} />
                  <StatusChip label={entity.name} tone="neutral" />
                  <EvidenceBadge detail={String(entity.totalSignals)} kind="evidence" label="信号" />
                  <EvidenceBadge detail={String(entity.sourceCounts.size)} kind="citation" label="来源" />
                </div>
                <p className="mt-3 text-sm leading-6 text-radar-muted">{insight.reasons[0]}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    className="rounded-md bg-radar-ink px-3 py-2 text-sm font-semibold text-white hover:bg-black"
                    href={entityHref(entity)}
                  >
                    打开详情
                  </Link>
                  <Link
                    className="rounded-md border border-radar-line bg-white px-3 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
                    href={`/radar?entity=${encodeURIComponent(entity.name)}`}
                  >
                    查看相关信号
                  </Link>
                  <Link
                    className="rounded-md border border-radar-line bg-white px-3 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
                    href="/radar#evidence-to-insight"
                  >
                    事件路径
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function ReaderIntentTabs({ feed, filters }: { feed: RadarFeed; filters: RadarFilters }) {
  const baseParams = baseFilterParams(filters);
  const groups: Array<{
    categories: RadarCategory[];
    description: string;
    label: string;
  }> = [
    {
      categories: ["model_release", "product_update", "agent"],
      description: "先看今日强信号和事件层。",
      label: "热点"
    },
    {
      categories: ["model_release", "benchmark"],
      description: "模型发布、基准、能力边界。",
      label: "模型"
    },
    {
      categories: ["agent", "product_update"],
      description: "Agent、产品更新、工作流。",
      label: "产品/Agent"
    },
    {
      categories: ["open_source", "infrastructure"],
      description: "开源项目、开发者工具、基础设施。",
      label: "开发者/开源"
    },
    {
      categories: ["research"],
      description: "论文、研究路线、早期技术信号。",
      label: "论文/技术"
    },
    {
      categories: ["business", "funding", "regulation", "safety"],
      description: "商业化、融资、监管和政策。",
      label: "商业/监管"
    },
    {
      categories: ["safety"],
      description: "安全、风险、治理信号。",
      label: "安全"
    },
    {
      categories: ["media_interview", "opinion"],
      description: "访谈、观点和社区讨论。",
      label: "社区"
    }
  ];

  return (
    <section className="rounded-lg border border-radar-line bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-radar-ink">读者视角分类</h2>
          <p className="mt-1 text-sm leading-6 text-radar-muted">
            分类面向“我要判断什么”，下方仍保留原始 category 标签供精确筛选。
          </p>
        </div>
        <StatusChip label="分类" tone="evidence" value={groups.length} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => {
          const count = readerCategoryCount(feed, group.categories);
          const href = `/radar${queryString(baseParams, "category", categoryQueryValue(group.categories))}`;
          const selected = sameCategorySet(filters.categories, group.categories);

          return (
            <a
              aria-current={selected ? "page" : undefined}
              className={`rounded-md border p-3 ${
                selected
                  ? "border-radar-evidence bg-radar-evidence/10"
                  : "border-radar-line bg-radar-panel hover:border-radar-evidence"
              }`}
              href={href}
              key={group.label}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-radar-ink">{group.label}</span>
                <StatusChip label="信号" tone={count > 0 ? "success" : "neutral"} value={count} />
              </div>
              <p className="mt-2 text-xs leading-5 text-radar-muted">{group.description}</p>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function readerCategoryCount(feed: RadarFeed, categories: RadarCategory[]) {
  return feed.items.filter((item) => categories.some((category) => item.categories.includes(category))).length;
}

function baseFilterParams(filters: RadarFilters) {
  const baseParams = new URLSearchParams();

  if (filters.status !== "all") {
    baseParams.set("status", filters.status);
  }
  if (filters.categories.length > 0) {
    baseParams.set("category", categoryQueryValue(filters.categories));
  }
  if (filters.sourceFamily !== "all") {
    baseParams.set("source_family", filters.sourceFamily);
  }
  if (filters.sourceTier !== "all") {
    baseParams.set("source_tier", filters.sourceTier);
  }
  if (filters.language !== "all") {
    baseParams.set("language", filters.language);
  }
  if (filters.window !== "all") {
    baseParams.set("window", filters.window);
  }
  if (filters.query) {
    baseParams.set("q", filters.query);
  }
  if (filters.entity) {
    baseParams.set("entity", filters.entity);
  }

  return baseParams;
}

function InsightStep({
  detail,
  href,
  label,
  text
}: {
  detail: string;
  href: string;
  label: string;
  text: string;
}) {
  return (
    <a className="rounded-lg border border-radar-line bg-radar-panel p-4 hover:border-radar-evidence" href={href}>
      <StatusChip label={label} tone="evidence" value={detail} />
      <p className="mt-3 text-sm leading-6 text-radar-muted">{text}</p>
    </a>
  );
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

    if (filters.categories.length > 0 && !filters.categories.some((category) => item.categories.includes(category))) {
      return false;
    }

    if (filters.sourceFamily !== "all" && sourceFamily(item) !== filters.sourceFamily) {
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

    if (filters.query && !matchesSearch(item, filters.query)) {
      return false;
    }

    if (filters.entity && !matchesEntity(item, filters.entity)) {
      return false;
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

function readCategoryFilters(value: string | undefined): RadarCategory[] {
  if (!value || value === "all") {
    return [];
  }

  const categories = value
    .split(",")
    .map((category) => category.trim().toLowerCase().replace(/[\s-]+/g, "_"))
    .filter((category) => category !== "all")
    .filter((category): category is RadarCategory => RADAR_CATEGORIES.includes(category as RadarCategory));

  return Array.from(new Set(categories));
}

function normalizeSearch(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function matchesSearch(item: RetrievalRadarItem, query: string) {
  const needle = query.toLowerCase();
  const haystack = [
    item.title,
    item.summary_en,
    item.summary_zh,
    item.source_name,
    item.source_tier,
    item.why_it_matters,
    ...item.entities.map((entity) => `${entity.name} ${entity.type} ${entity.evidence_text ?? ""}`),
    ...item.categories,
    ...item.tags
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

function matchesEntity(item: RetrievalRadarItem, entityQuery: string) {
  return matchesEntityCandidate(item, entityQuery);
}

function sourceFamilyOptions(feed: RadarFeed) {
  return Object.keys(sourceFamilyCounts(feed.items)).sort();
}

function sourceFamilyCounts(items: RetrievalRadarItem[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const family = sourceFamily(item);
    counts[family] = (counts[family] ?? 0) + 1;
    return counts;
  }, {});
}

function queryString(baseParams: URLSearchParams, key: string, value: string | null) {
  const params = new URLSearchParams(baseParams.toString());

  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }

  const valueString = params.toString();
  return valueString ? `?${valueString}` : "";
}

function currentFilterSearch(filters: RadarFilters) {
  const params = new URLSearchParams();

  if (filters.query) params.set("q", filters.query);
  if (filters.entity) params.set("entity", filters.entity);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.categories.length > 0) params.set("category", categoryQueryValue(filters.categories));
  if (filters.sourceFamily !== "all") params.set("source_family", filters.sourceFamily);
  if (filters.sourceTier !== "all") params.set("source_tier", filters.sourceTier);
  if (filters.language !== "all") params.set("language", filters.language);
  if (filters.window !== "all") params.set("window", filters.window);

  const value = params.toString();
  return value ? `?${value}` : "";
}

function savedFilterDefaultName(filters: RadarFilters) {
  const parts = [
    filters.query ? `搜索:${filters.query}` : "",
    filters.entity ? `实体:${filters.entity}` : "",
    filters.categories.length > 0 ? `类别:${filters.categories.map(labelize).join("+")}` : "",
    filters.status !== "all" ? `状态:${statusLabel(filters.status)}` : "",
    filters.window !== "all" ? windowOptions.find((option) => option.value === filters.window)?.label : ""
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ").slice(0, 40) : "全部雷达视图";
}

function categoryQueryValue(categories: RadarCategory[]) {
  return categories.join(",");
}

function sameCategorySet(left: RadarCategory[], right: RadarCategory[]) {
  return left.length === right.length && right.every((category) => left.includes(category));
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

function statusLabel(status: UnderstandingStatus) {
  if (status === "included") return "已纳入";
  if (status === "needs_review") return "待复核";
  if (status === "excluded") return "已排除";
  return "失败";
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

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(date)} UTC`;
}

function DataFreshnessAlert({ warning }: { warning: string }) {
  return (
    <section className="rounded-lg border border-radar-caution/40 bg-radar-caution/10 p-4 text-sm leading-6 text-radar-caution">
      <strong className="text-radar-ink">数据新鲜度提示：</strong>
      <span className="ml-1">{warning}</span>
      <span className="ml-1">“最近 24 小时/今日”筛选会以当前可见证据时间为锚点，不代表真实今天。</span>
    </section>
  );
}

function eventImpactNote(event: PublicEventCluster) {
  const text = `${event.canonical_title} ${event.summary_zh} ${event.category} ${event.source_families.join(" ")}`.toLowerCase();

  if (/model|模型|api|context|benchmark|基准/.test(text)) {
    return "可能影响模型选型、API 成本、能力评估或基准对比。";
  }

  if (/agent|智能体|codex|developer|tool|工具|workflow/.test(text)) {
    return "可能影响开发者工作流、企业自动化落地和工具链迁移。";
  }

  if (/github|release|开源|repository|llama|transformers|semantic kernel/.test(text)) {
    return "可能改变开源实现、部署兼容性或工程团队的升级节奏。";
  }

  if (/partner|partnership|合作|enterprise|business|融资|收购/.test(text)) {
    return "可能影响企业采购、生态合作、渠道分发或竞争格局。";
  }

  if (/research|paper|arxiv|论文|研究/.test(text)) {
    return "可能提供新的技术路线、评测方法或后续产品化信号。";
  }

  return "作为弱到中等强度产业信号，适合继续跟踪是否出现独立来源确认。";
}

function eventWatchNote(event: PublicEventCluster) {
  if (event.source_count <= 1) {
    return "等待第二来源、官方更新或社区复现实证后再扩大解读。";
  }

  if (event.source_families.length <= 1) {
    return "尚缺跨来源家族确认，需避免同源转载放大。";
  }

  return "跟踪后续时间线、引用来源变化和相关实体的新动作。";
}

function formatOptionalTimestamp(value: string | null | undefined) {
  return value ? formatTimestamp(value) : "待补证据";
}

function dataSourceLabel(value: string) {
  if (value === "supabase_radar_items" || value.startsWith("supabase_")) {
    return "公开结构化数据";
  }

  if (value === "local_understanding_output" || value.startsWith("local_")) {
    return "本地理解输出";
  }

  if (value === "mock_data") {
    return "演示数据";
  }

  if (value === "empty") {
    return "暂无证据";
  }

  return value;
}

function publicText(value: string) {
  return value
    .replace(
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "此页面是公开只读情报快照，不提供账号、后台操作或写入能力。"
    )
    .replace(
      "Only public-safe radar fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      "只纳入可公开引用的雷达字段；私有原文、内部备注和凭据均不展示。"
    )
    .replace(
      "Snapshot data came from Supabase public-safe read views using anon read access.",
      "快照数据来自公开只读证据视图。"
    )
    .replace(
      "Read-only Supabase public radar retrieval was used; no Supabase write path ran.",
      "使用公开证据库进行检索；只展示可公开引用的结构化字段。"
    )
    .replace(
      "This surface shows available AI Radar evidence only; it is not a claim of complete current AI industry coverage.",
      "此页面只展示当前可用的 AI 行业雷达证据，不声称覆盖完整的实时 AI 行业。"
    )
    .replace(
      "Supabase coverage depends on rows already persisted into the public retrieval view.",
      "覆盖范围取决于已经入库或快照化的公开证据。"
    )
    .replace(/^Potentially relevant AI signal for review: /, "可能相关的待复核 AI 信号：")
    .replace(/^May affect model capability tracking and product benchmarking: /, "可能影响模型能力跟踪和产品基准：");
}
