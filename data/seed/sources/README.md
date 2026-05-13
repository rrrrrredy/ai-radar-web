# Source Seed Registry

This directory contains the Phase 3 cleaned source registry for future AI Industry Radar ingestion.

## Files

- `../sources.example.json` remains a small synthetic demo seed for UI and schema smoke tests.
- `ai-learning-resources.cleaned.json` is the real cleaned seed registry derived from the user's public source list.
- `ai-learning-resources.audit.md` records import counts, deduplication notes, parser limitations, URL-completion follow-up, and likely first ingestion candidates.
- `source-import-summary.json` exposes machine-readable counts for validation and future admin tooling.

## Policy

- The raw markdown input is intentionally excluded from git through `local-input/`.
- Only public-information source metadata is committed.
- Private, internal, local, credentialed, attachment-only, and image-only links are stripped during import.
- Sources without a public homepage are kept with `url: null`, `status: "needs_public_url"`, and a manual-review risk flag.
- RSS/feed URLs are recorded only when the input explicitly provides a public feed.
- X accounts are retained for future API/manual workflows and are not treated as directly crawlable in Phase 3.
- WeChat public-account style entries are preserved as source names, but image-only contact methods are not committed and are not auto-crawled.

Regenerate the registry with:

```bash
npm run import:sources
```
