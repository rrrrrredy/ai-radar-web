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
import { isPublicInternetHttpUrl, publicInternetHttpUrl } from "@/lib/public-url";
import { isExternalSourceRepairSignal } from "@/lib/radar/public-source-boundary";

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
  assertPublicReaderSurfaces();
  assertStaticEntityParityAndPublicSnapshotContract();
  assertLearnPromptAdapter();
  assertLearnPromptBoundaryLanguage();
  assertExternalSourceGapWorkbench();

  const { entityCandidatesForItem, matchesEntityCandidate } = await import("@/lib/radar/entities");

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

  console.log("Smoke test passed: event-aware Ask, radar, source, and public snapshot paths remain guarded.");
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
  for (const file of ["app/page.tsx", "app/radar/page.tsx"]) {
    const source = readSource(file);
    assert.equal(
      source.includes("@/lib/data-completeness/public-summary") ||
        source.includes("loadPublicDataCompletenessSummary") ||
        source.includes("@/lib/supabase/service"),
      false,
      `${file} must use public-safe coverage and must not import service-role coverage helpers.`
    );
  }

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

}

function assertAssistantFeaturesPresent() {
  const requiredPaths = [
    "app/ask/page.tsx",
    "app/api/ask/route.ts",
    "components/ask-radar-client.tsx",
    "components/evidence-coverage-strip.tsx",
    "components/evidence-rail.tsx",
    "components/answer-section.tsx",
    "lib/qa/answer.ts",
    "lib/qa/mock-answer.ts",
    "lib/qa/prompts.ts",
    "lib/qa/types.ts",
    "lib/qa/validate.ts"
  ];

  for (const file of requiredPaths) {
    assert.equal(fs.existsSync(path.join(process.cwd(), file)), true, `${file} must exist.`);
  }

  const nav = readSource("components/nav.tsx");
  assert.equal(nav.includes('href: "/ask"') && !nav.includes('href: "/write"'), true, "Public navigation must expose Ask and omit Write.");

  const homepage = readSource("app/page.tsx");
  assert.equal(homepage.includes('href="/ask"') && !homepage.includes('href="/write"'), true, "Homepage must expose event-aware Ask and omit Write.");

  for (const retiredPath of [
    "app/write/page.tsx",
    "app/api/writing-assistant/route.ts",
    "components/write-radar-client.tsx"
  ]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), retiredPath)), false, `${retiredPath} must remain retired.`);
  }

  const askValidation = readSource("lib/qa/validate.ts");
  assert.equal(
    askValidation.includes('if (value === undefined || value === null || value === "")') && askValidation.includes('return "mock";'),
    true,
    "Ask must default to mock generation."
  );
  for (const route of ["app/api/ask/route.ts"]) {
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

  assert.equal(
    readSource("app/page.tsx").includes("读者判断摘要") &&
      readSource("app/page.tsx").includes("DecisionCard") &&
      readSource("app/page.tsx").includes("只展示公开证据字段"),
    true,
    "Homepage must provide reader-facing decision guidance without operational vocabulary."
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
      entitiesPage.includes("entityHref"),
    true,
    "Entities page must explain why an entity is worth tracking and link to its evidence path."
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

}

function assertPublicReaderSurfaces() {
  const cloudflareSite = readSource("scripts/build-cloudflare-public-site.ts");
  assert.equal(
      cloudflareSite.includes("function renderTopStories") &&
      cloudflareSite.includes("function selectHomepageEvents") &&
      cloudflareSite.includes("function renderStoryStream") &&
      cloudflareSite.includes("function readerReadyEvent") &&
      cloudflareSite.includes("function humanizeChineseHeadline") &&
      cloudflareSite.includes("今日热点") &&
      cloudflareSite.includes("TOP 10") &&
      cloudflareSite.includes("为什么值得看") &&
      cloudflareSite.includes("全部 AI 动态") &&
      cloudflareSite.includes('"来源"') &&
      !cloudflareSite.includes('"公众号"') &&
      cloudflareSite.includes("AI 行业信息雷达") &&
      cloudflareSite.includes("function renderSources") &&
      cloudflareSite.includes("function sourcePublishers") &&
      cloudflareSite.includes("function renderAbout") &&
      cloudflareSite.includes("language-switch") &&
      cloudflareSite.includes("mobile-nav") &&
      cloudflareSite.includes("model_release,benchmark") &&
      cloudflareSite.includes("product_update,agent,tooling") &&
      cloudflareSite.includes("business,regulation,policy,funding,infrastructure,safety") &&
      cloudflareSite.includes("data-feed-family") &&
      !cloudflareSite.includes("相关 AI 法律纠纷升级") &&
      !cloudflareSite.includes("发布研究进展") &&
      !cloudflareSite.includes("基准/评测更新") &&
      !cloudflareSite.includes("slice(0, 33)"),
    true,
    "Cloudflare static site must use the AI HOT-like Top 10 reader IA, source navigation, branded titles, and concrete untruncated headlines."
  );

  const understandingSummary = readSource("lib/understanding/summarize.ts");
  assert.equal(
    !understandingSummary.includes("`元数据级条目：") &&
      !understandingSummary.includes("`条目摘要：") &&
      understandingSummary.includes("Public information currently provides only the title") &&
      understandingSummary.includes("公开信息目前只提供"),
    true,
    "Understanding fallbacks must use public-facing language instead of ingestion-stage boilerplate."
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
      !cloudflareSite.includes("renderWrite") &&
      cloudflareSite.includes("renderPromptSuggestions") &&
      cloudflareSite.includes("localEvidenceToolScript") &&
      !cloudflareSite.includes("fs.writeFile(path.join(outputDir, \"entities\", \"index.html\")") &&
      !cloudflareSite.includes("fs.mkdir(path.join(outputDir, \"entities\")") &&
      cloudflareSite.includes("renderSources") &&
      cloudflareSite.includes("renderAbout") &&
      cloudflareSite.includes("function retiredRouteRedirects") &&
      cloudflareSite.includes("function retiredRouteWorker") &&
      cloudflareSite.includes("function retiredRouteWorkerRoutes") &&
      cloudflareSite.includes("/write/ /404.html 404") &&
      cloudflareSite.includes("/api/writing-assistant /404.html 404") &&
      cloudflareSite.includes('"/api/writing-assistant"') &&
      cloudflareSite.includes("/entities/* /404.html 404") &&
      cloudflareSite.includes("/reports/* /404.html 404") &&
      cloudflareSite.includes('"/write/*"') &&
      cloudflareSite.includes("env.ASSETS.fetch") &&
      cloudflareSite.includes("resolveBuildProvenance") &&
      cloudflareSite.includes('commitSource: "git_worktree"') &&
      cloudflareSite.includes("fs.writeFile(path.join(outputDir, \"version.json\")"),
    true,
    "Cloudflare static site must keep the local Ask utility, publish reader-facing sources/about pages, retire Write/entities/reports, and include a public version marker."
  );
  assert.equal(
    cloudflareSite.includes("timeWindowHours") &&
      cloudflareSite.includes("eventWithinIntentWindow") &&
      cloudflareSite.includes('intent.highPriority && event.event_score_label !== "高优先级"') &&
      cloudflareSite.includes("Lower-priority events were not substituted") &&
      cloudflareSite.includes("系统未用“关注”或“观察”事件替代") &&
      cloudflareSite.includes("function eventDate(event)") &&
      cloudflareSite.includes('[event.canonical_title || "", ...(event.related_entities || [])]') &&
      cloudflareSite.includes('data-feed-family="公司/实验室"') &&
      cloudflareSite.includes('data-feed-category="model_release,benchmark"') &&
      cloudflareSite.includes("function renderStoryRow") &&
      cloudflareSite.includes("function feedDateTime") &&
      cloudflareSite.includes('class="story-date"') &&
      cloudflareSite.includes('class="story-clock"') &&
      cloudflareSite.includes('locale === "en" ? "UTC" : "北京时间"') &&
      cloudflareSite.includes("function storyFilterScript"),
    true,
    "Cloudflare Ask must enforce evidence windows while the public radar uses source/topic reader filters and visible date-plus-time labels."
  );
  assert.equal(
    cloudflareSite.includes("Created by Song Luo") &&
      cloudflareSite.includes('href="https://github.com/rrrrrredy"') &&
      cloudflareSite.includes('target="_blank">GitHub</a>'),
    true,
    "The public reader footer must credit Song Luo and link the GitHub label to the creator profile."
  );

  const snapshotExporter = readSource("scripts/export-public-snapshot.ts");
  const eventClustering = readSource("lib/events/clustering.ts");
  const refreshWorkflow = readSource(".github/workflows/radar-refresh-cloudflare.yml");
  const clusterWorkflowStep = refreshWorkflow.match(
    /- name: Cluster, persist, and export the public snapshot[\s\S]*?(?=\n\s+- name: Render Cloudflare site)/
  )?.[0] ?? "";
  const supabasePublicContract = readSource("scripts/check-supabase-public-contract.ts");
  const supabaseLoader = readSource("lib/retrieval/load-supabase-radar-items.ts");
  const publicEntityMigration = readSource("supabase/migrations/202607010001_public_radar_items_entities.sql");
  const publicViewSecurityMigration = readSource(
    "supabase/migrations/20260715064603_harden_public_views_security_invoker.sql"
  );
  const privateGrantMigration = readSource(
    "supabase/migrations/20260715065603_revoke_private_table_api_grants.sql"
  );
  const wrongDomainGrantMigration = readSource(
    "supabase/migrations/20260716041758_revoke_wrong_domain_public_api_grants.sql"
  );
  assertPublicSnapshotSourceContract(snapshotExporter, supabaseLoader);
  assert.equal(
    eventClustering.includes("eventReferenceTime") &&
      eventClustering.includes("options.asOf") &&
      !eventClustering.includes("Date.now()"),
    true,
    "Event clustering and scoring must be deterministic for identical public evidence."
  );
  assert.equal(
    refreshWorkflow.includes('cron: "17 6 * * *"') &&
      refreshWorkflow.includes('cron: "17 7 * * *"') &&
      refreshWorkflow.includes('cron: "17 8 * * *"') &&
      (refreshWorkflow.match(/timezone: "Asia\/Shanghai"/g) || []).length === 3 &&
      refreshWorkflow.includes("workflow_dispatch:") &&
      refreshWorkflow.includes("production_already_fresh") &&
      refreshWorkflow.includes("Manual dispatch ignores a completed checkpoint") &&
      refreshWorkflow.includes('EVENT_NAME: ${{ github.event_name }}') &&
      refreshWorkflow.includes("needs: freshness_gate") &&
      refreshWorkflow.includes("HAS_CLOUDFLARE_API_TOKEN") &&
      refreshWorkflow.includes("Production configuration missing") &&
      refreshWorkflow.includes('"$DISPATCH_REF" != "refs/heads/main"') &&
      refreshWorkflow.includes('"$RADAR_REFRESH_WRITE_GATE" != "true"'),
    true,
    "The production workflow must use three Asia/Shanghai recovery windows, skip an already-fresh release, and gate writes to main."
  );
  assert.equal(
    refreshWorkflow.includes("npm run data:activate:resumable:live:persist") &&
      clusterWorkflowStep.includes("npm run events:cluster -- --persist") &&
      clusterWorkflowStep.includes('ENABLE_SUPABASE_RETRIEVAL: "true"') &&
      clusterWorkflowStep.includes('ENABLE_SUPABASE_WRITES: "true"') &&
      refreshWorkflow.includes('CLOUDFLARE_SNAPSHOT_REQUIRE_SUPABASE: "true"') &&
      refreshWorkflow.includes('CLOUDFLARE_SNAPSHOT_READ_SUPABASE: "true"') &&
      refreshWorkflow.includes("ENABLE_SUPABASE_WRITES=false npm run cloudflare:snapshot") &&
      refreshWorkflow.includes("npx tsx scripts/build-cloudflare-public-site.ts"),
    true,
    "The daily production workflow must live-refresh and persist before building from strict Supabase data with local fallback disabled."
  );
  assert.equal(
    refreshWorkflow.includes("npm exec -- wrangler pages deploy dist/cloudflare-pages") &&
      refreshWorkflow.includes("--project-name=ai-industry-radar") &&
      refreshWorkflow.includes("https://ai-industry-radar.pages.dev/") &&
      refreshWorkflow.indexOf("npm run test") > refreshWorkflow.indexOf("npx tsx scripts/build-cloudflare-public-site.ts") &&
      refreshWorkflow.indexOf("pages deploy dist/cloudflare-pages") > refreshWorkflow.indexOf("npm run test") &&
      refreshWorkflow.includes("remote.generated_at !== local.generated_at") &&
      refreshWorkflow.includes('remote.source?.kind !== "supabase_public_views"') &&
      refreshWorkflow.includes('remote.source?.data_source !== "public_evidence_store"') &&
      refreshWorkflow.includes('remote.source?.local_data_used !== false') &&
      refreshWorkflow.includes("remote.coverage?.latest_refresh !== local.coverage?.latest_refresh") &&
      refreshWorkflow.includes("production_snapshot_refresh_is_stale") &&
      refreshWorkflow.includes('class="top-story(?:\\s[^"]*)?"') &&
      refreshWorkflow.includes("production_home_datetime_mismatch") &&
      refreshWorkflow.includes("/sources/?verify=") &&
      refreshWorkflow.includes("production_reader_boilerplate_leak") &&
      refreshWorkflow.includes("production_home_source_diversity_missing") &&
      refreshWorkflow.includes("production_sources_contract_mismatch") &&
      refreshWorkflow.includes("Created by Song Luo") &&
      refreshWorkflow.includes('href="https://github.com/rrrrrredy"') &&
      refreshWorkflow.includes("production_home_hotspot_count_mismatch") &&
      refreshWorkflow.includes("production_reports_route_not_retired") &&
      refreshWorkflow.includes('Object.prototype.hasOwnProperty.call(remote, "reports")') &&
      refreshWorkflow.includes("<title>AI 行业信息雷达</title>") &&
      !/report:(candidate|generate)|generate[_-]reports|persist-report|npm run [^\n]*report/iu.test(refreshWorkflow),
    true,
    "The production workflow must validate the built artifact, deploy Cloudflare Pages, verify the public endpoint, and contain no report stage."
  );
  assertSupabasePublicContractCheckScript(supabasePublicContract);
  assertPublicRadarViewSqlContract(publicEntityMigration);
  assertPublicViewSecurityMigration(publicViewSecurityMigration, privateGrantMigration);
  assertWrongDomainGrantMigration(wrongDomainGrantMigration);

  const snapshotPath = "dist/cloudflare-pages/data/radar-snapshot.json";
  if (!fs.existsSync(path.join(process.cwd(), snapshotPath))) {
    assert.notEqual(
      process.env.SMOKE_REQUIRE_RELEASE_ARTIFACTS,
      "true",
      `${snapshotPath} must exist when release artifact validation is required.`
    );
    return;
  }

  assert.equal(fs.existsSync(path.join(process.cwd(), snapshotPath)), true, `${snapshotPath} must exist after the release build.`);
  assertPublicSnapshotJsonContract(snapshotPath);
  assert.equal(
    fs.existsSync(path.join(process.cwd(), "dist/cloudflare-pages/favicon.svg")),
    true,
    "Cloudflare static output must include its referenced favicon."
  );
  assert.equal(
    fs.existsSync(path.join(process.cwd(), "dist/cloudflare-pages/404.html")),
    true,
    "Cloudflare static output must include a real 404 page so unknown routes do not soft-200 the homepage."
  );
  assert.equal(
    fs.existsSync(path.join(process.cwd(), "dist/cloudflare-pages/_worker.js")),
    true,
    "Cloudflare static output must include a Pages worker that hard-404s retired legacy routes."
  );
  assert.equal(
    fs.existsSync(path.join(process.cwd(), "dist/cloudflare-pages/_routes.json")),
    true,
    "Cloudflare static output must scope its Pages worker to retired legacy routes only."
  );

  for (const pagePath of [
    "dist/cloudflare-pages/index.html",
    "dist/cloudflare-pages/radar/index.html",
    "dist/cloudflare-pages/sources/index.html",
    "dist/cloudflare-pages/about/index.html",
    "dist/cloudflare-pages/ask/index.html"
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
    assert.equal(page.toLowerCase().includes(".vercel.app"), false, `${pagePath} must not expose the private reference deployment namespace.`);
  }
  assertBilingualStaticContract();
  assertStaticCategoryFilterContract("dist/cloudflare-pages/radar/index.html");
  assertStaticCategoryLinkContract("dist/cloudflare-pages/index.html");
  assertPublicStaticArtifactsDoNotExposeInternalTerms(["dist/cloudflare-pages"]);

  const versionPath = path.join(process.cwd(), "dist/cloudflare-pages/version.json");
  assert.equal(fs.existsSync(versionPath), true, "Cloudflare version marker must exist.");
  const version = JSON.parse(fs.readFileSync(versionPath, "utf8")) as JsonRecord;
  assert.equal(version.product, "AI Industry Radar", "Cloudflare version marker must identify the correct product.");
  assert.match(String(version.commit_sha ?? ""), /^[0-9a-f]{40}$/i, "Cloudflare version marker must contain a full Git commit SHA.");
  assert.notEqual(version.commit_source, "unavailable", "Cloudflare version marker must identify its Git provenance source.");
  assert.equal(typeof version.working_tree_clean, "boolean", "Cloudflare version marker must disclose whether a local build used a clean worktree.");

  for (const forbiddenDir of ["dist/cloudflare-pages/clusters", "dist/github-pages"]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), forbiddenDir)), false, `${forbiddenDir} must not remain in static output.`);
  }
  for (const retiredPath of ["dist/cloudflare-pages/write", "dist/cloudflare-pages/en/write", "dist/cloudflare-pages/entities", "dist/cloudflare-pages/en/entities", "dist/cloudflare-pages/reports", "dist/cloudflare-pages/en/reports"]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), retiredPath)), false, `${retiredPath} must not exist in static output.`);
  }
}

