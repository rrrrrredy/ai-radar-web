import assert from "node:assert/strict";
import { editRecentItems, validEditorial, EDITORIAL_VERSION } from "../supabase/functions/radar-cloud-refresh/editorial";
import type { CloudReaderItem } from "../supabase/functions/radar-cloud-refresh/parser";

async function main() {
const item: CloudReaderItem = {
  title: "Acme Atlas 2 adds offline tools", url: "https://example.com/atlas", published_at: new Date().toISOString(),
  summary: "Acme Atlas 2 adds offline tool support for developers. It is available today.",
  categories: ["tooling"], tags: [], language: "en", why_it_matters: "",
  ai_relevance_score: 0.9, credibility_score: 0.8, novelty_score: 0.8, importance_score: 0.8,
  freshness_score: 1, overall_score: 0.8, confidence: 0.8
};
const copy = { index: 0, title_zh: "Acme Atlas 2 新增离线工具支持", summary_zh: "Acme Atlas 2 面向开发者新增离线工具支持，即日起可用。", why_it_matters: "开发者可离线使用工具。" };
assert.equal(validEditorial(copy, item), true);
assert.equal(validEditorial({ ...copy, summary_zh: "使用成本降低了50%，性能提升10倍。" }, item), false);
assert.equal(validEditorial({ ...copy, summary_zh: "本文介绍该博客发布了一篇文章，未提供具体内容。" }, item), false);
assert.equal(validEditorial({ ...copy, title_zh: "Acme 将种子投资上限提高至500万美元", summary_zh: "Acme 将种子投资上限提高至500万美元。", why_it_matters: "" }, { ...item, title: "Acme raises seed ceiling to $5M", summary: "Acme raises its seed ceiling to $5 million." }), true);
assert.equal(validEditorial({ ...copy, title_zh: "Acme 公布13个离线开发工具", summary_zh: "Acme 公布13个面向开发者的离线工具。", why_it_matters: "" }, { ...item, title: "Acme unveils thirteen offline tools", summary: "Thirteen developer tools are available." }), true);
let calls = 0;
const fetcher = (async (url, init) => {
  calls++;
  assert.equal(url, "https://api.deepseek.com/chat/completions");
  const request = JSON.parse(String(init?.body));
  assert.equal(request.model, "deepseek-flash");
  assert.equal(request.messages[1].content.includes("secret"), false);
  return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [copy] }) } }] });
}) as typeof fetch;
const edited = await editRecentItems([item], [], "test-secret", fetcher);
assert.equal(calls, 1);
assert.equal(edited[0].title_zh, copy.title_zh);
assert.equal(edited[0].title, item.title);
assert.equal(edited[0].published_at, item.published_at);
const cached = await editRecentItems([item], [{ ...edited[0], model_metadata: { editorial_version: EDITORIAL_VERSION, editorial_hash: edited[0].editorial_hash } }], "test-secret", fetcher);
assert.equal(calls, 1);
assert.equal(cached[0].summary_zh, copy.summary_zh);
await editRecentItems([{ ...item, published_at: null }, { ...item, published_at: "2020-01-01" }], [], "test-secret", fetcher);
assert.equal(calls, 1);
const fallback = await editRecentItems([item], [], "test-secret", (async () => new Response("Unavailable", { status: 503 })) as typeof fetch);
assert.deepEqual(fallback, [item]);
const aliases = await editRecentItems([item], [], "test-secret", (async () => Response.json({ choices: [{ message: { content: JSON.stringify({ items: [{ index: 0, title: copy.title_zh, summary: copy.summary_zh, why_it_matters: "" }] }) } }] })) as typeof fetch);
assert.equal(aliases[0].title_zh, copy.title_zh);
console.log("Cloud editorial tests passed: grounded copy, cache reuse, dates, safe fallback.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
