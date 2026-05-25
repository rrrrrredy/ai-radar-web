import { CitationList } from "@/components/citation-list";
import { EvidenceBadge } from "@/components/evidence-badge";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import type { WritingCandidateTopic } from "@/lib/writing-assistant/types";
import type { ReactNode } from "react";

export function TopicCandidateCard({
  counterpoints,
  index,
  missingEvidence,
  topic
}: {
  counterpoints: string[];
  index: number;
  missingEvidence: string[];
  topic: WritingCandidateTopic;
}) {
  const needsReview = topicNeedsReview(topic);
  const observationLens = getObservationLens(topic.title);

  return (
    <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap gap-2">
        <StatusChip label="候选" tone="neutral" value={String(index + 1).padStart(2, "0")} />
        <StatusChip
          label="置信度"
          tone={confidenceTone(topic.confidence, needsReview)}
          value={`${Math.round(topic.confidence * 100)}%`}
        />
        {needsReview ? (
          <EvidenceBadge
            kind="needs_review"
            label="复核"
            detail="不要视为确认结论"
          />
        ) : null}
        {observationLens ? (
          <StatusChip label="观察视角" tone="evidence" value={observationLens} />
        ) : null}
      </div>

      <h2 className="mt-4 text-lg font-semibold leading-7 text-radar-ink">{topic.title}</h2>
      <p className="mt-3 text-sm leading-6 text-radar-muted">{topic.neutral_summary}</p>

      <TopicBlock title="为什么重要" tone="neutral">
        <p className="text-sm leading-6 text-radar-muted">{topic.why_it_matters}</p>
      </TopicBlock>

      <TopicList
        items={topic.evidence}
        title="证据"
        tone="evidence"
      />
      <TopicList
        empty="该选题未返回局限。"
        items={topic.caveats}
        title="局限"
        tone="caution"
      />
      <TopicBlock title="建议角度" tone="inference">
        <p className="text-sm leading-6 text-radar-muted">{topic.suggested_angle}</p>
      </TopicBlock>

      {counterpoints.length > 0 ? (
        <TopicList
          items={counterpoints.slice(0, 1)}
          title="待检验反方观点"
          tone="caution"
        />
      ) : null}
      {missingEvidence.length > 0 ? (
        <TopicList
          items={missingEvidence.slice(0, 1)}
          title="缺失证据"
          tone="caution"
        />
      ) : null}

      <div className="mt-5 border-t border-radar-line pt-4">
        <CitationList
          citations={topic.citations}
          emptyMessage="未返回该选题的专属引用。"
          title="选题引用"
          variant="embedded"
        />
      </div>
    </article>
  );
}

function TopicBlock({
  children,
  title,
  tone
}: {
  children: ReactNode;
  title: string;
  tone: "neutral" | "evidence" | "inference" | "caution";
}) {
  const badgeKind = tone === "evidence" ? "evidence" : tone === "caution" ? "uncertainty" : "citation";

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-radar-ink">{title}</h3>
        <EvidenceBadge kind={badgeKind} label={toneLabel(tone)} />
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function TopicList({
  empty,
  items,
  title,
  tone
}: {
  empty?: string;
  items: string[];
  title: string;
  tone: "evidence" | "caution";
}) {
  return (
    <TopicBlock title={title} tone={tone}>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              className={`rounded-md border px-3 py-3 text-sm leading-6 ${
                tone === "evidence"
                  ? "border-radar-evidence/20 bg-radar-evidence/5 text-radar-muted"
                  : "border-radar-caution/25 bg-radar-caution/5 text-radar-muted"
              }`}
              key={item}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-radar-muted">{empty ?? "未返回条目。"}</p>
      )}
    </TopicBlock>
  );
}

function topicNeedsReview(topic: WritingCandidateTopic) {
  return (
    topic.confidence < 0.6 ||
    topic.caveats.some((caveat) => caveat.toLowerCase().includes("needs_review")) ||
    topic.evidence.some((evidence) => evidence.toLowerCase().includes("needs_review"))
  );
}

function confidenceTone(confidence: number, needsReview: boolean): StatusTone {
  if (needsReview) {
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

function getObservationLens(title: string) {
  if (title.includes("海外") || title.includes("国内")) {
    return "海外 / 国内";
  }

  if (title.includes("行业重点")) {
    return "行业重点";
  }

  if (title.toLowerCase().includes("supplemental")) {
    return "补充";
  }

  return "";
}

function toneLabel(tone: "neutral" | "evidence" | "inference" | "caution") {
  if (tone === "evidence") {
    return "证据";
  }

  if (tone === "inference") {
    return "角度";
  }

  if (tone === "caution") {
    return "注意";
  }

  return "上下文";
}
