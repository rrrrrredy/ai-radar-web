import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  EventScoreLabel,
  PublicEventCluster,
  PublicEventClusterItem,
  PublicEventLayer
} from "@/lib/events/clustering";
import type { RetrievalDataSource } from "@/lib/retrieval/types";
import { isEnabled } from "@/lib/utils";

type PersistableEventLayer = Pick<PublicEventLayer, "event_clusters" | "event_cluster_items">;

type IdRow = {
  id: string;
  local_id: string | null;
};

export type EventClusterUpsertRow = Record<string, unknown> & {
  canonical_title: string;
  category: string;
  caveats: string[];
  citations: PublicEventCluster["citations"];
  confidence: "high" | "medium" | "low";
  event_score: number;
  event_score_label: EventScoreLabel;
  first_seen_at: string;
  importance_score: number;
  latest_seen_at: string;
  local_id: string;
  related_entities: string[];
  related_item_ids: string[];
  score_reason: string;
  source_count: number;
  source_families: string[];
  source_tier_max: string;
  status: "draft" | "reviewed";
  summary_en: null;
  summary_zh: string;
  timeline: PublicEventCluster["timeline"];
  title_en: string;
  title_zh: string;
  updated_at: string;
};

export type EventClusterItemUpsertRow = Record<string, unknown> & {
  event_cluster_id: string;
  event_local_id: string;
  radar_item_id: string;
  radar_item_local_id: string;
  role: PublicEventClusterItem["role"];
  source_name: string;
};

export type EventLayerPersistenceResult = {
  eventClustersArchived: number;
  eventClusterItemsUpserted: number;
  eventClustersUpserted: number;
};

export type EventLayerPersistenceOptions = {
  batchSize?: number;
  persistedAt?: string;
  staleClusterReconciliation?: StaleClusterReconciliationGuard;
};

export type StaleClusterReconciliationGuard = {
  directSupabaseRead: boolean;
  dataSource: RetrievalDataSource;
  eligibleInputItemCount: number;
  minimumExistingClusterCoverageRatio: number;
  minimumInputItemCount: number;
};

export const MINIMUM_STALE_CLUSTER_INPUT_ITEMS = 20;
export const MINIMUM_STALE_CLUSTER_COVERAGE_RATIO = 0.5;

export function assertEventPersistenceWriteEnabled(value = process.env.ENABLE_SUPABASE_WRITES) {
  if (!isEnabled(value)) {
    throw new Error("Event persistence requires ENABLE_SUPABASE_WRITES=true.");
  }
}

export function buildEventClusterUpsertRows(
  events: PublicEventCluster[],
  persistedAt = new Date().toISOString()
): EventClusterUpsertRow[] {
  const updatedAt = requiredTimestamp(persistedAt, "event persistence timestamp");
  const seenLocalIds = new Set<string>();

  return events.map((event) => {
    const localId = requiredIdentifier(event.event_cluster_id, "event cluster local id");
    if (seenLocalIds.has(localId)) {
      throw new Error(`Duplicate event cluster local id: ${localId}`);
    }
    seenLocalIds.add(localId);

    const eventScore = boundedInteger(event.event_score, 0, 100, `event score for ${localId}`);
    const sourceCount = boundedInteger(event.source_count, 0, Number.MAX_SAFE_INTEGER, `source count for ${localId}`);
    const canonicalTitle = requiredText(event.canonical_title, `canonical title for ${localId}`);

    return {
      canonical_title: canonicalTitle,
      category: requiredText(event.category, `category for ${localId}`),
      caveats: [...event.caveats],
      citations: event.citations.map((citation) => ({ ...citation })),
      confidence: databaseConfidence(event.event_score_label),
      event_score: eventScore,
      event_score_label: event.event_score_label,
      first_seen_at: requiredTimestamp(event.first_seen_at, `first seen timestamp for ${localId}`),
      importance_score: eventScore / 100,
      latest_seen_at: requiredTimestamp(event.latest_seen_at, `latest seen timestamp for ${localId}`),
      local_id: localId,
      related_entities: [...event.related_entities],
      related_item_ids: [...event.related_item_ids],
      score_reason: event.score_reason,
      source_count: sourceCount,
      source_families: [...event.source_families],
      source_tier_max: event.source_tier_max,
      status: event.event_score_label === "噪音/低相关" ? "draft" : "reviewed",
      summary_en: null,
      summary_zh: event.summary_zh,
      timeline: event.timeline.map((entry) => ({ ...entry })),
      title_en: canonicalTitle,
      title_zh: canonicalTitle,
      updated_at: updatedAt
    };
  });
}

