import type { GenerationMode } from "@/lib/qa/types";
import type { RetrievalCitation, RetrievalDataSource, ResolvedTimeWindow } from "@/lib/retrieval/types";

export type WritingOutputType = "topic_candidates" | "article_angles" | "weekly_observation" | "outline";

export type WritingAssistantRequest = {
  query: string;
  language?: "zh" | "en" | "mixed";
  audience?: string;
  outputType?: WritingOutputType;
  generationMode?: GenerationMode;
};

export type WritingCandidateTopic = {
  title: string;
  neutral_summary: string;
  why_it_matters: string;
  evidence: string[];
  caveats: string[];
  suggested_angle: string;
  confidence: number;
  citations: RetrievalCitation[];
};

export type WritingAssistantOutput = {
  mode: GenerationMode;
  query: string;
  resolved_time_window: ResolvedTimeWindow;
  data_source: RetrievalDataSource;
  candidate_topics: WritingCandidateTopic[];
  counterpoints: string[];
  missing_evidence: string[];
  citations: RetrievalCitation[];
  model_metadata: {
    provider: "local" | "deepseek";
    model?: string;
    prompt_version: string;
    api_call_count: number;
  };
};

export type WritingLiveModelOutput = Pick<
  WritingAssistantOutput,
  "candidate_topics" | "counterpoints" | "missing_evidence"
>;
