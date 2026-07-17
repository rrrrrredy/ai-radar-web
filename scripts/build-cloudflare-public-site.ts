import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { sourceFamilyForEvent } from "@/lib/events/clustering";
import {
  buildEntityEvidenceGraph,
  buildEntitySummaries,
  entityAverageConfidence,
  entityRouteId,
  entityTrackingInsight,
  type EntitySummary
} from "@/lib/radar/entity-insights";
import type { RetrievalRadarItem } from "@/lib/retrieval/types";
import {
  reportEntityTraceability,
  type ReportTraceDocument
} from "@/lib/reports/entity-traceability";
import type { UnderstandingEntity } from "@/lib/understanding/types";

type SnapshotItem = {
  id: string;
  title: string;
  url: string;
  source_name: string;
  source_family: string;
  status: "included" | "needs_review" | "excluded" | "failed";
  language: string;
  published_at?: string;
  collected_at: string;
  processed_at: string;
  summary_zh?: string;
  summary_en?: string;
  categories: string[];
  tags: string[];
  source_tier: string;
  confidence: number;
  scores: {
    ai_relevance: number;
    credibility: number;
    freshness: number;
    importance: number;
    novelty: number;
    overall: number;
  };
  why_it_matters?: string;
  entities: Array<Pick<UnderstandingEntity, "confidence" | "name" | "type">>;
};

type SnapshotReport = {
  id: string;
  report_type: "daily" | "weekly";
  mode: "saved_candidate" | "saved_report" | "local_preview";
  status: string;
  title: string;
  summary: string;
  executive_summary?: string;
  data_source: string;
  time_window: {
    start: string;
    end: string;
  };
  generated_at?: string;
  saved_at?: string;
  source_item_ids: string[];
  source_item_count: number;
  usable_item_count: number;
  citation_count: number;
  distinct_source_count: number;
  category_count: number;
  quality_gate_passed: boolean;
  quality_gate_reasons: string[];
  quality_gate?: {
    passed: boolean;
    reasons: string[];
  };
  confidence?: number;
  sections: Array<{
    title: string;
    summary: string;
    bullets: string[];
    citations: string[];
    caveats: string[];
  }>;
  citations: Array<{
    id: string;
    title: string;
    source_name: string;
    url: string;
    published_at?: string;
    collected_at?: string;
    status?: string;
    confidence?: number;
  }>;
  caveats: string[];
  missing_evidence: string[];
};

type SnapshotEvent = {
  event_cluster_id: string;
  canonical_title: string;
  summary_zh: string;
  category: string;
  event_score: number;
  event_score_label: "高优先级" | "关注" | "观察" | "噪音/低相关";
  score_reason: string;
  source_count: number;
  source_tier_max: string;
  source_families: string[];
  first_seen_at: string;
  latest_seen_at: string;
  related_item_ids: string[];
  related_entities: string[];
  timeline: Array<{
    item_id: string;
    title: string;
    source_name: string;
    timestamp: string;
    url: string;
  }>;
  citations: Array<{
    item_id: string;
    title: string;
    source_name: string;
    url: string;
    published_at?: string;
    collected_at: string;
  }>;
  caveats: string[];
};

type SnapshotTimelineEntry = SnapshotEvent["timeline"][number] & {
  event_cluster_id: string;
  event_title: string;
  event_score_label: SnapshotEvent["event_score_label"];
};

type Snapshot = {
  schema_version: 1;
  generated_at: string;
  public_site: {
    purpose: string;
    cloudflare_url: string;
    read_only: true;
  };
  source: {
    kind: string;
    data_source: string;
    local_data_used: boolean;
    warnings: string[];
  };
  freshness: {
    latest_timestamp: string | null;
    latest_timestamp_source: string | null;
    latest_ingestion: string | null;
    latest_understanding: string | null;
    note: string;
  };
  counts: {
    public_radar_items: number | null;
    visible_radar_items: number;
    snapshot_radar_items: number;
    included: number;
    needs_review: number;
    excluded: number;
    failed: number;
    report_candidates: number | null;
    report_snapshots: number;
    saved_report_candidates: number;
    citations: number;
    event_clusters: number;
  };
  coverage: {
    label: "public snapshot";
    sources_total: number;
    automated_eligible_sources: number;
    attempted_sources: number;
    fetched_sources: number;
    failed_sources: number;
    skipped_sources: number;
    sources_with_public_items: number | null;
    public_radar_items: number | null;
    latest_refresh: string | null;
    radar_to_public_visibility: number | null;
    source_public_visibility: number | null;
    failed_source_reasons: Record<string, number>;
    failure_families?: Record<string, number>;
    skipped_source_reasons: Record<string, number>;
  };
  top_categories: Array<{ label: string; count: number }>;
  top_sources: Array<{ label: string; count: number }>;
  top_source_tiers: Array<{ label: string; count: number }>;
  event_clusters: SnapshotEvent[];
  event_cluster_items: Array<{
    event_cluster_id: string;
    radar_item_id: string;
    role: "primary" | "supporting";
    source_name: string;
  }>;
  event_count: number;
  curated_events: SnapshotEvent[];
  timeline: SnapshotTimelineEntry[];
  source_health_summary: {
    succeeded: number;
    failed: number;
    timeout: number;
    "403": number;
    rate_limit: number;
    no_items: number;
    duplicate_only: number;
    manual_blocked: number;
    unsupported_source: number;
    low_relevance_excluded: number;
  };
  source_health_scope: {
    started_at: string | null;
    finished_at: string | null;
    attempted_sources: number;
  };
  source_health_by_family: Array<{
    family: string;
    configured: number;
    automated_eligible: number;
    attempted: number;
    skipped: number;
    succeeded: number;
    failed: number;
    timeout: number;
    "403": number;
    rate_limit: number;
    no_items: number;
    duplicate_only: number;
    manual_blocked: number;
    unsupported_source: number;
    low_relevance_excluded: number;
  }>;
  source_health_failures: Array<{
    source_slug: string;
    source_name: string;
    source_family: string;
    reason: string;
  }>;
  failure_family_summary: Record<string, number>;
  report_quality_summary: {
    daily: ReportQualitySummary | null;
    weekly: ReportQualitySummary | null;
  };
  data_completeness_summary: {
    sources_total: number;
    automated_eligible_sources: number;
    attempted_sources: number;
    fetched_sources: number;
    failed_sources: number;
    blocked_manual_sources: number;
    sources_with_public_items: number | null;
    public_radar_items: number | null;
    radar_to_public_visibility: number | null;
    source_public_visibility: number | null;
  };
  radar_items: SnapshotItem[];
  reports: SnapshotReport[];
  caveats: string[];
};

type ReportQualitySummary = {
  id: string;
  status: string;
  quality_gate_passed: boolean;
  usable_item_count: number;
  citation_count: number;
  distinct_source_count: number;
  category_count: number;
  quality_gate_reasons: string[];
  top_event_ids: string[];
  missing_evidence: string[];
  caveats: string[];
};

const outputDir = path.join(process.cwd(), "dist", "cloudflare-pages");
const snapshotPath = path.join(outputDir, "data", "radar-snapshot.json");

async function main() {
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8")) as Snapshot;
  await fs.rm(path.join(process.cwd(), "dist", "github-pages"), { force: true, recursive: true });
  await writeSite(snapshot);
  console.log(
    [
      "Cloudflare public site built:",
      path.relative(process.cwd(), outputDir),
      `publicRows=${snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items}`,
      `snapshotRows=${snapshot.counts.snapshot_radar_items}`,
      `reports=${snapshot.counts.report_snapshots}`
    ].join(" ")
  );
}

async function writeSite(snapshot: Snapshot) {
  await fs.rm(path.join(outputDir, "clusters"), { force: true, recursive: true });
  await fs.rm(path.join(outputDir, "en"), { force: true, recursive: true });
  await fs.rm(path.join(outputDir, "entities"), { force: true, recursive: true });
  await fs.rm(path.join(outputDir, "ask"), { force: true, recursive: true });
  await fs.rm(path.join(outputDir, "write"), { force: true, recursive: true });
  await Promise.all([
    fs.mkdir(path.join(outputDir, "ask"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "assets"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "ask"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "radar"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "reports"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "radar"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "reports"), { recursive: true })
  ]);

  await Promise.all([
    fs.copyFile(path.join(process.cwd(), "app", "icon.svg"), path.join(outputDir, "favicon.svg")),
    fs.writeFile(path.join(outputDir, "ask", "index.html"), renderAsk(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "assets", "styles.css"), stylesheet(), "utf8"),
    fs.writeFile(path.join(outputDir, "404.html"), renderNotFound(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "ask", "index.html"), renderEnglishAsk(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "index.html"), renderEnglishHome(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "radar", "index.html"), renderEnglishRadar(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "reports", "index.html"), renderEnglishReports(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "index.html"), renderHome(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "radar", "index.html"), renderRadar(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "reports", "index.html"), renderReports(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "_redirects"), retiredRouteRedirects(), "utf8"),
    fs.writeFile(path.join(outputDir, "_routes.json"), retiredRouteWorkerRoutes(), "utf8"),
    fs.writeFile(path.join(outputDir, "_worker.js"), retiredRouteWorker(), "utf8"),
    fs.writeFile(path.join(outputDir, "version.json"), `${JSON.stringify(publicVersion(snapshot), null, 2)}\n`, "utf8")
  ]);
}

function retiredRouteRedirects() {
  return [
    "/write /404.html 404",
    "/write/ /404.html 404",
    "/en/write /404.html 404",
    "/en/write/ /404.html 404",
    "/entities /404.html 404",
    "/entities/ /404.html 404",
    "/entities/* /404.html 404",
    "/en/entities /404.html 404",
    "/en/entities/ /404.html 404",
    "/en/entities/* /404.html 404",
    "/api/writing-assistant /404.html 404",
    "/api/writing-assistant/ /404.html 404"
  ].join("\n") + "\n";
}

function retiredRouteWorker() {
  return `const retiredPrefixes = ["/write", "/en/write", "/entities", "/en/entities", "/api/writing-assistant"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (retiredPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + "/"))) {
      return new Response("<!doctype html><meta charset=\\"utf-8\\"><title>404</title><h1>404</h1><p>This public route is not available.</p>", {
        headers: { "content-type": "text/html; charset=utf-8" },
        status: 404,
        statusText: "Not Found"
      });
    }

    return env.ASSETS.fetch(request);
  }
};
`;
}

function retiredRouteWorkerRoutes() {
  return `${JSON.stringify({
    version: 1,
    include: [
      "/write",
      "/write/*",
      "/en/write",
      "/en/write/*",
      "/entities",
      "/entities/*",
      "/en/entities",
      "/en/entities/*",
      "/api/writing-assistant",
      "/api/writing-assistant/*"
    ],
    exclude: []
  }, null, 2)}\n`;
}

function renderNotFound(snapshot: Snapshot) {
  return shell(snapshot, "home", 0, "页面不存在", `
    <section class="page-heading not-found">
      <div>
        <div class="pill-row">${pill("404", "caution")}${pill("公开只读站点", "neutral")}</div>
        <h1>没有找到这个页面</h1>
        <p class="lead">该路径不属于 AI 行业雷达公开站点。返回首页查看行业精选，或打开事件雷达继续检索。</p>
        <p class="note">This route is not part of the public AI Industry Radar site.</p>
        <div class="actions"><a class="button primary" href="/">返回首页</a><a class="button" href="/radar/">打开事件雷达</a></div>
      </div>
    </section>
  `);
}

function eventPrimaryUrl(event: SnapshotEvent) {
  return event.citations[0]?.url ?? event.timeline[0]?.url ?? "#";
}

function eventSources(event: SnapshotEvent, limit = 2) {
  return uniqueStrings(event.citations.map((citation) => citation.source_name)).slice(0, limit);
}

function eventFeed(snapshot: Snapshot) {
  const preferred = [...snapshot.curated_events, ...snapshot.event_clusters];
  const seen = new Set<string>();
  return preferred
    .filter((event) => {
      if (seen.has(event.event_cluster_id) || event.event_score_label === "噪音/低相关") return false;
      seen.add(event.event_cluster_id);
      return true;
    })
    .toSorted((left, right) => {
      const time = Date.parse(right.latest_seen_at) - Date.parse(left.latest_seen_at);
      return time || right.event_score - left.event_score;
    });
}

function readerReadyEvent(event: SnapshotEvent) {
  const summary = chineseEventSummary(event);
  return summary.length >= 18 && !/(未提供具体内容|未提供正文|没有正文|内容未提供|仅提供元数据|文章标题指出|这是一篇(?:来自)?|标题为《)/u.test(summary);
}

function readerReadyEventForLocale(event: SnapshotEvent, snapshot: Snapshot, locale: "en" | "zh") {
  if (locale === "zh") return readerReadyEvent(event);
  const summary = eventEnglishSummary(event, snapshot);
  return summary.length >= 30 && !/(only metadata|no body text|metadata only|content was not provided|title alone)/iu.test(summary);
}

function eventsByLatest(events: SnapshotEvent[]) {
  return events.toSorted((left, right) =>
    Date.parse(right.latest_seen_at) - Date.parse(left.latest_seen_at) ||
    right.event_score - left.event_score ||
    left.canonical_title.localeCompare(right.canonical_title)
  );
}

function feedTime(value: string, locale: "en" | "zh") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: locale === "en" ? "UTC" : "Asia/Shanghai"
  }).format(date);
}

function feedDayKey(value: string, locale: "en" | "zh") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: locale === "en" ? "UTC" : "Asia/Shanghai", year: "numeric" }).format(date);
}

function feedDayLabel(value: string, locale: "en" | "zh") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    day: "numeric",
    month: locale === "en" ? "short" : "long",
    timeZone: locale === "en" ? "UTC" : "Asia/Shanghai",
    weekday: "short"
  }).format(date);
}

function storyDataAttributes(event: SnapshotEvent, snapshot: Snapshot, title: string, summary: string) {
  return `data-category="${escapeAttr(`${event.category} ${categoryFilterValue(event.category)}`)}" data-family="${escapeAttr(event.source_families.join(" "))}" data-freshness="${freshnessBucket(event.latest_seen_at)}" data-score="${escapeAttr(event.event_score_label)}" data-search="${escapeAttr(`${title} ${summary} ${eventSources(event, 8).join(" ")} ${event.related_entities.join(" ")}`.toLowerCase())}" data-source-count="${eventConfirmationFilterValue(event)}" data-status="${escapeAttr(eventStatus(event, snapshot))}"`;
}

function renderStorySources(event: SnapshotEvent, locale: "en" | "zh") {
  return `<details class="source-drawer"><summary>${locale === "en" ? "Sources & timeline" : "来源与时间线"}</summary><div class="source-drawer-list">${event.citations.map((citation) => `<a href="${escapeAttr(citation.url)}"><span>${escapeHtml(citation.source_name)}</span><strong>${escapeHtml(citation.title)}</strong><time>${escapeHtml(locale === "en" ? formatDateEn(citation.published_at) : formatDate(citation.published_at))}</time></a>`).join("")}</div></details>`;
}

function renderScoreReason(event: SnapshotEvent, locale: "en" | "zh") {
  const familyCount = event.source_families.length;
  const reason = locale === "en"
    ? `The score combines recency, AI relevance and importance with ${event.source_count} report${event.source_count === 1 ? "" : "s"} across ${familyCount} source type${familyCount === 1 ? "" : "s"}.`
    : event.score_reason;
  return `<details class="score-drawer"><summary>${locale === "en" ? "Why this score" : "评分依据"}</summary><p>${escapeHtml(reason)}</p></details>`;
}

function renderStoryRow(event: SnapshotEvent, snapshot: Snapshot, locale: "en" | "zh") {
  const title = locale === "en" ? eventEnglishTitle(event, snapshot) : chineseEventTitle(event);
  const summary = locale === "en" ? eventEnglishSummary(event, snapshot) : chineseEventSummary(event);
  const sources = eventSources(event).join(" · ") || (locale === "en" ? "Public source" : "公开来源");
  const sourceCount = locale === "en" ? `${event.source_count} source${event.source_count === 1 ? "" : "s"}` : `${event.source_count} 个来源`;
  const category = locale === "en" ? categoryLabelEn(event.category) : labelize(event.category);
  const score = locale === "en" ? eventScoreLabelEn(event.event_score_label) : event.event_score_label;
  return `<article class="event-card story-row" ${storyDataAttributes(event, snapshot, title, summary)}>
    <div class="story-time"><time>${escapeHtml(feedTime(event.latest_seen_at, locale))}</time><span></span></div>
    <div class="story-content">
      <div class="story-meta"><span>${escapeHtml(sources)}</span><strong>${escapeHtml(score)} · ${event.event_score}</strong></div>
      <h2><a href="${escapeAttr(eventPrimaryUrl(event))}">${escapeHtml(title)}</a></h2>
      ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
      <div class="story-foot"><span>${escapeHtml(category)}</span><span>${escapeHtml(sourceCount)}</span></div>
      ${renderScoreReason(event, locale)}
      ${renderStorySources(event, locale)}
    </div>
  </article>`;
}

function renderStoryStream(events: SnapshotEvent[], snapshot: Snapshot, locale: "en" | "zh") {
  let day = "";
  return events.map((event) => {
    const nextDay = feedDayKey(event.latest_seen_at, locale);
    const heading = nextDay === day ? "" : `<h2 class="feed-day"><span>${escapeHtml(feedDayLabel(event.latest_seen_at, locale))}</span></h2>`;
    day = nextDay;
    return `${heading}${renderStoryRow(event, snapshot, locale)}`;
  }).join("");
}

function renderTopStories(events: SnapshotEvent[], snapshot: Snapshot, locale: "en" | "zh") {
  return events.slice(0, 3).map((event, index) => {
    const title = locale === "en" ? eventEnglishTitle(event, snapshot) : chineseEventTitle(event);
    const sources = locale === "en" ? `${event.source_count} source${event.source_count === 1 ? "" : "s"}` : `${event.source_count} 个来源`;
    return `<a class="top-story" href="${escapeAttr(eventPrimaryUrl(event))}"><span>${index + 1}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(sources)}</small></a>`;
  }).join("");
}

function storyFilterScript() {
  return `(function(){
    const input=document.querySelector("#feed-search");
    const buttons=Array.from(document.querySelectorAll("[data-feed-category]"));
    const rows=Array.from(document.querySelectorAll(".story-row"));
    if(!input||buttons.length===0)return;
    let category="all";
    function apply(){
      const query=input.value.trim().toLowerCase();
      const values=category==="all"?[]:category.split(",");
      rows.forEach(row=>{const categoryText=(row.dataset.category||"").toLowerCase();const matchesCategory=values.length===0||values.some(value=>categoryText.includes(value));const matchesQuery=!query||(row.dataset.search||"").includes(query);row.hidden=!(matchesCategory&&matchesQuery);});
    }
    input.addEventListener("input",apply);
    buttons.forEach(button=>button.addEventListener("click",()=>{category=button.dataset.feedCategory||"all";buttons.forEach(candidate=>{const active=candidate===button;candidate.classList.toggle("active",active);candidate.setAttribute("aria-pressed",active?"true":"false");});apply();}));
    buttons.forEach((button,index)=>button.setAttribute("aria-pressed",index===0?"true":"false"));
  })();`;
}

function renderEnglishHome(snapshot: Snapshot) {
  const events = eventFeed(snapshot).filter((event) => readerReadyEventForLocale(event, snapshot, "en"));
  const topEvents = snapshot.curated_events.filter((event) => readerReadyEventForLocale(event, snapshot, "en")).toSorted(compareHomepageEvents).slice(0, 3);
  return englishShell(snapshot, "home", 0, "Selected", `
    <section class="feed-heading"><div><h1>Selected</h1><p>${escapeHtml(feedDayLabel(snapshot.freshness.latest_timestamp ?? snapshot.generated_at, "en"))}</p></div><a href="radar/?tab=events">${snapshot.event_count} events</a></section>
    <section class="top-stories"><div class="section-heading"><h2>Top stories</h2><span>TOP 3</span></div>${renderTopStories(topEvents, snapshot, "en")}</section>
    <section class="feed-toolbar"><div class="section-heading"><h2>Latest</h2><a href="radar/?tab=events">All events</a></div><div class="feed-search"><input id="feed-search" type="search" placeholder="Search headlines, summaries, sources..."></div><div class="feed-chips"><button class="active" data-feed-category="all" type="button">All</button><button data-feed-category="model_release,benchmark" type="button">Models</button><button data-feed-category="product_update,agent,tooling" type="button">Products</button><button data-feed-category="business,regulation,policy,funding,infrastructure,safety" type="button">Industry</button><button data-feed-category="research" type="button">Research</button><button data-feed-category="open_source" type="button">Open source</button></div></section>
    <section class="story-stream">${renderStoryStream(events.slice(0, 36), snapshot, "en")}</section>
    <div class="feed-more"><a class="button primary" href="radar/?tab=events">Browse all events</a></div>
    <script>${storyFilterScript()}</script>
  `);
}