export function buildEventClusterItemUpsertRows(
  items: PublicEventClusterItem[],
  eventDatabaseIds: ReadonlyMap<string, string>,
  radarItemDatabaseIds: ReadonlyMap<string, string>
): EventClusterItemUpsertRow[] {
  const rows: EventClusterItemUpsertRow[] = [];
  const seenPairs = new Set<string>();

  for (const item of items) {
    const eventLocalId = requiredIdentifier(item.event_cluster_id, "event cluster local id");
    const radarItemLocalId = requiredIdentifier(item.radar_item_id, "radar item local id");
    const eventClusterId = eventDatabaseIds.get(eventLocalId);
    const radarItemId = radarItemDatabaseIds.get(radarItemLocalId);

    if (!eventClusterId) {
      throw new Error(`Event cluster ${eventLocalId} must be upserted before its items.`);
    }
    if (!radarItemId) {
      throw new Error(`Radar item ${radarItemLocalId} must exist before event relationships are persisted.`);
    }

    const pair = `${eventClusterId}:${radarItemId}`;
    if (seenPairs.has(pair)) {
      throw new Error(`Duplicate event cluster item relationship: ${eventLocalId}/${radarItemLocalId}`);
    }
    seenPairs.add(pair);

    rows.push({
      event_cluster_id: eventClusterId,
      event_local_id: eventLocalId,
      radar_item_id: radarItemId,
      radar_item_local_id: radarItemLocalId,
      role: item.role,
      source_name: item.source_name
    });
  }

  return rows;
}

export async function persistEventLayer(
  supabase: SupabaseClient,
  layer: PersistableEventLayer,
  options: EventLayerPersistenceOptions = {}
): Promise<EventLayerPersistenceResult> {
  assertEventPersistenceWriteEnabled();

  const batchSize = positiveInteger(options.batchSize ?? 200, "event persistence batch size");
  const clusterRows = buildEventClusterUpsertRows(layer.event_clusters, options.persistedAt);
  const eventLocalIds = clusterRows.map((row) => row.local_id);
  const radarItemLocalIds = uniqueIdentifiers(layer.event_cluster_items.map((item) => item.radar_item_id));
  const staleClusterIds = options.staleClusterReconciliation
    ? await planStaleGeneratedClusterArchival(
        supabase,
        new Set(eventLocalIds),
        radarItemLocalIds.length,
        options.staleClusterReconciliation
      )
    : [];
  const radarItemDatabaseIds = await loadRadarItemDatabaseIds(supabase, radarItemLocalIds, batchSize);
  assertAllIdentifiersResolved("radar_items", radarItemLocalIds, radarItemDatabaseIds);

  await upsertRowsInBatches(supabase, "event_clusters", clusterRows, "local_id", batchSize);

  const eventDatabaseIds = await loadIdsByLocalId(supabase, "event_clusters", eventLocalIds, batchSize);
  assertAllIdentifiersResolved("event_clusters", eventLocalIds, eventDatabaseIds);

  const itemRows = buildEventClusterItemUpsertRows(
    layer.event_cluster_items,
    eventDatabaseIds,
    radarItemDatabaseIds
  );
  await upsertRowsInBatches(
    supabase,
    "event_cluster_items",
    itemRows,
    "event_cluster_id,radar_item_id",
    batchSize
  );
  const eventClustersArchived = await archiveStaleGeneratedClusters(
    supabase,
    staleClusterIds,
    requiredTimestamp(options.persistedAt ?? new Date().toISOString(), "event persistence timestamp"),
    batchSize
  );

  return {
    eventClustersArchived,
    eventClusterItemsUpserted: itemRows.length,
    eventClustersUpserted: clusterRows.length
  };
}

