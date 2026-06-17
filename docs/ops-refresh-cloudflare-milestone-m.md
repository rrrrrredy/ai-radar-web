# Milestone M Reviewed Refresh and Cloudflare Workflow

Date: 2026-05-26

## Purpose

Milestone M adds a manual, reviewed GitHub Actions workflow that can refresh radar data in bounded resumable chunks, optionally persist reviewed results to Supabase, regenerate report candidates with quality gates, build the public-safe Cloudflare snapshot, and optionally deploy Cloudflare Pages.

The workflow is manual only. It does not add a schedule and does not enable scheduled writes.

## Workflow

File:

```text
.github/workflows/radar-refresh-cloudflare.yml
```

Trigger:

```text
workflow_dispatch only
```

Inputs:

| input | default | purpose |
| --- | --- | --- |
| `mode` | `mock` | `mock` or `live` resumable activation mode |
| `persist` | `false` | when `true`, persist successful chunks and report candidates through the write gate |
| `limit` | `30` | maximum selected sources |
| `chunk_size` | `5` | sources per resumable chunk |
| `max_items_per_source` | `3` | maximum items collected from each source |
| `deploy_cloudflare` | `false` | deploy `dist/cloudflare-pages` to Cloudflare Pages |
| `generate_reports` | `true` | generate daily and weekly candidates or dry-run drafts |
| `run_events_cluster` | `true` | generate the public-safe event layer used by Cloudflare and reports |

Required secrets or variables:

| name | kind | used for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | variable or secret | public-safe Supabase reads |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | variable or secret | public-safe Supabase reads |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | controlled service reads and explicit write-gated persistence |
| `DEEPSEEK_API_KEY` | secret | live activation/report generation only |
| `CLOUDFLARE_API_TOKEN` | secret | Cloudflare Pages deploy |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Cloudflare Pages deploy |
| `RADAR_REFRESH_WRITE_GATE` | variable | must be `true` in addition to `persist=true` before writes run |
| `GITHUB_TOKEN` | built-in token | optional authenticated GitHub source retrieval |

## Safety Gates

Global workflow env keeps:

```text
ENABLE_SUPABASE_WRITES=false
ENABLE_SCHEDULED_PERSISTENCE=false
ENABLE_LIVE_DEEPSEEK_IN_JOBS=false
ENABLE_X_API=false
ENABLE_WECHAT_AUTH=false
```

Supabase writes run only when both are true:

```text
workflow input persist=true
vars.RADAR_REFRESH_WRITE_GATE=true
```

The write gate is applied only to the activation/report candidate steps. Cloudflare build and deploy keep `ENABLE_SUPABASE_WRITES=false`.

## Run Order

1. Checkout.
2. Setup Node 20.
3. Install dependencies.
4. Run validation preflight: lint, typecheck, data validation, sensitive scan.
5. Capture before counts with `npm run ops:summary`.
6. Enforce the explicit write gate if `persist=true`.
7. Run `npm run data:activate:resumable:<mode>` with bounded inputs.
8. Generate the event layer when `run_events_cluster=true`.
9. Generate report drafts or write report candidates, applying quality gates.
10. Build the Cloudflare public snapshot with `npm run cloudflare:build`.
11. Deploy Cloudflare only when `deploy_cloudflare=true`.
12. Write and upload the ops summary artifact.

Artifact paths:

```text
data/ops/latest/radar-refresh-summary.json
data/ops/latest/radar-refresh-summary.md
```

These files are git ignored and uploaded as workflow artifacts.

## Local Equivalent

Mock validation:

```bash
npm run data:activate:resumable:mock -- --limit 10 --chunk-size 5 --max-items-per-source 2
npm run events:cluster
npm run cloudflare:build
```

Controlled live refresh without writes:

```bash
npm run data:activate:resumable:live -- --limit 30 --chunk-size 5 --max-items-per-source 3
```

Controlled persistence for an already reviewed run:

```powershell
$env:ENABLE_SUPABASE_WRITES="true"
npm run data:activate:resumable:live:persist -- --persist --resume
npm run report:candidate:daily:write
npm run report:candidate:weekly:write
Remove-Item Env:ENABLE_SUPABASE_WRITES
```

Cloudflare deploy:

```bash
npm run cloudflare:build
npx wrangler pages deploy dist/cloudflare-pages --project-name=ai-industry-radar --branch=main
```

Cloudflare Git integration:

- `wrangler.toml` is committed as the Pages project source of truth.
- `pages_build_output_dir` is `dist/cloudflare-pages`.
- `npm run build` runs both `next build` and `npm run cloudflare:build`, so a Cloudflare Git build from `main` produces the same public static output as the manual Wrangler deploy path.
- Manual Wrangler deploy remains the preferred recovery path when the dashboard build cache or Git integration lags behind the reviewed local build.

## What Is Not Automated

- No scheduled write workflow.
- No source-health writes.
- No X automatic crawl.
- No WeChat automatic crawl.
- No admin login or Preview auth dependency.
- No GitHub Pages deployment path.
- No automatic migration application.
- No automatic report publication.

## Final RC Run

The 2026-06-17 recovery run used controlled live DeepSeek activation chunks and a public-safe Cloudflare snapshot merge. Supabase was not written because the configured project host was unavailable from the runner.

Current Cloudflare snapshot:

- 203 public radar rows
- 200 public event clusters
- 22 report snapshots
- daily and weekly quality gates passed
- preferred 200-row public target met

The remaining operating risks are source quality and availability, not UI wiring: many configured sources are manual/blocked, GitHub API sources require authenticated rate limits for reliable release coverage, and several HTML sources only expose landing/category/archive pages unless source-specific parsers are added.
