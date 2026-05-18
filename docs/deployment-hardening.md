# Deployment Hardening

Phase 9.1 documents deployment readiness only. Phase 9.2 adds GitHub Actions scheduled dry-runs only. These phases do not approve a deployment, enable scheduled persistence, run Supabase writes, or run live DeepSeek.

## Deployment Target Recommendation

Use Vercel first for the Next.js App Router application. It is the shortest path for framework-aware builds, preview environments, environment variable management, and future cron support.

Use Supabase as the managed Postgres and Auth platform. Supabase remains the source of database schema, auth, service-role write boundaries, and public read views.

Evaluate Cloudflare Pages later only if a Cloudflare-specific edge, routing, or platform requirement appears. Do not split deployment targets before auth, admin protection, and scheduled persistence are implemented.

## Environment Variable Matrix

Keep `.env.example` values blank or set to safe defaults. Store real values only in `.env.local` for local work or in the deployment platform environment manager for preview and production.

| variable | required for local | required for preview | required for production | public or server-only | safe to expose to browser? | default | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional for mock/local; required for Supabase smoke | Yes | Yes | Public | Yes | Blank | Browser-safe Supabase project URL. Required before auth or Supabase retrieval can work. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional for mock/local; required for Supabase smoke | Yes | Yes | Public | Yes | Blank | Browser-safe anon key. It must be limited by RLS/view grants and should only read public-safe data. |
| `SUPABASE_SERVICE_ROLE_KEY` | No, except controlled server write scripts/actions | Required only where admin review mutations are enabled | Required only where admin review mutations are enabled | Server-only | No | Blank | Must remain server-only. Never import into client components or expose in browser bundles. |
| `DEEPSEEK_API_KEY` | No; live mode only | No by default | No by default | Server-only | No | Blank | Must remain server-only. Live DeepSeek requires explicit live mode and a key. |
| `ADMIN_EMAIL` | Optional for public-only local work | Yes before admin bootstrap | Yes | Server-only | No | Blank | Identifies the initial admin account for the dry-run-first bootstrap flow. |
| `APP_BASE_URL` | Optional | Yes for deployed callbacks/links | Yes | Server-only | No | Blank | Set to the canonical deployment URL when deployed. |
| `ENABLE_SUPABASE_RETRIEVAL` | Optional | Optional after read-only smoke | Optional after read-only smoke | Server-only flag | No | `false` | May be enabled only after the public retrieval view exists and a read-only smoke test passes. |
| `ENABLE_SUPABASE_WRITES` | No | No | No by default | Server-only flag | No | `false` | Must stay `false` by default. Supabase writes also require an explicit `--write` command. |
| `ENABLE_X_API` | No | No | No by default | Server-only flag | No | `false` | Future X API integration flag. Do not enable until API policy and credentials are reviewed. |
| `X_BEARER_TOKEN` | No | No | No by default | Server-only | No | Blank | Future X API token. Never expose to browser or logs. |
| `ENABLE_WECHAT_AUTH` | No | No | No by default | Server-only flag | No | `false` | Placeholder only until a real supported provider flow exists. |
| `WECHAT_APP_ID` | No | No | No by default | Server-only | No | Blank | Future WeChat auth identifier. Keep blank until implementation. |
| `WECHAT_APP_SECRET` | No | No | No by default | Server-only | No | Blank | Future WeChat auth secret. Never expose to browser or logs. |
| `CRON_SECRET` | No | No | Future only | Server-only | No | Blank | Future scheduler request secret or equivalent. Do not configure until scheduled endpoints exist. |
| `ENABLE_SCHEDULED_INGESTION` | No | No | Future only | Server-only flag | No | `false` | Future scheduled ingestion flag. Keep disabled until explicitly approved. |
| `ENABLE_SCHEDULED_PERSISTENCE` | No | No | Future only | Server-only flag | No | `false` | Future scheduled persistence flag. Scheduled persistence must remain disabled until explicitly approved. |
| `ENABLE_LIVE_DEEPSEEK_IN_JOBS` | No | No | Future only | Server-only flag | No | `false` | Future job-only live model flag. Keep disabled by default. |

