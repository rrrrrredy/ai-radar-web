# AI Industry Radar

AI Industry Radar is an event-level AI industry intelligence product. It turns public signals into deduplicated events, keeps the underlying signals auditable, and exposes source diversity, citations, timelines, report quality, source health, and coverage limits.

- Primary public site: https://ai-industry-radar.pages.dev
- Dynamic/reference app: https://ai-radar-web-luosongred-5507s-projects.vercel.app
- Default language: Chinese
- English routes: `/en/` and matching `/en/*` pages
- Language switch: top-right `中文 / EN`
- GitHub Pages: not used

## Current Release Data

| metric | value |
| --- | ---: |
| configured sources | 317 |
| automated eligible sources | 91 |
| raw / radar / public radar items | 287 / 283 / 261 |
| public snapshot signals | 261 |
| public display events / relationships | 203 / 205 |
| curated events | 8 |
| sources with public items | 64 |

The public event layer currently contains two multi-item events. Four repeated signals become two event cards, reducing two duplicate readings. This is useful but still thin; cross-family coverage is shown with an explicit warning that different source families do not prove source independence.

## Public Product

- `/`: current data status, `今日行业精选`, industry pulse, source health, limitations, and Ask/Write entry points.
- `/radar/`: event-first tabs for selected events, all events, all signals, timeline, review, and source health.
- `/reports/`: daily and weekly evidence drafts with event counts, citations, diversity, gate status, caveats, and missing evidence.
- `/ask/`: browser-local queries over the public event snapshot. The public API response shape is unchanged.
- `/write/`: browser-local evidence-led writing over selected events. The public API response shape is unchanged.
- `/entities/`: public entity index and evidence detail pages.
- `/en/*`: equivalent English product routes.

`全部信号` contains all 261 public-safe radar rows. Low-event homepage, directory, documentation-index, and repository-metadata signals remain auditable there but do not enter event clustering or `行业精选`.

## Data Loop

```text
source registry
  -> bounded resumable crawl
  -> normalized raw items
  -> bounded DeepSeek understanding
  -> controlled Supabase persistence
  -> deterministic event clustering and scoring
  -> report quality gates
  -> public-safe snapshot
  -> Cloudflare Pages
```

Deterministic code owns public-field allowlists, relevance thresholds, merge safeguards, quality gates, and write gates. DeepSeek is used only for bounded understanding/report tasks and never becomes the public safety boundary.

## Local Commands

```powershell
npm ci
npm run dev
```

Validation:

```powershell
npm run lint
npm run typecheck
npm test
npm run validate:data
npm run sensitive:scan
npm run build
npm run check:deployment
npm run cloudflare:build
```

Resumable activation:

```powershell
npm run data:activate:resumable:mock -- --limit 10 --chunk-size 5 --max-items-per-source 2
npm run data:activate:resumable:live -- --limit 30 --chunk-size 5 --max-items-per-source 3
npm run data:activate:resumable:resume -- --mode live
npm run data:activate:resumable:status
```

Event and report generation:

```powershell
npm run events:cluster
npm run report:generate:daily
npm run report:generate:weekly
```

Persistence requires a temporary process-level write gate and an explicit persistence command. Deployed environments keep `ENABLE_SUPABASE_WRITES=false`.

## Cloudflare Build

Normal local builds may reuse a public-safe local snapshot. Release/deployment builds must fail closed and read Supabase public views:

```powershell
$env:CLOUDFLARE_SNAPSHOT_READ_SUPABASE="true"
$env:CLOUDFLARE_SNAPSHOT_REQUIRE_SUPABASE="true"
npm run cloudflare:build
```

Strict export requires:

- `source.kind=\"supabase_public_views\"` and `source.data_source=\"public_evidence_store\"`;
- no local fallback;
- public count and exported `全部信号` count parity;
- at least 180 public signals;
- a populated event layer and at least five curated events;
- daily and weekly quality summaries, with the weekly gate passing;
- a valid public `published_at` no older than the configured release threshold.

## Manual Refresh Workflow

`.github/workflows/radar-refresh-cloudflare.yml` is `workflow_dispatch` only. It supports mock/live mode, bounded limits, optional controlled persistence, event clustering, report generation, optional Cloudflare deployment, and a redacted run-summary artifact. There is no schedule.

Live persistence additionally requires `RADAR_REFRESH_WRITE_GATE=true`, `persist=true`, `mode=live`, and `main`. Cloudflare deployment is also restricted to `main`.

## Public Data Boundary

Public runtime reads use only:

- `public_radar_items`
- `public_report_candidates`
- `public_reports`
- `data/radar-snapshot.json`

The three Supabase views use `security_invoker=true`. Anonymous roles receive only the specific safe base columns required by those views, and RLS limits rows. Raw items, raw/model metadata, evidence notes, report metadata, provider payloads, private notes, service credentials, operational logs, and wrong-domain model-radar tables are not public.

## Deliberate Limits

- no scheduled writes;
- no automatic X crawl;
- no automatic WeChat crawl;
- no source-health writes;
- no automatic report publication;
- no public service-role access;
- no claim of complete real-time industry coverage.

## Release Documentation

- [Final release candidate](./docs/release-candidate-final.md)
- [Data status](./docs/release-candidate-data-status.md)
- [Data completeness ledger](./docs/data-completeness-release-candidate.md)
- [Event clustering](./docs/event-clustering-release-candidate.md)
- [Report quality gates](./docs/report-quality-gates-milestone-m.md)
- [Manual refresh operations](./docs/ops-refresh-cloudflare-milestone-m.md)
- [Bilingual public surface](./docs/chinese-public-surface-milestone-m.md)
- [Data boundary audit](./docs/data-boundary-audit-release-candidate.md)
- [LearnPrompt reference analysis](./docs/reference-ai-news-radar-event-layer.md)
