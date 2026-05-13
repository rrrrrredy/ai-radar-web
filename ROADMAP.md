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

## Phase 4: Ingestion Pipeline

- Implement public-source ingestion jobs for the crawlable Phase 3 candidates.
- Normalize raw items and deduplicate by canonical URL, source item ID, and hash.
- Add source health checks, retry-safe ingestion logs, and scheduled job configuration.
- Keep X accounts behind future API/manual workflows.
- Keep WeChat public-account style sources manual until a compliant public ingestion path exists.

## Phase 5: DeepSeek Understanding Layer

- Add DeepSeek V4 Flash for filtering, summarization, tagging, language detection, and classification.
- Add DeepSeek V4 Pro for scoring explanations, cluster synthesis, and report drafting.
- Log API usage, prompt versions, and model output metadata.

## Phase 6: Q&A and Writing Assistant

- Add retrieval-backed web Q&A over Radar database evidence.
- Generate source-cited answers that state time windows and uncertainty.
- Add writing assistant mode with evidence, counterpoints, outlines, and bilingual support.
