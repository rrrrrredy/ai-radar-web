# AI Industry Radar

AI Industry Radar is a bilingual AI industry radar website for AI practitioners, product managers, researchers, investors, internal colleagues, non-technical readers, and the author.

It is designed around three core questions:

- What happened in AI today?
- Which events are real hotspots?
- Which models, products, companies, papers, and people are worth tracking?

Planned capabilities include source ingestion, ranking, clustering, bilingual summaries, an admin dashboard, daily and weekly reports, source health monitoring, and private source management.

The project uses public information only. Secrets, API keys, service tokens, cookies, and private credentials must be stored in environment variables and never committed.

## Maintainer

- Maintainer: Song Luo
- Email: luosongred@gmail.com
- GitHub: https://github.com/rrrrrredy

## Current Scope

This repository now contains a Next.js App Router skeleton, Tailwind styling, Supabase database/auth helpers, a DeepSeek provider abstraction, synthetic demo data, validation scripts, a Phase 3 cleaned public source registry, a Phase 4 local public-source ingestion foundation, a Phase 5 local understanding layer, a server-side retrieval foundation, a Phase 7 dry-run-first Supabase persistence layer, Phase 8 public product shell and homepage design passes, the Phase 8.4 production-safe admin console redesign, Phase 9.2 scheduled dry-run job foundation, Phase 9.4 admin review workflow tables, Phase 9.4b controlled admin review actions, Phase 9.5 Supabase Auth/admin route protection foundations, Phase 10 radar/report product surfaces, a Phase 10.5 one-shot radar data activation workflow, the Milestone E Preview-aware operating loop runbook, the Milestone G Vercel Production launch candidate record, the Milestone M reviewed refresh workflow with report quality gates and Cloudflare deployment support, the vNext experience enhancement for entity exploration, saved radar filters, report/draft separation, and evidence coverage, vNext trusted publishing readiness for formal report vs evidence-draft clarity, the vNext evidence-to-insight loop that connects radar evidence, entity tracking, report drafts, and admin-reviewed report publication, vNext entity detail pages with public evidence graphs, vNext report-to-entity traceability, vNext per-section entity coverage and static mirror traceability parity, a local reviewed public-report snapshot path for reproducible formal-report output when Supabase reports are unavailable, plus a read-only LearnPrompt AI News Radar external-signal diff adapter and `/admin/source-gaps` workbench with registry matching, upstream/local source health, and admin-only decision previews for source-repair diagnostics.

The implementation is intentionally an application foundation, not the full product. It can run limited local ingestion and understanding smoke tests, dry-run Supabase persistence plans, scheduled GitHub Actions dry-runs, render a filterable public radar list, generate deterministic or explicit-live daily/weekly report drafts from retrieved radar items, persist report candidates through a mutation-gated CLI, protect `/admin` routes with server-side Supabase user plus `user_roles` checks, run controlled server-side admin review actions for review tasks, source change requests, report candidates, and audit events, and save or publish approved report candidates through audited admin server actions. It does not run scheduled persistence, source-health history persistence, live DeepSeek by default, public assistant generation, or scheduled/automatic report publication.

## Design System

`DESIGN.md` is the canonical design contract for AI Industry Radar. Public/product pages should follow the Editorial Intelligence Desk direction, while admin pages should follow the Production-safe Analyst Console direction.

Evidence, freshness, and uncertainty are core UI surfaces, not decorative metadata. The radar, entities, and reports use shared evidence and citation anatomy so data source, time windows, confidence, review status, and missing evidence are visible before or beside synthesis. Admin surfaces separate read-only, dry-run, mutation-gated, missing setup, live/offline, and placeholder states so operational status cannot be mistaken for enabled production mutations. Future route redesigns should follow `DESIGN.md` before changing layouts.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres
- Supabase Auth
- Email and GitHub auth support in code/config
- WeChat auth placeholder behind `ENABLE_WECHAT_AUTH`
- DeepSeek V4 Flash for low-cost filtering, summarization, tagging, and classification
- DeepSeek V4 Pro for scoring and report generation
- GitHub Actions scheduled dry-run jobs; Vercel Cron remains future/deferred

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Validation commands:

