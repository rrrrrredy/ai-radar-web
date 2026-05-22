# Production Access and Data Status

Date: May 22, 2026

Production URL: https://ai-radar-web-luosongred-5507s-projects.vercel.app

## Access Status

Root cause: the local/company DNS resolver returned non-Vercel addresses for the production Vercel hostname, including `199.59.150.45`, which timed out on port 443. A pinned request to the Vercel edge IP `76.76.21.21` returned `200 OK`.

Applied fix on the Windows machine:

```text
# Codex temporary Vercel production DNS pin for AI Industry Radar
76.76.21.21 ai-radar-web-luosongred-5507s-projects.vercel.app
```

The DNS resolver cache was flushed with:

```powershell
ipconfig /flushdns
```

Verification after the fix:

- `curl.exe -I https://ai-radar-web-luosongred-5507s-projects.vercel.app` returns `200 OK`.
- `Test-NetConnection` resolves the host to `76.76.21.21` and succeeds on TCP 443.
- The production URL was opened through the Microsoft Edge URL handler.

Rollback:

1. Remove the two hosts lines above from `C:\Windows\System32\drivers\etc\hosts`.
2. Run `ipconfig /flushdns`.

## Production Content

The production homepage serves AI Industry Radar content. Expected strings such as `AI Industry Radar`, `Editorial Intelligence Desk`, `Radar`, `Reports`, `Ask`, and `Write` are present. Wrong LLM Ecosystem strings checked in this milestone are absent. Legacy routes `/rankings`, `/models`, `/compare`, `/sentiment`, and `/tools` return `404`.

## Current Data Counts

- Sources: 311
- Raw items: 110
- Radar items: 82
- Public visible radar rows: 75
- Included / needs_review / excluded / failed in `radar_items`: 75 / 2 / 5 / 0
- Public visible citations: 75
- Report candidates: 12
- Latest ingestion: `2026-05-21T09:45:41.374+00:00`
- Latest understanding: `2026-05-21T10:05:38.923+00:00`
- Latest visible radar timestamp: `2026-05-21T10:05:00.655+00:00`

Top categories from public radar rows:

- research: 45
- open_source: 13
- product_update: 12
- agent: 8
- other: 8
- benchmark: 4
- media_interview: 4
- model_release: 4

Top sources from public radar rows:

- arXiv cs.CL: 12
- arXiv cs.CV: 12
- arXiv cs.LG: 10
- OpenAI News: 8
- arXiv cs.AI: 6
- Lex Fridman: 4
- Anthropic Python SDK: 3
- Hugging Face Transformers: 3

Latest saved report candidates:

- Daily: `3c439b35-ba3a-4873-aceb-f2b675ed854c`, `needs_review`, `supabase_radar_items`, 18 usable items, 8 citations.
- Weekly: `2a28689e-9bd8-498d-9b51-c4e96c3dfea0`, `needs_review`, `supabase_radar_items`, 66 usable items, 12 citations.

## Frontend Data Surfaces

- `/` shows production data status near the top, including source count, raw item count, radar item count, visible rows, report candidate count, citations, latest ingestion, latest understanding, latest visible radar time, and `data_source = supabase_radar_items`.
- `/` Radar Pulse uses real Supabase-backed categories, sources, source families, and latest signals.
- `/radar` uses `supabase_radar_items`, with server-side filters, category tabs, search, status counts, caveats, evidence rows, and citations.
- `/reports` prefers saved Supabase report candidates and exposes saved candidate mode, status, windows, citations, caveats, markdown export, and detail links.
- `/ask` and `/write` show query/prompt examples shaped by current categories, display data source and caveats, and call public APIs in mock generation mode without changing response shapes.

## Data Growth Attempt

Visible rows were below the 100-row milestone threshold, so bounded live refreshes were attempted without persistence:

- `limit=50`, `max-items-per-source=5`: timed out.
- `limit=30`, `max-items-per-source=3`: timed out.
- `limit=20`, `max-items-per-source=3`: timed out.

Leftover activation processes from the timed-out runs were stopped. No Supabase write gate was enabled, no report candidate refresh was written, and no scheduled job, X crawl, WeChat crawl, or source-health write ran.

## Remaining Gaps

- Public visible radar rows remain at 75, below the 100-row target.
- Live refresh needs a smaller batch strategy, per-source timeout control, or provider latency handling before persistence.
- Entity and relationship depth is intentionally lightweight and can be expanded after the core data volume is stable.

## Next Milestone Recommendation

Milestone L: make live data activation resumable and timeout-aware, then persist a controlled batch that raises public visible radar rows above 100.
