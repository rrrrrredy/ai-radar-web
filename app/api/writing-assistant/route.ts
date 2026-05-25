import { NextResponse } from "next/server";

import type { SafeGenerationError } from "@/lib/qa/answer";
import { generateWritingAssistantOutput } from "@/lib/writing-assistant/generate";
import { validateWritingRequest } from "@/lib/writing-assistant/validate";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const validation = validateWritingRequest(body);

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const output = await generateWritingAssistantOutput(validation.value);
    return NextResponse.json(stripModelMetadata(output));
  } catch (error) {
    if (isSafeGenerationError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to generate writing assistance safely." }, { status: 500 });
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
