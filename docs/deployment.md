# Deployment

Cloudflare Pages is the public production surface for AI 行业信息雷达.

- Production URL: `https://ai-industry-radar.pages.dev/`
- Cloudflare Pages project: `ai-industry-radar`
- Production branch: `main`
- Build artifact: `dist/cloudflare-pages`
- Daily workflow: `.github/workflows/radar-refresh-cloudflare.yml`

## Daily production refresh

Supabase Cron dispatches `.github/workflows/radar-refresh-cloudflare.yml` at `01:00 UTC`, equal to `09:00 Asia/Shanghai`. The GitHub workflow is `workflow_dispatch`-only, so Supabase is the sole scheduler and no duplicate GitHub scheduled run is created.

Each daily dispatch uses fixed inputs `limit=30`, `chunk_size=5`, and `max_items_per_source=3`. The workflow retries recoverable stages internally, uses same-day checkpoints when valid, and follows the same production gates whether invoked by Supabase or an operator.

Each successful run must complete this chain:

1. select 10 core sources plus a rotating long-tail batch;
2. fetch and understand live source data;
3. persist every activation chunk to Supabase;
4. cluster and persist public events;
5. export a strict Supabase-backed public snapshot with local fallback disabled;
6. render and test the Cloudflare artifact;
7. deploy the `main` artifact to Cloudflare Pages;
8. compare the remote snapshot generation ID and source contract with the local artifact.

Processing failures, missing chunks, persistence failures, stale evidence, a non-Supabase snapshot, forbidden legacy fields, deployment drift, or endpoint verification failure must fail the workflow.

The resumable cache supports two same-day recovery modes: incomplete activations resume, while a recent fully persisted activation skips collection and retries cluster/build/deploy. Checkpoints older than six hours, malformed checkpoints, and non-live checkpoints are discarded before starting fresh.

## GitHub repository configuration

Configure these Actions variables:

- `RADAR_REFRESH_WRITE_GATE=true`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `CLOUDFLARE_ACCOUNT_ID`

Configure these Actions secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `DEEPSEEK_API_KEY`
- `CLOUDFLARE_API_TOKEN`

The service-role and provider keys are server-only. Never expose them to browser code, committed files, logs, task text, or public deployment variables. The Cloudflare token should be scoped only to the `ai-industry-radar` Pages deployment needs.

Supabase Cron, GitHub Actions, and repository billing must be active. A configured schedule cannot refresh production while either service or the Actions jobs are suspended.

The Cron trigger is recorded in Supabase `cron.job`, with execution history in `cron.job_run_details`. The task starts at 09:00 Beijing time; live fetching, processing, deployment, and verification normally finish a few minutes later. Alerts or an independent watchdog are still required for a contractual completion-time guarantee.

## Supabase

For the existing project, keep the checked-in migration history aligned with the production migration history and apply every pending migration in version order. For a new project, use the current baseline and then apply the complete migration chain; do not follow an old milestone-only subset.

After migrations, run:

```bash
npm run supabase:public-contract
```

The anonymous key may read only the allowlisted public radar/event surface. Retired legacy tables and views must reject anonymous and authenticated Data API reads. The service-role key is used only in server-side persistence and sanitized snapshot-export steps.

## Release validation

Before a production deployment, run:

```bash
npm run check:deployment
```

For the release artifact, export from live Supabase with strict mode enabled; never publish an artifact whose snapshot says `local_data_used=true`. After deployment, verify both the homepage and `/data/radar-snapshot.json`; the remote `generated_at` must equal the just-built local snapshot.

The Vercel App Router deployment is a reference/admin surface and is not the public URL to share.
