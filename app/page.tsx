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

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const summary = await loadProductDataSummary();

  return (
    <div className="space-y-10">
      <section className="grid gap-8 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceChip detail="公开证据面" source={summary.dataSource} />
            <StatusChip label="仅基于公开信息" tone="evidence" />
            <StatusChip label="覆盖率" tone="caution" value="持续补齐" />
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-radar-ink sm:text-5xl">
            今日行业精选
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-radar-muted">
            把重复 AI 信号合并成事件，优先展示多源确认、来源健康、时间线、引用和局限。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              href="/radar"
            >
              打开雷达
            </Link>
            <Link
              className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
              href="/reports"
            >
              查看报告
            </Link>
            <Link
              className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
              href="/ask"
            >
              基于证据提问
            </Link>
          </div>
        </div>

        <ProductionStatusPanel summary={summary} />
      </section>

      <CuratedEvents summary={summary} />

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
    { label: "来源总数", value: coverage.sourcesTotal, tone: "evidence" as const },
    { label: "已尝试", value: coverage.attemptedSources, tone: "freshness" as const },
    { label: "事件", value: summary.eventCount, tone: "evidence" as const },
    { label: "公开来源", value: formatCount(coverage.sourcesWithPublicItems), tone: "success" as const },
    { label: "公开条目", value: formatCount(coverage.publicRadarItems), tone: "success" as const },
    { label: "失败/跳过", value: coverage.failedSources + coverage.skippedSources, tone: "risk" as const },
    { label: "报告候选", value: formatCount(summary.counts.reportCandidates), tone: "admin" as const },
    { label: "引用", value: summary.counts.citations, tone: "neutral" as const }
  ];

  return (
    <aside className="rounded-lg border border-radar-line bg-radar-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
          生产数据状态
        </h2>
        <DataSourceChip detail="首页状态" source={summary.dataSource} />
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
        <RailRow label="数据来源" value={dataSourceLabel(summary.dataSource)} />
        <RailRow label="自动合格来源" value={String(coverage.automatedEligibleSources)} />
        <RailRow label="已纳入 / 待复核 / 已排除" value={`${summary.counts.included} / ${summary.counts.needsReview} / ${summary.counts.excluded}`} />
        <RailRow label="更新时间" value={formatTimestamp(coverage.latestRefresh ?? summary.latest.radar)} />
        <RailRow label="最新采集" value={formatTimestamp(coverage.latestIngestion ?? summary.latest.ingestion)} />
        <RailRow label="最新理解" value={formatTimestamp(coverage.latestUnderstanding ?? summary.latest.understanding)} />
        <RailRow label="来源到原始覆盖率" value={formatRate(coverage.rates.sourceRawCoverage)} />
      </div>
    </aside>
  );
}

