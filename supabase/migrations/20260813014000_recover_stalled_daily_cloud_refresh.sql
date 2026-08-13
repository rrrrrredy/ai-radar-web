create or replace function private.radar_cloud_refresh_tick()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_run_status text;
begin
  select id, status
  into v_run_id, v_run_status
  from private.radar_cloud_runs
  where started_at >= date_trunc('day', now()) + interval '1 hour'
    and started_at < date_trunc('day', now()) + interval '2 hours'
  order by started_at desc
  limit 1;

  if v_run_id is null then
    return private.start_radar_cloud_refresh();
  end if;

  if v_run_status <> 'running' then
    return v_run_id;
  end if;

  update private.radar_cloud_tasks
  set
    status = 'completed',
    finished_at = now(),
    fetch_succeeded = false,
    item_count = 0,
    result_items = '[]'::jsonb,
    error_message = 'Cloud source task exhausted transport retries.'
  where run_id = v_run_id
    and dispatch_attempts >= 3
    and (
      (status = 'queued' and last_dispatched_at < now() - interval '15 seconds')
      or
      (status = 'processing' and started_at < now() - interval '90 seconds')
    );

  perform private.radar_cloud_redispatch_stale(v_run_id);
  perform private.radar_cloud_finalize(v_run_id);
  return v_run_id;
end
$$;

revoke all on function private.radar_cloud_refresh_tick()
from public, anon, authenticated, service_role;

create or replace function public.radar_latest_publication_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(run.published_at)
  from private.radar_cloud_runs as run
  where run.status = 'published'
    and run.expected_source_count = run.completed_source_count
    and run.published_item_count > 0;
$$;

revoke all on function public.radar_latest_publication_at()
from public, anon, authenticated, service_role;
grant execute on function public.radar_latest_publication_at()
to anon, authenticated, service_role;

comment on function public.radar_latest_publication_at() is
  'Returns only the publication time of the latest fully completed public radar refresh.';

select cron.schedule(
  'radar-daily-0900-supabase-cloud',
  '0-5 1 * * *',
  'select private.radar_cloud_refresh_tick();'
);
