import type { RetrievalRadarItem } from "@/lib/retrieval/types";
import { publicInternetHttpUrl } from "@/lib/public-url";
import type { RadarCategory } from "@/lib/understanding/types";

export const DEFAULT_LEARNPROMPT_AI_NEWS_RADAR_BASE_URL =
  "https://learnprompt.github.io/ai-news-radar/data";

export type LearnPromptFreshness = {
  generatedAt: string | null;
  isStale: boolean;
  ageHours: number | null;
  maxAgeHours: number;
};

export type LearnPromptSignalItem = {
  id: string;
  external_id: string;
  title: string;
  title_zh?: string;
  title_en?: string;
  url: string;
  source: string;
  site_id: string;
  site_name: string;
  published_at?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  ai_score: number;
  ai_label: string;
  ai_relevance_reason?: string;
  ai_signals: string[];
  ai_noise: string[];
  source_tier: string;
  source_tier_label?: string;
  source_tier_rank: number;
  provenance: LearnPromptSignalProvenance;
};

export type LearnPromptSignalProvenance = {
  provider: "learnprompt";
  review_status: "external_unreviewed";
  usage: "source_repair_only";
};

export type LearnPromptStory = {
  story_id: string;
  title: string;
  url: string;
  source?: string;
  source_name?: string;
  source_count: number;
  importance_score: number;
  importance_label?: string;
  category?: string;
  reasons: string[];
  latest_at?: string;
  items: Array<{
    id?: string;
    title?: string;
    url?: string;
    source?: string;
    source_name?: string;
    site_id?: string;
    published_at?: string;
  }>;
};

export type LearnPromptSourceStatus = {
  site_id: string;
  site_name: string;
  ok: boolean;
  item_count: number;
  duration_ms?: number;
  error?: string | null;
};

export type LearnPromptLatestSnapshot = {
  generated_at: string | null;
  freshness: LearnPromptFreshness;
  total_items: number;
  source_count: number;
  items: LearnPromptSignalItem[];
};

export type LearnPromptStoriesSnapshot = {
  generated_at: string | null;
  freshness: LearnPromptFreshness;
  total_stories: number;
  stories: LearnPromptStory[];
};

export type LearnPromptDailyBriefSnapshot = {
  generated_at: string | null;
  freshness: LearnPromptFreshness;
  total_items: number;
  items: LearnPromptStory[];
};

export type LearnPromptSourceStatusSnapshot = {
  generated_at: string | null;
  freshness: LearnPromptFreshness;
  successful_sites: number;
  failed_sites: number;
  zero_item_sites: number;
  sites: LearnPromptSourceStatus[];
};

export type LearnPromptDiffCandidate = {
  item: LearnPromptSignalItem;
  mappedItem: RetrievalRadarItem;
  provenance: LearnPromptSignalProvenance;
  reason: string;
  priority: number;
};

type JsonRecord = Record<string, unknown>;

const latestMaxAgeHours = 36;
const derivedMaxAgeHours = 48;
const defaultRequestTimeoutMs = 8000;
const futureTimestampToleranceHours = 10 / 60;
const maxJsonPayloadBytes = 8_000_000;
const learnPromptProvenance: LearnPromptSignalProvenance = {
  provider: "learnprompt",
  review_status: "external_unreviewed",
  usage: "source_repair_only"
};

export async function fetchLearnPromptLatestSnapshot(
  options: { baseUrl?: string; now?: Date; timeoutMs?: number } = {}
): Promise<LearnPromptLatestSnapshot> {
  const payload = await fetchLearnPromptJson(options.baseUrl, "latest-24h.json", options.timeoutMs);
  return normalizeLearnPromptLatestPayload(payload, options.now);
}

export async function fetchLearnPromptStoriesSnapshot(
  options: { baseUrl?: string; now?: Date; timeoutMs?: number } = {}
): Promise<LearnPromptStoriesSnapshot> {
  const payload = await fetchLearnPromptJson(options.baseUrl, "stories-merged.json", options.timeoutMs);
  return normalizeLearnPromptStoriesPayload(payload, options.now);
}

export async function fetchLearnPromptDailyBriefSnapshot(
  options: { baseUrl?: string; now?: Date; timeoutMs?: number } = {}
): Promise<LearnPromptDailyBriefSnapshot> {
  const payload = await fetchLearnPromptJson(options.baseUrl, "daily-brief.json", options.timeoutMs);
  return normalizeLearnPromptDailyBriefPayload(payload, options.now);
}

