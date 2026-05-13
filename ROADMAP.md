# Roadmap

## Phase 0: Repository Skeleton

- Create documentation, schemas, seed taxonomy, and validation script.
- Define product, architecture, data model, and safety boundaries.
- Link to the standalone AI Radar Skill as the canonical agent skill.

## Phase 1: Minimal App and Auth

- Initialize Next.js, TypeScript, Tailwind CSS, and Supabase client.
- Implement Email and GitHub auth.
- Add WeChat auth placeholder behind `ENABLE_WECHAT_AUTH`.
- Create public homepage, admin shell, and database migrations.

## Phase 2: Ingestion and Ranking

- Implement public source ingestion.
- Normalize raw items and deduplicate by canonical URL and hash.
- Add source health checks and ingestion logs.
- Add initial scoring rules and manual review.

## Phase 3: Clustering and Entities

- Cluster related items into events.
- Extract companies, people, models, products, papers, and projects.
- Add entity pages and cluster detail pages.

## Phase 4: DeepSeek Workflows

- Add DeepSeek V4 Flash for filtering, summarization, tagging, and classification.
- Add DeepSeek V4 Pro for scoring, Q&A, and report generation.
- Log API usage and prompt versions.

## Phase 5: Reports and Writing Assistant

- Generate daily and weekly reports.
- Add writing assistant mode with evidence, counterpoints, and outlines.
- Add email or notification adapters if needed.

