-- Fixes a bug from the previous migration: revoking EXECUTE on
-- get_user_role(uuid) from anon/authenticated broke every RLS policy that
-- calls it internally (Postgres requires EXECUTE privilege to invoke a
-- function even from inside a policy's USING clause, regardless of
-- SECURITY DEFINER). This was surfacing as 401s on reports/status_log.
--
-- Fix: redefine as a zero-argument function that reads auth.uid() itself
-- (so there's no arbitrary-uid parameter to worry about exposing), and grant
-- EXECUTE properly this time.
--
-- IMPORTANT ordering: every policy referencing get_user_role(uuid) must be
-- dropped BEFORE the function itself, since Postgres won't drop a function
-- that policies still depend on.

-- 1. Drop every policy that depends on the old function first.
drop policy if exists "admins read all profiles" on public.profiles;
drop policy if exists "hse and admin see all reports" on public.reports;
drop policy if exists "assignee/hse/admin can update reports" on public.reports;
drop policy if exists "attachments follow report visibility" on public.attachments;
drop policy if exists "comments follow report visibility" on public.comments;
drop policy if exists "assignee/hse/admin can comment" on public.comments;
drop policy if exists "status log follows report visibility" on public.status_log;
drop policy if exists "staff can view report attachments" on storage.objects;

-- 2. Now safe to drop the old two-arg function.
drop function if exists public.get_user_role(uuid);

-- 3. Create the replacement zero-argument version.
create or replace function public.get_user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

grant execute on function public.get_user_role() to anon, authenticated;

-- 4. Recreate every policy, pointed at the new function.
create policy "admins read all profiles" on public.profiles for select
  using (public.get_user_role() = 'admin');

create policy "hse and admin see all reports" on public.reports for select
  using (public.get_user_role() in ('hse', 'admin'));

create policy "assignee/hse/admin can update reports" on public.reports for update
  using (
    assigned_to = auth.uid()
    or public.get_user_role() in ('hse', 'admin')
  );

create policy "attachments follow report visibility" on public.attachments for select
  using (exists (
    select 1 from public.reports r where r.id = report_id
    and (r.reporter_id = auth.uid() or r.assigned_to = auth.uid()
         or public.get_user_role() in ('hse','admin'))
  ));

create policy "comments follow report visibility" on public.comments for select
  using (exists (
    select 1 from public.reports r where r.id = report_id
    and (r.assigned_to = auth.uid()
         or public.get_user_role() in ('hse','admin'))
  ));

create policy "assignee/hse/admin can comment" on public.comments for insert
  with check (public.get_user_role() in ('supervisor','hse','admin'));

create policy "status log follows report visibility" on public.status_log for select
  using (exists (
    select 1 from public.reports r where r.id = report_id
    and (r.assigned_to = auth.uid()
         or public.get_user_role() in ('hse','admin'))
  ));

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
      or public.get_user_role() in ('hse', 'admin')
    )
  )
);
