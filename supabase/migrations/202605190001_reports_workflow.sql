-- Milestone B: public-safe report workflow reads and report-candidate deferral.
-- Review and apply manually. This migration does not grant browser writes.

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.report_candidates'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%'
    and pg_get_constraintdef(oid) ilike '%needs_review%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.report_candidates drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.report_candidates
  add constraint report_candidates_status_check
  check (status in ('draft', 'needs_review', 'approved', 'deferred', 'rejected', 'published'));

create or replace view public.public_report_candidates
with (security_invoker = false)
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
  metadata -> 'report_draft' as report_draft
from public.report_candidates
where report_type in ('daily', 'weekly')
  and status in ('draft', 'needs_review', 'approved', 'deferred', 'published');

comment on view public.public_report_candidates is
  'Public-safe daily/weekly report candidate display view. Exposes only candidate display fields and metadata.report_draft, not admin review notes or write access.';

revoke all on public.public_report_candidates from public;
grant select on public.public_report_candidates to anon, authenticated;

create or replace view public.public_reports
with (security_invoker = false)
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
  metadata -> 'report_draft' as report_draft
from public.reports
where type in ('daily', 'weekly')
  and status in ('draft', 'reviewed', 'published');

comment on view public.public_reports is
  'Public-safe daily/weekly report display view for draft, reviewed, and published reports. Browser writes are not granted.';

revoke all on public.public_reports from public;
grant select on public.public_reports to anon, authenticated;
