-- Remote Sprint 11 E2E matrix. Run inside a transaction: all isolated fixtures
-- (including Auth users) are discarded by the final rollback.

begin;

create temporary table sprint11_results (
  test_name text primary key,
  result text not null,
  detail text not null
) on commit drop;
grant all on table sprint11_results to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-b000-000000000001', 'authenticated', 'authenticated', 'sprint11-owner-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-b000-000000000002', 'authenticated', 'authenticated', 'sprint11-admin-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-b000-000000000003', 'authenticated', 'authenticated', 'sprint11-staff-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-b000-000000000004', 'authenticated', 'authenticated', 'sprint11-owner-b@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-b000-000000000001', 'sprint11 owner A'), ('00000000-0000-4000-b000-000000000002', 'sprint11 admin A'),
  ('00000000-0000-4000-b000-000000000003', 'sprint11 staff A'), ('00000000-0000-4000-b000-000000000004', 'sprint11 owner B');
insert into public.businesses (id, name) values
  ('00000000-0000-4000-b000-000000000011', 'sprint11 Business A'), ('00000000-0000-4000-b000-000000000012', 'sprint11 Business B');
insert into public.business_memberships (business_id, user_id, role) values
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000001', 'owner'),
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000002', 'admin'),
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000003', 'staff'),
  ('00000000-0000-4000-b000-000000000012', '00000000-0000-4000-b000-000000000004', 'owner');
insert into public.branches (id, business_id, name) values
  ('00000000-0000-4000-b000-000000000021', '00000000-0000-4000-b000-000000000011', 'sprint11 A1'),
  ('00000000-0000-4000-b000-000000000022', '00000000-0000-4000-b000-000000000011', 'sprint11 A2'),
  ('00000000-0000-4000-b000-000000000023', '00000000-0000-4000-b000-000000000012', 'sprint11 B1');
insert into public.products (id, business_id, name) values
  ('00000000-0000-4000-b000-000000000031', '00000000-0000-4000-b000-000000000011', 'sprint11 Alimento'),
  ('00000000-0000-4000-b000-000000000032', '00000000-0000-4000-b000-000000000011', 'sprint11 Arena'),
  ('00000000-0000-4000-b000-000000000033', '00000000-0000-4000-b000-000000000011', 'sprint11 Correa');
insert into public.product_variants (id, business_id, product_id, name, sku) values
  ('00000000-0000-4000-b000-000000000041', '00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000031', '3 kg', 'S11-FOOD'),
  ('00000000-0000-4000-b000-000000000042', '00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000032', '10 kg', 'S11-SAND'),
  ('00000000-0000-4000-b000-000000000043', '00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000033', 'Mediana', 'S11-LEASH');
insert into public.variant_prices (variant_id, business_id, amount_cents) values
  ('00000000-0000-4000-b000-000000000041', '00000000-0000-4000-b000-000000000011', 1000),
  ('00000000-0000-4000-b000-000000000042', '00000000-0000-4000-b000-000000000011', 2000),
  ('00000000-0000-4000-b000-000000000043', '00000000-0000-4000-b000-000000000011', 500);
insert into public.variant_costs (variant_id, business_id, amount_cents) values
  ('00000000-0000-4000-b000-000000000041', '00000000-0000-4000-b000-000000000011', 500),
  ('00000000-0000-4000-b000-000000000043', '00000000-0000-4000-b000-000000000011', 100);

set local "request.jwt.claim.sub" = '00000000-0000-4000-b000-000000000001';
set local role authenticated;
select * from public.record_inventory_movement('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000021', '00000000-0000-4000-b000-000000000041', 'initial', 20);
select * from public.record_inventory_movement('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000021', '00000000-0000-4000-b000-000000000042', 'initial', 10);
select * from public.set_inventory_minimum('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000021', '00000000-0000-4000-b000-000000000041', 17);
select * from public.open_cash_session('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000021', 1000, 'sprint11');
select * from public.confirm_sale('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000021', 'cash', '[{"variant_id":"00000000-0000-4000-b000-000000000041","quantity":1.500}]', '00000000-0000-4000-b000-000000000051');
set local "request.jwt.claim.sub" = '00000000-0000-4000-b000-000000000003';
select * from public.confirm_sale('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000021', 'debit', '[{"variant_id":"00000000-0000-4000-b000-000000000041","quantity":1}]', '00000000-0000-4000-b000-000000000052');
set local "request.jwt.claim.sub" = '00000000-0000-4000-b000-000000000001';
update public.variant_costs set amount_cents = 600 where variant_id = '00000000-0000-4000-b000-000000000041';
set local "request.jwt.claim.sub" = '00000000-0000-4000-b000-000000000002';
select * from public.confirm_sale('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000021', 'credit', '[{"variant_id":"00000000-0000-4000-b000-000000000041","quantity":1}]', '00000000-0000-4000-b000-000000000053');
select * from public.confirm_sale('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000021', 'transfer', '[{"variant_id":"00000000-0000-4000-b000-000000000042","quantity":0.500}]', '00000000-0000-4000-b000-000000000054');
set local "request.jwt.claim.sub" = '00000000-0000-4000-b000-000000000001';
select * from public.record_cash_movement('00000000-0000-4000-b000-000000000011', (select id from public.cash_sessions where branch_id = '00000000-0000-4000-b000-000000000021' and status = 'open'), 'inbound', 200, 'sprint11 ingreso');

