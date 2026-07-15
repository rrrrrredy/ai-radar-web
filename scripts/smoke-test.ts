import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { RetrievalRadarItem } from "@/lib/retrieval/types";
import {
  mapLearnPromptItemToRetrievalRadarItem,
  normalizeLearnPromptLatestPayload,
  normalizeLearnPromptSourceStatusPayload,
  selectLearnPromptDiffCandidates
} from "@/lib/external/learnprompt-ai-news-radar";
import { buildExternalSourceGapWorkbench } from "@/lib/external/source-gap-workbench";
import { loadLocalPublicReportSnapshotRecords } from "@/lib/reports/local-public-reports";
import {
  reportPublishingReadiness,
  summarizePublishingReadiness
} from "@/lib/reports/publishing-readiness";
import { isPublicInternetHttpUrl, publicInternetHttpUrl } from "@/lib/public-url";
import { isExternalSourceRepairSignal } from "@/lib/radar/public-source-boundary";
import type { ReportWorkflowDocument } from "@/lib/reports/types";

process.env.ENABLE_SUPABASE_RETRIEVAL = "false";
process.env.ALLOW_SYNTHETIC_RADAR_FALLBACK = "true";
process.env.PREFER_PUBLIC_RADAR_SNAPSHOT = "false";
process.env.PREFER_LOCAL_PUBLIC_RADAR_SNAPSHOT = "false";
process.env.DEEPSEEK_API_KEY = "";
process.env.ENABLE_PUBLIC_LIVE_DEEPSEEK = "false";

type JsonRecord = Record<string, unknown>;

const originalFetch = globalThis.fetch.bind(globalThis);

async function main() {
  blockExternalNetwork();
  assertAssistantFeaturesPresent();
  assertClientModulesDoNotImportServiceRoleHelpers();
  assertPublicRoutesUsePublicSafeCoverage();
  assertExperienceEnhancementSurfaces();
  assertEvidenceToInsightLoopSurfaces();
  assertTrustedPublishingSurfaces();
  assertStaticEntityParityAndPublicSnapshotContract();
  assertTrustedPublishingReadiness();
  assertTrustedPublishingRegressionGuards();
  await assertLocalPublicReports();
  assertLearnPromptAdapter();
  assertLearnPromptBoundaryLanguage();
  assertExternalSourceGapWorkbench();

  const [
    { publicReportMarkdown },
    { entityCandidatesForItem, matchesEntityCandidate },
    { reportEvidenceItems, reportSectionTraceability }
  ] = await Promise.all([
    import("@/lib/reports/public-markdown"),
    import("@/lib/radar/entities"),
    import("@/lib/reports/entity-traceability")
  ]);

  const publicMarkdown = publicReportMarkdown(
    "# Report\n\n- Model: deepseek-chat\n- API calls: 2\n- Provider: deepseek\n\n## Summary\n\nEvidence only.",
    "# Fallback"
  );
  assert.equal(publicMarkdown.includes("Model:"), false);
  assert.equal(publicMarkdown.includes("API calls:"), false);
  assert.equal(publicMarkdown.includes("Provider:"), false);
  assert.equal(publicMarkdown.includes("Evidence only."), true);

  const fallbackEntityItem: RetrievalRadarItem = {
    categories: ["model_release"],
    collected_at: "2026-06-29T00:00:00.000Z",
    confidence: 0.8,
    credibility_score: 0.8,
    entities: [],
    evidence_notes: [],
    freshness_score: 0.8,
    id: "item_entity_smoke",
    ai_relevance_score: 0.9,
    importance_score: 0.8,
    language: "en",
    novelty_score: 0.8,
    overall_score: 0.85,
    processed_at: "2026-06-29T00:00:00.000Z",
    raw_item_id: "raw_entity_smoke",
    source_id: "source_openai",
    source_name: "OpenAI Blog",
    source_tier: "T1",
    source_weight: 1,
    status: "included",
    summary_en: "OpenAI released a model update.",
    summary_zh: "OpenAI 发布模型更新。",
    tags: ["OpenAI", "GPT"],
    title: "OpenAI releases GPT model update",
    url: "https://openai.com/news/"
  };
  assert.equal(entityCandidatesForItem(fallbackEntityItem).some((entity) => entity.name === "OpenAI"), true);
  assert.equal(matchesEntityCandidate(fallbackEntityItem, "OpenAI"), true);

  const duplicateTitleItems: RetrievalRadarItem[] = [
    {
      ...fallbackEntityItem,
      id: "duplicate_title_deepseek",
      raw_item_id: "raw_duplicate_title_deepseek",
      source_name: "DeepSeek",
      title: "v1.0.0",
      url: "https://example.com/deepseek-v1"
    },
    {
      ...fallbackEntityItem,
      id: "duplicate_title_meta",
      raw_item_id: "raw_duplicate_title_meta",
      source_name: "Meta",
      title: "v1.0.0",
      url: "https://example.com/meta-v1"
    }
  ];
  const unknownSourceTitleOnlyReport = mockReport({
    citations: [
      {
        ...mockReport({}).citations[0],
        id: "missing_duplicate_title_citation",
        source_name: "Unknown",
        title: "v1.0.0",
        url: "https://example.com/not-present"
      }
    ],
    source_item_ids: []
  });
  assert.deepEqual(
    reportEvidenceItems(unknownSourceTitleOnlyReport, duplicateTitleItems).map((item) => item.id),
    [],
    "Duplicate citation titles must not match unrelated radar items by title alone."
  );
  const sameSourceTitleReport = mockReport({
    citations: [
      {
        ...mockReport({}).citations[0],
        id: "same_source_duplicate_title_citation",
        source_name: "DeepSeek",
        title: "v1.0.0",
        url: ""
      }
    ],
    source_item_ids: []
  });
  assert.deepEqual(
    reportEvidenceItems(sameSourceTitleReport, duplicateTitleItems).map((item) => item.id),
    ["duplicate_title_deepseek"],
    "Source plus title may match only when that pair is unique."
  );
  const sectionTraceReport = mockReport({
    citations: [
      {
        ...mockReport({}).citations[0],
        id: "duplicate_title_deepseek",
        source_name: "DeepSeek",
        title: "v1.0.0",
        url: "https://example.com/deepseek-v1"
      }
    ],
    sections: [
      {
        bullets: ["DeepSeek section bullet"],
        caveats: [],
        citations: ["duplicate_title_deepseek"],
        id: "model_product_company_updates",
        missing_evidence: [],
        summary: "Section with one traced citation.",
        title: "Model updates"
      },
      {
        bullets: ["Unknown section bullet"],
        caveats: [],
        citations: ["unknown_section_citation"],
        id: "research_open_source",
        missing_evidence: [],
        summary: "Section with no traced citations.",
        title: "Research updates"
      }
    ],
    source_item_ids: []
  });
  const sectionTraces = reportSectionTraceability(sectionTraceReport, duplicateTitleItems);
  assert.deepEqual(
    sectionTraces.map((section) => section.evidenceItems.map((item) => item.id)),
    [["duplicate_title_deepseek"], []],
    "Section entity coverage must only use evidence explicitly cited by that section."
  );
  const reportInternalCitationId = mockReport({
    citations: [
      {
        ...mockReport({}).citations[0],
        id: "report-citation-1",
        source_name: "DeepSeek",
        title: "v1.0.0",
        url: "https://example.com/deepseek-v1"
      }
    ],
    sections: [
      {
        bullets: ["DeepSeek section bullet"],
        caveats: [],
        citations: ["report-citation-1"],
        id: "model_product_company_updates",
        missing_evidence: [],
        summary: "Section citing a report-local citation id.",
        title: "Model updates"
      }
    ],
    source_item_ids: []
  });
  assert.deepEqual(
    reportSectionTraceability(reportInternalCitationId, duplicateTitleItems).map((section) =>
      section.evidenceItems.map((item) => item.id)
    ),
    [["duplicate_title_deepseek"]],
    "Section entity coverage must trace report-local citation ids through public citation metadata."
  );

  console.log("Smoke test passed: event-aware Ask/Write, radar, entity, report, and public snapshot paths remain guarded.");
}

function blockExternalNetwork() {
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);

    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
      return originalFetch(input, init);
    }

    throw new Error(`Unexpected external network access in smoke test: ${url.origin}`);
  };
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string" || input instanceof URL) {
    return new URL(input);
  }

  return new URL(input.url);
}

function assertClientModulesDoNotImportServiceRoleHelpers() {
  const trackedSourceFiles = trackedFiles().filter((file) => /\.(ts|tsx)$/.test(file));

  for (const file of trackedSourceFiles) {
    const text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    if (!isClientModule(text)) {
      continue;
    }

    assert.equal(
      text.includes("@/lib/supabase/service") || text.includes("../lib/supabase/service"),
      false,
      `${file} is a client module and must not import the Supabase service-role helper.`
    );
  }
}

