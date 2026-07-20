# AI Industry Radar Product Spec

## Product Job

AI Industry Radar helps readers answer five questions quickly:

1. What changed in AI today?
2. Which source items describe the same event?
3. What deserves attention now?
4. Why is each development worth reading?
5. Which original sources support the summary?

The product is an event-level information reader, not a raw RSS list, model leaderboard, landing-page showcase, or public operations dashboard.

## Language and Brand Contract

The public product is Chinese-first and has an equivalent English route tree. Source names, company and model names, article titles, and paper titles may retain their original language when that improves traceability.

The browser-title brand is always `AI 行业信息雷达`:

- home: `今日热点 - AI 行业信息雷达`;
- other Chinese pages: `<页面名> - AI 行业信息雷达`;
- English pages may translate the section name but keep the same brand identity.

## Public Information Architecture

The reader-facing navigation contains exactly four product sections:

- `今日热点` -> `/`
- `全部动态` -> `/radar/`
- `来源` -> `/sources/`
- `关于` -> `/about/`

The former `公众号` label is retired; `来源` is the accurate reader-facing name because the product includes official sites, media, technical blogs, research feeds, repositories, and other public source families.

Internal ingestion state, numeric scoring, write controls, and administrative views do not appear in public navigation.

## 今日热点

The homepage shows exactly ten ranked developments. Each row includes:

- rank `01` through `10`;
- publication time;
- one or more readable source names;
- topic/category;
- normalized reader-facing headline;
- substantive summary;
- `为什么值得看` judgment;
- direct link to the strongest available public evidence.

The first viewport begins with real content. It does not lead with KPI cards, operational status, empty marketing copy, or internal score explanations.

## 全部动态

`/radar/` is a continuous event feed rather than a tabbed admin dashboard. Readers can:

- search title, summary, entity, and source text;
- filter by topic;
- filter by source family;
- scan publication time and source context;
- open the original evidence.

Low-information directory pages, documentation indexes, generic homepages, and repository metadata without a concrete development remain outside the reader-facing event stream.

## 来源

`/sources/` explains where information comes from. It groups public sources by reader-meaningful families and preserves source names and direct URLs. The page may explain coverage limitations, but it does not expose internal crawl state, raw errors, provider payloads, or service credentials.

## 关于

`/about/` explains:

- what the product does;
- how repeated source items become one event;
- how summaries and reader judgments are produced;
- the before-09:00 Asia/Shanghai freshness target and recovery cadence;
- public-data and privacy boundaries;
- coverage and freshness limitations.

## Event Matching

Deterministic clustering combines normalized title similarity, strong shared entities, product/model/company identity, specific action keywords, category, publication window, source/domain evidence, and narrow concept aliases.

Over-merge safeguards keep apart:

- different companies or models sharing generic release language;
- unrelated papers sharing generic AI or agent terms;
- adjacent semantic versions or release candidates;
- different partnership counterparts;
- pages without a concrete event.

Different source families increase evidence diversity but do not prove source independence. Reader copy must not imply independent confirmation unless the evidence supports it.

## Event Ranking

Ranking may use AI relevance, source credibility, source diversity, freshness, novelty, importance, and multi-source coverage. Numeric internals and raw model rationale are not public. Public labels and `为什么值得看` must be written as concise editorial judgment rather than metric explanations.

## Headline Quality

Every public headline must look intentionally edited:

- preserve canonical casing such as `OpenAI`, `Anthropic`, `Apple`, `xAI`, `GitHub`, `NVIDIA`, and `Hugging Face`;
- prefer concrete subject-action-object wording over templates such as “X 相关 AI 进展”;
- retain the specific model, product, paper, policy, or legal action when evidence provides it;
- avoid exposing internal categories or scoring language in the headline;
- avoid duplicate source prefixes and boilerplate;
- never truncate text in generated HTML or in the middle of a word;
- use responsive CSS line clamping only as a display treatment, while keeping the complete accessible title and link text;
- fall back to a cleaned original source title when a trustworthy Chinese rewrite is not available.

## Public Data Contract

Cloudflare reads one allowlisted snapshot. Production export must read approved Supabase public views and fail closed when the source is unavailable, incomplete, stale, or below release thresholds.

Both production flags are mandatory:

- `CLOUDFLARE_SNAPSHOT_READ_SUPABASE=true`
- `CLOUDFLARE_SNAPSHOT_REQUIRE_SUPABASE=true`

A production run never falls back to local evidence files. Forbidden public fields include raw text, raw/model metadata, evidence notes, private notes, admin/audit logs, service keys, raw API payloads, cookies, operational checkpoints, and unrelated database relations.

## Operations

`.github/workflows/radar-refresh-cloudflare.yml` uses timezone-aware GitHub Actions windows at **06:17, 07:17, and 08:17 Asia/Shanghai** to target a fresh production release before 09:00. It also retains `workflow_dispatch` for bounded manual reruns.

Each scheduled window checks the fixed production snapshot before doing expensive work. A current-day strict Supabase release from the service window is skipped. The first two windows run the normal 30-source plan when needed; the 08:17 recovery window uses 10 core sources so it can still complete before the target.

Every production run must:

1. execute on `refs/heads/main`;
2. require `RADAR_REFRESH_WRITE_GATE=true`;
3. run live resumable source activation;
4. persist successful activation chunks to Supabase;
5. cluster and persist events;
6. build with strict Supabase-only snapshot flags;
7. run the release test suite;
8. deploy the built artifact to Cloudflare Pages project `ai-industry-radar` on `main`;
9. verify the production endpoint.

Scheduled events use explicit production defaults and never depend on absent dispatch inputs. Manual inputs only adjust bounded source and item counts; they cannot switch the run to mock, disable persistence, skip clustering, or skip deployment.

One fixed concurrency group prevents overlapping production refreshes. Recent same-day incomplete activation checkpoints resume across workflow runs. A recent fully persisted checkpoint is reused only to retry clustering, build, and deployment; old or incompatible checkpoints are cleared before a new activation.

The 09:00 target is a monitored service objective, not an absolute cron guarantee. GitHub Actions billing, repository configuration, and hosted-runner availability remain external prerequisites.

## Security Configuration

Required repository variables:

- `RADAR_REFRESH_WRITE_GATE=true`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `CLOUDFLARE_ACCOUNT_ID`

Required repository secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `DEEPSEEK_API_KEY`
- `CLOUDFLARE_API_TOKEN`

The workflow uses `contents: read` only. Secrets are scoped to the steps that need them: live understanding/persistence, event persistence, or Cloudflare deployment. The public site is read-only and never receives service-role credentials.

## Release Acceptance

- Homepage contains exactly ten hot-topic rows.
- Public navigation contains only 今日热点 / 全部动态 / 来源 / 关于.
- Browser titles use AI 行业信息雷达.
- Headlines pass casing, specificity, and no-truncation rules.
- Desktop and mobile layouts have no horizontal overflow.
- Search and filters update visible events correctly.
- Strict production build proves Supabase public-view input and local fallback is disabled.
- Daily workflow performs live persistence, event persistence, validation, Cloudflare production deployment, and endpoint verification.

## Non-Blocking Internal Surfaces

Admin authentication, manual source maintenance, private annotations, and ingestion diagnostics may remain internal. They are not prerequisites for the public Cloudflare reading experience and must not leak into public navigation or block reader-facing rendering.
