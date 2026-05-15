# Phase 8.5 Design QA

## Routes Reviewed

Desktop:

- `/`
- `/radar`
- `/reports`
- `/ask`
- `/write`
- `/admin`
- `/admin/sources`
- `/admin/ingestion`
- `/admin/scoring`
- `/admin/settings`

Mobile viewport around 390x844:

- `/`
- `/ask`
- `/write`
- `/admin`
- `/admin/sources`
- `/admin/ingestion`

## Smoke Results

Desktop smoke result: pass. All named desktop routes returned HTTP 200, rendered the expected route heading, preserved the footer contract, and showed no framework error page.

Mobile smoke result: pass after small fixes. Public pages wrapped cleanly. Ask and Write preserved data-source and output-order disclosure before input controls. Admin sources and ingestion now keep dense tables and command blocks inside local horizontal scroll instead of creating page-level horizontal overflow.

Browser path note: the Browser plugin runtime was attempted first, but Node REPL resolved Node 20.19.1 while the Browser workflow requires Node 22.22.0 or newer. Playwright screenshots and Chrome DevTools Protocol checks were used as fallback without adding dependencies.

## QA Scores

| Criterion | Score | Notes |
| --- | --- | --- |
| Visual hierarchy | 4 | Public pages lead with product identity, contract, source/freshness/caveat labels, and then synthesis or tools. Admin pages lead with operational state. |
| Evidence/citation visibility | 4 | Ask and Write expose evidence rails and visible citation sections. Homepage preview shows source/freshness/status/citation hints. |
| Freshness/uncertainty visibility | 4 | Time windows, generation mode, mock/local/Supabase caveats, `needs_review`, missing evidence, and write gates are visible before conclusions. |
| Q&A usability | 4 | Ask uses the intended anatomy: data source/time window, short answer, facts, inference, uncertainty, and citations. Mock interaction path rendered the answer surface in fallback QA. |
| Writing-assistant usability | 4 | Write separates candidate topics, why it matters, evidence, caveats, suggested angles, counterpoints, missing evidence, and citations. |
| Admin clarity | 4 | Admin routes are dense, operational, and explicit about read-only, dry-run, gated writes, disabled jobs, and live-model opt-in. |
| Write-gate clarity | 5 | Write-gated states use risk treatment and explanatory copy. Command blocks are code/documentation surfaces, not buttons. |
| Mobile responsiveness | 4 | Public/mobile wrapping is clean. Admin tables use constrained horizontal scroll; no page-level overflow remains on the reviewed mobile admin routes. |
| Accessibility | 4 | Headings are semantic, form controls are labeled, statuses include text, focus styling exists, and tables have labels. |
| Non-generic quality | 4 | The UI reads as an evidence-first AI industry desk and analyst console, not a generic AI SaaS prompt product. |
| Implementation risk | 4 | Fixes were scoped to layout containment and metadata icon handling. No API shapes, migrations, dependencies, write paths, or generated data were changed. |

## Blocking Issues

None after the small fixes below.

## Small Fixes Applied

- Added `min-w-0` and max-width overflow containment to admin table/command surfaces so dense admin rows scroll locally on mobile and do not widen the page.
- Added `app/icon.svg` so the rendered app exposes a favicon metadata link and avoids a missing icon resource in browser smoke checks.

## Remaining Limitations

- `/radar` and `/reports` still represent earlier placeholder scope and are not yet full evidence-first report/radar redesigns.
- Admin routes still document operations only; they do not perform production writes, scheduled jobs, source-health writes, or live provider calls.
- Dense admin tables intentionally require horizontal scrolling on narrow screens.
- The dev server can show the Next development badge in screenshots; this is not product UI and was not treated as a production visual issue.

## Phase 9 Readiness Recommendation

Phase 9 can start. Preserve the Phase 8 public/editorial and admin/operational direction while adding deployment hardening, scheduled-job boundaries, and real admin workflows behind explicit authorization and write gates.
