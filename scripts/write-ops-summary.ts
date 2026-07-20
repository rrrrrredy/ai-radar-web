import "@/lib/config/load-cli-env";

import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { loadPublicDataCompletenessSummary } from "@/lib/data-completeness/public-summary";
import { buildEventLayer } from "@/lib/events/clustering";
import { loadRadarFeed } from "@/lib/radar/feed";

type StepOutcome = "success" | "failure" | "cancelled" | "skipped" | "not_run";

type StepOutcomes = {
  validation: StepOutcome;
  activation: StepOutcome;
  events_cluster: StepOutcome;
  cloudflare_build: StepOutcome;
  cloudflare_deploy: StepOutcome;
};

type CliOptions = {
  stage: "before" | "after";
  runId: string;
  mode: "mock" | "live";
  persist: boolean;
  deployCloudflare: boolean;
  runEventsCluster: boolean;
  cloudflareUrl?: string;
  outputDir: string;
  writeGateSatisfied: boolean;
  outcomes: StepOutcomes;
  warnings: string[];
  errors: string[];
};

type OpsCounts = {
  raw_items: number | null;
  radar_items: number | null;
  public_radar_items: number | null;
  included: number | null;
  needs_review: number | null;
  excluded: number | null;
  failed: number | null;
};

type ActivationSummary = {
  run_id?: string;
  totals?: {
    chunks_attempted?: number;
    chunks_succeeded?: number;
    chunks_failed?: number;
    raw_items?: number;
    radar_items?: number;
    included?: number;
    needs_review?: number;
    excluded?: number;
    failed?: number;
    deepseek_api_calls?: number;
  };
  failure_families?: Record<string, number>;
  warnings?: string[];
};

