import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PublicEventCluster, PublicEventClusterItem } from "@/lib/events/clustering";
import {
  assertEventPersistenceWriteEnabled,
  buildEventClusterItemUpsertRows,
  buildEventClusterUpsertRows,
  persistEventLayer
} from "@/lib/events/persistence";

const persistedAt = "2026-07-14T08:00:00.000Z";
const eventDatabaseId = "11111111-1111-4111-8111-111111111111";
const radarItemDatabaseId = "22222222-2222-4222-8222-222222222222";

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

test("event persistence requires the explicit Supabase write gate", () => {
  assert.doesNotThrow(() => assertEventPersistenceWriteEnabled("true"));
  assert.doesNotThrow(() => assertEventPersistenceWriteEnabled("TRUE"));
  assert.throws(() => assertEventPersistenceWriteEnabled(undefined), /ENABLE_SUPABASE_WRITES=true/);
  assert.throws(() => assertEventPersistenceWriteEnabled("false"), /ENABLE_SUPABASE_WRITES=true/);
  assert.throws(() => assertEventPersistenceWriteEnabled("1"), /ENABLE_SUPABASE_WRITES=true/);
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

test("persistence performs idempotent upserts without destructive operations", async () => {
  const previousWriteGate = process.env.ENABLE_SUPABASE_WRITES;
  process.env.ENABLE_SUPABASE_WRITES = "true";

  try {
    const fake = createFakeSupabase();
    const layer = {
      event_cluster_items: [relationship],
      event_clusters: [event]
    };

    const first = await persistEventLayer(fake.client, layer, { batchSize: 50, persistedAt });
    const second = await persistEventLayer(fake.client, layer, { batchSize: 50, persistedAt });

    assert.deepEqual(first, { eventClusterItemsUpserted: 1, eventClustersUpserted: 1 });
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
    assert.equal(fake.destructiveCalls, 0);
  } finally {
    if (previousWriteGate === undefined) {
      delete process.env.ENABLE_SUPABASE_WRITES;
    } else {
      process.env.ENABLE_SUPABASE_WRITES = previousWriteGate;
    }
  }
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

function createFakeSupabase() {
  const upserts: Array<{ onConflict: string; rows: Array<Record<string, unknown>>; table: string }> = [];
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
                  data: values.includes(relationship.radar_item_id)
                    ? [{ id: radarItemDatabaseId, local_id: relationship.radar_item_id }]
                    : [],
                  error: null
                });
              }

              if (table === "event_clusters" && column === "local_id") {
                return Promise.resolve({
                  data: values.includes(event.event_cluster_id)
                    ? [{ id: eventDatabaseId, local_id: event.event_cluster_id }]
                    : [],
                  error: null
                });
              }

              return Promise.resolve({ data: [], error: null });
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
    upserts
  };
}
