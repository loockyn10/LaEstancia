import { fetchAllRows } from "@pet-shop/database";
import { db } from "../../lib/supabase";
import { type PriceSource, type PricingData, toPriceSource } from "./pricing-model";

export type PriceHistoryItem = {
  id: string;
  type: "Precio" | "Costo";
  amount_cents: number | null;
  changed_at: string;
  changed_by: string | null;
  price_source: PriceSource | null;
};

export type SupplierPvpOption = { supplier_id: string; supplier_name: string; pvp_cents: number; price_list_id: string; applied_at: string };

export async function loadPricing(businessId: string): Promise<PricingData> {
  const supabase = db();
  const [prices, offers, effective, costs] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("variant_prices").select("variant_id,amount_cents,price_source,supplier_id").eq("business_id", businessId).order("variant_id").range(from, to)),
    fetchAllRows((from, to) => supabase.from("variant_offers").select("id,variant_id,promotional_price_cents,starts_at,ends_at,active").eq("business_id", businessId).order("starts_at", { ascending: false }).order("id").range(from, to)),
    fetchAllRows((from, to) => supabase.from("variant_effective_prices").select("variant_id,effective_price_cents").eq("business_id", businessId).order("variant_id").range(from, to)),
    fetchAllRows((from, to) => supabase.from("variant_costs").select("variant_id,amount_cents").eq("business_id", businessId).order("variant_id").range(from, to)),
  ]);
  return {
    prices: Object.fromEntries(prices.map((item) => [item.variant_id, item.amount_cents])),
    sources: Object.fromEntries(prices.map((item) => [item.variant_id, { source: toPriceSource(item.price_source), supplierId: item.supplier_id }])),
    offers,
    effectivePrices: Object.fromEntries(effective.flatMap((item) => (item.variant_id && item.effective_price_cents !== null ? [[item.variant_id, item.effective_price_cents]] : []))),
    costs: Object.fromEntries(costs.map((item) => [item.variant_id, item.amount_cents])),
  };
}

/** Un importe vacío (`null`) quita el precio/costo actual; el historial lo registran los triggers de PostgreSQL. */
export async function saveAmounts(args: { businessId: string; variantId: string; price: number | null; cost: number | null }): Promise<void> {
  const supabase = db();
  const [priceResult, costResult] = await Promise.all([
    // La RPC acepta null para limpiar el precio, pero el tipo generado no lo refleja.
    supabase.rpc("set_variant_base_price", { target_business_id: args.businessId, target_variant_id: args.variantId, target_amount_cents: args.price as number }),
    args.cost === null
      ? supabase.from("variant_costs").delete().eq("variant_id", args.variantId).eq("business_id", args.businessId)
      : supabase.from("variant_costs").upsert({ variant_id: args.variantId, business_id: args.businessId, amount_cents: args.cost }, { onConflict: "variant_id" }),
  ]);
  const failure = priceResult.error ?? costResult.error;
  if (failure) throw failure;
}

export async function saveOffer(args: {
  businessId: string;
  variantId: string;
  offerId?: string;
  promotionalPriceCents: number;
  startsAt: Date;
  endsAt: Date | null;
  active: boolean;
}): Promise<void> {
  const supabase = db();
  const payload = {
    business_id: args.businessId,
    variant_id: args.variantId,
    promotional_price_cents: args.promotionalPriceCents,
    starts_at: args.startsAt.toISOString(),
    ends_at: args.endsAt?.toISOString() ?? null,
    active: args.active,
  };
  const { error } = args.offerId
    ? await supabase.from("variant_offers").update(payload).eq("id", args.offerId).eq("business_id", args.businessId)
    : await supabase.from("variant_offers").insert(payload);
  if (error) throw error;
}

export async function loadPriceHistory(businessId: string, variantId: string): Promise<PriceHistoryItem[]> {
  const supabase = db();
  const [prices, costs] = await Promise.all([
    supabase.from("variant_price_history").select("id,amount_cents,changed_at,changed_by,price_source").eq("business_id", businessId).eq("variant_id", variantId).order("changed_at", { ascending: false }),
    supabase.from("variant_cost_history").select("id,amount_cents,changed_at,changed_by").eq("business_id", businessId).eq("variant_id", variantId).order("changed_at", { ascending: false }),
  ]);
  const failure = prices.error ?? costs.error;
  if (failure) throw failure;
  return [
    ...(prices.data ?? []).map((item): PriceHistoryItem => ({ ...item, type: "Precio", price_source: toPriceSource(item.price_source) })),
    ...(costs.data ?? []).map((item): PriceHistoryItem => ({ ...item, type: "Costo", price_source: null })),
  ].sort((left, right) => right.changed_at.localeCompare(left.changed_at));
}

export async function adjustPrices(businessId: string, variantIds: string[], percent: number): Promise<void> {
  const { error } = await db().rpc("adjust_variant_prices", { target_business_id: businessId, target_variant_ids: variantIds, adjustment_percent: percent });
  if (error) throw error;
}

export async function listSupplierPvps(businessId: string, variantId: string): Promise<SupplierPvpOption[]> {
  const { data, error } = await db().rpc("get_variant_supplier_pvps", { target_business_id: businessId, target_variant_id: variantId });
  if (error) throw error;
  return data ?? [];
}

export async function followSupplierPvp(businessId: string, variantId: string, supplierId: string): Promise<void> {
  const { error } = await db().rpc("follow_supplier_pvp", { target_business_id: businessId, target_variant_id: variantId, target_supplier_id: supplierId });
  if (error) throw error;
}