const latestOpsDir = path.join(process.cwd(), "data", "ops", "latest");
const beforeCountsPath = path.join(latestOpsDir, "before-counts.json");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.outputDir, { recursive: true });

  const collectionWarnings: string[] = [];
  const counts = await safeResult("Coverage counts", loadCounts, emptyOpsCounts(), collectionWarnings);
  if (options.stage === "before") {
    await writeJson(beforeCountsPath, counts);
  }

  const rawBeforeCounts = options.stage === "after"
    ? await safeResult(
        "Before counts",
        () => readOptionalJson<OpsCounts>(beforeCountsPath),
        null,
        collectionWarnings
      )
    : counts;
  const beforeCounts = rawBeforeCounts ? normalizeOpsCounts(rawBeforeCounts) : null;
  const activation = await safeResult(
    "Activation summary",
    () => readOptionalJson<ActivationSummary>(path.join(process.cwd(), "data", "activation", "latest", "summary.json")),
    null,
    collectionWarnings
  );
  const coverage = await safeResult<Awaited<ReturnType<typeof loadPublicDataCompletenessSummary>> | null>(
    "Coverage summary",
    loadPublicDataCompletenessSummary,
    null,
    collectionWarnings
  );
  const eventClusters = await safeResult("Event cluster count", eventClusterCount, 0, collectionWarnings);
  const failureFamilies = safeCountMap(activation?.failure_families ?? coverage?.failureFamilies ?? {});
  const warnings = uniqueStrings([
    ...options.warnings,
    ...collectionWarnings,
    ...stringArray(activation?.warnings),
    ...stringArray(coverage?.warnings)
  ]).map(sanitizeLogValue);
  const outcomeErrors = Object.entries(options.outcomes)
    .filter(([, outcome]) => outcome === "failure" || outcome === "cancelled")
    .map(([step, outcome]) => `Step ${step} finished with outcome ${outcome}.`);
  const errors = uniqueStrings([...options.errors, ...outcomeErrors]).map(sanitizeLogValue);
  const summary = sanitizeArtifact({
    schema_version: 1,
    generated_at: new Date().toISOString(),
    run_id: options.runId,
    stage: options.stage,
    mode: options.mode,
    persist: options.persist,
    deploy_cloudflare: options.deployCloudflare,
    run_events_cluster: options.runEventsCluster,
    counts: {
      before: beforeCounts,
      after: counts
    },
    status_counts: {
      included: counts.included,
      needs_review: counts.needs_review,
      excluded: counts.excluded,
      failed: counts.failed
    },
    chunks: {
      attempted: integer(activation?.totals?.chunks_attempted),
      succeeded: integer(activation?.totals?.chunks_succeeded),
      failed: integer(activation?.totals?.chunks_failed)
    },
    deepseek_api_calls: integer(activation?.totals?.deepseek_api_calls),
    failure_families: failureFamilies,
    event_clusters: eventClusters,
    source_problem_counts: {
      timeout: failureFamilies.timeout ?? 0,
      "403": failureFamilies["403"] ?? 0,
      rate_limit: failureFamilies.rate_limit ?? 0
    },
    step_outcomes: options.outcomes,
    cloudflare_url:
      options.deployCloudflare && options.outcomes.cloudflare_deploy === "success"
        ? options.cloudflareUrl ?? "https://ai-industry-radar.pages.dev"
        : null,
    warnings,
    errors,
    safety: {
      supabase_writes_requested: options.persist,
      write_gate_satisfied: options.writeGateSatisfied,
      writes_enabled_for_persist_steps: options.persist && options.writeGateSatisfied,
      event_cluster_persist_requested: options.persist && options.runEventsCluster,
      scheduled_jobs_run: false,
      x_wechat_auto_crawl_run: false,
      source_health_writes_run: false,
      secrets_printed: false,
      summary_redaction_applied: true
    }
  });
  const jsonPath = path.join(options.outputDir, "radar-refresh-summary.json");
  const markdownPath = path.join(options.outputDir, "radar-refresh-summary.md");
  const markdown = renderMarkdown(summary);

  assertNoConfiguredSecrets(`${JSON.stringify(summary)}\n${markdown}`);

  await writeJson(jsonPath, summary);
  await fs.writeFile(markdownPath, markdown, "utf8");

  console.log(`Ops summary written: ${relative(jsonPath)} ${relative(markdownPath)}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    deployCloudflare: false,
    errors: [],
    mode: "mock",
    outcomes: {
      activation: "not_run",
      cloudflare_build: "not_run",
      cloudflare_deploy: "not_run",
      events_cluster: "not_run",
      validation: "not_run"
    },
    outputDir: latestOpsDir,
    persist: false,
    runEventsCluster: false,
    runId: process.env.GITHUB_RUN_ID ? `github_${process.env.GITHUB_RUN_ID}` : `local_${timestampForId(new Date().toISOString())}`,
    stage: "after",
    warnings: [],
    writeGateSatisfied: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--stage":
        options.stage = stage(readArg(args, index));
        index += 1;
        break;
      case "--run-id":
        options.runId = sanitizeIdentifier(readArg(args, index));
        index += 1;
        break;
      case "--mode":
        options.mode = mode(readArg(args, index));
        index += 1;
        break;
      case "--persist":
        options.persist = booleanValue(readArg(args, index));
        index += 1;
        break;
      case "--deploy-cloudflare":
        options.deployCloudflare = booleanValue(readArg(args, index));
        index += 1;
        break;
      case "--run-events-cluster":
        options.runEventsCluster = booleanValue(readArg(args, index));
        index += 1;
        break;
      case "--write-gate-satisfied":
        options.writeGateSatisfied = booleanValue(readArg(args, index));
        index += 1;
        break;
      case "--validation-outcome":
        options.outcomes.validation = stepOutcome(readArg(args, index));
        index += 1;
        break;
      case "--activation-outcome":
        options.outcomes.activation = stepOutcome(readArg(args, index));
        index += 1;
        break;
      case "--events-cluster-outcome":
        options.outcomes.events_cluster = stepOutcome(readArg(args, index));
        index += 1;
        break;
      case "--cloudflare-build-outcome":
        options.outcomes.cloudflare_build = stepOutcome(readArg(args, index));
        index += 1;
        break;
      case "--cloudflare-deploy-outcome":
        options.outcomes.cloudflare_deploy = stepOutcome(readArg(args, index));
        index += 1;
        break;
      case "--cloudflare-url":
        options.cloudflareUrl = publicHttpsUrl(readArg(args, index));
        index += 1;
        break;
      case "--output-dir":
        options.outputDir = path.resolve(readArg(args, index));
        index += 1;
        break;
      case "--warning":
        options.warnings.push(readArg(args, index));
        index += 1;
        break;
      case "--error":
        options.errors.push(readArg(args, index));
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.writeGateSatisfied && !options.persist) {
    throw new Error("--write-gate-satisfied=true is only valid when --persist=true.");
  }

  return options;
}

async function loadCounts(): Promise<OpsCounts> {
  const firstRead = await loadPublicDataCompletenessSummary();
  const coverage = coverageCountsAreConsistent(firstRead)
    ? firstRead
    : await loadPublicDataCompletenessSummary();

  if (!coverageCountsAreConsistent(coverage)) {
    throw new Error("Coverage counts remain internally inconsistent after one retry.");
  }

  return {
    excluded: coverage.excluded,
    failed: coverage.failedRadarItems,
    included: coverage.included,
    needs_review: coverage.needsReview,
    public_radar_items: coverage.publicRadarItems,
    radar_items: coverage.radarItems,
    raw_items: coverage.rawItems
  };
}

function coverageCountsAreConsistent(
  coverage: Awaited<ReturnType<typeof loadPublicDataCompletenessSummary>>
) {
  const publicCount = coverage.publicRadarItems;
  const radarCount = coverage.radarItems;
  if (publicCount !== null && publicCount > 0 && (radarCount === null || radarCount < publicCount)) {
    return false;
  }

  const statusCounts = [coverage.included, coverage.needsReview, coverage.excluded, coverage.failedRadarItems];
  if (radarCount !== null && statusCounts.every((count): count is number => count !== null)) {
    return statusCounts.reduce((sum, count) => sum + count, 0) === radarCount;
  }

  return true;
}

function emptyOpsCounts(): OpsCounts {
  return {
    excluded: null,
    failed: null,
    included: null,
    needs_review: null,
    public_radar_items: null,
    radar_items: null,
    raw_items: null
  };
}

function normalizeOpsCounts(value: OpsCounts): OpsCounts {
  return {
    excluded: nullableInteger(value.excluded),
    failed: nullableInteger(value.failed),
    included: nullableInteger(value.included),
    needs_review: nullableInteger(value.needs_review),
    public_radar_items: nullableInteger(value.public_radar_items),
    radar_items: nullableInteger(value.radar_items),
    raw_items: nullableInteger(value.raw_items)
  };
}

async function eventClusterCount() {
  const feed = await loadRadarFeed();
  return buildEventLayer(
    feed.items.map((item) => ({
      categories: item.categories,
      collected_at: item.collected_at,
      confidence: item.confidence,
      entities: item.entities,
      evidence_notes: item.evidence_notes,
      id: item.id,
      language: item.language,
      processed_at: item.processed_at,
      published_at: item.published_at,
      scores: {
        ai_relevance: item.ai_relevance_score,
        credibility: item.credibility_score,
        freshness: item.freshness_score,
        importance: item.importance_score,
        novelty: item.novelty_score,
        overall: item.overall_score
      },
      source_name: item.source_name,
      source_tier: item.source_tier,
      status: item.status,
      summary_en: item.summary_en,
      summary_zh: item.summary_zh,
      tags: item.tags,
      title: item.title,
      url: item.url,
      why_it_matters: item.why_it_matters
    }))
  ).event_count;
}

function renderMarkdown(summary: Awaited<ReturnType<typeof main>> extends never ? never : Record<string, unknown>) {
  const value = summary as {
    generated_at: string;
    run_id: string;
    mode: string;
    persist: boolean;
    deploy_cloudflare: boolean;
    run_events_cluster: boolean;
    counts: { before: OpsCounts | null; after: OpsCounts };
    status_counts: Record<string, number | null>;
    chunks: Record<string, number>;
    deepseek_api_calls: number;
    event_clusters: number;
    failure_families: Record<string, number>;
    step_outcomes: StepOutcomes;
    cloudflare_url: string | null;
    warnings: string[];
    errors: string[];
    safety: {
      supabase_writes_requested: boolean;
      write_gate_satisfied: boolean;
      writes_enabled_for_persist_steps: boolean;
      event_cluster_persist_requested: boolean;
      summary_redaction_applied: boolean;
    };
  };

  return [
    "# Radar Refresh Ops Summary",
    "",
    `Generated: ${value.generated_at}`,
    `Run id: ${value.run_id}`,
    `Mode: ${value.mode}`,
    `Persist: ${yesNo(value.persist)}`,
    `Deploy Cloudflare: ${yesNo(value.deploy_cloudflare)}`,
    `Run event clustering: ${yesNo(value.run_events_cluster)}`,
    "",
    "## Counts",
    "",
    `- Raw items before/after: ${formatNullable(value.counts.before?.raw_items ?? null)} / ${formatNullable(value.counts.after.raw_items)}`,
    `- Radar items before/after: ${formatNullable(value.counts.before?.radar_items ?? null)} / ${formatNullable(value.counts.after.radar_items)}`,
    `- Public radar items before/after: ${formatNullable(value.counts.before?.public_radar_items ?? null)} / ${formatNullable(value.counts.after.public_radar_items)}`,
    `- Included / needs_review / excluded / failed: ${formatNullable(value.status_counts.included)} / ${formatNullable(value.status_counts.needs_review)} / ${formatNullable(value.status_counts.excluded)} / ${formatNullable(value.status_counts.failed)}`,
    "",
    "## Run",
    "",
    `- Chunks attempted/succeeded/failed: ${value.chunks.attempted} / ${value.chunks.succeeded} / ${value.chunks.failed}`,
    `- DeepSeek API calls: ${value.deepseek_api_calls}`,
    `- Failure families: ${formatDistribution(value.failure_families)}`,
    `- Event clusters: ${value.event_clusters}`,
    "",
    "## Step Outcomes",
    "",
    `- Validation: ${value.step_outcomes.validation}`,
    `- Activation: ${value.step_outcomes.activation}`,
    `- Event clustering: ${value.step_outcomes.events_cluster}`,
    `- Cloudflare build: ${value.step_outcomes.cloudflare_build}`,
    `- Cloudflare deploy: ${value.step_outcomes.cloudflare_deploy}`,
    "",
    "## Cloudflare",
    "",
    `- URL: ${value.cloudflare_url ?? "not deployed"}`,
    "",
    "## Safety",
    "",
    `- Supabase writes requested: ${yesNo(value.safety.supabase_writes_requested)}`,
    `- Write gate satisfied: ${yesNo(value.safety.write_gate_satisfied)}`,
    `- Writes enabled for persist steps: ${yesNo(value.safety.writes_enabled_for_persist_steps)}`,
    `- Event cluster persistence requested: ${yesNo(value.safety.event_cluster_persist_requested)}`,
    `- Summary redaction applied: ${yesNo(value.safety.summary_redaction_applied)}`,
    "",
    "## Warnings",
    "",
    value.warnings.length > 0 ? value.warnings.map((warning) => `- ${warning}`).join("\n") : "- None.",
    "",
    "## Errors",
    "",
    value.errors.length > 0 ? value.errors.map((error) => `- ${error}`).join("\n") : "- None.",
    ""
  ].join("\n");
}

async function readOptionalJson<T>(filePath: string): Promise<T | null> {
  if (!fsSync.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readArg(args: string[], index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${args[index]} requires a value.`);
  }

  return value;
}

