import "@/lib/config/load-cli-env";

import fs from "node:fs/promises";
import path from "node:path";

import { buildEventLayer } from "@/lib/events/clustering";
import { loadRadarFeed } from "@/lib/radar/feed";

const outputPath = path.join(process.cwd(), "data", "events", "latest", "event-layer.json");

async function main() {
  const feed = await loadRadarFeed();
  const eventLayer = buildEventLayer(
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
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(eventLayer, null, 2)}\n`, "utf8");

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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
