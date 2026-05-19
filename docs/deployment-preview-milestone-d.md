# Deployment Preview — Milestone D (Deployable Preview & Operating Loop)

Last updated: 2026-05-19

## Snapshot

- Repository: `D:\Codex\AI Radar Web`
- Branch: `main`
- Commit: `848409e3cc657689c8491242f74cb2e8ede80db3` (or newer)
- Working tree: clean (before docs edits)
- Local validation: pass (`npm run check:deployment`)
- Preview deployment: created at `https://ai-radar-cgj84x959-luosongred-5507s-projects.vercel.app`

### Vercel status

- `npx vercel --version` returns `54.1.0`
- `npx vercel whoami` returns `luosongred-5507`
- `npx vercel project ls` shows `ai-radar-web`
- `npx vercel env ls` shows no vars because GitHub repo link is not connected yet.
- Production deployment: **not attempted**.

## Vercel setup path

1. Connect Vercel project to GitHub repo `rrrrrredy/ai-radar-web`.
   - Vercel Dashboard → Project `ai-radar-web` → Settings → Git
   - Connect Git Repository → GitHub → `rrrrrredy/ai-radar-web`
   - Production branch: `main`
2. Add Preview environment variables (see matrix below).
3. Deploy (`npx vercel --yes`) after env setup.
4. Record active Preview URL and rerun smoke checks.

### Required action if blocked

If GitHub login/authorization is required, complete in dashboard:
- `https://vercel.com/dashboard`
- Project `ai-radar-web` → **Settings** → **Git** → **Connect Git Repository** → **GitHub** → `rrrrrredy/ai-radar-web`

## Environment variable matrix (preview)

Do not print values. Keep public and server-only boundaries strict.

### Required for preview Supabase read/auth

- `NEXT_PUBLIC_SUPABASE_URL` (**public**)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (**public**)
- `ADMIN_EMAIL` (**server-only**)
- `APP_BASE_URL` (**server-only**) — set to the active preview URL
- `ENABLE_SUPABASE_RETRIEVAL=true` (**server-only**)
- `ENABLE_SUPABASE_WRITES=false` (**server-only**, must remain false)
- `ENABLE_SCHEDULED_INGESTION=false`
- `ENABLE_SCHEDULED_PERSISTENCE=false`
- `ENABLE_LIVE_DEEPSEEK_IN_JOBS=false`
- `ENABLE_X_API=false`
- `ENABLE_WECHAT_AUTH=false`

### Recommended server-only for this milestone

- `SUPABASE_SERVICE_ROLE_KEY`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_FAST_MODEL=deepseek-v4-flash`
- `DEEPSEEK_SMART_MODEL=deepseek-v4-pro`

## Supabase Auth callback URLs

- `https://ai-radar-cgj84x959-luosongred-5507s-projects.vercel.app/auth/callback`
- `https://ai-radar-cgj84x959-luosongred-5507s-projects.vercel.app/auth/callback` for wildcard-style cases is equivalent after wildcard policy is confirmed in Supabase.

If not configured, `/auth/callback` redirects may fail.

## Route smoke checks (preview)

Run each required path:

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
- `GET /en/auth/login`
- `POST /api/ask` with `generationMode:"mock"`
- `POST /api/writing-assistant` with `generationMode:"mock"`

### Smoke status captured for this run

- Route checks were attempted, but this environment cannot open `*.vercel.app` (TCP/connect timeout to `202.160.129.6:443`).
- POST checks to `/api/ask` and `/api/writing-assistant` both returned no-response timeout (`curl` timeout path), so API smoke cannot be confirmed from this runner.
- No secret output was printed or persisted during checks.

## Known limitations

- GitHub repository is still not linked in Vercel; preview env vars cannot be written via CLI yet.
- This runner cannot reach the preview host for external route/API smoke checks.
- Production is not deployed.

## Next steps

- Open Vercel dashboard and complete GitHub connection.
- Add required preview env vars (from `.env.local` for local-safe values).
- Confirm Supabase Auth Redirect URL for the active preview deployment.
- Redeploy preview once env vars and callback URL are configured.
- Re-run smoke checks when network access to preview URL is available.
