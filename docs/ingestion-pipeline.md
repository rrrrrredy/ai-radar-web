# Ingestion Pipeline

Phase 4 builds on the Phase 3 cleaned source registry. It provides the first local public-source ingestion foundation without Supabase insertion or DeepSeek calls.

## Pipeline Stages

1. Select active or trial public sources from the merged seed registries:
   `ai-learning-resources.cleaned.json` and `official-ai-sources.json`.
2. Fetch source data through public pages, public feeds, or public APIs.
3. Normalize raw items.
4. Deduplicate by canonical URL, external ID, and content hash.
5. Log the ingestion run and write local artifacts.

Phase 5 now classifies topics, summarizes, tags, extracts entities, and scores items into local radar-item artifacts. Phase 6 reads those artifacts for retrieval-backed Q&A and writing assistance. Phase 7 adds dry-run-first Supabase persistence for these local artifacts. Phase 9.2 adds GitHub Actions scheduled dry-runs while keeping scheduled persistence and production writes deferred. Phase 10.5 adds a one-shot activation script for bounded ingestion, optional live DeepSeek understanding, and explicit write-gated Supabase persistence. Milestone A adds an official/high-signal source extension and prioritizes eligible official sources during bounded activation. Milestone E documents the Preview operating loop in [operating-loop-milestone-e.md](./operating-loop-milestone-e.md).

## Phase 4 Commands

```bash
npm run ingest:sources:dry-run
npm run ingest:sources -- --limit 5 --max-items-per-source 5
npm run ingest:sources -- --method rss --limit 10
```

CLI options:

- `--limit <number>` defaults to `10`.
- `--method <rss|html|api|podcast_feed|youtube_feed|all>` defaults to `all`.
- `--source <source-id>` selects a single eligible source.
- `--dry-run` lists selected sources without fetching.
- `--max-items-per-source <number>` defaults to `10`.

## Phase 4 Fetchers

- `rss`: fetches public RSS/Atom feeds and extracts basic item metadata.
- `html`: fetches one public page, extracts title, canonical URL, meta description, and a small link sample.
- `api`: uses unauthenticated public GitHub repository APIs for repository metadata or releases.
- `podcast_feed`: parses a recorded public podcast feed.
- `youtube_feed`: records a metadata placeholder and does not scrape videos.

## Local Outputs

The runner overwrites:

- `data/ingestion/latest/raw-items.json`
- `data/ingestion/latest/ingestion-run.json`

It also writes timestamped JSON under `data/ingestion/runs/`. Generated ingestion JSON files are ignored by git.

## Phase 7 Persistence Commands

```bash
npm run supabase:persist:ingestion
npm run supabase:persist:understanding
```

Both commands read the latest local JSON artifacts and print the rows that would
be upserted. They do not require Supabase environment variables in dry-run mode.
Actual writes require `--write` and `ENABLE_SUPABASE_WRITES=true`, and should only
be run after applying the Phase 7 Supabase migrations in order:
`202605140001_phase7_persistence.sql`,
`202605140002_phase7_upsert_constraints.sql`, and
`202605140003_public_retrieval_view.sql`.

## Phase 10.5 Activation Commands

The activation script reads the merged source registries, runs bounded public-source ingestion, runs mock understanding by default, and can persist the selected source rows, ingestion rows, and radar rows through the same Supabase write gate.

```bash
npm run data:activate:mock
npm run data:status
npm run data:activate:live -- --limit 3 --max-items-per-source 3
```

Use the Milestone E runbook for the full Preview sequence through `npm run ops:dry-run`, optional `npm run ops:refresh:live`, controlled persist, report candidate generation, admin review, and Preview smoke.

DeepSeek is configured once through `.env.local` locally or through the deployment environment manager:

```bash
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
DEEPSEEK_SMART_MODEL=deepseek-v4-pro
```

Do not paste the key into Codex, ChatGPT, GitHub, docs, or logs. When a live run has been reviewed, persist with a temporary process flag only:

```powershell
$env:ENABLE_SUPABASE_WRITES="true"
npm run data:activate:live:persist -- --limit 3 --max-items-per-source 3
Remove-Item Env:ENABLE_SUPABASE_WRITES
```

