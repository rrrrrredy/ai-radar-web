# Deployment Preview — Milestone D (Deployable Preview & Operating Loop)

Last updated: 2026-05-19

## Snapshot

- Repository: `D:\Codex\AI Radar Web`
- Branch: `main`
- Commit: `30a6a36` (or newer)
- Working tree: clean
- Local validation: pass (`npm run check:deployment`)
- Preview deployment: **not created (blocked by Vercel CLI auth state)**

### Vercel status

- `npx vercel --version` returns `54.1.0`
- `npx vercel whoami` and `npx vercel project ls` do not return a logged-in context in this environment
- `npx vercel whoami --non-interactive` returns:
  - `No existing credentials found. Starting login flow...`
  - `Visit https://vercel.com/oauth/device?user_code=...`
  - `Waiting for authentication...`
- **Blocking issue:** no non-interactive credential in this environment.
- Production deployment: **not attempted**.

## Vercel setup path

1. Log in to Vercel via web UI:
   - Vercel dashboard → New Project → Continue with GitHub
   - Import `rrrrrredy/ai-radar-web`
   - Set project name:
     - `ai-radar-web` (preferred) or
     - `ai-industry-radar`
   - Framework: Next.js
2. Select `main` branch for previews.
3. Add environment variables (Preview).
4. Deploy the branch/commit for preview.
5. Record preview URL and continue smoke checks below.

## Environment variable matrix (preview)

Do not print values. Keep public and server-only boundaries strict.

### Required for preview Supabase read/auth

- `NEXT_PUBLIC_SUPABASE_URL` (**public**)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (**public**)
- `ADMIN_EMAIL` (**server-only**)
- `APP_BASE_URL` (**server-only**)
- `ENABLE_SUPABASE_RETRIEVAL=true` (**server-only**)
- `ENABLE_SUPABASE_WRITES=false` (**server-only**, must remain false)

### Optional server-only now

- `SUPABASE_SERVICE_ROLE_KEY` (**server-only**; only needed for admin write actions)

### DeepSeek env (optional until explicitly used)

- `DEEPSEEK_API_KEY` (**server-only**)
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_FAST_MODEL=deepseek-v4-flash`
- `DEEPSEEK_SMART_MODEL=deepseek-v4-pro`

### Must stay disabled

- `ENABLE_SCHEDULED_INGESTION=false`
- `ENABLE_SCHEDULED_PERSISTENCE=false`
- `ENABLE_LIVE_DEEPSEEK_IN_JOBS=false`
- `ENABLE_X_API=false`
- `ENABLE_WECHAT_AUTH=false`

## Required Supabase Auth callback URLs (after preview URL exists)

- `https://<vercel-preview-url>/auth/callback`
- `https://<production-url>/auth/callback`

If not configured, `/auth/callback` redirects may fail.

## Route smoke checks (preview)

Run each required path and expect redirect behavior for admin routes:

- `GET /`
- `GET /radar`
- `GET /reports`
- `GET /reports/c2ea6cb1-324c-4f20-9ae2-92d26b7f0fa5`
- `GET /reports/71e96d51-c942-48b9-a677-632ccfbd8d30`
- `GET /ask`
- `GET /write`
- `GET /auth/login`
- `GET /admin`
- `GET /admin/review`
- `GET /en/admin/review`
- `POST /api/ask` with `generationMode:"mock"`
- `POST /api/writing-assistant` with `generationMode:"mock"`

### Expected when Supabase env is missing

- `/radar` and `/reports*` must still return `200` with explicit fallback/mode labeling.
- Report detail routes should show fallback messaging if no Supabase report views/data are available.
- Do not hide this state.

## Runbook notes for Milestone D

- Keep route shape unchanged for `/api/ask` and `/api/writing-assistant`.
- Keep scheduled jobs disabled.
- Keep live DeepSeek off by default.
- Never print secrets in task output, logs, docs, commits.
- No public launch statement until preview + smoke checks are signed off.

## Known limitations

- CLI-based Vercel authentication is not established in this environment.
- Preview URL is therefore not produced yet.

## Rollback plan

- If a broken preview is deployed, remove it from Vercel and disable preview deployment creation.
- Keep all write and scheduled flags set to false:
  - `ENABLE_SUPABASE_WRITES=false`
  - `ENABLE_SCHEDULED_INGESTION=false`
  - `ENABLE_SCHEDULED_PERSISTENCE=false`
  - `ENABLE_LIVE_DEEPSEEK_IN_JOBS=false`
- Keep `/api/ask` and `/api/writing-assistant` on mock/live-explicit behavior.

## Next steps for production

- Complete preview deployment/auth flow above.
- Confirm Supabase retrieval against `public.public_radar_items`.
- Confirm report detail routes for sample IDs in preview.
- Confirm admin redirection for `/admin` and `/admin/review`.
- Confirm `/api/ask` and `/api/writing-assistant` use mock mode unless explicit approved.
- Only then prepare production deployment with the same env matrix and a stricter domain URL list.
