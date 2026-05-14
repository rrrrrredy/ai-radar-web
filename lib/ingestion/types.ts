export type CrawlMethod = "rss" | "html" | "api" | "podcast_feed" | "youtube_feed";
export type CrawlMethodFilter = CrawlMethod | "all";
export type SourceStatus = "active" | "trial" | "needs_public_url" | "deferred" | "rejected";
export type SourceLanguage = "zh" | "en" | "mixed" | "unknown" | "bilingual";
export type SourceTier = "T1" | "T1.5" | "T2" | "T3" | "unreviewed";
export type RawItemStatus = "collected" | "skipped" | "failed";
export type SourceFetchStatus = "success" | "skipped" | "failed";
export type RunStatus = "success" | "partial" | "failed";

export type CleanedSource = {
  id: string;
  name: string;
  name_en: string | null;
  type: string;
  category: string;
  description: string;
  url: string | null;
  rss_url: string | null;
  x_handle: string | null;
  github_url: string | null;
  youtube_url: string | null;
  podcast_url: string | null;
  language: SourceLanguage;
  region: string;
  tier: SourceTier;
  weight: number;
  crawl_method: string;
  update_frequency: string;
  status: SourceStatus;
  tags: string[];
  risk_flags: string[];
  notes: string;
  source_origin: string;
  created_at: string;
  updated_at: string;
};

export type SelectedSource = CleanedSource & {
  url: string;
  crawl_method: CrawlMethod;
};

export type SourceSelectionOptions = {
  limit: number;
  method: CrawlMethodFilter;
  sourceId?: string;
  maxItemsPerSource: number;
};

export type SourceSelectionResult = {
  sources: SelectedSource[];
  totalRegistrySources: number;
  eligibleSourceCount: number;
  warnings: string[];
};

export type FetcherContext = {
  maxItemsPerSource: number;
  collectedAt: string;
};

export type FetcherItem = {
  title: string;
  url: string;
  canonicalUrl?: string;
  author?: string;
  publishedAt?: string;
  excerpt?: string;
  summary?: string;
  rawText?: string;
  externalId?: string;
  status?: RawItemStatus;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export type SourceFetchResult = {
  sourceId: string;
  sourceName: string;
  crawlMethod: CrawlMethod;
  status: SourceFetchStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  itemCount: number;
  items: FetcherItem[];
  errorMessage?: string;
  warnings: string[];
  metadata: Record<string, unknown>;
};

export type IngestionRawItem = {
  id: string;
  source_id: string;
  source_name: string;
  source_type: string;
  source_tier: SourceTier;
  title: string;
  url: string;
  canonical_url: string;
  author?: string;
  published_at?: string;
  collected_at: string;
  retrieved_at: string;
  language: "zh" | "en" | "mixed" | "unknown";
  raw_text: string;
  summary: string;
  content_hash: string;
  hash: string;
  external_id?: string;
  crawl_method: CrawlMethod;
  status: RawItemStatus;
  error_message?: string;
  metadata: Record<string, unknown>;
  raw_metadata: Record<string, unknown>;
};

export type DedupeResult = {
  items: IngestionRawItem[];
  duplicateCount: number;
  duplicateKeys: string[];
};

export type IngestionSourceSummary = {
  source_id: string;
  source_name: string;
  crawl_method: CrawlMethod;
  status: SourceFetchStatus;
  item_count: number;
  duration_ms: number;
  error_message?: string;
  warnings: string[];
};

export type IngestionRunSummary = {
  id: string;
  started_at: string;
  selected_source_count: number;
  source_results: IngestionSourceSummary[];
  item_count: number;
  raw_item_count: number;
  duplicate_count: number;
  skipped_count: number;
  error_count: number;
  ended_at: string;
  duration_ms: number;
  status: RunStatus;
  warnings: string[];
  output_files: {
    latest_raw_items: string;
    latest_run: string;
    run_raw_items: string;
    run_summary: string;
  };
  options: {
    limit: number;
    method: CrawlMethodFilter;
    source_id?: string;
    max_items_per_source: number;
  };
};
