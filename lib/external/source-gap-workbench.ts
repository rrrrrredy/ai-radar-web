import fs from "node:fs/promises";
import path from "node:path";

import {
  fetchLearnPromptLatestSnapshot,
  fetchLearnPromptSourceStatusSnapshot,
  learnPromptCategory,
  normalizeLearnPromptLatestPayload,
  normalizeLearnPromptSourceStatusPayload,
  selectLearnPromptDiffCandidates,
  type LearnPromptFreshness,
  type LearnPromptLatestSnapshot,
  type LearnPromptSignalProvenance,
  type LearnPromptSourceStatusSnapshot
} from "@/lib/external/learnprompt-ai-news-radar";
import { readCleanedSources } from "@/lib/ingestion/select-sources";
import type { CleanedSource, IngestionRunSummary, IngestionSourceSummary } from "@/lib/ingestion/types";
import { loadPublicRadarSnapshot } from "@/lib/retrieval/load-radar-items";
import { isSourceHealthEligible } from "@/lib/ingestion/source-health";
import type { RadarCategory } from "@/lib/understanding/types";

export type ExternalSourceGapAction =
  | "add_source"
  | "repair_existing_source"
  | "dedupe_rule_gap"
  | "entity_extraction_gap"
  | "ignore_low_trust";

export type ExternalSourceGapCandidate = {
  action: ExternalSourceGapAction;
  actionReason: string;
  aiLabel: string;
  aiScore: number;
  category: RadarCategory;
  decisionPreview: ExternalSourceGapDecisionPreview;
  externalId: string;
  id: string;
  localIngestionHealth: ExternalSourceGapLocalIngestionHealth;
  priority: number;
  provenance: LearnPromptSignalProvenance;
  publishedAt?: string;
  reason: string;
  registryMatch: ExternalSourceGapRegistryMatch;
  reviewStatus: LearnPromptSignalProvenance["review_status"];
  signals: string[];
  siteId: string;
  siteName: string;
  sourceName: string;
  sourceTier: string;
  sourceTierLabel?: string;
  sourceTierRank: number;
  title: string;
  upstreamHealth: ExternalSourceGapUpstreamHealth;
  url: string;
  usage: LearnPromptSignalProvenance["usage"];
};

export type ExternalSourceGapRegistryMatch = {
  matched: boolean;
  matchType: "name" | "host" | "none";
  sourceHealthEligible: boolean;
  sourceId?: string;
  sourceName?: string;
  status?: CleanedSource["status"];
  tier?: CleanedSource["tier"];
  crawlMethod?: string;
  url?: string;
  riskFlags: string[];
  updatedAt?: string;
};

export type ExternalSourceGapUpstreamHealth = {
  status: "ok" | "failed" | "zero_output" | "missing";
  checkedAt: string | null;
  durationMs?: number;
  error?: string | null;
  itemCount: number;
};

export type ExternalSourceGapLocalIngestionHealth = {
  status: "success" | "failed" | "skipped" | "not_matched" | "no_latest_run";
  checkedAt: string | null;
  crawlMethod?: string;
  durationMs?: number;
  error?: string;
  itemCount?: number;
  sourceId?: string;
  warnings: string[];
};

export type ExternalSourceGapDecisionPreview = {
  kind: "source_change_request" | "review_task";
  title: string;
  rationale: string;
  requestType?: "add" | "update_url" | "trial" | "pause" | "resume";
  reviewTaskTargetType: "source" | "source_change" | "system";
  sourceSlug?: string;
  proposedUrl?: string;
};

export type ExternalSourceGapWorkbench = {
  actionCounts: Record<ExternalSourceGapAction, number>;
  aiRadar: {
    generatedAt: string | null;
    radarItemCount: number;
    snapshotAvailable: boolean;
    sourceCount: number;
  };
  candidates: ExternalSourceGapCandidate[];
  generatedAt: string;
  guardrails: string[];
  learnPrompt: {
    freshness: LearnPromptFreshness;
    generatedAt: string | null;
    latestItemCount: number;
    sourceHealth: {
      failedSites: number;
      okSites: number;
      totalSites: number;
      zeroOutputSites: number;
    };
  };
  readinessCounts: {
    decisionPreviews: number;
    localFailures: number;
    registryMatches: number;
    upstreamFailures: number;
  };
  baselineBlocked: boolean;
  parameters: {
    allowStale: boolean;
    limit: number;
    minAiScore: number;
  };
  staleBlocked: boolean;
  warnings: string[];
};

