import crypto from "node:crypto";

import { canonicalizeUrl } from "@/lib/ingestion/config";
import type { FetcherItem, IngestionRawItem, SelectedSource } from "@/lib/ingestion/types";

export function normalizeFetchedItem(source: SelectedSource, item: FetcherItem, collectedAt: string): IngestionRawItem {
  const canonicalUrl = canonicalizeUrl(item.canonicalUrl ?? item.url);
  const rawText = normalizeText(item.rawText ?? item.excerpt ?? item.summary ?? item.title);
  const summary = normalizeText(item.summary ?? item.excerpt ?? "");
  const title = normalizeText(item.title || source.name);
  const contentHash = sha256([source.id, canonicalUrl, title, rawText].join("\n"));
  const externalId = item.externalId ? normalizeText(item.externalId) : undefined;
  const id = `raw_${sha256([source.id, externalId ?? canonicalUrl, contentHash].join("|")).slice(0, 16)}`;
  const metadata = {
    ...item.metadata,
    source_category: source.category,
    source_weight: source.weight,
    source_language: source.language,
    source_region: source.region,
    source_tags: source.tags
  };

  return {
    id,
    source_id: source.id,
    source_name: source.name,
    source_type: source.type,
    source_tier: source.tier,
    title,
    url: item.url,
    canonical_url: canonicalUrl,
    author: item.author ? normalizeText(item.author) : undefined,
    published_at: item.publishedAt,
    collected_at: collectedAt,
    retrieved_at: collectedAt,
    language: detectLanguage([title, rawText, summary].join("\n")),
    raw_text: rawText,
    summary,
    content_hash: contentHash,
    hash: contentHash,
    external_id: externalId,
    crawl_method: source.crawl_method,
    status: item.status ?? "collected",
    error_message: item.errorMessage,
    metadata,
    raw_metadata: metadata
  };
}

export function detectLanguage(value: string): "zh" | "en" | "mixed" | "unknown" {
  const compact = value.replace(/\s+/g, "");
  if (!compact) {
    return "unknown";
  }

  const zhMatches = compact.match(/[\u3400-\u9fff]/g) ?? [];
  const enMatches = compact.match(/[A-Za-z]/g) ?? [];
  const hasZh = zhMatches.length > 0;
  const hasEn = enMatches.length > 0;

  if (hasZh && hasEn && enMatches.length >= 20) {
    return "mixed";
  }

  if (hasZh) {
    return "zh";
  }

  if (hasEn && enMatches.length / compact.length >= 0.6) {
    return "en";
  }

  return "unknown";
}

function normalizeText(value: string) {
  return value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
