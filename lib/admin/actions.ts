"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { sanitizeAdminError } from "@/lib/admin/audit";
import {
  type CreateAdminAuditEventInput,
  type ReportPublicationStatus,
  type ReviewTaskStatus,
  validateCreateAdminAuditEventInput,
  validateCreateReportCandidateInput,
  validateCreateReviewTaskInput,
  validateCreateSourceChangeRequestInput,
  validatePublishReportCandidateInput,
  validateUpdateReportCandidateStatusInput,
  validateUpdateReviewTaskStatusInput,
  validateUpdateSourceChangeRequestStatusInput
} from "@/lib/admin/validation";
import { requireUserRole } from "@/lib/auth/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { isEnabled } from "@/lib/utils";

type AdminActionResult<T> =
  | {
      ok: true;
      data: T;
      message: string;
    }
  | {
      ok: false;
      error: string;
    };

type AdminActionContext = {
  authUserId: string;
  profileId: string;
};

type AuditInsertResult = {
  auditEventId: string;
};

const reviewPath = "/admin/review";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createReviewTask(input: unknown): Promise<AdminActionResult<{ id: string } & AuditInsertResult>> {
  const validation = validateCreateReviewTaskInput(input);

  return runAdminMutation(validation, "Review task could not be created.", async (supabase, context, value) => {
    const metadata = {
      created_from: "admin_review_action"
    };
    const { data, error } = await supabase
      .from("review_tasks")
      .insert({
        created_by: context.profileId,
        description: value.description ?? null,
        metadata,
        priority: value.priority,
        reason: value.reason ?? null,
        status: "open",
        target_id: value.targetId ?? null,
        target_local_id: value.targetLocalId ?? null,
        target_type: value.targetType,
        title: value.title
      })
      .select("id")
      .single();

    if (error || !hasTextId(data)) {
      throw new SafeActionError("Review task could not be created.");
    }

    const auditEventId = await writeAdminAuditEvent(supabase, context, {
      action: "review_task.created",
      metadata: {
        priority: value.priority,
        target_type: value.targetType
      },
      summary: `Created review task: ${value.title}`,
      targetId: data.id,
      targetLocalId: value.targetLocalId,
      targetType: "review_task"
    });

    return {
      auditEventId,
      id: data.id
    };
  });
}

export async function updateReviewTaskStatus(
  idOrInput: unknown,
  status?: unknown,
  resolutionNote?: unknown
): Promise<AdminActionResult<{ id: string; status: ReviewTaskStatus } & AuditInsertResult>> {
  const validation = validateUpdateReviewTaskStatusInput(idOrInput, status, resolutionNote);

  return runAdminMutation(validation, "Review task status could not be updated.", async (supabase, context, value) => {
    const existing = await readExistingRow(supabase, "review_tasks", value.id, "id, title, target_local_id, metadata");
    const now = new Date().toISOString();
    const terminal = isTerminalReviewTaskStatus(value.status);
    const metadata = mergeMetadata(existing.metadata, {
      last_admin_action: `status:${value.status}`,
      resolution_note: value.resolutionNote
    });
    const patch: Record<string, unknown> = {
      metadata,
      status: value.status,
      updated_at: now
    };

    if (terminal) {
      patch.resolved_at = now;
      patch.resolved_by = context.profileId;
    }

    const { data, error } = await supabase
      .from("review_tasks")
      .update(patch)
      .eq("id", value.id)
      .select("id, status")
      .single();

    if (error || !hasTextId(data) || typeof data.status !== "string") {
      throw new SafeActionError("Review task status could not be updated.");
    }

    const auditEventId = await writeAdminAuditEvent(supabase, context, {
      action: `review_task.${value.status}`,
      metadata: {
        previous_target_local_id: text(existing.target_local_id)
      },
      summary: `Updated review task to ${value.status}: ${text(existing.title) || value.id}`,
      targetId: value.id,
      targetLocalId: text(existing.target_local_id) || undefined,
      targetType: "review_task"
    });

    return {
      auditEventId,
      id: value.id,
      status: value.status
    };
  });
}

