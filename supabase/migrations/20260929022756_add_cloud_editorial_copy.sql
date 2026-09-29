-- Reader copy is published in the same transaction as the complete source scan.
alter table public.radar_items add column if not exists title_zh text;

create or replace function public.radar_cloud_editorial_key()
returns text language sql security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'radar_deepseek_editorial_key' limit 1;
$$;
revoke all on function public.radar_cloud_editorial_key() from public, anon, authenticated;
grant execute on function public.radar_cloud_editorial_key() to service_role;

create or replace function public.radar_cloud_set_editorial_key(p_key text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare secret_id uuid;
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 256 then
    raise exception 'Invalid editorial credential';
  end if;
  select id into secret_id from vault.secrets where name = 'radar_deepseek_editorial_key';
  if secret_id is null then
    perform vault.create_secret(p_key, 'radar_deepseek_editorial_key', 'Cloud-only reader copy');
  else
    perform vault.update_secret(secret_id, p_key);
  end if;
  return true;
end;
$$;
revoke all on function public.radar_cloud_set_editorial_key(text) from public, anon, authenticated;
grant execute on function public.radar_cloud_set_editorial_key(text) to service_role;

alter function private.radar_cloud_finalize(uuid) rename to radar_cloud_finalize_source_rows;
create function private.radar_cloud_finalize(p_run_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.radar_cloud_finalize_source_rows(p_run_id);
  if not exists (select 1 from private.radar_cloud_runs where id = p_run_id and status = 'published') then
    return;
  end if;
  -- Includes deduplicated existing articles; unchanged copy does not advance time.
  update public.radar_items as radar
  set title_zh = incoming.item ->> 'title_zh',
      summary_zh = incoming.item ->> 'summary_zh',
      why_it_matters = nullif(incoming.item ->> 'why_it_matters', ''),
      processed_at = now(),
      updated_at = now(),
      model_metadata = coalesce(radar.model_metadata, '{}'::jsonb) || jsonb_build_object(
        'editorial_version', incoming.item ->> 'editorial_version',
        'editorial_hash', incoming.item ->> 'editorial_hash'
      )
  from (
    select task.source_id, entry.value as item
    from private.radar_cloud_tasks task
    cross join lateral jsonb_array_elements(task.result_items) entry(value)
    where task.run_id = p_run_id and task.status = 'completed' and task.fetch_succeeded
      and entry.value ->> 'editorial_version' = 'reader-zh-v1'
      and length(entry.value ->> 'title_zh') between 5 and 80
      and length(entry.value ->> 'summary_zh') between 10 and 320
      and entry.value ->> 'editorial_hash' ~ '^[0-9a-f]{64}$'
  ) incoming
  where radar.source_id = incoming.source_id
    and radar.url = incoming.item ->> 'url'
    and radar.title = incoming.item ->> 'title'
    and (radar.title_zh, radar.summary_zh, radar.why_it_matters, radar.model_metadata ->> 'editorial_hash')
      is distinct from (incoming.item ->> 'title_zh', incoming.item ->> 'summary_zh', nullif(incoming.item ->> 'why_it_matters', ''), incoming.item ->> 'editorial_hash');
end;
$$;
revoke all on function private.radar_cloud_finalize(uuid) from public, anon, authenticated, service_role;

-- Append the public copy field without changing existing view columns or RLS.
create or replace view public.public_radar_items with (security_invoker = true) as
with entity_projection as (
  select ie.radar_item_id,
    jsonb_agg(distinct jsonb_build_object('name', e.name, 'type', e.type,
      'confidence', least(greatest(coalesce(ie.confidence, 0.5), 0::numeric), 1::numeric)))
      filter (where e.name is not null and e.name <> '') as entities
  from public.item_entities ie join public.entities e on e.id = ie.entity_id
  group by ie.radar_item_id
), projected_radar_items as (
  select r.id, r.local_id, coalesce(s.slug, r.source_id::text, 'unknown') as source_id,
    coalesce(nullif(r.source_name, ''), s.name, 'Unknown source') as source_name,
    r.title, r.url, r.published_at,
    coalesce(r.collected_at, r.published_at, r.created_at) as collected_at,
    coalesce(r.processed_at, r.updated_at, r.collected_at, r.published_at, r.created_at) as processed_at,
    r.language, r.summary_zh, r.summary_en,
    coalesce(nullif(r.topics, '{}'::text[]), nullif(r.categories, '{}'::text[]), '{}'::text[]) as topics,
    coalesce(nullif(r.categories, '{}'::text[]), nullif(r.topics, '{}'::text[]), '{}'::text[]) as categories,
    r.tags, r.status::text as status,
    coalesce(r.understanding_status, case
      when r.status = any(array['reviewed'::public.content_status, 'published'::public.content_status]) then 'included'
      when r.status = 'draft'::public.content_status then 'needs_review' else null end) as understanding_status,
    r.exclusion_reason, r.ai_relevance_score, r.importance_score, r.credibility_score,
    r.novelty_score, r.freshness_score, r.overall_score,
    coalesce(r.source_tier, s.tier_label, 'T' || s.source_tier::text, 'unreviewed') as source_tier,
    coalesce(r.source_weight, s.weight, 0::numeric) as source_weight,
    r.confidence, r.why_it_matters, coalesce(ep.entities, '[]'::jsonb) as entities,
    r.created_at, r.updated_at, coalesce(s.status::text, 'active') as source_status,
    coalesce(s.risk_flags, '{}'::text[]) as source_risk_flags, r.title_zh
  from public.radar_items r left join public.sources s on s.id = r.source_id
  left join entity_projection ep on ep.radar_item_id = r.id
)
select id, local_id, source_id, source_name, title, url, published_at, collected_at,
  processed_at, language, summary_zh, summary_en, topics, categories, tags, status,
  understanding_status, exclusion_reason, ai_relevance_score, importance_score,
  credibility_score, novelty_score, freshness_score, overall_score, source_tier,
  source_weight, confidence, why_it_matters, entities, created_at, updated_at, title_zh
from projected_radar_items
where understanding_status = any(array['included', 'needs_review'])
  and public.radar_is_public_url(url)
  and source_status <> all(array['rejected', 'needs_public_url', 'deferred'])
  and not source_risk_flags && array['needs_public_url', 'private_url_removed', 'image_only_contact_removed'];
