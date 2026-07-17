import Link from "next/link";

import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import {
  type CountEntry,
  type ProductDataSummary,
  loadProductDataSummary
} from "@/lib/product/data-summary";
import { evidenceFreshnessStatus } from "@/lib/product/freshness";
import type { ReportWorkflowDocument } from "@/lib/reports/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const summary = await loadProductDataSummary();
  const freshness = evidenceFreshnessStatus(summary.latest.radar);
  const heroView = freshness.isStale ? "行业精选快照" : "今日行业精选";
  const heroDescription = freshness.isStale
    ? "基于最近可见公开证据，追踪 AI 行业事件、热点强度、来源健康、引用和局限；陈旧数据不会包装成今日实时情报。"
    : "基于公开证据追踪 AI 行业事件、热点强度和值得持续关注的模型、产品、公司、论文、人物和项目。";

  return (
    <div className="space-y-10">
      <section className="grid gap-8 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceChip detail="公开证据面" source={summary.dataSource} />
            <StatusChip label="仅基于公开信息" tone="evidence" />
            <StatusChip label="当前视图" tone={freshness.isStale ? "caution" : "success"} value={heroView} />
            <StatusChip label="覆盖率" tone="caution" value="持续补齐" />
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-radar-ink sm:text-5xl">
            AI 行业情报雷达
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-radar-muted">
            {heroDescription}
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
              围绕精选提问
            </Link>
          </div>
        </div>

        <PublicCoveragePanel summary={summary} />
      </section>

      {freshness.warning ? <DataFreshnessAlert warning={freshness.warning} /> : null}

      <CuratedEvents isStale={freshness.isStale} summary={summary} />

      <ReaderDecisionSummary freshnessIsStale={freshness.isStale} summary={summary} />

      <ReaderCompass summary={summary} />

      <IntelligenceWorkflow summary={summary} />

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

function PublicCoveragePanel({ summary }: { summary: ProductDataSummary }) {
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
          公开覆盖状态
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
        <RailRow label="公开边界" value="只展示公开证据字段；不展示内部运营表和凭据" />
        <RailRow label="来源到公开覆盖率" value={formatRate(coverage.rates.sourcePublicVisibility)} />
      </div>
    </aside>
  );
}

function ReaderDecisionSummary({
  freshnessIsStale,
  summary
}: {
  freshnessIsStale: boolean;
  summary: ProductDataSummary;
}) {
  const formalReports = formalPublicReportCount(summary);
  const availableReports = [summary.reports.daily, summary.reports.weekly].filter(Boolean).length;
  const evidenceDrafts = Math.max(0, availableReports - formalReports);
  const topCategory = summary.topCategories[0]?.label ?? "待补";
  const multiSourceHint =
    summary.eventCount > 0
      ? `先读事件层，再进入实体页确认是否有多来源和报告引用。`
      : "当前事件层不足，先从雷达列表和来源覆盖判断是否需要补证据。";

  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">读者判断摘要</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
            先判断哪些内容可以作为结论，哪些只是需要继续跟踪的线索。
          </p>
        </div>
        <StatusChip label={freshnessIsStale ? "快照" : "当前"} tone={freshnessIsStale ? "caution" : "success"} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DecisionCard label="优先阅读" text={`${summary.eventCount} 个事件，当前量级最高的分类是 ${topCategory}。`} />
        <DecisionCard label="证据边界" text={`${summary.counts.included} 条已纳入，${summary.counts.needsReview} 条待复核；结论优先使用已纳入证据。`} />
        <DecisionCard label="报告状态" text={`正式报告 ${formalReports} 份，证据草稿 ${evidenceDrafts} 份；草稿只用于看缺口。`} />
        <DecisionCard label="下一步" text={multiSourceHint} />
      </div>
    </section>
  );
}

function DecisionCard({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-radar-line bg-radar-panel p-4">
      <div className="text-sm font-semibold text-radar-ink">{label}</div>
      <p className="mt-2 text-sm leading-6 text-radar-muted">{text}</p>
    </div>
  );
}

