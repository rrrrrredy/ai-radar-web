# Release Candidate Data Status

Updated: 2026-07-15

## Coverage

| metric | value |
| --- | ---: |
| sources total | 317 |
| automated eligible | 91 |
| attempted / fetched / failed in final run | 1 / 1 / 0 |
| blocked or manual | 226 |
| sources with raw / radar / public items | 83 / 83 / 64 |
| raw / radar / public radar items | 287 / 283 / 261 |
| report candidates | 34 |

- source-to-raw coverage: 91.2%;
- raw-to-radar conversion: 98.6%;
- radar-to-public conversion: 92.2%;
- visible sources/configured sources: 20.2%;
- completed/persisted chunks in the final run: 1/1;
- missing persisted raw or radar IDs: 0.

Both the preferred `public_radar_items >= 200` target and the minimum 180 target are met. Low source visibility is not hidden: 226 sources require manual work, a public URL repair, a future API, or an unsupported crawl path.

## Status and Failure Families

| family | count |
| --- | ---: |
| included | 260 |
| needs review | 4 |
| excluded for low relevance | 19 |
| failed radar rows | 0 |
| broad-run succeeded / failed | 82 / 9 |
| timeout | 6 |
| HTTP 403 | 3 |
| rate-limit warnings | 2 |
| manual blocked | 226 |

Every configured source has an auditable row in `docs/data-completeness-release-candidate.md`. The ignored machine ledger is `data/reports/data-completeness.latest.json`.

The final run selected OGX through the stable legacy slug `meta-llama-stack`. It fetched and persisted 10 new records. The source name and canonical URL were corrected to OGX without changing persisted IDs.

## Public Projection

| layer | signals | event relationships | events | curated |
| --- | ---: | ---: | ---: | ---: |
| Supabase public view / Cloudflare `全部信号` | 261 | 207 | 205 | 8 |
| persisted event tables | 261 input | 209 | 207 | 8 |

All 261 public-safe signals are exported. Fifty low-event records that were previously omitted are now retained only in `全部信号`; clustering still excludes them. The remaining event-layer difference is the public display score boundary, not a loss of raw public signals.

Two multi-item public events reduce four repeated signals to two event cards. One is cross-family Anthropic/MIT Technology Review coverage; one is same-family Apple/OpenAI lawsuit coverage. Source-family diversity is visible but does not assert independence.

## Report Candidates

| type | ID | status | source-stage metrics | public event metrics | gate |
| --- | --- | --- | --- | --- | --- |
| daily | `a25e6f48-db5e-491d-84fe-16af7d78243d` | `needs_review` | 38 / 12 / 19 / 6 | 8 / 8 / 5 / 5 | passed |
| weekly | `54ddc6ff-637e-4a87-b14a-fecc39135bca` | `needs_review` | 78 / 12 / 13 / 12 | 26 / 26 / 13 / 10 | passed |

Metrics are usable evidence/events, citations, distinct sources, and categories. Both event-aware public gates pass. Editorial review remains required; neither candidate is published.

## Public Boundary

Cloudflare exports signal, event, relationship, timeline, citation, source-health, failure-family, report-quality, and completeness allowlists. It excludes raw text, raw/model/report metadata, provider payloads, credentials, private notes, admin logs, operational rows, and wrong-domain model-radar data.
