import { getDeepSeekConfig } from "@/lib/deepseek/provider";
import type { RadarFeed } from "@/lib/radar/feed";
import { generateReportPreview } from "@/lib/reports/generate-report-preview";
import {
  evaluateReportEvidenceFreshness,
  qualityGateCaveats,
  reportQualityGateFields,
  reportQualityGateFromPreview
} from "@/lib/reports/quality-gates";
import { buildReportSynthesisMessages, reportPromptVersion } from "@/lib/reports/report-prompts";
import type {
  GeneratedReportDraft,
  GeneratedReportEvidenceItem,
  GeneratedReportSection,
  GeneratedReportSectionId,
  ReportLanguage,
  ReportPreview,
  ReportPreviewType,
  SafeReportModelMetadata
} from "@/lib/reports/types";

export type GenerateReportDraftOptions = {
  live?: boolean;
  language?: ReportLanguage;
  audience?: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: SafeReportModelMetadata["token_usage"];
  error?: {
    message?: string;
  };
};

type LiveReportModelOutput = {
  title?: unknown;
  one_sentence_summary?: unknown;
  executive_summary?: unknown;
  sections?: unknown;
  caveats?: unknown;
  missing_evidence?: unknown;
};

const sectionIds: GeneratedReportSectionId[] = [
  "model_product_company_updates",
  "research_open_source",
  "agents_products",
  "business_ecosystem",
  "weak_signals_needs_review"
];

const sectionTitles: Record<GeneratedReportSectionId, string> = {
  agents_products: "Agents / products",
  business_ecosystem: "Business / ecosystem",
  model_product_company_updates: "Model / product / company updates",
  research_open_source: "Research / open-source",
  weak_signals_needs_review: "Weak signals / needs_review"
};

export async function generateReportDraft(
  feed: RadarFeed,
  reportType: ReportPreviewType,
  options: GenerateReportDraftOptions = {}
): Promise<GeneratedReportDraft> {
  const language = options.language ?? "zh";
  const preview = generateReportPreview(feed, reportType);

  if (!options.live) {
    return buildDeterministicReportDraft(preview, language, options.audience);
  }

  const config = getDeepSeekConfig();
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

  if (!config.hasApiKey || !apiKey) {
    const fallback = buildDeterministicReportDraft(preview, language, options.audience);
    return {
      ...fallback,
      caveats: [
        ...fallback.caveats,
        "Live DeepSeek synthesis was requested, but no DeepSeek API key was available to this process."
      ],
      model_metadata: {
        ...fallback.model_metadata,
        error: "DeepSeek API key missing.",
        live_requested: true
      },
      markdown: formatMarkdownReport({
        ...fallback,
        caveats: [
          ...fallback.caveats,
          "Live DeepSeek synthesis was requested, but no DeepSeek API key was available to this process."
        ],
        model_metadata: {
          ...fallback.model_metadata,
          error: "DeepSeek API key missing.",
          live_requested: true
        }
      })
    };
  }

  const messages = buildReportSynthesisMessages({
    audience: options.audience,
    feed,
    language,
    preview,
    reportType
  });

  let apiCallCount = 0;
  let lastError = "DeepSeek request failed.";
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      apiCallCount += 1;
      const response = await fetch(completionUrl(config.baseUrl), {
        body: JSON.stringify({
          messages,
          model: config.smartModel,
          response_format: {
            type: "json_object"
          },
          temperature: 0.1
        }),
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        method: "POST",
        signal: AbortSignal.timeout(120_000)
      });
      const body = (await response.json().catch(() => ({}))) as ChatCompletionResponse;

      if (!response.ok) {
        lastError = body.error?.message ?? `DeepSeek HTTP ${response.status}`;
        if (attempt === 0 && isRetryableStatus(response.status)) {
          await delay(500);
          continue;
        }

        return buildLiveFallback(preview, language, options.audience, config.smartModel, apiCallCount, lastError);
      }

      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        lastError = "DeepSeek response did not include message content.";
        if (attempt === 0) {
          await delay(500);
          continue;
        }

        return buildLiveFallback(preview, language, options.audience, config.smartModel, apiCallCount, lastError);
      }

      const parsed = parseJsonContent<LiveReportModelOutput>(content);
      const draft = normalizeLiveReport(parsed, preview, language, options.audience, {
        api_call_count: apiCallCount,
        live_requested: true,
        mode: "live_deepseek",
        model: config.smartModel,
        prompt_version: reportPromptVersion,
        provider: "deepseek",
        token_usage: body.usage
      });

      return {
        ...draft,
        markdown: formatMarkdownReport(draft)
      };
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return buildLiveFallback(
      preview,
      language,
      options.audience,
      config.smartModel,
      Math.max(apiCallCount, 1),
      lastError
    );
  }

  return buildLiveFallback(preview, language, options.audience, config.smartModel, apiCallCount, lastError);
}

