# Release Candidate Data Status

Updated: 2026-07-15

## Coverage

| metric | value |
| --- | ---: |
| sources total | 317 |
| automated eligible | 91 |
| attempted in final run | 1 |
| fetched in final run | 1 |
| failed in final run | 0 |
| blocked/manual | 226 |
| sources with public items | 64 |
| raw items | 280 |
| radar items | 276 |
| public radar items | 254 |
| historical candidate rows / current public candidates | 30 / 2 |

- source-to-raw coverage: 91.2%;
- raw-to-radar conversion: 98.6%;
- radar-to-public conversion: 92.0%;
- visible sources/configured sources: 20.2%;
- completed/persisted activation chunks in the final focused run: 1/1;
- missing persisted raw or radar IDs from the latest run: 0.

The preferred `public_radar_items >= 200` gate is met. Low visible-source coverage is not hidden: 226 configured sources require manual handling, a future API, a public URL repair, or an unsupported crawl path.

The final source hardening replaced five official HTML landing pages with article feeds and added a bounded, same-domain sitemap method for Anthropic News/Research. Sitemap `lastmod` is not used as publication time; escaped `publishedOn` metadata is parsed from the source page. Article excerpts are used only for DeepSeek understanding and are not public fields.

## Status and Failures

| family | count |
| --- | ---: |
| included | 253 |
| needs review | 4 |
| excluded for low relevance | 19 |
| failed radar rows | 0 |
| source timeout | 6 |
| source HTTP 403 | 3 |
| rate-limit warnings | 2 |

All 317 sources have a row in `docs/data-completeness-release-candidate.md`. The final focused run selected one source; the other automated-eligible rows retain their fetched history or are explicitly labeled `skipped_low_priority` for this bounded run. The ignored machine-readable ledger is `data/reports/data-completeness.latest.json`.

The public snapshot also preserves the latest broad-refresh scope (`activation_20260714_070243934Z`): 91 attempted, 82 succeeded, 9 failed. Family-level health is exported separately from the final one-source补跑 so timeout/403/rate-limit evidence is not erased by the focused run.

## Event Projection

| layer | signals/relationships | events | curated | source confirmation state |
| --- | ---: | ---: | ---: | ---: |
| current deterministic run | 201 | 198 | 8 | 1 same-family, 1 cross-family |
| Cloudflare public-safe projection | 201 | 198 | 8 | 1 same-family, 1 cross-family |

The cross-family event joins Anthropic's official J-space research with MIT Technology Review's Jacobian-lens coverage. It is labeled multi-source coverage, not independent confirmation. The same-family event joins The Verge and Ars Technica coverage of the Apple/OpenAI lawsuit. Homepage, directory, documentation-index, and other low-event signals remain available in `全部信号` but do not become event evidence.

## Report Candidates

| type | ID | status | generation metrics | public event metrics |
| --- | --- | --- | --- | --- |
| daily | `7079e444-bac7-483f-affe-7f08917662a4` | `needs_review` | 38 / 12 / 19 / 7 | 3 / 3 / 3 / 3 |
| weekly | `bf5fd0df-1459-4a6c-b856-f8e51001b64d` | `needs_review` | 77 / 12 / 12 / 12 | 26 / 26 / 13 / 10 |

Metrics are usable items/events, citations, distinct sources, and categories. Both source-stage gates pass. The public weekly projection passes, while the daily projection fails because three usable events are below the five-event minimum. The daily card therefore says `今日数据不足，需补充信源或等待下一轮刷新`. Neither candidate is presented as published.

## Data Boundary

Cloudflare exports allowlisted public signal, event, timeline, citation, report-quality, source-health, and completeness fields. It excludes raw text, raw/model metadata, provider payloads, service credentials, private notes, admin logs, and wrong-domain model-radar tables.