```bash
npm run import:sources
npm run ingest:sources:dry-run
npm run ingest:sources -- --limit 3 --max-items-per-source 3
npm run understand:items:mock
npm run understand:items -- --limit 3 --mode mock
npm run data:activate:mock
npm run data:activate:live
npm run data:status
npm run supabase:import:sources
npm run supabase:persist:ingestion
npm run supabase:persist:understanding
npm run source-health:dry-run
npm run data:activate:resumable:mock
npm run data:activate:resumable:live
npm run ops:summary
npm run report:generate:daily
npm run report:generate:weekly
npm run report:generate:daily:live
npm run report:generate:weekly:live
npm run report:candidate:daily
npm run report:candidate:weekly
npm run scheduled:hourly:dry-run
npm run scheduled:daily:dry-run
npm run scheduled:weekly:dry-run
npm run auth:bootstrap-admin
npm run external:learnprompt:diff
npm run supabase:public-contract
npm run test
npm run lint
npm run typecheck
npm run validate:data
npm run sensitive:scan
npm run cloudflare:build
npm run mirror:build
npm run build
```

`npm run external:learnprompt:diff` is a read-only source-repair diagnostic. It compares the current public AI Radar snapshot with LearnPrompt AI News Radar public JSON and surfaces high-score external 24h signals missing from our snapshot. It accepts `--base-url`, `--learnprompt-dir`, or `LEARNPROMPT_AI_NEWS_RADAR_BASE_URL`; it does not write to Supabase and does not create formal reports. The same boundary powers `/admin/source-gaps`, which is operator/admin-only and classifies external unreviewed signals into source-repair actions, registry/source-health context, and no-write decision previews.

`npm run supabase:public-contract` is the release-gate check for the remote Supabase public read contract. It uses only public anon configuration, expects `public_radar_items?select=id,local_id,entities` to be readable, and expects `public_radar_items?select=raw_item_id` to be rejected. It prints structured status only and does not echo Supabase keys or URLs. If it reports `supabase_project_host_dns_not_found`, verify the Supabase project is active before treating it as an application regression.

## Deployment Milestone D (Preview + Operating Loop)

Milestone D tracks Vercel preview readiness and smoke verification.

- Local validation and deployment-readiness checks are passing (`npm run check:deployment`).
- Preview deployment is now created. Use active alias `https://ai-radar-web-luosongred-5507-luosongred-5507s-projects.vercel.app`; project-wide Preview env vars are configured, and this runner still cannot access `.vercel.app` hosts for live smoke checks.
- Use [Deployment Preview — Milestone D](./docs/deployment-preview-milestone-d.md) for exact callback URL, env status, and user-side smoke checklist.
- No public launch claim is made until preview checks are completed.

## Milestone E Operating Loop

Milestone E documents the operator-run loop for Preview refreshes, controlled persistence, report candidates, admin review, and Preview smoke checks. Use [Milestone E Operating Loop Runbook](./docs/operating-loop-milestone-e.md) as the command sequence.

The short path is `npm run ops:dry-run`, `npm run ops:reports`, optional bounded `npm run ops:refresh:live`, temporary-gated `npm run ops:full:live:persist`, `/admin/review`, then Preview smoke. Milestone E does not enable Production deploys, scheduled writes, X/WeChat auto-crawl, or source-health writes.

## Milestone G Production Launch Candidate

Milestone G moved the production-ready code from `codex/milestone-e-operating-loop` to `main`, configured Vercel Production env with values redacted, and deployed a stable Production alias:

`https://ai-radar-web-luosongred-5507s-projects.vercel.app`

See [Milestone G Production Launch Candidate](./docs/production-launch-milestone-g.md) for the final callback URL, smoke results, DNS note, rollback plan, and launch limitations. Production keeps `ENABLE_SUPABASE_WRITES=false`, scheduler flags disabled, X/WeChat automation disabled, and live DeepSeek disabled for scheduled jobs.

## Retired Access Fallback

The historical GitHub Pages fallback is retired and is not part of the build, workflow, deployment, or public product. Cloudflare Pages is the primary public surface; Vercel remains the dynamic/reference application.

## Milestone M Reviewed Refresh

Milestone M adds a manual GitHub Actions workflow for bounded data refresh, optional mutation-gated Supabase persistence, report quality gates, Cloudflare public snapshot build/deploy, and public-safe failure-family summaries.

- Workflow: `.github/workflows/radar-refresh-cloudflare.yml`
- Runbook: [Milestone M Reviewed Refresh and Cloudflare Workflow](./docs/ops-refresh-cloudflare-milestone-m.md)
- Report gates: [Milestone M Report Quality Gates](./docs/report-quality-gates-milestone-m.md)
- Final RC: [Final Release Candidate](./docs/release-candidate-final.md)

