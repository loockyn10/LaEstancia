-- Make supplier-list matching explainable and reject barcode conflicts before
-- the catalogue's unique index has to act as the first line of defence.
alter table public.supplier_catalog_items
  add column match_reason text check (match_reason is null or match_reason in ('supplier_code', 'barcode', 'sku', 'manual'));

create or replace function public.save_supplier_price_list_items(target_business_id uuid, target_price_list_id uuid, detected_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; option_item jsonb; target_supplier_id uuid; item_id uuid; inserted integer := 0; matched_variant_id uuid; matched_code text; matched_reason text;
begin
  if auth.uid() is null or not public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) then raise exception 'not authorized to save supplier price list'; end if;
  select supplier_id into target_supplier_id from public.supplier_price_lists where id = target_price_list_id and business_id = target_business_id and status <> 'applied' for update;
  if not found then raise exception 'invalid or applied supplier price list'; end if;
  if jsonb_typeof(detected_items) <> 'array' then raise exception 'detected items must be an array'; end if;
  delete from public.supplier_catalog_items where price_list_id = target_price_list_id and business_id = target_business_id;
  for item in select value from jsonb_array_elements(detected_items) loop
    if nullif(btrim(item ->> 'name'), '') is null then raise exception 'detected item requires a name'; end if;
    matched_code := nullif(btrim(item ->> 'supplier_code'), '');
    matched_variant_id := null;
    matched_reason := null;
    if matched_code is not null then
      select product_variant_id into matched_variant_id from public.supplier_product_links where supplier_id = target_supplier_id and supplier_code = matched_code;
      if matched_variant_id is not null then matched_reason := 'supplier_code'; end if;
    end if;
    if matched_variant_id is null and nullif(btrim(item ->> 'barcode'), '') is not null then
      select variant_id into matched_variant_id from public.product_barcodes where business_id = target_business_id and code = btrim(item ->> 'barcode');
      if matched_variant_id is not null then matched_reason := 'barcode'; end if;
    end if;
    if matched_variant_id is null and nullif(btrim(item ->> 'sku'), '') is not null then
      select id into matched_variant_id from public.product_variants where business_id = target_business_id and sku = btrim(item ->> 'sku');
      if matched_variant_id is not null then matched_reason := 'sku'; end if;
    end if;
    insert into public.supplier_catalog_items (business_id, supplier_id, price_list_id, product_variant_id, detected_name, detected_presentation, supplier_code, detected_sku, barcode, detected_brand, detected_category, suggested_retail_price_cents, source_reference, warnings, confidence, match_status, match_reason)
    values (target_business_id, target_supplier_id, target_price_list_id, matched_variant_id, btrim(item ->> 'name'), nullif(btrim(item ->> 'presentation'), ''), matched_code, nullif(btrim(item ->> 'sku'), ''), nullif(btrim(item ->> 'barcode'), ''), nullif(btrim(item ->> 'brand'), ''), nullif(btrim(item ->> 'category'), ''), nullif(item ->> 'suggested_retail_price_cents', '')::bigint, coalesce(item -> 'source_reference', '{}'::jsonb), coalesce(item -> 'warnings', '[]'::jsonb), nullif(item ->> 'confidence', '')::numeric, case when matched_variant_id is not null then 'matched'::public.supplier_match_status when coalesce(jsonb_array_length(item -> 'warnings'), 0) > 0 then 'review_required'::public.supplier_match_status else 'unmatched'::public.supplier_match_status end, matched_reason) returning id into item_id;
    if jsonb_typeof(item -> 'purchase_options') <> 'array' or jsonb_array_length(item -> 'purchase_options') = 0 then raise exception 'detected item requires a purchase option'; end if;
    for option_item in select value from jsonb_array_elements(item -> 'purchase_options') loop
      insert into public.supplier_purchase_options (business_id, catalog_item_id, supplier_code, purchase_unit, purchase_unit_label, stock_units_per_purchase, purchase_price_cents, units_paid, units_bonus, is_selected)
      values (target_business_id, item_id, nullif(btrim(option_item ->> 'supplier_code'), ''), coalesce(nullif(option_item ->> 'purchase_unit', ''), 'other'), nullif(btrim(option_item ->> 'purchase_unit_label'), ''), coalesce(nullif(option_item ->> 'stock_units_per_purchase', '')::numeric, 1), (option_item ->> 'purchase_price_cents')::bigint, coalesce(nullif(option_item ->> 'units_paid', '')::integer, 1), coalesce(nullif(option_item ->> 'units_bonus', '')::integer, 0), coalesce((option_item ->> 'is_selected')::boolean, true));
    end loop;
    inserted := inserted + 1;
  end loop;
  update public.supplier_price_lists set status = 'reviewed' where id = target_price_list_id and business_id = target_business_id;
  return inserted;
end;
$$;

