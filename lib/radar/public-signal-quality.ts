import type { RadarCategory } from "@/lib/understanding/types";

type QualityInput = {
  title: string;
  url: string;
  source_name?: string;
  summary_zh?: string;
  summary_en?: string;
  categories?: RadarCategory[];
  tags?: string[];
  evidence_notes?: string[];
};

export type PublicSignalQuality = {
  score: number;
  penalty: number;
  isLowEventSignal: boolean;
  reasons: string[];
};

const genericExactTitles = new Set([
  "research",
  "news",
  "newsroom",
  "blog",
  "overview",
  "documentation",
  "docs",
  "home",
  "homepage",
  "journal of machine learning research",
  "release notes",
  "releases",
  "changelog",
  "更新日志",
  "版本说明",
  "출시 노트"
]);

const genericTitlePatterns = [
  /\brepository metadata\b/i,
  /\bwelcome to .*\bdocs\b/i,
  /\bwelcome to .*api docs\b/i,
  /\bapi docs\b/i,
  /\bgeneratecontent api\b/i,
  /\bchangelog\b/i,
  /\brelease notes\s*(?:\||$)/i,
  /출시 노트/i,
  /更新日志|版本说明/,
  /\bnews\s*[-|]\s*google deepmind\b/i,
  /^(research|newsroom|news|overview|documentation|docs)$/i
];

const listingSummaryPatterns = [
  /页面|主页|中心|概述|链接|列表|展示了|提供.*链接/,
  /homepage|landing page|overview|lists?|links?|directory|news hub|research page|documentation page/i,
  /technical forum|free online access|published papers are available/i,
  /成立于\d{4}年|技术论坛|定期发布|已发表论文|在线免费获取|期刊首页|杂志首页/,
  /未完全抓取|无法提供具体更新细节/
];

const genericUrlPatterns = [
  /\/research\/?$/i,
  /\/newsroom\/?$/i,
  /\/news\/?$/i,
  /\/blog\/?$/i,
  /\/docs\/?(overview)?\/?$/i,
  /\/docs\/overview\/?$/i,
  /^https?:\/\/(?:www\.)?jmlr\.org\/?$/i,
  /github\.com\/[^/]+\/[^/]+\/?$/i
];

const eventCuePatterns = [
  /\b(release|released|launch|launched|partner|partnership|acquire|funding|benchmark|paper|model|agent)\b/i,
  /\b(v?\d+\.\d+(?:\.\d+)?|b\d{4,}|rc\d+)\b/i,
  /\/releases\/tag\//i,
  /\/abs\/\d/i,
  /发布|推出|上线|合作|融资|收购|开源|模型|基准|论文|智能体/
];

export function assessPublicSignalQuality(item: QualityInput): PublicSignalQuality {
  const title = clean(item.title);
  const titleLower = title.toLowerCase();
  const url = clean(item.url).toLowerCase();
  const summary = clean(`${item.summary_zh ?? ""} ${item.summary_en ?? ""}`);
  const summaryLower = summary.toLowerCase();
  const tags = (item.tags ?? []).join(" ").toLowerCase();
  const notes = (item.evidence_notes ?? []).join(" ").toLowerCase();
  const reasons: string[] = [];
  let penalty = 0;
  let hardLowSignal = false;

  if (genericExactTitles.has(titleLower)) {
    penalty += 0.5;
    reasons.push("泛标题");
  }

  if (genericTitlePatterns.some((pattern) => pattern.test(title))) {
    penalty += 0.35;
    reasons.push("标题像目录页或元数据页");
  }

  if (/\bwelcome to .*api docs\b/i.test(title) || /\/docs\/overview\/?$/i.test(url)) {
    hardLowSignal = true;
    reasons.push("文档入口页");
  }

  if (/(\brelease notes\b|\bchangelog\b|출시 노트|更新日志|版本说明)/i.test(title)) {
    penalty += 0.3;
    reasons.push("更新日志目录页");
  }

  if (genericUrlPatterns.some((pattern) => pattern.test(url))) {
    penalty += 0.3;
    reasons.push("URL 像首页、目录页或仓库首页");
  }

  if (listingSummaryPatterns.some((pattern) => pattern.test(summary))) {
    penalty += 0.25;
    reasons.push("摘要像页面说明而不是事件");
  }

  if (titleLower === "journal of machine learning research" || /^https?:\/\/(?:www\.)?jmlr\.org\/?$/i.test(url)) {
    hardLowSignal = true;
    reasons.push("期刊首页而非单篇事件");
  }

  if (titleLower.includes("repository metadata") || summary.includes("仓库拥有") || summaryLower.includes("repository metadata")) {
    penalty += 0.35;
    reasons.push("仓库元数据");
  }

  if (notes.includes("metadata-level") || tags.includes("homepage") || tags.includes("documentation")) {
    penalty += 0.15;
    reasons.push("证据粒度偏元数据");
  }

  const hasEventCue = eventCuePatterns.some((pattern) => pattern.test(`${title} ${url} ${summary}`));
  if (hasEventCue) {
    penalty -= 0.2;
  }

  const categoryBoost =
    item.categories?.some((category) =>
      ["model_release", "product_update", "benchmark", "agent", "business", "funding", "safety", "regulation"].includes(category)
    ) ?? false;
  if (categoryBoost && hasEventCue) {
    penalty -= 0.1;
  }

  const normalizedPenalty = hardLowSignal ? Math.max(0.6, clamp(penalty)) : clamp(penalty);

  return {
    isLowEventSignal: normalizedPenalty >= 0.45,
    penalty: normalizedPenalty,
    reasons: Array.from(new Set(reasons)),
    score: Number((1 - normalizedPenalty).toFixed(3))
  };
}

export function publicSignalAdjustedScore(baseScore: number, item: QualityInput) {
  const quality = assessPublicSignalQuality(item);
  return Math.max(0, baseScore - quality.penalty * 0.45);
}

function clean(value: string) {
  return value.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