The workflow is `workflow_dispatch` only. It has no schedule. Supabase mutations require both `persist=true` and `RADAR_REFRESH_WRITE_GATE=true`; deployed/default `ENABLE_SUPABASE_WRITES` stays `false`.

Final RC public site is Cloudflare-first at `https://ai-industry-radar.pages.dev`. Vercel remains the reference/dynamic app. Public API responses and Cloudflare snapshots do not expose `model_metadata`, raw content, service-role-only operational table counts, or raw-pipeline conversion metrics.

## Source Registry

Phase 3 imports the user's AI learning/resource list from a local-only markdown file into `data/seed/sources/ai-learning-resources.cleaned.json`. Milestone A adds `data/seed/sources/official-ai-sources.json` as a hand-curated public official/high-signal extension that is loaded and imported with the cleaned registry.

The raw input stays under `local-input/` and is excluded from git. The import script strips private, internal, local, credentialed, attachment-only, and image-only links before writing seed data. Sources with no public homepage remain in the registry with `url: null`, `status: "needs_public_url"`, and manual-review risk flags.

Generated registry artifacts:

- `data/seed/sources/ai-learning-resources.cleaned.json` - cleaned public seed registry.
- `data/seed/sources/official-ai-sources.json` - curated public official/high-signal extension.
- `data/seed/sources/ai-learning-resources.audit.md` - counts, dedupe notes, URL-completion follow-up, and first ingestion candidates.
- `data/seed/sources/source-import-summary.json` - machine-readable import counts.
- `data/seed/sources/README.md` - registry policy and regeneration notes.

RSS feeds are recorded only when the input explicitly contains a public feed. X accounts are kept for future API/manual workflows. WeChat public-account style entries are preserved by name, but image-only contact methods are not committed and are not auto-crawled.

## Phase 4 Ingestion

Phase 4 adds a local, retry-safe ingestion runner that reads the cleaned registry, selects eligible public sources, fetches limited public metadata, normalizes raw items, deduplicates within the run, and writes ignored local artifacts.

Supported source-selection methods:

- `rss`
- `html`
- `api`
- `podcast_feed`
- `youtube_feed`

Current commands:

```bash
npm run ingest:sources:dry-run
npm run ingest:sources -- --limit 5 --max-items-per-source 5
npm run ingest:sources -- --method rss --limit 10
```

Generated outputs:

- `data/ingestion/latest/raw-items.json`
- `data/ingestion/latest/ingestion-run.json`
- `data/ingestion/runs/*.json`

Generated ingestion JSON is local and ignored by git. The Phase 4 runner does not use Supabase credentials, does not call DeepSeek, does not auto-crawl X accounts, and does not auto-crawl WeChat public-account sources. Sources that lack a reviewed public URL, require sign-in, use manual/future crawl methods, or point to private infrastructure are skipped.

## Phase 5 Understanding

Phase 5 reads `data/ingestion/latest/raw-items.json` and writes structured local radar items without inserting into Supabase.

Default commands:

```bash
npm run understand:items:mock
npm run understand:items -- --input data/ingestion/latest/raw-items.json --limit 5 --mode mock
npm run understand:items:live -- --limit 3
```

CLI options:

- `--input <path>` defaults to `data/ingestion/latest/raw-items.json`.
- `--limit <number>` defaults to `10`.
- `--mode <mock|live>` defaults to `mock`.
- `--max-text-chars <number>` defaults to `6000`.
- `--prompt-version <string>` defaults to `v0.1.0`.
- `--dry-run` prints the planned work without writing output files.

Generated outputs:

- `data/understanding/latest/radar-items.json`
- `data/understanding/latest/understanding-run.json`
- `data/understanding/runs/*.json`

Generated understanding JSON is local and ignored by git. Mock mode is deterministic and makes no API calls, so validation and builds work without DeepSeek credentials. Live mode requires `DEEPSEEK_API_KEY` and explicit `--mode live`; it uses `DEEPSEEK_FAST_MODEL` for relevance, language, categories, tags, summaries, and entities, and `DEEPSEEK_SMART_MODEL` for scoring rationale and why-it-matters hints.

Model output is validated before writing radar items. Final inclusion is controlled by code thresholds and scoring formula, not by the model alone:

