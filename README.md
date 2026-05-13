# AI Industry Radar

AI Industry Radar is a bilingual AI industry radar website for AI practitioners, product managers, researchers, investors, internal colleagues, non-technical readers, and the author.

It is designed around three core questions:

- What happened in AI today?
- Which events are real hotspots?
- Which models, products, companies, papers, and people are worth tracking?

Planned capabilities include source ingestion, ranking, clustering, bilingual summaries, an admin dashboard, DeepSeek-powered Q&A, daily and weekly reports, writing assistant mode, source health monitoring, and private source management.

The project uses public information only. Secrets, API keys, service tokens, cookies, and private credentials must be stored in environment variables and never committed.

## Current Scope

This repository now contains a Next.js App Router skeleton, Tailwind styling, Supabase database/auth helpers, a DeepSeek provider abstraction, synthetic demo data, an admin dashboard skeleton, validation scripts, and a Phase 3 cleaned public source registry.

The implementation is intentionally an application foundation, not the full product. It does not ingest live sources, call DeepSeek, enforce hard admin blocking, or generate reports yet.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres
- Supabase Auth
- Email and GitHub auth support in code/config
- WeChat auth placeholder behind `ENABLE_WECHAT_AUTH`
- DeepSeek V4 Flash for low-cost filtering, summarization, tagging, and classification
- DeepSeek V4 Pro for scoring, report generation, and Q&A
- GitHub Actions and/or Vercel Cron for future scheduled ingestion

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Validation commands:

```bash
npm run import:sources
npm run lint
npm run typecheck
npm run validate:data
npm run sensitive:scan
npm run build
```

## Source Registry

Phase 3 imports the user's AI learning/resource list from a local-only markdown file into `data/seed/sources/ai-learning-resources.cleaned.json`.

The raw input stays under `local-input/` and is excluded from git. The import script strips private, internal, local, credentialed, attachment-only, and image-only links before writing seed data. Sources with no public homepage remain in the registry with `url: null`, `status: "needs_public_url"`, and manual-review risk flags.

Generated registry artifacts:

- `data/seed/sources/ai-learning-resources.cleaned.json` - cleaned public seed registry.
- `data/seed/sources/ai-learning-resources.audit.md` - counts, dedupe notes, URL-completion follow-up, and first ingestion candidates.
- `data/seed/sources/source-import-summary.json` - machine-readable import counts.
- `data/seed/sources/README.md` - registry policy and regeneration notes.

RSS feeds are recorded only when the input explicitly contains a public feed. X accounts are kept for future API/manual workflows. WeChat public-account style entries are preserved by name, but image-only contact methods are not committed and are not auto-crawled.

## Environment Variables

Copy `.env.example` to a local `.env` file and fill values only on your machine or deployment platform. Do not commit `.env`.

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
ADMIN_EMAIL=luosongred@gmail.com
ENABLE_X_API=false
ENABLE_WECHAT_AUTH=false
```

The app builds when Supabase and DeepSeek variables are missing. UI pages show setup placeholders instead of crashing.

## App Routes

- `/` - public Today homepage and mock radar preview
- `/radar` - radar list with static filter UI
- `/clusters` - synthetic event clusters
- `/entities` - synthetic entity cards
- `/reports` - report placeholders
- `/ask` - Q&A placeholder with retrieval/model boundary copy
- `/admin` - admin dashboard skeleton
- `/admin/sources` - mock source registry
- `/admin/ingestion` - mock ingestion runs
- `/admin/scoring` - scoring dimensions and negative rules
- `/admin/settings` - environment and feature flag status
- `/auth/login` - Supabase auth setup UI
- `/auth/callback` - Supabase OAuth callback route

## Supabase Setup

Use `supabase/schema.sql` to create the initial tables and `supabase/seed.sql` for safe synthetic demo rows. See `supabase/README.md`.

The schema covers `users_profile`, `user_roles`, `sources`, source health checks, raw/radar items, event clusters, entities, scores, reports, saved items, annotations, ingestion runs, API usage logs, and system settings.

## Auth Setup

Supabase Email and GitHub auth are the first supported providers. Configure them in Supabase, then add:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=luosongred@gmail.com
```

Roles are `admin`, `editor`, and `viewer`. Phase 2 structures role helpers and admin routes, but hard authorization enforcement should be added in the next implementation phase.

WeChat auth is a placeholder only. Keep `ENABLE_WECHAT_AUTH=false` unless a future phase adds a real supported provider.

## DeepSeek Boundary

`lib/deepseek/provider.ts` defines a provider abstraction for:

- `deepseek-v4-flash`: relevance filtering, summarization, tagging, classification
- `deepseek-v4-pro`: scoring, report generation, Q&A

Phase 2 does not make real DeepSeek calls. Functions return typed mock responses so UI and future integration points can compile safely.

## Validation

The repository includes JSON schema/seed validation and a sensitive-content scan.

```bash
npm run lint
npm run typecheck
npm run validate:data
npm run sensitive:scan
npm run build
```

## Current Limitations

- No live ingestion or scraping.
- No real DeepSeek API calls.
- No hard admin route blocking yet.
- No working WeChat login.
- No generated daily/weekly reports.
- Radar item demo data is synthetic and does not describe current real-world events.
- Many useful source names still need manual public URL completion before ingestion.

## Next Phases

- Phase 4: ingestion pipeline
- Phase 5: DeepSeek understanding layer
- Phase 6: Q&A and writing assistant
