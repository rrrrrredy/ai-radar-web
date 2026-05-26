import fs from "node:fs/promises";
import path from "node:path";

type SnapshotItem = {
  id: string;
  title: string;
  url: string;
  source_name: string;
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
  evidence_notes: string[];
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
  reference_app_url: string;
  public_site: {
    purpose: string;
    cloudflare_url: string;
    reference_app_url: string;
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
    sources: number | null;
    raw_items: number | null;
    radar_items: number | null;
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
    ingestion_runs: number | null;
    understanding_runs: number | null;
    entities: number | null;
    item_entities: number | null;
    scores: number | null;
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
    source_to_raw_coverage: number | null;
    raw_to_radar_conversion: number | null;
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
    raw_items: number | null;
    radar_items: number | null;
    public_radar_items: number | null;
    raw_to_radar_conversion: number | null;
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
  await Promise.all([
    fs.mkdir(path.join(outputDir, "assets"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "radar"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "reports"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "ask"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "write"), { recursive: true })
  ]);

  await Promise.all([
    fs.writeFile(path.join(outputDir, "assets", "styles.css"), stylesheet(), "utf8"),
    fs.writeFile(path.join(outputDir, "index.html"), renderHome(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "radar", "index.html"), renderRadar(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "reports", "index.html"), renderReports(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "ask", "index.html"), renderAsk(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "write", "index.html"), renderWrite(snapshot), "utf8")
  ]);
}

function renderHome(snapshot: Snapshot) {
  const latestReports = latestReportsByType(snapshot);
  const curated = snapshot.curated_events.slice(0, 8);

  return shell(snapshot, "home", 0, "今日行业精选", `
    <section class="status-strip">
      ${metricMini("公开信号", snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items)}
      ${metricMini("事件", snapshot.event_count)}
      ${metricMini("已尝试来源", snapshot.coverage.attempted_sources)}
      ${metricMini("成功/失败/手动", `${snapshot.source_health_summary.succeeded}/${snapshot.source_health_summary.failed}/${snapshot.source_health_summary.manual_blocked}`)}
      ${metricMini("报告候选", snapshot.counts.report_candidates ?? snapshot.counts.saved_report_candidates)}
      ${metricMini("最新刷新", formatDate(snapshot.coverage.latest_refresh))}
    </section>

    <section class="hero event-hero">
      <div>
        <div class="pill-row">
          ${pill("Cloudflare 主站", "success")}
          ${pill("事件雷达", "evidence")}
          ${pill(snapshot.source.data_source, "neutral")}
        </div>
        <h1>今日行业精选</h1>
        <p class="lead">把重复信号合并成事件，优先展示多源确认、来源健康、时间线、引用和局限。</p>
        <div class="actions">
          <a class="button primary" href="radar/">打开事件雷达</a>
          <a class="button" href="reports/">查看报告质量</a>
          <a class="button" href="ask/">围绕精选提问</a>
          <a class="button" href="write/">生成行业观察</a>
        </div>
      </div>
      <aside class="panel pulse-panel">
        <h2>信息源健康摘要</h2>
        <dl class="rail">
          ${rail("事件/信号", `${snapshot.event_count} / ${snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items}`)}
          ${rail("多源确认", String(snapshot.event_clusters.filter((event) => event.source_count > 1).length))}
          ${rail("来源成功/失败", `${snapshot.source_health_summary.succeeded} / ${snapshot.source_health_summary.failed}`)}
          ${rail("失败类别", formatDistribution(snapshot.failure_family_summary))}
          ${rail("数据覆盖", `公开来源 ${snapshot.coverage.sources_with_public_items ?? 0} / ${snapshot.coverage.sources_total}`)}
        </dl>
      </aside>
    </section>

    <section class="panel">
      <div class="section-heading">
        <h2>今日行业精选</h2>
        <a href="radar/">查看全部事件</a>
      </div>
      <div class="event-grid">${curated.map(renderEventCard).join("") || empty("暂无可展示事件。")}</div>
    </section>

    <section class="grid two">
      <div class="panel">
        <div class="section-heading">
          <h2>行业脉冲</h2>
          <a href="data/radar-snapshot.json">公开 JSON</a>
        </div>
        <div class="distribution">
          ${distribution("类别分布", snapshot.top_categories.slice(0, 8).map((entry) => [entry.label, entry.count]))}
          ${distribution("来源分布", snapshot.top_sources.slice(0, 8).map((entry) => [entry.label, entry.count]))}
          ${distribution("状态分布", [["已纳入", snapshot.counts.included], ["待复核", snapshot.counts.needs_review], ["已排除", snapshot.counts.excluded]])}
          ${distribution("失败原因", Object.entries(snapshot.failure_family_summary).slice(0, 8))}
        </div>
      </div>
      <div class="panel">
        <div class="section-heading">
          <h2>查询/写作入口</h2>
          <a href="ask/">提问</a>
        </div>
        ${noteList([
          "今天有哪些多源确认的模型发布？",
          "过去 24 小时 Agent / 开发工具 有哪些重要变化？",
          "哪些事件只有单一来源，可信度较低？",
          "基于今日行业精选写一段 AI 行业观察"
        ])}
      </div>
    </section>

    <section class="grid two">
      <div class="panel">
        <div class="section-heading">
          <h2>最新报告</h2>
          <a href="reports/">打开报告台</a>
        </div>
        <div class="row-list">${latestReports.map(renderCompactReport).join("") || empty("没有找到公开报告候选。")}</div>
      </div>
      <div class="panel">
        <h2>数据覆盖与局限</h2>
        ${noteList(snapshot.caveats.slice(0, 8))}
      </div>
    </section>
  `);
}

function renderRadar(snapshot: Snapshot) {
  const families = countSourceFamilies(snapshot.radar_items);
  const eventFamilies = uniqueStrings(snapshot.event_clusters.flatMap((event) => event.source_families));
  const scoreLabels = uniqueStrings(snapshot.event_clusters.map((event) => event.event_score_label));

  return shell(snapshot, "radar", 1, "雷达", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items} 条公开`, "success")}
          ${pill(`${snapshot.event_count} 个事件`, "evidence")}
          ${pill(`${snapshot.coverage.attempted_sources} 个已尝试来源`, "neutral")}
          ${pill(snapshot.source.data_source, "neutral")}
        </div>
        <h1>事件雷达</h1>
        <p class="lead">默认展示行业精选事件；全部信号仍保留在“全部信号”标签下，避免同一事件被重复阅读。</p>
      </div>
    </section>

    ${coveragePanel(snapshot)}

    <section class="panel">
      <div class="tabbar" role="tablist" aria-label="雷达视图">
        ${tabButton("curated", "行业精选", true)}
        ${tabButton("events", "全部事件")}
        ${tabButton("signals", "全部信号")}
        ${tabButton("timeline", "最新时间线")}
        ${tabButton("review", "待复核")}
        ${tabButton("health", "来源健康")}
      </div>
      <div class="controls" role="search">
        <label>搜索 <input id="radar-search" type="search" placeholder="标题、来源、类别、标签"></label>
        <label>状态 <select id="radar-status">${option("all", "全部状态")}${["included", "needs_review", "excluded", "failed"].map((status) => option(status, statusLabel(status))).join("")}</select></label>
        <label>类别 <select id="radar-category">${option("all", "全部类别")}${snapshot.top_categories.map((entry) => option(entry.label, entry.label)).join("")}</select></label>
        <label>来源家族 <select id="radar-family">${option("all", "全部家族")}${uniqueStrings([...Object.keys(families), ...eventFamilies]).map((family) => option(family, family)).join("")}</select></label>
        <label>评分 <select id="radar-score">${option("all", "全部评分")}${scoreLabels.map((label) => option(label, label)).join("")}</select></label>
        <label>来源数 <select id="radar-source-count">${option("all", "全部")}${option("multi", "多源确认")}${option("single", "单源")}</select></label>
      </div>
      <div class="distribution">
        ${distribution("状态", [
          [statusLabel("included"), snapshot.counts.included],
          [statusLabel("needs_review"), snapshot.counts.needs_review],
          [statusLabel("excluded"), snapshot.counts.excluded],
          [statusLabel("failed"), snapshot.counts.failed]
        ])}
        ${distribution("类别", snapshot.top_categories.slice(0, 8).map((entry) => [entry.label, entry.count]))}
        ${distribution("来源家族", Object.entries(families))}
        ${distribution("来源覆盖", [
          ["总数", snapshot.coverage.sources_total],
          ["自动合格", snapshot.coverage.automated_eligible_sources],
          ["已尝试", snapshot.coverage.attempted_sources],
          ["有公开条目的来源", snapshot.coverage.sources_with_public_items ?? 0],
          ["失败", snapshot.coverage.failed_sources],
          ["跳过", snapshot.coverage.skipped_sources]
        ])}
        ${distribution("新鲜度", freshnessBuckets(snapshot.radar_items))}
      </div>
    </section>

    <section class="tab-panel active" data-tab-panel="curated">
      <div class="event-grid">${snapshot.curated_events.map(renderEventCard).join("") || empty("暂无行业精选事件。")}</div>
    </section>

    <section class="tab-panel" data-tab-panel="events">
      <div class="event-grid">${snapshot.event_clusters.map(renderEventCard).join("") || empty("暂无事件聚类。")}</div>
    </section>

    <section class="tab-panel" data-tab-panel="signals">
      <div class="grid radar-layout">
      <div class="row-list radar-list" id="radar-list">
        ${snapshot.radar_items.map(renderRadarItem).join("") || empty("暂无雷达条目。")}
      </div>
      <aside class="panel sticky">
        <h2>引用栏</h2>
        <p class="note">链接指向公开来源页面。快照不包含私有原文、供应商元数据或服务密钥。</p>
        <div class="row-list">${snapshot.radar_items.slice(0, 12).map(renderCitation).join("")}</div>
      </aside>
      </div>
    </section>

    <section class="tab-panel" data-tab-panel="timeline">
      <div class="timeline-list">${snapshot.timeline.map(renderTimelineEntry).join("") || empty("暂无时间线。")}</div>
    </section>

    <section class="tab-panel" data-tab-panel="review">
      <div class="event-grid">${snapshot.event_clusters.filter((event) => event.caveats.length > 0 || event.related_item_ids.some((id) => snapshot.radar_items.find((item) => item.id === id)?.status === "needs_review")).map(renderEventCard).join("") || empty("暂无待复核事件。")}</div>
    </section>

    <section class="tab-panel" data-tab-panel="health">
      ${sourceHealthPanel(snapshot)}
    </section>
    <script>${filterScript()}</script>
  `);
}

