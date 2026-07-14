# Release Candidate Data Status

Updated: 2026-07-14

## Coverage

| metric | value |
| --- | ---: |
| sources total | 317 |
| automated eligible | 91 |
| attempted | 91 |
| fetched | 82 |
| failed | 9 |
| blocked/manual | 226 |
| sources with public items | 64 |
| raw items | 268 |
| radar items | 264 |
| public radar items | 242 |
| historical candidate rows / current public candidates | 26 / 2 |

- source-to-raw coverage: 91.2%;
- raw-to-radar conversion: 98.5%;
- radar-to-public conversion: 91.7%;
- visible sources/configured sources: 20.2%;
- completed/persisted activation chunks: 19/19;
- missing persisted raw or radar IDs from the latest run: 0.

The preferred `public_radar_items >= 200` gate is met. Low visible-source coverage is not hidden: 226 configured sources require manual handling, a future API, a public URL repair, or an unsupported crawl path.

## Status and Failures

| family | count |
| --- | ---: |
| included | 241 |
| needs review | 4 |
| excluded for low relevance | 19 |
| failed radar rows | 0 |
| source timeout | 6 |
| source HTTP 403 | 3 |
| rate-limit warnings | 2 |

All 317 sources have a row in `docs/data-completeness-release-candidate.md`. The ignored machine-readable ledger is `data/reports/data-completeness.latest.json`.

## Event Projection

| layer | signals/relationships | events | curated | source confirmation state |
| --- | ---: | ---: | ---: | ---: |
| current deterministic run | 242 | 205 | 8 | 2 same-family, 0 cross-family |
| Cloudflare public-safe projection | 190 | 159 | 8 | 1 same-family, 0 cross-family |

The second multi-source cluster is a low-score multilingual documentation/changelog grouping and is excluded from public display. The Apple/OpenAI lawsuit is the only public two-source event; both sources belong to the media/analysis family, so it is not labeled as cross-family corroboration.

## Report Candidates

| type | ID | status | generation metrics | public event metrics |
| --- | --- | --- | --- | --- |
| daily | `2daba147-d851-41c4-a8ee-efed66eedcdf` | `needs_review` | 60 / 12 / 13 / 12 | 11 / 11 / 6 / 4 |
| weekly | `ba8dbe90-30ef-4f60-8460-04456ad7be21` | `needs_review` | 75 / 12 / 13 / 11 | 29 / 29 / 16 / 8 |

Metrics are usable items/events, citations, distinct sources, and categories. Both baseline source-stage gates and both public event projections pass. Neither candidate is presented as published or release-ready; independent source-family corroboration is still missing.

## Data Boundary

Cloudflare exports allowlisted public signal, event, timeline, citation, report-quality, source-health, and completeness fields. It excludes raw text, raw/model metadata, provider payloads, service credentials, private notes, admin logs, and wrong-domain model-radar tables.
