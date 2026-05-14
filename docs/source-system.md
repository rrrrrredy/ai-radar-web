# Source System

The source system manages public information sources and their trust characteristics.

## Phase 3 Registry

Phase 3 adds a cleaned seed registry generated from the local AI learning/resource markdown file:

- `data/seed/sources/ai-learning-resources.cleaned.json`
- `data/seed/sources/ai-learning-resources.audit.md`
- `data/seed/sources/source-import-summary.json`

The raw input file is intentionally local-only and is not committed. Regenerate the cleaned artifacts with:

```bash
npm run import:sources
```

## Source Categories

Sources are categorized using `data/seed/source-taxonomy.json`. Categories include official company channels, research labs, arXiv, GitHub, Hugging Face, AI media, tech media, newsletters, podcasts, YouTube, X accounts, investors, researchers, builders, journalists, rumors or leaks, and manual imports.

## Source Fields

Each source should track name, type, category, description, public URL, optional public feed or platform URL, language, region, tier, weight, crawl method, update frequency, status, tags, notes, risk flags, source origin, and timestamps.

Sources without a public URL stay in the registry with `url: null` and `status: "needs_public_url"`. They are not eligible for automated ingestion until a public homepage is supplied and reviewed.

## Cleaning Policy

- Commit public-information metadata only.
- Strip private, internal, local, credentialed, attachment-only, and image-only links.
- Strip QR/image contact references rather than trying to preserve them.
- Do not invent source URLs.
- Do not create RSS/feed URLs unless the input explicitly provides a public feed.
- Preserve useful source names and descriptions even when the source still needs a public URL.
- Keep parser limitations visible in the audit report instead of silently dropping uncertain rows.

## Tiering

- `T1`: primary official sources, first-party release channels, public code/release sources, and direct builders/researchers discussing their own work.
- `T1.5`: credible specialist AI media, strong technical blogs, cited newsletters, and direct-interview podcasts.
- `T2`: reputable secondary media, investor blogs, community explainers, and high-signal commentary.
- `T3`: rumor/leak or low-confidence watch-only sources.
- `unreviewed`: useful entries that need manual confirmation, usually because a public URL is missing.

## Crawl Methods

- `rss`: public feed explicitly provided.
- `html`: public page suitable for Phase 4 metadata extraction.
- `api`: public API-oriented source such as GitHub.
- `x_api_future`: public X account retained for a future API or manual workflow.
- `podcast_feed`: public podcast feed explicitly provided.
- `youtube_feed`: public channel URL suitable for future channel ingestion.
- `manual`: public platform page or reference that is not directly crawl-ready.
- `no_crawl`: non-news references such as books.
- `unknown`: missing public URL.

## Platform Limitations

X accounts require a future API/manual path and should not be treated as HTML-crawlable. WeChat public-account style sources are preserved as names and notes, but the first version does not auto-crawl them. Image-only contact methods are stripped, so these entries require manual public URL completion before ingestion.

## Phase 4 Eligibility

The local ingestion runner selects only sources with:

- `status` of `active` or `trial`
- a non-empty public HTTP(S) URL
- `crawl_method` of `rss`, `html`, `api`, `podcast_feed`, or `youtube_feed`
- no `needs_public_url` risk flag
- no private, credentialed, attachment-only, or local-only URL fragments

Manual, future API, non-crawl, unknown, missing-public-URL, X automatic, and WeChat automatic workflows remain outside Phase 4 automation.

## Phase 5 Understanding Use

Phase 5 consumes raw items created by the public-source ingestion runner. It does not fetch new source content, does not auto-crawl X or WeChat, and does not require Supabase credentials.

Source tier and source weight are carried into each radar item:

- `source_tier` comes from the cleaned registry.
- `source_weight` is copied from metadata when available, with tier-based fallback.
- Credibility and final inclusion use source quality as rule-controlled inputs.

DeepSeek can suggest relevance, summaries, categories, tags, entities, and scoring rationale, but the code applies validation, relevance thresholds, and the weighted formula before assigning `included`, `excluded`, `needs_review`, or `failed`.

Local outputs:

- `data/understanding/latest/radar-items.json`
- `data/understanding/latest/understanding-run.json`
- `data/understanding/runs/*.json`

## Phase 7 Supabase Persistence

The cleaned registry can be imported into Supabase with:

```bash
npm run supabase:import:sources
```

The command is dry-run by default and upserts by `sources.slug` only when `--write`
and `ENABLE_SUPABASE_WRITES=true` are both present. All registry rows are preserved,
including `needs_public_url` rows, but source health checks only select public,
active/trial sources with supported crawl methods.

Source health selection is available with:

```bash
npm run source-health:dry-run
```

The dry run does not check public endpoints or write to Supabase.

## Source Rules

- Prefer official and primary sources.
- Keep rumor or leak sources low weight and clearly marked.
- Reject private intranet URLs and credentialed sources.
- Store only public URLs in seed data.
- Track source health separately from source trust.
