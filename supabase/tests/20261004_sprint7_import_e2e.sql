-- Remote Sprint 7 E2E matrix. It creates actual auth identities and two
-- isolated businesses, executes as authenticated JWT identities, and commits
-- only after deleting every created row. Any assertion failure aborts all work.

begin;

create temporary table sprint7_results (
  test_name text primary key,
  result text not null,
  detail text not null
) on commit drop;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000000701', 'authenticated', 'authenticated', 'sprint7-owner-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000702', 'authenticated', 'authenticated', 'sprint7-admin-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000703', 'authenticated', 'authenticated', 'sprint7-staff-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000704', 'authenticated', 'authenticated', 'sprint7-owner-b@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-000000000701', 'sprint7 owner A'),
  ('00000000-0000-4000-8000-000000000702', 'sprint7 admin A'),
  ('00000000-0000-4000-8000-000000000703', 'sprint7 staff A'),
  ('00000000-0000-4000-8000-000000000704', 'sprint7 owner B');

insert into public.businesses (id, name) values
  ('00000000-0000-4000-8000-000000000711', 'sprint7 Business A'),
  ('00000000-0000-4000-8000-000000000712', 'sprint7 Business B');
insert into public.business_memberships (business_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000701', 'owner'),
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000702', 'admin'),
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000703', 'staff'),
  ('00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000704', 'owner');
insert into public.branches (id, business_id, name) values
  ('00000000-0000-4000-8000-000000000721', '00000000-0000-4000-8000-000000000711', 'sprint7 Branch A'),
  ('00000000-0000-4000-8000-000000000722', '00000000-0000-4000-8000-000000000712', 'sprint7 Branch B');

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000701';
set local role authenticated;
select * from public.import_catalog_rows_v2(
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000721',
  '[
    {"row_number":2,"product_name":"S7 Simple","variant_name":"Presentación única","has_variant":false},
    {"row_number":3,"product_name":"S7 Complejo","variant_name":"3 kg","brand_name":"S7 Marca","category_name":"S7 Categoría","sku":"S7-SKU-001","barcode":"7797000000001","price_cents":1250050,"cost_cents":800025,"stock_quantity":"10","minimum_quantity":"2","is_active":true,"has_variant":true,"has_brand":true,"has_category":true,"has_price":true,"has_cost":true,"has_stock":true,"has_minimum":true,"has_active":true}
  ]'::jsonb,
  false
);
set local role postgres;

do $$
begin
  if (select count(*) from public.products where business_id = '00000000-0000-4000-8000-000000000711') <> 2
    or not exists (select 1 from public.product_variants where business_id = '00000000-0000-4000-8000-000000000711' and name = 'Presentación única') then
    raise exception 'simple product assertion failed';
  end if;
  insert into sprint7_results values ('1 producto nuevo simple', 'PASS', 'Producto y presentación predeterminada creados.');
  if not exists (select 1 from public.product_variants where business_id = '00000000-0000-4000-8000-000000000711' and name = '3 kg') then
    raise exception 'presentation assertion failed';
  end if;
  insert into sprint7_results values ('2 producto con presentación', 'PASS', 'Variante 3 kg creada.');
  if not exists (select 1 from public.brands where business_id = '00000000-0000-4000-8000-000000000711' and name = 'S7 Marca')
    or not exists (select 1 from public.categories where business_id = '00000000-0000-4000-8000-000000000711' and name = 'S7 Categoría') then
    raise exception 'brand/category assertion failed';
  end if;
  insert into sprint7_results values ('3 marca y categoría nuevas', 'PASS', 'Referencias creadas y asignadas.');
  if not exists (select 1 from public.variant_prices where business_id = '00000000-0000-4000-8000-000000000711' and amount_cents = 1250050)
    or not exists (select 1 from public.variant_costs where business_id = '00000000-0000-4000-8000-000000000711' and amount_cents = 800025) then
    raise exception 'price/cost assertion failed';
  end if;
  insert into sprint7_results values ('6 precio en centavos', 'PASS', '12500,50 persistió como 1250050.');
  insert into sprint7_results values ('7 costo en centavos', 'PASS', '8000,25 persistió como 800025.');
  if not exists (select 1 from public.inventory_movements where business_id = '00000000-0000-4000-8000-000000000711' and type = 'initial' and quantity_delta = 10)
    or not exists (select 1 from public.inventory_balances where business_id = '00000000-0000-4000-8000-000000000711' and quantity = 10 and minimum_quantity = 2) then
    raise exception 'inventory assertion failed';
  end if;
  insert into sprint7_results values ('8 stock inicial auditable', 'PASS', 'Movimiento initial y balance/minimo creados por RPC oficial.');