function assertBilingualStaticContract() {
  const routePairs = [
    ["dist/cloudflare-pages/index.html", "dist/cloudflare-pages/en/index.html"],
    ["dist/cloudflare-pages/radar/index.html", "dist/cloudflare-pages/en/radar/index.html"],
    ["dist/cloudflare-pages/sources/index.html", "dist/cloudflare-pages/en/sources/index.html"],
    ["dist/cloudflare-pages/about/index.html", "dist/cloudflare-pages/en/about/index.html"],
    ["dist/cloudflare-pages/ask/index.html", "dist/cloudflare-pages/en/ask/index.html"]
  ] as const;

  for (const [chinesePath, englishPath] of routePairs) {
    assert.equal(fs.existsSync(path.join(process.cwd(), chinesePath)), true, `${chinesePath} must exist.`);
    assert.equal(fs.existsSync(path.join(process.cwd(), englishPath)), true, `${englishPath} must exist.`);
    const chinese = readSource(chinesePath);
    const english = readSource(englishPath);
    assert.equal(chinese.includes('class="language-switch"') && chinese.includes('lang="en"'), true, `${chinesePath} must expose the English switch.`);
    assert.equal(english.includes('<html lang="en">'), true, `${englishPath} must declare the English locale.`);
    assert.equal(english.includes('class="language-switch"') && english.includes('lang="zh-CN"'), true, `${englishPath} must expose the Chinese switch.`);
    assert.equal(chinese.includes('>报告<') || chinese.includes('>数据状态<'), false, `${chinesePath} must not expose retired report or data-status navigation.`);
    assert.match(chinese, /<title>(?:AI 行业信息雷达|[^<]+ - AI 行业信息雷达)<\/title>/, `${chinesePath} must use the public browser-title brand.`);
    assert.match(english, /<title>(?:AI 行业信息雷达|[^<]+ - AI 行业信息雷达)<\/title>/, `${englishPath} must use the same public browser-title brand.`);
  }

  const chineseHome = readSource("dist/cloudflare-pages/index.html");
  const englishHome = readSource("dist/cloudflare-pages/en/index.html");
  const readerBoilerplate = /(?:条目摘要|元数据级条目)\s*[：:]|\b(?:Metadata-level item|Item summary|Evidence text|Announce Type|Phase 4)\b|\barXiv:\d{4}\.\d+(?:v\d+)?\b|\bAbstract\s*:/iu;
  for (const [page, label] of [[chineseHome, "Chinese"], [englishHome, "English"]] as const) {
    assert.equal((page.match(/class="top-story story-row"/g) ?? []).length, 10, `${label} homepage must expose exactly ten hot topics.`);
    assert.equal(page.includes("hot-copy") && page.includes("hot-judgment") && page.includes("TOP 10"), true, `${label} Top 10 must include summaries and reader judgment.`);
    assert.equal(page.includes('class="story-stream"'), true, `${label} homepage must continue into the latest-update stream.`);
    assert.match(page, /<time datetime="[^"]+" title="[^"]+">[^<]+ · \d{2}:\d{2}<\/time>/, `${label} hot topics must show a visible date and time.`);
    assert.match(page, /<time datetime="[^"]+" title="[^"]+"><span class="story-date">[^<]+<\/span><span class="story-clock">\d{2}:\d{2}<\/span><\/time>/, `${label} latest updates must show separate visible date and time labels.`);
  }
  assert.equal(chineseHome.includes("为什么值得看"), true, "Chinese homepage must explain why every hot topic matters.");
  assert.equal(englishHome.includes("Why it matters"), true, "English homepage must explain why every hot topic matters.");
  assert.equal(chineseHome.includes("<title>AI 行业信息雷达</title>"), true, "Chinese homepage browser title must exactly match the requested product brand.");
  const chineseTopTitles = Array.from(
    chineseHome.matchAll(/class="hot-copy"[\s\S]*?<h2><a[^>]*>([^<]+)<\/a><\/h2>/g),
    (match) => match[1]
  ).slice(0, 10);
  const chineseTopTags = Array.from(chineseHome.matchAll(/<article class="top-story story-row"[^>]*>/g), (match) => match[0]);
  assert.equal(chineseTopTitles.length, 10, "Chinese homepage must expose ten inspectable hot-topic titles.");
  assert.equal(chineseTopTags.some((tag) => /data-source-count="(?:same|cross)"/.test(tag)), true, "Chinese Top 10 must include at least one corroborated multi-source event when the snapshot provides one.");
  for (const title of chineseTopTitles) {
    assert.match(title, /[\u3400-\u9fff]/u, `Chinese hot-topic title must be written for Chinese readers: ${title}`);
    assert.doesNotMatch(title, /(?:…|\.{3})$/, `Hot-topic title must not be pre-truncated: ${title}`);
    assert.doesNotMatch(title, /相关 AI 法律纠纷升级|发布研究进展|基准\/评测更新/, `Hot-topic title must describe the actual event: ${title}`);
    assert.doesNotMatch(title, /\b(?:openai|anthropic|xai|nvidia|hugging face|apple|google|meta|deepseek)\b/, `Hot-topic title must preserve official brand casing: ${title}`);
  }

  const chineseRadar = readSource("dist/cloudflare-pages/radar/index.html");
  const englishRadar = readSource("dist/cloudflare-pages/en/radar/index.html");
  for (const [page, label] of [[chineseRadar, "Chinese"], [englishRadar, "English"]] as const) {
    assert.equal(page.includes('data-feed-family="公司/实验室"') && page.includes('data-feed-category="model_release,benchmark"'), true, `${label} all-updates page must expose source and topic filters.`);
    assert.equal(page.includes('class="radar-tabs"') || page.includes("Source health summary") || page.includes("信息源健康摘要"), false, `${label} all-updates page must not expose internal radar tabs or source-health dashboards.`);
  }

  const chineseSources = readSource("dist/cloudflare-pages/sources/index.html");
  const chineseAbout = readSource("dist/cloudflare-pages/about/index.html");
  assert.doesNotMatch(chineseHome, readerBoilerplate, "Chinese homepage must not expose ingestion or model-fallback boilerplate.");
  assert.doesNotMatch(chineseRadar, readerBoilerplate, "Chinese all-updates page must not expose ingestion or model-fallback boilerplate.");
  assert.doesNotMatch(chineseSources, readerBoilerplate, "Chinese Sources page must not expose ingestion or model-fallback boilerplate.");
  assert.equal(chineseSources.includes("<h1>来源</h1>") && chineseSources.includes("个公开来源") && chineseSources.includes("个来源抓取成功") && !chineseSources.includes("公众号") && chineseSources.includes("最近更新") && chineseSources.includes("publisher-index"), true, "Chinese Sources page must expose the complete public-source scale and latest refresh coverage.");
  assert.equal(chineseAbout.includes("我们怎么选") && chineseAbout.includes("内容边界"), true, "Chinese About page must explain selection and editorial boundaries.");

  const englishAsk = readSource("dist/cloudflare-pages/en/ask/index.html");
  assert.equal(englishAsk.includes("Ask the radar") && englishAsk.includes("Radar results") && englishAsk.includes("../../data/radar-snapshot.json"), true, "English Ask must query the public event snapshot locally.");
  const publicStyles = readSource("dist/cloudflare-pages/assets/styles.css");
  assert.equal(publicStyles.includes(":focus-visible") && publicStyles.includes("outline: 3px solid"), true, "Static public controls and links must expose a visible keyboard focus state.");
}


