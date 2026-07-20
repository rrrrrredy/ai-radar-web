revoke all privileges on table public.report_candidates from anon, authenticated;
revoke all privileges on table public.reports from anon, authenticated;

drop policy if exists report_candidates_public_read on public.report_candidates;
drop policy if exists report_candidates_select_admin_editor on public.report_candidates;
drop policy if exists reports_public_read on public.reports;
