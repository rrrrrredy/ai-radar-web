# Deployment

Phase 9.1 is deployment hardening documentation only. Phase 9.2 adds GitHub Actions scheduled dry-runs only.

Milestone D: a Preview deployment has been produced via CLI. Use the active Preview alias `ai-radar-web-luosongred-5507-luosongred-5507s-projects.vercel.app`; the latest immutable deployment URL is recorded in [deployment-preview-milestone-d.md](./deployment-preview-milestone-d.md). Project-wide Preview environment variables are configured, but route smoke still needs user-side verification because this runner cannot reach `*.vercel.app`.

Use Vercel first for the Next.js App Router application and Supabase for managed Postgres/Auth. Cloudflare Pages can be evaluated later only if a platform-specific requirement appears.

Use the detailed readiness checklist in [deployment-hardening.md](./deployment-hardening.md) before any preview or production deployment.

Milestone D status: see [deployment-preview-milestone-d.md](./deployment-preview-milestone-d.md).

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
supabase/migrations/202605140004_auth_admin_rls.sql
```

The public anon key should read only `public.public_radar_items`. The service role key must remain server-only and must not be exposed to browser code.

Enable Email magic links in Supabase first. Configure GitHub OAuth manually in the Supabase dashboard before relying on the GitHub button. WeChat auth remains a disabled placeholder.

After applying the auth/admin RLS migration, the initial admin must sign in once with the configured `ADMIN_EMAIL`, then run `npm run auth:bootstrap-admin` as a dry-run. A later explicitly approved write can run `npm run auth:bootstrap-admin -- --write` with `ENABLE_SUPABASE_WRITES=true`.

## Deferred Work

Scheduled persistence, live DeepSeek in jobs, and report publication jobs are deferred to later Phase 9 work. Keep all scheduler write/provider flags disabled until explicitly approved. The current GitHub Actions workflow is dry-run only and does not require secrets.
