"use client";

import { useState } from "react";

import { AnswerSection } from "@/components/answer-section";
import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { EvidenceRail } from "@/components/evidence-rail";
import { StatusChip } from "@/components/status-chip";
import { TopicCandidateCard } from "@/components/topic-candidate-card";
import type { WritingAssistantOutput } from "@/lib/writing-assistant/types";

const WRITING_AUDIENCE = "AI practitioners";
const WRITING_OUTPUT_TYPE = "topic_candidates";

const suggestedPrompts = [
  "帮我从今天热点里挑5条适合写行业观察的内容。",
  "把最近一周AI Agent热点整理成行业观察选题。",
  "给我生成一版海外/国内/行业重点/其他补充的观察提纲。"
];

export default function WritePage() {
  const [query, setQuery] = useState(suggestedPrompts[0]);
  const [output, setOutput] = useState<WritingAssistantOutput | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function generate() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/writing-assistant", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query,
          language: "zh",
          audience: WRITING_AUDIENCE,
          outputType: WRITING_OUTPUT_TYPE,
          generationMode: "mock"
        })
      });
      const body = (await response.json()) as WritingAssistantOutput | { error?: string };

      if (!response.ok) {
        throw new Error("error" in body && body.error ? body.error : "Request failed.");
      }

      setOutput(body as WritingAssistantOutput);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate writing assistance.");
      setOutput(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h1 className="text-3xl font-semibold text-radar-ink">Write</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            Build editorial topic candidates from retrieved radar evidence. The
            writing surface treats caveats, counterpoints, and missing evidence
            as part of the plan rather than cleanup notes.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <DataSourceChip detail="default fallback disclosed in output" source="mock_data" />
            <EvidenceBadge detail="topic evidence trails" kind="evidence" label="Evidence" />
            <EvidenceBadge detail="shown as sections" kind="uncertainty" label="Gaps" />
            <StatusChip label="Live DeepSeek" tone="caution" value="opt-in" />
          </div>
        </div>

        <aside className="border-l border-radar-line pl-6 max-lg:border-l-0 max-lg:border-t max-lg:pl-0 max-lg:pt-5">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            Planning output order
          </h2>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-radar-muted">
            {[
              "Data source and time window",
              "Candidate topics",
              "Counterpoints",
              "Missing evidence",
              "Citations"
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
          <label className="block" htmlFor="write-query">
            <span className="text-sm font-semibold text-radar-ink">Writing prompt</span>
            <textarea
              className="mt-3 min-h-28 w-full resize-y rounded-md border border-radar-line px-3 py-3 text-sm leading-6 text-radar-ink outline-none focus:border-radar-evidence"
              id="write-query"
              onChange={(event) => setQuery(event.target.value)}
              value={query}
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm leading-6 text-radar-muted">
              Suggestions are generated from retrieved evidence and caveats, not from unstated facts.
            </p>
            <button
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || !query.trim()}
              onClick={generate}
              type="button"
            >
              {isLoading ? "Generating..." : "Generate seeds"}
            </button>
          </div>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold text-radar-ink">Industry observation workflows</h2>
          <p className="mt-2 text-xs leading-5 text-radar-muted">
            Each shortcut fills the same prompt field and keeps mock generation as the default.
          </p>
          <div className="mt-4 space-y-2">
            {suggestedPrompts.map((prompt, index) => (
              <button
                className="w-full rounded-md border border-radar-line bg-white px-3 py-3 text-left text-sm leading-6 text-radar-ink hover:border-radar-evidence focus:border-radar-evidence"
                key={prompt}
                onClick={() => setQuery(prompt)}
                type="button"
              >
                <span className="mr-2 font-mono text-xs font-semibold text-radar-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {prompt}
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

      {output ? <WritingOutputView output={output} /> : null}
    </div>
  );
}

function WritingOutputView({ output }: { output: WritingAssistantOutput }) {
  return (
    <section aria-label="Writing assistant output" className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <EvidenceRail
          citationsCount={output.citations.length}
          context={[
            { label: "Audience", value: WRITING_AUDIENCE },
            { label: "Output type", value: WRITING_OUTPUT_TYPE },
            { label: "Query", value: output.query }
          ]}
          dataSource={output.data_source}
          generationMode={output.mode}
          itemCount={output.candidate_topics.length}
          itemCountLabel="Candidate topics"
          modelMetadata={output.model_metadata}
          timeWindow={output.resolved_time_window}
          title="Data source and time window"
        />

        <div className="space-y-5">
          <section className="space-y-4">
            <div className="max-w-3xl">
              <h2 className="text-lg font-semibold text-radar-ink">Candidate topics</h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                Topic candidates are drafts for editorial judgment, not confirmed conclusions.
              </p>
            </div>
            {output.candidate_topics.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {output.candidate_topics.map((topic, index) => (
                  <TopicCandidateCard
                    counterpoints={output.counterpoints}
                    index={index}
                    key={topic.title}
                    missingEvidence={output.missing_evidence}
                    topic={topic}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-radar-caution/30 bg-radar-caution/5 px-3 py-3 text-sm leading-6 text-radar-caution">
                No candidate topics could be generated from the current retrieval result.
              </p>
            )}
          </section>

          <PlanningList
            description="Reasons a proposed angle may not yet hold up."
            empty="No counterpoints were returned."
            items={output.counterpoints}
            title="Counterpoints"
          />
          <PlanningList
            description="Evidence gaps are explicit work items before publication."
            empty="No missing-evidence notes were returned."
            items={output.missing_evidence}
            title="Missing evidence"
          />

          <CitationList
            citations={output.citations}
            emptyMessage="No citations available for this writing output."
            title="Citations"
          />
        </div>
      </div>
    </section>
  );
}

function PlanningList({
  description,
  empty,
  items,
  title
}: {
  description: string;
  empty: string;
  items: string[];
  title: string;
}) {
  return (
    <AnswerSection description={description} title={title} tone="caution">
      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              className="rounded-md border border-radar-caution/25 bg-radar-caution/5 px-3 py-3 text-sm leading-6 text-radar-muted"
              key={item}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-radar-muted">{empty}</p>
      )}
    </AnswerSection>
  );
}