function renderReports(snapshot: Snapshot) {
  const reports = latestReportsByType(snapshot);
  const dailySummary = snapshot.report_quality_summary.daily;

  return shell(snapshot, "reports", 1, "报告", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.counts.report_candidates ?? snapshot.counts.saved_report_candidates} 个候选`, "success")}
          ${pill(`${snapshot.counts.report_snapshots} 个公开快照`, "evidence")}
          ${pill(`${snapshot.event_count} 个事件`, "neutral")}
          ${pill(snapshot.source.data_source, "neutral")}
        </div>
        <h1>事件感知报告</h1>
        <p class="lead">报告候选会显示质量门禁、纳入事件、引用、来源多样性、缺失证据和局限；数据不足的日报不会被包装成完整报告。</p>
      </div>
    </section>
    ${dailySummary && !dailySummary.quality_gate_passed ? `<section class="callout warning"><strong>今日数据不足，需补充信源或等待下一轮刷新</strong><p>${escapeHtml(dailySummary.quality_gate_reasons.map(publicText).join("；") || "日报质量门禁未通过。")}</p></section>` : ""}
    ${coveragePanel(snapshot)}
    ${reportCoveragePanel(snapshot, reports)}
    <section class="report-list">
      ${reports.map((report) => renderReport(report, snapshot)).join("") || empty("没有找到公开报告候选。")}
    </section>
  `);
}

