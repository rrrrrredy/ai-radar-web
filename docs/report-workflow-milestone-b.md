# Report Workflow Milestone B

Date: 2026-05-19

## What Changed

- `/reports` now loads saved daily/weekly report candidates or reports from public-safe Supabase report views when available, then falls back to generated radar-item drafts.
- Daily/weekly report generation supports deterministic mode and explicit live DeepSeek synthesis.
- Report drafts include status, data source, time window, generated time, sections, citations, caveats, missing evidence, safe model metadata, and Markdown export text.
- `scripts/persist-report-candidate.ts` can persist report candidates to Supabase only when `--write` and `ENABLE_SUPABASE_WRITES=true` are both present.
- `/admin/review` shows report-candidate citation/caveat/gap counts and supports approve, reject, and defer.

## Run Results

Deterministic generation:

| report | data source | usable items | citations | caveats | missing evidence |
| --- | --- | ---: | ---: | ---: | ---: |
| daily | `supabase_radar_items` | 21 | 12 | 6 | 0 |
| weekly | `supabase_radar_items` | 24 | 12 | 6 | 0 |

Live DeepSeek:

- Bounded live report generation was run for daily and weekly.
- The latest current-code daily and weekly live runs each made 2 DeepSeek API calls, but the provider returned empty message content; the code fell back to deterministic drafts and recorded sanitized fallback reasons.
- One earlier daily live tuning run returned a usable live synthesis with 1 DeepSeek API call, but it was not the final validation result.
- No API keys or secret values were printed.

Candidate persistence:

| report | persisted | candidate id | status | source item UUIDs |
| --- | --- | --- | --- | ---: |
| daily | yes | `c2ea6cb1-324c-4f20-9ae2-92d26b7f0fa5` | `needs_review` | 16 |
| weekly | yes | `71e96d51-c942-48b9-a677-632ccfbd8d30` | `needs_review` | 18 |

Each persisted candidate also wrote one `admin_audit_events` row.

## Evidence Limits

- Current report coverage is narrow: it depends on the rows already persisted into `public_radar_items`.
- The daily window had 21 usable rows; the weekly window had 24 usable rows.
- The generated reports should not be presented as full AI market coverage.
- Items marked `needs_review` require human confirmation before publication language becomes confident.
- Public saved report display requires the manual report workflow migration to be applied: `supabase/migrations/202605190001_reports_workflow.sql`.

## Manual Review Status

- Two report candidates were created with `needs_review` status.
- Admin review can approve, reject, or defer candidates.
- Publication is not implemented in this milestone.

## Next Gaps

- Apply the report workflow migration in Supabase before expecting public saved-candidate reads.
- Add a controlled publish action that converts approved candidates into `reports`.
- Improve live DeepSeek reliability for longer weekly synthesis responses.
- Add operator-facing history and dedupe rules for repeated candidate generation.