export async function fetchLearnPromptSourceStatusSnapshot(
  options: { baseUrl?: string; now?: Date; timeoutMs?: number } = {}
): Promise<LearnPromptSourceStatusSnapshot> {
  const payload = await fetchLearnPromptJson(options.baseUrl, "source-status.json", options.timeoutMs);
  return normalizeLearnPromptSourceStatusPayload(payload, options.now);
}

export function normalizeLearnPromptLatestPayload(
  value: unknown,
  now: Date = new Date()
): LearnPromptLatestSnapshot {
  const payload = record(value);
  const rawItems = array(payload.items_ai).length > 0 ? array(payload.items_ai) : array(payload.items);
  const items = rawItems
    .map(normalizeLearnPromptSignalItem)
    .filter((item): item is LearnPromptSignalItem => Boolean(item));

  return {
    freshness: freshness(payload.generated_at, latestMaxAgeHours, now),
    generated_at: optionalText(payload.generated_at) ?? null,
    items,
    source_count: integer(payload.source_count),
    total_items: integer(payload.total_items, items.length)
  };
}

export function normalizeLearnPromptStoriesPayload(
  value: unknown,
  now: Date = new Date()
): LearnPromptStoriesSnapshot {
  const payload = record(value);
  const stories = array(payload.stories)
    .map(normalizeLearnPromptStory)
    .filter((story): story is LearnPromptStory => Boolean(story));

  return {
    freshness: freshness(payload.generated_at, derivedMaxAgeHours, now),
    generated_at: optionalText(payload.generated_at) ?? null,
    stories,
    total_stories: integer(payload.total_stories, stories.length)
  };
}

export function normalizeLearnPromptDailyBriefPayload(
  value: unknown,
  now: Date = new Date()
): LearnPromptDailyBriefSnapshot {
  const payload = record(value);
  const items = array(payload.items)
    .map(normalizeLearnPromptStory)
    .filter((story): story is LearnPromptStory => Boolean(story));

  return {
    freshness: freshness(payload.generated_at, derivedMaxAgeHours, now),
    generated_at: optionalText(payload.generated_at) ?? null,
    items,
    total_items: integer(payload.total_items, items.length)
  };
}

export function normalizeLearnPromptSourceStatusPayload(
  value: unknown,
  now: Date = new Date()
): LearnPromptSourceStatusSnapshot {
  const payload = record(value);
  const sites = array(payload.sites)
    .map(normalizeLearnPromptSourceStatus)
    .filter((site): site is LearnPromptSourceStatus => Boolean(site));

  return {
    failed_sites: siteCount(payload.failed_sites),
    freshness: freshness(payload.generated_at, latestMaxAgeHours, now),
    generated_at: optionalText(payload.generated_at) ?? null,
    sites,
    successful_sites: siteCount(payload.successful_sites),
    zero_item_sites: siteCount(payload.zero_item_sites)
  };
}

export function mapLearnPromptItemToRetrievalRadarItem(item: LearnPromptSignalItem): RetrievalRadarItem {
  const timestamp = item.published_at ?? item.first_seen_at ?? item.last_seen_at ?? new Date(0).toISOString();
  const aiScore = score(item.ai_score);
  const sourceWeight = sourceWeightFromRank(item.source_tier_rank);
  const importance = externalImportanceScore(item);
  const credibility = sourceWeight;
  const freshnessScore = item.published_at ? 0.75 : 0.45;
  const novelty = Math.max(0.45, Math.min(0.9, aiScore * 0.7 + 0.15));
  const overall = score(
    aiScore * 0.3 +
      importance * 0.2 +
      credibility * 0.2 +
      novelty * 0.15 +
      freshnessScore * 0.1 +
      sourceWeight * 0.05
  );

  return {
    ai_relevance_score: aiScore,
    categories: [learnPromptCategory(item.ai_label)],
    collected_at: item.first_seen_at ?? timestamp,
    confidence: Math.max(0.55, Math.min(0.9, aiScore * 0.75 + sourceWeight * 0.2)),
    credibility_score: credibility,
    entities: [],
    evidence_notes: [
      `LearnPrompt AI News Radar reason: ${item.ai_relevance_reason || "public_ai_signal"}`,
      item.ai_signals.length > 0 ? `signals: ${item.ai_signals.slice(0, 8).join(", ")}` : "",
      item.ai_noise.length > 0 ? `noise: ${item.ai_noise.slice(0, 5).join(", ")}` : "",
      `provenance: provider=${item.provenance.provider}, review_status=${item.provenance.review_status}, usage=${item.provenance.usage}`
    ].filter(Boolean),
    freshness_score: freshnessScore,
    id: item.id,
    importance_score: importance,
    language: languageFromText(item.title),
    novelty_score: novelty,
    overall_score: overall,
    processed_at: item.last_seen_at ?? item.first_seen_at ?? timestamp,
    published_at: item.published_at,
    raw_item_id: item.external_id,
    source_id: `learnprompt:${item.site_id || "unknown"}`,
    source_name: item.source || item.site_name || "LearnPrompt AI News Radar",
    source_tier: learnPromptSourceTier(item),
    source_weight: sourceWeight,
    status: "excluded",
    summary_en: item.title_en ?? "",
    summary_zh: item.title_zh ?? "",
    tags: Array.from(new Set(["learnprompt", item.ai_label, ...item.ai_signals].filter(Boolean))).slice(0, 12),
    title: item.title,
    url: item.url,
    why_it_matters: "External public 24h AI source-repair diagnostic from LearnPrompt AI News Radar; excluded from public AI Radar evidence until an operator creates a reviewed source repair."
  };
}

