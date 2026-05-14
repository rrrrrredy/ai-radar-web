import type {
  WritingAssistantRequest,
  WritingCandidateTopic,
  WritingLiveModelOutput,
  WritingOutputType
} from "@/lib/writing-assistant/types";

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: string;
    };

export function validateWritingRequest(value: unknown): ValidationResult<
  Required<Pick<WritingAssistantRequest, "query" | "generationMode" | "outputType">> &
    Omit<WritingAssistantRequest, "query" | "generationMode" | "outputType">
> {
  if (!isRecord(value)) {
    return invalid("Request body must be a JSON object.");
  }

  const query = normalizeText(value.query);
  if (!query) {
    return invalid("query is required.");
  }

  if (query.length > 1200) {
    return invalid("query must be 1200 characters or fewer.");
  }

  const generationMode = value.generationMode === undefined || value.generationMode === "" ? "mock" : value.generationMode;
  if (generationMode !== "mock" && generationMode !== "live") {
    return invalid("generationMode must be mock or live.");
  }

  const outputType = normalizeOutputType(value.outputType);
  if (!outputType) {
    return invalid("outputType is invalid.");
  }

  return {
    ok: true,
    value: {
      query,
      generationMode,
      outputType,
      language: value.language === "zh" || value.language === "en" || value.language === "mixed" ? value.language : undefined,
      audience: normalizeText(value.audience) || undefined
    }
  };
}

export function validateWritingLiveOutput(value: unknown): ValidationResult<WritingLiveModelOutput> {
  if (!isRecord(value)) {
    return invalid("Model output must be a JSON object.");
  }

  const candidate_topics = Array.isArray(value.candidate_topics)
    ? value.candidate_topics
        .map(normalizeCandidate)
        .filter((candidate): candidate is WritingCandidateTopic => Boolean(candidate))
        .slice(0, 8)
    : [];

  return {
    ok: true,
    value: {
      candidate_topics,
      counterpoints: stringArray(value.counterpoints).slice(0, 8),
      missing_evidence: stringArray(value.missing_evidence).slice(0, 8)
    }
  };
}

export function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeText).filter(Boolean);
}

function normalizeCandidate(value: unknown): WritingCandidateTopic | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = normalizeText(value.title);
  if (!title) {
    return null;
  }

  return {
    title,
    neutral_summary: normalizeText(value.neutral_summary),
    why_it_matters: normalizeText(value.why_it_matters),
    evidence: stringArray(value.evidence).slice(0, 6),
    caveats: stringArray(value.caveats).slice(0, 6),
    suggested_angle: normalizeText(value.suggested_angle),
    confidence: clampScore(value.confidence),
    citations: []
  };
}

function normalizeOutputType(value: unknown): WritingOutputType | null {
  if (value === undefined || value === null || value === "") {
    return "topic_candidates";
  }

  if (value === "topic_candidates" || value === "article_angles" || value === "weekly_observation" || value === "outline") {
    return value;
  }

  return null;
}

function clampScore(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, numberValue));
}

function invalid(error: string): ValidationResult<never> {
  return {
    ok: false,
    error
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
