# AI Radar vNext Evidence-to-Insight Loop

This round turns the public reading flow into a clearer loop:

1. Public radar evidence shows what happened.
2. Entity tracking explains which companies, models, products, papers, and projects are worth watching.
3. Report drafts expose evidence quality and missing support without becoming final conclusions.
4. Report publishing remains admin-reviewed before anything becomes a formal public report.

## Product Intent

AI Radar should not behave like a news list or model leaderboard. It should help a reader move from public evidence to a defensible industry judgment:

- Is this signal more than one-off noise?
- Which entity does it affect?
- What is missing before publishing?
- Which workflow should the user enter next?

## Implementation

- `lib/radar/entity-insights.ts` derives entity summaries, tracking priority, reasons, and next questions from public radar items only.
- `/entities` now shows a tracking queue, per-entity tracking reasons, next questions, links to entity detail pages, and links back to radar evidence or the report path.
- `/radar` now includes a "from evidence to insight" panel that connects visible signals to entity tracking, report drafts, and admin review.
- `/reports` now includes a "evidence to report path" panel that explains how drafts become reviewed or published reports through admin review.
- `scripts/smoke-test.ts` includes regression guards for the helper and the three public surfaces.

## Boundaries

- The loop is read-only on public surfaces.
- Public assistant generation routes are removed; the loop stays evidence-first.
- Admin review links point to the existing admin route and do not bypass role or write-gate checks.
- Entity tracking is a public evidence index, not a private profile or canonical knowledge graph.

## Remaining Gaps

- Entity detail pages exist, but reports do not yet show which entity detail pages they support.
- Entity merge quality is rule-based when the upstream understanding layer does not provide entities.
- Report drafts do not yet show which entity or tracked question they best answer.
