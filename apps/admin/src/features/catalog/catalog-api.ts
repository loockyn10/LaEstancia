import { fetchAllRows } from "@pet-shop/database";
import { db } from "../../lib/supabase";
import type { Barcode, Branch, Brand, Category, Product, ProductDraft, ReferenceTable, Variant } from "./types";

export type CatalogData = { brands: Brand[]; categories: Category[]; products: Product[]; branches: Branch[] };

/** Descarga el catálogo completo del negocio. Cada tabla se pagina: PostgREST corta en 1000 filas. */
export async function loadCatalog(businessId: string): Promise<CatalogData> {
  const supabase = db();
  const [brands, categories, products, variants, barcodes, branches] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("brands").select("id,name,is_active").eq("business_id", businessId).order("name").order("id").range(from, to)),
    fetchAllRows((from, to) => supabase.from("categories").select("id,name,is_active").eq("business_id", businessId).order("name").order("id").range(from, to)),
    fetchAllRows((from, to) => supabase.from("products").select("id,name,description,is_active,brand_id,category_id").eq("business_id", businessId).order("name").order("id").range(from, to)),
    fetchAllRows((from, to) => supabase.from("product_variants").select("id,product_id,name,sku,is_active").eq("business_id", businessId).order("created_at").order("id").range(from, to)),
    fetchAllRows((from, to) => supabase.from("product_barcodes").select("id,variant_id,code,is_primary").eq("business_id", businessId).order("created_at").order("id").range(from, to)),
    fetchAllRows((from, to) => supabase.from("branches").select("id,name,is_active").eq("business_id", businessId).order("name").order("id").range(from, to)),
  ]);

  const barcodesByVariant = new Map<string, Barcode[]>();
  for (const item of barcodes) {
    const list = barcodesByVariant.get(item.variant_id) ?? [];
    list.push({ id: item.id, code: item.code, is_primary: item.is_primary });
    barcodesByVariant.set(item.variant_id, list);
  }
  const variantsByProduct = new Map<string, Variant[]>();
  for (const item of variants) {
    const list = variantsByProduct.get(item.product_id) ?? [];
    list.push({ id: item.id, name: item.name, sku: item.sku ?? "", is_active: item.is_active, barcodes: barcodesByVariant.get(item.id) ?? [] });
    variantsByProduct.set(item.product_id, list);
  }

  return {
    brands,
    categories,
    branches,
    products: products.map((item) => ({ ...item, description: item.description ?? "", variants: variantsByProduct.get(item.id) ?? [] })),
  };
}

function ensure<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

/**
 * Guarda producto, presentaciones y códigos de barras. Las escrituras son secuenciales (no hay RPC
 * transaccional para el alta de catálogo): un fallo intermedio deja lo ya guardado y lanza el error.
 */
export async function saveProduct(businessId: string, draft: ProductDraft, previous?: Product): Promise<void> {
  const supabase = db();
  const payload = {
    business_id: businessId,
    name: draft.name,
    description: draft.description || null,
    is_active: draft.is_active,
    brand_id: draft.brand_id,
    category_id: draft.category_id,
  };
  const productResult = previous
    ? await supabase.from("products").update(payload).eq("id", previous.id).eq("business_id", businessId).select("id").single()
    : await supabase.from("products").insert(payload).select("id").single();
  ensure(productResult);
  const productId = productResult.data!.id;

  const requested = new Set(draft.variants.flatMap((item) => (item.id ? [item.id] : [])));
  for (const removed of (previous?.variants ?? []).filter((item) => item.id && !requested.has(item.id))) {
    ensure(await supabase.from("product_barcodes").delete().eq("variant_id", removed.id!).eq("business_id", businessId));
    ensure(await supabase.from("product_variants").delete().eq("id", removed.id!).eq("business_id", businessId));
  }

  for (const item of draft.variants) {
    const variantPayload = { business_id: businessId, product_id: productId, name: item.name, sku: item.sku || null, is_active: item.is_active };
    const variantResult = item.id
      ? await supabase.from("product_variants").update(variantPayload).eq("id", item.id).eq("business_id", businessId).select("id").single()
      : await supabase.from("product_variants").insert(variantPayload).select("id").single();
    ensure(variantResult);
    const variantId = variantResult.data!.id;

    const original = previous?.variants.find((value) => value.id === item.id);
    const kept = new Set(item.barcodes.flatMap((value) => (value.id ? [value.id] : [])));
    for (const removedCode of original?.barcodes.filter((value) => value.id && !kept.has(value.id)) ?? []) {
      ensure(await supabase.from("product_barcodes").delete().eq("id", removedCode.id!).eq("business_id", businessId));
    }
    if (item.id) {
      // El índice único de "principal" exige limpiar antes de reasignar.
      ensure(await supabase.from("product_barcodes").update({ is_primary: false }).eq("variant_id", variantId).eq("business_id", businessId));
    }
    for (const code of item.barcodes) {
      const codePayload = { business_id: businessId, variant_id: variantId, code: code.code, is_primary: code.is_primary };
      ensure(
        code.id
          ? await supabase.from("product_barcodes").update(codePayload).eq("id", code.id).eq("business_id", businessId)
          : await supabase.from("product_barcodes").insert(codePayload),
      );
    }
  }
}

export async function saveReference(table: ReferenceTable, businessId: string, name: string, id?: string): Promise<void> {
  const supabase = db();
  ensure(
    id
      ? await supabase.from(table).update({ name }).eq("id", id).eq("business_id", businessId)
      : await supabase.from(table).insert({ name, business_id: businessId }),
  );
}

export async function setReferenceActive(table: ReferenceTable, businessId: string, id: string, active: boolean): Promise<void> {
  ensure(await db().from(table).update({ is_active: active }).eq("id", id).eq("business_id", businessId));
}
