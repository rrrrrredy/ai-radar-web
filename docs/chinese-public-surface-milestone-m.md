# Bilingual Public Surface - Release Candidate

Updated: 2026-07-15

## Language Contract

Cloudflare Pages is Chinese by default and provides a complete English route tree. Every public header exposes a top-right `中文 / EN` switch with reciprocal `hreflang` links.

| Chinese | English |
| --- | --- |
| `/` | `/en/` |
| `/radar/` | `/en/radar/` |
| `/entities/` | `/en/entities/` |
| `/reports/` | `/en/reports/` |
| `/ask/` | `/en/ask/` |
| `/write/` | `/en/write/` |

English pages render the same event cards, all-signal rows, source health, report gates, citations, filters, timelines, and browser-local Ask/Write tools. Original source, company, model, article, and paper names remain unchanged where translation would reduce traceability.

## Information Architecture

- the homepage first viewport shows live snapshot counts and begins `今日行业精选`;
- `/radar/` defaults to curated events;
- all 261 public-safe rows remain under `全部信号` / All signals;
- 207 mapped signals form 205 public events, while 54 signal-only audit rows are disclosed separately;
- event filtering removes low-event records only from events, not from the audit view;
- `/reports/` exposes event-aware quality and editorial status separately;
- `/ask/` and `/write/` operate locally on public evidence and do not claim a live private server action;
- source health and failure-family summaries are visible in both languages;
- desktop and mobile navigation expose the language switch without horizontal scrolling.

The browser-local Ask/Write tools recognize explicit 24-hour and seven-day intent, filter on event publication time, show evidence dates and citations, and do not imply a live server-side model call. The final Google Chrome desktop/mobile regression passed 28/28 checks with no relevant console errors.

## Current Public Data

| metric | value |
| --- | ---: |
| public radar / snapshot signals | 261 / 261 |
| public display event relationships / events | 207 / 205 |
| curated events | 8 |
| same-family multi-source events | 1 |
| cross-family events | 1 |
| daily / weekly public gate | passed / passed |

## Public Boundary

Static pages read only `data/radar-snapshot.json`. They do not expose raw content, raw/model/report metadata, provider payloads, private notes, admin logs, credentials, or wrong-domain model-radar relations.