```text
overall = relevance*0.30 + importance*0.20 + credibility*0.20 + novelty*0.15 + freshness*0.10 + source_weight*0.05
```

Items below `0.35` relevance are excluded, items from `0.35` to `0.60` need review, and higher-relevance low-credibility items still need review. Each radar item logs prompt version, model names, input/output hashes, API-call count, estimated/token usage when available, and error state.

## Phase 6 Retrieval Foundation

Phase 6 added retrieval over validated local radar items. Public assistant routes have since been removed; retrieval remains a server-side foundation for report seeding, evidence filtering, and internal quality checks.

Retrieval can read Supabase radar items when enabled, otherwise it reads `data/understanding/latest/radar-items.json` when it exists and falls back to existing synthetic mock radar data when local outputs are absent or invalid. Responses report the data source as `supabase_radar_items`, `local_understanding_output`, `mock_data`, or `empty`, include a resolved time window, cite retrieved radar items, and state uncertainty. Items marked `needs_review` are surfaced with caveats instead of treated as fully confirmed.

Default validation and builds must continue to use mock/local data. Live DeepSeek generation is not exposed through a public assistant API.

## Phase 7 Supabase Persistence

Phase 7 adds dry-run-first scripts that map local Phase 3/4/5 artifacts to Supabase-backed tables. The scripts do not require Supabase environment variables in dry-run mode and do not write unless both conditions are true:

- the command is passed `--write`
- `ENABLE_SUPABASE_WRITES=true`

Commands:

```bash
npm run supabase:import:sources
npm run supabase:persist:ingestion
npm run supabase:persist:understanding
npm run source-health:dry-run
```

Apply the Phase 7 Supabase migrations to an existing Supabase project before enabling write mode:

```bash
supabase/migrations/202605140001_phase7_persistence.sql
supabase/migrations/202605140002_phase7_upsert_constraints.sql
supabase/migrations/202605140003_public_retrieval_view.sql
```

The second migration fixes the plain unique constraints required by the dry-run-first persistence upserts. The third migration creates `public.public_radar_items`, a public-safe read view for retrieval. Do not re-run the full skeleton schema against an existing project as a migration substitute.

Phase 9.5 adds a reviewable auth/admin RLS migration:

```bash
supabase/migrations/202605140004_auth_admin_rls.sql
```

Apply it manually in the Supabase SQL Editor before expecting browser-authenticated users to read their own profile and role rows. Do not apply it from this task or as part of validation.

Phase 9.4 adds a reviewable admin workflow migration:

```bash
supabase/migrations/202605140005_admin_review_workflows.sql
```

Apply it manually only after the auth/admin RLS migration has been reviewed and applied. It creates `review_tasks`, `source_change_requests`, `report_candidates`, and `admin_audit_events` with RLS, no anon access, authenticated admin/editor read policies, and no authenticated browser write grants. Do not apply it from validation.

Milestone B adds a reviewable report workflow migration:

```bash
supabase/migrations/202605190001_reports_workflow.sql
```

Apply it manually after the Phase 9.4 review workflow migration. It adds report-candidate `deferred` status plus public-safe `public_report_candidates` and `public_reports` views for `/reports`. It grants read access to display fields only and does not grant browser writes.

Retrieval is server-side and read-only. It uses the public Supabase anon key against the `public_radar_items` view when `ENABLE_SUPABASE_RETRIEVAL=true`; service-role access remains server-only. Public homepage/radar/entity/report coverage summaries use `lib/data-completeness/public-safe-summary.ts`, derived from public snapshot/public view fields and visible feed counts. Ingestion, understanding, source import, and bootstrap scripts remain gated by `--write` plus `ENABLE_SUPABASE_WRITES=true`. Admin review mutations use server actions in `lib/admin/actions.ts`, require `ENABLE_ADMIN_REVIEW_WRITES=true`, require the signed-in admin role first, sanitize inputs, and write `admin_audit_events`. The anon key can read only public-safe radar item fields from the view, not raw tables, raw item identifiers, raw text, model metadata, operational logs, or write surfaces.

Retrieval order for server-side evidence consumers is:

1. Supabase public radar item view rows when `ENABLE_SUPABASE_RETRIEVAL=true` and public Supabase config exists.
2. Local generated radar items under `data/understanding/latest/`.
3. Synthetic mock data.

