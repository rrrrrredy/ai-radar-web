import type { IngestionRawItem, SourceTier } from "@/lib/ingestion/types";

export const RADAR_CATEGORIES = [
  "model_release",
  "product_update",
  "agent",
  "research",
  "open_source",
  "infrastructure",
  "funding",
  "business",
  "regulation",
  "safety",
  "benchmark",
  "media_interview",
  "opinion",
  "other"
] as const;

export const ENTITY_TYPES = [
  "company",
  "model",
  "product",
  "person",
  "paper",
  "project",
  "repository",
  "investor",
  "regulator",
  "other"
] as const;

export const UNDERSTANDING_STATUSES = ["included", "excluded", "needs_review", "failed"] as const;

export type RadarCategory = (typeof RADAR_CATEGORIES)[number];
export type UnderstandingEntityType = (typeof ENTITY_TYPES)[number];
export type UnderstandingStatus = (typeof UNDERSTANDING_STATUSES)[number];
export type UnderstandingMode = "mock" | "live";
export type UnderstandingRunStatus = "success" | "partial" | "failed";

export type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type ModelMetadata = {
  mode: UnderstandingMode;
  provider: "deepseek";
  fast_model: string;
  smart_model: string;
  prompt_version: string;
  input_hash: string;
  output_hash: string;
  api_call_count?: number;
  estimated_token_count?: number;
  token_usage?: TokenUsage;
  error?: string;
};

export type UnderstandingEntity = {
  name: string;
  type: UnderstandingEntityType;
  confidence: number;
  evidence_text?: string;
};

export type ClassificationResult = {
  ai_relevance_score: number;
  language: "zh" | "en" | "mixed" | "unknown";
  categories: RadarCategory[];
  tags: string[];
  confidence: number;
};

export type SummaryResult = {
  summary_zh: string;
  summary_en: string;
  evidence_notes: string[];
};

export type EntityExtractionResult = {
  entities: UnderstandingEntity[];
};

export type ScoreResult = {
  importance_score: number;
  credibility_score: number;
  novelty_score: number;
  freshness_score: number;
  overall_score: number;
  source_weight: number;
  confidence: number;
  why_it_matters?: string;
  evidence_notes: string[];
};

export type TransformModelResult = ClassificationResult &
  SummaryResult &
  EntityExtractionResult &
  Partial<ScoreResult>;

export type StageResult<T> = {
  value: T;
  apiCallCount: number;
  estimatedTokenCount: number;
  tokenUsage?: TokenUsage;
  model?: string;
  error?: string;
};

export type UnderstandingModelInput = {
  rawItem: IngestionRawItem;
  text: string;
  truncated: boolean;
  promptVersion: string;
};

export type UnderstandingConfig = {
  mode: UnderstandingMode;
  inputPath: string;
  limit: number;
  maxTextChars: number;
  promptVersion: string;
  dryRun: boolean;
  baseUrl: string;
  apiKey?: string;
  fastModel: string;
  smartModel: string;
  timeoutMs: number;
  maxRetries: number;
  latestRadarItemsPath: string;
  latestRunPath: string;
  runsDir: string;
};

export type UnderstandingRadarItem = {
  id: string;
  raw_item_id: string;
  source_id: string;
  source_name: string;
  title: string;
  url: string;
  published_at?: string;
  collected_at: string;
  processed_at: string;
  language: "zh" | "en" | "mixed" | "unknown";
  summary_zh: string;
  summary_en: string;
  ai_relevance_score: number;
  importance_score: number;
  credibility_score: number;
  novelty_score: number;
  freshness_score: number;
  overall_score: number;
  categories: RadarCategory[];
  tags: string[];
  entities: UnderstandingEntity[];
  source_tier: SourceTier;
  source_weight: number;
  confidence: number;
  status: UnderstandingStatus;
  exclusion_reason?: string;
  why_it_matters?: string;
  evidence_notes: string[];
  model_metadata: ModelMetadata;
};

export type UnderstandingRunSummary = {
  run_id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  mode: UnderstandingMode;
  input_path: string;
  output_path: string;
  raw_item_count: number;
  processed_count: number;
  included_count: number;
  excluded_count: number;
  needs_review_count: number;
  failed_count: number;
  categories_count: Partial<Record<RadarCategory, number>>;
  entities_count: number;
  api_call_count: number;
  estimated_token_count?: number;
  warnings: string[];
  errors: string[];
  status: UnderstandingRunStatus;
  output_files: {
    latest_radar_items: string;
    latest_run: string;
    run_radar_items?: string;
    run_summary?: string;
  };
};

export type UnderstandingRunResult = {
  radarItems: UnderstandingRadarItem[];
  run: UnderstandingRunSummary;
};
