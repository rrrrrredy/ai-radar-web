# Report Quality Gates - Release Candidate

Updated: 2026-07-15

## Thresholds

| report | usable | citations | distinct sources | categories when available |
| --- | ---: | ---: | ---: | ---: |
| daily | 5 | 3 | 2 | 2 |
| weekly | 20 | 8 | 5 | 3 |

The gate fails closed when required metrics or metadata are missing. It recomputes thresholds from current evidence, accepts only valid `published_at` evidence time, rejects material future timestamps, and enforces the daily/weekly evidence windows. Collection or processing time cannot substitute for publication time.

Approval and publication call the same readiness gate. A stored `quality_gate_passed=true` value cannot override a current failure.

## Final Candidates

| type | candidate ID | status | usable | citations | sources | categories | source gate |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| daily | `a25e6f48-db5e-491d-84fe-16af7d78243d` | `needs_review` | 38 | 12 | 19 | 6 | passed |
| weekly | `54ddc6ff-637e-4a87-b14a-fecc39135bca` | `needs_review` | 78 | 12 | 13 | 12 | passed |

Cloudflare independently projects the candidates onto public event evidence:

| type | usable events | citations | sources | categories | event gate |
| --- | ---: | ---: | ---: | ---: | --- |
| daily | 8 | 8 | 5 | 5 | passed |
| weekly | 26 | 26 | 13 | 10 | passed |

Both candidates are sufficient evidence drafts and remain `needs_review` for editorial review. Gate pass does not mean publication.

## Failure Boundary

When a future daily candidate fails, metadata keeps `quality_gate_passed=false`, reasons, usable count, citation count, source count, and category count. The public card must display:

```text
今日数据不足，需补充信源或等待下一轮刷新
```

The public report views expose trigger-maintained allowlisted report payloads. They never grant anonymous users access to original report `metadata`, model metadata, provider output, raw text, report markdown, private notes, credentials, or operational logs.
