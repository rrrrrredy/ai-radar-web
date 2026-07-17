# Bilingual Public Surface - Release Candidate

Updated: 2026-07-16

## Language Contract

Cloudflare Pages is Chinese by default and provides a complete English route tree. Every public header exposes a top-right `中文 / EN` switch with reciprocal `hreflang` links.

| Chinese | English |
| --- | --- |
| `/` | `/en/` |
| `/radar/` | `/en/radar/` |
| `/entities/` | `/en/entities/` |
| `/reports/` | `/en/reports/` |
| `/ask/` | `/en/ask/` |

English pages render the same event cards, all-signal rows, source health, report gates, citations, filters, timelines, report coverage caveats, and browser-local Ask tool. Report cards explicitly disclose the public signal-to-event projection in both languages. Original source, company, model, article, and paper names remain unchanged where translation would reduce traceability.

## Information Architecture

- the homepage first viewport shows live snapshot counts and begins `今日行业精选`;
- `/radar/` defaults to curated events;
- all 298 public-safe rows remain under `全部信号` / All signals;
- 244 mapped signals form 241 public events, while 54 signal-only audit rows are disclosed separately;
- event filtering removes low-event records only from events, not from the audit view;
- `/reports/` exposes event-aware quality and editorial status separately;
- `/ask/` operates locally on public evidence and does not claim a live private server action;
- the public writing route and API are retired and absent from both language versions;
- source health and failure-family summaries are visible in both languages;
- desktop and mobile navigation expose the language switch without horizontal scrolling.

The browser-local Ask tool recognizes explicit 24-hour and seven-day intent, filters on event publication time, shows evidence dates and citations, and does not imply a live server-side model call. Exact event names narrow the result set, while mixed cross-family/single-source requests preserve both evidence states. Automated regressions also cover numeric zeroes and reader-facing source-health timestamps.

## Current Public Data

| metric | value |
| --- | ---: |
| public radar / snapshot signals | 298 / 298 |
| public display event relationships / events | 244 / 241 |
| curated events | 8 |
| same-family multi-source events | 1 |
| cross-family events | 2 |
| daily / weekly public gate | passed / passed |

## Public Boundary

Static pages read only `data/radar-snapshot.json`. They do not expose raw content, raw/model/report metadata, provider payloads, private notes, admin logs, credentials, or wrong-domain model-radar relations.
