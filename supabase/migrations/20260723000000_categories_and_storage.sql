-- Extend allowed categories to match every option already offered in the
-- frontend's report form (the original migration only had 7 of 9).
alter table public.reports drop constraint reports_category_check;
alter table public.reports add constraint reports_category_check
  check (category in (
    'near_miss', 'hazard', 'good_catch', 'incident', 'unsafe_act',
    'unsafe_condition', 'environmental', 'observation', 'quality'
  ));

-- Storage bucket for report photo attachments.
insert into storage.buckets (id, name, public)
values ('report-attachments', 'report-attachments', false)
on conflict (id) do nothing;

-- Anyone (including anonymous public reporters) can upload a photo when
-- submitting a report — mirrors the "anyone can submit a report" policy.
create policy "anyone can upload report attachments"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'report-attachments');

-- Reading attachments back is restricted to signed-in staff whose role/
-- assignment gives them visibility into the parent report. (Anonymous
-- reporters viewing their own submitted photos is a follow-up enhancement —
-- see README.)
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
      or public.get_user_role(auth.uid()) in ('hse', 'admin')
    )
  )
);