type PublicSnapshotItem = {
  source_name?: string;
  title?: string;
  url?: string;
};

type PublicSnapshot = {
  generated_at?: string;
  radar_items?: PublicSnapshotItem[];
};

const defaultLimit = 20;
const defaultMinAiScore = 0.9;
const defaultLocalLearnPromptDir = path.join(process.cwd(), "data", "external", "learnprompt-ai-news-radar");
const latestIngestionRunPath = path.join(process.cwd(), "data", "ingestion", "latest", "ingestion-run.json");

export async function loadExternalSourceGapWorkbench(options: {
  allowStale?: boolean;
  baseUrl?: string;
  learnPromptDir?: string;
  limit?: number;
  minAiScore?: number;
  now?: Date;
  snapshotFile?: string;
} = {}): Promise<ExternalSourceGapWorkbench> {
  const now = options.now ?? new Date();
  const warnings: string[] = [];
  const [learnPrompt, snapshot, localIngestionRun] = await Promise.all([
    loadLearnPromptSourceGapInputs(options, now, warnings),
    loadAiRadarPublicSnapshot(options.snapshotFile, warnings),
    readLatestIngestionRun()
  ]);
  const sourceRegistry = readCleanedSources();

  return buildExternalSourceGapWorkbench({
    allowStale: options.allowStale,
    latest: learnPrompt.latest,
    localIngestionRun,
    limit: options.limit,
    minAiScore: options.minAiScore,
    now,
    sourceRegistry,
    snapshot: snapshot.snapshot,
    snapshotAvailable: snapshot.available,
    sourceStatus: learnPrompt.sourceStatus,
    warnings
  });
}

export function buildExternalSourceGapWorkbench({
  allowStale = false,
  latest,
  localIngestionRun = null,
  limit = defaultLimit,
  minAiScore = defaultMinAiScore,
  now = new Date(),
  sourceRegistry = [],
  snapshot,
  snapshotAvailable = Array.isArray(snapshot.radar_items),
  sourceStatus,
  warnings = []
}: {
  allowStale?: boolean;
  latest: LearnPromptLatestSnapshot;
  localIngestionRun?: IngestionRunSummary | null;
  limit?: number;
  minAiScore?: number;
  now?: Date;
  sourceRegistry?: CleanedSource[];
  snapshot: PublicSnapshot;
  snapshotAvailable?: boolean;
  sourceStatus: LearnPromptSourceStatusSnapshot;
  warnings?: string[];
}): ExternalSourceGapWorkbench {
  const radarItems = Array.isArray(snapshot.radar_items) ? snapshot.radar_items : [];
  const sourceIndex = buildSnapshotSourceIndex(radarItems);
  const registryIndex = buildRegistrySourceIndex(sourceRegistry);
  const ingestionIndex = buildLocalIngestionIndex(localIngestionRun);
  const staleBlocked = latest.freshness.isStale && !allowStale;
  const baselineBlocked = !snapshotAvailable;
  const rawCandidates = staleBlocked || baselineBlocked
    ? []
    : selectLearnPromptDiffCandidates(latest, radarItems, {
        limit,
        minAiScore
      });
  const candidates = rawCandidates.map((candidate) =>
    toExternalSourceGapCandidate(candidate, {
      ingestionIndex,
      registryIndex,
      sourceIndex,
      sourceStatus
    })
  );

  return {
    actionCounts: actionCounts(candidates),
    aiRadar: {
      generatedAt: text(snapshot.generated_at) || null,
      radarItemCount: radarItems.length,
      snapshotAvailable,
      sourceCount: sourceIndex.sourceNames.size
    },
    baselineBlocked,
    candidates,
    generatedAt: now.toISOString(),
    guardrails: [
      "External signals are source-repair candidates only.",
      "The workbench performs no Supabase writes and publishes no content.",
      "Stale or suspicious-future LearnPrompt data is blocked unless explicitly allowed for diagnostics.",
      "Default public radar and entity surfaces must not display external_unreviewed items as AI Radar claims."
    ],
    learnPrompt: {
      freshness: latest.freshness,
      generatedAt: latest.generated_at,
      latestItemCount: latest.items.length,
      sourceHealth: {
        failedSites: sourceStatus.failed_sites,
        okSites: sourceStatus.successful_sites,
        totalSites: sourceStatus.sites.length,
        zeroOutputSites: sourceStatus.zero_item_sites
      }
    },
    readinessCounts: readinessCounts(candidates),
    parameters: {
      allowStale,
      limit,
      minAiScore
    },
    staleBlocked,
    warnings: [
      ...warnings,
      ...(baselineBlocked
        ? ["AI Radar public snapshot baseline is unavailable; missing-signal candidates are suppressed."]
        : []),
      ...(staleBlocked
        ? ["LearnPrompt latest data is stale or has a suspicious future timestamp; normal missing-signal candidates are suppressed."]
        : [])
    ]
  };
}

