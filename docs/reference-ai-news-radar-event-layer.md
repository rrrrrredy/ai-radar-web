# Reference: LearnPrompt/ai-news-radar Event Layer

Inspected: 2026-05-26

Reference repository:

- https://github.com/LearnPrompt/ai-news-radar

## What Was Inspected

- `README.md` / `README.en.md`: product framing and pipeline.
- `scripts/update_news.py`: source fetch, source status, normalization, dedupe, static JSON output.
- `scripts/ai_relevance.py`: explainable AI relevance scoring.
- `assets/app.js`: source health display, AI/full views, lightweight event merge for curated picks.
- `.github/workflows/update-news.yml`: static refresh workflow.
- `data/source-status.json`: public-safe source health structure.

## Useful Patterns

- Separate source judgment from fetching. A source can be automated, skipped, blocked, or future/manual.
- Make source health visible as product data, not only logs.
- Normalize URLs and titles before dedupe.
- Use explainable AI relevance scoring with source priors and noise terms.
- Keep selected/curated view separate from full raw view.
- Treat "same information should not be read 10 times" as a frontend information architecture problem: merge similar rows before showing the top view.
- Publish static public JSON plus static HTML for safe public distribution.

## What Not To Copy

- Do not copy product naming, branding, or "伯乐" language.
- Do not use GitHub Pages for this product; Cloudflare Pages remains primary.
- Do not copy scheduled workflow behavior. AI Industry Radar uses manual `workflow_dispatch` only.
- Do not crawl X or private/email sources automatically.
- Do not copy reference code directly; adapt the logic to our Supabase-backed data model.

## Adaptation Decisions

- Our product language is `行业精选`, `事件雷达`, `多源确认`, `来源健康`, `最新时间线`.
- Event clustering is deterministic first: title similarity, shared entities, category overlap, source family diversity, time proximity, URL/domain, and keyword overlap.
- Over-merge safeguards penalize unrelated strong entities and generic-only overlaps.
- Event scores combine AI relevance, credibility, diversity, freshness, novelty, importance, and multi-source confirmation.
- Cloudflare `data/radar-snapshot.json` exports only public-safe event fields.
- Raw item view remains available under `全部信号`.
