-- Widens update_report_workflow() to accept 'assigned' and 'resolved' as
-- valid statuses, not just 'open' / 'in_progress' / 'closed'.
--
-- The reports table's check constraint already allowed the full set
-- ('open','assigned','in_progress','resolved','closed','reopened') from the
-- original schema migration — the RPC added on 2026-08-05 was just stricter
-- than the table it writes to. The Reports page (/reports) now exposes
-- Assigned and Resolved in its status dropdown, so the RPC needs to accept
-- them or every attempt to pick either throws "Unsupported report status".
--
-- 'closed' still requires resolution + closure comments, same as before.
-- 'resolved' does NOT require them here — that's intentionally left for the
-- close step, matching how the frontend only prompts for resolution/closure
-- text when moving to 'closed', not 'resolved'.

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

  if p_status not in ('open', 'assigned', 'in_progress', 'resolved', 'closed') then
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
