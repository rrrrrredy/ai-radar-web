# Design Decisions

## Phase 8.1 Initial Decisions

### Hybrid Direction

AI Industry Radar uses a hybrid design direction:

- Public/product surfaces use an Editorial Intelligence Desk.
- Admin surfaces use a Production-safe Analyst Console.

This was selected because the product has two different jobs. Public users need to understand what changed, why it matters, and how strong the evidence is. Admin users need to inspect operational state, source health, scoring, configuration, and write gates without ambiguity.

### Evidence, Freshness, and Uncertainty Are First-Class UI Concepts

The product promise depends on evidence before synthesis, freshness before confidence, and uncertainty before conclusion. These concepts must therefore be visible UI surfaces, not only backend fields or footnotes.

Practical implications:

- Answers and reports show time windows near claims.
- Citations are visible beside or below synthesis.
- `needs_review` is styled as caution, never success.
- Mock, local, Supabase, empty, dry-run, write-gated, and live states are labeled directly.

### Generic AI SaaS Aesthetics Are Rejected

AI Industry Radar should not look like a generic prompt product. The useful product signal is the evidence trail, not a glowing input box or abstract intelligence theme.

Rejected patterns:

- Purple gradient AI hero sections.
- Glassmorphism panels.
- Decorative motion.
- Fake charts.
- Prompt-box-first homepage framing.
- Unsupported production claims.

### Deferred Work

Phase 8.2, 8.3, and 8.4 should redesign surfaces deliberately after the foundation is agreed:

- Phase 8.2: public/product page hierarchy and evidence-first homepage or Radar improvements.
- Phase 8.3: Ask and Write response anatomy, citation visibility, and uncertainty states.
- Phase 8.4: admin console density, write gates, source/review operations, and table ergonomics.

The Phase 8.1 foundation intentionally avoids broad page redesigns.

## Phase 8.2 Product Shell and Homepage Decisions

### Homepage Becomes the Public Editorial Desk

The `/` route now carries the public product direction instead of a generic skeleton hero. The first viewport prioritizes the product name, the three core intelligence questions, and a compact product contract surface for public-only data, freshness, uncertainty, live-model gating, and write/job gating.

### Data Source Disclosure Is Route-Level

The homepage preview labels itself as mock data, but it does not add global Supabase/local/mock noise to the shell. Ask and Write remain responsible for disclosing the actual route-level retrieval source: Supabase public view when enabled, local understanding output when present, or mock fallback.

### Admin Is Distinguished Without a New Sidebar

Admin remains in the top navigation, but it is visually grouped as operations. This keeps route names stable and avoids introducing an admin sidebar before the broader admin console redesign.

## Phase 8.3 Ask and Write Response Surface Decisions

### Data Source Comes Before Synthesis

`/ask` and `/write` now use a shared evidence rail so the rendered response discloses data source, resolved time window, citation count, generation mode, model status, and fallback caveats before the answer or candidate topics.

### Citations and Uncertainty Are Response Anatomy

Ask separates short answer, facts, evidence-backed inference, uncertainty, and citations. Write separates candidate topics, counterpoints, missing evidence, and citations. Missing evidence is treated as a planning feature instead of a failure state.

### Review States Stay Cautious

`needs_review`, mock data, local-only output, stale coverage, and disabled live-model paths use caution language and never receive confirmed or success-style treatment.

## Phase 8.4 Admin Console Decisions

### Admin Uses Production-Safe Analyst Console Patterns

Admin pages now prioritize operational state, source review needs, pipeline boundaries, scoring rules, and configuration posture. The surfaces are denser than public pages and avoid fake charts, decorative dashboard polish, and unsupported production claims.

### Read-Only, Dry-Run, and Write-Gated States Are Separate

Read-only retrieval, dry-run scripts, write-gated CLI paths, missing setup, disabled source-health writes, scheduled-job absence, and live-model opt-in are separate visual concepts. Write-gated states use risk treatment even when the UI is only documenting commands.

### Admin Commands Are Documentation Surfaces

Command blocks use code/pre styling and explanatory copy. They are not buttons, do not imply browser execution, and do not bypass the existing CLI plus environment write gates.

### Settings Never Render Secret Values

Settings surfaces show booleans or setup placeholders only. URLs, keys, service-role tokens, provider model values, and admin email values are not rendered in admin UI.

## Phase 9.4 Admin Review Workflow Decisions

### Review Queues Are Operational, Not Action Surfaces Yet

`/admin/review` introduces real review workflow surfaces for radar items, missing public source URLs, source change requests, report candidates, and audit events. The page is protected by the existing admin layout and uses the same Production-safe Analyst Console primitives as other admin routes.

### Persistence Is Optional Until The Migration Is Applied

The new review helpers prefer authenticated Supabase reads when `202605140005_admin_review_workflows.sql` has been applied and populated. Before then, the UI shows local/mock preview rows with explicit warnings. Preview rows are useful for operator shape and validation, but they are not persistent workflow state.

### Browser Review Writes Stay Disabled

Approve, trial, reject, resolve, publish, annotation, and audit writes are intentionally not implemented as browser actions in Phase 9.4. Future mutations must be server-side, role-gated, audited, and guarded by explicit write controls. Service-role access remains outside client bundles.

## Phase 10 Radar And Reports Product Decisions

### Radar Uses The Retrieval Fallback Chain Directly

`/radar` is now a public evidence list instead of a static placeholder. It uses the existing safe retrieval order: read-only Supabase public radar view when enabled, local understanding output when present, then disclosed mock data. The route-level source, freshness timestamp, caveats, status counts, category counts, source-tier counts, filters, and citations are visible before users read individual item summaries.

### Report Previews Are Deterministic And Non-Published

`/reports` generates daily and weekly previews from retrieved radar items without model calls. Sections are deterministic category/status groupings, not natural-language claims from an LLM. The page explicitly says report publication is a future workflow and does not imply published reports exist.

### Weak Evidence Remains Visible

`needs_review`, excluded, failed, local, and mock evidence remain surfaced as uncertainty instead of being hidden. This keeps the public product useful for review and planning while avoiding claims that current data is comprehensive or fully verified.