export function selectLearnPromptDiffCandidates(
  upstream: LearnPromptLatestSnapshot,
  existingItems: Array<{ title?: string; url?: string; source_name?: string }>,
  options: { limit?: number; minAiScore?: number } = {}
): LearnPromptDiffCandidate[] {
  const limit = options.limit ?? 30;
  const minAiScore = options.minAiScore ?? 0.85;
  const existingUrls = new Set(existingItems.map((item) => normalizeUrl(item.url)).filter(Boolean));
  const existingTitleKeys = new Set(existingItems.map((item) => titleKey(item.title, item.source_name)).filter(Boolean));

  return upstream.items
    .filter((item) => item.ai_score >= minAiScore)
    .filter((item) => {
      const url = normalizeUrl(item.url);
      if (url && existingUrls.has(url)) {
        return false;
      }

      return !titleAliases(item).some((title) =>
        [item.source, item.site_name].some((source) => {
          const key = titleKey(title, source);
          return key && existingTitleKeys.has(key);
        })
      );
    })
    .map((item) => {
      const priority = learnPromptCandidatePriority(item);
      return {
        item,
        mappedItem: mapLearnPromptItemToRetrievalRadarItem(item),
        provenance: item.provenance,
        priority,
        reason: learnPromptDiffReason(item)
      };
    })
    .sort((left, right) => right.priority - left.priority || right.item.ai_score - left.item.ai_score || left.item.title.localeCompare(right.item.title))
    .slice(0, limit);
}

export function learnPromptCategory(label: string): RadarCategory {
  switch (label) {
    case "model_release":
      return "model_release";
    case "ai_product_update":
      return "product_update";
    case "developer_tool":
      return "infrastructure";
    case "agent_workflow":
      return "agent";
    case "research_paper":
      return "research";
    case "industry_business":
      return "business";
    case "infra_compute":
      return "infrastructure";
    case "robotics":
      return "other";
    case "curated_hotlist":
      return "media_interview";
    default:
      return "other";
  }
}

export function learnPromptDataUrl(baseUrl = DEFAULT_LEARNPROMPT_AI_NEWS_RADAR_BASE_URL, file: string) {
  const url = publicInternetHttpUrl(`${baseUrl.replace(/\/+$/, "")}/${file.replace(/^\/+/, "")}`);
  if (!url) {
    throw new Error("LearnPrompt AI News Radar base URL must resolve to a public HTTP(S) URL.");
  }

  return url;
}

