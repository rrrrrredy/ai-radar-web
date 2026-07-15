import assert from "node:assert/strict";

import {
  reportCandidateContentMatches,
  reportCandidateSignature,
  reportCandidateSignatureVersion
} from "@/lib/reports/candidate-signature";

const current = {
  data_source: "supabase_radar_items",
  report_type: "daily",
  source_item_ids: ["item-b", "item-a"],
  time_window: {
    end: "2026-07-14T19:18:00.000Z",
    start: "2026-07-13T19:18:00.000Z"
  },
  usable_item_count: 21,
  citation_count: 12,
  distinct_source_count: 9,
  category_count: 10,
  quality_gate_passed: true,
  quality_gate_reasons: [],
  caveats: ["Public projection maps 205 signals to 203 events.", "Editorial review required."],
  missing_evidence: []
};

assert.equal(reportCandidateSignatureVersion, 2);
assert.equal(
  reportCandidateSignature(current),
  reportCandidateSignature({
    ...current,
    source_item_ids: [...current.source_item_ids].reverse(),
    caveats: [...current.caveats].reverse()
  }),
  "Candidate signatures must be stable across set ordering."
);

const stale = {
  ...current,
  caveats: ["Public projection maps 207 signals to 205 events.", "Editorial review required."]
};

assert.notEqual(
  reportCandidateSignature(current),
  reportCandidateSignature(stale),
  "A materially changed public event projection must produce a new candidate signature."
);
assert.equal(reportCandidateContentMatches(current, { ...current, caveats: [...current.caveats].reverse() }), true);
assert.equal(reportCandidateContentMatches(current, stale), false);

console.log("Report candidate content-signature regression tests passed.");
