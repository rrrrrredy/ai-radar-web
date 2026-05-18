# Implementation Handoff

## Goal

Document the Phase 8 redesigned UI surfaces, Phase 9 admin workflow boundaries, and Phase 10 radar/report product surfaces. This handoff preserves the product direction and the safety boundaries already established in `DESIGN.md`.

## Audience

- Future implementers adding Phase 9 deployment, jobs, and admin workflows.
- Reviewers checking that product surfaces stay evidence-first.
- Operators validating that admin routes do not imply unguarded writes, live model calls, or scheduled execution.

## Redesigned Routes

- `/`: public Editorial Intelligence Desk homepage with product contract, workflow, radar preview, Ask/Write entry points, and operations boundary.
- `/ask`: evidence-backed Q&A surface with data source, time window, facts, inference, uncertainty, and citations.
- `/write`: writing-assistant surface with candidate topics, evidence, caveats, counterpoints, missing evidence, and citations.
- `/admin`: Production-safe Analyst Console entry route.
- `/admin/review`: protected admin review workflow for review tasks, missing source public URLs, source-change requests, report candidates, and audit rows.
- `/admin/sources`: source registry review, crawl eligibility, and dry-run import boundary.
- `/admin/ingestion`: local/manual pipeline, generated artifact contract, dry-run commands, and write-gated command documentation.
- `/admin/scoring`: scoring formula, thresholds, source weight, confidence, and `needs_review` rules.
- `/admin/settings`: boolean-only configuration posture without secret values.
- `/radar`: filterable public radar evidence list backed by Supabase/local/mock retrieval, with counts, freshness, caveats, review states, and citations.
- `/reports`: deterministic daily/weekly report preview surface generated from available radar items, with sections, missing evidence, caveats, and citations.

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
- `EvidenceRail`: Ask/Write rail for source, time window, citations, generation mode, model metadata, and caveats.
- `CitationList`: visible citation cards with source, freshness, status, confidence, title, and URL.
- `AnswerSection`: structured Q&A and planning sections.
- `TopicCandidateCard`: writing candidate anatomy with confidence, review caution, evidence, caveats, counterpoints, missing evidence, and citations.
- `AdminStatusCard`, `AdminSection`, `AdminDataTable`, `AdminCommandBlock`: dense admin primitives that separate read-only, dry-run, server action, write-gated, and documentation-only states.
- `lib/radar/feed.ts`: server-side radar feed loader that wraps the existing retrieval fallback path and adds counts, freshness notes, caveats, timestamps, and citations.
- `lib/reports/generate-report-preview.ts`, `lib/reports/types.ts`: deterministic report preview generator and types for daily/weekly public preview surfaces.
- `lib/admin/review.ts`, `lib/admin/audit.ts`: server-only, role-gated review read helpers. They do not import service-role access or perform writes.
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

- Citations must be visible near answer, writing, report, and evidence surfaces. Do not hide citations as footer-only metadata.
- Time windows and freshness notes must appear before or beside synthesis.
- `needs_review` must use caution language and cannot look confirmed or successful.
- Low confidence and missing evidence should lower visual certainty.
- Inference must remain visually distinct from directly retrieved facts.
- Mock/local/Supabase source state must be disclosed before users read generated synthesis.

## Admin Write-Gate Rules

- Admin pages were non-writing documentation and inspection surfaces in Phase 8.
- `/admin/review` now supports Phase 9.4b controlled server-side mutations for review tasks, source-change requests, report candidates, and audit rows. Browser/client components must not import service-role helpers.
- Read-only retrieval, dry-run scripts, write-gated scripts, source-health writes, scheduled jobs, and live DeepSeek must stay visually separate.
- Generic Supabase persistence scripts require explicit CLI write mode plus environment gates outside the browser.
- Command blocks must not become browser-executable controls. Review forms must call server actions that re-check admin role and write audit events.
- Settings may show booleans/placeholders only. Do not render keys, URLs, tokens, model names, admin email values, or service-role values.

## Data-Source Disclosure Rules

- Supabase: label as read-only public radar retrieval; no write implication.
- Local understanding output: label freshness and coverage as dependent on generated local files.
- Mock data: label as synthetic workflow data, not production-current intelligence.
- Empty retrieval: label synthesis as limited and unconfirmed.
- Unknown retrieval: keep confidence low and disclose uncertainty.
- Radar/report public surfaces should consume `loadRadarFeed()` so source, freshness, caveats, and counts stay consistent with Ask/Write retrieval behavior.

## Validation Commands

Run these before deployment or Phase 9 workflow changes:

```bash
npm run lint
npm run typecheck
npm run validate:data
npm run sensitive:scan
npm run build
git diff --check
```

For API smoke, keep mock mode:

```bash
POST /api/ask with generationMode="mock"
POST /api/writing-assistant with generationMode="mock"
```

Do not run live DeepSeek, scheduled jobs, source-health writes, or generic Supabase persistence commands with `--write` during design QA. A controlled admin review action test may be run only through the authenticated `/admin/review` server-action path.

## Phase 9.4 Review Workflow Notes

- The review migration is created but not applied by validation.
- Review tables grant no anon access and no authenticated browser write access.
- Authenticated reads are restricted to admin/editor policies once the migration is applied.
- UI controls for create task, approve, reject, defer, resolve, create source-change request, and create report candidate call server actions.
- Each successful review mutation writes `admin_audit_events`.
- Report candidate approval does not publish reports.
- Public `/ask` and `/write` access remains unchanged.

## Known Limitations

- `/radar` and `/reports` are now useful public previews, but they only reflect currently retrievable Supabase/local/mock radar items.
- Admin review actions execute only through role-protected server actions.
- Admin tables intentionally preserve dense columns with horizontal scroll on mobile.
- Ask and Write default UI actions use mock generation.
- Report previews are deterministic planning previews, not persisted or published reports.
- Local understanding output may be metadata-level and mostly `needs_review`, which limits synthesis quality.
- The app does not claim autonomous production monitoring, scheduled ingestion, or live provider usage.
- Browser plugin QA was unavailable in this environment because the Node REPL runtime resolved Node 20.19.1 and requires Node 22.22.0 or newer; Playwright/Chrome checks were used instead.

## Next Recommended Phase

The next phase can focus on report candidate persistence from previews, report publication workflow design, richer manual admin smoke coverage, scheduled job design, and source-health review boundaries while preserving the Phase 8/10 evidence-first public surfaces and the dry-run/write-gated separation for non-review writes.
