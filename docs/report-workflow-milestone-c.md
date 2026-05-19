# Milestone C Report Publication Workflow

Date: 2026-05-19

## Verified Baseline

- Public report views verified through `/reports`: yes.
- Saved candidates visible on `/reports`: yes.
- Daily candidate visible: yes, `c2ea6cb1-324c-4f20-9ae2-92d26b7f0fa5`, status `needs_review`.
- Weekly candidate visible: yes, `71e96d51-c942-48b9-a677-632ccfbd8d30`, status `needs_review`.
- Markdown copy/export visible: yes.
- Generated fallback preview visible while candidates exist: no.

## Workflow

- Admin review actions available: create candidate, approve, reject, defer.
- Status transition boundary: only `draft` and `needs_review` candidates can move to approved/rejected/deferred.
- Approved candidate publication available: yes, for daily, weekly, and topic candidates.
- Save reviewed report: creates or updates a `reports` row with status `reviewed`.
- Publish report: creates or updates a `reports` row with status `published` and marks the source candidate `published`.
- Audit events: every successful mutation writes `admin_audit_events`.

## Public Reports

`/reports` now labels these modes separately:

- Saved candidate: candidate row from `public_report_candidates`.
- Approved candidate: approved candidate that has not been saved/published as a report.
- Approved report: `reports` row with status `reviewed`.
- Published report: `reports` row with status `published`.
- Generated preview: deterministic fallback from radar evidence when no saved row is available.

`/reports/[id]` shows report/candidate detail with status, sections, citations, caveats, missing evidence, Markdown copy/export, and a back link.

## Admin Test Notes

Signed-in admin browser automation was not available in this environment. The signed-out smoke check redirects `/admin/review` to login, and the write path is implemented only as server actions that call `requireUserRole("admin")` before service-role access.

Manual signed-in admin test:

1. Sign in as an admin.
2. Open `/admin/review`.
3. Approve one `needs_review` report candidate.
4. Confirm an `admin_audit_events` row appears for `report_candidate.approved`.
5. Use `Save report` on the approved candidate and confirm a `reports` row with status `reviewed`.
6. Use `Publish report` only when the report should be public; confirm the candidate becomes `published` and an audit event is written.
7. Open `/reports` and confirm the mode label changes to approved report or published report.

## Remaining Gaps

- No scheduled report publication job exists.
- No live DeepSeek run is required for this workflow.
- Signed-in admin UI write testing still needs a browser session with admin cookies.
- Topic report rows can be saved by the admin action, but the current public overview remains optimized for daily and weekly reports.
