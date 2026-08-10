-- Supabase databases use UTC. 01:00 UTC is 09:00 Asia/Shanghai.
do $$
declare
  old_job_id bigint;
begin
  select jobid
  into old_job_id
  from cron.job
  where jobname = 'radar-near-real-time-github-dispatch'
  limit 1;

  if old_job_id is not null then
    perform cron.unschedule(old_job_id);
  end if;
end;
$$;

create or replace function private.dispatch_radar_daily_production_refresh()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  github_token text;
  request_id bigint;
begin
  select decrypted_secret
  into github_token
  from vault.decrypted_secrets
  where name = 'radar_github_actions_token'
  limit 1;

  if github_token is null or length(github_token) < 20 then
    raise exception 'radar_github_actions_token is not configured in Vault.';
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/rrrrrredy/ai-radar-web/actions/workflows/radar-refresh-cloudflare.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || github_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'ai-industry-radar-supabase-cron'
    ),
    body := jsonb_build_object(
      'ref', 'main',
      'inputs', jsonb_build_object(
        'limit', '30',
        'chunk_size', '5',
        'max_items_per_source', '3'
      )
    ),
    timeout_milliseconds := 10000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.dispatch_radar_daily_production_refresh()
from public, anon, authenticated, service_role;

select cron.schedule(
  'radar-daily-0900-production-github-dispatch',
  '0 1 * * *',
  'select private.dispatch_radar_daily_production_refresh();'
);

drop function if exists private.dispatch_radar_realtime_refresh();
