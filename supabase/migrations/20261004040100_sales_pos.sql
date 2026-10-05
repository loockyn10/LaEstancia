-- Sprint 9 POS sales. A completed sale is created only through confirm_sale,
-- which owns pricing, stock, auditing and idempotency in one transaction.

create type public.sale_status as enum ('completed');
create type public.sale_payment_method as enum ('cash', 'debit', 'credit', 'transfer', 'other');

create sequence public.sales_visible_number_seq;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null,
  sale_number bigint not null default nextval('public.sales_visible_number_seq'),
  status public.sale_status not null default 'completed',
  payment_method public.sale_payment_method not null,
  total_cents bigint not null check (total_cents >= 0),
  idempotency_key uuid not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (branch_id, business_id)
    references public.branches (id, business_id) on delete restrict,
  unique (id, business_id),
  unique (business_id, sale_number),
  unique (business_id, created_by, idempotency_key)
);

create index sales_business_branch_created_at_idx
  on public.sales (business_id, branch_id, created_at desc);
create index sales_business_created_at_idx on public.sales (business_id, created_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  business_id uuid not null,
  variant_id uuid not null,
  quantity numeric(18,3) not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  created_at timestamptz not null default now(),
  foreign key (sale_id, business_id)
    references public.sales (id, business_id) on delete restrict,
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id) on delete restrict,
  unique (sale_id, variant_id)
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_business_variant_idx on public.sale_items (business_id, variant_id);

alter table public.inventory_movements
  add column sale_id uuid references public.sales (id) on delete restrict;
create index inventory_movements_sale_id_idx
  on public.inventory_movements (sale_id) where sale_id is not null;

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

revoke all on table public.sales, public.sale_items from anon;
revoke all on table public.sales, public.sale_items from authenticated;
grant select on table public.sales, public.sale_items to authenticated;
grant usage on type public.sale_status, public.sale_payment_method to authenticated;

create policy "sales_select_active_membership"
  on public.sales for select to authenticated
  using (public.has_active_business_membership(business_id));

create policy "sale_items_select_active_membership"
  on public.sale_items for select to authenticated
  using (public.has_active_business_membership(business_id));

create function public.confirm_sale(
  target_business_id uuid,
  target_branch_id uuid,
  sale_payment_method public.sale_payment_method,
  requested_items jsonb,
  request_id uuid
)
returns table (
  sale_id uuid,
  sale_number bigint,
  total_cents bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  input_item record;
  balance_quantity numeric(18,3);
  unit_price bigint;
  line_total bigint;
  inserted_sale_id uuid;
  inserted_sale_number bigint;
  inserted_created_at timestamptz;
  calculated_total bigint := 0;
  calculated_item_count integer := 0;
begin
  if auth.uid() is null or not public.has_active_business_role(
    target_business_id, array['owner', 'admin', 'staff']::public.business_role[]
  ) then
    raise exception 'not authorized to confirm sales';
  end if;

  if request_id is null then
    raise exception 'idempotency key is required';
  end if;

  if requested_items is null
    or jsonb_typeof(requested_items) <> 'array'
    or jsonb_array_length(requested_items) = 0 then
    raise exception 'a sale requires at least one item';
  end if;

  -- Serialize retries of the same client intent before observing or writing it.
  perform pg_advisory_xact_lock(hashtextextended(
    target_business_id::text || ':' || auth.uid()::text || ':' || request_id::text, 0
  ));

  select sale.id, sale.sale_number, sale.total_cents, sale.created_at
  into inserted_sale_id, inserted_sale_number, calculated_total, inserted_created_at
  from public.sales sale
  where sale.business_id = target_business_id
    and sale.created_by = auth.uid()
    and sale.idempotency_key = request_id;
  if found then
    return query select inserted_sale_id, inserted_sale_number, calculated_total, inserted_created_at;
    return;
  end if;

  if not exists (
    select 1 from public.branches branch
    where branch.id = target_branch_id
      and branch.business_id = target_business_id
      and branch.is_active
  ) then
    raise exception 'invalid sale branch';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    where item.variant_id is null
      or item.quantity is null
      or item.quantity <= 0
      or item.quantity <> trunc(item.quantity, 3)
      or item.quantity >= 1000000000000000
  ) then
    raise exception 'one or more sale items have an invalid quantity';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    group by item.variant_id
    having count(*) > 1
  ) then
    raise exception 'a variant may appear only once in a sale';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    left join public.product_variants variant
      on variant.id = item.variant_id and variant.business_id = target_business_id
    left join public.products product
      on product.id = variant.product_id and product.business_id = target_business_id
    where variant.id is null or not variant.is_active or product.id is null or not product.is_active
  ) then
    raise exception 'one or more sale variants are invalid';
  end if;

  -- Create zero balances up front, then lock every balance in UUID order. This
  -- makes multi-variant confirmations deterministic and rejects overselling.
  insert into public.inventory_balances (business_id, branch_id, variant_id)
  select target_business_id, target_branch_id, item.variant_id
  from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
  order by item.variant_id
  on conflict (branch_id, variant_id) do nothing;

  insert into public.sales (
    business_id, branch_id, payment_method, total_cents, idempotency_key, created_by
  ) values (
    target_business_id, target_branch_id, sale_payment_method, 0, request_id, auth.uid()
  ) returning id, sale_number, created_at
  into inserted_sale_id, inserted_sale_number, inserted_created_at;

  for input_item in
    select item.variant_id, item.quantity
    from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    order by item.variant_id
  loop
    select balance.quantity into balance_quantity
    from public.inventory_balances balance
    where balance.business_id = target_business_id
      and balance.branch_id = target_branch_id
      and balance.variant_id = input_item.variant_id
    for update;

    if balance_quantity < input_item.quantity then
      raise exception 'insufficient inventory';
    end if;

    select effective.effective_price_cents into unit_price
    from public.variant_effective_prices effective
    where effective.business_id = target_business_id
      and effective.variant_id = input_item.variant_id;
    if unit_price is null then
      raise exception 'sale variant has no effective price';
    end if;

    -- Prices are stored in integer cents. Decimal quantities are supported;
    -- each line rounds to the nearest cent so its stored snapshot is exact.
    line_total := round(input_item.quantity * unit_price)::bigint;

    insert into public.sale_items (
      sale_id, business_id, variant_id, quantity, unit_price_cents, line_total_cents
    ) values (
      inserted_sale_id, target_business_id, input_item.variant_id,
      input_item.quantity, unit_price, line_total
    );

    update public.inventory_balances
    set quantity = balance_quantity - input_item.quantity
    where business_id = target_business_id
      and branch_id = target_branch_id
      and variant_id = input_item.variant_id;

    insert into public.inventory_movements (
      business_id, branch_id, variant_id, type, quantity_delta,
      resulting_quantity, note, created_by, sale_id
    ) values (
      target_business_id, target_branch_id, input_item.variant_id,
      'sale'::public.inventory_movement_type, -input_item.quantity,
      balance_quantity - input_item.quantity, format('Venta %s', inserted_sale_number),
      auth.uid(), inserted_sale_id
    );

    calculated_total := calculated_total + line_total;
    calculated_item_count := calculated_item_count + 1;
  end loop;

  if calculated_item_count = 0 then
    raise exception 'a sale requires at least one item';
  end if;

  update public.sales sale
  set total_cents = calculated_total
  where sale.id = inserted_sale_id and sale.business_id = target_business_id;

  return query select inserted_sale_id, inserted_sale_number, calculated_total, inserted_created_at;
