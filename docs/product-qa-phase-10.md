# Product QA Phase 10

## Routes Reviewed

- `/radar`
- `/reports`

Related public routes preserved for smoke:

- `/ask`
- `/write`

Protected route preserved for smoke:

- `/admin`

## Data Source Behavior

Both `/radar` and `/reports` use the shared server-side radar feed loader:

1. Read-only Supabase public radar retrieval when `ENABLE_SUPABASE_RETRIEVAL=true` and public Supabase config is available.
2. Local understanding output from `data/understanding/latest/radar-items.json`.
3. Synthetic mock radar data when no usable local output exists.
4. Empty state when no source returns usable rows.

Observed in this workspace during implementation:

- Source: local understanding output.
- Latest visible radar timestamp: `2026-05-14T03:04:21.359Z`.
- Retrieved rows: 3.
- Included rows: 0.
- `needs_review` rows: 2.
- Excluded rows: 1.
- Evidence quality: metadata-level local output, not complete current AI industry coverage.

## Radar Usability Score

Score: 8/10.

Rationale:

- Replaced placeholder cards with a real evidence list from the retrieval fallback chain.
- Shows source, freshness, status counts, category counts, source-tier counts, caveats, and citations.
- Server-side query filters cover status, category, source tier, language, and time window.
- Dense rows make source, timestamp, status, confidence, summary, why-it-matters, and citation visible.
- Remaining gap: no persisted user preferences, no advanced search text box, and no cross-source clustering on this page.

## Report Preview Usability Score

Score: 7/10.

Rationale:

- Daily and weekly previews are deterministic and generated only from retrieved radar items.
- Sections cover model/product/company updates, research/open-source, agents/products, business/ecosystem, and weak signals / `needs_review`.
- Explicitly states preview-only status and links to `/write` for editorial expansion.
- Remaining gap: no persisted report candidate workflow from the public page, no editorial approval/publication flow, and limited usefulness when the feed has only metadata-level or `needs_review` rows.

## Evidence And Citation Visibility Score

Score: 9/10.

Rationale:

- `/radar` shows per-row citation links and a visible citation list for included / `needs_review` rows.
- `/reports` shows citations for preview top items and carries item-level source metadata into each section.
- `needs_review`, excluded, failed, mock, local, and Supabase states are visible with text labels.
- Remaining gap: citations are item-level links; richer source excerpts are not available from metadata-only local output.

## Freshness And Uncertainty Visibility Score

Score: 9/10.

Rationale:

- Both routes show data source and latest visible timestamp before synthesis.
- Caveats state local/mock/Supabase coverage boundaries and avoid claims of industry completeness.
- Report previews include missing evidence and section-level gaps.
- Remaining gap: no source-health freshness rollup is joined into the public feed yet.

## Limitations

- Current local evidence is metadata-level and mostly `needs_review`.
- No live DeepSeek calls are used.
- No Supabase writes are used.
- No scheduled persistence jobs are used.
- Report previews are not published reports.
- `/reports` does not persist report candidates or approval state.
- `/radar` does not claim comprehensive current AI industry coverage.

## Next Product Gaps

- Add text search and saved filter states to `/radar`.
- Join source-health and source registry status into the radar feed when available.
- Add review-to-public handoff for `needs_review` rows after admin approval.
- Add persisted report candidates generated from the deterministic preview.
- Add report publication workflow with explicit review and write gates.
- Add richer evidence excerpts when ingestion captures full source text safely.