export async function createSourceChangeRequest(
  input: unknown
): Promise<AdminActionResult<{ id: string } & AuditInsertResult>> {
  const validation = validateCreateSourceChangeRequestInput(input);

  return runAdminMutation(validation, "Source change request could not be created.", async (supabase, context, value) => {
    const { data, error } = await supabase
      .from("source_change_requests")
      .insert({
        created_by: context.profileId,
        metadata: {
          created_from: "admin_review_action"
        },
        proposed_status: value.proposedStatus ?? null,
        proposed_tier: value.proposedTier ?? null,
        proposed_url: value.proposedUrl ?? null,
        rationale: value.rationale,
        request_type: value.requestType,
        source_id: value.sourceId ?? null,
        source_slug: value.sourceSlug ?? null,
        status: "open"
      })
      .select("id")
      .single();

    if (error || !hasTextId(data)) {
      throw new SafeActionError("Source change request could not be created.");
    }

    const auditEventId = await writeAdminAuditEvent(supabase, context, {
      action: "source_change_request.created",
      metadata: {
        request_type: value.requestType
      },
      summary: `Created ${value.requestType} source change request.`,
      targetId: data.id,
      targetLocalId: value.sourceSlug,
      targetType: "source_change_request"
    });

    return {
      auditEventId,
      id: data.id
    };
  });
}

export async function updateSourceChangeRequestStatus(
  idOrInput: unknown,
  status?: unknown,
  reviewNote?: unknown
): Promise<AdminActionResult<{ id: string; status: string } & AuditInsertResult>> {
  const validation = validateUpdateSourceChangeRequestStatusInput(idOrInput, status, reviewNote);

  return runAdminMutation(validation, "Source change request status could not be updated.", async (supabase, context, value) => {
    const existing = await readExistingRow(supabase, "source_change_requests", value.id, "id, source_slug, request_type, metadata");
    const now = new Date().toISOString();
    const metadata = mergeMetadata(existing.metadata, {
      last_admin_action: `status:${value.status}`,
      review_note: value.reviewNote
    });
    const { data, error } = await supabase
      .from("source_change_requests")
      .update({
        metadata,
        reviewed_at: now,
        reviewed_by: context.profileId,
        status: value.status,
        updated_at: now
      })
      .eq("id", value.id)
      .select("id, status")
      .single();

    if (error || !hasTextId(data) || typeof data.status !== "string") {
      throw new SafeActionError("Source change request status could not be updated.");
    }

    const requestType = text(existing.request_type) || "source change";
    const auditEventId = await writeAdminAuditEvent(supabase, context, {
      action: `source_change_request.${value.status}`,
      metadata: {
        request_type: requestType
      },
      summary: `Updated ${requestType} source change request to ${value.status}.`,
      targetId: value.id,
      targetLocalId: text(existing.source_slug) || undefined,
      targetType: "source_change_request"
    });

    return {
      auditEventId,
      id: value.id,
      status: value.status
    };
  });
}

export async function createReportCandidate(
  input: unknown
): Promise<AdminActionResult<{ id: string } & AuditInsertResult>> {
  const validation = validateCreateReportCandidateInput(input);

  return runAdminMutation(validation, "Report candidate could not be created.", async (supabase, context, value) => {
    const { data, error } = await supabase
      .from("report_candidates")
      .insert({
        confidence: value.confidence ?? null,
        created_by: context.profileId,
        metadata: {
          created_from: "admin_review_action"
        },
        report_type: value.reportType,
        source_item_ids: value.sourceItemIds,
        status: "needs_review",
        summary: value.summary,
        time_window_end: value.timeWindowEnd ?? null,
        time_window_start: value.timeWindowStart ?? null,
        title: value.title
      })
      .select("id")
      .single();

    if (error || !hasTextId(data)) {
      throw new SafeActionError("Report candidate could not be created.");
    }

    const auditEventId = await writeAdminAuditEvent(supabase, context, {
      action: "report_candidate.created",
      metadata: {
        report_type: value.reportType
      },
      summary: `Created report candidate: ${value.title}`,
      targetId: data.id,
      targetType: "report_candidate"
    });

    return {
      auditEventId,
      id: data.id
    };
  });
}

