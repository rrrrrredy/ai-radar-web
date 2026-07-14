# AI Radar vNext Per-Section Entity Coverage & Static Mirror Parity

This round extends report traceability from report-level support to section-level support.

## Product Intent

AI Radar reports should not only say "this report has sources." Each report section should show which public evidence and tracked entities support that part of the synthesis.

## Implementation

- `lib/reports/entity-traceability.ts` now exposes `reportSectionTraceability`.
- `/reports` renders "章节实体覆盖" inside each report section.
- `/reports/[id]` renders the same section-level coverage for saved report detail pages.
- Cloudflare static reports render report-linked entities and section entity coverage.
- GitHub Pages mirror reports render the same traceability summary in English.
- Smoke tests now cover duplicate-title evidence matching and section citation mapping.

## Boundaries

- Section traceability only uses public citations, public radar item IDs, URLs, and unique title/source fallbacks.
- Title-only matching is allowed only when the title is unique in the eligible public evidence set.
- Static mirrors link entity chips back to the dynamic app because the static mirrors do not currently host `/entities/[entityId]`.
- This does not change report publication rules. Evidence drafts stay drafts until the admin reviewed/published workflow creates a formal report.

## Remaining Gaps

- Static mirrors still do not host full entity detail pages locally.
- Report/feed loading can be deduplicated so fallback report generation and traceability share exactly one in-memory feed.
- Section coverage is citation-driven; sections with no citations intentionally show empty coverage instead of inferred entities.
