-- Security fix: list_inventory_movements is SECURITY DEFINER and only required an active membership, so it
-- bypassed the owner/admin-only SELECT policy that 20261011000000_pos_staff_access.sql put on
-- inventory_movements. Staff could therefore read the full movement history of any variant/branch,
-- including purchase movements, notes and authors, which the product rules keep away from staff.
--
-- The signature, return type and grants are unchanged; only the authorization check becomes owner/admin.
-- Admin never calls this RPC as staff (staff only uses the POS), so no client change is required.
create or replace function public.list_inventory_movements(
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
  if auth.uid() is null or not public.has_active_business_role(
    target_business_id, array['owner', 'admin']::public.business_role[]
  ) then
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
