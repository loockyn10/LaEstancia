import type { Database } from "@pet-shop/database";
import { db } from "../lib/supabase";

export type CashSession = Database["public"]["Functions"]["list_cash_sessions"]["Returns"][number];
export type CashAction = "open" | "close" | "inbound" | "outbound";

/** La caja abierta de la sucursal (las sesiones cerradas no hacen falta en el POS). */
export async function findOpenCashSession(businessId: string, branchId: string): Promise<CashSession | null> {
  const { data, error } = await db().rpc("list_cash_sessions", { target_business_id: businessId, target_branch_id: branchId });
  if (error) throw error;
  return data?.find((session) => session.status === "open") ?? null;
}

/** Apertura, movimientos y cierre son RPCs transaccionales: PostgreSQL valida estado, importes y concurrencia. */
export async function runCashAction(args: { businessId: string; branchId: string; action: CashAction; openSession: CashSession | null; amountCents: number; reason: string }): Promise<void> {
  const supabase = db();
  const { businessId, branchId, action, openSession, amountCents, reason } = args;
  if (action === "open") {
    const { error } = await supabase.rpc("open_cash_session", { target_business_id: businessId, target_branch_id: branchId, opening_cash_cents: amountCents });
    if (error) throw error;
    return;
  }
  if (!openSession) throw new Error("cash session is not open");
  const { error } =
    action === "close"
      ? await supabase.rpc("close_cash_session", { target_business_id: businessId, target_cash_session_id: openSession.id, counted_cash_cents: amountCents })
      : await supabase.rpc("record_cash_movement", { target_business_id: businessId, target_cash_session_id: openSession.id, movement_type: action, amount_cents: amountCents, movement_reason: reason });
  if (error) throw error;
}
