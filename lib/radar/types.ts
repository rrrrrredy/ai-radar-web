export type LanguageCode = "en" | "zh" | "bilingual";
export type SourceStatus = "active" | "paused" | "rejected" | "monitor" | "trial" | "needs_public_url" | "deferred";
export type RadarItemStatus = "draft" | "reviewed" | "published" | "archived";
export type ConfidenceLevel = "high" | "medium" | "low";
export type SourceTier = 1 | 2 | 3 | 4 | "T1" | "T1.5" | "T2" | "T3" | "unreviewed";

export type Source = {
  id: string;
  name: string;
  url: string | null;
  type: string;
  tier: SourceTier;
  language: string;
  region: string;
  topics: string[];
  status: SourceStatus;
  weight: number;
  riskNotes: string;
  crawlMethod?: string;
  riskFlags?: string[];
  lastCheckedAt?: string;
};

export type RawItem = {
  id: string;
  sourceId: string;
  externalId?: string;
  url: string;
  canonicalUrl: string;
  title: string;
  author?: string;
  publishedAt?: string;
  retrievedAt: string;
  rawText: string;
  rawMetadata: Record<string, unknown>;
  hash: string;
  language: string;
};

export type RadarItem = {
  id: string;
  rawItemId: string;
  sourceId: string;
  title: string;
  summaryZh: string;
  summaryEn: string;
  topics: string[];
  category: string;
  region: string;
  status: RadarItemStatus;
  confidence: ConfidenceLevel;
  credibilityScore: number;
  noveltyScore: number;
  importanceScore: number;
  createdAt: string;
  updatedAt: string;
};

export type EventCluster = {
  id: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  status: RadarItemStatus;
  confidence: ConfidenceLevel;
  importanceScore: number;
  firstSeenAt: string;
  updatedAt: string;
  radarItemIds: string[];
  entityIds: string[];
  openQuestions: string[];
};

export type EntityType = "company" | "person" | "model" | "product" | "paper" | "project";

export type Entity = {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  description: string;
  homepageUrl?: string;
  metadata: Record<string, string | number | boolean>;
};

export type Score = {
  id: string;
  targetType: "radar_item" | "event_cluster" | "entity";
  targetId: string;
  scoreType: "credibility" | "novelty" | "importance" | "velocity" | "writing_value";
  score: number;
  explanation: string;
  model: string;
  ruleVersion: string;
  createdAt: string;
};

export type IngestionRun = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "queued" | "running" | "succeeded" | "failed" | "partial";
  trigger: "manual" | "scheduled" | "retry";
  sourceCount: number;
  rawItemCount: number;
  radarItemCount: number;
  errorCount: number;
  metadata: Record<string, string | number | boolean>;
};
