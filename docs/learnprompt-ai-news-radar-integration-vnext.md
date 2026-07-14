# LearnPrompt AI News Radar Integration vNext

Date: 2026-06-30

External project: https://github.com/LearnPrompt/ai-news-radar
Inspected local clone: `D:\Codex\External\LearnPrompt-ai-news-radar`
Inspected commit: `a549e8def91002371e5ed0dccd38bc1aacfe4ae9`
License: MIT

## First Principles

AI Radar should not become another feed reader. Its core product contract is:

```text
public evidence -> source/entity understanding -> reviewable report candidate -> admin-reviewed report -> public report
```

LearnPrompt AI News Radar has a different but compatible contract:

```text
public sources -> 24h topic filter -> story merge -> static JSON -> lightweight news page / reader skill
```

The integration should therefore treat LearnPrompt AI News Radar as an upstream public signal provider, not as a replacement for our evidence, entity, admin, or report-publishing system.

## What The External Project Adds

- High-freshness 24h AI signal volume. The inspected snapshot had 679 AI items in `data/latest-24h.json`, 637 merged stories in `data/stories-merged.json`, and 20 curated daily-brief stories in `data/daily-brief.json`.
- A static public JSON contract that can be consumed without API keys, login, cookies, or a server.
- Useful source intelligence: `data/source-status.json`, source health, source tier labels, AI signal density, and source failure accounting.
- Explainable AI relevance scoring in `scripts/ai_relevance.py`: score, label, reason, matched signals, and noise terms.
- Rule-based story merge and brief gating in `scripts/update_news.py`: canonical URL merge, title-similarity merge, source diversity, source-tier weighting, recency, and "宁缺毋滥" brief slots.
- A source-intake discipline that matches our safety posture: prefer official RSS/Atom/JSON, consume public generated feeds, keep X/email/TikHub/AgentMail as optional secret-backed advanced sources, and never commit private OPML or secrets.

## What Should Not Be Integrated Directly

- Do not copy its static HTML/JS frontend into our Next.js product. Our surface is evidence-to-insight, entity tracking, and reviewed reports.
- Do not run its GitHub Actions workflow inside our repo as a production write path. If used, it should first land as read-only external evidence.
- Do not ingest `archive.json` by default. It is large and changes the product from a current radar into historical search.
- Do not auto-publish formal reports from `daily-brief.json` or `stories-merged.json`. In this integration track, external stories are benchmark/source-repair diagnostics only, not report, entity, or event inputs.
- Do not import paid-source or private-source flows unless the user explicitly configures secrets and accepts the privacy/cost boundary.

## Recommended Integration Shape

### 1. Read-Only External Signal Adapter

Add a small adapter rather than vendoring the external codebase:

```text
lib/external/learnprompt-ai-news-radar.ts
```

Inputs:

- `LEARNPROMPT_AI_NEWS_RADAR_BASE_URL`, defaulting to `https://learnprompt.github.io/ai-news-radar/data`
- `latest-24h.json`
- `daily-brief.json`
- `stories-merged.json`
- `source-status.json`

Behavior:

- Fetch only public JSON with GET.
- Enforce freshness gates: `latest-24h.json` should be labeled stale after 36 hours; `daily-brief.json` and `stories-merged.json` should not drive "today" experiences if they lag the main feed by more than 48 hours.
- Sanitize and allowlist fields before mapping into source-repair diagnostics.
- Map external item IDs with an `external:learnprompt:` namespace to avoid collisions with our `radar_*` IDs.
- Preserve original source URLs and source names for attribution.
- Mark imported items with explicit provenance: `provider=learnprompt`, `review_status=external_unreviewed`, `usage=source_repair_only`.
- Suppress missing-signal candidates when the upstream feed is stale or has a suspicious future timestamp; stale data can be used only for source-repair diagnostics with an explicit override.

### 2. Mapping Into Source-Repair Diagnostics

Map external items only to `LearnPromptSignalItem` and `ExternalSourceGapCandidate` diagnostic records:

- `title_bilingual || title_zh || title` -> `title`
- `url` -> `url`
- `source || site_name` -> `sourceName`
- `published_at || first_seen_at || last_seen_at` -> timestamps
- `ai_score` -> diagnostic score
- `importance_score || score` -> priority hint
- `source_tier` / `source_tier_rank` -> `source_tier` and source-weight hints
- `ai_label` -> diagnostic category hint:
  - `model_release` -> `model_release`
  - `ai_product_update` -> `product_update`
  - `developer_tool` -> `infrastructure`
  - `agent_workflow` -> `agent`
  - `research_paper` -> `research`
  - `industry_business` -> `business`
  - `infra_compute` -> `infrastructure`
  - `robotics` -> `other` until we add a robotics category
- `ai_relevance_reason`, `ai_signals`, `ai_noise` -> operator-only diagnostic notes after sanitization

The compatibility mapper that produces a `RetrievalRadarItem`-shaped object is not a publication path. It must mark the item `excluded`, retain `external_unreviewed` / `source_repair_only` provenance, and be blocked by final public snapshot filters.

