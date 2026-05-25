# Final Release Candidate

Date: 2026-05-25

## Status

Internally reviewable RC is ready on the Cloudflare primary site:

- Cloudflare primary: https://ai-industry-radar.pages.dev
- Immutable Cloudflare deployment: https://5a5609c3.ai-industry-radar.pages.dev
- Vercel reference/dynamic app: https://ai-radar-web-luosongred-5507s-projects.vercel.app

Cloudflare is the primary public path. Vercel remains the reference dynamic app for `/api/ask` and `/api/writing-assistant`.

## Data Readiness

Current persisted Supabase counts:

| metric | count |
| --- | ---: |
| sources | 312 |
| automated eligible sources | 86 |
| raw_items | 203 |
| radar_items | 198 |
| public_radar_items | 187 |
| included / needs_review / excluded / failed | 177 / 13 / 8 / 0 |
| entities / item_entities / scores | 1047 / 1347 / 3409 |
| ingestion_runs / understanding_runs | 68 / 68 |
| report_candidates | 20 |

The run met the minimum `public_radar_items >= 180` target. It did not reach the preferred 200+ target.

## Refresh And Writes

What ran:

- Real live reviewed refresh over the automated eligible source set.
- Additional bounded refresh on 17 capped public sources with `max-items-per-source=5` to clear the 180 public-row target.
- Controlled Supabase persistence with temporary process-level `ENABLE_SUPABASE_WRITES=true`.
- Fresh daily and weekly candidate writes.

Blocked or incomplete source coverage:

- 226 sources remain manual/blocked.
- Latest bounded follow-up attempted 17 sources, fetched 10, failed 7.
- Failures were GitHub unauthenticated rate limits: `rate_limit=11`.
- Public visibility gaps: 11 total, from 8 low-relevance exclusions and 3 source risk flags.

## Reports

Latest saved candidates:

| type | candidate ID | status | gate | usable | citations | sources | categories |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| daily | `3cdf5d5d-b8b1-4f93-8ac7-781da04b34ef` | needs_review | passed | 59 | 12 | 12 | 8 |
| weekly | `29ca7e17-ae18-43a5-9210-ab913ad0df6b` | needs_review | passed | 130 | 12 | 11 | 8 |

Daily now passes, so the Cloudflare reports page does not show `今日数据不足`.

## Frontend Surface

Cloudflare public routes are Chinese-first and product-ready:

- `/`: shows AI 行业雷达 / 行业情报台, counts, source coverage, latest refresh, and real Radar Pulse.
- `/radar/`: shows 187 public rows, search, category/status/source-family filters, distributions, freshness, and citation rail.
- `/reports/`: shows latest daily/weekly candidates, quality gates, usable/citation/source/category counts, caveats, missing evidence, and Markdown export.
- `/ask/` and `/write/`: show Chinese query/write hubs, real category examples, source freshness, caveats, and no fake live-chat claim.
- `/data/radar-snapshot.json`: includes public-safe quality metadata and excludes raw/private fields.

The Supabase public-view migration file for quality-gate fields is present. The Supabase app connector required reauthentication during this sprint, so the deployed Cloudflare/Vercel surfaces also use a server-side public-safe report projection for saved candidates. Public outputs strip `model_metadata`.

## Manual Refresh

Use the manual workflow:

```text
.github/workflows/radar-refresh-cloudflare.yml
```

It is `workflow_dispatch` only. There is no schedule.

Local equivalent:

```powershell
npm run data:activate:resumable:live -- --limit 120 --chunk-size 5 --max-items-per-source 3 --reset
$env:ENABLE_SUPABASE_WRITES="true"
npm run data:activate:resumable:live:persist -- --persist --resume
npm run report:candidate:daily:write
npm run report:candidate:weekly:write
Remove-Item Env:ENABLE_SUPABASE_WRITES
npm run cloudflare:build
npx wrangler pages deploy dist/cloudflare-pages --project-name=ai-industry-radar --branch=main
```

## Not Automated

- No scheduled writes.
- No scheduled report publication.
- No X automatic crawl.
- No WeChat automatic crawl.
- No source-health writes.
- No automatic report approval/publishing.
- No automatic completion of manual/blocked sources.

## Recommendation

Ready for internal review. Next milestone only: source coverage expansion and authenticated GitHub-source refresh to move public rows past 200 without relying on manual/blocked sources.
