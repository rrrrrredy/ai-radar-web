import { getAppConfig } from "@/lib/config";
import {
  buildClassificationMessages,
  buildEntityMessages,
  buildScoreMessages,
  buildSummaryMessages,
  buildTransformMessages
} from "@/lib/deepseek/prompts";
import type { RadarItem } from "@/lib/radar/types";
import type {
  ClassificationResult,
  EntityExtractionResult,
  SummaryResult,
  TokenUsage,
  TransformModelResult,
  UnderstandingMode,
  UnderstandingModelInput
} from "@/lib/understanding/types";

export type DeepSeekPurpose =
  | "relevance_filtering"
  | "summarization"
  | "tagging"
  | "classification"
  | "entity_extraction"
  | "scoring"
  | "report_generation";

export type DeepSeekConfig = {
  baseUrl: string;
  fastModel: string;
  smartModel: string;
  hasApiKey: boolean;
  intendedUse: {
    fast: DeepSeekPurpose[];
    smart: DeepSeekPurpose[];
  };
};

export type DeepSeekCallOptions = {
  mode: UnderstandingMode;
  apiKey?: string;
  baseUrl: string;
  model: string;
  promptVersion: string;
  timeoutMs: number;
  maxRetries: number;
};

export type DeepSeekJsonResult<T> =
  | {
      ok: true;
      data: T;
      model: string;
      promptVersion: string;
      apiCallCount: number;
      tokenUsage?: TokenUsage;
      raw: unknown;
    }
  | {
      ok: false;
      model: string;
      promptVersion: string;
      apiCallCount: number;
      tokenUsage?: TokenUsage;
      error: {
        message: string;
        status?: number;
        retryable: boolean;
      };
    };

type DeepSeekError = Extract<DeepSeekJsonResult<unknown>, { ok: false }>["error"];

type LegacyClassification = {
  itemId: string;
  model: string;
  promptVersion: string;
  labels: string[];
  phase: "phase-2-mock";
};

type LegacySummary = {
  itemId: string;
  model: string;
  promptVersion: string;
  summaryEn: string;
  summaryZh: string;
  phase: "phase-2-mock";
};

