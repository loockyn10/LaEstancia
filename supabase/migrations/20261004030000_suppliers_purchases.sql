-- Sprint 8 suppliers and purchases. A confirmed purchase is applied entirely
-- in PostgreSQL: it creates auditable inventory movements and uses the current
-- cost table so the existing cost-history trigger remains the source of truth.

create type public.purchase_status as enum ('draft', 'confirmed', 'cancelled');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) > 0 and char_length(name) <= 200),
  contact_name text check (contact_name is null or (contact_name = btrim(contact_name) and char_length(contact_name) <= 200)),
  phone text check (phone is null or (phone = btrim(phone) and char_length(phone) <= 80)),
  email text check (email is null or (email = btrim(email) and char_length(email) <= 320)),
  notes text check (notes is null or (notes = btrim(notes) and char_length(notes) <= 2000)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create index suppliers_business_name_idx on public.suppliers (business_id, name);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid,
  branch_id uuid not null,
  purchase_date date not null default current_date,
  document_number text check (document_number is null or (document_number = btrim(document_number) and char_length(document_number) <= 200)),
  notes text check (notes is null or (notes = btrim(notes) and char_length(notes) <= 2000)),
  status public.purchase_status not null default 'draft',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (supplier_id, business_id)
    references public.suppliers (id, business_id) on delete restrict,
  foreign key (branch_id, business_id)
    references public.branches (id, business_id) on delete restrict,
  unique (id, business_id)
);

create index purchases_business_status_date_idx
  on public.purchases (business_id, status, purchase_date desc, created_at desc);
create index purchases_business_supplier_date_idx
  on public.purchases (business_id, supplier_id, purchase_date desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  business_id uuid not null,
  variant_id uuid not null,
  quantity numeric(18,3) not null check (quantity > 0),
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  created_at timestamptz not null default now(),
  foreign key (purchase_id, business_id)
    references public.purchases (id, business_id) on delete cascade,
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id) on delete restrict,
  unique (purchase_id, variant_id)
);

create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_business_variant_idx on public.purchase_items (business_id, variant_id);

-- A purchase can point to every inventory event that it generated. The client
-- has no write grant to movements; confirm_purchase sets this field internally.
alter table public.inventory_movements
  add column purchase_id uuid references public.purchases (id) on delete restrict;
create index inventory_movements_purchase_id_idx
  on public.inventory_movements (purchase_id) where purchase_id is not null;

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

revoke all on table public.suppliers, public.purchases, public.purchase_items from anon;
revoke all on table public.suppliers, public.purchases, public.purchase_items from authenticated;
grant select, insert, update, delete on table public.suppliers, public.purchases, public.purchase_items to authenticated;

create function public.set_purchase_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_purchase_updated_at();

create trigger purchases_set_updated_at
before update on public.purchases
for each row execute function public.set_purchase_updated_at();

create policy "suppliers_select_active_membership"
  on public.suppliers for select to authenticated
  using (public.has_active_business_membership(business_id));
create policy "suppliers_insert_purchase_manager"
  on public.suppliers for insert to authenticated
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "suppliers_update_purchase_manager"
  on public.suppliers for update to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));

create policy "purchases_select_active_membership"
  on public.purchases for select to authenticated
  using (public.has_active_business_membership(business_id));
create policy "purchases_insert_draft_manager"
  on public.purchases for insert to authenticated
  with check (
    status = 'draft'
    and created_by = auth.uid()
    and public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
  );
create policy "purchases_update_draft_manager"
  on public.purchases for update to authenticated
  using (
    status = 'draft'
    and public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
  )
  with check (
    status in ('draft', 'cancelled')
    and public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
  );
create policy "purchases_delete_draft_manager"
  on public.purchases for delete to authenticated
  using (
    status = 'draft'
    and public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
  );

create policy "purchase_items_select_purchase_manager"
  on public.purchase_items for select to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "purchase_items_insert_draft_manager"
  on public.purchase_items for insert to authenticated
  with check (
    public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
    and exists (
      select 1 from public.purchases purchase
      where purchase.id = purchase_id and purchase.business_id = business_id and purchase.status = 'draft'
    )
  );
create policy "purchase_items_update_draft_manager"
  on public.purchase_items for update to authenticated
  using (
    public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
    and exists (
      select 1 from public.purchases purchase
      where purchase.id = purchase_id and purchase.business_id = business_id and purchase.status = 'draft'
    )
  )
  with check (
    public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
    and exists (
      select 1 from public.purchases purchase
      where purchase.id = purchase_id and purchase.business_id = business_id and purchase.status = 'draft'
    )
  );
create policy "purchase_items_delete_draft_manager"
  on public.purchase_items for delete to authenticated
  using (
    public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
    and exists (
      select 1 from public.purchases purchase
      where purchase.id = purchase_id and purchase.business_id = business_id and purchase.status = 'draft'
    )
  );