function assertPublicRoutesUsePublicSafeCoverage() {
  for (const file of ["app/page.tsx", "app/radar/page.tsx", "app/reports/page.tsx"]) {
    const source = readSource(file);
    assert.equal(
      source.includes("@/lib/data-completeness/public-summary") ||
        source.includes("loadPublicDataCompletenessSummary") ||
        source.includes("@/lib/supabase/service"),
      false,
      `${file} must use public-safe coverage and must not import service-role coverage helpers.`
    );
  }

  assert.equal(
    readSource("app/reports/page.tsx").includes("loadPublicSnapshotRadarItems({ localOnly: true, preferLocal: true })"),
    true,
    "Reports traceability fallback must read only the local public snapshot on public SSR paths."
  );

  const productSummary = readSource("lib/product/data-summary.ts");
  assert.equal(
    productSummary.includes("@/lib/supabase/service") ||
      productSummary.includes("getSupabaseServiceClient") ||
      productSummary.includes("loadPublicDataCompletenessSummary"),
    false,
    "Product public summary must not read service-role operational tables."
  );
  assert.equal(
    productSummary.includes("loadPublicSafeDataCompletenessSummary"),
    true,
    "Product public summary must use the public-safe coverage loader."
  );

  const safeSummary = readSource("lib/data-completeness/public-safe-summary.ts");
  assert.equal(
    safeSummary.includes("@/lib/supabase/service") || safeSummary.includes("getSupabaseServiceClient"),
    false,
    "Public-safe coverage loader must not import the Supabase service-role helper."
  );
  assert.equal(
    safeSummary.includes("@/lib/supabase/persistence"),
    false,
    "Public-safe coverage loader must not import Supabase persistence helpers."
  );

  const reportLoader = readSource("lib/reports/load-report-data.ts");
  assert.equal(
    reportLoader.includes("localOnly: options.publicSnapshotLocalOnly ?? true") &&
      reportLoader.includes("const feed = options.feed ?? await loadRadarFeed();"),
    true,
    "Report workflow loader must reuse a supplied feed and keep public snapshot fallback local-only by default."
  );
  assert.equal(
    productSummary.includes("loadReportWorkflowData({ feed, publicSnapshotLocalOnly: true })"),
    true,
    "Homepage product summary must pass the already-loaded feed into report loading."
  );
}

function assertAssistantFeaturesPresent() {
  const requiredPaths = [
    "app/ask/page.tsx",
    "app/api/ask/route.ts",
    "app/write/page.tsx",
    "app/api/writing-assistant/route.ts",
    "components/ask-radar-client.tsx",
    "components/write-radar-client.tsx",
    "components/topic-candidate-card.tsx",
    "components/evidence-coverage-strip.tsx",
    "components/evidence-rail.tsx",
    "components/answer-section.tsx",
    "lib/qa/answer.ts",
    "lib/qa/mock-answer.ts",
    "lib/qa/prompts.ts",
    "lib/qa/types.ts",
    "lib/qa/validate.ts",
    "lib/writing-assistant/generate.ts",
    "lib/writing-assistant/mock-writing.ts",
    "lib/writing-assistant/prompts.ts",
    "lib/writing-assistant/types.ts",
    "lib/writing-assistant/validate.ts"
  ];

  for (const file of requiredPaths) {
    assert.equal(fs.existsSync(path.join(process.cwd(), file)), true, `${file} must exist.`);
  }

  const nav = readSource("components/nav.tsx");
  assert.equal(nav.includes('href: "/ask"') && nav.includes('href: "/write"'), true, "Public navigation must expose Ask and Write.");

  const homepage = readSource("app/page.tsx");
  assert.equal(homepage.includes('href="/ask"') && homepage.includes('href="/write"'), true, "Homepage must expose event-aware Ask and Write entry points.");

  const askValidation = readSource("lib/qa/validate.ts");
  const writingValidation = readSource("lib/writing-assistant/validate.ts");
  assert.equal(
    askValidation.includes('if (value === undefined || value === null || value === "")') && askValidation.includes('return "mock";'),
    true,
    "Ask must default to mock generation."
  );
  assert.equal(writingValidation.includes('? "mock" : value.generationMode'), true, "Writing must default to mock generation.");

  for (const route of ["app/api/ask/route.ts", "app/api/writing-assistant/route.ts"]) {
    const source = readSource(route);
    assert.equal(source.includes("stripModelMetadata"), true, `${route} must strip private model metadata.`);
  }
}

function assertExperienceEnhancementSurfaces() {
  const radarPage = readSource("app/radar/page.tsx");
  assert.equal(
    radarPage.includes("name=\"entity\"") &&
      radarPage.includes("RadarSavedFilters") &&
      radarPage.includes("readCategoryFilters") &&
      radarPage.includes("filters.categories") &&
      radarPage.includes("categoryQueryValue(group.categories)") &&
      radarPage.includes("sameCategorySet") &&
      radarPage.includes("categorySelectOptions") &&
      radarPage.includes("categorySelectValue") &&
      radarPage.includes("当前分组") &&
      radarPage.includes("feed.items.filter((item) => categories.some((category) => item.categories.includes(category))).length") &&
      radarPage.includes('category !== "all"') &&
      radarPage.includes("categories: [\"business\", \"funding\", \"regulation\", \"safety\"]"),
    true,
    "Radar page must expose entity filtering, saved filter views, and grouped reader category filters."
  );

  const entitiesPage = readSource("app/entities/page.tsx");
  assert.equal(
    entitiesPage.includes("loadRadarFeed") && !entitiesPage.includes("mockEntities"),
    true,
    "Entities page must derive its index from public radar evidence, not mock entities."
  );

  const reportsPage = readSource("app/reports/page.tsx");
  assert.equal(
    reportsPage.includes("已审核/已发布报告") && reportsPage.includes("证据草稿"),
    true,
    "Reports page must separate formal reports from evidence drafts."
  );
  assert.equal(
    readSource("app/page.tsx").includes("detail: summary.reports.savedCount"),
    false,
    "Homepage must not use savedCount as the formal reviewed/published report count."
  );
  assert.equal(
    readSource("app/page.tsx").includes("读者判断摘要") &&
      readSource("app/page.tsx").includes("DecisionCard") &&
      readSource("app/page.tsx").includes("只展示公开证据字段"),
    true,
    "Homepage must provide reader-facing decision guidance without operational vocabulary."
  );
  assert.equal(
    readSource("supabase/migrations/202605250001_report_quality_gate_public_views.sql").includes("stored_report_draft ->> 'markdown'"),
    false,
    "Public report views must not expose raw stored report markdown."
  );

  const savedFilters = readSource("components/radar-saved-filters.tsx");
  assert.equal(
    savedFilters.includes("ai-radar.saved-filters.v1") && savedFilters.includes("window.localStorage"),
    true,
    "Saved radar filters must use the documented localStorage key."
  );
}

function assertEvidenceToInsightLoopSurfaces() {
  const entityInsights = readSource("lib/radar/entity-insights.ts");
  assert.equal(
    entityInsights.includes("entityTrackingInsight") &&
      entityInsights.includes("buildEntitySummaries") &&
      entityInsights.includes("entityHref") &&
      entityInsights.includes("buildEntityEvidenceGraph") &&
      entityInsights.includes("nextQuestions"),
    true,
    "Entity insight helpers must derive tracking judgment from public radar evidence."
  );

  const entitiesPage = readSource("app/entities/page.tsx");
  assert.equal(
    entitiesPage.includes("跟踪队列") &&
      entitiesPage.includes("为什么跟踪") &&
      entitiesPage.includes("entityHref") &&
      entitiesPage.includes("报告路径"),
    true,
    "Entities page must explain why an entity is worth tracking and link to the report path."
  );

  const entityDetailPage = readSource("app/entities/[entityId]/page.tsx");
  assert.equal(
    entityDetailPage.includes("证据图") &&
      entityDetailPage.includes("证据时间线") &&
      entityDetailPage.includes("findEntitySummaryByRouteId") &&
      entityDetailPage.includes("buildEntityEvidenceGraph"),
    true,
    "Entity detail page must render a public evidence graph and timeline from shared entity insight helpers."
  );

  const radarPage = readSource("app/radar/page.tsx");
  assert.equal(
    radarPage.includes("从证据到洞察") &&
      radarPage.includes("buildEntitySummaries") &&
      radarPage.includes("entityHref") &&
      radarPage.includes("entityTrackingInsight"),
    true,
    "Radar page must connect evidence signals to entity tracking and downstream insight actions."
  );

  const reportsPage = readSource("app/reports/page.tsx");
  assert.equal(
    reportsPage.includes("证据到报告路径") &&
      reportsPage.includes("发布结论") &&
      !reportsPage.includes("/admin/review#report-candidates") &&
      reportsPage.includes("ReportEntityTraceabilityPanel") &&
      reportsPage.includes("reportEntityTraceability") &&
      reportsPage.includes("reportSectionTraceability") &&
      reportsPage.includes("章节实体覆盖"),
    true,
    "Reports page must show the reader-facing path from public evidence to formal reports, report traceability, and section-level entity coverage."
  );

  const reportDetailPage = readSource("app/reports/[id]/page.tsx");
  assert.equal(
    reportDetailPage.includes("ReportDetailEntityTraceability") &&
      reportDetailPage.includes("reportEntityTraceability") &&
      reportDetailPage.includes("reportSectionTraceability") &&
      reportDetailPage.includes("章节实体覆盖") &&
      reportDetailPage.includes("打开实体详情"),
    true,
    "Report detail page must link report and section evidence back to entity detail pages."
  );

  const reportTraceability = readSource("lib/reports/entity-traceability.ts");
  assert.equal(
    reportTraceability.includes("reportEntityTraceability") &&
      reportTraceability.includes("reportSectionTraceability") &&
      reportTraceability.includes("reportEvidenceItems") &&
      reportTraceability.includes("entityHref"),
    true,
    "Report entity traceability helpers must map report and section evidence back to public entity detail links."
  );
}

