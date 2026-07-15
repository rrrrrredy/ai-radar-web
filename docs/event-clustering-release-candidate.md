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
- conflicting release versions always remain separate, including adjacent versions in the same project and time window;
- different partnership counterparts do not merge;
- same-domain or same-category proximity cannot establish identity alone;
- source homepage, directory, documentation-index, and repository-metadata shapes are blocked from public events;
- low-score/noise clusters remain auditable but do not enter curated display.

`scripts/event-clustering.test.ts` verifies that the two Apple/OpenAI lawsuit reports merge while adjacent stories stay separate. It also verifies the Anthropic/MIT concept-alias merge, rejects an unrelated Claude robotics story and another lab's global-workspace research, keeps adjacent llama.cpp and Ollama semantic versions separate, and keeps a `Research` directory page out of event evidence.

## Current Results

| metric | value |
| --- | ---: |
| input public radar items | 250 |
| event-eligible relationships | 201 |
| current-run event clusters | 198 |
| multi-item clusters | 3 |
| average items per cluster | 1.02 |
| curated events | 8 |
| Cloudflare visible relationships/events | 201 / 198 |
| same-family two-source public events | 1 |
| cross-source-family public events | 1 |

The cross-family example is `A global workspace in language models`: source count 2, two citations, company/lab plus media/analysis families, timeline preserved, event score 89, label `高优先级`. This represents cross-family coverage and does not assert that the sources are independent. The Apple/OpenAI lawsuit remains a 77-point same-family example. Low-event directory, homepage, documentation-index, and repository-metadata signals are excluded before clustering rather than merely hidden after scoring.

Persistence is controlled and non-destructive: clusters upsert by stable local ID and relationships by event/radar pair. The final write marked 77 stale generated clusters `archived` while retaining the rows for audit; 198 current clusters remain `reviewed`. No cluster row was deleted.
