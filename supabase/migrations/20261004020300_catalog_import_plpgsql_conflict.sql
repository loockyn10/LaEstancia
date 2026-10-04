-- The import function returns a column named variant_id. Prefer table columns
-- when PL/pgSQL resolves SQL identifiers such as ON CONFLICT (variant_id).
create or replace function public.import_catalog_rows(
  target_business_id uuid, target_branch_id uuid default null,
  import_rows jsonb default '[]'::jsonb, update_existing boolean default false
)
returns table (source_row_number integer, outcome text, detail text, product_id uuid, variant_id uuid)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  import_row jsonb;
  row_number integer;
  incoming_product_name text;
  incoming_variant_name text;
  incoming_brand_name text;
  incoming_category_name text;
  incoming_sku text;
  incoming_barcode text;
  incoming_price_cents bigint;
  incoming_cost_cents bigint;
  incoming_stock_quantity numeric(18,3);
  incoming_minimum_quantity numeric(18,3);
  incoming_active boolean;
  has_brand boolean;
  has_category boolean;
  has_price boolean;
  has_cost boolean;
  has_stock boolean;
  has_minimum boolean;
  has_active boolean;
  matched_by_barcode uuid;
  matched_by_sku uuid;
  target_product_id uuid;
  target_variant_id uuid;
  target_brand_id uuid;
  target_category_id uuid;
  matching_name_count integer;
