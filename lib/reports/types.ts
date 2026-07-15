import type {
  RetrievalCitation,
  RetrievalDataSource,
  RetrievalRadarItem,
  ResolvedTimeWindow
} from "@/lib/retrieval/types";

export type ReportPreviewType = "daily" | "weekly";

export type ReportPreviewSectionId =
  | "model_product_company_updates"
  | "research_open_source"
  | "agents_products"
  | "business_ecosystem"
  | "weak_signals_needs_review";

export type ReportPreviewItem = {
  id: string;
  database_id?: string;
  title: string;
  source_name: string;
  url: string;
  timestamp: string;
  summary: string;
  categories: RetrievalRadarItem["categories"];
  tags: string[];
  source_tier: string;
  status: RetrievalRadarItem["status"];
  confidence: number;
  overall_score: number;
  why_it_matters?: string;
  evidence_notes: string[];
};

export type ReportPreviewSection = {
  id: ReportPreviewSectionId;
  title: string;
  summary: string;
  items: ReportPreviewItem[];
  caveats: string[];
  missing_evidence: string[];
};

export type ReportPreview = {
  report_type: ReportPreviewType;
  title: string;
  time_window: ResolvedTimeWindow;
  data_source: RetrievalDataSource;
  summary: string;
  evidence_items: ReportPreviewItem[];
  top_items: ReportPreviewItem[];
  sections: ReportPreviewSection[];
  caveats: string[];
  citations: RetrievalCitation[];
  missing_evidence: string[];
  generated_at: string;
  retrieved_item_count: number;
  usable_item_count: number;
};

export type ReportLanguage = "zh" | "en" | "mixed";

export type GeneratedReportStatus =
  | "preview"
  | "draft"
  | "needs_review"
  | "approved"
  | "deferred"
  | "rejected"
  | "reviewed"
  | "published"
  | "archived";

export type GeneratedReportMode =
  | "deterministic_preview"
  | "live_deepseek"
  | "saved_candidate"
  | "saved_report";

export type GeneratedReportSectionId = ReportPreviewSectionId;

export type GeneratedReportSection = {
  id: GeneratedReportSectionId;
  title: string;
  summary: string;
  bullets: string[];
  citations: string[];
  caveats: string[];
  missing_evidence: string[];
};

export type GeneratedReportEvidenceItem = {
  id: string;
  database_id?: string;
  source_name: string;
  categories: RetrievalRadarItem["categories"];
  timestamp: string;
  status: RetrievalRadarItem["status"];
};

export type SafeReportModelMetadata = {
  provider: "deterministic" | "deepseek" | "supabase";
  model?: string;
  prompt_version?: string;
  mode: GeneratedReportMode;
  live_requested?: boolean;
  api_call_count: number;
  token_usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: string;
};

export type ReportQualityGateThresholds = {
  usable_items: number;
  citations: number;
  distinct_sources: number;
  categories: number;
};

export type ReportQualityGate = {
  report_type: ReportPreviewType;
  passed: boolean;
  reasons: string[];
  usable_item_count: number;
  citation_count: number;
  distinct_source_count: number;
  category_count: number;
  category_gate_applicable: boolean;
  thresholds: ReportQualityGateThresholds;
};

export type GeneratedReportDraft = {
  id?: string;
  report_type: ReportPreviewType;
  status: GeneratedReportStatus;
  mode: GeneratedReportMode;
  title: string;
  one_sentence_summary: string;
  executive_summary: string;
  sections: GeneratedReportSection[];
  evidence_items: GeneratedReportEvidenceItem[];
  citations: RetrievalCitation[];
  caveats: string[];
  missing_evidence: string[];
  data_source: RetrievalDataSource;
  time_window: ResolvedTimeWindow;
  generated_at: string;
  language: ReportLanguage;
  audience?: string;
  model_metadata: SafeReportModelMetadata;
  markdown: string;
  source_item_ids: string[];
  retrieved_item_count: number;
  usable_item_count: number;
  citation_count: number;
  distinct_source_count: number;
  category_count: number;
  quality_gate_passed: boolean;
  quality_gate_reasons: string[];
  quality_gate: ReportQualityGate;
};

export type ReportWorkflowReadSource = "supabase" | "public_snapshot" | "generated_preview";

export type ReportWorkflowDocument = GeneratedReportDraft & {
  read_source: ReportWorkflowReadSource;
  saved_at?: string;
};

export type ReportWorkflowData = {
  reports: ReportWorkflowDocument[];
  warnings: string[];
};
