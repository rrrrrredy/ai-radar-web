-- These legacy model-ecosystem tables are outside the AI Industry Radar
-- public product boundary. Keep them available to service-role operations,
-- but remove PostgREST access for public application roles.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'radar_models',
    'radar_model_versions',
    'radar_external_metrics',
    'radar_deepseek_metrics',
    'radar_source_gated_signals',
    'radar_pulse_snapshots',
    'radar_leaderboard_snapshots',
    'radar_admin_review_items',
    'radar_audit_events',
    'radar_refresh_runs',
    'radar_companies',
    'radar_deferred_surfaces'
  ]
  loop
    if to_regclass('public.' || quote_ident(table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format(
        'revoke all privileges on table public.%I from public, anon, authenticated',
        table_name
      );
    end if;
  end loop;
end
$$;
