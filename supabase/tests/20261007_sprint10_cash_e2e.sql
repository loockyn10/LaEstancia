-- Remote Sprint 10 E2E matrix. All fixtures live inside this transaction and
-- are removed by the final rollback, including Auth identities.

begin;

create temporary table sprint10_results (
  test_name text primary key,
  result text not null,
  detail text not null
) on commit drop;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', 'sprint10-owner-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', 'sprint10-admin-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', 'sprint10-staff-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', 'sprint10-owner-b@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-a000-000000000001', 'sprint10 owner A'),
  ('00000000-0000-4000-a000-000000000002', 'sprint10 admin A'),
  ('00000000-0000-4000-a000-000000000003', 'sprint10 staff A'),
  ('00000000-0000-4000-a000-000000000004', 'sprint10 owner B');
insert into public.businesses (id, name) values
  ('00000000-0000-4000-a000-000000000011', 'sprint10 Business A'),
  ('00000000-0000-4000-a000-000000000012', 'sprint10 Business B');
insert into public.business_memberships (business_id, user_id, role) values
  ('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000001', 'owner'),
  ('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000002', 'admin'),
  ('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000003', 'staff'),
  ('00000000-0000-4000-a000-000000000012', '00000000-0000-4000-a000-000000000004', 'owner');
insert into public.branches (id, business_id, name) values
  ('00000000-0000-4000-a000-000000000021', '00000000-0000-4000-a000-000000000011', 'sprint10 Branch A1'),
  ('00000000-0000-4000-a000-000000000022', '00000000-0000-4000-a000-000000000011', 'sprint10 Branch A2'),
  ('00000000-0000-4000-a000-000000000023', '00000000-0000-4000-a000-000000000012', 'sprint10 Branch B');
insert into public.products (id, business_id, name) values
  ('00000000-0000-4000-a000-000000000031', '00000000-0000-4000-a000-000000000011', 'sprint10 Product A');
