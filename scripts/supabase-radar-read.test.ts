import assert from "node:assert/strict";

import { validateCompleteSupabaseRadarRows } from "@/lib/retrieval/load-supabase-radar-items";
import {
  publicRadarReadFailureMessage,
  reorderPublicRadarRows,
  validatePublicRadarManifest
} from "@/lib/retrieval/read-public-radar-rows";

const rows = [
  { id: "11111111-1111-4111-8111-111111111111" },
  { id: "22222222-2222-4222-8222-222222222222" }
];

assert.deepEqual(validateCompleteSupabaseRadarRows(rows, 2), {
  complete: true,
  reason: null
});
assert.equal(validateCompleteSupabaseRadarRows(rows, null).complete, false);
assert.equal(validateCompleteSupabaseRadarRows(rows, 3).complete, false);
assert.equal(validateCompleteSupabaseRadarRows([rows[0], rows[0]], 2).complete, false);
assert.equal(validateCompleteSupabaseRadarRows([{ local_id: "missing-database-id" }], 1).complete, false);

const manifest = validatePublicRadarManifest(rows, 2);
assert.equal(manifest.complete, true);
assert.deepEqual(manifest.ids, [rows[0].id, rows[1].id]);
assert.equal(validatePublicRadarManifest(rows, 3).complete, false);

const reordered = reorderPublicRadarRows(
  [rows[0].id, rows[1].id],
  [
    { ...rows[1], title: "second" },
    { ...rows[0], title: "first" }
  ]
);
assert.equal(reordered.complete, true);
assert.deepEqual(reordered.rows.map((row) => row.title), ["first", "second"]);
assert.equal(reorderPublicRadarRows([rows[0].id, rows[1].id], [rows[0]]).complete, false);
assert.equal(reorderPublicRadarRows([rows[0].id], [rows[0], rows[0]]).complete, false);
assert.equal(
  publicRadarReadFailureMessage({
    kind: "manifest_read_failed",
    code: "57014",
    message: "canceling statement due to statement timeout"
  }),
  "manifest_read_failed; code=57014; canceling statement due to statement timeout"
);

console.log("Supabase radar read completeness regression tests passed.");
