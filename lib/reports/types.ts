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
  top_items: ReportPreviewItem[];
  sections: ReportPreviewSection[];
  caveats: string[];
  citations: RetrievalCitation[];
  missing_evidence: string[];
  generated_at: string;
  retrieved_item_count: number;
  usable_item_count: number;
};
