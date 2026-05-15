# AI Industry Radar

AI Industry Radar is a bilingual AI industry radar website for AI practitioners, product managers, researchers, investors, internal colleagues, non-technical readers, and the author.

It is designed around three core questions:

- What happened in AI today?
- Which events are real hotspots?
- Which models, products, companies, papers, and people are worth tracking?

Planned capabilities include source ingestion, ranking, clustering, bilingual summaries, an admin dashboard, DeepSeek-powered Q&A, daily and weekly reports, writing assistant mode, source health monitoring, and private source management.

The project uses public information only. Secrets, API keys, service tokens, cookies, and private credentials must be stored in environment variables and never committed.

## Maintainer

- Maintainer: Song Luo
- Email: luosongred@gmail.com
- GitHub: https://github.com/rrrrrredy

## Current Scope

This repository now contains a Next.js App Router skeleton, Tailwind styling, Supabase database/auth helpers, a DeepSeek provider abstraction, synthetic demo data, an admin dashboard skeleton, validation scripts, a Phase 3 cleaned public source registry, a Phase 4 local public-source ingestion foundation, a Phase 5 local understanding layer, a Phase 6 retrieval-backed Q&A and writing assistant foundation, and a Phase 7 dry-run-first Supabase persistence layer.

The implementation is intentionally an application foundation, not the full product. It can run limited local ingestion and understanding smoke tests, dry-run Supabase persistence plans, answer questions against Supabase/local/mock radar evidence, and generate writing seeds with caveats, but it does not run production Supabase writes, enforce hard admin blocking, run scheduled jobs, or generate full daily/weekly reports yet. DeepSeek live calls are opt-in only.

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
npm run ingest:sources:dry-run
npm run ingest:sources -- --limit 3 --max-items-per-source 3
npm run understand:items:mock
npm run understand:items -- --limit 3 --mode mock
npm run supabase:import:sources
npm run supabase:persist:ingestion
npm run supabase:persist:understanding
npm run source-health:dry-run
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

## Phase 6 Q&A and Writing Assistant

Phase 6 adds retrieval over validated local radar items and deterministic mock/local generation for `/ask`, `/write`, `/api/ask`, and `/api/writing-assistant`.

Retrieval can read Supabase radar items when enabled, otherwise it reads `data/understanding/latest/radar-items.json` when it exists and falls back to existing synthetic mock radar data when local outputs are absent or invalid. Responses report the data source as `supabase_radar_items`, `local_understanding_output`, `mock_data`, or `empty`, include a resolved time window, cite retrieved radar items, and state uncertainty. Items marked `needs_review` are surfaced with caveats instead of treated as fully confirmed.

Default API behavior uses `generationMode: "mock"` and does not require Supabase credentials, login, or a DeepSeek key:

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "content-type: application/json" \
  -d "{\"question\":\"过去24小时内谁发布了新模型？\",\"language\":\"zh\",\"generationMode\":\"mock\"}"

curl -X POST http://localhost:3000/api/writing-assistant \
  -H "content-type: application/json" \
  -d "{\"query\":\"帮我从今天热点里挑5条适合写行业观察的内容。\",\"language\":\"zh\",\"audience\":\"AI practitioners\",\"outputType\":\"topic_candidates\",\"generationMode\":\"mock\"}"
```

Live DeepSeek generation is available only when the request explicitly sets `generationMode: "live"` and the server environment has `DEEPSEEK_API_KEY`. Validation and builds must continue to use mock/local mode.

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

Retrieval is server-side and read-only. It uses the public Supabase anon key against the `public_radar_items` view when `ENABLE_SUPABASE_RETRIEVAL=true`; service-role access remains limited to explicit write scripts gated by `--write` plus `ENABLE_SUPABASE_WRITES=true`. The anon key can read only public-safe radar item fields from the view, not raw tables, raw text, model metadata, operational logs, or write surfaces.

Retrieval order for `/ask`, `/write`, `/api/ask`, and `/api/writing-assistant` is:

1. Supabase public radar item view rows when `ENABLE_SUPABASE_RETRIEVAL=true` and public Supabase config exists.
2. Local generated radar items under `data/understanding/latest/`.
3. Synthetic mock data.

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
ADMIN_EMAIL=luosongred@gmail.com
ENABLE_X_API=false
ENABLE_WECHAT_AUTH=false
ENABLE_SUPABASE_RETRIEVAL=false
ENABLE_SUPABASE_WRITES=false
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

## App Routes

- `/` - public Today homepage and mock radar preview
- `/radar` - radar list with static filter UI
- `/clusters` - synthetic event clusters
- `/entities` - synthetic entity cards
- `/reports` - report placeholders that explain the Phase 6 retrieval and writing foundation
- `/ask` - retrieval-backed Q&A over Supabase/local/mock radar-item evidence
- `/write` - evidence-bound writing assistant seeds and caveats over Supabase/local/mock evidence
- `/api/ask` - structured Q&A JSON API, mock/local by default
- `/api/writing-assistant` - structured writing-assistant JSON API, mock/local by default
- `/admin` - admin dashboard skeleton
- `/admin/sources` - cleaned registry summary, health-check eligibility, and Supabase persistence status
- `/admin/ingestion` - Phase 4/5 local ingestion, Phase 7 persistence commands, and output paths
- `/admin/scoring` - understanding scoring formula, dimensions, and negative rules
- `/admin/settings` - environment and feature flag status
- `/auth/login` - Supabase auth setup UI
- `/auth/callback` - Supabase OAuth callback route

## Supabase Setup

Use `supabase/schema.sql` to create the initial tables and `supabase/seed.sql` for safe synthetic demo rows. See `supabase/README.md`.

The schema covers `users_profile`, `user_roles`, `sources`, source health checks, raw/radar items, event clusters, entities, scores, reports, saved items, annotations, ingestion runs, API usage logs, and system settings. Phase 7 schema changes live in `supabase/migrations/202605140001_phase7_persistence.sql`, `supabase/migrations/202605140002_phase7_upsert_constraints.sql`, and `supabase/migrations/202605140003_public_retrieval_view.sql`.

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

Phase 5 keeps ingestion fetching separate from DeepSeek. Mock understanding is the default. Live understanding calls use an OpenAI-compatible chat-completions request only when `--mode live` is passed and `DEEPSEEK_API_KEY` exists locally.

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

- Ingestion still writes ignored JSON artifacts before optional persistence.
- Understanding still writes ignored JSON artifacts before optional persistence.
- Supabase write scripts are dry-run by default and are not production scheduled jobs.
- Supabase-backed retrieval is feature-flagged, reads only the public-safe view, and falls back to local/mock data.
- HTML ingestion records metadata-level summaries; it is not a full crawler.
- YouTube ingestion records a placeholder only; video ingestion is not implemented.
- No Supabase insertion from ingestion outputs.
- Supabase-backed retrieval requires applying the public retrieval view migration before enabling the flag.
- No automatic live DeepSeek calls.
- No hard admin route blocking yet.
- No working WeChat login.
- No scheduled production jobs yet.
- No generated daily/weekly reports.
- Radar item demo data is synthetic and does not describe current real-world events.
- Many useful source names still need manual public URL completion before ingestion.

## Next Phases

- Phase 7: Supabase persistence and source health checks
- Phase 8: scheduled jobs and deployment
- Phase 9: admin review workflows
