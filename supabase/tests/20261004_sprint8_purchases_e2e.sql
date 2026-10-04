-- Remote Sprint 8 E2E matrix. It uses isolated identities and businesses,
-- asserts the backend contract as authenticated callers, then deletes all data.

begin;

create temporary table sprint8_results (test_name text primary key, result text not null, detail text not null) on commit drop;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-4000-8000-000000000801', 'authenticated', 'authenticated', 'sprint8-owner-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000802', 'authenticated', 'authenticated', 'sprint8-admin-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000803', 'authenticated', 'authenticated', 'sprint8-staff-a@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000804', 'authenticated', 'authenticated', 'sprint8-owner-b@invalid.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-000000000801', 'sprint8 owner A'), ('00000000-0000-4000-8000-000000000802', 'sprint8 admin A'),
  ('00000000-0000-4000-8000-000000000803', 'sprint8 staff A'), ('00000000-0000-4000-8000-000000000804', 'sprint8 owner B');
insert into public.businesses (id, name) values
  ('00000000-0000-4000-8000-000000000811', 'sprint8 Business A'), ('00000000-0000-4000-8000-000000000812', 'sprint8 Business B');
insert into public.business_memberships (business_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000801', 'owner'), ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000802', 'admin'),
  ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000803', 'staff'), ('00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000804', 'owner');
insert into public.branches (id, business_id, name) values
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000811', 'sprint8 Branch A'), ('00000000-0000-4000-8000-000000000822', '00000000-0000-4000-8000-000000000812', 'sprint8 Branch B');
insert into public.products (id, business_id, name) values
  ('00000000-0000-4000-8000-000000000831', '00000000-0000-4000-8000-000000000811', 'sprint8 Product A'), ('00000000-0000-4000-8000-000000000832', '00000000-0000-4000-8000-000000000812', 'sprint8 Product B');
