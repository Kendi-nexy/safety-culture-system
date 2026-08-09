-- The reports UPDATE policy was widened to include Supervisors in an
-- earlier migration (20260804000000), but attachments/comments/status_log
-- SELECT policies were never updated to match -- they still only check
-- `assigned_to = auth.uid() or role in ('hse','admin')`. Result: a
-- Supervisor can now open and update a report via Corrective Actions or the
-- new report detail page, but the photos/comments/history sections on that
-- same page would come back empty for them. Widen all three to match.

drop policy if exists "attachments follow report visibility" on public.attachments;
create policy "attachments follow report visibility" on public.attachments for select
  using (exists (
    select 1 from public.reports r where r.id = report_id
    and (
      r.reporter_id = auth.uid()
      or r.assigned_to = auth.uid()
      or public.get_user_role() in ('supervisor', 'hse', 'admin')
    )
  ));

drop policy if exists "comments follow report visibility" on public.comments;
create policy "comments follow report visibility" on public.comments for select
  using (exists (
    select 1 from public.reports r where r.id = report_id
    and (
      r.assigned_to = auth.uid()
      or public.get_user_role() in ('supervisor', 'hse', 'admin')
    )
  ));

drop policy if exists "status log follows report visibility" on public.status_log;
create policy "status log follows report visibility" on public.status_log for select
  using (exists (
    select 1 from public.reports r where r.id = report_id
    and (
      r.assigned_to = auth.uid()
      or public.get_user_role() in ('supervisor', 'hse', 'admin')
    )
  ));

drop policy if exists "staff can view report attachments" on storage.objects;
create policy "staff can view report attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'report-attachments'
  and exists (
    select 1 from public.attachments a
    join public.reports r on r.id = a.report_id
    where a.storage_path = storage.objects.name
    and (
      r.assigned_to = auth.uid()
      or public.get_user_role() in ('supervisor', 'hse', 'admin')
    )
  )
);

-- NOTE: this still doesn't cover the case of an Employee viewing comments/
-- history on a report they personally submitted but aren't assigned to --
-- only `attachments` grants that (via reporter_id). That's an intentional
-- gap for now (internal HSE notes staying internal), not an oversight, but
-- worth confirming with the team once the "should Employees ever have
-- accounts" question gets settled.