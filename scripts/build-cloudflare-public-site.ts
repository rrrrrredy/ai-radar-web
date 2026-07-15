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
import {
  reportEntityTraceability,
  reportSectionTraceability,
  type ReportSectionTraceability,
  type ReportTraceDocument
} from "@/lib/reports/entity-traceability";
import type { RetrievalRadarItem } from "@/lib/retrieval/types";
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
  const traceItems = snapshotItemsForTraceability(snapshot.radar_items);
  const entitySummaries = staticEntityDetailSummaries(snapshot, traceItems);
  await Promise.all([
    fs.mkdir(path.join(outputDir, "ask"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "assets"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "ask"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "entities"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "radar"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "reports"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "en", "write"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "entities"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "radar"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "reports"), { recursive: true }),
    fs.mkdir(path.join(outputDir, "write"), { recursive: true })
  ]);

  await Promise.all([
    fs.copyFile(path.join(process.cwd(), "app", "icon.svg"), path.join(outputDir, "favicon.svg")),
    fs.writeFile(path.join(outputDir, "ask", "index.html"), renderAsk(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "assets", "styles.css"), stylesheet(), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "ask", "index.html"), renderEnglishAsk(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "entities", "index.html"), renderEnglishEntities(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "index.html"), renderEnglishHome(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "radar", "index.html"), renderEnglishRadar(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "reports", "index.html"), renderEnglishReports(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "en", "write", "index.html"), renderEnglishWrite(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "entities", "index.html"), renderEntities(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "index.html"), renderHome(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "radar", "index.html"), renderRadar(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "reports", "index.html"), renderReports(snapshot), "utf8"),
    fs.writeFile(path.join(outputDir, "version.json"), `${JSON.stringify(publicVersion(snapshot), null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(outputDir, "write", "index.html"), renderWrite(snapshot), "utf8"),
    ...entitySummaries.map(async (entity) => {
      const entityDir = path.join(outputDir, "entities", entityStaticSlug(entity));
      await fs.mkdir(entityDir, { recursive: true });
      await fs.writeFile(path.join(entityDir, "index.html"), renderEntityDetail(snapshot, entity), "utf8");
    })
  ]);
}

function renderEnglishHome(snapshot: Snapshot) {
  const curated = snapshot.curated_events.toSorted(compareHomepageEvents).slice(0, 8);
  const topEvents = curated.slice(0, 3);
  const latestReportCandidates = latestReportsByType(snapshot);
  const sameFamilyEvents = snapshot.event_clusters.filter((event) => event.source_count > 1 && event.source_families.length === 1).length;
  const crossFamilyEvents = snapshot.event_clusters.filter((event) => event.source_count > 1 && event.source_families.length > 1).length;
  const currentSelection = curatedWindowIsCurrent(snapshot);
  const title = currentSelection ? "Today's AI Industry Selection" : "Today's Selection: Prior-Day Evidence Review";
  const description = currentSelection
    ? "Related signals are merged into events so you can inspect coverage, source health, timelines and citations without reading the same story repeatedly."
    : "The selected set includes prior-day evidence. Every card shows its evidence date so older items are not presented as current-day news.";

  return englishShell(snapshot, "home", 0, title, `
    <section class="status-strip home-status-strip">
      ${metricMini("Public store / displayed", `${snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items} / ${snapshot.radar_items.length}`)}
      ${metricMini("Events", snapshot.event_count)}
      ${metricMini("Latest repair (1 source) A/F/failed", `${snapshot.coverage.attempted_sources}/${snapshot.coverage.fetched_sources}/${snapshot.coverage.failed_sources}`)}
      ${metricMini("Broad refresh succeeded/failed/manual", `${snapshot.source_health_summary.succeeded}/${snapshot.source_health_summary.failed}/${snapshot.source_health_summary.manual_blocked}`)}
      ${metricMini("Current report candidates", latestReportCandidates.length)}
      ${metricMini("Evidence through", formatDateEn(snapshot.coverage.latest_refresh))}
    </section>
    ${freshnessAlertEn(snapshot).replace('class="freshness-alert"', 'class="freshness-alert home-freshness-alert"')}

    <section class="home-desk">
      <div class="headline-panel">
        <div class="pill-row">
          ${pill(currentSelection ? "Current-day window" : "Includes prior days", currentSelection ? "success" : "caution")}
          ${pill("Event first", "evidence")}
          ${pill(sourceLabelEn(snapshot.source.data_source), "neutral")}
        </div>
        <h1>${escapeHtml(title)}</h1>
        <div class="section-heading"><h2>${currentSelection ? "Today's top events" : "Top selected events"}</h2><a href="radar/">All events</a></div>
        <div class="featured-list">${topEvents.map((event) => renderFeaturedEventCardEn(event, snapshot)).join("") || empty("No selected events are available.")}</div>
        <p class="lead">${escapeHtml(description)} The query and writing tools run locally against this public snapshot.</p>
        <div class="actions">
          <a class="button primary" href="radar/">Open event radar</a>
          <a class="button" href="reports/">Review report quality</a>
          <a class="button" href="ask/">Ask about events</a>
          <a class="button" href="write/">Draft an industry brief</a>
        </div>
      </div>
      <aside class="ops-console">
        <h2>Source health</h2>
        <dl class="rail">
          ${rail("Events / displayed signals", `${snapshot.event_count} / ${snapshot.radar_items.length}`)}
          ${rail("Cross-family coverage", String(crossFamilyEvents))}
          ${rail("Multi-source, one family", String(sameFamilyEvents))}
          ${rail("Automated eligible", String(snapshot.coverage.automated_eligible_sources))}
          ${rail("Broad refresh succeeded / failed", `${snapshot.source_health_summary.succeeded} / ${snapshot.source_health_summary.failed} of ${snapshot.source_health_scope.attempted_sources} attempted`)}
          ${rail("Manual / blocked", `${snapshot.source_health_summary.manual_blocked} of ${snapshot.coverage.sources_total} total`)}
          ${rail("Visible sources", `${snapshot.coverage.sources_with_public_items ?? 0} / ${snapshot.coverage.sources_total}`)}
        </dl>
        <div class="quality-note">
          <strong>Public evidence boundary</strong>
          <p>Only public-safe event, signal, report and aggregate source-health fields are included. Single-source events remain provisional.</p>
        </div>
      </aside>
    </section>

    <section class="panel">
      <div class="section-heading"><h2>Industry selection</h2><a href="radar/">Explore all views</a></div>
      <div class="event-grid">${curated.map((event) => renderEventCardEn(event, snapshot)).join("") || empty("No selected events are available.")}</div>
    </section>

    <section class="grid two">
      <div class="panel">
        <div class="section-heading"><h2>Industry pulse</h2><a href="../data/radar-snapshot.json">Public JSON</a></div>
        <div class="distribution">
          ${distributionEn("Categories", snapshot.top_categories.slice(0, 8).map((entry) => [entry.label, entry.count]))}
          ${distributionEn("Top sources", snapshot.top_sources.slice(0, 8).map((entry) => [entry.label, entry.count]))}
          ${distributionEn("Signal status", [["Included", snapshot.counts.included], ["Needs review", snapshot.counts.needs_review], ["Excluded", snapshot.counts.excluded]])}
          ${distributionEn("Failure families", Object.entries(snapshot.failure_family_summary).slice(0, 8))}
        </div>
      </div>
      <div class="panel">
        <div class="section-heading"><h2>Evidence and limits</h2><a href="reports/">Report desk</a></div>
        ${noteListEn(englishEvidenceLimits(snapshot))}
        <div class="actions">
          <a class="button primary" href="ask/">Query selected events</a>
          <a class="button" href="write/">Build an evidence-led outline</a>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="section-heading"><h2>Latest report candidates</h2><a href="reports/">Open report desk</a></div>
      <div class="row-list">${latestReportCandidates.map((report) => renderCompactReportEn(report)).join("") || empty("No public report candidates are available.")}</div>
    </section>
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
  const eventItemIds = new Set(snapshot.event_cluster_items.map((item) => item.radar_item_id));
  const displaySignalItems = snapshot.radar_items.filter((item) => eventItemIds.has(item.id));
  const downgradedSignalCount = snapshot.radar_items.length - displaySignalItems.length;
  const reviewEvents = snapshot.event_clusters.filter(
    (event) =>
      event.caveats.length > 0 ||
      event.related_item_ids.some((id) => snapshot.radar_items.find((item) => item.id === id)?.status === "needs_review")
  );

  return englishShell(snapshot, "radar", 1, "Event Radar", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items} public store / ${snapshot.radar_items.length} displayed`, "success")}
          ${pill(`${snapshot.event_count} events`, "evidence")}
          ${pill(`${snapshot.coverage.attempted_sources} sources attempted`, "neutral")}
          ${pill(sourceLabelEn(snapshot.source.data_source), "neutral")}
        </div>
        <h1>Event Radar</h1>
        <p class="lead">The default view is the curated event layer. Open All signals when you need the underlying item-level evidence.</p>
      </div>
    </section>
    ${freshnessAlertEn(snapshot)}
    ${coveragePanelEn(snapshot)}

    <section class="panel">
      <div class="tabbar" role="tablist" aria-label="Radar views">
        ${tabButton("curated", "Selected", true)}
        ${tabButton("events", "All events")}
        ${tabButton("signals", "All signals")}
        ${tabButton("timeline", "Latest timeline")}
        ${tabButton("review", "Needs review")}
        ${tabButton("health", "Source health")}
      </div>
      <div class="controls" role="search">
        <label>Search <input id="radar-search" type="search" aria-label="Search titles, sources, categories and entities"></label>
        <label>Status <select id="radar-status">${optionRaw("all", "All statuses")}${["included", "needs_review", "excluded", "failed"].map((status) => optionRaw(status, statusLabelEn(status))).join("")}</select></label>
        <label>Category <select id="radar-category">${optionRaw("all", "All categories")}${categories.map((category) => optionRaw(category, categoryLabelEn(category))).join("")}</select></label>
        <label>Source family <select id="radar-family">${optionRaw("all", "All families")}${families.map((family) => optionRaw(family, sourceFamilyLabelEn(family))).join("")}</select></label>
        <label>Score <select id="radar-score">${optionRaw("all", "All scores")}${scoreLabels.map((label) => optionRaw(label, eventScoreLabelEn(label))).join("")}</select></label>
        <label>Freshness <select id="radar-freshness">${optionRaw("all", "Any time")}${optionRaw("24h", "Within 24h")}${optionRaw("7d", "2-7 days")}${optionRaw("30d", "8-30 days")}${optionRaw("archive", "Archive (>30 days)")}</select></label>
        <label>Evidence coverage <select id="radar-source-count">${optionRaw("all", "Any evidence state")}${optionRaw("cross", "Cross-family coverage")}${optionRaw("same", "Multi-source, one family")}${optionRaw("single", "Single-source observation")}</select></label>
      </div>
      <div class="filter-feedback"><span aria-live="polite" id="radar-result-count"></span><button class="button" id="radar-reset" type="button">Reset filters</button></div>
      <div class="distribution">
        ${distributionEn("Status", [["Included", snapshot.counts.included], ["Needs review", snapshot.counts.needs_review], ["Excluded", snapshot.counts.excluded], ["Failed", snapshot.counts.failed]])}
        ${distributionEn("Categories", snapshot.top_categories.slice(0, 8).map((entry) => [entry.label, entry.count]))}
        ${distributionEn("Source coverage", [["Total", snapshot.coverage.sources_total], ["Automated eligible", snapshot.coverage.automated_eligible_sources], ["Attempted", snapshot.coverage.attempted_sources], ["Publicly visible", snapshot.coverage.sources_with_public_items ?? 0], ["Failed", snapshot.coverage.failed_sources]])}
        ${distributionEn("Freshness", freshnessBuckets(snapshot.radar_items, "en"))}
      </div>
    </section>

    <section aria-labelledby="radar-tab-curated" class="tab-panel active" data-tab-panel="curated" id="radar-panel-curated" role="tabpanel">
      <div class="event-grid">${snapshot.curated_events.map((event) => renderEventCardEn(event, snapshot)).join("") || empty("No curated events are available.")}</div>
    </section>
    <section aria-labelledby="radar-tab-events" class="tab-panel" data-tab-panel="events" hidden id="radar-panel-events" role="tabpanel">
      <div class="event-grid">${snapshot.event_clusters.map((event) => renderEventCardEn(event, snapshot)).join("") || empty("No event clusters are available.")}</div>
    </section>
    <section aria-labelledby="radar-tab-signals" class="tab-panel" data-tab-panel="signals" hidden id="radar-panel-signals" role="tabpanel">
      <div class="grid radar-layout">
        <div class="row-list radar-list" id="radar-list">
          ${downgradedSignalCount > 0 ? `<div class="callout warning"><strong>${downgradedSignalCount} low-event signals are kept out of the public event list</strong><p>Directory pages, site homepages and repository metadata remain auditable in the JSON snapshot but do not become public events or report evidence.</p></div>` : ""}
          ${displaySignalItems.map(renderRadarItemEn).join("") || empty("No public radar signals are available.")}
        </div>
        <aside class="panel sticky"><h2>Citations</h2><p class="note">Links point to public source pages. Private raw text, provider metadata and operational logs are not included.</p><div class="row-list">${displaySignalItems.slice(0, 12).map(renderCitationEn).join("")}</div></aside>
      </div>
    </section>
    <section aria-labelledby="radar-tab-timeline" class="tab-panel" data-tab-panel="timeline" hidden id="radar-panel-timeline" role="tabpanel">
      <div class="timeline-list">${snapshot.timeline.map((entry) => renderTimelineEntryEn(entry, snapshot)).join("") || empty("No timeline entries are available.")}</div>
    </section>
    <section aria-labelledby="radar-tab-review" class="tab-panel" data-tab-panel="review" hidden id="radar-panel-review" role="tabpanel">
      <div class="event-grid">${reviewEvents.map((event) => renderEventCardEn(event, snapshot)).join("") || empty("No events currently require review.")}</div>
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
          ${pill(`${entities.length} trackable entities`, "success")}
          ${pill(`${snapshot.counts.snapshot_radar_items} public signals`, "evidence")}
          ${pill(sourceLabelEn(snapshot.source.data_source), "neutral")}
        </div>
        <h1>Entity Tracking</h1>
        <p class="lead">Companies, models, products, projects and papers are aggregated from public signals so you can see evidence volume, source coverage and review status.</p>
      </div>
    </section>
    ${freshnessAlertEn(snapshot)}
    <section class="grid two">
      <div class="panel"><h2>Tracking rules</h2>${noteListEn(["Prioritize entities with multiple sources, repeated appearances and traceable citations.", "Treat single-source or review-pending entities as observations, not settled conclusions.", "Report claims must trace back to public event and item evidence."])}</div>
      <div class="panel"><h2>Entity distribution</h2><div class="distribution">${distributionEn("Types", entityTypeDistributionEn(entities))}${distributionEn("Priority", entityPriorityDistributionEn(entities))}</div></div>
    </section>
    <section class="panel"><div class="section-heading"><h2>Priority entities</h2><a href="../reports/">Report evidence</a></div><div class="event-grid">${priorityEntities.map(renderEntityCardEn).join("") || empty("No entities are available.")}</div></section>
  `);
}

