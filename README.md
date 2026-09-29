# AI Industry Radar

AI Industry Radar is a Chinese-first, event-level AI information product. It turns public signals into deduplicated updates, keeps original sources traceable, and explains why each development deserves attention.

- Primary public site: https://ai-industry-radar.pages.dev
- Browser title brand: `AI 行业信息雷达`
- Default language: Chinese
- English routes: `/en/` and matching `/en/*` pages
- GitHub Pages: not used

## Public Product

The public information architecture has three main reader-facing sections:

- `/`: `今日热点`, up to ten recent developments with publication time, source, category, and factual summaries.
- `/radar/`: `全部动态`, a continuous event feed with search, source-family filters, and topic filters.
- `/sources/`: `来源`, explaining the public sources and source families used by the product.
- `/en/*`: equivalent English routes.

The public experience is a reading product, not an operations dashboard. Internal scores, ingestion state, write controls, and raw provider output are not navigation items or reader-facing content.

## Data Loop

```text
Supabase Cron (09:00 Asia/Shanghai)
  -> existing cloud source tasks
  -> normalized and deduplicated source results
  -> atomic publication in Supabase
  -> read-only Pages /api/live-feed
  -> reader pages refresh on opening or returning to the foreground
```

Pages is a static shell with a read-only data endpoint. A daily data refresh does not rebuild or redeploy the site. GitHub Actions is not part of the production refresh path. Local understanding tools remain available separately; the daily collector does not silently enable model calls.

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
npm run cloudflare:build
```

Resumable activation and event clustering:

```powershell
npm run data:activate:resumable:mock -- --limit 10 --chunk-size 5 --max-items-per-source 2
npm run data:activate:resumable:live -- --limit 30 --chunk-size 5 --max-items-per-source 3
npm run data:activate:resumable:live:persist -- --limit 30 --chunk-size 5 --max-items-per-source 3
npm run data:activate:resumable:status
npm run events:cluster
```

Local persistence still requires `ENABLE_SUPABASE_WRITES=true` plus valid Supabase service credentials. The public Cloudflare runtime is read-only.

## Daily Production Refresh

The existing Supabase job starts at **01:00 UTC / 09:00 Asia/Shanghai**. Its `0-5 1 * * *` retry window revisits the same daily run; it does not start six independent scans. Sources run through the authenticated `radar-cloud-refresh` Edge Function. The database retains the previous public data when a run cannot publish.

The public feed selects records by their original publication date before applying result limits, event deduplication, and time-decayed ranking. It never substitutes collection time for a missing publication date. The homepage shows up to ten highlights from the last seven days. Short and empty results replace the previous sections together with their matching timestamp.

Near-identical coverage can share one event with linked sources. Different numbered versions, tutorials, reviews, and uncertain announcements are kept separate. Generic impact text and story-specific browser title patches are not used as substitutes for edited content.

Cloudflare credentials are needed for code deployments only. Daily collection depends on the existing Supabase project, function, and schedule, not a local machine or Codex session.

When a server-side DeepSeek credential is configured, recent source articles receive a Chinese headline and concise summary in the cloud function. Unchanged input reuses saved copy; unknown dates and articles older than seven days do not incur editing calls. The original headline, publication date and source summary remain intact. A provider failure retains source text. Edited copy is persisted only with a successful complete scan, in the same database transaction. The provider credential stays in Edge Function secrets or service-role-only Supabase Vault; no browser receives it.

## Strict Cloudflare Build

Local development may use a public-safe local snapshot. Production must fail closed:

```powershell
$env:CLOUDFLARE_SNAPSHOT_READ_SUPABASE="true"
$env:CLOUDFLARE_SNAPSHOT_REQUIRE_SUPABASE="true"
npm run cloudflare:build
```

The production exporter must confirm a Supabase public-view source, no local fallback, complete public-signal parity, a populated event layer, required coverage, and a valid recent public timestamp. Missing, incomplete, stale, or unreachable Supabase data fails the build and blocks deployment.

## Public Data Boundary

Cloudflare serves an allowlisted live feed and a build-time fallback snapshot derived from approved Supabase public views. Public fields are limited to reader-facing event, signal, source, citation, relationship, and freshness data.

Raw text, raw/model metadata, evidence notes, private notes, admin/audit logs, service credentials, provider payloads, cookies, operational checkpoints, and unrelated database relations are never public.

## Deliberate Limits

- no automatic X crawl;
- no automatic WeChat crawl;
- no browser or public service-role access;
- no claim of complete real-time industry coverage;
- the daily task starts at 09:00 Beijing time; source, network, and processing time prevent a zero-delay completion guarantee;
- Supabase Cron and the authenticated cloud function must remain active for daily publication.

## Release Documentation

- [Final release candidate](./docs/release-candidate-final.md)
- [Data status](./docs/release-candidate-data-status.md)
- [Data completeness ledger](./docs/data-completeness-release-candidate.md)
- [Event clustering](./docs/event-clustering-release-candidate.md)
- [Bilingual public surface](./docs/chinese-public-surface-milestone-m.md)
- [Data boundary audit](./docs/data-boundary-audit-release-candidate.md)
- [AI news radar reference analysis](./docs/reference-ai-news-radar-event-layer.md)