export async function updateReportCandidateStatus(
  idOrInput: unknown,
  status?: unknown,
  reviewNote?: unknown
): Promise<AdminActionResult<{ id: string; status: string } & AuditInsertResult>> {
  const validation = validateUpdateReportCandidateStatusInput(idOrInput, status, reviewNote);

  return runAdminMutation(validation, "Report candidate status could not be updated.", async (supabase, context, value) => {
    const existing = await readExistingRow(supabase, "report_candidates", value.id, "id, title, report_type, status, metadata");
    const currentStatus = text(existing.status);
    if (currentStatus !== "draft" && currentStatus !== "needs_review") {
      throw new SafeActionError("Only draft or needs-review report candidates can be approved, deferred, or rejected.");
    }

    const now = new Date().toISOString();
    const metadata = mergeMetadata(existing.metadata, {
      last_admin_action: `status:${value.status}`,
      review_note: value.reviewNote
    });
    const { data, error } = await supabase
      .from("report_candidates")
      .update({
        metadata,
        reviewed_at: now,
        reviewed_by: context.profileId,
        status: value.status,
        updated_at: now
      })
      .eq("id", value.id)
      .select("id, status")
      .single();

    if (error || !hasTextId(data) || typeof data.status !== "string") {
      throw new SafeActionError("Report candidate status could not be updated.");
    }

    const auditEventId = await writeAdminAuditEvent(supabase, context, {
      action: `report_candidate.${value.status}`,
      metadata: {
        report_type: text(existing.report_type)
      },
      summary: `Updated report candidate to ${value.status}: ${text(existing.title) || value.id}`,
      targetId: value.id,
      targetType: "report_candidate"
    });

    return {
      auditEventId,
      id: value.id,
      status: value.status
    };
  });
}

export async function publishReportCandidate(
  idOrInput: unknown,
  reportStatus?: unknown,
  publicationNote?: unknown
): Promise<AdminActionResult<{
  candidateId: string;
  reportId: string;
  reportStatus: ReportPublicationStatus;
  write: "created" | "updated";
} & AuditInsertResult>> {
  const validation = validatePublishReportCandidateInput(idOrInput, reportStatus, publicationNote);

  return runAdminMutation(validation, "Approved report candidate could not be saved as a report.", async (supabase, context, value) => {
    const existing = await readExistingRow(
      supabase,
      "report_candidates",
      value.id,
      "id, title, summary, report_type, time_window_start, time_window_end, source_item_ids, status, created_at, metadata"
    );
    const currentStatus = text(existing.status);
    if (currentStatus !== "approved") {
      throw new SafeActionError("Only approved report candidates can become report records.");
    }

    const reportType = reportTypeForReportsTable(existing.report_type);
    if (!reportType) {
      throw new SafeActionError("Only daily, weekly, or topic candidates can become report records.");
    }

    const now = new Date().toISOString();
    const candidateMetadata = isRecord(existing.metadata) ? existing.metadata : {};
    const draft = reportDraftRecord(candidateMetadata);
    assertReportCandidatePublishable(existing, draft);
    const timeWindow = resolveReportTimeWindow(existing, draft, now);
    const title = text(existing.title) || "Untitled report";
    const summary = text(existing.summary) || title;
    const reportMetadata = buildReportRecordMetadata({
      candidateId: value.id,
      draft,
      generatedAt: now,
      reportStatus: value.reportStatus,
      reportType,
      sourceItemIds: stringArray(existing.source_item_ids),
      summary,
      timeWindow,
      title
    });
    const reportPatch = {
      body: reportBody(draft, summary),
      created_by: context.profileId,
      language: reportLanguage(draft),
      metadata: reportMetadata,
      published_at: value.reportStatus === "published" ? now : null,
      status: value.reportStatus,
      time_window_end: timeWindow.end,
      time_window_start: timeWindow.start,
      title,
      type: reportType
    };
    const existingReportId = reportRecordId(candidateMetadata);
    const reportWrite = existingReportId
      ? await updateReportRecord(supabase, existingReportId, reportPatch)
      : await insertReportRecord(supabase, reportPatch);
    const report = reportWrite ?? (await insertReportRecord(supabase, reportPatch));
    const updatedCandidateMetadata = mergeReportCandidatePublicationMetadata(candidateMetadata, {
      note: value.publicationNote,
      reportId: report.id,
      reportStatus: value.reportStatus,
      write: report.write
    });
    const candidatePatch: Record<string, unknown> = {
      metadata: updatedCandidateMetadata,
      reviewed_at: now,
      reviewed_by: context.profileId,
      updated_at: now
    };

    if (value.reportStatus === "published") {
      candidatePatch.status = "published";
    }

    const { error: candidateError } = await supabase
      .from("report_candidates")
      .update(candidatePatch)
      .eq("id", value.id);

    if (candidateError) {
      throw new SafeActionError("Report record was saved, but candidate publication metadata could not be updated.");
    }

    const auditEventId = await writeAdminAuditEvent(supabase, context, {
      action: value.reportStatus === "published" ? "report_candidate.published" : "report_candidate.report_saved",
      metadata: {
        report_id: report.id,
        report_status: value.reportStatus,
        report_type: reportType,
        write: report.write
      },
      summary:
        value.reportStatus === "published"
          ? `Published report from approved candidate: ${title}`
          : `Saved reviewed report from approved candidate: ${title}`,
      targetId: value.id,
      targetLocalId: report.id,
      targetType: "report_candidate"
    });

    return {
      auditEventId,
      candidateId: value.id,
      reportId: report.id,
      reportStatus: value.reportStatus,
      write: report.write
    };
  });
}

