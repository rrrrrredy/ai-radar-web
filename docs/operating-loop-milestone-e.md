# Milestone E Operating Loop Runbook

Last updated: 2026-05-20

This is the Preview-aware operating loop for refreshing radar data, preparing report candidates, and manually reviewing/publishing reports. It is an operator-run loop, not an autonomous production system.

Milestone G supersedes the earlier "no Production deploy" boundary only for the approved Vercel Production launch candidate. Keep using this runbook for operator-controlled refresh/review work; see [production-launch-milestone-g.md](./production-launch-milestone-g.md) for the stable Production URL and launch smoke record.

Use the active Preview alias:

```text
https://ai-radar-web-luosongred-5507-luosongred-5507s-projects.vercel.app
```

## What It Does

1. Checks the current radar/report data source.
2. Runs bounded dry-runs and mock refreshes.
3. Optionally runs a bounded live DeepSeek refresh when the environment is ready.
4. Persists reviewed radar data only through a temporary write gate.
5. Generates report candidates and persists them only through a temporary write gate.
6. Uses `/admin/review` for human approval, save, publish, and audit review.
7. Smokes the Preview after changes.

Generated ingestion, understanding, and scheduled-run JSON remains local/ignored unless explicitly persisted through the gated commands.

## Prerequisites

- Supabase migrations through `202605190001_reports_workflow.sql` are applied when Supabase-backed Preview data, admin review, or saved reports are expected.
- Preview env vars are configured, with `ENABLE_SUPABASE_RETRIEVAL=true` and `ENABLE_SUPABASE_WRITES=false` by default.
- Supabase Auth redirect URL includes the active Preview callback.
- The operator account has signed in once and has been bootstrapped as admin.
- `DEEPSEEK_API_KEY` exists only in local/deployment environment if live refresh or live report generation is requested.

## Dry-Run Loop

Start here for routine checks:

```bash
npm run check:deployment
npm run ops:dry-run
npm run ops:reports
```

`ops:dry-run` runs the controlled mock refresh plus daily/weekly candidate dry-runs. It does not attempt Supabase writes, scheduled jobs, X/WeChat crawl, or live DeepSeek by default. `ops:reports` generates report candidates from the current radar evidence without writing.

Scheduled dry-runs remain separate and dry-run only:

```bash
npm run scheduled:hourly:dry-run
npm run scheduled:daily:dry-run
npm run scheduled:weekly:dry-run
```

Source-health checks should stay non-writing:

```bash
npm run source-health:dry-run
npm run source-health:check -- --probe --limit 5
```

## Live Refresh

Run live refresh only as a bounded manual action:

```bash
npm run ops:refresh:live -- --limit 10 --max-items-per-source 3
npm run data:status
```

Review the console summary before persisting. If the live key is absent or a provider call fails, use the mock/local output for validation and rerun live later.

## Controlled Persist

Persist only after the dry-run or live output has been reviewed:

```powershell
$env:ENABLE_SUPABASE_WRITES="true"
npm run ops:refresh:live:persist -- --limit 10 --max-items-per-source 3
Remove-Item Env:ENABLE_SUPABASE_WRITES
```

If the latest local run is already reviewed and should be persisted without another fetch/model pass:

```powershell
$env:ENABLE_SUPABASE_WRITES="true"
npm run ops:refresh:live:persist -- --skip-ingest --skip-understand --limit 10 --max-items-per-source 3
Remove-Item Env:ENABLE_SUPABASE_WRITES
```

For a combined live refresh plus report-candidate persist, use the full operating loop:

```powershell
$env:ENABLE_SUPABASE_WRITES="true"
npm run ops:full:live:persist -- --limit 10 --max-items-per-source 3
Remove-Item Env:ENABLE_SUPABASE_WRITES
```

For mock-only lower-level activation, `npm run data:activate:persist` remains available with the same temporary write gate.

## Report Candidates

Dry-run report generation first:

```bash
npm run report:generate:daily
npm run report:generate:weekly
npm run ops:reports
```

Persist candidates for admin review only after confirming the evidence source and summary:

```powershell
$env:ENABLE_SUPABASE_WRITES="true"
npm run ops:reports -- --persist
Remove-Item Env:ENABLE_SUPABASE_WRITES
```

Live report generation remains explicit:

```bash
npm run report:generate:daily:live
npm run report:generate:weekly:live
```

Candidate writes insert only `report_candidates` plus an `admin_audit_events` row. They require Supabase radar evidence; if the current source is local or mock, keep the output as a preview only.

## Admin Review

1. Sign in on the active Preview as an admin.
2. Open `/admin/review`.
3. Review radar/source tasks, source-change requests, report candidates, and recent audit events.
4. Approve, reject, or defer report candidates.
5. Use `Save report` for reviewed but unpublished output.
6. Use `Publish report` only when the report should be public.
7. Re-open `/reports` and the report detail route to confirm the public status label.

Every successful admin mutation should create an audit event.

## Preview Checks

After a persist or admin review action, check the active Preview:

- `/`
- `/radar`
- `/reports`
- `/reports/[id]` for the changed report/candidate
- `/ask`
- `/write`
- `/auth/login`
- `/admin` signed out redirects to login
- `/admin/review` signed out redirects to login

API smoke should stay in mock generation mode:

```bash
curl -X POST https://ai-radar-web-luosongred-5507-luosongred-5507s-projects.vercel.app/api/ask \
  -H "content-type: application/json" \
  -d "{\"question\":\"What changed in the last 24 hours?\",\"language\":\"en\",\"generationMode\":\"mock\"}"
```

## Manual Parts

- Applying Supabase migrations.
- Adding Supabase Auth redirect URLs.
- Managing Vercel Preview env vars.
- Bootstrapping the first admin after sign-in.
- Reviewing live refresh summaries before persistence.
- Approving, saving, and publishing reports in `/admin/review`.
- Creating any Production deployment.

## Disabled Items

- Production deploy: do not run `vercel --prod` as part of Milestone E.
- Scheduled writes: no scheduled persistence or scheduled publication jobs.
- Scheduled live model calls: keep `ENABLE_LIVE_DEEPSEEK_IN_JOBS=false`.
- X and WeChat auto-crawl: keep `ENABLE_X_API=false` and `ENABLE_WECHAT_AUTH=false`.
- Source-health writes: do not run `source-health:check -- --write`.
- Broad Supabase writes: keep `ENABLE_SUPABASE_WRITES=false` except for the single reviewed command process.

## Failure Handling

- Validation failure: stop before Preview or persistence work; fix and rerun `npm run check:deployment`.
- Live refresh failure: do not persist that run; rerun with smaller `--limit` or use mock/local output for validation only.
- Partial source failures: inspect the run summary, narrow with `--method` or `--source`, and keep failed sources manual.
- Persist blocked: check the migrations, service-role env, and temporary `ENABLE_SUPABASE_WRITES=true`; rerun the dry-run before retrying write mode.
- Preview stale after persist: confirm `ENABLE_SUPABASE_RETRIEVAL=true`, public view rows exist, and the Preview deployment has the expected env.
- Admin action failure: confirm signed-in admin role, review workflow migration, and server-only service-role config; do not bypass `/admin/review` with ad hoc table edits.
- Secret exposure: rotate the secret before any live run or deployment.
