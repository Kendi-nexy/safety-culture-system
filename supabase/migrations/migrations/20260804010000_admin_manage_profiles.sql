-- The Users page now lets an Admin change someone else's role or remove
-- their profile entirely. Neither was previously possible: the only update
-- policy on `profiles` was "users update own profile" (id = auth.uid()),
-- and there was no delete policy at all. Add the missing Admin-scoped
-- policies.

create policy "admins update any profile" on public.profiles for update
  using (public.get_user_role() = 'admin');

create policy "admins delete any profile" on public.profiles for delete
  using (public.get_user_role() = 'admin');

-- NOTE: deleting a `profiles` row does NOT delete the underlying
-- `auth.users` account that needs a service-role call
-- (supabase.auth.admin.deleteUser), which can't run from the browser safely.
-- In practice this means "delete" here is really "revoke access": the
-- person's auth login still exists, but with no matching `profiles` row
-- they can't reach any role-gated page (see the `missingProfile` state in
-- useAuth()). Full account deletion is a follow-up once there's a
-- server-side admin surface (the same Edge Function territory as the
-- pending invite flow).