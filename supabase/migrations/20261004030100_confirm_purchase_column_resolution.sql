-- confirm_purchase returns a column named purchase_id. Qualify its table
-- references so the OUT column cannot shadow purchase_items.purchase_id.
create or replace function public.confirm_purchase(target_business_id uuid, target_purchase_id uuid)
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
  if not found then raise exception 'invalid purchase'; end if;
  if locked_purchase.status <> 'draft' then raise exception 'only draft purchases can be confirmed'; end if;
  if not exists (
    select 1 from public.branches branch
    where branch.id = locked_purchase.branch_id and branch.business_id = target_business_id
  ) then raise exception 'invalid purchase branch'; end if;
  if locked_purchase.supplier_id is not null and not exists (
    select 1 from public.suppliers supplier
    where supplier.id = locked_purchase.supplier_id and supplier.business_id = target_business_id
  ) then raise exception 'invalid purchase supplier'; end if;
  if not exists (
    select 1 from public.purchase_items item
    where item.purchase_id = target_purchase_id and item.business_id = target_business_id
  ) then raise exception 'a purchase requires at least one item'; end if;
  if exists (
    select 1 from public.purchase_items item
    where item.purchase_id = target_purchase_id
      and (item.business_id <> target_business_id or item.quantity <= 0 or item.unit_cost_cents < 0
        or not exists (select 1 from public.product_variants variant where variant.id = item.variant_id and variant.business_id = target_business_id))
  ) then raise exception 'one or more purchase items are invalid'; end if;

  for purchase_item in
    select item.* from public.purchase_items item
    where item.purchase_id = target_purchase_id and item.business_id = target_business_id
    order by item.id
  loop
    select * into inventory_result from public.record_inventory_movement(
      target_business_id, locked_purchase.branch_id, purchase_item.variant_id,
      'purchase'::public.inventory_movement_type, purchase_item.quantity,
      format('Compra %s', target_purchase_id)
    );
    update public.inventory_movements movement
    set purchase_id = target_purchase_id
    where movement.id = inventory_result.movement_id and movement.business_id = target_business_id;
    insert into public.variant_costs (variant_id, business_id, amount_cents)
    values (purchase_item.variant_id, target_business_id, purchase_item.unit_cost_cents)
    on conflict (variant_id) do update set amount_cents = excluded.amount_cents;
    calculated_item_count := calculated_item_count + 1;
    calculated_total := calculated_total + (purchase_item.quantity * purchase_item.unit_cost_cents);
  end loop;

  update public.purchases purchase
  set status = 'confirmed'
  where purchase.id = target_purchase_id and purchase.business_id = target_business_id;
  return query select target_purchase_id, now(), calculated_item_count, calculated_total;
end;
$$;
