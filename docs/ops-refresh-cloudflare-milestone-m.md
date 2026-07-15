# Manual Refresh and Cloudflare Workflow

Updated: 2026-07-15

## Trigger and Inputs

`.github/workflows/radar-refresh-cloudflare.yml` uses `workflow_dispatch` only. It has no `schedule` or cron trigger.

| input | default |
| --- | --- |
| `mode` | `mock` |
| `persist` | `false` |
| `limit` | `30` |
| `chunk_size` | `5` |
| `max_items_per_source` | `3` |
| `deploy_cloudflare` | `false` |
| `generate_reports` | `true` |
| `run_events_cluster` | `true` |

Inputs are range-checked and shell-injection resistant. Live provider access and production deployment are restricted to `main`. Persistence requires `mode=live`, manual `persist=true`, and the independent repository variable `RADAR_REFRESH_WRITE_GATE=true`.

## Run Order

1. checkout, Node setup, and `npm ci`;
2. lint, typecheck, tests, data validation, sensitive scan, and Supabase public-contract validation;
3. capture public-safe before counts;
4. restore resumable activation state and run bounded activation;
5. persist successful chunks only when both write gates pass;
6. cluster events, with persistence only under the same gate;
7. generate dry-run reports or controlled live candidates;
8. build the Cloudflare snapshot from Supabase public evidence with writes disabled;
9. optionally deploy with pinned Wrangler `4.86.0`;
10. write, scan, and upload the safe JSON/Markdown run summary.

## Secrets and Safety

Required configuration is read from GitHub secrets/variables without printing values: Supabase URL/anon key, service role key for controlled writes, DeepSeek key for live mode, and Cloudflare token/account ID for deployment. `GITHUB_TOKEN` is optional for authenticated public GitHub requests.

- no scheduled persistence;
- no X or WeChat automation;
- no source-health writes;
- no destructive SQL or reset of persisted tables;
- no service-role credential in the public build;
- no private/raw fields in the summary artifact;
- deployed environments keep `ENABLE_SUPABASE_WRITES=false`.

The authoritative release build sets both `CLOUDFLARE_SNAPSHOT_READ_SUPABASE=true` and `CLOUDFLARE_SNAPSHOT_REQUIRE_SUPABASE=true` only for the build process. The exporter fails closed on missing/fallback data, incomplete public-signal parity, fewer than 180 public rows, missing event/report layers, a failed weekly gate, or stale/invalid publication time. The resulting JSON contains all public-safe signals plus allowlisted events, report gates, aggregate health, and safe failure reasons. It contains no source error payloads or private logs.

## Operator Command

Use the GitHub Actions `Radar Refresh Cloudflare` manual run form. For a real refresh, select `live`, choose bounded limits, leave persistence off for inspection, then rerun with persistence only after reviewing the activation artifact and enabling the independent write gate. Cloudflare remains the primary public destination; GitHub Pages is not part of this workflow.
