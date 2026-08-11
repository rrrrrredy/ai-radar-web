create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.radar_cloud_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running'
    check (status in ('running', 'published', 'failed')),
  expected_source_count integer not null check (expected_source_count >= 0),
  completed_source_count integer not null default 0 check (completed_source_count >= 0),
  succeeded_source_count integer not null default 0 check (succeeded_source_count >= 0),
  failed_source_count integer not null default 0 check (failed_source_count >= 0),
  discovered_item_count integer not null default 0 check (discovered_item_count >= 0),
  published_item_count integer not null default 0 check (published_item_count >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  published_at timestamptz,
  failure_reason text
);

create table if not exists private.radar_cloud_tasks (
  run_id uuid not null references private.radar_cloud_runs(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  token_hash text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  dispatch_attempts integer not null default 0 check (dispatch_attempts between 0 and 3),
  last_dispatched_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  fetch_succeeded boolean,
  item_count integer not null default 0 check (item_count between 0 and 5),
  result_items jsonb not null default '[]'::jsonb,
  error_message text,
  primary key (run_id, source_id)
);

create index if not exists idx_radar_cloud_runs_started_at
  on private.radar_cloud_runs (started_at desc);
create index if not exists idx_radar_cloud_tasks_recovery
  on private.radar_cloud_tasks (run_id, status, last_dispatched_at);

revoke all on all tables in schema private from public, anon, authenticated, service_role;

do $$
declare
  existing_secret_id uuid;
begin
  select id
  into existing_secret_id
  from vault.secrets
  where name = 'radar_cloud_dispatch_seed'
  limit 1;

  if existing_secret_id is null then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'radar_cloud_dispatch_seed',
      'Internal seed for one-time Supabase Edge task tokens.'
    );
  end if;
end
$$;

