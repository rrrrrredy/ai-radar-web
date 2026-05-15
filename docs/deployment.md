# Deployment

Phase 9.1 is deployment hardening documentation only. No deployment has been performed, and scheduled jobs remain deferred.

Use Vercel first for the Next.js App Router application and Supabase for managed Postgres/Auth. Cloudflare Pages can be evaluated later only if a platform-specific requirement appears.

Use the detailed readiness checklist in [deployment-hardening.md](./deployment-hardening.md) before any preview or production deployment.

## Environment Variables

Configure deployed values only in the platform environment manager. Keep `.env.example` blank or set to safe defaults, and never paste secrets into task text, deployment notes, GitHub issues, commits, docs, or logs.

Required Supabase variables for deployed Supabase behavior:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for approved server-only write workflows only
- `ADMIN_EMAIL`
- `ENABLE_SUPABASE_RETRIEVAL`
- `ENABLE_SUPABASE_WRITES=false` by default

## Supabase

For a new project, apply `supabase/schema.sql` and use `supabase/seed.sql` only for safe demo rows. For the current Phase 7 persistence path, apply migrations in order:

```bash
supabase/migrations/202605140001_phase7_persistence.sql
supabase/migrations/202605140002_phase7_upsert_constraints.sql
supabase/migrations/202605140003_public_retrieval_view.sql
```

The public anon key should read only `public.public_radar_items`. The service role key must remain server-only and must not be exposed to browser code.

## Deferred Work

Scheduled jobs, scheduled persistence, live DeepSeek in jobs, hard admin route protection, and admin review workflows are deferred to later Phase 9 work. Keep all scheduler flags disabled until explicitly approved.
