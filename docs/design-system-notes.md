# Design System Notes

## Current Visual Audit

The current app already has a sober foundation: white surfaces, quiet borders, compact cards, and a small `radar` Tailwind namespace. Public pages and admin pages share the same shell and card language, which keeps the product coherent but does not yet make the public/editorial and admin/operational distinction strong.

Observed design signals:

- Public pages use a card-led skeleton for Today, Radar, Entities, and Reports.
- Radar, entity, and report surfaces expose data source, time window, evidence, uncertainty, and citations in the response UI.
- Admin pages are denser than public pages and already emphasize dry-run boundaries, feature flags, and missing configuration.
- Footer preserves the maintainer identity and public-information-only product contract.
- `bg-radar-bg` is referenced in `app/admin/ingestion/page.tsx` but was not defined in Tailwind before Phase 8.1.

## Current Components

- `AppShell`: global layout with nav, max-width main content, and footer.
- `Nav`: wrapped public/admin route navigation with language display toggle and sign-in link.
- `Footer`: Built by Song Luo and public-information-only note.
- `RadarCard`: evidence-adjacent score summary for mock radar items.
- `MetricCard`: compact numeric summary.
- `AdminSection`: linked admin route card.
- `EmptyState`: dashed quiet panel for deferred capabilities.
- `LanguageToggle`: static display-mode placeholder.
- `SourceBadge`: source tier/type badge.

Repeated local patterns exist for status chips, score chips, data-source labels, command/path boxes, table rows, and citation cards.

## Current Risks

- Evidence, freshness, confidence, and review status are present but not normalized into shared visual primitives.
- `needs_review` can be mentioned as plain text without a consistent caution treatment.
- Public and admin surfaces use similar cards, so admin write gates could look too similar to read-only status.
- Tables rely on horizontal overflow, which is acceptable for now but should be tested on narrow mobile widths before larger admin redesign work.
- Long bilingual strings appear in buttons and text blocks; future work should verify wrapping and button sizing.
- The current homepage hero is functional but still uses a broad skeleton presentation; a full editorial redesign is intentionally deferred.

## Recommended Direction

Use the approved hybrid direction:

- Public/product surfaces: Editorial Intelligence Desk.
- Admin surfaces: Production-safe Analyst Console.

The shared design system should make evidence, freshness, uncertainty, status, and data source visible before synthesis. Visual detail should come from useful evidence/status surfaces, not decorative AI styling.

## Implementation Priorities

1. Establish `DESIGN.md` as the canonical design contract.
2. Normalize semantic tokens for evidence, freshness, caution, risk, success, admin, code, and surfaces.
3. Add tiny chip primitives for status, evidence, and data-source disclosure.
4. Keep existing pages stable until Phase 8.2+ can redesign one surface at a time.
5. Preserve mock/local/Supabase behavior, dry-run boundaries, footer copy, and public-information disclaimers.

## What Not To Redesign Yet

- Do not redesign the homepage in Phase 8.1.
- Do not redesign Radar, Reports, Entities, or Admin route layouts yet.
- Do not reintroduce public generation assistants.
- Do not alter Supabase write gates or live DeepSeek gates.
- Do not introduce a charting, animation, icon, or component dependency for foundation work.