Public UI coverage order is separate from Admin/CLI operations: public pages prefer the generated public snapshot, then visible public feed counts. They do not query service-role-only operational tables such as raw item stores, ingestion runs, source-health history, API usage logs, or review workflow internals. Public snapshots and the Supabase public radar view may include public-safe entity `name/type/confidence` for reader tracking and static entity details, but not raw item identifiers, entity evidence text, raw source text, raw-pipeline conversion rates, or service-role operational table counts. Deeper source-health failure reasons stay in Admin/export diagnostics.

Before enabling Supabase-backed retrieval for a release, run `npm run supabase:public-contract`. A passing result confirms the remote anon role can read only the intended public fields and cannot select `raw_item_id`. A DNS failure for the project host is an environment/project-availability blocker, not proof that the public view contract is unsafe.

## Phase 10.5 Data Activation

The activation workflow runs a bounded source-to-radar refresh from the merged source registries, with mock understanding by default and optional live DeepSeek only when the local/deployment environment is already configured.

```bash
npm run data:activate:mock
npm run data:status
npm run data:activate:live -- --limit 3 --max-items-per-source 3
```

Milestone E wraps these lower-level commands with `npm run ops:*` operating-loop scripts. See [Milestone E Operating Loop Runbook](./docs/operating-loop-milestone-e.md) before persisting or reviewing report candidates.

To persist a reviewed live run, enable Supabase mutations only for that process:

```powershell
$env:ENABLE_SUPABASE_WRITES="true"
npm run data:activate:live:persist -- --limit 3 --max-items-per-source 3
Remove-Item Env:ENABLE_SUPABASE_WRITES
```

To persist an already-reviewed latest local run without repeating fetch/model work, add `--skip-ingest --skip-understand`. For mock-only activation, use `npm run data:activate:persist` with the same temporary write gate.

The activation script never edits `.env.local`, never prints API keys, does not run scheduled jobs, and does not crawl X or WeChat sources automatically. Regular local Supabase-first product pages require setting `ENABLE_SUPABASE_RETRIEVAL=true` in `.env.local` or in the temporary process environment after the public retrieval view has rows.

## Phase 9.1 Deployment Hardening

Phase 9.1 adds deployment readiness documentation without deploying the app. Vercel-first hosting, Supabase environment boundaries, pre-deployment checks, smoke checks, rollback steps, and no-deploy blockers are documented in `docs/deployment-hardening.md`.

No scheduled persistence, production Supabase mutations, or live DeepSeek job runs are enabled by this phase.

## Phase 9.2 Scheduled Dry-Run Jobs

Phase 9.2 adds a GitHub Actions-first scheduled dry-run workflow at `.github/workflows/radar-scheduled-dry-run.yml`.

The workflow supports manual dispatch and an hourly cron. It installs dependencies, runs lint/typecheck/data validation/sensitive scan, then runs:

```bash
npm run scheduled:hourly:dry-run
```

The scheduled runner uses bounded public-source ingestion and mock understanding only. It writes ignored summary artifacts under:

- `data/scheduled/latest/scheduled-run.json`
- `data/scheduled/runs/*.json`

The workflow explicitly sets `ENABLE_SUPABASE_WRITES=false`, `ENABLE_SUPABASE_RETRIEVAL=false`, `ENABLE_SCHEDULED_PERSISTENCE=false`, `ENABLE_LIVE_DEEPSEEK_IN_JOBS=false`, `ENABLE_X_API=false`, and `ENABLE_WECHAT_AUTH=false`. It does not pass `--write`, persist to Supabase, run live DeepSeek, write source-health history, use the X API, or auto-crawl WeChat public accounts. Daily 08:00 Beijing and Monday 09:00 Beijing report jobs remain documented future work, not scheduled write/report jobs.

## Phase 9.4 Admin Review Workflows

Phase 9.4 adds the protected `/admin/review` route and server-only helpers under `lib/admin/`. Phase 9.4b turns that foundation into controlled admin actions. The route is protected by the existing admin layout and shows review queues for radar items needing review, sources missing public URLs, source change requests, report candidates, and recent audit events.

Review mutations are implemented as Next.js server actions. They re-check the signed-in admin role, require `ENABLE_ADMIN_REVIEW_WRITES=true`, resolve the actor from Supabase Auth/profile rows, use service-role access only server-side for the controlled write, sanitize mutation errors, and write an audit event for each successful mutation. The route does not apply migrations, run scheduled jobs, run source-health writes, call live DeepSeek, or change public radar/entity/report access.

