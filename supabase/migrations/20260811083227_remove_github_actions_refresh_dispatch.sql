do $$
declare
  target_job record;
begin
  for target_job in
    select jobid
    from cron.job
    where jobname in (
      'radar-daily-0900-production-github-dispatch',
      'radar-near-real-time-github-dispatch'
    )
  loop
    perform cron.unschedule(target_job.jobid);
  end loop;
end
$$;

drop function if exists private.dispatch_radar_daily_production_refresh();
drop function if exists private.dispatch_radar_realtime_refresh();
