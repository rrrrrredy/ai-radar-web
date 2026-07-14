import { getDeepSeekConfig } from "@/lib/deepseek/provider";
import type { SafeGenerationError } from "@/lib/qa/answer";
import { retrieveRadarEvidence } from "@/lib/retrieval/search";
import { buildWritingMessages, writingPromptVersion } from "@/lib/writing-assistant/prompts";
import type {
  WritingAssistantOutput,
  WritingAssistantRequest,
  WritingLiveModelOutput
} from "@/lib/writing-assistant/types";
import { validateWritingLiveOutput } from "@/lib/writing-assistant/validate";
import { generateMockWritingOutput } from "@/lib/writing-assistant/mock-writing";
import { isEnabled } from "@/lib/utils";

export async function generateWritingAssistantOutput(
  request: Required<Pick<WritingAssistantRequest, "query" | "generationMode" | "outputType">> & Omit<WritingAssistantRequest, "query" | "generationMode" | "outputType">
): Promise<WritingAssistantOutput> {
  const retrieval = await retrieveRadarEvidence(request.query, "writing_assistant", { limit: 8 });

  if (request.generationMode === "mock") {
    return generateMockWritingOutput(request, retrieval);
  }

  const live = await generateLiveWriting(request, retrieval);
  const citationsById = new Map(retrieval.citations.map((citation) => [citation.id, citation]));
  const deterministicFallback = live.output.candidate_topics.length === 0
    ? generateMockWritingOutput({ ...request, generationMode: "mock" }, retrieval)
    : null;
  const candidateTopics = live.output.candidate_topics.length > 0
    ? live.output.candidate_topics
    : deterministicFallback?.candidate_topics ?? [];

  return {
    mode: "live",
    query: request.query,
    resolved_time_window: retrieval.resolvedTimeWindow,
    data_source: retrieval.dataSource,
    candidate_topics: candidateTopics.map((candidate, index) => ({
      ...candidate,
      citations: retrieval.citations[index] ? [retrieval.citations[index]] : Array.from(citationsById.values()).slice(0, 1)
    })),
    counterpoints: live.output.counterpoints.length > 0
      ? live.output.counterpoints
      : deterministicFallback?.counterpoints ?? [],
    missing_evidence: live.output.missing_evidence.length > 0
      ? live.output.missing_evidence
      : deterministicFallback?.missing_evidence ?? [],
    citations: retrieval.citations,
    model_metadata: {
      provider: "deepseek",
      model: live.model,
      prompt_version: writingPromptVersion,
      api_call_count: live.apiCallCount
    }
  };
}

async function generateLiveWriting(
  request: Required<Pick<WritingAssistantRequest, "query" | "generationMode" | "outputType">> & Omit<WritingAssistantRequest, "query" | "generationMode" | "outputType">,
  retrieval: Awaited<ReturnType<typeof retrieveRadarEvidence>>
): Promise<{
  output: WritingLiveModelOutput;
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
        messages: buildWritingMessages(request, retrieval),
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

  const validation = validateWritingLiveOutput(parseJsonContent(content));
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
