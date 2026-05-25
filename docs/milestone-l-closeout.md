# Milestone L Closeout

Date: 2026-05-25

## Merge and deployment

- Milestone branch merged to `main`: yes, fast-forward from `codex/milestone-l-cloudflare-primary-data`.
- Main pushed after merge: yes.
- Cloudflare primary public URL: `https://ai-industry-radar.pages.dev`.
- Cloudflare immutable deployment URL: `https://04aa8a98.ai-industry-radar.pages.dev`.
- Vercel remains reference dynamic app: `https://ai-radar-web-luosongred-5507s-projects.vercel.app`.

## Final data counts

- Public radar rows before closeout: 148.
- Public radar rows after closeout: 151.
- Target `public_radar_items > 150`: reached.
- Sources: 312.
- Raw items: 173.
- Radar items: 167.
- Radar status counts: included 150, needs_review 4, excluded 13, failed 0.
- Public snapshot status counts: included 147, needs_review 4, excluded 0.
- Report candidates: 18.

## Failed and manual sources

- Original failed sources handled: yes.
- Timeout/fetch-aborted retry attempted once: `andrew-chen`, `epoch-ai`, `heartcore-insights`, `marc-andreessen`, `the-strategy-desk`.
- HTTP 403 final blocked-access reason: `the-information`, `turing-post`.
- Failed timeout count from original gap: 5.
- Failed 403 count from original gap: 2.
- Current latest closeout run failed sources: 0.
- Manual/blocked sources: 226. These include manual/future API, X API future, WeChat/manual-only, unknown crawl, or sources needing public URL review. They were not automatically crawled.

## Reports

- Daily candidate: `ab6a7a16-aaa3-4e36-aeaa-03e082e4cc6c`, `needs_review`, 1 usable item, 1 citation, 8 caveats, 2 missing evidence notes.
- Weekly candidate: `ba402aba-1f26-4b21-bf56-1f0c9e1a68fb`, `needs_review`, 112 usable items in generation, 12 citations, 6 caveats, 0 missing evidence notes.
- Public snapshot stores the weekly candidate with 15 source item ids and 12 citations.

## Public UI status

- Cloudflare public UI is Chinese-first across `/`, `/radar/`, `/reports/`, `/ask/`, and `/write/`.
- Coverage UI is visible on the homepage and route-level pages.
- Remaining English on Cloudflare is data content: source names, model/company names, source article titles, and persisted source/report summaries.
- Vercel Chinese-first UI must be rechecked after the final closeout commit is pushed and the Git-triggered Vercel build completes.

## Safety

- Supabase writes were limited to controlled activation/report persistence with process-level `ENABLE_SUPABASE_WRITES=true`.
- Deployed write gate remains disabled.
- No scheduled jobs were run.
- No X or WeChat automatic crawl was run.
- No source-health writes were run.
- `.env.local`, raw API payloads, private generated artifacts, and secrets were not committed.

## Remaining gaps

- Preferred 160 public rows was not pursued because this was a bounded closeout, not a broad activation sprint.
- 226 manual/blocked sources need future reviewed ingestion paths or manual public URL completion.
- Persisted report candidate bullets can contain English source-derived content where the underlying public item title/summary is English.
