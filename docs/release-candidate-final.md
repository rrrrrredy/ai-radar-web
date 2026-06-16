# Final Release Candidate

Date: 2026-05-26

## Status

Release candidate is internally reviewable, with a documented blocker against the preferred data target.

- Cloudflare primary: https://ai-industry-radar.pages.dev
- Cloudflare immutable deployment: https://780324f8.ai-industry-radar.pages.dev
- Vercel reference/dynamic app: https://ai-radar-web-luosongred-5507s-projects.vercel.app
- Latest Vercel production deployment ID: `dpl_vHW5UDjqSd64euLJToeRwBszvsWr`
- Branch: `codex/release-candidate-event-radar`

## Current Production Recovery

Verified: 2026-06-16; Supabase blocker reconfirmed 2026-06-16

- Cloudflare primary restored: https://ai-industry-radar.pages.dev
- Current immutable deployment: https://780324f8.ai-industry-radar.pages.dev
- `/data/radar-snapshot.json` returns 200 with 183 public radar items, 159 event clusters, and 22 public reports.
- The primary domain now serves the event-first AI Industry Radar surface, not the older AI Model Radar / LLM Ecosystem build.
- Desktop and 390 px mobile checks passed for `/` and `/radar/`: HTTP 200, no console errors, no horizontal overflow, and no visible `AI Model Radar`, `公开快照`, `source-gated`, `dry-run`, `local key`, or internal table-name labels.
- The static HTML uses reader-facing source labels such as `公开证据库`; the public JSON also maps the snapshot source to `public_evidence_store`.
- Vercel Ask/Write live endpoints return `mode=live` with 8 citations from the public evidence store, confirming DeepSeek-backed generation and public snapshot retrieval are working on the dynamic reference app.

Current blocker:

- The configured Supabase project `phurrofgzqvawhookqbv` is inactive, and the host currently resolves as NXDOMAIN/ENOTFOUND from the local runner. The Cloudflare export therefore reused the previous public-safe snapshot instead of degrading to incomplete local data.
- `source.local_data_used` is true in the current public JSON for that reason.
- The minimum `public_radar_items >= 180` target remains met; the preferred 200+ public-row target remains unmet.

## Data Readiness

Current persisted Supabase/public counts:

| metric | count |
| --- | ---: |
| sources | 312 |
| automated eligible sources | 86 |
| attempted sources | 86 |
| fetched sources | 62 |
| failed sources | 24 |
| blocked/manual sources | 226 |
| raw_items | 205 |
| radar_items | 201 |
| public_radar_items | 183 |
| included / needs_review / excluded / failed | 176 / 9 / 16 / 0 |
| report_candidates | 22 |

The minimum `public_radar_items >= 180` target is met. The preferred 200+ target is not met because 226 configured sources are manual/blocked, 24 automated sources failed in the latest run, and 16 radar rows were excluded for low AI relevance.

Conversion:

- source to raw coverage: 90.7%
- raw to radar conversion: 98.0%
- radar to public visibility: 91.0%
- public visible sources over total configured sources: 19.9%

## Event Layer

- event clustering implemented: yes
- event clusters exported in Cloudflare snapshot: yes
- event cluster count: 159
- multi-item merged events: 12
- average items per cluster: about 1.15
- `行业精选` visible: yes
- timeline visible: yes
- source health visible: yes
- source diversity scoring visible: yes

Raw signal view remains available under `全部信号`.

## Reports

Latest written candidates:

| type | candidate ID | status | gate | usable | citations | sources | categories |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| daily | `201ed3b3-a2e8-47aa-afa8-f64d14513db0` | needs_review | passed | 61 | 12 | 17 | 9 |
| weekly | `7f5e7074-3cb5-470b-aa68-0b89e9641f4c` | needs_review | passed | 125 | 12 | 13 | 8 |

Daily now passes, so the insufficient-data warning is not shown as the primary state. If a future daily candidate fails, the Cloudflare reports page renders `今日数据不足，需补充信源或等待下一轮刷新`.

## Public Surface

Cloudflare is Chinese-first and event-first:

- `/`: status strip, `今日行业精选`, industry pulse, source health, coverage caveats, query/write entry.
- `/radar/`: defaults to `行业精选`; tabs include `行业精选`, `全部事件`, `全部信号`, `最新时间线`, `待复核`, `来源健康`.
- `/reports/`: event-aware report quality cards and included curated events.
- `/ask/`: event-aware query hub.
- `/write/`: event-aware writing hub.
- `/data/radar-snapshot.json`: public-safe radar/report/event/source-health/data-completeness snapshot.

Wrong-domain AI Model Radar / LLM Ecosystem data is not read by public routes.

## Operations

Manual workflow:

```text
.github/workflows/radar-refresh-cloudflare.yml
```

It is `workflow_dispatch` only. There is no schedule. Inputs support mock/live, persist true/false, Cloudflare deploy true/false, report generation true/false, and event clustering true/false. The workflow uploads a safe run summary artifact.

## Safety

- Supabase writes were run only with temporary process-level `ENABLE_SUPABASE_WRITES=true`.
- Deployed environments keep writes disabled.
- No scheduled jobs were run.
- No X or WeChat automatic crawl was run.
- No source-health writes were run.
- No secrets were printed.
- `.env.local` was not read back or committed.
- Cloudflare snapshot excludes private raw/model/provider fields.

## Recommendation

Ready for internal review. Next milestone only: authenticated source expansion and public-source repair to cross 200 public rows without adding scheduled writes.