Story records from `daily-brief.json` and `stories-merged.json` can be counted for upstream context, but must not become AI Radar report, entity, timeline, or event inputs in this integration track.

### 3. Product Surface

Use the upstream project where it strengthens trust:

- Operator/source diagnostics: an "external source gap" view that helps maintainers see official/high-score public items missing from AI Radar.
- `/reports`: external stories must not enrich public evidence drafts in this phase; they can only explain why an operator may repair a source or request a new trial source.
- `/entities`: external evidence must not add public entity claims in this phase; entity extraction can be reviewed only as an operator diagnostic after the source is already known to AI Radar.
- Admin/source page: show source health from `source-status.json` as an external-source health reference.

Do not put LearnPrompt items into the default public `/radar` feed in this phase. They are `external_unreviewed` source-repair signals, not AI Radar evidence items.

### 4. Source Intake And Backtesting

The most reusable maintainability asset is not the frontend; it is the source-intake process:

- Adapt the source overlap idea before adding new default sources to our pipeline.
- Add an AI relevance audit/backtest command for our own public snapshot.
- Record source health and AI density as product-visible trust signals.
- Use the external project as a benchmark feed: if our radar misses high-confidence official/source-tier-0 events that the external radar catches, flag a source repair task.

## Integration Goal Plan

### Goal 1: Read-Only Adapter And Diff Report

Deliverables:

- Add a typed loader for the four public JSON files. Implemented in `lib/external/learnprompt-ai-news-radar.ts`.
- Add fixture-based tests for freshness, field allowlists, ID namespacing, and category mapping. Covered by `scripts/smoke-test.ts`.
- Add a CLI script that prints a diff between our public snapshot and LearnPrompt's latest 24h official/high-score events. Implemented as `npm run external:learnprompt:diff`.
- No UI changes and no Supabase writes.

Acceptance:

- `npm run test`, `npm run typecheck`, `npm run lint`, `npm run validate:data`, and `npm run sensitive:scan` pass.
- The diff report can identify high-score upstream items missing from our snapshot without importing secrets or raw private data.

Example local/offline run against a checked-out LearnPrompt repo:

```bash
npm run external:learnprompt:diff -- \
  --learnprompt-dir "D:\Codex\External\LearnPrompt-ai-news-radar\data" \
  --snapshot-file "dist\cloudflare-pages\data\radar-snapshot.json" \
  --limit 10 \
  --min-ai-score 0.9 \
  --output "docs\learnprompt-ai-news-radar-diff-2026-06-30.md"
```

### Goal 2: External Source Gap Workbench

Deliverables:

- Add an operator/admin-only view for LearnPrompt missing-signal candidates. Implemented as `/admin/source-gaps`.
- Add source/freshness disclosure, source-health status, provenance labels, and stale-feed warnings.
- Keep external signals separate from included AI Radar items. A reviewed source repair may cause AI Radar to re-crawl the original public source later; it must not promote the LearnPrompt record itself into public evidence.
- Use a dedicated `ExternalSourceGapCandidate` DTO so the workbench does not render external candidates as ordinary `RetrievalRadarItem` rows.
- Classify each gap as `add_source`, `repair_existing_source`, `dedupe_rule_gap`, `entity_extraction_gap`, or `ignore_low_trust`.
- Match candidates against the cleaned AI Radar source registry by source name or host.
- Show LearnPrompt upstream source health plus the latest local ingestion source result when a registry source is matched.
- Generate admin-only no-write decision previews for future source-change requests or review tasks.

Acceptance:

- Operators can see what the upstream adds without confusing it with reviewed AI Radar evidence.
- Static/public output contains no model metadata, tokens, raw private content, or advanced-source secrets.
- Default public `/radar`, `/entities`, and `/reports` do not display external unreviewed candidates as AI Radar claims.
- Decision previews remain previews only; they do not persist source-change requests, review tasks, reports, or public radar items.

### Deferred Non-Goal: Report And Entity Augmentation

This is intentionally parked until the source-repair workflow has audited persistence and repeated review evidence. It is not part of the current LearnPrompt integration path.

Do not implement these until a future goal explicitly reopens the boundary:

- External story clusters as report inputs.
- External titles/sources as public entity tracking signals.
- External daily brief items as formal reports, report drafts, or public entity evidence.

Any future reopening must first prove that external signals remain `external_unreviewed` and `source_repair_only`, use an audited admin review record, and never bypass the reviewed/published report path.

## Current Recommendation

Goal 1 and Goal 2 are complete through the decision-readiness layer. Together they answer the core question:

```text
What high-freshness AI events does LearnPrompt AI News Radar see that our current AI Radar public snapshot does not?
```

The next goal should be a controlled source-repair workflow on top of the workbench: persist reviewed operator decisions as admin review tasks or source-change requests without directly importing external signals, changing public report counts, or adding unreviewed items to default `/radar`, `/entities`, or `/reports`. The write path should reuse existing audited admin review actions, require an explicit operator submit action, and keep LearnPrompt IDs/provenance attached to every resulting review record.