insert into public.product_variants (id, business_id, product_id, name, sku) values
  ('00000000-0000-4000-8000-000000000841', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000831', 'A1', 'S8-A1'),
  ('00000000-0000-4000-8000-000000000842', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000831', 'A2', 'S8-A2'),
  ('00000000-0000-4000-8000-000000000843', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000831', 'A3', 'S8-A3'),
  ('00000000-0000-4000-8000-000000000844', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000831', 'A4', 'S8-A4'),
  ('00000000-0000-4000-8000-000000000845', '00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000832', 'B1', 'S8-B1');

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000801';
set local role authenticated;
insert into public.suppliers (id, business_id, name, phone) values ('00000000-0000-4000-8000-000000000851', '00000000-0000-4000-8000-000000000811', 'sprint8 Supplier A', '1111');
insert into public.purchases (id, business_id, supplier_id, branch_id, purchase_date, created_by) values ('00000000-0000-4000-8000-000000000861', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000851', '00000000-0000-4000-8000-000000000821', current_date, auth.uid());
insert into public.purchase_items (purchase_id, business_id, variant_id, quantity, unit_cost_cents) values ('00000000-0000-4000-8000-000000000861', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000841', 2.5, 125050);
set local role postgres;

do $$ begin
  if exists (select 1 from public.inventory_balances where variant_id = '00000000-0000-4000-8000-000000000841') or exists (select 1 from public.variant_costs where variant_id = '00000000-0000-4000-8000-000000000841') then raise exception 'draft changed stock or cost'; end if;
  insert into sprint8_results values ('draft sin efectos', 'PASS', 'El borrador no creó saldo, movimiento ni costo.');
end $$;

set local role authenticated;
select * from public.confirm_purchase('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000861');
set local role postgres;
do $$ begin
  if not exists (select 1 from public.purchases where id = '00000000-0000-4000-8000-000000000861' and status = 'confirmed')
    or not exists (select 1 from public.inventory_balances where variant_id = '00000000-0000-4000-8000-000000000841' and quantity = 2.5)
    or not exists (select 1 from public.inventory_movements where purchase_id = '00000000-0000-4000-8000-000000000861' and type = 'purchase' and quantity_delta = 2.5)
    or not exists (select 1 from public.variant_costs where variant_id = '00000000-0000-4000-8000-000000000841' and amount_cents = 125050)
    or not exists (select 1 from public.variant_cost_history where variant_id = '00000000-0000-4000-8000-000000000841' and amount_cents = 125050) then raise exception 'owner confirmation assertions failed'; end if;
  insert into sprint8_results values ('owner confirma con trazabilidad', 'PASS', 'Stock, movimiento vinculado, costo e historial oficiales coinciden.');
end $$;

set local role authenticated;
do $$ begin
  perform public.confirm_purchase('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000861');
  raise exception 'second confirmation was accepted';
exception when others then if sqlerrm <> 'only draft purchases can be confirmed' then raise; end if; end $$;
set local role postgres;
insert into sprint8_results values ('doble confirmación rechazada', 'PASS', 'El bloqueo y estado draft impiden aplicar dos veces.');

set local role authenticated;
do $$ begin
  update public.purchases set notes = 'no permitido' where id = '00000000-0000-4000-8000-000000000861';
  if found then raise exception 'confirmed purchase update accepted'; end if;
end $$;
set local role postgres;
insert into sprint8_results values ('confirmed inmutable', 'PASS', 'RLS no permite editar una compra confirmada.');

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000802'; set local role authenticated;
update public.suppliers set phone = '2222' where id = '00000000-0000-4000-8000-000000000851';
insert into public.purchases (id, business_id, branch_id, purchase_date, created_by) values ('00000000-0000-4000-8000-000000000862', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000821', current_date, auth.uid());
insert into public.purchase_items (purchase_id, business_id, variant_id, quantity, unit_cost_cents) values ('00000000-0000-4000-8000-000000000862', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000842', 1, 90000);
select * from public.confirm_purchase('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000862');
set local role postgres;
do $$ begin
  if not exists (select 1 from public.suppliers where id = '00000000-0000-4000-8000-000000000851' and phone = '2222') or not exists (select 1 from public.inventory_movements where purchase_id = '00000000-0000-4000-8000-000000000862') then raise exception 'admin assertions failed'; end if;
  insert into sprint8_results values ('admin edita y confirma', 'PASS', 'Admin actualizó proveedor y confirmó una compra.');
end $$;

-- Force a later cost write to fail, proving that movements from earlier items
-- roll back with the whole confirmation transaction.
create function public.sprint8_fail_cost_write() returns trigger language plpgsql as $$ begin if new.variant_id = '00000000-0000-4000-8000-000000000844' then raise exception 'sprint8 forced cost failure'; end if; return new; end; $$;
create trigger sprint8_fail_cost_write after insert or update on public.variant_costs for each row execute function public.sprint8_fail_cost_write();
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000801'; set local role authenticated;
insert into public.purchases (id, business_id, branch_id, purchase_date, created_by) values ('00000000-0000-4000-8000-000000000863', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000821', current_date, auth.uid());
insert into public.purchase_items (purchase_id, business_id, variant_id, quantity, unit_cost_cents) values
  ('00000000-0000-4000-8000-000000000863', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000843', 1, 50000),
  ('00000000-0000-4000-8000-000000000863', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000844', 1, 60000);
do $$ begin perform public.confirm_purchase('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000863'); raise exception 'forced failure was accepted'; exception when others then if sqlerrm <> 'sprint8 forced cost failure' then raise; end if; end $$;
set local role postgres;
do $$ begin
  if not exists (select 1 from public.purchases where id = '00000000-0000-4000-8000-000000000863' and status = 'draft') or exists (select 1 from public.inventory_movements where purchase_id = '00000000-0000-4000-8000-000000000863') or exists (select 1 from public.variant_costs where variant_id in ('00000000-0000-4000-8000-000000000843', '00000000-0000-4000-8000-000000000844')) then raise exception 'atomic rollback assertion failed'; end if;
  insert into sprint8_results values ('fallo de ítem revierte todo', 'PASS', 'No quedaron movimientos, costos ni cambio de estado.');
end $$;
drop trigger sprint8_fail_cost_write on public.variant_costs; drop function public.sprint8_fail_cost_write();

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000803'; set local role authenticated;
do $$ begin insert into public.suppliers (business_id, name) values ('00000000-0000-4000-8000-000000000811', 'staff denied'); raise exception 'staff supplier write accepted'; exception when others then if sqlerrm not like '%row-level security%' then raise; end if; end $$;
do $$ begin perform public.confirm_purchase('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000863'); raise exception 'staff confirmation accepted'; exception when others then if sqlerrm <> 'not authorized to confirm purchases' then raise; end if; end $$;
set local role postgres;
insert into sprint8_results values ('staff sólo lectura', 'PASS', 'Staff no puede crear proveedor ni confirmar.');

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000801'; set local role authenticated;
do $$ begin insert into public.purchases (business_id, branch_id, purchase_date, created_by) values ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000822', current_date, auth.uid()); raise exception 'cross-business branch accepted'; exception when foreign_key_violation then null; end $$;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000804';
insert into public.suppliers (id, business_id, name) values ('00000000-0000-4000-8000-000000000852', '00000000-0000-4000-8000-000000000812', 'sprint8 Supplier B');
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000801';
do $$ begin insert into public.purchases (business_id, supplier_id, branch_id, purchase_date, created_by) values ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000852', '00000000-0000-4000-8000-000000000821', current_date, auth.uid()); raise exception 'cross-business supplier accepted'; exception when foreign_key_violation then null; end $$;
do $$ begin insert into public.purchases (id, business_id, supplier_id, branch_id, purchase_date, created_by) values ('00000000-0000-4000-8000-000000000864', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000851', '00000000-0000-4000-8000-000000000821', current_date, auth.uid()); insert into public.purchase_items (purchase_id, business_id, variant_id, quantity, unit_cost_cents) values ('00000000-0000-4000-8000-000000000864', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000845', 1, 1); raise exception 'cross-business variant accepted'; exception when foreign_key_violation then null; end $$;
set local role postgres;
insert into sprint8_results values ('ownership compuesto', 'PASS', 'Las FKs y RLS rechazan referencias cruzadas de supplier, sucursal o presentación.');

delete from public.inventory_movements where business_id in ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000812');
delete from public.inventory_balances where business_id in ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000812');
delete from public.purchases where business_id in ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000812');
delete from public.suppliers where business_id in ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000812');
delete from public.product_variants where business_id in ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000812');
delete from public.products where business_id in ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000812');
delete from public.businesses where id in ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000812');
delete from auth.users where id in ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000804');

select test_name, result, detail from sprint8_results order by test_name;
commit;
