-- Harden the public Data API boundary without exposing raw metadata.
-- Public views run with the caller's privileges; underlying roles receive only
-- the columns and rows required by those views.

create schema if not exists radar_private;
revoke all on schema radar_private from public, anon, authenticated;

alter table public.report_candidates
  add column if not exists public_report_draft jsonb;

alter table public.reports
  add column if not exists public_report_draft jsonb;

create or replace function radar_private.sync_report_candidate_public_draft()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  stored_report_draft jsonb := new.metadata -> 'report_draft';
begin
  if jsonb_typeof(stored_report_draft) <> 'object' then
    new.public_report_draft := null;
    return new;
  end if;

  new.public_report_draft := jsonb_strip_nulls(
    jsonb_build_object(
      'report_type', new.report_type,
      'status', new.status,
      'mode', 'saved_candidate',
      'title', coalesce(nullif(stored_report_draft ->> 'title', ''), new.title),
      'one_sentence_summary', coalesce(nullif(stored_report_draft ->> 'one_sentence_summary', ''), new.summary),
      'executive_summary', coalesce(nullif(stored_report_draft ->> 'executive_summary', ''), new.summary),
      'sections', stored_report_draft -> 'sections',
      'citations', stored_report_draft -> 'citations',
      'caveats', stored_report_draft -> 'caveats',
      'missing_evidence', stored_report_draft -> 'missing_evidence',
      'data_source', stored_report_draft ->> 'data_source',
      'time_window', coalesce(
        stored_report_draft -> 'time_window',
        jsonb_build_object(
          'start', new.time_window_start,
          'end', new.time_window_end,
          'explanation', 'Saved report workflow time window from Supabase.',
          'matched_phrase', 'saved report'
        )
      ),
      'generated_at', coalesce(stored_report_draft ->> 'generated_at', new.updated_at::text, new.created_at::text),
      'language', stored_report_draft ->> 'language',
      'markdown', '',
      'source_item_ids', coalesce(stored_report_draft -> 'source_item_ids', to_jsonb(new.source_item_ids)),
      'retrieved_item_count',
        case when stored_report_draft ->> 'retrieved_item_count' ~ '^[0-9]+$'
          then (stored_report_draft ->> 'retrieved_item_count')::integer end,
      'usable_item_count',
        case when stored_report_draft ->> 'usable_item_count' ~ '^[0-9]+$'
          then (stored_report_draft ->> 'usable_item_count')::integer end,
      'citation_count',
        case when stored_report_draft ->> 'citation_count' ~ '^[0-9]+$'
          then (stored_report_draft ->> 'citation_count')::integer end,
      'distinct_source_count',
        case when stored_report_draft ->> 'distinct_source_count' ~ '^[0-9]+$'
          then (stored_report_draft ->> 'distinct_source_count')::integer end,
      'category_count',
        case when stored_report_draft ->> 'category_count' ~ '^[0-9]+$'
          then (stored_report_draft ->> 'category_count')::integer end,
      'quality_gate_passed',
        case when stored_report_draft ->> 'quality_gate_passed' in ('true', 'false')
          then (stored_report_draft ->> 'quality_gate_passed')::boolean end,
      'quality_gate_reasons', stored_report_draft -> 'quality_gate_reasons',
      'quality_gate', stored_report_draft -> 'quality_gate'
    )
  );

  return new;
end;
$$;

