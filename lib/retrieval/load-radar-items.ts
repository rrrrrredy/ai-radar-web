import fs from "node:fs/promises";
import path from "node:path";

import { mockRadarItems } from "@/lib/radar/mock-data";
import type { RadarItem } from "@/lib/radar/types";
import { loadSupabaseRadarItems } from "@/lib/retrieval/load-supabase-radar-items";
import type { LoadedRadarItems, RetrievalRadarItem } from "@/lib/retrieval/types";
import { RADAR_CATEGORIES, type RadarCategory } from "@/lib/understanding/types";

const LATEST_RADAR_ITEMS_PATH = path.join(process.cwd(), "data", "understanding", "latest", "radar-items.json");
export const DEFAULT_PUBLIC_SNAPSHOT_URL = "https://ai-industry-radar.pages.dev/data/radar-snapshot.json";

export async function loadRadarItems(): Promise<LoadedRadarItems> {
  const supabase = await loadSupabaseRadarItems();
  if (supabase.loaded) {
    return supabase.loaded;
  }

  const preferPublicSnapshot = shouldPreferPublicSnapshot();
  if (preferPublicSnapshot) {
    const publicSnapshot = await loadPublicSnapshotRadarItems();
    if (publicSnapshot) {
      publicSnapshot.warnings = [...supabase.warnings, ...publicSnapshot.warnings];
      return publicSnapshot;
    }
  }

  const local = await loadLocalRadarItems();
  if (local) {
    local.warnings = [...supabase.warnings, ...local.warnings];
    return local;
  }

  const publicSnapshot = preferPublicSnapshot ? null : await loadPublicSnapshotRadarItems();
  if (publicSnapshot) {
    publicSnapshot.warnings = [...supabase.warnings, ...publicSnapshot.warnings];
    return publicSnapshot;
  }

  if (!allowSyntheticFallback()) {
    return {
      items: [],
      dataSource: "empty",
      freshness: {
        itemCount: 0
      },
      warnings: [...supabase.warnings, "当前没有可用的公开雷达证据；请等待下一轮刷新或修复数据源。"]
    };
  }

  const mockItems = mockRadarItems.map(mapMockRadarItem);
  if (mockItems.length === 0) {
    return {
      items: [],
      dataSource: "empty",
      freshness: {
        itemCount: 0
      },
      warnings: [...supabase.warnings, "No local understanding output or mock radar items are available."]
    };
  }

  return {
    items: mockItems,
    dataSource: "mock_data",
    freshness: freshnessFromItems(mockItems),
    warnings: [...supabase.warnings, "Using synthetic mock radar items because local understanding output is missing or invalid."]
  };
}

function shouldPreferPublicSnapshot() {
  return process.env.NODE_ENV === "production" || process.env.PREFER_PUBLIC_RADAR_SNAPSHOT === "true";
}

function allowSyntheticFallback() {
  return process.env.ALLOW_SYNTHETIC_RADAR_FALLBACK === "true" || process.env.NODE_ENV !== "production";
}

async function loadLocalRadarItems(): Promise<LoadedRadarItems | null> {
  try {
    const [raw, stats] = await Promise.all([
      fs.readFile(LATEST_RADAR_ITEMS_PATH, "utf8"),
      fs.stat(LATEST_RADAR_ITEMS_PATH)
    ]);
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return null;
    }

    const items = parsed.map(normalizeLocalItem).filter((item): item is RetrievalRadarItem => Boolean(item));
    if (items.length === 0) {
      return null;
    }

    return {
      items,
      dataSource: "local_understanding_output",
      freshness: freshnessFromItems(items, stats.mtime.toISOString()),
      warnings: items.length < parsed.length ? ["Some local radar items were skipped because required fields were missing."] : []
    };
  } catch {
    return null;
  }
}

