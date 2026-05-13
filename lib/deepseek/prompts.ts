export const deepSeekPromptVersions = {
  classifyRadarItem: "classify-radar-item-v0",
  summarizeRadarItem: "summarize-radar-item-v0",
  scoreRadarItem: "score-radar-item-v0",
  generateDailyBrief: "generate-daily-brief-v0",
  answerRadarQuestion: "answer-radar-question-v0"
} as const;

export const radarSystemPromptBoundary = [
  "Use public information only.",
  "Separate facts, evidence-backed inference, and speculation.",
  "Prefer primary sources and official artifacts.",
  "Cite source URLs and timestamps when available.",
  "State uncertainty instead of inventing missing evidence."
];