function renderEnglishRadar(snapshot: Snapshot) {
  const families = uniqueStrings([
    ...Object.keys(countSourceFamilies(snapshot.radar_items)),
    ...snapshot.event_clusters.flatMap((event) => event.source_families)
  ]);
  const scoreLabels = uniqueStrings(snapshot.event_clusters.map((event) => event.event_score_label));
  const categories = uniqueStrings([
    ...snapshot.event_clusters.map((event) => categoryFilterValue(event.category)),
    ...snapshot.radar_items.flatMap((item) => item.categories.map(categoryFilterValue))
  ]).toSorted();
  const displaySignalItems = snapshot.radar_items;
  const reviewItemIds = new Set(
    snapshot.radar_items.filter((item) => item.status === "needs_review").map((item) => item.id)
  );
  const reviewEvents = snapshot.event_clusters.filter((event) =>
    event.related_item_ids.some((id) => reviewItemIds.has(id))
  );
  const events = eventFeed(snapshot).filter((event) => readerReadyEventForLocale(event, snapshot, "en"));

  return englishShell(snapshot, "radar", 1, "Radar", `
    <section class="feed-heading"><div><h1>Radar</h1><p>${escapeHtml(feedDayLabel(snapshot.freshness.latest_timestamp ?? snapshot.generated_at, "en"))}</p></div><span>${snapshot.event_count} events</span></section>
    <section class="radar-tabs">
      <div class="tabbar" role="tablist" aria-label="Radar views">
        ${tabButton("curated", "Selected", true)}
        ${tabButton("events", "All events")}
        ${tabButton("signals", "All signals")}
        ${tabButton("timeline", "Latest timeline")}
        ${tabButton("review", "Needs review")}
        ${tabButton("health", "Source health")}
      </div>
    </section>

    <section class="radar-filters" data-radar-filters>
      <div class="filter-mobile-toggle"><button aria-expanded="false" class="button" id="radar-filter-toggle" type="button">Filters</button></div>
      <div class="controls" role="search">
        <label class="search-control">Search <input id="radar-search" type="search" placeholder="Headline, brief, source" aria-label="Search titles, sources, categories and entities"></label>
        <label>Status <select id="radar-status">${optionRaw("all", "All statuses")}${["included", "needs_review", "excluded", "failed"].map((status) => optionRaw(status, statusLabelEn(status))).join("")}</select></label>
        <label>Category <select id="radar-category">${optionRaw("all", "All categories")}${categories.map((category) => optionRaw(category, categoryLabelEn(category))).join("")}</select></label>
        <label>Source type <select id="radar-family">${optionRaw("all", "All source types")}${families.map((family) => optionRaw(family, sourceFamilyLabelEn(family))).join("")}</select></label>
        <label>Score <select id="radar-score">${optionRaw("all", "All scores")}${scoreLabels.map((label) => optionRaw(label, eventScoreLabelEn(label))).join("")}</select></label>
        <label>Freshness <select id="radar-freshness">${optionRaw("all", "Any time")}${optionRaw("24h", "Within 24h")}${optionRaw("7d", "2-7 days")}${optionRaw("30d", "8-30 days")}${optionRaw("archive", "Archive (>30 days)")}${optionRaw("unknown", "Publication time unknown")}</select></label>
        <label>Reporting <select id="radar-source-count">${optionRaw("all", "Any reporting level")}${optionRaw("cross", "Reported by different source types")}${optionRaw("same", "Several reports of one type")}${optionRaw("single", "One report")}</select></label>
      </div>
      <div class="filter-feedback"><span aria-live="polite" id="radar-result-count"></span><button class="button" id="radar-reset" type="button">Reset filters</button></div>
    </section>
    <section aria-labelledby="radar-tab-curated" class="tab-panel active" data-tab-panel="curated" id="radar-panel-curated" role="tabpanel">
      <div class="story-stream">${renderStoryStream(eventsByLatest(snapshot.curated_events.filter((event) => readerReadyEventForLocale(event, snapshot, "en"))), snapshot, "en") || empty("No selected events are available.")}</div>
    </section>
    <section aria-labelledby="radar-tab-events" class="tab-panel" data-tab-panel="events" hidden id="radar-panel-events" role="tabpanel">
      <div class="story-stream">${renderStoryStream(events, snapshot, "en") || empty("No events are available.")}</div>
    </section>
    <section aria-labelledby="radar-tab-signals" class="tab-panel" data-tab-panel="signals" hidden id="radar-panel-signals" role="tabpanel">
      <div class="row-list radar-list" id="radar-list">${displaySignalItems.map(renderRadarItemEn).join("") || empty("No public radar signals are available.")}</div>
    </section>
    <section aria-labelledby="radar-tab-timeline" class="tab-panel" data-tab-panel="timeline" hidden id="radar-panel-timeline" role="tabpanel">
      <div class="timeline-list">${snapshot.timeline.map((entry) => renderTimelineEntryEn(entry, snapshot)).join("") || empty("No timeline entries are available.")}</div>
    </section>
    <section aria-labelledby="radar-tab-review" class="tab-panel" data-tab-panel="review" hidden id="radar-panel-review" role="tabpanel">
      <div class="story-stream">${renderStoryStream(reviewEvents, snapshot, "en") || empty("No events currently require review.")}</div>
    </section>
    <section aria-labelledby="radar-tab-health" class="tab-panel" data-tab-panel="health" hidden id="radar-panel-health" role="tabpanel">${sourceHealthPanelEn(snapshot)}</section>
    <script>${filterScript("en")}</script>
  `);
}

function renderEnglishEntities(snapshot: Snapshot) {
  const entities = buildEntitySummaries(snapshotItemsForTraceability(snapshot.radar_items));
  const priorityEntities = entities.slice(0, 36);

  return englishShell(snapshot, "entities", 1, "Entity Tracking", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${entities.length} names in focus`, "success")}
          ${pill(`${snapshot.counts.snapshot_radar_items} reports`, "evidence")}
        </div>
        <h1>Entity Tracking</h1>
        <p class="lead">Companies, models, products, projects and papers appearing across the current reporting.</p>
      </div>
    </section>
    ${freshnessAlertEn(snapshot)}
    <section class="grid two">
      <div class="panel"><h2>Reading guide</h2>${noteListEn(["Prioritize names that recur across independent reporting.", "Treat a name seen in only one report as a lead, not a settled conclusion.", "Open the cited reporting before using a claim externally."])}</div>
      <div class="panel"><h2>Entity distribution</h2><div class="distribution">${distributionEn("Types", entityTypeDistributionEn(entities))}${distributionEn("Priority", entityPriorityDistributionEn(entities))}</div></div>
    </section>
    <section class="panel"><div class="section-heading"><h2>Priority entities</h2><a href="../reports/">Report evidence</a></div><div class="event-grid">${priorityEntities.map(renderEntityCardEn).join("") || empty("No entities are available.")}</div></section>
  `);
}

function reportEvents(report: SnapshotReport, snapshot: Snapshot, locale: "en" | "zh") {
  const itemIds = new Set(report.source_item_ids);
  return snapshot.event_clusters
    .filter((event) => event.related_item_ids.some((id) => itemIds.has(id)))
    .filter((event) => readerReadyEventForLocale(event, snapshot, locale))
    .toSorted((left, right) => right.event_score - left.event_score || Date.parse(right.latest_seen_at) - Date.parse(left.latest_seen_at))
    .slice(0, report.report_type === "daily" ? 8 : 12);
}

function reportDisplayTitle(report: SnapshotReport, locale: "en" | "zh") {
  if (locale === "en") return report.report_type === "daily" ? "AI Industry Radar Daily" : "AI Industry Radar Weekly";
  return report.report_type === "daily" ? "AI 行业雷达日报" : "AI 行业雷达周报";
}

function renderReportEvent(event: SnapshotEvent, snapshot: Snapshot, locale: "en" | "zh") {
  const title = locale === "en" ? eventEnglishTitle(event, snapshot) : chineseEventTitle(event);
  const summary = locale === "en" ? eventEnglishSummary(event, snapshot) : chineseEventSummary(event);
  const category = locale === "en" ? categoryLabelEn(event.category) : labelize(event.category);
  const sourceCount = locale === "en" ? `${event.source_count} source${event.source_count === 1 ? "" : "s"}` : `${event.source_count} 个来源`;
  const score = locale === "en" ? eventScoreLabelEn(event.event_score_label) : event.event_score_label;
  return `<article class="report-event"><p class="report-event-meta"><span>${escapeHtml(score)}</span><span>${escapeHtml(sourceCount)}</span><span>${escapeHtml(category)}</span></p><h3><a href="${escapeAttr(eventPrimaryUrl(event))}">${escapeHtml(title)}</a></h3>${summary ? `<p>${escapeHtml(summary)}</p>` : ""}<time>${escapeHtml(locale === "en" ? formatDateEn(event.latest_seen_at) : formatDate(event.latest_seen_at))}</time></article>`;
}

function firstSentence(value: string, locale: "en" | "zh") {
  const sentence = value.replace(/\s+/g, " ").split(locale === "en" ? /[.!?]/ : /[。！？]/u)[0]?.trim() ?? "";
  if (!sentence) return locale === "en" ? "The report provides a traceable public source." : "该事件已有可核对的公开来源。";
  return `${sentence}${locale === "en" ? "." : "。"}`;
}

function reportEventEvidence(event: SnapshotEvent, locale: "en" | "zh") {
  const sources = eventSources(event, 3);
  const sourceNames = locale === "en" ? sources.join(", ") : sources.join("、");
  if (event.source_count > 1 && event.source_families.length > 1) {
    return locale === "en"
      ? `${event.source_count} reports from ${sourceNames} span different source types; whether they are independent still needs checking.`
      : `${sourceNames}等 ${event.source_count} 篇报道跨越不同来源类型，但是否相互独立仍需核实。`;
  }
  if (event.source_count > 1) {
    return locale === "en"
      ? `${event.source_count} reports from ${sourceNames} are all the same source type, so they do not yet amount to independent confirmation.`
      : `${sourceNames}等 ${event.source_count} 篇报道属于同一来源类型，尚不能视为独立确认。`;
  }
  return locale === "en"
    ? `${sourceNames || "One public source"} is the only report currently available.`
    : `目前只有${sourceNames || "一个公开来源"}这一篇报道。`;
}

function reportEditorial(events: SnapshotEvent[], snapshot: Snapshot, locale: "en" | "zh") {
  const isEnglish = locale === "en";
  const crossFamily = events.filter((event) => event.source_count > 1 && event.source_families.length > 1).length;
  const sameFamily = events.filter((event) => event.source_count > 1 && event.source_families.length === 1).length;
  const singleSource = events.filter((event) => event.source_count <= 1).length;
  const signalCount = events.reduce((sum, event) => sum + event.related_item_ids.length, 0);
  const mergedReadingPaths = Math.max(0, signalCount - events.length);
  const first = events[0];
  const second = events[1];
  const thesis = isEnglish
    ? `Evidence strength is uneven across these ${events.length} events: ${crossFamily} span different source types, ${sameFamily} have several reports of one type, and ${singleSource} still rely on one report.`
    : `这 ${events.length} 个事件的证据强度并不一致：${crossFamily} 件跨越不同来源类型，${sameFamily} 件只有同类来源的多篇报道，${singleSource} 件仍是单篇报道。`;
  const lead = first
    ? isEnglish
      ? `“${eventEnglishTitle(first, snapshot)}” ranks first. ${firstSentence(eventEnglishSummary(first, snapshot), "en")} ${reportEventEvidence(first, locale)}`
      : `“${chineseEventTitle(first)}”位列首位。${firstSentence(chineseEventSummary(first), "zh")}${reportEventEvidence(first, locale)}`
    : "";
  const follow = second
    ? isEnglish
      ? `“${eventEnglishTitle(second, snapshot)}” is the second event to track. ${firstSentence(eventEnglishSummary(second, snapshot), "en")} ${reportEventEvidence(second, locale)}`
      : `第二个需要跟踪的是“${chineseEventTitle(second)}”。${firstSentence(chineseEventSummary(second), "zh")}${reportEventEvidence(second, locale)}`
    : "";
  const clustering = isEnglish
    ? mergedReadingPaths > 0
      ? `${signalCount} underlying radar signals are represented here; clustering removes ${mergedReadingPaths} repeated reading path${mergedReadingPaths === 1 ? "" : "s"}.`
      : `${signalCount} underlying radar signals map one-to-one to these events in this report.`
    : mergedReadingPaths > 0
      ? `这些事件对应 ${signalCount} 条雷达信号；聚类合并了 ${mergedReadingPaths} 条重复阅读路径。`
      : `这些事件对应 ${signalCount} 条雷达信号，本期没有可合并的重复报道。`;
  return `<section class="report-analysis"><h3>${isEnglish ? "Events and evidence" : "重点与证据"}</h3><p class="report-thesis">${escapeHtml(thesis)}</p>${lead ? `<p>${escapeHtml(lead)}</p>` : ""}${follow ? `<p>${escapeHtml(follow)}</p>` : ""}<p>${escapeHtml(clustering)}</p></section>`;
}

function renderReportReader(report: SnapshotReport, snapshot: Snapshot, locale: "en" | "zh") {
  const isEnglish = locale === "en";
  const type = isEnglish ? reportTypeLabelEn(report.report_type) : reportTypeLabel(report.report_type);
  const events = reportEvents(report, snapshot, locale);
  const minimumReadableEvents = report.report_type === "daily" ? 5 : 8;
  const reportStage = report.mode === "saved_candidate"
    ? (isEnglish ? "Report candidate" : "报告候选")
    : (isEnglish ? statusLabelEn(report.status) : statusLabel(report.status));
  const reviewStage = report.status === "needs_review"
    ? (isEnglish ? "Editorial check pending" : "编辑校对中")
    : (isEnglish ? statusLabelEn(report.status) : statusLabel(report.status));
  const qualityStage = report.quality_gate_passed
    ? (isEnglish ? "Enough reporting to review" : "信息量达到审阅要求")
    : (isEnglish ? "More reporting needed" : "信息仍不足");
  const summary = isEnglish
    ? `${events.length} developments worth reading across ${report.distinct_source_count} sources and ${report.category_count} themes.`
    : `本期聚焦 ${events.length} 个重点事件，覆盖 ${report.distinct_source_count} 个来源和 ${report.category_count} 个主题。`;
  const window = `${isEnglish ? formatDateEn(report.time_window.start) : formatDate(report.time_window.start)} — ${isEnglish ? formatDateEn(report.time_window.end) : formatDate(report.time_window.end)}`;
  const notes = isEnglish
    ? [
        "Most events still have only one report; update the judgment as additional reporting appears.",
        "Social-platform posts are not part of the automatic refresh, so some fast-moving developments may be missing.",
        `This brief covers ${formatDateEn(report.time_window.start)} to ${formatDateEn(report.time_window.end)}.`
      ]
    : [
        "多数事件仍只有一篇报道，判断需要随着后续报道继续修正。",
        "社交平台内容不在自动更新范围内，部分突发动态可能遗漏。",
        `本期观察范围为 ${formatDate(report.time_window.start)} 至 ${formatDate(report.time_window.end)}。`
      ];

  if (!report.quality_gate_passed || events.length < minimumReadableEvents) {
    const reasons = report.quality_gate_reasons.map((reason) => isEnglish ? reportGateReasonsEn([reason])[0] ?? reason : publicText(reason));
    if (events.length < minimumReadableEvents) {
      reasons.push(isEnglish
        ? `Only ${events.length} events have enough detail for a useful brief.`
        : `目前只有 ${events.length} 个事件具备足够信息，无法形成有用报告。`);
    }
    const insufficientTitle = isEnglish
      ? "Not enough reporting yet"
      : report.report_type === "daily"
        ? "今日数据不足，需补充信源或等待下一轮刷新"
        : "本周可核实内容不足，暂不发布完整周报";
    return `<article class="report-reader report-insufficient" data-quality-passed="false" data-report-id="${escapeAttr(report.id)}" data-report-status="${escapeAttr(report.status)}" id="report-${escapeAttr(report.report_type)}"><p class="report-kicker">${escapeHtml(`${reportStage} · ${type} · ${window}`)}</p><h2>${escapeHtml(insufficientTitle)}</h2><p>${escapeHtml(reasons.join(isEnglish ? " " : "；"))}</p></article>`;
  }

  return `<article class="report-reader" data-quality-passed="true" data-report-id="${escapeAttr(report.id)}" data-report-status="${escapeAttr(report.status)}" id="report-${escapeAttr(report.report_type)}">
    <header><p class="report-kicker">${escapeHtml(`${reportStage} · ${type} · ${window}`)}</p><h2>${escapeHtml(reportDisplayTitle(report, locale))}</h2><p class="report-deck">${escapeHtml(summary)}</p><div class="report-stats"><span>${escapeHtml(qualityStage)}</span><span>${escapeHtml(reviewStage)}</span><span>${report.usable_item_count} ${isEnglish ? "usable items" : "条可用内容"}</span><span>${report.citation_count} ${isEnglish ? "source links" : "个来源链接"}</span><span>${events.length} ${isEnglish ? "key events" : "个重点事件"}</span><span>${report.distinct_source_count} ${isEnglish ? "sources" : "个来源"}</span><span>${report.category_count} ${isEnglish ? "themes" : "个主题"}</span><span>${events.filter((event) => event.source_count > 1).length} ${isEnglish ? "with multiple reports" : "个多源报道事件"}</span></div></header>
    <div class="report-body">${reportEditorial(events, snapshot, locale)}<section class="report-reading-section"><h3>${isEnglish ? "Events and sources" : "事件与来源"}</h3><div class="report-event-list">${events.map((event) => renderReportEvent(event, snapshot, locale)).join("") || empty(isEnglish ? "No selected events are available." : "暂无精选事件。")}</div></section></div>
    <details class="report-notes"><summary>${isEnglish ? "What still needs checking" : "仍需核实"}</summary>${noteList((notes.length > 0 ? notes : [isEnglish ? "No additional gap is recorded." : "暂无额外记录。"]).slice(0, 6))}</details>
    <details class="report-sources"><summary>${isEnglish ? `Sources (${report.citations.length})` : `来源（${report.citations.length}）`}</summary><ol>${report.citations.map((citation) => `<li><a href="${escapeAttr(citation.url)}">${escapeHtml(citation.title)}</a><span>${escapeHtml(citation.source_name)}</span></li>`).join("")}</ol></details>
  </article>`;
}

