-- Private operational tables are service-role surfaces. RLS already blocks
-- anonymous rows; explicit privilege revocation adds a second boundary.

revoke all on public.annotations from public, anon, authenticated;
revoke all on public.api_usage_logs from public, anon, authenticated;
revoke all on public.event_cluster_items from public, anon, authenticated;
revoke all on public.event_clusters from public, anon, authenticated;
revoke all on public.ingestion_runs from public, anon, authenticated;
revoke all on public.radar_admin_review_items from public, anon, authenticated;
revoke all on public.radar_audit_events from public, anon, authenticated;
revoke all on public.radar_refresh_runs from public, anon, authenticated;
revoke all on public.raw_items from public, anon, authenticated;
revoke all on public.saved_items from public, anon, authenticated;
revoke all on public.scores from public, anon, authenticated;
revoke all on public.source_health_checks from public, anon, authenticated;
revoke all on public.system_settings from public, anon, authenticated;
revoke all on public.understanding_runs from public, anon, authenticated;

alter function public.radar_set_updated_at() set search_path = pg_catalog;
alter function public.radar_prevent_readonly_seed_mutation() set search_path = pg_catalog;
alter function public.radar_require_review_for_missing_sources() set search_path = pg_catalog;

revoke all on function public.radar_set_updated_at() from public, anon, authenticated;
revoke all on function public.radar_prevent_readonly_seed_mutation() from public, anon, authenticated;
revoke all on function public.radar_require_review_for_missing_sources() from public, anon, authenticated;
