import { fetchAllRows } from "@pet-shop/database";
import { QUANTITY_SCALE } from "@pet-shop/domain";
import { db } from "../../lib/supabase";
import { type Balance, type InventoryMovementType, type MovementInput, balanceKey } from "./stock-model";

export type MovementHistoryItem = {
  id: string;
  type: InventoryMovementType;
  quantity_delta: number;
  resulting_quantity: number;
  note: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
};

export async function loadBalances(businessId: string): Promise<Record<string, Balance>> {
  const supabase = db();
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("inventory_balances")
      .select("branch_id,variant_id,quantity,minimum_quantity")
      .eq("business_id", businessId)
      .order("branch_id")
      .order("variant_id")
      .range(from, to),
  );
  return Object.fromEntries(rows.map((row) => [balanceKey(row.branch_id, row.variant_id), { quantity: row.quantity, minimumQuantity: row.minimum_quantity }]));
}

export async function recordMovement(args: {
  businessId: string;
  branchId: string;
  variantId: string;
  type: MovementInput;
  quantity: bigint;
  note: string;
}): Promise<void> {
  const { error } = await db().rpc("record_inventory_movement", {
    target_business_id: args.businessId,
    target_branch_id: args.branchId,
    target_variant_id: args.variantId,
    movement_type: args.type,
    movement_quantity: Number(args.quantity) / Number(QUANTITY_SCALE),
    movement_note: args.note.trim() || undefined,
  });
  if (error) throw error;
}

/** `minimum = null` quita el mínimo (la presentación deja de generar alerta de bajo stock). */
export async function saveMinimum(args: { businessId: string; branchId: string; variantId: string; minimum: bigint | null }): Promise<void> {
  const { error } = await db().rpc("set_inventory_minimum", {
    target_business_id: args.businessId,
    target_branch_id: args.branchId,
    target_variant_id: args.variantId,
    ...(args.minimum === null ? {} : { target_minimum_quantity: Number(args.minimum) / Number(QUANTITY_SCALE) }),
  });
  if (error) throw error;
}

export async function listMovements(businessId: string, branchId: string, variantId: string): Promise<MovementHistoryItem[]> {
  const { data, error } = await db().rpc("list_inventory_movements", {
    target_business_id: businessId,
    target_branch_id: branchId,
    target_variant_id: variantId,
  });
  if (error) throw error;
  return data ?? [];
}
