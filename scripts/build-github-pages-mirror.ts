import fs from "node:fs/promises";
import path from "node:path";

type UnderstandingStatus = "included" | "needs_review" | "excluded" | "failed";

type SnapshotItem = {
  id: string;
  title: string;
  url: string;
  source_name: string;
  status: UnderstandingStatus;
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
  mode: "saved_candidate" | "saved_report" | "local_fallback";
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
    status?: UnderstandingStatus;
    confidence?: number;
  }>;
  caveats: string[];
  missing_evidence: string[];
};

type Snapshot = {
  schema_version: 1;
  generated_at: string;
  production_url: string;
  mirror: {
    purpose: string;
    pages_url: string;
    dynamic_app_url: string;
    read_only: true;
  };
  source: {
    kind: string;
    data_source: string;
    fallback_used: boolean;
    warnings: string[];
  };
  freshness: {
    latest_timestamp: string | null;
    latest_timestamp_source: string | null;
    note: string;
  };
  counts: {
    visible_radar_items: number;
    snapshot_radar_items: number;
    included: number;
    needs_review: number;
    excluded: number;
    failed: number;
    report_snapshots: number;
    saved_report_candidates: number;
    citations: number;
  };
  top_categories: Array<{ label: string; count: number }>;
  top_sources: Array<{ label: string; count: number }>;
  top_source_tiers: Array<{ label: string; count: number }>;
  radar_items: SnapshotItem[];
  reports: SnapshotReport[];
  caveats: string[];
};

const outputDir = path.join(process.cwd(), "dist", "github-pages");
const snapshotPath = path.join(outputDir, "data", "radar-snapshot.json");

async function main() {
  const snapshot = await readSnapshot();
  await writeStaticAssets(snapshot);

  console.log(
    [
      "GitHub Pages mirror built:",
      path.relative(process.cwd(), outputDir),
      `radarRows=${snapshot.counts.snapshot_radar_items}`,
      `visibleRows=${snapshot.counts.visible_radar_items}`,
      `reports=${snapshot.counts.report_snapshots}`
    ].join(" ")
  );
}

async function readSnapshot(): Promise<Snapshot> {
  const raw = await fs.readFile(snapshotPath, "utf8");
  return JSON.parse(raw) as Snapshot;
}

async function writeStaticAssets(snapshot: Snapshot) {
  await fs.mkdir(path.join(outputDir, "assets"), { recursive: true });
  await fs.mkdir(path.join(outputDir, "radar"), { recursive: true });
  await fs.mkdir(path.join(outputDir, "reports"), { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(outputDir, "assets", "styles.css"), stylesheet(), "utf8"),
    fs.writeFile(path.join(outputDir, "index.html"), renderHomePage(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "radar", "index.html"), renderRadarPage(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "reports", "index.html"), renderReportsPage(snapshot), "utf8")
  ]);
}

