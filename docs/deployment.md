# Deployment

## Recommended First Deployment

Use Vercel as the first deployment target for the Next.js App Router application. It provides the most direct path for framework detection, preview deployments, environment variable management, and future cron support.

Supabase should be used as the managed Postgres and Auth platform.

## Later Hosting Options

Cloudflare Pages can be evaluated later if edge deployment or Cloudflare-specific infrastructure becomes important. Keep the first production path simple until the app has real ingestion and auth behavior.

## Environment Variables

Configure all variables from `.env.example` in the deployment platform environment variable manager. Keep `.env.example` blank for secret values, and do not commit real secrets or filled environment files.

Do not paste API keys, service tokens, cookies, or bearer values into deployment notes, GitHub issues, commits, docs, logs, or agent task text. If a key is exposed in any of those places, rotate or revoke it before using live jobs.

## Scheduled Jobs

Use GitHub Actions for scheduled ingestion during early phases because it is transparent, observable, and easy to review. Vercel Cron can be added when ingestion endpoints are stable.

Every scheduled job should be idempotent, retry-safe, and logged in `ingestion_runs`.

Phase 4 ingestion and Phase 5 understanding still write JSON under `data/ingestion/latest/`, `data/ingestion/runs/`, `data/understanding/latest/`, and `data/understanding/runs/`; those generated files are ignored by git. Phase 7 can dry-run persistence into Supabase and feature-flag Supabase retrieval, but production scheduling should wait until write runs, source-health persistence, and operational limits are explicitly approved.

## Pre-Deployment Checks

- Validate JSON seed data and schemas.
- Run lint and typecheck scripts.
- Run the sensitive scan.
- Run the Next.js production build.
- Confirm no `.env` files or secrets are staged.
- Confirm private source lists are not published unless intentionally protected.
- Keep `ENABLE_SUPABASE_WRITES=false` unless a reviewed write run is explicitly approved.

```bash
npm run lint
npm run typecheck
npm run ingest:sources:dry-run
npm run supabase:import:sources
npm run supabase:persist:ingestion
npm run supabase:persist:understanding
npm run source-health:dry-run
npm run validate:data
npm run sensitive:scan
npm run build
```

Before deployment, smoke test mock/local JSON APIs without live model calls:

```bash
curl -X POST http://localhost:3000/api/ask -H "content-type: application/json" -d "{\"question\":\"过去24小时内谁发布了新模型？\",\"generationMode\":\"mock\"}"
curl -X POST http://localhost:3000/api/writing-assistant -H "content-type: application/json" -d "{\"query\":\"帮我从今天热点里挑5条适合写行业观察的内容。\",\"generationMode\":\"mock\"}"
```

## Supabase

Run `supabase/schema.sql` in the Supabase SQL editor for a new project. Use `supabase/seed.sql` only for safe demo rows.

For an existing Phase 2 project, apply the Phase 7 migrations in order before
enabling Phase 7 persistence writes:

```bash
supabase/migrations/202605140001_phase7_persistence.sql
supabase/migrations/202605140002_phase7_upsert_constraints.sql
supabase/migrations/202605140003_public_retrieval_view.sql
```

The second migration fixes the plain unique constraints required by the
dry-run-first persistence upserts. The third migration creates
`public.public_radar_items`, the public-safe read view used by server-side anon
retrieval. The anon key should read that view only; do not grant anon access to
raw tables, write tables, raw text, raw metadata, model metadata, or operational
logs.

Required deployment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAIL`
- `ENABLE_SUPABASE_RETRIEVAL`
- `ENABLE_SUPABASE_WRITES`

Email auth should be enabled first. GitHub OAuth can be enabled after creating a GitHub OAuth app. WeChat remains a placeholder until a future supported provider flow exists.