## Phase 9.5 Auth and Admin Protection

Phase 9.5 wires Supabase Email magic links, GitHub OAuth initiation, sanitized auth callbacks, and server-side `/admin` authorization. `/admin` and `/admin/*` require an authenticated Supabase user whose highest role in `user_roles` is `admin`. Unauthenticated users are sent to `/auth/login?next=/admin...`; authenticated non-admin users are sent to `/unauthorized`.

`/`, `/radar`, `/reports`, and `/entities` remain public. Navigation is only a convenience surface; server-side role checks enforce admin access.

Bootstrap the first admin only after the admin account has signed in once:

```bash
npm run auth:bootstrap-admin
```

The bootstrap script is dry-run by default. Mutation mode requires `--write`, `ENABLE_SUPABASE_WRITES=true`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_EMAIL`; it does not create Auth users and does not print the configured email, keys, tokens, or cookies.

## Phase 10 Radar And Reports Productization

Phase 10 turns `/radar` and `/reports` into public product surfaces backed by the same safe retrieval fallback chain used by report generation.

`/radar` now loads a reusable server-side radar feed from read-only Supabase retrieval when enabled, local understanding output when present, or mock data as a disclosed fallback. The page shows data source, freshness, caveats, status counts, category counts, source-tier counts, server-side query filters, dense evidence rows, `needs_review` warnings, excluded/failed transparency, visible citations, and an evidence-to-insight panel that links visible signals to entity detail pages, report drafts, and report review.

`/reports` now prefers saved daily/weekly report candidates or reports from public-safe Supabase report views, then local reviewed public-report snapshots in `data/public-reports/`, then deterministic generated drafts from available radar items. The surface distinguishes formal reviewed/published reports from evidence drafts and shows publishing readiness: formal reports, publishable candidates, approved candidates, items needing review, and blocked drafts. The reports and drafts include time window, data source, report status, report quality gate status, usable item count, citation count, source/category diversity, sections for model/product/company updates, research/open-source, agents/products, business/ecosystem, weak signals / `needs_review`, caveats, citations, missing evidence, Markdown copy/export, a detail route, an evidence-to-report path that explains how public evidence becomes a formal admin-reviewed report, report-to-entity traceability panels that link report evidence back to entity detail pages, and section-level entity coverage that shows which entities support each report section. When a local reviewed public report references public source IDs that are missing from the current radar feed, `/reports` supplements traceability from the read-only local public snapshot without changing the normal radar feed source.

Generated drafts are not published reports unless their status is `published`. A daily candidate must have at least 5 usable items, 3 citations, 2 distinct sources, and 2 categories when categories are available. A weekly candidate must have at least 20 usable items, 8 citations, 5 distinct sources, and 3 categories when categories are available. Failed gates remain `needs_review` with `quality_gate_reasons`. Default report generation does not call live DeepSeek, does not write to Supabase, does not run scheduled persistence, and does not claim complete current AI industry coverage.

Report generation and candidate persistence commands:

```bash
npm run report:generate:daily
npm run report:generate:weekly
npm run report:generate:daily:live
npm run report:generate:weekly:live
npm run report:candidate:daily
npm run report:candidate:weekly
```

Controlled report-candidate writes require a temporary write gate and insert only `report_candidates` plus an admin audit event:

```powershell
$env:ENABLE_SUPABASE_WRITES="true"
npm run report:candidate:daily:write
npm run report:candidate:weekly:write
Remove-Item Env:ENABLE_SUPABASE_WRITES
```

Approved report-candidate publication is a separate signed-in admin flow on `/admin/review`. It uses server actions that re-check the admin role, use service-role access only after authorization, create or update a `reports` row with `reviewed` or `published` status, update candidate publication metadata, and write `admin_audit_events`. `/admin/review` also shows a report publishing funnel so operators can distinguish draft, needs-review, approved, publishable, published, evidence-blocked, and rejected/deferred states before taking action.

Committed local public reports in `data/public-reports/` are read-only reviewed snapshots for Cloudflare and local fallback builds. They must use public evidence IDs and URLs, must not contain `model_metadata`, raw content, token usage, or private notes, and are validated by `npm run validate:data` plus smoke tests. They do not replace the signed-in Supabase admin publication path for production report writes.

`npm run data:activate:*` can refresh bounded ingestion and understanding output, optionally persist it through the existing Supabase write gates, and report the current radar data source for `/radar` and `/reports`.

## Environment Variables

Copy `.env.example` to `.env.local` or another untracked local environment file and fill values only on your machine. Store deployed values only in the deployment platform environment variable manager. Do not commit `.env`, `.env.local`, or filled environment files.

Core variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
DEEPSEEK_SMART_MODEL=deepseek-v4-pro
APP_BASE_URL=
ADMIN_EMAIL=
ENABLE_X_API=false
ENABLE_WECHAT_AUTH=false
ENABLE_SUPABASE_RETRIEVAL=false
ENABLE_SUPABASE_WRITES=false
ENABLE_PUBLIC_LIVE_DEEPSEEK=false
ENABLE_ADMIN_REVIEW_WRITES=false
ENABLE_SCHEDULED_INGESTION=false
ENABLE_SCHEDULED_PERSISTENCE=false
ENABLE_LIVE_DEEPSEEK_IN_JOBS=false
```

