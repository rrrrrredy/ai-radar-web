import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicRadarRow = Record<string, unknown>;

export type PublicRadarReadFailure = {
  kind:
    | "manifest_read_failed"
    | "manifest_count_unavailable"
    | "manifest_changed"
    | "manifest_incomplete"
    | "manifest_invalid"
    | "detail_read_failed"
    | "detail_incomplete"
    | "row_limit_exceeded"
    | "unexpected_error";
  message: string;
  code?: string;
};

export type CompletePublicRadarRead =
  | {
      ok: true;
      rows: PublicRadarRow[];
      count: number;
    }
  | {
      ok: false;
      error: PublicRadarReadFailure;
    };

type PublicRadarReadOptions = {
  manifestPageSize?: number;
  detailChunkSize?: number;
  maxRows?: number;
};

type SupabaseReadError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

const defaultManifestPageSize = 500;
const defaultDetailChunkSize = 50;
const defaultMaxRows = 5_000;

export const publicRadarSelectColumns = [
  "id",
  "local_id",
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
  "entities",
  "created_at",
  "updated_at"
].join(",");

/**
 * Reads the public radar view without sorting its wide entity projection.
 *
 * PostgREST previously had to aggregate entity JSON, count every row, and sort
 * that wide result in one statement. The public project statement timeout made
 * that shape fail once the dataset grew. This reader first obtains a cheap,
 * ordered ID manifest, then loads full rows in bounded ID chunks and restores
 * the manifest order locally.
 */
export async function readCompletePublicRadarRows(
  supabase: SupabaseClient,
  options: PublicRadarReadOptions = {}
): Promise<CompletePublicRadarRead> {
  const manifestPageSize = positiveInteger(options.manifestPageSize, defaultManifestPageSize);
  const detailChunkSize = positiveInteger(options.detailChunkSize, defaultDetailChunkSize);
  const maxRows = positiveInteger(options.maxRows, defaultMaxRows);
  const manifestRows: PublicRadarRow[] = [];
  let expectedCount: number | null = null;

  try {
    for (let offset = 0; ; offset += manifestPageSize) {
      const { count, data, error } = await supabase
        .from("public_radar_items")
        .select("id,processed_at", { count: "exact" })
        .in("understanding_status", ["included", "needs_review"])
        .order("processed_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .range(offset, offset + manifestPageSize - 1);

      if (error) {
        return failure("manifest_read_failed", error);
      }
      if (!Number.isInteger(count) || Number(count) < 0) {
        return failure("manifest_count_unavailable", {
          message: "The public radar manifest did not return an exact row count."
        });
      }
      if (Number(count) > maxRows) {
        return failure("row_limit_exceeded", {
          message: `The public radar manifest contains ${count} rows, above the ${maxRows} safety limit.`
        });
      }

      if (expectedCount === null) {
        expectedCount = Number(count);
      } else if (expectedCount !== Number(count)) {
        return failure("manifest_changed", {
          message: `The public radar row count changed from ${expectedCount} to ${count} during pagination.`
        });
      }

      const pageRows = (data ?? []) as unknown as PublicRadarRow[];
      manifestRows.push(...pageRows);
      if (manifestRows.length >= expectedCount) {
        break;
      }
      if (pageRows.length === 0) {
        return failure("manifest_incomplete", {
          message: `The public radar manifest stopped at ${manifestRows.length} of ${expectedCount} rows.`
        });
      }
    }

    const manifest = validatePublicRadarManifest(manifestRows, expectedCount);
    if (!manifest.complete) {
      return failure("manifest_invalid", { message: manifest.reason });
    }
    if (manifest.ids.length === 0) {
      return { ok: true, rows: [], count: 0 };
    }

    const detailRows: PublicRadarRow[] = [];
    for (let offset = 0; offset < manifest.ids.length; offset += detailChunkSize) {
      const ids = manifest.ids.slice(offset, offset + detailChunkSize);
      const { data, error } = await supabase
        .from("public_radar_items")
        .select(publicRadarSelectColumns)
        .in("id", ids);

      if (error) {
        return failure("detail_read_failed", error);
      }
      detailRows.push(...((data ?? []) as unknown as PublicRadarRow[]));
    }

    const ordered = reorderPublicRadarRows(manifest.ids, detailRows);
    if (!ordered.complete) {
      return failure("detail_incomplete", { message: ordered.reason });
    }

    return {
      ok: true,
      rows: ordered.rows,
      count: manifest.ids.length
    };
  } catch (error) {
    return failure("unexpected_error", error);
  }
}

export function validatePublicRadarManifest(rows: PublicRadarRow[], expectedCount: number | null) {
  if (!Number.isInteger(expectedCount) || Number(expectedCount) < 0) {
    return { complete: false, ids: [] as string[], reason: "exact count unavailable" } as const;
  }
  if (rows.length !== expectedCount) {
    return {
      complete: false,
      ids: [] as string[],
      reason: `manifest row count mismatch: expected ${expectedCount}, received ${rows.length}`
    } as const;
  }

  const ids = rows.map((row) => text(row.id));
  if (ids.some((id) => !id)) {
    return { complete: false, ids: [] as string[], reason: "manifest contains a missing row id" } as const;
  }
  if (new Set(ids).size !== ids.length) {
    return { complete: false, ids: [] as string[], reason: "manifest contains duplicate row ids" } as const;
  }

  return { complete: true, ids, reason: null } as const;
}

export function reorderPublicRadarRows(ids: string[], rows: PublicRadarRow[]) {
  const byId = new Map<string, PublicRadarRow>();
  for (const row of rows) {
    const id = text(row.id);
    if (!id || byId.has(id)) {
      return { complete: false, rows: [] as PublicRadarRow[], reason: "detail rows contain a missing or duplicate id" } as const;
    }
    byId.set(id, row);
  }

  const ordered = ids.map((id) => byId.get(id)).filter((row): row is PublicRadarRow => Boolean(row));
  if (ordered.length !== ids.length || byId.size !== ids.length) {
    return {
      complete: false,
      rows: [] as PublicRadarRow[],
      reason: `detail row mismatch: expected ${ids.length}, received ${byId.size}`
    } as const;
  }

  return { complete: true, rows: ordered, reason: null } as const;
}

export function publicRadarReadFailureMessage(error: PublicRadarReadFailure) {
  return [error.kind, error.code ? `code=${error.code}` : "", error.message].filter(Boolean).join("; ");
}

function failure(kind: PublicRadarReadFailure["kind"], value: unknown): CompletePublicRadarRead {
  const error = normalizeError(value);
  return {
    ok: false,
    error: {
      kind,
      message: error.message,
      ...(error.code ? { code: error.code } : {})
    }
  };
}

function normalizeError(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as SupabaseReadError;
    const message = [record.message, record.details, record.hint].map(safeText).filter(Boolean).join(" ");
    return {
      code: safeText(record.code, 40),
      message: message || "Supabase public radar read failed without an error message."
    };
  }

  return {
    code: "",
    message: safeText(value instanceof Error ? value.message : String(value)) || "Unexpected Supabase public radar read failure."
  };
}

function safeText(value: unknown, maxLength = 320) {
  return typeof value === "string"
    ? value
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
        .replace(/\b(?:apikey|api_key|authorization|token)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
    : "";
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
