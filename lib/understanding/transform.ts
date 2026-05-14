import { hasUnsafeFragment } from "@/lib/ingestion/config";
import type { IngestionRawItem, SourceTier } from "@/lib/ingestion/types";
import { classifyRawItem } from "@/lib/understanding/classify";
import { extractRawItemEntities } from "@/lib/understanding/extract-entities";
import { scoreRawItem, decideStatus } from "@/lib/understanding/score";
import { summarizeRawItem } from "@/lib/understanding/summarize";
import type {
  ModelMetadata,
  StageResult,
  TokenUsage,
  UnderstandingConfig,
  UnderstandingModelInput,
  UnderstandingRadarItem
} from "@/lib/understanding/types";
import {
  clampScore,
  estimatedTokens,
  hashJson,
  normalizeText,
  sha256,
  truncateText,
  validateRadarItem,
  validateRawItem
} from "@/lib/understanding/validate";

export async function transformRawItemToRadarItem(
  rawValue: unknown,
  config: UnderstandingConfig,
  processedAt = new Date().toISOString()
): Promise<UnderstandingRadarItem> {
  const rawValidation = validateRawItem(rawValue);
  if (!rawValidation.ok) {
    return failedRadarItem(rawValue, config, processedAt, rawValidation.error);
  }

  const rawItem = rawValidation.value;
  if (rawItem.status !== "collected") {
    return failedRadarItem(rawItem, config, processedAt, rawItem.error_message ?? `raw item status is ${rawItem.status}`);
  }

  const inputText = buildInputText(rawItem);
  const truncated = truncateText(inputText, config.maxTextChars);
  const modelInput: UnderstandingModelInput = {
    rawItem,
    text: truncated.text,
    truncated: truncated.truncated,
    promptVersion: config.promptVersion
  };
  const inputHash = hashJson({
    id: rawItem.id,
    title: rawItem.title,
    url: rawItem.url,
    text: truncated.text
  });

  const classification = await classifyRawItem(modelInput, config);
  const summary = await summarizeRawItem(modelInput, config);
  const entities = await extractRawItemEntities(modelInput, config);
  const scores = await scoreRawItem(
    modelInput,
    {
      classification: classification.value,
      summary: summary.value,
      entities: entities.value
    },
    config
  );
  const statusDecision = decideStatus(classification.value, scores.value);
  const stages = [classification, summary, entities, scores];
  const stageErrors = stages.map((stage) => stage.error).filter(Boolean) as string[];
  const tokenUsage = mergeTokenUsage(stages);
  const apiCallCount = stages.reduce((sum, stage) => sum + stage.apiCallCount, 0);
  const estimatedTokenCount = stages.reduce((sum, stage) => sum + stage.estimatedTokenCount, 0);
  const metadata = buildModelMetadata(config, inputHash, "", tokenUsage, stageErrors, apiCallCount, estimatedTokenCount);

  const radarItem: UnderstandingRadarItem = {
    id: `radar_${sha256(rawItem.id).slice(0, 16)}`,
    raw_item_id: rawItem.id,
    source_id: rawItem.source_id,
    source_name: rawItem.source_name,
    title: rawItem.title,
    url: rawItem.canonical_url || rawItem.url,
    published_at: rawItem.published_at,
    collected_at: rawItem.collected_at,
    processed_at: processedAt,
    language: classification.value.language,
    summary_zh: summary.value.summary_zh,
    summary_en: summary.value.summary_en,
    ai_relevance_score: classification.value.ai_relevance_score,
    importance_score: scores.value.importance_score,
    credibility_score: scores.value.credibility_score,
    novelty_score: scores.value.novelty_score,
    freshness_score: scores.value.freshness_score,
    overall_score: scores.value.overall_score,
    categories: classification.value.categories,
    tags: classification.value.tags,
    entities: entities.value.entities,
    source_tier: rawItem.source_tier,
    source_weight: scores.value.source_weight,
    confidence: clampScore((classification.value.confidence + scores.value.confidence) / 2),
    status: statusDecision.status,
    exclusion_reason: statusDecision.exclusionReason,
    why_it_matters: scores.value.why_it_matters,
    evidence_notes: Array.from(new Set([...summary.value.evidence_notes, ...scores.value.evidence_notes])),
    model_metadata: metadata
  };

  radarItem.model_metadata.output_hash = hashJson({
    ...radarItem,
    model_metadata: {
      ...radarItem.model_metadata,
      output_hash: ""
    }
  });

  const validation = validateRadarItem(radarItem);
  if (!validation.ok) {
    return failedRadarItem(rawItem, config, processedAt, validation.error, tokenUsage, stageErrors);
  }

  return validation.value;
}

