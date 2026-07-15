# AI Industry Radar Product Spec

## Product Job

AI Industry Radar helps AI industry practitioners answer five questions quickly:

1. What changed?
2. Which reports describe the same event?
3. How strong and diverse is the evidence?
4. What deserves attention now?
5. What is missing, stale, or uncertain?

The product is an event radar, not a raw RSS reader, generic landing page, model leaderboard, or admin dashboard presented as a public product.

## Language Contract

The public product is Chinese-first and has a complete English route tree. A top-right `中文 / EN` control switches between equivalent routes while preserving the current section. Source names, company/model names, article titles, and papers may remain in their original language for traceability.

## Homepage

The first viewport shows real data and the beginning of `今日行业精选`:

- public signal and event counts;
- attempted, succeeded, failed, and manual source counts;
- latest public content publication time;
- daily/weekly report status;
- top curated event cards.

The rest of the page shows industry pulse, category/source distributions, source health, failure families, coverage limits, and event-aware Ask/Write entry points.

## Event Radar

`/radar/` defaults to `行业精选` and provides:

- `行业精选`
- `全部事件`
- `全部信号`
- `最新时间线`
- `待复核`
- `来源健康`

Event cards include canonical title, Chinese/English summary, score and label, source count, source families, related-item count, first/latest publication time, citations, timeline, and entities when available.

`全部信号` contains every public-safe radar row, including low-event directory/homepage signals. Those rows remain auditable but do not enter events or curated selection.

## Event Matching

Deterministic clustering combines normalized title similarity, strong shared entities, product/model/company identity, specific action keywords, category, publication window, source/domain evidence, and narrow concept aliases.

Over-merge safeguards must keep apart:

- different companies or models sharing generic release language;
- unrelated papers sharing generic AI/agent terms;
- adjacent semantic versions or release candidates;
- different partnership counterparts;
- directories, homepages, docs indexes, and repository metadata without a concrete event.

## Event Scoring

Event score dimensions are AI relevance, source credibility, source diversity, freshness, novelty, importance, and multi-source coverage. Labels are `高优先级`, `关注`, `观察`, and `噪音/低相关`. Score reasons are reader-facing Chinese or English, never raw model rationale or operational logs.

Different source families increase evidence diversity but do not prove source independence. The UI must state that caveat next to multi-source evidence.

## Reports

Daily and weekly report candidates are event-aware and quality-gated.

- Daily: at least 5 usable events/items, 3 citations, 2 sources, and 2 categories when available.
- Weekly: at least 20 usable events/items, 8 citations, 5 sources, and 3 categories when available.

Report cards show gate status, event/usable count, citations, source/category diversity, included events, caveats, and missing evidence. `needs_review` is an editorial status and is distinct from gate failure.

When the daily gate fails, the product must display `今日数据不足，需补充信源或等待下一轮刷新` and must not present the draft as a complete report.

## Ask and Write

`/ask/` queries current public event evidence. `/write/` creates evidence-led outlines and observations from current events. Cloudflare implementations run locally in the browser against the public snapshot and do not claim a live private chat or server action. Existing `/api/ask` and `/api/writing-assistant` response shapes remain unchanged in the dynamic app.

## Source Health

Public source health aggregates succeeded, failed, timeout, HTTP 403, rate limit, no items, duplicate only, manual blocked, unsupported, and low-relevance exclusion. Raw stack traces, provider payloads, credentials, and private logs remain internal.

## Public Data Contract

Cloudflare reads one allowlisted snapshot. Production export must read the three `security_invoker` Supabase public views and fail closed if the source is unavailable, incomplete, stale, or below release thresholds.

Forbidden public fields include raw text, raw metadata, model metadata, evidence notes, private notes, admin/audit logs, service keys, raw API payloads, cookies, and wrong-domain model-radar relations.

## Operations

Refresh is manual `workflow_dispatch` only. No schedule is enabled. Mock/live, persistence, clustering, reports, and Cloudflare deployment are independent explicit inputs. Writes require the temporary process gate plus the repository write gate and are never enabled in deployed environments.

X and WeChat are manual/blocked sources. Source-health writes and automatic report publication are outside this release.

## Non-Blocking Internal Surfaces

Admin authentication, personal saved items, annotations, private sources, and full editorial workflows may continue in the dynamic app, but they are not prerequisites for the public Cloudflare product and must not block public release validation.
