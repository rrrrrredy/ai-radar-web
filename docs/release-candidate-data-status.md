# Release Candidate Data Status

Updated: 2026-07-16

## Coverage

| metric | value |
| --- | ---: |
| sources total / automated eligible | 317 / 91 |
| attempted / fetched / failed in final live run | 30 / 27 / 3 |
| blocked or manual | 226 |
| sources with raw / radar / public items | 83 / 83 / 64 |
| raw / radar / public radar items | 326 / 322 / 298 |
| report candidates | 40 |

- source-to-raw coverage: 91.2%;
- raw-to-radar conversion: 98.8%;
- radar-to-public conversion: 92.5%;
- visible sources/configured sources: 20.2%;
- completed/persisted chunks: 6/6;
- missing persisted raw or radar IDs: 0.

The preferred `public_radar_items >= 200` target and the minimum 180 target are both met. Low source visibility remains explicit: 226 sources require manual work, a public URL repair, a future API, or an unsupported crawl path.

## Run Accountability

| status or family | count |
| --- | ---: |
| fetched sources | 27 |
| failed sources | 3 |
| HTTP 403 observations | 2 |
| timeout observations | 3 |
| included radar rows | 297 |
| needs-review radar rows | 4 |
| low-relevance excluded rows | 21 |
| failed radar rows | 0 |
| manual blocked sources | 226 |

The final run produced 71 raw and 71 radar rows: 66 included, 1 needs review, 4 excluded, and 0 understanding failures. NVIDIA AI Blog, Andrew Chen, and Epoch AI failed to fetch. Every configured source has an auditable row in `docs/data-completeness-release-candidate.md`; the ignored machine ledger is `data/reports/data-completeness.latest.json`.

## Public Projection

| layer | signals | event relationships | events | curated | cross-family |
| --- | ---: | ---: | ---: | ---: | ---: |
| Supabase / Cloudflare `全部信号` | 298 | 244 | 241 | 8 | 2 |
| persisted event tables | 298 input | 246 | 243 | 8 | 2 |

All 298 public-safe signals are exported. Fifty-four signal-only rows remain under `全部信号`; the public display difference reflects event-quality filtering, not data loss.

Three multi-item events reduce six related signals to three cards. GPT-Red and Anthropic J-space have official-plus-analysis-family evidence. The Apple/OpenAI lawsuit has two media sources in one family. Source-family diversity is visible but is not labeled independent confirmation.

## Report Candidates

| type | ID | status | source metrics | public event metrics | gate |
| --- | --- | --- | --- | --- | --- |
| daily | `d659ec34-176c-44e8-a495-693b426e7fa2` | `needs_review` | 24 / 11 / 12 / 10 | 9 / 9 / 7 / 5 | passed |
| weekly | `8d0ced7c-24ba-489f-adea-b89193a049fc` | `needs_review` | 71 / 12 / 23 / 13 | 26 / 26 / 12 / 8 | passed |

Metrics are usable evidence/events, citations, distinct sources, and categories. Editorial review remains required; neither candidate is published.

## Public Boundary

Cloudflare exports allowlisted signals, events, relationships, timelines, citations, source health, failure families, report quality, and completeness. It excludes raw text, raw/model/report metadata, provider payloads, credentials, private notes, admin logs, operational rows, and wrong-domain model-radar data.
