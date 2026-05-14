# Ingestion Pipeline

Phase 4 builds on the Phase 3 cleaned source registry. It provides the first local public-source ingestion foundation without Supabase insertion or DeepSeek calls.

## Pipeline Stages

1. Select active or trial public sources from `data/seed/sources/ai-learning-resources.cleaned.json`.
2. Fetch source data through public pages, public feeds, or public APIs.
3. Normalize raw items.
4. Deduplicate by canonical URL, external ID, and content hash.
5. Log the ingestion run and write local artifacts.

Phase 5 now classifies topics, summarizes, tags, extracts entities, and scores items into local radar-item artifacts. Supabase insertion, clustering, Q&A, and report generation remain later work.

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

## Scheduling

Use GitHub Actions or Vercel Cron for scheduled ingestion in a later phase. Phase 4 is local-only. Jobs should remain idempotent, safe to retry, and observable through run summaries before database persistence is added.

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

The understanding layer reads `data/ingestion/latest/raw-items.json`, writes `data/understanding/latest/radar-items.json` and `data/understanding/latest/understanding-run.json`, and keeps generated JSON ignored by git. Mock mode is deterministic and safe for builds. Live mode requires `--mode live` plus a local DeepSeek key.

Model output is validated before radar items are written. Final inclusion uses deterministic thresholds and a source-weighted score formula rather than model preference alone.