function renderEnglishReports(snapshot: Snapshot) {
  const reports = latestReportsByType(snapshot.reports);
  const dailySummary = snapshot.report_quality_summary.daily;

  return englishShell(snapshot, "reports", 1, "Reports", `
    <section class="feed-heading"><div><h1>Reports</h1><p>Daily and weekly reading</p></div><span>${reports.length} editions</span></section>
    <nav class="report-tabs" aria-label="Report types"><a href="#report-daily">Daily</a><a href="#report-weekly">Weekly</a></nav>
    ${dailySummary && !dailySummary.quality_gate_passed ? `<section class="callout warning"><strong>Today's evidence is insufficient. Add sources or wait for the next refresh.</strong><p>${escapeHtml(reportGateReasonsEn(dailySummary.quality_gate_reasons).join(" ") || "The daily quality gate did not pass.")}</p></section>` : ""}
    <section class="report-list">${reports.map((report) => renderReportReader(report, snapshot, "en")).join("") || empty("No current report is available.")}</section>
  `);
}

function renderPromptSuggestions(prompts: string[]) {
  return `<div class="prompt-suggestions">${prompts.slice(0, 6).map((prompt) => `<button data-prompt="${escapeAttr(prompt)}" type="button">${escapeHtml(prompt)}</button>`).join("")}</div>`;
}

function promptSuggestionScript() {
  return `(function(){const input=document.querySelector("#local-query-input");if(!input)return;document.querySelectorAll("[data-prompt]").forEach(button=>button.addEventListener("click",()=>{input.value=button.dataset.prompt||"";input.focus();}));})();`;
}

function renderEnglishAsk(snapshot: Snapshot) {
  const examples = [
    "Rank the selected events by decision relevance.",
    "Which model releases are reported by more than one source?",
    "What changed in AI agents or developer tools during the visible window?",
    "Which events rely on a single source and need more confirmation?",
    "Which sources failed, timed out or returned no new items?",
    ...snapshot.curated_events.slice(0, 2).map((event) => `What evidence and uncertainty surround “${eventEnglishTitle(event, snapshot)}”?`)
  ];

  return englishShell(snapshot, "ask", 1, "Ask", `
    <section class="tool-heading"><p>${snapshot.event_count} events · updated ${escapeHtml(formatDateEn(snapshot.freshness.latest_timestamp))}</p><h1>Ask the radar</h1></section>
    <section class="interactive-tool tool-stage"><textarea id="local-query-input" rows="4" aria-label="Enter a question" placeholder="Ask about a company, model, event or source..."></textarea><div class="actions"><button class="button primary" id="local-query-run" type="button">Ask</button></div>${renderPromptSuggestions(examples)}<div class="local-result" id="local-query-result" aria-live="polite"></div></section>
    <script>${promptSuggestionScript()}</script><script>${localEvidenceToolScript("en", "../../data/radar-snapshot.json")}</script>
  `);
}

function renderHome(snapshot: Snapshot) {
  const events = eventFeed(snapshot).filter(readerReadyEvent);
  const topEvents = snapshot.curated_events.filter(readerReadyEvent).toSorted(compareHomepageEvents).slice(0, 3);
  return shell(snapshot, "home", 0, "精选", `
    <section class="feed-heading"><div><h1>精选</h1><p>${escapeHtml(feedDayLabel(snapshot.freshness.latest_timestamp ?? snapshot.generated_at, "zh"))}</p></div><a href="radar/?tab=events">${snapshot.event_count} 个事件</a></section>
    <section class="top-stories"><div class="section-heading"><h2>今日热点</h2><span>TOP 3</span></div>${renderTopStories(topEvents, snapshot, "zh")}</section>
    <section class="feed-toolbar"><div class="section-heading"><h2>最新精选</h2><a href="radar/?tab=events">全部事件</a></div><div class="feed-search"><input id="feed-search" type="search" placeholder="搜索标题、摘要、来源..."></div><div class="feed-chips"><button class="active" data-feed-category="all" type="button">全部</button><button data-feed-category="model_release,benchmark" type="button">模型</button><button data-feed-category="product_update,agent,tooling" type="button">产品</button><button data-feed-category="business,regulation,policy,funding,infrastructure,safety" type="button">行业</button><button data-feed-category="research" type="button">论文</button><button data-feed-category="open_source" type="button">开源</button></div></section>
    <section class="story-stream">${renderStoryStream(events.slice(0, 36), snapshot, "zh")}</section>
    <div class="feed-more"><a class="button primary" href="radar/?tab=events">查看全部事件</a></div>
    <script>${storyFilterScript()}</script>
  `);
}

function renderRadar(snapshot: Snapshot) {
  const families = countSourceFamilies(snapshot.radar_items);
  const eventFamilies = uniqueStrings(snapshot.event_clusters.flatMap((event) => event.source_families));
  const scoreLabels = uniqueStrings(snapshot.event_clusters.map((event) => event.event_score_label));
  const categories = uniqueStrings([
    ...snapshot.event_clusters.map((event) => categoryFilterValue(event.category)),
    ...snapshot.radar_items.flatMap((item) => item.categories.map(categoryFilterValue))
  ]).toSorted();
  const displaySignalItems = snapshot.radar_items;
  const reviewItemIds = new Set(
    snapshot.radar_items.filter((item) => item.status === "needs_review").map((item) => item.id)
  );
  const reviewEvents = snapshot.event_clusters.filter((event) =>
    event.related_item_ids.some((id) => reviewItemIds.has(id))
  );
  const events = eventFeed(snapshot).filter(readerReadyEvent);

  return shell(snapshot, "radar", 1, "行业精选", `
    <section class="feed-heading"><div><h1>行业精选</h1><p>${escapeHtml(feedDayLabel(snapshot.freshness.latest_timestamp ?? snapshot.generated_at, "zh"))}</p></div><span>${snapshot.event_count} 个事件</span></section>
    <section class="radar-tabs">
      <div class="tabbar" role="tablist" aria-label="雷达视图">
        ${tabButton("curated", "行业精选", true)}
        ${tabButton("events", "全部事件")}
        ${tabButton("signals", "全部信号")}
        ${tabButton("timeline", "最新时间线")}
        ${tabButton("review", "待复核")}
        ${tabButton("health", "来源健康")}
      </div>
    </section>

    <section class="radar-filters" data-radar-filters>
      <div class="filter-mobile-toggle"><button aria-expanded="false" class="button" id="radar-filter-toggle" type="button">筛选</button></div>
      <div class="controls" role="search">
        <label class="search-control">搜索 <input id="radar-search" type="search" placeholder="标题、摘要、来源" aria-label="按标题、来源、类别、标签搜索"></label>
        <label>状态 <select id="radar-status">${option("all", "全部状态")}${["included", "needs_review", "excluded", "failed"].map((status) => option(status, statusLabel(status))).join("")}</select></label>
        <label>类别 <select id="radar-category">${option("all", "全部类别")}${categories.map((category) => option(category, labelize(category))).join("")}</select></label>
        <label>来源类型 <select id="radar-family">${option("all", "全部来源类型")}${uniqueStrings([...Object.keys(families), ...eventFamilies]).map((family) => option(family, family)).join("")}</select></label>
        <label>评分 <select id="radar-score">${option("all", "全部评分")}${scoreLabels.map((label) => option(label, label)).join("")}</select></label>
        <label>内容时效 <select id="radar-freshness">${option("all", "全部时间")}${option("24h", "24 小时内")}${option("7d", "2-7 天")}${option("30d", "8-30 天")}${option("archive", "历史（30 天外）")}${option("unknown", "发布时间未知")}</select></label>
        <label>报道情况 <select id="radar-source-count">${option("all", "全部报道情况")}${option("cross", "不同类型来源均有报道")}${option("same", "同类来源多篇报道")}${option("single", "单篇报道")}</select></label>
      </div>
      <div class="filter-feedback"><span aria-live="polite" id="radar-result-count"></span><button class="button" id="radar-reset" type="button">重置筛选</button></div>
    </section>
    <section aria-labelledby="radar-tab-curated" class="tab-panel active" data-tab-panel="curated" id="radar-panel-curated" role="tabpanel">
      <div class="story-stream">${renderStoryStream(eventsByLatest(snapshot.curated_events.filter(readerReadyEvent)), snapshot, "zh") || empty("暂无行业精选事件。")}</div>
    </section>

    <section aria-labelledby="radar-tab-events" class="tab-panel" data-tab-panel="events" hidden id="radar-panel-events" role="tabpanel">
      <div class="story-stream">${renderStoryStream(events, snapshot, "zh") || empty("暂无事件。")}</div>
    </section>

    <section aria-labelledby="radar-tab-signals" class="tab-panel" data-tab-panel="signals" hidden id="radar-panel-signals" role="tabpanel">
      <div class="row-list radar-list" id="radar-list">
        ${displaySignalItems.map((item) => renderRadarItem(item, snapshot)).join("") || empty("暂无雷达条目。")}
      </div>
    </section>

    <section aria-labelledby="radar-tab-timeline" class="tab-panel" data-tab-panel="timeline" hidden id="radar-panel-timeline" role="tabpanel">
      <div class="timeline-list">${snapshot.timeline.map(renderTimelineEntry).join("") || empty("暂无时间线。")}</div>
    </section>

    <section aria-labelledby="radar-tab-review" class="tab-panel" data-tab-panel="review" hidden id="radar-panel-review" role="tabpanel">
      <div class="story-stream">${renderStoryStream(reviewEvents, snapshot, "zh") || empty("暂无待复核事件。")}</div>
    </section>

    <section aria-labelledby="radar-tab-health" class="tab-panel" data-tab-panel="health" hidden id="radar-panel-health" role="tabpanel">
      ${sourceHealthPanel(snapshot)}
    </section>
    <script>${filterScript()}</script>
  `);
}

function renderEntities(snapshot: Snapshot) {
  const traceItems = snapshotItemsForTraceability(snapshot.radar_items);
  const entities = buildEntitySummaries(traceItems);
  const priorityEntities = entities.slice(0, 36);
  const reportLinkedEntities = reportLinkedEntityNames(snapshot);

  return shell(snapshot, "entities", 1, "实体", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${entities.length} 个可追踪实体`, "success")}
          ${pill(`${snapshot.counts.snapshot_radar_items} 条公开信号`, "evidence")}
          ${pill(`${reportLinkedEntities.size} 个报告关联实体`, "neutral")}
          ${pill(sourceLabel(snapshot.source.data_source), "neutral")}
        </div>
        <h1>实体跟踪</h1>
        <p class="lead">按公司、模型、产品、项目、论文和来源聚合公开信号；每个实体展示名称、类型、证据数量、来源覆盖和下一步判断。</p>
      </div>
      <a class="button" href="../radar/">打开事件雷达</a>
    </section>
    ${freshnessAlert(snapshot)}

    <section class="grid two">
      <div class="panel">
        <div class="section-heading">
          <h2>跟踪原则</h2>
          <a href="../radar/">回到雷达</a>
        </div>
        ${noteList([
          "优先看多源、持续出现、且能回到公开引用的实体。",
          "单源或待复核实体只进入观察，不直接写成确定结论。",
          "正式报告必须能从章节引用追溯回这些实体和原始公开来源。"
        ])}
      </div>
      <div class="panel">
        <div class="section-heading">
          <h2>实体分布</h2>
          <span>${escapeHtml(formatDate(snapshot.generated_at))}</span>
        </div>
        <div class="distribution">
          ${distribution("类型", entityTypeDistribution(entities))}
          ${distribution("优先级", entityPriorityDistribution(entities))}
          ${distribution("报告关联", [["已关联", reportLinkedEntities.size], ["待关联", Math.max(0, entities.length - reportLinkedEntities.size)]])}
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="section-heading">
        <h2>高优先级实体</h2>
        <a href="../reports/">查看报告路径</a>
      </div>
      <div class="event-grid">${priorityEntities.map((entity) => renderEntityCard(entity, reportLinkedEntities)).join("") || empty("暂无可展示实体。")}</div>
    </section>
  `);
}



function renderReports(snapshot: Snapshot) {
  const reports = latestReportsByType(snapshot.reports);
  const dailySummary = snapshot.report_quality_summary.daily;

  return shell(snapshot, "reports", 1, "报告", `
    <section class="feed-heading"><div><h1>报告</h1><p>日报与周报</p></div><span>${reports.length} 期</span></section>
    <nav class="report-tabs" aria-label="报告类型"><a href="#report-daily">日报</a><a href="#report-weekly">周报</a></nav>
    ${dailySummary && !dailySummary.quality_gate_passed ? `<section class="callout warning"><strong>今日数据不足，需补充信源或等待下一轮刷新</strong><p>${escapeHtml(dailySummary.quality_gate_reasons.map(publicText).join("；") || "日报质量门禁未通过。")}</p></section>` : ""}
    <section class="report-list">${reports.map((report) => renderReportReader(report, snapshot, "zh")).join("") || empty("暂无当前报告。")}</section>
  `);
}

function renderAsk(snapshot: Snapshot) {
  const title = snapshotCuratedTitle(snapshot);
  const examples = [
    `把${title}按重要性排序`,
    `${snapshotWindowLabel(snapshot)}有哪些被两家以上来源同时报道的模型发布？`,
    `${snapshotPeriodLabel(snapshot)} Agent / 开发工具有哪些重要变化？`,
    "哪些事件只有单一来源，可信度较低？",
    snapshotIsStale(snapshot) ? "哪些来源在本轮刷新失败或没有新内容？" : "哪些来源今天失败或没有新内容？",
    ...snapshot.curated_events.slice(0, 2).map((event) => `围绕“${chineseEventTitle(event)}”有哪些证据和不确定性？`)
  ];

  return shell(snapshot, "ask", 1, "提问", `
    <section class="tool-heading"><p>${snapshot.event_count} 个事件 · 更新至 ${escapeHtml(formatDate(snapshot.freshness.latest_timestamp))}</p><h1>向雷达提问</h1></section>
    <section class="interactive-tool tool-stage"><textarea id="local-query-input" rows="4" aria-label="输入问题" placeholder="询问公司、模型、事件或来源..."></textarea><div class="actions"><button class="button primary" id="local-query-run" type="button">提问</button></div>${renderPromptSuggestions(examples)}<div class="local-result" id="local-query-result" aria-live="polite"></div></section>
    <script>${promptSuggestionScript()}</script><script>${localEvidenceToolScript()}</script>
  `);
}

function languageSwitchStateScript() {
  return `(function () {
    var suffix = window.location.search + window.location.hash;
    if (!suffix) return;
    document.querySelectorAll(".language-switch a").forEach(function (link) {
      var target = new URL(link.href, window.location.href);
      target.search = window.location.search;
      target.hash = window.location.hash;
      link.href = target.toString();
    });
  })();`;
}

function englishShell(
  snapshot: Snapshot,
  current: "home" | "radar" | "entities" | "reports" | "ask",
  depth: 0 | 1,
  title: string,
  body: string
) {
  const localePrefix = depth === 0 ? "" : "../";
  const assetPrefix = depth === 0 ? "../" : "../../";
  const chineseHref = current === "home" ? "../index.html" : `../../${current}/`;
  const englishHref = current === "home" ? "index.html" : `${localePrefix}${current}/`;
  const nav = [
    ["home", "Selected", `${localePrefix}index.html`],
    ["radar", "All events", `${localePrefix}radar/?tab=events`],
    ["reports", "Reports", `${localePrefix}reports/`],
    ["ask", "Ask", `${localePrefix}ask/`]
  ] as const;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="AI Industry Radar public event intelligence">
    <title>${escapeHtml(title)} - AI Industry Radar</title>
    <link rel="icon" href="${assetPrefix}favicon.svg" type="image/svg+xml">
    <link rel="alternate" hreflang="zh-CN" href="${escapeAttr(chineseHref)}">
    <link rel="alternate" hreflang="en" href="${escapeAttr(englishHref)}">
    <link rel="stylesheet" href="${assetPrefix}assets/styles.css">
  </head>
  <body${current === "home" ? ' class="home-page"' : ""}>
    <div class="app-layout">
      <aside class="desktop-sidebar">
        <a class="brand" href="${localePrefix}index.html"><img src="${assetPrefix}favicon.svg" alt=""><span>AI RADAR</span></a>
        <p class="nav-group-label">READ</p>
        <nav class="side-nav" aria-label="Primary navigation">
          ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${escapeHtml(label)}</a>`).join("")}
        </nav>
        <p class="nav-group-label">MORE</p>
        <nav class="side-nav secondary-nav" aria-label="Secondary navigation">
          <a href="${localePrefix}radar/?tab=health">Data status</a>
        </nav>
      </aside>
      <div class="app-frame">
        <header class="mobile-header">
          <a class="mobile-brand" href="${localePrefix}index.html">AI RADAR</a>
          <div class="language-switch" aria-label="Language"><a lang="zh-CN" href="${escapeAttr(chineseHref)}">中</a><a aria-current="true" href="${escapeAttr(englishHref)}">EN</a></div>
        </header>
        <div class="desktop-topbar">
          <span>Updated through ${escapeHtml(formatDateEn(snapshot.freshness.latest_timestamp))}</span>
          <div class="language-switch" aria-label="Language"><a lang="zh-CN" href="${escapeAttr(chineseHref)}">中文</a><a aria-current="true" href="${escapeAttr(englishHref)}">EN</a></div>
        </div>
        <main>${body}</main>
        <footer class="site-footer"><span>${escapeHtml(formatDateEn(snapshot.generated_at))}</span><a href="${localePrefix}radar/?tab=health">Data status</a></footer>
      </div>
    </div>
    <nav class="mobile-nav" aria-label="Mobile navigation">
      ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${escapeHtml(label)}</a>`).join("")}
    </nav>
    <script>${languageSwitchStateScript()}</script>
  </body>
</html>`;
}

function eventEnglishItems(event: SnapshotEvent, snapshot: Snapshot) {
  const ids = new Set(event.related_item_ids);
  return snapshot.radar_items.filter((item) => ids.has(item.id));
}

function containsHan(value: string | undefined) {
  return /\p{Script=Han}/u.test(value ?? "");
}

function englishItemTitle(item: SnapshotItem) {
  if (!containsHan(item.title)) return item.title;
  const entities = item.entities
    .map((entity) => entityLabelEn(entity.name))
    .filter((name) => !containsHan(name))
    .slice(0, 3);
  const subject = entities.length > 0 ? entities.join(" · ") : item.categories.map(categoryLabelEn).slice(0, 2).join(" · ");
  return `${categoryLabelEn(item.categories[0] ?? "other")}: ${subject || "original-language report"}`;
}

function englishItemSource(item: SnapshotItem) {
  return containsHan(item.source_name) ? sourceFamilyLabelEn(sourceFamily(item)) : item.source_name;
}

function eventEnglishTitle(event: SnapshotEvent, snapshot: Snapshot) {
  const items = eventEnglishItems(event, snapshot);
  const englishItem = items.find((item) => !containsHan(item.title));
  if (englishItem) return englishItem.title;
  if (items[0]) return englishItemTitle(items[0]);
  const timelineTitle = event.timeline.find((entry) => !containsHan(entry.title))?.title;
  return timelineTitle || `${categoryLabelEn(event.category)}: ${event.related_entities.filter((entity) => !containsHan(entity)).slice(0, 3).map(entityLabelEn).join(" · ") || "original-language report"}`;
}

function eventEnglishSummary(event: SnapshotEvent, snapshot: Snapshot) {
  const summary = eventEnglishItems(event, snapshot)
    .map((item) => item.summary_en?.trim())
    .find((value) => value && !containsHan(value));
  if (summary) return summary;
  return "";
}

function entityLabelEn(value: string) {
  const aliases: Record<string, string> = {
    "苹果": "Apple",
    apple: "Apple",
    anthropic: "Anthropic",
    github: "GitHub",
    "gpt 5 6": "GPT-5.6",
    "gpt red": "GPT-Red",
    "hugging face": "Hugging Face",
    "llama cpp": "llama.cpp",
    microsoft: "Microsoft",
    openai: "OpenAI",
    "deepstream 9 1": "DeepStream 9.1",
    vllm: "vLLM"
  };
  return aliases[value.trim().toLowerCase()] ?? entityDisplayLabel(value);
}













function renderTimelineEntryEn(entry: SnapshotTimelineEntry, snapshot: Snapshot) {
  const event = snapshot.event_clusters.find((candidate) => candidate.event_cluster_id === entry.event_cluster_id);
  return `<a class="timeline-row" href="${escapeAttr(entry.url)}"><time>${escapeHtml(formatDateEn(entry.timestamp))}</time><strong>${escapeHtml(event ? eventEnglishTitle(event, snapshot) : entry.title)}</strong><span>${escapeHtml(`${entry.source_name} / ${eventScoreLabelEn(entry.event_score_label)}`)}</span></a>`;
}

function renderRadarItemEn(item: SnapshotItem) {
  const summary = item.summary_en?.trim() && !containsHan(item.summary_en) ? item.summary_en.trim() : "";
  const title = englishItemTitle(item);
  const source = englishItemSource(item);
  const freshness = freshnessBucket(item.published_at ?? "");
  return `<article class="radar-row" data-category="${escapeAttr(`${item.categories.join(" ")} ${item.categories.map(categoryLabelEn).join(" ")}`)}" data-family="${escapeAttr(sourceFamily(item))}" data-freshness="${freshness}" data-search="${escapeAttr(`${title} ${summary} ${source} ${item.tags.join(" ")} ${item.entities.map((entity) => entity.name).join(" ")}`.toLowerCase())}" data-status="${escapeAttr(item.status)}">
    <div class="story-time"><time>${escapeHtml(feedTime(item.published_at ?? item.collected_at, "en"))}</time><span></span></div>
    <div class="story-content"><div class="story-meta"><span>${escapeHtml(source)}</span><strong>${Math.round(item.scores.overall * 100)}</strong></div><h2><a href="${escapeAttr(item.url)}">${escapeHtml(title)}</a></h2>${summary ? `<p>${escapeHtml(summary)}</p>` : ""}<div class="story-foot"><span>${escapeHtml(item.categories.map(categoryLabelEn).slice(0, 2).join(" · "))}</span><span>${escapeHtml(statusLabelEn(item.status))}</span></div></div>
  </article>`;
}



function renderEntityCardEn(entity: EntitySummary) {
  const insight = entityTrackingInsight(entity);
  const name = entityLabelEn(entity.name);
  const sourceEntries = [...entity.sourceCounts.entries()].toSorted((left, right) => right[1] - left[1]).slice(0, 4);
  return `<article class="event-card">
    <div class="pill-row">${pill(priorityLabelEn(insight.priorityLabel), priorityTone(insight.priorityScore))}${pill(entityTypeLabelEn(String(entity.type)), "neutral")}${pill(`${entity.totalSignals} signals`, "evidence")}</div>
    <h2>${escapeHtml(name)}</h2>
    <p>${escapeHtml(`${name} appears in ${entity.totalSignals} public signals across ${entity.sourceCounts.size} sources. Use the linked evidence to judge whether the pattern is persistent and decision-relevant.`)}</p>
    <dl class="event-meta">${rail("Source coverage", String(entity.sourceCounts.size))}${rail("Average confidence", formatPercent(entityAverageConfidence(entity)))}${rail("Latest signal", formatDateEn(entity.latestTimestamp))}${rail("Included / review", `${entity.statusCounts.included} / ${entity.statusCounts.needs_review}`)}</dl>
    <div class="pill-row">${sourceEntries.map(([source, count]) => pill(`${source} ${count}`, "neutral")).join("")}</div>
    <a class="source-link" href="${escapeAttr(entity.topItem.url)}">Open strongest public signal</a>
  </article>`;
}

function entityTypeDistributionEn(entities: EntitySummary[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    const label = entityTypeLabelEn(String(entity.type));
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].toSorted((left, right) => right[1] - left[1]);
}

function entityPriorityDistributionEn(entities: EntitySummary[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    const label = priorityLabelEn(entityTrackingInsight(entity).priorityLabel);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].toSorted((left, right) => right[1] - left[1]);
}





function reportGateReasonsEn(reasons: string[]) {
  const translated = reasons.map((reason) => {
    const normalized = reason.toLowerCase();
    if (normalized.includes("usable") || reason.includes("可用")) return "Usable item count is below the required threshold.";
    if (normalized.includes("citation") || reason.includes("引用")) return "Citation count is below the required threshold.";
    if (normalized.includes("source") || reason.includes("来源")) return "Source diversity is below the required threshold.";
    if (normalized.includes("categor") || reason.includes("类别")) return "Category breadth is below the required threshold.";
    if (normalized.includes("fresh") || normalized.includes("stale") || reason.includes("时间") || reason.includes("新鲜")) return "Evidence freshness is outside the accepted window.";
    return "One or more report quality requirements are not met.";
  });
  return uniqueStrings(translated);
}



