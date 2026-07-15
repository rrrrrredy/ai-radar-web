# Event Clustering Release Candidate

Updated: 2026-07-15

## Contract

- implementation: `lib/events/clustering.ts`;
- command: `npm run events:cluster`;
- artifact: `data/events/latest/event-layer.json`;
- controlled persistence: `npm run events:cluster -- --persist` with temporary `ENABLE_SUPABASE_WRITES=true`;
- public export: `scripts/export-public-snapshot.ts`.

Only public-safe `included` and `needs_review` items enter clustering. Raw text, provider/model metadata, private notes, credentials, and operational logs are not cluster fields.

## Matching

The deterministic score combines normalized title overlap, explicit and inferred entities, keywords, category, source/domain identity, and evidence time distance. A merge normally requires at least 0.58 similarity.

Specific legal, funding, and acquisition actions can add corroboration weight only when both items share at least two canonical strong entities, occur within 72 hours, retain title overlap, and retain meaningful keyword overlap. A separate concept registry handles narrowly scoped aliases. The first rule maps `J-space`, `Jacobian lens`, and `global workspace` only when both Anthropic and Claude anchors are present and the evidence is within seven days.

## Over-Merge Controls

- generic terms such as AI, model, agent, tool, and research are weak evidence;
- conflicting strong entities are penalized;
- different open-source projects and different SDK tracks do not merge;
- same-project release updates can form a bounded seven-day storyline, while distant versions remain separate;
- different partnership counterparts do not merge;
- same-domain or same-category proximity cannot establish identity alone;
- source homepage, directory, documentation-index, and repository-metadata shapes are blocked from public events;
- low-score/noise clusters remain auditable but do not enter curated display.

`scripts/event-clustering.test.ts` verifies that the two Apple/OpenAI lawsuit reports merge while adjacent stories stay separate. It also verifies the Anthropic/MIT concept-alias merge, rejects an unrelated Claude robotics story and another lab's global-workspace research, and keeps a `Research` directory page out of event evidence.

## Current Results

| metric | value |
| --- | ---: |
| input public radar items | 249 |
| event-eligible relationships | 200 |
| current-run event clusters | 168 |
| multi-item clusters | 16 |
| average items per cluster | 1.18 |
| curated events | 8 |
| Cloudflare visible relationships/events | 197 / 165 |
| same-family two-source public events | 1 |
| cross-source-family public events | 1 |

The cross-family example is `A global workspace in language models`: source count 2, two citations, company/lab plus media/analysis families, timeline preserved, event score 89, label `高优先级`. The Apple/OpenAI lawsuit remains a 77-point same-family example. Low-event directory, homepage, documentation-index, and repository-metadata signals are excluded before clustering rather than merely hidden after scoring.

Persistence is additive and non-destructive: clusters upsert by stable local ID and relationships by event/radar pair. Historical rows are not deleted automatically, so current-run counts come from the generated event artifact rather than an accumulated table count.
