import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Exercise the exact script emitted to Pages, without a server or model calls.
const source = fs.readFileSync("scripts/build-cloudflare-public-site.ts", "utf8");
const start = source.indexOf("function liveFeedClientScript()");
const scriptStart = source.indexOf("return String.raw`", start) + "return String.raw`".length;
const scriptEnd = source.indexOf("`;\n}", scriptStart);
const scriptEndCrLf = source.indexOf("`;\r\n}", scriptStart);
const end = [scriptEnd, scriptEndCrLf].filter((value) => value > scriptStart).sort((a, b) => a - b)[0];
assert.ok(end > scriptStart);
const script = source.slice(scriptStart, end);
const now = new Date().toISOString();
const rows = Array.from({ length: 4 }, (_, index) => ({
  id: String(index), title: `Acme Atlas ${index} adds reliable tools`, url: `https://example.com/${index}`,
  source_name: `Source ${index}`, published_at: now, summary_en: "A specific change to tool calling.",
  categories: ["tooling"], source_count: 2
}));

async function render(items: unknown[], updated_at: string | null = now, fail = false, language = "zh-CN") {
  const top = { innerHTML: "OLD TOP" };
  const stream = { innerHTML: "OLD STREAM" };
  const status = { textContent: "OLD TIME", dataset: {} };
  const date = { textContent: "OLD DATE" };
  const root = { dataset: { liveMode: "home" }, querySelector: (selector: string) => selector === "[data-live-stream]" ? stream : null };
  const context = vm.createContext({
    URL, Date, Intl, Map, Set, Array, String, Number, Math, JSON, Promise,
    document: { documentElement: { lang: language }, visibilityState: "visible", addEventListener() {}, querySelector(selector: string) {
      return ({ "[data-live-feed]": root, "[data-live-top]": top, "[data-live-status]": status, "[data-live-date]": date } as Record<string, unknown>)[selector];
    } },
    window: { addEventListener() {}, dispatchEvent() {}, setInterval() {} }, setInterval() {},
    CustomEvent: class {},
    fetch: async () => ({ ok: !fail, status: fail ? 503 : 200, json: async () => ({ items, updated_at }) })
  });
  vm.runInContext(script, context);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { top, stream, status, date };
}

async function main() {
  const short = await render(rows);
  assert.equal((short.top.innerHTML.match(/class="top-story/g) || []).length, 4);
  assert.ok(!short.top.innerHTML.includes("OLD TOP"));
  assert.ok(short.top.innerHTML.includes("2 个来源"));
  assert.ok(!short.top.innerHTML.includes("为什么值得看"));
  assert.equal(short.stream.innerHTML, "");
  assert.ok(short.status.textContent.includes("更新于"));
  const empty = await render([], null);
  assert.ok(empty.top.innerHTML.includes("暂无"));
  assert.equal(empty.stream.innerHTML, "");
  assert.equal(empty.date.textContent, "");
  const stale = await render([{ ...rows[0], published_at: "2026-07-15T00:00:00Z", collected_at: now }]);
  assert.ok(!stale.top.innerHTML.includes("Acme"));
  const undated = await render([{ ...rows[0], published_at: null, collected_at: now }]);
  assert.ok(!undated.top.innerHTML.includes("Acme"));
  const failed = await render(rows, now, true);
  assert.equal(failed.top.innerHTML, "OLD TOP");
  assert.equal(failed.date.textContent, "OLD DATE");
  const bilingual = [{ ...rows[0], title_zh: "Acme Atlas 新增离线工具支持", summary_zh: "开发者现在可以离线运行工具。", why_it_matters: "工具可在没有网络的环境运行。" }];
  const zh = await render(bilingual);
  assert.ok(zh.top.innerHTML.includes(bilingual[0].title_zh));
  assert.ok(zh.top.innerHTML.includes(bilingual[0].why_it_matters));
  const en = await render(bilingual, now, false, "en");
  assert.ok(en.top.innerHTML.includes(rows[0].title));
  assert.ok(!en.top.innerHTML.includes(bilingual[0].why_it_matters));
  console.log("Public feed client tests passed (short, empty, undated, error).");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
