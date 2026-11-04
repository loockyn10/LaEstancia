import { parsePositiveQuantity } from "@pet-shop/domain";
import { db } from "../../lib/supabase";

export type Supplier = { id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; notes: string | null; is_active: boolean };
export type SupplierDraft = { name: string; contact_name: string; phone: string; email: string; notes: string; is_active: boolean };
export type PurchaseStatus = "draft" | "confirmed" | "cancelled";
export type Purchase = { id: string; supplier_id: string | null; branch_id: string; purchase_date: string; document_number: string | null; notes: string | null; status: PurchaseStatus; created_at: string };
export type PurchaseHeader = { supplier_id: string; branch_id: string; purchase_date: string; document_number: string; notes: string };
export type PurchaseItem = { id?: string; variant_id: string; quantity: string; unit_cost_cents: number };

const supplierColumns = "id,name,contact_name,phone,email,notes,is_active";

export async function listSuppliers(businessId: string): Promise<Supplier[]> {
  const { data, error } = await db().from("suppliers").select(supplierColumns).eq("business_id", businessId).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function saveSupplier(businessId: string, draft: SupplierDraft, id?: string): Promise<void> {
  const payload = {
    business_id: businessId,
    name: draft.name.trim(),
    contact_name: draft.contact_name.trim() || null,
    phone: draft.phone.trim() || null,
    email: draft.email.trim() || null,
    notes: draft.notes.trim() || null,
    is_active: draft.is_active,
  };
  const supabase = db();
  const { error } = id
    ? await supabase.from("suppliers").update(payload).eq("id", id).eq("business_id", businessId)
    : await supabase.from("suppliers").insert(payload);
  if (error) throw error;
}

export async function listPurchases(businessId: string): Promise<Purchase[]> {
  const { data, error } = await db()
    .from("purchases")
    .select("id,supplier_id,branch_id,purchase_date,document_number,notes,status,created_at")
    .eq("business_id", businessId)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function loadPurchaseItems(businessId: string, purchaseId: string): Promise<PurchaseItem[]> {
  const { data, error } = await db().from("purchase_items").select("id,variant_id,quantity,unit_cost_cents").eq("purchase_id", purchaseId).eq("business_id", businessId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((item) => ({ ...item, quantity: String(item.quantity) }));
}

/**
 * Guarda el encabezado y reemplaza los ítems del borrador; con `confirm` ejecuta la RPC transaccional
 * `confirm_purchase` (único punto con efectos sobre stock y costo). Devuelve el id de la compra.
 *
 * Limitación conocida: el reemplazo de ítems (delete + insert) no es atómico; si falla el insert quedan
 * sin ítems hasta volver a guardar. Está registrado en docs/TASKS.md.
 */
export async function savePurchase(args: { businessId: string; purchaseId?: string; header: PurchaseHeader; items: PurchaseItem[]; confirm: boolean }): Promise<string> {
  const supabase = db();
  const { businessId, header, items } = args;
  const payload = {
    business_id: businessId,
    supplier_id: header.supplier_id || null,
    branch_id: header.branch_id,
    purchase_date: header.purchase_date,
    document_number: header.document_number.trim() || null,
    notes: header.notes.trim() || null,
  };

  let purchaseId = args.purchaseId;
  if (purchaseId) {
    const { error } = await supabase.from("purchases").update(payload).eq("id", purchaseId).eq("business_id", businessId);
    if (error) throw error;
  } else {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("not authenticated");
    const { data, error } = await supabase.from("purchases").insert({ ...payload, created_by: auth.user.id }).select("id").single();
    if (error) throw error;
    purchaseId = data.id;
  }

  const removed = await supabase.from("purchase_items").delete().eq("purchase_id", purchaseId).eq("business_id", businessId);
  if (removed.error) throw removed.error;
  if (items.length) {
    const inserted = await supabase.from("purchase_items").insert(
      items.map((item) => ({ purchase_id: purchaseId!, business_id: businessId, variant_id: item.variant_id, quantity: parsePositiveQuantity(item.quantity)!, unit_cost_cents: item.unit_cost_cents })),
    );
    if (inserted.error) throw inserted.error;
  }
  if (args.confirm) {
    const { error } = await supabase.rpc("confirm_purchase", { target_business_id: businessId, target_purchase_id: purchaseId });
    if (error) throw error;
  }
  return purchaseId;
}

export async function cancelPurchaseDraft(businessId: string, purchaseId: string): Promise<void> {
  const { error } = await db().from("purchases").update({ status: "cancelled" }).eq("id", purchaseId).eq("business_id", businessId);
  if (error) throw error;
}
