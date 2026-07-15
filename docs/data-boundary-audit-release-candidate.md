# Data Boundary Audit - Release Candidate

Updated: 2026-07-15

## Table Classification

| group | relations | connection state |
| --- | --- | --- |
| A: AI Industry Radar core | `sources`, `raw_items`, `radar_items`, `public_radar_items`, `event_clusters`, `event_cluster_items`, `entities`, `item_entities`, `scores`, `ingestion_runs`, `understanding_runs`, `report_candidates`, `public_report_candidates`, `public_reports`, `admin_audit_events`, `api_usage_logs` | Crawl, understanding, persistence, events, reports, and public views are connected. Public pages use only the three public views or snapshot. Event tables are persisted but deliberately not direct public dependencies. |
| B: admin/ops | `users_profile`, `user_roles`, `review_tasks`, `source_change_requests`, `source_health_checks`, `system_settings` | Partially connected in the Vercel/admin application. Not required by Cloudflare and not a public release blocker. |
| C: wrong domain | `radar_models`, `radar_model_versions`, `radar_external_metrics`, `radar_deepseek_metrics`, `radar_source_gated_signals`, `radar_pulse_snapshots`, `radar_leaderboard_snapshots`, `radar_admin_review_items`, `radar_audit_events`, `radar_refresh_runs`, `radar_companies`, `radar_deferred_surfaces` | Forbidden from AI Industry Radar public routes, APIs, loaders, and Cloudflare output. Tables are retained and not dropped. |

## Public Dependency Map

| route/surface | loader/build path | database dependency |
| --- | --- | --- |
| `/`, `/radar`, `/entities*`, `/ask`, `/write` | radar feed, event and product summaries | `public_radar_items` or public snapshot fallback |
| `/reports*` | report workflow loader plus radar traceability | `public_report_candidates`, `public_reports`, `public_radar_items`, or reviewed public fallbacks |
| `/api/ask`, `/api/writing-assistant` | public evidence retrieval | `public_radar_items`; response shapes unchanged |
| Cloudflare `/`, `/radar/`, `/reports/`, `/ask/`, `/write/`, `/entities/`, `/en/*` | `scripts/build-cloudflare-public-site.ts` | static `data/radar-snapshot.json` only |
| production snapshot build | `scripts/export-public-snapshot.ts` | three Supabase public views; strict mode forbids local fallback |

## Security Boundary

Migrations `20260715064603_harden_public_views_security_invoker.sql` and `20260715065603_revoke_private_table_api_grants.sql` implement:

- `security_invoker=true` on all three public views;
- trigger-maintained allowlisted report payloads, so report `metadata` is never granted;
- column-level grants only for fields required by public views;
- explicit public-row RLS policies;
- revocation of anonymous/authenticated privileges on private operational tables;
- fixed trigger-function search paths.

Verification results:

- Supabase Security Advisor ERROR: 0;
- anonymous public radar rows: 261;
- anonymous public report candidates: 34;
- anonymous access to `raw_items`: denied;
- anonymous access to raw/model/report metadata: denied.

The remaining advisor warning is Auth leaked-password protection. Public Cloudflare access has no login, and admin authentication is not a public release dependency.

## Wrong-Domain Audit

Code search across public routes, loaders, Cloudflare builder, and snapshot exporter found no C-group runtime reads. Snapshot key scans and sensitive scans reject raw/private fields. No table was dropped and no destructive SQL was run.