set local role postgres;
insert into public.purchases (id, business_id, branch_id, purchase_date, status, created_by) values
  ('00000000-0000-4000-b000-000000000061', '00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000021', current_date, 'confirmed', '00000000-0000-4000-b000-000000000001');
insert into public.purchase_items (purchase_id, business_id, variant_id, quantity, unit_cost_cents) values
  ('00000000-0000-4000-b000-000000000061', '00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000041', 2, 700);

-- A transaction has a fixed value for now(). Give the historical fixture
-- explicit, distinct instants so it tests the intended as-of ordering.
update public.sales set created_at = case idempotency_key
  when '00000000-0000-4000-b000-000000000051' then clock_timestamp() - interval '4 minutes'
  when '00000000-0000-4000-b000-000000000052' then clock_timestamp() - interval '3 minutes'
  when '00000000-0000-4000-b000-000000000053' then clock_timestamp() - interval '1 minute'
  when '00000000-0000-4000-b000-000000000054' then clock_timestamp() - interval '30 seconds'
end where business_id = '00000000-0000-4000-b000-000000000011';
delete from public.variant_cost_history where variant_id = '00000000-0000-4000-b000-000000000041';
insert into public.variant_cost_history (business_id, variant_id, amount_cents, changed_at) values
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000041', 500, clock_timestamp() - interval '5 minutes'),
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000041', 600, clock_timestamp() - interval '2 minutes');

