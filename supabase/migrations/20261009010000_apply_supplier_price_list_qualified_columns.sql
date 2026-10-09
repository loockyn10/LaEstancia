-- `product_variant_id` is an OUT variable of this RPC.  Every relation column
-- is qualified so PL/pgSQL never has to resolve it against an OUT/record name.
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

  select spl.* into v_list_record
  from public.supplier_price_lists as spl
  where spl.id = target_price_list_id and spl.business_id = target_business_id
  for update;
  if not found then raise exception 'invalid supplier price list'; end if;
  if v_list_record.status = 'applied' then raise exception 'supplier price list already applied'; end if;

  if exists (
    select 1 from public.supplier_catalog_items as sci
    where sci.price_list_id = target_price_list_id
      and sci.business_id = target_business_id
      and sci.apply_to_catalog
      and not sci.create_catalog_product
      and sci.product_variant_id is null
  ) then raise exception 'all selected items require a catalogue match or explicit new product confirmation'; end if;

  if exists (
    select 1 from public.supplier_catalog_items as sci
    where sci.price_list_id = target_price_list_id
      and sci.business_id = target_business_id
      and sci.apply_to_catalog
      and sci.create_catalog_product
      and sci.product_variant_id is not null
  ) then raise exception 'a matched supplier item cannot also create a new catalogue product'; end if;

  for v_conflict_record in
    select btrim(sci.barcode) as barcode
    from public.supplier_catalog_items as sci
    where sci.price_list_id = target_price_list_id
      and sci.business_id = target_business_id
      and sci.apply_to_catalog
      and sci.barcode is not null
    group by btrim(sci.barcode)
    having count(*) > 1
      and count(distinct coalesce(sci.product_variant_id::text, 'new:' || lower(btrim(sci.detected_name)) || '|' || lower(btrim(coalesce(sci.detected_presentation, ''))))) > 1
  loop
    raise exception 'barcode conflict in supplier list: % is associated with different products', v_conflict_record.barcode;
  end loop;

  for v_item_record in
    select sci.* from public.supplier_catalog_items as sci
    where sci.price_list_id = target_price_list_id
      and sci.business_id = target_business_id
      and sci.apply_to_catalog
    order by sci.created_at
  loop
    select spo.* into v_option_record
    from public.supplier_purchase_options as spo
    where spo.catalog_item_id = v_item_record.id
      and spo.business_id = target_business_id
      and spo.is_selected;
    if not found then raise exception 'every selected item requires one selected purchase option'; end if;

    v_target_variant_id := v_item_record.product_variant_id;
    v_barcode_variant_id := null;
    v_barcode_variant_label := null;
    if v_item_record.barcode is not null then
      select pb.variant_id, p.name || ' · ' || pv.name
      into v_barcode_variant_id, v_barcode_variant_label
      from public.product_barcodes as pb
      join public.product_variants as pv on pv.id = pb.variant_id and pv.business_id = pb.business_id
      join public.products as p on p.id = pv.product_id and p.business_id = pv.business_id
      where pb.business_id = target_business_id and pb.code = v_item_record.barcode;

      if v_barcode_variant_id is not null and v_target_variant_id is null then
        if v_item_record.create_catalog_product then raise exception 'El código de barras % ya está asociado a %', v_item_record.barcode, v_barcode_variant_label; end if;
        v_target_variant_id := v_barcode_variant_id;
        update public.supplier_catalog_items
        set product_variant_id = v_target_variant_id, create_catalog_product = false, match_status = 'matched', match_reason = 'barcode'
        where supplier_catalog_items.id = v_item_record.id;
      elsif v_barcode_variant_id is not null and v_target_variant_id <> v_barcode_variant_id then
        raise exception 'El código de barras % ya está asociado a %', v_item_record.barcode, v_barcode_variant_label;
      end if;
    end if;

    if v_target_variant_id is null and v_item_record.barcode is not null and v_created_barcode_variants ? v_item_record.barcode then
      v_target_variant_id := (v_created_barcode_variants ->> v_item_record.barcode)::uuid;
    end if;
    if v_target_variant_id is null then
      if not v_item_record.create_catalog_product then raise exception 'all selected items require a catalogue match or explicit new product confirmation'; end if;
      insert into public.products (business_id, name)
      values (target_business_id, v_item_record.detected_name)
      returning products.id into v_target_product_id;
      insert into public.product_variants (business_id, product_id, name)
      values (target_business_id, v_target_product_id, coalesce(v_item_record.detected_presentation, 'Presentación única'))
      returning product_variants.id into v_target_variant_id;
      if v_item_record.barcode is not null then
        insert into public.product_barcodes (business_id, variant_id, code, is_primary)
        values (target_business_id, v_target_variant_id, v_item_record.barcode, true);
        v_created_barcode_variants := jsonb_set(v_created_barcode_variants, array[v_item_record.barcode], to_jsonb(v_target_variant_id::text));
      end if;
    end if;

    v_link_code := coalesce(v_option_record.supplier_code, v_item_record.supplier_code);
    if v_link_code is not null then
      if exists (
        select 1 from public.supplier_product_links as spl
        where spl.supplier_id = v_list_record.supplier_id
          and spl.supplier_code = v_link_code
          and spl.product_variant_id <> v_target_variant_id
      ) then raise exception 'supplier code is already linked to another variant'; end if;
      insert into public.supplier_product_links (business_id, supplier_id, supplier_code, product_variant_id, created_by)
      values (target_business_id, v_list_record.supplier_id, v_link_code, v_target_variant_id, auth.uid())
      on conflict (supplier_id, supplier_code) do nothing;
    end if;

    insert into public.variant_costs (variant_id, business_id, amount_cents)
    values (v_target_variant_id, target_business_id, v_option_record.effective_unit_cost_cents)
    on conflict (variant_id) do update set amount_cents = excluded.amount_cents;
    update public.supplier_catalog_items
    set product_variant_id = v_target_variant_id, create_catalog_product = false, match_status = 'matched'
    where supplier_catalog_items.id = v_item_record.id;

    catalog_item_id := v_item_record.id;
    product_variant_id := v_target_variant_id;
    effective_unit_cost_cents := v_option_record.effective_unit_cost_cents;
    return next;
  end loop;

  update public.supplier_price_lists
  set status = 'applied', applied_at = now(), applied_by = auth.uid()
  where supplier_price_lists.id = target_price_list_id and supplier_price_lists.business_id = target_business_id;
end;
$$;
