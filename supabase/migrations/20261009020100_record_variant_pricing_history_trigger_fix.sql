-- `record_variant_pricing_history` is shared by variant_prices and
-- variant_costs. Branch before reading price-only fields so cost writes keep
-- their established append-only history behavior.
create or replace function public.record_variant_pricing_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'variant_prices' then
    if tg_op = 'UPDATE'
      and old.amount_cents is not distinct from new.amount_cents
      and old.price_source is not distinct from new.price_source
      and old.supplier_id is not distinct from new.supplier_id then
      return new;
    end if;

    if tg_op = 'DELETE' and not exists (
      select 1 from public.product_variants
      where id = old.variant_id and business_id = old.business_id
    ) then
      return old;
    end if;

    insert into public.variant_price_history (
      variant_id, business_id, amount_cents, changed_by, price_source, supplier_id
    ) values (
      case when tg_op = 'DELETE' then old.variant_id else new.variant_id end,
      case when tg_op = 'DELETE' then old.business_id else new.business_id end,
      case when tg_op = 'DELETE' then null else new.amount_cents end,
      (select id from public.profiles where id = auth.uid()),
      case when tg_op = 'DELETE' then old.price_source else new.price_source end,
      case when tg_op = 'DELETE' then old.supplier_id else new.supplier_id end
    );
  elsif tg_table_name = 'variant_costs' then
    if tg_op = 'UPDATE' and old.amount_cents is not distinct from new.amount_cents then
      return new;
    end if;

    if tg_op = 'DELETE' and not exists (
      select 1 from public.product_variants
      where id = old.variant_id and business_id = old.business_id
    ) then
      return old;
    end if;

    insert into public.variant_cost_history (
      variant_id, business_id, amount_cents, changed_by
    ) values (
      case when tg_op = 'DELETE' then old.variant_id else new.variant_id end,
      case when tg_op = 'DELETE' then old.business_id else new.business_id end,
      case when tg_op = 'DELETE' then null else new.amount_cents end,
      (select id from public.profiles where id = auth.uid())
    );
  else
    raise exception 'unsupported pricing history trigger table: %', tg_table_name;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
