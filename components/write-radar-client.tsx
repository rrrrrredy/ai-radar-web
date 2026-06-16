"use client";

import { useState } from "react";

import { AnswerSection } from "@/components/answer-section";
import { CitationList } from "@/components/citation-list";
import { DataSourceChip } from "@/components/data-source-chip";
import { EvidenceBadge } from "@/components/evidence-badge";
import { EvidenceRail } from "@/components/evidence-rail";
import { StatusChip } from "@/components/status-chip";
import { TopicCandidateCard } from "@/components/topic-candidate-card";
import type { RetrievalDataSource } from "@/lib/retrieval/types";
import type { WritingAssistantOutput } from "@/lib/writing-assistant/types";

const WRITING_AUDIENCE = "AI 从业者";
const WRITING_OUTPUT_TYPE = "topic_candidates";

export type WriteRadarClientProps = {
  dataSummary: {
    attemptedSources: number;
    dataSource: RetrievalDataSource;
    eventCount: number;
    latestRadarTime: string;
    sourcesWithPublicItems: number;
    topCategories: Array<{ label: string; count: number }>;
    visibleRows: number;
  };
  initialPrompt: string;
  suggestedPrompts: string[];
};

export function WriteRadarClient({
  dataSummary,
  initialPrompt,
  suggestedPrompts
}: WriteRadarClientProps) {
  const [query, setQuery] = useState(initialPrompt || suggestedPrompts[0] || "");
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
          generationMode: "live"
        })
      });
      const body = (await response.json()) as WritingAssistantOutput | { error?: string };

      if (!response.ok) {
        throw new Error("error" in body && body.error ? body.error : "请求失败。");
      }

      setOutput(body as WritingAssistantOutput);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法生成写作辅助。");
      setOutput(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-radar-line pb-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <DataSourceChip detail="当前检索面" source={dataSummary.dataSource} />
            <EvidenceBadge detail={`${dataSummary.eventCount} 个`} kind="evidence" label="事件" />
            <EvidenceBadge detail={`${dataSummary.visibleRows} 条`} kind="evidence" label="雷达条目" />
            <EvidenceBadge detail={dataSummary.latestRadarTime} kind="freshness" label="更新时间" />
            <StatusChip label="已尝试来源" tone="evidence" value={dataSummary.attemptedSources} />
            <StatusChip label="公开来源" tone="success" value={dataSummary.sourcesWithPublicItems} />
            <StatusChip label="生成" tone="evidence" value="DeepSeek" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-radar-ink">事件写作</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-radar-muted">
            从行业精选、多源确认和弱信号生成编辑选题候选，并在工作流中保留局限、反方观点、缺失证据和引用。
          </p>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-radar-muted">
            选题入口
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {dataSummary.topCategories.map((category) => (
              <StatusChip key={category.label} label={category.label} tone="neutral" value={category.count} />
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-radar-muted">
            快捷提示以当前类别分布作为上下文，API 请求字段保持不变。
          </p>
        </aside>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="rounded-lg border border-radar-line bg-white p-5 shadow-soft">
          <label className="block" htmlFor="write-query">
            <span className="text-sm font-semibold text-radar-ink">写作提示</span>
            <textarea
              className="mt-3 min-h-28 w-full resize-y rounded-md border border-radar-line px-3 py-3 text-sm leading-6 text-radar-ink outline-none focus:border-radar-evidence"
              id="write-query"
              onChange={(event) => setQuery(event.target.value)}
              value={query}
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm leading-6 text-radar-muted">
              建议来自已检索证据和局限，而不是未说明的事实。
            </p>
            <button
              className="rounded-md bg-radar-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || !query.trim()}
              onClick={generate}
              type="button"
            >
              {isLoading ? "生成中..." : "生成种子"}
            </button>
          </div>
        </div>

        <aside className="rounded-lg border border-radar-line bg-radar-panel p-4">
          <h2 className="text-sm font-semibold text-radar-ink">行业观察流程</h2>
          <p className="mt-2 text-xs leading-5 text-radar-muted">
            每个快捷项都会填入同一个提示框，并用当前证据生成可复核写作种子。
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
    <section aria-label="写作辅助输出" className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <EvidenceRail
          citationsCount={output.citations.length}
          context={[
            { label: "受众", value: WRITING_AUDIENCE },
            { label: "输出类型", value: WRITING_OUTPUT_TYPE },
            { label: "查询", value: output.query }
          ]}
          dataSource={output.data_source}
          generationMode={output.mode}
          itemCount={output.candidate_topics.length}
          itemCountLabel="候选选题"
          timeWindow={output.resolved_time_window}
          title="数据来源与时间窗口"
        />

        <div className="space-y-5">
          <section className="space-y-4">
            <div className="max-w-3xl">
              <h2 className="text-lg font-semibold text-radar-ink">候选选题</h2>
              <p className="mt-2 text-sm leading-6 text-radar-muted">
                候选选题是供编辑判断的草稿，不是已确认结论。
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
                当前检索结果无法生成候选选题。
              </p>
            )}
          </section>

          <PlanningList
            description="拟定角度可能尚不成立的原因。"
            empty="未返回反方观点。"
            items={output.counterpoints}
            title="反方观点"
          />
          <PlanningList
            description="缺失证据是发布前需要处理的明确事项。"
            empty="未返回缺失证据说明。"
            items={output.missing_evidence}
            title="缺失证据"
          />

          <CitationList
            citations={output.citations}
            emptyMessage="此写作输出暂无引用。"
            title="引用"
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
