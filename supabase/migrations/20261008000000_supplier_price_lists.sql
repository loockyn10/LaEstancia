-- Supplier price lists are an auditable source of supplier offers.  They are
-- deliberately separate from the business catalogue: uploading/interpreting a
-- list never changes a selling price, stock, or current cost.

create type public.supplier_price_list_status as enum ('draft', 'reviewed', 'applied');
create type public.supplier_match_status as enum ('unmatched', 'matched', 'review_required', 'invalid');

create table public.supplier_price_lists (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid not null,
  file_name text not null check (file_name = btrim(file_name) and char_length(file_name) between 1 and 500),
  file_path text not null check (file_path = btrim(file_path) and char_length(file_path) between 1 and 1500),
  file_format text not null check (file_format in ('csv', 'xlsx', 'pdf', 'jpg', 'jpeg', 'png')),
  mime_type text not null check (mime_type = btrim(mime_type) and char_length(mime_type) between 1 and 255),
  list_date date,
  status public.supplier_price_list_status not null default 'draft',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_by uuid references public.profiles (id) on delete set null,
  unique (id, business_id),
  unique (id, supplier_id, business_id),
  foreign key (supplier_id, business_id) references public.suppliers (id, business_id) on delete restrict,
  check ((status = 'applied') = (applied_at is not null))
);
create index supplier_price_lists_business_created_idx on public.supplier_price_lists (business_id, created_at desc);
create index supplier_price_lists_supplier_date_idx on public.supplier_price_lists (supplier_id, list_date desc nulls last, created_at desc);

-- This is the durable resolution of a provider's own code.  A barcode is a
-- product identifier, not a unique supplier purchase option.
create table public.supplier_product_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid not null,
  supplier_code text not null check (supplier_code = btrim(supplier_code) and char_length(supplier_code) between 1 and 200),
  product_variant_id uuid not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (supplier_id, supplier_code),
  foreign key (supplier_id, business_id) references public.suppliers (id, business_id) on delete cascade,
  foreign key (product_variant_id, business_id) references public.product_variants (id, business_id) on delete cascade
);
create index supplier_product_links_variant_idx on public.supplier_product_links (business_id, product_variant_id);

create table public.supplier_catalog_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  supplier_id uuid not null,
  price_list_id uuid not null,
  product_variant_id uuid,
  detected_name text not null check (detected_name = btrim(detected_name) and char_length(detected_name) between 1 and 1000),
  detected_presentation text,
  supplier_code text check (supplier_code is null or (supplier_code = btrim(supplier_code) and char_length(supplier_code) between 1 and 200)),
  detected_sku text check (detected_sku is null or (detected_sku = btrim(detected_sku) and char_length(detected_sku) between 1 and 200)),
  barcode text check (barcode is null or (barcode = btrim(barcode) and char_length(barcode) between 1 and 200)),
  detected_brand text,
  detected_category text,
  suggested_retail_price_cents bigint check (suggested_retail_price_cents is null or suggested_retail_price_cents >= 0),
  image_path text,
  source_reference jsonb not null default '{}'::jsonb check (jsonb_typeof(source_reference) = 'object'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  match_status public.supplier_match_status not null default 'unmatched',
  create_catalog_product boolean not null default false,
  apply_to_catalog boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (price_list_id, supplier_id, business_id) references public.supplier_price_lists (id, supplier_id, business_id) on delete cascade,
  foreign key (product_variant_id, business_id) references public.product_variants (id, business_id) on delete restrict,
  check (detected_presentation is null or (detected_presentation = btrim(detected_presentation) and char_length(detected_presentation) <= 500)),
  check (detected_brand is null or (detected_brand = btrim(detected_brand) and char_length(detected_brand) <= 300)),
  check (detected_category is null or (detected_category = btrim(detected_category) and char_length(detected_category) <= 300)),
  check (image_path is null or (image_path = btrim(image_path) and char_length(image_path) <= 1500))
);
create index supplier_catalog_items_list_idx on public.supplier_catalog_items (price_list_id, created_at);
create index supplier_catalog_items_variant_idx on public.supplier_catalog_items (business_id, product_variant_id) where product_variant_id is not null;
create index supplier_catalog_items_supplier_code_idx on public.supplier_catalog_items (supplier_id, supplier_code) where supplier_code is not null;

