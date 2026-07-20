# Project Brief

## Product Name

AI Industry Radar / AI 行业信息雷达

## Target Users

- AI practitioners who need to track technical and product changes.
- Product managers who need market and feature awareness.
- Researchers who need signal from papers, models, labs, and open-source projects.
- Investors who need early views of companies, products, and adoption.
- Non-technical readers who need concise Chinese summaries with direct sources.
- The author, as a personal AI industry reading and decision dashboard.

## Daily Jobs To Be Done

- See the ten developments that matter most today.
- Understand what changed without opening every source first.
- Identify one event across repeated coverage instead of reading duplicates.
- Track models, products, companies, papers, people, and projects.
- Verify summaries through visible source links and publication times.
- Browse the wider update stream by topic, source family, or search.

## Product Principles

- Public information only.
- Source attribution by default.
- Reader language first; internal scores and operational state stay internal.
- Facts, evidence-backed inference, and speculation remain distinct.
- Official and primary sources outrank summaries and rumors.
- Titles use correct brand casing, concrete subject-action wording, and no mid-word truncation.
- Chinese and English routes preserve meaning rather than mechanically mirroring wording.

## Public Information Architecture

- `今日热点`: exactly ten ranked updates with summary and `为什么值得看`.
- `全部动态`: the complete reader-facing event stream with search and filters.
- `来源`: source names, source families, and traceability guidance.
- `关于`: method, update cadence, product boundary, and limitations.

The public site is a reading product. Admin controls, ingestion status, internal scoring, and data-write operations do not appear in public navigation.

## Daily Production Operation

At 08:17 Asia/Shanghai every day, GitHub Actions runs live source activation, persists successful chunks to Supabase, clusters and persists events, builds a strict Supabase-backed public snapshot, validates it, deploys to Cloudflare Pages, and verifies the production endpoint.

The run is restricted to `main`, protected by `RADAR_REFRESH_WRITE_GATE=true`, and serialized by one production concurrency group. Strict production builds fail when Supabase is unavailable, incomplete, stale, or below the release boundary; they never fall back to local files.

## Public and Private Boundary

The system may store public source metadata, public URLs, public article metadata, normalized events, and reader-facing summaries. Secrets stay in repository secrets or environment variables. Private credentials, cookies, browser profiles, intranet links, private company URLs, raw provider payloads, and service-role access are never shipped to the public site.

## MVP Scope

- AI HOT-inspired, Chinese-first public reading interface.
- Ten-item daily hotspot ranking.
- Searchable and filterable event stream.
- Source and methodology pages.
- Curated public-source ingestion with resumable live activation.
- Deduplication, event clustering, entity extraction, and title normalization.
- Source-attributed Chinese and English summaries.
- Supabase persistence behind an explicit write gate.
- Strict public snapshot export and Cloudflare Pages deployment.
- Daily automated production refresh plus manual rerun support.

## Non-Goals

- Building a general-purpose search engine.
- Replacing primary sources or expert judgment.
- Supporting private scraping or credentialed browsing.
- Exposing internal operations as a public dashboard.
- Implementing a full social network or native mobile app.