function renderAsk(snapshot: Snapshot) {
  const examples = [
    "今天有哪些多源确认的模型发布？",
    "过去 24 小时 Agent / 开发工具 有哪些重要变化？",
    "哪些事件只有单一来源，可信度较低？",
    "哪些来源今天失败或没有新内容？",
    "把今日行业精选按重要性排序",
    ...snapshot.curated_events.slice(0, 2).map((event) => `围绕“${event.canonical_title}”有哪些证据和不确定性？`)
  ];

  return shell(snapshot, "ask", 1, "提问", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.event_count} 个事件`, "success")}
          ${pill("事件查询页", "evidence")}
        </div>
        <h1>事件提问</h1>
        <p class="lead">围绕今日行业精选、多源确认、来源失败和弱信号提问。Cloudflare 保持只读，不暴露 API Key 或服务端路由。</p>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>证据上下文</h2>
        <dl class="rail">
          ${rail("数据来源", snapshot.source.data_source)}
          ${rail("最新雷达", formatDate(snapshot.freshness.latest_timestamp))}
          ${rail("事件数量", String(snapshot.event_count))}
          ${coverageRailRows(snapshot)}
          ${rail("待复核", String(snapshot.counts.needs_review))}
        </dl>
      </div>
      <div class="panel">
        <h2>示例问题</h2>
        ${noteList(examples)}
      </div>
    </section>
    <section class="panel">
      <h2>注意事项</h2>
      ${noteList(snapshot.caveats.slice(0, 6))}
    </section>
  `);
}

function renderWrite(snapshot: Snapshot) {
  const prompts = [
    "基于今日行业精选写一段 AI 行业观察",
    "把本周多源确认事件整理成周报提纲",
    "找出适合写成深度分析的 3 个事件",
    "列出证据不足但值得继续跟踪的弱信号",
    ...snapshot.curated_events.slice(0, 2).map((event) => `基于“${event.canonical_title}”写一个带证据边界的观察角度。`)
  ];

  return shell(snapshot, "write", 1, "写作", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.counts.report_candidates ?? snapshot.counts.saved_report_candidates} 个报告候选`, "success")}
          ${pill(`${snapshot.event_count} 个事件`, "evidence")}
        </div>
        <h1>事件写作</h1>
        <p class="lead">基于行业精选、多源确认、弱信号和报告质量状态组织写作提示。Cloudflare 上保持只读。</p>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>写作提示</h2>
        ${noteList(prompts)}
      </div>
      <div class="panel">
        <h2>数据上下文</h2>
        <dl class="rail">
          ${rail("数据来源", snapshot.source.data_source)}
          ${rail("最新雷达", formatDate(snapshot.freshness.latest_timestamp))}
          ${rail("事件数量", String(snapshot.event_count))}
          ${coverageRailRows(snapshot)}
          ${rail("报告候选", String(snapshot.counts.report_candidates ?? snapshot.counts.saved_report_candidates))}
        </dl>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>当前报告上下文</h2>
        ${latestReportsByType(snapshot).map(renderCompactReport).join("") || empty("没有找到公开报告候选。")}
      </div>
      <div class="panel">
        <h2>注意事项</h2>
        ${noteList(snapshot.caveats.slice(0, 6))}
      </div>
    </section>
    <section class="panel">
      <h2>缺失证据</h2>
      ${noteList(uniqueStrings(snapshot.reports.flatMap((report) => report.missing_evidence)).slice(0, 8).concat(snapshot.caveats.slice(0, 3)))}
    </section>
  `);
}

function shell(snapshot: Snapshot, current: "home" | "radar" | "reports" | "ask" | "write", depth: 0 | 1, title: string, body: string) {
  const prefix = depth === 0 ? "" : "../";
  const nav = [
    ["home", "今日", `${prefix}index.html`],
    ["radar", "雷达", `${prefix}radar/`],
    ["reports", "报告", `${prefix}reports/`],
    ["ask", "提问", `${prefix}ask/`],
    ["write", "写作", `${prefix}write/`]
  ] as const;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="AI 行业雷达 Cloudflare 公开站">
    <title>${escapeHtml(title)} - AI 行业雷达</title>
    <link rel="stylesheet" href="${prefix}assets/styles.css">
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="${prefix}index.html"><span class="brand-mark"></span><span>AI 行业雷达</span></a>
      <nav aria-label="主导航">
        ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${escapeHtml(label)}</a>`).join("")}
      </nav>
    </header>
    <main>${body}</main>
    <footer class="site-footer">
      <span>生成时间 ${escapeHtml(formatDate(snapshot.generated_at))}</span>
      <span>Cloudflare 公开只读站。Vercel 参考动态应用：<a href="${escapeAttr(snapshot.reference_app_url)}">${escapeHtml(snapshot.reference_app_url)}</a></span>
    </footer>
  </body>
</html>`;
}

function renderEventCard(event: SnapshotEvent) {
  const search = [
    event.canonical_title,
    event.summary_zh,
    event.category,
    event.event_score_label,
    event.source_families.join(" "),
    event.related_entities.join(" "),
    event.citations.map((citation) => citation.source_name).join(" ")
  ].join(" ").toLowerCase();
  const sourceCount = event.source_count > 1 ? "multi" : "single";

  return `<article class="event-card" data-category="${escapeAttr(labelize(event.category))}" data-family="${escapeAttr(event.source_families.join(" "))}" data-score="${escapeAttr(event.event_score_label)}" data-search="${escapeAttr(search)}" data-source-count="${sourceCount}">
    <div class="pill-row">
      ${pill(event.event_score_label, eventScoreTone(event.event_score_label))}
      ${pill(`分数 ${event.event_score}`, "evidence")}
      ${pill(`${event.source_count} 个来源`, event.source_count > 1 ? "success" : "caution")}
      ${event.source_families.slice(0, 3).map((family) => pill(family, "neutral")).join("")}
    </div>
    <h2>${escapeHtml(event.canonical_title)}</h2>
    <p>${escapeHtml(publicText(event.summary_zh))}</p>
    <dl class="event-meta">
      ${rail("类别", labelize(event.category))}
      ${rail("时间", `${formatDate(event.first_seen_at)} 至 ${formatDate(event.latest_seen_at)}`)}
      ${rail("相关信号", String(event.related_item_ids.length))}
      ${rail("评分说明", event.score_reason)}
    </dl>
    ${event.related_entities.length > 0 ? `<div class="pill-row">${event.related_entities.slice(0, 6).map((entity) => pill(entity, "neutral")).join("")}</div>` : ""}
    <details>
      <summary>展开时间线</summary>
      <div class="timeline-list compact">${event.timeline.map(renderEventTimelineRow).join("")}</div>
    </details>
    <details>
      <summary>查看相关信号</summary>
      <div class="citation-grid">${event.citations.map(renderEventCitation).join("")}</div>
    </details>
    ${event.caveats.length > 0 ? `<div class="event-caveats">${noteList(event.caveats)}</div>` : ""}
  </article>`;
}

