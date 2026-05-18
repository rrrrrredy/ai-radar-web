# Scheduled Dry-Run Outputs

Phase 9.2 writes generated scheduled job summaries here.

- `latest/scheduled-run.json` contains the latest scheduled dry-run summary.
- `runs/*.json` contains timestamped scheduled dry-run summaries.
- `tmp/` is reserved for future ignored temporary job files.

Generated JSON files are ignored by git. Keep only this README and `.gitkeep`
files tracked.

Scheduled dry-runs are GitHub Actions first. They run bounded public-source
ingestion and mock understanding only. They do not pass `--write`, persist to
Supabase, run live DeepSeek, write source-health history, use the X API, or
auto-crawl WeChat public accounts.

Phase 9.3 or a later explicitly approved phase can add controlled scheduled
persistence behind protected workflow and environment gates.
