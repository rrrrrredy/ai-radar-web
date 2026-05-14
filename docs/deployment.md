# Deployment

## Recommended First Deployment

Use Vercel as the first deployment target for the Next.js App Router application. It provides the most direct path for framework detection, preview deployments, environment variable management, and future cron support.

Supabase should be used as the managed Postgres and Auth platform.

## Later Hosting Options

Cloudflare Pages can be evaluated later if edge deployment or Cloudflare-specific infrastructure becomes important. Keep the first production path simple until the app has real ingestion and auth behavior.

## Environment Variables

Configure all variables from `.env.example` in the deployment environment. Do not commit real secrets.

## Scheduled Jobs

Use GitHub Actions for scheduled ingestion during early phases because it is transparent, observable, and easy to review. Vercel Cron can be added when ingestion endpoints are stable.

Every scheduled job should be idempotent, retry-safe, and logged in `ingestion_runs`.

Phase 4 ingestion is local-only. It writes JSON under `data/ingestion/latest/` and `data/ingestion/runs/`; those generated files are ignored by git. Production scheduling should wait until Supabase insertion, source-health persistence, and operational limits are reviewed.

## Pre-Deployment Checks

- Validate JSON seed data and schemas.
- Run lint and typecheck scripts.
- Run the sensitive scan.
- Run the Next.js production build.
- Confirm no `.env` files or secrets are staged.
- Confirm private source lists are not published unless intentionally protected.

```bash
npm run lint
npm run typecheck
npm run ingest:sources:dry-run
npm run validate:data
npm run sensitive:scan
npm run build
```

## Supabase

Run `supabase/schema.sql` in the Supabase SQL editor. Use `supabase/seed.sql` only for safe demo rows.

Required deployment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAIL`

Email auth should be enabled first. GitHub OAuth can be enabled after creating a GitHub OAuth app. WeChat remains a placeholder until a future supported provider flow exists.
