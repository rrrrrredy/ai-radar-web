import fs from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

type CheckResult = {
  ok: boolean;
  allowedStatus?: number;
  forbiddenStatus?: number;
  forbiddenEvidenceStatus?: number;
  forbiddenModelMetadataStatus?: number;
  selectAllStatus?: number;
  rowReturned?: boolean;
  allowedKeys?: string[];
  selectAllKeys?: string[];
  entityKeys?: string[];
  forbiddenRejected?: boolean;
  forbiddenEvidenceRejected?: boolean;
  forbiddenModelMetadataRejected?: boolean;
  forbiddenCode?: string;
  forbiddenEvidenceCode?: string;
  forbiddenModelMetadataCode?: string;
  wrongDomainTableStatuses?: Record<string, number>;
  wrongDomainTablesRejected?: boolean;
  reason?: string;
};

async function main() {
  const env = {
    ...loadEnvFile(".env.local"),
    ...process.env
  };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    printResult({ ok: false, reason: "missing_public_supabase_env" });
    process.exit(1);
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(url);
  } catch {
    printResult({ ok: false, reason: "invalid_public_supabase_url" });
    process.exit(1);
  }

  const headers = {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`
  };

  try {
    const allowed = await requestJson(baseUrl, "public_radar_items?select=id,local_id,entities&limit=1", headers);
    const forbidden = await requestJson(baseUrl, "public_radar_items?select=raw_item_id&limit=1", headers);
    const forbiddenEvidence = await requestJson(baseUrl, "public_radar_items?select=evidence_notes&limit=1", headers);
    const forbiddenModelMetadata = await requestJson(
      baseUrl,
      "public_radar_items?select=model_metadata&limit=1",
      headers
    );
    const selectAll = await requestJson(baseUrl, "public_radar_items?select=*&limit=1", headers);
    const wrongDomainChecks = await Promise.all(
      wrongDomainTables.map(async (table) => [
        table,
        await requestJson(baseUrl, `${table}?select=*&limit=1`, headers)
      ] as const)
    );
    const wrongDomainTableStatuses = Object.fromEntries(
      wrongDomainChecks.map(([table, result]) => [table, result.status])
    );
    const wrongDomainTablesRejected = wrongDomainChecks.every(([, result]) => !result.ok);
    const first = Array.isArray(allowed.body) ? allowed.body[0] : null;
    const selectAllFirst = Array.isArray(selectAll.body) ? selectAll.body[0] : null;
    const allowedKeys = isRecord(first) ? Object.keys(first).sort() : [];
    const selectAllKeys = isRecord(selectAllFirst) ? Object.keys(selectAllFirst).sort() : [];
    const entities = isRecord(first) ? first.entities : null;
    const firstEntity = Array.isArray(entities) ? entities.find(isRecord) : null;
    const entityKeys = isRecord(firstEntity) ? Object.keys(firstEntity).sort() : [];
    const ok =
      allowed.ok &&
      selectAll.ok &&
      !forbidden.ok &&
      !forbiddenEvidence.ok &&
      !forbiddenModelMetadata.ok &&
      wrongDomainTablesRejected &&
      sameStringSet(allowedKeys, ["entities", "id", "local_id"]) &&
      sameStringSet(selectAllKeys, publicRadarItemAllowedKeys) &&
      (entityKeys.length === 0 || sameStringSet(entityKeys, ["confidence", "name", "type"]));

    printResult({
      ok,
      allowedStatus: allowed.status,
      forbiddenStatus: forbidden.status,
      forbiddenEvidenceStatus: forbiddenEvidence.status,
      forbiddenModelMetadataStatus: forbiddenModelMetadata.status,
      selectAllStatus: selectAll.status,
      rowReturned: Array.isArray(allowed.body) && allowed.body.length > 0,
      allowedKeys,
      selectAllKeys,
      entityKeys,
      forbiddenRejected: !forbidden.ok,
      forbiddenEvidenceRejected: !forbiddenEvidence.ok,
      forbiddenModelMetadataRejected: !forbiddenModelMetadata.ok,
      wrongDomainTableStatuses,
      wrongDomainTablesRejected,
      forbiddenCode: isRecord(forbidden.body) ? text(forbidden.body.code) : undefined,
      forbiddenEvidenceCode: isRecord(forbiddenEvidence.body) ? text(forbiddenEvidence.body.code) : undefined,
      forbiddenModelMetadataCode: isRecord(forbiddenModelMetadata.body)
        ? text(forbiddenModelMetadata.body.code)
        : undefined
    });
    process.exit(ok ? 0 : 1);
  } catch (error) {
    printResult({
      ok: false,
      reason: error instanceof Error ? safeErrorReason(error) : "unknown_public_contract_check_error"
    });
    process.exit(1);
  }
}

function loadEnvFile(file: string) {
  const envPath = path.join(process.cwd(), file);
  const values: Record<string, string> = {};

  if (!fs.existsSync(envPath)) {
    return values;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }

  return values;
}

async function requestJson(baseUrl: URL, queryPath: string, headers: Record<string, string>) {
  const requestUrl = new URL(`/rest/v1/${queryPath}`, baseUrl);
  const response = await fetch(requestUrl, { headers });
  const textBody = await response.text();
  let body: unknown = textBody;

  try {
    body = JSON.parse(textBody);
  } catch {
    body = textBody;
  }

  return {
    body,
    ok: response.ok,
    status: response.status
  };
}

function printResult(result: CheckResult) {
  console.log(JSON.stringify(result, null, 2));
}

function safeErrorReason(error: Error) {
  const message = error.message.toLowerCase();
  const cause = error.cause instanceof Error ? error.cause.message.toLowerCase() : "";
  const combined = `${message} ${cause}`;

  if (combined.includes("enotfound")) {
    return "supabase_project_host_dns_not_found";
  }
  if (combined.includes("econnrefused")) {
    return "supabase_project_connection_refused";
  }
  if (combined.includes("timed") || combined.includes("timeout")) {
    return "supabase_project_connection_timeout";
  }

  return "supabase_public_contract_request_failed";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

const publicRadarItemAllowedKeys = [
  "ai_relevance_score",
  "categories",
  "collected_at",
  "confidence",
  "created_at",
  "credibility_score",
  "entities",
  "exclusion_reason",
  "freshness_score",
  "id",
  "importance_score",
  "language",
  "local_id",
  "novelty_score",
  "overall_score",
  "processed_at",
  "published_at",
  "source_id",
  "source_name",
  "source_tier",
  "source_weight",
  "status",
  "summary_en",
  "summary_zh",
  "tags",
  "title",
  "topics",
  "understanding_status",
  "updated_at",
  "url",
  "why_it_matters"
].sort();

const wrongDomainTables = [
  "radar_models",
  "radar_model_versions",
  "radar_external_metrics",
  "radar_deepseek_metrics",
  "radar_source_gated_signals",
  "radar_pulse_snapshots",
  "radar_leaderboard_snapshots",
  "radar_admin_review_items",
  "radar_audit_events",
  "radar_refresh_runs",
  "radar_companies",
  "radar_deferred_surfaces"
] as const;

function sameStringSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

main().catch((error) => {
  printResult({
    ok: false,
    reason: error instanceof Error ? safeErrorReason(error) : "unknown_public_contract_check_error"
  });
  process.exit(1);
});
