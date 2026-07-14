# Event Clustering Release Candidate

Updated: 2026-07-14

## Contract

- implementation: `lib/events/clustering.ts`;
- command: `npm run events:cluster`;
- artifact: `data/events/latest/event-layer.json`;
- controlled persistence: `npm run events:cluster -- --persist` with temporary `ENABLE_SUPABASE_WRITES=true`;
- public export: `scripts/export-public-snapshot.ts`.

Only public-safe `included` and `needs_review` items enter clustering. Raw text, provider/model metadata, private notes, credentials, and operational logs are not cluster fields.

## Matching

The deterministic score combines normalized title overlap, explicit and inferred entities, keywords, category, source/domain identity, and evidence time distance. A merge normally requires at least 0.58 similarity.

Specific legal, funding, and acquisition actions can add corroboration weight only when both items share at least two canonical strong entities, occur within 72 hours, retain title overlap, and retain meaningful keyword overlap. This handles wording such as `sues` versus `lawsuit` without making a generic action sufficient.

## Over-Merge Controls

- generic terms such as AI, model, agent, tool, and research are weak evidence;
- conflicting strong entities are penalized;
- different open-source projects and conflicting release versions do not merge;
- different partnership counterparts do not merge;
- same-domain or same-category proximity cannot establish identity alone;
- source homepage, directory, documentation-index, and repository-metadata shapes are blocked from public events;
- low-score/noise clusters remain auditable but do not enter curated display.

`scripts/event-clustering.test.ts` verifies that the two Apple/OpenAI lawsuit reports merge while an adjacent Apple/OpenAI product update and an unrelated Apple/Meta lawsuit stay separate.

## Current Results

| metric | value |
| --- | ---: |
| input public radar items | 242 |
| current-run event clusters | 234 |
| relationships | 242 |
| multi-item clusters | 3 |
| average items per cluster | 1.03 |
| curated events | 8 |
| Cloudflare visible signals/events | 192 / 188 |
| genuine public multi-source events | 1 |

The public multi-source example is the Apple/OpenAI lawsuit from The Verge and Ars Technica: source count 2, two citations, timeline preserved, event score 82, label `高优先级`. A low-score Gemini documentation/changelog cluster is excluded from display.

Persistence is additive and non-destructive: clusters upsert by stable local ID and relationships by event/radar pair. Historical rows are not deleted automatically, so current-run counts come from the generated event artifact rather than an accumulated table count.