export function buildDeterministicReportDraft(
  preview: ReportPreview,
  language: ReportLanguage = "zh",
  audience?: string
): GeneratedReportDraft {
  const generatedAt = new Date();
  const qualityGate = reportQualityGateFromPreview(preview, generatedAt);
  const sections = preview.sections.map((section): GeneratedReportSection => ({
    caveats: section.caveats,
    citations: section.items.map((item) => item.id).filter((id) => citationIdSet(preview).has(id)),
    id: section.id,
    missing_evidence: section.missing_evidence,
    summary: section.summary,
    title: section.title,
    bullets:
      section.items.length > 0
        ? section.items.slice(0, 4).map((item) => {
            const timestamp = item.timestamp ? ` (${formatShortDate(item.timestamp)})` : "";
            return `${item.title}${timestamp}: ${item.summary}`;
          })
        : ["No usable radar evidence currently supports this section."]
  }));
  const draft: GeneratedReportDraft = {
    audience,
    caveats: dedupe([...preview.caveats, ...qualityGateCaveats(qualityGate)]),
    citations: preview.citations,
    data_source: preview.data_source,
    executive_summary: deterministicExecutiveSummary(preview),
    evidence_items: collectEvidenceItems(preview),
    generated_at: generatedAt.toISOString(),
    language,
    missing_evidence: preview.missing_evidence,
    mode: "deterministic_preview",
    model_metadata: {
      api_call_count: 0,
      live_requested: false,
      mode: "deterministic_preview",
      prompt_version: "deterministic-report-preview-v1",
      provider: "deterministic"
    },
    one_sentence_summary: preview.summary,
    report_type: preview.report_type,
    retrieved_item_count: preview.retrieved_item_count,
    sections,
    source_item_ids: collectSourceItemIds(preview),
    status: qualityGate.passed ? "draft" : "needs_review",
    time_window: preview.time_window,
    title: preview.title,
    ...reportQualityGateFields(qualityGate),
    markdown: ""
  };

  return {
    ...draft,
    markdown: formatMarkdownReport(draft)
  };
}

