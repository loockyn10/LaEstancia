import { fetchAllRows } from "@pet-shop/database";
import type { Database, Json } from "@pet-shop/database";
import type { PaymentMethod } from "@pet-shop/domain";
import { db } from "../../lib/supabase";

type Functions = Database["public"]["Functions"];
export type Sale = Functions["list_sales"]["Returns"][number];
export type SaleItem = Functions["list_sale_items"]["Returns"][number];

export type EffectivePrice = { cents: number; onOffer: boolean };

export async function listSales(businessId: string): Promise<Sale[]> {
  const { data, error } = await db().rpc("list_sales", { target_business_id: businessId });
  if (error) throw error;
  return data ?? [];
}

export async function loadEffectivePrices(businessId: string): Promise<Map<string, EffectivePrice>> {
  const supabase = db();
  const rows = await fetchAllRows((from, to) =>
    supabase.from("variant_effective_prices").select("variant_id,effective_price_cents,offer_id").eq("business_id", businessId).order("variant_id").range(from, to),
  );
  return new Map(
    rows.flatMap((row) => (row.variant_id && row.effective_price_cents !== null ? [[row.variant_id, { cents: row.effective_price_cents, onOffer: row.offer_id !== null }] as const] : [])),
  );
}

export async function listSaleItems(businessId: string, saleId: string): Promise<SaleItem[]> {
  const { data, error } = await db().rpc("list_sale_items", { target_business_id: businessId, target_sale_id: saleId });
  if (error) throw error;
  return data ?? [];
}

/** El precio y el stock los resuelve PostgreSQL al confirmar; el UUID del intento hace idempotentes los reintentos. */
export async function confirmSale(args: {
  businessId: string;
  branchId: string;
  payment: PaymentMethod;
  items: { variant_id: string; quantity: number }[];
  requestId: string;
}): Promise<string> {
  const { data, error } = await db().rpc("confirm_sale", {
    target_business_id: args.businessId,
    target_branch_id: args.branchId,
    sale_payment_method: args.payment,
    requested_items: args.items as Json,
    request_id: args.requestId,
  });
  if (error) throw error;
  const saleId = data?.[0]?.sale_id;
  if (!saleId) throw new Error("confirm_sale returned no sale");
  return saleId;
}