function renderHomePage(snapshot: Snapshot) {
  const body = `
    <section class="hero">
      <div>
        <div class="eyebrow-row">
          ${pill("Read-only mirror", "success")}
          ${pill(snapshot.source.data_source, "neutral")}
          ${snapshot.source.fallback_used ? pill("Fallback source", "caution") : pill("Supabase public views", "evidence")}
        </div>
        <h1>AI Industry Radar public mirror</h1>
        <p class="lead">Static access fallback for public radar and report data. The full dynamic app remains on Vercel for Ask, Write, Auth, Admin, APIs, and server actions.</p>
        <div class="actions">
          <a class="button primary" href="radar/">Open radar snapshot</a>
          <a class="button" href="reports/">Open reports snapshot</a>
          <a class="button" href="${escapeAttr(snapshot.production_url)}">Open full Vercel app</a>
        </div>
      </div>
      <aside class="status-panel">
        <h2>Data status</h2>
        <dl class="metric-grid">
          ${metric("Visible rows", snapshot.counts.visible_radar_items)}
          ${metric("Snapshot rows", snapshot.counts.snapshot_radar_items)}
          ${metric("Included", snapshot.counts.included)}
          ${metric("Needs review", snapshot.counts.needs_review)}
          ${metric("Report snapshots", snapshot.counts.report_snapshots)}
          ${metric("Citations", snapshot.counts.citations)}
        </dl>
        <p class="note">${escapeHtml(snapshot.freshness.note)}</p>
      </aside>
    </section>

    <section class="grid two">
      <div class="panel">
        <div class="section-heading">
          <h2>Latest radar signals</h2>
          <a href="radar/">View all</a>
        </div>
        <div class="row-list">
          ${snapshot.radar_items.slice(0, 8).map(renderCompactItem).join("") || empty("No public radar rows are available in this snapshot.")}
        </div>
      </div>
      <div class="panel">
        <div class="section-heading">
          <h2>Saved reports</h2>
          <a href="reports/">View all</a>
        </div>
        <div class="row-list">
          ${snapshot.reports.slice(0, 4).map(renderCompactReport).join("") || empty("No saved public report candidates are available in this snapshot.")}
        </div>
      </div>
    </section>

    <section class="grid three">
      ${countPanel("Top categories", snapshot.top_categories)}
      ${countPanel("Top sources", snapshot.top_sources)}
      ${countPanel("Source tiers", snapshot.top_source_tiers)}
    </section>

    <section class="panel">
      <div class="section-heading">
        <h2>Mirror caveats</h2>
        <a href="data/radar-snapshot.json">Download JSON snapshot</a>
      </div>
      ${noteList(snapshot.caveats)}
    </section>
  `;

  return pageShell(snapshot, {
    body,
    current: "home",
    depth: 0,
    description: "Static public read-only mirror for AI Industry Radar public data.",
    title: "AI Industry Radar Public Mirror"
  });
}

function renderRadarPage(snapshot: Snapshot) {
  const body = `
    <section class="page-heading">
      <div>
        <div class="eyebrow-row">
          ${pill(snapshot.source.data_source, "neutral")}
          ${pill(`${snapshot.counts.snapshot_radar_items} rows in snapshot`, "evidence")}
          ${pill(`${snapshot.counts.visible_radar_items} visible rows`, "success")}
        </div>
        <h1>Radar snapshot</h1>
        <p class="lead">Public-safe radar rows with source links, evidence timing, status, confidence, categories, and caveats.</p>
      </div>
      <a class="button" href="${escapeAttr(snapshot.production_url)}/radar">Open live radar on Vercel</a>
    </section>

    <section class="panel">
      <div class="section-heading">
        <h2>Freshness</h2>
        <span>${escapeHtml(formatDate(snapshot.generated_at))}</span>
      </div>
      <p class="note">${escapeHtml(snapshot.freshness.note)}</p>
    </section>

    <section class="row-list radar-list">
      ${snapshot.radar_items.map(renderRadarItem).join("") || empty("No public radar rows are available in this snapshot.")}
    </section>
  `;

  return pageShell(snapshot, {
    body,
    current: "radar",
    depth: 1,
    description: "Public-safe AI Radar rows for GitHub Pages fallback access.",
    title: "Radar Snapshot"
  });
}

function renderReportsPage(snapshot: Snapshot) {
  const body = `
    <section class="page-heading">
      <div>
        <div class="eyebrow-row">
          ${pill(`${snapshot.counts.report_snapshots} report snapshots`, "evidence")}
          ${pill(`${snapshot.counts.saved_report_candidates} saved candidates`, "success")}
          ${pill("Read-only", "neutral")}
        </div>
        <h1>Reports snapshot</h1>
        <p class="lead">Public saved report candidates and published report summaries. Review actions and publishing stay on Vercel Admin.</p>
      </div>
      <a class="button" href="${escapeAttr(snapshot.production_url)}/reports">Open live reports on Vercel</a>
    </section>

    <section class="report-list">
      ${snapshot.reports.map(renderReport).join("") || empty("No public saved report candidates are available in this snapshot.")}
    </section>
  `;

  return pageShell(snapshot, {
    body,
    current: "reports",
    depth: 1,
    description: "Public-safe report candidate and report mirror for AI Industry Radar.",
    title: "Reports Snapshot"
  });
}

