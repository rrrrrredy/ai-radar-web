# Final Release Candidate

Updated: 2026-07-14

## Product Status

Cloudflare Pages is the primary public product. Vercel remains the dynamic/reference application. The Cloudflare build is event-first, Chinese by default, and has a complete English route tree with a top-right `中文 / EN` switch.

- Primary: https://ai-industry-radar.pages.dev
- Reference: https://ai-radar-web-luosongred-5507s-projects.vercel.app
- Release branch: `codex/release-candidate-event-radar`
- GitHub Pages: not used

## Final Data State

| metric | value |
| --- | ---: |
| configured sources | 317 |
| automated eligible / attempted | 91 / 91 |
| fetched / failed / manual-blocked | 82 / 9 / 226 |
| raw / radar / public radar items | 268 / 264 / 242 |
| included / needs review / excluded / failed | 241 / 4 / 19 / 0 |
| sources with public items | 64 |
| historical candidate rows / current public candidates | 26 / 2 |

The preferred public-item target of 200 is met. Raw-to-radar conversion is 98.5%; radar-to-public conversion is 91.7%. Failure families are timeout 6, HTTP 403 3, rate-limit warnings 2, and low-relevance exclusions 19.

## Event Layer

- current deterministic layer: 205 clusters and 242 item relationships;
- Cloudflare public-safe projection: 159 events and 190 relationships from 192 visible signals;
- curated events: 8;
- multi-item clusters: 16 in the full deterministic layer and 15 in the public projection;
- same-family two-source display events: 1;
- cross-source-family display events: 0;
- average items per current-run cluster: 1.18; public projection: 1.19.

The Apple/OpenAI lawsuit is merged across The Verge and Ars Technica into one 77-point `关注` event with two citations and a timeline. Because both sources are in the same media/analysis family, the score is capped below `高优先级`. Same-project release updates can roll up inside a seven-day window, while different projects, SDK tracks, companies, partnership counterparts, weak title overlap, and distant timestamps prevent unsafe merges. Raw items remain under `/radar/` -> `全部信号`.

## Reports

| type | candidate ID | status | source-stage gate | public event projection |
| --- | --- | --- | --- | --- |
| daily | `2daba147-d851-41c4-a8ee-efed66eedcdf` | `needs_review` | passed: 60 usable / 12 citations / 13 sources / 12 categories | passed: 11 / 11 / 6 / 6 |
| weekly | `ba8dbe90-30ef-4f60-8460-04456ad7be21` | `needs_review` | passed: 75 / 12 / 13 / 11 | passed: 29 / 29 / 16 / 10 |

The baseline gate means enough volume and citation diversity for editorial review, not publication. The public report cards separately show event corroboration and release readiness; both current candidates remain not release-ready because there is no cross-source-family confirmation. A failed daily gate renders `今日数据不足，需补充信源或等待下一轮刷新`.

## Public Surface

- `/`: real counts, today's selected events, cross-family/same-family/single-source evidence states, source health, industry pulse, and limits;
- `/radar/`: `行业精选`, `全部事件`, `全部信号`, `最新时间线`, `待复核`, and `来源健康`;
- `/reports/`: event-aware quality gates, evidence counts, citations, caveats, and missing evidence;
- `/ask/` and `/write/`: browser-local event query and evidence-led writing tools;
- `/en/...`: equivalent English home, radar, entities, reports, ask, and write routes;
- `/data/radar-snapshot.json`: allowlisted public snapshot only.

Browser validation covers desktop and 390px mobile layouts, both languages, language switching, radar tabs, source health, and horizontal overflow. The first curated event begins inside the mobile first viewport.

## Operations and Safety

`.github/workflows/radar-refresh-cloudflare.yml` is manual `workflow_dispatch` only. It supports mock/live, controlled persistence, bounded source/chunk limits, event clustering, report generation, Cloudflare deployment, resumable state, and a redacted summary artifact.

Supabase writes in this release were limited to controlled source, raw, radar, event, relationship, score, entity, report-candidate, and audit persistence with a temporary process-level write gate. No schedule, X/WeChat crawl, source-health write, destructive SQL, or automatic report publication was run. Deployed environments keep writes disabled.

## Remaining Limitation

Only one current public event has two-source confirmation, and both sources are in the same media/analysis family. There is no cross-source-family confirmation. This is disclosed in the UI rather than inflated through loose clustering. The next milestone is one thing: increase official-plus-independent-media overlap for high-value events while preserving the current over-merge tests.