begin
  if not public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) then
    raise exception 'not authorized to import catalog';
  end if;
  if jsonb_typeof(import_rows) <> 'array' or jsonb_array_length(import_rows) = 0 then
    raise exception 'at least one import row is required';
  end if;
  if exists (
    select 1 from jsonb_array_elements(import_rows) as rows(value)
    where nullif(btrim(rows.value ->> 'barcode'), '') is not null
    group by lower(btrim(rows.value ->> 'barcode')) having count(*) > 1
  ) then raise exception 'duplicate barcode within import'; end if;
  if exists (
    select 1 from jsonb_array_elements(import_rows) as rows(value)
    where nullif(btrim(rows.value ->> 'sku'), '') is not null
    group by lower(btrim(rows.value ->> 'sku')) having count(*) > 1
  ) then raise exception 'duplicate sku within import'; end if;

  for import_row in select value from jsonb_array_elements(import_rows) as rows(value) loop
    row_number := nullif(import_row ->> 'row_number', '')::integer;
    incoming_product_name := nullif(btrim(import_row ->> 'product_name'), '');
    incoming_variant_name := coalesce(nullif(btrim(import_row ->> 'variant_name'), ''), 'Presentación única');
    incoming_brand_name := nullif(btrim(import_row ->> 'brand_name'), '');
    incoming_category_name := nullif(btrim(import_row ->> 'category_name'), '');
    incoming_sku := nullif(btrim(import_row ->> 'sku'), '');
    incoming_barcode := nullif(btrim(import_row ->> 'barcode'), '');
    has_brand := coalesce((import_row ->> 'has_brand')::boolean, false);
    has_category := coalesce((import_row ->> 'has_category')::boolean, false);
    has_price := coalesce((import_row ->> 'has_price')::boolean, false);
    has_cost := coalesce((import_row ->> 'has_cost')::boolean, false);
    has_stock := coalesce((import_row ->> 'has_stock')::boolean, false);
    has_minimum := coalesce((import_row ->> 'has_minimum')::boolean, false);
    has_active := coalesce((import_row ->> 'has_active')::boolean, false);
    if row_number is null or incoming_product_name is null then raise exception 'invalid import row'; end if;

    if has_price and nullif(import_row ->> 'price_cents', '') is not null then
      incoming_price_cents := (import_row ->> 'price_cents')::bigint;
      if incoming_price_cents < 0 then raise exception 'invalid price cents'; end if;
    else incoming_price_cents := null; end if;
    if has_cost and nullif(import_row ->> 'cost_cents', '') is not null then
      incoming_cost_cents := (import_row ->> 'cost_cents')::bigint;
      if incoming_cost_cents < 0 then raise exception 'invalid cost cents'; end if;
    else incoming_cost_cents := null; end if;
    if has_stock and nullif(import_row ->> 'stock_quantity', '') is not null then
      incoming_stock_quantity := (import_row ->> 'stock_quantity')::numeric(18,3);
      if incoming_stock_quantity < 0 then raise exception 'invalid stock quantity'; end if;
    else incoming_stock_quantity := null; end if;
    if has_minimum and nullif(import_row ->> 'minimum_quantity', '') is not null then
      incoming_minimum_quantity := (import_row ->> 'minimum_quantity')::numeric(18,3);
      if incoming_minimum_quantity < 0 then raise exception 'invalid minimum quantity'; end if;
    else incoming_minimum_quantity := null; end if;
    if has_active and nullif(import_row ->> 'is_active', '') is not null then
      incoming_active := (import_row ->> 'is_active')::boolean;
    else incoming_active := true; end if;
    if (incoming_stock_quantity is not null or incoming_minimum_quantity is not null) and target_branch_id is null then
      raise exception 'a branch is required when importing stock';
    end if;

    select barcode.variant_id into matched_by_barcode from public.product_barcodes as barcode
    where barcode.business_id = target_business_id and barcode.code = incoming_barcode;
    select variant.id into matched_by_sku from public.product_variants as variant
    where variant.business_id = target_business_id and variant.sku = incoming_sku;
    if matched_by_barcode is not null and matched_by_sku is not null and matched_by_barcode <> matched_by_sku then
      raise exception 'barcode and sku belong to different variants';
    end if;
    target_variant_id := coalesce(matched_by_barcode, matched_by_sku);
    if target_variant_id is null and incoming_barcode is null and incoming_sku is null then
      select count(*) into matching_name_count from public.product_variants as variant
      join public.products as product on product.id = variant.product_id and product.business_id = variant.business_id
      where variant.business_id = target_business_id and lower(btrim(product.name)) = lower(incoming_product_name)
        and lower(btrim(variant.name)) = lower(incoming_variant_name);
      if matching_name_count > 0 then raise exception 'cannot safely re-import a row without barcode or sku'; end if;
    end if;

    target_brand_id := null;
    if (target_variant_id is null or update_existing) and has_brand and incoming_brand_name is not null then
      select brand.id into target_brand_id from public.brands as brand
      where brand.business_id = target_business_id and lower(btrim(brand.name)) = lower(incoming_brand_name);
      if target_brand_id is null then insert into public.brands (business_id, name)
        values (target_business_id, incoming_brand_name) returning id into target_brand_id; end if;
    end if;
    target_category_id := null;
    if (target_variant_id is null or update_existing) and has_category and incoming_category_name is not null then
      select category.id into target_category_id from public.categories as category
      where category.business_id = target_business_id and lower(btrim(category.name)) = lower(incoming_category_name);
      if target_category_id is null then insert into public.categories (business_id, name)
        values (target_business_id, incoming_category_name) returning id into target_category_id; end if;
    end if;

    if target_variant_id is null then
      insert into public.products (business_id, name, brand_id, category_id, is_active)
      values (target_business_id, incoming_product_name, target_brand_id, target_category_id, incoming_active)
      returning id into target_product_id;
      insert into public.product_variants (business_id, product_id, name, sku, is_active)
      values (target_business_id, target_product_id, incoming_variant_name, incoming_sku, incoming_active)
      returning id into target_variant_id;
      if incoming_barcode is not null then
        insert into public.product_barcodes (business_id, variant_id, code, is_primary)
        values (target_business_id, target_variant_id, incoming_barcode, true);
      end if;
      outcome := 'created'; detail := 'Producto y presentación creados.';
    else
      select variant.product_id into target_product_id from public.product_variants as variant
      where variant.id = target_variant_id and variant.business_id = target_business_id;
      if update_existing then
        update public.products set name = incoming_product_name,
          brand_id = case when has_brand then target_brand_id else brand_id end,
          category_id = case when has_category then target_category_id else category_id end,
          is_active = case when has_active then incoming_active else is_active end
        where id = target_product_id and business_id = target_business_id;
        update public.product_variants set name = incoming_variant_name,
          sku = case when incoming_sku is not null then incoming_sku else sku end,
          is_active = case when has_active then incoming_active else is_active end
        where id = target_variant_id and business_id = target_business_id;
        if incoming_barcode is not null and matched_by_barcode is null then
          insert into public.product_barcodes (business_id, variant_id, code, is_primary)
          values (target_business_id, target_variant_id, incoming_barcode, false);
        end if;
        outcome := 'updated'; detail := 'Presentación existente actualizada según las columnas mapeadas.';
      else outcome := 'existing'; detail := 'Presentación existente: no se reemplazó ningún dato.'; end if;
    end if;
    if incoming_price_cents is not null and (outcome = 'created' or update_existing) then
      insert into public.variant_prices (variant_id, business_id, amount_cents)
      values (target_variant_id, target_business_id, incoming_price_cents)
      on conflict (variant_id) do update set amount_cents = excluded.amount_cents;
    end if;
    if incoming_cost_cents is not null and (outcome = 'created' or update_existing) then
      insert into public.variant_costs (variant_id, business_id, amount_cents)
      values (target_variant_id, target_business_id, incoming_cost_cents)
      on conflict (variant_id) do update set amount_cents = excluded.amount_cents;
    end if;
    if incoming_minimum_quantity is not null and (outcome = 'created' or update_existing) then
      perform public.set_inventory_minimum(target_business_id, target_branch_id, target_variant_id, incoming_minimum_quantity);
    end if;
    if incoming_stock_quantity is not null and incoming_stock_quantity > 0 and outcome = 'created' then
      perform public.record_inventory_movement(target_business_id, target_branch_id, target_variant_id,
        'initial'::public.inventory_movement_type, incoming_stock_quantity, format('Importación de catálogo: fila %s', row_number));
    end if;
    source_row_number := row_number; product_id := target_product_id; variant_id := target_variant_id;
    return next;
  end loop;
end;
$$;
