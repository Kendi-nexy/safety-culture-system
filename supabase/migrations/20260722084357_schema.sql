-- 1. PROFILES
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  email text not null,
  role text not null check (role in ('employee','supervisor','hse','admin')),
  department text,
  created_at timestamptz default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- Helper (after profiles exists) to avoid recursive RLS
create or replace function public.get_user_role(_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = _uid
$$;

-- 2. REPORTS
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reference_number text unique not null default 'PENDING',
  category text not null check (category in
    ('near_miss','hazard','good_catch','incident','unsafe_act','environmental','observation')),
  description text not null,
  zone text not null,
  severity text not null check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in
    ('open','assigned','in_progress','resolved','closed','reopened')),
  is_anonymous boolean default false,
  reporter_id uuid references public.profiles(id),
  reporter_name text,
  assigned_to uuid references public.profiles(id),
  due_at timestamptz,
  overdue boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select, insert, update, delete on public.reports to authenticated;
grant select, insert on public.reports to anon;
grant all on public.reports to service_role;
alter table public.reports enable row level security;

-- 3. ATTACHMENTS
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  tag text not null check (tag in ('before','after','supporting')),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
grant select, insert, update, delete on public.attachments to authenticated;
grant select, insert on public.attachments to anon;
grant all on public.attachments to service_role;
alter table public.attachments enable row level security;

-- 4. SLA_RULES
create table public.sla_rules (
  severity text primary key check (severity in ('low','medium','high')),
  response_hours integer not null,
  resolution_hours integer not null
);
grant select on public.sla_rules to authenticated, anon;
grant all on public.sla_rules to service_role;
alter table public.sla_rules enable row level security;
create policy "sla rules readable" on public.sla_rules for select using (true);

insert into public.sla_rules (severity, response_hours, resolution_hours) values
  ('high', 4, 24),
  ('medium', 24, 72),
  ('low', 72, 168);

-- 5. STATUS_LOG
create table public.status_log (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz default now()
);
grant select, insert on public.status_log to authenticated;
grant all on public.status_log to service_role;
alter table public.status_log enable row level security;

-- 6. COMMENTS
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz default now()
);
grant select, insert, update, delete on public.comments to authenticated;
grant all on public.comments to service_role;
alter table public.comments enable row level security;

-- 7. Reference number sequence + trigger
create sequence public.report_ref_seq start 1;

create or replace function public.set_reference_number() returns trigger
language plpgsql set search_path = public as $$
begin
  new.reference_number := 'SIG-2026-' || lpad(nextval('public.report_ref_seq')::text, 4, '0');
  return new;
end;
$$;

create trigger trg_reference_number
before insert on public.reports
for each row execute function public.set_reference_number();

-- 8. SLA due date trigger
create or replace function public.set_sla_due_date() returns trigger
language plpgsql set search_path = public as $$
declare hours integer;
begin
  select resolution_hours into hours from public.sla_rules where severity = new.severity;
  new.due_at := now() + (hours || ' hours')::interval;
  return new;
end;
$$;

create trigger trg_sla_due_date
before insert on public.reports
for each row execute function public.set_sla_due_date();

-- 9. Status change log + updated_at
create or replace function public.log_status_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status is distinct from new.status then
    insert into public.status_log (report_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, new.assigned_to);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_status_log
before update on public.reports
for each row execute function public.log_status_change();

-- 10. RLS policies
create policy "read own profile" on public.profiles for select
  using (id = auth.uid());
create policy "admins read all profiles" on public.profiles for select
  using (public.get_user_role(auth.uid()) = 'admin');
create policy "users insert own profile" on public.profiles for insert
  with check (id = auth.uid());
create policy "users update own profile" on public.profiles for update
  using (id = auth.uid());

create policy "anyone can submit a report" on public.reports for insert
  with check (true);
create policy "reporters see own reports" on public.reports for select
  using (reporter_id = auth.uid());
create policy "assignee sees their reports" on public.reports for select
  using (assigned_to = auth.uid());
create policy "hse and admin see all reports" on public.reports for select
  using (public.get_user_role(auth.uid()) in ('hse','admin'));
create policy "assignee/hse/admin can update reports" on public.reports for update
  using (
    assigned_to = auth.uid()
    or public.get_user_role(auth.uid()) in ('hse','admin')
  );

create policy "attachments follow report visibility" on public.attachments for select
  using (exists (
    select 1 from public.reports r where r.id = report_id
    and (r.reporter_id = auth.uid() or r.assigned_to = auth.uid()
         or public.get_user_role(auth.uid()) in ('hse','admin'))
  ));
create policy "anyone can upload attachments on their report" on public.attachments for insert
  with check (true);

create policy "comments follow report visibility" on public.comments for select
  using (exists (
    select 1 from public.reports r where r.id = report_id
    and (r.assigned_to = auth.uid()
         or public.get_user_role(auth.uid()) in ('hse','admin'))
  ));
create policy "assignee/hse/admin can comment" on public.comments for insert
  with check (public.get_user_role(auth.uid()) in ('supervisor','hse','admin'));

create policy "status log follows report visibility" on public.status_log for select
  using (exists (
    select 1 from public.reports r where r.id = report_id
    and (r.assigned_to = auth.uid()
         or public.get_user_role(auth.uid()) in ('hse','admin'))
  ));
