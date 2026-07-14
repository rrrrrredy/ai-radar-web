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
- different open-source projects and different SDK tracks do not merge;
- same-project release updates can form a bounded seven-day storyline, while distant versions remain separate;
- different partnership counterparts do not merge;
- same-domain or same-category proximity cannot establish identity alone;
- source homepage, directory, documentation-index, and repository-metadata shapes are blocked from public events;
- low-score/noise clusters remain auditable but do not enter curated display.

`scripts/event-clustering.test.ts` verifies that the two Apple/OpenAI lawsuit reports merge while an adjacent Apple/OpenAI product update and an unrelated Apple/Meta lawsuit stay separate.

## Current Results

| metric | value |
| --- | ---: |
| input public radar items | 242 |
| current-run event clusters | 205 |
| relationships | 242 |
| multi-item clusters | 16 |
| average items per cluster | 1.18 |
| curated events | 8 |
| Cloudflare visible relationships/events | 190 / 159 |
| same-family two-source public events | 1 |
| cross-source-family public events | 0 |

The public two-source example is the Apple/OpenAI lawsuit from The Verge and Ars Technica: source count 2, two citations, timeline preserved, event score 77, label `关注`. Both sources are in the media/analysis family, so the event is explicitly labeled `同家族多源复述`, not cross-family corroboration. A low-score multilingual documentation/changelog cluster is excluded from display.

Persistence is additive and non-destructive: clusters upsert by stable local ID and relationships by event/radar pair. Historical rows are not deleted automatically, so current-run counts come from the generated event artifact rather than an accumulated table count.