function normalizeLearnPromptSignalItem(value: unknown): LearnPromptSignalItem | null {
  const item = record(value);
  const externalId = optionalText(item.id);
  const title = optionalText(item.title_bilingual) ?? optionalText(item.title_zh) ?? optionalText(item.title) ?? optionalText(item.title_en);
  const url = publicHttpUrl(item.url);

  if (!externalId || !title || !url) {
    return null;
  }

  const siteId = optionalText(item.site_id) ?? "unknown";
  const source = optionalText(item.source) ?? optionalText(item.site_name) ?? "LearnPrompt AI News Radar";

  return {
    ai_label: optionalText(item.ai_label) ?? "ai_general",
    ai_noise: stringArray(item.ai_noise, 12, 80),
    ai_relevance_reason: optionalText(item.ai_relevance_reason),
    ai_score: score(item.ai_score),
    ai_signals: stringArray(item.ai_signals, 16, 80),
    external_id: externalId,
    first_seen_at: optionalIsoText(item.first_seen_at),
    id: `external:learnprompt:${externalId}`,
    last_seen_at: optionalIsoText(item.last_seen_at),
    published_at: optionalIsoText(item.published_at),
    provenance: learnPromptProvenance,
    site_id: siteId,
    site_name: optionalText(item.site_name) ?? "LearnPrompt AI News Radar",
    source,
    source_tier: optionalText(item.source_tier) ?? "external",
    source_tier_label: optionalText(item.source_tier_label),
    source_tier_rank: integer(item.source_tier_rank, 9),
    title,
    title_en: optionalText(item.title_en),
    title_zh: optionalText(item.title_zh),
    url
  };
}

function normalizeLearnPromptStory(value: unknown): LearnPromptStory | null {
  const story = record(value);
  const storyId = optionalText(story.story_id);
  const title = optionalText(story.title);
  const url = publicHttpUrl(story.url ?? story.primary_url);

  if (!storyId || !title || !url) {
    return null;
  }

  return {
    category: optionalText(story.category),
    importance_label: optionalText(story.importance_label),
    importance_score: score(story.importance_score ?? story.importance ?? story.score),
    items: array(story.items).map((item) => {
      const recordItem = record(item);
      return {
        id: optionalText(recordItem.id),
        published_at: optionalIsoText(recordItem.published_at),
        site_id: optionalText(recordItem.site_id),
        source: optionalText(recordItem.source),
        source_name: optionalText(recordItem.source_name),
        title: optionalText(recordItem.title),
        url: publicHttpUrl(recordItem.url)
      };
    }),
    latest_at: optionalIsoText(story.latest_at),
    reasons: stringArray(story.reasons, 12, 80),
    source: optionalText(story.source),
    source_count: integer(story.source_count, 1),
    source_name: optionalText(story.source_name),
    story_id: storyId,
    title,
    url
  };
}

function normalizeLearnPromptSourceStatus(value: unknown): LearnPromptSourceStatus | null {
  const site = record(value);
  const siteId = optionalText(site.site_id);
  const siteName = optionalText(site.site_name);

  if (!siteId || !siteName) {
    return null;
  }

  return {
    duration_ms: optionalNumber(site.duration_ms),
    error: optionalText(site.error) ?? null,
    item_count: integer(site.item_count),
    ok: Boolean(site.ok),
    site_id: siteId,
    site_name: siteName
  };
}

