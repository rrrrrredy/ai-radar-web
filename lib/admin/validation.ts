import "server-only";

export const reviewTaskStatuses = ["open", "in_review", "approved", "rejected", "deferred", "resolved"] as const;
export const reviewTaskPriorities = ["low", "normal", "high", "urgent"] as const;
export const reviewTaskTargetTypes = ["radar_item", "source", "source_change", "system"] as const;
export const sourceChangeRequestTypes = ["add", "update_url", "trial", "approve", "reject", "pause", "resume"] as const;
export const sourceChangeRequestStatuses = ["open", "approved", "rejected", "deferred"] as const;
export const sourceChangeReviewStatuses = ["approved", "rejected", "deferred"] as const;
export const sourceStatuses = ["active", "trial", "paused", "rejected", "needs_public_url", "deferred", "monitor"] as const;
export const sourceTiers = ["T1", "T1.5", "T2", "T3", "unreviewed"] as const;
export const auditTargetTypes = [
  "review_task",
  "source_change_request",
  "radar_item",
  "source",
  "system",
  "admin_audit_event"
] as const;

export type ReviewTaskStatus = (typeof reviewTaskStatuses)[number];
export type ReviewTaskPriority = (typeof reviewTaskPriorities)[number];
export type ReviewTaskTargetType = (typeof reviewTaskTargetTypes)[number];
export type SourceChangeRequestType = (typeof sourceChangeRequestTypes)[number];
export type SourceChangeRequestStatus = (typeof sourceChangeRequestStatuses)[number];
export type SourceChangeReviewStatus = (typeof sourceChangeReviewStatuses)[number];
export type AuditTargetType = (typeof auditTargetTypes)[number];

export type CreateReviewTaskInput = {
  targetType: ReviewTaskTargetType;
  targetId?: string;
  targetLocalId?: string;
  title: string;
  description?: string;
  priority: ReviewTaskPriority;
  reason?: string;
};

export type UpdateReviewTaskStatusInput = {
  id: string;
  status: ReviewTaskStatus;
  resolutionNote?: string;
};

export type CreateSourceChangeRequestInput = {
  sourceId?: string;
  sourceSlug?: string;
  requestType: SourceChangeRequestType;
  proposedUrl?: string;
  proposedStatus?: (typeof sourceStatuses)[number];
  proposedTier?: (typeof sourceTiers)[number];
  rationale: string;
};

export type UpdateSourceChangeRequestStatusInput = {
  id: string;
  status: SourceChangeReviewStatus;
  reviewNote?: string;
};

export type CreateAdminAuditEventInput = {
  action: string;
  targetType: AuditTargetType;
  targetId?: string;
  targetLocalId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export type AdminValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: string;
    };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actionPattern = /^[a-z0-9_.:-]{3,80}$/;

export function validateCreateReviewTaskInput(input: unknown): AdminValidationResult<CreateReviewTaskInput> {
  const record = inputRecord(input);
  const targetType = enumValue(record.targetType ?? record.target_type, reviewTaskTargetTypes);
  const targetId = optionalUuid(record.targetId ?? record.target_id);
  const targetLocalId = optionalText(record.targetLocalId ?? record.target_local_id, 160);
  const title = requiredText(record.title, 160, "Review task title");
  const description = optionalText(record.description, 800);
  const priority = enumValue(record.priority, reviewTaskPriorities) ?? "normal";
  const reason = optionalText(record.reason, 500);

  if (!targetType) {
    return failure("Select a valid review target type.");
  }

  if (targetId === null) {
    return failure("Review target id must be a valid UUID.");
  }

  if (!title.ok) {
    return title;
  }

  return {
    ok: true,
    value: {
      description,
      priority,
      reason,
      targetId: targetId ?? undefined,
      targetLocalId,
      targetType,
      title: title.value
    }
  };
}

export function validateUpdateReviewTaskStatusInput(
  idOrInput: unknown,
  status?: unknown,
  resolutionNote?: unknown
): AdminValidationResult<UpdateReviewTaskStatusInput> {
  const record = isStructuredInput(idOrInput)
    ? inputRecord(idOrInput)
    : {
        id: idOrInput,
        resolutionNote,
        status
      };
  const id = requiredUuid(record.id);
  const normalizedStatus = enumValue(record.status, reviewTaskStatuses);
  const note = optionalText(record.resolutionNote ?? record.resolution_note, 500);

  if (!id.ok) {
    return id;
  }

  if (!normalizedStatus) {
    return failure("Select a valid review task status.");
  }

  return {
    ok: true,
    value: {
      id: id.value,
      resolutionNote: note,
      status: normalizedStatus
    }
  };
}

