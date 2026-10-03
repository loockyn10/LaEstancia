-- Sprint 4 pricing. Amounts are stored as integer cents; current selling
-- prices and costs remain separate so staff never receives cost data.

create table public.variant_prices (
  variant_id uuid not null,
  business_id uuid not null,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (variant_id),
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id)
    on delete cascade
);

create index variant_prices_business_id_idx on public.variant_prices (business_id);

create table public.variant_costs (
  variant_id uuid not null,
  business_id uuid not null,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (variant_id),
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id)
    on delete cascade
);

create index variant_costs_business_id_idx on public.variant_costs (business_id);

create table public.variant_price_history (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null,
  business_id uuid not null,
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null,
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id)
    on delete cascade
);

create index variant_price_history_variant_changed_at_idx
  on public.variant_price_history (variant_id, changed_at desc);

create table public.variant_cost_history (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null,
  business_id uuid not null,
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null,
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id)
    on delete cascade
);

create index variant_cost_history_variant_changed_at_idx
  on public.variant_cost_history (variant_id, changed_at desc);

alter table public.variant_prices enable row level security;
alter table public.variant_costs enable row level security;
alter table public.variant_price_history enable row level security;
alter table public.variant_cost_history enable row level security;

revoke all on table public.variant_prices, public.variant_costs,
  public.variant_price_history, public.variant_cost_history from anon;
revoke all on table public.variant_prices, public.variant_costs,
  public.variant_price_history, public.variant_cost_history from authenticated;
grant select, insert, update, delete on table public.variant_prices,
  public.variant_costs to authenticated;
grant select on table public.variant_price_history,
  public.variant_cost_history to authenticated;

create function public.set_variant_pricing_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger variant_prices_set_updated_at
before update on public.variant_prices
for each row execute function public.set_variant_pricing_updated_at();

create trigger variant_costs_set_updated_at
before update on public.variant_costs
for each row execute function public.set_variant_pricing_updated_at();

-- The history tables deliberately have no client write grants. This trigger
-- records the initial amount, every changed amount, and a later clear (NULL).
create function public.record_variant_pricing_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.amount_cents is not distinct from new.amount_cents then
    return new;
  end if;

  if tg_table_name = 'variant_prices' then
    insert into public.variant_price_history (
      variant_id, business_id, amount_cents, changed_by
    ) values (
      case when tg_op = 'DELETE' then old.variant_id else new.variant_id end,
      case when tg_op = 'DELETE' then old.business_id else new.business_id end,
      case when tg_op = 'DELETE' then null else new.amount_cents end,
      (select id from public.profiles where id = auth.uid())
    );
  else
    insert into public.variant_cost_history (
      variant_id, business_id, amount_cents, changed_by
    ) values (
      case when tg_op = 'DELETE' then old.variant_id else new.variant_id end,
      case when tg_op = 'DELETE' then old.business_id else new.business_id end,
      case when tg_op = 'DELETE' then null else new.amount_cents end,
      (select id from public.profiles where id = auth.uid())
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger variant_prices_record_history
after insert or update or delete on public.variant_prices
for each row execute function public.record_variant_pricing_history();

create trigger variant_costs_record_history
after insert or update or delete on public.variant_costs
for each row execute function public.record_variant_pricing_history();

create policy "variant_prices_select_active_membership"
  on public.variant_prices for select to authenticated
  using (public.has_active_business_membership(business_id));
create policy "variant_prices_insert_pricing_manager"
  on public.variant_prices for insert to authenticated
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "variant_prices_update_pricing_manager"
  on public.variant_prices for update to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "variant_prices_delete_pricing_manager"
  on public.variant_prices for delete to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));

create policy "variant_costs_select_pricing_manager"
  on public.variant_costs for select to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "variant_costs_insert_pricing_manager"
  on public.variant_costs for insert to authenticated
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "variant_costs_update_pricing_manager"
  on public.variant_costs for update to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "variant_costs_delete_pricing_manager"
  on public.variant_costs for delete to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));

create policy "variant_price_history_select_pricing_manager"
  on public.variant_price_history for select to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "variant_cost_history_select_pricing_manager"
  on public.variant_cost_history for select to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));

-- A single statement makes a selected-price adjustment atomic. The explicit
-- membership and variant checks produce no cross-business partial updates.
create function public.adjust_variant_prices(
  target_business_id uuid,
  target_variant_ids uuid[],
  adjustment_percent numeric
)
returns table (variant_id uuid, amount_cents bigint)
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_active_business_role(
    target_business_id, array['owner', 'admin']::public.business_role[]
  ) then
    raise exception 'not authorized to adjust prices';
  end if;

  if coalesce(cardinality(target_variant_ids), 0) = 0 then
    raise exception 'at least one variant is required';
  end if;

  if adjustment_percent < -100 then
    raise exception 'adjustment cannot reduce a price below zero';
  end if;

  if exists (
    select 1
    from unnest(target_variant_ids) as requested(variant_id)
    where not exists (
      select 1
      from public.product_variants variant
      where variant.id = requested.variant_id
        and variant.business_id = target_business_id
    )
  ) then
    raise exception 'one or more variants do not belong to this business';
  end if;

  if exists (
    select 1
    from unnest(target_variant_ids) as requested(variant_id)
    where not exists (
      select 1
      from public.variant_prices price
      where price.variant_id = requested.variant_id
        and price.business_id = target_business_id
    )
  ) then
    raise exception 'one or more variants do not have a current price';
  end if;

  return query
  update public.variant_prices as price
  set amount_cents = round(price.amount_cents * (1 + adjustment_percent / 100))::bigint
  where price.business_id = target_business_id
    and price.variant_id = any(target_variant_ids)
  returning price.variant_id, price.amount_cents;
end;
$$;

revoke all on function public.adjust_variant_prices(uuid, uuid[], numeric) from public;
grant execute on function public.adjust_variant_prices(uuid, uuid[], numeric) to authenticated;
