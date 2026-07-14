# Bilingual Public Surface - Release Candidate

Updated: 2026-07-14

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

## Current Public Data

| metric | value |
| --- | ---: |
| public radar items | 242 |
| public-safe snapshot items | 192 |
| public display events | 159 |
| public event relationships | 190 |
| curated events | 8 |
| same-family two-source display events | 1 |
| cross-source-family display events | 0 |

Latest daily and weekly candidates remain `needs_review`. Both pass baseline source-stage and event-projection quality gates, while separate release-readiness labels remain negative because cross-source-family corroboration is absent.

## Browser Verification

Local production-static smoke returned 200 for Chinese and English home, radar, reports, ask, and write routes. Tests verified document language, H1, visible language switch, reciprocal navigation, radar tab interaction, source-health failure distribution, and zero horizontal overflow at 1440px and 390px. The first mobile curated event starts at approximately 734px in an 844px viewport.

## Public Boundary

Static pages read only the allowlisted `data/radar-snapshot.json`. They do not expose raw text, raw/model metadata, provider payloads, private notes, admin logs, service credentials, or wrong-domain model-radar tables.