async function loadLearnPromptSourceGapInputs(
  options: { baseUrl?: string; learnPromptDir?: string },
  now: Date,
  warnings: string[]
) {
  const envDir = process.env.LEARNPROMPT_AI_NEWS_RADAR_DATA_DIR?.trim();
  const localDir = options.learnPromptDir ?? envDir ?? defaultLocalLearnPromptDir;
  const local = await readLocalLearnPromptInputs(localDir, now);

  if (local) {
    return local;
  }

  if (options.learnPromptDir || envDir) {
    warnings.push(`LearnPrompt local data directory was not readable: ${localDir}`);
  }

  try {
    const baseUrl = options.baseUrl ?? process.env.LEARNPROMPT_AI_NEWS_RADAR_BASE_URL;
    const [latest, sourceStatus] = await Promise.all([
      fetchLearnPromptLatestSnapshot({ baseUrl, now }),
      fetchLearnPromptSourceStatusSnapshot({ baseUrl, now })
    ]);

    return {
      latest,
      sourceStatus
    };
  } catch (error) {
    warnings.push(`LearnPrompt public JSON could not be loaded: ${errorMessage(error)}`);
    return {
      latest: normalizeLearnPromptLatestPayload({ generated_at: null, items: [] }, now),
      sourceStatus: normalizeLearnPromptSourceStatusPayload({ generated_at: null, sites: [] }, now)
    };
  }
}

async function readLocalLearnPromptInputs(localDir: string, now: Date) {
  try {
    const [latest, sourceStatus] = await Promise.all([
      readJson(path.join(localDir, "latest-24h.json")),
      readJson(path.join(localDir, "source-status.json"))
    ]);

    return {
      latest: normalizeLearnPromptLatestPayload(latest, now),
      sourceStatus: normalizeLearnPromptSourceStatusPayload(sourceStatus, now)
    };
  } catch {
    return null;
  }
}

async function loadAiRadarPublicSnapshot(
  snapshotFile: string | undefined,
  warnings: string[]
): Promise<{ available: boolean; snapshot: PublicSnapshot }> {
  if (snapshotFile) {
    try {
      const parsed = await readJson(path.resolve(snapshotFile));
      const snapshot = record(parsed) as PublicSnapshot;
      return {
        available: Array.isArray(snapshot.radar_items),
        snapshot
      };
    } catch (error) {
      warnings.push(`AI Radar public snapshot file could not be loaded: ${errorMessage(error)}`);
      return {
        available: false,
        snapshot: {}
      };
    }
  }

  const snapshot = await loadPublicRadarSnapshot({ preferLocal: true });
  if (!snapshot) {
    warnings.push("AI Radar public snapshot was not available; source-gap matching baseline is blocked.");
    return {
      available: false,
      snapshot: {}
    };
  }

  return {
    available: Array.isArray(snapshot.radar_items),
    snapshot: snapshot as PublicSnapshot
  };
}