function renderEventMini(event: SnapshotEvent) {
  return `<article class="event-mini">
    ${pill(event.event_score_label, eventScoreTone(event.event_score_label))}
    <strong>${escapeHtml(event.canonical_title)}</strong>
    <span>${escapeHtml(`${event.source_count} 个来源 / ${event.related_item_ids.length} 条信号`)}</span>
  </article>`;
}

function renderEventTimelineRow(entry: SnapshotEvent["timeline"][number]) {
  return `<a class="timeline-row" href="${escapeAttr(entry.url)}">
    <time>${escapeHtml(formatDate(entry.timestamp))}</time>
    <strong>${escapeHtml(entry.title)}</strong>
    <span>${escapeHtml(entry.source_name)}</span>
  </a>`;
}

function renderEventCitation(citation: SnapshotEvent["citations"][number]) {
  return `<a class="citation" href="${escapeAttr(citation.url)}"><span>${escapeHtml(citation.source_name)}</span><strong>${escapeHtml(citation.title)}</strong><small>${escapeHtml(formatDate(citation.published_at ?? citation.collected_at))}</small></a>`;
}

function renderTimelineEntry(entry: SnapshotTimelineEntry) {
  return `<a class="timeline-row" href="${escapeAttr(entry.url)}">
    <time>${escapeHtml(formatDate(entry.timestamp))}</time>
    <strong>${escapeHtml(entry.event_title)}</strong>
    <span>${escapeHtml(`${entry.source_name} / ${entry.event_score_label}`)}</span>
  </a>`;
}

function renderRadarItem(item: SnapshotItem) {
  const family = sourceFamily(item);
  const search = [item.title, item.source_name, item.status, item.categories.join(" "), item.tags.join(" "), item.summary_en, item.summary_zh].join(" ").toLowerCase();

  return `<article class="radar-row" data-category="${escapeAttr(item.categories.join(" "))}" data-family="${escapeAttr(family)}" data-search="${escapeAttr(search)}" data-status="${escapeAttr(item.status)}">
    <div>
      <div class="pill-row">${pill(statusLabel(item.status), statusTone(item.status))}${pill(family, "neutral")}${pill(`综合 ${item.scores.overall.toFixed(2)}`, "evidence")}${pill(`置信度 ${formatPercent(item.confidence)}`, "success")}</div>
      <h2><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></h2>
      <p>${escapeHtml(item.summary_zh || item.summary_en || "暂无公开摘要。")}</p>
      ${item.why_it_matters ? `<p class="note"><strong>为什么重要：</strong> ${escapeHtml(publicText(item.why_it_matters))}</p>` : ""}
      <div class="pill-row">${item.categories.map((category) => pill(labelize(category), "evidence")).join("")}${item.tags.slice(0, 5).map((tag) => pill(tag, "neutral")).join("")}</div>
    </div>
    <aside><dl class="rail">${rail("来源", item.source_name)}${rail("层级", item.source_tier)}${rail("发布时间", formatDate(item.published_at))}${rail("处理时间", formatDate(item.processed_at))}</dl><a class="source-link" href="${escapeAttr(item.url)}">打开引用</a></aside>
  </article>`;
}

function renderCitation(item: SnapshotItem) {
  return `<a class="citation" href="${escapeAttr(item.url)}"><span>${escapeHtml(item.source_name)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(formatDate(item.published_at ?? item.collected_at))}</small></a>`;
}

function renderCompactReport(report: SnapshotReport) {
  return `<article class="compact-row">
    <div>${pill(reportTypeLabel(report.report_type), "evidence")}${qualityPill(report)}${pill(statusLabel(report.status), statusTone(report.status))}${pill(modeLabel(report.mode), "neutral")}<h3>${escapeHtml(publicText(report.title))}</h3><p>${escapeHtml(publicText(report.summary))}</p></div>
    <dl>${rail("可用条目", String(report.usable_item_count ?? report.source_item_count))}${rail("引用数", String(report.citation_count ?? report.citations.length))}${rail("来源/类别", `${report.distinct_source_count ?? 0} / ${report.category_count ?? 0}`)}${rail("保存时间", formatDate(report.saved_at ?? report.generated_at))}</dl>
  </article>`;
}