export async function createAdminAuditEvent(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const validation = validateCreateAdminAuditEventInput(input);

  return runAdminMutation(validation, "Admin audit event could not be created.", async (supabase, context, value) => {
    const id = await writeAdminAuditEvent(supabase, context, value);

    return {
      id
    };
  });
}

export async function submitCreateReviewTask(formData: FormData): Promise<void> {
  await createReviewTask(formData);
}

export async function submitUpdateReviewTaskStatus(formData: FormData): Promise<void> {
  await updateReviewTaskStatus(formData);
}

export async function submitCreateSourceChangeRequest(formData: FormData): Promise<void> {
  await createSourceChangeRequest(formData);
}

export async function submitUpdateSourceChangeRequestStatus(formData: FormData): Promise<void> {
  await updateSourceChangeRequestStatus(formData);
}

export async function submitCreateReportCandidate(formData: FormData): Promise<void> {
  await createReportCandidate(formData);
}

export async function submitUpdateReportCandidateStatus(formData: FormData): Promise<void> {
  await updateReportCandidateStatus(formData);
}

export async function submitPublishReportCandidate(formData: FormData): Promise<void> {
  await publishReportCandidate(formData);
}

async function runAdminMutation<TInput, TOutput>(
  validation: { ok: true; value: TInput } | { ok: false; error: string },
  fallbackError: string,
  mutation: (supabase: SupabaseClient, context: AdminActionContext, value: TInput) => Promise<TOutput>
): Promise<AdminActionResult<TOutput>> {
  const { user } = await requireUserRole("admin", reviewPath);

  if (!validation.ok) {
    return {
      error: validation.error,
      ok: false
    };
  }

  try {
    const context = await resolveAdminActionContext(user);
    const supabase = getAdminServiceClient();
    const data = await mutation(supabase, context, validation.value);

    revalidatePath(reviewPath);

    return {
      data,
      message: "Admin review mutation completed.",
      ok: true
    };
  } catch (error) {
    return {
      error: safeActionError(error, fallbackError),
      ok: false
    };
  }
}

async function resolveAdminActionContext(user: User): Promise<AdminActionContext> {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    throw new SafeActionError("Supabase authenticated admin context is not configured.");
  }

  const { data, error } = await supabase
    .from("users_profile")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !hasTextId(data)) {
    throw new SafeActionError("Signed-in admin profile could not be resolved.");
  }

  return {
    authUserId: user.id,
    profileId: data.id
  };
}

function getAdminServiceClient() {
  if (!isEnabled(process.env.ENABLE_ADMIN_REVIEW_WRITES)) {
    throw new SafeActionError("Admin review writes require ENABLE_ADMIN_REVIEW_WRITES=true.");
  }

  try {
    return getSupabaseServiceClient();
  } catch {
    throw new SafeActionError("Admin review writes require server-side Supabase service configuration.");
  }
}

