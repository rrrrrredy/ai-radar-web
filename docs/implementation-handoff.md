# Implementation Handoff

## Goal

Document the Phase 8 redesigned UI surfaces, Phase 9 admin workflow boundaries, Phase 10 radar/report product surfaces, and Milestone E Preview operating loop. This handoff preserves the product direction and the safety boundaries already established in `DESIGN.md`.

## Audience

- Future implementers adding Phase 9 deployment, jobs, and admin workflows.
- Reviewers checking that product surfaces stay evidence-first.
- Operators validating that admin routes do not imply unguarded mutations, live model calls, or scheduled execution.
- Operators running the Milestone E loop in [operating-loop-milestone-e.md](./operating-loop-milestone-e.md).

## Redesigned Routes

- `/`: public Editorial Intelligence Desk homepage with product contract, today/curated signals, radar entry points, and operations boundary.
- `/admin`: Production-safe Analyst Console entry route.
- `/admin/review`: protected admin review workflow for review tasks, missing source public URLs, source-change requests, report candidates, and audit rows.
- `/admin/sources`: source registry review, crawl eligibility, and dry-run import boundary.
- `/admin/ingestion`: local/manual pipeline, generated artifact contract, dry-run commands, and mutation-gated command documentation.
- `/admin/scoring`: scoring formula, thresholds, source weight, confidence, and `needs_review` rules.
- `/admin/settings`: boolean-only configuration posture without secret values.
- `/radar`: filterable public radar evidence list backed by Supabase/local/mock retrieval, with counts, freshness, caveats, review states, and citations.
- `/entities`: public evidence-derived entity tracking queue with tracking reasons, next checks, entity detail links, radar links, and report-path links.
- `/entities/[entityId]`: public evidence graph for one tracked entity, with source/category/status coverage, evidence timeline, citations, and next checks.
- `/reports`: formal reviewed/published reports separated from evidence drafts, with publishing readiness, status, sections, missing evidence, caveats, citations, report-to-entity traceability, section entity coverage, and Markdown export.

## Design Direction

- Public/product surfaces: Editorial Intelligence Desk.
- Admin surfaces: Production-safe Analyst Console.
- Product principle: evidence before synthesis, freshness before confidence, uncertainty before conclusion.
- Avoided patterns: generic AI SaaS styling, purple gradient heroes, fake charts, decorative motion, hidden citations, and unsupported production claims.

## Changed And Important Components

