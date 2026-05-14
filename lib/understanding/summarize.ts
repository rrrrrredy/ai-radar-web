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
  const sourceLabel = rawItem.source_name ? ` from ${rawItem.source_name}` : "";
  const title = normalizeText(rawItem.title) || "Untitled item";
  const summaryText = normalizeText(rawItem.summary || rawItem.raw_text);
  const isMetadataLevel = rawItem.metadata?.item_kind === "raw_html_summary" || summaryText.length < 80;
  const evidenceNotes = [
    isMetadataLevel ? "metadata-level evidence only" : "summary derived from raw ingestion text",
    modelInput.truncated ? "input text was truncated before understanding" : ""
  ].filter(Boolean);

  const shortEvidence = summaryText ? ` Evidence text: ${summaryText.slice(0, 180)}${summaryText.length > 180 ? "..." : ""}` : "";

  return {
    summary_zh: isMetadataLevel
      ? `元数据级条目：${title}。仅基于 Phase 4 抓取到的标题、链接和页面元数据。`
      : `条目摘要：${title}。${summaryText.slice(0, 180)}${summaryText.length > 180 ? "..." : ""}`,
    summary_en: isMetadataLevel
      ? `Metadata-level item${sourceLabel}: ${title}. The available evidence is limited to title, URL, and page metadata.`
      : `Item summary${sourceLabel}: ${title}.${shortEvidence}`,
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
