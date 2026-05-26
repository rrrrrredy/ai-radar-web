# Milestone M Report Quality Gates

Date: 2026-05-25
Updated for final RC: 2026-05-26

## Problem

Milestone L had a latest daily candidate with only 1 usable item and 1 citation. That candidate can remain visible for review, but it must not read as a useful daily AI industry report.

## Gate Thresholds

Daily candidate minimum:

| metric | minimum |
| --- | ---: |
| usable items | 5 |
| citations | 3 |
| distinct sources | 2 |
| categories, when available | 2 |

Weekly candidate minimum:

| metric | minimum |
| --- | ---: |
| usable items | 20 |
| citations | 8 |
| distinct sources | 5 |
| categories, when available | 3 |

## Stored Metadata

Generated report drafts now include:

```text
quality_gate_passed
quality_gate_reasons
usable_item_count
citation_count
distinct_source_count
category_count
quality_gate
```

Report candidate writes also copy these values into `report_candidates.metadata` beside the public-safe `report_draft`.

If a gate fails, the candidate remains `needs_review`. The schema is not changed to add `insufficient_data`.

## Public Display

Surfaces that show report quality:

- `/reports`
- `/reports/[id]`
- homepage latest-candidate cards
- Cloudflare `/reports/`
- Cloudflare `data/radar-snapshot.json`
- ops summary artifact
- event-aware Cloudflare report cards

The UI shows:

- quality gate passed vs needs more data
- usable item count
- citation count
- distinct source and category diversity
- quality-gate reasons for thin reports
- included curated event count and top event references when citations overlap event clusters

## Final RC Candidates

| type | candidate ID | status | gate | usable | citations | sources | categories |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| daily | `201ed3b3-a2e8-47aa-afa8-f64d14513db0` | needs_review | passed | 61 | 12 | 17 | 9 |
| weekly | `7f5e7074-3cb5-470b-aa68-0b89e9641f4c` | needs_review | passed | 125 | 12 | 13 | 8 |

The daily gate passed in the final RC. The insufficient-data message remains implemented for future failed daily candidates:

```text
今日数据不足，需补充信源或等待下一轮刷新
```

## Public View Migration

New migration:

```text
supabase/migrations/202605250001_report_quality_gate_public_views.sql
```

It refreshes `public_report_candidates` and `public_reports` to expose only the allowlisted report quality fields in `report_draft`. It does not grant write access and does not expose raw model metadata, private notes, operational logs, secrets, or service-role data.

The final RC also strips `model_metadata` from public API responses and Cloudflare snapshot output. When the database public report view has not yet been refreshed, the server/build path reads saved report rows with service access and projects only the same public-safe report fields before rendering or exporting.

## Failure-Family Categories

Milestone M standardizes source problem families:

```text
timeout
403
rate_limit
parse_error
no_items
duplicate_only
manual_blocked
unsupported_source
low_relevance_excluded
```

These are compact public-safe counts. They are not source-health writes and do not include raw stack traces or private logs.

Displayed in:

- resumable activation summary
- ops summary artifact
- data completeness audit output
- Cloudflare public coverage module when available

## Operator Rule

A failed quality gate is not a deployment blocker by itself. It is a report usefulness blocker. The operator can still deploy the public site so the current radar data and the thin-report warning are visible.
