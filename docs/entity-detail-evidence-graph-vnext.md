# AI Radar vNext Entity Detail & Evidence Graph

This round turns entities from list cards into public evidence objects.

## Product Intent

An AI Radar entity detail page should answer:

1. Why is this entity worth tracking?
2. Which public signals support that judgment?
3. Are the signals multi-source, fresh, and category-diverse?
4. Which signals are still `needs_review`?
5. What should a reader do next: inspect radar evidence, keep tracking the entity, or review the report path?

## Implementation

- `lib/radar/entity-insights.ts` now owns stable entity route IDs, entity links, entity lookup, evidence item filtering, and evidence graph aggregation.
- `/entities` links top tracked entities and entity cards to `/entities/[entityId]`.
- `/entities/[entityId]` renders:
  - tracking summary and public boundary copy,
  - metrics for signals, sources, categories, review risk, and priority,
  - tracking reasons and next questions,
  - evidence graph coverage by source/category/status,
  - evidence timeline with source links and `needs_review` cautions,
  - citations derived from the same public radar items.
- `/radar` entity cards now link to entity detail before sending users into reports.

## Boundaries

- Entity detail pages use public radar item fields only.
- They do not claim to be private profiles, canonical biographies, or a complete knowledge graph.
- `needs_review` evidence remains visible as review risk, not as a confirmed fact.
- Report publication still requires the existing admin reviewed/published workflow.

## Remaining Gaps

- Entity merge quality is still only as good as the understanding output plus the fallback rules.
- Reports do not yet show which entity detail pages they support.
- There is no persisted entity history across snapshots yet.
