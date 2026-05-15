# Implementation Handoff

## Goal

Document the Phase 8 redesigned UI surfaces before Phase 9 deployment, scheduled jobs, and admin workflow work. This handoff preserves the product direction and the safety boundaries already established in `DESIGN.md`.

## Audience

- Future implementers adding Phase 9 deployment, jobs, and admin workflows.
- Reviewers checking that product surfaces stay evidence-first.
- Operators validating that admin routes do not imply writes, live model calls, or scheduled execution.

## Redesigned Routes

- `/`: public Editorial Intelligence Desk homepage with product contract, workflow, radar preview, Ask/Write entry points, and operations boundary.
- `/ask`: evidence-backed Q&A surface with data source, time window, facts, inference, uncertainty, and citations.
- `/write`: writing-assistant surface with candidate topics, evidence, caveats, counterpoints, missing evidence, and citations.
- `/admin`: Production-safe Analyst Console entry route.
- `/admin/sources`: source registry review, crawl eligibility, and dry-run import boundary.
- `/admin/ingestion`: local/manual pipeline, generated artifact contract, dry-run commands, and write-gated command documentation.
- `/admin/scoring`: scoring formula, thresholds, source weight, confidence, and `needs_review` rules.
- `/admin/settings`: boolean-only configuration posture without secret values.

`/radar` and `/reports` remain valid smoke-tested routes, but they are still earlier-phase placeholder/product surfaces rather than fully redesigned Phase 8 editorial flows.

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
- `AdminStatusCard`, `AdminSection`, `AdminDataTable`, `AdminCommandBlock`: dense admin primitives that separate read-only, dry-run, write-gated, and documentation-only states.

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

- Admin pages are non-writing documentation and inspection surfaces in Phase 8.
- Read-only retrieval, dry-run scripts, write-gated scripts, source-health writes, scheduled jobs, and live DeepSeek must stay visually separate.
- Supabase write paths require explicit CLI write mode plus environment gates outside the browser.
- Command blocks must not become browser-executable controls without a future admin workflow design and backend authorization pass.
- Settings may show booleans/placeholders only. Do not render keys, URLs, tokens, model names, admin email values, or service-role values.

## Data-Source Disclosure Rules

- Supabase: label as read-only public radar retrieval; no write implication.
- Local understanding output: label freshness and coverage as dependent on generated local files.
- Mock data: label as synthetic workflow data, not production-current intelligence.
- Empty retrieval: label synthesis as limited and unconfirmed.
- Unknown retrieval: keep confidence low and disclose uncertainty.

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

Do not run Supabase writes, live DeepSeek, scheduled jobs, source-health writes, or any command with `--write` during design QA.

## Known Limitations

- `/radar` and `/reports` still communicate earlier-phase placeholder scope.
- Admin routes document operations but do not execute role-protected workflows.
- Admin tables intentionally preserve dense columns with horizontal scroll on mobile.
- Ask and Write default UI actions use mock generation.
- The app does not claim autonomous production monitoring, scheduled ingestion, or live provider usage.
- Browser plugin QA was unavailable in this environment because the Node REPL runtime resolved Node 20.19.1 and requires Node 22.22.0 or newer; Playwright/Chrome checks were used instead.

## Next Recommended Phase

Phase 9 can start with deployment hardening, scheduled job design, and admin review workflow implementation, while preserving the Phase 8 evidence-first public surfaces and the read-only/dry-run/write-gated admin separation.
