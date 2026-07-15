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
| raw items | 275 |
| radar items | 271 |
| public radar items | 249 |
| historical candidate rows / current public candidates | 30 / 2 |

- source-to-raw coverage: 91.2%;
- raw-to-radar conversion: 98.5%;
- radar-to-public conversion: 91.9%;
- visible sources/configured sources: 20.2%;
- completed/persisted activation chunks: 19/19;
- missing persisted raw or radar IDs from the latest run: 0.

The preferred `public_radar_items >= 200` gate is met. Low visible-source coverage is not hidden: 226 configured sources require manual handling, a future API, a public URL repair, or an unsupported crawl path.

The final source hardening replaced five official HTML landing pages with article feeds and added a bounded, same-domain sitemap method for Anthropic News/Research. Sitemap entries are path-filtered and article excerpts are used only for DeepSeek understanding; they are not public fields.

## Status and Failures

| family | count |
| --- | ---: |
| included | 248 |
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
| current deterministic run | 200 | 168 | 8 | 1 same-family, 1 cross-family |
| Cloudflare public-safe projection | 197 | 165 | 8 | 1 same-family, 1 cross-family |

The cross-family event joins Anthropic's official J-space research with MIT Technology Review's Jacobian-lens coverage. The same-family event joins The Verge and Ars Technica coverage of the Apple/OpenAI lawsuit. Homepage, directory, documentation-index, and other low-event signals remain available in `全部信号` but do not become event evidence.

## Report Candidates

| type | ID | status | generation metrics | public event metrics |
| --- | --- | --- | --- | --- |
| daily | `4c0e2d7d-fe0d-4492-8dd3-a42706272aec` | `needs_review` | 51 / 12 / 18 / 10 | 10 / 10 / 7 / 4 |
| weekly | `4ffdd8d3-9b66-467a-ab15-0662f2e2045c` | `needs_review` | 78 / 12 / 12 / 12 | 28 / 28 / 15 / 10 |

Metrics are usable items/events, citations, distinct sources, and categories. Both baseline source-stage gates and both public event projections pass. Neither candidate is presented as published; one cross-family event exists, but formal editorial approval is still required.

## Data Boundary

Cloudflare exports allowlisted public signal, event, timeline, citation, report-quality, source-health, and completeness fields. It excludes raw text, raw/model metadata, provider payloads, service credentials, private notes, admin logs, and wrong-domain model-radar tables.
