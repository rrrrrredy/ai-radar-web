# Final Release Candidate

Date: 2026-06-17

## Status

Release candidate is ready for internal review.

- Cloudflare primary: https://ai-industry-radar.pages.dev
- Vercel reference/dynamic app: https://ai-radar-web-luosongred-5507s-projects.vercel.app
- Branch: `codex/release-candidate-event-radar`
- Current Cloudflare snapshot: 203 public radar signals, 200 public event clusters, 22 report snapshots

2026-06-22 update: a bounded live refresh raised the Cloudflare snapshot to 208 public radar signals and 204 public event clusters. Weekly report quality passes. Daily report quality does not pass for the current 24-hour window, so the public reports page must show `今日数据不足，需补充信源或等待下一轮刷新`.

## Current Data State

Cloudflare is using a public-safe local evidence snapshot because the configured Supabase host is not reachable from the runner. The exporter now merges all completed live DeepSeek activation chunks from `data/activation/runs`, filters source pages/homepages/directories, strips private fields, and rebuilds the event layer.

Current public snapshot counts:

| metric | count |
| --- | ---: |
| sources | 312 |
| automated eligible sources | 86 |
| attempted sources | 86 |
| fetched sources | 62 |
| failed sources | 24 |
| blocked/manual sources | 226 |
| raw_items | 205 |
| radar_items | 205 |
| public_radar_items / snapshot rows | 203 |
| included / needs_review / excluded / failed | 199 / 4 / 0 / 0 |
| report candidates / snapshots | 22 |

Targets:

- preferred 200 public items: yes
- minimum 180 public items: yes

Current blockers:

- Supabase project host is unavailable to the exporter, so fresh public DB reads/writes were not used in this pass.
- GitHub API sources hit unauthenticated rate limits when no token is available.
- Many configured sources are manual, blocked, unsupported, or only expose home/category/archive pages.

## Event Layer

- event clustering implemented: yes
- event layer exported in Cloudflare snapshot: yes
- public event count: 200
- average items per event: about 1.00 after over-merge safeguards
- same-version duplicate release events are merged; different release versions are no longer merged
- `行业精选` visible: yes
- timeline visible: yes
- source health visible: yes
- source diversity scoring visible: yes

Raw signal view remains available under `/radar/` -> `全部信号`.

## Reports

Latest public event-aware report summaries:

| type | candidate ID | status | gate | usable | citations | sources | categories |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| daily | `201ed3b3-a2e8-47aa-afa8-f64d14513db0` | needs_review | passed | 9 | 9 | 3 | 3 |
| weekly | `7f5e7074-3cb5-470b-aa68-0b89e9641f4c` | needs_review | passed | 26 | 26 | 5 | 10 |

If a future daily candidate fails its quality gate, `/reports/` renders:

```text
今日数据不足，需补充信源或等待下一轮刷新
```

## Public Surface

Cloudflare is Chinese-first and event-first:

- `/`: status strip, `今日行业精选`, industry pulse, source health, coverage caveats, query/write entry.
- `/radar/`: defaults to `行业精选`; tabs include `行业精选`, `全部事件`, `全部信号`, `最新时间线`, `待复核`, `来源健康`.
- `/reports/`: event-aware quality cards, included events, missing evidence, caveats.
- `/ask/`: event-aware query hub with current-event examples.
- `/write/`: event-aware writing hub with current-event writing prompts.
- `/data/radar-snapshot.json`: public-safe event, signal, report, source-health, and completeness snapshot.

Wrong-domain AI Model Radar / LLM Ecosystem data is not read by public routes.

## Operations

Manual workflow:

```text
.github/workflows/radar-refresh-cloudflare.yml
```

It is `workflow_dispatch` only. There is no schedule. Inputs support mock/live, persist true/false, source limit, chunk size, max items per source, Cloudflare deploy true/false, report generation true/false, and event clustering true/false. The workflow uploads a safe run summary artifact.

Cloudflare Pages build configuration is committed in `wrangler.toml`. The output directory is `dist/cloudflare-pages`, and `npm run build` now produces both the Next.js build and the Cloudflare static public site so Git-based Cloudflare deployments cannot silently publish a Next-only output.

## Safety

- Supabase writes were not run in this recovery pass.
- Deployed environments keep `ENABLE_SUPABASE_WRITES=false`.
- No scheduled jobs were run.
- No X or WeChat automatic crawl was run.
- No source-health writes were run.
- No secrets were printed.
- `.env.local` was not read back or committed.
- Cloudflare snapshot excludes private raw/model/provider fields.

## Recommendation

Ready for internal review. Next milestone only: source repair and authenticated GitHub/Supabase recovery so multi-source confirmation improves without reintroducing homepage/archive noise.