function toExternalSourceGapCandidate(
  candidate: ReturnType<typeof selectLearnPromptDiffCandidates>[number],
  context: {
    ingestionIndex: ReturnType<typeof buildLocalIngestionIndex>;
    registryIndex: ReturnType<typeof buildRegistrySourceIndex>;
    sourceIndex: ReturnType<typeof buildSnapshotSourceIndex>;
    sourceStatus: LearnPromptSourceStatusSnapshot;
  }
): ExternalSourceGapCandidate {
  const item = candidate.item;
  const registryMatch = registryMatchForItem(item, context.registryIndex);
  const upstreamHealth = upstreamHealthForItem(item.site_id, context.sourceStatus);
  const localIngestionHealth = localIngestionHealthForMatch(registryMatch, context.ingestionIndex);
  const action = classifyAction(item, context.sourceIndex, registryMatch);
  const decisionPreview = decisionPreviewForAction(action, item, registryMatch, upstreamHealth, localIngestionHealth);

  return {
    action,
    actionReason: actionReason(action, item.source, item.url, context.sourceIndex, registryMatch),
    aiLabel: item.ai_label,
    aiScore: item.ai_score,
    category: learnPromptCategory(item.ai_label),
    decisionPreview,
    externalId: item.external_id,
    id: item.id,
    localIngestionHealth,
    priority: candidate.priority,
    provenance: candidate.provenance,
    publishedAt: item.published_at ?? item.first_seen_at ?? item.last_seen_at,
    reason: candidate.reason,
    registryMatch,
    reviewStatus: candidate.provenance.review_status,
    signals: item.ai_signals.slice(0, 8),
    siteId: item.site_id,
    siteName: item.site_name,
    sourceName: item.source,
    sourceTier: item.source_tier,
    sourceTierLabel: item.source_tier_label,
    sourceTierRank: item.source_tier_rank,
    title: item.title,
    upstreamHealth,
    url: item.url,
    usage: candidate.provenance.usage
  };
}

function classifyAction(
  item: { ai_label: string; ai_score: number; source: string; site_name: string; source_tier_rank: number; url: string },
  sourceIndex: ReturnType<typeof buildSnapshotSourceIndex>,
  registryMatch: ExternalSourceGapRegistryMatch
): ExternalSourceGapAction {
  const sourceKnown = sourceIndex.sourceNames.has(normalizeKey(item.source)) || sourceIndex.sourceNames.has(normalizeKey(item.site_name));
  const hostKnown = sourceIndex.hosts.has(hostKey(item.url));

  if (sourceKnown && hostKnown) {
    return "dedupe_rule_gap";
  }

  if (sourceKnown || registryMatch.matched) {
    if (item.ai_label === "ai_general" && item.source_tier_rank <= 1) {
      return "entity_extraction_gap";
    }

    return "repair_existing_source";
  }

  if (hostKnown) {
    return "dedupe_rule_gap";
  }

  if (item.ai_label === "ai_general" && item.source_tier_rank <= 1) {
    return "add_source";
  }

  if (item.source_tier_rank > 1 && item.ai_score < 0.95) {
    return "ignore_low_trust";
  }

  return "add_source";
}

function actionReason(
  action: ExternalSourceGapAction,
  sourceName: string,
  url: string,
  sourceIndex: ReturnType<typeof buildSnapshotSourceIndex>,
  registryMatch: ExternalSourceGapRegistryMatch
) {
  const host = hostKey(url);

  switch (action) {
    case "add_source":
      return "No matching source or host is present in the current public snapshot baseline; treat this as a source-intake review before any ingestion or evidence claim.";
    case "repair_existing_source":
      return registryMatch.matched
        ? `${registryMatch.sourceName ?? sourceName} exists in the source registry but this high-score item is missing; inspect crawl freshness, parser coverage, and source health before creating a repair task.`
        : `${sourceName} appears in the current public snapshot baseline, but this high-score item is missing; inspect crawl freshness and parser coverage.`;
    case "dedupe_rule_gap":
      return `${host || sourceName} appears covered, but this item did not match by normalized URL or source-title pair; inspect dedupe and URL canonicalization.`;
    case "entity_extraction_gap":
      return "The source is already known and high-trust, but the upstream label is broad; inspect entity/category extraction before any source-repair task is promoted.";
    case "ignore_low_trust":
      return "The item is high-score but not from an official/high-trust source tier; keep as watchlist unless corroborated.";
    default:
      return sourceIndex.sourceNames.size > 0 ? "Review source-gap classification." : "Review against an empty source baseline.";
  }
}

