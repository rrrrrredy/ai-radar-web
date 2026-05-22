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
  };
  top_categories: Array<{ label: string; count: number }>;
  top_sources: Array<{ label: string; count: number }>;
  top_source_tiers: Array<{ label: string; count: number }>;
  radar_items: SnapshotItem[];
  reports: SnapshotReport[];
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
  const latestItems = snapshot.radar_items.slice(0, 8);
  const latestReports = latestReportsByType(snapshot);

  return shell(snapshot, "home", 0, "AI Industry Radar", `
    <section class="hero">
      <div>
        <div class="pill-row">
          ${pill("Cloudflare primary", "success")}
          ${pill(snapshot.source.data_source, "neutral")}
          ${pill(snapshot.source.kind, "evidence")}
        </div>
        <h1>AI Industry Radar</h1>
        <p class="lead">Public AI industry signal desk backed by Supabase public views, current report candidates, source status, and explicit caveats.</p>
        <div class="actions">
          <a class="button primary" href="radar/">Open radar</a>
          <a class="button" href="reports/">Review reports</a>
          <a class="button" href="ask/">Ask surface</a>
          <a class="button" href="write/">Write surface</a>
        </div>
      </div>
      <aside class="panel">
        <h2>Production Data Status</h2>
        <dl class="metric-grid">
          ${metric("Sources", snapshot.counts.sources)}
          ${metric("Raw items", snapshot.counts.raw_items)}
          ${metric("Radar items", snapshot.counts.radar_items)}
          ${metric("Public rows", snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items)}
          ${metric("Report candidates", snapshot.counts.report_candidates)}
          ${metric("Citations", snapshot.counts.citations)}
        </dl>
        <dl class="rail">
          ${rail("Included / needs_review / excluded", `${snapshot.counts.included} / ${snapshot.counts.needs_review} / ${snapshot.counts.excluded}`)}
          ${rail("Latest ingestion", formatDate(snapshot.freshness.latest_ingestion))}
          ${rail("Latest understanding", formatDate(snapshot.freshness.latest_understanding))}
          ${rail("Latest visible radar", formatDate(snapshot.freshness.latest_timestamp))}
        </dl>
      </aside>
    </section>

    <section class="grid two">
      <div class="panel">
        <div class="section-heading">
          <h2>Radar Pulse</h2>
          <a href="radar/">View all</a>
        </div>
        <div class="tag-block">
          ${countTags(snapshot.top_categories, "evidence")}
          ${countTags(snapshot.top_sources.slice(0, 6), "neutral")}
        </div>
        <div class="row-list">${latestItems.map(renderCompactItem).join("")}</div>
      </div>
      <div class="panel">
        <div class="section-heading">
          <h2>Fresh Reports</h2>
          <a href="reports/">Open desk</a>
        </div>
        <div class="row-list">${latestReports.map(renderCompactReport).join("") || empty("No public report candidates were found.")}</div>
      </div>
    </section>

    <section class="panel">
      <div class="section-heading">
        <h2>Caveats</h2>
        <a href="data/radar-snapshot.json">Public JSON</a>
      </div>
      ${noteList(snapshot.caveats)}
    </section>
  `);
}