create or replace function public.apply_supplier_price_list(target_business_id uuid, target_price_list_id uuid)
returns table (catalog_item_id uuid, product_variant_id uuid, effective_unit_cost_cents bigint) language plpgsql security definer set search_path = '' as $$
declare list_record public.supplier_price_lists%rowtype; item_record public.supplier_catalog_items%rowtype; option_record public.supplier_purchase_options%rowtype; target_variant_id uuid; target_product_id uuid; link_code text; barcode_variant_id uuid; barcode_variant_label text; conflict_record record; created_barcode_variants jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) then raise exception 'not authorized to apply supplier price list'; end if;
  select * into list_record from public.supplier_price_lists where id = target_price_list_id and business_id = target_business_id for update;
  if not found then raise exception 'invalid supplier price list'; end if;
  if list_record.status = 'applied' then raise exception 'supplier price list already applied'; end if;
  if exists (select 1 from public.supplier_catalog_items item where item.price_list_id = target_price_list_id and item.business_id = target_business_id and item.apply_to_catalog and not item.create_catalog_product and item.product_variant_id is null) then raise exception 'all selected items require a catalogue match or explicit new product confirmation'; end if;
  if exists (select 1 from public.supplier_catalog_items item where item.price_list_id = target_price_list_id and item.business_id = target_business_id and item.apply_to_catalog and item.create_catalog_product and item.product_variant_id is not null) then raise exception 'a matched supplier item cannot also create a new catalogue product'; end if;
  for conflict_record in
    select btrim(barcode) as barcode
    from public.supplier_catalog_items
    where price_list_id = target_price_list_id and business_id = target_business_id and apply_to_catalog and barcode is not null
    group by btrim(barcode)
    having count(*) > 1
      and count(distinct coalesce(product_variant_id::text, 'new:' || lower(btrim(detected_name)) || '|' || lower(btrim(coalesce(detected_presentation, ''))))) > 1
  loop
    raise exception 'barcode conflict in supplier list: % is associated with different products', conflict_record.barcode;
  end loop;
  for item_record in select * from public.supplier_catalog_items where price_list_id = target_price_list_id and business_id = target_business_id and apply_to_catalog order by created_at loop
    select * into option_record from public.supplier_purchase_options option where option.catalog_item_id = item_record.id and option.business_id = target_business_id and option.is_selected;
    if not found then raise exception 'every selected item requires one selected purchase option'; end if;
    target_variant_id := item_record.product_variant_id;
    barcode_variant_id := null;
    barcode_variant_label := null;
    if item_record.barcode is not null then
      select barcode.variant_id, product.name || ' · ' || variant.name into barcode_variant_id, barcode_variant_label
      from public.product_barcodes barcode
      join public.product_variants variant on variant.id = barcode.variant_id and variant.business_id = barcode.business_id
      join public.products product on product.id = variant.product_id and product.business_id = variant.business_id
      where barcode.business_id = target_business_id and barcode.code = item_record.barcode;
      if barcode_variant_id is not null and target_variant_id is null then
        if item_record.create_catalog_product then raise exception 'El código de barras % ya está asociado a %', item_record.barcode, barcode_variant_label; end if;
        target_variant_id := barcode_variant_id;
        update public.supplier_catalog_items set product_variant_id = target_variant_id, create_catalog_product = false, match_status = 'matched', match_reason = 'barcode' where id = item_record.id;
      elsif barcode_variant_id is not null and target_variant_id <> barcode_variant_id then
        raise exception 'El código de barras % ya está asociado a %', item_record.barcode, barcode_variant_label;
      end if;
    end if;
    if target_variant_id is null and item_record.barcode is not null and created_barcode_variants ? item_record.barcode then
      target_variant_id := (created_barcode_variants ->> item_record.barcode)::uuid;
    end if;
    if target_variant_id is null then
      if not item_record.create_catalog_product then raise exception 'all selected items require a catalogue match or explicit new product confirmation'; end if;
      insert into public.products (business_id, name) values (target_business_id, item_record.detected_name) returning id into target_product_id;
      insert into public.product_variants (business_id, product_id, name) values (target_business_id, target_product_id, coalesce(item_record.detected_presentation, 'Presentación única')) returning id into target_variant_id;
      if item_record.barcode is not null then
        insert into public.product_barcodes (business_id, variant_id, code, is_primary) values (target_business_id, target_variant_id, item_record.barcode, true);
        created_barcode_variants := jsonb_set(created_barcode_variants, array[item_record.barcode], to_jsonb(target_variant_id::text));
      end if;
    end if;
    link_code := coalesce(option_record.supplier_code, item_record.supplier_code);
    if link_code is not null then
      if exists (select 1 from public.supplier_product_links link where link.supplier_id = list_record.supplier_id and link.supplier_code = link_code and link.product_variant_id <> target_variant_id) then raise exception 'supplier code is already linked to another variant'; end if;
      insert into public.supplier_product_links (business_id, supplier_id, supplier_code, product_variant_id, created_by) values (target_business_id, list_record.supplier_id, link_code, target_variant_id, auth.uid()) on conflict (supplier_id, supplier_code) do nothing;
    end if;
    insert into public.variant_costs (variant_id, business_id, amount_cents) values (target_variant_id, target_business_id, option_record.effective_unit_cost_cents) on conflict (variant_id) do update set amount_cents = excluded.amount_cents;
    update public.supplier_catalog_items set product_variant_id = target_variant_id, create_catalog_product = false, match_status = 'matched' where id = item_record.id;
    catalog_item_id := item_record.id; product_variant_id := target_variant_id; effective_unit_cost_cents := option_record.effective_unit_cost_cents; return next;
  end loop;
  update public.supplier_price_lists set status = 'applied', applied_at = now(), applied_by = auth.uid() where id = target_price_list_id and business_id = target_business_id;
end;
$$;
