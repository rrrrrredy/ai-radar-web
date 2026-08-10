create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_radar_realtime_refresh()
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
    url := 'https://api.github.com/repos/rrrrrredy/ai-radar-web/actions/workflows/radar-realtime-refresh.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || github_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'ai-industry-radar-supabase-cron'
    ),
    body := jsonb_build_object('ref', 'main'),
    timeout_milliseconds := 10000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.dispatch_radar_realtime_refresh() from public, anon, authenticated, service_role;

select cron.schedule(
  'radar-near-real-time-github-dispatch',
  '*/10 * * * *',
  'select private.dispatch_radar_realtime_refresh();'
);

drop function if exists public.set_radar_github_dispatch_token(text);
