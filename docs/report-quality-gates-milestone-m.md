# Report Quality Gates - Release Candidate

Updated: 2026-07-16

## Thresholds

| report | usable | citations | distinct sources | categories when available |
| --- | ---: | ---: | ---: | ---: |
| daily | 5 | 3 | 2 | 2 |
| weekly | 20 | 8 | 5 | 3 |

The gate recomputes metrics from full evidence, accepts only valid `published_at` timestamps, enforces daily/weekly windows, and rejects missing, forged, future, or out-of-window evidence. Approval and publication recheck every evidence row against `public_radar_items`.

Candidate duplicate suppression uses a versioned content signature over evidence IDs, quality counts, caveats, missing evidence, and gate reasons. Evidence-order-only changes remain deduplicated.

## Final Candidates

| type | candidate ID | status | usable | citations | sources | categories | source gate |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| daily | `d659ec34-176c-44e8-a495-693b426e7fa2` | `needs_review` | 24 | 11 | 12 | 10 | passed |
| weekly | `8d0ced7c-24ba-489f-adea-b89193a049fc` | `needs_review` | 71 | 12 | 23 | 13 | passed |

Cloudflare independently projects each candidate onto public event evidence:

| type | usable events | citations | sources | categories | event gate |
| --- | ---: | ---: | ---: | ---: | --- |
| daily | 9 | 9 | 7 | 5 | passed |
| weekly | 26 | 26 | 12 | 8 | passed |

Both candidates remain `needs_review` for editorial review. Gate pass does not mean publication.

## Failure Boundary

A future failing daily candidate keeps `quality_gate_passed=false`, reasons, and all metric counts. The public card displays:

```text
今日数据不足，需补充信源或等待下一轮刷新
```

Public report views expose allowlisted report payloads only. They never expose original report metadata, model/provider output, raw text, report markdown, private notes, credentials, or operational logs.
