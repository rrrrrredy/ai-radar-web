# Milestone L Cloudflare Primary Deployment

Date: 2026-05-22

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

- `https://eafa66c6.ai-industry-radar.pages.dev`

Wrangler:

- `npx wrangler --version` -> `4.86.0`
- `npx wrangler pages project create ai-industry-radar --production-branch=main`
- `npx wrangler pages deploy dist/cloudflare-pages --project-name=ai-industry-radar --branch=main`

## Route smoke

Cloudflare production alias:

| Route | Status | Result |
| --- | ---: | --- |
| `/` | 200 | AI Industry Radar, Cloudflare primary label, Supabase counts visible |
| `/radar/` | 200 | 106 public rows, filters/search/distributions, citations visible |
| `/reports/` | 200 | Daily/weekly candidates, statuses, windows, citations, caveats, Markdown export |
| `/ask/` | 200 | Data source, freshness, query examples, caveats visible |
| `/write/` | 200 | Data source, report context, prompt examples, caveats visible |
| `/data/radar-snapshot.json` | 200 | Public JSON snapshot with 106 public rows and 14 report candidates |

Browser verification:

- Homepage DOM showed sources 312, raw items 140, radar items 121, public rows 106, report candidates 14.
- `/radar/` rendered 106 rows and filter controls. Searching `OpenAI` reduced visible rows to 15.
- `/reports/`, `/ask/`, and `/write/` showed AI Industry Radar branding, Supabase-backed data, and no wrong-domain strings.
- Browser console check returned no warnings or errors on checked routes.

## Data freshness

Snapshot generated:

- `2026-05-22T04:21:45.807Z` on the first deployment
- refreshed on redeploy after `/write` caveat polish

Latest public radar timestamp:

- `2026-05-22T04:13:38.288+00:00`

Latest ingestion:

- `2026-05-22T04:11:48.668+00:00`

Latest understanding:

- `2026-05-22T04:14:10.821+00:00`

## Vercel role

Vercel remains healthy as the reference dynamic deployment:

- `https://ai-radar-web-luosongred-5507s-projects.vercel.app`
- Public pages return 200.
- `/api/ask` mock returns 200 with Supabase-backed citations.
- `/api/writing-assistant` mock returns 200 with Supabase-backed topic candidates.

Vercel is not the primary public access path for Milestone L.

## Caveats

- Cloudflare Pages site is read-only and public-safe.
- Interactive generation APIs and admin/auth workflows remain on the reference dynamic app.
- GitHub rate limits and some public source 403/fetch failures remain data-coverage caveats.
- No scheduled jobs were run or enabled.

## Next milestone recommendation

Milestone M should add a reviewed scheduled Cloudflare/GitHub data workflow that runs the resumable activation in bounded chunks, publishes a fresh Cloudflare snapshot, and alerts on failed source families without writing source-health rows.
