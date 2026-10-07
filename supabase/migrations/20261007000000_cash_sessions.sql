-- Sprint 10 branch cash operations. Cash totals are derived from immutable
-- sales and append-only movements; closing stores an auditable snapshot.

create type public.cash_session_status as enum ('open', 'closed');
create type public.cash_movement_type as enum ('inbound', 'outbound');

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null,
  opened_at timestamptz not null default now(),
  opened_by uuid not null references public.profiles (id) on delete restrict,
  opening_cash_cents bigint not null check (opening_cash_cents >= 0),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete restrict,
  counted_cash_cents bigint check (counted_cash_cents >= 0),
  expected_cash_cents bigint,
  difference_cents bigint,
  cash_sales_cents bigint check (cash_sales_cents >= 0),
  debit_sales_cents bigint check (debit_sales_cents >= 0),
  credit_sales_cents bigint check (credit_sales_cents >= 0),
  transfer_sales_cents bigint check (transfer_sales_cents >= 0),
  other_sales_cents bigint check (other_sales_cents >= 0),
  inbound_cents bigint check (inbound_cents >= 0),
  outbound_cents bigint check (outbound_cents >= 0),
  status public.cash_session_status not null default 'open',
  notes text check (notes is null or (notes = btrim(notes) and char_length(notes) between 1 and 1000)),
  foreign key (branch_id, business_id)
    references public.branches (id, business_id) on delete restrict,
  unique (id, business_id, branch_id),
  check (
    (status = 'open'
      and closed_at is null and closed_by is null
      and counted_cash_cents is null and expected_cash_cents is null and difference_cents is null
      and cash_sales_cents is null and debit_sales_cents is null and credit_sales_cents is null
      and transfer_sales_cents is null and other_sales_cents is null
      and inbound_cents is null and outbound_cents is null)
    or
    (status = 'closed'
      and closed_at is not null and closed_by is not null
      and counted_cash_cents is not null and expected_cash_cents is not null and difference_cents is not null
      and cash_sales_cents is not null and debit_sales_cents is not null and credit_sales_cents is not null
      and transfer_sales_cents is not null and other_sales_cents is not null
      and inbound_cents is not null and outbound_cents is not null)
  )
);

create unique index cash_sessions_one_open_per_branch_idx
  on public.cash_sessions (branch_id)
  where status = 'open';
create index cash_sessions_business_branch_opened_at_idx
  on public.cash_sessions (business_id, branch_id, opened_at desc);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null,
  business_id uuid not null,
  branch_id uuid not null,
  type public.cash_movement_type not null,
  amount_cents bigint not null check (amount_cents > 0),
  reason text not null check (reason = btrim(reason) and char_length(reason) between 1 and 500),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (cash_session_id, business_id, branch_id)
    references public.cash_sessions (id, business_id, branch_id) on delete restrict
);

create index cash_movements_session_created_at_idx
  on public.cash_movements (cash_session_id, created_at);
create index cash_movements_business_branch_created_at_idx
  on public.cash_movements (business_id, branch_id, created_at desc);

alter table public.sales
  add column cash_session_id uuid;
alter table public.sales
  add constraint sales_cash_session_ownership_fkey
  foreign key (cash_session_id, business_id, branch_id)
  references public.cash_sessions (id, business_id, branch_id) on delete restrict;
create index sales_cash_session_id_idx
  on public.sales (cash_session_id) where cash_session_id is not null;

alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

revoke all on table public.cash_sessions, public.cash_movements from anon;
revoke all on table public.cash_sessions, public.cash_movements from authenticated;
grant select on table public.cash_sessions, public.cash_movements to authenticated;
grant usage on type public.cash_session_status, public.cash_movement_type to authenticated;

create policy "cash_sessions_select_active_membership"
  on public.cash_sessions for select to authenticated
  using (public.has_active_business_membership(business_id));

