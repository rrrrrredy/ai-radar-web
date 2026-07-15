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
| daily | `7079e444-bac7-483f-affe-7f08917662a4` | `needs_review` | 38 | 12 | 19 | 7 | passed |
| weekly | `bf5fd0df-1459-4a6c-b856-f8e51001b64d` | `needs_review` | 77 | 12 | 12 | 12 | passed |

Both were regenerated from `supabase_radar_items` in deterministic evidence-preview mode after the final DeepSeek item-understanding update. Report generation itself used no provider call and both candidates passed the source-stage gate. The Cloudflare event-aware projection independently reports:

| type | usable events | citations | sources | categories | gate |
| --- | ---: | ---: | ---: | ---: | --- |
| daily | 3 | 3 | 3 | 3 | failed: usable events below 5 |
| weekly | 26 | 26 | 13 | 10 | passed |

## Publication Boundary

Both candidates remain `needs_review`. The source-stage gate measures raw evidence sufficiency for editorial review, not approval or publication. The event-aware public projection applies the same minimums after clustering and time-window filtering. Its daily gate fails honestly because only three usable events remain; its weekly gate passes. Public cards expose same-family and cross-family coverage with an explicit caveat that different families do not prove source independence.

The read-only `public_report_candidates` view now includes quality-gated `needs_review` candidates through an explicit JSON allowlist. This lets the Vercel reference app show saved evidence drafts without exposing provider metadata, private review notes, operations fields, or report markdown.

Because the current public daily gate fails, the candidate remains `needs_review` and the UI renders:

```text
今日数据不足，需补充信源或等待下一轮刷新
```

The public projection excludes model metadata, provider responses, private notes, raw text, credentials, and operational logs.
