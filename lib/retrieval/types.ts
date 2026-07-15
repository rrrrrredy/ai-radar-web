import type {
  RadarCategory,
  UnderstandingEntity,
  UnderstandingStatus
} from "@/lib/understanding/types";

export type RetrievalDataSource = "supabase_radar_items" | "local_understanding_output" | "mock_data" | "empty";
export type RetrievalIntent = "report_seed" | "unknown";
export type RetrievalLanguage = "zh" | "en" | "mixed" | "unknown";
export type RetrievalOutputStyle = "concise" | "detailed" | "outline" | "topic_list" | "unknown";

export type RetrievalRadarItem = {
  id: string;
  database_id?: string;
  raw_item_id: string;
  source_id: string;
  source_name: string;
  title: string;
  url: string;
  published_at?: string;
  collected_at: string;
  processed_at: string;
  language: RetrievalLanguage;
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
  source_tier: string;
  source_weight: number;
  confidence: number;
  status: UnderstandingStatus;
  exclusion_reason?: string;
  why_it_matters?: string;
  evidence_notes: string[];
  model_metadata?: Record<string, unknown>;
  is_mock?: boolean;
};

export type LoadedRadarItems = {
  items: RetrievalRadarItem[];
  dataSource: RetrievalDataSource;
  authoritativeSupabaseRead?: boolean;
  freshness: {
    latestTimestamp?: string;
    latestTimestampSource?: "processed_at" | "collected_at" | "published_at" | "file_mtime";
    fileMtime?: string;
    itemCount: number;
  };
  warnings: string[];
};

export type NormalizedQuery = {
  raw_query: string;
  language: RetrievalLanguage;
  intent: RetrievalIntent;
  entity_hints: string[];
  category_hints: RadarCategory[];
  time_phrase_hints: string[];
  requested_output_style: RetrievalOutputStyle;
  keywords: string[];
};

export type RetrievalPurpose = "qa" | "report_seed" | "writing_assistant";

export type ResolvedTimeWindow = {
  start: string;
  end: string;
  explanation: string;
  matched_phrase?: string;
};

export type RankedRadarItem = {
  item: RetrievalRadarItem;
  score: number;
  matchReasons: string[];
};

export type RetrievalCitation = {
  id: string;
  title: string;
  source_name: string;
  url: string;
  published_at?: string;
  collected_at: string;
  status: UnderstandingStatus;
  confidence: number;
};

export type RetrievalResult = {
  normalizedQuery: NormalizedQuery;
  resolvedTimeWindow: ResolvedTimeWindow;
  dataSource: RetrievalDataSource;
  freshness: LoadedRadarItems["freshness"];
  warnings: string[];
  rankedItems: RankedRadarItem[];
  citations: RetrievalCitation[];
};
