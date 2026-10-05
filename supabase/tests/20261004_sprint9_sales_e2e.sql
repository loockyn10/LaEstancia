-- Remote Sprint 9 E2E matrix. It creates isolated data, exercises the RPC as
-- authenticated owner/admin/staff callers, asserts the durable contract, and
-- removes only its own data before committing.

begin;

create temporary table sprint9_results (test_name text primary key, result text not null, detail text not null) on commit drop;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-9000-000000000901', 'authenticated', 'authenticated', 'sprint9-owner-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-9000-000000000902', 'authenticated', 'authenticated', 'sprint9-admin-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-9000-000000000903', 'authenticated', 'authenticated', 'sprint9-staff-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-9000-000000000904', 'authenticated', 'authenticated', 'sprint9-owner-b@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-9000-000000000901', 'sprint9 owner A'), ('00000000-0000-4000-9000-000000000902', 'sprint9 admin A'),
  ('00000000-0000-4000-9000-000000000903', 'sprint9 staff A'), ('00000000-0000-4000-9000-000000000904', 'sprint9 owner B');
insert into public.businesses (id, name) values
  ('00000000-0000-4000-9000-000000000911', 'sprint9 Business A'), ('00000000-0000-4000-9000-000000000912', 'sprint9 Business B');
insert into public.business_memberships (business_id, user_id, role) values
  ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000901', 'owner'), ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000902', 'admin'),
  ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000903', 'staff'), ('00000000-0000-4000-9000-000000000912', '00000000-0000-4000-9000-000000000904', 'owner');
insert into public.branches (id, business_id, name) values
  ('00000000-0000-4000-9000-000000000921', '00000000-0000-4000-9000-000000000911', 'sprint9 Branch A'), ('00000000-0000-4000-9000-000000000922', '00000000-0000-4000-9000-000000000912', 'sprint9 Branch B');
insert into public.products (id, business_id, name) values
  ('00000000-0000-4000-9000-000000000931', '00000000-0000-4000-9000-000000000911', 'sprint9 Product A'), ('00000000-0000-4000-9000-000000000932', '00000000-0000-4000-9000-000000000912', 'sprint9 Product B');
insert into public.product_variants (id, business_id, product_id, name, sku) values
  ('00000000-0000-4000-9000-000000000941', '00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000931', 'Normal', 'S9-NORMAL'),
  ('00000000-0000-4000-9000-000000000942', '00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000931', 'Oferta vigente', 'S9-OFFER'),
  ('00000000-0000-4000-9000-000000000943', '00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000931', 'Oferta futura', 'S9-FUTURE'),
  ('00000000-0000-4000-9000-000000000944', '00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000931', 'Sin precio', 'S9-NOPRICE'),
  ('00000000-0000-4000-9000-000000000945', '00000000-0000-4000-9000-000000000912', '00000000-0000-4000-9000-000000000932', 'Business B', 'S9-B');
insert into public.variant_prices (variant_id, business_id, amount_cents) values
  ('00000000-0000-4000-9000-000000000941', '00000000-0000-4000-9000-000000000911', 1000),
  ('00000000-0000-4000-9000-000000000942', '00000000-0000-4000-9000-000000000911', 2000),
  ('00000000-0000-4000-9000-000000000943', '00000000-0000-4000-9000-000000000911', 3000),
  ('00000000-0000-4000-9000-000000000945', '00000000-0000-4000-9000-000000000912', 5000);
insert into public.variant_offers (business_id, variant_id, promotional_price_cents, starts_at, ends_at, active, created_by) values
  ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000942', 1500, now() - interval '1 hour', now() + interval '1 hour', true, '00000000-0000-4000-9000-000000000901'),
  ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000943', 500, now() + interval '1 hour', now() + interval '2 hours', true, '00000000-0000-4000-9000-000000000901');

