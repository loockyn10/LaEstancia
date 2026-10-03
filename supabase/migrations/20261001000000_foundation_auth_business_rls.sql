-- Sprint 1 foundation. This migration is versioned only until it is applied to a
-- Supabase/PostgreSQL project. No commercial-domain tables are introduced here.

create type public.business_role as enum ('owner', 'admin', 'staff');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.business_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_memberships_active_user_idx
  on public.business_memberships (user_id, business_id)
  where is_active;

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create index branches_business_id_idx on public.branches (business_id);

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.branches enable row level security;

revoke all on table public.profiles, public.businesses, public.business_memberships, public.branches from anon;
revoke all on table public.profiles, public.businesses, public.business_memberships, public.branches from authenticated;
grant select on table public.profiles, public.businesses, public.business_memberships, public.branches to authenticated;
grant usage on type public.business_role to authenticated;

-- SECURITY DEFINER avoids querying business_memberships from a policy on that
-- same table. auth.uid() still comes from the caller's JWT, not the function owner.
create function public.has_active_business_membership(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships
    where business_id = target_business_id
      and user_id = auth.uid()
      and is_active
  );
$$;

revoke all on function public.has_active_business_membership(uuid) from public;
grant execute on function public.has_active_business_membership(uuid) to authenticated;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "businesses_select_active_membership"
  on public.businesses for select to authenticated
  using (public.has_active_business_membership(id));

create policy "business_memberships_select_own"
  on public.business_memberships for select to authenticated
  using (user_id = auth.uid());

create policy "branches_select_active_membership"
  on public.branches for select to authenticated
  using (public.has_active_business_membership(business_id));

-- This sprint deliberately defines no client-side insert, update, or delete
-- policies. Membership and business administration will be designed separately.
