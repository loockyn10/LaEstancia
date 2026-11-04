import type { Database } from "@pet-shop/database";
import { db } from "../../lib/supabase";

export type CashSession = Database["public"]["Functions"]["list_cash_sessions"]["Returns"][number];
export type CashAction = "open" | "inbound" | "outbound" | "close";

export async function listCashSessions(businessId: string, branchId: string): Promise<CashSession[]> {
  const { data, error } = await db().rpc("list_cash_sessions", { target_business_id: businessId, target_branch_id: branchId });
  if (error) throw error;
  return data ?? [];
}

/** Todas las operaciones de caja son RPCs transaccionales: PostgreSQL valida estado, importes y concurrencia. */
export async function runCashAction(args: {
  businessId: string;
  branchId: string;
  action: CashAction;
  openSession: CashSession | undefined;
  amountCents: number;
  detail: string;
}): Promise<void> {
  const supabase = db();
  const { businessId, branchId, action, openSession, amountCents, detail } = args;
  if (action === "open") {
    const { error } = await supabase.rpc("open_cash_session", {
      target_business_id: businessId,
      target_branch_id: branchId,
      opening_cash_cents: amountCents,
      session_notes: detail.trim() || undefined,
    });
    if (error) throw error;
    return;
  }
  if (!openSession) throw new Error("cash session is not open");
  const { error } =
    action === "close"
      ? await supabase.rpc("close_cash_session", { target_business_id: businessId, target_cash_session_id: openSession.id, counted_cash_cents: amountCents })
      : await supabase.rpc("record_cash_movement", {
          target_business_id: businessId,
          target_cash_session_id: openSession.id,
          movement_type: action,
          amount_cents: amountCents,
          movement_reason: detail.trim(),
        });
  if (error) throw error;
}
