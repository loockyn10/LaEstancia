-- A base selling price can deliberately follow one supplier's PVP. Existing
-- prices predate this feature, so they are conservatively treated as manual.
alter table public.variant_prices
  add column price_source text not null default 'manual'
    check (price_source in ('manual', 'supplier_pvp')),
  add column supplier_id uuid;

alter table public.variant_prices
  add constraint variant_prices_supplier_business_fkey
    foreign key (supplier_id, business_id)
    references public.suppliers (id, business_id)
    on delete restrict,
  add constraint variant_prices_price_source_supplier_check
    check ((price_source = 'supplier_pvp') = (supplier_id is not null));

alter table public.variant_price_history
  add column price_source text check (price_source is null or price_source in ('manual', 'supplier_pvp')),
  add column supplier_id uuid;

-- Record an origin-only change as well: changing a price from manual to a
-- supplier feed is material even if both amounts happen to be equal.
create or replace function public.record_variant_pricing_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

  if tg_table_name = 'variant_prices' then
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

-- Price mutations from the normal UI become manual by construction. This
-- keeps the follow-PVP invariant in PostgreSQL instead of trusting React.
create function public.set_variant_base_price(
  target_business_id uuid,
  target_variant_id uuid,
  target_amount_cents bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_active_business_role(
    target_business_id, array['owner', 'admin']::public.business_role[]
  ) then
    raise exception 'not authorized to set variant price';
  end if;
  if target_amount_cents is not null and target_amount_cents < 0 then
    raise exception 'invalid variant price';
  end if;
  if not exists (
    select 1 from public.product_variants
    where id = target_variant_id and business_id = target_business_id
  ) then
    raise exception 'invalid variant price target';
  end if;

  if target_amount_cents is null then
    delete from public.variant_prices
    where variant_id = target_variant_id and business_id = target_business_id;
  else
    insert into public.variant_prices (
      variant_id, business_id, amount_cents, price_source, supplier_id
    ) values (
      target_variant_id, target_business_id, target_amount_cents, 'manual', null
    ) on conflict (variant_id) do update
      set amount_cents = excluded.amount_cents,
          price_source = 'manual',
          supplier_id = null;
  end if;
end;
$$;

-- A manager must explicitly choose the supplier when more than one PVP is
-- available. The latest applied PVP for that supplier becomes the base price.
create function public.follow_supplier_pvp(
  target_business_id uuid,
  target_variant_id uuid,
  target_supplier_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier_pvp bigint;
begin
  if auth.uid() is null or not public.has_active_business_role(
    target_business_id, array['owner', 'admin']::public.business_role[]
  ) then
    raise exception 'not authorized to follow supplier PVP';
  end if;
  if not exists (
    select 1 from public.product_variants
    where id = target_variant_id and business_id = target_business_id
  ) then
    raise exception 'invalid variant price target';
  end if;

  select item.suggested_retail_price_cents into supplier_pvp
  from public.supplier_catalog_items as item
  join public.supplier_price_lists as list
    on list.id = item.price_list_id and list.business_id = item.business_id
  where item.business_id = target_business_id
    and item.product_variant_id = target_variant_id
    and list.supplier_id = target_supplier_id
    and list.status = 'applied'
    and item.suggested_retail_price_cents is not null
  order by list.applied_at desc nulls last, item.updated_at desc, item.created_at desc
  limit 1;
  if supplier_pvp is null then
    raise exception 'no applied supplier PVP is available for this variant and supplier';
  end if;

  insert into public.variant_prices (
    variant_id, business_id, amount_cents, price_source, supplier_id
  ) values (
    target_variant_id, target_business_id, supplier_pvp, 'supplier_pvp', target_supplier_id
  ) on conflict (variant_id) do update
    set amount_cents = excluded.amount_cents,
        price_source = excluded.price_source,
        supplier_id = excluded.supplier_id;
  return supplier_pvp;
end;
$$;

create function public.get_variant_supplier_pvps(
  target_business_id uuid,
  target_variant_id uuid
)
returns table (
  supplier_id uuid,
  supplier_name text,
  pvp_cents bigint,
  price_list_id uuid,
  applied_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_active_business_role(
    target_business_id, array['owner', 'admin']::public.business_role[]
  ) then
    raise exception 'not authorized to read supplier PVPs';
  end if;
  if not exists (
    select 1 from public.product_variants
    where id = target_variant_id and business_id = target_business_id
  ) then
    raise exception 'invalid variant price target';
  end if;

  return query
  select distinct on (list.supplier_id)
    list.supplier_id,
    supplier.name,
    item.suggested_retail_price_cents,
    list.id,
    list.applied_at
  from public.supplier_catalog_items as item
  join public.supplier_price_lists as list
    on list.id = item.price_list_id and list.business_id = item.business_id
  join public.suppliers as supplier
    on supplier.id = list.supplier_id and supplier.business_id = list.business_id
  where item.business_id = target_business_id
    and item.product_variant_id = target_variant_id
    and list.status = 'applied'
    and item.suggested_retail_price_cents is not null
  order by list.supplier_id, list.applied_at desc nulls last, item.updated_at desc, item.created_at desc;
end;
$$;

-- The existing bulk operation is also an explicit manual intervention.
create or replace function public.adjust_variant_prices(
  target_business_id uuid,
  target_variant_ids uuid[],
  adjustment_percent numeric
)
returns table (variant_id uuid, amount_cents bigint)
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_active_business_role(
    target_business_id, array['owner', 'admin']::public.business_role[]
  ) then
    raise exception 'not authorized to adjust prices';
  end if;
  if coalesce(cardinality(target_variant_ids), 0) = 0 then
    raise exception 'at least one variant is required';
  end if;
  if adjustment_percent < -100 then
    raise exception 'adjustment cannot reduce a price below zero';
  end if;
  if exists (
    select 1 from unnest(target_variant_ids) as requested(variant_id)
    where not exists (
      select 1 from public.product_variants as variant
      where variant.id = requested.variant_id and variant.business_id = target_business_id
    )
  ) then
    raise exception 'one or more variants do not belong to this business';
  end if;
  if exists (
    select 1 from unnest(target_variant_ids) as requested(variant_id)
    where not exists (
      select 1 from public.variant_prices as price
      where price.variant_id = requested.variant_id and price.business_id = target_business_id
    )
  ) then
    raise exception 'one or more variants do not have a current price';
  end if;

  return query
  update public.variant_prices as price
  set amount_cents = round(price.amount_cents * (1 + adjustment_percent / 100))::bigint,
      price_source = 'manual',
      supplier_id = null
  where price.business_id = target_business_id
    and price.variant_id = any(target_variant_ids)
  returning price.variant_id, price.amount_cents;
end;
$$;

-- The only client-side price write path is now the manual RPC above. Catalog
-- imports and supplier application use SECURITY DEFINER routines.
revoke insert, update, delete on public.variant_prices from authenticated;
revoke all on function public.set_variant_base_price(uuid, uuid, bigint), public.follow_supplier_pvp(uuid, uuid, uuid), public.get_variant_supplier_pvps(uuid, uuid) from public;
grant execute on function public.set_variant_base_price(uuid, uuid, bigint), public.follow_supplier_pvp(uuid, uuid, uuid), public.get_variant_supplier_pvps(uuid, uuid) to authenticated;

-- Supplier application updates price only for a new variant or for a variant
-- already following this exact supplier. Manual prices and other suppliers are
-- never overwritten.
create or replace function public.apply_supplier_price_list(target_business_id uuid, target_price_list_id uuid)
returns table (catalog_item_id uuid, product_variant_id uuid, effective_unit_cost_cents bigint) language plpgsql security definer set search_path = '' as $$
declare
  v_list_record public.supplier_price_lists%rowtype;
  v_item_record public.supplier_catalog_items%rowtype;
  v_option_record public.supplier_purchase_options%rowtype;
  v_target_variant_id uuid;
  v_target_product_id uuid;
  v_link_code text;
  v_barcode_variant_id uuid;
  v_barcode_variant_label text;
  v_conflict_record record;
  v_created_barcode_variants jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) then raise exception 'not authorized to apply supplier price list'; end if;
  select spl.* into v_list_record from public.supplier_price_lists as spl where spl.id = target_price_list_id and spl.business_id = target_business_id for update;
  if not found then raise exception 'invalid supplier price list'; end if;
  if v_list_record.status = 'applied' then raise exception 'supplier price list already applied'; end if;
  if exists (select 1 from public.supplier_catalog_items as sci where sci.price_list_id = target_price_list_id and sci.business_id = target_business_id and sci.apply_to_catalog and not sci.create_catalog_product and sci.product_variant_id is null) then raise exception 'all selected items require a catalogue match or explicit new product confirmation'; end if;
  if exists (select 1 from public.supplier_catalog_items as sci where sci.price_list_id = target_price_list_id and sci.business_id = target_business_id and sci.apply_to_catalog and sci.create_catalog_product and sci.product_variant_id is not null) then raise exception 'a matched supplier item cannot also create a new catalogue product'; end if;
  for v_conflict_record in select btrim(sci.barcode) as barcode from public.supplier_catalog_items as sci where sci.price_list_id = target_price_list_id and sci.business_id = target_business_id and sci.apply_to_catalog and sci.barcode is not null group by btrim(sci.barcode) having count(*) > 1 and count(distinct coalesce(sci.product_variant_id::text, 'new:' || lower(btrim(sci.detected_name)) || '|' || lower(btrim(coalesce(sci.detected_presentation, ''))))) > 1 loop
    raise exception 'barcode conflict in supplier list: % is associated with different products', v_conflict_record.barcode;
  end loop;
  for v_item_record in select sci.* from public.supplier_catalog_items as sci where sci.price_list_id = target_price_list_id and sci.business_id = target_business_id and sci.apply_to_catalog order by sci.created_at loop
    select spo.* into v_option_record from public.supplier_purchase_options as spo where spo.catalog_item_id = v_item_record.id and spo.business_id = target_business_id and spo.is_selected;
    if not found then raise exception 'every selected item requires one selected purchase option'; end if;
    v_target_variant_id := v_item_record.product_variant_id;
    v_barcode_variant_id := null;
    v_barcode_variant_label := null;
    if v_item_record.barcode is not null then
      select pb.variant_id, p.name || ' · ' || pv.name into v_barcode_variant_id, v_barcode_variant_label from public.product_barcodes as pb join public.product_variants as pv on pv.id = pb.variant_id and pv.business_id = pb.business_id join public.products as p on p.id = pv.product_id and p.business_id = pv.business_id where pb.business_id = target_business_id and pb.code = v_item_record.barcode;
      if v_barcode_variant_id is not null and v_target_variant_id is null then
        if v_item_record.create_catalog_product then raise exception 'El código de barras % ya está asociado a %', v_item_record.barcode, v_barcode_variant_label; end if;
        v_target_variant_id := v_barcode_variant_id;
        update public.supplier_catalog_items set product_variant_id = v_target_variant_id, create_catalog_product = false, match_status = 'matched', match_reason = 'barcode' where supplier_catalog_items.id = v_item_record.id;
      elsif v_barcode_variant_id is not null and v_target_variant_id <> v_barcode_variant_id then
        raise exception 'El código de barras % ya está asociado a %', v_item_record.barcode, v_barcode_variant_label;
      end if;
    end if;
    if v_target_variant_id is null and v_item_record.barcode is not null and v_created_barcode_variants ? v_item_record.barcode then v_target_variant_id := (v_created_barcode_variants ->> v_item_record.barcode)::uuid; end if;
    if v_target_variant_id is null then
      if not v_item_record.create_catalog_product then raise exception 'all selected items require a catalogue match or explicit new product confirmation'; end if;
      insert into public.products (business_id, name) values (target_business_id, v_item_record.detected_name) returning products.id into v_target_product_id;
      insert into public.product_variants (business_id, product_id, name) values (target_business_id, v_target_product_id, coalesce(v_item_record.detected_presentation, 'Presentación única')) returning product_variants.id into v_target_variant_id;
      if v_item_record.barcode is not null then
        insert into public.product_barcodes (business_id, variant_id, code, is_primary) values (target_business_id, v_target_variant_id, v_item_record.barcode, true);
        v_created_barcode_variants := jsonb_set(v_created_barcode_variants, array[v_item_record.barcode], to_jsonb(v_target_variant_id::text));
      end if;
    end if;
    v_link_code := coalesce(v_option_record.supplier_code, v_item_record.supplier_code);
    if v_link_code is not null then
      if exists (select 1 from public.supplier_product_links as spl where spl.supplier_id = v_list_record.supplier_id and spl.supplier_code = v_link_code and spl.product_variant_id <> v_target_variant_id) then raise exception 'supplier code is already linked to another variant'; end if;
      insert into public.supplier_product_links (business_id, supplier_id, supplier_code, product_variant_id, created_by) values (target_business_id, v_list_record.supplier_id, v_link_code, v_target_variant_id, auth.uid()) on conflict (supplier_id, supplier_code) do nothing;
    end if;
    insert into public.variant_costs (variant_id, business_id, amount_cents) values (v_target_variant_id, target_business_id, v_option_record.effective_unit_cost_cents) on conflict (variant_id) do update set amount_cents = excluded.amount_cents;
    if v_item_record.suggested_retail_price_cents is not null and (
      not exists (select 1 from public.variant_prices as price where price.variant_id = v_target_variant_id)
      or exists (select 1 from public.variant_prices as price where price.variant_id = v_target_variant_id and price.business_id = target_business_id and price.price_source = 'supplier_pvp' and price.supplier_id = v_list_record.supplier_id)
    ) then
      insert into public.variant_prices (variant_id, business_id, amount_cents, price_source, supplier_id)
      values (v_target_variant_id, target_business_id, v_item_record.suggested_retail_price_cents, 'supplier_pvp', v_list_record.supplier_id)
      on conflict (variant_id) do update set amount_cents = excluded.amount_cents, price_source = excluded.price_source, supplier_id = excluded.supplier_id;
    end if;
    update public.supplier_catalog_items set product_variant_id = v_target_variant_id, create_catalog_product = false, match_status = 'matched' where supplier_catalog_items.id = v_item_record.id;
    catalog_item_id := v_item_record.id;
    product_variant_id := v_target_variant_id;
    effective_unit_cost_cents := v_option_record.effective_unit_cost_cents;
    return next;
  end loop;
  update public.supplier_price_lists set status = 'applied', applied_at = now(), applied_by = auth.uid() where supplier_price_lists.id = target_price_list_id and supplier_price_lists.business_id = target_business_id;
end;
$$;