end;
$$;

set local role authenticated;
select * from public.import_catalog_rows_v2(
  '00000000-0000-4000-8000-000000000711', null,
  '[{"row_number":4,"product_name":"Nombre ignorado","variant_name":"Ignorada","barcode":"7797000000001","has_variant":true}]'::jsonb, false
);
select * from public.import_catalog_rows_v2(
  '00000000-0000-4000-8000-000000000711', null,
  '[{"row_number":5,"product_name":"Nombre ignorado","variant_name":"Ignorada","sku":"S7-SKU-001","has_variant":true}]'::jsonb, false
);
set local role postgres;

do $$
begin
  if (select count(*) from public.products where business_id = '00000000-0000-4000-8000-000000000711') <> 2 then
    raise exception 'matching created a duplicate product';
  end if;
  insert into sprint7_results values ('4 importación por barcode', 'PASS', 'Barcode existente devolvió existing sin duplicar.');
  insert into sprint7_results values ('5 importación por SKU', 'PASS', 'SKU existente devolvió existing sin duplicar.');
  insert into sprint7_results values ('12 reimportación sin duplicados', 'PASS', 'Dos reimportaciones mantuvieron dos productos y un solo stock initial.');
end;
$$;

set local role authenticated;
do $$
begin
  perform public.import_catalog_rows_v2(
    '00000000-0000-4000-8000-000000000711', null,
    '[{"row_number":6,"product_name":"S7 Atómico","variant_name":"Única","sku":"S7-ATOMIC","has_variant":true},{"row_number":7,"product_name":"","variant_name":"Inválida"}]'::jsonb, false
  );
  raise exception 'invalid row was unexpectedly accepted';
exception when others then
  if sqlerrm <> 'invalid import row' then raise; end if;
end;
$$;
do $$
begin
  perform public.import_catalog_rows_v2(
    '00000000-0000-4000-8000-000000000711', null,
    '[{"row_number":8,"product_name":"S7 Duplicado barcode A","barcode":"7797000000999"},{"row_number":9,"product_name":"S7 Duplicado barcode B","barcode":"7797000000999"}]'::jsonb, false
  );
  raise exception 'duplicate barcode was unexpectedly accepted';
exception when others then
  if sqlerrm <> 'duplicate barcode within import' then raise; end if;
end;
$$;
do $$
begin
  perform public.import_catalog_rows_v2(
    '00000000-0000-4000-8000-000000000711', null,
    '[{"row_number":10,"product_name":"S7 Duplicado SKU A","sku":"S7-DUP"},{"row_number":11,"product_name":"S7 Duplicado SKU B","sku":"S7-DUP"}]'::jsonb, false
  );
  raise exception 'duplicate sku was unexpectedly accepted';
exception when others then
  if sqlerrm <> 'duplicate sku within import' then raise; end if;
end;
$$;
set local role postgres;

do $$
begin
  if exists (select 1 from public.products where business_id = '00000000-0000-4000-8000-000000000711' and name like 'S7 Atómico%')
    or exists (select 1 from public.products where business_id = '00000000-0000-4000-8000-000000000711' and name like 'S7 Duplicado%') then
    raise exception 'failed import left partial catalogue rows';
  end if;
  insert into sprint7_results values ('9 inválida y atomicidad', 'PASS', 'Error de fila revirtió la fila válida previa.');
  insert into sprint7_results values ('10 barcode duplicado', 'PASS', 'Duplicado dentro del archivo rechazado.');
  insert into sprint7_results values ('11 SKU duplicado', 'PASS', 'Duplicado dentro del archivo rechazado.');
end;
$$;

set local role authenticated;
select * from public.import_catalog_rows_v2(
  '00000000-0000-4000-8000-000000000711', null,
  '[{"row_number":12,"product_name":"No autorizado","variant_name":"No autorizado","barcode":"7797000000001","price_cents":1300000,"has_variant":true,"has_price":true}]'::jsonb, false
);
set local role postgres;

do $$
begin
  if exists (select 1 from public.variant_prices where business_id = '00000000-0000-4000-8000-000000000711' and amount_cents = 1300000) then
    raise exception 'existing price changed without explicit authorization';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000702';