function assertTrustedPublishingSurfaces() {
  const reportsPage = readSource("app/reports/page.tsx");
  assert.equal(
    reportsPage.includes("发布准备度") && reportsPage.includes("reportPublishingReadiness"),
    true,
    "Reports page must explain publication readiness from shared readiness logic."
  );

  const adminReviewPage = readSource("app/admin/review/page.tsx");
  assert.equal(
    adminReviewPage.includes("Report publishing funnel") && adminReviewPage.includes("ENABLE_ADMIN_REVIEW_WRITES"),
    true,
    "Admin review must expose the publishing funnel and write-gate state."
  );

  const cloudflareSite = readSource("scripts/build-cloudflare-public-site.ts");
  assert.equal(
    cloudflareSite.includes("已审核/已发布报告") &&
      cloudflareSite.includes("证据草稿") &&
      cloudflareSite.includes("读者判断摘要") &&
      cloudflareSite.includes("正式报告用于读取结论") &&
      cloudflareSite.includes("Top 3 快照") &&
      cloudflareSite.includes("为什么重要") &&
      cloudflareSite.includes("primaryEventEntity") &&
      cloudflareSite.includes("eventEvidenceProfile") &&
      cloudflareSite.includes("eventDecisionCategory") &&
      cloudflareSite.includes("meaningfulTitleTokens") &&
      cloudflareSite.includes("case \"infrastructure\"") &&
      cloudflareSite.includes("case \"regulation\"") &&
      cloudflareSite.includes("case \"safety\"") &&
      cloudflareSite.includes("case \"other\"") &&
      cloudflareSite.includes("encodeURIComponent(category.query)") &&
      cloudflareSite.includes("snapshot.event_clusters.map((event) => categoryFilterValue(event.category))") &&
      cloudflareSite.includes("model_release,benchmark") &&
      cloudflareSite.includes("agent,product_update") &&
      cloudflareSite.includes("business,funding,regulation,safety") &&
      cloudflareSite.includes("parseCategoryFilter") &&
      cloudflareSite.includes("matchesCategoryFilter") &&
      cloudflareSite.includes("当前分组：") &&
      cloudflareSite.includes("categoryDisplayLabel") &&
      cloudflareSite.includes("singleCategoryOption") &&
      cloudflareSite.includes("return parseCategoryFilter(category.value)") &&
      cloudflareSite.includes('candidate !== "all"') &&
      cloudflareSite.includes('<a href="../../radar/">打开雷达</a>') &&
      !cloudflareSite.includes("category=all") &&
      !cloudflareSite.includes("encodeURIComponent(labelize(category.query))") &&
      !cloudflareSite.includes("option(entry.label, entry.label)") &&
      !cloudflareSite.includes("可能影响模型选型、API 成本、能力评估或基准对比。") &&
      !cloudflareSite.includes("等待第二来源、官方更新或社区复现实证后再扩大解读。") &&
      cloudflareSite.includes("报告关联实体") &&
      cloudflareSite.includes("source_health_by_family") &&
      cloudflareSite.includes("最近一次广泛刷新按来源家族汇总") &&
      cloudflareSite.includes("Latest broad refresh by source family") &&
      cloudflareSite.includes("reportSectionTraceability"),
    true,
    "Cloudflare static site must separate formal reports from evidence drafts and show reader decision guidance plus report-to-entity traceability."
  );

  const homepage = readSource("app/page.tsx");
  assert.equal(
    homepage.includes("primaryEventEntity") &&
    homepage.includes("eventEvidenceProfile") &&
      homepage.includes("eventDecisionCategory") &&
      homepage.includes("meaningfulTitleTokens") &&
      homepage.includes('href: "/radar"') &&
      !homepage.includes('href: "/radar?window=24h"') &&
      homepage.includes("radarCategoryHref([\"model_release\", \"benchmark\"]") &&
      homepage.includes("radarCategoryHref([\"agent\", \"product_update\"]") &&
      homepage.includes("radarCategoryHref([\"open_source\", \"infrastructure\"]") &&
      homepage.includes("radarCategoryHref([\"business\", \"funding\", \"regulation\", \"safety\"]") &&
      homepage.includes("summary.categorySignals.filter") &&
      !homepage.includes("\"policy\", \"safety\"") &&
      !homepage.includes("\"open_source\", \"tooling\", \"infrastructure\"") &&
      homepage.includes("case \"infrastructure\"") &&
      homepage.includes("case \"regulation\"") &&
      homepage.includes("case \"safety\"") &&
      homepage.includes("case \"other\"") &&
      !homepage.includes("可能影响模型选型、API 成本、能力评估或基准对比。") &&
      !homepage.includes("等待第二来源、官方更新或社区复现实证后再扩大解读。"),
    true,
    "Dynamic homepage event decision notes must stay entity- and evidence-aware instead of reverting to generic templates."
  );
}

function assertStaticEntityParityAndPublicSnapshotContract() {
  const cloudflareSite = readSource("scripts/build-cloudflare-public-site.ts");
  assert.equal(
      cloudflareSite.includes("renderAsk") &&
      cloudflareSite.includes("renderWrite") &&
      cloudflareSite.includes("localEvidenceToolScript") &&
      cloudflareSite.includes("renderEntities") &&
      cloudflareSite.includes("renderEntityDetail") &&
      cloudflareSite.includes("entities\", \"实体\"") &&
      cloudflareSite.includes("公开只读情报快照") &&
      cloudflareSite.includes("围绕行业精选提问") &&
      cloudflareSite.includes("基于事件开始写作") &&
      cloudflareSite.includes("buildEntitySummaries") &&
      cloudflareSite.includes("buildEntityEvidenceGraph") &&
      cloudflareSite.includes("entityTrackingInsight") &&
      cloudflareSite.includes("实体档案") &&
      cloudflareSite.includes("报告状态模型") &&
      cloudflareSite.includes("readerFacingCaveats") &&
      cloudflareSite.includes("AI 行业雷达公共情报快照") &&
      cloudflareSite.includes("path.join(entityDir, \"index.html\")") &&
      cloudflareSite.includes("../entities/${entityStaticSlug(trace.entity)}/") &&
      cloudflareSite.includes("fs.writeFile(path.join(outputDir, \"entities\", \"index.html\")") &&
      cloudflareSite.includes("fs.writeFile(path.join(outputDir, \"version.json\")"),
    true,
    "Cloudflare static site must expose Ask/Write, entity index/detail pages, and a public version marker."
  );

  const snapshotExporter = readSource("scripts/export-public-snapshot.ts");
  const supabasePublicContract = readSource("scripts/check-supabase-public-contract.ts");
  const supabaseLoader = readSource("lib/retrieval/load-supabase-radar-items.ts");
  const publicEntityMigration = readSource("supabase/migrations/202607010001_public_radar_items_entities.sql");
  assertPublicSnapshotSourceContract(snapshotExporter, supabaseLoader);
  assertSupabasePublicContractCheckScript(supabasePublicContract);
  assertPublicRadarViewSqlContract(publicEntityMigration);

  const snapshotPath = "dist/cloudflare-pages/data/radar-snapshot.json";
  assert.equal(fs.existsSync(path.join(process.cwd(), snapshotPath)), true, `${snapshotPath} must exist after the release build.`);
  assertPublicSnapshotJsonContract(snapshotPath);
  assert.equal(
    fs.existsSync(path.join(process.cwd(), "dist/cloudflare-pages/favicon.svg")),
    true,
    "Cloudflare static output must include its referenced favicon."
  );

  for (const pagePath of [
    "dist/cloudflare-pages/index.html",
    "dist/cloudflare-pages/radar/index.html",
    "dist/cloudflare-pages/entities/index.html",
    "dist/cloudflare-pages/reports/index.html",
    "dist/cloudflare-pages/ask/index.html",
    "dist/cloudflare-pages/write/index.html"
  ]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), pagePath)), true, `${pagePath} must exist after the release build.`);
    const page = readSource(pagePath);
    assert.equal(page.includes('rel="icon"'), true, `${pagePath} must reference the shared favicon.`);
    assert.equal(page.includes("activation_"), false, `${pagePath} must not expose refresh run ids.`);
    assert.equal(
      page.toLowerCase().includes("live deepseek activation"),
      false,
      `${pagePath} must not expose internal activation log phrasing.`
    );
  }
  assertBilingualStaticContract();
  assertStaticCategoryFilterContract("dist/cloudflare-pages/radar/index.html");
  assertStaticCategoryLinkContract("dist/cloudflare-pages/index.html");
  assertPublicStaticArtifactsDoNotExposeInternalTerms(["dist/cloudflare-pages"]);

  assertStaticReportEntityLinksContract("dist/cloudflare-pages/reports/index.html");

  const versionPath = path.join(process.cwd(), "dist/cloudflare-pages/version.json");
  assert.equal(fs.existsSync(versionPath), true, "Cloudflare version marker must exist.");
  const version = JSON.parse(fs.readFileSync(versionPath, "utf8")) as JsonRecord;
  assert.equal(version.product, "AI Industry Radar", "Cloudflare version marker must identify the correct product.");

  for (const forbiddenDir of ["dist/cloudflare-pages/clusters", "dist/github-pages"]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), forbiddenDir)), false, `${forbiddenDir} must not remain in static output.`);
  }
}