The app builds when Supabase and DeepSeek variables are missing. UI pages show setup placeholders instead of crashing.

## API Key Handling

Never paste DeepSeek API keys into Codex task text, ChatGPT messages, GitHub issues, commits, docs, or logs. Store local keys only in `.env.local` or equivalent untracked environment files, and store deployed keys only in the deployment platform environment variable manager.

Keep `.env.example` blank for secret values:

```bash
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
DEEPSEEK_SMART_MODEL=deepseek-v4-pro
```

Mock mode requires no DeepSeek key and is the default for validation and builds. Live mode requires `DEEPSEEK_API_KEY` plus an explicit `--mode live` or the `understand:items:live` script. If a key is accidentally pasted into a prompt, task, log, issue, commit, or doc, rotate or revoke it before any live use.

For one-time local DeepSeek setup, add these values to `.env.local` without pasting the key into Codex, ChatGPT, GitHub, docs, or logs:

```bash
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
DEEPSEEK_SMART_MODEL=deepseek-v4-pro
```

After the key is present, use `npm run data:activate:live` for a bounded live understanding check. Controlled Supabase persistence still requires temporary `ENABLE_SUPABASE_WRITES=true` plus `npm run data:activate:live:persist`. Scheduled live DeepSeek remains disabled until a later phase.

## App Routes

- `/` - public Today Radar homepage with Top 3 events, reader category entry points, source health, and report status
- `/radar` - filterable public radar list over Supabase/local/mock retrieval evidence with counts, caveats, freshness, review state, and citations
- `/entities` - public evidence-derived entity tracking queue with reasons, next checks, entity detail links, radar evidence links, and report-path links
- `/entities/[entityId]` - public entity detail page with evidence graph, source/category/status coverage, timeline, citations, and next checks
- `/reports` - formal reviewed/published reports separated from evidence drafts, with publishing readiness, status, sections, caveats, missing evidence, citations, report and section entity traceability, and Markdown export
- `/reports/[id]` - saved report/candidate detail route with status, sections, citations, report and section entity traceability, caveats, and Markdown export
- `/admin` - production-safe admin operations console entry point
- `/admin/review` - protected admin review workflow for review tasks, missing public URLs, source-change requests, report candidates, and audit rows
- `/admin/source-gaps` - protected LearnPrompt source-repair diagnostics with external unreviewed signals, registry/source-health context, and no-write decision previews
- `/admin/sources` - cleaned registry review queue, crawl eligibility, tier distribution, and dry-run plus mutation-gated import boundaries
- `/admin/ingestion` - source registry to ingestion to understanding to persistence to retrieval chain, local ignored outputs, and separated dry-run plus mutation-gated command documentation
- `/admin/scoring` - scoring formula, inclusion thresholds, source weight, confidence, and model-authority boundaries
- `/admin/settings` - boolean-only environment, feature flag, provider, scheduled-job, and secret-boundary status
- `/unauthorized` - signed-in but insufficient-role page
- `/auth/login` - Supabase Email magic link and GitHub OAuth sign-in UI
- `/auth/callback` - Supabase OAuth callback route
- `/auth/logout` - Supabase sign-out route

## Supabase Setup

Use `supabase/schema.sql` to create the initial tables and `supabase/seed.sql` for safe synthetic demo rows. See `supabase/README.md`.