insert into public.product_variants (id, business_id, product_id, name, sku) values
  ('00000000-0000-4000-a000-000000000041', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000031', 'Única', 'SPRINT10-A');
insert into public.variant_prices (variant_id, business_id, amount_cents) values
  ('00000000-0000-4000-a000-000000000041', '00000000-0000-4000-a000-000000000011', 1250);

set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000001';
set local role authenticated;
select * from public.record_inventory_movement(
  '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021',
  '00000000-0000-4000-a000-000000000041', 'initial', 20
);
select * from public.open_cash_session(
  '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021', 10000, 'Turno mañana'
);
set local role postgres;
do $$ begin
  if not exists (
    select 1 from public.cash_sessions
    where business_id = '00000000-0000-4000-a000-000000000011'
      and branch_id = '00000000-0000-4000-a000-000000000021'
      and status = 'open' and opening_cash_cents = 10000
      and opened_by = '00000000-0000-4000-a000-000000000001'
  ) then raise exception 'cash opening assertion failed'; end if;
  insert into sprint10_results values ('1 apertura con efectivo inicial', 'PASS', 'Owner abrió la caja de A1 con $100 y nota auditada.');
end $$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000002';
set local role authenticated;
do $$ begin
  perform public.open_cash_session('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021', 0, null);
  raise exception 'second opening accepted';
exception when others then
  if sqlerrm <> 'branch already has an open cash session' then raise; end if;
end $$;
set local role postgres;
insert into sprint10_results values ('2 segunda apertura rechazada', 'PASS', 'La restricción y la RPC preservan una sola caja abierta por sucursal.');

set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000001';
set local role authenticated;
select * from public.confirm_sale(
  '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021', 'cash',
  '[{"variant_id":"00000000-0000-4000-a000-000000000041","quantity":2}]', '00000000-0000-4000-a000-000000000051'
);
set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000002';
select * from public.confirm_sale(
  '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021', 'debit',
  '[{"variant_id":"00000000-0000-4000-a000-000000000041","quantity":1}]', '00000000-0000-4000-a000-000000000052'
);
set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000003';
select * from public.confirm_sale(
  '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021', 'credit',
  '[{"variant_id":"00000000-0000-4000-a000-000000000041","quantity":1}]', '00000000-0000-4000-a000-000000000053'
);
set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000001';
select * from public.confirm_sale(
  '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021', 'transfer',
  '[{"variant_id":"00000000-0000-4000-a000-000000000041","quantity":1}]', '00000000-0000-4000-a000-000000000054'
);
select * from public.confirm_sale(
  '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021', 'other',
  '[{"variant_id":"00000000-0000-4000-a000-000000000041","quantity":1}]', '00000000-0000-4000-a000-000000000055'
);

set local role postgres;
do $$ declare session_id uuid; begin
  select id into session_id from public.cash_sessions
  where branch_id = '00000000-0000-4000-a000-000000000021' and status = 'open';
  if (select count(*) from public.sales where cash_session_id = session_id) <> 5
    or (select coalesce(sum(total_cents), 0) from public.sales where cash_session_id = session_id and payment_method = 'cash') <> 2500
    or (select coalesce(sum(total_cents), 0) from public.sales where cash_session_id = session_id and payment_method = 'debit') <> 1250 then
    raise exception 'sale linkage or payment totals assertion failed';
  end if;
  insert into sprint10_results values ('3 y 4 ventas cash/debit', 'PASS', 'Las ventas se vincularon a la caja; sólo $25 en cash integran el efectivo físico.');
  insert into sprint10_results values ('14 ventas vinculadas', 'PASS', 'Las cinco ventas nuevas apuntan a la sesión abierta de A1.');
end $$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000002';
set local role authenticated;
select * from public.record_cash_movement(
  '00000000-0000-4000-a000-000000000011',
  (select id from public.cash_sessions where branch_id = '00000000-0000-4000-a000-000000000021' and status = 'open'),
  'inbound', 1000, 'Cambio adicional'
);
set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000003';
select * from public.record_cash_movement(
  '00000000-0000-4000-a000-000000000011',
  (select id from public.cash_sessions where branch_id = '00000000-0000-4000-a000-000000000021' and status = 'open'),
  'outbound', 500, 'Gasto menor'
);
set local role postgres;
do $$ begin
  if (select coalesce(sum(amount_cents), 0) from public.cash_movements where type = 'inbound') <> 1000
    or (select coalesce(sum(amount_cents), 0) from public.cash_movements where type = 'outbound') <> 500 then
    raise exception 'manual movements assertion failed';
  end if;
  insert into sprint10_results values ('5 y 6 movimientos manuales', 'PASS', 'Ingreso sumó $10 y egreso restó $5 mediante eventos append-only.');
end $$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000003';
set local role authenticated;
do $$ declare summary record; begin
  select * into summary from public.list_cash_sessions(
    '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021'
  ) where status = 'open';
  if summary.expected_cash_cents <> 13000
    or summary.cash_sales_cents <> 2500 or summary.debit_sales_cents <> 1250
    or summary.credit_sales_cents <> 1250 or summary.transfer_sales_cents <> 1250
    or summary.other_sales_cents <> 1250
    or summary.inbound_cents <> 1000 or summary.outbound_cents <> 500 then
    raise exception 'live cash summary assertion failed';
  end if;
end $$;
select * from public.close_cash_session(
  '00000000-0000-4000-a000-000000000011',
  (select id from public.cash_sessions where branch_id = '00000000-0000-4000-a000-000000000021' and status = 'open'),
  12800
);
set local role postgres;
do $$ begin
  if not exists (
    select 1 from public.cash_sessions
    where branch_id = '00000000-0000-4000-a000-000000000021'
      and status = 'closed' and expected_cash_cents = 13000
      and counted_cash_cents = 12800 and difference_cents = -200
      and cash_sales_cents = 2500 and debit_sales_cents = 1250
      and credit_sales_cents = 1250 and transfer_sales_cents = 1250
      and other_sales_cents = 1250 and inbound_cents = 1000 and outbound_cents = 500
  ) then raise exception 'closing snapshot assertion failed'; end if;
  insert into sprint10_results values ('7 cierre calcula esperado', 'PASS', 'El snapshot guardó apertura + cash + ingresos - egresos = $130.');
  insert into sprint10_results values ('8 diferencia contado/esperado', 'PASS', 'Contado $128 menos esperado $130 produjo -$2.');
end $$;

set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000001';
set local role authenticated;
do $$ begin
  perform public.close_cash_session(
    '00000000-0000-4000-a000-000000000011',
    (select id from public.cash_sessions where branch_id = '00000000-0000-4000-a000-000000000021' order by opened_at limit 1), 12800
  );
  raise exception 'second close accepted';
exception when others then
  if sqlerrm <> 'cash session is not open' then raise; end if;
end $$;
do $$ begin
  perform public.record_cash_movement(
    '00000000-0000-4000-a000-000000000011',
    (select id from public.cash_sessions where branch_id = '00000000-0000-4000-a000-000000000021' order by opened_at limit 1),
    'inbound', 100, 'Fuera de hora'
  );
  raise exception 'closed movement accepted';
exception when others then
  if sqlerrm <> 'cash session is not open' then raise; end if;
end $$;
do $$ begin
  begin
    update public.cash_sessions set notes = notes
    where branch_id = '00000000-0000-4000-a000-000000000021';
    raise exception 'client cash session update accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.cash_movements
    where branch_id = '00000000-0000-4000-a000-000000000021';
    raise exception 'client cash movement delete accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.cash_movements (
      cash_session_id, business_id, branch_id, type, amount_cents, reason, created_by
    ) values (
      (select id from public.cash_sessions where branch_id = '00000000-0000-4000-a000-000000000021' limit 1),
      '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021',
      'inbound', 100, 'Directo', '00000000-0000-4000-a000-000000000001'
    );
    raise exception 'client cash movement insert accepted';
  exception when insufficient_privilege then null; end;
