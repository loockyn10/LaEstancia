-- Sprint 5 offers. A promotional price is independent from the current base
-- price and is only effective during its active interval.

create extension if not exists btree_gist;

create table public.variant_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  variant_id uuid not null,
  promotional_price_cents bigint not null check (promotional_price_cents >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid not null references public.profiles (id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id)
    on delete cascade
);

create index variant_offers_business_id_idx on public.variant_offers (business_id);
create index variant_offers_variant_period_idx
  on public.variant_offers (variant_id, starts_at, ends_at);

-- Active offers cannot overlap, including open-ended offers. This makes the
-- effective promotional price deterministic without trusting the client.
alter table public.variant_offers add constraint variant_offers_no_active_overlap
  exclude using gist (
    variant_id with =,
    tstzrange(starts_at, coalesce(ends_at, 'infinity'::timestamptz), '[)') with &&
  ) where (active);

alter table public.variant_offers enable row level security;

revoke all on table public.variant_offers from anon;
revoke all on table public.variant_offers from authenticated;
grant select, insert, update, delete on table public.variant_offers to authenticated;

create function public.set_variant_offer_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger variant_offers_set_updated_at
before update on public.variant_offers
for each row execute function public.set_variant_offer_updated_at();

create policy "variant_offers_select_active_membership"
  on public.variant_offers for select to authenticated
  using (public.has_active_business_membership(business_id));
create policy "variant_offers_insert_pricing_manager"
  on public.variant_offers for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[])
  );
create policy "variant_offers_update_pricing_manager"
  on public.variant_offers for update to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));
create policy "variant_offers_delete_pricing_manager"
  on public.variant_offers for delete to authenticated
  using (public.has_active_business_role(business_id, array['owner', 'admin']::public.business_role[]));

-- Keep the effective-price rule in one database object. security_invoker
-- ensures callers remain subject to the RLS policies of both source tables.
create view public.variant_effective_prices
with (security_invoker = true)
as
select
  price.variant_id,
  price.business_id,
  price.amount_cents as base_price_cents,
  offer.id as offer_id,
  offer.promotional_price_cents,
  offer.starts_at as offer_starts_at,
  offer.ends_at as offer_ends_at,
  offer.active as offer_active,
  coalesce(offer.promotional_price_cents, price.amount_cents) as effective_price_cents
from public.variant_prices as price
left join lateral (
  select id, promotional_price_cents, starts_at, ends_at, active
  from public.variant_offers
  where variant_id = price.variant_id
    and business_id = price.business_id
    and active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  limit 1
) as offer on true;

revoke all on table public.variant_effective_prices from anon;
revoke all on table public.variant_effective_prices from authenticated;
grant select on table public.variant_effective_prices to authenticated;