function renderRadar(snapshot: Snapshot) {
  const families = countSourceFamilies(snapshot.radar_items);

  return shell(snapshot, "radar", 1, "Radar", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items} public rows`, "success")}
          ${pill(`${snapshot.counts.snapshot_radar_items} rows in snapshot`, "evidence")}
          ${pill(snapshot.source.data_source, "neutral")}
        </div>
        <h1>Radar</h1>
        <p class="lead">Public-safe rows with source, status, category, source family, freshness, confidence, and citation links.</p>
      </div>
    </section>

    <section class="panel">
      <div class="controls" role="search">
        <label>Search <input id="radar-search" type="search" placeholder="Title, source, category, tag"></label>
        <label>Status <select id="radar-status">${option("all", "All statuses")}${["included", "needs_review", "excluded", "failed"].map((status) => option(status, status)).join("")}</select></label>
        <label>Category <select id="radar-category">${option("all", "All categories")}${snapshot.top_categories.map((entry) => option(entry.label, entry.label)).join("")}</select></label>
        <label>Source family <select id="radar-family">${option("all", "All families")}${Object.keys(families).map((family) => option(family, family)).join("")}</select></label>
      </div>
      <div class="distribution">
        ${distribution("Status", [
          ["included", snapshot.counts.included],
          ["needs_review", snapshot.counts.needs_review],
          ["excluded", snapshot.counts.excluded],
          ["failed", snapshot.counts.failed]
        ])}
        ${distribution("Category", snapshot.top_categories.slice(0, 8).map((entry) => [entry.label, entry.count]))}
        ${distribution("Source family", Object.entries(families))}
        ${distribution("Freshness", freshnessBuckets(snapshot.radar_items))}
      </div>
    </section>

    <section class="grid radar-layout">
      <div class="row-list radar-list" id="radar-list">
        ${snapshot.radar_items.map(renderRadarItem).join("") || empty("No radar rows are available.")}
      </div>
      <aside class="panel sticky">
        <h2>Citation Rail</h2>
        <p class="note">Links point to public source pages. The snapshot excludes private raw content and provider metadata.</p>
        <div class="row-list">${snapshot.radar_items.slice(0, 12).map(renderCitation).join("")}</div>
      </aside>
    </section>
    <script>${filterScript()}</script>
  `);
}

function renderReports(snapshot: Snapshot) {
  const reports = latestReportsByType(snapshot);

  return shell(snapshot, "reports", 1, "Reports", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.counts.report_candidates ?? snapshot.counts.saved_report_candidates} candidates`, "success")}
          ${pill(`${snapshot.counts.report_snapshots} public snapshots`, "evidence")}
          ${pill(snapshot.source.data_source, "neutral")}
        </div>
        <h1>Reports</h1>
        <p class="lead">Latest daily and weekly candidates with status, time window, usable item counts, citations, caveats, missing evidence, and Markdown export.</p>
      </div>
    </section>
    <section class="report-list">
      ${reports.map(renderReport).join("") || empty("No public report candidates were found.")}
    </section>
  `);
}

function renderAsk(snapshot: Snapshot) {
  const examples = [
    ...snapshot.top_categories.slice(0, 3).map((entry) => `What changed in ${entry.label} signals?`),
    "Which signals are strong enough for a weekly report?",
    "Which items still need human review?"
  ];

  return shell(snapshot, "ask", 1, "Ask", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items} public rows`, "success")}
          ${pill("Public data read surface", "evidence")}
        </div>
        <h1>Ask Radar</h1>
        <p class="lead">Cloudflare shows the current evidence context and query examples. Interactive generation stays on the reference dynamic app; this public page does not expose API keys or server routes.</p>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>Evidence Context</h2>
        <dl class="rail">
          ${rail("Data source", snapshot.source.data_source)}
          ${rail("Latest radar", formatDate(snapshot.freshness.latest_timestamp))}
          ${rail("Public rows", String(snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items))}
          ${rail("Needs review", String(snapshot.counts.needs_review))}
        </dl>
      </div>
      <div class="panel">
        <h2>Query Examples</h2>
        ${noteList(examples)}
      </div>
    </section>
    <section class="panel">
      <h2>Caveats</h2>
      ${noteList(snapshot.caveats.slice(0, 6))}
    </section>
  `);
}

