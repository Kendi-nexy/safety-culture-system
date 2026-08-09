-- Fix 1: Supervisors could assign/close actions in the UI (per can() in
-- src/lib/app-shell.tsx) but RLS only let the current assignee, HSE, or
-- Admin update a report. A Supervisor trying to claim an unassigned report
-- got a silent RLS failure. Widen the update policy to match what the UI
-- already promises: Supervisor, HSE Officer or Admin can update any report,
-- not just whoever it's currently assigned to.
drop policy if exists "assignee/hse/admin can update reports" on public.reports;

create policy "staff can update reports" on public.reports for update
  using (
    assigned_to = auth.uid()
    or public.get_user_role() in ('supervisor', 'hse', 'admin')
  );

-- Fix 2: reports.overdue was never kept in sync — it defaulted to false and
-- nothing ever set it. "Is this overdue right now" depends on now(), which
-- can't live in a real generated column (now() isn't IMMUTABLE), so this is
-- two complementary pieces:
--
--  a) A trigger that recomputes it on every insert/update, so it's at least
--     correct at the moment a row changes (e.g. severity/due_at edited, or
--     status moved to resolved/closed).
--  b) A periodic sweep (pg_cron) that catches reports nobody touches e.g.
--     one due at 5pm today is still marked "not overdue" at 5:01pm unless
--     something recomputes it.
--
-- The frontend (src/routes/corrective-actions.tsx) does NOT depend on this
-- column it already computes overdue client-side from due_at, which is
-- instantly correct. This migration exists so `reports.overdue` becomes
-- trustworthy for anything else that reads it directly (exports, reports,
-- future admin tooling, direct SQL).

create or replace function public.sync_overdue_flag() returns trigger
language plpgsql set search_path = public as $$
begin
  new.overdue := (
    new.due_at is not null
    and new.due_at < now()
    and new.status not in ('resolved', 'closed')
  );
  return new;
end;
$$;

drop trigger if exists trg_sync_overdue_on_write on public.reports;
create trigger trg_sync_overdue_on_write
before insert or update on public.reports
for each row execute function public.sync_overdue_flag();

-- Periodic sweep, so the flag flips to true even for reports nobody edits.
-- Requires the pg_cron extension. On Supabase this is usually a toggle in
-- Database > Extensions rather than always-on if the next line errors
-- with "extension pg_cron does not exist", enable it there first, then
-- re-run just this last block.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-overdue-flags') then
    perform cron.unschedule('sync-overdue-flags');
  end if;
end $$;

select cron.schedule(
  'sync-overdue-flags',
  '*/15 * * * *', -- every 15 minutes
  $$
    update public.reports
    set overdue = (due_at is not null and due_at < now() and status not in ('resolved','closed'))
    where overdue is distinct from (due_at is not null and due_at < now() and status not in ('resolved','closed'));
  $$
);