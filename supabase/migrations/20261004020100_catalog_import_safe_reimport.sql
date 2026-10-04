-- Preserve existing values when the corresponding spreadsheet column was not
-- mapped. This wrapper is the only client-callable import RPC.

create function public.import_catalog_rows_v2(
  target_business_id uuid,
  target_branch_id uuid default null,
  import_rows jsonb default '[]'::jsonb,
  update_existing boolean default false
)
returns table (
  source_row_number integer,
  outcome text,
  detail text,
  product_id uuid,
  variant_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  import_row jsonb;
  safe_rows jsonb := '[]'::jsonb;
  matched_variant_id uuid;
  preserved_variant_name text;
begin
  if jsonb_typeof(import_rows) <> 'array' then
    raise exception 'at least one import row is required';
  end if;

  for import_row in select value from jsonb_array_elements(import_rows) as rows(value)
  loop
    matched_variant_id := null;
    select barcode.variant_id into matched_variant_id
    from public.product_barcodes as barcode
    where barcode.business_id = target_business_id
      and barcode.code = nullif(btrim(import_row ->> 'barcode'), '');

    if matched_variant_id is null then
      select variant.id into matched_variant_id
      from public.product_variants as variant
      where variant.business_id = target_business_id
        and variant.sku = nullif(btrim(import_row ->> 'sku'), '');
    end if;

    if not coalesce((import_row ->> 'has_variant')::boolean, false)
      and matched_variant_id is not null then
      select variant.name into preserved_variant_name
      from public.product_variants as variant
      where variant.id = matched_variant_id and variant.business_id = target_business_id;
      import_row := jsonb_set(import_row, '{variant_name}', to_jsonb(preserved_variant_name), true);
    end if;

    -- Empty cells are not destructive updates. A user who needs to clear a
    -- reference can do so explicitly in the existing product editor.
    if nullif(btrim(import_row ->> 'brand_name'), '') is null then
      import_row := jsonb_set(import_row, '{has_brand}', 'false'::jsonb, true);
    end if;
    if nullif(btrim(import_row ->> 'category_name'), '') is null then
      import_row := jsonb_set(import_row, '{has_category}', 'false'::jsonb, true);
    end if;
    safe_rows := safe_rows || jsonb_build_array(import_row);
  end loop;

  return query
  select *
  from public.import_catalog_rows(
    target_business_id, target_branch_id, safe_rows, update_existing
  );
end;
$$;

revoke all on function public.import_catalog_rows(uuid, uuid, jsonb, boolean) from authenticated;
revoke all on function public.import_catalog_rows_v2(uuid, uuid, jsonb, boolean) from public;
grant execute on function public.import_catalog_rows_v2(uuid, uuid, jsonb, boolean) to authenticated;
