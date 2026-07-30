-- Run this in the Supabase SQL Editor AFTER creating the auth users via
-- Authentication -> Users -> Add user (with "Auto Confirm User" checked).
-- Edit the emails/names/departments below to match who you actually created.

insert into public.profiles (id, full_name, email, role, department)
select id, 'Brian Kimani', email, 'hse', 'Safety'
from auth.users where email = 'brian.kimani@siginon.com'
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, department = excluded.department;

insert into public.profiles (id, full_name, email, role, department)
select id, 'Supervisor One', email, 'supervisor', 'Warehouse'
from auth.users where email = 'supervisor@siginon.com'
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, department = excluded.department;

insert into public.profiles (id, full_name, email, role, department)
select id, 'Admin User', email, 'admin', 'IT'
from auth.users where email = 'admin@siginon.com'
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, department = excluded.department;

-- Verify:
select id, full_name, email, role, department from public.profiles;
