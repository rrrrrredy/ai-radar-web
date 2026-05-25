# Milestone M Reviewed Refresh and Cloudflare Workflow

Date: 2026-05-25

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
8. Generate report drafts or write report candidates, applying quality gates.
9. Build the Cloudflare public snapshot with `npm run cloudflare:build`.
10. Deploy Cloudflare only when `deploy_cloudflare=true`.
11. Write and upload the ops summary artifact.

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

The 2026-05-25 final RC run persisted 187 public radar rows, 203 raw items, 198 radar items, and 20 report candidates. The latest daily and weekly candidates both passed quality gates. The run met the 180-row minimum but did not reach the preferred 200+ target because the remaining automated-safe expansion was limited by unauthenticated GitHub rate limits and 226 manual/blocked sources.
