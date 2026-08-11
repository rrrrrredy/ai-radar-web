import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

type ToolMode = "ask";
type Locale = "en" | "zh";

type ReaderEvent = {
  id: string;
  title_zh: string;
  title_en: string;
  summary_zh: string;
  summary_en: string;
  category: string;
  published_at: string;
};

const outputRoot = path.join(process.cwd(), "dist", "cloudflare-pages");
const snapshot = JSON.parse(
  fs.readFileSync(path.join(outputRoot, "data", "radar-snapshot.json"), "utf8")
) as {
  updated_at?: string;
  featured_event_ids?: string[];
  events?: ReaderEvent[];
};

test("an exact event question does not pull unrelated updates", async () => {
  const html = await runLocalTool(
    "ask",
    "What happened with “Meet GPT-Red: an LLM super-hacker OpenAI built to make its models safer”?"
  );

  assert.match(html, /GPT-Red/i);
  assert.doesNotMatch(html, /v0\.25\.0|v0\.24\.0|Microsoft is reportedly|Advancing content provenance/i);
  assert.doesNotMatch(html, /Source health|Failed sources|Reason summary|independence still needs checking/i);
  assert.equal(countMatches(html, /<li\b[^>]*data-event-id=/g), 1);
});

test("a Chinese today query stays inside the 24-hour content window", async () => {
  const askHtml = await runLocalTool("ask", "今天有哪些 AI 行业动态？", "zh");
  const anchor = Date.parse(snapshot.updated_at ?? "");
  const lowerBound = anchor - 24 * 60 * 60 * 1000;
  const expectedIds = new Set(
    (snapshot.events ?? [])
      .filter((event) => {
        const timestamp = Date.parse(event.published_at);
        return timestamp >= lowerBound && timestamp <= anchor + 5 * 60 * 1000;
      })
      .map((event) => event.id)
  );
  const resultIds = Array.from(askHtml.matchAll(/data-event-id="([^"]+)"/g), (match) => match[1]);

  assert.doesNotMatch(askHtml, /T\d{2}:\d{2}:\d{2}/);
  if (expectedIds.size === 0) {
    assert.match(askHtml, /没有找到匹配动态/);
    assert.equal(resultIds.length, 0);
  } else {
    assert.ok(resultIds.length > 0);
    assert.equal(resultIds.every((eventId) => expectedIds.has(eventId)), true);
  }
});

test("an explicit Chinese count returns featured reader updates", async () => {
  const html = await runLocalTool("ask", "把行业精选最值得关注的三件事列出来", "zh");

  assert.equal(countMatches(html, /<li\b[^>]*data-event-id=/g), 3);
  assert.doesNotMatch(html, /公开快照|跨来源家族|同家族多源复述|待复核|高优先级/);
  const featuredIds = new Set(snapshot.featured_event_ids ?? []);
  const resultIds = Array.from(html.matchAll(/data-event-id="([^"]+)"/g), (match) => match[1]);
  assert.ok(resultIds.length > 0, "ranked featured updates must expose stable reader ids.");
  assert.equal(resultIds.every((eventId) => featuredIds.has(eventId)), true);
});

test("Chinese Ask results keep the reader-headline quality contract", async () => {
  const html = await runLocalTool("ask", "把行业精选最值得关注的三件事列出来", "zh");
  const titles = Array.from(html.matchAll(/<li\b[^>]*><strong>([^<]+)<\/strong><p>/g), (match) => match[1]);

  assert.equal(titles.length, 3);
  for (const title of titles) {
    assert.ok(Array.from(title).length <= 56, "Chinese Ask headline exceeds 56 characters: " + title);
    assert.doesNotMatch(title, /^(?:本文|本论文|该论文|这篇论文|本研究|该研究|这项研究|基于摘要|这篇文章|本报告|该报告)/u);
    assert.ok((title.match(/[：:]/gu) ?? []).length <= 1, "Chinese Ask headline uses multiple colons: " + title);
    assert.ok((title.match(/[（(\[]/gu) ?? []).length <= 1, "Chinese Ask headline uses multiple bracket groups: " + title);
  }
});

test("operations questions never turn Ask into a monitoring console", async () => {
  const html = await runLocalTool("ask", "Which sources failed or had no new items today?");

  assert.doesNotMatch(html, /Source health|Failed sources|Reason summary|Succeeded|Manual \/ blocked|No new items|Duplicate only|Audited through/i);
  assert.doesNotMatch(html, /<dd>\d+<\/dd>/);
});

test("retired About and report routes stay absent and the reader snapshot is minimal", () => {
  assert.equal(fs.existsSync(path.join(outputRoot, "about", "index.html")), false);
  assert.equal(fs.existsSync(path.join(outputRoot, "en", "about", "index.html")), false);
  assert.equal(fs.existsSync(path.join(outputRoot, "reports", "index.html")), false);
  assert.equal(fs.existsSync(path.join(outputRoot, "en", "reports", "index.html")), false);
  const forbiddenTopLevel = ["coverage", "counts", "source", "radar_items", "source_health_summary", "data_completeness_summary", "reports", "report_quality_summary"];
  for (const key of forbiddenTopLevel) assert.equal(Object.hasOwn(snapshot, key), false, `reader snapshot must not expose ${key}.`);
  const worker = fs.readFileSync(path.join(outputRoot, "_worker.js"), "utf8");
  assert.equal(fs.existsSync(path.join(outputRoot, "_redirects")), false);
  assert.match(worker, /"\/about"/);
  assert.match(worker, /"\/en\/about"/);
  assert.match(worker, /"\/reports"/);
  assert.match(worker, /"\/en\/reports"/);
});

test("model questions return only model or benchmark updates", async () => {
  const html = await runLocalTool("ask", "What changed in AI models this week?");
  const eventById = new Map((snapshot.events ?? []).map((event) => [event.id, event]));
  const resultIds = Array.from(html.matchAll(/data-event-id="([^"]+)"/g), (match) => match[1]);

  assert.ok(resultIds.length > 0, "model query should return matching reader updates when available.");
  assert.equal(
    resultIds.every((eventId) => ["model_release", "benchmark"].includes(eventById.get(eventId)?.category ?? "")),
    true
  );
});

test("nonsense query returns an empty reader-facing result", async () => {
  const html = await runLocalTool("ask", "zzzxxyy no such event");

  assert.match(html, /No matching update/);
  assert.equal(countMatches(html, /<li\b[^>]*data-event-id=/g), 0);
});

async function runLocalTool(mode: ToolMode, query: string, locale: Locale = "en") {
  const pagePath = locale === "en"
    ? path.join(outputRoot, "en", mode, "index.html")
    : path.join(outputRoot, mode, "index.html");
  const script = extractToolScript(fs.readFileSync(pagePath, "utf8"), mode);
  const input = { value: query };
  const result = { innerHTML: "" };
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
  const fetch = async () => ({ json: async () => snapshot, ok: true });

  vm.runInNewContext(script, { console, document, fetch });
  assert.ok(run, `The ${mode} page must register its local query action.`);
  await run();
  return result.innerHTML;
}

function extractToolScript(html: string, mode: ToolMode) {
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  const script = scripts.find((candidate) => candidate.includes("function renderResults") && candidate.includes("const snapshotUrl"));
  assert.ok(script, `The ${mode} page must embed the local reader tool.`);
  return script;
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}