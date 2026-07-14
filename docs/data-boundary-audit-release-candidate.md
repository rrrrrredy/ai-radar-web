# Data Boundary Audit - Release Candidate

Updated: 2026-07-14

## A/B/C Table Boundary

| group | relations | rule |
| --- | --- | --- |
| A: public read views | `public_radar_items`, `public_report_candidates`, `public_reports` | These are the only database relations allowed for runtime public reads. Loaders select allowlisted columns and may fall back to the public Cloudflare snapshot or reviewed local public-report records. |
| B: internal AI Industry Radar | `sources`, `raw_items`, `radar_items`, `event_clusters`, `event_cluster_items`, `entities`, `item_entities`, `scores`, `reports`, `report_candidates`, `saved_items`, `annotations`, `ingestion_runs`, `understanding_runs`, `source_health_checks`, `users_profile`, `user_roles`, `review_tasks`, `source_change_requests`, `system_settings`, `admin_audit_events`, `api_usage_logs` | Server/operator and admin only. Build jobs may project allowlisted aggregate counts, but public pages must not read or expose raw B rows. Persisted event tables are not a public route dependency. |
| C: wrong domain | `radar_models`, `radar_model_versions`, `radar_external_metrics`, `radar_deepseek_metrics`, `radar_source_gated_signals`, `radar_pulse_snapshots`, `radar_leaderboard_snapshots`, `radar_admin_review_items`, `radar_audit_events`, `radar_refresh_runs`, `radar_companies`, `radar_deferred_surfaces` | Forbidden from AI Industry Radar public routes, APIs, loaders, and Cloudflare output. |

## Route, Loader, Table Map

| surface | loader/build path | allowed data dependency |
| --- | --- | --- |
| `/` | `loadProductDataSummary` -> `loadRadarFeed`, `loadReportWorkflowData`, `loadPublicSafeDataCompletenessSummary` | A views or public snapshot/local public fallbacks; events are derived in memory from public-safe radar items. |
| `/radar` | `loadRadarFeed` plus `buildEventLayer` and public-safe coverage | `public_radar_items` or public snapshot fallback; no direct `event_clusters` read. |
| `/entities`, `/entities/[entityId]` | `loadRadarFeed` plus entity summaries/evidence graph | `public_radar_items` or public snapshot fallback; entities are derived from allowlisted public item fields. |
| `/reports`, `/reports/[id]` | `loadReportWorkflowData`, `loadReportWorkflowDocumentById`, and radar traceability | `public_report_candidates`, `public_reports`, and `public_radar_items`, with public snapshot/reviewed-local fallbacks. |
| `/ask`, `/write` | `loadProductDataSummary` | Same A-view/public-snapshot dependencies as `/`. |
| `/api/ask`, `/api/writing-assistant` | `retrieveRadarEvidence` -> `loadRadarItems` | `public_radar_items` or public snapshot fallback; generation responses are separately sanitized. |
| Cloudflare `/`, `/radar/`, `/entities/`, `/reports/`, `/ask/`, `/write/`, and `/en/*` | `scripts/build-cloudflare-public-site.ts` | Static `data/radar-snapshot.json`; no runtime database read. |
| Cloudflare snapshot build | `scripts/export-public-snapshot.ts` | A views when explicitly enabled, otherwise prior/local public-safe snapshot plus activation output. Build-only completeness may read B tables and serialize counts only. |

## Audit Result

A code search across `app`, `components`, `lib`, `scripts`, `supabase`, and workflows found no C-group table references. Public loaders use A views or public-safe file fallbacks; public routes do not read B event tables or service-role operational rows.

The event layer is derived from public-safe radar fields. Event persistence is additive and write-gated, and does not change the public-read boundary. No destructive SQL or cleanup is part of this RC documentation pass.

This audit describes the current worktree. It is not a deployment-completion claim.
