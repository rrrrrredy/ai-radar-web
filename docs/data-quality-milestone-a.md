# Data Quality Milestone A

Generated: 2026-05-18

## Scope

Milestone A activated the data loop from expanded public source coverage through
live DeepSeek understanding and Supabase-backed retrieval for `/radar` and
`/reports`.

Boundaries observed:

- `.env.local` was not printed or committed.
- Generated ingestion, understanding, and scheduled JSON artifacts remain ignored.
- No scheduled job was run.
- No X automatic crawl was run.
- No WeChat automatic crawl was run.
- No source-health write was run.

## Source Registry

- Official source extension: 39 sources in `data/seed/sources/official-ai-sources.json`.
- Cleaned learning-resource registry: 270 sources.
- Merged source registry: 309 sources after slug/URL dedupe.
- Eligible automated ingestion sources: 83.
- Official extension methods: rss 5, api 16, html 14, manual 4.
- Official extension statuses: active 35, trial 4.

Manual/trial official sources are retained but not selected for automated ingestion
until source health proves they are reliable: `openai-research`, `mistral-news`,
`deepseek-home`, and `kimi-home`.

## Activation Output

- Live activation command attempted first with `--limit 30 --max-items-per-source 5`; it timed out.
- Retry command succeeded with `--limit 20 --max-items-per-source 3`.
- Selected sources: OpenAI News, arXiv cs.AI, arXiv cs.CL, arXiv cs.CV, arXiv cs.LG, and 15 GitHub API sources.
- Raw items collected: 15.
- Radar items generated: 15.
- Included / needs_review / excluded / failed: 15 / 0 / 0 / 0.
- DeepSeek live activation: yes.
- API calls: 60.
- Persistence: sources 20, ingestion_runs 1, raw_items 15, understanding_runs 1, radar_items 15, entities 52, item_entities 54, scores 105, api_usage_logs 1.

## Category Quality

Live activation category counts:

| Category | Count |
| --- | ---: |
| research | 12 |
| agent | 4 |
| product_update | 2 |
| open_source | 2 |
| benchmark | 1 |
| business | 1 |
| safety | 1 |

Supabase retrieval before this activation had 12 usable rows. Category counts
included `other: 5`, `research: 3`, `media_interview: 3`, `opinion: 2`, and
`open_source: 1`.

After persistence, Supabase retrieval has 27 usable rows. Category counts are
`research: 15`, `other: 5`, `agent: 4`, `open_source: 3`, `media_interview: 3`,
`product_update: 2`, `opinion: 2`, `benchmark: 1`, `business: 1`, and
`safety: 1`.

`other` no longer dominates the retrieval set.

## Diversity And Coverage

- Live raw sources represented: 5.
- Live radar sources represented: 5.
- Main live sources represented: OpenAI News, arXiv cs.AI, arXiv cs.CL, arXiv cs.CV, arXiv cs.LG.
- Supabase retrieval sources represented after persistence include OpenAI News, four arXiv feeds, Lex Fridman, JMLR, Andrej Karpathy, Elad Gil, Stratechery, Not Boring, and Implications.

The batch is useful for research and official-announcement coverage, but GitHub
release coverage was blocked by unauthenticated GitHub API rate limiting during
this run.

## Quality Notes

- No duplicate raw or radar item keys were found in the successful live batch.
- All included persisted rows have public citation URLs.
- OpenAI News and arXiv RSS feeds produced useful item-level evidence.
- GitHub API sources returned HTTP 403 rate-limit responses and produced no raw items in the retry.
- HTML official pages were not reached in the 20-source retry because the selected GitHub API sources came before them and were rate-limited.

## Preview Support

- `/radar` data source: `supabase_radar_items`.
- `/radar` usable item count: 27.
- `/reports` daily preview source: `supabase_radar_items`.
- `/reports` daily preview: 21 retrieved / 21 usable / 21 citations.
- `/reports` weekly preview source: `supabase_radar_items`.
- `/reports` weekly preview: 24 retrieved / 24 usable / 24 citations.

The current data supports useful daily and weekly previews, especially for
research, model/product, agent, and official OpenAI/arXiv signals. Business,
infrastructure, regulation, and Chinese official sources still need broader
coverage before report synthesis should be treated as complete.

## Remaining Gaps

- Add authenticated or lower-frequency GitHub API handling to avoid public API rate-limit loss.
- Move some official HTML sources earlier when GitHub is rate-limited.
- Add more reliable public feeds for Anthropic, Google, Meta, Microsoft, NVIDIA, Hugging Face, Mistral, DeepSeek, Qwen, and Kimi when available.
- Improve item-level extraction beyond metadata for official HTML pages.
- Continue manual public URL completion for valuable domestic sources.

## Next Priorities

- Add source-health telemetry for official sources without enabling source-health writes by default.
- Add an ingestion backoff path for GitHub API rate limits.
- Add per-source selection balancing so one method class cannot starve HTML sources.
- Review the new Supabase rows editorially and promote report-ready rows where needed.
