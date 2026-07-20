import "@/lib/config/load-cli-env";

import dns from "node:dns/promises";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadPublicDataCompletenessSummary,
  type PublicDataCompletenessSummary
} from "@/lib/data-completeness/public-summary";
import {
  buildEventLayer,
  filterPublicDisplayEventLayer,
  sourceFamilyForEvent,
  type PublicEventLayer,
  type PublicEventCluster,
  type PublicEventClusterItem,
  type PublicTimelineEntry
} from "@/lib/events/clustering";
import { buildRadarFeed } from "@/lib/radar/feed";
import { isExternalSourceRepairSignal } from "@/lib/radar/public-source-boundary";
import { publicInternetHttpUrl } from "@/lib/public-url";
import { loadRadarItems } from "@/lib/retrieval/load-radar-items";
import type {
  RetrievalDataSource,
  RetrievalLanguage,
  RetrievalRadarItem
} from "@/lib/retrieval/types";
import { getSupabaseServerReadClient } from "@/lib/supabase/server-read";
import { getSupabasePublicConfig } from "@/lib/config";
import {
  ENTITY_TYPES,
  RADAR_CATEGORIES,
  type RadarCategory,
  type UnderstandingEntity,
  type UnderstandingEntityType,
  type UnderstandingStatus
} from "@/lib/understanding/types";

const cloudflareUrl = "https://ai-industry-radar.pages.dev";
const outputPath = path.join(process.cwd(), "dist", "cloudflare-pages", "data", "radar-snapshot.json");
const radarLimit = 500;
const publicEntityTypes = new Set<string>(ENTITY_TYPES);

type SnapshotSourceKind = "supabase_public_views" | "local_files";

export type PublicRadarSnapshotItem = {
  id: string;
  title: string;
  url: string;
  source_name: string;
  source_family?: string;
  status: UnderstandingStatus;
  language: RetrievalLanguage;
  published_at?: string;
  collected_at: string;
  processed_at: string;
  summary_zh?: string;
  summary_en?: string;
  categories: RadarCategory[];
  tags: string[];
  source_tier: string;
  confidence: number;
  scores: {
    ai_relevance: number;
    credibility: number;
    freshness: number;
    importance: number;
    novelty: number;
    overall: number;
  };
  why_it_matters?: string;
  entities: PublicRadarSnapshotEntity[];
};

export type PublicRadarSnapshotEntity = {
  name: string;
  type: UnderstandingEntityType;
  confidence: number;
};

type CountEntry = {
  label: string;
  count: number;
};

type PublicSnapshotCountsInput = {
  public_radar_items: number | null;
  latest_ingestion: string | null;
  latest_understanding: string | null;
  warnings: string[];
};

export type PublicMirrorSnapshot = {
  schema_version: 1;
  generated_at: string;
  public_site: {
    purpose: string;
    cloudflare_url: string;
    read_only: true;
  };
  source: {
    kind: SnapshotSourceKind;
    data_source: string;
    local_data_used: boolean;
    warnings: string[];
  };
  freshness: {
    latest_timestamp: string | null;
    latest_timestamp_source: string | null;
    latest_ingestion: string | null;
    latest_understanding: string | null;
    note: string;
  };
  counts: {
    public_radar_items: number | null;
    visible_radar_items: number;
    snapshot_radar_items: number;
    included: number;
    needs_review: number;
    excluded: number;
    failed: number;
    citations: number;
    event_clusters: number;
  };
  coverage: {
    label: "public snapshot";
    sources_total: number;
    automated_eligible_sources: number;
    attempted_sources: number;
    fetched_sources: number;
    failed_sources: number;
    skipped_sources: number;
    sources_with_public_items: number | null;
    public_radar_items: number | null;
    latest_refresh: string | null;
    radar_to_public_visibility: number | null;
    source_public_visibility: number | null;
    failure_families: Record<string, number>;
    failed_source_reasons: Record<string, number>;
    skipped_source_reasons: Record<string, number>;
  };
  top_categories: CountEntry[];
  top_sources: CountEntry[];
  top_source_tiers: CountEntry[];
  event_clusters: PublicEventCluster[];
  event_cluster_items: PublicEventClusterItem[];
  event_count: number;
  curated_events: PublicEventCluster[];
  timeline: PublicTimelineEntry[];
  source_health_summary: {
    succeeded: number;
    failed: number;
    timeout: number;
    "403": number;
    rate_limit: number;
    no_items: number;
    duplicate_only: number;
    manual_blocked: number;
    unsupported_source: number;
    low_relevance_excluded: number;
  };
  source_health_scope: {
    started_at: string | null;
    finished_at: string | null;
    attempted_sources: number;
  };
  source_health_by_family: Array<{
    family: string;
    configured: number;
    automated_eligible: number;
    attempted: number;
    skipped: number;
    succeeded: number;
    failed: number;
    timeout: number;
    "403": number;
    rate_limit: number;
    no_items: number;
    duplicate_only: number;
    manual_blocked: number;
    unsupported_source: number;
    low_relevance_excluded: number;
  }>;
  source_health_failures: Array<{
    source_slug: string;
    source_name: string;
    source_family: string;
    reason: string;
  }>;
  failure_family_summary: Record<string, number>;
  data_completeness_summary: {
    sources_total: number;
    automated_eligible_sources: number;
    attempted_sources: number;
    fetched_sources: number;
    failed_sources: number;
    blocked_manual_sources: number;
    sources_with_public_items: number | null;
    public_radar_items: number | null;
    radar_to_public_visibility: number | null;
    source_public_visibility: number | null;
  };
  radar_items: PublicRadarSnapshotItem[];
  caveats: string[];
};

type SupabaseRadarRead = {
  count: number;
  items: PublicRadarSnapshotItem[];
  warnings: string[];
};

type SupabaseReadError = {
  code?: string;
  details?: string;
  hint?: string;
  message: string;
};

type SupabaseRadarRow = Record<string, unknown>;

function debugStep(message: string) {
  if (process.env.CLOUDFLARE_SNAPSHOT_DEBUG === "true") {
    console.error(`[cloudflare:snapshot] ${message}`);
    const debugFile = process.env.CLOUDFLARE_SNAPSHOT_DEBUG_FILE;
    if (debugFile) {
      fsSync.appendFileSync(debugFile, `[${new Date().toISOString()}] ${message}\n`, "utf8");
    }
  }
}

