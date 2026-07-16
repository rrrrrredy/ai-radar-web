import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PublicEventCluster, PublicEventClusterItem } from "@/lib/events/clustering";
import {
  MINIMUM_STALE_CLUSTERED_INPUT_COVERAGE_RATIO,
  MINIMUM_STALE_CLUSTER_COVERAGE_RATIO,
  MINIMUM_STALE_CLUSTER_INPUT_ITEMS,
  assertAuthoritativeEventPersistenceInput,
  assertEventPersistenceWriteEnabled,
  buildEventClusterItemUpsertRows,
  buildEventClusterUpsertRows,
  persistEventLayer,
  type StaleClusterReconciliationGuard
} from "@/lib/events/persistence";

const persistedAt = "2026-07-14T08:00:00.000Z";
const eventDatabaseId = "11111111-1111-4111-8111-111111111111";
const radarItemDatabaseId = "22222222-2222-4222-8222-222222222222";
const authoritativeReconciliationGuard: StaleClusterReconciliationGuard = {
  directSupabaseRead: true,
  dataSource: "supabase_radar_items",
  eligibleInputItemCount: MINIMUM_STALE_CLUSTER_INPUT_ITEMS,
  minimumClusteredInputCoverageRatio: MINIMUM_STALE_CLUSTERED_INPUT_COVERAGE_RATIO,
  minimumExistingClusterCoverageRatio: MINIMUM_STALE_CLUSTER_COVERAGE_RATIO,
  minimumInputItemCount: MINIMUM_STALE_CLUSTER_INPUT_ITEMS
};
const authoritativePersistenceProvenance = {
  dataSource: "supabase_radar_items",
  directSupabaseRead: true
} as const;

const event: PublicEventCluster = {
  canonical_title: "OpenAI releases a durable event API",
  category: "product_update",
  caveats: ["Single-source evidence needs follow-up."],
  citations: [
    {
      collected_at: "2026-07-14T07:05:00.000Z",
      item_id: "radar_item_1",
      published_at: "2026-07-14T07:00:00.000Z",
      source_name: "OpenAI",
      title: "OpenAI releases a durable event API",
      url: "https://example.com/events"
    }
  ],
  event_cluster_id: "event_1234567890abcdef1234",
  event_score: 82,
  event_score_label: "高优先级",
  first_seen_at: "2026-07-14T07:00:00.000Z",
  latest_seen_at: "2026-07-14T07:00:00.000Z",
  related_entities: ["openai"],
  related_item_ids: ["radar_item_1"],
  score_reason: "High relevance with a primary source.",
  source_count: 1,
  source_families: ["公司/实验室"],
  source_tier_max: "official",
  summary_zh: "OpenAI 发布了可持久化的事件 API。",
  timeline: [
    {
      item_id: "radar_item_1",
      source_name: "OpenAI",
      timestamp: "2026-07-14T07:00:00.000Z",
      title: "OpenAI releases a durable event API",
      url: "https://example.com/events"
    }
  ]
};

const relationship: PublicEventClusterItem = {
  event_cluster_id: event.event_cluster_id,
  radar_item_id: "radar_item_1",
  role: "primary",
  source_name: "OpenAI"
};
const coveredRadarItemIds = Array.from(
  { length: MINIMUM_STALE_CLUSTER_INPUT_ITEMS },
  (_, index) => `radar_item_${index + 1}`
);
const coveredEventIds = Array.from({ length: 9 }, (_, index) =>
  index === 0 ? event.event_cluster_id : `event_covered_${String(index + 1).padStart(2, "0")}`
);
const coveredRelationships: PublicEventClusterItem[] = coveredRadarItemIds.map((radarItemId, index) => ({
  event_cluster_id: coveredEventIds[index % coveredEventIds.length],
  radar_item_id: radarItemId,
  role: index === 0 ? "primary" : "supporting",
  source_name: index === 0 ? "OpenAI" : `Public source ${index + 1}`
}));
const coveredLayer = {
  event_cluster_items: coveredRelationships,
  event_clusters: coveredEventIds.map((eventId) => ({
    ...event,
    event_cluster_id: eventId,
    related_item_ids: coveredRelationships
      .filter((item) => item.event_cluster_id === eventId)
      .map((item) => item.radar_item_id)
  }))
};

