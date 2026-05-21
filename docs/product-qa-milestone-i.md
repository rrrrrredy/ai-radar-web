# Milestone I Product QA

Date: 2026-05-21

## Production Data Baseline

- Data source: `supabase_radar_items`
- Sources: 309
- Raw items: 89
- Radar items: 69
- Public visible radar rows: 61
- Included / needs_review / excluded / failed: 60 / 3 / 6 / 0
- Report candidates: 8
- Latest ingestion: `2026-05-21T04:11:15.074Z`
- Latest understanding: `2026-05-21T04:23:03.396Z`
- Latest daily candidate: `61216c20-620f-4064-8296-5cc9162fdd10`
- Latest weekly candidate: `d577110b-27a3-4765-898b-8df9c4a697aa`

## Data Refresh

- Trigger condition: public visible radar rows were below 100.
- Limit 50 live refresh timed out and was stopped.
- Successful activation: `--limit 30 --max-items-per-source 3`
- Successful activation output: 51 raw items collected, 30 radar items generated, 29 included, 0 needs_review, 1 excluded, 0 failed, 120 DeepSeek API calls.
- Persisted activation output: 47 raw items collected, 30 radar items generated, 28 included, 0 needs_review, 2 excluded, 0 failed, 120 DeepSeek API calls.
- Persistence counts: sources 30, ingestion_runs 1, raw_items 47, understanding_runs 1, radar_items 30, entities 116, item_entities 136, scores 210, api_usage_logs 1.
- New daily candidate: `a9552a33-552a-4fc1-b6f8-12514de9efd5`
- New weekly candidate: `11245d8b-5abb-4943-8a88-d4c0fee81c94`
- GitHub token was missing; unauthenticated GitHub API rate limit reached during the persisted run.

## Data After Refresh

- Sources: 311
- Raw items: 107
- Radar items: 82
- Public visible radar rows: 74
- Included / needs_review / excluded / failed: 73 / 3 / 6 / 0
- Report candidates: 10
- Latest ingestion: `2026-05-21T07:52:57.936Z`
- Latest understanding: `2026-05-21T08:14:48.558Z`
- Daily candidate usable / citations / caveats: 18 / 9 / 6
- Weekly candidate usable / citations / caveats: 66 / 12 / 6

## Distribution

Top categories:

- research: 45
- product_update: 12
- open_source: 10
- other: 9
- agent: 7
- benchmark: 4
- media_interview: 3
- model_release: 3

Top sources:

- arXiv cs.CL: 12
- arXiv cs.CV: 12
- arXiv cs.LG: 10
- OpenAI News: 8
- arXiv cs.AI: 6
- Anthropic Python SDK: 3
- Hugging Face Transformers: 3
- Lex Fridman: 3

## Reference Patterns

- AI Knowledge Graph inspected successfully: dense graph canvas, category chips, search feedback, node/ranking dashboards, and relationship counts.
- AI Query Hub inspection blocked by SSO login; best-effort query-hub pattern adopted from milestone brief.
- Adopted pattern 1: real relationship preview connecting data source, categories, sources, and report candidates.
- Adopted pattern 2: query/action hub with current category counts and Ask/Write entry prompts.

## Routes Changed

- `/`: production data status, Radar Pulse, relationship preview, analyst query hub, caveat panel.
- `/radar`: category tabs, search box, source-family filter, source-family distribution.
- `/reports`: latest daily/weekly candidates promoted before detailed report body.
- `/ask`: server-backed data badges and category-derived query shortcuts.
- `/write`: server-backed data badges and category-derived editorial prompt shortcuts.

## Remaining Gaps

- Public visible rows improved from 61 to 74 but remain below 100 due duplicate/filtered rows and GitHub unauthenticated rate limits.
- Relationship preview is intentionally shallow; persisted entity relationships can support a richer graph later.
- Query-hub reference UI could not be directly inspected without SSO credentials.

## Next Milestone Recommendation

Milestone J should focus on authenticated GitHub ingestion and entity graph depth: add `GITHUB_TOKEN` to production/refresh environments, enrich entity extraction display, and expose source/entity relationship drill-downs without expanding public API response shapes.
