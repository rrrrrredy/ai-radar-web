# Local Ingestion Outputs

Phase 4 writes local public-source ingestion artifacts here.

- `latest/raw-items.json` contains the most recent normalized raw items.
- `latest/ingestion-run.json` contains the most recent run summary.
- `runs/*.json` contains timestamped snapshots for local debugging.

Generated JSON files are ignored by git. Keep only `.gitkeep` and this README tracked unless a future task intentionally adds tiny synthetic fixtures.

The Phase 4 runner is public-source only. It supports `rss`, `html`, `api`, `podcast_feed`, and `youtube_feed` source-selection methods, but the YouTube path records a placeholder instead of scraping videos. X automatic crawling, WeChat automatic crawling, private URLs, sign-in-only sources, and credentialed requests are intentionally unsupported.

Run locally:

```bash
npm run ingest:sources:dry-run
npm run ingest:sources -- --limit 5 --max-items-per-source 5
npm run ingest:sources -- --method rss --limit 10
```
