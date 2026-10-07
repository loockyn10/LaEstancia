-- Sprint 11 operational dashboard. Aggregation stays in PostgreSQL so the
-- browser never needs to download operational history to calculate metrics.
-- Dates are calendar dates in the business's current Argentine operation;
-- target_end_date is exclusive.

create function public.dashboard_period_bounds(
  target_start_date date,
  target_end_date date
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if target_start_date is null or target_end_date is null
    or target_end_date <= target_start_date then
    raise exception 'invalid dashboard date range';
  end if;

  return query select
    target_start_date::timestamp at time zone 'America/Argentina/Buenos_Aires',
    target_end_date::timestamp at time zone 'America/Argentina/Buenos_Aires';
end;
$$;

create function public.dashboard_overview(
  target_business_id uuid,
  target_start_date date,
  target_end_date date,
  target_branch_id uuid default null
)
returns table (
  sales_total_cents bigint,
  sales_count bigint,
  average_ticket_cents bigint,
  purchase_total_cents bigint,
  purchase_count bigint,
  out_of_stock_count bigint,
  low_stock_count bigint,
  gross_margin_cents bigint,
  gross_margin_percent numeric,
  margin_missing_cost_item_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  period_start timestamptz;
  period_end timestamptz;
  can_read_sensitive boolean;
begin
  if auth.uid() is null or not public.has_active_business_membership(target_business_id) then
    raise exception 'not authorized to read dashboard';
  end if;
  if target_branch_id is not null and not exists (
    select 1 from public.branches branch
    where branch.id = target_branch_id and branch.business_id = target_business_id
  ) then
    raise exception 'invalid dashboard branch';
  end if;
  select bounds.starts_at, bounds.ends_at into period_start, period_end
  from public.dashboard_period_bounds(target_start_date, target_end_date) as bounds;
  can_read_sensitive := public.has_active_business_role(
    target_business_id, array['owner', 'admin']::public.business_role[]
  );

  return query
  with scoped_sales as (
    select sale.*
    from public.sales sale
    where sale.business_id = target_business_id
      and (target_branch_id is null or sale.branch_id = target_branch_id)
      and sale.created_at >= period_start
      and sale.created_at < period_end
  ),
  sales_totals as (
    select coalesce(sum(sale.total_cents), 0)::bigint as total_cents,
      count(*)::bigint as count_sales
    from scoped_sales sale
  ),
  margin_totals as (
    select
      count(*) filter (where cost_at_sale.amount_cents is null)::bigint as missing_cost_items,
      coalesce(sum(
        item.line_total_cents - round(item.quantity * cost_at_sale.amount_cents)::bigint
      ) filter (where cost_at_sale.amount_cents is not null), 0)::bigint as covered_margin_cents
    from scoped_sales sale
    join public.sale_items item
      on item.sale_id = sale.id and item.business_id = sale.business_id
    left join lateral (
      select history.amount_cents
      from public.variant_cost_history history
      where history.business_id = sale.business_id
        and history.variant_id = item.variant_id
        and history.changed_at <= sale.created_at
      order by history.changed_at desc, history.id desc
      limit 1
    ) cost_at_sale on true
  ),
  purchase_totals as (
    select
      coalesce(sum(round(item.quantity * item.unit_cost_cents)), 0)::bigint as total_cents,
      count(distinct purchase.id)::bigint as count_purchases
    from public.purchases purchase
    join public.purchase_items item
      on item.purchase_id = purchase.id and item.business_id = purchase.business_id
    where purchase.business_id = target_business_id
      and purchase.status = 'confirmed'
      and (target_branch_id is null or purchase.branch_id = target_branch_id)
      and purchase.purchase_date >= target_start_date
      and purchase.purchase_date < target_end_date
  ),
  scoped_branches as (
    select branch.id
    from public.branches branch
    where branch.business_id = target_business_id
      and (target_branch_id is null or branch.id = target_branch_id)
  ),
  scoped_variants as (
    select variant.id
    from public.product_variants variant
    where variant.business_id = target_business_id
  ),
  stock_totals as (
    select
      count(*) filter (where coalesce(balance.quantity, 0) = 0)::bigint as out_count,
      count(*) filter (
        where coalesce(balance.quantity, 0) > 0
          and balance.minimum_quantity is not null
          and balance.quantity <= balance.minimum_quantity
      )::bigint as low_count
    from scoped_branches branch
    cross join scoped_variants variant
    left join public.inventory_balances balance
      on balance.business_id = target_business_id
      and balance.branch_id = branch.id
      and balance.variant_id = variant.id
  )
  select sales.total_cents,
    sales.count_sales,
    case when sales.count_sales = 0 then 0
      else round(sales.total_cents::numeric / sales.count_sales)::bigint end,
    case when can_read_sensitive then purchases.total_cents else null end,
    case when can_read_sensitive then purchases.count_purchases else null end,
    stock.out_count,
    stock.low_count,
    case when can_read_sensitive and margins.missing_cost_items = 0
      then margins.covered_margin_cents else null end,
    case when can_read_sensitive and margins.missing_cost_items = 0 and sales.total_cents > 0
      then round(margins.covered_margin_cents::numeric * 100 / sales.total_cents, 2) else null end,
    case when can_read_sensitive then margins.missing_cost_items else null end
  from sales_totals sales
  cross join margin_totals margins
  cross join purchase_totals purchases
  cross join stock_totals stock;
end;
$$;

create function public.dashboard_payment_methods(
  target_business_id uuid,
  target_start_date date,
  target_end_date date,
  target_branch_id uuid default null
)
returns table (payment_method public.sale_payment_method, total_cents bigint, percentage numeric)
language plpgsql security definer set search_path = ''
as $$
declare period_start timestamptz; period_end timestamptz;
begin
  if auth.uid() is null or not public.has_active_business_membership(target_business_id) then raise exception 'not authorized to read dashboard'; end if;
  if target_branch_id is not null and not exists (select 1 from public.branches branch where branch.id = target_branch_id and branch.business_id = target_business_id) then raise exception 'invalid dashboard branch'; end if;
  select bounds.starts_at, bounds.ends_at into period_start, period_end from public.dashboard_period_bounds(target_start_date, target_end_date) bounds;
  return query
  with methods(payment_method) as (
    values ('cash'::public.sale_payment_method), ('debit'::public.sale_payment_method), ('credit'::public.sale_payment_method), ('transfer'::public.sale_payment_method), ('other'::public.sale_payment_method)
  ), totals as (
    select sale.payment_method, sum(sale.total_cents)::bigint as total_cents
    from public.sales sale
    where sale.business_id = target_business_id and (target_branch_id is null or sale.branch_id = target_branch_id)
      and sale.created_at >= period_start and sale.created_at < period_end
    group by sale.payment_method
  ), all_totals as (select coalesce(sum(total_cents), 0)::bigint as total_cents from totals)
  select methods.payment_method, coalesce(totals.total_cents, 0)::bigint,
    case when all_totals.total_cents = 0 then 0 else round(coalesce(totals.total_cents, 0)::numeric * 100 / all_totals.total_cents, 2) end
  from methods cross join all_totals left join totals using (payment_method)
  order by case methods.payment_method when 'cash' then 1 when 'debit' then 2 when 'credit' then 3 when 'transfer' then 4 else 5 end;
end;
$$;

create function public.dashboard_top_products(
  target_business_id uuid,
  target_start_date date,
  target_end_date date,
  target_branch_id uuid default null,
  result_limit integer default 5
)
returns table (product_name text, variant_name text, quantity numeric, revenue_cents bigint)
language plpgsql security definer set search_path = ''
as $$
declare period_start timestamptz; period_end timestamptz;
begin
  if auth.uid() is null or not public.has_active_business_membership(target_business_id) then raise exception 'not authorized to read dashboard'; end if;
  if target_branch_id is not null and not exists (select 1 from public.branches branch where branch.id = target_branch_id and branch.business_id = target_business_id) then raise exception 'invalid dashboard branch'; end if;
  if result_limit is null or result_limit < 1 or result_limit > 10 then raise exception 'invalid dashboard result limit'; end if;
  select bounds.starts_at, bounds.ends_at into period_start, period_end from public.dashboard_period_bounds(target_start_date, target_end_date) bounds;
  return query
  select product.name, variant.name, sum(item.quantity)::numeric, sum(item.line_total_cents)::bigint
  from public.sales sale
  join public.sale_items item on item.sale_id = sale.id and item.business_id = sale.business_id
  join public.product_variants variant on variant.id = item.variant_id and variant.business_id = item.business_id
  join public.products product on product.id = variant.product_id and product.business_id = variant.business_id
  where sale.business_id = target_business_id and (target_branch_id is null or sale.branch_id = target_branch_id)
    and sale.created_at >= period_start and sale.created_at < period_end
  group by product.id, product.name, variant.id, variant.name
  order by sum(item.quantity) desc, sum(item.line_total_cents) desc, product.name, variant.name
  limit result_limit;
end;
$$;

create function public.dashboard_cash_summary(
  target_business_id uuid,
  target_branch_id uuid default null
)
returns table (
  branch_id uuid, branch_name text, open_session_id uuid, opened_at timestamptz,
  expected_cash_cents bigint, last_closed_at timestamptz, last_difference_cents bigint
)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_active_business_membership(target_business_id) then raise exception 'not authorized to read dashboard'; end if;
  if target_branch_id is not null and not exists (select 1 from public.branches branch where branch.id = target_branch_id and branch.business_id = target_business_id) then raise exception 'invalid dashboard branch'; end if;
  return query
  select branch.id, branch.name, open_session.id, open_session.opened_at,
    open_session.opening_cash_cents + coalesce(open_sales.cash_sales_cents, 0) + coalesce(open_movements.inbound_cents, 0) - coalesce(open_movements.outbound_cents, 0),
    closed_session.closed_at, closed_session.difference_cents
  from public.branches branch
  left join lateral (
    select session.* from public.cash_sessions session
    where session.business_id = branch.business_id and session.branch_id = branch.id and session.status = 'open'
    limit 1
  ) open_session on true
  left join lateral (
    select coalesce(sum(sale.total_cents) filter (where sale.payment_method = 'cash'), 0)::bigint as cash_sales_cents
    from public.sales sale where sale.cash_session_id = open_session.id and sale.business_id = branch.business_id
  ) open_sales on true
  left join lateral (
    select coalesce(sum(movement.amount_cents) filter (where movement.type = 'inbound'), 0)::bigint as inbound_cents,
      coalesce(sum(movement.amount_cents) filter (where movement.type = 'outbound'), 0)::bigint as outbound_cents
    from public.cash_movements movement where movement.cash_session_id = open_session.id and movement.business_id = branch.business_id
  ) open_movements on true
  left join lateral (
    select session.closed_at, session.difference_cents from public.cash_sessions session
    where session.business_id = branch.business_id and session.branch_id = branch.id and session.status = 'closed'
    order by session.closed_at desc, session.id desc limit 1
  ) closed_session on true
  where branch.business_id = target_business_id and (target_branch_id is null or branch.id = target_branch_id)
  order by branch.name;
end;
$$;

revoke all on function public.dashboard_period_bounds(date, date) from public;
revoke all on function public.dashboard_overview(uuid, date, date, uuid) from public;
grant execute on function public.dashboard_overview(uuid, date, date, uuid) to authenticated;
revoke all on function public.dashboard_payment_methods(uuid, date, date, uuid) from public;
grant execute on function public.dashboard_payment_methods(uuid, date, date, uuid) to authenticated;
revoke all on function public.dashboard_top_products(uuid, date, date, uuid, integer) from public;
grant execute on function public.dashboard_top_products(uuid, date, date, uuid, integer) to authenticated;
revoke all on function public.dashboard_cash_summary(uuid, uuid) from public;
grant execute on function public.dashboard_cash_summary(uuid, uuid) to authenticated;
