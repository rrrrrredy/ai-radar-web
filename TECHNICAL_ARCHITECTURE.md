# Technical Architecture

## Target Stack

- Next.js for web application routing and rendering.
- TypeScript for application and ingestion code.
- Tailwind CSS for UI styling.
- Supabase Postgres for persistence.
- Supabase Auth for Email and GitHub auth.
- GitHub Actions and/or Vercel Cron for scheduled ingestion.
- DeepSeek V4 Flash for low-cost filtering, summarization, tagging, and classification.
- DeepSeek V4 Pro for scoring, report generation, and Q&A.

## High-Level Components

1. Web app: public radar pages, Q&A, reports, and admin dashboard.
2. Ingestion jobs: fetch public sources, normalize raw items, deduplicate, and log runs.
3. Processing pipeline: classify, tag, summarize, score, cluster, and link entities.
4. Database: Supabase Postgres tables described in `DATA_MODEL.md`.
5. Auth: Supabase Email and GitHub auth in the first real implementation phase.
6. Admin tools: source management, manual import, scoring rules, and ingestion logs.
7. Model gateway: DeepSeek client wrapper with usage logging and model selection.

## Model Usage Split

- DeepSeek V4 Flash: cheap filtering, language detection, initial summaries, topic tags, entity candidates, duplicate hints.
- DeepSeek V4 Pro: scoring explanations, cluster synthesis, report generation, Q&A, and writing assistant outputs.

## Optional Future Adapters

- X API for public social signals.
- WeChat public account source support where permitted.
- Feishu and WeCom notifications.
- Browser extension for manual imports.
- Email reports.

## Reliability Notes

- Every generated answer should preserve source links and timestamps.
- Ingestion should be idempotent by canonical URL and source item ID when available.
- Model outputs should be stored with prompt version, model name, and usage metadata.
- Scheduled jobs should be safe to retry.