Rules:

- `SUPABASE_SERVICE_ROLE_KEY` must remain server-only.
- `DEEPSEEK_API_KEY` must remain server-only.
- `ENABLE_SUPABASE_WRITES=false` is the default for local, preview, and production.
- `ENABLE_SUPABASE_RETRIEVAL` may be enabled only after the read-only Supabase retrieval smoke test passes.
- Scheduled persistence remains disabled until explicitly approved in a later phase.
- GitHub Actions dry-run jobs must keep all scheduler/write/provider flags false and must not require repository secrets.

## Pre-Deployment Checklist

- `git status` is clean.
- No `.env.local`, `.env`, or filled environment file is staged.
- No generated ingestion or understanding JSON is staged.
- Migrations have been applied in order:
  - `202605140001_phase7_persistence.sql`
  - `202605140002_phase7_upsert_constraints.sql`
  - `202605140003_public_retrieval_view.sql`
  - `202605140004_auth_admin_rls.sql`
  - `202605140005_admin_review_workflows.sql`
- A controlled admin review action smoke has been completed through `/admin/review`, or manual steps are documented if browser session automation is unavailable.
- Read-only Supabase retrieval smoke passed against `public.public_radar_items`.
- Supabase Email magic links are configured before relying on admin sign-in.
- GitHub OAuth is configured in the Supabase dashboard before presenting it as a working provider.
- The initial admin has signed in once and `npm run auth:bootstrap-admin` dry-run reports that the Auth user can be found.
- `npm run lint`, `npm run typecheck`, `npm run validate:data`, `npm run sensitive:scan`, and `npm run build` passed.
- `npm run scheduled:hourly:dry-run`, `npm run scheduled:daily:dry-run`, and `npm run scheduled:weekly:dry-run` passed locally without Supabase writes or live DeepSeek.
- Mock API smoke passed for `/api/ask` and `/api/writing-assistant`.
- Admin write boundaries are visible on admin surfaces.
- `/admin/review` is reachable only for admin users and clearly labels review actions as server-side/admin-only/audited.
- Public copy makes no production claims beyond current capability.

## Deployment Smoke Checks

Run these after a preview deployment is created in a future phase. Keep generation in mock mode unless live provider use is explicitly approved.

- Homepage loads.
- `/ask` loads.
- `/write` loads.
- `/admin` redirects unauthenticated visitors to `/auth/login?next=/admin`.
- Authenticated non-admin users land on `/unauthorized`.
- `/admin/review` redirects unauthenticated visitors to `/auth/login?next=/admin/review`.
- `POST /api/ask` works with `generationMode: "mock"`.
- `POST /api/writing-assistant` works with `generationMode: "mock"`.
- Optional Supabase read-only retrieval smoke passes with `ENABLE_SUPABASE_RETRIEVAL=true`.
- No live DeepSeek call runs by default.
- The scheduled dry-run workflow can be inspected manually, but no remote dispatch is required for deployment readiness.

## Rollback Plan

- Revert to the previous Git commit.
- Disable `ENABLE_SUPABASE_RETRIEVAL`.
- Keep `ENABLE_SUPABASE_WRITES=false`.
- Disable scheduled workflows and scheduler flags.
- Keep `.github/workflows/radar-scheduled-dry-run.yml` disabled or reverted if dry-run scheduling itself becomes noisy.
- Rotate or revoke exposed secrets if needed.
- Fall back to local/mock data until the deployment is fixed.

## No-Deploy Checklist

Do not deploy when any of these are true:

- A secret was exposed and has not been rotated or revoked.
- `.env.local`, `.env`, or another filled environment file is staged.
- The Supabase service role key can reach the client bundle or browser.
- The build fails.
- The sensitive scan fails.
- Admin UI implies writes without auth and authorization.
- Required migrations have not been applied.
- The auth/admin RLS migration has not been reviewed and applied before admin role checks are expected to work.
- The admin review workflow migration has not been reviewed and applied before persistent review queues are expected to work.
- `public.public_radar_items` is missing.
- A scheduled write job is enabled without explicit approval.