export async function loadPublicRadarSnapshot(): Promise<Record<string, unknown> | null> {
  const snapshotUrl = process.env.PUBLIC_RADAR_SNAPSHOT_URL?.trim() || DEFAULT_PUBLIC_SNAPSHOT_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(snapshotUrl, {
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const parsed = (await response.json()) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadPublicSnapshotRadarItems(): Promise<LoadedRadarItems | null> {
  const parsed = await loadPublicRadarSnapshot();
  if (!parsed || !Array.isArray(parsed.radar_items)) {
    return null;
  }

  const items = parsed.radar_items
    .map(normalizeSnapshotItem)
    .filter((item): item is RetrievalRadarItem => Boolean(item));

  if (items.length === 0) {
    return null;
  }

  return {
    items,
    dataSource: "supabase_radar_items",
    freshness: freshnessFromItems(items, optionalText(parsed.generated_at)),
    warnings: ["使用 Cloudflare 公开快照作为只读证据面；未读取私有原文或运行写入。"]
  };
}

function normalizeLocalItem(value: unknown): RetrievalRadarItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = text(value.id);
  const title = text(value.title);
  const url = text(value.url);
  const sourceName = text(value.source_name);
  const collectedAt = text(value.collected_at);
  const processedAt = text(value.processed_at);

  if (!id || !title || !url || !sourceName || !collectedAt || !processedAt) {
    return null;
  }

  return {
    id,
    raw_item_id: text(value.raw_item_id) || id,
    source_id: text(value.source_id) || "unknown",
    source_name: sourceName,
    title,
    url,
    published_at: optionalText(value.published_at),
    collected_at: collectedAt,
    processed_at: processedAt,
    language: normalizeLanguage(value.language),
    summary_zh: text(value.summary_zh),
    summary_en: text(value.summary_en),
    ai_relevance_score: score(value.ai_relevance_score),
    importance_score: score(value.importance_score),
    credibility_score: score(value.credibility_score),
    novelty_score: score(value.novelty_score),
    freshness_score: score(value.freshness_score),
    overall_score: score(value.overall_score),
    categories: categories(value.categories),
    tags: stringArray(value.tags),
    entities: Array.isArray(value.entities)
      ? value.entities
          .map(normalizeEntity)
          .filter((entity): entity is RetrievalRadarItem["entities"][number] => Boolean(entity))
      : [],
    source_tier: text(value.source_tier) || "unreviewed",
    source_weight: score(value.source_weight),
    confidence: score(value.confidence),
    status: normalizeStatus(value.status),
    exclusion_reason: optionalText(value.exclusion_reason),
    why_it_matters: optionalText(value.why_it_matters),
    evidence_notes: stringArray(value.evidence_notes),
    model_metadata: isRecord(value.model_metadata) ? value.model_metadata : undefined
  };
}

function normalizeSnapshotItem(value: unknown): RetrievalRadarItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = text(value.id);
  const title = text(value.title);
  const url = text(value.url);
  const sourceName = text(value.source_name);
  const collectedAt = text(value.collected_at);
  const processedAt = text(value.processed_at);
  const scores = isRecord(value.scores) ? value.scores : {};

  if (!id || !title || !url || !sourceName || !collectedAt || !processedAt) {
    return null;
  }

  return {
    id,
    raw_item_id: text(value.raw_item_id) || id,
    source_id: text(value.source_id) || "public-snapshot",
    source_name: sourceName,
    title,
    url,
    published_at: optionalText(value.published_at),
    collected_at: collectedAt,
    processed_at: processedAt,
    language: normalizeLanguage(value.language),
    summary_zh: text(value.summary_zh),
    summary_en: text(value.summary_en),
    ai_relevance_score: score(scores.ai_relevance),
    importance_score: score(scores.importance),
    credibility_score: score(scores.credibility),
    novelty_score: score(scores.novelty),
    freshness_score: score(scores.freshness),
    overall_score: score(scores.overall),
    categories: categories(value.categories),
    tags: stringArray(value.tags),
    entities: [],
    source_tier: text(value.source_tier) || "public",
    source_weight: score(value.source_weight || 0.7),
    confidence: score(value.confidence || 0.6),
    status: normalizeStatus(value.status),
    exclusion_reason: optionalText(value.exclusion_reason),
    why_it_matters: optionalText(value.why_it_matters),
    evidence_notes: stringArray(value.evidence_notes)
  };
}

function mapMockRadarItem(item: RadarItem): RetrievalRadarItem {
  const timestamp = item.updatedAt || item.createdAt;
  const category = mockCategory(item);

  return {
    id: item.id,
    raw_item_id: item.rawItemId,
    source_id: item.sourceId,
    source_name: mockSourceName(item.sourceId),
    title: item.title,
    url: `https://example.com/ai-radar/items/${item.id}`,
    published_at: item.createdAt,
    collected_at: item.createdAt,
    processed_at: timestamp,
    language: "mixed",
    summary_zh: item.summaryZh,
    summary_en: item.summaryEn,
    ai_relevance_score: 0.72,
    importance_score: item.importanceScore,
    credibility_score: item.credibilityScore,
    novelty_score: item.noveltyScore,
    freshness_score: 0.5,
    overall_score: Number(
      (
        0.72 * 0.3 +
        item.importanceScore * 0.2 +
        item.credibilityScore * 0.2 +
        item.noveltyScore * 0.15 +
        0.5 * 0.1 +
        0.6 * 0.05
      ).toFixed(4)
    ),
    categories: [category],
    tags: item.topics,
    entities: [],
    source_tier: "unreviewed",
    source_weight: 0.6,
    confidence: item.confidence === "high" ? 0.9 : item.confidence === "medium" ? 0.65 : 0.4,
    status: item.status === "archived" ? "excluded" : item.status === "draft" ? "needs_review" : "included",
    why_it_matters: "Synthetic demo radar item used to validate retrieval and writing-assistant UI behavior.",
    evidence_notes: ["Synthetic mock data; not evidence of a current real-world event."],
    model_metadata: {
      mode: "mock",
      provider: "deepseek",
      prompt_version: "phase-6-mock"
    },
    is_mock: true
  };
}

function freshnessFromItems(items: RetrievalRadarItem[], fileMtime?: string): LoadedRadarItems["freshness"] {
  const candidates = items.flatMap((item) => [
    timestampCandidate(item.processed_at, "processed_at" as const),
    timestampCandidate(item.collected_at, "collected_at" as const),
    timestampCandidate(item.published_at, "published_at" as const)
  ]);
  const latest = candidates
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => Date.parse(right.value) - Date.parse(left.value))[0];

  return {
    latestTimestamp: latest?.value ?? fileMtime,
    latestTimestampSource: latest?.source ?? (fileMtime ? "file_mtime" : undefined),
    fileMtime,
    itemCount: items.length
  };
}

