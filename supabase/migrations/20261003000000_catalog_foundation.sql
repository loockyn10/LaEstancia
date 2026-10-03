-- Sprint 2 catalog foundation. Products express the commercial identity;
-- product_variants are the sellable presentations within a business.

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create index brands_business_id_idx on public.brands (business_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create index categories_business_id_idx on public.categories (business_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  brand_id uuid,
  category_id uuid,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (brand_id, business_id)
    references public.brands (id, business_id),
  foreign key (category_id, business_id)
    references public.categories (id, business_id)
);

create index products_business_id_idx on public.products (business_id);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id uuid not null,
  name text not null check (char_length(trim(name)) > 0),
  sku text check (sku is null or (sku = btrim(sku) and char_length(sku) > 0)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (product_id, business_id)
    references public.products (id, business_id)
);

create index product_variants_business_product_idx
  on public.product_variants (business_id, product_id);

create unique index product_variants_business_sku_key
  on public.product_variants (business_id, sku)
  where sku is not null;

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  variant_id uuid not null,
  code text not null check (code = btrim(code) and char_length(code) > 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id)
);

create index product_barcodes_business_variant_idx
  on public.product_barcodes (business_id, variant_id);

create unique index product_barcodes_business_code_key
  on public.product_barcodes (business_id, code);

create unique index product_barcodes_one_primary_per_variant_key
  on public.product_barcodes (variant_id)
  where is_primary;

alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_barcodes enable row level security;

revoke all on table public.brands, public.categories, public.products,
  public.product_variants, public.product_barcodes from anon;
revoke all on table public.brands, public.categories, public.products,
  public.product_variants, public.product_barcodes from authenticated;
grant select, insert, update, delete on table public.brands, public.categories,
  public.products, public.product_variants, public.product_barcodes to authenticated;

-- SECURITY DEFINER avoids a policy querying business_memberships directly.
-- auth.uid() remains the caller identity from its JWT.
create function public.has_active_business_role(
  target_business_id uuid,
  allowed_roles public.business_role[]
)
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
      and role = any(allowed_roles)
  );
$$;

revoke all on function public.has_active_business_role(uuid, public.business_role[]) from public;
grant execute on function public.has_active_business_role(uuid, public.business_role[]) to authenticated;

create policy "brands_select_active_membership"
  on public.brands for select to authenticated
  using (public.has_active_business_membership(business_id));
create policy "brands_insert_catalog_manager"
  on public.brands for insert to authenticated
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "brands_update_catalog_manager"
  on public.brands for update to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "brands_delete_catalog_manager"
  on public.brands for delete to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));

create policy "categories_select_active_membership"
  on public.categories for select to authenticated
  using (public.has_active_business_membership(business_id));
create policy "categories_insert_catalog_manager"
  on public.categories for insert to authenticated
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "categories_update_catalog_manager"
  on public.categories for update to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "categories_delete_catalog_manager"
  on public.categories for delete to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));

create policy "products_select_active_membership"
  on public.products for select to authenticated
  using (public.has_active_business_membership(business_id));
create policy "products_insert_catalog_manager"
  on public.products for insert to authenticated
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "products_update_catalog_manager"
  on public.products for update to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "products_delete_catalog_manager"
  on public.products for delete to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));

create policy "product_variants_select_active_membership"
  on public.product_variants for select to authenticated
  using (public.has_active_business_membership(business_id));
create policy "product_variants_insert_catalog_manager"
  on public.product_variants for insert to authenticated
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "product_variants_update_catalog_manager"
  on public.product_variants for update to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "product_variants_delete_catalog_manager"
  on public.product_variants for delete to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));

create policy "product_barcodes_select_active_membership"
  on public.product_barcodes for select to authenticated
  using (public.has_active_business_membership(business_id));
create policy "product_barcodes_insert_catalog_manager"
  on public.product_barcodes for insert to authenticated
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "product_barcodes_update_catalog_manager"
  on public.product_barcodes for update to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "product_barcodes_delete_catalog_manager"
  on public.product_barcodes for delete to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
