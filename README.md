# AI Industry Radar

AI Industry Radar is a Chinese-first, event-level AI information product. It turns public signals into deduplicated updates, keeps original sources traceable, and explains why each development deserves attention.

- Primary public site: https://ai-industry-radar.pages.dev
- Browser title brand: `AI 行业信息雷达`
- Default language: Chinese
- English routes: `/en/` and matching `/en/*` pages
- GitHub Pages: not used

## Public Product

The public information architecture has four reader-facing sections:

- `/`: `今日热点`, exactly ten ranked developments with time, source, category, readable summary, and `为什么值得看`.
- `/radar/`: `全部动态`, a continuous event feed with search, source-family filters, and topic filters.
- `/sources/`: `来源`, explaining the public sources and source families used by the product.
- `/about/`: `关于`, explaining the product method, boundaries, and update cadence.
- `/en/*`: equivalent English routes.

The public experience is a reading product, not an operations dashboard. Internal scores, ingestion state, write controls, and raw provider output are not navigation items or reader-facing content.

## Data Loop

```text
public source registry
  -> bounded resumable live crawl
  -> normalized and deduplicated items
  -> bounded DeepSeek understanding
  -> controlled Supabase persistence
  -> deterministic event clustering and scoring
  -> strict public-safe Supabase snapshot
  -> Cloudflare Pages production deployment
```

Deterministic code owns public-field allowlists, relevance thresholds, merge safeguards, title normalization, and write gates. DeepSeek is used only for bounded understanding; it is not the public safety boundary.

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

`.github/workflows/radar-refresh-cloudflare.yml` runs every day at **08:17 Asia/Shanghai** (`00:17 UTC`) and also supports `workflow_dispatch`.

Every scheduled run follows one production path:

1. validate the `main` ref, bounded parameters, and repository write gate;
2. run live resumable activation and persist successful chunks to Supabase;
3. cluster and persist public events;
4. build a strict Supabase-backed Cloudflare snapshot;
5. run release validation;
6. deploy the `main` artifact to Cloudflare Pages;
7. verify https://ai-industry-radar.pages.dev/.

Manual runs expose only `limit`, `chunk_size`, and `max_items_per_source`. They still use live mode, persistence, strict snapshot export, validation, and production deployment. Production runs are restricted to `refs/heads/main`.

The workflow restores incomplete activation checkpoints across runs. A fully persisted checkpoint is discarded before the next scheduled run so each successful day starts a fresh crawl. Concurrency is fixed to one production refresh at a time and an in-progress run is not cancelled by a new trigger.

### Required repository configuration

Repository variables:

- `RADAR_REFRESH_WRITE_GATE=true`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `CLOUDFLARE_ACCOUNT_ID`

Repository secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `DEEPSEEK_API_KEY`
- `CLOUDFLARE_API_TOKEN`

The workflow accepts secret fallbacks for the Supabase public values and Cloudflare account ID, but variables are preferred because those values are not credentials. `GITHUB_TOKEN` is supplied automatically by GitHub Actions.

The workflow has only `contents: read` permission. Service-role and model credentials are exposed only to the live persistence step, the service-role credential is separately scoped to event persistence, and Cloudflare credentials are exposed only to deployment.

## Strict Cloudflare Build

Local development may use a public-safe local snapshot. Production must fail closed:

```powershell
$env:CLOUDFLARE_SNAPSHOT_READ_SUPABASE="true"
$env:CLOUDFLARE_SNAPSHOT_REQUIRE_SUPABASE="true"
npm run cloudflare:build
```

The production exporter must confirm a Supabase public-view source, no local fallback, complete public-signal parity, a populated event layer, required coverage, and a valid recent public timestamp. Missing, incomplete, stale, or unreachable Supabase data fails the build and blocks deployment.

## Public Data Boundary

Cloudflare publishes one allowlisted, read-only snapshot derived from approved Supabase public views. Public fields are limited to reader-facing event, signal, source, citation, relationship, and freshness data.

Raw text, raw/model metadata, evidence notes, private notes, admin/audit logs, service credentials, provider payloads, cookies, operational checkpoints, and unrelated database relations are never public.

## Deliberate Limits

- no automatic X crawl;
- no automatic WeChat crawl;
- no browser or public service-role access;
- no claim of complete real-time industry coverage;
- scheduled workflows may be delayed by GitHub Actions load and require an enabled Actions billing state.

## Release Documentation

- [Final release candidate](./docs/release-candidate-final.md)
- [Data status](./docs/release-candidate-data-status.md)
- [Data completeness ledger](./docs/data-completeness-release-candidate.md)
- [Event clustering](./docs/event-clustering-release-candidate.md)
- [Bilingual public surface](./docs/chinese-public-surface-milestone-m.md)
- [Data boundary audit](./docs/data-boundary-audit-release-candidate.md)
- [AI news radar reference analysis](./docs/reference-ai-news-radar-event-layer.md)
