-- `sale` is an auditable consequence of confirm_sale, never a generic manual
-- inventory operation. Keep the public inventory RPC from creating unlinked
-- sale movements after the enum extension.
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
  if not public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) then
    raise exception 'not authorized to record inventory movements';
  end if;
  if movement_type = 'sale'::public.inventory_movement_type then
    raise exception 'sale movements are created only by confirm_sale';
  end if;
  if movement_quantity is null or movement_quantity <> trunc(movement_quantity, 3) or movement_quantity < 0 or movement_quantity >= 1000000000000000 then
    raise exception 'invalid inventory quantity';
  end if;
  if movement_type in ('initial', 'inbound', 'outbound', 'purchase') and movement_quantity = 0 then
    raise exception 'inventory movement quantity must be greater than zero';
  end if;
  if movement_note is not null and (movement_note <> btrim(movement_note) or char_length(movement_note) > 2000) then
    raise exception 'invalid inventory note';
  end if;
  if not exists (select 1 from public.branches where id = target_branch_id and business_id = target_business_id) then
    raise exception 'invalid inventory branch';
  end if;
  if not exists (select 1 from public.product_variants where id = target_variant_id and business_id = target_business_id) then
    raise exception 'invalid inventory variant';
  end if;
  insert into public.inventory_balances (business_id, branch_id, variant_id)
  values (target_business_id, target_branch_id, target_variant_id)
  on conflict (branch_id, variant_id) do nothing;
  select quantity into current_quantity from public.inventory_balances
  where business_id = target_business_id and branch_id = target_branch_id and variant_id = target_variant_id for update;
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
  if next_quantity < 0 then raise exception 'insufficient inventory'; end if;
  if calculated_delta = 0 then raise exception 'inventory adjustment does not change stock'; end if;
  update public.inventory_balances set quantity = next_quantity
  where business_id = target_business_id and branch_id = target_branch_id and variant_id = target_variant_id;
  insert into public.inventory_movements (business_id, branch_id, variant_id, type, quantity_delta, resulting_quantity, note, created_by)
  values (target_business_id, target_branch_id, target_variant_id, movement_type, calculated_delta, next_quantity, nullif(movement_note, ''), auth.uid())
  returning id into inserted_movement_id;
  return query select inserted_movement_id, calculated_delta, next_quantity;
end;
$$;
