import type { RetrievalCitation, RetrievalDataSource, ResolvedTimeWindow } from "@/lib/retrieval/types";

export type GenerationMode = "mock" | "live";

export type AskRequest = {
  question: string;
  language?: "zh" | "en" | "mixed";
  generationMode?: GenerationMode;
};

export type AskAnswer = {
  mode: GenerationMode;
  question: string;
  resolved_time_window: ResolvedTimeWindow;
  data_source: RetrievalDataSource;
  short_answer: string;
  facts: string[];
  evidence_backed_inference: string[];
  uncertainty: string[];
  citations: RetrievalCitation[];
  retrieved_item_count: number;
  freshness_note: string;
  model_metadata: {
    provider: "local" | "deepseek";
    model?: string;
    prompt_version: string;
    api_call_count: number;
  };
};

export type AskLiveModelOutput = Pick<
  AskAnswer,
  "short_answer" | "facts" | "evidence_backed_inference" | "uncertainty"
>;
