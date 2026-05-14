import { scoreRadarItem, type DeepSeekJsonResult } from "@/lib/deepseek/provider";
import type { IngestionRawItem, SourceTier } from "@/lib/ingestion/types";
import { INCLUSION_THRESHOLDS, SCORING_FORMULA_WEIGHTS } from "@/lib/understanding/prompts";
import type {
  ClassificationResult,
  EntityExtractionResult,
  RadarCategory,
  ScoreResult,
  StageResult,
  SummaryResult,
  UnderstandingConfig,
  UnderstandingModelInput,
  UnderstandingStatus
} from "@/lib/understanding/types";
import { clampScore, estimatedTokens, normalizeText, validateScoreResult } from "@/lib/understanding/validate";

const categoryImportance: Partial<Record<RadarCategory, number>> = {
  model_release: 0.82,
  product_update: 0.68,
  agent: 0.72,
  research: 0.74,
  open_source: 0.72,
  infrastructure: 0.66,
  funding: 0.6,
  business: 0.58,
  regulation: 0.7,
  safety: 0.72,
  benchmark: 0.66,
  media_interview: 0.52,
  opinion: 0.42,
  other: 0.35
};

export type ScoreInput = {
  classification: ClassificationResult;
  summary: SummaryResult;
  entities: EntityExtractionResult;
};

export async function scoreRawItem(
  modelInput: UnderstandingModelInput,
  input: ScoreInput,
  config: UnderstandingConfig
): Promise<StageResult<ScoreResult>> {
  const fallback = heuristicScores(modelInput.rawItem, input);

  if (config.mode !== "live") {
    return {
      value: fallback,
      apiCallCount: 0,
      estimatedTokenCount: estimatedTokens(modelInput.text)
    };
  }

  const response = (await scoreRadarItem(
    {
      ...modelInput,
      classification: input.classification,
      summary: input.summary,
      entities: input.entities
    },
    {
      mode: "live",
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.smartModel,
      promptVersion: config.promptVersion,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries
    }
  )) as DeepSeekJsonResult<Partial<ScoreResult>>;

  if (!response.ok) {
    return withFallback(fallback, modelInput.text, response, response.error.message);
  }

  const validated = validateScoreResult(response.data);
  if (!validated.ok) {
    return withFallback(fallback, modelInput.text, response, validated.error);
  }

  const blended = blendModelScoreHints(fallback, validated.value, input.classification.ai_relevance_score);

  return {
    value: blended,
    apiCallCount: response.apiCallCount,
    estimatedTokenCount: response.tokenUsage?.total_tokens ?? estimatedTokens(modelInput.text),
    tokenUsage: response.tokenUsage,
    model: response.model
  };
}

export function heuristicScores(rawItem: IngestionRawItem, input: ScoreInput): ScoreResult {
  const sourceWeight = sourceWeightFromRawItem(rawItem);
  const sourceCredibility = sourceCredibilityFromTier(rawItem.source_tier, sourceWeight);
  const categoryScore = Math.max(...input.classification.categories.map((category) => categoryImportance[category] ?? 0.35));
  const metadataPenalty = rawItem.metadata?.item_kind === "raw_html_summary" ? 0.08 : 0;
  const importance = clampScore(input.classification.ai_relevance_score * 0.55 + categoryScore * 0.3 + sourceWeight * 0.15);
  const credibility = clampScore(sourceCredibility - metadataPenalty);
  const novelty = clampScore(categoryScore * 0.65 + input.classification.ai_relevance_score * 0.2 + (input.entities.entities.length > 0 ? 0.08 : 0));
  const freshness = freshnessScore(rawItem.published_at ?? rawItem.collected_at);
  const overall = calculateOverallScore({
    aiRelevance: input.classification.ai_relevance_score,
    importance,
    credibility,
    novelty,
    freshness,
    sourceWeight
  });

  return {
    importance_score: importance,
    credibility_score: credibility,
    novelty_score: novelty,
    freshness_score: freshness,
    overall_score: overall,
    source_weight: sourceWeight,
    confidence: clampScore((input.classification.confidence + credibility + (input.summary.evidence_notes.length > 0 ? 0.55 : 0.45)) / 3),
    why_it_matters: whyItMatters(input.classification.categories, rawItem.title),
    evidence_notes: [
      ...input.summary.evidence_notes,
      rawItem.published_at ? "" : "published_at missing; freshness uses collected_at",
      `formula weights: relevance ${SCORING_FORMULA_WEIGHTS.aiRelevance}, importance ${SCORING_FORMULA_WEIGHTS.importance}, credibility ${SCORING_FORMULA_WEIGHTS.credibility}, novelty ${SCORING_FORMULA_WEIGHTS.novelty}, freshness ${SCORING_FORMULA_WEIGHTS.freshness}, source_weight ${SCORING_FORMULA_WEIGHTS.sourceWeight}`
    ].filter(Boolean)
  };
}