function pageShell(
  snapshot: Snapshot,
  options: {
    body: string;
    current: "home" | "radar" | "reports";
    depth: 0 | 1;
    description: string;
    title: string;
  }
) {
  const prefix = options.depth === 0 ? "" : "../";
  const nav = [
    { href: `${prefix}index.html`, id: "home", label: "Home" },
    { href: `${prefix}radar/`, id: "radar", label: "Radar" },
    { href: `${prefix}reports/`, id: "reports", label: "Reports" },
    { href: `${prefix}data/radar-snapshot.json`, id: "data", label: "Data JSON" }
  ];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeAttr(options.description)}">
    <title>${escapeHtml(options.title)}</title>
    <link rel="stylesheet" href="${prefix}assets/styles.css">
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="${prefix}index.html">
        <span class="brand-mark"></span>
        <span>AI Industry Radar</span>
      </a>
      <nav aria-label="Mirror navigation">
        ${nav
          .map((item) => {
            const active = item.id === options.current ? ' aria-current="page"' : "";
            return `<a${active} href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a>`;
          })
          .join("")}
      </nav>
    </header>
    <main>
      ${options.body}
    </main>
    <footer class="site-footer">
      <span>Generated ${escapeHtml(formatDate(snapshot.generated_at))}</span>
      <span>Static mirror only. Full app: <a href="${escapeAttr(snapshot.production_url)}">${escapeHtml(snapshot.production_url)}</a></span>
    </footer>
  </body>
</html>
`;
}

function renderCompactItem(item: SnapshotItem) {
  return `
    <article class="compact-row">
      <div>
        <div class="eyebrow-row">
          ${pill(item.status, statusTone(item.status))}
          ${pill(item.source_tier, "neutral")}
        </div>
        <h3><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(summaryForItem(item))}</p>
      </div>
      <dl>
        <dt>Source</dt><dd>${escapeHtml(item.source_name)}</dd>
        <dt>Processed</dt><dd>${escapeHtml(formatDate(item.processed_at))}</dd>
      </dl>
    </article>
  `;
}

function renderCompactReport(report: SnapshotReport) {
  return `
    <article class="compact-row">
      <div>
        <div class="eyebrow-row">
          ${pill(report.report_type, "evidence")}
          ${pill(report.mode, "success")}
          ${pill(report.status, "neutral")}
        </div>
        <h3>${escapeHtml(report.title)}</h3>
        <p>${escapeHtml(report.summary)}</p>
      </div>
      <dl>
        <dt>Items</dt><dd>${report.source_item_count}</dd>
        <dt>Saved</dt><dd>${escapeHtml(formatDate(report.saved_at ?? report.generated_at))}</dd>
      </dl>
    </article>
  `;
}

function renderRadarItem(item: SnapshotItem) {
  const timestamp = item.published_at ?? item.collected_at ?? item.processed_at;

  return `
    <article class="radar-row">
      <div class="radar-main">
        <div class="eyebrow-row">
          ${pill(item.status, statusTone(item.status))}
          ${pill(item.language, "neutral")}
          ${pill(`confidence ${formatPercent(item.confidence)}`, "evidence")}
          ${pill(`overall ${formatScore(item.scores.overall)}`, "success")}
        </div>
        <h2><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></h2>
        <p>${escapeHtml(summaryForItem(item))}</p>
        ${item.why_it_matters ? `<p class="why"><strong>Why it matters:</strong> ${escapeHtml(item.why_it_matters)}</p>` : ""}
        <div class="tag-row">
          ${item.categories.map((category) => pill(labelize(category), "evidence")).join("")}
          ${item.tags.slice(0, 5).map((tag) => pill(tag, "neutral")).join("")}
        </div>
      </div>
      <aside class="radar-meta">
        <dl>
          <dt>Source</dt><dd>${escapeHtml(item.source_name)}</dd>
          <dt>Tier</dt><dd>${escapeHtml(item.source_tier)}</dd>
          <dt>Evidence time</dt><dd>${escapeHtml(formatDate(timestamp))}</dd>
          <dt>Processed</dt><dd>${escapeHtml(formatDate(item.processed_at))}</dd>
        </dl>
        <a class="source-link" href="${escapeAttr(item.url)}">Open citation</a>
      </aside>
    </article>
  `;
}

function renderReport(report: SnapshotReport) {
  return `
    <article class="report-card">
      <div class="section-heading">
        <div>
          <div class="eyebrow-row">
            ${pill(report.report_type, "evidence")}
            ${pill(report.mode, "success")}
            ${pill(report.status, "neutral")}
            ${pill(`${report.source_item_count} source items`, "caution")}
          </div>
          <h2>${escapeHtml(report.title)}</h2>
        </div>
        <span>${escapeHtml(formatDate(report.saved_at ?? report.generated_at))}</span>
      </div>
      <p class="report-summary">${escapeHtml(report.summary)}</p>
      ${report.executive_summary ? `<p>${escapeHtml(report.executive_summary)}</p>` : ""}
      <dl class="inline-defs">
        <dt>Window</dt><dd>${escapeHtml(formatDate(report.time_window.start))} to ${escapeHtml(formatDate(report.time_window.end))}</dd>
        <dt>Data source</dt><dd>${escapeHtml(report.data_source)}</dd>
        ${typeof report.confidence === "number" ? `<dt>Confidence</dt><dd>${formatPercent(report.confidence)}</dd>` : ""}
      </dl>
      ${report.sections.length > 0 ? `<div class="section-stack">${report.sections.map(renderReportSection).join("")}</div>` : ""}
      ${report.citations.length > 0 ? `<div class="citation-grid">${report.citations.map(renderReportCitation).join("")}</div>` : ""}
      ${report.caveats.length > 0 ? noteList(report.caveats) : ""}
      ${report.missing_evidence.length > 0 ? `<h3>Missing evidence</h3>${noteList(report.missing_evidence)}` : ""}
    </article>
  `;
}

function renderReportSection(section: SnapshotReport["sections"][number]) {
  return `
    <section class="report-section">
      <h3>${escapeHtml(section.title)}</h3>
      <p>${escapeHtml(section.summary)}</p>
      ${section.bullets.length > 0 ? noteList(section.bullets) : ""}
      ${section.caveats.length > 0 ? `<p class="note">${escapeHtml(section.caveats.join(" "))}</p>` : ""}
    </section>
  `;
}

function renderReportCitation(citation: SnapshotReport["citations"][number]) {
  return `
    <a class="citation-card" href="${escapeAttr(citation.url)}">
      <span>${escapeHtml(citation.source_name)}</span>
      <strong>${escapeHtml(citation.title)}</strong>
      <small>${escapeHtml(formatDate(citation.published_at ?? citation.collected_at))}</small>
    </a>
  `;
}

function countPanel(title: string, entries: Array<{ label: string; count: number }>) {
  return `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      <div class="tag-row">
        ${entries.map((entry) => pill(`${entry.label} ${entry.count}`, "neutral")).join("") || pill("none", "neutral")}
      </div>
    </section>
  `;
}

function metric(label: string, value: number) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${value.toLocaleString("en-US")}</dd>
    </div>
  `;
}

