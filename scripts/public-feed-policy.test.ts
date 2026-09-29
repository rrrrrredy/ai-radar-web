import assert from "node:assert/strict";
import { selectPublicFeed, type PublicFeedArticle } from "../lib/radar/public-feed-policy";

const now = Date.parse("2026-09-29T01:00:00Z");
function item(id: string, title: string, days = 0, extra: Partial<PublicFeedArticle> = {}): PublicFeedArticle {
  return { id, title, url: `https://example.com/${id}`, source_name: "Source " + id,
    published_at: new Date(now - days * 86400_000).toISOString(), overall_score: 0.8, ...extra };
}

const first = item("first", "Acme introduces Atlas 3 for reliable coding agents");
const duplicate = item("copy", "Acme introduces Atlas 3 for reliable coding agents");
const version = item("version", "Acme introduces Atlas 4 for reliable coding agents");
const guide = item("guide", "Guide: Acme introduces Atlas 3 for reliable coding agents");
const old = item("old", "Historical high score report", 60, { overall_score: 100 });
const undated = item("undated", "A release with no publication date", 0, { published_at: null, processed_at: new Date(now).toISOString() });
const future = item("future", "An article incorrectly dated tomorrow", -1);
const result = selectPublicFeed([first, duplicate, version, guide, old, undated, future], 10, now);
assert.equal(result.length, 3);
assert.equal(result.find((row) => row.id === "first")?.source_count, 2);
assert.ok(result.some((row) => row.id === "version"));
assert.ok(result.some((row) => row.id === "guide"));
assert.ok(!result.some((row) => ["old", "undated", "future"].includes(row.id)));
assert.equal(selectPublicFeed([item("yesterday", "Earlier high score announcement", 6, { overall_score: 1 }), first], 1, now)[0].id, "first");
assert.equal(selectPublicFeed([first, { ...first, id: "tracking", url: first.url + "?utm_source=feed" }], 10, now).length, 1);
assert.equal(selectPublicFeed([], 10, now).length, 0);
assert.equal(selectPublicFeed([first, item("rumor", "Reportedly Acme introduces Atlas 3 for reliable coding agents")], 10, now).length, 2);
console.log("Public feed policy tests passed.");