async function main() {
  debugStep("main:start");
  const snapshot = await createPublicSnapshot();
  assertStrictProductionSnapshot(snapshot);
  debugStep(`main:snapshot-ready rows=${snapshot.radar_items.length}`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(
    [
      "Cloudflare public snapshot written:",
      path.relative(process.cwd(), outputPath),
      `source=${snapshot.source.data_source}`,
      `visibleRows=${snapshot.counts.visible_radar_items}`,
      `snapshotRows=${snapshot.counts.snapshot_radar_items}`
    ].join(" ")
  );
}

async function createPublicSnapshot(): Promise<PublicMirrorSnapshot> {
  const generatedAt = new Date().toISOString();
  const strictSupabaseExport = process.env.CLOUDFLARE_SNAPSHOT_REQUIRE_SUPABASE === "true";
  debugStep("create:start");

  if (process.env.CLOUDFLARE_SNAPSHOT_READ_SUPABASE !== "true") {
    if (strictSupabaseExport) {
      throw new Error("Production snapshot export requires Supabase public reads to be enabled.");
    }

    debugStep("create:local-first");
    const warnings = [
      "Cloudflare static snapshot export used public-safe local snapshot mode; set CLOUDFLARE_SNAPSHOT_READ_SUPABASE=true to opt into Supabase public reads."
    ];
    const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, warnings);
    if (previousSnapshot) {
      debugStep("create:previous-found");
      return mergeLatestActivationSnapshot(previousSnapshot, generatedAt, warnings);
    }

    debugStep("create:previous-missing");
    return readLocalFallbackSnapshot(generatedAt, warnings);
  }

  const supabase = getSupabaseServerReadClient();

  if (supabase) {
    const preflight = await supabaseReadPreflight();
    if (!preflight.ok) {
      if (strictSupabaseExport) {
        throw new Error(`Production snapshot export Supabase preflight failed: ${preflight.reason}`);
      }

      const warnings = [
        `Supabase public reads skipped before export: ${preflight.reason}`
      ];
      const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, warnings);
      if (previousSnapshot) {
        return mergeLatestActivationSnapshot(previousSnapshot, generatedAt, warnings);
      }

      return readLocalFallbackSnapshot(generatedAt, warnings);
    }

    let supabaseSnapshot: { snapshot: PublicMirrorSnapshot | null; warnings: string[] };
    try {
      supabaseSnapshot = await withTimeout(
        readSupabaseSnapshot(supabase, generatedAt),
        45_000,
        "Supabase public reads timed out before export."
      );
    } catch (error) {
      if (strictSupabaseExport) {
        throw new Error(`Production snapshot export could not read Supabase public data: ${sanitizeError(error)}`);
      }

      const warnings = [`Supabase public reads failed before export fallback: ${sanitizeError(error)}`];
      const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, warnings);
      if (previousSnapshot) {
        return mergeLatestActivationSnapshot(previousSnapshot, generatedAt, warnings);
      }

      return readLocalFallbackSnapshot(generatedAt, warnings);
    }

    if (supabaseSnapshot.snapshot) {
      if (strictSupabaseExport) {
        const fatalWarning = supabaseSnapshot.warnings.find(isStrictSupabaseReadFailure);
        if (fatalWarning) {
          throw new Error(`Production snapshot export received an incomplete Supabase result: ${fatalWarning}`);
        }
      }

      return supabaseSnapshot.snapshot;
    }

    if (strictSupabaseExport) {
      throw new Error("Production snapshot export returned no public Supabase radar rows.");
    }

    const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, supabaseSnapshot.warnings);
    if (previousSnapshot) {
      return mergeLatestActivationSnapshot(previousSnapshot, generatedAt, supabaseSnapshot.warnings);
    }

    return readLocalFallbackSnapshot(generatedAt, supabaseSnapshot.warnings);
  }

  if (strictSupabaseExport) {
    throw new Error("Production snapshot export requires configured Supabase public credentials.");
  }

  const warnings = [
    "Supabase public URL and anon key are not configured for this process; local generated radar data was used."
  ];
  const previousSnapshot = await readPreviousPublicSnapshot(generatedAt, warnings);
  if (previousSnapshot) {
    return mergeLatestActivationSnapshot(previousSnapshot, generatedAt, warnings);
  }

  return readLocalFallbackSnapshot(generatedAt, warnings);
}