create or replace function private.radar_cloud_token(
  p_run_id uuid,
  p_source_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_seed text;
begin
  select decrypted_secret
  into dispatch_seed
  from vault.decrypted_secrets
  where name = 'radar_cloud_dispatch_seed'
  limit 1;

  if dispatch_seed is null or length(dispatch_seed) < 32 then
    raise exception 'Radar cloud dispatch seed is unavailable.';
  end if;

  return encode(
    extensions.hmac(
      convert_to(p_run_id::text || ':' || p_source_id::text, 'utf8'),
      convert_to(dispatch_seed, 'utf8'),
      'sha256'
    ),
    'hex'
  );
end
$$;

revoke all on function private.radar_cloud_token(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function private.radar_cloud_dispatch_task(
  p_run_id uuid,
  p_source_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_token text;
  request_id bigint;
begin
  task_token := private.radar_cloud_token(p_run_id, p_source_id);

  update private.radar_cloud_tasks
  set
    dispatch_attempts = dispatch_attempts + 1,
    last_dispatched_at = now()
  where run_id = p_run_id
    and source_id = p_source_id
    and status in ('queued', 'processing')
    and dispatch_attempts < 3;

  if not found then
    return null;
  end if;

  select net.http_post(
    url := 'https://phurrofgzqvawhookqbv.supabase.co/functions/v1/radar-cloud-refresh',
    headers := jsonb_build_object(
      'content-type', 'application/json'
    ),
    body := jsonb_build_object(
      'run_id', p_run_id,
      'source_id', p_source_id,
      'token', task_token
    ),
    timeout_milliseconds := 30000
  )
  into request_id;

  return request_id;
end
$$;

revoke all on function private.radar_cloud_dispatch_task(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function private.radar_cloud_redispatch_stale(
  p_run_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  task record;
  dispatched integer := 0;
begin
  for task in
    select source_id
    from private.radar_cloud_tasks
    where run_id = p_run_id
      and dispatch_attempts < 3
      and (
        (status = 'queued' and last_dispatched_at < now() - interval '15 seconds')
        or
        (status = 'processing' and started_at < now() - interval '90 seconds')
      )
    order by last_dispatched_at asc nulls first
    limit 8
    for update skip locked
  loop
    update private.radar_cloud_tasks
    set status = 'queued',
        started_at = null
    where run_id = p_run_id
      and source_id = task.source_id;
    perform private.radar_cloud_dispatch_task(p_run_id, task.source_id);
    dispatched := dispatched + 1;
  end loop;

  return dispatched;
end
$$;

revoke all on function private.radar_cloud_redispatch_stale(uuid)
from public, anon, authenticated, service_role;

create or replace function private.start_radar_cloud_refresh()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_source_count integer;
  task record;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('ai-industry-radar-cloud-refresh')) then
    raise exception 'A radar cloud refresh start is already in progress.';
  end if;

  update private.radar_cloud_runs
  set
    status = 'failed',
    finished_at = now(),
    failure_reason = 'Cloud refresh exceeded the maximum run window.'
  where status = 'running'
    and started_at < now() - interval '30 minutes';

  select id
  into v_run_id
  from private.radar_cloud_runs
  where status = 'running'
  order by started_at desc
  limit 1;

  if v_run_id is not null then
    return v_run_id;
  end if;

  delete from private.radar_cloud_runs
  where started_at < now() - interval '30 days';

  select count(*)
  into v_source_count
  from public.sources
  where status = 'active'
    and url is not null
    and url ~* '^https?://';

  if v_source_count = 0 then
    raise exception 'No active public sources are registered.';
  end if;

  insert into private.radar_cloud_runs (expected_source_count)
  values (v_source_count)
  returning id into v_run_id;

  insert into private.radar_cloud_tasks (
    run_id,
    source_id,
    token_hash
  )
  select
    v_run_id,
    source.id,
    encode(
      extensions.digest(
        convert_to(private.radar_cloud_token(v_run_id, source.id), 'utf8'),
        'sha256'
      ),
      'hex'
    )
  from public.sources as source
  where source.status = 'active'
    and source.url is not null
    and source.url ~* '^https?://';

  for task in
    select cloud_task.source_id
    from private.radar_cloud_tasks as cloud_task
    where cloud_task.run_id = v_run_id
    order by cloud_task.source_id
  loop
    perform private.radar_cloud_dispatch_task(v_run_id, task.source_id);
  end loop;

  return v_run_id;
end
$$;

revoke all on function private.start_radar_cloud_refresh()
from public, anon, authenticated, service_role;

create or replace function public.radar_cloud_claim_task(
  p_run_id uuid,
  p_source_id uuid,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_payload jsonb;
begin
  update private.radar_cloud_tasks
  set
    status = 'processing',
    started_at = now()
  where run_id = p_run_id
    and source_id = p_source_id
    and token_hash = encode(
      extensions.digest(convert_to(p_token, 'utf8'), 'sha256'),
      'hex'
    )
    and (
      status = 'queued'
      or (
        status = 'processing'
        and started_at < now() - interval '90 seconds'
        and dispatch_attempts < 3
      )
    );

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'id', source.id,
    'slug', source.slug,
    'name', source.name,
    'name_en', source.name_en,
    'url', source.url,
    'rss_url', source.rss_url,
    'github_url', source.github_url,
    'podcast_url', source.podcast_url,
    'crawl_method', source.crawl_method,
    'category', source.category,
    'type', source.type,
    'language', source.language,
    'topics', source.topics,
    'tags', source.tags,
    'source_tier', source.source_tier,
    'weight', source.weight
  )
  into source_payload
  from public.sources as source
  where source.id = p_source_id
    and source.status = 'active';

  return source_payload;
end
$$;

revoke all on function public.radar_cloud_claim_task(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.radar_cloud_claim_task(uuid, uuid, text)
to service_role;

create or replace function private.radar_safe_timestamptz(
  p_value text
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return p_value::timestamptz;
exception
  when others then
    return null;
end
$$;

create or replace function private.radar_json_text_array(
  p_value jsonb
)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_agg(left(btrim(element.value), 120))
      filter (where btrim(element.value) <> ''),
    '{}'::text[]
  )
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(p_value) = 'array' then p_value
      else '[]'::jsonb
    end
  ) as element(value);
$$;

create or replace function private.radar_json_score(
  p_item jsonb,
  p_key text,
  p_default numeric
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  score numeric;
begin
  score := (p_item ->> p_key)::numeric;
  return least(1::numeric, greatest(0::numeric, score));
exception
  when others then
    return least(1::numeric, greatest(0::numeric, p_default));
end
$$;

revoke all on function private.radar_safe_timestamptz(text)
from public, anon, authenticated, service_role;
revoke all on function private.radar_json_text_array(jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.radar_json_score(jsonb, text, numeric)
from public, anon, authenticated, service_role;

create or replace function private.radar_cloud_finalize(
  p_run_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_status text;
  expected_count integer;
  finished_count integer;
  fatal_count integer;
  fetched_count integer;
  discovered_count integer;
  published_count integer := 0;
  task_item record;
  item jsonb;
  canonical_url text;
  item_title text;
  item_summary text;
  item_hash text;
  raw_item_id uuid;
  item_published_at timestamptz;
  item_language text;
  source_tier_label text;
begin
  select status, expected_source_count
  into run_status, expected_count
  from private.radar_cloud_runs
  where id = p_run_id
  for update;

  if run_status is null or run_status <> 'running' then
    return;
  end if;

  select
    count(*) filter (where status in ('completed', 'failed')),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'completed' and fetch_succeeded is true),
    coalesce(sum(item_count) filter (where status = 'completed'), 0)
  into finished_count, fatal_count, fetched_count, discovered_count
  from private.radar_cloud_tasks
  where run_id = p_run_id;

  update private.radar_cloud_runs
  set
    completed_source_count = finished_count,
    succeeded_source_count = fetched_count,
    failed_source_count = expected_count - fetched_count,
    discovered_item_count = discovered_count
  where id = p_run_id;

  if finished_count < expected_count then
    return;
  end if;

  if fatal_count > 0 then
    update private.radar_cloud_runs
    set
      status = 'failed',
      finished_at = now(),
      failure_reason = 'At least one cloud source task did not complete.'
    where id = p_run_id;
    return;
  end if;

  if fetched_count < greatest(1, ceil(expected_count * 0.60)::integer) then
    update private.radar_cloud_runs
    set
      status = 'failed',
      finished_at = now(),
      failure_reason = 'Too few registered sources completed a successful fetch.'
    where id = p_run_id;
    return;
  end if;

  if discovered_count = 0 then
    update private.radar_cloud_runs
    set
      status = 'failed',
      finished_at = now(),
      failure_reason = 'The completed source scan produced no reader items.'
    where id = p_run_id;
    return;
  end if;

  for task_item in
    select
      task.source_id,
      source.name as source_name,
      source.type as source_type,
      source.tier_label,
      source.source_tier,
      source.weight,
      source.crawl_method,
      entry.value as item
    from private.radar_cloud_tasks as task
    join public.sources as source on source.id = task.source_id
    cross join lateral jsonb_array_elements(task.result_items) as entry(value)
    where task.run_id = p_run_id
      and task.status = 'completed'
      and task.fetch_succeeded is true
    order by task.source_id
  loop
    item := task_item.item;
    canonical_url := left(btrim(coalesce(item ->> 'url', '')), 2000);
    item_title := left(btrim(regexp_replace(coalesce(item ->> 'title', ''), '\s+', ' ', 'g')), 500);
    item_summary := left(btrim(regexp_replace(coalesce(item ->> 'summary', item_title), '\s+', ' ', 'g')), 4000);

    if length(item_title) < 6
      or not public.radar_is_public_url(canonical_url)
    then
      continue;
    end if;

    item_published_at := private.radar_safe_timestamptz(item ->> 'published_at');
    item_language := case
      when item ->> 'language' in ('zh', 'en', 'mixed', 'unknown') then item ->> 'language'
      else 'unknown'
    end;
    source_tier_label := coalesce(
      nullif(task_item.tier_label, ''),
      'T' || coalesce(task_item.source_tier, 4)::text
    );
    item_hash := encode(
      extensions.digest(
        convert_to(
          task_item.source_id::text || chr(10) ||
          lower(canonical_url) || chr(10) ||
          item_title || chr(10) ||
          item_summary,
          'utf8'
        ),
        'sha256'
      ),
      'hex'
    );

    raw_item_id := null;
    insert into public.raw_items (
      source_id,
      external_id,
      url,
      canonical_url,
      title,
      published_at,
      retrieved_at,
      raw_text,
      raw_metadata,
      hash,
      language,
      local_id,
      collected_at,
      source_snapshot,
      source_tier,
      crawl_method,
      status,
      summary
    )
    values (
      task_item.source_id,
      canonical_url,
      canonical_url,
      canonical_url,
      item_title,
      item_published_at,
      now(),
      item_summary,
      jsonb_build_object('pipeline', 'supabase_edge_daily'),
      item_hash,
      item_language,
      'cloud:' || p_run_id::text || ':' || substr(item_hash, 1, 24),
      now(),
      jsonb_build_object(
        'source_name', task_item.source_name,
        'source_type', task_item.source_type,
        'source_tier', source_tier_label
      ),
      source_tier_label,
      task_item.crawl_method,
      'collected',
      item_summary
    )
    on conflict do nothing
    returning id into raw_item_id;

    if raw_item_id is null then
      continue;
    end if;

    insert into public.radar_items (
      raw_item_id,
      title,
      summary_zh,
      summary_en,
      topics,
      status,
      credibility_score,
      novelty_score,
      importance_score,
      local_id,
      source_id,
      source_name,
      url,
      published_at,
      collected_at,
      processed_at,
      language,
      ai_relevance_score,
      freshness_score,
      overall_score,
      categories,
      tags,
      source_tier,
      source_weight,
      confidence,
      understanding_status,
      why_it_matters,
      evidence_notes,
      model_metadata
    )
    values (
      raw_item_id,
      item_title,
      case when item_language in ('zh', 'mixed') then item_summary else null end,
      case when item_language in ('en', 'mixed', 'unknown') then item_summary else null end,
      private.radar_json_text_array(item -> 'categories'),
      'reviewed'::public.content_status,
      private.radar_json_score(item, 'credibility_score', 0.82),
      private.radar_json_score(item, 'novelty_score', 0.78),
      private.radar_json_score(item, 'importance_score', 0.82),
      'cloud:' || raw_item_id::text,
      task_item.source_id,
      task_item.source_name,
      canonical_url,
      item_published_at,
      now(),
      now(),
      item_language,
      private.radar_json_score(item, 'ai_relevance_score', 0.90),
      private.radar_json_score(item, 'freshness_score', 0.80),
      private.radar_json_score(item, 'overall_score', 0.84),
      private.radar_json_text_array(item -> 'categories'),
      private.radar_json_text_array(item -> 'tags'),
      source_tier_label,
      least(1::numeric, greatest(0::numeric, coalesce(task_item.weight, 0.6))),
      private.radar_json_score(item, 'confidence', 0.80),
      'included',
      left(nullif(btrim(item ->> 'why_it_matters'), ''), 1200),
      '{}'::text[],
      jsonb_build_object(
        'pipeline', 'supabase_edge_daily',
        'cloud_run_id', p_run_id
      )
    );

    published_count := published_count + 1;
  end loop;

  update private.radar_cloud_runs
  set
    status = 'published',
    published_item_count = published_count,
    finished_at = now(),
    published_at = now(),
    failure_reason = null
  where id = p_run_id;
end
$$;

revoke all on function private.radar_cloud_finalize(uuid)
from public, anon, authenticated, service_role;

create or replace function public.radar_cloud_complete_task(
  p_run_id uuid,
  p_source_id uuid,
  p_token text,
  p_fetch_succeeded boolean,
  p_items jsonb,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) > 5
    or octet_length(p_items::text) > 500000
  then
    raise exception 'Invalid cloud source result.';
  end if;

  update private.radar_cloud_tasks
  set
    status = 'completed',
    finished_at = now(),
    fetch_succeeded = p_fetch_succeeded,
    item_count = jsonb_array_length(p_items),
    result_items = p_items,
    error_message = left(nullif(btrim(p_error_message), ''), 500)
  where run_id = p_run_id
    and source_id = p_source_id
    and status = 'processing'
    and token_hash = encode(
      extensions.digest(convert_to(p_token, 'utf8'), 'sha256'),
      'hex'
    );

  if not found then
    raise exception 'Cloud source task is not claimable.';
  end if;

  update public.sources
  set last_checked_at = now()
  where id = p_source_id;

  perform private.radar_cloud_redispatch_stale(p_run_id);
  perform private.radar_cloud_finalize(p_run_id);
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.radar_cloud_complete_task(uuid, uuid, text, boolean, jsonb, text)
from public, anon, authenticated;
grant execute on function public.radar_cloud_complete_task(uuid, uuid, text, boolean, jsonb, text)
to service_role;

create or replace function public.radar_cloud_fail_task(
  p_run_id uuid,
  p_source_id uuid,
  p_token text,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.radar_cloud_tasks
  set
    status = 'failed',
    finished_at = now(),
    fetch_succeeded = false,
    item_count = 0,
    result_items = '[]'::jsonb,
    error_message = left(coalesce(nullif(btrim(p_error_message), ''), 'Cloud source task failed.'), 500)
  where run_id = p_run_id
    and source_id = p_source_id
    and status in ('queued', 'processing')
    and token_hash = encode(
      extensions.digest(convert_to(p_token, 'utf8'), 'sha256'),
      'hex'
    );

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  perform private.radar_cloud_redispatch_stale(p_run_id);
  perform private.radar_cloud_finalize(p_run_id);
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.radar_cloud_fail_task(uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.radar_cloud_fail_task(uuid, uuid, text, text)
to service_role;

do $$
declare
  target_job record;
begin
  for target_job in
    select jobid
    from cron.job
    where jobname like 'radar-%'
  loop
    perform cron.unschedule(target_job.jobid);
  end loop;
end
$$;

drop function if exists private.dispatch_radar_daily_production_refresh();
drop function if exists private.dispatch_radar_realtime_refresh();

select cron.schedule(
  'radar-daily-0900-supabase-cloud',
  '0 1 * * *',
  'select private.start_radar_cloud_refresh();'
);

notify pgrst, 'reload schema';