function actionCounts(candidates: ExternalSourceGapCandidate[]) {
  const counts: Record<ExternalSourceGapAction, number> = {
    add_source: 0,
    dedupe_rule_gap: 0,
    entity_extraction_gap: 0,
    ignore_low_trust: 0,
    repair_existing_source: 0
  };

  for (const candidate of candidates) {
    counts[candidate.action] += 1;
  }

  return counts;
}

function readinessCounts(candidates: ExternalSourceGapCandidate[]) {
  return {
    decisionPreviews: candidates.filter((candidate) => Boolean(candidate.decisionPreview.title)).length,
    localFailures: candidates.filter((candidate) => candidate.localIngestionHealth.status === "failed").length,
    registryMatches: candidates.filter((candidate) => candidate.registryMatch.matched).length,
    upstreamFailures: candidates.filter((candidate) =>
      candidate.upstreamHealth.status === "failed" || candidate.upstreamHealth.status === "zero_output"
    ).length
  };
}

function buildSnapshotSourceIndex(items: PublicSnapshotItem[]) {
  const sourceNames = new Set<string>();
  const hosts = new Set<string>();

  for (const item of items) {
    const sourceName = normalizeKey(item.source_name);
    const host = hostKey(item.url);
    if (sourceName) {
      sourceNames.add(sourceName);
    }
    if (host) {
      hosts.add(host);
    }
  }

  return {
    hosts,
    sourceNames
  };
}

function buildRegistrySourceIndex(sources: CleanedSource[]) {
  const byName = new Map<string, CleanedSource>();
  const byHost = new Map<string, CleanedSource>();

  for (const source of sources) {
    for (const name of [source.name, source.name_en, source.id]) {
      const key = normalizeKey(name);
      if (key && !byName.has(key)) {
        byName.set(key, source);
      }
    }

    for (const url of [source.url, source.rss_url, source.github_url, source.youtube_url, source.podcast_url]) {
      const host = hostKey(url);
      if (host && !byHost.has(host)) {
        byHost.set(host, source);
      }
    }
  }

  return {
    byHost,
    byName
  };
}

function buildLocalIngestionIndex(run: IngestionRunSummary | null) {
  return {
    checkedAt: run?.ended_at ?? null,
    sourceResults: new Map((run?.source_results ?? []).map((result) => [result.source_id, result]))
  };
}

function registryMatchForItem(
  item: { source: string; site_name: string; url: string },
  registryIndex: ReturnType<typeof buildRegistrySourceIndex>
): ExternalSourceGapRegistryMatch {
  const nameMatch = [item.source, item.site_name]
    .map((value) => registryIndex.byName.get(normalizeKey(value)))
    .find(Boolean);
  const hostMatch = registryIndex.byHost.get(hostKey(item.url));
  const source = nameMatch ?? hostMatch;

  if (!source) {
    return {
      matched: false,
      matchType: "none",
      riskFlags: [],
      sourceHealthEligible: false
    };
  }

  return {
    crawlMethod: source.crawl_method,
    matched: true,
    matchType: nameMatch ? "name" : "host",
    riskFlags: source.risk_flags,
    sourceHealthEligible: isSourceHealthEligible(source),
    sourceId: source.id,
    sourceName: source.name,
    status: source.status,
    tier: source.tier,
    updatedAt: source.updated_at,
    url: source.url ?? undefined
  };
}

function upstreamHealthForItem(siteId: string, sourceStatus: LearnPromptSourceStatusSnapshot): ExternalSourceGapUpstreamHealth {
  const site = sourceStatus.sites.find((candidate) => candidate.site_id === siteId);
  if (!site) {
    return {
      checkedAt: sourceStatus.generated_at,
      itemCount: 0,
      status: "missing"
    };
  }

  return {
    checkedAt: sourceStatus.generated_at,
    durationMs: site.duration_ms,
    error: site.error,
    itemCount: site.item_count,
    status: site.ok ? (site.item_count > 0 ? "ok" : "zero_output") : "failed"
  };
}