async function supabaseReadPreflight(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const publicConfig = getSupabasePublicConfig();
  if (!publicConfig) {
    return { ok: false, reason: "public Supabase config is not available." };
  }

  try {
    const hostname = new URL(publicConfig.url).hostname;
    await withTimeout(dns.lookup(hostname), 5_000, "Supabase hostname lookup timed out.");

    const healthUrl = new URL("/rest/v1/", publicConfig.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch(healthUrl, {
        headers: {
          apikey: publicConfig.anonKey
        },
        signal: controller.signal
      });

      if (response.status >= 500) {
        return { ok: false, reason: `Supabase REST preflight returned HTTP ${response.status}.` };
      }
    } finally {
      clearTimeout(timeout);
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: sanitizeError(error) };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function readSupabaseSnapshot(
  supabase: SupabaseClient,
  generatedAt: string
): Promise<{ snapshot: PublicMirrorSnapshot | null; warnings: string[] }> {
  const radar = await readSupabaseRadarItems(supabase);
  const publicCounts = publicSnapshotCounts(radar.count);
  const warnings = [...radar.warnings, ...publicCounts.warnings];

  if (radar.items.length === 0) {
    return {
      snapshot: null,
      warnings: [
        ...warnings,
        "Supabase public radar view returned no public-safe rows; local generated radar data was used."
      ]
    };
  }

  return {
    snapshot: buildSnapshot({
      caveats: [],
      dataSource: "supabase_radar_items",
      exactVisibleRows: radar.count,
      fallbackUsed: false,
      generatedAt,
      items: radar.items,
      publicCounts,
      publicCoverage: await loadPublicDataCompletenessSummary(),
      sourceKind: "supabase_public_views",
      warnings
    }),
    warnings
  };
}

async function readSupabaseRadarItems(supabase: SupabaseClient): Promise<SupabaseRadarRead> {
  try {
    const { count, data, error } = await supabase
      .from("public_radar_items")
      .select(
        [
          "id",
          "local_id",
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
          "confidence",
          "why_it_matters",
          "entities",
          "updated_at"
        ].join(","),
        { count: "exact" }
      )
      .in("understanding_status", ["included", "needs_review"])
      .order("processed_at", { ascending: false, nullsFirst: false })
      .limit(radarLimit);

    if (error) {
      return {
        count: 0,
        items: [],
        warnings: [readErrorMessage("public_radar_items", error as SupabaseReadError)]
      };
    }

    const rows = (data ?? []) as unknown as SupabaseRadarRow[];
    const items = rows
      .map(normalizeSupabaseRadarRow)
      .filter((item): item is PublicRadarSnapshotItem => Boolean(item));
    const warnings =
      rows.length > items.length
        ? ["Some Supabase public radar rows were skipped because required public fields were missing."]
        : [];

    if ((count ?? items.length) > items.length) {
      warnings.push(`Snapshot includes the newest ${items.length} of ${count ?? items.length} visible public radar rows.`);
    }

    return {
      count: count ?? items.length,
      items,
      warnings
    };
  } catch (error) {
    return {
      count: 0,
      items: [],
      warnings: [`public_radar_items read failed: ${sanitizeError(error)}`]
    };
  }
}

async function readLocalFallbackSnapshot(
  generatedAt: string,
  warnings: string[]
): Promise<PublicMirrorSnapshot> {
  const loaded = await loadRadarItems();
  const feed = buildRadarFeed(loaded);

  return buildSnapshot({
    caveats: feed.caveats,
    dataSource: loaded.dataSource,
    exactVisibleRows: feed.counts.total,
    fallbackUsed: true,
    generatedAt,
    items: feed.items.map(mapRetrievalItem),
    publicCounts: publicSnapshotCounts(feed.counts.total),
    publicCoverage: await loadPublicDataCompletenessSummary(),
    sourceKind: "local_files",
    warnings: [...warnings, ...loaded.warnings]
  });
}

async function readPreviousPublicSnapshot(
  generatedAt: string,
  warnings: string[]
): Promise<PublicMirrorSnapshot | null> {
  try {
    debugStep("previous:read");
    const parsed = JSON.parse(await fs.readFile(outputPath, "utf8")) as Partial<PublicMirrorSnapshot>;
    const items = Array.isArray(parsed.radar_items) ? parsed.radar_items : [];
    const publicItems = (items as PublicRadarSnapshotItem[]).map(publicSafeRadarItem).filter(isPublicSnapshotRadarCandidate);
    const droppedItems = items.length - publicItems.length;

    if (parsed.schema_version !== 1 || items.length < 50) {
      debugStep(`previous:rejected items=${items.length}`);
      return null;
    }

    const previousWarnings = Array.isArray(parsed.source?.warnings) ? parsed.source.warnings : [];
    debugStep(`previous:sanitize-start items=${publicItems.length} dropped=${droppedItems}`);

    const snapshot = sanitizePublicSnapshot({
      ...(parsed as PublicMirrorSnapshot),
      generated_at: generatedAt,
      radar_items: publicItems,
      source: {
        ...(parsed.source as PublicMirrorSnapshot["source"]),
        data_source: publicSnapshotDataSource(parsed.source?.data_source),
        local_data_used: true,
        warnings: publicSafeNotes([
          ...warnings,
          droppedItems > 0 ? `${droppedItems} 条旧快照低事件性源页或目录页已从公开快照中过滤。` : "",
          "Supabase public reads were unavailable during export; reused the previous public-safe Cloudflare snapshot instead of degrading to incomplete local data.",
          ...previousWarnings
        ])
      },
      counts: {
        ...(parsed.counts as PublicMirrorSnapshot["counts"]),
        snapshot_radar_items: publicItems.length,
        visible_radar_items: publicItems.length
      }
    });
    debugStep(`previous:sanitize-done events=${snapshot.event_count}`);
    return snapshot;
  } catch {
    debugStep("previous:missing");
    return null;
  }
}

type LatestActivationRead = {
  droppedCount: number;
  items: PublicRadarSnapshotItem[];
  latestTimestamp: string | null;
  runId: string | null;
  warnings: string[];
};

async function mergeLatestActivationSnapshot(
  snapshot: PublicMirrorSnapshot,
  generatedAt: string,
  warnings: string[]
): Promise<PublicMirrorSnapshot> {
  debugStep(`activation-merge:start previous=${snapshot.radar_items.length}`);
  const activation = await readLatestActivationRadarItems();
  debugStep(`activation-merge:read items=${activation.items.length} dropped=${activation.droppedCount}`);
  const sourceWarnings = publicSafeNotes([
    ...warnings,
    ...snapshot.source.warnings,
    ...activation.warnings
  ]);

  if (activation.items.length === 0) {
    return withFinalPublicSnapshotCounts(sanitizePublicSnapshot({
      ...snapshot,
      generated_at: generatedAt,
      source: {
        ...snapshot.source,
        local_data_used: true,
        warnings: sourceWarnings
      }
    }));
  }

  const previousItemCount = snapshot.radar_items.length;
  const mergedItems = mergePublicRadarItems([...activation.items, ...snapshot.radar_items]);
  debugStep(`activation-merge:merged rows=${mergedItems.length}`);
  const addedCount = Math.max(0, mergedItems.length - previousItemCount);
  const latest = latestTimestamp(mergedItems);
  const statusCounts = countStatuses(mergedItems);
  const activationNote = [
    `本轮公开证据更新合并 ${activation.items.length} 条事件信号。`,
    `去重后新增 ${addedCount} 条，当前静态快照公开信号 ${mergedItems.length} 条。`,
    activation.droppedCount > 0 ? `${activation.droppedCount} 条非公开状态、低事件性或字段不完整的刷新信号未进入公开快照。` : ""
  ].filter(Boolean).join(" ");

  debugStep("activation-merge:sanitize-start");
  const draft = sanitizePublicSnapshot({
    ...snapshot,
    caveats: publicSafeNotes([
      ...snapshot.caveats,
      "公开证据库本轮暂不可读，因此快照复用上一版公开证据，并合并最新公开证据更新。",
      activationNote
    ]),
    coverage: {
      ...snapshot.coverage,
      latest_refresh: activation.latestTimestamp ?? snapshot.coverage.latest_refresh,
      public_radar_items: mergedItems.length
    },
    data_completeness_summary: {
      ...snapshot.data_completeness_summary,
      public_radar_items: mergedItems.length
    },
    freshness: {
      ...snapshot.freshness,
      latest_timestamp: latest?.value ?? snapshot.freshness.latest_timestamp,
      latest_timestamp_source: latest?.source ?? snapshot.freshness.latest_timestamp_source,
      latest_understanding: activation.latestTimestamp ?? snapshot.freshness.latest_understanding,
      note: latest
        ? `Latest public radar timestamp is ${latest.value} (${latest.source}); includes latest public evidence update.`
        : snapshot.freshness.note
    },
    generated_at: generatedAt,
    counts: {
      ...snapshot.counts,
      excluded: statusCounts.excluded,
      failed: statusCounts.failed,
      included: statusCounts.included,
      needs_review: statusCounts.needs_review,
      public_radar_items: mergedItems.length,
      snapshot_radar_items: mergedItems.length,
      visible_radar_items: mergedItems.length
    },
    radar_items: mergedItems,
    source: {
      data_source: "local_understanding_output",
      kind: "local_files",
      local_data_used: true,
      warnings: publicSafeNotes([...sourceWarnings, activationNote])
    },
    top_categories: countEntries(mergedItems.flatMap((item) => item.categories.map(labelize))),
    top_source_tiers: countEntries(mergedItems.map((item) => item.source_tier)),
    top_sources: countEntries(mergedItems.map((item) => item.source_name))
  });
  debugStep(`activation-merge:sanitize-done events=${draft.event_count}`);

  return withFinalPublicSnapshotCounts(draft);
}

function withFinalPublicSnapshotCounts(draft: PublicMirrorSnapshot): PublicMirrorSnapshot {
  const sanitizedStatusCounts = countStatuses(draft.radar_items);

  return {
    ...draft,
    counts: {
      ...draft.counts,
      citations: draft.radar_items.length,
      event_clusters: draft.event_count,
      excluded: sanitizedStatusCounts.excluded,
      failed: sanitizedStatusCounts.failed,
      included: sanitizedStatusCounts.included,
      needs_review: sanitizedStatusCounts.needs_review,
      public_radar_items: draft.radar_items.length,
      snapshot_radar_items: draft.radar_items.length,
      visible_radar_items: draft.radar_items.length
    }
  };
}

async function readLatestActivationRadarItems(): Promise<LatestActivationRead> {
  debugStep("activation:read-summary");
  const empty: LatestActivationRead = {
    droppedCount: 0,
    items: [],
    latestTimestamp: null,
    runId: null,
    warnings: []
  };
  const summaryPath = path.join(process.cwd(), "data", "activation", "latest", "summary.json");

  let summary: Record<string, unknown>;
  try {
    summary = record(JSON.parse(await fs.readFile(summaryPath, "utf8")));
  } catch {
    return {
      ...empty,
      warnings: ["No latest public evidence update summary was available for public snapshot merge."]
    };
  }

  const mode = text(summary.mode, 24);
  const runId = text(summary.run_id, 120) || null;
  if (mode !== "live") {
    return {
      ...empty,
      runId,
      warnings: [`Latest public evidence update is ${mode || "unknown"}; only public-readable output is merged into the public snapshot.`]
    };
  }

  const chunkFiles = await discoverActivationChunkFiles();
  const items: PublicRadarSnapshotItem[] = [];
  const warnings: string[] = [];
  const runIds = new Set<string>();
  let droppedCount = 0;
  let completedChunks = 0;

  for (const chunkPath of chunkFiles) {
    completedChunks += 1;

    try {
      debugStep(`activation:read-chunk ${path.basename(chunkPath)}`);
      const parsed = record(JSON.parse(await fs.readFile(chunkPath, "utf8")));
      const understandingRun = record(parsed.understanding_run);
      const chunkMode = text(understandingRun.mode, 24);
      if (chunkMode && chunkMode !== "live") {
        continue;
      }

      const chunkRunId = text(parsed.run_id, 120);
      if (chunkRunId) {
        runIds.add(chunkRunId);
      }

      const rows = Array.isArray(parsed.radar_items) ? parsed.radar_items.filter(isRecord) : [];

      for (const row of rows) {
        const item = normalizeSupabaseRadarRow(row);
        if (!item || !isPublicSnapshotRadarCandidate(item)) {
          droppedCount += 1;
          continue;
        }

        items.push(item);
      }
    } catch (error) {
      warnings.push(`Activation chunk ${path.basename(chunkPath)} read failed: ${sanitizeError(error)}`);
    }
  }

  const mergedItems = mergePublicRadarItems(items);
  debugStep(`activation:filtered items=${mergedItems.length} dropped=${droppedCount}`);
  const duplicateCount = Math.max(0, items.length - mergedItems.length);
  const latest = latestTimestamp(mergedItems)?.value ?? (text(summary.updated_at, 80) || null);

  return {
    droppedCount: droppedCount + duplicateCount,
    items: mergedItems,
    latestTimestamp: latest,
    runId,
    warnings: publicSafeNotes([
      `Public evidence update contributed ${mergedItems.length} radar items from ${completedChunks} completed chunks.`,
      duplicateCount > 0 ? `${duplicateCount} duplicate refresh rows were removed before public snapshot merge.` : "",
      ...warnings
    ])
  };
}

async function discoverActivationChunkFiles() {
  const runsDir = path.join(process.cwd(), "data", "activation", "runs");

  try {
    const names = await fs.readdir(runsDir);
    return names
      .filter((name) => /^activation_\d{8}_\d+Z-chunk-\d+\.json$/i.test(name))
      .filter((name) => !/raw-items\.json$/i.test(name))
      .sort()
      .map((name) => path.join(runsDir, name));
  } catch {
    return [];
  }
}

function isPublicSnapshotRadarCandidate(item: PublicRadarSnapshotItem) {
  if (isExternalSourceRepairSignal(item)) {
    return false;
  }

  if (item.status !== "included" && item.status !== "needs_review") {
    return false;
  }

  return true;
}

function mergePublicRadarItems(items: PublicRadarSnapshotItem[]) {
  const byKey = new Map<string, PublicRadarSnapshotItem>();

  for (const item of items) {
    if (!isPublicSnapshotRadarCandidate(item)) {
      continue;
    }

    const key = radarItemKey(item);
    if (!key || byKey.has(key)) {
      continue;
    }

    byKey.set(key, item);
  }

  return [...byKey.values()]
    .sort((left, right) => itemTime(right) - itemTime(left))
    .slice(0, radarLimit);
}

function radarItemKey(item: PublicRadarSnapshotItem) {
  const urlKey = normalizedUrlKey(item.url);
  return urlKey || `id:${item.id}`;
}

function normalizedUrlKey(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function itemTime(item: PublicRadarSnapshotItem) {
  const value = Date.parse(item.processed_at || item.collected_at || item.published_at || "");
  return Number.isFinite(value) ? value : 0;
}

function buildSnapshot(input: {
  caveats: string[];
  dataSource: RetrievalDataSource;
  exactVisibleRows: number;
  fallbackUsed: boolean;
  generatedAt: string;
  items: PublicRadarSnapshotItem[];
  publicCounts: PublicSnapshotCountsInput;
  publicCoverage: PublicDataCompletenessSummary;
  sourceKind: SnapshotSourceKind;
  warnings: string[];
}): PublicMirrorSnapshot {
  const items = input.items.map(publicSafeRadarItem).filter(isPublicSnapshotRadarCandidate);
  const droppedItems = input.items.length - items.length;
  const warnings = publicSafeNotes([
    ...input.warnings,
    droppedItems > 0 ? `${droppedItems} public radar row(s) were omitted because they did not meet the public display contract.` : ""
  ]);
  const latest = latestTimestamp(items);
  const statusCounts = countStatuses(items);
  const eventInputItems = items.map((item) => ({ ...item, evidence_notes: [] }));
  const rawEventLayer = buildEventLayer(eventInputItems, latest?.value ? { asOf: latest.value } : {});
  const eventLayer = publicDisplayEventLayer(rawEventLayer);
  const sourceHealthSummary = aggregateSourceFamilyHealth(input.publicCoverage.sourceFamilyHealth);
  const sourceHealthFailureFamilies = sourceHealthFailureFamilySummary(sourceHealthSummary);

  return {
    schema_version: 1,
    generated_at: input.generatedAt,
    public_site: {
      cloudflare_url: cloudflareUrl,
      purpose: "Primary Cloudflare public read surface for AI Industry Radar data.",
      read_only: true
    },
    source: {
      data_source: publicSnapshotDataSource(input.dataSource),
      kind: input.sourceKind,
      local_data_used: input.fallbackUsed,
      warnings
    },
    freshness: {
      latest_ingestion: input.publicCounts.latest_ingestion,
      latest_timestamp: latest?.value ?? null,
      latest_timestamp_source: latest?.source ?? null,
      latest_understanding: input.publicCounts.latest_understanding,
      note: latest
        ? `Latest public content publication timestamp is ${latest.value}.`
        : "No public content publication timestamp is available."
    },
    counts: {
      citations: items.length,
      excluded: statusCounts.excluded,
      failed: statusCounts.failed,
      included: statusCounts.included,
      needs_review: statusCounts.needs_review,
      public_radar_items: input.publicCounts.public_radar_items,
      snapshot_radar_items: items.length,
      visible_radar_items: items.length,
      event_clusters: eventLayer.event_count
    },
    coverage: {
      attempted_sources: input.publicCoverage.attemptedSources,
      automated_eligible_sources: input.publicCoverage.automatedEligibleSources,
      failed_source_reasons: input.publicCoverage.failedSourceReasons,
      failed_sources: input.publicCoverage.failedSources,
      failure_families: input.publicCoverage.failureFamilies,
      fetched_sources: input.publicCoverage.fetchedSources,
      label: "public snapshot",
      latest_refresh: input.publicCoverage.latestRefresh,
      public_radar_items: input.publicCoverage.publicRadarItems,
      radar_to_public_visibility: input.publicCoverage.rates.radarPublicVisibility,
      skipped_source_reasons: input.publicCoverage.skippedSourceReasons,
      skipped_sources: input.publicCoverage.skippedSources,
      source_public_visibility: input.publicCoverage.rates.sourcePublicVisibility,
      sources_total: input.publicCoverage.sourcesTotal,
      sources_with_public_items: input.publicCoverage.sourcesWithPublicItems
    },
    top_categories: countEntries(items.flatMap((item) => item.categories.map(labelize))),
    top_source_tiers: countEntries(items.map((item) => item.source_tier)),
    top_sources: countEntries(items.map((item) => item.source_name)),
    curated_events: eventLayer.curated_events,
    data_completeness_summary: {
      attempted_sources: input.publicCoverage.attemptedSources,
      automated_eligible_sources: input.publicCoverage.automatedEligibleSources,
      blocked_manual_sources: input.publicCoverage.blockedManualSources,
      failed_sources: input.publicCoverage.failedSources,
      fetched_sources: input.publicCoverage.fetchedSources,
      public_radar_items: input.publicCoverage.publicRadarItems,
      radar_to_public_visibility: input.publicCoverage.rates.radarPublicVisibility,
      source_public_visibility: input.publicCoverage.rates.sourcePublicVisibility,
      sources_total: input.publicCoverage.sourcesTotal,
      sources_with_public_items: input.publicCoverage.sourcesWithPublicItems
    },
    event_cluster_items: eventLayer.event_cluster_items,
    event_clusters: eventLayer.event_clusters,
    event_count: eventLayer.event_count,
    failure_family_summary: sourceHealthFailureFamilies,
    radar_items: items,
    source_health_by_family: input.publicCoverage.sourceFamilyHealth,
    source_health_failures: input.publicCoverage.failedSourceDetails,
    source_health_scope: {
      attempted_sources: input.publicCoverage.sourceHealthScope.attempted_sources,
      finished_at: input.publicCoverage.sourceHealthScope.finished_at,
      started_at: input.publicCoverage.sourceHealthScope.started_at
    },
    source_health_summary: sourceHealthSummary,
    timeline: eventLayer.timeline,
    caveats: publicSafeNotes([
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "Only public-safe radar fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      input.fallbackUsed
        ? "This snapshot used local generated data because Supabase public reads were unavailable to the export process."
        : "Radar rows came from Supabase public-safe read views.",
      ...input.caveats,
      ...warnings,
      ...input.publicCounts.warnings
    ])
  };
}

function publicDisplayEventLayer(layer: PublicEventLayer): PublicEventLayer {
  return filterPublicDisplayEventLayer(layer);
}
function publicSnapshotCounts(publicRadarFallback: number): PublicSnapshotCountsInput {
  return {
    public_radar_items: publicRadarFallback,
    latest_ingestion: null,
    latest_understanding: null,
    warnings: []
  };
}

function normalizeSupabaseRadarRow(row: SupabaseRadarRow): PublicRadarSnapshotItem | null {
  const id = text(row.local_id) || text(row.id);
  const title = text(row.title);
  const url = text(row.url);
  const sourceName = text(row.source_name);
  const collectedAt = text(row.collected_at);
  const processedAt = text(row.processed_at) || text(row.updated_at) || collectedAt;

  if (!id || !title || !isPublicHttpUrl(url) || !sourceName || !collectedAt || !processedAt) {
    return null;
  }

  return {
    id,
    categories: categories(row.categories ?? row.topics),
    collected_at: collectedAt,
    confidence: score(row.confidence),
    entities: publicSafeEntities(row.entities ?? row.extracted_entities ?? row.item_entities),
    language: normalizeLanguage(row.language),
    processed_at: processedAt,
    published_at: optionalText(row.published_at),
    scores: {
      ai_relevance: score(row.ai_relevance_score),
      credibility: score(row.credibility_score),
      freshness: score(row.freshness_score),
      importance: score(row.importance_score),
      novelty: score(row.novelty_score),
      overall: score(row.overall_score)
    },
    source_name: sourceName,
    source_tier: text(row.source_tier) || "unreviewed",
    status: normalizeStatus(row.understanding_status ?? row.status),
    summary_en: optionalText(row.summary_en),
    summary_zh: optionalText(row.summary_zh),
    tags: stringArray(row.tags, 12, 80),
    title,
    url,
    why_it_matters: optionalText(row.why_it_matters)
  };
}

function mapRetrievalItem(item: RetrievalRadarItem): PublicRadarSnapshotItem {
  return {
    id: item.id,
    categories: item.categories,
    collected_at: item.collected_at,
    confidence: item.confidence,
    entities: publicSafeEntities(item.entities),
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
    summary_en: item.summary_en || undefined,
    summary_zh: item.summary_zh || undefined,
    tags: item.tags.slice(0, 12),
    title: item.title,
    url: item.url,
    why_it_matters: item.why_it_matters
  };
}

function readErrorMessage(tableName: string, error: SupabaseReadError) {
  if (isMissingPublicViewError(tableName, error)) {
    return `${tableName} is not available to anon reads; local generated data was used.`;
  }

  return `${tableName} read failed: ${sanitizeError(error.message)}`;
}

function isMissingPublicViewError(tableName: string, error: SupabaseReadError) {
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

function latestTimestamp(items: PublicRadarSnapshotItem[]) {
  return items
    .map((item) => timestampCandidate(item.published_at, "published_at"))
    .filter((candidate): candidate is { value: string; source: string } => Boolean(candidate))
    .sort((left, right) => Date.parse(right.value) - Date.parse(left.value))[0];
}

function timestampCandidate(value: string | undefined, source: string) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return null;
  }

  return {
    source,
    value
  };
}

function countStatuses(items: PublicRadarSnapshotItem[]) {
  return items.reduce<Record<UnderstandingStatus, number>>(
    (counts, item) => {
      counts[item.status] += 1;
      return counts;
    },
    {
      excluded: 0,
      failed: 0,
      included: 0,
      needs_review: 0
    }
  );
}

function countEntries(values: string[]): CountEntry[] {
  const counts = values.reduce<Record<string, number>>((accumulator, value) => {
    const label = value.trim();
    if (label) {
      accumulator[label] = (accumulator[label] ?? 0) + 1;
    }
    return accumulator;
  }, {});

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([label, count]) => ({ count, label }));
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function categories(value: unknown): RadarCategory[] {
  const allowed = new Set<RadarCategory>(RADAR_CATEGORIES);
  const values = stringArray(value, 10, 80).filter((category): category is RadarCategory =>
    allowed.has(category as RadarCategory)
  );

  return values.length > 0 ? values : ["other"];
}

function normalizeLanguage(value: unknown): RetrievalLanguage {
  return value === "zh" || value === "en" || value === "mixed" || value === "unknown" ? value : "unknown";
}

function normalizeStatus(value: unknown): UnderstandingStatus {
  return statusValue(value) ?? "needs_review";
}

function statusValue(value: unknown): UnderstandingStatus | null {
  return value === "included" || value === "excluded" || value === "needs_review" || value === "failed"
    ? value
    : null;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maxLength = 5000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || undefined;
}

function stringArray(value: unknown, limit: number, itemMaxLength: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => text(item, itemMaxLength)).filter(Boolean))).slice(0, limit);
}

