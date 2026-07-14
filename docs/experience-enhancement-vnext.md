# AI Radar vNext Experience Enhancement

Date: 2026-06-29

## Goal

This milestone makes the public site easier to understand and use without weakening the public-data boundary.

AI Radar should read as a public-evidence AI industry intelligence radar, not a generic news feed, model leaderboard, or model-generated text demo. The public user should be able to see:

- what the current evidence window contains,
- which events and entities are worth tracking,
- whether a report is formal public content or only an evidence draft,
- how much evidence supports formal reports versus evidence drafts.

## Public Surface Changes

- Homepage: first viewport now frames the product as `AI 行业情报雷达` and shows the public evidence-to-report chain.
- `/radar`: text search now includes entity fields; `entity` is a first-class query parameter; users can save up to 8 local filter views in `localStorage` under `ai-radar.saved-filters.v1`.
- `/entities`: the page is derived from current public radar evidence instead of mock entities. Each entity links back to `/radar?entity=...`.
- `/reports`: formal reports and evidence drafts are separated. An empty formal-report state is expected when no reviewed or published report exists.
- Public generation assistants were removed after this milestone; radar, entities, and reports now carry the evidence coverage burden.

## Safety Boundaries

- Unreviewed report candidates remain excluded from public report reads and snapshots.
- Public assistant generation is not exposed.
- Live DeepSeek remains limited to explicit server-side ingestion, understanding, or report-generation workflows.
- Public API responses and static snapshots must not expose `model_metadata`, service-role-only fields, secrets, private local input, or raw provider metadata.
- Saved radar filters are local browser preferences only; they do not write to Supabase, Git, Cloudflare, or public JSON.

## Non-Goals

- No database migration.
- No new external dependency.
- No authenticated user preference persistence.
- No automatic report publication.
- No change to source ingestion, Supabase recovery, GitHub API authentication, or live-refresh coverage.

## Validation

Run:

```bash
npm run test
npm run lint
npm run typecheck
npm run validate:data
npm run sensitive:scan
npm run build
npm run mirror:build
```

Also inspect Cloudflare and GitHub Pages public snapshots for:

- no `model_metadata`,
- no `SUPABASE_SERVICE_ROLE_KEY`,
- no `DEEPSEEK_API_KEY`,
- no non-allowlisted reports.

## Multi-Agent Review

Final acceptance for this milestone requires adversarial review by:

- Product Agent: user understanding, report/draft semantics, information architecture.
- Security/Data Boundary Agent: public data boundary, saved filters, query params, snapshots, secrets.
- Engineering Agent: SSR/client boundary, type/build/test coverage, URL filter behavior, regression risk.

All blocking findings must be fixed and sent back to the same agents for re-review before this milestone is considered complete.

## Next Goal Candidate

After this milestone, reassess from first principles. Likely next goals:

- Trusted Publishing Goal: publish a small set of reviewed daily/weekly/topic reports and improve admin review-to-public handoff.
- Data Coverage Goal: repair high-value source coverage, GitHub authentication, and Supabase availability.
- Retention Goal: add durable follows, subscriptions, or user preference persistence after public semantics are stable.
