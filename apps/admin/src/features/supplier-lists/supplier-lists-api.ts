import { fetchAllRows } from "@pet-shop/database";
import type { Database, Json } from "@pet-shop/database";
import { db } from "../../lib/supabase";
import type { DetectedSupplierProduct, VisualDetectedProduct } from "./supplier-price-list-import";
import { describeFunctionError } from "./function-errors";

export type PriceListStatus = "draft" | "reviewed" | "applied";
export type PriceList = { id: string; supplier_id: string; file_name: string; file_path: string; file_format: string; mime_type: string; list_date: string | null; status: PriceListStatus; created_at: string };
export type PurchaseOption = { id: string; purchase_unit: string; stock_units_per_purchase: number; purchase_price_cents: number; units_paid: number; units_bonus: number; effective_unit_cost_cents: number; is_selected: boolean };
export type CatalogItem = {
  id: string;
  detected_name: string;
  detected_presentation: string | null;
  supplier_code: string | null;
  barcode: string | null;
  suggested_retail_price_cents: number | null;
  product_variant_id: string | null;
  match_status: string;
  match_reason: "supplier_code" | "barcode" | "sku" | "manual" | null;
  create_catalog_product: boolean;
  apply_to_catalog: boolean;
  warnings: string[];
  supplier_purchase_options: PurchaseOption[];
};
export type ItemPatch = Database["public"]["Tables"]["supplier_catalog_items"]["Update"];
export type VariantPriceInfo = { amount_cents: number; price_source: "manual" | "supplier_pvp"; supplier_id: string | null };

const listColumns = "id,supplier_id,file_name,file_path,file_format,mime_type,list_date,status,created_at";
const BUCKET = "supplier-price-lists";
export const fileExtension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export async function listPriceLists(businessId: string): Promise<PriceList[]> {
  const { data, error } = await db().from("supplier_price_lists").select(listColumns).eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Una lista de proveedor puede superar las 1000 filas de PostgREST: se pagina con orden estable. */
export async function loadListItems(businessId: string, listId: string): Promise<CatalogItem[]> {
  const supabase = db();
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("supplier_catalog_items")
      .select("id,detected_name,detected_presentation,supplier_code,barcode,suggested_retail_price_cents,product_variant_id,match_status,match_reason,create_catalog_product,apply_to_catalog,warnings,supplier_purchase_options(id,purchase_unit,stock_units_per_purchase,purchase_price_cents,units_paid,units_bonus,effective_unit_cost_cents,is_selected)")
      .eq("price_list_id", listId)
      .eq("business_id", businessId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  // El select anidado no se infiere desde los tipos generados; la forma está fijada por la consulta.
  return rows as unknown as CatalogItem[];
}

export async function loadVariantPrices(businessId: string): Promise<Record<string, VariantPriceInfo>> {
  const supabase = db();
  const rows = await fetchAllRows((from, to) => supabase.from("variant_prices").select("variant_id,amount_cents,price_source,supplier_id").eq("business_id", businessId).order("variant_id").range(from, to));
  return Object.fromEntries(rows.map((row) => [row.variant_id, { amount_cents: row.amount_cents, price_source: row.price_source === "supplier_pvp" ? "supplier_pvp" : "manual", supplier_id: row.supplier_id } satisfies VariantPriceInfo]));
}

export async function updateItems(businessId: string, updates: Array<{ id: string; patch: ItemPatch }>): Promise<void> {
  const supabase = db();
  const results = await Promise.all(updates.map(({ id, patch }) => supabase.from("supplier_catalog_items").update(patch).eq("id", id).eq("business_id", businessId)));
  const failure = results.find((result) => result.error);
  if (failure?.error) throw failure.error;
}

/**
 * Crea el borrador de la lista y sube el archivo original al bucket privado (prefijo = business_id).
 * Si la subida falla se elimina el borrador para no dejar listas sin archivo.
 */
export async function createDraftAndUpload(args: { businessId: string; supplierId: string; file: File }): Promise<{ id: string; path: string; format: string; header: PriceList }> {
  const supabase = db();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión ya no está disponible.");
  const id = crypto.randomUUID();
  const format = fileExtension(args.file.name);
  const path = `${args.businessId}/${id}/original.${format}`;
  const header = await supabase
    .from("supplier_price_lists")
    .insert({ id, business_id: args.businessId, supplier_id: args.supplierId, file_name: args.file.name, file_path: path, file_format: format, mime_type: args.file.type || "application/octet-stream", created_by: auth.user.id })
    .select(listColumns)
    .single();
  if (header.error || !header.data) throw new Error("No pudimos crear el borrador de la lista.");
  const upload = await supabase.storage.from(BUCKET).upload(path, args.file, { upsert: false, contentType: args.file.type || undefined });
  if (upload.error) {
    await supabase.from("supplier_price_lists").delete().eq("id", id).eq("business_id", args.businessId);
    throw new Error("No pudimos conservar el archivo original.");
  }
  return { id, path, format, header: header.data };
}

export async function downloadOriginal(path: string): Promise<Blob> {
  const { data, error } = await db().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("No pudimos recuperar el PDF original para reintentar.");
  return data;
}

/** Reemplaza sólo el staging sin confirmar de esa lista; nunca toca el catálogo real. Devuelve la cantidad guardada. */
export async function saveDetectedItems(businessId: string, listId: string, items: DetectedSupplierProduct[]): Promise<number> {
  const { data, error } = await db().rpc("save_supplier_price_list_items", { target_business_id: businessId, target_price_list_id: listId, detected_items: items as unknown as Json });
  if (error) throw error;
  return data;
}

/** Interpretación visual: la Edge Function valida owner/admin y sólo devuelve candidatos; no escribe en la base. */
export async function interpretVisually(args: { businessId: string; filePath: string; mimeType: string; fileFormat: string; page: number | null }): Promise<VisualDetectedProduct[]> {
  const { data, error } = await db().functions.invoke("interpret-supplier-price-list", {
    body: { business_id: args.businessId, file_path: args.filePath, mime_type: args.mimeType, file_format: args.fileFormat, ...(args.page === null ? {} : { page_numbers: [args.page] }) },
  });
  if (error) throw new Error(await describeFunctionError(error));
  const products = (data as { products?: VisualDetectedProduct[] } | null)?.products;
  if (!Array.isArray(products)) throw new Error("La interpretación visual devolvió una respuesta inválida.");
  return products;
}

export async function applyPriceList(businessId: string, listId: string): Promise<number> {
  const { data, error } = await db().rpc("apply_supplier_price_list", { target_business_id: businessId, target_price_list_id: listId });
  if (error) throw error;
  return data?.length ?? 0;
}
