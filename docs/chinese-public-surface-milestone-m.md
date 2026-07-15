# Bilingual Public Surface - Release Candidate

Updated: 2026-07-15

## Language Contract

Cloudflare Pages is Chinese by default and provides a real English route tree. Every public header exposes a top-right `中文 / EN` switch with reciprocal `hreflang` links.

| Chinese | English |
| --- | --- |
| `/` | `/en/` |
| `/radar/` | `/en/radar/` |
| `/entities/` | `/en/entities/` |
| `/reports/` | `/en/reports/` |
| `/ask/` | `/en/ask/` |
| `/write/` | `/en/write/` |

English pages are not label-only shells. They render the same public snapshot, event cards, source health, report gates, citations, filters, timelines, and browser-local Ask/Write evidence tools. Original source/company/model/article names remain unchanged where translation would damage traceability.

## Information Architecture

- the home first viewport shows real counts, the product name, today's selection, and the first curated event on 390px mobile;
- `/radar/` defaults to curated events and keeps raw items under All signals / `全部信号`;
- radar tabs cover selected, all events, all signals, latest timeline, review, and source health;
- `/reports/` separates evidence drafts from reviewed/published reports and exposes quality gates;
- `/ask/` and `/write/` operate locally on public event evidence without claiming live private chat;
- source health and failure-family summaries are visible in both languages.
- source health distinguishes the final focused run from the latest broad refresh and exposes a horizontally scrollable per-family status matrix in both languages.

## Current Public Data

| metric | value |
| --- | ---: |
| public radar items | 254 |
| public-safe snapshot items | 204 |
| public display events | 198 |
| public event relationships | 201 |
| curated events | 8 |
| same-family two-source display events | 1 |
| cross-source-family display events | 1 |

Latest daily and weekly candidates remain `needs_review` and both pass the source-stage gate. The event-aware daily projection fails with 3 usable events against a minimum of 5 and displays `今日数据不足，需补充信源或等待下一轮刷新`; the weekly projection passes with 26 events. The public surface shows one company/lab plus media/analysis coverage event, labels source independence as unverified, and still distinguishes it from same-family repetition.

## Browser Verification

Local production-static smoke returned 200 for Chinese and English home, radar, reports, ask, and write routes. Tests verified document language, H1, visible language switch, reciprocal navigation, radar tab interaction, source-health failure distribution, and zero horizontal overflow at 1440px and 390px. The first mobile curated event starts at approximately 734px in an 844px viewport.

## Public Boundary

Static pages read only the allowlisted `data/radar-snapshot.json`. They do not expose raw text, raw/model metadata, provider payloads, private notes, admin logs, service credentials, or wrong-domain model-radar tables.
