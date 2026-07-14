# AI Radar vNext Report-to-Entity Traceability

This round closes the loop between reports and tracked entities.

## Product Intent

Reports should not be standalone generated pages. A credible AI industry radar report should show:

1. Which public evidence supports the report.
2. Which tracked entities that evidence maps to.
3. Which entity details a reader can inspect before trusting the report.
4. Which evidence remains thin, single-source, or `needs_review`.

## Implementation

- `lib/reports/entity-traceability.ts` maps report `source_item_ids` and citations back to public radar items, then derives report-linked entity traces with `entityHref`.
- `/reports` now renders a "报告关联实体" panel for the selected report.
- `/reports/[id]` now renders an "关联实体" panel in the detail view.
- Report sections now render citation-driven "章节实体覆盖".
- Cloudflare and GitHub Pages mirrors now render report-linked entities and section entity coverage.
- Each trace links to `/entities/[entityId]` and `/radar?entity=...`.
- Empty traceability states explain that missing `source_item_ids`, citations, or public radar evidence block entity-level support.

## Boundaries

- Traceability is derived from public radar fields only.
- It does not expose model metadata, raw content, private notes, service-role access, or report raw markdown.
- It does not make approved candidates formal reports; publication still requires the admin reviewed/published workflow.
- Entity traces explain available support, not complete industry coverage.

## Remaining Gaps

- Static Cloudflare/GitHub mirrors link entity chips to the dynamic app instead of hosting entity detail pages locally.
- Section coverage is intentionally citation-driven and stays empty when a section does not expose citations.
- Entity trend history is still snapshot-derived rather than persisted across refreshes.
