# Milestone L Resumable Data Activation

Date: 2026-05-22

## Timeout root cause

The previous activation path processed one large source selection as a single ingest/understand/persist attempt and wrote only latest outputs. Long live DeepSeek processing, unauthenticated GitHub rate limits, slow HTML sources, and one outer command timeout could leave completed work unpersisted and hard to resume.

## Chunking design

Added `scripts/run-resumable-activation.ts`.

- Default chunk size: 5 sources.
- Default max items per source: 3.
- Checkpoint after every completed chunk: `data/activation/latest/checkpoint.json`.
- Summary after every completed chunk: `data/activation/latest/summary.json`.
- Chunk artifacts: `data/activation/runs/<run-id>-chunk-*.json`.
- Generated activation artifacts are git ignored.
- `--resume` preserves the checkpoint limit unless a new `--limit` is explicitly passed.
- `--persist --resume` writes already completed chunk outputs without rerunning their crawl/understanding work.

Package scripts:

- `data:activate:resumable:mock`
- `data:activate:resumable:live`
- `data:activate:resumable:live:persist`
- `data:activate:resumable:resume`
- `data:activate:resumable:status`

## Runs

Mock:

- Command: `npm run data:activate:resumable:mock -- --limit 10 --chunk-size 5 --max-items-per-source 2`
- Result: 2/2 chunks succeeded, 13 raw items, 13 radar items.

Live:

- Initial command: `npm run data:activate:resumable:live -- --limit 80 --chunk-size 5 --max-items-per-source 3`
- Outer command timed out after 13/16 chunks, but checkpoint preserved 65 completed radar items.
- Resume fixed the remaining chunks and completed 16/16 chunks.
- Final live checkpoint: 79 raw items, 79 radar items, 62 included, 5 needs_review, 12 excluded, 0 failed.

Source family status:

| Family | Selected | Fetched | Skipped | Failed | Deduped | Included | Needs review | Excluded |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| arxiv_research | 4 | 4 | 0 | 0 | 0 | 27 | 2 | 1 |
| github_open_source | 16 | 7 | 0 | 9 | 0 | 48 | 2 | 5 |
| official_company | 18 | 17 | 0 | 1 | 0 | 52 | 2 | 6 |
| podcast_video | 1 | 1 | 0 | 0 | 0 | 9 | 0 | 1 |
| specialist_analysis | 41 | 34 | 0 | 7 | 0 | 62 | 5 | 12 |

Common caveats:

- GitHub API was unauthenticated and hit public rate limits.
- Some public HTML/RSS sources returned 403, fetch failures, or truncated responses.
- No X or WeChat automatic crawl was run.

## Production counts

Before Milestone L persistence:

- `sources`: 311
- `raw_items`: 110
- `radar_items`: 82
- `public_radar_items`: 75
- `included / needs_review / excluded`: 75 / 2 / 5
- `entities`: 338
- `item_entities`: 405
- `scores`: 966
- `ingestion_runs`: 10
- `understanding_runs`: 10
- `report_candidates`: 12

After controlled persistence:

- `sources`: 312
- `raw_items`: 140
- `radar_items`: 121
- `public_radar_items`: 106
- `included / needs_review / excluded`: 104 / 5 / 12
- `entities`: 506
- `item_entities`: 625
- `scores`: 1519
- `ingestion_runs`: 26
- `understanding_runs`: 26
- `report_candidates`: 14 after report candidate writes

The `public_radar_items > 100` target was reached.

## Report candidates

Daily candidate:

- ID: `ec51a8ff-f700-47a9-9f1c-4b6bd647f9e5`
- Status: `needs_review`
- Usable items: 41
- Citations: 12
- Caveats: 6
- Missing evidence: 0

Weekly candidate:

- ID: `8ed70cc5-8d42-4502-b78b-ba762e56210f`
- Status: `needs_review`
- Usable items: 94
- Citations: 12
- Caveats: 6
- Missing evidence: 0

Writes were limited to controlled source/raw/radar/report persistence and report audit rows with `ENABLE_SUPABASE_WRITES=true` set only for the local process.