function renderWrite(snapshot: Snapshot) {
  const prompts = [
    ...snapshot.top_categories.slice(0, 3).map((entry) => `Turn current ${entry.label} signals into editorial topic candidates.`),
    "Build a weekly observation outline from the strongest current evidence.",
    "Find weak signals and missing evidence for a cautious industry note."
  ];

  return shell(snapshot, "write", 1, "Write", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.counts.report_candidates ?? snapshot.counts.saved_report_candidates} report candidates`, "success")}
          ${pill(`${snapshot.counts.citations} citations`, "evidence")}
        </div>
        <h1>Write</h1>
        <p class="lead">Public writing surface for current evidence, candidate angles, caveats, and report context. It is read-only on Cloudflare.</p>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>Writing Prompts</h2>
        ${noteList(prompts)}
      </div>
      <div class="panel">
        <h2>Data Context</h2>
        <dl class="rail">
          ${rail("Data source", snapshot.source.data_source)}
          ${rail("Latest radar", formatDate(snapshot.freshness.latest_timestamp))}
          ${rail("Public rows", String(snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items))}
          ${rail("Report candidates", String(snapshot.counts.report_candidates ?? snapshot.counts.saved_report_candidates))}
        </dl>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>Current Report Context</h2>
        ${latestReportsByType(snapshot).map(renderCompactReport).join("") || empty("No public report candidates were found.")}
      </div>
      <div class="panel">
        <h2>Caveats</h2>
        ${noteList(snapshot.caveats.slice(0, 6))}
      </div>
    </section>
    <section class="panel">
      <h2>Evidence Gaps</h2>
      ${noteList(uniqueStrings(snapshot.reports.flatMap((report) => report.missing_evidence)).slice(0, 8).concat(snapshot.caveats.slice(0, 3)))}
    </section>
  `);
}

function shell(snapshot: Snapshot, current: "home" | "radar" | "reports" | "ask" | "write", depth: 0 | 1, title: string, body: string) {
  const prefix = depth === 0 ? "" : "../";
  const nav = [
    ["home", "Home", `${prefix}index.html`],
    ["radar", "Radar", `${prefix}radar/`],
    ["reports", "Reports", `${prefix}reports/`],
    ["ask", "Ask", `${prefix}ask/`],
    ["write", "Write", `${prefix}write/`]
  ] as const;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="AI Industry Radar Cloudflare public site">
    <title>${escapeHtml(title)} - AI Industry Radar</title>
    <link rel="stylesheet" href="${prefix}assets/styles.css">
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="${prefix}index.html"><span class="brand-mark"></span><span>AI Industry Radar</span></a>
      <nav aria-label="Primary navigation">
        ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${escapeHtml(label)}</a>`).join("")}
      </nav>
    </header>
    <main>${body}</main>
    <footer class="site-footer">
      <span>Generated ${escapeHtml(formatDate(snapshot.generated_at))}</span>
      <span>Cloudflare public site. Reference dynamic app: <a href="${escapeAttr(snapshot.reference_app_url)}">${escapeHtml(snapshot.reference_app_url)}</a></span>
    </footer>
  </body>
</html>`;
}

function renderCompactItem(item: SnapshotItem) {
  return `<article class="compact-row">
    <div>${pill(item.status, statusTone(item.status))}${pill(item.source_tier, "neutral")}<h3><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></h3><p>${escapeHtml(item.summary_en || item.summary_zh || "No public summary available.")}</p></div>
    <dl>${rail("Source", item.source_name)}${rail("Processed", formatDate(item.processed_at))}</dl>
  </article>`;
}

