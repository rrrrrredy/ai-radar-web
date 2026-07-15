# Final Release Candidate

Updated: 2026-07-15

## Product

Cloudflare Pages is the primary public product. Vercel remains the dynamic/reference application. The public information architecture is event-first, Chinese by default, and mirrored by a complete English route tree with a top-right `中文 / EN` switch.

- Primary: https://ai-industry-radar.pages.dev
- Reference: https://ai-radar-web-luosongred-5507s-projects.vercel.app
- Release branch: `codex/release-candidate-event-radar`
- GitHub Pages: not used

## Data State

| metric | value |
| --- | ---: |
| configured / automated eligible sources | 317 / 91 |
| latest focused run attempted / fetched / failed | 1 / 1 / 0 |
| manual or blocked sources | 226 |
| raw / radar / public radar items | 287 / 283 / 261 |
| included / needs review / excluded / failed | 260 / 4 / 19 / 0 |
| sources with public items | 64 |
| report candidate rows / snapshot candidates / latest summaries | 38 / 15 / 2 |

The preferred public target of 200 and minimum target of 180 are both met. Source-to-raw coverage is 91.2%, raw-to-radar conversion is 98.6%, radar-to-public conversion is 92.2%, and public-source visibility is 20.2%.

The final focused run fetched OGX through the legacy stable source slug `meta-llama-stack`, persisted 10 new raw/radar/included records, and then corrected the public source identity to OGX. The latest broad source-health scope remains 91 attempted, 82 succeeded, and 9 failed: 6 timeouts and 3 HTTP 403 failures, with 2 rate-limit warnings. Nineteen radar rows are excluded for low relevance.

## Event Layer

| layer | signals/relationships | events | curated | multi-item |
| --- | ---: | ---: | ---: | ---: |
| persisted deterministic layer | 209 | 207 | 8 | 2 |
| Cloudflare public display | 205 | 203 | 8 | 2 |

Average persisted items per event are 1.01. Four repeated public signals become two event cards, reducing two duplicate readings:

- Anthropic research plus MIT Technology Review coverage: 2 source families, 2 citations, score 89, `高优先级`.
- Apple/OpenAI lawsuit coverage from The Verge and Ars Technica: 1 source family, 2 citations, score 77, `关注`.

Cross-family coverage is not called independent confirmation. The UI keeps that caveat beside source-family badges. Conflicting companies, projects, release versions, release candidates, partnership counterparts, and unrelated papers remain separate. Low-event homepage, directory, docs-index, and repository-metadata records remain in `全部信号` but do not become events.

## Reports

| type | candidate ID | status | source-stage gate | public event projection |
| --- | --- | --- | --- | --- |
| daily | `39b6efc5-90bf-474a-964a-6eb4c0cad663` | `needs_review` | passed: 21 usable / 12 citations / 9 sources / 10 categories | passed: 8 / 8 / 5 / 4 |
| weekly | `451d6048-5ec0-4164-bafa-3886a503af60` | `needs_review` | passed: 40 / 12 / 18 / 12 | passed: 25 / 25 / 14 / 9 |

Both quality gates pass. `needs_review` is the editorial state and is not a gate failure; neither candidate is labeled published. The failure UI remains implemented and tested: a future failing daily candidate must display `今日数据不足，需补充信源或等待下一轮刷新`.

## Public Surface

- `/`: real counts, first-viewport industry selection, source health, industry pulse, limitations, and current Ask/Write entry points.
- `/radar/`: `行业精选`, `全部事件`, `全部信号`, `最新时间线`, `待复核`, and `来源健康`.
- `/reports/`: event-aware gates, evidence counts, citations, caveats, and missing evidence.
- `/ask/` and `/write/`: browser-local evidence workflows over the public event snapshot.
- `/entities/`: public entity index and evidence detail pages.
- `/en/*`: equivalent English routes.
- `/data/radar-snapshot.json`: allowlisted public data only.

All 261 public-safe radar rows are present under `全部信号`; event-quality filtering applies only to event construction and curation.

The event layer maps 205 signals into 203 public events. The remaining 56 signal-only audit rows are disclosed on the homepage and radar page instead of being silently omitted or promoted into weak events. `待复核` contains only events backed by `needs_review` signals. Browser-local Ask/Write understands explicit 24-hour and seven-day windows, anchors them to snapshot freshness, displays evidence dates, and returns an honest empty state when no event matches. An explicit `高优先级` / `high priority` query is a strict label filter; lower-priority events are never substituted when the requested window has no match.

## Release Hardening

- Supabase public-radar reads use exact-count pagination and fail closed on a short page, count drift, duplicate or missing IDs, or normalization loss; a silent 500-row cap cannot be marked authoritative.
- Event persistence requires at least 75% candidate clustering coverage and 90% retained-cluster coverage before stale rows can be archived. Clustering never deletes rows.
- Report candidates carry the full evidence set. Quality counts are recomputed from evidence, timestamps must fit the declared window, and approval/publication rechecks each item and source against `public_radar_items`.
- Cloudflare independently reprojects report evidence into the declared daily/weekly window and fails the gate when the window has insufficient public evidence.
- Event freshness scoring uses the latest public evidence timestamp rather than the build clock, so identical evidence produces identical scores and curation.
- Strict production export requires authoritative completeness counts plus a fully accounted broad source-health run; the workflow supplies read credentials while keeping Supabase writes disabled.
- Public HTML and snapshot JSON omit the Vercel reference namespace; Vercel remains an operational verification target only.
- `/version.json` records a full Git commit SHA, its provenance source, and local-worktree cleanliness so an immutable Cloudflare deployment can be traced to the reviewed commit.
- Chrome desktop/mobile interaction and visual QA passed 28/28 checks with no relevant console errors.

## Security and Operations

Production snapshot export fails closed unless it reads current Supabase public evidence, preserves all public rows, meets the 180-item minimum, has a populated event layer, includes both report summaries, passes the weekly gate, and has a recent `published_at` timestamp.

The three Supabase public views now use `security_invoker=true`. Anonymous roles receive only allowlisted base columns and public RLS rows. Security Advisor reports 0 ERROR and no mutable-search-path warning. Anonymous read tests return 261 public radar rows and 38 report candidates while denying `raw_items`, raw/model metadata, report metadata, and private fields.

The refresh workflow is `workflow_dispatch` only. No schedule, X/WeChat auto-crawl, source-health write, destructive SQL, automatic publication, or deployed write gate is enabled.

## Remaining Limitation

Only two current public events contain multiple signals, and only one spans source families. The next milestone is to increase repeatable official-plus-independent-analysis overlap for high-value events without relaxing over-merge safeguards.
