# Design QA

Date: 2026-07-17

## Evidence

- Reference: AI HOT captures at `1947x977` desktop and `390x844` mobile.
- Product: strict Supabase-backed Cloudflare build from `dist/cloudflare-pages`.
- Matched comparisons:
  - `D:\Codex\_tmp\aihot-rebuild-20260716\comparison-desktop-matched-nowrite.png`
  - `D:\Codex\_tmp\aihot-rebuild-20260716\comparison-mobile-matched-nowrite.png`

The Browser plugin was invoked first but failed twice with `Cannot redefine property: process`. Validation then used the user's Google Chrome 150 through Chrome DevTools Protocol, with the same reference viewports.

## Coverage

- Checked Chinese and English home, radar, reports, and Ask pages on desktop and mobile.
- Exercised all six radar tabs, source-count filtering, reset, language links, and current result counts.
- Asked for exactly three selected events; received three events and six source citations.
- Confirmed daily and weekly candidate IDs, editorial status, and quality-gate labels.
- Confirmed `/write/`, `/en/write/`, and `/api/writing-assistant` return `404`.
- Checked page width, visible language chrome, runtime exceptions, and console errors.

## Result

Pass. No horizontal overflow or runtime errors were found. The first viewport follows the AI HOT reference hierarchy: compact navigation, Top 3, category controls, and a chronological event feed. Writing functionality is absent from both language versions.
