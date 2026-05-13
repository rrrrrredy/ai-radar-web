# AI Industry Radar

AI Industry Radar is a bilingual AI industry radar website for AI practitioners, product managers, researchers, investors, internal colleagues, non-technical readers, and the author.

It is designed around three core questions:

- What happened in AI today?
- Which events are real hotspots?
- Which models, products, companies, papers, and people are worth tracking?

Planned capabilities include source ingestion, ranking, clustering, bilingual summaries, an admin dashboard, DeepSeek-powered Q&A, daily and weekly reports, writing assistant mode, source health monitoring, and private source management.

The project uses public information only. Secrets, API keys, service tokens, cookies, and private credentials must be stored in environment variables and never committed.

## Phase 0 Scope

This repository currently contains the product skeleton, data model, architecture notes, example source taxonomy, JSON schemas, and an embedded pointer to the standalone AI Radar Skill. It does not implement the full Next.js application yet.

## Planned Stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase Postgres
- Supabase Auth
- GitHub Actions and/or Vercel Cron for scheduled ingestion
- DeepSeek V4 Flash for low-cost filtering, summarization, tagging, and classification
- DeepSeek V4 Pro for scoring, report generation, and Q&A

## Validation

Node.js is available in this Phase 0 environment, so the repository includes dependency-free validation scripts.

```bash
npm run lint
npm run typecheck
npm run validate:data
```

`lint` and `typecheck` are Phase 0 placeholders that perform syntax checks without installing large dependencies. A real linter and TypeScript compiler should be added when the Next.js app is implemented.