function renderReport(report: SnapshotReport, snapshot: Snapshot) {
  const quality = report.report_type === "daily" ? snapshot.report_quality_summary.daily : snapshot.report_quality_summary.weekly;
  const includedEvents = (quality?.top_event_ids ?? [])
    .map((id) => snapshot.event_clusters.find((event) => event.event_cluster_id === id))
    .filter((event): event is SnapshotEvent => Boolean(event));

  return `<article class="report-card">
    <div class="section-heading"><div><div class="pill-row">${pill(reportTypeLabel(report.report_type), "evidence")}${qualityPill(report)}${pill(statusLabel(report.status), statusTone(report.status))}${pill(modeLabel(report.mode), "success")}${pill(`可用 ${report.usable_item_count ?? report.source_item_count}`, "neutral")}${pill(`引用 ${report.citation_count ?? report.citations.length}`, "neutral")}${pill(`来源 ${report.distinct_source_count ?? 0}`, "neutral")}${pill(`类别 ${report.category_count ?? 0}`, "neutral")}</div><h2>${escapeHtml(publicText(report.title))}</h2></div><span>${escapeHtml(formatDate(report.saved_at ?? report.generated_at))}</span></div>
    <p class="report-summary">${escapeHtml(publicText(report.summary))}</p>
    ${!report.quality_gate_passed && report.report_type === "daily" ? `<div class="callout warning"><strong>今日数据不足，需补充信源或等待下一轮刷新</strong></div>` : ""}
    ${report.executive_summary ? `<p>${escapeHtml(publicText(report.executive_summary))}</p>` : ""}
    <dl class="inline-defs">${rail("质量门禁", qualityLabel(report))}${rail("事件数", String(includedEvents.length))}${rail("可用/引用/来源/类别", `${report.usable_item_count ?? report.source_item_count} / ${report.citation_count ?? report.citations.length} / ${report.distinct_source_count ?? 0} / ${report.category_count ?? 0}`)}${rail("时间窗口", `${formatDate(report.time_window.start)} 至 ${formatDate(report.time_window.end)}`)}${rail("数据来源", report.data_source)}${rail("缺失证据", String(report.missing_evidence.length))}</dl>
    ${includedEvents.length > 0 ? `<h3>纳入的精选事件</h3><div class="event-mini-list">${includedEvents.map(renderEventMini).join("")}</div>` : ""}
    ${!report.quality_gate_passed && report.quality_gate_reasons.length > 0 ? `<h3>为什么报告偏薄</h3>${noteList(report.quality_gate_reasons)}` : ""}
    ${report.sections.map(renderReportSection).join("")}
    ${report.citations.length > 0 ? `<div class="citation-grid">${report.citations.map(renderReportCitation).join("")}</div>` : ""}
    ${report.caveats.length > 0 ? `<h3>局限</h3>${noteList(report.caveats)}` : ""}
    ${report.missing_evidence.length > 0 ? `<h3>缺失证据</h3>${noteList(report.missing_evidence)}` : ""}
    <details class="markdown"><summary>Markdown 导出</summary><pre>${escapeHtml(markdownForReport(report))}</pre></details>
  </article>`;
}

function renderReportSection(section: SnapshotReport["sections"][number]) {
  return `<section class="report-section"><h3>${escapeHtml(publicText(section.title))}</h3><p>${escapeHtml(publicText(section.summary))}</p>${section.bullets.length > 0 ? noteList(section.bullets) : ""}</section>`;
}

function renderReportCitation(citation: SnapshotReport["citations"][number]) {
  return `<a class="citation" href="${escapeAttr(citation.url)}"><span>${escapeHtml(citation.source_name)}</span><strong>${escapeHtml(citation.title)}</strong><small>${escapeHtml(formatDate(citation.published_at ?? citation.collected_at))}</small></a>`;
}

function markdownForReport(report: SnapshotReport) {
  const lines = [
    `# ${publicText(report.title)}`,
    "",
    publicText(report.summary),
    "",
    `- 类型: ${reportTypeLabel(report.report_type)}`,
    `- 状态: ${statusLabel(report.status)}`,
    `- 时间窗口: ${report.time_window.start} 至 ${report.time_window.end}`,
    `- 来源条目: ${report.source_item_count}`,
    `- 质量门禁: ${qualityLabel(report)}`,
    `- 可用条目: ${report.usable_item_count ?? report.source_item_count}`,
    `- 引用: ${report.citation_count ?? report.citations.length}`,
    `- 独立来源: ${report.distinct_source_count ?? 0}`,
    `- 类别: ${report.category_count ?? 0}`,
    "",
    ...report.sections.flatMap((section) => [
      `## ${publicText(section.title)}`,
      "",
      publicText(section.summary),
      "",
      ...section.bullets.map((bullet) => `- ${publicText(bullet)}`),
      ""
    ]),
    "## 局限",
    "",
    ...(report.caveats.length > 0 ? report.caveats.map((caveat) => `- ${publicText(caveat)}`) : ["- 未记录局限。"]),
    "",
    "## 质量门禁",
    "",
    ...(report.quality_gate_passed ? ["- 已通过。"] : report.quality_gate_reasons.map((reason) => `- ${publicText(reason)}`)),
    "",
    "## 引用",
    "",
    ...(report.citations.length > 0 ? report.citations.map((citation) => `- ${citation.title} (${citation.source_name}) ${citation.url}`) : ["- 未记录引用。"])
  ];
  return lines.join("\n");
}

function latestReportsByType(snapshot: Snapshot) {
  const reportsByType = new Map<string, SnapshotReport>();
  for (const report of snapshot.reports) {
    if (!reportsByType.has(report.report_type)) {
      reportsByType.set(report.report_type, report);
    }
  }
  return Array.from(reportsByType.values());
}

function countSourceFamilies(items: SnapshotItem[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const family = sourceFamily(item);
    counts[family] = (counts[family] ?? 0) + 1;
    return counts;
  }, {});
}

function sourceFamily(item: Pick<SnapshotItem, "source_name" | "url" | "source_tier">) {
  const text = `${item.source_name} ${item.url} ${item.source_tier}`.toLowerCase();
  if (text.includes("arxiv")) return "研究订阅";
  if (text.includes("github") || text.includes("release") || text.includes("hugging face")) return "开源项目";
  if (["openai", "anthropic", "google", "deepmind", "meta", "llama", "deepseek", "qwen"].some((term) => text.includes(term))) return "公司/实验室";
  if (["lex", "every", "latent", "lenny", "benedict", "karpathy"].some((term) => text.includes(term))) return "分析/媒体";
  return "其他公开来源";
}

function freshnessBuckets(items: SnapshotItem[]): Array<[string, number]> {
  const now = Date.now();
  return [
    ["24h", items.filter((item) => now - Date.parse(item.processed_at) <= 86_400_000).length],
    ["7d", items.filter((item) => now - Date.parse(item.processed_at) <= 604_800_000).length],
    ["30d", items.filter((item) => now - Date.parse(item.processed_at) <= 2_592_000_000).length]
  ];
}

function distribution(title: string, entries: Array<[string, number]>) {
  return `<section><h3>${escapeHtml(title)}</h3><div class="tag-block">${entries.map(([label, value]) => pill(`${labelize(label)} ${value}`, "neutral")).join("")}</div></section>`;
}

function formatDistribution(entries: Record<string, number>) {
  const text = Object.entries(entries)
    .filter(([, count]) => count > 0)
    .slice(0, 4)
    .map(([label, count]) => `${labelize(label)} ${count}`)
    .join(" / ");

  return text || "无";
}

