import { getAppConfig, getSupabasePublicConfig } from "@/lib/config";
import type { LoadedRadarItems, RetrievalRadarItem } from "@/lib/retrieval/types";
import { getSupabaseServerReadClient } from "@/lib/supabase/server-read";
import { RADAR_CATEGORIES, type RadarCategory } from "@/lib/understanding/types";

type SupabaseLoadAttempt = {
  loaded: LoadedRadarItems | null;
  warnings: string[];
};

type SupabaseRadarRow = Record<string, unknown>;

type SupabaseReadError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

const retrievalLimit = 250;

export async function loadSupabaseRadarItems(): Promise<SupabaseLoadAttempt> {
  const appConfig = getAppConfig();

  if (!appConfig.featureFlags.enableSupabaseRetrieval) {
    return {
      loaded: null,
      warnings: []
    };
  }

  const publicConfig = getSupabasePublicConfig();
  if (!publicConfig) {
    return {
      loaded: null,
      warnings: ["Supabase retrieval is enabled but public Supabase config is missing."]
    };
  }

  try {
    const supabase = getSupabaseServerReadClient();
    if (!supabase) {
      return {
        loaded: null,
        warnings: ["Supabase retrieval is enabled but public Supabase config is missing."]
      };
    }

    const { data, error } = await supabase
      .from("public_radar_items")
      .select(
        [
          "id",
          "local_id",
          "raw_item_id",
          "source_id",
          "source_name",
          "title",
          "url",
          "published_at",
          "collected_at",
          "processed_at",
          "language",
          "summary_zh",
          "summary_en",
          "topics",
          "categories",
          "tags",
          "status",
          "understanding_status",
          "exclusion_reason",
          "ai_relevance_score",
          "importance_score",
          "credibility_score",
          "novelty_score",
          "freshness_score",
          "overall_score",
          "source_tier",
          "source_weight",
          "confidence",
          "why_it_matters",
          "evidence_notes",
          "created_at",
          "updated_at"
        ].join(",")
      )
      .in("understanding_status", ["included", "needs_review"])
      .order("processed_at", { ascending: false, nullsFirst: false })
      .limit(retrievalLimit);

    if (error) {
      const readError = error as SupabaseReadError;
      if (isMissingPublicRetrievalViewError(readError)) {
        return {
          loaded: null,
          warnings: ["Supabase public retrieval view is not available; local fallback was used."]
        };
      }

      return {
        loaded: null,
        warnings: [
          `Supabase public retrieval view read failed and local fallback was used: ${sanitizeSupabaseReadError(readError.message)}`
        ]
      };
    }

    const rows = (data ?? []) as unknown as SupabaseRadarRow[];
    const items = rows.map(normalizeSupabaseRow).filter((item): item is RetrievalRadarItem => Boolean(item));

    if (rows.length === 0 || items.length === 0) {
      return {
        loaded: null,
        warnings: ["Supabase public retrieval view returned zero usable rows; local fallback was used."]
      };
    }

    return {
      loaded: {
        items,
        dataSource: "supabase_radar_items",
        freshness: freshnessFromItems(items),
        warnings:
          items.length < rows.length
            ? ["Some Supabase public retrieval view rows were skipped because required fields were missing."]
            : []
      },
      warnings: []
    };
  } catch (error) {
    const message = sanitizeSupabaseReadError(error instanceof Error ? error.message : String(error));
    return {
      loaded: null,
      warnings: [`Supabase public retrieval view threw an error and local fallback was used: ${message}`]
    };
  }
}

function isMissingPublicRetrievalViewError(error: SupabaseReadError) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (haystack.includes("public_radar_items") &&
      (haystack.includes("does not exist") ||
        haystack.includes("not find") ||
        haystack.includes("not found") ||
        haystack.includes("schema cache")))
  );
}

function sanitizeSupabaseReadError(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 400);
}

function normalizeSupabaseRow(value: SupabaseRadarRow): RetrievalRadarItem | null {
  const id = text(value.local_id) || text(value.id);
  const title = text(value.title);
  const url = text(value.url);
  const collectedAt = text(value.collected_at);
  const processedAt = text(value.processed_at) || text(value.updated_at) || collectedAt;

  if (!id || !title || !url || !collectedAt || !processedAt) {
    return null;
  }

  const sourceName = text(value.source_name) || "Supabase public source";

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
    categories: categories(value.categories ?? value.topics),
    tags: stringArray(value.tags),
    entities: [],
    source_tier: text(value.source_tier) || "unreviewed",
    source_weight: score(value.source_weight),
    confidence: score(value.confidence),
    status: normalizeStatus(value.understanding_status),
    exclusion_reason: optionalText(value.exclusion_reason),
    why_it_matters: optionalText(value.why_it_matters),
    evidence_notes: stringArray(value.evidence_notes)
  };
}

function freshnessFromItems(items: RetrievalRadarItem[]): LoadedRadarItems["freshness"] {
  const candidates = items.flatMap((item) => [
    timestampCandidate(item.processed_at, "processed_at" as const),
    timestampCandidate(item.collected_at, "collected_at" as const),
    timestampCandidate(item.published_at, "published_at" as const)
  ]);
  const latest = candidates
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => Date.parse(right.value) - Date.parse(left.value))[0];

  return {
    latestTimestamp: latest?.value,
    latestTimestampSource: latest?.source,
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
