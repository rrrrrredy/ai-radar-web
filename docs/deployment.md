# Deployment

Cloudflare Pages is the public production surface for AI 行业信息雷达.

- Production URL: `https://ai-industry-radar.pages.dev/`
- Cloudflare Pages project: `ai-industry-radar`
- Production branch: `main`
- Build artifact: `dist/cloudflare-pages`
- Daily workflow: `.github/workflows/radar-refresh-cloudflare.yml`

## Daily production refresh

GitHub Actions starts the production workflow every day at `08:17 Asia/Shanghai`. `workflow_dispatch` is also available for an operator retry, but it is subject to the same production gates and may run only from `main`.

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

The resumable cache is only a recovery mechanism for an incomplete run. Completed, malformed, or incompatible checkpoints are discarded so the next scheduled run starts cleanly.

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

GitHub Actions and repository billing must be active. A configured workflow cannot refresh production while Actions jobs are suspended.

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
