"use client";

import { useState } from "react";

import { AnswerSection } from "@/components/answer-section";
import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { EvidenceRail } from "@/components/evidence-rail";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import type { AskAnswer } from "@/lib/qa/types";
import type { RetrievalCitation, RetrievalDataSource } from "@/lib/retrieval/types";

export type AskRadarClientProps = {
  dataSummary: {
    attemptedSources: number;
    dataSource: RetrievalDataSource;
    latestRadarTime: string;
    sourcesWithPublicItems: number;
    topCategories: Array<{ label: string; count: number }>;
    visibleRows: number;
  };
  initialQuestion: string;
  suggestedQuestions: string[];
};

export function AskRadarClient({
  dataSummary,
  initialQuestion,
  suggestedQuestions
}: AskRadarClientProps) {
  const [question, setQuestion] = useState(initialQuestion || suggestedQuestions[0] || "");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function submitQuestion() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          question,
          language: "zh",
          generationMode: "mock"
        })
      });
      const body = (await response.json()) as AskAnswer | { error?: string };

      if (!response.ok) {
        throw new Error("error" in body && body.error ? body.error : "Request failed.");
      }

      setAnswer(body as AskAnswer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to ask Radar.");
      setAnswer(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip detail="current retrieval surface" source={dataSummary.dataSource} />
            <EvidenceBadge detail={`${dataSummary.visibleRows} rows`} kind="evidence" label="Radar rows" />
            <EvidenceBadge detail={dataSummary.latestRadarTime} kind="freshness" label="Latest" />
            <StatusChip label="Attempted sources" tone="evidence" value={dataSummary.attemptedSources} />
            <StatusChip label="Public sources" tone="success" value={dataSummary.sourcesWithPublicItems} />
            <StatusChip label="Generation" tone="caution" value="mock API mode" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">Ask Radar</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            Query current AI Radar evidence. Suggested questions are shaped by
            the live category mix, and every answer keeps source, time window,
            uncertainty, and citations visible.
          </p>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            Query hub
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {dataSummary.topCategories.map((category) => (
              <StatusChip key={category.label} label={category.label} tone="neutral" value={category.count} />
            ))}
          </div>
          <ol className="mt-4 space-y-2 text-sm leading-6 text-radar-muted">
            {[
              "Choose a live-data question",
              "Run mock generation against retrieval",
              "Review facts, inference, uncertainty, citations"
            ].map((item, index) => (
              <li className="flex gap-3" key={item}>
                <span className="font-mono text-xs font-semibold text-radar-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
          <label className="block" htmlFor="ask-question">
            <span className="text-sm font-semibold text-radar-ink">Question</span>
            <textarea
              className="mt-3 min-h-28 w-full resize-y rounded-md border border-radar-line px-3 py-3 text-sm leading-6 text-radar-ink outline-none focus:border-radar-evidence"
              id="ask-question"
              onChange={(event) => setQuestion(event.target.value)}
              value={question}
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm leading-6 text-radar-muted">
              Public-safe retrieval remains the evidence source; the API request
              shape is unchanged.
            </p>
            <button
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || !question.trim()}
              onClick={submitQuestion}
              type="button"
            >
              {isLoading ? "Asking..." : "Ask"}
            </button>
          </div>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold text-radar-ink">Analytical shortcuts</h2>
          <p className="mt-2 text-xs leading-5 text-radar-muted">
            Each shortcut fills the same question field and keeps retrieval unchanged.
          </p>
          <div className="mt-4 space-y-2">
            {suggestedQuestions.map((suggestion, index) => (
              <button
                className="w-full rounded-md border border-radar-line bg-white px-3 py-3 text-left text-sm leading-6 text-radar-ink hover:border-radar-evidence focus:border-radar-evidence"
                key={suggestion}
                onClick={() => setQuestion(suggestion)}
                type="button"
              >
                <span className="mr-2 font-mono text-xs font-semibold text-radar-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {suggestion}
              </button>
            ))}
          </div>
        </aside>
      </section>

      {error ? (
        <section className="rounded-lg border border-radar-risk/30 bg-radar-risk/5 p-5 text-sm leading-6 text-radar-risk">
          {error}
        </section>
      ) : null}

      {answer ? <AnswerView answer={answer} /> : null}
    </div>
  );
}

function AnswerView({ answer }: { answer: AskAnswer }) {
  const hasEvidence = answer.retrieved_item_count > 0 && answer.citations.length > 0;

  return (
    <section aria-label="Ask Radar answer" className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <EvidenceRail
          citationsCount={answer.citations.length}
          dataSource={answer.data_source}
          freshnessNote={answer.freshness_note}
          generationMode={answer.mode}
          itemCount={answer.retrieved_item_count}
          modelMetadata={answer.model_metadata}
          timeWindow={answer.resolved_time_window}
          title="Data source and time window"
        />

        <div className="space-y-5">
          <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
            <div className="flex flex-wrap gap-2">
              <EvidenceBadge
                detail={hasEvidence ? "bounded by retrieved items" : "no evidence retrieved"}
                kind={hasEvidence ? "evidence" : "uncertainty"}
                label="Short answer"
              />
              <StatusChip
                label="Generation"
                tone={answer.mode === "live" ? "risk" : "caution"}
                value={answer.mode}
              />
            </div>
            <p className="mt-4 text-lg leading-8 text-radar-ink">{answer.short_answer}</p>
            {!hasEvidence ? (
              <p className="mt-4 rounded-md border border-radar-caution/30 bg-radar-caution/5 px-3 py-3 text-sm leading-6 text-radar-caution">
                No citation-backed evidence was retrieved, so this should be read
                as a limited retrieval result rather than a confirmed answer.
              </p>
            ) : null}
          </section>

          <AnswerSection
            description="Direct claims from retrieved radar items. Each row keeps a source label visible."
            title="Facts"
            tone="evidence"
          >
            <ClaimList
              citations={answer.citations}
              empty="No evidence-backed facts were retrieved."
              items={answer.facts}
              kind="fact"
            />
          </AnswerSection>

          <AnswerSection
            description="Interpretation stays visually lower-certainty than facts."
            title="Evidence-backed inference"
            tone="inference"
          >
            <ClaimList
              citations={answer.citations}
              empty="No inference was generated because evidence was insufficient."
              items={answer.evidence_backed_inference}
              kind="inference"
            />
          </AnswerSection>

          <AnswerSection
            description="Missing, stale, local, mock, or needs_review evidence stays visible before citations."
            title="Uncertainty"
            tone="caution"
          >
            <ClaimList
              citations={answer.citations}
              empty="No uncertainty notes were returned."
              items={answer.uncertainty}
              kind="uncertainty"
            />
          </AnswerSection>
        </div>
      </div>

      <CitationList
        citations={answer.citations}
        emptyMessage="No citations available for this response."
        title="Citations"
      />
    </section>
  );
}

function ClaimList({
  citations,
  empty,
  items,
  kind
}: {
  citations: RetrievalCitation[];
  empty: string;
  items: string[];
  kind: "fact" | "inference" | "uncertainty";
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-radar-muted">{empty}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item, index) => {
        const citation = citations.length > 0 ? citations[index % citations.length] : undefined;
        const needsReview = item.toLowerCase().includes("needs_review") || citation?.status === "needs_review";

        return (
          <li className={`rounded-md border p-4 ${claimClasses(kind, needsReview)}`} key={item}>
            <div className="flex flex-wrap gap-2">
              <EvidenceBadge
                detail={claimDetail(kind)}
                kind={kind === "uncertainty" ? "uncertainty" : kind === "fact" ? "evidence" : "freshness"}
                label={claimLabel(kind)}
              />
              {citation ? (
                <>
                  <EvidenceBadge
                    detail={citation.source_name}
                    kind="citation"
                    label="Source"
                  />
                  <StatusChip
                    label={`Status: ${citation.status}`}
                    tone={statusTone(citation.status)}
                  />
                </>
              ) : (
                <EvidenceBadge
                  detail="not citation-specific"
                  kind="uncertainty"
                  label="Source"
                />
              )}
              {needsReview ? (
                <EvidenceBadge
                  detail="not confirmed"
                  kind="needs_review"
                  label="needs_review"
                />
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-radar-muted">{item}</p>
          </li>
        );
      })}
    </ul>
  );
}

function claimClasses(kind: "fact" | "inference" | "uncertainty", needsReview: boolean) {
  if (needsReview || kind === "uncertainty") {
    return "border-radar-caution/25 bg-radar-caution/5";
  }

  if (kind === "fact") {
    return "border-radar-evidence/20 bg-radar-evidence/5";
  }

  return "border-radar-freshness/20 bg-radar-freshness/5";
}

function claimLabel(kind: "fact" | "inference" | "uncertainty") {
  if (kind === "fact") {
    return "Fact";
  }

  if (kind === "inference") {
    return "Inference";
  }

  return "Uncertainty";
}

function claimDetail(kind: "fact" | "inference" | "uncertainty") {
  if (kind === "fact") {
    return "source-tied";
  }

  if (kind === "inference") {
    return "lower certainty";
  }

  return "review before conclusion";
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