export function buildInputText(rawItem: IngestionRawItem) {
  return [
    `Title: ${rawItem.title}`,
    `Source: ${rawItem.source_name}`,
    `URL: ${rawItem.canonical_url || rawItem.url}`,
    rawItem.published_at ? `Published at: ${rawItem.published_at}` : "",
    rawItem.summary ? `Ingestion summary: ${rawItem.summary}` : "",
    rawItem.raw_text ? `Raw text: ${rawItem.raw_text}` : "",
    rawItem.metadata ? `Metadata: ${JSON.stringify(rawItem.metadata)}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function failedRadarItem(
  rawValue: unknown,
  config: UnderstandingConfig,
  processedAt: string,
  error: string,
  tokenUsage?: TokenUsage,
  priorErrors: string[] = []
): UnderstandingRadarItem {
  const raw = asPartialRawItem(rawValue);
  const inputHash = hashJson({
    id: raw.id,
    title: raw.title,
    url: raw.url
  });
  const metadata = buildModelMetadata(config, inputHash, "", tokenUsage, [...priorErrors, error]);
  const item: UnderstandingRadarItem = {
    id: `radar_failed_${sha256(raw.id || inputHash).slice(0, 12)}`,
    raw_item_id: raw.id || "unknown",
    source_id: raw.source_id || "unknown",
    source_name: raw.source_name || "unknown",
    title: raw.title || "Failed raw item",
    url: raw.url || "",
    published_at: raw.published_at,
    collected_at: raw.collected_at || processedAt,
    processed_at: processedAt,
    language: raw.language || "unknown",
    summary_zh: "理解失败：原始条目未通过安全或结构校验。",
    summary_en: "Understanding failed: the raw item did not pass safety or shape validation.",
    ai_relevance_score: 0,
    importance_score: 0,
    credibility_score: 0,
    novelty_score: 0,
    freshness_score: 0,
    overall_score: 0,
    categories: ["other"],
    tags: [],
    entities: [],
    source_tier: raw.source_tier,
    source_weight: 0,
    confidence: 0,
    status: "failed",
    exclusion_reason: "understanding_failed",
    evidence_notes: [error],
    model_metadata: metadata
  };

  item.model_metadata.output_hash = hashJson({
    ...item,
    model_metadata: {
      ...item.model_metadata,
      output_hash: ""
    }
  });

  return item;
}

function buildModelMetadata(
  config: UnderstandingConfig,
  inputHash: string,
  outputHash: string,
  tokenUsage: TokenUsage | undefined,
  errors: string[],
  apiCallCount = 0,
  estimatedTokenCount = 0
): ModelMetadata {
  return {
    mode: config.mode,
    provider: "deepseek",
    fast_model: config.fastModel,
    smart_model: config.smartModel,
    prompt_version: config.promptVersion,
    input_hash: inputHash,
    output_hash: outputHash,
    api_call_count: apiCallCount,
    estimated_token_count: estimatedTokenCount || undefined,
    token_usage: tokenUsage,
    error: errors.length > 0 ? errors.join(" | ") : undefined
  };
}

function mergeTokenUsage(stages: Array<StageResult<unknown>>): TokenUsage | undefined {
  const usage = stages
    .map((stage) => stage.tokenUsage)
    .filter((stageUsage): stageUsage is TokenUsage => Boolean(stageUsage));

  if (usage.length === 0) {
    return undefined;
  }

  return usage.reduce<TokenUsage>(
    (merged, stageUsage) => ({
      prompt_tokens: (merged.prompt_tokens ?? 0) + (stageUsage.prompt_tokens ?? 0),
      completion_tokens: (merged.completion_tokens ?? 0) + (stageUsage.completion_tokens ?? 0),
      total_tokens: (merged.total_tokens ?? 0) + (stageUsage.total_tokens ?? 0)
    }),
    {}
  );
}

function asPartialRawItem(value: unknown): {
  id?: string;
  source_id?: string;
  source_name?: string;
  title?: string;
  url?: string;
  published_at?: string;
  collected_at?: string;
  language: "zh" | "en" | "mixed" | "unknown";
  source_tier: SourceTier;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      language: "unknown",
      source_tier: "unreviewed"
    };
  }

  const record = value as Record<string, unknown>;
  return {
    id: safeText(record.id),
    source_id: safeText(record.source_id),
    source_name: safeText(record.source_name),
    title: safeText(record.title),
    url: safeText(record.url),
    published_at: safeText(record.published_at),
    collected_at: safeText(record.collected_at),
    language: normalizeLanguage(record.language),
    source_tier: normalizeTier(record.source_tier)
  };
}

function safeText(value: unknown) {
  const text = normalizeText(value);
  if (hasUnsafeFragment(text)) {
    return undefined;
  }

  return text || undefined;
}

function normalizeLanguage(value: unknown): "zh" | "en" | "mixed" | "unknown" {
  if (value === "zh" || value === "en" || value === "mixed" || value === "unknown") {
    return value;
  }

  return "unknown";
}

function normalizeTier(value: unknown): SourceTier {
  if (value === "T1" || value === "T1.5" || value === "T2" || value === "T3" || value === "unreviewed") {
    return value;
  }

  return "unreviewed";
}

export function estimateInputTokens(rawItem: IngestionRawItem, maxTextChars: number) {
  return estimatedTokens(truncateText(buildInputText(rawItem), maxTextChars).text);
}