function assertStaticCategoryFilterContract(pagePath: string) {
  assert.equal(fs.existsSync(path.join(process.cwd(), pagePath)), true, `${pagePath} must exist after the release build.`);
  const page = readSource(pagePath);
  assert.equal(page.includes('data-feed-category="model_release,benchmark"'), true, `${pagePath} must expose the model topic group.`);
  assert.equal(page.includes('data-feed-category="open_source"'), true, `${pagePath} must expose the open-source topic group.`);
  assert.equal(page.includes('data-feed-category="product_update,agent,tooling"'), true, `${pagePath} must expose the product topic group.`);
  assert.equal(page.includes('data-feed-family="公司/实验室"') && page.includes('data-feed-family="分析/媒体,其他公开来源"'), true, `${pagePath} must expose first-party and media source filters.`);
  assert.equal(page.includes('data-category="') && page.includes('data-family="') && page.includes("familyButtons") && page.includes("matchesFamily"), true, `${pagePath} must apply topic and source filters to story rows.`);
  assert.equal(page.includes('data-tab-panel="curated"') || page.includes('id="radar-status"'), false, `${pagePath} must not expose internal radar tabs or status controls.`);
}

function assertStaticCategoryLinkContract(pagePath: string) {
  assert.equal(fs.existsSync(path.join(process.cwd(), pagePath)), true, `${pagePath} must exist after the release build.`);
  const page = readSource(pagePath);
  assert.equal((page.match(/class="top-story story-row"/g) ?? []).length, 10, `${pagePath} must expose exactly ten hot topics.`);
  assert.equal(page.includes('data-feed-category="all"') && page.includes('data-feed-category="model_release,benchmark"') && page.includes('data-feed-category="product_update,agent,tooling"') && page.includes('data-feed-category="research"') && page.includes('data-feed-category="open_source"'), true, `${pagePath} must expose compact reader category controls.`);
  assert.equal(page.includes('class="story-stream"') && page.includes('href="radar/?tab=events"'), true, `${pagePath} must render the latest-update stream and route readers to all updates.`);
  assert.equal(page.includes("hot-copy") && page.includes("hot-judgment") && page.includes("为什么值得看"), true, `${pagePath} must show a summary and reader judgment for each hot topic.`);
  assert.equal(page.includes("category=all") || page.includes("category=%E6"), false, `${pagePath} must not encode localized or synthetic category query values.`);
}