async function writeAdminAuditEvent(
  supabase: SupabaseClient,
  context: AdminActionContext,
  input: CreateAdminAuditEventInput
) {
  const { data, error } = await supabase
    .from("admin_audit_events")
    .insert({
      action: input.action,
      actor_user_id: context.profileId,
      metadata: {
        ...input.metadata,
        actor_auth_user_id: context.authUserId
      },
      summary: input.summary,
      target_id: input.targetId ?? null,
      target_local_id: input.targetLocalId ?? null,
      target_type: input.targetType
    })
    .select("id")
    .single();

  if (error || !hasTextId(data)) {
    throw new SafeActionError("Admin audit event could not be written.");
  }

  return data.id;
}

async function readExistingRow(
  supabase: SupabaseClient,
  tableName: "review_tasks" | "source_change_requests" | "report_candidates",
  id: string,
  columns: string
) {
  const { data, error } = await supabase.from(tableName).select(columns).eq("id", id).maybeSingle();

  if (error || !data) {
    throw new SafeActionError("The selected review workflow row was not found.");
  }

  return data as unknown as Record<string, unknown>;
}

type ReportRecordPatch = {
  body: string;
  created_by: string;
  language: "en" | "zh" | "bilingual";
  metadata: Record<string, unknown>;
  published_at: string | null;
  status: ReportPublicationStatus;
  time_window_end: string;
  time_window_start: string;
  title: string;
  type: "daily" | "weekly" | "topic";
};

type ReportRecordWrite = {
  id: string;
  write: "created" | "updated";
};

async function updateReportRecord(
  supabase: SupabaseClient,
  reportId: string,
  patch: ReportRecordPatch
): Promise<ReportRecordWrite | null> {
  const { data, error } = await supabase
    .from("reports")
    .update(patch)
    .eq("id", reportId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new SafeActionError("Existing report record could not be updated.");
  }

  if (!hasTextId(data)) {
    return null;
  }

  return {
    id: data.id,
    write: "updated"
  };
}

async function insertReportRecord(
  supabase: SupabaseClient,
  patch: ReportRecordPatch
): Promise<ReportRecordWrite> {
  const { data, error } = await supabase
    .from("reports")
    .insert(patch)
    .select("id")
    .single();

  if (error || !hasTextId(data)) {
    throw new SafeActionError("Report record could not be created.");
  }

  return {
    id: data.id,
    write: "created"
  };
}

function buildReportRecordMetadata({
  candidateId,
  draft,
  generatedAt,
  reportStatus,
  reportType,
  sourceItemIds,
  summary,
  timeWindow,
  title
}: {
  candidateId: string;
  draft: Record<string, unknown>;
  generatedAt: string;
  reportStatus: ReportPublicationStatus;
  reportType: "daily" | "weekly" | "topic";
  sourceItemIds: string[];
  summary: string;
  timeWindow: { start: string; end: string };
  title: string;
}) {
  const modelMetadata = isRecord(draft.model_metadata) ? draft.model_metadata : {};
  const reportDraft = {
    ...draft,
    executive_summary: text(draft.executive_summary) || summary,
    generated_at: text(draft.generated_at) || generatedAt,
    language: reportLanguage(draft),
    mode: "saved_report",
    model_metadata: {
      ...modelMetadata,
      mode: "saved_report"
    },
    one_sentence_summary: text(draft.one_sentence_summary) || summary,
    report_type: reportType,
    source_item_ids: sourceItemIds,
    status: reportStatus,
    time_window: {
      end: timeWindow.end,
      explanation: "Saved report record produced from an approved report candidate.",
      matched_phrase: "approved report candidate",
      start: timeWindow.start
    },
    title
  };

  return {
    report_draft: reportDraft,
    source_report_candidate_id: candidateId
  };
}

function mergeReportCandidatePublicationMetadata(
  existing: Record<string, unknown>,
  publication: {
    note?: string;
    reportId: string;
    reportStatus: ReportPublicationStatus;
    write: "created" | "updated";
  }
) {
  return {
    ...existing,
    last_admin_action: `report:${publication.reportStatus}`,
    publication: {
      note: publication.note,
      report_id: publication.reportId,
      report_status: publication.reportStatus,
      updated_at: new Date().toISOString(),
      write: publication.write
    },
    report_record_id: publication.reportId
  };
}

