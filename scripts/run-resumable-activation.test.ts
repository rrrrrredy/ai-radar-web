import assert from "node:assert/strict";

import type { IngestionSourceSummary } from "@/lib/ingestion/types";
import {
  aggregateFailureFamilies,
  aggregateSourceFamilyStatuses,
  hasBlockingActivationFailure,
  itemCountsBySourceFamily,
  parseArgs,
  resolveResumeCheckpoint,
  rotateSourceSelection,
  type ActivationCheckpoint,
  type ChunkCheckpoint
} from "@/scripts/run-resumable-activation";

const liveCheckpoint: ActivationCheckpoint = {
  schema_version: 1,
  run_id: "activation_test",
  mode: "live",
  limit: 3,
  chunk_size: 2,
  max_items_per_source: 9,
  selected_source_ids: ["official-a", "github-a", "official-b", "github-b"],
  started_at: "2026-07-14T00:00:00.000Z",
  updated_at: "2026-07-14T00:00:00.000Z",
  chunks: [],
  warnings: []
};

const defaultOptions = parseArgs([]);
assert.equal(defaultOptions.mode, "mock", "new runs must retain the existing mock default");
assert.equal(defaultOptions.modeExplicit, false);
assert.equal(defaultOptions.rotationOffset, 0);
assert.equal(parseArgs(["--rotation-offset", "40"]).rotationOffset, 40);
assert.deepEqual(
  rotateSourceSelection(["core-a", "core-b", "tail-a", "tail-b", "tail-c", "tail-d"], 4, 2, 2),
  ["core-a", "core-b", "tail-c", "tail-d"],
  "daily rotation must keep core sources while rotating the long tail"
);

const implicitResume = resolveResumeCheckpoint(
  liveCheckpoint,
  parseArgs(["--resume"]),
  "2026-07-14T01:00:00.000Z"
);
assert.equal(implicitResume.mode, "live", "resume must inherit a live checkpoint mode");
assert.equal(implicitResume.chunk_size, 2);
assert.equal(implicitResume.max_items_per_source, 9);
assert.deepEqual(implicitResume.selected_source_ids, liveCheckpoint.selected_source_ids);

const scaledResume = resolveResumeCheckpoint(
  liveCheckpoint,
  parseArgs([
    "--resume",
    "--limit", "2",
    "--chunk-size", "99",
    "--max-items-per-source", "99",
    "--source-id", "unrelated-source"
  ]),
  "2026-07-14T01:00:00.000Z"
);
assert.equal(scaledResume.mode, "live");
assert.equal(scaledResume.limit, 2, "an explicit limit may scale the checkpoint plan");
assert.equal(scaledResume.chunk_size, 2, "resume must preserve checkpoint chunk size");
assert.equal(scaledResume.max_items_per_source, 9, "resume must preserve checkpoint item limits");
assert.deepEqual(
  scaledResume.selected_source_ids,
  liveCheckpoint.selected_source_ids,
  "resume must preserve checkpoint source selection and ordering"
);

const extendedResume = resolveResumeCheckpoint(
  liveCheckpoint,
  parseArgs(["--resume", "--limit", "6"]),
  "2026-07-14T01:00:00.000Z",
  ["official-a", "github-a", "official-b", "github-b", "media-a", "research-a"]
);
assert.equal(extendedResume.limit, 6, "resume may extend a completed checkpoint to additional eligible sources");
assert.deepEqual(
  extendedResume.selected_source_ids,
  ["official-a", "github-a", "official-b", "github-b", "media-a", "research-a"],
  "checkpoint extension must append sources without reordering or losing completed chunks"
);
assert.equal(extendedResume.chunks.length, liveCheckpoint.chunks.length, "checkpoint extension must preserve completed chunks");

const explicitModeResume = resolveResumeCheckpoint(
  liveCheckpoint,
  parseArgs(["--resume", "--mode", "mock"]),
  "2026-07-14T01:00:00.000Z"
);
assert.equal(explicitModeResume.mode, "mock", "an explicit mode remains CLI-compatible");

const familyBySourceId = new Map([
  ["official-a", "official_company"],
  ["github-a", "github_open_source"]
]);
const itemCounts = itemCountsBySourceFamily([
  { source_id: "official-a", status: "included" },
  { source_id: "official-a", status: "excluded" },
  { source_id: "github-a", status: "included" },
  { source_id: "github-a", status: "needs_review" }
], familyBySourceId);
itemCounts.official_company.deduped = 1;
itemCounts.github_open_source.deduped = 2;

const familyChunk: Pick<ChunkCheckpoint, "source_results" | "source_family_counts"> = {
  source_results: [sourceResult("official-a"), sourceResult("github-a")],
  source_family_counts: itemCounts
};
const sourceFamilies = aggregateSourceFamilyStatuses(
  ["official-a", "github-a"],
  familyBySourceId,
  [familyChunk]
);
assert.equal(sourceFamilies.official_company.included, 1);
assert.equal(sourceFamilies.github_open_source.included, 1);
assert.equal(sumMetric(sourceFamilies, "included"), 2);
assert.equal(sumMetric(sourceFamilies, "needs_review"), 1);
assert.equal(sumMetric(sourceFamilies, "excluded"), 1);
assert.equal(sumMetric(sourceFamilies, "deduped"), 3);

const failureFamilies = aggregateFailureFamilies([
  { failure_families: { timeout: 1, rate_limit: 2 } },
  { failure_families: { timeout: 2 } }
]);
assert.deepEqual(failureFamilies, { timeout: 3, rate_limit: 2 });

const completePersistedTotals = {
  chunks_total: 2,
  chunks_attempted: 2,
  chunks_processing_failed: 0,
  chunks_persisted: 2,
  chunks_persist_failed: 0,
  chunks_pending_persistence: 0
};
assert.equal(
  hasBlockingActivationFailure(completePersistedTotals, { maxChunks: null, persist: true }),
  false,
  "a fully persisted production activation may succeed"
);
assert.equal(
  hasBlockingActivationFailure(
    { ...completePersistedTotals, chunks_processing_failed: 1, chunks_persisted: 1 },
    { maxChunks: null, persist: true }
  ),
  true,
  "processing failures must fail the process even when persistence itself did not throw"
);
assert.equal(
  hasBlockingActivationFailure(
    { ...completePersistedTotals, chunks_attempted: 1, chunks_persisted: 1 },
    { maxChunks: null, persist: true }
  ),
  true,
  "an ordinary production run must not succeed with unattempted chunks"
);
assert.equal(
  hasBlockingActivationFailure(
    { ...completePersistedTotals, chunks_attempted: 1, chunks_persisted: 1 },
    { maxChunks: 1, persist: true }
  ),
  false,
  "an explicit partial resumable run may stop cleanly after maxChunks"
);

console.log("run-resumable-activation tests passed");

function sourceResult(sourceId: string): IngestionSourceSummary {
  return {
    source_id: sourceId,
    source_name: sourceId,
    crawl_method: "rss",
    status: "success",
    item_count: 2,
    duration_ms: 1,
    warnings: []
  };
}

function sumMetric(
  values: Record<string, ReturnType<typeof aggregateSourceFamilyStatuses>[string]>,
  metric: "deduped" | "included" | "needs_review" | "excluded"
) {
  return Object.values(values).reduce((total, value) => total + value[metric], 0);
}
