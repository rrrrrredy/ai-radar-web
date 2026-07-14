# DESIGN.md

## Product Identity

- Product: AI Industry Radar
- Category: evidence-first AI industry intelligence desk
- Audience: AI practitioners, PMs, researchers, investors, internal colleagues, non-technical readers, Song Luo
- Primary job-to-be-done: answer what changed in AI, what is real signal, and what entities are worth tracking

## Design Principle

Evidence before synthesis. Freshness before confidence. Uncertainty before conclusion.

## Visual Direction

- Public/product: Editorial Intelligence Desk
- Admin: Production-safe Analyst Console
- Tone: professional, neutral, analyst-grade, evidence-first
- Memorable detail: evidence/freshness/status surfaces are visible before or beside synthesis
- Avoid: generic AI SaaS, purple gradients, glassmorphism, decorative motion, prompt-box hero, fake charts

## Brand Voice

- concise
- careful
- bilingual-ready
- no hype
- no unsupported production claims

## Color Tokens

Tokens are semantic first. Use them to communicate evidence, freshness, operational state, and risk. Do not introduce bright decorative palettes.

| Token | Use | Reference |
| --- | --- | --- |
| `ink` | primary text, firm labels | `#111827` |
| `muted` | secondary text, metadata, caveats | `#5f6b7a` |
| `line` | borders, dividers, table rules | `#d8dee8` |
| `panel` | quiet panels, empty states, secondary rows | `#f7f9fc` |
| `surface` | cards, tables, form surfaces | `#ffffff` |
| `evidence` | citations, source proof, evidence badges | `#0f766e` |
| `freshness` | time windows, recency, collection status | `#2563eb` |
| `caution` | incomplete evidence, needs review, manual follow-up | `#b45309` |
| `risk` | failed states, unsafe data, disabled mutation gates | `#be123c` |
| `success` | verified dry-run success, read-only healthy status | `#15803d` |
| `admin` | admin-only framing and operational labels | `#334155` |
| `code` | command text, paths, technical metadata | `#1f2937` |

Supporting token: `bg` is the app background. It should stay near white so evidence and status surfaces carry meaning.

## Typography

- `display`: product name or major public entry point only; semibold, normal tracking, compact line height.
- `page title`: route-level `h1`; clear noun labels such as Radar, Entities, Reports, Source registry.
- `section title`: short analytical labels; avoid marketing copy.
- `body`: readable neutral prose; 1.5 to 1.75 line height for bilingual text.
- `data label`: small, semibold, never color-only.
- `caption`: timestamps, source names, status explanations, caveats.
- `code/mono`: paths, commands, model names, feature flags, environment variable names.
- Bilingual text rhythm: keep Chinese and English blocks close to the same claim, with equal status. Do not bury one language as decoration.

## Spacing and Layout

- Route shell: use the existing max-width app shell, with route sections stacked vertically and predictable spacing.
- Public desk layout: synthesis should sit beside or below evidence metadata, never as the only visible object.
- Evidence rail: citations, source tier, freshness, status, and uncertainty may use a side rail on desktop and a stacked band on mobile.
- Dense data rows: use compact rows with strong dividers for admin tables, source lists, run logs, and score dimensions.
- Admin console layout: denser and more operational than public pages, with disabled/mutation-gated controls visually distinct from read-only state.
- Mobile compression: collapse rails into ordered blocks: data source, time window, evidence summary, uncertainty, citations.

## Components