async function planStaleGeneratedClusterArchival(
  supabase: SupabaseClient,
  currentLocalIds: ReadonlySet<string>,
  clusteredInputItemCount: number,
  guard: StaleClusterReconciliationGuard
) {
  assertStaleClusterReconciliationGuard(guard, clusteredInputItemCount);

  const { data, error } = await supabase
    .from("event_clusters")
    .select("id, local_id")
    .like("local_id", "event_%")
    .in("status", ["draft", "reviewed"])
    .limit(10_000);
  if (error) {
    throw new Error(`Unable to load generated event clusters for reconciliation: ${error.message}`);
  }

  const generatedClusters = ((data ?? []) as IdRow[]).filter((row) => row.local_id);
  if (generatedClusters.length === 0) {
    return [];
  }

  const coveredClusterCount = generatedClusters.filter(
    (row) => row.local_id && currentLocalIds.has(row.local_id)
  ).length;
  const coverageRatio = coveredClusterCount / generatedClusters.length;
  if (coverageRatio < guard.minimumExistingClusterCoverageRatio) {
    throw new Error(
      `Stale event reconciliation coverage guard failed: current clusters cover ${coveredClusterCount}/${generatedClusters.length} active generated clusters (${coverageRatio.toFixed(3)}), below the required ${guard.minimumExistingClusterCoverageRatio.toFixed(3)}.`
    );
  }

  return generatedClusters
    .filter((row) => row.local_id && !currentLocalIds.has(row.local_id))
    .map((row) => row.id);
}

function assertStaleClusterReconciliationGuard(
  guard: StaleClusterReconciliationGuard,
  clusteredInputItemCount: number
) {
  if (guard.dataSource !== "supabase_radar_items") {
    throw new Error("Stale event reconciliation requires authoritative public/Supabase radar input.");
  }

  if (guard.directSupabaseRead !== true) {
    throw new Error("Stale event reconciliation requires a direct Supabase public-view read from the current run.");
  }

  const eligibleInputItemCount = boundedInteger(
    guard.eligibleInputItemCount,
    0,
    Number.MAX_SAFE_INTEGER,
    "eligible event reconciliation input item count"
  );
  const minimumInputItemCount = positiveInteger(
    guard.minimumInputItemCount,
    "minimum event reconciliation input item count"
  );
  if (minimumInputItemCount < MINIMUM_STALE_CLUSTER_INPUT_ITEMS) {
    throw new Error(
      `Stale event reconciliation minimum input guard must be at least ${MINIMUM_STALE_CLUSTER_INPUT_ITEMS} items.`
    );
  }
  if (eligibleInputItemCount < minimumInputItemCount) {
    throw new Error(
      `Stale event reconciliation input coverage guard failed: ${eligibleInputItemCount} eligible items is below the required ${minimumInputItemCount}.`
    );
  }
  if (clusteredInputItemCount < minimumInputItemCount) {
    throw new Error(
      `Stale event reconciliation clustered-input coverage guard failed: ${clusteredInputItemCount} unique clustered items is below the required ${minimumInputItemCount}.`
    );
  }
  if (clusteredInputItemCount > eligibleInputItemCount) {
    throw new Error(
      `Stale event reconciliation guard is inconsistent: ${clusteredInputItemCount} clustered items exceeds ${eligibleInputItemCount} eligible input items.`
    );
  }

  const minimumCoverageRatio = guard.minimumExistingClusterCoverageRatio;
  if (!Number.isFinite(minimumCoverageRatio) || minimumCoverageRatio < MINIMUM_STALE_CLUSTER_COVERAGE_RATIO || minimumCoverageRatio > 1) {
    throw new Error(
      `Stale event reconciliation cluster coverage guard must be between ${MINIMUM_STALE_CLUSTER_COVERAGE_RATIO} and 1.`
    );
  }
}