function ReaderCompass({ summary }: { summary: ProductDataSummary }) {
  const groups = [
    {
      count: summary.counts.visibleRadarItems,
      detail: "先看 Top3 与事件层",
      href: "/radar",
      label: "热点"
    },
    {
      count: countForRawCategories(summary, ["model_release", "benchmark"]),
      detail: "模型发布、基准与能力变化",
      href: radarCategoryHref(["model_release", "benchmark"]),
      label: "模型"
    },
    {
      count: countForRawCategories(summary, ["agent", "product_update"]),
      detail: "Agent、产品更新和工作流",
      href: radarCategoryHref(["agent", "product_update"]),
      label: "产品/Agent"
    },
    {
      count: countForRawCategories(summary, ["open_source", "infrastructure"]),
      detail: "开源项目、开发者工具和基础设施",
      href: radarCategoryHref(["open_source", "infrastructure"]),
      label: "开发者/开源"
    },
    {
      count: countForRawCategories(summary, ["research"]),
      detail: "论文、技术路线和早期信号",
      href: radarCategoryHref(["research"]),
      label: "论文/技术"
    },
    {
      count: countForRawCategories(summary, ["business", "funding", "regulation", "safety"]),
      detail: "商业、融资、监管和安全",
      href: radarCategoryHref(["business", "funding", "regulation", "safety"]),
      label: "商业/政策"
    }
  ];
  const sourceHealth = [
    { label: "成功来源", value: summary.coverage.fetchedSources, tone: "success" as const },
    { label: "失败来源", value: summary.coverage.failedSources, tone: "risk" as const },
    { label: "手动阻断", value: summary.coverage.blockedManualSources, tone: "caution" as const },
    { label: "有公开条目", value: formatCount(summary.coverage.sourcesWithPublicItems), tone: "evidence" as const }
  ];

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-radar-ink">读者分类入口</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
              按读者要回答的问题进入雷达，而不是按内部表结构理解数据。
            </p>
          </div>
          <StatusChip label="分类" tone="evidence" value={groups.length} />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <Link
              className="rounded-md border border-radar-line bg-radar-panel p-4 hover:border-radar-evidence"
              href={group.href}
              key={group.label}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-radar-ink">{group.label}</h3>
                <StatusChip label="信号" tone={group.count > 0 ? "success" : "neutral"} value={group.count} />
              </div>
              <p className="mt-2 text-xs leading-5 text-radar-muted">{group.detail}</p>
            </Link>
          ))}
        </div>
      </div>
      <aside className="rounded-lg border border-radar-line bg-radar-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-radar-ink">来源健康</h2>
          <StatusChip label="公开摘要" tone="evidence" />
        </div>
        <div className="mt-4 grid gap-3">
          {sourceHealth.map((item) => (
            <div className="rounded-md border border-radar-line bg-white p-3" key={item.label}>
              <StatusChip label={item.label} tone={item.tone} value={item.value} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-radar-muted">
          这里展示公开快照中的来源健康摘要；具体修复任务不在读者页展开。
        </p>
      </aside>
    </section>
  );
}

function IntelligenceWorkflow({ summary }: { summary: ProductDataSummary }) {
  const formalReportCount = formalPublicReportCount(summary);
  const steps = [
    {
      detail: formatCount(summary.coverage.sourcesWithPublicItems),
      label: "公开来源",
      text: "只纳入可公开引用的来源和结构化字段。",
      tone: "evidence" as const
    },
    {
      detail: summary.counts.visibleRadarItems,
      label: "雷达信号",
      text: "按状态、类别、来源和时间窗口保留证据边界。",
      tone: "freshness" as const
    },
    {
      detail: summary.eventCount,
      label: "事件聚类",
      text: "把重复信号合并成可追踪的行业事件。",
      tone: "admin" as const
    },
    {
      detail: formalReportCount,
      label: "已审核/发布",
      text: "未审核候选不进入公开报告；没有发布记录时只显示证据草稿。",
      tone: formalReportCount > 0 ? "success" as const : "caution" as const
    }
  ];

  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">可信判断链路</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
            AI Radar 的公开内容从证据出发，不把模型生成文本直接当作产品结论。
          </p>
        </div>
        <Link className="text-sm font-semibold text-radar-evidence" href="/reports">
          查看报告状态
        </Link>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {steps.map((step, index) => (
          <div className="rounded-md border border-radar-line bg-radar-panel p-4" key={step.label}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-radar-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <StatusChip label={step.label} tone={step.tone} value={step.detail} />
            </div>
            <p className="mt-3 text-sm leading-6 text-radar-muted">{step.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CuratedEvents({ isStale, summary }: { isStale: boolean; summary: ProductDataSummary }) {
  const topEvents = summary.curatedEvents.slice(0, 3);
  const followUpEvents = summary.curatedEvents.slice(3, 7);
  const title = isStale ? "行业精选快照" : "今日行业精选";
  const description = isStale
    ? "按最新可见证据窗口聚合事件；陈旧数据不会包装成今日实时情报。"
    : "事件卡合并同一主题的相关信号，并保留来源数、来源家族、时间线和引用。";

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-radar-ink">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-radar-muted">
            {description}
          </p>
        </div>
        <Link className="text-sm font-semibold text-radar-evidence" href="/radar">
          打开事件雷达
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-radar-ink">
          {isStale ? "Top 3 快照" : "今日 Top 3"}
        </h3>
        <StatusChip label="事件" tone="evidence" value={topEvents.length} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {topEvents.map((event, index) => (
          <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft" key={event.event_cluster_id}>
            <div className="flex flex-wrap gap-2">
              <StatusChip label={`Top ${index + 1}`} tone="admin" />
              <StatusChip label={event.event_score_label} tone={event.event_score_label === "高优先级" ? "success" : "evidence"} />
              <EvidenceBadge detail={String(event.event_score)} kind="evidence" label="分数" />
              <EvidenceBadge detail={String(event.source_count)} kind="citation" label="来源" />
              <EvidenceBadge detail={String(event.related_item_ids.length)} kind="freshness" label="信号" />
            </div>
            <h3 className="mt-3 text-lg font-semibold leading-7 text-radar-ink">{event.canonical_title}</h3>
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
      {followUpEvents.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {followUpEvents.map((event) => (
            <article className="rounded-lg border border-radar-line bg-radar-panel p-4" key={event.event_cluster_id}>
              <div className="flex flex-wrap gap-2">
                <StatusChip label="继续跟踪" tone="evidence" />
                <EvidenceBadge detail={String(event.event_score)} kind="evidence" label="分数" />
                <EvidenceBadge detail={String(event.source_count)} kind="citation" label="来源" />
              </div>
              <h3 className="mt-3 text-base font-semibold leading-7 text-radar-ink">{event.canonical_title}</h3>
              <p className="mt-2 text-sm leading-6 text-radar-muted">{event.summary_zh}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function eventImpactNote(event: ProductDataSummary["curatedEvents"][number]) {
  const text = `${event.canonical_title} ${event.summary_zh} ${event.category} ${event.source_families.join(" ")}`.toLowerCase();
  const entity = primaryEventEntity(event);
  const evidence = eventEvidenceProfile(event);
  const category = eventDecisionCategory(event, text);

  if (category === "benchmark") {
    return `${entity} 的外部评价或基准信号正在变化，适合用来校准采购 shortlist、竞品位置和能力叙事；当前证据强度：${evidence}。`;
  }

  if (category === "business") {
    return `${entity} 出现企业落地或组织采用信号，重点影响采购案例、合规部署和同类客户转化；当前证据强度：${evidence}。`;
  }

  if (category === "model_release") {
    return `${entity} 的版本或模型能力边界发生变化，可能影响升级节奏、兼容性测试和下游能力评估；当前证据强度：${evidence}。`;
  }

  if (category === "product_update") {
    return `${entity} 的产品/API 表面发生变化，优先评估开发者迁移成本、接口兼容性和治理能力；当前证据强度：${evidence}。`;
  }

  if (category === "open_source") {
    return `${entity} 的开源或 SDK 生态出现更新，可能改变工程团队依赖版本、部署路径和集成风险；当前证据强度：${evidence}。`;
  }

  if (category === "agent") {
    return `${entity} 相关智能体或工作流版图出现变化，重点观察产品整合、能力迁移和生态入口变化；当前证据强度：${evidence}。`;
  }

  if (category === "research") {
    return `${entity} 相关研究信号可能影响技术路线或评测方法，适合跟踪是否被产品、开源实现或基准采用；当前证据强度：${evidence}。`;
  }

  if (category === "infrastructure") {
    return `${entity} 指向基础设施、工具链或部署依赖变化，可能影响工程稳定性、运维成本和集成路径；当前证据强度：${evidence}。`;
  }

  if (category === "safety") {
    return `${entity} 出现安全、风险或治理相关信号，适合评估是否改变使用边界、审核要求和组织责任；当前证据强度：${evidence}。`;
  }

  if (category === "regulation") {
    return `${entity} 涉及政策或监管环境变化，可能影响合规优先级、市场进入节奏和产品责任边界；当前证据强度：${evidence}。`;
  }

  if (category === "opinion") {
    return `${entity} 当前更像观点、访谈或社区叙事信号，价值在于提示关注方向，而不是直接形成事实结论；当前证据强度：${evidence}。`;
  }

  return `${entity} 出现新的公开产业信号，适合先作为观察项，等待更多来源确认后再上升为趋势判断；当前证据强度：${evidence}。`;
}

function eventWatchNote(event: ProductDataSummary["curatedEvents"][number]) {
  const text = `${event.canonical_title} ${event.summary_zh} ${event.category}`.toLowerCase();
  const entity = primaryEventEntity(event);
  const category = eventDecisionCategory(event, text);
  const sourceAction =
    event.source_count <= 1
      ? "补第二来源或官方原文"
      : event.source_families.length <= 1
        ? "补跨来源家族确认"
        : "观察多来源叙事是否收敛";
  const citationAction = event.citations.length <= 1 ? "补引用链" : "对比引用间是否有冲突";

  if (category === "benchmark") {
    return `${sourceAction}，并核查 ${entity} 的评价口径、样本范围和竞品对照，避免把营销评级当能力结论。`;
  }

  if (category === "business") {
    return `${sourceAction}，再看部署范围、付费席位、治理限制和后续客户案例，确认是否从试点变成规模采用。`;
  }

  if (category === "model_release") {
    return `${sourceAction}，再检查 release notes、破坏性变更、性能样例和社区 issue，确认是否值得升级。`;
  }

  if (category === "product_update") {
    return `${sourceAction}，再看迁移指南、示例代码、弃用项和安全/审核能力是否影响现有集成。`;
  }

  if (category === "open_source") {
    return `${sourceAction}，再看 changelog、依赖兼容、issue 反馈和采用速度，避免只按版本号判断重要性。`;
  }

  if (category === "agent") {
    return `${sourceAction}，再跟踪产品整合时间线、团队/技术迁移和是否影响现有开发者入口。`;
  }

  if (category === "research") {
    return `${sourceAction}，再看是否有代码、复现实验、基准引用或产品吸收，避免把早期论文直接当产业趋势。`;
  }

  if (category === "infrastructure") {
    return `${sourceAction}，再看部署文档、兼容矩阵、稳定性记录和迁移成本，确认是否会影响现有技术栈。`;
  }

  if (category === "safety") {
    return `${sourceAction}，再核查风险定义、缓解措施、评测口径和责任边界，避免把安全声明当作已验证能力。`;
  }

  if (category === "regulation") {
    return `${sourceAction}，再确认司法辖区、执行时间线、适用对象和合规成本，避免把政策信号误读为即时产品变化。`;
  }

  if (category === "opinion") {
    return `${sourceAction}，再看是否出现官方路线图、产品动作或独立事实来源，避免把观点热度当作趋势证据。`;
  }

  if (event.source_count <= 1) {
    return `${sourceAction}，同时${citationAction}，再决定是否扩大解读。`;
  }

  if (event.source_families.length <= 1) {
    return `${sourceAction}，同时跟踪 ${entity} 相关实体是否出现后续动作。`;
  }

  return `继续跟踪时间线、引用来源变化和 ${entity} 相关实体的新动作。`;
}

function primaryEventEntity(event: ProductDataSummary["curatedEvents"][number]) {
  const title = event.canonical_title.toLowerCase();
  const titleTokens = meaningfulTitleTokens(title);
  const titleMatchedEntity = event.related_entities.find((entity) => {
    const normalized = entity.toLowerCase();
    return normalized.length >= 4 && title.includes(normalized);
  });

  if (titleMatchedEntity) {
    return publicText(titleMatchedEntity);
  }

  const tokenMatchedEntity = event.related_entities.find((entity) => {
    const normalized = entity.toLowerCase();
    return titleTokens.some((token) => token.length >= 4 && normalized.includes(token));
  });

  return tokenMatchedEntity ? publicText(tokenMatchedEntity) : event.related_entities[0] ? publicText(event.related_entities[0]) : categoryLabel(event.category);
}

function eventDecisionCategory(event: ProductDataSummary["curatedEvents"][number], text: string) {
  switch (event.category) {
    case "agent":
    case "benchmark":
    case "business":
    case "model_release":
    case "open_source":
    case "product_update":
    case "research":
      return event.category;
    case "funding":
      return "business";
    case "infrastructure":
    case "tooling":
      return "infrastructure";
    case "media_interview":
    case "opinion":
      return "opinion";
    case "policy":
    case "regulation":
      return "regulation";
    case "safety":
      return "safety";
    case "other":
      return "other";
  }

  if (/benchmark|基准|leader|gartner|评测|ranking/.test(text)) return "benchmark";
  if (/sdk|api|moderation|responses|tool|工具/.test(text)) return "product_update";
  if (/github|开源|repository|transformers|pydantic/.test(text)) return "open_source";
  if (/agent|智能体|codex|acquire|收购|workflow/.test(text)) return "agent";
  if (/research|paper|arxiv|论文|研究/.test(text)) return "research";
  if (/release|发布|版本|v\d|model|模型/.test(text)) return "model_release";
  if (/enterprise|企业|employee|员工|采购|rollout|部署|business|融资/.test(text)) return "business";

  return "other";
}

function meaningfulTitleTokens(title: string) {
  const stopwords = new Set(["发布", "版本", "brings", "named", "leader", "enterprise", "employees", "release", "version", "before", "after", "model", "behavior"]);
  return title
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 3 && !stopwords.has(token));
}

function eventEvidenceProfile(event: ProductDataSummary["curatedEvents"][number]) {
  const sourceProfile =
    event.source_count > 1
      ? `${event.source_count} 个来源`
      : "单来源";
  const familyProfile =
    event.source_families.length > 1
      ? `${event.source_families.length} 类来源`
      : event.source_families[0] ?? "来源类型待补";
  const citationProfile = event.citations.length > 1 ? `${event.citations.length} 条引用` : "1 条引用";

  return `${sourceProfile} / ${familyProfile} / ${citationProfile}`;
}

function categoryLabel(value: string) {
  const labels: Record<string, string> = {
    agent: "智能体",
    benchmark: "基准",
    business: "商业",
    infrastructure: "基础设施",
    model_release: "模型发布",
    open_source: "开源",
    product_update: "产品更新",
    research: "研究",
    safety: "安全",
    tooling: "工具"
  };

  return labels[value] ?? value.replace(/_/g, " ");
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
  const formalCount = reports.filter(isFormalPublicReport).length;
  const draftCount = reports.length - formalCount;

  return (
    <aside className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-radar-ink">报告状态</h2>
          <StatusChip label="已审核/发布" tone={formalCount > 0 ? "success" : "caution"} value={formalCount} />
          <StatusChip label="证据草稿" tone="caution" value={draftCount} />
        </div>
        <p className="mt-2 text-sm leading-6 text-radar-muted">
          已审核或已发布报告可作为正式公开内容；证据草稿只用于理解当前证据，不等同于发布结论。
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
            <StatusChip label={reportKindLabel(report)} tone={isFormalPublicReport(report) ? "success" : "caution"} />
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
        打开报告状态
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
    href: category.href ?? "/radar",
    label: `查看 ${category.label} 信号`,
    meta: `${category.count} 条可见`
  }));
  const prompts = [
    ...categoryQueries,
    {
      href: "/reports",
      label: "检查哪些信号已经支撑正式报告",
      meta: `${summary.reports.savedCount} 份已审核/发布`
    }
  ];

  return (
    <section className="rounded-lg border border-radar-line bg-radar-panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold text-radar-ink">信号行动入口</h2>
        <DataSourceChip source={summary.dataSource} />
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-radar-muted">
        从当前数据结构出发，进入雷达筛选、实体跟踪或报告核查流程。
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
      "此页面是公开只读情报快照，不提供账号、后台操作或写入能力。"
    )
    .replace(
      "Cloudflare Pages 是主要公开只读页面；登录、Admin、服务端操作和写入流程不在公开页面中运行。",
      "此页面是公开只读情报快照，不提供账号、后台操作或写入能力。"
    )
    .replace(
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      "只纳入可公开引用的雷达和报告字段；私有原文、内部备注和凭据均不展示。"
    )
    .replace(
      "只纳入公开安全的雷达和报告字段；私有原文、供应商元数据、内部备注、service-role 访问和密钥均已排除。",
      "只纳入可公开引用的雷达和报告字段；私有原文、内部备注和凭据均不展示。"
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

function DataFreshnessAlert({ warning }: { warning: string }) {
  return (
    <section className="rounded-lg border border-radar-caution/40 bg-radar-caution/10 p-4 text-sm leading-6 text-radar-caution">
      <strong className="text-radar-ink">数据新鲜度提示：</strong>
      <span className="ml-1">{warning}</span>
      <span className="ml-1">雷达、实体和报告都只基于这批公开证据。</span>
    </section>
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

function countForRawCategories(summary: ProductDataSummary, categories: string[]) {
  const targets = new Set(categories);
  return summary.categorySignals.filter((signal) => signal.categories.some((category) => targets.has(category))).length;
}

function radarCategoryHref(categories: string[]) {
  return `/radar?category=${encodeURIComponent(categories.join(","))}`;
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
      <span className="block text-xs font-semibold uppercase tracking-normal text-radar-muted">{label}</span>
      <span className="mt-1 block break-words leading-6 text-radar-ink">{value}</span>
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

function isFormalPublicReport(report: ReportWorkflowDocument | null | undefined) {
  if (!report) {
    return false;
  }

  return report.mode === "saved_report" && (report.status === "reviewed" || report.status === "published");
}

function formalPublicReportCount(summary: ProductDataSummary) {
  return [summary.reports.daily, summary.reports.weekly].filter(isFormalPublicReport).length;
}

function reportKindLabel(report: ReportWorkflowDocument) {
  if (isFormalPublicReport(report)) {
    return report.status === "published" ? "已发布报告" : "已审核报告";
  }

  if (report.mode === "saved_candidate") {
    return report.status === "published" ? "已发布候选" : "已批准候选";
  }

  return "证据草稿";
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