- App shell: consistent route width, nav, and footer. Preserve the Built by Song Luo footer and the public-information-only note.
- Nav: concise route labels. Public routes and Admin can share the shell, but admin routes should visually read as operational.
- Footer: maintainer and public-information contract remain visible on public and admin routes.
- Card: use for repeated items, summaries, metrics, and contained tools. Avoid cards inside cards.
- Evidence panel: groups source, time window, confidence, review status, and citations near the claim it supports.
- Citation item: visible linked source with title, source name, date, status, and confidence or review caveat.
- Status chip: small labeled state indicator. It must include words, not color alone.
- Score chip: compact score plus label and scale where needed.
- Time-window bar: explicit start/end or relative window plus fallback explanation.
- Data-source banner: disclose Supabase, local understanding output, mock data, or empty state before synthesis.
- Empty state: specific next action or current limitation; do not imply missing production capability exists.
- Error state: clear failure, cause if known, and safe next action; never expose secrets.
- Loading state: neutral, no fabricated progress or fake intelligence.
- Admin section: operational block for source, ingestion, scoring, settings, and review controls.
- Table/list rows: scan-friendly, stable columns, horizontal overflow on mobile rather than broken wrapping.
- Form controls: labeled, keyboard focusable, with disabled state that explains mutation gates when relevant.

## Evidence and Citation UI

- Citations are not footnotes only; they should be visible in radar/report surfaces.
- Freshness and confidence must be shown near claims, not hidden in metadata.
- `needs_review` must never look confirmed. It should use caution tone, explicit wording, and caveat copy.
- Mock/local/Supabase data source must be disclosed before or beside radar, entity, and report synthesis.
- Weak evidence should lower visual certainty. Do not use confident copy, success tone, or final-report framing for unreviewed items.

## Radar, Entity, And Report UI

Radar evidence anatomy:

1. Time window
2. Data source
3. Source and status
4. Category/entity hints
5. Evidence-backed inference
6. Uncertainty
7. Citations

Report anatomy:

1. Formal vs draft status
2. Quality gate state
3. Usable evidence and citations
4. Source/category diversity
5. Caveats
6. Missing evidence

Radar, entity, and report surfaces should make unsupported gaps visible. A useful report draft can say that evidence is incomplete.

## Admin UI

- Admin is operational, denser, less editorial.
- Mutation-gated controls must be visually distinct from read-only status.
- No UI should imply mutations are enabled unless they are.
- Supabase mutations, live DeepSeek, and scheduled jobs must appear gated until explicitly enabled in a future phase.
- Status rows should separate configured/missing, read/mutate, dry-run/mutate, and mock/live.

## Responsive Rules

- Nav: wrap route labels cleanly; avoid horizontal clipping. Admin can remain a plain label until a later route-level admin shell exists.
- Evidence rails: stack below the claim on mobile, preserving order and labels.
- Citations: full-width stacked cards on mobile; source title must wrap without hiding URL affordance.
- Admin tables: use horizontal scroll with minimum column widths and visible row dividers.
- Long bilingual text: allow wrapping, avoid fixed heights, and keep line length comfortable.

## Accessibility Rules

- Focus states must be visible and not rely on browser default alone.
- Non-color status labels are required for success, caution, risk, `needs_review`, mock, local, and Supabase states.
- Contrast should remain WCAG AA for body text and controls.
- Semantic headings should follow route and section structure.
- Form labels are required for inputs, selects, and textareas.
- Reduced motion should be respected; do not add decorative motion by default.

## Engineering Rules

- No new dependencies by default.
- Prefer reusable tokens/components over one-off status and evidence styles.
- No secrets in UI, logs, docs, screenshots, or commits.
- No API shape changes without an explicit task.
- Preserve Supabase/local/mock retrieval behavior.
- Preserve dry-run-first mutation boundaries.
- Validation commands for design-system changes:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run validate:data`
  - `npm run sensitive:scan`
  - `npm run build`

## Things to Avoid

- Generic AI SaaS aesthetics
- Purple gradients
- Glassmorphism
- Decorative motion
- Prompt-box hero as the primary product signal
- Fake charts
- Decorative data visualizations with no underlying evidence
- Hidden citations
- Confidence indicators detached from freshness or evidence
- Success styling for `needs_review`
- UI that implies production mutations, scheduled jobs, or live model calls are enabled before they are
- One-note monochrome palettes
- Decorative orbs, bokeh blobs, or abstract AI wallpaper
- Marketing claims that outrun current implementation
