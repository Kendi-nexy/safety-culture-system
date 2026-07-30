revoke execute on function public.get_user_role(uuid) from public, anon, authenticated;
grant execute on function public.get_user_role(uuid) to service_role;
