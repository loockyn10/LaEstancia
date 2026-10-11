-- `service_role` bypasses RLS, but that does not confer SQL object privileges.
-- The one-time server-side seed needs only the foundation records below; do not
-- grant these privileges to anon or authenticated.

grant usage on schema public to service_role;
grant usage on type public.business_role to service_role;

grant select on table public.businesses, public.profiles,
  public.business_memberships, public.branches to service_role;

grant insert, update on table public.profiles, public.business_memberships
  to service_role;
