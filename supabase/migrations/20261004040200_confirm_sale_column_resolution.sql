-- confirm_sale returns sale_number as an OUT column. Qualify the INSERT
-- target in RETURNING so PL/pgSQL never resolves it as that output variable.
create or replace function public.confirm_sale(
  target_business_id uuid,
  target_branch_id uuid,
  sale_payment_method public.sale_payment_method,
  requested_items jsonb,
  request_id uuid
)
returns table (sale_id uuid, sale_number bigint, total_cents bigint, created_at timestamptz)
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
  ) then raise exception 'not authorized to confirm sales'; end if;
  if request_id is null then raise exception 'idempotency key is required'; end if;
  if requested_items is null or jsonb_typeof(requested_items) <> 'array' or jsonb_array_length(requested_items) = 0 then
    raise exception 'a sale requires at least one item';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_business_id::text || ':' || auth.uid()::text || ':' || request_id::text, 0));
  select sale.id, sale.sale_number, sale.total_cents, sale.created_at
  into inserted_sale_id, inserted_sale_number, calculated_total, inserted_created_at
  from public.sales sale
  where sale.business_id = target_business_id and sale.created_by = auth.uid() and sale.idempotency_key = request_id;
  if found then
    return query select inserted_sale_id, inserted_sale_number, calculated_total, inserted_created_at;
    return;
  end if;
  if not exists (
    select 1 from public.branches branch
    where branch.id = target_branch_id and branch.business_id = target_business_id and branch.is_active
  ) then raise exception 'invalid sale branch'; end if;
  if exists (
    select 1 from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    where item.variant_id is null or item.quantity is null or item.quantity <= 0
      or item.quantity <> trunc(item.quantity, 3) or item.quantity >= 1000000000000000
  ) then raise exception 'one or more sale items have an invalid quantity'; end if;
  if exists (
    select 1 from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    group by item.variant_id having count(*) > 1
  ) then raise exception 'a variant may appear only once in a sale'; end if;
  if exists (
    select 1 from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    left join public.product_variants variant on variant.id = item.variant_id and variant.business_id = target_business_id
    left join public.products product on product.id = variant.product_id and product.business_id = target_business_id
    where variant.id is null or not variant.is_active or product.id is null or not product.is_active
  ) then raise exception 'one or more sale variants are invalid'; end if;
  insert into public.inventory_balances (business_id, branch_id, variant_id)
  select target_business_id, target_branch_id, item.variant_id
  from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
  order by item.variant_id on conflict (branch_id, variant_id) do nothing;
  insert into public.sales as sale (business_id, branch_id, payment_method, total_cents, idempotency_key, created_by)
  values (target_business_id, target_branch_id, sale_payment_method, 0, request_id, auth.uid())
  returning sale.id, sale.sale_number, sale.created_at
  into inserted_sale_id, inserted_sale_number, inserted_created_at;
  for input_item in
    select item.variant_id, item.quantity
    from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    order by item.variant_id
  loop
    select balance.quantity into balance_quantity
    from public.inventory_balances balance
    where balance.business_id = target_business_id and balance.branch_id = target_branch_id and balance.variant_id = input_item.variant_id
    for update;
    if balance_quantity < input_item.quantity then raise exception 'insufficient inventory'; end if;
    select effective.effective_price_cents into unit_price
    from public.variant_effective_prices effective
    where effective.business_id = target_business_id and effective.variant_id = input_item.variant_id;
    if unit_price is null then raise exception 'sale variant has no effective price'; end if;
    line_total := round(input_item.quantity * unit_price)::bigint;
    insert into public.sale_items (sale_id, business_id, variant_id, quantity, unit_price_cents, line_total_cents)
    values (inserted_sale_id, target_business_id, input_item.variant_id, input_item.quantity, unit_price, line_total);
    update public.inventory_balances
    set quantity = balance_quantity - input_item.quantity
    where business_id = target_business_id and branch_id = target_branch_id and variant_id = input_item.variant_id;
    insert into public.inventory_movements (business_id, branch_id, variant_id, type, quantity_delta, resulting_quantity, note, created_by, sale_id)
    values (target_business_id, target_branch_id, input_item.variant_id, 'sale'::public.inventory_movement_type,
      -input_item.quantity, balance_quantity - input_item.quantity, format('Venta %s', inserted_sale_number), auth.uid(), inserted_sale_id);
    calculated_total := calculated_total + line_total;
    calculated_item_count := calculated_item_count + 1;
  end loop;
  if calculated_item_count = 0 then raise exception 'a sale requires at least one item'; end if;
  update public.sales sale set total_cents = calculated_total
  where sale.id = inserted_sale_id and sale.business_id = target_business_id;
  return query select inserted_sale_id, inserted_sale_number, calculated_total, inserted_created_at;
end;
$$;
