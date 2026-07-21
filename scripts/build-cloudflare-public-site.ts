import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

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
      `snapshotRows=${snapshot.counts.snapshot_radar_items}`
    ].join(" ")
  );
}

async function writeSite(snapshot: Snapshot) {
  const generatedDirectories = ["about", "ask", "assets", "en", "radar", "sources"];
  await Promise.all(generatedDirectories.map((directory) =>
    fs.rm(path.join(outputDir, directory), { force: true, recursive: true })
  ));
  const allowedDirectories = new Set([...generatedDirectories, "data"]);
  const existingEntries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(existingEntries
    .filter((entry) => entry.isDirectory() && !allowedDirectories.has(entry.name))
    .map((entry) => fs.rm(path.join(outputDir, entry.name), { force: true, recursive: true })));
  await Promise.all([
    fs.mkdir(path.join(outputDir, "about"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "ask"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "assets"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "data"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "about"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "ask"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "radar"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "sources"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "radar"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "sources"), { recursive: true })
  ]);

  await Promise.all([
    fs.copyFile(path.join(process.cwd(), "app", "icon.svg"), path.join(outputDir, "favicon.svg")),
    fs.writeFile(path.join(outputDir, "data", "radar-snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "about", "index.html"), renderAbout(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "ask", "index.html"), renderAsk(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "assets", "styles.css"), stylesheet(), "utf8"),
    fs.writeFile(path.join(outputDir, "404.html"), renderNotFound(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "about", "index.html"), renderEnglishAbout(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "ask", "index.html"), renderEnglishAsk(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "index.html"), renderEnglishHome(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "radar", "index.html"), renderEnglishRadar(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "sources", "index.html"), renderEnglishSources(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "index.html"), renderHome(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "radar", "index.html"), renderRadar(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "sources", "index.html"), renderSources(snapshot), "utf8"),
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
    "/reports /404.html 404",
    "/reports/ /404.html 404",
    "/reports/* /404.html 404",
    "/en/entities /404.html 404",
    "/en/entities/ /404.html 404",
    "/en/entities/* /404.html 404",
    "/en/reports /404.html 404",
    "/en/reports/ /404.html 404",
    "/en/reports/* /404.html 404",
    "/api/writing-assistant /404.html 404",
    "/api/writing-assistant/ /404.html 404"
  ].join("\n") + "\n";
}

function retiredRouteWorker() {
  return `const retiredPrefixes = ["/write", "/en/write", "/entities", "/en/entities", "/reports", "/en/reports", "/api/writing-assistant"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (retiredPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + "/"))) {
      return new Response("<!doctype html><meta charset=\\"utf-8\\"><title>页面不存在 - AI 行业信息雷达</title><h1>404</h1><p>This public route is not available.</p>", {
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
      "/reports",
      "/reports/*",
      "/en/reports",
      "/en/reports/*",
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
  return summary.length >= 18 &&
    !containsReaderPipelineBoilerplate(summary) &&
    !/(未提供具体内容|未提供正文|没有正文|内容未提供|仅提供元数据|文章标题指出|这是一篇(?:来自)?|标题为《)/u.test(summary);
}

function readerReadyEventForLocale(event: SnapshotEvent, snapshot: Snapshot, locale: "en" | "zh") {
  if (locale === "zh") return readerReadyEvent(event);
  const summary = eventEnglishSummary(event, snapshot);
  return summary.length >= 30 && !/(only metadata|no body text|metadata only|content was not provided|title alone)/iu.test(summary);
}

function feedDateTime(value: string, locale: "en" | "zh") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "--", time: "--:--" };
  const timeZone = locale === "en" ? "UTC" : "Asia/Shanghai";
  return {
    date: new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "zh-CN", {
      day: "2-digit",
      month: locale === "en" ? "short" : "2-digit",
      timeZone
    }).format(date),
    time: new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "zh-CN", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone
    }).format(date)
  };
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

function eventReaderJudgment(event: SnapshotEvent, snapshot: Snapshot, locale: "en" | "zh") {
  const relatedIds = new Set(event.related_item_ids);
  const item = snapshot.radar_items.find((candidate) => relatedIds.has(candidate.id) && candidate.why_it_matters?.trim());
  if (locale === "zh") {
    const override = chineseReaderContentOverride(event);
    if (override) return override.why;
    const itemJudgment = item?.why_it_matters?.trim() ?? "";
    if (containsHan(itemJudgment)) return publicText(itemJudgment);
    if (containsHan(event.score_reason) && !/(?:综合分|AI\s*相关度|重要性|来源家族|来源家庭|来源覆盖|独立性未验证|单一来源)/u.test(event.score_reason)) {
      return publicText(event.score_reason);
    }
    const judgments: Record<string, string> = {
      agent: "这项变化可能重塑智能体的工作方式和自动化边界，值得评估对现有流程的实际影响。",
      benchmark: "这组结果会影响能力判断与模型比较，但仍需要结合测试条件和独立复核解读。",
      business: "这条变化反映了市场竞争、客户选择或商业模式正在调整，可能影响后续产品与合作判断。",
      funding: "资金流向通常会提前暴露行业押注方向，但估值与实际交付能力仍需分开判断。",
      infrastructure: "基础设施变化会直接影响推理成本、部署方式和产品可扩展性，值得持续跟踪。",
      model_release: "新模型会改变能力边界、成本和产品选型，需要继续核对实际表现与使用限制。",
      open_source: "开源进展可能降低使用门槛并加快生态扩散，适合评估能否进入现有技术栈。",
      policy: "政策变化会影响产品上线、数据使用和合规边界，相关团队需要提前判断影响范围。",
      product_update: "这项产品变化可能直接改变用户工作流和团队选型，值得关注真实可用性与迁移成本。",
      regulation: "监管信号会改变产品责任和合规要求，企业需要结合正式文本继续核实。",
      research: "这项研究可能改变对能力机制或技术路线的理解，但距离稳定产品化仍需更多验证。",
      safety: "这条动态涉及模型风险与责任边界，值得结合原始证据判断其实际严重性。",
      tooling: "工具能力的变化可能直接提升开发效率，也需要评估稳定性、兼容性和团队迁移成本。"
    };
    return judgments[categoryFilterValue(event.category)] ?? "这条动态可能影响产品判断、技术选型或后续行业走向，值得继续跟踪。";
  }
  return `This development may affect product decisions, technical choices or the direction of the AI market. ${event.source_count > 1 ? `${event.source_count} sources are available for comparison.` : "Only one public source is currently available."}`;
}

function renderStoryRow(event: SnapshotEvent, snapshot: Snapshot, locale: "en" | "zh") {
  const title = locale === "en" ? eventEnglishTitle(event, snapshot) : chineseEventTitle(event);
  const summary = locale === "en" ? eventEnglishSummary(event, snapshot) : chineseEventSummary(event);
  const sources = eventSources(event).join(" · ") || (locale === "en" ? "Public source" : "公开来源");
  const sourceCount = locale === "en" ? `${event.source_count} source${event.source_count === 1 ? "" : "s"}` : `${event.source_count} 个来源`;
  const category = locale === "en" ? categoryLabelEn(event.category) : labelize(event.category);
  const timestamp = feedDateTime(event.latest_seen_at, locale);
  return `<article class="event-card story-row" ${storyDataAttributes(event, snapshot, title, summary)}>
    <div class="story-time"><time datetime="${escapeAttr(event.latest_seen_at)}" title="${escapeAttr(`${timestamp.date} ${timestamp.time} · ${locale === "en" ? "UTC" : "北京时间"}`)}"><span class="story-date">${escapeHtml(timestamp.date)}</span><span class="story-clock">${escapeHtml(timestamp.time)}</span></time><i aria-hidden="true"></i></div>
    <div class="story-content">
      <div class="story-meta"><span>${escapeHtml(sources)}</span><strong>${escapeHtml(sourceCount)}</strong></div>
      <h2><a href="${escapeAttr(eventPrimaryUrl(event))}">${escapeHtml(title)}</a></h2>
      ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
      <p class="story-judgment"><strong>${locale === "en" ? "Why it matters" : "为什么值得看"}</strong>${escapeHtml(eventReaderJudgment(event, snapshot, locale))}</p>
      <div class="story-foot"><span>${escapeHtml(category)}</span><span>${escapeHtml(sourceCount)}</span></div>
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
  return events.slice(0, 10).map((event, index) => {
    const title = locale === "en" ? eventEnglishTitle(event, snapshot) : chineseEventTitle(event);
    const summary = locale === "en" ? eventEnglishSummary(event, snapshot) : chineseEventSummary(event);
    const sources = locale === "en" ? `${event.source_count} source${event.source_count === 1 ? "" : "s"}` : `${event.source_count} 个来源`;
    const category = locale === "en" ? categoryLabelEn(event.category) : labelize(event.category);
    const sourceNames = eventSources(event, 2).join(" · ") || (locale === "en" ? "Public source" : "公开来源");
    const timestamp = feedDateTime(event.latest_seen_at, locale);
    return `<article class="top-story story-row" ${storyDataAttributes(event, snapshot, title, summary)}>
      <span class="hot-rank">${String(index + 1).padStart(2, "0")}</span>
      <div class="hot-meta"><time datetime="${escapeAttr(event.latest_seen_at)}" title="${escapeAttr(locale === "en" ? "UTC" : "北京时间")}">${escapeHtml(`${timestamp.date} · ${timestamp.time}`)}</time><span>${escapeHtml(sourceNames)}</span><small>${escapeHtml(category)}</small></div>
      <div class="hot-copy"><h2><a href="${escapeAttr(eventPrimaryUrl(event))}">${escapeHtml(title)}</a></h2><p>${escapeHtml(summary)}</p></div>
      <div class="hot-judgment"><strong>${locale === "en" ? "Why it matters" : "为什么值得看"}</strong><p>${escapeHtml(eventReaderJudgment(event, snapshot, locale))}</p><small>${escapeHtml(`${sources} · ${locale === "en" ? eventScoreLabelEn(event.event_score_label) : event.event_score_label}`)}</small></div>
    </article>`;
  }).join("");
}

function storyFilterScript() {
  return `(function(){
    const input=document.querySelector("#feed-search");
    const buttons=Array.from(document.querySelectorAll("[data-feed-category]"));
    const familyButtons=Array.from(document.querySelectorAll("[data-feed-family]"));
    const rows=Array.from(document.querySelectorAll(".story-row"));
    if(!input||buttons.length===0)return;
    let category="all";
    let family="all";
    function apply(){
      const query=input.value.trim().toLowerCase();
      const values=category==="all"?[]:category.split(",");
      const familyValues=family==="all"?[]:family.split(",");
      rows.forEach(row=>{const categoryText=(row.dataset.category||"").toLowerCase();const familyText=(row.dataset.family||"").toLowerCase();const matchesCategory=values.length===0||values.some(value=>categoryText.includes(value));const matchesFamily=familyValues.length===0||familyValues.some(value=>familyText.includes(value));const matchesQuery=!query||(row.dataset.search||"").includes(query);row.hidden=!(matchesCategory&&matchesFamily&&matchesQuery);});
    }
    input.addEventListener("input",apply);
    buttons.forEach(button=>button.addEventListener("click",()=>{category=button.dataset.feedCategory||"all";buttons.forEach(candidate=>{const active=candidate===button;candidate.classList.toggle("active",active);candidate.setAttribute("aria-pressed",active?"true":"false");});apply();}));
    familyButtons.forEach(button=>button.addEventListener("click",()=>{family=button.dataset.feedFamily||"all";familyButtons.forEach(candidate=>{const active=candidate===button;candidate.classList.toggle("active",active);candidate.setAttribute("aria-pressed",active?"true":"false");});apply();}));
    buttons.forEach((button,index)=>button.setAttribute("aria-pressed",index===0?"true":"false"));
    familyButtons.forEach((button,index)=>button.setAttribute("aria-pressed",index===0?"true":"false"));
  })();`;
}

function sourceEvents(snapshot: Snapshot) {
  return eventFeed(snapshot).filter(readerReadyEvent).slice(0, 50);
}

function sourcePublishers(snapshot: Snapshot) {
  return uniqueStrings(
    snapshot.radar_items
      .toSorted((left, right) => Date.parse(right.published_at ?? right.collected_at) - Date.parse(left.published_at ?? left.collected_at))
      .map((item) => item.source_name)
  );
}

function renderSources(snapshot: Snapshot) {
  const events = sourceEvents(snapshot);
  const publishers = sourcePublishers(snapshot);
  const publicSourceCount = snapshot.coverage.sources_with_public_items ?? publishers.length;
  const attempted = snapshot.coverage.attempted_sources ?? 0;
  const fetched = snapshot.coverage.fetched_sources ?? 0;
  const refreshStatus = attempted > 0 ? `本轮 ${fetched}/${attempted} 个来源抓取成功` : "按最近更新时间排列";
  return shell(snapshot, "sources", 1, "来源", `
    <section class="reader-heading compact"><div><div class="reader-title-line"><h1>来源</h1><span>${publicSourceCount} 个公开来源</span></div><p>${refreshStatus}。公司、研究机构、媒体与开源社区的公开更新按时间汇入同一条阅读流。</p></div></section>
    <section class="publisher-index" aria-label="信息来源">${publishers.map((publisher) => `<span>${escapeHtml(publisher)}</span>`).join("")}</section>
    <section class="latest-feed"><div class="section-heading"><h2>最近更新</h2><span>${events.length} 条</span></div><div class="story-stream">${renderStoryStream(events, snapshot, "zh")}</div></section>
  `);
}

function renderEnglishSources(snapshot: Snapshot) {
  const events = sourceEvents(snapshot).filter((event) => readerReadyEventForLocale(event, snapshot, "en"));
  const publishers = sourcePublishers(snapshot);
  const publicSourceCount = snapshot.coverage.sources_with_public_items ?? publishers.length;
  const attempted = snapshot.coverage.attempted_sources ?? 0;
  const fetched = snapshot.coverage.fetched_sources ?? 0;
  const refreshStatus = attempted > 0 ? `${fetched} of ${attempted} sources fetched in the latest run` : "Ordered by latest update";
  return englishShell(snapshot, "sources", 1, "Sources", `
    <section class="reader-heading compact"><div><div class="reader-title-line"><h1>Sources</h1><span>${publicSourceCount} public sources</span></div><p>${refreshStatus}. Companies, research labs, publishers and open-source communities share one reading stream.</p></div></section>
    <section class="publisher-index" aria-label="Sources">${publishers.map((publisher) => `<span>${escapeHtml(publisher)}</span>`).join("")}</section>
    <section class="latest-feed"><div class="section-heading"><h2>Latest updates</h2><span>${events.length} items</span></div><div class="story-stream">${renderStoryStream(events, snapshot, "en")}</div></section>
  `);
}

function renderAbout(snapshot: Snapshot) {
  return shell(snapshot, "about", 1, "关于", `
    <article class="about-reader">
      <header><h1>把真正值得看的 AI 动态留下来</h1><p>AI 行业雷达每天聚合公开来源，合并重复报道，补充中文摘要和判断，帮助你更快知道发生了什么、为什么值得看。</p></header>
      <section><h2>我们怎么选</h2><p>先排除低相关和重复内容，再结合新鲜度、来源可信度、重要性与多源报道情况排序。单一来源不会被包装成已经确认的事实。</p></section>
      <section><h2>你会看到什么</h2><p>模型与产品更新、开发工具、开源项目、研究论文、商业变化和政策动态。每条内容都保留原文入口，摘要只用于帮助判断是否值得继续阅读。</p></section>
      <section><h2>内容边界</h2><p>本站是公开信息的聚合摘要与阅读索引。原文版权归各来源所有；引用数字、政策或原话前，请回到原文复核。</p></section>
    </article>
  `);
}

function renderEnglishAbout(snapshot: Snapshot) {
  return englishShell(snapshot, "about", 1, "About", `
    <article class="about-reader">
      <header><h1>Keep the AI developments that are actually worth reading</h1><p>AI Industry Radar aggregates public sources, merges repeated coverage and adds concise summaries and editorial judgment.</p></header>
      <section><h2>How items are selected</h2><p>Low-relevance and duplicate material is filtered first. Freshness, source credibility, importance and source breadth then shape the order. A single source is never presented as independent confirmation.</p></section>
      <section><h2>What appears here</h2><p>Models, products, developer tools, open-source projects, research, business shifts and policy developments. Every item keeps a path back to the original source.</p></section>
      <section><h2>Editorial boundary</h2><p>This site is a public-information summary and reading index. Original rights remain with each publisher; verify figures, policies and quotations in the linked source.</p></section>
    </article>
  `);
}

function renderEnglishHome(snapshot: Snapshot) {
  const events = eventFeed(snapshot).filter((event) => readerReadyEventForLocale(event, snapshot, "en"));
  const topEvents = selectHomepageEvents(events, 10);
  const topIds = new Set(topEvents.map((event) => event.event_cluster_id));
  const latestEvents = events.filter((event) => !topIds.has(event.event_cluster_id)).slice(0, 26);
  return englishShell(snapshot, "home", 0, "Today's hot topics", `
    <section class="reader-heading"><div><div class="reader-title-line"><h1>Today's hot topics</h1><time>${escapeHtml(feedDayLabel(snapshot.generated_at, "en"))}</time></div><p>Noise filtered out. Only the AI developments worth reading remain.</p></div><div class="feed-search"><input id="feed-search" type="search" placeholder="Search updates, companies or products" aria-label="Search headlines, summaries and sources"></div></section>
    <section class="feed-toolbar"><div class="feed-chips"><button class="active" data-feed-category="all" type="button">All</button><button data-feed-category="model_release,benchmark" type="button">Models</button><button data-feed-category="product_update,agent,tooling" type="button">Products</button><button data-feed-category="business,regulation,policy,funding,infrastructure,safety" type="button">Industry</button><button data-feed-category="research" type="button">Research</button><button data-feed-category="open_source" type="button">Open source</button></div></section>
    <section class="top-stories"><div class="section-heading"><h2>Today's hot topics</h2><span>TOP 10</span></div>${renderTopStories(topEvents, snapshot, "en")}</section>
    <section class="latest-feed"><div class="section-heading"><h2>Latest updates</h2><a href="radar/?tab=events">View all</a></div><div class="story-stream">${renderStoryStream(latestEvents, snapshot, "en")}</div></section>
    <div class="feed-more"><a class="button primary" href="radar/?tab=events">Browse all events</a></div>
    <script>${storyFilterScript()}</script>
  `);
}

function renderEnglishRadar(snapshot: Snapshot) {
  const events = eventFeed(snapshot).filter((event) => readerReadyEventForLocale(event, snapshot, "en"));
  return englishShell(snapshot, "radar", 1, "All updates", `
    <section class="reader-heading"><div><div class="reader-title-line"><h1>All AI updates</h1><span>${events.length} items</span></div><p>Browse the complete event stream by source type, topic or keyword.</p></div><div class="feed-search"><input id="feed-search" type="search" placeholder="Search title, summary or source" aria-label="Search updates"></div></section>
    <section class="feed-toolbar full-toolbar">
      <div class="filter-line"><span>Sources</span><div class="feed-chips"><button class="active" data-feed-family="all" type="button">All</button><button data-feed-family="公司/实验室" type="button">First-party</button><button data-feed-family="分析/媒体,其他公开来源" type="button">News</button><button data-feed-family="研究订阅" type="button">Research</button><button data-feed-family="开源项目" type="button">Open source</button></div></div>
      <div class="filter-line"><span>Topics</span><div class="feed-chips"><button class="active" data-feed-category="all" type="button">All</button><button data-feed-category="model_release,benchmark" type="button">Models</button><button data-feed-category="product_update,agent,tooling" type="button">Products</button><button data-feed-category="business,regulation,policy,funding,infrastructure,safety" type="button">Industry</button><button data-feed-category="research" type="button">Research</button><button data-feed-category="open_source" type="button">Open source</button></div></div>
    </section>
    <section class="latest-feed"><div class="section-heading"><h2>Latest</h2><span>${events.length}</span></div><div class="story-stream">${renderStoryStream(events, snapshot, "en")}</div></section>
    <script>${storyFilterScript()}</script>
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
    "Which model releases are covered by more than one source?",
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
  const topEvents = selectHomepageEvents(events, 10);
  const topIds = new Set(topEvents.map((event) => event.event_cluster_id));
  const latestEvents = events.filter((event) => !topIds.has(event.event_cluster_id)).slice(0, 26);
  return shell(snapshot, "home", 0, "今日热点", `
    <section class="reader-heading"><div><div class="reader-title-line"><h1>今日热点</h1><time>${escapeHtml(feedDayLabel(snapshot.generated_at, "zh"))}</time></div><p>每天筛掉噪声，只留下真正值得看的 AI 动态。</p></div><div class="feed-search"><input id="feed-search" type="search" placeholder="搜索动态、公司、产品或关键词" aria-label="搜索标题、摘要和来源"></div></section>
    <section class="feed-toolbar"><div class="feed-chips"><button class="active" data-feed-category="all" type="button">全部</button><button data-feed-category="model_release,benchmark" type="button">模型</button><button data-feed-category="product_update,agent,tooling" type="button">产品</button><button data-feed-category="business,regulation,policy,funding,infrastructure,safety" type="button">行业</button><button data-feed-category="research" type="button">论文</button><button data-feed-category="open_source" type="button">开源</button></div></section>
    <section class="top-stories"><div class="section-heading"><h2>今日热点</h2><span>TOP 10</span></div>${renderTopStories(topEvents, snapshot, "zh")}</section>
    <section class="latest-feed"><div class="section-heading"><h2>最新动态</h2><a href="radar/?tab=events">查看全部</a></div><div class="story-stream">${renderStoryStream(latestEvents, snapshot, "zh")}</div></section>
    <div class="feed-more"><a class="button primary" href="radar/?tab=events">查看全部事件</a></div>
    <script>${storyFilterScript()}</script>
  `);
}

function renderRadar(snapshot: Snapshot) {
  const events = eventFeed(snapshot).filter(readerReadyEvent);
  return shell(snapshot, "radar", 1, "全部动态", `
    <section class="reader-heading"><div><div class="reader-title-line"><h1>全部 AI 动态</h1><span>${events.length} 条</span></div><p>按来源、主题或关键词浏览完整信息流。</p></div><div class="feed-search"><input id="feed-search" type="search" placeholder="搜索标题、摘要或来源" aria-label="搜索全部动态"></div></section>
    <section class="feed-toolbar full-toolbar">
      <div class="filter-line"><span>来源</span><div class="feed-chips"><button class="active" data-feed-family="all" type="button">全部</button><button data-feed-family="公司/实验室" type="button">一手信源</button><button data-feed-family="分析/媒体,其他公开来源" type="button">资讯</button><button data-feed-family="研究订阅" type="button">论文</button><button data-feed-family="开源项目" type="button">开源</button></div></div>
      <div class="filter-line"><span>分类</span><div class="feed-chips"><button class="active" data-feed-category="all" type="button">全部</button><button data-feed-category="model_release,benchmark" type="button">模型</button><button data-feed-category="product_update,agent,tooling" type="button">产品</button><button data-feed-category="business,regulation,policy,funding,infrastructure,safety" type="button">行业</button><button data-feed-category="research" type="button">论文</button><button data-feed-category="open_source" type="button">开源</button></div></div>
    </section>
    <section class="latest-feed"><div class="section-heading"><h2>最新动态</h2><span>${events.length}</span></div><div class="story-stream">${renderStoryStream(events, snapshot, "zh")}</div></section>
    <script>${storyFilterScript()}</script>
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

function navIcon(id: "home" | "radar" | "sources" | "about") {
  const paths = {
    home: '<path d="M12 2.8c.8 3.6-.4 5.3-2.2 7 2.7-.4 4.3-2.3 4.8-4.5 2.2 2 3.4 4.5 3.4 7.2A6 6 0 1 1 6 12.2c0-2.2 1.2-4.5 3.2-6.5.1 2.1.9 3.2 2.1 3.7C12.4 7.8 12.8 5.8 12 2.8Z"/>',
    radar: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="7" cy="6" r="1"/><circle cx="11" cy="12" r="1"/><circle cx="16" cy="18" r="1"/>',
    sources: '<path d="M5 5.5h14v10H9l-4 3v-13Z"/><path d="M9 9h6M9 12h4"/>',
    about: '<circle cx="12" cy="12" r="9"/><path d="M12 10.5v6M12 7.5h.01"/>'
  } as const;
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[id]}</svg>`;
}

function englishShell(
  snapshot: Snapshot,
  current: "home" | "radar" | "ask" | "sources" | "about",
  depth: 0 | 1,
  title: string,
  body: string
) {
  const localePrefix = depth === 0 ? "" : "../";
  const assetPrefix = depth === 0 ? "../" : "../../";
  const chineseHref = current === "home" ? "../index.html" : `../../${current}/`;
  const englishHref = current === "home" ? "index.html" : `${localePrefix}${current}/`;
  const nav = [
    ["home", "Hot topics", `${localePrefix}index.html`],
    ["radar", "All updates", `${localePrefix}radar/?tab=events`],
    ["sources", "Sources", `${localePrefix}sources/`],
    ["about", "About", `${localePrefix}about/`]
  ] as const;
  const browserTitle = current === "home" ? "AI 行业信息雷达" : `${title} - AI 行业信息雷达`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="AI Industry Radar public event intelligence">
    <title>${escapeHtml(browserTitle)}</title>
    <link rel="icon" href="${assetPrefix}favicon.svg" type="image/svg+xml">
    <link rel="alternate" hreflang="zh-CN" href="${escapeAttr(chineseHref)}">
    <link rel="alternate" hreflang="en" href="${escapeAttr(englishHref)}">
    <link rel="stylesheet" href="${assetPrefix}assets/styles.css">
  </head>
  <body${current === "home" ? ' class="home-page"' : ""}>
    <div class="app-layout">
      <aside class="desktop-sidebar">
        <a class="brand" href="${localePrefix}index.html"><span>AI RADAR</span><i aria-hidden="true"></i></a>
        <nav class="side-nav" aria-label="Primary navigation">
          ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${navIcon(id)}<span>${escapeHtml(label)}</span></a>`).join("")}
        </nav>
        <div class="sidebar-language language-switch" aria-label="Language"><a lang="zh-CN" href="${escapeAttr(chineseHref)}">中</a><a aria-current="true" href="${escapeAttr(englishHref)}">EN</a></div>
      </aside>
      <div class="app-frame">
        <header class="mobile-header">
          <a class="mobile-brand" href="${localePrefix}index.html">AI RADAR</a>
          <div class="language-switch" aria-label="Language"><a lang="zh-CN" href="${escapeAttr(chineseHref)}">中</a><a aria-current="true" href="${escapeAttr(englishHref)}">EN</a></div>
        </header>
        <main>${body}</main>
        <footer class="site-footer">
          <div class="site-footer-copy"><span>AI Industry Radar · public-source reading index</span><span>Created by Song Luo</span></div>
          <nav class="site-footer-links" aria-label="Footer navigation"><a href="${localePrefix}about/">About</a><a href="https://github.com/rrrrrredy" rel="noreferrer" target="_blank">GitHub</a></nav>
        </footer>
      </div>
    </div>
    <nav class="mobile-nav" aria-label="Mobile navigation">
      ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${navIcon(id)}<span>${escapeHtml(label)}</span></a>`).join("")}
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
  return `${categoryLabelEn(item.categories[0] ?? "other")}: ${subject || "original-language item"}`;
}

function eventEnglishTitle(event: SnapshotEvent, snapshot: Snapshot) {
  const items = eventEnglishItems(event, snapshot);
  const englishItem = items.find((item) => !containsHan(item.title));
  if (englishItem) return englishItem.title;
  if (items[0]) return englishItemTitle(items[0]);
  const timelineTitle = event.timeline.find((entry) => !containsHan(entry.title))?.title;
  return timelineTitle || `${categoryLabelEn(event.category)}: ${event.related_entities.filter((entity) => !containsHan(entity)).slice(0, 3).map(entityLabelEn).join(" · ") || "original-language item"}`;
}

function eventEnglishSummary(event: SnapshotEvent, snapshot: Snapshot) {
  const summary = eventEnglishItems(event, snapshot)
    .map((item) => item.summary_en?.trim())
    .find((value) => value && !containsHan(value));
  if (summary && !containsEnglishReaderPipelineBoilerplate(summary)) {
    return summary
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/(?:^|\s)#{1,6}\s+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return genericEnglishEventSummary(event, snapshot);
}

function containsEnglishReaderPipelineBoilerplate(value: string) {
  return /\b(?:Metadata-level item|Item summary|Evidence text|Announce Type|Phase 4)\b|\barXiv:\d{4}\.\d+(?:v\d+)?\b|\bAbstract\s*:/iu.test(value);
}

function genericEnglishEventSummary(event: SnapshotEvent, snapshot: Snapshot) {
  const title = eventEnglishTitle(event, snapshot);
  if (event.category === "research" || event.category === "benchmark") {
    return `This public research item examines “${title}”. Evidence currently comes from ${event.source_count} source${event.source_count === 1 ? "" : "s"}; review the paper before relying on its methods or conclusions.`;
  }
  return `This public update concerns “${title}”. Available evidence currently covers ${event.source_count} source${event.source_count === 1 ? "" : "s"}; review the original source for capabilities, limitations and impact.`;
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

function eventScoreLabelEn(value: string) {
  const labels: Record<SnapshotEvent["event_score_label"], string> = {
    "高优先级": "High priority",
    "关注": "Watch",
    "观察": "Monitor",
    "噪音/低相关": "Low relevance"
  };
  return labels[value as SnapshotEvent["event_score_label"]] ?? value;
}

function shell(snapshot: Snapshot, current: "home" | "radar" | "ask" | "sources" | "about", depth: 0 | 1 | 2, title: string, body: string) {
  const prefix = depth === 0 ? "" : depth === 1 ? "../" : "../../";
  const chineseHref = current === "home" ? `${prefix}index.html` : `${prefix}${current}/`;
  const englishHref = current === "home" ? `${prefix}en/` : `${prefix}en/${current}/`;
  const nav = [
    ["home", "今日热点", `${prefix}index.html`],
    ["radar", "全部动态", `${prefix}radar/?tab=events`],
    ["sources", "来源", `${prefix}sources/`],
    ["about", "关于", `${prefix}about/`]
  ] as const;
  const browserTitle = current === "home" ? "AI 行业信息雷达" : `${title} - AI 行业信息雷达`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="AI 行业信息雷达公开信息阅读索引">
    <title>${escapeHtml(browserTitle)}</title>
    <link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
    <link rel="alternate" hreflang="zh-CN" href="${escapeAttr(chineseHref)}">
    <link rel="alternate" hreflang="en" href="${escapeAttr(englishHref)}">
    <link rel="stylesheet" href="${prefix}assets/styles.css">
  </head>
  <body${current === "home" ? ' class="home-page"' : ""}>
    <div class="app-layout">
      <aside class="desktop-sidebar">
        <a class="brand" href="${prefix}index.html"><span>AI 行业雷达</span><i aria-hidden="true"></i></a>
        <nav class="side-nav" aria-label="主导航">
          ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${navIcon(id)}<span>${escapeHtml(label)}</span></a>`).join("")}
        </nav>
        <div class="sidebar-language language-switch" aria-label="语言"><a aria-current="true" href="${escapeAttr(chineseHref)}">中</a><a lang="en" href="${escapeAttr(englishHref)}">EN</a></div>
      </aside>
      <div class="app-frame">
        <header class="mobile-header">
          <a class="mobile-brand" href="${prefix}index.html">AI 行业雷达</a>
          <div class="language-switch" aria-label="语言"><a aria-current="true" href="${escapeAttr(chineseHref)}">中</a><a lang="en" href="${escapeAttr(englishHref)}">EN</a></div>
        </header>
        <main>${body}</main>
        <footer class="site-footer">
          <div class="site-footer-copy"><span>AI 行业雷达 · 公开信息阅读索引</span><span>Created by Song Luo</span></div>
          <nav class="site-footer-links" aria-label="页脚导航"><a href="${prefix}about/">关于</a><a href="https://github.com/rrrrrredy" rel="noreferrer" target="_blank">GitHub</a></nav>
        </footer>
      </div>
    </div>
    <nav class="mobile-nav" aria-label="移动导航">
      ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${navIcon(id)}<span>${escapeHtml(label)}</span></a>`).join("")}
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
    deepmind: "DeepMind",
    github: "GitHub",
    google: "Google",
    "gpt 5 6": "GPT-5.6",
    "gpt red": "GPT-Red",
    "hugging face": "Hugging Face",
    "hugging face transformers": "Hugging Face Transformers",
    "llama cpp": "llama.cpp",
    microsoft: "Microsoft",
    "microsoft 365 copilot": "Microsoft 365 Copilot",
    nvidia: "NVIDIA",
    openai: "OpenAI",
    "openai python sdk": "OpenAI Python SDK",
    "deepstream 9 1": "DeepStream 9.1",
    vllm: "vLLM",
    xai: "xAI",
    "vllm project vllm": "vLLM"
  };
  return aliases[value.trim().toLowerCase()] ?? value;
}











const chineseReaderContentOverrides = [
  {
    match: "GPT-Red: Unlocking Self-Improvement for Robustness",
    title: "OpenAI 发布 GPT-Red 红队系统",
    summary: "OpenAI 发布 GPT-Red，通过自我对弈自动生成攻击与防御策略，用于提升模型在越狱、提示注入和对齐场景下的鲁棒性。",
    why: "自动化红队能力会改变模型安全测试的速度与覆盖面，但安全收益仍需结合真实攻击和外部评估验证。"
  },
  {
    match: "Anthropic found a hidden space where Claude puzzles over concepts",
    title: "Anthropic 披露 Claude 内部表征研究",
    summary: "Anthropic 使用 Jacobian Lens 研究 Claude 在回答问题时的内部表征，尝试把模型概念处理过程变得更可观察。",
    why: "更可观察的内部表征可能推进模型可解释性与安全评估，但方法的稳定性和适用范围仍需独立验证。"
  },
  {
    match: "OpenAI releases a $230 keyboard for Codex",
    title: "OpenAI 推出 Codex 硬件键盘",
    summary: "OpenAI 推出一款面向 Codex 编程工作流的 230 美元硬件键盘，试图把智能体操作入口延伸到专用硬件。",
    why: "专用硬件意味着 Codex 正从软件功能走向完整工作流入口，但真实效率、兼容性和用户需求仍待验证。"
  },
  {
    match: "Apple’s lawsuit against OpenAI",
    title: "Apple 起诉 OpenAI：指控窃取硬件商业机密",
    summary: "Apple 起诉 OpenAI，指控其在招聘与硬件研发过程中获取未发布组件、样品和机密资料；相关主张仍需等待司法程序核实。",
    why: "这场诉讼会影响 AI 公司的人才招聘、硬件研发边界和商业机密合规，后续证据与判决值得持续跟踪。"
  },
  {
    match: "Safety and alignment in an era of long-horizon models",
    title: "OpenAI 总结长程模型部署经验：安全与对齐风险随任务时长上升",
    summary: "OpenAI 总结长程模型的部署经验，指出模型运行时间拉长后会出现新的安全风险与失败模式，并介绍通过迭代部署改进防护的做法。",
    why: "长程智能体正在进入真实工作流，任务持续时间带来的失控与累积误差会直接影响产品安全边界。"
  },
  {
    match: "Firefighting drones in the works as wildfires plague US nearly year-round",
    title: "美国探索用无人机扑灭早期野火，应对全年化火灾风险",
    summary: "加州与 XPRIZE 正测试无人机能否在野火扩散前完成识别和扑救，以应对美国野火季逐渐全年化的趋势；实际效果仍需现场数据验证。",
    why: "自主无人机若能缩短发现和处置时间，可能改变高风险应急体系，但识别准确率、调度与安全责任同样关键。"
  },
  {
    match: "China’s AI models have Trump’s AI world at war with itself",
    title: "中国 AI 模型在特朗普阵营内部引发路线争议",
    summary: "围绕是否以及如何使用中国 AI 模型，特朗普阵营的现任与前任 AI 顾问公开交锋，反映美国 AI 政策内部在开放竞争、安全与产业保护之间的分歧。",
    why: "这场争议可能影响美国对中国模型、开源生态与采购限制的政策走向，值得继续跟踪实际规则变化。"
  },
  {
    match: "AI is more likely than humans to form biases when hiring",
    title: "研究发现 AI 招聘筛选比人类更容易形成偏见",
    summary: "研究发现，在招聘筛选场景中，AI 比人类更容易形成或放大偏见，提醒企业重新审视自动化招聘的评估与问责机制。",
    why: "如果偏见在招聘自动化环节被规模化，企业会同时面临公平性、合规和可申诉性风险。"
  },
  {
    match: "Causal-Audit:",
    title: "Causal-Audit 提出可审计图推理：用目标感知因果链回答干预问题",
    summary: "论文提出 Causal-Audit，通过面向目标的因果链构建，让图推理过程更易追踪和审计；实际效果仍需结合基准结果与消融实验判断。",
    why: "把推理链显式化并可审计，有机会提高因果问答的可信度，但是否优于现有方法仍要看独立复现。"
  },
  {
    match: "GraphDx:",
    title: "GraphDx 用成本感知多智能体框架改进序贯诊断",
    summary: "论文提出 GraphDx，在序贯诊断中结合知识增强、多智能体协作与成本控制，目标是在诊断准确率和信息采集成本之间取得平衡。",
    why: "医疗诊断智能体必须同时控制准确率与信息成本；该框架能否安全泛化，决定了它是否具有临床价值。"
  },
  {
    match: "VarRate:",
    title: "VarRate 无需训练即可动态压缩长上下文 KV Cache",
    summary: "论文提出 VarRate，无需额外训练即可按层和上下文动态调整 KV Cache 压缩率，目标是在长上下文推理中降低显存占用。",
    why: "KV Cache 是长上下文推理的主要显存瓶颈；无需训练的动态压缩若经验证有效，可直接降低部署成本。"
  },
  {
    match: "Large Language Models as Unified Multimodal Learners for Clinical Prediction",
    title: "研究探索用大模型统一多模态临床预测",
    summary: "论文研究如何用大语言模型统一处理临床文本与结构化指标，以支持临床预测；仍需重点核对数据集、泛化能力与医疗安全边界。",
    why: "统一处理文本和结构化病历可能简化临床预测管线，但泛化、偏差与安全验证不可省略。"
  },
  {
    match: "Cura 1T:",
    title: "Cura 1T 发布：面向医疗智能体的专用模型",
    summary: "论文介绍 Cura 1T，一款面向医疗智能体任务的专用大模型，覆盖高风险沟通、专业推理与工作流执行；医疗场景表现仍需独立验证。",
    why: "医疗专用智能体模型可能提升工作流能力，但高风险场景必须依赖独立临床评估和治理。"
  },
  {
    match: "Verbalizable Representations Form a Global Workspace",
    title: "研究发现语言模型中的可表达表征形成“全局工作空间”",
    summary: "论文研究语言模型中可被语言化的内部表征，提出其可能形成类似“全局工作空间”的共享机制；结论仍需结合实验设计审慎解读。",
    why: "如果内部表征存在可共享的全局机制，将影响可解释性研究；目前它仍是需要独立复核的论文结论。"
  },
  {
    match: "Will AI fix prior authorization",
    title: "美国试点用 AI 审核医疗保险预授权，效果与风险仍待检验",
    summary: "美国政府正在试点用 AI 辅助医疗保险预授权决策。效率提升之外，误拒、可解释性与申诉机制仍是需要持续验证的关键风险。",
    why: "AI 可能加快审批，也可能把错误拒付规模化；人工复核、可解释性和申诉权是落地关键。"
  },
  {
    match: "Google-backed satellites for wildfire detection",
    title: "Google 支持的 FireSat 卫星升空，用于更早发现野火",
    summary: "Google 支持的 FireSat 卫星已发射，计划通过更高频率的地球观测帮助更早发现野火；覆盖能力和预警效果仍需后续运行数据验证。",
    why: "更早发现野火可直接缩短响应时间，但成效取决于轨道覆盖、识别准确率以及与应急系统的衔接。"
  },
  {
    match: "A scorecard for the AI age",
    title: "OpenAI 首席财务官 Sarah Friar 提出 AI 投资回报评分卡",
    summary: "OpenAI 首席财务官 Sarah Friar 提出一套 AI 投资回报评分方法，重点衡量有效工作量、单次成功任务成本、可靠性与算力回报。",
    why: "企业正从“是否采用 AI”转向“如何量化回报”，这套指标可能影响预算、采购和规模化部署判断。"
  },
  {
    match: "The risk of weather data sabotage is rising",
    title: "天气数据遭破坏风险上升，关键基础设施面临连锁影响",
    summary: "天气预报支撑航空、电网和农业等关键决策。相关数据一旦被篡改或破坏，可能引发跨行业连锁风险，数据完整性与溯源能力因此更加重要。",
    why: "天气数据是多类关键基础设施的共同输入，一处污染可能被自动化决策链迅速放大。"
  },
  {
    match: "Anthropic Python SDK 发布 v0.117.0",
    title: "Anthropic SDK v0.117.0 修复凭证泄露并加入 MCP Tunnels",
    summary: "Anthropic Python SDK v0.117.0 新增 MCP Tunnels 支持，并修复可能泄露凭证的安全问题；使用相关功能的开发者应核对变更并及时升级。",
    why: "凭证泄露修复会直接影响生产安全；使用旧版 SDK 或 MCP 集成的团队应优先核对升级。"
  },
  {
    match: "Hugging Face Transformers 发布 v5.14.0",
    title: "Hugging Face Transformers v5.14.0 加入 Inkling 与 TIPSv2",
    summary: "Hugging Face Transformers v5.14.0 新增 Inkling 多模态模型与 TIPSv2 模型支持，并包含其他兼容性更新。",
    why: "主流开源模型库新增架构会直接影响加载、推理和生态适配，开发者应结合变更记录评估升级。"
  },
  {
    match: "Why teens deserve access to safe AI",
    title: "OpenAI 为青少年 ChatGPT 增加安全保护与家长控制",
    summary: "OpenAI 介绍面向青少年的 ChatGPT 安全措施，包括适龄保护、学习工具、家长控制和专家合作；实际保护效果仍需结合落地机制评估。",
    why: "青少年保护正在成为消费级 AI 的产品责任基线，关键不只是功能发布，而是能否被验证和持续执行。"
  },
  {
    match: "How Cars24 scales conversations",
    title: "Cars24 用 OpenAI 语音与聊天智能体每月处理超 100 万分钟对话",
    summary: "Cars24 使用 OpenAI 驱动的语音与聊天智能体，每月处理超过 100 万分钟对话，并称由此挽回部分流失线索、加快内部智能体工作流落地。",
    why: "这是智能体进入高频业务流程的规模化案例，但成本、成功率和人工接管比例仍需结合完整数据评估。"
  },
  {
    match: "OmniPMNet:",
    title: "OmniPM-Net 融合站点与网格数据，改进 PM10 预测",
    summary: "论文提出 OmniPM-Net，把离散监测站预测与网格化气象数据融合，用于生成更一致的 PM10 预测；跨地区泛化能力仍需独立验证。",
    why: "同时兼顾站点精度和连续空间预测，可改善污染预警，但真实部署价值取决于不同地区和极端天气下的稳定性。"
  },
  {
    match: "Anomalous Frame Detection Using VLM-Based Description Comparison",
    title: "研究用 VLM 检测异常视频帧，提取专家操作与决策场景",
    summary: "论文利用视觉语言模型比较视频帧描述并分析视频内相似性，尝试自动识别专家特定动作和情境决策场景。",
    why: "如果能稳定提取专家隐性操作，这类方法可用于培训与流程分析；目前样本规模和识别准确率仍有限。"
  },
  {
    match: "G-SHARE:",
    title: "G-SHARE 用结构化推理辅助核电厂人因事件诊断",
    summary: "论文提出 G-SHARE，把核电厂人因事件诊断指南转化为证据提取、逐步推理和一致性修复流程。",
    why: "高风险诊断需要过程可追溯；结构化推理有助于审计，但仍需更多真实场景和独立评估。"
  },
  {
    match: "TSCA-Net:",
    title: "TSCA-Net 用时空团注意网络预测多模态行人轨迹",
    summary: "论文提出 TSCA-Net，通过时空团注意、成对关系建模和自适应解码预测多模态行人轨迹。",
    why: "更准确的轨迹预测会影响自动驾驶和机器人安全，但基准成绩还需要跨场景复现。"
  },
  {
    match: "CANDI: Contextual Alignment",
    title: "CANDI-QA 评估大模型在专业领域的上下文问答能力",
    summary: "论文发布 CANDI-QA 数据集，评估大模型在医疗、金融等专业领域进行事实提取和多步推理的能力。",
    why: "专业问答是否真正依赖上下文，直接影响模型在高风险领域的可信度；数据集覆盖与基线仍需继续验证。"
  },
  {
    match: "GenDiff:",
    title: "GenDiff 用扩散模型改进低剂量 CT 重建",
    summary: "论文提出 GenDiff，联合建模辐射剂量和解剖信息，用于提高低剂量 CT 重建质量与跨场景泛化能力。",
    why: "降低辐射剂量同时保持成像质量具有临床价值，但仍需外部数据集和真实工作流验证。"
  },
  {
    match: "Semidirect Fourier Delta Attention",
    title: "SFDA 用傅里叶控制扩展 Kimi Delta 注意力",
    summary: "论文提出相位控制傅里叶 Delta 注意力（SFDA），以块旋转傅里叶控制扩展 Kimi Delta 注意力。",
    why: "该方法尝试增强循环记忆能力，但当前主要证据来自玩具任务，距离大模型有效性验证仍有距离。"
  },
  {
    match: "Repairing Shape-Prior Shortcuts",
    title: "PhiCalNet 修复单次条纹投影测量中的形状先验捷径",
    summary: "论文提出 PhiCalNet，通过固定可微标定层约束深度重建，减少模型依赖物体边界而非条纹相位的捷径。",
    why: "从架构上消除错误捷径有助于提高测量可信度，但结果仍需在真实设备和复杂场景中复现。"
  },
  {
    match: "Empowering India’s next generation of innovators with ATL Saathi",
    title: "Google DeepMind 推出 ATL Saathi，支持印度学生学习与创新",
    summary: "Google DeepMind 介绍 ATL Saathi 项目，尝试把 Gemini 能力用于印度学生的学习与创新活动；实际覆盖与效果仍需更多公开数据。",
    why: "本地教育项目能否形成可复制的 AI 学习模式，取决于可及性、教师参与和长期学习效果。"
  },
  {
    match: "Here’s how to make study notebooks in the Gemini app",
    title: "Gemini 应用支持制作学习笔记本",
    summary: "Google 介绍如何在 Gemini 应用中制作学习笔记本，把资料整理和学习辅助集中到同一工作流。",
    why: "学习笔记本把生成式 AI 从单次问答推进到持续学习场景，关键仍是资料准确性和用户控制。"
  },
  {
    match: "TabPFN-MT:",
    title: "TabPFN-MT 面向表格数据进行原生多任务上下文学习",
    summary: "论文提出 TabPFN-MT，探索在表格数据上进行原生多任务上下文学习；当前证据主要来自单篇论文。",
    why: "如果同一模型能在表格任务间共享上下文能力，可能降低任务切换成本，但仍需跨数据集复现。"
  },
  {
    match: "How data science teams use Codex",
    title: "OpenAI 介绍数据科学团队如何用 Codex 自动化分析工作流",
    summary: "OpenAI 介绍数据科学团队如何使用 Codex 自动生成根因简报、影响报告、KPI 备忘录和仪表板规范。",
    why: "这类案例展示 Codex 如何进入真实分析流程，但效率提升、人工复核和结果可靠性仍需结合团队数据评估。"
  },
  {
    match: "Format Sensitivity Index:",
    title: "FSI 与 PSI 衡量 LLM 提示格式鲁棒性与输出合规性",
    summary: "论文提出格式敏感度指数 FSI 和可解析性敏感度指数 PSI，用于衡量提示包装变化对 LLM 性能与输出合规性的影响。",
    why: "只看准确率可能掩盖提示格式带来的波动；这组指标有助于更完整地评估结构化输出可靠性。"
  },
  {
    match: "Improved Vision-to-Chart Buoy Association",
    title: "QueryMLP 用图像投影改进视觉与海图浮标关联",
    summary: "论文使用 QueryMLP 预测浮标在图像中的位置，为视觉与海图数据关联提供空间先验。",
    why: "显式加入几何先验可减轻模型推理负担，但排行榜结果仍需在更多海况与设备上复现。"
  },
  {
    match: "Query-Adaptive Semantic Chunking",
    title: "QASC 动态调整语义分块，提升 RAG 检索效果",
    summary: "论文提出 QASC，根据查询相关度动态扩展上下文窗口并聚合分块分数，用于改进 RAG 检索。",
    why: "分块策略直接影响检索质量与成本；当前提升仍需在更大规模和不同文档类型上验证。"
  },
  {
    match: "A Survey of Text and Speech Resources for Hausa and Fongbe",
    title: "研究盘点豪萨语与丰贝语的文本和语音资源缺口",
    summary: "调查整理豪萨语与丰贝语的公开文本和语音资源，比较其可用性、质量与关键缺口。",
    why: "低资源语言的数据基础会直接限制模型覆盖与公平性，这份盘点有助于确定优先建设方向。"
  },
  {
    match: "Deep Pre-Alignment for VLMs",
    title: "DPA 深度预对齐架构提升 VLM 多模态表现",
    summary: "论文提出 DPA，用小型视觉语言模型替换标准视觉编码器，使视觉特征更贴近目标语言模型的文本空间。",
    why: "预对齐有望在减少语言能力遗忘的同时提升多模态表现，但仍需独立复现和成本比较。"
  },
  {
    match: "Improving Quantized Model Performance in Qualitative Analysis",
    title: "多轮提示验证改善低比特 LLaMA 定性分析稳定性",
    summary: "论文研究不同量化级别对 LLaMA 定性分析的影响，并提出量化感知的多轮提示验证方法。",
    why: "低成本部署若能保持分析稳定性，会扩大本地模型用途；结论仍受模型、数据与任务范围限制。"
  },
  {
    match: "Neural Estimation of Pairwise Mutual Information",
    title: "神经互信息估计减少掩码扩散模型解码开销",
    summary: "论文从掩码扩散模型隐藏状态估计成对条件互信息，用于识别可并行解码的变量。",
    why: "减少前向传播次数可能降低生成成本，但需要在更广泛模型与任务上验证质量和稳定性。"
  }
] as const;

function chineseReaderContentOverride(event: SnapshotEvent) {
  const canonical = publicText(event.canonical_title).toLowerCase();
  return chineseReaderContentOverrides.find((entry) => canonical.includes(entry.match.toLowerCase()));
}

function containsReaderPipelineBoilerplate(value: string) {
  return /(?:条目摘要|元数据级条目)\s*[：:]|\b(?:Announce Type|Phase 4)\b|\barXiv:\d{4}\.\d+(?:v\d+)?\b|\bAbstract\s*:/iu.test(value);
}

function normalizeReaderSummary(value: string) {
  return publicText(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(?:^|\s)#{1,6}\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function genericChineseEventTitle(event: SnapshotEvent) {
  const source = publicText(event.citations[0]?.source_name ?? event.timeline[0]?.source_name ?? "")
    .replace(/\s+(?:AI|News)$/iu, "")
    .trim() || "公开来源";
  const category = categoryFilterValue(event.category);
  const suffixByCategory: Record<string, string> = {
    agent: "关注 AI 智能体进展",
    benchmark: "公布 AI 评测结果",
    business: "报道 AI 行业新动向",
    funding: "报道 AI 融资新动向",
    infrastructure: "关注 AI 基础设施进展",
    model_release: "发布 AI 模型更新",
    open_source: "发布开源 AI 项目",
    opinion: "分析 AI 行业争议",
    policy: "解读 AI 政策变化",
    product_update: "发布 AI 产品更新",
    regulation: "解读 AI 监管变化",
    research: "公布 AI 研究发现",
    safety: "聚焦 AI 安全与对齐",
    tooling: "发布 AI 开发工具更新"
  };
  return `${source} ${suffixByCategory[category] ?? "发布 AI 行业动态"}`;
}

function genericChineseEventSummary(event: SnapshotEvent, canonical: string) {
  const title = /\p{Script=Han}/u.test(canonical) ? canonical : genericChineseEventTitle(event);
  const category = categoryFilterValue(event.category);
  if (category === "research" || category === "benchmark") {
    return `这项公开研究围绕“${title}”展开；当前证据主要来自 ${event.source_count} 个来源，方法、实验与结论仍需回到原文核对。`;
  }
  if (["agent", "product_update", "tooling", "model_release", "open_source"].includes(category)) {
    return `这条更新围绕“${title}”展开；当前公开信息有限，实际能力、可用性与适用边界仍需结合原始来源核对。`;
  }
  return `这条公开信息关注“${title}”；当前证据覆盖 ${event.source_count} 个来源，请结合原文判断其实际影响。`;
}

function chineseEventSummary(event: SnapshotEvent) {
  const override = chineseReaderContentOverride(event);
  if (override) return override.summary;

  const canonical = publicText(event.canonical_title).trim();
  const localized = normalizeReaderSummary(event.summary_zh ?? "");
  if (/[\u3400-\u9fff]/.test(localized) && !containsReaderPipelineBoilerplate(localized)) return localized;
  return genericChineseEventSummary(event, canonical);
}

function humanizeChineseHeadline(value: string) {
  let headline = value.trim().replace(/^据报道[，,]\s*/u, "");
  const articleExplainer = headline.match(/^(.{2,24}?)发布了?一篇文章[，,]\s*(?:解释|介绍)(.+)$/u);
  if (articleExplainer) headline = articleExplainer[1] + "介绍" + articleExplainer[2];
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

  if (/^Anthropic\s*发布了?面向金融服务的.+Cowork.+Claude Code.*插件/u.test(headline)) {
    headline = "Anthropic 发布金融服务智能体与 Claude Code 插件";
  } else {
    const launch = headline.match(/^(.{2,32}?)(发布|推出|上线|开源)了?\s*([^，,。；]{2,90})(?:[，,](.+))?$/u);
    if (launch && launch[3].length <= 48) {
      const detail = (launch[4] ?? "")
        .split(/[，,；;]/u)[0]
        .replace(/^(?:这是(?:一种|一个)|该版本|主要为了|旨在)/u, "")
        .trim();
      headline = `${launch[1]}${launch[2]}${launch[3]}${detail && detail.length <= 38 ? `：${detail}` : ""}`;
    }
  }

  return headline.replace(/发布了/u, "发布").replace(/推出了/u, "推出");
}

function normalizeChineseTitleStyle(value: string) {
  return value
    .replace(/hugging\s+face\s+transformers/giu, "Hugging Face Transformers")
    .replace(/hugging\s+face/giu, "Hugging Face")
    .replace(/\bapple\b/giu, "Apple")
    .replace(/openai/giu, "OpenAI")
    .replace(/anthropic/giu, "Anthropic")
    .replace(/\bgoogle\b/giu, "Google")
    .replace(/\bmeta\b/giu, "Meta")
    .replace(/deepseek/giu, "DeepSeek")
    .replace(/nvidia/giu, "NVIDIA")
    .replace(/deepmind/giu, "DeepMind")
    .replace(/microsoft/giu, "Microsoft")
    .replace(/github/giu, "GitHub")
    .replace(/xai/giu, "xAI")
    .replace(/\bclaude\b/giu, "Claude")
    .replace(/\bcodex\b/giu, "Codex")
    .replace(/\bgemini\b/giu, "Gemini")
    .replace(/\bgrok\b/giu, "Grok")
    .replace(/\btransformers\b/giu, "Transformers")
    .replace(/\bvllm\b/giu, "vLLM")
    .replace(/AI\s*代理/gu, "AI 智能体")
    .replace(/LLM\s*Agent/giu, "LLM 智能体")
    .replace(/苹果/gu, "Apple")
    .replace(/谷歌/gu, "Google")
    .replace(/英伟达/gu, "NVIDIA")
    .replace(/([\p{Script=Han}])([A-Za-z0-9])/gu, "$1 $2")
    .replace(/([A-Za-z0-9])([\p{Script=Han}])/gu, "$1 $2")
    .replace(/\s+([，。！？：；、])/gu, "$1")
    .replace(/([（“])\s+/gu, "$1")
    .replace(/\s+([）”])/gu, "$1")
    .replace(/(?:…|\.{3})$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chineseEventTitle(event: SnapshotEvent) {
  const canonical = publicText(event.canonical_title).trim();
  const fallback = genericChineseEventTitle(event);
  const override = chineseReaderContentOverride(event);
  if (override) return normalizeChineseTitleStyle(override.title);

  const rawSummary = normalizeReaderSummary(event.summary_zh ?? "");
  const summary = chineseEventSummary(event);
  const compact = compactChineseEventTitle(canonical, summary);
  const sentence = humanizeChineseHeadline(summary.replace(/\s+/g, " ").split(/[。！？]/u)[0]?.trim() ?? "");
  const summaryCanLead = /\p{Script=Han}/u.test(rawSummary) &&
    !containsReaderPipelineBoilerplate(rawSummary) &&
    !/^(?:公开信息|这条|该事件|这项公开研究)/u.test(rawSummary);
  if (compact) return normalizeChineseTitleStyle(compact);
  return shortenChineseTitle(/\p{Script=Han}/u.test(canonical) ? canonical : summaryCanLead ? sentence : fallback, fallback);
}

function compactChineseEventTitle(canonical: string, summary: string) {
  const text = `${canonical} ${summary}`;

  if (/GPT-Red/i.test(text)) return "OpenAI 发布 GPT-Red 红队系统";
  if (/Codex Micro|keyboard|键盘/i.test(text)) return "OpenAI 推出 Codex 硬件键盘";
  if (/Jacobian|hidden space|雅可比/i.test(text) && /Anthropic|Claude/i.test(text)) return "Anthropic 披露 Claude 内部表征研究";
  if (/xAI/i.test(text) && /Grok/i.test(text) && /CSAM|儿童性虐待材料/i.test(text)) return "xAI 起诉绕过 Grok 安全措施生成 CSAM 的用户";
  if (/Apple|苹果/i.test(text) && /OpenAI/i.test(text) && /lawsuit|起诉|trade secret|商业机密/i.test(text)) return "Apple 起诉 OpenAI：指控窃取硬件商业机密";
  if (/values vary by model and language|30\s*万次真实对话|价值观.*四个.*维度/i.test(text)) return "Anthropic 分析 30 万次对话：Claude 价值观可归纳为四个维度";
  if (/Deutsche Telekom|德意志电信/i.test(text) && /OpenAI/i.test(text)) return "德意志电信与 OpenAI 合作推进 AI 原生电信转型";
  if (/salespeople|销售人员/i.test(text) && /Microsoft|微软/i.test(text) && /OpenAI/i.test(text) && /Anthropic/i.test(text)) return "Microsoft 培训销售团队对比 OpenAI 与 Anthropic 模型";
  if (/Sarah Friar/i.test(text) && /scorecard|评分卡|ROI|回报/i.test(text)) return "OpenAI 首席财务官 Sarah Friar 提出 AI 投资回报评分卡";
  if (/OpenAI/i.test(text) && /teens?|青少年/i.test(text) && /safe AI|安全|parental controls?|家长控制/i.test(text)) return "OpenAI 为青少年 ChatGPT 增加安全保护与家长控制";
  if (/Anthropic Python SDK/i.test(text) && /0\.117\.0/i.test(text)) return "Anthropic Python SDK v0.117.0 增加 MCP Tunnels 并修复凭证泄露";
  if (/bioresilience|生物韧性/i.test(text) && /Isomorphic Labs/i.test(text)) return "Google DeepMind 与 Isomorphic Labs 公布 AI 生物韧性方案";
  if (/prior authorization|预授权/i.test(text) && /insurance|保险/i.test(text)) return "美国试点用 AI 审核医疗保险预授权，效果与风险仍待检验";
  if (/nudify|脱衣/i.test(text) && /San Francisco|旧金山/i.test(text)) return "旧金山要求 Apple 与 Google 下架 AI“脱衣”应用";
  if (/FireSat/i.test(text) && /wildfire|野火/i.test(text)) return "Google 支持的 FireSat 卫星升空，用于更早发现野火";
  if (/weather data sabotage|天气数据遭破坏/i.test(text)) return "天气数据遭破坏风险上升，关键基础设施面临连锁影响";
  if (/Cars24/i.test(text) && /100\s*万分钟|million minutes/i.test(text)) return "Cars24 用 OpenAI 语音与聊天智能体每月处理超 100 万分钟对话";
  if (/DeepStream\s*9\.1/i.test(text) && /tutorial|教程|multi-camera|多摄像头/i.test(text)) return "NVIDIA 发布 DeepStream 9.1 多摄像头 3D 跟踪教程";
  if (/Suno/i.test(text) && /YouTube|Genius|Deezer|训练数据集|training data/i.test(text)) return "Suno 训练数据曝光：被指抓取数百万首歌曲与歌词";
  if (/How Canada uses Claude|加拿大如何使用\s*Claude/i.test(text)) return "Anthropic 研究加拿大市场如何使用 Claude";
  if (/Southeast Asia|东南亚/i.test(text) && /Gemini/i.test(text)) return "Gemini 凭本地语言能力加速进入东南亚市场";
  if (/last wave of tech winners|科技创始人再次投身创业/i.test(text)) return "科技赢家重返创业：押注 AI 关键窗口";
  if (/VentureBeat/i.test(text) && /101\s*家企业|101 enterprises?/i.test(text) && /代理编排|agentic orchestration/i.test(text)) return "企业调查：AI 智能体编排正向模型平台集中";
  return "";
}

function firstReaderHeadlineClause(value: string, maxLength = 56) {
  const clauses = value
    .split(/[，；]/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
  if (clauses.length === 0) return value.trim();

  let candidate = clauses[0];
  for (let index = 1; index < clauses.length && candidate.length < 18; index += 1) {
    const combined = candidate + "，" + clauses[index];
    if (combined.length > maxLength) break;
    candidate = combined;
  }
  return candidate;
}

function removeUnclosedHeadlinePunctuation(value: string) {
  return value
    .replace(/（[^）]*$/u, "")
    .replace(/“[^”]*$/u, "")
    .replace(/《[^》]*$/u, "")
    .replace(/[，,:：、\s]+$/u, "")
    .trim();
}

function headlinePunctuationIsBalanced(value: string) {
  const pairs = [["（", "）"], ["(", ")"], ["[", "]"], ["“", "”"], ["《", "》"]] as const;
  for (const [open, close] of pairs) {
    if (value.split(open).length !== value.split(close).length) return false;
  }
  const bracketGroups = (value.match(/[（(\[]/gu) ?? []).length;
  const colonCount = (value.match(/[：:]/gu) ?? []).length;
  return bracketGroups <= 1 && colonCount <= 1;
}

function readerTitleFallback(value: string, fallback: string) {
  const method = value.match(/^([A-Z][A-Za-z0-9+.^_-]{1,30})\b/u)?.[1];
  const suffix = fallback.match(/(?:公布|发布|关注|报道|分析|解读|聚焦).+$/u)?.[0];
  return normalizeChineseTitleStyle(method && suffix ? method + " " + suffix : fallback);
}

function editorializeChineseTitle(value: string, fallback: string) {
  const maxLength = 56;
  let headline = normalizeChineseTitleStyle(value.replace(/[。！？；].*$/u, ""));
  const quotedPaper = headline.match(/^论文《([^》]+)》(?:于.+)?$/u);
  if (quotedPaper) headline = quotedPaper[1];

  headline = headline
    .replace(/^arXiv\s+cs\.[A-Za-z]+\s+新论文\s*/iu, "")
    .replace(/^基于摘要[，,]\s*(?:文章|论文|报告)?(?:讨论|探讨|介绍|总结)了?\s*/u, "研究梳理")
    .replace(/^文章报道[，,]\s*/u, "")
    .replace(/^本文是\s*arXiv\s*上的一篇立场论文[，,]?\s*/iu, "立场论文指出")
    .replace(/^The Verge\s+的一篇报道(?:称|指出)?[，,]?\s*/iu, "The Verge：")
    .replace(/^(.{2,28}?)(?:官方)?(?:博客)?文章(?:讨论|探讨|介绍|总结)了?\s*/u, "$1：")
    .replace(/^(.{2,28}?)博客(?:介绍|讨论|探讨|总结)了?(?:如何)?\s*/u, "$1：")
    .replace(/^一起诉讼/u, "诉讼")
    .replace(/^立场论文指出指出/u, "立场论文指出")
    .replace(
      /^(?:本文|本论文|该论文|这篇论文|论文|本研究|该研究|这项研究|本报告|该报告|这篇文章)\s*(?:首次|系统性地?|系统地?)?(?:发现了?|指出了?)\s*[，,]?/u,
      "研究发现"
    )
    .replace(
      /^(?:本文|本论文|该论文|这篇论文|论文|本研究|该研究|这项研究|本报告|该报告|这篇文章)\s*(?:首次|系统性地?|系统地?)?(?:提出|介绍|研究|分析|评估|探索|讨论|探讨|总结|报告)(?:了一种|了一个|了一款|了)?\s*/u,
      ""
    )
    .replace(/^(?:本文|本论文|该论文|这篇论文|论文|本研究|该研究|这项研究|本报告|该报告|这篇文章)\s*/u, "研究")
    .replace(/^(?:一种|一个|一款)\s*/u, "")
    .replace(/：并/u, "，并")
    .trim();

  const namedDefinition = headline.match(/^([A-Za-z][A-Za-z0-9+.^_-]{1,30})\s*(?:是|为)(?:一个|一种|一款)?(.+)$/u);
  if (namedDefinition) {
    const descriptor = firstReaderHeadlineClause(
      namedDefinition[2]
        .replace(/^基于(.{2,24}?)的/u, "基于$1的")
        .replace(/^统一的/u, "统一"),
      maxLength - namedDefinition[1].length - 1
    );
    headline = namedDefinition[1] + "：" + descriptor;
  } else {
    const namedProposal = headline.match(/^([A-Za-z][A-Za-z0-9+.^_-]{1,30})\s*提出了?(?:一种|一个|一款)?(.+)$/u);
    if (namedProposal) {
      headline = namedProposal[1] + " 提出" + firstReaderHeadlineClause(namedProposal[2], maxLength - namedProposal[1].length - 3);
    }
  }

  headline = normalizeChineseTitleStyle(
    headline
      .replace(/（(?:如|例如|包括|即)[^）]+）/gu, "")
      .replace(/（[^）]{28,}）/gu, "")
  );
  if (headline.length > maxLength) headline = firstReaderHeadlineClause(headline, maxLength);

  if (headline.length > maxLength) {
    const transition = headline.search(/(?:通过|用于|旨在|同时|从而|并|以便|将|把|覆盖|包含|包括|实现|达到|帮助)/u);
    if (transition >= 20 && transition <= maxLength) headline = headline.slice(0, transition);
  }

  headline = removeUnclosedHeadlinePunctuation(headline);
  const safeFallback = readerTitleFallback(headline, fallback);
  return headline.length >= 8 && headline.length <= maxLength && headlinePunctuationIsBalanced(headline)
    ? headline
    : safeFallback;
}

function shortenChineseTitle(value: string, fallback = "AI 行业动态") {
  return editorializeChineseTitle(value, fallback);
}

function freshnessBucket(timestamp: string) {
  const ageMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ageMs)) return "unknown";
  if (ageMs <= 86_400_000) return "24h";
  if (ageMs <= 604_800_000) return "7d";
  if (ageMs <= 2_592_000_000) return "30d";
  return "archive";
}







function pill(label: string, tone: "caution" | "evidence" | "neutral" | "success") {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
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
      "Snapshot data came from Supabase public-safe read views using anon read access.",
      "快照数据来自公开只读证据视图。"
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
    .replace(
      "No live DeepSeek call, Supabase write, or scheduled persistence job was run.",
      "当前页面基于已入库公开证据，本次未执行实时模型调用或写入。"
    )
    .replace(
      "Supabase coverage depends on rows already persisted into the public retrieval view.",
      "覆盖范围取决于已经进入公开证据视图的条目。"
    )
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
  const leftDay = Math.floor(Date.parse(left.latest_seen_at) / 86_400_000);
  const rightDay = Math.floor(Date.parse(right.latest_seen_at) / 86_400_000);
  return rightDay - leftDay ||
    right.event_score - left.event_score ||
    Number(right.source_families.length > 1) - Number(left.source_families.length > 1) ||
    right.source_count - left.source_count ||
    Date.parse(right.latest_seen_at) - Date.parse(left.latest_seen_at) ||
    left.canonical_title.localeCompare(right.canonical_title, "zh-CN");
}

function homepageSourceGroup(event: SnapshotEvent) {
  const source = eventSources(event, 1)[0]?.trim().toLowerCase() ?? "unknown";
  return source.startsWith("arxiv") ? "arxiv" : source;
}

function compareHomepageImpact(left: SnapshotEvent, right: SnapshotEvent) {
  const leftImpact = left.event_score + Math.min(left.source_count - 1, 2) * 8 + Number(left.source_families.length > 1) * 6;
  const rightImpact = right.event_score + Math.min(right.source_count - 1, 2) * 8 + Number(right.source_families.length > 1) * 6;
  return rightImpact - leftImpact || compareHomepageEvents(left, right);
}

function selectHomepageEvents(events: SnapshotEvent[], limit: number) {
  const chronological = events.toSorted(compareHomepageEvents);
  const selected: SnapshotEvent[] = [];
  const selectedIds = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  const add = (event: SnapshotEvent, enforceDiversity: boolean) => {
    if (selectedIds.has(event.event_cluster_id)) return false;
    const source = homepageSourceGroup(event);
    const sourceLimit = source === "arxiv" ? 3 : 2;
    if (enforceDiversity && (sourceCounts.get(source) ?? 0) >= sourceLimit) return false;
    if (enforceDiversity && (categoryCounts.get(event.category) ?? 0) >= 3) return false;
    selected.push(event);
    selectedIds.add(event.event_cluster_id);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    categoryCounts.set(event.category, (categoryCounts.get(event.category) ?? 0) + 1);
    return true;
  };

  for (const event of chronological) {
    if (selected.length >= Math.min(6, limit)) break;
    add(event, true);
  }

  const eventTimes = events.map((event) => Date.parse(event.latest_seen_at)).filter(Number.isFinite);
  const newest = eventTimes.length > 0 ? Math.max(...eventTimes) : Date.now();
  const impactWindow = chronological
    .filter((event) => newest - Date.parse(event.latest_seen_at) <= 14 * 86_400_000)
    .toSorted(compareHomepageImpact);
  for (const event of impactWindow) {
    if (selected.length >= limit) break;
    add(event, true);
  }
  for (const event of chronological) {
    if (selected.length >= limit) break;
    add(event, false);
  }
  return selected;
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

function localEvidenceToolScript(locale: "en" | "zh" = "zh", snapshotUrl = "../data/radar-snapshot.json") {
  return String.raw`
(function () {
  const language = ${JSON.stringify(locale)};
  const snapshotUrl = ${JSON.stringify(snapshotUrl)};
  const readerContentOverrides = ${JSON.stringify(chineseReaderContentOverrides)};
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
    const articleExplainer = headline.match(/^(.{2,24}?)发布了?一篇文章[，,]\s*(?:解释|介绍)(.+)$/);
    if (articleExplainer) headline = articleExplainer[1] + "介绍" + articleExplainer[2];
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
    if (/^Anthropic\s*发布了?面向金融服务的.+Cowork.+Claude Code.*插件/.test(headline)) {
      headline = "Anthropic 发布金融服务智能体与 Claude Code 插件";
    } else {
      const launch = headline.match(/^(.{2,32}?)(发布|推出|上线|开源)了?\s*([^，,。；]{2,90})(?:[，,](.+))?$/);
      if (launch && launch[3].length <= 48) {
        const detail = String(launch[4] || "")
          .split(/[，,；;]/)[0]
          .replace(/^(?:这是(?:一种|一个)|该版本|主要为了|旨在)/, "")
          .trim();
        headline = launch[1] + launch[2] + launch[3] + (detail && detail.length <= 38 ? "：" + detail : "");
      }
    }
    return headline.replace(/发布了/, "发布").replace(/推出了/, "推出");
  }

  function displayChineseEntity(value) {
    const aliases = {
      apple: "Apple", anthropic: "Anthropic", google: "Google", github: "GitHub",
      "hugging face": "Hugging Face", "hugging face transformers": "Hugging Face Transformers",
      microsoft: "Microsoft", nvidia: "NVIDIA", openai: "OpenAI", xai: "xAI",
      "gpt red": "GPT-Red", "deepstream 9 1": "DeepStream 9.1", "llama cpp": "llama.cpp"
    };
    const text = String(value || "").trim();
    return aliases[text.toLowerCase()] || text;
  }

  function normalizeChineseTitle(value) {
    return String(value || "")
      .replace(/hugging\s+face\s+transformers/gi, "Hugging Face Transformers")
      .replace(/hugging\s+face/gi, "Hugging Face")
      .replace(/\bapple\b/gi, "Apple")
      .replace(/openai/gi, "OpenAI")
      .replace(/anthropic/gi, "Anthropic")
      .replace(/\bgoogle\b/gi, "Google")
      .replace(/\bmeta\b/gi, "Meta")
      .replace(/deepseek/gi, "DeepSeek")
      .replace(/nvidia/gi, "NVIDIA")
      .replace(/deepmind/gi, "DeepMind")
      .replace(/microsoft/gi, "Microsoft")
      .replace(/github/gi, "GitHub")
      .replace(/xai/gi, "xAI")
      .replace(/\bclaude\b/gi, "Claude")
      .replace(/\bcodex\b/gi, "Codex")
      .replace(/\bgemini\b/gi, "Gemini")
      .replace(/\bgrok\b/gi, "Grok")
      .replace(/\btransformers\b/gi, "Transformers")
      .replace(/\bvllm\b/gi, "vLLM")
      .replace(/AI\s*代理/g, "AI 智能体")
      .replace(/LLM\s*Agent/gi, "LLM 智能体")
      .replace(/苹果/g, "Apple")
      .replace(/谷歌/g, "Google")
      .replace(/英伟达/g, "NVIDIA")
      .replace(/([\u3400-\u9fff])([A-Za-z0-9])/g, "$1 $2")
      .replace(/([A-Za-z0-9])([\u3400-\u9fff])/g, "$1 $2")
      .replace(/\s+([，。！？：；、])/g, "$1")
      .replace(/([（“])\s+/g, "$1")
      .replace(/\s+([）”])/g, "$1")
      .replace(/(?:…|\.{3})$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function readerContentOverride(event) {
    const canonical = String(event.canonical_title || "").toLowerCase();
    return readerContentOverrides.find((entry) => canonical.includes(String(entry.match || "").toLowerCase()));
  }

  function containsPipelineBoilerplate(value) {
    return /(?:\u6761\u76ee\u6458\u8981|\u5143\u6570\u636e\u7ea7\u6761\u76ee)\s*[\uFF1A:]|\b(?:Metadata-level item|Item summary|Evidence text|Announce Type|Phase 4)\b|\barXiv:\d{4}\.\d+(?:v\d+)?\b|\bAbstract\s*:/i.test(String(value || ""));
  }

  function normalizeReaderSummary(value) {
    return String(value || "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/(?:^|\s)#{1,6}\s+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function genericChineseTitle(event) {
    const source = String(event.citations?.[0]?.source_name || event.timeline?.[0]?.source_name || "")
      .replace(/\s+(?:AI|News)$/i, "")
      .trim() || "公开来源";
    const suffixByCategory = {
      agent: "关注 AI 智能体进展",
      benchmark: "公布 AI 评测结果",
      business: "报道 AI 行业新动向",
      funding: "报道 AI 融资新动向",
      infrastructure: "关注 AI 基础设施进展",
      model_release: "发布 AI 模型更新",
      open_source: "发布开源 AI 项目",
      opinion: "分析 AI 行业争议",
      policy: "解读 AI 政策变化",
      product_update: "发布 AI 产品更新",
      regulation: "解读 AI 监管变化",
      research: "公布 AI 研究发现",
      safety: "聚焦 AI 安全与对齐",
      tooling: "发布 AI 开发工具更新"
    };
    return source + " " + (suffixByCategory[String(event.category || "")] || "发布 AI 行业动态");
  }

  function genericChineseSummary(event) {
    const rawCanonical = String(event.canonical_title || "").trim();
    const canonical = /[\u3400-\u9fff]/.test(rawCanonical) ? rawCanonical : genericChineseTitle(event);
    const category = String(event.category || "");
    if (category === "research" || category === "benchmark") {
      return "这项公开研究围绕“" + canonical + "”展开；当前证据主要来自 " + Number(event.source_count || 0) + " 个来源，方法、实验与结论仍需回到原文核对。";
    }
    if (["agent", "product_update", "tooling", "model_release", "open_source"].includes(category)) {
      return "这条更新围绕“" + canonical + "”展开；当前公开信息有限，实际能力、可用性与适用边界仍需结合原始来源核对。";
    }
    return "这条公开信息关注“" + canonical + "”；当前证据覆盖 " + Number(event.source_count || 0) + " 个来源，请结合原文判断其实际影响。";
  }

  function eventTitle(snapshot, event) {
    if (language === "en") return relatedItem(snapshot, event)?.title || event.timeline?.[0]?.title || event.canonical_title;
    const fallback = genericChineseTitle(event);
    const override = readerContentOverride(event);
    if (override) return normalizeChineseTitle(override.title);
    const canonical = String(event.canonical_title || "").trim();
    const rawSummary = normalizeReaderSummary(event.summary_zh);
    const fullSummary = eventSummary(snapshot, event);
    const compact = compactChineseTitle(canonical, fullSummary);
    const summary = humanizeChineseTitle(fullSummary.replace(/\s+/g, " ").split(/[。！？]/)[0].trim());
    const summaryCanLead = /[\u3400-\u9fff]/.test(rawSummary) &&
      !containsPipelineBoilerplate(rawSummary) &&
      !/^(?:公开信息|这条|该事件|这项公开研究)/.test(rawSummary);
    if (compact) return normalizeChineseTitle(compact);
    return shortChineseTitle(/[\u3400-\u9fff]/.test(canonical) ? canonical : summaryCanLead ? summary : fallback, fallback);
  }

  function compactChineseTitle(canonical, summary) {
    const text = [canonical, summary].join(" ");
    if (/GPT-Red/i.test(text)) return "OpenAI 发布 GPT-Red 红队系统";
    if (/Codex Micro|keyboard|键盘/i.test(text)) return "OpenAI 推出 Codex 硬件键盘";
    if (/Jacobian|hidden space|雅可比/i.test(text) && /Anthropic|Claude/i.test(text)) return "Anthropic 披露 Claude 内部表征研究";
    if (/xAI/i.test(text) && /Grok/i.test(text) && /CSAM|儿童性虐待材料/i.test(text)) return "xAI 起诉绕过 Grok 安全措施生成 CSAM 的用户";
    if (/Apple|苹果/i.test(text) && /OpenAI/i.test(text) && /lawsuit|起诉|trade secret|商业机密/i.test(text)) return "Apple 起诉 OpenAI：指控窃取硬件商业机密";
    if (/values vary by model and language|30\s*万次真实对话|价值观.*四个.*维度/i.test(text)) return "Anthropic 分析 30 万次对话：Claude 价值观可归纳为四个维度";
    if (/Deutsche Telekom|德意志电信/i.test(text) && /OpenAI/i.test(text)) return "德意志电信与 OpenAI 合作推进 AI 原生电信转型";
    if (/salespeople|销售人员/i.test(text) && /Microsoft|微软/i.test(text) && /OpenAI/i.test(text) && /Anthropic/i.test(text)) return "Microsoft 培训销售团队对比 OpenAI 与 Anthropic 模型";
    if (/How Canada uses Claude|加拿大如何使用\s*Claude/i.test(text)) return "Anthropic 研究加拿大市场如何使用 Claude";
    if (/Southeast Asia|东南亚/i.test(text) && /Gemini/i.test(text)) return "Gemini 凭本地语言能力加速进入东南亚市场";
    if (/last wave of tech winners|科技创始人再次投身创业/i.test(text)) return "科技赢家重返创业：押注 AI 关键窗口";
    return "";
  }

  function firstReaderHeadlineClause(value, maxLength) {
    const clauses = String(value || "").split(/[，；]/).map((clause) => clause.trim()).filter(Boolean);
    if (clauses.length === 0) return String(value || "").trim();
    let candidate = clauses[0];
    for (let index = 1; index < clauses.length && candidate.length < 18; index += 1) {
      const combined = candidate + "，" + clauses[index];
      if (combined.length > maxLength) break;
      candidate = combined;
    }
    return candidate;
  }

  function removeUnclosedHeadlinePunctuation(value) {
    return String(value || "")
      .replace(/（[^）]*$/, "")
      .replace(/“[^”]*$/, "")
      .replace(/《[^》]*$/, "")
      .replace(/[，,:：、\s]+$/, "")
      .trim();
  }

  function headlinePunctuationIsBalanced(value) {
    const pairs = [["（", "）"], ["(", ")"], ["[", "]"], ["“", "”"], ["《", "》"]];
    for (const pair of pairs) {
      if (String(value || "").split(pair[0]).length !== String(value || "").split(pair[1]).length) return false;
    }
    const bracketGroups = (String(value || "").match(/[（(\[]/g) || []).length;
    const colonCount = (String(value || "").match(/[：:]/g) || []).length;
    return bracketGroups <= 1 && colonCount <= 1;
  }

  function readerTitleFallback(value, fallback) {
    const method = String(value || "").match(/^([A-Z][A-Za-z0-9+.^_-]{1,30})\b/)?.[1];
    const suffix = String(fallback || "").match(/(?:公布|发布|关注|报道|分析|解读|聚焦).+$/)?.[0];
    return normalizeChineseTitle(method && suffix ? method + " " + suffix : fallback);
  }

  function editorializeChineseTitle(value, fallback) {
    const maxLength = 56;
    let headline = normalizeChineseTitle(String(value || "").replace(/[。！？；].*$/, ""));
    const quotedPaper = headline.match(/^论文《([^》]+)》(?:于.+)?$/);
    if (quotedPaper) headline = quotedPaper[1];

    headline = headline
      .replace(/^arXiv\s+cs\.[A-Za-z]+\s+新论文\s*/i, "")
      .replace(/^基于摘要[，,]\s*(?:文章|论文|报告)?(?:讨论|探讨|介绍|总结)了?\s*/, "研究梳理")
      .replace(/^文章报道[，,]\s*/, "")
      .replace(/^本文是\s*arXiv\s*上的一篇立场论文[，,]?\s*/i, "立场论文指出")
      .replace(/^The Verge\s+的一篇报道(?:称|指出)?[，,]?\s*/i, "The Verge：")
      .replace(/^(.{2,28}?)(?:官方)?(?:博客)?文章(?:讨论|探讨|介绍|总结)了?\s*/, "$1：")
      .replace(/^(.{2,28}?)博客(?:介绍|讨论|探讨|总结)了?(?:如何)?\s*/, "$1：")
      .replace(/^一起诉讼/, "诉讼")
      .replace(/^立场论文指出指出/, "立场论文指出")
      .replace(
        /^(?:本文|本论文|该论文|这篇论文|论文|本研究|该研究|这项研究|本报告|该报告|这篇文章)\s*(?:首次|系统性地?|系统地?)?(?:发现了?|指出了?)\s*[，,]?/,
        "研究发现"
      )
      .replace(
        /^(?:本文|本论文|该论文|这篇论文|论文|本研究|该研究|这项研究|本报告|该报告|这篇文章)\s*(?:首次|系统性地?|系统地?)?(?:提出|介绍|研究|分析|评估|探索|讨论|探讨|总结|报告)(?:了一种|了一个|了一款|了)?\s*/,
        ""
      )
      .replace(/^(?:本文|本论文|该论文|这篇论文|论文|本研究|该研究|这项研究|本报告|该报告|这篇文章)\s*/, "研究")
      .replace(/^(?:一种|一个|一款)\s*/, "")
      .replace(/：并/, "，并")
      .trim();

    const namedDefinition = headline.match(/^([A-Za-z][A-Za-z0-9+.^_-]{1,30})\s*(?:是|为)(?:一个|一种|一款)?(.+)$/);
    if (namedDefinition) {
      const descriptor = firstReaderHeadlineClause(
        namedDefinition[2].replace(/^基于(.{2,24}?)的/, "基于$1的").replace(/^统一的/, "统一"),
        maxLength - namedDefinition[1].length - 1
      );
      headline = namedDefinition[1] + "：" + descriptor;
    } else {
      const namedProposal = headline.match(/^([A-Za-z][A-Za-z0-9+.^_-]{1,30})\s*提出了?(?:一种|一个|一款)?(.+)$/);
      if (namedProposal) {
        headline = namedProposal[1] + " 提出" + firstReaderHeadlineClause(namedProposal[2], maxLength - namedProposal[1].length - 3);
      }
    }

    headline = normalizeChineseTitle(
      headline
        .replace(/（(?:如|例如|包括|即)[^）]+）/g, "")
        .replace(/（[^）]{28,}）/g, "")
    );
    if (headline.length > maxLength) headline = firstReaderHeadlineClause(headline, maxLength);
    if (headline.length > maxLength) {
      const transition = headline.search(/(?:通过|用于|旨在|同时|从而|并|以便|将|把|覆盖|包含|包括|实现|达到|帮助)/);
      if (transition >= 20 && transition <= maxLength) headline = headline.slice(0, transition);
    }
    headline = removeUnclosedHeadlinePunctuation(headline);
    const safeFallback = readerTitleFallback(headline, fallback);
    return headline.length >= 8 && headline.length <= maxLength && headlinePunctuationIsBalanced(headline)
      ? headline
      : safeFallback;
  }

  function shortChineseTitle(value, fallback) {
    return editorializeChineseTitle(value, fallback || "AI 行业动态");
  }

  function eventSummary(snapshot, event) {
    if (language !== "en") {
      const override = readerContentOverride(event);
      if (override) return override.summary;
      const summary = normalizeReaderSummary(event.summary_zh);
      if (/[\u3400-\u9fff]/.test(summary) && !containsPipelineBoilerplate(summary)) return summary;
      return genericChineseSummary(event);
    }
    const item = relatedItem(snapshot, event);
    if (item?.summary_en && !containsPipelineBoilerplate(item.summary_en)) return normalizeReaderSummary(item.summary_en);
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
      if (sourceCount > 1 && familyCount > 1) return "covered by different source types; independence still needs checking";
      if (sourceCount > 1) return "several sources of the same type";
      return "one source so far";
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
    const singleSource = !crossFamily && !sameFamily && !multiSource && /single[- ]source|one source|单一来源|单源|单篇报道|只有一篇报道|弱信号|可信度较低|limited evidence/.test(q);
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
    const stopwords = new Set(["about", "against", "analysis", "and", "are", "around", "build", "daily", "days", "draft", "event", "events", "evidence", "from", "have", "hours", "into", "last", "no", "outline", "past", "public", "such", "the", "this", "today", "what", "which", "with", "within", "write"]);
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
      return "The sources span different types, but one may repeat the original claim; independence is not yet established.";
    }
    if (Number(event.source_count || 0) > 1) {
      return "Several sources are the same type, so independent confirmation is still needed.";
    }
    return "Only one source is available so far; independent confirmation is still needed.";
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
        ).join("") + '</ol><p class="note">Sources checked through ' + escapeHtml(freshness) + '. Single-source events still need confirmation.</p>';
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
  --bg: #ffffff;
  --ink: #17191f;
  --muted: #727781;
  --line: #e1e4e9;
  --panel: #ffffff;
  --soft: #f5f7fa;
  --evidence: #0b5cff;
  --success: #1f6b45;
  --caution: #9a5a17;
  --danger: #b9412c;
  --shadow: none;
}
* { box-sizing: border-box; }
html { background: var(--bg); overflow-x: hidden; }
body { background: var(--bg); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; line-height: 1.58; margin: 0; }
a { color: var(--evidence); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 3px; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 3px solid #2a7b89; outline-offset: 2px; }
button, input, select, textarea { font: inherit; }
h1, h2, h3, p { letter-spacing: 0; margin: 0; }
h1 { font-size: 30px; font-weight: 760; line-height: 1.2; }
h2 { font-size: 19px; line-height: 1.35; }
h3 { font-size: 17px; line-height: 1.4; }
.app-layout { display: grid; grid-template-columns: 216px minmax(0, 1fr); min-height: 100vh; }
.desktop-sidebar { background: #fff; border-right: 1px solid var(--line); display: flex; flex-direction: column; height: 100vh; padding: 30px 12px 24px; position: sticky; top: 0; }
.brand { align-items: center; color: var(--ink); display: flex; font-size: 18px; font-weight: 820; gap: 12px; justify-content: space-between; padding: 2px 12px; }
.brand span { white-space: nowrap; }
.brand:hover { text-decoration: none; }
.brand i { border: 1px solid #b8cdfd; border-radius: 50%; display: block; height: 30px; position: relative; width: 30px; }
.brand i::before { background: var(--evidence); border-radius: 50%; content: ""; height: 8px; left: 10px; position: absolute; top: 10px; width: 8px; }
.brand i::after { background: var(--evidence); border: 2px solid #fff; border-radius: 50%; content: ""; height: 5px; position: absolute; right: -2px; top: 2px; width: 5px; }
.nav-group-label { display: none; }
.side-nav { display: grid; gap: 8px; margin-top: 42px; }
.side-nav a { align-items: center; border-radius: 4px; color: #353941; display: flex; font-size: 14px; font-weight: 650; gap: 13px; min-height: 44px; padding: 10px 13px; }
.side-nav svg { fill: none; height: 20px; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; width: 20px; }
.side-nav a:first-child svg { fill: currentColor; stroke: currentColor; }
.side-nav a:hover { background: var(--soft); text-decoration: none; }
.side-nav a[aria-current="page"] { background: var(--evidence); color: #fff; }
.sidebar-language { margin-top: auto; width: max-content; }
.app-frame { min-width: 0; }
.language-switch { border: 0; border-radius: 0; display: inline-grid; grid-template-columns: repeat(2, minmax(34px, auto)); overflow: hidden; }
.language-switch a { color: var(--muted); font-size: 12px; font-weight: 700; min-width: 38px; padding: 6px 8px; text-align: center; }
.language-switch a + a { border-left: 1px solid var(--line); }
.language-switch a[aria-current="true"] { color: var(--evidence); }
.mobile-header, .mobile-nav { display: none; }
main { margin: 0 auto; max-width: 1480px; min-width: 0; padding: 30px 34px 72px; width: 100%; }
main > * + * { margin-top: 0; }
.reader-heading { align-items: end; border-bottom: 1px solid var(--line); display: grid; gap: 28px; grid-template-columns: minmax(0, 1fr) minmax(260px, 330px); padding: 0 4px 20px; }
.reader-heading.compact { grid-template-columns: 1fr; }
.reader-title-line { align-items: baseline; display: flex; flex-wrap: wrap; gap: 22px; }
.reader-title-line time, .reader-title-line > span { color: var(--muted); font-size: 13px; }
.reader-heading p { color: #5f646e; font-size: 13px; margin-top: 5px; }
.feed-heading { align-items: end; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; padding: 0 0 18px; }
.feed-heading p, .tool-heading p { color: var(--muted); font-size: 13px; margin-top: 3px; }
.feed-heading > a, .feed-heading > span { color: var(--muted); font-size: 13px; }
.section-heading { align-items: center; display: flex; gap: 16px; justify-content: space-between; }
.section-heading > span { color: var(--evidence); font-size: 12px; font-weight: 800; }
.top-stories { background: var(--panel); border-bottom: 1px solid var(--line); }
.top-stories .section-heading { border-bottom: 1px solid var(--line); padding: 22px 4px 12px; }
.top-story { align-items: start; border-bottom: 1px solid var(--line); color: var(--ink); display: grid; gap: 18px; grid-template-columns: 42px 122px minmax(320px, 1fr) minmax(245px, .75fr); padding: 17px 4px; }
.top-story[hidden] { display: none; }
.top-story:hover { background: #fbfcff; }
.hot-rank { color: var(--evidence); font-size: 23px; font-variant-numeric: tabular-nums; font-weight: 520; letter-spacing: -1px; line-height: 1; padding-top: 2px; }
.hot-meta { color: var(--muted); display: grid; font-size: 12px; gap: 4px; line-height: 1.4; }
.hot-meta time { color: #535963; font-variant-numeric: tabular-nums; }
.hot-meta span { color: var(--ink); font-weight: 640; }
.hot-meta small { color: var(--muted); }
.hot-copy, .hot-judgment { min-width: 0; overflow-wrap: anywhere; }
.hot-copy h2 { font-size: 16px; font-weight: 740; line-height: 1.45; }
.hot-copy h2 a { color: var(--ink); display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.hot-copy p { color: #5f646d; font-size: 13px; line-height: 1.65; margin-top: 6px; }
.hot-judgment { border-left: 2px solid #dbe5ff; padding-left: 14px; }
.hot-judgment strong { color: var(--evidence); display: block; font-size: 12px; margin-bottom: 3px; }
.hot-judgment p { color: #3e4249; font-size: 12px; line-height: 1.65; }
.hot-judgment small { color: var(--muted); display: block; font-size: 11px; margin-top: 5px; }
.feed-toolbar { border-bottom: 1px solid var(--line); padding: 10px 4px; }
.feed-toolbar.full-toolbar { display: grid; gap: 4px; padding: 11px 4px; }
.filter-line { align-items: center; display: grid; gap: 18px; grid-template-columns: 40px minmax(0, 1fr); }
.filter-line > span { color: var(--muted); font-size: 11px; }
.feed-search { width: 100%; }
.feed-search input, .controls input, .controls select, .tool-stage textarea { background: #fff; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); width: 100%; }
.feed-search input { border-width: 0 0 1px; border-radius: 0; padding: 9px 2px; }
.feed-chips { display: flex; gap: 24px; overflow-x: auto; padding-bottom: 1px; }
.feed-chips button, .prompt-suggestions button { background: transparent; border: 0; border-radius: 0; color: #41464e; cursor: pointer; flex: 0 0 auto; padding: 7px 1px; }
.feed-chips button.active { border-bottom: 2px solid var(--evidence); color: var(--evidence); font-weight: 730; }
.feed-day { align-items: center; display: flex; font-size: 18px; padding: 4px 0 10px; }
.latest-feed { padding-top: 26px; }
.latest-feed > .section-heading { border-bottom: 1px solid var(--line); padding: 0 4px 12px; }
.story-stream { display: grid; gap: 0; }
.story-stream .story-row, .radar-row { align-items: start; background: transparent; display: grid; gap: 16px; grid-template-columns: 78px minmax(0, 1fr); padding: 0; }
.story-row[hidden], .radar-row[hidden] { display: none; }
.story-time { align-items: center; color: #60666f; display: grid; font-size: 12px; font-variant-numeric: tabular-nums; gap: 8px; grid-template-columns: 1fr 8px; padding-top: 20px; text-align: right; }
.story-time time { display: grid; gap: 1px; white-space: nowrap; }
.story-time .story-date { color: #7a8089; font-size: 11px; }
.story-time .story-clock { color: #4b515a; font-size: 12px; }
.story-time i { background: var(--evidence); border-radius: 50%; height: 6px; width: 6px; }
.story-content { background: #fff; border-bottom: 1px solid var(--line); min-width: 0; padding: 16px 4px 18px; }
.story-meta { align-items: center; color: var(--muted); display: flex; font-size: 13px; gap: 12px; justify-content: space-between; }
.story-meta strong { color: var(--evidence); font-size: 12px; }
.story-content h2 { font-size: 18px; margin-top: 6px; }
.story-content h2 a { color: var(--ink); display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.story-content p { color: #555b65; font-size: 14px; line-height: 1.75; margin-top: 6px; }
.story-content .story-judgment { color: #333840; font-size: 13px; }
.story-content .story-judgment strong { color: var(--evidence); margin-right: 8px; }
.story-foot { color: #7a8796; display: flex; font-size: 12px; gap: 14px; margin-top: 10px; }
.source-drawer { border-top: 1px dashed var(--line); margin-top: 12px; padding-top: 10px; }
.source-drawer summary, .score-drawer summary { color: var(--evidence); cursor: pointer; font-size: 13px; font-weight: 700; }
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
.row-list { display: grid; gap: 12px; }
.timeline-list { display: grid; gap: 8px; }
.timeline-row { background: #fff; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); display: grid; gap: 12px; grid-template-columns: 165px minmax(0, 1fr) 150px; padding: 12px 14px; }
.timeline-row time, .timeline-row span { color: var(--muted); font-size: 12px; }
.panel, .event-card:not(.story-row) { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
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
.publisher-index { border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 0; padding: 14px 4px; }
.publisher-index span { border-right: 1px solid var(--line); color: #464b54; font-size: 12px; margin: 4px 0; padding: 0 14px; }
.publisher-index span:first-child { padding-left: 0; }
.about-reader { margin: 54px auto 0; max-width: 820px; }
.about-reader header { border-bottom: 1px solid var(--line); padding-bottom: 30px; }
.about-reader header h1 { font-size: clamp(32px, 4vw, 52px); letter-spacing: -1.5px; line-height: 1.16; }
.about-reader header p { color: #4c515a; font-size: 18px; line-height: 1.85; margin-top: 20px; }
.about-reader section { border-bottom: 1px solid var(--line); display: grid; gap: 28px; grid-template-columns: 170px minmax(0, 1fr); padding: 30px 0; }
.about-reader section h2 { font-size: 16px; }
.about-reader section p { color: #555b64; line-height: 1.85; }
.site-footer { align-items: center; border-top: 1px solid var(--line); color: var(--muted); display: flex; font-size: 12px; gap: 24px; justify-content: space-between; margin: 0 30px; padding: 18px 0 28px; }
.site-footer-copy, .site-footer-links { align-items: center; display: flex; flex-wrap: wrap; gap: 6px 14px; }
.site-footer-copy span + span::before { color: var(--line-strong); content: "·"; margin-right: 14px; }
.site-footer a { color: inherit; text-decoration: none; }
.site-footer a:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 980px) {
  .controls { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .controls .search-control { grid-column: 1 / -1; }
  .grid.two { grid-template-columns: 1fr; }
}
@media (max-width: 1100px) {
  .top-story { gap: 7px 16px; grid-template-columns: 42px minmax(0, 1fr); }
  .hot-rank { grid-row: 1 / 4; }
  .hot-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; grid-column: 2; }
  .hot-copy, .hot-judgment { grid-column: 2; }
  .hot-judgment { margin-top: 4px; }
}
@media (max-width: 760px) {
  body { padding-bottom: 70px; }
  .app-layout { display: block; min-height: auto; }
  .desktop-sidebar, .desktop-topbar { display: none; }
  .mobile-header { align-items: center; background: rgba(255,255,255,.96); border-bottom: 1px solid var(--line); display: flex; height: 54px; justify-content: space-between; padding: 0 16px; position: sticky; top: 0; z-index: 20; }
  .mobile-brand { color: var(--ink); font-size: 17px; font-weight: 800; }
  .mobile-nav { background: #fff; border-top: 1px solid var(--line); bottom: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); left: 0; position: fixed; right: 0; z-index: 30; }
  .mobile-nav a { align-items: center; color: var(--muted); display: flex; flex-direction: column; font-size: 10px; font-weight: 700; gap: 3px; padding: 8px 2px 7px; text-align: center; }
  .mobile-nav svg { fill: none; height: 18px; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; width: 18px; }
  .mobile-nav a:first-child svg { fill: currentColor; }
  .mobile-nav a[aria-current="page"] { color: var(--evidence); }
  main { padding: 18px 16px 34px; }
  main > * + * { margin-top: 0; }
  .reader-heading { align-items: start; gap: 14px; grid-template-columns: 1fr; padding: 0 0 16px; }
  .reader-title-line { gap: 12px; }
  .reader-heading h1 { font-size: 25px; }
  .reader-heading p { font-size: 12px; }
  .reader-heading .feed-search { display: block; }
  .feed-heading { padding-bottom: 8px; }
  .feed-heading h1 { font-size: 22px; }
  .feed-heading p { display: none; }
  .top-stories .section-heading { padding: 18px 0 9px; }
  .top-stories .section-heading h2 { font-size: 16px; }
  .top-story { gap: 6px 10px; grid-template-columns: 32px minmax(0, 1fr); padding: 14px 0; }
  .hot-rank { font-size: 19px; grid-row: 1 / 4; }
  .hot-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; grid-column: 2; }
  .hot-copy { grid-column: 2; }
  .hot-copy h2 { font-size: 16px; }
  .hot-copy p { display: -webkit-box; font-size: 12px; line-height: 1.5; margin-top: 3px; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .hot-judgment { align-items: baseline; border-left: 0; display: grid; gap: 5px; grid-column: 2; grid-template-columns: auto minmax(0, 1fr); margin-top: 2px; padding-left: 0; }
  .hot-judgment strong { font-size: 11px; margin: 0; white-space: nowrap; }
  .hot-judgment p { display: -webkit-box; font-size: 11px; line-height: 1.5; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
  .hot-judgment small { display: none; }
  .feed-toolbar { overflow: hidden; padding: 8px 0; }
  .feed-toolbar.full-toolbar { gap: 8px; }
  .filter-line { align-items: start; gap: 8px; grid-template-columns: 34px minmax(0, 1fr); }
  .feed-chips { gap: 20px; margin-right: -16px; padding-right: 16px; }
  .story-stream { gap: 0; margin-left: 0; margin-right: 0; }
  .feed-day { background: #edf0f2; border-bottom: 1px solid var(--line); border-top: 1px solid var(--line); font-size: 13px; padding: 7px 12px; }
  .story-stream .story-row, .radar-row { background: transparent; gap: 8px; grid-template-columns: 58px minmax(0, 1fr); padding: 0; }
  .story-time { font-size: 10px; grid-template-columns: 1fr; padding-top: 12px; text-align: left; }
  .story-time .story-date, .story-time .story-clock { font-size: 10px; }
  .story-time i { display: none; }
  .story-content { background: transparent; border: 0; border-bottom: 1px solid #e3e7ea; border-radius: 0; box-shadow: none; padding: 10px 0 12px; }
  .story-meta { font-size: 11px; }
  .story-content h2 { font-size: 15px; line-height: 1.4; margin-top: 4px; }
  .story-content p { font-size: 13px; line-height: 1.65; margin-top: 4px; }
  .story-content .story-judgment { border-left: 2px solid #dbe5ff; margin-top: 8px; padding-left: 10px; }
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
  .tool-heading { margin-top: 0; text-align: left; }
  .tool-heading h1 { font-size: 24px; }
  .tool-stage { border: 0; border-radius: 0; box-shadow: none; margin-left: -12px; margin-right: -12px; padding: 12px; width: auto; }
  .tool-stage textarea { min-height: 96px; }
  .prompt-suggestions { display: grid; grid-template-columns: 1fr; overflow: visible; }
  .prompt-suggestions button { max-width: none; width: 100%; }
  .rail, .event-meta, .inline-defs { grid-template-columns: 1fr; }
  .publisher-index { margin: 0 -16px; overflow-x: auto; padding-left: 16px; flex-wrap: nowrap; }
  .publisher-index span { flex: 0 0 auto; }
  .about-reader { margin-top: 20px; }
  .about-reader header h1 { font-size: 31px; }
  .about-reader header p { font-size: 16px; }
  .about-reader section { gap: 10px; grid-template-columns: 1fr; padding: 24px 0; }
  .site-footer { align-items: flex-start; flex-direction: column; gap: 10px; margin: 0 12px; padding-bottom: 14px; }
}
`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