export function formatMarkdownReport(report: GeneratedReportDraft): string {
  const evidenceFreshness = evaluateReportEvidenceFreshness(
    report.report_type,
    report.time_window.end,
    report.evidence_items.map((item) => item.timestamp),
    report.generated_at
  );
  const lines = [
    `# ${report.title}`,
    "",
    `- Type: ${report.report_type}`,
    `- Status: ${report.status}`,
    `- Data source: ${report.data_source}`,
    `- Time window: ${report.time_window.start} to ${report.time_window.end}`,
    `- Generated at: ${report.generated_at}`,
    `- 证据窗口新鲜度: ${evidenceFreshness.passed ? "通过" : "未通过"}`,
    `- 最新可引用证据: ${evidenceFreshness.latestEvidenceAt ?? "无法验证"}`,
    `- 新鲜度上限: ${evidenceFreshness.maxAgeHours} 小时`,
    `- Quality gate: ${report.quality_gate_passed ? "passed" : "needs_more_data"}`,
    `- Usable items: ${report.usable_item_count}`,
    `- Citations: ${report.citation_count}`,
    `- Distinct sources: ${report.distinct_source_count}`,
    `- Categories: ${report.category_count}`,
    "",
    "## One-sentence summary",
    "",
    report.one_sentence_summary,
    "",
    "## Executive summary",
    "",
    report.executive_summary,
    "",
    "## Sections"
  ];

  for (const section of report.sections) {
    lines.push("", `### ${section.title}`, "", section.summary);
    for (const bullet of section.bullets) {
      lines.push(`- ${bullet}`);
    }
    if (section.citations.length > 0) {
      lines.push("", `Citations: ${section.citations.join(", ")}`);
    }
    if (section.caveats.length > 0) {
      lines.push("", "Caveats:");
      for (const caveat of section.caveats) {
        lines.push(`- ${caveat}`);
      }
    }
    if (section.missing_evidence.length > 0) {
      lines.push("", "Missing evidence:");
      for (const item of section.missing_evidence) {
        lines.push(`- ${item}`);
      }
    }
  }

  lines.push("", "## Caveats");
  for (const caveat of report.caveats.length > 0 ? report.caveats : ["None recorded."]) {
    lines.push(`- ${caveat}`);
  }

  lines.push("", "## Missing evidence");
  for (const item of report.missing_evidence.length > 0 ? report.missing_evidence : ["None recorded."]) {
    lines.push(`- ${item}`);
  }

  lines.push("", "## Quality gate");
  if (report.quality_gate_passed) {
    lines.push("- Passed.");
  } else {
    for (const reason of report.quality_gate_reasons.length > 0 ? report.quality_gate_reasons : ["Needs more data."]) {
      lines.push(`- ${reason}`);
    }
  }

  lines.push("", "## Citations");
  for (const citation of report.citations) {
    lines.push(`- [${citation.id}] ${citation.title} - ${citation.source_name} - ${citation.url}`);
  }

  return `${lines.join("\n")}\n`;
}

function normalizeLiveReport(
  value: LiveReportModelOutput,
  preview: ReportPreview,
  language: ReportLanguage,
  audience: string | undefined,
  modelMetadata: SafeReportModelMetadata
): GeneratedReportDraft {
  const validCitationIds = citationIdSet(preview);
  const generatedAt = new Date();
  const qualityGate = reportQualityGateFromPreview(preview, generatedAt);
  const normalizedSections = normalizeLiveSections(value.sections, preview, validCitationIds);
  const caveats = liveCompatibleCaveats(dedupe([
    ...stringArray(value.caveats),
    ...preview.caveats,
    ...qualityGateCaveats(qualityGate)
  ]));
  const missingEvidence = dedupe([...stringArray(value.missing_evidence), ...preview.missing_evidence]);

  return {
    audience,
    caveats,
    citations: preview.citations,
    data_source: preview.data_source,
    executive_summary: text(value.executive_summary) || deterministicExecutiveSummary(preview),
    evidence_items: collectEvidenceItems(preview),
    generated_at: generatedAt.toISOString(),
    language,
    missing_evidence: missingEvidence,
    mode: "live_deepseek",
    model_metadata: modelMetadata,
    one_sentence_summary: text(value.one_sentence_summary) || preview.summary,
    report_type: preview.report_type,
    retrieved_item_count: preview.retrieved_item_count,
    sections: normalizedSections,
    source_item_ids: collectSourceItemIds(preview),
    status: qualityGate.passed ? "draft" : "needs_review",
    time_window: preview.time_window,
    title: text(value.title) || preview.title,
    ...reportQualityGateFields(qualityGate),
    markdown: ""
  };
}

