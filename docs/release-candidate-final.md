# Final Release Candidate

Updated: 2026-07-15

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
| automated eligible / attempted in final run | 91 / 1 |
| fetched / failed in final run / manual-blocked | 1 / 0 / 226 |
| raw / radar / public radar items | 275 / 271 / 249 |
| included / needs review / excluded / failed | 248 / 4 / 19 / 0 |
| sources with public items | 64 |
| historical candidate rows / current public candidates | 30 / 2 |

The preferred public-item target of 200 is met. Raw-to-radar conversion is 98.5%; radar-to-public conversion is 91.9%. The final focused run fetched Anthropic Research successfully with no source failure; the ledger still accounts for every other eligible source as previously fetched or skipped in this bounded final run. The last broad sweep recorded 6 timeouts, 3 HTTP 403 failures, and 2 rate-limit warnings; 19 radar rows remain excluded for low relevance.

Five official landing-page sources now use verified RSS/Atom article feeds (Google DeepMind, Google Gemini, Hugging Face Blog, and two NVIDIA feeds). Anthropic News and Research use a same-domain, path-restricted sitemap fetcher with bounded article excerpts. The excerpt is private understanding input only; raw HTML and article text are not exported to the public snapshot.

## Event Layer

- current deterministic layer: 168 clusters and 200 item relationships after low-event signals are removed;
- Cloudflare public-safe projection: 165 events and 197 relationships from 199 visible signals;
- curated events: 8;
- multi-item clusters: 16 in both the current layer and public projection;
- same-family two-source display events: 1;
- cross-source-family display events: 1;
- average items per current-run cluster: 1.19; public projection: 1.19.

Anthropic's `A global workspace in language models` and MIT Technology Review's independent Jacobian-lens coverage now form one 89-point `高优先级` event across `公司/实验室` and `分析/媒体`, with two citations and a timeline. A narrow, tested concept alias joins `J-space`, `Jacobian lens`, and `global workspace` only when both Anthropic and Claude anchors are present. The Apple/OpenAI lawsuit remains a separate same-family two-source example. Directory/homepage signals are retained under `全部信号` but excluded from event evidence. Different projects, SDK tracks, companies, partnership counterparts, weak concepts, and distant timestamps still prevent unsafe merges.

## Reports

| type | candidate ID | status | source-stage gate | public event projection |
| --- | --- | --- | --- | --- |
| daily | `4c0e2d7d-fe0d-4492-8dd3-a42706272aec` | `needs_review` | passed: 51 usable / 12 citations / 18 sources / 10 categories | passed: 10 / 10 / 7 / 4 |
| weekly | `4ffdd8d3-9b66-467a-ab15-0662f2e2045c` | `needs_review` | passed: 78 / 12 / 12 / 12 | passed: 28 / 28 / 15 / 10 |

The baseline gate means enough volume and citation diversity for editorial review, not publication. The public report cards separately show event corroboration and release readiness. Both candidates remain `needs_review`: there is now one cross-family event, but no report has been formally approved or published. A failed daily gate renders `今日数据不足，需补充信源或等待下一轮刷新`.

## Public Surface

- `/`: real counts, today's selected events, cross-family/same-family/single-source evidence states, source health, industry pulse, and limits;
- `/radar/`: `行业精选`, `全部事件`, `全部信号`, `最新时间线`, `待复核`, and `来源健康`;
- `/reports/`: event-aware quality gates, evidence counts, citations, caveats, and missing evidence;
- `/ask/` and `/write/`: browser-local event query and evidence-led writing tools;
- `/en/...`: equivalent English home, radar, entities, reports, ask, and write routes;
- `/data/radar-snapshot.json`: allowlisted public snapshot only.

Source health separates the final focused run (1 attempted, 1 fetched, 0 failed) from the latest broad refresh (91 attempted, 82 succeeded, 9 failed). The source-health tab includes a bilingual family matrix for company/lab, analysis/media, research feeds, open source, and podcast/video with timeout, 403, rate-limit, no-item, duplicate-only, manual, unsupported, and low-relevance columns.

Browser validation covers desktop and 390px mobile layouts, both languages, language switching, radar tabs, source health, and horizontal overflow. The first curated event begins inside the mobile first viewport.

## Operations and Safety

`.github/workflows/radar-refresh-cloudflare.yml` is manual `workflow_dispatch` only. It supports mock/live, controlled persistence, bounded source/chunk limits, event clustering, report generation, Cloudflare deployment, resumable state, and a redacted summary artifact.

Supabase writes in this release were limited to controlled source, raw, radar, event, relationship, score, entity, report-candidate, and audit persistence with a temporary process-level write gate. No schedule, X/WeChat crawl, source-health write, destructive SQL, or automatic report publication was run. Deployed environments keep writes disabled.

Migration `20260715030230_public_report_candidates_needs_review.sql` expands only the read-only public report-candidate projection. Anonymous reads were verified to return the latest quality-gated `needs_review` daily/weekly candidates as `saved_candidate`; raw metadata and private review fields remain excluded.

## Remaining Limitation

Only two current public events have two-source confirmation, and only one crosses source families. This is disclosed rather than inflated through loose clustering. The next milestone is one thing: expand repeatable official-plus-independent-media overlap for high-value events while preserving the current over-merge tests.