async function fetchLearnPromptJson(baseUrl: string | undefined, file: string, timeoutMs = defaultRequestTimeoutMs) {
  const url = learnPromptDataUrl(baseUrl, file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`LearnPrompt AI News Radar ${file} returned HTTP ${response.status}`);
    }

    if (!publicInternetHttpUrl(response.url)) {
      throw new Error(`LearnPrompt AI News Radar ${file} redirected to a non-public URL.`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxJsonPayloadBytes) {
      throw new Error(`LearnPrompt AI News Radar ${file} exceeded ${maxJsonPayloadBytes} byte limit`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/(^|;|\s)(application\/json|text\/plain|application\/octet-stream)\b/i.test(contentType)) {
      throw new Error(`LearnPrompt AI News Radar ${file} returned non-JSON content-type: ${contentType}`);
    }

    const textPayload = await response.text();
    if (new TextEncoder().encode(textPayload).length > maxJsonPayloadBytes) {
      throw new Error(`LearnPrompt AI News Radar ${file} exceeded ${maxJsonPayloadBytes} byte limit`);
    }

    return JSON.parse(textPayload) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function freshness(value: unknown, maxAgeHours: number, now: Date): LearnPromptFreshness {
  const generatedAt = optionalText(value) ?? null;
  const parsed = generatedAt ? parseLearnPromptTimestamp(generatedAt) : NaN;

  if (!Number.isFinite(parsed)) {
    return {
      ageHours: null,
      generatedAt,
      isStale: true,
      maxAgeHours
    };
  }

  const ageHours = (now.getTime() - parsed) / 3_600_000;

  return {
    ageHours: Number(ageHours.toFixed(2)),
    generatedAt,
    isStale: ageHours > maxAgeHours || ageHours < -futureTimestampToleranceHours,
    maxAgeHours
  };
}

function externalImportanceScore(item: LearnPromptSignalItem) {
  const sourceBoost = item.source_tier_rank <= 0 ? 0.92 : item.source_tier_rank <= 1 ? 0.82 : item.source_tier_rank <= 2 ? 0.72 : 0.62;
  return score(item.ai_score * 0.65 + sourceBoost * 0.35);
}

function sourceWeightFromRank(rank: number) {
  if (rank <= 0) return 1;
  if (rank === 1) return 0.88;
  if (rank === 2) return 0.74;
  if (rank === 3) return 0.62;
  return 0.5;
}

function learnPromptSourceTier(item: LearnPromptSignalItem) {
  if (item.source_tier === "official" || item.source_tier_rank <= 0) {
    return "official";
  }

  if (item.source_tier === "curated" || item.source_tier_rank <= 1) {
    return "curated";
  }

  return item.source_tier || "external";
}

function learnPromptCandidatePriority(item: LearnPromptSignalItem) {
  const officialBoost = item.source_tier_rank <= 0 ? 0.3 : 0;
  const labelBoost = ["model_release", "ai_product_update", "developer_tool", "agent_workflow", "research_paper"].includes(item.ai_label) ? 0.12 : 0;
  return Number((item.ai_score + officialBoost + labelBoost).toFixed(4));
}

function learnPromptDiffReason(item: LearnPromptSignalItem) {
  if (item.source_tier_rank <= 0) {
    return "external_official_high_score_missing";
  }

  if (item.ai_score >= 0.95) {
    return "external_high_ai_score_missing";
  }

  return "external_signal_missing";
}

function languageFromText(value: string): RetrievalRadarItem["language"] {
  if (/[\u4e00-\u9fff]/.test(value) && /[a-z]/i.test(value)) {
    return "mixed";
  }

  if (/[\u4e00-\u9fff]/.test(value)) {
    return "zh";
  }

  return /[a-z]/i.test(value) ? "en" : "unknown";
}

function normalizeUrl(value: unknown) {
  const url = publicHttpUrl(value);
  if (!url) return "";

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const parameter of [
      "fbclid",
      "gclid",
      "igshid",
      "mc_cid",
      "mc_eid",
      "ref",
      "ref_src",
      "spm",
      "utm_campaign",
      "utm_content",
      "utm_medium",
      "utm_source",
      "utm_term"
    ]) {
      parsed.searchParams.delete(parameter);
    }
    parsed.searchParams.sort();
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

function titleAliases(item: LearnPromptSignalItem) {
  return Array.from(new Set([
    item.title,
    item.title_en,
    item.title_zh,
    splitBilingualTitle(item.title).at(0),
    splitBilingualTitle(item.title).at(1)
  ].map((value) => optionalText(value)).filter((value): value is string => Boolean(value))));
}

function splitBilingualTitle(value: string) {
  return value.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
}

function titleKey(title: unknown, source: unknown) {
  const titleText = optionalText(title)?.toLowerCase().replace(/\s+/g, " ");
  if (!titleText) return "";
  const sourceText = optionalText(source)?.toLowerCase().replace(/\s+/g, " ") ?? "";
  return `${sourceText}::${titleText}`;
}

function publicHttpUrl(value: unknown) {
  return publicInternetHttpUrl(value);
}

function optionalIsoText(value: unknown) {
  const textValue = optionalText(value);
  return textValue && Number.isFinite(parseLearnPromptTimestamp(textValue)) ? textValue : undefined;
}

function parseLearnPromptTimestamp(value: string) {
  const trimmed = value.trim();
  const timezoneSuffix = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  if (!timezoneSuffix) {
    const match = trimmed.match(
      /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/
    );

    if (match) {
      const [, year, month, day, hour = "0", minute = "0", second = "0", fraction = "0"] = match;
      const millisecond = Number(fraction.slice(0, 3).padEnd(3, "0"));
      return Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        millisecond
      );
    }
  }

  return Date.parse(trimmed);
}

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim().slice(0, 1200) : undefined;
}

function stringArray(value: unknown, limit: number, maxLength: number) {
  return Array.from(new Set(array(value).map((item) => optionalText(item)?.slice(0, maxLength)).filter((item): item is string => Boolean(item)))).slice(0, limit);
}

function integer(value: unknown, fallback = 0) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.trunc(numberValue)) : fallback;
}

function siteCount(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }

  return integer(value);
}

function optionalNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function score(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }
  return Math.max(0, Math.min(1, numberValue));
}