function coveragePanel(snapshot: Snapshot) {
  return `
    <section class="panel">
      <div class="section-heading">
        <h2>公开快照覆盖</h2>
      </div>
      <dl class="rail">
        ${coverageRailRows(snapshot)}
      </dl>
      ${Object.keys(snapshot.coverage.failure_families ?? {}).length > 0 ? `<div class="distribution">${distribution("失败类别", Object.entries(snapshot.coverage.failure_families ?? {}))}</div>` : ""}
    </section>
  `;
}

function reportCoveragePanel(snapshot: Snapshot, reports: SnapshotReport[]) {
  const daily = reports.find((report) => report.report_type === "daily");
  const weekly = reports.find((report) => report.report_type === "weekly");

  return `
    <section class="panel">
      <div class="section-heading">
        <h2>报告候选覆盖</h2>
      </div>
      <dl class="rail">
        ${rail("报告候选", String(snapshot.counts.report_candidates ?? snapshot.counts.saved_report_candidates))}
        ${rail("候选数量", String(snapshot.counts.report_candidates ?? snapshot.counts.saved_report_candidates))}
        ${rail("最新日报候选", daily ? publicText(daily.title) : "不可用")}
        ${rail("质量门禁", daily ? qualityLabel(daily) : "不可用")}
        ${rail("条目数", String(daily?.usable_item_count ?? daily?.source_item_count ?? 0))}
        ${rail("引用/来源/类别", `${daily?.citation_count ?? daily?.citations.length ?? 0} / ${daily?.distinct_source_count ?? 0} / ${daily?.category_count ?? 0}`)}
        ${rail("最新周报候选", weekly ? publicText(weekly.title) : "不可用")}
        ${rail("周报质量门禁", weekly ? qualityLabel(weekly) : "不可用")}
        ${rail("周报条目数", String(weekly?.usable_item_count ?? weekly?.source_item_count ?? 0))}
        ${rail("周报引用/来源/类别", `${weekly?.citation_count ?? weekly?.citations.length ?? 0} / ${weekly?.distinct_source_count ?? 0} / ${weekly?.category_count ?? 0}`)}
      </dl>
    </section>
  `;
}

function coverageRailRows(snapshot: Snapshot) {
  return [
    rail("只读快照", "公开快照"),
    rail("来源总数", String(snapshot.coverage.sources_total)),
    rail("自动合格来源", String(snapshot.coverage.automated_eligible_sources)),
    rail("已尝试来源", String(snapshot.coverage.attempted_sources)),
    rail("有公开条目的来源", String(snapshot.coverage.sources_with_public_items ?? "不可用")),
    rail("公开条目", String(snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items)),
    rail("失败/跳过来源", String(snapshot.coverage.failed_sources + snapshot.coverage.skipped_sources)),
    rail("来源到原始覆盖率", formatNullablePercent(snapshot.coverage.source_to_raw_coverage)),
    rail("更新时间", formatDate(snapshot.coverage.latest_refresh))
  ].join("");
}

function sourceHealthPanel(snapshot: Snapshot) {
  const health = snapshot.source_health_summary;

  return `<section class="panel">
    <div class="section-heading">
      <h2>信息源健康摘要</h2>
      <span>${escapeHtml(formatDate(snapshot.coverage.latest_refresh))}</span>
    </div>
    <dl class="metric-grid">
      ${metric("本轮成功源", health.succeeded)}
      ${metric("失败源", health.failed)}
      ${metric("手动/阻塞源", health.manual_blocked)}
      ${metric("超时", health.timeout)}
      ${metric("403", health["403"])}
      ${metric("限流", health.rate_limit)}
      ${metric("无新内容", health.no_items)}
      ${metric("重复-only", health.duplicate_only)}
    </dl>
    <div class="distribution">
      ${distribution("失败原因分布", Object.entries(snapshot.failure_family_summary))}
      ${distribution("跳过/阻塞", [["手动阻塞", health.manual_blocked], ["不支持", health.unsupported_source], ["低相关排除", health.low_relevance_excluded]])}
    </div>
  </section>`;
}

function metric(label: string, value: number | null) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${value === null ? "不可用" : value.toLocaleString("en-US")}</dd></div>`;
}

function metricMini(label: string, value: number | string | null) {
  return `<div class="mini-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value ?? "不可用"))}</strong></div>`;
}

