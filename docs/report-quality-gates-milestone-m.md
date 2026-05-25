# Milestone M Report Quality Gates

Date: 2026-05-25

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

The UI shows:

- quality gate passed vs needs more data
- usable item count
- citation count
- distinct source and category diversity
- quality-gate reasons for thin reports

## Public View Migration

New migration:

```text
supabase/migrations/202605250001_report_quality_gate_public_views.sql
```

It refreshes `public_report_candidates` and `public_reports` to expose only the allowlisted report quality fields in `report_draft`. It does not grant write access and does not expose raw model metadata, private notes, operational logs, secrets, or service-role data.

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
