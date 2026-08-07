-- v2.641 audit 2.8 follow-up: 30-day retention on client_errors.
--
-- Telemetry rows are triage material, not records — after 30 days they're
-- either fixed or noise, and storage is billable. pg_cron deletes nightly
-- at 03:30 UTC (off-peak). Ships with both local Docker Supabase and
-- hosted; the DO-block guard keeps the migration chain alive on any
-- environment where pg_cron can't load (retention then just doesn't run —
-- a warning in the migration output, not a failure).
--
-- Adjust the window by re-running cron.schedule with a new interval;
-- same jobname replaces the old schedule.

do $$
begin
  create extension if not exists pg_cron;

  if exists (select 1 from cron.job where jobname = 'client_errors_retention') then
    perform cron.unschedule('client_errors_retention');
  end if;

  perform cron.schedule(
    'client_errors_retention',
    '30 3 * * *',
    $job$ delete from public.client_errors where occurred_at < now() - interval '30 days' $job$
  );
exception when others then
  raise warning 'client_errors retention not scheduled (pg_cron unavailable?): %', sqlerrm;
end $$;