create policy "cash_movements_select_active_membership"
  on public.cash_movements for select to authenticated
  using (public.has_active_business_membership(business_id));

-- Sessions have a single state transition and movements are append-only even
-- for privileged backend callers. Client roles have no direct write grants.
create function public.protect_cash_session_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'cash sessions cannot be deleted';
  end if;
  if old.status = 'closed' then
    raise exception 'closed cash sessions are immutable';
  end if;
  if new.status <> 'closed'
    or new.id is distinct from old.id
    or new.business_id is distinct from old.business_id
    or new.branch_id is distinct from old.branch_id
    or new.opened_at is distinct from old.opened_at
    or new.opened_by is distinct from old.opened_by
    or new.opening_cash_cents is distinct from old.opening_cash_cents
    or new.notes is distinct from old.notes then
    raise exception 'cash sessions can only transition from open to closed';
  end if;
  return new;
end;
$$;

create trigger cash_sessions_protect_mutation
before update or delete on public.cash_sessions
for each row execute function public.protect_cash_session_mutation();

create function public.protect_cash_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'cash movements are append-only';
end;
$$;

create trigger cash_movements_protect_mutation
before update or delete on public.cash_movements
for each row execute function public.protect_cash_movement_mutation();

create function public.open_cash_session(
  target_business_id uuid,
  target_branch_id uuid,
  opening_cash_cents bigint,
  session_notes text default null
)
returns table (cash_session_id uuid, opened_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_session_id uuid;
  inserted_opened_at timestamptz;
  normalized_notes text := nullif(btrim(session_notes), '');
begin
  if auth.uid() is null or not public.has_active_business_role(
    target_business_id, array['owner', 'admin', 'staff']::public.business_role[]
  ) then
    raise exception 'not authorized to open cash session';
  end if;
  if opening_cash_cents is null or opening_cash_cents < 0 then
    raise exception 'invalid opening cash amount';
  end if;
  if normalized_notes is not null and char_length(normalized_notes) > 1000 then
    raise exception 'cash session notes are too long';
  end if;
  if not exists (
    select 1 from public.branches branch
    where branch.id = target_branch_id
      and branch.business_id = target_business_id
      and branch.is_active
  ) then
    raise exception 'invalid cash session branch';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'cash-session:' || target_business_id::text || ':' || target_branch_id::text, 0
  ));
  if exists (
    select 1 from public.cash_sessions cash_session
    where cash_session.business_id = target_business_id
      and cash_session.branch_id = target_branch_id
      and cash_session.status = 'open'
  ) then
    raise exception 'branch already has an open cash session';
  end if;

  insert into public.cash_sessions as inserted (
    business_id, branch_id, opened_by, opening_cash_cents, notes
  ) values (
    target_business_id, target_branch_id, auth.uid(), opening_cash_cents, normalized_notes
  ) returning inserted.id, inserted.opened_at
  into inserted_session_id, inserted_opened_at;

  return query select inserted_session_id, inserted_opened_at;
end;
$$;

