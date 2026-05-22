# Milestone L Data Boundary Audit

Date: 2026-05-22

## Table classification

AI Industry Radar core:

- `sources`, `raw_items`, `radar_items`, `public_radar_items`
- `entities`, `item_entities`, `scores`
- `ingestion_runs`, `understanding_runs`
- `report_candidates`, `public_report_candidates`, `public_reports`
- `admin_audit_events`, `api_usage_logs`

AI Industry Radar admin/ops:

- `users_profile`, `user_roles`
- `review_tasks`, `source_change_requests`, `source_health_checks`
- `system_settings`

Other radar/model-domain tables not intended for AI Industry Radar public pages:

- `radar_models`, `radar_model_versions`, `radar_external_metrics`
- `radar_deepseek_metrics`, `radar_source_gated_signals`
- `radar_pulse_snapshots`, `radar_leaderboard_snapshots`
- `radar_admin_review_items`, `radar_audit_events`, `radar_refresh_runs`
- `radar_companies`, `radar_deferred_surfaces`

## Route to data map

| Route | Loader / API | Tables or views |
| --- | --- | --- |
| `/` | `loadProductDataSummary()` -> `loadRadarFeed()`, `loadReportWorkflowData()`, `loadOperationalSummary()` | `public_radar_items`, `public_report_candidates`, `public_reports`, counts from `sources`, `raw_items`, `radar_items`, `report_candidates`, `ingestion_runs`, `understanding_runs` |
| `/radar` | `loadRadarFeed()` -> `loadRadarItems()` -> `loadSupabaseRadarItems()` | `public_radar_items` |
| `/reports` | `loadReportWorkflowData()` | `public_report_candidates`, `public_reports`, `public_radar_items` when generated preview fallback is needed |
| `/reports/[id]` | `loadReportWorkflowDocumentById()` | `public_report_candidates`, `public_reports` |
| `/ask` | `loadProductDataSummary()` and client `/api/ask` | page summary reads above; API retrieval reads `public_radar_items` |
| `/write` | `loadProductDataSummary()` and client `/api/writing-assistant` | page summary reads above; API retrieval reads `public_radar_items` |
| `/admin/*` | admin loaders and server actions | `users_profile`, `user_roles`, `review_tasks`, `source_change_requests`, `report_candidates`, `admin_audit_events` |

## Public frontend dependency map

- Public radar evidence is read from `public_radar_items`.
- Public reports are read from `public_report_candidates` and `public_reports`.
- Homepage operational counts read core tables through server-side service access only; those counts are rendered as aggregate numbers, not raw rows.
- Ask/Write public pages use the same public retrieval summary and keep API response shapes unchanged.
- Cloudflare public site is built from `dist/cloudflare-pages/data/radar-snapshot.json`, generated from Supabase public-safe views plus aggregate counts.

## C-group exposure check

Search result: no code references were found for the C-group model-domain tables in `app`, `lib`, `components`, `scripts`, `supabase`, or `docs`.

AI Industry Radar public pages do not read the AI Model Radar / LLM Ecosystem tables. No wrong-domain table exposure was found, and no tables were dropped or destructively changed.

## Connection status

Fully connected:

- `public_radar_items` to `/`, `/radar`, `/ask`, `/write`, Cloudflare snapshot/site.
- `public_report_candidates` and `public_reports` to `/reports`, `/reports/[id]`, Cloudflare reports.
- Controlled persistence into `sources`, `raw_items`, `radar_items`, `entities`, `item_entities`, `scores`, `ingestion_runs`, `understanding_runs`, `api_usage_logs`, `report_candidates`, `admin_audit_events`.

Partially connected:

- Admin/ops tables are available only behind admin/auth flows and are not part of Cloudflare public output.
- Aggregate core counts are visible publicly, but raw rows and model metadata are not.

Not connected:

- C-group model-domain tables are not connected to AI Industry Radar public pages.
