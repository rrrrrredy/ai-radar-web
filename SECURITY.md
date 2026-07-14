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

## Supabase Mutation Boundary

Phase 7 Supabase mutation scripts are dry-run by default. A real mutation is allowed only when the command includes `--write` and `ENABLE_SUPABASE_WRITES=true` is set in the server environment.

Do not paste Supabase keys into prompts, logs, docs, commits, or command output. `SUPABASE_SERVICE_ROLE_KEY` is read only by the server-side CLI/helper path and must never be imported into client components or browser bundles.

The admin bootstrap path follows the same mutation boundary. `npm run auth:bootstrap-admin` is dry-run by default; mutation mode also requires `--write`, `ENABLE_SUPABASE_WRITES=true`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_EMAIL`. It must not create Auth users or print the configured admin email, keys, tokens, cookies, or raw Supabase errors.

Admin review mutations are a separate server-side path. They must run only through `lib/admin/actions.ts`, require `ENABLE_ADMIN_REVIEW_WRITES=true`, require the signed-in admin role before service-role access, sanitize all mutation errors, and create `admin_audit_events` for successful mutations.

## Milestone E Operating Loop Boundary

The Milestone E runbook in [docs/operating-loop-milestone-e.md](./docs/operating-loop-milestone-e.md) is the approved Preview sequence for dry-run refresh, controlled persist, report candidates, admin review, and Preview smoke checks. Its write steps use the existing temporary `ENABLE_SUPABASE_WRITES=true` gate for one command process only.

Milestone E does not approve Production deploys, scheduled writes, X/WeChat auto-crawl, or source-health writes.

## Admin Review Workflow Boundary

The `/admin/review` route is protected by the admin layout. It may read local/mock data and authenticated Supabase rows from `review_tasks`, `source_change_requests`, `report_candidates`, and `admin_audit_events` after the Phase 9.4 migration is manually applied.

The Phase 9.4 migration grants no anon access and no authenticated browser insert, update, or delete access for review workflow tables. Approve, reject, defer, resolve, create task, create source-change, create report-candidate, save reviewed report, publish approved report, and audit writes are implemented as server actions that require `ENABLE_ADMIN_REVIEW_WRITES=true`, re-check admin role, and write audit events. The service role must remain server-only and must not enter client components, shared browser utilities, public route bundles, or logs.

Approved report-candidate publication writes only `reports`, the source `report_candidates` metadata/status, and `admin_audit_events`. It is a manual admin action, not a scheduled job, crawler, or live model call.

Public assistant routes are removed. Adding review surfaces must not change public radar, entity, or report access.

## Supabase Read Boundary

Server-side retrieval uses the Supabase anon key only against `public.public_radar_items`. That view exposes public-safe radar item fields needed by radar, entity, and report surfaces, and it does not expose raw item identifiers, raw text, raw metadata, model metadata, service-role-only tables, operational logs, private notes, write access, or private/internal URLs.

Public homepage, radar, entity, and report coverage panels must use the public-safe coverage loader, which derives counts from the public snapshot, public views, and visible feed rows. These public routes must not import `@/lib/supabase/service`, `getSupabaseServiceClient`, or the service-role coverage loader.

Public static snapshots and the `public_radar_items` view may expose public-safe entity names, types, and confidence scores so the read-only mirrors can show entity tracking and entity detail pages. They must not expose raw item identifiers, entity evidence text, raw text, raw metadata, service-role-only operational table counts such as raw item, ingestion run, understanding run, item entity, or score table counts, or internal raw-pipeline conversion rates.

Do not grant anon broad `select` access on `raw_items`, `radar_items`, source-health tables, API usage logs, or service-role-only operational tables. Use explicit migrations and review the view projection when retrieval needs new fields.

The public anon key may be exposed to the browser only when Supabase policies and grants restrict it to public-safe reads. It must not provide write access or broad raw table reads.

## Scheduled Jobs And Live Providers

Phase 9.2 scheduled jobs are GitHub Actions dry-runs only. They run bounded public-source ingestion and mock understanding, upload ignored summary artifacts, and do not require secrets.

Scheduled job writes require explicit approval in a later phase. Keep scheduler flags disabled by default, including `ENABLE_SCHEDULED_INGESTION=false`, `ENABLE_SCHEDULED_PERSISTENCE=false`, `ENABLE_LIVE_DEEPSEEK_IN_JOBS=false`, and any future cron secret configuration.

Live DeepSeek in jobs is disabled by default. Do not enable live model calls in scheduled workflows until cost limits, logging, retries, and review boundaries are approved.

Public assistant generation is not exposed. Live DeepSeek calls remain disabled by default and must stay limited to explicit server-side ingestion, understanding, or report-generation workflows with approved environment gates.

Scheduled dry-run workflows must not pass `--write`, persist to Supabase, write source-health history, use the X API, auto-crawl WeChat public accounts, print secrets, or change public radar/entity/report access.

## Secrets and Model API Keys

Never commit secrets and never paste API keys into agent tasks, Codex prompts, ChatGPT messages, GitHub issues, commits, docs, or logs. Use environment variables only: local keys belong in `.env.local` or equivalent untracked files, and deployed keys belong in the deployment platform environment variable manager.

If a secret or model API key is exposed, rotate or revoke it before live use. Generated local ingestion and understanding outputs are ignored by git, and `npm run sensitive:scan` is required before commit to catch key-shaped values, bearer tokens, cookies, and private/internal URL patterns.

## Admin Access

Admin routes must require an authenticated Supabase user with the `admin` role, verified server-side against `users_profile` and `user_roles`. Middleware may redirect unauthenticated visitors for convenience, but it must not be the only authorization layer and must not perform role authorization.

Authenticated non-admin users should land on `/unauthorized`. Public/product routes, including radar, entity, and report surfaces, remain public unless a future phase explicitly changes that access model. Editor functions should be limited to source management, manual import, annotations, reports, and review workflows.

## Reporting Issues

Report vulnerabilities or accidental secret exposure directly to the repository owner. If a secret is committed, rotate it immediately and remove it from history before relying on the repository.