create function public.record_cash_movement(
  target_business_id uuid,
  target_cash_session_id uuid,
  movement_type public.cash_movement_type,
  amount_cents bigint,
  movement_reason text
)
returns table (movement_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_branch_id uuid;
  current_status public.cash_session_status;
  inserted_movement_id uuid;
  inserted_created_at timestamptz;
  normalized_reason text := btrim(movement_reason);
begin
  if auth.uid() is null or not public.has_active_business_role(
    target_business_id, array['owner', 'admin', 'staff']::public.business_role[]
  ) then
    raise exception 'not authorized to record cash movement';
  end if;
  if movement_type is null then
    raise exception 'invalid cash movement type';
  end if;
  if amount_cents is null or amount_cents <= 0 then
    raise exception 'invalid cash movement amount';
  end if;
  if movement_reason is null or normalized_reason = '' or char_length(normalized_reason) > 500 then
    raise exception 'cash movement reason is required';
  end if;

  select cash_session.branch_id
  into target_branch_id
  from public.cash_sessions cash_session
  where cash_session.id = target_cash_session_id
    and cash_session.business_id = target_business_id;
  if not found then
    raise exception 'invalid cash session';
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended(
    'cash-session:' || target_business_id::text || ':' || target_branch_id::text, 0
  ));
  select cash_session.status
  into current_status
  from public.cash_sessions cash_session
  where cash_session.id = target_cash_session_id
    and cash_session.business_id = target_business_id
    and cash_session.branch_id = target_branch_id
  for share;
  if current_status is distinct from 'open'::public.cash_session_status then
    raise exception 'cash session is not open';
  end if;

  insert into public.cash_movements as inserted (
    cash_session_id, business_id, branch_id, type, amount_cents, reason, created_by
  ) values (
    target_cash_session_id, target_business_id, target_branch_id,
    movement_type, amount_cents, normalized_reason, auth.uid()
  ) returning inserted.id, inserted.created_at
  into inserted_movement_id, inserted_created_at;

  return query select inserted_movement_id, inserted_created_at;
end;
$$;

create function public.close_cash_session(
  target_business_id uuid,
  target_cash_session_id uuid,
  counted_cash_cents bigint
)
returns table (
  cash_session_id uuid,
  closed_at timestamptz,
  cash_sales_cents bigint,
  debit_sales_cents bigint,
  credit_sales_cents bigint,
  transfer_sales_cents bigint,
  other_sales_cents bigint,
  inbound_cents bigint,
  outbound_cents bigint,
  expected_cash_cents bigint,
  difference_cents bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_branch_id uuid;
  current_status public.cash_session_status;
  session_opening_cash bigint;
  snapshot_closed_at timestamptz;
  snapshot_cash_sales bigint;
  snapshot_debit_sales bigint;
  snapshot_credit_sales bigint;
  snapshot_transfer_sales bigint;
  snapshot_other_sales bigint;
  snapshot_inbound bigint;
  snapshot_outbound bigint;
  snapshot_expected bigint;
  snapshot_difference bigint;
  requested_counted_cash_cents bigint := counted_cash_cents;
begin
  if auth.uid() is null or not public.has_active_business_role(
    target_business_id, array['owner', 'admin', 'staff']::public.business_role[]
  ) then
    raise exception 'not authorized to close cash session';
  end if;
  if requested_counted_cash_cents is null or requested_counted_cash_cents < 0 then
    raise exception 'invalid counted cash amount';
  end if;

  select cash_session.branch_id
  into target_branch_id
  from public.cash_sessions cash_session
  where cash_session.id = target_cash_session_id
    and cash_session.business_id = target_business_id;
  if not found then
    raise exception 'invalid cash session';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'cash-session:' || target_business_id::text || ':' || target_branch_id::text, 0
  ));
  select cash_session.status, cash_session.opening_cash_cents
  into current_status, session_opening_cash
  from public.cash_sessions cash_session
  where cash_session.id = target_cash_session_id
    and cash_session.business_id = target_business_id
    and cash_session.branch_id = target_branch_id
  for update;
  if current_status is distinct from 'open'::public.cash_session_status then
    raise exception 'cash session is not open';
  end if;

  select
    coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'cash'), 0)::bigint,
    coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'debit'), 0)::bigint,
    coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'credit'), 0)::bigint,
    coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'transfer'), 0)::bigint,
    coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'other'), 0)::bigint
  into snapshot_cash_sales, snapshot_debit_sales, snapshot_credit_sales,
    snapshot_transfer_sales, snapshot_other_sales
  from public.sales sale
  where sale.cash_session_id = target_cash_session_id
    and sale.business_id = target_business_id;

  select
    coalesce(sum(movement.amount_cents) filter (where movement.type = 'inbound'), 0)::bigint,
    coalesce(sum(movement.amount_cents) filter (where movement.type = 'outbound'), 0)::bigint
  into snapshot_inbound, snapshot_outbound
  from public.cash_movements movement
  where movement.cash_session_id = target_cash_session_id
    and movement.business_id = target_business_id;

  snapshot_expected := session_opening_cash + snapshot_cash_sales + snapshot_inbound - snapshot_outbound;
  snapshot_difference := requested_counted_cash_cents - snapshot_expected;
  snapshot_closed_at := now();

  update public.cash_sessions cash_session
  set status = 'closed',
    closed_at = snapshot_closed_at,
    closed_by = auth.uid(),
    counted_cash_cents = requested_counted_cash_cents,
    expected_cash_cents = snapshot_expected,
    difference_cents = snapshot_difference,
    cash_sales_cents = snapshot_cash_sales,
    debit_sales_cents = snapshot_debit_sales,
    credit_sales_cents = snapshot_credit_sales,
    transfer_sales_cents = snapshot_transfer_sales,
    other_sales_cents = snapshot_other_sales,
    inbound_cents = snapshot_inbound,
    outbound_cents = snapshot_outbound
  where cash_session.id = target_cash_session_id
    and cash_session.business_id = target_business_id;

  return query select target_cash_session_id, snapshot_closed_at,
    snapshot_cash_sales, snapshot_debit_sales, snapshot_credit_sales,
    snapshot_transfer_sales, snapshot_other_sales, snapshot_inbound,
    snapshot_outbound, snapshot_expected, snapshot_difference;
