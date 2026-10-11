-- Split the administrative surface from the POS surface.  Client-side routing
-- is only a convenience: these policies and RPC guards remain the authority.

drop policy if exists "suppliers_select_active_membership" on public.suppliers;
drop policy if exists "purchases_select_active_membership" on public.purchases;
drop policy if exists "supplier_price_lists_select_membership" on public.supplier_price_lists;
drop policy if exists "inventory_movements_select_active_membership" on public.inventory_movements;
drop policy if exists "cash_sessions_select_active_membership" on public.cash_sessions;
drop policy if exists "cash_movements_select_active_membership" on public.cash_movements;
drop policy if exists "sales_select_active_membership" on public.sales;
drop policy if exists "sale_items_select_active_membership" on public.sale_items;

create policy "suppliers_select_purchase_manager"
  on public.suppliers for select to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "purchases_select_purchase_manager"
  on public.purchases for select to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "supplier_price_lists_select_manager"
  on public.supplier_price_lists for select to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "inventory_movements_select_manager"
  on public.inventory_movements for select to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "cash_sessions_select_manager"
  on public.cash_sessions for select to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "cash_movements_select_manager"
  on public.cash_movements for select to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "sales_select_manager_or_own"
  on public.sales for select to authenticated
  using (
    public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
    or (public.has_active_business_role(business_id, array['staff']::public.business_role[]) and created_by = auth.uid())
  );
create policy "sale_items_select_manager_or_own_sale"
  on public.sale_items for select to authenticated
  using (
    public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
    or exists (
      select 1 from public.sales sale
      where sale.id = sale_items.sale_id
        and sale.business_id = sale_items.business_id
        and sale.created_by = auth.uid()
    )
  );

-- A staff member can read only their own receipts. Managers keep the existing
-- business-wide operational history.
create or replace function public.list_sales(
  target_business_id uuid,
  target_branch_id uuid default null
)
returns table (
  id uuid, sale_number bigint, branch_id uuid, branch_name text,
  status public.sale_status, payment_method public.sale_payment_method,
  total_cents bigint, created_at timestamptz, created_by uuid, created_by_name text
)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_active_business_membership(target_business_id) then
    raise exception 'not authorized to read sales';
  end if;
  if target_branch_id is not null and not exists (
    select 1 from public.branches branch
    where branch.id = target_branch_id and branch.business_id = target_business_id
  ) then raise exception 'invalid sale branch'; end if;
  return query
  select sale.id, sale.sale_number, sale.branch_id, branch.name, sale.status,
    sale.payment_method, sale.total_cents, sale.created_at, sale.created_by, profile.display_name
  from public.sales sale
  join public.branches branch on branch.id = sale.branch_id
  left join public.profiles profile on profile.id = sale.created_by
  where sale.business_id = target_business_id
    and (target_branch_id is null or sale.branch_id = target_branch_id)
    and (
      public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[])
      or sale.created_by = auth.uid()
    )
  order by sale.created_at desc, sale.id desc;
end;
$$;

create or replace function public.list_sale_items(target_business_id uuid, target_sale_id uuid)
returns table (
  id uuid, variant_id uuid, quantity numeric, unit_price_cents bigint,
  line_total_cents bigint, product_name text, variant_name text
)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.sales sale
    where sale.id = target_sale_id and sale.business_id = target_business_id
      and public.has_active_business_membership(target_business_id)
      and (
        public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[])
        or sale.created_by = auth.uid()
      )
  ) then raise exception 'not authorized to read sale items'; end if;
  return query
  select item.id, item.variant_id, item.quantity, item.unit_price_cents,
    item.line_total_cents, product.name, variant.name
  from public.sale_items item
  join public.product_variants variant on variant.id = item.variant_id
  join public.products product on product.id = variant.product_id
  where item.sale_id = target_sale_id and item.business_id = target_business_id
  order by item.created_at, item.id;
end;
$$;