function rail(label: string, value: string | number | null) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value ?? "不可用"))}</dd>`;
}

function option(value: string, label: string) {
  return `<option value="${escapeAttr(value)}">${escapeHtml(labelize(label))}</option>`;
}

function pill(label: string, tone: "caution" | "evidence" | "neutral" | "success") {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

function tabButton(id: string, label: string, selected = false) {
  return `<button class="tab-button${selected ? " active" : ""}" data-tab-target="${escapeAttr(id)}" type="button">${escapeHtml(label)}</button>`;
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

function modeLabel(mode: string) {
  const labels: Record<string, string> = {
    local_preview: "本地预览",
    saved_candidate: "已保存候选",
    saved_report: "已保存报告"
  };
  return labels[mode] ?? mode;
}

function qualityPill(report: SnapshotReport) {
  return pill(qualityLabel(report), report.quality_gate_passed ? "success" : "caution");
}

function qualityLabel(report: SnapshotReport) {
  return report.quality_gate_passed ? "质量通过" : "需要更多数据";
}

function statusTone(status: string): "caution" | "evidence" | "neutral" | "success" {
  if (status === "included" || status === "needs_review") return status === "included" ? "success" : "caution";
  if (status === "needs_review" || status === "draft") return "caution";
  return "neutral";
}

function eventScoreTone(label: SnapshotEvent["event_score_label"]): "caution" | "evidence" | "neutral" | "success" {
  if (label === "高优先级") return "success";
  if (label === "关注") return "evidence";
  if (label === "观察") return "neutral";
  return "caution";
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
    infrastructure: "基础设施",
    included: "已纳入",
    "model release": "模型发布",
    model_release: "模型发布",
    needs_review: "待复核",
    opinion: "观点",
    "open source": "开源",
    open_source: "开源",
    other: "其他",
    "product update": "产品更新",
    product_update: "产品更新",
    research: "研究",
    safety: "安全",
    tooling: "工具",
    total: "总数",
    weekly: "周报"
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function publicText(value: string) {
  return value
    .replace(
      "Cloudflare Pages is the primary public read surface. Auth, Admin, server actions, and write workflows remain outside this public Cloudflare surface.",
      "Cloudflare Pages 是主要公开只读页面；登录、Admin、服务端操作和写入流程不在这个公开页面中运行。"
    )
    .replace(
      "Only public-safe radar and report fields are included. Private raw content, provider metadata, internal notes, service-role access, and secrets are excluded.",
      "只纳入公开安全的雷达和报告字段；私有原文、供应商元数据、内部备注、service-role 访问和密钥均已排除。"
    )
    .replace(
      "Snapshot data came from Supabase public-safe read views using anon read access.",
      "快照数据来自 Supabase 公开安全只读视图，并使用 anon 只读访问。"
    )
    .replace(
      "Radar rows came from Supabase public-safe read views. Report candidates are projected to the same public-safe field allowlist during export.",
      "雷达条目来自 Supabase 公开安全只读视图；报告候选在导出时投影到同一组公开安全字段。"
    )
    .replace(
      "Full article text or original announcements are needed beyond metadata-level evidence.",
      "除了元数据级证据外，仍需要完整文章正文或原始公告。"
    )
    .replace(
      "Read-only Supabase public radar retrieval was used; no Supabase write path ran.",
      "使用 Supabase 公共雷达视图进行只读检索；未运行 Supabase 写入路径。"
    )
    .replace(
      "This surface shows available AI Radar evidence only; it is not a claim of complete current AI industry coverage.",
      "此页面只展示当前可用的 AI 行业雷达证据，不声称覆盖完整的实时 AI 行业。"
    )
    .replace("This is a deterministic preview, not a published report.", "这是确定性预览，不是已发布报告。")
    .replace(
      "No live DeepSeek call, Supabase write, or scheduled persistence job was run.",
      "未运行 Live DeepSeek 调用、Supabase 写入或计划任务持久化。"
    )
    .replace(
      "Supabase coverage depends on rows already persisted into the public retrieval view.",
      "Supabase 覆盖范围取决于已经持久化到公共检索视图的行。"
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
    .replace(/Deterministic daily preview from (\d+) usable radar item\(s\)\./g, "确定性日报预览基于 $1 条可用雷达条目。")
    .replace(/Deterministic weekly preview from (\d+) usable radar item\(s\)\./g, "确定性周报预览基于 $1 条可用雷达条目。")
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
    .replace(/Deterministic daily preview/g, "确定性日报预览")
    .replace(/Deterministic weekly preview/g, "确定性周报预览")
    .replace(/usable radar item\(s\)/g, "条可用雷达条目")
    .replace(/usable item\(s\)/g, "条可用条目")
    .replace(/radar item\(s\)/g, "条雷达条目");
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatNullablePercent(value: number | null) {
  return value === null ? "不可用" : formatPercent(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "不可用";
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

function filterScript() {
  return `