create table public.supplier_purchase_options (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  catalog_item_id uuid not null,
  supplier_code text check (supplier_code is null or (supplier_code = btrim(supplier_code) and char_length(supplier_code) between 1 and 200)),
  purchase_unit text not null check (purchase_unit in ('unit', 'box', 'bundle', 'bag', 'other')),
  purchase_unit_label text,
  stock_units_per_purchase numeric(18,3) not null check (stock_units_per_purchase > 0 and stock_units_per_purchase = trunc(stock_units_per_purchase, 3)),
  purchase_price_cents bigint not null check (purchase_price_cents >= 0),
  units_paid integer not null default 1 check (units_paid between 1 and 1000000),
  units_bonus integer not null default 0 check (units_bonus between 0 and 1000000),
  effective_unit_cost_cents bigint generated always as (
    round((purchase_price_cents * units_paid)::numeric / ((units_paid + units_bonus) * stock_units_per_purchase))::bigint
  ) stored,
  is_selected boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (catalog_item_id, business_id) references public.supplier_catalog_items (id, business_id) on delete cascade,
  check (purchase_unit_label is null or (purchase_unit_label = btrim(purchase_unit_label) and char_length(purchase_unit_label) <= 100))
);
create unique index supplier_purchase_options_one_selected_idx on public.supplier_purchase_options (catalog_item_id) where is_selected;
create index supplier_purchase_options_item_idx on public.supplier_purchase_options (catalog_item_id, created_at);

alter table public.supplier_price_lists enable row level security;
alter table public.supplier_product_links enable row level security;
alter table public.supplier_catalog_items enable row level security;
alter table public.supplier_purchase_options enable row level security;
revoke all on table public.supplier_price_lists, public.supplier_product_links, public.supplier_catalog_items, public.supplier_purchase_options from anon, authenticated;
grant select, insert, update, delete on table public.supplier_price_lists, public.supplier_product_links, public.supplier_catalog_items, public.supplier_purchase_options to authenticated;

create function public.set_supplier_price_list_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger supplier_price_lists_set_updated_at before update on public.supplier_price_lists for each row execute function public.set_supplier_price_list_updated_at();
create trigger supplier_product_links_set_updated_at before update on public.supplier_product_links for each row execute function public.set_supplier_price_list_updated_at();
create trigger supplier_catalog_items_set_updated_at before update on public.supplier_catalog_items for each row execute function public.set_supplier_price_list_updated_at();
create trigger supplier_purchase_options_set_updated_at before update on public.supplier_purchase_options for each row execute function public.set_supplier_price_list_updated_at();

create policy "supplier_price_lists_select_membership" on public.supplier_price_lists for select to authenticated using (public.has_active_business_membership(business_id));
create policy "supplier_price_lists_insert_draft_manager" on public.supplier_price_lists for insert to authenticated with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]) and status = 'draft' and created_by = auth.uid() and applied_at is null and applied_by is null);
create policy "supplier_price_lists_update_unapplied_manager" on public.supplier_price_lists for update to authenticated using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]) and status <> 'applied') with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]) and status <> 'applied' and applied_at is null and applied_by is null);
create policy "supplier_price_lists_delete_unapplied_manager" on public.supplier_price_lists for delete to authenticated using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]) and status <> 'applied');
create policy "supplier_product_links_select_manager" on public.supplier_product_links for select to authenticated using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "supplier_catalog_items_select_manager" on public.supplier_catalog_items for select to authenticated using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "supplier_catalog_items_manage_draft" on public.supplier_catalog_items for all to authenticated using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]) and exists (select 1 from public.supplier_price_lists list where list.id = price_list_id and list.business_id = business_id and list.status <> 'applied')) with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "supplier_purchase_options_select_manager" on public.supplier_purchase_options for select to authenticated using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "supplier_purchase_options_manage_draft" on public.supplier_purchase_options for all to authenticated using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]) and exists (select 1 from public.supplier_catalog_items item join public.supplier_price_lists list on list.id = item.price_list_id where item.id = catalog_item_id and item.business_id = business_id and list.status <> 'applied')) with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));

-- Private original documents; the first path segment is always business_id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplier-price-lists', 'supplier-price-lists', false, 52428800, array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
create policy "supplier_price_lists_storage_read" on storage.objects for select to authenticated using (bucket_id = 'supplier-price-lists' and public.has_active_business_membership((storage.foldername(name))[1]::uuid));
create policy "supplier_price_lists_storage_manage" on storage.objects for all to authenticated using (bucket_id = 'supplier-price-lists' and public.has_active_business_role((storage.foldername(name))[1]::uuid, array['owner', 'admin']::public.business_role[])) with check (bucket_id = 'supplier-price-lists' and public.has_active_business_role((storage.foldername(name))[1]::uuid, array['owner', 'admin']::public.business_role[]));

