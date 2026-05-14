import {
  RADAR_CATEGORIES,
  type RadarCategory
} from "@/lib/understanding/types";
import type {
  NormalizedQuery,
  RetrievalIntent,
  RetrievalLanguage,
  RetrievalOutputStyle
} from "@/lib/retrieval/types";

const categoryPatterns: Array<{ category: RadarCategory; patterns: RegExp[] }> = [
  { category: "model_release", patterns: [/model/i, /模型/, /发布/, /release/i] },
  { category: "product_update", patterns: [/product/i, /产品/, /更新/, /feature/i] },
  { category: "agent", patterns: [/agent/i, /代理/, /智能体/] },
  { category: "research", patterns: [/research/i, /paper/i, /论文/, /研究/] },
  { category: "open_source", patterns: [/open[-\s]?source/i, /github/i, /开源/] },
  { category: "infrastructure", patterns: [/infra/i, /chip/i, /compute/i, /算力/, /基础设施/, /芯片/] },
  { category: "funding", patterns: [/funding/i, /投资/, /融资/] },
  { category: "business", patterns: [/business/i, /商业/, /营收/, /公司/] },
  { category: "regulation", patterns: [/regulation/i, /policy/i, /监管/, /政策/] },
  { category: "safety", patterns: [/safety/i, /安全/, /对齐/] },
  { category: "benchmark", patterns: [/benchmark/i, /评测/, /基准/] },
  { category: "media_interview", patterns: [/interview/i, /podcast/i, /采访/, /播客/] },
  { category: "opinion", patterns: [/opinion/i, /观点/, /评论/] }
];

const knownEntities = [
  "OpenAI",
  "Anthropic",
  "Google",
  "DeepMind",
  "Meta",
  "Microsoft",
  "NVIDIA",
  "DeepSeek",
  "Qwen",
  "Alibaba",
  "ByteDance",
  "Claude",
  "Gemini",
  "Llama",
  "GPT"
];

const timePhrasePatterns = [
  "过去24小时",
  "最近24小时",
  "今天",
  "最近一周",
  "本周",
  "上周",
  "最近",
  "last 24 hours",
  "today",
  "this week",
  "last week",
  "recent"
];

export function normalizeQuery(rawQuery: string): NormalizedQuery {
  const raw_query = rawQuery.trim();
  const lowered = raw_query.toLowerCase();
  const language = detectLanguage(raw_query);
  const intent = detectIntent(raw_query);
  const category_hints = detectCategories(raw_query);
  const entity_hints = detectEntities(raw_query);
  const time_phrase_hints = timePhrasePatterns.filter((phrase) => lowered.includes(phrase.toLowerCase()));
  const requested_output_style = detectOutputStyle(raw_query);

  return {
    raw_query,
    language,
    intent,
    entity_hints,
    category_hints,
    time_phrase_hints,
    requested_output_style,
    keywords: extractKeywords(raw_query)
  };
}

function detectLanguage(value: string): RetrievalLanguage {
  const hasChinese = /[\u3400-\u9fff]/.test(value);
  const hasLatin = /[a-z]/i.test(value);

  if (hasChinese && hasLatin) {
    return "mixed";
  }

  if (hasChinese) {
    return "zh";
  }

  if (hasLatin) {
    return "en";
  }

  return "unknown";
}

function detectIntent(value: string): RetrievalIntent {
  if (/写|选题|提纲|角度|文章|观察|outline|angle|write|draft/i.test(value)) {
    return "writing_assistant";
  }

  if (/报告|周报|日报|report|brief/i.test(value)) {
    return "report_seed";
  }

  if (/[?？]|谁|什么|哪些|如何|why|what|which|who|how/i.test(value)) {
    return "qa";
  }

  return "unknown";
}

function detectCategories(value: string): RadarCategory[] {
  const categories = categoryPatterns
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(value)))
    .map((entry) => entry.category);

  return Array.from(new Set(categories)).filter((category) => RADAR_CATEGORIES.includes(category));
}

function detectEntities(value: string) {
  const hints = knownEntities.filter((entity) => new RegExp(`\\b${escapeRegExp(entity)}\\b`, "i").test(value));
  const latinEntities = value.match(/\b[A-Z][A-Za-z0-9._-]{1,24}\b/g) ?? [];
  const additional = latinEntities.filter((token) => !/^(AI|API|JSON|HTTP|URL)$/i.test(token));

  return Array.from(new Set([...hints, ...additional])).slice(0, 8);
}

function detectOutputStyle(value: string): RetrievalOutputStyle {
  if (/提纲|outline/i.test(value)) {
    return "outline";
  }

  if (/选题|候选|topics?|list|列表/i.test(value)) {
    return "topic_list";
  }

  if (/详细|展开|detailed|long/i.test(value)) {
    return "detailed";
  }

  if (/简短|简洁|brief|concise/i.test(value)) {
    return "concise";
  }

  return "unknown";
}

function extractKeywords(value: string) {
  const normalized = value
    .replace(/[?？,，.。!！:：;；()[\]{}"'“”‘’]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !isStopWord(token));

  const chineseTokens = value.match(/[\u3400-\u9fff]{2,}/g) ?? [];

  return Array.from(new Set([...normalized, ...chineseTokens])).slice(0, 24);
}

function isStopWord(value: string) {
  const lowered = value.toLowerCase();
  return new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "for",
    "with",
    "recent",
    "today",
    "this",
    "that",
    "who",
    "what",
    "which",
    "how",
    "why",
    "帮我",
    "哪些",
    "什么",
    "最近",
    "今天"
  ]).has(lowered);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