const search = document.querySelector("#radar-search");
const status = document.querySelector("#radar-status");
const category = document.querySelector("#radar-category");
const family = document.querySelector("#radar-family");
const score = document.querySelector("#radar-score");
const sourceCount = document.querySelector("#radar-source-count");
const rows = Array.from(document.querySelectorAll(".radar-row"));
const eventCards = Array.from(document.querySelectorAll(".event-card"));
const tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
function applyFilters() {
  const query = (search.value || "").toLowerCase();
  const selectedStatus = status.value;
  const selectedCategory = category.value.toLowerCase();
  const selectedFamily = family.value;
  const selectedScore = score.value;
  const selectedSourceCount = sourceCount.value;
  for (const card of eventCards) {
    const matchesQuery = !query || card.dataset.search.includes(query);
    const matchesCategory = selectedCategory === "all" || card.dataset.category.toLowerCase().includes(selectedCategory);
    const matchesFamily = selectedFamily === "all" || card.dataset.family.includes(selectedFamily);
    const matchesScore = selectedScore === "all" || card.dataset.score === selectedScore;
    const matchesSourceCount = selectedSourceCount === "all" || card.dataset.sourceCount === selectedSourceCount;
    card.hidden = !(matchesQuery && matchesCategory && matchesFamily && matchesScore && matchesSourceCount);
  }
  for (const row of rows) {
    const matchesQuery = !query || row.dataset.search.includes(query);
    const matchesStatus = selectedStatus === "all" || row.dataset.status === selectedStatus;
    const matchesCategory = selectedCategory === "all" || row.dataset.category.toLowerCase().includes(selectedCategory);
    const matchesFamily = selectedFamily === "all" || row.dataset.family === selectedFamily;
    row.hidden = !(matchesQuery && matchesStatus && matchesCategory && matchesFamily);
  }
}
[search, status, category, family, score, sourceCount].forEach((control) => control.addEventListener("input", applyFilters));
for (const button of tabButtons) {
  button.addEventListener("click", () => {
    const target = button.dataset.tabTarget;
    for (const candidate of tabButtons) candidate.classList.toggle("active", candidate === button);
    for (const panel of tabPanels) panel.classList.toggle("active", panel.dataset.tabPanel === target);
  });
}
`;
}

function stylesheet() {
  return `:root {
  --bg: #f7f8f5;
  --ink: #10201c;
  --muted: #5d6b66;
  --line: #d9dfda;
  --panel: #ffffff;
  --soft: #eef4f1;
  --evidence: #0f766e;
  --success: #166534;
  --caution: #b45309;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Arial, Helvetica, sans-serif; line-height: 1.5; }
a { color: var(--evidence); text-decoration: none; }
a:hover { text-decoration: underline; }
.site-header, .site-footer, main { margin: 0 auto; max-width: 1180px; padding: 0 20px; }
.site-header { align-items: center; display: flex; gap: 20px; justify-content: space-between; padding-bottom: 20px; padding-top: 20px; }
.brand { align-items: center; color: var(--ink); display: inline-flex; font-weight: 700; gap: 10px; }
.brand-mark { background: var(--evidence); border-radius: 6px; display: inline-block; height: 26px; width: 26px; }
nav, .actions, .pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
nav a, .button { border: 1px solid var(--line); border-radius: 6px; color: var(--ink); display: inline-flex; font-size: 14px; font-weight: 700; padding: 9px 12px; }
nav a[aria-current="page"], .button.primary { background: var(--ink); border-color: var(--ink); color: #fff; }
main { display: grid; gap: 24px; padding-bottom: 42px; }
.status-strip { display: grid; gap: 10px; grid-template-columns: repeat(6, minmax(0, 1fr)); }
.mini-metric { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 4px; padding: 12px; }
.mini-metric span { color: var(--muted); font-size: 12px; font-weight: 700; }
.mini-metric strong { color: var(--ink); font-size: 18px; overflow-wrap: anywhere; }
.hero, .page-heading { border-bottom: 1px solid var(--line); display: grid; gap: 24px; grid-template-columns: minmax(0, 1fr) 400px; padding: 24px 0 32px; }
.page-heading { grid-template-columns: 1fr; }
.event-hero { align-items: stretch; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: clamp(34px, 5vw, 56px); letter-spacing: 0; line-height: 1.05; margin-top: 14px; }
h2 { font-size: 22px; }
h3 { font-size: 16px; }
.lead { color: var(--muted); font-size: 18px; line-height: 1.7; margin: 16px 0 0; max-width: 760px; }
.panel, .report-card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 20px; }
.grid { display: grid; gap: 20px; }
.grid.two { grid-template-columns: minmax(0, 1fr) 390px; }
.radar-layout { align-items: start; grid-template-columns: minmax(0, 1fr) 330px; }
.sticky { position: sticky; top: 12px; }
.tabbar { border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px; margin: -4px 0 16px; padding-bottom: 12px; }
.tab-button { background: #fff; border: 1px solid var(--line); border-radius: 6px; color: var(--ink); cursor: pointer; font-weight: 700; padding: 9px 12px; }
.tab-button.active { background: var(--ink); border-color: var(--ink); color: #fff; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.metric-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 16px 0; }
.metric-grid div { background: var(--soft); border: 1px solid var(--line); border-radius: 6px; padding: 12px; }
dt { color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
dd { margin: 0; overflow-wrap: anywhere; }
.metric-grid dd { font-size: 26px; font-weight: 700; }
.rail { display: grid; gap: 6px; grid-template-columns: 150px minmax(0, 1fr); }
.pill { border: 1px solid var(--line); border-radius: 999px; display: inline-flex; font-size: 12px; font-weight: 700; padding: 4px 8px; }
.pill.evidence { background: #e7f6f4; border-color: #99d6cf; color: var(--evidence); }
.pill.success { background: #e9f7ee; border-color: #a9dbb9; color: var(--success); }
.pill.caution { background: #fff5e6; border-color: #f0c37b; color: var(--caution); }
.pill.neutral { background: var(--soft); color: var(--muted); }
.section-heading { align-items: start; display: flex; gap: 16px; justify-content: space-between; }
.row-list { display: grid; gap: 12px; margin-top: 14px; }
.compact-row, .radar-row { border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) 240px; padding: 16px; }
.radar-row { background: #fff; }
.radar-row[hidden] { display: none; }
.event-grid { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; }
.event-card { background: #fff; border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 12px; padding: 18px; }
.event-card[hidden] { display: none; }
.event-card h2 { font-size: 20px; line-height: 1.35; }
.event-card p { color: var(--muted); }
.event-meta { display: grid; gap: 6px; grid-template-columns: 120px minmax(0, 1fr); }
.event-card details { border-top: 1px solid var(--line); padding-top: 10px; }
.event-card summary { cursor: pointer; font-weight: 700; }
.event-caveats .note-list { margin-bottom: 0; }
.event-mini-list { display: grid; gap: 8px; margin-top: 10px; }
.event-mini { align-items: center; border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 8px; grid-template-columns: auto minmax(0, 1fr) auto; padding: 10px; }
.timeline-list { display: grid; gap: 10px; }
.timeline-list.compact { margin-top: 10px; }
.timeline-row { border: 1px solid var(--line); border-radius: 8px; color: var(--ink); display: grid; gap: 6px; grid-template-columns: 170px minmax(0, 1fr) 160px; padding: 12px; }
.timeline-row time, .timeline-row span { color: var(--muted); font-size: 13px; }
.callout { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }
.callout.warning { background: #fff5e6; border-color: #f0c37b; color: var(--caution); }
.compact-row p, .radar-row p, .note, .note-list, .site-footer { color: var(--muted); }
.tag-block, .distribution { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.distribution section { border: 1px solid var(--line); border-radius: 8px; flex: 1 1 220px; padding: 12px; }
.controls { display: grid; gap: 12px; grid-template-columns: 2fr repeat(5, minmax(130px, 1fr)); }
input, select { border: 1px solid var(--line); border-radius: 6px; color: var(--ink); display: block; margin-top: 6px; padding: 9px 10px; width: 100%; }
.source-link { border-top: 1px solid var(--line); display: block; font-weight: 700; margin-top: 12px; padding-top: 12px; }
.citation-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; }
.citation { border: 1px solid var(--line); border-radius: 8px; color: var(--ink); display: grid; gap: 4px; padding: 12px; }
.citation span, .citation small { color: var(--muted); }
.report-list { display: grid; gap: 18px; }
.report-card { display: grid; gap: 16px; }
.report-summary { font-size: 18px; }
.report-section { border-top: 1px solid var(--line); padding-top: 14px; }
.inline-defs { display: grid; gap: 6px; grid-template-columns: 130px minmax(0, 1fr); }
.markdown pre { background: #0f1715; border-radius: 8px; color: #effaf7; overflow: auto; padding: 14px; white-space: pre-wrap; }
.empty { border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); padding: 16px; }
.site-footer { align-items: center; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; padding-bottom: 26px; padding-top: 20px; }
@media (max-width: 880px) {
  .status-strip, .hero, .grid.two, .radar-layout, .compact-row, .radar-row, .event-grid, .event-mini, .timeline-row { grid-template-columns: 1fr; }
  .controls { grid-template-columns: 1fr; }
  .citation-grid { grid-template-columns: 1fr; }
  .site-header { align-items: flex-start; flex-direction: column; }
}
`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
