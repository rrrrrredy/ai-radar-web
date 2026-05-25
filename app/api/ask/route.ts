import { NextResponse } from "next/server";

import { answerRadarQuestion, type SafeGenerationError } from "@/lib/qa/answer";
import { validateAskRequest } from "@/lib/qa/validate";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const validation = validateAskRequest(body);

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const answer = await answerRadarQuestion(validation.value);
    return NextResponse.json(stripModelMetadata(answer));
  } catch (error) {
    if (isSafeGenerationError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to answer the question safely." }, { status: 500 });
  }
}

function stripModelMetadata<T extends { model_metadata?: unknown }>(value: T) {
  const output = { ...value };
  delete output.model_metadata;
  return output;
}

function isSafeGenerationError(error: unknown): error is SafeGenerationError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    typeof (error as { message: unknown }).message === "string"
  );
}
