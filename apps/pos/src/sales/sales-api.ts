import type { Database, Json } from "@pet-shop/database";
import type { PaymentMethod } from "@pet-shop/domain";
import { db } from "../lib/supabase";

export type RecentSale = Pick<Database["public"]["Functions"]["list_sales"]["Returns"][number], "id" | "sale_number" | "total_cents" | "created_at">;

/**
 * Cobrar requiere conexión: `confirm_sale` (PostgreSQL) resuelve el precio efectivo, descuenta stock y vincula la
 * caja abierta en una sola transacción. El UUID del intento hace idempotentes los reintentos.
 */
export async function confirmSale(args: {
  businessId: string;
  branchId: string;
  payment: PaymentMethod;
  items: { variant_id: string; quantity: number }[];
  requestId: string;
}): Promise<void> {
  const { error } = await db().rpc("confirm_sale", {
    target_business_id: args.businessId,
    target_branch_id: args.branchId,
    sale_payment_method: args.payment,
    requested_items: args.items as Json,
    request_id: args.requestId,
  });
  if (error) throw error;
}

/** Staff sólo recibe sus propias ventas (lo impone la RPC); owner/admin reciben todas las de la sucursal. */
export async function listRecentSales(businessId: string, branchId: string): Promise<RecentSale[]> {
  const { data, error } = await db().rpc("list_sales", { target_business_id: businessId, target_branch_id: branchId });
  if (error) throw error;
  return data ?? [];
}
