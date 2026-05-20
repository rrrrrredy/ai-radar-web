# Deployment Preview - Milestone D

Last updated: 2026-05-20

## Snapshot

- Repository: `D:\Codex\AI Radar Web`
- Branch: `main`
- Vercel project: `luosongred-5507s-projects/ai-radar-web`
- Vercel CLI: `54.1.0`
- Latest immutable Preview deployment: `https://ai-radar-ckagj2lti-luosongred-5507s-projects.vercel.app`
- Latest Preview deployment id: `dpl_6VL8h2N8rAyFtQaQpggUMMVW8UGZ`
- Active Preview alias: `https://ai-radar-web-luosongred-5507-luosongred-5507s-projects.vercel.app`
- Vercel Authentication: disabled for the project Preview path (`ssoProtection: null`).
- Production deployment: no completed Production deployment. The required docs push to `main` triggered Git-connected Production build `dpl_CSm4jBoY8uQCfNXehHVeM8Zak2EJ`, which was canceled while building.

Use the active Preview alias for deployed callback configuration because it is assigned to the latest Preview deployment without changing on each immutable deployment URL.

## Vercel Environment Status

Project-wide Preview env vars are configured for the active Preview deployment path. Older Preview vars scoped to `codex/milestone-b-reports-product` were removed to avoid stale branch-scoped overrides.

Configured Preview names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ADMIN_EMAIL`
- `APP_BASE_URL`
- `ENABLE_SUPABASE_RETRIEVAL`
- `ENABLE_SUPABASE_WRITES`
- `ENABLE_SCHEDULED_INGESTION`
- `ENABLE_SCHEDULED_PERSISTENCE`
- `ENABLE_LIVE_DEEPSEEK_IN_JOBS`
- `ENABLE_X_API`
- `ENABLE_WECHAT_AUTH`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_FAST_MODEL`
- `DEEPSEEK_SMART_MODEL`

Required guardrail values for this preview:

- `APP_BASE_URL` points at the active Preview alias.
- `ENABLE_SUPABASE_RETRIEVAL=true`
- `ENABLE_SUPABASE_WRITES=false`
- `ENABLE_SCHEDULED_INGESTION=false`
- `ENABLE_SCHEDULED_PERSISTENCE=false`
- `ENABLE_LIVE_DEEPSEEK_IN_JOBS=false`
- `ENABLE_X_API=false`
- `ENABLE_WECHAT_AUTH=false`

Do not print or commit env values.

## Supabase Auth Callback

Configured Redirect URLs:

```text
https://ai-radar-web-luosongred-5507-luosongred-5507s-projects.vercel.app/auth/callback
https://*-luosongred-5507s-projects.vercel.app/**
```

The project owner confirmed these are configured in Supabase Auth Redirect URLs before the final Milestone D preview smoke.

## Validation

The final validation pass was run from a temporary clean clone without `.env.local` present, so local secrets were not read by Next build-time environment loading.

Passed:

- `npm run lint`
- `npm run typecheck`
- `npm run validate:data`
- `npm run sensitive:scan`
- `npm run build`
- `npm run check:deployment`

## Preview Smoke

Final smoke after Supabase callback configuration passed against:

```text
https://ai-radar-web-luosongred-5507-luosongred-5507s-projects.vercel.app
```

The local resolver returned non-Vercel IPs for `*.vercel.app`, so curl checks pinned the preview host to Vercel anycast IP `76.76.21.21`.

GET results:

- `/` -> 200
- `/radar` -> 200, data source label rendered as Supabase (`supabase_radar_items`)
- `/reports` -> 200, saved candidate mode is visible
- `/reports/c2ea6cb1-324c-4f20-9ae2-92d26b7f0fa5` -> 200
- `/reports/71e96d51-c942-48b9-a677-632ccfbd8d30` -> 200
- `/ask` -> 200
- `/write` -> 200
- `/auth/login` -> 200
- `/admin` -> redirects to `/auth/login` when signed out
- `/admin/review` -> redirects to `/auth/login` when signed out
- `/en/admin/review` -> canonicalizes or redirects without a 404
- `/en/auth/login` -> canonicalizes or loads without a 404

POST results:

- `POST /api/ask` with mock generation -> 200, `data_source=supabase_radar_items`, provider `local`
- `POST /api/writing-assistant` with mock generation -> 200, `data_source=supabase_radar_items`, provider `local`

No `vercel --prod` command was run. The Git-triggered Production build noted above was canceled while building. No Supabase writes, scheduled jobs, or live DeepSeek calls were run for this preview.
