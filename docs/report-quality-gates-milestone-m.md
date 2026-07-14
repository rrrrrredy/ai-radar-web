# Report Quality Gates - Release Candidate

Updated: 2026-07-14

## Gates

| report | usable items | citations | distinct sources | categories when available |
| --- | ---: | ---: | ---: | ---: |
| daily | 5 | 3 | 2 | 2 |
| weekly | 20 | 8 | 5 | 3 |

The gate also requires valid evidence timestamps, no material future timestamp, evidence inside the report window, and latest evidence no older than 24 hours for daily or 7 days for weekly.

## Final Candidates

| type | candidate ID | status | usable | citations | sources | categories | freshness |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| daily | `2daba147-d851-41c4-a8ee-efed66eedcdf` | `needs_review` | 60 | 12 | 13 | 12 | passed |
| weekly | `ba8dbe90-30ef-4f60-8460-04456ad7be21` | `needs_review` | 75 | 12 | 13 | 11 | passed |

Both were generated in bounded `live_deepseek` mode from `supabase_radar_items`, used one report-generation API call each, and passed the source-stage gate. The Cloudflare event-aware projection independently reports:

| type | usable events | citations | sources | categories | gate |
| --- | ---: | ---: | ---: | ---: | --- |
| daily | 11 | 11 | 6 | 6 | passed |
| weekly | 29 | 29 | 16 | 10 | passed |

## Publication Boundary

Both candidates remain `needs_review`. The baseline gate measures evidence volume, citations, source count, category spread, and freshness. Passing is evidence sufficiency for editorial review, not approval or publication. Public cards separately expose same-family versus cross-family corroboration and release readiness; both current candidates remain not release-ready because cross-source-family confirmation is zero.

If a future daily gate fails, the candidate remains `needs_review` and the UI renders:

```text
今日数据不足，需补充信源或等待下一轮刷新
```

The public projection excludes model metadata, provider responses, private notes, raw text, credentials, and operational logs.