type LegacyScore = {
  itemId: string;
  model: string;
  promptVersion: string;
  credibilityScore: number;
  noveltyScore: number;
  importanceScore: number;
  phase: "phase-2-mock";
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export function getDeepSeekConfig(): DeepSeekConfig {
  const { deepSeek } = getAppConfig();

  return {
    baseUrl: deepSeek.baseUrl,
    fastModel: deepSeek.fastModel,
    smartModel: deepSeek.smartModel,
    hasApiKey: deepSeek.hasApiKey,
    intendedUse: {
      fast: ["relevance_filtering", "summarization", "tagging", "classification", "entity_extraction"],
      smart: ["scoring", "report_generation"]
    }
  };
}

export async function classifyRadarItem(item: RadarItem): Promise<LegacyClassification>;
export async function classifyRadarItem(
  input: UnderstandingModelInput,
  options: DeepSeekCallOptions
): Promise<DeepSeekJsonResult<ClassificationResult>>;
export async function classifyRadarItem(
  input: RadarItem | UnderstandingModelInput,
  options?: DeepSeekCallOptions
): Promise<LegacyClassification | DeepSeekJsonResult<ClassificationResult>> {
  if (!options) {
    const item = input as RadarItem;
    return {
      itemId: item.id,
      model: getDeepSeekConfig().fastModel,
      promptVersion: "classify-radar-item-v0",
      labels: item.topics,
      phase: "phase-2-mock"
    };
  }

  return callJsonModel<ClassificationResult>(buildClassificationMessages(toPromptInput(input as UnderstandingModelInput)), options);
}

export async function summarizeRadarItem(item: RadarItem): Promise<LegacySummary>;
export async function summarizeRadarItem(
  input: UnderstandingModelInput,
  options: DeepSeekCallOptions
): Promise<DeepSeekJsonResult<SummaryResult>>;
export async function summarizeRadarItem(
  input: RadarItem | UnderstandingModelInput,
  options?: DeepSeekCallOptions
): Promise<LegacySummary | DeepSeekJsonResult<SummaryResult>> {
  if (!options) {
    const item = input as RadarItem;
    return {
      itemId: item.id,
      model: getDeepSeekConfig().fastModel,
      promptVersion: "summarize-radar-item-v0",
      summaryEn: item.summaryEn,
      summaryZh: item.summaryZh,
      phase: "phase-2-mock"
    };
  }

  return callJsonModel<SummaryResult>(buildSummaryMessages(toPromptInput(input as UnderstandingModelInput)), options);
}

export async function extractEntities(
  input: UnderstandingModelInput,
  options: DeepSeekCallOptions
): Promise<DeepSeekJsonResult<EntityExtractionResult>> {
  return callJsonModel<EntityExtractionResult>(buildEntityMessages(toPromptInput(input)), options);
}

export async function scoreRadarItem(item: RadarItem): Promise<LegacyScore>;
export async function scoreRadarItem(
  input: UnderstandingModelInput & Record<string, unknown>,
  options: DeepSeekCallOptions
): Promise<DeepSeekJsonResult<Partial<TransformModelResult>>>;
export async function scoreRadarItem(
  input: RadarItem | (UnderstandingModelInput & Record<string, unknown>),
  options?: DeepSeekCallOptions
): Promise<LegacyScore | DeepSeekJsonResult<Partial<TransformModelResult>>> {
  if (!options) {
    const item = input as RadarItem;
    return {
      itemId: item.id,
      model: getDeepSeekConfig().smartModel,
      promptVersion: "score-radar-item-v0",
      credibilityScore: item.credibilityScore,
      noveltyScore: item.noveltyScore,
      importanceScore: item.importanceScore,
      phase: "phase-2-mock"
    };
  }

  return callJsonModel<Partial<TransformModelResult>>(buildScoreMessages(toPromptInput(input as UnderstandingModelInput & Record<string, unknown>)), options);
}

export async function transformRawItemToRadarItem(
  input: UnderstandingModelInput,
  options: DeepSeekCallOptions
): Promise<DeepSeekJsonResult<TransformModelResult>> {
  return callJsonModel<TransformModelResult>(buildTransformMessages(toPromptInput(input)), options);
}

export async function generateDailyBrief(items: RadarItem[]) {
  return {
    model: getDeepSeekConfig().smartModel,
    promptVersion: "generate-daily-brief-v0",
    title: "Phase 2 demo daily brief",
    itemCount: items.length,
    body:
      "Daily brief generation is not implemented in Phase 2. This mock response keeps build and UI flows typed.",
    phase: "phase-2-mock" as const
  };
}

async function callJsonModel<T>(messages: ChatMessage[], options: DeepSeekCallOptions): Promise<DeepSeekJsonResult<T>> {
  if (options.mode !== "live") {
    return {
      ok: false,
      model: options.model,
      promptVersion: options.promptVersion,
      apiCallCount: 0,
      error: {
        message: "DeepSeek API calls are disabled outside live mode.",
        retryable: false
      }
    };
  }

  if (!options.apiKey) {
    return {
      ok: false,
      model: options.model,
      promptVersion: options.promptVersion,
      apiCallCount: 0,
      error: {
        message: "DeepSeek API key is missing.",
        retryable: false
      }
    };
  }

  let apiCallCount = 0;
  let lastError: DeepSeekError = {
    message: "DeepSeek request failed.",
    retryable: true
  };
  let lastUsage: TokenUsage | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    apiCallCount += 1;

    try {
      const response = await fetch(completionUrl(options.baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: options.model,
          messages,
          temperature: 0.1,
          response_format: {
            type: "json_object"
          }
        }),
        signal: controller.signal
      });

      const body = (await response.json().catch(() => ({}))) as ChatCompletionResponse & {
        error?: {
          message?: string;
        };
      };
      lastUsage = normalizeUsage(body.usage);

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        lastError = {
          message: sanitizeProviderErrorMessage(body.error?.message, `DeepSeek HTTP ${response.status}`),
          status: response.status,
          retryable
        };

        if (retryable && attempt < options.maxRetries) {
          await delay(250 * (attempt + 1));
          continue;
        }

        break;
      }

      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        lastError = {
          message: "DeepSeek response did not include message content.",
          retryable: false
        };
        break;
      }

      return {
        ok: true,
        data: parseJsonContent<T>(content),
        model: options.model,
        promptVersion: options.promptVersion,
        apiCallCount,
        tokenUsage: lastUsage,
        raw: {
          usage: body.usage
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = {
        message: sanitizeProviderErrorMessage(message),
        retryable: true
      };

      if (attempt < options.maxRetries) {
        await delay(250 * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    ok: false,
    model: options.model,
    promptVersion: options.promptVersion,
    apiCallCount,
    tokenUsage: lastUsage,
    error: lastError
  };
}

function toPromptInput(input: UnderstandingModelInput & Record<string, unknown>) {
  return {
    rawItem: {
      id: input.rawItem.id,
      source_id: input.rawItem.source_id,
      source_name: input.rawItem.source_name,
      source_type: input.rawItem.source_type,
      source_tier: input.rawItem.source_tier,
      title: input.rawItem.title,
      url: input.rawItem.url,
      canonical_url: input.rawItem.canonical_url,
      published_at: input.rawItem.published_at,
      collected_at: input.rawItem.collected_at,
      language: input.rawItem.language
    },
    text: input.text,
    truncated: input.truncated,
    promptVersion: input.promptVersion,
    classification: input.classification,
    summary: input.summary,
    entities: input.entities
  };
}

function parseJsonContent<T>(content: string): T {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = (fenced?.[1] ?? content).trim();
  return JSON.parse(jsonText) as T;
}

function normalizeUsage(usage: ChatCompletionResponse["usage"]): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens
  };
}

function completionUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  return `${trimmed}/chat/completions`;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function sanitizeProviderErrorMessage(message: string | undefined, fallback = "DeepSeek request failed.") {
  const value = (message ?? fallback).trim() || fallback;
  return redactSensitiveText(value).slice(0, 500);
}

function redactSensitiveText(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-ant-api\d{2}-[A-Za-z0-9_-]+/gi, "sk-ant-[redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/g, "[github-token-redacted]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/gi, "[github-token-redacted]")
    .replace(/\b(DEEPSEEK_API_KEY\s*=\s*)[^\s]+/gi, "$1[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/[A-Z]:\\Users\\[^\\\s]+\\[^\s]+/g, "[local-path-redacted]")
    .replace(/\/(?:Users|home)\/[^/\s]+\/[^\s]+/g, "[local-path-redacted]");
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