function score(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numberValue));
}

function integer(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return Math.floor(numberValue);
}

function nullableInteger(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return Math.floor(numberValue);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function numericRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, count]) => [text(key, 120), integer(count)] as const)
      .filter(([key]) => key.length > 0)
  );
}

function countEntryList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): CountEntry | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const label = publicSafeNote(text(entry.label, 160));
      if (!label) {
        return null;
      }

      return {
        count: integer(entry.count),
        label
      };
    })
    .filter((entry): entry is CountEntry => Boolean(entry));
}

function publicHttpUrl(value: unknown) {
  return publicInternetHttpUrl(text(value, 2000));
}

function isPublicHttpUrl(value: string) {
  return publicInternetHttpUrl(value) !== "";
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sanitizePublicSnapshot(snapshot: PublicMirrorSnapshot): PublicMirrorSnapshot {
  const radarItems = snapshot.radar_items.map(publicSafeRadarItem).filter(isPublicSnapshotRadarCandidate);
  const latest = latestTimestamp(radarItems);
  debugStep(`sanitize:build-event-layer-start rows=${radarItems.length}`);
  const eventInputItems = radarItems.map((item) => ({ ...item, evidence_notes: [] }));
  const rawEventLayer = buildEventLayer(eventInputItems, latest?.value ? { asOf: latest.value } : {});
  debugStep(`sanitize:build-event-layer-done events=${rawEventLayer.event_count}`);
  const eventLayer = publicDisplayEventLayer(rawEventLayer);
  debugStep(`sanitize:public-filter-done events=${eventLayer.event_count}`);

  return {
    schema_version: 1,
    generated_at: text(snapshot.generated_at) || new Date().toISOString(),
    public_site: {
      cloudflare_url: cloudflareUrl,
      purpose: "Primary Cloudflare public read surface for AI Industry Radar data.",
      read_only: true
    },
    counts: {
      citations: integer(snapshot.counts.citations),
      event_clusters: eventLayer.event_count,
      excluded: integer(snapshot.counts.excluded),
      failed: integer(snapshot.counts.failed),
      included: integer(snapshot.counts.included),
      needs_review: integer(snapshot.counts.needs_review),
      public_radar_items: nullableInteger(snapshot.counts.public_radar_items),
      snapshot_radar_items: radarItems.length,
      visible_radar_items: radarItems.length
    },
    coverage: {
      attempted_sources: integer(snapshot.coverage.attempted_sources),
      automated_eligible_sources: integer(snapshot.coverage.automated_eligible_sources),
      failed_source_reasons: numericRecord(snapshot.coverage.failed_source_reasons),
      failed_sources: integer(snapshot.coverage.failed_sources),
      failure_families: numericRecord(snapshot.coverage.failure_families),
      fetched_sources: integer(snapshot.coverage.fetched_sources),
      label: "public snapshot",
      latest_refresh: optionalText(snapshot.coverage.latest_refresh) ?? null,
      public_radar_items: nullableInteger(snapshot.coverage.public_radar_items),
      radar_to_public_visibility: nullableNumber(snapshot.coverage.radar_to_public_visibility),
      skipped_source_reasons: numericRecord(snapshot.coverage.skipped_source_reasons),
      skipped_sources: integer(snapshot.coverage.skipped_sources),
      source_public_visibility: nullableNumber(snapshot.coverage.source_public_visibility),
      sources_total: integer(snapshot.coverage.sources_total),
      sources_with_public_items: nullableInteger(snapshot.coverage.sources_with_public_items)
    },
    source: {
      kind: snapshot.source.kind === "supabase_public_views" ? "supabase_public_views" : "local_files",
      data_source: publicSnapshotDataSource(snapshot.source.data_source),
      local_data_used: Boolean(snapshot.source.local_data_used),
      warnings: publicSourceWarnings(snapshot)
    },
    freshness: {
      latest_ingestion: optionalText(snapshot.freshness.latest_ingestion) ?? null,
      latest_timestamp: latest?.value ?? null,
      latest_timestamp_source: latest?.source ?? null,
      latest_understanding: optionalText(snapshot.freshness.latest_understanding) ?? null,
      note: latest
        ? `Latest public content publication timestamp is ${latest.value}.`
        : "No public content publication timestamp is available."
    },
    top_categories: countEntryList(snapshot.top_categories),
    top_sources: countEntryList(snapshot.top_sources),
    top_source_tiers: countEntryList(snapshot.top_source_tiers),
    curated_events: eventLayer.curated_events,
    event_cluster_items: eventLayer.event_cluster_items,
    event_clusters: eventLayer.event_clusters,
    event_count: eventLayer.event_count,
    source_health_summary: {
      "403": integer(snapshot.source_health_summary["403"]),
      duplicate_only: integer(snapshot.source_health_summary.duplicate_only),
      failed: integer(snapshot.source_health_summary.failed),
      low_relevance_excluded: integer(snapshot.source_health_summary.low_relevance_excluded),
      manual_blocked: integer(snapshot.source_health_summary.manual_blocked),
      no_items: integer(snapshot.source_health_summary.no_items),
      rate_limit: integer(snapshot.source_health_summary.rate_limit),
      succeeded: integer(snapshot.source_health_summary.succeeded),
      timeout: integer(snapshot.source_health_summary.timeout),
      unsupported_source: integer(snapshot.source_health_summary.unsupported_source)
    },
    source_health_scope: publicSourceHealthScope(snapshot.source_health_scope),
    source_health_by_family: publicSourceFamilyHealth(snapshot.source_health_by_family),
    source_health_failures: (snapshot.source_health_failures ?? []).map((failure) => ({
      reason: text(failure.reason, 80),
      source_family: text(failure.source_family, 80),
      source_name: publicSafeNote(failure.source_name),
      source_slug: text(failure.source_slug, 160)
    })).filter((failure) => failure.source_slug && failure.source_name),
    failure_family_summary: numericRecord(snapshot.failure_family_summary),
    data_completeness_summary: {
      attempted_sources: integer(snapshot.data_completeness_summary.attempted_sources),
      automated_eligible_sources: integer(snapshot.data_completeness_summary.automated_eligible_sources),
      blocked_manual_sources: integer(snapshot.data_completeness_summary.blocked_manual_sources),
      failed_sources: integer(snapshot.data_completeness_summary.failed_sources),
      fetched_sources: integer(snapshot.data_completeness_summary.fetched_sources),
      public_radar_items: nullableInteger(snapshot.data_completeness_summary.public_radar_items),
      radar_to_public_visibility: nullableNumber(snapshot.data_completeness_summary.radar_to_public_visibility),
      source_public_visibility: nullableNumber(snapshot.data_completeness_summary.source_public_visibility),
      sources_total: integer(snapshot.data_completeness_summary.sources_total),
      sources_with_public_items: nullableInteger(snapshot.data_completeness_summary.sources_with_public_items)
    },
    radar_items: radarItems,
    timeline: eventLayer.timeline,
    caveats: publicSafeNotes(snapshot.caveats)
  };
}

function publicSafeRadarItem(item: PublicRadarSnapshotItem): PublicRadarSnapshotItem {
  const scores = item.scores ?? {
    ai_relevance: 0,
    credibility: 0,
    freshness: 0,
    importance: 0,
    novelty: 0,
    overall: 0
  };

  const sourceName = publicSafeNote(item.source_name) || "Unknown source";
  const sourceTier = text(item.source_tier, 20) || "unreviewed";
  const url = publicHttpUrl(item.url);

  return {
    id: text(item.id, 160),
    title: publicSafeNote(item.title),
    url,
    source_name: sourceName,
    source_family: sourceFamilyForEvent({
      source_id: "",
      source_name: sourceName,
      source_tier: sourceTier,
      url
    }),
    status: normalizeStatus(item.status),
    language: normalizeLanguage(item.language),
    published_at: optionalText(item.published_at),
    collected_at: text(item.collected_at, 80) || new Date(0).toISOString(),
    processed_at: text(item.processed_at, 80) || new Date().toISOString(),
    summary_zh: item.summary_zh ? publicSafeNote(item.summary_zh) : undefined,
    summary_en: item.summary_en ? publicSafeNote(item.summary_en) : undefined,
    categories: categories(item.categories),
    tags: publicSafeNotes(stringArray(item.tags, 12, 80)),
    source_tier: sourceTier,
    confidence: score(item.confidence),
    scores: {
      ai_relevance: score(scores.ai_relevance),
      credibility: score(scores.credibility),
      freshness: score(scores.freshness),
      importance: score(scores.importance),
      novelty: score(scores.novelty),
      overall: score(scores.overall)
    },
    why_it_matters: item.why_it_matters ? publicSafeNote(item.why_it_matters) : undefined,
    entities: publicSafeEntities(item.entities)
  };
}

function publicSafeEntities(value: unknown): PublicRadarSnapshotEntity[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const entities: PublicRadarSnapshotEntity[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }

    const entity = entry as Partial<UnderstandingEntity>;
    const name = publicSafeNote(text(entity.name, 80));
    if (!name) {
      continue;
    }

    const type = entityTypeValue(entity.type);
    const key = `${type}:${name.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entities.push({
      confidence: score(entity.confidence),
      name,
      type
    });

    if (entities.length >= 12) {
      break;
    }
  }

  return entities;
}

function entityTypeValue(value: unknown): UnderstandingEntityType {
  const normalized = text(value, 40).toLowerCase().replace(/\s+/g, "_");
  return publicEntityTypes.has(normalized) ? (normalized as UnderstandingEntityType) : "other";
}

function assertStrictProductionSnapshot(snapshot: PublicMirrorSnapshot) {
  if (process.env.CLOUDFLARE_SNAPSHOT_REQUIRE_SUPABASE !== "true") {
    return;
  }

  const minPublicItems = positiveIntegerEnv("CLOUDFLARE_SNAPSHOT_MIN_PUBLIC_ITEMS", 180);
  const maxAgeHours = positiveIntegerEnv("CLOUDFLARE_SNAPSHOT_MAX_AGE_HOURS", 72);
  const maxRefreshAgeHours = positiveIntegerEnv("CLOUDFLARE_SNAPSHOT_MAX_REFRESH_AGE_HOURS", 6);
  const expectedAttemptedSources = positiveIntegerEnv("CLOUDFLARE_SNAPSHOT_EXPECTED_ATTEMPTED_SOURCES", 1);
  const maxSourceFailureRate = fractionEnv("CLOUDFLARE_SNAPSHOT_MAX_SOURCE_FAILURE_RATE", 0.5);
  const publicItemCount = snapshot.counts.public_radar_items ?? 0;
  const latestTimestamp = snapshot.freshness.latest_timestamp;
  const latestTime = latestTimestamp ? Date.parse(latestTimestamp) : Number.NaN;
  const ageHours = Number.isFinite(latestTime) ? (Date.now() - latestTime) / 3_600_000 : Number.POSITIVE_INFINITY;
  const latestRefresh = snapshot.coverage.latest_refresh;
  const latestRefreshTime = latestRefresh ? Date.parse(latestRefresh) : Number.NaN;
  const refreshAgeHours = Number.isFinite(latestRefreshTime)
    ? (Date.now() - latestRefreshTime) / 3_600_000
    : Number.POSITIVE_INFINITY;
  const healthFinishedAt = snapshot.source_health_scope.finished_at;
  const healthFinishedTime = healthFinishedAt ? Date.parse(healthFinishedAt) : Number.NaN;
  const refreshNotBefore = process.env.CLOUDFLARE_SNAPSHOT_REFRESH_NOT_BEFORE?.trim();
  const refreshNotBeforeTime = refreshNotBefore ? Date.parse(refreshNotBefore) : Number.NaN;

  if (
    snapshot.source.kind !== "supabase_public_views" ||
    snapshot.source.data_source !== "public_evidence_store" ||
    snapshot.source.local_data_used
  ) {
    throw new Error("Production snapshot export rejected a non-Supabase or fallback data source.");
  }

  const completeness = snapshot.data_completeness_summary;
  const broadHealthAttempted = snapshot.source_health_by_family.reduce((total, row) => total + row.attempted, 0);
  const broadHealthFullyAccounted = snapshot.source_health_by_family.every((row) => {
    const remaining = row.attempted - row.succeeded - row.failed;
    return remaining >= 0 && remaining <= row.no_items + row.skipped;
  });
  const recentFailureRate = completeness.attempted_sources > 0
    ? completeness.failed_sources / completeness.attempted_sources
    : 1;
  if (
    completeness.sources_total < 1 ||
    completeness.automated_eligible_sources < 1 ||
    (completeness.public_radar_items ?? 0) !== publicItemCount ||
    (completeness.sources_with_public_items ?? 0) < 1 ||
    snapshot.source_health_scope.attempted_sources < 1 ||
    broadHealthAttempted !== snapshot.source_health_scope.attempted_sources ||
    !broadHealthFullyAccounted ||
    snapshot.source_health_summary.succeeded < 1 ||
    completeness.attempted_sources < expectedAttemptedSources ||
    completeness.fetched_sources < 1 ||
    recentFailureRate > maxSourceFailureRate
  ) {
    throw new Error(
      "Production snapshot export requires authoritative completeness counts and a fully accounted broad source-health refresh."
    );
  }

  if (
    !Number.isFinite(latestRefreshTime) ||
    !Number.isFinite(healthFinishedTime) ||
    refreshAgeHours > maxRefreshAgeHours ||
    refreshAgeHours < -1 ||
    (refreshNotBefore && (!Number.isFinite(refreshNotBeforeTime) || latestRefreshTime < refreshNotBeforeTime)) ||
    (refreshNotBefore && healthFinishedTime < refreshNotBeforeTime)
  ) {
    throw new Error(
      `Production snapshot export requires a completed source refresh no older than ${maxRefreshAgeHours} hours and newer than the current workflow start.`
    );
  }

  if (publicItemCount < minPublicItems || snapshot.radar_items.length < minPublicItems) {
    throw new Error(
      `Production snapshot export requires at least ${minPublicItems} public-safe items; received ${publicItemCount} visible and ${snapshot.radar_items.length} exportable.`
    );
  }

  if (snapshot.radar_items.length !== publicItemCount) {
    throw new Error(
      `Production snapshot export requires complete public-signal parity; received ${publicItemCount} visible and ${snapshot.radar_items.length} exportable.`
    );
  }

  if (snapshot.event_count < 1 || snapshot.event_cluster_items.length < 1 || snapshot.curated_events.length < 5) {
    throw new Error("Production snapshot export requires a populated event layer and at least five curated events.");
  }

  if (
    snapshot.freshness.latest_timestamp_source !== "published_at" ||
    !Number.isFinite(latestTime) ||
    ageHours > maxAgeHours ||
    ageHours < -24
  ) {
    throw new Error(
      `Production snapshot export requires a valid public publication timestamp no older than ${maxAgeHours} hours.`
    );
  }
}

function fractionEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function positiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isStrictSupabaseReadFailure(warning: string) {
  return /(read failed|count failed|timestamp failed|unavailable|timed out|returned no public-safe rows)/i.test(warning);
}

function aggregateSourceFamilyHealth(
  rows: PublicDataCompletenessSummary["sourceFamilyHealth"]
): PublicMirrorSnapshot["source_health_summary"] {
  return rows.reduce<PublicMirrorSnapshot["source_health_summary"]>(
    (summary, row) => ({
      "403": summary["403"] + row["403"],
      duplicate_only: summary.duplicate_only + row.duplicate_only,
      failed: summary.failed + row.failed,
      low_relevance_excluded: summary.low_relevance_excluded + row.low_relevance_excluded,
      manual_blocked: summary.manual_blocked + row.manual_blocked,
      no_items: summary.no_items + row.no_items,
      rate_limit: summary.rate_limit + row.rate_limit,
      succeeded: summary.succeeded + row.succeeded,
      timeout: summary.timeout + row.timeout,
      unsupported_source: summary.unsupported_source + row.unsupported_source
    }),
    {
      "403": 0,
      duplicate_only: 0,
      failed: 0,
      low_relevance_excluded: 0,
      manual_blocked: 0,
      no_items: 0,
      rate_limit: 0,
      succeeded: 0,
      timeout: 0,
      unsupported_source: 0
    }
  );
}

function sourceHealthFailureFamilySummary(
  summary: PublicMirrorSnapshot["source_health_summary"]
) {
  return Object.fromEntries(
    [
      ["timeout", summary.timeout],
      ["403", summary["403"]],
      ["rate_limit", summary.rate_limit],
      ["no_items", summary.no_items],
      ["duplicate_only", summary.duplicate_only],
      ["manual_blocked", summary.manual_blocked],
      ["unsupported_source", summary.unsupported_source],
      ["low_relevance_excluded", summary.low_relevance_excluded]
    ].filter(([, count]) => Number(count) > 0)
  ) as Record<string, number>;
}

function publicSourceHealthScope(value: unknown): PublicMirrorSnapshot["source_health_scope"] {
  const row = isRecord(value) ? value : {};
  return {
    attempted_sources: integer(row.attempted_sources),
    finished_at: optionalText(row.finished_at) ?? null,
    started_at: optionalText(row.started_at) ?? null
  };
}

function publicSourceFamilyHealth(value: unknown): PublicMirrorSnapshot["source_health_by_family"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((row) => ({
      "403": integer(row["403"]),
      attempted: integer(row.attempted),
      automated_eligible: integer(row.automated_eligible),
      configured: integer(row.configured),
      duplicate_only: integer(row.duplicate_only),
      failed: integer(row.failed),
      family: text(row.family, 80) || "other",
      low_relevance_excluded: integer(row.low_relevance_excluded),
      manual_blocked: integer(row.manual_blocked),
      no_items: integer(row.no_items),
      rate_limit: integer(row.rate_limit),
      skipped: integer(row.skipped),
      succeeded: integer(row.succeeded),
      timeout: integer(row.timeout),
      unsupported_source: integer(row.unsupported_source)
    }))
    .sort((left, right) => right.attempted - left.attempted || right.configured - left.configured || left.family.localeCompare(right.family));
}

function publicSnapshotDataSource(value: string | null | undefined) {
  if (!value) {
    return "public_evidence_store";
  }

  if (value === "supabase_radar_items" || value === "public_radar_items" || value.startsWith("supabase_")) {
    return "public_evidence_store";
  }

  if (value === "local_understanding_output" || value.startsWith("local_")) {
    return "local_evidence_files";
  }

  if (value === "mock_data") {
    return "demo_evidence";
  }

  if (value === "empty") {
    return "empty_evidence";
  }

  return value;
}

function publicSafeNotes(values: string[]) {
  return dedupe(values.map(publicSafeNote).filter((value) => value && !isInternalRunLogNote(value)));
}

function publicSourceWarnings(snapshot: PublicMirrorSnapshot) {
  const warnings = [
    "此快照仅展示可公开引用的结构化证据字段，不包含内部采集日志、后台运行状态或凭据。"
  ];

  if (snapshot.source.local_data_used || snapshot.source.kind !== "supabase_public_views") {
    warnings.push("当前展示使用已生成的公开证据快照；新鲜度以页面时间戳和来源引用为准。");
  }

  if (snapshot.counts.visible_radar_items === 0) {
    warnings.push("当前公开快照没有可展示雷达条目。");
  }

  return dedupe(warnings);
}

function publicSafeNote(value: string) {
  return value
    .replace(
      /\b(NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|DEEPSEEK_API_KEY|api[\s_-]?key|token|cookie|authorization)\b\s*[:=]\s*[^\s,;]+/gi,
      "[redacted credential]"
    )
    .replace(/\b(NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|DEEPSEEK_API_KEY)\b/gi, "credential")
    .replace(/without running live model generation or writing to Supabase/gi, "基于既有公开证据完成复核")
    .replace(/without writing to Supabase/gi, "基于既有公开证据")
    .replace(/local repository snapshot/gi, "当前公开证据快照")
    .replace(/repository snapshot/gi, "公开证据快照")
    .replace(/May affect model capability tracking and product benchmarking:/gi, "可能影响行业技术评估和产品选型：")
    .replace(/model capability tracking and product benchmarking/gi, "行业技术评估和产品选型")
    .replace(/AI writing/gi, "AI 辅助内容处理")
    .replace(/AI写作/g, "AI 辅助内容处理")
    .replace(/利用AI进行写作/g, "利用 AI 进行内容处理")
    .replace(
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "此页面是公开只读情报快照，不提供账号、后台操作或写入能力。"
    )
    .replace(
      "Cloudflare Pages 是主要公开只读页面；登录、Admin、服务端操作和写入流程不在公开页面中运行。",
      "此页面是公开只读情报快照，不提供账号、后台操作或写入能力。"
    )
    .replace(
      "Only public-safe radar fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      "只纳入可公开引用的雷达字段；私有原文、内部备注和凭据均不展示。"
    )
    .replace(
      "Read-only Supabase public radar retrieval was used; no Supabase write path ran.",
      "使用公开证据库进行检索；只展示可公开引用的结构化字段。"
    )
    .replace("Radar rows came from Supabase public-safe read views.", "雷达条目来自公开安全读取视图。")
    .replace(
      "Supabase coverage depends on rows already persisted into the public retrieval view.",
      "公开覆盖范围取决于已经入库的可公开证据。"
    )
    .replace(
      "Supabase public reads were unavailable during export; reused the previous public-safe Cloudflare snapshot instead of degrading to incomplete local data.",
      "本次展示复用上一版公开快照，避免因来源暂不可用而降级为空数据。"
    )
    .replace(
      "Supabase public radar view returned no public-safe rows; local generated radar data was used.",
      "公开雷达视图没有返回可展示条目，本次展示使用已生成的公开证据数据。"
    )
    .replace(
      "This snapshot used local generated data because Supabase public reads were unavailable to the export process.",
      "本次展示使用已生成的公开证据数据。"
    )
    .replace(
      "This surface shows available AI Radar evidence only; it is not a claim of complete current AI industry coverage.",
      "此页面只展示当前可用的 AI 行业雷达证据，不声称覆盖完整实时行业。"
    )
    .replace(
      /(\d+) item\(s\) are marked needs_review and require human confirmation before confident synthesis\./g,
      "$1 条标记为待复核，需要人工确认后才能进行高置信综合。"
    )
    .replace(/(\d+) included and (\d+) needs_review item\(s\)\./g, "$1 条已纳入，$2 条待复核。")
    .replace(/(\d+) radar item\(s\) matched this section\./g, "$1 条雷达条目匹配本章节。")
    .replace(/(\d+) still need review\./g, "$1 条仍需复核。")
    .replace(/Visible categories: ([^.]+)\./g, (_, categories: string) => {
      return `可见类别： ${categories
        .split(",")
        .map((category) => publicCategoryLabel(category.trim()))
        .join("、")}。`;
    })
    .replace(/Top visible signal:/g, "最高可见信号：")
    .replace(/(最高可见信号：[^.。]+) from ([^.。]+)([.。])/g, "$1 来自 $2$3")
    .replace(/Model \/ product \/ company updates/g, "模型/产品/公司更新")
    .replace(/Research \/ open-source/g, "研究/开源")
    .replace(/Agents \/ products/g, "智能体/产品")
    .replace(/Business \/ ecosystem/g, "商业/生态")
    .replace(/Weak signals \/ needs_review/g, "弱信号/待复核")
    .replace(/No specific article content is included\./g, "未采集到具体文章正文。")
    .replace(/needs_review/g, "待复核")
    .replace(/included/g, "已纳入")
    .replace(/([a-z_]+) count failed: TypeError: fetch failed/g, (_, table: string) => `${publicMetricLabel(table)}计数读取失败：网络连接失败`)
    .replace(/([a-z_]+) latest timestamp failed: TypeError: fetch failed/g, (_, table: string) => `${publicMetricLabel(table)}最新时间读取失败：网络连接失败`)
    .replace(/public_radar_items read failed: TypeError: fetch failed/g, "公开雷达条目读取失败：网络连接失败")
    .replace(/includes newest public-safe live DeepSeek activation output/gi, "includes latest public evidence update")
    .replace(/includes newest public-safe refresh output/gi, "includes latest public evidence update")
    .replace(/includes latest public-safe refresh output/gi, "includes latest public evidence update")
    .replace(/live DeepSeek activation/gi, "public evidence update")
    .replace(/public-safe refresh/gi, "public evidence update")
    .replace(/public evidence refresh/gi, "public evidence update")
    .replace(/activation_[a-z0-9_-]+/gi, "refresh run")
    .replace(/\bactivation\b/gi, "refresh");
}

function isInternalRunLogNote(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("refresh run") ||
    normalized.includes("public-safe refresh public-safe refresh") ||
    normalized.includes("public evidence update contributed") ||
    normalized.includes("cloudflare_snapshot") ||
    normalized.includes("cloudflare static snapshot export") ||
    normalized.includes("getaddrinfo") ||
    normalized.includes("enotfound") ||
    normalized.includes("typeerror: fetch failed") ||
    normalized.includes("read failed") ||
    normalized.includes("count failed") ||
    normalized.includes("latest timestamp failed") ||
    normalized.includes("读取失败") ||
    normalized.includes("计数读取失败") ||
    normalized.includes("最新时间读取失败") ||
    normalized.includes("网络连接失败") ||
    normalized.includes("duplicate refresh rows") ||
    normalized.includes("去重后新增") ||
    normalized.includes("本轮 public evidence update") ||
    normalized.includes("本轮公开证据更新") ||
    normalized.includes("supabase public reads were unavailable") ||
    normalized.includes("public-safe cloudflare") ||
    normalized.includes("activation_") ||
    normalized.includes("live deepseek activation") ||
    normalized.includes("activation merge")
  );
}

function publicCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    agent: "智能体",
    benchmark: "基准",
    business: "商业",
    infrastructure: "基础设施",
    model_release: "模型发布",
    open_source: "开源",
    opinion: "观点",
    other: "其他",
    policy: "政策",
    product_update: "产品更新",
    research: "研究",
    safety: "安全",
    tooling: "工具"
  };

  return labels[value] ?? value.replace(/_/g, " ");
}

function publicMetricLabel(value: string) {
  const labels: Record<string, string> = {
    entities: "实体",
    ingestion_runs: "采集运行",
    item_entities: "条目实体",
    public_radar_items: "公开雷达条目",
    radar_items: "雷达条目",
    raw_items: "原始条目",
    scores: "评分",
    sources: "来源",
    understanding_runs: "理解运行"
  };

  return labels[value] ?? "公开数据";
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/gi, "sk-[redacted]")
    .replace(
      /\b(authorization|api[-_]?key|token|cookie|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|DEEPSEEK_API_KEY)\b\s*[:=]\s*[^\s,;]+/gi,
      "[redacted secret]"
    )
    .slice(0, 400);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(`Cloudflare public snapshot failed: ${sanitizeError(error)}`);
    process.exit(1);
  });