function stage(value: string): CliOptions["stage"] {
  if (value === "before" || value === "after") {
    return value;
  }

  throw new Error("--stage must be before or after.");
}

function mode(value: string): CliOptions["mode"] {
  if (value === "mock" || value === "live") {
    return value;
  }

  throw new Error("--mode must be mock or live.");
}

function booleanValue(value: string) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("Boolean options must be true or false.");
}

function stepOutcome(value: string): StepOutcome {
  if (value === "success" || value === "failure" || value === "cancelled" || value === "skipped" || value === "not_run") {
    return value;
  }

  throw new Error("Step outcomes must be success, failure, cancelled, skipped, or not_run.");
}

function publicHttpsUrl(value: string) {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("--cloudflare-url must be a valid HTTPS URL.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !parsed.hostname
  ) {
    throw new Error("--cloudflare-url must be an HTTPS URL without credentials, query parameters, or a fragment.");
  }

  const normalized = `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  if (normalized.length > 240) {
    throw new Error("--cloudflare-url must be 240 characters or fewer.");
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(text).filter(Boolean)));
}

function integer(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return Math.floor(numberValue);
}

function nullableInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return Math.floor(numberValue);
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function formatNullable(value: number | null) {
  return value === null ? "unavailable" : String(value);
}

function formatDistribution(value: Record<string, number>) {
  const entries = Object.entries(value).filter(([, count]) => count > 0);
  return entries.length > 0 ? entries.map(([key, count]) => `${key}=${count}`).join(" ") : "none";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function relative(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function timestampForId(value: string) {
  return value.replace(/[-:.]/g, "").replace("T", "_").replace("Z", "Z");
}

function sanitizeIdentifier(value: string) {
  return value.replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 120);
}

async function safeResult<T>(
  label: string,
  operation: () => Promise<T>,
  fallback: T,
  warnings: string[]
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    warnings.push(`${label} unavailable: ${sanitizeLogValue(error instanceof Error ? error.message : String(error))}`);
    return fallback;
  }
}

function safeCountMap(value: Record<string, number>) {
  const result: Record<string, number> = {};

  for (const [rawKey, rawCount] of Object.entries(value).slice(0, 50)) {
    const key = sanitizeIdentifier(sanitizeLogValue(rawKey)) || "unknown";
    result[key] = (result[key] ?? 0) + integer(rawCount);
  }

  return result;
}

function sanitizeArtifact<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeLogValue(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeArtifact(entry)) as unknown as T;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeArtifact(entry)])
    ) as T;
  }

  return value;
}

function configuredSecrets() {
  const sensitiveName = /(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|SERVICE[_-]?ROLE|PRIVATE[_-]?KEY|ANON[_-]?KEY|ACCOUNT[_-]?ID|COOKIE|AUTH)/i;

  return Object.entries(process.env)
    .filter((entry): entry is [string, string] => sensitiveName.test(entry[0]) && typeof entry[1] === "string" && entry[1].length >= 4)
    .sort((left, right) => right[1].length - left[1].length);
}

function redactConfiguredSecrets(value: string) {
  let sanitized = value;

  for (const [, secret] of configuredSecrets()) {
    sanitized = sanitized.split(secret).join("[configured-secret-redacted]");
  }

  return sanitized;
}

function assertNoConfiguredSecrets(value: string) {
  const leaked = configuredSecrets().find(([, secret]) => value.includes(secret));
  if (leaked) {
    throw new Error(`Refusing to write ops summary because configured credential ${sanitizeIdentifier(leaked[0])} was not redacted.`);
  }
}

function sanitizeLogValue(value: string) {
  return redactConfiguredSecrets(value)
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi, "[private-key-redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/g, "[github-token-redacted]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/gi, "[github-token-redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, "[jwt-redacted]")
    .replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/@\s]+@/g, "$1[credentials-redacted]@")
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/gi, "$1?[query-redacted]")
    .replace(/\b(DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|GITHUB_TOKEN)\s*=\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/\b(authorization|api[-_]?key|token|secret|password|cookie)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/[A-Za-z0-9+/_=-]{48,}/g, "[long-token-redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

main().catch((error) => {
  console.error(sanitizeLogValue(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