function sourceHealthPanelEn(snapshot: Snapshot) {
  const health = snapshot.source_health_summary;
  return `<section class="panel"><div class="section-heading"><h2>Source health summary</h2><span>Broad refresh through ${escapeHtml(formatDateEn(snapshot.source_health_scope.finished_at ?? snapshot.coverage.latest_refresh))}</span></div><dl class="metric-grid">${metricEn("Sources total", snapshot.coverage.sources_total)}${metricEn("Automated eligible", snapshot.coverage.automated_eligible_sources)}${metricEn("Broad refresh attempted", snapshot.source_health_scope.attempted_sources)}${metricEn("Succeeded", health.succeeded)}${metricEn("Failed", health.failed)}${metricEn("Manual / blocked", health.manual_blocked)}${metricEn("Timeout failures", health.timeout)}${metricEn("HTTP 403 failures", health["403"])}${metricEn("Rate-limit warnings (may overlap)", health.rate_limit)}${metricEn("No new items", health.no_items)}${metricEn("Duplicate only", health.duplicate_only)}</dl><div class="distribution">${distributionEn("Failures, warnings and exclusions (categories may overlap)", Object.entries(snapshot.failure_family_summary))}${distributionEn("Blocked or excluded", [["Manual blocked", health.manual_blocked], ["Unsupported", health.unsupported_source], ["Low relevance excluded", health.low_relevance_excluded]])}</div>${sourceFailureListEn(snapshot)}${sourceHealthFamilyMatrixEn(snapshot)}</section>`;
}

function sourceFailureListEn(snapshot: Snapshot) {
  const failures = snapshot.source_health_failures ?? [];
  if (failures.length === 0) return `<p class="note">No named source failed in the audited broad refresh.</p>`;
  return `<div class="row-list"><h3>Failed sources in the audited broad refresh</h3>${failures.map((failure) => `<div class="compact-row"><strong>${escapeHtml(failure.source_name)}</strong><span>${escapeHtml(`${sourceFamilyLabelEn(failure.source_family)} / ${failureLabelEn(failure.reason)}`)}</span></div>`).join("")}</div>`;
}

