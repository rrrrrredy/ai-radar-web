import type { RetrievalResult } from "@/lib/retrieval/types";
import type {
  WritingAssistantOutput,
  WritingAssistantRequest,
  WritingCandidateTopic
} from "@/lib/writing-assistant/types";

export function generateMockWritingOutput(
  request: Required<Pick<WritingAssistantRequest, "query" | "generationMode" | "outputType">> & Omit<WritingAssistantRequest, "query" | "generationMode" | "outputType">,
  retrieval: RetrievalResult
): WritingAssistantOutput {
  const isZh = request.language === "zh" || /[\u3400-\u9fff]/.test(request.query);
  const topics = retrieval.rankedItems.slice(0, 5).map((ranked): WritingCandidateTopic => {
    const item = ranked.item;
    const citation = retrieval.citations.find((entry) => entry.id === item.id);
    const summary = isZh ? item.summary_zh || item.summary_en : item.summary_en || item.summary_zh;

    return {
      title: sectionedTitle(item.title, item.categories, isZh),
      neutral_summary: summary,
      why_it_matters: item.why_it_matters || (isZh ? "该条目在当前雷达评分中具备一定写作价值。" : "The item has writing value under the current radar scoring."),
      evidence: [
        isZh
          ? `来源 ${item.source_name}，状态 ${item.status}，时间 ${item.published_at ?? item.collected_at}。`
          : `Source ${item.source_name}, status ${item.status}, timestamp ${item.published_at ?? item.collected_at}.`,
        ...item.evidence_notes.slice(0, 2)
      ],
      caveats: caveatsForItem(item, retrieval.dataSource, isZh),
      suggested_angle: suggestedAngle(item, request.outputType, isZh),
      confidence: item.status === "needs_review" ? Math.min(item.confidence, 0.55) : item.confidence,
      citations: citation ? [citation] : []
    };
  });

  return {
    mode: "mock",
    query: request.query,
    resolved_time_window: retrieval.resolvedTimeWindow,
    data_source: retrieval.dataSource,
    candidate_topics: topics,
    counterpoints: buildCounterpoints(retrieval, isZh),
    missing_evidence: buildMissingEvidence(retrieval, isZh),
    citations: retrieval.citations,
    model_metadata: {
      provider: "local",
      prompt_version: "mock-writing-v0.2.0",
      api_call_count: 0
    }
  };
}

function sectionedTitle(title: string, categories: string[], isZh: boolean) {
  const categoryText = categories.join(", ");
  if (!isZh) {
    return `${title}`;
  }

  if (categories.some((category) => ["model_release", "research", "open_source", "agent"].includes(category))) {
    return `行业重点：${title}`;
  }

  if (categoryText.includes("business") || categoryText.includes("funding")) {
    return `海外/国内：${title}`;
  }

  return title;
}

function caveatsForItem(
  item: RetrievalResult["rankedItems"][number]["item"],
  dataSource: RetrievalResult["dataSource"],
  isZh: boolean
) {
  const caveats = [];

  if (item.status === "needs_review") {
    caveats.push(isZh ? "该条目仍需人工确认，写作时不要表述为已完全验证。" : "This item still needs review; do not present it as fully confirmed.");
  }

  if (dataSource === "mock_data") {
    caveats.push(isZh ? "这是合成演示数据，只适合验证写作流程。" : "This is synthetic demo data and is only suitable for validating the writing workflow.");
  }

  if (item.evidence_notes.length === 0) {
    caveats.push(isZh ? "缺少额外证据说明，需要补充来源交叉验证。" : "No extra evidence notes are available; add corroboration before publishing.");
  }

  return caveats.length > 0 ? caveats : [isZh ? "证据来自当前雷达条目，仍需按发布标准复核。" : "Evidence comes from current radar items and still needs editorial review."];
}

function suggestedAngle(
  item: RetrievalResult["rankedItems"][number]["item"],
  outputType: WritingAssistantRequest["outputType"],
  isZh: boolean
) {
  if (outputType === "outline") {
    return isZh
      ? `以「事实 - 影响 - 未确认问题」组织提纲，避免扩展到未检索到的事实。`
      : "Structure the outline as facts, impact, and unresolved questions without adding unretrieved facts.";
  }

  if (item.categories.includes("agent")) {
    return isZh ? "从 Agent 工作流落地和真实采用证据切入。" : "Use agent workflow adoption and observable evidence as the angle.";
  }

  if (item.categories.includes("model_release")) {
    return isZh ? "从模型发布信号、来源可信度和待验证能力切入。" : "Use release signal, source credibility, and unverified capability claims as the angle.";
  }

  if (item.categories.includes("open_source")) {
    return isZh ? "从开源生态、开发者采用和项目可持续性切入。" : "Use open-source ecosystem, developer adoption, and sustainability as the angle.";
  }

  return isZh ? `围绕「${item.title}」提炼一个证据边界清晰的观察。` : `Build an evidence-bounded observation around "${item.title}".`;
}

function buildCounterpoints(retrieval: RetrievalResult, isZh: boolean) {
  if (retrieval.rankedItems.length === 0) {
    return [
      isZh
        ? "当前没有匹配证据，不能生成可靠选题。"
        : "No matching evidence is available, so reliable writing topics cannot be generated."
    ];
  }

  return [
    isZh
      ? "单条来源不能证明趋势，需要后续交叉来源或官方材料确认。"
      : "A single source does not prove a trend; corroborating sources or official material are still needed.",
    isZh
      ? "评分和新鲜度只能帮助排序，不能替代编辑判断。"
      : "Scores and freshness help ranking but do not replace editorial judgment."
  ];
}

function buildMissingEvidence(retrieval: RetrievalResult, isZh: boolean) {
  const missing = [];

  if (retrieval.dataSource === "mock_data") {
    missing.push(isZh ? "需要真实理解输出或公开证据库数据。" : "Real understanding output or public evidence-store data is needed.");
  }

  if (retrieval.dataSource === "supabase_radar_items" && retrieval.rankedItems.length < 3) {
    missing.push(isZh ? "公开证据库当前可检索条目较少，需要更多可公开证据。" : "The public evidence store currently has few retrievable items; more public evidence is needed.");
  }

  if (retrieval.rankedItems.some((ranked) => ranked.item.status === "needs_review")) {
    missing.push(isZh ? "needs_review 条目需要人工确认。" : "needs_review items need human confirmation.");
  }

  if (retrieval.rankedItems.length < 3) {
    missing.push(isZh ? "匹配条目较少，难以支撑完整行业观察。" : "Too few matching items are available to support a full industry observation.");
  }

  return missing.length > 0 ? missing : [isZh ? "仍建议补充二级来源和原始公告。" : "Additional secondary sources and original announcements are still recommended."];
}