function noteList(items: string[]) {
  return `<ul class="note-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function empty(message: string) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function pill(label: string, tone: "caution" | "evidence" | "neutral" | "success") {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

function statusTone(status: UnderstandingStatus) {
  if (status === "included") {
    return "success";
  }

  if (status === "needs_review") {
    return "caution";
  }

  return "neutral";
}

function summaryForItem(item: SnapshotItem) {
  return item.summary_en || item.summary_zh || "No public summary is available for this row.";
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function formatScore(value: number) {
  return value.toFixed(2);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(date)} UTC`;
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

function stylesheet() {
  return `:root {
  color-scheme: light;
  --bg: #f7f8f5;
  --ink: #10201c;
  --muted: #5d6b66;
  --line: #d9dfda;
  --panel: #ffffff;
  --soft: #eef4f1;
  --evidence: #0f766e;
  --success: #166534;
  --caution: #b45309;
  --admin: #6d28d9;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
  line-height: 1.5;
}

a {
  color: var(--evidence);
  text-decoration: none;
}

a:hover { text-decoration: underline; }

.site-header,
.site-footer,
main {
  margin: 0 auto;
  max-width: 1180px;
  padding: 0 20px;
}

.site-header {
  align-items: center;
  display: flex;
  gap: 20px;
  justify-content: space-between;
  padding-bottom: 20px;
  padding-top: 20px;
}

.brand {
  align-items: center;
  color: var(--ink);
  display: inline-flex;
  font-weight: 700;
  gap: 10px;
}

.brand-mark {
  background: linear-gradient(135deg, var(--evidence), var(--admin));
  border-radius: 8px;
  display: inline-block;
  height: 28px;
  width: 28px;
}

nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

nav a,
.button {
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink);
  display: inline-flex;
  font-size: 14px;
  font-weight: 700;
  padding: 9px 12px;
}

nav a[aria-current="page"],
.button.primary {
  background: var(--ink);
  border-color: var(--ink);
  color: #ffffff;
}

main {
  display: grid;
  gap: 24px;
  padding-bottom: 40px;
}

.hero,
.page-heading {
  border-bottom: 1px solid var(--line);
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1fr) 360px;
  padding: 24px 0 32px;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  font-size: clamp(34px, 5vw, 56px);
  letter-spacing: 0;
  line-height: 1.05;
  margin-top: 14px;
}

h2 { font-size: 22px; }

h3 { font-size: 16px; }

.lead {
  color: var(--muted);
  font-size: 18px;
  margin-top: 16px;
  max-width: 760px;
}

.actions,
.eyebrow-row,
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.actions { margin-top: 24px; }

.panel,
.status-panel,
.report-card,
.radar-row {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.panel,
.status-panel,
.report-card {
  padding: 18px;
}

.status-panel h2,
.panel h2 {
  margin-bottom: 14px;
}

.grid {
  display: grid;
  gap: 18px;
}

.grid.two { grid-template-columns: minmax(0, 1fr) 380px; }
.grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }

.metric-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}

.metric-grid div {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 12px;
}

dt {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}

.metric-grid dd {
  color: var(--evidence);
  font-size: 28px;
  font-weight: 800;
}

.note {
  color: var(--muted);
  margin-top: 14px;
}

.pill {
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: 4px 8px;
}

.pill.evidence { background: #e6f4f1; border-color: #b7ddd6; color: var(--evidence); }
.pill.success { background: #e8f5e9; border-color: #bfe5c5; color: var(--success); }
.pill.caution { background: #fff7ed; border-color: #fed7aa; color: var(--caution); }
.pill.neutral { background: #f4f5f3; color: var(--muted); }

.section-heading {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 14px;
}

.row-list,
.report-list,
.section-stack {
  display: grid;
  gap: 12px;
}

.compact-row,
.radar-row {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) 240px;
  padding: 16px;
}

.compact-row {
  border: 1px solid var(--line);
  border-radius: 6px;
}

.compact-row h3,
.radar-row h2 {
  margin-top: 10px;
}

.compact-row p,
.radar-row p,
.report-card p {
  color: var(--muted);
  margin-top: 8px;
}

.radar-meta {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 12px;
}

.source-link {
  display: inline-block;
  font-weight: 700;
  margin-top: 12px;
  overflow-wrap: anywhere;
}

.why {
  background: #eef7f5;
  border-left: 3px solid var(--evidence);
  padding: 10px;
}

.report-card {
  display: grid;
  gap: 14px;
}

.report-summary {
  color: var(--ink) !important;
  font-weight: 700;
}

.inline-defs {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  display: grid;
  gap: 8px;
  grid-template-columns: max-content minmax(0, 1fr);
  margin: 0;
  padding: 12px;
}

.report-section {
  border-top: 1px solid var(--line);
  padding-top: 14px;
}

.citation-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.citation-card {
  border: 1px solid var(--line);
  border-radius: 6px;
  display: grid;
  gap: 4px;
  padding: 12px;
}

.citation-card span,
.citation-card small {
  color: var(--muted);
}

.note-list {
  color: var(--muted);
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
}

.empty {
  border: 1px dashed var(--line);
  border-radius: 8px;
  color: var(--muted);
  padding: 24px;
}

.site-footer {
  border-top: 1px solid var(--line);
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  padding-bottom: 28px;
  padding-top: 18px;
}

@media (max-width: 860px) {
  .site-header,
  .hero,
  .page-heading,
  .grid.two,
  .grid.three,
  .compact-row,
  .radar-row,
  .citation-grid {
    grid-template-columns: 1fr;
  }

  .site-header {
    align-items: flex-start;
    display: grid;
  }

  h1 {
    font-size: 38px;
  }
}
`;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`GitHub Pages mirror build failed: ${message}`);
  process.exitCode = 1;
});