-- Staff needs current operational cash state, not business-wide close history.
create or replace function public.list_cash_sessions(
  target_business_id uuid,
  target_branch_id uuid default null
)
returns table (
  id uuid, branch_id uuid, branch_name text, status public.cash_session_status,
  opened_at timestamptz, opened_by uuid, opened_by_name text, opening_cash_cents bigint,
  closed_at timestamptz, closed_by uuid, closed_by_name text, counted_cash_cents bigint,
  expected_cash_cents bigint, difference_cents bigint, cash_sales_cents bigint,
  debit_sales_cents bigint, credit_sales_cents bigint, transfer_sales_cents bigint,
  other_sales_cents bigint, inbound_cents bigint, outbound_cents bigint, notes text
)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_active_business_membership(target_business_id) then
    raise exception 'not authorized to read cash sessions';
  end if;
  if target_branch_id is not null and not exists (
    select 1 from public.branches branch where branch.id = target_branch_id and branch.business_id = target_business_id
  ) then raise exception 'invalid cash session branch'; end if;
  return query
  select cash_session.id, cash_session.branch_id, branch.name, cash_session.status,
    cash_session.opened_at, cash_session.opened_by, opener.display_name,
    cash_session.opening_cash_cents, cash_session.closed_at, cash_session.closed_by,
    closer.display_name, cash_session.counted_cash_cents,
    case when cash_session.status = 'open' then cash_session.opening_cash_cents + sale_totals.cash_sales + movement_totals.inbound - movement_totals.outbound else cash_session.expected_cash_cents end,
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
  join public.branches branch on branch.id = cash_session.branch_id and branch.business_id = cash_session.business_id
  left join public.profiles opener on opener.id = cash_session.opened_by
  left join public.profiles closer on closer.id = cash_session.closed_by
  cross join lateral (select coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'cash'), 0)::bigint as cash_sales, coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'debit'), 0)::bigint as debit_sales, coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'credit'), 0)::bigint as credit_sales, coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'transfer'), 0)::bigint as transfer_sales, coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'other'), 0)::bigint as other_sales from public.sales sale where sale.cash_session_id = cash_session.id and sale.business_id = cash_session.business_id) sale_totals
  cross join lateral (select coalesce(sum(movement.amount_cents) filter (where movement.type = 'inbound'), 0)::bigint as inbound, coalesce(sum(movement.amount_cents) filter (where movement.type = 'outbound'), 0)::bigint as outbound from public.cash_movements movement where movement.cash_session_id = cash_session.id and movement.business_id = cash_session.business_id) movement_totals
  where cash_session.business_id = target_business_id
    and (target_branch_id is null or cash_session.branch_id = target_branch_id)
    and (public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) or cash_session.status = 'open')
  order by (cash_session.status = 'open') desc, cash_session.opened_at desc, cash_session.id desc;
end;
$$;

-- Dashboard aggregates are administration-only; hiding their cards is not a
-- sufficient control because the original functions are SECURITY DEFINER.
create or replace function public.dashboard_payment_methods(target_business_id uuid, target_start_date date, target_end_date date, target_branch_id uuid default null)
returns table (payment_method public.sale_payment_method, total_cents bigint, percentage numeric)
language plpgsql security definer set search_path = ''
as $$
declare period_start timestamptz; period_end timestamptz;
begin
  if auth.uid() is null or not public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) then raise exception 'not authorized to read dashboard'; end if;
  if target_branch_id is not null and not exists (select 1 from public.branches branch where branch.id = target_branch_id and branch.business_id = target_business_id) then raise exception 'invalid dashboard branch'; end if;
  select bounds.starts_at, bounds.ends_at into period_start, period_end from public.dashboard_period_bounds(target_start_date, target_end_date) bounds;
  return query with methods(payment_method) as (values ('cash'::public.sale_payment_method), ('debit'::public.sale_payment_method), ('credit'::public.sale_payment_method), ('transfer'::public.sale_payment_method), ('other'::public.sale_payment_method)), totals as (select sale.payment_method, sum(sale.total_cents)::bigint as total_cents from public.sales sale where sale.business_id = target_business_id and (target_branch_id is null or sale.branch_id = target_branch_id) and sale.created_at >= period_start and sale.created_at < period_end group by sale.payment_method), all_totals as (select coalesce(sum(total_cents), 0)::bigint as total_cents from totals) select methods.payment_method, coalesce(totals.total_cents, 0)::bigint, case when all_totals.total_cents = 0 then 0 else round(coalesce(totals.total_cents, 0)::numeric * 100 / all_totals.total_cents, 2) end from methods cross join all_totals left join totals using (payment_method) order by case methods.payment_method when 'cash' then 1 when 'debit' then 2 when 'credit' then 3 when 'transfer' then 4 else 5 end;
