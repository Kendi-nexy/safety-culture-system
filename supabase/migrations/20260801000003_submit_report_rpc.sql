-- Root cause of the persistent 42501 on report submission: the frontend
-- calls .insert(...).select().single(), which makes PostgREST do an
-- INSERT ... RETURNING under the hood. Returning a row is a READ, governed
-- by the SELECT policies on reports — not the INSERT policy. Every SELECT
-- policy on reports requires reporter_id/assigned_to = auth.uid() or an
-- HSE/Admin role, so an anonymous public submission (no session,
-- reporter_id null) can never read back the row it just inserted, and
-- Postgres reports that as the same RLS violation error even though the
-- insert itself succeeded.
--
-- Widening the SELECT policy to let anon read rows where reporter_id is
-- null would fix this but leak every anonymous report to anyone querying
-- the table directly — not acceptable.
--
-- Fix: move the insert into a SECURITY DEFINER function. It runs with
-- elevated privileges internally (bypassing RLS for its own insert+read),
-- and returns only id + reference_number — nothing else — so the reports
-- table's SELECT policies stay exactly as tight as they already are.

create or replace function public.submit_public_report(
  p_category text,
  p_description text,
  p_zone text,
  p_severity text,
  p_is_anonymous boolean,
  p_reporter_name text,
  p_reporter_email text
)
returns table (id uuid, reference_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  new_ref text;
begin
  insert into public.reports (
    category, description, zone, severity, is_anonymous,
    reporter_name, reporter_email, reporter_id
  )
  values (
    p_category, p_description, p_zone, p_severity, p_is_anonymous,
    case when p_is_anonymous then null else p_reporter_name end,
    case when p_is_anonymous then null else p_reporter_email end,
    case when p_is_anonymous then null else auth.uid() end
  )
  returning reports.id, reports.reference_number into new_id, new_ref;

  return query select new_id, new_ref;
end;
$$;

-- Note: the anonymous-nulling logic now lives here too (server-side), not
-- just in the frontend — so it holds even if a client sends bad data.

grant execute on function public.submit_public_report to anon, authenticated;
