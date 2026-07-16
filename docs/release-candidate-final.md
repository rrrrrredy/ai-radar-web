# Final Release Candidate

Updated: 2026-07-16

## Product

Cloudflare Pages is the primary public product. Vercel remains the dynamic/reference application. The public information architecture is event-first, Chinese by default, and mirrored by an English route tree with a top-right `中文 / EN` switch.

- Primary: https://ai-industry-radar.pages.dev
- Reference: https://ai-radar-web-luosongred-5507s-projects.vercel.app
- Release branch: `codex/release-candidate-event-radar`
- GitHub Pages: not used

## Data State

| metric | value |
| --- | ---: |
| configured / automated eligible sources | 317 / 91 |
| latest live run attempted / fetched / failed | 30 / 27 / 3 |
| manual or blocked sources | 226 |
| raw / radar / public radar items | 326 / 322 / 298 |
| included / needs review / excluded / failed | 297 / 4 / 21 / 0 |
| sources with public items | 64 |
| report candidate rows / snapshot candidates | 40 / 16 |

The preferred public target of 200 and minimum target of 180 are both met. Source-to-raw coverage is 91.2%, raw-to-radar conversion is 98.8%, radar-to-public conversion is 92.5%, and configured-source public visibility is 20.2%.

The final resumable live run completed and persisted 6/6 chunks. It produced 71 raw and 71 radar rows: 66 included, 1 needs review, 4 excluded, and 0 understanding failures. Three sources failed to fetch: NVIDIA AI Blog, Andrew Chen, and Epoch AI. The run used 284 bounded DeepSeek calls and left no missing persisted local IDs.

## Event Layer

| layer | relationships | events | curated | multi-item | cross-family |
| --- | ---: | ---: | ---: | ---: | ---: |
| persisted deterministic layer | 246 | 243 | 8 | 3 | 2 |
| Cloudflare public display | 244 | 241 | 8 | 3 | 2 |

Six related signals become three event cards, reducing three duplicate readings:

- GPT-Red official release plus MIT Technology Review coverage: 2 families, score 92, `高优先级`.
- Anthropic J-space research plus MIT Technology Review coverage: 2 families, score 90, `高优先级`.
- Apple/OpenAI lawsuit coverage from The Verge and Ars Technica: 1 family, score 77, `关注`.

The matcher now accepts exact distinctive named entities appearing in both titles only when evidence is cross-family, shares a category, and is published within 24 hours. Broad entities such as Claude, Anthropic, Google, Gemini, OpenAI, and generic AI terms cannot trigger this rule. Version, project, partner, category, time-window, and low-event-signal safeguards remain active.

Event persistence requires an authoritative direct Supabase public-radar read. Local, snapshot, mock, and fallback inputs fail closed before any event write. The final authoritative write upserted 243 clusters and 246 relationships and archived 3 stale generated clusters without deleting rows.

## Source Acquisition

The HTML fetcher no longer treats every configured HTML source as one permanent homepage item. It discovers a bounded set of same-domain, high-confidence article or changelog links; rejects navigation, login, account, privacy, tag, category, cross-domain, and asset URLs; fetches article metadata and excerpts; and falls back to the homepage when no credible static article exists.

Fixture tests cover filtering, deduplication, ranking, limits, article parsing, and fallback. A live read-only check of Microsoft Foundry returned three dated article items. Qwen's static page exposed no credible article links and correctly remained a homepage fallback.

## Reports

| type | candidate ID | status | source-stage gate | public event projection |
| --- | --- | --- | --- | --- |
| daily | `d659ec34-176c-44e8-a495-693b426e7fa2` | `needs_review` | 24 usable / 11 citations / 12 sources / 10 categories | 9 / 9 / 7 / 5 |
| weekly | `8d0ced7c-24ba-489f-adea-b89193a049fc` | `needs_review` | 71 usable / 12 citations / 23 sources / 13 categories | 26 / 26 / 12 / 8 |

Both source-stage and public event gates pass. `needs_review` is the editorial state, not a gate failure; neither candidate is labeled published. The failing-daily UI remains implemented: `今日数据不足，需补充信源或等待下一轮刷新`.

## Public Surface

- `/`: current counts, industry selection, pulse, source health, limitations, and Ask/Write entries.
- `/radar/`: `行业精选`, `全部事件`, `全部信号`, `最新时间线`, `待复核`, and `来源健康`.
- `/reports/`: event-aware quality gates, evidence, citations, caveats, and missing evidence.
- `/ask/` and `/write/`: browser-local evidence workflows over the public event snapshot.
- `/en/*`: equivalent English routes.
- `/data/radar-snapshot.json`: allowlisted public data only.

All 298 public-safe signals remain under `全部信号`. The event layer maps 244 signals into 241 public events; 54 signal-only rows remain auditable and are not promoted into weak events.

Exact named-event and distinctive entity queries now narrow to matching events instead of mixing in unrelated high-scoring records. Bare Chinese `今天/今日` intent enforces the same 24-hour evidence window as explicit `最近 24 小时`. Requests that explicitly compare cross-family and single-source evidence use union semantics, so both evidence states remain available to Ask/Write output. Source-health answers expose zeroes, readable timestamps, decision impact and next actions; event answers expose event-specific uncertainty, and English report cards render every declared citation.

## Safety and Operations

The refresh workflow remains `workflow_dispatch` only. No schedule, X/WeChat auto-crawl, source-health write, destructive SQL, automatic publication, or deployed write gate is enabled. Production snapshot export requires authoritative Supabase input and excludes raw text, raw/model/report metadata, provider payloads, credentials, private notes, and operational logs. A non-destructive production migration revokes `public`, `anon`, and `authenticated` privileges from all 12 wrong-domain model-radar tables; the live anonymous contract returns `401` for every table while the allowlisted public radar view remains readable.

## Remaining Limitation

Only 2 of 241 public events currently span source families. Coverage is materially better but still thin. The next milestone is one focused source-adapter pass for high-value official changelog/blog surfaces that still expose no structured article feed, followed by evidence-level corroboration review.
