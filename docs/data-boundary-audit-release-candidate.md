# Data Boundary Audit - Release Candidate

Generated: 2026-05-26

## Table Classification

AI Industry Radar core:

- `sources`, `raw_items`, `radar_items`, `public_radar_items`
- `event_clusters`, `event_cluster_items`
- `entities`, `item_entities`, `scores`
- `ingestion_runs`, `understanding_runs`
- `report_candidates`, `public_report_candidates`, `public_reports`
- `admin_audit_events`, `api_usage_logs`

AI Industry Radar admin/ops:

- `users_profile`, `user_roles`
- `review_tasks`, `source_change_requests`
- `source_health_checks`, `system_settings`

Other radar/model-domain tables that must not leak into public AI Industry Radar pages:

- `radar_models`, `radar_model_versions`, `radar_external_metrics`
- `radar_deepseek_metrics`, `radar_source_gated_signals`
- `radar_pulse_snapshots`, `radar_leaderboard_snapshots`
- `radar_admin_review_items`, `radar_audit_events`, `radar_refresh_runs`
- `radar_companies`, `radar_deferred_surfaces`

## Public Route Dependency Map

| route | loader/build path | public data used |
| --- | --- | --- |
| `/` | `loadProductDataSummary`, Cloudflare snapshot builder | `public_radar_items`, report public projections, counts, event layer derived from public rows |
| `/radar/` | `loadRadarFeed`, Cloudflare snapshot builder | `public_radar_items`, derived `event_clusters`, `event_cluster_items`, `timeline`, source health summary |
| `/reports/` | `loadReportWorkflowData`, Cloudflare snapshot builder | `public_report_candidates`, `public_reports`, service-side public-safe projection of `report_candidates` when needed |
| `/ask/` | `AskRadarClient`, `/api/ask` | read-only retrieval from `public_radar_items`; API response shape unchanged |
| `/write/` | `WriteRadarClient`, `/api/writing-assistant` | read-only retrieval from `public_radar_items`; API response shape unchanged |
| Cloudflare `/data/radar-snapshot.json` | `scripts/export-public-snapshot.ts` | public-safe radar/report/event/health/completeness fields only |

## Wrong-Domain Exposure Check

Search found C-group table names only in prior audit docs. No app, component, library, script, workflow, or Cloudflare build path reads those C-group tables.

No destructive SQL was run. No tables were dropped.

## Connected / Partially Connected / Not Connected

- Connected: public radar rows, report candidates, report quality gates, data completeness counts, source health aggregates, event clusters derived from public rows.
- Partially connected: persisted database `event_clusters` and `event_cluster_items` schema exists, but RC event output is derived and exported public-safe rather than destructively rewriting cluster tables.
- Not connected: wrong-domain model radar tables, source-health write table updates, admin login flows, X/WeChat automatic crawls.