The schema covers `users_profile`, `user_roles`, `sources`, source health checks, raw/radar items, event clusters, entities, scores, reports, saved items, annotations, ingestion runs, API usage logs, and system settings. Phase 7 schema changes live in `supabase/migrations/202605140001_phase7_persistence.sql`, `supabase/migrations/202605140002_phase7_upsert_constraints.sql`, and `supabase/migrations/202605140003_public_retrieval_view.sql`. Phase 9.5 auth/admin RLS lives in `supabase/migrations/202605140004_auth_admin_rls.sql`. Phase 9.4 review workflow tables live in `supabase/migrations/202605140005_admin_review_workflows.sql`. Milestone B public-safe report workflow views and candidate deferral live in `supabase/migrations/202605190001_reports_workflow.sql`. Milestone M public-safe report quality-gate projection lives in `supabase/migrations/202605250001_report_quality_gate_public_views.sql`. The 2026-07-01 public radar view refresh in `supabase/migrations/202607010001_public_radar_items_entities.sql` adds entity `name/type/confidence` to `public_radar_items` without exposing raw item identifiers or entity evidence text.

## Auth Setup

Supabase Email magic links are the first supported provider. GitHub OAuth is supported by the UI/code path after the GitHub provider is configured in the Supabase dashboard. Configure provider callbacks in Supabase, then add:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=
```

Roles are `admin`, `editor`, and `viewer`; highest role wins in the order `admin > editor > viewer`. Server-side admin authorization checks the Supabase user and `user_roles`. Service-role access is limited to server-only bootstrap/scripts and the role-gated admin review actions.

WeChat auth is a placeholder only. Keep `ENABLE_WECHAT_AUTH=false` unless a future phase adds a real supported provider.

## DeepSeek Boundary

`lib/deepseek/provider.ts` defines a provider abstraction for:

- `deepseek-v4-flash`: relevance filtering, summarization, tagging, classification
- `deepseek-v4-pro`: scoring, report generation

Phase 5 keeps ingestion fetching separate from DeepSeek. Mock understanding is the default. Live understanding calls use an OpenAI-compatible chat-completions request only when `--mode live` is passed and `DEEPSEEK_API_KEY` exists locally.

## Validation

The repository includes JSON schema/seed validation and a sensitive-content scan.

```bash
npm run lint
npm run typecheck
npm run test
npm run validate:data
npm run sensitive:scan
npm run build
```

## Current Limitations

- Ingestion still writes ignored JSON artifacts before optional persistence.
- Understanding still writes ignored JSON artifacts before optional persistence.
- Scheduled dry-run jobs write ignored summary artifacts only and do not persist.
- Supabase write scripts are dry-run by default and are not production scheduled jobs.
- Supabase-backed retrieval is feature-flagged, reads only the public-safe view, and falls back to local/mock data.
- HTML ingestion records metadata-level summaries; it is not a full crawler.
- YouTube ingestion records a placeholder only; video ingestion is not implemented.
- Supabase insertion from ingestion and understanding outputs is available only through explicit activation or persistence commands with the write gate enabled.
- Supabase-backed retrieval requires applying the public retrieval view migration before enabling the flag.
- No automatic live DeepSeek calls; activation live mode must be explicit and requires an environment key.
- Admin role bootstrap write mode still requires a manual operator approval step and explicit write gates.
- No working WeChat login.
- No scheduled production persistence or report publication jobs yet.
- Milestone M refresh is manual GitHub Actions dispatch only; it does not add scheduled writes.
- Report candidate generation and persistence are manual and mutation-gated; approved-candidate report publication is manual, admin-only, and audited.
- Approved candidates are not formal public reports until `/admin/review` saves or publishes a `reports` row with `reviewed` or `published` status.
- Local public report snapshots are formal only when they explicitly use `saved_report` plus `reviewed` or `published`; they are a read-only fallback source, not an automatic publishing path.
- Report quality gates block thin candidates from being presented as useful reports, but they do not automatically publish or reject candidates.
- Admin review workflow tables require the Phase 9.4 migration before actions can persist rows; review actions are server-side/admin-only and audited.
- Mock radar data is synthetic and does not describe current real-world events; local understanding output may also be metadata-only and should not be treated as complete industry coverage.
- Many useful source names still need manual public URL completion before ingestion.

## Next Phases

- Supabase Production callback confirmation, signed-in admin smoke coverage, controlled scheduled persistence design, source-health write approval, and public announcement readiness
