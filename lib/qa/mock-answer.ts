import type { AskAnswer } from "@/lib/qa/types";
import type { RetrievalResult } from "@/lib/retrieval/types";

export function generateMockAskAnswer(question: string, retrieval: RetrievalResult): AskAnswer {
  const items = retrieval.rankedItems.map((ranked) => ranked.item);
  const isZh = /[\u3400-\u9fff]/.test(question) || retrieval.normalizedQuery.language === "zh";
  const dataSourceNote = dataSourceLabel(retrieval.dataSource, isZh);

  if (items.length === 0) {
    return {
      mode: "mock",
      question,
      resolved_time_window: retrieval.resolvedTimeWindow,
      data_source: retrieval.dataSource,
      short_answer: isZh
        ? `在当前检索窗口内没有找到足够匹配的雷达条目。${dataSourceNote}`
        : `No sufficiently matching radar items were found in the resolved time window. ${dataSourceNote}`,
      facts: [],
      evidence_backed_inference: [],
      uncertainty: [
        isZh
          ? "这不是对全网最新信息的判断，只反映当前本地雷达数据。"
          : "This is not a comprehensive web-wide latest assessment; it only reflects the current local radar data."
      ],
      citations: [],
      retrieved_item_count: 0,
      freshness_note: freshnessNote(retrieval, isZh),
      model_metadata: {
        provider: "local",
        prompt_version: "mock-answer-v0.2.0",
        api_call_count: 0
      }
    };
  }

  return {
    mode: "mock",
    question,
    resolved_time_window: retrieval.resolvedTimeWindow,
    data_source: retrieval.dataSource,
    short_answer: buildShortAnswer(items, dataSourceNote, isZh),
    facts: items.slice(0, 5).map((item) => factForItem(item, isZh)),
    evidence_backed_inference: buildInferences(items, isZh),
    uncertainty: buildUncertainty(retrieval, isZh),
    citations: retrieval.citations,
    retrieved_item_count: items.length,
    freshness_note: freshnessNote(retrieval, isZh),
    model_metadata: {
      provider: "local",
      prompt_version: "mock-answer-v0.2.0",
      api_call_count: 0
    }
  };
}

function buildShortAnswer(items: RetrievalResult["rankedItems"][number]["item"][], dataSourceNote: string, isZh: boolean) {
  const top = items[0];
  const needsReviewCount = items.filter((item) => item.status === "needs_review").length;

  if (isZh) {
    return `检索到 ${items.length} 条相关雷达证据。最相关的是「${top.title}」（${top.source_name}）。${needsReviewCount > 0 ? `其中 ${needsReviewCount} 条仍需人工确认。` : ""}${dataSourceNote}`;
  }

  return `Found ${items.length} relevant radar item(s). The strongest match is "${top.title}" from ${top.source_name}. ${needsReviewCount > 0 ? `${needsReviewCount} item(s) still need review. ` : ""}${dataSourceNote}`;
}

function factForItem(item: RetrievalResult["rankedItems"][number]["item"], isZh: boolean) {
  const summary = isZh ? item.summary_zh || item.summary_en : item.summary_en || item.summary_zh;
  const status = item.status === "needs_review" ? (isZh ? "待确认" : "needs review") : item.status;
  const timestamp = item.published_at ?? (isZh ? "发布时间未提供" : "publication time unavailable");

  if (isZh) {
    return `「${item.title}」来自 ${item.source_name}，时间 ${timestamp}，状态 ${status}。${summary}`;
  }

  return `"${item.title}" came from ${item.source_name} at ${timestamp} with status ${status}. ${summary}`;
}

function buildInferences(items: RetrievalResult["rankedItems"][number]["item"][], isZh: boolean) {
  const categories = Array.from(new Set(items.flatMap((item) => item.categories))).slice(0, 4);
  const topWhy = items.map((item) => item.why_it_matters).filter(Boolean)[0];
  const inferences = [
    isZh
      ? `这些条目主要集中在 ${categories.join("、") || "未分类"}，说明当前匹配证据更偏向这些主题。`
      : `The matching evidence clusters around ${categories.join(", ") || "uncategorized"} topics.`
  ];

  if (topWhy) {
    inferences.push(isZh ? `可支持的判断：${topWhy}` : `Evidence-backed interpretation: ${topWhy}`);
  }

  return inferences;
}

function buildUncertainty(retrieval: RetrievalResult, isZh: boolean) {
  const uncertainty = [
    isZh
      ? `时间范围为 ${retrieval.resolvedTimeWindow.start} 至 ${retrieval.resolvedTimeWindow.end}。`
      : `The resolved window is ${retrieval.resolvedTimeWindow.start} to ${retrieval.resolvedTimeWindow.end}.`
  ];

  if (retrieval.dataSource === "mock_data") {
    uncertainty.push(isZh ? "当前答案基于合成演示数据，不能代表真实最新动态。" : "This answer is based on synthetic demo data and cannot represent real current events.");
  }

  if (retrieval.dataSource === "supabase_radar_items") {
    uncertainty.push(isZh ? "当前答案基于公开证据库，覆盖范围取决于已入库或快照化的数据。" : "This answer is based on the public evidence store; coverage depends on indexed public data.");
  }

  if (retrieval.dataSource === "local_understanding_output") {
    uncertainty.push(isZh ? "当前答案仅覆盖本地理解输出，不代表全网完整覆盖。" : "This answer only covers local understanding output, not comprehensive web coverage.");
  }

  if (retrieval.rankedItems.some((ranked) => ranked.item.status === "needs_review")) {
    uncertainty.push(isZh ? "部分证据仍处于 needs_review 状态，尚未完全确认。" : "Some evidence is marked needs_review and is not fully confirmed.");
  }

  return uncertainty;
}

function freshnessNote(retrieval: RetrievalResult, isZh: boolean) {
  const latest = retrieval.freshness.latestTimestamp;

  if (!latest) {
    return isZh ? "没有可用的数据新鲜度时间戳。" : "No freshness timestamp is available.";
  }

  if (isZh) {
    return `最新公开内容发布时间为 ${latest}（${retrieval.freshness.latestTimestampSource ?? "unknown"}）。`;
  }

  return `Latest public content publication timestamp is ${latest} (${retrieval.freshness.latestTimestampSource ?? "unknown"}).`;
}

function dataSourceLabel(dataSource: RetrievalResult["dataSource"], isZh: boolean) {
  if (dataSource === "supabase_radar_items") {
    return isZh ? "答案基于公开证据库。" : "The answer is based on the public evidence store.";
  }

  if (dataSource === "mock_data") {
    return isZh ? "答案基于演示数据。" : "The answer is based on demo data.";
  }

  if (dataSource === "local_understanding_output") {
    return isZh ? "答案基于本地理解输出。" : "The answer is based on local understanding output.";
  }

  return isZh ? "当前没有可用数据源。" : "No data source is currently available.";
}
