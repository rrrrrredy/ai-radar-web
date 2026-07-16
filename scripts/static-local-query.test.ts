import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

type ToolMode = "ask" | "write";

const outputRoot = path.join(process.cwd(), "dist", "cloudflare-pages");
const snapshot = JSON.parse(
  fs.readFileSync(path.join(outputRoot, "data", "radar-snapshot.json"), "utf8")
) as unknown;

test("an exact event question does not pull unrelated high-scoring events", async () => {
  const html = await runLocalTool(
    "ask",
    "What evidence and uncertainty surround \u201cMeet GPT-Red: an LLM super-hacker OpenAI built to make its models safer\u201d?"
  );

  assert.match(html, /GPT-Red/i);
  assert.doesNotMatch(html, /v0\.25\.0|v0\.24\.0|Microsoft is reportedly|Advancing content provenance/i);
  assert.equal(countMatches(html, /<li><strong>/g), 1);
});

test("a mixed evidence-state writing request uses union semantics", async () => {
  const html = await runLocalTool(
    "write",
    "Turn this week's cross-family coverage and single-source events into a weekly report outline with separate evidence labels."
  );

  assert.match(html, /Evidence-led outline/);
  assert.doesNotMatch(html, /No matching event/);
  assert.match(html, /Cross-family|single-source|Independent confirmation/i);
});

test("source health renders numeric zeroes and a reader-friendly timestamp", async () => {
  const html = await runLocalTool("ask", "Which sources failed or had no new items today?");

  assert.match(html, /<dd>0<\/dd>/);
  assert.doesNotMatch(html, /T\d{2}:\d{2}:\d{2}/);
  assert.match(html, /UTC/);
});

async function runLocalTool(mode: ToolMode, query: string) {
  const pagePath = path.join(outputRoot, "en", mode, "index.html");
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
  const script = scripts.find((candidate) => candidate.includes(`const toolMode = "${mode}";`));
  assert.ok(script, `The ${mode} page must embed the local evidence tool.`);
  return script;
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}