function CuratedEvents({ summary }: { summary: ProductDataSummary }) {
  const events = summary.curatedEvents.slice(0, 6);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">今日行业精选</h2>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            事件卡合并同一主题的相关信号，并保留来源数、来源家族、时间线和引用。
          </p>
        </div>
        <Link className="text-sm font-semibold text-radar-evidence" href="/radar">
          打开事件雷达
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {events.map((event) => (
          <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft" key={event.event_cluster_id}>
            <div className="flex flex-wrap gap-2">
              <StatusChip label={event.event_score_label} tone={event.event_score_label === "高优先级" ? "success" : "evidence"} />
              <EvidenceBadge detail={String(event.event_score)} kind="evidence" label="分数" />
              <EvidenceBadge detail={String(event.source_count)} kind="citation" label="来源" />
              <EvidenceBadge detail={String(event.related_item_ids.length)} kind="freshness" label="信号" />
            </div>
            <h3 className="mt-3 text-lg font-semibold leading-7 text-radar-ink">{event.canonical_title}</h3>
            <p className="mt-2 text-sm leading-6 text-radar-muted">{event.summary_zh}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {event.source_families.slice(0, 4).map((family) => (
                <StatusChip key={family} label={family} tone="neutral" />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RadarPulse({ summary }: { summary: ProductDataSummary }) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">雷达脉冲</h2>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            展示公开检索计数、类别集中度、来源结构和最新可见信号。
          </p>
        </div>
        <Link className="text-sm font-semibold text-radar-evidence" href="/radar">
          打开完整雷达
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <CountList entries={summary.topCategories} title="重点类别" />
        <CountList entries={summary.topSources} title="主要来源" />
        <CountList entries={summary.topSourceFamilies} title="来源家族" />
      </div>

      <section className="overflow-hidden rounded-lg border border-radar-line bg-white shadow-soft">
        <div className="border-b border-radar-line bg-radar-panel px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-radar-ink">最新信号</h3>
            <EvidenceBadge detail={String(summary.latestSignals.length)} kind="freshness" label="条目" />
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
                  <StatusChip label={statusLabel(signal.status)} tone={statusTone(signal.status)} />
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
                <RailRow label="来源" value={signal.source} />
                <RailRow label="时间" value={formatTimestamp(signal.timestamp)} />
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
        <h2 className="text-2xl font-semibold text-radar-ink">已保存候选</h2>
        <p className="mt-2 text-sm leading-6 text-radar-muted">
          日报和周报候选是已保存的工作流记录，不等同于已发布报告。
        </p>
      </div>
      {reports.map((report) => (
        <Link
          className="block rounded-lg border border-radar-line bg-white p-4 shadow-soft hover:border-radar-evidence"
          href={`/reports?type=${report.report_type}`}
          key={report.report_type}
        >
          <div className="flex flex-wrap gap-2">
            <StatusChip label={report.report_type === "weekly" ? "周报" : "日报"} tone="evidence" />
            <StatusChip label={report.quality_gate_passed ? "质量通过" : "需要更多数据"} tone={report.quality_gate_passed ? "success" : "caution"} />
            <StatusChip label={statusLabel(report.status)} tone={statusTone(report.status)} />
            <EvidenceBadge detail={String(report.citations.length)} kind="citation" label="引用" />
            <EvidenceBadge detail={String(report.usable_item_count)} kind="evidence" label="可用" />
            <EvidenceBadge detail={`${report.distinct_source_count}/${report.category_count}`} kind="freshness" label="来源/类别" />
          </div>
          <h3 className="mt-3 text-base font-semibold leading-7 text-radar-ink">
            {report.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            {report.one_sentence_summary}
          </p>
          <p className="mt-3 text-xs leading-5 text-radar-muted">
            时间窗口: {formatTimestamp(report.time_window.start)} 至 {formatTimestamp(report.time_window.end)}
          </p>
        </Link>
      ))}
      <Link
        className="inline-flex rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
        href="/reports"
      >
        打开报告台
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
          <h2 className="text-2xl font-semibold text-radar-ink">关系预览</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
            轻量关系图展示当前公开雷达条目如何连接来源、类别和已保存报告候选。
          </p>
        </div>
        <StatusChip label="关系图预览" tone="admin" value="真实计数" />
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
            <NodeColumn entries={categories} label="类别" tone="freshness" />
            <div className="rounded-full border border-radar-evidence bg-white px-5 py-6 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">
                证据集合
              </p>
              <p className="mt-2 text-sm font-semibold text-radar-ink">公开结构化数据</p>
              <p className="mt-1 text-2xl font-semibold text-radar-evidence">
                {summary.counts.visibleRadarItems}
              </p>
            </div>
            <NodeColumn entries={sources} label="来源" tone="admin" />
          </div>
        </div>

        <aside className="space-y-3">
          <GraphLegendRow label="类别节点" value={categories.length} tone="freshness" />
          <GraphLegendRow label="来源节点" value={sources.length} tone="admin" />
          <GraphLegendRow label="报告节点" value={summary.reports.savedCount} tone="evidence" />
          <div className="rounded-md border border-radar-caution/30 bg-radar-caution/5 p-3 text-sm leading-6 text-radar-caution">
            关系深度目前仅限公开安全的检索字段。实体抽取可在后续里程碑继续加深。
          </div>
        </aside>
      </div>
    </section>
  );
}

function QueryHubPanel({ summary }: { summary: ProductDataSummary }) {
  const categoryQueries = summary.topCategories.slice(0, 3).map((category) => ({
    href: `/ask?question=${encodeURIComponent(`${category.label} 信号最近有什么变化？`)}`,
    label: `${category.label} 最近有什么变化？`,
    meta: `${category.count} 条可见`
  }));
  const prompts = [
    ...categoryQueries,
    {
      href: "/ask?question=哪些信号已经足够支撑周报？",
      label: "哪些信号已经足够支撑周报？",
      meta: `${summary.counts.visibleRadarItems} 条雷达`
    },
    {
      href: "/write",
      label: "把当前信号整理成编辑选题候选",
      meta: "写作台"
    }
  ];

  return (
    <section className="rounded-lg border border-radar-line bg-radar-panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold text-radar-ink">分析提问入口</h2>
        <DataSourceChip source={summary.dataSource} />
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
        从当前数据结构出发，进入提问或写作流程。
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
        <h2 className="text-lg font-semibold text-radar-ink">覆盖说明</h2>
        <StatusChip label="注意事项" tone="caution" value={visible.length} />
      </div>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-radar-muted">
        {visible.map((note) => (
          <li className="rounded-md border border-radar-line bg-radar-panel px-3 py-2" key={note}>
            {publicText(note)}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function publicText(value: string) {
  return value
    .replace(
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "Cloudflare Pages 是主要公开只读页面；登录、Admin、服务端操作和写入流程不在这个公开页面中运行。"
    )
    .replace(
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      "只纳入公开安全的雷达和报告字段；私有原文、供应商元数据、内部备注、service-role 访问和密钥均已排除。"
    )
    .replace(
      "Snapshot data came from Supabase public-safe read views using anon read access.",
      "快照数据来自公开安全只读证据面。"
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
          <StatusChip label="无" tone="neutral" />
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
  return value === null ? "待补" : value;
}

function formatTimestamp(value: string | null | undefined) {
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

function formatRate(value: number | null) {
  return value === null ? "待补" : `${Math.round(value * 1000) / 10}%`;
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

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "已批准",
    archived: "已归档",
    draft: "草稿",
    excluded: "已排除",
    failed: "失败",
    included: "已纳入",
    needs_review: "待复核",
    preview: "预览",
    published: "已发布",
    reviewed: "已复核"
  };
  return labels[status] ?? status;
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
