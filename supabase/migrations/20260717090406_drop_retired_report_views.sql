drop view if exists public.public_report_candidates;
drop view if exists public.public_reports;

notify pgrst, 'reload schema';
