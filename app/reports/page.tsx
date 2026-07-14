import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EmptyState } from "@/components/empty-state";
import { EvidenceBadge } from "@/components/evidence-badge";
import { ReportMarkdownExport } from "@/components/report-markdown-export";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import {
  buildEventLayer,
  filterPublicDisplayEventLayer,
  type PublicEventCluster
} from "@/lib/events/clustering";
import {
  type PublicDataCompletenessSummary
} from "@/lib/data-completeness/types";
import { loadPublicSafeDataCompletenessSummary } from "@/lib/data-completeness/public-safe-summary";
import { buildRadarFeed, loadRadarFeed, type RadarFeed } from "@/lib/radar/feed";
import {
  reportEntityTraceability,
  reportSectionTraceability,
  type ReportSectionTraceability,
  type ReportEntityTraceability
} from "@/lib/reports/entity-traceability";
import { loadReportWorkflowData } from "@/lib/reports/load-report-data";
import {
  reportPublishingReadiness,
  summarizePublishingReadiness
} from "@/lib/reports/publishing-readiness";
import type {
  GeneratedReportSection,
  GeneratedReportStatus,
  ReportPreviewType,
  ReportWorkflowDocument
} from "@/lib/reports/types";
import { loadPublicSnapshotRadarItems } from "@/lib/retrieval/load-radar-items";
import type { LoadedRadarItems, RetrievalRadarItem } from "@/lib/retrieval/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const selectedType = readReportType(firstParam(params.type));
  const feed = await loadRadarFeed();
  const [data, coverage] = await Promise.all([
    loadReportWorkflowData({ feed, publicSnapshotLocalOnly: true }),
    loadPublicSafeDataCompletenessSummary(feed)
  ]);
  const selectedReport =
    data.reports.find((report) => report.report_type === selectedType) ?? data.reports[0];
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
  const reportEventContext = eventsForReport(selectedReport, eventLayer.event_clusters, eventLayer.curated_events);
  const traceFeed = await loadReportTraceFeed(data.reports, feed);
  const formalReports = data.reports.filter(isFormalPublicReport);
  const evidenceDrafts = data.reports.filter((report) => !isFormalPublicReport(report));
  const readinessSummary = summarizePublishingReadiness(data.reports);
  const selectedTraceability = reportEntityTraceability(selectedReport, traceFeed.items);
  const selectedSectionTraceability = reportSectionTraceability(selectedReport, traceFeed.items);
  const selectedSectionTraceabilityById = new Map(
    selectedSectionTraceability.map((traceability) => [traceability.section.id, traceability])
  );

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip detail={modeLabel(selectedReport)} source={selectedReport.data_source} />
            <StatusChip label="报告状态" tone={statusTone(selectedReport.status)} value={statusLabel(selectedReport.status)} />
            <StatusChip label="质量门禁" tone={qualityTone(selectedReport)} value={qualityLabel(selectedReport)} />
            <StatusChip label="事件上下文" tone="evidence" value={reportEventContext.events.length} />
            <StatusChip label="来源状态" tone={isSavedReportSource(selectedReport) ? "success" : "caution"} value={readSourceLabel(selectedReport)} />
            <StatusChip label="发布状态" tone={publicationTone(selectedReport)} value={publicationLabel(selectedReport)} />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">报告</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            报告页把已审核/已发布内容和证据草稿分开。没有正式公开报告时，页面显示正常空态，并保留基于公开证据的草稿预览。
          </p>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            发布说明
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <RailRow label="选中类型" value={reportTypeLabel(selectedReport.report_type)} />
            <RailRow label="待复核报告" value={String(coverage.reportCandidates ?? data.reports.length)} />
            <RailRow label="来源状态" value={readSourceLabel(selectedReport)} />
            <RailRow label="质量门禁" value={qualityLabel(selectedReport)} />
            <RailRow label="生成时间" value={selectedReport.generated_at} />
            <RailRow label="时间窗口" value={`${selectedReport.time_window.start} 至 ${selectedReport.time_window.end}`} />
          </dl>
        </aside>
      </section>

      {data.warnings.length > 0 ? (
        <section className="rounded-lg border border-radar-caution/40 bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-radar-ink">读取说明</h2>
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

      <ReportCoveragePanel coverage={coverage} reports={data.reports} />
      <ReportEventContext context={reportEventContext} />
      <PublishingReadinessPanel summary={readinessSummary} />
      <EvidenceToReportPath
        draftCount={evidenceDrafts.length}
        formalCount={formalReports.length}
        selectedReport={selectedReport}
      />
      <ReportEntityTraceabilityPanel
        report={selectedReport}
        sectionTraceability={selectedSectionTraceability}
        traceability={selectedTraceability}
      />

      <section className="rounded-lg border border-radar-line bg-radar-panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-radar-ink">已审核/已发布报告</h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              只有已复核或已发布的报告记录属于正式公开内容；未审核候选不会出现在这里。
            </p>
          </div>
          <StatusChip
            label="正式报告"
            tone={formalReports.length > 0 ? "success" : "caution"}
            value={formalReports.length}
          />
        </div>
        {formalReports.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {formalReports.map((report) => (
              <ReportOverviewCard
                isSelected={report.report_type === selectedReport.report_type}
                key={`${report.mode}:${report.report_type}:${report.id ?? report.generated_at}`}
                report={report}
              />
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              description="暂无已审核或已发布报告。当前页面下方仅显示基于公开证据生成的草稿预览，不代表正式结论。"
              title="暂无已发布报告"
            />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-radar-ink">证据草稿</h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              草稿来自当前公开雷达证据，用于判断是否具备发布条件；发布前仍需要人工审核。
            </p>
          </div>
          <StatusChip label="草稿" tone="caution" value={evidenceDrafts.length} />
        </div>
        {evidenceDrafts.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {evidenceDrafts.map((report) => (
              <ReportOverviewCard
                isSelected={report.report_type === selectedReport.report_type}
                key={`${report.mode}:${report.report_type}:${report.id ?? report.generated_at}`}
                report={report}
              />
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              description="当前既没有证据草稿，也没有正式报告。请先刷新公开雷达证据。"
              title="暂无证据草稿"
            />
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="报告选择">
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
              选中内容
            </p>
            <h2 className="mt-2 text-lg font-semibold leading-7 text-radar-ink">
              {selectedReport.title}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip source={selectedReport.data_source} />
            <EvidenceBadge detail={`${selectedReport.usable_item_count}/${selectedReport.retrieved_item_count}`} kind="evidence" label="可用" />
            <EvidenceBadge detail={String(selectedReport.citations.length)} kind="citation" label="引用" />
            <EvidenceBadge detail={`${selectedReport.distinct_source_count}/${selectedReport.category_count}`} kind="freshness" label="来源/类别" />
            <EvidenceBadge detail={String(selectedReport.missing_evidence.length)} kind="uncertainty" label="缺口" />
          </div>
          <dl className="space-y-3 text-sm">
            <RailRow label="状态" value={statusLabel(selectedReport.status)} />
            <RailRow label="质量门禁" value={qualityLabel(selectedReport)} />
            <RailRow label="模式" value={modeLabel(selectedReport)} />
            <RailRow label="发布" value={publicationLabel(selectedReport)} />
            <RailRow label="保存时间" value={selectedReport.saved_at ?? "未保存"} />
            <RailRow label="时间窗口规则" value={selectedReport.time_window.explanation} />
          </dl>
          <div className="flex flex-wrap gap-2">
            {selectedReport.id ? (
              <a
                className="inline-flex rounded-md border border-radar-line bg-white px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-admin hover:text-radar-admin"
                href={`/reports/${selectedReport.id}`}
              >
                打开详情
              </a>
            ) : null}
            <a
              className="inline-flex rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              href="/radar"
            >
              查看雷达证据
            </a>
          </div>
        </aside>

        <div className="space-y-5">
          <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
            <div className="flex flex-wrap gap-2">
              <EvidenceBadge kind="evidence" label="摘要" />
              <StatusChip label="报告状态" tone={statusTone(selectedReport.status)} value={statusLabel(selectedReport.status)} />
              <StatusChip label="质量门禁" tone={qualityTone(selectedReport)} value={qualityLabel(selectedReport)} />
              <StatusChip label="内容类型" tone="neutral" value={readSourceLabel(selectedReport)} />
            </div>
            <p className="mt-4 text-lg leading-8 text-radar-ink">
              {publicText(selectedReport.one_sentence_summary)}
            </p>
            <p className="mt-3 text-sm leading-6 text-radar-muted">
              {selectedReport.executive_summary ? publicText(selectedReport.executive_summary) : selectedReport.executive_summary}
            </p>
          </section>

          {!selectedReport.quality_gate_passed ? (
            <PlanningList items={selectedReport.quality_gate_reasons} tone="caution" title="为什么报告偏薄" />
          ) : null}

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">报告章节</h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                章节会保留证据边界，并显式标出空白或薄弱区域。
              </p>
            </div>
            {selectedReport.sections.length > 0 ? (
              selectedReport.sections.map((section) => (
                <ReportSectionView
                  key={section.id}
                  section={section}
                  traceability={selectedSectionTraceabilityById.get(section.id)}
                />
              ))
            ) : (
              <EmptyState
                description="该保存记录没有结构化报告章节。"
                title="没有结构化章节"
              />
            )}
          </section>

          <PlanningList items={selectedReport.caveats} tone="caution" title="局限" />
          <PlanningList items={selectedReport.missing_evidence} tone="risk" title="缺失证据" />

          <CitationList
            citations={selectedReport.citations}
            emptyMessage="此报告草稿暂无引用。"
            title="报告引用"
          />

          <ReportMarkdownExport markdown={publicText(selectedReport.markdown)} />
        </div>
      </section>
    </div>
  );
}

async function loadReportTraceFeed(
  reports: ReportWorkflowDocument[],
  currentFeed: RadarFeed
): Promise<RadarFeed> {
  const missingIds = missingReportEvidenceIds(reports, currentFeed.items);

  if (missingIds.length === 0) {
    return currentFeed;
  }

  const snapshot = await loadPublicSnapshotRadarItems({ localOnly: true, preferLocal: true });

  if (!snapshot) {
    return currentFeed;
  }

  const items = mergeRetrievalRadarItems([...snapshot.items, ...currentFeed.items]);

  return buildRadarFeed({
    dataSource: snapshot.dataSource,
    freshness: snapshot.freshness,
    items,
    warnings: [
      ...snapshot.warnings,
      `报告实体追踪补充使用公开快照证据；当前常规 feed 缺少 ${missingIds.length} 个报告引用。`
    ]
  } satisfies LoadedRadarItems);
}

function missingReportEvidenceIds(
  reports: ReportWorkflowDocument[],
  items: RetrievalRadarItem[]
) {
  const availableIds = new Set(items.map((item) => normalizeIdentity(item.id)).filter(Boolean));
  const requiredIds = new Set(
    reports.flatMap((report) => [
      ...report.source_item_ids,
      ...report.citations.map((citation) => citation.id)
    ]).map(normalizeIdentity).filter(Boolean)
  );

  return Array.from(requiredIds).filter((id) => !availableIds.has(id));
}

function mergeRetrievalRadarItems(items: RetrievalRadarItem[]) {
  const byId = new Map<string, RetrievalRadarItem>();

  for (const item of items) {
    const key = normalizeIdentity(item.id);
    if (key && !byId.has(key)) {
      byId.set(key, item);
    }
  }

  return Array.from(byId.values());
}

function normalizeIdentity(value: string) {
  return value.trim().toLowerCase();
}

function eventsForReport(
  report: ReportWorkflowDocument,
  events: PublicEventCluster[],
  curatedEvents: PublicEventCluster[]
) {
  const itemIds = new Set(report.source_item_ids);
  const citationUrls = new Set(report.citations.map((citation) => citation.url).filter(Boolean));
  const matched = events.filter((event) =>
    event.citations.some((citation) => itemIds.has(citation.item_id) || citationUrls.has(citation.url))
  );

  return {
    events: (matched.length > 0 ? matched : curatedEvents).slice(0, 8),
    mappedFromReport: matched.length > 0
  };
}

function ReportEventContext({
  context
}: {
  context: ReturnType<typeof eventsForReport>;
}) {
  const signalCount = context.events.reduce((sum, event) => sum + event.related_item_ids.length, 0);
  const duplicateReduction = Math.max(0, signalCount - context.events.length);
  const sourceNames = new Set(
    context.events.flatMap((event) => event.citations.map((citation) => citation.source_name))
  );

  return (
    <section className="space-y-4" aria-label="报告事件上下文">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-radar-line pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">纳入的精选事件</h2>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            {context.mappedFromReport
              ? "按报告引用映射到事件层；同一事件的重复信号在这里合并展示。"
              : "当前候选缺少稳定事件引用，暂用本轮行业精选作为报告上下文。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EvidenceBadge detail={String(context.events.length)} kind="evidence" label="事件" />
          <EvidenceBadge detail={String(signalCount)} kind="citation" label="相关信号" />
          <EvidenceBadge detail={String(duplicateReduction)} kind="freshness" label="合并减少" />
          <EvidenceBadge detail={String(sourceNames.size)} kind="citation" label="独立来源" />
        </div>
      </div>

      {context.events.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {context.events.map((event) => (
            <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft" key={event.event_cluster_id}>
              <div className="flex flex-wrap gap-2">
                <StatusChip
                  label={event.event_score_label}
                  tone={event.event_score_label === "高优先级" ? "success" : "evidence"}
                />
                <EvidenceBadge detail={String(event.event_score)} kind="evidence" label="分数" />
                <EvidenceBadge detail={String(event.source_count)} kind="citation" label="来源" />
                <EvidenceBadge detail={String(event.related_item_ids.length)} kind="freshness" label="信号" />
              </div>
              <h3 className="mt-3 text-base font-semibold leading-7 text-radar-ink">{event.canonical_title}</h3>
              <p className="mt-2 text-sm leading-6 text-radar-muted">{event.summary_zh}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <RailRow label="来源家族" value={event.source_families.join("、") || "待补"} />
                <RailRow label="最新证据" value={formatEventTime(event.latest_seen_at)} />
                <RailRow label="评分依据" value={event.score_reason} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
                {event.citations.slice(0, 3).map((citation) => (
                  <a
                    className="text-radar-evidence hover:underline"
                    href={citation.url}
                    key={`${event.event_cluster_id}:${citation.item_id}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {citation.source_name}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState description="当前报告候选还没有可映射的公开事件。" title="暂无事件上下文" />
      )}
    </section>
  );
}

function formatEventTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function ReportCoveragePanel({
  coverage,
  reports
}: {
  coverage: PublicDataCompletenessSummary;
  reports: ReportWorkflowDocument[];
}) {
  const daily = reports.find((report) => report.report_type === "daily");
  const weekly = reports.find((report) => report.report_type === "weekly");

  return (
    <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-radar-ink">报告数据覆盖</h2>
        <StatusChip label="报告候选" tone="admin" value={coverage.reportCandidates ?? reports.length} />
        <StatusChip label="公开雷达条目" tone="evidence" value={coverage.publicRadarItems ?? 0} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ReportCoverageRow label="最新日报候选" report={daily} />
        <ReportCoverageRow label="最新周报候选" report={weekly} />
      </div>
    </section>
  );
}

function ReportCoverageRow({
  label,
  report
}: {
  label: string;
  report: ReportWorkflowDocument | undefined;
}) {
  return (
    <div className="rounded-md border border-radar-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">{label}</p>
      {report ? (
        <>
          <h3 className="mt-2 text-sm font-semibold leading-6 text-radar-ink">{publicText(report.title)}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusChip label={qualityLabel(report)} tone={qualityTone(report)} />
            <EvidenceBadge detail={String(report.usable_item_count)} kind="evidence" label="条目数" />
            <EvidenceBadge detail={String(report.citations.length)} kind="citation" label="引用数" />
            <EvidenceBadge detail={`${report.distinct_source_count}/${report.category_count}`} kind="freshness" label="来源/类别" />
            <StatusChip label={statusLabel(report.status)} tone={statusTone(report.status)} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm leading-6 text-radar-muted">暂无候选。</p>
      )}
    </div>
  );
}

function PublishingReadinessPanel({
  summary
}: {
  summary: ReturnType<typeof summarizePublishingReadiness>;
}) {
  return (
    <section className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-radar-ink">发布准备度</h2>
        <StatusChip label="正式报告" tone={summary.formalReports > 0 ? "success" : "caution"} value={summary.formalReports} />
        <StatusChip label="可发布候选" tone={summary.publishableCandidates > 0 ? "success" : "caution"} value={summary.publishableCandidates} />
        <StatusChip label="待复核" tone={summary.needsReview > 0 ? "caution" : "neutral"} value={summary.needsReview} />
      </div>
      <p className="mt-3 text-sm leading-6 text-radar-muted">
        正式公开报告只来自已经完成复核并发布的记录。草稿即使质量通过，也会继续留在待复核区，避免被读者误当成结论。
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <ReadinessMetric label="已发布" tone="success" value={summary.publishedReports} />
        <ReadinessMetric label="已审核报告" tone="admin" value={summary.reviewedReports} />
        <ReadinessMetric label="已批准候选" tone="evidence" value={summary.approvedCandidates} />
        <ReadinessMetric label="草稿/阻塞" tone="caution" value={summary.drafts + summary.blocked} />
      </div>
    </section>
  );
}

function EvidenceToReportPath({
  draftCount,
  formalCount,
  selectedReport
}: {
  draftCount: number;
  formalCount: number;
  selectedReport: ReportWorkflowDocument;
}) {
  const readiness = reportPublishingReadiness(selectedReport);
  const nextAction =
    formalCount > 0
      ? "继续用实体和雷达页面监控正式报告之后的新证据。"
      : draftCount > 0
        ? "先补齐草稿缺口，再完成复核和发布。"
        : "先刷新公开雷达证据，再生成候选报告。";

  return (
    <section className="scroll-mt-32 rounded-lg border border-radar-line bg-white p-5 shadow-soft" id="evidence-to-report-path">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">证据到报告路径</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
            报告不是单独生成的页面，而是公开证据、实体跟踪、证据草稿和人工发布动作连起来后的结果。
          </p>
        </div>
        <StatusChip label={readiness.actionLabel} tone={readiness.isFormalPublicReport ? "success" : "caution"} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ReportPathStep
          detail={`${selectedReport.usable_item_count}/${selectedReport.retrieved_item_count}`}
          href="/radar"
          label="1. 补证据"
          text="回到雷达确认可用条目、来源覆盖和缺失证据。"
        />
        <ReportPathStep
          detail="跟踪对象"
          href="/entities"
          label="2. 看实体"
          text="判断公司、模型、产品或论文是否只是单点噪音。"
        />
        <ReportPathStep
          detail={`${selectedReport.citations.length} 引用`}
          href="/reports"
          label="3. 草稿核查"
          text="检查引用、来源/类别覆盖和缺失证据，不把草稿当正式结论。"
        />
        <ReportPathStep
          detail={formalCount > 0 ? `${formalCount} 正式` : `${draftCount} 草稿`}
          href="/reports"
          label="4. 发布结论"
          text="完成复核并发布后，才进入正式报告区。"
        />
      </div>

      <p className="mt-4 rounded-md border border-radar-line bg-radar-panel px-3 py-3 text-sm leading-6 text-radar-muted">
        下一步：{nextAction}
      </p>
    </section>
  );
}

function ReportPathStep({
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

function ReportEntityTraceabilityPanel({
  report,
  sectionTraceability,
  traceability
}: {
  report: ReportWorkflowDocument;
  sectionTraceability: ReportSectionTraceability[];
  traceability: ReportEntityTraceability;
}) {
  const coveredSections = sectionTraceability.filter((section) => section.entityTraces.length > 0).length;

  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft" id="report-entity-traceability">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">报告关联实体</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
            这部分把当前报告的公开引用反查到雷达证据，再映射到实体详情页。它说明报告正在支持哪些跟踪对象，也暴露哪些结论仍缺少实体级证据。
          </p>
        </div>
        <StatusChip
          label="traceability"
          tone={traceability.entityTraces.length > 0 ? "success" : "caution"}
          value={traceability.entityTraces.length}
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <ReadinessMetric label="回溯证据" tone={traceability.evidenceItems.length > 0 ? "evidence" : "caution"} value={traceability.evidenceItems.length} />
        <ReadinessMetric label="关联实体" tone={traceability.entityTraces.length > 0 ? "success" : "caution"} value={traceability.entityTraces.length} />
        <ReadinessMetric label="章节覆盖" tone={coveredSections > 0 ? "success" : "caution"} value={coveredSections} />
        <ReadinessMetric label="待复核证据" tone={traceability.needsReviewCount > 0 ? "caution" : "success"} value={traceability.needsReviewCount} />
      </div>

      {traceability.entityTraces.length > 0 ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {traceability.entityTraces.map((trace) => (
            <article className="rounded-lg border border-radar-line bg-radar-panel p-4" key={trace.href}>
              <div className="flex flex-wrap gap-2">
                <StatusChip label={trace.entity.name} tone="evidence" />
                <StatusChip label={trace.insight.priorityLabel} tone={trace.insight.priorityScore >= 80 ? "success" : "evidence"} />
                <EvidenceBadge detail={String(trace.evidenceItemCount)} kind="evidence" label="报告证据" />
                <EvidenceBadge detail={String(trace.sourceCount)} kind="citation" label="来源" />
                <EvidenceBadge detail={String(trace.needsReviewCount)} kind="uncertainty" label="待复核" />
              </div>
              <p className="mt-3 text-sm leading-6 text-radar-muted">
                {publicText(trace.insight.reasons[0] ?? "该实体与当前报告引用存在公开证据关联。")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  className="rounded-md bg-radar-ink px-3 py-2 text-sm font-semibold text-white hover:bg-black"
                  href={trace.href}
                >
                  打开实体详情
                </a>
                <a
                  className="rounded-md border border-radar-line bg-white px-3 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
                  href={`/radar?entity=${encodeURIComponent(trace.entity.name)}`}
                >
                  查看雷达证据
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState
            description={`“${publicText(report.title)}”当前没有可回溯到实体详情页的公开引用。请补齐 source_item_ids、citations 或更多可用雷达证据后再发布正式结论。`}
            title="暂无可回溯实体"
          />
        </div>
      )}

      {traceability.missingEvidenceCount > 0 ? (
        <p className="mt-4 rounded-md border border-radar-caution/30 bg-radar-caution/5 px-3 py-3 text-sm leading-6 text-radar-caution">
          当前报告仍有 {traceability.missingEvidenceCount} 条缺失证据说明；实体关联只能解释已有引用，不能替代补证据。
        </p>
      ) : null}
    </section>
  );
}

function ReadinessMetric({
  label,
  tone,
  value
}: {
  label: string;
  tone: StatusTone;
  value: number;
}) {
  return (
    <div className="rounded-md border border-radar-line bg-white p-3">
      <StatusChip label={label} tone={tone} value={value} />
    </div>
  );
}

function ReportOverviewCard({
  isSelected,
  report
}: {
  isSelected: boolean;
  report: ReportWorkflowDocument;
}) {
  const readiness = reportPublishingReadiness(report);

  return (
    <article
      className={`rounded-lg border p-5 shadow-soft ${
        isSelected ? "border-radar-evidence bg-white" : "border-radar-line bg-white"
      }`}
    >
      <div className="flex flex-wrap gap-2">
        <StatusChip label={reportTypeLabel(report.report_type)} tone="evidence" />
        <StatusChip
          label={readiness.actionLabel}
          tone={readiness.isFormalPublicReport ? "success" : readiness.isPublishableCandidate ? "admin" : "caution"}
        />
        <StatusChip label={qualityLabel(report)} tone={qualityTone(report)} />
        <StatusChip label={statusLabel(report.status)} tone={statusTone(report.status)} />
        <StatusChip label={readSourceLabel(report)} tone={isSavedReportSource(report) ? "success" : "caution"} />
        <EvidenceBadge detail={String(report.usable_item_count)} kind="evidence" label="可用" />
        <EvidenceBadge detail={String(report.citations.length)} kind="citation" label="引用" />
        <EvidenceBadge detail={`${report.distinct_source_count}/${report.category_count}`} kind="freshness" label="来源/类别" />
        <EvidenceBadge detail={String(report.caveats.length)} kind="uncertainty" label="局限" />
      </div>
      <h3 className="mt-4 text-xl font-semibold leading-7 text-radar-ink">{publicText(report.title)}</h3>
      <p className="mt-3 text-sm leading-6 text-radar-muted">{publicText(report.one_sentence_summary)}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <RailRow label="生成时间" value={report.generated_at} />
        <RailRow label="时间窗口" value={`${report.time_window.start} 至 ${report.time_window.end}`} />
        <RailRow label="质量门禁" value={qualityLabel(report)} />
        <RailRow label="缺失证据" value={String(report.missing_evidence.length)} />
        <RailRow label="报告正文" value={report.markdown.trim().length > 0 ? "已生成" : "未生成"} />
      </dl>
      {readiness.reasons.length > 0 ? (
        <div className="mt-4 rounded-md border border-radar-caution/30 bg-radar-caution/5 px-3 py-3 text-sm leading-6 text-radar-caution">
          {publicText(readiness.reasons[0])}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          href={`/reports?type=${report.report_type}`}
        >
          查看{reportTypeLabel(report.report_type)}
        </a>
        {report.id ? (
          <a
            className="rounded-md border border-radar-line px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
            href={`/reports/${report.id}`}
          >
            打开保存记录
          </a>
        ) : null}
      </div>
    </article>
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
        <StatusChip label={reportTypeLabel(report.report_type)} tone={isSelected ? "evidence" : "neutral"} />
        <StatusChip label={qualityLabel(report)} tone={qualityTone(report)} />
        <StatusChip label={statusLabel(report.status)} tone={statusTone(report.status)} />
        <StatusChip label={modeLabel(report)} tone={publicationTone(report)} />
        <StatusChip label={readSourceLabel(report)} tone={isSavedReportSource(report) ? "success" : "caution"} />
        <EvidenceBadge detail={String(report.citations.length)} kind="citation" label="引用" />
      </div>
      <h2 className="mt-4 text-xl font-semibold leading-7 text-radar-ink">
        {publicText(report.title)}
      </h2>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-radar-muted">
        {publicText(report.one_sentence_summary)}
      </p>
    </a>
  );
}

function ReportSectionView({
  section,
  traceability
}: {
  section: GeneratedReportSection;
  traceability: ReportSectionTraceability | undefined;
}) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-radar-ink">{publicText(section.title)}</h3>
          <p className="mt-2 text-sm leading-6 text-radar-muted">{publicText(section.summary)}</p>
        </div>
        <EvidenceBadge detail={String(section.bullets.length)} kind={section.bullets.length > 0 ? "evidence" : "uncertainty"} label="要点" />
      </div>

      {section.bullets.length > 0 ? (
        <ul className="mt-4 grid gap-2 text-sm leading-6 text-radar-muted">
          {section.bullets.map((bullet) => (
            <li className="rounded-md border border-radar-line bg-radar-panel px-3 py-2" key={bullet}>
              {publicText(bullet)}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          description="当前证据没有为该章节生成要点。"
          title="没有章节要点"
        />
      )}

      <SectionEntityCoverage traceability={traceability} />

      {section.citations.length > 0 || section.caveats.length > 0 || section.missing_evidence.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <InlineList items={section.citations} label="引用 ID" tone="evidence" />
          <InlineList items={section.caveats} label="章节局限" tone="caution" />
          <InlineList items={section.missing_evidence} label="缺失证据" tone="risk" />
        </div>
      ) : null}
    </section>
  );
}

function SectionEntityCoverage({
  traceability
}: {
  traceability: ReportSectionTraceability | undefined;
}) {
  if (!traceability) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-radar-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-radar-ink">章节实体覆盖</h4>
        <EvidenceBadge detail={String(traceability.evidenceItems.length)} kind="evidence" label="证据" />
        <EvidenceBadge detail={String(traceability.entityTraces.length)} kind="freshness" label="实体" />
        <EvidenceBadge detail={String(traceability.sourceCount)} kind="citation" label="来源" />
        <EvidenceBadge detail={String(traceability.needsReviewCount)} kind="uncertainty" label="待复核" />
      </div>

      {traceability.entityTraces.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {traceability.entityTraces.map((trace) => (
            <a
              className="rounded-md border border-radar-line bg-radar-panel px-3 py-2 text-sm font-semibold text-radar-ink hover:border-radar-evidence hover:text-radar-evidence"
              href={trace.href}
              key={trace.href}
            >
              {trace.entity.name} · {trace.evidenceItemCount} 证据
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-radar-line bg-radar-panel px-3 py-3 text-sm leading-6 text-radar-muted">
          本章节引用暂未回溯到可展示实体；如果该章节要进入正式报告，需要补齐 citation id 或可复核公开证据。
        </p>
      )}

      {traceability.missingEvidenceCount > 0 ? (
        <p className="mt-3 text-sm leading-6 text-radar-caution">
          本章节仍有 {traceability.missingEvidenceCount} 条缺失证据说明，实体覆盖不能替代补证据。
        </p>
      ) : null}
    </div>
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
              {publicText(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-radar-muted">此草稿暂无说明。</p>
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
            <li key={item}>{publicText(item)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6 text-radar-muted">无。</p>
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

function qualityTone(report: ReportWorkflowDocument): StatusTone {
  return report.quality_gate_passed ? "success" : "caution";
}

function qualityLabel(report: ReportWorkflowDocument) {
  return report.quality_gate_passed ? "质量通过" : "需要更多数据";
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

function statusLabel(status: GeneratedReportStatus) {
  const labels: Partial<Record<GeneratedReportStatus, string>> = {
    approved: "已批准",
    archived: "已归档",
    deferred: "已延后",
    draft: "草稿",
    needs_review: "待复核",
    preview: "预览",
    published: "已发布",
    rejected: "已拒绝",
    reviewed: "已复核"
  };
  return labels[status] ?? status;
}

function reportTypeLabel(type: ReportPreviewType) {
  return type === "weekly" ? "周报" : "日报";
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

function isFormalPublicReport(report: ReportWorkflowDocument) {
  return report.mode === "saved_report" && (report.status === "reviewed" || report.status === "published");
}

function publicationLabel(report: ReportWorkflowDocument) {
  if (report.read_source === "generated_preview") {
    return "生成预览";
  }

  if (report.mode === "saved_candidate") {
    if (report.status === "approved") {
      return "已批准候选";
    }

    if (report.status === "published") {
      return "候选已发布";
    }

    return "已保存候选";
  }

  if (report.mode === "saved_report") {
    if (report.status === "published") {
      return "已发布报告";
    }

    if (report.status === "reviewed") {
      return "已复核报告";
    }

    return "已保存报告";
  }

  return modeLabel(report);
}

function readSourceLabel(report: ReportWorkflowDocument) {
  if (report.read_source === "supabase") {
    return "已保存工作流";
  }

  if (report.read_source === "public_snapshot") {
    return "公开报告快照";
  }

  return "生成预览";
}

function isSavedReportSource(report: ReportWorkflowDocument) {
  return report.read_source === "supabase" || report.read_source === "public_snapshot";
}

function modeLabel(report: ReportWorkflowDocument) {
  if (report.mode === "saved_candidate") {
    if (report.status === "approved") {
      return "已批准报告候选";
    }

    return "已保存报告候选";
  }

  if (report.mode === "saved_report") {
    if (report.status === "published") {
      return "已发布报告";
    }

    if (report.status === "reviewed") {
      return "已复核保存报告";
    }

    return "已保存报告记录";
  }

  if (report.mode === "live_deepseek") {
    return "证据草稿";
  }

  return "证据草稿";
}

function publicText(value: string) {
  return value
    .replace(
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "此页面是公开只读情报快照，不提供账号、后台操作或写入能力。"
    )
    .replace(
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      "只纳入可公开引用的雷达和报告字段；私有原文、内部备注和凭据均不展示。"
    )
    .replace(
      "Snapshot data came from Supabase public-safe read views using anon read access.",
      "快照数据来自公开只读证据视图。"
    )
    .replace(
      "Radar rows came from Supabase public-safe read views. Report candidates are projected to the same public-safe field allowlist during export.",
      "雷达条目和报告摘要使用同一组公开可读字段。"
    )
    .replace(
      "Full article text or original announcements are needed beyond metadata-level evidence.",
      "除了元数据级证据外，仍需要完整文章正文或原始公告。"
    )
    .replace(
      "Read-only Supabase public radar retrieval was used; no Supabase write path ran.",
      "使用公开证据库进行检索；只展示可公开引用的结构化字段。"
    )
    .replace(
      "This surface shows available AI Radar evidence only; it is not a claim of complete current AI industry coverage.",
      "此页面只展示当前可用的 AI 行业雷达证据，不声称覆盖完整的实时 AI 行业。"
    )
    .replace("This is a deterministic preview, not a published report.", "这是证据预览，不是已发布报告。")
    .replace(
      "No live DeepSeek call, Supabase write, or scheduled persistence job was run.",
      "报告基于当前已入库证据，仍需人工复核后发布。"
    )
    .replace(
      "Live DeepSeek synthesis failed; deterministic report draft is shown instead.",
      "DeepSeek 生成未完成，当前展示基于证据的可复核草稿。"
    )
    .replace(
      "Supabase coverage depends on rows already persisted into the public retrieval view.",
      "覆盖范围取决于已经入库或快照化的公开证据。"
    )
    .replace(
      "The preview has fewer than 3 usable items, so report synthesis should remain narrow.",
      "该预览少于 3 条可用条目，因此报告综合应保持收窄。"
    )
    .replace(
      "No usable item in this window is marked included; report language must remain provisional.",
      "该时间窗口内没有标记为已纳入的可用条目，报告措辞必须保持暂定。"
    )
    .replace(
      "More independent items are needed for a broad daily or weekly synthesis.",
      "需要更多独立条目才能形成宽口径日报或周报综合。"
    )
    .replace(
      "Report quality gate did not pass; keep this candidate in needs_review until more data is available.",
      "报告质量门禁未通过；在补充更多数据前，该候选应保持待复核。"
    )
    .replace(/usable_items (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 条可用条目低于${reportTypeLabel(type as ReportPreviewType)}最低要求 ${minimum} 条`)
    .replace(/citations (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 条引用低于${reportTypeLabel(type as ReportPreviewType)}最低要求 ${minimum} 条`)
    .replace(/distinct_sources (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 个独立来源低于${reportTypeLabel(type as ReportPreviewType)}最低要求 ${minimum} 个`)
    .replace(/categories (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 个类别低于${reportTypeLabel(type as ReportPreviewType)}最低要求 ${minimum} 个`)
    .replace(
      "Human review is needed before treating any item as confirmed.",
      "任何条目在视为确认前都需要人工复核。"
    )
    .replace(
      "No retrieved radar items in this window support this section.",
      "该时间窗口内没有检索到可支撑本章节的雷达条目。"
    )
    .replace(
      "No usable radar evidence currently supports this section.",
      "当前没有可用雷达证据支撑本章节。"
    )
    .replace(/Weekly AI Radar preview - ending /g, "AI 行业雷达周报预览 - 截至 ")
    .replace(/Daily AI Radar preview - /g, "AI 行业雷达日报预览 - ")
    .replace(/^Potentially relevant AI signal for review: /, "可能相关的待复核 AI 信号：")
    .replace(/^May affect model capability tracking and product benchmarking: /, "可能影响模型能力跟踪和产品基准：")
    .replace(/Deterministic daily preview from (\d+) usable radar item\(s\)\./g, "日报证据预览基于 $1 条可用雷达条目。")
    .replace(/Deterministic weekly preview from (\d+) usable radar item\(s\)\./g, "周报证据预览基于 $1 条可用雷达条目。")
    .replace(/(\d+) included and (\d+) needs_review item\(s\)\./g, "$1 条已纳入，$2 条待复核。")
    .replace(
      /(\d+) item\(s\) are marked needs_review and require human confirmation before confident synthesis\./g,
      "$1 条标记为待复核，需要人工确认后才能进行高置信综合。"
    )
    .replace(/(\d+) radar item\(s\) matched this section\./g, "$1 条雷达条目匹配本章节。")
    .replace(/(\d+) still need review\./g, "$1 条仍需复核。")
    .replace(/Model \/ product \/ company updates/g, "模型/产品/公司更新")
    .replace(/Research \/ open-source/g, "研究/开源")
    .replace(/Agents \/ products/g, "智能体/产品")
    .replace(/Business \/ ecosystem/g, "商业/生态")
    .replace(/Weak signals \/ needs_review/g, "弱信号/待复核")
    .replace(/needs_review/g, "待复核")
    .replace(/included/g, "已纳入")
    .replace(/Visible categories: ([^.]+)\./g, (_, categories: string) => {
      return `可见类别： ${categories
        .split(",")
        .map((category) => labelizeReportCategory(category.trim()))
        .join("、")}。`;
    })
    .replace(/Visible categories:/g, "可见类别：")
    .replace(/Top visible signal:/g, "最高可见信号：")
    .replace(/(最高可见信号：[^.。]+) from ([^.。]+)([.。])/g, "$1 来自 $2$3")
    .replace(/Deterministic daily preview/g, "日报证据预览")
    .replace(/Deterministic weekly preview/g, "周报证据预览")
    .replace(/usable radar item\(s\)/g, "条可用雷达条目")
    .replace(/usable item\(s\)/g, "条可用条目")
    .replace(/radar item\(s\)/g, "条雷达条目");
}

function labelizeReportCategory(value: string) {
  const labels: Record<string, string> = {
    agent: "智能体",
    benchmark: "基准",
    business: "商业",
    infrastructure: "基础设施",
    model_release: "模型发布",
    open_source: "开源",
    other: "其他",
    policy: "政策",
    product_update: "产品更新",
    research: "研究",
    safety: "安全",
    tooling: "工具"
  };

  return labels[value] ?? value.replace(/_/g, " ");
}
