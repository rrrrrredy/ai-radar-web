"use client";

import { useState } from "react";

type Citation = {
  id: string;
  title: string;
  source_name: string;
  url: string;
  published_at?: string;
  collected_at: string;
  status: string;
  confidence: number;
};

type AskResponse = {
  mode: "mock" | "live";
  question: string;
  resolved_time_window: {
    start: string;
    end: string;
    explanation: string;
  };
  data_source: "supabase_radar_items" | "local_understanding_output" | "mock_data" | "empty";
  short_answer: string;
  facts: string[];
  evidence_backed_inference: string[];
  uncertainty: string[];
  citations: Citation[];
  retrieved_item_count: number;
  freshness_note: string;
  model_metadata: {
    provider: string;
    prompt_version: string;
    api_call_count: number;
  };
};

const suggestedQuestions = [
  "过去24小时内谁发布了新模型？",
  "OpenAI最近有什么新动向？",
  "最近一周AI Agent有哪些重要趋势？",
  "哪些是真热点，哪些只是噪音？"
];

export default function AskPage() {
  const [question, setQuestion] = useState(suggestedQuestions[0]);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
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
      const body = (await response.json()) as AskResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in body && body.error ? body.error : "Request failed.");
      }

      setAnswer(body as AskResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to ask Radar.");
      setAnswer(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Ask Radar</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Ask questions against local radar-item evidence. Phase 6 uses mock/local
          generation by default, cites retrieved items, and keeps live DeepSeek
          generation opt-in.
        </p>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <label className="block">
          <span className="text-sm font-semibold text-radar-ink">Question</span>
          <textarea
            className="mt-3 min-h-32 w-full resize-y rounded-md border border-radar-line px-3 py-3 text-sm leading-6 text-radar-ink outline-none focus:border-radar-cyan"
            onChange={(event) => setQuestion(event.target.value)}
            value={question}
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          {suggestedQuestions.map((suggestion) => (
            <button
              className="rounded-md border border-radar-line px-3 py-2 text-xs font-medium text-radar-muted hover:border-radar-cyan hover:text-radar-cyan"
              key={suggestion}
              onClick={() => setQuestion(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-radar-muted">
            Mock/local mode does not require login, Supabase, or a DeepSeek key.
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
      </section>

      {error ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </section>
      ) : null}

      {answer ? <AnswerView answer={answer} /> : null}
    </div>
  );
}

function AnswerView({ answer }: { answer: AskResponse }) {
  const fallbackMessage =
    answer.data_source === "mock_data"
      ? "No local understanding output was available, so this response uses synthetic demo radar items."
      : answer.data_source === "supabase_radar_items"
        ? "This response uses Supabase-backed radar items."
      : answer.data_source === "empty"
        ? "No local or mock radar items were available."
        : "";

  return (
    <section className="space-y-5">
      {fallbackMessage ? (
        <div className="rounded-lg border border-radar-line bg-radar-panel p-4 text-sm leading-6 text-radar-muted">
          {fallbackMessage}
        </div>
      ) : null}

      <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap gap-2">
          <Meta label="Mode" value={answer.mode} />
          <Meta label="Data" value={answer.data_source} />
          <Meta label="Items" value={String(answer.retrieved_item_count)} />
        </div>
        <p className="mt-5 text-base leading-7 text-radar-ink">{answer.short_answer}</p>
        <p className="mt-4 text-xs leading-5 text-radar-muted">
          {answer.resolved_time_window.explanation} Window: {answer.resolved_time_window.start} to{" "}
          {answer.resolved_time_window.end}
        </p>
        <p className="mt-2 text-xs leading-5 text-radar-muted">{answer.freshness_note}</p>
      </div>

      <ResultList title="Facts" items={answer.facts} empty="No evidence-backed facts were retrieved." />
      <ResultList
        title="Evidence-backed inference"
        items={answer.evidence_backed_inference}
        empty="No inference was generated because evidence was insufficient."
      />
      <ResultList title="Uncertainty" items={answer.uncertainty} empty="No uncertainty notes were returned." />

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-radar-ink">Citations</h2>
        {answer.citations.length > 0 ? (
          <div className="mt-4 space-y-3">
            {answer.citations.map((citation) => (
              <a
                className="block rounded-md border border-radar-line p-3 text-sm hover:border-radar-cyan"
                href={citation.url}
                key={citation.id}
                rel="noreferrer"
                target="_blank"
              >
                <span className="font-semibold text-radar-ink">{citation.title}</span>
                <span className="mt-1 block text-radar-muted">
                  {citation.source_name} · {citation.published_at ?? citation.collected_at} · {citation.status} · confidence{" "}
                  {Math.round(citation.confidence * 100)}%
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-radar-muted">No citations available for this response.</p>
        )}
      </section>
    </section>
  );
}

function ResultList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <h2 className="text-lg font-semibold text-radar-ink">{title}</h2>
      {items.length > 0 ? (
        <ul className="mt-4 space-y-3 text-sm leading-6 text-radar-muted">
          {items.map((item) => (
            <li className="rounded-md bg-radar-panel px-3 py-3" key={item}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-radar-muted">{empty}</p>
      )}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
      {label}: {value}
    </span>
  );
}