- `AppShell`, `Nav`, `Footer`: shared shell, route navigation, Built by Song Luo footer, and public-information-only note.
- `StatusChip`: text-based operational states for success, caution, risk, admin, freshness, evidence, and neutral states.
- `EvidenceBadge`: evidence, freshness, uncertainty, citation, and `needs_review` labels.
- `DataSourceChip`: Supabase/local/mock/empty/unknown disclosure.
- `CitationList`: visible citation cards with source, freshness, status, confidence, title, and URL.
- `AdminStatusCard`, `AdminSection`, `AdminDataTable`, `AdminCommandBlock`: dense admin primitives that separate read-only, dry-run, server action, mutation-gated, and documentation-only states.
- `lib/radar/feed.ts`: server-side radar feed loader that wraps the existing retrieval fallback path and adds counts, freshness notes, caveats, timestamps, and citations.
- `lib/retrieval/load-radar-items.ts`: Supabase/local/public-snapshot/mock retrieval fallback, including an explicit local public snapshot option used for public-safe coverage and report traceability recovery.
- `lib/data-completeness/public-safe-summary.ts`: public-route coverage loader for homepage, radar, and reports. It derives coverage from public snapshot/public view/feed fields and must not import service-role helpers.
- `scripts/build-cloudflare-public-site.ts`, `scripts/build-github-pages-mirror.ts`: static public mirrors for homepage, radar, entities, entity detail pages, and reports. Entity pages are generated from public-safe snapshot entity `name/type/confidence` plus visible radar evidence; detail pages render a local evidence graph, source/category coverage, review status, and evidence timeline, with Vercel links retained as dynamic references.
- `lib/radar/entity-insights.ts`: public-evidence-only entity tracking helper that derives entity summaries, stable entity detail URLs, evidence graphs, tracking priority, reasons, and next checks from radar items.
- `lib/reports/entity-traceability.ts`: public-evidence-only helper that maps report and section source items/citations back to radar evidence and entity detail links.
- `lib/reports/local-public-reports.ts`, `data/public-reports/`: read-only local reviewed public-report snapshots used by `/reports` and static snapshot builds when Supabase reports are unavailable.
- `lib/reports/generate-report-preview.ts`, `lib/reports/generate-live-report.ts`, `lib/reports/load-report-data.ts`, `lib/reports/publishing-readiness.ts`, `lib/reports/report-prompts.ts`, `lib/reports/types.ts`: deterministic fallback, explicit-live report synthesis, public-safe saved report loading, formal report vs evidence draft readiness, prompt boundaries, and shared report workflow types.
- `scripts/generate-report.ts`, `scripts/persist-report-candidate.ts`: dry-run-first report generation and mutation-gated report-candidate persistence.
- `lib/admin/review.ts`, `lib/admin/audit.ts`: server-only, role-gated review read helpers. They do not import service-role access or perform mutations.
- `lib/admin/actions.ts`, `lib/admin/validation.ts`: server-only review mutation and validation layer. Actions require admin role, sanitize inputs/errors, use service-role access only after authorization, and create audit events.
- `supabase/migrations/202605140005_admin_review_workflows.sql`: reviewable migration for `review_tasks`, `source_change_requests`, `report_candidates`, and `admin_audit_events`.

## Design System Usage

- Use semantic radar tokens from `DESIGN.md` and `tailwind.config.ts`; do not introduce decorative palettes.
- Use cards for repeated items, route sections, modals, and contained tools only.
- Keep status visible with words, not color alone.
- Keep admin tables horizontally scrollable on narrow viewports instead of breaking columns.
- Keep command blocks as `pre/code` documentation surfaces, not executable buttons.
- Keep focus states visible through the global `:focus-visible` rule and native controls.

## Evidence, Citation, And Freshness Rules

- Citations must be visible near radar, entity, report, and evidence surfaces. Do not hide citations as footer-only metadata.
- Time windows and freshness notes must appear before or beside synthesis.
- `needs_review` must use caution language and cannot look confirmed or successful.
- Low confidence and missing evidence should lower visual certainty.
- Inference must remain visually distinct from directly retrieved facts.
- Mock/local/Supabase source state must be disclosed before users read generated synthesis.

## Admin Mutation-Gate Rules

- Admin pages were read-only documentation and inspection surfaces in Phase 8.
- `/admin/review` now supports Phase 9.4b controlled server-side mutations for review tasks, source-change requests, report candidates, and audit rows. Browser/client components must not import service-role helpers.
- Read-only retrieval, dry-run scripts, mutation-gated scripts, source-health history persistence, scheduled jobs, and live DeepSeek must stay visually separate.
- Generic Supabase persistence scripts require explicit CLI mutation mode plus environment gates outside the browser.
- Command blocks must not become browser-executable controls. Review forms must call server actions that re-check admin role and create audit events.
- Settings may show booleans/placeholders only. Do not render keys, URLs, tokens, model names, admin email values, or service-role values.

## Data-Source Disclosure Rules

- Supabase: label as read-only public radar retrieval; no mutation implication.
- Public coverage panels: label as public snapshot/public view/feed-derived; no service-role operational-table implication.
- Public snapshot/public view contract: expose reader-facing counts, public-safe radar/report fields, and entity `name/type/confidence` only. Do not publish raw item identifiers, raw item counts, ingestion/understanding run counts, item-entity/score table counts, entity evidence text, raw text, raw metadata, or raw-pipeline conversion rates.
- Local understanding output: label freshness and coverage as dependent on generated local files.
- Mock data: label as synthetic workflow data, not production-current intelligence.
- Empty retrieval: label synthesis as limited and unconfirmed.
- Unknown retrieval: keep confidence low and disclose uncertainty.
- Radar/report public surfaces should consume `loadRadarFeed()` so source, freshness, caveats, and counts stay consistent across evidence surfaces.
- `/reports` may supplement traceability with the read-only local public snapshot when a formal reviewed report references public `source_item_ids` missing from the current feed. This fallback is for report evidence/entity coverage only and does not change the normal radar feed source.

