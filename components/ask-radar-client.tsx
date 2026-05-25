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
        throw new Error("error" in body && body.error ? body.error : "请求失败。");
      }

      setAnswer(body as AskAnswer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法完成提问。");
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
            <DataSourceChip detail="当前检索面" source={dataSummary.dataSource} />
            <EvidenceBadge detail={`${dataSummary.visibleRows} 条`} kind="evidence" label="雷达条目" />
            <EvidenceBadge detail={dataSummary.latestRadarTime} kind="freshness" label="更新时间" />
            <StatusChip label="已尝试来源" tone="evidence" value={dataSummary.attemptedSources} />
            <StatusChip label="公开来源" tone="success" value={dataSummary.sourcesWithPublicItems} />
            <StatusChip label="生成模式" tone="caution" value="mock API" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">提问</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            基于当前 AI 行业雷达证据提问。示例问题来自实时类别分布，回答会保留来源、时间窗口、不确定性和引用。
          </p>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            提问入口
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {dataSummary.topCategories.map((category) => (
              <StatusChip key={category.label} label={category.label} tone="neutral" value={category.count} />
            ))}
          </div>
          <ol className="mt-4 space-y-2 text-sm leading-6 text-radar-muted">
            {[
              "选择一个基于当前数据的问题",
              "用 mock 模式对检索结果生成回答",
              "检查事实、推断、不确定性和引用"
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
            <span className="text-sm font-semibold text-radar-ink">问题</span>
            <textarea
              className="mt-3 min-h-28 w-full resize-y rounded-md border border-radar-line px-3 py-3 text-sm leading-6 text-radar-ink outline-none focus:border-radar-evidence"
              id="ask-question"
              onChange={(event) => setQuestion(event.target.value)}
              value={question}
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm leading-6 text-radar-muted">
              公开安全检索仍是证据来源；API 请求结构保持不变。
            </p>
            <button
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || !question.trim()}
              onClick={submitQuestion}
              type="button"
            >
              {isLoading ? "提问中..." : "提问"}
            </button>
          </div>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold text-radar-ink">分析快捷问题</h2>
          <p className="mt-2 text-xs leading-5 text-radar-muted">
            每个快捷问题都会填入同一个输入框，检索来源不变。
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
    <section aria-label="提问回答" className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <EvidenceRail
          citationsCount={answer.citations.length}
          dataSource={answer.data_source}
          freshnessNote={answer.freshness_note}
          generationMode={answer.mode}
          itemCount={answer.retrieved_item_count}
          timeWindow={answer.resolved_time_window}
          title="数据来源与时间窗口"
        />

        <div className="space-y-5">
          <section className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
            <div className="flex flex-wrap gap-2">
              <EvidenceBadge
                detail={hasEvidence ? "受检索条目限制" : "未检索到证据"}
                kind={hasEvidence ? "evidence" : "uncertainty"}
                label="简短回答"
              />
              <StatusChip
                label="生成"
                tone={answer.mode === "live" ? "risk" : "caution"}
                value={answer.mode}
              />
            </div>
            <p className="mt-4 text-lg leading-8 text-radar-ink">{answer.short_answer}</p>
            {!hasEvidence ? (
              <p className="mt-4 rounded-md border border-radar-caution/30 bg-radar-caution/5 px-3 py-3 text-sm leading-6 text-radar-caution">
                未检索到带引用的证据，因此这只是有限检索结果，不应视为确认答案。
              </p>
            ) : null}
          </section>

          <AnswerSection
            description="来自检索雷达条目的直接陈述。每行都保留来源标签。"
            title="事实"
            tone="evidence"
          >
            <ClaimList
              citations={answer.citations}
              empty="未检索到有证据支撑的事实。"
              items={answer.facts}
              kind="fact"
            />
          </AnswerSection>

          <AnswerSection
            description="解释性判断的确定性低于事实。"
            title="基于证据的推断"
            tone="inference"
          >
            <ClaimList
              citations={answer.citations}
              empty="证据不足，未生成推断。"
              items={answer.evidence_backed_inference}
              kind="inference"
            />
          </AnswerSection>

          <AnswerSection
            description="缺失、过期、本地、模拟或待复核证据会在引用前保持可见。"
            title="不确定性"
            tone="caution"
          >
            <ClaimList
              citations={answer.citations}
              empty="未返回不确定性说明。"
              items={answer.uncertainty}
              kind="uncertainty"
            />
          </AnswerSection>
        </div>
      </div>

      <CitationList
        citations={answer.citations}
        emptyMessage="此回答暂无引用。"
        title="引用"
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
                    label="来源"
                  />
                  <StatusChip
                    label={`状态: ${statusLabel(citation.status)}`}
                    tone={statusTone(citation.status)}
                  />
                </>
              ) : (
                <EvidenceBadge
                  detail="非特定引用"
                  kind="uncertainty"
                  label="来源"
                />
              )}
              {needsReview ? (
                <EvidenceBadge
                  detail="未确认"
                  kind="needs_review"
                  label="待复核"
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
    return "事实";
  }

  if (kind === "inference") {
    return "推断";
  }

  return "不确定性";
}

function claimDetail(kind: "fact" | "inference" | "uncertainty") {
  if (kind === "fact") {
    return "绑定来源";
  }

  if (kind === "inference") {
    return "较低确定性";
  }

  return "先复核再下结论";
}

function statusLabel(status: RetrievalCitation["status"]) {
  if (status === "included") return "已纳入";
  if (status === "needs_review") return "待复核";
  if (status === "excluded") return "已排除";
  return "失败";
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