function assertBilingualStaticContract() {
  const routePairs = [
    ["dist/cloudflare-pages/index.html", "dist/cloudflare-pages/en/index.html"],
    ["dist/cloudflare-pages/radar/index.html", "dist/cloudflare-pages/en/radar/index.html"],
    ["dist/cloudflare-pages/entities/index.html", "dist/cloudflare-pages/en/entities/index.html"],
    ["dist/cloudflare-pages/reports/index.html", "dist/cloudflare-pages/en/reports/index.html"],
    ["dist/cloudflare-pages/ask/index.html", "dist/cloudflare-pages/en/ask/index.html"],
    ["dist/cloudflare-pages/write/index.html", "dist/cloudflare-pages/en/write/index.html"]
  ] as const;

  for (const [chinesePath, englishPath] of routePairs) {
    assert.equal(fs.existsSync(path.join(process.cwd(), chinesePath)), true, `${chinesePath} must exist.`);
    assert.equal(fs.existsSync(path.join(process.cwd(), englishPath)), true, `${englishPath} must exist.`);
    const chinese = readSource(chinesePath);
    const english = readSource(englishPath);
    assert.equal(chinese.includes('class="language-switch"') && chinese.includes('lang="en"'), true, `${chinesePath} must expose the top-right English switch.`);
    assert.equal(english.includes('<html lang="en">'), true, `${englishPath} must declare the English locale.`);
    assert.equal(english.includes('class="language-switch"') && english.includes('lang="zh-CN"'), true, `${englishPath} must expose the top-right Chinese switch.`);
  }

  const englishRadar = readSource("dist/cloudflare-pages/en/radar/index.html");
  for (const label of ["Selected", "All events", "All signals", "Latest timeline", "Needs review", "Source health"]) {
    assert.equal(englishRadar.includes(`>${label}<`), true, `English radar must expose the ${label} tab.`);
  }
  assert.equal(englishRadar.includes('data-tab-panel="curated"'), true, "English radar must keep the selected event view as the default tab.");
  assert.equal(englishRadar.includes('role="tab"') && englishRadar.includes('role="tabpanel"') && englishRadar.includes('aria-selected="true"'), true, "English radar must expose an accessible tab contract.");
  assert.equal(englishRadar.includes('data-status="included"') && englishRadar.includes('card.dataset.status === selectedStatus'), true, "English event cards must participate in the status filter.");
  assert.equal(englishRadar.includes('params.get("tab")') && englishRadar.includes('["ArrowLeft", "ArrowRight", "Home", "End"]'), true, "English radar must persist tab state and support keyboard tab navigation.");
  assert.equal(englishRadar.includes('id="radar-freshness"') && englishRadar.includes('data-freshness="'), true, "English radar must expose and apply the freshness filter.");
  assert.equal(englishRadar.includes("public store / ") && englishRadar.includes(" displayed") && englishRadar.includes("Rate-limit warnings (may overlap)"), true, "English radar must distinguish store/display counts and overlapping rate-limit warnings.");
  assert.equal(englishRadar.includes('>苹果<'), false, "English radar must not render Chinese entity aliases when an English alias is available.");
  assert.equal(englishRadar.includes("Single-source observation") && englishRadar.includes("Multiple reports, one family") && englishRadar.includes("Cross-family corroboration"), true, "English radar must distinguish cross-family corroboration, same-family repetition, and single-source observations.");
  assert.equal(englishRadar.includes('value="cross"') && englishRadar.includes('value="same"') && englishRadar.includes('id="radar-result-count"') && englishRadar.includes('id="radar-reset"'), true, "English radar must expose evidence-state filters, live result counts, and reset.");
  assert.equal(englishRadar.includes('value="regulation"') && englishRadar.includes('value="media_interview"'), true, "English radar must expose all public event categories, including regulation and media/interview.");

  const chineseRadar = readSource("dist/cloudflare-pages/radar/index.html");
  assert.equal(chineseRadar.includes("单源观察") && chineseRadar.includes("同家族多源复述") && chineseRadar.includes("跨家族确认"), true, "Chinese radar must distinguish cross-family corroboration, same-family repetition, and single-source observations.");
  assert.equal(chineseRadar.includes('id="radar-result-count"') && chineseRadar.includes('id="radar-reset"') && chineseRadar.includes('value="regulation"') && chineseRadar.includes('>监管<'), true, "Chinese radar must expose complete localized filters with count/reset controls.");
  assert.equal(chineseRadar.includes('data-status="included"') && chineseRadar.includes('id="radar-freshness"') && chineseRadar.includes("条公开库 /") && chineseRadar.includes("条本站展示") && chineseRadar.includes("限流警告（可重叠）"), true, "Chinese radar must filter event status/freshness and explain count/failure semantics.");

  const englishEntities = readSource("dist/cloudflare-pages/en/entities/index.html");
  assert.equal(englishEntities.includes("持续跟踪") || englishEntities.includes("观察中"), false, "English entities must localize tracking-priority labels.");
  const chineseEntities = readSource("dist/cloudflare-pages/entities/index.html");
  assert.equal(chineseEntities.includes('href="../radar/"') && chineseEntities.includes('href="../reports/"'), true, "Chinese entity index links must resolve from /entities/ to sibling routes.");
  assert.equal(chineseEntities.includes('href="radar/"') || chineseEntities.includes('href="reports/"'), false, "Chinese entity index must not generate nested /entities/radar or /entities/reports links.");

  const englishReports = readSource("dist/cloudflare-pages/en/reports/index.html");
  assert.equal(englishReports.includes("Event-aware reports") && englishReports.includes("Baseline evidence gate"), true, "English reports must expose event and quality-gate context.");
  assert.equal(englishReports.includes("Baseline evidence gate") && englishReports.includes("Multiple reports / cross-family / all events") && englishReports.includes("Release readiness"), true, "English reports must separate baseline evidence volume from event corroboration and release readiness.");
  assert.equal(englishReports.includes("Evidence draft, not release-ready"), true, "English reports must lead with the non-publication state when independent corroboration is insufficient.");
  const chineseReports = readSource("dist/cloudflare-pages/reports/index.html");
  assert.equal(chineseReports.includes("来源家族确认与可信度") && chineseReports.includes("跨家族确认事件") && chineseReports.includes("同家族多源复述事件"), true, "Chinese report body and Markdown must use source-family-aware confirmation language.");
  assert.equal(chineseReports.includes("多源确认与可信度") || chineseReports.includes("个多源确认事件"), false, "Chinese reports must not present same-family repetition as independent multi-source confirmation.");

  const publicSnapshot = JSON.parse(readSource("dist/cloudflare-pages/data/radar-snapshot.json")) as {
    curated_events?: Array<{ event_score_label?: string; source_count?: number; source_families?: string[] }>;
    reports?: Array<{ mode?: string; report_type?: string; source_item_ids?: string[] }>;
  };
  for (const event of publicSnapshot.curated_events ?? []) {
    if (event.event_score_label === "高优先级") {
      assert.equal((event.source_count ?? 0) >= 2, true, "High-priority public events must have multi-source support.");
      assert.equal((event.source_families?.length ?? 0) >= 2, true, "High-priority public events must span more than one source family.");
    }
  }
  const candidateSignatures = (publicSnapshot.reports ?? [])
    .filter((report) => report.mode === "saved_candidate")
    .map((report) => `${report.report_type}:${[...(report.source_item_ids ?? [])].sort().join(",")}`);
  assert.equal(new Set(candidateSignatures).size, candidateSignatures.length, "Public snapshot must deduplicate saved report candidates by stable content signature.");

  const englishAsk = readSource("dist/cloudflare-pages/en/ask/index.html");
  const englishWrite = readSource("dist/cloudflare-pages/en/write/index.html");
  assert.equal(englishAsk.includes("Query public events") && englishAsk.includes("../../data/radar-snapshot.json"), true, "English Ask must query the public event snapshot locally.");
  assert.equal(englishWrite.includes("Generate an evidence-led outline") && englishWrite.includes("../../data/radar-snapshot.json"), true, "English Write must generate from the public event snapshot locally.");
  assert.equal(englishAsk.includes("filter((entry) => entry.score !== null)") && englishAsk.includes("multiple source families") && englishAsk.includes("No matching event"), true, "English Ask must apply bilingual intent matching and a real no-match threshold.");
  const publicStyles = readSource("dist/cloudflare-pages/assets/styles.css");
  assert.equal(publicStyles.includes(":focus-visible") && publicStyles.includes("outline: 3px solid"), true, "Static public controls and links must expose a visible keyboard focus state.");
}

function assertStaticCategoryFilterContract(pagePath: string) {
  assert.equal(fs.existsSync(path.join(process.cwd(), pagePath)), true, `${pagePath} must exist after the release build.`);
  const page = readSource(pagePath);
  assert.equal(page.includes('value="model_release"'), true, `${pagePath} must expose raw model_release option value.`);
  assert.equal(page.includes('value="open_source"'), true, `${pagePath} must expose raw open_source option value.`);
  assert.equal(page.includes('value="product_update"'), true, `${pagePath} must expose raw product_update option value.`);
  assert.equal(page.includes('value="model release"'), false, `${pagePath} must not expose display labels as category option values.`);
  assert.equal(page.includes('value="open source"'), false, `${pagePath} must not expose display labels as category option values.`);
  assert.equal(page.includes("当前分组："), true, `${pagePath} must expose a selected grouped category option for multi-category entry links.`);
  assert.equal(page.includes("categoryDisplayLabel"), true, `${pagePath} must label grouped category options for readers.`);
  assert.equal(page.includes("singleCategoryOption"), true, `${pagePath} must expose a selected option for valid single-category deep links missing from top categories.`);
}

