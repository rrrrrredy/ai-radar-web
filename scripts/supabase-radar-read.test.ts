import assert from "node:assert/strict";

import { validateCompleteSupabaseRadarRows } from "@/lib/retrieval/load-supabase-radar-items";

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

console.log("Supabase radar read completeness regression tests passed.");