end $$;
set local role postgres;
insert into sprint10_results values ('9 doble cierre rechazado', 'PASS', 'La sesión cerrada no admite un segundo cierre ni movimientos nuevos.');

do $$ declare closed_id uuid; movement_id uuid; begin
  select id into closed_id from public.cash_sessions
  where branch_id = '00000000-0000-4000-a000-000000000021' and status = 'closed';
  select id into movement_id from public.cash_movements where cash_session_id = closed_id limit 1;
  begin
    update public.cash_sessions set notes = 'mutada' where id = closed_id;
    raise exception 'closed session update accepted';
  exception when others then
    if sqlerrm <> 'closed cash sessions are immutable' then raise; end if;
  end;
  begin
    delete from public.cash_sessions where id = closed_id;
    raise exception 'closed session delete accepted';
  exception when others then
    if sqlerrm <> 'cash sessions cannot be deleted' then raise; end if;
  end;
  begin
    update public.cash_movements set reason = 'mutado' where id = movement_id;
    raise exception 'cash movement update accepted';
  exception when others then
    if sqlerrm <> 'cash movements are append-only' then raise; end if;
  end;
  begin
    delete from public.cash_movements where id = movement_id;
    raise exception 'cash movement delete accepted';
  exception when others then
    if sqlerrm <> 'cash movements are append-only' then raise; end if;
  end;
  insert into sprint10_results values ('10 caja cerrada inmutable', 'PASS', 'Triggers bloquean update/delete aun para un caller privilegiado.');
  insert into sprint10_results values ('15 movimientos append-only', 'PASS', 'Movimientos no admiten update/delete y el cliente carece de escritura directa.');
end $$;

-- Admin opens A2, staff records a movement and owner closes it. Together with
-- A1 this covers the three current business roles without inventing branch ACLs.
set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000002';
set local role authenticated;
select * from public.open_cash_session(
  '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000022', 2000, null
);
set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000003';
select * from public.record_cash_movement(
  '00000000-0000-4000-a000-000000000011',
  (select id from public.cash_sessions where branch_id = '00000000-0000-4000-a000-000000000022' and status = 'open'),
  'inbound', 100, 'Refuerzo'
);
set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000001';
select * from public.close_cash_session(
  '00000000-0000-4000-a000-000000000011',
  (select id from public.cash_sessions where branch_id = '00000000-0000-4000-a000-000000000022' and status = 'open'),
  2100
);
set local role postgres;
insert into sprint10_results values ('11 owner/admin/staff operan', 'PASS', 'Owner, admin y staff abrieron, movieron o cerraron caja según la membresía vigente.');

set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000004';
set local role authenticated;
select * from public.open_cash_session(
  '00000000-0000-4000-a000-000000000012', '00000000-0000-4000-a000-000000000023', 500, null
);
do $$ begin
  perform public.list_cash_sessions('00000000-0000-4000-a000-000000000011', null);
  raise exception 'business B listed A';
exception when others then
  if sqlerrm <> 'not authorized to read cash sessions' then raise; end if;
end $$;
set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000001';
do $$ declare visible_count integer; begin
  select count(*) into visible_count from public.cash_sessions
  where business_id = '00000000-0000-4000-a000-000000000012';
  if visible_count <> 0 then raise exception 'business A read B through RLS'; end if;
  begin
    perform public.open_cash_session(
      '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000023', 0, null
    );
    raise exception 'cross-business branch opening accepted';
  exception when others then
    if sqlerrm <> 'invalid cash session branch' then raise; end if;
  end;
end $$;
set local role postgres;
insert into sprint10_results values ('12 aislamiento entre businesses', 'PASS', 'RPC y RLS impiden que Business A consulte u opere cajas de B.');
insert into sprint10_results values ('13 branch inválida rechazada', 'PASS', 'Una branch que no pertenece al business objetivo no puede abrir caja.');

-- A completed sale with no open session remains valid but unlinked and cannot
-- change the stored closing snapshot.
set local "request.jwt.claim.sub" = '00000000-0000-4000-a000-000000000003';
set local role authenticated;
select * from public.confirm_sale(
  '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021', 'cash',
  '[{"variant_id":"00000000-0000-4000-a000-000000000041","quantity":1}]', '00000000-0000-4000-a000-000000000056'
);
set local role postgres;
do $$ begin
  if (select cash_session_id from public.sales where idempotency_key = '00000000-0000-4000-a000-000000000056') is not null
    or not exists (
      select 1 from public.cash_sessions
      where branch_id = '00000000-0000-4000-a000-000000000021'
        and status = 'closed' and expected_cash_cents = 13000 and cash_sales_cents = 2500
    ) then raise exception 'sale without session changed closed snapshot'; end if;
  insert into sprint10_results values ('histórico y snapshot preservados', 'PASS', 'Sin caja abierta la venta queda sin vínculo y el cierre previo no cambia.');
end $$;

select test_name, result, detail from sprint10_results order by test_name;
rollback;
