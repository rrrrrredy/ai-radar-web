# Security

## Public Information Only

AI Industry Radar must use public information only. Do not commit or store private credentials, API keys, cookies, tokens, browser profiles, private company documents, company intranet links, or private company URLs in seed data.

## Secrets

Store secrets in environment variables. Use `.env.example` for variable names only. Never commit `.env` files.

Required secret handling:

- `SUPABASE_SERVICE_ROLE_KEY` must only be used server-side.
- `DEEPSEEK_API_KEY` must only be used server-side.
- `GITHUB_TOKEN` must not be exposed to browser code.
- WeChat credentials must remain disabled unless real platform configuration exists.

## Secrets and Model API Keys

Never commit secrets and never paste API keys into agent tasks, Codex prompts, ChatGPT messages, GitHub issues, commits, docs, or logs. Use environment variables only: local keys belong in `.env.local` or equivalent untracked files, and deployed keys belong in the deployment platform environment variable manager.

If a secret or model API key is exposed, rotate or revoke it before live use. Generated local ingestion and understanding outputs are ignored by git, and `npm run sensitive:scan` is required before commit to catch key-shaped values, bearer tokens, cookies, and private/internal URL patterns.

## Admin Access

Admin functions must require authenticated users with the `admin` role. Editor functions should be limited to source management, manual import, annotations, reports, and review workflows.

## Reporting Issues

Report vulnerabilities or accidental secret exposure directly to the repository owner. If a secret is committed, rotate it immediately and remove it from history before relying on the repository.
