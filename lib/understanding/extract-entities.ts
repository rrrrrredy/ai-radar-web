import { extractEntities, type DeepSeekJsonResult } from "@/lib/deepseek/provider";
import type { IngestionRawItem } from "@/lib/ingestion/types";
import type {
  EntityExtractionResult,
  StageResult,
  UnderstandingConfig,
  UnderstandingEntity,
  UnderstandingModelInput
} from "@/lib/understanding/types";
import { estimatedTokens, normalizeText, validateEntityExtraction } from "@/lib/understanding/validate";

const knownEntities: Array<{ name: string; type: UnderstandingEntity["type"]; pattern: RegExp }> = [
  { name: "OpenAI", type: "company", pattern: /\bOpenAI\b/i },
  { name: "DeepSeek", type: "company", pattern: /\bDeepSeek\b/i },
  { name: "Anthropic", type: "company", pattern: /\bAnthropic\b/i },
  { name: "Google", type: "company", pattern: /\bGoogle\b|\bGoogle DeepMind\b/i },
  { name: "Meta", type: "company", pattern: /\bMeta\b|\bFacebook AI\b/i },
  { name: "Microsoft", type: "company", pattern: /\bMicrosoft\b/i },
  { name: "NVIDIA", type: "company", pattern: /\bNVIDIA\b|\bNVDA\b/i },
  { name: "Hugging Face", type: "company", pattern: /\bHugging Face\b/i },
  { name: "GitHub", type: "product", pattern: /\bGitHub\b/i },
  { name: "ChatGPT", type: "product", pattern: /\bChatGPT\b/i },
  { name: "Claude", type: "model", pattern: /\bClaude\b/i },
  { name: "Gemini", type: "model", pattern: /\bGemini\b/i },
  { name: "Llama", type: "model", pattern: /\bLlama\b/i },
  { name: "Qwen", type: "model", pattern: /\bQwen\b/i }
];

export async function extractRawItemEntities(
  modelInput: UnderstandingModelInput,
  config: UnderstandingConfig
): Promise<StageResult<EntityExtractionResult>> {
  const fallback = heuristicEntities(modelInput.rawItem, modelInput.text);

  if (config.mode !== "live") {
    return {
      value: fallback,
      apiCallCount: 0,
      estimatedTokenCount: estimatedTokens(modelInput.text)
    };
  }

  const response = (await extractEntities(modelInput, {
    mode: "live",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.fastModel,
    promptVersion: config.promptVersion,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries
  })) as DeepSeekJsonResult<EntityExtractionResult>;

  if (!response.ok) {
    return withFallback(fallback, modelInput.text, response, response.error.message);
  }

  const validated = validateEntityExtraction(response.data);
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

export function heuristicEntities(rawItem: IngestionRawItem, text: string): EntityExtractionResult {
  const haystack = [rawItem.title, rawItem.source_name, rawItem.url, text].join("\n");
  const entities: UnderstandingEntity[] = [];

  for (const entity of knownEntities) {
    const match = haystack.match(entity.pattern);
    if (match) {
      entities.push({
        name: entity.name,
        type: entity.type,
        confidence: 0.72,
        evidence_text: match[0]
      });
    }
  }

  entities.push(...extractRepository(rawItem.url));
  entities.push(...extractArxivPaper(rawItem.url, rawItem.title));
  entities.push(...extractModelNames(haystack));
  entities.push(...extractAuthor(rawItem.author));

  return {
    entities: dedupeEntities(entities).slice(0, 12)
  };
}

function extractRepository(url: string): UnderstandingEntity[] {
  const match = url.match(/github\.com\/([^/\s?#]+)\/([^/\s?#]+)/i);
  if (!match) {
    return [];
  }

  return [
    {
      name: `${match[1]}/${match[2]}`,
      type: "repository",
      confidence: 0.86,
      evidence_text: "GitHub repository URL"
    }
  ];
}

function extractArxivPaper(url: string, title: string): UnderstandingEntity[] {
  const match = url.match(/arxiv\.org\/(?:abs|pdf)\/([0-9.]+)/i);
  if (!match) {
    return [];
  }

  return [
    {
      name: normalizeText(title) || `arXiv ${match[1]}`,
      type: "paper",
      confidence: 0.84,
      evidence_text: `arXiv ${match[1]}`
    }
  ];
}

function extractModelNames(text: string): UnderstandingEntity[] {
  const matches = text.match(/\b(?:GPT|Claude|Gemini|Llama|Qwen|DeepSeek|Mistral|Mixtral|Phi|Yi)[-\s]?[A-Za-z0-9.]{1,12}\b/g) ?? [];
  return matches.map((name) => ({
    name: normalizeText(name),
    type: "model",
    confidence: 0.58,
    evidence_text: normalizeText(name)
  }));
}

function extractAuthor(author: string | undefined): UnderstandingEntity[] {
  const normalized = normalizeText(author);
  if (!normalized || normalized.length > 80) {
    return [];
  }

  return [
    {
      name: normalized,
      type: "person",
      confidence: 0.5,
      evidence_text: "raw item author"
    }
  ];
}

function dedupeEntities(entities: UnderstandingEntity[]) {
  const seen = new Set<string>();
  const deduped: UnderstandingEntity[] = [];

  for (const entity of entities) {
    const key = `${entity.type}:${entity.name.toLowerCase()}`;
    if (seen.has(key) || !entity.name) {
      continue;
    }

    seen.add(key);
    deduped.push(entity);
  }

  return deduped;
}

function withFallback(
  fallback: EntityExtractionResult,
  text: string,
  response: DeepSeekJsonResult<EntityExtractionResult>,
  error: string
): StageResult<EntityExtractionResult> {
  return {
    value: fallback,
    apiCallCount: response.apiCallCount,
    estimatedTokenCount: response.tokenUsage?.total_tokens ?? estimatedTokens(text),
    tokenUsage: response.tokenUsage,
    model: response.model,
    error: `entity fallback used: ${error}`
  };
}