end;
$$;

create or replace function public.dashboard_top_products(target_business_id uuid, target_start_date date, target_end_date date, target_branch_id uuid default null, result_limit integer default 5)
returns table (product_name text, variant_name text, quantity numeric, revenue_cents bigint)
language plpgsql security definer set search_path = ''
as $$
declare period_start timestamptz; period_end timestamptz;
begin
  if auth.uid() is null or not public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) then raise exception 'not authorized to read dashboard'; end if;
  if target_branch_id is not null and not exists (select 1 from public.branches branch where branch.id = target_branch_id and branch.business_id = target_business_id) then raise exception 'invalid dashboard branch'; end if;
  if result_limit is null or result_limit < 1 or result_limit > 10 then raise exception 'invalid dashboard result limit'; end if;
  select bounds.starts_at, bounds.ends_at into period_start, period_end from public.dashboard_period_bounds(target_start_date, target_end_date) bounds;
  return query select product.name, variant.name, sum(item.quantity)::numeric, sum(item.line_total_cents)::bigint from public.sales sale join public.sale_items item on item.sale_id = sale.id and item.business_id = sale.business_id join public.product_variants variant on variant.id = item.variant_id and variant.business_id = item.business_id join public.products product on product.id = variant.product_id and product.business_id = variant.business_id where sale.business_id = target_business_id and (target_branch_id is null or sale.branch_id = target_branch_id) and sale.created_at >= period_start and sale.created_at < period_end group by product.id, product.name, variant.id, variant.name order by sum(item.quantity) desc, sum(item.line_total_cents) desc, product.name, variant.name limit result_limit;
end;
$$;

