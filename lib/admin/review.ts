import "server-only";

import { cache } from "react";

import {
  type AdminAuditEventRow,
  type AdminReviewReadResult,
  listRecentAuditEvents,
  sanitizeAdminError
} from "@/lib/admin/audit";
import { requireUserRole } from "@/lib/auth/roles";
import { readCleanedSources } from "@/lib/ingestion/select-sources";
import type { CleanedSource } from "@/lib/ingestion/types";
import { loadRadarItems } from "@/lib/retrieval/load-radar-items";
import type { RetrievalDataSource, RetrievalRadarItem } from "@/lib/retrieval/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type ReviewTaskStatus = "open" | "in_review" | "approved" | "rejected" | "deferred" | "resolved";
export type ReviewTaskPriority = "low" | "normal" | "high" | "urgent";
export type ReviewTaskTargetType = "radar_item" | "source" | "source_change" | "system";

export type ReviewTaskRow = {
  id: string;
  targetType: ReviewTaskTargetType;
  targetId?: string;
  targetLocalId?: string;
  title: string;
  description: string;
  status: ReviewTaskStatus;
  priority: ReviewTaskPriority;
  reason?: string;
  createdAt?: string;
  source: "supabase" | "local_preview";
};

export type NeedsReviewRadarItemRow = {
  id: string;
  title: string;
  sourceName: string;
  status: string;
  confidence: number;
  overallScore: number;
  credibilityScore: number;
  reason: string;
  processedAt: string;
  retrievalSource: RetrievalDataSource;
};

export type SourceMissingPublicUrlRow = {
  id: string;
  name: string;
  status: CleanedSource["status"];
  crawlMethod: string;
  tier: CleanedSource["tier"];
  weight: number;
  reason: string;
  riskFlags: string[];
};

export type SourceChangeRequestRow = {
  id: string;
  requestType: "add" | "update_url" | "trial" | "approve" | "reject" | "pause" | "resume";
  sourceSlug?: string;
  sourceName?: string;
  proposedUrl?: string;
  proposedStatus?: string;
  proposedTier?: string;
  rationale: string;
  status: "open" | "approved" | "rejected" | "deferred";
  createdAt?: string;
  source: "supabase" | "local_preview";
};

export type AdminReviewDashboardData = {
  auditEvents: AdminReviewReadResult<AdminAuditEventRow>;
  missingPublicUrlSources: AdminReviewReadResult<SourceMissingPublicUrlRow>;
  radarItemsNeedingReview: AdminReviewReadResult<NeedsReviewRadarItemRow>;
  reviewTasks: AdminReviewReadResult<ReviewTaskRow>;
  sourceChangeRequests: AdminReviewReadResult<SourceChangeRequestRow>;
  warnings: string[];
};

type SupabaseReadError = {
  code?: string;
  details?: string;
  hint?: string;
  message: string;
};

const ensureAdminReviewAccess = cache(async () => {
  await requireUserRole("admin", "/admin/review");
});

export async function getReviewDashboardData(): Promise<AdminReviewDashboardData> {
  await ensureAdminReviewAccess();

  const [radarItemsNeedingReview, missingPublicUrlSources, sourceChangeRequests, persistedReviewTasks, auditEvents] =
    await Promise.all([
      listNeedsReviewRadarItemsInternal(),
      listSourcesMissingPublicUrlInternal(),
      listSourceChangeRequestsInternal(),
      listReviewTasksFromSupabase(),
      listRecentAuditEvents()
    ]);

  const reviewTasks = persistedReviewTasks.source === "supabase"
    ? persistedReviewTasks
    : {
        rows: buildReviewTaskPreview({
          missingPublicUrlSourceCount: missingPublicUrlSources.rows.length,
          radarReviewCount: radarItemsNeedingReview.rows.length,
          sourceChangeRequestCount: sourceChangeRequests.rows.length
        }),
        source: "local_preview" as const,
        warnings: [
          ...persistedReviewTasks.warnings,
          "Persistent review tasks are not readable yet; showing derived local review-task previews."
        ]
      };

  return {
    auditEvents,
    missingPublicUrlSources,
    radarItemsNeedingReview,
    reviewTasks,
    sourceChangeRequests,
    warnings: uniqueWarnings([
      ...radarItemsNeedingReview.warnings,
      ...missingPublicUrlSources.warnings,
      ...sourceChangeRequests.warnings,
      ...reviewTasks.warnings,
      ...auditEvents.warnings
    ])
  };
}

