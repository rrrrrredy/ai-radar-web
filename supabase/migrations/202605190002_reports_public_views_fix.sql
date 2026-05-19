-- Milestone B fix: refresh the public-safe report read views used by /reports.
-- This migration intentionally grants read access only to public display views.
-- It does not grant write access or anon access to the underlying workflow tables.

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
          'model_metadata', jsonb_build_object(
            'provider',
              case
                when stored_report_draft #>> '{model_metadata,provider}' in ('deterministic', 'deepseek', 'supabase')
                  then stored_report_draft #>> '{model_metadata,provider}'
                else 'supabase'
              end,
            'mode', 'saved_candidate',
            'api_call_count',
              case
                when stored_report_draft #>> '{model_metadata,api_call_count}' ~ '^[0-9]+$'
                  then (stored_report_draft #>> '{model_metadata,api_call_count}')::integer
                else 0
              end
          ),
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
            end
        )
      )
    else null
  end as report_draft
from candidate_rows;

comment on view public.public_report_candidates is
  'Public-safe read-only display view for daily/weekly report candidates. Exposes candidate display fields and an allowlisted report_draft projection only; excludes workflow actors, review notes, raw model metadata, operational metadata, secrets, and write access.';

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
          'model_metadata', jsonb_build_object(
            'provider',
              case
                when stored_report_draft #>> '{model_metadata,provider}' in ('deterministic', 'deepseek', 'supabase')
                  then stored_report_draft #>> '{model_metadata,provider}'
                else 'supabase'
              end,
            'mode', 'saved_report',
            'api_call_count',
              case
                when stored_report_draft #>> '{model_metadata,api_call_count}' ~ '^[0-9]+$'
                  then (stored_report_draft #>> '{model_metadata,api_call_count}')::integer
                else 0
              end
          ),
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
            end
        )
      )
    else null
  end as report_draft
from report_rows;

comment on view public.public_reports is
  'Public-safe read-only display view for daily/weekly reports. Exposes report display fields and an allowlisted report_draft projection only; excludes workflow actors, raw model metadata, operational metadata, secrets, and write access.';

revoke all on public.public_reports from public;
grant select on public.public_reports to anon, authenticated;

notify pgrst, 'reload schema';
