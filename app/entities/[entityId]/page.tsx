import Link from "next/link";

import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EmptyState } from "@/components/empty-state";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { labelize } from "@/lib/product/data-summary";
import {
  buildEntityEvidenceGraph,
  buildEntitySummaries,
  entityAverageConfidence,
  entityHref,
  entityRouteId,
  entityTrackingInsight,
  findEntitySummaryByRouteId,
  type EntityEvidenceGraph,
  type EntitySummary
} from "@/lib/radar/entity-insights";
import { itemEvidenceTimestamp, loadRadarFeed } from "@/lib/radar/feed";
import { citationFromItem } from "@/lib/retrieval/citations";
import type { RetrievalRadarItem } from "@/lib/retrieval/types";
import type { UnderstandingEntityType } from "@/lib/understanding/types";
import { formatPercent, formatScore } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EntityDetailPage({
  params
}: {
  params: Promise<{ entityId: string }>;
}) {
  const { entityId } = await params;
  const feed = await loadRadarFeed();
  const entity = findEntitySummaryByRouteId(feed.items, entityId);

  if (!entity) {
    return <EntityNotFound entityId={entityId} entities={buildEntitySummaries(feed.items).slice(0, 8)} />;
  }

  const insight = entityTrackingInsight(entity);
  const graph = buildEntityEvidenceGraph(feed.items, entity);
  const averageConfidence = entityAverageConfidence(entity);
  const citations = graph.items
    .map(citationFromItem)
    .map((citation) => ({
      ...citation,
      source_name: publicText(citation.source_name),
      title: publicText(citation.title)
    }))
    .slice(0, 12);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip detail="实体详情" source={feed.data_source} />
            <StatusChip label={entityTypeLabel(entity.type)} tone="evidence" />
            <StatusChip label={insight.priorityLabel} tone={trackingTone(insight.priorityScore)} />
            <StatusChip label={insight.watchLabel} tone={watchTone(insight.watchLabel)} />
            <EvidenceBadge detail={String(graph.items.length)} kind="evidence" label="证据" />
            <EvidenceBadge detail={String(graph.sourceCounts.size)} kind="citation" label="来源" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">{entity.name}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            这是从公开雷达证据派生的实体详情页，不是私有画像，也不是确定知识图谱。它用于解释这个对象为什么值得跟踪、证据来自哪里、还有哪些事项需要继续核查。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              href={`/radar?entity=${encodeURIComponent(entity.name)}`}
            >
              查看雷达证据
            </Link>
            <Link
              className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
              href="/reports#evidence-to-report-path"
            >
              查看报告路径
            </Link>
          </div>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">跟踪摘要</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <RailRow label="实体 ID" value={entityRouteId(entity)} />
            <RailRow label="平均置信" value={formatScore(averageConfidence)} />
            <RailRow label="最新证据" value={formatTimestamp(graph.latestTimestamp)} />
            <RailRow label="时间跨度" value={timeSpanLabel(graph)} />
            <RailRow label="公开边界" value="只使用 public radar fields" />
          </dl>
        </aside>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="公开信号" tone="evidence" value={graph.items.length} />
        <Metric label="来源覆盖" tone="citation" value={graph.sourceCounts.size} />
        <Metric label="类别覆盖" tone="freshness" value={graph.categoryCounts.size} />
        <Metric label="待复核" tone={graph.statusCounts.needs_review > 0 ? "caution" : "success"} value={graph.statusCounts.needs_review} />
        <Metric label="优先级分" tone={trackingTone(insight.priorityScore)} value={insight.priorityScore} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-radar-ink">为什么跟踪</h2>
            <StatusChip label={insight.priorityLabel} tone={trackingTone(insight.priorityScore)} />
          </div>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-radar-muted">
            {insight.reasons.map((reason) => (
              <li className="rounded-md border border-radar-line bg-radar-panel px-3 py-2" key={reason}>
                {reason}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-radar-line bg-radar-panel p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-radar-ink">下一步核查</h2>
            <StatusChip label="验证清单" tone="caution" value={insight.nextQuestions.length} />
          </div>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-radar-muted">
            {insight.nextQuestions.map((question) => (
              <li className="rounded-md border border-radar-line bg-white px-3 py-2" key={question}>
                {question}
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft" id="entity-evidence-graph">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-radar-ink">证据图</h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              这里把实体相关的公开信号按来源、类别、状态和时间线拆开，帮助判断它是持续趋势、单源噪音，还是需要复核的弱信号。
            </p>
          </div>
          <StatusChip label="public evidence only" tone="success" />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <CoverageList counts={graph.sourceCounts} title="来源覆盖" />
          <CoverageList counts={graph.categoryCounts} title="类别覆盖" valueLabel={labelize} />
          <StatusSummary graph={graph} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-radar-ink">证据时间线</h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              时间线只显示已纳入或待复核的公开信号；待复核内容不会被当作已确认结论。
            </p>
          </div>
          <StatusChip label="条目" tone="evidence" value={graph.items.length} />
        </div>
        {graph.items.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-radar-line bg-white shadow-soft">
            {graph.items.slice(0, 16).map((item, index) => (
              <EvidenceTimelineItem index={index} item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            description="当前公开证据中没有可展示的实体信号。请返回实体列表或刷新公开雷达证据。"
            title="没有实体证据"
          />
        )}
      </section>

      <CitationList
        citations={citations}
        emptyMessage="当前实体没有可公开引用的证据。"
        title="实体引用"
      />
    </div>
  );
}

function EntityNotFound({
  entities,
  entityId
}: {
  entities: EntitySummary[];
  entityId: string;
}) {
  return (
    <div className="space-y-8">
      <section className="border-b border-radar-line pb-8">
        <div className="flex flex-wrap gap-2">
          <StatusChip label="实体详情" tone="caution" value="未找到" />
          <EvidenceBadge detail={safeDisplayId(entityId)} kind="uncertainty" label="请求" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">没有找到这个实体</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          实体详情只从当前公开雷达证据派生。这个链接可能来自旧快照、筛选结果已变化，或实体合并规则尚未覆盖该名称。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black" href="/entities">
            返回实体索引
          </Link>
          <Link className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence" href="/radar">
            查看雷达证据
          </Link>
        </div>
      </section>

      {entities.length > 0 ? (
        <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-radar-ink">当前可跟踪实体</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {entities.map((entity) => (
              <Link
                className="rounded-md border border-radar-line bg-radar-panel p-3 text-sm leading-6 hover:border-radar-evidence"
                href={entityHref(entity)}
                key={entityRouteId(entity)}
              >
                <span className="font-semibold text-radar-ink">{entity.name}</span>
                <span className="mt-1 block text-radar-muted">
                  {entityTypeLabel(entity.type)} / {entity.totalSignals} 条信号
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EvidenceTimelineItem({
  index,
  item
}: {
  index: number;
  item: RetrievalRadarItem;
}) {
  const summary = item.summary_zh || item.summary_en || "暂无摘要。";

  return (
    <article className="border-t border-radar-line p-4 first:border-t-0">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-radar-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <StatusChip label={statusLabel(item.status)} tone={statusTone(item.status)} />
            <EvidenceBadge detail={formatScore(item.overall_score)} kind="evidence" label="综合" />
            <EvidenceBadge detail={formatPercent(item.confidence)} kind="freshness" label="置信" />
          </div>
          <h3 className="mt-3 text-lg font-semibold leading-7 text-radar-ink">
            <a className="hover:text-radar-evidence" href={item.url} rel="noreferrer" target="_blank">
              {publicText(item.title)}
            </a>
          </h3>
          <p className="mt-2 text-sm leading-6 text-radar-muted">{publicText(summary)}</p>
          {item.why_it_matters ? (
            <p className="mt-3 rounded-md border border-radar-evidence/20 bg-radar-evidence/5 px-3 py-2 text-sm leading-6 text-radar-muted">
              <span className="font-semibold text-radar-ink">为什么重要: </span>
              {publicText(item.why_it_matters)}
            </p>
          ) : null}
          {item.status === "needs_review" ? (
            <p className="mt-3 rounded-md border border-radar-caution/30 bg-radar-caution/5 px-3 py-2 text-sm leading-6 text-radar-caution">
              此信号仍待复核，不能单独作为确定结论。
            </p>
          ) : null}
        </div>

        <aside className="rounded-md border border-radar-line bg-radar-panel p-3">
          <dl className="space-y-2 text-sm">
            <RailRow label="来源" value={item.source_name} />
            <RailRow label="时间" value={formatTimestamp(itemEvidenceTimestamp(item))} />
            <RailRow label="来源层级" value={item.source_tier} />
            <RailRow
              label="评分"
              value={`可信 ${formatScore(item.credibility_score)} / 新颖 ${formatScore(item.novelty_score)} / 重要 ${formatScore(item.importance_score)}`}
            />
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.categories.map((category) => (
              <EvidenceBadge detail={labelize(category)} kind="evidence" key={category} label="类别" />
            ))}
            {item.tags.slice(0, 4).map((tag) => (
              <StatusChip key={tag} label={tag} tone="neutral" />
            ))}
          </div>
        </aside>
      </div>
    </article>
  );
}

function CoverageList<T extends string>({
  counts,
  title,
  valueLabel = (value: T) => value
}: {
  counts: Map<T, number>;
  title: string;
  valueLabel?: (value: T) => string;
}) {
  const entries = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 8);

  return (
    <div className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-radar-ink">{title}</h3>
        <StatusChip label="覆盖" tone="evidence" value={entries.length} />
      </div>
      {entries.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {entries.map(([value, count]) => (
            <StatusChip key={value} label={valueLabel(value)} tone="neutral" value={count} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-radar-muted">暂无覆盖数据。</p>
      )}
    </div>
  );
}

function StatusSummary({ graph }: { graph: EntityEvidenceGraph }) {
  return (
    <div className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-radar-ink">复核状态</h3>
        <StatusChip label="状态" tone={graph.statusCounts.needs_review > 0 ? "caution" : "success"} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusChip label="已纳入" tone="success" value={graph.statusCounts.included} />
        <StatusChip label="待复核" tone="caution" value={graph.statusCounts.needs_review} />
        <StatusChip label="已排除" tone="risk" value={graph.statusCounts.excluded} />
        <StatusChip label="失败" tone="risk" value={graph.statusCounts.failed} />
      </div>
      <p className="mt-3 text-sm leading-6 text-radar-muted">
        待复核信号会保留在证据图中，但不会被当作正式结论。
      </p>
    </div>
  );
}

function Metric({
  label,
  tone = "neutral",
  value
}: {
  label: string;
  tone?: StatusTone | "citation";
  value: number | string;
}) {
  const normalizedTone: StatusTone = tone === "citation" ? "evidence" : tone;

  return (
    <div className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${metricToneClass(normalizedTone)}`}>{value}</p>
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

function entityTypeLabel(value: UnderstandingEntityType) {
  const labels: Record<UnderstandingEntityType, string> = {
    company: "公司",
    investor: "投资方",
    model: "模型",
    other: "其他",
    paper: "论文",
    person: "人物",
    product: "产品",
    project: "项目",
    regulator: "监管",
    repository: "仓库"
  };

  return labels[value];
}

function statusLabel(value: RetrievalRadarItem["status"]) {
  if (value === "included") return "已纳入";
  if (value === "needs_review") return "待复核";
  if (value === "excluded") return "已排除";
  if (value === "failed") return "失败";
  return value;
}

function statusTone(value: RetrievalRadarItem["status"]): StatusTone {
  if (value === "included") return "success";
  if (value === "needs_review") return "caution";
  if (value === "excluded" || value === "failed") return "risk";
  return "neutral";
}

function trackingTone(score: number): StatusTone {
  if (score >= 80) return "success";
  if (score >= 55) return "evidence";
  return "caution";
}

function watchTone(label: string): StatusTone {
  if (label === "可入报告") return "success";
  if (label === "先复核") return "caution";
  return "neutral";
}

function metricToneClass(tone: StatusTone) {
  if (tone === "success") return "text-radar-success";
  if (tone === "evidence") return "text-radar-evidence";
  if (tone === "freshness") return "text-radar-freshness";
  if (tone === "caution") return "text-radar-caution";
  if (tone === "risk") return "text-radar-risk";
  if (tone === "admin") return "text-radar-admin";
  return "text-radar-ink";
}

function timeSpanLabel(graph: EntityEvidenceGraph) {
  if (!graph.firstTimestamp || !graph.latestTimestamp) {
    return "暂无时间线";
  }

  return `${formatTimestamp(graph.firstTimestamp)} 至 ${formatTimestamp(graph.latestTimestamp)}`;
}

function formatTimestamp(value: string | undefined) {
  if (!value) {
    return "待补";
  }

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

function safeDisplayId(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function publicText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
