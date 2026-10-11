-- Supplier-PVP pricing matrix. Run only against a project where the supplier
-- list migrations, 20261009020000_supplier_pvp_price_source.sql, and its
-- record_variant_pricing_history correction are applied.
begin;

create temporary table supplier_pvp_results (test_name text primary key, result text not null) on commit drop;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-000000000901', 'authenticated', 'authenticated', 'supplier-pvp-owner-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000902', 'authenticated', 'authenticated', 'supplier-pvp-staff-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000903', 'authenticated', 'authenticated', 'supplier-pvp-owner-b@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-000000000901', 'supplier pvp owner A'),
  ('00000000-0000-4000-8000-000000000902', 'supplier pvp staff A'),
  ('00000000-0000-4000-8000-000000000903', 'supplier pvp owner B');
insert into public.businesses (id, name) values
  ('00000000-0000-4000-8000-000000000911', 'supplier pvp business A'),
  ('00000000-0000-4000-8000-000000000912', 'supplier pvp business B');
insert into public.business_memberships (business_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000901', 'owner'),
  ('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000902', 'staff'),
  ('00000000-0000-4000-8000-000000000912', '00000000-0000-4000-8000-000000000903', 'owner');
insert into public.branches (id, business_id, name) values
  ('00000000-0000-4000-8000-000000000914', '00000000-0000-4000-8000-000000000911', 'PVP Branch A');
insert into public.suppliers (id, business_id, name) values
  ('00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000911', 'PVP Supplier A'),
  ('00000000-0000-4000-8000-000000000922', '00000000-0000-4000-8000-000000000912', 'PVP Supplier B');
insert into public.products (id, business_id, name) values
  ('00000000-0000-4000-8000-000000000931', '00000000-0000-4000-8000-000000000911', 'Existing following PVP'),
  ('00000000-0000-4000-8000-000000000932', '00000000-0000-4000-8000-000000000911', 'Existing manual'),
  ('00000000-0000-4000-8000-000000000933', '00000000-0000-4000-8000-000000000912', 'Business B product');
insert into public.product_variants (id, business_id, product_id, name, sku) values
  ('00000000-0000-4000-8000-000000000941', '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000931', 'Única', 'PVP-FOLLOW'),
  ('00000000-0000-4000-8000-000000000942', '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000932', 'Única', 'PVP-MANUAL'),
  ('00000000-0000-4000-8000-000000000943', '00000000-0000-4000-8000-000000000912', '00000000-0000-4000-8000-000000000933', 'Única', 'PVP-B');
insert into public.variant_prices (variant_id, business_id, amount_cents, price_source, supplier_id) values
  ('00000000-0000-4000-8000-000000000941', '00000000-0000-4000-8000-000000000911', 5900000, 'supplier_pvp', '00000000-0000-4000-8000-000000000921'),
  ('00000000-0000-4000-8000-000000000942', '00000000-0000-4000-8000-000000000911', 6700000, 'manual', null),
  ('00000000-0000-4000-8000-000000000943', '00000000-0000-4000-8000-000000000912', 3300000, 'manual', null);
insert into public.variant_costs (variant_id, business_id, amount_cents) values
  ('00000000-0000-4000-8000-000000000941', '00000000-0000-4000-8000-000000000911', 4900000),
  ('00000000-0000-4000-8000-000000000943', '00000000-0000-4000-8000-000000000912', 2900000);
delete from public.variant_costs
where variant_id = '00000000-0000-4000-8000-000000000943';

insert into public.supplier_price_lists (id, business_id, supplier_id, file_name, file_path, file_format, mime_type, created_by) values
  ('00000000-0000-4000-8000-000000000951', '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000921', 'pvp.csv', '00000000-0000-4000-8000-000000000911/951/original.csv', 'csv', 'text/csv', '00000000-0000-4000-8000-000000000901');
insert into public.supplier_catalog_items (id, business_id, supplier_id, price_list_id, product_variant_id, detected_name, supplier_code, suggested_retail_price_cents, create_catalog_product, apply_to_catalog) values
  ('00000000-0000-4000-8000-000000000961', '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000951', null, 'New with PVP', 'NEW-PVP', 5900000, true, true),
  ('00000000-0000-4000-8000-000000000962', '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000951', null, 'New without PVP', 'NEW-NO-PVP', null, true, true),
  ('00000000-0000-4000-8000-000000000963', '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000951', '00000000-0000-4000-8000-000000000941', 'Existing following PVP', 'FOLLOW', 6400000, false, true),
  ('00000000-0000-4000-8000-000000000964', '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000951', '00000000-0000-4000-8000-000000000942', 'Existing manual', 'MANUAL', 7000000, false, true);
insert into public.supplier_purchase_options (business_id, catalog_item_id, purchase_unit, stock_units_per_purchase, purchase_price_cents, units_paid, units_bonus, is_selected)
select '00000000-0000-4000-8000-000000000911', id, 'unit', 1, 100000, 1, 0, true from public.supplier_catalog_items where price_list_id = '00000000-0000-4000-8000-000000000951';

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000901';
set local role authenticated;
insert into public.purchases (id, business_id, supplier_id, branch_id, purchase_date, created_by) values
  ('00000000-0000-4000-8000-000000000971', '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000914', current_date, auth.uid());
insert into public.purchase_items (purchase_id, business_id, variant_id, quantity, unit_cost_cents) values
  ('00000000-0000-4000-8000-000000000971', '00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000941', 1, 5100000);
select * from public.confirm_purchase('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000971');
select * from public.apply_supplier_price_list('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000951');
set local role postgres;
do $$ begin
  if not exists (select 1 from public.variant_prices where business_id = '00000000-0000-4000-8000-000000000911' and amount_cents = 5900000 and price_source = 'supplier_pvp' and supplier_id = '00000000-0000-4000-8000-000000000921' and variant_id = (select product_variant_id from public.supplier_catalog_items where id = '00000000-0000-4000-8000-000000000961')) then raise exception 'new product PVP was not applied'; end if;
  if exists (select 1 from public.variant_prices where variant_id = (select product_variant_id from public.supplier_catalog_items where id = '00000000-0000-4000-8000-000000000962')) then raise exception 'new product without PVP received a price'; end if;
  if not exists (select 1 from public.variant_prices where variant_id = '00000000-0000-4000-8000-000000000941' and amount_cents = 6400000 and price_source = 'supplier_pvp') then raise exception 'following PVP did not update'; end if;
  if not exists (select 1 from public.variant_prices where variant_id = '00000000-0000-4000-8000-000000000942' and amount_cents = 6700000 and price_source = 'manual') then raise exception 'manual price was overwritten'; end if;
  if not exists (select 1 from public.variant_price_history where variant_id = '00000000-0000-4000-8000-000000000941' and amount_cents = 5900000 and price_source = 'supplier_pvp' and supplier_id = '00000000-0000-4000-8000-000000000921' and changed_at is not null) then raise exception 'initial PVP price history missing'; end if;
  if not exists (select 1 from public.variant_price_history where variant_id = '00000000-0000-4000-8000-000000000941' and amount_cents = 6400000 and price_source = 'supplier_pvp' and supplier_id = '00000000-0000-4000-8000-000000000921' and changed_at is not null) then raise exception 'PVP price history missing'; end if;
  if not exists (select 1 from public.variant_cost_history where variant_id = '00000000-0000-4000-8000-000000000941' and amount_cents = 4900000 and changed_at is not null)
    or not exists (select 1 from public.variant_cost_history where variant_id = '00000000-0000-4000-8000-000000000941' and amount_cents = 5100000 and changed_at is not null)
    or not exists (select 1 from public.variant_cost_history where variant_id = '00000000-0000-4000-8000-000000000941' and amount_cents = 100000 and changed_at is not null)
    or not exists (select 1 from public.variant_costs where variant_id = '00000000-0000-4000-8000-000000000941' and amount_cents = 100000) then raise exception 'cost history did not preserve initial, purchase, and supplier-list updates'; end if;
  if not exists (select 1 from public.variant_cost_history where variant_id = '00000000-0000-4000-8000-000000000943' and amount_cents = 2900000)
    or not exists (select 1 from public.variant_cost_history where variant_id = '00000000-0000-4000-8000-000000000943' and amount_cents is null) then raise exception 'cost insert/delete history missing'; end if;
  if not exists (select 1 from public.supplier_price_lists where id = '00000000-0000-4000-8000-000000000951' and status = 'applied') then raise exception 'supplier list was not applied atomically'; end if;
  if not exists (select 1 from public.supplier_catalog_items where id = '00000000-0000-4000-8000-000000000964' and suggested_retail_price_cents = 7000000) then raise exception 'supplier PVP reference was not preserved'; end if;
  insert into supplier_pvp_results values ('lista: transacción, precios y costos con historial', 'PASS');
end $$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000901'; set local role authenticated;
select public.set_variant_base_price('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000941', 6200000);
select public.follow_supplier_pvp('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000941', '00000000-0000-4000-8000-000000000921');
set local role postgres;
do $$ begin
  if not exists (select 1 from public.variant_prices where variant_id = '00000000-0000-4000-8000-000000000941' and amount_cents = 6400000 and price_source = 'supplier_pvp' and supplier_id = '00000000-0000-4000-8000-000000000921') then raise exception 'follow PVP did not restore current supplier PVP'; end if;
  if not exists (select 1 from public.variant_price_history where variant_id = '00000000-0000-4000-8000-000000000941' and amount_cents = 6200000 and price_source = 'manual' and supplier_id is null and changed_at is not null) then raise exception 'manual price history missing'; end if;
  insert into supplier_pvp_results values ('manual y volver a seguir PVP', 'PASS');
end $$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000902'; set local role authenticated;
do $$ begin perform public.set_variant_base_price('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000941', 1); raise exception 'staff price update accepted'; exception when others then if sqlerrm <> 'not authorized to set variant price' then raise; end if; end $$;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000901';
do $$ begin perform public.set_variant_base_price('00000000-0000-4000-8000-000000000912', '00000000-0000-4000-8000-000000000943', 1); raise exception 'cross-business update accepted'; exception when others then if sqlerrm <> 'not authorized to set variant price' then raise; end if; end $$;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000903';
select public.set_variant_base_price('00000000-0000-4000-8000-000000000912', '00000000-0000-4000-8000-000000000943', null);
set local role postgres;
do $$ begin
  if exists (select 1 from public.variant_prices where variant_id = '00000000-0000-4000-8000-000000000943') then raise exception 'business B price was not deleted by its owner'; end if;
  if not exists (select 1 from public.variant_price_history where variant_id = '00000000-0000-4000-8000-000000000943' and amount_cents is null and price_source = 'manual' and changed_at is not null) then raise exception 'price delete history missing'; end if;
  insert into supplier_pvp_results values ('staff, business aislados y delete histórico', 'PASS');
end $$;

select * from supplier_pvp_results order by test_name;
rollback;