test("event persistence requires the explicit Supabase write gate", () => {
  assert.doesNotThrow(() => assertEventPersistenceWriteEnabled("true"));
  assert.doesNotThrow(() => assertEventPersistenceWriteEnabled("TRUE"));
  assert.throws(() => assertEventPersistenceWriteEnabled(undefined), /ENABLE_SUPABASE_WRITES=true/);
  assert.throws(() => assertEventPersistenceWriteEnabled("false"), /ENABLE_SUPABASE_WRITES=true/);
  assert.throws(() => assertEventPersistenceWriteEnabled("1"), /ENABLE_SUPABASE_WRITES=true/);
});

test("event persistence rejects non-authoritative fallback inputs", () => {
  assert.doesNotThrow(() => assertAuthoritativeEventPersistenceInput("supabase_radar_items", true));
  assert.throws(
    () => assertAuthoritativeEventPersistenceInput("supabase_radar_items", false),
    /authoritative direct Supabase/
  );
  assert.throws(
    () => assertAuthoritativeEventPersistenceInput("local_understanding_output", false),
    /local, snapshot, mock, and fallback inputs are rejected/
  );
  assert.throws(() => assertAuthoritativeEventPersistenceInput("mock_data", false), /fallback inputs are rejected/);
});

test("the persistence boundary rejects non-authoritative provenance before any database operation", async () => {
  await withEventWriteGate(async () => {
    for (const dataSource of ["mock_data", "local_understanding_output"] as const) {
      const fake = createFakeSupabase();
      await assert.rejects(
        persistEventLayer(
          fake.client,
          { event_cluster_items: [relationship], event_clusters: [event] },
          {
            batchSize: 50,
            persistedAt,
            provenance: { dataSource, directSupabaseRead: false }
          }
        ),
        /authoritative direct Supabase/
      );
      assert.equal(fake.updates.length, 0);
      assert.equal(fake.upserts.length, 0);
    }
  });
});

test("event rows preserve stable ids and all public-safe event fields", () => {
  const first = buildEventClusterUpsertRows([event], persistedAt);
  const second = buildEventClusterUpsertRows([event], persistedAt);

  assert.deepEqual(first, second);
  assert.equal(first[0].local_id, event.event_cluster_id);
  assert.equal(first[0].canonical_title, event.canonical_title);
  assert.equal(first[0].category, event.category);
  assert.equal(first[0].event_score, event.event_score);
  assert.equal(first[0].event_score_label, event.event_score_label);
  assert.equal(first[0].score_reason, event.score_reason);
  assert.equal(first[0].source_count, event.source_count);
  assert.deepEqual(first[0].source_families, event.source_families);
  assert.equal(first[0].source_tier_max, event.source_tier_max);
  assert.equal(first[0].first_seen_at, event.first_seen_at);
  assert.equal(first[0].latest_seen_at, event.latest_seen_at);
  assert.deepEqual(first[0].timeline, event.timeline);
  assert.deepEqual(first[0].citations, event.citations);
  assert.equal(first[0].importance_score, 0.82);
  assert.equal(Object.hasOwn(first[0], "id"), false);
});

test("event relationship rows use resolved database ids and retain local ids", () => {
  const rows = buildEventClusterItemUpsertRows(
    [relationship],
    new Map([[event.event_cluster_id, eventDatabaseId]]),
    new Map([[relationship.radar_item_id, radarItemDatabaseId]])
  );

  assert.deepEqual(rows, [
    {
      event_cluster_id: eventDatabaseId,
      event_local_id: event.event_cluster_id,
      radar_item_id: radarItemDatabaseId,
      radar_item_local_id: relationship.radar_item_id,
      role: "primary",
      source_name: "OpenAI"
    }
  ]);
  assert.throws(
    () => buildEventClusterItemUpsertRows([relationship], new Map(), new Map()),
    /must be upserted before its items/
  );
});

