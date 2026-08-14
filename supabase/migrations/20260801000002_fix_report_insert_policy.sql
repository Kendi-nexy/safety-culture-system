-- Fixes the "anyone can submit a report" policy: it included
-- `due_at is null` in its WITH CHECK, but that can never be true.
--
-- Postgres evaluates WITH CHECK *after* BEFORE INSERT triggers run, against
-- the final row — not the values the app actually sent. The
-- trg_sla_due_date trigger on this table always sets due_at to a computed
-- timestamp before the row is checked, so `due_at is null` failed on every
-- insert, regardless of who was inserting or what they sent. This is the
-- same class of bug as the earlier get_user_role() issue: a check written
-- against pre-trigger assumptions, evaluated post-trigger.
--
-- due_at isn't something the app sends or controls anyway (the trigger owns
-- it entirely), so there's nothing to validate there — just drop that
-- condition. Everything else in the policy was fine.

drop policy if exists "anyone can submit a report" on public.reports;

create policy "anyone can submit a report"
on public.reports
for insert
to anon, authenticated
with check (
  status = 'open'
  and assigned_to is null
  and coalesce(overdue, false) = false
  and (reporter_id is null or reporter_id = auth.uid())
  and (
    is_anonymous = false
    or (
      reporter_id is null
      and reporter_name is null
      and reporter_email is null
    )
  )
);
