# Milestone H Data Quality

Updated: 2026-05-21

## Production Data

- Visible Supabase radar rows after refresh: 61.
- Status mix: 58 `included`, 3 `needs_review`, 0 `excluded`, 0 `failed`.
- Production `/radar`: Supabase read-only data, 61 retrieved items.
- Production `/reports`: saved report candidate mode.

## Source Reliability Changes

- GitHub token support added: yes, via optional `GITHUB_TOKEN`.
- Local GitHub token present during refresh: no.
- GitHub API behavior: unauthenticated fallback worked, but public core rate limit reached `remaining=0` of `limit=60`; reset was reported without exposing secrets.
- Fetch cache added: yes, under ignored `data/ingestion/cache/`, with `--no-cache` bypass.
- Clean activation cache stats: 0 hits, 25 misses, 24 writes, 0 errors. This was the first clean hourly run after adding cache, so hit-rate improvement is not yet measurable.
- Source selection improved: yes, deterministic family balancing across official/company, arXiv/research, GitHub/open-source, specialist analysis, and podcast/video sources.
- Official source updates: 3 active release/changelog pages added: Anthropic Release Notes, Google Gemini API Changelog, Cohere Changelog.

## Live Activation

- Successful run size: `--limit 20 --max-items-per-source 3`.
- Selected source families: GitHub/open-source 5, official/company 5, specialist analysis 5, arXiv/research 4, podcast/video 1.
- Raw items collected: 37.
- Radar items generated: 20.
- Understanding status: 17 `included`, 1 `needs_review`, 2 `excluded`, 0 `failed`.
- DeepSeek API calls: 80.
- Category distribution: research 10, product_update 3, other 3, opinion 2, media_interview 2, infrastructure 1, model_release 1, open_source 1, safety 1.
- Noisy/failing sources: `heartcore-insights` fetch failed; Lex Fridman feed was truncated to the configured byte limit; GitHub warnings remained because no local token was configured.

## Supabase Persistence

- Persistence run: yes, with temporary process-level `ENABLE_SUPABASE_WRITES=true`.
- Persist counts: sources 20, ingestion_runs 1, raw_items 37, understanding_runs 1, radar_items 20, entities 81, item_entities 88, scores 140, api_usage_logs 1.
- No scheduled jobs, source-health writes, X auto-crawl, or WeChat auto-crawl were run.

## Reports

- Daily candidate: `61216c20-620f-4064-8296-5cc9162fdd10`, `needs_review`, 11 usable items, 8 citations.
- Weekly candidate: `d577110b-27a3-4765-898b-8df9c4a697aa`, `needs_review`, 56 usable items, 12 citations.
- Missing-evidence gaps: 0 for both dry-run previews.

## Production Smoke

- Normal local DNS resolved the `.vercel.app` host to non-Vercel IPs and timed out.
- Pinned Vercel edge resolution to `76.76.21.21` passed smoke checks.
- Public routes `/`, `/radar`, `/reports`, `/ask`, and `/write`: 200.
- `POST /api/ask` mock: 200, `data_source=supabase_radar_items`, 8 retrieved items, 8 citations.
- `POST /api/writing-assistant` mock: 200, `data_source=supabase_radar_items`, 5 topics, 8 citations.
- Wrong `LLM Ecosystem` strings: absent from checked route and API responses.

## Remaining Gaps

- Configure `GITHUB_TOKEN` in local/deployment environments to measure authenticated GitHub rate-limit improvement.
- Cache benefit should be measured on repeated same-hour or next-run source fetches.
- `other` category remains present and should be reduced through classifier examples and source-specific normalization.
- Product/model release coverage improved, but more official Mistral, xAI, Alibaba, Moonshot, and Hugging Face model-release surfaces still need reliable public crawl paths.
