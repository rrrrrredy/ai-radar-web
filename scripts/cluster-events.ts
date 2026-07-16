import "@/lib/config/load-cli-env";

import fs from "node:fs/promises";
import path from "node:path";

import { buildEventLayer } from "@/lib/events/clustering";
import {
  MINIMUM_STALE_CLUSTERED_INPUT_COVERAGE_RATIO,
  MINIMUM_STALE_CLUSTER_COVERAGE_RATIO,
  MINIMUM_STALE_CLUSTER_INPUT_ITEMS,
  assertAuthoritativeEventPersistenceInput,
  persistEventLayer,
  type EventLayerPersistenceResult,
  type StaleClusterReconciliationGuard
} from "@/lib/events/persistence";
import { toClusterableRadarItem } from "@/lib/events/radar-item-adapter";
import { loadRadarFeed } from "@/lib/radar/feed";
import { getSupabaseServiceClientForWrite } from "@/lib/supabase/service";

const outputPath = path.join(process.cwd(), "data", "events", "latest", "event-layer.json");

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const feed = await loadRadarFeed();
  if (options.persist) {
    assertAuthoritativeEventPersistenceInput(feed.data_source, feed.authoritative_supabase_read);
  }
  const persistenceClient = options.persist ? getSupabaseServiceClientForWrite() : null;
  const eventLayer = buildEventLayer(feed.items.map(toClusterableRadarItem));
  const staleClusterReconciliation = buildStaleClusterReconciliationGuard(feed);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(eventLayer, null, 2)}\n`, "utf8");

  const persistence = persistenceClient
    ? await persistEventLayer(persistenceClient, eventLayer, { staleClusterReconciliation })
    : null;

  const mergedEvents = eventLayer.event_clusters.filter((event) => event.related_item_ids.length > 1);
  const averageItemsPerCluster =
    eventLayer.event_clusters.reduce((sum, event) => sum + event.related_item_ids.length, 0) /
    Math.max(1, eventLayer.event_clusters.length);

  console.log("Event clustering complete");
  console.log(`Data source: ${feed.data_source}`);
  console.log(`Radar items: ${feed.items.length}`);
  console.log(`Event clusters: ${eventLayer.event_count}`);
  console.log(`Curated events: ${eventLayer.curated_events.length}`);
  console.log(`Merged multi-item events: ${mergedEvents.length}`);
  console.log(`Average items per cluster: ${averageItemsPerCluster.toFixed(2)}`);
  console.log(`Output: ${path.relative(process.cwd(), outputPath)}`);
  console.log(persistenceSummary(persistence, Boolean(staleClusterReconciliation)));
}

function buildStaleClusterReconciliationGuard(
  feed: Awaited<ReturnType<typeof loadRadarFeed>>
): StaleClusterReconciliationGuard | undefined {
  if (feed.data_source !== "supabase_radar_items" || !feed.authoritative_supabase_read) {
    return undefined;
  }

  return {
    directSupabaseRead: true,
    dataSource: feed.data_source,
    eligibleInputItemCount: feed.counts.included + feed.counts.needs_review,
    minimumClusteredInputCoverageRatio: MINIMUM_STALE_CLUSTERED_INPUT_COVERAGE_RATIO,
    minimumExistingClusterCoverageRatio: MINIMUM_STALE_CLUSTER_COVERAGE_RATIO,
    minimumInputItemCount: MINIMUM_STALE_CLUSTER_INPUT_ITEMS
  };
}

function parseOptions(args: string[]) {
  const unsupported = args.filter((argument) => argument !== "--persist");
  if (unsupported.length > 0) {
    throw new Error(`Unsupported argument(s): ${unsupported.join(", ")}`);
  }

  return {
    persist: args.includes("--persist")
  };
}

function persistenceSummary(result: EventLayerPersistenceResult | null, staleReconciliationEnabled: boolean) {
  if (!result) {
    return "Supabase persistence: not requested (local output only)";
  }

  const reconciliationSummary = staleReconciliationEnabled
    ? `${result.eventClustersArchived} stale generated clusters archived`
    : "stale generated-cluster reconciliation skipped because the feed was not authoritative public/Supabase input";
  return `Supabase persistence: ${result.eventClustersUpserted} event clusters and ${result.eventClusterItemsUpserted} relationships upserted; ${reconciliationSummary}`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