create function public.save_supplier_price_list_items(target_business_id uuid, target_price_list_id uuid, detected_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; option_item jsonb; target_supplier_id uuid; item_id uuid; inserted integer := 0; matched_variant_id uuid; matched_code text;
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
    if matched_code is not null then select product_variant_id into matched_variant_id from public.supplier_product_links where supplier_id = target_supplier_id and supplier_code = matched_code; end if;
    if matched_variant_id is null and nullif(btrim(item ->> 'barcode'), '') is not null then select variant_id into matched_variant_id from public.product_barcodes where business_id = target_business_id and code = btrim(item ->> 'barcode'); end if;
    insert into public.supplier_catalog_items (business_id, supplier_id, price_list_id, product_variant_id, detected_name, detected_presentation, supplier_code, detected_sku, barcode, detected_brand, detected_category, suggested_retail_price_cents, source_reference, warnings, confidence, match_status)
    values (target_business_id, target_supplier_id, target_price_list_id, matched_variant_id, btrim(item ->> 'name'), nullif(btrim(item ->> 'presentation'), ''), matched_code, nullif(btrim(item ->> 'sku'), ''), nullif(btrim(item ->> 'barcode'), ''), nullif(btrim(item ->> 'brand'), ''), nullif(btrim(item ->> 'category'), ''), nullif(item ->> 'suggested_retail_price_cents', '')::bigint, coalesce(item -> 'source_reference', '{}'::jsonb), coalesce(item -> 'warnings', '[]'::jsonb), nullif(item ->> 'confidence', '')::numeric, case when matched_variant_id is not null then 'matched'::public.supplier_match_status when coalesce(jsonb_array_length(item -> 'warnings'), 0) > 0 then 'review_required'::public.supplier_match_status else 'unmatched'::public.supplier_match_status end) returning id into item_id;
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

create function public.apply_supplier_price_list(target_business_id uuid, target_price_list_id uuid)
returns table (catalog_item_id uuid, product_variant_id uuid, effective_unit_cost_cents bigint) language plpgsql security definer set search_path = '' as $$
declare list_record public.supplier_price_lists%rowtype; item_record public.supplier_catalog_items%rowtype; option_record public.supplier_purchase_options%rowtype; target_variant_id uuid; target_product_id uuid; link_code text;
begin
  if auth.uid() is null or not public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) then raise exception 'not authorized to apply supplier price list'; end if;
  select * into list_record from public.supplier_price_lists where id = target_price_list_id and business_id = target_business_id for update;
  if not found then raise exception 'invalid supplier price list'; end if;
  if list_record.status = 'applied' then raise exception 'supplier price list already applied'; end if;
  if exists (select 1 from public.supplier_catalog_items item where item.price_list_id = target_price_list_id and item.business_id = target_business_id and item.apply_to_catalog and not item.create_catalog_product and item.product_variant_id is null) then raise exception 'all selected items require a catalogue match or explicit new product confirmation'; end if;
  for item_record in select * from public.supplier_catalog_items where price_list_id = target_price_list_id and business_id = target_business_id and apply_to_catalog order by created_at loop
    select * into option_record from public.supplier_purchase_options where catalog_item_id = item_record.id and business_id = target_business_id and is_selected;
    if not found then raise exception 'every selected item requires one selected purchase option'; end if;
    target_variant_id := item_record.product_variant_id;
    if target_variant_id is null then
      insert into public.products (business_id, name) values (target_business_id, item_record.detected_name) returning id into target_product_id;
      insert into public.product_variants (business_id, product_id, name) values (target_business_id, target_product_id, coalesce(item_record.detected_presentation, 'Presentación única')) returning id into target_variant_id;
      if item_record.barcode is not null then insert into public.product_barcodes (business_id, variant_id, code, is_primary) values (target_business_id, target_variant_id, item_record.barcode, true); end if;
    end if;
    link_code := coalesce(option_record.supplier_code, item_record.supplier_code);
    if link_code is not null then
      if exists (select 1 from public.supplier_product_links link where link.supplier_id = list_record.supplier_id and link.supplier_code = link_code and link.product_variant_id <> target_variant_id) then raise exception 'supplier code is already linked to another variant'; end if;
      insert into public.supplier_product_links (business_id, supplier_id, supplier_code, product_variant_id, created_by) values (target_business_id, list_record.supplier_id, link_code, target_variant_id, auth.uid()) on conflict (supplier_id, supplier_code) do nothing;
    end if;
    -- This is the existing official cost/current-cost mechanism: its trigger
    -- appends variant_cost_history.  Supplier PVP is intentionally untouched.
    insert into public.variant_costs (variant_id, business_id, amount_cents) values (target_variant_id, target_business_id, option_record.effective_unit_cost_cents) on conflict (variant_id) do update set amount_cents = excluded.amount_cents;
    update public.supplier_catalog_items set product_variant_id = target_variant_id, match_status = 'matched' where id = item_record.id;
    catalog_item_id := item_record.id; product_variant_id := target_variant_id; effective_unit_cost_cents := option_record.effective_unit_cost_cents; return next;
  end loop;
  update public.supplier_price_lists set status = 'applied', applied_at = now(), applied_by = auth.uid() where id = target_price_list_id and business_id = target_business_id;
end;
$$;
revoke all on function public.save_supplier_price_list_items(uuid, uuid, jsonb), public.apply_supplier_price_list(uuid, uuid) from public;
grant execute on function public.save_supplier_price_list_items(uuid, uuid, jsonb), public.apply_supplier_price_list(uuid, uuid) to authenticated;