## Validation Commands

Run these before deployment or Phase 9 workflow changes:

```bash
npm run lint
npm run typecheck
npm run test
npm run validate:data
npm run sensitive:scan
npm run build
git diff --check
```

For Preview operations after validation, use the Milestone E sequence: `ops:dry-run`, `ops:reports`, optional bounded `ops:refresh:live`, temporary-gated `ops:full:live:persist`, `/admin/review`, then Preview smoke.

Do not run live DeepSeek, scheduled jobs, source-health history persistence, public assistant generation, or generic Supabase persistence commands with `--write` during design QA. A controlled admin review action test may be run only through the authenticated `/admin/review` server-action path.

## Phase 9.4 Review Workflow Notes

- The review migration is created but not applied by validation.
- Review tables grant no anon access and no authenticated browser mutation access.
- Authenticated reads are restricted to admin/editor policies once the migration is applied.
- UI controls for create task, approve, reject, defer, resolve, create source-change request, create report candidate, save reviewed report, and publish approved report call server actions. The report publishing funnel is read-only and shows the `ENABLE_ADMIN_REVIEW_WRITES` gate state.
- Each successful review mutation creates `admin_audit_events`.
- Report candidate approval does not publish reports by itself; a separate approved-candidate action creates or updates the `reports` row and audits the mutation. Public `/reports` treats only `saved_report` records with `reviewed` or `published` status as formal reports.
- Local public-report snapshots are also treated as formal only when they explicitly use `saved_report` plus `reviewed` or `published`; they are committed read-only fallback data and must contain only public evidence/citation fields.
- Report-to-entity traceability panels are read-only and derived from public radar item IDs, citations, and entity links. Section coverage is citation-driven. They do not promote drafts to formal reports or bypass admin publication gates.
- Public assistant routes are removed; radar, entity, and report access remains public.

## Known Limitations

- `/radar` and `/reports` are now useful public previews, but they only reflect currently retrievable Supabase/local/mock radar items.
- `/entities` and `/entities/[entityId]` explain why public entities are worth tracking, but they are still evidence-derived views rather than canonical knowledge graphs or persisted entity history.
- Admin review actions execute only through role-protected server actions.
- Admin tables intentionally preserve dense columns with horizontal scroll on mobile.
- Public assistant generation is removed; smoke tests guard against route/API regressions.
- Report drafts can be generated deterministically, synthesized with explicit live DeepSeek, persisted as `report_candidates` through a mutation-gated CLI, and manually saved or published from approved candidates through the admin review workflow. Approved candidates remain evidence drafts until a reviewed/published `reports` row exists. Local reviewed report snapshots provide a public fallback display path but do not mutate Supabase or replace audited admin publication.
- Static mirrors host entity index and top entity detail pages locally. Report traceability chips may still link to dynamic entity routes where deeper interaction is needed, but the static fallback now includes reader-facing entity evidence details.
- Section coverage intentionally stays empty when a section has no citations instead of inferring support from prose.
- Local understanding output may be metadata-level and mostly `needs_review`, which limits synthesis quality.
- The app does not claim autonomous production monitoring, scheduled ingestion, or live provider usage.
- Browser QA should verify `/reports` after local public-report snapshot changes: a reviewed report should render with its original title/sections, visible citations, nonzero report/entity traceability, and section coverage.

## Next Recommended Phase

The next phase can focus on deduplicating report/feed loading, richer signed-in admin smoke coverage, production deployment decisions, scheduled persistence design, source-health history approval, public view rollout verification, and deeper report history/detail navigation while preserving the evidence-first public surfaces and the Milestone E operating loop.