-- Extend the pre-existing inventory authority; purchase is an inbound event
-- with exactly the same locking, validation and audit semantics as inbound.
create or replace function public.record_inventory_movement(
  target_business_id uuid,
  target_branch_id uuid,
  target_variant_id uuid,
  movement_type public.inventory_movement_type,
  movement_quantity numeric,
  movement_note text default null
)
returns table (movement_id uuid, quantity_delta numeric, resulting_quantity numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_quantity numeric(18,3);
  next_quantity numeric(18,3);
  calculated_delta numeric(18,3);
  inserted_movement_id uuid;
begin
  if not public.has_active_business_role(
    target_business_id, array['owner', 'admin']::public.business_role[]
  ) then
    raise exception 'not authorized to record inventory movements';
  end if;
  if movement_quantity is null
    or movement_quantity <> trunc(movement_quantity, 3)
    or movement_quantity < 0
    or movement_quantity >= 1000000000000000 then
    raise exception 'invalid inventory quantity';
  end if;
  if movement_type in ('initial', 'inbound', 'outbound', 'purchase') and movement_quantity = 0 then
    raise exception 'inventory movement quantity must be greater than zero';
  end if;
  if movement_note is not null
    and (movement_note <> btrim(movement_note) or char_length(movement_note) > 2000) then
    raise exception 'invalid inventory note';
  end if;
  if not exists (
    select 1 from public.branches
    where id = target_branch_id and business_id = target_business_id
  ) then
    raise exception 'invalid inventory branch';
  end if;
  if not exists (
    select 1 from public.product_variants
    where id = target_variant_id and business_id = target_business_id
  ) then
    raise exception 'invalid inventory variant';
  end if;
  insert into public.inventory_balances (business_id, branch_id, variant_id)
  values (target_business_id, target_branch_id, target_variant_id)
  on conflict (branch_id, variant_id) do nothing;
  select quantity into current_quantity
  from public.inventory_balances
  where business_id = target_business_id
    and branch_id = target_branch_id
    and variant_id = target_variant_id
  for update;
  if movement_type = 'adjustment' then
    next_quantity := movement_quantity::numeric(18,3);
    calculated_delta := next_quantity - current_quantity;
  elsif movement_type in ('initial', 'inbound', 'purchase') then
    calculated_delta := movement_quantity::numeric(18,3);
    next_quantity := current_quantity + calculated_delta;
  else
    calculated_delta := -movement_quantity::numeric(18,3);
    next_quantity := current_quantity + calculated_delta;
  end if;
  if next_quantity < 0 then
    raise exception 'insufficient inventory';
  end if;
  if calculated_delta = 0 then
    raise exception 'inventory adjustment does not change stock';
  end if;
  update public.inventory_balances
  set quantity = next_quantity
  where business_id = target_business_id
    and branch_id = target_branch_id
    and variant_id = target_variant_id;
  insert into public.inventory_movements (
    business_id, branch_id, variant_id, type, quantity_delta,
    resulting_quantity, note, created_by
  ) values (
    target_business_id, target_branch_id, target_variant_id, movement_type,
    calculated_delta, next_quantity, nullif(movement_note, ''), auth.uid()
  ) returning id into inserted_movement_id;
  return query select inserted_movement_id, calculated_delta, next_quantity;
end;
$$;

create function public.confirm_purchase(target_business_id uuid, target_purchase_id uuid)
returns table (
  purchase_id uuid,
  confirmed_at timestamptz,
  item_count integer,
  total_cents numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_purchase public.purchases%rowtype;
  purchase_item public.purchase_items%rowtype;
  inventory_result record;
  calculated_total numeric := 0;
  calculated_item_count integer := 0;
begin
  if auth.uid() is null or not public.has_active_business_role(
    target_business_id, array['owner', 'admin']::public.business_role[]
  ) then
    raise exception 'not authorized to confirm purchases';
  end if;

  select * into locked_purchase
  from public.purchases
  where id = target_purchase_id and business_id = target_business_id
  for update;

  if not found then
    raise exception 'invalid purchase';
  end if;
  if locked_purchase.status <> 'draft' then
    raise exception 'only draft purchases can be confirmed';
  end if;
  if not exists (
    select 1 from public.branches
    where id = locked_purchase.branch_id and business_id = target_business_id
  ) then
    raise exception 'invalid purchase branch';
  end if;
  if locked_purchase.supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = locked_purchase.supplier_id and business_id = target_business_id
  ) then
    raise exception 'invalid purchase supplier';
  end if;
  if not exists (
    select 1 from public.purchase_items
    where purchase_id = target_purchase_id and business_id = target_business_id
  ) then
    raise exception 'a purchase requires at least one item';
  end if;
  if exists (
    select 1 from public.purchase_items item
    where item.purchase_id = target_purchase_id
      and (
        item.business_id <> target_business_id
        or item.quantity <= 0
        or item.unit_cost_cents < 0
        or not exists (
          select 1 from public.product_variants variant
          where variant.id = item.variant_id and variant.business_id = target_business_id
        )
      )
  ) then
    raise exception 'one or more purchase items are invalid';
  end if;

  for purchase_item in
    select * from public.purchase_items
    where purchase_id = target_purchase_id and business_id = target_business_id
    order by id
  loop
    select * into inventory_result
    from public.record_inventory_movement(
      target_business_id,
      locked_purchase.branch_id,
      purchase_item.variant_id,
      'purchase'::public.inventory_movement_type,
      purchase_item.quantity,
      format('Compra %s', target_purchase_id)
    );

    update public.inventory_movements
    set purchase_id = target_purchase_id
    where id = inventory_result.movement_id
      and business_id = target_business_id;

    insert into public.variant_costs (variant_id, business_id, amount_cents)
    values (purchase_item.variant_id, target_business_id, purchase_item.unit_cost_cents)
    on conflict (variant_id) do update
      set amount_cents = excluded.amount_cents;

    calculated_item_count := calculated_item_count + 1;
    calculated_total := calculated_total + (purchase_item.quantity * purchase_item.unit_cost_cents);
  end loop;

  update public.purchases
  set status = 'confirmed'
  where id = target_purchase_id and business_id = target_business_id;

  return query
  select target_purchase_id, now(), calculated_item_count, calculated_total;
end;
$$;

revoke all on function public.confirm_purchase(uuid, uuid) from public;
grant execute on function public.confirm_purchase(uuid, uuid) to authenticated;
