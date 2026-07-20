import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

type ToolMode = "ask";
type Locale = "en" | "zh";

const outputRoot = path.join(process.cwd(), "dist", "cloudflare-pages");
const snapshot = JSON.parse(
  fs.readFileSync(path.join(outputRoot, "data", "radar-snapshot.json"), "utf8")
) as {
  curated_events?: Array<{ event_cluster_id: string }>;
  event_clusters?: Array<{
    event_cluster_id: string;
    event_score_label: string;
    first_seen_at?: string;
    latest_seen_at?: string;
    source_count: number;
  }>;
  freshness?: { latest_timestamp?: string };
};

test("an exact event question does not pull unrelated high-scoring events", async () => {
  const html = await runLocalTool(
    "ask",
    "What evidence and uncertainty surround \u201cMeet GPT-Red: an LLM super-hacker OpenAI built to make its models safer\u201d?"
  );

  assert.match(html, /GPT-Red/i);
  assert.doesNotMatch(html, /v0\.25\.0|v0\.24\.0|Microsoft is reportedly|Advancing content provenance/i);
  assert.match(html, /independence still needs checking/i);
  assert.equal(countMatches(html, /<li\b[^>]*data-event-id=/g), 1);
});

test("bare Chinese today intent enforces the 24-hour evidence window", async () => {
  const askHtml = await runLocalTool("ask", "今天有哪些高优先级事件？", "zh");
  const anchor = Date.parse(snapshot.freshness?.latest_timestamp ?? "");
  const lowerBound = anchor - 24 * 60 * 60 * 1000;
  const expectedIds = new Set(
    (snapshot.event_clusters ?? [])
      .filter((event) => {
        const timestamp = Date.parse(event.latest_seen_at ?? event.first_seen_at ?? "");
        return event.event_score_label === "高优先级" && timestamp >= lowerBound && timestamp <= anchor + 5 * 60 * 1000;
      })
      .map((event) => event.event_cluster_id)
  );
  const resultIds = Array.from(askHtml.matchAll(/data-event-id="([^"]+)"/g), (match) => match[1]);

  assert.doesNotMatch(askHtml, /T\d{2}:\d{2}:\d{2}/);
  if (expectedIds.size === 0) {
    assert.match(askHtml, /指定时间窗口内没有高优先级事件/);
    assert.equal(resultIds.length, 0);
  } else {
    assert.ok(resultIds.length > 0);
    assert.equal(resultIds.every((eventId) => expectedIds.has(eventId)), true);
  }
});

test("an explicit Chinese count returns exactly the requested number of events", async () => {
  const html = await runLocalTool("ask", "把行业精选最值得关注的三件事列出来", "zh");

  assert.equal(countMatches(html, /<li\b[^>]*data-event-id=/g), 3);
  assert.doesNotMatch(html, /公开快照|跨来源家族|同家族多源复述/);
  const curatedIds = new Set((snapshot.curated_events ?? []).map((event) => event.event_cluster_id));
  const resultIds = Array.from(html.matchAll(/data-event-id="([^"]+)"/g), (match) => match[1]);
  assert.ok(resultIds.length > 0, "ranked selected events must expose stable event ids.");
  assert.equal(
    resultIds.every((eventId) => curatedIds.has(eventId)),
    true,
    "ranking selected events must only return visible curated events."
  );
});

test("source health renders numeric zeroes and a reader-friendly timestamp", async () => {
  const html = await runLocalTool("ask", "Which sources failed or had no new items today?");

  assert.match(html, /<dd>0<\/dd>/);
  assert.doesNotMatch(html, /T\d{2}:\d{2}:\d{2}/);
  assert.match(html, /UTC/);
  assert.match(html, /Source health/);
  assert.match(html, /Failed sources/);
  assert.match(html, /Reason summary/);
});

test("retired legacy report URLs stay 404 and the public snapshot carries no report payload", () => {
  assert.equal(fs.existsSync(path.join(outputRoot, "reports", "index.html")), false);
  assert.equal(fs.existsSync(path.join(outputRoot, "en", "reports", "index.html")), false);
  assert.equal(Object.hasOwn(snapshot, "reports"), false);
  assert.equal(Object.hasOwn(snapshot, "report_quality_summary"), false);
  const redirects = fs.readFileSync(path.join(outputRoot, "_redirects"), "utf8");
  const worker = fs.readFileSync(path.join(outputRoot, "_worker.js"), "utf8");
  assert.match(redirects, /^\/reports\/ \/404\.html 404$/m);
  assert.match(redirects, /^\/en\/reports\/ \/404\.html 404$/m);
  assert.match(worker, /"\/reports"/);
  assert.match(worker, /"\/en\/reports"/);
});

test("multi-source intent excludes single-source events", async () => {
  const html = await runLocalTool("ask", "Which events have more than one source?");
  const eventById = new Map((snapshot.event_clusters ?? []).map((event) => [event.event_cluster_id, event]));
  const resultIds = Array.from(html.matchAll(/data-event-id="([^"]+)"/g), (match) => match[1]);

  assert.ok(resultIds.length > 0, "multi-source query should return matching events when available.");
  assert.doesNotMatch(html, /\b1 source\b/);
  assert.equal(
    resultIds.every((eventId) => (eventById.get(eventId)?.source_count ?? 0) > 1),
    true,
    "multi-source query results must all have source_count greater than one."
  );
});

test("nonsense query returns an empty reader-facing result", async () => {
  const html = await runLocalTool("ask", "zzzxxyy no such event");

  assert.match(html, /No matching event/);
  assert.equal(countMatches(html, /<li\b[^>]*data-event-id=/g), 0);
});

async function runLocalTool(mode: ToolMode, query: string, locale: Locale = "en") {
  const pagePath = locale === "en"
    ? path.join(outputRoot, "en", mode, "index.html")
    : path.join(outputRoot, mode, "index.html");
  const script = extractToolScript(fs.readFileSync(pagePath, "utf8"), mode);
  const input = {
    value: query
  };
  const result = {
    innerHTML: ""
  };
  let run: (() => Promise<void>) | undefined;
  const button = {
    addEventListener(type: string, callback: () => Promise<void>) {
      if (type === "click") run = callback;
    }
  };
  const document = {
    querySelector(selector: string) {
      if (selector === "#local-query-input") return input;
      if (selector === "#local-query-run") return button;
      if (selector === "#local-query-result") return result;
      return null;
    }
  };
  const fetch = async () => ({
    json: async () => snapshot,
    ok: true
  });

  vm.runInNewContext(script, { console, document, fetch });
  assert.ok(run, `The ${mode} page must register its local query action.`);
  await run();
  return result.innerHTML;
}

function extractToolScript(html: string, mode: ToolMode) {
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  const script = scripts.find((candidate) => candidate.includes("function renderAskResult") && candidate.includes("const snapshotUrl"));
  assert.ok(script, `The ${mode} page must embed the local evidence tool.`);
  return script;
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}
