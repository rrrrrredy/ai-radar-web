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

type CandidateTopic = {
  title: string;
  neutral_summary: string;
  why_it_matters: string;
  evidence: string[];
  caveats: string[];
  suggested_angle: string;
  confidence: number;
  citations: Citation[];
};

type WritingResponse = {
  mode: "mock" | "live";
  query: string;
  resolved_time_window: {
    start: string;
    end: string;
    explanation: string;
  };
  data_source: "local_understanding_output" | "mock_data" | "empty";
  candidate_topics: CandidateTopic[];
  counterpoints: string[];
  missing_evidence: string[];
  citations: Citation[];
};

const suggestedPrompts = [
  "帮我从今天热点里挑5条适合写行业观察的内容。",
  "把最近一周AI Agent热点整理成行业观察选题。",
  "给我生成一版海外/国内/行业重点/其他补充的观察提纲。"
];

export default function WritePage() {
  const [query, setQuery] = useState(suggestedPrompts[0]);
  const [output, setOutput] = useState<WritingResponse | null>(null);
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
          audience: "AI practitioners",
          outputType: "topic_candidates",
          generationMode: "mock"
        })
      });
      const body = (await response.json()) as WritingResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in body && body.error ? body.error : "Request failed.");
      }

      setOutput(body as WritingResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate writing assistance.");
      setOutput(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold text-radar-ink">Write</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
          Generate evidence-bound writing seeds from local radar items. Phase 6
          returns candidate topics, caveats, and citations without requiring a
          DeepSeek key.
        </p>
      </section>

      <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
        <label className="block">
          <span className="text-sm font-semibold text-radar-ink">Writing prompt</span>
          <textarea
            className="mt-3 min-h-32 w-full resize-y rounded-md border border-radar-line px-3 py-3 text-sm leading-6 text-radar-ink outline-none focus:border-radar-cyan"
            onChange={(event) => setQuery(event.target.value)}
            value={query}
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          {suggestedPrompts.map((prompt) => (
            <button
              className="rounded-md border border-radar-line px-3 py-2 text-xs font-medium text-radar-muted hover:border-radar-cyan hover:text-radar-cyan"
              key={prompt}
              onClick={() => setQuery(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-radar-muted">
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
      </section>

      {error ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </section>
      ) : null}

      {output ? <WritingOutputView output={output} /> : null}
    </div>
  );
}

function WritingOutputView({ output }: { output: WritingResponse }) {
  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-radar-line bg-radar-panel p-4 text-sm leading-6 text-radar-muted">
        Data source: {output.data_source}. {output.resolved_time_window.explanation} Window:{" "}
        {output.resolved_time_window.start} to {output.resolved_time_window.end}.
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        {output.candidate_topics.length > 0 ? (
          output.candidate_topics.map((topic) => (
            <article className="rounded-lg border border-radar-line bg-white p-5 shadow-soft" key={topic.title}>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-radar-panel px-2 py-1 text-xs font-medium text-radar-muted">
                  confidence {Math.round(topic.confidence * 100)}%
                </span>
              </div>
              <h2 className="mt-4 text-lg font-semibold leading-7 text-radar-ink">{topic.title}</h2>
              <p className="mt-3 text-sm leading-6 text-radar-muted">{topic.neutral_summary}</p>
              <p className="mt-4 text-sm font-semibold text-radar-ink">Why it matters</p>
              <p className="mt-2 text-sm leading-6 text-radar-muted">{topic.why_it_matters}</p>
              <ListBlock title="Evidence" items={topic.evidence} />
              <ListBlock title="Caveats" items={topic.caveats} />
              <p className="mt-4 text-sm font-semibold text-radar-ink">Suggested angle</p>
              <p className="mt-2 text-sm leading-6 text-radar-muted">{topic.suggested_angle}</p>
              {topic.citations.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {topic.citations.map((citation) => (
                    <a
                      className="block text-sm font-medium text-radar-cyan"
                      href={citation.url}
                      key={citation.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {citation.source_name}: {citation.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-radar-line bg-white p-5 text-sm text-radar-muted shadow-soft">
            No candidate topics could be generated from the current retrieval result.
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ListPanel title="Counterpoints" items={output.counterpoints} />
        <ListPanel title="Missing evidence" items={output.missing_evidence} />
      </section>
    </section>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-radar-ink">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-radar-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
      <h2 className="text-lg font-semibold text-radar-ink">{title}</h2>
      <ul className="mt-4 space-y-3 text-sm leading-6 text-radar-muted">
        {items.map((item) => (
          <li className="rounded-md bg-radar-panel px-3 py-3" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
