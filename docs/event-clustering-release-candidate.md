# Event Clustering Release Candidate

Updated: 2026-07-15

## Contract

- implementation: `lib/events/clustering.ts`;
- command: `npm run events:cluster`;
- ignored artifact: `data/events/latest/event-layer.json`;
- controlled persistence: `npm run events:cluster -- --persist` with temporary `ENABLE_SUPABASE_WRITES=true`;
- public projection: `scripts/export-public-snapshot.ts`.

Only `included` and `needs_review` public-safe items enter the clustering candidate pool. Low-event signals remain in `全部信号` but are excluded before event scoring.

## Matching

The deterministic matcher combines normalized title overlap, strong shared entities, company/model/product identity, specific action keywords, category, publication-time distance, source/domain evidence, and narrow concept aliases. It does not require one LLM call per merge.

A narrow alias joins `J-space`, `Jacobian lens`, and `global workspace` only when Anthropic and Claude anchors are present and evidence is within seven days. This enables the verified Anthropic/MIT Technology Review pair without lowering the global merge threshold.

## Over-Merge Safeguards

- generic AI/model/agent/tool/research terms are weak evidence;
- conflicting strong entities are penalized;
- different companies, models, SDKs, projects, and partnership counterparts do not merge;
- exact GitHub tag identity prevents adjacent semantic versions and `rc` releases from merging;
- unrelated papers do not merge on generic research language;
- release-like wording fails closed for SDK/framework/runtime and arXiv records without stronger identity;
- only valid `published_at` values create event timelines;
- homepage, directory, docs-index, changelog-index, and repository-metadata signals do not become events.

Regression tests cover Apple/OpenAI and Anthropic/MIT positive merges plus unrelated Claude robotics, other-lab global-workspace research, adjacent llama.cpp/Ollama versions, release candidates, and directory pages as negative cases.

Canonical release titles retain the exact GitHub tag found across cluster items. For example, Ollama `v0.30.0-rc22` and `v0.30.0-rc23` remain separate titles and clusters.

## Results

| metric | persisted layer | Cloudflare display |
| --- | ---: | ---: |
| input public signals | 261 | 261 in `全部信号` |
| event relationships | 209 | 205 |
| event clusters | 207 | 203 |
| multi-item events | 2 | 2 |
| average items/event | 1.01 | 1.01 |
| curated events | 8 | 8 |

Deduplication examples:

- `Anthropic found a hidden space where Claude puzzles over concepts`: two signals, two families, score 89.
- `The 6 wildest claims in Apple’s lawsuit against OpenAI`: two signals, one family, score 77.

The current duplicate reduction is two readings: four related signals become two cards. This is intentionally reported as thin coverage rather than overstated product maturity.

Persistence upserts stable cluster IDs and event/radar relationships. The final authoritative write persisted 207 clusters and 209 relationships and archived 0 stale clusters. Archival safeguards require authoritative Supabase input, a minimum feed size, at least 75% eligible-item clustering coverage, at least 90% retained-cluster coverage, and an explicit reconciliation guard. Rows are never deleted by clustering.

Event freshness scoring is deterministic: an explicit evidence `asOf` timestamp is accepted, otherwise the latest valid public `published_at` is used. Tutorial/onboarding pages and media interviews without an explicit AI subject remain available in `全部信号` but cannot enter the public event layer.
