import { summarizeRadarItem, type DeepSeekJsonResult } from "@/lib/deepseek/provider";
import type {
  StageResult,
  SummaryResult,
  UnderstandingConfig,
  UnderstandingModelInput
} from "@/lib/understanding/types";
import { estimatedTokens, normalizeText, validateSummary } from "@/lib/understanding/validate";

export async function summarizeRawItem(
  modelInput: UnderstandingModelInput,
  config: UnderstandingConfig
): Promise<StageResult<SummaryResult>> {
  const fallback = heuristicSummary(modelInput);

  if (config.mode !== "live") {
    return {
      value: fallback,
      apiCallCount: 0,
      estimatedTokenCount: estimatedTokens(modelInput.text)
    };
  }

  const response = (await summarizeRadarItem(modelInput, {
    mode: "live",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.fastModel,
    promptVersion: config.promptVersion,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries
  })) as DeepSeekJsonResult<SummaryResult>;

  if (!response.ok) {
    return withFallback(fallback, modelInput.text, response, response.error.message);
  }

  const validated = validateSummary(response.data);
  if (!validated.ok) {
    return withFallback(fallback, modelInput.text, response, validated.error);
  }

  return {
    value: validated.value,
    apiCallCount: response.apiCallCount,
    estimatedTokenCount: response.tokenUsage?.total_tokens ?? estimatedTokens(modelInput.text),
    tokenUsage: response.tokenUsage,
    model: response.model
  };
}

export function heuristicSummary(modelInput: UnderstandingModelInput): SummaryResult {
  const rawItem = modelInput.rawItem;
  const title = normalizeText(rawItem.title) || "Untitled item";
  const summaryText = normalizeText(rawItem.summary || rawItem.raw_text);
  const isMetadataLevel = rawItem.metadata?.item_kind === "raw_html_summary" || summaryText.length < 80;
  const evidenceNotes = [
    isMetadataLevel ? "metadata-level evidence only" : "summary derived from raw ingestion text",
    modelInput.truncated ? "input text was truncated before understanding" : ""
  ].filter(Boolean);

  const cleanEvidence = summaryText
    .replace(/^arXiv:\d{4}\.\d+(?:v\d+)?\s+Announce Type:\s*\w+\s+Abstract:\s*/iu, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(?:^|\s)#{1,6}\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const englishEvidence = cleanEvidence
    ? `${cleanEvidence.slice(0, 260).replace(/(?:…|\.{3})$/u, "").trim()}${cleanEvidence.length > 260 ? "…" : ""}`
    : "The available evidence is limited and should be checked against the original source.";
  const chineseEvidence = /[\u3400-\u9fff]/u.test(cleanEvidence) &&
    (cleanEvidence.match(/[\u3400-\u9fff]/gu)?.length ?? 0) >= Math.max(12, Math.floor(cleanEvidence.length * 0.2))
    ? cleanEvidence.slice(0, 220).replace(/(?:…|\.{3})$/u, "").trim()
    : "当前材料主要来自英文标题或摘要，具体方法、数据与结论仍需回到原始来源核对";

  return {
    summary_zh: isMetadataLevel
      ? `公开信息目前只提供“${title}”的标题与页面元数据，更多细节仍需回到原始来源核对。`
      : `公开信息显示，该条目聚焦“${title}”。${chineseEvidence}。`,
    summary_en: isMetadataLevel
      ? `Public information currently provides only the title and page metadata for “${title}”. Review the original source for details.`
      : `Public information on “${title}”: ${englishEvidence}`,
    evidence_notes: evidenceNotes
  };
}

function withFallback(
  fallback: SummaryResult,
  text: string,
  response: DeepSeekJsonResult<SummaryResult>,
  error: string
): StageResult<SummaryResult> {
  return {
    value: fallback,
    apiCallCount: response.apiCallCount,
    estimatedTokenCount: response.tokenUsage?.total_tokens ?? estimatedTokens(text),
    tokenUsage: response.tokenUsage,
    model: response.model,
    error: `summary fallback used: ${error}`
  };
}
