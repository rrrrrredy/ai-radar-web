import crypto from "node:crypto";

import { hasUnsafeFragment, isPublicHttpUrl } from "@/lib/ingestion/config";
import type { IngestionRawItem } from "@/lib/ingestion/types";
import {
  ENTITY_TYPES,
  RADAR_CATEGORIES,
  UNDERSTANDING_STATUSES,
  type ClassificationResult,
  type EntityExtractionResult,
  type RadarCategory,
  type ScoreResult,
  type SummaryResult,
  type UnderstandingEntity,
  type UnderstandingRadarItem
} from "@/lib/understanding/types";

const categorySet = new Set<string>(RADAR_CATEGORIES);
const entityTypeSet = new Set<string>(ENTITY_TYPES);
const statusSet = new Set<string>(UNDERSTANDING_STATUSES);

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: string;
    };

export function validateRawItem(value: unknown): ValidationResult<IngestionRawItem> {
  if (!isRecord(value)) {
    return invalid("raw item must be an object");
  }

  const required = ["id", "source_id", "source_name", "title", "url", "collected_at", "retrieved_at"];
  const missing = required.filter((field) => typeof value[field] !== "string" || !String(value[field]).trim());
  if (missing.length > 0) {
    return invalid(`raw item is missing required fields: ${missing.join(", ")}`);
  }

  if (!isPublicHttpUrl(String(value.url))) {
    return invalid("raw item URL is not eligible for public understanding");
  }

  const joinedText = [value.title, value.url, value.canonical_url, value.raw_text, value.summary]
    .filter(Boolean)
    .join("\n");
  if (hasUnsafeFragment(joinedText)) {
    return invalid("raw item contains unsafe private or credentialed content");
  }

  return {
    ok: true,
    value: value as IngestionRawItem
  };
}

export function validateClassification(value: unknown): ValidationResult<ClassificationResult> {
  if (!isRecord(value)) {
    return invalid("classification output must be an object");
  }

  const categories = asStringArray(value.categories).filter(isRadarCategory);
  const tags = uniqueStrings(asStringArray(value.tags)).slice(0, 10);

  return {
    ok: true,
    value: {
      ai_relevance_score: clampScore(value.ai_relevance_score),
      language: normalizeLanguage(value.language),
      categories: categories.length > 0 ? uniqueCategories(categories).slice(0, 4) : ["other"],
      tags,
      confidence: clampScore(value.confidence ?? 0.55)
    }
  };
}

export function validateSummary(value: unknown): ValidationResult<SummaryResult> {
  if (!isRecord(value)) {
    return invalid("summary output must be an object");
  }

  const summaryZh = normalizeText(value.summary_zh);
  const summaryEn = normalizeText(value.summary_en);

  if (!summaryZh || !summaryEn) {
    return invalid("summary output must include summary_zh and summary_en");
  }

  return {
    ok: true,
    value: {
      summary_zh: summaryZh,
      summary_en: summaryEn,
      evidence_notes: uniqueStrings(asStringArray(value.evidence_notes)).slice(0, 8)
    }
  };
}

export function validateEntityExtraction(value: unknown): ValidationResult<EntityExtractionResult> {
  if (!isRecord(value) || !Array.isArray(value.entities)) {
    return invalid("entity extraction output must include entities array");
  }

  const entities = value.entities
    .map(normalizeEntity)
    .filter((entity): entity is UnderstandingEntity => Boolean(entity))
    .slice(0, 12);

  return {
    ok: true,
    value: {
      entities
    }
  };
}

export function validateScoreResult(value: unknown): ValidationResult<Partial<ScoreResult>> {
  if (!isRecord(value)) {
    return invalid("score output must be an object");
  }

  return {
    ok: true,
    value: {
      importance_score: optionalScore(value.importance_score),
      credibility_score: optionalScore(value.credibility_score),
      novelty_score: optionalScore(value.novelty_score),
      why_it_matters: normalizeOptionalText(value.why_it_matters),
      evidence_notes: uniqueStrings(asStringArray(value.evidence_notes)).slice(0, 6)
    }
  };
}

export function validateRadarItem(item: UnderstandingRadarItem): ValidationResult<UnderstandingRadarItem> {
  if (!item.id || !item.raw_item_id || !item.source_id || !item.title) {
    return invalid("radar item is missing required identity fields");
  }

  if (!statusSet.has(item.status)) {
    return invalid("radar item has invalid status");
  }

  if (item.status !== "failed" && (!item.summary_zh || !item.summary_en)) {
    return invalid("radar item summaries are required unless failed");
  }

  const invalidCategory = item.categories.find((category) => !categorySet.has(category));
  if (invalidCategory) {
    return invalid(`radar item has invalid category: ${invalidCategory}`);
  }

  const invalidEntity = item.entities.find((entity) => !entityTypeSet.has(entity.type));
  if (invalidEntity) {
    return invalid(`radar item has invalid entity type: ${invalidEntity.type}`);
  }

  const numericScores = [
    item.ai_relevance_score,
    item.importance_score,
    item.credibility_score,
    item.novelty_score,
    item.freshness_score,
    item.overall_score,
    item.source_weight,
    item.confidence
  ];

  if (numericScores.some((score) => score < 0 || score > 1 || !Number.isFinite(score))) {
    return invalid("radar item scores must be finite values between 0 and 1");
  }

  return {
    ok: true,
    value: item
  };
}

export function hashJson(value: unknown) {
  return sha256(JSON.stringify(value));
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function clampScore(value: unknown, fallback = 0) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, Number(numberValue.toFixed(4))));
}

export function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeOptionalText(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || undefined;
}

export function truncateText(value: string, maxChars: number) {
  const normalized = normalizeText(value);
  if (normalized.length <= maxChars) {
    return {
      text: normalized,
      truncated: false
    };
  }

  return {
    text: normalized.slice(0, maxChars).trim(),
    truncated: true
  };
}

export function estimatedTokens(value: string) {
  return Math.ceil(value.length / 4);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(error: string): ValidationResult<never> {
  return {
    ok: false,
    error
  };
}

function optionalScore(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return clampScore(value);
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeText).filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.toLowerCase().trim()))).filter(Boolean);
}

function uniqueCategories(values: RadarCategory[]) {
  return Array.from(new Set(values));
}

function isRadarCategory(value: string): value is RadarCategory {
  return categorySet.has(value);
}

function normalizeLanguage(value: unknown): ClassificationResult["language"] {
  if (value === "zh" || value === "en" || value === "mixed" || value === "unknown") {
    return value;
  }

  return "unknown";
}

function normalizeEntity(value: unknown): UnderstandingEntity | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = normalizeText(value.name);
  const type = normalizeText(value.type);
  if (!name || !entityTypeSet.has(type)) {
    return null;
  }

  return {
    name,
    type: type as UnderstandingEntity["type"],
    confidence: clampScore(value.confidence ?? 0.5),
    evidence_text: normalizeOptionalText(value.evidence_text)
  };
}
