# Milestone G Production Launch Candidate

Last updated: 2026-05-20

## Summary

- Final Production URL: `https://ai-radar-web-luosongred-5507s-projects.vercel.app`
- Vercel project: `luosongred-5507s-projects/ai-radar-web`
- Production smoke target: stable Production alias. Deployment IDs rotate on `main` pushes.
- Deployment status: Ready
- Source branch merged to `main`: `codex/milestone-e-operating-loop`
- Production deploy method: `git push origin main` followed by explicit `npx vercel --prod --yes` after Production env setup and one report-detail fix

Production launch is usable for public read-only surfaces and mock-mode APIs after the callback action below. It is not a public announcement milestone until signed-in admin smoke is completed.

## Environment

Configured Vercel Production env names, values redacted:

- `ADMIN_EMAIL`
- `APP_BASE_URL`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_FAST_MODEL`
- `DEEPSEEK_SMART_MODEL`
- `ENABLE_LIVE_DEEPSEEK_IN_JOBS`
- `ENABLE_SCHEDULED_INGESTION`
- `ENABLE_SCHEDULED_PERSISTENCE`
- `ENABLE_SUPABASE_RETRIEVAL`
- `ENABLE_SUPABASE_WRITES`
- `ENABLE_WECHAT_AUTH`
- `ENABLE_X_API`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Expected Production flag state:

- `APP_BASE_URL` matches the final Production URL.
- `ENABLE_SUPABASE_RETRIEVAL=true`
- `ENABLE_SUPABASE_WRITES=false`
- `ENABLE_SCHEDULED_INGESTION=false`
- `ENABLE_SCHEDULED_PERSISTENCE=false`
- `ENABLE_LIVE_DEEPSEEK_IN_JOBS=false`
- `ENABLE_X_API=false`
- `ENABLE_WECHAT_AUTH=false`

## Supabase Auth

Required Production redirect URL:

```text
https://ai-radar-web-luosongred-5507s-projects.vercel.app/auth/callback
```

Status: user action needed.

The Supabase MCP tools available in this session could list/query the project but did not expose Auth URL configuration. The Supabase CLI was not installed or logged in on this Windows machine, and no local Supabase access token was available. Add the URL above in Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs, then run the admin login smoke:

```text
https://ai-radar-web-luosongred-5507s-projects.vercel.app/auth/login?next=%2Fadmin%2Freview
```

Do not inspect or print magic links, cookies, or tokens.

## Smoke Results

Network note: local DNS resolved the final `.vercel.app` host to non-Vercel IPs and normal curl timed out. Smoke checks used reversible request-level pinning only:

```bash
curl --resolve ai-radar-web-luosongred-5507s-projects.vercel.app:443:76.76.21.21 ...
```

No hosts file entry was changed. If a hosts entry is later needed on this machine, add only the final Production host mapped to `76.76.21.21`, and roll it back by deleting that single line.

GET smoke:

| route | status | result |
| --- | ---: | --- |
| `/` | 200 | ok |
| `/radar` | 200 | `Data: Supabase`, read-only, Supabase writes not run |
| `/reports` | 200 | saved workflow / saved candidate mode |
| `/reports/c2ea6cb1-324c-4f20-9ae2-92d26b7f0fa5` | 200 | saved candidate detail |
| `/reports/71e96d51-c942-48b9-a677-632ccfbd8d30` | 200 | saved candidate detail |
| `/ask` | 200 | ok |
| `/write` | 200 | ok |
| `/auth/login` | 200 | ok |
| `/admin` | 307 | redirects to `/auth/login?next=%2Fadmin` |
| `/admin/review` | 307 | redirects to `/auth/login?next=%2Fadmin%2Freview` |
| `/en/admin/review` | 307 | canonicalizes to `/admin/review`, not 404 |
| `/en/auth/login` | 307 | canonicalizes to `/auth/login` |

POST smoke:

| route | status | result |
| --- | ---: | --- |
| `/api/ask` | 200 | `generationMode: "mock"` request returned `mode: "mock"` |
| `/api/writing-assistant` | 200 | `generationMode: "mock"` request returned `mode: "mock"` |

Auth smoke:

- Supabase callback added: no, user action needed.
- Magic-link login smoke: not run.
- `/admin/review` signed-in smoke: not run.
- `/admin/ingestion` signed-in smoke: not run.
- Operating Loop section and six ops commands: not verified in Production signed-in session yet.
- Production admin mutation: not run and not approved in this milestone.

## Validation

Passed before merging to `main` and again after the report detail fix:

- `npm run lint`
- `npm run typecheck`
- `npm run validate:data`
- `npm run sensitive:scan`
- `npm run build`
- `npm run check:deployment`

## Safety

- Supabase writes run: no.
- Scheduled jobs run: no.
- Scheduled persistence run: no.
- Source-health writes run: no.
- X crawl run: no.
- WeChat crawl run: no.
- Broad live DeepSeek run: no.
- Live DeepSeek in scheduled jobs: disabled.
- Secrets printed: no.
- `.env.local` committed: no.
- Temp env files committed: no.
- Public `/ask` and `/write` API response shapes changed: no.

Read-only Supabase SQL was used once to confirm the required saved report candidate IDs exist. No database writes were executed.

## Rollback

1. In Vercel, rollback or promote the previous known-good Production deployment from the project deployments page.
2. If needed, run `npx vercel rollback <deployment-url-or-id>` from the linked project.
3. Keep `ENABLE_SUPABASE_WRITES=false`.
4. Disable `ENABLE_SUPABASE_RETRIEVAL` only if Supabase-backed reads become unsafe or unavailable.
5. Keep `ENABLE_SCHEDULED_INGESTION=false`, `ENABLE_SCHEDULED_PERSISTENCE=false`, and `ENABLE_LIVE_DEEPSEEK_IN_JOBS=false`.
6. Remove any temporary hosts-file line for the final Production host if one was added during local verification.
7. Revert or hotfix the latest `main` commit only with an intentional follow-up commit; do not force-push.

## Still Not Enabled

- Scheduled writes.
- Scheduled report publication.
- X or WeChat automatic crawl.
- Live DeepSeek in scheduled jobs.
- Source-health writes.
- Production admin mutation smoke.
- Public announcement readiness.
