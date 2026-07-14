import { getDeepSeekConfig } from "@/lib/deepseek/provider";
import { buildAskMessages, askPromptVersion } from "@/lib/qa/prompts";
import type { AskAnswer, AskLiveModelOutput, AskRequest } from "@/lib/qa/types";
import { validateAskLiveOutput } from "@/lib/qa/validate";
import { generateMockAskAnswer } from "@/lib/qa/mock-answer";
import { retrieveRadarEvidence } from "@/lib/retrieval/search";
import type { RetrievalResult } from "@/lib/retrieval/types";
import { isEnabled } from "@/lib/utils";

export type SafeGenerationError = {
  status: number;
  message: string;
};

export async function answerRadarQuestion(request: Required<Pick<AskRequest, "question" | "generationMode">> & Omit<AskRequest, "question" | "generationMode">): Promise<AskAnswer> {
  const retrieval = await retrieveRadarEvidence(request.question, "qa", { limit: 8 });

  if (request.generationMode === "mock") {
    return generateMockAskAnswer(request.question, retrieval);
  }

  const live = await generateLiveAskAnswer(request.question, retrieval);
  return {
    mode: "live",
    question: request.question,
    resolved_time_window: retrieval.resolvedTimeWindow,
    data_source: retrieval.dataSource,
    short_answer: live.output.short_answer,
    facts: live.output.facts,
    evidence_backed_inference: live.output.evidence_backed_inference,
    uncertainty: live.output.uncertainty,
    citations: retrieval.citations,
    retrieved_item_count: retrieval.rankedItems.length,
    freshness_note: generateMockAskAnswer(request.question, retrieval).freshness_note,
    model_metadata: {
      provider: "deepseek",
      model: live.model,
      prompt_version: askPromptVersion,
      api_call_count: live.apiCallCount
    }
  };
}

async function generateLiveAskAnswer(question: string, retrieval: RetrievalResult): Promise<{
  output: AskLiveModelOutput;
  model: string;
  apiCallCount: number;
}> {
  const config = getDeepSeekConfig();
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

  if (!isEnabled(process.env.ENABLE_PUBLIC_LIVE_DEEPSEEK)) {
    throw {
      status: 403,
      message: "Public live DeepSeek generation is disabled on this server."
    } satisfies SafeGenerationError;
  }

  if (!config.hasApiKey || !apiKey) {
    throw {
      status: 400,
      message: "DeepSeek live generation is not available in this server environment."
    } satisfies SafeGenerationError;
  }

  let response: Response;
  try {
    response = await fetch(completionUrl(config.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: config.smartModel,
        messages: buildAskMessages(question, retrieval),
        temperature: 0.1,
        response_format: {
          type: "json_object"
        }
      }),
      signal: AbortSignal.timeout(45_000)
    });
  } catch (error) {
    throw {
      status: isAbortError(error) ? 504 : 502,
      message: isAbortError(error) ? "DeepSeek request timed out." : "DeepSeek request failed before a safe response was available."
    } satisfies SafeGenerationError;
  }
  const body = (await response.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };

  if (!response.ok) {
    throw {
      status: 502,
      message: sanitizeProviderError(body.error?.message ?? `DeepSeek HTTP ${response.status}`)
    } satisfies SafeGenerationError;
  }

  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw {
      status: 502,
      message: "DeepSeek response did not include message content."
    } satisfies SafeGenerationError;
  }

  const validation = validateAskLiveOutput(parseJsonContent(content));
  if (!validation.ok) {
    throw {
      status: 502,
      message: validation.error
    } satisfies SafeGenerationError;
  }

  return {
    output: validation.value,
    model: config.smartModel,
    apiCallCount: 1
  };
}

function completionUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

function parseJsonContent(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced?.[1] ?? content).trim()) as unknown;
}

function sanitizeProviderError(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 400);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}
