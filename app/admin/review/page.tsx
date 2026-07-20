import Link from "next/link";

import { StatusChip } from "@/components/status-chip";
import { getReviewDashboardData } from "@/lib/admin/review";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminReviewPage() {
  const data = await getReviewDashboardData();
  const sections = [
    {
      title: "待复核事件",
      rows: data.radarItemsNeedingReview.rows.map((row) => ({
        detail: `${row.sourceName} · ${row.status} · ${Math.round(row.confidence * 100)}%`,
        id: row.id,
        label: row.title
      }))
    },
    {
      title: "缺少公开 URL 的来源",
      rows: data.missingPublicUrlSources.rows.map((row) => ({
        detail: `${row.status} · ${row.crawlMethod} · ${row.reason}`,
        id: row.id,
        label: row.name
      }))
    },
    {
      title: "来源变更请求",
      rows: data.sourceChangeRequests.rows.map((row) => ({
        detail: `${row.requestType} · ${row.status} · ${row.rationale}`,
        id: row.id,
        label: row.sourceName ?? row.sourceSlug ?? row.id
      }))
    },
    {
      title: "复核任务",
      rows: data.reviewTasks.rows.map((row) => ({
        detail: `${row.priority} · ${row.status} · ${row.description}`,
        id: row.id,
        label: row.title
      }))
    },
    {
      title: "最近审计",
      rows: data.auditEvents.rows.map((row) => ({
        detail: `${row.action} · ${row.createdAt ?? "时间未知"}`,
        id: row.id,
        label: row.summary
      }))
    }
  ];

  return (
    <div className="space-y-8">
      <header className="border-b border-radar-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="Admin" tone="admin" />
          <StatusChip label="只读复核面" tone="evidence" />
        </div>
        <h1 className="mt-4 text-4xl font-semibold text-radar-ink">事件与来源复核</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          集中查看待复核事件、缺少公开地址的来源、来源变更请求和后台审计记录。
        </p>
      </header>

      {data.warnings.length > 0 ? (
        <section className="rounded-md border border-radar-caution/40 bg-radar-caution/5 p-4">
          <h2 className="font-semibold text-radar-ink">读取提示</h2>
          <ul className="mt-2 space-y-1 text-sm text-radar-muted">
            {data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      ) : null}

      {sections.map((section) => (
        <ReviewSection key={section.title} rows={section.rows} title={section.title} />
      ))}

      <Link className="inline-flex text-sm font-semibold text-radar-evidence" href="/admin">
        返回后台首页
      </Link>
    </div>
  );
}

function ReviewSection({
  rows,
  title
}: {
  rows: Array<{ detail: string; id: string; label: string }>;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-radar-ink">{title}</h2>
        <StatusChip label="条目" tone="neutral" value={rows.length} />
      </div>
      <div className="mt-4 divide-y divide-radar-line">
        {rows.length > 0 ? rows.map((row) => (
          <article className="py-3" key={row.id}>
            <h3 className="text-sm font-semibold text-radar-ink">{row.label}</h3>
            <p className="mt-1 text-xs leading-5 text-radar-muted">{row.detail}</p>
          </article>
        )) : <p className="py-4 text-sm text-radar-muted">当前没有待处理条目。</p>}
      </div>
    </section>
  );
}