set local "request.jwt.claim.sub" = '00000000-0000-4000-9000-000000000901';
set local role authenticated;
select * from public.record_inventory_movement('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', '00000000-0000-4000-9000-000000000941', 'initial', 10);
select * from public.record_inventory_movement('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', '00000000-0000-4000-9000-000000000942', 'initial', 5);
select * from public.record_inventory_movement('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', '00000000-0000-4000-9000-000000000943', 'initial', 4);
select * from public.record_inventory_movement('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', '00000000-0000-4000-9000-000000000944', 'initial', 2);
select * from public.confirm_sale('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', 'cash', '[{"variant_id":"00000000-0000-4000-9000-000000000941","quantity":1.250}]', '00000000-0000-4000-9000-000000000951');

set local role postgres;
do $$ begin
  if not exists (select 1 from public.sales where business_id = '00000000-0000-4000-9000-000000000911' and created_by = '00000000-0000-4000-9000-000000000901' and total_cents = 1250)
    or not exists (select 1 from public.sale_items where variant_id = '00000000-0000-4000-9000-000000000941' and quantity = 1.250 and unit_price_cents = 1000 and line_total_cents = 1250)
    or not exists (select 1 from public.inventory_balances where variant_id = '00000000-0000-4000-9000-000000000941' and quantity = 8.750)
    or not exists (select 1 from public.inventory_movements where variant_id = '00000000-0000-4000-9000-000000000941' and type = 'sale' and quantity_delta = -1.250 and sale_id is not null) then raise exception 'owner sale assertions failed'; end if;
  insert into sprint9_results values ('owner, precio normal, decimal y movimiento sale', 'PASS', 'Owner vendió 1,250; se aplicó el precio base, se descontó stock y quedó movimiento vinculado.');
end $$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-9000-000000000901'; set local role authenticated;
do $$ begin
  perform public.record_inventory_movement('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', '00000000-0000-4000-9000-000000000941', 'sale', 1);
  raise exception 'manual sale movement accepted';
exception when others then if sqlerrm <> 'sale movements are created only by confirm_sale' then raise; end if; end $$;
set local role postgres;
insert into sprint9_results values ('sale sólo desde confirmación', 'PASS', 'La RPC genérica no puede crear movimientos sale no vinculados.');

set local "request.jwt.claim.sub" = '00000000-0000-4000-9000-000000000902'; set local role authenticated;
select * from public.confirm_sale('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', 'debit', '[{"variant_id":"00000000-0000-4000-9000-000000000942","quantity":1}]', '00000000-0000-4000-9000-000000000952');
set local role postgres;
do $$ begin
  if not exists (select 1 from public.sale_items where variant_id = '00000000-0000-4000-9000-000000000942' and unit_price_cents = 1500 and line_total_cents = 1500)
    or not exists (select 1 from public.inventory_balances where variant_id = '00000000-0000-4000-9000-000000000942' and quantity = 4) then raise exception 'admin offer assertions failed'; end if;
  insert into sprint9_results values ('admin y oferta vigente', 'PASS', 'Admin vendió con el precio promocional vigente y stock descontado.');
end $$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-9000-000000000903'; set local role authenticated;
select * from public.confirm_sale('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', 'transfer', '[{"variant_id":"00000000-0000-4000-9000-000000000943","quantity":1}]', '00000000-0000-4000-9000-000000000953');
set local role postgres;
do $$ begin
  if not exists (select 1 from public.sale_items where variant_id = '00000000-0000-4000-9000-000000000943' and unit_price_cents = 3000) then raise exception 'staff future offer assertion failed'; end if;
  update public.variant_prices set amount_cents = 9000 where variant_id = '00000000-0000-4000-9000-000000000941';
  if not exists (select 1 from public.sale_items where variant_id = '00000000-0000-4000-9000-000000000941' and unit_price_cents = 1000) then raise exception 'price snapshot changed'; end if;
  insert into sprint9_results values ('staff, oferta futura y snapshot', 'PASS', 'Staff vendió; la oferta futura no aplicó y el precio histórico permaneció inalterado tras cambiar el actual.');
end $$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-9000-000000000901'; set local role authenticated;
do $$ begin
  perform public.confirm_sale('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', 'cash', '[{"variant_id":"00000000-0000-4000-9000-000000000941","quantity":9},{"variant_id":"00000000-0000-4000-9000-000000000942","quantity":1}]', '00000000-0000-4000-9000-000000000954');
  raise exception 'insufficient sale accepted';