set local "request.jwt.claim.sub" = '00000000-0000-4000-b000-000000000001';
set local role authenticated;
do $$ declare summary record; begin
  select * into summary from public.dashboard_overview('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, '00000000-0000-4000-b000-000000000021');
  if summary.sales_total_cents <> 4500 or summary.sales_count <> 4 or summary.average_ticket_cents <> 1125 then raise exception 'sales summary assertion failed'; end if;
  if summary.purchase_total_cents <> 1400 or summary.purchase_count <> 1 then raise exception 'confirmed purchases assertion failed'; end if;
  if summary.out_of_stock_count <> 1 or summary.low_stock_count <> 1 then raise exception 'stock summary assertion failed'; end if;
  if summary.gross_margin_cents is not null or summary.margin_missing_cost_item_count <> 1 then raise exception 'historical cost coverage assertion failed'; end if;
end $$;
insert into sprint11_results values ('ventas, ticket, compras y stock', 'PASS', 'Ventas y ticket se agregan por período; sólo compras confirmed cuentan; cero y mínimo se calculan por presentación/sucursal.');

do $$ declare cash_total bigint; debit_total bigint; credit_total bigint; transfer_total bigint; begin
  select total_cents into cash_total from public.dashboard_payment_methods('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, '00000000-0000-4000-b000-000000000021') where payment_method = 'cash';
  select total_cents into debit_total from public.dashboard_payment_methods('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, '00000000-0000-4000-b000-000000000021') where payment_method = 'debit';
  select total_cents into credit_total from public.dashboard_payment_methods('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, '00000000-0000-4000-b000-000000000021') where payment_method = 'credit';
  select total_cents into transfer_total from public.dashboard_payment_methods('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, '00000000-0000-4000-b000-000000000021') where payment_method = 'transfer';
  if cash_total <> 1500 or debit_total <> 1000 or credit_total <> 1000 or transfer_total <> 1000 then raise exception 'payment breakdown assertion failed'; end if;
end $$;
insert into sprint11_results values ('medios de pago y cantidad decimal', 'PASS', 'Cash, débito, crédito y transferencia conservan importes; una venta de 1,500 unidades se agrega correctamente.');

do $$ declare ranked record; begin
  select * into ranked from public.dashboard_top_products('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, '00000000-0000-4000-b000-000000000021', 5) limit 1;
  if ranked.product_name <> 'sprint11 Alimento' or ranked.quantity <> 3.500 or ranked.revenue_cents <> 3500 then raise exception 'top product assertion failed'; end if;
end $$;
insert into sprint11_results values ('ranking de productos', 'PASS', 'El ranking ordena por unidades y conserva cantidades con tres decimales.');

do $$ declare open_count integer; expected bigint; begin
  select count(*), max(expected_cash_cents) into open_count, expected from public.dashboard_cash_summary('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000021') where open_session_id is not null;
  if open_count <> 1 or expected <> 2700 then raise exception 'cash summary assertion failed'; end if;
end $$;
insert into sprint11_results values ('caja abierta', 'PASS', 'El resumen deriva efectivo esperado de apertura + ventas cash + ingreso manual.');

set local "request.jwt.claim.sub" = '00000000-0000-4000-b000-000000000001';
select * from public.close_cash_session('00000000-0000-4000-b000-000000000011', (select id from public.cash_sessions where branch_id = '00000000-0000-4000-b000-000000000021' and status = 'open'), 2600);
select * from public.open_cash_session('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000022', 0, null);
do $$ declare summary record; begin
  select * into summary from public.dashboard_cash_summary('00000000-0000-4000-b000-000000000011', null) where branch_id = '00000000-0000-4000-b000-000000000021';
  if summary.open_session_id is not null or summary.last_difference_cents <> -100 then raise exception 'cash closure assertion failed'; end if;
end $$;
insert into sprint11_results values ('último cierre y diferencia', 'PASS', 'La última diferencia de caja se expone por sucursal y las cajas abiertas se distinguen.');

-- The first overview deliberately had one line without a cost. Add a cost
-- history point before that sale to verify the owner/admin historical estimate
-- uses the as-of history instead of the current cost.
set local role postgres;
insert into public.variant_cost_history (business_id, variant_id, amount_cents, changed_at)
values ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000042', 1000,
  (select min(created_at) - interval '1 second' from public.sales where business_id = '00000000-0000-4000-b000-000000000011'));
set local "request.jwt.claim.sub" = '00000000-0000-4000-b000-000000000002';
set local role authenticated;
do $$ declare admin_summary record; begin
  select * into admin_summary from public.dashboard_overview('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, '00000000-0000-4000-b000-000000000021');
  if admin_summary.gross_margin_cents <> 2150 or admin_summary.margin_missing_cost_item_count <> 0 or admin_summary.purchase_total_cents <> 1400 then raise exception 'owner admin sensitive metrics assertion failed'; end if;
end $$;
insert into sprint11_results values ('owner/admin con margen histórico', 'PASS', 'El margen suma ingreso snapshot menos el último costo registrado antes de cada venta; no usa el costo actual.');

do $$ declare all_branches record; selected_branch record; empty_period record; begin
  select * into all_branches from public.dashboard_overview('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, null);
  select * into selected_branch from public.dashboard_overview('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, '00000000-0000-4000-b000-000000000022');
  select * into empty_period from public.dashboard_overview('00000000-0000-4000-b000-000000000011', current_date - 1, current_date, null);
  if all_branches.out_of_stock_count <> 4 or selected_branch.sales_count <> 0 or empty_period.sales_total_cents <> 0 or empty_period.sales_count <> 0 then raise exception 'date or branch filter assertion failed'; end if;
end $$;
insert into sprint11_results values ('filtros por fecha y sucursal', 'PASS', 'Todas las sucursales y una sucursal específica no se mezclan; un período sin actividad devuelve ceros coherentes.');

set local "request.jwt.claim.sub" = '00000000-0000-4000-b000-000000000003';
do $$ declare staff_summary record; visible_costs integer; begin
  select * into staff_summary from public.dashboard_overview('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, null);
  select count(*) into visible_costs from public.variant_costs where business_id = '00000000-0000-4000-b000-000000000011';
  if staff_summary.gross_margin_cents is not null or staff_summary.purchase_total_cents is not null or visible_costs <> 0 then raise exception 'staff sensitive data assertion failed'; end if;
  if (select count(*) from public.dashboard_top_products('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, null, 5)) = 0 then raise exception 'staff operational data assertion failed'; end if;
end $$;
insert into sprint11_results values ('staff sin costos ni márgenes', 'PASS', 'El backend devuelve métricas operativas a staff, pero nulifica compras/margen y RLS oculta costos.');

set local "request.jwt.claim.sub" = '00000000-0000-4000-b000-000000000004';
do $$ begin
  begin
    perform public.dashboard_overview('00000000-0000-4000-b000-000000000011', current_date, current_date + 1, null);
    raise exception 'business B dashboard read A';
  exception when others then
    if sqlerrm <> 'not authorized to read dashboard' then raise; end if;
  end;
end $$;
insert into sprint11_results values ('aislamiento entre businesses', 'PASS', 'Una membresía de Business B no puede consultar agregados de Business A.');

select test_name, result, detail from sprint11_results order by test_name;
rollback;
