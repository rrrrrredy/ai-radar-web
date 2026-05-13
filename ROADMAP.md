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

## Phase 3: Source Registry Import and Cleaning

- Import the curated public source registry into Supabase.
- Normalize source types, languages, regions, topics, tiers, and risk notes.
- Add admin workflows for add, pause, reject, and review source changes.

## Phase 4: Ingestion Pipeline

- Implement public source ingestion jobs.
- Normalize raw items and deduplicate by canonical URL, source item ID, and hash.
- Add source health checks, retry-safe ingestion logs, and scheduled job configuration.

## Phase 5: DeepSeek Understanding Layer

- Add DeepSeek V4 Flash for filtering, summarization, tagging, language detection, and classification.
- Add DeepSeek V4 Pro for scoring explanations, cluster synthesis, and report drafting.
- Log API usage, prompt versions, and model output metadata.

## Phase 6: Q&A and Writing Assistant

- Add retrieval-backed web Q&A over Radar database evidence.
- Generate source-cited answers that state time windows and uncertainty.
- Add writing assistant mode with evidence, counterpoints, outlines, and bilingual support.