function sourceHealthFamilyMatrixEn(snapshot: Snapshot) {
  const rows = snapshot.source_health_by_family ?? [];
  if (rows.length === 0) {
    return `<p class="note">No source-family health matrix is available for this snapshot.</p>`;
  }

  return `<div class="health-table-wrap"><table class="health-table"><caption>Latest broad refresh by source family. Failure and exclusion columns may overlap.</caption><thead><tr><th>Source family</th><th>Configured</th><th>Eligible</th><th>Attempted</th><th>Succeeded</th><th>Failed</th><th>Timeout</th><th>403</th><th>Rate limit</th><th>No items</th><th>Duplicate only</th><th>Manual</th><th>Unsupported</th><th>Low relevance</th></tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${escapeHtml(sourceFamilyLabelEn(row.family))}</th>${[row.configured, row.automated_eligible, row.attempted, row.succeeded, row.failed, row.timeout, row["403"], row.rate_limit, row.no_items, row.duplicate_only, row.manual_blocked, row.unsupported_source, row.low_relevance_excluded].map((value) => `<td>${value.toLocaleString("en-US")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function metricEn(label: string, value: number | null) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${value === null ? "Unavailable" : value.toLocaleString("en-US")}</dd></div>`;
}

function distributionEn(title: string, entries: Array<[string, number]>) {
  return `<section><h3>${escapeHtml(title)}</h3><div class="tag-block">${entries.map(([label, value]) => pill(`${publicLabelEn(label)} ${value}`, "neutral")).join("")}</div></section>`;
}

function optionRaw(value: string, label: string) {
  return `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`;
}

function noteListEn(items: string[]) {
  return `<ul class="note-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}



function freshnessAlertEn(snapshot: Snapshot, suffix = "") {
  const latest = snapshot.freshness?.latest_timestamp;
  if (!latest) {
    const message = `No verifiable content publication timestamp is available. Treat this surface as a historical evidence index, not a live industry feed.${suffix ? ` ${suffix}` : ""}`;
    return `<section class="freshness-alert"><strong>Content recency</strong><p>${escapeHtml(message)}</p></section>`;
  }
  const ageDays = snapshotAgeDays(snapshot);
  if (ageDays !== null && ageDays <= 2) return "";
  const message = `The latest public content was published at ${formatDateEn(latest)}${ageDays === null ? "" : `, about ${ageDays} day${ageDays === 1 ? "" : "s"} before this snapshot`}. This is not complete live AI industry coverage.${suffix ? ` ${suffix}` : ""}`;
  return `<section class="freshness-alert"><strong>Content recency</strong><p>${escapeHtml(message)}</p></section>`;
}

function formatDateEn(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("en-US", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short", timeZone: "UTC", year: "numeric" }).format(date)} UTC`;
}

function categoryLabelEn(value: string) {
  const labels: Record<string, string> = {
    agent: "Agents",
    benchmark: "Benchmarks",
    business: "Business",
    funding: "Funding",
    infrastructure: "Infrastructure",
    media_interview: "Media / interview",
    model_release: "Model release",
    open_source: "Open source",
    opinion: "Opinion",
    other: "Other",
    policy: "Policy",
    product_update: "Product update",
    regulation: "Regulation",
    research: "Research",
    safety: "Safety",
    tooling: "Developer tooling"
  };
  return labels[categoryFilterValue(value)] ?? value.replace(/_/g, " ");
}

function sourceFamilyLabelEn(value: string) {
  const labels: Record<string, string> = {
    arxiv_research: "Research feeds",
    github_open_source: "Open source",
    official_company: "Company / lab",
    podcast_video: "Podcast / video",
    specialist_analysis: "Analysis / media",
    "公司/实验室": "Company / lab",
    "分析/媒体": "Analysis / media",
    "其他公开来源": "Other public sources",
    "开源项目": "Open-source project",
    "研究订阅": "Research feed"
  };
  return labels[value] ?? value;
}

function eventScoreLabelEn(value: string) {
  const labels: Record<SnapshotEvent["event_score_label"], string> = {
    "高优先级": "High priority",
    "关注": "Watch",
    "观察": "Monitor",
    "噪音/低相关": "Low relevance"
  };
  return labels[value as SnapshotEvent["event_score_label"]] ?? value;
}

function statusLabelEn(status: string) {
  const labels: Record<string, string> = {
    approved: "Approved",
    draft: "Draft",
    excluded: "Excluded",
    failed: "Failed",
    included: "Included",
    needs_review: "Needs review",
    published: "Published",
    reviewed: "Reviewed"
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

function reportTypeLabelEn(type: string) {
  if (type === "daily") return "Daily";
  if (type === "weekly") return "Weekly";
  return type;
}





function entityTypeLabelEn(type: string) {
  const labels: Record<string, string> = {
    company: "Company",
    model: "Model",
    organization: "Organization",
    paper: "Paper",
    person: "Person",
    product: "Product",
    project: "Project",
    source: "Source"
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

function priorityLabelEn(label: string) {
  const labels: Record<string, string> = {
    "高优先级": "High priority",
    "关注": "Watch",
    "观察": "Monitor",
    "持续跟踪": "Track",
    "观察中": "Monitor"
  };
  return labels[label] ?? label;
}

function failureLabelEn(value: string) {
  const labels: Record<string, string> = {
    "403": "HTTP 403",
    blocked_requires_manual: "Manual / blocked",
    duplicate_only: "Duplicate only",
    failed_403: "HTTP 403",
    failed_parse: "Parse failure",
    failed_rate_limit: "Rate-limit failure",
    failed_timeout: "Timeout",
    low_relevance_excluded: "Low relevance excluded",
    manual_blocked: "Manual / blocked",
    no_items: "No new items",
    no_new_items: "No new items",
    rate_limit: "Rate-limit warning (may overlap)",
    timeout: "Timeout failure",
    unsupported_source: "Unsupported"
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function publicLabelEn(value: string) {
  const normalizedCategory = categoryFilterValue(value);
  if (["agent", "benchmark", "business", "funding", "infrastructure", "media_interview", "model_release", "open_source", "opinion", "other", "policy", "product_update", "regulation", "research", "safety", "tooling"].includes(normalizedCategory)) {
    return categoryLabelEn(normalizedCategory);
  }
  const sourceFamily = sourceFamilyLabelEn(value);
  if (sourceFamily !== value) return sourceFamily;
  return failureLabelEn(value);
}

function shell(snapshot: Snapshot, current: "home" | "radar" | "entities" | "reports" | "ask", depth: 0 | 1 | 2, title: string, body: string) {
  const prefix = depth === 0 ? "" : depth === 1 ? "../" : "../../";
  const chineseHref = current === "home" ? `${prefix}index.html` : `${prefix}${current}/`;
  const englishHref = current === "home" ? `${prefix}en/` : `${prefix}en/${current}/`;
  const nav = [
    ["home", "精选", `${prefix}index.html`],
    ["radar", "全部", `${prefix}radar/?tab=events`],
    ["reports", "报告", `${prefix}reports/`],
    ["ask", "提问", `${prefix}ask/`]
  ] as const;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="AI 行业雷达 Cloudflare 公开站">
    <title>${escapeHtml(title)} - AI 行业雷达</title>
    <link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
    <link rel="alternate" hreflang="zh-CN" href="${escapeAttr(chineseHref)}">
    <link rel="alternate" hreflang="en" href="${escapeAttr(englishHref)}">
    <link rel="stylesheet" href="${prefix}assets/styles.css">
  </head>
  <body${current === "home" ? ' class="home-page"' : ""}>
    <div class="app-layout">
      <aside class="desktop-sidebar">
        <a class="brand" href="${prefix}index.html"><img src="${prefix}favicon.svg" alt=""><span>AI RADAR</span></a>
        <p class="nav-group-label">内容</p>
        <nav class="side-nav" aria-label="主导航">
          ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${escapeHtml(label)}</a>`).join("")}
        </nav>
        <p class="nav-group-label">更多</p>
        <nav class="side-nav secondary-nav" aria-label="次级导航">
          <a href="${prefix}radar/?tab=health">数据状态</a>
        </nav>
      </aside>
      <div class="app-frame">
        <header class="mobile-header">
          <a class="mobile-brand" href="${prefix}index.html">AI RADAR</a>
          <div class="language-switch" aria-label="语言"><a aria-current="true" href="${escapeAttr(chineseHref)}">中</a><a lang="en" href="${escapeAttr(englishHref)}">EN</a></div>
        </header>
        <div class="desktop-topbar">
          <span>内容更新至 ${escapeHtml(formatDate(snapshot.freshness.latest_timestamp))}</span>
          <div class="language-switch" aria-label="语言"><a aria-current="true" href="${escapeAttr(chineseHref)}">中文</a><a lang="en" href="${escapeAttr(englishHref)}">EN</a></div>
        </div>
        <main>${body}</main>
        <footer class="site-footer"><span>${escapeHtml(formatDate(snapshot.generated_at))}</span><a href="${prefix}radar/?tab=health">数据状态</a></footer>
      </div>
    </div>
    <nav class="mobile-nav" aria-label="移动导航">
      ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${escapeHtml(label)}</a>`).join("")}
    </nav>
    <script>${languageSwitchStateScript()}</script>
  </body>
</html>`;
}



function categoryFilterValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}





function entityDisplayLabel(value: string) {
  const aliases: Record<string, string> = {
    apple: "Apple",
    anthropic: "Anthropic",
    github: "GitHub",
    "gpt 5 6": "GPT-5.6",
    "gpt red": "GPT-Red",
    "hugging face": "Hugging Face",
    "hugging face transformers": "Hugging Face Transformers",
    "llama cpp": "llama.cpp",
    microsoft: "Microsoft",
    "microsoft 365 copilot": "Microsoft 365 Copilot",
    openai: "OpenAI",
    "openai python sdk": "OpenAI Python SDK",
    "deepstream 9 1": "DeepStream 9.1",
    vllm: "vLLM",
    "vllm project vllm": "vLLM"
  };
  return aliases[value.trim().toLowerCase()] ?? value;
}









function renderTimelineEntry(entry: SnapshotTimelineEntry) {
  return `<a class="timeline-row" href="${escapeAttr(entry.url)}">
    <time>${escapeHtml(formatDate(entry.timestamp))}</time>
    <strong>${escapeHtml(entry.event_title)}</strong>
    <span>${escapeHtml(`${entry.source_name} / ${entry.event_score_label}`)}</span>
  </a>`;
}

function renderEntityCard(entity: EntitySummary, reportLinkedEntities: Set<string>) {
  const insight = entityTrackingInsight(entity);
  const href = `${entityStaticSlug(entity)}/`;
  const sourceEntries = [...entity.sourceCounts.entries()].toSorted((left, right) => right[1] - left[1]).slice(0, 4);
  const categoryEntries = [...entity.categories.entries()].toSorted((left, right) => right[1] - left[1]).slice(0, 4);
  const linkedToReport = reportLinkedEntities.has(entityKey(entity));

  return `<article class="event-card">
    <div class="pill-row">
      ${pill(insight.priorityLabel, priorityTone(insight.priorityScore))}
      ${pill(insight.watchLabel, linkedToReport ? "success" : "caution")}
      ${pill(entityTypeLabel(entity.type), "neutral")}
      ${linkedToReport ? pill("报告已关联", "success") : pill("待报告引用", "neutral")}
    </div>
    <h2><a href="${escapeAttr(href)}">${escapeHtml(entity.name)}</a></h2>
    <p>${escapeHtml(publicText(insight.reasons[0] ?? "当前证据仍少于 2 个独立来源。"))}</p>
    <dl class="event-meta">
      ${rail("公开信号", String(entity.totalSignals))}
      ${rail("来源覆盖", String(entity.sourceCounts.size))}
      ${rail("平均置信度", formatPercent(entityAverageConfidence(entity)))}
      ${rail("最新信号", formatDate(entity.latestTimestamp))}
      ${rail("最高分信号", publicText(entity.topItem.title))}
      ${rail("复核状态", `${entity.statusCounts.included} 已纳入 / ${entity.statusCounts.needs_review} 待复核`)}
    </dl>
    <div class="pill-row">
      ${sourceEntries.map(([source, count]) => pill(`${source} ${count}`, "neutral")).join("")}
      ${categoryEntries.map(([category, count]) => pill(`${labelize(category)} ${count}`, "evidence")).join("")}
    </div>
    <details>
      <summary>为什么跟踪</summary>
      ${noteList([...insight.reasons.slice(1), ...insight.nextQuestions].slice(0, 6))}
    </details>
  </article>`;
}

function renderEntityDetail(snapshot: Snapshot, entity: EntitySummary) {
  const traceItems = snapshotItemsForTraceability(snapshot.radar_items);
  const graph = buildEntityEvidenceGraph(traceItems, entity);
  const insight = entityTrackingInsight(entity);
  const sourceEntries = [...graph.sourceCounts.entries()].toSorted((left, right) => right[1] - left[1]).slice(0, 10);
  const categoryEntries = [...graph.categoryCounts.entries()].toSorted((left, right) => right[1] - left[1]).slice(0, 10);
  const evidenceItems = graph.items.slice(0, 24);

  return shell(snapshot, "entities", 2, entity.name, `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(entityTypeLabel(entity.type), "neutral")}
          ${pill(insight.priorityLabel, priorityTone(insight.priorityScore))}
          ${pill(insight.watchLabel, watchTone(insight.watchLabel))}
          ${pill(`${graph.items.length} 条证据`, "evidence")}
          ${pill(`${graph.sourceCounts.size} 个来源`, "success")}
        </div>
        <h1>${escapeHtml(entity.name)}</h1>
        <p class="lead">实体详情使用公开雷达字段，解释这个对象为什么值得跟踪、证据来自哪里、哪些信号仍需复核。</p>
      </div>
      <a class="button" href="../">返回实体索引</a>
    </section>
    ${freshnessAlert(snapshot)}

    <section class="grid two">
      <div class="panel">
        <div class="section-heading">
          <h2>为什么跟踪</h2>
          <span>${escapeHtml(formatPercent(entityAverageConfidence(entity)))}</span>
        </div>
        ${noteList(insight.reasons)}
      </div>
      <div class="panel">
        <div class="section-heading">
          <h2>下一步核查</h2>
          <span>${escapeHtml(String(insight.priorityScore))}</span>
        </div>
        ${noteList(insight.nextQuestions)}
      </div>
    </section>

    ${renderEntityDossier(snapshot, entity, graph, insight)}

    <section class="panel">
      <div class="section-heading">
        <h2>证据图</h2>
        <a href="../../radar/">查看事件雷达</a>
      </div>
      <dl class="rail">
        ${rail("实体 ID", entityRouteId(entity))}
        ${rail("公开信号", String(graph.items.length))}
        ${rail("来源覆盖", String(graph.sourceCounts.size))}
        ${rail("类别覆盖", String(graph.categoryCounts.size))}
        ${rail("待复核", String(graph.statusCounts.needs_review))}
        ${rail("时间跨度", `${formatDate(graph.firstTimestamp)} 至 ${formatDate(graph.latestTimestamp)}`)}
      </dl>
      <div class="distribution">
        ${distribution("来源覆盖", sourceEntries)}
        ${distribution("类别覆盖", categoryEntries.map(([category, count]) => [labelize(category), count]))}
        ${distribution("复核状态", [["已纳入", graph.statusCounts.included], ["待复核", graph.statusCounts.needs_review]])}
      </div>
    </section>

    <section class="panel">
      <div class="section-heading">
        <h2>证据时间线</h2>
        <a href="../../radar/">打开雷达</a>
      </div>
      <div class="row-list">${evidenceItems.map(renderEntityEvidenceItem).join("") || empty("暂无公开证据。")}</div>
    </section>
  `);
}

function renderEntityDossier(
  snapshot: Snapshot,
  entity: EntitySummary,
  graph: ReturnType<typeof buildEntityEvidenceGraph>,
  insight: ReturnType<typeof entityTrackingInsight>
) {
  const latestItem = graph.items[0];
  const linkedToReport = reportLinkedEntityNames(snapshot).has(entityKey(entity));
  const riskNotes = [
    graph.sourceCounts.size < 2 ? "当前来源覆盖不足两家，不能作为高置信行业结论。" : "已有多来源覆盖，但仍需持续观察是否出现反证或后续修正。",
    graph.statusCounts.needs_review > 0
      ? `${graph.statusCounts.needs_review} 条相关证据仍待复核。`
      : "当前关联证据没有待复核状态，但仍只代表公开快照窗口。"
  ];

  return `
    <section class="panel">
      <div class="section-heading">
        <h2>实体档案</h2>
        <span>${escapeHtml(linkedToReport ? "已关联报告" : "待建立报告路径")}</span>
      </div>
      <dl class="inline-defs">
        ${rail("跟踪理由", publicText(insight.reasons[0] ?? entitySummarySentence(entity)))}
        ${rail("最新变化", latestItem ? publicText(latestItem.title) : "暂无公开变化")}
        ${rail("判断", linkedToReport ? "已有报告引用路径，可用于报告回溯。" : "尚未进入正式报告引用路径，先保持观察。")}
        ${rail("风险/不确定性", riskNotes.join(" "))}
        ${rail("待验证", insight.nextQuestions[0] ?? "等待更多公开来源确认。")}
        ${rail("关联报告", linkedToReport ? "至少一份公开报告或章节可回溯到该实体。" : "暂无公开报告章节直接引用该实体。")}
      </dl>
    </section>
  `;
}

function renderEntityEvidenceItem(item: RetrievalRadarItem) {
  return `<article class="compact-row">
    <div>
      <div class="pill-row">
        ${pill(statusLabel(item.status), statusTone(item.status))}
        ${pill(`综合 ${item.overall_score.toFixed(2)}`, "evidence")}
        ${pill(`置信度 ${formatPercent(item.confidence)}`, "success")}
      </div>
      <h3><a href="${escapeAttr(item.url)}">${escapeHtml(publicText(item.title))}</a></h3>
      <p>${escapeHtml(publicText(item.summary_zh || item.summary_en || "暂无公开摘要。"))}</p>
      <div class="pill-row">${item.categories.map((category) => pill(labelize(category), "evidence")).join("")}${item.tags.slice(0, 4).map((tag) => pill(tag, "neutral")).join("")}</div>
    </div>
    <dl>${rail("来源", item.source_name)}${rail("发布时间", formatDate(item.published_at))}${rail("层级", item.source_tier)}</dl>
  </article>`;
}

function reportLinkedEntityNames(snapshot: Snapshot) {
  const traceItems = snapshotItemsForTraceability(snapshot.radar_items);
  const linked = new Set<string>();

  for (const report of snapshot.reports) {
    const traceability = reportEntityTraceability(snapshotReportTraceDocument(report), traceItems, 20);
    for (const trace of traceability.entityTraces) {
      linked.add(entityKey(trace.entity));
    }
  }

  return linked;
}

function staticEntityDetailSummaries(snapshot: Snapshot, traceItems: RetrievalRadarItem[]) {
  const linked = reportLinkedEntityNames(snapshot);
  const selected = new Map<string, EntitySummary>();

  for (const entity of buildEntitySummaries(traceItems)) {
    if (selected.size < 80 || linked.has(entityKey(entity))) {
      selected.set(entityStaticSlug(entity), entity);
    }
  }

  return [...selected.values()];
}

function entityTypeDistribution(entities: EntitySummary[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    const label = entityTypeLabel(entity.type);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].toSorted((left, right) => right[1] - left[1]);
}

function entityPriorityDistribution(entities: EntitySummary[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    const label = entityTrackingInsight(entity).priorityLabel;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].toSorted((left, right) => right[1] - left[1]);
}

function entitySummarySentence(entity: EntitySummary) {
  if (entity.totalSignals >= 3 && entity.sourceCounts.size >= 2) {
    return `已在 ${entity.totalSignals} 条公开信号和 ${entity.sourceCounts.size} 个来源中重复出现，适合进入报告路径跟踪。`;
  }

  if (entity.sourceCounts.size < 2) {
    return "当前主要集中在单一来源家族，需要第二个独立公开来源确认。";
  }

  return "已出现在公开证据中，但还需要更强重复性才能成为主要报告主题。";
}

function entityKey(entity: Pick<EntitySummary, "name" | "type">) {
  return `${entity.type}:${entity.name.trim().toLowerCase()}`;
}

function entityStaticSlug(entity: Pick<EntitySummary, "name" | "type">) {
  const slug = encodeURIComponent(entityRouteId(entity)).replace(/%/g, "_").replace(/[. ]+$/g, "");
  return slug || "entity";
}

function entityTypeLabel(type: string) {
  const labels: Record<string, string> = {
    company: "公司",
    model: "模型",
    other: "其他",
    paper: "论文",
    product: "产品",
    project: "项目",
    repository: "仓库"
  };
  return labels[type] ?? labelize(type);
}

function priorityTone(score: number): "caution" | "evidence" | "neutral" | "success" {
  if (score >= 80) return "success";
  if (score >= 55) return "evidence";
  return "neutral";
}

function watchTone(label: string): "caution" | "evidence" | "neutral" | "success" {
  if (label === "先复核") return "caution";
  if (label === "报告候选") return "evidence";
  return "neutral";
}

function renderRadarItem(item: SnapshotItem, snapshot: Snapshot) {
  const family = sourceFamily(item);
  const search = [item.title, item.source_name, item.status, item.categories.join(" "), item.tags.join(" "), item.summary_en, item.summary_zh].join(" ").toLowerCase();
  const timestamp = item.published_at ?? item.collected_at;
  const freshness = freshnessBucket(timestamp);
  const relatedEvent = snapshot.event_clusters.find((event) => event.related_item_ids.includes(item.id));
  const summary = item.summary_zh?.trim() || relatedEvent?.summary_zh?.trim() || "";

  return `<article class="radar-row" data-category="${escapeAttr(`${item.categories.join(" ")} ${item.categories.map(labelize).join(" ")}`)}" data-family="${escapeAttr(family)}" data-freshness="${freshness}" data-search="${escapeAttr(search)}" data-status="${escapeAttr(item.status)}">
    <div class="story-time"><time>${escapeHtml(feedTime(timestamp, "zh"))}</time><span></span></div>
    <div class="story-content"><div class="story-meta"><span>${escapeHtml(item.source_name)}</span><strong>${Math.round(item.scores.overall * 100)}</strong></div><h2><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></h2>${summary ? `<p>${escapeHtml(summary)}</p>` : ""}<div class="story-foot"><span>${escapeHtml(item.categories.map(labelize).slice(0, 2).join(" · "))}</span><span>${escapeHtml(statusLabel(item.status))}</span></div></div>
  </article>`;
}



function snapshotItemsForTraceability(items: SnapshotItem[]): RetrievalRadarItem[] {
  return items.map((item) => ({
    ai_relevance_score: item.scores.ai_relevance,
    categories: item.categories as RetrievalRadarItem["categories"],
    collected_at: item.collected_at,
    confidence: item.confidence,
    credibility_score: item.scores.credibility,
    entities: (item.entities ?? []).map((entity) => ({
      confidence: entity.confidence,
      name: entity.name,
      type: entity.type
    })),
    evidence_notes: [],
    freshness_score: item.scores.freshness,
    id: item.id,
    importance_score: item.scores.importance,
    language: item.language as RetrievalRadarItem["language"],
    novelty_score: item.scores.novelty,
    overall_score: item.scores.overall,
    processed_at: item.processed_at,
    published_at: item.published_at,
    // 仅用于静态报告/实体追溯的内部 fallback；public snapshot 和 public_radar_items 不公开 raw item identifiers。
    raw_item_id: item.id,
    source_id: item.source_name,
    source_name: item.source_name,
    source_tier: item.source_tier,
    source_weight: 1,
    status: item.status,
    summary_en: item.summary_en ?? "",
    summary_zh: item.summary_zh ?? "",
    tags: item.tags,
    title: item.title,
    url: item.url,
    why_it_matters: item.why_it_matters
  }));
}

function snapshotReportTraceDocument(report: SnapshotReport): ReportTraceDocument {
  return {
    citations: report.citations.map((citation) => ({
      id: citation.id,
      source_name: citation.source_name,
      title: citation.title,
      url: citation.url
    })),
    missing_evidence: report.missing_evidence,
    sections: report.sections.map((section, index) => ({
      citations: section.citations,
      id: `section-${index}-${section.title}`,
      missing_evidence: [],
      title: section.title
    })),
    source_item_ids: Array.isArray(report.source_item_ids) ? report.source_item_ids : []
  };
}





void renderEnglishEntities;
void renderEntities;
void renderEntityDetail;
void staticEntityDetailSummaries;



function latestReportsByType(snapshotOrReports: Snapshot | SnapshotReport[]) {
  const reports = Array.isArray(snapshotOrReports) ? snapshotOrReports : snapshotOrReports.reports;
  const reportsByType = new Map<string, SnapshotReport>();
  for (const report of [...reports].sort(compareSnapshotReports)) {
    if (!reportsByType.has(report.report_type)) {
      reportsByType.set(report.report_type, report);
    }
  }
  return ["daily", "weekly"].flatMap((type) => {
    const report = reportsByType.get(type);
    return report ? [report] : [];
  });
}

function compareSnapshotReports(left: SnapshotReport, right: SnapshotReport) {
  const time = reportTime(right) - reportTime(left);
  if (time !== 0) return time;

  return reportDisplayPriority(right) - reportDisplayPriority(left);
}

function reportDisplayPriority(report: SnapshotReport) {
  if (report.mode === "saved_report" && report.status === "published") {
    return 40;
  }

  if (report.mode === "saved_report" && report.status === "reviewed") {
    return 30;
  }

  if (report.mode === "saved_candidate" && report.status === "approved") {
    return 20;
  }

  return 0;
}

function reportTime(report: SnapshotReport) {
  const value = Date.parse(report.saved_at ?? report.generated_at ?? report.time_window.end);
  return Number.isFinite(value) ? value : 0;
}

function countSourceFamilies(items: SnapshotItem[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const family = sourceFamily(item);
    counts[family] = (counts[family] ?? 0) + 1;
    return counts;
  }, {});
}

function sourceFamily(item: Pick<SnapshotItem, "source_family" | "source_name" | "url" | "source_tier">) {
  if (item.source_family) return item.source_family;

  return sourceFamilyForEvent({
    source_id: "",
    source_name: item.source_name,
    source_tier: item.source_tier,
    url: item.url
  });
}

function chineseProductText(value: string | undefined, fallback: string) {
  const localized = publicText(value ?? "").trim();
  return /[\u3400-\u9fff]/.test(localized) ? localized : fallback;
}

function chineseEventSummary(event: SnapshotEvent) {
  return chineseProductText(
    event.summary_zh,
    `该事件汇集 ${event.related_item_ids.length} 条公开信号，当前覆盖 ${event.source_count} 个来源；请结合时间线和引用核对。`
  );
}

function humanizeChineseHeadline(value: string) {
  let headline = value.trim().replace(/^据报道[，,]\s*/u, "");
  const release = headline.match(/^(.{2,20}?)发布了?([^，,]+)[，,]一种([^，,]+)[，,]/u);
  if (release) {
    headline = `${release[1]}发布${release[2]}：${release[3].replace(/的系统$/u, "")}`;
  }

  const namedTechnique = headline.match(/^(.{2,24}?)\s*开发了一种名为“([^”]+)”的技术[，,](.+)$/u);
  if (namedTechnique) {
    const finding = namedTechnique[3].split(/[，,]/u)[0].replace(/^首次清晰揭示了?/u, "揭示");
    headline = `${namedTechnique[1]}用“${namedTechnique[2]}”${finding}`;
  }

  const tutorial = headline.match(/^(.{2,20}?)发布了?关于(.+?)的教程$/u);
  if (tutorial) headline = `${tutorial[1]}发布${tutorial[2]}教程`;

  const lawsuit = headline.match(/^(.+?)起诉(.+?)[，,]指控其在招聘面试中要求.+?员工携带未发布的硬件组件和样品/u);
  if (lawsuit) headline = `${lawsuit[1]}起诉${lawsuit[2]}：指控其面试时索要未发布硬件样品`;

  const survey = headline.match(/^(.+?)对(\d+)家企业调查发现[，,](.+)$/u);
  if (survey) headline = `${survey[1].replace(/\s+Pulse Research$/iu, "")}对${survey[2]}家企业调查：${survey[3].split(/[，,：:]/u)[0]}`;

  const product = headline.match(/^(.{2,20}?)推出了?([^，,]+)[，,]这是一个由(.+?)驱动的AI工具/u);
  if (product) headline = `${product[1]}推出${product[2]}：由${product[3]}驱动`;

  return headline.replace(/发布了/u, "发布").replace(/推出了/u, "推出");
}

function chineseEventTitle(event: SnapshotEvent) {
  const canonical = publicText(event.canonical_title).trim();
  const compact = compactChineseEventTitle(event, canonical, chineseEventSummary(event));
  if (compact) return compact;
  if (/\p{Script=Han}/u.test(canonical)) return canonical;

  const sentence = humanizeChineseHeadline(chineseEventSummary(event).replace(/\s+/g, " ").split(/[。！？]/u)[0]?.trim() ?? "");
  return shortenChineseTitle(sentence || canonical);
}

function compactChineseEventTitle(event: SnapshotEvent, canonical: string, summary: string) {
  const text = `${canonical} ${summary}`;
  const entities = event.related_entities.map((entity) => entity.trim()).filter(Boolean);
  const mainEntity = entities.find((entity) => /OpenAI|Anthropic|Google|DeepMind|Meta|Microsoft|NVIDIA|DeepSeek|Qwen|Kimi|Claude|Gemini|GPT|Codex|Apple/i.test(entity)) ?? entities[0];
  const product = entities.find((entity) => /GPT-Red|Codex Micro|Claude|Gemini|DeepSeek|Qwen|Kimi|Jacobian|workspace|keyboard/i.test(entity));

  if (/GPT-Red/i.test(text)) return "OpenAI 发布 GPT-Red 红队系统";
  if (/Codex Micro|keyboard|键盘/i.test(text)) return "OpenAI 推出 Codex 硬件键盘";
  if (/Jacobian|hidden space|global workspace|雅可比|全局工作空间/i.test(text)) return "Anthropic 披露 Claude 内部表征研究";
  if (/lawsuit|起诉|法律纠纷|trade secret|商业机密/i.test(text) && mainEntity) return `${mainEntity} 相关 AI 法律纠纷升级`;
  if (/release|launch|发布|推出|上线/i.test(text) && mainEntity && product && mainEntity !== product) return shortenChineseTitle(`${mainEntity} 发布 ${product}`);
  if (/benchmark|基准/i.test(text) && mainEntity) return shortenChineseTitle(`${mainEntity} 基准/评测更新`);
  if (/research|paper|研究|论文/i.test(text) && mainEntity) return shortenChineseTitle(`${mainEntity} 发布研究进展`);

  return "";
}

function shortenChineseTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").replace(/[。！？；].*$/u, "").trim();
  return normalized.length > 34 ? `${normalized.slice(0, 33)}…` : normalized;
}

function freshnessBucket(timestamp: string) {
  const ageMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ageMs)) return "unknown";
  if (ageMs <= 86_400_000) return "24h";
  if (ageMs <= 604_800_000) return "7d";
  if (ageMs <= 2_592_000_000) return "30d";
  return "archive";
}







function distribution(title: string, entries: Array<[string, number]>) {
  return `<section><h3>${escapeHtml(title)}</h3><div class="tag-block">${entries.map(([label, value]) => pill(`${labelize(label)} ${value}`, "neutral")).join("")}</div></section>`;
}



function sourceHealthPanel(snapshot: Snapshot) {
  const health = snapshot.source_health_summary;

  return `<section class="panel">
    <div class="section-heading">
      <h2>信息源健康摘要</h2>
      <span>最近广泛刷新截至 ${escapeHtml(formatDate(snapshot.source_health_scope.finished_at ?? snapshot.coverage.latest_refresh))}</span>
    </div>
    <dl class="metric-grid">
      ${metric("来源总数", snapshot.coverage.sources_total)}
      ${metric("自动合格来源", snapshot.coverage.automated_eligible_sources)}
      ${metric("广泛刷新尝试源", snapshot.source_health_scope.attempted_sources)}
      ${metric("广泛刷新成功源", health.succeeded)}
      ${metric("广泛刷新失败源", health.failed)}
      ${metric("手动/阻塞源", health.manual_blocked)}
      ${metric("超时失败", health.timeout)}
      ${metric("HTTP 403 失败", health["403"])}
      ${metric("限流警告（可重叠）", health.rate_limit)}
      ${metric("无新内容", health.no_items)}
      ${metric("仅重复", health.duplicate_only)}
    </dl>
    <div class="distribution">
      ${distribution("失败/警告/排除（类别可重叠）", Object.entries(snapshot.failure_family_summary))}
      ${distribution("跳过/阻塞", [["手动阻塞", health.manual_blocked], ["不支持", health.unsupported_source], ["低相关排除", health.low_relevance_excluded]])}
    </div>
    ${sourceFailureList(snapshot)}
    ${sourceHealthFamilyMatrix(snapshot)}
  </section>`;
}

function sourceFailureList(snapshot: Snapshot) {
  const failures = snapshot.source_health_failures ?? [];
  if (failures.length === 0) return `<p class="note">审计广泛刷新中没有具名失败来源。</p>`;
  return `<div class="row-list"><h3>审计广泛刷新的失败来源</h3>${failures.map((failure) => `<div class="compact-row"><strong>${escapeHtml(failure.source_name)}</strong><span>${escapeHtml(`${sourceFamilyLabel(failure.source_family)} / ${labelize(failure.reason)}`)}</span></div>`).join("")}</div>`;
}

function sourceHealthFamilyMatrix(snapshot: Snapshot) {
  const rows = snapshot.source_health_by_family ?? [];
  if (rows.length === 0) {
    return `<p class="note">当前快照暂无来源家族健康矩阵。</p>`;
  }

  return `<div class="health-table-wrap"><table class="health-table"><caption>最近一次广泛刷新按来源家族汇总；失败、警告和排除列可能重叠。</caption><thead><tr><th>来源家族</th><th>配置</th><th>自动合格</th><th>尝试</th><th>成功</th><th>失败</th><th>超时</th><th>403</th><th>限流</th><th>无内容</th><th>仅重复</th><th>手动阻塞</th><th>不支持</th><th>低相关</th></tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${escapeHtml(sourceFamilyLabel(row.family))}</th>${[row.configured, row.automated_eligible, row.attempted, row.succeeded, row.failed, row.timeout, row["403"], row.rate_limit, row.no_items, row.duplicate_only, row.manual_blocked, row.unsupported_source, row.low_relevance_excluded].map((value) => `<td>${value.toLocaleString("en-US")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function sourceFamilyLabel(family: string) {
  switch (family) {
    case "official_company": return "公司/实验室";
    case "specialist_analysis": return "分析/媒体";
    case "arxiv_research": return "研究订阅";
    case "github_open_source": return "开源项目";
    case "podcast_video": return "播客/视频";
    default: return labelize(family);
  }
}

function metric(label: string, value: number | null) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${value === null ? "待补" : value.toLocaleString("en-US")}</dd></div>`;
}



function rail(label: string, value: string | number | null) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value ?? "待补"))}</dd>`;
}

function option(value: string, label: string) {
  return `<option value="${escapeAttr(value)}">${escapeHtml(labelize(label))}</option>`;
}

function pill(label: string, tone: "caution" | "evidence" | "neutral" | "success") {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

function sourceLabel(value?: string | null) {
  if (!value) return "公开数据源";

  const labels: Record<string, string> = {
    local_generated_files: "本地生成数据",
    local_seed_data: "种子数据",
    public_radar_items: "公开结构化数据",
    supabase_radar_items: "公开结构化数据"
  };

  if (labels[value]) return labels[value];
  if (value.startsWith("supabase_")) return "公开结构化数据";
  if (value.startsWith("public_")) return "公开数据源";
  if (value.startsWith("local_")) return "本地数据";

  return labelize(value);
}

function tabButton(id: string, label: string, selected = false) {
  return `<button aria-controls="radar-panel-${escapeAttr(id)}" aria-selected="${selected ? "true" : "false"}" class="tab-button${selected ? " active" : ""}" data-tab-target="${escapeAttr(id)}" id="radar-tab-${escapeAttr(id)}" role="tab" tabindex="${selected ? "0" : "-1"}" type="button">${escapeHtml(label)}</button>`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "已批准",
    draft: "草稿",
    excluded: "已排除",
    failed: "失败",
    included: "已纳入",
    needs_review: "待复核",
    published: "已发布",
    reviewed: "已复核"
  };
  return labels[status] ?? status;
}

function reportTypeLabel(type: string) {
  if (type === "daily") return "日报";
  if (type === "weekly") return "周报";
  return type;
}







function eventConfirmationFilterValue(event: SnapshotEvent) {
  if (event.source_count > 1 && event.source_families.length > 1) return "cross";
  if (event.source_count > 1) return "same";
  return "single";
}



function eventStatus(event: SnapshotEvent, snapshot: Snapshot) {
  const relatedIds = new Set(event.related_item_ids);
  const statuses = new Set(snapshot.radar_items.filter((item) => relatedIds.has(item.id)).map((item) => item.status));
  if (statuses.has("needs_review")) return "needs_review";
  if (statuses.has("included")) return "included";
  if (statuses.has("failed")) return "failed";
  if (statuses.has("excluded")) return "excluded";
  return "included";
}

function statusTone(status: string): "caution" | "evidence" | "neutral" | "success" {
  if (status === "included" || status === "needs_review") return status === "included" ? "success" : "caution";
  if (status === "needs_review" || status === "draft") return "caution";
  return "neutral";
}



function noteList(items: string[]) {
  return `<ul class="note-list">${items.map((item) => `<li>${escapeHtml(publicText(item))}</li>`).join("")}</ul>`;
}

function empty(message: string) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function labelize(value: string) {
  const labels: Record<string, string> = {
    agent: "智能体",
    attempted: "已尝试",
    benchmark: "基准",
    business: "商业",
    daily: "日报",
    draft: "草稿",
    eligible: "自动合格",
    excluded: "已排除",
    failed: "失败",
    funding: "融资",
    infrastructure: "基础设施",
    included: "已纳入",
    media_interview: "媒体/访谈",
    manual_blocked: "手动/阻塞",
    "model release": "模型发布",
    model_release: "模型发布",
    needs_review: "待复核",
    no_items: "无新内容",
    no_new_items: "无新内容",
    opinion: "观点",
    "open source": "开源",
    open_source: "开源",
    other: "其他",
    policy: "政策",
    "product update": "产品更新",
    product_update: "产品更新",
    research: "研究",
    regulation: "监管",
    rate_limit: "限流警告",
    safety: "安全",
    timeout: "超时失败",
    tooling: "工具",
    total: "总数",
    unsupported_source: "不支持",
    low_relevance_excluded: "低相关排除",
    duplicate_only: "仅重复",
    blocked_requires_manual: "需手动处理",
    failed_403: "HTTP 403 失败",
    failed_parse: "解析失败",
    failed_rate_limit: "限流失败",
    failed_timeout: "超时失败",
    "403": "HTTP 403",
    weekly: "周报"
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function publicText(value: string) {
  return value
    .replace(
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "此页面是公开只读情报快照，不提供账号、后台操作或写入能力。"
    )
    .replace(
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      "只纳入可公开引用的雷达和报告字段；私有原文、内部备注和凭据均不展示。"
    )
    .replace(
      "Snapshot data came from Supabase public-safe read views using anon read access.",
      "快照数据来自公开只读证据视图。"
    )
    .replace(
      "Radar rows came from Supabase public-safe read views. Report candidates are projected to the same public-safe field allowlist during export.",
      "雷达条目和报告摘要使用同一组公开可读字段。"
    )
    .replace(
      "Full article text or original announcements are needed beyond metadata-level evidence.",
      "除了元数据级证据外，仍需要完整文章正文或原始公告。"
    )
    .replace(
      "Read-only Supabase public radar retrieval was used; no Supabase write path ran.",
      "使用公开证据库进行检索；只展示可公开引用的结构化字段。"
    )
    .replace(
      "This surface shows available AI Radar evidence only; it is not a claim of complete current AI industry coverage.",
      "此页面只展示当前可用的 AI 行业雷达证据，不声称覆盖完整的实时 AI 行业。"
    )
    .replace("This is a deterministic preview, not a published report.", "这是证据预览，不是已发布报告。")
    .replace(
      "No live DeepSeek call, Supabase write, or scheduled persistence job was run.",
      "报告基于当前已入库证据，仍需人工复核后发布。"
    )
    .replace(
      "Supabase coverage depends on rows already persisted into the public retrieval view.",
      "覆盖范围取决于已经进入公开证据视图的条目。"
    )
    .replace(
      "The preview has fewer than 3 usable items, so report synthesis should remain narrow.",
      "该预览少于 3 条可用条目，因此报告综合应保持收窄。"
    )
    .replace(
      "No usable item in this window is marked included; report language must remain provisional.",
      "该时间窗口内没有标记为已纳入的可用条目，报告措辞必须保持暂定。"
    )
    .replace(
      "More independent items are needed for a broad daily or weekly synthesis.",
      "需要更多独立条目才能形成宽口径日报或周报综合。"
    )
    .replace(
      "Report quality gate did not pass; keep this candidate in needs_review until more data is available.",
      "报告质量门禁未通过；在补充更多数据前，该候选应保持待复核。"
    )
    .replace(/usable_items (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 条可用条目低于${reportTypeLabel(type)}最低要求 ${minimum} 条`)
    .replace(/citations (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 条引用低于${reportTypeLabel(type)}最低要求 ${minimum} 条`)
    .replace(/distinct_sources (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 个独立来源低于${reportTypeLabel(type)}最低要求 ${minimum} 个`)
    .replace(/categories (\d+) is below (daily|weekly) minimum (\d+)/g, (_, count: string, type: string, minimum: string) => `${count} 个类别低于${reportTypeLabel(type)}最低要求 ${minimum} 个`)
    .replace(
      "Human review is needed before treating any item as confirmed.",
      "任何条目在视为确认前都需要人工复核。"
    )
    .replace(
      "No retrieved radar items in this window support this section.",
      "该时间窗口内没有检索到可支撑本章节的雷达条目。"
    )
    .replace(
      "No usable radar evidence currently supports this section.",
      "当前没有可用雷达证据支撑本章节。"
    )
    .replace(/Weekly AI Radar preview - ending /g, "AI 行业雷达周报预览 - 截至 ")
    .replace(/Daily AI Radar preview - /g, "AI 行业雷达日报预览 - ")
    .replace(/^Potentially relevant AI signal for review: /, "可能相关的待复核 AI 信号：")
    .replace(/^May affect model capability tracking and product benchmarking: /, "可能影响模型能力跟踪和产品基准：")
    .replace(/Deterministic daily preview from (\d+) usable radar item\(s\)\./g, "日报证据预览基于 $1 条可用雷达条目。")
    .replace(/Deterministic weekly preview from (\d+) usable radar item\(s\)\./g, "周报证据预览基于 $1 条可用雷达条目。")
    .replace(/(\d+) included and (\d+) needs_review item\(s\)\./g, "$1 条已纳入，$2 条待复核。")
    .replace(
      /(\d+) item\(s\) are marked needs_review and require human confirmation before confident synthesis\./g,
      "$1 条标记为待复核，需要人工确认后才能进行高置信综合。"
    )
    .replace(/(\d+) radar item\(s\) matched this section\./g, "$1 条雷达条目匹配本章节。")
    .replace(/(\d+) still need review\./g, "$1 条仍需复核。")
    .replace(/Model \/ product \/ company updates/g, "模型/产品/公司更新")
    .replace(/Research \/ open-source/g, "研究/开源")
    .replace(/Agents \/ products/g, "智能体/产品")
    .replace(/Business \/ ecosystem/g, "商业/生态")
    .replace(/Weak signals \/ needs_review/g, "弱信号/待复核")
    .replace(/needs_review/g, "待复核")
    .replace(/included/g, "已纳入")
    .replace(/Visible categories: ([^.]+)\./g, (_, categories: string) => {
      return `可见类别： ${categories
        .split(",")
        .map((category) => labelize(category.trim()))
        .join("、")}。`;
    })
    .replace(/Visible categories:/g, "可见类别：")
    .replace(/Top visible signal:/g, "最高可见信号：")
    .replace(/(最高可见信号：[^.。]+) from ([^.。]+)([.。])/g, "$1 来自 $2$3")
    .replace(/Deterministic daily preview/g, "日报证据预览")
    .replace(/Deterministic weekly preview/g, "周报证据预览")
    .replace(/usable radar item\(s\)/g, "条可用雷达条目")
    .replace(/usable item\(s\)/g, "条可用条目")
    .replace(/radar item\(s\)/g, "条雷达条目");
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}



function snapshotCuratedTitle(snapshot: Snapshot) {
  return curatedWindowIsCurrent(snapshot) ? "今日行业精选" : "本轮行业精选";
}

function snapshotWindowLabel(snapshot: Snapshot) {
  return curatedWindowIsCurrent(snapshot) ? "今天" : "最近更新中";
}

function snapshotPeriodLabel(snapshot: Snapshot) {
  return curatedWindowIsCurrent(snapshot) ? "过去 24 小时" : "最近一轮更新中";
}

function compareHomepageEvents(left: SnapshotEvent, right: SnapshotEvent) {
  return right.event_score - left.event_score ||
    Number(right.source_families.length > 1) - Number(left.source_families.length > 1) ||
    right.source_count - left.source_count ||
    Date.parse(right.latest_seen_at) - Date.parse(left.latest_seen_at) ||
    left.canonical_title.localeCompare(right.canonical_title, "zh-CN");
}

function curatedWindowIsCurrent(snapshot: Snapshot) {
  const generatedAt = Date.parse(snapshot.generated_at);
  const topEvents = snapshot.curated_events.toSorted(compareHomepageEvents).slice(0, 3);
  if (!Number.isFinite(generatedAt) || topEvents.length === 0) return false;

  return topEvents.every((event) => {
    const eventTime = Date.parse(event.latest_seen_at);
    if (!Number.isFinite(eventTime)) return false;
    const age = generatedAt - eventTime;
    return age >= -5 * 60 * 1000 && age <= 24 * 60 * 60 * 1000;
  });
}

function publicVersion(snapshot: Snapshot) {
  const provenance = resolveBuildProvenance();
  return {
    product: "AI Industry Radar",
    release: "final-release-candidate-event-radar",
    commit_sha: provenance.commitSha,
    commit_source: provenance.commitSource,
    working_tree_clean: provenance.workingTreeClean,
    generated_at: snapshot.generated_at,
    latest_evidence_at: snapshot.freshness.latest_timestamp,
    public_radar_items: snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items,
    event_count: snapshot.event_count,
    source: snapshot.source.data_source
  };
}

function resolveBuildProvenance() {
  const environmentCommit = [
    { source: "cloudflare", value: process.env.CF_PAGES_COMMIT_SHA?.trim() ?? "" },
    { source: "github", value: process.env.GITHUB_SHA?.trim() ?? "" }
  ].find((candidate) => /^[0-9a-f]{40}$/i.test(candidate.value));

  let gitSha = "";
  let workingTreeClean: boolean | null = null;
  try {
    gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    workingTreeClean = status.length === 0;
  } catch {
    gitSha = "";
  }

  if (environmentCommit) {
    return {
      commitSha: environmentCommit.value,
      commitSource: environmentCommit.source,
      workingTreeClean
    };
  }

  if (/^[0-9a-f]{40}$/i.test(gitSha)) {
    return {
      commitSha: gitSha,
      commitSource: "git_worktree",
      workingTreeClean
    };
  }

  return {
    commitSha: "unavailable",
    commitSource: "unavailable",
    workingTreeClean
  };
}



function snapshotIsStale(snapshot: Snapshot) {
  const ageDays = snapshotAgeDays(snapshot);
  return ageDays === null || ageDays > 2;
}

function snapshotAgeDays(snapshot: Snapshot) {
  const latest = snapshot.freshness?.latest_timestamp;
  if (!latest) return null;

  const latestDate = new Date(latest);
  const generatedAt = snapshot.generated_at ? new Date(snapshot.generated_at) : new Date();
  const now = Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt;

  if (Number.isNaN(latestDate.getTime())) return null;
  return Math.max(0, Math.ceil((now.getTime() - latestDate.getTime()) / (24 * 60 * 60 * 1000)));
}

function freshnessAlert(snapshot: Snapshot, suffix = "") {
  const latest = snapshot.freshness?.latest_timestamp;
  const snapshotGeneratedAt = snapshot.generated_at ? new Date(snapshot.generated_at) : new Date();
  const now = Number.isNaN(snapshotGeneratedAt.getTime()) ? new Date() : snapshotGeneratedAt;

  if (!latest) {
    const message = `当前公开内容没有可验证的发布时间；请只把页面当作历史证据索引。${suffix ? ` ${suffix}` : ""}`;
    return `<section class="freshness-alert"><strong>内容时效提示</strong><p>${escapeHtml(message)}</p></section>`;
  }

  const latestDate = new Date(latest);
  if (Number.isNaN(latestDate.getTime())) return "";

  const ageDays = snapshotAgeDays(snapshot) ?? Math.max(0, Math.ceil((now.getTime() - latestDate.getTime()) / (24 * 60 * 60 * 1000)));
  if (ageDays <= 2) return "";

  const message = `当前公开内容发布时间最新到 ${formatDate(latest)}，距快照生成时间约 ${ageDays} 天；本页不能代表今日实时 AI 行业覆盖。${suffix ? ` ${suffix}` : ""}`;
  return `<section class="freshness-alert"><strong>内容时效提示</strong><p>${escapeHtml(message)}</p></section>`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "待补证据";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(date)} UTC`;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string) {
  return escapeHtml(value);
}

function filterScript(locale: "en" | "zh" = "zh") {
  const groupedCategoryLabel = locale === "en" ? "Current group: " : "当前分组：";
  const categoryLabels = locale === "en"
    ? {
        agent: "Agents",
        benchmark: "Benchmarks",
        business: "Business",
        funding: "Funding",
        infrastructure: "Infrastructure",
        media_interview: "Media / interview",
        model_release: "Model release",
        open_source: "Open source",
        opinion: "Opinion",
        other: "Other",
        policy: "Policy",
        product_update: "Product update",
        regulation: "Regulation",
        research: "Research",
        safety: "Safety",
        tooling: "Developer tooling"
      }
    : {
        agent: "智能体",
        benchmark: "基准",
        business: "商业",
        funding: "融资",
        infrastructure: "基础设施",
        media_interview: "媒体/访谈",
        model_release: "模型发布",
        open_source: "开源",
        opinion: "观点",
        other: "其他",
        policy: "政策",
        product_update: "产品更新",
        regulation: "监管",
        research: "研究",
        safety: "安全",
        tooling: "开发工具"
      };
  return `
const search = document.querySelector("#radar-search");
const status = document.querySelector("#radar-status");
const category = document.querySelector("#radar-category");
const family = document.querySelector("#radar-family");
const score = document.querySelector("#radar-score");
const freshness = document.querySelector("#radar-freshness");
const sourceCount = document.querySelector("#radar-source-count");
const resultCount = document.querySelector("#radar-result-count");
const reset = document.querySelector("#radar-reset");
const rows = Array.from(document.querySelectorAll(".radar-row"));
const eventCards = Array.from(document.querySelectorAll(".event-card"));
const tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
const filterPanel = document.querySelector("[data-radar-filters]");
const filterToggle = document.querySelector("#radar-filter-toggle");
const params = new URLSearchParams(window.location.search);
let initialCategories = parseCategoryFilter(params.get("category") || "");
const initialStatus = (params.get("status") || "").toLowerCase();
const requestedTab = (params.get("tab") || "curated").toLowerCase();
search.value = params.get("q") || "";
if (initialCategories.length === 1) {
  const option = Array.from(category.options).find((candidate) => candidate.value.toLowerCase() === initialCategories[0]);
  if (option) {
    category.value = option.value;
  } else {
    const singleCategoryOption = document.createElement("option");
    singleCategoryOption.value = initialCategories[0];
    singleCategoryOption.textContent = categoryDisplayLabel(initialCategories[0]);
    category.insertBefore(singleCategoryOption, category.options[1] || null);
    category.value = singleCategoryOption.value;
  }
} else if (initialCategories.length > 1) {
  const groupedOption = document.createElement("option");
  groupedOption.value = initialCategories.join(",");
  groupedOption.textContent = ${JSON.stringify(groupedCategoryLabel)} + initialCategories.map(categoryDisplayLabel).join(" + ");
  category.insertBefore(groupedOption, category.options[1] || null);
  category.value = groupedOption.value;
}
if (initialStatus && Array.from(status.options).some((candidate) => candidate.value === initialStatus)) {
  status.value = initialStatus;
}
for (const [control, key] of [[family, "family"], [score, "score"], [freshness, "freshness"], [sourceCount, "sources"]]) {
  const value = params.get(key) || "";
  if (value && Array.from(control.options).some((candidate) => candidate.value === value)) control.value = value;
}
function parseCategoryFilter(value) {
  return value
    .toLowerCase()
    .split(",")
    .map((candidate) => candidate.trim().replace(/[\\s-]+/g, "_"))
    .filter((candidate) => candidate && candidate !== "all");
}
function categoryDisplayLabel(value) {
  const labels = ${JSON.stringify(categoryLabels)};
  return labels[value] || value.replace(/_/g, " ");
}
function selectedCategoryValues() {
  if (category.value !== "all") return parseCategoryFilter(category.value);
  return initialCategories;
}
function matchesCategoryFilter(categoryText, selectedCategories) {
  if (selectedCategories.length === 0) return true;
  const text = (categoryText || "").toLowerCase();
  return selectedCategories.some((selectedCategory) => text.includes(selectedCategory));
}
function updateResultCount() {
  const activePanel = tabPanels.find((panel) => !panel.hidden);
  if (!activePanel || !resultCount) return;
  const candidates = Array.from(activePanel.querySelectorAll(".event-card, .radar-row"));
  if (candidates.length === 0) {
    resultCount.textContent = ${JSON.stringify(locale === "en" ? "Filters apply to event and signal views." : "筛选仅作用于事件与信号视图。")};
    return;
  }
  const visible = candidates.filter((candidate) => !candidate.hidden).length;
  resultCount.textContent = ${JSON.stringify(locale === "en" ? "Visible results: " : "当前结果：")} + visible + " / " + candidates.length;
}
function applyFilters() {
  const query = (search.value || "").toLowerCase();
  const selectedStatus = status.value;
  const selectedCategories = selectedCategoryValues();
  const selectedFamily = family.value;
  const selectedScore = score.value;
  const selectedFreshness = freshness.value;
  const selectedSourceCount = sourceCount.value;
  for (const card of eventCards) {
    const matchesQuery = !query || card.dataset.search.includes(query);
    const matchesStatus = selectedStatus === "all" || card.dataset.status === selectedStatus;
    const matchesCategory = matchesCategoryFilter(card.dataset.category, selectedCategories);
    const matchesFamily = selectedFamily === "all" || card.dataset.family.includes(selectedFamily);
    const matchesScore = selectedScore === "all" || card.dataset.score === selectedScore;
    const matchesFreshness = selectedFreshness === "all" || card.dataset.freshness === selectedFreshness;
    const matchesSourceCount = selectedSourceCount === "all" || card.dataset.sourceCount === selectedSourceCount;
    card.hidden = !(matchesQuery && matchesStatus && matchesCategory && matchesFamily && matchesScore && matchesFreshness && matchesSourceCount);
  }
  for (const row of rows) {
    const matchesQuery = !query || row.dataset.search.includes(query);
    const matchesStatus = selectedStatus === "all" || row.dataset.status === selectedStatus;
    const matchesCategory = matchesCategoryFilter(row.dataset.category, selectedCategories);
    const matchesFamily = selectedFamily === "all" || row.dataset.family === selectedFamily;
    const matchesFreshness = selectedFreshness === "all" || row.dataset.freshness === selectedFreshness;
    row.hidden = !(matchesQuery && matchesStatus && matchesCategory && matchesFamily && matchesFreshness);
  }
  updateResultCount();
}
function updateFilterUrl() {
  const next = new URLSearchParams(window.location.search);
  if (category.value !== "all") next.set("category", category.value);
  else if (initialCategories.length > 0) next.set("category", initialCategories.join(","));
  else next.delete("category");
  if (status.value === "all") next.delete("status"); else next.set("status", status.value);
  if (family.value === "all") next.delete("family"); else next.set("family", family.value);
  if (score.value === "all") next.delete("score"); else next.set("score", score.value);
  if (freshness.value === "all") next.delete("freshness"); else next.set("freshness", freshness.value);
  if (sourceCount.value === "all") next.delete("sources"); else next.set("sources", sourceCount.value);
  if (search.value.trim()) next.set("q", search.value.trim()); else next.delete("q");
  const query = next.toString();
  window.history.replaceState(null, "", query ? "?" + query : window.location.pathname);
}
[search, status, family, score, freshness, sourceCount].forEach((control) => control.addEventListener("input", () => {
  updateFilterUrl();
  applyFilters();
}));
category.addEventListener("input", () => {
  initialCategories = [];
  updateFilterUrl();
  applyFilters();
});
reset.addEventListener("click", () => {
  search.value = "";
  status.value = "all";
  category.value = "all";
  family.value = "all";
  score.value = "all";
  freshness.value = "all";
  sourceCount.value = "all";
  initialCategories = [];
  updateFilterUrl();
  applyFilters();
  search.focus();
});
if (filterPanel && filterToggle) {
  filterToggle.addEventListener("click", () => {
    const expanded = filterPanel.classList.toggle("filters-open");
    filterToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  });
}
function activateTab(target, persist) {
  const selectedButton = tabButtons.find((candidate) => candidate.dataset.tabTarget === target) || tabButtons[0];
  if (!selectedButton) return;
  const selectedTarget = selectedButton.dataset.tabTarget;
  for (const candidate of tabButtons) {
    const active = candidate === selectedButton;
    candidate.classList.toggle("active", active);
    candidate.setAttribute("aria-selected", active ? "true" : "false");
    candidate.setAttribute("tabindex", active ? "0" : "-1");
  }
  for (const panel of tabPanels) {
    const active = panel.dataset.tabPanel === selectedTarget;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  }
  if (filterPanel) filterPanel.hidden = selectedTarget === "timeline" || selectedTarget === "health";
  if (persist) {
    const next = new URLSearchParams(window.location.search);
    if (selectedTarget === "curated") next.delete("tab"); else next.set("tab", selectedTarget);
    const query = next.toString();
    window.history.replaceState(null, "", query ? "?" + query : window.location.pathname);
  }
  updateResultCount();
}
const initialTab = tabButtons.some((button) => button.dataset.tabTarget === requestedTab) ? requestedTab : "curated";
activateTab(initialTab, false);
applyFilters();
for (const button of tabButtons) {
  button.addEventListener("click", () => {
    activateTab(button.dataset.tabTarget, true);
  });
  button.addEventListener("keydown", (event) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabButtons.indexOf(button);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabButtons.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabButtons.length) % tabButtons.length;
    const nextButton = tabButtons[nextIndex];
    activateTab(nextButton.dataset.tabTarget, true);
    nextButton.focus();
  });
}
`;
}

function localEvidenceToolScript(locale: "en" | "zh" = "zh", snapshotUrl = "../data/radar-snapshot.json") {
  return String.raw`
(function () {
  const language = ${JSON.stringify(locale)};
  const snapshotUrl = ${JSON.stringify(snapshotUrl)};
  const input = document.querySelector("#local-query-input");
  const button = document.querySelector("#local-query-run");
  const result = document.querySelector("#local-query-result");
  if (!input || !button || !result) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function relatedItem(snapshot, event) {
    const ids = new Set(event.related_item_ids || []);
    return (snapshot.radar_items || []).find((item) => ids.has(item.id));
  }

  function humanizeChineseTitle(value) {
    let headline = String(value || "").trim().replace(/^据报道[，,]\s*/, "");
    const release = headline.match(/^(.{2,20}?)发布了?([^，,]+)[，,]一种([^，,]+)[，,]/);
    if (release) headline = release[1] + "发布" + release[2] + "：" + release[3].replace(/的系统$/, "");
    const namedTechnique = headline.match(/^(.{2,24}?)\s*开发了一种名为“([^”]+)”的技术[，,](.+)$/);
    if (namedTechnique) headline = namedTechnique[1] + "用“" + namedTechnique[2] + "”" + namedTechnique[3].split(/[，,]/)[0].replace(/^首次清晰揭示了?/, "揭示");
    const tutorial = headline.match(/^(.{2,20}?)发布了?关于(.+?)的教程$/);
    if (tutorial) headline = tutorial[1] + "发布" + tutorial[2] + "教程";
    const lawsuit = headline.match(/^(.+?)起诉(.+?)[，,]指控其在招聘面试中要求.+?员工携带未发布的硬件组件和样品/);
    if (lawsuit) headline = lawsuit[1] + "起诉" + lawsuit[2] + "：指控其面试时索要未发布硬件样品";
    const survey = headline.match(/^(.+?)对(\d+)家企业调查发现[，,](.+)$/);
    if (survey) headline = survey[1].replace(/\s+Pulse Research$/i, "") + "对" + survey[2] + "家企业调查：" + survey[3].split(/[，,：:]/)[0];
    const product = headline.match(/^(.{2,20}?)推出了?([^，,]+)[，,]这是一个由(.+?)驱动的AI工具/);
    if (product) headline = product[1] + "推出" + product[2] + "：由" + product[3] + "驱动";
    return headline.replace(/发布了/, "发布").replace(/推出了/, "推出");
  }

  function eventTitle(snapshot, event) {
    if (language === "en") return relatedItem(snapshot, event)?.title || event.timeline?.[0]?.title || event.canonical_title;
    const canonical = String(event.canonical_title || "").trim();
    const compact = compactChineseTitle(event, canonical, eventSummary(snapshot, event));
    if (compact) return compact;
    if (/[\u3400-\u9fff]/.test(canonical)) return canonical;
    const summary = humanizeChineseTitle(eventSummary(snapshot, event).replace(/\s+/g, " ").split(/[。！？]/)[0].trim());
    return shortChineseTitle(summary || canonical);
  }

  function compactChineseTitle(event, canonical, summary) {
    const text = [canonical, summary].join(" ");
    const entities = (event.related_entities || []).map((entity) => String(entity || "").trim()).filter(Boolean);
    const main = entities.find((entity) => /OpenAI|Anthropic|Google|DeepMind|Meta|Microsoft|NVIDIA|DeepSeek|Qwen|Kimi|Claude|Gemini|GPT|Codex|Apple/i.test(entity)) || entities[0] || "";
    const product = entities.find((entity) => /GPT-Red|Codex Micro|Claude|Gemini|DeepSeek|Qwen|Kimi|Jacobian|workspace|keyboard/i.test(entity)) || "";
    if (/GPT-Red/i.test(text)) return "OpenAI 发布 GPT-Red 红队系统";
    if (/Codex Micro|keyboard|键盘/i.test(text)) return "OpenAI 推出 Codex 硬件键盘";
    if (/Jacobian|hidden space|global workspace|雅可比|全局工作空间/i.test(text)) return "Anthropic 披露 Claude 内部表征研究";
    if (/lawsuit|起诉|法律纠纷|trade secret|商业机密/i.test(text) && main) return main + " 相关 AI 法律纠纷升级";
    if (/release|launch|发布|推出|上线/i.test(text) && main && product && main !== product) return shortChineseTitle(main + " 发布 " + product);
    if (/benchmark|基准/i.test(text) && main) return shortChineseTitle(main + " 基准/评测更新");
    if (/research|paper|研究|论文/i.test(text) && main) return shortChineseTitle(main + " 发布研究进展");
    return "";
  }

  function shortChineseTitle(value) {
    const normalized = String(value || "").replace(/\s+/g, " ").replace(/[。！？；].*$/, "").trim();
    return normalized.length > 34 ? normalized.slice(0, 33) + "…" : normalized;
  }

  function eventSummary(snapshot, event) {
    if (language !== "en") {
      const summary = String(event.summary_zh || "");
      if (/[\u3400-\u9fff]/.test(summary)) return summary;
      return "该事件汇集 " + Number((event.related_item_ids || []).length) + " 条公开信号，当前覆盖 " + Number(event.source_count || 0) + " 个来源；请结合时间线和引用核对。";
    }
    const item = relatedItem(snapshot, event);
    if (item?.summary_en) return item.summary_en;
    return "This public event is supported by " + Number(event.source_count || 0) + " source(s) and " + Number((event.related_item_ids || []).length) + " related signal(s). Review the citations before drawing a firm conclusion.";
  }

  function sourceFamilies(event) {
    const labels = { "公司/实验室": "Company / lab", "分析/媒体": "Analysis / media", "其他公开来源": "Other public sources", "开源项目": "Open-source project", "研究订阅": "Research feed" };
    return (event.source_families || []).map((family) => language === "en" ? (labels[family] || family) : family);
  }

  function scoreLabel(event) {
    if (language !== "en") return event.event_score_label;
    const labels = { "高优先级": "High priority", "关注": "Watch", "观察": "Monitor", "噪音/低相关": "Low relevance" };
    return labels[event.event_score_label] || event.event_score_label;
  }

  function evidenceState(event) {
    const sourceCount = Number(event.source_count || 0);
    const familyCount = Number((event.source_families || []).length);
    if (language === "en") {
      if (sourceCount > 1 && familyCount > 1) return "reported by different source types; independence still needs checking";
      if (sourceCount > 1) return "several reports from the same source type";
      return "one report so far";
    }
    if (sourceCount > 1 && familyCount > 1) return "不同类型来源均有报道，仍需核实是否相互独立";
    if (sourceCount > 1) return "同类来源已有多篇报道";
    return "目前仅有一篇报道";
  }

  function failureLabel(value) {
    const zh = { "403": "HTTP 403", duplicate_only: "仅重复", failed_403: "HTTP 403 失败", failed_parse: "解析失败", failed_rate_limit: "限流失败", failed_timeout: "超时失败", low_relevance_excluded: "低相关排除", manual_blocked: "手动/阻塞", no_items: "无新内容", no_new_items: "无新内容", rate_limit: "限流警告", timeout: "超时失败", unsupported_source: "不支持" };
    const en = { "403": "HTTP 403", duplicate_only: "Duplicate only", failed_403: "HTTP 403 failure", failed_parse: "Parse failure", failed_rate_limit: "Rate-limit failure", failed_timeout: "Timeout", low_relevance_excluded: "Low relevance excluded", manual_blocked: "Manual / blocked", no_items: "No new items", no_new_items: "No new items", rate_limit: "Rate-limit warning", timeout: "Timeout", unsupported_source: "Unsupported" };
    return (language === "en" ? en[value] : zh[value]) || String(value || "").replace(/_/g, " ");
  }

  function textOf(snapshot, event) {
    return [
      eventTitle(snapshot, event),
      eventSummary(snapshot, event),
      event.category,
      event.event_score_label,
      (event.source_families || []).join(" "),
      (event.related_entities || []).join(" ")
    ].join(" ").toLowerCase();
  }

  function queryIntent(query) {
    const q = query.toLowerCase();
    const crossFamily = /cross[- ]family|multiple source families|independent source famil|different source types|different types of sources|不同类型来源/.test(q);
    const sameFamily = /same source family|one source family|same source type|同类来源/.test(q);
    const multiSource = !crossFamily && !sameFamily && /multi[- ]source|multiple sources|more than one source|两家以上来源|多篇报道|多源/.test(q);
    const singleSource = !crossFamily && !sameFamily && !multiSource && /single[- ]source|one source|one[- ]report|only one report|单一来源|单源|单篇报道|只有一篇报道|弱信号|可信度较低|limited evidence/.test(q);
    const selectedOnly = /selected events?|today['’]s selection|industry selection|行业精选|今日精选|本轮精选|精选事件/.test(q);
    const highPriority = /high[- ]priority|highest[- ]priority|高优先级/.test(q);
    const timeWindowHours = /(?:past|last|within)\s*24\s*(?:hours?|hrs?|h)\b|\b24h\b|过去\s*24\s*小时|近\s*24\s*小时|今天|今日|\btoday\b/.test(q)
      ? 24
      : /(?:past|last|within)\s*(?:7\s*days?|one\s*week)|\bthis week\b|过去一周|近一周|本周/.test(q)
        ? 24 * 7
        : null;
    return {
      agent: /agent|智能体|开发工具|developer tool|coding tool|工具链/.test(q),
      crossFamily,
      highPriority,
      important: /rank|ranking|priority|important|selected events|top events|deeper analysis|worth a deeper|排序|重要|高优先级|精选|深度分析|行业观察|周报|提纲/.test(q),
      modelRelease: /model releases?|models? (?:were )?released|released models?|模型发布|发布(?:了|的)?(?:新)?模型|新模型发布/.test(q),
      multiSource,
      only: /\bonly\b|仅|只看|只列|只写|只要/.test(q),
      sameFamily,
      selectedOnly,
      singleSource,
      sourceHealth: /source.*(fail|timeout|no new)|failed sources|source health|来源.*(失败|超时|没有新|无新)|来源健康/.test(q),
      timeWindowHours,
      requestedCount: requestedEventCount(q)
    };
  }

  function requestedEventCount(query) {
    const digit = query.match(/(?:top\s*)?(\d{1,2})\s*(?:events?|items?|things?|stories|件|个|条)/i)?.[1];
    if (digit) return Math.max(1, Math.min(12, Number(digit)));
    const chinese = query.match(/([一二两三四五六七八九十])\s*(?:件|个|条)/)?.[1];
    if (chinese) {
      const values = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      return values[chinese] || null;
    }
    const word = query.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:events?|items?|things?|stories)\b/i)?.[1];
    if (!word) return null;
    const values = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    return values[word.toLowerCase()] || null;
  }

  function queryTokens(query) {
    const stopwords = new Set(["about", "against", "analysis", "and", "are", "around", "build", "daily", "days", "draft", "event", "events", "evidence", "from", "have", "hours", "into", "last", "no", "outline", "past", "public", "report", "such", "the", "this", "today", "what", "which", "with", "within", "write"]);
    const latin = (query.toLowerCase().match(/[a-z0-9][a-z0-9._+-]*/g) || [])
      .filter((token) => token.length >= 2 && !stopwords.has(token));
    const cjk = [];
    for (const run of query.match(/[\u3400-\u9fff]{2,}/g) || []) {
      if (run.length <= 4) cjk.push(run);
      for (let index = 0; index < run.length - 1; index += 1) cjk.push(run.slice(index, index + 2));
    }
    return Array.from(new Set(latin.concat(cjk)));
  }

  function normalizedQueryPhrase(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[“”'\"’]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function queryNamesExactEvent(snapshot, event, query) {
    const normalizedQuery = normalizedQueryPhrase(query);
    const titles = [
      eventTitle(snapshot, event),
      event.canonical_title,
      ...(event.timeline || []).map((entry) => entry.title)
    ];
    return titles.some((title) => {
      const normalizedTitle = normalizedQueryPhrase(title);
      return normalizedTitle.length >= 12 && normalizedQuery.includes(normalizedTitle);
    });
  }

  function queryAnchorTokens(query) {
    const genericAnchors = new Set(["cross-family", "high-priority", "multi-source", "single-source", "source-family"]);
    return queryTokens(query).filter((token) => /[-._+]/.test(token) && token.length >= 4 && !genericAnchors.has(token));
  }

  function normalizedEntityPhrase(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function queryNamesEntity(event, query) {
    const normalizedQuery = " " + normalizedEntityPhrase(query) + " ";
    const genericEntities = new Set(["ai", "agent", "agents", "artificial intelligence", "large language model", "llm", "model", "models", "open source", "product", "research", "safety", "人工智能", "安全", "智能体", "模型", "研究"]);
    return (event.related_entities || []).some((entity) => {
      const normalizedEntity = normalizedEntityPhrase(entity);
      if (normalizedEntity.length < 4 || genericEntities.has(normalizedEntity)) return false;
      return normalizedQuery.includes(" " + normalizedEntity + " ");
    });
  }

  function matchesIntent(event, text, intent) {
    const sourceCount = Number(event.source_count || 0);
    const familyCount = Number((event.source_families || []).length);
    const category = String(event.category || "").toLowerCase();
    const titleAndEntities = [event.canonical_title || "", ...(event.related_entities || [])].join(" ").toLowerCase();
    const requestedEvidenceStates = [];
    if (intent.crossFamily) requestedEvidenceStates.push(sourceCount > 1 && familyCount > 1);
    if (intent.sameFamily) requestedEvidenceStates.push(sourceCount > 1 && familyCount === 1);
    if (intent.multiSource) requestedEvidenceStates.push(sourceCount > 1);
    if (intent.singleSource) requestedEvidenceStates.push(sourceCount === 1);
    if (requestedEvidenceStates.length > 0 && !requestedEvidenceStates.some(Boolean)) return false;
    if (intent.highPriority && event.event_score_label !== "高优先级") return false;
    if (intent.modelRelease && category !== "model_release") return false;
    if (intent.agent && !/\bagents?\b|智能体|developer tool|coding tool|\bsdk\b|\bcli\b|开发工具|工具链/i.test(titleAndEntities)) return false;
    return true;
  }

  function eventWithinIntentWindow(snapshot, event, intent) {
    if (!intent.timeWindowHours) return true;
    const anchor = Date.parse(snapshot.freshness?.latest_timestamp || "");
    const eventTime = Date.parse(event.latest_seen_at || event.first_seen_at || "");
    if (!Number.isFinite(anchor) || !Number.isFinite(eventTime)) return false;
    const lowerBound = anchor - intent.timeWindowHours * 60 * 60 * 1000;
    return eventTime >= lowerBound && eventTime <= anchor + 5 * 60 * 1000;
  }

  function scoreEvent(snapshot, event, query, intent) {
    const q = query.toLowerCase();
    const text = textOf(snapshot, event);
    if (!matchesIntent(event, text, intent)) return null;

    let relevance = 0;
    let tokenMatches = 0;
    const structuredIntent = intent.crossFamily || intent.sameFamily || intent.multiSource || intent.singleSource || intent.highPriority || intent.modelRelease || intent.agent || intent.selectedOnly || intent.important || intent.timeWindowHours;
    const title = eventTitle(snapshot, event).toLowerCase();
    let titleMatched = false;
    if ((title.length >= 6 && q.includes(title)) || (q.length >= 6 && title.includes(q))) {
      relevance += 80;
      titleMatched = true;
    }
    for (const token of queryTokens(q)) {
      if (text.includes(token)) {
        relevance += token.length >= 5 ? 18 : 8;
        tokenMatches += 1;
      }
    }
    if (!structuredIntent && !titleMatched && (tokenMatches === 0 || (tokenMatches === 1 && relevance < 18))) return null;
    const sourceCount = Number(event.source_count || 0);
    const familyCount = Number((event.source_families || []).length);
    if (intent.crossFamily && sourceCount > 1 && familyCount > 1) relevance += 40;
    else if (intent.sameFamily && sourceCount > 1 && familyCount === 1) relevance += 26;
    else if (intent.multiSource && sourceCount > 1) relevance += 26;
    if (intent.singleSource && sourceCount === 1) relevance += 18;
    if (intent.modelRelease || intent.agent) relevance += 16;
    if (intent.important) relevance += Number(event.event_score || 0) / 2;
    return Number(event.event_score || 0) + relevance;
  }

  function pickEvents(snapshot, query) {
    const events = Array.isArray(snapshot.event_clusters) ? snapshot.event_clusters : [];
    const curated = Array.isArray(snapshot.curated_events) ? snapshot.curated_events : [];
    const merged = [];
    const seen = new Set();
    for (const event of curated.concat(events)) {
      if (!event || seen.has(event.event_cluster_id)) continue;
      seen.add(event.event_cluster_id);
      merged.push(event);
    }
    const intent = queryIntent(query);
    const pool = (intent.selectedOnly ? curated : merged).filter((event) => eventWithinIntentWindow(snapshot, event, intent));
    const exactTitleMatches = pool.filter((event) => queryNamesExactEvent(snapshot, event, query));
    const anchorTokens = queryAnchorTokens(query);
    const anchorMatches = anchorTokens.length > 0
      ? pool.filter((event) => anchorTokens.every((token) => textOf(snapshot, event).includes(token)))
      : [];
    const entityMatches = pool.filter((event) => queryNamesEntity(event, query));
    const scopedPool = exactTitleMatches.length > 0
      ? exactTitleMatches
      : anchorMatches.length > 0
        ? anchorMatches
        : entityMatches.length > 0
          ? entityMatches
          : pool;
    return scopedPool
      .map((event) => ({ event, score: scoreEvent(snapshot, event, query, intent) }))
      .filter((entry) => entry.score !== null)
      .sort((left, right) => right.score - left.score || Number(right.event.event_score || 0) - Number(left.event.event_score || 0))
      .slice(0, intent.requestedCount || 6)
      .map((entry) => entry.event);
  }

  function displayDateTime(value) {
    const parsed = new Date(value || "");
    if (!Number.isFinite(parsed.getTime())) return language === "en" ? "unavailable" : "待补";
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "zh-CN", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "short",
      timeZone: "UTC",
      year: "numeric"
    }).format(parsed) + " UTC";
  }

  function renderSourceHealthResult(snapshot, query) {
    const health = snapshot.source_health_summary || {};
    const families = Object.entries(snapshot.failure_family_summary || {})
      .filter((entry) => Number(entry[1] || 0) > 0)
      .map((entry) => '<li>' + escapeHtml(failureLabel(entry[0])) + ': ' + escapeHtml(entry[1]) + '</li>')
      .join("");
    const failedSources = (snapshot.source_health_failures || [])
      .map((failure) => '<li>' + escapeHtml(failure.source_name) + ' · ' + escapeHtml(failureLabel(failure.reason)) + '</li>')
      .join("");
    const auditedAt = snapshot.source_health_scope?.finished_at || snapshot.coverage?.latest_refresh;
    if (language === "en") {
      return '<h3>Source health</h3><p>Audited through ' + escapeHtml(displayDateTime(auditedAt)) + '.</p>' +
        '<dl class="inline-defs"><dt>Succeeded</dt><dd>' + escapeHtml(health.succeeded || 0) + '</dd><dt>Failed</dt><dd>' + escapeHtml(health.failed || 0) + '</dd><dt>Manual / blocked</dt><dd>' + escapeHtml(health.manual_blocked || 0) + '</dd><dt>No new items</dt><dd>' + escapeHtml(health.no_items || 0) + '</dd><dt>Duplicate only</dt><dd>' + escapeHtml(health.duplicate_only || 0) + '</dd></dl>' +
        '<h4>Failed sources</h4><ul>' + (failedSources || '<li>None</li>') + '</ul><h4>Reason summary</h4><ul>' + families + '</ul>';
    }
    return '<h3>来源健康</h3><p>审计截至 ' + escapeHtml(displayDateTime(auditedAt)) + '。</p>' +
      '<dl class="inline-defs"><dt>成功</dt><dd>' + escapeHtml(health.succeeded || 0) + '</dd><dt>失败</dt><dd>' + escapeHtml(health.failed || 0) + '</dd><dt>手动/阻塞</dt><dd>' + escapeHtml(health.manual_blocked || 0) + '</dd><dt>无新条目</dt><dd>' + escapeHtml(health.no_items || 0) + '</dd><dt>仅重复</dt><dd>' + escapeHtml(health.duplicate_only || 0) + '</dd></dl>' +
      '<h4>失败来源</h4><ul>' + (failedSources || '<li>无</li>') + '</ul><h4>原因汇总</h4><ul>' + families + '</ul>';
  }

  function citationHtml(event) {
    return (event.citations || []).slice(0, 2).map((citation) =>
      '<a href="' + escapeHtml(citation.url) + '">' + escapeHtml(citation.source_name) + (language === "en" ? ': ' : '：') + escapeHtml(citation.title) + '</a>'
    ).join("<br>");
  }

  function eventDate(event) {
    const raw = event.latest_seen_at || event.first_seen_at || "";
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return language === "en" ? "date unavailable" : "日期待补";
    return parsed.toISOString().slice(0, 10);
  }

  function eventUncertainty(event) {
    if (language !== "en") {
      const caveat = (event.caveats || [])[0];
      return caveat
        ? String(caveat).replace(/来源家族/g, "来源类型")
        : (Number(event.source_count || 0) > 1 ? "多篇报道仍需核实是否彼此独立。" : "当前只有一篇报道，需要补充独立信息。 ");
    }
    if (Number((event.source_families || []).length) > 1) {
      return "The reports come from different source types, but one may repeat the original claim; independence is not yet established.";
    }
    if (Number(event.source_count || 0) > 1) {
      return "Several reports come from the same source type, so independent confirmation is still needed.";
    }
    return "Only one report is available so far; independent confirmation is still needed.";
  }

  function renderAskResult(snapshot, query, events) {
    const freshness = snapshot.freshness && snapshot.freshness.latest_timestamp ? displayDateTime(snapshot.freshness.latest_timestamp) : (language === "en" ? "unavailable" : "待补证据");
    if (language === "en") {
      return '<h3>Radar results</h3>' +
        '<ol>' + events.map((event) =>
          '<li data-event-id="' + escapeHtml(event.event_cluster_id) + '"><strong>' + escapeHtml(eventTitle(snapshot, event)) + '</strong><p>' + escapeHtml(eventSummary(snapshot, event)) + '</p>' +
          '<small>' + escapeHtml(eventDate(event)) + ' · ' + escapeHtml(scoreLabel(event)) + ' · ' + escapeHtml(event.source_count) + (Number(event.source_count || 0) === 1 ? ' source · ' : ' sources · ') + escapeHtml(evidenceState(event)) + ' · ' + escapeHtml(sourceFamilies(event).join(", ")) + '</small>' +
          '<p class="uncertainty"><strong>What remains uncertain:</strong> ' + escapeHtml(eventUncertainty(event)) + '</p>' +
          '<div class="local-citations">' + citationHtml(event) + '</div></li>'
        ).join("") + '</ol><p class="note">Reporting checked through ' + escapeHtml(freshness) + '. One-report events still need confirmation.</p>';
    }
    return '<h3>雷达结果</h3>' +
      '<ol>' + events.map((event) =>
        '<li data-event-id="' + escapeHtml(event.event_cluster_id) + '"><strong>' + escapeHtml(eventTitle(snapshot, event)) + '</strong><p>' + escapeHtml(eventSummary(snapshot, event)) + '</p>' +
        '<small>' + escapeHtml(eventDate(event)) + ' · ' + escapeHtml(event.event_score_label) + ' · ' + escapeHtml(event.source_count) + ' 个来源 · ' + escapeHtml(evidenceState(event)) + ' · ' + escapeHtml((event.source_families || []).join("、")) + '</small>' +
        '<p class="uncertainty"><strong>仍需核实：</strong>' + escapeHtml(eventUncertainty(event)) + '</p>' +
        '<div class="local-citations">' + citationHtml(event) + '</div></li>'
      ).join("") + '</ol><p class="note">报道核对至 ' + escapeHtml(freshness) + '；目前只有一篇报道的事件仍需继续核实。</p>';
  }

  function renderNoMatch(intent) {
    if (intent.highPriority && intent.timeWindowHours) {
      return language === "en"
        ? '<p class="empty">No high-priority event was found in the requested time window. Lower-priority events were not substituted.</p>'
        : '<p class="empty">指定时间窗口内没有高优先级事件；系统未用“关注”或“观察”事件替代。</p>';
    }
    if (intent.highPriority) {
      return language === "en"
        ? '<p class="empty">No high-priority event was found in the current data. Lower-priority events were not substituted.</p>'
        : '<p class="empty">当前数据中没有高优先级事件；未用较低优先级内容替代。</p>';
    }
    return language === "en"
      ? '<p class="empty">No matching event was found in the current data.</p>'
      : '<p class="empty">当前数据中没有找到匹配事件。</p>';
  }

  async function run() {
    const query = input.value.trim();
    if (!query) {
      result.innerHTML = language === "en" ? '<p class="empty">Enter a question first.</p>' : '<p class="empty">先输入一个问题。</p>';
      return;
    }
    result.innerHTML = language === "en" ? '<p class="note">Searching current radar data...</p>' : '<p class="note">正在检索当前雷达数据...</p>';
    try {
      const response = await fetch(snapshotUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("snapshot unavailable");
      const snapshot = await response.json();
      const intent = queryIntent(query);
      if (intent.sourceHealth) {
        result.innerHTML = renderSourceHealthResult(snapshot, query);
        return;
      }
      const events = pickEvents(snapshot, query);
      result.innerHTML = events.length === 0
        ? renderNoMatch(intent)
        : renderAskResult(snapshot, query, events);
    } catch {
      result.innerHTML = language === "en" ? '<p class="empty">Radar data could not be loaded. Try again later.</p>' : '<p class="empty">雷达数据读取失败，请稍后重试。</p>';
    }
  }

  button.addEventListener("click", run);
})();
`;
}

function stylesheet() {
  return `:root {
  --bg: #f3f5f7;
  --ink: #172231;
  --muted: #657386;
  --line: #dce2e7;
  --panel: #ffffff;
  --soft: #edf1f3;
  --evidence: #0b6975;
  --success: #1f6b45;
  --caution: #9a5a17;
  --danger: #b9412c;
  --shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
* { box-sizing: border-box; }
html { background: var(--bg); }
body { background: var(--bg); color: var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; line-height: 1.55; margin: 0; }
a { color: var(--evidence); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 3px; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 3px solid #2a7b89; outline-offset: 2px; }
button, input, select, textarea { font: inherit; }
h1, h2, h3, p { letter-spacing: 0; margin: 0; }
h1 { font-size: 30px; line-height: 1.2; }
h2 { font-size: 20px; line-height: 1.35; }
h3 { font-size: 17px; line-height: 1.4; }
.app-layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); min-height: 100vh; }
.desktop-sidebar { background: #fff; border-right: 1px solid var(--line); display: flex; flex-direction: column; min-height: 100vh; padding: 24px 16px; position: sticky; top: 0; }
.brand { align-items: center; border-bottom: 1px solid var(--line); color: var(--ink); display: flex; font-size: 16px; font-weight: 800; gap: 10px; padding: 2px 8px 22px; }
.brand span { white-space: nowrap; }
.brand:hover { text-decoration: none; }
.brand img { border-radius: 6px; height: 28px; width: 28px; }
.nav-group-label { color: var(--muted); font-size: 11px; margin: 28px 8px 8px; text-transform: uppercase; }
.side-nav { display: grid; gap: 4px; }
.side-nav a { border-radius: 7px; color: #405064; font-size: 14px; font-weight: 600; padding: 10px 12px; }
.side-nav a:hover { background: var(--soft); text-decoration: none; }
.side-nav a[aria-current="page"] { background: #e1ecee; color: var(--evidence); }
.secondary-nav { margin-bottom: auto; }
.app-frame { min-width: 0; }
.desktop-topbar { align-items: center; color: var(--muted); display: flex; font-size: 12px; height: 58px; justify-content: flex-end; margin: 0 auto; max-width: 1320px; padding: 0 30px; }
.desktop-topbar > span { margin-right: 14px; }
.language-switch { border: 1px solid var(--line); border-radius: 6px; display: inline-grid; grid-template-columns: repeat(2, minmax(38px, auto)); overflow: hidden; }
.language-switch a { color: var(--muted); font-size: 12px; font-weight: 700; min-width: 38px; padding: 6px 8px; text-align: center; }
.language-switch a + a { border-left: 1px solid var(--line); }
.language-switch a[aria-current="true"] { background: var(--ink); color: #fff; }
.mobile-header, .mobile-nav { display: none; }
main { margin: 0 auto; max-width: 1320px; min-width: 0; padding: 0 30px 64px; width: 100%; }
main > * + * { margin-top: 24px; }
.feed-heading { align-items: end; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; padding: 0 0 18px; }
.feed-heading p, .tool-heading p { color: var(--muted); font-size: 13px; margin-top: 3px; }
.feed-heading > a, .feed-heading > span { color: var(--muted); font-size: 13px; }
.section-heading { align-items: center; display: flex; gap: 16px; justify-content: space-between; }
.section-heading > span { color: var(--evidence); font-size: 12px; font-weight: 800; }
.top-stories { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); overflow: hidden; }
.top-stories .section-heading { border-bottom: 1px solid var(--line); padding: 16px 22px; }
.top-story { align-items: center; color: var(--ink); display: grid; gap: 14px; grid-template-columns: 24px minmax(0, 1fr) auto; padding: 12px 22px; }
.top-story + .top-story { border-top: 1px solid #edf0f2; }
.top-story:hover { background: #fbfcfc; text-decoration: none; }
.top-story > span { color: var(--danger); font-size: 18px; font-weight: 800; text-align: center; }
.top-story:nth-of-type(3) > span { color: #c06d35; }
.top-story:nth-of-type(4) > span { color: #b9852e; }
.top-story strong { display: -webkit-box; font-size: 17px; overflow: hidden; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.top-story small { color: var(--muted); white-space: nowrap; }
.feed-toolbar { border-bottom: 1px solid var(--line); display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr) minmax(240px, 360px); padding-bottom: 14px; }
.feed-toolbar .section-heading { grid-column: 1 / -1; }
.feed-search { grid-column: 2; grid-row: 2; width: 100%; }
.feed-search input, .controls input, .controls select, .tool-stage textarea { background: #fff; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); width: 100%; }
.feed-search input { padding: 10px 12px; }
.feed-chips { display: flex; gap: 8px; grid-column: 1; grid-row: 2; overflow-x: auto; padding-bottom: 1px; }
.feed-chips button, .prompt-suggestions button { background: #fff; border: 1px solid var(--line); border-radius: 7px; color: #46566b; cursor: pointer; flex: 0 0 auto; padding: 7px 13px; }
.feed-chips button.active { border-bottom: 2px solid var(--evidence); color: var(--evidence); font-weight: 700; }
.feed-day { align-items: center; display: flex; font-size: 18px; padding: 4px 0 10px; }
.story-stream { display: grid; gap: 12px; }
.story-row, .radar-row { align-items: start; background: transparent; display: grid; gap: 14px; grid-template-columns: 96px minmax(0, 1fr); padding: 0; }
.story-row[hidden], .radar-row[hidden] { display: none; }
.story-time { align-items: center; color: #506178; display: grid; font-size: 12px; font-weight: 700; gap: 8px; grid-template-columns: 1fr 10px; padding-top: 18px; text-align: right; }
.story-time span { background: var(--evidence); border-radius: 50%; height: 8px; width: 8px; }
.story-content { background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); min-width: 0; padding: 16px 20px; }
.story-meta { align-items: center; color: var(--muted); display: flex; font-size: 13px; gap: 12px; justify-content: space-between; }
.story-meta strong { color: var(--evidence); font-size: 12px; }
.story-content h2 { font-size: 18px; margin-top: 6px; }
.story-content h2 a { color: var(--ink); display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.story-content p { color: #58687b; display: -webkit-box; font-size: 14px; line-height: 1.7; margin-top: 6px; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.story-foot { color: #7a8796; display: flex; font-size: 12px; gap: 14px; margin-top: 10px; }
.source-drawer { border-top: 1px dashed var(--line); margin-top: 12px; padding-top: 10px; }
.source-drawer summary, .score-drawer summary, .report-sources summary { color: var(--evidence); cursor: pointer; font-size: 13px; font-weight: 700; }
.score-drawer { margin-top: 10px; }
.score-drawer p { display: block; font-size: 12px; -webkit-line-clamp: unset; }
.source-drawer-list { display: grid; gap: 8px; margin-top: 10px; }
.source-drawer-list a { color: var(--ink); display: grid; gap: 3px; grid-template-columns: 150px minmax(0, 1fr) auto; padding: 7px 0; }
.source-drawer-list a + a { border-top: 1px solid #edf0f2; }
.source-drawer-list span, .source-drawer-list time { color: var(--muted); font-size: 12px; }
.feed-more { display: flex; justify-content: center; }
.button { align-items: center; background: #fff; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); cursor: pointer; display: inline-flex; font-size: 14px; font-weight: 700; justify-content: center; padding: 9px 14px; }
.button.primary { background: var(--evidence); border-color: var(--evidence); color: #fff; }
.actions, .pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
.radar-tabs { border-bottom: 1px solid var(--line); }
.tabbar { display: flex; gap: 22px; overflow-x: auto; }
.tab-button { background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--muted); cursor: pointer; flex: 0 0 auto; font-weight: 700; padding: 9px 1px 11px; }
.tab-button.active { border-bottom-color: var(--evidence); color: var(--evidence); }
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.radar-filters { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
.filter-mobile-toggle { display: none; }
.controls { display: grid; gap: 10px; grid-template-columns: minmax(220px, 2fr) repeat(6, minmax(105px, 1fr)); }
.controls label { color: var(--muted); font-size: 11px; font-weight: 700; }
.controls input, .controls select { margin-top: 4px; padding: 8px 9px; }
.filter-feedback { align-items: center; display: flex; gap: 12px; justify-content: space-between; margin-top: 10px; }
.filter-feedback span { color: var(--muted); font-size: 12px; }
.row-list, .report-list { display: grid; gap: 12px; }
.timeline-list { display: grid; gap: 8px; }
.timeline-row { background: #fff; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); display: grid; gap: 12px; grid-template-columns: 165px minmax(0, 1fr) 150px; padding: 12px 14px; }
.timeline-row time, .timeline-row span { color: var(--muted); font-size: 12px; }
.panel, .report-card, .event-card:not(.story-row) { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
.grid { display: grid; gap: 16px; }
.grid.two { grid-template-columns: minmax(0, 1fr) 360px; }
.event-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.event-card:not(.story-row) { display: grid; gap: 10px; }
.event-card:not(.story-row) h2 { font-size: 18px; }
.event-card:not(.story-row) p, .note, .note-list, .compact-row p { color: var(--muted); }
.pill { border: 1px solid var(--line); border-radius: 6px; display: inline-flex; font-size: 11px; font-weight: 700; padding: 3px 7px; }
.pill.evidence { background: #e7f2f3; color: var(--evidence); }
.pill.success { background: #eaf4ed; color: var(--success); }
.pill.caution { background: #fff5e8; color: var(--caution); }
.pill.neutral { background: var(--soft); color: var(--muted); }
.rail, .event-meta, .inline-defs { display: grid; gap: 6px; grid-template-columns: 140px minmax(0, 1fr); }
dt { color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; }
dd { margin: 0; overflow-wrap: anywhere; }
.page-heading { border-bottom: 1px solid var(--line); padding-bottom: 20px; }
.page-heading h1 { margin-top: 8px; }
.lead { color: var(--muted); font-size: 16px; margin-top: 8px; max-width: 780px; }
.tool-heading { border-bottom: 1px solid var(--line); margin-top: 0; padding-bottom: 18px; }
.tool-heading h1 { font-size: 30px; margin-top: 4px; }
.tool-stage { background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); display: grid; gap: 14px; margin-left: auto; margin-right: auto; max-width: 840px; padding: 22px; }
.tool-stage { margin-left: 0; max-width: 980px; width: 100%; }
.tool-stage textarea { line-height: 1.6; min-height: 112px; padding: 14px; resize: vertical; }
.tool-stage .actions { justify-content: flex-end; }
.prompt-suggestions { display: flex; flex-wrap: wrap; gap: 8px; }
.prompt-suggestions button { font-size: 13px; text-align: left; }
.local-result { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 16px; }
.local-result:empty { border: 0; padding: 0; }
.local-result ol { display: grid; gap: 12px; margin: 0; padding-left: 20px; }
.local-result p, .local-result small { color: var(--muted); }
.local-result .local-thesis { color: var(--ink); font-size: 17px; font-weight: 700; line-height: 1.7; }
.outline-section { border-top: 1px solid var(--line); display: grid; gap: 8px; padding-top: 14px; }
.outline-section h4 { margin: 0; }
.outline-section ol { margin-top: 2px; }
.local-citations { background: var(--soft); border-radius: 6px; display: grid; gap: 4px; margin-top: 8px; padding: 10px; }
.report-tabs { border-bottom: 1px solid var(--line); display: flex; gap: 24px; }
.report-tabs a { color: var(--muted); font-weight: 700; padding: 8px 0 10px; }
.report-reader { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 28px; }
.report-reader + .report-reader { margin-top: 16px; }
.report-kicker { color: var(--evidence); font-size: 12px; font-weight: 700; }
.report-reader h2 { font-size: 27px; margin-top: 8px; }
.report-deck { color: #4f6074; font-size: 16px; line-height: 1.75; margin-top: 10px; }
.report-stats { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 16px; }
.report-stats span { color: var(--muted); font-size: 12px; }
.report-body { display: grid; gap: 22px; margin-top: 28px; }
.report-analysis { display: grid; gap: 11px; max-width: 860px; }
.report-analysis p { color: #405064; line-height: 1.8; }
.report-analysis .report-thesis { color: var(--ink); font-size: 18px; font-weight: 700; }
.report-analysis ul { color: #405064; margin: 0; padding-left: 22px; }
.report-analysis li + li { margin-top: 6px; }
.report-reading-section { border-top: 1px solid var(--line); padding-top: 20px; }
.report-reading-section p { color: #4f6074; margin-top: 8px; }
.report-reading-section ul { margin: 12px 0 0; padding-left: 22px; }
.report-reading-section li + li { margin-top: 7px; }
.report-event-list { display: grid; margin-top: 12px; }
.report-event { border-top: 1px solid #edf0f2; padding: 16px 0; }
.report-event:first-child { border-top: 0; padding-top: 4px; }
.report-event h3 { font-size: 17px; margin-top: 5px; }
.report-event h3 a { color: var(--ink); }
.report-event > p:not(.report-event-meta) { color: #4f6074; font-size: 14px; line-height: 1.7; }
.report-event > time { color: var(--muted); display: block; font-size: 11px; margin-top: 8px; }
.report-event-meta { color: var(--muted); display: flex; font-size: 11px; gap: 12px; }
.report-notes { border-top: 1px solid var(--line); margin-top: 20px; padding-top: 14px; }
.report-notes summary { color: var(--muted); cursor: pointer; font-size: 13px; font-weight: 700; }
.report-notes .note-list { margin-bottom: 0; }
.report-sources { border-top: 1px solid var(--line); margin-top: 26px; padding-top: 16px; }
.report-sources ol { display: grid; gap: 8px; padding-left: 22px; }
.report-sources li span { color: var(--muted); display: block; font-size: 12px; }
.callout { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }
.callout.warning, .freshness-alert { background: #fff7ea; border-color: #e8c486; color: var(--caution); }
.freshness-alert { border: 1px solid #e8c486; border-radius: 8px; padding: 12px 14px; }
.freshness-alert p { margin-top: 4px; }
.metric-grid, .distribution, .tag-block, .entity-link-list { display: flex; flex-wrap: wrap; gap: 10px; }
.metric-grid div, .distribution section { background: var(--soft); border-radius: 7px; padding: 12px; }
.compact-row { background: #fff; border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) 220px; padding: 16px; }
.citation-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.citation { border: 1px solid var(--line); border-radius: 7px; color: var(--ink); display: grid; gap: 3px; padding: 10px; }
.citation span, .citation small { color: var(--muted); }
.health-table-wrap { border: 1px solid var(--line); border-radius: 8px; margin-top: 14px; overflow-x: auto; }
.health-table { border-collapse: collapse; font-size: 12px; min-width: 1160px; width: 100%; }
.health-table caption { color: var(--muted); padding: 12px; text-align: left; }
.health-table th, .health-table td { border-top: 1px solid var(--line); padding: 9px 10px; text-align: right; white-space: nowrap; }
.health-table thead th { background: var(--soft); color: var(--muted); }
.health-table th:first-child { background: #fff; left: 0; position: sticky; text-align: left; z-index: 1; }
.empty { border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); padding: 16px; }
.site-footer { align-items: center; border-top: 1px solid var(--line); color: var(--muted); display: flex; font-size: 12px; justify-content: space-between; margin: 0 30px; padding: 18px 0 28px; }
@media (max-width: 980px) {
  .controls { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .controls .search-control { grid-column: 1 / -1; }
  .grid.two { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  body { padding-bottom: 54px; }
  .app-layout { display: block; min-height: auto; }
  .desktop-sidebar, .desktop-topbar { display: none; }
  .mobile-header { align-items: center; background: var(--bg); display: flex; height: 46px; justify-content: space-between; padding: 0 12px; position: sticky; top: 0; z-index: 20; }
  .mobile-brand { color: var(--ink); font-size: 18px; font-weight: 800; }
  .mobile-nav { background: #fff; border-top: 1px solid var(--line); bottom: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); left: 0; position: fixed; right: 0; z-index: 30; }
  .mobile-nav a { color: var(--muted); font-size: 11px; font-weight: 700; padding: 11px 2px 10px; text-align: center; }
  .mobile-nav a[aria-current="page"] { color: var(--evidence); }
  main { padding: 0 12px 30px; }
  main > * + * { margin-top: 14px; }
  .feed-heading { padding-bottom: 8px; }
  .feed-heading h1 { font-size: 22px; }
  .feed-heading p { display: none; }
  .top-stories .section-heading { padding: 9px 12px; }
  .top-stories .section-heading h2 { font-size: 16px; }
  .top-story { gap: 8px; grid-template-columns: 20px minmax(0, 1fr) 52px; padding: 8px 12px; }
  .top-story > span { font-size: 15px; }
  .top-story strong { font-size: 14px; line-height: 1.35; }
  .top-story small { font-size: 10px; white-space: normal; }
  .home-page .feed-search { display: none; }
  .feed-toolbar { grid-template-columns: minmax(0, 1fr); }
  .feed-toolbar .section-heading, .feed-chips { grid-column: 1; }
  .feed-chips { grid-row: auto; }
  .feed-chips { margin-left: -12px; margin-right: -12px; padding-left: 12px; padding-right: 12px; }
  .story-stream { gap: 0; margin-left: -12px; margin-right: -12px; }
  .feed-day { background: #edf0f2; border-bottom: 1px solid var(--line); border-top: 1px solid var(--line); font-size: 13px; padding: 7px 12px; }
  .story-row, .radar-row { background: transparent; gap: 8px; grid-template-columns: 38px minmax(0, 1fr); padding: 0 12px; }
  .story-time { font-size: 10px; grid-template-columns: 1fr; padding-top: 12px; text-align: left; }
  .story-time span { display: none; }
  .story-content { background: transparent; border: 0; border-bottom: 1px solid #e3e7ea; border-radius: 0; box-shadow: none; padding: 10px 0 12px; }
  .story-meta { font-size: 11px; }
  .story-content h2 { font-size: 15px; line-height: 1.4; margin-top: 4px; }
  .story-content p { font-size: 12px; line-height: 1.55; margin-top: 4px; -webkit-line-clamp: 2; }
  .story-foot { font-size: 11px; }
  .score-drawer { display: none; }
  .source-drawer-list a { grid-template-columns: 1fr; }
  .radar-tabs { margin-left: -12px; margin-right: -12px; padding-left: 12px; }
  .tabbar { gap: 16px; padding-right: 12px; }
  .radar-filters { padding: 12px; }
  .filter-mobile-toggle { display: flex; justify-content: flex-end; }
  .filter-mobile-toggle .button { min-width: 84px; }
  .radar-filters:not(.filters-open) .controls, .radar-filters:not(.filters-open) .filter-feedback { display: none; }
  .controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .controls .search-control { grid-column: 1 / -1; }
  .timeline-row, .compact-row, .event-grid, .citation-grid { grid-template-columns: 1fr; }
  .timeline-row { gap: 4px; }
  .report-reader { padding: 20px 18px; }
  .report-reader h2 { font-size: 22px; }
  .report-deck { font-size: 14px; }
  .tool-heading { margin-top: 0; text-align: left; }
  .tool-heading h1 { font-size: 24px; }
  .tool-stage { border: 0; border-radius: 0; box-shadow: none; margin-left: -12px; margin-right: -12px; padding: 12px; width: auto; }
  .tool-stage textarea { min-height: 96px; }
  .prompt-suggestions { display: grid; grid-template-columns: 1fr; overflow: visible; }
  .prompt-suggestions button { max-width: none; width: 100%; }
  .rail, .event-meta, .inline-defs { grid-template-columns: 1fr; }
  .site-footer { margin: 0 12px; padding-bottom: 14px; }
}
`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