create or replace function public.dashboard_overview(target_business_id uuid, target_start_date date, target_end_date date, target_branch_id uuid default null)
returns table (sales_total_cents bigint, sales_count bigint, average_ticket_cents bigint, purchase_total_cents bigint, purchase_count bigint, out_of_stock_count bigint, low_stock_count bigint, gross_margin_cents bigint, gross_margin_percent numeric, margin_missing_cost_item_count bigint)
language plpgsql security definer set search_path = ''
as $$
declare period_start timestamptz; period_end timestamptz;
begin
  if auth.uid() is null or not public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) then raise exception 'not authorized to read dashboard'; end if;
  if target_branch_id is not null and not exists (select 1 from public.branches branch where branch.id = target_branch_id and branch.business_id = target_business_id) then raise exception 'invalid dashboard branch'; end if;
  select bounds.starts_at, bounds.ends_at into period_start, period_end from public.dashboard_period_bounds(target_start_date, target_end_date) bounds;
  return query
  with scoped_sales as (select sale.* from public.sales sale where sale.business_id = target_business_id and (target_branch_id is null or sale.branch_id = target_branch_id) and sale.created_at >= period_start and sale.created_at < period_end),
  sales_totals as (select coalesce(sum(sale.total_cents), 0)::bigint as total_cents, count(*)::bigint as count_sales from scoped_sales sale),
  margin_totals as (select count(*) filter (where cost_at_sale.amount_cents is null)::bigint as missing_cost_items, coalesce(sum(item.line_total_cents - round(item.quantity * cost_at_sale.amount_cents)::bigint) filter (where cost_at_sale.amount_cents is not null), 0)::bigint as covered_margin_cents from scoped_sales sale join public.sale_items item on item.sale_id = sale.id and item.business_id = sale.business_id left join lateral (select history.amount_cents from public.variant_cost_history history where history.business_id = sale.business_id and history.variant_id = item.variant_id and history.changed_at <= sale.created_at order by history.changed_at desc, history.id desc limit 1) cost_at_sale on true),
  purchase_totals as (select coalesce(sum(round(item.quantity * item.unit_cost_cents)), 0)::bigint as total_cents, count(distinct purchase.id)::bigint as count_purchases from public.purchases purchase join public.purchase_items item on item.purchase_id = purchase.id and item.business_id = purchase.business_id where purchase.business_id = target_business_id and purchase.status = 'confirmed' and (target_branch_id is null or purchase.branch_id = target_branch_id) and purchase.purchase_date >= target_start_date and purchase.purchase_date < target_end_date),
  scoped_branches as (select branch.id from public.branches branch where branch.business_id = target_business_id and (target_branch_id is null or branch.id = target_branch_id)),
  scoped_variants as (select variant.id from public.product_variants variant where variant.business_id = target_business_id),
  stock_totals as (select count(*) filter (where coalesce(balance.quantity, 0) = 0)::bigint as out_count, count(*) filter (where coalesce(balance.quantity, 0) > 0 and balance.minimum_quantity is not null and balance.quantity <= balance.minimum_quantity)::bigint as low_count from scoped_branches branch cross join scoped_variants variant left join public.inventory_balances balance on balance.business_id = target_business_id and balance.branch_id = branch.id and balance.variant_id = variant.id)
  select sales.total_cents, sales.count_sales, case when sales.count_sales = 0 then 0 else round(sales.total_cents::numeric / sales.count_sales)::bigint end, purchases.total_cents, purchases.count_purchases, stock.out_count, stock.low_count, case when margins.missing_cost_items = 0 then margins.covered_margin_cents else null end, case when margins.missing_cost_items = 0 and sales.total_cents > 0 then round(margins.covered_margin_cents::numeric * 100 / sales.total_cents, 2) else null end, margins.missing_cost_items from sales_totals sales cross join margin_totals margins cross join purchase_totals purchases cross join stock_totals stock;
end;
$$;

create or replace function public.dashboard_cash_summary(target_business_id uuid, target_branch_id uuid default null)
returns table (branch_id uuid, branch_name text, open_session_id uuid, opened_at timestamptz, expected_cash_cents bigint, last_closed_at timestamptz, last_difference_cents bigint)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_active_business_role(target_business_id, array['owner', 'admin']::public.business_role[]) then raise exception 'not authorized to read dashboard'; end if;
  if target_branch_id is not null and not exists (select 1 from public.branches branch where branch.id = target_branch_id and branch.business_id = target_business_id) then raise exception 'invalid dashboard branch'; end if;
  return query select branch.id, branch.name, open_session.id, open_session.opened_at, open_session.opening_cash_cents + coalesce(open_sales.cash_sales_cents, 0) + coalesce(open_movements.inbound_cents, 0) - coalesce(open_movements.outbound_cents, 0), closed_session.closed_at, closed_session.difference_cents from public.branches branch left join lateral (select session.* from public.cash_sessions session where session.business_id = branch.business_id and session.branch_id = branch.id and session.status = 'open' limit 1) open_session on true left join lateral (select coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'cash'), 0)::bigint as cash_sales_cents from public.sales sale where sale.cash_session_id = open_session.id and sale.business_id = branch.business_id) open_sales on true left join lateral (select coalesce(sum(movement.amount_cents) filter (where movement.type = 'inbound'), 0)::bigint as inbound_cents, coalesce(sum(movement.amount_cents) filter (where movement.type = 'outbound'), 0)::bigint as outbound_cents from public.cash_movements movement where movement.cash_session_id = open_session.id and movement.business_id = branch.business_id) open_movements on true left join lateral (select session.closed_at, session.difference_cents from public.cash_sessions session where session.business_id = branch.business_id and session.branch_id = branch.id and session.status = 'closed' order by session.closed_at desc, session.id desc limit 1) closed_session on true where branch.business_id = target_business_id and (target_branch_id is null or branch.id = target_branch_id) order by branch.name;
end;
$$;
