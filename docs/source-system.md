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
- `html`: public page suitable for a Phase 4 crawler.
- `api`: public API-oriented source such as GitHub.
- `x_api_future`: public X account retained for a future API or manual workflow.
- `podcast_feed`: public podcast feed explicitly provided.
- `youtube_feed`: public channel URL suitable for future channel ingestion.
- `manual`: public platform page or reference that is not directly crawl-ready.
- `no_crawl`: non-news references such as books.
- `unknown`: missing public URL.

## Platform Limitations

X accounts require a future API/manual path and should not be treated as HTML-crawlable. WeChat public-account style sources are preserved as names and notes, but the first version does not auto-crawl them. Image-only contact methods are stripped, so these entries require manual public URL completion before ingestion.

## Source Rules

- Prefer official and primary sources.
- Keep rumor or leak sources low weight and clearly marked.
- Reject private intranet URLs and credentialed sources.
- Store only public URLs in seed data.
- Track source health separately from source trust.