set local role authenticated;
select * from public.import_catalog_rows_v2(
  '00000000-0000-4000-8000-000000000711', null,
  '[{"row_number":13,"product_name":"S7 Complejo actualizado","variant_name":"3 kg","barcode":"7797000000001","price_cents":1300000,"cost_cents":900000,"is_active":false,"has_variant":true,"has_price":true,"has_cost":true,"has_active":true}]'::jsonb, true
);
select * from public.import_catalog_rows_v2(
  '00000000-0000-4000-8000-000000000711', null,
  '[{"row_number":14,"product_name":"S7 Complejo actualizado","variant_name":"","brand_name":null,"category_name":null,"barcode":"7797000000001","is_active":null,"has_variant":false,"has_brand":true,"has_category":true,"has_active":true}]'::jsonb, true
);
set local role postgres;

do $$
begin
  if not exists (select 1 from public.products where business_id = '00000000-0000-4000-8000-000000000711' and name = 'S7 Complejo actualizado' and is_active = false)
    or not exists (select 1 from public.variant_prices where business_id = '00000000-0000-4000-8000-000000000711' and amount_cents = 1300000)
    or not exists (select 1 from public.variant_costs where business_id = '00000000-0000-4000-8000-000000000711' and amount_cents = 900000)
    or not exists (select 1 from public.products product join public.brands brand on brand.id = product.brand_id where product.business_id = '00000000-0000-4000-8000-000000000711' and brand.name = 'S7 Marca')
    or not exists (select 1 from public.variant_price_history where business_id = '00000000-0000-4000-8000-000000000711' having count(*) >= 2)
    or not exists (select 1 from public.variant_cost_history where business_id = '00000000-0000-4000-8000-000000000711' having count(*) >= 2)
    or (select count(*) from public.inventory_movements where business_id = '00000000-0000-4000-8000-000000000711' and type = 'initial') <> 1 then
    raise exception 'explicit update, preservation, history, or stock replay assertion failed';
  end if;
  insert into sprint7_results values ('13 actualización explícita', 'PASS', 'Owner no cambió; admin actualizó; vacíos preservaron marca/categoría/estado.');
  insert into sprint7_results values ('historial y stock no duplicado', 'PASS', 'Historial oficial creado y sólo existe un movimiento initial.');
end;
$$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000704';
set local role authenticated;
select * from public.import_catalog_rows_v2(
  '00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000722',
  '[{"row_number":15,"product_name":"S7 Solo B","variant_name":"Única","sku":"S7-B-001","has_variant":true}]'::jsonb, false
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000703';
do $$
begin
  perform public.import_catalog_rows_v2('00000000-0000-4000-8000-000000000711', null, '[{"row_number":16,"product_name":"S7 Staff"}]'::jsonb, false);
  raise exception 'staff import was unexpectedly accepted';
exception when others then
  if sqlerrm <> 'not authorized to import catalog' then raise; end if;
end;
$$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000701';
do $$
begin
  perform public.import_catalog_rows_v2('00000000-0000-4000-8000-000000000712', null, '[{"row_number":17,"product_name":"S7 Cross business"}]'::jsonb, false);
  raise exception 'cross-business import was unexpectedly accepted';
exception when others then
  if sqlerrm <> 'not authorized to import catalog' then raise; end if;
end;
$$;
set local role postgres;

do $$
begin
  if (select count(*) from public.products where business_id = '00000000-0000-4000-8000-000000000712') <> 1 then
    raise exception 'business B isolation assertion failed';
  end if;
  insert into sprint7_results values ('14 staff no importa', 'PASS', 'JWT staff recibió rechazo de backend.');
  insert into sprint7_results values ('15 aislamiento Business A/B', 'PASS', 'Owner A no pudo importar en B; B conserva sólo su producto.');
end;
$$;

-- Inventory movements deliberately restrict deleting their creator. Remove
-- only the isolated audit rows before cascading the test businesses/users.
delete from public.inventory_movements where business_id in (
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000712'
);
delete from public.inventory_balances where business_id in (
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000712'
);
delete from public.product_barcodes where business_id in (
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000712'
);
delete from public.product_variants where business_id in (
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000712'
);
delete from public.products where business_id in (
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000712'
);
delete from public.brands where business_id in (
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000712'
);
delete from public.categories where business_id in (
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000712'
);
delete from public.businesses where id in (
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000712'
);
delete from auth.users where id in (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000703',
  '00000000-0000-4000-8000-000000000704'
);

select test_name, result, detail from sprint7_results order by test_name;
commit;
