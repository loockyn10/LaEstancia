import { fetchAllRows } from "@pet-shop/database";
import type { Database } from "@pet-shop/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { posDatabase, type PosDatabase } from "../local-db/database";
import type { LocalStock, OperationalSnapshot } from "../local-db/types";

export type SnapshotDownloader = (businessId: string) => Promise<OperationalSnapshot>;
export type StockDownloader = (businessId: string) => Promise<LocalStock[]>;

type Client = SupabaseClient<Database>;

async function downloadStocks(client: Client, businessId: string): Promise<LocalStock[]> {
  const balances = await fetchAllRows((from, to) =>
    client.from("inventory_balances").select("branch_id,variant_id,quantity").eq("business_id", businessId).order("branch_id").order("variant_id").range(from, to),
  );
  return balances.map((item) => ({ businessId, branchId: item.branch_id, variantId: item.variant_id, quantity: Number(item.quantity) }));
}

/**
 * Descarga el catálogo operativo permitido por RLS. Cada tabla se pagina (PostgREST corta en 1000 filas)
 * con un orden estable, para que un catálogo grande no quede truncado en silencio.
 * Nunca incluye costos, márgenes, proveedores ni compras.
 */
export function supabaseSnapshotDownloader(client: Client): SnapshotDownloader {
  return async (businessId) => {
    const [branches, products, variants, barcodes, prices, stocks] = await Promise.all([
      fetchAllRows((from, to) => client.from("branches").select("id,name,is_active").eq("business_id", businessId).order("name").order("id").range(from, to)),
      fetchAllRows((from, to) => client.from("products").select("id,name").eq("business_id", businessId).eq("is_active", true).order("id").range(from, to)),
      fetchAllRows((from, to) => client.from("product_variants").select("id,product_id,name,sku").eq("business_id", businessId).eq("is_active", true).order("id").range(from, to)),
      fetchAllRows((from, to) => client.from("product_barcodes").select("id,variant_id,code").eq("business_id", businessId).order("id").range(from, to)),
      fetchAllRows((from, to) =>
        client.from("variant_effective_prices").select("variant_id,base_price_cents,effective_price_cents,promotional_price_cents,offer_id").eq("business_id", businessId).order("variant_id").range(from, to),
      ),
      downloadStocks(client, businessId),
    ]);

    return {
      businessId,
      branches: branches.map((item) => ({ businessId, id: item.id, name: item.name, isActive: item.is_active })),
      products: products.map((item) => ({ businessId, id: item.id, name: item.name })),
      variants: variants.map((item) => ({ businessId, id: item.id, productId: item.product_id, name: item.name, sku: item.sku ?? "" })),
      barcodes: barcodes.map((item) => ({ businessId, variantId: item.variant_id, code: item.code })),
      prices: prices.flatMap((item) =>
        item.variant_id === null || item.effective_price_cents === null
          ? []
          : [{ businessId, variantId: item.variant_id, basePriceCents: item.base_price_cents, effectivePriceCents: item.effective_price_cents, offerId: item.offer_id }],
      ),
      offers: prices.flatMap((item) =>
        item.variant_id === null || item.offer_id === null || item.promotional_price_cents === null
          ? []
          : [{ businessId, id: item.offer_id, variantId: item.variant_id, promotionalPriceCents: item.promotional_price_cents }],
      ),
      stocks,
    };
  };
}

/** Descarga sólo el último stock conocido (por ejemplo, justo después de cobrar). */
export function supabaseStockDownloader(client: Client): StockDownloader {
  return (businessId) => downloadStocks(client, businessId);
}

export async function synchronizeCatalog(
  businessId: string,
  download: SnapshotDownloader,
  db: PosDatabase = posDatabase,
  now = new Date(),
) {
  const snapshot = await download(businessId);
  if (snapshot.businessId !== businessId) throw new Error("The downloaded POS snapshot belongs to another business.");
  const lastSyncAt = now.toISOString();
  await db.replaceOperationalSnapshot(snapshot, lastSyncAt);
  return { lastSyncAt, snapshot };
}

/**
 * Refresca sólo el stock del business. No toca la marca de "última sincronización": ésta describe la
 * descarga completa del catálogo (productos, precios y ofertas), que este camino no actualiza.
 */
export async function synchronizeStock(businessId: string, download: StockDownloader, db: PosDatabase = posDatabase) {
  const stocks = await download(businessId);
  await db.replaceStocks(businessId, stocks);
  return stocks;
}
