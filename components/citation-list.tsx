import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import type { RetrievalCitation } from "@/lib/retrieval/types";

export function CitationList({
  citations,
  emptyMessage = "此页面未返回引用。",
  title = "引用",
  variant = "section"
}: {
  citations: RetrievalCitation[];
  emptyMessage?: string;
  title?: string;
  variant?: "section" | "embedded";
}) {
  const isEmbedded = variant === "embedded";

  return (
    <section
      aria-label={title}
      className={
        isEmbedded
          ? "space-y-3"
          : "rounded-lg border border-radar-line bg-white p-5 shadow-soft"
      }
    >
      {isEmbedded ? (
        <h3 className="text-sm font-semibold text-radar-ink">{title}</h3>
      ) : (
        <h2 className="text-lg font-semibold text-radar-ink">{title}</h2>
      )}

      {citations.length > 0 ? (
        <div className={isEmbedded ? "space-y-2" : "mt-4 grid gap-3 lg:grid-cols-2"}>
          {citations.map((citation) => (
            <article
              className={
                isEmbedded
                  ? "border-t border-radar-line pt-3 first:border-t-0 first:pt-0"
                  : "rounded-md border border-radar-line bg-radar-panel p-4"
              }
              key={citation.id}
            >
              <div className="flex flex-wrap gap-2">
                <EvidenceBadge
                  detail={citation.source_name}
                  kind="citation"
                  label="来源"
                />
                <EvidenceBadge
                  detail={formatTimestamp(citation.published_at ?? citation.collected_at)}
                  kind="freshness"
                  label={citation.published_at ? "发布时间" : "采集时间"}
                />
                <StatusChip
                  label={`状态: ${statusLabel(citation.status)}`}
                  tone={statusTone(citation.status)}
                />
                <StatusChip
                  label="置信度"
                  tone={confidenceTone(citation.status, citation.confidence)}
                  value={`${Math.round(citation.confidence * 100)}%`}
                />
              </div>

              <a
                className="mt-3 block text-sm font-semibold leading-6 text-radar-ink hover:text-radar-evidence"
                href={citation.url}
                rel="noreferrer"
                target="_blank"
              >
                {citation.title}
              </a>
              <p className="mt-2 break-all font-mono text-xs leading-5 text-radar-muted">
                {citation.url}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className={isEmbedded ? "text-sm leading-6 text-radar-muted" : "mt-3 text-sm leading-6 text-radar-muted"}>
          {emptyMessage}
        </p>
      )}
    </section>
  );
}

function statusTone(status: RetrievalCitation["status"]): StatusTone {
  if (status === "needs_review") {
    return "caution";
  }

  if (status === "failed") {
    return "risk";
  }

  if (status === "included") {
    return "evidence";
  }

  return "neutral";
}

function confidenceTone(status: RetrievalCitation["status"], confidence: number): StatusTone {
  if (status === "needs_review") {
    return "caution";
  }

  if (confidence >= 0.75) {
    return "success";
  }

  if (confidence >= 0.55) {
    return "caution";
  }

  return "risk";
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

function statusLabel(status: RetrievalCitation["status"]) {
  if (status === "included") return "已纳入";
  if (status === "needs_review") return "待复核";
  if (status === "excluded") return "已排除";
  return "失败";
}