exception when others then if sqlerrm <> 'insufficient inventory' then raise; end if; end $$;
set local role postgres;
do $$ begin
  if exists (select 1 from public.sales where idempotency_key = '00000000-0000-4000-9000-000000000954')
    or (select quantity from public.inventory_balances where variant_id = '00000000-0000-4000-9000-000000000941') <> 8.750
    or (select quantity from public.inventory_balances where variant_id = '00000000-0000-4000-9000-000000000942') <> 4 then raise exception 'insufficient rollback failed'; end if;
  insert into sprint9_results values ('stock insuficiente revierte toda la venta', 'PASS', 'No quedaron venta, ítems, movimientos ni descuentos de una solicitud parcialmente inviable.');
end $$;

set local role authenticated;
do $$ begin perform public.confirm_sale('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', 'cash', '[{"variant_id":"00000000-0000-4000-9000-000000000944","quantity":1}]', '00000000-0000-4000-9000-000000000955'); raise exception 'unpriced variant accepted'; exception when others then if sqlerrm <> 'sale variant has no effective price' then raise; end if; end $$;
do $$ begin perform public.confirm_sale('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000922', 'cash', '[{"variant_id":"00000000-0000-4000-9000-000000000941","quantity":1}]', '00000000-0000-4000-9000-000000000956'); raise exception 'cross-business branch accepted'; exception when others then if sqlerrm <> 'invalid sale branch' then raise; end if; end $$;
do $$ begin perform public.confirm_sale('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', 'cash', '[{"variant_id":"00000000-0000-4000-9000-000000000945","quantity":1}]', '00000000-0000-4000-9000-000000000957'); raise exception 'cross-business variant accepted'; exception when others then if sqlerrm <> 'one or more sale variants are invalid' then raise; end if; end $$;
set local role postgres;
insert into sprint9_results values ('precio inexistente y ownership rechazados', 'PASS', 'No se vende sin precio efectivo ni contra sucursales o variantes de otro negocio.');

set local "request.jwt.claim.sub" = '00000000-0000-4000-9000-000000000901'; set local role authenticated;
select * from public.confirm_sale('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', 'credit', '[{"variant_id":"00000000-0000-4000-9000-000000000941","quantity":1}]', '00000000-0000-4000-9000-000000000958');
select * from public.confirm_sale('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000921', 'credit', '[{"variant_id":"00000000-0000-4000-9000-000000000941","quantity":1}]', '00000000-0000-4000-9000-000000000958');
do $$ begin
  begin
    update public.sales set payment_method = 'other' where idempotency_key = '00000000-0000-4000-9000-000000000958';
    raise exception 'completed sale update accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.sale_items where sale_id = (select id from public.sales where idempotency_key = '00000000-0000-4000-9000-000000000958');
    raise exception 'completed item delete accepted';
  exception when insufficient_privilege then null; end;
end $$;
set local role postgres;
do $$ begin
  if (select count(*) from public.sales where idempotency_key = '00000000-0000-4000-9000-000000000958') <> 1
    or (select quantity from public.inventory_balances where variant_id = '00000000-0000-4000-9000-000000000941') <> 7.750 then raise exception 'idempotency assertion failed'; end if;
  insert into sprint9_results values ('idempotencia e inmutabilidad', 'PASS', 'Un reintento devolvió la misma venta sin segundo descuento; el cliente no pudo editar venta ni ítems completed.');
end $$;

delete from public.inventory_movements where business_id in ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000912');
delete from public.sale_items where business_id in ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000912');
delete from public.sales where business_id in ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000912');
delete from public.inventory_balances where business_id in ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000912');
delete from public.variant_offers where business_id in ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000912');
delete from public.variant_prices where business_id in ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000912');
delete from public.product_variants where business_id in ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000912');
delete from public.products where business_id in ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000912');
delete from public.businesses where id in ('00000000-0000-4000-9000-000000000911', '00000000-0000-4000-9000-000000000912');
delete from auth.users where id in ('00000000-0000-4000-9000-000000000901', '00000000-0000-4000-9000-000000000902', '00000000-0000-4000-9000-000000000903', '00000000-0000-4000-9000-000000000904');

select test_name, result, detail from sprint9_results order by test_name;
commit;
