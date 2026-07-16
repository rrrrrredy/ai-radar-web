# Event Clustering Release Candidate

Updated: 2026-07-16

## Contract

- implementation: `lib/events/clustering.ts`;
- command: `npm run events:cluster`;
- ignored artifact: `data/events/latest/event-layer.json`;
- controlled persistence: `npm run events:cluster -- --persist` with temporary read/write gates;
- public projection: `scripts/export-public-snapshot.ts`.

Only `included` and `needs_review` public-safe items enter clustering. Low-event signals stay in `全部信号`.

## Matching

The deterministic matcher combines normalized title overlap, strong entities, product/project identity, action keywords, categories, publication-time distance, source/domain evidence, and narrow concept aliases. It does not require an LLM call per merge.

Two high-confidence paths can force a merge above the global threshold:

1. a narrow concept alias with required anchors, such as Anthropic + Claude + J-space/Jacobian-lens/global-workspace;
2. the same distinctive named entity appearing in both titles, from different source families, in a shared category, within 24 hours.

The second path joins the OpenAI and MIT Technology Review GPT-Red evidence. Broad company/model terms are excluded from distinctive-entity matching.

## Over-Merge Safeguards

- generic AI/model/agent/tool/research terms are weak evidence;
- broad entities such as Claude, Anthropic, Google, Gemini, OpenAI, and Copilot cannot trigger named-entity corroboration;
- conflicting strong entities, versions, companies, projects, partners, and categories remain separate;
- exact GitHub tags preserve adjacent semantic and release-candidate versions;
- unrelated papers and same-day research do not merge on generic entities;
- named-entity corroboration requires cross-family evidence and a 24-hour window;
- only valid `published_at` values create timelines;
- homepage, directory, docs-index, and repository-metadata rows do not become events.

Regression tests cover positive Apple/OpenAI, Anthropic/J-space, and GPT-Red merges plus negative Claude same-day research, later GPT-Red benchmarks, other-lab research, adjacent releases, partner conflicts, and directory pages.

## Results

| metric | persisted layer | Cloudflare display |
| --- | ---: | ---: |
| input public signals | 298 | 298 in `全部信号` |
| event relationships | 246 | 244 |
| event clusters | 243 | 241 |
| multi-item events | 3 | 3 |
| cross-family events | 2 | 2 |
| curated events | 8 | 8 |

Deduplication examples:

- GPT-Red: 2 signals, 2 families, score 92.
- Anthropic J-space: 2 signals, 2 families, score 90.
- Apple/OpenAI lawsuit: 2 signals, 1 family, score 77.

Six related signals become three cards, reducing three repeated readings. Remaining cross-family coverage is reported as thin rather than overstated.

The final authoritative write upserted 243 clusters and 246 relationships and archived 3 stale generated clusters. Persistence now fails closed unless the input is an authoritative direct Supabase public-radar read. Coverage guards require at least 75% eligible-item clustering and 90% retained active-cluster coverage. Clustering archives generated rows but never deletes them.
