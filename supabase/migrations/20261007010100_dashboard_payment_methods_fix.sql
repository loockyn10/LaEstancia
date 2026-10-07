-- Correct Sprint 11 payment aggregation: the OUT column total_cents shadows
-- an unqualified CTE column in PL/pgSQL.

create or replace function public.dashboard_payment_methods(
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
  ), all_totals as (select coalesce(sum(totals.total_cents), 0)::bigint as total_cents from totals)
  select methods.payment_method, coalesce(totals.total_cents, 0)::bigint,
    case when all_totals.total_cents = 0 then 0 else round(coalesce(totals.total_cents, 0)::numeric * 100 / all_totals.total_cents, 2) end
  from methods cross join all_totals left join totals using (payment_method)
  order by case methods.payment_method when 'cash' then 1 when 'debit' then 2 when 'credit' then 3 when 'transfer' then 4 else 5 end;
end;
$$;