test("authoritative persistence performs idempotent upserts and guarded non-destructive archival", async () => {
  await withEventWriteGate(async () => {
    const fake = createFakeSupabase();

    const first = await persistEventLayer(fake.client, coveredLayer, {
      batchSize: 50,
      persistedAt,
      provenance: authoritativePersistenceProvenance,
      staleClusterReconciliation: authoritativeReconciliationGuard
    });
    const second = await persistEventLayer(fake.client, coveredLayer, {
      batchSize: 50,
      persistedAt,
      provenance: authoritativePersistenceProvenance,
      staleClusterReconciliation: authoritativeReconciliationGuard
    });

    assert.deepEqual(first, {
      eventClusterItemsUpserted: MINIMUM_STALE_CLUSTER_INPUT_ITEMS,
      eventClustersArchived: 1,
      eventClustersUpserted: coveredEventIds.length
    });
    assert.deepEqual(second, first);
    assert.equal(fake.upserts.length, 4);
    assert.deepEqual(
      fake.upserts.map((operation) => [operation.table, operation.onConflict]),
      [
        ["event_clusters", "local_id"],
        ["event_cluster_items", "event_cluster_id,radar_item_id"],
        ["event_clusters", "local_id"],
        ["event_cluster_items", "event_cluster_id,radar_item_id"]
      ]
    );
    assert.equal(fake.updates.length, 2);
    assert.deepEqual(fake.updates[0]?.ids, ["event-database-stale"]);
    assert.equal(fake.updates[0]?.values.status, "archived");
    assert.deepEqual(fake.updates[0]?.statuses, ["draft", "reviewed"]);
    assert.equal(fake.updates.some((operation) => operation.ids.includes("event-database-published")), false);
    assert.equal(fake.destructiveCalls, 0);
  });
});

test("persistence cannot archive without an explicit reconciliation guard", async () => {
  await withEventWriteGate(async () => {
    const fake = createFakeSupabase();
    const result = await persistEventLayer(
      fake.client,
      { event_cluster_items: [relationship], event_clusters: [event] },
      { batchSize: 50, persistedAt, provenance: authoritativePersistenceProvenance }
    );

    assert.equal(result.eventClustersArchived, 0);
    assert.equal(fake.updates.length, 0);
    assert.equal(fake.upserts.length, 2);
  });
});

test("mock and local fallback inputs cannot authorize stale-cluster reconciliation", async () => {
  await withEventWriteGate(async () => {
    for (const dataSource of ["mock_data", "local_understanding_output"] as const) {
      const fake = createFakeSupabase();
      await assert.rejects(
        persistEventLayer(
          fake.client,
          { event_cluster_items: [relationship], event_clusters: [event] },
          {
            batchSize: 50,
            persistedAt,
            provenance: authoritativePersistenceProvenance,
            staleClusterReconciliation: {
              ...authoritativeReconciliationGuard,
              dataSource
            }
          }
        ),
        /authoritative public\/Supabase radar input/
      );
      assert.equal(fake.updates.length, 0);
      assert.equal(fake.upserts.length, 0);
    }
  });
});

test("a Supabase-shaped fallback snapshot cannot authorize stale-cluster reconciliation", async () => {
  await withEventWriteGate(async () => {
    const fake = createFakeSupabase();
    await assert.rejects(
      persistEventLayer(fake.client, coveredLayer, {
        batchSize: 50,
        persistedAt,
        provenance: authoritativePersistenceProvenance,
        staleClusterReconciliation: {
          ...authoritativeReconciliationGuard,
          directSupabaseRead: false
        }
      }),
      /direct Supabase public-view read/
    );
    assert.equal(fake.updates.length, 0);
    assert.equal(fake.upserts.length, 0);
  });
});

test("a degraded tiny public feed cannot archive stale clusters", async () => {
  await withEventWriteGate(async () => {
    const fake = createFakeSupabase();
    await assert.rejects(
      persistEventLayer(
        fake.client,
        { event_cluster_items: [relationship], event_clusters: [event] },
        {
          batchSize: 50,
          persistedAt,
          provenance: authoritativePersistenceProvenance,
          staleClusterReconciliation: authoritativeReconciliationGuard
        }
      ),
      /clustered-input coverage guard failed/
    );
    assert.equal(fake.updates.length, 0);
    assert.equal(fake.upserts.length, 0);
  });
});

test("a public feed with poor retained-cluster coverage cannot archive stale clusters", async () => {
  await withEventWriteGate(async () => {
    const fake = createFakeSupabase({
      generatedClusters: [
        { id: eventDatabaseId, local_id: event.event_cluster_id, status: "reviewed" },
        { id: "event-database-stale-1", local_id: "event_stale_1", status: "draft" },
        { id: "event-database-stale-2", local_id: "event_stale_2", status: "reviewed" }
      ]
    });
    await assert.rejects(
      persistEventLayer(
        fake.client,
        coveredLayer,
        {
          batchSize: 50,
          persistedAt,
          provenance: authoritativePersistenceProvenance,
          staleClusterReconciliation: authoritativeReconciliationGuard
        }
      ),
      /current clusters cover 1\/3 active generated clusters/
    );
    assert.equal(fake.updates.length, 0);
    assert.equal(fake.upserts.length, 0);
  });
});

