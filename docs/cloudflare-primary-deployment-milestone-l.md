# Milestone L Cloudflare Primary Deployment

Date: 2026-05-25

## Architecture chosen

Cloudflare is the primary public deployment path.

Chosen architecture: Cloudflare Pages public data site.

Reason: the current Next.js app includes admin/auth middleware, server actions, and service-role server workflows that should stay outside the public Cloudflare surface for this milestone. The Cloudflare public site is a productized public read surface, not a placeholder and not a GitHub Pages continuation. Vercel remains a reference dynamic deployment for Ask/Write APIs and admin/auth workflows.

## Cloudflare output

Build command:

```bash
npm run cloudflare:build
```

Output:

- `dist/cloudflare-pages/index.html`
- `dist/cloudflare-pages/radar/index.html`
- `dist/cloudflare-pages/reports/index.html`
- `dist/cloudflare-pages/ask/index.html`
- `dist/cloudflare-pages/write/index.html`
- `dist/cloudflare-pages/data/radar-snapshot.json`

Data source:

- Supabase public-safe read views: `public_radar_items`, `public_report_candidates`, `public_reports`.
- Aggregate operational counts from core tables.
- No raw private content, provider metadata, service-role keys, DeepSeek keys, admin tokens, cookies, or private artifacts are emitted.

## Deployment

Project:

- `ai-industry-radar`

Cloudflare URL:

- `https://ai-industry-radar.pages.dev`

Latest deployment alias observed:

- `https://04aa8a98.ai-industry-radar.pages.dev`

Wrangler:

- `npx wrangler --version` -> `4.86.0`
- `npx wrangler pages project create ai-industry-radar --production-branch=main`
- `npx wrangler pages deploy dist/cloudflare-pages --project-name=ai-industry-radar --branch=main`

## Route smoke

Cloudflare production alias:

| Route | Status | Result |
| --- | ---: | --- |
| `/` | 200 | Chinese-first AI 行业雷达 UI, Supabase counts, coverage and caveats visible |
| `/radar/` | 200 | 151 public rows, filters/search/distributions, citation rail visible |
| `/reports/` | 200 | Latest daily/weekly candidates, statuses, windows, citations, caveats, missing evidence, Markdown export |
| `/ask/` | 200 | Data source, freshness, Chinese example questions, caveats visible |
| `/write/` | 200 | Data source, report context, Chinese prompt examples, caveats visible |
| `/data/radar-snapshot.json` | 200 | Public JSON snapshot with 151 public rows and 18 report candidates |

Browser verification:

- Homepage DOM showed sources 312, raw items 173, radar items 167, public rows 151, report candidates 18.
- `/radar/` rendered 151 rows with filter controls, status/category/source distributions, and citation rail.
- `/reports/`, `/ask/`, and `/write/` showed Chinese-first AI 行业雷达 branding, Supabase-backed data, missing-evidence/caveat language, and no wrong-domain strings.
- Static HTML scan found remaining English only in source/report data such as proper titles, source names, and persisted source summaries.

## Data freshness

Snapshot generated:

- `2026-05-25T01:27Z` closeout Cloudflare build

Latest public radar timestamp:

- `2026-05-25T01:05:29.771+00:00`

Latest ingestion:

- `2026-05-25T01:03:44.664+00:00`

Latest understanding:

- `2026-05-25T01:05:55.654+00:00`

## Vercel role

Vercel remains the reference dynamic deployment:

- `https://ai-radar-web-luosongred-5507s-projects.vercel.app`
- Public pages return 200.
- `/api/ask` mock returns 200 with Supabase-backed citations.
- `/api/writing-assistant` mock returns 200 with Supabase-backed topic candidates.
- The Chinese-first Vercel UI should be rechecked after the final closeout commit is pushed to `main` and Vercel finishes its Git-triggered build.

Vercel is not the primary public access path for Milestone L.

## Caveats

- Cloudflare Pages site is read-only and public-safe.
- Interactive generation APIs and admin/auth workflows remain on the reference dynamic app.
- Manual/blocked sources remain outside automation: X API future sources, WeChat/manual-only sources, and sources needing public URL review.
- Original failed sources were handled with one bounded retry for timeout/fetch failures and final blocked-access reason for HTTP 403 sources.
- No scheduled jobs were run or enabled.

## Next milestone recommendation

Milestone M should add a reviewed scheduled Cloudflare/GitHub data workflow that runs the resumable activation in bounded chunks, publishes a fresh Cloudflare snapshot, and alerts on failed source families without writing source-health rows.