function timestampCandidate(
  value: string | undefined,
  source: "processed_at" | "collected_at" | "published_at"
) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return null;
  }

  return {
    value,
    source
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || undefined;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(text).filter(Boolean))).slice(0, 16);
}

function categories(value: unknown): RadarCategory[] {
  const values = stringArray(value).filter((category): category is RadarCategory =>
    RADAR_CATEGORIES.includes(category as RadarCategory)
  );

  return values.length > 0 ? values : ["other"];
}

function score(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numberValue));
}

function normalizeLanguage(value: unknown): RetrievalRadarItem["language"] {
  if (value === "zh" || value === "en" || value === "mixed" || value === "unknown") {
    return value;
  }

  return "unknown";
}

function normalizeStatus(value: unknown): RetrievalRadarItem["status"] {
  if (value === "included" || value === "excluded" || value === "needs_review" || value === "failed") {
    return value;
  }

  return "needs_review";
}

function normalizeEntity(value: unknown): RetrievalRadarItem["entities"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = text(value.name);
  const type = text(value.type);
  if (!name) {
    return null;
  }

  return {
    name,
    type: isEntityType(type) ? type : "other",
    confidence: score(value.confidence || 0.5),
    evidence_text: optionalText(value.evidence_text)
  };
}

function isEntityType(value: string): value is RetrievalRadarItem["entities"][number]["type"] {
  return [
    "company",
    "model",
    "product",
    "person",
    "paper",
    "project",
    "repository",
    "investor",
    "regulator",
    "other"
  ].includes(value);
}

function mockCategory(item: RadarItem): RadarCategory {
  const textValue = [...item.topics, item.category].join(" ").toLowerCase();

  if (textValue.includes("agent")) {
    return "agent";
  }

  if (textValue.includes("open")) {
    return "open_source";
  }

  if (textValue.includes("product")) {
    return "product_update";
  }

  if (textValue.includes("model")) {
    return "model_release";
  }

  return "other";
}

function mockSourceName(sourceId: string) {
  if (sourceId === "demo-official-lab") {
    return "Demo Official Lab";
  }

  if (sourceId === "demo-builder-notes") {
    return "Demo Builder Notes";
  }

  if (sourceId === "demo-open-source-index") {
    return "Demo Open Source Index";
  }

  return "Synthetic mock source";
}
