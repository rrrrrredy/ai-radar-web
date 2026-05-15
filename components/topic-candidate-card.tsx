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
        <StatusChip label="Candidate" tone="neutral" value={String(index + 1).padStart(2, "0")} />
        <StatusChip
          label="Confidence"
          tone={confidenceTone(topic.confidence, needsReview)}
          value={`${Math.round(topic.confidence * 100)}%`}
        />
        {needsReview ? (
          <EvidenceBadge
            kind="needs_review"
            label="Review"
            detail="do not treat as confirmed"
          />
        ) : null}
        {observationLens ? (
          <StatusChip label="Observation lens" tone="evidence" value={observationLens} />
        ) : null}
      </div>

      <h2 className="mt-4 text-lg font-semibold leading-7 text-radar-ink">{topic.title}</h2>
      <p className="mt-3 text-sm leading-6 text-radar-muted">{topic.neutral_summary}</p>

      <TopicBlock title="Why it matters" tone="neutral">
        <p className="text-sm leading-6 text-radar-muted">{topic.why_it_matters}</p>
      </TopicBlock>

      <TopicList
        items={topic.evidence}
        title="Evidence"
        tone="evidence"
      />
      <TopicList
        empty="No caveats were returned for this topic."
        items={topic.caveats}
        title="Caveats"
        tone="caution"
      />
      <TopicBlock title="Suggested angle" tone="inference">
        <p className="text-sm leading-6 text-radar-muted">{topic.suggested_angle}</p>
      </TopicBlock>

      {counterpoints.length > 0 ? (
        <TopicList
          items={counterpoints.slice(0, 1)}
          title="Counterpoint to test"
          tone="caution"
        />
      ) : null}
      {missingEvidence.length > 0 ? (
        <TopicList
          items={missingEvidence.slice(0, 1)}
          title="Missing evidence"
          tone="caution"
        />
      ) : null}

      <div className="mt-5 border-t border-radar-line pt-4">
        <CitationList
          citations={topic.citations}
          emptyMessage="No topic-specific citations were returned."
          title="Topic citations"
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
        <p className="text-sm leading-6 text-radar-muted">{empty ?? "No items were returned."}</p>
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
    return "Overseas / domestic";
  }

  if (title.includes("行业重点")) {
    return "Industry focus";
  }

  if (title.toLowerCase().includes("supplemental")) {
    return "Supplemental";
  }

  return "";
}

function toneLabel(tone: "neutral" | "evidence" | "inference" | "caution") {
  if (tone === "evidence") {
    return "Evidence";
  }

  if (tone === "inference") {
    return "Angle";
  }

  if (tone === "caution") {
    return "Caution";
  }

  return "Context";
}
