-- Phase 7.7: public-safe read surface for server-side anon retrieval.
-- Apply after 202605140001_phase7_persistence.sql and
-- 202605140002_phase7_upsert_constraints.sql.
--
-- The app reads this view with the Supabase anon key. The view intentionally
-- exposes only retrieval fields for public-safe included/review rows and does
-- not grant anon access to raw_items, model metadata, operational logs, or
-- write-capable base tables.

create or replace view public.public_radar_items
with (security_invoker = false)
as
with projected_radar_items as (
  select
    r.id,
    r.local_id,
    coalesce(ri.local_id, r.local_id, r.id::text) as raw_item_id,
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
    r.evidence_notes,
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
)
select
  id,
  local_id,
  raw_item_id,
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
  evidence_notes,
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
  and public_host !~ '^192\.168\.'
  and public_host !~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.'
  and public_host !~ '(^|\.)local$'
  and public_host !~ '(^|[.-])(internal|intranet|corp|private|localhost)([.-]|$)'
  and source_status not in ('rejected', 'needs_public_url', 'deferred')
  and not (
    source_risk_flags && array[
      'needs_public_url',
      'private_url_removed',
      'image_only_contact_removed'
    ]::text[]
  );

comment on view public.public_radar_items is
  'Public-safe retrieval view for anon read-only Supabase access. Excludes raw text, raw metadata, model metadata, operational logs, private/source-health fields, and all write surfaces.';

revoke all on public.public_radar_items from public;
grant select on public.public_radar_items to anon, authenticated;