function renderRadarItem(item: SnapshotItem) {
  const family = sourceFamily(item);
  const search = [item.title, item.source_name, item.status, item.categories.join(" "), item.tags.join(" "), item.summary_en, item.summary_zh].join(" ").toLowerCase();

  return `<article class="radar-row" data-category="${escapeAttr(item.categories.join(" "))}" data-family="${escapeAttr(family)}" data-search="${escapeAttr(search)}" data-status="${escapeAttr(item.status)}">
    <div>
      <div class="pill-row">${pill(item.status, statusTone(item.status))}${pill(family, "neutral")}${pill(`overall ${item.scores.overall.toFixed(2)}`, "evidence")}${pill(`confidence ${formatPercent(item.confidence)}`, "success")}</div>
      <h2><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></h2>
      <p>${escapeHtml(item.summary_en || item.summary_zh || "No public summary available.")}</p>
      ${item.why_it_matters ? `<p class="note"><strong>Why it matters:</strong> ${escapeHtml(item.why_it_matters)}</p>` : ""}
      <div class="pill-row">${item.categories.map((category) => pill(labelize(category), "evidence")).join("")}${item.tags.slice(0, 5).map((tag) => pill(tag, "neutral")).join("")}</div>
    </div>
    <aside><dl class="rail">${rail("Source", item.source_name)}${rail("Tier", item.source_tier)}${rail("Published", formatDate(item.published_at))}${rail("Processed", formatDate(item.processed_at))}</dl><a class="source-link" href="${escapeAttr(item.url)}">Open citation</a></aside>
  </article>`;
}

function renderCitation(item: SnapshotItem) {
  return `<a class="citation" href="${escapeAttr(item.url)}"><span>${escapeHtml(item.source_name)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(formatDate(item.published_at ?? item.collected_at))}</small></a>`;
}

function renderCompactReport(report: SnapshotReport) {
  return `<article class="compact-row">
    <div>${pill(report.report_type, "evidence")}${pill(report.status, statusTone(report.status))}${pill(report.mode, "neutral")}<h3>${escapeHtml(report.title)}</h3><p>${escapeHtml(report.summary)}</p></div>
    <dl>${rail("Items", String(report.source_item_count))}${rail("Citations", String(report.citations.length))}${rail("Saved", formatDate(report.saved_at ?? report.generated_at))}</dl>
  </article>`;
}

function renderReport(report: SnapshotReport) {
  return `<article class="report-card">
    <div class="section-heading"><div><div class="pill-row">${pill(report.report_type, "evidence")}${pill(report.status, statusTone(report.status))}${pill(report.mode, "success")}${pill(`${report.source_item_count} items`, "neutral")}${pill(`${report.citations.length} citations`, "neutral")}</div><h2>${escapeHtml(report.title)}</h2></div><span>${escapeHtml(formatDate(report.saved_at ?? report.generated_at))}</span></div>
    <p class="report-summary">${escapeHtml(report.summary)}</p>
    ${report.executive_summary ? `<p>${escapeHtml(report.executive_summary)}</p>` : ""}
    <dl class="inline-defs">${rail("Window", `${formatDate(report.time_window.start)} to ${formatDate(report.time_window.end)}`)}${rail("Data source", report.data_source)}${rail("Missing evidence", String(report.missing_evidence.length))}</dl>
    ${report.sections.map(renderReportSection).join("")}
    ${report.citations.length > 0 ? `<div class="citation-grid">${report.citations.map(renderReportCitation).join("")}</div>` : ""}
    ${report.caveats.length > 0 ? `<h3>Caveats</h3>${noteList(report.caveats)}` : ""}
    ${report.missing_evidence.length > 0 ? `<h3>Missing evidence</h3>${noteList(report.missing_evidence)}` : ""}
    <details class="markdown"><summary>Markdown export</summary><pre>${escapeHtml(markdownForReport(report))}</pre></details>
  </article>`;
}

function renderReportSection(section: SnapshotReport["sections"][number]) {
  return `<section class="report-section"><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.summary)}</p>${section.bullets.length > 0 ? noteList(section.bullets) : ""}</section>`;
}

function renderReportCitation(citation: SnapshotReport["citations"][number]) {
  return `<a class="citation" href="${escapeAttr(citation.url)}"><span>${escapeHtml(citation.source_name)}</span><strong>${escapeHtml(citation.title)}</strong><small>${escapeHtml(formatDate(citation.published_at ?? citation.collected_at))}</small></a>`;
}