end;
$$;

create function public.list_sales(
  target_business_id uuid,
  target_branch_id uuid default null
)
returns table (
  id uuid,
  sale_number bigint,
  branch_id uuid,
  branch_name text,
  status public.sale_status,
  payment_method public.sale_payment_method,
  total_cents bigint,
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
    raise exception 'not authorized to read sales';
  end if;
  if target_branch_id is not null and not exists (
    select 1 from public.branches branch
    where branch.id = target_branch_id and branch.business_id = target_business_id
  ) then
    raise exception 'invalid sale branch';
  end if;
  return query
  select sale.id, sale.sale_number, sale.branch_id, branch.name, sale.status,
    sale.payment_method, sale.total_cents, sale.created_at, sale.created_by,
    profile.display_name
  from public.sales sale
  join public.branches branch on branch.id = sale.branch_id
  left join public.profiles profile on profile.id = sale.created_by
  where sale.business_id = target_business_id
    and (target_branch_id is null or sale.branch_id = target_branch_id)
  order by sale.created_at desc, sale.id desc;
end;
$$;

create function public.list_sale_items(target_business_id uuid, target_sale_id uuid)
returns table (
  id uuid,
  variant_id uuid,
  quantity numeric,
  unit_price_cents bigint,
  line_total_cents bigint,
  product_name text,
  variant_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_active_business_membership(target_business_id) or not exists (
    select 1 from public.sales sale
    where sale.id = target_sale_id and sale.business_id = target_business_id
  ) then
    raise exception 'not authorized to read sale items';
  end if;
  return query
  select item.id, item.variant_id, item.quantity, item.unit_price_cents,
    item.line_total_cents, product.name, variant.name
  from public.sale_items item
  join public.product_variants variant on variant.id = item.variant_id
  join public.products product on product.id = variant.product_id
  where item.sale_id = target_sale_id and item.business_id = target_business_id
  order by item.created_at, item.id;
end;
$$;

revoke all on function public.confirm_sale(uuid, uuid, public.sale_payment_method, jsonb, uuid) from public;
grant execute on function public.confirm_sale(uuid, uuid, public.sale_payment_method, jsonb, uuid) to authenticated;
revoke all on function public.list_sales(uuid, uuid) from public;
grant execute on function public.list_sales(uuid, uuid) to authenticated;
revoke all on function public.list_sale_items(uuid, uuid) from public;
grant execute on function public.list_sale_items(uuid, uuid) to authenticated;
