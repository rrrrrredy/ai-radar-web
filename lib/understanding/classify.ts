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

type CategoryEvidence = {
  category: RadarCategory;
  score: number;
};

const modelNameSignals = [
  /\bgpt[-\w.]*\b/i,
  /claude/i,
  /gemini/i,
  /llama/i,
  /deepseek/i,
  /qwen/i,
  /mistral/i,
  /mixtral/i,
  /phi[-\w.]*/i,
  /\bmodel\b/i,
  /large language model/i,
  /\bllm\b/i
];

const productSignals = [
  /\bapp\b/i,
  /\bproduct\b/i,
  /\bfeature\b/i,
  /\bplatform\b/i,
  /\bapi\b/i,
  /\bsdk\b/i,
  /copilot/i,
  /assistant/i,
  /chatbot/i
];

const releaseSignals = [
  /\bannounc(?:e|ed|ing|es)\b/i,
  /\bintroduc(?:e|ed|ing|es)\b/i,
  /\blaunched?\b/i,
  /\breleas(?:e|ed|ing|es)\b/i,
  /\bunveil(?:ed|s|ing)?\b/i,
  /\broll(?:ed)? out\b/i,
  /\bnow available\b/i,
  /\bpreview\b/i,
  /\bga\b/i
];

const infrastructureVendorSignals = [
  /nvidia/i,
  /\bamd\b/i,
  /\bintel\b/i,
  /aws|amazon web services/i,
  /google cloud/i,
  /azure/i,
  /cloudflare/i,
  /coreweave/i,
  /cerebras/i,
  /\bgroq\b/i,
  /lambda labs/i,
  /modal/i,
  /replicate/i,
  /together ai/i,
  /hugging face/i,
  /vercel/i
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
  const evidenceText = stripLowSignalSections(haystack);
  const categoryEvidence = inferCategoryEvidence(rawItem, text, evidenceText);
  const uniqueCategories = categoryEvidence.map((evidence) => evidence.category);
  const tags = tagRules.filter((rule) => rule.pattern.test(evidenceText)).map((rule) => rule.tag);
  const strongMatches = strongAiSignals.filter((pattern) => pattern.test(evidenceText)).length;
  const mediumMatches = mediumAiSignals.filter((pattern) => pattern.test(evidenceText)).length;
  const sourceBonus = sourceTypeBonus(rawItem.source_type);
  const categoryBonus = Math.min(0.12, categoryEvidence.reduce((sum, evidence) => sum + evidence.score, 0) * 0.02);
  const relevance = Math.min(1, 0.15 + strongMatches * 0.16 + mediumMatches * 0.08 + sourceBonus + categoryBonus);

  return {
    ai_relevance_score: Number(relevance.toFixed(4)),
    language: rawItem.language ?? "unknown",
    categories: uniqueCategories.length > 0 ? uniqueCategories.slice(0, 4) : ["other"],
    tags: Array.from(new Set(tags)).slice(0, 8),
    confidence: Math.min(0.9, 0.45 + strongMatches * 0.12 + mediumMatches * 0.06 + sourceBonus + categoryBonus)
  };
}