export function validateCreateSourceChangeRequestInput(
  input: unknown
): AdminValidationResult<CreateSourceChangeRequestInput> {
  const record = inputRecord(input);
  const sourceId = optionalUuid(record.sourceId ?? record.source_id);
  const sourceSlug = optionalSlug(record.sourceSlug ?? record.source_slug);
  const requestType = enumValue(record.requestType ?? record.request_type, sourceChangeRequestTypes);
  const proposedUrl = optionalPublicUrl(record.proposedUrl ?? record.proposed_url);
  const proposedStatus = enumValue(record.proposedStatus ?? record.proposed_status, sourceStatuses);
  const proposedTier = enumValue(record.proposedTier ?? record.proposed_tier, sourceTiers);
  const rationale = requiredText(record.rationale, 800, "Source change rationale");

  if (sourceId === null) {
    return failure("Source id must be a valid UUID.");
  }

  if (!requestType) {
    return failure("Select a valid source change request type.");
  }

  if (!rationale.ok) {
    return rationale;
  }

  if (proposedUrl === null) {
    return failure("Proposed URL must be a public http or https URL.");
  }

  if (requestType !== "add" && !sourceId && !sourceSlug) {
    return failure("Link the source change request to a source id or source slug.");
  }

  if (requestType === "update_url" && !proposedUrl) {
    return failure("A public proposed URL is required for URL update requests.");
  }

  return {
    ok: true,
    value: {
      proposedStatus: proposedStatus ?? undefined,
      proposedTier: proposedTier ?? undefined,
      proposedUrl: proposedUrl ?? undefined,
      rationale: rationale.value,
      requestType,
      sourceId: sourceId ?? undefined,
      sourceSlug
    }
  };
}

export function validateUpdateSourceChangeRequestStatusInput(
  idOrInput: unknown,
  status?: unknown,
  reviewNote?: unknown
): AdminValidationResult<UpdateSourceChangeRequestStatusInput> {
  const record = isStructuredInput(idOrInput)
    ? inputRecord(idOrInput)
    : {
        id: idOrInput,
        reviewNote,
        status
      };
  const id = requiredUuid(record.id);
  const normalizedStatus = enumValue(record.status, sourceChangeReviewStatuses);
  const note = optionalText(record.reviewNote ?? record.review_note, 500);

  if (!id.ok) {
    return id;
  }

  if (!normalizedStatus) {
    return failure("Select approve, reject, or defer for the source change request.");
  }

  return {
    ok: true,
    value: {
      id: id.value,
      reviewNote: note,
      status: normalizedStatus
    }
  };
}

export function validateCreateAdminAuditEventInput(input: unknown): AdminValidationResult<CreateAdminAuditEventInput> {
  const record = inputRecord(input);
  const action = optionalText(record.action, 80);
  const targetType = enumValue(record.targetType ?? record.target_type, auditTargetTypes);
  const targetId = optionalUuid(record.targetId ?? record.target_id);
  const targetLocalId = optionalText(record.targetLocalId ?? record.target_local_id, 160);
  const summary = requiredText(record.summary, 800, "Audit event summary");
  const metadata = sanitizeMetadata(record.metadata);

  if (!action || !actionPattern.test(action)) {
    return failure("Audit action must use lowercase letters, numbers, dots, colons, underscores, or hyphens.");
  }

  if (!targetType) {
    return failure("Select a valid audit target type.");
  }

  if (targetId === null) {
    return failure("Audit target id must be a valid UUID.");
  }

  if (!summary.ok) {
    return summary;
  }

  return {
    ok: true,
    value: {
      action,
      metadata,
      summary: summary.value,
      targetId: targetId ?? undefined,
      targetLocalId,
      targetType
    }
  };
}

export function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [optionalText(key, 80), sanitizeMetadataValue(item)] as const)
      .filter((entry): entry is readonly [string, string | number | boolean | string[]] =>
        Boolean(entry[0]) && entry[1] !== undefined
      )
      .slice(0, 16)
  );
}

function sanitizeMetadataValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    return optionalText(value, 240);
  }

  if (Array.isArray(value)) {
    return value.map((item) => optionalText(item, 160)).filter(Boolean).slice(0, 16);
  }

  return undefined;
}

function inputRecord(input: unknown): Record<string, unknown> {
  if (isFormData(input)) {
    const record: Record<string, string> = {};

    for (const [key, value] of input.entries()) {
      if (typeof value === "string") {
        record[key] = value;
      }
    }

    return record;
  }

  return isPlainRecord(input) ? input : {};
}

function isStructuredInput(input: unknown) {
  return isFormData(input) || isPlainRecord(input);
}

function isFormData(input: unknown): input is FormData {
  return typeof FormData !== "undefined" && input instanceof FormData;
}

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function enumValue<const T extends readonly string[]>(value: unknown, options: T): T[number] | null {
  const textValue = optionalText(value, 120);
  if (!textValue) {
    return null;
  }

  return options.includes(textValue as T[number]) ? (textValue as T[number]) : null;
}

function requiredText(value: unknown, maxLength: number, label: string): AdminValidationResult<string> {
  const normalized = optionalText(value, maxLength);

  if (!normalized || normalized.length < 3) {
    return failure(`${label} must be at least 3 characters.`);
  }

  return {
    ok: true,
    value: normalized
  };
}

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

  return normalized || undefined;
}

function optionalSlug(value: unknown) {
  const normalized = optionalText(value, 120);
  if (!normalized) {
    return undefined;
  }

  return normalized.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 120) || undefined;
}

function requiredUuid(value: unknown): AdminValidationResult<string> {
  const normalized = optionalText(value, 80);

  if (!normalized || !uuidPattern.test(normalized)) {
    return failure("A valid row id is required.");
  }

  return {
    ok: true,
    value: normalized
  };
}

function optionalUuid(value: unknown) {
  const normalized = optionalText(value, 80);
  if (!normalized) {
    return undefined;
  }

  return uuidPattern.test(normalized) ? normalized : null;
}

function optionalPublicUrl(value: unknown) {
  const normalized = optionalText(value, 2048);
  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

function failure(error: string): AdminValidationResult<never> {
  return {
    error,
    ok: false
  };
}
