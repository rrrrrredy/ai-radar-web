import type { AskLiveModelOutput, AskRequest, GenerationMode } from "@/lib/qa/types";

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: string;
    };

export function validateAskRequest(value: unknown): ValidationResult<Required<Pick<AskRequest, "question" | "generationMode">> & Omit<AskRequest, "question" | "generationMode">> {
  if (!isRecord(value)) {
    return invalid("Request body must be a JSON object.");
  }

  const question = normalizeText(value.question);
  if (!question) {
    return invalid("question is required.");
  }

  if (question.length > 1000) {
    return invalid("question must be 1000 characters or fewer.");
  }

  const generationMode = normalizeGenerationMode(value.generationMode);
  if (!generationMode) {
    return invalid("generationMode must be mock or live.");
  }

  const language = value.language === "zh" || value.language === "en" || value.language === "mixed" ? value.language : undefined;

  return {
    ok: true,
    value: {
      question,
      generationMode,
      language
    }
  };
}

export function validateAskLiveOutput(value: unknown): ValidationResult<AskLiveModelOutput> {
  if (!isRecord(value)) {
    return invalid("Model output must be a JSON object.");
  }

  const short_answer = normalizeText(value.short_answer);
  const facts = stringArray(value.facts).slice(0, 8);
  const evidence_backed_inference = stringArray(value.evidence_backed_inference).slice(0, 6);
  const uncertainty = stringArray(value.uncertainty).slice(0, 6);

  if (!short_answer) {
    return invalid("Model output is missing short_answer.");
  }

  return {
    ok: true,
    value: {
      short_answer,
      facts,
      evidence_backed_inference,
      uncertainty
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

function normalizeGenerationMode(value: unknown): GenerationMode | null {
  if (value === undefined || value === null || value === "") {
    return "live";
  }

  return value === "mock" || value === "live" ? value : null;
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
