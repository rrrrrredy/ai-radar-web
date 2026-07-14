# LearnPrompt Reference Patterns for the Event Layer

Updated: 2026-07-14

Reference: https://github.com/LearnPrompt/ai-news-radar

## Inspected

The public repository README, pipeline description, generated-data contract, source-health model, selected/story views, and GitHub Actions refresh pattern were reviewed. Relevant public artifacts include `latest-24h.json`, `latest-24h-all.json`, `source-status.json`, `daily-brief.json`, `stories-merged.json`, and `merge-log.json`.

The useful product lesson is the sequence: classify sources, fetch, normalize/deduplicate, filter for AI relevance, merge repeated reports into stories, expose source health, rank a selected view, and publish an allowlisted static data contract. It explicitly treats repeated reports as one story line and keeps a fuller signal pool behind the selected view.

## Adapted Patterns

- source status is product data, not an invisible crawler log;
- source families and source tiers affect evidence confidence;
- normalized URLs/titles and event-level merging reduce repeated reading;
- multi-source confirmation, freshness, importance, and source quality affect selection;
- curated events and complete signals are separate user views;
- merge decisions, citations, caveats, and failure families remain auditable;
- the public site reads static allowlisted JSON and does not need write credentials.

AI Industry Radar implements these patterns through its own source registry, resumable activation, DeepSeek understanding, deterministic event clustering, event scoring, report gates, source-health aggregates, bilingual Cloudflare site, and public snapshot.

## Not Copied

- no code, branding, product name, source data, story data, or generated brief is copied;
- no external story becomes one of our citations or report claims;
- no scheduled workflow, GitHub Pages deployment, X crawl, private feed, mail source, or paid-source behavior is adopted;
- no external scoring threshold is treated as our product truth;
- no LLM call is required for every event merge.

## AI Industry Radar Decisions

```text
public-safe signals -> deterministic event clusters -> curated events -> quality-gated report candidates -> reviewed publication
```

Clustering uses title, entities, specific event actions, category, time, source, domain, and keyword evidence. Generic AI terms cannot merge events. Conflicting companies, projects, release versions, or partnership counterparts block or penalize a merge. The UI leads with `行业精选` and `事件雷达`, while `全部信号` retains item-level auditability.

The final RC has 242 public radar items, 234 current-run clusters, 188 public-display events, 8 curated events, and one genuine public multi-source event. This low multi-source count is disclosed rather than inflated by weakening merge safeguards.
