# Release Candidate Data Status

Generated: 2026-06-17

## What Completed

- Live DeepSeek resumable activation ran in bounded chunks.
- Additional targeted live runs were executed for high-quality sources:
  - OpenAI News + arXiv cs.AI
  - arXiv cs.CL
  - arXiv cs.CV
  - arXiv cs.LG
- Cloudflare snapshot export now merges completed live activation chunks from `data/activation/runs`.
- Public snapshot filtering removes homepages, archive pages, source directories, Substack/publication landing pages, repository metadata pages, docs entry pages, and generic category pages.
- Event clustering is regenerated from the filtered public-safe snapshot.

## Current Public Snapshot

2026-06-22 refresh:

| metric | count |
| --- | ---: |
| public radar signals | 208 |
| public event clusters | 204 |
| curated events | 8 |
| report snapshots | 22 |
| latest public evidence timestamp | 2026-06-22 |

The 2026-06-22 refresh added a bounded live DeepSeek run without Supabase writes. It produced 23 raw/radar items, with 17 included, 2 needs_review, and 4 low-relevance exclusions. GitHub API sources were still limited by unauthenticated rate limits.

Current report gate status after the 2026-06-22 refresh:

- Daily quality gate: not passed; the public UI must show `今日数据不足，需补充信源或等待下一轮刷新`.
- Weekly quality gate: passed.

2026-06-17 release-candidate baseline:

| metric | count |
| --- | ---: |
| public radar signals | 203 |
| public event clusters | 200 |
| event cluster item links | 201 |
| curated events | 8 |
| report snapshots | 22 |
| latest public evidence timestamp | 2026-06-17T03:57:11.281Z |

Target status:

- preferred 200 public items: yes
- minimum 180 public items: yes

## Source Completeness

Persisted/source-audit baseline remains:

- sources total: 312
- automated eligible: 86
- attempted: 86
- fetched: 62
- failed: 24
- blocked/manual: 226
- source health failure families: timeout 5, rate_limit 16, 403 4, low_relevance_excluded 16

Known blockers:

- Supabase host is unavailable to this runner, so fresh DB public reads and persistence were not available.
- GitHub API sources can hit unauthenticated rate limits without `GITHUB_TOKEN`.
- Many configured sources are manual/blocked or produce only source pages instead of event-level URLs.
- X and WeChat are intentionally not crawled automatically.

## Conversion

The Cloudflare public snapshot is now based on filtered public evidence rather than raw Supabase counts:

- raw to radar conversion in successful targeted runs: 100% for the latest arXiv/OpenAI chunks
- radar to public snapshot visibility: filtered by public event quality
- low-event source pages are intentionally excluded even when DeepSeek scored them as AI-related

## Report Gates

- 2026-06-22 daily quality gate: not passed; the report page shows the required insufficient-data notice.
- 2026-06-22 weekly quality gate: passed.
- Daily remains `needs_review` until enough current-window evidence exists and editorial review is complete.

## Safety

- This pass did not run Supabase writes.
- Generated activation checkpoints/chunks remain ignored operational artifacts.
- Cloudflare JSON excludes `raw_text`, `raw_metadata`, `model_metadata`, provider payloads, secrets, private notes, and operational logs.
