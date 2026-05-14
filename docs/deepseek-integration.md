# DeepSeek Integration

## Purpose

DeepSeek supports low-cost understanding and higher-quality synthesis. The project keeps business logic, source attribution, validation, and inclusion thresholds outside the model.

## Model Split

- DeepSeek V4 Flash: AI relevance, language classification, category classification, tag generation, short summaries, and entity extraction.
- DeepSeek V4 Pro: scoring explanations, importance/credibility/novelty reasoning, why-it-matters drafts, report-ready synthesis fields, future Q&A, and writing assistant synthesis.

## Environment Variables

Use `.env.example` as the variable contract:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_FAST_MODEL`
- `DEEPSEEK_SMART_MODEL`

Defaults:

- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_FAST_MODEL=deepseek-v4-flash`
- `DEEPSEEK_SMART_MODEL=deepseek-v4-pro`

Never commit filled environment values.

## API Key Handling

Never paste DeepSeek API keys into Codex task text, ChatGPT messages, GitHub issues, commits, docs, or logs. Use `.env.local` or an equivalent untracked local environment file for local development, and use the deployment platform environment variable manager for deployed runs.

Keep `.env.example` blank for secret values:

```bash
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
DEEPSEEK_SMART_MODEL=deepseek-v4-pro
```

Mock mode is deterministic, requires no key, and remains the default for validation and builds. Live mode requires `DEEPSEEK_API_KEY` and an explicit `--mode live` or `npm run understand:items:live`. If a key is accidentally pasted into a prompt, task, log, GitHub issue, commit, or doc, rotate or revoke it before live use.

## Phase 5 Understanding

The Phase 5 layer reads Phase 4 raw items from:

- `data/ingestion/latest/raw-items.json`

It writes ignored local outputs:

- `data/understanding/latest/radar-items.json`
- `data/understanding/latest/understanding-run.json`
- `data/understanding/runs/*.json`

Commands:

```bash
npm run understand:items:mock
npm run understand:items -- --input data/ingestion/latest/raw-items.json --limit 5 --mode mock
npm run understand:items:live -- --limit 3
```

Mock mode is deterministic and makes no API calls. It is the default for validation and builds. Live mode is enabled only when `--mode live` is explicit and `DEEPSEEK_API_KEY` is present locally.

CLI safety limits:

- `--limit <number>` defaults to `10` and is capped in code.
- `--max-text-chars <number>` defaults to `6000`.
- Request timeout is configured in code.
- Transient live-call retries are capped at 2.

## Validation Boundary

Model JSON is validated before writing radar items. Invalid final radar items become failed understanding records, and invalid live stage outputs fall back to deterministic local heuristics where a safe fallback exists.

The model does not decide final inclusion. Code applies:

```text
overall = relevance*0.30 + importance*0.20 + credibility*0.20 + novelty*0.15 + freshness*0.10 + source_weight*0.05
```

Inclusion thresholds:

- `< 0.35` AI relevance: excluded.
- `0.35` to `< 0.60` AI relevance: needs review.
- `>= 0.60` AI relevance: included only when credibility is not low.

## Safety Requirements

- Do not send private credentials, cookies, browser profiles, or internal URLs to model APIs.
- Log provider, model, purpose, token usage, status, and prompt version.
- Store source links and timestamps alongside generated text.
- Keep DeepSeek calls out of ingestion fetching.
- Do not insert Phase 5 outputs into Supabase yet.
