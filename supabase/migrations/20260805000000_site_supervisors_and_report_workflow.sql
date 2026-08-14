-- Site supervisor ownership + supervisor report workflow.
--
-- New reports are automatically assigned to the supervisor configured for
-- the selected site/zone. Supervisors can see every logged report, while the
-- assigned supervisor remains the default owner for the report.

alter table public.sites
  add column if not exists supervisor_id uuid references public.profiles(id);

alter table public.reports
  add column if not exists resolution text,
  add column if not exists closure_comments text,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.profiles(id);

grant update (supervisor_id) on public.sites to authenticated;

create index if not exists idx_sites_supervisor_id on public.sites(supervisor_id);
create index if not exists idx_reports_zone on public.reports(zone);

-- Assign the report to the supervisor linked to its site before insert RLS
-- WITH CHECK is evaluated.
create or replace function public.assign_site_supervisor() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  site_supervisor uuid;
begin
  select supervisor_id into site_supervisor
  from public.sites
  where lower(name) = lower(new.zone)
  limit 1;

  if site_supervisor is not null then
    new.assigned_to := site_supervisor;
    if new.status = 'open' then
      new.status := 'assigned';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_site_supervisor on public.reports;
create trigger trg_assign_site_supervisor
before insert on public.reports
for each row execute function public.assign_site_supervisor();

-- The old anonymous insert policy required assigned_to to remain null. That
-- blocks automatic assignment because policies see the row after BEFORE
-- triggers run. Allow either unassigned or a real supervisor.
drop policy if exists "anyone can submit a report" on public.reports;

create policy "anyone can submit a report"
on public.reports
for insert
to anon, authenticated
with check (
  status in ('open', 'assigned')
  and coalesce(overdue, false) = false
  and (
    assigned_to is null
    or exists (
      select 1 from public.profiles p
      where p.id = assigned_to
      and p.role = 'supervisor'
    )
  )
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

-- Supervisors need the same all-report visibility requested for the dashboard.
drop policy if exists "hse and admin see all reports" on public.reports;
create policy "staff see all reports"
on public.reports
for select
to authenticated
using (public.get_user_role() in ('supervisor', 'hse', 'admin'));

drop policy if exists "assignee/hse/admin can update reports" on public.reports;
create policy "staff can update reports"
on public.reports
for update
to authenticated
using (public.get_user_role() in ('supervisor', 'hse', 'admin'))
with check (public.get_user_role() in ('supervisor', 'hse', 'admin'));

-- Staff need profile names for the assigned-supervisor display.
drop policy if exists "admins read all profiles" on public.profiles;
create policy "staff read all profiles"
on public.profiles
for select
to authenticated
using (public.get_user_role() in ('supervisor', 'hse', 'admin'));

drop policy if exists "admins update site supervisors" on public.sites;
create policy "admins update site supervisors"
on public.sites
for update
to authenticated
using (public.get_user_role() = 'admin')
with check (public.get_user_role() = 'admin');

drop policy if exists "comments follow report visibility" on public.comments;
create policy "comments follow report visibility" on public.comments for select
to authenticated
using (exists (
  select 1 from public.reports r
  where r.id = report_id
  and (
    r.assigned_to = auth.uid()
    or public.get_user_role() in ('supervisor','hse','admin')
  )
));

drop policy if exists "status log follows report visibility" on public.status_log;
create policy "status log follows report visibility" on public.status_log for select
to authenticated
using (exists (
  select 1 from public.reports r
  where r.id = report_id
  and (
    r.assigned_to = auth.uid()
    or public.get_user_role() in ('supervisor','hse','admin')
  )
));

-- One RPC for dashboard workflow updates. Closing requires both a resolution
-- and closure comments, and stores those fields directly on the report while
-- also writing a comment entry for the audit trail.
create or replace function public.update_report_workflow(
  p_report_id uuid,
  p_status text,
  p_resolution text default null,
  p_closure_comments text default null
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  updated_report public.reports;
begin
  select role into actor_role from public.profiles where id = auth.uid();

  if actor_role not in ('supervisor', 'hse', 'admin') then
    raise exception 'Only supervisors, HSE officers and admins can update reports';
  end if;

  if p_status not in ('open', 'in_progress', 'closed') then
    raise exception 'Unsupported report status: %', p_status;
  end if;

  if p_status = 'closed' and (
    nullif(trim(coalesce(p_resolution, '')), '') is null
    or nullif(trim(coalesce(p_closure_comments, '')), '') is null
  ) then
    raise exception 'Resolution and closure comments are required when closing a report';
  end if;

  update public.reports
  set
    status = p_status,
    resolution = case when p_status = 'closed' then trim(p_resolution) else resolution end,
    closure_comments = case when p_status = 'closed' then trim(p_closure_comments) else closure_comments end,
    closed_at = case when p_status = 'closed' then now() else null end,
    closed_by = case when p_status = 'closed' then auth.uid() else null end
  where id = p_report_id
  returning * into updated_report;

  if updated_report.id is null then
    raise exception 'Report not found';
  end if;

  if p_status = 'closed' then
    insert into public.comments (report_id, author_id, body)
    values (
      p_report_id,
      auth.uid(),
      'Resolution: ' || trim(p_resolution) || E'\n\nClosure comments: ' || trim(p_closure_comments)
    );
  end if;

  return updated_report;
end;
$$;

grant execute on function public.update_report_workflow(uuid, text, text, text) to authenticated;