function markdownForReport(report: SnapshotReport) {
  const lines = [
    `# ${report.title}`,
    "",
    report.summary,
    "",
    `- Type: ${report.report_type}`,
    `- Status: ${report.status}`,
    `- Window: ${report.time_window.start} to ${report.time_window.end}`,
    `- Source items: ${report.source_item_count}`,
    `- Citations: ${report.citations.length}`,
    "",
    ...report.sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      section.summary,
      "",
      ...section.bullets.map((bullet) => `- ${bullet}`),
      ""
    ]),
    "## Caveats",
    "",
    ...(report.caveats.length > 0 ? report.caveats.map((caveat) => `- ${caveat}`) : ["- No caveats recorded."]),
    "",
    "## Citations",
    "",
    ...(report.citations.length > 0 ? report.citations.map((citation) => `- ${citation.title} (${citation.source_name}) ${citation.url}`) : ["- No citations recorded."])
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
  if (text.includes("arxiv")) return "Research feeds";
  if (text.includes("github") || text.includes("release") || text.includes("hugging face")) return "Open source";
  if (["openai", "anthropic", "google", "deepmind", "meta", "llama", "deepseek", "qwen"].some((term) => text.includes(term))) return "Company/lab";
  if (["lex", "every", "latent", "lenny", "benedict", "karpathy"].some((term) => text.includes(term))) return "Analysis/media";
  return "Other public sources";
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

function countTags(entries: Array<{ label: string; count: number }>, tone: "evidence" | "neutral") {
  return entries.map((entry) => pill(`${labelize(entry.label)} ${entry.count}`, tone)).join("");
}

function metric(label: string, value: number | null) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${value === null ? "n/a" : value.toLocaleString("en-US")}</dd></div>`;
}

function rail(label: string, value: string | number | null) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value ?? "not available"))}</dd>`;
}

function option(value: string, label: string) {
  return `<option value="${escapeAttr(value)}">${escapeHtml(labelize(label))}</option>`;
}

function pill(label: string, tone: "caution" | "evidence" | "neutral" | "success") {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

function statusTone(status: string): "caution" | "evidence" | "neutral" | "success" {
  if (status === "included" || status === "needs_review") return status === "included" ? "success" : "caution";
  if (status === "needs_review" || status === "draft") return "caution";
  return "neutral";
}

function noteList(items: string[]) {
  return `<ul class="note-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function empty(message: string) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("en", {
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
const rows = Array.from(document.querySelectorAll(".radar-row"));
function applyFilters() {
  const query = (search.value || "").toLowerCase();
  const selectedStatus = status.value;
  const selectedCategory = category.value.toLowerCase();
  const selectedFamily = family.value;
  for (const row of rows) {
    const matchesQuery = !query || row.dataset.search.includes(query);
    const matchesStatus = selectedStatus === "all" || row.dataset.status === selectedStatus;
    const matchesCategory = selectedCategory === "all" || row.dataset.category.toLowerCase().includes(selectedCategory);
    const matchesFamily = selectedFamily === "all" || row.dataset.family === selectedFamily;
    row.hidden = !(matchesQuery && matchesStatus && matchesCategory && matchesFamily);
  }
}
[search, status, category, family].forEach((control) => control.addEventListener("input", applyFilters));
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
.hero, .page-heading { border-bottom: 1px solid var(--line); display: grid; gap: 24px; grid-template-columns: minmax(0, 1fr) 400px; padding: 24px 0 32px; }
.page-heading { grid-template-columns: 1fr; }
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
.compact-row p, .radar-row p, .note, .note-list, .site-footer { color: var(--muted); }
.tag-block, .distribution { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.distribution section { border: 1px solid var(--line); border-radius: 8px; flex: 1 1 220px; padding: 12px; }
.controls { display: grid; gap: 12px; grid-template-columns: 2fr repeat(3, minmax(150px, 1fr)); }
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
  .hero, .grid.two, .radar-layout, .compact-row, .radar-row { grid-template-columns: 1fr; }
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
