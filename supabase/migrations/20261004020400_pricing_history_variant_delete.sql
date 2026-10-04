-- A direct price/cost clear must remain auditable, but a cascade caused by
-- deleting the parent variant cannot create a history row whose FK is gone.
create or replace function public.record_variant_pricing_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.amount_cents is not distinct from new.amount_cents then
    return new;
  end if;

  if tg_op = 'DELETE' and not exists (
    select 1 from public.product_variants
    where id = old.variant_id and business_id = old.business_id
  ) then
    return old;
  end if;

  if tg_table_name = 'variant_prices' then
    insert into public.variant_price_history (
      variant_id, business_id, amount_cents, changed_by
    ) values (
      case when tg_op = 'DELETE' then old.variant_id else new.variant_id end,
      case when tg_op = 'DELETE' then old.business_id else new.business_id end,
      case when tg_op = 'DELETE' then null else new.amount_cents end,
      (select id from public.profiles where id = auth.uid())
    );
  else
    insert into public.variant_cost_history (
      variant_id, business_id, amount_cents, changed_by
    ) values (
      case when tg_op = 'DELETE' then old.variant_id else new.variant_id end,
      case when tg_op = 'DELETE' then old.business_id else new.business_id end,
      case when tg_op = 'DELETE' then null else new.amount_cents end,
      (select id from public.profiles where id = auth.uid())
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