function inferCategoryEvidence(rawItem: IngestionRawItem, text: string, haystack: string): CategoryEvidence[] {
  const url = rawItem.canonical_url || rawItem.url;
  const compactContext = stripLowSignalSections([rawItem.title, rawItem.summary, rawItem.source_name, rawItem.source_type, url].join("\n"));
  const evidence = new Map<RadarCategory, number>();
  const add = (category: RadarCategory, score: number) => {
    evidence.set(category, Math.max(evidence.get(category) ?? 0, score));
  };

  if (
    rawItem.source_type === "arxiv" ||
    /(?:^|\/\/|\.)arxiv\.org\b/i.test(url) ||
    matchesAny(haystack, [/arxiv:/i, /\bpaper\b/i, /\bjournal\b/i, /\bproceedings\b/i, /\bpreprint\b/i, /\bstudy\b/i])
  ) {
    add("research", 3);
  }

  if (
    rawItem.source_type === "github" ||
    /(?:^|\/\/|\.)github\.com\b/i.test(url) ||
    matchesAny(compactContext, [/open[- ]source/i, /\brepository\b/i, /\brepo\b/i, /\bgithub release\b/i, /\breleased on github\b/i])
  ) {
    add("open_source", 3);
  }

  if (matchesAny(haystack, releaseSignals) && matchesAny(compactContext, modelNameSignals)) {
    add("model_release", 4);
  }

  if (
    rawItem.source_type === "official_blog" &&
    matchesAny(haystack, releaseSignals) &&
    matchesAny(compactContext, productSignals)
  ) {
    add("product_update", 4);
  } else if (matchesAny(haystack, releaseSignals) && matchesAny(compactContext, productSignals) && hasAiEvidence(haystack)) {
    add("product_update", 3);
  }

  if (matchesAny(compactContext, [/\bagent\b/i, /\bagents\b/i, /tool use/i, /computer use/i, /browser use/i, /\bworkflow automation\b/i])) {
    add("agent", 3);
  }

  if (
    matchesAny(haystack, [/benchmark/i, /leaderboard/i, /\beval(?:uation)?s?\b/i, /\bscorecard\b/i, /\bMMLU\b/i, /\bSWE-bench\b/i])
  ) {
    add("benchmark", 3);
  }

  if (
    rawItem.source_type === "podcast" ||
    matchesAny(haystack, [/podcast/i, /\binterview\b/i, /\bconversation with\b/i, /\btranscript\b/i])
  ) {
    add("media_interview", 3);
  }

  if (
    rawItem.source_type === "newsletter" ||
    matchesAny(haystack, [/\bopinion\b/i, /\bessay\b/i, /\bcommentary\b/i, /\bperspective\b/i, /\bnewsletter\b/i])
  ) {
    add("opinion", 2);
  }

  if (
    matchesAny(haystack, [/infrastructure/i, /\bgpu\b/i, /\bchip\b/i, /datacenter|data center/i, /\bcompute\b/i, /inference serving/i, /\bserving\b/i]) &&
    (matchesAny(compactContext, infrastructureVendorSignals) || hasAiEvidence(haystack))
  ) {
    add("infrastructure", 3);
  }

  if (matchesAny(haystack, [/\bregulat(?:e|ed|ion|ory)\b/i, /\bpolicy\b/i, /\blaw\b/i, /\bAI Act\b/i, /\bcompliance\b/i])) {
    add("regulation", 3);
  }

  if (matchesAny(haystack, [/\bsafety\b/i, /\balignment\b/i, /\bred team(?:ing)?\b/i, /\bmisuse\b/i, /\brisk assessment\b/i])) {
    add("safety", 3);
  }

  if (
    matchesAny(compactContext, [/\bfunding\b/i, /\braises?\b/i, /\binvestment\b/i, /\bvaluation\b/i, /\bseries [abc]\b/i]) &&
    hasAiEvidence(compactContext)
  ) {
    add("funding", 2);
  }

  if (
    matchesAny(compactContext, [/\brevenue\b/i, /\bpartnership\b/i, /\bcustomer\b/i, /\benterprise\b/i, /\bpricing\b/i, /\bmarket\b/i]) &&
    hasAiEvidence(compactContext)
  ) {
    add("business", 2);
  }

  return Array.from(evidence.entries())
    .map(([category, score]) => ({ category, score }))
    .sort((a, b) => b.score - a.score || categorySortOrder(a.category) - categorySortOrder(b.category));
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasAiEvidence(text: string) {
  return [...strongAiSignals, ...mediumAiSignals].some((pattern) => pattern.test(text));
}

function stripLowSignalSections(text: string) {
  return text.replace(/SPONSORS:[\s\S]*?(?=OUTLINE:|PODCAST LINKS:|$)/gi, "");
}

function categorySortOrder(category: RadarCategory) {
  const order: RadarCategory[] = [
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
  ];

  return order.indexOf(category);
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
