import path from "node:path";

import { getDeepSeekConfig } from "@/lib/deepseek/provider";
import type { UnderstandingConfig, UnderstandingMode } from "@/lib/understanding/types";

export const UNDERSTANDING_ROOT = process.cwd();
export const UNDERSTANDING_DIR = path.join(UNDERSTANDING_ROOT, "data", "understanding");
export const UNDERSTANDING_LATEST_DIR = path.join(UNDERSTANDING_DIR, "latest");
export const UNDERSTANDING_RUNS_DIR = path.join(UNDERSTANDING_DIR, "runs");
export const DEFAULT_UNDERSTANDING_INPUT = path.join(UNDERSTANDING_ROOT, "data", "ingestion", "latest", "raw-items.json");
export const DEFAULT_PROMPT_VERSION = "v0.1.0";

export type UnderstandingConfigInput = {
  inputPath?: string;
  limit?: number;
  mode?: UnderstandingMode;
  maxTextChars?: number;
  promptVersion?: string;
  dryRun?: boolean;
};

export const UNDERSTANDING_LIMITS = {
  defaultLimit: 10,
  maxLimit: 100,
  defaultMaxTextChars: 6000,
  maxTextChars: 20_000,
  timeoutMs: 20_000,
  maxRetries: 2
};

export function buildUnderstandingConfig(input: UnderstandingConfigInput = {}): UnderstandingConfig {
  const deepSeek = getDeepSeekConfig();
  const mode = input.mode ?? "mock";
  const limit = clampInteger(input.limit ?? UNDERSTANDING_LIMITS.defaultLimit, 1, UNDERSTANDING_LIMITS.maxLimit);
  const maxTextChars = clampInteger(
    input.maxTextChars ?? UNDERSTANDING_LIMITS.defaultMaxTextChars,
    200,
    UNDERSTANDING_LIMITS.maxTextChars
  );

  if (mode === "live" && !deepSeek.hasApiKey) {
    throw new Error("Live understanding mode requires DEEPSEEK_API_KEY. Set it locally or run with --mode mock.");
  }

  return {
    mode,
    inputPath: path.resolve(input.inputPath ?? DEFAULT_UNDERSTANDING_INPUT),
    limit,
    maxTextChars,
    promptVersion: input.promptVersion ?? DEFAULT_PROMPT_VERSION,
    dryRun: input.dryRun ?? false,
    baseUrl: deepSeek.baseUrl,
    apiKey: process.env.DEEPSEEK_API_KEY,
    fastModel: deepSeek.fastModel,
    smartModel: deepSeek.smartModel,
    timeoutMs: UNDERSTANDING_LIMITS.timeoutMs,
    maxRetries: UNDERSTANDING_LIMITS.maxRetries,
    latestRadarItemsPath: path.join(UNDERSTANDING_LATEST_DIR, "radar-items.json"),
    latestRunPath: path.join(UNDERSTANDING_LATEST_DIR, "understanding-run.json"),
    runsDir: UNDERSTANDING_RUNS_DIR
  };
}

export function relativePath(filePath: string) {
  return path.relative(UNDERSTANDING_ROOT, filePath).replace(/\\/g, "/");
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}
