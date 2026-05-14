# Product Spec

## Public Homepage

The homepage shows the current AI radar: top hotspots, latest event clusters, notable entities, and links to daily or weekly reports. It should support Chinese, English, and bilingual viewing.

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

## Search and Filters

Users should filter by keyword, topic, source type, language, entity type, time range, confidence, score, and report inclusion status.

## Bilingual Mode

Users can choose Chinese, English, or bilingual mode. Bilingual summaries should be generated from evidence and reviewed for meaning, not produced as unverified literal translation.

## Q&A Box

The Q&A box answers questions against public radar data and public sources. It must cite sources, state time windows, and separate facts from inference and speculation.

Phase 6 implements the first usable Q&A foundation over local generated radar-item JSON with synthetic mock fallback. It does not claim comprehensive current coverage unless a future persisted retrieval source supports that claim.

## Daily Report

Daily reports summarize the most important AI events for a selected date or last-24-hour window. Reports should include ranked events, why they matter, source citations, and watch items.

## Weekly Report

Weekly reports synthesize trends across seven days, including model releases, agent products, infrastructure, papers, investments, regulation, and open-source movement.

## Writing Assistant Mode

Writing assistant mode helps select article angles, outline arguments, collect evidence, and identify counterpoints. It must not invent facts or hide weak evidence.

Phase 6 writing assistance returns evidence-bound topic candidates, caveats, counterpoints, missing evidence, and citations. It may use sections such as overseas, domestic, industry focus, and supplemental only when retrieved evidence supports them.

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