function assertSupabasePublicContractCheckScript(source: string) {
  const wrongDomainTables = [
    "radar_models",
    "radar_model_versions",
    "radar_external_metrics",
    "radar_deepseek_metrics",
    "radar_source_gated_signals",
    "radar_pulse_snapshots",
    "radar_leaderboard_snapshots",
    "radar_admin_review_items",
    "radar_audit_events",
    "radar_refresh_runs",
    "radar_companies",
    "radar_deferred_surfaces"
  ];

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
  for (const table of wrongDomainTables) {
    assert.equal(
      source.includes(`"${table}"`),
      true,
      `Remote Supabase public contract check must reject anonymous reads from ${table}.`
    );
  }
  assert.equal(
    source.includes("wrongDomainTablesRejected") && source.includes("wrongDomainChecks.every"),
    true,
    "Remote Supabase public contract check must fail unless every wrong-domain table rejects anonymous reads."
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
  assert.equal(
      snapshotExporter.includes('CLOUDFLARE_SNAPSHOT_REQUIRE_SUPABASE') &&
      snapshotExporter.includes('assertStrictProductionSnapshot(snapshot)') &&
      snapshotExporter.includes('snapshot.source.kind !== "supabase_public_views"') &&
      snapshotExporter.includes('snapshot.source.data_source !== "public_evidence_store"') &&
      snapshotExporter.includes('snapshot.source.local_data_used') &&
      snapshotExporter.includes('CLOUDFLARE_SNAPSHOT_MAX_REFRESH_AGE_HOURS') &&
      snapshotExporter.includes('CLOUDFLARE_SNAPSHOT_REFRESH_NOT_BEFORE') &&
      snapshotExporter.includes('refreshAgeHours > maxRefreshAgeHours') &&
      snapshotExporter.includes('latestRefreshTime < refreshNotBeforeTime') &&
      snapshotExporter.includes('completeness.fetched_sources < 1') &&
      snapshotExporter.includes('snapshot.source_health_summary.succeeded < 1') &&
      snapshotExporter.includes('recentFailureRate > maxSourceFailureRate') &&
      snapshotExporter.includes('CLOUDFLARE_SNAPSHOT_EXPECTED_ATTEMPTED_SOURCES'),
    true,
    "Production Cloudflare snapshot export must fail closed when authoritative Supabase public data is unavailable."
  );
  assert.equal(
    snapshotExporter.includes('CLOUDFLARE_SNAPSHOT_MAX_AGE_HOURS') &&
      snapshotExporter.includes("publicItemCount < minPublicItems") &&
      snapshotExporter.includes("snapshot.event_count < 1") &&
      snapshotExporter.includes('snapshot.freshness.latest_timestamp_source !== "published_at"') &&
      snapshotExporter.includes("ageHours > maxAgeHours"),
    true,
    "Production Cloudflare snapshot export must enforce complete event data, minimum public rows, and publication freshness."
  );
  assert.equal(
    snapshotExporter.includes("completeness.sources_total < 1") &&
      snapshotExporter.includes("completeness.automated_eligible_sources < 1") &&
      snapshotExporter.includes("snapshot.source_health_scope.attempted_sources < 1") &&
      snapshotExporter.includes("broadHealthAttempted !== snapshot.source_health_scope.attempted_sources") &&
      snapshotExporter.includes("!broadHealthFullyAccounted"),
    true,
    "Production Cloudflare export must reject partial completeness and source-health summaries."
  );
  assert.equal(
    supabaseLoader.includes('{ count: "exact" }') &&
      supabaseLoader.includes('.order("id", { ascending: false })') &&
      supabaseLoader.includes(".range(offset, offset + retrievalPageSize - 1)") &&
      supabaseLoader.includes("validateCompleteSupabaseRadarRows(rows, expectedCount)"),
    true,
    "Authoritative Supabase reads must use exact-count stable pagination and completeness validation."
  );

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
  assert.notEqual(selectIndex, -1, `Expected select list for ${tableName}.`);
  const selectCall = source.slice(selectIndex, selectIndex + 160);
  const variable = selectCall.match(/^\.select\(\s*([A-Za-z_$][\w$]*)/u)?.[1];
  const listStart = variable ? source.indexOf(`const ${variable} = [`) : selectIndex;
  const joinIndex = source.indexOf("].join", listStart);
  assert.notEqual(listStart, -1, `Expected select-list declaration for ${tableName}.`);
  assert.notEqual(joinIndex, -1, `Expected array join select list for ${tableName}.`);

  const selectSource = source.slice(listStart, joinIndex);
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
    "evidence_notes",
    "reference_app_url"
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
  assert.equal(JSON.stringify(parsed).toLowerCase().includes(".vercel.app"), false, `${snapshotPath} must not expose a reference deployment namespace.`);

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
  const counts = snapshot.counts;
  assert.equal(isRecord(counts), true, `${snapshotPath}.counts must be an object.`);
  assert.equal(
    (counts as JsonRecord).public_radar_items,
    publicRadarItems.length,
    `${snapshotPath} must preserve every public-safe radar row for All signals.`
  );
  const completeness = snapshot.data_completeness_summary;
  const sourceHealthScope = snapshot.source_health_scope;
  const sourceHealth = snapshot.source_health_summary;
  assert.equal(isRecord(completeness), true, `${snapshotPath}.data_completeness_summary must be an object.`);
  assert.equal(isRecord(sourceHealthScope), true, `${snapshotPath}.source_health_scope must be an object.`);
  assert.equal(isRecord(sourceHealth), true, `${snapshotPath}.source_health_summary must be an object.`);
  assert.equal(Number((completeness as JsonRecord).sources_total) > 0, true, `${snapshotPath} must include authoritative source totals.`);
  assert.equal(Number((completeness as JsonRecord).automated_eligible_sources) > 0, true, `${snapshotPath} must include automated-eligible source totals.`);
  assert.equal((completeness as JsonRecord).public_radar_items, publicRadarItems.length, `${snapshotPath} completeness counts must match the public signal set.`);
  const broadAttempted = Number((sourceHealthScope as JsonRecord).attempted_sources);
  const familyHealth = Array.isArray(snapshot.source_health_by_family) ? snapshot.source_health_by_family : [];
  const familyAttempted = familyHealth.reduce(
    (total, row) => total + (isRecord(row) ? Number(row.attempted) : 0),
    0
  );
  const familyOutcomesAccounted = familyHealth.every((row) => {
    if (!isRecord(row)) return false;
    const remaining = Number(row.attempted) - Number(row.succeeded) - Number(row.failed);
    return remaining >= 0 && remaining <= Number(row.no_items) + Number(row.skipped);
  });
  assert.equal(
    broadAttempted > 0 && familyAttempted === broadAttempted && familyOutcomesAccounted,
    true,
    `${snapshotPath} must fully account for the audited broad source-health refresh.`
  );
  const entityAllowedKeys = new Set(["confidence", "name", "type"]);
  const sourceFamilyAllowedValues = new Set(["公司/实验室", "分析/媒体", "其他公开来源", "开源项目", "研究订阅"]);
  const entityKeyViolations: string[] = [];
  const entityShapeViolations: string[] = [];
  const corruptedIndustryTerms: string[] = [];

  publicRadarItems.forEach((item, itemIndex) => {
    assert.equal(isRecord(item), true, `${snapshotPath}.radar_items[${itemIndex}] must be an object.`);
    const radarItem = item as JsonRecord;
    assert.equal(
      sourceFamilyAllowedValues.has(String(radarItem.source_family ?? "")),
      true,
      `${snapshotPath}.radar_items[${itemIndex}].source_family must use the canonical public classifier.`
    );
    if (/\b(?:theverge\.com|arstechnica\.com|technologyreview\.com)\b/i.test(String(radarItem.url ?? ""))) {
      assert.equal(radarItem.source_family, "分析/媒体", `${snapshotPath}.radar_items[${itemIndex}] media domains must remain in the media family.`);
    }
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

  assert.equal(Object.hasOwn(snapshot, "reports"), false, `${snapshotPath} must not publish a reports field.`);
  assert.equal(Object.hasOwn(snapshot, "report_quality_summary"), false, `${snapshotPath} must not publish report quality metadata.`);
}

function assertPublicViewSecurityMigration(securitySql: string, privateGrantSql: string) {
  assert.equal(
    (securitySql.match(/with \(security_invoker = true\)/g) ?? []).length,
    3,
    "All three public Supabase views must run with caller privileges."
  );
  assert.equal(
    securitySql.includes("with (security_invoker = false)"),
    false,
    "Release security migrations must not recreate a security-definer public view."
  );
  assert.equal(
    /grant select\s*\([^)]*\b(metadata|model_metadata|evidence_notes|raw_item_id)\b/is.test(securitySql),
    false,
    "Anonymous base-table grants must exclude raw and private columns."
  );
  assert.equal(
    privateGrantSql.includes("revoke all on public.raw_items from public, anon, authenticated") &&
      privateGrantSql.includes("alter function public.radar_set_updated_at() set search_path = pg_catalog"),
    true,
    "Private Data API tables and trigger search paths must be explicitly hardened."
  );
}

function assertWrongDomainGrantMigration(sql: string) {
  const wrongDomainTables = [
    "radar_models",
    "radar_model_versions",
    "radar_external_metrics",
    "radar_deepseek_metrics",
    "radar_source_gated_signals",
    "radar_pulse_snapshots",
    "radar_leaderboard_snapshots",
    "radar_admin_review_items",
    "radar_audit_events",
    "radar_refresh_runs",
    "radar_companies",
    "radar_deferred_surfaces"
  ];

  for (const table of wrongDomainTables) {
    assert.equal(sql.includes(`'${table}'`), true, `Wrong-domain grant migration must cover ${table}.`);
  }
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all privileges on table public\.%I from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /\b(drop|truncate)\b|\bdelete\s+from\b/i);
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
    "Cloudflare static snapshot export",
    "Supabase public reads skipped",
    "Supabase public reads failed",
    "public_radar_items read failed",
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