test("migration is additive and provides conflict keys for both tables", async () => {
  const migration = await fs.readFile(
    path.join(process.cwd(), "supabase", "migrations", "202607140001_event_layer_persistence.sql"),
    "utf8"
  );

  assert.doesNotMatch(migration, /\btruncate\b|\bdelete\s+from\b|\bdrop\s+table\b/i);
  assert.match(migration, /unique index[\s\S]+event_clusters\(local_id\)/i);
  assert.match(migration, /unique index[\s\S]+event_cluster_items\(event_local_id, radar_item_local_id\)/i);
});

function createFakeSupabase(options: {
  generatedClusters?: Array<{ id: string; local_id: string; status: string }>;
} = {}) {
  const upserts: Array<{ onConflict: string; rows: Array<Record<string, unknown>>; table: string }> = [];
  const updates: Array<{ ids: string[]; statuses: string[]; table: string; values: Record<string, unknown> }> = [];
  const generatedClusters = options.generatedClusters ?? [
    ...coveredEventIds.map((localId, index) => ({
      id: index === 0 ? eventDatabaseId : `database-${localId}`,
      local_id: localId,
      status: "reviewed"
    })),
    { id: "event-database-stale", local_id: "event_stale", status: "draft" },
    { id: "event-database-published", local_id: "event_published", status: "published" },
    { id: "event-database-archived", local_id: "event_archived", status: "archived" }
  ];
  let destructiveCalls = 0;

  const client = {
    from(table: string) {
      return {
        delete() {
          destructiveCalls += 1;
          return Promise.resolve({ data: null, error: null });
        },
        select() {
          return {
            in(column: string, values: string[]) {
              if (table === "radar_items" && column === "local_id") {
                return Promise.resolve({
                  data: values.map((localId) => ({
                    id: localId === relationship.radar_item_id ? radarItemDatabaseId : `database-${localId}`,
                    local_id: localId
                  })),
                  error: null
                });
              }

              if (table === "event_clusters" && column === "local_id") {
                return Promise.resolve({
                  data: values.map((localId) => ({
                    id: localId === event.event_cluster_id ? eventDatabaseId : `database-${localId}`,
                    local_id: localId
                  })),
                  error: null
                });
              }

              return Promise.resolve({ data: [], error: null });
            },
            like(column: string, pattern: string) {
              assert.equal(table, "event_clusters");
              assert.equal(column, "local_id");
              assert.equal(pattern, "event_%");
              return {
                in(statusColumn: string, statuses: string[]) {
                  assert.equal(statusColumn, "status");
                  assert.deepEqual(statuses, ["draft", "reviewed"]);
                  return {
                    limit() {
                      return Promise.resolve({
                        data: generatedClusters
                          .filter((row) => statuses.includes(row.status))
                          .map(({ id, local_id }) => ({ id, local_id })),
                        error: null
                      });
                    }
                  };
                }
              };
            }
          };
        },
        update(values: Record<string, unknown>) {
          return {
            in(column: string, ids: string[]) {
              assert.equal(column, "id");
              return {
                in(statusColumn: string, statuses: string[]) {
                  assert.equal(statusColumn, "status");
                  updates.push({ ids, statuses, table, values });
                  return Promise.resolve({ data: null, error: null });
                }
              };
            }
          };
        },
        upsert(rows: Array<Record<string, unknown>>, options: { onConflict: string }) {
          upserts.push({ onConflict: options.onConflict, rows, table });
          return Promise.resolve({ data: null, error: null });
        }
      };
    }
  } as unknown as SupabaseClient;

  return {
    client,
    get destructiveCalls() {
      return destructiveCalls;
    },
    updates,
    upserts
  };
}

async function withEventWriteGate(callback: () => Promise<void>) {
  const previousWriteGate = process.env.ENABLE_SUPABASE_WRITES;
  process.env.ENABLE_SUPABASE_WRITES = "true";
  try {
    await callback();
  } finally {
    if (previousWriteGate === undefined) {
      delete process.env.ENABLE_SUPABASE_WRITES;
    } else {
      process.env.ENABLE_SUPABASE_WRITES = previousWriteGate;
    }
  }
}
