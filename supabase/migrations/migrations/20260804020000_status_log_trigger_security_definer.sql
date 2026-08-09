-- `status_log` has always had only a SELECT policy ("status log follows
-- report visibility") -- there was never an INSERT policy. The
-- `log_status_change()` trigger on `reports` (fires on every status change)
-- runs as SECURITY INVOKER by default, so its own `insert into status_log`
-- was silently subject to RLS too and got rejected: "new row violates
-- row-level security policy for table status_log".
--
-- Fix: make the trigger function SECURITY DEFINER, same pattern as
-- get_user_role() elsewhere in this schema. It's a system-maintained audit
-- log written only by this one trigger, never directly by client code, so
-- running it with elevated privileges (bypassing RLS just for this insert)
-- is the right shape here -- it's the same idea as a Postgres audit trigger,
-- not a general-purpose opening of status_log to client writes.

create or replace function public.log_status_change() returns trigger
security definer
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