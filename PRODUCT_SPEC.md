# Product Spec

## Public Homepage

The homepage shows the current AI radar: today/top hotspot events, reader-facing category entry points, source-health summary, latest event clusters, notable entities, and links to daily or weekly reports. It should support Chinese, English, and bilingual viewing.

## Product Shell and Branding

The app shell includes consistent AI Industry Radar branding, the public maintainer name Song Luo, public contact links, and a reminder that source attribution, freshness, and uncertainty are part of the public-information product contract.

## Hotspot Ranking

Rank items and clusters by credibility, novelty, source strength, entity importance, velocity, cross-source confirmation, and audience relevance. Repeated summaries should strengthen confidence only when they add evidence, not when they merely duplicate the same source.

## Event Clusters

Cluster related raw items into events. Each cluster should include a title, bilingual summary, timeline, representative sources, linked entities, score history, confidence, and open questions.

## Item Detail Page

Each item page should show the original URL, source, publication time, retrieved time, summary, extracted entities, scores, related cluster, evidence notes, and language variants.

## Entity Pages

Support entity pages for companies, people, models, products, papers, and projects. Entity pages should show aliases, canonical links, related items, related clusters, recent score movement, and notes.

Static Cloudflare and GitHub Pages mirrors must include an entity index and static entity detail pages, not just homepage/radar/report pages. Static entity pages should answer which entities are worth tracking, how many public signals support them, which sources/categories appear, whether the entity is linked to reports, what evidence still needs review, and which public citations form the entity timeline.

## Search and Filters

Users should filter by keyword, topic, source type, language, entity type, time range, confidence, score, and report inclusion status.

## Bilingual Mode

Users can choose Chinese, English, or bilingual mode. Bilingual summaries should be generated from evidence and reviewed for meaning, not produced as unverified literal translation.

## Public Product Boundary

The public product does not expose free-form generation assistants, Q&A, or writing/research assistant flows. Users should move through radar evidence, entity tracking, and reviewed reports. Public coverage summaries must come from public snapshot/public view fields and visible feed counts, not service-role operational tables. Public snapshots may include entity `name/type/confidence` for reader tracking, but not raw text, entity evidence text, internal pipeline conversion rates, or service-role operational table counts.

## Daily Report

Daily reports summarize the most important AI events for a selected date or last-24-hour window. Reports should include ranked events, why they matter, source citations, and watch items.

## Weekly Report

Weekly reports synthesize trends across seven days, including model releases, agent products, infrastructure, papers, investments, regulation, and open-source movement.

## Admin Dashboard

The admin dashboard gives authorized users operational control over sources, imports, scoring, ingestion, review queues, and system settings.

## Source Management

Admins can add, pause, reject, tag, and weight sources. Each source should track category, language, region, topics, health status, risk notes, and last check time.

## Manual Import

Editors can manually import public URLs or text excerpts with attribution. Manual imports should record who imported the item, when, why, and whether the input is public.

## Scoring Rule Management

Admins can adjust scoring weights and record rationale. Scoring changes should be auditable and should not silently rewrite historical reports without a version note.

## Ingestion Logs

Each ingestion run should record start time, end time, status, source count, item count, errors, model usage, and retry metadata.

## User Roles

- `admin`: manage users, sources, scoring rules, system settings, and all content.
- `editor`: manage sources, imports, annotations, reports, and review queues.
- `viewer`: read public and permitted private dashboard content.
