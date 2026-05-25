import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EmptyState } from "@/components/empty-state";
import { EvidenceBadge } from "@/components/evidence-badge";
import { ReportMarkdownExport } from "@/components/report-markdown-export";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import {
  loadPublicDataCompletenessSummary,
  type PublicDataCompletenessSummary
} from "@/lib/data-completeness/public-summary";
import { loadReportWorkflowData } from "@/lib/reports/load-report-data";
import type {
  GeneratedReportSection,
  GeneratedReportStatus,
  ReportPreviewType,
  ReportWorkflowDocument
} from "@/lib/reports/types";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const selectedType = readReportType(firstParam(params.type));
  const [data, coverage] = await Promise.all([
    loadReportWorkflowData(),
    loadPublicDataCompletenessSummary()
  ]);
  const selectedReport =
    data.reports.find((report) => report.report_type === selectedType) ?? data.reports[0];

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip detail={modeLabel(selectedReport)} source={selectedReport.data_source} />
            <StatusChip label="报告状态" tone={statusTone(selectedReport.status)} value={statusLabel(selectedReport.status)} />
            <StatusChip label="保存模式" tone={selectedReport.read_source === "supabase" ? "success" : "caution"} value={readSourceLabel(selectedReport)} />
            <StatusChip label="发布状态" tone={publicationTone(selectedReport)} value={publicationLabel(selectedReport)} />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">报告</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            日报和周报优先读取已保存的 Supabase 报告工作流记录。没有保存记录时，页面回退到基于检索证据的确定性草稿，并保留不确定性。
          </p>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            工作流边界
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <RailRow label="选中类型" value={reportTypeLabel(selectedReport.report_type)} />
            <RailRow label="候选数量" value={String(coverage.reportCandidates ?? data.reports.length)} />
            <RailRow label="保存/生成" value={readSourceLabel(selectedReport)} />
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

      <section className="rounded-lg border border-radar-line bg-radar-panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-radar-ink">最新已保存候选</h2>
            <p className="mt-2 text-sm leading-6 text-radar-muted">
              日报和周报工作流记录是报告台入口。完整草稿前会先显示状态、时间窗口、引用、局限和导出状态。
            </p>
          </div>
          <StatusChip
            label="已保存候选模式"
            tone={data.reports.some((report) => report.read_source === "supabase") ? "success" : "caution"}
            value={data.reports.filter((report) => report.read_source === "supabase").length}
          />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {data.reports.map((report) => (
            <ReportOverviewCard
              isSelected={report.report_type === selectedReport.report_type}
              key={report.report_type}
              report={report}
            />
          ))}
        </div>
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
              选中草稿
            </p>
            <h2 className="mt-2 text-lg font-semibold leading-7 text-radar-ink">
              {selectedReport.title}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip source={selectedReport.data_source} />
            <EvidenceBadge detail={`${selectedReport.usable_item_count}/${selectedReport.retrieved_item_count}`} kind="evidence" label="可用" />
            <EvidenceBadge detail={String(selectedReport.citations.length)} kind="citation" label="引用" />
            <EvidenceBadge detail={String(selectedReport.missing_evidence.length)} kind="uncertainty" label="缺口" />
          </div>
          <dl className="space-y-3 text-sm">
            <RailRow label="状态" value={statusLabel(selectedReport.status)} />
            <RailRow label="模式" value={modeLabel(selectedReport)} />
            <RailRow label="发布" value={publicationLabel(selectedReport)} />
            <RailRow label="保存时间" value={selectedReport.saved_at ?? "未保存"} />
            <RailRow label="模型/API 调用" value={`${selectedReport.model_metadata.provider}; ${selectedReport.model_metadata.api_call_count} 次`} />
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
              href="/write"
            >
              到写作台展开
            </a>
          </div>
        </aside>

        <div className="space-y-5">
          <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
            <div className="flex flex-wrap gap-2">
              <EvidenceBadge kind="evidence" label="摘要" />
              <StatusChip label="报告状态" tone={statusTone(selectedReport.status)} value={statusLabel(selectedReport.status)} />
              <StatusChip label="Supabase 写入" tone="neutral" value={selectedReport.read_source === "supabase" ? "已保存记录" : "无"} />
            </div>
            <p className="mt-4 text-lg leading-8 text-radar-ink">
              {publicText(selectedReport.one_sentence_summary)}
            </p>
            <p className="mt-3 text-sm leading-6 text-radar-muted">
              {selectedReport.executive_summary ? publicText(selectedReport.executive_summary) : selectedReport.executive_summary}
            </p>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-radar-ink">报告章节</h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                章节会保留证据边界，并显式标出空白或薄弱区域。
              </p>
            </div>
            {selectedReport.sections.length > 0 ? (
              selectedReport.sections.map((section) => (
                <ReportSectionView key={section.id} section={section} />
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

          <ReportMarkdownExport markdown={selectedReport.markdown} />
        </div>
      </section>
    </div>
  );
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
            <EvidenceBadge detail={String(report.usable_item_count)} kind="evidence" label="条目数" />
            <EvidenceBadge detail={String(report.citations.length)} kind="citation" label="引用数" />
            <StatusChip label={statusLabel(report.status)} tone={statusTone(report.status)} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm leading-6 text-radar-muted">暂无候选。</p>
      )}
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
  return (
    <article
      className={`rounded-lg border p-5 shadow-soft ${
        isSelected ? "border-radar-evidence bg-white" : "border-radar-line bg-white"
      }`}
    >
      <div className="flex flex-wrap gap-2">
        <StatusChip label={reportTypeLabel(report.report_type)} tone="evidence" />
        <StatusChip label={statusLabel(report.status)} tone={statusTone(report.status)} />
        <StatusChip label={readSourceLabel(report)} tone={report.read_source === "supabase" ? "success" : "caution"} />
        <EvidenceBadge detail={String(report.usable_item_count)} kind="evidence" label="可用" />
        <EvidenceBadge detail={String(report.citations.length)} kind="citation" label="引用" />
        <EvidenceBadge detail={String(report.caveats.length)} kind="uncertainty" label="局限" />
      </div>
      <h3 className="mt-4 text-xl font-semibold leading-7 text-radar-ink">{publicText(report.title)}</h3>
      <p className="mt-3 text-sm leading-6 text-radar-muted">{publicText(report.one_sentence_summary)}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <RailRow label="生成时间" value={report.generated_at} />
        <RailRow label="时间窗口" value={`${report.time_window.start} 至 ${report.time_window.end}`} />
        <RailRow label="缺失证据" value={String(report.missing_evidence.length)} />
        <RailRow label="Markdown 字节" value={String(report.markdown.length)} />
      </dl>
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
        <StatusChip label={statusLabel(report.status)} tone={statusTone(report.status)} />
        <StatusChip label={modeLabel(report)} tone={publicationTone(report)} />
        <StatusChip label={readSourceLabel(report)} tone={report.read_source === "supabase" ? "success" : "caution"} />
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

function ReportSectionView({ section }: { section: GeneratedReportSection }) {
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
  return report.read_source === "supabase" ? "已保存工作流" : "生成预览";
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

  if (report.model_metadata.mode === "live_deepseek") {
    return "Live DeepSeek 草稿";
  }

  return "确定性草稿";
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
      "快照数据来自 Supabase 公开安全只读视图，并使用 anon 只读访问。"
    )
    .replace(
      "Read-only Supabase public radar retrieval was used; no Supabase write path ran.",
      "使用 Supabase 公共雷达视图进行只读检索；未运行 Supabase 写入路径。"
    )
    .replace(
      "This surface shows available AI Radar evidence only; it is not a claim of complete current AI industry coverage.",
      "此页面只展示当前可用的 AI 行业雷达证据，不声称覆盖完整的实时 AI 行业。"
    )
    .replace("This is a deterministic preview, not a published report.", "这是确定性预览，不是已发布报告。")
    .replace(
      "No live DeepSeek call, Supabase write, or scheduled persistence job was run.",
      "未运行 Live DeepSeek 调用、Supabase 写入或计划任务持久化。"
    )
    .replace(
      "Supabase coverage depends on rows already persisted into the public retrieval view.",
      "Supabase 覆盖范围取决于已经持久化到公共检索视图的行。"
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
    .replace(/Deterministic daily preview from (\d+) usable radar item\(s\)\./g, "确定性日报预览基于 $1 条可用雷达条目。")
    .replace(/Deterministic weekly preview from (\d+) usable radar item\(s\)\./g, "确定性周报预览基于 $1 条可用雷达条目。")
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
    .replace(/Deterministic daily preview/g, "确定性日报预览")
    .replace(/Deterministic weekly preview/g, "确定性周报预览")
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
