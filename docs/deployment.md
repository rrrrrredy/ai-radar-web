# Deployment

Cloudflare Pages is the primary public product surface. Vercel remains the dynamic/reference application.

- Primary: `https://ai-industry-radar.pages.dev`
- Reference: `https://ai-radar-web-luosongred-5507s-projects.vercel.app`
- Cloudflare artifact: `dist/cloudflare-pages`
- Manual refresh workflow: `.github/workflows/radar-refresh-cloudflare.yml`

Milestone D: Preview is deployed and publicly accessible after disabling Vercel Authentication. Use the active Preview alias `ai-radar-web-luosongred-5507-luosongred-5507s-projects.vercel.app`; the latest immutable deployment URL and smoke results are recorded in [deployment-preview-milestone-d.md](./deployment-preview-milestone-d.md). Project-wide Preview environment variables are configured.

Milestone G: Production is deployed at `https://ai-radar-web-luosongred-5507s-projects.vercel.app`. See [production-launch-milestone-g.md](./production-launch-milestone-g.md) for env names, callback URL, smoke results, DNS caveat, and rollback plan.

Use Cloudflare Pages first for public access and the allowlisted static snapshot. Use Vercel for the Next.js App Router reference/dynamic application and Supabase for managed Postgres/Auth. GitHub Pages is not used.

Production refreshes are manual `workflow_dispatch` runs only. Deployed environments keep `ENABLE_SUPABASE_WRITES=false`; a persistence run requires the explicit workflow input and repository write-gate variable. No scheduled writes are enabled.

Use the detailed readiness checklist in [deployment-hardening.md](./deployment-hardening.md) before any preview or production deployment.

Milestone D status: see [deployment-preview-milestone-d.md](./deployment-preview-milestone-d.md).

Milestone G status: see [production-launch-milestone-g.md](./production-launch-milestone-g.md).

## Environment Variables

Configure deployed values only in the platform environment manager. Keep `.env.example` blank or set to safe defaults, and never paste secrets into task text, deployment notes, GitHub issues, commits, docs, or logs.

Required Supabase variables for deployed Supabase behavior:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for approved server-only write workflows only
- `ADMIN_EMAIL`
- `ENABLE_SUPABASE_RETRIEVAL`
- `ENABLE_SUPABASE_WRITES=false` by default
- `ENABLE_SCHEDULED_INGESTION=false`
- `ENABLE_SCHEDULED_PERSISTENCE=false`
- `ENABLE_LIVE_DEEPSEEK_IN_JOBS=false`
- `ENABLE_X_API=false`
- `ENABLE_WECHAT_AUTH=false`

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

Scheduled persistence and automatic report publication remain disabled. X and WeChat are not automatically crawled. Live DeepSeek is available only in bounded, manually triggered refresh/report paths, and report candidates still require editorial review before publication.
