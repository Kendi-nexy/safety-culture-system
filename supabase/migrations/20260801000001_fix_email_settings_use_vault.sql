-- Fixes a permission error from the previous migration's setup instructions:
-- `alter database postgres set app.settings.xxx` requires superuser, which
-- Supabase's hosted SQL Editor role doesn't have — it fails with
-- "permission denied to set parameter". Custom GUC settings like that were
-- never a real option on hosted Supabase.
--
-- Fix: use Supabase Vault (built for exactly this — storing a secret that a
-- trigger/function needs, without superuser). The project URL isn't
-- actually sensitive (it's already public in the app's .env), so that's
-- just hardcoded directly instead of round-tripping through a setting.
--
-- BEFORE running this file, store your service role key in Vault (run this
-- part separately, once, with your real key):
--
--   select vault.create_secret(
--     '<paste your service_role key from Project Settings -> API>',
--     'service_role_key',
--     'Used by pg_net triggers to call Edge Functions'
--   );
--
-- Then run the rest of this file.

create or replace function public.trigger_on_report_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  service_key text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  perform net.http_post(
    url := 'https://xqxjyrswkqajpmswqmal.supabase.co/functions/v1/on-report-created',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

-- Trigger itself doesn't need recreating (function body updated in place),
-- but included for clarity/idempotency if this file is ever re-run.
drop trigger if exists trg_notify_on_report_created on public.reports;
create trigger trg_notify_on_report_created
after insert on public.reports
for each row execute function public.trigger_on_report_created();

-- Replace the cron job with one that also reads the key from Vault.
select cron.unschedule('check-overdue-corrective-actions')
where exists (select 1 from cron.job where jobname = 'check-overdue-corrective-actions');

select cron.schedule(
  'check-overdue-corrective-actions',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://xqxjyrswkqajpmswqmal.supabase.co/functions/v1/check-overdue-actions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