function renderEnglishReports(snapshot: Snapshot) {
  const reports = latestReportsByType(snapshot.reports);
  const formalReports = latestReportsByType(snapshot.reports.filter(isFormalSnapshotReport));
  const evidenceDrafts = latestReportsByType(snapshot.reports.filter((report) => !isFormalSnapshotReport(report)));
  const dailySummary = snapshot.report_quality_summary.daily;

  return englishShell(snapshot, "reports", 1, "Reports", `
    <section class="page-heading">
      <div>
        <div class="pill-row">${pill(`${formalReports.length} reviewed or published`, formalReports.length > 0 ? "success" : "caution")}${pill(`${evidenceDrafts.length} evidence drafts`, "caution")}${pill(`${snapshot.event_count} events`, "evidence")}</div>
        <h1>Event-aware reports</h1>
        <p class="lead">Daily and weekly candidates expose their quality gate, event coverage, citations, source diversity, category breadth and missing evidence before any report is treated as publishable.</p>
      </div>
    </section>
    ${freshnessAlertEn(snapshot)}
    ${dailySummary && !dailySummary.quality_gate_passed ? `<section class="callout warning"><strong>Today's evidence is insufficient. Add sources or wait for the next refresh.</strong><p>${escapeHtml(reportGateReasonsEn(dailySummary.quality_gate_reasons).join(" ") || "The daily quality gate did not pass.")}</p></section>` : ""}
    <section class="section-heading"><div><h2>Reviewed or published reports</h2><p>Only reviewed or published saved reports count as formal public output.</p></div></section>
    <section class="report-list">${formalReports.map((report) => renderReportEn(report, snapshot)).join("") || empty("No reviewed or published report is available.")}</section>
    <section class="section-heading"><div><h2>Evidence drafts</h2><p>Drafts organize the current public evidence but still require human review and an explicit publish action.</p></div></section>
    <section class="report-list">${evidenceDrafts.map((report) => renderReportEn(report, snapshot)).join("") || empty("No evidence draft is available.")}</section>
    ${reportCoveragePanelEn(snapshot, reports)}
    ${coveragePanelEn(snapshot)}
  `);
}

function renderEnglishAsk(snapshot: Snapshot) {
  const examples = [
    "Which model releases have coverage from multiple source families?",
    "What changed in AI agents or developer tools during the visible window?",
    "Which events rely on a single source and need more confirmation?",
    "Which sources failed, timed out or returned no new items?",
    "Rank the selected events by decision relevance.",
    ...snapshot.curated_events.slice(0, 2).map((event) => `What evidence and uncertainty surround “${eventEnglishTitle(event, snapshot)}”?`)
  ];

  return englishShell(snapshot, "ask", 1, "Ask", `
    <section class="page-heading"><div><div class="pill-row">${pill(`${snapshot.event_count} events`, "success")}${pill("Public snapshot query", "evidence")}</div><h1>Ask the event layer</h1><p class="lead">Query selected events, source coverage, source failures and weak signals. This page runs in your browser against the public snapshot and does not call a private API.</p></div></section>
    ${freshnessAlertEn(snapshot, "Answers are limited to the current public evidence window and are not live web research.")}
    <section class="panel interactive-tool"><h2>Query public events</h2><p class="note">The local matcher ranks events and returns their public citations. It performs no database write.</p><textarea id="local-query-input" rows="4" aria-label="Enter a question">${escapeHtml(examples[0] ?? "")}</textarea><div class="actions"><button class="button primary" id="local-query-run" type="button">Query events</button></div><div class="local-result" id="local-query-result" aria-live="polite"></div></section>
    <section class="grid two"><div class="panel"><h2>Example questions</h2>${noteListEn(examples)}</div><div class="panel"><h2>Evidence context</h2><dl class="rail">${rail("Data source", sourceLabelEn(snapshot.source.data_source))}${rail("Latest evidence", formatDateEn(snapshot.freshness.latest_timestamp))}${rail("Events", String(snapshot.event_count))}${rail("Public signals", String(snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items))}${rail("Needs review", String(snapshot.counts.needs_review))}</dl></div></section>
    <section class="panel"><h2>Evidence limits</h2>${noteListEn(englishEvidenceLimits(snapshot))}</section>
    <script>${localEvidenceToolScript("ask", "en", "../../data/radar-snapshot.json")}</script>
  `);
}

function renderEnglishWrite(snapshot: Snapshot) {
  const currentReports = latestReportsByType(snapshot);
  const prompts = [
    "Draft a concise AI industry observation from the selected events.",
    "Turn this week's cross-family coverage and single-source events into a weekly report outline with separate evidence labels.",
    "Identify three events worth a deeper analysis.",
    "List weak signals that deserve follow-up despite limited evidence.",
    ...snapshot.curated_events.slice(0, 2).map((event) => `Build an evidence-bounded angle around “${eventEnglishTitle(event, snapshot)}”.`)
  ];

  return englishShell(snapshot, "write", 1, "Write", `
    <section class="page-heading"><div><div class="pill-row">${pill(`${currentReports.length} current report candidates`, "caution")}${pill(`${snapshot.event_count} events`, "evidence")}</div><h1>Evidence-led writing</h1><p class="lead">Build an outline from selected events, source-family coverage, weak signals and report quality while keeping citations and uncertainty visible.</p></div></section>
    ${freshnessAlertEn(snapshot, "Generated outlines must not make claims beyond the evidence window.")}
    <section class="panel interactive-tool"><h2>Generate an evidence-led outline</h2><p class="note">The browser-local tool turns public events into claims, evidence and caveats. It does not call a private API.</p><textarea id="local-query-input" rows="4" aria-label="Enter a writing request">${escapeHtml(prompts[0] ?? "")}</textarea><div class="actions"><button class="button primary" id="local-query-run" type="button">Generate outline</button></div><div class="local-result" id="local-query-result" aria-live="polite"></div></section>
    <section class="grid two"><div class="panel"><h2>Writing prompts</h2>${noteListEn(prompts)}</div><div class="panel"><h2>Data context</h2><dl class="rail">${rail("Data source", sourceLabelEn(snapshot.source.data_source))}${rail("Latest evidence", formatDateEn(snapshot.freshness.latest_timestamp))}${rail("Events", String(snapshot.event_count))}${rail("Public signals", String(snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items))}${rail("Current report candidates", String(currentReports.length))}</dl></div></section>
    <section class="panel"><h2>Current report context</h2><div class="row-list">${latestReportsByType(snapshot).map(renderCompactReportEn).join("") || empty("No public report candidate is available.")}</div></section>
    <script>${localEvidenceToolScript("write", "en", "../../data/radar-snapshot.json")}</script>
  `);
}

function renderHome(snapshot: Snapshot) {
  const latestReports = latestReportsByType(snapshot);
  const curated = snapshot.curated_events.toSorted(compareHomepageEvents).slice(0, 8);
  const topEvents = curated.slice(0, 3);
  const followUpEvents = curated.slice(3, 7);
  const title = snapshotCuratedTitle(snapshot);
  const briefing = readerBriefing(snapshot);
  const currentSelection = curatedWindowIsCurrent(snapshot);
  const topSectionTitle = currentSelection ? "今日 Top 3" : "本轮 Top 3";
  const description = currentSelection
    ? "把重复信号合并成事件，区分跨家族多源报道、同家族复述和单源观察，并展示来源健康、时间线、引用和局限。"
    : "本轮精选包含前几日证据；每张卡片都显示证据日期，旧事件不会伪装成今日新闻。";

  return shell(snapshot, "home", 0, title, `
    <section class="status-strip home-status-strip">
      ${metricMini("公开库/本站展示", `${snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items} / ${snapshot.radar_items.length}`)}
      ${metricMini("事件", snapshot.event_count)}
      ${metricMini("最近单源补跑 尝试/抓取/失败", `${snapshot.coverage.attempted_sources}/${snapshot.coverage.fetched_sources}/${snapshot.coverage.failed_sources}`)}
      ${metricMini("发布周期广泛刷新 成功/失败/手动", `${snapshot.source_health_summary.succeeded}/${snapshot.source_health_summary.failed}/${snapshot.source_health_summary.manual_blocked}`)}
      ${metricMini("当前报告候选", latestReports.length)}
      ${metricMini("证据截至", formatDate(snapshot.coverage.latest_refresh))}
    </section>
    ${freshnessAlert(snapshot).replace('class="freshness-alert"', 'class="freshness-alert home-freshness-alert"')}

    <section class="home-desk">
      <div class="headline-panel">
        <div class="pill-row">
          ${pill(currentSelection ? "今日窗口" : "含前几日回顾", currentSelection ? "success" : "caution")}
          ${pill("事件优先", "evidence")}
          ${pill(sourceLabel(snapshot.source.data_source), "neutral")}
        </div>
        <h1>${escapeHtml(title)}</h1>
        <div class="section-heading"><h2>${escapeHtml(topSectionTitle)}</h2><a href="radar/">全部事件</a></div>
        <div class="featured-list">${topEvents.map(renderFeaturedEventCard).join("") || empty("暂无可展示精选事件。")}</div>
        <p class="lead">${escapeHtml(description)} 提问与写作入口只读取当前公开快照，并明确展示证据边界。</p>
        <div class="actions">
          <a class="button primary" href="radar/">打开事件雷达</a>
          <a class="button" href="entities/">跟踪实体</a>
          <a class="button" href="reports/">查看报告质量</a>
          <a class="button" href="ask/">围绕精选提问</a>
          <a class="button" href="write/">生成行业观察</a>
        </div>
      </div>
      <aside class="ops-console">
        <h2>信息源健康摘要</h2>
        <dl class="rail">
          ${rail("事件/本站展示信号", `${snapshot.event_count} / ${snapshot.radar_items.length}`)}
          ${rail("跨家族多源报道", String(snapshot.event_clusters.filter((event) => event.source_count > 1 && event.source_families.length > 1).length))}
          ${rail("同家族多源复述", String(snapshot.event_clusters.filter((event) => event.source_count > 1 && event.source_families.length === 1).length))}
          ${rail("自动合格来源", String(snapshot.coverage.automated_eligible_sources))}
          ${rail("广泛刷新成功/失败", `${snapshot.source_health_summary.succeeded} / ${snapshot.source_health_summary.failed}（已尝试 ${snapshot.source_health_scope.attempted_sources}）`)}
          ${rail("异常/排除类别", formatDistribution(snapshot.failure_family_summary))}
          ${rail("数据覆盖", `公开来源 ${snapshot.coverage.sources_with_public_items ?? 0} / ${snapshot.coverage.sources_total}`)}
        </dl>
        <div class="quality-note">
          <strong>${escapeHtml(snapshot.source.local_data_used ? "当前使用已归档快照" : "当前使用公开证据库")}</strong>
          <p>${escapeHtml(snapshot.source.local_data_used ? "页面展示最近一版已归档公开证据；单源事件均按待确认处理。" : "页面展示可公开引用的结构化证据字段。")}</p>
        </div>
      </aside>
    </section>

    <section class="panel">
      <div class="section-heading">
        <h2>读者判断摘要</h2>
        <a href="radar/">展开证据</a>
      </div>
      ${noteList(briefing)}
    </section>

    <section class="grid two">
      <div class="panel">
        <div class="section-heading">
          <h2>读者分类入口</h2>
          <a href="radar/">进入雷达</a>
        </div>
        <div class="event-grid">${readerCategoryCards(snapshot)}</div>
      </div>
      <div class="panel">
        <div class="section-heading">
          <h2>继续跟踪</h2>
          <a href="radar/">查看全部</a>
        </div>
        <div class="row-list">${followUpEvents.map(renderEventMini).join("") || empty("暂无继续跟踪事件。")}</div>
      </div>
    </section>

    <section class="panel">
      <div class="section-heading">
        <h2>全部行业精选</h2>
        <a href="radar/">查看全部事件</a>
      </div>
      <div class="event-grid">${curated.map((event) => renderEventCard(event, snapshot)).join("") || empty("暂无可展示事件。")}</div>
    </section>

    <section class="grid two">
      <div class="panel">
        <div class="section-heading">
          <h2>行业脉冲</h2>
          <a href="data/radar-snapshot.json">数据文件</a>
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
          <h2>信号行动入口</h2>
          <a href="entities/">实体</a>
        </div>
        ${noteList([
           "打开雷达区分跨家族多源报道、同家族多源复述、单源观察和弱信号。",
          "查看报告质量门禁，确认哪些证据已经支撑正式报告。",
          "进入实体页判断公司、模型、产品或论文是否值得持续跟踪。",
          "只把通过人工审核和发布动作的记录展示为正式报告。",
          "围绕当前事件提问，或基于证据边界生成写作提纲。"
        ])}
        <div class="actions">
          <a class="button primary" href="ask/">围绕行业精选提问</a>
          <a class="button" href="write/">基于事件开始写作</a>
        </div>
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
        ${noteList(readerFacingCaveats(snapshot).slice(0, 8))}
      </div>
    </section>
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
  const eventItemIds = new Set(snapshot.event_cluster_items.map((item) => item.radar_item_id));
  const displaySignalItems = snapshot.radar_items.filter((item) => eventItemIds.has(item.id));
  const downgradedSignalCount = snapshot.radar_items.length - displaySignalItems.length;

  return shell(snapshot, "radar", 1, "雷达", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items} 条公开库 / ${snapshot.radar_items.length} 条本站展示`, "success")}
          ${pill(`${snapshot.event_count} 个事件`, "evidence")}
          ${pill(`${snapshot.coverage.attempted_sources} 个已尝试来源`, "neutral")}
          ${pill(sourceLabel(snapshot.source.data_source), "neutral")}
        </div>
        <h1>事件雷达</h1>
        <p class="lead">默认展示行业精选事件；全部信号仍保留在“全部信号”标签下，避免同一事件被重复阅读。</p>
      </div>
    </section>
    ${freshnessAlert(snapshot)}

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
        <label>搜索 <input id="radar-search" type="search" aria-label="按标题、来源、类别、标签搜索"></label>
        <label>状态 <select id="radar-status">${option("all", "全部状态")}${["included", "needs_review", "excluded", "failed"].map((status) => option(status, statusLabel(status))).join("")}</select></label>
        <label>类别 <select id="radar-category">${option("all", "全部类别")}${categories.map((category) => option(category, labelize(category))).join("")}</select></label>
        <label>来源家族 <select id="radar-family">${option("all", "全部家族")}${uniqueStrings([...Object.keys(families), ...eventFamilies]).map((family) => option(family, family)).join("")}</select></label>
        <label>评分 <select id="radar-score">${option("all", "全部评分")}${scoreLabels.map((label) => option(label, label)).join("")}</select></label>
        <label>新鲜度 <select id="radar-freshness">${option("all", "全部时间")}${option("24h", "24 小时内")}${option("7d", "2-7 天")}${option("30d", "8-30 天")}${option("archive", "历史（30 天外）")}</select></label>
        <label>证据覆盖 <select id="radar-source-count">${option("all", "全部证据状态")}${option("cross", "跨家族多源报道")}${option("same", "同家族多源复述")}${option("single", "单源观察")}</select></label>
      </div>
      <div class="filter-feedback"><span aria-live="polite" id="radar-result-count"></span><button class="button" id="radar-reset" type="button">重置筛选</button></div>
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
        ${distribution("新鲜度", freshnessBuckets(snapshot.radar_items, "zh"))}
      </div>
    </section>

    <section aria-labelledby="radar-tab-curated" class="tab-panel active" data-tab-panel="curated" id="radar-panel-curated" role="tabpanel">
      <div class="event-grid">${snapshot.curated_events.map((event) => renderEventCard(event, snapshot)).join("") || empty("暂无行业精选事件。")}</div>
    </section>

    <section aria-labelledby="radar-tab-events" class="tab-panel" data-tab-panel="events" hidden id="radar-panel-events" role="tabpanel">
      <div class="event-grid">${snapshot.event_clusters.map((event) => renderEventCard(event, snapshot)).join("") || empty("暂无事件聚类。")}</div>
    </section>

    <section aria-labelledby="radar-tab-signals" class="tab-panel" data-tab-panel="signals" hidden id="radar-panel-signals" role="tabpanel">
      <div class="grid radar-layout">
      <div class="row-list radar-list" id="radar-list">
        ${downgradedSignalCount > 0 ? `<div class="callout warning"><strong>已降级 ${downgradedSignalCount} 条低事件性信号</strong><p>文档入口、目录页、站点首页、仓库元数据等不进入公开事件列表和报告正文；完整审计保留在公开 JSON 快照。</p></div>` : ""}
        ${displaySignalItems.map(renderRadarItem).join("") || empty("暂无雷达条目。")}
      </div>
      <aside class="panel sticky">
        <h2>引用栏</h2>
        <p class="note">链接指向公开来源页面。快照不包含私有原文、供应商元数据或服务密钥。</p>
        <div class="row-list">${displaySignalItems.slice(0, 12).map(renderCitation).join("")}</div>
      </aside>
      </div>
    </section>

    <section aria-labelledby="radar-tab-timeline" class="tab-panel" data-tab-panel="timeline" hidden id="radar-panel-timeline" role="tabpanel">
      <div class="timeline-list">${snapshot.timeline.map(renderTimelineEntry).join("") || empty("暂无时间线。")}</div>
    </section>

    <section aria-labelledby="radar-tab-review" class="tab-panel" data-tab-panel="review" hidden id="radar-panel-review" role="tabpanel">
      <div class="event-grid">${snapshot.event_clusters.filter((event) => event.caveats.length > 0 || event.related_item_ids.some((id) => snapshot.radar_items.find((item) => item.id === id)?.status === "needs_review")).map((event) => renderEventCard(event, snapshot)).join("") || empty("暂无待复核事件。")}</div>
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
      <a class="button" href="${escapeAttr(snapshot.reference_app_url.replace(/\/$/, ""))}/entities">打开动态实体页</a>
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
  const formalReports = latestReportsByType(snapshot.reports.filter(isFormalSnapshotReport));
  const evidenceDrafts = latestReportsByType(snapshot.reports.filter((report) => !isFormalSnapshotReport(report)));
  const dailySummary = snapshot.report_quality_summary.daily;
  const traceItems = snapshotItemsForTraceability(snapshot.radar_items);

  return shell(snapshot, "reports", 1, "报告", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${formalReports.length} 个已审核/发布`, formalReports.length > 0 ? "success" : "caution")}
          ${pill(`${evidenceDrafts.length} 个证据草稿`, "caution")}
          ${pill(`${snapshot.event_count} 个事件`, "neutral")}
          ${pill(sourceLabel(snapshot.source.data_source), "neutral")}
        </div>
        <h1>报告状态</h1>
        <p class="lead">已审核/已发布报告和证据草稿分开显示。没有正式公开报告时，这里展示正常空态，草稿只用于理解当前公开证据。</p>
      </div>
    </section>
    ${freshnessAlert(snapshot)}
    ${dailySummary && !dailySummary.quality_gate_passed ? `<section class="callout warning"><strong>今日数据不足，需补充信源或等待下一轮刷新</strong><p>${escapeHtml(dailySummary.quality_gate_reasons.map(publicText).join("；") || "日报质量门禁未通过。")}</p></section>` : ""}
    <section class="section-heading"><div><h2>已审核/已发布报告</h2><p>只有 reviewed 或 published 的保存报告属于正式公开内容。</p></div></section>
    <section class="report-list">
      ${formalReports.map((report) => renderReport(report, snapshot, traceItems)).join("") || empty("暂无已审核或已发布报告。")}
    </section>
    <section class="section-heading"><div><h2>证据草稿</h2><p>草稿来自当前公开雷达证据，发布前仍需要人工审核。</p></div></section>
    <section class="report-list">
      ${evidenceDrafts.map((report) => renderReport(report, snapshot, traceItems)).join("") || empty("暂无证据草稿。")}
    </section>
    ${reportCoveragePanel(snapshot, reports)}
    ${coveragePanel(snapshot)}
  `);
}

function renderAsk(snapshot: Snapshot) {
  const title = snapshotCuratedTitle(snapshot);
  const examples = [
    `${snapshotWindowLabel(snapshot)}有哪些跨来源家族报道的模型发布？`,
    `${snapshotPeriodLabel(snapshot)} Agent / 开发工具有哪些重要变化？`,
    "哪些事件只有单一来源，可信度较低？",
    snapshotIsStale(snapshot) ? "哪些来源在本轮刷新失败或没有新内容？" : "哪些来源今天失败或没有新内容？",
    `把${title}按重要性排序`,
    ...snapshot.curated_events.slice(0, 2).map((event) => `围绕“${event.canonical_title}”有哪些证据和不确定性？`)
  ];

  return shell(snapshot, "ask", 1, "提问", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${snapshot.event_count} 个事件`, "success")}
          ${pill("公开快照查询", "evidence")}
        </div>
        <h1>事件提问</h1>
        <p class="lead">围绕 ${escapeHtml(title)}、来源家族覆盖、来源失败和弱信号提问。Cloudflare 页面只读取公开快照，不暴露密钥或私有服务端数据。</p>
      </div>
    </section>
    ${freshnessAlert(snapshot, "结果只基于当前公开证据；Cloudflare 页面本身不提供实时联网聊天。")}
    <section class="panel interactive-tool">
      <h2>查询公开事件</h2>
      <p class="note">在浏览器内匹配当前事件、来源和引用；不会调用私有 API，也不会产生数据库写入。</p>
      <textarea id="local-query-input" rows="4" aria-label="输入问题">${escapeHtml(examples[0] ?? "")}</textarea>
      <div class="actions"><button class="button primary" id="local-query-run" type="button">查询公开事件</button></div>
      <div class="local-result" id="local-query-result" aria-live="polite"></div>
    </section>
    <section class="grid two">
      <div class="panel"><h2>示例问题</h2>${noteList(examples)}</div>
      <div class="panel"><h2>证据上下文</h2><dl class="rail">${rail("数据来源", sourceLabel(snapshot.source.data_source))}${rail("最新雷达", formatDate(snapshot.freshness.latest_timestamp))}${rail("事件数量", String(snapshot.event_count))}${coverageRailRows(snapshot)}${rail("待复核", String(snapshot.counts.needs_review))}</dl></div>
    </section>
    <section class="panel">
      <h2>证据边界</h2>
      ${noteList(readerFacingCaveats(snapshot).slice(0, 6))}
    </section>
    <script>${localEvidenceToolScript("ask")}</script>
  `);
}

function renderWrite(snapshot: Snapshot) {
  const title = snapshotCuratedTitle(snapshot);
  const currentReports = latestReportsByType(snapshot);
  const prompts = [
    `基于 ${title} 写一段 AI 行业观察`,
    `把${snapshotIsStale(snapshot) ? "这批可见窗口" : "本周"}跨家族多源报道、同家族复述和单源事件整理成周报提纲`,
    "找出适合写成深度分析的 3 个事件",
    "列出证据不足但值得继续跟踪的弱信号",
    ...snapshot.curated_events.slice(0, 2).map((event) => `基于“${event.canonical_title}”写一个带证据边界的观察角度。`)
  ];

  return shell(snapshot, "write", 1, "写作", `
    <section class="page-heading">
      <div>
        <div class="pill-row">
          ${pill(`${currentReports.length} 个当前报告候选`, "caution")}
          ${pill(`${snapshot.event_count} 个事件`, "evidence")}
        </div>
        <h1>事件写作</h1>
        <p class="lead">基于行业精选、来源家族覆盖、弱信号和报告质量状态组织写作提纲，并保留来源与不确定性。</p>
      </div>
    </section>
    ${freshnessAlert(snapshot, "写作提纲只基于当前公开证据，不应写成超出证据时间窗的实时结论。")}
    <section class="panel interactive-tool">
      <h2>生成证据化提纲</h2>
      <p class="note">在浏览器内从公开事件生成论点、证据和边界；Cloudflare 静态页不调用私有 API。</p>
      <textarea id="local-query-input" rows="4" aria-label="输入写作需求">${escapeHtml(prompts[0] ?? "")}</textarea>
      <div class="actions"><button class="button primary" id="local-query-run" type="button">生成写作提纲</button></div>
      <div class="local-result" id="local-query-result" aria-live="polite"></div>
    </section>
    <section class="grid two">
      <div class="panel"><h2>写作提示</h2>${noteList(prompts)}</div>
      <div class="panel"><h2>数据上下文</h2><dl class="rail">${rail("数据来源", sourceLabel(snapshot.source.data_source))}${rail("最新雷达", formatDate(snapshot.freshness.latest_timestamp))}${rail("事件数量", String(snapshot.event_count))}${coverageRailRows(snapshot)}${rail("当前报告候选", String(currentReports.length))}</dl></div>
    </section>
    <section class="grid two">
      <div class="panel">
        <h2>当前报告上下文</h2>
        <div class="row-list">${latestReportsByType(snapshot).map(renderCompactReport).join("") || empty("没有找到公开报告候选。")}</div>
      </div>
      <div class="panel">
        <h2>缺失证据与局限</h2>
        ${noteList(uniqueStrings(snapshot.reports.flatMap((report) => report.missing_evidence)).slice(0, 8).concat(readerFacingCaveats(snapshot).slice(0, 3)))}
      </div>
    </section>
    <script>${localEvidenceToolScript("write")}</script>
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
  current: "home" | "radar" | "entities" | "reports" | "ask" | "write",
  depth: 0 | 1,
  title: string,
  body: string
) {
  const localePrefix = depth === 0 ? "" : "../";
  const assetPrefix = depth === 0 ? "../" : "../../";
  const chineseHref = current === "home" ? "../index.html" : `../../${current}/`;
  const englishHref = current === "home" ? "index.html" : `${localePrefix}${current}/`;
  const nav = [
    ["home", curatedWindowIsCurrent(snapshot) ? "Today" : "Latest", `${localePrefix}index.html`],
    ["radar", "Radar", `${localePrefix}radar/`],
    ["entities", "Entities", `${localePrefix}entities/`],
    ["reports", "Reports", `${localePrefix}reports/`],
    ["ask", "Ask", `${localePrefix}ask/`],
    ["write", "Write", `${localePrefix}write/`]
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
    <header class="site-header">
      <a class="brand" href="${localePrefix}index.html"><span class="brand-mark"></span><span>AI Industry Radar</span></a>
      <div class="header-tools">
        <nav aria-label="Primary navigation">
          ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${escapeHtml(label)}</a>`).join("")}
        </nav>
        <div class="language-switch" aria-label="Language">
          <a lang="zh-CN" href="${escapeAttr(chineseHref)}">中文</a>
          <a aria-current="true" href="${escapeAttr(englishHref)}">EN</a>
        </div>
      </div>
    </header>
    <main>${body}</main>
    <footer class="site-footer">
      <span>Generated ${escapeHtml(formatDateEn(snapshot.generated_at))}</span>
      <span>Public read-only radar snapshot. Dynamic reference: <a href="${escapeAttr(snapshot.reference_app_url)}">${escapeHtml(snapshot.reference_app_url)}</a></span>
    </footer>
    <script>${languageSwitchStateScript()}</script>
  </body>
</html>`;
}

function eventEnglishItems(event: SnapshotEvent, snapshot: Snapshot) {
  const ids = new Set(event.related_item_ids);
  return snapshot.radar_items.filter((item) => ids.has(item.id));
}

function eventEnglishTitle(event: SnapshotEvent, snapshot: Snapshot) {
  return eventEnglishItems(event, snapshot)[0]?.title || event.timeline[0]?.title || event.canonical_title;
}

function eventEnglishSummary(event: SnapshotEvent, snapshot: Snapshot) {
  const summary = eventEnglishItems(event, snapshot).find((item) => item.summary_en?.trim())?.summary_en?.trim();
  if (summary) return summary;
  return `This ${categoryLabelEn(event.category).toLowerCase()} event is supported by ${event.source_count} public source${event.source_count === 1 ? "" : "s"} and ${event.related_item_ids.length} related signal${event.related_item_ids.length === 1 ? "" : "s"}. Review the timeline and citations before drawing a firm conclusion.`;
}

function entityLabelEn(value: string) {
  const aliases: Record<string, string> = {
    "苹果": "Apple",
    apple: "Apple",
    anthropic: "Anthropic",
    github: "GitHub",
    "gpt 5 6": "GPT-5.6",
    "hugging face": "Hugging Face",
    "llama cpp": "llama.cpp",
    microsoft: "Microsoft",
    openai: "OpenAI",
    vllm: "vLLM"
  };
  return aliases[value.trim().toLowerCase()] ?? entityDisplayLabel(value);
}

function eventEntityLabelsEn(event: SnapshotEvent) {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const entity of event.related_entities) {
    const label = entityLabelEn(entity);
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

function renderEventCardEn(event: SnapshotEvent, snapshot: Snapshot) {
  const title = eventEnglishTitle(event, snapshot);
  const summary = eventEnglishSummary(event, snapshot);
  const search = [
    title,
    summary,
    event.category,
    categoryLabelEn(event.category),
    event.event_score_label,
    eventScoreLabelEn(event.event_score_label),
    event.source_families.join(" "),
    event.source_families.map(sourceFamilyLabelEn).join(" "),
    event.related_entities.join(" "),
    eventEntityLabelsEn(event).join(" "),
    event.citations.map((citation) => citation.source_name).join(" ")
  ].join(" ").toLowerCase();
  const sourceCount = eventConfirmationFilterValue(event);
  const caveats = eventCaveatsEn(event, snapshot);

  const freshness = freshnessBucket(event.latest_seen_at);
  return `<article class="event-card" data-category="${escapeAttr(`${event.category} ${categoryLabelEn(event.category)}`)}" data-family="${escapeAttr(event.source_families.join(" "))}" data-freshness="${freshness}" data-score="${escapeAttr(event.event_score_label)}" data-search="${escapeAttr(search)}" data-source-count="${sourceCount}" data-status="${escapeAttr(eventStatus(event, snapshot))}">
    <div class="pill-row">
      ${pill(eventScoreLabelEn(event.event_score_label), eventScoreTone(event.event_score_label))}
      ${pill(eventConfirmationLabelEn(event), eventConfirmationTone(event))}
      ${pill(freshnessLabelEn(freshness), freshness === "archive" ? "caution" : "neutral")}
      ${pill(`Score ${event.event_score}`, "evidence")}
      ${pill(`${event.source_count} source${event.source_count === 1 ? "" : "s"}`, event.source_count > 1 ? "success" : "caution")}
      ${event.source_families.slice(0, 3).map((family) => pill(sourceFamilyLabelEn(family), "neutral")).join("")}
    </div>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(summary)}</p>
    <dl class="event-meta">
      ${rail("Category", categoryLabelEn(event.category))}
      ${rail("Window", `${formatDateEn(event.first_seen_at)} to ${formatDateEn(event.latest_seen_at)}`)}
      ${rail("Related signals", String(event.related_item_ids.length))}
      ${rail("Why it matters", eventImpactNoteEn(event))}
      ${rail("What to watch", eventWatchNoteEn(event))}
      ${rail("Score basis", eventScoreReasonEn(event))}
    </dl>
    ${event.related_entities.length > 0 ? `<div class="pill-row">${eventEntityLabelsEn(event).slice(0, 6).map((entity) => pill(entity, "neutral")).join("")}</div>` : ""}
    <details><summary>Expand timeline</summary><div class="timeline-list compact">${event.timeline.map(renderEventTimelineRowEn).join("")}</div></details>
    <details><summary>View related signals</summary><div class="citation-grid">${event.citations.map(renderEventCitationEn).join("")}</div></details>
    ${caveats.length > 0 ? `<div class="event-caveats">${noteListEn(caveats)}</div>` : ""}
  </article>`;
}

function renderFeaturedEventCardEn(event: SnapshotEvent, snapshot: Snapshot) {
  const freshness = freshnessBucket(event.latest_seen_at);
  return `<article class="featured-card">
    <div class="featured-main">
      <div class="pill-row">${pill(eventScoreLabelEn(event.event_score_label), eventScoreTone(event.event_score_label))}${pill(eventConfirmationLabelEn(event), eventConfirmationTone(event))}${pill(freshnessLabelEn(freshness), freshness === "24h" ? "success" : "caution")}${pill(`${event.source_count} source${event.source_count === 1 ? "" : "s"}`, event.source_count > 1 ? "success" : "caution")}${event.source_families.slice(0, 2).map((family) => pill(sourceFamilyLabelEn(family), "neutral")).join("")}</div>
      <h2>${escapeHtml(eventEnglishTitle(event, snapshot))}</h2>
      <p>${escapeHtml(eventEnglishSummary(event, snapshot))}</p>
      <dl class="event-meta">${rail("Why it matters", eventImpactNoteEn(event))}${rail("Next check", eventWatchNoteEn(event))}</dl>
    </div>
    <aside><dl class="rail compact-rail">${rail("Score", String(event.event_score))}${rail("Latest", formatDateEn(event.latest_seen_at))}${rail("Citations", String(event.citations.length))}</dl>${event.citations[0] ? `<a class="source-link" href="${escapeAttr(event.citations[0].url)}">${escapeHtml(event.citations[0].source_name)}</a>` : ""}</aside>
  </article>`;
}

function eventImpactNoteEn(event: SnapshotEvent) {
  const text = `${event.canonical_title} ${event.summary_zh} ${event.category}`.toLowerCase();
  const category = eventDecisionCategory(event, text);
  const entity = primaryEventEntityEn(event);
  const notes: Record<string, string> = {
    agent: `${entity} may change agent workflows, developer entry points or product integration choices.`,
    benchmark: `${entity} may change comparative evaluation, procurement shortlists or capability positioning.`,
    business: `${entity} may affect enterprise adoption, buying signals or competitive positioning.`,
    funding: `${entity} may affect company runway, market structure or ecosystem investment priorities.`,
    infrastructure: `${entity} may change deployment dependencies, operating cost or engineering reliability.`,
    model_release: `${entity} may change upgrade timing, compatibility testing and downstream capability expectations.`,
    open_source: `${entity} may change dependency choices, deployment paths or integration risk.`,
    product_update: `${entity} may change APIs, migration cost, governance controls or developer workflows.`,
    regulation: `${entity} may change compliance priorities, market access or product accountability.`,
    research: `${entity} may influence technical direction or evaluation methods if it is independently reproduced.`,
    safety: `${entity} may change usage boundaries, review requirements or organizational responsibility.`
  };
  return notes[category] ?? `${entity} is a public industry signal that should be evaluated against its sources and timeline.`;
}

function eventWatchNoteEn(event: SnapshotEvent) {
  if (event.source_count <= 1) return "Find a second independent source or the original official announcement before treating this as confirmed.";
  if (event.source_families.length <= 1) return "Look for confirmation from a different source family and compare whether the claims converge.";
  if (event.citations.length <= 1) return "Extend the citation chain and check for conflicting evidence.";
  return "Track follow-up releases, corrections and whether the multi-source narrative continues to converge.";
}

function eventScoreReasonEn(event: SnapshotEvent) {
  const confirmation =
    event.source_count > 1 && event.source_families.length > 1
      ? "cross-family coverage with source independence unverified"
      : event.source_count > 1
        ? "multiple reports from one source family"
        : "single-source evidence";
  return `${event.event_score}/100 from AI relevance, source credibility, source diversity, freshness, novelty and importance; currently ${confirmation}.`;
}

function eventCaveatsEn(event: SnapshotEvent, snapshot: Snapshot) {
  const related = eventEnglishItems(event, snapshot);
  const caveats: string[] = [];
  if (event.source_count <= 1) caveats.push("This is a single-source event and still needs independent confirmation.");
  if (event.source_families.length <= 1 && event.source_count > 1) caveats.push("The supporting items come from one source family, so source diversity remains limited.");
  if (event.source_families.length > 1) caveats.push("The source families differ, but one may repeat another's original claim; source independence has not been established.");
  if (related.some((item) => item.status === "needs_review")) caveats.push("At least one related signal remains in needs-review status.");
  return caveats;
}

function renderEventTimelineRowEn(entry: SnapshotEvent["timeline"][number]) {
  return `<a class="timeline-row" href="${escapeAttr(entry.url)}"><time>${escapeHtml(formatDateEn(entry.timestamp))}</time><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.source_name)}</span></a>`;
}

function renderEventCitationEn(citation: SnapshotEvent["citations"][number]) {
  return `<a class="citation" href="${escapeAttr(citation.url)}"><span>${escapeHtml(citation.source_name)}</span><strong>${escapeHtml(citation.title)}</strong><small>${escapeHtml(formatDateEn(citation.published_at ?? citation.collected_at))}</small></a>`;
}

function renderTimelineEntryEn(entry: SnapshotTimelineEntry, snapshot: Snapshot) {
  const event = snapshot.event_clusters.find((candidate) => candidate.event_cluster_id === entry.event_cluster_id);
  return `<a class="timeline-row" href="${escapeAttr(entry.url)}"><time>${escapeHtml(formatDateEn(entry.timestamp))}</time><strong>${escapeHtml(event ? eventEnglishTitle(event, snapshot) : entry.title)}</strong><span>${escapeHtml(`${entry.source_name} / ${eventScoreLabelEn(entry.event_score_label)}`)}</span></a>`;
}

function renderRadarItemEn(item: SnapshotItem) {
  const summary = item.summary_en?.trim() || `Public signal from ${item.source_name}. Review the original title and source before using it as evidence.`;
  const freshness = freshnessBucket(item.published_at ?? item.collected_at ?? item.processed_at);
  return `<article class="radar-row" data-category="${escapeAttr(`${item.categories.join(" ")} ${item.categories.map(categoryLabelEn).join(" ")}`)}" data-family="${escapeAttr(sourceFamily(item))}" data-freshness="${freshness}" data-search="${escapeAttr(`${item.title} ${summary} ${item.source_name} ${item.tags.join(" ")} ${item.entities.map((entity) => entity.name).join(" ")}`.toLowerCase())}" data-status="${escapeAttr(item.status)}">
    <div><div class="pill-row">${pill(statusLabelEn(item.status), statusTone(item.status))}${pill(`Overall ${item.scores.overall.toFixed(2)}`, "evidence")}${pill(`Confidence ${formatPercent(item.confidence)}`, "success")}</div><h2><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(summary)}</p><div class="pill-row">${item.categories.map((category) => pill(categoryLabelEn(category), "evidence")).join("")}${item.tags.slice(0, 5).map((tag) => pill(tag, "neutral")).join("")}</div></div>
    <dl>${rail("Source", item.source_name)}${rail("Time", formatDateEn(item.published_at ?? item.collected_at))}${rail("Tier", item.source_tier)}${rail("Source family", sourceFamilyLabelEn(sourceFamily(item)))}</dl>
  </article>`;
}

function renderCitationEn(item: SnapshotItem) {
  return `<a class="citation" href="${escapeAttr(item.url)}"><span>${escapeHtml(item.source_name)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(formatDateEn(item.published_at ?? item.collected_at))}</small></a>`;
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

function renderCompactReportEn(report: SnapshotReport) {
  return `<article class="compact-row"><div><div class="pill-row">${pill("Evidence draft, not published", "caution")}${pill(reportTypeLabelEn(report.report_type), "evidence")}${pill(qualityLabelEn(report), report.quality_gate_passed ? "neutral" : "caution")}</div><h3>${escapeHtml(`${reportTypeLabelEn(report.report_type)} evidence candidate`)}</h3><p>${escapeHtml(`${report.usable_item_count} usable items, ${report.citation_count} citations, ${report.distinct_source_count} distinct sources and ${report.category_count} categories.`)}</p></div><dl>${rail("Window", `${formatDateEn(report.time_window.start)} to ${formatDateEn(report.time_window.end)}`)}${rail("Mode", modeLabelEn(report.mode))}</dl></article>`;
}

function renderReportEn(report: SnapshotReport, snapshot: Snapshot) {
  const sourceIds = new Set(report.source_item_ids);
  const includedEvents = snapshot.event_clusters
    .filter((event) => event.related_item_ids.some((id) => sourceIds.has(id)))
    .toSorted((left, right) => right.event_score - left.event_score)
    .slice(0, 6);
  const fallbackEvents = includedEvents.length > 0 ? includedEvents : snapshot.curated_events.slice(0, 3);
  const corroboratedEvents = fallbackEvents.filter((event) => event.source_count > 1).length;
  const crossFamilyEvents = fallbackEvents.filter((event) => event.source_count > 1 && event.source_families.length > 1).length;
  const gateReasons = report.quality_gate_passed ? [] : reportGateReasonsEn(report.quality_gate_reasons);
  const releaseReady = report.status !== "needs_review";

  return `<article class="report-card">
    <div class="pill-row">${pill(releaseReady ? "Editorial release controlled" : "Evidence draft, not release-ready", releaseReady ? "success" : "caution")}${pill(reportTypeLabelEn(report.report_type), "evidence")}${pill(qualityLabelEn(report), report.quality_gate_passed ? "neutral" : "caution")}${pill(statusLabelEn(report.status), statusTone(report.status))}${pill(modeLabelEn(report.mode), "neutral")}</div>
    <h2>${escapeHtml(`${reportTypeLabelEn(report.report_type)} event evidence candidate`)}</h2>
    <p class="report-summary">${escapeHtml(`This candidate organizes ${fallbackEvents.length} top event${fallbackEvents.length === 1 ? "" : "s"} from ${report.usable_item_count} usable signals. Quality status is shown separately from editorial approval.`)}</p>
    <dl class="inline-defs">${rail("Baseline evidence gate", qualityLabelEn(report))}${rail("Cross-family coverage / same-family multi / single", `${crossFamilyEvents} / ${Math.max(0, corroboratedEvents - crossFamilyEvents)} / ${Math.max(0, fallbackEvents.length - corroboratedEvents)}`)}${rail("Publication readiness", report.status !== "needs_review" ? "Editorial status controls publication" : "Needs review: source independence is not modeled")}${rail("Usable items", report.usable_item_count)}${rail("Citations", report.citation_count)}${rail("Distinct sources", report.distinct_source_count)}${rail("Categories", report.category_count)}${rail("Missing evidence", report.missing_evidence.length)}${rail("Window", `${formatDateEn(report.time_window.start)} to ${formatDateEn(report.time_window.end)}`)}</dl>
    ${fallbackEvents.length > 0 ? `<h3>Top events included</h3><div class="event-mini-list">${fallbackEvents.map((event) => renderEventMiniEn(event, snapshot)).join("")}</div>` : ""}
    ${gateReasons.length > 0 ? `<h3>Why the gate did not pass</h3>${noteListEn(gateReasons)}` : ""}
    <h3>Caveats</h3>${noteListEn(["This is a public evidence candidate, not an editorially published report.", "Original citations should be checked before using any claim externally.", ...(report.missing_evidence.length > 0 ? ["One or more evidence gaps remain unresolved."] : [])])}
    ${report.citations.length > 0 ? `<div class="citation-grid">${report.citations.slice(0, 12).map((citation) => `<a class="citation" href="${escapeAttr(citation.url)}"><span>${escapeHtml(citation.source_name)}</span><strong>${escapeHtml(citation.title)}</strong><small>${escapeHtml(formatDateEn(citation.published_at ?? citation.collected_at))}</small></a>`).join("")}</div>` : ""}
  </article>`;
}

function reportCoveragePanelEn(snapshot: Snapshot, reports: SnapshotReport[]) {
  const daily = reports.find((report) => report.report_type === "daily");
  const weekly = reports.find((report) => report.report_type === "weekly");
  const formalReports = snapshot.reports.filter(isFormalSnapshotReport).length;
  const evidenceDrafts = snapshot.reports.length - formalReports;
  const corroboratedEvents = snapshot.event_clusters.filter((event) => event.source_count > 1).length;
  const crossFamilyEvents = snapshot.event_clusters.filter((event) => event.source_count > 1 && event.source_families.length > 1).length;
  return `<section class="panel"><div class="section-heading"><h2>Report quality model</h2></div>${noteListEn(["The baseline evidence gate measures volume, citations, source breadth and category breadth; it does not mean every event is independently corroborated.", "Multiple reports from one family and cross-family coverage are shown separately. Cross-family coverage does not prove source independence, and every evidence draft still requires editorial review.", "Daily minimums are 5 usable items, 3 citations, 2 sources and 2 categories when available. Weekly minimums are 20, 8, 5 and 3."])}<dl class="rail">${rail("Formal reports", String(formalReports))}${rail("Evidence drafts", String(evidenceDrafts))}${rail("Multiple reports / cross-family coverage / all events", `${corroboratedEvents} / ${crossFamilyEvents} / ${snapshot.event_count}`)}${rail("Release readiness", formalReports > 0 ? "Editorially controlled" : "Needs review: no formal report is published")}${rail("Daily baseline gate", daily ? qualityLabelEn(daily) : "Unavailable")}${rail("Daily items / citations / sources / categories", daily ? `${daily.usable_item_count} / ${daily.citation_count} / ${daily.distinct_source_count} / ${daily.category_count}` : "Unavailable")}${rail("Weekly baseline gate", weekly ? qualityLabelEn(weekly) : "Unavailable")}${rail("Weekly items / citations / sources / categories", weekly ? `${weekly.usable_item_count} / ${weekly.citation_count} / ${weekly.distinct_source_count} / ${weekly.category_count}` : "Unavailable")}</dl></section>`;
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

function coveragePanelEn(snapshot: Snapshot) {
  return `<section class="panel"><div class="section-heading"><h2>Public data coverage</h2></div><dl class="rail">${rail("Dataset", "Public read-only")}${rail("Sources total", snapshot.coverage.sources_total)}${rail("Automated eligible", snapshot.coverage.automated_eligible_sources)}${rail("Attempted", snapshot.coverage.attempted_sources)}${rail("Sources with public items", snapshot.coverage.sources_with_public_items ?? "Unavailable")}${rail("Public store signals", snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items)}${rail("Displayed safe signals", snapshot.radar_items.length)}${rail("Rows withheld from display", Math.max(0, (snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items) - snapshot.radar_items.length))}${rail("Failed / skipped", snapshot.coverage.failed_sources + snapshot.coverage.skipped_sources)}${rail("Source visibility", snapshot.coverage.source_public_visibility === null ? "Unavailable" : formatPercent(snapshot.coverage.source_public_visibility))}${rail("Radar visibility", snapshot.coverage.radar_to_public_visibility === null ? "Unavailable" : formatPercent(snapshot.coverage.radar_to_public_visibility))}${rail("Evidence through", formatDateEn(snapshot.coverage.latest_refresh))}${rail("Snapshot generated", formatDateEn(snapshot.generated_at))}</dl>${Object.keys(snapshot.coverage.failure_families ?? {}).length > 0 ? `<div class="distribution">${distributionEn("Failures, warnings and exclusions", Object.entries(snapshot.coverage.failure_families ?? {}))}</div>` : ""}</section>`;
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

function englishEvidenceLimits(snapshot: Snapshot) {
  return [
    `The public snapshot contains ${snapshot.event_count} event clusters and ${snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items} visible signals; it is not a claim of complete market coverage.`,
    `${snapshot.source_health_summary.manual_blocked} sources require manual handling or are blocked from automated crawling.`,
    `${snapshot.source_health_summary.failed} attempted sources failed in the latest audited refresh, with aggregate reasons shown in Source health.`,
    "Private raw text, provider metadata, service credentials, internal notes and operational logs are excluded.",
    "Single-source events and needs-review signals should not be presented as confirmed facts."
  ];
}

function freshnessAlertEn(snapshot: Snapshot, suffix = "") {
  const latest = snapshot.freshness?.latest_timestamp;
  if (!latest) {
    const message = `No verifiable evidence timestamp is available. Treat this surface as a historical evidence index, not a live industry feed.${suffix ? ` ${suffix}` : ""}`;
    return `<section class="freshness-alert"><strong>Evidence freshness</strong><p>${escapeHtml(message)}</p></section>`;
  }
  const ageDays = snapshotAgeDays(snapshot);
  if (ageDays !== null && ageDays <= 2) return "";
  const message = `The latest public evidence is from ${formatDateEn(latest)}${ageDays === null ? "" : `, about ${ageDays} day${ageDays === 1 ? "" : "s"} before this snapshot`}. This is not complete live AI industry coverage.${suffix ? ` ${suffix}` : ""}`;
  return `<section class="freshness-alert"><strong>Evidence freshness</strong><p>${escapeHtml(message)}</p></section>`;
}

function formatDateEn(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("en-US", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short", timeZone: "UTC", year: "numeric" }).format(date)} UTC`;
}

function sourceLabelEn(value?: string | null) {
  if (!value) return "Public data source";
  if (value.startsWith("supabase_") || value.startsWith("public_")) return "Public structured data";
  if (value === "local_generated_files") return "Locally generated public snapshot";
  if (value === "local_seed_data") return "Seed data";
  if (value.startsWith("local_")) return "Local data";
  return value.replace(/_/g, " ");
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

function modeLabelEn(mode: string) {
  const labels: Record<string, string> = { local_preview: "Local preview", saved_candidate: "Saved candidate", saved_report: "Saved report" };
  return labels[mode] ?? mode.replace(/_/g, " ");
}

function qualityLabelEn(report: SnapshotReport) {
  return report.quality_gate_passed ? "Baseline evidence gate passed" : "More evidence needed";
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

function shell(snapshot: Snapshot, current: "home" | "radar" | "entities" | "reports" | "ask" | "write", depth: 0 | 1 | 2, title: string, body: string) {
  const prefix = depth === 0 ? "" : depth === 1 ? "../" : "../../";
  const chineseHref = current === "home" ? `${prefix}index.html` : `${prefix}${current}/`;
  const englishHref = current === "home" ? `${prefix}en/` : `${prefix}en/${current}/`;
  const nav = [
    ["home", curatedWindowIsCurrent(snapshot) ? "今日" : "本轮", `${prefix}index.html`],
    ["radar", "雷达", `${prefix}radar/`],
    ["entities", "实体", `${prefix}entities/`],
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
    <link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
    <link rel="alternate" hreflang="zh-CN" href="${escapeAttr(chineseHref)}">
    <link rel="alternate" hreflang="en" href="${escapeAttr(englishHref)}">
    <link rel="stylesheet" href="${prefix}assets/styles.css">
  </head>
  <body${current === "home" ? ' class="home-page"' : ""}>
    <header class="site-header">
      <a class="brand" href="${prefix}index.html"><span class="brand-mark"></span><span>AI 行业雷达</span></a>
      <div class="header-tools">
        <nav aria-label="主导航">
          ${nav.map(([id, label, href]) => `<a${id === current ? ' aria-current="page"' : ""} href="${escapeAttr(href)}">${escapeHtml(label)}</a>`).join("")}
        </nav>
        <div class="language-switch" aria-label="语言">
          <a aria-current="true" href="${escapeAttr(chineseHref)}">中文</a>
          <a lang="en" href="${escapeAttr(englishHref)}">EN</a>
        </div>
      </div>
    </header>
    <main>${body}</main>
    <footer class="site-footer">
      <span>生成时间 ${escapeHtml(formatDate(snapshot.generated_at))}</span>
      <span>公开只读雷达快照。参考动态应用：<a href="${escapeAttr(snapshot.reference_app_url)}">${escapeHtml(snapshot.reference_app_url)}</a></span>
    </footer>
    <script>${languageSwitchStateScript()}</script>
  </body>
</html>`;
}

function renderEventCard(event: SnapshotEvent, snapshot: Snapshot) {
  const search = [
    event.canonical_title,
    event.summary_zh,
    event.category,
    event.event_score_label,
    event.source_families.join(" "),
    event.related_entities.join(" "),
    event.citations.map((citation) => citation.source_name).join(" ")
  ].join(" ").toLowerCase();
  const sourceCount = eventConfirmationFilterValue(event);

  const freshness = freshnessBucket(event.latest_seen_at);
  return `<article class="event-card" data-category="${escapeAttr(`${event.category} ${labelize(event.category)}`)}" data-family="${escapeAttr(event.source_families.join(" "))}" data-freshness="${freshness}" data-score="${escapeAttr(event.event_score_label)}" data-search="${escapeAttr(search)}" data-source-count="${sourceCount}" data-status="${escapeAttr(eventStatus(event, snapshot))}">
    <div class="pill-row">
      ${pill(event.event_score_label, eventScoreTone(event.event_score_label))}
      ${pill(eventConfirmationLabel(event), eventConfirmationTone(event))}
      ${pill(freshnessLabel(freshness), freshness === "archive" ? "caution" : "neutral")}
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
      ${rail("产业影响", eventImpactNote(event))}
      ${rail("观察点", eventWatchNote(event))}
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

function renderFeaturedEventCard(event: SnapshotEvent) {
  const freshness = freshnessBucket(event.latest_seen_at);
  return `<article class="featured-card">
    <div class="featured-main">
      <div class="pill-row">
        ${pill(event.event_score_label, eventScoreTone(event.event_score_label))}
        ${pill(eventConfirmationLabel(event), eventConfirmationTone(event))}
        ${pill(freshnessLabel(freshness), freshness === "24h" ? "success" : "caution")}
        ${pill(`${event.source_count} 个来源`, event.source_count > 1 ? "success" : "caution")}
        ${event.source_families.slice(0, 2).map((family) => pill(family, "neutral")).join("")}
      </div>
      <h2>${escapeHtml(event.canonical_title)}</h2>
      <p>${escapeHtml(publicText(event.summary_zh))}</p>
      <dl class="event-meta">
        ${rail("为什么重要", eventImpactNote(event))}
        ${rail("下一步观察", eventWatchNote(event))}
      </dl>
    </div>
    <aside>
      <dl class="rail compact-rail">
        ${rail("分数", String(event.event_score))}
        ${rail("最新", formatDate(event.latest_seen_at))}
        ${rail("引用", String(event.citations.length))}
      </dl>
      ${event.citations[0] ? `<a class="source-link" href="${escapeAttr(event.citations[0].url)}">${escapeHtml(event.citations[0].source_name)}</a>` : ""}
    </aside>
  </article>`;
}

function readerCategoryCards(snapshot: Snapshot) {
  return readerCategoryCounts(snapshot)
    .map(
      (category) => `<a class="event-card" href="radar/${category.query ? `?category=${encodeURIComponent(category.query)}` : ""}">
        <div class="pill-row">${pill(`${category.count} 条`, category.count > 0 ? "success" : "neutral")}</div>
        <h2>${escapeHtml(category.label)}</h2>
        <p>${escapeHtml(category.description)}</p>
      </a>`
    )
    .join("");
}

function readerBriefing(snapshot: Snapshot) {
  const highPriority = snapshot.curated_events.filter((event) => event.event_score_label === "高优先级").length;
  const sameFamily = snapshot.event_clusters.filter((event) => event.source_count > 1 && event.source_families.length === 1).length;
  const crossFamily = snapshot.event_clusters.filter((event) => event.source_count > 1 && event.source_families.length > 1).length;
  const formalReports = snapshot.reports.filter(isFormalSnapshotReport).length;
  const evidenceDrafts = snapshot.reports.length - formalReports;
  const staleNote = snapshotIsStale(snapshot)
    ? "当前不是实时今日视图，适合做趋势复盘和线索筛查，不适合当作完整实时新闻流。"
    : "当前可作为今日公开证据视图，但仍应以来源和引用为准。";

  return [
    `${snapshot.event_count} 个事件中，${highPriority} 个为高优先级；优先阅读 Top 3，并先核对来源家族。`,
    `跨家族多源报道 ${crossFamily} 个，同家族多源复述 ${sameFamily} 个；来源家族不同不等于来源独立，单源事件应等待第二来源或官方补充。`,
    `正式报告 ${formalReports} 份，证据草稿 ${evidenceDrafts} 份；结论只从正式报告读取，草稿用于判断缺口。`,
    staleNote
  ];
}

function readerCategoryCounts(snapshot: Snapshot) {
  return [
    {
      count: snapshot.event_count,
      description: "先看 Top 3、事件层和来源家族覆盖。",
      label: "热点",
      query: ""
    },
    {
      count: countItemsByCategories(snapshot, ["model_release", "benchmark"]),
      description: "模型发布、基准和能力边界。",
      label: "模型",
      query: "model_release,benchmark"
    },
    {
      count: countItemsByCategories(snapshot, ["agent", "product_update"]),
      description: "Agent、产品更新和工作流变化。",
      label: "产品/Agent",
      query: "agent,product_update"
    },
    {
      count: countItemsByCategories(snapshot, ["open_source", "infrastructure"]),
      description: "开源项目、开发者工具和基础设施。",
      label: "开发者/开源",
      query: "open_source,infrastructure"
    },
    {
      count: countItemsByCategories(snapshot, ["research"]),
      description: "论文、研究路线和早期技术信号。",
      label: "论文/技术",
      query: "research"
    },
    {
      count: countItemsByCategories(snapshot, ["business", "funding", "regulation", "safety"]),
      description: "商业、融资、监管和安全风险。",
      label: "商业/政策",
      query: "business,funding,regulation,safety"
    }
  ];
}

function countItemsByCategories(snapshot: Snapshot, categories: string[]) {
  const targets = new Set(categories);
  return snapshot.radar_items.filter((item) => item.categories.some((category) => targets.has(category))).length;
}

function categoryFilterValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function renderEventMini(event: SnapshotEvent) {
  const primaryCitation = event.citations[0];
  return `<article class="event-mini">
    ${pill(event.event_score_label, eventScoreTone(event.event_score_label))}
    <strong>${escapeHtml(event.canonical_title)}</strong>
    <span>${escapeHtml(`${event.source_count} 个来源 / ${event.source_families.length} 个来源家族 / ${event.related_item_ids.length} 条信号`)}</span>
    <small>${escapeHtml(`产业影响：${eventImpactNote(event)}；下一步：${eventWatchNote(event)}`)}</small>
    ${primaryCitation ? `<a class="source-link" href="${escapeAttr(primaryCitation.url)}">主证据：${escapeHtml(primaryCitation.source_name)} · ${escapeHtml(formatDate(primaryCitation.published_at ?? primaryCitation.collected_at))}</a>` : ""}
  </article>`;
}

function renderEventMiniEn(event: SnapshotEvent, snapshot: Snapshot) {
  const primaryCitation = event.citations[0];
  return `<article class="event-mini">
    ${pill(eventScoreLabelEn(event.event_score_label), eventScoreTone(event.event_score_label))}
    <strong>${escapeHtml(eventEnglishTitle(event, snapshot))}</strong>
    <span>${escapeHtml(`${countNounEn(event.source_count, "source")} / ${countNounEn(event.source_families.length, "source family", "source families")} / ${countNounEn(event.related_item_ids.length, "signal")}`)}</span>
    <small>${escapeHtml(`Decision relevance: ${eventImpactNoteEn(event)} Next check: ${eventWatchNoteEn(event)}`)}</small>
    ${primaryCitation ? `<a class="source-link" href="${escapeAttr(primaryCitation.url)}">Primary evidence: ${escapeHtml(primaryCitation.source_name)} · ${escapeHtml(formatDateEn(primaryCitation.published_at ?? primaryCitation.collected_at))}</a>` : ""}
  </article>`;
}

function countNounEn(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function eventImpactNote(event: SnapshotEvent) {
  const text = `${event.canonical_title} ${event.summary_zh} ${event.category} ${event.source_families.join(" ")}`.toLowerCase();
  const entity = primaryEventEntity(event);
  const evidence = eventEvidenceProfile(event);
  const category = eventDecisionCategory(event, text);

  if (category === "benchmark") {
    return `${entity} 的外部评价或基准信号正在变化，适合用来校准采购 shortlist、竞品位置和能力叙事；当前证据强度：${evidence}。`;
  }

  if (category === "business") {
    return `${entity} 出现企业落地或组织采用信号，重点影响采购案例、合规部署和同类客户转化；当前证据强度：${evidence}。`;
  }

  if (category === "model_release") {
    return `${entity} 的版本或模型能力边界发生变化，可能影响升级节奏、兼容性测试和下游能力评估；当前证据强度：${evidence}。`;
  }

  if (category === "product_update") {
    return `${entity} 的产品/API 表面发生变化，优先评估开发者迁移成本、接口兼容性和治理能力；当前证据强度：${evidence}。`;
  }

  if (category === "open_source") {
    return `${entity} 的开源或 SDK 生态出现更新，可能改变工程团队依赖版本、部署路径和集成风险；当前证据强度：${evidence}。`;
  }

  if (category === "agent") {
    return `${entity} 相关智能体或工作流版图出现变化，重点观察产品整合、能力迁移和生态入口变化；当前证据强度：${evidence}。`;
  }

  if (category === "research") {
    return `${entity} 相关研究信号可能影响技术路线或评测方法，适合跟踪是否被产品、开源实现或基准采用；当前证据强度：${evidence}。`;
  }

  if (category === "infrastructure") {
    return `${entity} 指向基础设施、工具链或部署依赖变化，可能影响工程稳定性、运维成本和集成路径；当前证据强度：${evidence}。`;
  }

  if (category === "safety") {
    return `${entity} 出现安全、风险或治理相关信号，适合评估是否改变使用边界、审核要求和组织责任；当前证据强度：${evidence}。`;
  }

  if (category === "regulation") {
    return `${entity} 涉及政策或监管环境变化，可能影响合规优先级、市场进入节奏和产品责任边界；当前证据强度：${evidence}。`;
  }

  if (category === "opinion") {
    return `${entity} 当前更像观点、访谈或社区叙事信号，价值在于提示关注方向，而不是直接形成事实结论；当前证据强度：${evidence}。`;
  }

  return `${entity} 出现新的公开产业信号，适合先作为观察项，等待更多来源确认后再上升为趋势判断；当前证据强度：${evidence}。`;
}

function eventWatchNote(event: SnapshotEvent) {
  const text = `${event.canonical_title} ${event.summary_zh} ${event.category}`.toLowerCase();
  const entity = primaryEventEntity(event);
  const category = eventDecisionCategory(event, text);
  const sourceAction =
    event.source_count <= 1
      ? "补第二来源或官方原文"
      : event.source_families.length <= 1
        ? "补充跨家族报道并核实独立性"
        : "观察多来源叙事是否收敛";
  const citationAction = event.citations.length <= 1 ? "补引用链" : "对比引用间是否有冲突";

  if (category === "benchmark") {
    return `${sourceAction}，并核查 ${entity} 的评价口径、样本范围和竞品对照，避免把营销评级当能力结论。`;
  }

  if (category === "business") {
    return `${sourceAction}，再看部署范围、付费席位、治理限制和后续客户案例，确认是否从试点变成规模采用。`;
  }

  if (category === "model_release") {
    return `${sourceAction}，再检查 release notes、破坏性变更、性能样例和社区 issue，确认是否值得升级。`;
  }

  if (category === "product_update") {
    return `${sourceAction}，再看迁移指南、示例代码、弃用项和安全/审核能力是否影响现有集成。`;
  }

  if (category === "open_source") {
    return `${sourceAction}，再看 changelog、依赖兼容、issue 反馈和采用速度，避免只按版本号判断重要性。`;
  }

  if (category === "agent") {
    return `${sourceAction}，再跟踪产品整合时间线、团队/技术迁移和是否影响现有开发者入口。`;
  }

  if (category === "research") {
    return `${sourceAction}，再看是否有代码、复现实验、基准引用或产品吸收，避免把早期论文直接当产业趋势。`;
  }

  if (category === "infrastructure") {
    return `${sourceAction}，再看部署文档、兼容矩阵、稳定性记录和迁移成本，确认是否会影响现有技术栈。`;
  }

  if (category === "safety") {
    return `${sourceAction}，再核查风险定义、缓解措施、评测口径和责任边界，避免把安全声明当作已验证能力。`;
  }

  if (category === "regulation") {
    return `${sourceAction}，再确认司法辖区、执行时间线、适用对象和合规成本，避免把政策信号误读为即时产品变化。`;
  }

  if (category === "opinion") {
    return `${sourceAction}，再看是否出现官方路线图、产品动作或独立事实来源，避免把观点热度当作趋势证据。`;
  }

  if (event.source_count <= 1) {
    return `${sourceAction}，同时${citationAction}，再决定是否扩大解读。`;
  }

  if (event.source_families.length <= 1) {
    return `${sourceAction}，同时跟踪 ${entity} 相关实体是否出现后续动作。`;
  }

  return `继续跟踪时间线、引用来源变化和 ${entity} 相关实体的新动作。`;
}

function primaryEventEntity(event: SnapshotEvent) {
  const title = event.canonical_title.toLowerCase();
  const normalizedTitle = entityMatchText(title);
  const titleTokens = meaningfulTitleTokens(title);
  const titleMatchedEntity = event.related_entities.find((entity) => {
    const normalized = entityMatchText(entity);
    return normalized.length >= 3 && normalizedTitle.includes(normalized);
  });

  if (titleMatchedEntity) {
    return entityDisplayLabel(publicText(titleMatchedEntity));
  }

  const tokenMatchedEntity = event.related_entities.find((entity) => {
    const normalized = entity.toLowerCase();
    return titleTokens.some((token) => token.length >= 4 && normalized.includes(token));
  });

  return entityDisplayLabel(tokenMatchedEntity ? publicText(tokenMatchedEntity) : labelize(event.category));
}

function primaryEventEntityEn(event: SnapshotEvent) {
  const entity = primaryEventEntity(event);
  if (entity === labelize(event.category)) return "This event";
  const originalEntity = event.related_entities.find((candidate) => entityDisplayLabel(candidate) === entity) ?? entity;
  const directIndex = event.canonical_title.toLowerCase().indexOf(originalEntity.toLowerCase());
  if (directIndex >= 0) return event.canonical_title.slice(directIndex, directIndex + originalEntity.length);
  return entityLabelEn(entity);
}

function entityMatchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ").replace(/\s+/g, " ").trim();
}

function eventDecisionCategory(event: SnapshotEvent, text: string) {
  if (/lawsuit|litigation|sues?|court|antitrust|copyright|知识产权|诉讼|起诉|法院|监管|政策/.test(text)) return "regulation";
  if (/vulnerabilit|exploit|breach|prompt injection|安全|漏洞|攻击|泄露/.test(text)) return "safety";

  switch (event.category) {
    case "agent":
    case "benchmark":
    case "business":
    case "model_release":
    case "open_source":
    case "product_update":
    case "research":
      return event.category;
    case "funding":
      return "business";
    case "infrastructure":
    case "tooling":
      return "infrastructure";
    case "media_interview":
    case "opinion":
      return "opinion";
    case "policy":
    case "regulation":
      return "regulation";
    case "safety":
      return "safety";
    case "other":
      return "other";
  }

  if (/benchmark|基准|leader|gartner|评测|ranking/.test(text)) return "benchmark";
  if (/sdk|api|moderation|responses|tool|工具/.test(text)) return "product_update";
  if (/github|开源|repository|transformers|pydantic/.test(text)) return "open_source";
  if (/agent|智能体|codex|acquire|收购|workflow/.test(text)) return "agent";
  if (/research|paper|arxiv|论文|研究/.test(text)) return "research";
  if (/release|发布|版本|v\d|model|模型/.test(text)) return "model_release";
  if (/enterprise|企业|employee|员工|采购|rollout|部署|business|融资/.test(text)) return "business";

  return "other";
}

function entityDisplayLabel(value: string) {
  const aliases: Record<string, string> = {
    apple: "Apple",
    anthropic: "Anthropic",
    github: "GitHub",
    "gpt 5 6": "GPT-5.6",
    "hugging face": "Hugging Face",
    "hugging face transformers": "Hugging Face Transformers",
    "llama cpp": "llama.cpp",
    microsoft: "Microsoft",
    "microsoft 365 copilot": "Microsoft 365 Copilot",
    openai: "OpenAI",
    "openai python sdk": "OpenAI Python SDK",
    vllm: "vLLM",
    "vllm project vllm": "vLLM"
  };
  return aliases[value.trim().toLowerCase()] ?? value;
}

function meaningfulTitleTokens(title: string) {
  const stopwords = new Set(["发布", "版本", "brings", "named", "leader", "enterprise", "employees", "release", "version", "before", "after", "model", "behavior"]);
  return title
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 3 && !stopwords.has(token));
}

function eventEvidenceProfile(event: SnapshotEvent) {
  const sourceProfile =
    event.source_count > 1
      ? `${event.source_count} 个来源`
      : "单来源";
  const familyProfile =
    event.source_families.length > 1
      ? `${event.source_families.length} 类来源`
      : event.source_families[0] ?? "来源类型待补";
  const citationProfile = event.citations.length > 1 ? `${event.citations.length} 条引用` : "1 条引用";

  return `${sourceProfile} / ${familyProfile} / ${citationProfile}`;
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
    <p>${escapeHtml(publicText(insight.reasons[0] ?? "需要继续观察公开证据变化。"))}</p>
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
        <a href="${escapeAttr(snapshot.reference_app_url.replace(/\/$/, ""))}/entities/${encodeURIComponent(entityRouteId(entity))}">可选动态参考</a>
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
      ${item.why_it_matters ? `<p class="note"><strong>为什么重要：</strong> ${escapeHtml(publicText(item.why_it_matters))}</p>` : ""}
      <div class="pill-row">${item.categories.map((category) => pill(labelize(category), "evidence")).join("")}${item.tags.slice(0, 4).map((tag) => pill(tag, "neutral")).join("")}</div>
    </div>
    <dl>${rail("来源", item.source_name)}${rail("时间", formatDate(item.published_at ?? item.collected_at ?? item.processed_at))}${rail("层级", item.source_tier)}</dl>
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
  return encodeURIComponent(entityRouteId(entity)).replace(/%/g, "_");
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

function renderRadarItem(item: SnapshotItem) {
  const family = sourceFamily(item);
  const search = [item.title, item.source_name, item.status, item.categories.join(" "), item.tags.join(" "), item.summary_en, item.summary_zh].join(" ").toLowerCase();
  const timestampLabel = item.published_at ? "发布时间" : item.collected_at ? "采集时间" : "处理时间";
  const timestamp = item.published_at ?? item.collected_at ?? item.processed_at;
  const freshness = freshnessBucket(timestamp);

  return `<article class="radar-row" data-category="${escapeAttr(`${item.categories.join(" ")} ${item.categories.map(labelize).join(" ")}`)}" data-family="${escapeAttr(family)}" data-freshness="${freshness}" data-search="${escapeAttr(search)}" data-status="${escapeAttr(item.status)}">
    <div>
      <div class="pill-row">${pill(statusLabel(item.status), statusTone(item.status))}${pill(family, "neutral")}${pill(`综合 ${item.scores.overall.toFixed(2)}`, "evidence")}${pill(`置信度 ${formatPercent(item.confidence)}`, "success")}</div>
      <h2><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></h2>
      <p>${escapeHtml(item.summary_zh || item.summary_en || "暂无公开摘要。")}</p>
      ${item.why_it_matters ? `<p class="note"><strong>为什么重要：</strong> ${escapeHtml(publicText(item.why_it_matters))}</p>` : ""}
      <div class="pill-row">${item.categories.map((category) => pill(labelize(category), "evidence")).join("")}${item.tags.slice(0, 5).map((tag) => pill(tag, "neutral")).join("")}</div>
    </div>
    <aside><dl class="rail">${rail("来源", item.source_name)}${rail("层级", item.source_tier)}${rail(timestampLabel, formatDate(timestamp))}${rail("处理时间", formatDate(item.processed_at))}</dl><a class="source-link" href="${escapeAttr(item.url)}">打开引用</a></aside>
  </article>`;
}

function renderCitation(item: SnapshotItem) {
  return `<a class="citation" href="${escapeAttr(item.url)}"><span>${escapeHtml(item.source_name)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(formatDate(item.published_at ?? item.collected_at))}</small></a>`;
}

function renderCompactReport(report: SnapshotReport) {
  const publicationLabel = isFormalSnapshotReport(report) ? "正式报告" : "证据草稿";
  const publicationTone = isFormalSnapshotReport(report) ? "success" : "caution";

  return `<article class="compact-row">
    <div>${pill(reportTypeLabel(report.report_type), "evidence")}${pill(publicationLabel, publicationTone)}${qualityPill(report)}${pill(statusLabel(report.status), statusTone(report.status))}${pill(modeLabel(report.mode), "neutral")}<h3>${escapeHtml(publicText(report.title))}</h3><p>${escapeHtml(publicText(report.summary))}</p></div>
    <dl>${rail("可用条目", String(report.usable_item_count ?? report.source_item_count))}${rail("引用数", String(report.citation_count ?? report.citations.length))}${rail("来源/类别", `${report.distinct_source_count ?? 0} / ${report.category_count ?? 0}`)}${rail("保存时间", formatDate(report.saved_at ?? report.generated_at))}</dl>
  </article>`;
}

function isFormalSnapshotReport(report: SnapshotReport) {
  return report.mode === "saved_report" && (report.status === "reviewed" || report.status === "published");
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

function renderReport(report: SnapshotReport, snapshot: Snapshot, traceItems: RetrievalRadarItem[]) {
  const quality = report.report_type === "daily" ? snapshot.report_quality_summary.daily : snapshot.report_quality_summary.weekly;
  const includedEvents = (quality?.top_event_ids ?? [])
    .map((id) => snapshot.event_clusters.find((event) => event.event_cluster_id === id))
    .filter((event): event is SnapshotEvent => Boolean(event));
  const corroboratedEvents = includedEvents.filter((event) => event.source_count > 1).length;
  const crossFamilyEvents = includedEvents.filter((event) => event.source_count > 1 && event.source_families.length > 1).length;
  const releaseReady = report.status !== "needs_review";
  const reportTraceDocument = snapshotReportTraceDocument(report);
  const traceability = reportEntityTraceability(reportTraceDocument, traceItems, 6);
  const sectionTraceability = reportSectionTraceability(reportTraceDocument, traceItems, 4);

  return `<article class="report-card">
    <div class="section-heading"><div><div class="pill-row">${pill(releaseReady ? "编辑控制发布" : "证据草稿，尚未发布就绪", releaseReady ? "success" : "caution")}${pill(reportTypeLabel(report.report_type), "evidence")}${qualityPill(report)}${pill(statusLabel(report.status), statusTone(report.status))}${pill(modeLabel(report.mode), "neutral")}${pill(`可用 ${report.usable_item_count ?? report.source_item_count}`, "neutral")}${pill(`引用 ${report.citation_count ?? report.citations.length}`, "neutral")}${pill(`来源 ${report.distinct_source_count ?? 0}`, "neutral")}${pill(`类别 ${report.category_count ?? 0}`, "neutral")}</div><h2>${escapeHtml(publicText(report.title))}</h2></div><span>${escapeHtml(formatDate(report.saved_at ?? report.generated_at))}</span></div>
    <p class="report-summary">${escapeHtml(publicText(report.summary))}</p>
    ${!report.quality_gate_passed && report.report_type === "daily" ? `<div class="callout warning"><strong>今日数据不足，需补充信源或等待下一轮刷新</strong></div>` : ""}
    ${report.executive_summary ? `<p>${escapeHtml(publicText(report.executive_summary))}</p>` : ""}
    <dl class="inline-defs">${rail("基础证据门", qualityLabel(report))}${rail("跨家族报道/同家族多源/单源事件", `${crossFamilyEvents} / ${Math.max(0, corroboratedEvents - crossFamilyEvents)} / ${Math.max(0, includedEvents.length - corroboratedEvents)}`)}${rail("发布就绪", report.status !== "needs_review" ? "由编辑状态控制" : "未就绪：来源独立性尚未建模，且仍待人工复核")}${rail("事件数", String(includedEvents.length))}${rail("可用/引用/来源/类别", `${report.usable_item_count ?? report.source_item_count} / ${report.citation_count ?? report.citations.length} / ${report.distinct_source_count ?? 0} / ${report.category_count ?? 0}`)}${rail("时间窗口", `${formatDate(report.time_window.start)} 至 ${formatDate(report.time_window.end)}`)}${rail("数据来源", sourceLabel(report.data_source))}${rail("缺失证据", String(report.missing_evidence.length))}</dl>
    ${includedEvents.length > 0 ? `<h3>纳入的精选事件</h3><div class="event-mini-list">${includedEvents.map(renderEventMini).join("")}</div>` : ""}
    ${renderReportTraceability(traceability, sectionTraceability)}
    ${!report.quality_gate_passed && report.quality_gate_reasons.length > 0 ? `<h3>为什么报告偏薄</h3>${noteList(report.quality_gate_reasons)}` : ""}
    ${report.sections.map((section, index) => renderReportSection(section, sectionTraceability[index])).join("")}
    ${report.citations.length > 0 ? `<div class="citation-grid">${report.citations.map(renderReportCitation).join("")}</div>` : ""}
    ${report.caveats.length > 0 ? `<h3>局限</h3>${noteList(report.caveats)}` : ""}
    ${report.missing_evidence.length > 0 ? `<h3>缺失证据</h3>${noteList(report.missing_evidence)}` : ""}
    <details class="markdown"><summary>Markdown 导出</summary><pre>${escapeHtml(markdownForReport(report))}</pre></details>
  </article>`;
}

function renderReportTraceability(
  traceability: ReturnType<typeof reportEntityTraceability>,
  sectionTraceability: ReportSectionTraceability[]
) {
  const coveredSections = sectionTraceability.filter((section) => section.entityTraces.length > 0).length;

  return `<section class="trace-panel">
    <div class="section-heading">
      <div>
        <h3>报告关联实体</h3>
        <p>这些实体由报告公开引用回溯到雷达证据后生成；静态页只显示公开字段。</p>
      </div>
      <div class="pill-row">${pill(`${traceability.evidenceItems.length} 条证据`, "evidence")}${pill(`${traceability.entityTraces.length} 个实体`, traceability.entityTraces.length > 0 ? "success" : "caution")}${pill(`${coveredSections}/${sectionTraceability.length} 章节覆盖`, coveredSections > 0 ? "success" : "caution")}</div>
    </div>
    ${
      traceability.entityTraces.length > 0
        ? `<div class="entity-link-list">${traceability.entityTraces
            .map((trace) => renderEntityTraceLink(trace))
            .join("")}</div>`
        : `<p class="note">当前报告没有可回溯到实体详情页的公开引用。</p>`
    }
  </section>`;
}

function renderReportSection(
  section: SnapshotReport["sections"][number],
  traceability: ReportSectionTraceability | undefined
) {
  return `<section class="report-section">
    <h3>${escapeHtml(publicText(section.title))}</h3>
    <p>${escapeHtml(publicText(section.summary))}</p>
    ${section.bullets.length > 0 ? noteList(section.bullets) : ""}
    ${traceability ? renderSectionTraceability(traceability) : ""}
  </section>`;
}

function renderSectionTraceability(traceability: ReportSectionTraceability) {
  return `<div class="section-trace">
    <div class="pill-row">${pill("章节实体覆盖", "evidence")}${pill(`${traceability.evidenceItems.length} 证据`, "neutral")}${pill(`${traceability.entityTraces.length} 实体`, traceability.entityTraces.length > 0 ? "success" : "caution")}${pill(`${traceability.needsReviewCount} 待复核`, traceability.needsReviewCount > 0 ? "caution" : "success")}</div>
    ${
      traceability.entityTraces.length > 0
        ? `<div class="entity-link-list compact">${traceability.entityTraces
            .map((trace) => renderEntityTraceLink(trace))
            .join("")}</div>`
        : `<p class="note">本章节引用暂未回溯到可展示实体；发布前需要补齐 citation id 或公开证据。</p>`
    }
  </div>`;
}

function renderEntityTraceLink(trace: ReturnType<typeof reportEntityTraceability>["entityTraces"][number]) {
  return `<a class="entity-chip" href="${escapeAttr(`../entities/${entityStaticSlug(trace.entity)}/`)}">
    <strong>${escapeHtml(trace.entity.name)}</strong>
    <span>${escapeHtml(`${trace.evidenceItemCount} 证据 / ${trace.sourceCount} 来源`)}</span>
  </a>`;
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

function latestReportsByType(snapshotOrReports: Snapshot | SnapshotReport[]) {
  const reports = Array.isArray(snapshotOrReports) ? snapshotOrReports : snapshotOrReports.reports;
  const reportsByType = new Map<string, SnapshotReport>();
  for (const report of [...reports].sort(compareSnapshotReports)) {
    if (!reportsByType.has(report.report_type)) {
      reportsByType.set(report.report_type, report);
    }
  }
  return Array.from(reportsByType.values());
}

function compareSnapshotReports(left: SnapshotReport, right: SnapshotReport) {
  const priority = reportDisplayPriority(right) - reportDisplayPriority(left);
  if (priority !== 0) {
    return priority;
  }

  return reportTime(right) - reportTime(left);
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

function freshnessBucket(timestamp: string) {
  const ageMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ageMs) || ageMs <= 86_400_000) return "24h";
  if (ageMs <= 604_800_000) return "7d";
  if (ageMs <= 2_592_000_000) return "30d";
  return "archive";
}

function freshnessLabel(bucket: string) {
  const labels: Record<string, string> = { "24h": "24 小时内", "7d": "2-7 天", "30d": "8-30 天", archive: "历史（30 天外）" };
  return labels[bucket] ?? bucket;
}

function freshnessLabelEn(bucket: string) {
  const labels: Record<string, string> = { "24h": "Within 24h", "7d": "2-7 days", "30d": "8-30 days", archive: "Archive (>30 days)" };
  return labels[bucket] ?? bucket;
}

function freshnessBuckets(items: SnapshotItem[], locale: "en" | "zh"): Array<[string, number]> {
  const counts = new Map<string, number>([["24h", 0], ["7d", 0], ["30d", 0], ["archive", 0]]);
  for (const item of items) {
    const bucket = freshnessBucket(item.published_at ?? item.collected_at ?? item.processed_at);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()].map(([bucket, count]) => [locale === "en" ? freshnessLabelEn(bucket) : freshnessLabel(bucket), count]);
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
        <h2>公开数据覆盖</h2>
      </div>
      <dl class="rail">
        ${coverageRailRows(snapshot)}
      </dl>
      ${Object.keys(snapshot.coverage.failure_families ?? {}).length > 0 ? `<div class="distribution">${distribution("失败/警告/排除（类别可重叠）", Object.entries(snapshot.coverage.failure_families ?? {}))}</div>` : ""}
    </section>
  `;
}

function reportCoveragePanel(snapshot: Snapshot, reports: SnapshotReport[]) {
  const daily = reports.find((report) => report.report_type === "daily");
  const weekly = reports.find((report) => report.report_type === "weekly");
  const formalReports = snapshot.reports.filter(isFormalSnapshotReport);
  const evidenceDrafts = snapshot.reports.filter((report) => !isFormalSnapshotReport(report));
  const missingEvidenceCount = reports.reduce((count, report) => count + report.missing_evidence.length, 0);
  const blockedDrafts = reports.filter((report) => !report.quality_gate_passed).length;
  const corroboratedEvents = snapshot.event_clusters.filter((event) => event.source_count > 1).length;
  const crossFamilyEvents = snapshot.event_clusters.filter((event) => event.source_count > 1 && event.source_families.length > 1).length;

  return `
    <section class="panel">
      <div class="section-heading">
        <h2>报告状态模型</h2>
      </div>
      ${noteList([
        "正式报告用于读取结论；草稿候选只说明证据已经被组织，但仍不能当作发布结论。",
        "基础证据门只衡量数量、引用、来源和类别广度，不代表每个事件都已独立交叉确认。",
        "同家族多条报道与跨家族多源报道分开展示；跨家族不等于来源独立，缺失证据决定下一步应补来源、补引用，还是缩小报告口径。"
      ])}
      <dl class="rail">
        ${rail("正式报告", String(formalReports.length))}
        ${rail("草稿候选", String(evidenceDrafts.length))}
        ${rail("质量未过草稿", String(blockedDrafts))}
        ${rail("缺失证据项", String(missingEvidenceCount))}
        ${rail("多条报道/跨家族报道/全部事件", `${corroboratedEvents} / ${crossFamilyEvents} / ${snapshot.event_count}`)}
        ${rail("发布就绪", formalReports.length > 0 ? "由编辑状态控制" : "未就绪：暂无正式报告")}
        ${rail("日报基础门", daily ? qualityLabel(daily) : "待补")}
        ${rail("日报证据/引用/来源/类别", `${daily?.usable_item_count ?? daily?.source_item_count ?? 0} / ${daily?.citation_count ?? daily?.citations.length ?? 0} / ${daily?.distinct_source_count ?? 0} / ${daily?.category_count ?? 0}`)}
        ${rail("周报基础门", weekly ? qualityLabel(weekly) : "待补")}
        ${rail("周报证据/引用/来源/类别", `${weekly?.usable_item_count ?? weekly?.source_item_count ?? 0} / ${weekly?.citation_count ?? weekly?.citations.length ?? 0} / ${weekly?.distinct_source_count ?? 0} / ${weekly?.category_count ?? 0}`)}
      </dl>
    </section>
  `;
}

function coverageRailRows(snapshot: Snapshot) {
  return [
    rail("公开数据集", "公开只读"),
    rail("来源总数", String(snapshot.coverage.sources_total)),
    rail("自动合格来源", String(snapshot.coverage.automated_eligible_sources)),
    rail("已尝试来源", String(snapshot.coverage.attempted_sources)),
    rail("有公开条目的来源", String(snapshot.coverage.sources_with_public_items ?? "待补")),
    rail("公开库条目", String(snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items)),
    rail("本站安全展示", String(snapshot.radar_items.length)),
    rail("未进入展示", String(Math.max(0, (snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items) - snapshot.radar_items.length))),
    rail("失败/跳过来源", String(snapshot.coverage.failed_sources + snapshot.coverage.skipped_sources)),
    rail("来源公开可见率", formatNullablePercent(snapshot.coverage.source_public_visibility)),
    rail("雷达公开可见率", formatNullablePercent(snapshot.coverage.radar_to_public_visibility)),
    rail("证据截至", formatDate(snapshot.coverage.latest_refresh)),
    rail("快照生成", formatDate(snapshot.generated_at))
  ].join("");
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
      ${metric("失败源", health.failed)}
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

function metricMini(label: string, value: number | string | null) {
  return `<div class="mini-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value ?? "待补"))}</strong></div>`;
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

function modeLabel(mode: string) {
  const labels: Record<string, string> = {
    local_preview: "本地预览",
    saved_candidate: "已保存候选",
    saved_report: "已保存报告"
  };
  return labels[mode] ?? mode;
}

function qualityPill(report: SnapshotReport) {
  return pill(qualityLabel(report), report.quality_gate_passed ? "neutral" : "caution");
}

function qualityLabel(report: SnapshotReport) {
  return report.quality_gate_passed ? "基础证据门通过" : "需要更多数据";
}

function eventConfirmationLabel(event: SnapshotEvent) {
  if (event.source_count > 1 && event.source_families.length > 1) return "跨家族多源报道";
  if (event.source_count > 1) return "同家族多源复述";
  return "单源观察";
}

function eventConfirmationLabelEn(event: SnapshotEvent) {
  if (event.source_count > 1 && event.source_families.length > 1) return "Cross-family coverage";
  if (event.source_count > 1) return "Multiple reports, one family";
  return "Single-source observation";
}

function eventConfirmationFilterValue(event: SnapshotEvent) {
  if (event.source_count > 1 && event.source_families.length > 1) return "cross";
  if (event.source_count > 1) return "same";
  return "single";
}

function eventConfirmationTone(event: SnapshotEvent): "caution" | "evidence" | "success" {
  if (event.source_count > 1 && event.source_families.length > 1) return "success";
  return event.source_count > 1 ? "evidence" : "caution";
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

function formatNullablePercent(value: number | null) {
  return value === null ? "待补" : formatPercent(value);
}

function snapshotCuratedTitle(snapshot: Snapshot) {
  return curatedWindowIsCurrent(snapshot) ? "AI 行业雷达今日精选" : "AI 行业雷达今日精选：展示本轮回顾";
}

function snapshotWindowLabel(snapshot: Snapshot) {
  return curatedWindowIsCurrent(snapshot) ? "今天" : "本轮公开快照";
}

function snapshotPeriodLabel(snapshot: Snapshot) {
  return curatedWindowIsCurrent(snapshot) ? "过去 24 小时" : "最近可见窗口";
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
  return {
    product: "AI Industry Radar",
    release: "final-release-candidate-event-radar",
    commit_sha: process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local-build",
    generated_at: snapshot.generated_at,
    latest_evidence_at: snapshot.freshness.latest_timestamp,
    public_radar_items: snapshot.counts.public_radar_items ?? snapshot.counts.visible_radar_items,
    event_count: snapshot.event_count,
    source: snapshot.source.data_source
  };
}

function readerFacingCaveats(snapshot: Snapshot) {
  const filtered = snapshot.caveats
    .map(publicText)
    .filter((caveat) => !isRunLogCaveat(caveat));
  const runLogCount = snapshot.caveats.length - filtered.length;
  const summary =
    runLogCount > 0
      ? [`已折叠 ${runLogCount} 条数据刷新运行记录；读者页只保留数据来源、覆盖范围、限制和质量门禁摘要。`]
      : [];

  return [...summary, ...filtered];
}

function isRunLogCaveat(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("activation_") ||
    normalized.includes("live deepseek activation") ||
    normalized.includes("activation merge") ||
    normalized.includes("cloudflare pages") ||
    normalized.includes("service-role") ||
    normalized.includes("supabase public reads were unavailable") ||
    normalized.includes("public-safe cloudflare") ||
    normalized.includes("public-safe refresh") ||
    normalized.includes("public evidence refresh") ||
    normalized.includes("public evidence update contributed") ||
    normalized.includes("去重后新增") ||
    normalized.includes("本轮") ||
    normalized.includes("导出") ||
    normalized.includes("loaded 1 reviewed local public report snapshot")
  );
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
    const message = `当前公开证据没有可验证的新鲜度时间戳；请只把页面当作结构演示和历史证据检索。${suffix ? ` ${suffix}` : ""}`;
    return `<section class="freshness-alert"><strong>数据新鲜度提示</strong><p>${escapeHtml(message)}</p></section>`;
  }

  const latestDate = new Date(latest);
  if (Number.isNaN(latestDate.getTime())) return "";

  const ageDays = snapshotAgeDays(snapshot) ?? Math.max(0, Math.ceil((now.getTime() - latestDate.getTime()) / (24 * 60 * 60 * 1000)));
  if (ageDays <= 2) return "";

  const message = `当前公开证据最新到 ${formatDate(latest)}，距快照生成时间约 ${ageDays} 天；本页不能代表今日实时 AI 行业覆盖。${suffix ? ` ${suffix}` : ""}`;
  return `<section class="freshness-alert"><strong>数据新鲜度提示</strong><p>${escapeHtml(message)}</p></section>`;
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

function localEvidenceToolScript(
  mode: "ask" | "write",
  locale: "en" | "zh" = "zh",
  snapshotUrl = "../data/radar-snapshot.json"
) {
  return `
(function () {
  const toolMode = ${JSON.stringify(mode)};
  const language = ${JSON.stringify(locale)};
  const snapshotUrl = ${JSON.stringify(snapshotUrl)};
  const input = document.querySelector("#local-query-input");
  const button = document.querySelector("#local-query-run");
  const result = document.querySelector("#local-query-result");
  if (!input || !button || !result) return;

  function escapeHtml(value) {
    return String(value || "")
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

  function eventTitle(snapshot, event) {
    if (language === "en") return relatedItem(snapshot, event)?.title || event.timeline?.[0]?.title || event.canonical_title;
    return event.canonical_title;
  }

  function eventSummary(snapshot, event) {
    if (language !== "en") return event.summary_zh;
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
    const crossFamily = /cross[- ]family|multiple source families|independent source famil|跨(来源)?家族|独立来源家族/.test(q);
    const sameFamily = /same source family|one source family|同(来源)?家族|同家族.*复述/.test(q);
    return {
      agent: /agent|智能体|开发工具|developer tool|coding tool|工具链/.test(q),
      crossFamily,
      important: /rank|ranking|priority|important|selected events|top events|deeper analysis|worth a deeper|排序|重要|高优先级|精选|深度分析|行业观察|周报|提纲/.test(q),
      model: /model release|models? released|llm|api release|模型|发布/.test(q),
      multiSource: !crossFamily && !sameFamily && /multi[- ]source|multiple sources|多源/.test(q),
      sameFamily,
      singleSource: /single[- ]source|one source|单一来源|单源|弱信号|可信度较低|limited evidence/.test(q),
      sourceHealth: /source.*(fail|timeout|no new)|failed sources|source health|来源.*(失败|超时|没有新|无新)|来源健康/.test(q)
    };
  }

  function queryTokens(query) {
    const stopwords = new Set(["about", "against", "analysis", "and", "are", "around", "build", "draft", "events", "evidence", "from", "have", "into", "outline", "public", "report", "the", "this", "what", "which", "with", "write"]);
    const latin = (query.toLowerCase().match(/[a-z0-9][a-z0-9._+-]*/g) || [])
      .filter((token) => token.length >= 2 && !stopwords.has(token));
    const cjk = [];
    for (const run of query.match(/[\u3400-\u9fff]{2,}/g) || []) {
      if (run.length <= 4) cjk.push(run);
      for (let index = 0; index < run.length - 1; index += 1) cjk.push(run.slice(index, index + 2));
    }
    return Array.from(new Set(latin.concat(cjk)));
  }

  function matchesIntent(event, text, intent) {
    const sourceCount = Number(event.source_count || 0);
    const familyCount = Number((event.source_families || []).length);
    if (intent.crossFamily && !(sourceCount > 1 && familyCount > 1)) return false;
    if (intent.sameFamily && !(sourceCount > 1 && familyCount === 1)) return false;
    if (intent.multiSource && sourceCount <= 1) return false;
    if (intent.singleSource && sourceCount !== 1) return false;
    if (intent.model && !/模型|model|llm|api|release|发布/i.test(text)) return false;
    if (intent.agent && !/agent|智能体|developer|tool|工具|coding/i.test(text)) return false;
    return true;
  }

  function scoreEvent(snapshot, event, query, intent) {
    const q = query.toLowerCase();
    const text = textOf(snapshot, event);
    if (!matchesIntent(event, text, intent)) return null;

    let relevance = 0;
    let matched = intent.crossFamily || intent.sameFamily || intent.multiSource || intent.singleSource || intent.model || intent.agent || intent.important;
    const title = eventTitle(snapshot, event).toLowerCase();
    if ((title.length >= 6 && q.includes(title)) || (q.length >= 6 && title.includes(q))) {
      relevance += 80;
      matched = true;
    }
    for (const token of queryTokens(q)) {
      if (text.includes(token)) {
        relevance += token.length >= 5 ? 18 : 8;
        matched = true;
      }
    }
    if (!matched) return null;
    if (intent.crossFamily) relevance += 40;
    else if (intent.sameFamily || intent.multiSource) relevance += 26;
    if (intent.singleSource) relevance += 18;
    if (intent.model || intent.agent) relevance += 16;
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
    return merged
      .map((event) => ({ event, score: scoreEvent(snapshot, event, query, intent) }))
      .filter((entry) => entry.score !== null)
      .sort((left, right) => right.score - left.score || Number(right.event.event_score || 0) - Number(left.event.event_score || 0))
      .slice(0, 6)
      .map((entry) => entry.event);
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
      return '<h3>Source health answer</h3><p>Question: ' + escapeHtml(query) + '</p>' +
        '<p>Broad refresh audited through: ' + escapeHtml(auditedAt || "unavailable") + '.</p>' +
        '<dl class="inline-defs"><dt>Succeeded</dt><dd>' + escapeHtml(health.succeeded || 0) + '</dd><dt>Failed</dt><dd>' + escapeHtml(health.failed || 0) + '</dd><dt>Manual / blocked</dt><dd>' + escapeHtml(health.manual_blocked || 0) + '</dd><dt>No new items</dt><dd>' + escapeHtml(health.no_items || 0) + '</dd><dt>Duplicate only</dt><dd>' + escapeHtml(health.duplicate_only || 0) + '</dd></dl><h4>Named failed sources</h4><ul>' + (failedSources || '<li>None</li>') + '</ul><h4>Failures, warnings and exclusions</h4><ul>' + families + '</ul>';
    }
    return '<h3>来源健康回答</h3><p>问题：' + escapeHtml(query) + '</p>' +
      '<p>广泛刷新审计截至：' + escapeHtml(auditedAt || "待补") + '。</p>' +
      '<dl class="inline-defs"><dt>成功</dt><dd>' + escapeHtml(health.succeeded || 0) + '</dd><dt>失败</dt><dd>' + escapeHtml(health.failed || 0) + '</dd><dt>手动/阻塞</dt><dd>' + escapeHtml(health.manual_blocked || 0) + '</dd><dt>无新条目</dt><dd>' + escapeHtml(health.no_items || 0) + '</dd><dt>仅重复</dt><dd>' + escapeHtml(health.duplicate_only || 0) + '</dd></dl><h4>具名失败来源</h4><ul>' + (failedSources || '<li>无</li>') + '</ul><h4>失败、警告与排除</h4><ul>' + families + '</ul>';
  }

  function citationHtml(event) {
    return (event.citations || []).slice(0, 2).map((citation) =>
      '<a href="' + escapeHtml(citation.url) + '">' + escapeHtml(citation.source_name) + (language === "en" ? ': ' : '：') + escapeHtml(citation.title) + '</a>'
    ).join("<br>");
  }

  function renderAskResult(snapshot, query, events) {
    const freshness = snapshot.freshness && snapshot.freshness.latest_timestamp ? snapshot.freshness.latest_timestamp : (language === "en" ? "unavailable" : "待补证据");
    if (language === "en") {
      return '<h3>Public evidence answer</h3>' +
        '<p>Question: ' + escapeHtml(query) + '</p>' +
        '<p>Evidence boundary: this answer uses only the current public snapshot. Latest evidence: ' + escapeHtml(freshness) + '. It is not live web research.</p>' +
        '<ol>' + events.map((event) =>
          '<li><strong>' + escapeHtml(eventTitle(snapshot, event)) + '</strong><p>' + escapeHtml(eventSummary(snapshot, event)) + '</p>' +
          '<small>' + escapeHtml(scoreLabel(event)) + ' / score ' + escapeHtml(event.event_score) + ' / ' + escapeHtml(event.source_count) + (Number(event.source_count || 0) === 1 ? ' source / ' : ' sources / ') + escapeHtml(sourceFamilies(event).join(", ")) + '</small>' +
          '<div class="local-citations">' + citationHtml(event) + '</div></li>'
        ).join("") + '</ol>';
    }
    return '<h3>公开证据回答</h3>' +
      '<p>问题：' + escapeHtml(query) + '</p>' +
      '<p>证据边界：仅基于当前公开快照，最新证据时间 ' + escapeHtml(freshness) + '；结果不是实时联网回答。</p>' +
      '<ol>' + events.map((event) =>
        '<li><strong>' + escapeHtml(event.canonical_title) + '</strong><p>' + escapeHtml(event.summary_zh) + '</p>' +
        '<small>' + escapeHtml(event.event_score_label) + ' / 分数 ' + escapeHtml(event.event_score) + ' / ' + escapeHtml(event.source_count) + ' 个来源 / ' + escapeHtml((event.source_families || []).join("、")) + '</small>' +
        '<div class="local-citations">' + citationHtml(event) + '</div></li>'
      ).join("") + '</ol>';
  }

  function renderWriteResult(snapshot, query, events) {
    const freshness = snapshot.freshness && snapshot.freshness.latest_timestamp ? snapshot.freshness.latest_timestamp : (language === "en" ? "unavailable" : "待补证据");
    if (language === "en") {
      return '<h3>Evidence-led outline</h3>' +
        '<p>Request: ' + escapeHtml(query) + '</p>' +
        '<p>Opening judgment: this is an event observation based on a public snapshot. Latest evidence: ' + escapeHtml(freshness) + '. Do not make claims beyond this evidence window.</p>' +
        '<ol>' + events.slice(0, 4).map((event) =>
          '<li><strong>' + escapeHtml(eventTitle(snapshot, event)) + '</strong>' +
          '<p>Claim: ' + escapeHtml(eventSummary(snapshot, event)) + '</p>' +
          '<p>Evidence: ' + escapeHtml(event.source_count) + (Number(event.source_count || 0) === 1 ? ' source from ' : ' sources from ') + escapeHtml(sourceFamilies(event).join(", ")) + '.</p>' +
          '<p>Boundary: ' + (Number((event.source_families || []).length) > 1 ? 'Compare the different source families, but do not assume they are independent; one may repeat the original claim.' : Number(event.source_count || 0) > 1 ? 'Multiple reports come from one source family; independent confirmation is still needed.' : 'Independent confirmation is still needed.') + '</p>' +
          '<div class="local-citations">' + citationHtml(event) + '</div></li>'
        ).join("") + '</ol>' +
        '<p>Suggested close: frame single-source events as signals, same-family repetition as limited corroboration, and cross-family coverage as stronger evidence whose source independence still needs verification.</p>';
    }
    return '<h3>写作提纲</h3>' +
      '<p>需求：' + escapeHtml(query) + '</p>' +
      '<p>开头判断：这是一份基于公开快照的事件观察，最新证据时间 ' + escapeHtml(freshness) + '，不能写成超出证据时间窗的实时结论。</p>' +
      '<ol>' + events.slice(0, 4).map((event) =>
        '<li><strong>' + escapeHtml(event.canonical_title) + '</strong>' +
        '<p>论点：' + escapeHtml(event.summary_zh) + '</p>' +
        '<p>证据：' + escapeHtml(event.source_count) + ' 个来源，来源家族 ' + escapeHtml((event.source_families || []).join("、")) + '。</p>' +
        '<p>边界：' + escapeHtml((event.caveats || ["仍需补充独立来源确认。"]) [0]) + '</p>' +
        '<div class="local-citations">' + citationHtml(event) + '</div></li>'
      ).join("") + '</ol>' +
      '<p>建议收束：把单源事件写成待跟踪信号，同家族复述写成有限佐证；跨家族报道也必须注明来源独立性尚未验证。</p>';
  }

  async function run() {
    const query = input.value.trim();
    if (!query) {
      result.innerHTML = language === "en" ? '<p class="empty">Enter a question or writing request first.</p>' : '<p class="empty">先输入一个问题或写作需求。</p>';
      return;
    }
    result.innerHTML = language === "en" ? '<p class="note">Reading the public snapshot...</p>' : '<p class="note">正在读取公开快照...</p>';
    try {
      const response = await fetch(snapshotUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("snapshot unavailable");
      const snapshot = await response.json();
      const intent = queryIntent(query);
      if (toolMode === "ask" && intent.sourceHealth) {
        result.innerHTML = renderSourceHealthResult(snapshot, query);
        return;
      }
      const events = pickEvents(snapshot, query);
      result.innerHTML = events.length === 0
        ? (language === "en" ? '<p class="empty">No matching event was found in the public snapshot.</p>' : '<p class="empty">没有从公开快照中找到匹配事件。</p>')
        : (toolMode === "write" ? renderWriteResult(snapshot, query, events) : renderAskResult(snapshot, query, events));
    } catch {
      result.innerHTML = language === "en" ? '<p class="empty">The public snapshot could not be loaded. Try again later or open the JSON data directly.</p>' : '<p class="empty">公开快照读取失败，请稍后重试或直接打开数据文件。</p>';
    }
  }

  button.addEventListener("click", run);
})();
`;
}

function stylesheet() {
  return `:root {
  --bg: #f5f7fb;
  --ink: #111827;
  --muted: #5b6472;
  --line: #d9e0ea;
  --panel: #ffffff;
  --soft: #eef3f8;
  --evidence: #0f766e;
  --success: #18703e;
  --caution: #a15c07;
  --shadow: 0 14px 38px rgba(15, 23, 42, 0.08);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Arial, Helvetica, sans-serif; line-height: 1.5; }
a { color: var(--evidence); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
.panel p a, .note-list a, .local-result a, .report-card p a { text-decoration: underline; text-underline-offset: 3px; }
.site-header, .site-footer, main { margin: 0 auto; max-width: 1180px; padding: 0 20px; width: 100%; }
.site-header { align-items: center; display: flex; gap: 20px; justify-content: space-between; padding-bottom: 20px; padding-top: 20px; }
.brand { align-items: center; color: var(--ink); display: inline-flex; font-weight: 700; gap: 10px; }
.brand-mark { background: linear-gradient(135deg, #0f766e, #2563eb); border-radius: 6px; display: inline-block; height: 26px; width: 26px; }
.header-tools { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
.language-switch { border: 1px solid var(--line); border-radius: 6px; display: grid; flex: 0 0 auto; grid-template-columns: repeat(2, minmax(38px, auto)); overflow: hidden; }
.language-switch a { color: var(--muted); font-size: 12px; font-weight: 700; min-width: 42px; padding: 8px 9px; text-align: center; }
.language-switch a + a { border-left: 1px solid var(--line); }
.language-switch a[aria-current="true"] { background: var(--ink); color: #fff; }
nav, .actions, .pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
nav a, .button { border: 1px solid var(--line); border-radius: 6px; color: var(--ink); display: inline-flex; font-size: 14px; font-weight: 700; padding: 9px 12px; }
nav a[aria-current="page"], .button.primary { background: var(--ink); border-color: var(--ink); color: #fff; }
main { display: grid; gap: 24px; padding-bottom: 42px; }
main > *, .tab-panel, .panel { min-width: 0; }
.home-page main > * { order: 4; }
.home-page .home-status-strip { order: 1; }
.home-page .home-freshness-alert { order: 2; }
.home-page .home-desk { order: 3; }
.status-strip { display: grid; gap: 10px; grid-template-columns: repeat(6, minmax(0, 1fr)); }
.freshness-alert { background: #fff8ed; border: 1px solid #f0c37b; border-radius: 8px; color: var(--caution); display: grid; gap: 4px; padding: 14px 16px; }
.freshness-alert p { color: #7c3f09; }
.mini-metric { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 4px; padding: 12px; }
.mini-metric span { color: var(--muted); font-size: 12px; font-weight: 700; }
.mini-metric strong { color: var(--ink); font-size: 18px; overflow-wrap: anywhere; }
.hero, .page-heading { border-bottom: 1px solid var(--line); display: grid; gap: 24px; grid-template-columns: minmax(0, 1fr) 400px; padding: 24px 0 32px; }
.page-heading { grid-template-columns: 1fr; }
.event-hero { align-items: stretch; }
.home-desk { align-items: stretch; display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr) 360px; }
.headline-panel, .ops-console { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 22px; }
.headline-panel { display: grid; gap: 16px; }
.ops-console { align-content: start; display: grid; gap: 16px; }
.featured-list { display: grid; gap: 10px; margin-top: 2px; }
.featured-card { background: #fbfdff; border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr) 190px; padding: 14px; }
.featured-card h2 { font-size: 18px; line-height: 1.35; }
.featured-card p { color: var(--muted); margin-top: 6px; }
.featured-card aside { border-left: 1px solid var(--line); padding-left: 14px; }
.rail.compact-rail { grid-template-columns: 64px minmax(0, 1fr); }
.quality-note { background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.quality-note p { color: var(--muted); margin-top: 4px; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: 52px; letter-spacing: 0; line-height: 1.05; margin-top: 14px; }
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
.event-mini small, .event-mini .source-link { grid-column: 2 / -1; }
.timeline-list { display: grid; gap: 10px; }
.timeline-list.compact { margin-top: 10px; }
.timeline-row { border: 1px solid var(--line); border-radius: 8px; color: var(--ink); display: grid; gap: 6px; grid-template-columns: 170px minmax(0, 1fr) 160px; padding: 12px; }
.timeline-row strong, .citation strong { overflow-wrap: anywhere; }
.timeline-row time, .timeline-row span { color: var(--muted); font-size: 13px; }
.callout { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }
.callout.warning { background: #fff5e6; border-color: #f0c37b; color: var(--caution); }
.compact-row p, .radar-row p, .note, .note-list, .site-footer { color: var(--muted); }
.tag-block, .distribution { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.distribution section { border: 1px solid var(--line); border-radius: 8px; flex: 1 1 220px; padding: 12px; }
.health-table-wrap { border: 1px solid var(--line); border-radius: 8px; margin-top: 16px; max-width: 100%; min-width: 0; overflow-x: auto; width: 100%; }
.health-table { border-collapse: collapse; font-size: 12px; min-width: 1160px; width: 100%; }
.health-table caption { color: var(--muted); padding: 12px; text-align: left; }
.health-table th, .health-table td { border-top: 1px solid var(--line); padding: 9px 10px; text-align: right; white-space: nowrap; }
.health-table thead th { background: var(--soft); color: var(--muted); font-weight: 700; }
.health-table th:first-child { left: 0; position: sticky; text-align: left; z-index: 1; }
.health-table tbody th:first-child { background: var(--surface); }
.controls { display: grid; gap: 12px; grid-template-columns: 2fr repeat(6, minmax(120px, 1fr)); }
.filter-feedback { align-items: center; display: flex; gap: 12px; justify-content: space-between; margin-top: 14px; }
.filter-feedback span { color: var(--muted); font-weight: 700; }
input, select, textarea { border: 1px solid var(--line); border-radius: 6px; color: var(--ink); display: block; margin-top: 6px; padding: 9px 10px; width: 100%; }
textarea { font: inherit; line-height: 1.5; min-height: 120px; resize: vertical; }
.interactive-tool { display: grid; gap: 12px; }
.local-result { border-top: 1px solid var(--line); display: grid; gap: 10px; margin-top: 4px; padding-top: 14px; }
.local-result ol { display: grid; gap: 12px; margin: 0; padding-left: 20px; }
.local-result li { padding-left: 4px; }
.local-result p { color: var(--muted); margin-top: 4px; }
.local-result small { color: var(--muted); display: block; font-weight: 700; margin-top: 6px; }
.local-citations { background: var(--soft); border: 1px solid var(--line); border-radius: 6px; display: grid; gap: 4px; margin-top: 8px; padding: 8px; }
.source-link { border-top: 1px solid var(--line); display: block; font-weight: 700; margin-top: 12px; padding-top: 12px; }
.citation-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; }
.citation { border: 1px solid var(--line); border-radius: 8px; color: var(--ink); display: grid; gap: 4px; padding: 12px; }
.citation span, .citation small { color: var(--muted); }
.report-list { display: grid; gap: 18px; }
.report-card { display: grid; gap: 16px; }
.report-summary { font-size: 18px; }
.trace-panel { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 14px; }
.section-trace { background: var(--soft); border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 10px; margin-top: 12px; padding: 12px; }
.entity-link-list { display: flex; flex-wrap: wrap; gap: 10px; }
.entity-link-list.compact { gap: 8px; }
.entity-chip { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); display: grid; gap: 3px; padding: 10px 12px; }
.entity-chip span { color: var(--muted); font-size: 12px; }
.report-section { border-top: 1px solid var(--line); padding-top: 14px; }
.inline-defs { display: grid; gap: 6px; grid-template-columns: 130px minmax(0, 1fr); }
.markdown pre { background: #0f1715; border-radius: 8px; color: #effaf7; overflow: auto; padding: 14px; white-space: pre-wrap; }
.empty { border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); padding: 16px; }
.site-footer { align-items: center; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; padding-bottom: 26px; padding-top: 20px; }
@media (max-width: 880px) {
  .home-page .home-desk { order: 1; }
  .home-page .home-freshness-alert { order: 2; }
  .home-page .home-status-strip { order: 3; }
  .status-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hero, .home-desk, .featured-card, .grid.two, .radar-layout, .compact-row, .radar-row, .event-grid, .event-mini, .timeline-row { grid-template-columns: 1fr; }
  .event-mini small, .event-mini .source-link { grid-column: 1; }
  .mini-metric { min-height: 76px; padding: 10px; }
  .mini-metric strong { font-size: 16px; }
  .featured-card aside { border-left: 0; border-top: 1px solid var(--line); padding-left: 0; padding-top: 12px; }
  .controls { grid-template-columns: 1fr; }
  .citation-grid { grid-template-columns: 1fr; }
  .site-header { align-items: flex-start; flex-direction: column; }
  .header-tools { align-items: start; display: grid; grid-template-columns: minmax(0, 1fr) auto; width: 100%; }
  .header-tools nav { flex-wrap: nowrap; min-width: 0; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
  .header-tools nav a { flex: 0 0 auto; }
  h1 { font-size: 36px; }
}
`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
