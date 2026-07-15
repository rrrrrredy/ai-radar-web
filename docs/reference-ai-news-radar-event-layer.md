# LearnPrompt Reference Patterns for the Event Layer

Updated: 2026-07-15

Reference: https://github.com/LearnPrompt/ai-news-radar

## Inspected

The public repository README, pipeline description, generated-data contract, source-health model, selected/story views, and GitHub Actions refresh pattern were inspected. Relevant public artifacts include `latest-24h.json`, `latest-24h-all.json`, `source-status.json`, `daily-brief.json`, `stories-merged.json`, and `merge-log.json`.

The useful product sequence is: classify sources, fetch, normalize/deduplicate, filter AI relevance, merge repeated reports into stories, expose source health, rank a selected view, and publish an allowlisted static data contract. A selected event view and a fuller signal pool serve different user needs.

## Adapted

- source status is reader-visible product data;
- source families and tiers contribute to evidence confidence;
- normalized URL/title handling and event merging reduce repeated reading;
- freshness, importance, source quality, and multi-source coverage affect curation;
- curated events and all signals are separate views;
- merge results, citations, caveats, and failure families remain auditable;
- Cloudflare consumes a static allowlisted snapshot without write credentials;
- manual refresh uses resumable chunks and a safe summary artifact.

AI Industry Radar implements these patterns with its own registry, crawler boundary, DeepSeek understanding, deterministic clustering/scoring, report gates, source-health aggregates, bilingual UI, and Supabase/Cloudflare public contract.

## Not Copied

- no code, brand, product name, source data, generated story, or brief was copied;
- no external story became one of our citations;
- no GitHub Pages deployment, schedule, X crawl, private feed, or paid-source behavior was adopted;
- no external threshold is treated as our scoring truth;
- no LLM call is required for every merge.

## Implementation Decision

```text
all public-safe signals
  -> deterministic event eligibility
  -> guarded event clusters
  -> curated events
  -> quality-gated report candidates
  -> reviewed publication
```

Generic AI terms cannot merge events. Conflicting companies, projects, release versions, partnerships, and unrelated papers block or penalize a merge. Low-event pages remain in `全部信号` and are excluded only from events.

The RC has 261 public signals, 205 public display events, 207 event relationships, 8 curated events, one same-family multi-source event, and one cross-family event. The cross-family Anthropic/MIT Technology Review event uses a narrow tested concept alias. Product copy calls it cross-family coverage, not independent confirmation.
