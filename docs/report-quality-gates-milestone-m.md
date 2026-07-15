# Report Quality Gates - Release Candidate

Updated: 2026-07-15

## Thresholds

| report | usable | citations | distinct sources | categories when available |
| --- | ---: | ---: | ---: | ---: |
| daily | 5 | 3 | 2 | 2 |
| weekly | 20 | 8 | 5 | 3 |

The gate fails closed when required metrics or metadata are missing. It recomputes thresholds from the candidate's full `evidence_items` list, rejects forged self-reported counts, accepts only valid `published_at` evidence time, rejects material future timestamps, and enforces the daily/weekly evidence windows. Collection or processing time cannot substitute for publication time.

Approval and publication call the same readiness gate and verify every evidence ID, source ID, category, status, and timestamp against `public_radar_items`. A stored `quality_gate_passed=true` value cannot override a current failure.

Candidate duplicate suppression uses a versioned content signature over evidence IDs, quality counts, caveats, missing evidence, and gate reasons. A changed event projection therefore refreshes the candidate even when the evidence IDs are unchanged; order-only changes remain deduplicated.

## Final Candidates

| type | candidate ID | status | usable | citations | sources | categories | source gate |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| daily | `c03df7dd-7da3-4b27-86a8-353e4ff2fdd8` | `needs_review` | 21 | 12 | 9 | 10 | passed |
| weekly | `21f9f53d-48eb-47d1-bab3-1a26b60055ce` | `needs_review` | 41 | 12 | 18 | 12 | passed |

Cloudflare independently projects the candidates onto public event evidence:

| type | usable events | citations | sources | categories | event gate |
| --- | ---: | ---: | ---: | ---: | --- |
| daily | 8 | 8 | 5 | 5 | passed |
| weekly | 25 | 25 | 13 | 10 | passed |

Both candidates are sufficient evidence drafts and remain `needs_review` for editorial review. Gate pass does not mean publication.

Cloudflare performs an independent event-aware projection: only event signals inside the candidate's declared window contribute to the public metrics, citations, source IDs, and top-event list. A zero-evidence or out-of-window projection cannot inherit a previous pass.

## Failure Boundary

When a future daily candidate fails, metadata keeps `quality_gate_passed=false`, reasons, usable count, citation count, source count, and category count. The public card must display:

```text
今日数据不足，需补充信源或等待下一轮刷新
```

The public report views expose trigger-maintained allowlisted report payloads. They never grant anonymous users access to original report `metadata`, model metadata, provider output, raw text, report markdown, private notes, credentials, or operational logs.
