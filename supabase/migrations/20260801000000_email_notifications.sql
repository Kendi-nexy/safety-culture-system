-- NOTE: the `alter database ... set app.settings.xxx` approach below
-- requires superuser privileges, which Supabase's hosted SQL Editor role
-- doesn't have. If you're running this fresh, skip straight to
-- 20260801000001_fix_email_settings_use_vault.sql instead — it replaces the
-- trigger/cron function bodies below with a version that uses Supabase
-- Vault, which doesn't hit this permission error. Still run everything
-- ABOVE the "Store the project URL..." comment below (columns, extensions,
-- trigger/cron creation) — just skip the two `alter database` lines and the
-- function bodies that reference current_setting(), since 000001 replaces
-- them anyway.
--
-- Adds what's needed to support email notifications:
--   1. reporter_email — captured on the report form so we have somewhere to
--      send the submission confirmation. Free text, not tied to an account
--      (matches the "no login needed" reporting design — see conversation
--      re: not adding a full employees table for this).
--   2. last_reminder_sent_at — prevents the overdue-reminder job from
--      re-emailing the same report every time it runs.
--   3. pg_net + pg_cron extensions — needed to call Edge Functions directly
--      from Postgres triggers/schedules (no external webhook dashboard
--      config required, it's all scriptable in SQL).
--   4. A trigger that fires the on-report-created Edge Function on every
--      insert into reports.
--   5. A cron schedule that fires the check-overdue-actions Edge Function
--      every 30 minutes.

alter table public.reports add column if not exists reporter_email text;
alter table public.reports add column if not exists last_reminder_sent_at timestamptz;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- Store the project URL + service role key as Postgres settings so the
-- trigger/cron functions below can call Edge Functions without hardcoding
-- secrets into the migration file itself. Set these once via SQL Editor:
--
--   alter database postgres set app.settings.project_url = 'https://xqxjyrswkqajpmswqmal.supabase.co';
--   alter database postgres set app.settings.service_role_key = '<your service role key, from Project Settings -> API>';
--
-- (Run those two lines separately, then reconnect / start a new SQL Editor
-- query — Postgres only picks up `alter database ... set` on new sessions.)

create or replace function public.trigger_on_report_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := current_setting('app.settings.project_url') || '/functions/v1/on-report-created',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_on_report_created on public.reports;
create trigger trg_notify_on_report_created
after insert on public.reports
for each row execute function public.trigger_on_report_created();

-- Scheduled overdue-reminder check, every 30 minutes.
select cron.schedule(
  'check-overdue-corrective-actions',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.project_url') || '/functions/v1/check-overdue-actions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