async function archiveStaleGeneratedClusters(
  supabase: SupabaseClient,
  staleIds: string[],
  persistedAt: string,
  batchSize: number
) {

  for (const batch of chunkRows(staleIds, batchSize)) {
    const { error: updateError } = await supabase
      .from("event_clusters")
      .update({ status: "archived", updated_at: persistedAt })
      .in("id", batch)
      .in("status", ["draft", "reviewed"]);
    if (updateError) {
      throw new Error(`Unable to archive stale event clusters: ${updateError.message}`);
    }
  }

  return staleIds.length;
}

async function loadRadarItemDatabaseIds(
  supabase: SupabaseClient,
  identifiers: string[],
  batchSize: number
) {
  const ids = await loadIdsByLocalId(supabase, "radar_items", identifiers, batchSize);
  const databaseIdCandidates = identifiers.filter((identifier) => !ids.has(identifier) && isUuid(identifier));

  for (const batch of chunkRows(databaseIdCandidates, batchSize)) {
    const { data, error } = await supabase.from("radar_items").select("id, local_id").in("id", batch);
    if (error) {
      throw new Error(`Unable to resolve radar_items database ids: ${error.message}`);
    }

    for (const row of (data ?? []) as IdRow[]) {
      ids.set(row.id, row.id);
      if (row.local_id) {
        ids.set(row.local_id, row.id);
      }
    }
  }

  return ids;
}

async function loadIdsByLocalId(
  supabase: SupabaseClient,
  table: "event_clusters" | "radar_items",
  localIds: string[],
  batchSize: number
) {
  const ids = new Map<string, string>();

  for (const batch of chunkRows(uniqueIdentifiers(localIds), batchSize)) {
    const { data, error } = await supabase.from(table).select("id, local_id").in("local_id", batch);
    if (error) {
      throw new Error(`Unable to resolve ${table} local ids: ${error.message}`);
    }

    for (const row of (data ?? []) as IdRow[]) {
      if (row.local_id) {
        ids.set(row.local_id, row.id);
      }
    }
  }

  return ids;
}

async function upsertRowsInBatches(
  supabase: SupabaseClient,
  table: "event_clusters" | "event_cluster_items",
  rows: Array<Record<string, unknown>>,
  onConflict: string,
  batchSize: number
) {
  for (const batch of chunkRows(rows, batchSize)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      throw new Error(`Unable to upsert ${table}: ${error.message}`);
    }
  }
}

function assertAllIdentifiersResolved(
  table: string,
  identifiers: string[],
  databaseIds: ReadonlyMap<string, string>
) {
  const missing = identifiers.filter((identifier) => !databaseIds.has(identifier));
  if (missing.length === 0) {
    return;
  }

  const visible = missing.slice(0, 10).join(", ");
  const remainder = missing.length > 10 ? ` (+${missing.length - 10} more)` : "";
  throw new Error(`Unable to resolve ${table} ids for event persistence: ${visible}${remainder}`);
}

function databaseConfidence(label: EventScoreLabel): "high" | "medium" | "low" {
  if (label === "高优先级") return "high";
  if (label === "关注") return "medium";
  return "low";
}

function uniqueIdentifiers(values: string[]) {
  return Array.from(new Set(values.map((value) => requiredIdentifier(value, "local identifier"))));
}

function requiredIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function requiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function requiredTimestamp(value: string, label: string) {
  if (!value || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return value;
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function positiveInteger(value: number, label: string) {
  return boundedInteger(value, 1, Number.MAX_SAFE_INTEGER, label);
}

function chunkRows<T>(rows: T[], batchSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    chunks.push(rows.slice(index, index + batchSize));
  }
  return chunks;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
