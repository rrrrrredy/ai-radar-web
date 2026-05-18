import "server-only";

import { cache } from "react";

import { requireUserRole } from "@/lib/auth/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AdminReviewReadSource = "supabase" | "local_preview" | "unavailable";

export type AdminReviewReadResult<T> = {
  rows: T[];
  source: AdminReviewReadSource;
  warnings: string[];
};

export type AdminAuditEventRow = {
  id: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetLocalId?: string;
  summary: string;
  createdAt?: string;
  source: AdminReviewReadSource;
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

export async function listRecentAuditEvents(limit = 8): Promise<AdminReviewReadResult<AdminAuditEventRow>> {
  await ensureAdminReviewAccess();

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return {
      rows: buildAuditEventPreview(),
      source: "local_preview",
      warnings: ["Supabase browser-auth read client is not configured; showing local audit preview rows."]
    };
  }

  try {
    const { data, error } = await supabase
      .from("admin_audit_events")
      .select("id, action, target_type, target_id, target_local_id, summary, created_at")
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      return auditFallback(error as SupabaseReadError);
    }

    const rows = (data ?? [])
      .map(normalizeAuditEvent)
      .filter((row): row is AdminAuditEventRow => Boolean(row));

    if (rows.length > 0) {
      return {
        rows,
        source: "supabase",
        warnings: []
      };
    }

    return {
      rows: buildAuditEventPreview(),
      source: "local_preview",
      warnings: ["No persisted admin audit events were readable; showing preview rows only."]
    };
  } catch (error) {
    return {
      rows: buildAuditEventPreview(),
      source: "local_preview",
      warnings: [
        `Admin audit event read failed; showing preview rows only: ${sanitizeAdminError(error)}`
      ]
    };
  }
}

export function buildAuditEventPreview(): AdminAuditEventRow[] {
  return [
    {
      action: "review_workflow_foundation_added",
      createdAt: "2026-05-14T00:05:00.000Z",
      id: "preview-audit-review-foundation",
      source: "local_preview",
      summary: "Local preview row. Persistent admin audit events start after the migration is applied and controlled writes are approved.",
      targetLocalId: "phase-9-4",
      targetType: "system"
    },
    {
      action: "write_actions_gated",
      createdAt: "2026-05-14T00:05:00.000Z",
      id: "preview-audit-write-gate",
      source: "local_preview",
      summary: "Approve, reject, publish, and source-change writes remain disabled in the browser for this phase.",
      targetLocalId: "review-actions",
      targetType: "system"
    }
  ];
}

export function sanitizeAdminError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 400);
}

function auditFallback(error: SupabaseReadError): AdminReviewReadResult<AdminAuditEventRow> {
  const reason = isMissingReviewTableError(error)
    ? "admin_audit_events is not available yet; apply the Phase 9.4 migration manually before persistent audit reads."
    : `Admin audit event read failed; showing preview rows only: ${sanitizeAdminError(error.message)}`;

  return {
    rows: buildAuditEventPreview(),
    source: "local_preview",
    warnings: [reason]
  };
}

function normalizeAuditEvent(value: Record<string, unknown>): AdminAuditEventRow | null {
  const id = text(value.id);
  const action = text(value.action);
  const targetType = text(value.target_type);

  if (!id || !action || !targetType) {
    return null;
  }

  return {
    action,
    createdAt: optionalText(value.created_at),
    id,
    source: "supabase",
    summary: text(value.summary) || "No audit summary recorded.",
    targetId: optionalText(value.target_id),
    targetLocalId: optionalText(value.target_local_id),
    targetType
  };
}

function isMissingReviewTableError(error: SupabaseReadError) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (haystack.includes("admin_audit_events") &&
      (haystack.includes("does not exist") ||
        haystack.includes("not find") ||
        haystack.includes("not found") ||
        haystack.includes("schema cache")))
  );
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || undefined;
}
