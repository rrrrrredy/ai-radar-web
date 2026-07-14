-- Public-safe entity projection for AI Radar retrieval.
-- Exposes only entity name/type/confidence on public_radar_items.
-- Does not expose free-form evidence notes, item_entities.evidence_text, or private/raw fields.

drop view if exists public.public_radar_items;

create or replace view public.public_radar_items
with (security_invoker = false)
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
),
projected_radar_items as (
  select
    r.id,
    r.local_id,
    coalesce(s.slug, r.source_id::text, 'unknown') as source_id,
    coalesce(nullif(r.source_name, ''), s.name, 'Unknown source') as source_name,
    r.title,
    r.url,
    r.published_at,
    coalesce(r.collected_at, ri.collected_at, ri.retrieved_at, r.created_at) as collected_at,
    coalesce(r.processed_at, r.updated_at, r.collected_at, ri.retrieved_at, r.created_at) as processed_at,
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
    coalesce(s.risk_flags, '{}'::text[]) as source_risk_flags,
    split_part(regexp_replace(coalesce(r.url, ''), '^https?://', '', 'i'), '/', 1) as public_authority,
    lower(
      split_part(
        split_part(regexp_replace(coalesce(r.url, ''), '^https?://', '', 'i'), '/', 1),
        ':',
        1
      )
    ) as public_host
  from public.radar_items r
  left join public.raw_items ri on ri.id = r.raw_item_id
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
  and url ~* '^https?://'
  and public_host <> ''
  and position('@' in public_authority) = 0
  and public_authority !~* '^\[::1\]'
  and public_host not in ('localhost', '127.0.0.1', '0.0.0.0', '::1')
  and public_host !~ '^(10|127)\.'
  and public_host !~ '^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.'
  and public_host !~ '^169\.254\.'
  and public_host !~ '^192\.168\.'
  and public_host !~ '^192\.0\.(0|2)\.'
  and public_host !~ '^198\.(18|19)\.'
  and public_host !~ '^198\.51\.100\.'
  and public_host !~ '^203\.0\.113\.'
  and public_host !~ '^(22[4-9]|23[0-9])\.'
  and public_host !~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.'
  and public_host ~ '\.'
  and public_host !~ '(^|\.)local$'
  and public_host !~ '(^|[.-])(internal|intranet|corp|private|localhost)([.-]|$)'
  and url !~* '[?&]([^=&#]*(credential|secret|session|signature|signed|token)[^=&#]*|access_token|apikey|api_key|auth|awsaccesskeyid|code|expires|jwt|key|password|sig|x-amz-[^=&#]*)='
  and source_status not in ('rejected', 'needs_public_url', 'deferred')
  and not (
    source_risk_flags && array[
      'needs_public_url',
      'private_url_removed',
      'image_only_contact_removed'
    ]::text[]
  );

comment on view public.public_radar_items is
  'Public-safe retrieval view for anon read-only Supabase access. Exposes public radar fields and entity name/type/confidence only; excludes raw item identifiers, raw text, raw metadata, model metadata, free-form evidence notes, entity evidence text, operational logs, private/source-health fields, sensitive query URLs, and all write surfaces.';

revoke all on public.public_radar_items from public;
grant select on public.public_radar_items to anon, authenticated;
