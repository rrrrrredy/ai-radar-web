import Link from "next/link";

import { DataSourceChip } from "@/components/data-source-chip";
import { EmptyState } from "@/components/empty-state";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import {
  buildEntitySummaries,
  entityAverageConfidence,
  entityHref,
  entityTrackingInsight,
  type EntitySummary
} from "@/lib/radar/entity-insights";
import { loadRadarFeed } from "@/lib/radar/feed";
import { labelize } from "@/lib/product/data-summary";
import type { UnderstandingEntityType } from "@/lib/understanding/types";
import { formatScore } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EntitiesPage() {
  const feed = await loadRadarFeed();
  const entities = buildEntitySummaries(feed.items);
  const trackingQueue = entities.slice(0, 6);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip detail="实体索引" source={feed.data_source} />
            <EvidenceBadge detail={String(feed.counts.total)} kind="evidence" label="雷达条目" />
            <EvidenceBadge detail={String(entities.length)} kind="freshness" label="实体" />
            <StatusChip label="来源" tone="caution" value="公开证据派生" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">实体索引</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            从当前公开雷达证据中抽取公司、模型、产品、人物、论文和项目，并把它们转换成可复核的跟踪队列。实体页不做私有画像，只回答“为什么值得看、下一步查什么”。
          </p>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            索引边界
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <RailRow label="数据来源" value={dataSourceLabel(feed.data_source)} />
            <RailRow label="最新内容发布时间" value={formatTimestamp(feed.freshness.latestTimestamp)} />
            <RailRow label="实体合并" value="按标准化名称和类型聚合" />
            <RailRow label="跟踪判断" value="按信号数、来源覆盖、置信度和复核状态派生" />
          </dl>
        </aside>
      </section>

      <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="实体总数" tone="evidence" value={entities.length} />
          <Metric label="公司/产品/模型" value={countCoreEntities(entities)} />
          <Metric label="待复核命中" tone="caution" value={entities.reduce((sum, entity) => sum + entity.statusCounts.needs_review, 0)} />
          <Metric label="来源覆盖" tone="freshness" value={new Set(entities.flatMap((entity) => [...entity.sourceCounts.keys()])).size} />
        </div>
      </section>

      {trackingQueue.length > 0 ? (
        <section className="scroll-mt-32 rounded-lg border border-radar-line bg-white p-5 shadow-soft" id="entity-tracking-queue">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-radar-ink">跟踪队列</h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                这些实体不是热度榜，而是从公开证据强度、来源覆盖和复核风险推导出的下一步观察对象。
              </p>
            </div>
            <StatusChip label="候选" tone="evidence" value={trackingQueue.length} />
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {trackingQueue.map((entity) => (
              <TrackingQueueItem entity={entity} key={`${entity.type}:${entity.name}`} />
            ))}
          </div>
        </section>
      ) : null}

      {entities.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entities.map((entity) => (
            <EntityCard entity={entity} key={`${entity.type}:${entity.name}`} />
          ))}
        </section>
      ) : (
        <EmptyState
          description="当前公开雷达证据没有可索引实体。请先刷新公开证据或放宽数据源。"
          title="暂无实体索引"
        />
      )}
    </div>
  );
}

function EntityCard({ entity }: { entity: EntitySummary }) {
  const topCategories = topEntries(entity.categories, labelize, 3);
  const topSources = topEntries(entity.sourceCounts, (value) => value, 3);
  const averageConfidence = entityAverageConfidence(entity);
  const insight = entityTrackingInsight(entity);

  return (
    <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap gap-2">
        <StatusChip label={entityTypeLabel(entity.type)} tone="evidence" />
        <StatusChip label={insight.priorityLabel} tone={trackingTone(insight.priorityScore)} />
        <StatusChip label={insight.watchLabel} tone={watchTone(insight.watchLabel)} />
        <EvidenceBadge detail={String(entity.totalSignals)} kind="evidence" label="信号" />
        <EvidenceBadge detail={String(entity.sourceCounts.size)} kind="citation" label="来源" />
        <EvidenceBadge detail={formatScore(averageConfidence)} kind="freshness" label="置信" />
      </div>
      <h2 className="mt-4 text-xl font-semibold leading-7 text-radar-ink">{entity.name}</h2>
      <p className="mt-2 text-sm leading-6 text-radar-muted">
        最高分信号：{entity.topItem.title}
      </p>
      <dl className="mt-4 grid gap-3 text-sm">
        <RailRow label="最新内容发布时间" value={formatTimestamp(entity.latestTimestamp)} />
        <RailRow
          label="状态"
          value={`已纳入 ${entity.statusCounts.included} / 待复核 ${entity.statusCounts.needs_review}`}
        />
        <RailRow label="主要类别" value={topCategories || "待补"} />
        <RailRow label="主要来源" value={topSources || "待补"} />
      </dl>
      {entity.evidenceTexts.size > 0 ? (
        <p className="mt-4 rounded-md border border-radar-line bg-radar-panel px-3 py-3 text-sm leading-6 text-radar-muted">
          {[...entity.evidenceTexts][0]}
        </p>
      ) : null}
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-radar-ink">为什么跟踪</h3>
        <ul className="mt-2 grid gap-1 text-sm leading-6 text-radar-muted">
          {insight.reasons.slice(0, 3).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-radar-ink">下一步核查</h3>
        <ul className="mt-2 grid gap-1 text-sm leading-6 text-radar-muted">
          {insight.nextQuestions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          href={entityHref(entity)}
        >
          打开详情
        </Link>
        <Link
          className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
          href={`/radar?entity=${encodeURIComponent(entity.name)}`}
        >
          查看相关信号
        </Link>
        <a
          className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
          href={entity.topItem.url}
          rel="noreferrer"
          target="_blank"
        >
          打开最高分来源
        </a>
      </div>
    </article>
  );
}

function topEntries<T extends string>(
  counts: Map<T, number>,
  label: (value: T) => string,
  limit: number
) {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => `${label(value)} ${count}`)
    .join(" / ");
}

function countCoreEntities(entities: EntitySummary[]) {
  return entities.filter((entity) => ["company", "model", "product"].includes(entity.type)).length;
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
      <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${metricToneClass(tone)}`}>{value}</p>
    </div>
  );
}

function TrackingQueueItem({ entity }: { entity: EntitySummary }) {
  const insight = entityTrackingInsight(entity);

  return (
    <article className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <div className="flex flex-wrap gap-2">
        <StatusChip label={entity.name} tone="evidence" />
        <StatusChip label={entityTypeLabel(entity.type)} tone="neutral" />
        <StatusChip label={insight.priorityLabel} tone={trackingTone(insight.priorityScore)} />
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
          查看证据
        </Link>
        <Link
          className="rounded-md border border-radar-line bg-white px-3 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
          href="/reports#evidence-to-report-path"
        >
          报告路径
        </Link>
      </div>
    </article>
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

function formatTimestamp(value: string | undefined) {
  if (!value) {
    return "待补证据";
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

function trackingTone(score: number): StatusTone {
  if (score >= 80) {
    return "success";
  }

  if (score >= 55) {
    return "evidence";
  }

  return "caution";
}

function watchTone(label: string): StatusTone {
  if (label === "报告候选") {
    return "evidence";
  }

  if (label === "先复核") {
    return "caution";
  }

  return "neutral";
}