end;
$$;

create function public.list_cash_sessions(
  target_business_id uuid,
  target_branch_id uuid default null
)
returns table (
  id uuid,
  branch_id uuid,
  branch_name text,
  status public.cash_session_status,
  opened_at timestamptz,
  opened_by uuid,
  opened_by_name text,
  opening_cash_cents bigint,
  closed_at timestamptz,
  closed_by uuid,
  closed_by_name text,
  counted_cash_cents bigint,
  expected_cash_cents bigint,
  difference_cents bigint,
  cash_sales_cents bigint,
  debit_sales_cents bigint,
  credit_sales_cents bigint,
  transfer_sales_cents bigint,
  other_sales_cents bigint,
  inbound_cents bigint,
  outbound_cents bigint,
  notes text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_active_business_membership(target_business_id) then
    raise exception 'not authorized to read cash sessions';
  end if;
  if target_branch_id is not null and not exists (
    select 1 from public.branches branch
    where branch.id = target_branch_id and branch.business_id = target_business_id
  ) then
    raise exception 'invalid cash session branch';
  end if;

  return query
  select cash_session.id, cash_session.branch_id, branch.name, cash_session.status,
    cash_session.opened_at, cash_session.opened_by, opener.display_name,
    cash_session.opening_cash_cents, cash_session.closed_at, cash_session.closed_by,
    closer.display_name, cash_session.counted_cash_cents,
    case when cash_session.status = 'open'
      then cash_session.opening_cash_cents + sale_totals.cash_sales + movement_totals.inbound - movement_totals.outbound
      else cash_session.expected_cash_cents end,
    cash_session.difference_cents,
    case when cash_session.status = 'open' then sale_totals.cash_sales else cash_session.cash_sales_cents end,
    case when cash_session.status = 'open' then sale_totals.debit_sales else cash_session.debit_sales_cents end,
    case when cash_session.status = 'open' then sale_totals.credit_sales else cash_session.credit_sales_cents end,
    case when cash_session.status = 'open' then sale_totals.transfer_sales else cash_session.transfer_sales_cents end,
    case when cash_session.status = 'open' then sale_totals.other_sales else cash_session.other_sales_cents end,
    case when cash_session.status = 'open' then movement_totals.inbound else cash_session.inbound_cents end,
    case when cash_session.status = 'open' then movement_totals.outbound else cash_session.outbound_cents end,
    cash_session.notes
  from public.cash_sessions cash_session
  join public.branches branch
    on branch.id = cash_session.branch_id and branch.business_id = cash_session.business_id
  left join public.profiles opener on opener.id = cash_session.opened_by
  left join public.profiles closer on closer.id = cash_session.closed_by
  cross join lateral (
    select
      coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'cash'), 0)::bigint as cash_sales,
      coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'debit'), 0)::bigint as debit_sales,
      coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'credit'), 0)::bigint as credit_sales,
      coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'transfer'), 0)::bigint as transfer_sales,
      coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'other'), 0)::bigint as other_sales
    from public.sales sale
    where sale.cash_session_id = cash_session.id
      and sale.business_id = cash_session.business_id
  ) sale_totals
  cross join lateral (
    select
      coalesce(sum(movement.amount_cents) filter (where movement.type = 'inbound'), 0)::bigint as inbound,
      coalesce(sum(movement.amount_cents) filter (where movement.type = 'outbound'), 0)::bigint as outbound
    from public.cash_movements movement
    where movement.cash_session_id = cash_session.id
      and movement.business_id = cash_session.business_id
  ) movement_totals
  where cash_session.business_id = target_business_id
    and (target_branch_id is null or cash_session.branch_id = target_branch_id)
  order by (cash_session.status = 'open') desc, cash_session.opened_at desc, cash_session.id desc;