create or replace function radar_private.sync_report_public_draft()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  stored_report_draft jsonb := new.metadata -> 'report_draft';
begin
  if jsonb_typeof(stored_report_draft) <> 'object' then
    new.public_report_draft := null;
    return new;
  end if;

  new.public_report_draft := jsonb_strip_nulls(
    jsonb_build_object(
      'report_type', new.type,
      'status', new.status::text,
      'mode', 'saved_report',
      'title', coalesce(nullif(stored_report_draft ->> 'title', ''), new.title),
      'one_sentence_summary', coalesce(nullif(stored_report_draft ->> 'one_sentence_summary', ''), new.body),
      'executive_summary', coalesce(nullif(stored_report_draft ->> 'executive_summary', ''), new.body),
      'sections', stored_report_draft -> 'sections',
      'citations', stored_report_draft -> 'citations',
      'caveats', stored_report_draft -> 'caveats',
      'missing_evidence', stored_report_draft -> 'missing_evidence',
      'data_source', stored_report_draft ->> 'data_source',
      'time_window', coalesce(
        stored_report_draft -> 'time_window',
        jsonb_build_object(
          'start', new.time_window_start,
          'end', new.time_window_end,
          'explanation', 'Saved report workflow time window from Supabase.',
          'matched_phrase', 'saved report'
        )
      ),
      'generated_at', coalesce(stored_report_draft ->> 'generated_at', new.published_at::text, new.created_at::text),
      'language', coalesce(nullif(stored_report_draft ->> 'language', ''), new.language),
      'markdown', '',
      'source_item_ids', stored_report_draft -> 'source_item_ids',
      'retrieved_item_count',
        case when stored_report_draft ->> 'retrieved_item_count' ~ '^[0-9]+$'
          then (stored_report_draft ->> 'retrieved_item_count')::integer end,
      'usable_item_count',
        case when stored_report_draft ->> 'usable_item_count' ~ '^[0-9]+$'
          then (stored_report_draft ->> 'usable_item_count')::integer end,
      'citation_count',
        case when stored_report_draft ->> 'citation_count' ~ '^[0-9]+$'
          then (stored_report_draft ->> 'citation_count')::integer end,
      'distinct_source_count',
        case when stored_report_draft ->> 'distinct_source_count' ~ '^[0-9]+$'
          then (stored_report_draft ->> 'distinct_source_count')::integer end,
      'category_count',
        case when stored_report_draft ->> 'category_count' ~ '^[0-9]+$'
          then (stored_report_draft ->> 'category_count')::integer end,
      'quality_gate_passed',
        case when stored_report_draft ->> 'quality_gate_passed' in ('true', 'false')
          then (stored_report_draft ->> 'quality_gate_passed')::boolean end,
      'quality_gate_reasons', stored_report_draft -> 'quality_gate_reasons',
      'quality_gate', stored_report_draft -> 'quality_gate'
    )
  );

  return new;
end;
$$;

revoke all on function radar_private.sync_report_candidate_public_draft() from public, anon, authenticated;
revoke all on function radar_private.sync_report_public_draft() from public, anon, authenticated;

drop trigger if exists report_candidates_sync_public_draft on public.report_candidates;
create trigger report_candidates_sync_public_draft
before insert or update of metadata, report_type, title, summary, time_window_start, time_window_end,
  source_item_ids, status, created_at, updated_at
on public.report_candidates
for each row execute function radar_private.sync_report_candidate_public_draft();

drop trigger if exists reports_sync_public_draft on public.reports;
create trigger reports_sync_public_draft
before insert or update of metadata, type, title, language, time_window_start, time_window_end,
  body, status, created_at, published_at
on public.reports
for each row execute function radar_private.sync_report_public_draft();

-- Backfill through the same allowlist used by future writes. The source values
-- are assigned to themselves so business timestamps and statuses are unchanged.
update public.report_candidates set metadata = metadata;
update public.reports set metadata = metadata;

