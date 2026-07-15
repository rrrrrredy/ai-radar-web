# Report Quality Gates - Release Candidate

Updated: 2026-07-15

## Gates

| report | usable items | citations | distinct sources | categories when available |
| --- | ---: | ---: | ---: | ---: |
| daily | 5 | 3 | 2 | 2 |
| weekly | 20 | 8 | 5 | 3 |

The gate also requires valid evidence timestamps, no material future timestamp, evidence inside the report window, and latest evidence no older than 24 hours for daily or 7 days for weekly.

## Final Candidates

| type | candidate ID | status | usable | citations | sources | categories | freshness |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| daily | `4c0e2d7d-fe0d-4492-8dd3-a42706272aec` | `needs_review` | 51 | 12 | 18 | 10 | passed |
| weekly | `4ffdd8d3-9b66-467a-ab15-0662f2e2045c` | `needs_review` | 78 | 12 | 12 | 12 | passed |

Both were regenerated from `supabase_radar_items` in deterministic evidence-preview mode after the final DeepSeek item-understanding update. Report generation itself used no provider call and both candidates passed the source-stage gate. The Cloudflare event-aware projection independently reports:

| type | usable events | citations | sources | categories | gate |
| --- | ---: | ---: | ---: | ---: | --- |
| daily | 10 | 10 | 7 | 4 | passed |
| weekly | 28 | 28 | 15 | 10 | passed |

## Publication Boundary

Both candidates remain `needs_review`. The baseline gate measures evidence volume, citations, source count, category spread, and freshness. Passing is evidence sufficiency for editorial review, not approval or publication. Public cards separately expose same-family and cross-family corroboration. The weekly window contains the single cross-family event; the daily window does not, so its caveat remains visible.

The read-only `public_report_candidates` view now includes quality-gated `needs_review` candidates through an explicit JSON allowlist. This lets the Vercel reference app show saved evidence drafts without exposing provider metadata, private review notes, operations fields, or report markdown.

If a future daily gate fails, the candidate remains `needs_review` and the UI renders:

```text
今日数据不足，需补充信源或等待下一轮刷新
```

The public projection excludes model metadata, provider responses, private notes, raw text, credentials, and operational logs.