export function decideStatus(classification: ClassificationResult, scores: ScoreResult): {
  status: UnderstandingStatus;
  exclusionReason?: string;
} {
  if (classification.ai_relevance_score < INCLUSION_THRESHOLDS.excludedBelow) {
    return {
      status: "excluded",
      exclusionReason: "ai_relevance_below_threshold"
    };
  }

  if (classification.ai_relevance_score < INCLUSION_THRESHOLDS.reviewBelow) {
    return {
      status: "needs_review",
      exclusionReason: "ai_relevance_requires_review"
    };
  }

  if (scores.credibility_score < INCLUSION_THRESHOLDS.lowCredibilityBelow) {
    return {
      status: "needs_review",
      exclusionReason: "source_credibility_requires_review"
    };
  }

  return {
    status: "included"
  };
}

export function calculateOverallScore(input: {
  aiRelevance: number;
  importance: number;
  credibility: number;
  novelty: number;
  freshness: number;
  sourceWeight: number;
}) {
  const value =
    input.aiRelevance * SCORING_FORMULA_WEIGHTS.aiRelevance +
    input.importance * SCORING_FORMULA_WEIGHTS.importance +
    input.credibility * SCORING_FORMULA_WEIGHTS.credibility +
    input.novelty * SCORING_FORMULA_WEIGHTS.novelty +
    input.freshness * SCORING_FORMULA_WEIGHTS.freshness +
    input.sourceWeight * SCORING_FORMULA_WEIGHTS.sourceWeight;

  return clampScore(value);
}

function sourceWeightFromRawItem(rawItem: IngestionRawItem) {
  const metadataWeight = rawItem.metadata?.source_weight;
  if (typeof metadataWeight === "number") {
    return clampScore(metadataWeight, 0.5);
  }

  return sourceWeightFromTier(rawItem.source_tier);
}

function sourceWeightFromTier(tier: SourceTier) {
  switch (tier) {
    case "T1":
      return 0.95;
    case "T1.5":
      return 0.82;
    case "T2":
      return 0.68;
    case "T3":
      return 0.42;
    case "unreviewed":
      return 0.3;
    default:
      return 0.5;
  }
}

function sourceCredibilityFromTier(tier: SourceTier, sourceWeight: number) {
  const tierScore = sourceWeightFromTier(tier);
  return clampScore(tierScore * 0.7 + sourceWeight * 0.3);
}

function freshnessScore(dateValue: string | undefined) {
  if (!dateValue) {
    return 0.35;
  }

  const timestamp = Date.parse(dateValue);
  if (!Number.isFinite(timestamp)) {
    return 0.35;
  }

  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  if (ageDays <= 1) {
    return 1;
  }

  if (ageDays <= 7) {
    return 0.85;
  }

  if (ageDays <= 30) {
    return 0.65;
  }

  if (ageDays <= 90) {
    return 0.45;
  }

  return 0.25;
}

function whyItMatters(categories: RadarCategory[], title: string) {
  const titleText = normalizeText(title);
  if (categories.includes("model_release")) {
    return `May affect model capability tracking and product benchmarking: ${titleText}`;
  }

  if (categories.includes("open_source")) {
    return `May change available building blocks for teams evaluating open implementations: ${titleText}`;
  }

  if (categories.includes("regulation") || categories.includes("safety")) {
    return `May affect AI deployment risk, governance, or compliance planning: ${titleText}`;
  }

  if (categories.includes("research")) {
    return `May add technical evidence for future radar tracking: ${titleText}`;
  }

  return `Potentially relevant AI signal for review: ${titleText}`;
}

function blendModelScoreHints(fallback: ScoreResult, modelScore: Partial<ScoreResult>, aiRelevanceScore: number): ScoreResult {
  const importance = blend(fallback.importance_score, modelScore.importance_score, 0.25);
  const credibility = blend(fallback.credibility_score, modelScore.credibility_score, 0.15);
  const novelty = blend(fallback.novelty_score, modelScore.novelty_score, 0.25);
  const overall = calculateOverallScore({
    aiRelevance: aiRelevanceScore,
    importance,
    credibility,
    novelty,
    freshness: fallback.freshness_score,
    sourceWeight: fallback.source_weight
  });

  return {
    ...fallback,
    importance_score: importance,
    credibility_score: credibility,
    novelty_score: novelty,
    overall_score: overall,
    why_it_matters: modelScore.why_it_matters ?? fallback.why_it_matters,
    evidence_notes: [...fallback.evidence_notes, ...(modelScore.evidence_notes ?? [])]
  };
}

function blend(ruleScore: number, modelScore: number | undefined, modelWeight: number) {
  if (modelScore === undefined) {
    return ruleScore;
  }

  return clampScore(ruleScore * (1 - modelWeight) + modelScore * modelWeight);
}

function withFallback(
  fallback: ScoreResult,
  text: string,
  response: DeepSeekJsonResult<Partial<ScoreResult>>,
  error: string
): StageResult<ScoreResult> {
  return {
    value: fallback,
    apiCallCount: response.apiCallCount,
    estimatedTokenCount: response.tokenUsage?.total_tokens ?? estimatedTokens(text),
    tokenUsage: response.tokenUsage,
    model: response.model,
    error: `score fallback used: ${error}`
  };
}