create or replace function public.radar_is_public_url(candidate text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  with url_parts as (
    select
      split_part(regexp_replace(coalesce(candidate, ''), '^https?://', '', 'i'), '/', 1) as authority
  ), host_parts as (
    select
      authority,
      lower(split_part(split_part(authority, '@', 2), ':', 1)) as host_after_at,
      lower(split_part(authority, ':', 1)) as host_without_at
    from url_parts
  ), normalized as (
    select authority, case when position('@' in authority) > 0 then host_after_at else host_without_at end as host
    from host_parts
  )
  select
    coalesce(candidate, '') ~* '^https?://'
    and authority <> ''
    and position('@' in authority) = 0
    and authority !~* '^\[::1\]'
    and host <> ''
    and host not in ('localhost', '127.0.0.1', '0.0.0.0', '::1')
    and host !~ '^(10|127)\.'
    and host !~ '^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.'
    and host !~ '^169\.254\.'
    and host !~ '^192\.168\.'
    and host !~ '^192\.0\.(0|2)\.'
    and host !~ '^198\.(18|19)\.'
    and host !~ '^198\.51\.100\.'
    and host !~ '^203\.0\.113\.'
    and host !~ '^(22[4-9]|23[0-9])\.'
    and host !~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.'
    and host ~ '\.'
    and host !~ '(^|\.)local$'
    and host !~ '(^|[.-])(internal|intranet|corp|private|localhost)([.-]|$)'
    and candidate !~* '[?&]([^=&#]*(credential|secret|session|signature|signed|token)[^=&#]*|access_token|apikey|api_key|auth|awsaccesskeyid|code|expires|jwt|key|password|sig|x-amz-[^=&#]*)='
  from normalized;
$$;

revoke all on function public.radar_is_public_url(text) from public;
grant execute on function public.radar_is_public_url(text) to anon, authenticated, service_role;

create or replace view public.public_report_candidates
with (security_invoker = true)
as
select
  id,
  report_type,
  title,
  summary,
  time_window_start,
  time_window_end,
  source_item_ids,
  status,
  confidence,
  created_at,
  updated_at,
  public_report_draft as report_draft
from public.report_candidates
where report_type in ('daily', 'weekly')
  and status in ('needs_review', 'approved', 'published');

comment on view public.public_report_candidates is
  'Public-safe security-invoker view for daily/weekly report candidates. Uses a trigger-maintained allowlist projection and never grants callers access to raw report metadata.';

create or replace view public.public_reports
with (security_invoker = true)
as
select
  id,
  type,
  title,
  language,
  time_window_start,
  time_window_end,
  body,
  status::text as status,
  created_at,
  published_at,
  public_report_draft as report_draft
from public.reports
where type in ('daily', 'weekly')
  and status in ('reviewed', 'published');

comment on view public.public_reports is
  'Public-safe security-invoker view for reviewed/published daily and weekly reports. Uses a trigger-maintained allowlist projection and never grants callers access to raw report metadata.';

create or replace view public.public_radar_items
with (security_invoker = true)
as
with entity_projection as (
  select
    ie.radar_item_id,
    jsonb_agg(
      distinct jsonb_build_object(
        'name', e.name,
        'type', e.type,
        'confidence', least(greatest(coalesce(ie.confidence, 0.5), 0), 1)
      )
    ) filter (where e.name is not null and e.name <> '') as entities
  from public.item_entities ie
  join public.entities e on e.id = ie.entity_id
  group by ie.radar_item_id
), projected_radar_items as (
  select
    r.id,
    r.local_id,
    coalesce(s.slug, r.source_id::text, 'unknown') as source_id,
    coalesce(nullif(r.source_name, ''), s.name, 'Unknown source') as source_name,
    r.title,
    r.url,
    r.published_at,
    coalesce(r.collected_at, r.published_at, r.created_at) as collected_at,
    coalesce(r.processed_at, r.updated_at, r.collected_at, r.published_at, r.created_at) as processed_at,
    r.language,
    r.summary_zh,
    r.summary_en,
    coalesce(nullif(r.topics, '{}'::text[]), nullif(r.categories, '{}'::text[]), '{}'::text[]) as topics,
    coalesce(nullif(r.categories, '{}'::text[]), nullif(r.topics, '{}'::text[]), '{}'::text[]) as categories,
    r.tags,
    r.status::text as status,
    coalesce(
      r.understanding_status,
      case
        when r.status in ('reviewed', 'published') then 'included'
        when r.status = 'draft' then 'needs_review'
        else null
      end
    ) as understanding_status,
    r.exclusion_reason,
    r.ai_relevance_score,
    r.importance_score,
    r.credibility_score,
    r.novelty_score,
    r.freshness_score,
    r.overall_score,
    coalesce(r.source_tier, s.tier_label, 'T' || s.source_tier::text, 'unreviewed') as source_tier,
    coalesce(r.source_weight, s.weight, 0) as source_weight,
    r.confidence,
    r.why_it_matters,
    coalesce(ep.entities, '[]'::jsonb) as entities,
    r.created_at,
    r.updated_at,
    coalesce(s.status::text, 'active') as source_status,
    coalesce(s.risk_flags, '{}'::text[]) as source_risk_flags
  from public.radar_items r
  left join public.sources s on s.id = r.source_id
  left join entity_projection ep on ep.radar_item_id = r.id
)
select
  id,
  local_id,
  source_id,
  source_name,
  title,
  url,
  published_at,
  collected_at,
  processed_at,
  language,
  summary_zh,
  summary_en,
  topics,
  categories,
  tags,
  status,
  understanding_status,
  exclusion_reason,
  ai_relevance_score,
  importance_score,
  credibility_score,
  novelty_score,
  freshness_score,
  overall_score,
  source_tier,
  source_weight,
  confidence,
  why_it_matters,
  entities,
  created_at,
  updated_at
from projected_radar_items
where understanding_status in ('included', 'needs_review')
  and public.radar_is_public_url(url)
  and source_status not in ('rejected', 'needs_public_url', 'deferred')
  and not (
    source_risk_flags && array[
      'needs_public_url',
      'private_url_removed',
      'image_only_contact_removed'
    ]::text[]
  );

comment on view public.public_radar_items is
  'Public-safe security-invoker radar view. Exposes an explicit display allowlist and never exposes raw identifiers, raw content, private metadata, free-form evidence notes, or operational fields.';

alter table public.sources enable row level security;
alter table public.radar_items enable row level security;
alter table public.item_entities enable row level security;
alter table public.entities enable row level security;
alter table public.report_candidates enable row level security;
alter table public.reports enable row level security;

drop policy if exists sources_public_read on public.sources;
create policy sources_public_read
on public.sources for select
to anon, authenticated
using (
  status::text not in ('rejected', 'needs_public_url', 'deferred')
  and not (
    risk_flags && array[
      'needs_public_url',
      'private_url_removed',
      'image_only_contact_removed'
    ]::text[]
  )
);

drop policy if exists radar_items_public_read on public.radar_items;
create policy radar_items_public_read
on public.radar_items for select
to anon, authenticated
using (
  coalesce(
    understanding_status,
    case
      when status in ('reviewed', 'published') then 'included'
      when status = 'draft' then 'needs_review'
      else null
    end
  ) in ('included', 'needs_review')
  and public.radar_is_public_url(url)
  and (
    source_id is null
    or exists (
      select 1 from public.sources s where s.id = radar_items.source_id
    )
  )
);

drop policy if exists item_entities_public_read on public.item_entities;
create policy item_entities_public_read
on public.item_entities for select
to anon, authenticated
using (
  exists (
    select 1 from public.radar_items r where r.id = item_entities.radar_item_id
  )
);

drop policy if exists entities_public_read on public.entities;
create policy entities_public_read
on public.entities for select
to anon, authenticated
using (
  exists (
    select 1 from public.item_entities ie where ie.entity_id = entities.id
  )
);

drop policy if exists report_candidates_public_read on public.report_candidates;
create policy report_candidates_public_read
on public.report_candidates for select
to anon, authenticated
using (
  report_type in ('daily', 'weekly')
  and status in ('needs_review', 'approved', 'published')
);

drop policy if exists reports_public_read on public.reports;
create policy reports_public_read
on public.reports for select
to anon, authenticated
using (
  type in ('daily', 'weekly')
  and status in ('reviewed', 'published')
);

revoke all on public.sources from public, anon, authenticated;
revoke all on public.radar_items from public, anon, authenticated;
revoke all on public.item_entities from public, anon, authenticated;
revoke all on public.entities from public, anon, authenticated;
revoke all on public.report_candidates from public, anon, authenticated;
revoke all on public.reports from public, anon, authenticated;

grant select (id, slug, name, status, source_tier, tier_label, weight, risk_flags)
  on public.sources to anon, authenticated;

grant select (
  id, local_id, source_id, source_name, title, url, published_at, collected_at,
  processed_at, language, summary_zh, summary_en, topics, categories, tags,
  status, understanding_status, exclusion_reason, ai_relevance_score,
  importance_score, credibility_score, novelty_score, freshness_score,
  overall_score, source_tier, source_weight, confidence, why_it_matters,
  created_at, updated_at
) on public.radar_items to anon, authenticated;

grant select (radar_item_id, entity_id, confidence)
  on public.item_entities to anon, authenticated;

grant select (id, name, type)
  on public.entities to anon, authenticated;

grant select (
  id, report_type, title, summary, time_window_start, time_window_end,
  source_item_ids, status, confidence, created_at, updated_at, public_report_draft
) on public.report_candidates to anon, authenticated;

grant select (
  id, type, title, language, time_window_start, time_window_end, body, status,
  created_at, published_at, public_report_draft
) on public.reports to anon, authenticated;

revoke all on public.public_radar_items from public, anon, authenticated;
revoke all on public.public_report_candidates from public, anon, authenticated;
revoke all on public.public_reports from public, anon, authenticated;

grant select on public.public_radar_items to anon, authenticated;
grant select on public.public_report_candidates to anon, authenticated;
grant select on public.public_reports to anon, authenticated;

notify pgrst, 'reload schema';