export async function listNeedsReviewRadarItems(): Promise<AdminReviewReadResult<NeedsReviewRadarItemRow>> {
  await ensureAdminReviewAccess();
  return listNeedsReviewRadarItemsInternal();
}

export async function listSourcesMissingPublicUrl(): Promise<AdminReviewReadResult<SourceMissingPublicUrlRow>> {
  await ensureAdminReviewAccess();
  return listSourcesMissingPublicUrlInternal();
}

export async function listReviewTasks(): Promise<AdminReviewReadResult<ReviewTaskRow>> {
  await ensureAdminReviewAccess();

  const [persisted, radarItems, missingSources, sourceChanges] = await Promise.all([
    listReviewTasksFromSupabase(),
    listNeedsReviewRadarItemsInternal(),
    listSourcesMissingPublicUrlInternal(),
    listSourceChangeRequestsInternal()
  ]);

  if (persisted.source === "supabase") {
    return persisted;
  }

  return {
    rows: buildReviewTaskPreview({
      missingPublicUrlSourceCount: missingSources.rows.length,
      radarReviewCount: radarItems.rows.length,
      sourceChangeRequestCount: sourceChanges.rows.length
    }),
    source: "local_preview",
    warnings: [
      ...persisted.warnings,
      "Persistent review tasks are not readable yet; showing derived local review-task previews."
    ]
  };
}

export async function listSourceChangeRequests(): Promise<AdminReviewReadResult<SourceChangeRequestRow>> {
  await ensureAdminReviewAccess();
  return listSourceChangeRequestsInternal();
}

export function buildReviewTaskPreview({
  missingPublicUrlSourceCount = 0,
  radarReviewCount = 0,
  sourceChangeRequestCount = 0
}: {
  missingPublicUrlSourceCount?: number;
  radarReviewCount?: number;
  sourceChangeRequestCount?: number;
} = {}): ReviewTaskRow[] {
  return [
    {
      description: "Derived from retrieval/local understanding rows whose status, confidence, or credibility indicates analyst review.",
      id: "preview-task-radar-items",
      priority: radarReviewCount > 10 ? "high" : "normal",
      reason: "needs_review or weak evidence",
      source: "local_preview",
      status: radarReviewCount > 0 ? "open" : "resolved",
      targetLocalId: "radar-needs-review",
      targetType: "radar_item",
      title: `${radarReviewCount} radar items need review`
    },
    {
      description: "Derived from the cleaned public source registry. Missing public URLs block ingestion eligibility.",
      id: "preview-task-missing-public-urls",
      priority: missingPublicUrlSourceCount > 0 ? "high" : "normal",
      reason: "source status needs_public_url or URL absent",
      source: "local_preview",
      status: missingPublicUrlSourceCount > 0 ? "open" : "resolved",
      targetLocalId: "sources-missing-public-url",
      targetType: "source",
      title: `${missingPublicUrlSourceCount} sources need public URL review`
    },
    {
      description: "Derived count for persisted source-change requests. Actual source-change mutations are server-side admin actions.",
      id: "preview-task-source-changes",
      priority: sourceChangeRequestCount > 0 ? "normal" : "low",
      reason: "source_change_requests migration not applied or empty",
      source: "local_preview",
      status: sourceChangeRequestCount > 0 ? "open" : "deferred",
      targetLocalId: "source-change-requests",
      targetType: "source_change",
      title: `${sourceChangeRequestCount} source change requests visible`
    }
  ];
}