If a successful live run already exists locally and only persistence is needed,
use `--skip-ingest --skip-understand` with the same temporary write gate. This
persists the latest ignored local artifacts without repeating DeepSeek calls.
For mock-only activation, use `npm run data:activate:persist` with the same gate.

For regular local product-page use after rows exist in `public.public_radar_items`, set `ENABLE_SUPABASE_RETRIEVAL=true` in `.env.local` or the process environment. The activation script does not edit `.env.local`.

## Scheduling

Phase 9.2 uses GitHub Actions first for scheduled dry-runs. The workflow lives at `.github/workflows/radar-scheduled-dry-run.yml`, supports manual dispatch, and runs an hourly cron against:

```bash
npm run scheduled:hourly:dry-run
```

The scheduled runner executes bounded public-source ingestion, then mock understanding with `dryRun: true`, and writes ignored summary artifacts under `data/scheduled/latest/` and `data/scheduled/runs/`.

Scheduled jobs do not pass `--write`, persist to Supabase, run live DeepSeek, write source-health history, use the X API, or auto-crawl WeChat public accounts. Daily 08:00 Beijing and Monday 09:00 Beijing report jobs remain future work until controlled scheduled persistence is explicitly approved.

Jobs should remain idempotent, safe to retry, and observable through run summaries before database persistence is added.

## Failure Handling

Record source-level errors without failing the full run when possible. Pause sources only after repeated failures or policy violations.

The Phase 4 runner records failed and skipped sources in the run summary, then continues with the remaining selected sources. If every selected source fails, the run is marked failed; mixed success is marked partial.

## Phase 3 Source Selection

Good first ingestion candidates are listed in `data/seed/sources/ai-learning-resources.audit.md`. Start with records that have:

- `status: "active"`
- `crawl_method` of `rss`, `html`, `api`, `podcast_feed`, or `youtube_feed`
- no `needs_public_url` risk flag
- no unresolved private/internal link notes

Keep these out of automated Phase 4 ingestion until later:

- `status: "needs_public_url"` records
- X accounts marked `x_api_future`
- WeChat public-account style entries without a public homepage/feed
- books and courses marked `no_crawl` or `manual`
- platform pages that require manual handling or special API terms

## Public-only Boundary

Ingestion must fetch public information only. Do not use private intranet links, local files, credentialed URLs, cookies, API keys, non-public attachments, or image-only contact references. If a source cannot be fetched through a public URL or compliant public API, keep it manual and record the reason in source health or review metadata.

## DeepSeek Boundary

Phase 4 does not call DeepSeek. Fetching stays public-source only and model-free.

Phase 5 runs after ingestion:

```bash
npm run understand:items:mock
npm run understand:items -- --limit 3 --mode mock
```

The understanding layer reads `data/ingestion/latest/raw-items.json`, writes `data/understanding/latest/radar-items.json` and `data/understanding/latest/understanding-run.json`, and keeps generated JSON ignored by git. Mock mode is deterministic and safe for builds. Live mode requires `--mode live` or `npm run data:activate:live` plus a configured local DeepSeek key.

Model output is validated before radar items are written. Final inclusion uses deterministic thresholds and a source-weighted score formula rather than model preference alone.

## Phase 6 Retrieval Consumers

`/ask`, `/write`, `/api/ask`, and `/api/writing-assistant` read Supabase radar items first only when `ENABLE_SUPABASE_RETRIEVAL=true` and Supabase public config is present. Supabase retrieval is server-side and read-only through the anon key against `public.public_radar_items`, a public-safe view that excludes raw text, raw metadata, model metadata, operational logs, private/internal URLs, and write access. Service-role access remains limited to explicit write scripts. If Supabase is disabled, unavailable, the view is missing, or the view returns no usable rows, retrieval reads `data/understanding/latest/radar-items.json`. If that local generated file is missing or invalid, it uses synthetic mock radar items and discloses `mock_data` in the response.

Generated ingestion and understanding JSON remains local and ignored by git. Phase 6 does not insert into Supabase, does not add production scheduled jobs, and does not run live DeepSeek calls unless an API request explicitly asks for live mode and the server has a local key.
