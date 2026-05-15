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