end;
$$;

-- Replace the current sale confirmation contract without changing its
-- arguments or result. Existing sales remain NULL; new sales attach to the
-- branch's open session when one exists at confirmation time.
create or replace function public.confirm_sale(
  target_business_id uuid, target_branch_id uuid,
  sale_payment_method public.sale_payment_method, requested_items jsonb, request_id uuid
)
returns table (sale_id uuid, sale_number bigint, total_cents bigint, created_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  input_item record; balance_quantity numeric(18,3); unit_price bigint; line_total bigint;
  inserted_sale_id uuid; inserted_sale_number bigint; inserted_created_at timestamptz;
  existing_total bigint; calculated_total bigint := 0; calculated_item_count integer := 0;
  target_cash_session_id uuid;
begin
  if auth.uid() is null or not public.has_active_business_role(target_business_id, array['owner', 'admin', 'staff']::public.business_role[]) then
    raise exception 'not authorized to confirm sales';
  end if;
  if request_id is null then raise exception 'idempotency key is required'; end if;
  if requested_items is null or jsonb_typeof(requested_items) <> 'array' or jsonb_array_length(requested_items) = 0 then
    raise exception 'a sale requires at least one item';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_business_id::text || ':' || auth.uid()::text || ':' || request_id::text, 0));
  select sale.id, sale.sale_number, sale.total_cents, sale.created_at
  into inserted_sale_id, inserted_sale_number, existing_total, inserted_created_at
  from public.sales sale
  where sale.business_id = target_business_id and sale.created_by = auth.uid() and sale.idempotency_key = request_id;
  if found then
    return query select inserted_sale_id, inserted_sale_number, existing_total, inserted_created_at;
    return;
  end if;
  if not exists (select 1 from public.branches branch where branch.id = target_branch_id and branch.business_id = target_business_id and branch.is_active) then
    raise exception 'invalid sale branch';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    where item.variant_id is null or item.quantity is null or item.quantity <= 0 or item.quantity <> trunc(item.quantity, 3) or item.quantity >= 1000000000000000
  ) then raise exception 'one or more sale items have an invalid quantity'; end if;
  if exists (
    select 1 from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    group by item.variant_id having count(*) > 1
  ) then raise exception 'a variant may appear only once in a sale'; end if;
  if exists (
    select 1 from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    left join public.product_variants variant on variant.id = item.variant_id and variant.business_id = target_business_id
    left join public.products product on product.id = variant.product_id and product.business_id = target_business_id
    where variant.id is null or not variant.is_active or product.id is null or not product.is_active
  ) then raise exception 'one or more sale variants are invalid'; end if;

  -- Shared branch locks let sales proceed concurrently but make a close wait
  -- until every in-flight sale has either linked and committed or rolled back.
  perform pg_advisory_xact_lock_shared(hashtextextended(
    'cash-session:' || target_business_id::text || ':' || target_branch_id::text, 0
  ));
  select cash_session.id into target_cash_session_id
  from public.cash_sessions cash_session
  where cash_session.business_id = target_business_id
    and cash_session.branch_id = target_branch_id
    and cash_session.status = 'open';

  insert into public.inventory_balances (business_id, branch_id, variant_id)
  select target_business_id, target_branch_id, item.variant_id
  from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
  order by item.variant_id on conflict (branch_id, variant_id) do nothing;
  insert into public.sales as sale (business_id, branch_id, payment_method, total_cents, idempotency_key, created_by, cash_session_id)
  values (target_business_id, target_branch_id, sale_payment_method, 0, request_id, auth.uid(), target_cash_session_id)
  returning sale.id, sale.sale_number, sale.created_at into inserted_sale_id, inserted_sale_number, inserted_created_at;
  for input_item in
    select item.variant_id, item.quantity
    from jsonb_to_recordset(requested_items) as item(variant_id uuid, quantity numeric)
    order by item.variant_id
  loop
    select balance.quantity into balance_quantity from public.inventory_balances balance
    where balance.business_id = target_business_id and balance.branch_id = target_branch_id and balance.variant_id = input_item.variant_id for update;
    if balance_quantity < input_item.quantity then raise exception 'insufficient inventory'; end if;
    select effective.effective_price_cents into unit_price from public.variant_effective_prices effective
    where effective.business_id = target_business_id and effective.variant_id = input_item.variant_id;
    if unit_price is null then raise exception 'sale variant has no effective price'; end if;
    line_total := round(input_item.quantity * unit_price)::bigint;
    insert into public.sale_items (sale_id, business_id, variant_id, quantity, unit_price_cents, line_total_cents)
    values (inserted_sale_id, target_business_id, input_item.variant_id, input_item.quantity, unit_price, line_total);
    update public.inventory_balances set quantity = balance_quantity - input_item.quantity
    where business_id = target_business_id and branch_id = target_branch_id and variant_id = input_item.variant_id;
    insert into public.inventory_movements (business_id, branch_id, variant_id, type, quantity_delta, resulting_quantity, note, created_by, sale_id)
    values (target_business_id, target_branch_id, input_item.variant_id, 'sale'::public.inventory_movement_type,
      -input_item.quantity, balance_quantity - input_item.quantity, format('Venta %s', inserted_sale_number), auth.uid(), inserted_sale_id);
    calculated_total := calculated_total + line_total;
    calculated_item_count := calculated_item_count + 1;
  end loop;
  if calculated_item_count = 0 then raise exception 'a sale requires at least one item'; end if;
  update public.sales sale set total_cents = calculated_total where sale.id = inserted_sale_id and sale.business_id = target_business_id;
  return query select inserted_sale_id, inserted_sale_number, calculated_total, inserted_created_at;
end;
$$;

revoke all on function public.open_cash_session(uuid, uuid, bigint, text) from public;
grant execute on function public.open_cash_session(uuid, uuid, bigint, text) to authenticated;
revoke all on function public.record_cash_movement(uuid, uuid, public.cash_movement_type, bigint, text) from public;
grant execute on function public.record_cash_movement(uuid, uuid, public.cash_movement_type, bigint, text) to authenticated;
revoke all on function public.close_cash_session(uuid, uuid, bigint) from public;
grant execute on function public.close_cash_session(uuid, uuid, bigint) to authenticated;
revoke all on function public.list_cash_sessions(uuid, uuid) from public;
grant execute on function public.list_cash_sessions(uuid, uuid) to authenticated;