function localIngestionHealthForMatch(
  registryMatch: ExternalSourceGapRegistryMatch,
  ingestionIndex: ReturnType<typeof buildLocalIngestionIndex>
): ExternalSourceGapLocalIngestionHealth {
  if (!ingestionIndex.checkedAt) {
    return {
      checkedAt: null,
      status: "no_latest_run",
      warnings: []
    };
  }

  if (!registryMatch.sourceId) {
    return {
      checkedAt: ingestionIndex.checkedAt,
      status: "not_matched",
      warnings: []
    };
  }

  const result = ingestionIndex.sourceResults.get(registryMatch.sourceId);
  if (!result) {
    return {
      checkedAt: ingestionIndex.checkedAt,
      sourceId: registryMatch.sourceId,
      status: "not_matched",
      warnings: []
    };
  }

  return {
    checkedAt: ingestionIndex.checkedAt,
    crawlMethod: result.crawl_method,
    durationMs: result.duration_ms,
    error: result.error_message,
    itemCount: result.item_count,
    sourceId: result.source_id,
    status: localHealthStatus(result),
    warnings: result.warnings
  };
}

function localHealthStatus(result: IngestionSourceSummary): ExternalSourceGapLocalIngestionHealth["status"] {
  if (result.status === "success") return "success";
  if (result.status === "failed") return "failed";
  return "skipped";
}

function decisionPreviewForAction(
  action: ExternalSourceGapAction,
  item: { source: string; title: string; url: string },
  registryMatch: ExternalSourceGapRegistryMatch,
  upstreamHealth: ExternalSourceGapUpstreamHealth,
  localIngestionHealth: ExternalSourceGapLocalIngestionHealth
): ExternalSourceGapDecisionPreview {
  const sourceLabel = registryMatch.sourceName ?? item.source;

  switch (action) {
    case "add_source":
      return {
        kind: "source_change_request",
        proposedUrl: item.url,
        rationale: `External public signal suggests ${item.source} may need source-intake review. Upstream health: ${upstreamHealth.status}. This is not approval to add the source.`,
        requestType: "trial",
        reviewTaskTargetType: "source_change",
        title: `Review trial source intake for ${item.source}`
      };
    case "repair_existing_source":
      return {
        kind: "review_task",
        rationale: `${sourceLabel} is known but missed "${item.title}". Local ingestion status: ${localIngestionHealth.status}; upstream health: ${upstreamHealth.status}.`,
        reviewTaskTargetType: "source",
        sourceSlug: registryMatch.sourceId,
        title: `Repair source coverage for ${sourceLabel}`
      };
    case "dedupe_rule_gap":
      return {
        kind: "review_task",
        rationale: `The source or host appears covered, but "${item.title}" did not match by normalized URL/source-title. Review canonicalization and title aliasing.`,
        reviewTaskTargetType: "system",
        sourceSlug: registryMatch.sourceId,
        title: "Review dedupe and canonical URL rules"
      };
    case "entity_extraction_gap":
      return {
        kind: "review_task",
        rationale: `Known-source broad AI signal needs entity/category extraction review before any source-repair promotion: "${item.title}".`,
        reviewTaskTargetType: "system",
        sourceSlug: registryMatch.sourceId,
        title: "Review entity extraction for external signal"
      };
    case "ignore_low_trust":
      return {
        kind: "review_task",
        rationale: `Keep on watchlist until corroborated by official or higher-trust sources: "${item.title}".`,
        reviewTaskTargetType: "system",
        title: "Dismiss or watch low-trust external signal"
      };
  }
}

async function readLatestIngestionRun() {
  try {
    const parsed = await readJson(latestIngestionRunPath);
    return isIngestionRunSummary(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isIngestionRunSummary(value: unknown): value is IngestionRunSummary {
  const row = record(value);
  return typeof row.id === "string" && Array.isArray(row.source_results);
}

async function readJson(file: string) {
  return JSON.parse(await fs.readFile(file, "utf8")) as unknown;
}

function hostKey(value: unknown) {
  try {
    return new URL(text(value)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeKey(value: unknown) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
