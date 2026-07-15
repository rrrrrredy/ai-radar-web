import "@/lib/config/load-cli-env";

import fs from "node:fs/promises";
import path from "node:path";

import { auditCrossFamilyCandidates } from "@/lib/events/cross-family-audit";
import { buildEventLayer, filterPublicDisplayEventLayer } from "@/lib/events/clustering";
import { toClusterableRadarItem } from "@/lib/events/radar-item-adapter";
import { loadRadarFeed } from "@/lib/radar/feed";
import { assessPublicSignalQuality } from "@/lib/radar/public-signal-quality";

const outputPath = path.join(process.cwd(), "data", "reports", "cross-family-candidates.latest.json");

async function main() {
  const feed = await loadRadarFeed();
  const allItems = feed.items.map(toClusterableRadarItem);
  const items = allItems.filter(
    (item) =>
      (item.status === "included" || item.status === "needs_review") &&
      item.scores.ai_relevance >= 0.55 &&
      item.scores.overall >= 0.45 &&
      !assessPublicSignalQuality(item).isLowEventSignal
  );
  const layer = filterPublicDisplayEventLayer(buildEventLayer(items));
  const displayItemIds = new Set(layer.event_cluster_items.map((item) => item.radar_item_id));
  const displayItems = items.filter((item) => displayItemIds.has(item.id));
  const audit = auditCrossFamilyCandidates(displayItems, layer);
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    data_source: feed.data_source,
    total_radar_items: allItems.length,
    event_eligible_items: items.length,
    ...audit
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log("Cross-family event audit complete");
  console.log(`Data source: ${feed.data_source}`);
  console.log(`Radar items: ${allItems.length}`);
  console.log(`Event-eligible items: ${items.length}`);
  console.log(`Public display event items: ${audit.item_count}`);
  console.log(`Existing cross-family events: ${audit.diagnosis.current_cross_family_event_count}`);
  console.log(`Near cross-family candidates: ${audit.diagnosis.near_cross_family_candidate_count}`);
  console.log(`Likely clustering rule gaps: ${audit.diagnosis.likely_clustering_rule_gap_count}`);
  console.log(`Source coverage primary blocker: ${audit.diagnosis.source_coverage_is_primary_blocker}`);
  console.log(`Output: ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