async function listNeedsReviewRadarItemsInternal(): Promise<AdminReviewReadResult<NeedsReviewRadarItemRow>> {
  const loaded = await loadRadarItems();
  const rows = loaded.items
    .filter(isReviewableRadarItem)
    .toSorted((left, right) => right.overall_score - left.overall_score)
    .slice(0, 16)
    .map((item) => mapReviewableRadarItem(item, loaded.dataSource));

  return {
    rows,
    source: loaded.dataSource === "supabase_radar_items" ? "supabase" : "local_preview",
    warnings: loaded.warnings
  };
}

function listSourcesMissingPublicUrlInternal(): AdminReviewReadResult<SourceMissingPublicUrlRow> {
  const cleanedSources = readCleanedSources();
  const rows = cleanedSources
    .filter((source) => !source.url || source.status === "needs_public_url" || source.risk_flags.includes("needs_public_url"))
    .toSorted(compareMissingPublicUrlPriority)
    .slice(0, 20)
    .map((source) => ({
      crawlMethod: source.crawl_method,
      id: source.id,
      name: source.name,
      reason: source.url
        ? "Public URL is present but still carries a needs_public_url review flag."
        : "No reviewed public URL is available; ingestion must stay blocked.",
      riskFlags: source.risk_flags,
      status: source.status,
      tier: source.tier,
      weight: source.weight
    }));

  return {
    rows,
    source: "local_preview",
    warnings: []
  };
}

async function listReviewTasksFromSupabase(): Promise<AdminReviewReadResult<ReviewTaskRow>> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return {
      rows: [],
      source: "unavailable",
      warnings: ["Supabase browser-auth read client is not configured; review_tasks persistence is not readable."]
    };
  }

  try {
    const { data, error } = await supabase
      .from("review_tasks")
      .select("id, target_type, target_id, target_local_id, title, description, status, priority, reason, created_at")
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(24);

    if (error) {
      return {
        rows: [],
        source: "unavailable",
        warnings: [readErrorMessage("review_tasks", error as SupabaseReadError)]
      };
    }

    return {
      rows: ((data ?? []) as Record<string, unknown>[])
        .map(normalizeReviewTask)
        .filter((row): row is ReviewTaskRow => Boolean(row)),
      source: "supabase",
      warnings: []
    };
  } catch (error) {
    return {
      rows: [],
      source: "unavailable",
      warnings: [`review_tasks read failed: ${sanitizeAdminError(error)}`]
    };
  }
}

async function listSourceChangeRequestsInternal(): Promise<AdminReviewReadResult<SourceChangeRequestRow>> {
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("source_change_requests")
        .select("id, source_slug, request_type, proposed_url, proposed_status, proposed_tier, rationale, status, created_at")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(24);

      if (!error) {
        const rows = ((data ?? []) as Record<string, unknown>[])
          .map(normalizeSourceChangeRequest)
          .filter((row): row is SourceChangeRequestRow => Boolean(row));

        return {
          rows,
          source: "supabase",
          warnings: []
        };
      }

      if (error) {
        return {
          rows: [],
          source: "unavailable",
          warnings: [readErrorMessage("source_change_requests", error as SupabaseReadError)]
        };
      }
    } catch (error) {
      return {
        rows: [],
        source: "unavailable",
        warnings: [`source_change_requests read failed: ${sanitizeAdminError(error)}`]
      };
    }
  }

  return {
    rows: [],
    source: "unavailable",
    warnings: ["Supabase browser-auth read client is not configured; source change requests are not readable."]
  };
}

function normalizeReviewTask(value: Record<string, unknown>): ReviewTaskRow | null {
  const id = text(value.id);
  const targetType = normalizeReviewTaskTargetType(value.target_type);
  const title = text(value.title);
  const status = normalizeReviewTaskStatus(value.status);
  const priority = normalizeReviewTaskPriority(value.priority);

  if (!id || !targetType || !title) {
    return null;
  }

  return {
    createdAt: optionalText(value.created_at),
    description: text(value.description) || "No description recorded.",
    id,
    priority,
    reason: optionalText(value.reason),
    source: "supabase",
    status,
    targetId: optionalText(value.target_id),
    targetLocalId: optionalText(value.target_local_id),
    targetType,
    title
  };
}

