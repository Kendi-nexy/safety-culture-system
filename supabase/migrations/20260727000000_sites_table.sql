-- Reference list of real Siginon sites, replacing free-text guessing on the
-- report form. reports.zone stays a plain text column (no schema change
-- there, no risk to existing rows) — this table just gives the frontend a
-- real list to populate a dropdown from instead of a free-text box.

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

-- Readable by anyone, including anonymous public reporters (the report form
-- has no login), so the dropdown can populate without auth.
grant select on public.sites to anon, authenticated;
grant all on public.sites to service_role;
alter table public.sites enable row level security;

create policy "sites are publicly readable" on public.sites
  for select using (true);

insert into public.sites (name) values
  ('AVN'), ('CFS'), ('GHO'), ('GLM'), ('GLN'),
  ('KLS'), ('RLC'), ('SCC'), ('SRL'), ('STZ');
