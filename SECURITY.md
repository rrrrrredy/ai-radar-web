# Security

## Public Information Only

AI Industry Radar must use public information only. Do not commit or store private credentials, API keys, cookies, tokens, browser profiles, private company documents, company intranet links, or private company URLs in seed data.

## Secrets

Store secrets in environment variables. Use `.env.example` for variable names only. Never commit `.env` files.

Required secret handling:

- `SUPABASE_SERVICE_ROLE_KEY` must only be used server-side.
- `DEEPSEEK_API_KEY` must only be used server-side.
- `GITHUB_TOKEN` must not be exposed to browser code.
- WeChat credentials must remain disabled unless real platform configuration exists.

## Deployment Secret Boundary

Local secrets belong only in `.env.local` or another untracked local environment file. Preview and production secrets belong only in the deployment platform environment manager.

Never paste secrets into Codex task text, ChatGPT messages, GitHub issues, commits, documentation, deployment notes, or logs. If any secret is exposed, rotate or revoke it before using the project with live services.

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be imported by client components, shared browser utilities, or public bundles. `DEEPSEEK_API_KEY`, `X_BEARER_TOKEN`, `WECHAT_APP_SECRET`, and future scheduler secrets are also server-only.

## Supabase Write Boundary

Phase 7 Supabase write scripts are dry-run by default. A real write is allowed only when the command includes `--write` and `ENABLE_SUPABASE_WRITES=true` is set in the server environment.

Do not paste Supabase keys into prompts, logs, docs, commits, or command output. `SUPABASE_SERVICE_ROLE_KEY` is read only by the server-side CLI/helper path and must never be imported into client components or browser bundles.

The admin bootstrap path follows the same write boundary. `npm run auth:bootstrap-admin` is dry-run by default; write mode also requires `--write`, `ENABLE_SUPABASE_WRITES=true`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_EMAIL`. It must not create Auth users or print the configured admin email, keys, tokens, cookies, or raw Supabase errors.

## Admin Review Workflow Boundary

The `/admin/review` route is a protected review-only foundation. It may read local/mock data and authenticated Supabase rows from `review_tasks`, `source_change_requests`, `report_candidates`, and `admin_audit_events` after the Phase 9.4 migration is manually applied, but it must not execute browser writes.

The Phase 9.4 migration grants no anon access and no authenticated browser insert, update, or delete access for review workflow tables. Future approve, trial, reject, resolve, publish, annotation, and audit writes must be server-side, role-gated, audited, and protected by explicit write gates. The service role must remain server-only and must not enter client components, shared browser utilities, public route bundles, or logs.

`/ask` and `/write` remain public. Adding review surfaces must not change public access or existing API response shapes.

## Supabase Read Boundary

Server-side retrieval uses the Supabase anon key only against `public.public_radar_items`. That view exposes public-safe radar item fields needed by `/ask` and `/write`, and it does not expose raw text, raw metadata, model metadata, service-role-only tables, operational logs, private notes, write access, or private/internal URLs.

Do not grant anon broad `select` access on `raw_items`, `radar_items`, source-health tables, API usage logs, or service-role-only operational tables. Use explicit migrations and review the view projection when retrieval needs new fields.

The public anon key may be exposed to the browser only when Supabase policies and grants restrict it to public-safe reads. It must not provide write access or broad raw table reads.

## Scheduled Jobs And Live Providers

Scheduled job writes require explicit approval in a later phase. Keep scheduler flags disabled by default, including `ENABLE_SCHEDULED_INGESTION=false`, `ENABLE_SCHEDULED_PERSISTENCE=false`, and any future cron secret configuration.

Live DeepSeek in jobs is disabled by default. Do not enable live model calls in scheduled workflows until cost limits, logging, retries, and review boundaries are approved.

## Secrets and Model API Keys

Never commit secrets and never paste API keys into agent tasks, Codex prompts, ChatGPT messages, GitHub issues, commits, docs, or logs. Use environment variables only: local keys belong in `.env.local` or equivalent untracked files, and deployed keys belong in the deployment platform environment variable manager.

If a secret or model API key is exposed, rotate or revoke it before live use. Generated local ingestion and understanding outputs are ignored by git, and `npm run sensitive:scan` is required before commit to catch key-shaped values, bearer tokens, cookies, and private/internal URL patterns.

## Admin Access

Admin routes must require an authenticated Supabase user with the `admin` role, verified server-side against `users_profile` and `user_roles`. Middleware may redirect unauthenticated visitors for convenience, but it must not be the only authorization layer and must not perform role authorization.

Authenticated non-admin users should land on `/unauthorized`. Public/product routes, including `/ask` and `/write`, remain public unless a future phase explicitly changes that access model. Editor functions should be limited to source management, manual import, annotations, reports, and review workflows.

## Reporting Issues

Report vulnerabilities or accidental secret exposure directly to the repository owner. If a secret is committed, rotate it immediately and remove it from history before relying on the repository.