function assertStaticCategoryLinkContract(pagePath: string) {
  assert.equal(fs.existsSync(path.join(process.cwd(), pagePath)), true, `${pagePath} must exist after the release build.`);
  const page = readSource(pagePath);
  assert.equal(page.includes("category=model_release%2Cbenchmark"), true, `${pagePath} must link model reader entry to model_release + benchmark.`);
  assert.equal(page.includes("category=agent%2Cproduct_update"), true, `${pagePath} must link product reader entry to agent + product_update.`);
  assert.equal(page.includes("category=open_source%2Cinfrastructure"), true, `${pagePath} must link developer reader entry to open_source + infrastructure.`);
  assert.equal(page.includes("category=business%2Cfunding%2Cregulation%2Csafety"), true, `${pagePath} must link business reader entry to grouped business/policy categories.`);
  assert.equal(/category=model_release["&<]/.test(page), false, `${pagePath} must not link the model reader entry to model_release alone.`);
  assert.equal(/category=agent["&<]/.test(page), false, `${pagePath} must not link the product reader entry to agent alone.`);
  assert.equal(/category=open_source["&<]/.test(page), false, `${pagePath} must not link the developer reader entry to open_source alone.`);
  assert.equal(/category=business["&<]/.test(page), false, `${pagePath} must not link the business reader entry to business alone.`);
  assert.equal(page.includes("category=model%20release"), false, `${pagePath} must not link to display label model release.`);
  assert.equal(page.includes("category=open%20source"), false, `${pagePath} must not link to display label open source.`);
  assert.equal(page.includes("category=all"), false, `${pagePath} must not link to all as a concrete category.`);
  assert.equal(page.includes("category=%E6"), false, `${pagePath} must not link to localized category labels.`);
}

function assertSupabasePublicContractCheckScript(source: string) {
  assert.deepEqual(
    selectListFromRestPath(source, "public_radar_items?select=id,local_id,entities&limit=1"),
    ["entities", "id", "local_id"],
    "Remote Supabase public contract check must allow only public id/local_id/entities columns."
  );
  assert.deepEqual(
    selectListFromRestPath(source, "public_radar_items?select=raw_item_id&limit=1"),
    ["raw_item_id"],
    "Remote Supabase public contract check must verify raw_item_id is rejected."
  );
  assert.deepEqual(
    selectListFromRestPath(source, "public_radar_items?select=evidence_notes&limit=1"),
    ["evidence_notes"],
    "Remote Supabase public contract check must verify free-form evidence_notes are rejected."
  );
  assert.deepEqual(
    selectListFromRestPath(source, "public_radar_items?select=model_metadata&limit=1"),
    ["model_metadata"],
    "Remote Supabase public contract check must verify model_metadata is rejected."
  );
  assert.deepEqual(
    selectListFromRestPath(source, "public_radar_items?select=*&limit=1"),
    ["*"],
    "Remote Supabase public contract check must verify the complete select=* public column set."
  );
  assert.equal(
    source.includes("publicRadarItemAllowedKeys") && source.includes('"why_it_matters"') && source.includes('"entities"'),
    true,
    "Remote Supabase public contract check must keep an explicit select=* whitelist."
  );
  assert.equal(
    source.includes("supabase_project_host_dns_not_found") && source.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    true,
    "Remote Supabase public contract check must report DNS failures safely and read only anon public config."
  );
}

function selectListFromRestPath(source: string, restPath: string) {
  assert.equal(source.includes(restPath), true, `Expected remote contract request path: ${restPath}`);
  const selectStart = restPath.indexOf("select=");
  const selectEnd = restPath.indexOf("&", selectStart);
  return restPath
    .slice(selectStart + "select=".length, selectEnd === -1 ? undefined : selectEnd)
    .split(",")
    .sort();
}

function assertPublicSnapshotSourceContract(snapshotExporter: string, supabaseLoader: string) {
  assert.deepEqual(
    exportedPublicEntityKeys(snapshotExporter),
    ["confidence", "name", "type"],
    "publicSafeEntities must emit exactly the public entity key set."
  );

  assert.deepEqual(
    selectListStringLiterals(supabaseLoader, "public_radar_items").filter((column) => column === "raw_item_id"),
    [],
    "Supabase public retrieval loader must not select raw_item_id from public_radar_items."
  );
  assert.equal(
    selectListStringLiterals(supabaseLoader, "public_radar_items").includes("entities"),
    true,
    "Supabase public retrieval loader must select public-safe entities."
  );
  assert.equal(
    selectListStringLiterals(supabaseLoader, "public_radar_items").includes("evidence_notes"),
    false,
    "Supabase public retrieval loader must not select free-form evidence_notes from public_radar_items."
  );
  assert.equal(
    selectListStringLiterals(snapshotExporter, "public_radar_items").includes("evidence_notes"),
    false,
    "Public snapshot exporter must not select free-form evidence_notes from public_radar_items."
  );

  const imports = importSpecifiers(snapshotExporter);
  assert.deepEqual(
    imports.filter((specifier) => specifier === "@/lib/supabase/service"),
    [],
    "Public snapshot export must not import the service-role Supabase helper."
  );
}

function assertPublicRadarViewSqlContract(sql: string) {
  const stripped = stripSqlComments(sql);
  const selectedColumns = publicRadarViewSelectedColumns(stripped);
  const entityKeys = jsonbBuildObjectKeys(stripped);

  assert.equal(selectedColumns.includes("entities"), true, "public_radar_items must expose public-safe entities.");
  assert.deepEqual(
    selectedColumns.filter((column) => column === "raw_item_id"),
    [],
    "public_radar_items must not expose raw_item_id."
  );
  assert.deepEqual(
    selectedColumns.filter((column) => column === "evidence_text"),
    [],
    "public_radar_items must not expose entity evidence_text."
  );
  assert.deepEqual(
    selectedColumns.filter((column) => column === "evidence_notes"),
    [],
    "public_radar_items must not expose free-form evidence_notes."
  );
  assert.deepEqual(
    entityKeys,
    ["confidence", "name", "type"],
    "public_radar_items entity JSON must expose only name/type/confidence."
  );
  assert.equal(
    /\bie\.evidence_text\b/i.test(stripped),
    false,
    "public_radar_items SQL must not read item_entities.evidence_text."
  );
  assert.equal(
    stripped.includes("credential|secret|session|signature|signed|token") && stripped.includes("x-amz-"),
    true,
    "public_radar_items SQL must reject sensitive query-parameter URLs."
  );
}

function exportedPublicEntityKeys(source: string) {
  const match = source.match(/entities\.push\(\{\s*([\s\S]*?)\s*\}\);/);
  assert.equal(Boolean(match), true, "publicSafeEntities must push a literal public entity object.");

  return [...match![1].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::|,|$)/gm)]
    .map((entry) => entry[1])
    .sort();
}

function selectListStringLiterals(source: string, tableName: string) {
  const tableIndex = source.indexOf(`.from("${tableName}")`);
  assert.notEqual(tableIndex, -1, `Expected Supabase query for ${tableName}.`);
  const selectIndex = source.indexOf(".select(", tableIndex);
  const joinIndex = source.indexOf("].join", selectIndex);
  assert.notEqual(selectIndex, -1, `Expected select list for ${tableName}.`);
  assert.notEqual(joinIndex, -1, `Expected array join select list for ${tableName}.`);

  const selectSource = source.slice(selectIndex, joinIndex);
  return [...selectSource.matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function importSpecifiers(source: string) {
  return [...source.matchAll(/from\s+"([^"]+)"/g)].map((entry) => entry[1]);
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function publicRadarViewSelectedColumns(sql: string) {
  const match = sql.match(/\)\s*select\s+([\s\S]*?)\s+from\s+projected_radar_items/i);
  assert.equal(Boolean(match), true, "Expected final public_radar_items SELECT projection.");

  return match![1]
    .split(",")
    .map((column) => column.trim().replace(/\s+as\s+.*$/i, ""))
    .filter(Boolean);
}

function jsonbBuildObjectKeys(sql: string) {
  const match = sql.match(/jsonb_build_object\s*\(([\s\S]*?)\)\s*\)/i);
  assert.equal(Boolean(match), true, "Expected entity jsonb_build_object projection.");

  return [...match![1].matchAll(/'([^']+)'\s*,/g)]
    .map((entry) => entry[1])
    .sort();
}

function assertPublicSnapshotJsonContract(snapshotPath: string) {
  const parsed = JSON.parse(fs.readFileSync(path.join(process.cwd(), snapshotPath), "utf8")) as unknown;
  const bannedKeys = new Set([
    "content_hash",
    "embedding",
    "evidence_text",
    "raw_items",
    "ingestion_runs",
    "understanding_runs",
    "item_entities",
    "raw_item_id",
    "moderation_reason",
    "original_summary",
    "raw_url",
    "supabase_id",
    "source_to_raw_coverage",
    "raw_to_radar_conversion",
    "raw_text",
    "raw_metadata",
    "model_metadata",
    "evidence_notes"
  ]);
  const hits: string[] = [];

  function visit(value: unknown, trail: string) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${trail}[${index}]`));
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const nextTrail = trail ? `${trail}.${key}` : key;
      if (bannedKeys.has(key)) {
        hits.push(nextTrail);
      }
      visit(child, nextTrail);
    }
  }

  visit(parsed, "");
  assert.deepEqual(hits, [], `${snapshotPath} must not expose internal public snapshot keys.`);

  assert.equal(isRecord(parsed), true, `${snapshotPath} must be a JSON object.`);
  const snapshot = parsed as JsonRecord;
  const source = snapshot.source;
  assert.equal(isRecord(source), true, `${snapshotPath}.source must be an object.`);
  const sourceWarnings = (source as JsonRecord).warnings;
  assert.equal(Array.isArray(sourceWarnings), true, `${snapshotPath}.source.warnings must be an array.`);
  assertPublicWarningsAreReaderSafe(sourceWarnings as unknown[], `${snapshotPath}.source.warnings`);

  const radarItems = snapshot.radar_items;
  assert.equal(Array.isArray(radarItems), true, `${snapshotPath} must expose radar_items array.`);
  const publicRadarItems = radarItems as unknown[];
  const entityAllowedKeys = new Set(["confidence", "name", "type"]);
  const entityKeyViolations: string[] = [];
  const entityShapeViolations: string[] = [];
  const corruptedIndustryTerms: string[] = [];

  publicRadarItems.forEach((item, itemIndex) => {
    assert.equal(isRecord(item), true, `${snapshotPath}.radar_items[${itemIndex}] must be an object.`);
    const radarItem = item as JsonRecord;
    const renderedText = JSON.stringify(radarItem);
    if (/\b(?:MANA secret|Visual secret Pruning|secret-wise expert weighting)\b/i.test(renderedText)) {
      corruptedIndustryTerms.push(`${snapshotPath}.radar_items[${itemIndex}]`);
    }
    const entities = radarItem.entities;
    assert.equal(Array.isArray(entities), true, `${snapshotPath}.radar_items[${itemIndex}].entities must be an array.`);
    const publicEntities = entities as unknown[];

    publicEntities.forEach((entity, entityIndex) => {
      const trail = `${snapshotPath}.radar_items[${itemIndex}].entities[${entityIndex}]`;
      if (!isRecord(entity)) {
        entityShapeViolations.push(`${trail} is not an object`);
        return;
      }

      for (const key of Object.keys(entity)) {
        if (!entityAllowedKeys.has(key)) {
          entityKeyViolations.push(`${trail}.${key}`);
        }
      }

      if (typeof entity.name !== "string" || entity.name.trim().length === 0) {
        entityShapeViolations.push(`${trail}.name must be a non-empty string`);
      }
      if (typeof entity.type !== "string" || entity.type.trim().length === 0) {
        entityShapeViolations.push(`${trail}.type must be a non-empty string`);
      }
      if (typeof entity.confidence !== "number" || entity.confidence < 0 || entity.confidence > 1) {
        entityShapeViolations.push(`${trail}.confidence must be a number between 0 and 1`);
      }
    });
  });

  assert.deepEqual(entityKeyViolations, [], `${snapshotPath} public entities must expose only name/type/confidence.`);
  assert.deepEqual(entityShapeViolations, [], `${snapshotPath} public entities must use the expected public shape.`);
  assert.deepEqual(
    corruptedIndustryTerms,
    [],
    `${snapshotPath} credential redaction must not corrupt ordinary AI terms such as token or token-wise.`
  );
}

function assertPublicWarningsAreReaderSafe(values: unknown[], label: string) {
  const forbidden = /(CLOUDFLARE_SNAPSHOT_READ_SUPABASE|cloudflare static snapshot export|getaddrinfo|ENOTFOUND|TypeError: fetch failed|read failed|count failed|latest timestamp failed|duplicate refresh rows|reviewed local public report snapshot|Loaded \d+ reviewed|读取失败|计数读取失败|最新时间读取失败|网络连接失败)/i;
  const hits = values
    .filter((value): value is string => typeof value === "string")
    .filter((value) => forbidden.test(value));

  assert.deepEqual(hits, [], `${label} must not expose internal export/runtime logs.`);
}

function assertPublicStaticArtifactsDoNotExposeInternalTerms(roots: string[]) {
  const forbiddenStrings = [
    "CLOUDFLARE_SNAPSHOT_READ_SUPABASE",
    "evidence_notes",
    "raw_item_id",
    "model_metadata",
    "activation_",
    "getaddrinfo",
    "ENOTFOUND",
    "TypeError: fetch failed",
    "duplicate refresh rows",
    "reviewed local public report snapshot",
    "Cloudflare static snapshot export",
    "Supabase public reads skipped",
    "Supabase public reads failed",
    "public_radar_items read failed",
    "public_report_candidates read failed",
    "public_reports read failed",
    "latest timestamp failed",
    "count failed",
    "读取失败：网络连接失败",
    "计数读取失败",
    "最新时间读取失败",
    "live DeepSeek activation",
    "public-safe refresh",
    "public evidence refresh",
    "refresh run log",
    "service-role",
    "Cloudflare Pages",
    "Vercel Admin"
  ];
  const forbiddenPatterns = [
    /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/
  ];
  const hits: string[] = [];

  for (const root of roots) {
    for (const file of staticHtmlJsonFiles(path.join(process.cwd(), root))) {
      const rel = path.relative(process.cwd(), file);
      const text = fs.readFileSync(file, "utf8");

      for (const forbidden of forbiddenStrings) {
        if (text.includes(forbidden)) {
          hits.push(`${rel}: ${forbidden}`);
        }
      }

      for (const pattern of forbiddenPatterns) {
        const match = text.match(pattern);
        if (match) {
          hits.push(`${rel}: ${match[0].slice(0, 16)}...`);
        }
      }
    }
  }

  assert.deepEqual(hits, [], "Public static HTML/JSON artifacts must not expose internal fields, run logs, or credentials.");
}

function staticHtmlJsonFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...staticHtmlJsonFiles(fullPath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".html") || entry.name.endsWith(".json"))) {
      files.push(fullPath);
    }
  }
  return files;
}

function assertStaticReportEntityLinksContract(reportPath: string) {
  const html = fs.readFileSync(path.join(process.cwd(), reportPath), "utf8");
  const entityChipLinks = [...html.matchAll(/class="entity-chip"\s+href="([^"]+)"/g)].map((match) => match[1]);
  const reportDir = path.dirname(path.join(process.cwd(), reportPath));
  const siteRoot = path.dirname(reportDir);
  const detailViolations: string[] = [];

  assert.equal(entityChipLinks.length > 0, true, `${reportPath} must render report-to-entity traceability links.`);
  assert.deepEqual(
    entityChipLinks.filter((href) => !href.startsWith("../entities/")),
    [],
    `${reportPath} entity chips must link to local static entity detail pages.`
  );
  assert.deepEqual(
    entityChipLinks.filter((href) => href.includes("://") || href.includes("%2F") || href.includes("%2f")),
    [],
    `${reportPath} entity chips must not link to dynamic hosts or percent-encoded path separators.`
  );

  for (const href of [...new Set(entityChipLinks)]) {
    const detailDir = path.resolve(reportDir, href);
    const detailPath = path.join(detailDir, "index.html");
    if (!detailDir.startsWith(siteRoot)) {
      detailViolations.push(`${href} resolves outside the static site root`);
      continue;
    }
    if (!fs.existsSync(detailPath)) {
      detailViolations.push(`${href} does not resolve to an entity detail index.html`);
      continue;
    }

    const detailHtml = fs.readFileSync(detailPath, "utf8");
    if (!detailHtml.includes("Evidence timeline") && !detailHtml.includes("证据时间线")) {
      detailViolations.push(`${href} detail page is missing an evidence timeline`);
    }
  }

  assert.deepEqual(
    detailViolations,
    [],
    `${reportPath} entity chips must resolve to local entity detail pages with evidence timelines.`
  );
}

function assertTrustedPublishingReadiness() {
  const reviewedReport = mockReport({
    id: "reviewed-report",
    mode: "saved_report",
    status: "reviewed"
  });
  const publishedReport = mockReport({
    id: "published-report",
    mode: "saved_report",
    status: "published"
  });
  const publishableCandidate = mockReport({
    id: "publishable-candidate",
    mode: "saved_candidate",
    status: "approved"
  });
  const weakApprovedCandidate = mockReport({
    citations: [],
    citation_count: 0,
    distinct_source_count: 0,
    id: "weak-approved-candidate",
    missing_evidence: ["Independent confirmation"],
    mode: "saved_candidate",
    quality_gate_passed: false,
    quality_gate_reasons: ["Missing independent citations"],
    source_item_ids: [],
    status: "approved",
    usable_item_count: 0
  });
  const preview = mockReport({
    id: "preview",
    mode: "deterministic_preview",
    read_source: "generated_preview",
    status: "preview"
  });

  assert.equal(reportPublishingReadiness(reviewedReport).isFormalPublicReport, true);
  assert.equal(reportPublishingReadiness(publishedReport).stage, "published_report");
  assert.equal(reportPublishingReadiness(publishableCandidate).isPublishableCandidate, true);
  assert.equal(reportPublishingReadiness(publishableCandidate).isFormalPublicReport, false);
  assert.equal(reportPublishingReadiness(weakApprovedCandidate).isPublishableCandidate, false);
  assert.equal(reportPublishingReadiness(preview).isFormalPublicReport, false);

  const summary = summarizePublishingReadiness([
    reviewedReport,
    publishedReport,
    publishableCandidate,
    weakApprovedCandidate,
    preview
  ]);
  assert.equal(summary.formalReports, 2);
  assert.equal(summary.approvedCandidates, 2);
  assert.equal(summary.publishableCandidates, 1);
  assert.equal(summary.blocked, 2);
}

function assertTrustedPublishingRegressionGuards() {
  const loader = readSource("lib/reports/load-report-data.ts");
  assert.equal(
    loader.includes("60 + sourcePriority") && !loader.includes('document.read_source === "public_snapshot") {\n    return 7;'),
    true,
    "Live reviewed/published reports must outrank stale public snapshot candidates."
  );

  const adminReviewPage = readSource("app/admin/review/page.tsx");
  const adminActions = readSource("lib/admin/actions.ts");
  assert.equal(
    adminReviewPage.includes("Evidence blocked") && adminActions.includes("assertReportCandidatePublishable"),
    true,
    "Admin publish buttons and server action must share the evidence-ready publication gate."
  );
  assert.equal(
    adminReviewPage.includes("usableItemCount") &&
      adminReviewPage.includes("distinctSourceCount") &&
      adminReviewPage.includes("qualityGatePassed") &&
      readSource("lib/admin/review.ts").includes("reportDraftQualityGatePassed"),
    true,
    "Admin publishing funnel must mirror the server publish gate for usable items, distinct sources, and quality gate failures."
  );

  const cloudflareMirror = readSource("scripts/build-cloudflare-public-site.ts");
  assert.equal(
    cloudflareMirror.includes("snapshot.reports.filter(isFormalSnapshotReport)") &&
      !cloudflareMirror.includes("const reports = latestReportsByType(snapshot);"),
    true,
    "Cloudflare reports page must not let a newer evidence draft hide a formal reviewed/published report."
  );

  const opsSummaryWriter = readSource("scripts/write-ops-summary.ts");
  assert.equal(
    opsSummaryWriter.includes("coverageCountsAreConsistent") &&
      opsSummaryWriter.includes("internally inconsistent after one retry"),
    true,
    "The safe operations summary must reject transiently inconsistent radar/public counts after one retry."
  );

  const publicSnapshotExport = readSource("scripts/export-public-snapshot.ts");
  assert.equal(
    publicSnapshotExport.includes("publicSafeRadarItem") &&
      publicSnapshotExport.includes("function publicSafeReport") &&
      publicSnapshotExport.includes("source_health_by_family") &&
      publicSnapshotExport.includes("aggregateSourceFamilyHealth") &&
      publicSnapshotExport.includes("function publicSourceWarnings") &&
      publicSnapshotExport.includes("warnings: publicSourceWarnings(snapshot)") &&
      !/function publicSafeReport[\s\S]*?\{\s*\.\.\.report,/.test(publicSnapshotExport) &&
      !/function sanitizePublicSnapshot[\s\S]*?return\s*\{\s*\.\.\.snapshot,/.test(publicSnapshotExport),
    true,
    "Public snapshot reuse must rebuild radar/report JSON and source warnings through explicit public allowlists."
  );
  assert.equal(
    publicSnapshotExport.includes("[redacted secret]") && !publicSnapshotExport.includes('"$1=[redacted]"'),
    true,
    "Public snapshot warnings must not preserve secret environment variable names."
  );

  assert.equal(
    fs.existsSync(path.join(process.cwd(), "scripts/build-github-pages-mirror.ts")),
    false,
    "Release code must not retain a GitHub Pages publishing path."
  );
  assert.equal(
    fs.existsSync(path.join(process.cwd(), ".github/workflows/github-pages-public-mirror.yml")),
    false,
    "Release workflows must not deploy GitHub Pages."
  );
}

async function assertLocalPublicReports() {
  const loaded = await loadLocalPublicReportSnapshotRecords();
  assert.equal(loaded.records.length > 0, true, "At least one reviewed local public report snapshot must exist.");

  for (const record of loaded.records) {
    assert.equal(isRecord(record), true, "Local public report snapshots must contain report objects.");
    const report = record as JsonRecord;
    assert.equal(Object.hasOwn(report, "model_metadata"), false, "Local public reports must not include model metadata.");
    assert.equal(Object.hasOwn(report, "token_usage"), false, "Local public reports must not include token usage.");
    assert.equal(report.mode === "saved_report" || report.mode === "saved_candidate", true);
    assert.equal(
      report.mode === "saved_report"
        ? report.status === "reviewed" || report.status === "published"
        : report.status === "approved" || report.status === "published",
      true,
      "Local public reports must be reviewed/published reports or approved candidates."
    );
  }

  const localReportData = readSource("data/public-reports/reviewed-ai-radar-daily-2026-06-22.json");
  assert.equal(localReportData.includes("\"mode\": \"saved_report\""), true);
  assert.equal(localReportData.includes("\"status\": \"reviewed\""), true);
  assert.equal(localReportData.includes("\"markdown\""), false);
  assert.equal(localReportData.includes("external:learnprompt:"), false);
}

function assertLearnPromptAdapter() {
  const now = new Date("2026-06-30T12:00:00.000Z");
  const latest = normalizeLearnPromptLatestPayload(
    {
      generated_at: "2026-06-30T00:00:00.000Z",
      source_count: 2,
      total_items: 2,
      items_ai: [
        {
          ai_label: "model_release",
          ai_noise: ["coupon"],
          ai_relevance_reason: "matched_ai_signal",
          ai_score: 0.96,
          ai_signals: ["openai", "gpt"],
          first_seen_at: "2026-06-30T01:00:00.000Z",
          id: "learnprompt-item-1",
          last_seen_at: "2026-06-30T02:00:00.000Z",
          published_at: "2026-06-30T00:30:00.000Z",
          site_id: "official_ai",
          site_name: "Official AI Updates",
          source: "OpenAI News",
          source_tier: "official",
          source_tier_label: "官方一手源",
          source_tier_rank: 0,
          title_bilingual: "OpenAI releases GPT test / OpenAI releases GPT test",
          title_en: "OpenAI releases GPT test",
          title_zh: "OpenAI 发布 GPT 测试",
          url: "https://openai.com/news/test?utm_source=x&fbclid=tracking"
        },
        {
          ai_score: 0.2,
          id: "invalid",
          title: "Missing URL"
        }
      ]
    },
    now
  );

  assert.equal(latest.freshness.isStale, false);
  assert.equal(latest.items.length, 1);
  assert.equal(latest.items[0].id, "external:learnprompt:learnprompt-item-1");
  assert.equal(latest.items[0].ai_signals.includes("openai"), true);
  assert.deepEqual(latest.items[0].provenance, {
    provider: "learnprompt",
    review_status: "external_unreviewed",
    usage: "source_repair_only"
  });

  const stale = normalizeLearnPromptLatestPayload(
    {
      generated_at: "2026-06-28T00:00:00.000Z",
      items: []
    },
    now
  );
  assert.equal(stale.freshness.isStale, true, "LearnPrompt latest data older than 36h must be marked stale.");
  const future = normalizeLearnPromptLatestPayload(
    {
      generated_at: "2026-06-30T13:00:00.000Z",
      items: []
    },
    now
  );
  assert.equal(future.freshness.isStale, true, "LearnPrompt generated_at too far in the future must be marked stale.");

  const mapped = mapLearnPromptItemToRetrievalRadarItem(latest.items[0]);
  assert.equal(mapped.id, "external:learnprompt:learnprompt-item-1");
  assert.equal(mapped.status, "excluded");
  assert.deepEqual(mapped.categories, ["model_release"]);
  assert.equal(Object.hasOwn(mapped, "model_metadata"), false);
  assert.equal(isExternalSourceRepairSignal(mapped), true);

  const slashTimestamp = normalizeLearnPromptLatestPayload(
    {
      generated_at: "2026/6/30 0:03:57",
      items: []
    },
    now
  );
  assert.equal(slashTimestamp.freshness.isStale, false, "LearnPrompt slash timestamps without timezone must be interpreted as UTC diagnostics input.");

  const candidates = selectLearnPromptDiffCandidates(latest, [
    {
      source_name: "Other Source",
      title: "Different item",
      url: "https://example.com/different"
    }
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].reason, "external_official_high_score_missing");

  const duplicateCandidates = selectLearnPromptDiffCandidates(latest, [
    {
      source_name: "OpenAI News",
      title: "OpenAI releases GPT test",
      url: "https://openai.com/news/test"
    }
  ]);
  assert.equal(duplicateCandidates.length, 0, "LearnPrompt diff must suppress URL/source-title duplicates.");

  const sourceStatus = normalizeLearnPromptSourceStatusPayload(
    {
      failed_sites: ["x_api"],
      generated_at: "2026-06-30T00:00:00.000Z",
      sites: [
        {
          duration_ms: 100,
          error: null,
          item_count: 8,
          ok: true,
          site_id: "official_ai",
          site_name: "Official AI Updates"
        }
      ],
      successful_sites: 1,
      zero_item_sites: ["empty_source"]
    },
    now
  );
  assert.equal(sourceStatus.sites.length, 1);
  assert.equal(sourceStatus.failed_sites, 1);
  assert.equal(sourceStatus.zero_item_sites, 1);

  assert.equal(publicInternetHttpUrl("https://openai.com/news/test"), "https://openai.com/news/test");
  assert.equal(publicInternetHttpUrl("https://openai.com/news/test?utm_source=newsletter"), "https://openai.com/news/test?utm_source=newsletter");
  assert.equal(isPublicInternetHttpUrl("http://localhost:3000/private"), false);
  assert.equal(isPublicInternetHttpUrl("http://10.0.0.1/private"), false);
  assert.equal(isPublicInternetHttpUrl("https://internal.example.com/private"), false);
  assert.equal(isPublicInternetHttpUrl("https://example.com/file?token=secret"), false);
  assert.equal(isPublicInternetHttpUrl("https://example.com/file?X-Amz-Signature=secret"), false);
  assert.equal(isPublicInternetHttpUrl("https://example.com/oauth?client_secret=secret"), false);
  assert.equal(isPublicInternetHttpUrl("https://example.com/oauth?refresh_token=secret"), false);
}

function assertLearnPromptBoundaryLanguage() {
  const integrationPlan = readSource("docs/learnprompt-ai-news-radar-integration-vnext.md");
  const diffReport = readSource("docs/learnprompt-ai-news-radar-diff-2026-06-30.md");
  const diffScript = readSource("scripts/compare-learnprompt-radar.ts");
  const combined = [integrationPlan, diffReport, diffScript].join("\n");

  for (const forbidden of [
    "public evidence notes",
    "curated event candidates",
    "report evidence candidates",
    "promoted by the existing review path",
    "Mapping Into Our Evidence Model",
    "External signals remain `needs_review`"
  ]) {
    assert.equal(
      combined.includes(forbidden),
      false,
      `LearnPrompt source-repair docs must not revive forbidden boundary phrase: ${forbidden}`
    );
  }
}

function assertExternalSourceGapWorkbench() {
  const now = new Date("2026-06-30T12:00:00.000Z");
  const latest = normalizeLearnPromptLatestPayload(
    {
      generated_at: "2026-06-30T00:00:00.000Z",
      items_ai: [
        {
          ai_label: "model_release",
          ai_score: 0.98,
          ai_signals: ["openai", "release"],
          id: "lp-gap-1",
          published_at: "2026-06-30T01:00:00.000Z",
          site_id: "openai_news",
          site_name: "OpenAI News",
          source: "OpenAI News",
          source_tier: "official",
          source_tier_label: "官方一手源",
          source_tier_rank: 0,
          title: "OpenAI ships source gap test",
          url: "https://openai.com/news/source-gap-test"
        },
        {
          ai_label: "ai_general",
          ai_score: 0.99,
          ai_signals: ["research"],
          id: "lp-gap-2",
          published_at: "2026-06-30T01:00:00.000Z",
          site_id: "hf_blog",
          site_name: "Hugging Face Blog",
          source: "Hugging Face Blog",
          source_tier: "official",
          source_tier_label: "官方一手源",
          source_tier_rank: 0,
          title: "New transformer density note",
          url: "https://huggingface.co/blog/source-gap-test"
        },
        {
          ai_label: "ai_product_update",
          ai_score: 0.97,
          ai_signals: ["anthropic"],
          id: "lp-gap-3",
          published_at: "2026-06-30T01:00:00.000Z",
          site_id: "anthropic_news",
          site_name: "Anthropic News",
          source: "Anthropic News",
          source_tier: "official",
          source_tier_rank: 0,
          title: "Anthropic ships source gap test",
          url: "https://anthropic.com/news/source-gap-test"
        },
        {
          ai_label: "developer_tool",
          ai_score: 0.96,
          ai_signals: ["tooling"],
          id: "lp-gap-4",
          published_at: "2026-06-30T01:00:00.000Z",
          site_id: "known_source",
          site_name: "Known Source",
          source: "Known Source",
          source_tier: "official",
          source_tier_rank: 0,
          title: "Known source missed parser item",
          url: "https://known-alt.example.com/missed"
        },
        {
          ai_label: "industry_business",
          ai_score: 0.92,
          ai_signals: ["business"],
          id: "lp-gap-5",
          published_at: "2026-06-30T01:00:00.000Z",
          site_id: "low_trust",
          site_name: "Low Trust Aggregator",
          source: "Low Trust Aggregator",
          source_tier: "aggregator",
          source_tier_rank: 3,
          title: "Low trust watchlist item",
          url: "https://lowtrust.example.com/watch"
        }
      ]
    },
    now
  );
  const sourceStatus = normalizeLearnPromptSourceStatusPayload(
    {
      failed_sites: ["known_source"],
      generated_at: "2026-06-30T00:00:00.000Z",
      sites: [
        {
          item_count: 2,
          ok: true,
          site_id: "openai_news",
          site_name: "OpenAI News"
        },
        {
          error: "parser timeout",
          item_count: 0,
          ok: false,
          site_id: "known_source",
          site_name: "Known Source"
        },
        {
          item_count: 0,
          ok: true,
          site_id: "low_trust",
          site_name: "Low Trust Aggregator"
        }
      ],
      successful_sites: 2,
      zero_item_sites: ["low_trust"]
    },
    now
  );
  const workbench = buildExternalSourceGapWorkbench({
    latest,
    localIngestionRun: {
      cache_stats: {
        bypasses: 0,
        errors: 0,
        hits: 0,
        misses: 1,
        writes: 0
      },
      duplicate_count: 0,
      duration_ms: 100,
      ended_at: "2026-06-30T02:05:00.000Z",
      error_count: 1,
      id: "run-source-gap-smoke",
      item_count: 0,
      options: {
        limit: 10,
        max_items_per_source: 5,
        method: "rss",
        no_cache: true
      },
      output_files: {
        latest_raw_items: "data/ingestion/latest/raw-items.json",
        latest_run: "data/ingestion/latest/ingestion-run.json",
        run_raw_items: "data/ingestion/runs/run-source-gap-smoke.raw-items.json",
        run_summary: "data/ingestion/runs/run-source-gap-smoke.ingestion-run.json"
      },
      raw_item_count: 0,
      selected_source_count: 1,
      skipped_count: 0,
      source_results: [
        {
          crawl_method: "rss",
          duration_ms: 100,
          error_message: "parser timeout",
          item_count: 0,
          source_id: "known-source",
          source_name: "Known Source",
          status: "failed",
          warnings: []
        }
      ],
      started_at: "2026-06-30T02:00:00.000Z",
      status: "partial",
      warnings: ["Known Source parser timed out."]
    },
    now,
    snapshot: {
      generated_at: "2026-06-30T02:00:00.000Z",
      radar_items: [
        {
          source_name: "OpenAI News",
          title: "Different OpenAI item",
          url: "https://openai.com/news/different"
        },
        {
          source_name: "Known Source",
          title: "Known source existing item",
          url: "https://known.example.com/existing"
        }
      ],
      reports: [
        { id: "reviewed-report", mode: "saved_report", status: "reviewed" },
        { id: "approved-candidate", mode: "saved_candidate", status: "approved" }
      ]
    },
    sourceRegistry: [
      {
        category: "official_blog",
        crawl_method: "rss",
        created_at: "2026-06-01T00:00:00.000Z",
        description: "Known test source.",
        github_url: null,
        id: "known-source",
        language: "en",
        name: "Known Source",
        name_en: "Known Source",
        notes: "",
        podcast_url: null,
        region: "global",
        risk_flags: [],
        rss_url: "https://known.example.com/feed.xml",
        source_origin: "official-ai-sources.json",
        status: "active",
        tags: ["known"],
        tier: "T1",
        type: "official_blog",
        update_frequency: "daily",
        updated_at: "2026-06-29T00:00:00.000Z",
        url: "https://known.example.com",
        weight: 1,
        x_handle: null,
        youtube_url: null
      }
    ],
    sourceStatus
  });

  assert.equal(workbench.staleBlocked, false);
  assert.equal(workbench.baselineBlocked, false);
  assert.equal(workbench.candidates.length, 5);
  assert.equal(workbench.candidates.some((candidate) => Object.hasOwn(candidate, "mappedItem")), false);
  assert.equal(workbench.candidates[0].reviewStatus, "external_unreviewed");
  assert.equal(workbench.candidates[0].usage, "source_repair_only");
  assert.equal(workbench.actionCounts.add_source, 2);
  assert.equal(workbench.actionCounts.dedupe_rule_gap, 1);
  assert.equal(workbench.actionCounts.entity_extraction_gap, 0);
  assert.equal(workbench.actionCounts.ignore_low_trust, 1);
  assert.equal(workbench.actionCounts.repair_existing_source, 1);
  assert.equal(workbench.aiRadar.reportCount, 1);
  assert.equal(workbench.readinessCounts.registryMatches, 1);
  assert.equal(workbench.readinessCounts.localFailures, 1);
  assert.equal(workbench.readinessCounts.upstreamFailures, 2);
  assert.equal(workbench.readinessCounts.decisionPreviews, 5);

  const knownCandidate = workbench.candidates.find((candidate) => candidate.externalId === "lp-gap-4");
  assert.equal(knownCandidate?.registryMatch.sourceId, "known-source");
  assert.equal(knownCandidate?.localIngestionHealth.status, "failed");
  assert.equal(knownCandidate?.upstreamHealth.status, "failed");
  assert.equal(knownCandidate?.decisionPreview.kind, "review_task");

  const addCandidate = workbench.candidates.find((candidate) => candidate.externalId === "lp-gap-3");
  assert.equal(addCandidate?.decisionPreview.kind, "source_change_request");
  assert.equal(addCandidate?.decisionPreview.requestType, "trial");

  const unknownBroadCandidate = workbench.candidates.find((candidate) => candidate.externalId === "lp-gap-2");
  assert.equal(unknownBroadCandidate?.action, "add_source");
  assert.equal(unknownBroadCandidate?.decisionPreview.requestType, "trial");

  const baselineBlockedWorkbench = buildExternalSourceGapWorkbench({
    latest,
    now,
    snapshot: {},
    snapshotAvailable: false,
    sourceStatus
  });
  assert.equal(baselineBlockedWorkbench.baselineBlocked, true);
  assert.equal(baselineBlockedWorkbench.candidates.length, 0);

  const staleWorkbench = buildExternalSourceGapWorkbench({
    latest: normalizeLearnPromptLatestPayload(
      {
        generated_at: "2026-06-28T00:00:00.000Z",
        items_ai: [
          {
            ai_score: 1,
            id: "stale-gap",
            source: "OpenAI News",
            title: "Stale gap",
            url: "https://openai.com/news/stale-gap"
          }
        ]
      },
      now
    ),
    now,
    snapshot: { radar_items: [] },
    sourceStatus
  });
  assert.equal(staleWorkbench.staleBlocked, true);
  assert.equal(staleWorkbench.candidates.length, 0);
}

function mockReport(overrides: Partial<ReportWorkflowDocument>): ReportWorkflowDocument {
  const base: ReportWorkflowDocument = {
    audience: "operator",
    category_count: 1,
    caveats: [],
    citation_count: 1,
    citations: [
      {
        collected_at: "2026-06-29T00:00:00.000Z",
        confidence: 0.9,
        id: "citation-smoke",
        source_name: "Source",
        status: "included",
        title: "Source evidence",
        url: "https://example.com/evidence"
      }
    ],
    data_source: "mock_data",
    distinct_source_count: 1,
    executive_summary: "Evidence-backed summary.",
    generated_at: "2026-06-29T00:00:00.000Z",
    id: "report-smoke",
    language: "en",
    markdown: "# Evidence report",
    missing_evidence: [],
    mode: "saved_candidate",
    model_metadata: {
      api_call_count: 0,
      mode: "saved_candidate",
      provider: "deterministic"
    },
    one_sentence_summary: "One sentence summary.",
    quality_gate: {
      category_count: 1,
      category_gate_applicable: true,
      citation_count: 1,
      distinct_source_count: 1,
      passed: true,
      reasons: [],
      report_type: "daily",
      thresholds: {
        categories: 1,
        citations: 1,
        distinct_sources: 1,
        usable_items: 1
      },
      usable_item_count: 1
    },
    quality_gate_passed: true,
    quality_gate_reasons: [],
    read_source: "public_snapshot",
    report_type: "daily",
    retrieved_item_count: 1,
    saved_at: "2026-06-29T00:00:00.000Z",
    sections: [],
    source_item_ids: ["item-smoke"],
    status: "needs_review",
    time_window: {
      end: "2026-06-29T00:00:00.000Z",
      explanation: "Smoke-test report window.",
      start: "2026-06-28T00:00:00.000Z"
    },
    title: "Evidence report",
    usable_item_count: 1
  };
  const report = { ...base, ...overrides };

  return {
    ...report,
    model_metadata: {
      ...base.model_metadata,
      ...overrides.model_metadata,
      mode: report.mode
    }
  };
}

function readSource(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

function trackedFiles() {
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return `${tracked}\n${untracked}`
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => fs.existsSync(path.join(process.cwd(), file)));
}

function isClientModule(text: string) {
  const firstStatement = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("//"));

  return firstStatement === "\"use client\";" || firstStatement === "'use client';";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
