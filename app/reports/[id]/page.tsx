import { notFound } from "next/navigation";

import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EmptyState } from "@/components/empty-state";
import { EvidenceBadge } from "@/components/evidence-badge";
import { ReportMarkdownExport } from "@/components/report-markdown-export";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { loadReportWorkflowDocumentById } from "@/lib/reports/load-report-data";
import type { GeneratedReportSection, ReportWorkflowDocument } from "@/lib/reports/types";

export default async function ReportDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await loadReportWorkflowDocumentById(decodeURIComponent(id));

  if (!report) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <section className="border-b border-radar-line pb-8">
        <div className="flex flex-wrap gap-2">
          <DataSourceChip detail={modeLabel(report)} source={report.data_source} />
          <StatusChip label="状态" tone={statusTone(report.status)} value={statusLabel(report.status)} />
          <StatusChip label="质量门禁" tone={qualityTone(report)} value={qualityLabel(report)} />
          <StatusChip label="发布状态" tone={publicationTone(report)} value={publicationLabel(report)} />
          <EvidenceBadge detail={String(report.citations.length)} kind="citation" label="引用" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-radar-ink">{publicText(report.title)}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          {publicText(report.executive_summary)}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            className="inline-flex rounded-md border border-radar-line bg-white px-4 py-2 text-sm font-semibold text-radar-ink hover:border-radar-admin hover:text-radar-admin"
            href={`/reports?type=${report.report_type}`}
          >
            返回报告
          </a>
          <a
            className="inline-flex rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            href="/write"
          >
            转到写作
          </a>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DetailMetric label="类型" value={reportTypeLabel(report.report_type)} />
        <DetailMetric label="模式" value={modeLabel(report)} />
        <DetailMetric label="质量门禁" value={qualityLabel(report)} />
        <DetailMetric label="保存时间" value={formatTimestamp(report.saved_at)} />
        <DetailMetric label="生成时间" value={formatTimestamp(report.generated_at)} />
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap gap-2">
          <EvidenceBadge kind="evidence" label="摘要" />
          <EvidenceBadge detail={`${report.usable_item_count}/${report.retrieved_item_count}`} kind="evidence" label="可用条目" />
          <EvidenceBadge detail={String(report.citation_count)} kind="citation" label="引用" />
          <EvidenceBadge detail={`${report.distinct_source_count}/${report.category_count}`} kind="freshness" label="来源/类别" />
        </div>
        <p className="mt-4 text-lg leading-8 text-radar-ink">
          {publicText(report.one_sentence_summary)}
        </p>
      </section>

      {!report.quality_gate_passed ? (
        <DetailList items={report.quality_gate_reasons} title="为什么报告偏薄" tone="caution" />
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-radar-ink">报告章节</h2>
        {report.sections.length > 0 ? (
          report.sections.map((section) => <ReportSection key={section.id} section={section} />)
        ) : (
          <EmptyState
            description="这条保存记录没有结构化报告章节。"
            title="暂无结构化章节"
          />
        )}
      </section>

      <DetailList items={report.caveats} title="局限" tone="caution" />
      <DetailList items={report.missing_evidence} title="缺失证据" tone="risk" />

      <CitationList
        citations={report.citations}
        emptyMessage="此报告暂无引用。"
        title="报告引用"
      />

      <ReportMarkdownExport markdown={report.markdown} />
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-radar-line bg-radar-panel p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-radar-muted">{label}</p>
      <p className="mt-2 break-words text-sm leading-6 text-radar-ink">{value}</p>
    </div>
  );
}

function reportTypeLabel(value: string) {
  if (value === "daily") return "日报";
  if (value === "weekly") return "周报";
  if (value === "topic") return "专题";
  return value;
}

function statusLabel(value: ReportWorkflowDocument["status"]) {
  const labels: Partial<Record<ReportWorkflowDocument["status"], string>> = {
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

  return labels[value] ?? value;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "未保存";
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

function ReportSection({ section }: { section: GeneratedReportSection }) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <h3 className="text-base font-semibold text-radar-ink">{publicText(section.title)}</h3>
      <p className="mt-2 text-sm leading-6 text-radar-muted">{publicText(section.summary)}</p>
      {section.bullets.length > 0 ? (
        <ul className="mt-4 grid gap-2 text-sm leading-6 text-radar-muted">
          {section.bullets.map((bullet) => (
            <li className="rounded-md border border-radar-line bg-radar-panel px-3 py-2" key={bullet}>
              {publicText(bullet)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-radar-muted">暂无章节要点。</p>
      )}
    </section>
  );
}

function DetailList({
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
        <p className="mt-3 text-sm leading-6 text-radar-muted">暂无记录。</p>
      )}
    </section>
  );
}

function statusTone(status: ReportWorkflowDocument["status"]): StatusTone {
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

function qualityTone(report: ReportWorkflowDocument): StatusTone {
  return report.quality_gate_passed ? "success" : "caution";
}

function qualityLabel(report: ReportWorkflowDocument) {
  return report.quality_gate_passed ? "质量通过" : "需要更多数据";
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
    return report.status === "approved" ? "已批准候选" : "已保存候选";
  }

  if (report.status === "published") {
    return "已发布报告";
  }

  if (report.status === "reviewed") {
    return "已复核报告";
  }

  return "已保存报告";
}

function modeLabel(report: ReportWorkflowDocument) {
  if (report.mode === "saved_candidate") {
    return report.status === "approved" ? "已批准报告候选" : "已保存报告候选";
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
      "Report quality gate did not pass; keep this candidate in needs_review until more data is available.",
      "报告质量门禁未通过；在补充更多数据前，该候选应保持待复核。"
    )
    .replace(/usable_items (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 条可用条目低于${reportTypeLabel(type)}最低要求 ${minimum} 条`)
    .replace(/citations (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 条引用低于${reportTypeLabel(type)}最低要求 ${minimum} 条`)
    .replace(/distinct_sources (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 个独立来源低于${reportTypeLabel(type)}最低要求 ${minimum} 个`)
    .replace(/categories (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 个类别低于${reportTypeLabel(type)}最低要求 ${minimum} 个`)
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
