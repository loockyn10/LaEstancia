-- Sprint 6 inventory. Stock is owned by the sellable presentation and branch;
-- products themselves never carry a stock value. Quantities use numeric(18,3)
-- so future weight-based products do not need a schema migration.

create type public.inventory_movement_type as enum (
  'initial',
  'inbound',
  'outbound',
  'adjustment'
);

-- This composite key lets every inventory foreign key preserve branch/business
-- ownership in the same way as the catalogue's variant/business references.
alter table public.branches
  add constraint branches_id_business_id_key unique (id, business_id);

create table public.inventory_balances (
  business_id uuid not null,
  branch_id uuid not null,
  variant_id uuid not null,
  quantity numeric(18,3) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(18,3) check (minimum_quantity is null or minimum_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, variant_id),
  foreign key (branch_id, business_id)
    references public.branches (id, business_id)
    on delete cascade,
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id)
    on delete cascade
);

create index inventory_balances_business_branch_idx
  on public.inventory_balances (business_id, branch_id);
create index inventory_balances_low_stock_idx
  on public.inventory_balances (business_id, branch_id, quantity)
  where minimum_quantity is not null;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  branch_id uuid not null,
  variant_id uuid not null,
  type public.inventory_movement_type not null,
  quantity_delta numeric(18,3) not null check (quantity_delta <> 0),
  resulting_quantity numeric(18,3) not null check (resulting_quantity >= 0),
  note text check (note is null or (note = btrim(note) and char_length(note) <= 2000)),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (branch_id, business_id)
    references public.branches (id, business_id)
    on delete restrict,
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id)
    on delete restrict
);

create index inventory_movements_variant_branch_created_at_idx
  on public.inventory_movements (variant_id, branch_id, created_at desc);
create index inventory_movements_business_branch_created_at_idx
  on public.inventory_movements (business_id, branch_id, created_at desc);

alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;

-- Clients can read their business inventory but cannot write either table
-- directly. Balances change only through the locked RPC below; movements are
-- append-only and can be inserted only by that same RPC.
revoke all on table public.inventory_balances, public.inventory_movements from anon;
revoke all on table public.inventory_balances, public.inventory_movements from authenticated;
grant select on table public.inventory_balances, public.inventory_movements to authenticated;

create policy "inventory_balances_select_active_membership"
  on public.inventory_balances for select to authenticated
  using (public.has_active_business_membership(business_id));

create policy "inventory_movements_select_active_membership"
  on public.inventory_movements for select to authenticated
  using (public.has_active_business_membership(business_id));

create function public.set_inventory_balance_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger inventory_balances_set_updated_at
before update on public.inventory_balances
for each row execute function public.set_inventory_balance_updated_at();

-- adjustment takes the counted physical quantity (rather than a client-side
-- delta). The function derives and stores the delta so its audit trail remains
-- useful while preventing races and negative stock.
create function public.record_inventory_movement(
  target_business_id uuid,
  target_branch_id uuid,
  target_variant_id uuid,
  movement_type public.inventory_movement_type,
  movement_quantity numeric,
  movement_note text default null
)
returns table (
  movement_id uuid,
  quantity_delta numeric,
  resulting_quantity numeric
)
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

  if movement_type in ('initial', 'inbound', 'outbound') and movement_quantity = 0 then
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
  elsif movement_type in ('initial', 'inbound') then
    calculated_delta := movement_quantity::numeric(18,3);
    next_quantity := current_quantity + calculated_delta;
  else
    calculated_delta := -movement_quantity::numeric(18,3);
    next_quantity := current_quantity + calculated_delta;
  end if;

  if next_quantity < 0 then
    raise exception 'insufficient inventory';
  end if;

  -- A no-op adjustment carries no stock event and is rejected deliberately.
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

revoke all on function public.record_inventory_movement(
  uuid, uuid, uuid, public.inventory_movement_type, numeric, text
) from public;
grant execute on function public.record_inventory_movement(
  uuid, uuid, uuid, public.inventory_movement_type, numeric, text
) to authenticated;

-- Minimum stock belongs to the same branch/variant balance. This is also a
-- security-definer RPC so clients cannot update the actual quantity column.
create function public.set_inventory_minimum(
  target_business_id uuid,
  target_branch_id uuid,
  target_variant_id uuid,
  target_minimum_quantity numeric default null
)
returns table (quantity numeric, minimum_quantity numeric)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_active_business_role(
    target_business_id, array['owner', 'admin']::public.business_role[]
  ) then
    raise exception 'not authorized to set inventory minimum';
  end if;

  if target_minimum_quantity is not null
    and (target_minimum_quantity <> trunc(target_minimum_quantity, 3)
      or target_minimum_quantity < 0
      or target_minimum_quantity >= 1000000000000000) then
    raise exception 'invalid inventory minimum';
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

  insert into public.inventory_balances (business_id, branch_id, variant_id, minimum_quantity)
  values (target_business_id, target_branch_id, target_variant_id, target_minimum_quantity)
  on conflict (branch_id, variant_id)
  do update set minimum_quantity = excluded.minimum_quantity;

  return query
  select balance.quantity, balance.minimum_quantity
  from public.inventory_balances as balance
  where balance.business_id = target_business_id
    and balance.branch_id = target_branch_id
    and balance.variant_id = target_variant_id;
end;
$$;

revoke all on function public.set_inventory_minimum(uuid, uuid, uuid, numeric) from public;
grant execute on function public.set_inventory_minimum(uuid, uuid, uuid, numeric) to authenticated;

-- The function reveals a movement author's display name without exposing all
-- profile rows. It validates the same business/branch/variant ownership first.
create function public.list_inventory_movements(
  target_business_id uuid,
  target_branch_id uuid,
  target_variant_id uuid
)
returns table (
  id uuid,
  type public.inventory_movement_type,
  quantity_delta numeric,
  resulting_quantity numeric,
  note text,
  created_at timestamptz,
  created_by uuid,
  created_by_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_active_business_membership(target_business_id) then
    raise exception 'not authorized to read inventory movements';
  end if;

  if not exists (
    select 1 from public.branches
    where id = target_branch_id and business_id = target_business_id
  ) or not exists (
    select 1 from public.product_variants
    where id = target_variant_id and business_id = target_business_id
  ) then
    raise exception 'invalid inventory branch or variant';
  end if;

  return query
  select movement.id, movement.type, movement.quantity_delta,
    movement.resulting_quantity, movement.note, movement.created_at,
    movement.created_by, profile.display_name
  from public.inventory_movements as movement
  left join public.profiles as profile on profile.id = movement.created_by
  where movement.business_id = target_business_id
    and movement.branch_id = target_branch_id
    and movement.variant_id = target_variant_id
  order by movement.created_at desc, movement.id desc;
end;
$$;

revoke all on function public.list_inventory_movements(uuid, uuid, uuid) from public;
grant execute on function public.list_inventory_movements(uuid, uuid, uuid) to authenticated;