function normalizeLiveSections(
  value: unknown,
  preview: ReportPreview,
  validCitationIds: Set<string>
): GeneratedReportSection[] {
  const byId = new Map(preview.sections.map((section) => [section.id, section]));
  const rows = Array.isArray(value) ? value : [];
  const rowsById = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }
    const id = text(row.id);
    if (sectionIds.includes(id as GeneratedReportSectionId)) {
      rowsById.set(id, row);
    }
  }

  return sectionIds.map((id) => {
    const modelRow = rowsById.get(id);
    const previewSection = byId.get(id);
    const citations = stringArray(modelRow?.citations).filter((citationId) => validCitationIds.has(citationId));

    return {
      bullets: stringArray(modelRow?.bullets).slice(0, 6),
      caveats: dedupe([...stringArray(modelRow?.caveats), ...(previewSection?.caveats ?? [])]),
      citations,
      id,
      missing_evidence: dedupe([
        ...stringArray(modelRow?.missing_evidence),
        ...(previewSection?.missing_evidence ?? [])
      ]),
      summary: text(modelRow?.summary) || previewSection?.summary || "No retrieved radar evidence supports this section.",
      title: text(modelRow?.title) || previewSection?.title || sectionTitles[id]
    };
  });
}

function buildLiveFallback(
  preview: ReportPreview,
  language: ReportLanguage,
  audience: string | undefined,
  model: string,
  apiCallCount: number,
  error: string
) {
  const fallback = buildDeterministicReportDraft(preview, language, audience);
  const caveats = [
    ...liveCompatibleCaveats(fallback.caveats),
    "Live DeepSeek synthesis failed; deterministic report draft is shown instead."
  ];
  const draft: GeneratedReportDraft = {
    ...fallback,
    caveats,
    model_metadata: {
      api_call_count: apiCallCount,
      error: sanitizeProviderErrorMessage(error),
      live_requested: true,
      mode: "deterministic_preview",
      model,
      prompt_version: reportPromptVersion,
      provider: "deepseek"
    }
  };

  return {
    ...draft,
    markdown: formatMarkdownReport(draft)
  };
}

function deterministicExecutiveSummary(preview: ReportPreview) {
  const sectionSummaries = preview.sections
    .filter((section) => section.items.length > 0)
    .slice(0, 3)
    .map((section) => `${section.title}: ${section.summary}`);
  const base = [
    `本报告草稿基于 ${preview.usable_item_count} 条可用雷达条目和 ${preview.citations.length} 条引用生成。`,
    preview.summary
  ];

  if (sectionSummaries.length > 0) {
    base.push(...sectionSummaries);
  }

  return base.join(" ");
}

function liveCompatibleCaveats(caveats: string[]) {
  return caveats.filter((caveat) => {
    const normalized = caveat.toLowerCase();
    return !(
      normalized.includes("no live deepseek call") ||
      normalized.includes("no live model") ||
      caveat.includes("未调用任何实时") ||
      caveat.includes("未调用实时") ||
      caveat.includes("没有调用实时")
    );
  });
}

function collectSourceItemIds(preview: ReportPreview) {
  const ids = new Set<string>();
  const items = preview.evidence_items;

  for (const item of items) {
    const id = item.database_id ?? item.id;
    if (isUuid(id)) {
      ids.add(id);
    }
  }

  return Array.from(ids);
}

function collectEvidenceItems(preview: ReportPreview): GeneratedReportEvidenceItem[] {
  const items = preview.evidence_items;
  const byId = new Map<string, GeneratedReportEvidenceItem>();

  for (const item of items) {
    if (byId.has(item.id)) continue;
    byId.set(item.id, {
      categories: [...item.categories],
      database_id: item.database_id,
      id: item.id,
      source_name: item.source_name,
      status: item.status,
      timestamp: item.timestamp
    });
  }

  return [...byId.values()];
}

function citationIdSet(preview: ReportPreview) {
  return new Set(preview.citations.map((citation) => citation.id));
}

function parseJsonContent<T>(content: string): T {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced?.[1] ?? content).trim()) as T;
}

function completionUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(text).filter(Boolean))).slice(0, 24);
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 4000) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function formatShortDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeProviderErrorMessage(message: string) {
  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(DEEPSEEK_API_KEY\s*=\s*)[^\s]+/gi, "$1[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 500);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
