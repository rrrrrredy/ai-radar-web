# Ingestion Pipeline

## Pipeline Stages

1. Select active public sources.
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

