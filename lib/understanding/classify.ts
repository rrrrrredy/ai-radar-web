import { classifyRadarItem, type DeepSeekJsonResult } from "@/lib/deepseek/provider";
import type { IngestionRawItem } from "@/lib/ingestion/types";
import type {
  ClassificationResult,
  RadarCategory,
  StageResult,
  UnderstandingConfig,
  UnderstandingModelInput
} from "@/lib/understanding/types";
import { estimatedTokens, validateClassification } from "@/lib/understanding/validate";

const categoryRules: Array<{ category: RadarCategory; patterns: RegExp[] }> = [
  { category: "model_release", patterns: [/model/i, /\bgpt\b/i, /claude/i, /gemini/i, /llama/i, /deepseek/i, /qwen/i] },
  { category: "product_update", patterns: [/launch/i, /release/i, /update/i, /product/i, /app/i, /feature/i] },
  { category: "agent", patterns: [/agent/i, /tool use/i, /workflow/i, /automation/i] },
  { category: "research", patterns: [/research/i, /paper/i, /arxiv/i, /study/i, /benchmark/i, /reinforcement learning/i] },
  { category: "open_source", patterns: [/open[- ]source/i, /github/i, /repository/i, /\brepo\b/i, /license/i] },
  { category: "infrastructure", patterns: [/gpu/i, /inference/i, /training/i, /datacenter/i, /compute/i, /chip/i, /serving/i] },
  { category: "funding", patterns: [/funding/i, /raises?/i, /investment/i, /valuation/i, /series [abc]/i] },
  { category: "business", patterns: [/revenue/i, /partnership/i, /customer/i, /enterprise/i, /pricing/i, /market/i] },
  { category: "regulation", patterns: [/regulat/i, /policy/i, /law/i, /act\b/i, /compliance/i] },
  { category: "safety", patterns: [/safety/i, /alignment/i, /risk/i, /eval/i, /red team/i] },
  { category: "benchmark", patterns: [/benchmark/i, /leaderboard/i, /score/i, /\bmlu\b/i, /eval/i] },
  { category: "media_interview", patterns: [/interview/i, /podcast/i, /conversation/i, /transcript/i] },
  { category: "opinion", patterns: [/opinion/i, /essay/i, /analysis/i, /commentary/i, /perspective/i] }
];

const strongAiSignals = [
  /artificial intelligence/i,
  /\bai\b/i,
  /machine learning/i,
  /deep learning/i,
  /large language model/i,
  /\bllm\b/i,
  /multimodal/i,
  /foundation model/i,
  /transformer/i,
  /reinforcement learning/i,
  /inference/i,
  /agent/i,
  /embedding/i,
  /fine[- ]tuning/i
];

const mediumAiSignals = [/automation/i, /data science/i, /robotics/i, /semantic/i, /prompt/i, /vector database/i];

const tagRules: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "llm", pattern: /\bllm\b|large language model|gpt|claude|gemini|llama|deepseek|qwen/i },
  { tag: "agents", pattern: /agent|tool use|workflow/i },
  { tag: "open-source", pattern: /open[- ]source|github|repository|\brepo\b/i },
  { tag: "research", pattern: /research|paper|arxiv|study/i },
  { tag: "benchmark", pattern: /benchmark|leaderboard|eval/i },
  { tag: "infrastructure", pattern: /gpu|inference|training|compute|serving/i },
  { tag: "business", pattern: /business|revenue|customer|enterprise|pricing|partnership/i },
  { tag: "safety", pattern: /safety|alignment|risk|red team/i },
  { tag: "policy", pattern: /policy|regulat|law|compliance/i }
];

export async function classifyRawItem(
  modelInput: UnderstandingModelInput,
  config: UnderstandingConfig
): Promise<StageResult<ClassificationResult>> {
  const fallback = heuristicClassification(modelInput.rawItem, modelInput.text);

  if (config.mode !== "live") {
    return {
      value: fallback,
      apiCallCount: 0,
      estimatedTokenCount: estimatedTokens(modelInput.text)
    };
  }

  const response = (await classifyRadarItem(modelInput, {
    mode: "live",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.fastModel,
    promptVersion: config.promptVersion,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries
  })) as DeepSeekJsonResult<ClassificationResult>;

  if (!response.ok) {
    return withFallback(fallback, modelInput.text, response, response.error.message);
  }

  const validated = validateClassification(response.data);
  if (!validated.ok) {
    return withFallback(fallback, modelInput.text, response, validated.error);
  }

  return {
    value: validated.value,
    apiCallCount: response.apiCallCount,
    estimatedTokenCount: response.tokenUsage?.total_tokens ?? estimatedTokens(modelInput.text),
    tokenUsage: response.tokenUsage,
    model: response.model
  };
}

export function heuristicClassification(rawItem: IngestionRawItem, text: string): ClassificationResult {
  const haystack = [rawItem.title, rawItem.summary, rawItem.source_name, rawItem.source_type, text].join("\n");
  const categories = categoryRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(haystack)))
    .map((rule) => rule.category);
  const uniqueCategories = Array.from(new Set(categories));
  const tags = tagRules.filter((rule) => rule.pattern.test(haystack)).map((rule) => rule.tag);
  const strongMatches = strongAiSignals.filter((pattern) => pattern.test(haystack)).length;
  const mediumMatches = mediumAiSignals.filter((pattern) => pattern.test(haystack)).length;
  const sourceBonus = sourceTypeBonus(rawItem.source_type);
  const relevance = Math.min(1, 0.15 + strongMatches * 0.16 + mediumMatches * 0.08 + sourceBonus);

  return {
    ai_relevance_score: Number(relevance.toFixed(4)),
    language: rawItem.language ?? "unknown",
    categories: uniqueCategories.length > 0 ? uniqueCategories.slice(0, 4) : ["other"],
    tags: Array.from(new Set(tags)).slice(0, 8),
    confidence: Math.min(0.9, 0.45 + strongMatches * 0.12 + mediumMatches * 0.06 + sourceBonus)
  };
}

function sourceTypeBonus(sourceType: string) {
  if (["arxiv", "github", "official_blog", "researcher"].includes(sourceType)) {
    return 0.16;
  }

  if (["ai_media", "tech_media", "newsletter", "podcast", "youtube"].includes(sourceType)) {
    return 0.1;
  }

  return 0.04;
}

function withFallback(
  fallback: ClassificationResult,
  text: string,
  response: DeepSeekJsonResult<ClassificationResult>,
  error: string
): StageResult<ClassificationResult> {
  return {
    value: fallback,
    apiCallCount: response.apiCallCount,
    estimatedTokenCount: response.tokenUsage?.total_tokens ?? estimatedTokens(text),
    tokenUsage: response.tokenUsage,
    model: response.model,
    error: `classification fallback used: ${error}`
  };
}
