# Ingestion Pipeline

Phase 4 will build on the Phase 3 cleaned source registry. Phase 3 does not fetch live content; it prepares the seed data, cleaning policy, tiering, crawl-method hints, and manual review queues needed for ingestion.

## Pipeline Stages

1. Select active public sources from `data/seed/sources/ai-learning-resources.cleaned.json`.
2. Fetch source data through public pages, public feeds, or public APIs.
3. Normalize raw items.
4. Deduplicate by canonical URL, external ID, and content hash.
5. Classify language and topic.
6. Summarize and tag.
7. Extract entities.
8. Score items.
9. Cluster related events.
10. Log the ingestion run.

## Scheduling

Use GitHub Actions or Vercel Cron for scheduled ingestion. Jobs should be idempotent, safe to retry, and observable through `ingestion_runs`.

## Failure Handling

Record source-level errors without failing the full run when possible. Pause sources only after repeated failures or policy violations.

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
