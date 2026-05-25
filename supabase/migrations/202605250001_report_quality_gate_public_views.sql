-- Milestone M: expose report quality-gate fields through public-safe report views.
-- This only refreshes read-only display projections. It does not grant write access.

create or replace view public.public_report_candidates
with (security_invoker = false)
as
with candidate_rows as (
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
    metadata -> 'report_draft' as stored_report_draft
  from public.report_candidates
  where report_type in ('daily', 'weekly')
    and status in ('draft', 'needs_review', 'approved', 'deferred', 'published')
)
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
  case
    when jsonb_typeof(stored_report_draft) = 'object' then
      jsonb_strip_nulls(
        jsonb_build_object(
          'report_type', report_type,
          'status', status,
          'mode', 'saved_candidate',
          'title', coalesce(nullif(stored_report_draft ->> 'title', ''), title),
          'one_sentence_summary', coalesce(nullif(stored_report_draft ->> 'one_sentence_summary', ''), summary),
          'executive_summary', coalesce(nullif(stored_report_draft ->> 'executive_summary', ''), summary),
          'sections', stored_report_draft -> 'sections',
          'citations', stored_report_draft -> 'citations',
          'caveats', stored_report_draft -> 'caveats',
          'missing_evidence', stored_report_draft -> 'missing_evidence',
          'data_source', stored_report_draft ->> 'data_source',
          'time_window', coalesce(
            stored_report_draft -> 'time_window',
            jsonb_build_object(
              'start', time_window_start,
              'end', time_window_end,
              'explanation', 'Saved report workflow time window from Supabase.',
              'matched_phrase', 'saved report'
            )
          ),
          'generated_at', coalesce(stored_report_draft ->> 'generated_at', updated_at::text, created_at::text),
          'language', stored_report_draft ->> 'language',
          'markdown', stored_report_draft ->> 'markdown',
          'source_item_ids', coalesce(stored_report_draft -> 'source_item_ids', to_jsonb(source_item_ids)),
          'retrieved_item_count',
            case
              when stored_report_draft ->> 'retrieved_item_count' ~ '^[0-9]+$'
                then (stored_report_draft ->> 'retrieved_item_count')::integer
              else null
            end,
          'usable_item_count',
            case
              when stored_report_draft ->> 'usable_item_count' ~ '^[0-9]+$'
                then (stored_report_draft ->> 'usable_item_count')::integer
              else null
            end,
          'citation_count',
            case
              when stored_report_draft ->> 'citation_count' ~ '^[0-9]+$'
                then (stored_report_draft ->> 'citation_count')::integer
              else null
            end,
          'distinct_source_count',
            case
              when stored_report_draft ->> 'distinct_source_count' ~ '^[0-9]+$'
                then (stored_report_draft ->> 'distinct_source_count')::integer
              else null
            end,
          'category_count',
            case
              when stored_report_draft ->> 'category_count' ~ '^[0-9]+$'
                then (stored_report_draft ->> 'category_count')::integer
              else null
            end,
          'quality_gate_passed',
            case
              when stored_report_draft ->> 'quality_gate_passed' in ('true', 'false')
                then (stored_report_draft ->> 'quality_gate_passed')::boolean
              else null
            end,
          'quality_gate_reasons', stored_report_draft -> 'quality_gate_reasons',
          'quality_gate', stored_report_draft -> 'quality_gate'
        )
      )
    else null
  end as report_draft
from candidate_rows;

comment on view public.public_report_candidates is
  'Public-safe read-only display view for daily/weekly report candidates. Exposes candidate display fields and allowlisted report quality-gate metadata; excludes workflow actors, review notes, raw model metadata, operational metadata, secrets, and write access.';

revoke all on public.public_report_candidates from public;
grant select on public.public_report_candidates to anon, authenticated;

create or replace view public.public_reports
with (security_invoker = false)
as
with report_rows as (
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
    metadata -> 'report_draft' as stored_report_draft
  from public.reports
  where type in ('daily', 'weekly')
    and status in ('draft', 'reviewed', 'published')
)
select
  id,
  type,
  title,
  language,
  time_window_start,
  time_window_end,
  body,
  status,
  created_at,
  published_at,
  case
    when jsonb_typeof(stored_report_draft) = 'object' then
      jsonb_strip_nulls(
        jsonb_build_object(
          'report_type', type,
          'status', status,
          'mode', 'saved_report',
          'title', coalesce(nullif(stored_report_draft ->> 'title', ''), title),
          'one_sentence_summary', coalesce(nullif(stored_report_draft ->> 'one_sentence_summary', ''), body),
          'executive_summary', coalesce(nullif(stored_report_draft ->> 'executive_summary', ''), body),
          'sections', stored_report_draft -> 'sections',
          'citations', stored_report_draft -> 'citations',
          'caveats', stored_report_draft -> 'caveats',
          'missing_evidence', stored_report_draft -> 'missing_evidence',
          'data_source', stored_report_draft ->> 'data_source',
          'time_window', coalesce(
            stored_report_draft -> 'time_window',
            jsonb_build_object(
              'start', time_window_start,
              'end', time_window_end,
              'explanation', 'Saved report workflow time window from Supabase.',
              'matched_phrase', 'saved report'
            )
          ),
          'generated_at', coalesce(stored_report_draft ->> 'generated_at', published_at::text, created_at::text),
          'language', coalesce(nullif(stored_report_draft ->> 'language', ''), language),
          'markdown', stored_report_draft ->> 'markdown',
          'source_item_ids', stored_report_draft -> 'source_item_ids',
          'retrieved_item_count',
            case
              when stored_report_draft ->> 'retrieved_item_count' ~ '^[0-9]+$'
                then (stored_report_draft ->> 'retrieved_item_count')::integer
              else null
            end,
          'usable_item_count',
            case
              when stored_report_draft ->> 'usable_item_count' ~ '^[0-9]+$'
                then (stored_report_draft ->> 'usable_item_count')::integer
              else null
            end,
          'citation_count',
            case
              when stored_report_draft ->> 'citation_count' ~ '^[0-9]+$'
                then (stored_report_draft ->> 'citation_count')::integer
              else null
            end,
          'distinct_source_count',
            case
              when stored_report_draft ->> 'distinct_source_count' ~ '^[0-9]+$'
                then (stored_report_draft ->> 'distinct_source_count')::integer
              else null
            end,
          'category_count',
            case
              when stored_report_draft ->> 'category_count' ~ '^[0-9]+$'
                then (stored_report_draft ->> 'category_count')::integer
              else null
            end,
          'quality_gate_passed',
            case
              when stored_report_draft ->> 'quality_gate_passed' in ('true', 'false')
                then (stored_report_draft ->> 'quality_gate_passed')::boolean
              else null
            end,
          'quality_gate_reasons', stored_report_draft -> 'quality_gate_reasons',
          'quality_gate', stored_report_draft -> 'quality_gate'
        )
      )
    else null
  end as report_draft
from report_rows;

comment on view public.public_reports is
  'Public-safe read-only display view for daily/weekly reports. Exposes report display fields and allowlisted report quality-gate metadata; excludes workflow actors, raw model metadata, operational metadata, secrets, and write access.';

revoke all on public.public_reports from public;
grant select on public.public_reports to anon, authenticated;

notify pgrst, 'reload schema';
