import { getAppConfig } from "@/lib/config";
import type { RadarItem } from "@/lib/radar/types";

export type DeepSeekPurpose =
  | "relevance_filtering"
  | "summarization"
  | "tagging"
  | "classification"
  | "scoring"
  | "report_generation"
  | "radar_qa";

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

export type RadarQuestionAnswer = {
  answer: string;
  citations: string[];
  uncertainty: string;
  phase: "phase-2-mock";
};

export function getDeepSeekConfig(): DeepSeekConfig {
  const { deepSeek } = getAppConfig();

  return {
    baseUrl: deepSeek.baseUrl,
    fastModel: deepSeek.fastModel,
    smartModel: deepSeek.smartModel,
    hasApiKey: deepSeek.hasApiKey,
    intendedUse: {
      fast: ["relevance_filtering", "summarization", "tagging", "classification"],
      smart: ["scoring", "report_generation", "radar_qa"]
    }
  };
}

export async function classifyRadarItem(item: RadarItem) {
  return {
    itemId: item.id,
    model: getDeepSeekConfig().fastModel,
    promptVersion: "classify-radar-item-v0",
    labels: item.topics,
    phase: "phase-2-mock" as const
  };
}

export async function summarizeRadarItem(item: RadarItem) {
  return {
    itemId: item.id,
    model: getDeepSeekConfig().fastModel,
    promptVersion: "summarize-radar-item-v0",
    summaryEn: item.summaryEn,
    summaryZh: item.summaryZh,
    phase: "phase-2-mock" as const
  };
}

export async function scoreRadarItem(item: RadarItem) {
  return {
    itemId: item.id,
    model: getDeepSeekConfig().smartModel,
    promptVersion: "score-radar-item-v0",
    credibilityScore: item.credibilityScore,
    noveltyScore: item.noveltyScore,
    importanceScore: item.importanceScore,
    phase: "phase-2-mock" as const
  };
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

export async function answerRadarQuestion(question: string): Promise<RadarQuestionAnswer> {
  return {
    answer:
      "Radar Q&A is not implemented in Phase 2. Future answers will retrieve database evidence first and then use DeepSeek V4 Pro for synthesis.",
    citations: [],
    uncertainty: question
      ? "No retrieval or model generation has been run for this placeholder answer."
      : "No question was provided.",
    phase: "phase-2-mock"
  };
}
