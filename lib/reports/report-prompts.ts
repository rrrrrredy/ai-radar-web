import type { RadarFeed } from "@/lib/radar/feed";
import type { ReportLanguage, ReportPreview, ReportPreviewType } from "@/lib/reports/types";

export const reportPromptVersion = "report-synthesis-v1";

export type ReportSynthesisPromptInput = {
  reportType: ReportPreviewType;
  preview: ReportPreview;
  feed: RadarFeed;
  language: ReportLanguage;
  audience?: string;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export function buildReportSynthesisMessages(input: ReportSynthesisPromptInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You synthesize AI Radar reports from retrieved public radar items only.",
        "Do not invent facts, URLs, companies, model names, dates, or causal claims beyond the provided items.",
        "Use cautious Chinese suitable for AI industry observation unless the requested language is en.",
        "Every factual bullet must cite one or more provided citation ids.",
        "If evidence is thin, say so directly in caveats and missing_evidence.",
        "Return strict JSON only. No markdown fences."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Generate a daily or weekly AI industry report draft.",
        prompt_version: reportPromptVersion,
        output_language: input.language,
        audience: input.audience ?? "AI industry observer",
        required_schema: {
          title: "string",
          one_sentence_summary: "string",
          executive_summary: "string",
          sections: [
            {
              id: "model_product_company_updates | research_open_source | agents_products | business_ecosystem | weak_signals_needs_review",
              title: "string",
              summary: "string",
              bullets: ["string"],
              citations: ["citation id"],
              caveats: ["string"],
              missing_evidence: ["string"]
            }
          ],
          caveats: ["string"],
          missing_evidence: ["string"]
        },
        report_type: input.reportType,
        time_window: input.preview.time_window,
        data_source: input.preview.data_source,
        retrieved_item_count: input.preview.retrieved_item_count,
        usable_item_count: input.preview.usable_item_count,
        report_caveats: input.preview.caveats.filter(
          (caveat) => !caveat.toLowerCase().includes("no live deepseek call")
        ),
        report_missing_evidence: input.preview.missing_evidence,
        citations: input.preview.citations,
        section_evidence: input.preview.sections.map((section) => ({
          id: section.id,
          title: section.title,
          deterministic_summary: section.summary,
          caveats: section.caveats,
          missing_evidence: section.missing_evidence,
          items: section.items.slice(0, 3).map((item) => ({
            id: item.id,
            title: truncate(item.title, 180),
            source_name: item.source_name,
            url: item.url,
            timestamp: item.timestamp,
            summary: truncate(item.summary, 420),
            categories: item.categories,
            tags: item.tags.slice(0, 8),
            status: item.status,
            confidence: item.confidence,
            overall_score: item.overall_score,
            why_it_matters: truncate(item.why_it_matters ?? "", 260),
            evidence_notes: item.evidence_notes.slice(0, 3).map((note) => truncate(note, 220))
          }))
        })),
        feed_caveats: input.feed.caveats
      })
    }
  ];
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}