function resolveReportTimeWindow(
  candidate: Record<string, unknown>,
  draft: Record<string, unknown>,
  now: string
) {
  const draftWindow = isRecord(draft.time_window) ? draft.time_window : {};
  const start = isoDate(candidate.time_window_start) ?? isoDate(draftWindow.start) ?? isoDate(candidate.created_at) ?? now;
  let end = isoDate(candidate.time_window_end) ?? isoDate(draftWindow.end) ?? now;

  if (Date.parse(start) > Date.parse(end)) {
    end = start;
  }

  return { end, start };
}

function reportDraftRecord(metadata: Record<string, unknown>) {
  return isRecord(metadata.report_draft) ? metadata.report_draft : {};
}

function reportRecordId(metadata: Record<string, unknown>) {
  const id = text(metadata.report_record_id);
  return uuidPattern.test(id) ? id : undefined;
}

function reportTypeForReportsTable(value: unknown): "daily" | "weekly" | "topic" | null {
  const normalized = text(value);
  if (normalized === "daily" || normalized === "weekly" || normalized === "topic") {
    return normalized;
  }

  return null;
}

function reportLanguage(draft: Record<string, unknown>): "en" | "zh" | "bilingual" {
  const language = text(draft.language);
  if (language === "en") {
    return "en";
  }

  if (language === "bilingual" || language === "mixed") {
    return "bilingual";
  }

  return "zh";
}

function reportBody(draft: Record<string, unknown>, summary: string) {
  return text(draft.markdown) || text(draft.executive_summary) || text(draft.one_sentence_summary) || summary;
}

function assertReportCandidatePublishable(existing: Record<string, unknown>, draft: Record<string, unknown>) {
  const blockers: string[] = [];
  const qualityGate = isRecord(draft.quality_gate) ? draft.quality_gate : {};
  const sourceItemCount = stringArray(existing.source_item_ids).length;
  const citationCount = positiveInteger(draft.citation_count) ?? (Array.isArray(draft.citations) ? draft.citations.length : 0);
  const usableItemCount = positiveInteger(draft.usable_item_count);
  const distinctSourceCount = positiveInteger(draft.distinct_source_count);
  const missingEvidence = stringArray(draft.missing_evidence);
  const qualityGatePassed = draft.quality_gate_passed !== false && qualityGate.passed !== false;

  if (sourceItemCount === 0) {
    blockers.push("source items are missing");
  }

  if (usableItemCount === undefined || usableItemCount === 0) {
    blockers.push("usable item count is missing");
  }

  if (citationCount === 0) {
    blockers.push("citations are missing");
  }

  if (distinctSourceCount === undefined || distinctSourceCount === 0) {
    blockers.push("distinct source count is missing");
  }

  if (missingEvidence.length > 0) {
    blockers.push("missing evidence remains unresolved");
  }

  if (!qualityGatePassed) {
    blockers.push("quality gate has not passed");
  }

  if (blockers.length > 0) {
    throw new SafeActionError(`Report candidate is not ready for publication: ${blockers.join("; ")}.`);
  }
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(text).filter(Boolean))).slice(0, 48);
}

function positiveInteger(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return undefined;
  }

  return Math.floor(numberValue);
}

function isoDate(value: unknown) {
  const normalized = text(value);
  if (!normalized) {
    return undefined;
  }

  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString();
}

function isTerminalReviewTaskStatus(status: ReviewTaskStatus) {
  return status === "approved" || status === "rejected" || status === "deferred" || status === "resolved";
}

function mergeMetadata(existing: unknown, patch: Record<string, string | undefined>) {
  const current = isRecord(existing) ? existing : {};
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
  );

  return {
    ...current,
    ...cleanPatch
  };
}

function safeActionError(error: unknown, fallback: string) {
  if (error instanceof SafeActionError) {
    return error.message;
  }

  const sanitized = sanitizeAdminError(error);
  if (!sanitized) {
    return fallback;
  }

  return `${fallback} ${sanitized}`;
}

function hasTextId(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

class SafeActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeActionError";
  }
}
