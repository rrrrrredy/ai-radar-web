create or replace function public.set_radar_github_dispatch_token(secret_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_secret_id uuid;
begin
  if secret_value is null or length(secret_value) < 20 then
    raise exception 'A valid GitHub workflow token is required.';
  end if;

  select id
  into existing_secret_id
  from vault.secrets
  where name = 'radar_github_actions_token'
  limit 1;

  if existing_secret_id is null then
    perform vault.create_secret(
      secret_value,
      'radar_github_actions_token',
      'Encrypted token used only by Supabase Cron to dispatch the radar refresh workflow.'
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      secret_value,
      'radar_github_actions_token',
      'Encrypted token used only by Supabase Cron to dispatch the radar refresh workflow.'
    );
  end if;
end;
$$;

revoke all on function public.set_radar_github_dispatch_token(text) from public, anon, authenticated;
grant execute on function public.set_radar_github_dispatch_token(text) to service_role;