function normalizeSourceChangeRequest(value: Record<string, unknown>): SourceChangeRequestRow | null {
  const id = text(value.id);
  const requestType = normalizeSourceChangeRequestType(value.request_type);

  if (!id || !requestType) {
    return null;
  }

  return {
    createdAt: optionalText(value.created_at),
    id,
    proposedStatus: optionalText(value.proposed_status),
    proposedTier: optionalText(value.proposed_tier),
    proposedUrl: optionalText(value.proposed_url),
    rationale: text(value.rationale) || "No rationale recorded.",
    requestType,
    source: "supabase",
    sourceSlug: optionalText(value.source_slug),
    status: normalizeSourceChangeStatus(value.status)
  };
}

function isReviewableRadarItem(item: RetrievalRadarItem) {
  return item.status === "needs_review" || item.confidence < 0.55 || item.credibility_score < 0.55;
}

function mapReviewableRadarItem(
  item: RetrievalRadarItem,
  retrievalSource: RetrievalDataSource
): NeedsReviewRadarItemRow {
  return {
    confidence: item.confidence,
    credibilityScore: item.credibility_score,
    id: item.id,
    overallScore: item.overall_score,
    processedAt: item.processed_at,
    reason: reviewReason(item),
    retrievalSource,
    sourceName: item.source_name,
    status: item.status,
    title: item.title
  };
}

function reviewReason(item: RetrievalRadarItem) {
  if (item.status === "needs_review") {
    return "Understanding status is needs_review.";
  }

  if (item.credibility_score < 0.55) {
    return "Credibility score is below review threshold.";
  }

  if (item.confidence < 0.55) {
    return "Confidence is below review threshold.";
  }

  return "Manual review recommended.";
}

function compareMissingPublicUrlPriority(left: CleanedSource, right: CleanedSource) {
  const leftPriority = left.status === "needs_public_url" ? 0 : 1;
  const rightPriority = right.status === "needs_public_url" ? 0 : 1;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return right.weight - left.weight || left.name.localeCompare(right.name);
}

function readErrorMessage(tableName: string, error: SupabaseReadError) {
  if (isMissingReviewTableError(tableName, error)) {
    return `${tableName} is not available yet; apply the Phase 9.4 migration manually before persistent review reads.`;
  }

  return `${tableName} read failed: ${sanitizeAdminError(error.message)}`;
}

function isMissingReviewTableError(tableName: string, error: SupabaseReadError) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (haystack.includes(tableName.toLowerCase()) &&
      (haystack.includes("does not exist") ||
        haystack.includes("not find") ||
        haystack.includes("not found") ||
        haystack.includes("schema cache")))
  );
}

function uniqueWarnings(warnings: string[]) {
  return Array.from(new Set(warnings.filter(Boolean)));
}

function normalizeReviewTaskTargetType(value: unknown): ReviewTaskTargetType | null {
  return isOneOf(value, ["radar_item", "source", "source_change", "system"]);
}

function normalizeReviewTaskStatus(value: unknown): ReviewTaskStatus {
  return isOneOf(value, ["open", "in_review", "approved", "rejected", "deferred", "resolved"]) ?? "open";
}

function normalizeReviewTaskPriority(value: unknown): ReviewTaskPriority {
  return isOneOf(value, ["low", "normal", "high", "urgent"]) ?? "normal";
}

function normalizeSourceChangeRequestType(value: unknown): SourceChangeRequestRow["requestType"] | null {
  return isOneOf(value, ["add", "update_url", "trial", "approve", "reject", "pause", "resume"]);
}

function normalizeSourceChangeStatus(value: unknown): SourceChangeRequestRow["status"] {
  return isOneOf(value, ["open", "approved", "rejected", "deferred"]) ?? "open";
}

function isOneOf<const T extends readonly string[]>(value: unknown, options: T): T[number] | null {
  if (typeof value !== "string") {
    return null;
  }

  return options.includes(value as T[number]) ? (value as T[number]) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || undefined;
}
