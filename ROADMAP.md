# Roadmap

## Phase 0: Repository Skeleton - Done

- Created documentation, schemas, seed taxonomy, and validation script.
- Defined product, architecture, data model, and safety boundaries.
- Linked to the standalone AI Radar Skill as the canonical agent skill.

## Phase 2: Next.js Supabase App Skeleton - Done

- Initialized Next.js App Router, TypeScript, Tailwind CSS, ESLint, and build scripts.
- Added public homepage, radar, clusters, entities, reports, ask, admin, and auth callback routes.
- Added Supabase Postgres schema, safe synthetic seed rows, and auth helper skeletons.
- Added Email and GitHub auth support in code/config.
- Added WeChat auth placeholder behind `ENABLE_WECHAT_AUTH`.
- Added DeepSeek V4 Flash/Pro provider abstraction without real API calls.
- Added sensitive scan and full validation commands.

## Phase 3: Source Registry Import and Cleaning - Done

- Imported the local AI learning/resource markdown into a reproducible cleaned seed registry.
- Added public-only cleaning rules for private, internal, local, credentialed, attachment-only, and image-only links.
- Normalized source types, categories, languages, regions, tiers, weights, crawl methods, statuses, tags, notes, and risk flags.
- Added import audit and machine-readable summary files.
- Updated validation to cover the cleaned registry and import summary.
- Added an admin source-registry sample using representative cleaned records.

Deferred to later phases:

- Supabase import/migration of the full registry.
- Live source ingestion and source health checks.
- Admin workflows for add, pause, reject, and review source changes.

## Phase 4: Ingestion Pipeline - Done

- Added a local public-source ingestion runner for crawlable Phase 3 candidates.
- Implemented source selection for `rss`, `html`, `api`, `podcast_feed`, and `youtube_feed`.
- Added lightweight RSS/Atom, HTML metadata, GitHub public API, podcast-feed, and YouTube-placeholder fetchers.
- Normalized raw items and deduplicated by canonical URL, external ID, content hash, and source-title key.
- Wrote ignored local run artifacts under `data/ingestion/latest/` and `data/ingestion/runs/`.
- Kept X accounts, WeChat public-account style sources, manual sources, and records without public URLs outside automated ingestion.

Deferred to later phases:

- Supabase insertion from local ingestion artifacts.
- Scheduled production jobs and source-health persistence.
- DeepSeek filtering, summarization, classification, scoring, and entity extraction.

## Phase 5: DeepSeek Understanding Layer - Done

- Add DeepSeek V4 Flash for filtering, summarization, tagging, language detection, and classification.
- Add DeepSeek V4 Pro for scoring explanations and report-ready synthesis hints.
- Keep mock mode as the default path for validation and builds.
- Require explicit live mode plus a local DeepSeek key before any model API call.
- Validate model outputs before writing local radar items.
- Apply deterministic relevance thresholds and the source-weighted scoring formula for final inclusion.
- Log prompt versions, model names, hashes, API-call counts, token usage when available, and error state.
- Write ignored local outputs under `data/understanding/latest/` and `data/understanding/runs/`.

## Phase 6: Q&A and Writing Assistant - Done

- Add retrieval-backed web Q&A over validated radar-item evidence.
- Generate source-cited answers that state time windows and uncertainty.
- Add writing assistant mode with evidence, counterpoints, outlines, and bilingual support.
- Add `/api/ask`, `/api/writing-assistant`, `/ask`, and `/write` in mock/local mode by default.
- Keep live DeepSeek generation explicit and environment-gated.

## Phase 7: Supabase Persistence and Source Health Checks - Done

- Added a reviewable Supabase migration for Phase 3/4/5 artifact persistence and source health history.
- Added dry-run-first scripts for source import, ingestion persistence, understanding persistence, and source health selection.
- Added write gates requiring both `--write` and `ENABLE_SUPABASE_WRITES=true`.
- Added optional Supabase-backed retrieval before local JSON and mock fallbacks.
- Updated admin status pages and docs for persistence state without exposing secrets.

Deferred to later phases:

- Production Supabase writes and scheduled jobs.
- Live DeepSeek runs in automated workflows.
- Admin review queues for approving persisted items.

## Phase 8: Scheduled Jobs and Deployment

- Add scheduled ingestion and understanding dry-runs before persistence is enabled.
- Configure production deployment, environment variables, and job observability.
- Keep jobs idempotent, retry-safe, and bounded.

## Phase 9.2: Scheduled Dry-Run Jobs Foundation - Done

- Added GitHub Actions hourly scheduled dry-run workflow with manual dispatch.
- Added a bounded scheduled runner for public ingestion plus mock understanding.
- Wrote ignored scheduled summary artifacts under `data/scheduled/`.
- Kept Supabase writes, scheduled persistence, source-health writes, live DeepSeek, X API use, and WeChat auto-crawling disabled.

Deferred to later phases:

- Controlled scheduled persistence behind explicit approval and protected workflow gates.
- Daily and weekly report publication jobs.
- Live DeepSeek job usage with approved cost, retry, and review boundaries.

## Phase 9: Admin Review Workflows

- Add review queues for `needs_review` items, source changes, and writing/report candidates.
- Add admin/editor actions for approve, reject, annotate, and publish.
- Add audit trails for scoring and generation decisions.
